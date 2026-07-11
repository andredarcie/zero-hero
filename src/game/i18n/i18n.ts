import en from './locales/en.json';
import ptBr from './locales/pt-br.json';

// All user-facing game text lives in the locale catalogs (locales/*.json). This module is the
// single runtime seam: pick a locale (persisted + browser-detected), then look strings up by
// dot-path with t(). Dialog/array content (wizard beats, NPC lines, title words) comes through
// tLines()/tWords()/localizedNpc(). The editor is a dev tool and is intentionally NOT localized.

export type Locale = 'pt-br' | 'en';
export const LOCALES: readonly Locale[] = ['pt-br', 'en'] as const;

export interface I18nLine { speaker: 'npc' | 'narrator'; text: string }
export interface I18nNpc { name: string; lines: I18nLine[] }

// Catalogs are looked up dynamically by dot-path, so their precise (per-locale literal) types
// don't need to match — treat them as opaque trees here.
const CATALOGS: Record<Locale, unknown> = { 'pt-br': ptBr, en };

const STORAGE_KEY = 'zh.locale';

const isLocale = (value: unknown): value is Locale => value === 'pt-br' || value === 'en';

// Default before the player picks: a saved choice wins, else the browser language (pt* → pt-br),
// else English. The language screen still appears after the title; this only seeds its highlight
// and localizes the pre-title loading text.
const detectDefault = (): Locale => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch { /* storage unavailable */ }
  try {
    if ((navigator.language || '').toLowerCase().startsWith('pt')) return 'pt-br';
  } catch { /* no navigator */ }
  return 'en';
};

let current: Locale = detectDefault();

export const getLocale = (): Locale => current;

const lookup = (root: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>(
    (acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
    root,
  );

// String lookup by dot-path (e.g. "shop.title"), falling back to the other locale, then the raw
// key (so a missing string is visible rather than blank).
export const t = (key: string): string => {
  const value = lookup(CATALOGS[current], key);
  if (typeof value === 'string') return value;
  for (const locale of LOCALES) {
    const alt = lookup(CATALOGS[locale], key);
    if (typeof alt === 'string') return alt;
  }
  return key;
};

// Structured lookup (arrays/objects) with the same fallback chain.
const tRaw = <T>(key: string): T | undefined => {
  const value = lookup(CATALOGS[current], key);
  if (value !== undefined) return value as T;
  for (const locale of LOCALES) {
    const alt = lookup(CATALOGS[locale], key);
    if (alt !== undefined) return alt as T;
  }
  return undefined;
};

export const tWords = (key: string): string[] => tRaw<string[]>(key) ?? [];

export const tLines = (key: string): I18nLine[] =>
  (tRaw<I18nLine[]>(key) ?? []).map((line) => ({ speaker: line.speaker, text: line.text }));

// Localized NPC name + lines for a dialog kind, if the active catalog defines it. Returns
// undefined when the kind is unknown, so callers can fall back to the world.json text.
export const localizedNpc = (kind: string): I18nNpc | undefined => {
  const node = tRaw<I18nNpc>(`npc.${kind}`);
  if (!node || typeof node.name !== 'string' || !Array.isArray(node.lines)) return undefined;
  return { name: node.name, lines: node.lines.map((line) => ({ speaker: line.speaker, text: line.text })) };
};

// Mirror the chosen locale onto <html lang> for a11y / correct hyphenation.
export const applyHtmlLang = (): void => {
  try { document.documentElement.lang = t('meta.htmlLang'); } catch { /* no DOM */ }
};

export const setLocale = (locale: Locale): void => {
  current = locale;
  try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* storage unavailable */ }
  applyHtmlLang();
};
