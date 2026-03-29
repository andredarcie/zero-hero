import Phaser from 'phaser';

import { DEFAULT_GAME_HEIGHT, DEFAULT_GAME_WIDTH } from '@/game/constants';
import { BootScene } from '@/game/scenes/BootScene';
import { EditorScene } from '@/game/scenes/EditorScene';
import { GameScene } from '@/game/scenes/GameScene';
import { PreloadScene } from '@/game/scenes/PreloadScene';

export type AppMode = 'game' | 'editor';

const getViewportSize = (): { width: number; height: number } => ({
  width: window.innerWidth || DEFAULT_GAME_WIDTH,
  height: window.innerHeight || DEFAULT_GAME_HEIGHT,
});

export const createGameConfig = (parent: string, mode: AppMode): Phaser.Types.Core.GameConfig => ({
  type: Phaser.AUTO,
  parent,
  width: getViewportSize().width,
  height: getViewportSize().height,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: getViewportSize().width,
    height: getViewportSize().height,
  },
  scene: [BootScene, PreloadScene, mode === 'editor' ? EditorScene : GameScene],
});
