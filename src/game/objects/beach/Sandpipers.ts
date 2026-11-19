import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import { swashAt } from '@/game/render3d/surf';

import { hash, PROP_TINT, sprite, TILESET as P } from '@/game/objects/nature/kit';

import { coastAt, NO_COAST, type BeachFrame, type BeachSystem } from './kit';

/**
 * OS MAÇARICOS (pedido do autor, 2026-11-19: "vida animal"). O passarinho que toda praia tem, e o único bicho do jogo
 * que anda com a ONDA: o bando corre atrás da água que recua, bicando a areia molhada, e foge da lâmina que sobe, sempre
 * a um palmo da espuma, sem nunca molhar o pé. Eles leem o mesmo relógio que desenha a onda (render3d/surf.swashAt),
 * então é da onda que se vê que eles fogem.
 *
 * O bando passeia devagar ao longo da praia. Com o herói perto, levantam todos juntos num voo curto e rasante, pousam
 * adiante e voltam ao serviço.
 */

const C = { b: P.fur, B: P.furDk, w: P.bone, e: P.ink, k: P.ink };
const FRAMES = {
  run1: sprite('piper-run1', [
    '...bb..',
    '..bbekk',
    '.bBww..',
    '..ww...',
    '..k.k..',
  ], C),
  run2: sprite('piper-run2', [
    '...bb..',
    '..bbekk',
    '.bBww..',
    '..ww...',
    '.k...k.',
  ], C),
  peck: sprite('piper-peck', [
    '.......',
    '..bbb..',
    '.bBwwe.',
    '..ww.k.',
    '..k.kk.',
  ], C),
  fly: sprite('piper-fly', [
    '.b...b.',
    '..bbb..',
    '.wbewkk',
    '..ww...',
    '.......',
  ], C),
} as const;

interface Bird { bb: Billboard3D; off: number; gap: number; cp: number; y: number; face: number; peck: number }

const FLOCK = 4;
/** A que distância da espuma eles ficam, em tiles, e o quanto correm. */
const GAP: readonly [number, number] = [0.22, 0.5];
const RUN = 2.6;
/** O bando passeia ao longo da praia a isto (tiles/s) e foge do herói a esta distância. */
const STROLL = 0.45;
const SCARE = 2.3;

export class Sandpipers implements BeachSystem {
  private birds: Bird[] = [];
  private x = 0;
  private dir = 1;
  private turn = 0;
  /** O voo de fuga: quanto falta (s) e para que lado. */
  private flight = 0;
  private seed = 77;
  /** Quantas vezes o bando levantou voo (o playtest lê). */
  public flights = 0;

  private rand(): number {
    this.seed += 1;
    return hash(this.seed, 37, 911);
  }

  public get state(): { x: number; birds: Array<{ x: number; y: number; gap: number }>; flying: boolean } {
    return { x: this.x, birds: this.birds.map((b) => ({ x: this.x + b.off, y: b.y, gap: b.gap })), flying: this.flight > 0 };
  }

  public update(f: BeachFrame): void {
    const on = f.coast > NO_COAST && f.coast > -11 && f.phase > 0.23 && f.phase < 0.8 && f.rain < 0.5;
    if (!on) { this.clear(); return; }
    if (this.birds.length === 0) {
      if (f.world.busy()) return;
      this.spawn(f);
      if (this.birds.length === 0) return;
    }
    const heroD = Math.hypot(f.hero.x - this.x, f.hero.y - this.birds[0].y);
    if (heroD > 16) { this.clear(); return; }
    if (this.flight <= 0 && heroD < SCARE && !f.world.busy()) {
      this.flight = 1.5;
      this.dir = Math.sign(this.x - f.hero.x) || 1;
      this.flights += 1;
    }
    // o passeio: muda de rumo de vez em quando, e onde a areia acaba (uma pedra, o pontal)
    this.turn -= f.dt;
    const speed = this.flight > 0 ? 5.2 : STROLL;
    const ahead = this.x + this.dir * (speed * f.dt + 1.2);
    if (!this.sandAt(f, ahead)) {
      this.dir = -this.dir;
      if (this.flight > 0) this.flight = Math.min(this.flight, 0.25);
    } else if (this.flight <= 0 && this.turn <= 0) {
      this.turn = 5 + this.rand() * 8;
      if (this.rand() < 0.4) this.dir = -this.dir;
    }
    this.x += this.dir * speed * f.dt;
    const wasFlying = this.flight > 0;
    this.flight = Math.max(0, this.flight - f.dt);
    for (const b of this.birds) {
      const bx = this.x + b.off;
      const s = swashAt(bx, f.time);
      // onde ele quer estar: a um palmo da espuma, do lado da areia
      const want = s.edge - b.gap;
      const step = Math.max(-RUN * f.dt, Math.min(RUN * f.dt, want - b.cp));
      b.cp += step;
      // do `c` de volta ao mundo: a costa cai um tile por tile para o sul, então três passos de Newton bastam
      for (let i = 0; i < 3; i += 1) {
        const c = coastAt(bx, b.y);
        if (c <= NO_COAST) break;
        b.y += c - b.cp;
      }
      const running = Math.abs(step) > 0.35 * RUN * f.dt;
      b.peck -= f.dt;
      if (!running && b.peck < -0.9 - b.gap * 3) b.peck = 0.3;
      let tex: string = FRAMES.run1;
      let z = 0;
      if (wasFlying) {
        tex = FRAMES.fly;
        z = 0.5 + 0.35 * Math.sin(Math.min(1, this.flight / 1.5) * Math.PI);
        b.face = this.dir;
      } else if (running) {
        tex = Math.floor(f.clock / 70) % 2 ? FRAMES.run1 : FRAMES.run2;
      } else if (b.peck > 0) {
        tex = FRAMES.peck;
      }
      if (!wasFlying && Math.abs(this.dir) > 0 && this.rand() < 0.004) b.face = -b.face;
      b.bb.setTexture(tex).setFlipX(b.face < 0).setPosition(bx, b.y).setElevation(z);
    }
  }

  private sandAt(f: BeachFrame, x: number): boolean {
    const y = this.birds[0]?.y ?? f.hero.y;
    return f.world.isSand(Math.round(x), Math.round(y)) && f.world.isFree(Math.round(x), Math.round(y));
  }

  /** O bando pousa na beira, a uns tiles do herói, do lado em que houver areia. */
  private spawn(f: BeachFrame): void {
    for (const side of this.rand() < 0.5 ? [1, -1] : [-1, 1]) {
      const x = f.hero.x + side * (5 + this.rand() * 3);
      // desce a coluna até a linha d'água
      let y = f.hero.y;
      let ok = false;
      for (let i = 0; i < 12; i += 1) {
        const c = coastAt(x, y);
        if (c <= NO_COAST) break;
        y += c + 0.6;
        if (Math.abs(c + 0.6) < 0.05) { ok = true; break; }
      }
      if (!ok || !f.world.isSand(Math.round(x), Math.round(y))) continue;
      this.x = x;
      this.dir = -side;
      this.turn = 4 + this.rand() * 6;
      for (let i = 0; i < FLOCK; i += 1) {
        const bb = world3d().objects.addBillboard(FRAMES.run1, 0, { groundShadow: { rx: 0.14, rz: 0.06, alpha: 0.24 } })
          .setDisplaySize(7 / 16, 5 / 16).setTint(PROP_TINT);
        this.birds.push({
          bb, off: (i - (FLOCK - 1) / 2) * 0.62 + (this.rand() - 0.5) * 0.3, gap: GAP[0] + this.rand() * (GAP[1] - GAP[0]), cp: -0.6, y,
          face: this.rand() < 0.5 ? -1 : 1, peck: -this.rand() * 2,
        });
      }
      return;
    }
  }

  private clear(): void {
    for (const b of this.birds) b.bb.destroy();
    this.birds = [];
    this.flight = 0;
  }

  public destroy(): void {
    this.clear();
  }
}
