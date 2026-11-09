/**
 * O ANFITRIÃO DOS TESTES (ver engine/host.ts): o motor rodando no Node, sem navegador e sem GPU.
 *
 *   · o canvas é um canvas 2D de verdade (o pacote `canvas`), então texto, medidas e pixels pintados são reais —
 *     no Node puro, um canvas do pacote; com DOM (`dom: true`, os testes em jsdom), o canvas do jsdom, que desenha
 *     pelo mesmo pacote por baixo (num DOM, canvas e imagem têm de ser todos do DOM para um desenhar o outro);
 *   · imagem e JSON saem de `public/`, pelo mesmo caminho que o navegador pediria (`/assets/x.png`, `/world.json`);
 *   · o relógio é do teste (`advance`), e nenhum quadro anda sozinho: o teste chama `game.step` ou `frame`;
 *   · não há renderizador: o quadro anda inteiro e não desenha;
 *   · a página é opcional — com ela, o teclado, o mouse e o foco são alvos de evento comuns, e o teste aperta as
 *     teclas e clica por `TestPage`.
 *
 * Só os testes importam este arquivo (ele carrega o `canvas`, que é nativo e de desenvolvimento).
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCanvas, loadImage } from 'canvas';

import type { EngineHost, EnginePage, PageRect, VisibilityHandlers } from '@/game/engine/host';

const here = path.dirname(fileURLToPath(import.meta.url));
/** A pasta que o navegador serve na raiz do jogo. */
export const PUBLIC_DIR = path.resolve(here, '../../public');

/** O arquivo de `public/` que uma URL do jogo pede (`/assets/x.png`, `assets/x.png`, `/world.json?v=2`). */
export const publicFile = (url: string): string => {
  const clean = url.replace(/^https?:\/\/[^/]+/u, '').split(/[?#]/u)[0].replace(/^\/+/u, '');
  return path.join(PUBLIC_DIR, decodeURIComponent(clean));
};

/** Os bytes de uma URL do jogo: data URL ou arquivo de `public/`. */
export const readUrl = (url: string): Buffer => {
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    const meta = url.slice(5, comma);
    const body = url.slice(comma + 1);
    return meta.endsWith(';base64') ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body));
  }
  const file = publicFile(url);
  if (!existsSync(file)) throw new Error(`arquivo não existe em public/: ${url}`);
  return readFileSync(file);
};

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };

/** A mesma imagem como data URL (o jsdom carrega imagem de data URL sem rede). */
export const toDataUrl = (url: string): string => {
  if (url.startsWith('data:')) return url;
  const ext = path.extname(url.split(/[?#]/u)[0]).toLowerCase();
  return `data:${MIME[ext] ?? 'application/octet-stream'};base64,${readUrl(url).toString('base64')}`;
};

/** Um evento com os campos que o motor lê (o Node não tem KeyboardEvent/MouseEvent). */
export const makeEvent = (type: string, fields: Record<string, unknown> = {}): Event => {
  const event = new Event(type, { cancelable: true, bubbles: true });
  for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value, enumerable: true });
  return event;
};

const NAMED_KEYS: Record<number, [key: string, code: string]> = {
  8: ['Backspace', 'Backspace'], 9: ['Tab', 'Tab'], 13: ['Enter', 'Enter'], 16: ['Shift', 'ShiftLeft'], 17: ['Control', 'ControlLeft'],
  27: ['Escape', 'Escape'], 32: [' ', 'Space'], 37: ['ArrowLeft', 'ArrowLeft'], 38: ['ArrowUp', 'ArrowUp'],
  39: ['ArrowRight', 'ArrowRight'], 40: ['ArrowDown', 'ArrowDown'],
};

/** O `key` e o `code` que o navegador mandaria para um keyCode (letra minúscula, dígito, tecla com nome). */
export const keyNames = (keyCode: number): { key: string; code: string } => {
  const named = NAMED_KEYS[keyCode];
  if (named) return { key: named[0], code: named[1] };
  if (keyCode >= 65 && keyCode <= 90) {
    const letter = String.fromCharCode(keyCode);
    return { key: letter.toLowerCase(), code: `Key${letter}` };
  }
  if (keyCode >= 48 && keyCode <= 57) return { key: String.fromCharCode(keyCode), code: `Digit${String.fromCharCode(keyCode)}` };
  return { key: String.fromCharCode(keyCode), code: '' };
};

/**
 * A página dos testes: alvos de evento comuns no lugar da janela e do canvas. Com DOM, o teclado é a própria janela
 * do jsdom — as telas do jogo (diálogo, pausa, minijogos) ouvem a janela, e no navegador as duas escutas recebem a
 * mesma tecla.
 */
export class TestPage implements EnginePage {
  public touch = false;
  public mac = false;
  public android = false;
  public readonly keyboardTarget: EventTarget;

  public constructor(private readonly dom = false) {
    this.keyboardTarget = dom ? window : new EventTarget();
  }
  public readonly topTarget = new EventTarget();
  public pointer: EventTarget = new EventTarget();
  public cursor = '';
  public focusCount = 0;
  public mounted: Array<{ parent: string | HTMLElement | undefined; pixelated: boolean }> = [];
  public visibility: VisibilityHandlers | null = null;
  private readonly resizeWatchers = new Set<() => void>();

  public whenReady(boot: () => void): void { boot(); }
  public mountCanvas(_canvas: HTMLCanvasElement, parent: string | HTMLElement | undefined, pixelated: boolean): void {
    this.mounted.push({ parent, pixelated });
  }
  public resolveParent(): HTMLElement | null { return null; }
  public rect(element: HTMLElement | HTMLCanvasElement): PageRect & { x: number; y: number } {
    const { width, height } = element as HTMLCanvasElement;
    return { x: 0, y: 0, left: 0, top: 0, width, height };
  }
  public scrollOffset() { return { x: 0, y: 0, clientLeft: 0, clientTop: 0 }; }
  public onResize(resize: () => void): () => void {
    this.resizeWatchers.add(resize);
    return () => { this.resizeWatchers.delete(resize); };
  }
  public watchVisibility(handlers: VisibilityHandlers): void { this.visibility = handlers; }
  public focus(): void { this.focusCount++; }
  public pointerTarget(): EventTarget { return this.pointer; }
  public addTopListener(type: string, listener: (event: Event) => void, options: AddEventListenerOptions): void {
    this.topTarget.addEventListener(type, listener, options);
  }
  public elementFromPoint(): unknown { return this.pointer; }
  public setCursor(_canvas: HTMLCanvasElement, cursor: string): void { this.cursor = cursor; }

  /** A janela mudou de tamanho. */
  public resize(): void { for (const fn of this.resizeWatchers) fn(); }

  /** Aperta (ou solta) uma tecla, como o navegador entregaria na janela. */
  public key(type: 'keydown' | 'keyup', keyCode: number, fields: Record<string, unknown> = {}): Event {
    const names = keyNames(keyCode);
    const all = { keyCode, which: keyCode, ...names, altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, repeat: false, ...fields };
    let event: Event;
    if (this.dom) {
      event = new window.KeyboardEvent(type, { key: String(all.key), code: String(all.code), bubbles: true, cancelable: true });
      for (const name of ['keyCode', 'which', 'altKey', 'ctrlKey', 'shiftKey', 'metaKey', 'repeat', ...Object.keys(fields)]) {
        Object.defineProperty(event, name, { value: (all as Record<string, unknown>)[name], enumerable: true });
      }
    } else {
      event = makeEvent(type, all);
    }
    this.keyboardTarget.dispatchEvent(event);
    return event;
  }

  /** Aperta e solta uma tecla. */
  public press(keyCode: number, fields: Record<string, unknown> = {}): void {
    this.key('keydown', keyCode, fields);
    this.key('keyup', keyCode, fields);
  }

  /** Um evento de mouse no canvas, na posição da página. */
  public mouse(type: string, pageX: number, pageY: number, fields: Record<string, unknown> = {}): Event {
    const event = makeEvent(type, { pageX, pageY, clientX: pageX, clientY: pageY, button: 0, buttons: type === 'mouseup' ? 0 : 1, ctrlKey: false, ...fields });
    this.pointer.dispatchEvent(event);
    return event;
  }
}

export interface NodeHost extends EngineHost {
  /** O relógio do teste, em ms. */
  time: number;
  advance(ms: number): void;
  /** Roda os quadros pedidos até agora, com o relógio atual. */
  frame(): void;
  /** Quantas imagens e arquivos ainda não terminaram de carregar. */
  readonly pendingImages: number;
  /** Espera tudo o que foi pedido terminar. */
  settle(): Promise<void>;
  readonly page?: TestPage;
}

export const createNodeHost = (options: { page?: boolean; start?: number; dom?: boolean } = {}): NodeHost => {
  const dom = options.dom ?? false;
  const frames = new Map<number, (time: number) => void>();
  let nextFrame = 1;
  const inflight = new Set<Promise<unknown>>();
  const track = <T>(p: Promise<T>): Promise<T> => {
    inflight.add(p);
    void p.finally(() => inflight.delete(p)).catch(() => undefined);
    return p;
  };
  const host: NodeHost = {
    time: options.start ?? 1000,
    advance(ms: number): void { host.time += ms; },
    now: () => host.time,
    // O relógio de parede anda junto com o do teste (as animações andam por ele).
    wallNow: () => 1_700_000_000_000 + host.time,
    requestFrame(step: (time: number) => void): number {
      const id = nextFrame++;
      frames.set(id, step);
      return id;
    },
    cancelFrame(id: number): void { frames.delete(id); },
    frame(): void {
      const due = [...frames.entries()];
      frames.clear();
      for (const [, step] of due) step(host.time);
    },
    createCanvas(width: number, height: number): HTMLCanvasElement {
      if (dom) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
      }
      return createCanvas(Math.max(0, width), Math.max(0, height)) as unknown as HTMLCanvasElement;
    },
    loadImage(src: string, onLoad: (image: HTMLImageElement) => void, onError: () => void): void {
      let data: string | Buffer;
      try {
        data = dom ? toDataUrl(src) : readUrl(src);
      } catch {
        queueMicrotask(onError);
        return;
      }
      if (dom) {
        const image = document.createElement('img');
        track(new Promise<void>((resolve) => {
          image.onload = () => { onLoad(image); resolve(); };
          image.onerror = () => { onError(); resolve(); };
          image.src = data as string;
        }));
        return;
      }
      track(loadImage(data).then((image) => onLoad(image as unknown as HTMLImageElement), () => onError()));
    },
    fetchText(url: string): Promise<string> {
      return track(new Promise<string>((resolve, reject) => {
        try {
          resolve(readUrl(url).toString('utf8'));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }));
    },
    createRenderer: () => null,
    get pendingImages(): number { return inflight.size; },
    async settle(): Promise<void> {
      while (inflight.size > 0) await Promise.allSettled([...inflight]);
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    page: options.page ? new TestPage(dom) : undefined,
  };
  return host;
};
