import type Phaser from 'phaser';

import type { WorldCamera } from '@/game/runtime/WorldCamera';
import { ItemPickup, type HeldItemKind } from './ItemPickup';

export type CollectedItem = { kind: HeldItemKind; worldX: number; worldY: number };

// Owns every held item lying on the ground: the authored sword/key from world.json plus any
// item the hero drops when swapping. It never streams — items persist off-screen so a dropped
// sword stays where you left it — and it never permanently despawns; an item only leaves the
// ground when the hero collects it.
export class ItemManager {
  private items: ItemPickup[] = [];

  public constructor(private readonly scene: Phaser.Scene) {}

  public loadAuthored(list: ReadonlyArray<{ type: HeldItemKind; worldX: number; worldY: number }>): void {
    for (const p of list) {
      this.items.push(new ItemPickup(this.scene, p.type, p.worldX, p.worldY, false));
    }
  }

  /** Drop an item on the ground (a swap): it lands unarmed so it isn't re-collected instantly. */
  public drop(kind: HeldItemKind, worldX: number, worldY: number): void {
    this.items.push(new ItemPickup(this.scene, kind, worldX, worldY, true));
  }

  public hasItemAt(x: number, y: number): boolean {
    return this.items.some((it) => !it.isCollected && it.tileX === x && it.tileY === y);
  }

  /** Ground items currently on the map (for debug/playtest inspection). */
  public snapshot(): CollectedItem[] {
    return this.items
      .filter((it) => !it.isCollected)
      .map((it) => ({ kind: it.kind, worldX: it.tileX, worldY: it.tileY }));
  }

  /**
   * Arm any dropped item the hero has stepped off, then collect an armed item under the hero.
   * Returns the collected item (removed from the ground) or null.
   */
  public update(heroX: number, heroY: number): CollectedItem | null {
    for (const it of this.items) {
      if (!it.armed && (it.tileX !== heroX || it.tileY !== heroY)) it.armed = true;
    }

    let collected: CollectedItem | null = null;
    for (const it of this.items) {
      if (it.isCollectable && it.armed && !it.isCollected && it.tileX === heroX && it.tileY === heroY) {
        it.collect();
        collected = { kind: it.kind, worldX: it.tileX, worldY: it.tileY };
        break;
      }
    }

    if (collected) {
      this.items = this.items.filter((it) => {
        if (it.isCollected) { it.destroy(); return false; }
        return true;
      });
    }
    return collected;
  }

  public render(tileSize: number, camera: WorldCamera): void {
    for (const it of this.items) it.render(tileSize, camera);
  }

  public destroy(): void {
    for (const it of this.items) it.destroy();
    this.items = [];
  }
}
