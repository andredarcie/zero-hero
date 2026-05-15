export class WorldCamera {
  public worldX: number;
  public worldY: number;
  public screenCenterX: number;
  public screenCenterY: number;

  public constructor(worldX = 0, worldY = 0, screenCenterX = 0, screenCenterY = 0) {
    this.worldX = worldX;
    this.worldY = worldY;
    this.screenCenterX = screenCenterX;
    this.screenCenterY = screenCenterY;
  }

  public tileToScreen(tileX: number, tileY: number, tileSize: number): { x: number; y: number } {
    return {
      x: Math.round(this.screenCenterX + (tileX - this.worldX) * tileSize),
      y: Math.round(this.screenCenterY + (tileY - this.worldY) * tileSize),
    };
  }

  public getVisibleRange(tileSize: number, buffer = 1): { minX: number; maxX: number; minY: number; maxY: number } {
    const halfW = this.screenCenterX / tileSize;
    const halfH = this.screenCenterY / tileSize;
    return {
      minX: Math.floor(this.worldX - halfW) - buffer,
      maxX: Math.ceil(this.worldX + halfW) + buffer,
      minY: Math.floor(this.worldY - halfH) - buffer,
      maxY: Math.ceil(this.worldY + halfH) + buffer,
    };
  }
}
