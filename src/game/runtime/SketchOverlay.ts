import { paintInk, type InkStroke } from '@/game/runtime/inkSketch';
import { HAND_FONT, INK, KEY_BG, KEY_BORDER, SOFT_BLUR, paperTexture, seedOf, tornEdge } from '@/game/runtime/uiStyle';

/**
 * DESENHAR UM BICHO (o caderno de desenho, runtime/sketches), no palco dos outros minijogos: o mundo embaçado, o bicho
 * sozinho posando em cima e a folha do caderno embaixo, nada escrito e nenhuma derrota.
 *
 *   · SEGURAR desenha (o dedo em qualquer lugar, ou o Z): a pena dá a volta no contorno e depois sombreia.
 *   · O BICHO alterna: distraído (come, rói, cisca), um tremor de aviso, e de repente LEVANTA A CABEÇA, com o "!" do
 *     mundo em cima. Com ele olhando, solte. Desenhando enquanto ele olha, ele se assusta e foge: a folha fica com o
 *     que já tinha, e o resto se desenha outro dia.
 *   · PRONTO, a pena escreve o nome e uma nota embaixo do desenho, e ele vai para o caderno de campo.
 *
 * X, Esc ou o "×" de papel fecham a qualquer hora (o que já foi desenhado fica). Congela o mundo (FrameTick).
 */

export interface SketchView {
  kind: string;
  /** O bicho posando (data URLs): os quadros de distraído, que alternam, e o de alerta; e o tamanho do quadro (px). */
  calm: readonly string[];
  alert: string;
  mw: number;
  mh: number;
  /** O desenho a pena: o tamanho dele (px de arte) e os traços na ordem da mão (runtime/inkSketch). */
  w: number;
  h: number;
  strokes: readonly InkStroke[];
  /** Quanto já estava desenhado (0..1). */
  start: number;
  name: string;
  latin: string;
  fact: string;
  close: string;
}

export interface SketchCallbacks {
  view: SketchView;
  /** Fechou: quanto ficou no papel, e se foi o bicho que fugiu. */
  onClose: (progress: number, startled: boolean) => void;
  scratch?: () => void;
  startle?: () => void;
  done?: () => void;
}

const STYLE_ID = 'zh-sketch-style';
/**
 * O RITMO DO BICHO, mais manso (pedido do autor, 2026-11-11: "mais fácil de desenhar, sem eles fugirem tão rápido"):
 * o desenho anda mais depressa, ele fica distraído mais tempo, avisa por mais tempo antes de olhar, olha por menos
 * tempo, e quem demora a soltar tem mais de meio segundo antes de ele se assustar.
 */
/**
 * Segundos de pena para um desenho inteiro. Com 4, quem segurava sem soltar chegava a 96% antes do primeiro olhar
 * do bicho e o minijogo sumia; com 6, sempre há pelo menos um olhar para respeitar.
 */
const DRAW_S = 6;
const FIRST_CALM_S = 3;
const CALM_S = [2.4, 4] as const;
const TELL_S = 0.9;
const ALERT_S = [0.7, 1.2] as const;
/** Desenhar com ele olhando por mais que isto o espanta (o respiro de quem soltou um instante atrasado). */
const GRACE_S = 0.6;
const SCRATCH_MS = 150;

const CSS = `
.zh-sketch-backdrop {
  position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 1rem; ${SOFT_BLUR} opacity: 0; transition: opacity 200ms ease;
  user-select: none; -webkit-user-select: none; touch-action: none; cursor: crosshair;
}
.zh-sketch-backdrop.zh-in { opacity: 1; }
/* TELA BAIXA (o celular deitado): o bicho AO LADO da folha, e não em cima. Empilhados, os dois passavam da altura da
   tela, o bicho cortado em cima e a folha embaixo. */
.zh-sketch-backdrop.zh-short { flex-direction: row; gap: 22px; }
.zh-sketch-stage { position: relative; display: grid; place-items: end center; }
.zh-sketch-model { image-rendering: pixelated; filter: drop-shadow(0 3px 0 rgba(0, 0, 0, 0.35)); transition: transform 120ms ease; }
.zh-sketch-stage.zh-tell .zh-sketch-model { animation: zh-sketch-tell 120ms linear infinite; }
@keyframes zh-sketch-tell { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(2px); } }
.zh-sketch-stage.zh-alert .zh-sketch-model { transform: translateY(-10px); }
.zh-sketch-stage.zh-flee .zh-sketch-model { transform: translateX(120vw); transition: transform 700ms ease-in; }
/* O "!" do mundo: pixel, na paleta do keycap, por cima do bicho que levantou a cabeça. */
.zh-sketch-mark { position: absolute; top: -34px; left: 50%; width: 15px; height: 33px; margin-left: -7px; opacity: 0; transition: opacity 80ms; }
.zh-sketch-stage.zh-alert .zh-sketch-mark { opacity: 1; }
.zh-sketch-page {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px;
  width: min(440px, 92vw); padding: 22px 20px 18px; background-color: #e3d1a4; background-size: max(100%, 440px) auto;
  color: ${INK}; font-family: ${HAND_FONT}; font-weight: 600; text-align: center;
}
.zh-sketch-sheet { position: relative; }
.zh-sketch-ink { display: block; image-rendering: pixelated; }
.zh-sketch-nib { position: absolute; width: 22px; height: 22px; margin: -21px 0 0 -2px; pointer-events: none; opacity: 0; }
.zh-sketch-nib.zh-on { opacity: 1; }
.zh-sketch-caption { opacity: 0; transition: opacity 600ms ease 200ms; }
.zh-sketch-page.zh-done .zh-sketch-caption { opacity: 1; }
.zh-sketch-name { margin: 6px 0 0; font-size: 1.8rem; line-height: 1.05; }
.zh-sketch-latin { margin: 0; font-size: 1.1rem; font-style: italic; opacity: 0.8; }
.zh-sketch-fact { margin: 6px auto 0; font-size: 1.2rem; line-height: 1.22; max-width: 30ch; }
/* O FECHAR: um pedaço de papel com um "×" a pena, sempre no canto (alvo de dedo de 44px). */
.zh-sketch-close {
  position: fixed; top: 14px; right: 14px; width: 44px; height: 44px; padding: 9px; border: 0; cursor: pointer;
  background-color: #e3d1a4; background-size: 220px auto; box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
.zh-sketch-close svg { display: block; width: 100%; height: 100%; }
.zh-sketch-close path, .zh-sketch-nib path { fill: none; stroke: ${INK}; stroke-width: 2.6; stroke-linecap: round; }
@media (prefers-reduced-motion: reduce) { .zh-sketch-stage.zh-tell .zh-sketch-model { animation: none; } }
`;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

const svg = (cls: string, viewBox: string, inner: string): SVGSVGElement => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('class', cls);
  node.setAttribute('viewBox', viewBox);
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = inner;
  return node;
};

/** O "!" em pixel: a haste e o ponto, com o contorno escuro do keycap. */
const MARK = `<rect x="4" y="0" width="7" height="22" fill="${KEY_BG}"/><rect x="5" y="1" width="5" height="20" fill="${KEY_BORDER}"/>`
  + `<rect x="4" y="25" width="7" height="8" fill="${KEY_BG}"/><rect x="5" y="26" width="5" height="6" fill="${KEY_BORDER}"/>`;
const CROSS = '<path d="M6 7 C 12 12, 19 20, 26 27"/><path d="M26 6 C 20 12, 13 19, 7 27"/>';
/** A pena: o bico em diagonal, a ponta embaixo à esquerda (é ela que toca o papel). */
const NIB = '<path d="M2 20 L 6 14 L 19 3 L 21 5 L 10 18 Z" style="fill: rgba(38,24,12,0.92)"/><path d="M2 20 L 7 15"/>';

const between = ([a, b]: readonly [number, number]): number => a + Math.random() * (b - a);

type Phase = 'calm' | 'tell' | 'alert' | 'flee' | 'done';

export class SketchOverlay {
  private readonly root: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly model: HTMLImageElement;
  private readonly page: HTMLDivElement;
  private readonly ink: HTMLCanvasElement;
  private readonly nib: SVGSVGElement;
  private readonly scale: number;
  private progress: number;
  private drawing = false;
  private phase: Phase = 'calm';
  private phaseLeft = FIRST_CALM_S;
  private watched = 0;
  private frameClock = 0;
  private lastScratch = 0;
  private shown = -1;
  private last = performance.now();
  private raf = 0;
  private closed = false;
  private doneAt = 0;

  public constructor(private readonly cb: SketchCallbacks) {
    ensureStyle();
    const v = cb.view;
    this.progress = v.start;
    this.root = document.createElement('div');
    this.root.className = 'zh-sketch-backdrop';
    // A medida vem da tela: na baixa, o bicho vai para o lado e os dois encolhem até caber a folha com a nota.
    const short = window.innerHeight < 560;
    if (short) this.root.classList.add('zh-short');
    const modelBox = short ? { w: 150, h: Math.max(48, Math.min(110, window.innerHeight - 200)) } : { w: 200, h: 150 };
    const inkBox = short ? { w: 220, h: Math.max(48, window.innerHeight - 290) } : { w: 260, h: 170 };
    this.root.setAttribute('data-zh-ui', '');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', v.name);

    this.stage = document.createElement('div');
    this.stage.className = 'zh-sketch-stage';
    this.model = document.createElement('img');
    this.model.className = 'zh-sketch-model';
    this.model.alt = '';
    const ms = Math.max(1, Math.floor(Math.min(modelBox.w / v.mw, modelBox.h / v.mh)));
    this.model.style.width = `${v.mw * ms}px`;
    this.model.style.height = `${v.mh * ms}px`;
    this.model.src = v.calm[0] ?? v.alert;
    this.stage.append(this.model, svg('zh-sketch-mark', '0 0 15 33', MARK));

    this.page = document.createElement('div');
    this.page.className = 'zh-sketch-page';
    const paper = paperTexture();
    if (paper) this.page.style.backgroundImage = `url(${paper})`;
    this.page.style.clipPath = tornEdge(seedOf(v.kind), 0.8);
    const sheet = document.createElement('div');
    sheet.className = 'zh-sketch-sheet';
    this.ink = document.createElement('canvas');
    this.ink.className = 'zh-sketch-ink';
    this.scale = Math.max(1, Math.floor(Math.min(inkBox.w / v.w, inkBox.h / v.h)));
    this.ink.style.width = `${v.w * this.scale}px`;
    this.ink.style.height = `${v.h * this.scale}px`;
    this.nib = svg('zh-sketch-nib', '0 0 22 22', NIB);
    sheet.append(this.ink, this.nib);
    const caption = document.createElement('div');
    caption.className = 'zh-sketch-caption';
    const name = document.createElement('h2');
    name.className = 'zh-sketch-name';
    name.textContent = v.name;
    const latin = document.createElement('p');
    latin.className = 'zh-sketch-latin';
    latin.textContent = v.latin;
    const fact = document.createElement('p');
    fact.className = 'zh-sketch-fact';
    fact.textContent = v.fact;
    caption.append(name, latin, fact);
    this.page.append(sheet, caption);

    const shut = document.createElement('button');
    shut.type = 'button';
    shut.className = 'zh-sketch-close';
    shut.title = v.close;
    shut.setAttribute('aria-label', v.close);
    if (paper) shut.style.backgroundImage = `url(${paper})`;
    shut.appendChild(svg('', '0 0 32 32', CROSS));
    shut.addEventListener('pointerdown', (e) => e.stopPropagation());
    shut.addEventListener('click', () => this.close());

    this.root.append(this.stage, this.page, shut);
    this.root.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('blur', this.onUp);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    document.body.appendChild(this.root);
    this.paint();
    if (this.progress >= 1) this.finish();
    this.raf = window.requestAnimationFrame(this.tick);
    window.requestAnimationFrame(() => { if (!this.closed) this.root.classList.add('zh-in'); });
  }

  /** Quanto já está no papel, e o que o bicho está fazendo (a janela dos playtests). */
  public get state(): { progress: number; phase: Phase; drawing: boolean } {
    return { progress: this.progress, phase: this.phase, drawing: this.drawing };
  }

  /** Segurar ou soltar a pena, como o dedo e o Z fazem (a sonda dos playtests usa isto). */
  public hold(on: boolean): void {
    if (this.phase === 'done') { if (on && performance.now() - this.doneAt > 600) this.close(); return; }
    this.drawing = on && this.phase !== 'flee';
  }

  private readonly onDown = (e: PointerEvent): void => { e.preventDefault(); this.hold(true); };
  private readonly onUp = (): void => { this.drawing = false; };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    e.stopPropagation();
    const key = e.key.toLowerCase();
    if (key === 'escape' || key === 'x' || key === 'k' || key === 'i') { e.preventDefault(); this.close(); return; }
    if (key === 'z' || key === 'j' || key === ' ' || key === 'enter') { e.preventDefault(); if (!(e.repeat && this.phase === 'done')) this.hold(true); }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    if (key === 'z' || key === 'j' || key === ' ' || key === 'enter') this.drawing = false;
  };

  private readonly tick = (now: number): void => {
    if (this.closed) return;
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.step(dt, now);
    this.raf = window.requestAnimationFrame(this.tick);
  };

  private step(dt: number, now: number): void {
    if (this.phase === 'done' || this.phase === 'flee') return;
    this.phaseLeft -= dt;
    if (this.phaseLeft <= 0) this.nextPhase();
    // O bicho distraído mexe (os quadros alternam); avisando, ele congela e treme; olhando, ele está em pé.
    this.frameClock += dt;
    const v = this.cb.view;
    const src = this.phase === 'alert' ? v.alert : this.phase === 'tell' ? this.model.src : v.calm[Math.floor(this.frameClock / 0.32) % v.calm.length];
    if (src && this.model.src !== src) this.model.src = src;
    if (!this.drawing) { this.watched = 0; this.nib.classList.remove('zh-on'); return; }
    if (this.phase === 'alert') {
      this.watched += dt;
      if (this.watched > GRACE_S) this.startle();
      return;
    }
    this.progress = Math.min(1, this.progress + dt / DRAW_S);
    this.paint();
    if (now - this.lastScratch > SCRATCH_MS) { this.lastScratch = now; this.cb.scratch?.(); }
    if (this.progress >= 1) this.finish();
  }

  private nextPhase(): void {
    if (this.phase === 'calm') { this.phase = 'tell'; this.phaseLeft = TELL_S; }
    else if (this.phase === 'tell') { this.phase = 'alert'; this.phaseLeft = between(ALERT_S); this.watched = 0; }
    else { this.phase = 'calm'; this.phaseLeft = between(CALM_S); }
    this.stage.classList.toggle('zh-tell', this.phase === 'tell');
    this.stage.classList.toggle('zh-alert', this.phase === 'alert');
  }

  /** Desenha o que já está no papel, e põe a pena no último traço. */
  private paint(): void {
    const v = this.cb.view;
    const n = Math.ceil(this.progress * v.strokes.length);
    if (n === this.shown) return;
    this.shown = n;
    paintInk(this.ink, v.w, v.h, v.strokes, n);
    const at = v.strokes[Math.max(0, n - 1)];
    if (at && this.drawing && n < v.strokes.length) {
      this.nib.style.left = `${(at.x + 0.5) * this.scale}px`;
      this.nib.style.top = `${(at.y + 0.5) * this.scale}px`;
      this.nib.classList.add('zh-on');
    } else {
      this.nib.classList.remove('zh-on');
    }
  }

  private startle(): void {
    this.phase = 'flee';
    this.drawing = false;
    this.nib.classList.remove('zh-on');
    this.stage.classList.remove('zh-tell', 'zh-alert');
    this.stage.classList.add('zh-flee');
    this.cb.startle?.();
    window.setTimeout(() => this.close(true), 900);
  }

  private finish(): void {
    this.phase = 'done';
    this.drawing = false;
    this.doneAt = performance.now();
    this.nib.classList.remove('zh-on');
    this.stage.classList.remove('zh-tell', 'zh-alert');
    this.model.src = this.cb.view.calm[0] ?? this.model.src;
    this.page.classList.add('zh-done');
    this.cb.done?.();
  }

  public close(startled = false): void {
    if (this.closed) return;
    this.closed = true;
    this.detach();
    this.root.classList.remove('zh-in');
    window.setTimeout(() => this.root.remove(), 200);
    // Fechar no meio da fuga (o X durante a corrida dele) ainda é o bicho que fugiu: a espera dele vale igual.
    this.cb.onClose(this.progress, startled || this.phase === 'flee');
  }

  /** Fecha sem avisar ninguém: o desmonte da cena. */
  public destroy(): void {
    this.closed = true;
    this.detach();
    this.root.remove();
  }

  private detach(): void {
    window.cancelAnimationFrame(this.raf);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('blur', this.onUp);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
  }
}
