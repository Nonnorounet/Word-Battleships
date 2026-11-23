import type { Action, View } from '../state/rules';

export type Msg =
  | { t: 'hello'; name?: string }
  | { t: 'act'; act: Action }
  | { t: 'sync' }
  | { t: 'view'; view: View }
  | { t: 'error'; error: string }
  | { t: 'full' };

export type Status = 'connecting' | 'connected' | 'lost' | 'failed';

export interface Transport {
  /** Host: start listening on this game code. */
  host(code: string): Promise<void>;
  /** Guest: connect to a game code. */
  join(code: string): Promise<void>;
  send(msg: Msg): void;
  onMessage(cb: (msg: Msg) => void): void;
  onStatus(cb: (s: Status) => void): void;
  close(): void;
}

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const WORDS = ['ORBIT', 'COMET', 'RADAR', 'PILOT', 'LUNAR', 'DRONE', 'SOLAR', 'VAPOR', 'CARGO', 'NOVA'];
export function newCode(rnd = Math.random) {
  return `${WORDS[Math.floor(rnd() * WORDS.length)]}-${Math.floor(10 + rnd() * 90)}${ALPHA[Math.floor(rnd() * ALPHA.length)]}`;
}
export const cleanCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16);
