import Phaser from 'phaser';

import { NPC_VISUALS, SCENE_DEPTHS, ySortDepth } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { NpcKind, ScreenContent } from '@/game/world/ScreenContent';

class NpcEntity {
  public readonly worldX: number;
  public readonly worldY: number;
  public readonly kind: NpcKind;

  private readonly sprite: Phaser.GameObjects.Image;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number, kind: NpcKind) {
    this.worldX = worldX;
    this.worldY = worldY;
    this.kind = kind;
    const visual = NPC_VISUALS[kind];
    this.sprite = scene.add
      .image(0, 0, visual.key, visual.frame)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.player - 1);
  }

  /** The sprite a firelight cast shadow mirrors (NPCs standing in a flame's glow throw shadows). */
  public get shadowCaster(): Phaser.GameObjects.Image {
    return this.sprite;
  }

  public render(tileSize: number, camera: WorldCamera): void {
    const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    // Death looms at twice the size; keep its feet on the tile instead of floating.
    const scale = this.kind === 'death' ? 2 : 1;
    const size = tileSize * scale;
    const yOffset = (size - tileSize) / 2;
    this.sprite
      .setPosition(screen.x, screen.y - yOffset)
      .setDisplaySize(size, size)
      .setDepth(ySortDepth(this.worldY));
  }

  public destroy(): void {
    this.sprite.destroy();
  }
}

export class NpcManager {
  // NPCs grouped by chunk, streamed in/out as the player roams the open world.
  private readonly byChunk = new Map<string, NpcEntity[]>();

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly getContent: (cx: number, cy: number) => ScreenContent,
  ) {}

  public syncChunks(active: Set<string>): void {
    for (const [key, list] of this.byChunk) {
      if (active.has(key)) continue;
      for (const npc of list) npc.destroy();
      this.byChunk.delete(key);
    }
    for (const key of active) {
      if (this.byChunk.has(key)) continue;
      const [cx, cy] = key.split(',').map(Number);
      const list = this.getContent(cx, cy).npcs.map(
        (spawn) => new NpcEntity(this.scene, spawn.worldX, spawn.worldY, spawn.type),
      );
      this.byChunk.set(key, list);
    }
  }

  private all(): NpcEntity[] {
    const out: NpcEntity[] = [];
    for (const list of this.byChunk.values()) out.push(...list);
    return out;
  }

  public hasNpcAt(worldX: number, worldY: number): boolean {
    return this.all().some((n) => n.worldX === worldX && n.worldY === worldY);
  }

  public getKindAt(worldX: number, worldY: number): NpcKind | null {
    return this.all().find((n) => n.worldX === worldX && n.worldY === worldY)?.kind ?? null;
  }

  public getActiveWorldPositions(): ReadonlyArray<{ worldX: number; worldY: number }> {
    return this.all().map((n) => ({ worldX: n.worldX, worldY: n.worldY }));
  }

  public getShadowCasters(): Array<{ sprite: Phaser.GameObjects.Image; worldX: number; worldY: number }> {
    return this.all().map((n) => ({ sprite: n.shadowCaster, worldX: n.worldX, worldY: n.worldY }));
  }

  public render(tileSize: number, camera: WorldCamera): void {
    for (const npc of this.all()) npc.render(tileSize, camera);
  }

  public destroy(): void {
    for (const list of this.byChunk.values()) {
      for (const npc of list) npc.destroy();
    }
    this.byChunk.clear();
  }
}
