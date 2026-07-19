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
  | 'wood'
  // A chunk of rock, left behind when the pickaxe shatters one. The pickaxe used to just
  // DELETE its obstacle — the only thing it produced was passage, which makes it a password
  // and not a tool. Now it produces MATTER, and that matter is the wood stick's opposite:
  // both cross a river, but a plank deck burns (and carries fire across) while a stone ford
  // never will. So every crossing becomes a question — do I want a floor, or a fuse?
  | 'stone'
  // A handful of SEEDS ("sementes"), cut from tall grass with the scythe. The grass made
  // renewable and PORTABLE: planted in a dug hole (plantSpot), watered with the bucket, it
  // sprouts REAL tall grass — the first fire conductor the player grows, not one baked into
  // the map. Cutting the grown grass yields seeds again: a farming loop, and what turns the
  // scythe from a password (grass -> nothing) into a producer.
  | 'seeds'
  // An EMPTY bucket, and the same bucket once FILLED at the river. The counter to the whole fire
  // system: dip it in a river to fill it, then pour it on any lit campfire to put it out — one
  // use, then go back for more water. The one deliberate way to UNDO fire (the scythe only ever
  // pre-empts fuel). Empty vs full shows as the art the hero carries; there is no HUD.
  | 'bucket'
  | 'bucketFull';

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
  stone: { texture: 'rock', frame: 0 },
  // The seeds sprite comes from the sprite factory (spritefactory/sprites/seeds.mjs).
  seeds: { texture: 'seeds-item', frame: 0 },
  // The bucket art is generated at boot (bucketTexture.ts) into both pipelines.
  bucket: { texture: 'bucket-icon', frame: 0 },
  bucketFull: { texture: 'bucket-full-icon', frame: 0 },
};

/**
 * Como um item se desenha quando esta no chao. Exposto porque o braco robotico precisa desenhar
 * a MESMA arte enquanto carrega a carga pelo ar — se ele escolhesse a arte por conta propria,
 * um item novo passaria a ter duas aparencias no chao e uma delas ficaria pra tras.
 */
export const itemGroundVisual = (kind: HeldItemKind): { texture: string; frame: number } =>
  GROUND_VISUAL[kind];

const GROUND_SIZE = 0.7; // tiles
const BOB_TILES = 0.09;

// Fixed purple outline around every ground pickup — the hero's own indigo cloak, brightened
// until it reads at night — so collectibles pop against the world at a glance. Same trick as
// the hero's low-health outline: 8 solid-tinted copies of the item art offset one step around
// it. The offsets live in the (worldX, elevation) plane — the billboard's screen plane — and
// every copy is pushed a hair AWAY from the camera in worldY so the real art draws on top.
// (That last nudge is the same idea the whole renderer now states as DEPTH_LAYER — this is
// just the *inner* order, between the item and its own rim, inside the ground layer.)
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
    //
    // GROUND layer, always: an item lies on a tile the hero WALKS ONTO — that is the whole
    // interaction — so the two quads share a spot constantly. Without a declared layer they are
    // coplanar and the item strobes under his feet (see DEPTH_LAYER). This one option is what
    // makes every collectible in the game safe, not each item kind remembering on its own.
    this.sprite = world3d()
      .addBillboard(visual.texture, visual.frame, { emissive: true, depthLayer: 'ground' })
      .setPosition(tileX, tileY)
      .setDisplaySize(GROUND_SIZE, GROUND_SIZE);

    // The purple rim: emissive like the item itself, so it also survives the dark.
    // Alpha/elevation are mirrored from the sprite every render (fade-in + bob).
    this.outline = OUTLINE_DIRS.map(([ox]) => world3d()
      .addBillboard(visual.texture, visual.frame, { emissive: true, depthLayer: 'ground' })
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
