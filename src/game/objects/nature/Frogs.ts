import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { WATER_DEPTH_TILES, world3d } from '@/game/render3d/World3D';
import { getSoundManager } from '@/game/audio/SoundManager';

import { PROP_TINT, TILESET as P, hash, sprite, texture, type NatureFrame, type NatureSystem } from './kit';

/**
 * OS SAPOS (sugestão 2). O som da noite já tinha um sapo; faltava vê-lo. Como sapo de beira de lago:
 *   · ficam SENTADOS na margem, virados para a água, com o papo inflando e desinflando;
 *   · de vez em quando dão um pulinho pela margem;
 *   · quando o herói chega perto, SALTAM NA ÁGUA num arco — "plop", um anel que abre, umas gotas — e somem;
 *   · um tempo depois, outro aparece em outro ponto da margem, longe do herói.
 * De dia e de noite (o sapo é mais da noite: de noite são mais); no inverno, nenhum (hibernam).
 */

const C = { g: P.frog, G: P.frogDk, o: P.oliveDk, l: P.lime, y: P.yellow, k: P.ink };
const SIT = sprite('frog-sit', [
  '...yk.yk.',
  '..ggggggg',
  '.gGgggggo',
  'gGgggGlll',
  'gggGgglll',
  'GG.GG.GG.',
], C);
const CROAK = sprite('frog-croak', [
  '...yk.yk.',
  '..ggggggg',
  '.gGgggggo',
  'gGgggGlll',
  'gggGgllll',
  'GG.GG.ll.',
], C);
const LEAP = sprite('frog-leap', [
  '......yk.',
  '....ggggg',
  'GGggggGgl',
  'G..ggGlll',
  '.........',
  '.........',
], C);
const RING = texture('frog-ring', 10, 10, (put) => {
  for (const [x, y] of [[3, 0], [4, 0], [5, 0], [6, 0], [1, 1], [8, 1], [0, 3], [9, 3], [0, 4], [9, 4], [0, 5], [9, 5], [0, 6], [9, 6], [1, 8], [8, 8], [3, 9], [4, 9], [5, 9], [6, 9], [2, 1], [7, 1], [2, 8], [7, 8], [1, 2], [8, 2], [1, 7], [8, 7]] as const) {
    put(x, y, P.ice, 0.85);
  }
});
const DROP = texture('frog-drop', 1, 1, (put) => put(0, 0, P.ice, 0.9));
const SURFACE = -WATER_DEPTH_TILES + 0.03;

type Mode = 'sit' | 'hop' | 'leap' | 'gone';
interface Frog {
  bb: Billboard3D;
  mode: Mode;
  x: number; y: number; z: number;
  /** Para onde fica a água (o sapo olha para lá e salta para lá). */
  wx: number; wy: number;
  fromX: number; fromY: number; toX: number; toY: number;
  t: number;
  timer: number;
  croak: number;
}
interface Ring { bb: Billboard3D; t: number }
interface Drop { bb: Billboard3D; x: number; y: number; z: number; vx: number; vy: number; vz: number }

const MAX_FROGS = 3;
const SCARE = 2.3;

export class Frogs implements NatureSystem {
  private readonly frogs: Frog[] = [];
  private readonly rings: Ring[] = [];
  private readonly drops: Drop[] = [];
  private spawnIn = 1.5;
  private seed = 7;
  /** Quantos saltos na água (a janela do playtest). */
  public dives = 0;

  private rand(): number {
    this.seed += 1;
    return hash(this.seed, 3, 402);
  }

  public get list(): ReadonlyArray<{ mode: Mode; x: number; y: number }> {
    return this.frogs.map((f) => ({ mode: f.mode, x: f.x, y: f.y }));
  }

  /** Um ponto da margem: chão livre com água ao lado, entre `min` e `max` tiles do herói. */
  private bankSpot(f: NatureFrame, min: number, max: number): { x: number; y: number; wx: number; wy: number } | null {
    for (let i = 0; i < 40; i += 1) {
      const x = Math.round(f.hero.x + (this.rand() - 0.5) * max * 2);
      const y = Math.round(f.hero.y + (this.rand() - 0.5) * max * 1.4);
      const d = Math.hypot(x - f.hero.x, y - f.hero.y);
      if (d < min || d > max || !f.host.isFree(x, y)) continue;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => f.host.isWater(x + dx, y + dy));
      if (dirs.length === 0) continue;
      if (this.frogs.some((q) => Math.hypot(q.x - x, q.y - y) < 1.2)) continue;
      const [dx, dy] = dirs[Math.floor(this.rand() * dirs.length)];
      return { x, y, wx: dx, wy: dy };
    }
    return null;
  }

  public update(f: NatureFrame): void {
    const active = f.season !== 'winter' && !f.host.busy();
    const night = f.phase < 0.25 || f.phase > 0.75;
    const want = active ? (night ? MAX_FROGS : 2) : 0;
    this.spawnIn -= f.dt;
    if (this.frogs.filter((q) => q.mode !== 'gone').length < want && this.spawnIn <= 0) {
      this.spawnIn = 6 + this.rand() * 8;
      const spot = this.bankSpot(f, 3.5, 7);
      if (spot) {
        const bb = world3d().objects.addBillboard(SIT, 0, { groundShadow: { rx: 0.2, rz: 0.08, alpha: 0.3 } }).setDisplaySize(9 / 16, 6 / 16).setTint(PROP_TINT);
        // Na beira do tile, do lado da água, virado para ela.
        const x = spot.x + spot.wx * 0.32;
        const y = spot.y + spot.wy * 0.3;
        this.frogs.push({ bb, mode: 'sit', x, y, z: 0, wx: spot.wx, wy: spot.wy, fromX: x, fromY: y, toX: x, toY: y, t: 0, timer: 2 + this.rand() * 4, croak: this.rand() * 3 });
      }
    }
    for (let i = this.frogs.length - 1; i >= 0; i -= 1) {
      const q = this.frogs[i];
      this.step(q, f);
      if (q.mode === 'gone' || Math.hypot(q.x - f.hero.x, q.y - f.hero.y) > 11 || !active) {
        q.bb.destroy();
        this.frogs.splice(i, 1);
      }
    }
    this.updateSplash(f);
  }

  private step(q: Frog, f: NatureFrame): void {
    q.timer -= f.dt;
    q.croak += f.dt;
    const faceRight = q.wx > 0 || (q.wx === 0 && hash(q.x, q.y, 9) > 0.5);
    if (q.mode === 'sit') {
      // O herói chegou perto: salta na água.
      if (Math.hypot(f.hero.x - q.x, f.hero.y - q.y) < SCARE && !f.host.busy()) {
        q.mode = 'leap';
        q.t = 0;
        q.fromX = q.x; q.fromY = q.y;
        q.toX = q.x + q.wx * 0.9 + (q.wy !== 0 ? (this.rand() - 0.5) * 0.3 : 0);
        q.toY = q.y + q.wy * 0.9;
      } else if (q.timer <= 0) {
        // Um pulinho pela margem, se o lado for chão livre com água ao lado.
        q.timer = 3 + this.rand() * 5;
        const side = this.rand() < 0.5 ? -1 : 1;
        const nx = q.x + (q.wy !== 0 ? side * 0.45 : 0);
        const ny = q.y + (q.wx !== 0 ? side * 0.45 : 0);
        if (f.host.isFree(Math.round(nx - q.wx * 0.32), Math.round(ny - q.wy * 0.3))) {
          q.mode = 'hop'; q.t = 0; q.fromX = q.x; q.fromY = q.y; q.toX = nx; q.toY = ny;
        }
      }
      // O papo: infla por meio segundo a cada ~2,5 s.
      q.bb.setTexture(q.croak % 2.6 < 0.5 ? CROAK : SIT);
    } else if (q.mode === 'hop') {
      q.t += f.dt / 0.28;
      const k = Math.min(1, q.t);
      q.x = q.fromX + (q.toX - q.fromX) * k;
      q.y = q.fromY + (q.toY - q.fromY) * k;
      q.z = Math.sin(k * Math.PI) * 0.18;
      q.bb.setTexture(LEAP);
      if (k >= 1) { q.mode = 'sit'; q.z = 0; }
    } else if (q.mode === 'leap') {
      q.t += f.dt / 0.42;
      const k = Math.min(1, q.t);
      q.x = q.fromX + (q.toX - q.fromX) * k;
      q.y = q.fromY + (q.toY - q.fromY) * k;
      // Sobe e cai na água: o fim do arco fica abaixo do chão, na superfície afundada do lago.
      q.z = Math.sin(k * Math.PI) * 0.45 + SURFACE * k;
      q.bb.setTexture(LEAP);
      if (k >= 1) {
        q.mode = 'gone';
        this.dives += 1;
        this.splash(q.x, q.y);
        getSoundManager().nature.playFrogPlop();
      }
    }
    q.bb.setFlipX(!faceRight).setPosition(q.x, q.y).setElevation(q.z);
  }

  /** O "plop": um anel que abre na água e 5 gotinhas. */
  private splash(x: number, y: number): void {
    const w3 = world3d();
    this.rings.push({ bb: w3.objects.addBillboard(RING, 0, { flat: true, flatY: SURFACE, depthWrite: false, alphaTest: 0.01 }).setPosition(x, y), t: 0 });
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 + this.rand();
      this.drops.push({
        bb: w3.objects.addBillboard(DROP, 0, { centered: true, depthWrite: false, alphaTest: 0.01 }).setDisplaySize(1 / 16, 1 / 16),
        x, y, z: SURFACE + 0.02, vx: Math.cos(a) * 0.5, vy: Math.sin(a) * 0.3, vz: 1.1 + this.rand() * 0.6,
      });
    }
  }

  private updateSplash(f: NatureFrame): void {
    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const r = this.rings[i];
      r.t += f.dt / 0.9;
      const s = 0.2 + r.t * 0.7;
      r.bb.setDisplaySize(s, s).setAlpha(0.8 * (1 - r.t));
      if (r.t >= 1) { r.bb.destroy(); this.rings.splice(i, 1); }
    }
    for (let i = this.drops.length - 1; i >= 0; i -= 1) {
      const d = this.drops[i];
      d.x += d.vx * f.dt; d.y += d.vy * f.dt; d.z += d.vz * f.dt; d.vz -= 6 * f.dt;
      d.bb.setPosition(d.x, d.y).setElevation(d.z);
      if (d.z < SURFACE) { d.bb.destroy(); this.drops.splice(i, 1); }
    }
  }

  public destroy(): void {
    for (const q of this.frogs) q.bb.destroy();
    for (const r of this.rings) r.bb.destroy();
    for (const d of this.drops) d.bb.destroy();
    this.frogs.length = 0;
    this.rings.length = 0;
    this.drops.length = 0;
  }
}
