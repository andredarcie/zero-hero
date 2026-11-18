import { describe, expect, it } from 'vitest';

import { DYE_COLORS } from '@/game/quests/dyePlants';
import {
  CAPE_GREENS, CLOTH_DYES, DYE_SWATCH, HOME_NAME_MAX, cleanHomeName, clothRamp, isClothDye, swapPalette, unlockedDyes,
} from './homeState';

// O LAR, a regra pura: as cores da tina, o tom de cada uma no pano, a troca de paleta da capa e o nome da placa.

const rgb = (hex: string): [number, number, number] => {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const lightness = (hex: string): number => {
  const [r, g, b] = rgb(hex).map((c) => c / 255);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
};
const hue = (hex: string): number => {
  const [r, g, b] = rgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
};
const hueGap = (a: number, b: number): number => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

describe('as cores da tina', () => {
  it('são a natural, as quatro plantas de tinta da Sisi e o violeta, sem repetir', () => {
    expect(CLOTH_DYES[0]).toBe('natural');
    for (const dye of Object.keys(DYE_COLORS)) expect(CLOTH_DYES).toContain(dye);
    expect(CLOTH_DYES).toContain('violeta');
    expect(new Set(CLOTH_DYES).size).toBe(CLOTH_DYES.length);
    expect(isClothDye('anil')).toBe(true);
    expect(isClothDye('roxo')).toBe(false);
    expect(isClothDye(3)).toBe(false);
  });

  it('o pano natural é a capa verde do herói, sem um pixel de diferença', () => {
    expect(clothRamp('natural')).toEqual(CAPE_GREENS);
  });

  it('cada tinta vira três tons, do claro ao escuro, na matiz dela e sem estourar na luz do mundo', () => {
    for (const dye of CLOTH_DYES.filter((d) => d !== 'natural')) {
      const ramp = clothRamp(dye);
      expect(new Set(ramp).size, dye).toBe(3);
      expect(lightness(ramp[0]), dye).toBeGreaterThan(lightness(ramp[1]));
      expect(lightness(ramp[1]), dye).toBeGreaterThan(lightness(ramp[2]));
      expect(lightness(ramp[0]), dye).toBeLessThanOrEqual(0.49);
      expect(hueGap(hue(ramp[1]), hue(DYE_SWATCH[dye as keyof typeof DYE_SWATCH])), dye).toBeLessThan(6);
    }
  });

  it('a tinta só chega depois que as flores de tinta da Sisi passaram pelas mãos do herói', () => {
    expect(unlockedDyes(() => false)).toEqual(['natural']);
    expect(unlockedDyes((kind) => kind === 'dyeBundle')).toEqual(CLOTH_DYES);
  });
});

describe('a troca de paleta da capa', () => {
  it('troca só as cores exatas do pano, e deixa o resto e a transparência como estavam', () => {
    const pixels = new Uint8ClampedArray([
      ...rgb(CAPE_GREENS[0]), 255,
      ...rgb(CAPE_GREENS[2]), 128,
      ...rgb('#1d2b53'), 255, // a armadura azul-marinho fica
      ...rgb(CAPE_GREENS[1]), 0, // pixel vazio: nem olha
    ]);
    const to = clothRamp('garanca');
    const out = swapPalette(pixels, CAPE_GREENS, to);
    expect([...out.slice(0, 4)]).toEqual([...rgb(to[0]), 255]);
    expect([...out.slice(4, 8)]).toEqual([...rgb(to[2]), 128]);
    expect([...out.slice(8, 12)]).toEqual([...rgb('#1d2b53'), 255]);
    expect([...out.slice(12, 16)]).toEqual([...rgb(CAPE_GREENS[1]), 0]);
    // A original não muda: toda tinta parte dela.
    expect([...pixels.slice(0, 3)]).toEqual(rgb(CAPE_GREENS[0]));
  });
});

describe('o nome da placa', () => {
  it('sai limpo: sem quebra de linha nem espaço sobrando, e no tamanho da placa', () => {
    expect(cleanHomeName('  Recanto   da\nLua  ')).toBe('Recanto da Lua');
    expect(cleanHomeName('\u0007Pedra\u0000')).toBe('Pedra');
    expect(cleanHomeName('x'.repeat(40))).toHaveLength(HOME_NAME_MAX);
    expect(cleanHomeName('Ação 🌙 Café')).toBe('Ação 🌙 Café');
    expect(cleanHomeName(undefined)).toBe('');
    expect(cleanHomeName('   ')).toBe('');
  });
});
