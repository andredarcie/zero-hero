import { describe, expect, it } from 'vitest';

import { MUSHROOM_KINDS } from '@/game/fungi/fungi';
import en from '@/game/i18n/locales/en.json';
import ptBr from '@/game/i18n/locales/pt-br.json';
import { Inventory } from './Inventory';
import { NOTEBOOK, notebookEntries } from './notebook';
import { ANIMALS } from './sketches';

// O CADERNO DE CAMPO DO ACAMPAMENTO: a coleção de tudo que o herói já pegou, com o vulto do que falta.

const kinds = NOTEBOOK.flatMap((s) => s.kinds);
const lookup = (root: unknown, key: string): unknown => key.split('.')
  .reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), root);

describe('o caderno de campo', () => {
  it('cada coisa tem uma página só, e todos os cogumelos estão lá', () => {
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const kind of MUSHROOM_KINDS) expect(kinds).toContain(kind);
  });

  it('o que não se consegue no vale não entra (uma página que nunca se enche seria promessa falsa)', () => {
    for (const kind of ['sword', 'stool', 'lantern', 'flowerPot', 'furnace', 'altar', 'bucketFull']) expect(kinds).not.toContain(kind);
  });

  it('cada página tem nome e nota nas duas línguas', () => {
    for (const lang of [en, ptBr]) {
      for (const kind of kinds) {
        const animal = (ANIMALS as readonly string[]).includes(kind);
        const name = animal ? `sketch.animals.${kind}.name` : `items.name.${kind}`;
        expect(typeof lookup(lang, name), `${kind}: nome`).toBe('string');
        const note = animal ? `sketch.animals.${kind}.fact`
          : MUSHROOM_KINDS.includes(kind as never) ? `fungi.species.${kind}.curiosity` : `notebook.entry.${kind}`;
        expect(typeof lookup(lang, note), `${kind}: nota`).toBe('string');
        if (animal) expect(typeof lookup(lang, `sketch.animals.${kind}.latin`), `${kind}: nome científico`).toBe('string');
      }
      for (const { section } of NOTEBOOK) expect(typeof lookup(lang, `notebook.sections.${section}`)).toBe('string');
    }
  });

  it('achado = passou pelas mãos ou teve a cerimônia; o balde cheio conta como o balde', () => {
    const entries = notebookEntries(new Set(['porcini']), new Set(['axe', 'bucketFull']), new Map());
    const known = entries.filter((e) => e.known).map((e) => e.kind).sort();
    expect(known).toEqual(['axe', 'bucket', 'porcini']);
    expect(entries).toHaveLength(kinds.length);
  });

  it('o bicho entra no caderno com o desenho pronto; pela metade, ele guarda quanto já foi desenhado', () => {
    const entries = notebookEntries(new Set(), new Set(), new Map([['hare', 1], ['koi', 0.4]]));
    const page = (kind: string) => entries.find((e) => e.kind === kind);
    expect(page('hare')).toMatchObject({ section: 'animals', known: true, sketch: 1 });
    expect(page('koi')).toMatchObject({ known: false, sketch: 0.4 });
    expect(page('cat')).toMatchObject({ known: false, sketch: 0 });
  });

  it('a mochila avisa o caderno de tudo que entra nela, e só do que entra', () => {
    const got: string[] = [];
    const inventory = new Inventory((kind) => got.push(kind));
    inventory.add('stone');
    inventory.add('wood'); // material sobre material: recusado, não passou pelas mãos
    inventory.add('axe');
    expect(got).toEqual(['stone', 'axe']);
  });
});
