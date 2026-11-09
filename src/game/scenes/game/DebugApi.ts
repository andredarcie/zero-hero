// A SUPERFÍCIE DO PLAYTEST: o estado ao vivo e os botões que o harness aperta (window.__debug), e o ESC que, no
// playtest do editor, para a partida e acorda o editor.

import { CHUNK_COLUMNS, CHUNK_ROWS, FONT_FAMILY, SCENE_DEPTHS, TEXT_RESOLUTION } from '@/game/constants';
import { registerGameDebugApi, registerSceneDebugHooks } from '@/game/debug/debugHooks';
import { getTimeOfDay, timeOfDayLabel } from '@/game/runtime/timeOfDay';
import { t } from '@/game/i18n/i18n';
import { getSoundManager } from '@/game/audio/SoundManager';
import { getDialogKinds, getWorldName } from '@/game/world/WorldData';
import { questSnapshot } from '@/game/runtime/QuestLog';
import type { GameScene } from '../GameScene';
import { type GameDebugApi } from '@/game/debug/debugHooks';
import { buildProbes } from '@/game/debug/probes';
import { GAME_SCENE_KEY } from './sceneDefs';


export class DebugApi {
  public debugApi?: GameDebugApi;
  public clearDebugHooks?: () => void;

  public constructor(private readonly host: GameScene) {}

  public enableEditorReturn(): void {
    this.host.add.text(this.host.scale.width - 8, 8, t('editorReturn'), {
      fontFamily: FONT_FAMILY,
      fontSize: '10px',
      color: '#f4a261',
      stroke: '#000000',
      strokeThickness: 3,
      resolution: TEXT_RESOLUTION,
    }).setOrigin(1, 0).setDepth(SCENE_DEPTHS.toast);

    this.host.input.keyboard?.on('keydown-ESC', () => {
      getSoundManager().music.stopMusic();
      getSoundManager().ambience.stopAmbience();
      this.host.scene.stop();
      this.host.scene.wake('editor');
    });
  }

  // Deterministic control surface for the playtest harness (see /playtest). Lets the agent
  // inspect live state and pop the exact UI it wants to validate.
  public registerDebugApi(): void {
    this.debugApi = {
      getState: () => ({
        scene: GAME_SCENE_KEY,
        timeOfDay: { phase: getTimeOfDay(), clock: timeOfDayLabel() },
        player: { worldX: this.host.playerWorld.worldX, worldY: this.host.playerWorld.worldY },
        heldOnFire: this.host.torch.heldOnFire,
        heldItem: this.host.heldItem,
        inventory: this.host.inventory.list(),
        bagOpen: false,
        orderOpen: this.host.orders.orderOverlay !== undefined,
        facing: { ...(this.host.movementController?.facing ?? { dx: 0, dy: 1 }) },
        groundItems: this.host.itemManager?.snapshot() ?? [],
        toolboxes: this.host.props.toolboxes.map((box) => ({
          worldX: box.worldX,
          worldY: box.worldY,
          dir: box.dir,
          phase: box.currentPhase,
          frame: box.currentFrame,
          busy: box.isBusy,
        })),
        thought: this.host.bumps.heroThought?.visibleIcon ?? null,
        actionPrompt: this.host.verbs.actionPrompt?.visibleLabels ?? [],
        furnaces: this.host.props.furnaces.map((f) => ({
          worldX: f.worldX,
          worldY: f.worldY,
          dir: f.dir,
          output: f.outputTile,
          phase: f.currentPhase,
          busy: f.isBusy,
          smelted: f.smeltCount,
        })),
        altars: this.host.props.altars.map((a) => ({
          worldX: a.worldX,
          worldY: a.worldY,
          holding: a.carrying,
          blows: a.blowsLanded,
          forged: a.forgeCount,
        })),
        swingGates: this.host.props.swingGates.map((g) => ({
          worldX: g.worldX,
          worldY: g.worldY,
          open: g.isOpen,
          refusals: g.refusalCount,
        })),
        moonflowers: this.host.props.moonflowers.map((mf) => ({
          worldX: mf.worldX,
          worldY: mf.worldY,
          open: mf.isOpen,
          blocking: mf.blocking,
          openness: Number(mf.openAmount.toFixed(3)),
          ...mf.view,
        })),
        plantSpots: this.host.props.plantSpots.map((spot) => ({
          worldX: spot.worldX,
          worldY: spot.worldY,
          state: spot.currentState,
        })),
        heroLift: this.host.hero.lift,
        heroScale: this.host.hero.scaleX,
        levelName: getWorldName(),
        dialogOpen: this.host.dialog.dialogOpen,
        itemGetOpen: this.host.hand.itemGetOpen,
        cutsceneActive: this.host.cutsceneActive,
        resting: this.host.camp.rest.isResting,
        companions: {
          cat: this.host.camp.catCare.position,
          visitor: this.host.questSetup.fireVisitor ? { kind: this.host.questSetup.fireVisitor.kind, seated: this.host.questSetup.fireVisitor.isSeated } : null,
        },
        litFires: this.host.props.campfires.filter((cf) => cf.isLit).length,
        ending: { gateOpen: this.host.arc.has('gate'), hearthLit: this.host.arc.has('hearth'), roasted: this.host.arc.has('ending') },
        introDone: this.host.arc.has('intro'),
        // A trilha que o jogo esta PEDINDO (null = vento/silencio). Ela e escolhida uma vez, no
        // create — e por aqui que um cenario cobra isso.
        music: getSoundManager().music.requestedTrack,
        activeScreen: {
          cx: Math.floor(this.host.playerWorld.worldX / CHUNK_COLUMNS),
          cy: Math.floor(this.host.playerWorld.worldY / CHUNK_ROWS),
        },
      }),
      openDialog: (kind = 'blackCat') => {
        if (this.host.dialog.dialogOpen) return false;
        this.host.dialog.openNpcDialog(kind);
        return true;
      },
      closeDialog: () => {
        this.host.dialog.dialogOverlay?.destroy();
        this.host.dialog.dialogOverlay = undefined;
        this.host.dialog.dialogOpen = false;
        this.host.dialogCam.endDialogCameraShift();
      },
      listNpcKinds: () => getDialogKinds(),
      // AS MISSÕES NÃO TÊM TELA — então o caderno delas precisa ao menos ser LEGÍVEL daqui, ou
      // seria um sistema que ninguém consegue provar que funciona (ver runtime/QuestLog).
      quests: () => questSnapshot(),
    };
    // As sondas dos playtests (debug/probes) só no desenvolvimento: no build de produção este ramo some, e elas junto.
    if (import.meta.env.DEV) Object.assign(this.debugApi, buildProbes(this.host));
    registerGameDebugApi(this.debugApi, this.host);
    this.clearDebugHooks?.();
    this.clearDebugHooks = registerSceneDebugHooks(this.host, () => JSON.stringify({
      coordinateSystem: 'tile grid; origin=(0,0) at world top-left; +x east/right, +y south/down',
      ...this.debugApi?.getState(),
    }));
  }
}
