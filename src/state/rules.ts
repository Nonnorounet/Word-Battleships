import {
  type Card, type GameState, type LastResult, type Options, type Pack, type Ship, type Team, type TeamId,
  BUDGETS, DEFAULT_BUDGET, MAX_LEN, MIN_LEN, RANDOM_PATTERNS, SHIPS, budgetRange, key, other,
} from './types';

export const SCORE = { hit: 1, bonus: 1, sinkByHits: 2, sinkByGuess: 3 } as const;
export const HINT_AFTER_HITS = 2;

export const defaultOptions = (): Options => ({
  focus: 'Past simple',
  judgeSeconds: 90,
  wordsMode: 'random',
  placeMode: 'random',
  allowOwn: true,
  ownHints: true,
  touching: true,
  budget: DEFAULT_BUDGET,
});

const newTeam = (name: string): Team => ({ name, connected: false, fleet: null, ready: false, score: 0, shots: {}, sunk: {} });

export function newGame(code: string, pack: Pack, options = defaultOptions()): GameState {
  return {
    code, pack, options, phase: 'lobby',
    teams: [newTeam('Falcon'), newTeam('Kestrel')],
    turn: 0, card: null, last: null, log: [], used: [], winner: null, seq: 0,
  };
}

// ---------- helpers ----------
export function shipCells(s: Pick<Ship, 'r' | 'c' | 'horiz' | 'word'>): [number, number][] {
  return [...s.word].map((_, i) => (s.horiz ? [s.r, s.c + i] : [s.r + i, s.c]) as [number, number]);
}

export function normaliseWord(w: string) { return w.toUpperCase().replace(/[^A-Z]/g, ''); }

export function normaliseAnswer(a: string) {
  return a.toLowerCase().trim().replace(/[.!]+$/, '').replace(/^(a|an|the)\s+/, '').replace(/\s+/g, ' ').trim();
}

export function checkAnswer(given: string | undefined, answer: string, also: string[] = []) {
  if (!given || !given.trim()) return false;
  const g = normaliseAnswer(given);
  return [answer, ...also].some((a) => normaliseAnswer(a) === g);
}

export const fleetLetters = (fleet: Pick<Ship, 'word'>[]) => fleet.reduce((n, s) => n + s.word.length, 0);

/** Checks the words only (count, lengths, total). Returns an error code or null. */
export function wordsError(fleet: Pick<Ship, 'word'>[], budget?: string): string | null {
  if (fleet.length !== SHIPS) return 'count';
  if (fleet.some((s) => s.word.length < MIN_LEN || s.word.length > MAX_LEN)) return 'lengths';
  if (budget) {
    const [lo, hi] = budgetRange(budget), n = fleetLetters(fleet);
    if (n < lo || n > hi) return 'budget';
  }
  return null;
}

/** Validates a full fleet. Returns an error code or null. */
export function fleetError(fleet: Ship[], touching: boolean, budget?: string): string | null {
  const we = wordsError(fleet, budget);
  if (we) return we;
  const occ = new Map<string, number>();
  for (let i = 0; i < fleet.length; i++) {
    const s = fleet[i];
    if (!/^[A-Z]+$/.test(s.word)) return 'letters';
    for (const [r, c] of shipCells(s)) {
      if (r < 0 || r > 9 || c < 0 || c > 9) return 'outside';
      if (occ.has(key(r, c))) return 'overlap';
      occ.set(key(r, c), i);
    }
  }
  if (!touching) {
    for (const [k, i] of occ) {
      const [r, c] = k.split(',').map(Number);
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = occ.get(key(r + dr, c + dc));
        if (j !== undefined && j !== i) return 'touching';
      }
    }
  }
  return null;
}

export function shuffle<T>(a: T[], rnd = Math.random): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

const toShip = (w: { word: string; hintEn: string; hintFr: string }): Ship => ({ word: normaliseWord(w.word), hintEn: w.hintEn, hintFr: w.hintFr, r: 0, c: 0, horiz: true, own: false });

/** Picks 5 pack words within the budget. Uses a fixed length pattern when the pack allows it, so both teams get the same total. */
export function randomWords(pack: Pack, rnd = Math.random, budget = DEFAULT_BUDGET): Ship[] {
  const [lo, hi] = budgetRange(budget);
  const pool = shuffle(pack.ships.filter((s) => { const n = normaliseWord(s.word).length; return n >= MIN_LEN && n <= MAX_LEN; }), rnd);
  for (const pattern of RANDOM_PATTERNS) {
    const total = pattern.reduce((a, b) => a + b, 0);
    if (total < lo || total > hi) continue;
    const used = new Set<string>();
    const out: Ship[] = [];
    for (const len of pattern) {
      const w = pool.find((s) => normaliseWord(s.word).length === len && !used.has(s.word));
      if (!w) break;
      used.add(w.word); out.push(toShip(w));
    }
    if (out.length === SHIPS) return out;
  }
  for (let attempt = 0; attempt < 2000; attempt++) {
    const pick = shuffle(pool, rnd).slice(0, SHIPS).map(toShip);
    if (pick.length === SHIPS && !wordsError(pick, budget) && new Set(pick.map((p) => p.word)).size === SHIPS) return pick;
  }
  throw new Error('pack has too few ship words for this letter total');
}

/** Places the given words at random, keeping them valid. */
export function randomPlace(words: Ship[], touching: boolean, rnd = Math.random): Ship[] {
  for (let attempt = 0; attempt < 500; attempt++) {
    const placed: Ship[] = [];
    let ok = true;
    for (const w of words) {
      let done = false;
      for (let t = 0; t < 200 && !done; t++) {
        const horiz = rnd() < 0.5;
        const len = w.word.length;
        const r = Math.floor(rnd() * (horiz ? 10 : 11 - len));
        const c = Math.floor(rnd() * (horiz ? 11 - len : 10));
        const cand = { ...w, r, c, horiz };
        const test = [...placed, cand];
        if (partialFleetOk(test, touching)) { placed.push(cand); done = true; }
      }
      if (!done) { ok = false; break; }
    }
    if (ok) return placed;
  }
  throw new Error('could not place fleet');
}

export function partialFleetOk(fleet: Ship[], touching: boolean) {
  const occ = new Map<string, number>();
  for (let i = 0; i < fleet.length; i++) for (const [r, c] of shipCells(fleet[i])) {
    if (r < 0 || r > 9 || c < 0 || c > 9 || occ.has(key(r, c))) return false;
    occ.set(key(r, c), i);
  }
  if (!touching) for (const [k, i] of occ) {
    const [r, c] = k.split(',').map(Number);
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = occ.get(key(r + dr, c + dc));
      if (j !== undefined && j !== i) return false;
    }
  }
  return true;
}

export function shipAt(fleet: Ship[], r: number, c: number): { ship: number; index: number } | null {
  for (let i = 0; i < fleet.length; i++) {
    const cells = shipCells(fleet[i]);
    const idx = cells.findIndex(([a, b]) => a === r && b === c);
    if (idx >= 0) return { ship: i, index: idx };
  }
  return null;
}

export function hitsOnShip(team: Team, i: number) {
  if (!team.fleet) return 0;
  return shipCells(team.fleet[i]).filter(([r, c]) => team.shots[key(r, c)] === 'hit').length;
}

export function allSunk(team: Team) {
  return !!team.fleet && team.fleet.every((_, i) => team.sunk[i] !== undefined);
}

// ---------- actions ----------
export type Action =
  | { a: 'join'; name?: string }
  | { a: 'leave' }
  | { a: 'rename'; name: string }
  | { a: 'options'; options: Partial<Options> }
  | { a: 'pack'; pack: Pack }
  | { a: 'start' }
  | { a: 'fleet'; fleet: Ship[] }      // setup: submit words (+ positions when placing) and be ready
  | { a: 'unready' }
  | { a: 'draw'; r: number; c: number }
  | { a: 'cancel' }
  | { a: 'submit'; sentence: string; bonus: string }
  | { a: 'judge'; accept: boolean }
  | { a: 'timeout' }
  | { a: 'guess'; ship: number; word: string }
  | { a: 'next' }
  | { a: 'end' }
  | { a: 'restart' };

export type Result = { ok: true; state: GameState } | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });

function clone(s: GameState): GameState { return structuredClone(s); }

function bump(s: GameState): Result { s.seq++; return { ok: true, state: s }; }

function pickChallenge(s: GameState, rnd: () => number): number {
  const n = s.pack.challenges.length;
  if (!n) return -1;
  let free = [...Array(n).keys()].filter((i) => !s.used.includes(i));
  if (!free.length) { s.used = []; free = [...Array(n).keys()]; }
  const i = free[Math.floor(rnd() * free.length)];
  s.used.push(i);
  return i;
}

function beginPlay(s: GameState, rnd: () => number) {
  s.phase = 'pick';
  s.turn = rnd() < 0.5 ? 0 : 1;
  s.card = null; s.last = null;
}

/**
 * Applies an action made by team `by` (the host is team 0) and returns the new state.
 * The host runs this for both teams; the guest only sends actions.
 */
export function apply(prev: GameState, by: TeamId, act: Action, now = Date.now(), rnd = Math.random): Result {
  const s = clone(prev);
  const me = s.teams[by];
  const foe = s.teams[other(by)];
  switch (act.a) {
    case 'join':
      me.connected = true;
      if (act.name && act.name.trim()) me.name = act.name.trim().slice(0, 24);
      return bump(s);
    case 'leave':
      me.connected = false; return bump(s);
    case 'rename':
      if (!act.name.trim()) return fail('empty');
      me.name = act.name.trim().slice(0, 24); return bump(s);
    case 'options':
      if (by !== 0 || s.phase !== 'lobby') return fail('not-allowed');
      s.options = { ...s.options, ...act.options };
      s.options.judgeSeconds = Math.max(30, Math.min(180, Math.round(s.options.judgeSeconds)));
      if (!(BUDGETS as readonly string[]).includes(s.options.budget)) s.options.budget = DEFAULT_BUDGET;
      return bump(s);
    case 'pack':
      if (by !== 0 || s.phase !== 'lobby') return fail('not-allowed');
      s.pack = act.pack; s.used = []; return bump(s);
    case 'start': {
      if (by !== 0 || s.phase !== 'lobby') return fail('not-allowed');
      const o = s.options;
      for (const t of s.teams) {
        t.fleet = null; t.ready = false; t.score = 0; t.shots = {}; t.sunk = {};
        if (o.wordsMode === 'random') t.fleet = randomWords(s.pack, rnd, o.budget);
        if (o.wordsMode === 'random' && o.placeMode === 'random') { t.fleet = randomPlace(t.fleet!, o.touching, rnd); t.ready = true; }
      }
      s.log = []; s.used = []; s.winner = null;
      if (s.teams.every((t) => t.ready)) beginPlay(s, rnd); else s.phase = 'setup';
      return bump(s);
    }
    case 'fleet': {
      if (s.phase !== 'setup') return fail('not-allowed');
      const o = s.options;
      let fleet = act.fleet.map((x) => ({ ...x, word: normaliseWord(x.word), hintEn: (x.hintEn || '').slice(0, 120), hintFr: (x.hintFr || '').slice(0, 120) }));
      if (o.wordsMode === 'random') {
        // words are fixed by the host: keep them, take only positions
        const fixed = me.fleet!;
        if (fleet.length !== fixed.length) return fail('count');
        fleet = fixed.map((w, i) => ({ ...w, r: fleet[i].r, c: fleet[i].c, horiz: fleet[i].horiz }));
      } else {
        const packWords = new Set(s.pack.ships.map((w) => normaliseWord(w.word)));
        for (const w of fleet) {
          const p = s.pack.ships.find((x) => normaliseWord(x.word) === w.word);
          w.own = !p;
          if (p) { w.hintEn = p.hintEn; w.hintFr = p.hintFr; }
          if (w.own && !o.allowOwn) return fail('not-in-pack');
          if (w.own && o.ownHints && !w.hintEn.trim()) return fail('hint');
          if (!packWords.has(w.word) && !w.hintFr) w.hintFr = w.hintEn;
        }
        if (new Set(fleet.map((w) => w.word)).size !== fleet.length) return fail('duplicate');
      }
      const we = wordsError(fleet, o.wordsMode === 'choose' ? o.budget : undefined);
      if (we) return fail(we);
      if (o.placeMode === 'random') fleet = randomPlace(fleet, o.touching, rnd);
      const err = fleetError(fleet, o.touching, o.wordsMode === 'choose' ? o.budget : undefined);
      if (err) return fail(err);
      me.fleet = fleet; me.ready = true;
      if (s.teams.every((t) => t.ready)) beginPlay(s, rnd);
      return bump(s);
    }
    case 'unready':
      if (s.phase !== 'setup') return fail('not-allowed');
      me.ready = false; return bump(s);
    case 'draw': {
      if (s.phase !== 'pick' || s.turn !== by) return fail('not-your-turn');
      if (act.r < 0 || act.r > 9 || act.c < 0 || act.c > 9) return fail('outside');
      if (foe.shots[key(act.r, act.c)]) return fail('already-shot');
      s.card = { r: act.r, c: act.c, challenge: pickChallenge(s, rnd) };
      s.phase = 'card';
      return bump(s);
    }
    case 'cancel':
      if (s.phase !== 'card' || s.turn !== by) return fail('not-allowed');
      s.card = null; s.phase = 'pick'; return bump(s);
    case 'submit': {
      if (s.phase !== 'card' || s.turn !== by || !s.card) return fail('not-allowed');
      const sentence = act.sentence.trim().slice(0, 300);
      if (!sentence) return fail('empty');
      s.card.sentence = sentence;
      s.card.bonus = act.bonus.trim().slice(0, 80);
      s.card.deadline = now + s.options.judgeSeconds * 1000;
      s.phase = 'judge';
      s.log.unshift({ team: by, r: s.card.r, c: s.card.c, sentence, status: 'waiting' });
      return bump(s);
    }
    case 'judge':
    case 'timeout': {
      if (s.phase !== 'judge' || !s.card) return fail('not-allowed');
      if (act.a === 'judge' && by === s.turn) return fail('not-your-call');
      if (act.a === 'timeout' && (by !== 0 || now < (s.card.deadline ?? 0))) return fail('too-early');
      const accept = act.a === 'timeout' ? true : act.accept;
      resolveShot(s, accept);
      return bump(s);
    }
    case 'guess': {
      if (s.phase !== 'result' || s.turn !== by || s.last?.kind !== 'hit' || s.last.guessed) return fail('not-allowed');
      const target = foe.fleet?.[act.ship];
      if (!target || foe.sunk[act.ship] !== undefined) return fail('no-ship');
      if (hitsOnShip(foe, act.ship) < 1) return fail('no-letters');
      const right = normaliseWord(act.word) === target.word;
      s.last.guessed = right ? 'right' : 'wrong';
      if (right) {
        foe.sunk[act.ship] = 'guess';
        for (const [r, c] of shipCells(target)) foe.shots[key(r, c)] = 'hit';
        me.score += SCORE.sinkByGuess;
        s.last.sunkWord = target.word;
        if (allSunk(foe)) { s.phase = 'end'; s.winner = by; }
      } else {
        nextTurn(s);
      }
      return bump(s);
    }
    case 'next':
      if (s.phase !== 'result' || (by !== s.turn && by !== 0)) return fail('not-allowed');
      nextTurn(s); return bump(s);
    case 'end':
      if (by !== 0) return fail('not-allowed');
      s.phase = 'end';
      s.winner = s.teams[0].score === s.teams[1].score ? -1 : s.teams[0].score > s.teams[1].score ? 0 : 1;
      return bump(s);
    case 'restart':
      if (by !== 0) return fail('not-allowed');
      for (const t of s.teams) { t.fleet = null; t.ready = false; t.score = 0; t.shots = {}; t.sunk = {}; }
      s.phase = 'lobby'; s.card = null; s.last = null; s.log = []; s.used = []; s.winner = null;
      return bump(s);
  }
}

function nextTurn(s: GameState) {
  s.turn = other(s.turn); s.phase = 'pick'; s.card = null; s.last = null;
}

function resolveShot(s: GameState, accept: boolean) {
  const card = s.card as Card;
  const attacker = s.teams[s.turn];
  const defender = s.teams[other(s.turn)];
  const entry = s.log.find((e) => e.status === 'waiting');
  const ch = s.pack.challenges[card.challenge];
  const last: LastResult = { kind: 'rejected' };
  if (!accept) {
    if (entry) entry.status = 'rejected';
  } else {
    if (entry) entry.status = 'accepted';
    const bonusOk = ch ? checkAnswer(card.bonus, ch.answer, ch.also) : false;
    last.bonusOk = bonusOk;
    if (entry) entry.bonusOk = bonusOk;
    if (bonusOk) attacker.score += SCORE.bonus;
    const hit = shipAt(defender.fleet!, card.r, card.c);
    if (!hit) {
      defender.shots[key(card.r, card.c)] = 'miss';
      last.kind = 'miss';
      if (entry) entry.result = 'miss';
    } else {
      defender.shots[key(card.r, card.c)] = 'hit';
      const ship = defender.fleet![hit.ship];
      last.kind = 'hit'; last.letter = ship.word[hit.index];
      attacker.score += SCORE.hit;
      if (entry) { entry.result = 'hit'; entry.letter = last.letter; }
      if (hitsOnShip(defender, hit.ship) === ship.word.length) {
        defender.sunk[hit.ship] = 'hits';
        attacker.score += SCORE.sinkByHits;
        last.sunkWord = ship.word;
        if (entry) entry.sunkWord = ship.word;
      }
    }
  }
  s.last = last;
  s.phase = 'result';
  if (allSunk(defender)) { s.phase = 'end'; s.winner = s.turn; }
}

// ---------- views (what each device may see) ----------
export interface EnemyShipView {
  length: number;
  letters: (string | null)[];
  cells: ([number, number] | null)[]; // positions of revealed letters only
  sunk: boolean;
  hintEn: string | null;
  hintFr: string | null;
}

export interface View {
  me: TeamId;
  code: string;
  phase: GameState['phase'];
  options: Options;
  pack: Pack;
  teams: { name: string; connected: boolean; ready: boolean; score: number }[];
  turn: TeamId;
  card: Card | null;
  last: LastResult | null;
  log: GameState['log'];
  winner: GameState['winner'];
  myFleet: Ship[] | null;
  myShots: Record<string, 'miss' | 'hit'>;    // shots received on my board
  mySunk: Record<number, 'hits' | 'guess'>;
  enemyShots: Record<string, 'miss' | 'hit'>; // my shots on their board
  enemyLetters: Record<string, string>;       // revealed letters by cell
  enemyShips: EnemyShipView[];
  enemyFleet: Ship[] | null;                  // only at the end
  seq: number;
}

export function viewFor(s: GameState, me: TeamId): View {
  const mine = s.teams[me];
  const foe = s.teams[other(me)];
  const enemyLetters: Record<string, string> = {};
  const enemyShips: EnemyShipView[] = (foe.fleet ?? []).map((sh, i) => {
    const cells = shipCells(sh);
    const letters = cells.map(([r, c], j) => (foe.shots[key(r, c)] === 'hit' ? sh.word[j] : null));
    cells.forEach(([r, c], j) => { if (letters[j]) enemyLetters[key(r, c)] = letters[j]!; });
    const hits = letters.filter(Boolean).length;
    const showHint = hits >= HINT_AFTER_HITS || foe.sunk[i] !== undefined;
    return {
      length: sh.word.length, letters,
      cells: cells.map((rc, j) => (letters[j] ? rc : null)),
      sunk: foe.sunk[i] !== undefined,
      hintEn: showHint ? sh.hintEn : null, hintFr: showHint ? sh.hintFr : null,
    };
  });
  return {
    me, code: s.code, phase: s.phase, options: s.options, pack: s.pack,
    teams: s.teams.map((t) => ({ name: t.name, connected: t.connected, ready: t.ready, score: t.score })),
    turn: s.turn, card: s.card, last: s.last, log: s.log, winner: s.winner,
    myFleet: mine.fleet, myShots: mine.shots, mySunk: mine.sunk,
    enemyShots: foe.shots, enemyLetters, enemyShips,
    enemyFleet: s.phase === 'end' ? foe.fleet : null,
    seq: s.seq,
  };
}
