import Phaser from 'phaser';

import { NPC_VISUALS, SCENE_DEPTHS, ySortDepth } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { NpcKind, ScreenContent } from '@/game/world/ScreenContent';

// Tiny pixel-art "!" shown above an NPC whose current dialog the player hasn't heard yet.
// Core glyph only — a dark outline is added programmatically around every filled pixel.
const EXCLAIM_TEXTURE_KEY = 'npc-exclaim';
const EXCLAIM_GLYPH = [
  '.###.',
  '.###.',
  '.###.',
  '..#..',
  '.....',
  '.###.',
  '.###.',
];
const EXCLAIM_FILL = '#ffe066';
const EXCLAIM_OUTLINE = '#241d0f';

function ensureExclaimTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(EXCLAIM_TEXTURE_KEY)) return;
  const rows = EXCLAIM_GLYPH.length;
  const cols = EXCLAIM_GLYPH[0].length;
  // +1px border all around so the outline never clips at the texture edge.
  const canvas = scene.textures.createCanvas(EXCLAIM_TEXTURE_KEY, cols + 2, rows + 2);
  if (!canvas) return;
  const ctx = canvas.getContext();
  const filled = (x: number, y: number): boolean =>
    y >= 0 && y < rows && x >= 0 && x < cols && EXCLAIM_GLYPH[y][x] === '#';
  for (let y = -1; y <= rows; y++) {
    for (let x = -1; x <= cols; x++) {
      if (filled(x, y)) ctx.fillStyle = EXCLAIM_FILL;
      else if (
        filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)
      ) ctx.fillStyle = EXCLAIM_OUTLINE;
      else continue;
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  canvas.refresh();
  canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

class NpcEntity {
  public readonly worldX: number;
  public readonly worldY: number;
  public readonly kind: NpcKind;

  private readonly sprite: Phaser.GameObjects.Image;
  private readonly exclaim: Phaser.GameObjects.Image;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number, kind: NpcKind) {
    this.worldX = worldX;
    this.worldY = worldY;
    this.kind = kind;
    const visual = NPC_VISUALS[kind];
    this.sprite = scene.add
      .image(0, 0, visual.key, visual.frame)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.player - 1);
    ensureExclaimTexture(scene);
    this.exclaim = scene.add
      .image(0, 0, EXCLAIM_TEXTURE_KEY)
      .setOrigin(0.5, 1)
      .setVisible(false);
  }

  /** The sprite a firelight cast shadow mirrors (NPCs standing in a flame's glow throw shadows). */
  public get shadowCaster(): Phaser.GameObjects.Image {
    return this.sprite;
  }

  public render(tileSize: number, camera: WorldCamera, showExclaim: boolean, timeMs: number): void {
    const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    // Death looms at twice the size; keep its feet on the tile instead of floating.
    const scale = this.kind === 'death' ? 2 : 1;
    const size = tileSize * scale;
    const yOffset = (size - tileSize) / 2;
    this.sprite
      .setPosition(screen.x, screen.y - yOffset)
      .setDisplaySize(size, size)
      .setDepth(ySortDepth(this.worldY));
    this.exclaim.setVisible(showExclaim);
    if (showExclaim) {
      // Chunky pixel scaling (integer multiple of the source texels) + a gentle bob.
      const px = Math.max(1, Math.round(tileSize / 24));
      const bob = Math.round(Math.sin(timeMs / 280) * px);
      this.exclaim
        .setScale(px)
        .setPosition(screen.x, screen.y - yOffset - size / 2 - px * 2 + bob)
        .setDepth(ySortDepth(this.worldY) + 1);
    }
  }

  public destroy(): void {
    this.sprite.destroy();
    this.exclaim.destroy();
  }
}

export class NpcManager {
  // NPCs grouped by chunk, streamed in/out as the player roams the open world.
  private readonly byChunk = new Map<string, NpcEntity[]>();

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly getContent: (cx: number, cy: number) => ScreenContent,
    // Whether this NPC's current dialog is still unheard — drives the "!" marker above it.
    private readonly hasNewDialog: (kind: NpcKind, worldX: number, worldY: number) => boolean = () => false,
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
    const now = this.scene.time.now;
    for (const npc of this.all()) {
      npc.render(tileSize, camera, this.hasNewDialog(npc.kind, npc.worldX, npc.worldY), now);
    }
  }

  public destroy(): void {
    for (const list of this.byChunk.values()) {
      for (const npc of list) npc.destroy();
    }
    this.byChunk.clear();
  }
}
