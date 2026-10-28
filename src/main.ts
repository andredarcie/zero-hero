import '@/styles/global.css';
import { ZeroTheHeroGame } from '@/game/ZeroTheHeroGame';
import { installDevLauncher } from '@/game/debug/DevLauncher';
import { applyHtmlLang } from '@/game/i18n/i18n';
import { warmPaper } from '@/game/runtime/uiStyle';

// DUAS ROTAS, e só: `/` é o jogo e `/editor` é o editor do mundo aberto — os DOIS andares dele
// (a superfície e o espelho subterrâneo, `?under`). O `/lab` foi removido junto com os levels
// isolados: ele era o mesmo editor sobre uma tela solta de puzzle, e não há mais tela solta.
const pathname = window.location.pathname;
const appMode = pathname.endsWith('/editor') ? 'editor' : 'game';

// Reflect the detected/saved locale on <html lang> before the game boots (the language screen
// updates it again once the player picks).
applyHtmlLang();

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
  warmPaper();
};

// [I] anywhere in dev pops the launcher (jogo / editor). No-ops in a real build.
installDevLauncher();

const fonts = document.fonts;
if (fonts && typeof fonts.load === 'function') {
  // As tres vozes da interface (ver runtime/uiStyle.ts): o pixel, o livro e a pena. O Phaser
  // tambem escreve com as duas ultimas (o cartao de item ganho), entao todas esperam aqui.
  Promise.all([
    fonts.load('8px "Press Start 2P"'), fonts.load('16px "Press Start 2P"'),
    fonts.load('16px "Alegreya"'), fonts.load('500 16px "Alegreya"'), fonts.load('italic 16px "Alegreya"'),
    fonts.load('600 16px "Caveat"'),
  ])
    .then(() => fonts.ready)
    .catch(() => undefined)
    .finally(startGame);
} else {
  startGame();
}
