import { describe, expect, it } from 'vitest';

import { TILT_PERIOD_S, hopLengths, qualityOf, skipsFor, tiltAt } from './stoneSkip';

// A PEDRA QUE QUICA: deitada na hora certa, ela quica muito; de quina, afunda. Cada voo é mais curto que o anterior.

describe('a pedra que quica', () => {
  it('o seixo DEMORA deitado: a janela boa cabe o tempo de reação de uma pessoa', () => {
    const steps = 4000;
    let good = 0;
    for (let i = 0; i < steps; i += 1) if (qualityOf(tiltAt((i / steps) * TILT_PERIOD_S)) >= 0.85) good += 1;
    // Duas passagens por volta: cada uma com pelo menos 0,25 s de janela boa.
    expect(((good / steps) * TILT_PERIOD_S) / 2).toBeGreaterThan(0.25);
  });

  it('começa de pé (o Z que pegou o seixo não joga uma pedra perfeita por acaso)', () => {
    expect(qualityOf(tiltAt(TILT_PERIOD_S / 4))).toBeLessThan(0.05);
    expect(qualityOf(tiltAt(TILT_PERIOD_S / 2))).toBeGreaterThan(0.99);
  });

  it('deitada quica muito, de quina afunda, e a sorte só mexe dentro da faixa', () => {
    expect(skipsFor(1, 0)).toBe(6);
    expect(skipsFor(1, 1)).toBe(9);
    expect(skipsFor(0.7, 0.5)).toBeGreaterThanOrEqual(3);
    expect(skipsFor(0.7, 0.5)).toBeLessThanOrEqual(5);
    expect(skipsFor(0.4, 0.99)).toBeLessThanOrEqual(2);
    expect(skipsFor(0.1, 0.99)).toBe(0);
  });

  it('um voo por quique e mais o último, cada um mais curto que o anterior', () => {
    const hops = hopLengths(5, 1);
    expect(hops).toHaveLength(6);
    for (let i = 1; i < hops.length; i += 1) expect(hops[i]).toBeLessThan(hops[i - 1]);
    // Sem quique nenhum, a pedra ainda voa da mão até a água.
    expect(hopLengths(0, 0)).toHaveLength(1);
  });
});
