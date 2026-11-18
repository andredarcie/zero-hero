// O LUGAR DE CONTINUAR: o tile livre de onde o herói consegue sair andando. Um tile livre cercado de peças prende para
// sempre quem continua ali: o lugar do varal da Shui, ao lado do colchão do acampamento, depois que o mapa da Thea
// aparece na parede (achado jogando do começo ao fim, 2026-11-16: quem salvava dormindo voltava preso nele).

import { canStep } from './relief';

export type TileTest = (x: number, y: number) => boolean;
export type StepTest = (fromX: number, fromY: number, toX: number, toY: number) => boolean;

/** Com tantos tiles livres alcançáveis (contando o próprio), o lugar não é um beco. */
export const ROOMY_TILES = 6;
/** A frente primeiro (quem senta olha para baixo), depois as costas, a esquerda e a direita. */
const DIRS: ReadonlyArray<readonly [number, number]> = [[0, 1], [0, -1], [-1, 0], [1, 0]];

/** Quantos tiles livres se alcançam andando de (x, y), contando ele, até `cap` (parar cedo sai barato). */
export const roomAt = (x: number, y: number, solid: TileTest, cap = ROOMY_TILES, step: StepTest = canStep): number => {
  if (solid(x, y)) return 0;
  const seen = new Set([`${x},${y}`]);
  const queue: Array<readonly [number, number]> = [[x, y]];
  for (let i = 0; i < queue.length && seen.size < cap; i += 1) {
    const [cx, cy] = queue[i];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key) || solid(nx, ny) || !step(cx, cy, nx, ny)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return Math.min(seen.size, cap);
};

/**
 * O tile livre e com espaço mais perto de (x, y): ele mesmo, se servir; senão os vizinhos (na ordem de DIRS) e os
 * anéis seguintes, até `maxRing`. Do colchão, o beco ao lado perde para o chão aberto do outro lado.
 */
export const nearestRoomyTile = (
  x: number, y: number, solid: TileTest, maxRing = 4, step: StepTest = canStep,
): { x: number; y: number } | null => {
  if (roomAt(x, y, solid, ROOMY_TILES, step) >= ROOMY_TILES) return { x, y };
  for (let r = 1; r <= maxRing; r += 1) {
    const ring: Array<{ x: number; y: number }> = r === 1
      ? DIRS.map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
      : [];
    for (let dx = -r; r > 1 && dx <= r; dx += 1) {
      const dy = r - Math.abs(dx);
      ring.push({ x: x + dx, y: y + dy });
      if (dy !== 0) ring.push({ x: x + dx, y: y - dy });
    }
    const roomy = ring.find((t) => roomAt(t.x, t.y, solid, ROOMY_TILES, step) >= ROOMY_TILES);
    if (roomy) return roomy;
  }
  return null;
};
