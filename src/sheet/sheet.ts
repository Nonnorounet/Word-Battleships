import type { Challenge, ChallengeType, Pack } from '../state/types';
import { MAX_LEN, MIN_LEN, SHIPS } from '../state/types';
import { normaliseWord } from '../state/rules';

export const TABS = ['Grid words', 'Ship words', 'Challenges'] as const;

/** RFC 4180 CSV parser (quotes, doubled quotes, newlines in quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

function records(text: string): Record<string, string>[] {
  const [head, ...body] = parseCsv(text);
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

/** Builds packs from the three tabs' CSV text. */
export function packsFromCsv(grid: string, ships: string, challenges: string): Pack[] {
  const byPack = new Map<string, Pack>();
  const get = (name: string) => {
    if (!byPack.has(name)) byPack.set(name, { name, rows: [], cols: [], ships: [], challenges: [] });
    return byPack.get(name)!;
  };
  const rowsTmp = new Map<string, { pos: number; word: string; fr: string; axis: string }[]>();
  for (const r of records(grid)) {
    if (!r['pack'] || !r['word']) continue;
    get(r['pack']);
    const axis = (r['axis'] || '').toLowerCase().startsWith('c') ? 'col' : 'row';
    const p = (r['position'] || '').toUpperCase();
    const pos = axis === 'col' ? (/^[A-J]$/.test(p) ? p.charCodeAt(0) - 65 : Number(p) - 1) : Number(p) - 1;
    if (!rowsTmp.has(r['pack'])) rowsTmp.set(r['pack'], []);
    rowsTmp.get(r['pack'])!.push({ pos, word: r['word'], fr: r['french'] || '', axis });
  }
  for (const [name, list] of rowsTmp) {
    const pk = get(name);
    for (const ax of ['row', 'col'] as const) {
      const items = list.filter((x) => x.axis === ax).sort((a, b) => a.pos - b.pos).slice(0, 10);
      const words = items.map(({ word, fr }) => ({ word, fr }));
      if (ax === 'row') pk.rows = words; else pk.cols = words;
    }
  }
  for (const r of records(ships)) {
    if (!r['pack'] || !r['word']) continue;
    get(r['pack']).ships.push({ word: normaliseWord(r['word']), hintEn: r['hint (en)'] || '', hintFr: r['hint (fr)'] || '' });
  }
  for (const r of records(challenges)) {
    if (!r['pack'] || !r['prompt'] || !r['answer']) continue;
    const type = (['Definition', 'Translation', 'Gap fill'].find((x) => x.toLowerCase() === (r['type'] || '').toLowerCase()) || 'Definition') as ChallengeType;
    const c: Challenge = { type, prompt: r['prompt'], answer: r['answer'], also: (r['also accept'] || '').split(';').map((x) => x.trim()).filter(Boolean), hintFr: r['hint (fr)'] || '' };
    get(r['pack']).challenges.push(c);
  }
  return [...byPack.values()];
}

/** Returns why a pack can't be played, or null. */
export function packProblem(p: Pack): string | null {
  if (p.rows.length < 10) return `${p.rows.length}/10 row words`;
  if (p.cols.length < 10) return `${p.cols.length}/10 column words`;
  const have = p.ships.filter((s) => s.word.length >= MIN_LEN && s.word.length <= MAX_LEN).length;
  if (have < SHIPS) return `${have}/${SHIPS} ship words of ${MIN_LEN} to ${MAX_LEN} letters`;
  return null;
}

export function sheetId(link: string): string | null {
  const m = link.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,})/) || link.match(/^([a-zA-Z0-9-_]{30,})$/);
  return m ? m[1] : null;
}

export const csvUrl = (id: string, tab: string) =>
  `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;

declare global { interface Window { wbNative?: { fetchText(url: string): Promise<string> } } }

async function fetchText(url: string): Promise<string> {
  if (window.wbNative) return window.wbNative.fetchText(url);           // Electron: main process, no CORS
  const cap = (window as unknown as { Capacitor?: { isNativePlatform(): boolean } }).Capacitor;
  if (cap?.isNativePlatform()) {                                          // Android: native HTTP, no CORS
    const { CapacitorHttp } = await import('@capacitor/core');
    const r = await CapacitorHttp.get({ url, responseType: 'text' });
    if (r.status >= 400) throw new Error(String(r.status));
    return String(r.data);
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.text();
}

export async function loadSheet(link: string): Promise<Pack[]> {
  const id = sheetId(link);
  if (!id) throw new Error('link');
  const [g, s, c] = await Promise.all(TABS.map((tab) => fetchText(csvUrl(id, tab))));
  if (/<html/i.test(g)) throw new Error('private');
  return packsFromCsv(g, s, c);
}
