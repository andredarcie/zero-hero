// O MOUSE NO EDITOR: apertar, arrastar e soltar viram ferramenta (o botão direito, o contrário), a roda dá zoom, e o
// cursor mostra a célula e a prévia do retângulo.

import * as Engine from '@/game/engine';
import { PANEL_WIDTH } from '@/game/editor/EditorDomUi';
import { RELIEF_GROUND } from '@/game/world/relief';
import type { CellCoord } from './EditorTools';
import type { EditorScene } from '../EditorScene';
import { MAX_ZOOM, MIN_ZOOM, WORLD_TILE } from './editorDefs';

/** O que EditorPointer usa de EditorScene. */
export type EditorPointerHost = Pick<EditorScene,
  'activeStroke' | 'cameras' | 'hoverGfx' | 'input' | 'panning' | 'rectDrag' | 'rectGfx' | 'relief' | 'session'
  | 'soil' | 'store' | 'tools' | 'ui' | 'uiState' | 'view'
>;

export class EditorPointer {
  private hovered: CellCoord | null = null;

  public constructor(private readonly host: EditorPointerHost) {}

  public registerPointerInput(): void {
    this.host.input.on(Engine.Input.Events.POINTER_DOWN, (pointer: Engine.Input.Pointer) => this.onPointerDown(pointer));
    this.host.input.on(Engine.Input.Events.POINTER_MOVE, (pointer: Engine.Input.Pointer) => this.onPointerMove(pointer));
    this.host.input.on(Engine.Input.Events.POINTER_UP, (pointer: Engine.Input.Pointer) => this.onPointerUp(pointer));
    this.host.input.on(Engine.Input.Events.POINTER_UP_OUTSIDE, (pointer: Engine.Input.Pointer) => this.onPointerUp(pointer));
    this.host.input.on(Engine.Input.Events.GAME_OUT, () => {
      this.hovered = null;
      this.drawHover();
      this.host.ui?.setStatus(null);
    });
    this.host.input.on(
      Engine.Input.Events.POINTER_WHEEL,
      (pointer: Engine.Input.Pointer, _over: unknown, _dx: number, dy: number) => this.onWheel(pointer, dy),
    );
  }

  /** A célula do mundo debaixo de um ponto da tela. */
  public screenToCell(screenX: number, screenY: number): CellCoord {
    const cam = this.host.cameras.main;
    const worldX = cam.midPoint.x + (screenX - cam.x - cam.width / 2) / cam.zoom;
    const worldY = cam.midPoint.y + (screenY - cam.y - cam.height / 2) / cam.zoom;
    return { x: Math.floor(worldX / WORLD_TILE), y: Math.floor(worldY / WORLD_TILE) };
  }

  private onPointerDown(pointer: Engine.Input.Pointer): void {
    if (!this.host.store || pointer.x < PANEL_WIDTH) return;

    if (pointer.middleButtonDown() || (this.host.ui?.spaceHeld && pointer.leftButtonDown())) {
      this.host.panning = { lastX: pointer.x, lastY: pointer.y };
      return;
    }

    const cell = this.screenToCell(pointer.x, pointer.y);

    if (pointer.rightButtonDown()) {
      this.host.store.history.beginStroke();
      this.host.activeStroke = { erase: true, last: cell };
      this.host.tools.applyEraseAt(cell.x, cell.y);
      return;
    }
    if (!pointer.leftButtonDown()) return;

    const tool = this.host.uiState.tool;
    if (tool === 'picker') {
      this.host.tools.pickTileAt(cell.x, cell.y);
      return;
    }
    if (tool === 'fill') {
      this.host.tools.fillAt(cell.x, cell.y);
      return;
    }
    if (tool === 'rect') {
      this.host.rectDrag = cell;
      this.drawRectPreview(cell);
      return;
    }

    this.host.store.history.beginStroke();
    this.host.activeStroke = { erase: false, last: cell };
    this.host.tools.applyToolAt(cell.x, cell.y);
  }

  private onPointerMove(pointer: Engine.Input.Pointer): void {
    if (this.host.panning) {
      const cam = this.host.cameras.main;
      cam.scrollX -= (pointer.x - this.host.panning.lastX) / cam.zoom;
      cam.scrollY -= (pointer.y - this.host.panning.lastY) / cam.zoom;
      this.host.panning = { lastX: pointer.x, lastY: pointer.y };
      return;
    }

    const cell = this.screenToCell(pointer.x, pointer.y);
    if (!this.hovered || this.hovered.x !== cell.x || this.hovered.y !== cell.y) {
      this.hovered = cell;
      this.drawHover();
      this.refreshHoverStatus();
    }

    if (this.host.activeStroke) {
      const last = this.host.activeStroke.last;
      if (last.x !== cell.x || last.y !== cell.y) {
        const erase = this.host.activeStroke.erase;
        // A escada e posta um clique de cada vez: arrastar faria uma fileira de escadas.
        const oneShot = !erase && this.host.uiState.tool === 'relief' && this.host.uiState.reliefMode === 'stair';
        if (!oneShot) this.host.tools.lineCells(last.x, last.y, cell.x, cell.y, (x, y) => {
          if (erase) this.host.tools.applyEraseAt(x, y);
          else this.host.tools.applyToolAt(x, y);
        });
        this.host.activeStroke.last = cell;
      }
    }

    if (this.host.rectDrag) this.drawRectPreview(cell);
  }

  private onPointerUp(pointer: Engine.Input.Pointer): void {
    if (this.host.panning) {
      this.host.panning = null;
      this.host.session.persistUi();
      return;
    }
    if (this.host.activeStroke) {
      this.host.store?.history.commitStroke();
      this.host.activeStroke = null;
      return;
    }
    if (this.host.rectDrag) {
      const end = this.screenToCell(pointer.x, pointer.y);
      this.host.tools.applyRect(this.host.rectDrag, end);
      this.host.rectDrag = null;
      this.host.rectGfx?.clear();
    }
  }

  private onWheel(pointer: Engine.Input.Pointer, dy: number): void {
    if (pointer.x < PANEL_WIDTH) return;
    const cam = this.host.cameras.main;
    const factor = dy > 0 ? 1 / 1.2 : 1.2;
    const zoom = Engine.Math.Clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    if (zoom === cam.zoom) return;

    // Zoom towards the cursor: keep the world point under the pointer fixed on screen.
    const viewX = pointer.x - cam.x - cam.width / 2;
    const viewY = pointer.y - cam.y - cam.height / 2;
    const worldX = cam.midPoint.x + viewX / cam.zoom;
    const worldY = cam.midPoint.y + viewY / cam.zoom;
    cam.setZoom(zoom);
    cam.centerOn(worldX - viewX / zoom, worldY - viewY / zoom);

    this.drawHover();
    this.refreshHoverStatus();
    this.host.session.persistUi();
  }

  public drawHover(): void {
    const gfx = this.host.hoverGfx;
    if (!gfx) return;
    gfx.clear();
    const cell = this.hovered;
    if (!cell || !this.host.store) return;
    // In chunk view the outside is masked and read-only; only the picker still works there.
    if (!this.host.view.isEditable(cell.x, cell.y) && this.host.uiState.tool !== 'picker') return;

    const size = (this.host.uiState.tool === 'brush' || this.host.uiState.tool === 'eraser' || this.host.uiState.tool === 'collision'
      || this.host.uiState.tool === 'soil' || (this.host.uiState.tool === 'relief' && this.host.uiState.reliefMode !== 'stair'))
      ? this.host.uiState.brushSize
      : 1;
    const from = size === 3 ? -1 : 0;
    const span = size === 1 ? 1 : size === 2 ? 2 : 3;
    gfx.lineStyle(Math.max(1, 2 / this.host.cameras.main.zoom), 0xf4a261, 0.95);
    gfx.strokeRect((cell.x + from) * WORLD_TILE, (cell.y + from) * WORLD_TILE, span * WORLD_TILE, span * WORLD_TILE);
  }

  private drawRectPreview(current: CellCoord): void {
    const gfx = this.host.rectGfx;
    const anchor = this.host.rectDrag;
    if (!gfx || !anchor) return;
    gfx.clear();
    const rect = this.host.tools.clampRect(anchor, current);
    if (!rect) return;
    const { x0, x1, y0, y1 } = rect;
    gfx.lineStyle(Math.max(1, 2 / this.host.cameras.main.zoom), 0xf4a261, 1);
    gfx.fillStyle(0xf4a261, 0.12);
    gfx.fillRect(x0 * WORLD_TILE, y0 * WORLD_TILE, (x1 - x0 + 1) * WORLD_TILE, (y1 - y0 + 1) * WORLD_TILE);
    gfx.strokeRect(x0 * WORLD_TILE, y0 * WORLD_TILE, (x1 - x0 + 1) * WORLD_TILE, (y1 - y0 + 1) * WORLD_TILE);
  }

  public refreshHoverStatus(): void {
    const store = this.host.store;
    if (!store || !this.host.ui) return;
    const cell = this.hovered;
    if (!cell) {
      this.host.ui.setStatus(null);
      return;
    }
    const inside = store.isInside(cell.x, cell.y);
    this.host.ui.setStatus({
      tileX: cell.x,
      tileY: cell.y,
      inside,
      ground: inside ? (store.readCell('ground', cell.x, cell.y) as number) : 0,
      upper: inside ? (store.readCell('upper', cell.x, cell.y) as number | null) : null,
      collision: inside ? (store.readCell('collision', cell.x, cell.y) as boolean) : false,
      relief: inside ? this.host.relief.reliefAt(cell.x, cell.y) : RELIEF_GROUND,
      soil: inside ? this.host.soil.soilAt(cell.x, cell.y) : 0,
      entities: inside ? store.entities.entitiesAt(cell.x, cell.y).map((e) => e.type) : [],
      zoom: this.host.cameras.main.zoom,
    });
  }
}
