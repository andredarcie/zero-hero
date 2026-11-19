import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';

import { hash, PROP_TINT, sprite, TILESET as P } from '@/game/objects/nature/kit';

import { coastAt, NO_COAST, type BeachFrame, type BeachSystem } from './kit';

/**
 * AS GAIVOTAS (pedido do autor, 2026-11-19: "vida animal"). Duas vidas, como na praia de verdade:
 *   · as do CHÃO, paradas na areia perto da linha da maré: ajeitam-se, bicam a areia, e LEVANTAM VOO quando o herói
 *     chega perto — para o mar, subindo, e depois de um tempo pousam noutro canto;
 *   · as do AR, planando em voltas largas sobre a arrebentação, com a sombra correndo na areia e na água embaixo
 *     delas. Planam quase o tempo todo e batem as asas de vez em quando.
 * De noite e na chuva forte não há gaivota.
 */

const C = { w: P.bone, W: P.boneDk, g: P.grey, G: P.greyDk, k: P.ink, e: P.ink, y: P.amber, o: P.orange };
const FRAMES = {
  stand: sprite('gull-stand', [
    '.....ww..',
    '....wewy.',
    '....www..',
    '.gggww...',
    'kggggww..',
    '.kgGwww..',
    '...wW....',
    '...o.o...',
  ], C),
  peck: sprite('gull-peck', [
    '.........',
    '.........',
    '.gggww...',
    'kggggwww.',
    '.kgGwwew.',
    '...wW.wy.',
    '...o.o...',
    '.........',
  ], C),
  up: sprite('gull-up', [
    '..kg.........',
    '...ggg.......',
    '....gggg.....',
    '..wwwgwwwey..',
    '.wwwwwwww....',
    '.............',
  ], C),
  down: sprite('gull-down', [
    '.............',
    '.............',
    '..wwwwwwwey..',
    '.wwwgggww....',
    '....gggg.....',
    '...ggk.......',
  ], C),
} as const;

interface Ground { bb: Billboard3D; x: number; y: number; z: number; mode: 'stand' | 'fly'; t: number; vx: number; vy: number; face: number }
interface Glider { bb: Billboard3D; shadow: Billboard3D; angle: number; rx: number; ry: number; speed: number; height: number; flap: number }

const MAX_GROUND = 3;
const GLIDERS = 2;
/** O herói a esta distância espanta a gaivota do chão. */
const SCARE = 2.4;
/** A faixa em que elas pousam (distância da costa). */
const BAND: readonly [number, number] = [-5.2, -1.6];

export class Seagulls implements BeachSystem {
  private readonly ground: Ground[] = [];
  private readonly gliders: Glider[] = [];
  private center = { x: 0, y: 0 };
  private seed = 53;
  private cooldown = 0;
  /** Quantas já levantaram voo de susto (o playtest lê). */
  public flights = 0;

  private rand(): number {
    this.seed += 1;
    return hash(this.seed, 29, 733);
  }

  public get state(): { ground: Array<{ x: number; y: number; mode: string }>; gliding: number } {
    return { ground: this.ground.map((g) => ({ x: g.x, y: g.y, mode: g.mode })), gliding: this.gliders.length };
  }

  public update(f: BeachFrame): void {
    // de dia e sem chuva forte; e só com o herói na praia
    const awake = f.phase > 0.24 && f.phase < 0.79 && f.rain < 0.5;
    const onBeach = f.coast > NO_COAST && f.coast > -13;
    this.updateGround(f, awake && onBeach);
    this.updateGliders(f, awake && onBeach);
  }

  private updateGround(f: BeachFrame, on: boolean): void {
    this.cooldown -= f.dt;
    if (on && this.ground.length < MAX_GROUND && this.cooldown <= 0 && !f.world.busy()) {
      this.land(f);
      this.cooldown = 2 + this.rand() * 4;
    }
    for (let i = this.ground.length - 1; i >= 0; i -= 1) {
      const g = this.ground[i];
      const heroD = Math.hypot(f.hero.x - g.x, f.hero.y - g.y);
      g.t -= f.dt;
      if (g.mode === 'stand') {
        if ((heroD < SCARE && !f.world.busy()) || !on) {
          // levanta voo para o mar, para longe do herói
          g.mode = 'fly';
          g.t = 3.2;
          const away = Math.sign(g.x - f.hero.x) || (this.rand() < 0.5 ? -1 : 1);
          g.vx = away * (2.2 + this.rand() * 1.6);
          g.vy = -(2.4 + this.rand() * 1.2);
          g.face = g.vx >= 0 ? 1 : -1;
          this.flights += 1;
        } else {
          const pecking = g.t < 0.45 && g.t > 0;
          g.bb.setTexture(pecking ? FRAMES.peck : FRAMES.stand).setDisplaySize(9 / 16, 8 / 16);
          if (g.t <= 0) {
            g.t = 1.6 + this.rand() * 3.4;
            if (this.rand() < 0.4) g.face = -g.face;
          }
        }
      } else {
        g.x += g.vx * f.dt;
        g.y += g.vy * f.dt;
        g.z = Math.min(3.6, g.z + 2.6 * f.dt);
        g.bb.setTexture(Math.floor(f.clock / 130) % 2 ? FRAMES.up : FRAMES.down).setDisplaySize(13 / 16, 6 / 16);
        if (g.t <= 0 || heroD > 13) { g.bb.destroy(); this.ground.splice(i, 1); continue; }
      }
      g.bb.setFlipX(g.face < 0).setPosition(g.x, g.y).setElevation(g.z);
    }
  }

  /** Uma gaivota pousa na areia, perto da linha da maré, longe do herói o bastante para ser vista parada. */
  private land(f: BeachFrame): void {
    for (let i = 0; i < 24; i += 1) {
      const x = Math.round(f.hero.x + (this.rand() - 0.5) * 18);
      const y = Math.round(f.hero.y + (this.rand() - 0.6) * 9);
      const d = Math.hypot(x - f.hero.x, y - f.hero.y);
      const c = coastAt(x, y);
      if (d < 4.6 || d > 9.5 || c < BAND[0] || c > BAND[1]) continue;
      if (!f.world.isSand(x, y) || !f.world.isFree(x, y)) continue;
      if (this.ground.some((o) => Math.hypot(o.x - x, o.y - y) < 2)) continue;
      const bb = world3d().objects.addBillboard(FRAMES.stand, 0, { groundShadow: { rx: 0.2, rz: 0.08, alpha: 0.26 } })
        .setDisplaySize(9 / 16, 8 / 16).setTint(PROP_TINT).setPosition(x, y);
      this.ground.push({ bb, x, y, z: 0, mode: 'stand', t: 1 + this.rand() * 3, vx: 0, vy: 0, face: this.rand() < 0.5 ? -1 : 1 });
      return;
    }
  }

  private updateGliders(f: BeachFrame, on: boolean): void {
    if (!on) {
      for (const g of this.gliders) { g.bb.destroy(); g.shadow.destroy(); }
      this.gliders.length = 0;
      return;
    }
    if (this.gliders.length === 0) {
      this.center = { x: f.hero.x, y: f.hero.y - 3 };
      for (let i = 0; i < GLIDERS; i += 1) {
        const w3 = world3d();
        const bb = w3.objects.addBillboard(FRAMES.up, 0, { centered: true }).setDisplaySize(13 / 16, 6 / 16).setTint(PROP_TINT);
        const shadow = w3.objects.addBillboard(FX_DOT_TEXTURE, 0, { flat: true, flatY: 0.03, depthWrite: false, alphaTest: 0.01, depthLayer: 'ground' })
          .setTint(0x000000).setDisplaySize(0.7, 0.3).setAlpha(0.16);
        this.gliders.push({
          bb, shadow, angle: i * 2.6 + this.rand() * 2, rx: 6.5 + i * 2.2, ry: 2.8 + i * 0.9, speed: (0.3 + this.rand() * 0.14) * (i % 2 ? -1 : 1),
          height: 3.1 + i * 0.7, flap: 0,
        });
      }
    }
    // o centro das voltas acompanha o herói devagar, sobre a arrebentação
    const k = 1 - Math.exp(-f.dt / 4);
    this.center.x += (f.hero.x - this.center.x) * k;
    this.center.y += (f.hero.y - 2.5 + Math.min(0, f.coast) * 0.4 - this.center.y) * k;
    for (const g of this.gliders) {
      g.angle += g.speed * f.dt;
      g.flap -= f.dt;
      if (g.flap < -3 - this.rand() * 4) g.flap = 0.9;
      const x = this.center.x + Math.cos(g.angle) * g.rx;
      const y = this.center.y + Math.sin(g.angle) * g.ry;
      const flapping = g.flap > 0 && Math.floor(g.flap / 0.15) % 2 === 0;
      const moveX = -Math.sin(g.angle) * g.speed;
      g.bb.setTexture(flapping ? FRAMES.down : FRAMES.up).setFlipX(moveX < 0).setPosition(x, y).setElevation(g.height + Math.sin(g.angle * 2) * 0.25);
      g.shadow.setPosition(x, y + 0.2);
    }
  }

  public destroy(): void {
    for (const g of this.ground) g.bb.destroy();
    for (const g of this.gliders) { g.bb.destroy(); g.shadow.destroy(); }
    this.ground.length = 0;
    this.gliders.length = 0;
  }
}
