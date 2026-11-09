// A CENA COMO UM TODO: as cenas de cinema (a espada fincada da abertura, a câmera que aproxima, a rachadura no chão), a
// forja, a pausa, o item nas costas e o relógio da cena (tweens, escala do tempo, quadro).

import type { GameScene } from '@/game/scenes/GameScene';

export const sceneProbe = (s: GameScene) => ({
  /** A espada da abertura: na mão do herói, fincada (onde e inclinada quanto), e a rachadura no chão. */
  sword: () => {
    const sp = s.swordPlanting;
    return {
      inHands: sp.swordInHands,
      planted: Boolean(sp.plantedSword),
      tile: sp.plantedSwordTile ?? null,
      angle: sp.plantedSword?.angle ?? null,
      crack: Boolean(s.cinema.groundCrack),
    };
  },
  /** O quanto a câmera está aproximada (1 = a altura de sempre). */
  dolly: (): number => s.world3d ? s.world3d.params.camHeight / (s.cinema.dollyBase?.h ?? s.world3d.params.camHeight) : 1,
  /** Aproxima (ou afasta) a câmera, como as cenas de cinema fazem. */
  dollyTo: (factor: number, ms: number): void => { void s.cinema.dollyTo(factor, ms); },
  /** O item nas costas do herói: existe, aparece. */
  backItem: () => ({ exists: s.carry.backItemBb !== undefined, visible: Boolean(s.carry.backItemBb?.visible) }),
  /** Para onde o herói olha. */
  facing: () => ({ ...(s.movementController?.facing ?? { dx: 0, dy: 1 }) }),
  /** A bigorna sendo malhada agora? E o balão do forno pedindo carvão/minério. */
  forging: (): boolean => Boolean(s.forge.forging),
  furnaceAsk: (): string | null => s.forge.furnaceAsk?.visibleIcon ?? null,
  openPause: (): void => s.pause.openPauseMenu(),
  /** O herói recebe a chave do jardim (a cerimônia do fim), como quando o último pedido fecha. */
  giveGardenKey: (): void => s.gardenUnlock.giveGardenKey(undefined),
  /** Pausa e retoma a cena como a engine faz (o relógio e os tweens param juntos). */
  pauseScene: (): void => { s.scene.pause(); },
  resumeScene: (): void => { s.scene.resume(); },
  /** O centro horizontal da câmera 2D na tela (ela segue o herói; um empurrão a desloca). */
  cameraCentreX: (): number | null => s.camera?.screenCenterX ?? null,
  /** Onde a câmera do mundo está, em tiles (ela anda junto com o desenho do herói). */
  camera: () => ({ x: s.camera?.camX ?? 0, y: s.camera?.camY ?? 0 }),
  /**
   * Chama `fn(time, delta)` no fim de cada quadro da cena, DEPOIS do passo do jogo (de fora, um requestAnimationFrame
   * leria a câmera e o relógio ora antes ora depois do passo). Devolve como desligar.
   */
  onFrame: (fn: (time: number, delta: number) => void): (() => void) => {
    s.events.on('postupdate', fn);
    return () => { s.events.off('postupdate', fn); };
  },
  /** O relógio da cena: o tempo dos tweens, se estão pausados, quantos rodam, a escala do tempo e o quadro. */
  clock: () => ({
    tweenScale: s.tweens.timeScale,
    tweensPaused: s.tweens.paused,
    tweens: s.tweens.getTweens().length,
    timeScale: s.time.timeScale,
    frame: s.game.loop.frame,
  }),
});
