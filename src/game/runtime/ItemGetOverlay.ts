import Phaser from 'phaser';

import {
  ASSET_KEYS,
  HERO_FRAMES,
  SCENE_DEPTHS,
} from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';

const GLOW_TEXTURE = '_itemget_glow';
const MOTE_TEXTURE = '_itemget_mote';

const ensureTextures = (scene: Phaser.Scene): void => {
  if (!scene.textures.exists(GLOW_TEXTURE)) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,240,200,0.9)');
    grad.addColorStop(0.35, 'rgba(255,214,150,0.35)');
    grad.addColorStop(1, 'rgba(255,200,130,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    scene.textures.addCanvas(GLOW_TEXTURE, canvas);
  }
  if (!scene.textures.exists(MOTE_TEXTURE)) {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,240,1)');
    grad.addColorStop(0.45, 'rgba(255,240,200,0.6)');
    grad.addColorStop(1, 'rgba(255,230,180,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    scene.textures.addCanvas(MOTE_TEXTURE, canvas);
  }
};

const SERIF = "Georgia, 'Times New Roman', 'Book Antiqua', serif";

/** `heroTexture`: qual folha do heroi desenhar (de elmo, ou ja de cabeca descoberta). */
export type ItemGetConfig = { texture: string; frame: number; label: string; heroTexture?: string };

/**
 * GANHAR UMA COISA — mostrado na primeira vez que o heroi apanha cada item.
 *
 * Era o "item get" de Zelda: tela quase preta, raios girando, clarao branco, tremor e uma
 * legenda gritando em caixa alta. Num vale tranquilo isso e um susto. Agora e um instante
 * quente: o mundo continua ali, so mais dourado nas bordas; o cavaleiro da um pulinho; o item
 * sobe devagar, flutua e balanca; sementes de luz sobem como dente-de-leao; e uma frase curta
 * assenta num cartao de pergaminho, com um carrilhao baixinho. Nada pisca, nada treme.
 */
export class ItemGetOverlay {
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly timers: Phaser.Time.TimerEvent[] = [];
  private closing = false;
  private canSkip = false;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly item: ItemGetConfig,
    private readonly onClose: () => void,
  ) {
    ensureTextures(scene);
    const { width, height } = scene.scale;
    const cx = Math.round(width / 2);
    const unit = Math.min(width, height);
    const heroSize = Math.round(unit * 0.2);
    const heroY = Math.round(height * 0.56);
    const itemTopY = Math.round(heroY - heroSize * 1.18);
    const D = SCENE_DEPTHS.toast + 30;

    const reg = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.objs.push(o); return o; };

    // ── o mundo fica, so aquece: uma vinheta ambar suave, nunca preto ─────────────
    const warm = reg(scene.add.rectangle(0, 0, width, height, 0x2a1608, 0).setOrigin(0).setDepth(D).setInteractive());
    scene.tweens.add({ targets: warm, fillAlpha: 0.38, duration: 420, ease: 'Sine.easeOut' });
    const halo = reg(scene.add.image(cx, Math.round((heroY + itemTopY) / 2), GLOW_TEXTURE)
      .setDepth(D + 1).setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(heroSize * 4.2, heroSize * 4.2).setAlpha(0));
    scene.tweens.add({ targets: halo, alpha: 0.75, duration: 700, ease: 'Sine.easeOut' });
    scene.tweens.add({ targets: halo, scale: halo.scale * 1.06, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ── o cavaleiro, de frente, com um pulinho de contente ─────────────────────────
    const hero = reg(scene.add.sprite(cx, heroY, this.item.heroTexture ?? ASSET_KEYS.hero, HERO_FRAMES.idleDown)
      .setOrigin(0.5).setDepth(D + 2).setDisplaySize(heroSize, heroSize).setAlpha(0)) as Phaser.GameObjects.Sprite;
    scene.tweens.add({ targets: hero, alpha: 1, duration: 260, ease: 'Sine.easeOut' });
    this.after(300, () => {
      scene.tweens.add({ targets: hero, y: heroY - heroSize * 0.12, duration: 170, yoyo: true, ease: 'Sine.easeOut' });
    });

    // ── o item: sai das maos e sobe devagar, depois flutua e balanca ───────────────
    const itemSize = Math.round(heroSize * 0.8);
    const itemSprite = reg(scene.add.image(cx, heroY, this.item.texture, this.item.frame)
      .setOrigin(0.5).setDepth(D + 3).setDisplaySize(itemSize * 0.5, itemSize * 0.5).setAlpha(0));
    this.after(380, () => {
      getSoundManager().playCozyChime();
      itemSprite.setAlpha(1);
      scene.tweens.add({
        targets: itemSprite,
        y: itemTopY,
        displayWidth: itemSize,
        displayHeight: itemSize,
        duration: 900,
        ease: 'Sine.easeOut',
        onComplete: () => {
          scene.tweens.add({ targets: itemSprite, y: itemTopY - itemSize * 0.08, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          scene.tweens.add({ targets: itemSprite, angle: { from: -4, to: 4 }, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          this.seeds(cx, itemTopY, itemSize, D + 2);
          this.card(cx, Math.round(height * 0.8), unit, D + 3);
        },
      });
    });

    this.after(900, () => { this.canSkip = true; });
    this.after(3600, () => this.close());

    scene.input.keyboard?.on('keydown', this.handleSkip, this);
    this.after(500, () => {
      if (!this.closing) scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handleSkip, this);
    });
  }

  /** Sementes de luz subindo devagar em volta do item, como dente-de-leao num fim de tarde. */
  private seeds(cx: number, cy: number, itemSize: number, depth: number): void {
    const scene = this.scene;
    const tints = [0xfff4cf, 0xffe1a8, 0xd9f5b0, 0xfff9e8];
    for (let i = 0; i < 14; i += 1) {
      this.after(i * 90, () => {
        if (this.closing) return;
        const x0 = cx + (Math.random() - 0.5) * itemSize * 1.8;
        const y0 = cy + itemSize * (0.2 + Math.random() * 0.5);
        const size = itemSize * (0.08 + Math.random() * 0.08);
        const mote = scene.add.image(x0, y0, MOTE_TEXTURE)
          .setDepth(depth).setBlendMode(Phaser.BlendModes.ADD)
          .setTint(tints[i % tints.length]).setDisplaySize(size, size).setAlpha(0);
        this.objs.push(mote);
        const drift = (Math.random() - 0.5) * itemSize * 0.9;
        scene.tweens.add({ targets: mote, alpha: { from: 0, to: 0.9 }, duration: 400, yoyo: true, hold: 900 });
        scene.tweens.add({
          targets: mote,
          y: y0 - itemSize * (1.4 + Math.random()),
          x: x0 + drift,
          duration: 2200 + Math.random() * 900,
          ease: 'Sine.easeOut',
          onComplete: () => mote.destroy(),
        });
      });
    }
  }

  /** A frase, num cartao de pergaminho que sobe um pouquinho ao assentar. */
  private card(cx: number, y: number, unit: number, depth: number): void {
    if (this.closing) return;
    const scene = this.scene;
    const fontPx = Math.max(15, Math.round(unit * 0.034));
    const text = scene.add.text(cx, y, this.item.label, {
      fontFamily: SERIF,
      fontStyle: 'italic',
      fontSize: `${fontPx}px`,
      color: '#4a3220',
      align: 'center',
      wordWrap: { width: Math.round(scene.scale.width * 0.7) },
      resolution: 2,
    }).setOrigin(0.5).setDepth(depth + 1).setAlpha(0);
    const padX = fontPx * 1.2;
    const padY = fontPx * 0.7;
    const w = text.width + padX * 2;
    const h = text.height + padY * 2;
    const bg = scene.add.graphics().setDepth(depth).setAlpha(0);
    bg.fillStyle(0x2a1608, 0.25);
    bg.fillRoundedRect(cx - w / 2 + 3, y - h / 2 + 4, w, h, fontPx * 0.6);
    bg.fillStyle(0xf6ead0, 0.97);
    bg.fillRoundedRect(cx - w / 2, y - h / 2, w, h, fontPx * 0.6);
    bg.lineStyle(2, 0xc9a877, 1);
    bg.strokeRoundedRect(cx - w / 2 + 4, y - h / 2 + 4, w - 8, h - 8, fontPx * 0.45);
    this.objs.push(bg, text);
    const rise = fontPx * 0.6;
    text.y += rise;
    bg.y += rise;
    scene.tweens.add({ targets: [bg, text], alpha: 1, y: `-=${rise}`, duration: 520, ease: 'Sine.easeOut' });
  }

  private after(ms: number, fn: () => void): void {
    this.timers.push(this.scene.time.delayedCall(ms, fn));
  }

  private readonly handleSkip = (): void => {
    if (this.canSkip) this.close();
  };

  private close(): void {
    if (this.closing) return;
    this.closing = true;
    for (const t of this.timers) t.remove();
    this.scene.input.keyboard?.off('keydown', this.handleSkip, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.handleSkip, this);
    this.scene.tweens.add({
      targets: this.objs,
      alpha: 0,
      duration: 420,
      ease: 'Sine.easeIn',
      onComplete: () => this.onClose(),
    });
  }

  public destroy(): void {
    this.closing = true;
    for (const t of this.timers) t.remove();
    this.scene.input.keyboard?.off('keydown', this.handleSkip, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.handleSkip, this);
    for (const o of this.objs) {
      this.scene.tweens.killTweensOf(o);
      o.destroy();
    }
    this.objs.length = 0;
  }
}
