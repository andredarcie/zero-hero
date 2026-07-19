import { CHUNK_COLUMNS, CHUNK_ROWS, SEA_TILE_FRAME } from '@/game/constants';
import type { DialogScript, DialogVoice } from '@/game/dialogs/NpcDialogs';
import { localizedNpc } from '@/game/i18n/i18n';
import type { ChunkData } from './Chunk';
import type { NpcKind, PickupKind, ScreenContent } from './ScreenContent';
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

// Everything outside the authored 0..N-1 grid is OPEN SEA, so the finite world has a visible,
// solid border instead of an abrupt cut.
//
// It used to be dirt under a wall of pine tiles (frame 4), and that stopped working the day the
// steel axe learned to fell any tree: the border was made of the exact thing the new item
// exists to destroy, so a player could simply chop a doorway and walk off the map. The fix is
// not to special-case the axe at the edge — a border you have to remember to defend will be
// forgotten by the next feature. It is to build the border out of something no item answers.
// Water is that thing: nothing in the game removes water. The bridge, the ford and the boots
// all CROSS a river tile, and none of them apply here, because the sea's collision comes from
// SOLID_GROUND_FRAMES (unconditional) rather than from a WaterObject (which the boots wade).
const VOID_GROUND_FRAME = SEA_TILE_FRAME;

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
  // No upper layer: open water has nothing standing in it. (A pine wall here would also be
  // choppable now — see the note on VOID_GROUND_FRAME.)
  upper: Array.from({ length: CHUNK_ROWS }, () => Array.from({ length: CHUNK_COLUMNS }, () => null as number | null)),
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

// A puzzle world (a /levels level): the runtime suppresses the undead siege for it, like the lab.
export const isPuzzleWorld = (): boolean => requireWorld().meta.puzzle === true;

export const getCampfires = (): WorldProp[] => requireWorld().props.filter((prop) => prop.type === 'campfire');

export const getDryBushes = (): WorldProp[] => requireWorld().props.filter((prop) => prop.type === 'dryBush');

export const getLockedDoors = (): WorldProp[] => requireWorld().props.filter((prop) => prop.type === 'lockedDoor');

export const getDryTrees = (): WorldProp[] => requireWorld().props.filter((prop) => prop.type === 'dryTree');

export const getDryShrubs = (): WorldProp[] => requireWorld().props.filter((prop) => prop.type === 'dryShrub');

export const getRocks = (): WorldProp[] => requireWorld().props.filter((prop) => prop.type === 'rock');

export const getTallGrass = (): WorldProp[] => requireWorld().props.filter((prop) => prop.type === 'tallGrass');

export const getLavaTiles = (): WorldProp[] => requireWorld().props.filter((prop) => prop.type === 'lava');

export const getWaterTiles = (): WorldProp[] => requireWorld().props.filter((prop) => prop.type === 'water');

export const getBridgeSpots = (): WorldProp[] => requireWorld().props.filter((prop) => prop.type === 'bridgeSpot');

// A night-blooming flower: a closed bud (blocks) while a campfire burns near it, open petal-bridge
// (walkable) in the dark. See MoonflowerObject.
export const getMoonflowers = (): WorldProp[] => requireWorld().props.filter((prop) => prop.type === 'moonflower');

// The walkable mark where a carried bomb plants itself on step. See BombSpotObject.
export const getBombSpots = (): WorldProp[] => requireWorld().props.filter((prop) => prop.type === 'bombSpot');

// The dug hole where carried seeds plant themselves on step. See PlantSpotObject.
export const getPlantSpots = (): WorldProp[] => requireWorld().props.filter((prop) => prop.type === 'plantSpot');
// The robotic arm. Carries `dir` (which way it faces), the only prop whose extra field is load
// bearing — it decides which tile the arm takes from and which it puts to.
export const getInserters = (): WorldProp[] => requireWorld().props.filter((prop) => prop.type === 'inserter');

// Held items (everything except streamed hearts) are loaded once, up front, because the
// hero can drop and swap them anywhere, so they must persist off-screen.
export const getHeldItemPickups = (): Array<{ type: Exclude<PickupKind, 'heart'>; worldX: number; worldY: number }> => {
  const out: Array<{ type: Exclude<PickupKind, 'heart'>; worldX: number; worldY: number }> = [];
  for (const chunk of requireWorld().chunks) {
    for (const pickup of chunk.pickups) {
      if (pickup.type !== 'heart') {
        out.push({ type: pickup.type, worldX: pickup.worldX, worldY: pickup.worldY });
      }
    }
  }
  return out;
};

// The visual/audio config (portrait sprite, name colour, frame) stays in world.json; the display
// NAME and spoken LINES come from the active locale catalog, keyed by NPC kind. If the catalog has
// no entry for this kind, fall back to the world.json text so nothing goes blank.
export const getDialog = (kind: NpcKind): DialogScript | undefined => {
  const dialog = requireWorld().dialogs[kind];
  if (!dialog) return undefined;
  const localized = localizedNpc(kind);
  return {
    npcName: localized?.name ?? dialog.npcName,
    npcColorHex: dialog.npcColorHex,
    npcAssetKey: dialog.npcAssetKey,
    npcFrame: dialog.npcFrame,
    lines: localized?.lines ?? dialog.lines,
  };
};

export const getDialogVoice = (kind: NpcKind): DialogVoice | undefined => requireWorld().dialogs[kind]?.voice;

export const getDialogKinds = (): NpcKind[] => Object.keys(requireWorld().dialogs) as NpcKind[];
