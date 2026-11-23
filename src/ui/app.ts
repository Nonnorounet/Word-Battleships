import builtIn from '../data/aerospace.json';
import { BoardScene, type BoardData, type Theme } from '../scene/board';
import { GuestSession, HostSession, type Session } from '../net/session';
import { LocalTransport } from '../net/local';
import { PeerTransport } from '../net/peer';
import { cleanCode, newCode, type Transport } from '../net/transport';
import { loadSheet, packProblem } from '../sheet/sheet';
import { fleetError, normaliseWord, partialFleetOk, shipAt, shipCells, type Action, type View } from '../state/rules';
import { FLEET, LETTERS, cellName, key, other, type Lang, type Options, type Pack, type Ship } from '../state/types';
import { getLang, onLang, setLang, t, tErr, tStatus, tType } from '../i18n/i18n';
import { esc, icon, patch, store } from './util';

// ---------------------------------------------------------------- state
const BUILT_IN = (builtIn.packs as Pack[]);
interface Slot { len: number; word: string; hintEn: string; hintFr: string; placed: { r: number; c: number; horiz: boolean } | null }

let session: Session | null = null;
let board: BoardScene | null = null;
const ui = {
  selected: null as [number, number] | null,
  hover: null as [number, number] | null,
  stickyRow: null as number | null,
  stickyCol: null as number | null,
  own: null as boolean | null,            // null = automatic
  showLog: false,
  toast: '',
  toastTimer: 0 as unknown as ReturnType<typeof setTimeout>,
  slots: [] as Slot[],
  active: 0,
  horiz: true,
  setupFor: '',                          // game code + start seq the slots belong to
  sheetLink: store.get('wb.sheet') || '',
  sheetMsg: '',
  sheetBusy: false,
  packs: ((): Pack[] => { try { return JSON.parse(store.get('wb.packs') || 'null') || BUILT_IN; } catch { return BUILT_IN; } })(),
  homeError: '',
  lastResultSeq: -1,
};

const app = document.getElementById('app')!;

// ---------------------------------------------------------------- theme
let themeOverride = store.get('wb.theme') as Theme | null;
const sysDark = matchMedia('(prefers-color-scheme: dark)');
const theme = (): Theme => themeOverride ?? (sysDark.matches ? 'dark' : 'light');
function applyTheme() { document.documentElement.dataset.theme = theme(); board?.setTheme(theme()); }
sysDark.addEventListener('change', () => { applyTheme(); render(); });
applyTheme();

// ---------------------------------------------------------------- helpers
const v = () => session?.view ?? null;
const myTurn = (w: View) => w.turn === w.me;
const fr = () => getLang() === 'fr';
const teamName = (w: View, i: number) => esc(w.teams[i]?.name ?? '');
function toast(msg: string) {
  ui.toast = msg; clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => { ui.toast = ''; renderToast(); }, 3500);
  renderToast();
}
function renderToast() {
  let el = document.getElementById('toast');
  if (!ui.toast) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = ui.toast;
}
function announce(msg: string) { const el = document.getElementById('live'); if (el) el.textContent = msg; }
function act(a: Action) { session?.act(a); }

// ---------------------------------------------------------------- top bar
function topBar(w: View | null) {
  const scores = w && w.phase !== 'lobby'
    ? `<div class="scores" aria-label="Score">
        <div class="s"><span class="lab">${teamName(w, 0)}</span><span class="n num">${w.teams[0].score}</span></div>
        ${['pick', 'card', 'judge', 'result'].includes(w.phase)
          ? `<span class="pill ${myTurn(w) ? '' : 'off'}">${myTurn(w) ? t('yourTurn') : t('theirTurn', { team: w.teams[w.turn].name })}</span>` : ''}
        <div class="s"><span class="n num">${w.teams[1].score}</span><span class="lab">${teamName(w, 1)}</span></div>
      </div>` : '';
  const logBtn = w && ['pick', 'card', 'judge', 'result'].includes(w.phase)
    ? `<button class="btn icon logbtn" data-do="toggle-log" aria-label="${t('shotLog')}">${icon.list()}</button>` : '';
  return `<header class="top">
    <div class="brand">${icon.target(26)}<b>${t('appName')}</b>${w ? `<span class="chip">${t('gameCode')} ${esc(w.code)} · ${esc(w.pack.name)}</span>` : ''}</div>
    ${scores}
    <div class="tools">${logBtn}
      <div class="langs" role="group" aria-label="${t('lang')}">
        <button data-lang="en" aria-pressed="${getLang() === 'en'}">EN</button><button data-lang="fr" aria-pressed="${getLang() === 'fr'}">FR</button>
      </div>
      <button class="btn icon" data-do="theme" aria-label="${t('theme')}">${theme() === 'dark' ? icon.sun() : icon.moon()}</button>
    </div>
  </header>`;
}

// ---------------------------------------------------------------- home
function homeHtml() {
  return `${topBar(null)}<main class="page"><div class="wrap">
    <div class="hero"><h1>${t('homeTitle')}</h1><p>${t('homeIntro')}</p></div>
    <div class="cards">
      <div class="box accent"><h2>${t('newGame')}</h2><p class="muted" style="margin:0;line-height:1.5">${t('codeHelp')}</p>
        <label class="field"><span>${t('renameTeam')}</span><input class="input" data-keep="hostname" value="${esc(store.get('wb.name') || 'Falcon')}" maxlength="24"></label>
        <button class="btn primary big" data-do="host">${t('newGame')}</button></div>
      <div class="box"><h2>${t('joinGame')}</h2>
        <label class="field"><span>${t('codeLabel')}</span><input class="input" data-keep="joincode" placeholder="ORBIT-42A" autocapitalize="characters" style="text-transform:uppercase;letter-spacing:.08em"></label>
        <label class="field"><span>${t('renameTeam')}</span><input class="input" data-keep="guestname" value="Kestrel" maxlength="24"></label>
        <button class="btn primary big" data-do="join">${t('join')}</button></div>
      <div class="box"><h2>${t('sameDevice')}</h2>
        <button class="btn big" data-do="local">${t('sameDevice')}</button></div>
    </div>
    ${ui.homeError ? `<p class="err" role="alert">${esc(ui.homeError)}</p>` : ''}
    ${session && session.status === 'connecting' ? `<p class="muted" role="status">${t('connecting')}</p>` : ''}
  </div></main>`;
}

async function startHost(local: boolean) {
  const name = (document.querySelector<HTMLInputElement>('[data-keep="hostname"]')?.value || 'Falcon').trim();
  store.set('wb.name', name);
  const code = newCode();
  const net: Transport = local ? new LocalTransport() : new PeerTransport();
  ui.homeError = '';
  try {
    await net.host(code);
  } catch (e) {
    ui.homeError = (e as Error).message === 'code-taken' ? 'Code taken, try again.' : t('cantConnect');
    render(); return;
  }
  session = new HostSession(code, ui.packs[0] ?? BUILT_IN[0], net, name);
  sessionStorage.setItem('wb.session', JSON.stringify({ role: 'host', code, local }));
  hook();
  if (local) window.open(`${location.pathname}?local=${encodeURIComponent(code)}`, '_blank', 'width=1280,height=820');
}

async function startGuest(code: string, local: boolean, name = 'Kestrel') {
  code = cleanCode(code);
  if (!code) return;
  const net: Transport = local ? new LocalTransport() : new PeerTransport();
  session = new GuestSession(code, net, name);
  hook();
  sessionStorage.setItem('wb.session', JSON.stringify({ role: 'guest', code, local, name }));
  try { await net.join(code); } catch (e) {
    ui.homeError = (e as Error).message === 'no-game' ? `${code}: ?` : t('cantConnect');
    session.close(); session = null; sessionStorage.removeItem('wb.session'); render();
  }
}

function hook() { session!.onChange(() => render()); render(); }

// ---------------------------------------------------------------- lobby
function lobbyHtml(w: View) {
  const host = w.me === 0;
  const o = w.options;
  const dis = host ? '' : 'disabled';
  const seg = (name: keyof Options, opts: [string, string][], val: string) => `<div class="seg" role="group">${opts.map(([k, l]) => `<button ${dis} data-opt="${name}" data-val="${k}" aria-pressed="${val === k}">${l}</button>`).join('')}</div>`;
  const chk = (name: keyof Options, label: string, sub = '') => `<label class="check"><input type="checkbox" ${dis} data-opt="${name}" ${o[name] ? 'checked' : ''}><span>${label}${sub ? `<small>${sub}</small>` : ''}</span></label>`;
  const p = w.pack;
  const bothRandom = o.wordsMode === 'random' && o.placeMode === 'random';
  return `${topBar(w)}<div class="lobby">
    <section aria-label="${t('teams')}">
      <div><div class="upper">${t('gameCode')}</div><div class="code" data-code>${esc(w.code)}</div><p class="muted" style="font-size:13px;line-height:1.5;margin:6px 0 0">${t('codeHelp')}</p></div>
      <div><h2 class="upper" style="font-size:15px;letter-spacing:.08em">${t('teams')}</h2><ul class="list">
        ${w.teams.map((tm, i) => `<li class="teamrow"><span class="dot ${tm.connected ? 'on' : ''}"></span><span style="flex:1;display:flex;flex-direction:column;gap:3px"><b style="font-family:var(--head);font-size:18px">${esc(tm.name)}</b><small class="muted">${i === w.me ? t('thisDevice') : ''}</small></span><span class="muted" style="font-size:13px">${tm.connected ? t('connected') : t('waiting')}</span></li>`).join('')}
      </ul></div>
      <label class="field"><span>${t('renameTeam')}</span><span style="display:flex;gap:8px"><input class="input" style="flex:1" data-keep="rename" value="${esc(w.teams[w.me].name)}" maxlength="24"><button class="btn" data-do="rename">OK</button></span></label>
    </section>
    <section aria-label="${t('gameOptions')}">
      <h1 style="font-size:30px">${t('gameOptions')}</h1>
      <div class="grid3">
        <label class="field"><span>${t('wordPack')}</span>
          <select class="input" ${dis} data-do-change="pack">${(host ? ui.packs : [p]).map((pk, i) => `<option value="${i}" ${pk.name === p.name ? 'selected' : ''}>${esc(pk.name)}</option>`).join('')}</select>
          <span style="letter-spacing:0">${t('packCounts', { rows: p.rows.length + p.cols.length, ships: p.ships.length, ch: p.challenges.length })}</span></label>
        <label class="field"><span>${t('grammarFocus')}</span><input class="input" ${dis} data-keep="focus" data-opt-text="focus" value="${esc(o.focus)}" maxlength="40"></label>
        <label class="field"><span>${t('judgeTime')}</span><select class="input" ${dis} data-opt-num="judgeSeconds">${[30, 60, 90, 120, 180].map((n) => `<option value="${n}" ${n === o.judgeSeconds ? 'selected' : ''}>${t('seconds', { n })}</option>`).join('')}</select></label>
      </div>
      <div class="box accent" style="gap:20px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap"><h2 style="font-size:22px">${t('fleet')}</h2><span class="muted" style="font-size:13px">${t('fleetSizes')}</span></div>
        <div class="grid2">
          <div class="field"><span>${t('shipWords')}</span>${seg('wordsMode', [['random', t('randomFromPack')], ['choose', t('eachChooses')]], o.wordsMode)}</div>
          <div class="field"><span>${t('shipPlacement')}</span>${seg('placeMode', [['random', t('random')], ['place', t('eachPlaces')]], o.placeMode)}</div>
        </div>
        <div class="grid2" style="gap:8px 22px">
          ${chk('allowOwn', t('allowOwn'), t('allowOwnSub'))}
          ${chk('ownHints', t('ownHints'), t('ownHintsSub'))}
          ${chk('touching', t('touching'))}
        </div>
      </div>
      ${host ? `<details class="box" ${ui.sheetMsg ? 'open' : ''}><summary style="cursor:pointer;font-weight:700;min-height:28px">${t('loadSheet')}</summary>
        <p class="muted" style="font-size:13px;margin:0;line-height:1.5">${t('sheetHelp')}</p>
        <label class="field"><span>${t('sheetLink')}</span><span style="display:flex;gap:8px;flex-wrap:wrap"><input class="input" style="flex:1;min-width:220px" data-keep="sheet" value="${esc(ui.sheetLink)}" placeholder="https://docs.google.com/spreadsheets/d/…"><button class="btn" data-do="sheet" ${ui.sheetBusy ? 'disabled' : ''}>${ui.sheetBusy ? t('loading') : t('load')}</button></span></label>
        ${ui.sheetMsg ? `<p role="status" class="${ui.sheetMsg.startsWith('!') ? 'err' : 'muted'}" style="margin:0">${esc(ui.sheetMsg.replace(/^!/, ''))}</p>` : ''}
      </details>` : ''}
      <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:auto;flex-wrap:wrap;align-items:center">
        ${host ? (w.teams[1].connected ? '' : `<span class="muted">${t('waiting')}</span>`) + `<button class="btn primary big" data-do="start" ${w.teams[1].connected ? '' : 'disabled'}>${icon.send()}${bothRandom ? t('start') : t('goSetup')}</button>`
          : `<span class="muted" role="status">${t('waitHost', { team: w.teams[0].name })}</span>`}
      </div>
    </section></div>`;
}

// ---------------------------------------------------------------- setup
function initSlots(w: View) {
  const id = `${w.code}|${w.myFleet?.map((s) => s.word).join() ?? ''}|${w.options.wordsMode}`;
  if (ui.setupFor === id) return;
  ui.setupFor = id;
  const fixed = w.options.wordsMode === 'random' ? w.myFleet : null;
  ui.slots = FLEET.map((len, i) => ({ len, word: fixed?.[i]?.word ?? '', hintEn: fixed?.[i]?.hintEn ?? '', hintFr: fixed?.[i]?.hintFr ?? '', placed: null }));
  ui.active = 0; ui.horiz = true;
}
const slotOk = (s: Slot) => normaliseWord(s.word).length === s.len;
const placing = (w: View) => w.options.placeMode === 'place';
function placedShips(except = -1): Ship[] {
  return ui.slots.flatMap((s, i) => (s.placed && i !== except && slotOk(s) ? [{ word: normaliseWord(s.word), hintEn: s.hintEn, hintFr: s.hintFr, r: s.placed.r, c: s.placed.c, horiz: s.placed.horiz, own: false }] : []));
}
function ghost(w: View) {
  const s = ui.slots[ui.active];
  if (!placing(w) || !s || !slotOk(s) || s.placed || !ui.hover) return null;
  const g = { word: normaliseWord(s.word), hintEn: '', hintFr: '', r: ui.hover[0], c: ui.hover[1], horiz: ui.horiz, own: false };
  return { ...g, valid: partialFleetOk([...placedShips(), g], w.options.touching) };
}

function setupPanels(w: View) {
  initSlots(w);
  const me = w.teams[w.me], foe = w.teams[other(w.me)];
  const fixed = w.options.wordsMode === 'random';
  const used = new Set(ui.slots.map((s) => normaliseWord(s.word)));
  const left = `<h2>${t('yourShips')}</h2><div class="slots">${ui.slots.map((s, i) => {
    const ok = slotOk(s), word = normaliseWord(s.word);
    const inPack = w.pack.ships.find((x) => x.word === word);
    const status = !placing(w) ? '' : s.placed ? `<span style="color:var(--primary);display:inline-flex;gap:4px;align-items:center">${icon.check(14)}${t('placed')}</span>` : t('notPlaced');
    const tiles = ok ? `<div class="tiles">${[...word].map((ch) => `<span class="tile mine">${ch}</span>`).join('')}</div>` : '';
    const picks = !fixed && !ok ? `<span class="muted" style="font-size:12px">${t('orPick')}</span><div class="pickers">${w.pack.ships.filter((x) => x.word.length === s.len && !used.has(x.word)).slice(0, 6).map((x) => `<button data-pick="${i}" data-word="${x.word}">${x.word}</button>`).join('')}</div>` : '';
    return `<div class="slot ${i === ui.active ? 'active' : ''} ${ok ? '' : 'todo'}" data-slot="${i}" role="group" aria-label="${t('letters', { n: s.len })}">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);gap:8px"><span style="${ok ? '' : 'color:var(--target)'}">${t('letters', { n: s.len }).toUpperCase()}${ok ? ` · ${(inPack ? t('fromPack') : t('yourWord')).toUpperCase()}` : ''}</span><span>${status}</span></div>
      ${fixed ? tiles : `<label class="field" style="letter-spacing:0"><span class="sr">${t('typeWord')}</span><input class="input" data-focus="w${i}" data-word-input="${i}" value="${esc(s.word)}" maxlength="${s.len}" placeholder="${t('typeWord')}" style="letter-spacing:.18em;font-weight:700;text-transform:uppercase" ${me.ready ? 'disabled' : ''}></label>
        ${s.word && !ok ? `<span class="err">${t('needs', { n: s.len, m: normaliseWord(s.word).length })}</span>` : ''}${picks}`}
      ${ok && !inPack && !fixed && w.options.ownHints ? `<label class="field" style="letter-spacing:0"><span>${t('hintEn')}</span><input class="input" data-focus="h${i}" data-hint="${i}" value="${esc(s.hintEn)}" maxlength="120" ${me.ready ? 'disabled' : ''}></label>
        <label class="field" style="letter-spacing:0"><span>${t('hintFr')}</span><input class="input" data-focus="hf${i}" data-hintfr="${i}" value="${esc(s.hintFr)}" maxlength="120" ${me.ready ? 'disabled' : ''}></label>` : ''}
    </div>`;
  }).join('')}</div>`;
  const placedN = placing(w) ? ui.slots.filter((s) => s.placed).length : ui.slots.filter(slotOk).length;
  const draft = draftFleet(w);
  const err = draft.error;
  const right = `<h2>${t('howTo')}</h2><ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:10px;font-size:14px;line-height:1.5">
      ${fixed ? '' : `<li>${t('setupStep1')}</li>`}${placing(w) ? `<li>${t('setupStep2')}</li><li>${t('setupStep3')}</li>` : ''}${!fixed && w.options.ownHints ? `<li>${t('setupStep4')}</li>` : ''}</ol>
    <div style="border-top:1.5px solid var(--line);padding-top:16px;margin-top:16px;display:flex;flex-direction:column;gap:8px">
      <span class="upper">${esc(foe.name)}</span><span style="font-size:14px">${foe.ready ? t('otherReady', { team: foe.name }) : t('otherSetup', { team: foe.name })}</span>
      <div class="progress"><i style="width:${foe.ready ? 100 : 40}%"></i></div></div>
    <div style="margin-top:22px;display:flex;flex-direction:column;gap:8px">
      <span style="font-size:13px;color:${err ? 'var(--target)' : 'var(--muted)'}">${t('readyCount', { n: placedN })}${err && placedN === 5 ? ` · ${tErr(err)}` : ''}</span>
      ${session?.error ? `<span class="err" role="alert">${tErr(session.error)}</span>` : ''}
      ${me.ready ? `<span role="status">${icon.check(16)} ${t('ready')}</span><button class="btn" data-do="unready">${t('notReady')}</button>`
        : `<button class="btn primary big" data-do="ready" ${err ? 'disabled' : ''}>${t('ready')}</button>`}
    </div>`;
  return { left, right };
}

function draftFleet(w: View): { fleet: Ship[]; error: string | null } {
  if (ui.slots.some((s) => !slotOk(s))) return { fleet: [], error: 'count' };
  const fleet = ui.slots.map((s) => ({ word: normaliseWord(s.word), hintEn: s.hintEn, hintFr: s.hintFr, r: s.placed?.r ?? 0, c: s.placed?.c ?? 0, horiz: s.placed?.horiz ?? true, own: false }));
  if (new Set(fleet.map((f) => f.word)).size !== fleet.length) return { fleet, error: 'duplicate' };
  if (w.options.wordsMode === 'choose') {
    for (const f of fleet) {
      const inPack = w.pack.ships.some((x) => x.word === f.word);
      if (!inPack && !w.options.allowOwn) return { fleet, error: 'not-in-pack' };
      if (!inPack && w.options.ownHints && !f.hintEn.trim()) return { fleet, error: 'hint' };
    }
  }
  if (placing(w)) {
    if (ui.slots.some((s) => !s.placed)) return { fleet, error: 'count' };
    const e = fleetError(fleet, w.options.touching);
    if (e) return { fleet, error: e };
  }
  return { fleet, error: null };
}

function randomPlaceDraft(w: View) {
  const ok = ui.slots.every(slotOk);
  if (!ok) { toast(tErr('count')); return; }
  for (let attempt = 0; attempt < 300; attempt++) {
    const out: Ship[] = [];
    let good = true;
    for (const s of ui.slots) {
      const word = normaliseWord(s.word);
      let done = false;
      for (let k = 0; k < 200 && !done; k++) {
        const horiz = Math.random() < 0.5;
        const r = Math.floor(Math.random() * (horiz ? 10 : 11 - word.length)), c = Math.floor(Math.random() * (horiz ? 11 - word.length : 10));
        const cand = { word, hintEn: '', hintFr: '', r, c, horiz, own: false };
        if (partialFleetOk([...out, cand], w.options.touching)) { out.push(cand); done = true; }
      }
      if (!done) { good = false; break; }
    }
    if (good) { ui.slots.forEach((s, i) => { s.placed = { r: out[i].r, c: out[i].c, horiz: out[i].horiz }; }); return; }
  }
}

// ---------------------------------------------------------------- play panels
function logHtml(w: View) {
  if (!w.log.length) return `<h2>${t('shotLog')}</h2><p class="muted" style="font-size:14px">—</p>`;
  return `<h2>${t('shotLog')}</h2><ul class="list log">${w.log.map((e) => {
    const res = e.status === 'rejected' ? t('resultRejected') : e.result === 'hit' ? t('resultHit', { letter: e.letter ?? '' }) : e.result === 'miss' ? t('resultMiss') : tStatus(e.status);
    const mark = e.status === 'accepted' ? `<span class="ok" aria-label="${tStatus('accepted')}">${icon.check()}</span>` : e.status === 'rejected' ? `<span class="no" aria-label="${tStatus('rejected')}">${icon.x()}</span>` : '<span class="muted">···</span>';
    return `<li><span class="cell">${cellName(e.r, e.c)}</span><span class="txt"><span>${esc(e.sentence)}</span><small>${esc(w.teams[e.team].name)} · ${res}${e.sunkWord ? ` · ${t('sunkMsg', { word: e.sunkWord })}` : ''}</small></span>${mark}</li>`;
  }).join('')}</ul>`;
}

function fleetHtml(w: View) {
  const canGuess = w.phase === 'result' && myTurn(w) && w.last?.kind === 'hit' && !w.last.guessed;
  const items = w.enemyShips.map((s, i) => {
    const first = s.cells.find(Boolean);
    const at = s.sunk ? `${t('sunk').toUpperCase()}` : first ? cellName(first[0], first[1]) : '?';
    const hint = s.hintEn ? `${t('hint')}: ${esc(fr() && s.hintFr ? s.hintFr : s.hintEn)}` : s.letters.some(Boolean) ? t('hintLocked') : t('notFound');
    const guess = canGuess && !s.sunk && s.letters.some(Boolean)
      ? `<label class="field" style="letter-spacing:0"><span class="sr">${t('guessShip')}</span><span style="display:flex;gap:8px"><input class="input" style="flex:1;min-width:0;text-transform:uppercase;letter-spacing:.12em" data-keep="g${i}" maxlength="${s.length}" placeholder="${t('guessPlaceholder', { n: s.length })}"><button class="btn" data-guess="${i}">${t('sink')}</button></span></label>` : '';
    return `<li><div class="meta"><span>${t('letters', { n: s.length })}</span><span>${at}</span></div>
      <div class="tiles">${s.letters.map((l) => `<span class="tile ${s.sunk ? 'sunk' : l ? 'on' : ''}">${l ?? ''}</span>`).join('')}</div>
      <small class="muted">${hint}</small>${guess}</li>`;
  }).join('');
  return `<h2>${t('enemyFleet')}</h2><ul class="list fleet">${items}</ul>`;
}

function cardHtml(w: View) {
  if (!w.card) return '';
  const c = w.card;
  const row = w.pack.rows[c.r], col = w.pack.cols[c.c];
  const ch = w.pack.challenges[c.challenge];
  const words = `<div class="words">${esc(row?.word)} <span>×</span> ${esc(col?.word)}</div>${fr() ? `<div class="fr">${esc(row?.fr)} × ${esc(col?.fr)}</div>` : ''}`;
  const bonusQ = ch ? `<div class="bonus"><span class="k">${t('bonus')} · ${tType(ch.type)}</span><div class="q">${esc(ch.prompt)}</div>${fr() && ch.hintFr ? `<div class="fr">${esc(ch.hintFr)}</div>` : ''}` : '';
  if (w.phase === 'card' && myTurn(w)) {
    return `<div class="overlay"><section class="card" role="dialog" aria-modal="true" aria-labelledby="cardtitle">
      <div class="head"><span class="title" id="cardtitle">${t('challenge')}</span><span class="cell">${cellName(c.r, c.c)}</span></div>
      ${words}<div class="task">${t('cardTask')} ${esc(t('focus', { focus: w.options.focus }))}</div>
      <label>${t('yourSentence')}<textarea class="input" rows="2" data-keep="sentence" id="sentence" maxlength="300"></textarea></label>
      ${ch ? `${bonusQ}<label><span class="sr">${t('bonusAnswer')}</span><input class="input" data-keep="bonus" placeholder="${t('bonusAnswer')}" maxlength="80"></label></div>` : ''}
      <div class="row"><button class="go" data-do="submit">${icon.send()}${t('send', { team: w.teams[other(w.me)].name })}</button><button class="alt" data-do="cancel">${t('backToBoard')}</button></div>
    </section></div>`;
  }
  if (w.phase === 'judge' && !myTurn(w)) {
    return `<div class="overlay"><section class="card" role="dialog" aria-modal="true" aria-labelledby="cardtitle">
      <div class="head"><span class="title" id="cardtitle">${t('judgeTitle', { team: w.teams[w.turn].name, cell: cellName(c.r, c.c) })}</span><span class="cell">${cellName(c.r, c.c)}</span></div>
      ${words}<div class="task">${esc(t('focus', { focus: w.options.focus }))}</div>
      <div class="sentence">${esc(c.sentence)}</div>
      <div class="task">${t('judgeTask', { row: row?.word ?? '', col: col?.word ?? '' })}</div>
      <div class="row"><button class="go" data-do="accept" data-focus="accept">${icon.check()}${t('accept')}</button><button class="alt" data-do="reject">${icon.x()} ${t('reject')}</button></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><small class="fr">${t('autoAccept')}</small><span class="timer" data-timer>--</span></div>
    </section></div>`;
  }
  return '';
}

function resultText(w: View): string {
  const L = w.last; if (!L) return '';
  const mine = myTurn(w);
  const parts: string[] = [];
  if (L.kind === 'rejected') parts.push(mine ? t('rejected') : t('theyRejected'));
  else if (L.kind === 'miss') parts.push(mine ? t('miss') : t('theyMiss', { team: w.teams[w.turn].name }));
  else parts.push(mine ? t('hit', { letter: L.letter ?? '' }) : t('theyHit', { team: w.teams[w.turn].name, word: myShipAtCard(w) }));
  if (L.sunkWord && L.guessed !== 'right') parts.push(t('sunkMsg', { word: L.sunkWord }));
  if (L.kind !== 'rejected' && mine) {
    const ch = w.card ? w.pack.challenges[w.card.challenge] : null;
    parts.push(L.bonusOk ? t('bonusRight') : ch ? t('bonusWrong', { answer: ch.answer }) : '');
  }
  if (L.guessed === 'right') parts.push(t('guessRight', { word: L.sunkWord ?? '' }));
  if (mine && L.kind === 'hit' && !L.guessed) parts.push(t('guessAfterHit'));
  return parts.filter(Boolean).join(' ');
}
function myShipAtCard(w: View) {
  if (!w.card || !w.myFleet) return '';
  const h = shipAt(w.myFleet, w.card.r, w.card.c);
  return h ? w.myFleet[h.ship].word : '';
}

function barHtml(w: View) {
  const foe = w.teams[other(w.me)].name;
  if (w.phase === 'setup') return '';
  if (w.phase === 'pick') {
    if (!myTurn(w)) return `<span class="grow" role="status">${t('waitingTurn', { team: w.teams[w.turn].name })}</span>${w.me === 0 ? `<button class="btn" data-do="end">${t('endGame')}</button>` : ''}`;
    const s = ui.selected;
    return `${s ? `<span class="tgt">${icon.target(16)}${t('selected', { cell: cellName(s[0], s[1]) })}</span><span class="what">${esc(w.pack.rows[s[0]]?.word)} <span class="muted">+</span> ${esc(w.pack.cols[s[1]]?.word)}</span>` : ''}
      <span class="grow">${t('pickHelp', { team: foe })}</span>
      <button class="btn primary big" data-do="draw" ${s ? '' : 'disabled'}>${icon.send()}${t('drawCard')}</button>`;
  }
  if (w.phase === 'card') return myTurn(w) ? `<span class="tgt">${icon.target(16)}${t('challengeOpen', { cell: cellName(w.card!.r, w.card!.c) })}</span><span class="grow"></span>`
    : `<span class="grow" role="status">${t('waitingTurn', { team: w.teams[w.turn].name })} ${cellName(w.card!.r, w.card!.c)}</span>`;
  if (w.phase === 'judge') return myTurn(w)
    ? `<span class="tgt">${icon.target(16)}${t('challengeOpen', { cell: cellName(w.card!.r, w.card!.c) })}</span><span class="grow">${t('judging', { team: foe })}</span><span class="muted" style="font-size:13px">${t('timer')}</span><span class="timer" data-timer>--</span>`
    : `<span class="grow">${t('judging', { team: w.teams[w.me].name })}</span><span class="timer" data-timer>--</span>`;
  if (w.phase === 'result') {
    const canNext = myTurn(w) || w.me === 0;
    return `<span class="grow" role="status" style="font-size:15px;color:var(--ink)">${esc(resultText(w))}</span>${canNext ? `<button class="btn primary big" data-do="next">${t('nextTurn')}</button>` : ''}`;
  }
  return '';
}

// ---------------------------------------------------------------- board data
function boardData(w: View): BoardData {
  if (w.phase === 'setup') {
    return { kind: 'setup', fleet: placing(w) ? placedShips() : [], ghost: ghost(w) };
  }
  if (showingOwn(w)) {
    return { kind: 'own', fleet: w.myFleet ?? [], shots: w.myShots, sunk: Object.fromEntries(Object.entries(w.mySunk).map(([k, x]) => [k, x])) };
  }
  const sunk = w.enemyShips.filter((s) => s.sunk).map((s) => ({ word: s.letters.join(''), cells: s.cells as [number, number][] }));
  return { kind: 'enemy', shots: w.enemyShots, letters: w.enemyLetters, sunk };
}
function showingOwn(w: View) {
  if (w.phase === 'setup') return true;
  if (ui.own !== null) return ui.own;
  return !myTurn(w) && ['pick', 'card'].includes(w.phase);
}

// ---------------------------------------------------------------- end
function endHtml(w: View) {
  const title = w.winner === -1 ? t('draw') : t('wins', { team: w.teams[w.winner ?? 0].name });
  const fleetTiles = (ships: { word: string; sunk: boolean; letters?: (string | null)[] }[]) => ships.map((s) => `<div class="tiles" style="margin:6px 0">${[...s.word].map((ch, j) => `<span class="tile ${s.sunk ? 'sunk' : s.letters?.[j] ? 'on' : 'mine'}">${ch}</span>`).join('')}</div>`).join('');
  const mine = (w.myFleet ?? []).map((s, i) => ({ word: s.word, sunk: w.mySunk[i] !== undefined }));
  const theirs = (w.enemyFleet ?? []).map((s, i) => ({ word: s.word, sunk: w.enemyShips[i]?.sunk ?? false, letters: w.enemyShips[i]?.letters }));
  return `${topBar(w)}<main class="page"><div class="wrap">
    <div class="hero"><div class="upper">${t('gameOver')}</div><h1>${esc(title)}</h1>
      <p class="num" style="font-size:22px;color:var(--ink)">${teamName(w, 0)} ${w.teams[0].score} · ${w.teams[1].score} ${teamName(w, 1)}</p></div>
    <div class="cards">
      <div class="box"><h2>${t('bothFleets')}</h2><div><div class="upper">${teamName(w, w.me)}</div>${fleetTiles(mine)}</div><div><div class="upper">${teamName(w, other(w.me))}</div>${fleetTiles(theirs)}</div></div>
      <div class="box" style="grid-column:span 2;min-width:0">${logHtml(w).replace(t('shotLog'), t('fullLog'))}</div>
    </div>
    ${w.me === 0 ? `<div><button class="btn primary big" data-do="restart">${t('playAgain')}</button></div>` : ''}
  </div></main>`;
}

// ---------------------------------------------------------------- render
let gameEl: HTMLElement | null = null;

function render() {
  const w = v();
  if (!w) {
    destroyGame();
    patch(app, homeHtml() + `<div id="live" class="sr" aria-live="polite"></div>`);
    return;
  }
  if (w.phase === 'lobby' || w.phase === 'end') {
    destroyGame();
    patch(app, (w.phase === 'lobby' ? lobbyHtml(w) : endHtml(w)) + `<div id="live" class="sr" aria-live="polite"></div>`);
    if (w.phase === 'lobby') ui.setupFor = '';
    return;
  }
  ensureGame(w);
  const top = gameEl!.querySelector<HTMLElement>('[data-slot-top]')!;
  patch(top, topBar(w));
  const left = gameEl!.querySelector<HTMLElement>('.panel.left')!;
  const right = gameEl!.querySelector<HTMLElement>('.panel.right')!;
  const bar = gameEl!.querySelector<HTMLElement>('.bar')!;
  const over = gameEl!.querySelector<HTMLElement>('[data-overlay]')!;
  const cap = gameEl!.querySelector<HTMLElement>('.caption')!;
  const tools = gameEl!.querySelector<HTMLElement>('.stagetools')!;
  gameEl!.querySelector('.game')!.classList.toggle('showlog', ui.showLog);
  if (w.phase === 'setup') {
    const p = setupPanels(w);
    patch(left, p.left); patch(right, p.right);
    patch(bar, '');
    (bar as HTMLElement).style.display = 'none';
    patch(over, '');
    cap.textContent = t('yourWaters', { team: w.teams[other(w.me)].name });
    patch(tools, zoomTools(false) + (placing(w) ? '' : ''));
    const ft = gameEl!.querySelector<HTMLElement>('[data-floattools]')!;
    patch(ft, placing(w) && !w.teams[w.me].ready ? `<button class="btn" data-do="rotate">${icon.rotate()}${t('rotate')}</button><button class="btn" data-do="randomplace">${t('randomPlace')}</button><button class="btn" data-do="clear">${t('clear')}</button>` : '');
    ft.style.display = placing(w) && !w.teams[w.me].ready ? '' : 'none';
    gameEl!.querySelector<HTMLElement>('.panel.left')!.style.display = '';
  } else {
    (bar as HTMLElement).style.display = '';
    gameEl!.querySelector<HTMLElement>('[data-floattools]')!.style.display = 'none';
    gameEl!.querySelector<HTMLElement>('.panel.left')!.style.display = '';
    patch(left, logHtml(w));
    patch(right, fleetHtml(w));
    patch(bar, barHtml(w));
    patch(over, cardHtml(w));
    const own = showingOwn(w);
    const shots = Object.keys(w.enemyShots).length, hits = Object.values(w.enemyShots).filter((x) => x === 'hit').length;
    cap.textContent = own ? t('ownWaters') : t('enemyWaters', { team: w.teams[other(w.me)].name, shots, hits });
    patch(tools, zoomTools(true, own));
    if (w.phase === 'result' && w.seq !== ui.lastResultSeq) { ui.lastResultSeq = w.seq; announce(resultText(w)); }
    if (w.phase !== 'pick' || !myTurn(w)) { if (w.phase !== 'card' && w.phase !== 'judge') ui.selected = null; }
    if (w.phase === 'card' && myTurn(w)) setTimeout(() => { const s = document.getElementById('sentence'); if (s && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') s.focus(); }, 0);
  }
  updateBoard(w);
  tick();
}

function zoomTools(withToggle: boolean, own = false) {
  return `<button class="btn icon" data-do="zoomin" aria-label="${t('zoomIn')}">${icon.plus()}</button><button class="btn icon" data-do="zoomout" aria-label="${t('zoomOut')}">${icon.minus()}</button>${withToggle ? `<button class="btn icon" data-do="toggleown" aria-label="${own ? t('showEnemy') : t('showOwn')}" title="${own ? t('showEnemy') : t('showOwn')}">${icon.rotate()}</button>` : ''}`;
}

function ensureGame(w: View) {
  if (gameEl && app.contains(gameEl)) return;
  app.innerHTML = '';
  delete app.dataset.html;
  gameEl = document.createElement('div');
  gameEl.style.cssText = 'display:flex;flex-direction:column;height:100%';
  gameEl.innerHTML = `<div data-slot-top></div><div class="game">
      <aside class="panel left" aria-label="${t('shotLog')}"></aside>
      <div class="centre"><div id="stage"></div><div class="caption"></div><div class="stagetools"></div><div class="floattools" data-floattools></div><div data-overlay></div></div>
      <aside class="panel right" aria-label="${t('enemyFleet')}"></aside>
      <footer class="bar"></footer></div><div id="live" class="sr" aria-live="polite"></div>`;
  app.appendChild(gameEl);
  board = new BoardScene(gameEl.querySelector('#stage')!);
  board.setTheme(theme());
  board.onHover = (h) => {
    const cur = v(); if (!cur) return;
    ui.hover = h && h.type === 'cell' ? [h.r, h.c] : null;
    if (h && h.type === 'row') { ui.stickyRow = null; }
    updateBoard(cur, h);
    if (cur.phase === 'setup') render();
  };
  board.onTap = (h) => onBoardTap(h);
  void w;
}

function destroyGame() {
  if (board) { board.dispose(); board = null; }
  gameEl = null;
}

function updateBoard(w: View, hoverLabel?: { type: string; i?: number } | null) {
  if (!board) return;
  const own = showingOwn(w);
  const sel = ui.selected;
  const hov = ui.hover;
  let hlRow: number | null = ui.stickyRow, hlCol: number | null = ui.stickyCol;
  if (sel && !own) { hlRow = sel[0]; hlCol = sel[1]; }
  if (w.card && (w.phase === 'card' || w.phase === 'judge')) { hlRow = w.card.r; hlCol = w.card.c; }
  if (hov) { hlRow = hov[0]; hlCol = hov[1]; }
  if (hoverLabel?.type === 'row') hlRow = hoverLabel.i!;
  if (hoverLabel?.type === 'col') hlCol = hoverLabel.i!;
  const selected: [number, number] | null = w.card && (w.phase === 'card' || w.phase === 'judge' || w.phase === 'result') && !own ? [w.card.r, w.card.c] : own ? null : sel;
  board.set({
    rows: w.pack.rows, cols: w.pack.cols, data: boardData(w),
    selected, hover: w.phase === 'setup' || (w.phase === 'pick' && myTurn(w) && !own) ? hov : null,
    hlRow, hlCol, showFrench: fr(),
  });
}

function onBoardTap(h: { type: 'cell'; r: number; c: number } | { type: 'row'; i: number } | { type: 'col'; i: number }) {
  const w = v(); if (!w) return;
  if (h.type === 'row') { ui.stickyRow = ui.stickyRow === h.i ? null : h.i; ui.stickyCol = null; updateBoard(w); return; }
  if (h.type === 'col') { ui.stickyCol = ui.stickyCol === h.i ? null : h.i; ui.stickyRow = null; updateBoard(w); return; }
  ui.stickyRow = ui.stickyCol = null;
  if (w.phase === 'setup') { setupTap(w, h.r, h.c); return; }
  if (w.phase === 'pick' && myTurn(w) && !showingOwn(w)) {
    if (w.enemyShots[key(h.r, h.c)]) { toast(`${cellName(h.r, h.c)} ✓`); return; }
    ui.selected = [h.r, h.c];
    ui.hover = null;
    announce(`${cellName(h.r, h.c)}: ${w.pack.rows[h.r]?.word} + ${w.pack.cols[h.c]?.word}`);
    render();
  }
}

function setupTap(w: View, r: number, c: number) {
  if (!placing(w) || w.teams[w.me].ready) return;
  // tapping a placed ship picks it up
  const placed = ui.slots.findIndex((s) => s.placed && slotOk(s) && shipCells({ word: normaliseWord(s.word), r: s.placed.r, c: s.placed.c, horiz: s.placed.horiz }).some(([a, b]) => a === r && b === c));
  if (placed >= 0) { ui.horiz = ui.slots[placed].placed!.horiz; ui.slots[placed].placed = null; ui.active = placed; ui.hover = [r, c]; render(); return; }
  const s = ui.slots[ui.active];
  if (!s || !slotOk(s)) { toast(tErr('count')); return; }
  ui.hover = [r, c];
  const g = ghost(w);
  if (!g || !g.valid) { toast(tErr(w.options.touching ? 'overlap' : 'touching')); return; }
  s.placed = { r, c, horiz: ui.horiz };
  const next = ui.slots.findIndex((x) => !x.placed);
  if (next >= 0) ui.active = next;
  ui.hover = null;
  render();
}

// ---------------------------------------------------------------- timer
function tick() {
  const w = v();
  const els = document.querySelectorAll<HTMLElement>('[data-timer]');
  if (!w?.card?.deadline || w.phase !== 'judge') { els.forEach((e) => (e.textContent = '')); return; }
  const left = Math.max(0, Math.ceil((w.card.deadline - Date.now()) / 1000));
  els.forEach((e) => (e.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`));
}
setInterval(tick, 500);

// ---------------------------------------------------------------- events
document.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-do],[data-lang],[data-opt],[data-pick],[data-slot],[data-guess]');
  if (!el) return;
  const w = v();
  if (el.dataset.lang) { setLang(el.dataset.lang as Lang); return; }
  if (el.dataset.opt && el.tagName === 'BUTTON') { act({ a: 'options', options: { [el.dataset.opt]: el.dataset.val } }); return; }
  if (el.dataset.opt && el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'checkbox') { act({ a: 'options', options: { [el.dataset.opt]: (el as HTMLInputElement).checked } }); return; }
  if (el.dataset.pick) { const i = +el.dataset.pick; ui.slots[i].word = el.dataset.word!; const p = w?.pack.ships.find((x) => x.word === el.dataset.word); if (p) { ui.slots[i].hintEn = p.hintEn; ui.slots[i].hintFr = p.hintFr; } ui.active = i; render(); return; }
  if (el.dataset.guess) {
    const i = +el.dataset.guess; const inp = document.querySelector<HTMLInputElement>(`[data-keep="g${i}"]`);
    if (inp?.value.trim()) act({ a: 'guess', ship: i, word: inp.value });
    return;
  }
  if (el.dataset.slot && !el.dataset.do) {
    if ((e.target as HTMLElement).closest('input,button')) return;
    ui.active = +el.dataset.slot; render(); return;
  }
  switch (el.dataset.do) {
    case 'theme': themeOverride = theme() === 'dark' ? 'light' : 'dark'; store.set('wb.theme', themeOverride); applyTheme(); render(); break;
    case 'host': void startHost(false); break;
    case 'local': void startHost(true); break;
    case 'join': {
      const code = document.querySelector<HTMLInputElement>('[data-keep="joincode"]')?.value ?? '';
      const name = document.querySelector<HTMLInputElement>('[data-keep="guestname"]')?.value || 'Kestrel';
      void startGuest(code, false, name.trim()); break;
    }
    case 'rename': { const n = document.querySelector<HTMLInputElement>('[data-keep="rename"]')?.value ?? ''; if (n.trim()) act({ a: 'rename', name: n }); break; }
    case 'start': act({ a: 'start' }); break;
    case 'sheet': void loadFromSheet(); break;
    case 'ready': { if (!w) break; const d = draftFleet(w); if (d.error) { toast(tErr(d.error)); break; } act({ a: 'fleet', fleet: d.fleet }); break; }
    case 'unready': act({ a: 'unready' }); break;
    case 'rotate': ui.horiz = !ui.horiz; render(); break;
    case 'randomplace': if (w) { randomPlaceDraft(w); render(); } break;
    case 'clear': ui.slots.forEach((s) => (s.placed = null)); ui.active = 0; render(); break;
    case 'draw': if (ui.selected) act({ a: 'draw', r: ui.selected[0], c: ui.selected[1] }); break;
    case 'cancel': act({ a: 'cancel' }); break;
    case 'submit': {
      const s = document.querySelector<HTMLTextAreaElement>('[data-keep="sentence"]')?.value ?? '';
      const b = document.querySelector<HTMLInputElement>('[data-keep="bonus"]')?.value ?? '';
      if (!s.trim()) { document.getElementById('sentence')?.focus(); break; }
      act({ a: 'submit', sentence: s, bonus: b });
      break;
    }
    case 'accept': act({ a: 'judge', accept: true }); break;
    case 'reject': act({ a: 'judge', accept: false }); break;
    case 'next': act({ a: 'next' }); ui.own = null; break;
    case 'end': if (confirm(t('confirmEnd'))) act({ a: 'end' }); break;
    case 'restart': act({ a: 'restart' }); break;
    case 'zoomin': board?.zoom(1); break;
    case 'zoomout': board?.zoom(-1); break;
    case 'toggleown': if (w) { ui.own = !showingOwn(w); render(); } break;
    case 'toggle-log': ui.showLog = !ui.showLog; render(); break;
  }
});

document.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.wordInput !== undefined) {
    const i = +el.dataset.wordInput; ui.slots[i].word = normaliseWord(el.value).slice(0, ui.slots[i].len); ui.slots[i].placed = null;
    const w = v(); const p = w?.pack.ships.find((x) => x.word === ui.slots[i].word);
    if (p) { ui.slots[i].hintEn = p.hintEn; ui.slots[i].hintFr = p.hintFr; }
    el.value = ui.slots[i].word; ui.active = i; render(); return;
  }
  if (el.dataset.hint !== undefined) { ui.slots[+el.dataset.hint].hintEn = el.value; render(); return; }
  if (el.dataset.hintfr !== undefined) { ui.slots[+el.dataset.hintfr].hintFr = el.value; return; }
  if (el.dataset.keep === 'sheet') ui.sheetLink = el.value;
});

document.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  if (el.dataset.optText) act({ a: 'options', options: { [el.dataset.optText]: el.value } });
  if (el.dataset.optNum) act({ a: 'options', options: { [el.dataset.optNum]: Number(el.value) } });
  if ((el as HTMLSelectElement).dataset.doChange === 'pack') { const p = ui.packs[+el.value]; if (p) act({ a: 'pack', pack: p }); }
});

document.addEventListener('keydown', (e) => {
  const w = v(); if (!w) return;
  const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName);
  if (e.key === 'Escape') { if (w.phase === 'card' && myTurn(w)) act({ a: 'cancel' }); ui.showLog = false; render(); return; }
  if (typing) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && w.phase === 'card') document.querySelector<HTMLElement>('[data-do="submit"]')?.click(); return; }
  if (w.phase === 'setup' && (e.key === 'r' || e.key === 'R')) { ui.horiz = !ui.horiz; render(); return; }
  if (w.phase === 'pick' && myTurn(w) && !showingOwn(w)) {
    const d: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (d[e.key]) {
      e.preventDefault();
      const [r, c] = ui.selected ?? [0, 0];
      const nr = Math.max(0, Math.min(9, r + (ui.selected ? d[e.key][0] : 0))), nc = Math.max(0, Math.min(9, c + (ui.selected ? d[e.key][1] : 0)));
      ui.selected = [nr, nc];
      announce(`${cellName(nr, nc)}: ${w.pack.rows[nr]?.word} + ${w.pack.cols[nc]?.word}${w.enemyShots[key(nr, nc)] ? ' ✓' : ''}`);
      render();
    } else if (e.key === 'Enter' && ui.selected && !w.enemyShots[key(...ui.selected)]) act({ a: 'draw', r: ui.selected[0], c: ui.selected[1] });
  }
});

async function loadFromSheet() {
  const link = ui.sheetLink.trim(); if (!link) return;
  ui.sheetBusy = true; ui.sheetMsg = ''; render();
  try {
    const packs = (await loadSheet(link)).filter((p) => !packProblem(p));
    if (!packs.length) throw new Error('empty');
    ui.packs = packs; store.set('wb.packs', JSON.stringify(packs)); store.set('wb.sheet', link);
    act({ a: 'pack', pack: packs[0] });
    ui.sheetMsg = t('loaded', { pack: packs.map((p) => p.name).join(', ') });
  } catch {
    ui.sheetMsg = '!' + t('sheetError');
  }
  ui.sheetBusy = false; render();
}

onLang(() => { if (gameEl) { delete gameEl.querySelector<HTMLElement>('.panel.left')!.dataset.html; } render(); });

// errors coming back from the host
setInterval(() => { const s = session; if (s?.error && s.error !== (window as unknown as { _lastErr?: string })._lastErr) { (window as unknown as { _lastErr?: string })._lastErr = s.error; if (v()?.phase !== 'setup') toast(tErr(s.error)); } }, 400);

// ---------------------------------------------------------------- boot
export function boot() {
  const params = new URLSearchParams(location.search);
  const local = params.get('local');
  const saved = sessionStorage.getItem('wb.session');
  if (local) { void startGuest(local, true, 'Kestrel'); return; }
  if (saved) {
    try {
      const s = JSON.parse(saved);
      if (s.role === 'host') {
        const net: Transport = s.local ? new LocalTransport() : new PeerTransport();
        net.host(s.code).then(() => { session = new HostSession(s.code, ui.packs[0] ?? BUILT_IN[0], net); hook(); }).catch(() => { sessionStorage.removeItem('wb.session'); render(); });
        render(); return;
      }
      if (s.role === 'guest') { void startGuest(s.code, s.local, s.name); return; }
    } catch { sessionStorage.removeItem('wb.session'); }
  }
  const join = params.get('join');
  render();
  if (join) { const f = document.querySelector<HTMLInputElement>('[data-keep="joincode"]'); if (f) f.value = join; }
}
void LETTERS;
