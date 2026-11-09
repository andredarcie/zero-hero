import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';

import { PROP_TINT, TILESET as P, hash, sprite, window01, type NatureFrame, type NatureSystem } from './kit';

/**
 * AS LIBÉLULAS (sugestão 3). Rente à água, de dia, como libélula de verdade voa:
 *   · PARA NO AR (as asas um borrão, o corpo quase imóvel, um tremor de nada);
 *   · e de repente DÁ UM ARRANCO curto e reto para outro ponto sobre a água, e para de novo;
 *   · nunca se afasta da água; some na chuva, à noite e no inverno.
 * Duas espécies: a azul-petróleo e a vermelha.
 */

// As asas são vidro: translúcidas, deixam ver a água embaixo.
const BLUE = { b: P.waterHi, B: P.teal, h: P.navy, w: `${P.ice}@0.5`, e: P.ink };
const RED = { b: P.redHi, B: P.redDk, h: P.redDk, w: `${P.ice}@0.5`, e: P.ink };
const ROWS_A = [
  '..ww.ww...',
  '...wwww...',
  'bBbBbBbhhe',
  '...wwww...',
  '..ww.ww...',
];
// O outro quadro: as asas no meio da batida (mais curtas) — alternando, viram o borrão de uma asa rápida.
const ROWS_B = [
  '..........',
  '...wwww...',
  'bBbBbBbhhe',
  '...wwww...',
  '..........',
];
const SPECIES = [
  [sprite('dragonfly-blue-a', ROWS_A, BLUE), sprite('dragonfly-blue-b', ROWS_B, BLUE)],
  [sprite('dragonfly-red-a', ROWS_A, RED), sprite('dragonfly-red-b', ROWS_B, RED)],
] as const;

interface Fly {
  bb: Billboard3D;
  species: number;
  x: number; y: number; z: number;
  fromX: number; fromY: number; toX: number; toY: number;
  dart: number;
  hover: number;
  facing: number;
}

export class Dragonflies implements NatureSystem {
  private readonly flies: Fly[] = [];
  private seed = 11;

  private rand(): number {
    this.seed += 1;
    return hash(this.seed, 7, 403);
  }

  public get list(): ReadonlyArray<{ x: number; y: number; z: number; darting: boolean }> {
    return this.flies.map((d) => ({ x: d.x, y: d.y, z: d.z, darting: d.dart < 1 }));
  }

  /** Um ponto sobre água, perto de (x, y). */
  private overWater(f: NatureFrame, x: number, y: number, r: number): { x: number; y: number } | null {
    for (let i = 0; i < 25; i += 1) {
      const px = x + (this.rand() - 0.5) * r * 2;
      const py = y + (this.rand() - 0.5) * r * 2;
      if (f.host.isWater(Math.round(px), Math.round(py))) return { x: px, y: py };
    }
    return null;
  }

  public update(f: NatureFrame): void {
    const level = f.season === 'winter' ? 0 : window01(f.phase, 0.3, 0.34, 0.68, 0.72) * (f.rain > 0.2 ? 0 : 1);
    const want = level > 0.5 ? 2 : 0;
    if (this.flies.length < want) {
      const spot = this.overWater(f, f.hero.x, f.hero.y, 6.5);
      if (spot) {
        const species = this.flies.length % 2;
        const bb = world3d().addBillboard(SPECIES[species][0], 0, { centered: true, depthWrite: false }).setDisplaySize(10 / 16, 5 / 16).setTint(PROP_TINT);
        const z = 0.45 + this.rand() * 0.3;
        this.flies.push({ bb, species, x: spot.x, y: spot.y, z, fromX: spot.x, fromY: spot.y, toX: spot.x, toY: spot.y, dart: 1, hover: 0.6, facing: 1 });
      }
    }
    for (let i = this.flies.length - 1; i >= 0; i -= 1) {
      const d = this.flies[i];
      if (want === 0 || Math.hypot(d.x - f.hero.x, d.y - f.hero.y) > 10) { d.bb.destroy(); this.flies.splice(i, 1); continue; }
      if (d.dart < 1) {
        // O arranco: rápido no começo e freando no fim (ease-out), em ~0,22 s.
        d.dart = Math.min(1, d.dart + f.dt / 0.22);
        const k = 1 - (1 - d.dart) ** 3;
        d.x = d.fromX + (d.toX - d.fromX) * k;
        d.y = d.fromY + (d.toY - d.fromY) * k;
      } else {
        d.hover -= f.dt;
        if (d.hover <= 0) {
          const to = this.overWater(f, d.x, d.y, 1.8);
          if (to) {
            d.fromX = d.x; d.fromY = d.y; d.toX = to.x; d.toY = to.y; d.dart = 0;
            if (Math.abs(to.x - d.x) > 0.05) d.facing = to.x > d.x ? 1 : -1;
          }
          d.hover = 0.5 + this.rand() * 2;
        }
      }
      // Parada no ar: só um tremor de um pixel.
      const jitter = d.dart >= 1 ? Math.sin(f.clock * 0.013 + i * 3) * 0.015 : 0;
      d.bb.setTexture(SPECIES[d.species][Math.floor(f.clock / 35) % 2])
        .setFlipX(d.facing < 0)
        .setPosition(d.x, d.y)
        .setElevation(d.z + jitter);
    }
  }

  public destroy(): void {
    for (const d of this.flies) d.bb.destroy();
    this.flies.length = 0;
  }
}
