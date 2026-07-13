import Phaser from 'phaser';

import {
  DEFAULT_GAME_HEIGHT,
  DEFAULT_GAME_WIDTH,
} from '@/game/constants';
import { BootScene } from '@/game/scenes/BootScene';
import { EditorScene } from '@/game/scenes/EditorScene';
import { GameScene } from '@/game/scenes/GameScene';
import { IntroScene } from '@/game/scenes/IntroScene';
import { LanguageScene } from '@/game/scenes/LanguageScene';
import { PreloadScene } from '@/game/scenes/PreloadScene';
import { TitleScene } from '@/game/scenes/TitleScene';
import { SurvivorsScene } from '@/game/survivors/SurvivorsScene';

export type AppMode = 'game' | 'editor';

// The game canvas fills the whole window (100% of the screen). The tile size is derived from
// this size at runtime (see GameScene.computeTileSize → min(width/12, height/12)), so the hero
// stays centred with ~one chunk visible in the shorter dimension and more world along the wider.
const getGameCanvasSize = (): { width: number; height: number } => ({
  width: window.innerWidth || DEFAULT_GAME_WIDTH,
  height: window.innerHeight || DEFAULT_GAME_HEIGHT,
});

export const getCanvasSizeForMode = (mode: AppMode): { width: number; height: number } => {
  if (mode === 'editor') {
    return {
      width: window.innerWidth || DEFAULT_GAME_WIDTH,
      height: window.innerHeight || DEFAULT_GAME_HEIGHT,
    };
  }

  return getGameCanvasSize();
};

export const createGameConfig = (parent: string, mode: AppMode): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  parent,
  width: getCanvasSizeForMode(mode).width,
  height: getCanvasSizeForMode(mode).height,
  backgroundColor: '#1d3557',
  // The world itself renders on a Three.js canvas UNDERNEATH this one (see
  // render3d/World3D.ts): Phaser draws logic-side FX + canvas UI over it, so
  // its canvas must be transparent. Scenes that want a solid backdrop (title,
  // intro, editor) set their own camera background color.
  transparent: true,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: getCanvasSizeForMode(mode).width,
    height: getCanvasSizeForMode(mode).height,
  },
  // Editor mode also registers GameScene so the editor can live-playtest the world in
  // memory (EditorScene.startPlaytest) without saving or leaving the page.
  scene: [BootScene, PreloadScene, ...(mode === 'editor' ? [EditorScene, GameScene] : [TitleScene, LanguageScene, IntroScene, GameScene, SurvivorsScene])],
});
