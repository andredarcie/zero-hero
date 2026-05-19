import type Phaser from 'phaser';

import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { PickupSpawn, ScreenContent } from '@/game/world/ScreenContent';
import { toScreenKey } from '@/game/world/ScreenContent';
import { HeartPickup } from './HeartPickup';

export class HeartPickupManager {
  private readonly hearts: HeartPickup[] = [];
  private currentScreenKey = '';

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly contentByScreen: Map<string, ScreenContent>,
  ) {}

  public enterScreen(cx: number, cy: number): void {
    const key = toScreenKey(cx, cy);
    if (key === this.currentScreenKey) return;

    this.clearCurrentHearts();
    this.currentScreenKey = key;

    const content = this.contentByScreen.get(key);
    if (!content) return;

    for (const pickup of content.pickups) {
      if (pickup.type !== 'heart') continue;
      this.hearts.push(this.createHeart(pickup));
    }
  }

  public hasPickupAt(x: number, y: number): boolean {
    return this.hearts.some((h) => !h.isCollected && h.tileX === x && h.tileY === y);
  }

  public update(
    _delta: number,
    playerWorldX: number,
    playerWorldY: number,
    _playerHealth: number,
    _chunkManager: unknown,
    _isOccupied: (x: number, y: number) => boolean,
    onHeal: () => void,
  ): void {
    for (const heart of this.hearts) {
      if (!heart.isCollectable || heart.isCollected) continue;
      if (heart.tileX === playerWorldX && heart.tileY === playerWorldY) {
        heart.collect(onHeal);
      }
    }

    for (let i = this.hearts.length - 1; i >= 0; i--) {
      if (this.hearts[i].isCollected) {
        this.hearts.splice(i, 1);
      }
    }
  }

  public render(tileSize: number, camera: WorldCamera): void {
    for (const heart of this.hearts) {
      heart.render(tileSize, camera);
    }
  }

  public destroy(): void {
    this.clearCurrentHearts();
    this.currentScreenKey = '';
  }

  private clearCurrentHearts(): void {
    for (const heart of this.hearts) {
      heart.destroy();
    }
    this.hearts.length = 0;
  }

  private createHeart(pickup: PickupSpawn): HeartPickup {
    return new HeartPickup(this.scene, pickup.worldX, pickup.worldY);
  }
}
