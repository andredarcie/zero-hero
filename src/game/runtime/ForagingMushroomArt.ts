// O COGUMELO DESENHADO NA COLHEITA: inteiro no chão, a parte cortada subindo, o toco que fica, e o anel do talo. A
// terra por cima dele é da ForagingSoil.

import { CS } from './ForagingSoil';
import type { ForagingOverlay } from './ForagingOverlay';

/** O roxo do contorno de "dá para pegar" dos itens no chão (ItemPickup.OUTLINE_COLOR). */
const PICK_OUTLINE = '#9d7bff';
export const STASH_TIME = 0.5;
export const GRAVITY = 70;
export const clamp01 = (k: number): number => Math.max(0, Math.min(1, k));
export const easeOut = (k: number): number => 1 - (1 - k) * (1 - k);
export const easeOutBack = (k: number): number => {
  const c1 = 1.9;
  return 1 + (c1 + 1) * (k - 1) ** 3 + c1 * (k - 1) ** 2;
};

/** O que ForagingMushroomArt usa de ForagingOverlay. */
export type ForagingMushroomArtHost = Pick<ForagingOverlay,
  'art' | 'artBox' | 'clock' | 'ctx' | 'cutY' | 'dirt' | 'dirtEdge' | 'ring' | 'screen' | 'soil' | 'stage'
  | 'stageClock' | 'wobble'
>;

export class ForagingMushroomArt {
  public constructor(private readonly host: ForagingMushroomArtHost) {}

  /**
   * O COGUMELO INTEIRO, antes do corte: na entrada ele BROTA (cresce do pé com um elástico que
   * passa do ponto e volta), parado ele RESPIRA, e um erro o faz tremer. Sempre pelo pé: ele está
   * plantado, nada nele sai do lugar.
   */
  public drawWhole(): void {
    const ctx = this.host.ctx;
    const pivotX = (this.host.artBox.x0 + this.host.artBox.x1) / 2;
    const pivotY = this.host.artBox.y1;
    let sx = 1;
    let sy = 1;
    let alpha = 1;
    if (this.host.stage === 'intro') {
      const k = clamp01(this.host.stageClock / 0.5);
      const grow = easeOutBack(k);
      const squash = 0.16 * Math.sin(k * Math.PI);
      sx = grow * (1 - squash);
      sy = grow * (1 + squash);
      alpha = clamp01(k * 4);
    } else if (this.host.stage === 'closing') {
      const k = clamp01(this.host.stageClock / 0.25);
      sx = sy = 1 - easeOut(k);
      alpha = 1 - k;
    } else {
      const b = Math.sin(this.host.clock * 2.4);
      sx = 1 - 0.01 * b;
      sy = 1 + 0.02 * b;
    }
    if (this.host.wobble > 0) {
      const w = Math.sin(this.host.clock * 42) * 0.07 * this.host.wobble;
      sx += w;
      sy -= w;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pivotX, pivotY);
    ctx.scale(Math.max(0.001, sx), Math.max(0.001, sy));
    ctx.translate(-pivotX, -pivotY);
    ctx.drawImage(this.host.art, 0, 0);
    ctx.restore();
  }

  /**
   * O PEDAÇO COLHIDO com o "juice" de cada momento: o pulinho do corte (estica subindo, amassa
   * ao cair), a terra assentando, o boing de limpo, e a queda girando para as costas do herói.
   */
  public drawPiece(): void {
    const ctx = this.host.ctx;
    const piece = this.host.soil.boxOfRows(0, this.host.cutY);
    const pivotX = (piece.x0 + piece.x1) / 2;
    const pivotY = this.host.cutY;
    let dx = 0;
    let dy = 0;
    let sx = 1;
    let sy = 1;
    let rot = 0;
    let alpha = 1;
    let dirtAlpha = 1;
    const tc = this.host.stageClock;
    if (this.host.stage === 'pop') {
      const UP = 0.46;
      if (tc < UP) {
        const k = tc / UP;
        dy = -10 * 4 * k * (1 - k);                      // parábola: sobe e volta
        const stretch = 0.16 * (1 - k);
        sx = 1 - stretch * 0.7;
        sy = 1 + stretch;
        rot = Math.sin(k * Math.PI) * 0.06;              // um tico de giro no ar
      } else {
        // Assenta com uma mola amortecida: amassa, estica de leve, para.
        const k = tc - UP;
        const spring = Math.exp(-k * 9) * Math.cos(k * 26);
        sx = 1 + 0.17 * spring;
        sy = 1 - 0.17 * spring;
      }
      // A terra "assenta" junto com o pouso, não antes.
      dirtAlpha = clamp01((tc - UP + 0.05) / 0.2);
    } else if (this.host.stage === 'shine') {
      const w = 0.14 * Math.sin(tc * 19) * Math.exp(-tc * 4.5);
      sx = 1 - w;
      sy = 1 + w;
      dy = -Math.max(0, Math.sin(clamp01(tc / 0.32) * Math.PI)) * 4;
    } else if (this.host.stage === 'stash') {
      // Um saltinho e cai girando, encolhendo, para as costas do herói (lá embaixo).
      const k = clamp01(tc / STASH_TIME);
      const hop = Math.sin(clamp01(k / 0.35) * Math.PI) * (k < 0.35 ? 1 : 0);
      const fall = clamp01((k - 0.25) / 0.75);
      const e = fall * fall;
      dy = -hop * 4 + e * 34;
      dx = e * 5;
      rot = e * 1.4;
      sx = sy = 1 - 0.85 * e;
      alpha = 1 - e * e;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pivotX + dx, pivotY + dy);
    ctx.rotate(rot);
    ctx.scale(sx, sy);
    ctx.translate(-pivotX, -pivotY);
    ctx.drawImage(this.host.art, 0, 0, CS, this.host.cutY, 0, 0, CS, this.host.cutY);
    if ((this.host.stage === 'clean' || this.host.stage === 'pop') && dirtAlpha > 0) {
      ctx.globalAlpha = alpha * dirtAlpha;
      for (let i = 0; i < this.host.dirt.length; i += 1) {
        const x = i % CS;
        const y = Math.floor(i / CS);
        const c = this.host.dirt[i];
        if (c) this.host.screen.px(x, y, 1, 1, c);
        else if (this.host.dirtEdge[i]) this.host.screen.px(x, y, 1, 1, PICK_OUTLINE);
      }
    }
    if (this.host.stage === 'shine') {
      // O brilho de limpo: um clarão branco por cima da arte, que se apaga.
      const flash = Math.max(0, 0.6 - tc * 1.5);
      if (flash > 0) {
        ctx.globalAlpha = flash;
        ctx.globalCompositeOperation = 'source-atop';
        this.host.screen.px(0, 0, CS, this.host.cutY, '#ffffff');
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();
  }

  /** O toco que ficou abaixo do corte: cai girando de leve e some (o chão não está na tela). */
  public drawStub(): void {
    const ctx = this.host.ctx;
    const k = this.host.stageClock;
    if (this.host.cutY >= CS) return;
    const drop = 0.5 * GRAVITY * k * k;
    const pivotX = (this.host.artBox.x0 + this.host.artBox.x1) / 2;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - k * 2);
    ctx.translate(pivotX, this.host.cutY + drop);
    ctx.rotate(-k * 0.5);
    ctx.translate(-pivotX, -this.host.cutY);
    ctx.drawImage(this.host.art, 0, this.host.cutY, CS, CS - this.host.cutY, 0, this.host.cutY, CS, CS - this.host.cutY);
    ctx.restore();
  }

  /** O anel do POP: um aro claro que se abre a partir do corte, e o risco branco do fio. */
  public drawRing(): void {
    if (this.host.ring < 0) return;
    const ctx = this.host.ctx;
    const span = this.host.soil.stemSpan(this.host.cutY - 1);
    const cx = (span.left + span.right) / 2;
    const k = this.host.ring / 0.45;
    const r = 2 + easeOut(k) * 13;
    ctx.globalAlpha = Math.max(0, 1 - k);
    const dots = 24;
    for (let a = 0; a < dots; a += 1) {
      const ang = (a / dots) * Math.PI * 2;
      this.host.screen.px(Math.round(cx + Math.cos(ang) * r), Math.round(this.host.cutY + Math.sin(ang) * r * 0.55), 1, 1, '#fff6d8');
    }
    // O risco do fio da faca atravessando, que se estica para os lados e some.
    if (k < 0.35) {
      const w = (span.right - span.left) + 4 + k * 30;
      ctx.globalAlpha = 1 - k / 0.35;
      this.host.screen.px(cx - w / 2, this.host.cutY - 1, w, 1, '#ffffff');
    }
    ctx.globalAlpha = 1;
  }
}
