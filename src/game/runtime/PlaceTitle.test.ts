// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PLACE_TITLE_TIMES, PlaceTitle } from './PlaceTitle';

// A TIRA ESCRITA À MÃO: aparece, fica e some sozinha, sem tecla nenhuma.

describe('PlaceTitle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('escreve o nome e a linha de baixo, aparece, e some sozinha no fim', () => {
    const gone = vi.fn();
    const title = new PlaceTitle('Recanto da Lua', 'em casa', gone);
    expect(title.element.textContent).toContain('Recanto da Lua');
    expect(title.element.querySelector('.zh-place-sub')?.textContent).toBe('em casa');
    vi.advanceTimersByTime(20);
    expect(title.element.classList.contains('zh-in')).toBe(true);
    vi.advanceTimersByTime(PLACE_TITLE_TIMES.inMs + PLACE_TITLE_TIMES.holdMs);
    expect(title.element.classList.contains('zh-out')).toBe(true);
    expect(gone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(PLACE_TITLE_TIMES.outMs);
    expect(document.body.contains(title.element)).toBe(false);
    expect(gone).toHaveBeenCalledTimes(1);
    expect(title.isGone).toBe(true);
  });

  it('tirada antes da hora, some de uma vez e não volta a avisar', () => {
    const gone = vi.fn();
    const title = new PlaceTitle('Casa', '', gone);
    title.destroy();
    title.destroy();
    vi.advanceTimersByTime(10_000);
    expect(gone).toHaveBeenCalledTimes(1);
    expect(title.element.querySelector('.zh-place-sub')).toBeNull();
  });
});
