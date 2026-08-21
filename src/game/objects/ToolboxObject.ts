import type Phaser from 'phaser';

import { ASSET_KEYS, TOOLBOX_FRAMES } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { PLACEMENT_KEY_TEXTURE, ensurePlacementKeyTexture } from '@/game/render3d/placementTexture';
import { world3d } from '@/game/render3d/World3D';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { PropDir } from '@/game/world/worldSchema';
import type { WorldProp } from './WorldProp';

const METAL_TINT = 0xd2d2d2;
const CRAFT_POSE_MS = 420;

/**
 * A bancada manual. O jogador escolhe uma receita no catalogo; os insumos saem da mochila e o
 * produto aparece no chao. Ela nao observa, recolhe ou processa itens largados ao redor.
 */
export class ToolboxObject implements WorldProp {
  private readonly body: Billboard3D;
  private hint?: Phaser.GameObjects.Image;
  private craftMs = 0;
  private frame: number = TOOLBOX_FRAMES.closed;

  public constructor(
    private readonly scene: Phaser.Scene,
    public readonly worldX: number,
    public readonly worldY: number,
    public readonly dir: PropDir = 1,
  ) {
    this.body = world3d()
      .addBillboard(ASSET_KEYS.toolbox, TOOLBOX_FRAMES.closed, { groundShadow: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(1, 1)
      .setTint(METAL_TINT);
  }

  public get blocking(): boolean { return true; }
  public get isBusy(): boolean { return this.craftMs > 0; }
  public get currentPhase(): 'idle' | 'craft' { return this.isBusy ? 'craft' : 'idle'; }
  public get currentFrame(): number { return this.frame; }

  public update(deltaMs: number): void {
    if (this.craftMs <= 0) return;
    this.craftMs = Math.max(0, this.craftMs - deltaMs);
    this.pose(this.craftMs > 0 ? TOOLBOX_FRAMES.forging : TOOLBOX_FRAMES.closed);
  }

  public renderHint(
    tileSize: number,
    camera: WorldCamera,
    show: boolean,
    timeMs: number,
  ): void {
    if (!show) { this.hint?.setVisible(false); return; }
    if (!this.hint) {
      ensurePlacementKeyTexture(this.scene, isTouchDevice());
      this.hint = this.scene.add
        .image(0, 0, PLACEMENT_KEY_TEXTURE)
        .setOrigin(0.5, 1)
        .setVisible(false);
    }
    const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    const px = Math.max(1, Math.round(tileSize / 24));
    const bob = Math.round(Math.sin(timeMs / 280) * px);
    this.hint.setVisible(true).setScale(px)
      .setPosition(screen.x, screen.y - tileSize - px * 2 + bob);
  }

  /** Mostra uma martelada curta quando uma receita manual e fabricada. */
  public playCraft(): void {
    this.craftMs = CRAFT_POSE_MS;
    this.pose(TOOLBOX_FRAMES.forging);
    this.bump();
  }

  public bump(): void {
    this.scene.tweens.killTweensOf(this.body);
    this.scene.tweens.add({
      targets: this.body,
      angle: { from: -2.5, to: 2.5 },
      duration: 42,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.body.setAngle(0),
    });
  }

  private pose(frame: number): void {
    if (this.frame === frame) return;
    this.frame = frame;
    this.body.setTexture(ASSET_KEYS.toolbox, frame);
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.body);
    this.body.destroy();
    this.hint?.destroy();
    this.hint = undefined;
  }
}
