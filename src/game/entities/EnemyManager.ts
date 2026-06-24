import type Phaser from 'phaser';

import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { EnemySpawn, ScreenContent } from '@/game/world/ScreenContent';
import type { EnemyBase } from './EnemyBase';
import { BatEnemy } from './enemies/BatEnemy';
import { BigSlimeEnemy } from './enemies/BigSlimeEnemy';
import { MageEnemy } from './enemies/MageEnemy';
import { SlimeEnemy } from './enemies/SlimeEnemy';
import { SpiderEnemy } from './enemies/SpiderEnemy';
import { UndeadEnemy } from './enemies/UndeadEnemy';

export class EnemyManager {
  // Enemies grouped by the chunk they belong to, streamed in/out as the player roams.
  private readonly byChunk = new Map<string, EnemyBase[]>();

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly getContent: (cx: number, cy: number) => ScreenContent,
  ) {}

  public syncChunks(active: Set<string>): void {
    for (const [key, list] of this.byChunk) {
      if (active.has(key)) continue;
      for (const enemy of list) enemy.destroy();
      this.byChunk.delete(key);
    }
    for (const key of active) {
      if (this.byChunk.has(key)) continue;
      const [cx, cy] = key.split(',').map(Number);
      const list = this.getContent(cx, cy).enemies.map((spawn) => this.createEnemy(spawn, key));
      this.byChunk.set(key, list);
    }
  }

  private all(): EnemyBase[] {
    const out: EnemyBase[] = [];
    for (const list of this.byChunk.values()) out.push(...list);
    return out;
  }

  public getEnemyAt(worldX: number, worldY: number): EnemyBase | null {
    return this.all().find((e) => e.isAlive && e.worldX === worldX && e.worldY === worldY) ?? null;
  }

  public getActiveWorldPositions(): Array<{ worldX: number; worldY: number }> {
    return this.all().filter((e) => e.isAlive).map((e) => ({ worldX: e.worldX, worldY: e.worldY }));
  }

  public getAliveEnemies(): readonly EnemyBase[] {
    return this.all().filter((e) => e.isAlive);
  }

  public update(
    delta: number,
    playerWorldX: number,
    playerWorldY: number,
    isBlocked: (wx: number, wy: number) => boolean,
  ): boolean {
    let playerAttacked = false;
    const all = this.all();

    for (const enemy of all) {
      if (!enemy.isAlive) continue;

      const blockedForEnemy = (wx: number, wy: number): boolean => {
        if (isBlocked(wx, wy)) return true;
        if (wx === playerWorldX && wy === playerWorldY) return true;
        return all.some((e) => e !== enemy && e.isAlive && e.worldX === wx && e.worldY === wy);
      };

      if (enemy.update(delta, playerWorldX, playerWorldY, blockedForEnemy)) {
        playerAttacked = true;
      }
    }

    for (const list of this.byChunk.values()) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].pendingRemoval) {
          list[i].destroy();
          list.splice(i, 1);
        }
      }
    }

    return playerAttacked;
  }

  public render(tileSize: number, camera: WorldCamera): void {
    for (const enemy of this.all()) enemy.render(tileSize, camera);
  }

  public destroy(): void {
    for (const list of this.byChunk.values()) {
      for (const enemy of list) enemy.destroy();
    }
    this.byChunk.clear();
  }

  private createEnemy(spawn: EnemySpawn, chunkKey: string): EnemyBase {
    switch (spawn.type) {
      case 'bat':
        return new BatEnemy(this.scene, spawn.worldX, spawn.worldY);
      case 'slime':
        return new SlimeEnemy(this.scene, spawn.worldX, spawn.worldY);
      case 'undead':
        return new UndeadEnemy(this.scene, spawn.worldX, spawn.worldY);
      case 'spider':
        return new SpiderEnemy(this.scene, spawn.worldX, spawn.worldY);
      case 'mage':
        return new MageEnemy(this.scene, spawn.worldX, spawn.worldY);
      case 'bigSlime':
        return new BigSlimeEnemy(this.scene, spawn.worldX, spawn.worldY, (spawnWx, spawnWy) => {
          this.spawnSlimePair(spawnWx, spawnWy, chunkKey);
        });
    }
  }

  private spawnSlimePair(wx: number, wy: number, chunkKey: string): void {
    const list = this.byChunk.get(chunkKey);
    if (!list) return;
    const offsets: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    let spawned = 0;
    for (const [ox, oy] of offsets) {
      if (spawned >= 2) break;
      const nx = wx + ox;
      const ny = wy + oy;
      if (!this.getEnemyAt(nx, ny)) {
        list.push(new SlimeEnemy(this.scene, nx, ny));
        spawned += 1;
      }
    }
  }
}
