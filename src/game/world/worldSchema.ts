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
  // A puzzle world (the /levels files) — the undead siege is suppressed for it, the way it
  // already is in the lab. Absent/false on the real overworld.
  puzzle?: boolean;
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
// is a small dead bush the axe clears (no drop, no regrow) — a pure physical barrier; `bombSpot`
// is the walkable mark where a carried bomb plants itself when the hero steps on it (the game is
// walk-only — no "use item" button — so placing is a step like collecting is); `plantSpot` is a
// small dug hole: step on it carrying SEEDS (the scythe's product) to plant — a mound covers the
// hole, a full bucket waters it, and real tall grass sprouts after a while; consume that grass
// (scythe → new seeds, or fire) and the hole reopens. The game's renewable, placeable fuel.
// `inserter`: the robotic arm. It takes whatever item is lying on the tile behind it and puts it
// on the tile in front — the only thing in the game that moves an item without the hero carrying
// it, which is why it can cross a barrier the hero cannot. `waterWheel` is its believable power
// source: installed inside a continuous river, it publishes power into a named variable.
export type PropKind = 'campfire' | 'dryBush' | 'lockedDoor' | 'dryTree' | 'rock' | 'tallGrass' | 'lava' | 'water' | 'dryShrub' | 'bridgeSpot' | 'moonflower' | 'bombSpot' | 'plantSpot' | 'inserter' | 'woodenCrate' | 'pressurePlate' | 'waterWheel';

// Which way a prop faces. Clockwise from north, and the SAME order as the frames in a directional
// sheet, so `dir` indexes the art directly: 0=N 1=L 2=S 3=O.
export type PropDir = 0 | 1 | 2 | 3;
// `lit` only applies to campfires: an optional override forcing a fire to start already lit.
// The runtime does not depend on it — the campfire nearest the player start is always the lit
// "home" fire — so it survives being dropped by editor saves (which re-emit only type/x/y).
// `floodgate` only applies to a `lockedDoor`: opening it (with a key) DRAINS the run of water it
// holds back, opening a path AND laying a firebreak. Like `lit`, an editor save drops the flag,
// so floodgate doors are authored in gen-levels, not built in the editor.
// `dir` only applies to an `inserter`, and unlike `lit`/`floodgate` above it is NOT droppable.
// Those two are authored in gen-levels and the runtime can live without them; a rotation is
// placed by hand in the editor and IS the prop's behaviour — which tile it takes from and which
// it puts to. So the editor store had to learn to carry `dir` through place/erase/undo, instead
// of re-emitting bare type/x/y the way it does for every other prop.
export type WorldProp = {
  type: PropKind;
  worldX: number;
  worldY: number;
  lit?: boolean;
  floodgate?: boolean;
  dir?: PropDir;
  // Pressure plates and water wheels publish into this named circuit; an inserter may consume
  // it as optional power. The field lives on the prop because each mechanism can use a different
  // circuit. An unbound inserter keeps legacy self-powered behaviour.
  variable?: string;
};

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
  // Named boolean puzzle state. Optional keeps every schema-v1 world written before global
  // variables valid; the editor normalises it to an empty record as soon as it opens one.
  globalVariables?: Record<string, boolean>;
};
