import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';

import { hash, PROP_TINT, sprite, TILESET as P } from '@/game/objects/nature/kit';

import { coastAt, type BeachFrame, type BeachSystem } from './kit';

/**
 * OS CARANGUEJOS (pedido do autor, 2026-11-19: "vida animal"). Moram na areia perto do mar, e são caranguejos de
 * verdade:
 *   · andam DE LADO, em corridinhas curtas, e param;
 *   · de vez em quando erguem as duas pinças (o aceno de quem marca território);
 *   · quando o herói chega a dois tiles, DISPARAM de lado para longe dele e SE ENTERRAM na areia — os olhos são a
 *     última coisa a sumir. Só voltam a sair com ele longe.
 * Uns poucos em volta do herói, nunca um bando: com chuva forte, todos embaixo da areia.
 */

const C = { O: P.orange, R: P.red, D: P.redDk, k: P.ink };
const FRAMES = {
  stand: sprite('crab-stand', [
    '..k...k..',
    '..O...O..',
    'R.RRRRR.R',
    '.RORRROR.',
    '.RDRRRDR.',
    '.D.D.D.D.',
  ], C),
  step: sprite('crab-step', [
    '..k...k..',
    '..O...O..',
    'R.RRRRR.R',
    '.RORRROR.',
    'DRDRRRDRD',
    '..D...D..',
  ], C),
  claws: sprite('crab-claws', [
    'R.k...k.R',
    'R.O...O.R',
    '.RRRRRRR.',
    '.RORRROR.',
    '.RDRRRDR.',
    '.D.D.D.D.',
  ], C),
  // enterrando: só o alto da carapaça e os olhos fora da areia
  dig: sprite('crab-dig', [
    '.........',
    '.........',
    '..k...k..',
    '..O...O..',
    '.RRRRRRR.',
    '.DRDRDRD.',
  ], C),
  eyes: sprite('crab-eyes', [
    '.........',
    '.........',
    '.........',
    '.........',
    '..k...k..',
    '..O...O..',
  ], C),
} as const;

type Mode = 'idle' | 'walk' | 'wave' | 'flee' | 'dig' | 'hidden' | 'rise';
interface Crab { bb: Billboard3D; x: number; y: number; mode: Mode; t: number; dir: number; left: number }

/** Quantos em volta do herói, e a que distância nascem (tiles). */
const MAX = 5;
const SPAWN: readonly [number, number] = [4.5, 9];
/** A faixa da praia em que vivem: da areia úmida à seca perto do mar (em distância da costa, negativa). */
const BAND: readonly [number, number] = [-4.4, -0.9];
/** O herói a esta distância os espanta; com ele a esta, o enterrado não sai. */
const FLEE = 1.9;
const STAY_HIDDEN = 3.2;
const WALK_SPEED = 1.5;
const FLEE_SPEED = 3.6;
const FAR = 14;

export class Crabs implements BeachSystem {
  private readonly crabs: Crab[] = [];
  private seed = 31;
  private nextSpawn = 0;
  /** Quantos já se enterraram de susto (o playtest lê). */
  public scares = 0;

  private rand(): number {
    this.seed += 1;
    return hash(this.seed, 23, 601);
  }

  public get list(): ReadonlyArray<{ x: number; y: number; mode: Mode }> {
    return this.crabs.map((c) => ({ x: c.x, y: c.y, mode: c.mode }));
  }

  public update(f: BeachFrame): void {
    const onBeach = f.coast > -12 && f.coast < 2;
    this.nextSpawn -= f.dt;
    if (onBeach && f.rain < 0.5 && this.crabs.length < MAX && this.nextSpawn <= 0 && !f.world.busy()) {
      this.spawn(f);
      this.nextSpawn = 0.6 + this.rand() * 1.4;
    }
    for (let i = this.crabs.length - 1; i >= 0; i -= 1) {
      const c = this.crabs[i];
      const heroD = Math.hypot(f.hero.x - c.x, f.hero.y - c.y);
      if (heroD > FAR) { c.bb.destroy(); this.crabs.splice(i, 1); continue; }
      c.t -= f.dt;
      const scared = heroD < FLEE && !f.world.busy();
      switch (c.mode) {
        case 'idle':
          c.bb.setTexture(FRAMES.stand);
          if (scared) { this.flee(c, f); break; }
          if (f.rain > 0.6) { c.mode = 'dig'; c.t = 0.3; break; }
          if (c.t <= 0) {
            if (this.rand() < 0.22) { c.mode = 'wave'; c.t = 0.5 + this.rand() * 0.4; break; }
            c.mode = 'walk';
            c.dir = this.rand() < 0.5 ? -1 : 1;
            c.left = 0.5 + this.rand() * 1.6;
          }
          break;
        case 'wave':
          c.bb.setTexture(Math.floor(f.clock / 160) % 2 ? FRAMES.claws : FRAMES.stand);
          if (scared) this.flee(c, f);
          else if (c.t <= 0) { c.mode = 'idle'; c.t = 0.6 + this.rand() * 1.8; }
          break;
        case 'walk':
        case 'flee': {
          const speed = c.mode === 'flee' ? FLEE_SPEED : WALK_SPEED;
          if (c.mode === 'walk' && scared) { this.flee(c, f); break; }
          const nx = c.x + c.dir * speed * f.dt;
          // de lado, sempre: o caranguejo não vira, e para onde a areia acaba ou há algo no caminho
          const open = f.world.isSand(Math.round(nx + c.dir * 0.4), Math.round(c.y)) && f.world.isFree(Math.round(nx + c.dir * 0.4), Math.round(c.y));
          if (open) { c.x = nx; c.left -= speed * f.dt; } else c.left = 0;
          c.bb.setTexture(Math.floor(f.clock / (c.mode === 'flee' ? 60 : 110)) % 2 ? FRAMES.step : FRAMES.stand);
          if (c.left <= 0) {
            if (c.mode === 'flee') { c.mode = 'dig'; c.t = 0.32; } else { c.mode = 'idle'; c.t = 0.8 + this.rand() * 2.4; }
          }
          break;
        }
        case 'dig':
          c.bb.setTexture(c.t > 0.16 ? FRAMES.dig : FRAMES.eyes);
          if (c.t <= 0) { c.mode = 'hidden'; c.t = 4 + this.rand() * 5; c.bb.setVisible(false); }
          break;
        case 'hidden':
          if (c.t <= 0 && heroD > STAY_HIDDEN && f.rain < 0.5) { c.mode = 'rise'; c.t = 0.4; c.bb.setVisible(true); }
          break;
        case 'rise':
          c.bb.setTexture(c.t > 0.2 ? FRAMES.eyes : FRAMES.dig);
          if (scared) { c.mode = 'dig'; c.t = 0.2; } else if (c.t <= 0) { c.mode = 'idle'; c.t = 0.5 + this.rand() * 1.5; }
          break;
        default:
          break;
      }
      c.bb.setPosition(c.x, c.y);
    }
  }

  private flee(c: Crab, f: BeachFrame): void {
    c.mode = 'flee';
    c.dir = Math.abs(c.x - f.hero.x) > 0.15 ? Math.sign(c.x - f.hero.x) : (this.rand() < 0.5 ? -1 : 1);
    c.left = 1.4 + this.rand() * 1.2;
    this.scares += 1;
  }

  /** Nasce na areia perto do mar, à vista e longe o bastante para ser visto antes de fugir. */
  private spawn(f: BeachFrame): void {
    for (let i = 0; i < 24; i += 1) {
      const x = Math.round(f.hero.x + (this.rand() - 0.5) * 2 * SPAWN[1]);
      const y = Math.round(f.hero.y + (this.rand() - 0.6) * 9);
      const d = Math.hypot(x - f.hero.x, y - f.hero.y);
      const c = coastAt(x, y);
      if (d < SPAWN[0] || d > SPAWN[1] || c < BAND[0] || c > BAND[1]) continue;
      if (!f.world.isSand(x, y) || !f.world.isFree(x, y)) continue;
      if (this.crabs.some((o) => Math.hypot(o.x - x, o.y - y) < 1.6)) continue;
      const bb = world3d().objects.addBillboard(FRAMES.stand, 0, { groundShadow: { rx: 0.22, rz: 0.08, alpha: 0.28 } })
        .setDisplaySize(9 / 16, 6 / 16).setTint(PROP_TINT).setPosition(x, y);
      this.crabs.push({ bb, x, y, mode: 'rise', t: 0.4, dir: 1, left: 0 });
      return;
    }
  }

  /** Playtest: põe um caranguejo neste tile, já de pé. */
  public summon(x: number, y: number): void {
    const bb = world3d().objects.addBillboard(FRAMES.stand, 0, { groundShadow: { rx: 0.22, rz: 0.08, alpha: 0.28 } })
      .setDisplaySize(9 / 16, 6 / 16).setTint(PROP_TINT).setPosition(x, y);
    this.crabs.push({ bb, x, y, mode: 'idle', t: 2, dir: 1, left: 0 });
  }

  public destroy(): void {
    for (const c of this.crabs) c.bb.destroy();
    this.crabs.length = 0;
  }
}
