import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { Season } from '@/game/runtime/seasons';
import { biomeTreeTintAt, CANOPY_REF } from '@/game/world/biomes';

import { TILESET as P, PROP_TINT, hash, texture, type NatureFrame, type NatureSystem, type TreeSpot } from './kit';

/**
 * AS FOLHAS QUE CAEM (pedido do autor, 2026-11-18: "luz e movimento" na mata). De vez em quando uma folha se solta de
 * uma copa perto do herói, desce virando e dançando no vento do vale, pousa no chão, fica um pouco e some. Quando a
 * RAJADA passa (runtime/wind, a mesma que sacode as copas e deita o capim), a mata solta várias de uma vez, e elas
 * voam para leste antes de cair. No outono caem muito mais; no inverno, quase nenhuma.
 *
 * Cada folha é um pixel ou dois do mundo, no traço do tileset (como as pétalas da cerejeira, objects/SakuraPetals), e
 * vira de lado enquanto cai: de frente, deitada, de pé. A cor é a da COPA de onde ela saiu — a cor que o bioma dá às
 * árvores (world/biomes) —, e no outono o ocre, o âmbar e a ferrugem do chão de folhas (LeafLitter).
 */

/**
 * A folha virando: de frente (a folhinha de 3×3, na diagonal, com a nervura), de lado (3×2), de pé (1×3), de lado de
 * novo. Branca: a cor vem do tom de cada uma. Com dois pixels ela sumia na mata (a primeira versão).
 */
const LIGHT = '#ffffff';
const SHADE = '#b4b4b4';
const VEIN = '#8c8c8c';
const FRAMES = [
  texture('leaf-fall-face', 3, 3, (put) => {
    put(0, 0, LIGHT); put(1, 0, LIGHT); put(0, 1, LIGHT); put(1, 1, VEIN); put(2, 1, SHADE); put(1, 2, SHADE); put(2, 2, SHADE);
  }),
  texture('leaf-fall-side', 3, 2, (put) => { put(0, 0, LIGHT); put(1, 0, LIGHT); put(1, 1, VEIN); put(2, 1, SHADE); }),
  texture('leaf-fall-edge', 1, 3, (put) => { put(0, 0, LIGHT); put(0, 1, SHADE); put(0, 2, VEIN); }),
  texture('leaf-fall-side', 3, 2, (put) => { put(0, 0, LIGHT); put(1, 0, LIGHT); put(1, 1, VEIN); put(2, 1, SHADE); }),
] as const;
const SIZES: ReadonlyArray<readonly [number, number]> = [[3, 3], [3, 2], [1, 3], [3, 2]];
/** Pousada no chão, a folha fica de lado. */
const LANDED = 1;

/** Quantas se soltam por segundo, por estação (sem rajada), e quantas a mais no auge de uma rajada. */
const RATE: Readonly<Record<Season, number>> = { spring: 0.35, summer: 0.5, autumn: 1.6, winter: 0.08 };
const GUST_RATE = 3.2;
/** Quando a rajada passa deste ponto, a mata solta um punhado de uma vez. */
const BURST_AT = 0.62;
/** No ar ao mesmo tempo, no máximo (as pousadas contam). */
const MAX = 46;
/** De onde elas se soltam: as copas a este raio do herói (tiles), na janela que a câmera vê. */
const NEAR = 9;
/** A queda: tiles por segundo, e o balanço de lado. */
const FALL: readonly [number, number] = [0.32, 0.55];
const SWAY = 0.32;
/** O vento leva a folha a esta fração da velocidade dele (runtime/wind, tiles/ms → tiles/s). */
const CARRY = 0.38;
/** Pousada, ela fica (s) e depois some (s). */
const REST: readonly [number, number] = [2.5, 5];
const FADE = 0.8;

/** As cores de folha do outono e do inverno (as do chão de folhas, um tom acima: no ar elas pegam luz). */
const SEASON_COLORS: Partial<Record<Season, readonly string[]>> = {
  autumn: [P.amber, P.ochre, P.rust, P.orange, P.sand],
  winter: [P.barkDk, P.fur],
};
/** A folha velha da primavera e do verão: a que amarelou na copa e se solta primeiro. */
const OLD_LEAVES: readonly string[] = [P.yellowHi, P.lime, P.sand, P.moss];

interface Leaf {
  bb: Billboard3D;
  x: number; y: number; e: number;
  fall: number; phase: number; spin: number; t: number;
  /** 'air' caindo; 'rest' pousada (o relógio `t` conta desde o pouso). */
  stage: 'air' | 'rest';
  rest: number;
}

const colorOf = (hex: string): THREE.Color => new THREE.Color(hex);
const CANOPY = colorOf(CANOPY_REF);
const PROP = new THREE.Color(PROP_TINT);

export class FallingLeaves implements NatureSystem {
  private readonly leaves: Leaf[] = [];
  private seed = 71;
  private acc = 0;
  private lastGust = 0;
  /** Quantas já caíram (o playtest lê). */
  public dropped = 0;

  private rand(): number {
    this.seed += 1;
    return hash(this.seed, 41, 433);
  }

  public get count(): number {
    return this.leaves.length;
  }

  public update(f: NatureFrame): void {
    const rate = (RATE[f.season] + GUST_RATE * f.gust * f.gust) * (f.windyDay ? 1.3 : 1);
    this.acc += rate * f.dt;
    let burst = 0;
    if (f.gust >= BURST_AT && this.lastGust < BURST_AT) burst = 4 + Math.floor(this.rand() * 5);
    this.lastGust = f.gust;
    if (this.acc >= 1 || burst > 0) {
      const trees = this.visibleTrees(f);
      for (; this.acc >= 1; this.acc -= 1) this.spawn(f, trees, false);
      for (let i = 0; i < burst; i += 1) this.spawn(f, trees, true);
    }
    const drift = f.wind * 1000 * CARRY;
    for (let i = this.leaves.length - 1; i >= 0; i -= 1) {
      const l = this.leaves[i];
      l.t += f.dt;
      if (l.stage === 'air') {
        // Desce, balança de lado e o vento a leva; vira de frente, deitada e de pé, num ritmo dela.
        l.e -= l.fall * f.dt;
        l.x += (drift * (0.6 + 0.4 * Math.min(1, l.e)) + Math.cos(l.t * 2.6 + l.phase) * SWAY) * f.dt;
        l.y += Math.sin(l.t * 1.7 + l.phase) * 0.08 * f.dt;
        const k = Math.floor((l.t * l.spin + l.phase) % FRAMES.length);
        l.bb.setTexture(FRAMES[k]).setDisplaySize(SIZES[k][0] / 16, SIZES[k][1] / 16);
        if (l.e <= 0.02) {
          l.e = 0.02;
          l.stage = 'rest';
          l.t = 0;
          l.bb.setTexture(FRAMES[LANDED]).setDisplaySize(SIZES[LANDED][0] / 16, SIZES[LANDED][1] / 16);
          this.dropped += 1;
        }
      } else if (l.t > l.rest) {
        const fade = 1 - (l.t - l.rest) / FADE;
        if (fade <= 0) { l.bb.destroy(); this.leaves.splice(i, 1); continue; }
        l.bb.setAlpha(fade);
      }
      l.bb.setPosition(l.x, l.y).setElevation(l.e);
    }
  }

  /** As copas perto do herói, na janela que a câmera vê (mais para o norte que para o sul: a câmera olha de lá). */
  private visibleTrees(f: NatureFrame): readonly TreeSpot[] {
    return f.host.treesNear(f.hero.x, f.hero.y, NEAR).filter((t) => t.y - f.hero.y < 5 && f.hero.y - t.y < 8);
  }

  /**
   * Uma folha se solta da copa de uma árvore. Na RAJADA ela sai das árvores do lado de onde o vento vem (oeste), para
   * atravessar o quadro voando.
   */
  private spawn(f: NatureFrame, trees: readonly TreeSpot[], gusting: boolean): void {
    if (trees.length === 0 || this.leaves.length >= MAX) return;
    const pool = gusting ? trees.filter((t) => t.x <= f.hero.x + 1) : trees;
    const t = (pool.length ? pool : trees)[Math.floor(this.rand() * (pool.length || trees.length))];
    const x = t.x + (this.rand() - 0.5) * t.crown * 2;
    const y = t.y + 0.08 + this.rand() * 0.2;
    const e = t.height * (0.55 + this.rand() * 0.4) + (t.big ? 0.4 : 0);
    const bb = world3d().objects.addBillboard(FRAMES[0], 0, { centered: true, alphaTest: 0.5 })
      .setTint(this.tintFor(t, f.season))
      .setDisplaySize(SIZES[0][0] / 16, SIZES[0][1] / 16)
      .setPosition(x, y)
      .setElevation(e);
    this.leaves.push({
      bb, x, y, e,
      fall: FALL[0] + this.rand() * (FALL[1] - FALL[0]),
      phase: this.rand() * 6.28,
      spin: 5 + this.rand() * 4,
      t: 0,
      stage: 'air',
      rest: REST[0] + this.rand() * (REST[1] - REST[0]),
    });
  }

  /**
   * A cor da folha: a da estação no outono e no inverno; no resto do ano, metade é a folha VELHA que se solta (amarelada,
   * seca) e metade a da copa daquela árvore (a cor do bioma nas árvores), mais clara: no ar ela pega luz dos dois lados.
   */
  private tintFor(t: TreeSpot, season: Season): number {
    const fall = SEASON_COLORS[season] ?? (this.rand() < 0.5 ? OLD_LEAVES : undefined);
    let c: THREE.Color;
    if (fall) {
      c = colorOf(fall[Math.floor(this.rand() * fall.length)]);
    } else {
      const [r, g, b] = biomeTreeTintAt(t.x, t.y);
      const lift = 1.5 + this.rand() * 0.35;
      c = new THREE.Color(Math.min(1, CANOPY.r * r * lift), Math.min(1, CANOPY.g * g * lift), Math.min(1, CANOPY.b * b * lift));
    }
    // O tom das peças do mundo (objects/nature/kit): sem ele a luz do vale estoura a folha clara num ponto aceso.
    return c.multiply(PROP).getHex();
  }

  public destroy(): void {
    for (const l of this.leaves) l.bb.destroy();
    this.leaves.length = 0;
  }
}
