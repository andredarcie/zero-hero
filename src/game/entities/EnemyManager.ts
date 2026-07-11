import type Phaser from 'phaser';

import type { WorldCamera } from '@/game/runtime/WorldCamera';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { EnemyBase } from './EnemyBase';
import { UndeadEnemy } from './enemies/UndeadEnemy';

// The world itself has zero authored enemies now. Every skull is summoned at runtime by
// the UndeadSpawnDirector while the hero lingers in the dark, so this manager keeps one
// flat list of dynamic undead instead of streaming spawns per chunk.

// A skull that falls this far behind the hero has lost the hunt — remove it silently
// (it is far off-screen; the darkness will summon fresh ones anyway).
const DESPAWN_DISTANCE_TILES = 18;

export class EnemyManager {
  private readonly enemies: UndeadEnemy[] = [];

  public constructor(private readonly scene: Phaser.Scene) {}

  public spawnUndead(worldX: number, worldY: number): void {
    getSoundManager().playUndeadSpawn();
    this.enemies.push(new UndeadEnemy(this.scene, worldX, worldY));
  }

  public get aliveCount(): number {
    return this.enemies.reduce((sum, e) => sum + (e.isAlive ? 1 : 0), 0);
  }

  public getEnemyAt(worldX: number, worldY: number): EnemyBase | null {
    return this.enemies.find((e) => e.isAlive && e.worldX === worldX && e.worldY === worldY) ?? null;
  }

  public getAliveEnemies(): readonly EnemyBase[] {
    return this.enemies.filter((e) => e.isAlive);
  }

  /** Returns the enemy that landed a blow on the player this tick (null if none). */
  public update(
    delta: number,
    playerWorldX: number,
    playerWorldY: number,
    playerSafe: boolean,
    isBlocked: (wx: number, wy: number) => boolean,
  ): EnemyBase | null {
    let attacker: EnemyBase | null = null;

    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;

      const farX = Math.abs(enemy.worldX - playerWorldX);
      const farY = Math.abs(enemy.worldY - playerWorldY);
      if (Math.max(farX, farY) > DESPAWN_DISTANCE_TILES) {
        enemy.despawn();
        continue;
      }

      const blockedForEnemy = (wx: number, wy: number): boolean => {
        if (isBlocked(wx, wy)) return true;
        if (wx === playerWorldX && wy === playerWorldY) return true;
        return this.enemies.some((e) => e !== enemy && e.isAlive && e.worldX === wx && e.worldY === wy);
      };

      if (enemy.update(delta, playerWorldX, playerWorldY, playerSafe, blockedForEnemy)) {
        attacker ??= enemy;
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].pendingRemoval) {
        this.enemies[i].destroy();
        this.enemies.splice(i, 1);
      }
    }

    return attacker;
  }

  /** Fade every enemy out (e.g. to clear the field during a cut-scene). */
  public despawnAll(): void {
    for (const enemy of this.enemies) enemy.despawn();
  }

  public render(tileSize: number, camera: WorldCamera): void {
    for (const enemy of this.enemies) enemy.render(tileSize, camera);
  }

  public destroy(): void {
    for (const enemy of this.enemies) enemy.destroy();
    this.enemies.length = 0;
  }
}
