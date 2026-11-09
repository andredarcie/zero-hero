import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';

import { TILESET as P, hash, sprite, window01, type NatureFrame, type NatureSystem } from './kit';

/**
 * AS SEMENTES NO VENTO (sugestão 12). Nos dias de vento da primavera e do verão, penugens de dente-de-leão atravessam
 * o vale: vêm do lado de onde o vento sopra, um pouco mais devagar que ele, subindo e descendo nas correntes de ar,
 * e passam. Nas rajadas vêm muitas; na calmaria, quase nenhuma. Em dia sem vento, uma ou outra.
 */

/**
 * A penugem: fios soltos em volta de um ponto, quase transparentes (é ar com fio), e a semente escura pendurada
 * embaixo. Dois tempos de giro.
 */
const FLUFF = { b: `${P.bone}@0.75`, c: `${P.pale}@0.55`, B: P.boneDk, s: P.ochre, o: P.barkDk };
const fluff = (frame: number): string => sprite(`seed-fluff-${frame}`, frame === 0 ? [
  '.c.b.c.',
  '..c.c..',
  'b..B..b',
  '..c.c..',
  '.c.s.c.',
  '...s...',
  '...o...',
] : [
  '..b.c..',
  'c.....b',
  '...B...',
  'b.....c',
  '..c.b..',
  '...s...',
  '...o...',
], FLUFF);
const FRAMES = [fluff(0), fluff(1)] as const;

interface Seed { bb: Billboard3D; x: number; y: number; z: number; phase: number; drift: number }

const MAX = 44;

export class Seeds implements NatureSystem {
  private readonly seeds: Seed[] = [];
  private seed = 29;
  private spawnAcc = 0;

  private rand(): number {
    this.seed += 1;
    return hash(this.seed, 19, 407);
  }

  public get count(): number {
    return this.seeds.length;
  }

  public update(f: NatureFrame): void {
    const warm = f.season === 'spring' || f.season === 'summer';
    const day = window01(f.phase, 0.28, 0.32, 0.7, 0.74);
    // Só no prado (world/biomeLife): saindo dele, as sementes param de chegar e as que voam vão embora com o vento.
    const amount = !warm || f.rain > 0.1 ? 0 : day * (f.windyDay ? 0.35 + 0.65 * f.gust : 0.12 * f.gust) * f.host.home(f.hero.x, f.hero.y);
    // Nascem do lado de onde o vento vem (oeste), fora do quadro, num ritmo que segue a rajada.
    this.spawnAcc += amount * 14 * f.dt;
    while (this.spawnAcc >= 1 && this.seeds.length < MAX) {
      this.spawnAcc -= 1;
      const bb = world3d().addBillboard(FRAMES[0], 0, { centered: true, depthWrite: false, alphaTest: 0.01 }).setDisplaySize(7 / 16, 7 / 16);
      // Quando o vento acaba de chegar, o quadro já tem algumas no meio do caminho; depois, entram pelo oeste.
      const fill = this.seeds.length < 8;
      this.seeds.push({
        bb, x: fill ? f.hero.x + (this.rand() - 0.5) * 16 : f.hero.x - 9 - this.rand() * 2, y: f.hero.y + (this.rand() - 0.5) * 11, z: 0.4 + this.rand() * 1.3,
        phase: this.rand() * 10, drift: 0.7 + this.rand() * 0.25,
      });
    }
    if (this.spawnAcc > 1) this.spawnAcc = 1;
    if (!warm) { this.destroy(); return; }
    const windS = f.wind * 1000;
    for (let i = this.seeds.length - 1; i >= 0; i -= 1) {
      const s = this.seeds[i];
      s.phase += f.dt;
      // Um pouco mais devagar que o vento, e subindo e descendo nas correntes.
      s.x += windS * s.drift * f.dt;
      s.y += Math.sin(s.phase * 0.7) * 0.15 * f.dt;
      s.z = Math.max(0.15, s.z + Math.sin(s.phase * 1.3) * 0.25 * f.dt);
      s.bb.setTexture(FRAMES[Math.floor(s.phase * 2.5) % 2]).setPosition(s.x, s.y).setElevation(s.z);
      if (s.x - f.hero.x > 10 || Math.abs(s.y - f.hero.y) > 8) { s.bb.destroy(); this.seeds.splice(i, 1); }
    }
  }

  public destroy(): void {
    for (const s of this.seeds) s.bb.destroy();
    this.seeds.length = 0;
  }
}
