import { describe, expect, it } from 'vitest';
import {
  FOREST_FIRST_FRAME, FOREST_FRAMES, FOREST_SHORT_GRASS, FOREST_TALL_GRASS, forestGrass, forestUnderstory, PLANT_ROOM, roomy, treeLookAt, TRUNK_ROOM,
  type ForestContext, type TreeLook,
} from './forest';
import { groundTintAt, tileKey } from './terrainGeometry';

/** Uma mata maciça (tudo é árvore) com uma clareira quadrada no meio, de (20, 20) a (24, 24). */
const clearing = (x: number, z: number): boolean => x >= 20 && x <= 24 && z >= 20 && z <= 24;
const forest: ForestContext = { solid: (x, z) => !clearing(x, z), outside: () => false };
const voidForest: ForestContext = { solid: () => true, outside: () => true };
const PINES = [4, 14, 15, 16, 17, 18];
const looks = (ctx: ForestContext, frame = 4): Array<TreeLook & { x: number; z: number }> => {
  const out: Array<TreeLook & { x: number; z: number }> = [];
  for (let z = 0; z < 60; z++) {
    for (let x = 0; x < 60; x++) {
      if (!ctx.solid(x, z)) continue;
      const look = treeLookAt(frame, x, z, ctx);
      if (look) out.push({ ...look, x, z });
    }
  }
  return out;
};
const isEdge = (x: number, z: number): boolean => clearing(x - 1, z) || clearing(x + 1, z) || clearing(x, z - 1) || clearing(x, z + 1);

describe('o sub-bosque da mata: as próprias árvores, pequenas ou com a copa afundada, nos vãos', () => {
  const trees = looks(forest).map((t) => ({ x: t.x, z: t.z, frame: 4, look: t }));
  const plants = forestUnderstory(trees, forest.solid);
  const at = (p: { x: number; z: number; look: TreeLook }): [number, number] => [p.x + p.look.dx, p.z + p.look.dz];

  it('nunca colada: toda planta tem folga de todo tronco e de toda outra planta (de lado conta mais que de fundo)', () => {
    expect(plants.length).toBeGreaterThan(0);
    for (const p of plants) {
      const [px, pz] = at(p);
      for (const t of trees) {
        if (Math.abs(t.x - p.x) <= 2 && Math.abs(t.z - p.z) <= 2) expect(roomy(px - (t.x + t.look.dx), pz - (t.z + t.look.dz), TRUNK_ROOM)).toBe(true);
      }
      for (const q of plants) {
        if (q === p || Math.abs(q.x - p.x) > 1 || Math.abs(q.z - p.z) > 1) continue;
        const [qx, qz] = at(q);
        expect(roomy(px - qx, pz - qz, PLANT_ROOM)).toBe(true);
      }
    }
  });

  it('é densa: mais de duas plantas para cada três árvores, e nada no chão onde se pisa', () => {
    expect(plants.length / trees.length).toBeGreaterThan(2 / 3);
    for (const p of plants) {
      expect(forest.solid(p.x, p.z)).toBe(true);
      expect(Math.abs(p.look.dx)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(p.look.dz)).toBeLessThanOrEqual(0.5);
    }
  });

  it('o que barra mas não é mata (penhasco, muro, lápide) não é vão: nenhuma planta nele nem nos cantos dele', () => {
    const rock = (x: number, z: number): boolean => x === 30 && z === 30;
    const mata = (x: number, z: number): boolean => forest.solid(x, z) && !rock(x, z);
    const near = forestUnderstory(trees.filter((t) => !rock(t.x, t.z)), mata);
    expect(near.some((p) => p.x === 30 && p.z === 30)).toBe(false);
    // os quatro cantos da pedra e as divisas dela ficam vazios: a planta mais perto está a mais de meio tile do centro dela
    for (const p of near) expect(Math.max(Math.abs(p.x + p.look.dx - 30), Math.abs(p.z + p.look.dz - 30))).toBeGreaterThan(0.75);
  });

  it('a faixa fina de mata (uma fileira de árvores) também ganha planta, entre um tronco e outro', () => {
    const row: ForestContext = { solid: (_x, z) => z === 5, outside: () => false };
    const rowTrees = Array.from({ length: 40 }, (_, x) => ({ x, z: 5, frame: 4, look: treeLookAt(4, x, 5, row)! }));
    const rowPlants = forestUnderstory(rowTrees, row.solid);
    expect(rowPlants.length).toBeGreaterThan(10);
    for (const p of rowPlants) expect(p.z).toBe(5);
  });

  it('combina com as árvores: é da MESMA família de desenho, nunca alta, e um pouco mais escura que a árvore mais perto', () => {
    const tones = trees.map((t) => t.look.tone);
    for (const p of plants) {
      expect(FOREST_FRAMES).toContain(p.look.frame);
      expect(p.look.tall).toBe(false);
      expect(p.look.tone).toBeLessThan(Math.max(...tones));
      expect(p.look.tone).toBeGreaterThan(Math.min(...tones) * 0.8);
    }
  });

  it('tem variedade: as cinco plantas aparecem, metade espelhada, e as moitas afundam em alturas diferentes', () => {
    const looksOf = plants.map((p) => p.look);
    expect(new Set(looksOf.map((p) => p.shape)).size).toBe(5);
    const flipped = looksOf.filter((p) => p.flip).length / looksOf.length;
    expect(flipped).toBeGreaterThan(0.35);
    expect(flipped).toBeLessThan(0.65);
    const sinks = new Set(looksOf.filter((p) => p.shape === 'round' || p.shape === 'wide' || p.shape === 'spruce').map((p) => p.sink));
    expect(sinks.size).toBeGreaterThanOrEqual(3);
    // as mudas e a jovem ficam em pé no chão; a copa afundada some até o tronco
    for (const p of looksOf) {
      if (p.shape === 'saplings' || p.shape === 'young') expect(p.sink).toBeLessThanOrEqual(2 / 16);
      else expect(p.sink).toBeGreaterThanOrEqual(5 / 16);
    }
  });

  it('é determinístico, e o meio da clareira da mata de fora ganha planta', () => {
    expect(forestUnderstory(trees, forest.solid)).toEqual(plants);
    const holes = [{ x: 10, z: 10 }, { x: 30, z: 40 }, { x: 44, z: 12 }];
    const open = (x: number, z: number): boolean => holes.some((h) => h.x === x && h.z === z);
    const voidTrees = looks(voidForest).filter((t) => !open(t.x, t.z)).map((t) => ({ x: t.x, z: t.z, frame: 4, look: t }));
    const voidPlants = forestUnderstory(voidTrees, voidForest.solid, holes);
    for (const h of holes) expect(voidPlants.some((p) => p.x === h.x && p.z === h.z)).toBe(true);
  });
});

describe('o chão da mata: o capim e o mato alto do mapa', () => {
  const tiles = looks(forest).map((t) => ({ x: t.x, z: t.z }));
  const grass = forestGrass(tiles, forest.solid);

  it('muito capim onde o chão aparece (a fileira da frente), pouco atrás das copas (a de trás)', () => {
    // uma faixa de duas fileiras de árvores, a de trás em z = 5 e a da frente em z = 6
    const strip = (_x: number, z: number): boolean => z === 5 || z === 6;
    const row = (z: number): Array<{ x: number; z: number }> => Array.from({ length: 300 }, (_, x) => ({ x, z }));
    const per = (z: number): number => forestGrass(row(z), strip).length / 300;
    const tallIn = (z: number): number => forestGrass(row(z), strip).filter((g) => FOREST_TALL_GRASS.includes(g.frame)).length / 300;
    expect(per(6)).toBeGreaterThan(1.8);
    expect(tallIn(6)).toBeGreaterThan(0.55);
    expect(per(5)).toBeLessThan(1.1);
    expect(per(5)).toBeGreaterThan(0.7);
  });

  it('só os desenhos de capim do mapa, PARADOS, nunca o mesmo desenho duas vezes no tile; a mata de fora só capim baixo', () => {
    const seen = new Set<string>();
    for (const g of grass) {
      expect(g.still).toBe(true);
      expect([...FOREST_SHORT_GRASS, ...FOREST_TALL_GRASS]).toContain(g.frame);
      const kind = `${g.x},${g.z},${g.frame}`;
      expect(seen.has(kind)).toBe(false);
      seen.add(kind);
    }
    for (const g of forestGrass(tiles, forest.solid, () => true)) expect(FOREST_SHORT_GRASS).toContain(g.frame);
    expect(forestGrass(tiles, forest.solid)).toEqual(grass);
  });
});

describe('a sombra da mata no chão', () => {
  // um bloco de mata de 7×7 em volta de (0, 0)
  const block = new Set<number>();
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) block.add(tileKey(x, z));
  const luma = (c: readonly number[]): number => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;

  it('debaixo das árvores o chão escurece; muro e pedra (sólidos que não são árvore) não', () => {
    expect(luma(groundTintAt(block, block)(0, 0))).toBeLessThan(luma(groundTintAt(block)(0, 0)) * 0.8);
    expect(groundTintAt(block, new Set())(0, 0)).toEqual(groundTintAt(block)(0, 0));
  });

  it('longe da mata o chão é o de sempre, e a beira é um degradê', () => {
    expect(groundTintAt(block, block)(12, 12)).toEqual(groundTintAt(block)(12, 12));
    let last = Infinity;
    for (let x = 7; x >= 0; x -= 0.5) {
      const ratio = luma(groundTintAt(block, block)(x, 0)) / luma(groundTintAt(block)(x, 0));
      expect(ratio).toBeLessThanOrEqual(last + 1e-3);
      last = ratio;
    }
    expect(last).toBeLessThan(0.8);
  });
});

describe('a mata fora da grade', () => {
  it('o mesmo tile é sempre a mesma árvore (nada é sorteado em tempo de jogo)', () => {
    expect(treeLookAt(15, 31, 7, forest)).toEqual(treeLookAt(15, 31, 7, forest));
  });

  it('o que está em pé e não é árvore fica no centro do tile: o túmulo e a cabeça na estaca não têm desenho de mata', () => {
    expect(treeLookAt(25, 10, 10, forest)).toBeNull();
    expect(treeLookAt(22, 10, 10, forest)).toBeNull();
    expect(treeLookAt(39, 10, 10, forest)).toBeNull(); // a montanha
  });

  it('o pé sai do centro em pixel de arte inteiro, e na BEIRA fica bem dentro do tile que barra', () => {
    const all = looks(forest);
    for (const l of all) {
      expect(Math.abs(l.dx * 16 - Math.round(l.dx * 16))).toBeLessThan(1e-9);
      expect(Math.abs(l.dz * 16 - Math.round(l.dz * 16))).toBeLessThan(1e-9);
      if (isEdge(l.x, l.z)) {
        expect(Math.abs(l.dx)).toBeLessThanOrEqual(3 / 16);
        expect(l.dz).toBeGreaterThanOrEqual(-2 / 16);
        expect(l.dz).toBeLessThanOrEqual(1 / 16);
      } else {
        expect(Math.abs(l.dx)).toBeLessThanOrEqual(5 / 16);
        expect(Math.abs(l.dz)).toBeLessThanOrEqual(5 / 16);
      }
    }
    // …e a grade se desfaz de verdade: a maior parte das árvores não está no centro.
    const moved = all.filter((l) => l.dx !== 0 || l.dz !== 0).length;
    expect(moved / all.length).toBeGreaterThan(0.8);
  });

  it('a mata é variada: nenhuma forma passa da metade, e há árvore nova, de folha, de agulha e alta', () => {
    const count = new Map<string, number>();
    const all = looks(forest);
    for (const l of all) count.set(l.shape, (count.get(l.shape) ?? 0) + 1);
    expect(count.size).toBeGreaterThanOrEqual(8);
    for (const n of count.values()) expect(n / all.length).toBeLessThan(0.5);
    for (const shape of ['classic', 'young', 'round', 'spruce', 'giant']) expect(count.get(shape) ?? 0).toBeGreaterThan(0);
  });

  it('a árvore ALTA só nasce com dois tiles em pé logo ao norte: atrás dela nunca há chão onde se pise', () => {
    const tall = looks(forest).filter((l) => l.tall);
    expect(tall.length).toBeGreaterThan(20);
    for (const l of tall) {
      expect(forest.solid(l.x, l.z - 1) && forest.solid(l.x, l.z - 2)).toBe(true);
      // As duas células da arte ficam na mesma coluna do atlas (3 colunas): a de cima, uma fileira acima.
      expect(l.frame - l.topFrame).toBe(3);
    }
    // Logo ao sul da clareira (o chão fica nos dois tiles ao norte) nenhuma é alta.
    for (let x = 20; x <= 24; x++) {
      expect(treeLookAt(4, x, 25, forest)?.tall).toBe(false);
      expect(treeLookAt(4, x, 26, forest)?.tall).toBe(false);
    }
  });

  it('a roupa do bioma fica: o pinheiro de fruta veste formas de fruta, e todo quadro novo é da família', () => {
    for (const frame of PINES) {
      for (const l of looks(forest, frame)) {
        if (l.shape === 'classic') {
          expect(l.frame).toBe(frame);
          continue;
        }
        expect(FOREST_FRAMES).toContain(l.frame);
        expect(FOREST_FRAMES).toContain(l.topFrame);
        if (!l.tall) {
          const dress = (l.frame - FOREST_FIRST_FRAME) % 4;
          expect(dress).toBe({ 4: 0, 14: 0, 18: 0, 15: 1, 16: 2, 17: 3 }[frame]);
        }
      }
    }
  });

  it('as outras árvores (a seca, os tocos, as anciãs) saem do centro mas não trocam de forma', () => {
    for (const frame of [3, 21, 36, 37, 73, 74]) {
      for (const l of looks(forest, frame)) {
        expect(l.frame).toBe(frame);
        expect(l.tall).toBe(false);
      }
    }
  });

  it('a mata de fora do mundo cabe debaixo da névoa: nenhuma alta, e nenhuma vem para a frente do plano do tile', () => {
    for (const l of looks(voidForest)) {
      expect(l.tall).toBe(false);
      expect(['classic', 'spruce', 'young', 'old']).toContain(l.shape);
      expect(l.dz).toBeLessThanOrEqual(0);
    }
  });

  it('o tom de cada árvore fica perto de 1: a vizinha é um pouco mais clara ou mais escura, nunca outra cor', () => {
    for (const l of looks(forest)) {
      expect(l.tone).toBeGreaterThan(0.78);
      expect(l.tone).toBeLessThan(1.13);
    }
  });
});
