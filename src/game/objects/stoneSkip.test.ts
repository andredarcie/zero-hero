import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SOLID_UPPER_FRAMES } from '@/game/constants';
import { TILESET } from '@/game/objects/nature/kit';
import { SKIP_BEDS, TILT_PERIOD_S, drawPebbleBed, hopLengths, pebbleBedSize, qualityOf, skipBedAt, skipsFor, tiltAt } from './stoneSkip';

interface World {
  meta: { chunkColumns: number; chunkRows: number; playerStart: { worldX: number; worldY: number } };
  props: Array<{ type: string; worldX: number; worldY: number }>;
  chunks: Array<{ cx: number; cy: number; collisions: boolean[][]; upper: Array<Array<number | null>> }>;
}
const world = JSON.parse(fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public/world.json'), 'utf8',
)) as World;
const STEP = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] } as const;

describe('os leitos de seixos (só neles se quica pedra)', () => {
  const { chunkColumns: CW, chunkRows: CH } = world.meta;
  const isWater = (x: number, y: number): boolean => world.props.some((p) => p.type === 'water' && p.worldX === x && p.worldY === y);
  const propAt = (x: number, y: number): boolean => world.props.some((p) => p.worldX === x && p.worldY === y);
  const tile = (x: number, y: number): { solid: boolean; upper: number | null } => {
    const c = world.chunks.find((k) => k.cx === Math.floor(x / CW) && k.cy === Math.floor(y / CH));
    if (!c) return { solid: true, upper: null };
    return { solid: c.collisions[y % CH][x % CW], upper: c.upper[y % CH][x % CW] };
  };

  it('cada tile de leito é chão livre da beira, com água aberta à frente por pelo menos quatro tiles', () => {
    for (const bed of SKIP_BEDS) {
      const [dx, dy] = STEP[bed.water];
      for (const [x, y] of bed.tiles) {
        const here = tile(x, y);
        expect(isWater(x, y), `${x},${y} é água`).toBe(false);
        expect(propAt(x, y), `há uma peça em ${x},${y}`).toBe(false);
        expect(here.solid || (here.upper !== null && SOLID_UPPER_FRAMES.has(here.upper)), `${x},${y} é sólido`).toBe(false);
        for (let k = 1; k <= 4; k += 1) expect(isWater(x + dx * k, y + dy * k), `${x + dx * k},${y + dy * k} devia ser água`).toBe(true);
      }
    }
  });

  it('fora dos leitos não há seixo: nem na beira ao lado, nem no começo da aventura', () => {
    for (const bed of SKIP_BEDS) for (const [x, y] of bed.tiles) expect(skipBedAt(x, y)).toBe(bed);
    expect(skipBedAt(44, 57)).toBeNull();
    expect(skipBedAt(42, 56)).toBeNull();
    expect(skipBedAt(world.meta.playerStart.worldX, world.meta.playerStart.worldY)).toBeNull();
  });

  it('o desenho: só cores do tileset, sem preto, e os seixos juntam rente à água', () => {
    const allowed = new Set<string>(Object.values(TILESET));
    for (const bed of SKIP_BEDS) {
      const { w, h } = pebbleBedSize(bed);
      const px: Array<[number, number, string]> = [];
      drawPebbleBed((x, y, c) => { px.push([x, y, c]); }, bed);
      expect(px.length).toBeGreaterThan(20);
      for (const [x, y, c] of px) {
        expect(allowed.has(c), c).toBe(true);
        expect(c).not.toBe(TILESET.black);
        expect(x >= 0 && y >= 0 && x < w && y < h).toBe(true);
      }
      // A metade da água contra a metade da terra (a distância até a borda do lado da água).
      const fromWater = ([x, y]: [number, number, string]): number =>
        bed.water === 'n' ? y : bed.water === 's' ? h - 1 - y : bed.water === 'e' ? w - 1 - x : x;
      const wet = px.filter((p) => fromWater(p) < 8).length;
      expect(wet).toBeGreaterThan((px.length - wet) * 2);
    }
  });
});

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
