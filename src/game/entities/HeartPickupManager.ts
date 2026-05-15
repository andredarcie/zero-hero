import Phaser from 'phaser';

import { HUD_HEALTH_MAX } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { ChunkManager } from '@/game/world/ChunkManager';
import { HeartPickup } from './HeartPickup';

// Interval in ms between spawn attempts at each missing-heart level.
// Index 0 = full health (never spawn), 1 = 1 heart missing, 2 = 2 missing.
const SPAWN_INTERVAL_BY_MISSING: Record<number, number> = {
  1: 12_000,
  2: 5_000,
};

const SCATTER_RADIUS = 5;
const MAX_HEARTS_IN_WORLD = 3;

export class HeartPickupManager {
  private readonly hearts: HeartPickup[] = [];
  private elapsed = 0;

  public constructor(private readonly scene: Phaser.Scene) {}

  public hasPickupAt(x: number, y: number): boolean {
    return this.hearts.some((h) => !h.isCollected && h.tileX === x && h.tileY === y);
  }

  public update(
    delta: number,
    playerWorldX: number,
    playerWorldY: number,
    playerHealth: number,
    chunkManager: ChunkManager,
    isOccupied: (x: number, y: number) => boolean,
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

    const missing = HUD_HEALTH_MAX - playerHealth;
    if (missing <= 0) {
      this.elapsed = 0;
      return;
    }

    const interval = SPAWN_INTERVAL_BY_MISSING[missing] ?? SPAWN_INTERVAL_BY_MISSING[1];
    this.elapsed += delta;

    if (this.elapsed < interval) return;
    this.elapsed = 0;

    if (this.hearts.filter((h) => !h.isCollected).length >= MAX_HEARTS_IN_WORLD) return;

    const tile = this.pickFreeTile(playerWorldX, playerWorldY, chunkManager, isOccupied);
    if (tile) {
      this.hearts.push(new HeartPickup(this.scene, tile.x, tile.y));
    }
  }

  public render(tileSize: number, camera: WorldCamera): void {
    for (const heart of this.hearts) {
      heart.render(tileSize, camera);
    }
  }

  public destroy(): void {
    for (const heart of this.hearts) {
      heart.destroy();
    }
    this.hearts.length = 0;
  }

  private pickFreeTile(
    originX: number,
    originY: number,
    chunkManager: ChunkManager,
    isOccupied: (x: number, y: number) => boolean,
  ): { x: number; y: number } | null {
    const candidates: Array<{ x: number; y: number }> = [];

    for (let dy = -SCATTER_RADIUS; dy <= SCATTER_RADIUS; dy++) {
      for (let dx = -SCATTER_RADIUS; dx <= SCATTER_RADIUS; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tx = originX + dx;
        const ty = originY + dy;
        if (chunkManager.isCellBlocked(tx, ty)) continue;
        if (this.hearts.some((h) => !h.isCollected && h.tileX === tx && h.tileY === ty)) continue;
        if (isOccupied(tx, ty)) continue;
        candidates.push({ x: tx, y: ty });
      }
    }

    if (candidates.length === 0) return null;
    return candidates[Phaser.Math.Between(0, candidates.length - 1)];
  }
}
