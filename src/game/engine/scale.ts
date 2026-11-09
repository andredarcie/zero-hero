/**
 * O TAMANHO DA TELA — o ScaleManager no modo que o jogo usa (NONE, sem centralizar): o canvas tem o
 * tamanho pedido em `resize`, e o RESIZE sai tanto da chamada quanto da checagem periódica do pai (a cada 500 ms
 * ou logo depois de um `resize` da janela), como antes — quem escuta o RESIZE recebe o mesmo par de chamadas.
 * Também converte a posição do ponteiro na página para a do canvas.
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { EventEmitter } from './events';
import { CoreEvents, ScaleEvents } from './constants';
import type { Game } from './game';

/** O Structs.Size, sem as travas de proporção (o modo NONE não usa). */
export class Size {
  public constructor(public width = 0, public height = 0) {}
  public get aspectRatio(): number { return this.height === 0 ? 1 : this.width / this.height; }
  public setSize(width: number, height = width): this {
    this.width = width;
    this.height = height;
    return this;
  }
  public resize(width: number, height = width): this {
    return this.setSize(width, height);
  }
}

export const SCALE_NONE = 0;
export const NO_CENTER = 0;

export class ScaleManager extends EventEmitter {
  public canvas!: HTMLCanvasElement;
  public parent: HTMLElement | null = null;
  public readonly gameSize = new Size();
  public readonly baseSize = new Size();
  public readonly displaySize = new Size();
  public readonly parentSize = new Size();
  public readonly canvasBounds = { x: 0, y: 0, width: 0, height: 0, get left(): number { return this.x; }, get top(): number { return this.y; } };
  public readonly displayScale = { x: 1, y: 1 };
  public readonly zoom = 1;
  public dirty = false;
  public readonly resizeInterval = 500;
  private _lastCheck = 0;
  private stopWatchingResize: (() => void) | null = null;

  public constructor(private readonly game: Game) {
    super();
  }

  public get width(): number { return this.gameSize.width; }
  public get height(): number { return this.gameSize.height; }

  public preBoot(): void {
    this.parseConfig();
    this.game.events.once(CoreEvents.BOOT, this.boot, this);
  }

  private parseConfig(): void {
    const parent = this.game.config.parent;
    const page = this.game.host.page;
    // Sem página não há pai para medir: o tamanho é o da config, e fica.
    if (parent !== null && page) {
      this.parent = page.resolveParent(parent);
    }
    this.getParentBounds();
    const { width, height } = this.game.config;
    this.gameSize.setSize(width, height);
    this.baseSize.setSize(width, height);
    this.displaySize.setSize(width, height);
  }

  private boot(): void {
    this.canvas = this.game.canvas;
    this.resize(this.width, this.height);
    const ee = this.game.events;
    ee.on(CoreEvents.PRE_STEP, this.step, this);
    ee.once(CoreEvents.READY, this.refresh, this);
    this.stopWatchingResize = this.game.host.page?.onResize(this.onWindowResize, this.onOrientationChange) ?? null;
  }

  private readonly onOrientationChange = (): void => {
    this.updateBounds();
    this.dirty = true;
    this.refresh();
  };

  private readonly onWindowResize = (): void => {
    this.updateBounds();
    this.dirty = true;
  };

  public resize(width: number, height: number): this {
    const previousWidth = this.width;
    const previousHeight = this.height;
    this.gameSize.resize(width, height);
    this.baseSize.resize(width, height);
    this.displaySize.setSize(width, height);
    this.canvas.width = this.baseSize.width;
    this.canvas.height = this.baseSize.height;
    return this.refresh(previousWidth, previousHeight);
  }

  public setGameSize(width: number, height: number): this {
    return this.resize(width, height);
  }

  public refresh(previousWidth = this.width, previousHeight = this.height): this {
    this.displaySize.setSize(this.gameSize.width, this.gameSize.height);
    this.getParentBounds();
    this.updateBounds();
    this.displayScale.x = this.baseSize.width / this.canvasBounds.width;
    this.displayScale.y = this.baseSize.height / this.canvasBounds.height;
    this.emit(ScaleEvents.RESIZE, this.gameSize, this.baseSize, this.displaySize, previousWidth, previousHeight);
    return this;
  }

  private getParentBounds(): boolean {
    const page = this.game.host.page;
    if (!this.parent || !page) return false;
    const rect = page.rect(this.parent);
    if (this.parentSize.width !== rect.width || this.parentSize.height !== rect.height) {
      this.parentSize.setSize(rect.width, rect.height);
      return true;
    }
    if (this.canvas) {
      const canvasRect = page.rect(this.canvas);
      if (canvasRect.x !== this.canvasBounds.x || canvasRect.y !== this.canvasBounds.y) return true;
    }
    return false;
  }

  public updateBounds(): void {
    const bounds = this.canvasBounds;
    const page = this.game.host.page;
    if (!page) {
      // Sem página, o canvas está na origem e com o próprio tamanho: um ponto do canvas é um ponto do jogo.
      bounds.x = 0;
      bounds.y = 0;
      bounds.width = this.canvas.width;
      bounds.height = this.canvas.height;
      return;
    }
    const clientRect = page.rect(this.canvas);
    const offset = page.scrollOffset();
    bounds.x = clientRect.left + offset.x - offset.clientLeft;
    bounds.y = clientRect.top + offset.y - offset.clientTop;
    bounds.width = clientRect.width;
    bounds.height = clientRect.height;
  }

  private step(_time: number, delta: number): void {
    if (!this.parent) return;
    this._lastCheck += delta;
    if (this.dirty || this._lastCheck > this.resizeInterval) {
      if (this.getParentBounds()) this.refresh();
      this.dirty = false;
      this._lastCheck = 0;
    }
  }

  public transformX(pageX: number): number {
    return (pageX - this.canvasBounds.left) * this.displayScale.x;
  }

  public transformY(pageY: number): number {
    return (pageY - this.canvasBounds.top) * this.displayScale.y;
  }

  public destroy(): void {
    this.removeAllListeners();
    this.stopWatchingResize?.();
    this.stopWatchingResize = null;
  }
}
