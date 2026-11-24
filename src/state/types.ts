export type Lang = 'en' | 'fr';
export type TeamId = 0 | 1;

export interface GridWord { word: string; fr: string }
export interface ShipWord { word: string; hintEn: string; hintFr: string }
export type ChallengeType = 'Definition' | 'Translation' | 'Gap fill';
export interface Challenge { type: ChallengeType; prompt: string; answer: string; also: string[]; hintFr: string }
export interface Pack {
  name: string;
  rows: GridWord[];   // 10, rows 1-10
  cols: GridWord[];   // 10, columns A-J
  ships: ShipWord[];
  challenges: Challenge[];
}

export interface Options {
  focus: string;
  judgeSeconds: number;
  wordsMode: 'random' | 'choose';
  placeMode: 'random' | 'place';
  allowOwn: boolean;
  ownHints: boolean;
  touching: boolean;
  budget: string;     // total letters across the 5 ships, 'min-max', one of BUDGETS
}

export interface Ship {
  word: string;       // upper case A-Z
  hintEn: string;
  hintFr: string;
  r: number;          // first cell row 0-9
  c: number;          // first cell column 0-9
  horiz: boolean;
  own: boolean;       // typed by the team, not from the pack
}

export type Shot = 'miss' | 'hit';

export interface Team {
  name: string;
  connected: boolean;
  fleet: Ship[] | null;
  ready: boolean;
  score: number;
  /** shots received on THIS team's board, key "r,c" */
  shots: Record<string, Shot>;
  /** sunk flags for THIS team's ships, by index; value says how */
  sunk: Record<number, 'hits' | 'guess'>;
}

export interface Card {
  r: number; c: number;
  challenge: number;        // index into pack.challenges, -1 if none
  sentence?: string;
  bonus?: string;
  deadline?: number;        // ms epoch, when judging ends
}

export type LogStatus = 'waiting' | 'accepted' | 'rejected';
export interface LogEntry {
  team: TeamId;
  r: number; c: number;
  sentence: string;
  status: LogStatus;
  result?: Shot;
  letter?: string;
  bonusOk?: boolean;
  sunkWord?: string;
}

export type Phase = 'lobby' | 'setup' | 'pick' | 'card' | 'judge' | 'result' | 'end';

export interface LastResult {
  kind: 'rejected' | 'miss' | 'hit';
  letter?: string;
  sunkWord?: string;
  bonusOk?: boolean;
  guessed?: 'right' | 'wrong';
}

export interface GameState {
  code: string;
  pack: Pack;
  options: Options;
  phase: Phase;
  teams: [Team, Team];
  turn: TeamId;
  card: Card | null;
  last: LastResult | null;
  log: LogEntry[];
  used: number[];           // challenge indexes already drawn
  winner: TeamId | -1 | null; // -1 = draw
  seq: number;              // increases on every change
}

/** 5 ships; each word is 3 to 10 letters; the 5 words together must fit the letter budget the host picks. */
export const SHIPS = 5;
export const MIN_LEN = 3;
export const MAX_LEN = 10;
export const BUDGETS = ['18-24', '21-30', '25-35'] as const;
export const DEFAULT_BUDGET = '21-30';
export function budgetRange(b: string): [number, number] {
  const m = /^(\d+)-(\d+)$/.exec(b || '');
  return m ? [+m[1], +m[2]] : [21, 30];
}
/** Length patterns used for random words, so both teams get the same total. */
export const RANDOM_PATTERNS: readonly (readonly number[])[] = [[6, 5, 4, 3, 3], [5, 4, 3, 3, 3], [7, 6, 5, 4, 3], [8, 7, 6, 5, 4]];
export const LETTERS = 'ABCDEFGHIJ';
export const key = (r: number, c: number) => `${r},${c}`;
export const cellName = (r: number, c: number) => `${LETTERS[c]}${r + 1}`;
export const other = (t: TeamId): TeamId => (t === 0 ? 1 : 0);
