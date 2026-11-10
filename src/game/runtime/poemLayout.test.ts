import { describe, expect, it } from 'vitest';

import { RHYME_PAUSE_MS, VERSE_PAUSE_MS, isIndentedVerse, versePauseAfter } from './poemLayout';

// A CAIXA DO POEMA: na quadra, recuam e esperam o 2º e o 4º versos (os que rimam); o dístico não recua.

describe('a diagramação do poema', () => {
  it('na quadra, só o 2º e o 4º recuam; no dístico, nenhum', () => {
    expect([0, 1, 2, 3].map((row) => isIndentedVerse(4, row))).toEqual([false, true, false, true]);
    expect([0, 1].map((row) => isIndentedVerse(2, row))).toEqual([false, false]);
  });

  it('a datilografia respira no fim de cada verso, mais depois do verso que rima no meio, e nada no último', () => {
    expect([0, 1, 2, 3].map((row) => versePauseAfter(4, row))).toEqual([
      VERSE_PAUSE_MS, VERSE_PAUSE_MS + RHYME_PAUSE_MS, VERSE_PAUSE_MS, 0,
    ]);
    expect([0, 1].map((row) => versePauseAfter(2, row))).toEqual([VERSE_PAUSE_MS, 0]);
  });
});
