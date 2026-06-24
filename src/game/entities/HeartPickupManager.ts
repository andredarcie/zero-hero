import type Phaser from 'phaser';

import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { ScreenContent } from '@/game/world/ScreenContent';
import { HeartPickup } from './HeartPickup';

export class HeartPickupManager {
  private readonly byChunk = new Map<string, HeartPickup[]>();

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly getContent: (cx: number, cy: number) => ScreenContent,
  ) {}

  public syncChunks(active: Set<string>): void {
    for (const [key, list] of this.byChunk) {
      if (active.has(key)) continue;
      for (const heart of list) heart.destroy();
      this.byChunk.delete(key);
    }
    for (const key of active) {
      if (this.byChunk.has(key)) continue;
      const [cx, cy] = key.split(',').map(Number);
      const list = this.getContent(cx, cy).pickups
        .filter((p) => p.type === 'heart')
        .map((p) => new HeartPickup(this.scene, p.worldX, p.worldY));
      this.byChunk.set(key, list);
    }
  }

  private all(): HeartPickup[] {
    const out: HeartPickup[] = [];
    for (const list of this.byChunk.values()) out.push(...list);
    return out;
  }

  public hasPickupAt(x: number, y: number): boolean {
    return this.all().some((h) => !h.isCollected && h.tileX === x && h.tileY === y);
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
    for (const heart of this.all()) {
      if (!heart.isCollectable || heart.isCollected) continue;
      if (heart.tileX === playerWorldX && heart.tileY === playerWorldY) {
        heart.collect(onHeal);
      }
    }

    for (const list of this.byChunk.values()) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].isCollected) list.splice(i, 1);
      }
    }
  }

  public render(tileSize: number, camera: WorldCamera): void {
    for (const heart of this.all()) heart.render(tileSize, camera);
  }

  public destroy(): void {
    for (const list of this.byChunk.values()) {
      for (const heart of list) heart.destroy();
    }
    this.byChunk.clear();
  }
}
