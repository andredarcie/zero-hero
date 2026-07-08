import Phaser from 'phaser';

import { ASSET_KEYS, ySortDepth } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// Tall grass ("mato alto") blocks its tile and sways in the wind. The scythe cuts it — a
// short cutting animation plays and it settles into low stubble (which keeps a gentler
// wind sway) — and fire burns it to the same stubble, charred. Collision is owned here
// (see `blocking`), like the other runtime props.

const WIND_FRAME_MS = 420;
const TALL_WIND = [ASSET_KEYS.tallGrassWind0, ASSET_KEYS.tallGrassWind1] as const;
const CUT_WIND = [ASSET_KEYS.cutGrassWind0, ASSET_KEYS.cutGrassWind1] as const;

const CUTTING_FRAME_MS = 90;
const CUTTING = [
  ASSET_KEYS.cuttingGrass0,
  ASSET_KEYS.cuttingGrass1,
  ASSET_KEYS.cuttingGrass2,
  ASSET_KEYS.cuttingGrass3,
] as const;

const BURN_FRAME_MS = 140;
const BURN_CYCLES = 6; // ~1.7s of licking flames before it settles into charred stubble
const BURNING = [ASSET_KEYS.grassFire0, ASSET_KEYS.grassFire1] as const;

const CHARRED_TINT = 0x585450;

type GrassState = 'tall' | 'cutting' | 'burning' | 'cut';

export class TallGrassObject {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Image;
  private state: GrassState = 'tall';
  private charred = false;
  private windFrame = 0;
  private windTimer: Phaser.Time.TimerEvent;
  private actionTimer?: Phaser.Time.TimerEvent;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.sprite = scene.add
      .image(0, 0, TALL_WIND[0])
      .setOrigin(0.5)
      .setDepth(ySortDepth(worldY));

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
    if (charred) this.sprite.setTint(CHARRED_TINT).setAlpha(0.85);
  }

  private advanceWind(): void {
    this.windFrame = (this.windFrame + 1) % 2;
    if (this.state === 'tall') this.sprite.setTexture(TALL_WIND[this.windFrame]);
    else if (this.state === 'cut') this.sprite.setTexture(CUT_WIND[this.windFrame]);
  }

  public render(tileSize: number, camera: WorldCamera): void {
    const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    const size = Math.max(12, Math.floor(tileSize * 0.94));
    // Stubble lies flat under the hero's feet; standing grass joins the y-sort band.
    const depth = this.state === 'cut' ? ySortDepth(this.worldY) - 0.4 : ySortDepth(this.worldY);
    this.sprite.setPosition(screen.x, screen.y).setDepth(depth);
    if (this.sprite.displayWidth !== size) this.sprite.setDisplaySize(size, size);
  }

  public destroy(): void {
    this.windTimer.destroy();
    this.actionTimer?.destroy();
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
