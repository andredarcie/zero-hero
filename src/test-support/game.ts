/**
 * O JOGO INTEIRO NUM TESTE: o `ZeroTheHeroGame` de verdade, montado na plataforma dos testes (testPlatform.ts) —
 * as mesmas cenas, o mesmo carregamento de `public/`, o mesmo mundo 3D (desenhando no renderizador nulo) e as
 * mesmas telas em DOM (o jsdom). O teste anda os quadros, aperta as teclas e lê o estado pelo `gameDebug`, como os
 * playtests fazem no navegador — só que em segundos e sem tela.
 *
 * Só roda em arquivo de teste com `// @vitest-environment jsdom` (as telas do jogo são DOM).
 */
import type * as Engine from '@/game/engine';
import { platform } from '@/game/platform/platform';
import { ZeroTheHeroGame } from '@/game/ZeroTheHeroGame';
import type { TestPlatform } from './testPlatform';

export interface BootedGame {
  app: ZeroTheHeroGame;
  game: Engine.Game;
  platform: TestPlatform;
  tick(frames?: number, ms?: number): void;
  until(done: () => boolean, maxFrames?: number, ms?: number): Promise<void>;
  scene<T extends Engine.Scene = Engine.Scene>(key: string): T;
}

/** Sobe o jogo (`?play` pula o título, como no dev) e espera a cena pedida ligar. */
export const bootGame = async (options: { play?: boolean; mode?: 'game' | 'editor'; waitFor?: string } = {}): Promise<BootedGame> => {
  const p = platform() as TestPlatform;
  const host = p.engineHost;
  window.history.replaceState(null, '', options.mode === 'editor' ? '/editor' : options.play === false ? '/' : '/?play');
  document.body.innerHTML = '<div id="app"></div>';
  const app = new ZeroTheHeroGame('app', options.mode ?? 'game');
  const game = (app as unknown as { game: Engine.Game }).game;
  const tick = (frames = 1, ms = 1000 / 60): void => {
    for (let i = 0; i < frames; i++) {
      host.advance(ms);
      host.frame();
    }
  };
  const until = async (done: () => boolean, maxFrames = 2000, ms = 1000 / 60): Promise<void> => {
    for (let i = 0; i < maxFrames; i++) {
      if (done()) return;
      tick(1, ms);
      if (host.pendingImages > 0) await host.settle();
      else if (i % 20 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (!done()) throw new Error(`não chegou em ${maxFrames} quadros`);
  };
  const booted: BootedGame = {
    app,
    game,
    platform: p,
    tick,
    until,
    scene: <T extends Engine.Scene>(key: string) => game.scene.getScene(key) as T,
  };
  const target = options.waitFor ?? (options.mode === 'editor' ? 'editor' : options.play === false ? 'title' : 'game');
  await host.settle();
  await until(() => game.scene.isActive(target) === true);
  return booted;
};
