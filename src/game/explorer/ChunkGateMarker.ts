import { ASSET_KEYS, PRESSURE_PLATE_FRAMES } from '@/game/constants';
import { world3d } from '@/game/render3d/World3D';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import type { ChunkFrontier } from './explorerWorld';

/** A flat, readable square on the road. Grey means the current purse cannot wake it. */
export class ChunkGateMarker {
  public readonly id: string;
  private readonly sprite: Billboard3D;

  public constructor(public readonly frontier: ChunkFrontier, enabled: boolean) {
    this.id = frontier.id;
    this.sprite = world3d()
      .addBillboard(ASSET_KEYS.pressurePlate, PRESSURE_PLATE_FRAMES.up, {
        flat: true,
        flatY: 0.032,
        depthLayer: 'ground',
        emissiveBoost: enabled ? 1.2 : 0,
      })
      .setPosition(frontier.gateX, frontier.gateY)
      .setDisplaySize(0.9, 0.9);
    this.setEnabled(enabled);
  }

  public setEnabled(enabled: boolean): void {
    this.sprite.setTint(enabled ? 0xf2c66d : 0x46505a);
    this.sprite.setAlpha(enabled ? 1 : 0.55);
  }

  public destroy(): void { this.sprite.destroy(); }
}
