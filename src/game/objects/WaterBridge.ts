// A PONTE QUE SE CONSTRÓI NA ÁGUA: a armação que bate, as tábuas que caem uma a uma, as peças que faltam desenhadas
// como fantasma, e a ponte pronta. Que tile vira ponte, e o que ele aceita, é do WaterObject.

import { getSoundManager } from '@/game/audio/SoundManager';
import { BRIDGE_GRAVETOS_REQUIRED } from '@/game/constants';
import { getWoodTexture } from '@/game/render3d/woodTexture';
import { FX_PUFF_TEXTURE, WATER_DEPTH_TILES, world3d, type Box3D } from '@/game/render3d/World3D';
import { getBridgeSpots, getWaterTiles } from '@/game/world/WorldData';
import type { WaterObject } from './WaterObject';

// The deck is milled into this many boards laid ACROSS the walking direction. The gravetos
// share them evenly — two gravetos, four boards, two boards per graveto.
export const PLANK_ROWS = 4;
const PART_DROP_MS = 200; // per-part fall + settle
const DROP_FROM_TILES = 0.5; // parts fall in from this high above their rest position
// The deck's wood is pixel art painted with the game's own wood-sprite palette —
// see woodTexture.ts. Boards alternate the two plank patterns (staggered butt-joint
// seams, like bridge.png); the frame below uses the darker stringer/post grain.
const SAWDUST_TINT = 0xd9b483;
export const SPLASH_TINT = 0x9fb4dd; // a leg landing in the river kicks water, not sawdust
// Deck geometry, all in tiles. The deck rides just above the banks; everything stays
// inside its own tile (the fundamental sprite rule applies to geometry too).
const PLANK_H = 0.04;
const PLANK_ELEV = 0.028; // centre height → top face ~0.048, a shallow step over the ground
const PLANK_W = 0.98; // long axis (across the walk direction)
const PLANK_D = 0.21; // short axis (four boards + seams fill the tile)
const STRINGER_H = 0.055;
const STRINGER_W = 0.075;
const STRINGER_ELEV = PLANK_ELEV - PLANK_H / 2 - STRINGER_H / 2;
const STRINGER_OFF = 0.3; // the two beams sit this far either side of centre
const POST_SIZE = 0.085;
const POST_H = WATER_DEPTH_TILES + STRINGER_ELEV - STRINGER_H / 2; // riverbed up to the beams
const POST_ELEV = -WATER_DEPTH_TILES + POST_H / 2;
const POST_OFF_ALONG = 0.35; // near the tile's entry/exit edges (across = under the stringers)
// Ghost preview (the "you can build here" indicator): the whole structure breathes faintly;
// the first board stays much more solid — a sample plank on the bank that reads at a glance.
const SAMPLE_PLANK_ALPHA = 0.62;
const GHOST_BASE = 0.16;
const GHOST_WAVE = 0.06;
const GHOST_HINT_BOOST = 1.7; // ghost brightens while the hero stands beside the spot
export interface DeckPart {
  box: Box3D;
  restElev: number;
  laid: boolean;
  animating: boolean;
}

/** O que WaterBridge usa de WaterObject. */
export type WaterBridgeHost = Pick<WaterObject,
  'buildable' | 'burning' | 'dead' | 'deposited' | 'drained' | 'forded' | 'frame' | 'hintOn' | 'isBridge'
  | 'pips' | 'planks' | 'scene' | 'worldX' | 'worldY'
>;

export class WaterBridge {
  // Fired once when the bridge finishes building (GameScene uses it for a scene-level flash).
  public onBuilt?: () => void;

  public constructor(private readonly host: WaterBridgeHost) {}

  /** Finish the bridge in one go — a tree felled across the river ("TIMBER!") drops for free.
   * Works on any river tile, not just buildable spots (that restriction is only for the manual
   * graveto build via deposit()). The trunk slamming down IS the animation, so the whole deck
   * snaps straight in rather than running the carpentry build. */
  public buildBridgeNow(): void {
    // Ford/drained tiles are no longer water to span, and a deck mid-collapse (burning) still
    // owns its parts — snapping a fresh deck into any of those would stack two structures on
    // one tile. tryTimberBridge filters to blocking tiles, but the tree FALLS for ~0.5s and
    // the world can change under it; this is where that race is caught.
    if (this.host.isBridge || this.host.forded || this.host.drained || this.host.burning) return;
    this.host.deposited = BRIDGE_GRAVETOS_REQUIRED;
    this.ensureDeck();
    for (const part of [...this.host.frame, ...this.host.planks]) {
      part.laid = true;
      part.animating = false;
      part.box.setElevation(part.restElev).setAlpha(1);
    }
    this.host.pips.setVisible(false);
  }

  /**
   * Lazily build the deck parts (once) as ghosts. The deck orients itself to the river:
   * boards lie ACROSS the walking direction (perpendicular to the crossing), stringers run
   * along it — inferred from where the neighbouring river tiles are.
   */
  public ensureDeck(): void {
    if (this.host.planks.length) return;

    // River neighbours E/W → the crossing runs N-S (default layout). Neighbours N/S only →
    // the river runs N-S, the crossing runs E-W, so the whole layout rotates 90°.
    const wet = new Set<string>(
      [...getWaterTiles(), ...getBridgeSpots()].map((p) => `${p.worldX},${p.worldY}`),
    );
    const beside = wet.has(`${this.host.worldX - 1},${this.host.worldY}`) || wet.has(`${this.host.worldX + 1},${this.host.worldY}`);
    const above = wet.has(`${this.host.worldX},${this.host.worldY - 1}`) || wet.has(`${this.host.worldX},${this.host.worldY + 1}`);
    const rotated = above && !beside;

    const w3 = world3d();
    const px = (along: number, across: number): [number, number] =>
      (rotated ? [this.host.worldX + along, this.host.worldY + across] : [this.host.worldX + across, this.host.worldY + along]);

    for (let i = 0; i < PLANK_ROWS; i++) {
      const along = -0.5 + (i + 0.5) / PLANK_ROWS;
      const grain = getWoodTexture(i % 2 === 0 ? 'plankA' : 'plankB', rotated);
      const box = (rotated
        ? w3.objects.addBox(PLANK_D, PLANK_H, PLANK_W, grain)
        : w3.objects.addBox(PLANK_W, PLANK_H, PLANK_D, grain))
        .setPosition(...px(along, 0))
        .setElevation(PLANK_ELEV);
      this.host.planks.push({ box, restElev: PLANK_ELEV, laid: false, animating: false });
    }

    // Stringers run ALONG the crossing (perpendicular to the boards), so their grain
    // transposes in the opposite case from the planks'.
    for (const side of [-STRINGER_OFF, STRINGER_OFF]) {
      const beam = (rotated
        ? w3.objects.addBox(1.0, STRINGER_H, STRINGER_W, getWoodTexture('stringer', false))
        : w3.objects.addBox(STRINGER_W, STRINGER_H, 1.0, getWoodTexture('stringer', true)))
        .setPosition(...px(0, side))
        .setElevation(STRINGER_ELEV);
      this.host.frame.push({ box: beam, restElev: STRINGER_ELEV, laid: false, animating: false });
      for (const end of [-POST_OFF_ALONG, POST_OFF_ALONG]) {
        const post = w3.objects.addBox(POST_SIZE, POST_H, POST_SIZE, getWoodTexture('post'))
          .setPosition(...px(end, side))
          .setElevation(POST_ELEV);
        this.host.frame.push({ box: post, restElev: POST_ELEV, laid: false, animating: false });
      }
    }
  }

  /** First deposit: the four legs splash down into the river, then the beams settle on them. */
  public slamFrame(): void {
    this.ensureDeck();
    this.host.frame.forEach((part, i) => {
      const isPost = part.restElev === POST_ELEV;
      this.host.scene.time.delayedCall(i * 45, () => {
        this.dropPart(part, () => {
          if (isPost) {
            // A leg landing in the water kicks up a splash, not sawdust.
            this.spawnBurst(part.box.x, part.box.y, -WATER_DEPTH_TILES + 0.08, SPLASH_TINT);
          }
        });
      });
    });
  }

  public dropPlank(index: number): void {
    if (this.host.dead) return;
    const part = this.host.planks[index];
    if (!part || part.laid) return;
    this.dropPart(part, () => {
      getSoundManager().work.playHammer();
      this.spawnBurst(part.box.x, part.box.y, PLANK_ELEV + 0.06, SAWDUST_TINT);
      // The final board of the whole crossing finishes the build.
      if (this.host.isBridge && index === PLANK_ROWS - 1) this.finishBridge();
    });
  }

  // Drop one part in from above: falls to its rest height and settles solid.
  private dropPart(part: DeckPart, onLanded?: () => void): void {
    if (this.host.dead || part.laid) return;
    part.laid = true;
    part.animating = true;
    part.box.setAlpha(0.96).setElevation(part.restElev + DROP_FROM_TILES);
    this.host.scene.tweens.add({
      targets: part.box,
      elevation: part.restElev,
      duration: PART_DROP_MS,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (this.host.dead) return;
        part.animating = false;
        part.box.setAlpha(1);
        onLanded?.();
      },
    });
  }

  private finishBridge(): void {
    if (this.host.dead) return;
    // The last hammer blow lands with a physical thump; GameScene adds its flash via onBuilt.
    world3d().cam.shake(90, 0.006);
    getSoundManager().work.playBridgeBuilt();
    this.host.pips.setVisible(false);
    this.onBuilt?.();
  }

  // A short burst of motes where a part lands: tan sawdust for boards, cool spray for legs.
  private spawnBurst(x: number, y: number, elev: number, tint: number): void {
    for (let i = 0; i < 5; i++) {
      const puff = world3d()
        .objects.addBillboard(FX_PUFF_TEXTURE, 0, { centered: true, fog: false, depthWrite: false, emissive: true, alphaTest: 0.02 })
        .setTint(tint)
        .setPosition(x + (Math.random() - 0.5) * 0.5, y + (Math.random() - 0.5) * 0.2)
        .setElevation(elev)
        .setDisplaySize(0.15, 0.15)
        .setAlpha(0.85);
      this.host.scene.tweens.add({
        targets: puff,
        elevation: elev + 0.2 + Math.random() * 0.25,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: 280 + i * 30,
        ease: 'Quad.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  }

  /** GameScene flags this each frame: true when the hero stands next to a buildable un-bridged tile. */
  public setBuildHint(on: boolean): void {
    this.host.hintOn = on && this.host.buildable && !this.host.isBridge && !this.host.drained;
  }

  // Un-laid parts breathe as a faint ghost preview (brighter while the hero stands beside
  // the spot); parts mid-drop own their own alpha/height until they land.
  public updateGhosts(): void {
    const boost = this.host.hintOn ? GHOST_HINT_BOOST : 1;
    const pulse = (GHOST_BASE + GHOST_WAVE * Math.sin(this.host.scene.time.now * 0.005)) * boost;
    const setGhost = (part: DeckPart, alpha: number): void => {
      if (part.animating) return;
      part.box.setAlpha(part.laid ? 1 : Math.min(1, alpha));
    };
    this.host.planks.forEach((part, i) => setGhost(part, i === 0 ? SAMPLE_PLANK_ALPHA : pulse));
    for (const part of this.host.frame) setGhost(part, pulse * 0.8);
  }
}
