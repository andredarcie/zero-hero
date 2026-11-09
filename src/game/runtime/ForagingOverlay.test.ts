// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MUSHROOM_KINDS } from '@/game/fungi/fungi';
import { ForagingOverlay, type ForagingCallbacks } from './ForagingOverlay';

// A COLHEITA (o minijogo dos cogumelos), jogada: a faca vai e volta; o Z fora da faixa erra, dentro dela corta; a
// bucha tira a terra; o cogumelo brilha, vai para as costas, e a ficha abre — e só fecha no Z ou no ESC. Sair antes
// do corte deixa o cogumelo no chão. O relógio é falso: o teste anda o tempo quadro a quadro.

interface ForagingInternals {
  stage: string;
  knifeY: number;
  zoneTop: number;
  zoneBottom: number;
  dirt: Array<string | null>;
  scrubTo(x: number, y: number): void;
}

const callbacks = (): ForagingCallbacks & Record<string, ReturnType<typeof vi.fn>> => ({
  onMiss: vi.fn(), onCut: vi.fn(), onSand: vi.fn(), onClean: vi.fn(), onStash: vi.fn(), onNote: vi.fn(), onDone: vi.fn(), onCancel: vi.fn(),
});
const key = (code: string, type: 'keydown' | 'keyup' = 'keydown'): void => {
  window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Escape' ? 'Escape' : 'z', bubbles: true, cancelable: true }));
};
const advance = (ms: number): void => {
  for (let t = 0; t < ms; t += 16) vi.advanceTimersByTime(16);
};
const until = (done: () => boolean, maxMs = 20_000): void => {
  for (let t = 0; t < maxMs && !done(); t += 16) vi.advanceTimersByTime(16);
  if (!done()) throw new Error('não chegou');
};
const inZone = (o: ForagingInternals): boolean => {
  const mid = (o.zoneTop + o.zoneBottom) / 2;
  return Math.abs(o.knifeY - mid) < (o.zoneBottom - o.zoneTop) * 0.3;
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', 'Date'] });
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('a colheita', () => {
  it('erra fora da faixa, corta dentro, limpa, guarda e lê a ficha', () => {
    const cb = callbacks();
    const overlay = new ForagingOverlay('porcini', cb, false);
    const o = overlay as unknown as ForagingInternals;
    expect(document.querySelector('.zh-forage')).not.toBeNull();
    until(() => o.stage === 'aim');
    // Fora da faixa: erra, e a faca segue.
    until(() => !inZone(o) && Math.abs(o.knifeY - o.zoneTop) > 3);
    key('KeyZ');
    key('KeyZ', 'keyup');
    expect(cb.onMiss).toHaveBeenCalled();
    expect(o.stage).toBe('aim');
    // Dentro: corta.
    until(() => inZone(o));
    key('KeyZ');
    key('KeyZ', 'keyup');
    expect(cb.onCut).toHaveBeenCalledOnce();
    until(() => o.stage === 'clean');
    // A bucha passa por toda a terra.
    const size = Math.sqrt(o.dirt.length);
    for (let guard = 0; guard < 4 && o.dirt.some(Boolean); guard++) {
      o.dirt.forEach((c, i) => { if (c) o.scrubTo(i % size, Math.floor(i / size)); });
      advance(50);
    }
    until(() => o.stage === 'note');
    expect(cb.onClean).toHaveBeenCalledOnce();
    expect(cb.onStash).toHaveBeenCalledOnce();
    expect(cb.onNote).toHaveBeenCalledOnce();
    expect(document.querySelector('.zh-note-wrap')?.textContent?.length).toBeGreaterThan(10);
    // A ficha só fecha depois da pena terminar de escrever, no Z.
    advance(6000);
    key('KeyZ');
    advance(2000);
    expect(cb.onDone).toHaveBeenCalledOnce();
    expect(document.querySelector('.zh-forage')).toBeNull();
    expect(cb.onCancel).not.toHaveBeenCalled();
  });

  it('sair antes do corte (ESC) deixa o cogumelo no chão', () => {
    const cb = callbacks();
    new ForagingOverlay('morel', cb, false);
    advance(800);
    key('Escape');
    advance(2000);
    expect(cb.onCancel).toHaveBeenCalledOnce();
    expect(cb.onCut).not.toHaveBeenCalled();
    expect(document.querySelector('.zh-forage')).toBeNull();
  });

  it('cada uma das seis espécies abre o seu minijogo (com o toque também)', () => {
    for (const kind of MUSHROOM_KINDS) {
      const cb = callbacks();
      const overlay = new ForagingOverlay(kind, cb, true);
      advance(800);
      expect((overlay as unknown as ForagingInternals).stage).toBe('aim');
      overlay.destroy();
    }
    expect(document.querySelector('.zh-forage')).toBeNull();
  });
});
