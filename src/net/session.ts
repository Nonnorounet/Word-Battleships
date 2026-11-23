import { apply, newGame, viewFor, type Action, type View } from '../state/rules';
import type { GameState, Pack, TeamId } from '../state/types';
import type { Msg, Status, Transport } from './transport';

const SAVE = 'wb.game.';
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* full or blocked */ } },
};

export interface Session {
  readonly role: 'host' | 'guest';
  readonly code: string;
  view: View | null;
  status: Status;
  error: string | null;
  act(a: Action): void;
  onChange(cb: () => void): void;
  close(): void;
}

/** The host keeps the only full game state and sends each device what it may see. */
export class HostSession implements Session {
  role = 'host' as const;
  view: View | null = null;
  status: Status = 'connecting';
  error: string | null = null;
  private state: GameState;
  private cbs = new Set<() => void>();
  private timer: ReturnType<typeof setInterval>;

  constructor(public code: string, pack: Pack, private net: Transport, name = 'Falcon') {
    const saved = store.get(SAVE + code);
    this.state = saved ? JSON.parse(saved) : newGame(code, pack);
    this.state.teams[0].connected = true;
    if (!saved) this.state.teams[0].name = name;
    net.onStatus((s) => { this.status = s; if (s === 'lost') this.state.teams[1].connected = false; this.emit(); });
    net.onMessage((m) => this.fromGuest(m));
    this.publish();
    // the host enforces the judging timer
    this.timer = setInterval(() => {
      const c = this.state.card;
      if (this.state.phase === 'judge' && c?.deadline && Date.now() >= c.deadline) this.run(0, { a: 'timeout' });
    }, 500);
  }

  private fromGuest(m: Msg) {
    if (m.t === 'hello') { this.run(1, { a: 'join', name: m.name }); return; }
    if (m.t === 'sync') { this.state.teams[1].connected = true; this.publish(); return; }
    if (m.t === 'act') this.run(1, m.act);
  }

  private run(by: TeamId, a: Action) {
    const r = apply(this.state, by, a);
    if (!r.ok) {
      if (by === 1) this.net.send({ t: 'error', error: r.error }); else { this.error = r.error; this.emit(); }
      return;
    }
    this.state = r.state;
    this.error = null;
    this.publish();
  }

  private publish() {
    store.set(SAVE + this.code, JSON.stringify(this.state));
    this.view = viewFor(this.state, 0);
    this.net.send({ t: 'view', view: viewFor(this.state, 1) });
    this.emit();
  }

  act(a: Action) { this.run(0, a); }
  onChange(cb: () => void) { this.cbs.add(cb); }
  private emit() { this.cbs.forEach((f) => f()); }
  close() { clearInterval(this.timer); this.net.close(); }
}

export class GuestSession implements Session {
  role = 'guest' as const;
  view: View | null = null;
  status: Status = 'connecting';
  error: string | null = null;
  private cbs = new Set<() => void>();
  private helloTimer: ReturnType<typeof setInterval> | null = null;

  constructor(public code: string, private net: Transport, private name?: string) {
    net.onStatus((s) => { this.status = s; this.emit(); });
    net.onMessage((m) => {
      if (m.t === 'view') { this.view = m.view; this.status = 'connected'; this.error = null; if (this.helloTimer) { clearInterval(this.helloTimer); this.helloTimer = null; } }
      else if (m.t === 'error') this.error = m.error;
      else if (m.t === 'full') { this.error = 'full'; this.status = 'failed'; }
      else if (m.t === 'sync') { this.net.send({ t: 'hello', name: this.name }); return; }
      this.emit();
    });
    // say hello until the host answers (covers a host that opens after the guest)
    const hello = () => this.net.send({ t: 'hello', name: this.name });
    hello();
    this.helloTimer = setInterval(hello, 1500);
  }

  act(a: Action) { this.net.send({ t: 'act', act: a }); }
  onChange(cb: () => void) { this.cbs.add(cb); }
  private emit() { this.cbs.forEach((f) => f()); }
  close() { if (this.helloTimer) clearInterval(this.helloTimer); this.net.close(); }
}
