// A CÂMERA DO EDITOR: enquadrar o mundo, centrar num tile, ir a um chunk, acompanhar o tamanho da janela, e voltar
// para onde estava quando o editor reabre.

import * as Engine from '@/game/engine';
import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import { PANEL_WIDTH, type UiState } from '@/game/editor/EditorDomUi';
import { sessionStore } from '@/game/platform/platform';
import type { EditorScene } from '../EditorScene';
import { MAX_ZOOM, MIN_ZOOM, WORLD_TILE } from './editorDefs';

export type PersistedUi = { state: UiState; cam?: { centerX: number; centerY: number; zoom: number } };

/** O que EditorCameraRig usa de EditorScene. */
export type EditorCameraRigHost = Pick<EditorScene,
  'cameras' | 'session' | 'store' | 'ui' | 'uiState' | 'uiStateKey' | 'view'
>;

export class EditorCameraRig {
  private lastCamSync = { scrollX: NaN, scrollY: NaN, zoom: NaN };

  public constructor(private readonly host: EditorCameraRigHost) {}

  public syncCameraDerivedUi(): void {
    const cam = this.host.cameras.main;
    if (cam.scrollX === this.lastCamSync.scrollX && cam.scrollY === this.lastCamSync.scrollY && cam.zoom === this.lastCamSync.zoom) {
      return;
    }
    this.lastCamSync = { scrollX: cam.scrollX, scrollY: cam.scrollY, zoom: cam.zoom };
    const view = cam.worldView;
    this.host.ui?.minimap.updateMinimapViewport({
      x: view.x / WORLD_TILE,
      y: view.y / WORLD_TILE,
      w: view.width / WORLD_TILE,
      h: view.height / WORLD_TILE,
    });
  }

  public fitView(): void {
    const store = this.host.store;
    if (!store) return;
    if (this.host.uiState.viewMode === 'chunk') {
      this.host.view.fitChunk();
      this.host.session.persistUi();
      return;
    }
    const cam = this.host.cameras.main;
    const worldW = store.tilesX * WORLD_TILE;
    const worldH = store.tilesY * WORLD_TILE;
    const zoom = Engine.Math.Clamp(Math.min(cam.width / worldW, cam.height / worldH) * 0.95, MIN_ZOOM, MAX_ZOOM);
    cam.setZoom(zoom);
    cam.centerOn(worldW / 2, worldH / 2);
    this.host.session.persistUi();
  }

  /** A câmera centrada neste tile. */
  public centerOnTile(tileX: number, tileY: number): void {
    this.host.cameras.main.centerOn((tileX + 0.5) * WORLD_TILE, (tileY + 0.5) * WORLD_TILE);
    this.host.session.persistUi();
  }

  /** Minimap click: world view pans to the tile; chunk view jumps to that chunk. */
  public navigateTo(tileX: number, tileY: number): void {
    if (this.host.uiState.viewMode === 'chunk') {
      this.host.uiState.chunkX = Math.floor(tileX / CHUNK_COLUMNS);
      this.host.uiState.chunkY = Math.floor(tileY / CHUNK_ROWS);
      this.host.view.syncViewMode();
      return;
    }
    this.centerOnTile(tileX, tileY);
  }

  public handleResize(size: { width: number; height: number }): void {
    const { width, height } = size;
    this.host.cameras.main.setViewport(PANEL_WIDTH, 0, Math.max(1, width - PANEL_WIDTH), height);
  }

  public restoreCamera(): boolean {
    try {
      const raw = sessionStore().getItem(this.host.uiStateKey);
      if (!raw) return false;
      const persisted = JSON.parse(raw) as Partial<PersistedUi>;
      if (!persisted.cam) return false;
      const cam = this.host.cameras.main;
      cam.setZoom(Engine.Math.Clamp(persisted.cam.zoom, MIN_ZOOM, MAX_ZOOM));
      cam.centerOn(persisted.cam.centerX, persisted.cam.centerY);
      return true;
    } catch {
      return false;
    }
  }
}
