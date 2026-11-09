// O MUNDO EM SI, NO EDITOR: o nome, o tamanho (crescer ou cortar a grade), o ponto de partida do herói e as falas dos
// NPCs — pelo histórico, como o resto.

import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import { DIALOG_VOICES, NPC_DIALOGS } from '@/game/dialogs/NpcDialogs';
import type { NpcKind } from '@/game/world/ScreenContent';
import type { WorldChunk, WorldDialog } from '@/game/world/worldSchema';
import { clone } from './EditorHistory';
import type { EditorStore } from './EditorStore';

// Ground frame used for cells that never received paint — the same frame the runtime uses
// for the void outside the world, so "empty" reads consistently in game and editor.
export const DEFAULT_GROUND_TILE = 5;
const MAX_WORLD_CHUNKS = 32;
export const chunkKey = (cx: number, cy: number): string => `${cx},${cy}`;
const buildEmptyChunk = (cx: number, cy: number): WorldChunk => ({
  cx,
  cy,
  ground: Array.from({ length: CHUNK_ROWS }, () => Array.from({ length: CHUNK_COLUMNS }, () => DEFAULT_GROUND_TILE)),
  upper: Array.from({ length: CHUNK_ROWS }, () => Array.from({ length: CHUNK_COLUMNS }, () => null as number | null)),
  collisions: Array.from({ length: CHUNK_ROWS }, () => Array.from({ length: CHUNK_COLUMNS }, () => false)),
  pickups: [],
  npcs: [],
});

/** O que EditorWorldMeta usa de EditorStore. */
export type EditorWorldMetaHost = Pick<EditorStore,
  'chunkIndex' | 'emit' | 'history' | 'isInside' | 'markDirty' | 'rebuildIndex' | 'tilesX' | 'tilesY' | 'world'
>;

export class EditorWorldMeta {
  public constructor(private readonly host: EditorWorldMetaHost) {}

  public setSpawn(wx: number, wy: number): void {
    if (!this.host.isInside(wx, wy)) return;
    const prev = { ...this.host.world.meta.playerStart };
    if (prev.worldX === wx && prev.worldY === wy) return;
    this.host.world.meta.playerStart = { worldX: wx, worldY: wy };
    this.host.history.recordOp({ kind: 'spawn', prev, next: { worldX: wx, worldY: wy } });
    this.host.markDirty();
    this.host.emit({ spawn: true });
  }

  /** Current dialog for the NPC, or a fresh editable template built from the code defaults. */
  public getDialog(kind: NpcKind): WorldDialog {
    const existing = this.host.world.dialogs[kind];
    if (existing) return clone(existing);
    const script = NPC_DIALOGS[kind];
    return {
      npcName: script.npcName,
      npcColorHex: script.npcColorHex,
      npcAssetKey: script.npcAssetKey,
      npcFrame: script.npcFrame,
      voice: { ...DIALOG_VOICES[kind] },
      lines: clone(script.lines),
    };
  }

  public setDialog(kind: NpcKind, next: WorldDialog): void {
    const prev = this.host.world.dialogs[kind] ? clone(this.host.world.dialogs[kind]) : undefined;
    this.host.world.dialogs[kind] = clone(next);
    this.host.history.recordOp({ kind: 'dialog', npc: kind, prev, next: clone(next) });
    this.host.markDirty();
    this.host.emit({ dialogs: true });
  }

  public renameWorld(name: string): void {
    const trimmed = name.trim();
    if (!trimmed || trimmed === this.host.world.meta.name) return;
    this.host.world.meta.name = trimmed;
    this.host.markDirty();
    this.host.emit({ meta: true });
  }

  /** Grows/shrinks the chunk grid. Destructive at the edges, so it clears the undo history. */
  public resizeWorld(chunksX: number, chunksY: number): void {
    const nx = Math.max(1, Math.min(MAX_WORLD_CHUNKS, Math.floor(chunksX)));
    const ny = Math.max(1, Math.min(MAX_WORLD_CHUNKS, Math.floor(chunksY)));
    if (nx === this.host.world.meta.worldChunksX && ny === this.host.world.meta.worldChunksY) return;

    const chunks: WorldChunk[] = [];
    for (let cy = 0; cy < ny; cy += 1) {
      for (let cx = 0; cx < nx; cx += 1) {
        chunks.push(this.host.chunkIndex.get(chunkKey(cx, cy)) ?? buildEmptyChunk(cx, cy));
      }
    }
    this.host.world.chunks = chunks;
    this.host.world.meta.worldChunksX = nx;
    this.host.world.meta.worldChunksY = ny;
    this.host.rebuildIndex();

    this.host.world.props = this.host.world.props.filter((p) => this.host.isInside(p.worldX, p.worldY));
    const start = this.host.world.meta.playerStart;
    this.host.world.meta.playerStart = {
      worldX: Math.max(0, Math.min(this.host.tilesX - 1, start.worldX)),
      worldY: Math.max(0, Math.min(this.host.tilesY - 1, start.worldY)),
    };

    this.host.history.undoStack = [];
    this.host.history.redoStack = [];
    this.host.markDirty();
    this.host.emit({ structure: true, entities: true, spawn: true, meta: true });
  }
}
