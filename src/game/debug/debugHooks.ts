import type Phaser from 'phaser';
import type { NpcKind } from '@/game/world/ScreenContent';

/**
 * Snapshot of the live GameScene, consumed by the playtest harness (see /playtest)
 * to assert on gameplay without screen-scraping pixels.
 */
export interface GameDebugState {
  scene: string;
  player: { worldX: number; worldY: number };
  health: number;
  maxHealth: number;
  swordEquipped: boolean;
  swordOnFire: boolean;
  heldItem: 'none' | 'sword' | 'key';
  groundItems: Array<{ kind: 'sword' | 'key'; worldX: number; worldY: number }>;
  coins: number;
  dialogOpen: boolean;
  shopOpen: boolean;
  itemGetOpen: boolean;
  isDead: boolean;
  /** The dark-siege loop: near a campfire = safe; in the dark the danger meter (0..1)
   *  fills and undead spawn around the hero (see UndeadSpawnDirector). */
  safety: { safe: boolean; danger: number; undeadCount: number };
  activeScreen: { cx: number; cy: number };
}

/**
 * Deterministic control surface the harness uses to *play* the game. Walking blindly to
 * a procedurally-placed NPC is flaky, so we let the agent open the exact UI it wants to
 * inspect (dialog / shop) straight away.
 */
export interface GameDebugApi {
  getState: () => GameDebugState;
  /** Open an NPC dialog by kind (defaults to a long-text NPC, good for legibility checks). */
  openDialog: (kind?: NpcKind) => boolean;
  closeDialog: () => void;
  openShop: () => void;
  closeShop: () => void;
  /** Fire the "you got the sword" presentation (for capturing the effect). */
  triggerSwordGet: () => void;
  listNpcKinds: () => NpcKind[];
}

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
    last_exported_level_json?: string;
    /** Live game control/inspection API, present only while the GameScene is active. */
    gameDebug?: GameDebugApi;
  }
}

export const registerSceneDebugHooks = (
  scene: Phaser.Scene,
  renderGameToText: () => string,
): void => {
  window.render_game_to_text = renderGameToText;
  window.advanceTime = (ms: number) => {
    const step = 1000 / 60;
    const iterations = Math.max(1, Math.round(ms / step));
    let elapsed = scene.time.now;

    for (let index = 0; index < iterations; index += 1) {
      elapsed += step;
      scene.game.step(elapsed, step);
    }
  };
};

export const registerGameDebugApi = (api: GameDebugApi): void => {
  window.gameDebug = api;
};

export const clearGameDebugApi = (api: GameDebugApi): void => {
  if (window.gameDebug === api) {
    window.gameDebug = undefined;
  }
};
