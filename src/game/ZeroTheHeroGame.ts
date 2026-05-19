import Phaser from 'phaser';

import { createGameConfig, getCanvasSizeForMode, type AppMode } from '@/game/config';

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
    last_exported_level_json?: string;
  }
}

export class ZeroTheHeroGame {
  private readonly game: Phaser.Game;
  private readonly mode: AppMode;
  private readonly handleResizeBound: () => void;

  public constructor(parent: string, mode: AppMode) {
    this.mode = mode;
    this.game = new Phaser.Game(createGameConfig(parent, mode));
    this.game.registry.set('appMode', mode);
    this.handleResizeBound = () => {
      const { width, height } = getCanvasSizeForMode(this.mode);
      this.game.scale.resize(width, height);
    };
    window.addEventListener('resize', this.handleResizeBound);
  }

  public destroy(removeCanvas = false): void {
    window.removeEventListener('resize', this.handleResizeBound);
    this.game.destroy(removeCanvas);
  }
}
