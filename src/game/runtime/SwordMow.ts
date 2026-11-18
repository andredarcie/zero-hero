// A FOICE NO MATO (pedido do autor, 2026-11-17: "faça a animação de cortar com a foice a grama mais realista"). A foice
// usava o arco da espada: um leque de 155° de cima, rápido e igual nos dois sentidos — um golpe de esgrima, não uma
// roçada.
//
// UMA ROÇADA DE VERDADE tem três tempos, e a lâmina corre DEITADA, rente ao chão:
//   1. O RECUO: o tronco gira para a direita e leva a foice para trás, devagar, ganhando caminho (a lâmina sobe um
//      pouco do chão);
//   2. A VARRIDA: da direita para a esquerda, pela frente dos pés, num arco largo e baixo — acelera, passa pelo mato no
//      meio do arco (é o instante do corte, `MOW_CONTACT_MS`) e desacelera; só esta parte deixa rastro;
//   3. O ACOMPANHAMENTO: a lâmina segue além do mato, desacelerando, e some.
// O arco é medido NO CHÃO (o ângulo da lâmina em volta do herói, da direita dele para a esquerda) e projetado na tela
// com o achatamento da câmera: virada para os lados a foice é comprida, apontando para longe ou para perto ela encurta.
// O desenho da foice tem o cabo na diagonal (42° à direita do "para cima" do ícone) e a lâmina à esquerda dele, então o
// giro gira o CABO para a direção da lâmina no chão, e a varrida (da direita para a esquerda do herói) é sempre no
// sentido em que o fio da lâmina vai na frente.

import type { SwordSlash } from './SwordOrbit';
import { TRAIL_ALPHAS, swingLitTint } from './SwordChop';

export const MOW_WIND_MS = 150;
export const MOW_SWEEP_MS = 130;
export const MOW_FOLLOW_MS = 120;
export const MOW_FADE_MS = 80;
/** Quando a lâmina passa pelo meio do arco, no mato: o corte. */
export const MOW_CONTACT_MS = MOW_WIND_MS + Math.round(MOW_SWEEP_MS * 0.5);
/** O gesto inteiro, do recuo ao sumir. */
export const MOW_TOTAL_MS = MOW_WIND_MS + MOW_SWEEP_MS + MOW_FOLLOW_MS + MOW_FADE_MS;

/** Os ângulos no chão, em graus, a partir da frente do herói (positivo = a direita dele). */
const CARRY_DEG = 55;    // em repouso nas mãos, levemente à direita
const REAR_DEG = 128;    // o recuo: atrás, à direita
const SWEEP_END_DEG = -72; // o fim da varrida: à esquerda
const FOLLOW_DEG = -98;    // o acompanhamento
const TRAIL_STEP_DEG = 11;
/** O cabo no desenho do ícone: 42° à direita do "para cima" do sprite. */
const ART_SNATH_DEG = 42;
/** Onde o punho está no desenho, em pixels de 16, a partir da origem (o pé do centro): a ponta do cabo. */
const ART_GRIP = { x: -2.5, y: -1 };
/** O achatamento do chão visto desta câmera: um tile para o norte ocupa ~0,72 de um tile para o lado. */
const FORE = 0.72;
/**
 * O tamanho da foice, em tiles, e o quanto as mãos giram com o tronco e descem na varrida. O pivô da roçada fica BAIXO
 * (`PIVOT_DROP` abaixo das mãos, perto dos joelhos): o arco é desenhado no chão em volta dos pés, e com o pivô nas mãos
 * a lâmina virada para o norte passava por cima da cabeça do herói na tela.
 */
const SIZE = 1.15;
const HAND_SWING = 0.16;
const HAND_DROP = 0.12;
const PIVOT_DROP = 0.24;

/** O que SwordMow usa de SwordSlash. */
export type SwordMowHost = Pick<SwordSlash, 'bladeTint' | 'lightLevel' | 'scene' | 'sprite' | 'trails'>;

export class SwordMow {
  private readonly pose = { deg: CARRY_DEG, trail: 0, low: 0 };

  public constructor(private readonly host: SwordMowHost) {}

  /** Outro gesto tomou a lâmina: a roçada para de escrever nela. */
  public stop(): void {
    this.host.scene.tweens.killTweensOf(this.pose);
  }

  /**
   * A roçada a partir das mãos (handX, handY, em pixels da tela), com o herói olhando para (dx, dy) (cardinal).
   * `item` é o desenho da foice.
   */
  public mow(handX: number, handY: number, dx: number, dy: number, tileSize: number, item: { texture: string; frame: number }): void {
    const { scene, sprite, trails } = this.host;
    scene.tweens.killTweensOf(sprite);
    scene.tweens.killTweensOf(this.pose);
    trails.forEach((t) => scene.tweens.killTweensOf(t));
    const tint = swingLitTint(this.host.lightLevel);
    this.host.bladeTint = tint;
    sprite.setTexture(item.texture, item.frame).setFlip(false, false).setTint(tint).setAlpha(1).setVisible(true);
    trails.forEach((t) => t.setTexture(item.texture, item.frame).setFlip(false, false).setTint(tint).setAlpha(0).setVisible(false));
    const p = this.pose;
    p.deg = CARRY_DEG;
    p.trail = 0;
    p.low = 0;
    const apply = (): void => this.apply(handX, handY, dx, dy, tileSize);
    apply();
    // 1. o recuo, devagar: o tronco gira e a lâmina sobe um nada
    scene.tweens.add({
      targets: p, deg: REAR_DEG, low: -0.25, duration: MOW_WIND_MS, ease: 'Sine.easeOut', onUpdate: apply,
      onComplete: () => {
        // 2. a varrida, baixa e larga, acelerando e desacelerando; o rastro só aqui
        p.trail = 1;
        scene.tweens.add({
          targets: p, deg: SWEEP_END_DEG, low: 1, duration: MOW_SWEEP_MS, ease: 'Sine.easeInOut', onUpdate: apply,
          onComplete: () => {
            // 3. o acompanhamento: segue além do mato, o rastro se apaga
            scene.tweens.add({
              targets: p, deg: FOLLOW_DEG, trail: 0, low: 0.6, duration: MOW_FOLLOW_MS, ease: 'Quad.easeOut', onUpdate: apply,
              onComplete: () => {
                scene.tweens.add({
                  targets: [sprite, ...trails], alpha: 0, duration: MOW_FADE_MS,
                  onComplete: () => {
                    sprite.setVisible(false);
                    trails.forEach((t) => t.setVisible(false));
                  },
                });
              },
            });
          },
        });
      },
    });
  }

  /** A pose da foice no ângulo `deg` do chão, e os fantasmas atrás dela na varrida. */
  private apply(handX: number, handY: number, dx: number, dy: number, tileSize: number): void {
    const p = this.pose;
    this.place(this.host.sprite, p.deg, handX, handY, dx, dy, tileSize);
    this.host.trails.forEach((t, i) => {
      if (p.trail <= 0.01) {
        t.setVisible(false);
        return;
      }
      // a varrida vai do + para o −: o que já passou está nos ângulos maiores
      this.place(t, p.deg + TRAIL_STEP_DEG * (i + 1), handX, handY, dx, dy, tileSize);
      t.setAlpha(TRAIL_ALPHAS[i] * p.trail).setVisible(true);
    });
  }

  private place(
    s: SwordMowHost['sprite'], deg: number, handX: number, handY: number, dx: number, dy: number, tileSize: number,
  ): void {
    const a = (deg * Math.PI) / 180;
    // a direção da lâmina no chão: a frente (dx, dy) girada para a direita do herói (−dy, dx) pelo ângulo
    const wx = dx * Math.cos(a) - dy * Math.sin(a);
    const wy = dy * Math.cos(a) + dx * Math.sin(a);
    const sx = wx;
    const sy = wy * FORE;
    const len = Math.hypot(sx, sy);
    const screenDeg = (Math.atan2(sy, sx) * 180) / Math.PI;
    const angle = screenDeg + 90 - ART_SNATH_DEG;
    // as mãos giram com o tronco, e descem na varrida (a lâmina rente ao chão)
    const hx = handX + sx * HAND_SWING * tileSize;
    const hy = handY + sy * HAND_SWING * tileSize + (PIVOT_DROP + this.pose.low * HAND_DROP) * tileSize;
    const size = tileSize * SIZE;
    s.setDisplaySize(size, size);
    // apontando para longe ou para perto, a foice encurta (o chão achatado), nunca abaixo de 60%
    s.setScale(s.scaleX, s.scaleY * (0.6 + 0.4 * len));
    s.setAngle(angle);
    // o punho do desenho cai nas mãos: a origem é o pé do centro, o punho fica um pouco à esquerda dela
    const r = (angle * Math.PI) / 180;
    const gx = ART_GRIP.x * (size / 16);
    const gy = ART_GRIP.y * (size / 16) * (0.6 + 0.4 * len);
    s.setPosition(hx - (gx * Math.cos(r) - gy * Math.sin(r)), hy - (gx * Math.sin(r) + gy * Math.cos(r)));
  }
}
