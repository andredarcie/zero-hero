import Phaser from 'phaser';

import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// Tall grass ("mato alto") blocks its tile and sways in the wind. The scythe cuts it — a
// short cutting animation plays and it settles into low stubble (which keeps a gentler
// wind sway) — and fire burns it to the same stubble, charred. Collision is owned here
// (see `blocking`), like the other runtime props.

const WIND_FRAME_MS = 420;
const TALL_WIND = ['tall-grass-wind-0', 'tall-grass-wind-1'] as const;
const CUT_WIND = ['cut-grass-wind-0', 'cut-grass-wind-1'] as const;

const CUTTING_FRAME_MS = 90;
const CUTTING = ['cutting-grass-0', 'cutting-grass-1', 'cutting-grass-2', 'cutting-grass-3'] as const;

const BURN_FRAME_MS = 140;
const BURN_CYCLES = 6; // ~1.7s of licking flames before it settles into charred stubble
const BURNING = ['grass-fire-0', 'grass-fire-1'] as const;

const CHARRED_TINT = 0x585450;

type GrassState = 'tall' | 'cutting' | 'burning' | 'cut';

export class TallGrassObject {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Billboard3D;
  private state: GrassState = 'tall';
  private charred = false;
  private windFrame = 0;
  private windTimer: Phaser.Time.TimerEvent;
  private actionTimer?: Phaser.Time.TimerEvent;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.sprite = world3d()
      .addBillboard(TALL_WIND[0], 0, { groundShadow: { rx: 0.36, rz: 0.34, alpha: 0.24 } })
      .setPosition(worldX, worldY)
      .setDisplaySize(0.94, 0.94);

    // Desynchronize neighbouring patches so a field doesn't sway in lockstep.
    this.windFrame = Phaser.Math.Between(0, 1);
    this.windTimer = scene.time.addEvent({
      delay: WIND_FRAME_MS + Phaser.Math.Between(-60, 60),
      callback: this.advanceWind,
      callbackScope: this,
      loop: true,
    });
  }

  public get blocking(): boolean {
    return this.state === 'tall' || this.state === 'burning';
  }

  public get isTall(): boolean {
    return this.state === 'tall';
  }

  /** Scythe swing: play the cutting animation, then settle into passable stubble. */
  public cut(): boolean {
    if (this.state !== 'tall') return false;
    this.state = 'cutting';

    let frame = 0;
    this.sprite.setTexture(CUTTING[0]);
    this.actionTimer?.destroy();
    this.actionTimer = this.scene.time.addEvent({
      delay: CUTTING_FRAME_MS,
      repeat: CUTTING.length - 1,
      callback: () => {
        frame += 1;
        if (frame < CUTTING.length) this.sprite.setTexture(CUTTING[frame]);
        if (frame >= CUTTING.length - 1) this.toCut(false);
      },
    });
    return true;
  }

  /** Fire (flaming item / bomb): burn for a moment, then settle into charred stubble. */
  public ignite(): boolean {
    if (this.state !== 'tall') return false;
    this.state = 'burning';

    let frame = 0;
    this.sprite.setTexture(BURNING[0]);
    this.actionTimer?.destroy();
    this.actionTimer = this.scene.time.addEvent({
      delay: BURN_FRAME_MS,
      repeat: BURN_CYCLES * BURNING.length - 1,
      callback: () => {
        frame += 1;
        this.sprite.setTexture(BURNING[frame % BURNING.length]);
        if (frame >= BURN_CYCLES * BURNING.length - 1) this.toCut(true);
      },
    });
    return true;
  }

  /** Brief rustle for a bump without the scythe, so it reads as solid. */
  public shake(): void {
    if (this.state !== 'tall') return;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -5, to: 5 },
      duration: 60,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => this.sprite.setAngle(0),
    });
  }

  private toCut(charred: boolean): void {
    this.state = 'cut';
    this.charred = charred;
    this.actionTimer?.destroy();
    this.actionTimer = undefined;
    this.sprite.setTexture(CUT_WIND[this.windFrame % CUT_WIND.length]);
    // Stubble hugs the ground: shorter, and charred if fire did the cutting.
    this.sprite.setDisplaySize(0.94, 0.5);
    if (charred) this.sprite.setTint(CHARRED_TINT).setAlpha(0.85);
  }

  private advanceWind(): void {
    this.windFrame = (this.windFrame + 1) % 2;
    if (this.state === 'tall') this.sprite.setTexture(TALL_WIND[this.windFrame]);
    else if (this.state === 'cut') this.sprite.setTexture(CUT_WIND[this.windFrame]);
  }

  public render(_tileSize: number, _camera: WorldCamera): void {
    // Static in world space — the 3D camera does the moving now.
  }

  public destroy(): void {
    this.windTimer.destroy();
    this.actionTimer?.destroy();
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
