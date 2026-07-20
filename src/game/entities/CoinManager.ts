import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import Phaser from 'phaser';

import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { ChunkManager } from '@/game/world/ChunkManager';
import { Coin } from './Coin';

const SCATTER_RADIUS = 2;

export class CoinManager {
  private readonly coins: Coin[] = [];
  private total = 0;
  private magnetRadius = 0;

  public constructor(private readonly scene: Phaser.Scene) {}

  public get coinTotal(): number { return this.total; }

  public getActiveWorldPositions(): Array<{ worldX: number; worldY: number }> {
    return this.coins
      .filter((c) => !c.isCollected)
      .map((c) => ({ worldX: c.tileX, worldY: c.tileY }));
  }

  public setMagnetRadius(r: number): void { this.magnetRadius = r; }

  public spendCoins(amount: number): boolean {
    if (this.total < amount) return false;
    this.total -= amount;
    return true;
  }

  public spawnCoins(worldX: number, worldY: number, chunkManager: ChunkManager): void {
    const count = Phaser.Math.Between(1, 5);
    const targets = this.pickScatterTiles(worldX, worldY, count, chunkManager);

    targets.forEach((target, i) => {
      this.coins.push(new Coin(
        this.scene,
        worldX,
        worldY,
        target.x,
        target.y,
        i * 60,
      ));
    });
  }

  public update(
    playerWorldX: number,
    playerWorldY: number,
    absorbAnchor: { x: number; y: number },
    onCollect: (total: number) => void,
  ): void {
    for (const coin of this.coins) {
      if (!coin.isCollectable || coin.isCollected) continue;
      const dx = Math.abs(coin.tileX - playerWorldX);
      const dy = Math.abs(coin.tileY - playerWorldY);
      const inRange = dx === 0 && dy === 0;
      const inMagnet = this.magnetRadius > 0 && Math.max(dx, dy) <= this.magnetRadius;
      if (inRange || inMagnet) {
        coin.collect(absorbAnchor, () => {
          this.total += 1;
          onCollect(this.total);
        });
      }
    }

    for (let i = this.coins.length - 1; i >= 0; i--) {
      if (this.coins[i].isCollected) {
        // keep until sprite animation completes (render handles visibility)
      }
    }
  }

  public render(tileSize: number, camera: WorldCamera): void {
    for (const coin of this.coins) {
      coin.render(tileSize, camera);
    }
  }

  public resetForScreenChange(): void {
    for (const coin of this.coins) {
      coin.destroy();
    }
    this.coins.length = 0;
  }

  public destroy(): void {
    for (const coin of this.coins) {
      coin.destroy();
    }
    this.coins.length = 0;
  }

  private pickScatterTiles(
    originX: number,
    originY: number,
    count: number,
    chunkManager: ChunkManager,
  ): Array<{ x: number; y: number }> {
    const candidates: Array<{ x: number; y: number }> = [];
    const screenCx = Math.floor(originX / CHUNK_COLUMNS);
    const screenCy = Math.floor(originY / CHUNK_ROWS);

    for (let dy = -SCATTER_RADIUS; dy <= SCATTER_RADIUS; dy++) {
      for (let dx = -SCATTER_RADIUS; dx <= SCATTER_RADIUS; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tx = originX + dx;
        const ty = originY + dy;
        if (Math.floor(tx / CHUNK_COLUMNS) !== screenCx || Math.floor(ty / CHUNK_ROWS) !== screenCy) continue;
        if (!chunkManager.isCellBlocked(tx, ty)) {
          candidates.push({ x: tx, y: ty });
        }
      }
    }

    Phaser.Utils.Array.Shuffle(candidates);

    if (candidates.length === 0) {
      return Array.from({ length: count }, () => ({ x: originX, y: originY }));
    }

    return Array.from({ length: count }, (_, i) => candidates[i % candidates.length]);
  }
}
