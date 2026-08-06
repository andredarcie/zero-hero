import { CHUNK_COLUMNS, CHUNK_ROWS, SEA_TILE_FRAME } from '@/game/constants';
import type { DialogScript, DialogVoice } from '@/game/dialogs/NpcDialogs';
import { localizedNpc } from '@/game/i18n/i18n';
import type { ChunkData } from './Chunk';
import type { NpcKind, PickupKind, ScreenContent } from './ScreenContent';
import {
  WORLD_SCHEMA_VERSION, type ChunkCatalogEntry, type WorldChunk, type WorldData,
  type WorldEnemySpawn, type WorldProp,
} from './worldSchema';

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

// ── the infinite world (explorer mode) ────────────────────────────────────────
//
// Everything above assumes a world that was AUTHORED: a finite grid of chunks read from a
// file, with an edge made of sea. The explorer mode has no file and no edge — the ground is
// generated from a seed as the hero walks, in every direction, forever.
//
// It plugs in HERE rather than beside WorldData because the whole runtime already reads the
// world through this one seam: swap what these accessors answer and ChunkManager, the entity
// managers and World3D are all reading the infinite world without knowing it. Two things a
// generated world cannot answer for itself stay with the authored one: the NPC dialog catalog
// (still world.json's) and the tileset metadata.
//
// The single subtlety is `bounds`, which stops meaning "the world" and starts meaning "the
// WINDOW currently baked into the terrain meshes" — see World3D.rebuildTerrain and
// ExplorerDirector. Nothing but the renderer reads it, because nothing else may: asking an
// infinite world where it ends is a question with no answer.
export type InfiniteWorld = {
  name: string;
  playerStart: { worldX: number; worldY: number };
  /** Generated terrain for a chunk. MUST be memoised by the provider: the runtime edits these
   *  arrays in place (a felled tree clears `upper` + `collisions`) and expects the edit to hold. */
  chunk: (cx: number, cy: number) => ChunkData;
  /** Streamed spawns (hearts, NPCs) for a chunk. */
  content: (cx: number, cy: number) => ScreenContent;
  /** Carriable items laid out at boot — the explorer's camp kit. */
  heldItems: () => Array<{ type: Exclude<PickupKind, 'heart'>; worldX: number; worldY: number }>;
};

let infinite: InfiniteWorld | null = null;
// The props of the chunks currently loaded. The director owns this list and swaps it whole as
// the window moves; GameScene's prop getters read it instead of the authored world's `props`.
let streamedProps: WorldProp[] = [];

export const setInfiniteWorld = (provider: InfiniteWorld | null): void => {
  infinite = provider;
  if (!provider) streamedProps = [];
};

export const isInfiniteWorld = (): boolean => infinite !== null;

/** The chunk rectangle the renderer should bake. Only meaningful while a world is infinite. */
export const setWorldWindow = (minCx: number, minCy: number, maxCx: number, maxCy: number): void => {
  bounds = {
    minCx,
    maxCx,
    minCy,
    maxCy,
    minTileX: minCx * CHUNK_COLUMNS,
    maxTileX: ((maxCx + 1) * CHUNK_COLUMNS) - 1,
    minTileY: minCy * CHUNK_ROWS,
    maxTileY: ((maxCy + 1) * CHUNK_ROWS) - 1,
  };
};

export const setStreamedProps = (props: WorldProp[]): void => { streamedProps = props; };

const allProps = (): WorldProp[] => (infinite ? streamedProps : requireWorld().props);

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
  if (infinite) return true; // there is no outside
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
  if (infinite) return infinite.chunk(cx, cy);
  const chunk = chunkByKey.get(chunkKey(cx, cy));
  if (!chunk) return buildVoidChunk(cx, cy);
  return { cx, cy, ground: chunk.ground, upper: chunk.upper, collisions: chunk.collisions };
};

export const getChunkContent = (cx: number, cy: number): ScreenContent => {
  if (infinite) return infinite.content(cx, cy);
  const chunk = chunkByKey.get(chunkKey(cx, cy));
  if (!chunk) return EMPTY_CONTENT;
  return { enemies: chunk.enemies, pickups: chunk.pickups, npcs: chunk.npcs };
};

export const getPlayerStart = (): { worldX: number; worldY: number } => (
  infinite ? infinite.playerStart : requireWorld().meta.playerStart
);

// The authored display name used by level-select and the in-game level entrance card.
export const getWorldName = (): string => (infinite ? infinite.name : requireWorld().meta.name);

export type ChunkTemplate = {
  catalog: ChunkCatalogEntry;
  ground: number[][];
  upper: Array<Array<number | null>>;
  collisions: boolean[][];
  enemies: ScreenContent['enemies'];
  pickups: ScreenContent['pickups'];
  npcs: ScreenContent['npcs'];
  props: WorldProp[];
};

/**
 * Reads public/world.json as a LIBRARY instead of a traversable overworld. Entity coordinates
 * are normalised to the chunk's local 0..11 space so the same authored template can be placed
 * at any coordinate during a run.
 */
export const getChunkTemplates = (): ChunkTemplate[] => {
  const data = requireWorld();
  return data.chunks.flatMap((chunk) => {
    if (!chunk.catalog) return [];
    const ox = chunk.cx * CHUNK_COLUMNS;
    const oy = chunk.cy * CHUNK_ROWS;
    const local = <T extends { worldX: number; worldY: number }>(entry: T): T => ({
      ...entry,
      worldX: entry.worldX - ox,
      worldY: entry.worldY - oy,
    });
    return [{
      catalog: { ...chunk.catalog },
      ground: chunk.ground.map((row) => [...row]),
      upper: chunk.upper.map((row) => [...row]),
      collisions: chunk.collisions.map((row) => [...row]),
      enemies: chunk.enemies.map(local),
      pickups: chunk.pickups.map(local),
      npcs: chunk.npcs.map(local),
      props: data.props
        .filter((prop) => Math.floor(prop.worldX / CHUNK_COLUMNS) === chunk.cx
          && Math.floor(prop.worldY / CHUNK_ROWS) === chunk.cy)
        .map(local),
    }];
  });
};

// A puzzle world (a /levels level): the runtime suppresses the undead siege for it, like the lab.
export const isPuzzleWorld = (): boolean => requireWorld().meta.puzzle === true;

export const getCampfires = (): WorldProp[] => allProps().filter((prop) => prop.type === 'campfire');

export const getDryBushes = (): WorldProp[] => allProps().filter((prop) => prop.type === 'dryBush');

export const getLockedDoors = (): WorldProp[] => allProps().filter((prop) => prop.type === 'lockedDoor');

/** O portao de bater: sem chave, mas so abre com o tile de tras livre (SwingGateObject). */
export const getSwingGates = (): WorldProp[] => allProps().filter((prop) => prop.type === 'swingGate');

export const getDryTrees = (): WorldProp[] => allProps().filter((prop) => prop.type === 'dryTree');

export const getDryShrubs = (): WorldProp[] => allProps().filter((prop) => prop.type === 'dryShrub');

// A pedra de FERRO: a mesma rocha, quebrada pelas mesmas duas picaretadas, mas o que ela
// deixa no chao e um bloco de ferro em vez de uma pedra. Vira RockObject como qualquer outra
// (com `ore: true`), entao colisao, bomba e picareta valem sem uma linha a mais.
export const getIronRocks = (): WorldProp[] => allProps().filter((prop) => prop.type === 'ironRock');

export const getRocks = (): WorldProp[] => allProps().filter((prop) => prop.type === 'rock');

export const getTallGrass = (): WorldProp[] => allProps().filter((prop) => prop.type === 'tallGrass');

export const getLavaTiles = (): WorldProp[] => allProps().filter((prop) => prop.type === 'lava');

export const getWaterTiles = (): WorldProp[] => allProps().filter((prop) => prop.type === 'water');

export const getBridgeSpots = (): WorldProp[] => allProps().filter((prop) => prop.type === 'bridgeSpot');

// A night-blooming flower: a closed bud (blocks) while a campfire burns near it, open petal-bridge
// (walkable) in the dark. See MoonflowerObject.
export const getMoonflowers = (): WorldProp[] => allProps().filter((prop) => prop.type === 'moonflower');

// The walkable mark where a carried bomb plants itself on step. See BombSpotObject.
export const getBombSpots = (): WorldProp[] => allProps().filter((prop) => prop.type === 'bombSpot');

// The dug hole where carried seeds plant themselves on step. See PlantSpotObject.
export const getPlantSpots = (): WorldProp[] => allProps().filter((prop) => prop.type === 'plantSpot');

export const getCarnivorousPlants = (): WorldProp[] => allProps().filter((prop) => prop.type === 'carnivorousPlant');
// The robotic arm. Carries `dir` (which way it faces), the only prop whose extra field is load
// bearing — it decides which tile the arm takes from and which it puts to.
export const getInserters = (): WorldProp[] => allProps().filter((prop) => prop.type === 'inserter');

// The workbench. Carries `dir` for the same load-bearing reason the arm does: it decides which two
// tiles behind it are the slots and which tile in front receives the crafted item.
export const getToolboxes = (): WorldProp[] => allProps().filter((prop) => prop.type === 'toolbox');

// A solid box the hero moves by walking into it; it never occupies the hero's hand slot.
export const getWoodenCrates = (): WorldProp[] => allProps().filter((prop) => prop.type === 'woodenCrate');

// Walkable floor switches. `variable` names the global boolean circuit they drive.
export const getPressurePlates = (): WorldProp[] => allProps().filter((prop) => prop.type === 'pressurePlate');

// In-river generators. The prop owns water on its tile and requires that active water to
// continue through a neighbour before publishing power into the prop's named variable.
export const getWaterWheels = (): WorldProp[] => allProps().filter((prop) => prop.type === 'waterWheel');
export const getBoilers = (): WorldProp[] => allProps().filter((prop) => prop.type === 'boiler');
export const getWires = (): WorldProp[] => allProps().filter((prop) => prop.type === 'wire');
export const getElectronicGates = (): WorldProp[] => allProps().filter((prop) => prop.type === 'electronicGate');
export const getLevelPortals = (): WorldProp[] => allProps().filter((prop) => prop.type === 'levelPortal');

export const getGlobalVariables = (): Record<string, boolean> => ({ ...(requireWorld().globalVariables ?? {}) });

// Os PONTOS DE SPAWN de inimigo, autorados na aba Inimigos do editor. Lidos de uma vez, como os
// itens de mao e nunca por chunk, porque uma cova nao e conteudo de tela: ela guarda um relogio
// de respawn que precisa continuar contando com o heroi do outro lado do mapa (ver
// EnemySpawnerManager). Streamar isto zeraria o relogio a cada ida e volta.
//
// Mundo infinito devolve NADA de proposito: o explorador nao autora nada, e o cerco dinamico
// (UndeadSpawnDirector, com a pressao da distancia) e o sistema que faz o perigo daquele modo.
export const getEnemySpawns = (): WorldEnemySpawn[] => {
  if (infinite) return [];
  const out: WorldEnemySpawn[] = [];
  for (const chunk of requireWorld().chunks) {
    // `?? []` porque um chunk escrito a mao pode nao ter a lista; o resto do runtime nunca a leu.
    for (const enemy of chunk.enemies ?? []) {
      out.push({ type: enemy.type, worldX: enemy.worldX, worldY: enemy.worldY });
    }
  }
  return out;
};

// Held items (everything except streamed hearts) are loaded once, up front, because the
// hero can drop and swap them anywhere, so they must persist off-screen.
export const getHeldItemPickups = (): Array<{ type: Exclude<PickupKind, 'heart'>; worldX: number; worldY: number }> => {
  const out: Array<{ type: Exclude<PickupKind, 'heart'>; worldX: number; worldY: number }> = [];
  // An infinite world has no authored chunks to walk — it lays out its own kit (the explorer's
  // camp tools), and reading the overworld's chunks here would sprinkle the adventure's sword,
  // key and lava boots across a camp that never placed them.
  if (infinite) return infinite.heldItems();
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
    // O balcão vem SEMPRE do world.json (não há versão localizada: o jogo é só inglês e as
    // falas do caixa moram no próprio bloco `trade`).
    trade: dialog.trade,
  };
};

export const getDialogVoice = (kind: NpcKind): DialogVoice | undefined => requireWorld().dialogs[kind]?.voice;

export const getDialogKinds = (): NpcKind[] => Object.keys(requireWorld().dialogs) as NpcKind[];
