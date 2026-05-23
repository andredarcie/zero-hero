import Phaser from 'phaser';

import { NPC_VISUALS, SCENE_DEPTHS } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { NpcKind, NpcSpawn, ScreenContent } from '@/game/world/ScreenContent';
import { toScreenKey } from '@/game/world/ScreenContent';

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

  public render(tileSize: number, camera: WorldCamera): void {
    const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    this.sprite.setPosition(screen.x, screen.y).setDisplaySize(tileSize, tileSize);
  }

  public destroy(): void {
    this.sprite.destroy();
  }
}

export class NpcManager {
  private npcs: NpcEntity[] = [];
  private currentScreenKey = '';

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly contentByScreen: Map<string, ScreenContent>,
  ) {}

  public enterScreen(cx: number, cy: number): void {
    const key = toScreenKey(cx, cy);
    if (key === this.currentScreenKey) return;
    this.clearCurrent();
    this.currentScreenKey = key;
    const content = this.contentByScreen.get(key);
    if (!content) return;
    for (const spawn of content.npcs) {
      this.npcs.push(new NpcEntity(this.scene, spawn.worldX, spawn.worldY, spawn.type));
    }
  }

  public hasNpcAt(worldX: number, worldY: number): boolean {
    return this.npcs.some((n) => n.worldX === worldX && n.worldY === worldY);
  }

  public getKindAt(worldX: number, worldY: number): NpcKind | null {
    return this.npcs.find((n) => n.worldX === worldX && n.worldY === worldY)?.kind ?? null;
  }

  public getActiveWorldPositions(): ReadonlyArray<{ worldX: number; worldY: number }> {
    return this.npcs.map((n) => ({ worldX: n.worldX, worldY: n.worldY }));
  }

  public render(tileSize: number, camera: WorldCamera): void {
    for (const npc of this.npcs) npc.render(tileSize, camera);
  }

  public destroy(): void {
    this.clearCurrent();
  }

  private clearCurrent(): void {
    for (const npc of this.npcs) npc.destroy();
    this.npcs.length = 0;
  }
}
