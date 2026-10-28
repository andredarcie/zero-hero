import {
  CLOSE_SIZE, FUNGUS_SPECS, fungusCloseUp,
  type DirtKind, type MushroomKind,
} from '@/game/fungi/fungi';
import { t, tWords } from '@/game/i18n/i18n';
import {
  HAND_FONT as HAND, INK, INK_RED, SOFT_BLUR, paperTexture, seedOf, seededRandom, tornEdge,
} from '@/game/runtime/uiStyle';

/**
 * A COLHEITA DE UM COGUMELO — sem interface de jogo nenhuma. O mundo fica onde está, só que
 * EMBAÇADO, e no meio dele aparece o cogumelo, sozinho e o maior que couber: sem moldura, sem
 * fundo, sem texto. Tudo o que o jogador precisa saber está no próprio desenho.
 *
 *   1. CORTAR. O cogumelo brota no meio da tela e a faca desliza para o lado dele. Ela sobe e
 *      desce rente ao talo; a lâmina BRILHA quando está na altura certa (rente ao chão; na
 *      amanita, abaixo dele, para levar a volva). O gesto corta na hora: um instante congelado,
 *      um POP, migalhas, a faca passa direto, o toco cai, e o cogumelo dá um pulinho e assenta de
 *      novo no meio da tela. Errar só faz o cogumelo tremer e a faca recuar — nada se perde.
 *   2. LIMPAR. Manchas de terra com o contorno roxo de "pegue isto" do mundo; o cogumelo, sem
 *      contorno nenhum. A bucha APAGA a terra por onde passa, como a borracha do Paint, e cada
 *      pixel apagado escorre como areia. Limpo, o cogumelo brilha, dá um boing e cai girando na bolsa.
 *   3. A FICHA. Um papel velho e amassado sobe da bolsa, a foto cai em cima, o clipe a prende, e a
 *      descrição vai sendo escrita à pena, linha por linha. Um toque termina a escrita; outro
 *      dobra o papel, e o cogumelo está na cesta.
 *
 * NADA SE PERDE AQUI (a lei do jogo): sair antes do corte (ESC) deixa o cogumelo no chão; depois
 * do corte não há saída — o cogumelo já está na mão.
 */

const STYLE_ID = 'zh-forage-style';

/** O roxo do contorno de "dá para pegar" dos itens no chão (ItemPickup.OUTLINE_COLOR). */
const PICK_OUTLINE = '#9d7bff';
/** O navy de tinta de toda a arte do jogo (fungi.ts). */
const NAVY = '#1b1d33';

const CSS = `
.zh-forage {
  position: fixed; inset: 0; z-index: 60;
  /* O mundo do jogo continua ali, so que fora de foco: o cogumelo e a unica coisa nitida. */
  background: rgba(8, 10, 14, 0);
  -webkit-backdrop-filter: blur(0px); backdrop-filter: blur(0px);
  transition: backdrop-filter 420ms ease, -webkit-backdrop-filter 420ms ease, background 420ms ease;
  touch-action: none; user-select: none; -webkit-user-select: none;
  overflow: hidden;
}
.zh-forage.zh-in { ${SOFT_BLUR} }
.zh-forage-canvas {
  position: absolute; inset: 0; width: 100%; height: 100%; display: block;
  image-rendering: pixelated; image-rendering: crisp-edges;
  cursor: crosshair; transition: opacity 280ms ease;
}
.zh-forage.zh-cleaning .zh-forage-canvas { cursor: none; }
.zh-forage.zh-reading { overflow-y: auto; touch-action: pan-y; cursor: pointer; }
.zh-forage.zh-reading .zh-forage-canvas { opacity: 0; pointer-events: none; }

/* ── a ficha: papel velho, amassado, escrito a pena ── */
.zh-note-wrap {
  position: relative; display: none; min-height: 100%; padding: 32px 14px;
  align-items: center; justify-content: center;
}
.zh-forage.zh-reading .zh-note-wrap { display: flex; }
.zh-note {
  position: relative; width: min(400px, 90vw);
  filter: drop-shadow(0 3px 2px rgba(0, 0, 0, 0.25)) drop-shadow(0 14px 22px rgba(0, 0, 0, 0.4));
  transform: rotate(-1.4deg);
}
.zh-note.zh-on { animation: zh-paper-in 760ms cubic-bezier(0.18, 0.85, 0.25, 1) both; }
.zh-note.zh-on.zh-off { animation: zh-paper-out 340ms cubic-bezier(0.5, 0, 0.8, 0.4) both; }
@keyframes zh-paper-in {
  0%   { opacity: 0; transform: perspective(900px) translateY(55vh) rotateX(62deg) rotate(-16deg) scale(0.62); }
  55%  { opacity: 1; transform: perspective(900px) translateY(-12px) rotateX(-7deg) rotate(1.6deg) scale(1.03); }
  78%  { transform: perspective(900px) translateY(3px) rotateX(2deg) rotate(-2deg) scale(0.995); }
  100% { opacity: 1; transform: perspective(900px) rotate(-1.4deg); }
}
@keyframes zh-paper-out {
  0%   { opacity: 1; transform: perspective(900px) rotate(-1.4deg); }
  30%  { opacity: 1; transform: perspective(900px) translateY(-14px) rotate(-3deg) scale(1.02); }
  100% { opacity: 0; transform: perspective(900px) translateY(48vh) rotateX(50deg) rotate(10deg) scale(0.6); }
}
.zh-note-paper {
  position: relative; padding: 26px 26px 30px;
  color: ${INK}; font-family: ${HAND}; font-weight: 600;
  background-color: #e3d1a4; background-size: max(100%, 440px) auto; background-position: center;
  background-repeat: no-repeat;
  text-shadow: 0 0 0.6px rgba(40, 24, 13, 0.55);
}
.zh-note-photo {
  float: left; position: relative; width: min(36%, 124px);
  margin: 0 18px 10px -4px; padding: 6px 6px 18px;
  background: linear-gradient(160deg, #f4ecd6 0%, #e7dcc0 100%);
  box-shadow: 0 1px 1px rgba(40, 24, 8, 0.3), 0 4px 9px rgba(40, 24, 8, 0.32);
  transform: rotate(-4.5deg);
  animation: zh-photo-drop 520ms cubic-bezier(0.2, 0.9, 0.3, 1.25) 520ms both;
}
@keyframes zh-photo-drop {
  0%   { opacity: 0; transform: translate(-10px, -46px) rotate(-22deg) scale(1.35); }
  70%  { opacity: 1; transform: translate(0, 2px) rotate(-3deg) scale(0.98); }
  100% { opacity: 1; transform: rotate(-4.5deg); }
}
.zh-note-shot {
  background: radial-gradient(ellipse at 50% 62%, #cfc39b 0%, #a09372 70%, #857857 100%);
  line-height: 0; box-shadow: inset 0 0 6px rgba(50, 34, 12, 0.45);
}
.zh-note-shot img {
  width: 100%; display: block; image-rendering: pixelated; image-rendering: crisp-edges;
  filter: sepia(0.22) contrast(0.95) saturate(0.9);
}
.zh-note-clip {
  position: absolute; top: -20px; left: 20%; width: 15px; height: 46px;
  transform: rotate(7deg); overflow: visible;
  animation: zh-clip-in 300ms cubic-bezier(0.3, 1.4, 0.5, 1) 900ms both;
}
@keyframes zh-clip-in {
  0%   { opacity: 0; transform: translateY(-16px) rotate(18deg); }
  100% { opacity: 1; transform: rotate(7deg); }
}
.zh-note-name { margin: 6px 0 2px; font-size: clamp(28px, 7.4vw, 36px); line-height: 1.1; font-weight: 700; }
.zh-note-latin {
  position: relative; display: inline-block; margin: 0;
  font-size: clamp(19px, 4.8vw, 22px); line-height: 1.3; opacity: 0.85;
}
.zh-note-edible-row { margin: 10px 0 2px; }
.zh-note-edible {
  position: relative; display: inline-block; padding: 0 0.6em;
  font-size: clamp(19px, 4.8vw, 22px); line-height: 1.35;
}
.zh-note-edible.zh-poison { color: ${INK_RED}; }
.zh-note-notes {
  clear: both; margin: 14px 0 0; padding: 0; list-style: none;
  font-size: clamp(20px, 5.1vw, 23px); line-height: 1.3;
}
.zh-note-notes li { margin: 0 0 6px; }

/* A PENA: cada linha aparece da esquerda para a direita, no ritmo de quem escreve. */
.zh-ink { display: inline-block; animation: zh-write var(--d, 600ms) linear var(--at, 0ms) both; }
@keyframes zh-write {
  0%   { clip-path: inset(-40% 100% -40% -2%); }
  100% { clip-path: inset(-40% -2% -40% -2%); }
}
.zh-stroke { position: absolute; overflow: visible; pointer-events: none; }
.zh-stroke path {
  fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round;
  vector-effect: non-scaling-stroke;
  stroke-dasharray: 1; stroke-dashoffset: 0;
  animation: zh-draw var(--d, 420ms) cubic-bezier(0.4, 0, 0.6, 1) var(--at, 0ms) both;
}
@keyframes zh-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
.zh-stroke.zh-under { left: -2%; width: 104%; bottom: -3px; height: 9px; }
.zh-stroke.zh-ring { left: -10px; top: -7px; width: calc(100% + 22px); height: calc(100% + 13px); }
/* Um toque durante a escrita termina tudo de uma vez: ninguem espera a pena para dobrar o papel. */
.zh-note.zh-done .zh-ink, .zh-note.zh-done .zh-stroke path,
.zh-note.zh-done .zh-note-photo, .zh-note.zh-done .zh-note-clip { animation: none; }
`;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

export interface ForagingCallbacks {
  /** O gesto saiu fora da altura certa (a faca segue andando). */
  onMiss: () => void;
  /** O corte: o pop. */
  onCut: () => void;
  /** Terra escorrendo da bucha (chamado no máximo algumas vezes por segundo). */
  onSand: () => void;
  /** Limpo. */
  onClean: () => void;
  /** O cogumelo desce para a bolsa. */
  onStash: () => void;
  /** A ficha abre. */
  onNote: () => void;
  /** A ficha fechou: o cogumelo vai para a cesta. */
  onDone: () => void;
  /** Saiu antes do corte: o cogumelo continua no chão. */
  onCancel: () => void;
}

type Stage = 'intro' | 'aim' | 'pop' | 'clean' | 'shine' | 'stash' | 'note' | 'closing';

const CS = CLOSE_SIZE;
const INTRO_TIME = 0.6;
/** Uma ida e volta inteira da faca, em segundos: devagar o bastante para o polegar. */
const AIM_PERIOD = 2.6;
/** O quadro congelado do corte: o golpe "pesa" antes de explodir. */
const HITSTOP = 0.07;
const POP_TIME = 0.8;
const SHINE_TIME = 1.0;
const STASH_TIME = 0.5;
/** A bucha: o tamanho que ela apaga (meia largura e meia altura, em pixels da arte). */
const SPONGE_RX = 3.4;
const SPONGE_RY = 2.4;
const SPONGE_SPEED = 20;
/** Quantos grãos de areia cada pixel de terra vira, e o tamanho de cada um (em pixels da arte). */
const GRAINS_PER_PIXEL = 3;
const GRAIN = 1 / 3;
const GRAVITY = 70;
/** Sobrando isto (fração da terra inicial), o resto cai sozinho: a última migalha não vira caça. */
const CLEAN_LEFT = 0.03;
/** Quando a pena começa (o papel já assentou) e o ritmo dela. */
const WRITE_START_MS = 760;
const WRITE_MS_PER_CHAR = 26;

const ACTION_CODES = new Set(['KeyZ', 'KeyJ', 'Space', 'KeyX', 'KeyK', 'Enter', 'NumpadEnter']);

/** A paleta de cada tipo de sujeira — tirada dos tiles do jogo, com um tom a mais de sombra. */
const DIRT_COLORS: Readonly<Record<DirtKind, readonly [string, string, string]>> = {
  soil: ['#3b2a1e', '#5a4330', '#2a1d14'],
  needle: ['#6b5a32', '#8a7442', '#4f4224'],
  leaf: ['#a8642c', '#7d4a22', '#5e3618'],
  grass: ['#4d6b2e', '#6f8f3c', '#36501f'],
  sand: ['#c9b48a', '#a8956a', '#8a7a55'],
  moss: ['#4f6a2c', '#7f9a44', '#3a5020'],
};

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

interface Grain { x: number; y: number; vx: number; vy: number; c: string; age: number }
interface Spark { x: number; y: number; at: number; c: string }
interface Crumb { x: number; y: number; vx: number; vy: number; c: string; life: number }
interface Box { x0: number; y0: number; x1: number; y1: number }

const clamp01 = (k: number): number => Math.max(0, Math.min(1, k));
const easeOut = (k: number): number => 1 - (1 - k) * (1 - k);
const easeOutBack = (k: number): number => {
  const c1 = 1.9;
  return 1 + (c1 + 1) * (k - 1) ** 3 + c1 * (k - 1) ** 2;
};

export class ForagingOverlay {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly note: HTMLDivElement;
  /** Quando a pena termina de escrever (ms desde que o papel abriu). */
  private writeEndMs = 0;

  private readonly art: HTMLCanvasElement;
  private readonly pixels: Uint8ClampedArray;
  private readonly mask: Uint8Array;
  private readonly spec: (typeof FUNGUS_SPECS)[MushroomKind];
  private readonly artBox: Box;
  private readonly zoneTop: number;
  private readonly zoneBottom: number;
  private readonly aimTop: number;
  private readonly aimBottom: number;
  /** A faca: onde a lâmina começa e termina (x), e onde o cabo termina. */
  private readonly bladeL: number;
  private readonly bladeR: number;
  private readonly handleR: number;
  /** O que tem de caber na tela: o cogumelo inteiro e a faca, nas duas pontas do curso dela. */
  private readonly fitBox: Box;

  private stage: Stage = 'intro';
  private clock = 0;
  private stageClock = 0;
  private aimClock = 0;
  private freeze = 0;
  private knifeY: number;
  private cutY = 0;
  private shake = 0;
  private bump = 0;
  private recoil = 0;
  private wobble = 0;
  /** A vista: pixels do aparelho por pixel da arte, e o ponto da arte no centro da tela. */
  private scale = 1;
  private view = { x: CS / 2, y: CS / 2 };
  private viewFrom = { x: CS / 2, y: CS / 2 };
  private viewTo = { x: CS / 2, y: CS / 2 };

  /** A terra sobre o cogumelo (null = nada, senão a cor); o contorno roxo é refeito ao apagar. */
  private readonly dirt = new Array<string | null>(CS * CS).fill(null);
  private readonly dirtEdge = new Uint8Array(CS * CS);
  private dirtLeft = 0;
  private dirtStart = 0;
  private readonly grains: Grain[] = [];
  private readonly crumbs: Crumb[] = [];
  private readonly sparks: Spark[] = [];
  private ring = -1;
  private sponge = { x: 0, y: 0 };
  /** Para onde e quão rápido a bucha anda: ela estica no sentido do movimento. */
  private spongeVel = { x: 0, y: 0 };
  private spongeShown = false;
  private lastSand = -1;
  private readonly held = new Set<string>();
  private pointer: { id: number; down: boolean } | null = null;

  private raf = 0;
  private lastNow = 0;
  private closed = false;

  public constructor(
    private readonly kind: MushroomKind,
    private readonly cb: ForagingCallbacks,
    private readonly touch: boolean,
  ) {
    ensureStyle();
    // A letra da ficha vem de um arquivo: pedida agora, ela já chegou quando o papel abrir.
    void document.fonts?.load(`16px ${HAND}`).catch(() => undefined);
    this.spec = FUNGUS_SPECS[kind];
    const close = fungusCloseUp(kind);
    this.art = close.bare;
    this.mask = close.mask;
    this.pixels = this.art.getContext('2d')?.getImageData(0, 0, CS, CS).data ?? new Uint8ClampedArray(CS * CS * 4);
    this.artBox = this.boxOfRows(0, CS);
    this.zoneTop = this.spec.cut.from * CS;
    this.zoneBottom = this.spec.cut.to * CS;
    this.aimTop = Math.max(this.artBox.y0 + 2, 0.46 * CS);
    this.aimBottom = Math.max(this.zoneBottom + 2, this.artBox.y1 + 1);
    this.knifeY = this.aimTop;
    const span = this.stemSpan(Math.round((this.zoneTop + this.zoneBottom) / 2));
    this.bladeL = span.left - 6;
    this.bladeR = span.right + 2;
    this.handleR = this.bladeR + 13;
    this.fitBox = {
      x0: Math.min(this.artBox.x0, this.bladeL - 1), x1: Math.max(this.artBox.x1, this.handleR + 1),
      y0: this.artBox.y0, y1: Math.max(this.artBox.y1, this.aimBottom + 3),
    };
    this.view = { x: (this.fitBox.x0 + this.fitBox.x1) / 2, y: (this.fitBox.y0 + this.fitBox.y1) / 2 };
    this.viewFrom = { ...this.view };
    this.viewTo = { ...this.view };

    this.root = document.createElement('div');
    this.root.className = 'zh-forage';
    // O andar por toque escuta a JANELA; sem esta marca, esfregar com o dedo plantaria a ancora.
    this.root.setAttribute('data-zh-ui', '');
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', t(`items.name.${kind}`));
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'zh-forage-canvas';
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('ForagingOverlay: no 2d context');
    this.ctx = ctx;
    this.note = this.buildNote();
    const wrap = document.createElement('div');
    wrap.className = 'zh-note-wrap';
    wrap.appendChild(this.note);
    this.root.append(this.canvas, wrap);
    document.body.appendChild(this.root);
    this.resize();

    this.root.addEventListener('pointerdown', this.onPointerDown);
    this.root.addEventListener('pointermove', this.onPointerMove);
    this.root.addEventListener('pointerup', this.onPointerUp);
    this.root.addEventListener('pointercancel', this.onPointerUp);
    this.root.addEventListener('pointerleave', this.onPointerLeave);
    this.root.addEventListener('click', this.onClick);
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('resize', this.resize);

    requestAnimationFrame(() => { if (!this.closed) this.root.classList.add('zh-in'); });
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  public destroy(): void {
    if (this.closed) return;
    this.closed = true;
    window.cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    window.removeEventListener('resize', this.resize);
    this.root.remove();
  }

  // ── estágios ───────────────────────────────────────────────────────────────

  private enter(stage: Stage): void {
    this.stage = stage;
    this.stageClock = 0;
    this.root.classList.toggle('zh-cleaning', stage === 'clean');
    if (stage === 'note') {
      this.root.classList.add('zh-reading');
      this.note.classList.add('zh-on');
      this.cb.onNote();
    }
  }

  /** ESC antes do corte: o cogumelo encolhe de volta, o foco volta, e ele continua no chão. */
  private cancel(): void {
    if (this.stage !== 'aim' && this.stage !== 'intro') return;
    this.enter('closing');
    this.root.classList.remove('zh-in');
    this.canvas.style.opacity = '0';
    window.setTimeout(() => {
      if (this.closed) return;
      this.destroy();
      this.cb.onCancel();
    }, 260);
  }

  /**
   * O toque na ficha: durante a escrita ele TERMINA a escrita; escrita pronta, ele dobra o
   * papel, o embaçado volta ao foco, e só então o cogumelo entra na cesta.
   */
  private closeNote(): void {
    if (this.stage !== 'note') return;
    const elapsed = this.stageClock * 1000;
    if (elapsed < this.writeEndMs && !this.note.classList.contains('zh-done')) {
      if (elapsed > 300) this.note.classList.add('zh-done');
      return;
    }
    if (elapsed < 450) return;
    this.enter('closing');
    this.note.classList.add('zh-off');
    this.root.classList.remove('zh-in');
    window.setTimeout(() => {
      if (this.closed) return;
      this.destroy();
      this.cb.onDone();
    }, 340);
  }

  /** O gesto do botão: cada estágio o lê de um jeito. */
  private act(): void {
    if (this.stage === 'aim') this.tryCut();
    else if (this.stage === 'note') this.closeNote();
  }

  private tryCut(): void {
    const y = this.knifeY;
    if (y < this.zoneTop || y > this.zoneBottom) {
      this.shake = 0.3;
      this.recoil = 1;
      this.wobble = 1;
      this.cb.onMiss();
      return;
    }
    this.cutY = Math.max(this.artBox.y0 + 2, Math.min(CS, Math.round(y)));
    this.knifeY = this.cutY;
    this.cb.onCut();
    this.freeze = HITSTOP;
    this.bump = 1;
    // As migalhas saem da linha do corte, na cor da carne que a faca atravessou.
    const span = this.stemSpan(this.cutY);
    for (let i = 0; i < 14; i += 1) {
      const x = span.left + Math.random() * Math.max(1, span.right - span.left);
      this.crumbs.push({
        x, y: this.cutY,
        vx: (Math.random() - 0.5) * 38, vy: -Math.random() * 30 - 8,
        c: this.colorAt(Math.floor(x), this.cutY - 1) ?? '#efe6d2', life: 0.6 + Math.random() * 0.35,
      });
    }
    this.ring = 0;
    const piece = this.boxOfRows(0, this.cutY);
    this.viewFrom = { ...this.view };
    this.viewTo = { x: (piece.x0 + piece.x1) / 2, y: (piece.y0 + piece.y1) / 2 };
    this.seedDirt();
    this.enter('pop');
  }

  // ── entrada ────────────────────────────────────────────────────────────────

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.closed) return;
    const code = event.code;
    let handled = true;
    if (code === 'Escape') {
      if (this.stage === 'note') this.closeNote();
      else this.cancel();
    } else if (ACTION_CODES.has(code)) {
      if (!event.repeat) this.act();
    } else if (code === 'ArrowLeft' || code === 'KeyA') {
      this.held.add('left');
    } else if (code === 'ArrowRight' || code === 'KeyD') {
      this.held.add('right');
    } else if (code === 'ArrowUp' || code === 'KeyW') {
      this.held.add('up');
    } else if (code === 'ArrowDown' || code === 'KeyS') {
      this.held.add('down');
    } else {
      handled = false;
    }
    if (handled) {
      // So o KEYDOWN e engolido. O keyup segue para o Phaser: uma seta que estava apertada
      // quando a tela abriu (o heroi encostado no cogumelo) precisa soltar la tambem, senao ele
      // sai andando sozinho quando a tela fecha.
      event.preventDefault();
      event.stopPropagation();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const code = event.code;
    if (code === 'ArrowLeft' || code === 'KeyA') this.held.delete('left');
    else if (code === 'ArrowRight' || code === 'KeyD') this.held.delete('right');
    else if (code === 'ArrowUp' || code === 'KeyW') this.held.delete('up');
    else if (code === 'ArrowDown' || code === 'KeyS') this.held.delete('down');
  };

  /** Da tela para o pixel da arte. */
  private toArt(event: PointerEvent): { x: number; y: number } {
    const dpr = this.canvas.width / Math.max(1, this.root.clientWidth);
    const o = this.origin();
    return {
      x: (event.clientX * dpr - o.x) / this.scale,
      y: (event.clientY * dpr - o.y) / this.scale,
    };
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    // Na ficha quem fecha e o CLIQUE (onClick): um dedo rolando um papel comprido nao pode dobra-lo.
    if (this.stage === 'note' || this.stage === 'closing') return;
    event.preventDefault();
    this.pointer = { id: event.pointerId, down: true };
    try { this.root.setPointerCapture(event.pointerId); } catch { /* sem captura, segue igual */ }
    if (this.stage === 'aim') { this.act(); return; }
    if (this.stage === 'clean') {
      const p = this.toArt(event);
      // O dedo PEGA a bucha onde tocou (sem arrastar um rastro ate la); o mouse ja vinha com ela.
      if (this.touch || event.pointerType !== 'mouse') this.sponge = p;
      this.spongeShown = true;
      this.scrubTo(p.x, p.y);
    }
  };

  private readonly onClick = (): void => {
    if (this.stage === 'note') this.closeNote();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.stage !== 'clean') return;
    const p = this.toArt(event);
    const pressed = this.pointer?.id === event.pointerId && this.pointer.down;
    if (event.pointerType === 'mouse' && !pressed) {
      // O mouse carrega a bucha sem esfregar; esfrega com o botao apertado, como uma borracha.
      this.trackSponge(p.x, p.y);
      this.sponge = p;
      this.spongeShown = true;
      return;
    }
    if (pressed) this.scrubTo(p.x, p.y);
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.pointer?.id === event.pointerId) this.pointer = null;
  };

  private readonly onPointerLeave = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && !this.pointer && this.stage === 'clean') this.spongeShown = false;
  };

  // ── a arte ─────────────────────────────────────────────────────────────────

  private colorAt(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= CS || y >= CS) return null;
    const i = (y * CS + x) * 4;
    if (this.pixels[i + 3] === 0) return null;
    return `rgb(${this.pixels[i]},${this.pixels[i + 1]},${this.pixels[i + 2]})`;
  }

  /** A caixa do que está pintado entre as linhas `top` (inclusive) e `bottom` (exclusive). */
  private boxOfRows(top: number, bottom: number): Box {
    let x0 = CS;
    let y0 = CS;
    let x1 = 0;
    let y1 = 0;
    for (let y = Math.max(0, top); y < Math.min(CS, bottom); y += 1) {
      for (let x = 0; x < CS; x += 1) {
        if (this.pixels[(y * CS + x) * 4 + 3] === 0) continue;
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
  private stemSpan(row: number): { left: number; right: number } {
    const y = Math.max(0, Math.min(CS - 1, row));
    let left = -1;
    let right = -1;
    for (let x = 0; x < CS; x += 1) {
      if (this.pixels[(y * CS + x) * 4 + 3] === 0) continue;
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
  private seedDirt(): void {
    const rand = seededRandom((Date.now() & 0xffff) ^ (this.kind.length * 7919));
    const spots: number[] = [];
    for (let y = 1; y < this.cutY - 1; y += 1) {
      for (let x = 1; x < CS - 1; x += 1) if (this.mask[y * CS + x]) spots.push(y * CS + x);
    }
    if (spots.length === 0) return;
    const patches = 5 + Math.floor(rand() * 3);
    for (let p = 0; p < patches; p += 1) {
      const seed = spots[Math.floor(rand() * spots.length)];
      const cx = seed % CS;
      const cy = Math.floor(seed / CS);
      const pal = DIRT_COLORS[this.spec.dirt[p % this.spec.dirt.length]];
      const r = 1.8 + rand() * 1.8;
      for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y += 1) {
        for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x += 1) {
          if (x < 0 || y < 0 || x >= CS || y >= this.cutY) continue;
          const i = y * CS + x;
          if (!this.mask[i]) continue;
          // A borda roída: a mancha é um borrão de terra, não um círculo.
          const d = Math.hypot(x - cx, (y - cy) * 1.15) + (rand() - 0.5) * 1.6;
          if (d > r) continue;
          const roll = rand();
          this.dirt[i] = roll < 0.5 ? pal[0] : roll < 0.8 ? pal[1] : pal[2];
        }
      }
    }
    this.dirtLeft = this.dirt.reduce((n, c) => n + (c ? 1 : 0), 0);
    this.dirtStart = this.dirtLeft;
    this.refreshEdge();
  }

  /** O contorno roxo de "pegue isto" em volta de cada mancha: um pixel por fora da terra. */
  private refreshEdge(): void {
    this.dirtEdge.fill(0);
    for (let y = 0; y < CS; y += 1) {
      for (let x = 0; x < CS; x += 1) {
        const i = y * CS + x;
        if (this.dirt[i]) continue;
        const near = (x > 0 && this.dirt[i - 1]) || (x < CS - 1 && this.dirt[i + 1])
          || (y > 0 && this.dirt[i - CS]) || (y < CS - 1 && this.dirt[i + CS]);
        if (near) this.dirtEdge[i] = 1;
      }
    }
  }

  private trackSponge(x: number, y: number): void {
    const dx = x - this.sponge.x;
    const dy = y - this.sponge.y;
    this.spongeVel = { x: this.spongeVel.x * 0.5 + dx * 0.5, y: this.spongeVel.y * 0.5 + dy * 0.5 };
  }

  /** A bucha anda até (x, y) apagando tudo pelo caminho — a borracha do Paint. */
  private scrubTo(x: number, y: number): void {
    const from = this.sponge;
    this.trackSponge(x, y);
    const steps = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) * 2));
    let erased = 0;
    for (let s = 1; s <= steps; s += 1) {
      const k = s / steps;
      erased += this.eraseAt(from.x + (x - from.x) * k, from.y + (y - from.y) * k, x - from.x);
    }
    this.sponge = { x, y };
    if (erased > 0) this.afterErase(erased);
  }

  private eraseAt(cx: number, cy: number, dirX: number): number {
    if (this.stage !== 'clean') return 0;
    let n = 0;
    for (let y = Math.floor(cy - SPONGE_RY); y <= Math.ceil(cy + SPONGE_RY); y += 1) {
      for (let x = Math.floor(cx - SPONGE_RX); x <= Math.ceil(cx + SPONGE_RX); x += 1) {
        if (x < 0 || y < 0 || x >= CS || y >= CS) continue;
        const dx = (x + 0.5 - cx) / SPONGE_RX;
        const dy = (y + 0.5 - cy) / SPONGE_RY;
        if (dx * dx + dy * dy > 1) continue;
        const i = y * CS + x;
        const c = this.dirt[i];
        if (!c) continue;
        this.dirt[i] = null;
        this.shed(x, y, c, dirX);
        n += 1;
      }
    }
    return n;
  }

  /** Um pixel de terra vira areia: grãozinhos que escorrem (alguns levantam um fio de pó) e caem. */
  private shed(x: number, y: number, c: string, dirX: number): void {
    if (this.grains.length > 900) this.grains.splice(0, this.grains.length - 900);
    for (let g = 0; g < GRAINS_PER_PIXEL; g += 1) {
      const puff = Math.random() < 0.18;
      this.grains.push({
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
    if (this.clock - this.lastSand > 0.07) {
      this.lastSand = this.clock;
      this.cb.onSand();
    }
    if (this.dirtLeft <= Math.max(2, Math.floor(this.dirtStart * CLEAN_LEFT))) {
      // A última migalha cai sozinha: limpar é gostoso, caçar o pixel que sobrou não é.
      for (let i = 0; i < this.dirt.length; i += 1) {
        const c = this.dirt[i];
        if (!c) continue;
        this.dirt[i] = null;
        this.shed(i % CS, Math.floor(i / CS), c, 0);
      }
      this.dirtLeft = 0;
      this.refreshEdge();
      this.startShine();
    }
  }

  private startShine(): void {
    const piece = this.boxOfRows(0, this.cutY);
    const colors = ['#ffffff', '#ffe066', '#fff6d0'];
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
      const rx = (piece.x1 - piece.x0) / 2 + 3 + Math.random() * 4;
      const ry = (piece.y1 - piece.y0) / 2 + 2 + Math.random() * 4;
      this.sparks.push({
        x: (piece.x0 + piece.x1) / 2 + Math.cos(a) * rx,
        y: (piece.y0 + piece.y1) / 2 + Math.sin(a) * ry,
        at: 0.05 + i * 0.06, c: colors[i % colors.length],
      });
    }
    this.cb.onClean();
    this.enter('shine');
  }

  // ── o quadro ───────────────────────────────────────────────────────────────

  private readonly resize = (): void => {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.root.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.root.clientHeight * dpr));
    this.canvas.width = w;
    this.canvas.height = h;
    // O MAIOR QUE COUBER, em escala inteira (pixel art não aceita pixel quebrado): o cogumelo e a
    // faca inteiros dentro da tela, com um respiro em volta.
    const fw = this.fitBox.x1 - this.fitBox.x0;
    const fh = this.fitBox.y1 - this.fitBox.y0;
    this.scale = Math.max(1, Math.floor(Math.min((w * 0.92) / fw, (h * 0.84) / fh)));
  };

  /** Onde o pixel (0, 0) da arte cai na tela. */
  private origin(): { x: number; y: number } {
    const sx = this.shake > 0 ? Math.sin(this.clock * 70) * 0.7 * (this.shake / 0.3) : 0;
    const sy = this.bump > 0 ? Math.sin(this.bump * Math.PI) * 0.8 : 0;
    return {
      x: Math.round(this.canvas.width / 2 - this.scale * (this.view.x - sx)),
      y: Math.round(this.canvas.height / 2 - this.scale * (this.view.y - sy)),
    };
  }

  private readonly frame = (now: number): void => {
    if (this.closed) return;
    let dt = Math.min(0.05, (now - this.lastNow) / 1000);
    this.lastNow = now;
    // O quadro congelado do corte: o mundo da colheita para um instante, e então tudo explode.
    if (this.freeze > 0) {
      this.freeze -= dt;
      dt = 0;
    }
    this.clock += dt;
    this.stageClock += dt;
    this.update(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt);
    this.bump = Math.max(0, this.bump - dt * 5);
    this.recoil = Math.max(0, this.recoil - dt * 4);
    this.wobble = Math.max(0, this.wobble - dt * 3);
    this.spongeVel = { x: this.spongeVel.x * (1 - Math.min(1, dt * 10)), y: this.spongeVel.y * (1 - Math.min(1, dt * 10)) };
    if (this.stage === 'intro' && this.stageClock >= INTRO_TIME) this.enter('aim');
    if (this.stage === 'aim') {
      // A faca em vai-e-vem triangular: velocidade constante, nada de freada que engane o olho.
      // Começa no alto, de onde ela entrou.
      this.aimClock += dt;
      const phase = (this.aimClock % AIM_PERIOD) / AIM_PERIOD;
      const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
      this.knifeY = this.aimTop + (this.aimBottom - this.aimTop) * tri;
    }
    if (this.stage === 'pop') {
      const k = easeOut(clamp01((this.stageClock - 0.1) / 0.5));
      this.view = {
        x: this.viewFrom.x + (this.viewTo.x - this.viewFrom.x) * k,
        y: this.viewFrom.y + (this.viewTo.y - this.viewFrom.y) * k,
      };
      if (this.stageClock >= POP_TIME) {
        this.enter('clean');
        const piece = this.boxOfRows(0, this.cutY);
        // A bucha começa ao lado do cogumelo, na mão: vista, mas sem tapar a terra — e DENTRO da
        // tela (no celular em pé o lado direito do cogumelo já é quase a borda).
        const o = this.origin();
        const rightEdge = (this.canvas.width - o.x) / this.scale - 6;
        this.sponge = { x: Math.min(piece.x1 + 4, rightEdge), y: (piece.y0 + piece.y1) / 2 };
        this.spongeShown = true;
      }
    }
    if (this.ring >= 0) this.ring += dt;
    if (this.ring > 0.45) this.ring = -1;
    for (let i = this.crumbs.length - 1; i >= 0; i -= 1) {
      const c = this.crumbs[i];
      c.life -= dt;
      c.vy += GRAVITY * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.life <= 0) this.crumbs.splice(i, 1);
    }
    if (this.stage === 'clean') {
      const vx = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
      const vy = (this.held.has('down') ? 1 : 0) - (this.held.has('up') ? 1 : 0);
      if (vx || vy) {
        const len = Math.hypot(vx, vy);
        const step = (SPONGE_SPEED * dt) / len;
        const x = Math.max(-6, Math.min(CS + 6, this.sponge.x + vx * step));
        const y = Math.max(-6, Math.min(CS + 6, this.sponge.y + vy * step));
        this.spongeShown = true;
        this.scrubTo(x, y);
      }
    }
    const bottom = (this.canvas.height - this.origin().y) / this.scale + 2;
    for (let i = this.grains.length - 1; i >= 0; i -= 1) {
      const g = this.grains[i];
      g.age += dt;
      g.vy += GRAVITY * dt;
      g.vx *= 1 - Math.min(1, dt * 1.5);
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      if (g.y > bottom || g.age > 3) this.grains.splice(i, 1);
    }
    if (this.stage === 'shine' && this.stageClock >= SHINE_TIME) {
      this.cb.onStash();
      this.enter('stash');
    }
    if (this.stage === 'stash' && this.stageClock >= STASH_TIME) this.enter('note');
  }

  private px(x: number, y: number, w: number, h: number, c: string): void {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(x, y, w, h);
  }

  private draw(): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.stage === 'note') return;
    ctx.imageSmoothingEnabled = false;
    const o = this.origin();
    ctx.setTransform(this.scale, 0, 0, this.scale, o.x, o.y);

    if (this.stage === 'intro' || this.stage === 'aim' || (this.stage === 'closing' && this.cutY === 0)) {
      this.drawWhole();
      this.drawKnife();
      return;
    }

    if (this.stage === 'pop') this.drawStub();
    this.drawPiece();
    if (this.stage === 'pop') this.drawKnife();
    for (const c of this.crumbs) {
      ctx.globalAlpha = Math.min(1, c.life * 2.5);
      this.px(Math.round(c.x), Math.round(c.y), 1, 1, c.c);
    }
    ctx.globalAlpha = 1;
    this.drawRing();
    for (const g of this.grains) {
      ctx.globalAlpha = g.age > 1.6 ? Math.max(0, 1 - (g.age - 1.6) / 1.4) : 1;
      this.px(Math.round(g.x * 3) / 3, Math.round(g.y * 3) / 3, GRAIN, GRAIN, g.c);
    }
    ctx.globalAlpha = 1;
    if (this.stage === 'shine') this.drawSparks();
    if (this.stage === 'clean' && this.spongeShown) this.drawSponge();
  }

  /**
   * O COGUMELO INTEIRO, antes do corte: na entrada ele BROTA (cresce do pé com um elástico que
   * passa do ponto e volta), parado ele RESPIRA, e um erro o faz tremer. Sempre pelo pé: ele está
   * plantado, nada nele sai do lugar.
   */
  private drawWhole(): void {
    const ctx = this.ctx;
    const pivotX = (this.artBox.x0 + this.artBox.x1) / 2;
    const pivotY = this.artBox.y1;
    let sx = 1;
    let sy = 1;
    let alpha = 1;
    if (this.stage === 'intro') {
      const k = clamp01(this.stageClock / 0.5);
      const grow = easeOutBack(k);
      const squash = 0.16 * Math.sin(k * Math.PI);
      sx = grow * (1 - squash);
      sy = grow * (1 + squash);
      alpha = clamp01(k * 4);
    } else if (this.stage === 'closing') {
      const k = clamp01(this.stageClock / 0.25);
      sx = sy = 1 - easeOut(k);
      alpha = 1 - k;
    } else {
      const b = Math.sin(this.clock * 2.4);
      sx = 1 - 0.01 * b;
      sy = 1 + 0.02 * b;
    }
    if (this.wobble > 0) {
      const w = Math.sin(this.clock * 42) * 0.07 * this.wobble;
      sx += w;
      sy -= w;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pivotX, pivotY);
    ctx.scale(Math.max(0.001, sx), Math.max(0.001, sy));
    ctx.translate(-pivotX, -pivotY);
    ctx.drawImage(this.art, 0, 0);
    ctx.restore();
  }

  /**
   * O PEDAÇO COLHIDO com o "juice" de cada momento: o pulinho do corte (estica subindo, amassa
   * ao cair), a terra assentando, o boing de limpo, e a queda girando para dentro da bolsa.
   */
  private drawPiece(): void {
    const ctx = this.ctx;
    const piece = this.boxOfRows(0, this.cutY);
    const pivotX = (piece.x0 + piece.x1) / 2;
    const pivotY = this.cutY;
    let dx = 0;
    let dy = 0;
    let sx = 1;
    let sy = 1;
    let rot = 0;
    let alpha = 1;
    let dirtAlpha = 1;
    const tc = this.stageClock;
    if (this.stage === 'pop') {
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
    } else if (this.stage === 'shine') {
      const w = 0.14 * Math.sin(tc * 19) * Math.exp(-tc * 4.5);
      sx = 1 - w;
      sy = 1 + w;
      dy = -Math.max(0, Math.sin(clamp01(tc / 0.32) * Math.PI)) * 4;
    } else if (this.stage === 'stash') {
      // Um saltinho e cai girando, encolhendo, para dentro da bolsa (lá embaixo).
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
    ctx.drawImage(this.art, 0, 0, CS, this.cutY, 0, 0, CS, this.cutY);
    if ((this.stage === 'clean' || this.stage === 'pop') && dirtAlpha > 0) {
      ctx.globalAlpha = alpha * dirtAlpha;
      for (let i = 0; i < this.dirt.length; i += 1) {
        const x = i % CS;
        const y = Math.floor(i / CS);
        const c = this.dirt[i];
        if (c) this.px(x, y, 1, 1, c);
        else if (this.dirtEdge[i]) this.px(x, y, 1, 1, PICK_OUTLINE);
      }
    }
    if (this.stage === 'shine') {
      // O brilho de limpo: um clarão branco por cima da arte, que se apaga.
      const flash = Math.max(0, 0.6 - tc * 1.5);
      if (flash > 0) {
        ctx.globalAlpha = flash;
        ctx.globalCompositeOperation = 'source-atop';
        this.px(0, 0, CS, this.cutY, '#ffffff');
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();
  }

  /** O toco que ficou abaixo do corte: cai girando de leve e some (o chão não está na tela). */
  private drawStub(): void {
    const ctx = this.ctx;
    const k = this.stageClock;
    if (this.cutY >= CS) return;
    const drop = 0.5 * GRAVITY * k * k;
    const pivotX = (this.artBox.x0 + this.artBox.x1) / 2;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - k * 2);
    ctx.translate(pivotX, this.cutY + drop);
    ctx.rotate(-k * 0.5);
    ctx.translate(-pivotX, -this.cutY);
    ctx.drawImage(this.art, 0, this.cutY, CS, CS - this.cutY, 0, this.cutY, CS, CS - this.cutY);
    ctx.restore();
  }

  /** O anel do POP: um aro claro que se abre a partir do corte, e o risco branco do fio. */
  private drawRing(): void {
    if (this.ring < 0) return;
    const ctx = this.ctx;
    const span = this.stemSpan(this.cutY - 1);
    const cx = (span.left + span.right) / 2;
    const k = this.ring / 0.45;
    const r = 2 + easeOut(k) * 13;
    ctx.globalAlpha = Math.max(0, 1 - k);
    const dots = 24;
    for (let a = 0; a < dots; a += 1) {
      const ang = (a / dots) * Math.PI * 2;
      this.px(Math.round(cx + Math.cos(ang) * r), Math.round(this.cutY + Math.sin(ang) * r * 0.55), 1, 1, '#fff6d8');
    }
    // O risco do fio da faca atravessando, que se estica para os lados e some.
    if (k < 0.35) {
      const w = (span.right - span.left) + 4 + k * 30;
      ctx.globalAlpha = 1 - k / 0.35;
      this.px(cx - w / 2, this.cutY - 1, w, 1, '#ffffff');
    }
    ctx.globalAlpha = 1;
  }

  /** As estrelinhas de limpo: cruzinhas que piscam em volta, cada uma no seu tempo. */
  private drawSparks(): void {
    const ctx = this.ctx;
    for (const s of this.sparks) {
      const k = (this.stageClock - s.at) / 0.55;
      if (k <= 0 || k >= 1) continue;
      const size = k < 0.5 ? 1 + Math.round(k * 4) : 1 + Math.round((1 - k) * 4);
      const x = Math.round(s.x);
      const y = Math.round(s.y - k * 2);
      ctx.globalAlpha = 1 - k * 0.3;
      this.px(x - size, y, size * 2 + 1, 1, s.c);
      this.px(x, y - size, 1, size * 2 + 1, s.c);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * A faca deitada, na arte da faca da mochila. Entra deslizando da direita depois que o cogumelo
   * brota; na altura certa a lâmina ACENDE e um brilho corre por ela (o único aviso, e ele mora na
   * faca); um erro a faz recuar; o corte a leva direto, atravessando, e ela some.
   */
  private drawKnife(): void {
    const ctx = this.ctx;
    let ox = 0;
    let alpha = 1;
    if (this.stage === 'intro') {
      const k = clamp01((this.stageClock - 0.18) / 0.42);
      ox = (1 - easeOutBack(k)) * 34;
      alpha = clamp01(k * 3);
    } else if (this.stage === 'closing') {
      const k = clamp01(this.stageClock / 0.25);
      ox = easeOut(k) * 30;
      alpha = 1 - k;
    } else if (this.stage === 'pop') {
      const k = clamp01(this.stageClock / 0.22);
      if (k >= 1) return;
      ox = -k * k * 40;
      alpha = 1 - k;
    }
    ox += this.recoil * 5 * Math.abs(Math.sin(this.recoil * Math.PI));
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(ox), 0);
    const y = Math.round(this.knifeY);
    const inZone = this.stage === 'aim' && this.knifeY >= this.zoneTop && this.knifeY <= this.zoneBottom;
    const x0 = this.bladeL;
    const x1 = this.bladeR;
    this.px(x0 - 1, y - 2, x1 - x0 + 2, 4, NAVY);
    this.px(x0, y - 1, x1 - x0, 1, inZone ? '#ffffff' : '#d7dee0');
    this.px(x0, y, x1 - x0, 1, inZone ? '#e9f2f4' : '#98a2a7');
    if (inZone) {
      const glint = x0 + Math.floor((this.clock * 40) % Math.max(1, x1 - x0));
      this.px(glint, y - 2, 1, 1, '#fffbe6');
      this.px(glint - 1, y - 1, 3, 1, '#fffbe6');
    }
    this.px(x1, y - 2, 2, 4, '#c9a24a');                   // virola de latão
    this.px(x1 + 2, y - 2, 9, 4, '#8a5a32');               // cabo
    this.px(x1 + 2, y + 1, 9, 1, '#5e3b1e');
    this.px(x1 + 11, y - 3, 2, 6, '#3b2a1c');              // a escova do cabo
    this.px(x1 + 2, y - 3, 11, 1, NAVY);
    this.px(x1 + 2, y + 2, 11, 1, NAVY);
    this.px(x1 + 13, y - 3, 1, 6, NAVY);
    ctx.restore();
  }

  /**
   * A bucha na mão: um ovalzinho trançado, com o contorno de tinta do jogo. Ela ESTICA no sentido
   * em que anda e amassa quando o dedo/botão aperta — é a massa dela que vende o esfregar.
   */
  private drawSponge(): void {
    const ctx = this.ctx;
    const w = SPONGE[0].length;
    const h = SPONGE.length;
    const cx = Math.round(this.sponge.x);
    const cy = Math.round(this.sponge.y);
    const speed = Math.min(1, Math.hypot(this.spongeVel.x, this.spongeVel.y) / 2.5);
    const ang = Math.atan2(this.spongeVel.y, this.spongeVel.x);
    const pressed = this.pointer?.down === true || this.held.size > 0;
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
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) this.px(x, y, 1, 1, NAVY);
      }
    }
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const c = SPONGE[y][x];
        if (c === '.') continue;
        this.px(x, y, 1, 1, c === 'o' ? SPONGE_HOLE : SPONGE_BASE);
      }
    }
    ctx.restore();
  }

  // ── a ficha ────────────────────────────────────────────────────────────────

  /**
   * O PAPEL: velho, amassado, com a borda rasgada à mão, escrito com pena — e a fotinha do
   * cogumelo presa por um clipe. Nada aqui é botão, moldura ou etiqueta de interface. Cada linha
   * ganha o seu tempo de pena, em sequência, proporcional ao tamanho dela.
   */
  private buildNote(): HTMLDivElement {
    const species = `fungi.species.${this.kind}`;
    const note = document.createElement('div');
    note.className = 'zh-note';
    const paper = document.createElement('div');
    paper.className = 'zh-note-paper';
    paper.style.clipPath = tornEdge(seedOf(this.kind));
    const texture = paperTexture();
    if (texture) paper.style.backgroundImage = `url(${texture})`;

    const photo = document.createElement('div');
    photo.className = 'zh-note-photo';
    const shot = document.createElement('div');
    shot.className = 'zh-note-shot';
    const img = document.createElement('img');
    img.src = this.art.toDataURL();
    img.alt = t(`items.name.${this.kind}`);
    shot.appendChild(img);
    photo.append(shot, this.paperClip());

    let at = WRITE_START_MS;
    const ink = (el: HTMLElement, text: string): HTMLElement => {
      const d = Math.max(280, Math.min(1100, text.length * WRITE_MS_PER_CHAR));
      el.classList.add('zh-ink');
      el.style.setProperty('--at', `${at}ms`);
      el.style.setProperty('--d', `${d}ms`);
      el.textContent = text;
      at += d + 90;
      return el;
    };
    const stroke = (cls: string, path: string, viewBox: string, d: number): SVGSVGElement => {
      const svg = this.svgStroke(cls, path, viewBox);
      svg.style.setProperty('--at', `${at}ms`);
      svg.style.setProperty('--d', `${d}ms`);
      at += d + 60;
      return svg;
    };

    const name = document.createElement('h2');
    name.className = 'zh-note-name';
    name.appendChild(ink(document.createElement('span'), t(`items.name.${this.kind}`)));
    const latin = document.createElement('p');
    latin.className = 'zh-note-latin';
    latin.appendChild(ink(document.createElement('span'), t(`${species}.latin`)));
    // O nome científico sublinhado à mão, como num caderno de campo.
    latin.appendChild(stroke('zh-under', 'M1 6 C 18 3, 34 8, 52 5 S 84 3, 99 6', '0 0 100 10', 380));
    const row = document.createElement('div');
    row.className = 'zh-note-edible-row';
    const edible = document.createElement('span');
    edible.className = `zh-note-edible zh-${this.spec.edibility}`;
    edible.appendChild(ink(document.createElement('span'), t(`fungi.edibility.${this.spec.edibility}`)));
    // ...e a comestibilidade CIRCULADA, numa volta só, que passa do ponto onde começou.
    edible.appendChild(stroke('zh-ring',
      'M14 30 C 4 20, 14 6, 44 4 C 76 2, 98 10, 96 24 C 94 38, 60 44, 30 40 C 10 37, 4 28, 12 16 C 16 11, 24 8, 30 7',
      '0 0 100 46', 520));
    row.appendChild(edible);
    const notes = document.createElement('ul');
    notes.className = 'zh-note-notes';
    for (const line of tWords(`${species}.notes`)) {
      const li = document.createElement('li');
      li.appendChild(ink(document.createElement('span'), `~ ${line}`));
      notes.appendChild(li);
    }
    this.writeEndMs = at;
    paper.append(photo, name, latin, row, notes);
    note.appendChild(paper);
    return note;
  }

  /** Um traço de pena em SVG (o sublinhado, o círculo), desenhado com stroke-dashoffset. */
  private svgStroke(cls: string, path: string, viewBox: string): SVGSVGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', `zh-stroke ${cls}`);
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', path);
    p.setAttribute('pathLength', '1');
    svg.appendChild(p);
    return svg;
  }

  /** O clipe de papel: um arame dobrado, de metal fosco, por cima da beirada da foto. */
  private paperClip(): SVGSVGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'zh-note-clip');
    svg.setAttribute('viewBox', '0 0 15 46');
    svg.setAttribute('aria-hidden', 'true');
    const wire = 'M4.5 32 V9 a4 4 0 0 1 8 0 V37 a5.5 5.5 0 0 1 -11 0 V5 a3.5 3.5 0 0 1 3.5 -3.5';
    const shadow = document.createElementNS(ns, 'path');
    shadow.setAttribute('d', wire);
    shadow.setAttribute('transform', 'translate(0.9 1.4)');
    shadow.setAttribute('fill', 'none');
    shadow.setAttribute('stroke', 'rgba(40,24,8,0.35)');
    shadow.setAttribute('stroke-width', '1.9');
    const metal = document.createElementNS(ns, 'path');
    metal.setAttribute('d', wire);
    metal.setAttribute('fill', 'none');
    metal.setAttribute('stroke', '#8e959b');
    metal.setAttribute('stroke-width', '1.6');
    metal.setAttribute('stroke-linecap', 'round');
    const shine = document.createElementNS(ns, 'path');
    shine.setAttribute('d', wire);
    shine.setAttribute('fill', 'none');
    shine.setAttribute('stroke', '#e4e8eb');
    shine.setAttribute('stroke-width', '0.5');
    shine.setAttribute('stroke-linecap', 'round');
    svg.append(shadow, metal, shine);
    return svg;
  }
}
