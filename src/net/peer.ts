import Peer, { type DataConnection } from 'peerjs';
import type { Msg, Status, Transport } from './transport';

const PREFIX = 'wordbattleships-v1-';
const TIMEOUT = 12000;

/** WebRTC between the two devices, using the free public PeerJS broker for the handshake. */
export class PeerTransport implements Transport {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private onMsg: (m: Msg) => void = () => {};
  private onSt: (s: Status) => void = () => {};
  private code = '';
  private role: 'host' | 'guest' = 'host';
  private closed = false;

  onMessage(cb: (m: Msg) => void) { this.onMsg = cb; }
  onStatus(cb: (s: Status) => void) { this.onSt = cb; }

  host(code: string): Promise<void> {
    this.code = code; this.role = 'host';
    return new Promise((resolve, reject) => {
      this.onSt('connecting');
      const peer = new Peer(PREFIX + code);
      this.peer = peer;
      const timer = setTimeout(() => { this.onSt('failed'); reject(new Error('timeout')); }, TIMEOUT);
      peer.on('open', () => { clearTimeout(timer); resolve(); });
      peer.on('connection', (c) => {
        if (this.conn && this.conn.open) { c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 500); }); return; }
        this.attach(c);
      });
      peer.on('disconnected', () => { if (!this.closed) { this.onSt('lost'); peer.reconnect(); } });
      peer.on('error', (e) => {
        if ((e as { type?: string }).type === 'unavailable-id') { clearTimeout(timer); reject(new Error('code-taken')); return; }
        if (!this.conn?.open) this.onSt('lost');
      });
    });
  }

  join(code: string): Promise<void> {
    this.code = code; this.role = 'guest';
    return new Promise((resolve, reject) => {
      this.onSt('connecting');
      const peer = new Peer();
      this.peer = peer;
      const timer = setTimeout(() => { this.onSt('failed'); reject(new Error('timeout')); }, TIMEOUT);
      peer.on('open', () => {
        const c = peer.connect(PREFIX + code, { reliable: true });
        c.on('open', () => { clearTimeout(timer); resolve(); });
        this.attach(c);
      });
      peer.on('error', (e) => {
        if ((e as { type?: string }).type === 'peer-unavailable') { clearTimeout(timer); this.onSt('failed'); reject(new Error('no-game')); }
      });
    });
  }

  private attach(c: DataConnection) {
    this.conn = c;
    c.on('open', () => this.onSt('connected'));
    c.on('data', (d) => this.onMsg(d as Msg));
    c.on('close', () => {
      if (this.closed) return;
      this.onSt('lost');
      if (this.role === 'guest') setTimeout(() => this.rejoin(), 2000);
    });
  }

  private rejoin() {
    if (this.closed || !this.peer) return;
    if (this.peer.disconnected) this.peer.reconnect();
    const c = this.peer.connect(PREFIX + this.code, { reliable: true });
    c.on('open', () => this.onMsg({ t: 'sync' } as Msg)); // asks the session to resync
    this.attach(c);
  }

  send(msg: Msg) { if (this.conn?.open) this.conn.send(msg); }
  close() { this.closed = true; this.conn?.close(); this.peer?.destroy(); }
}
