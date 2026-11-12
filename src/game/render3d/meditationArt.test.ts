import { describe, expect, it } from 'vitest';

import en from '@/game/i18n/locales/en.json';
import ptBr from '@/game/i18n/locales/pt-br.json';
import { THOUGHT_KINDS } from '@/game/runtime/meditation';
import { paintCairn, paintMeditationSeat } from './meditationArt';

// A PEDRA DE MEDITAR: a arte cabe no quadro de 16×16 e tem a cor do pano; e os textos da meditação existem nas duas
// línguas, com uma fonte para cada nota do caderno.

const paint = (fn: typeof paintCairn): Map<string, string> => {
  const px = new Map<string, string>();
  fn((color, x, y, w, h) => {
    for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) px.set(`${x + i},${y + j}`, color);
  });
  return px;
};

describe('a pedra de meditar', () => {
  it('as duas peças cabem no quadro e ficam assentadas no chão (a última linha desenhada é a de baixo)', () => {
    for (const fn of [paintMeditationSeat, paintCairn]) {
      const px = paint(fn);
      const coords = [...px.keys()].map((k) => k.split(',').map(Number));
      expect(coords.every(([x, y]) => x >= 0 && x < 16 && y >= 0 && y < 16)).toBe(true);
      expect(Math.max(...coords.map(([, y]) => y))).toBeGreaterThanOrEqual(14);
    }
  });

  it('a almofada é de pano azul (de palha, marrom em cima da pedra, ela lia como um chapéu)', () => {
    expect([...paint(paintMeditationSeat).values()]).toContain('#557998');
  });
});

describe('os textos da meditação', () => {
  const lookup = (root: unknown, key: string): unknown => key.split('.')
    .reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), root);

  it('cada nota do caderno tem a fonte dela, nas duas línguas, na mesma ordem', () => {
    const facts = (lang: unknown) => lookup(lang, 'meditation.facts') as string[];
    const sources = (lang: unknown) => lookup(lang, 'meditation.sources') as string[];
    for (const lang of [en, ptBr]) {
      expect(facts(lang).length).toBeGreaterThanOrEqual(10);
      expect(sources(lang)).toHaveLength(facts(lang).length);
      expect(facts(lang).every((f) => f.length > 20 && f.length < 200)).toBe(true);
    }
    expect(facts(en)).toHaveLength(facts(ptBr).length);
    // As fontes são as mesmas obras: o ano de cada uma bate entre as línguas.
    const years = (lang: unknown) => sources(lang).map((s) => /\d{4}/u.exec(s)?.[0]);
    expect(years(en)).toEqual(years(ptBr));
  });

  it('cada tipo de pensamento tem o nome que o herói dá a ele, e as legendas existem', () => {
    for (const lang of [en, ptBr]) {
      for (const kind of THOUGHT_KINDS) expect(typeof lookup(lang, `meditation.labels.${kind}`)).toBe('string');
      for (const step of ['breath', 'notice']) {
        expect(lookup(lang, `minigame.meditation.${step}.keys`)).toMatch(/\{/u);
        expect(typeof lookup(lang, `minigame.meditation.${step}.touch`)).toBe('string');
      }
      expect(lookup(lang, 'actions.meditate')).toBeTruthy();
    }
  });
});
