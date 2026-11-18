import { describe, expect, it } from 'vitest';

import { CAMP_ZONE, gridCells, inCampZone, pathStaysOpen, type GridCellKind, type GridWorld } from './homeGrid';

// A GRADE DO ACAMPAMENTO: verde onde dá para pôr, vermelho no mato alto e onde a peça fecharia o caminho; as peças
// postas e as fixas aparecem como peças; o que não é chão do acampamento nem aparece.

/**
 * Um acampamento de brinquedo: chão livre na zona inteira, menos o que se pede. `walls` são sólidos (e `void`); o
 * resto dos tipos se dá por tile.
 */
const world = (opts: {
  kinds?: Record<string, GridCellKind>;
  walls?: string[];
  hero?: { x: number; y: number };
  keep?: Array<{ x: number; y: number }>;
}): GridWorld => {
  const kinds = opts.kinds ?? {};
  const walls = new Set(opts.walls ?? []);
  return {
    kind: (x, y) => (walls.has(`${x},${y}`) ? 'void' : kinds[`${x},${y}`] ?? 'open'),
    walkable: (x, y) => !walls.has(`${x},${y}`) && !['grass', 'fixed', 'piece'].includes(kinds[`${x},${y}`] ?? 'open'),
    canStep: () => true,
    hero: opts.hero ?? { x: 54, y: 48 },
    keep: opts.keep ?? [],
  };
};

describe('a grade do acampamento', () => {
  it('a zona é o retângulo em volta da clareira', () => {
    expect(inCampZone(CAMP_ZONE.x0, CAMP_ZONE.y0)).toBe(true);
    expect(inCampZone(CAMP_ZONE.x1 + 1, CAMP_ZONE.y0)).toBe(false);
    expect(inCampZone(53, 48)).toBe(true);
  });

  it('chão livre é verde; mato alto é vermelho; peças e o tile do herói não recebem nada; o vazio nem aparece', () => {
    const cells = gridCells(world({
      kinds: { '50,46': 'grass', '53,48': 'fixed', '52,47': 'piece', '56,46': 'item' },
      walls: ['49,45'],
    }));
    const at = (x: number, y: number) => cells.find((c) => c.x === x && c.y === y)?.state;
    expect(at(55, 50)).toBe('free');
    expect(at(50, 46)).toBe('grass');
    expect(at(53, 48)).toBe('fixed');
    expect(at(52, 47)).toBe('piece');
    expect(at(56, 46)).toBe('blocked');
    expect(at(54, 48)).toBe('blocked');
    expect(at(49, 45)).toBeUndefined();
  });

  it('o tile que fecharia o caminho até o colchão fica vermelho', () => {
    // Um corredor: o colchão em (53,48) só se alcança pelo (54,48), e o herói está do lado de fora, em (56,48).
    const walls: string[] = [];
    for (let y: number = CAMP_ZONE.y0; y <= CAMP_ZONE.y1; y += 1) {
      for (let x: number = CAMP_ZONE.x0; x <= CAMP_ZONE.x1; x += 1) {
        if (y !== 48 || x < 54) walls.push(`${x},${y}`);
      }
    }
    const w = world({ walls: walls.filter((k) => k !== '53,48'), kinds: { '53,48': 'fixed' }, hero: { x: 57, y: 48 }, keep: [{ x: 53, y: 48 }] });
    expect(pathStaysOpen(w, { x: 54, y: 48 })).toBe(false);
    const cells = gridCells(w);
    expect(cells.find((c) => c.x === 54 && c.y === 48)?.state).toBe('blocked');
  });

  it('ninguém se tranca dentro do acampamento: a saída da zona tem de continuar aberta', () => {
    const w = world({ hero: { x: 54, y: 48 } });
    expect(pathStaysOpen(w, null)).toBe(true);
    // Fechando o retângulo inteiro em volta do herói, não há saída.
    const ring = [[53, 47], [54, 47], [55, 47], [53, 48], [55, 48], [53, 49], [54, 49], [55, 49]].map(([x, y]) => `${x},${y}`);
    expect(pathStaysOpen(world({ walls: ring.slice(1), hero: { x: 54, y: 48 } }), { x: 53, y: 47 })).toBe(false);
  });

  it('a peça levantada libera o tile dela enquanto está na mão', () => {
    const w = world({ kinds: { '52,47': 'piece' } });
    const cells = gridCells(w, { x: 52, y: 47 });
    expect(cells.find((c) => c.x === 52 && c.y === 47)?.state).toBe('free');
  });
});
