/**
 * A PLATAFORMA DO NAVEGADOR (ver platform.ts): as mesmas chamadas que o jogo fazia direto, agora num lugar só.
 */
import * as THREE from 'three';

import { browserHost } from '@/game/engine/browserHost';
import type { Display, Platform } from './platform';

const display: Display = {
  get width(): number { return window.innerWidth; },
  get height(): number { return window.innerHeight; },
  get pixelRatio(): number { return window.devicePixelRatio || 1; },
  mountBehind(canvas: HTMLCanvasElement): void { document.body.prepend(canvas); },
  onResize(listener: () => void): () => void {
    window.addEventListener('resize', listener);
    return () => window.removeEventListener('resize', listener);
  },
};

export const browserPlatform: Platform = {
  engineHost: browserHost,
  now: () => performance.now(),
  createCanvas(width?: number, height?: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    if (width !== undefined) canvas.width = width;
    if (height !== undefined) canvas.height = height;
    return canvas;
  },
  loadImage(url: string): Promise<HTMLImageElement> {
    return new THREE.ImageLoader().loadAsync(url);
  },
  fetch: (url, init) => window.fetch(url, init),
  localStore: () => window.localStorage,
  sessionStore: () => window.sessionStorage,
  createAudioContext: () => new AudioContext(),
  createOfflineAudioContext: (channels, length, sampleRate) => new OfflineAudioContext(channels, length, sampleRate),
  createRenderer3D: (canvas) => new THREE.WebGLRenderer({ canvas, antialias: false }),
  display,
};
