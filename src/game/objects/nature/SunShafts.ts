import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { skyUniforms } from '@/game/render3d/atmosphere';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';

import { hash, smooth, texture, window01, type NatureFrame, type NatureSystem } from './kit';

/**
 * OS RAIOS DE SOL ENTRE AS COPAS (pedido do autor, 2026-11-18: "luz e movimento" na mata). De dia, onde o chão da mata
 * se abre — a clareira, a beira, o vão entre as árvores —, a luz desce em feixes inclinados para o lado de onde o sol
 * está (o mesmo lado que acende a borda das árvores, skyUniforms.uRimSide), com uma poeira fina flutuando dentro.
 *
 * As MANCHINHAS DE SOL que dançavam no chão (discos dourados piscando) saíram a pedido do autor (2026-11-09: "achei
 * que elas ficaram feias"). Isto é o contrário delas: luz de AR, macia, que não pisca nem dança. O feixe só respira
 * devagar (alguns segundos para um lado e para o outro), cresce e some com a hora, e a rajada que sacode as copas o
 * deixa um tico mais fraco enquanto passa.
 *
 * Onde: entre os tiles livres perto do herói, os que têm mata em volta (duas árvores ou mais entre os oito vizinhos),
 * sorteados pela coordenada (o mesmo vão tem sempre raio, ou nunca) — os mais perto do herói, até SHOWN.
 */

/** O feixe: macio (é ar), mais forte no miolo, sumindo para cima (a copa) e um pouco no pé. */
const BEAM_W = 16;
const BEAM_H = 64;
const BEAM = texture('sun-shaft', BEAM_W, BEAM_H, (put) => {
  for (let y = 0; y < BEAM_H; y += 1) {
    const v = y / (BEAM_H - 1); // 0 em cima, 1 no pé
    const along = smooth(0, 0.35, v) * (1 - 0.45 * smooth(0.86, 1, v));
    for (let x = 0; x < BEAM_W; x += 1) {
      const u = Math.abs((x + 0.5) / BEAM_W * 2 - 1);
      // miolo firme e borda curta: um feixe, não uma névoa
      const across = 1 - smooth(0.45, 0.95, u);
      // os veios: luz passando por buracos diferentes da copa, mais claros dentro do feixe
      const vein = 0.62 + 0.38 * Math.exp(-((u - 0.18) ** 2) * 90) + 0.3 * Math.exp(-((u - 0.62) ** 2) * 120);
      const a = Math.min(1, along * across * vein);
      if (a > 0.01) put(x, y, '#ffffff', a);
    }
  }
}, true);
/** A luz que o feixe deixa no chão: uma elipse macia, sem miolo branco. */
const POOL = texture('sun-shaft-pool', 32, 16, (put) => {
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      const r = Math.hypot((x + 0.5 - 16) / 16, (y + 0.5 - 8) / 8);
      if (r < 1) put(x, y, '#ffffff', (1 - r) ** 1.5);
    }
  }
}, true);

/** Quantos feixes ao mesmo tempo, no máximo, e até onde em volta do herói (tiles). */
const SHOWN = 6;
const REACH_X = 8;
const REACH_N = 6;
const REACH_S = 3;
/** Entre dois feixes, ao menos isto (tiles): espalhados pela mata, nunca um bolo de luz. */
const SPACING = 2.6;
/** O feixe: altura (tiles), a força no auge, e a cor (branco quente; dourado na hora dourada). */
const HEIGHT = 4.2;
const ALPHA = 0.3;
const POOL_ALPHA = 0.14;
const NOON = [1, 0.96, 0.84] as const;
const GOLD = [1, 0.8, 0.5] as const;
/** Entra e sai devagar (s). */
const FADE_S = 1.6;
/** A poeira de cada feixe. */
const MOTES = 3;

interface Mote { bb: Billboard3D; v: number; speed: number; phase: number }
interface Shaft { key: string; x: number; y: number; width: number; tilt: number; beam: Billboard3D; pool: Billboard3D; motes: Mote[]; on: number; want: boolean; phase: number }

export class SunShafts implements NatureSystem {
  private readonly shafts = new Map<string, Shaft>();
  private heroTile = '';
  private wanted: Array<{ x: number; y: number; key: string }> = [];
  /** A força de agora (0 de noite e na chuva; o playtest lê). */
  public level = 0;

  public get count(): number {
    return [...this.shafts.values()].filter((s) => s.on > 0.05).length;
  }

  public update(f: NatureFrame): void {
    // De dia, sem chuva; mais forte na manhã e na tarde (o sol baixo entra mais de lado na mata).
    const day = window01(f.phase, 0.26, 0.31, 0.71, 0.76);
    const low = 1 - Math.min(1, Math.abs(f.phase - 0.5) / 0.22);
    this.level = day * Math.max(0, 1 - f.rain * 3) * (f.season === 'winter' ? 0.7 : 1);
    const tile = `${Math.round(f.hero.x)},${Math.round(f.hero.y)}`;
    if (tile !== this.heroTile) {
      this.heroTile = tile;
      this.wanted = this.spots(f);
    }
    const want = new Set(this.wanted.map((s) => s.key));
    if (this.level > 0.01) {
      for (const s of this.wanted) if (!this.shafts.has(s.key)) this.shafts.set(s.key, this.make(s.x, s.y, s.key));
    }
    // O lado do sol: o feixe pende para lá, e mais quanto mais baixo ele está.
    const side = skyUniforms.uRimSide.value.x;
    const tiltSun = Math.sign(side || 1) * (13 + 17 * Math.min(1, Math.abs(side)));
    const gold = low * low;
    const color = (k: number): number => Math.round(255 * (NOON[k] + (GOLD[k] - NOON[k]) * gold));
    const tint = (color(0) << 16) | (color(1) << 8) | color(2);
    const nowS = f.clock / 1000;
    for (const [key, s] of this.shafts) {
      s.want = want.has(key) && this.level > 0.01;
      s.on = Math.max(0, Math.min(1, s.on + (s.want ? 1 : -1) * f.dt / FADE_S));
      if (s.on <= 0 && !s.want) { this.drop(s); this.shafts.delete(key); continue; }
      // Respira devagar, e a rajada que sacode as copas deixa a luz um pouco mais fraca enquanto passa.
      const breath = 0.82 + 0.18 * Math.sin(nowS * 0.7 + s.phase);
      const k = smooth(0, 1, s.on) * this.level * breath * (1 - 0.25 * f.gust);
      s.beam.setTint(tint).setAlpha(ALPHA * k).setAngle(tiltSun + s.tilt);
      s.pool.setTint(tint).setAlpha(POOL_ALPHA * k);
      const rad = ((tiltSun + s.tilt) * Math.PI) / 180;
      for (const m of s.motes) {
        // a poeira sobe e desce devagar dentro do feixe, e brilha quando passa pelo miolo dele
        m.v = (m.v + m.speed * f.dt + 1) % 1;
        const e = 0.25 + m.v * (HEIGHT * 0.7);
        const across = Math.sin(nowS * 0.9 + m.phase) * 0.22 * s.width;
        m.bb.setPosition(s.x + across + Math.sin(rad) * e, s.y + 0.05).setElevation(e * Math.cos(rad))
          .setAlpha(0.55 * k * Math.sin(Math.PI * m.v));
      }
    }
  }

  /**
   * Os vãos que ganham feixe: tiles livres com mata em volta (e mata atrás, ao norte: é por cima dela que a luz desce,
   * na vista da câmera), dentro do que a câmera vê. Os de mais mata em volta primeiro (com um sorteio pela coordenada
   * para desempatar), um a um, pulando o que cair perto demais de um já escolhido.
   */
  private spots(f: NatureFrame): Array<{ x: number; y: number; key: string }> {
    const trees = new Set(f.host.treesNear(f.hero.x, f.hero.y, REACH_X + 3).map((t) => `${t.x},${t.y}`));
    const hx = Math.round(f.hero.x);
    const hy = Math.round(f.hero.y);
    const all: Array<{ x: number; y: number; key: string; score: number }> = [];
    for (let y = hy - REACH_N; y <= hy + REACH_S; y += 1) {
      for (let x = hx - REACH_X; x <= hx + REACH_X; x += 1) {
        if (trees.has(`${x},${y}`) || (x === hx && y === hy) || !f.host.isFree(x, y)) continue;
        let around = 0;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if ((dx || dy) && trees.has(`${x + dx},${y + dy}`)) around += 1;
        const behind = [-1, 0, 1].filter((dx) => trees.has(`${x + dx},${y - 1}`)).length;
        if (around < 2 || behind === 0) continue;
        all.push({ x, y, key: `${x},${y}`, score: around + behind + hash(x, y, 811) * 2.5 });
      }
    }
    all.sort((a, b) => b.score - a.score);
    const picked: Array<{ x: number; y: number; key: string }> = [];
    for (const s of all) {
      if (picked.length >= SHOWN) break;
      if (picked.some((p) => Math.hypot(p.x - s.x, p.y - s.y) < SPACING)) continue;
      picked.push(s);
    }
    return picked;
  }

  /** Onde estão os feixes e o quanto cada um está aceso (o playtest lê). */
  public get list(): Array<{ x: number; y: number; on: number }> {
    return [...this.shafts.values()].map((s) => ({ x: s.x, y: s.y, on: s.on }));
  }

  private make(tx: number, ty: number, key: string): Shaft {
    const w3 = world3d();
    const x = tx + (hash(tx, ty, 821) - 0.5) * 0.4;
    const y = ty + (hash(tx, ty, 823) - 0.5) * 0.3;
    const width = 0.45 + hash(tx, ty, 827) * 0.35;
    const opts = { emissive: true, additive: true, fog: false, alphaTest: 0.003, depthWrite: false } as const;
    const beam = w3.objects.addBillboard(BEAM, 0, opts).setPosition(x, y).setDisplaySize(width, HEIGHT).setAlpha(0);
    const pool = w3.objects.addBillboard(POOL, 0, { ...opts, flat: true, flatY: 0.03, depthLayer: 'ground' })
      .setPosition(x, y).setDisplaySize(width * 1.9, width * 0.95).setAlpha(0);
    const motes: Mote[] = [];
    for (let i = 0; i < MOTES; i += 1) {
      const bb = w3.objects.addBillboard(FX_DOT_TEXTURE, 0, { ...opts, centered: true }).setTint(0xfff2c8).setDisplaySize(0.07, 0.07).setAlpha(0);
      motes.push({ bb, v: hash(tx + i, ty, 829), speed: 0.03 + hash(tx, ty + i, 831) * 0.05, phase: hash(tx - i, ty, 833) * 6.28 });
    }
    return { key, x, y, width, tilt: (hash(tx, ty, 837) - 0.5) * 6, beam, pool, motes, on: 0, want: true, phase: hash(tx, ty, 839) * 6.28 };
  }

  private drop(s: Shaft): void {
    s.beam.destroy();
    s.pool.destroy();
    for (const m of s.motes) m.bb.destroy();
  }

  public destroy(): void {
    for (const s of this.shafts.values()) this.drop(s);
    this.shafts.clear();
  }
}
