// OS MINI-GAMES SOLTOS: abre um mini-game sozinho (sem a quest em volta, com respostas vazias) para o `legendas`
// conferir a frase do rodapé e o que ela cobre. A colheita de cogumelos abre pelo jogo (gameDebug.forage).

import { PaintingOverlay } from '@/game/runtime/PaintingOverlay';
import { LensOverlay, SkyOverlay } from '@/game/runtime/SkyOverlays';
import { FireLightOverlay, SplitOverlay } from '@/game/runtime/WoodcraftOverlays';

export type MinigameName = 'split' | 'fire' | 'lens' | 'sky' | 'paint';

/** Qualquer callback que o mini-game pedir é uma função vazia. */
const noop = <T>(): T => new Proxy({}, { get: () => () => {} }) as T;

export const minigameProbe = () => {
  let open: { destroy: () => void } | null = null;
  const close = (): void => {
    open?.destroy();
    open = null;
  };
  return {
    /** Abre o mini-game `name` sozinho (fecha o que estiver aberto antes). */
    open: (name: MinigameName): void => {
      close();
      open = {
        split: () => new SplitOverlay(noop(), 0),
        fire: () => new FireLightOverlay(noop(), document.createElement('canvas')),
        lens: () => new LensOverlay(noop()),
        sky: () => new SkyOverlay(noop(), []),
        paint: () => new PaintingOverlay(noop()),
      }[name]();
    },
    close,
  };
};
