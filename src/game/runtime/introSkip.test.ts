import { describe, expect, it } from 'vitest';

import { INTRO_SKIP_GAP_MS, INTRO_SKIP_WINDOW_MS, IntroSkipGate } from './introSkip';

describe('IntroSkipGate', () => {
  it('o primeiro toque só mostra a tarja; o segundo, depois do respiro, pula', () => {
    let now = 1000;
    const gate = new IntroSkipGate(() => now);
    expect(gate.press()).toBe('hint');
    now += INTRO_SKIP_GAP_MS - 1;
    expect(gate.press()).toBe('wait'); // o toque duplo sem querer
    now += 1;
    expect(gate.press()).toBe('skip');
  });

  it('passada a janela da tarja, o toque volta a ser o primeiro', () => {
    let now = 0;
    const gate = new IntroSkipGate(() => now);
    expect(gate.press()).toBe('hint');
    now += INTRO_SKIP_WINDOW_MS;
    expect(gate.press()).toBe('hint');
    now += INTRO_SKIP_GAP_MS;
    expect(gate.press()).toBe('skip');
  });
});
