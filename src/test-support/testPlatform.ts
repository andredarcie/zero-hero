/**
 * A PLATAFORMA DOS TESTES (ver game/platform/platform.ts): o jogo inteiro no Node.
 *
 *   · o motor 2D no anfitrião dos testes (nodeHost.ts), com página de teste (teclado e mouse por evento);
 *   · canvas 2D real; imagens e arquivos de `public/`;
 *   · armazenamento em memória (cada arquivo de teste começa vazio);
 *   · sem som (o jogo segue mudo) e sem GPU (o mundo 3D desenha no renderizador nulo);
 *   · uma janela de tamanho fixo.
 */
import { createCanvas as nodeCanvas } from 'canvas';

import type { Display, KeyValueStore, Platform } from '@/game/platform/platform';
import { createNodeHost, publicFile, readUrl, type NodeHost } from './nodeHost';
import { createNullRenderer3D } from './nullRenderer3D';

export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, string>();
  public getItem(key: string): string | null { return this.data.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.data.set(key, String(value)); }
  public removeItem(key: string): void { this.data.delete(key); }
  public clear(): void { this.data.clear(); }
  public keys(): string[] { return [...this.data.keys()]; }
}

export interface TestPlatform extends Platform {
  readonly engineHost: NodeHost;
  readonly local: MemoryStore;
  readonly session: MemoryStore;
  /** O que o jogo salvou pelo PUT da API do editor. */
  readonly saved: Map<string, string>;
  readonly display: Display & { width: number; height: number; resize(width: number, height: number): void };
}

const CONTENT_TYPES: Record<string, string> = { '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg' };

export const createTestPlatform = (options: { dom?: boolean; width?: number; height?: number } = {}): TestPlatform => {
  const dom = options.dom ?? typeof document !== 'undefined';
  const host = createNodeHost({ dom, page: true });
  const local = new MemoryStore();
  const session = new MemoryStore();
  const saved = new Map<string, string>();
  const resizeWatchers = new Set<() => void>();
  const display = {
    width: options.width ?? 960,
    height: options.height ?? 540,
    pixelRatio: 1,
    mountBehind(canvas: HTMLCanvasElement): void { if (dom) document.body.prepend(canvas); },
    onResize(listener: () => void): () => void {
      resizeWatchers.add(listener);
      return () => { resizeWatchers.delete(listener); };
    },
    resize(width: number, height: number): void {
      display.width = width;
      display.height = height;
      for (const fn of resizeWatchers) fn();
    },
  };
  return {
    engineHost: host,
    local,
    session,
    saved,
    display,
    now: () => performance.now(),
    createCanvas(width?: number, height?: number): HTMLCanvasElement {
      if (dom) {
        const canvas = document.createElement('canvas');
        if (width !== undefined) canvas.width = width;
        if (height !== undefined) canvas.height = height;
        return canvas;
      }
      return nodeCanvas(width ?? 300, height ?? 150) as unknown as HTMLCanvasElement;
    },
    loadImage: (url) => new Promise((resolve, reject) => host.loadImage(url, resolve, () => reject(new Error(`imagem não carregou: ${url}`)))),
    async fetch(url: string, init?: RequestInit): Promise<Response> {
      // A API do editor (vite.config.ts) serve e grava o world.json.
      if (url.includes('api/world')) {
        if (init?.method === 'PUT') {
          saved.set('world', String(init.body));
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        url = '/world.json';
      }
      try {
        const bytes = readUrl(url);
        const ext = publicFile(url).slice(publicFile(url).lastIndexOf('.'));
        return new Response(new Uint8Array(bytes), { status: 200, headers: { 'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream' } });
      } catch {
        return new Response('not found', { status: 404 });
      }
    },
    localStore: () => local,
    sessionStore: () => session,
    createAudioContext: () => null,
    createOfflineAudioContext: () => null,
    createRenderer3D: (canvas) => createNullRenderer3D(canvas),
  };
};
