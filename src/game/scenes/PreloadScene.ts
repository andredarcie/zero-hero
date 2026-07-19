import Phaser from 'phaser';

import { FONT_FAMILY, TEXT_RESOLUTION } from '@/game/constants';
import { preloadSharedAssets } from '@/game/assets/assetManifest';
import type { AppMode } from '@/game/config';
import { t } from '@/game/i18n/i18n';
import { setActiveLevel } from '@/game/runtime/activeLevel';
import { preloadTextures3D } from '@/game/render3d/textures3d';
import { setWorldData } from '@/game/world/WorldData';

const WORLD_JSON_KEY = 'world';

// `?level=N` → N (a positive integer), else null. The single source of truth for both which
// file to load and whether to skip straight into gameplay.
const levelNumberFromUrl = (): number | null => {
  const raw = new URLSearchParams(window.location.search).get('level');
  return raw !== null && /^\d+$/u.test(raw) ? Number(raw) : null;
};
const levelFileFromUrl = (): string | null => {
  const n = levelNumberFromUrl();
  return n === null ? null : `levels/level-${n}.json`;
};
// The level the /lab editor edits / plays — `?level=N`, default 1.
const labLevelNumber = (): number => levelNumberFromUrl() ?? 1;

export class PreloadScene extends Phaser.Scene {
  public static readonly key = 'preload';

  public constructor() {
    super(PreloadScene.key);
  }

  public preload(): void {
    preloadSharedAssets(this);

    // The playable world is fully defined by world.json. Load it here (only the game needs
    // it) so WorldData is ready before GameScene.create runs. The lab loads its puzzle level
    // file so `/lab?play` can boot straight into gameplay; the editor fetches via /api/world.
    const mode = this.registry.get('appMode') as AppMode | undefined;
    const levelFile = levelFileFromUrl();
    if (mode === 'lab') {
      this.load.json(WORLD_JSON_KEY, `${import.meta.env.BASE_URL}levels/level-${labLevelNumber()}.json`);
    } else if (mode !== 'editor') {
      // `?level=N` boots a standalone puzzle level (public/levels/level-N.json) instead of the
      // real overworld — the shareable entry point the title's "Jogar levels" list uses.
      this.load.json(WORLD_JSON_KEY, `${import.meta.env.BASE_URL}${levelFile ?? 'world.json'}`);
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

    if (mode === 'lab') {
      // `/lab` opens the puzzle-laboratory editor; `/lab?play` skips it and boots the
      // level directly in the GameScene (how the playtest harness enters).
      if (new URLSearchParams(window.location.search).has('play')) {
        setWorldData(this.cache.json.get(WORLD_JSON_KEY));
        setActiveLevel(labLevelNumber());
        void preloadTextures3D().then(() => {
          this.scene.start('game');
        });
      } else {
        void preloadTextures3D();
        this.scene.start('editor');
      }
      return;
    }

    setWorldData(this.cache.json.get(WORLD_JSON_KEY));
    // Mark whether we booted a level (drives the level-aware pause menu); null = adventure.
    setActiveLevel(levelNumberFromUrl());

    // The 3D world renderer needs its texture set before GameScene builds the
    // world; hold the scene hand-off until both loaders are done.
    void preloadTextures3D().then(() => {
      const params = new URLSearchParams(window.location.search);
      // `?survivors` drops straight into the Vampire-Survivors-style mode (also
      // reachable from the title screen with [S]). Works in any environment —
      // it's a shareable entry point, not a dev-only shortcut.
      if (params.has('survivors')) {
        this.scene.start('survivors');
        return;
      }
      // `?level=N` is a direct link into a single puzzle level — skip title/language/intro
      // and boot the level straight into gameplay (works in any environment: the title's
      // "Jogar levels" list is the in-game path to the same worlds).
      if (levelNumberFromUrl() !== null) {
        this.scene.start('game');
        return;
      }
      // Dev shortcut (localhost only): `?play` skips language/title/intro and
      // drops straight into gameplay — e.g. http://localhost:5209/?play
      if (import.meta.env.DEV && params.has('play')) {
        this.scene.start('game');
        return;
      }
      // The menu flow: pick a language first (so the title's buttons are localized), then
      // the title (Language → Title → aventura|levels).
      this.scene.start('language');
    });
  }
}
