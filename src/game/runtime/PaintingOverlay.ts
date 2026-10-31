import { DYE_COLORS, DYE_KINDS, type DyeKind } from '@/game/quests/dyePlants';
import { t } from '@/game/i18n/i18n';
import { KEY_BORDER, KEY_GLYPH, PIXEL_FONT } from '@/game/runtime/uiStyle';

// O QUADRO: o minigame de pintar. DOM por cima do mundo, como a colheita e a pausa. O desenho é feito
// em poucos pixels e ampliado sem suavizar, para ele ter a mesma cara de todo o resto do jogo.
//
// O traço é por ponteiro, então dedo e mouse são o mesmo caminho. Pintar exige ao menos um traço:
// é sobre o desenho que a Iris vai comentar.

const STYLE_ID = 'zh-paint-style';
const ROOT_ID = 'zh-paint-root';
export const PAINT_W = 160;
export const PAINT_H = 120;
const PAPER = '#f4efe2';
const BRUSH_RADIUS = 2;
const STROKE_SOUND_EVERY = 14;

const CSS = `
#${ROOT_ID} {
  position: fixed; inset: 0; z-index: 55; box-sizing: border-box;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;
  padding: calc(12px + env(safe-area-inset-top, 0px)) calc(12px + env(safe-area-inset-right, 0px))
    calc(12px + env(safe-area-inset-bottom, 0px)) calc(12px + env(safe-area-inset-left, 0px));
  background: rgba(6, 5, 4, 0.72);
  font-family: ${PIXEL_FONT}; color: #e7dcc4; text-shadow: 2px 2px 0 #000;
  user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent;
}
#${ROOT_ID} * { box-sizing: border-box; }
#${ROOT_ID} canvas {
  display: block; flex: 0 0 auto; background: ${PAPER}; image-rendering: pixelated; cursor: crosshair;
  touch-action: none; border: 6px solid #2a1c12; outline: 3px solid #8e623a;
}
#${ROOT_ID} .zh-paint-side { display: flex; flex-direction: column; align-items: center; gap: 12px; flex: 0 0 auto; }
#${ROOT_ID} .zh-paint-pots { display: flex; gap: 8px; }
#${ROOT_ID} button {
  appearance: none; border: 0; background: none; padding: 0; margin: 0;
  font: inherit; color: inherit; text-shadow: inherit; cursor: pointer; touch-action: manipulation;
}
#${ROOT_ID} .zh-paint-pot {
  display: flex; flex-direction: column; align-items: center; gap: 6px; width: 76px; padding: 6px 0;
  font-size: 10px; line-height: 1.3; color: #cfc6ad;
}
#${ROOT_ID} .zh-paint-pot i {
  display: block; width: 44px; height: 44px; border: 4px solid #201812; box-shadow: 3px 3px 0 #000;
}
#${ROOT_ID} .zh-paint-pot.is-on { color: ${KEY_BORDER}; }
#${ROOT_ID} .zh-paint-pot.is-on i { outline: 4px solid ${KEY_BORDER}; transform: translateY(-3px); }
#${ROOT_ID} .zh-paint-row { display: flex; gap: 24px; align-items: center; }
#${ROOT_ID} .zh-paint-action { min-height: 48px; padding: 16px 8px; font-size: 16px; line-height: 1; color: ${KEY_GLYPH}; white-space: nowrap; }
#${ROOT_ID} .zh-paint-action.zh-dim { color: #a89c7e; font-size: 12px; }
#${ROOT_ID} .zh-paint-action:disabled { opacity: 0.35; cursor: default; }
#${ROOT_ID} .zh-paint-done:not(:disabled) { color: ${KEY_BORDER}; }
@media (orientation: landscape) {
  #${ROOT_ID} { flex-direction: row; gap: 24px; }
  #${ROOT_ID} .zh-paint-pots { display: grid; grid-template-columns: 1fr 1fr; }
  #${ROOT_ID} .zh-paint-row { flex-direction: column; gap: 0; }
}
`;

export interface PaintingOverlayCallbacks {
  onDone: (canvas: HTMLCanvasElement) => void;
  /** Saiu sem terminar: o que já foi pintado fica para a próxima (`canvas`). */
  onCancel: (canvas: HTMLCanvasElement) => void;
  onStroke: () => void;
  onPick: () => void;
}

/** O que a Iris enxerga no quadro: quanto foi coberto e quanto de cada cor. */
export type PaintingReading = { coverage: number; dominant: DyeKind; used: DyeKind[] };

export const readPainting = (canvas: HTMLCanvasElement): PaintingReading => {
  const ctx = canvas.getContext('2d');
  const counts = new Map<DyeKind, number>(DYE_KINDS.map((kind) => [kind, 0]));
  const palette = DYE_KINDS.map((kind) => {
    const hex = DYE_COLORS[kind];
    return { kind, r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
  });
  let painted = 0;
  if (ctx) {
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const hit = palette.find((c) => c.r === data[i] && c.g === data[i + 1] && c.b === data[i + 2]);
      if (!hit) continue;
      painted += 1;
      counts.set(hit.kind, (counts.get(hit.kind) ?? 0) + 1);
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return {
    coverage: painted / (canvas.width * canvas.height),
    dominant: ranked[0][0],
    used: ranked.filter(([, n]) => n > 0).map(([kind]) => kind),
  };
};

export class PaintingOverlay {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly pots: HTMLButtonElement[] = [];
  private readonly doneBtn: HTMLButtonElement;
  private color: DyeKind = DYE_KINDS[0];
  private last?: { x: number; y: number };
  private strokeSteps = 0;
  private hasPaint = false;
  private destroyed = false;

  public constructor(private readonly cb: PaintingOverlayCallbacks, earlier?: HTMLCanvasElement) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.root = document.createElement('div');
    this.root.id = ROOT_ID;
    this.root.setAttribute('data-zh-ui', '');

    this.canvas = earlier ?? document.createElement('canvas');
    // Só no quadro novo: escrever o tamanho apaga o canvas, e o rascunho de quem saiu tem de voltar.
    if (!earlier) {
      this.canvas.width = PAINT_W;
      this.canvas.height = PAINT_H;
    }
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('canvas 2d indisponível');
    this.ctx = ctx;
    if (earlier) this.restore(earlier);
    this.root.appendChild(this.canvas);

    const side = document.createElement('div');
    side.className = 'zh-paint-side';
    const potRow = document.createElement('div');
    potRow.className = 'zh-paint-pots';
    DYE_KINDS.forEach((kind) => {
      const pot = document.createElement('button');
      pot.type = 'button';
      pot.className = 'zh-paint-pot';
      pot.dataset.color = kind;
      const swatch = document.createElement('i');
      swatch.style.background = DYE_COLORS[kind];
      const name = document.createElement('span');
      name.textContent = t(`fungi.dye.${kind}`);
      pot.append(swatch, name);
      pot.addEventListener('click', () => this.pick(kind));
      this.pots.push(pot);
      potRow.appendChild(pot);
    });
    side.appendChild(potRow);

    const row = document.createElement('div');
    row.className = 'zh-paint-row';
    const leave = document.createElement('button');
    leave.type = 'button';
    leave.className = 'zh-paint-action zh-dim';
    leave.textContent = t('npc.painterEasel.leave');
    leave.addEventListener('click', () => this.cancel());
    this.doneBtn = document.createElement('button');
    this.doneBtn.type = 'button';
    this.doneBtn.className = 'zh-paint-action zh-paint-done';
    this.doneBtn.textContent = t('npc.painterEasel.done');
    this.doneBtn.disabled = !this.hasPaint;
    this.doneBtn.addEventListener('click', () => this.finish());
    row.append(leave, this.doneBtn);
    side.appendChild(row);
    this.root.appendChild(side);

    this.highlight();
    this.canvas.addEventListener('pointerdown', this.handleDown);
    this.canvas.addEventListener('pointermove', this.handleMove);
    this.canvas.addEventListener('pointerup', this.handleUp);
    this.canvas.addEventListener('pointercancel', this.handleUp);
    document.body.appendChild(this.root);
    this.layout();
    window.addEventListener('resize', this.layout);
    window.addEventListener('keydown', this.handleKey, true);
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('resize', this.layout);
    window.removeEventListener('keydown', this.handleKey, true);
    this.root.remove();
  }

  /** O maior quadro que couber, em oitavos: na densidade de um celular a conta quebrada não aparece. */
  private readonly layout = (): void => {
    const landscape = window.innerWidth > window.innerHeight;
    const sideW = landscape ? this.root.querySelector<HTMLElement>('.zh-paint-side')?.offsetWidth ?? 0 : 0;
    const sideH = landscape ? 0 : this.root.querySelector<HTMLElement>('.zh-paint-side')?.offsetHeight ?? 0;
    const frame = 18; // moldura + contorno, dos dois lados
    const room = 24 + (landscape ? 24 : 12);
    const w = window.innerWidth - frame - sideW - (landscape ? room : 24);
    const h = window.innerHeight - frame - sideH - (landscape ? 24 : room);
    const scale = Math.max(1, Math.min(w / PAINT_W, h / PAINT_H));
    const cssScale = Math.max(1, Math.floor(scale * 8) / 8);
    this.canvas.style.width = `${PAINT_W * cssScale + 12}px`;
    this.canvas.style.height = `${PAINT_H * cssScale + 12}px`;
  };

  private restore(earlier: HTMLCanvasElement): void {
    const painted = earlier.getContext('2d')?.getImageData(0, 0, PAINT_W, PAINT_H);
    if (!painted) return;
    this.hasPaint = painted.data.some((value, i) => i % 4 === 3 && value > 0);
  }

  private pick(kind: DyeKind): void {
    this.color = kind;
    this.highlight();
    this.cb.onPick();
  }

  private highlight(): void {
    this.pots.forEach((pot) => pot.classList.toggle('is-on', pot.dataset.color === this.color));
  }

  private toCanvas(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    // A borda do elemento fica fora da área de desenho.
    const border = 6;
    const innerW = rect.width - border * 2;
    const innerH = rect.height - border * 2;
    return {
      x: Math.floor(((event.clientX - rect.left - border) / innerW) * PAINT_W),
      y: Math.floor(((event.clientY - rect.top - border) / innerH) * PAINT_H),
    };
  }

  /** Um carimbo redondo em pixel inteiro: sem antialias, a cor fica pura e a Iris consegue lê-la. */
  private stamp(x: number, y: number): void {
    this.ctx.fillStyle = DYE_COLORS[this.color];
    for (let dy = -BRUSH_RADIUS; dy <= BRUSH_RADIUS; dy += 1) {
      for (let dx = -BRUSH_RADIUS; dx <= BRUSH_RADIUS; dx += 1) {
        if (dx * dx + dy * dy <= BRUSH_RADIUS * BRUSH_RADIUS + 1) this.ctx.fillRect(x + dx, y + dy, 1, 1);
      }
    }
  }

  private line(from: { x: number; y: number }, to: { x: number; y: number }): void {
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1);
    for (let i = 0; i <= steps; i += 1) {
      this.stamp(Math.round(from.x + ((to.x - from.x) * i) / steps), Math.round(from.y + ((to.y - from.y) * i) / steps));
    }
    this.strokeSteps += steps;
    if (this.strokeSteps >= STROKE_SOUND_EVERY) {
      this.strokeSteps = 0;
      this.cb.onStroke();
    }
  }

  private readonly handleDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    const at = this.toCanvas(event);
    this.last = at;
    this.stamp(at.x, at.y);
    this.hasPaint = true;
    this.doneBtn.disabled = false;
    this.cb.onStroke();
  };

  private readonly handleMove = (event: PointerEvent): void => {
    if (!this.last) return;
    // O navegador junta os movimentos de um quadro: sem eles, o traço rápido sairia quebrado.
    const moves = event.getCoalescedEvents?.() ?? [event];
    for (const move of moves.length > 0 ? moves : [event]) {
      const at = this.toCanvas(move);
      this.line(this.last, at);
      this.last = at;
    }
  };

  private readonly handleUp = (): void => {
    this.last = undefined;
  };

  private finish(): void {
    if (!this.hasPaint || this.destroyed) return;
    this.cb.onDone(this.canvas);
  }

  private cancel(): void {
    if (!this.destroyed) this.cb.onCancel(this.canvas);
  }

  private readonly handleKey = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      this.cancel();
    } else if (event.code === 'Enter' || event.code === 'NumpadEnter') {
      event.preventDefault();
      this.finish();
    } else if (/^Digit[1-4]$/u.test(event.code)) {
      event.preventDefault();
      this.pick(DYE_KINDS[Number(event.code.slice(5)) - 1]);
    }
  };
}
