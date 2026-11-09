import * as Engine from '@/game/engine';

export class BootScene extends Engine.Scene {
  public static readonly key = 'boot';

  public constructor() {
    super(BootScene.key);
  }

  public create(): void {
    this.scene.start('preload');
  }
}
