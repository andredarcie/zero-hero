// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLOTH_DYES } from './homeState';
import { DyeCard } from './DyeCard';

// A TINA ABERTA: duas fileiras de amostras (capa e manta), só com as cores que a tina já tem; as setas andam, o Z
// mergulha, o X fecha; nenhuma tecla chega ao jogo; o toque na amostra já tinge.

const press = (key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  window.dispatchEvent(event);
  return event;
};

describe('DyeCard', () => {
  let clock = 0;
  const now = (): number => clock;
  const opened: DyeCard[] = [];
  // O PRIMEIRO cartão paga sozinho o papel da interface (desenhado em canvas, uma vez por arquivo): com a máquina
  // ocupada isso passava dos 5 s e o 1º teste caía por tempo, de vez em quando (o mesmo do NameCard.test). Pago aqui.
  beforeAll(() => {
    new DyeCard({ dyes: CLOTH_DYES, worn: { cape: 'natural', blanket: 'natural' }, touch: false },
      { onDye: () => {}, onClose: () => {} }, () => 0).destroy();
  }, 30000);
  beforeEach(() => {
    document.body.innerHTML = '';
    clock = 0;
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });
  });
  afterEach(() => {
    for (const card of opened.splice(0)) card.destroy();
    vi.useRealTimers();
  });

  const open = (dyes = CLOTH_DYES) => {
    const onDye = vi.fn();
    const onClose = vi.fn();
    const card = new DyeCard({ dyes, worn: { cape: 'natural', blanket: 'natural' }, touch: false }, { onDye, onClose }, now);
    opened.push(card);
    clock = 1000;
    return { card, onDye, onClose };
  };

  it('mostra a capa e a manta, cada uma com as cores que a tina tem, e marca o que cada pano veste', () => {
    const { card } = open(['natural', 'anil']);
    const rows = card.element.querySelectorAll('.zh-dye-row');
    expect(rows).toHaveLength(2);
    for (const row of rows) expect([...row.querySelectorAll<HTMLElement>('.zh-dye-swatch')].map((s) => s.dataset.dye)).toEqual(['natural', 'anil']);
    expect(card.element.querySelectorAll('[data-worn]')).toHaveLength(2);
  });

  it('as setas andam pela fileira e trocam de pano; o Z mergulha o pano na cor do cursor', () => {
    const { card, onDye } = open();
    press('ArrowRight');
    press('ArrowRight');
    expect(card.cursor).toEqual({ target: 'cape', dye: CLOTH_DYES[2] });
    press('z');
    expect(onDye).toHaveBeenCalledWith('cape', CLOTH_DYES[2]);
    press('ArrowDown');
    expect(card.cursor.target).toBe('blanket');
    press('ArrowLeft');
    press('Enter');
    expect(onDye).toHaveBeenLastCalledWith('blanket', CLOTH_DYES[CLOTH_DYES.length - 1]);
  });

  it('mergulhar na cor que o pano já veste não tinge de novo', () => {
    const { onDye } = open();
    press('z');
    expect(onDye).not.toHaveBeenCalled();
  });

  it('o toque na amostra já tinge', () => {
    const { card, onDye } = open();
    const swatch = card.element.querySelector<HTMLElement>('[data-target="blanket"] [data-dye="garanca"]')!;
    swatch.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    expect(onDye).toHaveBeenCalledWith('blanket', 'garanca');
  });

  it('o X fecha uma vez, e a tecla que abriu a tina não a fecha no mesmo instante', () => {
    const onClose = vi.fn();
    const card = new DyeCard({ dyes: CLOTH_DYES, worn: { cape: 'natural', blanket: 'natural' }, touch: false }, { onDye: vi.fn(), onClose }, now);
    press('x');
    expect(onClose).not.toHaveBeenCalled();
    clock = 1000;
    press('x');
    press('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.body.contains(card.element)).toBe(false);
  });

  it('nenhuma tecla com a tina aberta chega ao jogo', () => {
    open();
    const game = vi.fn();
    window.addEventListener('keydown', game);
    press('ArrowUp');
    press('z');
    window.removeEventListener('keydown', game);
    expect(game).not.toHaveBeenCalled();
  });
});
