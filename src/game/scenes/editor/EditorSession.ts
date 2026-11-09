// A SESSÃO DO EDITOR: salvar (só com um ponto de partida válido), recarregar (com confirmação), aplicar o tamanho e o
// nome do mundo, testar o mundo em memória e voltar, e lembrar o estado da interface entre uma vez e outra.

import { GameScene } from '@/game/scenes/GameScene';
import { sessionStore } from '@/game/platform/platform';
import { setWorldData } from '@/game/world/WorldData';
import { saveWorld, worldFilePath } from '@/game/worldApi';
import type { PersistedUi } from './EditorCameraRig';
import type { EditorScene } from '../EditorScene';

/** O que EditorSession usa de EditorScene. */
export type EditorSessionHost = Pick<EditorScene,
  'activeStroke' | 'cameras' | 'panning' | 'rectDrag' | 'scene' | 'store' | 'time' | 'ui' | 'uiState'
  | 'uiStateKey' | 'worldFileId'
>;

export class EditorSession {
  private reloadArmedUntil = 0;

  public constructor(private readonly host: EditorSessionHost) {}

  private requireValidStartPoint(): boolean {
    const errors = this.host.store?.checks.startPointErrors() ?? ['Todo level precisa de um Ponto Inicial'];
    if (errors.length === 0) return true;
    this.host.uiState.tool = 'spawn';
    this.host.ui?.syncFromState();
    this.host.ui?.toast(errors[0], 3600);
    return false;
  }

  public async handleSave(): Promise<void> {
    const store = this.host.store;
    if (!store) return;
    if (!this.requireValidStartPoint()) return;
    try {
      // Persist UI first: writing public/world.json makes Vite reload the whole page.
      this.persistUi();
      store.world.meta.exportedAt = new Date().toISOString();
      const warnings = store.checks.validate();
      await saveWorld(store.world, this.host.worldFileId);
      store.markSaved();
      this.host.ui?.toast(
        warnings.length > 0
          ? `Salvo com ${warnings.length} aviso(s) — veja em Mundo...`
          // O caminho é a única prova de QUAL arquivo levou a edição, e o subterrâneo não mora em
          // `levels/` — o toast dizia `public/levels/underworld.json`, que não existe.
          : `Salvo em ${worldFilePath(this.host.worldFileId)}`,
      );
    } catch (error) {
      this.host.ui?.toast(error instanceof Error ? error.message : 'Falha ao salvar');
    }
  }

  public handleReload(): void {
    if (this.host.store?.dirty && this.host.time.now > this.reloadArmedUntil) {
      this.reloadArmedUntil = this.host.time.now + 3000;
      this.host.ui?.toast('Ha alteracoes nao salvas — clique de novo para descartar');
      return;
    }
    this.persistUi();
    this.host.scene.restart();
  }

  public applyWorldSettings(settings: { name: string; chunksX: number; chunksY: number }): void {
    const store = this.host.store;
    if (!store) return;
    store.meta.renameWorld(settings.name);
    const resized = store.world.meta.worldChunksX !== 5 || store.world.meta.worldChunksY !== 5;
    if (resized) store.meta.resizeWorld(5, 5);
    this.host.ui?.refreshHeader();
    this.host.ui?.toast(resized ? 'Mundo fixado em 5x5 chunks' : 'Mundo atualizado');
  }

  /** Runs the real GameScene over the in-memory (possibly unsaved) world; ESC comes back. */
  public startPlaytest(): void {
    const store = this.host.store;
    if (!store) return;
    if (!this.requireValidStartPoint()) return;
    this.persistUi();
    setWorldData(store.snapshotWorld());
    this.host.scene.run(GameScene.key);
    this.host.scene.sleep();
  }

  public handleWake(): void {
    this.host.ui?.setVisible(true);
    this.host.ui?.minimap.requestMinimapRedraw();
  }

  public handleSleep(): void {
    this.host.ui?.setVisible(false);
    this.host.activeStroke = null;
    this.host.rectDrag = null;
    this.host.panning = null;
  }

  public persistUi(): void {
    try {
      const cam = this.host.cameras.main;
      const persisted: PersistedUi = {
        state: this.host.uiState,
        cam: { centerX: cam.midPoint.x, centerY: cam.midPoint.y, zoom: cam.zoom },
      };
      sessionStore().setItem(this.host.uiStateKey, JSON.stringify(persisted));
    } catch { /* ignore */ }
  }

  public restoreUi(): void {
    try {
      const raw = sessionStore().getItem(this.host.uiStateKey);
      if (!raw) return;
      const persisted = JSON.parse(raw) as Partial<PersistedUi>;
      if (persisted.state && typeof persisted.state === 'object') {
        this.host.uiState = { ...this.host.uiState, ...persisted.state };
      }
    } catch { /* ignore */ }
  }

  public renderSnapshot(): string {
    return JSON.stringify({
      mode: 'editor',
      loaded: Boolean(this.host.store),
      tool: this.host.uiState.tool,
      layer: this.host.uiState.layer,
      tile: this.host.uiState.tile,
      tab: this.host.uiState.tab,
      viewMode: this.host.uiState.viewMode,
      chunk: { cx: this.host.uiState.chunkX, cy: this.host.uiState.chunkY },
      dirty: this.host.store?.dirty ?? false,
      world: this.host.store
        ? { name: this.host.store.world.meta.name, chunksX: this.host.store.world.meta.worldChunksX, chunksY: this.host.store.world.meta.worldChunksY }
        : null,
      spawn: this.host.store?.spawn ?? null,
      zoom: this.host.cameras.main.zoom,
    });
  }
}
