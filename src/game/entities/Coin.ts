import Phaser from 'phaser';

import { SCENE_DEPTHS } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

const COIN_SIZE = 0.55; // tiles

/**
 * A CARA de um drop que se pega andando. A moeda é o padrão; o minério do veio (e qualquer
 * drop futuro que queira este fluxo) passa a própria arte — o corpo, o arco, o pouso e o voo
 * de absorção são os mesmos, porque a física do "pegar de passagem" é UMA só.
 */
export type CoinLook = { key: string; frame?: number; size?: number };

export class Coin {
  private readonly sprite: Billboard3D;
  private readonly pos: { x: number; y: number; angle: number };
  private readonly look: Required<CoinLook>;
  private collectable = false;
  private collected = false;
  // Last projected screen spot — anchors the 2D absorb flight on collect.
  private lastScreen = { x: 0, y: 0 };
  private lastTileSize = 48;

  public constructor(
    private readonly scene: Phaser.Scene,
    startWorldX: number,
    startWorldY: number,
    targetWorldX: number,
    targetWorldY: number,
    spawnDelay: number,
    look: CoinLook = { key: 'coin' },
  ) {
    this.pos = { x: startWorldX, y: startWorldY, angle: 0 };
    this.look = { key: look.key, frame: look.frame ?? 0, size: look.size ?? COIN_SIZE };

    // Full-bright: a coin must glint even in the dark (the 2D game punched a
    // small light hole over every coin for the same reason). GROUND layer: a coin exists to be
    // walked over — it is the tile the hero is heading for — so without a declared layer the
    // two quads go coplanar and the coin strobes through his boots (see DEPTH_LAYER).
    this.sprite = world3d()
      .addBillboard(this.look.key, this.look.frame, { emissive: true, depthLayer: 'ground' })
      .setPosition(startWorldX, startWorldY)
      .setDisplaySize(0, 0)
      .setAlpha(0);

    this.scene.tweens.add({
      targets: this.sprite,
      displayWidth: this.look.size,
      displayHeight: this.look.size,
      alpha: 1,
      duration: 120,
      delay: spawnDelay,
      ease: 'Back.easeOut',
      onComplete: () => this.startScatter(targetWorldX, targetWorldY, spawnDelay),
    });
  }

  public get tileX(): number { return Math.round(this.pos.x); }
  public get tileY(): number { return Math.round(this.pos.y); }
  public get isCollectable(): boolean { return this.collectable; }
  public get isCollected(): boolean { return this.collected; }

  public collect(absorbTarget: { x: number; y: number }, onComplete: () => void): void {
    this.collected = true;
    this.collectable = false;

    this.scene.tweens.killTweensOf(this.pos);
    this.scene.tweens.killTweensOf(this.sprite);

    // The world coin pops in place (3D), then a 2D twin carries the flight to the absorb
    // anchor — the HUD coin counter when one is on screen, the hero otherwise.
    this.scene.tweens.add({
      targets: this.sprite,
      displayWidth: this.look.size * 1.6,
      displayHeight: this.look.size * 1.6,
      duration: 80,
      ease: 'Power2.easeOut',
      yoyo: true,
      onComplete: () => {
        this.sprite.setVisible(false);
        const size = Math.max(8, Math.floor(this.lastTileSize * this.look.size));
        const fly = this.scene.add
          .image(this.lastScreen.x, this.lastScreen.y, this.look.key, this.look.frame)
          .setOrigin(0.5)
          .setDepth(SCENE_DEPTHS.uiOverlay)
          .setDisplaySize(size, size);
        this.scene.tweens.add({
          targets: fly,
          x: absorbTarget.x,
          y: absorbTarget.y,
          displayWidth: size * 0.4,
          displayHeight: size * 0.4,
          alpha: 0.8,
          duration: 280,
          ease: 'Power3.easeIn',
          onComplete: () => {
            fly.destroy();
            onComplete();
          },
        });
      },
    });
  }

  public render(tileSize: number, camera: WorldCamera): void {
    if (this.collected) return;

    const bob = this.collectable
      ? (Math.sin(this.scene.time.now * 0.005) + 1) * 0.5 * 0.08
      : 0;
    this.sprite
      .setPosition(this.pos.x, this.pos.y)
      .setAngle(this.pos.angle);
    if (this.collectable) this.sprite.setElevation(bob);

    this.lastScreen = camera.tileToScreen(this.pos.x, this.pos.y, tileSize);
    this.lastTileSize = tileSize;
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.pos);
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }

  private startScatter(targetWorldX: number, targetWorldY: number, delay: number): void {
    const spinDir = Math.random() > 0.5 ? 1 : -1;

    // Ground travel and the arc are separate axes in 3D: the coin slides to its tile
    // while its elevation hops up and bounces back down onto the ground.
    this.scene.tweens.add({
      targets: this.pos,
      x: targetWorldX,
      y: targetWorldY,
      angle: spinDir * 360,
      duration: 400,
      delay,
      ease: 'Power2.easeOut',
      onComplete: () => {
        this.pos.angle = 0;
        this.sprite.setAngle(0);
        this.collectable = true;
        this.scene.tweens.add({
          targets: this.sprite,
          displayWidth: this.look.size * 1.3,
          displayHeight: this.look.size * 1.3,
          duration: 100,
          yoyo: true,
          ease: 'Power2.easeOut',
        });
      },
    });
    this.scene.tweens.add({
      targets: this.sprite,
      elevation: 0.85,
      duration: 180,
      delay,
      ease: 'Power2.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.sprite,
          elevation: 0,
          duration: 220,
          ease: 'Bounce.easeOut',
        });
      },
    });
  }
}
