import { describe, expect, it } from 'vitest';

import {
  buildCoastField, COAST_LAND_MAX, COAST_SEA_MAX, farOceanQuads, SURF_DRAWDOWN, SURF_PERIOD, SURF_RISE, SURF_RUNUP, surfAmp, surfPhase,
  surfSwing, swashAt,
} from './surf';

// A ARREBENTAÇÃO (render3d/surf.ts). O que o shader desenha não se testa aqui; o que se testa é a conta que ele divide
// com o jogo: o campo da costa (a distância até a linha d'água) e o relógio da onda, que os bichos e o som leem.

describe('o campo da costa', () => {
  // uma costa reta: o mar é tudo ao norte da linha z = 0 (z < 0), de x 0 a 39
  const straight = (_x: number, z: number): boolean => z < 0;
  const field = buildCoastField(straight, 0, -14, 39, 9);

  it('é zero na linha d\'água, positivo mar adentro e negativo na areia', () => {
    // o canto (ix, iz) é o ponto (ix − 0,5, iz − 0,5): a linha d'água passa em iz = 0
    // (a média que alisa o campo puxa um fio para o lado do teto mais baixo, o da areia: daí a folga)
    for (let ix = 4; ix < 36; ix++) {
      expect(Math.abs(field(ix, 0))).toBeLessThan(0.05);
      expect(Math.abs(field(ix, -3) - 3)).toBeLessThan(0.1);
      expect(Math.abs(field(ix, 2) + 2)).toBeLessThan(0.2);
      // e cresce sempre para o norte: a frente de onda nunca dobra sobre si
      for (let iz = -9; iz < 3; iz++) expect(field(ix, iz)).toBeGreaterThan(field(ix, iz + 1));
    }
  });

  it('mede até o teto de cada lado, e não além', () => {
    expect(field(20, -14)).toBeCloseTo(COAST_SEA_MAX, 1);
    expect(field(20, 9)).toBeCloseTo(-COAST_LAND_MAX, 1);
  });

  it('alisa a escadinha: um degrau de um tile na costa não vira degrau na frente de onda', () => {
    // a costa desce um tile em x = 20: mar é z < 0 a oeste e z < 1 a leste
    const step = (x: number, z: number): boolean => (x < 20 ? z < 0 : z < 1);
    const f = buildCoastField(step, 0, -14, 39, 9);
    // a um tile e meio da água, na areia, a curva de nível atravessa o degrau sem salto: de coluna a coluna o campo
    // muda bem menos que o tile inteiro do degrau
    let worst = 0;
    for (let ix = 12; ix < 28; ix++) worst = Math.max(worst, Math.abs(f(ix + 1, 2) - f(ix, 2)));
    expect(worst).toBeLessThan(0.3);
    // e longe do degrau ele continua medindo a distância certa, dos dois lados
    expect(Math.abs(f(5, 2) + 2)).toBeLessThan(0.2);
    expect(Math.abs(f(35, 3) + 2)).toBeLessThan(0.2);
  });

  it('uma pedra no mar é costa: o campo cai em volta dela', () => {
    const rock = (x: number, z: number): boolean => z < 0 && !(x === 20 && z === -6);
    const f = buildCoastField(rock, 0, -14, 39, 9);
    expect(f(20, -6)).toBeLessThan(buildCoastField(straight, 0, -14, 39, 9)(20, -6) - 2);
    expect(f(5, -6)).toBeCloseTo(6, 1);
  });
});

describe('o relógio da onda', () => {
  it('a lâmina sobe e desce uma vez por período, de 0 a 1 a 0', () => {
    expect(surfSwing(0)).toBeCloseTo(0, 6);
    expect(surfSwing(SURF_RISE)).toBeCloseTo(1, 6);
    expect(surfSwing(1)).toBeCloseTo(0, 6);
    // sobe mais depressa do que desce
    expect(SURF_RISE).toBeLessThan(0.5);
    for (let u = 0; u <= 1; u += 0.05) {
      expect(surfSwing(u)).toBeGreaterThanOrEqual(-1e-9);
      expect(surfSwing(u)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('cada onda tem a sua força, e nenhuma some nem passa do teto', () => {
    const amps = Array.from({ length: 60 }, (_, n) => surfAmp(n));
    expect(Math.min(...amps)).toBeGreaterThan(0.4);
    expect(Math.max(...amps)).toBeLessThanOrEqual(1);
    expect(Math.max(...amps) - Math.min(...amps)).toBeGreaterThan(0.3);
  });

  it('a onda chega quase de frente: a fase muda pouco e devagar ao longo da praia', () => {
    let worst = 0;
    for (let x = 0; x < 60; x += 0.5) {
      expect(Math.abs(surfPhase(x))).toBeLessThan(1);
      worst = Math.max(worst, Math.abs(surfPhase(x + 1) - surfPhase(x)));
    }
    expect(worst).toBeLessThan(0.25);
  });

  it('a beira da lâmina fica entre o alcance da onda e o recuo, e o número da onda sobe um por período', () => {
    for (const x of [3, 17.5, 30, 44.2, 58]) {
      let last = swashAt(x, 0).n;
      for (let t = 0; t < SURF_PERIOD * 6; t += 0.1) {
        const s = swashAt(x, t);
        expect(s.reach).toBeLessThanOrEqual(SURF_RUNUP + 1e-9);
        expect(s.reach).toBeGreaterThan(SURF_RUNUP * 0.35);
        expect(s.edge).toBeGreaterThanOrEqual(-s.reach - 1e-9);
        expect(s.edge).toBeLessThanOrEqual(SURF_DRAWDOWN + 1e-9);
        expect(s.u).toBeGreaterThanOrEqual(0);
        expect(s.u).toBeLessThan(1);
        expect(s.n - last === 0 || s.n - last === 1).toBe(true);
        last = s.n;
      }
      expect(last - swashAt(x, 0).n).toBe(6);
    }
  });

  it('no auge de cada onda a água está na areia: a beira passa do meio do alcance', () => {
    const s0 = swashAt(30, 0);
    // do começo desta onda, anda-se até o auge dela
    const start = (s0.n + 1 - surfPhase(30) / 2.9) * SURF_PERIOD;
    const peak = swashAt(30, start + SURF_RISE * SURF_PERIOD);
    expect(peak.u).toBeCloseTo(SURF_RISE, 2);
    expect(peak.edge).toBeLessThan(-peak.reach * 0.9);
  });
});

describe('o mar até o horizonte', () => {
  it('um retângulo ao norte do que foi assado, e um de cada lado só onde o mar de fora continua', () => {
    // o mar de fora: tudo a oeste (x < 0) nas linhas z ≤ -20; a leste, nada
    const seaWest = (x: number, z: number): boolean => x < 0 && z <= -20;
    const quads = farOceanQuads(0, -48, 59, -9, seaWest);
    expect(quads).toHaveLength(2);
    const [north, west] = quads;
    expect(north[3]).toBe(-48.5);
    expect(north[2]).toBeLessThan(-150);
    expect(north[0]).toBeLessThan(-100);
    expect(north[1]).toBeGreaterThan(160);
    // o do oeste começa onde o do norte acaba e desce até a última linha de mar
    expect(west[1]).toBe(-0.5);
    expect(west[2]).toBe(-48.5);
    expect(west[3]).toBe(-19.5);
  });
});
