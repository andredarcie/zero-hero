import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';

import { FALL_FRAMES, FALL_W, OVER_WATER, SPLASH_H, SPLASH_W, SPOUT, SPOUT_H, SPOUT_W, WISPS, fallKey, splashKey } from './springArt';

/**
 * A CASCATA DA FONTE (objects/spring/HotSpring): é dela que a água vem. Uma bica de pedra com musgo sai do paredão do
 * fundo, a meia altura; dela cai um véu d'água que abre até a poça (quatro quadros, os riscos de luz descendo), e no pé
 * um respingo de espuma pulsa e solta gotas, com um sopro de vapor subindo dali. A espuma que ferve na água e os
 * anéis que saem do pé são da própria água (render3d/springWater, `uSpringFall`).
 *
 * A CONTA DO PRUMO: um quadro em pé deita para trás junto com a câmera (27°), então o alto dele fica 0,45 da altura
 * mais ao norte que o pé. O paredão começa em `wall` (a beira do tile de cima): o pé do véu fica dentro da poça, na
 * medida para o alto dele encostar na pedra sem entrar nela, e a bica, mais à frente, tapa a nascente.
 */

/** Quanto o alto de um quadro em pé recua por tile de altura (o seno da inclinação da câmera). */
const LEAN = 0.454;
/** A altura da boca da bica sobre o chão da gruta, e o tamanho da bica (tiles). O véu vai da boca até a água. */
const MOUTH = 0.9;
const ROCK = { w: SPOUT_W / 16, h: SPOUT_H / 16 };
const FRAME_S = 0.11;
/** O tom da água caindo (o da poça: sob a luz dourada o turquesa pede um nada de azul) e o da pedra. */
const WATER_TINT = 0xb0bcc8;
const ROCK_TINT = 0xb4b0aa;
const PUFFS = 3;

interface Puff { bb: Billboard3D; age: number; life: number; dx: number }

export class SpringCascade {
  private readonly veil: Billboard3D;
  private readonly splash: Billboard3D;
  private readonly spout: Billboard3D;
  private readonly puffs: Puff[] = [];
  private frame = 0;
  private clock = 0;
  /** Onde o véu toca a água (o shader ferve a espuma e abre os anéis ali). */
  public readonly foot: { x: number; y: number };

  /** `surface`: a altura da água (abaixo do chão da gruta: a bacia é funda). */
  public constructor(x: number, wall: number, private readonly surface: number) {
    const objects = world3d().objects;
    const veil = { w: FALL_W / 16, h: MOUTH - surface };
    // o pé do véu: o alto dele encosta no paredão
    const footY = wall + veil.h * LEAN + 0.04;
    this.foot = { x, y: footY };
    this.veil = objects.addBillboard(fallKey(0), 0, { depthWrite: false, alphaTest: 0.05, renderOrder: OVER_WATER })
      .setTint(WATER_TINT)
      .setDisplaySize(veil.w, veil.h)
      .setPosition(x, footY)
      .setElevation(surface + 0.02);
    // a bica: mais à frente que o alto do véu (tapa a nascente), com o pé dela na altura da boca
    this.spout = objects.addBillboard(SPOUT, 0, {})
      .setTint(ROCK_TINT)
      .setDisplaySize(ROCK.w, ROCK.h)
      .setPosition(x, wall + ROCK.h * LEAN + 0.16)
      .setElevation(MOUTH - 0.1);
    this.splash = objects.addBillboard(splashKey(0), 0, { depthWrite: false, alphaTest: 0.05, renderOrder: OVER_WATER })
      .setTint(WATER_TINT)
      .setDisplaySize(SPLASH_W / 16, SPLASH_H / 16)
      .setPosition(x, footY + 0.05)
      .setElevation(surface + 0.02);
    for (let i = 0; i < PUFFS; i += 1) {
      const bb = objects.addBillboard(WISPS[i % WISPS.length], 0, {
        centered: true, depthWrite: false, alphaTest: 0.01, renderOrder: OVER_WATER,
      }).setAlpha(0);
      this.puffs.push({ bb, age: (i / PUFFS) * 2.4, life: 2.4, dx: 0 });
    }
  }

  public update(dt: number, density: number, tint: number): void {
    this.clock += dt;
    while (this.clock >= FRAME_S) {
      this.clock -= FRAME_S;
      this.frame = (this.frame + 1) % FALL_FRAMES;
      this.veil.setTexture(fallKey(this.frame), 0);
      this.splash.setTexture(splashKey(this.frame), 0);
    }
    // o sopro de vapor do pé: sobe depressa e some (é água quente batendo na água)
    for (const p of this.puffs) {
      p.age += dt;
      if (p.age >= p.life) {
        p.age = 0;
        p.life = 2 + Math.random() * 1.2;
        p.dx = (Math.random() - 0.5) * 0.5;
      }
      const k = p.age / p.life;
      const size = 0.35 + 0.55 * k;
      p.bb.setPosition(this.foot.x + p.dx * k, this.foot.y + 0.08)
        .setElevation(this.surface + 0.12 + size * 0.66 + 0.5 * k)
        .setDisplaySize(size, size * 1.33)
        .setTint(tint)
        .setAlpha(0.45 * (0.5 + 0.5 * density) * Math.sin(Math.PI * k));
    }
  }

  public setVisible(on: boolean): void {
    this.veil.setVisible(on);
    this.splash.setVisible(on);
    this.spout.setVisible(on);
    for (const p of this.puffs) p.bb.setVisible(on);
  }

  public destroy(): void {
    this.veil.destroy();
    this.splash.destroy();
    this.spout.destroy();
    for (const p of this.puffs) p.bb.destroy();
    this.puffs.length = 0;
  }
}
