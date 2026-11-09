// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { t } from '@/game/i18n/i18n';
import { CREDITS_SCROLL_MS, CreditsRoll } from './CreditsRoll';

// OS CRÉDITOS, assistidos: o escuro, o "The End", os nomes subindo, e o título de volta — sozinho no fim, ou por
// uma tecla depois que os nomes começam a subir (antes disso a tecla não faz nada). O relógio é falso.

const key = (): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'z', bubbles: true, cancelable: true }));
};

describe('CreditsRoll', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] });
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('escurece, assenta o "The End" e só depois aceita a tecla', () => {
    const done = vi.fn();
    const roll = new CreditsRoll(done);
    expect(document.body.contains(roll.element)).toBe(true);
    expect(roll.element.textContent).toContain(t('ending.theEnd'));
    vi.advanceTimersByTime(20);
    expect(roll.element.style.opacity).toBe('1');
    // Cedo demais: a tecla é ignorada.
    vi.advanceTimersByTime(3000);
    key();
    vi.advanceTimersByTime(2000);
    expect(done).not.toHaveBeenCalled();
    // Os nomes sobem: agora a tecla pula, a tela some e o título volta uma vez só.
    vi.advanceTimersByTime(3000);
    key();
    key();
    expect(roll.element.style.opacity).toBe('0');
    vi.advanceTimersByTime(1500);
    expect(done).toHaveBeenCalledTimes(1);
    expect(document.body.contains(roll.element)).toBe(false);
  });

  it('sem tecla nenhuma, acaba sozinha depois que os nomes passam', () => {
    const done = vi.fn();
    new CreditsRoll(done);
    vi.advanceTimersByTime(7200 + CREDITS_SCROLL_MS);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500 + 1200 + 10);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('tirada antes da hora, não volta ao título nem escuta mais tecla', () => {
    const done = vi.fn();
    const roll = new CreditsRoll(done);
    vi.advanceTimersByTime(8000);
    roll.remove();
    expect(document.body.contains(roll.element)).toBe(false);
    key();
    vi.advanceTimersByTime(60_000);
    expect(done).not.toHaveBeenCalled();
  });
});
