import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import dialogosEn from './dialogos/en.json';
import dialogosPtBr from './dialogos/pt-br.json';
import en from './locales/en.json';
import ptBr from './locales/pt-br.json';
import { t, tLines, tWords } from './i18n';

// O JOGO É BILÍNGUE (CLAUDE.md): os dois catálogos têm as mesmas chaves e as falas de cada personagem existem nas
// duas línguas, com o mesmo número de linhas e a narração nas mesmas linhas — o jogo anda as falas por índice.

const here = path.dirname(fileURLToPath(import.meta.url));

type Tree = Record<string, unknown>;
const leafPaths = (node: unknown, prefix = ''): string[] =>
  node && typeof node === 'object' && !Array.isArray(node)
    ? Object.entries(node as Tree).flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k))
    : [prefix];

const NARRATOR = /^\[(narrador|narrator)\] /u;
const falasOf = (dialogs: unknown): Record<string, Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(dialogs as Tree)
      .filter(([, entry]) => entry && typeof entry === 'object')
      .map(([id, entry]) => [id, ((entry as { falas?: Tree }).falas ?? {})]),
  );

describe('catálogos de texto', () => {
  it('en e pt-br têm exatamente as mesmas chaves', () => {
    expect(leafPaths(ptBr).sort()).toEqual(leafPaths(en).sort());
  });

  it('nenhum texto vazio', () => {
    for (const [lang, catalog] of [['en', en], ['pt-br', ptBr]] as const) {
      const empty = leafPaths(catalog).filter((key) => {
        const value = key.split('.').reduce<unknown>((acc, part) => (acc as Tree)[part], catalog);
        return typeof value === 'string' && value.trim() === '';
      });
      expect(empty, lang).toEqual([]);
    }
  });
});

describe('falas dos personagens', () => {
  const fe = falasOf(dialogosEn);
  const fp = falasOf(dialogosPtBr);

  it('os mesmos personagens e as mesmas falas nas duas línguas', () => {
    expect(Object.keys(fp).sort()).toEqual(Object.keys(fe).sort());
    for (const id of Object.keys(fe)) expect(Object.keys(fp[id]).sort(), id).toEqual(Object.keys(fe[id]).sort());
  });

  it('cada fala tem o mesmo número de linhas, com a narração nas mesmas linhas', () => {
    for (const id of Object.keys(fe)) {
      for (const [key, lines] of Object.entries(fe[id])) {
        const other = fp[id][key];
        if (!Array.isArray(lines)) continue;
        expect(Array.isArray(other), `${id}.${key}`).toBe(true);
        const shape = (arr: unknown[]) => arr.map((line) => NARRATOR.test(String(line)));
        expect(shape(other as unknown[]), `${id}.${key}`).toEqual(shape(lines));
      }
    }
  });
});

describe('chaves pedidas pelo código', () => {
  /** Cada chave escrita por extenso no código (as montadas com `${}` ficam de fora). */
  const literalKeys = (): Array<{ fn: string; key: string; file: string }> => {
    const root = path.resolve(here, '..');
    const found: Array<{ fn: string; key: string; file: string }> = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
          const src = readFileSync(full, 'utf8');
          for (const m of src.matchAll(/\b(t|tLines|tWords)\(\s*(['"`])([^'"`$]+)\2/g)) {
            found.push({ fn: m[1], key: m[3], file: path.relative(root, full) });
          }
        }
      }
    };
    walk(root);
    return found;
  };

  it('toda chave escrita no código existe (senão a tela mostra a chave crua)', () => {
    const keys = literalKeys();
    expect(keys.length).toBeGreaterThan(50);
    const missing = keys.filter(({ fn, key }) => {
      if (fn === 't') return t(key) === key;
      if (fn === 'tLines') return tLines(key).length === 0;
      return tWords(key).length === 0;
    });
    expect(missing).toEqual([]);
  });
});
