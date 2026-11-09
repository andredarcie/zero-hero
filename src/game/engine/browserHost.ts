/**
 * O ANFITRIÃO DO NAVEGADOR: o único lugar do motor que fala com `window`, `document` e `navigator`. Cada método faz a
 * mesma chamada que o motor fazia antes de ter anfitrião — o jogo no navegador não muda nada por existir esta porta.
 */
import type { EngineHost, EnginePage, VisibilityHandlers } from './host';
import { Renderer } from './renderer';

const browserPage: EnginePage = {
  get touch(): boolean {
    return 'ontouchstart' in document.documentElement || (navigator.maxTouchPoints >= 1);
  },
  get mac(): boolean {
    return /Mac/.test(navigator.platform);
  },
  get android(): boolean {
    return /Android/i.test(navigator.userAgent);
  },

  whenReady(boot: () => void): void {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      boot();
      return;
    }
    const check = (): void => {
      document.removeEventListener('DOMContentLoaded', check, true);
      window.removeEventListener('load', check, true);
      boot();
    };
    document.addEventListener('DOMContentLoaded', check, true);
    window.addEventListener('load', check, true);
  },

  mountCanvas(canvas: HTMLCanvasElement, parent: string | HTMLElement | undefined, pixelated: boolean): void {
    if (pixelated) {
      for (const type of ['optimizeSpeed', '-moz-crisp-edges', '-o-crisp-edges', '-webkit-optimize-contrast', 'optimize-contrast', 'crisp-edges', 'pixelated']) {
        canvas.style.setProperty('image-rendering', type);
      }
    }
    const target = typeof parent === 'string' ? document.getElementById(parent) : (parent ?? null);
    (target ?? document.body).appendChild(canvas);
  },

  resolveParent(parent: string | HTMLElement | undefined): HTMLElement | null {
    return (typeof parent === 'string' ? document.getElementById(parent) : parent) ?? document.body;
  },

  rect(element: HTMLElement | HTMLCanvasElement) {
    return element.getBoundingClientRect();
  },

  scrollOffset() {
    return {
      x: window.pageXOffset || 0,
      y: window.pageYOffset || 0,
      clientLeft: document.documentElement.clientLeft || 0,
      clientTop: document.documentElement.clientTop || 0,
    };
  },

  onResize(resize: () => void, orientation: () => void): () => void {
    window.addEventListener('orientationchange', orientation, false);
    window.addEventListener('resize', resize, false);
    return () => {
      window.removeEventListener('orientationchange', orientation, false);
      window.removeEventListener('resize', resize, false);
    };
  },

  watchVisibility(handlers: VisibilityHandlers): void {
    document.addEventListener('visibilitychange', (event: Event) => {
      if (document.hidden || event.type === 'pause') handlers.hidden();
      else handlers.visible();
    }, false);
    window.onblur = () => { handlers.blur(); };
    window.onfocus = () => { handlers.focus(); };
  },

  focus(): void {
    if (window.focus) window.focus();
  },

  get keyboardTarget(): EventTarget {
    return window;
  },

  pointerTarget(canvas: HTMLCanvasElement): EventTarget {
    return canvas;
  },

  addTopListener(type: string, listener: (event: Event) => void, options: AddEventListenerOptions): void {
    try {
      (window.top ?? window).addEventListener(type, listener, options);
    } catch {
      window.addEventListener(type, listener, options);
    }
  },

  elementFromPoint(x: number, y: number): unknown {
    return document.elementFromPoint(x, y);
  },

  setCursor(canvas: HTMLCanvasElement, cursor: string): void {
    canvas.style.cursor = cursor;
  },
};

export const browserHost: EngineHost = {
  now: () => window.performance.now(),
  wallNow: () => Date.now(),
  requestFrame: (step) => window.requestAnimationFrame(step),
  cancelFrame: (id) => { window.cancelAnimationFrame(id); },
  createCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  },
  loadImage(src: string, onLoad: (image: HTMLImageElement) => void, onError: () => void): void {
    const image = new window.Image();
    image.onload = () => { onLoad(image); };
    image.onerror = () => { onError(); };
    image.src = src;
  },
  fetchText(url: string): Promise<string> {
    return fetch(url).then((res) => {
      if (!res.ok) throw new Error(`${res.status}`);
      return res.text();
    });
  },
  createRenderer: (game) => new Renderer(game),
  page: browserPage,
};
