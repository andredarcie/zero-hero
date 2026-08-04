import en from './locales/en.json';

// All user-facing game text lives in the catalog (locales/en.json). This module is the single
// runtime seam: look a string up by dot-path with t(). Dialog/array content (wizard beats, NPC
// lines, title words) comes through tLines()/tWords()/localizedNpc(). The editor is a dev tool
// and is intentionally NOT localized.
//
// O JOGO E SO EM INGLES. Houve uma tela de idioma e um catalogo pt-br, e os dois sairam — nao ha
// mais locale nenhum pra escolher, nem em runtime nem no menu de pausa. O SEAM ficou de pe assim
// mesmo, e nao por nostalgia: ele e o unico lugar onde o texto do jogo mora fora do codigo, e a
// fala de NPC depende dele pra ter um caminho que o world.json possa NAO cobrir (localizedNpc
// devolve undefined e quem chama cai no texto autorado). Uma unica tabela, sem fallback nenhum.

export interface I18nLine { speaker: 'npc' | 'narrator'; text: string }
export interface I18nNpc { name: string; lines: I18nLine[] }

// The catalog is looked up dynamically by dot-path, so its literal type doesn't matter here —
// treat it as an opaque tree.
const CATALOG: unknown = en;

const lookup = (root: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>(
    (acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
    root,
  );

// String lookup by dot-path (e.g. "shop.title"), falling back to the raw key (so a missing
// string is VISIBLE on screen rather than blank).
export const t = (key: string): string => {
  const value = lookup(CATALOG, key);
  return typeof value === 'string' ? value : key;
};

// Structured lookup (arrays/objects).
const tRaw = <T>(key: string): T | undefined => {
  const value = lookup(CATALOG, key);
  return value === undefined ? undefined : (value as T);
};

export const tWords = (key: string): string[] => tRaw<string[]>(key) ?? [];

export const tLines = (key: string): I18nLine[] =>
  (tRaw<I18nLine[]>(key) ?? []).map((line) => ({ speaker: line.speaker, text: line.text }));

// NPC name + lines for a dialog kind, if the catalog defines it. Returns undefined when the kind
// is unknown, so callers can fall back to the world.json text.
export const localizedNpc = (kind: string): I18nNpc | undefined => {
  const node = tRaw<I18nNpc>(`npc.${kind}`);
  if (!node || typeof node.name !== 'string' || !Array.isArray(node.lines)) return undefined;
  return { name: node.name, lines: node.lines.map((line) => ({ speaker: line.speaker, text: line.text })) };
};

// Mirror the catalog's language onto <html lang> for a11y / correct hyphenation.
export const applyHtmlLang = (): void => {
  try { document.documentElement.lang = t('meta.htmlLang'); } catch { /* no DOM */ }
};
