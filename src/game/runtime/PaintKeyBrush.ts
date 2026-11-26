/**
 * O PINCEL DAS SETAS, para quem pinta o quadro da Sisi com o teclado ou com o controle (runtime/gamepad): uma mira
 * anda pelo quadro com as setas (o direcional, o analógico), e o Z SEGURADO (o A do controle) pinta por onde ela passa.
 * PageUp/PageDown (os ombros do controle) trocam a tinta. O mouse e o dedo continuam pintando como sempre
 * (PaintingOverlay); a mira só aparece quando uma seta ou o Z é apertado.
 */

type Dir = 'up' | 'down' | 'left' | 'right';
type Point = { x: number; y: number };

const DIR_CODES: Readonly<Record<string, Dir>> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
const PAINT_CODES: ReadonlySet<string> = new Set(['KeyZ', 'KeyJ', 'Space']);
/** Pixels do quadro por segundo: começa devagar (o traço fino) e acelera segurando (atravessar o quadro). */
const SPEED_START = 34;
const SPEED_TOP = 96;
const ACCEL_S = 0.7;
/** A borda do canvas (o `border` do CSS da pintura): a área de desenho começa dentro dela. */
const FRAME_PX = 6;

export interface PaintKeyBrushHost {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  /** Pinta de `from` até `to` (sem `from`, um carimbo só, no começo do traço). */
  paint: (from: Point | undefined, to: Point) => void;
  /** A tinta anterior (-1) ou a seguinte (+1). */
  cycle: (delta: number) => void;
}

export class PaintKeyBrush {
  private readonly held = new Set<Dir>();
  private readonly at: Point;
  private painting = false;
  private last?: Point;
  private heldFor = 0;
  private raf = 0;
  private prevT = 0;
  private readonly mark: HTMLDivElement;

  public constructor(private readonly host: PaintKeyBrushHost, parent: HTMLElement) {
    this.at = { x: host.width / 2, y: host.height / 2 };
    this.mark = document.createElement('div');
    this.mark.style.cssText = 'position:fixed;pointer-events:none;display:none;z-index:56;box-sizing:border-box;'
      + 'border:2px solid #ffe066;box-shadow:0 0 0 2px #241d0f;';
    parent.appendChild(this.mark);
  }

  /** Uma tecla do pincel? Devolve se era dele (quem chama então engole a tecla). */
  public keyDown(event: KeyboardEvent): boolean {
    const dir = DIR_CODES[event.code];
    if (dir) {
      if (!this.held.has(dir)) this.heldFor = 0;
      this.held.add(dir);
      this.wake();
      return true;
    }
    if (PAINT_CODES.has(event.code)) {
      if (!event.repeat && !this.painting) {
        this.painting = true;
        this.last = undefined;
        this.stroke();
      }
      this.wake();
      return true;
    }
    if (event.code === 'PageUp' || event.code === 'PageDown') {
      if (!event.repeat) this.host.cycle(event.code === 'PageUp' ? -1 : 1);
      return true;
    }
    return false;
  }

  public keyUp(event: KeyboardEvent): void {
    const dir = DIR_CODES[event.code];
    if (dir) this.held.delete(dir);
    if (PAINT_CODES.has(event.code)) { this.painting = false; this.last = undefined; }
  }

  public destroy(): void {
    if (this.raf) window.cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.mark.remove();
  }

  /** A mira aparece e o laço começa (ele para sozinho quando nada está segurado). */
  private wake(): void {
    this.mark.style.display = 'block';
    this.place();
    if (!this.raf) {
      this.prevT = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private stroke(): void {
    const to = { x: Math.round(this.at.x), y: Math.round(this.at.y) };
    if (this.last && this.last.x === to.x && this.last.y === to.y) return;
    this.host.paint(this.last, to);
    this.last = to;
  }

  private readonly tick = (now: number): void => {
    this.raf = 0;
    const dt = Math.min(0.05, (now - this.prevT) / 1000);
    this.prevT = now;
    if (this.held.size > 0) {
      this.heldFor += dt;
      const speed = SPEED_START + (SPEED_TOP - SPEED_START) * Math.min(1, this.heldFor / ACCEL_S);
      const dx = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
      const dy = (this.held.has('down') ? 1 : 0) - (this.held.has('up') ? 1 : 0);
      this.at.x = Math.max(0, Math.min(this.host.width - 1, this.at.x + dx * speed * dt));
      this.at.y = Math.max(0, Math.min(this.host.height - 1, this.at.y + dy * speed * dt));
      if (this.painting) this.stroke();
    }
    this.place();
    if (this.held.size > 0 || this.painting) this.raf = requestAnimationFrame(this.tick);
  };

  /** A mira em cima do pixel do quadro onde o pincel está, do tamanho do carimbo. */
  private place(): void {
    const rect = this.host.canvas.getBoundingClientRect();
    const sx = (rect.width - FRAME_PX * 2) / this.host.width;
    const sy = (rect.height - FRAME_PX * 2) / this.host.height;
    const size = Math.max(8, Math.round(sx * 5));
    this.mark.style.width = `${size}px`;
    this.mark.style.height = `${size}px`;
    this.mark.style.left = `${rect.left + FRAME_PX + (Math.round(this.at.x) + 0.5) * sx - size / 2}px`;
    this.mark.style.top = `${rect.top + FRAME_PX + (Math.round(this.at.y) + 0.5) * sy - size / 2}px`;
  }
}
