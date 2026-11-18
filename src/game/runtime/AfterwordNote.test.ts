// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AFTERWORD_BREATH_MS, AfterwordNote } from './AfterwordNote';

// O BILHETE DA MANHÃ SEGUINTE: aparece com o texto, um respiro protege da tecla que já vinha apertada, depois qualquer
// tecla ou toque fecha uma vez só — e a tecla que fecha não chega ao jogo.

let clock = 0;
const now = (): number => clock;
const press = (k = 'z'): KeyboardEvent => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  window.dispatchEvent(ev);
  return ev;
};

describe('AfterwordNote', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    clock = 0;
  });

  it('mostra o texto num papel', () => {
    const note = new AfterwordNote('A aventura principal acabou.', vi.fn(), now);
    expect(document.body.contains(note.element)).toBe(true);
    expect(note.element.textContent).toContain('A aventura principal acabou.');
  });

  it('a tecla do respiro não fecha; depois dele, fecha uma vez só', () => {
    const closed = vi.fn();
    const note = new AfterwordNote('texto', closed, now);
    clock = AFTERWORD_BREATH_MS - 1;
    press();
    expect(closed).not.toHaveBeenCalled();
    expect(document.body.contains(note.element)).toBe(true);
    clock = AFTERWORD_BREATH_MS + 1;
    press();
    press();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(document.body.contains(note.element)).toBe(false);
  });

  it('a tecla que fecha é do bilhete: não chega a quem escuta depois', () => {
    const game = vi.fn();
    window.addEventListener('keydown', game);
    new AfterwordNote('texto', vi.fn(), now);
    clock = AFTERWORD_BREATH_MS + 1;
    const ev = press('ArrowUp');
    expect(ev.defaultPrevented).toBe(true);
    expect(game).not.toHaveBeenCalled();
    window.removeEventListener('keydown', game);
  });

  it('um toque também fecha', () => {
    const closed = vi.fn();
    const note = new AfterwordNote('texto', closed, now);
    clock = AFTERWORD_BREATH_MS + 1;
    note.element.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('desmontado pela cena, some sem avisar e não escuta mais tecla', () => {
    const closed = vi.fn();
    const note = new AfterwordNote('texto', closed, now);
    note.destroy();
    clock = AFTERWORD_BREATH_MS + 1;
    press();
    expect(closed).not.toHaveBeenCalled();
    expect(document.body.contains(note.element)).toBe(false);
  });
});
