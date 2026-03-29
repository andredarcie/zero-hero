import type Phaser from 'phaser';

import { ITEM_FRAME_SIZE, ASSET_KEYS } from '@/game/constants';
import type { GridCell } from '@/game/shared/grid';
import { ItemBase } from '@/game/items/ItemBase';

export class SwordItem extends ItemBase {
  public constructor(scene: Phaser.Scene, cell: GridCell) {
    super(scene, cell, ASSET_KEYS.swordItem, ASSET_KEYS.swordItemIcon);
    this.setSourceFrameSize(ITEM_FRAME_SIZE, ITEM_FRAME_SIZE);
  }
}
