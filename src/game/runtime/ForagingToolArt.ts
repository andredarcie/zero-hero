// AS FERRAMENTAS DESENHADAS NA COLHEITA: a faca que vai e volta (com a faixa onde o corte vale), a bucha seguindo o
// dedo, e as faíscas do corte.

import { clamp01, easeOut, easeOutBack } from './ForagingMushroomArt';
import type { ForagingOverlay } from './ForagingOverlay';

/** O navy de tinta de toda a arte do jogo (fungi.ts). */
const NAVY = '#1b1d33';
/** A bucha em pixels: '#' bucha, 'o' furo do trançado. */
const SPONGE = [
  '..#####..',
  '.##o##o#.',
  '#o##o##o#',
  '.##o##o#.',
  '..#####..',
];
const SPONGE_BASE = '#dcc78e';
const SPONGE_HOLE = '#a88a52';

/** O que ForagingToolArt usa de ForagingOverlay. */
export type ForagingToolArtHost = Pick<ForagingOverlay,
  'bladeL' | 'bladeR' | 'clock' | 'ctx' | 'hands' | 'held' | 'knifeY' | 'recoil' | 'screen' | 'sparks'
  | 'sponge' | 'spongeVel' | 'stage' | 'stageClock' | 'zoneBottom' | 'zoneTop'
>;

export class ForagingToolArt {
  public constructor(private readonly host: ForagingToolArtHost) {}

  /** As estrelinhas de limpo: cruzinhas que piscam em volta, cada uma no seu tempo. */
  public drawSparks(): void {
    const ctx = this.host.ctx;
    for (const s of this.host.sparks) {
      const k = (this.host.stageClock - s.at) / 0.55;
      if (k <= 0 || k >= 1) continue;
      const size = k < 0.5 ? 1 + Math.round(k * 4) : 1 + Math.round((1 - k) * 4);
      const x = Math.round(s.x);
      const y = Math.round(s.y - k * 2);
      ctx.globalAlpha = 1 - k * 0.3;
      this.host.screen.px(x - size, y, size * 2 + 1, 1, s.c);
      this.host.screen.px(x, y - size, 1, size * 2 + 1, s.c);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * A faca deitada, na arte da faca da mochila. Entra deslizando da direita depois que o cogumelo
   * brota; na altura certa a lâmina ACENDE e um brilho corre por ela (o único aviso, e ele mora na
   * faca); um erro a faz recuar; o corte a leva direto, atravessando, e ela some.
   */
  /**
   * A FACA (pedido do autor: "que pareça mesmo uma faca"). De lado, deitada, com a PONTA para o cogumelo: o dorso
   * em cima desce até a ponta, o FIO claro embaixo é a linha exata do corte (`knifeY`), a virola de latão separa a
   * lâmina do cabo de madeira, e dois rebites no cabo. Entre as marcas, o fio acende e um brilho corre por ele.
   */
  public drawKnife(): void {
    const ctx = this.host.ctx;
    let ox = 0;
    let alpha = 1;
    if (this.host.stage === 'intro') {
      const k = clamp01((this.host.stageClock - 0.18) / 0.42);
      ox = (1 - easeOutBack(k)) * 34;
      alpha = clamp01(k * 3);
    } else if (this.host.stage === 'closing') {
      const k = clamp01(this.host.stageClock / 0.25);
      ox = easeOut(k) * 30;
      alpha = 1 - k;
    } else if (this.host.stage === 'pop') {
      const k = clamp01(this.host.stageClock / 0.22);
      if (k >= 1) return;
      ox = -k * k * 40;
      alpha = 1 - k;
    }
    ox += this.host.recoil * 5 * Math.abs(Math.sin(this.host.recoil * Math.PI));
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(ox), 0);
    const y = Math.round(this.host.knifeY);
    const inZone = this.host.stage === 'aim' && this.host.knifeY >= this.host.zoneTop && this.host.knifeY <= this.host.zoneBottom;
    const x0 = this.host.bladeL;
    const x1 = this.host.bladeR;
    // A LÂMINA, coluna a coluna: perto da ponta o dorso desce até o fio (a ponta afiada).
    const TIP = 7;
    for (let x = x0; x < x1; x += 1) {
      const fromTip = x - x0;
      const lift = fromTip >= TIP ? 3 : Math.floor((fromTip * 3) / TIP); // altura do dorso acima do fio
      const top = y - lift;
      this.host.screen.px(x, top - 1, 1, 1, NAVY);                                     // o contorno de cima
      if (lift >= 3) this.host.screen.px(x, top, 1, 1, '#eef3f4');                     // o dorso iluminado
      for (let yy = top + (lift >= 3 ? 1 : 0); yy < y; yy += 1) this.host.screen.px(x, yy, 1, 1, '#aeb8bd'); // o corpo
      this.host.screen.px(x, y, 1, 1, inZone ? '#ffffff' : '#dfe6e8');                // o FIO: a linha do corte
      this.host.screen.px(x, y + 1, 1, 1, NAVY);                                       // o contorno de baixo
    }
    this.host.screen.px(x0 - 1, y, 1, 1, NAVY);                                        // a ponta
    if (inZone) {
      const glint = x0 + Math.floor((this.host.clock * 40) % Math.max(1, x1 - x0));
      this.host.screen.px(glint, y, 1, 1, '#fffbe6');
      this.host.screen.px(glint - 1, y - 1, 3, 1, '#fffbe6');
    }
    // A VIROLA de latão, um pouco mais alta que a lâmina.
    this.host.screen.px(x1, y - 4, 2, 6, NAVY);
    this.host.screen.px(x1, y - 3, 2, 4, '#c9a24a');
    this.host.screen.px(x1, y - 3, 1, 1, '#f0d27a');
    // O CABO de madeira, com dois rebites e a ponta arredondada.
    this.host.screen.px(x1 + 2, y - 4, 11, 1, NAVY);
    this.host.screen.px(x1 + 2, y + 1, 11, 1, NAVY);
    this.host.screen.px(x1 + 2, y - 3, 11, 4, '#8a5a32');
    this.host.screen.px(x1 + 2, y - 3, 11, 1, '#a8743f');
    this.host.screen.px(x1 + 2, y, 11, 1, '#5e3b1e');
    this.host.screen.px(x1 + 5, y - 2, 1, 1, '#e6d2a0');
    this.host.screen.px(x1 + 10, y - 2, 1, 1, '#e6d2a0');
    this.host.screen.px(x1 + 13, y - 3, 1, 4, NAVY);
    ctx.restore();
  }

  /**
   * A bucha na mão: um ovalzinho trançado, com o contorno de tinta do jogo. Ela ESTICA no sentido
   * em que anda e amassa quando o dedo/botão aperta — é a massa dela que vende o esfregar.
   */
  public drawSponge(): void {
    const ctx = this.host.ctx;
    const w = SPONGE[0].length;
    const h = SPONGE.length;
    const cx = Math.round(this.host.sponge.x);
    const cy = Math.round(this.host.sponge.y);
    const speed = Math.min(1, Math.hypot(this.host.spongeVel.x, this.host.spongeVel.y) / 2.5);
    const ang = Math.atan2(this.host.spongeVel.y, this.host.spongeVel.x);
    const pressed = this.host.hands.pointer?.down === true || this.host.held.size > 0;
    ctx.save();
    ctx.translate(cx, cy);
    if (speed > 0.02) {
      // Esticar ao longo do movimento: gira para o rumo, escala, e desgira.
      ctx.rotate(ang);
      ctx.scale(1 + 0.22 * speed, 1 - 0.16 * speed);
      ctx.rotate(-ang);
    }
    if (pressed) ctx.scale(1.08, 0.88);
    ctx.translate(-w / 2, -h / 2);
    const solid = (x: number, y: number): boolean => y >= 0 && y < h && x >= 0 && x < w && SPONGE[y][x] !== '.';
    for (let y = -1; y <= h; y += 1) {
      for (let x = -1; x <= w; x += 1) {
        if (solid(x, y)) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) this.host.screen.px(x, y, 1, 1, NAVY);
      }
    }
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const c = SPONGE[y][x];
        if (c === '.') continue;
        this.host.screen.px(x, y, 1, 1, c === 'o' ? SPONGE_HOLE : SPONGE_BASE);
      }
    }
    ctx.restore();
  }
}
