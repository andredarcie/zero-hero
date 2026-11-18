import { describe, expect, it } from 'vitest';

import { planMowCut, planMowSwish } from './MowSounds';
import { seededRandom } from '../render3d/tallGrassArt';

// O SOM DA FOICE: cada golpe é sorteado de novo (dois golpes nunca soam iguais), mas sempre com as quatro partes — os
// estalos dos talos acelerando, o chhk, a caída e os toquinhos —, dentro de um tempo curto; e em sequência sobe de tom.

describe('o plano do som do corte', () => {
  it('dois golpes nunca são iguais', () => {
    const a = planMowCut(10, 0, seededRandom(1));
    const b = planMowCut(10, 0, seededRandom(2));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
    expect(JSON.stringify(planMowSwish(seededRandom(1)))).not.toBe(JSON.stringify(planMowSwish(seededRandom(2))));
  });

  it('tem os estalos, os talos grossos, o chhk, a caída e os toquinhos, num golpe curto', () => {
    for (let s = 1; s < 30; s += 1) {
      const g = planMowCut(11, 0, seededRandom(s));
      const snaps = g.filter((x) => x.type === 'bandpass' && x.shape === 'hit' && x.freq >= 2400);
      const thick = g.filter((x) => x.type === 'bandpass' && x.shape === 'hit' && x.freq < 2000);
      expect(snaps.length).toBeGreaterThanOrEqual(7);
      expect(snaps.length).toBeLessThanOrEqual(13);
      expect(thick.length).toBeGreaterThanOrEqual(2);
      expect(g.some((x) => x.type === 'highpass')).toBe(true);
      expect(g.some((x) => x.shape === 'swell')).toBe(true);
      expect(g.filter((x) => x.type === 'lowpass').length).toBeGreaterThanOrEqual(2);
      // os estalos se apertam: o intervalo do fim é menor que o do começo
      const at = snaps.map((x) => x.at).sort((p, q) => p - q);
      expect(at[at.length - 1]).toBeLessThan(0.075);
      expect(Math.max(...g.map((x) => x.at + x.dur))).toBeLessThan(0.7);
      expect(g.every((x) => x.vol > 0 && x.vol <= 0.2)).toBe(true);
    }
  });

  it('em sequência o golpe sobe de tom, até um teto', () => {
    const mean = (combo: number): number => {
      let sum = 0;
      for (let s = 1; s < 40; s += 1) {
        const snaps = planMowCut(10, combo, seededRandom(s)).filter((x) => x.type === 'bandpass' && x.shape === 'hit');
        sum += snaps.reduce((t, x) => t + x.freq, 0) / snaps.length;
      }
      return sum;
    };
    expect(mean(1)).toBeGreaterThan(mean(0));
    expect(mean(3)).toBeGreaterThan(mean(1));
    expect(mean(9)).toBeCloseTo(mean(3), 5);
  });
});
