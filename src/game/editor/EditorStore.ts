import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import { DIALOG_VOICES, NPC_DIALOGS } from '@/game/dialogs/NpcDialogs';
import type { EnemyKind, NpcKind, PickupKind } from '@/game/world/ScreenContent';
import type { PropDir, PropKind, WorldChunk, WorldData, WorldDialog } from '@/game/world/worldSchema';

// Ground frame used for cells that never received paint — the same frame the runtime uses
// for the void outside the world, so "empty" reads consistently in game and editor.
export const DEFAULT_GROUND_TILE = 5;

const UNDO_LIMIT = 200;
const MAX_WORLD_CHUNKS = 32;

export type TileLayerId = 'ground' | 'upper';
export type CellLayerId = 'ground' | 'upper' | 'collision';
export type CellValue = number | boolean | null;

export type CellChange = { wx: number; wy: number; layer: CellLayerId; prev: CellValue; next: CellValue };

export type PlacedEntity =
  | { list: 'enemies'; type: EnemyKind; worldX: number; worldY: number }
  | { list: 'npcs'; type: NpcKind; worldX: number; worldY: number }
  | { list: 'pickups'; type: PickupKind; worldX: number; worldY: number }
  // `dir` so o braco robotico usa. Ele viaja em TODO o caminho de place/erase/undo porque, ao
  // contrario de `lit` e `floodgate` (que a gente deixa cair de proposito num save do editor),
  // a direcao E o comportamento da peca: perde-la nao empobrece o prop, quebra ele.
  | { list: 'props'; type: PropKind; worldX: number; worldY: number; dir?: PropDir };

export type EntityListId = PlacedEntity['list'];

type Op =
  | { kind: 'cells'; changes: CellChange[] }
  | { kind: 'entities'; added: PlacedEntity[]; removed: PlacedEntity[] }
  | { kind: 'spawn'; prev: { worldX: number; worldY: number }; next: { worldX: number; worldY: number } }
  | { kind: 'dialog'; npc: NpcKind; prev: WorldDialog | undefined; next: WorldDialog | undefined };

// What changed in one notification — consumers refresh only the affected visuals. `cells`
// carries coordinates; readers should re-read current values from the store (works for
// undo/redo without duplicating value bookkeeping).
export type StoreChange = {
  cells?: Array<{ wx: number; wy: number }>;
  entities?: boolean;
  spawn?: boolean;
  dialogs?: boolean;
  structure?: boolean;
  meta?: boolean;
};

type Listener = (change: StoreChange) => void;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const chunkKey = (cx: number, cy: number): string => `${cx},${cy}`;

// A direcao PRECISA entrar nesta comparacao. placeEntity trata "ja tem isso aqui" como um
// no-op, e sem o `dir` girar um braco no proprio tile seria exatamente isso: o editor
// concluiria que nada mudou e o giro nao aconteceria.
const sameEntity = (a: PlacedEntity, b: PlacedEntity): boolean =>
  a.list === b.list && a.type === b.type && a.worldX === b.worldX && a.worldY === b.worldY
  && (a.list !== 'props' || b.list !== 'props' || a.dir === b.dir);

const buildEmptyChunk = (cx: number, cy: number): WorldChunk => ({
  cx,
  cy,
  ground: Array.from({ length: CHUNK_ROWS }, () => Array.from({ length: CHUNK_COLUMNS }, () => DEFAULT_GROUND_TILE)),
  upper: Array.from({ length: CHUNK_ROWS }, () => Array.from({ length: CHUNK_COLUMNS }, () => null as number | null)),
  collisions: Array.from({ length: CHUNK_ROWS }, () => Array.from({ length: CHUNK_COLUMNS }, () => false)),
  enemies: [],
  pickups: [],
  npcs: [],
});

export class EditorStore {
  public readonly world: WorldData;
  public dirty = false;

  private chunkIndex = new Map<string, WorldChunk>();
  private readonly listeners = new Set<Listener>();
  private undoStack: Op[][] = [];
  private redoStack: Op[][] = [];
  // While a stroke is open, cell changes coalesce per-cell and entity ops accumulate, so
  // one drag (or one fill) undoes as a single gesture.
  private strokeOps: Op[] | null = null;
  private strokeCells: Map<string, CellChange> | null = null;

  public constructor(world: WorldData) {
    this.world = world;
    this.rebuildIndex();
  }

  // ── Subscription ────────────────────────────────────────────────────────

  public listen(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(change: StoreChange): void {
    this.listeners.forEach((listener) => listener(change));
  }

  private markDirty(): void {
    if (!this.dirty) {
      this.dirty = true;
      this.emit({ meta: true });
    }
  }

  public markSaved(): void {
    this.dirty = false;
    this.emit({ meta: true });
  }

  // ── Geometry ────────────────────────────────────────────────────────────

  public get tilesX(): number {
    return this.world.meta.worldChunksX * CHUNK_COLUMNS;
  }

  public get tilesY(): number {
    return this.world.meta.worldChunksY * CHUNK_ROWS;
  }

  public isInside(wx: number, wy: number): boolean {
    return wx >= 0 && wy >= 0 && wx < this.tilesX && wy < this.tilesY;
  }

  private chunkAt(wx: number, wy: number): WorldChunk | undefined {
    return this.chunkIndex.get(chunkKey(Math.floor(wx / CHUNK_COLUMNS), Math.floor(wy / CHUNK_ROWS)));
  }

  private rebuildIndex(): void {
    this.chunkIndex = new Map(this.world.chunks.map((chunk) => [chunkKey(chunk.cx, chunk.cy), chunk]));
  }

  // ── Cells ───────────────────────────────────────────────────────────────

  public readCell(layer: CellLayerId, wx: number, wy: number): CellValue {
    const chunk = this.chunkAt(wx, wy);
    if (!chunk) return layer === 'collision' ? false : layer === 'upper' ? null : DEFAULT_GROUND_TILE;
    const lx = wx - chunk.cx * CHUNK_COLUMNS;
    const ly = wy - chunk.cy * CHUNK_ROWS;
    if (layer === 'ground') return chunk.ground[ly][lx];
    if (layer === 'upper') return chunk.upper[ly][lx];
    return chunk.collisions[ly][lx];
  }

  private writeCell(layer: CellLayerId, wx: number, wy: number, value: CellValue): void {
    const chunk = this.chunkAt(wx, wy);
    if (!chunk) return;
    const lx = wx - chunk.cx * CHUNK_COLUMNS;
    const ly = wy - chunk.cy * CHUNK_ROWS;
    if (layer === 'ground') chunk.ground[ly][lx] = value as number;
    else if (layer === 'upper') chunk.upper[ly][lx] = value as number | null;
    else chunk.collisions[ly][lx] = value as boolean;
  }

  public setCell(layer: CellLayerId, wx: number, wy: number, next: CellValue): void {
    if (!this.isInside(wx, wy)) return;
    const prev = this.readCell(layer, wx, wy);
    if (prev === next) return;
    this.writeCell(layer, wx, wy, next);

    if (this.strokeCells) {
      const key = `${wx},${wy},${layer}`;
      const existing = this.strokeCells.get(key);
      if (existing) existing.next = next;
      else this.strokeCells.set(key, { wx, wy, layer, prev, next });
    } else {
      this.pushUndo([{ kind: 'cells', changes: [{ wx, wy, layer, prev, next }] }]);
    }

    this.markDirty();
    this.emit({ cells: [{ wx, wy }] });
  }

  /**
   * Flood fill on a tile layer; returns the filled cells so callers can post-process them.
   * `bounds` (inclusive) confines the fill, e.g. to the selected chunk in chunk view.
   */
  public floodFill(
    layer: TileLayerId,
    wx: number,
    wy: number,
    next: number | null,
    bounds?: { x0: number; y0: number; x1: number; y1: number },
  ): Array<{ wx: number; wy: number }> {
    const inArea = (x: number, y: number): boolean =>
      this.isInside(x, y) && (!bounds || (x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1));
    if (!inArea(wx, wy)) return [];
    const target = this.readCell(layer, wx, wy);
    if (target === next) return [];

    const filled: Array<{ wx: number; wy: number }> = [];
    const queue: Array<{ wx: number; wy: number }> = [{ wx, wy }];
    const seen = new Set<string>([`${wx},${wy}`]);

    while (queue.length > 0) {
      const cell = queue.pop()!;
      if (this.readCell(layer, cell.wx, cell.wy) !== target) continue;
      this.setCell(layer, cell.wx, cell.wy, next);
      filled.push(cell);
      const neighbors = [
        { wx: cell.wx + 1, wy: cell.wy },
        { wx: cell.wx - 1, wy: cell.wy },
        { wx: cell.wx, wy: cell.wy + 1 },
        { wx: cell.wx, wy: cell.wy - 1 },
      ];
      for (const n of neighbors) {
        const key = `${n.wx},${n.wy}`;
        if (!seen.has(key) && inArea(n.wx, n.wy)) {
          seen.add(key);
          queue.push(n);
        }
      }
    }
    return filled;
  }

  // ── Strokes (one user gesture = one undo entry) ─────────────────────────

  public beginStroke(): void {
    if (this.strokeOps) this.commitStroke();
    this.strokeOps = [];
    this.strokeCells = new Map();
  }

  public commitStroke(): void {
    const ops = this.strokeOps ?? [];
    if (this.strokeCells && this.strokeCells.size > 0) {
      ops.push({ kind: 'cells', changes: [...this.strokeCells.values()] });
    }
    this.strokeOps = null;
    this.strokeCells = null;
    if (ops.length > 0) this.pushUndo(ops);
  }

  private recordOp(op: Op): void {
    if (this.strokeOps) this.strokeOps.push(op);
    else this.pushUndo([op]);
  }

  private pushUndo(ops: Op[]): void {
    this.undoStack.push(ops);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.emit({ meta: true });
  }

  // ── Entities ────────────────────────────────────────────────────────────

  public entitiesAt(wx: number, wy: number): PlacedEntity[] {
    const found: PlacedEntity[] = [];
    const chunk = this.chunkAt(wx, wy);
    if (chunk) {
      chunk.enemies.forEach((e) => { if (e.worldX === wx && e.worldY === wy) found.push({ list: 'enemies', ...e }); });
      chunk.npcs.forEach((n) => { if (n.worldX === wx && n.worldY === wy) found.push({ list: 'npcs', ...n }); });
      chunk.pickups.forEach((p) => { if (p.worldX === wx && p.worldY === wy) found.push({ list: 'pickups', ...p }); });
    }
    this.world.props.forEach((p) => {
      if (p.worldX === wx && p.worldY === wy) found.push({ list: 'props', type: p.type, worldX: p.worldX, worldY: p.worldY, dir: p.dir });
    });
    return found;
  }

  public allEntities(): PlacedEntity[] {
    const all: PlacedEntity[] = [];
    this.world.chunks.forEach((chunk) => {
      chunk.enemies.forEach((e) => all.push({ list: 'enemies', ...e }));
      chunk.npcs.forEach((n) => all.push({ list: 'npcs', ...n }));
      chunk.pickups.forEach((p) => all.push({ list: 'pickups', ...p }));
    });
    this.world.props.forEach((p) => all.push({ list: 'props', type: p.type, worldX: p.worldX, worldY: p.worldY, dir: p.dir }));
    return all;
  }

  public placeEntity(entity: PlacedEntity): void {
    if (!this.isInside(entity.worldX, entity.worldY)) return;
    const removed = this.entitiesAt(entity.worldX, entity.worldY).filter((e) => e.list === entity.list);
    if (removed.length === 1 && sameEntity(removed[0], entity)) return;

    removed.forEach((e) => this.removeEntityFromWorld(e));
    this.addEntityToWorld(entity);
    this.recordOp({ kind: 'entities', added: [entity], removed });
    this.markDirty();
    this.emit({ entities: true });
  }

  public eraseEntitiesAt(wx: number, wy: number): boolean {
    const removed = this.entitiesAt(wx, wy);
    if (removed.length === 0) return false;
    removed.forEach((e) => this.removeEntityFromWorld(e));
    this.recordOp({ kind: 'entities', added: [], removed });
    this.markDirty();
    this.emit({ entities: true });
    return true;
  }

  private addEntityToWorld(entity: PlacedEntity): void {
    if (entity.list === 'props') {
      this.world.props.push({ type: entity.type, worldX: entity.worldX, worldY: entity.worldY, ...(entity.dir === undefined ? {} : { dir: entity.dir }) });
      return;
    }
    const chunk = this.chunkAt(entity.worldX, entity.worldY);
    if (!chunk) return;
    if (entity.list === 'enemies') chunk.enemies.push({ type: entity.type, worldX: entity.worldX, worldY: entity.worldY });
    else if (entity.list === 'npcs') chunk.npcs.push({ type: entity.type, worldX: entity.worldX, worldY: entity.worldY });
    else chunk.pickups.push({ type: entity.type, worldX: entity.worldX, worldY: entity.worldY });
  }

  private removeEntityFromWorld(entity: PlacedEntity): void {
    if (entity.list === 'props') {
      const index = this.world.props.findIndex((p) => p.type === entity.type && p.worldX === entity.worldX && p.worldY === entity.worldY);
      if (index >= 0) this.world.props.splice(index, 1);
      return;
    }
    const chunk = this.chunkAt(entity.worldX, entity.worldY);
    if (!chunk) return;
    const list = chunk[entity.list] as Array<{ type: string; worldX: number; worldY: number }>;
    const index = list.findIndex((e) => e.type === entity.type && e.worldX === entity.worldX && e.worldY === entity.worldY);
    if (index >= 0) list.splice(index, 1);
  }

  // ── Spawn ───────────────────────────────────────────────────────────────

  public get spawn(): { worldX: number; worldY: number } {
    return this.world.meta.playerStart;
  }

  public setSpawn(wx: number, wy: number): void {
    if (!this.isInside(wx, wy)) return;
    const prev = { ...this.world.meta.playerStart };
    if (prev.worldX === wx && prev.worldY === wy) return;
    this.world.meta.playerStart = { worldX: wx, worldY: wy };
    this.recordOp({ kind: 'spawn', prev, next: { worldX: wx, worldY: wy } });
    this.markDirty();
    this.emit({ spawn: true });
  }

  // ── Dialogs ─────────────────────────────────────────────────────────────

  /** Current dialog for the NPC, or a fresh editable template built from the code defaults. */
  public getDialog(kind: NpcKind): WorldDialog {
    const existing = this.world.dialogs[kind];
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
    const prev = this.world.dialogs[kind] ? clone(this.world.dialogs[kind]) : undefined;
    this.world.dialogs[kind] = clone(next);
    this.recordOp({ kind: 'dialog', npc: kind, prev, next: clone(next) });
    this.markDirty();
    this.emit({ dialogs: true });
  }

  // ── World meta ──────────────────────────────────────────────────────────

  public renameWorld(name: string): void {
    const trimmed = name.trim();
    if (!trimmed || trimmed === this.world.meta.name) return;
    this.world.meta.name = trimmed;
    this.markDirty();
    this.emit({ meta: true });
  }

  /** Grows/shrinks the chunk grid. Destructive at the edges, so it clears the undo history. */
  public resizeWorld(chunksX: number, chunksY: number): void {
    const nx = Math.max(1, Math.min(MAX_WORLD_CHUNKS, Math.floor(chunksX)));
    const ny = Math.max(1, Math.min(MAX_WORLD_CHUNKS, Math.floor(chunksY)));
    if (nx === this.world.meta.worldChunksX && ny === this.world.meta.worldChunksY) return;

    const chunks: WorldChunk[] = [];
    for (let cy = 0; cy < ny; cy += 1) {
      for (let cx = 0; cx < nx; cx += 1) {
        chunks.push(this.chunkIndex.get(chunkKey(cx, cy)) ?? buildEmptyChunk(cx, cy));
      }
    }
    this.world.chunks = chunks;
    this.world.meta.worldChunksX = nx;
    this.world.meta.worldChunksY = ny;
    this.rebuildIndex();

    this.world.props = this.world.props.filter((p) => this.isInside(p.worldX, p.worldY));
    const start = this.world.meta.playerStart;
    this.world.meta.playerStart = {
      worldX: Math.max(0, Math.min(this.tilesX - 1, start.worldX)),
      worldY: Math.max(0, Math.min(this.tilesY - 1, start.worldY)),
    };

    this.undoStack = [];
    this.redoStack = [];
    this.markDirty();
    this.emit({ structure: true, entities: true, spawn: true, meta: true });
  }

  // ── Undo / redo ─────────────────────────────────────────────────────────

  public get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public undo(): boolean {
    const ops = this.undoStack.pop();
    if (!ops) return false;
    for (let i = ops.length - 1; i >= 0; i -= 1) this.applyOp(ops[i], false);
    this.redoStack.push(ops);
    this.dirty = true;
    this.emit(this.describeOps(ops));
    return true;
  }

  public redo(): boolean {
    const ops = this.redoStack.pop();
    if (!ops) return false;
    ops.forEach((op) => this.applyOp(op, true));
    this.undoStack.push(ops);
    this.dirty = true;
    this.emit(this.describeOps(ops));
    return true;
  }

  private applyOp(op: Op, forward: boolean): void {
    if (op.kind === 'cells') {
      op.changes.forEach((c) => this.writeCell(c.layer, c.wx, c.wy, forward ? c.next : c.prev));
    } else if (op.kind === 'entities') {
      const toRemove = forward ? op.removed : op.added;
      const toAdd = forward ? op.added : op.removed;
      toRemove.forEach((e) => this.removeEntityFromWorld(e));
      toAdd.forEach((e) => this.addEntityToWorld(e));
    } else if (op.kind === 'spawn') {
      this.world.meta.playerStart = { ...(forward ? op.next : op.prev) };
    } else {
      const dialog = forward ? op.next : op.prev;
      if (dialog) this.world.dialogs[op.npc] = clone(dialog);
      else delete this.world.dialogs[op.npc];
    }
  }

  private describeOps(ops: Op[]): StoreChange {
    const change: StoreChange = { meta: true };
    ops.forEach((op) => {
      if (op.kind === 'cells') {
        change.cells = (change.cells ?? []).concat(op.changes.map((c) => ({ wx: c.wx, wy: c.wy })));
      } else if (op.kind === 'entities') change.entities = true;
      else if (op.kind === 'spawn') change.spawn = true;
      else change.dialogs = true;
    });
    return change;
  }

  // ── Validation / stats ──────────────────────────────────────────────────

  public validate(): string[] {
    const warnings: string[] = [];
    const start = this.world.meta.playerStart;
    if (!this.isInside(start.worldX, start.worldY)) {
      warnings.push('Spawn do jogador fora do mundo');
    } else if (this.readCell('collision', start.worldX, start.worldY) === true) {
      warnings.push('Spawn do jogador em cima de colisao');
    }

    let onCollision = 0;
    let legacyEnemies = 0;
    this.allEntities().forEach((entity) => {
      if (this.readCell('collision', entity.worldX, entity.worldY) === true) onCollision += 1;
      if (entity.list === 'enemies') legacyEnemies += 1;
    });
    if (onCollision > 0) warnings.push(`${onCollision} entidade(s) em cima de colisao`);
    // Enemies are no longer authored (skulls spawn dynamically in the dark); anything left
    // in the file is legacy data the runtime ignores — flag it so the author can erase it.
    if (legacyEnemies > 0) warnings.push(`${legacyEnemies} inimigo(s) legado(s) no arquivo — o jogo ignora inimigos colocados; use a borracha para remover`);
    return warnings;
  }

  public stats(): { npcs: number; pickups: number; props: number } {
    const all = this.allEntities();
    return {
      npcs: all.filter((e) => e.list === 'npcs').length,
      pickups: all.filter((e) => e.list === 'pickups').length,
      props: all.filter((e) => e.list === 'props').length,
    };
  }

  /** Deep clone of the world, e.g. to hand to the game runtime for a live playtest. */
  public snapshotWorld(): WorldData {
    return clone(this.world);
  }
}
