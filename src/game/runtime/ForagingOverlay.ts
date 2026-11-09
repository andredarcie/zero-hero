import { calmDt } from '@/game/runtime/accessibility';
import { FUNGUS_SPECS, fungusCloseUp, type MushroomKind } from '@/game/fungi/fungi';
import { t } from '@/game/i18n/i18n';
import { MinigameCaption } from '@/game/runtime/MinigameCaption';
import { HAND_FONT as HAND, INK, INK_RED, SOFT_BLUR } from '@/game/runtime/uiStyle';
import { createCanvas } from '@/game/platform/platform';
import { ForagingSoil, CS, type Box } from './ForagingSoil';
import { ForagingMushroomArt, STASH_TIME, GRAVITY, clamp01, easeOut } from './ForagingMushroomArt';
import { ForagingToolArt } from './ForagingToolArt';
import { ForagingNote } from './ForagingNote';
import { ForagingHands } from './ForagingHands';
import { ForagingScreen } from './ForagingScreen';
export { WRITE_START_MS, WRITE_MS_PER_CHAR, paperClip } from './ForagingNote';

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
 *      pixel apagado escorre como areia. Limpo, o cogumelo brilha, dá um boing e cai girando para as costas do herói.
 *   3. A FICHA. Um papel velho e amassado sobe do fundo, a foto cai em cima, o clipe a prende, e a
 *      descrição vai sendo escrita à pena, linha por linha. Um toque termina a escrita; outro
 *      dobra o papel, e o cogumelo está nas costas.
 *
 * NADA SE PERDE AQUI (a lei do jogo): sair antes do corte (ESC) deixa o cogumelo no chão; depois
 * do corte não há saída — o cogumelo já está na mão.
 */

const STYLE_ID = 'zh-forage-style';

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
/* O PAPEL OCUPA A TELA (pedido do autor): o maior que couber, com margem em volta e inteiro na altura; tudo dentro
   dele cresce junto (unidades cqw do contêiner), então a ficha é a mesma no celular, no notebook e na TV. */
.zh-note {
  position: relative; width: min(92vw, 1000px, calc((100vh - 64px) * 0.74));
  width: min(92vw, 1000px, calc((100dvh - 64px) * 0.74));
  container-type: inline-size;
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
  position: relative; padding: 6.5cqw 6.5cqw 7.5cqw;
  color: ${INK}; font-family: ${HAND}; font-weight: 600;
  background-color: #e3d1a4; background-size: 100% auto; background-position: center;
  background-repeat: no-repeat;
  text-shadow: 0 0 0.6px rgba(40, 24, 13, 0.55);
}
.zh-note-photo {
  float: left; position: relative; width: 36%;
  margin: 0 4.5cqw 2.5cqw -1cqw; padding: 1.5cqw 1.5cqw 4.5cqw;
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
  position: absolute; top: -5cqw; left: 20%; width: 3.8cqw; height: 11.5cqw;
  transform: rotate(7deg); overflow: visible;
  animation: zh-clip-in 300ms cubic-bezier(0.3, 1.4, 0.5, 1) 900ms both;
}
@keyframes zh-clip-in {
  0%   { opacity: 0; transform: translateY(-16px) rotate(18deg); }
  100% { opacity: 1; transform: rotate(7deg); }
}
.zh-note-name { margin: 1.5cqw 0 0.5cqw; font-size: clamp(26px, 9cqw, 76px); line-height: 1.1; font-weight: 700; }
.zh-note-latin {
  position: relative; display: inline-block; margin: 0;
  font-size: clamp(17px, 5.4cqw, 44px); line-height: 1.3; opacity: 0.85;
}
.zh-note-edible-row { margin: 2.5cqw 0 0.5cqw; }
.zh-note-edible {
  position: relative; display: inline-block; padding: 0 0.6em;
  font-size: clamp(17px, 5.4cqw, 44px); line-height: 1.35;
}
.zh-note-edible.zh-poison { color: ${INK_RED}; }
.zh-note-notes {
  clear: both; margin: 3.5cqw 0 0; padding: 0; list-style: none;
  font-size: clamp(18px, 5.7cqw, 46px); line-height: 1.3;
}
.zh-note-notes li { margin: 0 0 1.5cqw; }

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

/**
 * O PAPEL DO TAMANHO DA TELA (pedido do autor): mede a ficha numa largura de referência e a escala até a altura dela
 * caber no espaço livre (a margem e a legenda do rodapé descontadas), sem passar de 92% da largura. Tudo dentro do
 * papel cresce junto (cqw), então a altura é proporcional à largura e uma medida basta. Refaz no resize.
 */
export const fitNotePaper = (paper: HTMLElement): void => {
  const REF = 400;
  const fit = (): void => {
    if (!paper.isConnected) { window.removeEventListener('resize', fit); return; }
    paper.style.width = `${REF}px`;
    const h = paper.offsetHeight;
    if (h <= 0) return;
    const room = window.innerHeight - 128;
    const w = Math.min(window.innerWidth * 0.92, 1200, (REF * room) / h);
    paper.style.width = `${Math.max(260, Math.floor(w))}px`;
  };
  fit();
  window.addEventListener('resize', fit);
};

export const ensureNoteStyle = (): void => {
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
  /** O cogumelo desce para as costas do herói. */
  onStash: () => void;
  /** A ficha abre. */
  onNote: () => void;
  /** A ficha fechou: o cogumelo vai para as costas. */
  onDone: () => void;
  /** Saiu antes do corte: o cogumelo continua no chão. */
  onCancel: () => void;
}

type Stage = 'intro' | 'aim' | 'pop' | 'clean' | 'shine' | 'stash' | 'note' | 'closing';

const INTRO_TIME = 0.6;
/** Uma ida e volta inteira da faca, em segundos: devagar o bastante para o polegar. */
const AIM_PERIOD = 2.6;
const POP_TIME = 0.8;
const SHINE_TIME = 1.0;
const SPONGE_SPEED = 20;

interface Grain { x: number; y: number; vx: number; vy: number; c: string; age: number }
interface Spark { x: number; y: number; at: number; c: string }
interface Crumb { x: number; y: number; vx: number; vy: number; c: string; life: number }

export class ForagingOverlay {
  /** O que fazer, no rodapé (pedido do autor). */
  private readonly caption = new MinigameCaption();
  public readonly root: HTMLDivElement;
  public readonly canvas: HTMLCanvasElement;
  public readonly ctx: CanvasRenderingContext2D;
  public readonly note: HTMLDivElement;

  public readonly art: HTMLCanvasElement;
  public readonly pixels: Uint8ClampedArray;
  public readonly mask: Uint8Array;
  public readonly spec: (typeof FUNGUS_SPECS)[MushroomKind];
  public readonly artBox: Box;
  public readonly zoneTop: number;
  public readonly zoneBottom: number;
  private readonly aimTop: number;
  private readonly aimBottom: number;
  /** A faca: onde a lâmina começa e termina (x), e onde o cabo termina. */
  public readonly bladeL: number;
  public readonly bladeR: number;
  private readonly handleR: number;
  /** O que tem de caber na tela: o cogumelo inteiro e a faca, nas duas pontas do curso dela. */
  public readonly fitBox: Box;

  public stage: Stage = 'intro';
  public clock = 0;
  public stageClock = 0;
  private aimClock = 0;
  public freeze = 0;
  public knifeY: number;
  public cutY = 0;
  public shake = 0;
  public bump = 0;
  public recoil = 0;
  public wobble = 0;
  /** A vista: pixels do aparelho por pixel da arte, e o ponto da arte no centro da tela. */
  public scale = 1;
  public view = { x: CS / 2, y: CS / 2 };
  public viewFrom = { x: CS / 2, y: CS / 2 };
  public viewTo = { x: CS / 2, y: CS / 2 };

  /** A terra sobre o cogumelo (null = nada, senão a cor); o contorno roxo é refeito ao apagar. */
  public readonly dirt = new Array<string | null>(CS * CS).fill(null);
  public readonly dirtEdge = new Uint8Array(CS * CS);
  public readonly grains: Grain[] = [];
  public readonly crumbs: Crumb[] = [];
  public readonly sparks: Spark[] = [];
  public ring = -1;
  public sponge = { x: 0, y: 0 };
  /** Para onde e quão rápido a bucha anda: ela estica no sentido do movimento. */
  public spongeVel = { x: 0, y: 0 };
  public spongeShown = false;
  public readonly held = new Set<string>();

  private raf = 0;
  private lastNow = 0;
  public closed = false;

  public constructor(
    public readonly kind: MushroomKind,
    public readonly cb: ForagingCallbacks,
    public readonly touch: boolean,
  ) {
    ensureNoteStyle();
    // A letra da ficha vem de um arquivo: pedida agora, ela já chegou quando o papel abrir.
    void document.fonts?.load(`16px ${HAND}`).catch(() => undefined);
    this.spec = FUNGUS_SPECS[kind];
    const close = fungusCloseUp(kind);
    this.art = close.bare;
    this.mask = close.mask;
    this.pixels = this.art.getContext('2d')?.getImageData(0, 0, CS, CS).data ?? new Uint8ClampedArray(CS * CS * 4);
    this.artBox = this.soil.boxOfRows(0, CS);
    this.zoneTop = this.spec.cut.from * CS;
    this.zoneBottom = this.spec.cut.to * CS;
    this.aimTop = Math.max(this.artBox.y0 + 2, 0.46 * CS);
    this.aimBottom = Math.max(this.zoneBottom + 2, this.artBox.y1 + 1);
    this.knifeY = this.aimTop;
    const span = this.soil.stemSpan(Math.round((this.zoneTop + this.zoneBottom) / 2));
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
    this.canvas = createCanvas();
    this.canvas.className = 'zh-forage-canvas';
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('ForagingOverlay: no 2d context');
    this.ctx = ctx;
    this.note = this.card.buildNote();
    const wrap = document.createElement('div');
    wrap.className = 'zh-note-wrap';
    wrap.appendChild(this.note);
    this.root.append(this.canvas, wrap);
    document.body.appendChild(this.root);
    this.screen.resize();

    this.root.addEventListener('pointerdown', this.hands.onPointerDown);
    this.root.addEventListener('pointermove', this.hands.onPointerMove);
    this.root.addEventListener('pointerup', this.hands.onPointerUp);
    this.root.addEventListener('pointercancel', this.hands.onPointerUp);
    this.root.addEventListener('pointerleave', this.hands.onPointerLeave);
    this.root.addEventListener('click', this.hands.onClick);
    window.addEventListener('keydown', this.hands.onKeyDown, true);
    window.addEventListener('keyup', this.hands.onKeyUp, true);
    window.addEventListener('resize', this.screen.resize);

    requestAnimationFrame(() => { if (!this.closed) this.root.classList.add('zh-in'); });
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  public destroy(): void {
    if (this.closed) return;
    this.closed = true;
    window.cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.hands.onKeyDown, true);
    window.removeEventListener('keyup', this.hands.onKeyUp, true);
    window.removeEventListener('resize', this.screen.resize);
    this.root.remove();
    this.caption.destroy();
  }

  // ── estágios ───────────────────────────────────────────────────────────────

  public enter(stage: Stage): void {
    this.stage = stage;
    this.stageClock = 0;
    // A LEGENDA do rodapé: cortar, limpar, ler a ficha (runtime/MinigameCaption).
    this.caption.show(stage === 'aim' ? 'forage.cut' : stage === 'clean' ? 'forage.clean' : stage === 'note' ? 'card' : null);
    this.root.classList.toggle('zh-cleaning', stage === 'clean');
    if (stage === 'note') {
      this.root.classList.add('zh-reading');
      this.note.classList.add('zh-on');
      fitNotePaper(this.note);
      this.cb.onNote();
    }
  }

  /** ESC antes do corte: o cogumelo encolhe de volta, o foco volta, e ele continua no chão. */
  public cancel(): void {
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

  // ── entrada ────────────────────────────────────────────────────────────────

  // ── a arte ─────────────────────────────────────────────────────────────────

  // ── o quadro ───────────────────────────────────────────────────────────────

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
    this.screen.draw();
    this.raf = requestAnimationFrame(this.frame);
  };
  /** A terra e a bucha. (ver ForagingSoil) */
  public readonly soil = new ForagingSoil(this);
  /** O cogumelo desenhado. (ver ForagingMushroomArt) */
  public readonly mushroomArt = new ForagingMushroomArt(this);
  /** A faca, a bucha e as faíscas. (ver ForagingToolArt) */
  public readonly toolArt = new ForagingToolArt(this);
  /** A ficha do cogumelo. (ver ForagingNote) */
  public readonly card = new ForagingNote(this);
  /** O corte e a bucha pelas teclas e pelo dedo (ver ForagingHands). */
  public readonly hands: ForagingHands = new ForagingHands(this);
  /** O canvas, a escala e o quadro. (ver ForagingScreen) */
  public readonly screen: ForagingScreen = new ForagingScreen(this);

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
      this.aimClock += calmDt(dt);
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
        const piece = this.soil.boxOfRows(0, this.cutY);
        // A bucha começa ao lado do cogumelo, na mão: vista, mas sem tapar a terra — e DENTRO da
        // tela (no celular em pé o lado direito do cogumelo já é quase a borda).
        const o = this.screen.origin();
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
        this.soil.scrubTo(x, y);
      }
    }
    const bottom = (this.canvas.height - this.screen.origin().y) / this.scale + 2;
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

  // ── a ficha ────────────────────────────────────────────────────────────────

}

