import { describe, expect, it } from 'vitest';

import { paintedCanvas } from '@/game/render3d/homeTextures';
import type { Paint } from '@/game/render3d/pixelForms';
import { getTexture3D } from '@/game/render3d/textures3d';
import { CLOTH_DYES } from '@/game/runtime/homeState';
import {
  CHIME_FRAMES, HOME_DECOR_PAINTERS, bedWithBlanket, blanketTexture, flowerPotFor, homeArtKeys, potTexture, registerHomeArt,
  sign, tub, tubTexture, windChime,
} from './homeArt';

// A ARTE DO LAR: tudo dentro do quadro (16 px; a manta, 32), cada variação diferente da outra, e tudo registrado no
// mundo 3D com as chaves que o acampamento e os enfeites pedem.

const bounds = (paint: (rect: Paint) => void, size: number): { minX: number; minY: number; maxX: number; maxY: number; area: number } => {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, area: 0 };
  paint((_color, x, y, w, h) => {
    box.minX = Math.min(box.minX, x);
    box.minY = Math.min(box.minY, y);
    box.maxX = Math.max(box.maxX, x + w);
    box.maxY = Math.max(box.maxY, y + h);
    box.area += Math.max(0, w) * Math.max(0, h);
  });
  expect(box.minX).toBeGreaterThanOrEqual(0);
  expect(box.minY).toBeGreaterThanOrEqual(0);
  expect(box.maxX).toBeLessThanOrEqual(size);
  expect(box.maxY).toBeLessThanOrEqual(size);
  return box;
};

const pixels = (paint: (rect: Paint) => void, size = 16): string => {
  const canvas = paintedCanvas(paint, size, size);
  return Buffer.from(canvas.getContext('2d')!.getImageData(0, 0, size, size).data).toString('base64');
};

describe('a arte do lar', () => {
  it('cada peça fica dentro do quadro e tem desenho de verdade', () => {
    const pieces: Array<[(rect: Paint) => void, number]> = [
      ...Object.values(HOME_DECOR_PAINTERS).map((p) => [p, 16] as [(rect: Paint) => void, number]),
      [windChime(-1), 16], [windChime(1), 16], [sign(false), 16], [sign(true), 16],
      ...(['spring', 'summer', 'autumn', 'winter'] as const).map((s) => [flowerPotFor(s), 16] as [(rect: Paint) => void, number]),
      ...CLOTH_DYES.map((d) => [tub(d), 16] as [(rect: Paint) => void, number]),
      ...CLOTH_DYES.map((d) => [bedWithBlanket(d), 32] as [(rect: Paint) => void, number]),
    ];
    for (const [paint, size] of pieces) expect(bounds(paint, size).area).toBeGreaterThan(20);
  });

  it('o sino balança de verdade, o vaso troca de flor, a tina e a manta mudam de cor, e a placa ganha letras', () => {
    expect(new Set([pixels(windChime(-1)), pixels(windChime(0)), pixels(windChime(1))]).size).toBe(3);
    expect(new Set((['spring', 'summer', 'autumn', 'winter'] as const).map((s) => pixels(flowerPotFor(s)))).size).toBe(4);
    expect(new Set(CLOTH_DYES.map((d) => pixels(tub(d)))).size).toBe(CLOTH_DYES.length);
    expect(new Set(CLOTH_DYES.map((d) => pixels(bedWithBlanket(d), 32))).size).toBe(CLOTH_DYES.length);
    expect(pixels(sign(true))).not.toBe(pixels(sign(false)));
  });

  it('o mundo 3D conhece cada chave que o acampamento e os enfeites pedem', () => {
    registerHomeArt();
    const keys = new Set(homeArtKeys());
    for (const key of CHIME_FRAMES.slice(1)) expect(keys).toContain(key);
    for (const season of ['summer', 'autumn', 'winter'] as const) expect(keys).toContain(potTexture(season));
    for (const dye of CLOTH_DYES) expect(keys).toContain(tubTexture(dye));
    for (const dye of CLOTH_DYES.filter((d) => d !== 'natural')) expect(keys).toContain(blanketTexture(dye));
    for (const key of keys) expect(() => getTexture3D(key)).not.toThrow();
    // A primavera é o vaso de sempre, registrado com os achados (valley-find-flowerPot).
    expect(potTexture('spring')).toBe('valley-find-flowerPot');
  });
});
