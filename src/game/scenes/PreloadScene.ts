import Phaser from 'phaser';

import { FONT_FAMILY, TEXT_RESOLUTION } from '@/game/constants';
import { preloadSharedAssets } from '@/game/assets/assetManifest';
import type { AppMode } from '@/game/config';
import { t } from '@/game/i18n/i18n';
import { hasAdventureSave, requestAdventureRespawn } from '@/game/runtime/adventureState';
import { preloadTextures3D } from '@/game/render3d/textures3d';
import { setWorldData } from '@/game/world/WorldData';

const WORLD_JSON_KEY = 'world';

export class PreloadScene extends Phaser.Scene {
  public static readonly key = 'preload';

  public constructor() {
    super(PreloadScene.key);
  }

  public preload(): void {
    preloadSharedAssets(this);

    // O MUNDO É UM SÓ, e ele é o `world.json` (a superfície; o subterrâneo é o espelho, e a
    // GameScene o busca na travessia da escada). Carregado aqui — só o jogo precisa dele — para
    // o WorldData estar pronto antes de GameScene.create rodar; o editor busca via /api/world.
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
    if (mode === 'editor') {
      // The editor never uses the 3D world renderer — but its live playtest
      // does, so the textures still load (in the background) before any play.
      void preloadTextures3D();
      this.scene.start('editor');
      return;
    }

    setWorldData(this.cache.json.get(WORLD_JSON_KEY));

    // The 3D world renderer needs its texture set before GameScene builds the
    // world; hold the scene hand-off until both loaders are done.
    void preloadTextures3D().then(() => {
      const params = new URLSearchParams(window.location.search);
      // Dev shortcut: skip the title and start the authored open world.
      if (import.meta.env.DEV && params.has('play')) {
        if (hasAdventureSave()) requestAdventureRespawn();
        this.scene.start('game');
        return;
      }
      // O menu inteiro: o titulo, e dele direto pro mundo.
      this.scene.start('title');
    });
  }
}
