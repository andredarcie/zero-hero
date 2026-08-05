import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import type { WorldData } from '@/game/world/worldSchema';
import type { Rng } from './dungeonRandom';
import { classForFrames } from './dungeonSnapshot';
import {
  ROOM_H, ROOM_W, SIDES, TILE, hasDoor, isWalkableClass, laneToXY, sideBit,
  type Side, type TileClass,
} from './dungeonRooms';

/**
 * OS TEMPLATES — as salas feitas à mão, e o único lugar onde o gerador aceita ordem de fora.
 *
 * As formas paramétricas (`dungeonRooms`) garantem que toda sala seja jogável; elas não garantem
 * que alguma sala seja MEMORÁVEL. A variedade percebida vem da quantidade de regra autorada, não
 * da entropia — é o que Spelunky, Edgar e o Unexplored dizem cada um do seu jeito. Este arquivo é
 * a porta por onde essa autoria entra.
 *
 * ── COMO SE AUTORA ──────────────────────────────────────────────────────────────────────────
 * A biblioteca é `public/levels/dungeon-0.json`, editável em **`/lab?dungeon=0`**: cada CHUNK do
 * arquivo é uma sala-template. Não há metadado nenhum a manter em dia — de que lados a sala tem
 * porta se DEDUZ da geometria (os dois tiles do meio de cada parede estarem abertos), então mover
 * uma porta no editor é mover a porta de verdade. Chunk todo maciço = vaga vazia, ignorada.
 *
 * O número zero não é decoração: os portais do overworld apontam para 1..9, então a dungeon 0 é
 * inalcançável por dentro do jogo e visível no laboratório — que é exatamente o que uma folha de
 * peças precisa ser.
 *
 * ── AS OITO SIMETRIAS ───────────────────────────────────────────────────────────────────────
 * Cada template serve a até 8 assinaturas de porta (4 rotações × espelho). Isso é gratuito porque
 * a alvenaria é simétrica e a arte não tem direção — e porque a porta cai em colunas simétricas
 * (5 e 6 numa sala de 12), então girar leva porta em porta sem meio tile de erro.
 */

export type RoomTemplate = {
  grid: TileClass[][];
  /** Bitmask N-L-S-O dos lados com porta. */
  mask: number;
};

const rotateGrid = (grid: TileClass[][]): TileClass[][] => {
  const out: TileClass[][] = Array.from({ length: ROOM_H }, () => new Array<TileClass>(ROOM_W).fill(TILE.wall));
  for (let y = 0; y < ROOM_H; y++) {
    for (let x = 0; x < ROOM_W; x++) out[x][ROOM_W - 1 - y] = grid[y][x];
  }
  return out;
};

const mirrorGrid = (grid: TileClass[][]): TileClass[][] =>
  grid.map((row) => [...row].reverse());

const rotateMask = (mask: number): number => {
  let out = 0;
  for (const side of SIDES) if (hasDoor(mask, side)) out |= sideBit(((side + 1) % 4) as Side);
  return out;
};

const mirrorMask = (mask: number): number => {
  let out = 0;
  for (const side of SIDES) {
    if (!hasDoor(mask, side)) continue;
    out |= sideBit(side === 1 ? 3 : (side === 3 ? 1 : side));
  }
  return out;
};

/** De que lados esta sala tem porta — lido da geometria, nunca de um campo. */
export const maskOfGrid = (grid: TileClass[][]): number => {
  let mask = 0;
  for (const side of SIDES) {
    const a = laneToXY(side, 0, 0);
    const b = laneToXY(side, 0, 1);
    if (isWalkableClass(grid[a.y][a.x]) && isWalkableClass(grid[b.y][b.x])) mask |= sideBit(side);
  }
  return mask;
};

/** Toda porta chega ao miolo? Um template que não passa nisto seria uma sala com porta cega. */
const isSane = (grid: TileClass[][]): boolean => {
  const seen = Array.from({ length: ROOM_H }, () => new Array<boolean>(ROOM_W).fill(false));
  const start: Array<readonly [number, number]> = [[5, 5]];
  if (!isWalkableClass(grid[5][5])) return false;
  seen[5][5] = true;
  while (start.length > 0) {
    const [x, y] = start.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= ROOM_W || ny >= ROOM_H || seen[ny][nx]) continue;
      if (!isWalkableClass(grid[ny][nx])) continue;
      seen[ny][nx] = true;
      start.push([nx, ny]);
    }
  }
  const mask = maskOfGrid(grid);
  if (mask === 0) return false;
  for (const side of SIDES) {
    if (!hasDoor(mask, side)) continue;
    const a = laneToXY(side, 0, 0);
    const b = laneToXY(side, 0, 1);
    if (!seen[a.y][a.x] || !seen[b.y][b.x]) return false;
  }
  return true;
};

/** Lê a folha de peças de um arquivo em forma de mundo. Chunk maciço = vaga vazia. */
export const parseTemplateLibrary = (world: WorldData | null | undefined): RoomTemplate[] => {
  if (!world?.chunks) return [];
  const out: RoomTemplate[] = [];
  for (const chunk of world.chunks) {
    if (chunk.ground.length !== CHUNK_ROWS || chunk.ground[0].length !== CHUNK_COLUMNS) continue;
    const grid: TileClass[][] = [];
    for (let y = 0; y < ROOM_H; y++) {
      const row: TileClass[] = [];
      for (let x = 0; x < ROOM_W; x++) row.push(classForFrames(chunk.ground[y][x], chunk.upper[y][x]));
      grid.push(row);
    }
    if (!isSane(grid)) continue;
    out.push({ grid, mask: maskOfGrid(grid) });
  }
  return out;
};

/**
 * Um template que sirva a esta assinatura de porta, já transformado. `null` quando a biblioteca
 * não tem nenhum — e aí a forma paramétrica assume, que é o caso normal e não uma falha.
 */
export const pickTemplate = (library: readonly RoomTemplate[], mask: number, rng: Rng): TileClass[][] | null => {
  if (library.length === 0) return null;
  const matches: TileClass[][][] = []; // uma lista de SALAS, e cada sala é uma grade
  for (const template of library) {
    for (const mirrored of [false, true]) {
      let grid = mirrored ? mirrorGrid(template.grid) : template.grid;
      let m = mirrored ? mirrorMask(template.mask) : template.mask;
      for (let k = 0; k < 4; k++) {
        if (m === mask) matches.push(grid);
        grid = rotateGrid(grid);
        m = rotateMask(m);
      }
    }
  }
  return matches.length > 0 ? rng.pick(matches) : null;
};

/**
 * Busca a biblioteca no disco público. Falta de arquivo é o estado NORMAL (o jogo nasceu sem
 * nenhuma sala autorada), então 404 devolve lista vazia sem barulho — nunca uma exceção que
 * derrubaria a viagem até a dungeon.
 */
let cached: RoomTemplate[] | null = null;
export const loadTemplateLibrary = async (baseUrl: string): Promise<RoomTemplate[]> => {
  if (cached) return cached;
  try {
    const res = await window.fetch(`${baseUrl}levels/dungeon-0.json`, { cache: 'no-store' });
    cached = res.ok ? parseTemplateLibrary(await res.json() as WorldData) : [];
  } catch {
    cached = [];
  }
  return cached;
};
