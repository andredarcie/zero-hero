import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';

import { LEAF_COLORS, MAPLE_FOOT_X, MAPLE_H, MAPLE_W } from './mapleArt';
import { LEAF_AFLOAT, LEAF_AIR, OVER_WATER, mapleKey } from './springArt';

/**
 * O BORDO DE OUTONO DA FONTE (o desenho é de objects/spring/mapleArt). Um bordo baixo e torto no canto da gruta, com o
 * tronco inclinado e um galho comprido por cima da água: o vermelho dele é o par do turquesa da fonte.
 *
 *   · A copa mexe na rajada (dois quadros).
 *   · AS FOLHAS CAEM: uma de cada vez, devagar, balançando de um lado para o outro e virando no ar.
 *   · AS FOLHAS BOIAM: um punhado delas na água, andando num redemoinho lento em volta do meio da poça, cada uma no
 *     seu passo.
 */

/**
 * O tom da árvore: a luz do vale multiplica o vermelho e o estoura para um laranja de brasa (a primeira versão, mais
 * clara, lia como lava); este segura o carmim.
 */
const TINT = 0x8a6e7a;
const SIZE = { w: MAPLE_W / 16, h: MAPLE_H / 16 };
const FALLING = 6;
const AFLOAT = 7;
const LEAF = 0.125;

const hex = (css: string): number => parseInt(css.slice(1), 16);
/** As cores das folhas soltas, um tom abaixo (a folha é pequena e clara: sem isso ela acende). */
const LEAF_TINTS = LEAF_COLORS.map((c) => {
  const v = hex(c);
  const ch = (s: number): number => Math.round(((v >> s) & 0xff) * 0.78);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
});

interface Falling { bb: Billboard3D; x: number; y: number; h: number; fall: number; phase: number; wait: number }
interface Afloat { bb: Billboard3D; angle: number; speed: number; rx: number; ry: number; phase: number }

export class SpringMaple {
  private readonly tree: Billboard3D;
  private readonly falling: Falling[] = [];
  private readonly afloat: Afloat[] = [];
  private frame = 0;
  private clock = 0;

  public constructor(
    /** O pé do tronco (tiles). */
    private readonly foot: { x: number; y: number },
    /** O meio da água e as meias medidas dela (as folhas boiam dentro dela). */
    private readonly pool: { x: number; y: number; hw: number; hh: number },
    /** A altura da água (abaixo do chão da gruta: a bacia é funda). */
    surface: number,
  ) {
    const objects = world3d().objects;
    // o pé do tronco não é o meio da prancha: a árvore inclina para a direita
    const centre = foot.x + (MAPLE_W / 2 - MAPLE_FOOT_X) / 16;
    this.tree = objects.addBillboard(mapleKey(0), 0, { groundShadow: { rx: 1.1, rz: 0.4, alpha: 0.26 } })
      .setTint(TINT)
      .setDisplaySize(SIZE.w, SIZE.h)
      .setPosition(centre, foot.y);
    for (let i = 0; i < FALLING; i += 1) {
      const bb = objects.addBillboard(LEAF_AIR[0], 0, { centered: true, depthWrite: false, renderOrder: OVER_WATER })
        .setTint(LEAF_TINTS[i % LEAF_TINTS.length])
        .setDisplaySize(LEAF, LEAF)
        .setVisible(false);
      const leaf: Falling = { bb, x: 0, y: 0, h: 0, fall: 0, phase: i * 1.9, wait: i * 1.4 };
      this.falling.push(leaf);
    }
    for (let i = 0; i < AFLOAT; i += 1) {
      const bb = objects.addBillboard(LEAF_AFLOAT, 0, {
        flat: true, flatY: surface + 0.015, depthLayer: 'ground', depthWrite: false, renderOrder: OVER_WATER,
      })
        .setTint(LEAF_TINTS[(i * 2) % LEAF_TINTS.length])
        .setDisplaySize(LEAF, LEAF);
      this.afloat.push({
        bb,
        angle: (i / AFLOAT) * Math.PI * 2,
        speed: 0.045 + 0.05 * ((i * 37) % 10) / 10,
        rx: 0.3 + 0.5 * ((i * 53) % 10) / 10,
        ry: 0.28 + 0.46 * ((i * 71) % 10) / 10,
        phase: i * 2.3,
      });
    }
  }

  private drop(leaf: Falling): void {
    // da copa: em volta do meio dela (a copa passa por cima da água, à direita do pé)
    leaf.x = this.foot.x + 0.2 + Math.random() * 1.9;
    leaf.y = this.foot.y + 0.1 + Math.random() * 0.9;
    leaf.h = 1.5 + Math.random() * 0.9;
    leaf.fall = 0.2 + Math.random() * 0.14;
    leaf.wait = 0;
    leaf.bb.setVisible(true).setAlpha(1);
  }

  public update(dt: number, gust: number): void {
    this.clock += dt;
    const t = this.clock;
    // a copa: o quadro do vento só na rajada (parada, ela é uma árvore; mexendo sempre, um pisca-pisca)
    const frame = gust > 0.3 && Math.sin(t * 5.2) > 0 ? 1 : 0;
    if (frame !== this.frame) {
      this.frame = frame;
      this.tree.setTexture(mapleKey(frame), 0);
    }
    for (const leaf of this.falling) {
      if (leaf.wait > 0) {
        leaf.wait -= dt;
        if (leaf.wait <= 0) this.drop(leaf);
        continue;
      }
      leaf.h -= leaf.fall * dt;
      const sway = Math.sin(t * 1.7 + leaf.phase);
      leaf.bb.setPosition(leaf.x + sway * 0.22 + (1.8 - leaf.h) * 0.12, leaf.y)
        .setElevation(Math.max(0.04, leaf.h))
        .setTexture(LEAF_AIR[sway > 0 ? 0 : 1], 0)
        .setAlpha(Math.min(1, Math.max(0, leaf.h / 0.25)));
      if (leaf.h <= 0) {
        leaf.bb.setVisible(false);
        leaf.wait = 2.5 + Math.random() * 6;
      }
    }
    for (const leaf of this.afloat) {
      leaf.angle += leaf.speed * dt;
      const bob = Math.sin(t * 0.9 + leaf.phase) * 0.02;
      leaf.bb.setPosition(
        this.pool.x + Math.cos(leaf.angle) * this.pool.hw * leaf.rx + bob,
        this.pool.y + Math.sin(leaf.angle) * this.pool.hh * leaf.ry,
      );
    }
  }

  public setVisible(on: boolean): void {
    this.tree.setVisible(on);
    for (const leaf of this.falling) leaf.bb.setVisible(on && leaf.wait <= 0);
    for (const leaf of this.afloat) leaf.bb.setVisible(on);
  }

  public destroy(): void {
    this.tree.destroy();
    for (const leaf of this.falling) leaf.bb.destroy();
    for (const leaf of this.afloat) leaf.bb.destroy();
    this.falling.length = 0;
    this.afloat.length = 0;
  }
}
