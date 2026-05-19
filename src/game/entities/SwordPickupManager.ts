import type Phaser from 'phaser';

import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { PickupSpawn, ScreenContent } from '@/game/world/ScreenContent';
import { toScreenKey } from '@/game/world/ScreenContent';
import { SwordPickup } from './SwordPickup';

export class SwordPickupManager {
  private readonly pickups: SwordPickup[] = [];
  private currentScreenKey = '';

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly contentByScreen: Map<string, ScreenContent>,
  ) {}

  public enterScreen(cx: number, cy: number, swordEquipped: boolean): void {
    const key = toScreenKey(cx, cy);
    if (key === this.currentScreenKey) return;

    this.clearCurrentPickups();
    this.currentScreenKey = key;

    if (swordEquipped) return;

    const content = this.contentByScreen.get(key);
    if (!content) return;

    for (const pickup of content.pickups) {
      if (pickup.type !== 'sword') continue;
      this.pickups.push(this.createSword(pickup));
    }
  }

  public onSwordEquipped(): void {
    this.clearCurrentPickups();
  }

  public hasPickupAt(x: number, y: number): boolean {
    return this.pickups.some((p) => !p.isCollected && p.tileX === x && p.tileY === y);
  }

  public update(
    _delta: number,
    playerWorldX: number,
    playerWorldY: number,
    _swordEquipped: boolean,
    _chunkManager: unknown,
    _isOccupied: (x: number, y: number) => boolean,
    onEquip: () => void,
  ): void {
    for (const pickup of this.pickups) {
      if (!pickup.isCollectable || pickup.isCollected) continue;
      if (pickup.tileX === playerWorldX && pickup.tileY === playerWorldY) {
        pickup.collect(onEquip);
      }
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      if (this.pickups[i].isCollected) this.pickups.splice(i, 1);
    }
  }

  public render(tileSize: number, camera: WorldCamera): void {
    for (const pickup of this.pickups) pickup.render(tileSize, camera);
  }

  public destroy(): void {
    this.clearCurrentPickups();
    this.currentScreenKey = '';
  }

  private clearCurrentPickups(): void {
    for (const pickup of this.pickups) pickup.destroy();
    this.pickups.length = 0;
  }

  private createSword(pickup: PickupSpawn): SwordPickup {
    return new SwordPickup(this.scene, pickup.worldX, pickup.worldY);
  }
}
