import { t } from '@/game/i18n/i18n';
import { STACK_COLS, STACK_ROWS } from '@/game/render3d/woodTextures';
import { KEY_BORDER, KEY_GLYPH, PIXEL_FONT } from '@/game/runtime/uiStyle';

// OS TRÊS OFÍCIOS DO BRAM, um minijogo cada: rachar, empilhar e montar o fogo. Telas de pixel por cima
// do mundo, como o quadro da Iris: um canvas de poucos pixels ampliado sem suavizar, e os botões em
// DOM. Nenhum deles tem derrota. O jogador pode errar quantas vezes quiser, e o Bram comenta depois.

const STYLE_ID = 'zh-craft-style';
const ROOT_ID = 'zh-craft-root';
const VIEW_W = 200;
const VIEW_H = 150;

const CSS = `
#${ROOT_ID} {
  position: fixed; inset: 0; z-index: 55; box-sizing: border-box;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  padding: calc(12px + env(safe-area-inset-top, 0px)) calc(12px + env(safe-area-inset-right, 0px))
    calc(12px + env(safe-area-inset-bottom, 0px)) calc(12px + env(safe-area-inset-left, 0px));
  background: rgba(6, 5, 4, 0.74);
  font-family: ${PIXEL_FONT}; color: #e7dcc4; text-shadow: 2px 2px 0 #000;
  user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
}
#${ROOT_ID} * { box-sizing: border-box; }
#${ROOT_ID} canvas {
  display: block; flex: 0 0 auto; image-rendering: pixelated; touch-action: none; cursor: pointer;
  border: 6px solid #2a1c12; outline: 3px solid #8e623a;
}
#${ROOT_ID} .zh-craft-side { display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 8px; flex: 0 0 auto; max-width: 100%; min-height: 168px; }
#${ROOT_ID} .zh-craft-note { min-height: 2.6em; max-width: 26em; text-align: center; font-size: 12px; line-height: 1.3; color: ${KEY_GLYPH}; }
#${ROOT_ID} .zh-craft-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 12px; align-items: center; }
#${ROOT_ID} button {
  appearance: none; border: 0; background: none; margin: 0; padding: 0 8px; min-height: 48px; min-width: 48px;
  font: inherit; font-size: 12px; line-height: 1.2; color: #cfc6ad; text-shadow: inherit; cursor: pointer;
  touch-action: manipulation; white-space: nowrap;
}
#${ROOT_ID} button:active { transform: translateY(2px); }
#${ROOT_ID} button:disabled { opacity: 0.35; cursor: default; }
#${ROOT_ID} button.zh-main { color: ${KEY_BORDER}; font-size: 16px; }
#${ROOT_ID} button.zh-dim { color: #a89c7e; }
@media (orientation: landscape) {
  #${ROOT_ID} { flex-direction: row; gap: 24px; }
  #${ROOT_ID} .zh-craft-side { max-width: 16em; }
}
`;

/** A moldura comum: canvas, nota, botões, teclado, e o relógio do desenho. */
abstract class CraftOverlay {
  protected readonly root: HTMLDivElement;
  protected readonly canvas: HTMLCanvasElement;
  protected readonly ctx: CanvasRenderingContext2D;
  protected readonly note: HTMLDivElement;
  protected readonly row: HTMLDivElement;
  private readonly side: HTMLDivElement;
  private raf = 0;
  private last = 0;
  protected destroyed = false;

  protected constructor(protected readonly onLeave: () => void) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.root = document.createElement('div');
    this.root.id = ROOT_ID;
    this.root.setAttribute('data-zh-ui', '');
    this.canvas = document.createElement('canvas');
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d indisponível');
    this.ctx = ctx;
    this.root.appendChild(this.canvas);
    this.side = document.createElement('div');
    this.side.className = 'zh-craft-side';
    this.note = document.createElement('div');
    this.note.className = 'zh-craft-note';
    this.row = document.createElement('div');
    this.row.className = 'zh-craft-row';
    this.side.append(this.note, this.row);
    this.root.appendChild(this.side);
    window.addEventListener('keydown', this.handleKeyEvent, true);
    window.addEventListener('resize', this.layout);
  }

  protected start(): void {
    document.body.appendChild(this.root);
    this.layout();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.handleKeyEvent, true);
    window.removeEventListener('resize', this.layout);
    this.root.remove();
  }

  protected button(label: string, onClick: () => void, variant = ''): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    if (variant) btn.className = variant;
    btn.addEventListener('click', onClick);
    this.row.appendChild(btn);
    return btn;
  }

  protected rect(color: string, x: number, y: number, w: number, h: number): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /** Um disco de pixel inteiro: topo de tora, nó, pedra. */
  protected disc(cx: number, cy: number, radius: number, color: string): void {
    this.ctx.fillStyle = color;
    for (let y = -radius; y <= radius; y += 1) {
      const w = Math.round(Math.sqrt(radius * radius - y * y));
      this.ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2, 1);
    }
  }

  /** Uma vara de pixel, de ponta a ponta, com espessura. */
  protected stick(x0: number, y0: number, x1: number, y1: number, thick: number, color: string): void {
    this.ctx.fillStyle = color;
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i += 1) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * i) / steps;
      this.ctx.fillRect(Math.round(x - thick / 2), Math.round(y - thick / 2), thick, thick);
    }
  }

  protected toView(event: PointerEvent): { x: number; y: number } {
    const box = this.canvas.getBoundingClientRect();
    const border = 6;
    return {
      x: ((event.clientX - box.left - border) / (box.width - border * 2)) * VIEW_W,
      y: ((event.clientY - box.top - border) / (box.height - border * 2)) * VIEW_H,
    };
  }

  private readonly layout = (): void => {
    const landscape = window.innerWidth > window.innerHeight;
    const side = this.side.getBoundingClientRect();
    const frame = 18;
    const w = window.innerWidth - frame - 24 - (landscape ? side.width + 24 : 0);
    const h = window.innerHeight - frame - 24 - (landscape ? 0 : side.height + 12);
    const scale = Math.max(1, Math.floor(Math.min(w / VIEW_W, h / VIEW_H) * 8) / 8);
    this.canvas.style.width = `${VIEW_W * scale + 12}px`;
    this.canvas.style.height = `${VIEW_H * scale + 12}px`;
  };

  private readonly frame = (now: number): void => {
    if (this.destroyed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.tick(dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  private readonly handleKeyEvent = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      this.onLeave();
      return;
    }
    if (this.handleKey(event.code)) event.preventDefault();
  };

  protected abstract tick(dt: number): void;
  protected abstract handleKey(code: string): boolean;
}

const isAccept = (code: string): boolean => code === 'Space' || code === 'Enter' || code === 'NumpadEnter' || code === 'KeyZ' || code === 'KeyJ';

const drawGround = (overlay: { rectFn: (c: string, x: number, y: number, w: number, h: number) => void }): void => {
  overlay.rectFn('#2c3a20', 0, 0, VIEW_W, VIEW_H);
  overlay.rectFn('#222e19', 0, 112, VIEW_W, 38);
  for (let i = 0; i < 26; i += 1) overlay.rectFn('#34451f', (i * 53) % VIEW_W, 116 + ((i * 37) % 30), 3, 1);
};

// ── RACHAR ───────────────────────────────────────────────────────────────────────────────────────

export const LOGS_TO_SPLIT = 4;
const AIM_TOLERANCE = 7;
const KNOT_RADIUS = 7;
const FORCE_MIN = 0.62;
const FORCE_MAX = 0.88;
const LOG_CX = 100;
const LOG_CY = 66;
const LOG_R = 38;

type SplitPhase = 'aim' | 'force' | 'swing' | 'apart';

export interface SplitCallbacks {
  /** Cada tora rachada: quantas já foram, e quantas de um golpe só. */
  onLog: (done: number, clean: number) => void;
  onDone: () => void;
  onLeave: () => void;
  onHit: () => void;
  onMiss: () => void;
  onClean: () => void;
}

export class SplitOverlay extends CraftOverlay {
  private phase: SplitPhase = 'aim';
  private time = 0;
  private aim = 0;
  private force = 0;
  private swingT = 0;
  private apartT = 0;
  private grainX = 0;
  private knotX = 0;
  private knotY = 0;
  private hitsOnLog = 0;
  private crackWide = 0;
  private shake = 0;
  private chips: Array<{ x: number; y: number; vx: number; vy: number; life: number }> = [];

  public constructor(private readonly cb: SplitCallbacks, private done: number, private clean: number) {
    super(cb.onLeave);
    this.button(t('npc.businessManCraft.leave'), () => cb.onLeave(), 'zh-dim');
    this.canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.act();
    });
    this.nextLog();
    this.start();
  }

  private nextLog(): void {
    this.phase = 'aim';
    this.hitsOnLog = 0;
    this.crackWide = 0;
    // O veio e o nó mudam de tora para tora, mas sempre de um jeito fixo: a mesma partida é justa.
    const side = this.done % 2 === 0 ? 1 : -1;
    this.grainX = side * (6 + this.done * 3);
    this.knotX = -side * (10 + this.done * 2);
    this.knotY = this.done % 2 === 0 ? -14 : 12;
    this.say('npc.businessManCraft.aim');
  }

  private say(key: string): void {
    this.note.textContent = t(key);
  }

  /** O vaivém do alvo: cada tora um pouco mais depressa. */
  private get aimSpeed(): number {
    return 2.2 + this.done * 0.5;
  }

  private act(): void {
    if (this.phase === 'aim') {
      this.phase = 'force';
      this.time = 0;
      this.say('npc.businessManCraft.force');
    } else if (this.phase === 'force') {
      this.phase = 'swing';
      this.swingT = 0;
    }
  }

  private strike(): void {
    this.hitsOnLog += 1;
    this.shake = 1;
    const onKnot = Math.abs(this.aim - this.knotX) < KNOT_RADIUS;
    const onGrain = Math.abs(this.aim - this.grainX) < AIM_TOLERANCE + this.crackWide;
    const goodForce = this.force >= FORCE_MIN && this.force <= FORCE_MAX;
    if (onKnot) {
      this.cb.onMiss();
      this.spawnChips(4);
      this.say('npc.businessManCraft.knot');
      this.phase = 'aim';
      return;
    }
    if (onGrain && goodForce) {
      if (this.hitsOnLog === 1) this.clean += 1;
      this.done += 1;
      this.cb.onClean();
      this.cb.onLog(this.done, this.clean);
      this.spawnChips(14);
      this.say(this.hitsOnLog === 1 ? 'npc.businessManCraft.clean' : 'npc.businessManCraft.split');
      this.phase = 'apart';
      this.apartT = 0;
      return;
    }
    this.cb.onHit();
    this.spawnChips(6);
    // O golpe que não racha abre a fenda: a próxima tem mais onde entrar. Ninguém fica preso numa tora.
    this.crackWide = Math.min(16, this.crackWide + 5);
    this.say(!onGrain ? 'npc.businessManCraft.offGrain' : this.force < FORCE_MIN ? 'npc.businessManCraft.weak' : 'npc.businessManCraft.strong');
    this.phase = 'aim';
  }

  private spawnChips(count: number): void {
    for (let i = 0; i < count; i += 1) {
      this.chips.push({
        x: LOG_CX + this.aim, y: LOG_CY, vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 80, life: 0.7,
      });
    }
  }

  protected handleKey(code: string): boolean {
    if (!isAccept(code)) return false;
    this.act();
    return true;
  }

  protected tick(dt: number): void {
    this.time += dt;
    if (this.phase === 'aim') this.aim = Math.sin(this.time * this.aimSpeed) * (LOG_R - 6);
    if (this.phase === 'force') this.force = 0.5 - Math.cos(this.time * 3.4) * 0.5;
    if (this.phase === 'swing') {
      this.swingT += dt / 0.14;
      if (this.swingT >= 1) {
        this.time = 0;
        this.strike();
      }
    }
    if (this.phase === 'apart') {
      this.apartT += dt / 0.65;
      if (this.apartT >= 1) {
        if (this.done >= LOGS_TO_SPLIT) {
          this.cb.onDone();
          return;
        }
        this.time = 0;
        this.nextLog();
      }
    }
    this.shake = Math.max(0, this.shake - dt * 5);
    this.draw(dt);
  }

  private draw(dt: number): void {
    drawGround({ rectFn: (c, x, y, w, h) => this.rect(c, x, y, w, h) });
    const shakeX = Math.sin(this.time * 70) * this.shake * 2;
    // O cepo.
    this.rect('#201812', LOG_CX - 56, 108, 112, 28);
    this.rect('#5e4228', LOG_CX - 54, 110, 108, 24);
    this.rect('#49331e', LOG_CX - 54, 122, 108, 12);
    if (this.phase === 'apart') {
      const off = this.apartT * 70;
      this.drawLog(LOG_CX - off + shakeX, LOG_CY + this.apartT * 18, -1);
      this.drawLog(LOG_CX + off + shakeX, LOG_CY + this.apartT * 18, 1);
    } else if (this.done < LOGS_TO_SPLIT) {
      this.drawLog(LOG_CX + shakeX, LOG_CY, 0);
      this.drawMarks(shakeX);
    }
    // A barra de força: a faixa boa é a do meio-alto.
    if (this.phase === 'force' || this.phase === 'swing') {
      const barX = 176;
      const barH = 90;
      const barY = 20;
      this.rect('#201812', barX - 2, barY - 2, 14, barH + 4);
      this.rect('#3b2c1c', barX, barY, 10, barH);
      this.rect('#6fa83c', barX, barY + barH * (1 - FORCE_MAX), 10, barH * (FORCE_MAX - FORCE_MIN));
      this.rect('#ffe066', barX - 2, barY + barH * (1 - this.force) - 1, 14, 3);
    }
    this.drawAxe();
    this.chips = this.chips.filter((chip) => chip.life > 0);
    for (const chip of this.chips) {
      chip.x += chip.vx * dt;
      chip.y += chip.vy * dt;
      chip.vy += 260 * dt;
      chip.life -= dt;
      this.rect('#d7b67e', chip.x, chip.y, 2, 2);
    }
    // Quantas faltam.
    for (let i = 0; i < LOGS_TO_SPLIT; i += 1) this.rect(i < this.done ? '#ffe066' : '#5a4a35', 8 + i * 10, 8, 7, 7);
  }

  /** A tora de topo: anéis, o veio (a rachadura) e o nó. `half` desenha só um lado. */
  private drawLog(cx: number, cy: number, half: number): void {
    const { ctx } = this;
    const fill = (radius: number, color: string): void => {
      ctx.fillStyle = color;
      for (let y = -radius; y <= radius; y += 1) {
        const w = Math.round(Math.sqrt(radius * radius - y * y));
        const left = half > 0 ? 0 : -w;
        const span = half === 0 ? w * 2 : w;
        ctx.fillRect(Math.round(cx + left), Math.round(cy + y), span, 1);
      }
    };
    fill(LOG_R + 2, '#201812');
    fill(LOG_R, '#5c3f24');
    fill(LOG_R - 4, '#c79f68');
    fill(LOG_R - 12, '#b58c58');
    fill(LOG_R - 20, '#c79f68');
    fill(LOG_R - 28, '#a97f4d');
    if (half !== 0) return;
    // O nó: duro e escuro. A lâmina não entra.
    ctx.fillStyle = '#4a2f18';
    for (let y = -KNOT_RADIUS; y <= KNOT_RADIUS; y += 1) {
      const w = Math.round(Math.sqrt(KNOT_RADIUS * KNOT_RADIUS - y * y));
      ctx.fillRect(Math.round(cx + this.knotX - w), Math.round(cy + this.knotY + y), w * 2, 1);
    }
    ctx.fillStyle = '#7a5530';
    ctx.fillRect(Math.round(cx + this.knotX - 2), Math.round(cy + this.knotY - 2), 4, 4);
    // O veio: a linha por onde a tora quer abrir.
    const wide = 1 + Math.floor(this.crackWide / 5);
    ctx.fillStyle = '#3a2614';
    for (let y = -LOG_R + 3; y < LOG_R - 2; y += 1) {
      const wiggle = Math.round(Math.sin(y * 0.35) * 1.5);
      ctx.fillRect(Math.round(cx + this.grainX + wiggle - wide / 2), Math.round(cy + y), wide, 1);
    }
  }

  private drawMarks(shakeX: number): void {
    if (this.phase === 'apart') return;
    // Onde a lâmina vai cair.
    const x = LOG_CX + this.aim + shakeX;
    this.rect('#ffe066', x - 1, LOG_CY - LOG_R - 8, 2, 6);
    this.rect('#ffe066', x - 1, LOG_CY + LOG_R + 2, 2, 6);
    this.rect('rgba(255, 224, 102, 0.28)', x - 1, LOG_CY - LOG_R, 2, LOG_R * 2);
  }

  private drawAxe(): void {
    if (this.phase === 'apart' && this.apartT > 0.5) return;
    const rest = this.phase === 'swing' ? 1 - this.swingT : 1;
    const x = LOG_CX + this.aim;
    const y = 2 + (LOG_CY - 30) * (1 - rest);
    this.rect('#201812', x - 2, y - 24, 5, 28);
    this.rect('#8e623a', x - 1, y - 24, 3, 27);
    // A cunha: larga em cima, fina no fio.
    for (let row = 0; row < 12; row += 1) {
      const half = 11 - Math.floor(row * 0.72);
      this.rect('#201812', x - half - 1, y + row, half * 2 + 3, 1);
      this.rect(row > 8 ? '#f4f4ea' : '#b9b9b0', x - half, y + row, half * 2 + 1, 1);
    }
  }
}

// ── EMPILHAR ─────────────────────────────────────────────────────────────────────────────────────

export const PIECES_TO_STACK = 8;

/** Quanto ar passa: dos lados de cada peça, quantos estão abertos. É isso que manda na secagem. */
export const stackAir = (heights: readonly number[]): number => {
  let open = 0;
  let total = 0;
  heights.forEach((height, col) => {
    for (let row = 0; row < height; row += 1) {
      total += 2;
      if ((heights[col - 1] ?? 0) <= row) open += 1;
      if ((heights[col + 1] ?? 0) <= row) open += 1;
    }
  });
  return total === 0 ? 0 : open / total;
};

export interface StackCallbacks {
  onDone: (heights: number[]) => void;
  onLeave: () => void;
  onPlace: () => void;
  onLift: () => void;
}

const RACK_LEFT = 25;
const RACK_BOTTOM_Y = 112;
const COL_W = 30;
const ROW_H = 28;

export class StackOverlay extends CraftOverlay {
  private readonly heights: number[] = new Array<number>(STACK_COLS).fill(0);
  private selected = 2;
  private time = 0;
  private drop?: { col: number; row: number; y: number };
  private readonly doneBtn: HTMLButtonElement;
  private readonly liftBtn: HTMLButtonElement;

  public constructor(private readonly cb: StackCallbacks) {
    super(cb.onLeave);
    this.button(t('npc.businessManCraft.leave'), () => cb.onLeave(), 'zh-dim');
    this.liftBtn = this.button(t('npc.businessManCraft.lift'), () => this.lift());
    this.doneBtn = this.button(t('npc.businessManCraft.stackDone'), () => this.finish(), 'zh-main');
    this.canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const { x } = this.toView(event);
      const col = Math.floor((x - RACK_LEFT) / COL_W);
      if (col < 0 || col >= STACK_COLS) return;
      this.selected = col;
      this.place();
    });
    this.canvas.addEventListener('pointermove', (event) => {
      const { x } = this.toView(event);
      const col = Math.floor((x - RACK_LEFT) / COL_W);
      if (col >= 0 && col < STACK_COLS) this.selected = col;
    });
    this.refresh();
    this.start();
  }

  private get placed(): number {
    return this.heights.reduce((sum, height) => sum + height, 0);
  }

  private refresh(): void {
    this.doneBtn.disabled = this.placed < PIECES_TO_STACK;
    this.liftBtn.disabled = this.placed === 0;
    const left = PIECES_TO_STACK - this.placed;
    if (left > 0) {
      this.note.textContent = t('npc.businessManCraft.stackHint').replace('{n}', String(left));
      return;
    }
    const air = stackAir(this.heights);
    this.note.textContent = t(air >= 0.75 ? 'npc.businessManCraft.airGood' : air >= 0.45 ? 'npc.businessManCraft.airOk' : 'npc.businessManCraft.airBad');
  }

  private place(): void {
    if (this.placed >= PIECES_TO_STACK) return;
    const col = this.selected;
    const row = this.heights[col];
    if (row >= STACK_ROWS) return;
    this.heights[col] += 1;
    this.drop = { col, row, y: 8 };
    this.cb.onPlace();
    this.refresh();
  }

  private lift(): void {
    let col = this.selected;
    if (this.heights[col] === 0) col = this.heights.findIndex((height) => height > 0);
    if (col < 0) return;
    this.heights[col] -= 1;
    this.cb.onLift();
    this.refresh();
  }

  private finish(): void {
    if (this.placed >= PIECES_TO_STACK) this.cb.onDone([...this.heights]);
  }

  protected handleKey(code: string): boolean {
    if (code === 'ArrowLeft' || code === 'KeyA') { this.selected = Math.max(0, this.selected - 1); return true; }
    if (code === 'ArrowRight' || code === 'KeyD') { this.selected = Math.min(STACK_COLS - 1, this.selected + 1); return true; }
    if (code === 'Backspace' || code === 'KeyX') { this.lift(); return true; }
    if (isAccept(code)) {
      if (this.placed >= PIECES_TO_STACK) this.finish();
      else this.place();
      return true;
    }
    return false;
  }

  protected tick(dt: number): void {
    this.time += dt;
    drawGround({ rectFn: (c, x, y, w, h) => this.rect(c, x, y, w, h) });
    // Os trilhos: a lenha não encosta no chão.
    this.rect('#201812', RACK_LEFT - 4, RACK_BOTTOM_Y, COL_W * STACK_COLS + 8, 7);
    this.rect('#8e623a', RACK_LEFT - 2, RACK_BOTTOM_Y + 1, COL_W * STACK_COLS + 4, 3);
    this.rect('#201812', RACK_LEFT, RACK_BOTTOM_Y + 7, 6, 16);
    this.rect('#201812', RACK_LEFT + COL_W * STACK_COLS - 6, RACK_BOTTOM_Y + 7, 6, 16);
    // A coluna escolhida, e a peça na mão.
    if (this.placed < PIECES_TO_STACK && this.heights[this.selected] < STACK_ROWS) {
      const x = RACK_LEFT + this.selected * COL_W;
      this.rect('rgba(255, 224, 102, 0.12)', x, RACK_BOTTOM_Y - ROW_H * STACK_ROWS, COL_W, ROW_H * STACK_ROWS);
      this.drawPiece(x, 4 + Math.sin(this.time * 4) * 2);
    }
    this.heights.forEach((height, col) => {
      for (let row = 0; row < height; row += 1) {
        const falling = this.drop && this.drop.col === col && this.drop.row === row;
        const y = RACK_BOTTOM_Y - (row + 1) * ROW_H;
        this.drawPiece(RACK_LEFT + col * COL_W, falling && this.drop ? Math.min(this.drop.y, y) : y);
      }
    });
    if (this.drop) {
      this.drop.y += dt * 520;
      if (this.drop.y >= RACK_BOTTOM_Y - (this.drop.row + 1) * ROW_H) this.drop = undefined;
    }
    this.drawWind();
    // O ar medido: uma fila de blocos, como o volume da pausa.
    const air = stackAir(this.heights);
    for (let i = 0; i < 10; i += 1) this.rect(i < Math.round(air * 10) ? '#9fd8ff' : 'rgba(245, 239, 220, 0.16)', 8 + i * 8, 8, 6, 8);
  }

  private drawPiece(x: number, y: number): void {
    const cx = x + COL_W / 2;
    const cy = y + ROW_H / 2;
    this.disc(cx, cy, 13, '#201812');
    this.disc(cx, cy, 12, '#5c3f24');
    this.disc(cx, cy, 10, '#c79f68');
    this.disc(cx, cy, 7, '#b58c58');
    this.disc(cx, cy, 4, '#c79f68');
    this.disc(cx, cy, 2, '#a97f4d');
    this.rect('#3a2614', cx, y + 4, 1, ROW_H / 2 - 3);
  }

  /** O vento: passa pelas fileiras e para onde a madeira encosta. É a dica sem nenhuma palavra. */
  private drawWind(): void {
    for (let row = 0; row < STACK_ROWS; row += 1) {
      const y = RACK_BOTTOM_Y - (row + 1) * ROW_H + 13;
      for (let i = 0; i < 4; i += 1) {
        const x = ((this.time * 46 + i * 53 + row * 21) % (VIEW_W + 20)) - 10;
        const col = Math.floor((x - RACK_LEFT) / COL_W);
        // Dentro de uma peça com vizinha encostada, o vento some.
        if (col >= 0 && col < STACK_COLS && this.heights[col] > row) {
          const blocked = (this.heights[col - 1] ?? 0) > row && (this.heights[col + 1] ?? 0) > row;
          if (blocked) continue;
          if (x > RACK_LEFT + col * COL_W + 2 && x < RACK_LEFT + (col + 1) * COL_W - 2) continue;
        }
        this.rect('rgba(190, 228, 255, 0.55)', x, y, 8, 1);
      }
    }
  }
}

// ── MONTAR O FOGO ────────────────────────────────────────────────────────────────────────────────

type Layer = 'tinder' | 'kindling' | 'fuel';
const LAY: Readonly<Record<Layer, number>> = { tinder: 1, kindling: 3, fuel: 2 };
const ORDER: readonly Layer[] = ['tinder', 'kindling', 'kindling', 'kindling', 'fuel', 'fuel'];
const BLOW_GAIN = 0.2;
const BLOW_TOO_FAST_S = 0.28;
const EMBER_DECAY = 0.13;
const PIT_X = 100;
const PIT_Y = 118;

export interface FireCallbacks {
  onDone: (attempts: number) => void;
  onLeave: () => void;
  onPlace: () => void;
  onStrike: () => void;
  onBlow: () => void;
  onFail: () => void;
  onCatch: () => void;
}

export class FireLayOverlay extends CraftOverlay {
  private readonly laid: Layer[] = [];
  private phase: 'lay' | 'blow' | 'burn' | 'smoke' = 'lay';
  private readonly trayBtns = new Map<Layer, HTMLButtonElement>();
  private readonly lightBtn: HTMLButtonElement;
  private readonly blowBtn: HTMLButtonElement;
  private time = 0;
  private ember = 0;
  /** Quantas camadas o fogo já pegou (isca, gravetos, lenha). */
  private caught = 0;
  private lastBlow = -1;
  private failures = 0;
  private phaseT = 0;
  private sparks: Array<{ x: number; y: number; vy: number; life: number; color: string }> = [];

  public constructor(private readonly cb: FireCallbacks) {
    super(cb.onLeave);
    this.button(t('npc.businessManCraft.leave'), () => cb.onLeave(), 'zh-dim');
    (Object.keys(LAY) as Layer[]).forEach((layer) => {
      this.trayBtns.set(layer, this.button('', () => this.put(layer)));
    });
    this.lightBtn = this.button(t('npc.businessManCraft.light'), () => this.light(), 'zh-main');
    this.blowBtn = this.button(t('npc.businessManCraft.blow'), () => this.blow(), 'zh-main');
    this.canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (this.phase === 'blow') this.blow();
    });
    this.refresh();
    this.say('npc.businessManCraft.layHint');
    this.start();
  }

  private say(key: string): void {
    this.note.textContent = t(key);
  }

  private count(layer: Layer): number {
    return this.laid.filter((item) => item === layer).length;
  }

  private refresh(): void {
    const laying = this.phase === 'lay';
    (Object.keys(LAY) as Layer[]).forEach((layer) => {
      const btn = this.trayBtns.get(layer);
      if (!btn) return;
      btn.textContent = `${t(`npc.businessManCraft.${layer}`)} ${LAY[layer] - this.count(layer)}`;
      btn.style.display = laying ? '' : 'none';
      btn.disabled = this.count(layer) >= LAY[layer];
    });
    this.lightBtn.style.display = laying ? '' : 'none';
    this.lightBtn.disabled = this.laid.length < ORDER.length;
    this.blowBtn.style.display = this.phase === 'blow' ? '' : 'none';
  }

  private put(layer: Layer): void {
    if (this.phase !== 'lay' || this.count(layer) >= LAY[layer]) return;
    this.laid.push(layer);
    this.cb.onPlace();
    this.refresh();
  }

  private get layCorrect(): boolean {
    return this.laid.every((layer, index) => layer === ORDER[index]);
  }

  private light(): void {
    if (this.phase !== 'lay' || this.laid.length < ORDER.length) return;
    this.cb.onStrike();
    if (!this.layCorrect) {
      this.fail('npc.businessManCraft.wrongOrder');
      this.laid.length = 0;
      return;
    }
    this.phase = 'blow';
    this.ember = 0.4;
    this.caught = 0;
    this.say('npc.businessManCraft.blowHint');
    this.refresh();
  }

  private fail(key: string): void {
    this.failures += 1;
    this.cb.onFail();
    this.phase = 'smoke';
    this.phaseT = 0;
    this.say(key);
    this.refresh();
  }

  private blow(): void {
    if (this.phase !== 'blow') return;
    const gap = this.time - this.lastBlow;
    this.lastBlow = this.time;
    this.cb.onBlow();
    // Soprar demais apaga: é o sopro longo e calmo que dá ar à brasa, não a afobação.
    if (gap < BLOW_TOO_FAST_S) {
      this.ember -= 0.14;
      this.say('npc.businessManCraft.tooFast');
      return;
    }
    this.ember += BLOW_GAIN;
    this.say(`npc.businessManCraft.caught${this.caught}`);
    for (let i = 0; i < 6; i += 1) this.spark('#ffb040');
  }

  private spark(color: string): void {
    this.sparks.push({ x: PIT_X + (Math.random() - 0.5) * 30, y: PIT_Y - 18, vy: -30 - Math.random() * 40, life: 0.8, color });
  }

  protected handleKey(code: string): boolean {
    if (this.phase === 'blow' && isAccept(code)) { this.blow(); return true; }
    if (this.phase !== 'lay') return isAccept(code);
    if (code === 'Digit1') { this.put('tinder'); return true; }
    if (code === 'Digit2') { this.put('kindling'); return true; }
    if (code === 'Digit3') { this.put('fuel'); return true; }
    if (isAccept(code)) { this.light(); return true; }
    return false;
  }

  protected tick(dt: number): void {
    this.time += dt;
    this.phaseT += dt;
    if (this.phase === 'blow') {
      this.ember -= EMBER_DECAY * dt;
      if (this.ember >= 1) {
        this.caught += 1;
        this.ember = 0.4;
        this.cb.onCatch();
        for (let i = 0; i < 18; i += 1) this.spark('#ffe066');
        if (this.caught >= 3) {
          this.phase = 'burn';
          this.phaseT = 0;
          this.say('npc.businessManCraft.burning');
          this.refresh();
        }
      } else if (this.ember <= 0) {
        this.fail('npc.businessManCraft.died');
      }
    } else if (this.phase === 'smoke' && this.phaseT > 1.2) {
      // A lenha continua ali: apagou a brasa, não o trabalho. Só a ordem errada desmonta.
      this.phase = this.laid.length >= ORDER.length ? 'blow' : 'lay';
      if (this.phase === 'blow') {
        this.ember = 0.4;
        this.caught = 0;
        this.say('npc.businessManCraft.blowHint');
      } else {
        this.say('npc.businessManCraft.layHint');
      }
      this.refresh();
    } else if (this.phase === 'burn' && this.phaseT > 1.6) {
      this.cb.onDone(this.failures);
      return;
    }
    this.draw(dt);
  }

  private draw(dt: number): void {
    const dark = this.phase === 'burn' ? '#3a2f1c' : '#1d2715';
    this.rect(dark, 0, 0, VIEW_W, VIEW_H);
    this.rect('#2c2418', 0, 112, VIEW_W, 38);
    // O anel de pedras.
    for (let i = 0; i < 9; i += 1) {
      const x = PIT_X - 48 + i * 12;
      this.rect('#201812', x, PIT_Y + 2, 11, 9);
      this.rect('#8a8a84', x + 1, PIT_Y + 3, 9, 6);
    }
    this.laid.forEach((layer, index) => this.drawLayer(layer, index));
    this.drawFlame();
    this.sparks = this.sparks.filter((spark) => spark.life > 0);
    for (const spark of this.sparks) {
      spark.y += spark.vy * dt;
      spark.life -= dt;
      this.rect(spark.color, spark.x, spark.y, 2, 2);
    }
    if (this.phase === 'smoke') {
      for (let i = 0; i < 8; i += 1) this.rect('rgba(150, 150, 150, 0.4)', PIT_X - 18 + i * 5, PIT_Y - 30 - ((this.phaseT * 40 + i * 13) % 50), 6, 6);
    }
    // O sopro: a brasa medida, e a camada que ela tem de pegar.
    if (this.phase === 'blow') {
      this.rect('#201812', 20, 12, 160, 10);
      this.rect('#3b2c1c', 22, 14, 156, 6);
      this.rect('#ff9030', 22, 14, 156 * Math.max(0, Math.min(1, this.ember)), 6);
      for (let i = 0; i < 3; i += 1) this.rect(i < this.caught ? '#ffe066' : '#5a4a35', 80 + i * 14, 28, 10, 6);
    }
  }

  private drawLayer(layer: Layer, index: number): void {
    const nth = this.laid.slice(0, index).filter((item) => item === layer).length;
    if (layer === 'tinder') {
      // Um ninho de capim seco e casca, onde a brasa nasce.
      this.disc(PIT_X, PIT_Y - 2, 11, '#6b5a24');
      for (let i = 0; i < 26; i += 1) {
        const a = i * 2.4;
        const r = 3 + (i % 8);
        this.rect(i % 3 === 0 ? '#e0cb74' : '#b49c45', PIT_X + Math.cos(a) * r * 1.5, PIT_Y - 2 + Math.sin(a) * r * 0.7, 3, 1);
      }
    } else if (layer === 'kindling') {
      // Gravetos finos em tenda: o ar entra por baixo e a chama sobe pelo meio.
      const foot = PIT_X - 24 + nth * 24;
      this.stick(foot, PIT_Y, PIT_X, PIT_Y - 36, 3, '#201812');
      this.stick(foot, PIT_Y, PIT_X, PIT_Y - 36, 1, '#c49a62');
    } else {
      // A lenha rachada encostada na tenda, uma de cada lado.
      const side = nth === 0 ? -1 : 1;
      const footX = PIT_X + side * 40;
      const headX = PIT_X + side * 4;
      this.stick(footX, PIT_Y - 2, headX, PIT_Y - 46, 9, '#201812');
      this.stick(footX, PIT_Y - 2, headX, PIT_Y - 46, 6, '#6f4d2c');
      this.stick(footX, PIT_Y - 2, headX, PIT_Y - 46, 2, '#8a6438');
      this.disc(footX, PIT_Y - 2, 5, '#201812');
      this.disc(footX, PIT_Y - 2, 4, '#c79f68');
    }
  }

  private drawFlame(): void {
    if (this.phase !== 'blow' && this.phase !== 'burn') return;
    const strength = this.phase === 'burn' ? 3 : this.caught + Math.max(0, this.ember);
    const height = 10 + strength * 20;
    const width = 10 + strength * 11;
    const tongue = (w: number, h: number, color: string, phase: number): void => {
      for (let y = 0; y < h; y += 2) {
        const k = y / h;
        const body = w * (1 - k) ** 0.75 * (0.82 + 0.26 * Math.sin(y * 0.42 + this.time * 15 + phase));
        const sway = Math.sin(y * 0.2 - this.time * 9 + phase) * k * (4 + strength * 2);
        this.rect(color, PIT_X + sway - body / 2, PIT_Y - 4 - y, body, 2);
      }
    };
    tongue(width, height, '#d9501f', 0);
    tongue(width * 0.72, height * 0.8, '#f08a24', 1.2);
    tongue(width * 0.42, height * 0.58, '#ffc83a', 2.4);
    tongue(width * 0.18, height * 0.34, '#fff2b0', 3.1);
    if (Math.random() < 0.3) this.spark('#ffb040');
  }
}
