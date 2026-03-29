import type Phaser from 'phaser';

import { ASSET_KEYS, FONT_FAMILY, GRID_COLUMNS, GRID_ROWS, SCENE_DEPTHS } from '@/game/constants';
import type { LevelExport } from '@/game/levelEditor';
import type { GridCell } from '@/game/shared/grid';
import { resolveBoardCell, toIndex } from '@/game/shared/grid';

type EditorBoardMetrics = {
  tileSize: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

export class EditorBoard {
  private readonly boardTileSprites: Phaser.GameObjects.Sprite[] = [];
  private readonly upperTileSprites: Phaser.GameObjects.Sprite[] = [];
  private readonly collisionMarkers: Phaser.GameObjects.Text[] = [];
  private readonly boardGrid: Phaser.GameObjects.Graphics;
  private readonly hoverHighlight: Phaser.GameObjects.Rectangle;

  public constructor(private readonly scene: Phaser.Scene) {
    this.boardGrid = scene.add.graphics().setDepth(SCENE_DEPTHS.grid);
    this.hoverHighlight = scene.add.rectangle(0, 0, 1, 1)
      .setOrigin(0)
      .setStrokeStyle(2, 0xf4a261, 1)
      .setFillStyle(0xf4a261, 0.15)
      .setVisible(false)
      .setDepth(12);

    for (let row = 0; row < GRID_ROWS; row += 1) {
      for (let column = 0; column < GRID_COLUMNS; column += 1) {
        this.boardTileSprites.push(scene.add.sprite(0, 0, ASSET_KEYS.forestTileset, 0).setOrigin(0).setDepth(1));
        this.upperTileSprites.push(scene.add.sprite(0, 0, ASSET_KEYS.forestTileset, 0).setOrigin(0).setDepth(3));
        this.collisionMarkers.push(scene.add.text(0, 0, 'C', {
          color: '#ff6b6b',
          fontFamily: FONT_FAMILY,
          fontSize: '16px',
          stroke: '#081014',
          strokeThickness: 4,
        }).setDepth(6).setOrigin(0.5).setVisible(false));
      }
    }
  }

  public layout(metrics: EditorBoardMetrics): void {
    for (let row = 0; row < GRID_ROWS; row += 1) {
      for (let column = 0; column < GRID_COLUMNS; column += 1) {
        const index = toIndex(column, row);
        const x = metrics.offsetX + (column * metrics.tileSize);
        const y = metrics.offsetY + (row * metrics.tileSize);

        this.boardTileSprites[index].setPosition(x, y).setDisplaySize(metrics.tileSize, metrics.tileSize);
        this.upperTileSprites[index].setPosition(x, y).setDisplaySize(metrics.tileSize, metrics.tileSize);
        this.collisionMarkers[index].setPosition(x + (metrics.tileSize / 2), y + (metrics.tileSize / 2));
      }
    }
  }

  public render(level: LevelExport, metrics: EditorBoardMetrics): void {
    for (let row = 0; row < GRID_ROWS; row += 1) {
      for (let column = 0; column < GRID_COLUMNS; column += 1) {
        const index = toIndex(column, row);
        const groundTile = level.layers.ground[row][column];
        const upperTile = level.layers.upper[row][column];
        const groundCollision = level.collisions.ground[row][column];
        const upperCollision = level.collisions.upper[row][column];

        this.boardTileSprites[index].setFrame(groundTile).setVisible(true);
        this.upperTileSprites[index].setVisible(upperTile !== null);
        if (upperTile !== null) {
          this.upperTileSprites[index].setFrame(upperTile);
        }

        this.collisionMarkers[index]
          .setVisible(groundCollision || upperCollision)
          .setText(groundCollision && upperCollision ? 'G/U' : groundCollision ? 'G' : 'U')
          .setFontSize(metrics.tileSize > 44 ? '18px' : '12px');
      }
    }

    this.drawGrid(metrics);
  }

  public refreshHover(metrics: EditorBoardMetrics, hoveredCell: GridCell | null): void {
    if (!hoveredCell) {
      this.hoverHighlight.setVisible(false);
      return;
    }

    this.hoverHighlight
      .setVisible(true)
      .setPosition(metrics.offsetX + (hoveredCell.column * metrics.tileSize), metrics.offsetY + (hoveredCell.row * metrics.tileSize))
      .setSize(metrics.tileSize, metrics.tileSize);
  }

  public resolveCell(metrics: EditorBoardMetrics, worldX: number, worldY: number): GridCell | null {
    return resolveBoardCell(worldX, worldY, metrics);
  }

  private drawGrid(metrics: EditorBoardMetrics): void {
    this.boardGrid.clear();
    this.boardGrid.lineStyle(1, 0x0d1b21, 0.8);

    for (let column = 0; column <= GRID_COLUMNS; column += 1) {
      const x = metrics.offsetX + (column * metrics.tileSize);
      this.boardGrid.lineBetween(x, metrics.offsetY, x, metrics.offsetY + metrics.height);
    }

    for (let row = 0; row <= GRID_ROWS; row += 1) {
      const y = metrics.offsetY + (row * metrics.tileSize);
      this.boardGrid.lineBetween(metrics.offsetX, y, metrics.offsetX + metrics.width, y);
    }
  }
}
