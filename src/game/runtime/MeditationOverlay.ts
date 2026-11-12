import { HAND_FONT, INK, KEY_BORDER, KEY_GLYPH, PAPER_SURFACE, PIXEL_FONT, paperTexture, pixelFrame, seedOf, tornEdge } from '@/game/runtime/uiStyle';

/**
 * AS MÃOS DA MEDITAÇÃO (a regra é runtime/meditation; o desenho, runtime/MeditationView). Nada aqui se vê além do
 * necessário: o mundo continua na tela, sem embaçar, com o herói sentado no meio dele.
 *
 *   · SEGURAR inspira, SOLTAR expira: o Z (ou o espaço), ou o dedo em qualquer lugar da tela.
 *   · PERCEBER o pensamento: o X, ou o botão "B" do toque.
 *   · LEVANTAR: o Esc, as setas, ou o "×" de papel no canto.
 *   · No fim, se a sessão teve fôlego de verdade, a NOTA do caderno: quantos fôlegos, quantas voltas, quanto tempo,
 *     e uma coisa que a pesquisa diz (com a fonte embaixo). Qualquer toque ou tecla fecha.
 */

export interface MeditationOverlayCallbacks {
  /** O jogador percebeu um pensamento (o X, ou o B). */
  onNotice: () => void;
  /** O jogador quer levantar (o Esc, uma seta, o ×). */
  onLeave: () => void;
  close: string;
  notice: string;
}

export interface MeditationNote {
  title: string;
  stats: string;
  fact: string;
  source: string;
}

const ROOT_ID = 'zh-med';
const CSS = `
#${ROOT_ID} { position: fixed; inset: 0; z-index: 58; touch-action: none; user-select: none; -webkit-user-select: none; }
#${ROOT_ID} .zh-med-close {
  position: fixed; top: calc(14px + env(safe-area-inset-top, 0px)); right: calc(14px + env(safe-area-inset-right, 0px));
  width: 44px; height: 44px; padding: 9px; border: 0; cursor: pointer; ${PAPER_SURFACE}
  background-size: 220px auto; box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
#${ROOT_ID} .zh-med-close svg { display: block; width: 100%; height: 100%; }
#${ROOT_ID} .zh-med-close path { fill: none; stroke: ${INK}; stroke-width: 2.6; stroke-linecap: round; }
/* O "B" do toque: a mesma tecla de pixel dos botões do jogo, no lado deles, mas ACIMA da legenda (ela diz "toque B"
   justamente quando o primeiro pensamento chega, e no celular em pé cobria o botão). */
#${ROOT_ID} .zh-med-b {
  position: fixed; right: calc(20px + env(safe-area-inset-right, 0px)); bottom: calc(max(26vh, 124px) + env(safe-area-inset-bottom, 0px));
  width: 64px; height: 64px; padding: 0; border: 0; cursor: pointer; image-rendering: pixelated;
  background: ${pixelFrame(16, 'rgba(36, 29, 15, 0.85)', KEY_BORDER, 2)} center / 100% 100% no-repeat;
  color: ${KEY_GLYPH}; font-family: ${PIXEL_FONT}; font-size: 10px; line-height: 1.2;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
#${ROOT_ID} .zh-med-b:active { transform: translateY(3px); filter: brightness(1.3); }
#${ROOT_ID} .zh-med-b b { display: block; font-size: 16px; color: ${KEY_BORDER}; }
/* A NOTA DO CADERNO no fim da sessão. */
#${ROOT_ID} .zh-med-note-wrap {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 1rem;
  background: rgba(8, 10, 14, 0.25); opacity: 0; transition: opacity 260ms ease;
}
#${ROOT_ID} .zh-med-note-wrap.zh-in { opacity: 1; }
#${ROOT_ID} .zh-med-note {
  width: min(420px, 92vw); padding: 22px 24px 18px; ${PAPER_SURFACE} text-align: center;
  transform: translateY(16px) rotate(-1.2deg); transition: transform 320ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
#${ROOT_ID} .zh-med-note-wrap.zh-in .zh-med-note { transform: rotate(-1.2deg); }
#${ROOT_ID} .zh-med-note h2 { margin: 0; font-family: ${HAND_FONT}; font-size: 1.9rem; line-height: 1.05; }
#${ROOT_ID} .zh-med-stats { margin: 4px 0 10px; font-size: 1.15rem; opacity: 0.8; }
#${ROOT_ID} .zh-med-fact { margin: 0 auto; max-width: 32ch; font-size: 1.3rem; line-height: 1.25; }
#${ROOT_ID} .zh-med-source { margin: 10px 0 0; font-size: 0.98rem; font-style: italic; opacity: 0.65; }
`;

const CROSS = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 7 C 12 12, 19 20, 26 27"/><path d="M26 6 C 20 12, 13 19, 7 27"/></svg>';
const HOLD_KEYS: ReadonlySet<string> = new Set(['z', 'j', ' ', 'enter']);
const NOTICE_KEYS: ReadonlySet<string> = new Set(['x', 'k']);
const LEAVE_KEYS: ReadonlySet<string> = new Set(['escape', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd']);

export class MeditationOverlay {
  private readonly root: HTMLDivElement;
  private keyHeld = false;
  /**
   * Os dedos (ou o mouse) segurando o fôlego, por `pointerId`. Um booleano só soltava o fôlego no `pointerup` de
   * QUALQUER dedo: no celular deitado, um polegar segura e o outro toca o B, e o fôlego caía sem ninguém soltar.
   */
  private readonly pointers = new Set<number>();
  private note?: { el: HTMLDivElement; shownAt: number; onDone: () => void };
  private closed = false;

  public constructor(private readonly cb: MeditationOverlayCallbacks, touch: boolean) {
    if (!document.getElementById(`${ROOT_ID}-style`)) {
      const style = document.createElement('style');
      style.id = `${ROOT_ID}-style`;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    document.getElementById(ROOT_ID)?.remove();
    this.root = document.createElement('div');
    this.root.id = ROOT_ID;
    this.root.setAttribute('data-zh-ui', '');
    const close = this.button('zh-med-close', CROSS, cb.close, () => this.cb.onLeave());
    const paper = paperTexture();
    if (paper) close.style.backgroundImage = `url(${paper})`;
    this.root.appendChild(close);
    if (touch) this.root.appendChild(this.button('zh-med-b', `<b>B</b>${cb.notice}`, cb.notice, () => this.cb.onNotice()));
    this.root.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    document.body.appendChild(this.root);
  }

  /** O jogador está inspirando (segurando o Z ou o dedo). */
  public get holding(): boolean {
    return !this.note && (this.keyHeld || this.pointers.size > 0);
  }

  /** A nota está aberta (a janela dos playtests). */
  public get noteOpen(): boolean {
    return this.note !== undefined;
  }

  private button(cls: string, html: string, label: string, act: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.innerHTML = html;
    b.title = label;
    b.setAttribute('aria-label', label);
    // O botão não é "segurar para inspirar": o toque nele não desce até o fundo.
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => { e.stopPropagation(); act(); });
    return b;
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (this.note) { this.tryCloseNote(); return; }
    e.preventDefault();
    this.pointers.add(e.pointerId);
  };

  private readonly onUp = (e: PointerEvent): void => { this.pointers.delete(e.pointerId); };
  private readonly onBlur = (): void => { this.pointers.clear(); this.keyHeld = false; };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Nada do que se aperta meditando chega ao jogo (nem a pausa, nem o "levantar" do descanso).
    e.stopPropagation();
    const key = e.key.toLowerCase();
    if (this.note) { e.preventDefault(); if (!e.repeat) this.tryCloseNote(); return; }
    if (HOLD_KEYS.has(key)) { e.preventDefault(); this.keyHeld = true; return; }
    if (e.repeat) return;
    if (NOTICE_KEYS.has(key)) { e.preventDefault(); this.cb.onNotice(); return; }
    if (LEAVE_KEYS.has(key)) { e.preventDefault(); this.cb.onLeave(); }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (HOLD_KEYS.has(e.key.toLowerCase())) this.keyHeld = false;
  };

  /** A nota do caderno, no fim: `onDone` roda quando ela fecha. */
  public showNote(note: MeditationNote, onDone: () => void): void {
    this.keyHeld = false;
    this.pointers.clear();
    this.root.querySelectorAll('button').forEach((b) => b.remove());
    const wrap = document.createElement('div');
    wrap.className = 'zh-med-note-wrap';
    const card = document.createElement('div');
    card.className = 'zh-med-note';
    const paper = paperTexture();
    if (paper) card.style.backgroundImage = `url(${paper})`;
    card.style.clipPath = tornEdge(seedOf(note.fact), 0.8);
    const add = (tag: string, cls: string, text: string): void => {
      const el = document.createElement(tag);
      if (cls) el.className = cls;
      el.textContent = text;
      card.appendChild(el);
    };
    add('h2', '', note.title);
    add('p', 'zh-med-stats', note.stats);
    add('p', 'zh-med-fact', note.fact);
    add('p', 'zh-med-source', note.source);
    wrap.appendChild(card);
    this.root.appendChild(wrap);
    this.note = { el: wrap, shownAt: performance.now(), onDone };
    window.requestAnimationFrame(() => wrap.classList.add('zh-in'));
  }

  /** Fecha a nota (com um respiro: a tecla que levantou o herói não pode fechar a nota no mesmo instante). */
  private tryCloseNote(): void {
    const note = this.note;
    if (!note || performance.now() - note.shownAt < 700) return;
    this.note = undefined;
    note.onDone();
  }

  public destroy(): void {
    if (this.closed) return;
    this.closed = true;
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    this.root.remove();
  }
}
