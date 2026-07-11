import Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import { ASSET_KEYS, BRIDGE_GRAVETOS_REQUIRED, SCENE_DEPTHS, WATER_FRAME_KEYS } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// A river tile. It blocks like lava until the hero builds a bridge over it by depositing two
// wood sticks ("gravetos"). Water renders at ground level; the finished bridge is a wooden
// plank tile (ASSET_KEYS.bridge) the hero then walks across.
//
// Building is a little carpentry mini-game: a buildable spot shows the bridge as a set of
// faint GHOST plank slats floating over the water. Each graveto the hero deposits nails down
// its share of those slats — they drop in from above one at a time with a hammer beat and a
// puff of sawdust — so the crossing visibly grows board by board. When the last slat lands the
// procedural planks cross-fade into the real bridge tile with a settling bounce. Collision is
// resolved at runtime by GameScene (via `blocking`), exactly like LavaObject.

const RIPPLE_MS = 220; // ms per water animation frame

// The finished tile is milled into this many horizontal boards (bridge.png has horizontal
// grain). The gravetos share them evenly — two gravetos, four boards, two boards per graveto.
const PLANK_ROWS = 4;
const PLANKS_PER_GRAVETO = Math.max(1, Math.floor(PLANK_ROWS / BRIDGE_GRAVETOS_REQUIRED));

const PLANK_DROP_MS = 200; // per-board fall + settle
const PLANK_STAGGER_MS = 105; // gap between successive boards nailed in one deposit
const FINISH_MS = 220; // cross-fade + final bounce once the last board lands

// Weathered-wood palette for the procedural boards (alternating for a bit of grain).
const PLANK_FILLS = [0x8a6038, 0x6f4a2c] as const;
const PLANK_HILITE = 0xb2884f; // sunlit top edge of each board
const PLANK_SHADOW = 0x120a04; // board's own drop shadow (kept faint)

// The very first board (index 0) stays a lot more solid than the rest, even with zero gravetos
// deposited — a single "sample plank" sitting on the bank so a buildable spot reads at a glance,
// before the player is close enough to notice the faint full-bridge ghost outline.
const SAMPLE_PLANK_ALPHA = 0.62;

interface Slat {
  group: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Rectangle;
  hilite: Phaser.GameObjects.Rectangle;
  shadow: Phaser.GameObjects.Rectangle;
  restY: number; // local y where the board rests once laid
  laid: boolean;
  animating: boolean;
}

export class WaterObject {
  public readonly worldX: number;
  public readonly worldY: number;

  // Fired once when the bridge finishes building (GameScene uses it for a scene-level flash).
  public onBuilt?: () => void;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Image; // the water (hidden once bridged)
  private readonly bridge: Phaser.GameObjects.Image; // the real plank tile, shown only when finished
  private readonly buildFx: Phaser.GameObjects.Container; // holds the ghost/laid boards + sawdust
  private readonly pips: Phaser.GameObjects.Container;
  private readonly pipDots: Phaser.GameObjects.Arc[] = [];
  private readonly slats: Slat[] = [];
  private deposited = 0;
  private hintOn = false;
  private frameIndex = 0;
  private animTimer?: Phaser.Time.TimerEvent;
  private lastTileSize = 0;
  private finishing = false; // guards render() from snapping the boards away mid cross-fade
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
    this.frameIndex = Phaser.Math.Between(0, WATER_FRAME_KEYS.length - 1);
    this.sprite = scene.add
      .image(0, 0, WATER_FRAME_KEYS[this.frameIndex])
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.ground + 1);
    this.animTimer = scene.time.addEvent({
      delay: RIPPLE_MS + Phaser.Math.Between(-40, 40),
      callback: this.nextFrame,
      callbackScope: this,
      loop: true,
    });

    this.bridge = scene.add
      .image(0, 0, ASSET_KEYS.bridge)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.ground + 2)
      .setVisible(false);

    // Construction layer floats just above the water so laid boards hide the ripple beneath
    // them while ghost boards let it show through.
    this.buildFx = scene.add.container(0, 0).setDepth(SCENE_DEPTHS.ground + 3).setVisible(false);

    // Build-progress pips ("gravetos needed"), floated above the tile only while the hero is beside it.
    this.pips = scene.add.container(0, 0).setDepth(SCENE_DEPTHS.toast).setVisible(false);
    for (let i = 0; i < BRIDGE_GRAVETOS_REQUIRED; i++) {
      const dot = scene.add.circle(0, 0, 2, 0x3a2a1a).setStrokeStyle(1, 0x1a1008);
      this.pipDots.push(dot);
      this.pips.add(dot);
    }
  }

  private nextFrame(): void {
    this.frameIndex = (this.frameIndex + 1) % WATER_FRAME_KEYS.length;
    this.sprite.setTexture(WATER_FRAME_KEYS[this.frameIndex]);
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
    this.deposited += 1;
    const laidAfter = this.isBridge ? PLANK_ROWS : this.deposited * PLANKS_PER_GRAVETO;
    getSoundManager().playBridgePlank(); // the "graveto set onto the frame" cue
    this.nailSlats(laidBefore, laidAfter); // hammer this deposit's share of boards into place
    return this.isBridge;
  }

  /** Finish the bridge in one go — a tree felled across the river ("TIMBER!") drops for free.
   * Works on any river tile, not just buildable spots (that restriction is only for the manual
   * graveto build via deposit()). The trunk slamming down IS the animation, so this snaps the
   * finished tile straight in rather than running the carpentry build. */
  public buildBridgeNow(): void {
    if (this.isBridge) return;
    this.deposited = BRIDGE_GRAVETOS_REQUIRED;
    this.buildFx.setVisible(false);
    this.completeBridge();
  }

  // Swap water for the solid plank tile with a small settle. The water is gone, so stop
  // cycling its ripple frames.
  private completeBridge(): void {
    this.animTimer?.destroy();
    this.animTimer = undefined;
    this.sprite.setVisible(false);
    this.pips.setVisible(false);
    this.bridge.setVisible(true).setAlpha(1);
    this.scene.tweens.add({
      targets: this.bridge,
      scaleX: { from: this.bridge.scaleX * 1.12, to: this.bridge.scaleX },
      scaleY: { from: this.bridge.scaleY * 1.12, to: this.bridge.scaleY },
      duration: 180,
      ease: 'Back.easeOut',
    });
  }

  // ── carpentry animation ──────────────────────────────────────────────────

  // Schedule the drop-in for boards [from, to): each falls, settles and is hammered home a
  // beat after the last. Runs off the render tileSize, so defer to the next render if we've
  // never been laid out yet.
  private nailSlats(from: number, to: number): void {
    for (let k = 0; from + k < to && from + k < PLANK_ROWS; k++) {
      const index = from + k;
      this.scene.time.delayedCall(k * PLANK_STAGGER_MS, () => this.dropSlat(index));
    }
  }

  private dropSlat(index: number): void {
    if (this.dead) return;
    const slat = this.slats[index];
    if (!slat) return; // not laid out yet — updateSlats() will show it solid on the next render
    slat.laid = true;
    slat.animating = true;
    const ts = this.lastTileSize || 1;
    slat.group.setAlpha(0.96);
    slat.group.y = slat.restY - ts * 0.55; // start above the river
    slat.group.setScale(1, 0.55); // squashed, opens up as it lands
    slat.shadow.setVisible(true).setAlpha(0);
    this.scene.tweens.add({
      targets: slat.group,
      y: slat.restY,
      scaleY: 1,
      duration: PLANK_DROP_MS,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (this.dead) return;
        slat.animating = false;
        slat.group.setAlpha(1);
        this.onSlatLanded(index);
      },
    });
    this.scene.tweens.add({ targets: slat.shadow, alpha: 0.34, duration: PLANK_DROP_MS });
  }

  private onSlatLanded(index: number): void {
    getSoundManager().playHammer();
    this.spawnSawdust(index);
    // The final board of the whole crossing tips us into the finished tile.
    if (this.isBridge && index === PLANK_ROWS - 1) this.finishBridge();
  }

  // Once the last board is nailed, cross-fade the procedural planks into the real bridge tile.
  private finishBridge(): void {
    if (this.finishing || this.dead) return;
    this.finishing = true;
    this.animTimer?.destroy();
    this.animTimer = undefined;
    this.sprite.setVisible(false);
    this.pips.setVisible(false);
    this.bridge.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.bridge, alpha: 1, duration: FINISH_MS });
    this.scene.tweens.add({
      targets: this.bridge,
      scaleX: { from: this.bridge.scaleX * 1.1, to: this.bridge.scaleX },
      scaleY: { from: this.bridge.scaleY * 1.1, to: this.bridge.scaleY },
      duration: FINISH_MS + 40,
      ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: this.buildFx,
      alpha: 0,
      duration: FINISH_MS,
      onComplete: () => {
        this.buildFx.setVisible(false).setAlpha(1);
        this.finishing = false;
      },
    });
    getSoundManager().playBridgeBuilt();
    this.onBuilt?.();
  }

  // A short spray of tan sawdust bursting up where a board is hammered home.
  private spawnSawdust(index: number): void {
    const slat = this.slats[index];
    if (!slat || this.dead) return;
    const ts = this.lastTileSize || 1;
    const r = Math.max(1, ts * 0.045);
    for (let i = 0; i < 5; i++) {
      const speck = this.scene.add
        .circle(Phaser.Math.Between(-ts * 0.3, ts * 0.3), slat.restY, r, i % 2 ? 0xd9b483 : 0xb98f5c, 0.9);
      this.buildFx.add(speck);
      this.scene.tweens.add({
        targets: speck,
        x: speck.x + Phaser.Math.Between(-6, 6) * (ts * 0.05),
        y: speck.y - ts * (0.18 + Math.random() * 0.32),
        alpha: 0,
        duration: 260 + i * 22,
        ease: 'Quad.easeOut',
        onComplete: () => speck.destroy(),
      });
    }
  }

  /** GameScene flags this each frame: true when the hero stands next to a buildable un-bridged tile. */
  public setBuildHint(on: boolean): void {
    this.hintOn = on && this.buildable && !this.isBridge;
  }

  public render(tileSize: number, camera: WorldCamera): void {
    const s = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    this.sprite.setPosition(s.x, s.y);
    this.bridge.setPosition(s.x, s.y);
    this.buildFx.setPosition(s.x, s.y);
    // Only re-lay geometry when the tile size actually changes — sizing every frame would
    // fight the settle/scale tweens (they'd get snapped back to 1:1 mid-bounce).
    if (tileSize !== this.lastTileSize) {
      this.lastTileSize = tileSize;
      this.sprite.setDisplaySize(tileSize, tileSize);
      this.bridge.setDisplaySize(tileSize, tileSize);
      if (this.buildable) this.layoutSlats(tileSize);
    }

    if (this.isBridge && !this.finishing) {
      this.bridge.setVisible(true);
      this.buildFx.setVisible(false);
      this.pips.setVisible(false);
      return;
    }
    if (this.finishing) return; // the finish tweens own every sprite until they complete

    // Plain (non-buildable) river tiles just block — no ghost boards, no pips.
    if (!this.buildable) {
      this.bridge.setVisible(false);
      this.buildFx.setVisible(false);
      this.pips.setVisible(false);
      return;
    }

    // A buildable spot always shows the crossing as ghost boards (the "you can build here"
    // marker). Boards already nailed sit solid; the rest breathe faintly to draw the eye.
    this.ensureSlats(tileSize);
    this.bridge.setVisible(false);
    this.buildFx.setVisible(true);
    this.updateSlats();

    // Pips float above only while the hero is beside the spot (or a build is underway).
    const near = this.deposited > 0 || this.hintOn;
    this.pips.setVisible(near);
    if (near) {
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

  // Lazily build the four board sprites (once), then keep them laid out for the tile size.
  private ensureSlats(tileSize: number): void {
    if (this.slats.length) return;
    for (let i = 0; i < PLANK_ROWS; i++) {
      const group = this.scene.add.container(0, 0);
      const shadow = this.scene.add.rectangle(0, 0, 1, 1, PLANK_SHADOW, 0.34).setVisible(false);
      const body = this.scene.add.rectangle(0, 0, 1, 1, PLANK_FILLS[i % PLANK_FILLS.length]);
      const hilite = this.scene.add.rectangle(0, 0, 1, 1, PLANK_HILITE, 0.55);
      group.add([shadow, body, hilite]);
      this.buildFx.add(group);
      this.slats.push({ group, body, hilite, shadow, restY: 0, laid: false, animating: false });
    }
    this.layoutSlats(tileSize);
  }

  private layoutSlats(tileSize: number): void {
    if (!this.slats.length) return;
    const rowH = tileSize / PLANK_ROWS;
    const w = tileSize * 0.98;
    const bodyH = rowH * 0.82; // gap between boards reads as the plank seams
    this.slats.forEach((slat, i) => {
      const cy = -tileSize / 2 + (i + 0.5) * rowH;
      slat.restY = cy;
      if (!slat.animating) slat.group.setPosition(0, cy);
      slat.body.setSize(w, bodyH);
      slat.hilite.setSize(w, Math.max(1, bodyH * 0.22)).setPosition(0, -bodyH * 0.3);
      slat.shadow.setSize(w, bodyH).setPosition(0, bodyH * 0.16);
    });
  }

  // Reflect the current laid/ghost state each frame (skipping any board mid-drop, whose tween
  // owns its transform + alpha).
  private updateSlats(): void {
    const laid = this.isBridge ? PLANK_ROWS : this.deposited * PLANKS_PER_GRAVETO;
    const pulse = 0.2 + 0.06 * Math.sin(this.scene.time.now * 0.005);
    this.slats.forEach((slat, i) => {
      if (slat.animating) return;
      const isLaid = i < laid;
      slat.laid = isLaid;
      const ghostAlpha = i === 0 ? SAMPLE_PLANK_ALPHA : pulse;
      slat.group.setAlpha(isLaid ? 1 : ghostAlpha);
      slat.group.setScale(1, 1);
      slat.group.setPosition(0, slat.restY);
      slat.shadow.setVisible(isLaid);
      slat.hilite.setVisible(isLaid);
    });
  }

  public destroy(): void {
    this.dead = true;
    this.animTimer?.destroy();
    this.animTimer = undefined;
    this.scene.tweens.killTweensOf(this.bridge);
    this.scene.tweens.killTweensOf(this.buildFx);
    this.slats.forEach((s) => this.scene.tweens.killTweensOf(s.group));
    this.sprite.destroy();
    this.bridge.destroy();
    this.buildFx.destroy(true); // destroys the slat groups + any live sawdust children
    this.pips.destroy();
  }
}
