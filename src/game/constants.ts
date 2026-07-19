export const TILE_SIZE = 8;
export const CHARACTER_SIZE = 16;
export const DEFAULT_GAME_WIDTH = 320;
export const DEFAULT_GAME_HEIGHT = 240;
export const GRID_COLUMNS = 8;
export const GRID_ROWS = 8;
export const TILESET_FRAME_SIZE = 16;
export const ITEM_FRAME_SIZE = 16;
export const MIN_BOARD_TILE_SIZE = 24;
export const MAX_CHARACTER_SIZE = 52;
export const BOARD_PANEL_PADDING = 16;
export const TILE_GAP = 6;
export const FONT_FAMILY = "'Press Start 2P', monospace";

// Resolution for every Text object. The game canvas renders at 1x (Scale.NONE, no
// devicePixelRatio scaling) with NEAREST sampling (pixelArt: true). A Text with
// resolution R rasterizes its glyphs to an R× canvas, then draws it scaled by 1/R into the
// 1x buffer — and that NEAREST downscale is what smears the pixel font. Rendering at 1
// keeps a 1:1 texel→pixel mapping so glyphs stay razor sharp; the canvas'
// image-rendering: pixelated handles any hi-DPI upscale crisply.
export const TEXT_RESOLUTION = 1;
// The HUD is removed: no rows are reserved at the top, so the game board fills the whole screen.
export const HUD_RESERVED_ROWS = 0;
// The dialogue panel hugs this fraction of the canvas width, but never grows past
// DIALOG_PANEL_MAX_WIDTH — on wide screens 50% would stretch the text past a comfortable
// reading measure. Shared by DialogOverlay (the panel) and GameScene (the camera pan).
export const DIALOG_PANEL_FRACTION = 0.5;
export const DIALOG_PANEL_MAX_WIDTH = 640;
// Starting/maximum hearts — gameplay health, not a HUD element (the HUD is gone).
export const HUD_HEALTH_MAX = 4;
export const ITEM_FLOAT_AMPLITUDE = 3;
export const ITEM_FLOAT_SPEED = 0.0034;
export const ITEM_SCALE_PULSE = 0.04;
export const EDITOR_PANEL_WIDTH = 320;
export const EDITOR_BUTTON_HEIGHT = 30;
export const EDITOR_BUTTON_WIDTH = 90;
export const EDITOR_PALETTE_COLUMNS = 5;
export const EDITOR_EMPTY_TILE_LABEL = 'Limpar';
export const EDITOR_LEVEL_BUTTON_HEIGHT = 24;
export const EDITOR_LEVEL_LIST_MAX = 5;
export const EDITOR_NEW_LEVEL_FILE_NAME = 'level_new.json';
export const EDITOR_PALETTE_TILE_SIZE = 32;
export const GAMEPLAY_HERO_SCALE = 1;
export const GAMEPLAY_HERO_MAX_SIZE = Number.MAX_SAFE_INTEGER;

export const CHUNK_COLUMNS = 12;
export const CHUNK_ROWS = 12;
export const WORLD_VIEWPORT_COLS = 10;
export const WORLD_VIEWPORT_ROWS = 12;

export const SCENE_DEPTHS = {
  ground: 0,
  decorBelowPlayer: 4,
  grid: 5,
  // Dynamic firelight cast shadows lie on the ground: above the tiles/decor, below every actor
  // (items, player, props) so objects stand on top of their own and each other's shadows.
  castShadow: 6,
  item: 8,
  player: 10,
  object: 18,
  upper: 20,
  lighting: 25,
  ui: 30,
  uiOverlay: 31,
  uiLabel: 32,
  paletteSelection: 35,
  toast: 40,
} as const;

// 2.5D depth sorting: entities lower on screen (greater worldY) are closer to the
// camera, so they draw in front. The band stays above pickups (item=8) and well below
// the lighting overlay (25). worldY spans roughly [-24, 23], giving depths ~9.6..14.3.
const Y_SORT_BASE = 12;
const Y_SORT_STEP = 0.1;
export const ySortDepth = (worldY: number, bias = 0): number =>
  Y_SORT_BASE + (worldY * Y_SORT_STEP) + bias;

export const HERO_FRAMES = {
  idleDown: 3,
  idleUp: 4,
  walkStart: 0,
  walkEnd: 3,
} as const;

export const TIMINGS = {
  /**
   * Milliseconds to cross one tile, at a constant speed — a tap covers ground at exactly the
   * same rate as a held key. It used to be the duration of a per-tile tween, and *which* number
   * you got depended on how you typed: 140ms for a fresh press, but 87ms (×0.62) while holding.
   *
   * 150ms = 6.7 tiles/s: a walk. Holding a key used to cover ground at nearly 10 tiles/s, but it
   * lurched and stalled the whole way, and once the walk ran smoothly that same pace simply read
   * as a sprint. The shop's boots take it back up to ~9.5 (see applyUpgrade).
   */
  moveDurationMs: 150,
  /**
   * Tiles covered by one full 4-frame stride — a property of the hero's legs, not of his speed.
   * The walk cycle is driven by distance rather than by a frame rate (see HeroView), so the feet
   * stay locked to the ground however fast he walks: slow down, and the legs slow down with him.
   * Two tiles per stride puts the cycle near 13fps at a walking pace.
   */
  walkCycleTiles: 2,
  grassRustleDurationMs: 110,
  toastFadeDelayMs: 1600,
  toastFadeDurationMs: 300,
} as const;

export const NPC_FRAMES = {
  blackCat: 0,
  mimic: 1,
  astronaut: 2,
  businessMan: 3,
  radiationSuit: 4,
  painter: 5,
} as const;

export const ASSET_KEYS = {
  hero: 'hero',
  npcs: 'npcs',
  npcSalesman: 'npc-salesman',
  npcPoet: 'npc-poet',
  npcDeath: 'npc-death',
  forestTileset: 'forest-tileset',
  hudHearts: 'hud-hearts',
  hudSlot: 'hud-slot',
  keyItem: 'key-item',
  keyItemIcon: 'key-item-icon',
  hintBalloon: 'hint-balloon',
  swordItem: 'sword-item',
  swordItemIcon: 'sword-item-icon',
  axeIcon: 'axe-icon',
  greatAxeIcon: 'great-axe-icon',
  bombItem: 'bomb-item',
  bombIcon: 'bomb-icon',
  lavaBootsIcon: 'lava-boots-icon',
  pickaxeIcon: 'pickaxe-icon',
  scytheIcon: 'scythe-icon',
  woodItem: 'wood-item',
  woodIcon: 'wood-icon',
  woodOnFireIcon: 'wood-on-fire-icon',
  lookedDoorObject: 'looked-door-object',
  undead: 'undead',
  undeadHurt: 'undead-hurt',
  undeadBorn0: 'undead-born-0',
  undeadBorn1: 'undead-born-1',
  undeadBorn2: 'undead-born-2',
  undeadBorn3: 'undead-born-3',
  undeadBorn4: 'undead-born-4',
  undeadBorn5: 'undead-born-5',
  undeadBorn6: 'undead-born-6',
  coin: 'coin',
  mage: 'mage',
  swordOnFire: 'sword-on-fire',
  dryBush: 'dry-bush',
  dryTree: 'dry-tree',
  dryShrub: 'dry-shrub',
  rock: 'rock',
  rockCracked: 'rock-cracked',
  tallGrassWind0: 'tall-grass-wind0',
  tallGrassWind1: 'tall-grass-wind1',
  cuttingGrass0: 'cutting-grass0',
  cuttingGrass1: 'cutting-grass1',
  cuttingGrass2: 'cutting-grass2',
  cuttingGrass3: 'cutting-grass3',
  seedsItem: 'seeds-item',
  plantHole: 'plant-hole',
  plantMound: 'plant-mound',
  // O braco robotico (spritefactory): 4 frames = 4 orientacoes, e a garra que viaja em 2.
  inserter: 'inserter',
  inserterHand: 'inserter-hand',
  woodenCrate: 'wooden-crate',
  pressurePlate: 'pressure-plate',
  waterWheel: 'water-wheel',
  cutGrass: 'cut-grass',
  cutGrassWind0: 'cut-grass-wind0',
  cutGrassWind1: 'cut-grass-wind1',
  grassFire0: 'grass-fire0',
  grassFire1: 'grass-fire1',
  lavaFloor: 'lava-floor',
  water: 'water',
  water1: 'water-1',
  water2: 'water-2',
  water3: 'water-3',
  bridge: 'bridge',
  campfireFrame0: 'campfire-f0',
  campfireFrame1: 'campfire-f1',
  campfireFrame2: 'campfire-f2',
  tinyFire0: 'tiny-fire0',
  tinyFire1: 'tiny-fire1',
  tinyFire2: 'tiny-fire2',
} as const;

// Sprite Factory sheet: placa solta em cima, pressionada embaixo.
export const PRESSURE_PLATE_FRAMES = { up: 0, down: 1 } as const;

// Sprite Factory: oito orientacoes do rotor, primeiro apagadas e depois com o dinamo ativo.
// O banco duplicado deixa a roda parar em qualquer orientacao sem a lampada teleportar o rotor.
export const WATER_WHEEL_FRAMES = { phases: 8, off: 0, powered: 8 } as const;

// The skull's rise-from-the-ground animation, in playback order (see UndeadEnemy).
export const UNDEAD_BORN_FRAME_KEYS: readonly string[] = [
  ASSET_KEYS.undeadBorn0,
  ASSET_KEYS.undeadBorn1,
  ASSET_KEYS.undeadBorn2,
  ASSET_KEYS.undeadBorn3,
  ASSET_KEYS.undeadBorn4,
  ASSET_KEYS.undeadBorn5,
  ASSET_KEYS.undeadBorn6,
];

// Light radii in tiles. The hero's ambient glow and each campfire punch holes of this size
// in the darkness overlay; the same radius is what undead refuse to step into (they live
// only in the dark). The safety ring is slightly wider than the light so the HUD flips to
// "PERIGO" right at the visible light edge, never while the player still looks lit.
export const LIGHT_RADIUS_TILES = 4.5;
export const CAMPFIRE_SAFE_RADIUS_TILES = 5;

// How long a carried flame (a lit sword or wood club) lasts before it burns out in the dark.
// Re-igniting at any living fire — a lit campfire or a lava pool — resets it. Short enough
// that a long dark crossing is tense; tune against shrine spacing.
export const TORCH_BURN_MS = 5000;

// An NPC standing this close (in tiles) to a still-dead campfire won't hold a real
// conversation until that fire is lit and the ground around it is safe.
export const NPC_GATE_RADIUS_TILES = 3.2;

type NpcVisual = {
  key: string;
  frame?: number;
};

export const NPC_VISUALS: Record<string, NpcVisual> = {
  blackCat: { key: ASSET_KEYS.npcs, frame: NPC_FRAMES.blackCat },
  mimic: { key: ASSET_KEYS.npcs, frame: NPC_FRAMES.mimic },
  astronaut: { key: ASSET_KEYS.npcs, frame: NPC_FRAMES.astronaut },
  businessMan: { key: ASSET_KEYS.npcs, frame: NPC_FRAMES.businessMan },
  radiationSuit: { key: ASSET_KEYS.npcs, frame: NPC_FRAMES.radiationSuit },
  painter: { key: ASSET_KEYS.npcs, frame: NPC_FRAMES.painter },
  salesman: { key: ASSET_KEYS.npcSalesman },
  poet: { key: ASSET_KEYS.npcPoet },
  wizard: { key: ASSET_KEYS.mage },
  death: { key: ASSET_KEYS.npcDeath },
};

export const ITEM_FRAMES = {
  swordIdle: 0,
} as const;

// key.png is a 16x32 sheet of two stacked keys: the top (blue) is the held/HUD item and the
// swing sprite (like the sword), the bottom (white outline) is what sits on the map.
export const KEY_FRAMES = {
  held: 0,
  pickup: 1,
} as const;

// heart.png is a 16x32 sheet built on the same convention as key.png: the top heart is the plain
// one (ink navy, for a lit UI slot), the bottom one carries a bone outline so it reads lying on
// the dark ground — which is the only place the game shows a heart, so `pickup` is what it uses.
export const HEART_FRAMES = {
  plain: 0,
  pickup: 1,
} as const;

// bomb.png is a 16x32 sheet: top = the bomb itself, bottom = a small spark puff (used as
// explosion debris).
export const BOMB_FRAMES = {
  item: 0,
  spark: 1,
} as const;

// woods.png is a 16x96 sheet: the dry tree shrinking one stage per axe chop, frame 0 (full
// tree) through frame 5 (passable stump).
export const DRY_TREE_FRAME_COUNT = 6;

// A felled tree grows back after this long, so the player can never run out of gravetos (the
// fuel for fire) and soft-lock. It only regrows once its tile is clear of the hero and enemies.
export const TREE_REGROW_MS = 60000;

// Upper-layer tileset frames that stand UP off the ground. Being listed here means three
// things at once, which is why it is the only switch a standing tile needs:
//   1. ChunkManager.isCellBlocked treats the cell as collision even with none painted, so the
//      tile blocks the hero and enemies alike (both consult isCellBlocked);
//   2. World3D.buildTerrain builds it as an upright quad that casts a shadow, instead of the
//      flat sticker every other upper tile becomes;
//   3. the editor paints its implicit collision in amber (vs the red of hand-painted).
// An upper-layer frame that is NOT here lies flat on the floor and is walked straight through —
// which is what you want for bones and rubble, and never what you want for a headstone.
// Frame ids index forest_tile_set.png (3 columns): 3 & 21 are dead trees, 4/14/15/16/17/18 are
// pines, and 22 & 25 are the cemetery's spiked head and tomb.
export const SOLID_UPPER_FRAMES: ReadonlySet<number> = new Set([
  3, 4, 14, 15, 16, 17, 18, 21, 22, 25,
  36, 37, // the tree-chop stages (see TREE_CHOP_STAGE_FRAMES): a half-felled tree still blocks
]);

// Which of those standing tiles are TREES — the ones the steel axe (`greatAxe`) can fell.
// The plain axe only ever bites dead wood (the dryTree/dryShrub props); the steel axe is
// defined by cutting ANY tree, and most trees in the world are not props at all: they are
// upper-layer tiles baked into one static mesh (846 of them in world.json). So "any tree"
// has to mean the tile too, or the item's whole promise is a lie the moment you meet a pine.
// Deliberately NOT the whole of SOLID_UPPER_FRAMES: 22 (spiked head) and 25 (tomb) stand up
// the same way but are masonry and bone — an axe that chopped down a gravestone would say
// the frame set means "scenery", when what it means here is "wood".
// A tree TILE comes down the way the dryTree prop does — one stage per swing, not in one blow.
// The prop shrinks through its own 6-frame sheet (woods.png); a tile cannot, because World3D
// merges every standing tile into ONE mesh sampling the tileset atlas, so a tile's stages have
// to be frames of that same atlas. These two are SHARED by all eight tree frames: at 16x16 a
// severed stump keeps no silhouette that says which pine it came from, and eight private
// ladders would be sixteen frames saying the same thing.
export const TREE_CHOP_STAGE_FRAMES: readonly number[] = [36, 37]; // wounded (crown gone), stump
export const CHOPPABLE_UPPER_FRAMES: ReadonlySet<number> = new Set([
  3, 4, 14, 15, 16, 17, 18, 21, // the standing trees themselves
  ...TREE_CHOP_STAGE_FRAMES, // …and what a half-felled one becomes, so the next swing continues
]);

// Chance that felling a common tree yields a graveto. A tile tree is NOT the dry tree's equal:
// there are ~850 of them against 8 dryTree props, and every one of them dropping a stick would
// turn the whole map into an infinite fuel dispenser and flatten the fire economy that the
// scythe, the plant loop and the dryTree's own regrow timer exist to meter. So most of them
// give nothing, and wood stays worth walking for.
export const TREE_TILE_STICK_CHANCE = 0.25;

// Ground-layer frames that BLOCK, the mirror of SOLID_UPPER_FRAMES for the floor. The sea is
// the only one, and it exists because of the steel axe: the world's edge used to be a wall of
// pine tiles (WorldData's VOID_WALL_FRAME), which an axe that fells any tree turns into a door
// out of the map. The sea is the border that no item in the game answers — collision here is
// implicit and unconditional, so it blocks even the lava boots (which wade every OTHER hazard).
export const SEA_TILE_FRAME = 33;
// Three interchangeable paintings of the same water, picked per tile at render time (World3D).
// The river gets away with ONE tile because it is ~30 of them; the sea covers ~11k, and a single
// frame repeated that many times stops reading as water and starts reading as a grid — wallpaper
// (caught in the `machado` playtest shots). The variants are the same grid cyclically shifted,
// so density and dash length are identical and no variant reads lighter than its neighbours.
// Only SEA_TILE_FRAME is ever stored in world data; the others exist purely as art.
export const SEA_TILE_FRAMES: readonly number[] = [SEA_TILE_FRAME, 34, 35];
export const SOLID_GROUND_FRAMES: ReadonlySet<number> = new Set([SEA_TILE_FRAME]);

// Two wood sticks ("gravetos") build one bridge tile over water (see WaterObject); the plank
// art is a dedicated tile (ASSET_KEYS.bridge = bridge.png).
export const BRIDGE_GRAVETOS_REQUIRED = 2;

// River water is animated: these frames (water_0..3.png, a seamless-looping ripple cycle) are
// cycled by WaterObject, exactly like the campfire's flame frames.
export const WATER_FRAME_KEYS: readonly string[] = [
  ASSET_KEYS.water,
  ASSET_KEYS.water1,
  ASSET_KEYS.water2,
  ASSET_KEYS.water3,
];
