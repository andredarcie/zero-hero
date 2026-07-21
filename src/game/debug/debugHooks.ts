import type Phaser from 'phaser';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import type { World3DParams } from '@/game/render3d/World3D';
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
  /** True while the held item (sword or wood club) is ablaze. */
  heldOnFire: boolean;
  heldItem: 'none' | HeldItemKind;
  groundItems: Array<{ kind: HeldItemKind; worldX: number; worldY: number }>;
  crates: Array<{ worldX: number; worldY: number }>;
  pressurePlates: Array<{ worldX: number; worldY: number; variable?: string; pressed: boolean }>;
  waterWheels: Array<{
    worldX: number;
    worldY: number;
    variable?: string;
    wired: boolean;
    hasFlow: boolean;
    speed: number;
    generating: boolean;
    frame: number;
    rotation: number;
  }>;
  wires: Array<{
    worldX: number;
    worldY: number;
    shape: string;
    live: boolean;
  }>;
  boilers: Array<{
    worldX: number;
    worldY: number;
    variable?: string;
    heated: boolean;
    water: number;
    pressure: number;
    generating: boolean;
  }>;
  inserters: Array<{
    worldX: number;
    worldY: number;
    variable?: string;
    powered: boolean;
    /** Desfazendo a entrega (energia caiu com divida em aberto): `source`/`dest` trocam de ponta. */
    reversed: boolean;
    /** Entregou algo que ainda esta no destino — e o que um corte de energia manda desfazer. */
    owes: boolean;
    source: readonly [number, number];
    dest: readonly [number, number];
    busy: boolean;
  }>;
  electronicGates: Array<{
    worldX: number;
    worldY: number;
    powered: boolean;
    open: boolean;
    moving: boolean;
    blocking: boolean;
    openness: number;
    frame: number;
  }>;
  /** Os portoes de bater: abertos ou nao, e quantas vezes cada um ja tentou e bateu. */
  swingGates: Array<{
    worldX: number;
    worldY: number;
    open: boolean;
    refusals: number;
  }>;
  levelPortals: Array<{
    worldX: number;
    worldY: number;
    activated: boolean;
    frame: number;
    visibleParticles: number;
    /** 0..1 — o quanto o portal esta engolindo o heroi (a succao da travessia). */
    swallow: number;
  }>;
  /**
   * A travessia do portal, vista de fora. Sao as tres coisas que a animacao promete e que um
   * teste pode cobrar: o heroi encolhe ate sumir (`heroScale`), ele fica NO AR do outro lado
   * (`heroLift`, em tiles) e o tunel cobre a tela no meio (`portalTunnel`).
   */
  heroLift: number;
  heroScale: number;
  portalTunnel: boolean;
  activeLevel: number | null;
  levelName: string;
  levelIntroOpen: boolean;
  levelTransitioning: boolean;
  globalVariables: Record<string, boolean>;
  coins: number;
  dialogOpen: boolean;
  shopOpen: boolean;
  itemGetOpen: boolean;
  isDead: boolean;
  /** How many campfires in the loaded world are currently lit (puzzle progress). */
  litFires: number;
  /** The dark-siege loop: near a campfire = safe; in the dark the danger meter (0..1)
   *  fills and undead spawn around the hero (see UndeadSpawnDirector). */
  safety: { safe: boolean; danger: number; undeadCount: number };
  /**
   * Cada caveira viva: onde esta, se ainda esta saindo do chao, e a placa de pressao em que
   * fixou (o balao de pensamento na cabeca dela). `plateTarget` nao-nulo = ela ignorou o heroi
   * e esta marchando para aquele tile.
   */
  undead: Array<{
    worldX: number;
    worldY: number;
    spawning: boolean;
    plateTarget: { x: number; y: number } | null;
  }>;
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
    /** Live 3D-renderer knobs, present only while the GameScene is active (see render3d/World3D.ts). */
    hd3d?: World3DParams;
  }
}

export const registerSceneDebugHooks = (
  scene: Phaser.Scene,
  renderGameToText: () => string,
): (() => void) => {
  const previousRender = window.render_game_to_text;
  const previousAdvance = window.advanceTime;
  const advanceTime = (ms: number): void => {
    const step = 1000 / 60;
    const iterations = Math.max(1, Math.round(ms / step));
    let elapsed = scene.time.now;

    for (let index = 0; index < iterations; index += 1) {
      elapsed += step;
      scene.game.step(elapsed, step);
    }
  };

  // Dev-only escape hatch: the live scene for console inspection (playtests/debugging).
  if (import.meta.env.DEV) (window as unknown as { __scene?: Phaser.Scene }).__scene = scene;
  window.render_game_to_text = renderGameToText;
  window.advanceTime = advanceTime;

  // GameScene temporarily replaces the sleeping editor's hooks during live play. Restore the
  // previous owner on shutdown, but only if nobody newer has taken the globals meanwhile.
  return () => {
    if (window.render_game_to_text === renderGameToText) window.render_game_to_text = previousRender;
    if (window.advanceTime === advanceTime) window.advanceTime = previousAdvance;
  };
};

export const registerGameDebugApi = (api: GameDebugApi, scene?: Phaser.Scene): void => {
  window.gameDebug = api;
  // Dev-only escape hatch: the live scene for console inspection (playtests/debugging).
  if (scene && import.meta.env.DEV) {
    (window as unknown as { __scene?: Phaser.Scene }).__scene = scene;
  }
};

export const clearGameDebugApi = (api: GameDebugApi): void => {
  if (window.gameDebug === api) {
    window.gameDebug = undefined;
  }
};
