import type Phaser from 'phaser';

import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { ScreenContent } from '@/game/world/ScreenContent';
import { SwordPickup } from './SwordPickup';

export class SwordPickupManager {
  private readonly byChunk = new Map<string, SwordPickup[]>();

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly getContent: (cx: number, cy: number) => ScreenContent,
  ) {}

  public syncChunks(active: Set<string>, swordEquipped: boolean): void {
    for (const [key, list] of this.byChunk) {
      if (active.has(key) && !swordEquipped) continue;
      for (const pickup of list) pickup.destroy();
      this.byChunk.delete(key);
    }
    if (swordEquipped) return;
    for (const key of active) {
      if (this.byChunk.has(key)) continue;
      const [cx, cy] = key.split(',').map(Number);
      const list = this.getContent(cx, cy).pickups
        .filter((p) => p.type === 'sword')
        .map((p) => new SwordPickup(this.scene, p.worldX, p.worldY));
      this.byChunk.set(key, list);
    }
  }

  public onSwordEquipped(): void {
    for (const list of this.byChunk.values()) {
      for (const pickup of list) pickup.destroy();
    }
    this.byChunk.clear();
  }

  private all(): SwordPickup[] {
    const out: SwordPickup[] = [];
    for (const list of this.byChunk.values()) out.push(...list);
    return out;
  }

  public hasPickupAt(x: number, y: number): boolean {
    return this.all().some((p) => !p.isCollected && p.tileX === x && p.tileY === y);
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
    for (const pickup of this.all()) {
      if (!pickup.isCollectable || pickup.isCollected) continue;
      if (pickup.tileX === playerWorldX && pickup.tileY === playerWorldY) {
        pickup.collect(onEquip);
      }
    }

    for (const list of this.byChunk.values()) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].isCollected) list.splice(i, 1);
      }
    }
  }

  public render(tileSize: number, camera: WorldCamera): void {
    for (const pickup of this.all()) pickup.render(tileSize, camera);
  }

  public destroy(): void {
    for (const list of this.byChunk.values()) {
      for (const pickup of list) pickup.destroy();
    }
    this.byChunk.clear();
  }
}
