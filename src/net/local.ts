import type { Msg, Status, Transport } from './transport';

/** Two windows of the same browser on one device (practice and testing). */
export class LocalTransport implements Transport {
  private ch: BroadcastChannel | null = null;
  private onMsg: (m: Msg) => void = () => {};
  private onSt: (s: Status) => void = () => {};
  private me = '';
  onMessage(cb: (m: Msg) => void) { this.onMsg = cb; }
  onStatus(cb: (s: Status) => void) { this.onSt = cb; }

  private open(code: string, me: 'host' | 'guest') {
    this.me = me;
    this.ch = new BroadcastChannel('wordbattleships-' + code);
    this.ch.onmessage = (e) => {
      const { from, msg } = e.data as { from: string; msg: Msg };
      if (from === this.me) return;
      this.onSt('connected');
      this.onMsg(msg);
    };
  }
  async host(code: string) { this.open(code, 'host'); this.onSt('connecting'); }
  async join(code: string) { this.open(code, 'guest'); this.onSt('connecting'); }
  send(msg: Msg) { this.ch?.postMessage({ from: this.me, msg: JSON.parse(JSON.stringify(msg)) }); }
  close() { this.ch?.close(); }
}
