/**
 * O MOTOR LIGADO NUM TESTE: um `Game` de verdade no anfitrião do Node (nodeHost.ts), pronto (as três texturas de
 * fábrica carregadas, as cenas instanciadas e a primeira ligada), e um `tick` que anda os quadros pelo mesmo caminho
 * do navegador — o relógio avança, o quadro pedido roda, o TimeStep suaviza o delta e o jogo dá o passo.
 */
import * as Engine from '@/game/engine';
import { createNodeHost, type NodeHost } from './nodeHost';

export interface BootedEngine {
  game: Engine.Game;
  host: NodeHost;
  /** Anda `frames` quadros de `ms` cada um. */
  tick(frames?: number, ms?: number): void;
  /** Anda quadros até `done()` ou até o limite (falha se não chegar). */
  until(done: () => boolean, maxFrames?: number, ms?: number): Promise<void>;
}

export const bootEngine = async (
  scenes: Array<new () => Engine.Scene>,
  options: { page?: boolean; width?: number; height?: number; pixelArt?: boolean; transparent?: boolean; backgroundColor?: string | number } = {},
): Promise<BootedEngine> => {
  const host = createNodeHost({ page: options.page });
  const game = new Engine.Game({
    host,
    width: options.width ?? 320,
    height: options.height ?? 240,
    pixelArt: options.pixelArt ?? true,
    transparent: options.transparent ?? true,
    backgroundColor: options.backgroundColor,
    scene: scenes,
  });
  await new Promise<void>((resolve) => {
    if (game.isRunning) resolve();
    else game.events.once(Engine.Core.Events.READY, () => resolve());
  });
  const tick = (frames = 1, ms = 1000 / 60): void => {
    for (let i = 0; i < frames; i++) {
      host.advance(ms);
      host.frame();
    }
  };
  const until = async (done: () => boolean, maxFrames = 600, ms = 1000 / 60): Promise<void> => {
    for (let i = 0; i < maxFrames; i++) {
      if (done()) return;
      tick(1, ms);
      if (host.pendingImages > 0) await host.settle();
    }
    if (!done()) throw new Error(`não chegou em ${maxFrames} quadros`);
  };
  return { game, host, tick, until };
};
