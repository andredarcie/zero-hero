import type * as Engine from '@/game/engine';

import { getSoundManager } from '@/game/audio/SoundManager';
import type { Billboard3D, Billboard3DOptions } from '@/game/render3d/Billboard3D';
import { WHITE_SAFE_TINT } from '@/game/render3d/pixelForms';
import { EMPTY_MUG_TEXTURE, MUG_TEXTURE, STEAM_TEXTURE } from '@/game/render3d/skyTextures';
import {
  LIBERTY_CAP_TEXTURE, TEA_DROP_TEXTURE, TEA_FLAME_TEXTURES, TEA_HEARTH_TEXTURE, TEA_KETTLE_TEXTURE,
} from '@/game/render3d/teaTextures';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';

/**
 * O CHÁ DE COGUMELO DA SHUI, feito na frente do herói (pedido do autor): ela arma três pedras e uns gravetos ao lado
 * dela, o fogo pega, a chaleira de ferro vai em cima e a água ferve; o cogumelo pequeno que veio na cesta salta da mão
 * dela para dentro, o vapor fica furta-cor, ela serve a caneca e a caneca voa até o herói, que bebe em goles. Só o
 * corpo da cena: quem fala e quando é a cena (scenes/game/ShuiTea).
 */

export interface MushroomTeaHost {
  scene: Engine.Scene;
  /** O tile onde ela arma o fogo (ao lado dela), onde ela está, e onde o herói está. */
  spot: { x: number; y: number };
  shui: { x: number; y: number };
  hero: { x: number; y: number };
  /** O corpo do herói: só a escala é mexida aqui (o quique ao receber a caneca e o "ahh"). */
  heroBody: { scaleX: number; scaleY: number };
  hop: () => void;
  dirt: (x: number, y: number) => void;
  smoke: (x: number, y: number) => void;
  hearts: (x: number, y: number) => void;
}

const KETTLE_ELEVATION = 0.16;
const MUG_SIZE = 0.7;
const MUG_REST = 0.05;
const MUG_MOUTH = 0.42;
/** O vapor do cogumelo: as cores que ele passa a ter, do rosa ao verde-água. */
const IRIDESCENT = [0xffb3d9, 0xffd9a0, 0xfff3a0, 0xb8ffb0, 0xa0f0ff, 0xc8b0ff];
/** O vapor nasce num formato que o aquecimento dos shaders já conhece (o da coroinha do pingo de chuva). */
const STEAM_OPTS = { depthWrite: false, alphaTest: 0.01, fog: false, emissive: true } as const;

export class MushroomTea {
  private readonly parts: Billboard3D[] = [];
  private readonly timers: Engine.Time.TimerEvent[] = [];
  private flame?: Billboard3D;
  private glow?: Billboard3D;
  private kettle?: Billboard3D;
  private mug?: Billboard3D;
  private steam?: Engine.Time.TimerEvent;
  private iridescent = false;
  private alive = true;

  public constructor(private readonly host: MushroomTeaHost) {}

  /** Armar o fogo, ferver a água e pôr o cogumelo. Resolve com o chá pronto na chaleira. */
  public async brew(): Promise<void> {
    const { spot } = this.host;
    const sound = getSoundManager();
    this.host.hop();
    this.add(TEA_HEARTH_TEXTURE, 1, spot.y + 0.06, 0, {}, true);
    this.host.dirt(spot.x, spot.y);
    sound.ui.playPut('stone');
    await this.wait(700);
    // O fogo pega: a chama em dois quadros e um brilho quente no chão.
    this.flame = this.add(TEA_FLAME_TEXTURES[0], 1, spot.y + 0.04, 0, STEAM_OPTS, true);
    this.glow = world3d().objects.addBillboard(FX_DOT_TEXTURE, 0, { additive: true })
      .setTint(0xff9a40).setDisplaySize(0.6, 0.6).setPosition(spot.x, spot.y + 0.05).setElevation(0.05).setAlpha(0.5);
    this.parts.push(this.glow);
    sound.nature.playIgnite();
    let frame = 0;
    this.timers.push(this.host.scene.time.addEvent({
      delay: 130,
      loop: true,
      callback: () => {
        frame = 1 - frame;
        this.flame?.setTexture(TEA_FLAME_TEXTURES[frame], 0);
        this.glow?.setAlpha(0.42 + Math.random() * 0.16);
      },
    }));
    await this.wait(700);
    // A chaleira em cima das pedras, e a água esquentando: o vapor começa ralo e engrossa, com as bolhas.
    this.host.hop();
    this.kettle = this.add(TEA_KETTLE_TEXTURE, 1, spot.y + 0.02, KETTLE_ELEVATION, {}, true);
    sound.ui.playPut('metal');
    this.startSteam(420);
    await this.wait(1300);
    sound.story.playTeaBubble();
    this.startSteam(220);
    this.jiggle();
    await this.wait(1100);
    sound.story.playTeaBubble();
    await this.wait(500);
    await this.dropMushroom();
    // O vapor muda: o chá do cogumelo sobe furta-cor, e a tampa sacode.
    this.iridescent = true;
    this.startSteam(160);
    sound.story.playTeaBubble();
    this.jiggle();
    await this.wait(1800);
  }

  /** Servir: a chaleira inclina, o chá cai na caneca, e a caneca voa até o herói, girando. */
  public async serve(): Promise<void> {
    const { spot, hero, shui } = this.host;
    const side = Math.sign(shui.x - hero.x) || Math.sign(spot.x - hero.x) || 1;
    // A caneca do lado do bico (a chaleira derrama para a direita).
    const mug = this.add(MUG_TEXTURE, MUG_SIZE, spot.y + 0.1, MUG_REST, {}, true);
    mug.setPosition(spot.x + 0.46, spot.y + 0.1);
    this.mug = mug;
    const kettle = this.kettle;
    if (kettle) this.tween({ targets: kettle, angle: -38, duration: 320, ease: 'Sine.easeOut' });
    await this.wait(320);
    getSoundManager().story.playTeaPour();
    for (let i = 0; i < 6; i += 1) this.timers.push(this.host.scene.time.delayedCall(i * 120, () => this.drop(spot.x + 0.42, spot.y + 0.1)));
    await this.wait(900);
    if (kettle) this.tween({ targets: kettle, angle: 0, duration: 300, ease: 'Sine.easeInOut' });
    await this.wait(300);
    // A caneca salta num arco até o lado do herói.
    const to = { x: hero.x + side * 0.34, y: hero.y + 0.04 };
    const from = { x: mug.x, y: mug.y };
    const arc = { t: 0 };
    getSoundManager().ui.playItemStash();
    await new Promise<void>((resolve) => this.tween({
      targets: arc,
      t: 1,
      duration: 520,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        mug.setPosition(from.x + (to.x - from.x) * arc.t, from.y + (to.y - from.y) * arc.t);
        mug.setElevation(MUG_REST + Math.sin(arc.t * Math.PI) * 0.6);
        mug.setAngle(arc.t * 360);
      },
      onComplete: () => resolve(),
    }));
    mug.setAngle(0).setFlipX(side < 0);
    this.bounce();
  }

  /** Beber: três goles, o "ahh", e a caneca vazia. */
  public async drink(): Promise<void> {
    const mug = this.mug;
    if (!mug) return;
    const { hero } = this.host;
    const side = Math.sign(mug.x - hero.x) || 1;
    const sound = getSoundManager();
    const body = this.host.heroBody;
    for (let sip = 0; sip < 3; sip += 1) {
      this.tween({ targets: mug, x: hero.x + side * 0.25, elevation: MUG_MOUTH, angle: -side * 55, duration: 260, ease: 'Back.easeOut' });
      this.tween({ targets: body, scaleX: 0.95, scaleY: 1.09, duration: 260, ease: 'Sine.easeOut' });
      await this.wait(260);
      sound.story.playMugSip();
      this.tween({ targets: mug, elevation: MUG_MOUTH + 0.05, duration: 170, yoyo: true, ease: 'Sine.easeInOut' });
      await this.wait(420);
      this.tween({ targets: mug, x: hero.x + side * 0.34, elevation: MUG_REST, angle: 0, duration: 240, ease: 'Sine.easeInOut' });
      this.bounce();
      await this.wait(sip < 2 ? 700 : 300);
    }
    mug.setTexture(EMPTY_MUG_TEXTURE, 0);
    this.puff(hero.x, hero.y, 0.8, 0xffffff);
    this.host.hearts(hero.x, hero.y);
    await this.wait(600);
  }

  /** A caneca sai (o herói fecha os olhos e o chá começa a agir). */
  public dropMug(): void {
    if (!this.mug) return;
    this.host.scene.tweens.killTweensOf(this.mug);
    this.mug.destroy();
    this.parts.splice(this.parts.indexOf(this.mug), 1);
    this.mug = undefined;
  }

  /** Tudo some numa fumacinha (`smoke`; sem ela no desmonte da cena): o fogo, as pedras, a chaleira. */
  public clear(smoke = true): void {
    if (!this.alive) return;
    this.alive = false;
    this.steam?.remove();
    for (const timer of this.timers) timer.remove();
    const { tweens } = this.host.scene;
    for (const part of this.parts) {
      tweens.killTweensOf(part);
      part.destroy();
    }
    this.parts.length = 0;
    if (smoke) this.host.smoke(this.host.spot.x, this.host.spot.y);
  }

  private add(key: string, size: number, y: number, elevation: number, opts: Billboard3DOptions, pop: boolean): Billboard3D {
    const bb = world3d().objects.addBillboard(key, 0, opts)
      .setTint(WHITE_SAFE_TINT).setDisplaySize(size, size).setPosition(this.host.spot.x, y).setElevation(elevation);
    this.parts.push(bb);
    if (pop) {
      bb.setDisplaySize(size * 0.2, size * 0.2);
      this.tween({ targets: bb, displayWidth: size, displayHeight: size, duration: 300, ease: 'Back.easeOut' });
    }
    return bb;
  }

  /** O cogumelo sai da mão dela num arco e cai dentro da chaleira: plop, e uma nuvem de vapor. */
  private async dropMushroom(): Promise<void> {
    const { shui, spot } = this.host;
    this.host.hop();
    const cap = this.add(LIBERTY_CAP_TEXTURE, 0.62, shui.y + 0.08, 0.7, {}, true);
    cap.setPosition(shui.x, shui.y + 0.08);
    await this.wait(450);
    const arc = { t: 0 };
    await new Promise<void>((resolve) => this.tween({
      targets: arc,
      t: 1,
      duration: 560,
      ease: 'Sine.easeIn',
      onUpdate: () => {
        cap.setPosition(shui.x + (spot.x - shui.x) * arc.t, shui.y + 0.08 + (spot.y - shui.y) * arc.t);
        cap.setElevation(0.7 + Math.sin(arc.t * Math.PI) * 0.5 - arc.t * 0.35);
        cap.setAngle(arc.t * 200);
      },
      onComplete: () => resolve(),
    }));
    cap.destroy();
    this.parts.splice(this.parts.indexOf(cap), 1);
    getSoundManager().nature.playFrogPlop();
    for (let i = 0; i < 4; i += 1) this.puff(spot.x + 0.15, spot.y, 0.5, IRIDESCENT[i]);
  }

  /** O vapor da chaleira: um fiapo a cada `every` ms; depois do cogumelo, furta-cor. */
  private startSteam(every: number): void {
    this.steam?.remove();
    let turn = 0;
    this.steam = this.host.scene.time.addEvent({
      delay: every,
      loop: true,
      callback: () => {
        turn += 1;
        const tint = this.iridescent ? IRIDESCENT[turn % IRIDESCENT.length] : 0xffffff;
        this.puff(this.host.spot.x + 0.36, this.host.spot.y, KETTLE_ELEVATION + 0.36, tint);
      },
    });
  }

  private puff(x: number, y: number, elevation: number, tint: number): void {
    if (!this.alive) return;
    const size = 0.09 + Math.random() * 0.06;
    const puff = world3d().objects.addBillboard(STEAM_TEXTURE, 0, STEAM_OPTS)
      .setTint(tint).setDisplaySize(size, size).setPosition(x + (Math.random() - 0.5) * 0.1, y).setElevation(elevation).setAlpha(0.8);
    this.tween({ targets: puff, elevation: elevation + 0.6, x: puff.x + (Math.random() - 0.5) * 0.25, alpha: 0, duration: 1200, ease: 'Sine.easeOut', onComplete: () => puff.destroy() });
  }

  /** Uma gota de chá caindo do bico na caneca. */
  private drop(x: number, y: number): void {
    if (!this.alive) return;
    const drop = world3d().objects.addBillboard(TEA_DROP_TEXTURE, 0, STEAM_OPTS)
      .setDisplaySize(0.06, 0.06).setPosition(x + (Math.random() - 0.5) * 0.04, y).setElevation(0.34);
    this.tween({ targets: drop, elevation: 0.12, duration: 260, ease: 'Sine.easeIn', onComplete: () => drop.destroy() });
  }

  /** A tampa sacudindo com a fervura. */
  private jiggle(): void {
    if (!this.kettle || !this.alive) return;
    this.tween({ targets: this.kettle, elevation: KETTLE_ELEVATION + 0.03, duration: 90, yoyo: true, repeat: 5, ease: 'Sine.easeInOut' });
  }

  /** O herói quica com o peso da caneca (e no "ahh"). */
  private bounce(): void {
    const body = this.host.heroBody;
    this.host.scene.tweens.killTweensOf(body);
    this.tween({
      targets: body, scaleX: 1.12, scaleY: 0.88, duration: 110, ease: 'Sine.easeOut',
      onComplete: () => this.tween({ targets: body, scaleX: 1, scaleY: 1, duration: 340, ease: 'Back.easeOut' }),
    });
  }

  private tween(config: Engine.Types.Tweens.TweenBuilderConfig): void {
    this.host.scene.tweens.add(config);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.timers.push(this.host.scene.time.delayedCall(ms, () => resolve()));
    });
  }
}
