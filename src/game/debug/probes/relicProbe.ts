// AS RELÍQUIAS ENTERRADAS (scenes/game/RelicDig) e a torre do cume (objects/CellTower).

import type { GameScene } from '@/game/scenes/GameScene';

export const relicProbe = (s: GameScene) => ({
  /** Cada relíquia: onde está enterrada, se já saiu da terra, e se uma cavada está no meio. */
  list: () => s.relics.state,
  /** O tile (x, y): a relíquia que ainda guarda, e se a pá cavaria ali de frente ou de pé em cima. */
  at: (x: number, y: number) => ({
    buried: s.relics.buriedAt(x, y) ?? null,
    front: s.relics.canDigAt(x, y),
    underfoot: s.relics.canDigAt(x, y, true),
  }),
  /** A cerimônia de "você encontrou" está aberta? */
  ceremony: (): boolean => s.hand.itemGetOpen,
  /**
   * A torre do cume: o tile, se ele barra o corpo, o quanto a luz está acesa agora (0 a 1) e o quanto o topo está fora
   * do prumo do pé na tela (pixels).
   */
  tower: () => {
    const t = s.valley.cellTower;
    return t ? { x: t.x, y: t.y, solid: s.query.isSolidForEntities(t.x, t.y), lit: t.lit, lean: t.lean, back: t.backDegrees } : null;
  },
});
