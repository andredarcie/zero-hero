import type Phaser from 'phaser';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import type { World3DParams } from '@/game/render3d/World3D';
import { getTimeOfDay, setTimeOfDay, timeOfDayLabel } from '@/game/runtime/timeOfDay';
import type { NpcKind } from '@/game/world/ScreenContent';

/**
 * Snapshot of the live GameScene, consumed by the playtest harness (see /playtest)
 * to assert on gameplay without screen-scraping pixels.
 */
export interface GameDebugState {
  scene: string;
  /** The visible world clock: 0 = midnight, .5 = noon. */
  timeOfDay?: { phase: number; clock: string };
  player: { worldX: number; worldY: number };
  /** True while the held item (sword or wood club) is ablaze. */
  heldOnFire: boolean;
  /** O item do botao X — o que esta selecionado na bolsa agora (a espada nao entra aqui). */
  heldItem: 'none' | HeldItemKind;
  /** O que está na MÃO (uma coisa, ou nada): o que a subtela desenha. */
  inventory: Array<{ kind: HeldItemKind; count: number }>;
  /** Sempre false: a bolsa acabou (o campo fica para os cenários antigos lerem). */
  bagOpen: boolean;
  groundItems: Array<{ kind: HeldItemKind; worldX: number; worldY: number }>;
  /** Os portoes de bater: abertos ou nao, e quantas vezes cada um ja tentou e bateu. */
  swingGates: Array<{
    worldX: number;
    worldY: number;
    open: boolean;
    refusals: number;
  }>;
  /**
   * A flor da lua: em que ponto da abertura ela esta (`openness`), e o que os DOIS corpos estao
   * desenhando. `sheet` e lido do proprio billboard — e assim que um teste cobra a promessa de que
   * o botao fechado e a flor aberta saem da mesma folha, e nao de dois desenhos diferentes.
   * Nas pontas do ladder um dos dois alphas e 0; no meio da travessia os dois valem, porque as
   * duas geometrias se dissolvem uma na outra.
   */
  moonflowers: Array<{
    worldX: number;
    worldY: number;
    open: boolean;
    blocking: boolean;
    openness: number;
    sheet: string;
    standingFrame: number;
    lyingFrame: number;
    standingAlpha: number;
    lyingAlpha: number;
  }>;
  heroLift: number;
  heroScale: number;
  levelName: string;
  dialogOpen: boolean;
  itemGetOpen: boolean;
  /** Uma cena sem controle (a abertura, o fim) esta tocando. */
  cutsceneActive: boolean;
  /** Sentado numa fogueira, vendo o tempo passar (ver GameScene.restAtFireAt). */
  resting: boolean;
  /** How many campfires in the loaded world are currently lit. */
  litFires: number;
  /**
   * O FIM DO JOGO, peca a peca: o portao do jardim (aberto quando o ultimo pedido fecha), a
   * fogueira que so o heroi acende, e se o cogumelo ja foi assado (os creditos rolam dali).
   */
  ending: { gateOpen: boolean; hearthLit: boolean; roasted: boolean };
  /** A abertura (a espada fincada e o mago) ja tocou nesta partida? */
  introDone: boolean;
  /**
   * A trilha que o jogo esta pedindo agora (null = vento/silencio). Ela e escolhida uma vez, na
   * entrada do mundo: esta leitura e como um cenario cobra que ela NAO muda, sem tentar "ouvir"
   * WebAudio.
   */
  music: string | null;
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
  listNpcKinds: () => NpcKind[];
  /**
   * O CADERNO DE MISSOES (runtime/QuestLog). O sistema de missao NAO tem interface — o unico
   * sinal dele no jogo e o NPC passando a falar outro roteiro —, entao esta e a unica janela
   * para o estado dele. Sem ela, um sistema invisivel seria tambem um sistema improvavel.
   */
  quests: () => Array<{
    dialog: string;
    done: boolean;
    speaks: string;
    tasks: Array<{ task: string; have: number; need: number; done: boolean }>;
  }>;
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
    /** Read or set the persistent game clock (0 = midnight, .5 = noon). */
    gameTime?: { get: () => { phase: number; clock: string }; set: (phase: number) => void };
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
  window.gameTime = {
    get: () => ({ phase: getTimeOfDay(), clock: timeOfDayLabel() }),
    set: (phase: number) => setTimeOfDay(phase),
  };

  // GameScene temporarily replaces the sleeping editor's hooks during live play. Restore the
  // previous owner on shutdown, but only if nobody newer has taken the globals meanwhile.
  return () => {
    if (window.render_game_to_text === renderGameToText) window.render_game_to_text = previousRender;
    if (window.advanceTime === advanceTime) window.advanceTime = previousAdvance;
    if (window.gameTime) window.gameTime = undefined;
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
