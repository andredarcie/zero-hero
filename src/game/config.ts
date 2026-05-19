import Phaser from 'phaser';

import {
  CHUNK_COLUMNS,
  CHUNK_ROWS,
  DEFAULT_GAME_HEIGHT,
  DEFAULT_GAME_WIDTH,
  HUD_RESERVED_ROWS,
  MIN_BOARD_TILE_SIZE,
} from '@/game/constants';
import { BootScene } from '@/game/scenes/BootScene';
import { EditorScene } from '@/game/scenes/EditorScene';
import { GameScene } from '@/game/scenes/GameScene';
import { PreloadScene } from '@/game/scenes/PreloadScene';

export type AppMode = 'game' | 'editor';

const getGameCanvasSize = (): { width: number; height: number } => {
  const viewportWidth = window.innerWidth || DEFAULT_GAME_WIDTH;
  const viewportHeight = window.innerHeight || DEFAULT_GAME_HEIGHT;
  const totalRows = CHUNK_ROWS + HUD_RESERVED_ROWS;
  const fittedTileSize = Math.floor(Math.min(viewportWidth / CHUNK_COLUMNS, viewportHeight / totalRows));
  const tileSize = Math.max(MIN_BOARD_TILE_SIZE, Math.min(36, fittedTileSize));

  return {
    width: CHUNK_COLUMNS * tileSize,
    height: totalRows * tileSize,
  };
};

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
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: getCanvasSizeForMode(mode).width,
    height: getCanvasSizeForMode(mode).height,
  },
  scene: [BootScene, PreloadScene, mode === 'editor' ? EditorScene : GameScene],
});
