import { describe, expect, it } from 'vitest';

import dialogosEn from './dialogos/en.json';
import dialogosPtBr from './dialogos/pt-br.json';
import { rhyme, scan } from './metrica';

// AS FALAS EM VERSO (pedido do autor: todas as falas do jogo em poema rimado). O PADRÃO DE ESCRITA (clareza acima da
// rima, ordem direta, palavras do dia a dia) está em docs/escrita-em-verso.md; daqui se cobra só a forma, que mora no
// `_verso` do dialogos/pt-br.json: UMA ESTROFE POR CAIXA — a quadra (`estrofe` versos, os de `rimam` rimando) ou, na
// fala curta e na caixa de um falante só (o narrador e o mago se alternam na abertura), o dístico que rima consigo
// mesmo. "\n" separa os versos dentro da caixa; cada verso tem de `metro.min` a `metro.max` sílabas poéticas (ver
// metrica): o ritmo da fala, não uma contagem exata. O inglês é outro poema (a rima não se traduz) e se confere de
// ouvido: daqui só se cobra que ele tenha os mesmos versos em cada caixa.
//
// A rima é conferida pela GRAFIA (metrica.rhyme): o timbre (é aberto, ê fechado; ó, ô) fica com quem lê em voz alta —
// "colher/quiser", "seco/eco", "calor/redor" e "cor/melhor" passavam aqui e não rimavam de ouvido (corrigidas).

type Tree = Record<string, unknown>;
type VerseRule = { metro: { min: number; max: number }; estrofe: number; rimam: number[] };
const NARRATOR = /^\[(narrador|narrator)\] /u;
/** Os NPCs de uma versão antiga, que não estão no mundo. */
const OUT_OF_GAME = new Set(['fora_do_jogo']);
/** O {n} vira número no jogo: de 1 a 4, e "quatro" tem uma sílaba a mais que "um", "dois" e "três". */
const NUMBERS = ['dois', 'quatro'];

/** Cada fala (a lista de caixas) de uma seção, pelo caminho que o código pede; a fala de uma caixa só também conta. */
const falas = (node: unknown, at = ''): Array<[string, string[]]> => {
  if (typeof node === 'string') return [[at, [node]]];
  if (Array.isArray(node)) return [[at, node.map(String)]];
  if (node && typeof node === 'object') {
    return Object.entries(node as Tree)
      .filter(([k]) => k !== 'name')
      .flatMap(([k, v]) => falas(v, at ? `${at}.${k}` : k));
  }
  return [];
};

const pt = dialogosPtBr as unknown as Record<string, Tree>;
const en = dialogosEn as unknown as Record<string, Tree>;
const rule = (dialogosPtBr as unknown as { _verso: VerseRule })._verso;
const sections = Object.entries(pt).filter(([id, s]) => !id.startsWith('_') && !OUT_OF_GAME.has(id) && s && typeof s === 'object');
const versesOf = (box: string): string[] => box.replace(NARRATOR, '').split('\n');

describe('as falas em verso', () => {
  it('todo personagem fala em verso', () => {
    expect(sections.map(([id]) => id)).toEqual(expect.arrayContaining(['mago', 'morte', 'gato', 'narrador', 'fim']));
  });

  it('cada verso cabe no metro', () => {
    const problems: string[] = [];
    const { min: shortest, max: longest } = rule.metro;
    for (const [id, section] of sections) {
      for (const [path, boxes] of falas(section.falas)) {
        boxes.flatMap(versesOf).forEach((verse, i) => {
          for (const said of verse.includes('{n}') ? NUMBERS.map((n) => verse.replace('{n}', n)) : [verse]) {
            const { min, max } = scan(said);
            if (max < shortest || min > longest) {
              problems.push(`${id}/${path}, verso ${i + 1} "${said}": ${min === max ? min : `${min} a ${max}`} sílabas, pede ${shortest} a ${longest}`);
            }
          }
        });
      }
    }
    expect(problems).toEqual([]);
  });

  it('uma estrofe por caixa, que rima dentro dela: a quadra (o 2º com o 4º) ou o dístico (os dois)', () => {
    const problems: string[] = [];
    const pairUp = (a: string, b: string, at: string): void => {
      const [x, y] = [rhyme(a), rhyme(b)];
      if (x.key !== y.key) problems.push(`${at}: "${x.word}" não rima com "${y.word}"`);
      else if (x.word === y.word) problems.push(`${at}: "${x.word}" rima com ela mesma`);
    };
    for (const [id, section] of sections) {
      for (const [path, boxes] of falas(section.falas)) {
        boxes.forEach((box, i) => {
          const verses = versesOf(box);
          const at = `${id}/${path}, caixa ${i + 1}`;
          if (verses.length === rule.estrofe) {
            const [first, ...rest] = rule.rimam.map((n) => verses[n - 1]);
            for (const other of rest) pairUp(first, other, `${at} (quadra)`);
          } else if (verses.length === 2) {
            pairUp(verses[0], verses[1], `${at} (dístico)`);
          } else {
            problems.push(`${at}: ${verses.length} versos (a caixa é uma quadra ou um dístico)`);
          }
        });
      }
    }
    expect(problems).toEqual([]);
  });

  it('o inglês tem os mesmos versos em cada caixa', () => {
    for (const [id, section] of sections) {
      const english = new Map(falas(en[id]?.falas));
      for (const [path, boxes] of falas(section.falas)) {
        const lines = (list: string[]): number[] => list.map((box) => box.split('\n').length);
        expect(lines(english.get(path) ?? []), `${id}/${path}`).toEqual(lines(boxes));
      }
    }
  });
});
