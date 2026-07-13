import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import { WORLD_SCHEMA_VERSION, type WorldChunk, type WorldData } from '@/game/world/worldSchema';

// ── A arena do modo Sobreviventes ──────────────────────────────────────────────
//
// O World3D constrói seu terreno lendo o WorldData ativo (setWorldData), então a
// arena é um WorldData completo gerado EM MEMÓRIA: um campo aberto de grama com
// decoração esparsa, murado por 2 fileiras de pinheiros sólidos. Nenhum arquivo
// novo, nenhum prop de aventura — só chão para a horda. A cena troca o WorldData
// ao entrar e RESTAURA o world.json original no shutdown (ver SurvivorsScene).

const CHUNKS_X = 8;
const CHUNKS_Y = 8;
export const ARENA_TILES_X = CHUNKS_X * CHUNK_COLUMNS; // 96
export const ARENA_TILES_Y = CHUNKS_Y * CHUNK_ROWS; // 96

// Espessura do muro de pinheiros; o retângulo jogável fica dentro dele.
const WALL = 2;
export const ARENA_MIN_X = WALL;
export const ARENA_MAX_X = ARENA_TILES_X - 1 - WALL;
export const ARENA_MIN_Y = WALL;
export const ARENA_MAX_Y = ARENA_TILES_Y - 1 - WALL;

export const ARENA_CENTER_X = Math.floor(ARENA_TILES_X / 2);
export const ARENA_CENTER_Y = Math.floor(ARENA_TILES_Y / 2);

// Frames do forest tileset (os mesmos do gerador offline): 5 = grama base,
// decoração caminhável (tufos/flores) e pinheiros para o muro.
const GROUND_TILE = 5;
const DECOR_FRAMES = [0, 6, 7, 8, 10, 11] as const;
const WALL_TREE_FRAMES = [4, 15, 16, 17] as const;

// Fogueiras decorativas acesas: marcos de luz que quebram a escuridão do campo e
// dão pontos de referência ao jogador cercado (todas começam acesas — não há
// mecânica de tocha aqui, só a atmosfera do jogo-base).
export const ARENA_CAMPFIRES: ReadonlyArray<{ worldX: number; worldY: number }> = [
  { worldX: ARENA_CENTER_X, worldY: ARENA_CENTER_Y - 2 },
  { worldX: ARENA_CENTER_X - 18, worldY: ARENA_CENTER_Y - 14 },
  { worldX: ARENA_CENTER_X + 17, worldY: ARENA_CENTER_Y - 12 },
  { worldX: ARENA_CENTER_X - 15, worldY: ARENA_CENTER_Y + 15 },
  { worldX: ARENA_CENTER_X + 19, worldY: ARENA_CENTER_Y + 13 },
  { worldX: ARENA_CENTER_X - 32, worldY: ARENA_CENTER_Y + 2 },
  { worldX: ARENA_CENTER_X + 31, worldY: ARENA_CENTER_Y - 3 },
];

// Hash determinístico (o mesmo do gerador offline) — a arena é idêntica em toda
// run, então a memória espacial do jogador ("a fogueira torta fica a oeste") vale.
const hash = (a: number, b: number, c: number, d: number): number => {
  let v = (((a * 73856093) ^ (b * 19349663) ^ (c * 83492791) ^ (d * 48397741)) >>> 0);
  v = (((v >> 16) ^ v) * 0x45d9f3b) >>> 0;
  v = (((v >> 16) ^ v) * 0x45d9f3b) >>> 0;
  return ((v >> 16) ^ v) >>> 0;
};

const isWallTile = (tx: number, ty: number): boolean =>
  tx < WALL || ty < WALL || tx >= ARENA_TILES_X - WALL || ty >= ARENA_TILES_Y - WALL;

// Clareira em volta do spawn e das fogueiras para a leitura visual ficar limpa.
const isClearing = (tx: number, ty: number): boolean => {
  if (Math.abs(tx - ARENA_CENTER_X) <= 4 && Math.abs(ty - ARENA_CENTER_Y) <= 4) return true;
  return ARENA_CAMPFIRES.some((c) => Math.abs(tx - c.worldX) <= 2 && Math.abs(ty - c.worldY) <= 2);
};

export const buildSurvivorsWorld = (): WorldData => {
  const chunks: WorldChunk[] = [];
  for (let cy = 0; cy < CHUNKS_Y; cy++) {
    for (let cx = 0; cx < CHUNKS_X; cx++) {
      const ground: number[][] = [];
      const upper: Array<Array<number | null>> = [];
      const collisions: boolean[][] = [];
      for (let ly = 0; ly < CHUNK_ROWS; ly++) {
        ground[ly] = [];
        upper[ly] = [];
        collisions[ly] = [];
        for (let lx = 0; lx < CHUNK_COLUMNS; lx++) {
          const tx = cx * CHUNK_COLUMNS + lx;
          const ty = cy * CHUNK_ROWS + ly;
          ground[ly][lx] = GROUND_TILE;
          upper[ly][lx] = null;
          collisions[ly][lx] = false;

          const r = hash(cx, cy, lx + 1, ly + 1);
          if (isWallTile(tx, ty)) {
            upper[ly][lx] = WALL_TREE_FRAMES[r % WALL_TREE_FRAMES.length];
            collisions[ly][lx] = true;
            continue;
          }
          // Só decoração caminhável no campo: a horda precisa fluir livre — um
          // campo de obstáculos viraria pathfinding, e VS não tem pathfinding.
          if (!isClearing(tx, ty) && r % 100 < 14) {
            upper[ly][lx] = DECOR_FRAMES[(r >> 5) % DECOR_FRAMES.length];
          }
        }
      }
      chunks.push({ cx, cy, ground, upper, collisions, enemies: [], pickups: [], npcs: [] });
    }
  }

  return {
    meta: {
      name: 'survivors-arena',
      schemaVersion: WORLD_SCHEMA_VERSION,
      worldChunksX: CHUNKS_X,
      worldChunksY: CHUNKS_Y,
      chunkColumns: CHUNK_COLUMNS,
      chunkRows: CHUNK_ROWS,
      tileSize: 8,
      tilesetKey: 'forest-tileset',
      playerStart: { worldX: ARENA_CENTER_X, worldY: ARENA_CENTER_Y },
      exportedAt: 'runtime',
    },
    chunks,
    props: [],
    dialogs: {},
  };
};
