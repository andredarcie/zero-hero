import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import type { World3D } from '@/game/render3d/World3D';

/**
 * Open-world camera that stays centered on the hero. `camX`/`camY` are the (fractional)
 * world-tile coordinates currently under the screen centre; the hero is always drawn there
 * and the world scrolls underneath as `camX`/`camY` follow them.
 *
 * With the 3D world renderer attached (`world3d`), tileToScreen projects through
 * the real perspective camera — every Phaser-side overlay/FX that anchors to a
 * tile (heal motes, hint balloon, pips, dialog pan targets) lands exactly on the
 * 3D world without knowing it exists.
 */
export class WorldCamera {
  public camX: number;
  public camY: number;
  public screenCenterX: number;
  public screenCenterY: number;
  public viewportColumns: number; // visible tile counts (used for the streaming window)
  public viewportRows: number;
  public transitioning: boolean; // kept for API compatibility; always false now

  // The 3D world renderer, when active (GameScene). See tileToScreen.
  public world3d?: World3D;

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
    if (this.world3d) return this.world3d.projectTile(tileX, tileY);
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
