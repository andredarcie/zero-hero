import Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import { getStoneTexture } from '@/game/render3d/stoneTexture';
import { isReducedMotion } from '@/game/runtime/accessibility';
import { FX_PUFF_TEXTURE, LAVA_DEPTH_TILES, world3d, type Box3D, type FireLight3D } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

// Um tile de lava: quem desenha a superfície e a margem é o terreno (World3D.buildLavaSurface), como na água.
// Este objeto é dono do que é do tile: a colisão, a luz e a pedra que afunda. Em LAVA a luz é fogo: um graveto
// apagado acende aqui.
const LIGHT_SCALE = 0.2;
/**
 * A POÇA É A MEDIDA (pedido do autor: o lago de lava estourava a tela num amarelo chapado). Cada tile acende a
 * sua luz, e no lago grande dezenas delas somavam até o branco. Numa poça de até `POOL_TILES` tiles cada um
 * brilha inteiro; acima disso o brilho de cada tile cai com a raiz do tamanho, e o lago todo brilha como
 * algumas poças pequenas espalhadas — quente, mas da cor da lava.
 */
const POOL_TILES = 4;

/** A escala de luz de cada tile de lava, pelo tamanho da poça (4 vizinhos) em que ele está. */
export const lavaLightScales = (tiles: readonly { worldX: number; worldY: number }[]): number[] => {
  const key = (x: number, y: number): string => `${x},${y}`;
  const index = new Map(tiles.map((t, i) => [key(t.worldX, t.worldY), i]));
  const size = new Array<number>(tiles.length).fill(0);
  for (let i = 0; i < tiles.length; i += 1) {
    if (size[i]) continue;
    const pool = [i];
    const seen = new Set([i]);
    for (let q = 0; q < pool.length; q += 1) {
      const t = tiles[pool[q]];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = index.get(key(t.worldX + dx, t.worldY + dy));
        if (j !== undefined && !seen.has(j)) { seen.add(j); pool.push(j); }
      }
    }
    for (const j of pool) size[j] = pool.length;
  }
  return size.map((n) => LIGHT_SCALE * Math.sqrt(Math.min(1, POOL_TILES / n)));
};

// ── The sinking stone ──────────────────────────────────────────────────────────
// A stone dropped into the melt does NOT snap the tile into cold rock. The LAVA STAYS — it keeps
// glowing and breathing — and the stone falls in, then SINKS slowly until only its crown breaks
// the surface, capping just the CENTRE of the tile. Molten rock still rims it on every side; the
// stone is the cool patch you step on, an island in the flow. That is what reads as "hop across
// here" while the tile is plainly still lava.
// The molten surface sits recessed in the basin (LAVA_DEPTH_TILES below ground, just above the
// bed) — the same relation the river's water has to its channel, only shallower.
const SURFACE_Y = -LAVA_DEPTH_TILES + 0.02;
const CROWN_H = 0.5; // every stone is this tall; most of it ends up UNDER the surface, drowned
const CROWN_DROP_FROM = 0.7; // it falls in from this far above the surface
const SINK_MS = 1600; // "afundando aos poucos": the slow swallow
const PHASE1_MS = 240; // the quick plunge to the surface, before the slow sink
const PART_STAGGER_MS = 90; // gap between the slab and each boulder landing
// A slab you step on + two boulders wedged around it, tops at DIFFERENT heights so the crown reads
// as lumpy rock rather than a flat paving square — and kept SMALL and central so molten lava still
// shows around all four edges. `top` is each crown's height above the (recessed) surface; tuned so
// the crests rise back to ~ground level, giving the hero a floor to stand on while the rest of the
// stone stays drowned in the melt below. Offsets are asymmetric (a stone that fell where it fell).
const CROWN_PARTS = [
  { kind: 'slab', w: 0.46, d: 0.4, top: LAVA_DEPTH_TILES - 0.01, ox: 0.0, oy: 0.02 },
  { kind: 'boulder', w: 0.24, d: 0.22, top: LAVA_DEPTH_TILES + 0.08, ox: -0.18, oy: -0.13 },
  { kind: 'boulder', w: 0.2, d: 0.18, top: LAVA_DEPTH_TILES + 0.04, ox: 0.19, oy: 0.14 },
] as const;

export class LavaObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private fireLight?: FireLight3D;
  // A stone dropped into the lava sinks to a central crown you step on — the lava twin of the stone
  // ford. The molten tile stays molten AROUND it; the stone just caps the middle. Three phases:
  //   molten  — untouched lava (blocks; a stone can be dropped here)
  //   cooling — a stone is sinking in; still BLOCKS (you cannot cross a half-placed stone)
  //   solid   — the stone has fully settled; now walkable. One-way. See GameScene.solidifyLava.
  private phase: 'molten' | 'cooling' | 'solid' = 'molten';
  private crownParts: Box3D[] = [];

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number, lightScale = LIGHT_SCALE) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    const fireLight = world3d().addFireLight(worldX, worldY, true);
    fireLight.setIntensityScale(lightScale);
    this.fireLight = fireLight;
  }

  /** A stone is sinking in right now — capped, but NOT yet walkable (you cannot cross it mid-sink). */
  public get cooling(): boolean {
    return this.phase === 'cooling';
  }

  /** True once the dropped stone has FULLY settled: now walkable (a stepping stone in the melt). */
  public get solidified(): boolean {
    return this.phase === 'solid';
  }

  /** Lava viva (ou esfriando) é um corpo; basalto assentado é chão de todo mundo. */
  public get blocking(): boolean {
    return !this.solidified;
  }

  /**
   * Drop a stone into the lava. It plunges to the surface, throws a molten splash, then SINKS
   * slowly until only its crown shows — the melt closing over it — capping just the CENTRE of the
   * tile. The lava is left untouched: it keeps glowing and breathing all around the stone, its
   * heat-light still lit. The tile only becomes WALKABLE once the stone has fully settled (the hero
   * cannot cross a half-sunk stone), so it stays `cooling` through the animation and flips to
   * `solid` at the end. One-way, like the ford.
   */
  public solidify(): boolean {
    if (this.phase !== 'molten') return false;
    this.phase = 'cooling';

    // The lava is NOT crusted or dimmed: its pulse, shimmer and heat-light all keep running. The
    // stone only caps the centre — molten rock still rims the tile on every side.

    // The stone: a slab + two boulders, each a real box dropped in from above. The slab lands
    // first and hardest; the boulders tumble in a beat later. Then they all SINK together, slowly,
    // until only their crowns break the surface.
    const w3 = world3d();
    CROWN_PARTS.forEach((spec, i) => {
      const restElev = SURFACE_Y + spec.top - CROWN_H / 2; // most of the box below the surface
      const surfaceElev = SURFACE_Y + CROWN_H / 2; // the moment it lands, riding on the surface
      const box = w3
        .addBox(spec.w, CROWN_H, spec.d, getStoneTexture(spec.kind))
        .setPosition(this.worldX + spec.ox, this.worldY + spec.oy)
        .setElevation(surfaceElev + CROWN_DROP_FROM);
      this.crownParts.push(box);

      // Phase 1 — the plunge to the surface (staggered so they don't land as one).
      this.scene.tweens.add({
        targets: box,
        elevation: surfaceElev,
        duration: PHASE1_MS,
        delay: i * PART_STAGGER_MS,
        ease: 'Quad.easeIn',
        onComplete: () => {
          if (i === 0) {
            getSoundManager().playRockSmash();
            if (!isReducedMotion()) this.scene.cameras.main.shake(120, 0.004);
            this.spawnLavaSplash();
          }
          // Phase 2 — the slow swallow, until only the crown remains above the melt.
          this.scene.tweens.add({
            targets: box,
            elevation: restElev,
            duration: SINK_MS,
            ease: 'Sine.easeInOut',
          });
        },
      });
    });

    // Only once the LAST stone has finished sinking does the tile become crossable.
    const settleMs = (CROWN_PARTS.length - 1) * PART_STAGGER_MS + PHASE1_MS + SINK_MS;
    this.scene.time.delayedCall(settleMs, () => { this.phase = 'solid'; });

    return true;
  }

  /** A ring of molten spray thrown up where the stone punched through the surface. */
  private spawnLavaSplash(): void {
    for (let i = 0; i < 7; i += 1) {
      const ang = (i / 7) * Math.PI * 2 + Math.random() * 0.6;
      const reach = 0.3 * (0.6 + Math.random() * 0.7);
      const drop = world3d()
        .addBillboard(FX_PUFF_TEXTURE, 0, { centered: true, fog: false, depthWrite: false, emissive: true, alphaTest: 0.02 })
        .setTint(0xff8a34) // molten orange, not river foam
        .setPosition(this.worldX, this.worldY)
        .setElevation(SURFACE_Y + 0.02)
        .setDisplaySize(0.14, 0.14);
      this.scene.tweens.add({
        targets: drop,
        x: this.worldX + Math.cos(ang) * reach,
        y: this.worldY + Math.sin(ang) * reach * 0.5, // the ground plane is foreshortened
        elevation: SURFACE_Y + 0.26 + Math.random() * 0.12,
        alpha: 0,
        duration: 360 + Math.random() * 200,
        ease: 'Quad.easeOut',
        onComplete: () => drop.destroy(),
      });
    }
  }

  public destroy(): void {
    for (const part of this.crownParts) {
      this.scene.tweens.killTweensOf(part);
      part.destroy();
    }
    this.crownParts = [];
    this.fireLight?.destroy();
    this.fireLight = undefined;
  }
}
