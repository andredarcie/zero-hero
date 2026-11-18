import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import { PROP_TINT, flushTextures } from './nature/kit';
import { SKIP_BEDS, pebbleBedSize, pebbleBedTexture } from './stoneSkip';

/**
 * OS LEITOS DE SEIXOS NA BEIRA DO LAGO (a regra e o desenho em objects/stoneSkip): deitados no chão, na camada do que
 * se pisa, rente à água. É onde o herói pega o seixo para quicar; fora deles, a água é só água.
 */
export class PebbleBeds {
  private readonly beds: Billboard3D[] = [];

  public constructor() {
    // O World3D já carregou as texturas dele: os desenhos do kit podem ser registrados.
    flushTextures();
    for (const bed of SKIP_BEDS) {
      const { w, h } = pebbleBedSize(bed);
      const xs = bed.tiles.map(([x]) => x);
      const ys = bed.tiles.map(([, y]) => y);
      this.beds.push(world3d().objects.addBillboard(pebbleBedTexture(bed), 0, {
        flat: true, flatY: 0.012, depthWrite: false, alphaTest: 0.5, depthLayer: 'ground',
      })
        .setDisplaySize(w / 16, h / 16)
        .setPosition((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2)
        .setTint(PROP_TINT));
    }
  }

  public destroy(): void {
    for (const bb of this.beds) bb.destroy();
    this.beds.length = 0;
  }
}
