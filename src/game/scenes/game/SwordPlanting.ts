// A ESPADA FINCADA: a cena da abertura em que ela desce das costas para o chão, e a espada que fica ali para sempre.

import { HERO_FRAMES } from '@/game/constants';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { isReducedMotion } from '@/game/runtime/accessibility';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { GameScene } from '../GameScene';
import { BACK_ITEM_VISUAL_3D, SWORD_PLANTED_ELEV } from './sceneDefs';

/** O que SwordPlanting usa de GameScene. */
export type SwordPlantingHost = Pick<GameScene,
  'camera' | 'cameras' | 'carry' | 'cinema' | 'debris' | 'dialogCam' | 'hero' | 'heroBillboard' | 'save'
  | 'sparkle' | 'tileSize' | 'time' | 'tweens' | 'verbs' | 'world3d'
>;

export class SwordPlanting {
  public plantedSword?: Billboard3D;
  public plantedSwordTile?: { x: number; y: number };
  // A espada saiu das costas e esta nas maos (a abertura): positionBackItem a solta.
  public swordInHands = false;

  public constructor(private readonly host: SwordPlantingHost) {}

  /**
   * A ESPADA FINCADA: a MESMA arte que o heroi carrega nas costas (`BACK_ITEM_VISUAL_3D.sword`),
   * de ponta para baixo, com um terco da lamina enterrado. Ela fica de pe no tile onde ele a
   * deixou e bloqueia o tile como qualquer coisa cravada no chao. Cenario — nenhum botao a tira.
   */
  public plantSwordAt(wx: number, wy: number): Billboard3D | undefined {
    if (!this.host.world3d) return undefined;
    const visual = BACK_ITEM_VISUAL_3D.sword;
    this.plantedSword?.destroy();
    this.plantedSword = this.host.world3d
      .objects.addBillboard(visual.texture, visual.frame, { centered: true })
      .setPosition(wx, wy)
      .setElevation(SWORD_PLANTED_ELEV)
      .setDisplaySize(1, 1)
      .setAngle(180);
    this.plantedSwordTile = { x: wx, y: wy };
    return this.plantedSword;
  }

  /**
   * A ESPADA DESCE DAS COSTAS PARA O CHAO — o gesto que fecha uma vida, filmado como tal.
   *
   *   1. ENQUADRAR: o quadro desce meio tile para caber o heroi E o chao onde a espada vai.
   *   2. DESEMBAINHAR: a espada sai das costas (a mesma arte, o mesmo billboard) para as maos.
   *   3. ERGUER: ela sobe girando para ficar de PONTA PARA BAIXO; a camera avanca, faiscas sobem,
   *      e no alto o tempo desacelera em rampa enquanto as bordas escurecem.
   *   4. CRAVAR: um mergulho seco com rastro e assobio; no impacto o mundo CONGELA um instante,
   *      a tela pisca, o chao racha, faiscas quentes e torroes voam, duas ondas de poeira correm e
   *      os vaga-lumes se espantam.
   *   5. ASSENTAR: a lamina vibra e para; a lua desce sobre ela; o cavaleiro baixa a cabeca, fica
   *      um instante assim — e da um passo para tras sem tirar os olhos dela.
   */
  public async playSwordPlanting(): Promise<void> {
    const hb = this.host.heroBillboard;
    const sword = this.host.carry.backItemBb;
    const front = this.host.verbs.facingTile();
    if (!hb || !sword || !this.host.camera) return;
    const sound = getSoundManager();
    this.swordInHands = true; // positionBackItem para de prender a espada nas costas

    // 1. ENQUADRAR.
    const base = this.host.dialogCam.baseScreenCenter();
    await new Promise<void>((resolve) => {
      this.host.cinema.cutscenePan(base.x, base.y - Math.round(this.host.tileSize * 0.45), 900, resolve);
    });
    const handX = hb.x + 0.04;
    const handY = hb.y + 0.32; // na frente do corpo (o heroi olha para a camera)

    // 2. DESEMBAINHAR.
    this.host.hero.frame = HERO_FRAMES.attack;
    sound.ui.playSwordPickup();
    await this.host.cinema.tweenTo({
      targets: sword, x: handX, y: handY, elevation: 0.62, angle: 0, duration: 420, ease: 'Back.easeOut',
    });
    this.host.sparkle.spawnGlint(handX, handY, 1.02, 0.55);
    await this.host.cinema.wait(560);

    // 3. ERGUER, girando: ponta para baixo, acima da cabeca.
    void this.host.cinema.dollyTo(0.72, 1700, 'Sine.easeInOut');
    this.host.cinema.setVignette(0.55, 1400);
    const rise = this.host.cinema.tweenTo({
      targets: sword, elevation: 1.28, angle: 540, y: hb.y + 0.12, duration: 1150, ease: 'Cubic.easeInOut',
    });
    const motes = this.host.time.addEvent({
      delay: 60, repeat: 40, callback: () => this.host.sparkle.spawnRiseMote(sword.x, sword.y, sword.elevation),
    });
    this.host.hero.scaleY = 1.05;
    await rise;
    // CAMERA LENTA no alto, em rampa: o mundo quase para, so a lamina respira.
    await this.host.cinema.rampTimeScale(0.2, 260);
    sound.ui.playSingingBowl();
    this.host.sparkle.spawnGlint(sword.x, sword.y, sword.elevation - 0.45, 1);
    this.host.world3d?.cam.shake(700, 0.01);
    this.host.cinema.setVignette(0.85, 500);
    await this.host.cinema.tweenTo({ targets: sword, elevation: 1.4, duration: 200, ease: 'Sine.easeOut' });
    motes.remove();
    await this.host.cinema.rampTimeScale(1, 160);
    await this.host.cinema.wait(220);

    // 4. CRAVAR: o assobio, o rastro, o mergulho seco ate o tile da frente.
    sound.work.playSwordSlash();
    this.host.hero.scaleY = 0.84;
    this.host.hero.scaleX = 1.07;
    await this.host.cinema.tweenTo({
      targets: sword, x: front.x, y: front.y, elevation: SWORD_PLANTED_ELEV - 0.08,
      duration: 130, ease: 'Expo.easeIn',
      onUpdate: () => this.host.sparkle.spawnSwordGhost(sword),
    });
    // O IMPACTO.
    this.host.tweens.timeScale = 0; // hitstop: o mundo segura o quadro do golpe
    sound.ui.playTitleImpact();
    sound.work.playRockSmash();
    if (!isReducedMotion()) this.host.cameras.main.flash(150, 255, 246, 220);
    this.host.world3d?.cam.shake(420, 0.17, 0, 1);
    this.host.cinema.crackGroundAt(front.x, front.y, false);
    await new Promise<void>((resolve) => { window.setTimeout(resolve, 120); });
    this.host.tweens.timeScale = 1;
    this.host.cinema.crackGroundAt(front.x, front.y, true);
    void this.host.cinema.dollyTo(0.66, 130, 'Quad.easeOut').then(() => this.host.cinema.dollyTo(0.76, 700, 'Sine.easeOut'));
    this.host.debris.spawnShockwave(front.x, front.y, 0xd8c3a0, 0.3, 2.8, 560);
    this.host.debris.spawnShockwave(front.x, front.y, 0xfff0c8, 0.2, 1.5, 320);
    this.host.time.delayedCall(90, () => this.host.debris.spawnShockwave(front.x, front.y, 0x8f7a60, 0.4, 3.6, 800));
    this.host.sparkle.spawnImpactSparks(front.x, front.y, 16);
    this.host.debris.spawnDirtBurst(front.x, front.y, 28);
    this.host.debris.spawnSmokePuff(front.x - 0.3, front.y + 0.1);
    this.host.debris.spawnSmokePuff(front.x + 0.3, front.y + 0.1);
    this.host.time.delayedCall(160, () => this.host.debris.spawnSmokePuff(front.x, front.y + 0.25));
    this.host.time.delayedCall(320, () => this.host.debris.spawnSmokePuff(front.x + 0.15, front.y - 0.1));
    this.host.cinema.scatterFireflies(front.x, front.y);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [-1, 1], [1, 1], [-2, 0], [2, 0]]) {
      this.host.world3d?.objects.rustleDecor(front.x + dx, front.y + dy);
    }
    this.host.cinema.setVignette(0.5, 900);

    // 5. ASSENTAR: a lamina vibra e para; ela agora e a espada fincada.
    sword.setPosition(front.x, front.y);
    const wobble = { t: 0 };
    await this.host.cinema.tweenTo({
      targets: wobble, t: 1, duration: 1000, ease: 'Linear',
      onUpdate: () => {
        const decay = 1 - wobble.t;
        sword.setAngle(180 + Math.sin(wobble.t * Math.PI * 10) * 8 * decay * decay);
        sword.setElevation(SWORD_PLANTED_ELEV - 0.08 * decay);
      },
    });
    this.swordInHands = false;
    this.host.carry.backItemBb = undefined; // o billboard das costas virou a espada do chao
    this.plantedSword?.destroy();
    this.plantedSword = sword.setAngle(180).setElevation(SWORD_PLANTED_ELEV);
    this.plantedSwordTile = { x: front.x, y: front.y };
    this.host.cinema.spawnMoonShaft(front.x, front.y);
    this.host.time.delayedCall(500, () => this.host.sparkle.spawnGlint(front.x, front.y, SWORD_PLANTED_ELEV + 0.42, 0.6));
    this.host.save.persistAdventure();
    // A CABECA BAIXA: ele continua curvado sobre ela um instante, em silencio.
    this.host.hero.frame = HERO_FRAMES.idleDown;
    await this.host.cinema.tweenTo({ targets: this.host.hero, scaleY: 0.9, scaleX: 1.03, duration: 600, ease: 'Sine.easeOut' });
    await this.host.cinema.wait(1500);
    await this.host.cinema.tweenTo({ targets: this.host.hero, scaleX: 1, scaleY: 1, duration: 900, ease: 'Sine.easeInOut' });
    await this.host.cinema.wait(300);
    // Um passo para tras, sem tirar os olhos dela.
    await this.host.cinema.scriptStep(0, -1, 760, true);
    this.host.cinema.setVignette(0, 2000);
    // O quadro acompanha o passo: o heroi e a espada, agora a dois tiles, continuam juntos nele.
    await new Promise<void>((resolve) => {
      this.host.cinema.cutscenePan(base.x, base.y - Math.round(this.host.tileSize * 0.95), 1200, resolve);
    });
  }
}
