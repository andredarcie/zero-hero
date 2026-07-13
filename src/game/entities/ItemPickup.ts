import type Phaser from 'phaser';

import { BOMB_FRAMES, ITEM_FRAMES, KEY_FRAMES } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
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

// How each held item looks lying on the ground (textures3d keys). Tools without a dedicated
// map sprite reuse their HUD icon — same 16x16 pixel-art scale.
const GROUND_VISUAL: Record<HeldItemKind, { texture: string; frame: number }> = {
  sword: { texture: 'sword-item', frame: ITEM_FRAMES.swordIdle },
  key: { texture: 'key-item', frame: KEY_FRAMES.pickup },
  axe: { texture: 'axe-icon', frame: 0 },
  bomb: { texture: 'bomb-item', frame: BOMB_FRAMES.item },
  lavaBoots: { texture: 'lava-boots-icon', frame: 0 },
  pickaxe: { texture: 'pickaxe-icon', frame: 0 },
  scythe: { texture: 'scythe-icon', frame: 0 },
  // The "graveto": a single stick (the woodIcon art), NOT the 3-log woodItem pile.
  wood: { texture: 'wood-icon', frame: 0 },
};

const GROUND_SIZE = 0.7; // tiles
const BOB_TILES = 0.09;

// Fixed purple outline around every ground pickup — the hero's own indigo cloak, brightened
// until it reads at night — so collectibles pop against the world at a glance. Same trick as
// the hero's low-health outline: 8 solid-tinted copies of the item art offset one step around
// it. The offsets live in the (worldX, elevation) plane — the billboard's screen plane — and
// every copy is pushed a hair AWAY from the camera in worldY so the real art draws on top.
const OUTLINE_COLOR = 0x9d7bff;
const OUTLINE_OFFSET_TILES = 0.05; // ≈1 art pixel at 16px-per-0.7-tile
const OUTLINE_BEHIND_TILES = 0.02;
const OUTLINE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1],
];

// A single held item sitting on the ground — either authored in world.json or dropped when
// the hero swaps items. It bobs while waiting and is collected on step. A dropped item is
// "unarmed" (not collectable) until the hero steps off its tile, so swapping doesn't instantly
// re-collect the item that just landed under the hero's feet.
export class ItemPickup {
  private readonly sprite: Billboard3D;
  private readonly outline: Billboard3D[];
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
    // Full-bright: pickups must read even in the dark (the 2D game punched a
    // small light hole over every collectible for the same reason).
    this.sprite = world3d()
      .addBillboard(visual.texture, visual.frame, { emissive: true })
      .setPosition(tileX, tileY)
      .setDisplaySize(GROUND_SIZE, GROUND_SIZE);

    // The purple rim: emissive like the item itself, so it also survives the dark.
    // Alpha/elevation are mirrored from the sprite every render (fade-in + bob).
    this.outline = OUTLINE_DIRS.map(([ox]) => world3d()
      .addBillboard(visual.texture, visual.frame, { emissive: true })
      .setTintFill(OUTLINE_COLOR)
      .setPosition(tileX + ox * OUTLINE_OFFSET_TILES, tileY - OUTLINE_BEHIND_TILES)
      .setDisplaySize(GROUND_SIZE, GROUND_SIZE)
      .setAlpha(0));

    // A dropped item lands under the hero, so it's "unarmed" until they step off (the manager
    // arms it); an authored item is armed from the start. Fade in via alpha only — render
    // owns the bob each frame, so a scale tween would just be clobbered.
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
    this.sprite.setVisible(false);
    for (const copy of this.outline) copy.setVisible(false);
  }

  public render(_tileSize: number, _camera: WorldCamera): void {
    if (this.collected) return;
    const bob = this.collectable && this.armed
      ? (Math.sin(this.scene.time.now * 0.0045) + 1) * 0.5 * BOB_TILES
      : 0;
    this.sprite.setElevation(bob);
    // The rim rides the bob and the fade-in with the item. Downward copies clamp at the
    // ground so the bottom edge never sinks under the terrain plane and gets clipped.
    const alpha = this.sprite.alpha;
    for (let i = 0; i < this.outline.length; i++) {
      this.outline[i]
        .setElevation(Math.max(0, bob + OUTLINE_DIRS[i][1] * OUTLINE_OFFSET_TILES))
        .setAlpha(alpha);
    }
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
    for (const copy of this.outline) copy.destroy();
  }
}
