import { withKeyNames } from '@/game/runtime/accessibility';
import dialogosEn from './dialogos/en.json';
import dialogosPtBr from './dialogos/pt-br.json';
import en from './locales/en.json';
import ptBr from './locales/pt-br.json';

// All user-facing game text lives in the catalogs — ONE JSON per language (locales/en.json,
// locales/pt-br.json), with exactly the same keys. The characters' lines (and their philosophy notes) live apart, in
// dialogos/en.json and dialogos/pt-br.json, grouped by character. This module is the single runtime seam: look a
// string up by dot-path with t(). Dialog/array content (wizard beats, NPC lines, title words)
// comes through tLines()/tWords()/localizedNpc(). The editor is a dev tool and is intentionally
// NOT localized.
//
// O JOGO E EM INGLES E EM PORTUGUES. Qual dos dois:
//   · rodando LOCAL (o dev server, ou localhost): SEMPRE pt-br ao abrir. Uma troca pelo menu de
//     pausa vale para a aba (sessionStorage) e some na proxima vez que o jogo for aberto.
//   · publicado: a escolha do jogador (localStorage); sem escolha, a lingua do navegador
//     (portugues -> pt-br, o resto -> en).
// A lingua e decidida UMA vez, no carregamento: trocar recarrega a pagina, porque o Phaser
// rasteriza cada texto uma vez e o DOM das telas e montado com o texto da hora.
// Chave que faltar no pt-br cai no ingles; que faltar nos dois aparece crua na tela (VISIVEL, nao
// em branco).

export interface I18nLine { speaker: 'npc' | 'narrator'; text: string }
export interface I18nNpc { name: string; lines: I18nLine[] }

export type Lang = 'en' | 'pt-br';
export const LANGS: readonly Lang[] = ['en', 'pt-br'];

// AS FALAS DOS PERSONAGENS moram à parte, em dialogos/<lang>.json, um arquivo por língua agrupado por personagem
// (com a ficha filosófica de cada um, que o jogo não lê): é lá que se edita o que eles dizem. Cada fala é um texto
// por linha, e "[narrador] " / "[narrator] " no começo faz dela narração. Aqui elas voltam para o caminho que o
// código pede (`falas` → "wizard.intro", "npc.painterStep"...) e o catálogo fica como sempre foi.
type Tree = Record<string, unknown>;
const NARRATOR_TAG = /^\[(narrador|narrator)\] /u;
const toLines = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((line) => {
      const text = String(line);
      const tag = NARRATOR_TAG.exec(text);
      return tag ? { speaker: 'narrator', text: text.slice(tag[0].length) } : { speaker: 'npc', text };
    });
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toLines(v)]));
  return value;
};
const withDialogs = (locale: unknown, dialogs: unknown): unknown => {
  const root = JSON.parse(JSON.stringify(locale)) as Tree;
  for (const [id, entry] of Object.entries(dialogs as Tree)) {
    if (!entry || typeof entry !== 'object') continue; // o "_leia"
    const falas = (entry as { falas?: Tree }).falas ?? {};
    for (const [path, value] of Object.entries(falas)) {
      const keys = path.split('.');
      const last = keys.pop();
      if (!last) throw new Error(`dialogos/${id}: caminho vazio`);
      let node = root;
      for (const key of keys) node = (node[key] ??= {}) as Tree;
      node[last] = toLines(value);
    }
  }
  return root;
};

// The catalogs are looked up dynamically by dot-path, so their literal types don't matter here —
// treat them as opaque trees.
const CATALOGS: Readonly<Record<Lang, unknown>> = { en: withDialogs(en, dialogosEn), 'pt-br': withDialogs(ptBr, dialogosPtBr) };

const LANG_KEY = 'zh.lang';

const isLocalRun = (): boolean => {
  if (import.meta.env.DEV) return true;
  try {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname);
  } catch {
    return false;
  }
};

const isLang = (value: unknown): value is Lang => (LANGS as readonly unknown[]).includes(value);

const readStored = (storage: () => Storage): Lang | undefined => {
  try {
    const value = storage().getItem(LANG_KEY);
    return isLang(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

const resolveLang = (): Lang => {
  if (isLocalRun()) return readStored(() => window.sessionStorage) ?? 'pt-br';
  const chosen = readStored(() => window.localStorage);
  if (chosen) return chosen;
  try {
    return navigator.language.toLowerCase().startsWith('pt') ? 'pt-br' : 'en';
  } catch {
    return 'en';
  }
};

const LANG: Lang = resolveLang();
const CATALOG: unknown = CATALOGS[LANG];
const FALLBACK: unknown = CATALOGS.en;

/** A lingua desta sessao. */
export const getLang = (): Lang => LANG;

/**
 * Troca a lingua e RECARREGA (ver o cabecalho: o texto e montado uma vez). Local, a escolha vale
 * para a aba; publicado, ela fica guardada.
 */
export const setLang = (lang: Lang): void => {
  try {
    const storage = isLocalRun() ? window.sessionStorage : window.localStorage;
    storage.setItem(LANG_KEY, lang);
  } catch { /* sem storage: a troca nao sobrevive ao reload */ }
  window.location.reload();
};

/** A outra lingua (o jogo tem duas): o que o botao do menu oferece. */
export const otherLang = (): Lang => (LANG === 'en' ? 'pt-br' : 'en');

const lookup = (root: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>(
    (acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined),
    root,
  );

const find = (key: string): unknown => {
  const value = lookup(CATALOG, key);
  return value === undefined ? lookup(FALLBACK, key) : value;
};

// String lookup by dot-path (e.g. "shop.title"), falling back to English, then to the raw key (so
// a missing string is VISIBLE on screen rather than blank).
export const t = (key: string): string => {
  const value = find(key);
  return typeof value === 'string' ? withKeyNames(value) : key;
};

// Structured lookup (arrays/objects).
const tRaw = <T>(key: string): T | undefined => {
  const value = find(key);
  return value === undefined ? undefined : (value as T);
};

export const tWords = (key: string): string[] => tRaw<string[]>(key) ?? [];

export const tLines = (key: string): I18nLine[] =>
  (tRaw<I18nLine[]>(key) ?? []).map((line) => ({ speaker: line.speaker, text: withKeyNames(line.text) }));

// NPC name + lines for a dialog kind, if the catalog defines it. Returns undefined when the kind
// is unknown, so callers can fall back to the world.json text.
export const localizedNpc = (kind: string): I18nNpc | undefined => {
  const node = tRaw<I18nNpc>(`npc.${kind}`);
  if (!node || typeof node.name !== 'string' || !Array.isArray(node.lines)) return undefined;
  return { name: node.name, lines: node.lines.map((line) => ({ speaker: line.speaker, text: withKeyNames(line.text) })) };
};

// Mirror the catalog's language onto <html lang> for a11y / correct hyphenation.
export const applyHtmlLang = (): void => {
  try { document.documentElement.lang = t('meta.htmlLang'); } catch { /* no DOM */ }
};
