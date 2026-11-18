import { describe, expect, it } from 'vitest';

import { CHIME_GUST, chimeFrame, nightAmount } from './DecorLife';

// OS ENFEITES QUE VIVEM: a lanterna acende com a noite do relógio, e o sino só balança na rajada.

describe('a noite da lanterna', () => {
  it('é dia inteiro ao meio-dia e noite inteira à meia-noite, com a mesma noite de isNightTime', () => {
    expect(nightAmount(0.5)).toBe(0);
    expect(nightAmount(0)).toBe(1);
    expect(nightAmount(0.9)).toBe(1);
    expect(nightAmount(0.75)).toBeCloseTo(0.5);
    expect(nightAmount(0.25)).toBeCloseTo(0.5);
  });

  it('acende aos poucos no anoitecer e apaga aos poucos no amanhecer, sem salto', () => {
    let last = nightAmount(0.7);
    for (let t = 0.7; t <= 0.8; t += 0.002) {
      const now = nightAmount(t);
      expect(now).toBeGreaterThanOrEqual(last - 1e-9);
      expect(now - last).toBeLessThan(0.1);
      last = now;
    }
    expect(nightAmount(0.2)).toBe(1);
    expect(nightAmount(0.3)).toBe(0);
  });
});

describe('o balanço do sino', () => {
  it('a brisa de fundo não o tira do lugar', () => {
    for (let ms = 0; ms < 5000; ms += 37) expect(chimeFrame(ms, CHIME_GUST - 0.01, 0)).toBe(0);
  });

  it('na rajada ele vai para os dois lados e passa pelo meio', () => {
    const seen = new Set<number>();
    for (let ms = 0; ms < 5000; ms += 37) seen.add(chimeFrame(ms, 0.8, 1.2));
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });
});
