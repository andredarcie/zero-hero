import Phaser from 'phaser';

import {
  ASSET_KEYS,
  FONT_FAMILY,
  HERO_FRAMES,
  ITEM_FRAMES,
  SCENE_DEPTHS,
  TEXT_RESOLUTION,
} from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';

const GLOW_TEXTURE = '_itemget_glow';

const ensureGlowTexture = (scene: Phaser.Scene): void => {
  if (scene.textures.exists(GLOW_TEXTURE)) return;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,250,225,1)');
  grad.addColorStop(0.4, 'rgba(255,226,150,0.55)');
  grad.addColorStop(1, 'rgba(255,210,120,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  scene.textures.addCanvas(GLOW_TEXTURE, canvas);
};

/**
 * "You got the sword!" presentation — the classic item-get beat. Freezes gameplay, shows
 * the hero centered on a darkened screen, and the sword rises above their head with a burst
 * of light, rays, sparkles, a flash and a screen shake. Original effect (no copied assets).
 */
export class SwordGetOverlay {
  private readonly objs: Phaser.GameObjects.GameObject[] = [];
  private readonly timers: Phaser.Time.TimerEvent[] = [];
  private raySpin?: Phaser.Tweens.Tween;
  private closing = false;
  private canSkip = false;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly onClose: () => void,
  ) {
    ensureGlowTexture(scene);
    const { width, height } = scene.scale;
    const cx = Math.round(width / 2);
    const unit = Math.min(width, height);
    const heroSize = Math.round(unit * 0.24);
    const heroY = Math.round(height * 0.6);
    const swordTopY = Math.round(heroY - heroSize * 0.95);
    const D = SCENE_DEPTHS.toast + 30;

    const reg = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.objs.push(o); return o; };

    // ── darken the world ────────────────────────────────────────────────
    const dim = reg(scene.add.rectangle(0, 0, width, height, 0x05030a, 0)
      .setOrigin(0).setDepth(D).setInteractive());
    scene.tweens.add({ targets: dim, fillAlpha: 0.84, duration: 260, ease: 'Sine.Out' });

    // ── backlight + rotating rays (hidden until the apex) ───────────────
    const glow = reg(scene.add.image(cx, swordTopY, GLOW_TEXTURE)
      .setDepth(D + 1).setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(heroSize * 3.2, heroSize * 3.2).setAlpha(0));

    const rays = reg(this.buildRays(cx, swordTopY, Math.max(width, height))
      .setDepth(D + 1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(0.2));

    // ── hero, centered, popping in ──────────────────────────────────────
    const hero = reg(scene.add.sprite(cx, heroY, ASSET_KEYS.hero, HERO_FRAMES.idleDown)
      .setOrigin(0.5).setDepth(D + 2).setDisplaySize(heroSize, heroSize)) as Phaser.GameObjects.Sprite;
    hero.setScale(hero.scaleX * 0.3);
    scene.tweens.add({ targets: hero, scaleX: hero.scaleX / 0.3, scaleY: hero.scaleY / 0.3, duration: 320, ease: 'Back.easeOut' });

    // ── the sword: starts at the hero's hands, rises above the head ─────
    const swordSize = Math.round(heroSize * 0.85);
    const sword = reg(scene.add.image(cx, heroY - Math.round(heroSize * 0.05), ASSET_KEYS.swordItem, ITEM_FRAMES.swordIdle)
      .setOrigin(0.5).setDepth(D + 3).setDisplaySize(swordSize * 0.7, swordSize * 0.7).setAngle(-12).setAlpha(0));

    const label = reg(scene.add.text(cx, Math.round(height * 0.82), 'VOCE PEGOU A ESPADA!', {
      fontFamily: FONT_FAMILY,
      fontSize: `${Math.max(8, Math.round(unit * 0.03))}px`,
      color: '#ffe9a8',
      stroke: '#3a2406',
      strokeThickness: 3,
      align: 'center',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5).setDepth(D + 3).setAlpha(0)) as Phaser.GameObjects.Text;

    // Raise the sword after the hero settles, then fire the burst at the apex.
    this.after(280, () => {
      getSoundManager().playSwordSlash();
      sword.setAlpha(1);
      scene.tweens.add({
        targets: sword,
        y: swordTopY,
        angle: 0,
        displayWidth: swordSize,
        displayHeight: swordSize,
        duration: 560,
        ease: 'Back.easeOut',
        onComplete: () => this.burst(cx, swordTopY, D, hero, glow, rays, label),
      });
    });

    this.after(700, () => { this.canSkip = true; });
    this.after(3200, () => this.close());

    scene.input.keyboard?.on('keydown', this.handleSkip, this);
    this.after(420, () => {
      if (!this.closing) scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handleSkip, this);
    });
  }

  private burst(
    cx: number,
    cy: number,
    depth: number,
    hero: Phaser.GameObjects.Sprite,
    glow: Phaser.GameObjects.Image,
    rays: Phaser.GameObjects.Graphics,
    label: Phaser.GameObjects.Text,
  ): void {
    if (this.closing) return;
    const scene = this.scene;
    getSoundManager().playSwordPickup();
    scene.cameras.main.shake(200, 0.005);

    // white flash
    const { width, height } = scene.scale;
    const flash = scene.add.rectangle(0, 0, width, height, 0xffffff, 0)
      .setOrigin(0).setDepth(depth + 5);
    this.objs.push(flash);
    scene.tweens.add({ targets: flash, fillAlpha: 0.75, duration: 90, yoyo: true, hold: 30, ease: 'Quad.Out', onComplete: () => flash.destroy() });

    // hero flashes bright
    hero.setTintFill(0xfff6d0);
    this.after(120, () => hero.clearTint());

    // glow + rays appear and the rays keep slowly spinning
    scene.tweens.add({ targets: glow, alpha: 0.9, duration: 300, ease: 'Sine.Out' });
    scene.tweens.add({ targets: glow, scale: glow.scale * 1.08, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    scene.tweens.add({ targets: rays, alpha: 0.5, scale: 1, duration: 320, ease: 'Back.easeOut' });
    this.raySpin = scene.tweens.add({ targets: rays, angle: 360, duration: 9000, repeat: -1 });

    // expanding ring
    const ring = scene.add.circle(cx, cy, Math.round(scene.scale.height * 0.06), 0xffffff, 0)
      .setStrokeStyle(3, 0xffe9a8, 1).setDepth(depth + 4).setScale(0.3);
    this.objs.push(ring);
    scene.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 520, ease: 'Cubic.Out', onComplete: () => ring.destroy() });

    // sparkle stars flying outward
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 + 0.3;
      const dist = scene.scale.height * (0.12 + Math.random() * 0.1);
      const star = scene.add.star(cx, cy, 4, 2, Math.max(4, Math.round(scene.scale.height * 0.012)), 0xffffff)
        .setDepth(depth + 4).setAngle(Math.random() * 90).setBlendMode(Phaser.BlendModes.ADD);
      this.objs.push(star);
      scene.tweens.add({
        targets: star,
        x: cx + Math.cos(ang) * dist,
        y: cy + Math.sin(ang) * dist,
        angle: star.angle + 180,
        scale: 0,
        alpha: 0,
        duration: 520 + Math.random() * 220,
        ease: 'Quad.Out',
        onComplete: () => star.destroy(),
      });
    }

    // a steady glint on the blade tip
    const glint = scene.add.star(cx, cy, 4, 1.6, Math.max(5, Math.round(scene.scale.height * 0.02)), 0xffffff)
      .setDepth(depth + 4).setBlendMode(Phaser.BlendModes.ADD);
    this.objs.push(glint);
    glint.setScale(0);
    scene.tweens.add({ targets: glint, scale: 1, duration: 220, delay: 120, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: glint, scale: 0.7, duration: 900, delay: 340, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // label
    label.setScale(0.85);
    scene.tweens.add({ targets: label, alpha: 1, scale: 1, duration: 280, ease: 'Back.easeOut' });
  }

  private buildRays(x: number, y: number, reach: number): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics();
    const n = 12;
    g.fillStyle(0xfff0bf, 0.16);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2 / n) * 0.42;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a0) * reach, Math.sin(a0) * reach);
      g.lineTo(Math.cos(a1) * reach, Math.sin(a1) * reach);
      g.closePath();
      g.fillPath();
    }
    g.setPosition(x, y);
    return g;
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
    this.raySpin?.stop();
    this.scene.tweens.add({
      targets: this.objs,
      alpha: 0,
      duration: 220,
      ease: 'Sine.In',
      onComplete: () => this.onClose(),
    });
  }

  public destroy(): void {
    this.closing = true;
    for (const t of this.timers) t.remove();
    this.raySpin?.stop();
    this.scene.input.keyboard?.off('keydown', this.handleSkip, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.handleSkip, this);
    for (const o of this.objs) o.destroy();
    this.objs.length = 0;
  }
}
