import { describe, expect, it } from 'vitest';

import {
  ATLAS_H, ATLAS_W, CELL_H, CELL_W, TALL_GRASS_PALETTE, buildTallGrassAtlas, cellOrigin, tipRegion, type BladeArt,
} from './tallGrassArt';
import { composeTuft } from './tallGrassTuft';

// O MATO ALTO DESENHADO FIO A FIO: a paleta é a do tileset, cada fio é uma linha limpa de pixel art (uma fileira por vez,
// nunca dois pixels para o lado), com o pé escuro embaixo; as corridas cobrem cada pixel do fio uma vez só; e nenhum
// tufo repete o vizinho.

const atlas = buildTallGrassAtlas();
const palette = new Set(Object.values(TALL_GRASS_PALETTE).map((c) => c.join(',')));
const pixel = (x: number, y: number): [number, number, number, number] => {
  const i = (y * ATLAS_W + x) * 4;
  return [atlas.pixels[i], atlas.pixels[i + 1], atlas.pixels[i + 2], atlas.pixels[i + 3]];
};
const all: BladeArt[] = [...atlas.green, ...atlas.straw, ...atlas.stubs];

/** Os pixels pintados de um fio, na célula dele. */
const paintedOf = (b: BladeArt): Array<[number, number]> => {
  const o = cellOrigin(b.cell);
  const out: Array<[number, number]> = [];
  for (let y = 0; y < CELL_H; y += 1) for (let x = 0; x < CELL_W; x += 1) if (pixel(o.x + x, o.y + y)[3] === 255) out.push([x, y]);
  return out;
};

describe('a biblioteca de fios do mato alto', () => {
  it('é determinística e só usa a paleta do tileset', () => {
    expect(buildTallGrassAtlas().pixels).toEqual(atlas.pixels);
    for (let y = 0; y < ATLAS_H; y += 1) {
      for (let x = 0; x < ATLAS_W; x += 1) {
        const p = pixel(x, y);
        if (p[3] === 0) continue;
        expect(palette.has(p.slice(0, 3).join(',')), `cor fora da paleta em ${x},${y}`).toBe(true);
      }
    }
  });

  it('cada fio pisa no chão com o pé escuro e sobe sem buraco nem degrau duplo', () => {
    const dark = new Set([TALL_GRASS_PALETTE.foot, TALL_GRASS_PALETTE.deep].map((c) => c.join(',')));
    for (const b of all) {
      const o = cellOrigin(b.cell);
      expect(dark.has(pixel(o.x + b.footCol, o.y + CELL_H - 1).slice(0, 3).join(',')), `pé do fio ${b.cell}`).toBe(true);
      // conexo (vizinhança de 8): todo pixel chega ao pé
      const px = paintedOf(b);
      const set = new Set(px.map(([x, y]) => `${x},${y}`));
      const seen = new Set([`${b.footCol},${CELL_H - 1}`]);
      const stack = [[b.footCol, CELL_H - 1]];
      while (stack.length) {
        const [x, y] = stack.pop()!;
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dy = -1; dy <= 1; dy += 1) {
            const k = `${x + dx},${y + dy}`;
            if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push([x + dx, y + dy]); }
          }
        }
      }
      expect(seen.size, `fio ${b.cell} partido`).toBe(set.size);
    }
  });

  it('o fio verde afina, quase sempre é alto, e o toco é baixo com o talo claro', () => {
    expect(atlas.green.filter((b) => b.height >= 9).length).toBeGreaterThan(atlas.green.length / 2);
    // o oliva-claro é raro, como no capim do autor: no máximo dois pixels de luz por fio
    const light = TALL_GRASS_PALETTE.light.join(',');
    for (const b of atlas.green) {
      const o = cellOrigin(b.cell);
      expect(paintedOf(b).filter(([x, y]) => pixel(o.x + x, o.y + y).slice(0, 3).join(',') === light).length).toBeLessThanOrEqual(2);
    }
    for (const b of atlas.green) {
      expect(b.height).toBeGreaterThanOrEqual(6);
      expect(b.height).toBeLessThanOrEqual(16);
      // no alto, um pixel de largura (a folha afina)
      const top = paintedOf(b).filter(([, y]) => y === CELL_H - b.height);
      expect(top.length).toBeLessThanOrEqual(2);
    }
    for (const b of atlas.stubs) expect(b.height).toBeLessThanOrEqual(5);
  });

  it('as corridas cobrem cada pixel do fio exatamente uma vez, medidas do pé', () => {
    for (const b of all) {
      const covered = new Map<string, number>();
      for (const r of b.runs) {
        expect(r.base).toBe(CELL_H - 1 - r.bottom);
        for (let y = r.top; y <= r.bottom; y += 1) covered.set(`${r.col},${y}`, (covered.get(`${r.col},${y}`) ?? 0) + 1);
      }
      const px = paintedOf(b);
      expect(covered.size).toBe(px.length);
      expect([...covered.values()].every((n) => n === 1)).toBe(true);
    }
  });

  it('nenhum fio verde é cópia de outro', () => {
    const shapes = atlas.green.map((b) => JSON.stringify(paintedOf(b)));
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it('a ponta que voa no corte é a região do próprio fio acima do toco', () => {
    for (const b of atlas.green.filter((x) => x.height >= 6)) {
      const tip = tipRegion(b, 3);
      expect(tip).not.toBeNull();
      expect(tip!.row1).toBe(CELL_H - 1 - 3);
      expect(tip!.row0).toBe(CELL_H - b.height);
      expect(tip!.col0).toBeGreaterThanOrEqual(0);
      expect(tip!.col1).toBeLessThan(CELL_W);
    }
    expect(tipRegion({ ...atlas.stubs[0], height: 2 }, 3)).toBeNull();
  });
});

describe('o tufo montado', () => {
  it('a mesma posição dá o mesmo tufo, e tufos vizinhos não se repetem', () => {
    expect(composeTuft(50, 46, atlas)).toEqual(composeTuft(50, 46, atlas));
    const sig = (x: number, y: number): string => JSON.stringify(composeTuft(x, y, atlas).tall.map((b) => [b.art.cell, b.dxPx, b.dz]));
    const field = [];
    for (let y = 44; y < 52; y += 1) for (let x = 48; x < 60; x += 1) field.push(sig(x, y));
    expect(new Set(field).size).toBe(field.length);
  });

  it('o tufo cabe no tile, tem volume e às vezes palha', () => {
    let straw = 0;
    for (let y = 0; y < 40; y += 1) {
      const t = composeTuft(7, y, atlas);
      expect(t.tall.length).toBeGreaterThanOrEqual(9);
      for (const b of t.tall) {
        expect(Math.abs(b.dxPx)).toBeLessThanOrEqual(6);
        expect(Math.abs(b.dz)).toBeLessThan(0.4);
      }
      // o fundo é mais escuro que a frente (o volume)
      const back = t.tall.filter((b) => b.dz < -0.15);
      const front = t.tall.filter((b) => b.dz > 0.15);
      if (back.length && front.length) {
        const mean = (bs: typeof back): number => bs.reduce((s, b) => s + b.tone, 0) / bs.length;
        expect(mean(back)).toBeLessThan(mean(front) + 0.02);
      }
      if (t.tall.some((b) => b.art.kind !== 'green')) straw += 1;
      expect(t.stubs.length).toBeGreaterThan(0);
      expect(t.stubs.every((s) => s.art.kind === 'stub')).toBe(true);
    }
    expect(straw).toBeGreaterThan(5);
    expect(straw).toBeLessThan(35);
  });
});
