import { describe, expect, it } from 'vitest';

import { GRID_PX, paintGridArt, type GridArt } from './campGridArt';

// A GRADE NO CHÃO: cada estado tem o seu desenho de 16×16; o livre é um canteiro recuado da beira (dois vizinhos não
// colam a borda), o mato tem a hachura de pena, o fechado o ×, a peça só os cantos, e o cursor tem contorno escuro.

const at = (px: Uint8ClampedArray, x: number, y: number): number[] => [...px.slice((y * GRID_PX + x) * 4, (y * GRID_PX + x) * 4 + 4)];
const opaque = (px: Uint8ClampedArray): number => { let n = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 0) n += 1; return n; };

describe('a grade do acampamento em pixel art', () => {
  it('cada desenho é diferente, e todos são 16×16', () => {
    const arts: GridArt[] = ['free', 'grass', 'blocked', 'piece', 'cursorOk', 'cursorNo'];
    const sigs = arts.map((a) => {
      const px = paintGridArt(a);
      expect(px.length).toBe(GRID_PX * GRID_PX * 4);
      return px.join(',');
    });
    expect(new Set(sigs).size).toBe(arts.length);
  });

  it('o canteiro livre fica recuado: a beira do tile é vazia e os cantos são arredondados', () => {
    const px = paintGridArt('free');
    for (let i = 0; i < GRID_PX; i += 1) {
      expect(at(px, i, 0)[3]).toBe(0);
      expect(at(px, 0, i)[3]).toBe(0);
    }
    expect(at(px, 1, 1)[3]).toBe(0); // o canto arredondado
    expect(at(px, 5, 1)[3]).toBeGreaterThan(200); // a borda de cima, clara
    // a luz da esquerda de cima: a borda de cima é mais clara que a de baixo
    const lum = (c: number[]): number => c[0] + c[1] + c[2];
    expect(lum(at(px, 5, 1))).toBeGreaterThan(lum(at(px, 5, 14)));
  });

  it('o mato e o fechado são vermelhos; a peça só tem os cantos; o cursor tem contorno escuro', () => {
    const red = (c: number[]): boolean => c[0] > c[1] + 60;
    expect(red(at(paintGridArt('grass'), 4, 4))).toBe(true);
    expect(red(at(paintGridArt('blocked'), 7, 8))).toBe(true);
    const piece = paintGridArt('piece');
    expect(opaque(piece)).toBeLessThan(40);
    expect(at(piece, 7, 7)[3]).toBe(0);
    const cursor = paintGridArt('cursorOk');
    const inks = [];
    for (let i = 0; i < cursor.length; i += 4) if (cursor[i + 3] > 0 && cursor[i] < 60) inks.push(i);
    expect(inks.length).toBeGreaterThan(8);
  });
});
