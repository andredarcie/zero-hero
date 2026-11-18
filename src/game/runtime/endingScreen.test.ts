import { describe, expect, it } from 'vitest';

import en from '@/game/i18n/locales/en.json';
import ptBr from '@/game/i18n/locales/pt-br.json';
import { ENDING_SCREEN, splitEpigraph } from './endingScreen';

// A TELA DO FIM: a frase, o resto dela apagando devagar, as pequenas coisas sozinhas um tempo, o "Fim" e os nomes —
// nessa ordem, sem nada se atropelar; e a frase de cada língua com um destaque só.

const S = ENDING_SCREEN;

describe('a ordem da tela do fim', () => {
  it('a frase vem depois do escuro e é lida inteira antes de o resto apagar', () => {
    expect(S.phraseIn).toBeGreaterThanOrEqual(2400); // o escuro dos créditos leva 2,4 s
    expect(S.restOut - (S.phraseIn + S.phraseInMs)).toBeGreaterThanOrEqual(4000);
  });

  it('o resto apaga devagar, e as pequenas coisas ficam sozinhas um tempo antes de apagar', () => {
    expect(S.restOutMs).toBeGreaterThanOrEqual(3000);
    expect(S.smallOut - (S.restOut + S.restOutMs)).toBeGreaterThanOrEqual(3000);
  });

  it('o "Fim" só vem com as pequenas coisas já apagadas, e os nomes só depois do "Fim"', () => {
    expect(S.theEnd).toBeGreaterThanOrEqual(S.smallOut + S.smallOutMs);
    expect(S.roll).toBeGreaterThanOrEqual(S.theEnd + S.theEndMs);
  });
});

describe('a frase das pequenas coisas', () => {
  it('o trecho entre asteriscos é o destaque, o resto é comum', () => {
    expect(splitEpigraph('sobre *pequenas coisas*.')).toEqual([
      { text: 'sobre ', strong: false },
      { text: 'pequenas coisas', strong: true },
      { text: '.', strong: false },
    ]);
  });

  it('sem asterisco, a frase inteira é comum', () => {
    expect(splitEpigraph('só a frase')).toEqual([{ text: 'só a frase', strong: false }]);
  });

  it.each([
    ['pt-br', ptBr.ending.epigraph, 'pequenas coisas'],
    ['en', en.ending.epigraph, 'small things'],
  ])('em %s, um destaque só, e é ele', (_lang, text, small) => {
    const strong = splitEpigraph(text).filter((p) => p.strong);
    expect(strong.map((p) => p.text)).toEqual([small]);
  });
});
