import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';

import { TILESET as P, hash, smooth, texture, type NatureFrame, type NatureSystem } from './kit';

/**
 * AS GOTAS DAS FOLHAS (sugestão 15). A chuva parou, mas debaixo das árvores ainda chove: a água que ficou nas folhas
 * junta na ponta, a gota cresce, BRILHA um instante pendurada e CAI, e respinga no chão. No começo pinga muito; vai
 * rareando até parar, em uma hora e pouco do jogo. Pinga das árvores do mapa e das do bosque.
 */

const DROP = texture('drip-drop', 1, 3, (put) => {
  put(0, 0, P.ice, 0.45);
  put(0, 1, P.ice, 0.8);
  put(0, 2, '#ffffff', 1);
});
const GLINT = texture('drip-glint', 3, 3, (put) => {
  put(1, 0, '#ffffff', 0.7); put(0, 1, '#ffffff', 0.7); put(1, 1, '#ffffff', 1); put(2, 1, '#ffffff', 0.7); put(1, 2, '#ffffff', 0.7);
});
const SPLASH = [
  texture('drip-splash-0', 5, 3, (put) => { put(2, 2, P.ice, 0.9); put(1, 1, P.ice, 0.8); put(3, 1, P.ice, 0.8); }),
  texture('drip-splash-1', 5, 3, (put) => { put(0, 1, P.ice, 0.8); put(4, 1, P.ice, 0.8); put(1, 0, P.ice, 0.7); put(3, 0, P.ice, 0.7); }),
  texture('drip-splash-2', 5, 3, (put) => { put(0, 2, P.ice, 0.5); put(4, 2, P.ice, 0.5); }),
];

type Stage = 'hang' | 'fall' | 'splash';
interface Drip { bb: Billboard3D; x: number; y: number; z: number; v: number; stage: Stage; t: number }

/** Quanto tempo de mostrador as folhas pingam depois da chuva (≈ 1h10 do jogo). */
const LIFE = 0.05;
const MAX = 22;

export class CanopyDrips implements NatureSystem {
  private readonly drips: Drip[] = [];
  private acc = 0;
  private seed = 37;
  public level = 0;
  public fallen = 0;

  private rand(): number {
    this.seed += 1;
    return hash(this.seed, 29, 409);
  }

  public update(f: NatureFrame): void {
    const s = f.sinceRain;
    this.level = s > 0 && s < LIFE && f.season !== 'winter' ? 1 - smooth(0, LIFE, s) : 0;
    this.acc += this.level * 9 * f.dt;
    if (this.acc >= 1) {
      const trees = f.host.treesNear(f.hero.x, f.hero.y, 8);
      while (this.acc >= 1) {
        this.acc -= 1;
        if (trees.length === 0 || this.drips.length >= MAX) continue;
        const t = trees[Math.floor(this.rand() * trees.length)];
        // A ponta de uma folha na borda de baixo da copa, do lado da frente.
        const x = t.x + (this.rand() - 0.5) * t.crown * 1.6;
        const y = t.y + 0.05 + this.rand() * 0.15;
        const z = t.height * (0.45 + this.rand() * 0.25);
        const bb = world3d().objects.addBillboard(GLINT, 0, { centered: true, depthWrite: false, alphaTest: 0.01, depthLayer: 'overlay' }).setDisplaySize(3 / 16, 3 / 16);
        this.drips.push({ bb, x, y, z, v: 0, stage: 'hang', t: 0 });
      }
    }
    for (let i = this.drips.length - 1; i >= 0; i -= 1) {
      const d = this.drips[i];
      d.t += f.dt;
      if (d.stage === 'hang') {
        // A gota pendurada brilha um instante antes de soltar.
        d.bb.setAlpha(0.4 + 0.6 * Math.abs(Math.sin(d.t * 9)));
        if (d.t > 0.45) { d.stage = 'fall'; d.t = 0; d.bb.setTexture(DROP).setDisplaySize(1 / 16, 3 / 16).setAlpha(0.95); }
      } else if (d.stage === 'fall') {
        d.v += 9 * f.dt;
        d.z -= d.v * f.dt;
        if (d.z <= 0) { d.stage = 'splash'; d.t = 0; d.z = 0; this.fallen += 1; d.bb.setDisplaySize(5 / 16, 3 / 16); }
      } else {
        d.bb.setTexture(SPLASH[Math.min(2, Math.floor(d.t / 0.08))]);
        if (d.t > 0.24) { d.bb.destroy(); this.drips.splice(i, 1); continue; }
      }
      d.bb.setPosition(d.x, d.y).setElevation(d.stage === 'splash' ? 0.06 : d.z);
    }
  }

  public destroy(): void {
    for (const d of this.drips) d.bb.destroy();
    this.drips.length = 0;
  }
}
