// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { LensOverlay, SKY_TARGETS, SkyOverlay } from './SkyOverlays';
import { FireLightOverlay, LOGS_TO_SPLIT, SplitOverlay } from './WoodcraftOverlays';

// OS MINIJOGOS DE OFÍCIO, jogados com o relógio falso: rachar a lenha (mira no veio, longe do nó, com a força
// certa), acender o graveto (três faíscas e sopros calmos; soprar afobado apaga), polir a lente (grosso, depois
// fino, até brilhar) e olhar o céu (mirar cada astro até ele entrar em foco e ler a ficha).

const key = (code: string): void => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true, cancelable: true }));
};
const step = (ms = 16): void => { vi.advanceTimersByTime(ms); };
const until = (done: () => boolean, maxMs = 30_000): void => {
  for (let t = 0; t < maxMs && !done(); t += 16) vi.advanceTimersByTime(16);
  if (!done()) throw new Error('não chegou');
};
type Callback = Mock<(...args: unknown[]) => void>;
const fns = <K extends string>(...names: K[]): Record<K, Callback> =>
  Object.fromEntries(names.map((n) => [n, vi.fn<(...args: unknown[]) => void>()])) as Record<K, Callback>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', 'Date'] });
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

interface SplitInternals { phase: string; aim: number; grainX: number; knotX: number; force: number; crackWide: number; result: string | null }

describe('rachar a lenha', () => {
  it('cada galho (um minijogo por galho): mira no veio e força certa racham de um golpe, e o fim avisa UMA vez', () => {
    const cb = fns('onSplit', 'onDone', 'onLeave', 'onHit', 'onMiss', 'onClean');
    for (let log = 0; log < LOGS_TO_SPLIT; log++) {
      const overlay = new SplitOverlay(cb, log);
      const o = overlay as unknown as SplitInternals;
      // As tolerâncias do jogo: no veio é |mira − veio| < 7 + a largura da rachadura; no nó é |mira − nó| < 7.
      until(() => o.phase === 'aim' && Math.abs(o.aim - o.grainX) < 6 + o.crackWide && Math.abs(o.aim - o.knotX) >= 7.5);
      key('KeyZ');
      expect(o.phase).toBe('force');
      until(() => o.force > 0.7 && o.force < 0.8);
      key('KeyZ');
      until(() => cb.onDone.mock.calls.length > log, 5000);
      step(500);
      overlay.destroy();
    }
    expect(cb.onDone).toHaveBeenCalledTimes(LOGS_TO_SPLIT);
    expect(cb.onSplit).toHaveBeenCalledTimes(LOGS_TO_SPLIT);
    expect(cb.onSplit.mock.calls.every(([clean]) => clean === true)).toBe(true);
    expect(cb.onClean).toHaveBeenCalledTimes(LOGS_TO_SPLIT);
  }, 60_000);

  it('o golpe fora do veio não racha, mas abre a fenda (o próximo tem mais onde entrar)', () => {
    const cb = fns('onSplit', 'onDone', 'onLeave', 'onHit', 'onMiss', 'onClean');
    const overlay = new SplitOverlay(cb, 1);
    const o = overlay as unknown as SplitInternals;
    until(() => o.phase === 'aim' && Math.abs(o.aim - o.grainX) > 14 && Math.abs(o.aim - o.knotX) > 9);
    key('KeyZ');
    until(() => o.force > 0.7 && o.force < 0.8);
    key('KeyZ');
    until(() => o.result !== null, 5000);
    expect(o.result).toBe('offGrain');
    expect(cb.onHit).toHaveBeenCalledOnce();
    expect(o.crackWide).toBe(5);
    overlay.destroy();
  });

  it('acertar o nó não racha (erro), e o ESC sai', () => {
    const cb = fns('onSplit', 'onDone', 'onLeave', 'onHit', 'onMiss', 'onClean');
    const overlay = new SplitOverlay(cb, 2);
    const o = overlay as unknown as SplitInternals;
    until(() => o.phase === 'aim' && Math.abs(o.aim - o.knotX) < 2);
    key('KeyZ');
    until(() => o.force > 0.7 && o.force < 0.8);
    key('KeyZ');
    until(() => o.result !== null, 5000);
    expect(o.result).toBe('knot');
    expect(cb.onMiss).toHaveBeenCalled();
    key('Escape');
    expect(cb.onLeave).toHaveBeenCalledOnce();
  });
});

describe('acender o graveto', () => {
  it('três faíscas, depois sopros calmos: a brasa pega e o fogo acende', () => {
    const cb = fns('onDone', 'onLeave', 'onStrike', 'onBlow', 'onFail', 'onCatch');
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    new FireLightOverlay(cb, canvas);
    step(300);
    for (let i = 0; i < 3; i++) { key('KeyZ'); step(120); }
    expect(cb.onStrike).toHaveBeenCalledTimes(3);
    // Sopros calmos (mais espaçados que o "afobado") até o fogo pegar nas camadas e acender.
    for (let i = 0; i < 200 && cb.onDone.mock.calls.length === 0; i++) { key('KeyZ'); step(450); }
    expect(cb.onCatch).toHaveBeenCalled();
    // O número é o de FALHAS: acendeu de primeira, sem a brasa morrer nenhuma vez.
    expect(cb.onDone).toHaveBeenCalledOnce();
    expect(cb.onDone.mock.calls[0][0]).toBe(0);
    expect(cb.onFail).not.toHaveBeenCalled();
    // E o aviso não se repete com a tela ainda aberta.
    step(3000);
    expect(cb.onDone).toHaveBeenCalledOnce();
  }, 60_000);

  it('soprar afobado apaga a brasa', () => {
    const cb = fns('onDone', 'onLeave', 'onStrike', 'onBlow', 'onFail', 'onCatch');
    const overlay = new FireLightOverlay(cb, document.createElement('canvas'));
    step(300);
    for (let i = 0; i < 3; i++) { key('KeyZ'); step(120); }
    for (let i = 0; i < 40; i++) { key('KeyZ'); step(30); }
    step(4000);
    expect((overlay as unknown as { tooFast: boolean }).tooFast).toBe(true);
    expect(cb.onCatch).not.toHaveBeenCalled();
  });
});

describe('polir a lente', () => {
  it('esfregar a lente inteira, grosso e depois fino, faz o vidro brilhar', () => {
    const cb = fns('onDone', 'onLeave', 'onRub', 'onPhase');
    const overlay = new LensOverlay(cb);
    const o = overlay as unknown as { phase: string; rubTo(x: number, y: number): void };
    step(200);
    for (let pass = 0; pass < 40 && o.phase !== 'shine'; pass++) {
      for (let y = 72 - 56; y <= 72 + 56; y += 3) {
        for (let x = 100 - 56; x <= 100 + 56; x += 6) o.rubTo(x, y);
        step(16);
      }
    }
    expect(o.phase).toBe('shine');
    expect(cb.onRub).toHaveBeenCalled();
    expect(cb.onPhase).toHaveBeenCalled();
    until(() => cb.onDone.mock.calls.length > 0, 10_000);
  });

  it('o Z empurra a pedra de polir (quem não tem mouse também poli)', () => {
    const cb = fns('onDone', 'onLeave', 'onRub', 'onPhase');
    new LensOverlay(cb);
    for (let i = 0; i < 30; i++) { key('KeyZ'); step(60); }
    expect(cb.onRub).toHaveBeenCalled();
  });
});

describe('olhar o céu', () => {
  it('mirar cada astro até focar, ler a ficha, e com os quatro o céu fecha', () => {
    const cb = fns('onFound', 'onDone', 'onLeave', 'onFocus', 'onCard');
    const overlay = new SkyOverlay(cb, []);
    const at: Record<string, { x: number; y: number }> = { moon: { x: 92, y: 212 }, jupiter: { x: 372, y: 66 }, saturn: { x: 66, y: 54 }, pleiades: { x: 342, y: 236 } };
    for (const target of SKY_TARGETS) {
      overlay.aim = { ...at[target] };
      until(() => overlay.reading === target, 5000);
      expect(cb.onCard).toHaveBeenCalled();
      // A pena escreve a ficha; o primeiro Z completa, o seguinte dobra o papel.
      until(() => { key('KeyZ'); step(400); return overlay.reading === null; }, 20_000);
    }
    expect(cb.onFound).toHaveBeenCalledTimes(4);
    expect(new Set(cb.onFound.mock.calls.map(([t]) => t))).toEqual(new Set(SKY_TARGETS));
    until(() => cb.onDone.mock.calls.length > 0, 20_000);
  }, 120_000);

  it('as setas movem a mira, e o ESC sai', () => {
    const cb = fns('onFound', 'onDone', 'onLeave', 'onFocus', 'onCard');
    const overlay = new SkyOverlay(cb, ['moon']);
    const start = { ...overlay.aim };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight', bubbles: true, cancelable: true }));
    step(500);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(overlay.aim.x).toBeGreaterThan(start.x);
    key('Escape');
    expect(cb.onLeave).toHaveBeenCalledOnce();
  });
});
