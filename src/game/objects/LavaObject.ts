import Phaser from 'phaser';

import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d, type FireLight3D } from '@/game/render3d/World3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// A lava floor tile: a flat, self-lit quad on the 3D ground (the emissive material glows into the
// bloom pass) that ALSO carries a fire light, because in this world lava is fire — you can relight
// a dead torch at it. A glowing tile that left the ground around it pitch black read as a sticker
// on the dark; now the molten rock throws its own pool of heat, weaker than a campfire's.
// Whether it blocks is decided by GameScene: solid for enemies and for a hero without lava boots.

const PULSE_MS = 900;
// A tile of lava is a low, spread-out fire, not a bonfire: dimmer than a campfire, and there are
// many of them in a field, so their pools sum into one glow instead of each blowing out the frame.
const LIGHT_SCALE = 0.12;

export class LavaObject {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Billboard3D;
  private readonly fireLight: FireLight3D;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.sprite = world3d()
      .addBillboard('lava-floor', 0, {
        flat: true, emissive: true, flatY: 0.015, worldFx: 'lavaFlow', emissiveBoost: 3,
      })
      .setPosition(worldX, worldY)
      .setDisplaySize(1, 1);

    this.fireLight = world3d().addFireLight(worldX, worldY, true);
    this.fireLight.setIntensityScale(LIGHT_SCALE);

    // Slow heat pulse, desynchronized per tile so a lava field shimmers.
    this.sprite.setAlpha(1);
    scene.tweens.add({
      targets: this.sprite,
      alpha: 0.82,
      duration: PULSE_MS + Phaser.Math.Between(-150, 150),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  public render(_tileSize: number, _camera: WorldCamera): void {
    // Static in world space — the 3D camera does the moving now.
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.fireLight.destroy();
    this.sprite.destroy();
  }
}
