// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { t, tLines } from '@/game/i18n/i18n';
import { CREDITS_SCROLL_MS, CreditsRoll } from './CreditsRoll';
import { ENDING_SCREEN, splitEpigraph } from './endingScreen';

// OS CRÉDITOS, assistidos: o escuro, a frase das pequenas coisas (o resto apagando, elas sozinhas, elas apagando), o
// "The End", os nomes subindo, e `onDone` — sozinho no fim, ou por uma tecla depois que os nomes começam a subir
// (antes disso a tecla não faz nada). O relógio é falso.

const S = ENDING_SCREEN;
const key = (): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', key: 'z', bubbles: true, cancelable: true }));
};
const epigraphOf = (roll: CreditsRoll): HTMLElement => roll.element.querySelector<HTMLElement>('.zh-credits-epigraph')!;
const endOf = (roll: CreditsRoll): HTMLElement => roll.element.querySelector<HTMLElement>('.zh-credits-end')!;
const spans = (roll: CreditsRoll, strong: boolean): HTMLElement[] =>
  Array.from(epigraphOf(roll).querySelectorAll<HTMLElement>(strong ? 'span[data-strong]' : 'span:not([data-strong])'));

describe('CreditsRoll', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] });
    document.body.innerHTML = '';
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a frase aparece, o resto apaga e só as pequenas coisas ficam, e então o "Fim"', () => {
    const roll = new CreditsRoll(vi.fn());
    const strong = spans(roll, true);
    expect(strong.map((s) => s.textContent)).toEqual(splitEpigraph(t('ending.epigraph')).filter((p) => p.strong).map((p) => p.text));
    expect(strong[0].style.fontWeight).toBe('700');
    // Escuro: nada escrito ainda.
    vi.advanceTimersByTime(S.phraseIn - 10);
    expect(epigraphOf(roll).style.opacity).toBe('0');
    // A frase inteira.
    vi.advanceTimersByTime(20);
    expect(epigraphOf(roll).style.opacity).toBe('1');
    expect(spans(roll, false).every((s) => s.style.opacity !== '0')).toBe(true);
    // O resto apaga; as pequenas coisas não.
    vi.advanceTimersByTime(S.restOut - S.phraseIn);
    expect(spans(roll, false).every((s) => s.style.opacity === '0')).toBe(true);
    expect(strong.every((s) => s.style.opacity !== '0')).toBe(true);
    expect(endOf(roll).style.opacity).toBe('0');
    // Elas apagam, e só depois o "Fim".
    vi.advanceTimersByTime(S.smallOut - S.restOut);
    expect(epigraphOf(roll).style.opacity).toBe('0');
    expect(endOf(roll).style.opacity).toBe('0');
    vi.advanceTimersByTime(S.theEnd - S.smallOut);
    expect(endOf(roll).textContent).toBe(t('ending.theEnd'));
    expect(endOf(roll).style.opacity).toBe('1');
  });

  it('cada vizinho com o que faz, numa linha só dele', () => {
    const lines = tLines('ending.credits').map((l) => l.text);
    for (const name of ['Shui', 'Sisi', 'Marco', 'Thea', 'Sati']) {
      expect(lines.some((l) => new RegExp(`\\b${name}, `, 'u').test(l))).toBe(true);
    }
  });

  it('os créditos têm a seção de quem testou e validou o jogo, com os cinco nomes', () => {
    const roll = new CreditsRoll(vi.fn());
    const text = roll.element.querySelector('.zh-credits-roll')!.textContent ?? '';
    for (const name of ['Adriel Carvalho', 'Eric Góes', 'Geovani Darcie', 'Diego Penha', 'Rodrigo Alister']) {
      expect(text).toContain(name);
    }
    const lines = tLines('ending.credits').map((l) => l.text);
    expect(lines.indexOf('Adriel Carvalho')).toBeGreaterThan(lines.findIndex((l) => /validado|playtested/u.test(l)));
  });

  it('escurece e só aceita a tecla quando os nomes começam a subir', () => {
    const done = vi.fn();
    const roll = new CreditsRoll(done);
    expect(document.body.contains(roll.element)).toBe(true);
    vi.advanceTimersByTime(20);
    expect(roll.element.style.opacity).toBe('1');
    // Na frase e no "Fim": a tecla é ignorada.
    vi.advanceTimersByTime(S.roll - 500);
    key();
    vi.advanceTimersByTime(2000);
    expect(done).not.toHaveBeenCalled();
    // Os nomes subindo: agora a tecla pula, a tela some e `onDone` roda uma vez só.
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
    vi.advanceTimersByTime(S.roll + CREDITS_SCROLL_MS);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500 + 1200 + 10);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('tirada antes da hora, não chama `onDone` nem escuta mais tecla', () => {
    const done = vi.fn();
    const roll = new CreditsRoll(done);
    vi.advanceTimersByTime(S.roll + 1000);
    roll.remove();
    expect(document.body.contains(roll.element)).toBe(false);
    key();
    vi.advanceTimersByTime(90_000);
    expect(done).not.toHaveBeenCalled();
  });
});
