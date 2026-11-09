import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';

import { TILESET as P, smooth, texture, type NatureFrame, type NatureSystem } from './kit';

/**
 * O ARCO-ÍRIS DEPOIS DA CHUVA (sugestão 13). Quando a chuva para e o sol volta, um arco aparece no céu, ao fundo, do
 * lado oposto ao sol — e, como o de verdade, ANDA COM QUEM OLHA (é sempre do mesmo tamanho e no mesmo lugar em
 * relação ao herói). Dura uma hora e pouco do relógio do jogo e some devagar. Só de dia.
 * As faixas são cores do tileset, do vermelho por fora ao violeta por dentro. É luz, então é macio.
 */

const BANDS = [P.redHi, P.orange, P.yellow, P.frog, P.waterHi, P.sky, P.violet];
const ARC = texture('afterrain-rainbow', 128, 64, (put) => {
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const r = Math.hypot((x + 0.5 - 64) / 64, (64 - y - 0.5) / 64);
      const band = (0.98 - r) / 0.24 * BANDS.length;
      if (band < 0 || band >= BANDS.length) continue;
      const edge = Math.min(1, band * 1.5, (BANDS.length - band) * 1.5);
      // As pontas somem no chão (o arco nasce de trás do horizonte).
      const foot = Math.min(1, ((64 - y) / 64) * 3);
      put(x, y, BANDS[Math.floor(band)], edge * foot);
    }
  }
}, true);

/** Quanto tempo de mostrador ele dura depois da chuva (≈ 1h40 do jogo). */
const LIFE = 0.07;

export class AfterRainRainbow implements NatureSystem {
  private readonly bb: Billboard3D;
  public level = 0;

  public constructor() {
    this.bb = world3d().addBillboard(ARC, 0, { centered: true, additive: true, alphaTest: 0.01, fog: false })
      .setDisplaySize(9, 4.5)
      .setAlpha(0)
      .setVisible(false);
  }

  public update(f: NatureFrame): void {
    const s = f.sinceRain;
    const day = f.phase > 0.28 && f.phase < 0.74 ? 1 : 0;
    // Só no gramado aberto do jardim (world/biomeLife): esmaece na fronteira.
    this.level = s > 0 && s < LIFE ? smooth(0, 0.008, s) * (1 - smooth(LIFE * 0.6, LIFE, s)) * day * f.host.home(f.hero.x, f.hero.y) : 0;
    this.bb.setVisible(this.level > 0.01);
    if (this.level <= 0.01) return;
    // Ao fundo, para o norte do herói, alto: o pé do arco some atrás do mundo.
    // A câmera olha para baixo: o céu não entra no quadro, então o arco fica no fundo da cena, por cima dela.
    this.bb.setPosition(f.hero.x + 0.6, f.hero.y - 3.5).setElevation(0.2).setAlpha(0.36 * this.level);
  }

  public destroy(): void {
    this.bb.destroy();
  }
}
