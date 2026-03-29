import '@/styles/global.css';
import { ZeroTheHeroGame } from '@/game/ZeroTheHeroGame';

const appMode = window.location.pathname.endsWith('/editor') ? 'editor' : 'game';
const game = new ZeroTheHeroGame('app', appMode);

declare global {
  interface Window {
    zeroTheHeroGame?: ZeroTheHeroGame;
  }
}

window.zeroTheHeroGame = game;
