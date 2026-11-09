// A TELA DA COLHEITA: o canvas na escala de pixel que cabe na janela, a origem da arte no meio dele, e o quadro
// desenhado na ordem certa (o chão, o cogumelo, a terra, as ferramentas). Cada peça desenha a si mesma.

import { GRAIN } from './ForagingSoil';
import type { ForagingOverlay } from './ForagingOverlay';

/** O que ForagingScreen usa de ForagingOverlay. */
export type ForagingScreenHost = Pick<ForagingOverlay,
  'bump' | 'canvas' | 'clock' | 'crumbs' | 'ctx' | 'cutY' | 'fitBox' | 'grains' | 'mushroomArt' | 'root'
  | 'scale' | 'shake' | 'spongeShown' | 'stage' | 'toolArt' | 'view'
>;

export class ForagingScreen {
  public constructor(private readonly host: ForagingScreenHost) {}

  public readonly resize = (): void => {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.host.root.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.host.root.clientHeight * dpr));
    this.host.canvas.width = w;
    this.host.canvas.height = h;
    // O MAIOR QUE COUBER, em escala inteira (pixel art não aceita pixel quebrado): o cogumelo e a
    // faca inteiros dentro da tela, com um respiro em volta.
    const fw = this.host.fitBox.x1 - this.host.fitBox.x0;
    const fh = this.host.fitBox.y1 - this.host.fitBox.y0;
    this.host.scale = Math.max(1, Math.floor(Math.min((w * 0.92) / fw, (h * 0.84) / fh)));
  };

  /** Onde o pixel (0, 0) da arte cai na tela. */
  public origin(): { x: number; y: number } {
    const sx = this.host.shake > 0 ? Math.sin(this.host.clock * 70) * 0.7 * (this.host.shake / 0.3) : 0;
    const sy = this.host.bump > 0 ? Math.sin(this.host.bump * Math.PI) * 0.8 : 0;
    return {
      x: Math.round(this.host.canvas.width / 2 - this.host.scale * (this.host.view.x - sx)),
      y: Math.round(this.host.canvas.height / 2 - this.host.scale * (this.host.view.y - sy)),
    };
  }

  public px(x: number, y: number, w: number, h: number, c: string): void {
    this.host.ctx.fillStyle = c;
    this.host.ctx.fillRect(x, y, w, h);
  }

  public draw(): void {
    const ctx = this.host.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.host.canvas.width, this.host.canvas.height);
    if (this.host.stage === 'note') return;
    ctx.imageSmoothingEnabled = false;
    const o = this.origin();
    ctx.setTransform(this.host.scale, 0, 0, this.host.scale, o.x, o.y);

    if (this.host.stage === 'intro' || this.host.stage === 'aim' || (this.host.stage === 'closing' && this.host.cutY === 0)) {
      this.host.mushroomArt.drawWhole();
      this.host.toolArt.drawKnife();
      return;
    }

    if (this.host.stage === 'pop') this.host.mushroomArt.drawStub();
    this.host.mushroomArt.drawPiece();
    if (this.host.stage === 'pop') this.host.toolArt.drawKnife();
    for (const c of this.host.crumbs) {
      ctx.globalAlpha = Math.min(1, c.life * 2.5);
      this.px(Math.round(c.x), Math.round(c.y), 1, 1, c.c);
    }
    ctx.globalAlpha = 1;
    this.host.mushroomArt.drawRing();
    for (const g of this.host.grains) {
      ctx.globalAlpha = g.age > 1.6 ? Math.max(0, 1 - (g.age - 1.6) / 1.4) : 1;
      this.px(Math.round(g.x * 3) / 3, Math.round(g.y * 3) / 3, GRAIN, GRAIN, g.c);
    }
    ctx.globalAlpha = 1;
    if (this.host.stage === 'shine') this.host.toolArt.drawSparks();
    if (this.host.stage === 'clean' && this.host.spongeShown) this.host.toolArt.drawSponge();
  }
}
