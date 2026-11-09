/**
 * O MAPA DE TILES do editor (Tilemap/TilemapLayer/Tileset/Tile, no que o EditorScene usa): camadas
 * em branco, `putTileAt`/`removeTileAt` com tinta por tile, e o desenho de cada tile visível pela câmera, tile a
 * tile, como o TilemapLayerWebGLRenderer.
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { OriginGameObject } from './GameObject';
import { getTintAppendFloatAlpha } from '../renderer';
import type { Scene } from '../scene';
import type { Camera } from '../camera';
import type { Renderer, GLTexture } from '../renderer';
import type { Texture } from '../textures';

export class Tile {
  public tint = 0xffffff;
  public tintFill = false;
  public alpha = 1;
  public visible = true;
  public rotation = 0;
  public flipX = false;
  public flipY = false;
  public width: number;
  public height: number;
  public readonly pixelX: number;
  public readonly pixelY: number;

  public constructor(public index: number, public readonly x: number, public readonly y: number, width: number, height: number, baseWidth = width, baseHeight = height) {
    this.width = width;
    this.height = height;
    this.pixelX = x * baseWidth;
    this.pixelY = y * baseHeight;
  }
}

export class Tileset {
  public image: Texture | null = null;
  public glTexture: GLTexture | null = null;
  public rows = 0;
  public columns = 0;
  public total = 0;
  public readonly texCoordinates: Array<{ x: number; y: number }> = [];
  public readonly tileOffset = { x: 0, y: 0 };

  public constructor(public readonly name: string, public readonly firstgid: number, public readonly tileWidth: number, public readonly tileHeight: number,
    public readonly tileMargin = 0, public readonly tileSpacing = 0) {}

  public containsTileIndex(tileIndex: number): boolean {
    return tileIndex >= this.firstgid && tileIndex < this.firstgid + this.total;
  }

  public getTileTextureCoordinates(tileIndex: number): { x: number; y: number } | null {
    if (!this.containsTileIndex(tileIndex)) return null;
    return this.texCoordinates[tileIndex - this.firstgid];
  }

  public setImage(texture: Texture): this {
    this.image = texture;
    const frame = texture.get();
    this.glTexture = frame.source.glTexture;
    // O getFrameBounds com o quadro base é a imagem inteira.
    this.updateTileData(frame.source.width, frame.source.height);
    return this;
  }

  private updateTileData(imageWidth: number, imageHeight: number, offsetX = 0, offsetY = 0): void {
    let rowCount = (imageHeight - this.tileMargin * 2 + this.tileSpacing) / (this.tileHeight + this.tileSpacing);
    let colCount = (imageWidth - this.tileMargin * 2 + this.tileSpacing) / (this.tileWidth + this.tileSpacing);
    rowCount = Math.floor(rowCount);
    colCount = Math.floor(colCount);
    this.rows = rowCount;
    this.columns = colCount;
    this.total = rowCount * colCount;
    this.texCoordinates.length = 0;
    let tx = this.tileMargin + offsetX;
    let ty = this.tileMargin + offsetY;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.columns; x++) {
        this.texCoordinates.push({ x: tx, y: ty });
        tx += this.tileWidth + this.tileSpacing;
      }
      tx = this.tileMargin + offsetX;
      ty += this.tileHeight + this.tileSpacing;
    }
  }
}

export class TilemapLayer extends OriginGameObject {
  public readonly data: Array<Array<Tile | null>> = [];
  public readonly gidMap: Tileset[] = [];
  public readonly tilesets: Tileset[];

  public constructor(scene: Scene, public readonly tilemap: Tilemap, public readonly layerName: string, tileset: Tileset | Tileset[],
    x: number, y: number, public readonly tilesX: number, public readonly tilesY: number) {
    super(scene, 'TilemapLayer');
    this.tilesets = Array.isArray(tileset) ? tileset : [tileset];
    for (const set of this.tilesets) {
      for (let i = 0; i < set.total; i++) this.gidMap[set.firstgid + i] = set;
    }
    for (let ty = 0; ty < tilesY; ty++) {
      const row: Array<Tile | null> = [];
      for (let tx = 0; tx < tilesX; tx++) row.push(new Tile(-1, tx, ty, tilemap.tileWidth, tilemap.tileHeight));
      this.data.push(row);
    }
    this.setPosition(x, y);
    this.width = tilesX * tilemap.tileWidth;
    this.height = tilesY * tilemap.tileHeight;
    this.setOrigin(0, 0);
  }

  private inBounds(tileX: number, tileY: number): boolean {
    return tileX >= 0 && tileX < this.tilesX && tileY >= 0 && tileY < this.tilesY;
  }

  public putTileAt(index: number, tileX: number, tileY: number, _recalculateFaces = true): Tile | null {
    if (!this.inBounds(tileX, tileY)) return null;
    let tile = this.data[tileY][tileX];
    if (tile === null) {
      tile = new Tile(index, tileX, tileY, this.tilemap.tileWidth, this.tilemap.tileHeight);
      this.data[tileY][tileX] = tile;
    } else {
      tile.index = index;
    }
    const set = this.gidMap[index];
    tile.width = set ? set.tileWidth : this.tilemap.tileWidth;
    tile.height = set ? set.tileHeight : this.tilemap.tileHeight;
    return tile;
  }

  public removeTileAt(tileX: number, tileY: number, replaceWithNull = true, _recalculateFaces = true): Tile | null {
    if (!this.inBounds(tileX, tileY)) return null;
    const tile = this.data[tileY][tileX];
    if (!tile) return null;
    this.data[tileY][tileX] = replaceWithNull ? null : new Tile(-1, tileX, tileY, this.tilemap.tileWidth, this.tilemap.tileHeight);
    return tile;
  }

  public getTileAt(tileX: number, tileY: number, nonNull = false): Tile | null {
    if (!this.inBounds(tileX, tileY)) return null;
    const tile = this.data[tileY][tileX];
    if (!tile) return null;
    if (tile.index === -1) return nonNull ? tile : null;
    return tile;
  }

  /** Os tiles que a câmera vê (com um tile de folga), na ordem direita-baixo. */
  private cull(camera: Camera): Tile[] {
    const out: Tile[] = [];
    const tw = this.tilemap.tileWidth * this.scaleX;
    const th = this.tilemap.tileHeight * this.scaleY;
    const view = camera.worldView;
    const left = Math.max(0, Math.floor((view.x - this.x) / tw) - 1);
    const right = Math.min(this.tilesX, Math.ceil((view.x + view.width - this.x) / tw) + 1);
    const top = Math.max(0, Math.floor((view.y - this.y) / th) - 1);
    const bottom = Math.min(this.tilesY, Math.ceil((view.y + view.height - this.y) / th) + 1);
    for (let y = top; y < bottom; y++) {
      const row = this.data[y];
      for (let x = left; x < right; x++) {
        const tile = row[x];
        if (tile && tile.index !== -1 && tile.visible && tile.alpha !== 0) out.push(tile);
      }
    }
    return out;
  }

  public override renderWebGL(renderer: Renderer, _src: TilemapLayer, camera: Camera): void {
    const renderTiles = this.cull(camera);
    const alpha = camera.alpha * this.alpha;
    if (renderTiles.length === 0 || alpha <= 0) return;
    const x = this.x;
    const y = this.y;
    const sx = this.scaleX;
    const sy = this.scaleY;
    for (const tile of renderTiles) {
      const tileset = this.gidMap[tile.index];
      if (!tileset) continue;
      const tileTexCoords = tileset.getTileTextureCoordinates(tile.index);
      const tileWidth = tileset.tileWidth;
      const tileHeight = tileset.tileHeight;
      if (!tileTexCoords || tileWidth === 0 || tileHeight === 0) continue;
      const halfWidth = tileWidth * 0.5;
      const halfHeight = tileHeight * 0.5;
      const texture = tileset.glTexture;
      if (!texture) continue;
      const tint = getTintAppendFloatAlpha(tile.tint, alpha * tile.alpha);
      renderer.batch.batchTexture(this, texture, texture.width, texture.height,
        x + tile.pixelX * sx + (halfWidth * sx - tileset.tileOffset.x),
        y + tile.pixelY * sy + (halfHeight * sy - tileset.tileOffset.y),
        tileWidth, tileHeight, sx, sy, tile.rotation, tile.flipX, tile.flipY, this.scrollFactorX, this.scrollFactorY,
        halfWidth, halfHeight, tileTexCoords.x, tileTexCoords.y, tileWidth, tileHeight, tint, tint, tint, tint, tile.tintFill,
        0, 0, camera);
    }
  }
}

export class Tilemap {
  public readonly tileWidth: number;
  public readonly tileHeight: number;
  public readonly width: number;
  public readonly height: number;
  public readonly tilesets: Tileset[] = [];
  public readonly layers: TilemapLayer[] = [];

  public constructor(private readonly scene: Scene, config: { tileWidth?: number; tileHeight?: number; width?: number; height?: number }) {
    this.tileWidth = config.tileWidth ?? 32;
    this.tileHeight = config.tileHeight ?? 32;
    this.width = config.width ?? 10;
    this.height = config.height ?? 10;
  }

  public addTilesetImage(tilesetName: string, key: string = tilesetName, tileWidth = this.tileWidth, tileHeight = this.tileHeight,
    tileMargin = 0, tileSpacing = 0, gid = 0): Tileset | null {
    const textures = this.scene.sys.textures;
    if (!textures.exists(key)) {
      console.warn('Texture key "%s" not found', key);
      return null;
    }
    const tileset = new Tileset(tilesetName, gid, tileWidth, tileHeight, tileMargin, tileSpacing);
    tileset.setImage(textures.get(key));
    this.tilesets.push(tileset);
    return tileset;
  }

  public createBlankLayer(name: string, tileset: Tileset | Tileset[], x = 0, y = 0, width = this.width, height = this.height): TilemapLayer | null {
    if (this.layers.some((l) => l.layerName === name)) {
      console.warn(`Invalid Tilemap Layer ID: ${name}`);
      return null;
    }
    const layer = new TilemapLayer(this.scene, this, name, tileset, x, y, width, height);
    this.layers.push(layer);
    this.scene.sys.displayList.add(layer);
    return layer;
  }

  public destroy(): void {
    for (const layer of this.layers) layer.destroy();
    this.layers.length = 0;
    this.tilesets.length = 0;
  }
}
