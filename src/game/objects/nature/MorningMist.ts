import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import { getWorldBounds } from '@/game/world/WorldData';

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

interface Puff { bb: Billboard3D; x: number; y: number; strength: number; phase: number }

const BANK_SPACING = 3;

export class MorningMist implements NatureSystem {
  private readonly puffs: Puff[] = [];
  private seeded = false;
  public level = 0;

  private seedBanks(f: NatureFrame): void {
    const { minTileX, maxTileX, minTileY, maxTileY } = getWorldBounds();
    const objects = world3d().objects;
    for (let row = Math.floor(minTileY / BANK_SPACING); row <= Math.floor(maxTileY / BANK_SPACING); row++) {
      for (let col = Math.floor(minTileX / BANK_SPACING); col <= Math.floor(maxTileX / BANK_SPACING); col++) {
        const x = col * BANK_SPACING + hash(col, row, 406) * BANK_SPACING;
        const y = row * BANK_SPACING + hash(col, row, 407) * BANK_SPACING;
        const home = f.host.home(x, y);
        if (home < 0.05) continue;
        const water = f.host.isWater(Math.round(x), Math.round(y));
        const width = 2.8 + hash(col, row, 408) * 2.2;
        const height = width * 0.22;
        const bb = objects.addBillboard(PUFF, 0, { centered: true, depthWrite: false, alphaTest: 0.01, fog: false })
          .setTint(0xc9d1d0).setElevation(height / 2 + 0.05 + hash(col, row, 409) * 0.15).setDisplaySize(width, height);
        this.puffs.push({ bb, x, y, strength: home * (water ? 1 : 0.8), phase: hash(col, row, 410) * Math.PI * 2 });
      }
    }
    this.seeded = true;
  }

  public update(f: NatureFrame): void {
    const afterRain = f.sinceRain < 0.6 ? 1 : 0;
    const season = f.season === 'autumn' || f.season === 'spring' ? 1 : 0.75;
    // Só na geada (world/biomeLife): o frio da manhã é de lá.
    this.level = window01(f.phase, 0.225, 0.255, 0.31 + afterRain * 0.04, 0.37 + afterRain * 0.05) * season * (afterRain ? 1 : 0.8);
    if (this.level < 0.01) { this.clear(); return; }
    if (!this.seeded) this.seedBanks(f);
    for (const p of this.puffs) {
      // A brisa move cada banco em torno do seu ponto no vale.
      const drift = Math.sin(f.clock * 0.0002 + p.phase) * 0.8;
      const breathe = 0.75 + 0.25 * Math.sin(f.clock * 0.0006 + p.phase);
      p.bb.setPosition(p.x + drift, p.y).setAlpha(0.55 * this.level * p.strength * breathe);
    }
  }

  private clear(): void {
    for (const p of this.puffs) p.bb.destroy();
    this.puffs.length = 0;
    this.seeded = false;
  }

  public destroy(): void {
    this.clear();
  }
}
