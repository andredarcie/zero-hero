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
export const HUD_RESERVED_ROWS = 3;
export const HUD_BACKGROUND_COLOR = 0x000000;
export const HUD_HEALTH_MAX = 3;
export const HUD_HEARTS_SCALE = 0.52;
export const HUD_SLOT_SCALE = 0.72;
export const HUD_INNER_PADDING_SCALE = 0.18;
export const HUD_ITEM_SCALE = 0.56;
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

export const ANIMATION_KEYS = {
  heroWalk: 'hero-walk',
} as const;

export const TIMINGS = {
  moveDurationMs: 140,
  walkFrameRate: 12,
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
  swordItem: 'sword-item',
  swordItemIcon: 'sword-item-icon',
  axeIcon: 'axe-icon',
  bombItem: 'bomb-item',
  bombIcon: 'bomb-icon',
  lavaBootsIcon: 'lava-boots-icon',
  pickaxeIcon: 'pickaxe-icon',
  scytheIcon: 'scythe-icon',
  woodItem: 'wood-item',
  woodIcon: 'wood-icon',
  woodOnFireIcon: 'wood-on-fire-icon',
  itemShadow: 'item-shadow',
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
  rock: 'rock',
  rockCracked: 'rock-cracked',
  tallGrassWind0: 'tall-grass-wind0',
  tallGrassWind1: 'tall-grass-wind1',
  cuttingGrass0: 'cutting-grass0',
  cuttingGrass1: 'cutting-grass1',
  cuttingGrass2: 'cutting-grass2',
  cuttingGrass3: 'cutting-grass3',
  cutGrass: 'cut-grass',
  cutGrassWind0: 'cut-grass-wind0',
  cutGrassWind1: 'cut-grass-wind1',
  grassFire0: 'grass-fire0',
  grassFire1: 'grass-fire1',
  lavaFloor: 'lava-floor',
  campfireFrame0: 'campfire-f0',
  campfireFrame1: 'campfire-f1',
  campfireFrame2: 'campfire-f2',
  tinyFire0: 'tiny-fire0',
  tinyFire1: 'tiny-fire1',
  tinyFire2: 'tiny-fire2',
} as const;

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

// bomb.png is a 16x32 sheet: top = the bomb itself, bottom = a small spark puff (used as
// explosion debris).
export const BOMB_FRAMES = {
  item: 0,
  spark: 1,
} as const;

// woods.png is a 16x96 sheet: the dry tree shrinking one stage per axe chop, frame 0 (full
// tree) through frame 5 (passable stump).
export const DRY_TREE_FRAME_COUNT = 6;

// Upper-layer tileset frames that depict trees. Trees are solid "by default":
// ChunkManager.isCellBlocked treats these as collision even where a cell has no authored
// collision painted, so every tree — placed in the editor, generated, or hand-authored —
// blocks the hero and enemies alike (both consult isCellBlocked). Frame ids index
// forest_tile_set.png (3 columns): 3 & 21 are dead trees, 4/14/15/16/17/18 are pines.
export const SOLID_UPPER_FRAMES: ReadonlySet<number> = new Set([3, 4, 14, 15, 16, 17, 18, 21]);
