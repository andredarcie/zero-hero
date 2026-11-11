import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';

import type { WorldChunk, WorldData } from '@/game/world/worldSchema';
import { EditorHistory, type CellLayerId, type CellValue, type PlacedEntity, type StoreChange, clone } from './EditorHistory';
import { EditorEntities } from './EditorEntities';
import { EditorChecks } from './EditorChecks';
import { EditorWorldMeta, DEFAULT_GROUND_TILE, chunkKey } from './EditorWorldMeta';
export { DEFAULT_GROUND_TILE } from './EditorWorldMeta';
export type { CellLayerId, CellValue, CellChange, PlacedEntity, StoreChange } from './EditorHistory';

export type TileLayerId = 'ground' | 'upper';

export type EntityListId = PlacedEntity['list'];

type Listener = (change: StoreChange) => void;

export class EditorStore {
  public readonly world: WorldData;
  public dirty = false;

  public chunkIndex = new Map<string, WorldChunk>();
  private readonly listeners = new Set<Listener>();
  /** Desfazer e refazer (ver EditorHistory). */
  // (Os tipos vão escritos: cada parte pede ao armazém as outras, e a inferência daria voltas.)
  public readonly history: EditorHistory = new EditorHistory(this);
  /** As peças do mapa (ver EditorEntities). */
  public readonly entities: EditorEntities = new EditorEntities(this);
  /** A validação e os números (ver EditorChecks). */
  public readonly checks: EditorChecks = new EditorChecks(this);
  /** O nome, o tamanho, o começo e as falas (ver EditorWorldMeta). */
  public readonly meta: EditorWorldMeta = new EditorWorldMeta(this);

  public constructor(world: WorldData) {
    this.world = world;
    // Every authored level owns exactly one start point. Older or hand-edited files may be
    // missing it; repair those into a visible centre marker and leave the store dirty so the
    // author explicitly persists the repair on the next save.
    const rawStart = this.world.meta.playerStart as { worldX?: unknown; worldY?: unknown } | undefined;
    const startIsValid = rawStart
      && Number.isInteger(rawStart.worldX)
      && Number.isInteger(rawStart.worldY)
      && Number(rawStart.worldX) >= 0
      && Number(rawStart.worldY) >= 0
      && Number(rawStart.worldX) < this.world.meta.worldChunksX * CHUNK_COLUMNS
      && Number(rawStart.worldY) < this.world.meta.worldChunksY * CHUNK_ROWS;
    if (!startIsValid) {
      this.world.meta.playerStart = {
        worldX: Math.floor((this.world.meta.worldChunksX * CHUNK_COLUMNS) / 2),
        worldY: Math.floor((this.world.meta.worldChunksY * CHUNK_ROWS) / 2),
      };
      this.dirty = true;
    }
    this.rebuildIndex();
  }

  // ── Subscription ────────────────────────────────────────────────────────

  public listen(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public emit(change: StoreChange): void {
    this.listeners.forEach((listener) => listener(change));
  }

  public markDirty(): void {
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

  public chunkAt(wx: number, wy: number): WorldChunk | undefined {
    return this.chunkIndex.get(chunkKey(Math.floor(wx / CHUNK_COLUMNS), Math.floor(wy / CHUNK_ROWS)));
  }

  public rebuildIndex(): void {
    this.chunkIndex = new Map(this.world.chunks.map((chunk) => [chunkKey(chunk.cx, chunk.cy), chunk]));
  }

  // ── Cells ───────────────────────────────────────────────────────────────

  public readCell(layer: CellLayerId, wx: number, wy: number): CellValue {
    const chunk = this.chunkAt(wx, wy);
    if (!chunk) {
      if (layer === 'relief' || layer === 'soil') return 0;
      return layer === 'collision' ? false : layer === 'upper' ? null : DEFAULT_GROUND_TILE;
    }
    const lx = wx - chunk.cx * CHUNK_COLUMNS;
    const ly = wy - chunk.cy * CHUNK_ROWS;
    if (layer === 'ground') return chunk.ground[ly][lx];
    if (layer === 'upper') return chunk.upper[ly][lx];
    if (layer === 'relief' || layer === 'soil') return chunk[layer]?.[ly]?.[lx] ?? 0;
    return chunk.collisions[ly][lx];
  }

  public writeCell(layer: CellLayerId, wx: number, wy: number, value: CellValue): void {
    const chunk = this.chunkAt(wx, wy);
    if (!chunk) return;
    const lx = wx - chunk.cx * CHUNK_COLUMNS;
    const ly = wy - chunk.cy * CHUNK_ROWS;
    if (layer === 'ground') chunk.ground[ly][lx] = value as number;
    else if (layer === 'upper') chunk.upper[ly][lx] = value as number | null;
    else if (layer === 'relief' || layer === 'soil') this.writeOptionalGrid(chunk, layer, lx, ly, value as number);
    else chunk.collisions[ly][lx] = value as boolean;
  }

  // As grades da serra e do solo são OPCIONAIS no chunk (o schema diz: chunk sem serra não carrega a
  // grade). Elas nascem na primeira escrita e somem quando o último tile volta a zero, então o
  // world.json de um chunk plano e sem solo pintado continua sem os campos.
  private writeOptionalGrid(chunk: WorldChunk, layer: 'relief' | 'soil', lx: number, ly: number, value: number): void {
    let grid = chunk[layer];
    if (!grid) {
      if (value === 0) return;
      grid = chunk[layer] = Array.from({ length: CHUNK_ROWS }, () => Array.from({ length: CHUNK_COLUMNS }, () => 0));
    }
    grid[ly][lx] = value;
    if (value === 0 && grid.every((row) => row.every((v) => v === 0))) delete chunk[layer];
  }

  /**
   * Escreve uma célula. Devolve `false` quando a escrita foi RECUSADA — hoje só num caso, e ele é
   * a lei do tabuleiro: **chão + uma coisa**.
   *
   * Pintar um tile de CIMA onde já mora uma peça (prop, item, NPC, cova) faria a pilha que este
   * arquivo existe para não ter. As duas saídas seriam apagar a peça ou desenhar por cima dela; a
   * primeira é destruir trabalho autorado com uma passada de pincel de 3×3, a segunda é o defeito.
   * Então o pincel PULA a célula ocupada e segue — a peça continua visível no tabuleiro dizendo
   * por quê. Apagar (`next === null`) nunca é recusado: tirar nunca empilha.
   *
   * O `ground` não entra nesta conta: ele é o chão, e o chão existe debaixo de tudo.
   */
  public setCell(layer: CellLayerId, wx: number, wy: number, next: CellValue): boolean {
    if (!this.isInside(wx, wy)) return false;
    if (layer === 'upper' && next !== null && this.entities.entitiesAt(wx, wy).length > 0) return false;
    const prev = this.readCell(layer, wx, wy);
    if (prev === next) return false;
    this.writeCell(layer, wx, wy, next);

    if (this.history.strokeCells) {
      const key = `${wx},${wy},${layer}`;
      const existing = this.history.strokeCells.get(key);
      if (existing) existing.next = next;
      else this.history.strokeCells.set(key, { wx, wy, layer, prev, next });
    } else {
      this.history.pushUndo([{ kind: 'cells', changes: [{ wx, wy, layer, prev, next }] }]);
    }

    this.markDirty();
    this.emit(layer === 'soil' ? { cells: [{ wx, wy }], soil: true } : { cells: [{ wx, wy }] });
    return true;
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
      // A célula RECUSADA (uma peça mora ali — ver setCell) não entra em `filled`: o balde
      // atravessa e contorna. Contá-la mentiria no toast e, pior, pintaria colisão num tile que
      // o balde não pintou (o chamador aplica `collisionMode` sobre esta lista).
      if (this.setCell(layer, cell.wx, cell.wy, next)) filled.push(cell);
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

  // ── Entities ────────────────────────────────────────────────────────────

  // ── Spawn ───────────────────────────────────────────────────────────────

  public get spawn(): { worldX: number; worldY: number } {
    return this.world.meta.playerStart;
  }

  // ── Dialogs ─────────────────────────────────────────────────────────────

  // ── World meta ──────────────────────────────────────────────────────────

  // ── Undo / redo ─────────────────────────────────────────────────────────

  public get canUndo(): boolean {
    return this.history.undoStack.length > 0;
  }

  public get canRedo(): boolean {
    return this.history.redoStack.length > 0;
  }

  // ── Validation / stats ──────────────────────────────────────────────────

  /** Deep clone of the world, e.g. to hand to the game runtime for a live playtest. */
  public snapshotWorld(): WorldData {
    return clone(this.world);
  }
}
