// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BuildOverlay, type BuildCallbacks, type BuildCellView, type BuildView } from './BuildOverlay';

// O MODO DE CONSTRUÇÃO NA TELA: as cartas do que dá para pôr, a grade; escolher uma carta e um tile verde põe a peça;
// clicar numa peça posta a levanta; X larga o que está na mão e, de mão vazia, fecha; nenhuma tecla chega ao jogo. A
// grade é desenhada no mundo por quem abriu (`paint`): a tela diz o tile apontado e a peça na mão.

const cell = (x: number, y: number, state: BuildCellView['state']): BuildCellView => ({ x, y, state });

const press = (key: string): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
};

const setup = () => {
  let holding: string | null = null;
  const cells = [cell(1, 1, 'free'), cell(2, 1, 'grass'), cell(3, 1, 'piece')];
  const view = (): BuildView => ({
    title: 'Construir',
    stock: [{ icon: '', label: 'Graveto', count: 2 }],
    cards: [
      { kind: 'log', icon: '', name: 'Tronco', needs: [{ icon: '', label: 'Graveto', need: 2, have: 2 }], gift: false, state: 'ready', next: false },
      { kind: 'tub', icon: '', name: 'Tina de tingir', needs: [{ icon: '', label: 'Graveto', need: 3, have: 2 }], gift: false, state: 'lacking', next: true },
    ],
    cells,
    holding: holding ? { kind: holding, icon: '' } : null,
    texts: { choose: 'c', place: 'p', move: 'm', empty: 'e', gift: 'g', scrap: 'Desmontar', back: 'Voltar', done: 'Pronto' },
  });
  const cb: BuildCallbacks = {
    read: view,
    tileAt: (px, py) => ({ x: Math.floor(px / 10), y: Math.floor(py / 10) }),
    paint: vi.fn(),
    pick: vi.fn((kind: string) => { if (kind !== 'log') return false; holding = kind; return true; }),
    lift: vi.fn((x: number, y: number) => { if (x !== 3 || y !== 1) return false; holding = 'tub'; return true; }),
    place: vi.fn((x: number, y: number) => { if (x !== 1 || y !== 1 || !holding) return false; holding = null; return true; }),
    drop: vi.fn(() => { holding = null; }),
    scrap: vi.fn(() => { if (!holding) return false; holding = null; return true; }),
    refuse: vi.fn(),
    close: vi.fn(),
  };
  let clock = 0;
  const overlay = new BuildOverlay(cb, () => clock);
  clock = 1000;
  return { overlay, cb };
};

describe('BuildOverlay', () => {
  const opened: BuildOverlay[] = [];
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { for (const o of opened.splice(0)) o.destroy(); });
  const open = () => {
    const s = setup();
    opened.push(s.overlay);
    return s;
  };

  it('mostra uma carta por peça, com o preço, e marca o que falta', () => {
    const { overlay } = open();
    const cards = overlay.element.querySelectorAll<HTMLElement>('.zh-build-card');
    expect([...cards].map((c) => c.dataset.kind)).toEqual(['log', 'tub']);
    expect(cards[1].dataset.state).toBe('lacking');
    expect(cards[1].querySelector('.needs span.lack')).not.toBeNull();
    expect(overlay.element.querySelector('.zh-build-stock')?.textContent).toContain('2');
  });

  it('pelo teclado: Z pega a carta, as setas andam na grade, Z põe no tile verde', () => {
    const { overlay, cb } = open();
    press('z');
    expect(cb.pick).toHaveBeenCalledWith('log');
    expect(overlay.state).toMatchObject({ mode: 'place', tile: { x: 1, y: 1 } });
    press('z');
    expect(cb.place).toHaveBeenCalledWith(1, 1);
    expect(overlay.state.mode).toBe('choose');
  });

  it('a grade vai para o mundo: o tile apontado e a peça na mão, a cada gesto', () => {
    const { overlay, cb } = open();
    overlay.pick('log');
    expect(cb.paint).toHaveBeenLastCalledWith(expect.any(Array), { x: 1, y: 1 }, 'log');
    press('ArrowRight');
    expect(cb.paint).toHaveBeenLastCalledWith(expect.any(Array), { x: 2, y: 1 }, 'log');
    press('x');
    expect(cb.paint).toHaveBeenLastCalledWith(expect.any(Array), expect.anything(), null);
  });

  it('a carta sem material treme e não vai para a mão', () => {
    const { overlay, cb } = open();
    press('ArrowRight');
    press('z');
    expect(cb.pick).toHaveBeenCalledWith('tub');
    expect(cb.refuse).toHaveBeenCalled();
    expect(overlay.state.mode).toBe('choose');
  });

  it('no mato alto não se põe: recusa, e a peça continua na mão', () => {
    const { overlay, cb } = open();
    overlay.pick('log');
    overlay.act(2, 1);
    expect(cb.refuse).toHaveBeenCalled();
    expect(overlay.state.mode).toBe('place');
  });

  it('clicar numa peça posta a levanta para mudar de lugar; X a devolve', () => {
    const { overlay, cb } = open();
    overlay.act(3, 1);
    expect(cb.lift).toHaveBeenCalledWith(3, 1);
    expect(overlay.state.mode).toBe('place');
    press('x');
    expect(cb.drop).toHaveBeenCalled();
    expect(overlay.state.mode).toBe('choose');
  });

  it('de mão vazia o X fecha, e nenhuma tecla chega ao jogo', () => {
    const { overlay, cb } = open();
    const game = vi.fn();
    window.addEventListener('keydown', game);
    press('ArrowLeft');
    press('x');
    window.removeEventListener('keydown', game);
    expect(game).not.toHaveBeenCalled();
    expect(cb.close).toHaveBeenCalledTimes(1);
    expect(document.body.contains(overlay.element)).toBe(false);
  });

  it('a peça levantada se desmonta (Delete ou o botão, que só aparece com ela na mão), e a mão esvazia', () => {
    const { overlay, cb } = open();
    const scrapButton = (): HTMLButtonElement => [...overlay.element.querySelectorAll<HTMLButtonElement>('.zh-build-foot button')]
      .find((b) => b.textContent === 'Desmontar')!;
    expect(scrapButton().hidden).toBe(true);
    press('Delete');
    expect(cb.refuse).toHaveBeenCalledTimes(1);
    overlay.act(3, 1);
    expect(scrapButton().hidden).toBe(false);
    press('Delete');
    expect(cb.scrap).toHaveBeenCalledTimes(1);
    expect(overlay.state).toMatchObject({ mode: 'choose', tile: null });
    expect(scrapButton().hidden).toBe(true);
    expect(cb.close).not.toHaveBeenCalled();
  });

  it('apontando a grade pelas setas, o X volta às cartas; com o mouse só passando por cima, o X fecha de uma vez', () => {
    const keys = open();
    press('ArrowUp');
    expect(keys.overlay.state.tile).toEqual({ x: 1, y: 1 });
    press('x');
    expect(keys.overlay.state.tile).toBeNull();
    expect(keys.cb.close).not.toHaveBeenCalled();
    keys.overlay.close();
    const mouse = open();
    mouse.overlay.element.querySelector('.zh-build-hit')!.dispatchEvent(new MouseEvent('pointermove', { clientX: 15, clientY: 15, bubbles: true }));
    expect(mouse.overlay.state.tile).toEqual({ x: 1, y: 1 });
    press('x');
    expect(mouse.cb.close).toHaveBeenCalledTimes(1);
  });

  it('fechar com algo na mão o larga antes', () => {
    const { overlay, cb } = open();
    overlay.pick('log');
    overlay.close();
    expect(cb.drop).toHaveBeenCalled();
    expect(cb.close).toHaveBeenCalled();
  });
});
