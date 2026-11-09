import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';

import { hash, texture, window01, type NatureFrame, type NatureSystem } from './kit';

/**
 * A NEBLINA DO AMANHECER (sugestão 10). Neblina de vale: nasce no fim da madrugada, deitada rente ao chão, mais
 * grossa sobre a água e entre as árvores (onde o ar esfria mais), escorrega devagar com a brisa e se desfaz
 * quando o sol esquenta. Depois de um dia de chuva ela é mais densa e dura mais.
 * É ar, não objeto: a única peça macia daqui, como a névoa do jardim e a da cachoeira.
 */

const PUFF = texture('mist-puff', 64, 20, (put) => {
  for (let y = 0; y < 20; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const nx = (x + 0.5) / 64 * 2 - 1;
      const ny = (y + 0.5) / 20 * 2 - 1;
      const r = Math.sqrt(nx * nx + ny * ny * 1.1);
      const soft = Math.max(0, 1 - r);
      put(x, y, '#ffffff', soft * soft * (0.55 + 0.45 * hash(x >> 3, y >> 2, 41)));
    }
  }
}, true);

interface Puff { bb: Billboard3D; x: number; y: number; z: number; w: number; phase: number; speed: number }

const COUNT = 24;

export class MorningMist implements NatureSystem {
  private readonly puffs: Puff[] = [];
  private seed = 23;
  public level = 0;

  private rand(): number {
    this.seed += 1;
    return hash(this.seed, 17, 406);
  }

  /** Um lugar para um fiapo: de preferência sobre água ou perto de árvore. */
  private spot(f: NatureFrame): { x: number; y: number } {
    let fallback = { x: f.hero.x, y: f.hero.y };
    for (let i = 0; i < 14; i += 1) {
      const x = f.hero.x + (this.rand() - 0.5) * 20;
      const y = f.hero.y + (this.rand() - 0.5) * 13;
      fallback = { x, y };
      if (f.host.isWater(Math.round(x), Math.round(y))) return { x, y };
      if (f.host.treesNear(x, y, 1.6).length > 0 && this.rand() < 0.7) return { x, y };
    }
    return fallback;
  }

  public update(f: NatureFrame): void {
    const afterRain = f.sinceRain < 0.6 ? 1 : 0;
    const season = f.season === 'autumn' || f.season === 'spring' ? 1 : 0.75;
    // Só na geada (world/biomeLife): o frio da manhã é de lá.
    this.level = window01(f.phase, 0.225, 0.255, 0.31 + afterRain * 0.04, 0.37 + afterRain * 0.05) * season * (afterRain ? 1 : 0.8)
      * f.host.home(f.hero.x, f.hero.y);
    if (this.level < 0.01) { this.clear(); return; }
    while (this.puffs.length < COUNT) {
      const s = this.spot(f);
      const bb = world3d().objects.addBillboard(PUFF, 0, { centered: true, depthWrite: false, alphaTest: 0.01, fog: false }).setTint(0xc9d1d0);
      this.puffs.push({ bb, x: s.x, y: s.y, z: 0.05 + this.rand() * 0.22, w: 2.8 + this.rand() * 2.2, phase: this.rand() * 10, speed: 0.4 + this.rand() * 0.3 });
    }
    for (const p of this.puffs) {
      // Escorrega com a brisa, devagar; respira (fica mais e menos densa).
      p.x += f.wind * 1000 * p.speed * 0.25 * f.dt;
      if (p.x - f.hero.x > 11 || Math.abs(p.y - f.hero.y) > 8 || p.x - f.hero.x < -11) {
        const s = this.spot(f);
        p.x = f.hero.x - 10 + this.rand() * 3; p.y = s.y;
      }
      const breathe = 0.75 + 0.25 * Math.sin(f.clock * 0.0006 + p.phase);
      p.bb.setPosition(p.x, p.y).setElevation(p.z).setDisplaySize(p.w, p.w * 0.45).setAlpha(0.55 * this.level * breathe);
    }
  }

  private clear(): void {
    for (const p of this.puffs) p.bb.destroy();
    this.puffs.length = 0;
  }

  public destroy(): void {
    this.clear();
  }
}
