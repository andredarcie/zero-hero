import Phaser from 'phaser';

import { ASSET_KEYS, FONT_FAMILY, SCENE_DEPTHS, TILE_GAP } from '@/game/constants';

type PaletteMetrics = {
  tileSize: number;
  columns: number;
  rows: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

type PaletteButton = {
  tile: number | null;
  background: Phaser.GameObjects.Rectangle;
  border: Phaser.GameObjects.Rectangle;
  sprite?: Phaser.GameObjects.Sprite;
  label?: Phaser.GameObjects.Text;
};

export class TilePalette {
  private readonly buttons: PaletteButton[] = [];
  private readonly selection: Phaser.GameObjects.Rectangle;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly onSelect: (tile: number | null) => void,
  ) {
    this.selection = scene.add.rectangle(0, 0, 1, 1)
      .setOrigin(0)
      .setStrokeStyle(2, 0xf4a261, 1)
      .setVisible(false)
      .setDepth(SCENE_DEPTHS.paletteSelection);
  }

  public render(metrics: PaletteMetrics, selectedTile: number | null): void {
    this.buttons.forEach((button) => {
      button.background.destroy();
      button.border.destroy();
      button.sprite?.destroy();
      button.label?.destroy();
    });
    this.buttons.length = 0;

    const texture = this.scene.textures.get(ASSET_KEYS.forestTileset);
    const frameCount = Math.max(1, texture.frameTotal - 1);
    const tiles: Array<number | null> = [null, ...Array.from({ length: frameCount }, (_, index) => index)];

    tiles.forEach((tile, index) => {
      const column = index % metrics.columns;
      const row = Math.floor(index / metrics.columns);
      const x = metrics.offsetX + (column * (metrics.tileSize + TILE_GAP));
      const y = metrics.offsetY + (row * (metrics.tileSize + TILE_GAP));
      const background = this.scene.add.rectangle(x, y, metrics.tileSize, metrics.tileSize, 0x17323b, 1)
        .setOrigin(0)
        .setDepth(SCENE_DEPTHS.ui)
        .setStrokeStyle(1, 0x40646d, 1)
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.onSelect(tile));
      const border = this.scene.add.rectangle(x, y, metrics.tileSize, metrics.tileSize)
        .setOrigin(0)
        .setStrokeStyle(1, 0x40646d, 1)
        .setDepth(SCENE_DEPTHS.uiOverlay)
        .setFillStyle(0, 0);

      if (tile === null) {
        const label = this.scene.add.text(x + (metrics.tileSize / 2), y + (metrics.tileSize / 2), 'X', {
          color: '#f1faee',
          fontFamily: FONT_FAMILY,
          fontSize: '16px',
        }).setOrigin(0.5).setDepth(SCENE_DEPTHS.uiLabel);
        this.buttons.push({ tile, background, border, label });
      } else {
        const sprite = this.scene.add.sprite(x, y, ASSET_KEYS.forestTileset, tile)
          .setOrigin(0)
          .setDisplaySize(metrics.tileSize, metrics.tileSize)
          .setDepth(SCENE_DEPTHS.uiLabel);
        this.buttons.push({ tile, background, border, sprite });
      }
    });

    this.refreshSelection(selectedTile);
  }

  public refreshSelection(selectedTile: number | null): void {
    const button = this.buttons.find((entry) => entry.tile === selectedTile);
    if (!button) {
      this.selection.setVisible(false);
      return;
    }

    this.selection
      .setVisible(true)
      .setPosition(button.background.x, button.background.y)
      .setSize(button.background.width, button.background.height);
  }
}
