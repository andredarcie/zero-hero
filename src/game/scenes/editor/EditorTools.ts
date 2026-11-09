// AS FERRAMENTAS DO EDITOR: o pincel (do tamanho escolhido, em linha entre dois quadros), a borracha, o balde, o
// retângulo, o conta-gotas e pôr a entidade escolhida — tudo pelo armazém, com desfazer.

import { isDirectionalProp } from '@/game/editor/EditorDomUi';
import { RELIEF_HIGH, RELIEF_PEAK } from '@/game/world/relief';
import type { EditorScene } from '../EditorScene';

export type CellCoord = { x: number; y: number };

/** O que EditorTools usa de EditorScene. */
export type EditorToolsHost = Pick<EditorScene,
  'relief' | 'session' | 'store' | 'ui' | 'uiState' | 'view'
>;

export class EditorTools {
  public constructor(private readonly host: EditorToolsHost) {}

  private forEachBrushCell(x: number, y: number, fn: (cx: number, cy: number) => void): void {
    const size = this.host.uiState.brushSize;
    const from = size === 3 ? -1 : 0;
    const to = size === 1 ? 0 : 1;
    for (let dy = from; dy <= to; dy += 1) {
      for (let dx = from; dx <= to; dx += 1) fn(x + dx, y + dy);
    }
  }

  public applyToolAt(x: number, y: number): void {
    const tool = this.host.uiState.tool;
    if (tool === 'brush') this.forEachBrushCell(x, y, (cx, cy) => this.paintTileCell(cx, cy));
    else if (tool === 'eraser') this.forEachBrushCell(x, y, (cx, cy) => this.eraseCell(cx, cy));
    else if (tool === 'collision') {
      this.forEachBrushCell(x, y, (cx, cy) => {
        if (this.host.view.isEditable(cx, cy)) this.host.store?.setCell('collision', cx, cy, true);
      });
    } else if (tool === 'relief') {
      if (this.host.uiState.reliefMode === 'stair') this.host.relief.placeStair(x, y);
      else {
        const code = this.host.uiState.reliefMode === 'peak' ? RELIEF_PEAK : RELIEF_HIGH;
        this.forEachBrushCell(x, y, (cx, cy) => {
          if (this.host.view.isEditable(cx, cy)) this.host.store?.setCell('relief', cx, cy, code);
        });
      }
    } else if (tool === 'entity') this.placeSelectedEntity(x, y);
    else if (tool === 'spawn' && this.host.view.isEditable(x, y)) this.host.store?.meta.setSpawn(x, y);
  }

  public applyEraseAt(x: number, y: number): void {
    if (this.host.uiState.tool === 'collision') {
      this.forEachBrushCell(x, y, (cx, cy) => {
        if (this.host.view.isEditable(cx, cy)) this.host.store?.setCell('collision', cx, cy, false);
      });
      return;
    }
    if (this.host.uiState.tool === 'relief') {
      this.forEachBrushCell(x, y, (cx, cy) => this.host.relief.clearRelief(cx, cy));
      return;
    }
    this.forEachBrushCell(x, y, (cx, cy) => this.eraseCell(cx, cy));
  }

  private paintTileCell(x: number, y: number): void {
    const store = this.host.store;
    if (!store || !this.host.view.isEditable(x, y)) return;
    const { layer, tile, collisionMode } = this.host.uiState;
    if (tile === null) {
      if (layer === 'upper') store.setCell('upper', x, y, null);
    } else {
      store.setCell(layer, x, y, tile);
    }
    if (collisionMode !== 'keep') store.setCell('collision', x, y, collisionMode === 'set');
  }

  private eraseCell(x: number, y: number): void {
    const store = this.host.store;
    if (!store || !this.host.view.isEditable(x, y)) return;
    store.entities.eraseEntitiesAt(x, y);
    store.setCell('upper', x, y, null);
    store.setCell('collision', x, y, false);
  }

  private placeSelectedEntity(x: number, y: number): void {
    const store = this.host.store;
    if (!store || !this.host.view.isEditable(x, y)) return;
    const sel = this.host.uiState.entity;
    if (sel.list === 'npcs') store.entities.placeEntity({ list: 'npcs', type: sel.type, worldX: x, worldY: y });
    else if (sel.list === 'pickups') store.entities.placeEntity({ list: 'pickups', type: sel.type, worldX: x, worldY: y });
    else {
      store.entities.placeEntity({
        list: 'props', type: sel.type, worldX: x, worldY: y,
        ...(isDirectionalProp(sel.type) ? { dir: this.host.uiState.propDir } : {}),
      });
    }
  }

  public pickTileAt(x: number, y: number): void {
    const store = this.host.store;
    if (!store || !store.isInside(x, y)) return;
    const upper = store.readCell('upper', x, y) as number | null;
    if (upper !== null) {
      this.host.uiState.tile = upper;
      this.host.uiState.layer = 'upper';
    } else {
      this.host.uiState.tile = store.readCell('ground', x, y) as number;
      this.host.uiState.layer = 'ground';
    }
    this.host.uiState.tool = 'brush';
    this.host.uiState.tab = 'tiles';
    this.host.ui?.syncFromState();
    this.host.session.persistUi();
  }

  public fillAt(x: number, y: number): void {
    const store = this.host.store;
    if (!store || !store.isInside(x, y)) return;
    const { layer, tile, collisionMode } = this.host.uiState;
    if (tile === null && layer === 'ground') {
      this.host.ui?.toast('O chao nao pode ficar vazio — escolha um tile');
      return;
    }
    store.history.beginStroke();
    const filled = store.floodFill(layer, x, y, tile, this.host.view.editableBounds() ?? undefined);
    if (collisionMode !== 'keep') {
      filled.forEach((cell) => store.setCell('collision', cell.wx, cell.wy, collisionMode === 'set'));
    }
    store.history.commitStroke();
    if (filled.length > 0) this.host.ui?.toast(`Balde: ${filled.length} tiles`);
  }

  /** Rect corners ordered and, in chunk view, intersected with the editable chunk. */
  public clampRect(a: CellCoord, b: CellCoord): { x0: number; x1: number; y0: number; y1: number } | null {
    let x0 = Math.min(a.x, b.x);
    let x1 = Math.max(a.x, b.x);
    let y0 = Math.min(a.y, b.y);
    let y1 = Math.max(a.y, b.y);
    const bounds = this.host.view.editableBounds();
    if (bounds) {
      x0 = Math.max(x0, bounds.x0);
      x1 = Math.min(x1, bounds.x1);
      y0 = Math.max(y0, bounds.y0);
      y1 = Math.min(y1, bounds.y1);
      if (x0 > x1 || y0 > y1) return null;
    }
    return { x0, x1, y0, y1 };
  }

  public applyRect(a: CellCoord, b: CellCoord): void {
    const store = this.host.store;
    if (!store) return;
    const rect = this.clampRect(a, b);
    if (!rect) return;
    const { x0, x1, y0, y1 } = rect;
    store.history.beginStroke();
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) this.paintTileCell(x, y);
    }
    store.history.commitStroke();
  }

  public lineCells(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => void): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      fn(x, y);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
}
