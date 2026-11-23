import { describe, expect, it } from 'vitest';
import data from '../data/aerospace.json';
import { apply, checkAnswer, fleetError, newGame, randomPlace, randomWords, SCORE, viewFor, type Action } from './rules';
import type { GameState, Pack, Ship, TeamId } from './types';

const pack = data.packs[0] as Pack;
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

function run(s: GameState, by: TeamId, act: Action, now = 0): GameState {
  const r = apply(s, by, act, now, rnd);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

const fixedFleet = (): Ship[] => [
  { word: 'ROCKET', hintEn: 'h', hintFr: 'h', r: 0, c: 0, horiz: true, own: false },
  { word: 'ORBIT', hintEn: 'h', hintFr: 'h', r: 2, c: 0, horiz: true, own: false },
  { word: 'WING', hintEn: 'h', hintFr: 'h', r: 4, c: 0, horiz: true, own: false },
  { word: 'JET', hintEn: 'h', hintFr: 'h', r: 6, c: 0, horiz: true, own: false },
  { word: 'HUB', hintEn: 'h', hintFr: 'h', r: 8, c: 0, horiz: true, own: false },
];

function playing(): GameState {
  let s = newGame('TEST-1', pack);
  s = run(s, 0, { a: 'options', options: { wordsMode: 'choose', placeMode: 'place' } });
  s = run(s, 0, { a: 'start' });
  s = run(s, 0, { a: 'fleet', fleet: fixedFleet() });
  s = run(s, 1, { a: 'fleet', fleet: fixedFleet() });
  s.turn = 0; // make tests deterministic
  return s;
}

function shoot(s: GameState, by: TeamId, r: number, c: number, accept = true, bonus = '') {
  s = run(s, by, { a: 'draw', r, c });
  s = run(s, by, { a: 'submit', sentence: 'A sentence.', bonus });
  return run(s, by === 0 ? 1 : 0, { a: 'judge', accept });
}

describe('answers', () => {
  it('ignores case, articles and the final full stop', () => {
    expect(checkAnswer('A delay.', 'a delay', ['delay'])).toBe(true);
    expect(checkAnswer('the crew', 'the crew')).toBe(true);
    expect(checkAnswer('crew', 'the crew')).toBe(true);
    expect(checkAnswer('sign off', 'approve', ['sign off', 'validate'])).toBe(true);
    expect(checkAnswer('approved', 'approve')).toBe(false);
    expect(checkAnswer('', 'approve')).toBe(false);
  });
});

describe('fleet', () => {
  it('builds valid random fleets', () => {
    for (let i = 0; i < 50; i++) {
      for (const touching of [true, false]) {
        const f = randomPlace(randomWords(pack, rnd), touching, rnd);
        expect(fleetError(f, touching)).toBeNull();
      }
    }
  });
  it('rejects overlaps, wrong lengths and ships off the board', () => {
    const f = fixedFleet();
    expect(fleetError(f, true)).toBeNull();
    expect(fleetError(f, false)).toBeNull();
    f[1].r = 0; expect(fleetError(f, true)).toBe('overlap');
    const g = fixedFleet(); g[0].c = 6; expect(fleetError(g, true)).toBe('outside');
    const h = fixedFleet(); h[4].word = 'HUBS'; expect(fleetError(h, true)).toBe('lengths');
    const k = fixedFleet(); k[1].r = 1; expect(fleetError(k, false)).toBe('touching');
  });
  it('random + random skips setup', () => {
    let s = newGame('X', pack);
    s = run(s, 0, { a: 'start' });
    expect(s.phase).toBe('pick');
    expect(s.teams.every((t) => t.fleet && t.ready)).toBe(true);
  });
  it('own words need a hint and are flagged as own', () => {
    let s = newGame('X', pack);
    s = run(s, 0, { a: 'options', options: { wordsMode: 'choose', placeMode: 'random' } });
    s = run(s, 0, { a: 'start' });
    const f = fixedFleet(); f[0] = { ...f[0], word: 'THRUST', hintEn: '' };
    expect(apply(s, 0, { a: 'fleet', fleet: f }, 0, rnd)).toEqual({ ok: false, error: 'hint' });
    f[0].hintEn = 'It pushes a rocket forward';
    s = run(s, 0, { a: 'fleet', fleet: f });
    expect(s.teams[0].fleet!.find((x) => x.word === 'THRUST')!.own).toBe(true);
    expect(fleetError(s.teams[0].fleet!, true)).toBeNull();
  });
});

describe('turns', () => {
  it('rejected sentence loses the shot', () => {
    let s = shoot(playing(), 0, 0, 0, false);
    expect(s.last!.kind).toBe('rejected');
    expect(s.teams[1].shots['0,0']).toBeUndefined();
    expect(s.log[0].status).toBe('rejected');
    s = run(s, 0, { a: 'next' });
    expect(s.turn).toBe(1);
  });
  it('hit reveals a letter, scores, and the bonus is checked', () => {
    let s = playing();
    s = run(s, 0, { a: 'draw', r: 0, c: 1 });
    const ch = s.pack.challenges[s.card!.challenge];
    s = run(s, 0, { a: 'submit', sentence: 'The engineer delayed the launch.', bonus: ch.answer });
    s = run(s, 1, { a: 'judge', accept: true });
    expect(s.last).toMatchObject({ kind: 'hit', letter: 'O', bonusOk: true });
    expect(s.teams[0].score).toBe(SCORE.hit + SCORE.bonus);
    const v = viewFor(s, 0);
    expect(v.enemyLetters['0,1']).toBe('O');
    expect(v.enemyShips[0].letters).toEqual([null, 'O', null, null, null, null]);
    expect(v.enemyShips[0].hintEn).toBeNull();
  });
  it('the defending team cannot see attacker words and only sees its own fleet', () => {
    const v = viewFor(playing(), 1);
    expect(v.enemyFleet).toBeNull();
    expect(JSON.stringify(v.enemyShips)).not.toContain('ROCKET');
    expect(v.myFleet![0].word).toBe('ROCKET');
  });
  it('the attacking team cannot judge its own sentence', () => {
    let s = playing();
    s = run(s, 0, { a: 'draw', r: 5, c: 5 });
    s = run(s, 0, { a: 'submit', sentence: 'x', bonus: '' });
    expect(apply(s, 0, { a: 'judge', accept: true }).ok).toBe(false);
  });
  it('timeout accepts the sentence, only after the deadline', () => {
    let s = playing();
    s = run(s, 0, { a: 'draw', r: 5, c: 5 }, 0);
    s = run(s, 0, { a: 'submit', sentence: 'x', bonus: '' }, 0);
    expect(apply(s, 0, { a: 'timeout' }, 1000).ok).toBe(false);
    s = run(s, 0, { a: 'timeout' }, 91_000);
    expect(s.last!.kind).toBe('miss');
  });
  it('hint unlocks after two hits; sinking by hits scores +2', () => {
    let s = playing();
    for (const c of [0, 1, 2]) { s = shoot(s, 0, 8, c); if (s.phase === 'result') s = run(s, 0, { a: 'next' }); s.turn = 0; s.phase = s.phase === 'end' ? 'end' : 'pick'; }
    const v = viewFor(s, 0);
    expect(v.enemyShips[4].sunk).toBe(true);
    expect(v.enemyShips[4].hintEn).toBe('A central airport for connections'); // pack words keep the pack hint
    expect(s.teams[0].score).toBe(3 * SCORE.hit + SCORE.sinkByHits);
  });
  it('guessing the word sinks the ship (+3); a wrong guess ends the turn', () => {
    let s = shoot(playing(), 0, 2, 0); // O of ORBIT
    s = run(s, 0, { a: 'guess', ship: 1, word: 'orbit' });
    expect(s.teams[1].sunk[1]).toBe('guess');
    expect(s.teams[0].score).toBe(SCORE.hit + SCORE.sinkByGuess);
    s = run(s, 0, { a: 'next' });
    s = shoot(s, 1, 4, 0); // W of WING
    s = run(s, 1, { a: 'guess', ship: 2, word: 'WINK' });
    expect(s.phase).toBe('pick');
    expect(s.turn).toBe(0);
  });
  it('the game ends when a fleet is gone', () => {
    let s = playing();
    const fleet = s.teams[1].fleet!;
    for (const sh of fleet) for (let i = 0; i < sh.word.length; i++) {
      s.turn = 0; s.phase = 'pick';
      s = shoot(s, 0, sh.r, sh.c + i);
    }
    expect(s.phase).toBe('end');
    expect(s.winner).toBe(0);
  });
});
