import { calmDt, isCalmGames } from '@/game/runtime/accessibility';
import { MinigameCaption } from '@/game/runtime/MinigameCaption';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import {
  KEY_BG, KEY_BORDER, KEY_GLYPH, PIXEL_FONT, SOFT_BLUR, pixelFrame,
} from '@/game/runtime/uiStyle';
import { createCanvas } from '@/game/platform/platform';

// OS DOIS OFÍCIOS DO MARCO, no jeito da colheita do cogumelo (ver ForagingOverlay): o mundo fica onde
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
export abstract class CraftOverlay {
  protected readonly root: HTMLDivElement;
  protected readonly canvas: HTMLCanvasElement;
  protected readonly ctx: CanvasRenderingContext2D;
  /** A tecla do gesto, no rodapé: quem não tem esse gesto a esconde. */
  protected readonly keyHint: HTMLDivElement;
  /** A frase do rodapé: o que fazer e com que tecla (runtime/MinigameCaption). Ela leva a tecla no texto. */
  protected readonly caption = new MinigameCaption();
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
    this.canvas = createCanvas();
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
    this.keyHint = key;
    // A tecla solta saiu do rodapé: a legenda diz a frase inteira, com a tecla dentro dela.
    key.style.display = 'none';
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
    this.caption.destroy();
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

  /** O maior que couber, deixando o rodapé para a legenda (runtime/MinigameCaption). */
  private readonly layout = (): void => {
    const caption = 96;
    this.root.style.paddingBottom = `${caption}px`;
    this.root.style.boxSizing = 'border-box';
    const scale = Math.max(1, Math.floor(Math.min((window.innerWidth - 16) / VIEW_W, (window.innerHeight - 40 - caption) / VIEW_H) * 8) / 8);
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
  private chips: Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string; w: number; h: number }> = [];
  /** A tora e o cepo, desenhados uma vez (ver paintStanding). */
  private readonly logArt: HTMLCanvasElement;
  private readonly blockArt: HTMLCanvasElement;

  /** `done` é quantos galhos já foram: o veio muda, e o vaivém acelera. Esta tela racha um. */
  /** O galho já rachou e avisou (ver o fim do `tick`). */
  private finished = false;

  public constructor(private readonly cb: SplitCallbacks, private readonly done: number) {
    super(cb.onLeave);
    // O veio e o nó mudam de galho para galho, sempre do mesmo jeito: a mesma partida é justa.
    const side = this.done % 2 === 0 ? 1 : -1;
    this.grainX = side * (6 + this.done * 3);
    this.knotX = -side * (10 + this.done * 2);
    this.knotY = this.done % 2 === 0 ? -14 : 12;
    // O nó no topo achatado: o mesmo lugar da regra, com o fundo pela metade (a tora é vista um pouco de cima).
    this.logArt = paintStanding(LOG_R, TOP_RY, LOG_SIDE, this.done + 1, false, { x: this.knotX, y: Math.round(this.knotY * (TOP_RY / LOG_R)), r: KNOT_RADIUS });
    this.blockArt = paintStanding(BLOCK_RX, BLOCK_RY, BLOCK_SIDE, 9, true);
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
      // Lascas de tamanhos e cores diferentes: madeira clara de dentro, a média, e um pedaço de casca.
      const kind = Math.random();
      const color = kind < 0.45 ? '#ecca93' : kind < 0.8 ? '#c09158' : '#4a321c';
      const long = Math.random() < 0.4;
      this.chips.push({
        x: LOG_CX + this.aim, y: TOP_CY - 2, vx: (Math.random() - 0.5) * 130, vy: -50 - Math.random() * 90, life: 0.75,
        color, w: long ? 3 : 1 + Math.round(Math.random()), h: long ? 1 : 1 + Math.round(Math.random()),
      });
    }
  }

  protected tick(dt: number): void {
    this.caption.show(this.phase === 'aim' ? 'split.aim' : this.phase === 'force' ? 'split.force' : null);
    this.time += calmDt(dt);
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
        // UMA vez só, como o fogo (ver FireLightOverlay.tick): o aviso não depende de quem abriu fechar a tela.
        if (!this.finished) {
          this.finished = true;
          this.cb.onDone();
        }
        return;
      }
    }
    this.shake = Math.max(0, this.shake - dt * 5);
    this.draw(dt);
  }

  private draw(dt: number): void {
    const shakeX = Math.sin(this.time * 70) * this.shake * 3;
    const { ctx } = this;
    // O cepo e a sombra dele no chão, sempre parados: a tora treme em cima deles.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    for (let y = -5; y <= 5; y += 1) {
      const w = Math.round(BLOCK_RX * 1.08 * Math.sqrt(1 - (y / 5.5) ** 2));
      ctx.fillRect(LOG_CX - w, BLOCK_CY + BLOCK_SIDE + BLOCK_RY - 2 + y, w * 2, 1);
    }
    ctx.drawImage(this.blockArt, LOG_CX - BLOCK_RX - ART_PAD, BLOCK_CY - BLOCK_RY - ART_PAD);
    if (this.phase === 'apart') {
      // As duas metades caem cada uma para um lado, por cima do cepo.
      const off = this.apartT * 48;
      const drop = Math.min(1, this.apartT * 1.6) * 10;
      this.drawLog(LOG_CX - off, TOP_CY + drop, -1);
      this.drawLog(LOG_CX + off, TOP_CY + drop, 1);
    } else {
      this.drawLog(LOG_CX + shakeX, TOP_CY, 0);
      this.drawMarks(shakeX);
    }
    if (this.phase === 'force' || this.phase === 'swing') this.drawForce();
    this.drawAxe();
    this.chips = this.chips.filter((chip) => chip.life > 0);
    for (const chip of this.chips) {
      chip.x += chip.vx * dt;
      chip.y += chip.vy * dt;
      chip.vy += 260 * dt;
      chip.life -= dt;
      this.rect(chip.color, chip.x, chip.y, chip.w, chip.h);
    }
  }

  /**
   * A tora em pé no cepo, vista um pouco de cima (o desenho pronto em `logArt`), e por cima o que muda: a fenda do
   * veio, que abre a cada golpe errado. `half` desenha só um lado — o corte é o próprio veio.
   */
  private drawLog(cx: number, cy: number, half: number): void {
    const { ctx } = this;
    const left = Math.round(cx - LOG_R - ART_PAD);
    const top = Math.round(cy - TOP_RY - ART_PAD);
    if (half === 0) {
      ctx.drawImage(this.logArt, left, top);
    } else {
      // Cada metade é o desenho cortado no veio.
      const cut = LOG_R + ART_PAD + this.grainX;
      const sx = half < 0 ? 0 : cut;
      const sw = half < 0 ? cut : this.logArt.width - cut;
      ctx.drawImage(this.logArt, sx, 0, sw, this.logArt.height, left + sx, top, sw, this.logArt.height);
      // A cara de dentro, recém-aberta: madeira clara ao longo do corte.
      const faceX = Math.round(cx + this.grainX) + (half < 0 ? -1 : 0);
      for (let y = -TOP_RY + 2; y < TOP_RY + LOG_SIDE; y += 1) {
        const inTop = y <= TOP_RY * Math.sqrt(Math.max(0, 1 - (this.grainX / LOG_R) ** 2));
        if (!inTop && y > LOG_SIDE) continue;
        this.rect(y % 4 === 0 ? '#c09158' : '#e1bd85', faceX, cy + y, 1, 1);
      }
      return;
    }
    // A FENDA do veio: escura, ondulada, mais larga a cada golpe que não rachou. Só no topo (é por onde ele abre).
    const wide = 1 + Math.floor(this.crackWide / 5);
    for (let y = -TOP_RY + 2; y < TOP_RY - 1; y += 1) {
      const half2 = LOG_R * Math.sqrt(1 - (y / TOP_RY) ** 2);
      const wiggle = Math.round(Math.sin(y * 0.7) * 1.2);
      const x = cx + this.grainX + wiggle;
      if (Math.abs(x - cx) > half2 - 3) continue;
      this.rect('#2a180c', x - wide / 2, cy + y, wide, 1);
      // A borda de cima da fenda pega luz.
      this.rect('#e1bd85', x - wide / 2 - 1, cy + y, 1, 1);
    }
    // A fenda desce pela casca da frente.
    for (let y = TOP_RY - 1; y < TOP_RY + Math.min(LOG_SIDE, 4 + this.crackWide); y += 1) {
      this.rect('#1c1008', cx + this.grainX - wide / 2, cy + y, wide, 1);
    }
  }

  /** A mira: uma linha de pontos no topo da tora, onde o machado vai cair (a sombra dele cai no mesmo lugar). */
  private drawMarks(shakeX: number): void {
    const x = Math.round(LOG_CX + this.aim + shakeX);
    for (let y = -TOP_RY + 2; y < TOP_RY - 1; y += 2) {
      const half = LOG_R * Math.sqrt(1 - (y / TOP_RY) ** 2);
      if (Math.abs(x - LOG_CX - shakeX) > half - 2) continue;
      this.rect('rgba(255, 224, 102, 0.55)', x, TOP_CY + y, 1, 1);
    }
  }

  /** A força: uma régua de madeira com a faixa fraca, a boa e a forte demais, e a seta que sobe e desce. */
  private drawForce(): void {
    const barX = 172;
    const barH = 92;
    const barY = 18;
    const w = 10;
    this.rect('#201812', barX - 3, barY - 3, w + 6, barH + 6);
    this.rect('#6b4524', barX - 2, barY - 2, w + 4, barH + 4);
    this.rect('#8e623a', barX - 2, barY - 2, w + 4, 1);
    this.rect('#8e623a', barX - 2, barY - 2, 1, barH + 4);
    this.rect('#2a1d12', barX, barY, w, barH);
    const yOf = (f: number): number => barY + barH * (1 - f);
    // Forte demais (em cima), a boa, e a fraca (embaixo).
    this.rect('#7a2e22', barX, barY, w, yOf(FORCE_MAX) - barY);
    this.rect('#a8452e', barX, barY, w, 1);
    this.rect('#5c8f30', barX, yOf(FORCE_MAX), w, yOf(FORCE_MIN) - yOf(FORCE_MAX));
    this.rect('#9fd36a', barX, yOf(FORCE_MAX), w, 1);
    this.rect('#3f6b22', barX + w - 1, yOf(FORCE_MAX), 1, yOf(FORCE_MIN) - yOf(FORCE_MAX));
    this.rect('#4a3423', barX, yOf(FORCE_MIN), w, barY + barH - yOf(FORCE_MIN));
    // Riscos da régua.
    for (let i = 1; i < 8; i += 1) this.rect('rgba(0, 0, 0, 0.35)', barX, barY + (barH * i) / 8, 3, 1);
    // A seta, do lado de fora, apontando para a régua.
    const my = Math.round(yOf(this.force));
    for (let i = 0; i < 4; i += 1) {
      this.rect('#201812', barX - 5 - i - 1, my - i - 1, 1, i * 2 + 3);
      this.rect('#ffe066', barX - 5 - i, my - i, 1, i * 2 + 1);
    }
    this.rect('#ffe066', barX - 1, my, 2, 1);
  }

  /** O machado em cima da tora: cabo de madeira com a empunhadura enrolada, a cabeça de aço com o fio claro. */
  private drawAxe(): void {
    if (this.phase === 'apart' && this.apartT > 0.5) return;
    const rest = this.phase === 'swing' ? 1 - this.swingT : 1;
    const x = Math.round(LOG_CX + this.aim);
    // A cabeça encosta no topo da tora no fim do golpe.
    const headH = 15;
    const restY = 21;
    const hitY = TOP_CY - headH + 1;
    const y = Math.round(restY + (hitY - restY) * (1 - rest));
    // A sombra do machado no topo da tora: menor e mais escura quanto mais perto.
    if (this.phase !== 'apart') {
      const near = 1 - (hitY - y) / (hitY - restY);
      const sw = Math.round(5 + near * 5);
      this.ctx.fillStyle = `rgba(20, 10, 4, ${0.18 + near * 0.3})`;
      for (let r = -1; r <= 1; r += 1) this.ctx.fillRect(x - sw + Math.abs(r) * 2, TOP_CY + r, (sw - Math.abs(r) * 2) * 2 + 1, 1);
    }
    // O CABO: 3 px de madeira (luz, meio, sombra) com contorno, a empunhadura enrolada no alto e o castão.
    const handleTop = y - 19;
    this.rect('#201812', x - 2, handleTop, 5, 20);
    for (let yy = handleTop + 1; yy < y + 1; yy += 1) {
      const grip = yy < handleTop + 8;
      if (grip) {
        const band = Math.floor((yy - handleTop) / 2) % 2 === 0;
        this.rect(band ? '#7a4a33' : '#4e2e20', x - 1, yy, 3, 1);
        if (band) this.rect('#9c6a4a', x - 1, yy, 1, 1);
      } else {
        this.rect('#d6a468', x - 1, yy, 1, 1);
        this.rect((yy % 7) === 0 ? '#6b4524' : '#9a6a3c', x, yy, 1, 1);
        this.rect('#6b4524', x + 1, yy, 1, 1);
      }
    }
    this.rect('#201812', x - 3, handleTop - 2, 7, 3);
    this.rect('#8e623a', x - 2, handleTop - 1, 5, 1);
    // A CABEÇA, vista pelo fio (o fio corre ao longo do veio, de frente para trás): uma cunha grossa no olho que
    // afina até o fio claro — é ela que entra na fenda e abre a tora.
    for (let row = 0; row < headH; row += 1) {
      const half = row < 3 ? 7 : Math.max(1, 7 - Math.round((row - 2) * 0.55));
      const yy = y + row;
      this.rect('#1b1a1e', x - half - 1, yy, half * 2 + 3, 1);
      for (let dx = -half; dx <= half; dx += 1) {
        let c: string;
        if (row >= headH - 2) c = row === headH - 1 ? '#f4f4ea' : '#dcdcd2';
        else if (row === headH - 4) c = '#c9c9c0';
        else if (dx <= -half + 1) c = '#c9c9c0';
        else if (dx >= half - 1) c = '#5a5f66';
        else c = row < 3 ? '#6e737a' : '#9a9ca2';
        this.rect(c, x + dx, yy, 1, 1);
      }
    }
    // O olho do machado: o cabo aparecendo por cima, e a cunha de ferro.
    this.rect('#9a6a3c', x - 1, y, 3, 2);
    this.rect('#3a3c42', x, y + 4, 1, 1);
    // O brilho no fio, que corre devagar.
    const gleam = Math.round(((this.time * 0.7) % 1) * 18) - 9;
    if (Math.abs(gleam) <= 8) this.rect('#ffffff', x + gleam, y + headH - 1, 2, 1);
  }
}

// ── O DESENHO DA TORA E DO CEPO ─────────────────────────────────────────────────────────────────────
// Feitos uma vez, pixel a pixel, num canvas à parte: a tora em pé vista um pouco de cima (o topo cortado em elipse,
// com os anéis, o cerne, o alburno, o miolo e as rachaduras de secar; a casca de lado, em sulcos), e o cepo velho
// embaixo dela, mais largo, de madeira acinzentada e cheio de marcas de machado.

/** O topo da tora: centro, raio de lado (o da regra do jogo) e de fundo (vista de cima, achatado pela metade). */
const TOP_CY = 64;
const TOP_RY = 21;
const LOG_SIDE = 24;
const BLOCK_CY = TOP_CY + LOG_SIDE + 3;
const BLOCK_RX = 58;
const BLOCK_RY = 26;
const BLOCK_SIDE = 15;
const ART_PAD = 2;

const hash2 = (x: number, y: number, s: number): number => {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

type Pix = (x: number, y: number, c: string) => void;
const artCanvas = (w: number, h: number, draw: (put: Pix) => void): HTMLCanvasElement => {
  const canvas = createCanvas();
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  draw((x, y, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  });
  return canvas;
};

/** A madeira do topo, do claro ao escuro (6 tons) — a luz vem de cima e da esquerda. */
const END_GRAIN = ['#ecca93', '#e1bd85', '#d2a96e', '#c09158', '#a87a45', '#8c6236'];
const BARK = ['#7d5a37', '#5c3f24', '#4a321c', '#3a2614'];
const OUTLINE = '#201812';

/** Uma tora (ou o cepo) em pé: o lado de casca e o topo cortado. `old` = o cepo: madeira acinzentada, cheia de marca. */
const paintStanding = (
  rx: number, ry: number, side: number, seed: number, old: boolean,
  knot?: { x: number; y: number; r: number },
): HTMLCanvasElement => {
  const W = rx * 2 + ART_PAD * 2 + 1;
  const H = ry * 2 + side + ART_PAD * 2 + 1;
  const cx = rx + ART_PAD;
  const cy = ry + ART_PAD;
  const grain = old ? ['#c4ae8c', '#b39c79', '#a08a68', '#8e7a5c', '#7a684e', '#665640'] : END_GRAIN;
  return artCanvas(W, H, (put) => {
    // O LADO: a casca em sulcos verticais, mais clara à esquerda (luz) e escura à direita, e a sombra no pé.
    for (let dx = -rx; dx <= rx; dx += 1) {
      const t = dx / rx;
      const bottom = side + ry * Math.sqrt(Math.max(0, 1 - t * t));
      for (let y = 0; y <= bottom; y += 1) {
        const ridge = hash2(dx, Math.floor((y + hash2(dx, 0, seed) * 6) / 5), seed + 1) < 0.5;
        let shade = (t + 1) / 2 * 2.4 + (ridge ? 0 : 0.9);
        if (y > bottom - 3) shade += 0.8;
        const c = BARK[Math.min(3, Math.max(0, Math.floor(shade)))];
        put(cx + dx, cy + y, c);
      }
      // O contorno de baixo.
      put(cx + dx, cy + bottom + 1, OUTLINE);
    }
    // Musgo na casca (só a tora; o cepo é velho e seco).
    if (!old) {
      for (let i = 0; i < 18; i += 1) {
        const dx = Math.round(-rx + 3 + hash2(i, 1, seed) * rx * 0.9);
        const y = Math.round(side * 0.4 + hash2(i, 2, seed) * side * 0.9);
        put(cx + dx, cy + y + ry * 0.4, hash2(i, 3, seed) < 0.5 ? '#6f8f3e' : '#4c6a32');
      }
    }
    // Os contornos de lado.
    for (let y = 0; y <= side; y += 1) { put(cx - rx - 1, cy + y, OUTLINE); put(cx + rx + 1, cy + y, OUTLINE); }
    // O TOPO cortado.
    for (let dy = -ry - 1; dy <= ry + 1; dy += 1) {
      for (let dx = -rx - 1; dx <= rx + 1; dx += 1) {
        const r = Math.hypot(dx / rx, dy / ry);
        const ang = Math.atan2(dy / ry, dx / rx);
        const wob = Math.sin(ang * 3 + seed) * 0.018 + Math.sin(ang * 7 + seed * 2) * 0.012;
        const rr = r + wob;
        if (rr > 1.04) continue;
        if (rr > 0.97) { put(cx + dx, cy + dy, OUTLINE); continue; }
        // A casca vista de cima: um anel escuro e granulado.
        if (rr > 0.89) {
          put(cx + dx, cy + dy, hash2(dx, dy, seed + 2) < 0.4 ? BARK[3] : BARK[2]);
          continue;
        }
        // O câmbio (a linha clara logo dentro da casca), o alburno e o cerne.
        let tone = rr > 0.84 ? 0 : rr > 0.55 ? 1 : 3;
        // Os anéis de crescimento: linhas finas mais escuras, um pouco tortas.
        const rings = old ? 9 : 12;
        const ring = (rr * rings + Math.sin(ang * 5 + seed) * 0.08) % 1;
        if (rr < 0.84 && ring < 0.16) tone += 1;
        // A luz: cima e esquerda clareiam, baixo e direita escurecem.
        const light = (-dx / rx - dy / ry) * 0.7;
        tone -= Math.round(light);
        // O granulado.
        if (hash2(dx, dy, seed + 3) < 0.12) tone += 1;
        let c = grain[Math.min(5, Math.max(0, tone))];
        // O miolo e as rachaduras de secar, saindo do meio.
        if (rr < 0.07) c = old ? '#4a3c2c' : '#5c3f24';
        // Duas rachaduras de secar, curtas, que não chegam ao miolo (encontrando-se nele, viravam um desenho).
        for (const a of [0.9 + seed, 3.7 + seed]) {
          const da = Math.abs(((ang - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (da < 0.03 && rr > 0.22 && rr < 0.42) c = old ? '#4a3c2c' : '#6f4a28';
        }
        put(cx + dx, cy + dy, c);
      }
    }
    // O NÓ (só na tora): um olho escuro com anéis próprios. A lâmina não entra nele.
    if (knot) {
      const kx = cx + knot.x;
      const ky = cy + knot.y;
      for (let dy = -knot.r; dy <= knot.r; dy += 1) {
        for (let dx = -knot.r; dx <= knot.r; dx += 1) {
          const r = Math.hypot(dx / knot.r, dy / (knot.r * 0.62));
          if (r > 1) continue;
          const c = r > 0.82 ? '#3a2614' : r > 0.6 ? '#6b4524' : r > 0.35 ? '#4a2f18' : r > 0.15 ? '#7a5530' : '#2e1c0e';
          put(kx + dx, ky + dy, c);
        }
      }
    }
    // O CEPO: as marcas de machadadas antigas no topo, cortes curtos e retos.
    if (old) {
      for (let i = 0; i < 9; i += 1) {
        const mx = Math.round((hash2(i, 5, seed) - 0.5) * rx * 1.5);
        const my = Math.round((hash2(i, 6, seed) - 0.5) * ry * 1.3);
        if (Math.hypot(mx / rx, my / ry) > 0.8) continue;
        const len = 3 + Math.floor(hash2(i, 7, seed) * 4);
        const dir = hash2(i, 8, seed) < 0.5 ? 1 : -1;
        for (let k = 0; k < len; k += 1) {
          put(cx + mx + k, cy + my + dir * Math.floor(k / 2), '#4a3c2c');
          put(cx + mx + k, cy + my + dir * Math.floor(k / 2) - 1, '#d6c4a2');
        }
      }
    }
  });
};

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
  /** O fogo já acendeu e avisou (ver o fim do `tick`). */
  private finished = false;
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
    this.tooFast = !isCalmGames() && gap < BLOW_TOO_FAST_S;
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
    this.caption.show(this.phase === 'strike' ? 'fire.strike' : this.phase === 'blow' ? 'fire.blow' : null);
    this.time += dt;
    this.phaseT += dt;
    if (this.phase === 'blow') {
      this.ember -= EMBER_DECAY * calmDt(dt);
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
      // UMA vez só: quem abriu fecha a tela no onDone, mas o aviso não pode depender disso (a cada quadro aberto,
      // o fogo "acenderia" de novo).
      if (!this.finished) {
        this.finished = true;
        this.cb.onDone(this.failures);
      }
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
