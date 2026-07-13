import Phaser from 'phaser';

import { NPC_VISUALS } from '@/game/constants';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { NpcKind, ScreenContent } from '@/game/world/ScreenContent';

// Tiny pixel-art "!" shown above an NPC whose current dialog the player hasn't heard yet.
// Core glyph only — a dark outline is added programmatically around every filled pixel.
// Stays a Phaser overlay sprite: it is a UI marker, not a body in the world, and the
// projected tileToScreen keeps it glued above the 3D NPC.
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

  private readonly sprite: Billboard3D;
  private readonly exclaim: Phaser.GameObjects.Image;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number, kind: NpcKind) {
    this.worldX = worldX;
    this.worldY = worldY;
    this.kind = kind;
    const visual = NPC_VISUALS[kind];
    // Death looms at twice the size; the billboard anchors at the feet either way.
    const size = kind === 'death' ? 2 : 1;
    this.sprite = world3d()
      .addBillboard(visual.key, visual.frame ?? 0, { groundShadow: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(size, size);
    ensureExclaimTexture(scene);
    this.exclaim = scene.add
      .image(0, 0, EXCLAIM_TEXTURE_KEY)
      .setOrigin(0.5, 1)
      .setVisible(false);
  }

  public render(tileSize: number, camera: WorldCamera, showExclaim: boolean, timeMs: number): void {
    this.exclaim.setVisible(showExclaim);
    if (showExclaim) {
      const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
      // Chunky pixel scaling (integer multiple of the source texels) + a gentle bob.
      const px = Math.max(1, Math.round(tileSize / 24));
      const bob = Math.round(Math.sin(timeMs / 280) * px);
      const height = this.kind === 'death' ? 2 : 1;
      this.exclaim
        .setScale(px)
        .setPosition(screen.x, screen.y - tileSize * height - px * 2 + bob);
    }
  }

  public hideExclaim(): void {
    this.exclaim.setVisible(false);
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

  public render(tileSize: number, camera: WorldCamera): void {
    const now = this.scene.time.now;
    for (const npc of this.all()) {
      npc.render(tileSize, camera, this.hasNewDialog(npc.kind, npc.worldX, npc.worldY), now);
    }
  }

  /**
   * Drop every "!" marker. The markers are Phaser overlay sprites, so they do NOT sink with
   * the world when the death fade darkens the 3D canvas — and render() stops running once the
   * hero is dead, which would otherwise leave one hanging over the black.
   */
  public hideExclaims(): void {
    for (const npc of this.all()) npc.hideExclaim();
  }

  public destroy(): void {
    for (const list of this.byChunk.values()) {
      for (const npc of list) npc.destroy();
    }
    this.byChunk.clear();
  }
}
