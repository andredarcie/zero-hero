import type Phaser from 'phaser';

import { ASSET_KEYS } from '@/game/constants';
import type { GridCell } from '@/game/shared/grid';
import { ItemBase } from '@/game/items/ItemBase';

export class KeyItem extends ItemBase {
  public constructor(scene: Phaser.Scene, cell: GridCell) {
    super(scene, cell, ASSET_KEYS.keyItemIcon, ASSET_KEYS.keyItemIcon);
  }
}
