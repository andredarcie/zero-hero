import Phaser from 'phaser';

import { createGameConfig, type AppMode } from '@/game/config';

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
    last_exported_level_json?: string;
  }
}

export class ZeroTheHeroGame {
  private readonly game: Phaser.Game;

  public constructor(parent: string, mode: AppMode) {
    this.game = new Phaser.Game(createGameConfig(parent, mode));
    this.game.registry.set('appMode', mode);
  }

  public destroy(removeCanvas = false): void {
    this.game.destroy(removeCanvas);
  }
}
