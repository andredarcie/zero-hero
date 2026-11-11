import { describe, expect, it } from 'vitest';
import { bladeGrowth, contactShadows, grownHeight, traceBlades, type FramePixel } from './grassBlades';

// OS FIOS DA GRAMA: os desenhos são os do forest_tile_set.png, copiados pixel a pixel. A = a ponta em oliva (#626439),
// B = o pé de ardósia (#3a3f3f), s = a sombra de contato (preto a 39%); no trigo, Y/y = a espiga, C = o talo,
// D = o pé escuro.
const COLORS: Record<string, readonly [number, number, number, number]> = {
  A: [0x62, 0x64, 0x39, 255], B: [0x3a, 0x3f, 0x3f, 255], s: [0, 0, 0, 100],
  Y: [0xf2, 0xd3, 0x6b, 255], y: [0xd9, 0xb4, 0x53, 255], C: [0x82, 0x68, 0x41, 255], D: [0x3a, 0x3f, 0x3f, 255],
};
const frameOf = (rows: readonly string[]): FramePixel => (x, y) => COLORS[rows[y][x]] ?? [0, 0, 0, 0];

/** O quadro 0: dois tufos lado a lado, duas fileiras de tufos, cada fio uma coluna de 3 pixels. */
const FRAME_0 = [
  '................', '................', '................', '................', '................',
  '....A.A...A.A...', '...ABABA.ABABA..', '...BsBsB.BsBsB..', '...s.s.s.s.s.s..',
  '....A.A...A.A...', '...ABABA.ABABA..', '...BsBsB.BsBsB..', '...s.s.s.s.s.s..',
  '................', '................', '................',
];
/** O quadro 20, o mato alto: na coluna 6 dois fios empilhados, a sombra do de cima encostando na ponta do de baixo. */
const FRAME_20 = [
  '......A.........', '..A...B..A......', '..B.A.B..B..A...', '..B.B.s..B..B...',
  '..s.B.A.As..s...', '....s.B.B..A....', '...A..s.s..B.A..', '...B.A..A..s.B..',
  '...s.B..A....B..', '.A...s..B..A.sA.', '.B..A.A.s..B..A.', '.s..B.B....s..B.',
  '..A.B.s.A..A..s.', '..B.s...B..A.A..', '..s.....s..B.B..', '...........s.s..',
];
/** O trigo (65): três talos, e a espiga de cada um tem duas colunas — a do talo e a do lado, que não tem pé. */
const WHEAT = [
  '................', '................', '....Y.......Y...', '...Yy...Y..Yy...',
  '...yY..Yy..yY...', '...Yy..yY..Yy...', '....C..Yy...C...', '....C...C...C...',
  '....C...C...C...', '....D...C...D...', '........D.......', '................',
  '................', '................', '................', '................',
];

const opaque = (rows: readonly string[]): number => rows.join('').replace(/\./g, '').length;
const pixelsOf = (blades: ReturnType<typeof traceBlades>): number =>
  blades.reduce((n, b) => n + b.runs.reduce((m, r) => m + r.bottom - r.top + 1, 0), 0);

describe('os fios da grama', () => {
  it('o quadro 0 vira vinte fios: cada coluna de cada tufo é um fio de 2 pixels, a ponta e o pé de ardósia', () => {
    const blades = traceBlades(frameOf(FRAME_0));
    expect(blades).toHaveLength(20);
    for (const b of blades) {
      expect(b.runs).toHaveLength(1);
      expect(b.height).toBe(2);
      expect(b.footRows).toBe(1);
      expect(FRAME_0[b.footRow][b.footCol]).toBe('B');
    }
    // o tufo de cima do desenho fica de pé MAIS AO NORTE, e não 4 pixels no ar: o pé dele é a fileira 6 ou 7
    const upper = blades.filter((b) => b.footRow <= 7);
    expect(upper).toHaveLength(10);
    expect(new Set(blades.map((b) => b.footRow))).toEqual(new Set([6, 7, 10, 11]));
  });

  it('a sombra de contato sai do fio: ela é chão, e fica logo abaixo do pé de cada um', () => {
    const blades = traceBlades(frameOf(FRAME_0));
    const dots = contactShadows(frameOf(FRAME_0));
    expect(dots).toHaveLength(20);
    for (const d of dots) expect(blades.some((b) => b.footCol === d.col && b.footRow === d.row - 1)).toBe(true);
  });

  it('dois fios empilhados na mesma coluna são dois fios, cortados na sombra do de cima', () => {
    const blades = traceBlades(frameOf(FRAME_20));
    const col6 = blades.filter((b) => b.footCol === 6).sort((a, c) => a.footRow - c.footRow);
    expect(col6.map((b) => [b.footRow, b.height, b.footRows])).toEqual([[2, 3, 2], [5, 2, 1], [11, 2, 1]]);
  });

  it('nenhum pixel se perde e nenhum se repete: o desenho inteiro está nos fios e nas sombras', () => {
    for (const rows of [FRAME_0, FRAME_20, WHEAT]) {
      const f = frameOf(rows);
      expect(pixelsOf(traceBlades(f)) + contactShadows(f).length).toBe(opaque(rows));
    }
  });

  it('em pé a haste cresce em pixel inteiro: o capim fica de 4 a 7 pixels, o mato alto de 6 a 10, o pé não muda', () => {
    const short = { height: 2, footRows: 1 };
    const tall = { height: 3, footRows: 2 };
    expect(grownHeight(short, bladeGrowth(0, short, 0))).toBe(4);
    expect(grownHeight(short, bladeGrowth(0, short, 0.999))).toBe(7);
    expect(grownHeight(tall, bladeGrowth(20, tall, 0))).toBe(6);
    expect(grownHeight(tall, bladeGrowth(19, tall, 0.999))).toBe(10);
    for (let r = 0; r < 1; r += 0.05) {
      const g = bladeGrowth(7, short, r);
      expect(Number.isInteger(g)).toBe(true);
      expect(grownHeight(short, g)).toBeGreaterThanOrEqual(4);
      expect(grownHeight(short, g)).toBeLessThanOrEqual(7);
    }
  });

  it('o trigo e o capim antigo já são compridos no desenho: não crescem', () => {
    expect(bladeGrowth(65, { height: 8, footRows: 1 }, 0.9)).toBe(1);
    expect(bladeGrowth(76, { height: 10, footRows: 2 }, 0.9)).toBe(1);
  });

  it('a metade da espiga sem pé se prende ao talo do lado: o trigo são três fios, e a espiga sobe com o talo', () => {
    const blades = traceBlades(frameOf(WHEAT));
    expect(blades).toHaveLength(3);
    expect(blades.map((b) => [b.footCol, b.footRow, b.height])).toEqual([[4, 9, 8], [8, 10, 8], [12, 9, 8]]);
    const first = blades[0];
    const side = first.runs.find((r) => r.col === 3);
    expect(side).toBeDefined();
    // a coluna do lado vai da fileira 3 à 5: o pé dela fica 4 pixels acima do pé do talo
    expect(side?.base).toBe(4);
  });

  it('é determinístico: o mesmo desenho dá os mesmos fios', () => {
    expect(traceBlades(frameOf(FRAME_20))).toEqual(traceBlades(frameOf(FRAME_20)));
  });
});
