import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';

import { PROP_TINT, TILESET as P, hash, smooth, sprite, type NatureFrame, type NatureSystem } from './kit';

/**
 * OS COGUMELOS DEPOIS DA CHUVA (sugestão 7). Como na mata de verdade: depois de um dia de chuva, no pé das árvores,
 * na sombra úmida, brotam tufinhos de cogumelo — crescem nas primeiras horas, ficam um dia e meio e murcham.
 *   · três tipos, no traço dos cogumelos do tileset: o pardo (chapéu marrom de borda clara), o branco alto e
 *     o vermelho de pintas brancas;
 *   · cada árvore dá (ou não) um tufo de 2 a 4, sempre os mesmos para a mesma chuva, e outros na chuva seguinte;
 *   · só enfeite: não se colhem (os fungos da quest são outros, nos lugares deles).
 */

const C = { c: P.fur, C: P.furDk, s: P.sand, w: P.bone, W: P.boneDk, r: P.red, R: P.redDk, h: P.redHi, k: P.barkDeep };
const KINDS = [
  sprite('rainshroom-brown', [
    '.sccs.',
    'scCCcs',
    '.CCCC.',
    '..wW..',
    '..wW..',
    '..WW..',
  ], C),
  sprite('rainshroom-white', [
    '..ww..',
    '.wwwW.',
    '.wwWW.',
    '.WWWW.',
    '..wW..',
    '..WW..',
  ], C),
  sprite('rainshroom-red', [
    '.rhwr.',
    'rwrrwR',
    '.RRRR.',
    '..wW..',
    '..wW..',
    '..WW..',
  ], C),
] as const;

interface Shroom { bb: Billboard3D; x: number; y: number; kind: number; delay: number }

export class RainMushrooms implements NatureSystem {
  private readonly shrooms = new Map<string, Shroom>();
  private lastHero = '';
  private lastRain = -1;

  /** Onde estão os cogumelos (a janela do playtest). */
  public get spots(): Array<{ x: number; y: number }> {
    return [...this.shrooms.values()].filter((s) => s.bb.visible).map((s) => ({ x: s.x, y: s.y }));
  }

  public get count(): number {
    let n = 0;
    for (const s of this.shrooms.values()) if (s.bb.visible) n += 1;
    return n;
  }

  public update(f: NatureFrame): void {
    // A idade da leva de cogumelos: nasce logo depois da chuva e dura um dia e meio.
    const age = f.sinceRain;
    const alive = f.season !== 'winter' && age > 0.02 && age < 1.6;
    if (!alive) { this.clear(); return; }
    const rainDay = Math.floor(f.day + f.phase - age);
    const heroKey = `${Math.round(f.hero.x)},${Math.round(f.hero.y)}`;
    if (heroKey !== this.lastHero || rainDay !== this.lastRain) {
      if (rainDay !== this.lastRain) this.clear();
      this.lastHero = heroKey;
      this.lastRain = rainDay;
      this.place(f, rainDay);
    }
    // Crescem nas primeiras ~5 horas, ficam, e murcham no último terço.
    const grow = smooth(0.02, 0.22, age) * (1 - smooth(1.25, 1.6, age));
    for (const s of this.shrooms.values()) {
      const g = Math.max(0, Math.min(1, grow * 1.15 - s.delay));
      s.bb.setDisplaySize((6 / 16) * (0.5 + 0.5 * g), (6 / 16) * g).setVisible(g > 0.05);
    }
  }

  /** Os tufos das árvores perto do herói (os que já existem ficam; os longe saem). */
  private place(f: NatureFrame, rainDay: number): void {
    const keep = new Set<string>();
    for (const t of f.host.treesNear(f.hero.x, f.hero.y, 10)) {
      if (hash(t.x, t.y, rainDay * 7 + 1) > 0.6) continue;
      const n = 2 + Math.floor(hash(t.x, t.y, rainDay + 3) * 3);
      const kind = Math.floor(hash(t.x, t.y, rainDay + 5) * KINDS.length);
      for (let i = 0; i < n; i += 1) {
        // No pé da árvore, do lado da frente (o que a câmera vê), num tile livre.
        const ang = Math.PI * (0.15 + hash(i, t.x, rainDay) * 0.7);
        const r = (t.big ? 0.75 : 0.45) + hash(t.y, i, rainDay) * 0.35;
        const x = t.x + Math.cos(ang) * r * (hash(i, t.y, 9) < 0.5 ? -1 : 1);
        const y = t.y + Math.sin(ang) * r * 0.7;
        if (!f.host.isFree(Math.round(x), Math.round(y))) continue;
        const key = `${t.x},${t.y},${i}`;
        keep.add(key);
        if (this.shrooms.has(key)) continue;
        const bb = world3d().objects.addBillboard(KINDS[kind], 0, { depthLayer: 'ground' }).setTint(PROP_TINT).setPosition(x, y).setVisible(false);
        this.shrooms.set(key, { bb, x, y, kind, delay: hash(i, t.x + t.y, 4) * 0.25 });
      }
    }
    for (const [key, s] of this.shrooms) {
      if (keep.has(key)) continue;
      s.bb.destroy();
      this.shrooms.delete(key);
    }
  }

  private clear(): void {
    for (const s of this.shrooms.values()) s.bb.destroy();
    this.shrooms.clear();
    this.lastHero = '';
  }

  public destroy(): void {
    this.clear();
  }
}
