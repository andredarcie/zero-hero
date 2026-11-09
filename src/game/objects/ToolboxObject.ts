import type * as Engine from '@/game/engine';

import { ASSET_KEYS, TOOLBOX_FRAMES } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
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
  private craftMs = 0;
  private frame: number = TOOLBOX_FRAMES.closed;

  public constructor(
    private readonly scene: Engine.Scene,
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
  }
}
