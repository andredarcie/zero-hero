// A TERRA NO COGUMELO COLHIDO: onde ela gruda (as linhas da arte, o talo), a bucha esfregando pixel a pixel, os
// grãos que caem, e o brilho quando ela sai toda. O minijogo em si é a ForagingOverlay.

import { CLOSE_SIZE, type DirtKind } from '@/game/fungi/fungi';
import { seededRandom } from '@/game/runtime/uiStyle';
import type { ForagingOverlay } from './ForagingOverlay';

export const CS = CLOSE_SIZE;
/** A bucha: o tamanho que ela apaga (meia largura e meia altura, em pixels da arte). */
const SPONGE_RX = 3.4;
const SPONGE_RY = 2.4;
/** Quantos grãos de areia cada pixel de terra vira, e o tamanho de cada um (em pixels da arte). */
const GRAINS_PER_PIXEL = 3;
export const GRAIN = 1 / 3;
/** Sobrando isto (fração da terra inicial), o resto cai sozinho: a última migalha não vira caça. */
const CLEAN_LEFT = 0.03;
/** A paleta de cada tipo de sujeira — tirada dos tiles do jogo, com um tom a mais de sombra. */
const DIRT_COLORS: Readonly<Record<DirtKind, readonly [string, string, string]>> = {
  soil: ['#3b2a1e', '#5a4330', '#2a1d14'],
  needle: ['#6b5a32', '#8a7442', '#4f4224'],
  leaf: ['#a8642c', '#7d4a22', '#5e3618'],
  grass: ['#4d6b2e', '#6f8f3c', '#36501f'],
  sand: ['#c9b48a', '#a8956a', '#8a7a55'],
  moss: ['#4f6a2c', '#7f9a44', '#3a5020'],
};
export interface Box { x0: number; y0: number; x1: number; y1: number }

/** O que ForagingSoil usa de ForagingOverlay. */
export type ForagingSoilHost = Pick<ForagingOverlay,
  'cb' | 'clock' | 'cutY' | 'dirt' | 'dirtEdge' | 'enter' | 'grains' | 'kind' | 'mask' | 'pixels' | 'sparks'
  | 'spec' | 'sponge' | 'spongeVel' | 'stage'
>;

export class ForagingSoil {
  private dirtLeft = 0;
  private dirtStart = 0;
  private lastSand = -1;

  public constructor(private readonly host: ForagingSoilHost) {}

  public colorAt(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= CS || y >= CS) return null;
    const i = (y * CS + x) * 4;
    if (this.host.pixels[i + 3] === 0) return null;
    return `rgb(${this.host.pixels[i]},${this.host.pixels[i + 1]},${this.host.pixels[i + 2]})`;
  }

  /** A caixa do que está pintado entre as linhas `top` (inclusive) e `bottom` (exclusive). */
  public boxOfRows(top: number, bottom: number): Box {
    let x0 = CS;
    let y0 = CS;
    let x1 = 0;
    let y1 = 0;
    for (let y = Math.max(0, top); y < Math.min(CS, bottom); y += 1) {
      for (let x = 0; x < CS; x += 1) {
        if (this.host.pixels[(y * CS + x) * 4 + 3] === 0) continue;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x + 1);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y + 1);
      }
    }
    if (x1 <= x0) return { x0: 0, y0: 0, x1: CS, y1: CS };
    return { x0, y0, x1, y1 };
  }

  /** A largura do talo naquela linha da arte — por onde a faca passa e de onde saem as migalhas. */
  public stemSpan(row: number): { left: number; right: number } {
    const y = Math.max(0, Math.min(CS - 1, row));
    let left = -1;
    let right = -1;
    for (let x = 0; x < CS; x += 1) {
      if (this.host.pixels[(y * CS + x) * 4 + 3] === 0) continue;
      if (left < 0) left = x;
      right = x;
    }
    if (left < 0) return { left: CS / 2 - 2, right: CS / 2 + 2 };
    return { left, right: right + 1 };
  }

  /**
   * A TERRA: manchas irregulares por cima do que foi colhido, nunca fora do cogumelo. Gordas,
   * para serem vistas de longe — elas são o jogo.
   */
  public seedDirt(): void {
    const rand = seededRandom((Date.now() & 0xffff) ^ (this.host.kind.length * 7919));
    const spots: number[] = [];
    for (let y = 1; y < this.host.cutY - 1; y += 1) {
      for (let x = 1; x < CS - 1; x += 1) if (this.host.mask[y * CS + x]) spots.push(y * CS + x);
    }
    if (spots.length === 0) return;
    const patches = 5 + Math.floor(rand() * 3);
    for (let p = 0; p < patches; p += 1) {
      const seed = spots[Math.floor(rand() * spots.length)];
      const cx = seed % CS;
      const cy = Math.floor(seed / CS);
      const pal = DIRT_COLORS[this.host.spec.dirt[p % this.host.spec.dirt.length]];
      const r = 1.8 + rand() * 1.8;
      for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y += 1) {
        for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x += 1) {
          if (x < 0 || y < 0 || x >= CS || y >= this.host.cutY) continue;
          const i = y * CS + x;
          if (!this.host.mask[i]) continue;
          // A borda roída: a mancha é um borrão de terra, não um círculo.
          const d = Math.hypot(x - cx, (y - cy) * 1.15) + (rand() - 0.5) * 1.6;
          if (d > r) continue;
          const roll = rand();
          this.host.dirt[i] = roll < 0.5 ? pal[0] : roll < 0.8 ? pal[1] : pal[2];
        }
      }
    }
    this.dirtLeft = this.host.dirt.reduce((n, c) => n + (c ? 1 : 0), 0);
    this.dirtStart = this.dirtLeft;
    this.refreshEdge();
  }

  /** O contorno roxo de "pegue isto" em volta de cada mancha: um pixel por fora da terra. */
  private refreshEdge(): void {
    this.host.dirtEdge.fill(0);
    for (let y = 0; y < CS; y += 1) {
      for (let x = 0; x < CS; x += 1) {
        const i = y * CS + x;
        if (this.host.dirt[i]) continue;
        const near = (x > 0 && this.host.dirt[i - 1]) || (x < CS - 1 && this.host.dirt[i + 1])
          || (y > 0 && this.host.dirt[i - CS]) || (y < CS - 1 && this.host.dirt[i + CS]);
        if (near) this.host.dirtEdge[i] = 1;
      }
    }
  }

  public trackSponge(x: number, y: number): void {
    const dx = x - this.host.sponge.x;
    const dy = y - this.host.sponge.y;
    this.host.spongeVel = { x: this.host.spongeVel.x * 0.5 + dx * 0.5, y: this.host.spongeVel.y * 0.5 + dy * 0.5 };
  }

  /** A bucha anda até (x, y) apagando tudo pelo caminho — a borracha do Paint. */
  public scrubTo(x: number, y: number): void {
    const from = this.host.sponge;
    this.trackSponge(x, y);
    const steps = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) * 2));
    let erased = 0;
    for (let s = 1; s <= steps; s += 1) {
      const k = s / steps;
      erased += this.eraseAt(from.x + (x - from.x) * k, from.y + (y - from.y) * k, x - from.x);
    }
    this.host.sponge = { x, y };
    if (erased > 0) this.afterErase(erased);
  }

  private eraseAt(cx: number, cy: number, dirX: number): number {
    if (this.host.stage !== 'clean') return 0;
    let n = 0;
    for (let y = Math.floor(cy - SPONGE_RY); y <= Math.ceil(cy + SPONGE_RY); y += 1) {
      for (let x = Math.floor(cx - SPONGE_RX); x <= Math.ceil(cx + SPONGE_RX); x += 1) {
        if (x < 0 || y < 0 || x >= CS || y >= CS) continue;
        const dx = (x + 0.5 - cx) / SPONGE_RX;
        const dy = (y + 0.5 - cy) / SPONGE_RY;
        if (dx * dx + dy * dy > 1) continue;
        const i = y * CS + x;
        const c = this.host.dirt[i];
        if (!c) continue;
        this.host.dirt[i] = null;
        this.shed(x, y, c, dirX);
        n += 1;
      }
    }
    return n;
  }

  /** Um pixel de terra vira areia: grãozinhos que escorrem (alguns levantam um fio de pó) e caem. */
  private shed(x: number, y: number, c: string, dirX: number): void {
    if (this.host.grains.length > 900) this.host.grains.splice(0, this.host.grains.length - 900);
    for (let g = 0; g < GRAINS_PER_PIXEL; g += 1) {
      const puff = Math.random() < 0.18;
      this.host.grains.push({
        x: x + Math.floor(Math.random() * 3) * GRAIN,
        y: y + Math.floor(Math.random() * 3) * GRAIN,
        vx: (Math.random() - 0.5) * 5 + Math.sign(dirX) * Math.random() * 4,
        vy: puff ? -4 - Math.random() * 6 : Math.random() * 3,
        c, age: 0,
      });
    }
  }

  private afterErase(erased: number): void {
    this.dirtLeft = Math.max(0, this.dirtLeft - erased);
    this.refreshEdge();
    if (this.host.clock - this.lastSand > 0.07) {
      this.lastSand = this.host.clock;
      this.host.cb.onSand();
    }
    if (this.dirtLeft <= Math.max(2, Math.floor(this.dirtStart * CLEAN_LEFT))) {
      // A última migalha cai sozinha: limpar é gostoso, caçar o pixel que sobrou não é.
      for (let i = 0; i < this.host.dirt.length; i += 1) {
        const c = this.host.dirt[i];
        if (!c) continue;
        this.host.dirt[i] = null;
        this.shed(i % CS, Math.floor(i / CS), c, 0);
      }
      this.dirtLeft = 0;
      this.refreshEdge();
      this.startShine();
    }
  }

  private startShine(): void {
    const piece = this.boxOfRows(0, this.host.cutY);
    const colors = ['#ffffff', '#ffe066', '#fff6d0'];
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
      const rx = (piece.x1 - piece.x0) / 2 + 3 + Math.random() * 4;
      const ry = (piece.y1 - piece.y0) / 2 + 2 + Math.random() * 4;
      this.host.sparks.push({
        x: (piece.x0 + piece.x1) / 2 + Math.cos(a) * rx,
        y: (piece.y0 + piece.y1) / 2 + Math.sin(a) * ry,
        at: 0.05 + i * 0.06, c: colors[i % colors.length],
      });
    }
    this.host.cb.onClean();
    this.host.enter('shine');
  }
}
