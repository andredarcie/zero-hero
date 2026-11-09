// AS MÃOS NA COLHEITA: o Z (ou o toque) que corta quando a faca passa na faixa, o dedo arrastando a bucha, o ESC que
// larga o cogumelo no chão. O que cada etapa é, é da ForagingOverlay.

import { CS } from './ForagingSoil';
import type { ForagingOverlay } from './ForagingOverlay';

/** O quadro congelado do corte: o golpe "pesa" antes de explodir. */
const HITSTOP = 0.07;
const ACTION_CODES = new Set(['KeyZ', 'KeyJ', 'Space', 'KeyX', 'KeyK', 'Enter', 'NumpadEnter']);

/** O que ForagingHands usa de ForagingOverlay. */
export type ForagingHandsHost = Pick<ForagingOverlay,
  'artBox' | 'bump' | 'cancel' | 'canvas' | 'card' | 'cb' | 'closed' | 'crumbs' | 'cutY' | 'enter' | 'freeze'
  | 'held' | 'knifeY' | 'recoil' | 'ring' | 'root' | 'scale' | 'screen' | 'shake' | 'soil' | 'sponge'
  | 'spongeShown' | 'stage' | 'touch' | 'view' | 'viewFrom' | 'viewTo' | 'wobble' | 'zoneBottom' | 'zoneTop'
>;

export class ForagingHands {
  public pointer: { id: number; down: boolean } | null = null;

  public constructor(private readonly host: ForagingHandsHost) {}

  /** O gesto do botão: cada estágio o lê de um jeito. */
  private act(): void {
    if (this.host.stage === 'aim') this.tryCut();
    else if (this.host.stage === 'note') this.host.card.closeNote();
  }

  private tryCut(): void {
    const y = this.host.knifeY;
    if (y < this.host.zoneTop || y > this.host.zoneBottom) {
      this.host.shake = 0.3;
      this.host.recoil = 1;
      this.host.wobble = 1;
      this.host.cb.onMiss();
      return;
    }
    this.host.cutY = Math.max(this.host.artBox.y0 + 2, Math.min(CS, Math.round(y)));
    this.host.knifeY = this.host.cutY;
    this.host.cb.onCut();
    this.host.freeze = HITSTOP;
    this.host.bump = 1;
    // As migalhas saem da linha do corte, na cor da carne que a faca atravessou.
    const span = this.host.soil.stemSpan(this.host.cutY);
    for (let i = 0; i < 14; i += 1) {
      const x = span.left + Math.random() * Math.max(1, span.right - span.left);
      this.host.crumbs.push({
        x, y: this.host.cutY,
        vx: (Math.random() - 0.5) * 38, vy: -Math.random() * 30 - 8,
        c: this.host.soil.colorAt(Math.floor(x), this.host.cutY - 1) ?? '#efe6d2', life: 0.6 + Math.random() * 0.35,
      });
    }
    this.host.ring = 0;
    const piece = this.host.soil.boxOfRows(0, this.host.cutY);
    this.host.viewFrom = { ...this.host.view };
    this.host.viewTo = { x: (piece.x0 + piece.x1) / 2, y: (piece.y0 + piece.y1) / 2 };
    this.host.soil.seedDirt();
    this.host.enter('pop');
  }

  public readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.host.closed) return;
    const code = event.code;
    let handled = true;
    if (code === 'Escape') {
      if (this.host.stage === 'note') this.host.card.closeNote();
      else this.host.cancel();
    } else if (ACTION_CODES.has(code)) {
      if (!event.repeat) this.act();
    } else if (code === 'ArrowLeft' || code === 'KeyA') {
      this.host.held.add('left');
    } else if (code === 'ArrowRight' || code === 'KeyD') {
      this.host.held.add('right');
    } else if (code === 'ArrowUp' || code === 'KeyW') {
      this.host.held.add('up');
    } else if (code === 'ArrowDown' || code === 'KeyS') {
      this.host.held.add('down');
    } else {
      handled = false;
    }
    if (handled) {
      // So o KEYDOWN e engolido. O keyup segue para o motor: uma seta que estava apertada
      // quando a tela abriu (o heroi encostado no cogumelo) precisa soltar la tambem, senao ele
      // sai andando sozinho quando a tela fecha.
      event.preventDefault();
      event.stopPropagation();
    }
  };

  public readonly onKeyUp = (event: KeyboardEvent): void => {
    const code = event.code;
    if (code === 'ArrowLeft' || code === 'KeyA') this.host.held.delete('left');
    else if (code === 'ArrowRight' || code === 'KeyD') this.host.held.delete('right');
    else if (code === 'ArrowUp' || code === 'KeyW') this.host.held.delete('up');
    else if (code === 'ArrowDown' || code === 'KeyS') this.host.held.delete('down');
  };

  /** Da tela para o pixel da arte. */
  private toArt(event: PointerEvent): { x: number; y: number } {
    const dpr = this.host.canvas.width / Math.max(1, this.host.root.clientWidth);
    const o = this.host.screen.origin();
    return {
      x: (event.clientX * dpr - o.x) / this.host.scale,
      y: (event.clientY * dpr - o.y) / this.host.scale,
    };
  }

  public readonly onPointerDown = (event: PointerEvent): void => {
    // Na ficha quem fecha e o CLIQUE (onClick): um dedo rolando um papel comprido nao pode dobra-lo.
    if (this.host.stage === 'note' || this.host.stage === 'closing') return;
    event.preventDefault();
    this.pointer = { id: event.pointerId, down: true };
    try { this.host.root.setPointerCapture(event.pointerId); } catch { /* sem captura, segue igual */ }
    if (this.host.stage === 'aim') { this.act(); return; }
    if (this.host.stage === 'clean') {
      const p = this.toArt(event);
      // O dedo PEGA a bucha onde tocou (sem arrastar um rastro ate la); o mouse ja vinha com ela.
      if (this.host.touch || event.pointerType !== 'mouse') this.host.sponge = p;
      this.host.spongeShown = true;
      this.host.soil.scrubTo(p.x, p.y);
    }
  };

  public readonly onClick = (): void => {
    if (this.host.stage === 'note') this.host.card.closeNote();
  };

  public readonly onPointerMove = (event: PointerEvent): void => {
    if (this.host.stage !== 'clean') return;
    const p = this.toArt(event);
    const pressed = this.pointer?.id === event.pointerId && this.pointer.down;
    if (event.pointerType === 'mouse' && !pressed) {
      // O mouse carrega a bucha sem esfregar; esfrega com o botao apertado, como uma borracha.
      this.host.soil.trackSponge(p.x, p.y);
      this.host.sponge = p;
      this.host.spongeShown = true;
      return;
    }
    if (pressed) this.host.soil.scrubTo(p.x, p.y);
  };

  public readonly onPointerUp = (event: PointerEvent): void => {
    if (this.pointer?.id === event.pointerId) this.pointer = null;
  };

  public readonly onPointerLeave = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && !this.pointer && this.host.stage === 'clean') this.host.spongeShown = false;
  };
}
