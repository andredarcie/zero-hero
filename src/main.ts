import '@/styles/global.css';
import { ZeroTheHeroGame } from '@/game/ZeroTheHeroGame';

const appMode = window.location.pathname.endsWith('/editor') ? 'editor' : 'game';

declare global {
  interface Window {
    zeroTheHeroGame?: ZeroTheHeroGame;
  }
}

// Phaser rasterizes each Text to a canvas the first time it renders and caches it. If the
// pixel font isn't loaded yet, that first render uses the monospace fallback and is never
// refreshed — which is exactly the "blurry / wrong" text. So we wait for the self-hosted
// font to be ready, then boot the game.
const startGame = (): void => {
  const game = new ZeroTheHeroGame('app', appMode);
  window.zeroTheHeroGame = game;
};

const fonts = document.fonts;
if (fonts && typeof fonts.load === 'function') {
  Promise.all([fonts.load('8px "Press Start 2P"'), fonts.load('16px "Press Start 2P"')])
    .then(() => fonts.ready)
    .catch(() => undefined)
    .finally(startGame);
} else {
  startGame();
}
