import type Phaser from 'phaser';

import { ASSET_KEYS, ITEM_FRAMES } from '@/game/constants';
import type { GridCell } from '@/game/shared/grid';
import { ItemBase } from '@/game/items/ItemBase';

export class SwordItem extends ItemBase {
  public constructor(scene: Phaser.Scene, cell: GridCell) {
    super(scene, cell, ASSET_KEYS.swordItem, ASSET_KEYS.swordItemIcon, ITEM_FRAMES.swordIdle);
  }
}
