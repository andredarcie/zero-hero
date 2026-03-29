import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  public static readonly key = 'boot';

  public constructor() {
    super(BootScene.key);
  }

  public create(): void {
    this.scene.start('preload');
  }
}
