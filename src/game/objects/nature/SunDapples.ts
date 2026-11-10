import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import { bosqueTrees } from '@/game/objects/BigTrees';
import { isLifeHome } from '@/game/world/biomeLife';

import { TILESET as P, hash, texture, window01, type NatureFrame, type NatureSystem } from './kit';

/**
 * A SOMBRA DA COPA (sugestão 11). Debaixo de uma copa o chão fica numa sombra macia, que só existe com sol (de dia,
 * sem chuva); de noite e no tempo fechado ela some. Para as árvores do bosque (objects/BigTrees); a sombra fica do
 * lado da frente do tronco, que é o que a câmera vê.
 *
 * As MANCHINHAS DE SOL que dançavam dentro dela (discos dourados de miolo branco, somando luz e piscando com o vento)
 * SAÍRAM a pedido do autor (2026-11-09: "achei que elas ficaram feias, pode remover do jogo").
 */

/** A sombra da copa: uma elipse de pixel duro, com a borda esfarelada. */
const SHADE = texture('dapple-shade', 40, 24, (put) => {
  for (let y = 0; y < 24; y += 1) {
    for (let x = 0; x < 40; x += 1) {
      const r = Math.hypot((x + 0.5 - 20) / 20, (y + 0.5 - 12) / 12);
      if (r > 1) continue;
      if (r > 0.82 && hash(x, y, 51) < 0.5) continue;
      put(x, y, P.night, 1);
    }
  }
});
interface Crown { shade: Billboard3D; x: number; y: number }

export class SunDapples implements NatureSystem {
  private readonly crowns: Crown[] = [];
  public level = 0;

  public constructor() {
    const w3 = world3d();
    for (const t of bosqueTrees()) {
      if (t.kind === 'log' || !isLifeHome('dapples', t.x, t.y)) continue;
      const big = t.kind === 'oak';
      // A sombra cai do lado da frente do tronco (a câmera vê esse chão; o de trás a copa esconde).
      const rx = big ? 1.6 : 0.8;
      const ry = big ? 1.15 : 0.55;
      const cy = t.y + (big ? 0.55 : 0.25);
      const shade = w3.objects.addBillboard(SHADE, 0, { flat: true, flatY: 0.016, depthWrite: false, alphaTest: 0.01, depthLayer: 'ground' })
        .setDisplaySize(rx * 2, ry * 2).setPosition(t.x, cy).setAlpha(0);
      this.crowns.push({ shade, x: t.x, y: cy });
    }
  }

  public update(f: NatureFrame): void {
    this.level = window01(f.phase, 0.27, 0.32, 0.68, 0.73) * Math.max(0, 1 - f.rain * 3);
    for (const c of this.crowns) {
      const near = Math.hypot(c.x - f.hero.x, c.y - f.hero.y) < 12;
      c.shade.setVisible(near && this.level > 0.01).setAlpha(0.55 * this.level);
    }
  }

  public destroy(): void {
    for (const c of this.crowns) c.shade.destroy();
    this.crowns.length = 0;
  }
}
