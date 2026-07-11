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
// and repeated. Their collision is resolved at runtime, not baked into the grid:
// `dryBush` blocks until fire burns it to ash; `lockedDoor` blocks until opened with a key;
// `dryTree` blocks until chopped to a stump with the axe; `rock` blocks until broken with
// the pickaxe; `tallGrass` blocks until cut with the scythe (or burned); `lava` blocks
// unless the hero wears the lava boots; `water` (a river tile) blocks — a bridge can be built
// over it ONLY where a `bridgeSpot` marker is placed (2 wood sticks / a felled tree); `dryShrub`
// is a small dead bush the axe clears (no drop, no regrow) — a pure physical barrier.
export type PropKind = 'campfire' | 'dryBush' | 'lockedDoor' | 'dryTree' | 'rock' | 'tallGrass' | 'lava' | 'water' | 'dryShrub' | 'bridgeSpot';
// `lit` only applies to campfires: an optional override forcing a fire to start already lit.
// The runtime does not depend on it — the campfire nearest the player start is always the lit
// "home" fire — so it survives being dropped by editor saves (which re-emit only type/x/y).
export type WorldProp = { type: PropKind; worldX: number; worldY: number; lit?: boolean };

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
