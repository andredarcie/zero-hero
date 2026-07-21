import type Phaser from 'phaser';

import type { WorldCamera } from '@/game/runtime/WorldCamera';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { EnemyBase } from './EnemyBase';
import { DETECTION_RANGE, UndeadEnemy } from './enemies/UndeadEnemy';

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
    // The warning rumble as the ground starts to crack — playUndeadSpawn fires later, from
    // inside UndeadEnemy, when the telegraph ends and the skull actually claws out.
    getSoundManager().playGroundCrack();
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

  /** Debug/playtest readout: where every living skull is and which plate it is walking to. */
  public snapshot(): Array<{
    worldX: number;
    worldY: number;
    spawning: boolean;
    plateTarget: { x: number; y: number } | null;
  }> {
    return this.enemies
      .filter((e) => e.isAlive)
      .map((e) => ({
        worldX: e.worldX,
        worldY: e.worldY,
        spawning: e.isSpawning,
        plateTarget: e.plateTarget ? { x: e.plateTarget.x, y: e.plateTarget.y } : null,
      }));
  }

  /**
   * Hand out pressure-plate fixations: ONE skull per plate. Without the claim, every skull in
   * range would converge on the same plate and all but the winner would stand next to a taken
   * tile with a balloon over its head forever — which reads as broken, not as hungry.
   *
   * The assignment lives here rather than in the skull because it is the only place that can see
   * the other skulls. GameScene decides which plates are even offerable (see lurablePlates).
   */
  private assignPlateLures(plates: ReadonlyArray<{ worldX: number; worldY: number }>): void {
    const claimed = new Set<string>();
    const unclaimed: UndeadEnemy[] = [];

    // Pass 1 — HONOUR the fixations that already exist. A skull standing on its plate has to
    // keep it (re-assigning would walk it off and strobe the circuit), and a march already under
    // way must not be re-routed just because a fresher skull clawed out closer to the plate.
    for (const enemy of this.enemies) {
      if (!enemy.seeksPlates) {
        enemy.setPlateTarget(undefined);
        continue;
      }
      const target = enemy.plateTarget;
      const key = target ? `${target.x},${target.y}` : '';
      const stillOffered = target !== undefined
        && plates.some((p) => p.worldX === target.x && p.worldY === target.y);
      if (stillOffered && !claimed.has(key)) {
        claimed.add(key);
      } else {
        enemy.setPlateTarget(undefined);
        unclaimed.push(enemy);
      }
    }

    // Pass 2 — pair up what is left, closest pair first, so the nearest skull gets the nearest
    // plate instead of whichever happened to be first in the list.
    if (!unclaimed.length) return;
    const pairs: Array<{ enemy: UndeadEnemy; x: number; y: number; dist: number }> = [];
    for (const enemy of unclaimed) {
      for (const plate of plates) {
        if (claimed.has(`${plate.worldX},${plate.worldY}`)) continue;
        const dist = Math.abs(plate.worldX - enemy.worldX) + Math.abs(plate.worldY - enemy.worldY);
        if (dist > DETECTION_RANGE) continue; // out of sight is out of mind
        pairs.push({ enemy, x: plate.worldX, y: plate.worldY, dist });
      }
    }
    pairs.sort((a, b) => a.dist - b.dist);
    const fixated = new Set<UndeadEnemy>();
    for (const pair of pairs) {
      const key = `${pair.x},${pair.y}`;
      if (fixated.has(pair.enemy) || claimed.has(key)) continue;
      fixated.add(pair.enemy);
      claimed.add(key);
      pair.enemy.setPlateTarget({ x: pair.x, y: pair.y });
    }
  }

  /** Returns the enemy that landed a blow on the player this tick (null if none). */
  public update(
    delta: number,
    playerWorldX: number,
    playerWorldY: number,
    playerSafe: boolean,
    playerHasTorch: boolean,
    isBlocked: (wx: number, wy: number) => boolean,
    lurablePlates: ReadonlyArray<{ worldX: number; worldY: number }> = [],
  ): EnemyBase | null {
    let attacker: EnemyBase | null = null;

    // Before anybody moves: a skull's target for this tick has to be settled, or half the pack
    // would step using this frame's assignment and half using last frame's.
    this.assignPlateLures(lurablePlates);

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

      if (enemy.update(delta, playerWorldX, playerWorldY, playerSafe, playerHasTorch, blockedForEnemy)) {
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
