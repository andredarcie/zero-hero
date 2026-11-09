import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import { bosqueTrees } from '@/game/objects/BigTrees';
import { isLifeHome } from '@/game/world/biomeLife';

import { TILESET as P, hash, texture, window01, type NatureFrame, type NatureSystem } from './kit';

/**
 * AS MANCHAS DE SOL (sugestão 11). Debaixo de uma copa o chão não é escuro por igual: é uma SOMBRA salpicada de
 * MANCHINHAS DE SOL que passam entre as folhas — e que dançam, porque o vento mexe as folhas. Isso só existe com sol
 * (de dia, sem chuva); de noite e no tempo fechado a sombra some junto.
 * Para as árvores do bosque (objects/BigTrees); a sombra fica do lado da frente do tronco, que é o que a câmera vê.
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
/**
 * Uma manchinha de sol: um DISCO de 5×5 (deitado no chão, a perspectiva o achata no oval certo — desenhado já oval,
 * virava uma barrinha), dourado, o miolo mais claro: a luz que passa por um furo entre as folhas.
 */
const SPOT = texture('dapple-spot', 5, 5, (put) => {
  for (const [x, y] of [[1, 0], [2, 0], [3, 0], [0, 1], [4, 1], [0, 2], [4, 2], [0, 3], [4, 3], [1, 4], [2, 4], [3, 4]] as const) put(x, y, P.yellow, 0.75);
  for (const [x, y] of [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3], [3, 3]] as const) put(x, y, P.yellowHi, 0.95);
  put(2, 2, '#ffffff', 1);
});

interface Spot { bb: Billboard3D; ox: number; oy: number; phase: number }
interface Crown { shade: Billboard3D; spots: Spot[]; x: number; y: number }

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
      const shade = w3.addBillboard(SHADE, 0, { flat: true, flatY: 0.016, depthWrite: false, alphaTest: 0.01, depthLayer: 'ground' })
        .setDisplaySize(rx * 2, ry * 2).setPosition(t.x, cy).setAlpha(0);
      const spots: Spot[] = [];
      const n = big ? 16 : 5;
      for (let i = 0; i < n; i += 1) {
        const a = hash(i, t.x, 52) * Math.PI * 2;
        const r = Math.sqrt(hash(t.y, i, 53)) * 0.8;
        const bb = w3.addBillboard(SPOT, 0, { flat: true, flatY: 0.018, depthWrite: false, alphaTest: 0.01, additive: true, depthLayer: 'ground' })
          .setDisplaySize(5 / 16, 5 / 16).setAlpha(0);
        spots.push({ bb, ox: Math.cos(a) * r * rx * 0.85, oy: Math.sin(a) * r * ry * 0.85, phase: hash(i, t.y, 54) * 10 });
      }
      this.crowns.push({ shade, spots, x: t.x, y: cy });
    }
  }

  public update(f: NatureFrame): void {
    this.level = window01(f.phase, 0.27, 0.32, 0.68, 0.73) * Math.max(0, 1 - f.rain * 3);
    for (const c of this.crowns) {
      const near = Math.hypot(c.x - f.hero.x, c.y - f.hero.y) < 12;
      c.shade.setVisible(near && this.level > 0.01).setAlpha(0.55 * this.level);
      for (const s of c.spots) {
        // As folhas mexem com o vento: a mancha escorrega um pouco e pisca (a folha da frente passa por cima).
        const wob = (0.5 + f.gust) * 0.07;
        const x = c.x + s.ox + Math.sin(f.clock * 0.0019 + s.phase) * wob;
        const y = c.y + s.oy + Math.cos(f.clock * 0.0014 + s.phase * 1.3) * wob * 0.6;
        const blink = 0.45 + 0.55 * Math.max(0, Math.sin(f.clock * 0.003 * (1 + f.gust) + s.phase * 2));
        s.bb.setVisible(near && this.level > 0.01).setPosition(x, y).setAlpha(0.5 * this.level * blink);
      }
    }
  }

  public destroy(): void {
    for (const c of this.crowns) {
      c.shade.destroy();
      for (const s of c.spots) s.bb.destroy();
    }
    this.crowns.length = 0;
  }
}
