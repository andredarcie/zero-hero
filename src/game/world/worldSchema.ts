import type { EnemyKind, NpcKind, PickupKind } from '@/game/world/ScreenContent';

// The world is now a finite, fully-authored 8x8-chunk map defined entirely by a single
// `world.json`. These types are the schema shared by the runtime loader (WorldData.ts) and
// the offline seed generator (scripts/generateWorld.ts). Keep them close to the existing
// runtime shapes (ScreenContent spawns, DialogScript) so nothing downstream has to change.
export const WORLD_SCHEMA_VERSION = 1;

export type WorldMeta = {
  name: string;
  schemaVersion: typeof WORLD_SCHEMA_VERSION;
  worldChunksX: number; // number of chunks across (e.g. 8)
  worldChunksY: number; // number of chunks down (e.g. 8)
  chunkColumns: number; // tiles per chunk, must equal CHUNK_COLUMNS (validated on load)
  chunkRows: number; // tiles per chunk, must equal CHUNK_ROWS (validated on load)
  tileSize: number;
  tilesetKey: string;
  playerStart: { worldX: number; worldY: number };
  exportedAt: string;
};

// Entity placements use absolute tile coordinates — the exact shape the runtime managers
// already consume (see EnemySpawn/PickupSpawn/NpcSpawn in ScreenContent.ts).
export type WorldEnemySpawn = { type: EnemyKind; worldX: number; worldY: number };
export type WorldPickupSpawn = { type: PickupKind; worldX: number; worldY: number };
export type WorldNpcSpawn = { type: NpcKind; worldX: number; worldY: number };

// One screen = terrain grids + the entities that live on it. This is the unit the runtime
// streams and the (future) editor will paint, so terrain and content are co-located.
export type WorldChunk = {
  cx: number; // chunk index, 0..worldChunksX-1
  cy: number; // chunk index, 0..worldChunksY-1
  ground: number[][]; // [row][col], chunkRows x chunkColumns
  upper: Array<Array<number | null>>;
  collisions: boolean[][];
  enemies: WorldEnemySpawn[];
  pickups: WorldPickupSpawn[];
  npcs: WorldNpcSpawn[];
};

// World-level props (not tied to a chunk) so a campfire/dry bush/door can be free-placed
// and repeated. `dryBush` blocks the tile until the flaming sword burns it to ash (see
// DryBushObject); `lockedDoor` blocks until the hero opens it while holding a key (see
// LockedDoorObject). Their collision is resolved at runtime, not baked into the grid.
export type PropKind = 'campfire' | 'dryBush' | 'lockedDoor';
export type WorldProp = { type: PropKind; worldX: number; worldY: number };

export type WorldDialogLine = { speaker: 'npc' | 'narrator'; text: string };

// Folds NPC_DIALOGS + DIALOG_VOICES into one editable record per NPC.
export type WorldDialog = {
  npcName: string;
  npcColorHex: string;
  npcAssetKey: string;
  npcFrame?: number;
  voice: { freq: number; wave: OscillatorType };
  lines: WorldDialogLine[];
};

export type WorldData = {
  meta: WorldMeta;
  chunks: WorldChunk[]; // exactly worldChunksX * worldChunksY entries
  props: WorldProp[];
  dialogs: Partial<Record<NpcKind, WorldDialog>>;
};
