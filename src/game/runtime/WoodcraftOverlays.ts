import { isTouchDevice } from '@/game/runtime/PauseMenu';
import {
  KEY_BG, KEY_BORDER, KEY_GLYPH, PIXEL_FONT, SOFT_BLUR, pixelFrame,
} from '@/game/runtime/uiStyle';

// OS DOIS OFÍCIOS DO BRAM, no jeito da colheita do cogumelo (ver ForagingOverlay): o mundo fica onde
// está, só que embaçado, e no meio dele aparece a coisa, sozinha e o maior que couber. Sem moldura, sem
// fundo, sem texto. Tudo o que o jogador precisa saber está no próprio desenho e numa tecla só: o toque
// em qualquer lugar da tela. Nenhum dos dois tem derrota, e o erro responde com um tremor.

const STYLE_ID = 'zh-craft-style';
const ROOT_ID = 'zh-craft-root';
const VIEW_W = 200;
const VIEW_H = 150;

const CSS = `
#${ROOT_ID} {
  position: fixed; inset: 0; z-index: 55; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center;
  padding: calc(8px + env(safe-area-inset-top, 0px)) calc(8px + env(safe-area-inset-right, 0px))
    calc(8px + env(safe-area-inset-bottom, 0px)) calc(8px + env(safe-area-inset-left, 0px));
  font-family: ${PIXEL_FONT}; touch-action: none; cursor: pointer;
  user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
  ${SOFT_BLUR}
}
#${ROOT_ID} canvas { display: block; flex: 0 0 auto; image-rendering: pixelated; pointer-events: none; }
/* A tecla do gesto, no desenho das teclas do mundo: é a única instrução da tela. */
#${ROOT_ID} .zh-craft-key {
  position: absolute; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom, 0px)); width: 40px; height: 40px;
  margin-left: -20px; display: flex; align-items: center; justify-content: center;
  background: ${pixelFrame(12, KEY_BG, KEY_BORDER)} center / 100% 100% no-repeat; image-rendering: pixelated;
  color: ${KEY_GLYPH}; font-size: 16px; line-height: 1; pointer-events: none;
  animation: zh-craft-bob 900ms steps(2, jump-none) infinite alternate;
}
@keyframes zh-craft-bob { 0% { transform: translateY(0); } 100% { transform: translateY(4px); } }
#${ROOT_ID} .zh-craft-leave {
  position: absolute; top: calc(6px + env(safe-area-inset-top, 0px)); right: calc(6px + env(safe-area-inset-right, 0px));
  width: 48px; height: 48px; appearance: none; border: 0; background: none; padding: 0; cursor: pointer;
  font: inherit; font-size: 16px; color: ${KEY_GLYPH}; text-shadow: 2px 2px 0 #000; touch-action: manipulation;
}
`;

/** O palco comum: o embaçado, o canvas transparente, a tecla e o relógio do desenho. */
abstract class CraftOverlay {
  protected readonly root: HTMLDivElement;
  protected readonly canvas: HTMLCanvasElement;
  protected readonly ctx: CanvasRenderingContext2D;
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
    this.ctx.imageSmoothingEnabled = false;
    const key = document.createElement('div');
    key.className = 'zh-craft-key';
    key.textContent = isTouchDevice() ? 'A' : 'Z';
    const leave = document.createElement('button');
    leave.type = 'button';
    leave.className = 'zh-craft-leave';
    leave.textContent = 'X';
    leave.setAttribute('aria-label', 'Esc');
    leave.addEventListener('click', (event) => {
      event.stopPropagation();
      this.onLeave();
    });
    leave.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.root.append(this.canvas, key, leave);
    this.root.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.act();
    });
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

  protected rect(color: string, x: number, y: number, w: number, h: number): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /** Um disco de pixel inteiro: topo de tora, nó, brasa. */
  protected disc(cx: number, cy: number, radius: number, color: string): void {
    this.ctx.fillStyle = color;
    for (let y = -radius; y <= radius; y += 1) {
      const w = Math.round(Math.sqrt(radius * radius - y * y));
      this.ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2, 1);
    }
  }

  /** O maior que couber, deixando o rodapé para a tecla. */
  private readonly layout = (): void => {
    const scale = Math.max(1, Math.floor(Math.min((window.innerWidth - 16) / VIEW_W, (window.innerHeight - 96) / VIEW_H) * 8) / 8);
    this.canvas.style.width = `${VIEW_W * scale}px`;
    this.canvas.style.height = `${VIEW_H * scale}px`;
  };

  private readonly frame = (now: number): void => {
    if (this.destroyed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    this.tick(dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  private readonly handleKeyEvent = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      this.onLeave();
    } else if (['Space', 'Enter', 'NumpadEnter', 'KeyZ', 'KeyJ', 'KeyX', 'KeyK'].includes(event.code)) {
      event.preventDefault();
      this.act();
    }
  };

  protected abstract tick(dt: number): void;
  protected abstract act(): void;
}

// ── RACHAR ───────────────────────────────────────────────────────────────────────────────────────

export const LOGS_TO_SPLIT = 4;
const AIM_TOLERANCE = 7;
const KNOT_RADIUS = 7;
const FORCE_MIN = 0.62;
const FORCE_MAX = 0.88;
const LOG_CX = 100;
const LOG_CY = 68;
const LOG_R = 42;

type SplitPhase = 'aim' | 'force' | 'swing' | 'apart';
export type SplitResult = 'clean' | 'split' | 'knot' | 'offGrain' | 'weak' | 'strong' | null;

export interface SplitCallbacks {
  /** O galho rachou. `clean` diz se foi de um golpe só. */
  onSplit: (clean: boolean) => void;
  onDone: () => void;
  onLeave: () => void;
  onHit: () => void;
  onMiss: () => void;
  onClean: () => void;
}

export class SplitOverlay extends CraftOverlay {
  /** O que o último golpe fez: o tremor conta ao jogador, e o teste lê daqui. */
  public result: SplitResult = null;
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

  /** `done` é quantos galhos já foram: o veio muda, e o vaivém acelera. Esta tela racha um. */
  public constructor(private readonly cb: SplitCallbacks, private readonly done: number) {
    super(cb.onLeave);
    // O veio e o nó mudam de galho para galho, sempre do mesmo jeito: a mesma partida é justa.
    const side = this.done % 2 === 0 ? 1 : -1;
    this.grainX = side * (6 + this.done * 3);
    this.knotX = -side * (10 + this.done * 2);
    this.knotY = this.done % 2 === 0 ? -14 : 12;
    this.start();
  }

  private get aimSpeed(): number {
    return 2.2 + this.done * 0.5;
  }

  protected act(): void {
    if (this.phase === 'aim') {
      this.phase = 'force';
      this.time = 0;
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
      this.result = 'knot';
      this.cb.onMiss();
      this.spawnChips(4);
      this.phase = 'aim';
      return;
    }
    if (onGrain && goodForce) {
      this.result = this.hitsOnLog === 1 ? 'clean' : 'split';
      this.cb.onClean();
      this.cb.onSplit(this.hitsOnLog === 1);
      this.spawnChips(16);
      this.phase = 'apart';
      this.apartT = 0;
      return;
    }
    this.result = !onGrain ? 'offGrain' : this.force < FORCE_MIN ? 'weak' : 'strong';
    this.cb.onHit();
    this.spawnChips(6);
    // O golpe que não racha abre a fenda: a próxima tem mais onde entrar. Ninguém fica preso.
    this.crackWide = Math.min(16, this.crackWide + 5);
    this.phase = 'aim';
  }

  private spawnChips(count: number): void {
    for (let i = 0; i < count; i += 1) {
      this.chips.push({ x: LOG_CX + this.aim, y: LOG_CY - 10, vx: (Math.random() - 0.5) * 130, vy: -50 - Math.random() * 90, life: 0.75 });
    }
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
      this.apartT += dt / 0.6;
      if (this.apartT >= 1) {
        this.cb.onDone();
        return;
      }
    }
    this.shake = Math.max(0, this.shake - dt * 5);
    this.draw(dt);
  }

  private draw(dt: number): void {
    const shakeX = Math.sin(this.time * 70) * this.shake * 3;
    if (this.phase === 'apart') {
      const off = this.apartT * 62;
      this.drawLog(LOG_CX - off, LOG_CY + this.apartT * 22, -1);
      this.drawLog(LOG_CX + off, LOG_CY + this.apartT * 22, 1);
    } else {
      this.drawLog(LOG_CX + shakeX, LOG_CY, 0);
      this.drawMarks(shakeX);
    }
    // A força: só uma barra e a faixa boa.
    if (this.phase === 'force' || this.phase === 'swing') {
      const barX = 168;
      const barH = 90;
      const barY = 22;
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
  }

  /** O galho de topo: anéis, o veio (a rachadura) e o nó. `half` desenha só um lado. */
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
    this.disc(cx + this.knotX, cy + this.knotY, KNOT_RADIUS, '#4a2f18');
    ctx.fillStyle = '#7a5530';
    ctx.fillRect(Math.round(cx + this.knotX - 2), Math.round(cy + this.knotY - 2), 4, 4);
    // O veio: a linha por onde ele quer abrir.
    const wide = 1 + Math.floor(this.crackWide / 5);
    ctx.fillStyle = '#3a2614';
    for (let y = -LOG_R + 3; y < LOG_R - 2; y += 1) {
      const wiggle = Math.round(Math.sin(y * 0.35) * 1.5);
      ctx.fillRect(Math.round(cx + this.grainX + wiggle - wide / 2), Math.round(cy + y), wide, 1);
    }
  }

  private drawMarks(shakeX: number): void {
    const x = LOG_CX + this.aim + shakeX;
    this.rect('rgba(255, 224, 102, 0.28)', x - 1, LOG_CY - LOG_R, 2, LOG_R * 2);
    this.rect('#ffe066', x - 1, LOG_CY + LOG_R + 2, 2, 6);
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

// ── ACENDER ──────────────────────────────────────────────────────────────────────────────────────

const STRIKES_TO_SPARK = 3;
const BLOW_GAIN = 0.24;
const BLOW_TOO_FAST_S = 0.28;
const EMBER_DECAY = 0.13;
const LAYERS_TO_CATCH = 2;
const PIT_X = 100;
const PIT_Y = 128;
/** As quatro varas, como elas caíram na terra: a mesma tenda que está no mundo. */
const TENT: ReadonlyArray<readonly [number, number]> = [[-46, 40], [46, -40], [-20, 17], [20, -17]];
const STICK_PX = 84;

export interface FireCallbacks {
  onDone: (attempts: number) => void;
  onLeave: () => void;
  onStrike: () => void;
  onBlow: () => void;
  onFail: () => void;
  onCatch: () => void;
}

export class FireLightOverlay extends CraftOverlay {
  private phase: 'strike' | 'blow' | 'burn' | 'smoke' = 'strike';
  /** O último sopro foi afobado: a brasa escurece, e o teste lê daqui. */
  public tooFast = false;
  private time = 0;
  private strikes = 0;
  private ember = 0;
  private caught = 0;
  private lastBlow = -1;
  private failures = 0;
  private phaseT = 0;
  private sparks: Array<{ x: number; y: number; vy: number; vx: number; life: number; color: string }> = [];

  public constructor(private readonly cb: FireCallbacks, private readonly stickSprite: CanvasImageSource) {
    super(cb.onLeave);
    this.start();
  }

  protected act(): void {
    if (this.phase === 'strike') this.strike();
    else if (this.phase === 'blow') this.blow();
  }

  private strike(): void {
    this.strikes += 1;
    this.cb.onStrike();
    for (let i = 0; i < 8; i += 1) this.spark('#ffe066');
    if (this.strikes < STRIKES_TO_SPARK) return;
    this.strikes = 0;
    this.phase = 'blow';
    this.ember = 0.4;
    this.caught = 0;
  }

  private blow(): void {
    const gap = this.time - this.lastBlow;
    this.lastBlow = this.time;
    this.cb.onBlow();
    // Soprar demais apaga: é o sopro longo e calmo que dá ar à brasa, não a afobação.
    this.tooFast = gap < BLOW_TOO_FAST_S;
    if (this.tooFast) {
      this.ember -= 0.14;
      return;
    }
    this.ember += BLOW_GAIN;
    for (let i = 0; i < 6; i += 1) this.spark('#ffb040');
  }

  private spark(color: string): void {
    this.sparks.push({
      x: PIT_X + (Math.random() - 0.5) * 26, y: PIT_Y - 10, vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 50, life: 0.7, color,
    });
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
        if (this.caught >= LAYERS_TO_CATCH) {
          this.phase = 'burn';
          this.phaseT = 0;
        }
      } else if (this.ember <= 0) {
        this.failures += 1;
        this.cb.onFail();
        this.phase = 'smoke';
        this.phaseT = 0;
      }
    } else if (this.phase === 'smoke' && this.phaseT > 1.2) {
      this.phase = 'strike';
    } else if (this.phase === 'burn' && this.phaseT > 1.3) {
      this.cb.onDone(this.failures);
      return;
    }
    this.draw(dt);
  }

  private draw(dt: number): void {
    // O ninho de capim seco, onde a brasa nasce.
    this.disc(PIT_X, PIT_Y - 2, 13, '#6b5a24');
    for (let i = 0; i < 30; i += 1) {
      const a = i * 2.4;
      const r = 3 + (i % 9);
      this.rect(i % 3 === 0 ? '#e0cb74' : '#b49c45', PIT_X + Math.cos(a) * r * 1.5, PIT_Y - 2 + Math.sin(a) * r * 0.7, 3, 1);
    }
    // Os galhos: o próprio sprite do graveto, ampliado, nas posições em que caíram.
    for (const [offset, angle] of TENT) {
      this.ctx.save();
      this.ctx.translate(PIT_X + offset, PIT_Y + 4);
      this.ctx.rotate((angle * Math.PI) / 180);
      this.ctx.drawImage(this.stickSprite, -STICK_PX / 2, -STICK_PX, STICK_PX, STICK_PX);
      this.ctx.restore();
    }
    this.drawFlame();
    this.sparks = this.sparks.filter((spark) => spark.life > 0);
    for (const spark of this.sparks) {
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.life -= dt;
      this.rect(spark.color, spark.x, spark.y, 2, 2);
    }
    if (this.phase === 'smoke') {
      for (let i = 0; i < 8; i += 1) this.rect('rgba(200, 200, 200, 0.45)', PIT_X - 18 + i * 5, PIT_Y - 26 - ((this.phaseT * 40 + i * 13) % 50), 6, 6);
    }
    if (this.phase === 'strike') {
      for (let i = 0; i < STRIKES_TO_SPARK; i += 1) this.rect(i < this.strikes ? '#ffe066' : 'rgba(245, 239, 220, 0.3)', 86 + i * 11, 6, 7, 7);
    }
    if (this.phase === 'blow') {
      // A brasa medida: uma fila que enche, e nada escrito.
      this.rect('#201812', 40, 6, 120, 8);
      this.rect('#ff9030', 42, 8, 116 * Math.max(0, Math.min(1, this.ember)), 4);
    }
  }

  private drawFlame(): void {
    if (this.phase !== 'blow' && this.phase !== 'burn') return;
    const strength = this.phase === 'burn' ? 3 : this.caught * 1.2 + Math.max(0, this.ember);
    const height = 10 + strength * 22;
    const width = 10 + strength * 12;
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
