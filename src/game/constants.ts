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
  itemShadow: 'item-shadow',
  lookedDoorObject: 'looked-door-object',
  undead: 'undead',
  undeadHurt: 'undead-hurt',
  coin: 'coin',
  bat: 'bat',
  batHurt: 'bat-hurt',
  mage: 'mage',
  mageHurt: 'mage-hurt',
  magicBall: 'magic-ball',
  slime: 'slime',
  slimePool: 'slime-pool',
  bigSlime: 'big-slime',
  bigSlimePool: 'big-slime-pool',
  spider: 'spider',
  webSpider: 'web-spider',
  swordOnFire: 'sword-on-fire',
  campfireFrame0: 'campfire-f0',
  campfireFrame1: 'campfire-f1',
  campfireFrame2: 'campfire-f2',
  tinyFire0: 'tiny-fire0',
  tinyFire1: 'tiny-fire1',
  tinyFire2: 'tiny-fire2',
} as const;

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
  death: { key: ASSET_KEYS.npcDeath },
};

export const ITEM_FRAMES = {
  swordIdle: 0,
} as const;
