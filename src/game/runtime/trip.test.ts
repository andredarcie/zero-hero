import { describe, expect, it } from 'vitest';

import { TRIP_EYE_AT_S, TRIP_FLIGHT_AT_S, TRIP_S, tripFrame } from './trip';

const firstAbove = (pick: (t: number) => number, level: number): number => {
  for (let t = 0; t <= TRIP_S; t += 0.05) if (pick(t) > level) return t;
  return Infinity;
};

describe('a viagem do chá da Shui (pedido do autor)', () => {
  it('começa e termina no jogo de sempre: nada na tela e a câmera de sempre', () => {
    for (const f of [tripFrame(0), tripFrame(TRIP_S)]) {
      expect(f.view).toBe('game');
      expect(f.lens).toBe(0);
      for (const k of ['visor', 'specks', 'breathe', 'hue', 'form', 'tunnel', 'web', 'trail', 'white'] as const) {
        expect(f[k], k).toBeCloseTo(0, 6);
      }
    }
  });

  it('as duas trocas de câmera ficam cobertas sem clarão branco', () => {
    expect(tripFrame(TRIP_EYE_AT_S - 0.01).view).toBe('game');
    expect(tripFrame(TRIP_EYE_AT_S).view).toBe('eye');
    expect(tripFrame(TRIP_EYE_AT_S).dark).toBeGreaterThan(0.99);
    expect(tripFrame(TRIP_EYE_AT_S).visor).toBe(1);
    expect(tripFrame(TRIP_FLIGHT_AT_S - 0.01).view).toBe('eye');
    expect(tripFrame(TRIP_FLIGHT_AT_S).view).toBe('flight');
    expect(tripFrame(TRIP_FLIGHT_AT_S).dark).toBeGreaterThan(0.99);
    expect(tripFrame(TRIP_FLIGHT_AT_S).white).toBe(0);
    expect(tripFrame(TRIP_FLIGHT_AT_S, true).dark).toBeGreaterThan(0.99);
    expect(tripFrame(23.2).white).toBeLessThan(0.35);
  });

  it('as etapas vêm na ordem do pedido: pontos pretos, cores, o elmo abrindo, o túnel, e depois o voo', () => {
    const specks = firstAbove((t) => tripFrame(t).specks, 0.5);
    const rainbow = firstAbove((t) => tripFrame(t).rainbow, 0.5);
    const open = firstAbove((t) => tripFrame(t).open, 0.5);
    const tunnel = firstAbove((t) => tripFrame(t).tunnel, 0.5);
    const web = firstAbove((t) => tripFrame(t).web, 0.5);
    expect(specks).toBeGreaterThan(TRIP_EYE_AT_S);
    expect(specks).toBeLessThan(rainbow);
    expect(rainbow).toBeLessThan(open);
    expect(open).toBeLessThan(tunnel);
    expect(tunnel).toBeLessThan(TRIP_FLIGHT_AT_S);
    expect(web).toBeGreaterThan(TRIP_FLIGHT_AT_S);
    // O elmo só existe dentro dele, e some quando a fresta abre de vez.
    expect(tripFrame(TRIP_FLIGHT_AT_S + 1).visor).toBe(0);
    expect(tripFrame(24).visor).toBe(0);
  });

  it('o túnel corre e freia antes do clarão; com movimento reduzido, mais devagar', () => {
    expect(tripFrame(30).speed).toBeGreaterThan(tripFrame(23.5).speed);
    expect(tripFrame(37).speed).toBeLessThan(tripFrame(32).speed);
    expect(tripFrame(30, true).speed).toBeLessThan(tripFrame(30).speed);
    expect(tripFrame(10, true).breathe).toBeLessThan(tripFrame(10).breathe);
  });

  it('o céu dá a volta inteira no voo, e a câmera volta ao herói antes do fim', () => {
    expect(tripFrame(TRIP_FLIGHT_AT_S).sky).toBe(0);
    expect(tripFrame(TRIP_S - 3).sky).toBe(1);
    expect(tripFrame(TRIP_S - 0.5).lens).toBeLessThan(0.05);
  });
});
