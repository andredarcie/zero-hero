// O FOGO NA MÃO E NO MATO: o graveto aceso (a chama, o combustível), acender, queimar um arbusto pelo mesmo caminho do
// jogador (o balanço, a faísca, o fogo) e os efeitos de fogo e fumaça.

import type { GameScene } from '@/game/scenes/GameScene';

export const fireProbe = (s: GameScene) => ({
  /** O graveto da mão: aceso, quanto combustível resta, e a chama 3D na ponta dele. */
  torch: () => {
    const bb = s.torch.torchFlameBb;
    return {
      lit: s.torch.isTorchLit,
      onFire: s.torch.heldOnFire,
      fuelMs: s.torch.torchFuelMs,
      flame: bb ? { visible: bb.visible, width: bb.displayWidth, texKey: bb.texKey } : null,
    };
  },
  /** AUTORIA: o que está na mão pega fogo, com `fuelMs` de chama (longe de apagar). */
  setOnFire: (fuelMs = 60000): void => {
    s.torch.heldOnFire = true;
    s.torch.torchFuelMs = fuelMs;
    s.carry.updateBackItem();
  },
  /** AUTORIA: apaga o que está na mão. */
  douse: (): void => {
    s.torch.heldOnFire = false;
    s.carry.updateBackItem();
  },
  /** Acende o que está na mão, como a lava ou uma fogueira acendem. */
  ignite: (): void => s.torch.igniteHeldItem(),
  /** O herói bate o fogo da mão no arbusto seco de (x, y): o balanço, o arbusto pegando, a faísca. */
  burnBush: (x: number, y: number): boolean => {
    const bush = s.props.dryBushes.find((b) => b.worldX === x && b.worldY === y);
    if (!bush) return false;
    s.swing.swingHeld(x, y);
    const lit = bush.ignite();
    s.sparkle.spawnFireHitEffect(x, y);
    return lit;
  },
  /** Os efeitos soltos: o foguinho de um golpe de fogo e a baforada de fumaça. */
  fireHit: (x: number, y: number): void => s.sparkle.spawnFireHitEffect(x, y),
  smokePuff: (x: number, y: number): void => s.debris.spawnSmokePuff(x, y),
});
