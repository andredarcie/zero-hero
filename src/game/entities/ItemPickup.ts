import Phaser from 'phaser';

import { ASSET_KEYS, BOMB_FRAMES, ITEM_FRAMES, KEY_FRAMES, SCENE_DEPTHS } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// Every carriable item. All share the sword/key behavior: one in hand at a time, swap drops
// the previous one on the ground. Only the bomb is consumed on use.
export type HeldItemKind =
  | 'sword'
  | 'key'
  | 'axe'
  | 'bomb'
  | 'lavaBoots'
  | 'pickaxe'
  | 'scythe'
  | 'wood';

// How each held item looks lying on the ground (the map sprite). Tools without a dedicated
// map sprite reuse their HUD icon — same 16x16 pixel-art scale.
const GROUND_VISUAL: Record<HeldItemKind, { texture: string; frame: number }> = {
  sword: { texture: ASSET_KEYS.swordItem, frame: ITEM_FRAMES.swordIdle },
  key: { texture: ASSET_KEYS.keyItem, frame: KEY_FRAMES.pickup },
  axe: { texture: ASSET_KEYS.axeIcon, frame: 0 },
  bomb: { texture: ASSET_KEYS.bombItem, frame: BOMB_FRAMES.item },
  lavaBoots: { texture: ASSET_KEYS.lavaBootsIcon, frame: 0 },
  pickaxe: { texture: ASSET_KEYS.pickaxeIcon, frame: 0 },
  scythe: { texture: ASSET_KEYS.scytheIcon, frame: 0 },
  // The "graveto": a single stick (the woodIcon art), NOT the 3-log woodItem pile.
  wood: { texture: ASSET_KEYS.woodIcon, frame: 0 },
};

// A single held item sitting on the ground — either authored in world.json or dropped when
// the hero swaps items. It bobs while waiting and is collected on step. A dropped item is
// "unarmed" (not collectable) until the hero steps off its tile, so swapping doesn't instantly
// re-collect the item that just landed under the hero's feet.
export class ItemPickup {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private collectable = false;
  private collected = false;

  public armed: boolean;

  public constructor(
    private readonly scene: Phaser.Scene,
    public readonly kind: HeldItemKind,
    public readonly tileX: number,
    public readonly tileY: number,
    dropped = false,
  ) {
    const visual = GROUND_VISUAL[kind];
    this.sprite = scene.add
      .sprite(0, 0, visual.texture, visual.frame)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.item);

    // A dropped item lands under the hero, so it's "unarmed" until they step off (the manager
    // arms it); an authored item is armed from the start. Fade in via alpha only — render
    // owns the sprite's display size each frame, so a scale tween would just be clobbered.
    this.armed = !dropped;
    this.sprite.setAlpha(0);
    scene.tweens.add({
      targets: this.sprite,
      alpha: 1,
      duration: dropped ? 200 : 250,
      onComplete: () => { this.collectable = true; },
    });
    if (dropped) this.collectable = true;
  }

  public get isCollectable(): boolean { return this.collectable; }
  public get isCollected(): boolean { return this.collected; }

  /** Mark collected — the flying-to-HUD visual is spawned separately by the scene. */
  public collect(): void {
    this.collected = true;
    this.collectable = false;
  }

  public render(tileSize: number, camera: WorldCamera): void {
    if (this.collected) return;
    const screen = camera.tileToScreen(this.tileX, this.tileY, tileSize);
    const bob = this.collectable && this.armed
      ? Math.sin(this.scene.time.now * 0.0045) * Math.max(1, tileSize * 0.1)
      : 0;
    const size = Math.max(10, Math.floor(tileSize * 0.7));
    this.sprite.setPosition(screen.x, screen.y + bob).setDisplaySize(size, size);
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}
