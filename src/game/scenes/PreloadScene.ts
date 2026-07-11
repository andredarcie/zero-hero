import Phaser from 'phaser';

import { FONT_FAMILY, TEXT_RESOLUTION } from '@/game/constants';
import { preloadSharedAssets } from '@/game/assets/assetManifest';
import type { AppMode } from '@/game/config';
import { t } from '@/game/i18n/i18n';
import { setWorldData } from '@/game/world/WorldData';

const WORLD_JSON_KEY = 'world';

export class PreloadScene extends Phaser.Scene {
  public static readonly key = 'preload';

  public constructor() {
    super(PreloadScene.key);
  }

  public preload(): void {
    preloadSharedAssets(this);

    // The playable world is fully defined by world.json. Load it here (only the game needs
    // it) so WorldData is ready before GameScene.create runs.
    const mode = this.registry.get('appMode') as AppMode | undefined;
    if (mode !== 'editor') {
      this.load.json(WORLD_JSON_KEY, `${import.meta.env.BASE_URL}world.json`);
    }

    const { width, height } = this.scale;
    const box = this.add.rectangle(width / 2, height / 2, 180, 18, 0x1f2933).setOrigin(0.5);
    const bar = this.add.rectangle(width / 2 - 86, height / 2, 4, 10, 0xf4a261).setOrigin(0, 0.5);
    const label = this.add
      .text(width / 2, height / 2 - 24, t('loading'), {
        color: '#f1faee',
        fontFamily: FONT_FAMILY,
        fontSize: '12px',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      bar.width = 172 * value;
    });

    this.load.once('complete', () => {
      box.destroy();
      bar.destroy();
      label.destroy();
    });
  }

  public create(): void {
    const mode = this.registry.get('appMode') as AppMode | undefined;
    if (mode !== 'editor') {
      setWorldData(this.cache.json.get(WORLD_JSON_KEY));
    }
    this.scene.start(mode === 'editor' ? 'editor' : 'title');
  }
}
