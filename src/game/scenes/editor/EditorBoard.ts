// O TABULEIRO DO EDITOR: o tilemap das duas camadas, a camada de colisão pintada por cima, a grade, e a célula
// refeita quando o armazém muda uma só.

import * as Engine from '@/game/engine';
import { ASSET_KEYS, CHUNK_COLUMNS, CHUNK_ROWS, groundFrameAt, SOLID_GROUND_FRAMES, SOLID_UPPER_FRAMES } from '@/game/constants';
import { biomeWashAt, decorFrameAt } from '@/game/world/biomes';
import type { EditorScene } from '../EditorScene';
import { CAMERA_PAD, WORLD_TILE } from './editorDefs';

/**
 * O BIOMA NO EDITOR: o tile veste a mesma decoração e leva a mesma cor que no jogo (world/biomes.ts),
 * senão o editor mente sobre o mundo que se monta nele. O tint do motor 2D só escurece, então a cor é
 * normalizada pelo canal mais forte.
 */
const biomeTint = (tile: Engine.Tilemaps.Tile | null, wx: number, wy: number): void => {
  if (!tile) return;
  const [r, g, b] = biomeWashAt(wx, wy);
  const k = 1 / Math.max(r, g, b, 1);
  tile.tint = (Math.round(r * k * 255) << 16) | (Math.round(g * k * 255) << 8) | Math.round(b * k * 255);
};
const COLLISION_GID = 1000; // synthetic tile id for the painted-collision overlay tileset
const COLLISION_TEXTURE = 'editor-collision-tile';
// Trees are solid at runtime even without painted collision (ChunkManager.isCellBlocked +
// SOLID_UPPER_FRAMES). The editor shows that implicit collision in a distinct amber so
// authors can see trees block "by default" — and know it isn't erasable painted data.
const TREE_COLLISION_GID = 1001;
const TREE_COLLISION_TEXTURE = 'editor-tree-collision-tile';

/** O que EditorBoard usa de EditorScene. */
export type EditorBoardHost = Pick<EditorScene,
  'add' | 'cameras' | 'chunkMaskGfx' | 'collisionLayer' | 'entityContainer' | 'fixtureContainer' | 'gridGfx'
  | 'hoverGfx' | 'make' | 'pieces' | 'rectGfx' | 'relief' | 'reliefGfx' | 'store' | 'textures' | 'view'
>;

export class EditorBoard {
  private map?: Engine.Tilemaps.Tilemap;
  private groundLayer?: Engine.Tilemaps.TilemapLayer;
  private upperLayer?: Engine.Tilemaps.TilemapLayer;

  public constructor(private readonly host: EditorBoardHost) {}

  private ensureCollisionTexture(): void {
    if (!this.host.textures.exists(COLLISION_TEXTURE)) {
      const gfx = this.host.add.graphics();
      gfx.fillStyle(0xff4455, 0.32).fillRect(0, 0, WORLD_TILE, WORLD_TILE);
      gfx.lineStyle(1, 0xff4455, 0.9).strokeRect(0.5, 0.5, WORLD_TILE - 1, WORLD_TILE - 1);
      gfx.generateTexture(COLLISION_TEXTURE, WORLD_TILE, WORLD_TILE);
      gfx.destroy();
    }
    if (!this.host.textures.exists(TREE_COLLISION_TEXTURE)) {
      // Amber, lighter than the painted-collision red, so trees read as implicitly solid.
      const gfx = this.host.add.graphics();
      gfx.fillStyle(0xf4a261, 0.22).fillRect(0, 0, WORLD_TILE, WORLD_TILE);
      gfx.lineStyle(1, 0xf4a261, 0.8).strokeRect(0.5, 0.5, WORLD_TILE - 1, WORLD_TILE - 1);
      gfx.generateTexture(TREE_COLLISION_TEXTURE, WORLD_TILE, WORLD_TILE);
      gfx.destroy();
    }
  }

  // Which collision overlay a cell should show: painted collision wins (red); otherwise a
  // tree upper-tile is implicitly solid (amber); otherwise nothing. Mirrors the runtime rule
  // in ChunkManager.isCellBlocked so the editor's collision view matches what actually blocks.
  private collisionOverlayGid(wx: number, wy: number): number | null {
    const store = this.host.store;
    if (!store) return null;
    if (store.readCell('collision', wx, wy) === true) return COLLISION_GID;
    const upper = store.readCell('upper', wx, wy) as number | null;
    if (upper !== null && SOLID_UPPER_FRAMES.has(upper)) return TREE_COLLISION_GID;
    // The sea blocks from the GROUND layer (SOLID_GROUND_FRAMES) — same implicit rule, so it
    // gets the same amber. Without this the editor would draw a paintable ocean as walkable.
    const ground = store.readCell('ground', wx, wy) as number | null;
    if (ground !== null && SOLID_GROUND_FRAMES.has(ground)) return TREE_COLLISION_GID;
    return null;
  }

  public buildWorldObjects(): void {
    const store = this.host.store;
    if (!store) return;

    this.map?.destroy();
    this.host.gridGfx?.destroy();
    this.host.reliefGfx?.destroy();
    this.host.chunkMaskGfx?.destroy();
    this.host.hoverGfx?.destroy();
    this.host.rectGfx?.destroy();
    this.host.entityContainer?.destroy();
    this.host.fixtureContainer?.destroy();
    this.ensureCollisionTexture();

    const tilesX = store.tilesX;
    const tilesY = store.tilesY;

    this.map = this.host.make.tilemap({ tileWidth: WORLD_TILE, tileHeight: WORLD_TILE, width: tilesX, height: tilesY });
    const tiles = this.map.addTilesetImage('tiles', ASSET_KEYS.forestTileset, WORLD_TILE, WORLD_TILE, 0, 0, 0)!;
    const collisionTiles = this.map.addTilesetImage('collision', COLLISION_TEXTURE, WORLD_TILE, WORLD_TILE, 0, 0, COLLISION_GID)!;
    const treeCollisionTiles = this.map.addTilesetImage('treeCollision', TREE_COLLISION_TEXTURE, WORLD_TILE, WORLD_TILE, 0, 0, TREE_COLLISION_GID)!;

    this.groundLayer = this.map.createBlankLayer('ground', tiles, 0, 0)!.setDepth(0);
    this.upperLayer = this.map.createBlankLayer('upper', tiles, 0, 0)!.setDepth(1);
    this.host.collisionLayer = this.map.createBlankLayer('collision', [collisionTiles, treeCollisionTiles], 0, 0)!.setDepth(2);

    for (let wy = 0; wy < tilesY; wy += 1) {
      for (let wx = 0; wx < tilesX; wx += 1) {
        biomeTint(this.groundLayer.putTileAt(groundFrameAt(store.readCell('ground', wx, wy) as number, wx, wy), wx, wy, false), wx, wy);
        const upper = store.readCell('upper', wx, wy) as number | null;
        if (upper !== null) biomeTint(this.upperLayer.putTileAt(decorFrameAt(upper, wx, wy), wx, wy, false), wx, wy);
        const collisionGid = this.collisionOverlayGid(wx, wy);
        if (collisionGid !== null) this.host.collisionLayer.putTileAt(collisionGid, wx, wy, false);
      }
    }

    this.host.reliefGfx = this.host.add.graphics().setDepth(1.5);
    this.host.relief.drawRelief();
    this.host.gridGfx = this.host.add.graphics().setDepth(3);
    this.drawGrid();
    this.host.entityContainer = this.host.add.container(0, 0).setDepth(4);
    this.host.pieces.renderEntities();
    // As peças do jogo POR CIMA dos marcadores de entidade: no lago das carpas, embaixo deles, as vitórias-régias,
    // as taboas e as carpas sumiam debaixo dos chips de água. Não são clicáveis; a tecla O as esconde para editar.
    this.host.fixtureContainer = this.host.add.container(0, 0).setDepth(4.5);
    this.host.pieces.renderFixtures();
    this.host.chunkMaskGfx = this.host.add.graphics().setDepth(5);
    this.host.hoverGfx = this.host.add.graphics().setDepth(6);
    this.host.rectGfx = this.host.add.graphics().setDepth(7);

    const worldW = tilesX * WORLD_TILE;
    const worldH = tilesY * WORLD_TILE;
    this.host.cameras.main.setBounds(-CAMERA_PAD, -CAMERA_PAD, worldW + CAMERA_PAD * 2, worldH + CAMERA_PAD * 2);
    this.host.view.applyViewToggles();
  }

  private drawGrid(): void {
    const store = this.host.store;
    const gfx = this.host.gridGfx;
    if (!store || !gfx) return;
    const worldW = store.tilesX * WORLD_TILE;
    const worldH = store.tilesY * WORLD_TILE;

    gfx.clear();
    gfx.lineStyle(1, 0xffffff, 0.07);
    for (let x = 0; x <= store.tilesX; x += 1) gfx.lineBetween(x * WORLD_TILE, 0, x * WORLD_TILE, worldH);
    for (let y = 0; y <= store.tilesY; y += 1) gfx.lineBetween(0, y * WORLD_TILE, worldW, y * WORLD_TILE);

    // Chunk seams stand out so authors can see the streaming/screen boundaries.
    gfx.lineStyle(1, 0xf4a261, 0.28);
    for (let cx = 0; cx <= store.world.meta.worldChunksX; cx += 1) {
      gfx.lineBetween(cx * CHUNK_COLUMNS * WORLD_TILE, 0, cx * CHUNK_COLUMNS * WORLD_TILE, worldH);
    }
    for (let cy = 0; cy <= store.world.meta.worldChunksY; cy += 1) {
      gfx.lineBetween(0, cy * CHUNK_ROWS * WORLD_TILE, worldW, cy * CHUNK_ROWS * WORLD_TILE);
    }
  }

  public refreshCell(wx: number, wy: number): void {
    const store = this.host.store;
    if (!store || !this.groundLayer || !this.upperLayer || !this.host.collisionLayer) return;
    if (!store.isInside(wx, wy)) return;

    biomeTint(this.groundLayer.putTileAt(groundFrameAt(store.readCell('ground', wx, wy) as number, wx, wy), wx, wy, false), wx, wy);
    const upper = store.readCell('upper', wx, wy) as number | null;
    if (upper === null) this.upperLayer.removeTileAt(wx, wy, true, false);
    else biomeTint(this.upperLayer.putTileAt(decorFrameAt(upper, wx, wy), wx, wy, false), wx, wy);
    const collisionGid = this.collisionOverlayGid(wx, wy);
    if (collisionGid !== null) this.host.collisionLayer.putTileAt(collisionGid, wx, wy, false);
    else this.host.collisionLayer.removeTileAt(wx, wy, true, false);
  }
}
