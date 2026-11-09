// A SOMBRA DE UM SÓLIDO DIANTE DE UMA CHAMA: a pose da silhueta (comprimento, rumo, alfa) e o corte onde ela cairia
// dentro do canal do rio, da lava ou do mar.

import { RELIEF_HEIGHT, reliefLevelAt } from '@/game/world/relief';
import { castTransformInto, WIDTH_FACTOR as CAST_WIDTH_FACTOR } from '../CastShadow3D';
import { frameFootPad, frameUvWindow } from '../textures3d';
import { isMassFrame, tileKey } from '../terrainGeometry';
import type { SolidTileEntry } from './TerrainData';
import type { World3D } from '../World3D';
import { CAST_POOL_MAX, MIN_CAST_LEN } from './worldDefs';

/**
 * How far from the camera target a static tile may be and still spend a pool slot.
 *
 * Without this the pool is spent in FIRE order, and a fire the player cannot see is served
 * first: measured with the torch lit in the home clearing, 13 of 42 slots (31%) were drawing
 * silhouettes around the lava field ~35 tiles away, off screen, while trees at the hero's
 * feet went without. The camera frames ~30x17 tiles; 18 covers it with margin for a shadow
 * whose caster is just off screen but whose silhouette reaches into it.
 */
const CAST_CAMERA_REACH = 18;

/** O que SolidCastEmitter usa de World3D. */
export type SolidCastEmitterHost = Pick<World3D, 'camTarget' | 'casts' | 'moonDimmed' | 'params' | 'probe' | 'tiles'>;

export class SolidCastEmitter {
  public constructor(private readonly host: SolidCastEmitterHost) {}

  /**
   * Stop a silhouette at the water's edge (2b): march the heading in half-tile steps and
   * clamp the length just short of the first SUNKEN tile (river/lava/sea bed) it would
   * cross — a ground-level quad over a sunken channel floats in mid-air otherwise. Starts
   * past the caster's own tile, so standing on a bridge (or wading with the boots) never
   * self-clamps. The same goes for the edge of a higher ground: a shadow lying on a plateau ends
   * where the plateau does. Returns the (possibly shorter) length.
   */
  public clampCastAtSunken(x: number, z: number, rotY: number, length: number): number {
    const dirX = -Math.sin(rotY);
    const dirZ = -Math.cos(rotY);
    const own = reliefLevelAt(Math.round(x), Math.round(z));
    for (let s = 0.6; s < length; s += 0.5) {
      const tx = Math.round(x + dirX * s);
      const tz = Math.round(z + dirZ * s);
      if (this.host.tiles.sunkenTiles.has(tileKey(tx, tz)) || reliefLevelAt(tx, tz) < own) return Math.max(0.3, s - 0.25);
    }
    return length;
  }

  /** One static tile's fire silhouette into the field — plus its moon handoff (2d). */
  public emitSolidCast(
    tile: SolidTileEntry,
    radius: number,
    alpha: number,
    heightScale: number,
    moonAlpha: number,
  ): void {
    // A MASSA também não tem silhueta de fogo, pela mesma razão e para não ter DUAS sombras: a
    // barra assada já é a sombra dela, e um leque de dedos por tile saindo de cada tocha de parede
    // seria o mesmo defeito de volta, só que radial. Um muro perto da chama continua reagindo — as
    // faces dele acendem —, e o que ele projeta é a barra.
    if (isMassFrame(tile.frame)) return;
    if (this.host.tiles.solidCastField.pendingCount >= CAST_POOL_MAX) return;
    // Spend the pool on what the player can SEE (see CAST_CAMERA_REACH): candidates arrive
    // in fire order, so without this a fire off screen is served before the hero's own.
    const cdx = tile.x - this.host.camTarget.x;
    const cdz = tile.z - this.host.camTarget.z;
    if (cdx * cdx + cdz * cdz > CAST_CAMERA_REACH * CAST_CAMERA_REACH) return;
    if (!this.host.probe.nearestLitFireInto(tile.x, tile.z, tile, this.host.casts.nearestScratch)) return;
    const n = this.host.casts.nearestScratch;
    const dx = tile.x - n.worldX;
    const dz = tile.z - n.worldY;
    if (dx * dx + dz * dz > radius * radius) return;
    if (!castTransformInto(
      this.host.casts.fireCastScratch, tile.x, tile.z, 1, n.worldX, n.worldY, n.level, radius, alpha, heightScale,
    )) return;
    const p = this.host.casts.fireCastScratch;

    const rotY = p.rotY;

    // The silhouette stops at the water's edge (2b) — but the clamp may never REMOVE a
    // shadow, only shorten one.
    //
    // Two wrong versions preceded this. Clamping to the bank could cut a cast to 0.35
    // tiles: a smudge under the trunk that reads as "this tree has no shadow". Dropping
    // the cast instead was worse — a whole row of trees along the bank, lit by the fire,
    // with no fire shadow at all (reported). So a clamp that would leave less than
    // MIN_CAST_LEN is abandoned and the full silhouette is drawn: a shadow overhanging
    // the channel is the lesser wrong, which is the same call the actor path makes and
    // for the same reason. Trees far enough back still stop cleanly at the bank, which is
    // the case the clamp was built for.
    let length = p.length;
    let a = p.alpha;
    if (this.host.params.castWaterClamp > 0) {
      const clamped = this.clampCastAtSunken(tile.x, tile.z, rotY, length);
      if (clamped < length && clamped >= MIN_CAST_LEN) {
        length = clamped;
        a *= 0.6;
      }
    }

    this.host.tiles.solidCastField.add(
      tile.x, tile.z, frameUvWindow('forest-tileset', tile.frame),
      CAST_WIDTH_FACTOR, length, rotY, a,
      frameFootPad('forest-tileset', tile.frame),
      undefined,
      reliefLevelAt(tile.x, tile.z) * RELIEF_HEIGHT,
    );

    // The statics' fire→moon handoff (2d): inside a lit pool the tile's baked moon
    // silhouette lets go as the fire cast takes over — an actor's handoffCast, applied to
    // the one instance — so a tree and an NPC on the same pool edge behave the same,
    // instead of the tree wearing fire AND moon shadows at once.
    //
    // The fire's darkness DISPLACES the moon's; it never merely scales it down. The first
    // version dimmed by the ratio a/moonAlpha, which let a faint fire cast (0.07) delete a
    // third of a 0.22 moon shadow and pay back only 0.07 — pointing somewhere else. Trees
    // at a pool's edge came out with two faint smudges instead of one readable shadow, and
    // the ones the water clamp had already shortened looked like they had NO shadow (user
    // report, and exactly what the numbers showed). Subtracting instead keeps the invariant
    // the actors' handoff gets from its `max(fire, moon)`: a caster's total shadow presence
    // never drops below what moonlight alone would have given it.
    if (this.host.params.moonHandoff > 0 && moonAlpha > 0.02 && tile.moonSlot !== undefined) {
      const left = Math.max(0, moonAlpha - a);
      if (left < moonAlpha - 0.005) {
        this.host.tiles.moonCastField.setInstanceAlpha(tile.moonSlot, left);
        this.host.moonDimmed.push(tile);
      }
    }
  }
}
