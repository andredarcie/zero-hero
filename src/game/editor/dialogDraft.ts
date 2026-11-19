/**
 * O RASCUNHO DAS FALAS (o editor de falas, editor/DialogEditor; pedido do autor, 2026-11-18: "um editor de diálogos
 * para eu usar e alterar os diálogos quando quiser"). As falas moram em src/game/i18n/dialogos/<língua>.json, uma
 * seção por personagem, com `falas` pelo caminho que o código pede ("wizard.intro", "npc.painterStep.dig"...). Aqui
 * elas viram uma lista de PERSONAGENS, cada um com as suas FALAS, e cada fala com as caixas em português e em inglês
 * lado a lado — e voltam para os mesmos lugares do arquivo, sem mexer em mais nada (a filosofia, as notas, a ordem).
 *
 * Três formas de fala, que o editor respeita porque o código lê cada uma de um jeito:
 *   · `boxes`: a lista de caixas (tLines): pode ganhar, perder e reordenar caixas;
 *   · `box`: UMA caixa em texto (o código a lê com t()): fica sendo uma caixa só;
 *   · `name`: o nome que aparece na caixa de fala (`npc.<quem>.name`): uma linha, sem verso.
 */

import { NARRATOR_TAG } from '@/game/i18n/verseCheck';

export type DialogLang = 'pt-br' | 'en';
export const DIALOG_LANGS: readonly DialogLang[] = ['pt-br', 'en'];
export type DialogTree = Record<string, unknown>;
export type DialogFiles = Record<DialogLang, DialogTree>;

export type FalaKind = 'boxes' | 'box' | 'name';

export interface Fala {
  /** A seção do personagem no arquivo ("mago"). */
  section: string;
  /** O caminho dentro de `falas` (o primeiro pedaço pode ter ponto: "npc.wizard"). */
  path: readonly string[];
  kind: FalaKind;
  /** As caixas (ou o nome), uma por posição; o inglês tem sempre o mesmo número. */
  pt: string[];
  en: string[];
}

export interface Character {
  id: string;
  /** O nome do personagem na ficha (a seção sem pessoa, como a narração, não tem). */
  name: string;
  /** A ficha (só referência para quem escreve): a escola, a ideia dela e a voz do personagem. */
  school: string;
  idea: string;
  voice: string;
  falas: Fala[];
}

/** O caminho como o código o pede ("npc.painterStep.dig"). */
export const falaKey = (f: Pick<Fala, 'path'>): string => f.path.join('.');
/** A fala inteira, única no arquivo: a seção e o caminho. */
export const falaId = (f: Pick<Fala, 'section' | 'path'>): string => `${f.section}:${falaKey(f)}`;

/** Sufixos dos roteiros de um NPC ("painterDone", "radiationSuitHint"): o que sobra é quem é. */
const SCRIPT_SUFFIX = /(Done|Hint|Step|All|Make|Review|Night|Tea\w*)$/u;

/** Quem fala nas falas deste personagem (o tipo do NPC no jogo: "painter", "wizard", "death"), pelo caminho. */
export const kindOf = (c: Pick<Character, 'falas'>, known: (kind: string) => boolean): string | undefined => {
  for (const f of c.falas) {
    const kind = f.path[0].replace(/^npc\./u, '').replace(SCRIPT_SUFFIX, '');
    if (known(kind)) return kind;
  }
  return undefined;
};

/** O nome que a caixa de fala mostra em cima (a primeira fala de nome do personagem), na língua pedida. */
export const speakerName = (c: Character, lang: DialogLang): string => {
  const name = c.falas.find((f) => f.kind === 'name');
  return (name ? (lang === 'pt-br' ? name.pt[0] : name.en[0]) : '') || c.name;
};

const TAG: Readonly<Record<DialogLang, string>> = { 'pt-br': '[narrador] ', en: '[narrator] ' };

export const isNarrated = (box: string): boolean => NARRATOR_TAG.test(box);
/** O texto da caixa sem a marca de narração (o que o editor mostra no campo). */
export const bodyOf = (box: string): string => box.replace(NARRATOR_TAG, '');
/** A caixa com (ou sem) a marca de narração da língua. */
export const withNarration = (body: string, lang: DialogLang, on: boolean): string => (on ? TAG[lang] : '') + bodyOf(body);

const isTree = (v: unknown): v is DialogTree => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

const at = (root: unknown, path: readonly string[]): unknown => path.reduce<unknown>((node, k) => (isTree(node) ? node[k] : undefined), root);

const boxesOf = (value: unknown, count: number): string[] => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return [value];
  return Array.from({ length: count }, () => '');
};

/** Os personagens e as falas de cada um, na ordem do arquivo português; o inglês entra pelo mesmo caminho. */
export const readCharacters = (files: DialogFiles): Character[] => {
  const pt = files['pt-br'];
  const en = files.en;
  const out: Character[] = [];
  for (const [id, raw] of Object.entries(pt)) {
    if (id.startsWith('_') || !isTree(raw) || !isTree(raw.falas)) continue;
    const falas: Fala[] = [];
    const enFalas = isTree(en[id]) ? (en[id] as DialogTree).falas : undefined;
    const walk = (node: unknown, path: string[]): void => {
      if (Array.isArray(node) || typeof node === 'string') {
        const kind: FalaKind = typeof node === 'string' ? (path[path.length - 1] === 'name' ? 'name' : 'box') : 'boxes';
        const ptBoxes = boxesOf(node, 0);
        falas.push({ section: id, path, kind, pt: ptBoxes, en: boxesOf(at(enFalas, path), ptBoxes.length) });
        return;
      }
      if (isTree(node)) for (const [k, v] of Object.entries(node)) walk(v, [...path, k]);
    };
    walk(raw.falas, []);
    const f = isTree(raw.filosofia) ? raw.filosofia : {};
    const text = (v: unknown): string => (typeof v === 'string' ? v : '');
    out.push({ id, name: text(raw.nome), school: text(f.escola), idea: text(f.ideia), voice: text(f.voz), falas });
  }
  return out;
};

const setAt = (root: DialogTree, path: readonly string[], value: unknown): void => {
  let node = root;
  path.slice(0, -1).forEach((k) => {
    if (!isTree(node[k])) node[k] = {};
    node = node[k] as DialogTree;
  });
  node[path[path.length - 1]] = value;
};

/** Os arquivos com as falas do rascunho no lugar (uma cópia: o resto dos arquivos fica como estava). */
export const writeFalas = (files: DialogFiles, characters: readonly Character[]): DialogFiles => {
  const out = JSON.parse(JSON.stringify(files)) as DialogFiles;
  for (const c of characters) {
    for (const f of c.falas) {
      for (const lang of DIALOG_LANGS) {
        const section = out[lang][c.id];
        if (!isTree(section)) continue;
        if (!isTree(section.falas)) section.falas = {};
        const boxes = lang === 'pt-br' ? f.pt : f.en;
        setAt(section.falas as DialogTree, f.path, f.kind === 'boxes' ? [...boxes] : boxes[0] ?? '');
      }
    }
  }
  return out;
};

// ── as caixas de uma fala de lista ──────────────────────────────────────────────────────────────────────────────

/** Uma caixa nova (vazia, nas duas línguas) depois da `after` (−1 = no começo). Só na fala de lista. */
export const addBox = (f: Fala, after: number): void => {
  if (f.kind !== 'boxes') return;
  f.pt.splice(after + 1, 0, '');
  f.en.splice(after + 1, 0, '');
};

/** Tira a caixa `i` das duas línguas (a lista nunca fica vazia: o código espera ao menos uma fala). */
export const removeBox = (f: Fala, i: number): void => {
  if (f.kind !== 'boxes' || f.pt.length <= 1) return;
  f.pt.splice(i, 1);
  f.en.splice(i, 1);
};

/** Troca a caixa `i` com a vizinha (−1 sobe, +1 desce), nas duas línguas. */
export const moveBox = (f: Fala, i: number, dir: -1 | 1): void => {
  const j = i + dir;
  if (f.kind !== 'boxes' || j < 0 || j >= f.pt.length) return;
  [f.pt[i], f.pt[j]] = [f.pt[j], f.pt[i]];
  [f.en[i], f.en[j]] = [f.en[j], f.en[i]];
};

// ── o rascunho que se guarda sozinho (para uma página recarregada não levar o que não foi salvo) ───────────────

export interface DraftSnapshot {
  /** Quando foi guardado (ms). */
  at: number;
  /** Só as falas que diferem dos arquivos, pela identidade (`falaId`). */
  falas: Array<{ id: string; pt: string[]; en: string[] }>;
}

/** As falas do rascunho que não são as dos arquivos (vazio = nada a guardar). */
export const draftOf = (characters: readonly Character[], saved: readonly Character[], at: number): DraftSnapshot => {
  const before = new Map(saved.flatMap((c) => c.falas).map((f) => [falaId(f), f]));
  const falas = characters.flatMap((c) => c.falas)
    .filter((f) => {
      const old = before.get(falaId(f));
      return !old || old.pt.join('\u0000') !== f.pt.join('\u0000') || old.en.join('\u0000') !== f.en.join('\u0000');
    })
    .map((f) => ({ id: falaId(f), pt: [...f.pt], en: [...f.en] }));
  return { at, falas };
};

/** Põe o rascunho de volta nas falas (a fala que não existe mais nos arquivos fica de fora). Devolve quantas voltaram. */
export const applyDraft = (characters: Character[], draft: DraftSnapshot): number => {
  const byId = new Map(characters.flatMap((c) => c.falas).map((f) => [falaId(f), f]));
  let applied = 0;
  for (const d of draft.falas) {
    const f = byId.get(d.id);
    if (!f || !Array.isArray(d.pt) || !Array.isArray(d.en) || d.pt.length !== d.en.length) continue;
    if (f.kind !== 'boxes' && d.pt.length !== f.pt.length) continue;
    f.pt.splice(0, f.pt.length, ...d.pt.map(String));
    f.en.splice(0, f.en.length, ...d.en.map(String));
    applied += 1;
  }
  return applied;
};

/** A busca: sem acento e sem caixa alta, no texto das duas línguas e no caminho. */
export const normalize = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export const matchesFala = (f: Fala, query: string): boolean => {
  const q = normalize(query.trim());
  return q.length > 0 && [falaKey(f), ...f.pt, ...f.en].some((s) => normalize(s).includes(q));
};

// ── o arquivo ───────────────────────────────────────────────────────────────────────────────────────────────────

const pad = (n: number): string => ' '.repeat(n);
const allNumbers = (values: readonly unknown[]): boolean => values.length > 0 && values.every((x) => typeof x === 'number');

/**
 * O JSON como o arquivo é escrito à mão: dois espaços, e a lista ou o objeto só de números numa linha (o metro e a
 * rima do `_verso`), para salvar pelo editor não mexer em nada além das falas.
 */
export const formatDialogJson = (value: unknown): string => {
  const fmt = (v: unknown, indent: number): string => {
    if (Array.isArray(v)) {
      if (v.length === 0) return '[]';
      if (allNumbers(v)) return `[${v.join(', ')}]`;
      return `[\n${v.map((x) => pad(indent + 2) + fmt(x, indent + 2)).join(',\n')}\n${pad(indent)}]`;
    }
    if (isTree(v)) {
      const entries = Object.entries(v);
      if (entries.length === 0) return '{}';
      if (allNumbers(entries.map(([, x]) => x))) return `{ ${entries.map(([k, x]) => `${JSON.stringify(k)}: ${String(x)}`).join(', ')} }`;
      return `{\n${entries.map(([k, x]) => `${pad(indent + 2)}${JSON.stringify(k)}: ${fmt(x, indent + 2)}`).join(',\n')}\n${pad(indent)}}`;
    }
    return JSON.stringify(v);
  };
  return `${fmt(value, 0)}\n`;
};
