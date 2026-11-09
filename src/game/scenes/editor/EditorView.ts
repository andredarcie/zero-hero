// A VISTA DO EDITOR: as camadas ligadas e desligadas, o modo mundo ou chunk (só um chunk editável, o resto atrás de
// uma máscara), e os limites de onde o pincel pode pintar.

import * as Engine from '@/game/engine';
import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import type { EditorScene } from '../EditorScene';
import { CAMERA_PAD, MAX_ZOOM, MIN_ZOOM, WORLD_TILE } from './editorDefs';


/** O que EditorView usa de EditorScene. */
export type EditorViewHost = Pick<EditorScene,
  'appliedView' | 'cameras' | 'chunkMaskGfx' | 'collisionLayer' | 'entityContainer' | 'fixtureContainer'
  | 'gridGfx' | 'reliefGfx' | 'session' | 'store' | 'ui' | 'uiState'
>;

export class EditorView {
  public constructor(private readonly host: EditorViewHost) {}

  public applyViewToggles(): void {
    this.host.gridGfx?.setVisible(this.host.uiState.showGrid);
    this.host.collisionLayer?.setVisible(this.host.uiState.showCollisions);
    this.host.reliefGfx?.setVisible(this.host.uiState.showRelief);
    this.host.entityContainer?.setVisible(this.host.uiState.showEntities);
    this.host.fixtureContainer?.setVisible(this.host.uiState.showFixtures);
  }

  private chunkRect(): { x: number; y: number; w: number; h: number } {
    return {
      x: this.host.uiState.chunkX * CHUNK_COLUMNS * WORLD_TILE,
      y: this.host.uiState.chunkY * CHUNK_ROWS * WORLD_TILE,
      w: CHUNK_COLUMNS * WORLD_TILE,
      h: CHUNK_ROWS * WORLD_TILE,
    };
  }

  /** Editable area in tile coords, or null when the whole world is editable (world view). */
  public editableBounds(): { x0: number; y0: number; x1: number; y1: number } | null {
    if (this.host.uiState.viewMode !== 'chunk') return null;
    return {
      x0: this.host.uiState.chunkX * CHUNK_COLUMNS,
      y0: this.host.uiState.chunkY * CHUNK_ROWS,
      x1: (this.host.uiState.chunkX + 1) * CHUNK_COLUMNS - 1,
      y1: (this.host.uiState.chunkY + 1) * CHUNK_ROWS - 1,
    };
  }

  public isEditable(x: number, y: number): boolean {
    const bounds = this.editableBounds();
    return !bounds || (x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1);
  }

  private clampChunkSelection(): void {
    const meta = this.host.store?.world.meta;
    if (!meta) return;
    this.host.uiState.chunkX = Math.max(0, Math.min(meta.worldChunksX - 1, this.host.uiState.chunkX));
    this.host.uiState.chunkY = Math.max(0, Math.min(meta.worldChunksY - 1, this.host.uiState.chunkY));
  }

  /** Applies viewMode/chunk selection when they changed since the last application. */
  public syncViewMode(): void {
    const state = this.host.uiState;
    // Entering chunk view from world view focuses the chunk under the camera centre.
    if (state.viewMode === 'chunk' && this.host.appliedView.mode === 'world') {
      const cam = this.host.cameras.main;
      state.chunkX = Math.floor(cam.midPoint.x / WORLD_TILE / CHUNK_COLUMNS);
      state.chunkY = Math.floor(cam.midPoint.y / WORLD_TILE / CHUNK_ROWS);
    }
    this.clampChunkSelection();
    const changed = state.viewMode !== this.host.appliedView.mode
      || state.chunkX !== this.host.appliedView.chunkX
      || state.chunkY !== this.host.appliedView.chunkY;
    if (!changed) return;
    this.host.appliedView = { mode: state.viewMode, chunkX: state.chunkX, chunkY: state.chunkY };
    this.applyViewMode();
    this.host.ui?.syncFromState();
  }

  private applyViewMode(): void {
    const store = this.host.store;
    if (!store) return;
    const cam = this.host.cameras.main;

    if (this.host.uiState.viewMode === 'chunk') {
      const rect = this.chunkRect();
      const pad = WORLD_TILE * 1.5;
      cam.setBounds(rect.x - pad, rect.y - pad, rect.w + pad * 2, rect.h + pad * 2);
      this.fitChunk();
      this.drawChunkMask();
    } else {
      const worldW = store.tilesX * WORLD_TILE;
      const worldH = store.tilesY * WORLD_TILE;
      cam.setBounds(-CAMERA_PAD, -CAMERA_PAD, worldW + CAMERA_PAD * 2, worldH + CAMERA_PAD * 2);
      this.host.chunkMaskGfx?.clear();
    }
    this.host.session.persistUi();
  }

  public fitChunk(): void {
    const cam = this.host.cameras.main;
    const rect = this.chunkRect();
    const zoom = Engine.Math.Clamp(Math.min(cam.width / rect.w, cam.height / rect.h) * 0.94, MIN_ZOOM, MAX_ZOOM);
    cam.setZoom(zoom);
    cam.centerOn(rect.x + rect.w / 2, rect.y + rect.h / 2);
  }

  /** Dims everything outside the selected chunk so the focused screen pops out. */
  private drawChunkMask(): void {
    const store = this.host.store;
    const gfx = this.host.chunkMaskGfx;
    if (!store || !gfx) return;
    const rect = this.chunkRect();
    const minX = -CAMERA_PAD * 2;
    const minY = -CAMERA_PAD * 2;
    const maxX = store.tilesX * WORLD_TILE + CAMERA_PAD * 2;
    const maxY = store.tilesY * WORLD_TILE + CAMERA_PAD * 2;

    gfx.clear();
    gfx.fillStyle(0x05090b, 0.78);
    gfx.fillRect(minX, minY, rect.x - minX, maxY - minY);
    gfx.fillRect(rect.x + rect.w, minY, maxX - (rect.x + rect.w), maxY - minY);
    gfx.fillRect(rect.x, minY, rect.w, rect.y - minY);
    gfx.fillRect(rect.x, rect.y + rect.h, rect.w, maxY - (rect.y + rect.h));
    gfx.lineStyle(2, 0xf4a261, 0.9);
    gfx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }
}
