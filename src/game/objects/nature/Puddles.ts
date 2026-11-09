import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import { getSoundManager } from '@/game/audio/SoundManager';

import { PROP_TINT, TILESET as P, hash, smooth, texture, type NatureFrame, type NatureSystem } from './kit';

/**
 * AS POÇAS (sugestão 14). A chuva enche as baixadinhas do chão de terra:
 *   · nos mesmos lugares de sempre (é o chão que decide onde empoça), CRESCEM enquanto chove e SECAM devagar depois
 *     — de fora para dentro, ficando menores até sumir, em umas três horas do jogo;
 *   · ESPELHAM o céu: o azul do céu com um brilho na borda de cima e a lama escura em volta;
 *   · na chuva, os pingos fazem ANÉIS nelas;
 *   · o herói que pisa numa poça ESPIRRA água: gotinhas em arco, um anel, e o "chap" do passo molhado.
 */

/** Uma poça: o contorno irregular (3 formas), a lama na borda, o céu e o brilho; `ring` desenha um anel de pingo. */
const puddle = (shape: number, ring: number): string => texture(`puddle-${shape}-${ring}`, 22, 13, (put) => {
  const lobes = [[[11, 6.5, 9, 5]], [[8, 6, 7, 4.5], [14, 7, 7, 4.5]], [[10, 6, 8, 5], [15, 8, 5, 3.5]]][shape];
  const inside = (x: number, y: number, grow: number): boolean =>
    lobes.some(([cx, cy, rx, ry]) => Math.hypot((x + 0.5 - cx) / (rx + grow), (y + 0.5 - cy) / (ry + grow)) <= 1);
  for (let y = 0; y < 13; y += 1) {
    for (let x = 0; x < 22; x += 1) {
      if (inside(x, y, 0)) {
        // O céu espelhado: mais claro em cima (a borda de cima da poça reflete o céu aberto), um brilho, e o fundo.
        // A borda de cima reflete o céu aberto (mais claro); o resto, o céu mais fundo; uns pixels de brilho.
        const top = !inside(x, y - 1, 0);
        const glint = top && hash(x, y, 63) < 0.25;
        put(x, y, glint ? P.ice : top ? P.sky : hash(x, y, 61) < 0.12 ? P.sky : P.skyDk, glint ? 0.8 : 0.9);
      } else if (inside(x, y, 1.1)) {
        // A lama molhada em volta.
        put(x, y, hash(x, y, 62) < 0.5 ? P.slate : '#3d3b36', 0.85);
      }
    }
  }
  if (ring > 0) {
    // O anel de um pingo: uma elipse de 5×3 desenhada à mão (num círculo calculado os pixels fechavam um quadrado).
    const [cx, cy] = [[6, 6], [15, 5], [10, 8]][ring - 1];
    for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-2, 0], [2, 0], [-1, 1], [0, 1], [1, 1]] as const) {
      if (inside(cx + dx, cy + dy, 0)) put(cx + dx, cy + dy, P.ice, 0.7);
    }
  }
});
const SHAPES = [0, 1, 2].map((s) => [puddle(s, 0), puddle(s, 1), puddle(s, 2), puddle(s, 3)]);
const DROP = texture('puddle-drop', 1, 1, (put) => put(0, 0, P.ice, 0.95));
const RING = texture('puddle-ring', 10, 6, (put) => {
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    put(4.5 + Math.cos(a) * 4.4, 2.5 + Math.sin(a) * 2.4, P.ice, 0.9);
  }
});

interface Puddle { bb: Billboard3D; x: number; y: number; shape: number; size: number }
interface Drop { bb: Billboard3D; x: number; y: number; z: number; vx: number; vy: number; vz: number }
interface Ring { bb: Billboard3D; t: number }

const RX = 9;
const RY = 6;

export class Puddles implements NatureSystem {
  private readonly puddles = new Map<string, Puddle>();
  private readonly drops: Drop[] = [];
  private readonly rings: Ring[] = [];
  private lastHero = '';
  private lastSplashTile = '';
  private seed = 31;
  public wetness = 0;
  public splashes = 0;

  private rand(): number {
    this.seed += 1;
    return hash(this.seed, 23, 408);
  }

  public get list(): ReadonlyArray<{ x: number; y: number }> {
    return [...this.puddles.values()].filter((p) => p.bb.visible).map((p) => ({ x: p.x, y: p.y }));
  }

  public update(f: NatureFrame): void {
    // Enche com a chuva; seca em ~0,12 de mostrador (umas três horas do jogo) depois que ela para.
    if (f.season === 'winter') this.wetness = 0;
    else if (f.sinceRain === 0) this.wetness = Math.min(1, this.wetness + f.rain * f.dt * 0.08);
    else this.wetness = f.sinceRain < 0.13 ? Math.max(0, 1 - smooth(0, 0.13, f.sinceRain)) : 0;
    if (this.wetness < 0.02) { this.clear(); this.updateFx(f); return; }
    const heroKey = `${Math.round(f.hero.x)},${Math.round(f.hero.y)}`;
    if (heroKey !== this.lastHero) { this.lastHero = heroKey; this.stream(f); }
    const raining = f.rain > 0.15;
    for (const p of this.puddles.values()) {
      // Seca de fora para dentro: as poças menores somem primeiro.
      const s = Math.max(0, Math.min(1, this.wetness * 1.3 - (1 - p.size) * 0.6));
      const ring = raining ? 1 + (Math.floor(f.clock / 230 + p.x * 3 + p.y) % 3) : 0;
      p.bb.setTexture(SHAPES[p.shape][ring]).setDisplaySize((22 / 16) * s * p.size, (13 / 16) * s * p.size).setVisible(s > 0.08);
    }
    this.splashCheck(f);
    this.updateFx(f);
  }

  /** As poças dos tiles em volta do herói (sempre as mesmas: hash do tile). */
  private stream(f: NatureFrame): void {
    const cx = Math.round(f.hero.x);
    const cy = Math.round(f.hero.y);
    const keep = new Set<string>();
    for (let y = cy - RY; y <= cy + RY; y += 1) {
      for (let x = cx - RX; x <= cx + RX; x += 1) {
        if (hash(x, y, 111) > 0.065) continue;
        const key = `${x},${y}`;
        if (!f.host.isFree(x, y)) continue;
        keep.add(key);
        if (this.puddles.has(key)) continue;
        const shape = Math.floor(hash(x, y, 112) * 3);
        const bb = world3d().objects.addBillboard(SHAPES[shape][0], 0, { flat: true, flatY: 0.02, depthWrite: false, alphaTest: 0.01, depthLayer: 'ground' })
          .setTint(PROP_TINT).setPosition(x + (hash(x, y, 113) - 0.5) * 0.3, y + (hash(y, x, 114) - 0.5) * 0.3).setVisible(false);
        this.puddles.set(key, { bb, x, y, shape, size: 0.6 + hash(x, y, 115) * 0.4 });
      }
    }
    for (const [key, p] of this.puddles) {
      if (keep.has(key)) continue;
      p.bb.destroy();
      this.puddles.delete(key);
    }
  }

  /** O herói pisou numa poça: espirra. */
  private splashCheck(f: NatureFrame): void {
    if (!f.heroMoving) return;
    const key = `${Math.round(f.hero.x)},${Math.round(f.hero.y)}`;
    const p = this.puddles.get(key);
    if (!p || !p.bb.visible || key === this.lastSplashTile) { if (!p) this.lastSplashTile = ''; return; }
    if (Math.hypot(f.hero.x - p.bb.x, f.hero.y - p.bb.y) > 0.45) return;
    this.lastSplashTile = key;
    this.splashes += 1;
    getSoundManager().nature.playPuddleSplash();
    const w3 = world3d();
    this.rings.push({ bb: w3.objects.addBillboard(RING, 0, { flat: true, flatY: 0.025, depthWrite: false, alphaTest: 0.01, depthLayer: 'ground' }).setPosition(f.hero.x, f.hero.y + 0.1), t: 0 });
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2 + this.rand();
      this.drops.push({
        bb: w3.objects.addBillboard(DROP, 0, { centered: true, depthWrite: false, alphaTest: 0.01 }).setDisplaySize(1 / 16, 1 / 16),
        x: f.hero.x, y: f.hero.y + 0.1, z: 0.05, vx: Math.cos(a) * (0.6 + this.rand() * 0.5), vy: Math.sin(a) * 0.35, vz: 1 + this.rand() * 0.8,
      });
    }
  }

  private updateFx(f: NatureFrame): void {
    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const r = this.rings[i];
      r.t += f.dt / 0.6;
      r.bb.setDisplaySize(0.3 + r.t * 0.6, 0.18 + r.t * 0.36).setAlpha(0.8 * (1 - r.t));
      if (r.t >= 1) { r.bb.destroy(); this.rings.splice(i, 1); }
    }
    for (let i = this.drops.length - 1; i >= 0; i -= 1) {
      const d = this.drops[i];
      d.x += d.vx * f.dt; d.y += d.vy * f.dt; d.z += d.vz * f.dt; d.vz -= 6 * f.dt;
      d.bb.setPosition(d.x, d.y).setElevation(d.z);
      if (d.z < 0) { d.bb.destroy(); this.drops.splice(i, 1); }
    }
  }

  private clear(): void {
    for (const p of this.puddles.values()) p.bb.destroy();
    this.puddles.clear();
    this.lastHero = '';
  }

  public destroy(): void {
    this.clear();
    for (const d of this.drops) d.bb.destroy();
    for (const r of this.rings) r.bb.destroy();
    this.drops.length = 0;
    this.rings.length = 0;
  }
}
