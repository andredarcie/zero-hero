import { describe, expect, it } from 'vitest';

import { GAZE_DOWN_S, GAZE_HOLD_S, GAZE_TOTAL_S, GAZE_UP_S, METEOR_AT_S, METEOR_S, gazeFrame } from './starGaze';

describe('o céu da primeira noite (pedido do autor)', () => {
  it('a câmera sai do chão, sobe devagar sem tranco, fica no céu e volta ao chão', () => {
    expect(gazeFrame(0).blend).toBe(0);
    expect(gazeFrame(GAZE_TOTAL_S).blend).toBeCloseTo(0, 6);
    expect(gazeFrame(GAZE_UP_S + GAZE_HOLD_S / 2).blend).toBe(1);
    // Devagar: a subida leva seus segundos, e começa quase parada.
    expect(GAZE_UP_S).toBeGreaterThanOrEqual(5);
    expect(gazeFrame(0.2).blend).toBeLessThan(0.01);
    let last = -1;
    for (let t = 0; t <= GAZE_UP_S; t += 0.1) {
      const b = gazeFrame(t).blend;
      expect(b).toBeGreaterThanOrEqual(last);
      last = b;
    }
    expect(GAZE_DOWN_S).toBeGreaterThan(2);
  });

  it('a estrela cadente passa uma vez, bem rápida, depois de um tempo olhando, e só com a câmera lá em cima', () => {
    expect(METEOR_S).toBeLessThan(1.2);
    expect(METEOR_AT_S - GAZE_UP_S).toBeGreaterThanOrEqual(3);
    expect(METEOR_AT_S + METEOR_S).toBeLessThan(GAZE_UP_S + GAZE_HOLD_S - 2);
    const lit: number[] = [];
    for (let t = 0; t <= GAZE_TOTAL_S; t += 0.05) {
      const f = gazeFrame(t);
      if (f.meteor >= 0) {
        lit.push(t);
        expect(f.blend).toBe(1);
        expect(f.meteor).toBeLessThanOrEqual(1);
      }
    }
    expect(lit.length).toBeGreaterThan(5);
    expect(lit.at(-1)! - lit[0]).toBeLessThanOrEqual(METEOR_S + 0.06);
  });
});
