// O VAU DE PEDRAS: cada pedra que cai na água, o espirro, a espuma, e o tile que vira chão. O WaterObject decide que
// pedra entra; aqui é como ela entra.

import { getSoundManager } from '@/game/audio/SoundManager';
import { getStoneTexture } from '@/game/render3d/stoneTexture';
import { FX_PUFF_TEXTURE, WATER_DEPTH_TILES, world3d, type Box3D } from '@/game/render3d/World3D';
import type { WaterObject } from './WaterObject';

// ── The stone ford ───────────────────────────────────────────────────────────
// A bridge SPANS the channel — its deck rides at ground level on legs. A ford does the
// opposite: the stones SIT ON THE RIVERBED and break the surface. That distinction is the
// whole reason the first cut looked wrong. Its boxes were centred at +0.04 (ground level, like
// the planks), which — with a channel 0.42 tiles deep — left them hovering a third of a tile
// ABOVE the water: rocks floating in mid-air over the river.
//
// So each part is built from where its TOP FACE should land, and grown DOWN to the bed.
export const BED_Y = -WATER_DEPTH_TILES; // the channel floor the stones rest on
export const WATER_Y = -WATER_DEPTH_TILES + 0.03; // the surface they break through
// Tops. The slab you actually walk on sits a shallow step above the ground, like the deck's
// planks — but the boulders must crest CLEARLY ABOVE it, or they hide behind the slab and the
// whole ford flattens into one grey rectangle (which is exactly what the first cut did). Three
// different heights, so the silhouette is lumpy river rock rather than a paving stone.
const FORD_TOPS = { slab: 0.05, tall: 0.22, mid: 0.16, low: 0.1 };
const FORD_DROP_FROM = 0.9;

/** O que WaterFord usa de WaterObject. */
export type WaterFordHost = Pick<WaterObject,
  'buildable' | 'fordFoam' | 'fordParts' | 'forded' | 'frame' | 'isBridge' | 'pips' | 'planks' | 'scene'
  | 'worldX' | 'worldY'
>;

export class WaterFord {
  public constructor(private readonly host: WaterFordHost) {}

  /**
   * Drop a stone in the river: ONE is enough, and it is done — no carpentry, no second trip.
   * Cheaper than the two-graveto deck, and it never burns. What it costs you is the fuse: fire
   * stops dead at a ford (see burn()), so a river crossed in stone is a river fire cannot cross.
   *
   * Returns false off a buildable spot, or if something already spans this tile.
   */
  public placeStone(): boolean {
    if (!this.host.buildable || this.host.isBridge || this.host.forded) return false;
    this.host.forded = true;
    this.host.pips.setVisible(false);

    // The ghost deck (the "you could build here" preview) is not what got built — hide it.
    for (const part of [...this.host.frame, ...this.host.planks]) part.box.setVisible(false);

    // REAL box geometry, like the bridge deck beside it. A camera-facing billboard here was a
    // sticker of a rock standing upright in the river — the same "sheet of paper" the tall
    // grass used to be. A ford is a big worn SLAB you step on, with smaller boulders wedged
    // around it holding it in the current, each one a box with actual thickness sitting IN the
    // sunken channel (the river bed is WATER_DEPTH_TILES below the ground plane).
    const w3 = world3d();
    // Each stone is grown DOWN from the height its crown should reach to the riverbed, so it
    // stands IN the channel rather than hovering over it. Offsets are deliberately NOT
    // symmetric: a ford is rubble that fell where it fell, and a tidy cross of stones would
    // read as masonry.
    const stand = (
      kind: 'slab' | 'boulder',
      sizeX: number,
      sizeZ: number,
      top: number,
      ox: number,
      oy: number,
    ): { box: Box3D; ox: number; oy: number; rest: number } => {
      const height = top - BED_Y;
      const box = w3.objects.addBox(sizeX, height, sizeZ, getStoneTexture(kind));
      return { box, ox, oy, rest: BED_Y + height / 2 }; // elevation is the box's CENTRE
    };

    // The slab is kept well INSIDE the tile so dark water still shows at the corners — a stone
    // that fills its square edge to edge reads as a paved tile, not as a rock in a river.
    this.host.fordParts = [
      stand('slab', 0.6, 0.52, FORD_TOPS.slab, 0.0, 0.04), // the face you step on
      stand('boulder', 0.32, 0.28, FORD_TOPS.tall, -0.31, -0.2),
      stand('boulder', 0.26, 0.24, FORD_TOPS.mid, 0.33, 0.18),
      stand('boulder', 0.2, 0.18, FORD_TOPS.low, 0.26, -0.3),
    ];

    // The current breaking on the stones. This is the detail that actually sells a ford: a rock
    // sitting in still blackness reads as a rock sitting on a floor, but water piling up and
    // tearing white around its edges reads as a river. Little foam puffs around the rim, each
    // breathing out of phase with the others so the seam never pulses in lockstep.
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + 0.4;
      const foam = world3d()
        .objects.addBillboard(FX_PUFF_TEXTURE, 0, { flat: true, fog: false, depthWrite: false, additive: true })
        .setTint(0xbcd6e2)
        .setPosition(this.host.worldX + Math.cos(ang) * 0.42, this.host.worldY + Math.sin(ang) * 0.36)
        .setElevation(WATER_Y + 0.012)
        .setDisplaySize(0.34, 0.3)
        .setAlpha(0);
      this.host.fordFoam.push(foam);
      this.host.scene.tweens.add({
        targets: foam,
        alpha: { from: 0.1, to: 0.3 },
        duration: 900 + i * 130,
        delay: 500 + i * 90, // wait for the stones to land before the water reacts to them
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    // The slab lands first and hardest; the boulders tumble in after it, a beat apart.
    this.host.fordParts.forEach((part, i) => {
      part.box
        .setPosition(this.host.worldX + part.ox, this.host.worldY + part.oy)
        .setElevation(part.rest + FORD_DROP_FROM);
      this.host.scene.tweens.add({
        targets: part.box,
        elevation: part.rest,
        duration: 220,
        delay: i * 110,
        ease: 'Quad.easeIn',
        onComplete: () => {
          getSoundManager().nature.playSplash();
          this.spawnFordSpray(this.host.worldX + part.ox, this.host.worldY + part.oy, i === 0);
          if (i === 0) getSoundManager().work.playRockSmash();
        },
      });
    });

    return true;
  }

  /**
   * The water's answer to a rock: a ring of white spray thrown up where it broke the surface.
   * Flat, fogless puffs that expand and die — the same FX family the carpentry's sawdust uses,
   * tinted to river foam instead of pine.
   */
  private spawnFordSpray(x: number, y: number, big: boolean): void {
    const count = big ? 8 : 4;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const reach = (big ? 0.42 : 0.26) * (0.6 + Math.random() * 0.6);
      const drop = world3d()
        .objects.addBillboard(FX_PUFF_TEXTURE, 0, { centered: true, fog: false, depthWrite: false, emissive: true, alphaTest: 0.02 })
        .setTint(0xdfeef5) // river foam, not sawdust
        .setPosition(x, y)
        .setElevation(WATER_Y) // thrown up FROM the surface the rock just punched through
        .setDisplaySize(0.12, 0.12);
      this.host.scene.tweens.add({
        targets: drop,
        x: x + Math.cos(ang) * reach,
        y: y + Math.sin(ang) * reach * 0.5, // the ground plane is foreshortened
        elevation: WATER_Y + (big ? 0.34 : 0.2),
        alpha: 0,
        duration: 340 + Math.random() * 180,
        ease: 'Quad.easeOut',
        onComplete: () => drop.destroy(),
      });
    }
  }
}
