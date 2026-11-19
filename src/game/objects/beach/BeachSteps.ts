import { getSoundManager } from '@/game/audio/SoundManager';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import { SURF_WET, swashAt } from '@/game/render3d/surf';

import { hash, texture } from '@/game/objects/nature/kit';
import { leftSide, stepDir, stepPrint, type PrintDir } from '@/game/objects/stepPrints';
import { textureImage } from '@/game/render3d/textures3d';

import { coastAt, NO_COAST, type BeachFrame, type BeachSystem } from './kit';

/**
 * O HERÓI NA PRAIA (pedido do autor, 2026-11-19: "faça a água do mar e a areia interagir com o personagem de forma
 * realista"). O que a areia e a água fazem com quem pisa nelas:
 *
 *   · PEGADAS. Na areia seca, uma marca rasa a cada passo, pé esquerdo e pé direito, que o vento apaga em uns quinze
 *     segundos. Na areia molhada a pegada é funda e nítida — e a ONDA A APAGA: quando a lâmina passa por cima, ela some.
 *   · PÉ MOLHADO. Quem sai da água leva a água no pé: as primeiras pegadas na areia seca saem escuras, e vão clareando.
 *   · AREIA LEVANTADA. Na areia seca cada passo joga uns grãos para trás.
 *   · A LÂMINA D'ÁGUA. Com a água nos pés, cada passo respinga (gotas claras e o "chap"), e parado no espraio a água
 *     abre um anel em volta do tornozelo a cada onda. (A espuma que contorna os pés e a esteira que ela deixa é do
 *     shader: render3d/surf.ts lê onde os corpos estão.)
 *
 * Tudo em pixel de arte, deitado no chão ou em gotas de um pixel: nada de partícula macia.
 */

// A pegada é a do jogo inteiro (objects/stepPrints: a sola de bota afundada, o pé esquerdo e o direito, o bico para
// onde ele anda), na areia seca com o beiço de creme e na molhada funda, com água no fundo.
const DOT = texture('beach-dot', 1, 1, (put) => put(0, 0, '#ffffff'));
/** O anel na água: uma elipse fina, de 16 por 8. */
const RING = texture('beach-ring', 16, 8, (put) => {
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const r = Math.hypot((x + 0.5 - 8) / 8, (y + 0.5 - 4) / 4);
      if (r > 0.72 && r <= 1) put(x, y, '#ffffff');
    }
  }
});

interface Print { bb: Billboard3D; x: number; y: number; t: number; life: number; alpha: number; wet: boolean }
interface Bit { bb: Billboard3D; x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; life: number }
interface Ring { bb: Billboard3D; t: number }

/** Um passo a cada tanto de chão andado (tiles), e a meia distância entre os dois pés (a mesma de scenes/Footprints). */
const STRIDE = 0.5;
const FEET = 0.19;
const MAX_PRINTS = 44;
/** Quanto dura a pegada na areia seca e na molhada (s). */
const DRY_LIFE = 15;
const WET_LIFE = 9;
/** O pé molhado na areia seca: a última pegada molhada sai com esta força (a primeira, inteira). */
const WET_FEET_LAST = 0.45;
/** O pé molhado: quantas pegadas escuras ele ainda deixa ao sair da água. */
const WET_FEET_STEPS = 7;
const SAND_TINT = 0xb4a078;
const FOAM_TINT = 0xd8e6e6;

export class BeachSteps implements BeachSystem {
  private readonly prints: Print[] = [];
  private readonly bits: Bit[] = [];
  private readonly rings: Ring[] = [];
  private last: { x: number; y: number } | null = null;
  private walked = 0;
  private foot = 1;
  private wetFeet = 0;
  private ringWave = Number.NaN;
  private seed = 5;
  /** Quantas pegadas já foram deixadas, quantas a onda apagou e quantos respingos (o playtest lê). */
  public stepped = 0;
  public washed = 0;
  public splashes = 0;

  private rand(): number {
    this.seed += 1;
    return hash(this.seed, 43, 1009);
  }

  public get state(): { prints: number; wetFeet: number; inWater: boolean } {
    return { prints: this.prints.length, wetFeet: this.wetFeet, inWater: this.inWater };
  }

  private inWater = false;

  public update(f: BeachFrame): void {
    this.updatePrints(f);
    this.updateBits(f);
    this.updateRings(f);
    const hero = f.hero;
    const onSand = f.coast > NO_COAST && f.world.isSand(Math.round(hero.x), Math.round(hero.y));
    if (!onSand) { this.last = null; this.inWater = false; return; }
    const swash = swashAt(hero.x, f.time);
    this.inWater = f.coast > swash.edge;
    if (this.inWater) this.wetFeet = WET_FEET_STEPS;
    // parado na lâmina: a cada onda que chega, a água abre um anel no tornozelo
    if (this.inWater && swash.n !== this.ringWave) {
      this.ringWave = swash.n;
      this.ring(hero.x, hero.y);
    }
    if (!this.last) { this.last = { x: hero.x, y: hero.y }; return; }
    const dx = hero.x - this.last.x;
    const dy = hero.y - this.last.y;
    const moved = Math.hypot(dx, dy);
    if (moved > 2) { this.last = { x: hero.x, y: hero.y }; this.walked = 0; return; } // um teleporte não deixa rastro
    if (moved < 1e-4) return;
    this.walked += moved;
    this.last.x = hero.x;
    this.last.y = hero.y;
    if (this.walked < STRIDE) return;
    this.walked %= STRIDE;
    this.foot = -this.foot;
    // o pé cai de um lado e do outro do rumo: o esquerdo à esquerda de quem anda
    const dir = stepDir(dx, dy);
    const [sx, sy] = leftSide(dir);
    const right = this.foot > 0;
    const side = right ? -FEET : FEET;
    const px = hero.x + sx * side;
    const py = hero.y + sy * side + 0.06;
    if (this.inWater) {
      this.splash(px, py);
      return;
    }
    const damp = f.coast > -SURF_WET;
    const wet = damp || this.wetFeet > 0;
    this.print(px, py, dir, right, wet, damp);
    if (!damp) {
      if (this.wetFeet > 0) this.wetFeet -= 1;
      else this.kick(px, py, -Math.sign(dx) * 0.5, -Math.sign(dy) * 0.5);
    }
  }

  /** Uma pegada no chão. Molhada (na faixa úmida, ou de pé molhado) ela é mais escura; a da faixa úmida a onda apaga. */
  private print(x: number, y: number, dir: PrintDir, right: boolean, wet: boolean, damp: boolean): void {
    const art = stepPrint(wet ? 'wetSand' : 'sand', dir, right);
    if (!textureImage(art.key)) return;
    if (this.prints.length >= MAX_PRINTS) this.prints.shift()?.bb.destroy();
    // o pé molhado vai secando: a pegada molhada na areia seca sai cada vez mais fraca
    const alpha = wet && !damp ? WET_FEET_LAST + (1 - WET_FEET_LAST) * (this.wetFeet / WET_FEET_STEPS) : 1;
    // o pixel da pegada na grade do pixel do chão
    const w = art.w / 16;
    const h = art.h / 16;
    const cx = Math.round((x - w / 2) * 16) / 16 + w / 2;
    const cy = Math.round((y - h / 2) * 16) / 16 + h / 2;
    const bb = world3d().objects.addBillboard(art.key, 0, { flat: true, flatY: 0.025, depthWrite: false, alphaTest: 0.01, depthLayer: 'ground' })
      .setDisplaySize(w, h).setPosition(cx, cy).setAlpha(alpha);
    this.prints.push({ bb, x: cx, y: cy, t: 0, life: damp ? WET_LIFE : DRY_LIFE, alpha, wet: damp });
    this.stepped += 1;
  }

  private updatePrints(f: BeachFrame): void {
    for (let i = this.prints.length - 1; i >= 0; i -= 1) {
      const p = this.prints[i];
      p.t += f.dt;
      // a onda passou por cima: a pegada some com ela
      if (p.wet && coastAt(p.x, p.y) > swashAt(p.x, f.time).edge) {
        p.bb.destroy();
        this.prints.splice(i, 1);
        this.washed += 1;
        continue;
      }
      if (p.t >= p.life) { p.bb.destroy(); this.prints.splice(i, 1); continue; }
      // some devagar no último terço (o vento, a areia assentando)
      const k = p.t / p.life;
      p.bb.setAlpha(p.alpha * (k < 0.66 ? 1 : 1 - (k - 0.66) / 0.34));
    }
  }

  /** Os grãos que o pé joga para trás na areia seca. */
  private kick(x: number, y: number, bx: number, by: number): void {
    for (let i = 0; i < 2; i += 1) this.bit(x, y, bx + (this.rand() - 0.5) * 0.7, by + (this.rand() - 0.5) * 0.5, 0.9 + this.rand() * 0.6, SAND_TINT, 0.32);
  }

  /** O respingo do passo na lâmina d'água. */
  private splash(x: number, y: number): void {
    this.splashes += 1;
    for (let i = 0; i < 4; i += 1) this.bit(x, y, (this.rand() - 0.5) * 1.5, (this.rand() - 0.5) * 0.9, 1.5 + this.rand() * 1.1, FOAM_TINT, 0.42);
    this.ring(x, y);
    getSoundManager().nature.playShallowStep();
  }

  private bit(x: number, y: number, vx: number, vy: number, vz: number, tint: number, life: number): void {
    if (this.bits.length >= 28) return;
    const bb = world3d().objects.addBillboard(DOT, 0, { centered: true, alphaTest: 0.01 }).setDisplaySize(1 / 16, 1 / 16).setTint(tint).setPosition(x, y);
    this.bits.push({ bb, x, y, z: 0.05, vx, vy, vz, t: 0, life });
  }

  private updateBits(f: BeachFrame): void {
    for (let i = this.bits.length - 1; i >= 0; i -= 1) {
      const b = this.bits[i];
      b.t += f.dt;
      b.vz -= 7 * f.dt;
      b.x += b.vx * f.dt;
      b.y += b.vy * f.dt;
      b.z += b.vz * f.dt;
      if (b.t >= b.life || b.z <= 0) { b.bb.destroy(); this.bits.splice(i, 1); continue; }
      b.bb.setPosition(b.x, b.y).setElevation(b.z);
    }
  }

  /** O anel que se abre na água em volta do pé. */
  private ring(x: number, y: number): void {
    if (this.rings.length >= 5) return;
    const bb = world3d().objects.addBillboard(RING, 0, { flat: true, flatY: 0.03, depthWrite: false, alphaTest: 0.01, depthLayer: 'ground' })
      .setTint(FOAM_TINT).setPosition(x, y + 0.04).setDisplaySize(0.3, 0.15).setAlpha(0.6);
    this.rings.push({ bb, t: 0 });
  }

  private updateRings(f: BeachFrame): void {
    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const r = this.rings[i];
      r.t += f.dt / 0.8;
      if (r.t >= 1) { r.bb.destroy(); this.rings.splice(i, 1); continue; }
      // abre em passos de pixel e some
      const size = Math.round((0.3 + r.t * 0.75) * 16) / 16;
      r.bb.setDisplaySize(size, size / 2).setAlpha(0.6 * (1 - r.t));
    }
  }

  public destroy(): void {
    for (const p of this.prints) p.bb.destroy();
    for (const b of this.bits) b.bb.destroy();
    for (const r of this.rings) r.bb.destroy();
    this.prints.length = 0;
    this.bits.length = 0;
    this.rings.length = 0;
  }
}
