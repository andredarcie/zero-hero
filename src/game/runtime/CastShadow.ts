import Phaser from 'phaser';

import type { WorldCamera } from '@/game/runtime/WorldCamera';

// Dynamic cast shadows for objects standing in a campfire's light. A flame is a point light a
// little above the ground: an object between it and the dark throws a shadow that (a) points
// straight away from the flame and (b) grows longer as the flame dips and its light grazes lower.
// Because the flame height flickers, the shadows wax and wane — they "breathe" with the fire.
//
// Best-practice Phaser realisation: a black `setTintFill` silhouette of the object, pinned at its
// foot, rotated to face away from the flame and stretched along its length. No shaders, no
// per-object churn — one pooled/owned sprite per caster, reconfigured each frame.

export type ShadowSprite = Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;

export type ShadowCaster = {
  sprite: ShadowSprite;
  worldX: number;
  worldY: number;
  // Fixed screen-space foot point. The hero is pinned at screen centre while the world scrolls
  // under it, so its shadow must anchor HERE rather than at tileToScreen(worldTile) — otherwise
  // the anchor slides a whole tile out at the start of each step and lags back into place.
  footScreen?: { x: number; y: number };
};

// Everything the shadow maths needs about the flames, supplied fresh each frame by the scene.
export type FireLightCtx = {
  // Nearest LIT flame to a world tile, in SCREEN space, or null when no flame reaches it.
  nearest(worldX: number, worldY: number): { sx: number; sy: number } | null;
  flicker: number;  // current flame-height flicker, ~[0.8, 1.2] (1 = resting height)
  radiusPx: number; // the flame's reach in SCREEN pixels (radiusTiles × tileSize)
};

const FOOT_ORIGIN_Y = 0.9;   // pivot near the object's base so the shadow sweeps around its foot
const MAX_ALPHA = 0.52;      // darkness of a shadow right beside the flame
const WIDTH_FACTOR = 0.92;   // shadows are a touch slimmer than the object that casts them
const NEAR_STRETCH = 0.55;   // length multiplier for an object hugging the flame (short shadow)
const FAR_STRETCH = 1.85;    // length multiplier at the very edge of the light (long, grazing)

// Configure `shadow` to mirror `source` as a black silhouette laid down away from the nearest
// flame. Call every frame. Hides the shadow when the object is out of every flame's reach.
// `footX/footY` is the object's ground-contact point in screen space.
export function projectCastShadow(
  shadow: Phaser.GameObjects.Sprite,
  source: ShadowSprite,
  footX: number,
  footY: number,
  ctx: FireLightCtx,
  worldX: number,
  worldY: number,
): void {
  const fire = ctx.nearest(worldX, worldY);
  if (!fire) { shadow.setVisible(false); return; }

  // Direction from the flame to the object = the way the shadow falls.
  let dx = footX - fire.sx;
  let dy = footY - fire.sy;
  const distPx = Math.hypot(dx, dy) || 1;
  dx /= distPx;
  dy /= distPx;
  const angle = Math.atan2(dy, dx);

  // Distance to the flame as a 0..1 fraction of its reach, measured in SCREEN pixels so it stays
  // smooth while the world scrolls under the centred hero (world-tile distance snaps a step at a
  // time, which made the hero's shadow pop/lag).
  const t = Phaser.Math.Clamp(distPx / ctx.radiusPx, 0, 1);

  // Length: longer the farther from the flame (grazing light), and longer as the flame dips
  // (flicker < 1 → taller shadow). That inverse coupling is what makes the shadows wax and wane.
  const distStretch = Phaser.Math.Linear(NEAR_STRETCH, FAR_STRETCH, t);
  const flameStretch = 1.9 - ctx.flicker; // flicker[0.8,1.2] → [1.1,0.7]
  const lengthScale = distStretch * flameStretch;

  // Fade toward the light's edge (the ground there is already black, so a hard shadow line would
  // look wrong). Darkest right beside the flame.
  const alpha = Phaser.Math.Linear(MAX_ALPHA, 0, t * t);
  if (alpha <= 0.02) { shadow.setVisible(false); return; }

  // Mirror the object's current look as a flat black silhouette laid along the shadow direction.
  // Rotation 0 is "upright" (the silhouette points up, -y); +90° turns "up" into the shadow angle.
  shadow
    .setTexture(source.texture.key, source.frame.name)
    .setFlipX(source.flipX)
    .setOrigin(0.5, FOOT_ORIGIN_Y)
    .setPosition(footX, footY)
    .setRotation(angle + Math.PI / 2)
    .setScale(source.scaleX * WIDTH_FACTOR, source.scaleY * lengthScale)
    .setAlpha(alpha)
    .setVisible(true);
}

// A small pool of shadow silhouettes for the runtime props (dry trees, rocks, bushes, gates…).
// The scene hands it the current list of casters each frame; the pool grows to fit and hides any
// spare sprites, so no per-caster allocation happens in steady state.
export class CastShadowPool {
  private readonly pool: Phaser.GameObjects.Sprite[] = [];

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth: number,
  ) {}

  public update(
    casters: readonly ShadowCaster[],
    ctx: FireLightCtx,
    tileSize: number,
    camera: WorldCamera,
  ): void {
    let i = 0;
    for (const caster of casters) {
      const src = caster.sprite;
      if (!src.visible) continue;

      let shadow = this.pool[i];
      if (!shadow) {
        shadow = this.scene.add
          .sprite(0, 0, src.texture.key)
          .setTintFill(0x000000)
          .setVisible(false)
          .setDepth(this.depth);
        this.pool[i] = shadow;
      }

      // The hero passes a fixed screen foot (it stays at screen centre); everything else anchors
      // at its scrolling tile position.
      let footX: number;
      let footY: number;
      if (caster.footScreen) {
        footX = caster.footScreen.x;
        footY = caster.footScreen.y;
      } else {
        const screen = camera.tileToScreen(caster.worldX, caster.worldY, tileSize);
        footX = screen.x;
        footY = screen.y + Math.round(tileSize * 0.3);
      }
      projectCastShadow(shadow, src, footX, footY, ctx, caster.worldX, caster.worldY);
      i += 1;
    }

    for (; i < this.pool.length; i += 1) this.pool[i].setVisible(false);
  }

  public destroy(): void {
    this.pool.forEach((s) => s.destroy());
    this.pool.length = 0;
  }
}
