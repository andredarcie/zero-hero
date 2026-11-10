// AS TRILHAS FALHAS (pedido do autor, 2026-11-09: "os NPCs têm pouca indicação de como chegar até eles"). Duas
// estradas de terra, gastas e com trechos sem estrada no meio, que saem da estrada antiga e levam aos dois primeiros
// pedidos. O Marco e a Thea ficam sem, de propósito: a esses o jogador chega explorando.
//
// O TRAÇADO É DO AUTOR: ele desenhou os dois caminhos no /editor, tile a tile, com a cabeça na estaca como marcador,
// e cada um virou a lista de quinas abaixo (os marcadores saíram do mundo). Aqui mora só o traçado, puro: as quinas,
// com os cantos arredondados onde o arredondado continua em chão livre. Quem pinta é objects/Trails.

import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import { getChunkTerrain, getOccupiedTiles, getTileRelief, getWorldBounds, isWorldDataReady } from '@/game/world/WorldData';

export type TilePoint = { x: number; y: number };
/** O tile barra a trilha? (árvore, água, serra, peça, NPC, fora do mundo) */
export type Blocked = (x: number, y: number) => boolean;

/** As quinas dos dois caminhos que o autor desenhou, da estrada antiga (a ponta que sai) ao vizinho (a que chega). */
export const AUTHORED_TRAILS: ReadonlyArray<{ id: string; seed: number; corners: ReadonlyArray<readonly [number, number]> }> = [
  // da ponta sul da estrada antiga para oeste, desce um nada, segue rente ao sul e sobe até a reta da Shui
  { id: 'trail-shui', seed: 41, corners: [[27, 52], [22, 52], [22, 57], [6, 57], [6, 56], [5, 56], [5, 49], [4, 49]] },
  // da estrada antiga, no (30,40), para oeste e em escada para noroeste até a Sisi
  {
    id: 'trail-sisi',
    seed: 67,
    corners: [
      [30, 40], [25, 40], [25, 39], [24, 39], [24, 38], [22, 38], [22, 36], [21, 36], [21, 29], [20, 29], [20, 27],
      [19, 27], [19, 21], [18, 21],
    ],
  },
];

/** Todos os tiles do caminho desenhado, na ordem: as quinas ligadas em linha reta (elas andam em cruz, tile a tile). */
export const authoredTiles = (corners: ReadonlyArray<readonly [number, number]>): TilePoint[] => {
  const out: TilePoint[] = [];
  for (let i = 0; i < corners.length; i += 1) {
    const [x, y] = corners[i];
    if (i === 0) { out.push({ x, y }); continue; }
    const [px, py] = corners[i - 1];
    const n = Math.max(Math.abs(x - px), Math.abs(y - py));
    for (let k = 1; k <= n; k += 1) out.push({ x: px + (Math.sign(x - px) * k), y: py + (Math.sign(y - py) * k) });
  }
  return out;
};

/** Toda a linha quebrada passa só por chão livre? (amostrada a cada quarto de tile; o centro do tile é o inteiro) */
export const clearPolyline = (points: TilePoint[], blocked: Blocked): boolean => {
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4));
    for (let k = 0; k <= n; k += 1) {
      if (blocked(Math.round(a.x + ((b.x - a.x) * k) / n), Math.round(a.y + ((b.y - a.y) * k) / n))) return false;
    }
  }
  return true;
};

/** As quinas arredondadas (Chaikin): cada canto vira curva; as duas pontas ficam onde estavam. */
export const roundCorners = (points: TilePoint[], iterations = 2): TilePoint[] => {
  let pts = points.slice();
  for (let it = 0; it < iterations && pts.length > 2; it += 1) {
    const next: TilePoint[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
};

/**
 * O traçado de uma trilha desenhada: a fila de tiles do autor com os cantos arredondados. Arredonda-se a FILA (um
 * passo é um tile), e não as quinas soltas: assim a curva fica rente ao canto (a menos de um quarto de tile dele) e
 * a escada vira uma diagonal mansa, sem sair do desenho. A curva corta o canto, e o canto pode ser de um tile que
 * barra: ela só fica se o arredondado continuar inteiro em chão livre (duas passadas, depois uma); senão fica a fila.
 */
export const trailPath = (corners: ReadonlyArray<readonly [number, number]>, blocked: Blocked): TilePoint[] => {
  const straight = authoredTiles(corners);
  for (const iterations of [2, 1]) {
    const rounded = roundCorners(straight, iterations);
    if (clearPolyline(rounded, blocked)) return rounded;
  }
  return straight;
};

/** O que barra a trilha no vale: colisão do chão (árvore, água, fora do mundo), serra, e qualquer peça, item ou NPC. */
export const valleyBlocked = (): Blocked => {
  const occupied = getOccupiedTiles();
  const b = getWorldBounds();
  return (x, y) => {
    const cx = Math.floor(x / CHUNK_COLUMNS);
    const cy = Math.floor(y / CHUNK_ROWS);
    if (cx < b.minCx || cx > b.maxCx || cy < b.minCy || cy > b.maxCy) return true;
    const terrain = getChunkTerrain(cx, cy);
    if (terrain.collisions[y - cy * CHUNK_ROWS]?.[x - cx * CHUNK_COLUMNS]) return true;
    if (getTileRelief(x, y) !== 0) return true;
    return occupied.has(`${x},${y}`);
  };
};

export type ValleyTrail = { id: string; seed: number; points: TilePoint[] };

/** As duas trilhas do vale, prontas para pintar (ver objects/Trails). */
export const valleyTrails = (): ValleyTrail[] => {
  if (!isWorldDataReady()) return [];
  const blocked = valleyBlocked();
  return AUTHORED_TRAILS.map((trail) => ({ id: trail.id, seed: trail.seed, points: trailPath(trail.corners, blocked) }));
};
