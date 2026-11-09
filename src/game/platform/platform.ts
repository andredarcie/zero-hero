/**
 * A PLATAFORMA: tudo o que o jogo precisa do lugar onde roda, num lugar só. O jogo não chama o navegador direto —
 * nem para um canvas de pintar textura, nem para guardar uma opção, nem para tocar som, nem para a GPU do mundo
 * 3D — e sim estas portas. A do navegador (browserPlatform.ts) faz exatamente as chamadas de sempre; a dos testes
 * (src/test-support) roda tudo no Node: canvas 2D real, arquivos de `public/`, armazenamento em memória, sem som
 * e sem GPU.
 *
 * Ela é instalada UMA vez, na montagem do jogo (`main.ts` → `installPlatform(browserPlatform)`, ou o teste com a
 * dele), e lida com `platform()` por quem precisa. É uma porta só, e não uma por construtor, porque quem pinta
 * textura são dezenas de funções soltas: passar a plataforma por todas elas mudaria as assinaturas do jogo inteiro
 * sem ganhar nada além do que esta porta já dá — trocar o mundo de fora num lugar só.
 */
import type * as THREE from 'three';

import type { EngineHost } from '@/game/engine/host';

/** Um armazenamento de texto por chave (o `Storage` do navegador). Pode lançar: quem usa já cerca de try/catch. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A página em volta do mundo 3D: o tamanho da janela, a densidade de pixels, onde o canvas mora. */
export interface Display {
  /** A largura e a altura da janela, em pixels CSS. */
  readonly width: number;
  readonly height: number;
  /** Quantos pixels da tela cabem num pixel CSS. */
  readonly pixelRatio: number;
  /** Põe o canvas do mundo 3D no fundo da página (embaixo do canvas 2D). */
  mountBehind(canvas: HTMLCanvasElement): void;
  /** Ouve a janela mudar de tamanho; devolve quem desliga. */
  onResize(listener: () => void): () => void;
}

export interface Platform {
  /** O anfitrião do motor 2D (ver engine/host.ts). */
  readonly engineHost: EngineHost;
  /** O relógio monotônico, em ms (orçamentos de tempo por quadro). */
  now(): number;
  /** Um canvas 2D para pintar. Sem tamanho, nasce com o tamanho padrão do navegador. */
  createCanvas(width?: number, height?: number): HTMLCanvasElement;
  /** Carrega uma imagem (as texturas do mundo 3D). */
  loadImage(url: string): Promise<HTMLImageElement>;
  /** Busca um arquivo (o som, o mundo). */
  fetch(url: string, init?: RequestInit): Promise<Response>;
  /** O que sobrevive a fechar o jogo, e o que vale só para a aba. */
  localStore(): KeyValueStore;
  sessionStore(): KeyValueStore;
  /** Um contexto de áudio, ou `null` quando não há som (o jogo segue mudo). */
  createAudioContext(): AudioContext | null;
  createOfflineAudioContext(channels: number, length: number, sampleRate: number): OfflineAudioContext | null;
  /** O renderizador do mundo 3D, já preso ao canvas. */
  createRenderer3D(canvas: HTMLCanvasElement): THREE.WebGLRenderer;
  readonly display: Display;
}

let current: Platform | null = null;

/** Instala a plataforma (uma vez, na montagem do jogo ou no começo do teste). */
export const installPlatform = (next: Platform): void => {
  current = next;
};

/** A plataforma instalada. Ler antes de instalar é erro de montagem, e falha alto. */
export const platform = (): Platform => {
  if (!current) throw new Error('plataforma não instalada: main.ts (ou o teste) chama installPlatform antes de montar o jogo');
  return current;
};

/** Atalhos para as portas mais usadas. */
export const createCanvas = (width?: number, height?: number): HTMLCanvasElement => platform().createCanvas(width, height);
export const localStore = (): KeyValueStore => platform().localStore();
export const sessionStore = (): KeyValueStore => platform().sessionStore();
