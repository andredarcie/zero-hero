import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';

export class WorldCamera {
  public screenOriginX: number;
  public screenOriginY: number;
  public screenCenterX: number;
  public screenCenterY: number;
  public viewportColumns: number;
  public viewportRows: number;
  public transitioning: boolean;

  public constructor(screenOriginX = 0, screenOriginY = 0, screenCenterX = 0, screenCenterY = 0, viewportColumns = CHUNK_COLUMNS, viewportRows = CHUNK_ROWS) {
    this.screenOriginX = screenOriginX;
    this.screenOriginY = screenOriginY;
    this.screenCenterX = screenCenterX;
    this.screenCenterY = screenCenterY;
    this.viewportColumns = viewportColumns;
    this.viewportRows = viewportRows;
    this.transitioning = false;
  }

  public setActiveScreen(worldX: number, worldY: number): void {
    this.screenOriginX = Math.floor(worldX / CHUNK_COLUMNS) * CHUNK_COLUMNS;
    this.screenOriginY = Math.floor(worldY / CHUNK_ROWS) * CHUNK_ROWS;
  }

  public tileToScreen(tileX: number, tileY: number, tileSize: number): { x: number; y: number } {
    const left = this.screenCenterX - (this.viewportColumns * tileSize) / 2;
    const top = this.screenCenterY - (this.viewportRows * tileSize) / 2;
    return {
      x: Math.round(left + (tileX - this.screenOriginX + 0.5) * tileSize),
      y: Math.round(top + (tileY - this.screenOriginY + 0.5) * tileSize),
    };
  }

  public getVisibleRange(_tileSize: number, buffer = 0): { minX: number; maxX: number; minY: number; maxY: number } {
    const minX = Math.floor(this.screenOriginX - buffer);
    const maxX = Math.ceil(this.screenOriginX + this.viewportColumns - 1 + buffer);
    const minY = Math.floor(this.screenOriginY - buffer);
    const maxY = Math.ceil(this.screenOriginY + this.viewportRows - 1 + buffer);
    return {
      minX,
      maxX,
      minY,
      maxY,
    };
  }
}
