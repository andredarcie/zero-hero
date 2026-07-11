import Phaser from 'phaser';

import { ASSET_KEYS, BRIDGE_GRAVETOS_REQUIRED, SCENE_DEPTHS, WATER_FRAME_KEYS } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// A river tile. It blocks like lava until the hero builds a bridge over it by depositing two
// wood sticks ("gravetos"). Water renders at ground level; the finished bridge is a wooden
// plank tile (ASSET_KEYS.bridge) the hero then walks across. While the hero stands beside an
// un-bridged tile it shows the exact build spot: a translucent bridge preview plus a row of
// pips filling in as gravetos are deposited. Collision is resolved at runtime by GameScene
// (via `blocking`), exactly like LavaObject.

const RIPPLE_MS = 220; // ms per water animation frame

export class WaterObject {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Image; // the water (hidden once bridged)
  private readonly bridge: Phaser.GameObjects.Image; // plank tile: ghost preview, then solid
  private readonly pips: Phaser.GameObjects.Container;
  private readonly pipDots: Phaser.GameObjects.Arc[] = [];
  private deposited = 0;
  private hintOn = false;
  private frameIndex = 0;
  private animTimer?: Phaser.Time.TimerEvent;
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

    // Build-progress pips, floated above the tile only while the hero is beside it.
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
    this.deposited += 1;
    if (this.isBridge) this.completeBridge();
    return this.isBridge;
  }

  /** Finish the bridge in one go — a tree felled across the river ("TIMBER!") drops for free.
   * Works on any river tile, not just buildable spots (that restriction is only for the manual
   * graveto build via deposit()). */
  public buildBridgeNow(): void {
    if (this.isBridge) return;
    this.deposited = BRIDGE_GRAVETOS_REQUIRED;
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

  /** GameScene flags this each frame: true when the hero stands next to a buildable un-bridged tile. */
  public setBuildHint(on: boolean): void {
    this.hintOn = on && this.buildable && !this.isBridge;
  }

  public render(tileSize: number, camera: WorldCamera): void {
    const s = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    this.sprite.setPosition(s.x, s.y);
    if (this.sprite.displayWidth !== tileSize) this.sprite.setDisplaySize(tileSize, tileSize);
    this.bridge.setPosition(s.x, s.y);
    if (this.bridge.displayWidth !== tileSize) this.bridge.setDisplaySize(tileSize, tileSize);

    if (this.isBridge) {
      this.bridge.setVisible(true);
      this.pips.setVisible(false);
      return;
    }

    // Plain (non-buildable) river tiles just block — no ghost, no pips.
    if (!this.buildable) {
      this.bridge.setVisible(false);
      this.pips.setVisible(false);
      return;
    }

    // A buildable spot ALWAYS shows a faint ghost bridge — that's the "you can build here"
    // marker, visible even from afar. It brightens (and shows progress pips) once construction
    // has started (>=1 graveto) or while the hero stands beside it.
    const started = this.deposited > 0;
    const near = started || this.hintOn;
    this.bridge.setVisible(true).setAlpha(near ? 0.5 : 0.28);
    this.pips.setVisible(near);
    if (!near) return;

    const bob = Math.sin(this.scene.time.now * 0.006) * (tileSize * 0.06);
    this.pips.setPosition(s.x, s.y - tileSize * 0.55 + bob);
    const gap = tileSize * 0.24;
    const r = Math.max(2, tileSize * 0.09);
    this.pipDots.forEach((dot, i) => {
      dot.setPosition((i - (BRIDGE_GRAVETOS_REQUIRED - 1) / 2) * gap, 0);
      dot.setRadius(r);
      dot.setFillStyle(i < this.deposited ? 0xffcf8a : 0x3a2a1a, 1);
    });
  }

  public destroy(): void {
    this.animTimer?.destroy();
    this.animTimer = undefined;
    this.scene.tweens.killTweensOf(this.bridge);
    this.sprite.destroy();
    this.bridge.destroy();
    this.pips.destroy();
  }
}
