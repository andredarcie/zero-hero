import type Phaser from 'phaser';

import { ASSET_KEYS } from '@/game/constants';
import type { GridCell } from '@/game/shared/grid';
import { ObjectBase } from '@/game/objects/ObjectBase';

export class LookedDoorObject extends ObjectBase {
  private open = false;

  public constructor(scene: Phaser.Scene, cell: GridCell) {
    super(scene, cell, ASSET_KEYS.lookedDoorObject);
    this.setWorldSizeMultiplier(1.1);
  }

  public get isOpen(): boolean {
    return this.open;
  }

  public override get blocksMovement(): boolean {
    return !this.open;
  }

  public setOpen(open: boolean): void {
    this.open = open;
    this.sprite.setAlpha(open ? 0.45 : 1);
  }
}
