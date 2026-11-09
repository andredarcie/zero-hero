import { t } from '@/game/i18n/i18n';
import {
  ensureNoteStyle, fitNotePaper, paperClip, WRITE_MS_PER_CHAR, WRITE_START_MS,
} from '@/game/runtime/ForagingOverlay';
import { CraftOverlay } from '@/game/runtime/WoodcraftOverlays';
import {
  paperTexture, seededRandom, seedOf, SOFT_BLUR, tornEdge,
} from '@/game/runtime/uiStyle';
import { createCanvas } from '@/game/platform/platform';

// OS DOIS OFÍCIOS DA THEA, no mesmo palco dos do Marco (ver CraftOverlay): o mundo embaçado, a coisa
// sozinha no meio, nada escrito na tela e nenhuma derrota. Polir é esfregar até enxergar; observar é
// procurar no escuro e esperar o foco.

const VIEW_W = 200;
const VIEW_H = 150;

/** Da tela do navegador para os pixels do desenho: o canvas é escalado por CSS. */
const toView = (canvas: HTMLCanvasElement, event: PointerEvent): { x: number; y: number } => {
  const box = canvas.getBoundingClientRect();
  return { x: ((event.clientX - box.left) / box.width) * VIEW_W, y: ((event.clientY - box.top) / box.height) * VIEW_H };
};

// ── POLIR ────────────────────────────────────────────────────────────────────────────────────────

const LENS_CX = 100;
const LENS_CY = 72;
const LENS_R = 56;
/** A névoa que a pedra áspera deixa, e que a fina tira. */
const MIST_ALPHA = 0.5;
const CELL = 8;
const CELLS = Math.ceil((LENS_R * 2) / CELL);
const RUB_RADIUS = 15;
/** Quanto um pixel de esfregada tira do grão: duas passadas por cima limpam. */
const RUB_RATE = 0.042;
/** Quem só aperta a tecla (ou toca sem arrastar) esfrega este tanto, em espiral. */
const TAP_TRAVEL_PX = 90;
/** Abaixo disto a etapa acaba: ninguém caça o último grão. */
const PHASE_DONE_AT = 0.07;
const SHINE_S = 1.1;

type LensPhase = 'coarse' | 'fine' | 'shine';

export interface LensCallbacks {
  onDone: () => void;
  onLeave: () => void;
  onRub: () => void;
  onPhase: () => void;
}

/** O vidro bruto: grão de pixel, com os riscos da pedra. Fica por cima da paisagem até ser polido. */
const frostOf = (size: number): HTMLCanvasElement => {
  const canvas = createCanvas();
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const random = seededRandom(seedOf('thea-glass'));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const grain = 150 + Math.floor(random() * 4) * 12;
      ctx.fillStyle = `rgb(${grain}, ${grain + 18}, ${grain + 12})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.fillStyle = 'rgba(92, 112, 108, 0.5)';
  for (let i = 0; i < 70; i += 1) {
    const x = Math.floor(random() * size);
    const y = Math.floor(random() * size);
    const w = 2 + Math.floor(random() * 9);
    for (let k = 0; k < w; k += 1) ctx.fillRect(x + k, y + Math.floor(k * 0.45), 1, 1);
  }
  return canvas;
};

export class LensOverlay extends CraftOverlay {
  public phase: LensPhase = 'coarse';
  /** O grão em cada célula, de 1 (fosco) a 0 (limpo), por etapa. */
  private grit = new Float32Array(CELLS * CELLS).fill(1);
  private readonly blur = document.createElement('div');
  private holeKey = '';
  private readonly frost = frostOf(LENS_R * 2);
  private puck = { x: LENS_CX, y: LENS_CY };
  private dragging = false;
  private tapLeft = 0;
  private spiral = 0;
  private time = 0;
  private shineT = 0;
  private rubClock = 0;
  private flash = 0;
  private dust: Array<{ x: number; y: number; vx: number; vy: number; life: number }> = [];

  public constructor(private readonly cb: LensCallbacks) {
    super(cb.onLeave);
    // O embaçado sai do palco e vira uma camada com um furo redondo: pelo vidro se vê o próprio mundo,
    // vivo e na resolução dele. É nas árvores que se vê se a lente está boa.
    this.root.style.background = 'none';
    this.root.style.backdropFilter = 'none';
    this.root.style.setProperty('-webkit-backdrop-filter', 'none');
    this.blur.style.cssText = `position: absolute; inset: 0; pointer-events: none; ${SOFT_BLUR}`;
    this.root.prepend(this.blur);
    this.canvas.style.position = 'relative';
    this.root.addEventListener('pointerdown', this.onDown);
    this.root.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    this.start();
  }

  public override destroy(): void {
    window.removeEventListener('pointerup', this.onUp);
    super.destroy();
  }

  /** O quanto ainda falta nesta etapa, de 0 a 1. O playtest também lê daqui. */
  public get remaining(): number {
    let sum = 0;
    let count = 0;
    for (let row = 0; row < CELLS; row += 1) {
      for (let col = 0; col < CELLS; col += 1) {
        if (!this.inLens(col, row)) continue;
        sum += this.grit[row * CELLS + col];
        count += 1;
      }
    }
    return count ? sum / count : 0;
  }

  private inLens(col: number, row: number): boolean {
    const dx = (col + 0.5) * CELL - LENS_R;
    const dy = (row + 0.5) * CELL - LENS_R;
    return dx * dx + dy * dy <= (LENS_R + CELL) * (LENS_R + CELL);
  }

  private readonly onDown = (event: PointerEvent): void => {
    // O toque arrasta a pedra: a espiral é só de quem joga na tecla.
    this.tapLeft = 0;
    this.dragging = true;
    this.puck = toView(this.canvas, event);
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    const at = toView(this.canvas, event);
    this.rubTo(at.x, at.y);
  };

  private readonly onUp = (): void => { this.dragging = false; };

  /** A tecla (ou o toque sem arrasto) dá uma volta da espiral: dá para polir só com um botão. */
  protected act(): void {
    if (this.phase !== 'shine') this.tapLeft += TAP_TRAVEL_PX;
  }

  private rubTo(x: number, y: number): void {
    if (this.phase === 'shine') return;
    const dist = Math.hypot(x - this.puck.x, y - this.puck.y);
    const steps = Math.max(1, Math.ceil(dist / 4));
    const from = { ...this.puck };
    for (let i = 1; i <= steps; i += 1) {
      this.rubAt(from.x + ((x - from.x) * i) / steps, from.y + ((y - from.y) * i) / steps, dist / steps);
    }
    this.puck = { x, y };
    if (dist > 0.5) {
      this.rubClock -= dist;
      if (this.rubClock <= 0) {
        this.rubClock = 34;
        this.cb.onRub();
        this.dust.push({ x, y, vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 30, life: 0.5 });
      }
    }
    if (this.remaining < PHASE_DONE_AT) this.nextPhase();
  }

  private rubAt(x: number, y: number, travel: number): void {
    for (let row = 0; row < CELLS; row += 1) {
      for (let col = 0; col < CELLS; col += 1) {
        const cx = LENS_CX - LENS_R + (col + 0.5) * CELL;
        const cy = LENS_CY - LENS_R + (row + 0.5) * CELL;
        const d = Math.hypot(cx - x, cy - y);
        if (d > RUB_RADIUS) continue;
        const i = row * CELLS + col;
        this.grit[i] = Math.max(0, this.grit[i] - travel * RUB_RATE * (1 - d / RUB_RADIUS));
      }
    }
  }

  private nextPhase(): void {
    this.cb.onPhase();
    this.flash = 1;
    if (this.phase === 'coarse') {
      this.phase = 'fine';
      this.grit.fill(1);
      return;
    }
    this.grit.fill(0);
    this.phase = 'shine';
    this.shineT = 0;
  }

  protected tick(dt: number): void {
    this.caption.show(this.phase === 'shine' ? null : 'lens');
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt * 2.4);
    if (this.tapLeft > 0 && this.phase !== 'shine') {
      const travel = Math.min(this.tapLeft, 340 * dt);
      this.tapLeft -= travel;
      // Uma espiral que vai e volta do centro à borda: cobre o vidro inteiro sem o jogador mirar.
      this.spiral += travel / 9;
      const radius = (0.5 - 0.5 * Math.cos(this.spiral * 0.13)) * (LENS_R - 6);
      this.rubTo(LENS_CX + Math.cos(this.spiral) * radius, LENS_CY + Math.sin(this.spiral) * radius);
    }
    if (this.phase === 'shine') {
      this.shineT += dt / SHINE_S;
      if (this.shineT >= 1) {
        this.cb.onDone();
        return;
      }
    }
    this.draw(dt);
  }

  /** O furo acompanha o vidro, que muda de tamanho com a janela. */
  private placeHole(): void {
    const box = this.canvas.getBoundingClientRect();
    const scale = box.width / VIEW_W;
    const mask = `radial-gradient(circle ${(LENS_R + 1) * scale}px at ${box.left + LENS_CX * scale}px ${box.top + LENS_CY * scale}px, transparent 99%, #000 100%)`;
    if (mask === this.holeKey) return;
    this.holeKey = mask;
    this.blur.style.maskImage = mask;
    this.blur.style.setProperty('-webkit-mask-image', mask);
  }

  private draw(dt: number): void {
    const { ctx } = this;
    this.placeHole();
    // A bancada: um disco de madeira sob o vidro.
    this.disc(LENS_CX, LENS_CY + 3, LENS_R + 7, '#201812');
    this.disc(LENS_CX, LENS_CY + 2, LENS_R + 5, '#6b4a2c');
    this.disc(LENS_CX, LENS_CY, LENS_R + 2, '#201812');
    ctx.save();
    ctx.beginPath();
    ctx.arc(LENS_CX, LENS_CY, LENS_R, 0, Math.PI * 2);
    ctx.clip();
    ctx.clearRect(LENS_CX - LENS_R, LENS_CY - LENS_R, LENS_R * 2, LENS_R * 2);
    const left = LENS_CX - LENS_R;
    const top = LENS_CY - LENS_R;
    for (let row = 0; row < CELLS; row += 1) {
      for (let col = 0; col < CELLS; col += 1) {
        const value = this.grit[row * CELLS + col];
        const x = left + col * CELL;
        const y = top + row * CELL;
        if (this.phase === 'fine' || this.phase === 'coarse') {
          // O que a pedra áspera limpa ainda fica leitoso: é a névoa que a fina vem tirar.
          ctx.fillStyle = `rgba(226, 236, 232, ${MIST_ALPHA * (this.phase === 'coarse' ? 1 : value)})`;
          ctx.fillRect(x, y, CELL, CELL);
        }
        if (this.phase === 'coarse' && value > 0.01) {
          // No grosso, o vidro ainda é pedra: bruto, com a marca da areia.
          ctx.globalAlpha = Math.min(1, value * 1.15);
          ctx.drawImage(this.frost, col * CELL, row * CELL, CELL, CELL, x, y, CELL, CELL);
          ctx.globalAlpha = 1;
        }
      }
    }
    // O brilho que passa quando a lente fica boa.
    if (this.phase === 'shine') {
      const x = LENS_CX - LENS_R - 30 + this.shineT * (LENS_R * 2 + 60);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      for (let y = 0; y < LENS_R * 2; y += 1) ctx.fillRect(Math.round(x - y * 0.4), LENS_CY - LENS_R + y, 9, 1);
    }
    ctx.restore();
    if (this.flash > 0) {
      ctx.save();
      ctx.globalAlpha = this.flash * 0.6;
      this.disc(LENS_CX, LENS_CY, LENS_R, '#ffffff');
      ctx.restore();
    }
    this.drawPuck();
    this.dust = this.dust.filter((grain) => grain.life > 0);
    for (const grain of this.dust) {
      grain.x += grain.vx * dt;
      grain.y += grain.vy * dt;
      grain.vy += 90 * dt;
      grain.life -= dt;
      this.rect(this.phase === 'fine' ? '#e6a0a0' : '#d9c28c', grain.x, grain.y, 2, 2);
    }
    // As duas etapas: duas pedrinhas, e nada escrito.
    this.rect(this.phase === 'coarse' ? '#c9a15e' : '#6fa83c', 90, 3, 8, 5);
    this.rect(this.phase === 'shine' ? '#6fa83c' : this.phase === 'fine' ? '#e6a0a0' : 'rgba(245, 239, 220, 0.3)', 102, 3, 8, 5);
  }

  /** A pedra de polir: a áspera na primeira etapa, a de rouge na segunda. */
  private drawPuck(): void {
    if (this.phase === 'shine') return;
    const { x, y } = this.puck;
    const wobble = Math.sin(this.time * 12) * (this.dragging || this.tapLeft > 0 ? 1 : 0);
    this.disc(x, y + 2 + wobble, 11, '#201812');
    this.disc(x, y + wobble, 10, this.phase === 'coarse' ? '#a98a58' : '#c0605c');
    this.disc(x - 2, y - 2 + wobble, 5, this.phase === 'coarse' ? '#c9a878' : '#de8a84');
  }
}

// ── OBSERVAR ─────────────────────────────────────────────────────────────────────────────────────

export const SKY_TARGETS = ['moon', 'jupiter', 'saturn', 'pleiades'] as const;
export type SkyTarget = (typeof SKY_TARGETS)[number];

const SKY_W = 460;
const SKY_H = 300;
const EYE_CX = 100;
const EYE_CY = 66;
const EYE_R = 58;
const AIM_SPEED = 92;
/** Perto assim do centro, o foco fecha. */
const LOCK_R = 15;
const FOCUS_S = 0.85;
/** Sem achar nada por este tempo, uma setinha na borda aponta o próximo. */
const NUDGE_AFTER_S = 5;
const ART_SIZE = 64;
const STAR_COUNT = 420;

const POSITIONS: Readonly<Record<SkyTarget, { x: number; y: number; size: number }>> = {
  moon: { x: 92, y: 212, size: 76 },
  jupiter: { x: 372, y: 66, size: 76 },
  saturn: { x: 66, y: 54, size: 80 },
  pleiades: { x: 342, y: 236, size: 80 },
};

export interface SkyCallbacks {
  onFound: (target: SkyTarget) => void;
  onDone: () => void;
  onLeave: () => void;
  onFocus: () => void;
  onCard: () => void;
}

/** O desenho de cada alvo, visto pela lente boa: em 64×64 e pixel inteiro. */
const targetArt = (target: SkyTarget): HTMLCanvasElement => {
  const canvas = createCanvas();
  canvas.width = ART_SIZE;
  canvas.height = ART_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const c = ART_SIZE / 2;
  const dot = (x: number, y: number, r: number, color: string): void => {
    ctx.fillStyle = color;
    for (let dy = -r; dy <= r; dy += 1) {
      const w = Math.round(Math.sqrt(r * r - dy * dy));
      ctx.fillRect(Math.round(x - w), Math.round(y + dy), w * 2 + 1, 1);
    }
  };
  if (target === 'moon') {
    dot(c, c, 28, '#d9d3b8');
    // Os mares (lava antiga) e as crateras, com a borda clara do lado da luz.
    for (const [x, y, r] of [[22, 22, 9], [36, 18, 7], [40, 32, 8], [26, 36, 6]] as const) dot(x, y, r, '#a5a08a');
    for (const [x, y, r] of [[18, 42, 3], [44, 46, 4], [32, 50, 3], [48, 22, 3], [14, 30, 2], [30, 10, 2], [50, 36, 2]] as const) {
      dot(x, y, r + 1, '#f2edd4');
      dot(x + 1, y + 1, r, '#8c8772');
    }
    return canvas;
  }
  if (target === 'jupiter') {
    dot(c, c, 15, '#e4c89c');
    const bands: ReadonlyArray<readonly [number, number, string]> = [[-11, 2, '#b08a62'], [-6, 3, '#a4744e'], [1, 2, '#c49a70'], [5, 4, '#9c6c48'], [11, 2, '#c49a70']];
    for (const [dy, h, color] of bands) {
      const w = Math.round(Math.sqrt(Math.max(0, 15 * 15 - dy * dy)));
      ctx.fillStyle = color;
      ctx.fillRect(c - w, c + dy, w * 2 + 1, h);
    }
    ctx.fillStyle = '#c8533a';
    ctx.fillRect(c + 4, c + 6, 5, 2);
    // Io, Europa, Ganimedes e Calisto: quatro pontos na mesma linha, como Galileu os desenhou.
    ctx.fillStyle = '#f4f0e0';
    for (const x of [3, 10, 50, 58]) ctx.fillRect(x, c - 1, 3, 3);
    return canvas;
  }
  if (target === 'saturn') {
    // O anel de trás, o planeta, e o anel da frente por cima dele.
    const ring = (front: boolean): void => {
      for (let a = 0; a < 360; a += 1) {
        const rad = (a * Math.PI) / 180;
        const isFront = Math.sin(rad) > 0;
        if (isFront !== front) continue;
        for (const [rx, color] of [[29, '#c2b48a'], [26, '#e0d2a4'], [23, '#b0a27a']] as const) {
          ctx.fillStyle = color;
          ctx.fillRect(Math.round(c + Math.cos(rad) * rx), Math.round(c + Math.sin(rad) * rx * 0.34), 1, 1);
        }
      }
    };
    ring(false);
    dot(c, c, 13, '#e6cf98');
    ctx.fillStyle = '#c9ad74';
    ctx.fillRect(c - 12, c - 5, 25, 2);
    ctx.fillRect(c - 13, c + 3, 27, 2);
    ring(true);
    return canvas;
  }
  // As Plêiades: as sete brilhantes, e as dezenas que só aparecem pela lente.
  const random = seededRandom(seedOf('pleiades'));
  for (let i = 0; i < 46; i += 1) {
    const x = Math.round(6 + random() * 52);
    const y = Math.round(6 + random() * 52);
    ctx.fillStyle = random() > 0.5 ? '#a8c4f0' : '#dfe8fa';
    ctx.fillRect(x, y, 1, 1);
  }
  for (const [x, y] of [[20, 26], [28, 18], [34, 24], [40, 20], [42, 32], [30, 36], [22, 42]] as const) {
    ctx.fillStyle = '#7fa8f0';
    ctx.fillRect(x - 2, y, 5, 1);
    ctx.fillRect(x, y - 2, 1, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x - 1, y - 1, 3, 3);
  }
  return canvas;
};

/** O tempo de o papel dobrar (zh-paper-out). */
const NOTE_FOLD_MS = 340;
const NOTE_WRAP_CSS = 'position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 14px; pointer-events: none;';

export class SkyOverlay extends CraftOverlay {
  /** O alvo cuja ficha está aberta. O playtest lê daqui. */
  public reading: SkyTarget | null = null;
  public readonly found: Set<SkyTarget>;
  public aim = { x: SKY_W / 2, y: SKY_H / 2 };
  private focus: Record<SkyTarget, number> = {
    moon: 0, jupiter: 0, saturn: 0, pleiades: 0,
  };
  private readonly arts = new Map<SkyTarget, HTMLCanvasElement>();
  private readonly icons = new Map<SkyTarget, HTMLCanvasElement>();
  private readonly mosaic = createCanvas();
  private readonly stars: Array<{ x: number; y: number; bright: number; phase: number; blue: boolean }> = [];
  private readonly held = new Set<string>();
  private drag: { x: number; y: number } | null = null;
  private note?: { wrap: HTMLDivElement; paper: HTMLDivElement; openedAt: number; writeMs: number };
  private folding = false;
  private time = 0;
  private sinceFind = 0;
  private lastFocusSound = 0;

  public constructor(private readonly cb: SkyCallbacks, found: readonly SkyTarget[]) {
    super(cb.onLeave);
    this.found = new Set(found);
    const random = seededRandom(seedOf('thea-sky'));
    for (let i = 0; i < STAR_COUNT; i += 1) {
      this.stars.push({ x: random() * SKY_W, y: random() * SKY_H, bright: random(), phase: random() * 6.28, blue: random() > 0.7 });
    }
    for (const target of SKY_TARGETS) {
      const art = targetArt(target);
      this.arts.set(target, art);
      const icon = createCanvas();
      icon.width = 16;
      icon.height = 16;
      const ctx = icon.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(art, 0, 0, 16, 16);
      }
      this.icons.set(target, icon);
    }
    this.mosaic.width = ART_SIZE;
    this.mosaic.height = ART_SIZE;
    // A tecla não é a instrução aqui: o gesto é mirar, e a setinha da borda ensina isso.
    this.keyHint.style.display = 'none';
    ensureNoteStyle();
    this.root.addEventListener('pointerdown', this.onDown);
    this.root.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    this.start();
  }

  public override destroy(): void {
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    super.destroy();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!event.code.startsWith('Arrow') && !['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return;
    event.preventDefault();
    event.stopPropagation();
    this.held.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  private readonly onDown = (event: PointerEvent): void => {
    this.drag = toView(this.canvas, event);
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (!this.drag) return;
    const at = toView(this.canvas, event);
    // Arrastar o céu: ele vem com o dedo, então a mira anda ao contrário.
    this.moveAim(this.drag.x - at.x, this.drag.y - at.y);
    this.drag = at;
  };

  private readonly onUp = (): void => { this.drag = null; };

  private moveAim(dx: number, dy: number): void {
    this.aim.x = Math.max(0, Math.min(SKY_W, this.aim.x + dx));
    this.aim.y = Math.max(0, Math.min(SKY_H, this.aim.y + dy));
  }

  /** A ficha é a do cogumelo: um toque termina a escrita, outro dobra o papel. Observar não tem botão. */
  protected act(): void {
    const { note } = this;
    if (!note || this.folding) return;
    const elapsed = performance.now() - note.openedAt;
    if (elapsed < note.writeMs && !note.paper.classList.contains('zh-done')) {
      if (elapsed > 300) note.paper.classList.add('zh-done');
      return;
    }
    this.folding = true;
    note.paper.classList.add('zh-off');
    window.setTimeout(() => {
      if (this.destroyed) return;
      note.wrap.remove();
      this.note = undefined;
      this.folding = false;
      this.reading = null;
      this.canvas.style.visibility = '';
      this.sinceFind = 0;
      if (SKY_TARGETS.every((target) => this.found.has(target))) this.cb.onDone();
    }, NOTE_FOLD_MS);
  }

  private showCard(target: SkyTarget): void {
    this.reading = target;
    this.cb.onCard();
    // Como na colheita: quando o papel sobe, ele é a única coisa na tela.
    this.canvas.style.visibility = 'hidden';
    const wrap = document.createElement('div');
    wrap.style.cssText = NOTE_WRAP_CSS;
    const paper = document.createElement('div');
    paper.className = 'zh-note';
    const sheet = document.createElement('div');
    sheet.className = 'zh-note-paper';
    sheet.style.clipPath = tornEdge(seedOf(target));
    const texture = paperTexture();
    if (texture) sheet.style.backgroundImage = `url(${texture})`;

    const night = createCanvas();
    night.width = ART_SIZE;
    night.height = ART_SIZE;
    const nightCtx = night.getContext('2d');
    const art = this.arts.get(target);
    if (nightCtx && art) {
      nightCtx.fillStyle = '#070b18';
      nightCtx.fillRect(0, 0, ART_SIZE, ART_SIZE);
      nightCtx.drawImage(art, 0, 0);
    }
    const photo = document.createElement('div');
    photo.className = 'zh-note-photo';
    const shot = document.createElement('div');
    shot.className = 'zh-note-shot';
    const img = document.createElement('img');
    img.src = night.toDataURL();
    img.alt = t(`sky.${target}.name`);
    shot.appendChild(img);
    photo.append(shot, paperClip());

    let at = WRITE_START_MS;
    const ink = (text: string): HTMLSpanElement => {
      const span = document.createElement('span');
      const d = Math.max(280, Math.min(1100, text.length * WRITE_MS_PER_CHAR));
      span.classList.add('zh-ink');
      span.style.setProperty('--at', `${at}ms`);
      span.style.setProperty('--d', `${d}ms`);
      span.textContent = text;
      at += d + 90;
      return span;
    };
    const name = document.createElement('h2');
    name.className = 'zh-note-name';
    name.appendChild(ink(t(`sky.${target}.name`)));
    const notes = document.createElement('ul');
    notes.className = 'zh-note-notes';
    for (const key of ['seen', 'fact']) {
      const li = document.createElement('li');
      li.appendChild(ink(`~ ${t(`sky.${target}.${key}`)}`));
      notes.appendChild(li);
    }
    sheet.append(photo, name, notes);
    paper.appendChild(sheet);
    wrap.appendChild(paper);
    this.root.appendChild(wrap);
    fitNotePaper(paper);
    paper.classList.add('zh-on');
    this.note = { wrap, paper, openedAt: performance.now(), writeMs: at };
  }

  protected tick(dt: number): void {
    this.caption.show(this.note ? 'card' : 'sky');
    this.time += dt;
    if (this.reading) {
      this.draw();
      return;
    }
    this.sinceFind += dt;
    const left = this.held.has('ArrowLeft') || this.held.has('KeyA') ? 1 : 0;
    const right = this.held.has('ArrowRight') || this.held.has('KeyD') ? 1 : 0;
    const up = this.held.has('ArrowUp') || this.held.has('KeyW') ? 1 : 0;
    const down = this.held.has('ArrowDown') || this.held.has('KeyS') ? 1 : 0;
    this.moveAim((right - left) * AIM_SPEED * dt, (down - up) * AIM_SPEED * dt);
    for (const target of SKY_TARGETS) {
      const pos = POSITIONS[target];
      const near = Math.hypot(pos.x - this.aim.x, pos.y - this.aim.y) < LOCK_R;
      const before = this.focus[target];
      this.focus[target] = Math.max(0, Math.min(1, before + (near ? dt / FOCUS_S : -dt / FOCUS_S)));
      if (near && before < 1 && this.time - this.lastFocusSound > 0.28) {
        this.lastFocusSound = this.time;
        this.cb.onFocus();
      }
      if (near && this.focus[target] >= 1 && !this.found.has(target)) {
        this.found.add(target);
        this.cb.onFound(target);
        this.showCard(target);
        break;
      }
    }
    this.draw();
  }

  private draw(): void {
    const { ctx } = this;
    this.disc(EYE_CX, EYE_CY, EYE_R + 5, '#201812');
    this.disc(EYE_CX, EYE_CY, EYE_R + 3, '#8e7a4a');
    ctx.save();
    ctx.beginPath();
    ctx.arc(EYE_CX, EYE_CY, EYE_R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#070b18';
    ctx.fillRect(EYE_CX - EYE_R, EYE_CY - EYE_R, EYE_R * 2, EYE_R * 2);
    const originX = this.aim.x - EYE_CX;
    const originY = this.aim.y - EYE_CY;
    // A Via Láctea: uma faixa de névoa, para o céu ter onde se orientar.
    ctx.fillStyle = 'rgba(120, 136, 190, 0.035)';
    for (let x = 0; x < SKY_W; x += 2) {
      const y = 60 + x * 0.42 + Math.sin(x * 0.03) * 14;
      for (const half of [34, 24, 14]) ctx.fillRect(Math.round(x - originX), Math.round(y - half + Math.sin(x * 0.11 + half) * 4 - originY), 2, half * 2);
    }
    for (const star of this.stars) {
      const x = star.x - originX;
      const y = star.y - originY;
      if (Math.hypot(x - EYE_CX, y - EYE_CY) > EYE_R) continue;
      const twinkle = 0.55 + 0.45 * Math.sin(this.time * (1.2 + star.bright * 2) + star.phase);
      ctx.fillStyle = star.blue ? `rgba(170, 196, 255, ${0.35 + star.bright * 0.5 * twinkle})` : `rgba(255, 248, 226, ${0.3 + star.bright * 0.6 * twinkle})`;
      ctx.fillRect(Math.round(x), Math.round(y), star.bright > 0.88 ? 2 : 1, star.bright > 0.88 ? 2 : 1);
    }
    for (const target of SKY_TARGETS) this.drawTarget(target, originX, originY);
    ctx.restore();
    // A cruz da ocular, bem fraca: é onde o foco fecha.
    this.rect('rgba(255, 236, 170, 0.35)', EYE_CX - 6, EYE_CY, 4, 1);
    this.rect('rgba(255, 236, 170, 0.35)', EYE_CX + 3, EYE_CY, 4, 1);
    this.rect('rgba(255, 236, 170, 0.35)', EYE_CX, EYE_CY - 6, 1, 4);
    this.rect('rgba(255, 236, 170, 0.35)', EYE_CX, EYE_CY + 3, 1, 4);
    this.drawNudge();
    this.drawChecklist();
  }

  /** De longe é um ponto; centrado, o foco fecha, e o borrão vira a coisa. */
  private drawTarget(target: SkyTarget, originX: number, originY: number): void {
    const { ctx } = this;
    const pos = POSITIONS[target];
    const x = pos.x - originX;
    const y = pos.y - originY;
    if (Math.hypot(x - EYE_CX, y - EYE_CY) > EYE_R + pos.size) return;
    const art = this.arts.get(target);
    if (!art) return;
    const focus = this.found.has(target) ? 1 : this.focus[target];
    const block = Math.max(1, Math.round(9 - focus * 8));
    const mctx = this.mosaic.getContext('2d');
    if (!mctx) return;
    mctx.imageSmoothingEnabled = false;
    mctx.clearRect(0, 0, ART_SIZE, ART_SIZE);
    const small = Math.max(2, Math.floor(ART_SIZE / block));
    mctx.drawImage(art, 0, 0, small, small);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mosaic, 0, 0, small, small, Math.round(x - pos.size / 2), Math.round(y - pos.size / 2), pos.size, pos.size);
  }

  /** Muito tempo sem achar nada: uma setinha na borda, apontando o próximo. */
  private drawNudge(): void {
    const left = SKY_TARGETS.filter((target) => !this.found.has(target));
    if (left.length === 0 || this.sinceFind < NUDGE_AFTER_S) return;
    let best = left[0];
    for (const target of left) {
      const d = Math.hypot(POSITIONS[target].x - this.aim.x, POSITIONS[target].y - this.aim.y);
      if (d < Math.hypot(POSITIONS[best].x - this.aim.x, POSITIONS[best].y - this.aim.y)) best = target;
    }
    const dx = POSITIONS[best].x - this.aim.x;
    const dy = POSITIONS[best].y - this.aim.y;
    const d = Math.hypot(dx, dy);
    if (d < EYE_R) return;
    const pulse = EYE_R - 8 + Math.sin(this.time * 5) * 2;
    const ax = EYE_CX + (dx / d) * pulse;
    const ay = EYE_CY + (dy / d) * pulse;
    const { ctx } = this;
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.moveTo(ax + (dx / d) * 6, ay + (dy / d) * 6);
    ctx.lineTo(ax - (dy / d) * 4, ay + (dx / d) * 4);
    ctx.lineTo(ax + (dy / d) * 4, ay - (dx / d) * 4);
    ctx.closePath();
    ctx.fill();
  }

  /** Os quatro de hoje: silhuetas que acendem. É o único placar da tela. */
  private drawChecklist(): void {
    const { ctx } = this;
    SKY_TARGETS.forEach((target, i) => {
      const x = 58 + i * 22;
      const y = 131;
      this.rect('#201812', x - 1, y - 1, 18, 18);
      this.rect('#070b18', x, y, 16, 16);
      const icon = this.icons.get(target);
      if (!icon) return;
      ctx.save();
      if (!this.found.has(target)) {
        ctx.globalAlpha = 0.22;
        ctx.filter = 'grayscale(1)';
      }
      ctx.drawImage(icon, x, y);
      ctx.restore();
    });
  }
}
