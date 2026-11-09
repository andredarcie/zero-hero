// O MINIMAPA DO EDITOR: o mapa inteiro pintado uma vez por célula (e repintado só quando algo muda), o retângulo da vista
// por cima, e o clique que leva a câmera até lá.

import { ASSET_KEYS, CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import type { NpcKind, PickupKind } from '@/game/world/ScreenContent';
import type { PropKind } from '@/game/world/worldSchema';
import { biomeTintAt, decorFrameAt } from '@/game/world/biomes';
import type { EditorDomUi } from './EditorDomUi';

export const PANEL_WIDTH = 320;
export type EntitySelection =
  | { list: 'npcs'; type: NpcKind }
  | { list: 'pickups'; type: PickupKind }
  | { list: 'props'; type: PropKind };
// O mesmo vermelho do chip no tabuleiro (CHIP_COLOR em EditorScene) e do ponto no minimapa: as
// tres pinturas da mesma entidade nao podem discordar de cor.
export const ENTITY_DOT_COLOR: Record<EntitySelection['list'], string> = {
  npcs: '#4488ff',
  pickups: '#33cc77',
  props: '#ffaa33',
};

/** O que EditorMinimap usa de EditorDomUi. */
export type EditorMinimapHost = Pick<EditorDomUi,
  'cb' | 'minimapBase' | 'minimapCanvas' | 'scene' | 'store'
>;

export class EditorMinimap {
  private minimapScale = 2;
  private minimapRedrawQueued = false;
  private viewportRect: { x: number; y: number; w: number; h: number } | null = null;

  public constructor(private readonly host: EditorMinimapHost) {}

  public requestMinimapRedraw(): void {
    if (this.minimapRedrawQueued) return;
    this.minimapRedrawQueued = true;
    window.requestAnimationFrame(() => {
      this.minimapRedrawQueued = false;
      this.redrawMinimapBase();
      this.compositeMinimap();
    });
  }

  public updateMinimapViewport(rect: { x: number; y: number; w: number; h: number }): void {
    this.viewportRect = rect;
    this.compositeMinimap();
  }

  private redrawMinimapBase(): void {
    const tilesX = this.host.store.tilesX;
    const tilesY = this.host.store.tilesY;
    this.minimapScale = Math.max(1, Math.min(4, Math.floor((PANEL_WIDTH - 26) / tilesX)));
    const scale = this.minimapScale;
    this.host.minimapBase.width = tilesX * scale;
    this.host.minimapBase.height = tilesY * scale;
    const ctx = this.host.minimapBase.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#05090b';
    ctx.fillRect(0, 0, this.host.minimapBase.width, this.host.minimapBase.height);

    const texture = this.host.scene.textures.get(ASSET_KEYS.forestTileset);
    const source = texture.getSourceImage() as CanvasImageSource;

    for (let wy = 0; wy < tilesY; wy += 1) {
      for (let wx = 0; wx < tilesX; wx += 1) {
        const ground = this.host.store.readCell('ground', wx, wy) as number;
        const groundFrame = texture.get(ground);
        ctx.drawImage(source, groundFrame.cutX, groundFrame.cutY, groundFrame.width, groundFrame.height, wx * scale, wy * scale, scale, scale);
        const upper = this.host.store.readCell('upper', wx, wy) as number | null;
        if (upper !== null) {
          const upperFrame = texture.get(decorFrameAt(upper, wx, wy));
          ctx.drawImage(source, upperFrame.cutX, upperFrame.cutY, upperFrame.width, upperFrame.height, wx * scale, wy * scale, scale, scale);
        }
        // a cor do bioma por cima (multiplicar), como o tabuleiro e o jogo mostram (world/biomes.ts)
        const [r, g, b] = biomeTintAt(wx, wy);
        const k = 255 / Math.max(r, g, b, 1);
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`;
        ctx.fillRect(wx * scale, wy * scale, scale, scale);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // Chunk seams, entity dots and the player spawn read better than raw terrain alone.
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    for (let cx = 1; cx < this.host.store.world.meta.worldChunksX; cx += 1) {
      ctx.beginPath();
      ctx.moveTo(cx * CHUNK_COLUMNS * scale + 0.5, 0);
      ctx.lineTo(cx * CHUNK_COLUMNS * scale + 0.5, this.host.minimapBase.height);
      ctx.stroke();
    }
    for (let cy = 1; cy < this.host.store.world.meta.worldChunksY; cy += 1) {
      ctx.beginPath();
      ctx.moveTo(0, cy * CHUNK_ROWS * scale + 0.5);
      ctx.lineTo(this.host.minimapBase.width, cy * CHUNK_ROWS * scale + 0.5);
      ctx.stroke();
    }

    const dot = Math.max(2, scale);
    this.host.store.entities.allEntities().forEach((entity) => {
      ctx.fillStyle = ENTITY_DOT_COLOR[entity.list];
      ctx.fillRect(entity.worldX * scale, entity.worldY * scale, dot, dot);
    });
    const spawn = this.host.store.spawn;
    ctx.fillStyle = '#00e0ff';
    ctx.fillRect(spawn.worldX * scale - 1, spawn.worldY * scale - 1, dot + 2, dot + 2);
  }

  private compositeMinimap(): void {
    this.host.minimapCanvas.width = this.host.minimapBase.width;
    this.host.minimapCanvas.height = this.host.minimapBase.height;
    const ctx = this.host.minimapCanvas.getContext('2d');
    if (!ctx || this.host.minimapBase.width === 0) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.host.minimapBase, 0, 0);
    if (this.viewportRect) {
      const scale = this.minimapScale;
      ctx.strokeStyle = '#f4a261';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        this.viewportRect.x * scale + 1,
        this.viewportRect.y * scale + 1,
        this.viewportRect.w * scale - 2,
        this.viewportRect.h * scale - 2,
      );
    }
  }

  public bindMinimapInput(): void {
    let dragging = false;
    const navigate = (event: MouseEvent): void => {
      const bounds = this.host.minimapCanvas.getBoundingClientRect();
      const scaleX = this.host.minimapCanvas.width / bounds.width;
      const scaleY = this.host.minimapCanvas.height / bounds.height;
      const tileX = Math.floor(((event.clientX - bounds.left) * scaleX) / this.minimapScale);
      const tileY = Math.floor(((event.clientY - bounds.top) * scaleY) / this.minimapScale);
      this.host.cb.onNavigate(tileX, tileY);
    };
    this.host.minimapCanvas.addEventListener('mousedown', (event) => {
      dragging = true;
      navigate(event);
    });
    window.addEventListener('mousemove', (event) => {
      if (dragging) navigate(event);
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
    });
  }
}
