import type Phaser from 'phaser';

import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { EnemySpawn, ScreenContent } from '@/game/world/ScreenContent';
import { toScreenKey } from '@/game/world/ScreenContent';
import type { EnemyBase } from './EnemyBase';
import { BatEnemy } from './enemies/BatEnemy';
import { BigSlimeEnemy } from './enemies/BigSlimeEnemy';
import { MageEnemy } from './enemies/MageEnemy';
import { SlimeEnemy } from './enemies/SlimeEnemy';
import { SpiderEnemy } from './enemies/SpiderEnemy';
import { UndeadEnemy } from './enemies/UndeadEnemy';

export class EnemyManager {
  private readonly enemies: EnemyBase[] = [];
  private currentScreenKey = '';

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly contentByScreen: Map<string, ScreenContent>,
  ) {}

  public enterScreen(cx: number, cy: number): void {
    const key = toScreenKey(cx, cy);
    if (key === this.currentScreenKey) return;

    this.clearCurrentEnemies();
    this.currentScreenKey = key;

    const content = this.contentByScreen.get(key);
    if (!content) return;

    for (const spawn of content.enemies) {
      this.enemies.push(this.createEnemy(spawn, cx, cy));
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
    this.clearCurrentEnemies();
    this.currentScreenKey = '';
  }

  private clearCurrentEnemies(): void {
    for (const enemy of this.enemies) {
      enemy.destroy();
    }
    this.enemies.length = 0;
  }

  private createEnemy(spawn: EnemySpawn, cx: number, cy: number): EnemyBase {
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
          this.spawnSlimePair(spawnWx, spawnWy, cx, cy);
        });
    }
  }

  private spawnSlimePair(wx: number, wy: number, cx: number, cy: number): void {
    const offsets: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    let spawned = 0;
    for (const [ox, oy] of offsets) {
      if (spawned >= 2) break;
      const nx = wx + ox;
      const ny = wy + oy;
      if (toScreenKey(Math.floor(nx / CHUNK_COLUMNS), Math.floor(ny / CHUNK_ROWS)) !== toScreenKey(cx, cy)) continue;
      if (!this.getEnemyAt(nx, ny)) {
        this.enemies.push(new SlimeEnemy(this.scene, nx, ny));
        spawned += 1;
      }
    }
  }
}
