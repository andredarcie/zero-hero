// O CORTE QUE SATISFAZ (pedido do autor, 2026-11-17: "faça essa grama alta, quando eu corto com a foice, ser mais
// satisfatória, saltando partículas e efeito de juice"). Antes o tufo encolhia em 210 ms e trocava de desenho.
//
// No instante em que a lâmina passa pelo mato (SwordMow.MOW_CONTACT_MS), cinco coisas, todas no mesmo quadro:
//   · AS PONTAS VOAM: cada fio que estava em pé solta a PRÓPRIA ponta — a mesma região do atlas, desenhada pelo mesmo
//     material do mato (render3d/world/GrassFlyers), então ela tem exatamente a cor que tinha em pé, de dia e de
//     noite — para o lado da varrida, para a frente e para cima, girando. A física é de capim: sobe leve, o ar a freia
//     (arrasto), ela bamboleia caindo, POUSA deitada, fica um tempo e só então encolhe e some. Coisa que some no ar
//     nunca caiu;
//   · A PALHA SOBE: uns grãos de pólen e palha boiam acima do corte e descem devagar, balançando, mais tempo que tudo —
//     o "assentar" do golpe;
//   · O PÓ do pé, baixinho, e já foi;
//   · A ONDA: o capim em volta (a decoração E o mato vizinho) é empurrado para longe do golpe e volta balançando — o
//     mesmo anel da esteira dos passos, mais forte (StandingDecor.ripple);
//   · O PESO: o mundo segura o quadro do golpe por 50 ms (hitstop: os tweens param, a lâmina fica no meio do mato) e a
//     câmera dá um tranquinho para o lado da varrida.

import type { TallGrassObject } from '@/game/objects/TallGrassObject';
import { FX_DOT_TEXTURE, FX_PUFF_TEXTURE } from '@/game/render3d/World3D';
import { TallGrassField } from '@/game/render3d/world/TallGrassField';
import type { GrassFlyers } from '@/game/render3d/world/GrassFlyers';
import type { GameScene } from '../GameScene';
import { FX_BILLBOARD } from './sceneDefs';

/** O que MowFx usa de GameScene. */
export type MowFxHost = Pick<GameScene, 'tweens' | 'world3d'>;

const GRAVITY = 7.5; // tiles/s²: capim é leve
const DRAG = 2.6;    // o ar freia a ponta
const LIE_S = [0.9, 1.5] as const;
const SHRINK_S = 0.3;
const HITSTOP_MS = 50;
const MAX_TIPS = 11;

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
/** Escurece uma cor 0xRRGGBB pelo fator `k`. */
const shade = (c: number, k: number): number => {
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(v * k)));
  return (f((c >> 16) & 0xff) << 16) | (f((c >> 8) & 0xff) << 8) | f(c & 0xff);
};

interface Tip {
  slot: number;
  ground: number;
  x0: number; z0: number; e0: number;
  vx: number; vz: number; ve: number;
  spin: number; a0: number; wob: number;
  land: number; rest: number; lie: number;
}

export class MowFx {
  public constructor(private readonly host: MowFxHost) {}

  /**
   * O golpe acertou o tufo `grass`, com o herói olhando para (dirX, dirY). Chamar ANTES de `grass.cut()`: é dos fios
   * em pé que saem as pontas.
   */
  public burst(grass: TallGrassObject, dirX: number, dirY: number): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    const flyers = TallGrassField.for(w3.scene).flyers;
    const light = w3.probe.lightLevelAt(grass.worldX, grass.worldY);
    // a varrida vai da direita para a esquerda do herói: a esquerda dele é (dy, −dx)
    const sideX = dirY;
    const sideZ = -dirX;
    const blades = [...grass.blades].filter((b) => b.tip).sort((a, b) => b.height - a.height).slice(0, MAX_TIPS);
    const tips: Tip[] = blades.map((b) => {
      const tip = b.tip!;
      const slot = flyers.spawn(tip);
      const e0 = ((tip.row1 - tip.row0 + 1) / 32) + 3 / 16; // o centro da ponta, acima do corte
      const ve = rnd(1.1, 2.2);
      const lift = ve / GRAVITY;
      const halfW = (tip.col1 - tip.col0 + 1) / 32;
      return {
        slot, ground: b.y + halfW, x0: b.x, z0: b.z, e0,
        vx: sideX * rnd(0.7, 1.7) + dirX * rnd(0.1, 0.7) + rnd(-0.35, 0.35),
        vz: sideZ * rnd(0.7, 1.7) + dirY * rnd(0.1, 0.7) + rnd(-0.25, 0.25),
        ve, spin: rnd(-14, 14), a0: rnd(-0.6, 0.6), wob: rnd(0, Math.PI * 2),
        // quando a ponta chega ao chão (a conta da parábola) e quanto ela fica deitada
        land: lift + Math.sqrt(lift * lift + (2 * e0) / GRAVITY), rest: (Math.random() < 0.5 ? 1 : -1) * rnd(1.35, 1.75),
        lie: rnd(LIE_S[0], LIE_S[1]),
      };
    });
    if (tips.length > 0) {
      const life = Math.max(...tips.map((t) => t.land + t.lie)) + SHRINK_S;
      const clock = { t: 0 };
      for (const t of tips) this.fly(flyers, t, 0);
      this.host.tweens.add({
        targets: clock, t: life, duration: life * 1000, ease: 'Linear',
        onUpdate: () => { for (const t of tips) this.fly(flyers, t, clock.t); },
        onComplete: () => { for (const t of tips) flyers.release(t.slot); },
      });
    }
    this.chaff(grass.worldX, grass.worldY, light, sideX, sideZ);
    this.dust(grass.worldX, grass.worldY, light);
    w3.objects.rippleGrass(grass.worldX, grass.worldY, 1.8);
    w3.cam.shake(70, 0.0035, sideX, sideZ);
    this.hitstop();
  }

  /** Uma ponta no instante `t` (s): a parábola com arrasto e o bamboleio no ar; no chão, deitada; e encolhe. */
  private fly(flyers: GrassFlyers, p: Tip, t: number): void {
    const flyT = Math.min(t, p.land);
    const drift = (1 - Math.exp(-DRAG * flyT)) / DRAG;
    const wobble = Math.sin(flyT * 13 + p.wob) * 0.05 * Math.min(1, flyT * 4);
    const x = p.x0 + p.vx * drift + wobble;
    const z = p.z0 + p.vz * drift;
    if (t < p.land) {
      const e = p.e0 + p.ve * t - 0.5 * GRAVITY * t * t;
      flyers.set(p.slot, x, p.ground + Math.max(0, e), z, p.a0 + p.spin * t, 1);
      return;
    }
    // no chão: assenta deitada (gira até o ângulo de repouso), fica, e encolhe até sumir
    const since = t - p.land;
    const flyAngle = p.a0 + p.spin * p.land;
    const settle = Math.min(1, since / 0.12);
    const shrink = since > p.lie ? Math.max(0, 1 - (since - p.lie) / SHRINK_S) : 1;
    flyers.set(p.slot, x, p.ground, z, flyAngle + (p.rest - flyAngle) * settle, shrink);
  }

  /** A palha e o pólen que boiam acima do corte e descem devagar, balançando. */
  private chaff(x: number, y: number, light: number, sideX: number, sideZ: number): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    const tints = [0xd4c2b1, 0xd9b453, 0x8a8d49];
    const k = 0.35 + 0.6 * Math.min(1, light);
    for (let i = 0; i < 10; i += 1) {
      const bit = w3.objects.addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, emissive: true, alphaTest: 0.02 })
        .setTint(shade(tints[i % tints.length], k))
        .setDisplaySize(1 / 16, 1 / 16)
        .setPosition(x + rnd(-0.3, 0.3), y + rnd(-0.2, 0.2))
        .setElevation(rnd(0.2, 0.5));
      const clock = { t: 0 };
      const peak = rnd(0.55, 0.95);
      const sx = bit.x;
      const sz = bit.y;
      const drift = rnd(0.3, 0.8);
      const phase = rnd(0, Math.PI * 2);
      this.host.tweens.add({
        targets: clock, t: 1, duration: rnd(1300, 2100), ease: 'Linear',
        onUpdate: () => {
          // sobe depressa no sopro do golpe, e desce devagar como pluma
          const up = clock.t < 0.18 ? Math.sin((clock.t / 0.18) * (Math.PI / 2)) : 1 - (clock.t - 0.18) / 0.82;
          bit.setElevation(0.05 + peak * up)
            .setPosition(sx + sideX * drift * clock.t + Math.sin(clock.t * 9 + phase) * 0.06, sz + sideZ * drift * clock.t)
            .setAlpha(clock.t > 0.7 ? (1 - clock.t) / 0.3 : 1);
        },
        onComplete: () => bit.destroy(),
      });
    }
  }

  /** O pó do pé, baixinho. */
  private dust(x: number, y: number, light: number): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    for (let i = 0; i < 2; i += 1) {
      const puff = w3.objects.addBillboard(FX_PUFF_TEXTURE, 0, { ...FX_BILLBOARD, emissive: true, alphaTest: 0.02 })
        .setTint(shade(0xa79f86, 0.3 + 0.6 * Math.min(1, light)))
        .setPosition(x + rnd(-0.25, 0.25), y + rnd(-0.1, 0.15))
        .setElevation(0.08)
        .setDisplaySize(0.3, 0.3)
        .setAlpha(0.26);
      this.host.tweens.add({
        targets: puff, elevation: 0.35, scaleX: 0.6, scaleY: 0.6, alpha: 0, duration: 480 + i * 120, ease: 'Power2.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  }

  /** O mundo segura o quadro do golpe (só se ninguém mais estiver mexendo no relógio dos tweens). */
  private hitstop(): void {
    const tweens = this.host.tweens;
    if (tweens.timeScale !== 1) return;
    tweens.timeScale = 0;
    window.setTimeout(() => { if (tweens.timeScale === 0) tweens.timeScale = 1; }, HITSTOP_MS);
  }
}
