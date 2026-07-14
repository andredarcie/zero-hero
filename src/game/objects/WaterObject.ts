import Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import { BRIDGE_GRAVETOS_REQUIRED, SCENE_DEPTHS } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { getWoodTexture } from '@/game/render3d/woodTexture';
import { FX_PUFF_TEXTURE, WATER_DEPTH_TILES, world3d, type Box3D } from '@/game/render3d/World3D';
import { getBridgeSpots, getWaterTiles } from '@/game/world/WorldData';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// 3D water ripple frames (flat quads on the ground plane).
const WATER_3D_FRAMES = ['water-0', 'water-1', 'water-2', 'water-3'] as const;

// A river tile. It blocks like lava until the hero builds a bridge over it by depositing two
// wood sticks ("gravetos"). The river runs in a sunken channel (see WATER_DEPTH_TILES), and
// the bridge is REAL 3D carpentry spanning it: plank boxes with actual thickness riding on
// two stringers, on four legs standing down in the riverbed — the water keeps flowing under
// the finished deck. A buildable spot previews the whole structure as a ghost; each deposited
// graveto slams its share of the parts down from above (hammer beats, sawdust, a splash for
// the legs). Collision is resolved at runtime by GameScene (via `blocking`), like LavaObject.

const RIPPLE_MS = 220; // ms per water animation frame

// The deck is milled into this many boards laid ACROSS the walking direction. The gravetos
// share them evenly — two gravetos, four boards, two boards per graveto.
const PLANK_ROWS = 4;
const PLANKS_PER_GRAVETO = Math.max(1, Math.floor(PLANK_ROWS / BRIDGE_GRAVETOS_REQUIRED));

const PART_DROP_MS = 200; // per-part fall + settle
const PART_STAGGER_MS = 105; // gap between successive parts nailed in one deposit
const DROP_FROM_TILES = 0.5; // parts fall in from this high above their rest position
// First deposit builds the frame (legs + stringers) before its boards; the boards wait this long.
const FRAME_BEAT_MS = 300;

// The deck's wood is pixel art painted with the game's own wood-sprite palette —
// see woodTexture.ts. Boards alternate the two plank patterns (staggered butt-joint
// seams, like bridge.png); the frame below uses the darker stringer/post grain.
const SAWDUST_TINT = 0xd9b483;
const SPLASH_TINT = 0x9fb4dd; // a leg landing in the river kicks water, not sawdust

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

interface DeckPart {
  box: Box3D;
  restElev: number;
  laid: boolean;
  animating: boolean;
}

export class WaterObject {
  public readonly worldX: number;
  public readonly worldY: number;

  // Fired once when the bridge finishes building (GameScene uses it for a scene-level flash).
  public onBuilt?: () => void;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Billboard3D; // the water — a flat 3D quad; keeps flowing under the deck
  private readonly pips: Phaser.GameObjects.Container;
  private readonly pipDots: Phaser.GameObjects.Arc[] = [];
  private planks: DeckPart[] = [];
  private frame: DeckPart[] = []; // 4 legs + 2 stringers, slammed in by the first deposit
  private deposited = 0;
  private hintOn = false;
  private frameIndex = 0;
  private animTimer?: Phaser.Time.TimerEvent;
  private dead = false;
  // Only tiles marked with a `bridgeSpot` prop can be bridged; plain river tiles just block.
  private readonly buildable: boolean;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number, buildable: boolean) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.buildable = buildable;

    // Animated water: cycle the ripple frames (water_0..3). Desynced per tile — a random start
    // frame and a jittered frame time — so a river shimmers unevenly instead of pulsing as one.
    this.frameIndex = Phaser.Math.Between(0, WATER_3D_FRAMES.length - 1);
    this.sprite = world3d()
      // The river runs in a channel BELOW the ground (World3D sinks its bed and walls it
      // with banks): the surface sits just above that bed, so the water reads as recessed.
      .addBillboard(WATER_3D_FRAMES[this.frameIndex], 0, {
        flat: true, flatY: -WATER_DEPTH_TILES + 0.03, worldFx: 'waterGlint',
      })
      .setPosition(worldX, worldY)
      .setDisplaySize(1, 1)
      // Night water is DARK with moonlit glints, not a bright ribbon: the art's daylight
      // blue at the old #9fb4dd read as neon cutting through the night (and its sparkle
      // pixels fed the bloom). Slate-navy keeps the river legible as water while sitting
      // in the same value range as the rest of the nocturnal palette.
      .setTint(0x66779e);
    this.animTimer = scene.time.addEvent({
      delay: RIPPLE_MS + Phaser.Math.Between(-40, 40),
      callback: this.nextFrame,
      callbackScope: this,
      loop: true,
    });

    // A buildable spot shows its ghost preview from the start.
    if (buildable) this.ensureDeck();

    // Build-progress pips ("gravetos needed"), floated above the tile only while the hero is beside it.
    this.pips = scene.add.container(0, 0).setDepth(SCENE_DEPTHS.toast).setVisible(false);
    for (let i = 0; i < BRIDGE_GRAVETOS_REQUIRED; i++) {
      const dot = scene.add.circle(0, 0, 2, 0x3a2a1a).setStrokeStyle(1, 0x1a1008);
      this.pipDots.push(dot);
      this.pips.add(dot);
    }
  }

  private nextFrame(): void {
    this.frameIndex = (this.frameIndex + 1) % WATER_3D_FRAMES.length;
    this.sprite.setTexture(WATER_3D_FRAMES[this.frameIndex]);
  }

  public get isBridge(): boolean {
    return this.deposited >= BRIDGE_GRAVETOS_REQUIRED;
  }

  /** Water blocks the hero and enemies; a finished bridge is walkable. */
  public get blocking(): boolean {
    return !this.isBridge;
  }

  /** Whether a bridge can be built here at all (a `bridgeSpot` marker was placed on this tile). */
  public get canBuild(): boolean {
    return this.buildable && !this.isBridge;
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
    getSoundManager().playBridgePlank(); // the "graveto set onto the frame" cue

    // The first graveto raises the FRAME (legs splash down into the river, beams settle on
    // them), then its boards; later deposits just nail more boards onto the waiting frame.
    if (firstDeposit) this.slamFrame();
    const boardDelay = firstDeposit ? FRAME_BEAT_MS : 0;
    for (let k = 0; laidBefore + k < laidAfter && laidBefore + k < PLANK_ROWS; k++) {
      const index = laidBefore + k;
      this.scene.time.delayedCall(boardDelay + k * PART_STAGGER_MS, () => this.dropPlank(index));
    }
    return this.isBridge;
  }

  /** Finish the bridge in one go — a tree felled across the river ("TIMBER!") drops for free.
   * Works on any river tile, not just buildable spots (that restriction is only for the manual
   * graveto build via deposit()). The trunk slamming down IS the animation, so the whole deck
   * snaps straight in rather than running the carpentry build. */
  public buildBridgeNow(): void {
    if (this.isBridge) return;
    this.deposited = BRIDGE_GRAVETOS_REQUIRED;
    this.ensureDeck();
    for (const part of [...this.frame, ...this.planks]) {
      part.laid = true;
      part.animating = false;
      part.box.setElevation(part.restElev).setAlpha(1);
    }
    this.pips.setVisible(false);
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
    if (!this.isBridge || this.dead) return false;

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
        delay: Phaser.Math.Between(0, 260),
        ease: 'Quad.easeIn',
      });
    }

    // Reset the carpentry: the deck parts are gone, so the next build must lay them again.
    this.scene.time.delayedCall(950, () => {
      if (this.dead) return;
      for (const part of parts) part.box.destroy();
      this.planks = [];
      this.frame = [];
      this.deposited = 0;
      if (this.buildable) this.ensureDeck(); // the ghost preview comes back
    });

    return true;
  }

  // ── carpentry ─────────────────────────────────────────────────────────────

  /**
   * Lazily build the deck parts (once) as ghosts. The deck orients itself to the river:
   * boards lie ACROSS the walking direction (perpendicular to the crossing), stringers run
   * along it — inferred from where the neighbouring river tiles are.
   */
  private ensureDeck(): void {
    if (this.planks.length) return;

    // River neighbours E/W → the crossing runs N-S (default layout). Neighbours N/S only →
    // the river runs N-S, the crossing runs E-W, so the whole layout rotates 90°.
    const wet = new Set<string>(
      [...getWaterTiles(), ...getBridgeSpots()].map((p) => `${p.worldX},${p.worldY}`),
    );
    const beside = wet.has(`${this.worldX - 1},${this.worldY}`) || wet.has(`${this.worldX + 1},${this.worldY}`);
    const above = wet.has(`${this.worldX},${this.worldY - 1}`) || wet.has(`${this.worldX},${this.worldY + 1}`);
    const rotated = above && !beside;

    const w3 = world3d();
    const px = (along: number, across: number): [number, number] =>
      (rotated ? [this.worldX + along, this.worldY + across] : [this.worldX + across, this.worldY + along]);

    for (let i = 0; i < PLANK_ROWS; i++) {
      const along = -0.5 + (i + 0.5) / PLANK_ROWS;
      const grain = getWoodTexture(i % 2 === 0 ? 'plankA' : 'plankB', rotated);
      const box = (rotated
        ? w3.addBox(PLANK_D, PLANK_H, PLANK_W, grain)
        : w3.addBox(PLANK_W, PLANK_H, PLANK_D, grain))
        .setPosition(...px(along, 0))
        .setElevation(PLANK_ELEV);
      this.planks.push({ box, restElev: PLANK_ELEV, laid: false, animating: false });
    }

    // Stringers run ALONG the crossing (perpendicular to the boards), so their grain
    // transposes in the opposite case from the planks'.
    for (const side of [-STRINGER_OFF, STRINGER_OFF]) {
      const beam = (rotated
        ? w3.addBox(1.0, STRINGER_H, STRINGER_W, getWoodTexture('stringer', false))
        : w3.addBox(STRINGER_W, STRINGER_H, 1.0, getWoodTexture('stringer', true)))
        .setPosition(...px(0, side))
        .setElevation(STRINGER_ELEV);
      this.frame.push({ box: beam, restElev: STRINGER_ELEV, laid: false, animating: false });
      for (const end of [-POST_OFF_ALONG, POST_OFF_ALONG]) {
        const post = w3.addBox(POST_SIZE, POST_H, POST_SIZE, getWoodTexture('post'))
          .setPosition(...px(end, side))
          .setElevation(POST_ELEV);
        this.frame.push({ box: post, restElev: POST_ELEV, laid: false, animating: false });
      }
    }
  }

  /** First deposit: the four legs splash down into the river, then the beams settle on them. */
  private slamFrame(): void {
    this.ensureDeck();
    this.frame.forEach((part, i) => {
      const isPost = part.restElev === POST_ELEV;
      this.scene.time.delayedCall(i * 45, () => {
        this.dropPart(part, () => {
          if (isPost) {
            // A leg landing in the water kicks up a splash, not sawdust.
            this.spawnBurst(part.box.x, part.box.y, -WATER_DEPTH_TILES + 0.08, SPLASH_TINT);
          }
        });
      });
    });
  }

  private dropPlank(index: number): void {
    if (this.dead) return;
    const part = this.planks[index];
    if (!part || part.laid) return;
    this.dropPart(part, () => {
      getSoundManager().playHammer();
      this.spawnBurst(part.box.x, part.box.y, PLANK_ELEV + 0.06, SAWDUST_TINT);
      // The final board of the whole crossing finishes the build.
      if (this.isBridge && index === PLANK_ROWS - 1) this.finishBridge();
    });
  }

  // Drop one part in from above: falls to its rest height and settles solid.
  private dropPart(part: DeckPart, onLanded?: () => void): void {
    if (this.dead || part.laid) return;
    part.laid = true;
    part.animating = true;
    part.box.setAlpha(0.96).setElevation(part.restElev + DROP_FROM_TILES);
    this.scene.tweens.add({
      targets: part.box,
      elevation: part.restElev,
      duration: PART_DROP_MS,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (this.dead) return;
        part.animating = false;
        part.box.setAlpha(1);
        onLanded?.();
      },
    });
  }

  private finishBridge(): void {
    if (this.dead) return;
    // The last hammer blow lands with a physical thump; GameScene adds its flash via onBuilt.
    world3d().shake(90, 0.03);
    getSoundManager().playBridgeBuilt();
    this.pips.setVisible(false);
    this.onBuilt?.();
  }

  // A short burst of motes where a part lands: tan sawdust for boards, cool spray for legs.
  private spawnBurst(x: number, y: number, elev: number, tint: number): void {
    for (let i = 0; i < 5; i++) {
      const puff = world3d()
        .addBillboard(FX_PUFF_TEXTURE, 0, { centered: true, fog: false, depthWrite: false, emissive: true, alphaTest: 0.02 })
        .setTint(tint)
        .setPosition(x + (Math.random() - 0.5) * 0.5, y + (Math.random() - 0.5) * 0.2)
        .setElevation(elev)
        .setDisplaySize(0.15, 0.15)
        .setAlpha(0.85);
      this.scene.tweens.add({
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
    this.hintOn = on && this.buildable && !this.isBridge;
  }

  public render(tileSize: number, camera: WorldCamera): void {
    // The deck is real world geometry; only the progress pips still live on the 2D overlay.
    if (this.planks.length) this.updateGhosts();

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

  // Un-laid parts breathe as a faint ghost preview (brighter while the hero stands beside
  // the spot); parts mid-drop own their own alpha/height until they land.
  private updateGhosts(): void {
    const boost = this.hintOn ? GHOST_HINT_BOOST : 1;
    const pulse = (GHOST_BASE + GHOST_WAVE * Math.sin(this.scene.time.now * 0.005)) * boost;
    const setGhost = (part: DeckPart, alpha: number): void => {
      if (part.animating) return;
      part.box.setAlpha(part.laid ? 1 : Math.min(1, alpha));
    };
    this.planks.forEach((part, i) => setGhost(part, i === 0 ? SAMPLE_PLANK_ALPHA : pulse));
    for (const part of this.frame) setGhost(part, pulse * 0.8);
  }

  public destroy(): void {
    this.dead = true;
    this.animTimer?.destroy();
    this.animTimer = undefined;
    for (const part of [...this.planks, ...this.frame]) {
      this.scene.tweens.killTweensOf(part.box);
      part.box.destroy();
    }
    this.planks = [];
    this.frame = [];
    this.sprite.destroy();
    this.pips.destroy();
  }
}
