import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import type { ChunkData } from './Chunk';

const GROUND_TILE = 5;
const DECOR_FRAMES = [0, 6, 7, 8, 11] as const;
const COLLISION_FRAMES = [4, 10, 15, 16, 17] as const;
const EDGE_OPENING_X_START = 6;
const EDGE_OPENING_X_END = 9;
const EDGE_OPENING_Y_START = 4;
const EDGE_OPENING_Y_END = 6;
const CENTER_X = Math.floor(CHUNK_COLUMNS / 2);
const CENTER_Y = Math.floor(CHUNK_ROWS / 2);

export const WORLD_CHUNK_COLUMNS = 8;
export const WORLD_CHUNK_ROWS = 4;
export const WORLD_MIN_CHUNK_X = -4;
export const WORLD_MAX_CHUNK_X = WORLD_MIN_CHUNK_X + WORLD_CHUNK_COLUMNS - 1;
export const WORLD_MIN_CHUNK_Y = -2;
export const WORLD_MAX_CHUNK_Y = WORLD_MIN_CHUNK_Y + WORLD_CHUNK_ROWS - 1;
export const START_SCREEN_CHUNK_X = 0;
export const START_SCREEN_CHUNK_Y = 0;
export const START_SCREEN_PLAYER_X = (START_SCREEN_CHUNK_X * CHUNK_COLUMNS) + CENTER_X;
export const START_SCREEN_PLAYER_Y = (START_SCREEN_CHUNK_Y * CHUNK_ROWS) + CENTER_Y;

type ChunkTheme = 'start' | 'woods' | 'pillars' | 'crossroads' | 'thicket' | 'arena';
type ChunkBlueprint = {
  theme: ChunkTheme;
  openings: {
    north: boolean;
    east: boolean;
    south: boolean;
    west: boolean;
  };
};

const WORLD_LAYOUT: readonly (readonly ChunkBlueprint[])[] = [
  [
    { theme: 'arena', openings: { north: false, east: true, south: true, west: false } },
    { theme: 'woods', openings: { north: false, east: true, south: false, west: true } },
    { theme: 'pillars', openings: { north: false, east: true, south: true, west: true } },
    { theme: 'thicket', openings: { north: false, east: false, south: true, west: true } },
    { theme: 'arena', openings: { north: false, east: true, south: true, west: false } },
    { theme: 'woods', openings: { north: false, east: true, south: false, west: true } },
    { theme: 'pillars', openings: { north: false, east: true, south: true, west: true } },
    { theme: 'arena', openings: { north: false, east: false, south: true, west: true } },
  ],
  [
    { theme: 'woods', openings: { north: true, east: true, south: true, west: false } },
    { theme: 'crossroads', openings: { north: false, east: true, south: true, west: true } },
    { theme: 'thicket', openings: { north: true, east: true, south: false, west: true } },
    { theme: 'pillars', openings: { north: true, east: true, south: true, west: true } },
    { theme: 'woods', openings: { north: true, east: true, south: true, west: true } },
    { theme: 'crossroads', openings: { north: false, east: true, south: true, west: true } },
    { theme: 'thicket', openings: { north: true, east: false, south: true, west: true } },
    { theme: 'arena', openings: { north: true, east: false, south: true, west: false } },
  ],
  [
    { theme: 'pillars', openings: { north: true, east: false, south: true, west: false } },
    { theme: 'thicket', openings: { north: true, east: true, south: true, west: false } },
    { theme: 'woods', openings: { north: false, east: true, south: true, west: true } },
    { theme: 'crossroads', openings: { north: true, east: true, south: true, west: true } },
    { theme: 'start', openings: { north: true, east: true, south: true, west: true } },
    { theme: 'pillars', openings: { north: true, east: true, south: false, west: true } },
    { theme: 'woods', openings: { north: true, east: true, south: true, west: true } },
    { theme: 'arena', openings: { north: true, east: false, south: true, west: true } },
  ],
  [
    { theme: 'arena', openings: { north: true, east: true, south: false, west: false } },
    { theme: 'woods', openings: { north: true, east: true, south: false, west: true } },
    { theme: 'pillars', openings: { north: true, east: false, south: false, west: true } },
    { theme: 'arena', openings: { north: true, east: true, south: false, west: false } },
    { theme: 'woods', openings: { north: true, east: true, south: false, west: true } },
    { theme: 'crossroads', openings: { north: false, east: true, south: false, west: true } },
    { theme: 'thicket', openings: { north: true, east: true, south: false, west: true } },
    { theme: 'arena', openings: { north: true, east: false, south: false, west: true } },
  ],
] as const;

const hash = (a: number, b: number, c: number, d: number): number => {
  let v = (((a * 73856093) ^ (b * 19349663) ^ (c * 83492791) ^ (d * 48397741)) >>> 0);
  v = (((v >> 16) ^ v) * 0x45d9f3b) >>> 0;
  v = (((v >> 16) ^ v) * 0x45d9f3b) >>> 0;
  return ((v >> 16) ^ v) >>> 0;
};

const getBlueprint = (cx: number, cy: number): ChunkBlueprint => {
  const row = cy - WORLD_MIN_CHUNK_Y;
  const column = cx - WORLD_MIN_CHUNK_X;
  return WORLD_LAYOUT[row][column];
};

const isWorldChunk = (cx: number, cy: number): boolean => (
  cx >= WORLD_MIN_CHUNK_X
  && cx <= WORLD_MAX_CHUNK_X
  && cy >= WORLD_MIN_CHUNK_Y
  && cy <= WORLD_MAX_CHUNK_Y
);

const setUpperTile = (
  upper: (number | null)[][],
  collisions: boolean[][],
  lx: number,
  ly: number,
  frame: number,
  collision: boolean,
): void => {
  upper[ly][lx] = frame;
  collisions[ly][lx] = collision;
};

const addEdgeWalls = (blueprint: ChunkBlueprint, upper: (number | null)[][], collisions: boolean[][]): void => {
  for (let i = 0; i < CHUNK_COLUMNS; i++) {
    const openNorth = blueprint.openings.north && i >= EDGE_OPENING_X_START && i <= EDGE_OPENING_X_END;
    const openSouth = blueprint.openings.south && i >= EDGE_OPENING_X_START && i <= EDGE_OPENING_X_END;

    if (!openNorth) setUpperTile(upper, collisions, i, 0, COLLISION_FRAMES[i % COLLISION_FRAMES.length], true);
    if (!openSouth) setUpperTile(upper, collisions, i, CHUNK_ROWS - 1, COLLISION_FRAMES[(i + 1) % COLLISION_FRAMES.length], true);
  }

  for (let i = 0; i < CHUNK_ROWS; i++) {
    const openWest = blueprint.openings.west && i >= EDGE_OPENING_Y_START && i <= EDGE_OPENING_Y_END;
    const openEast = blueprint.openings.east && i >= EDGE_OPENING_Y_START && i <= EDGE_OPENING_Y_END;

    if (!openWest) setUpperTile(upper, collisions, 0, i, COLLISION_FRAMES[(i + 2) % COLLISION_FRAMES.length], true);
    if (!openEast) setUpperTile(upper, collisions, CHUNK_COLUMNS - 1, i, COLLISION_FRAMES[(i + 3) % COLLISION_FRAMES.length], true);
  }
};

const addThemeDetails = (
  cx: number,
  cy: number,
  blueprint: ChunkBlueprint,
  upper: (number | null)[][],
  collisions: boolean[][],
): void => {
  const placeDecor = (lx: number, ly: number): void => {
    if (lx < 0 || lx >= CHUNK_COLUMNS || ly < 0 || ly >= CHUNK_ROWS) return;
    if (upper[ly][lx] !== null) return;
    upper[ly][lx] = DECOR_FRAMES[hash(cx, cy, lx, ly) % DECOR_FRAMES.length];
  };

  const placeObstacle = (lx: number, ly: number): void => {
    if (lx < 0 || lx >= CHUNK_COLUMNS || ly < 0 || ly >= CHUNK_ROWS) return;
    if (upper[ly][lx] !== null) return;
    setUpperTile(upper, collisions, lx, ly, COLLISION_FRAMES[hash(cx + 11, cy + 13, lx, ly) % COLLISION_FRAMES.length], true);
  };

  switch (blueprint.theme) {
    case 'start':
      for (let ly = 2; ly <= CHUNK_ROWS - 3; ly += 3) {
        for (let lx = 3; lx <= 12; lx += 3) {
          if (Math.abs(lx - CENTER_X) <= 1 && Math.abs(ly - CENTER_Y) <= 1) continue;
          placeDecor(lx, ly);
        }
      }
      break;
    case 'woods':
      for (let ly = 2; ly < CHUNK_ROWS - 1; ly += 2) {
        for (let lx = 2 + ((ly / 2) % 2); lx < CHUNK_COLUMNS - 2; lx += 4) {
          if (lx >= EDGE_OPENING_X_START && lx <= EDGE_OPENING_X_END && Math.abs(ly - CENTER_Y) <= 1) continue;
          placeDecor(lx, ly);
        }
      }
      break;
    case 'pillars':
      for (const [lx, ly] of [[4, 3], [11, 3], [4, 7], [11, 7], [CENTER_X, CENTER_Y]] as const) {
        if (lx === CENTER_X && ly === CENTER_Y && blueprint.openings.north && blueprint.openings.south && blueprint.openings.east && blueprint.openings.west) {
          continue;
        }
        placeObstacle(lx, ly);
      }
      break;
    case 'crossroads':
      for (let i = 2; i < CHUNK_COLUMNS - 2; i++) {
        if (i < EDGE_OPENING_X_START || i > EDGE_OPENING_X_END) {
          placeDecor(5, CENTER_Y - 2);
          placeDecor(10, CENTER_Y - 2);
          placeDecor(i, CENTER_Y - 2);
          placeDecor(i, CENTER_Y + 2);
        }
      }
      for (let i = 2; i < CHUNK_ROWS - 2; i++) {
        if (i < EDGE_OPENING_Y_START || i > EDGE_OPENING_Y_END) {
          placeDecor(5, i);
          placeDecor(10, i);
        }
      }
      break;
    case 'thicket':
      for (let ly = 2; ly < CHUNK_ROWS - 2; ly++) {
        for (let lx = 3; lx < CHUNK_COLUMNS - 3; lx++) {
          const centerLane = Math.abs(lx - CENTER_X) <= 1 || Math.abs(ly - CENTER_Y) <= 1;
          if (centerLane) continue;
          if (hash(cx, cy, lx, ly) % 5 === 0) {
            placeObstacle(lx, ly);
          } else if (hash(cx + 5, cy + 7, lx, ly) % 4 === 0) {
            placeDecor(lx, ly);
          }
        }
      }
      break;
    case 'arena':
      for (let i = 3; i <= 12; i += 3) {
        placeDecor(i, 2);
        placeDecor(i, CHUNK_ROWS - 3);
      }
      for (let i = 2; i < CHUNK_ROWS - 2; i += 2) {
        placeDecor(2, i);
        placeDecor(CHUNK_COLUMNS - 3, i);
      }
      break;
  }

  if (cx === 0 && cy === 0) {
    for (let ly = CENTER_Y - 1; ly <= CENTER_Y + 1; ly++) {
      for (let lx = 6; lx <= 10; lx++) {
        upper[ly][lx] = null;
        collisions[ly][lx] = false;
      }
    }
  }
};

export const isInsideStaticWorld = (cx: number, cy: number): boolean => isWorldChunk(cx, cy);

export const generateChunk = (cx: number, cy: number): ChunkData => {
  const ground: number[][] = [];
  const upper: (number | null)[][] = [];
  const collisions: boolean[][] = [];

  for (let ly = 0; ly < CHUNK_ROWS; ly++) {
    ground[ly] = [];
    upper[ly] = [];
    collisions[ly] = [];

    for (let lx = 0; lx < CHUNK_COLUMNS; lx++) {
      ground[ly][lx] = GROUND_TILE;
      upper[ly][lx] = null;
      collisions[ly][lx] = false;
    }
  }

  if (!isWorldChunk(cx, cy)) {
    for (let ly = 0; ly < CHUNK_ROWS; ly++) {
      for (let lx = 0; lx < CHUNK_COLUMNS; lx++) {
        setUpperTile(upper, collisions, lx, ly, COLLISION_FRAMES[(lx + ly) % COLLISION_FRAMES.length], true);
      }
    }
    return { cx, cy, ground, upper, collisions };
  }

  const blueprint = getBlueprint(cx, cy);
  addEdgeWalls(blueprint, upper, collisions);
  addThemeDetails(cx, cy, blueprint, upper, collisions);

  return { cx, cy, ground, upper, collisions };
};
