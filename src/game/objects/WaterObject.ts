import * as Engine from '@/game/engine';

import { getSoundManager } from '@/game/audio/SoundManager';
import { BRIDGE_GRAVETOS_REQUIRED, SCENE_DEPTHS } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';

import { FX_PUFF_TEXTURE, WATER_DEPTH_TILES, world3d, type Box3D } from '@/game/render3d/World3D';

import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { WorldProp } from './WorldProp';
import { WaterBridge, PLANK_ROWS, SPLASH_TINT, type DeckPart } from './WaterBridge';
import { WaterFord, BED_Y, WATER_Y } from './WaterFord';

// A river tile. It blocks like lava until the hero builds a bridge over it by depositing two
// wood sticks ("gravetos"). The river runs in a sunken channel (see WATER_DEPTH_TILES), and
// the bridge is REAL 3D carpentry spanning it: plank boxes with actual thickness riding on
// two stringers, on four legs standing down in the riverbed — the water keeps flowing under
// the finished deck. A buildable spot previews the whole structure as a ghost; each deposited
// graveto slams its share of the parts down from above (hammer beats, sawdust, a splash for
// the legs). Collision is resolved at runtime by GameScene (via `blocking`), like LavaObject.
//
// A ÁGUA em si não é deste objeto: World3D assa a superfície do rio com o material do lago (a
// mesma água, a mesma espuma, o mesmo espelho). Este objeto é o dono do TILE — colisão, ponte,
// vau, balde — e, quando a comporta o esvazia, pede ao World3D que tire a superfície dele.

const PLANKS_PER_GRAVETO = Math.max(1, Math.floor(PLANK_ROWS / BRIDGE_GRAVETOS_REQUIRED));

const PART_STAGGER_MS = 105; // gap between successive parts nailed in one deposit
// First deposit builds the frame (legs + stringers) before its boards; the boards wait this long.
const FRAME_BEAT_MS = 300;

export class WaterObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;

  public readonly scene: Engine.Scene;
  public readonly pips: Engine.GameObjects.Container;
  private readonly pipDots: Engine.GameObjects.Arc[] = [];
  public planks: DeckPart[] = [];
  public frame: DeckPart[] = []; // 4 legs + 2 stringers, slammed in by the first deposit
  public deposited = 0;
  public forded = false; // stones dropped in the river — walkable, and they never burn
  public drained = false; // a floodgate opened upstream — the channel emptied, bed walkable
  // A deck mid-collapse: burn() lit it and the 950ms reset hasn't run yet. During that window
  // `deposited` still reads as a standing bridge, so without this flag a multi-tile bridge
  // double-burns — tile B's spread re-ignites tile A, stacking a SECOND reset that destroys
  // already-destroyed boxes and orphans the rebuilt ghost deck. TallGrass and DryBush refuse
  // re-ignition through their state enums; this is the bridge's equivalent.
  public burning = false;
  public fordParts: Array<{ box: Box3D; ox: number; oy: number; rest: number }> = [];
  public fordFoam: Billboard3D[] = []; // the current tearing white around them
  public hintOn = false;
  public dead = false;
  // Only tiles marked with a `bridgeSpot` prop can be bridged; plain river tiles just block.
  public readonly buildable: boolean;
  /** A ponte em obra e pronta (ver WaterBridge). */
  private readonly bridge = new WaterBridge(this);
  /** O vau de pedras (ver WaterFord). */
  private readonly ford = new WaterFord(this);
  /** Quem quer saber quando a ponte fica pronta (a cena acende um clarão manso). */
  public set onBuilt(fn: (() => void) | undefined) { this.bridge.onBuilt = fn; }
  public get onBuilt(): (() => void) | undefined { return this.bridge.onBuilt; }

  public constructor(scene: Engine.Scene, worldX: number, worldY: number, buildable: boolean) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.buildable = buildable;

    // A buildable spot shows its ghost preview from the start.
    if (buildable) this.bridge.ensureDeck();

    // Build-progress pips ("gravetos needed"), floated above the tile only while the hero is beside it.
    this.pips = scene.add.container(0, 0).setDepth(SCENE_DEPTHS.toast).setVisible(false);
    for (let i = 0; i < BRIDGE_GRAVETOS_REQUIRED; i++) {
      const dot = scene.add.circle(0, 0, 2, 0x3a2a1a).setStrokeStyle(1, 0x1a1008);
      this.pipDots.push(dot);
      this.pips.add(dot);
    }
  }

  public get isBridge(): boolean {
    return this.deposited >= BRIDGE_GRAVETOS_REQUIRED;
  }

  /**
   * A stone ford: one rock dropped in the river, and you can step across it.
   *
   * It is the plank bridge's OPPOSITE, and that is the whole reason it exists. Both make the
   * tile walkable; only the wooden one is FUEL. A deck carries fire across the water (and is
   * eaten doing it — see burn()); a ford never will. So a crossing stops being a chore with one
   * right answer and becomes a question: do you want a floor, or do you want a fuse?
   */
  public get isFord(): boolean {
    return this.forded;
  }

  /** True once a floodgate drained this tile: the bed is exposed and walkable, and it is a firebreak. */
  public get isDrained(): boolean {
    return this.drained;
  }

  /** Water blocks the hero; a finished bridge, a stone ford, or a drained bed is walkable. */
  public get blocking(): boolean {
    return !this.isBridge && !this.forded && !this.drained;
  }

  /** Whether anything can be laid here at all (a `bridgeSpot` marker was placed on this tile). */
  public get canBuild(): boolean {
    return this.buildable && !this.isBridge && !this.forded && !this.drained;
  }

  public get progress(): number {
    return this.deposited;
  }

  /** Deposit one graveto. Returns true if this deposit completed the bridge. No-op off a spot. */
  public deposit(): boolean {
    if (!this.buildable || this.isBridge) return false;
    const laidBefore = this.deposited * PLANKS_PER_GRAVETO;
    const firstDeposit = this.deposited === 0;
    this.deposited += 1;
    const laidAfter = this.isBridge ? PLANK_ROWS : this.deposited * PLANKS_PER_GRAVETO;
    getSoundManager().work.playBridgePlank(); // the "graveto set onto the frame" cue

    // The first graveto raises the FRAME (legs splash down into the river, beams settle on
    // them), then its boards; later deposits just nail more boards onto the waiting frame.
    if (firstDeposit) this.bridge.slamFrame();
    const boardDelay = firstDeposit ? FRAME_BEAT_MS : 0;
    for (let k = 0; laidBefore + k < laidAfter && laidBefore + k < PLANK_ROWS; k++) {
      const index = laidBefore + k;
      this.scene.time.delayedCall(boardDelay + k * PART_STAGGER_MS, () => this.bridge.dropPlank(index));
    }
    return this.isBridge;
  }

  /**
   * A floodgate opened upstream: the water drains out of this tile and the bed is left bare. The
   * tile becomes permanently walkable — a new path — and, being dry ground now, a FIREBREAK (burn()
   * already refuses anything that is not a standing bridge). One-way, like the ford. Returns true
   * only if standing water actually drained here (a bridged/forded/already-drained tile is a no-op).
   *
   * `delayMs` is this tile's beat in the emptying WAVE (openFloodgate passes BFS-depth × beat):
   * the state flips NOW — the flood-fill and collision must not care about theatrics — but the
   * water is SEEN flowing out through the gate, tile after tile. The first cut faded every tile
   * at once, silently: players read that as the water glitching away ("a agua sumiu do nada"),
   * because nothing said drain. Motion order is what says it.
   */
  public drain(delayMs = 0): boolean {
    if (this.drained || this.isBridge || this.forded) return false;
    this.drained = true;
    this.pips.setVisible(false);
    if (delayMs <= 0) this.playDrainFx();
    else this.scene.time.delayedCall(delayMs, () => this.playDrainFx());
    return true;
  }

  // The tile visibly EMPTIES: the surface leaves the baked river mesh on this tile's beat of the
  // wave, a ring of foam gasps out with it, and each tile gurgles as its turn comes.
  private playDrainFx(): void {
    if (this.dead) return;
    // The ghost deck preview is gone for good — destroy it so render() stops re-showing it.
    for (const part of [...this.frame, ...this.planks]) {
      this.scene.tweens.killTweensOf(part.box);
      part.box.destroy();
    }
    this.planks = [];
    this.frame = [];
    getSoundManager().nature.playSplash();
    world3d().terrain.drainRiverSurface(this.worldX, this.worldY);
    // The last of the current tearing white as the tile empties — the ford's foam language.
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + 0.7;
      const foam = world3d()
        .objects.addBillboard(FX_PUFF_TEXTURE, 0, { flat: true, fog: false, depthWrite: false, additive: true })
        .setTint(SPLASH_TINT)
        .setPosition(this.worldX + Math.cos(ang) * 0.3, this.worldY + Math.sin(ang) * 0.26)
        .setElevation(WATER_Y + 0.02)
        .setDisplaySize(0.4, 0.34)
        .setAlpha(0.85);
      this.scene.tweens.add({
        targets: foam,
        alpha: 0,
        elevation: BED_Y + 0.02,
        duration: 620,
        ease: 'Quad.easeIn',
        onComplete: () => foam.destroy(),
      });
    }
  }

  /**
   * The bridge is WOOD, so fire spreads across it — and eats it. It carries the flame to
   * whatever is on the far bank, chars, and collapses into the river: the tile blocks again
   * and the spot goes back to buildable. That is deliberate, not a punishment: it means a
   * bridge can be laid as a FUSE rather than as a floor, and the player has to decide which
   * of the two they want it to be, because it cannot be both.
   *
   * Returns true only if there was a standing bridge here to burn (so fire does not chain
   * through open water).
   */
  public burn(): boolean {
    // A stone ford is not fuel. This single line is what makes the pickaxe a real choice:
    // cross in wood and the fire can follow you; cross in stone and it cannot.
    if (this.forded) return false;
    if (!this.isBridge || this.dead || this.burning) return false;
    this.burning = true;

    const parts = [...this.frame, ...this.planks];
    for (const part of parts) {
      this.scene.tweens.killTweensOf(part.box);
      // The deck burns through and drops into the channel: each board sinks below the water
      // line and fades out, a beat apart, so the collapse reads plank by plank.
      this.scene.tweens.add({
        targets: part.box,
        elevation: part.restElev - WATER_DEPTH_TILES,
        alpha: 0,
        duration: 900,
        delay: Engine.Math.Between(0, 260),
        ease: 'Quad.easeIn',
      });
    }

    // Reset the carpentry: the deck parts are gone, so the next build must lay them again.
    this.scene.time.delayedCall(950, () => {
      if (this.dead) return;
      this.burning = false; // the collapse is over — this tile can be bridged (and burned) again
      for (const part of parts) part.box.destroy();
      this.planks = [];
      this.frame = [];
      this.deposited = 0;
      if (this.buildable) this.bridge.ensureDeck(); // the ghost preview comes back
    });

    return true;
  }

  // ── carpentry ─────────────────────────────────────────────────────────────

  public render(tileSize: number, camera: WorldCamera): void {
    // The deck is real world geometry; only the progress pips still live on the 2D overlay.
    if (this.planks.length) this.bridge.updateGhosts();

    if (!this.buildable || this.isBridge) {
      this.pips.setVisible(false);
      return;
    }

    // Pips float above only while the hero is beside the spot (or a build is underway).
    const near = this.deposited > 0 || this.hintOn;
    this.pips.setVisible(near);
    if (near) {
      const s = camera.tileToScreen(this.worldX, this.worldY, tileSize);
      const bob = Math.sin(this.scene.time.now * 0.006) * (tileSize * 0.06);
      this.pips.setPosition(s.x, s.y - tileSize * 0.62 + bob);
      const gap = tileSize * 0.26;
      const r = Math.max(2, tileSize * 0.09);
      this.pipDots.forEach((dot, i) => {
        dot.setPosition((i - (BRIDGE_GRAVETOS_REQUIRED - 1) / 2) * gap, 0);
        dot.setRadius(r);
        dot.setFillStyle(i < this.deposited ? 0xffcf8a : 0x3a2a1a, 1);
      });
    }
  }

  public destroy(): void {
    this.dead = true;
    for (const part of [...this.planks, ...this.frame]) {
      this.scene.tweens.killTweensOf(part.box);
      part.box.destroy();
    }
    this.planks = [];
    this.frame = [];
    for (const part of this.fordParts) {
      this.scene.tweens.killTweensOf(part.box);
      part.box.destroy();
    }
    this.fordParts = [];
    for (const foam of this.fordFoam) {
      this.scene.tweens.killTweensOf(foam);
      foam.destroy();
    }
    this.fordFoam = [];
    this.pips.destroy();
  }

  /** (ver WaterBridge.buildBridgeNow) */
  public buildBridgeNow(...args: Parameters<WaterBridge['buildBridgeNow']>): ReturnType<WaterBridge['buildBridgeNow']> {
    return this.bridge.buildBridgeNow(...args);
  }

  /** (ver WaterBridge.setBuildHint) */
  public setBuildHint(...args: Parameters<WaterBridge['setBuildHint']>): ReturnType<WaterBridge['setBuildHint']> {
    return this.bridge.setBuildHint(...args);
  }

  /** (ver WaterFord.placeStone) */
  public placeStone(...args: Parameters<WaterFord['placeStone']>): ReturnType<WaterFord['placeStone']> {
    return this.ford.placeStone(...args);
  }
}
