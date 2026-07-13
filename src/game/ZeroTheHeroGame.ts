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
    // Dev-only escape hatch, like window.__scene (see debugHooks): a hidden/headless tab
    // freezes RAF, and stepping the game manually needs the Game BEFORE any scene registers
    // its hooks (e.g. to drive the preloader forward).
    if (import.meta.env.DEV) (window as unknown as { __game?: Phaser.Game }).__game = this.game;
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
