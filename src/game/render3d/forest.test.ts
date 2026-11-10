import { describe, expect, it } from 'vitest';
import { FOREST_FIRST_FRAME, FOREST_FRAMES, treeLookAt, type ForestContext, type TreeLook } from './forest';

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
