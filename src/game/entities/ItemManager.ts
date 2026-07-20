import type Phaser from 'phaser';

import type { WorldCamera } from '@/game/runtime/WorldCamera';
import { ItemPickup, type HeldItemKind, type ItemFire } from './ItemPickup';

export type CollectedItem = { kind: HeldItemKind; worldX: number; worldY: number; fire?: ItemFire };

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

  /**
   * Drop an item on the ground (a swap): it lands unarmed so it isn't re-collected instantly.
   * `fire` keeps a lit graveto BURNING where it lands (deposited into a robotic arm, or laid
   * down by the arm itself) — the flame rides the pickup and the fuel keeps counting down.
   */
  public drop(kind: HeldItemKind, worldX: number, worldY: number, fire?: ItemFire): void {
    this.items.push(new ItemPickup(this.scene, kind, worldX, worldY, true, fire));
  }

  public hasItemAt(x: number, y: number): boolean {
    return this.items.some((it) => !it.isCollected && it.tileX === x && it.tileY === y);
  }

  /** The kind lying on this tile (ignoring mid-fade spawns), or null. */
  public kindAt(x: number, y: number): HeldItemKind | null {
    const it = this.items.find((i) => i.isCollectable && !i.isCollected && i.tileX === x && i.tileY === y);
    return it ? it.kind : null;
  }

  /**
   * Lift an item off the ground without the hero touching it — the robotic arm's grab.
   * Returns the kind it took, or null if that tile was empty.
   *
   * Deliberately ignores `armed`: that flag exists so an item dropped UNDER the hero isn't
   * instantly re-collected by the hero, and the arm is not the hero. An item the player drops
   * onto an arm's input tile must be picked up on the spot — "put the item down and it moves"
   * is the whole interaction, and waiting for the player to step off would make the arm look
   * broken for one beat. It does respect `isCollectable`, so nothing gets snatched mid-fade-in.
   *
   * The pickup is destroyed rather than moved: ItemPickup's tile is readonly (its billboard and
   * its 8 rim copies are positioned once at construction), so the arm re-creates the item at the
   * far side via the normal drop() path instead of teaching pickups to slide.
   */
  public takeAt(x: number, y: number): { kind: HeldItemKind; fire?: ItemFire } | null {
    const idx = this.items.findIndex(
      (it) => it.isCollectable && !it.isCollected && it.tileX === x && it.tileY === y,
    );
    if (idx < 0) return null;
    const [taken] = this.items.splice(idx, 1);
    const result = { kind: taken.kind, fire: taken.fire };
    taken.destroy();
    return result;
  }

  /** Ground items currently on the map (for debug/playtest inspection). */
  public snapshot(): CollectedItem[] {
    return this.items
      .filter((it) => !it.isCollected)
      .map((it) => ({ kind: it.kind, worldX: it.tileX, worldY: it.tileY, fire: it.fire }));
  }

  /** Burn down every lit ground item's fuel (their flames die alone when it runs out). */
  public tickFires(deltaMs: number): void {
    for (const it of this.items) it.tickFire(deltaMs);
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
        collected = { kind: it.kind, worldX: it.tileX, worldY: it.tileY, fire: it.fire };
        it.collect();
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
