// O JARDIM ALTO: a chave que quem fecha o último pedido entrega, o portão que ela abre (a cena dela), e a névoa que
// levanta.

import { ASSET_KEYS, HERO_FRAMES, KEY_FRAMES } from '@/game/constants';
import { LockedDoorObject } from '@/game/objects/LockedDoorObject';
import { getSoundManager } from '@/game/audio/SoundManager';
import { adventureState } from '@/game/runtime/adventureState';
import type { GameScene } from '../GameScene';

/** O que GardenUnlock usa de GameScene. */
export type GardenUnlockHost = Pick<GameScene,
  'actions' | 'cinema' | 'cutsceneActive' | 'gateOpened' | 'hand' | 'hero' | 'heroBillboard'
  | 'movementController' | 'npcManager' | 'orders' | 'playerWorld' | 'props' | 'save' | 'sparkle' | 'steps'
  | 'time' | 'tweens' | 'valley' | 'world3d'
>;

export class GardenUnlock {
  public constructor(private readonly host: GardenUnlockHost) {}

  /**
   * O VENTO LEVA A NÉVOA (pedido do autor): o herói pisa no cume pela primeira vez, e a cena para o jogo. A câmera
   * se afasta um pouco para caber o jardim, a rajada atravessa, a névoa corre para o leste e some em onda, e o
   * jardim aparece limpo. Só então ele anda, acende a fogueira, e o resto do fim acontece.
   */
  public async playMistClearing(): Promise<void> {
    const mist = this.host.valley.gardenMist;
    if (!mist || this.host.cutsceneActive) return;
    this.host.cutsceneActive = true;
    this.host.steps.stopBreathing();
    this.host.movementController?.interruptMovement(this.host.playerWorld.worldX, this.host.playerWorld.worldY);
    this.host.actions.actionButtons?.setVisible(false);
    const pause = (ms: number): Promise<void> => new Promise((resolve) => { this.host.time.delayedCall(ms, resolve); });
    await this.host.cinema.dollyTo(1.45, 900);
    await pause(250);
    getSoundManager().nature.playWindGust();
    this.host.sparkle.softWash(0xe8f0ea, 0.12, 2600);
    await mist.blowAway();
    this.host.valley.gardenMist = undefined;
    adventureState().mistCleared = true;
    this.host.save.persistAdventure();
    await pause(500);
    await this.host.cinema.dollyTo(1, 1000);
    this.host.actions.actionButtons?.setVisible(true);
    this.host.cutsceneActive = false;
  }

  /** A chave do jardim alto vai para a mão do herói, saltando de quem a entregou (se ele ainda está ali). */
  public giveGardenKey(from: { worldX: number; worldY: number } | undefined): void {
    const st = adventureState();
    if (st.gardenKeyGiven) return;
    st.gardenKeyGiven = true;
    const { worldX: hx, worldY: hy } = this.host.playerWorld;
    if (from) {
      this.host.npcManager?.hop(from.worldX, from.worldY);
      this.host.orders.flingCraftedItem('key', from.worldX, from.worldY, hx, hy);
    }
    this.host.hand.takeIntoHand('key');
    this.host.save.persistAdventure();
    this.host.hand.showItemGet('key', () => {});
  }

  /**
   * O PORTAO DO JARDIM ABRE. Ele fica longe de onde o ultimo pedido fechou, entao ninguem o ve
   * abrir: quem conta e o som que atravessa o vale e uma linha do narrador. O mago passa a falar
   * disso tambem — ele e o mapa deste jogo.
   */
  public openGardenGate(): void {
    if (this.host.gateOpened) return;
    this.host.gateOpened = true;
    for (const gate of this.host.props.gardenGates) gate.unlock();
    this.host.save.persistAdventure();
  }

  /**
   * A CHAVE NO PORTÃO DO JARDIM ALTO (pedido do autor): o herói tira a chave das costas, leva até a fechadura,
   * enfia, gira em dois dentes, o trinco cede e o portão velho abre rangendo. A chave é GASTA aqui — fica na
   * fechadura —, e o herói sobe com as costas vazias.
   *
   * A chave na fechadura é vista de trás do herói: de ponta para cima, ela entra encurtando (a haste some no
   * tambor e sobra o anel), e o giro é o anel virando.
   */
  public async playGardenUnlock(door: LockedDoorObject): Promise<void> {
    const hb = this.host.heroBillboard;
    const w3 = this.host.world3d;
    if (!hb || !w3 || this.host.cutsceneActive) return;
    this.host.cutsceneActive = true;
    this.host.steps.stopBreathing();
    this.host.movementController?.interruptMovement(this.host.playerWorld.worldX, this.host.playerWorld.worldY);
    this.host.actions.actionButtons?.setVisible(false);
    const sound = getSoundManager();
    const pause = (ms: number): Promise<void> => new Promise((resolve) => { this.host.time.delayedCall(ms, resolve); });
    const toDoorX = Math.sign(door.worldX - this.host.playerWorld.worldX);
    const toDoorY = Math.sign(door.worldY - this.host.playerWorld.worldY);
    this.host.movementController?.faceTo(toDoorX, toDoorY, false);
    // A fechadura: a placa no meio da grade, na altura da cintura do portão.
    const holeX = door.worldX;
    const holeY = door.worldY + 0.06;
    const holeH = 0.47;

    // 1. PEGAR: a chave sai das costas para a mão. Ela é gasta já aqui: as costas ficam vazias.
    const key = w3.objects.addBillboard(ASSET_KEYS.keyItem, KEY_FRAMES.held, { centered: true })
      .setPosition(hb.x - 0.1, hb.y + 0.02)
      .setElevation(0.55)
      .setDisplaySize(0.5, 0.5);
    this.host.hand.clearHeldItem();
    this.host.save.persistAdventure();
    sound.story.playKeyJingle();
    await this.host.cinema.tweenTo({ targets: key, x: hb.x + 0.16, y: hb.y - 0.1, elevation: 0.66, angle: -90, duration: 340, ease: 'Quad.easeOut' });
    await pause(120);

    // 2. LEVAR: o corpo inclina para o portão e a mão leva a chave até a frente da fechadura.
    this.host.hero.frame = toDoorY < 0 ? HERO_FRAMES.attackUp : HERO_FRAMES.attack;
    this.host.tweens.add({ targets: this.host.hero, lungeX: toDoorX * 0.16, lungeY: toDoorY * 0.16, duration: 380, ease: 'Sine.easeInOut' });
    await this.host.cinema.tweenTo({ targets: key, x: holeX, y: holeY, elevation: holeH + 0.2, duration: 380, ease: 'Sine.easeInOut' });
    await pause(90);

    // 3. ENFIAR: a haste some no tambor; sobra o anel encostado na placa.
    sound.story.playKeyInsert();
    await this.host.cinema.tweenTo({ targets: key, scaleX: 0.22, elevation: holeH + 0.07, duration: 240, ease: 'Cubic.easeIn' });
    door.jolt();
    await pause(260);

    // 4. GIRAR: dois dentes, cada um com o seu estalo, e o anel deita.
    for (const angle of [-45, 0]) {
      sound.story.playLockTick();
      await this.host.cinema.tweenTo({ targets: key, angle, duration: 170, ease: 'Back.easeOut' });
      await pause(150);
    }

    // 5. O TRINCO CEDE: o baque de ferro, um brilho na fechadura, o portão dá um tranco.
    sound.story.playLockClunk();
    door.jolt();
    this.host.sparkle.spawnGlint(holeX, holeY, holeH + 0.07, 0.42);
    this.host.tweens.add({ targets: this.host.hero, lungeX: 0, lungeY: 0, duration: 320, ease: 'Sine.easeOut' });
    this.host.hero.frame = toDoorY < 0 ? HERO_FRAMES.idleUp : HERO_FRAMES.idleDown;
    await pause(420);

    // 6. ABRIR: o portão velho range e as folhas giram para dentro. A chave vai com a folha, presa na fechadura.
    sound.story.playOldGateCreak();
    this.host.tweens.add({ targets: key, alpha: 0, duration: 200, ease: 'Quad.easeIn', onComplete: () => key.destroy() });
    this.openGardenGate();
    this.host.sparkle.softWash(0xffecbe, 0.14, 1400);
    await pause(900);

    this.host.actions.actionButtons?.setVisible(true);
    this.host.cutsceneActive = false;
  }
}
