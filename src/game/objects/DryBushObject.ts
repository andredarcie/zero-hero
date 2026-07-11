import Phaser from 'phaser';

import { ASSET_KEYS, ySortDepth } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// A dry bush ("mato seco") blocks its tile until a flaming torch ignites it. It burns for
// BURN_MS — charring from brown to ash while little flames flicker on top — then collapses
// into a passable ash pile. Collision is owned here (see `blocking`) and resolved at runtime,
// exactly like CampfireObject, so nothing has to touch the baked collision grid.

const BURN_MS = 2200;
const FIRE_FRAME_MS = 110;
const FIRE_KEYS = [ASSET_KEYS.tinyFire0, ASSET_KEYS.tinyFire1, ASSET_KEYS.tinyFire2] as const;

// tinyFire sprites offset over the bush (fractions of tileSize), each a little out of phase.
const FIRE_SPOTS = [
  { ox: -0.16, oy: -0.02, scale: 0.5, phase: 0 },
  { ox: 0.14, oy: 0.06, scale: 0.42, phase: 1 },
  { ox: 0.0, oy: -0.2, scale: 0.6, phase: 2 },
] as const;

const WHITE = new Phaser.Display.Color(255, 255, 255);
const ASH = new Phaser.Display.Color(88, 84, 80);

type BushState = 'intact' | 'burning' | 'ash';

export class DryBushObject {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Image;
  private state: BushState = 'intact';
  private fires: Phaser.GameObjects.Image[] = [];
  private fireTimer?: Phaser.Time.TimerEvent;
  private fireFrame = 0;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.sprite = scene.add
      .image(0, 0, ASSET_KEYS.dryBush)
      .setOrigin(0.5)
      .setDepth(ySortDepth(worldY));
  }

  /** The tile is impassable while the bush stands or burns; ash lets the hero walk through. */
  public get blocking(): boolean {
    return this.state !== 'ash';
  }

  /** The sprite to cast a firelight shadow from while the bush still stands (null once ash). */
  public get shadowCaster(): Phaser.GameObjects.Sprite | Phaser.GameObjects.Image | null {
    return this.blocking ? this.sprite : null;
  }

  public get isAsh(): boolean {
    return this.state === 'ash';
  }

  /** Set the bush alight; only an intact bush can catch. Returns true if it just ignited. */
  public ignite(): boolean {
    if (this.state !== 'intact') return false;
    this.state = 'burning';

    for (let i = 0; i < FIRE_SPOTS.length; i += 1) {
      const fire = this.scene.add
        .image(0, 0, FIRE_KEYS[i % FIRE_KEYS.length])
        .setOrigin(0.5, 1)
        .setDepth(ySortDepth(this.worldY) + 0.1);
      this.fires.push(fire);
    }
    this.fireTimer = this.scene.time.addEvent({
      delay: FIRE_FRAME_MS,
      callback: this.advanceFire,
      callbackScope: this,
      loop: true,
    });

    // Char from natural brown (no tint) toward ash grey over the burn.
    this.scene.tweens.addCounter({
      from: 0,
      to: 100,
      duration: BURN_MS,
      onUpdate: (tween) => {
        const progress = tween.getValue() ?? 0;
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(WHITE, ASH, 100, progress);
        this.sprite.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      },
      onComplete: () => this.toAsh(),
    });

    return true;
  }

  /** Brief shake so bumping the bush (even without fire) reads as a solid obstacle. */
  public shake(): void {
    if (this.state !== 'intact') return;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -6, to: 6 },
      duration: 60,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => this.sprite.setAngle(0),
    });
  }

  private advanceFire(): void {
    this.fireFrame += 1;
    this.fires.forEach((fire, i) => {
      fire.setTexture(FIRE_KEYS[(this.fireFrame + FIRE_SPOTS[i].phase) % FIRE_KEYS.length]);
    });
  }

  private toAsh(): void {
    this.state = 'ash';
    this.fireTimer?.destroy();
    this.fireTimer = undefined;
    this.fires.forEach((fire) => fire.destroy());
    this.fires = [];
    // A low, greyed, half-faded smudge that reads as leftover ash.
    this.sprite
      .setTint(Phaser.Display.Color.GetColor(ASH.red, ASH.green, ASH.blue))
      .setAlpha(0.7);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleY: this.sprite.scaleY * 0.55,
      duration: 260,
      ease: 'Power2.easeIn',
    });
  }

  public render(tileSize: number, camera: WorldCamera): void {
    const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    const size = Math.max(12, Math.floor(tileSize * 0.9));

    this.sprite.setPosition(screen.x, screen.y).setDepth(ySortDepth(this.worldY));
    if (this.sprite.displayWidth !== size) this.sprite.setDisplaySize(size, size);

    // Anchor flames to the base of the bush and let them lick upward.
    for (let i = 0; i < this.fires.length; i += 1) {
      const spot = FIRE_SPOTS[i];
      const fire = this.fires[i];
      fire
        .setPosition(screen.x + spot.ox * tileSize, screen.y + tileSize * 0.42 + spot.oy * tileSize)
        .setDisplaySize(tileSize * spot.scale, tileSize * spot.scale * 1.3)
        .setDepth(ySortDepth(this.worldY) + 0.1);
    }
  }

  public destroy(): void {
    this.fireTimer?.destroy();
    this.fires.forEach((fire) => fire.destroy());
    this.fires = [];
    this.sprite.destroy();
  }
}
