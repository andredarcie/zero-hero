import { getSoundManager } from '@/game/audio/SoundManager';
import { swashAt } from '@/game/render3d/surf';

import { NO_COAST, smooth, type BeachFrame, type BeachSystem } from './kit';

/**
 * O SOM DA ARREBENTAÇÃO: cada onda que chega à areia na coluna do herói toca uma vez (audio/NatureSounds.playSurfWash)
 * — a mesma onda que se vê, no instante em que ela se vê (render3d/surf.swashAt). Mais forte na beira, sumindo areia
 * adentro; a onda maior da série soa maior.
 */
export class SurfSound implements BeachSystem {
  private lastWave = Number.NaN;
  /** Quantas ondas já soaram (o playtest lê). */
  public washes = 0;

  public update(f: BeachFrame): void {
    if (f.coast <= NO_COAST) { this.lastWave = Number.NaN; return; }
    const near = smooth(-11, -1.5, f.coast);
    const s = swashAt(f.hero.x, f.time);
    if (Number.isNaN(this.lastWave)) { this.lastWave = s.n; return; }
    if (s.n === this.lastWave) return;
    this.lastWave = s.n;
    if (near <= 0.03) return;
    this.washes += 1;
    getSoundManager().nature.playSurfWash(near * (0.55 + 0.45 * (s.reach / 1.85)));
  }

  public destroy(): void { /* nada a soltar: cada onda é um som que acaba sozinho */ }
}
