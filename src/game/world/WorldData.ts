import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import type { DialogScript, DialogVoice } from '@/game/dialogs/NpcDialogs';
import type { ChunkData } from './Chunk';
import type { NpcKind, ScreenContent } from './ScreenContent';
import { WORLD_SCHEMA_VERSION, type WorldChunk, type WorldData, type WorldProp } from './worldSchema';

// Single seam through which the whole runtime reads the finite, authored world. The data is
// loaded once (from public/world.json in PreloadScene) and set here before any gameplay
// scene starts. Everything else — ChunkManager, GameScene, the entity managers — reads
// terrain, spawns, props and dialog through these accessors.

type WorldBounds = {
  minCx: number; maxCx: number;
  minCy: number; maxCy: number;
  minTileX: number; maxTileX: number;
  minTileY: number; maxTileY: number;
};

// Frames used to render tiles outside the authored 0..N-1 grid, so the finite world has a
// visible, solid border instead of an abrupt cut.
const VOID_GROUND_FRAME = 5;
const VOID_WALL_FRAME = 4;

const chunkKey = (cx: number, cy: number): string => `${cx},${cy}`;

let world: WorldData | null = null;
let chunkByKey = new Map<string, WorldChunk>();
let bounds: WorldBounds | null = null;

const EMPTY_CONTENT: ScreenContent = { enemies: [], pickups: [], npcs: [] };

export const setWorldData = (raw: unknown): void => {
  const data = raw as WorldData | null;
  if (!data || typeof data !== 'object' || !data.meta) {
    throw new Error('world.json invalido: meta ausente');
  }
  if (data.meta.schemaVersion !== WORLD_SCHEMA_VERSION) {
    throw new Error(`world.json schemaVersion ${data.meta.schemaVersion} != ${WORLD_SCHEMA_VERSION}`);
  }
  if (data.meta.chunkColumns !== CHUNK_COLUMNS || data.meta.chunkRows !== CHUNK_ROWS) {
    throw new Error(
      `world.json chunk dims ${data.meta.chunkColumns}x${data.meta.chunkRows} != build ${CHUNK_COLUMNS}x${CHUNK_ROWS}`,
    );
  }

  world = data;
  chunkByKey = new Map(data.chunks.map((chunk) => [chunkKey(chunk.cx, chunk.cy), chunk]));
  bounds = {
    minCx: 0,
    maxCx: data.meta.worldChunksX - 1,
    minCy: 0,
    maxCy: data.meta.worldChunksY - 1,
    minTileX: 0,
    maxTileX: (data.meta.worldChunksX * CHUNK_COLUMNS) - 1,
    minTileY: 0,
    maxTileY: (data.meta.worldChunksY * CHUNK_ROWS) - 1,
  };
};

export const isWorldDataReady = (): boolean => world !== null;

const requireWorld = (): WorldData => {
  if (!world) throw new Error('WorldData nao inicializado: chame setWorldData (PreloadScene) antes do jogo');
  return world;
};

const requireBounds = (): WorldBounds => {
  if (!bounds) throw new Error('WorldData nao inicializado: chame setWorldData (PreloadScene) antes do jogo');
  return bounds;
};

export const getWorldBounds = (): WorldBounds => requireBounds();

export const isInsideWorld = (cx: number, cy: number): boolean => {
  const b = requireBounds();
  return cx >= b.minCx && cx <= b.maxCx && cy >= b.minCy && cy <= b.maxCy;
};

const buildVoidChunk = (cx: number, cy: number): ChunkData => ({
  cx,
  cy,
  ground: Array.from({ length: CHUNK_ROWS }, () => Array.from({ length: CHUNK_COLUMNS }, () => VOID_GROUND_FRAME)),
  upper: Array.from({ length: CHUNK_ROWS }, () => Array.from({ length: CHUNK_COLUMNS }, () => VOID_WALL_FRAME as number | null)),
  collisions: Array.from({ length: CHUNK_ROWS }, () => Array.from({ length: CHUNK_COLUMNS }, () => true)),
});

// Out-of-bounds chunks are solid void, which is what makes the world edges hard: getTile
// reports collision=true there and the existing movement/enemy blockers stop at it.
export const getChunkTerrain = (cx: number, cy: number): ChunkData => {
  const chunk = chunkByKey.get(chunkKey(cx, cy));
  if (!chunk) return buildVoidChunk(cx, cy);
  return { cx, cy, ground: chunk.ground, upper: chunk.upper, collisions: chunk.collisions };
};

export const getChunkContent = (cx: number, cy: number): ScreenContent => {
  const chunk = chunkByKey.get(chunkKey(cx, cy));
  if (!chunk) return EMPTY_CONTENT;
  return { enemies: chunk.enemies, pickups: chunk.pickups, npcs: chunk.npcs };
};

export const getPlayerStart = (): { worldX: number; worldY: number } => requireWorld().meta.playerStart;

export const getCampfires = (): WorldProp[] => requireWorld().props.filter((prop) => prop.type === 'campfire');

export const getDryBushes = (): WorldProp[] => requireWorld().props.filter((prop) => prop.type === 'dryBush');

export const getLockedDoors = (): WorldProp[] => requireWorld().props.filter((prop) => prop.type === 'lockedDoor');

// Held items (sword/key) are loaded once, up front — unlike streamed hearts — because the
// hero can drop and swap them anywhere, so they must persist off-screen.
export const getHeldItemPickups = (): Array<{ type: 'sword' | 'key'; worldX: number; worldY: number }> => {
  const out: Array<{ type: 'sword' | 'key'; worldX: number; worldY: number }> = [];
  for (const chunk of requireWorld().chunks) {
    for (const pickup of chunk.pickups) {
      if (pickup.type === 'sword' || pickup.type === 'key') {
        out.push({ type: pickup.type, worldX: pickup.worldX, worldY: pickup.worldY });
      }
    }
  }
  return out;
};

export const getDialog = (kind: NpcKind): DialogScript | undefined => {
  const dialog = requireWorld().dialogs[kind];
  if (!dialog) return undefined;
  return {
    npcName: dialog.npcName,
    npcColorHex: dialog.npcColorHex,
    npcAssetKey: dialog.npcAssetKey,
    npcFrame: dialog.npcFrame,
    lines: dialog.lines,
  };
};

export const getDialogVoice = (kind: NpcKind): DialogVoice | undefined => requireWorld().dialogs[kind]?.voice;

export const getDialogKinds = (): NpcKind[] => Object.keys(requireWorld().dialogs) as NpcKind[];
