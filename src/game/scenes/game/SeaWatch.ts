// OS DOIS DESCANSOS DO NORTE: sentar na cadeira do guarda-sol e ver o tempo passar sobre o mar; ou entrar na fonte
// termal da gruta atrás da lava e ficar de molho, como quem senta no banco do lago.

import { HERO_FRAMES } from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';
import { BEACH_SEAT_LIFT, BEACH_VIEW } from '@/game/objects/beach/BeachSeat';
import { SPRING_VIEW } from '@/game/objects/spring/HotSpring';
import type { Resting } from '@/game/systems/Resting';
import type { GameScene } from '../GameScene';

/** O passo para a cadeira: o mesmo do banco com vista (CampLife.sitAtFind). */
const STEP_MS = 300;
/** Entrar na água é devagar; sair, um passo só. */
const IN_MS = 420;
const OUT_MS = 280;
/**
 * O quanto o corpo desce na fonte (tiles). A bacia é funda de verdade (world/hotSpring: o leito a 0,45, a água a 0,1
 * abaixo do chão): ele SENTA no leito, com a água no peito — o corpo desce um pouco além do leito, que é as pernas
 * dobradas debaixo dele, e o que fica entre o leito e a superfície se vê através da água. Com o corpo abaixo do chão o
 * contorno do herói atrás das coisas não acende (SceneRender: OccludedSilhouette).
 */
export const SOAK_DEPTH = 0.42;
/** O quanto a câmera chega perto dentro da fonte (o sentar comum chega a 0,82; o levantar a devolve a 1). */
const SOAK_DOLLY = 0.74;

/** O que SeaWatch usa de GameScene. */
export type SeaWatchHost = Pick<GameScene,
  'cameraLook' | 'carry' | 'cinema' | 'cutsceneActive' | 'hero' | 'movementController' | 'playerWorld' | 'time' | 'tweens' | 'valley'
>;

/**
 * OLHAR O MAR (pedido do autor, 2026-11-19): como o banco da beira do lago, só que de frente para o mar. O herói sobe na
 * cadeira do guarda-sol (objects/beach/BeachSeat) e senta de COSTAS para a câmera, olhando o norte; o tempo corre como
 * em todo assento com vista (systems/Resting), e a câmera desce para trás dele e levanta os olhos até o horizonte (a
 * câmera do horizonte de objects/beach/SeaVista, que andando o jogo não usa): o céu da hora, as nuvens passando, o sol
 * nascendo no mar, a lua. Qualquer tecla levanta, e a câmera volta a ser a de sempre (CampLife.onStoodUp).
 *
 * A FONTE TERMAL (o mesmo dia: "um lugar para descanso, depois do lago de lava"): o Z diante da água leva o herói para
 * dentro dela, devagar, e ele afunda até os ombros (`SOAK_DEPTH`). Ela NÃO é um lugar de olhar o mar (o autor: "zero
 * visão da praia... se compara mais com a experiência de sentar e ver o lago"): ele vira de FRENTE para a câmera, como no
 * banco do lago (CampLife.sitAtFind), a câmera vai até a água e chega perto, e o tempo passa com o vapor subindo, a
 * lanterna acendendo e os vaga-lumes (objects/spring). Levantar o tira da água, de volta ao tile de onde entrou.
 */
export class SeaWatch {
  /** De onde ele entrou na fonte (é para lá que ele sai); null fora dela. */
  private soakFrom: { x: number; y: number } | null = null;

  public constructor(private readonly host: SeaWatchHost, private readonly rest: Resting) {}

  /** Está dentro da fonte termal. */
  public get soaking(): boolean {
    return this.soakFrom !== null;
  }

  /** O Z diante da cadeira: senta. Devolve se era a cadeira. */
  public sitAt(x: number, y: number): boolean {
    const seat = this.host.valley.beachSeat;
    if (!seat?.isChair(x, y) || this.rest.isResting || this.host.cutsceneActive) return false;
    getSoundManager().work.playFindTouch('bench');
    void this.sit(x, y);
    return true;
  }

  /** O Z diante da água da fonte: entra nela. Devolve se era a fonte. */
  public soakAt(x: number, y: number): boolean {
    const spring = this.host.valley.beach?.spring;
    const from = { x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY };
    if (!spring?.entry(x, y, from) || this.rest.isResting || this.host.cutsceneActive) return false;
    void this.soak(x, y);
    return true;
  }

  private async sit(x: number, y: number): Promise<void> {
    this.host.cutsceneActive = true;
    this.host.tweens.add({ targets: this.host.hero, lift: BEACH_SEAT_LIFT, duration: STEP_MS, ease: 'Quad.easeOut' });
    await this.host.cinema.scriptStep(x - this.host.playerWorld.worldX, y - this.host.playerWorld.worldY, STEP_MS);
    this.host.movementController?.interruptMovement(x, y);
    this.host.cutsceneActive = false;
    this.rest.sitOnFind(BEACH_VIEW);
    this.settleFacingSea();
    this.host.valley.beach?.vista.watch(true);
  }

  private async soak(x: number, y: number): Promise<void> {
    const from = { x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY };
    this.soakFrom = from;
    this.host.cutsceneActive = true;
    // o que ele carrega fica na beira (volta às costas quando ele sai)
    this.host.carry.backItemBb?.setVisible(false);
    this.host.tweens.add({ targets: this.host.hero, lift: -SOAK_DEPTH, duration: IN_MS * 1.6, ease: 'Sine.easeInOut' });
    await this.host.cinema.scriptStep(x - from.x, y - from.y, IN_MS);
    this.host.movementController?.interruptMovement(x, y);
    this.host.cutsceneActive = false;
    this.host.valley.beach?.spring.enter(x, y);
    this.rest.sitOnFind(SPRING_VIEW);
    // de frente para quem olha, como no banco do lago; a câmera vai até a água (CampLife.onStoodUp a solta)
    this.host.cinema.scriptFace(0, 1);
    this.host.hero.frame = HERO_FRAMES.idleDown;
    this.host.cameraLook = { ...SPRING_VIEW };
    // um pouco mais perto que o banco do lago: o quadro é a gruta inteira, do bordo à lanterna (mais perto que isto, a
    // lanterna saía pela direita e o bordo virava um bloco vermelho no canto)
    void this.host.cinema.dollyTo(SOAK_DOLLY, 1800);
  }

  /** De costas para a câmera: ele olha o mar (o sentar comum o vira para a frente). */
  private settleFacingSea(): void {
    this.host.cinema.scriptFace(0, -1);
    this.host.hero.frame = HERO_FRAMES.idleUp;
  }

  /** Levantou (CampLife.onStoodUp): a câmera do horizonte solta, e quem estava na fonte sai dela. */
  public stoodUp(): void {
    this.host.valley.beach?.vista.watch(false);
    const from = this.soakFrom;
    if (!from) return;
    this.soakFrom = null;
    this.host.valley.beach?.spring.leave();
    this.host.cutsceneActive = true;
    // um quadro depois: o levantar ainda solta os pés no tile da água (Resting.standUp), e o passo para fora vem por cima
    this.host.time.delayedCall(1, () => {
      const at = { x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY };
      this.host.tweens.add({ targets: this.host.hero, lift: 0, duration: OUT_MS, ease: 'Quad.easeOut' });
      void this.host.cinema.scriptStep(from.x - at.x, from.y - at.y, OUT_MS).then(() => {
        this.host.movementController?.interruptMovement(from.x, from.y);
        this.host.cutsceneActive = false;
        this.host.carry.updateBackItem();
      });
    });
  }
}
