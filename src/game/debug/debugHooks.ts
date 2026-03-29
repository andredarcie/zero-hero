import type Phaser from 'phaser';

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
    last_exported_level_json?: string;
  }
}

export const registerSceneDebugHooks = (
  scene: Phaser.Scene,
  renderGameToText: () => string,
): void => {
  window.render_game_to_text = renderGameToText;
  window.advanceTime = (ms: number) => {
    const step = 1000 / 60;
    const iterations = Math.max(1, Math.round(ms / step));
    let elapsed = scene.time.now;

    for (let index = 0; index < iterations; index += 1) {
      elapsed += step;
      scene.game.step(elapsed, step);
    }
  };
};
