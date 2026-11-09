// O HISTÓRICO DO EDITOR: cada traço de pincel vira UMA operação (as células e as peças que ele mudou), e desfazer e
// refazer aplicam a operação ao contrário ou de novo. O que é uma célula ou uma peça é do EditorStore.

import type { NpcKind, PickupKind } from '@/game/world/ScreenContent';
import type { PropDir, PropKind, WorldDialog } from '@/game/world/worldSchema';
import type { EditorStore } from './EditorStore';

const UNDO_LIMIT = 200;
// `relief` é a SERRA (ver world/relief.ts): 0 chão, 1 planalto, 2..5 escada subindo N/L/S/O.
export type CellLayerId = 'ground' | 'upper' | 'collision' | 'relief';
export type CellValue = number | boolean | null;
export type CellChange = { wx: number; wy: number; layer: CellLayerId; prev: CellValue; next: CellValue };
export type PlacedEntity =
  | { list: 'npcs'; type: NpcKind; worldX: number; worldY: number }
  | { list: 'pickups'; type: PickupKind; worldX: number; worldY: number }
  | { list: 'props'; type: PropKind; worldX: number; worldY: number; dir?: PropDir };
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
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** O que EditorHistory usa de EditorStore. */
export type EditorHistoryHost = Pick<EditorStore,
  'dirty' | 'emit' | 'entities' | 'world' | 'writeCell'
>;

export class EditorHistory {
  public undoStack: Op[][] = [];
  public redoStack: Op[][] = [];
  // While a stroke is open, cell changes coalesce per-cell and entity ops accumulate, so
  // one drag (or one fill) undoes as a single gesture.
  public strokeOps: Op[] | null = null;
  public strokeCells: Map<string, CellChange> | null = null;

  public constructor(private readonly host: EditorHistoryHost) {}

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

  public recordOp(op: Op): void {
    if (this.strokeOps) this.strokeOps.push(op);
    else this.pushUndo([op]);
  }

  public pushUndo(ops: Op[]): void {
    this.undoStack.push(ops);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.host.emit({ meta: true });
  }

  public undo(): boolean {
    const ops = this.undoStack.pop();
    if (!ops) return false;
    for (let i = ops.length - 1; i >= 0; i -= 1) this.applyOp(ops[i], false);
    this.redoStack.push(ops);
    this.host.dirty = true;
    this.host.emit(this.describeOps(ops));
    return true;
  }

  public redo(): boolean {
    const ops = this.redoStack.pop();
    if (!ops) return false;
    ops.forEach((op) => this.applyOp(op, true));
    this.undoStack.push(ops);
    this.host.dirty = true;
    this.host.emit(this.describeOps(ops));
    return true;
  }

  private applyOp(op: Op, forward: boolean): void {
    if (op.kind === 'cells') {
      op.changes.forEach((c) => this.host.writeCell(c.layer, c.wx, c.wy, forward ? c.next : c.prev));
    } else if (op.kind === 'entities') {
      const toRemove = forward ? op.removed : op.added;
      const toAdd = forward ? op.added : op.removed;
      toRemove.forEach((e) => this.host.entities.removeEntityFromWorld(e));
      toAdd.forEach((e) => this.host.entities.addEntityToWorld(e));
    } else if (op.kind === 'spawn') {
      this.host.world.meta.playerStart = { ...(forward ? op.next : op.prev) };
    } else {
      const dialog = forward ? op.next : op.prev;
      if (dialog) this.host.world.dialogs[op.npc] = clone(dialog);
      else delete this.host.world.dialogs[op.npc];
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
}
