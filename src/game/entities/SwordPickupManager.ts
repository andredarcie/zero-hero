import Phaser from 'phaser';

import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { ChunkManager } from '@/game/world/ChunkManager';
import { SwordPickup } from './SwordPickup';

const INITIAL_DELAY = 2_000;
const MIN_INTERVAL = 1_500;
const PITY_RATE = 2;

const SCATTER_RADIUS = 5;

export class SwordPickupManager {
  private readonly pickups: SwordPickup[] = [];
  private elapsed = 0;
  private totalWithoutSword = 0;

  public constructor(private readonly scene: Phaser.Scene) {}

  public onSwordEquipped(): void {
    this.elapsed = 0;
    this.totalWithoutSword = 0;
  }

  public hasPickupAt(x: number, y: number): boolean {
    return this.pickups.some((p) => !p.isCollected && p.tileX === x && p.tileY === y);
  }

  public update(
    delta: number,
    playerWorldX: number,
    playerWorldY: number,
    swordEquipped: boolean,
    chunkManager: ChunkManager,
    isOccupied: (x: number, y: number) => boolean,
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

    if (swordEquipped) return;
    if (this.pickups.some((p) => !p.isCollected)) return;

    this.elapsed += delta;
    this.totalWithoutSword += delta;

    const interval = Math.max(MIN_INTERVAL, INITIAL_DELAY - this.totalWithoutSword * PITY_RATE);

    if (this.elapsed < interval) return;
    this.elapsed = 0;

    const tile = this.pickFreeTile(playerWorldX, playerWorldY, chunkManager, isOccupied);
    if (tile) this.pickups.push(new SwordPickup(this.scene, tile.x, tile.y));
  }

  public render(tileSize: number, camera: WorldCamera): void {
    for (const pickup of this.pickups) pickup.render(tileSize, camera);
  }

  public destroy(): void {
    for (const pickup of this.pickups) pickup.destroy();
    this.pickups.length = 0;
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
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) continue;
        const tx = originX + dx;
        const ty = originY + dy;
        if (chunkManager.isCellBlocked(tx, ty)) continue;
        if (isOccupied(tx, ty)) continue;
        candidates.push({ x: tx, y: ty });
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Phaser.Math.Between(0, candidates.length - 1)];
  }
}
