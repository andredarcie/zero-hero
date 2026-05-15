import Phaser from 'phaser';

import { CHUNK_SIZE } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { ChunkManager } from '@/game/world/ChunkManager';
import type { EnemyBase } from './EnemyBase';
import { BatEnemy } from './enemies/BatEnemy';
import { BigSlimeEnemy } from './enemies/BigSlimeEnemy';
import { MageEnemy } from './enemies/MageEnemy';
import { SlimeEnemy } from './enemies/SlimeEnemy';
import { SpiderEnemy } from './enemies/SpiderEnemy';
import { UndeadEnemy } from './enemies/UndeadEnemy';

const SPAWN_CHANCE = 0.95;
const MIN_PER_CHUNK = 6;
const MAX_PER_CHUNK = 12;
const SAFE_RADIUS = 6;

export class EnemyManager {
  private readonly enemies: EnemyBase[] = [];
  private readonly spawnedChunks = new Set<string>();

  public constructor(private readonly scene: Phaser.Scene) {}

  public spawnForChunk(
    cx: number,
    cy: number,
    chunkManager: ChunkManager,
    isOccupied?: (wx: number, wy: number) => boolean,
  ): void {
    const key = `${cx},${cy}`;
    if (this.spawnedChunks.has(key)) return;
    this.spawnedChunks.add(key);

    if (Math.random() > SPAWN_CHANCE) return;

    const count = Phaser.Math.Between(MIN_PER_CHUNK, MAX_PER_CHUNK);
    const dist = Math.abs(cx) + Math.abs(cy);

    for (let i = 0; i < count; i++) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const lx = Phaser.Math.Between(1, CHUNK_SIZE - 2);
        const ly = Phaser.Math.Between(1, CHUNK_SIZE - 2);
        const wx = cx * CHUNK_SIZE + lx;
        const wy = cy * CHUNK_SIZE + ly;

        if (Math.max(Math.abs(wx), Math.abs(wy)) < SAFE_RADIUS) continue;
        if (chunkManager.isCellBlocked(wx, wy)) continue;
        if (this.getEnemyAt(wx, wy)) continue;
        if (isOccupied?.(wx, wy)) continue;

        this.enemies.push(this.createEnemy(dist, wx, wy));
        break;
      }
    }
  }

  public getEnemyAt(worldX: number, worldY: number): EnemyBase | null {
    return this.enemies.find((e) => e.isAlive && e.worldX === worldX && e.worldY === worldY) ?? null;
  }

  public getAliveEnemies(): readonly EnemyBase[] {
    return this.enemies.filter((e) => e.isAlive);
  }

  public update(
    delta: number,
    playerWorldX: number,
    playerWorldY: number,
    isBlocked: (wx: number, wy: number) => boolean,
  ): boolean {
    let playerAttacked = false;

    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;

      const blockedForEnemy = (wx: number, wy: number): boolean => {
        if (isBlocked(wx, wy)) return true;
        if (wx === playerWorldX && wy === playerWorldY) return true;
        return this.enemies.some((e) => e !== enemy && e.isAlive && e.worldX === wx && e.worldY === wy);
      };

      if (enemy.update(delta, playerWorldX, playerWorldY, blockedForEnemy)) {
        playerAttacked = true;
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].pendingRemoval) {
        this.enemies[i].destroy();
        this.enemies.splice(i, 1);
      }
    }

    return playerAttacked;
  }

  public render(tileSize: number, camera: WorldCamera): void {
    for (const enemy of this.enemies) {
      enemy.render(tileSize, camera);
    }
  }

  public destroy(): void {
    for (const enemy of this.enemies) {
      enemy.destroy();
    }
    this.enemies.length = 0;
  }

  private createEnemy(chunkDist: number, wx: number, wy: number): EnemyBase {
    if (chunkDist <= 2) {
      return Math.random() < 0.5
        ? new BatEnemy(this.scene, wx, wy)
        : new SlimeEnemy(this.scene, wx, wy);
    }
    if (chunkDist <= 5) {
      return Math.random() < 0.5
        ? new UndeadEnemy(this.scene, wx, wy)
        : new SpiderEnemy(this.scene, wx, wy);
    }
    // dist 6+
    return Math.random() < 0.5
      ? new MageEnemy(this.scene, wx, wy)
      : new BigSlimeEnemy(this.scene, wx, wy, (spawnWx, spawnWy) => {
          this.spawnSlimePair(spawnWx, spawnWy);
        });
  }

  private spawnSlimePair(wx: number, wy: number): void {
    const offsets: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    let spawned = 0;
    for (const [ox, oy] of offsets) {
      if (spawned >= 2) break;
      const nx = wx + ox;
      const ny = wy + oy;
      if (!this.getEnemyAt(nx, ny)) {
        this.enemies.push(new SlimeEnemy(this.scene, nx, ny));
        spawned += 1;
      }
    }
  }
}
