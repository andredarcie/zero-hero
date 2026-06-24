import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';

/**
 * Open-world camera that stays centered on the hero. `camX`/`camY` are the (fractional)
 * world-tile coordinates currently under the screen centre; the hero is always drawn there
 * and the world scrolls underneath as `camX`/`camY` follow them.
 */
export class WorldCamera {
  public camX: number;
  public camY: number;
  public screenCenterX: number;
  public screenCenterY: number;
  public viewportColumns: number; // visible tile counts (used for the streaming window)
  public viewportRows: number;
  public transitioning: boolean; // kept for API compatibility; always false now

  public constructor(
    camX = 0,
    camY = 0,
    screenCenterX = 0,
    screenCenterY = 0,
    viewportColumns = CHUNK_COLUMNS,
    viewportRows = CHUNK_ROWS,
  ) {
    this.camX = camX;
    this.camY = camY;
    this.screenCenterX = screenCenterX;
    this.screenCenterY = screenCenterY;
    this.viewportColumns = viewportColumns;
    this.viewportRows = viewportRows;
    this.transitioning = false;
  }

  public centerOn(worldX: number, worldY: number): void {
    this.camX = worldX;
    this.camY = worldY;
  }

  public tileToScreen(tileX: number, tileY: number, tileSize: number): { x: number; y: number } {
    return {
      x: Math.round(this.screenCenterX + (tileX - this.camX) * tileSize),
      y: Math.round(this.screenCenterY + (tileY - this.camY) * tileSize),
    };
  }

  public getVisibleRange(_tileSize: number, buffer = 2): { minX: number; maxX: number; minY: number; maxY: number } {
    const halfCols = this.viewportColumns / 2;
    const halfRows = this.viewportRows / 2;
    return {
      minX: Math.floor(this.camX - halfCols - buffer),
      maxX: Math.ceil(this.camX + halfCols + buffer),
      minY: Math.floor(this.camY - halfRows - buffer),
      maxY: Math.ceil(this.camY + halfRows + buffer),
    };
  }
}
