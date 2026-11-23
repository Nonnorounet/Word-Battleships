import { en, fr, type Strings } from './strings';
import type { Lang } from '../state/types';

const dicts: Record<Lang, Strings> = { en, fr };
const store = (k: string, v?: string) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* storage unavailable */ } return null; };

// English by default, whatever the browser language; a manual EN/FR choice is remembered.
const saved = store('wb.lang');
let lang: Lang = saved === 'fr' ? 'fr' : 'en';
const listeners = new Set<() => void>();

export const getLang = () => lang;
export function setLang(l: Lang) {
  lang = l; store('wb.lang', l);
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}
export const onLang = (f: () => void) => listeners.add(f);

type Path<T> = { [K in keyof T]: T[K] extends string ? K : never }[keyof T];

/** Translate a key and fill {placeholders}. */
export function t(k: Path<Strings>, vars: Record<string, string | number> = {}): string {
  const s = (dicts[lang][k] ?? en[k]) as string;
  return s.replace(/\{(\w+)\}/g, (_, v) => String(vars[v] ?? `{${v}}`));
}
export const tErr = (code: string) => dicts[lang].errors[code] ?? code;
export const tType = (type: string) => dicts[lang].types[type] ?? type;
export const tStatus = (st: string) => dicts[lang].status[st] ?? st;

document.documentElement.lang = lang;
