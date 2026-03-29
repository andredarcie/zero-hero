export const TILE_SIZE = 8;
export const CHARACTER_SIZE = 16;
export const DEFAULT_GAME_WIDTH = 320;
export const DEFAULT_GAME_HEIGHT = 240;
export const GRID_COLUMNS = 8;
export const GRID_ROWS = 8;
export const TILESET_FRAME_SIZE = 16;
export const MIN_BOARD_TILE_SIZE = 24;
export const MAX_CHARACTER_SIZE = 52;
export const BOARD_PANEL_PADDING = 16;
export const TILE_GAP = 6;
export const FONT_FAMILY = 'Trebuchet MS';
export const HUD_RESERVED_ROWS = 1;
export const HUD_BACKGROUND_COLOR = 0x000000;
export const HUD_HEALTH_MAX = 3;
export const HUD_HEARTS_SCALE = 0.52;
export const HUD_SLOT_SCALE = 0.72;
export const HUD_INNER_PADDING_SCALE = 0.18;
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

export const SCENE_DEPTHS = {
  ground: 0,
  decorBelowPlayer: 4,
  grid: 5,
  player: 10,
  upper: 20,
  ui: 20,
  uiOverlay: 21,
  uiLabel: 22,
  paletteSelection: 25,
  toast: 40,
} as const;

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

export const ASSET_KEYS = {
  hero: 'hero',
  forestTileset: 'forest-tileset',
  hudHearts: 'hud-hearts',
  hudSlot: 'hud-slot',
} as const;
