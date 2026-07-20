import * as THREE from 'three';
import type Phaser from 'phaser';

import { registerTexture3D } from '@/game/render3d/textures3d';

// O CABO DE ENERGIA, em pixel-art procedural: um fio de cobre encapado correndo rente ao chao.
// Sete formas — vertical, horizontal, as quatro curvas e a juncao — e cada uma em DOIS estados:
// o cabo APAGADO (a base escura, sempre visivel) e o nucleo ACESO (so o filete amarelo da
// energia, desenhado por cima em aditivo quando a rede esta viva). Sao duas texturas por forma
// porque o brilho e um overlay, nao uma troca: o cabo fisico continua la embaixo do claro.
//
// A forma NUNCA e escolhida pelo autor: ela nasce dos vizinhos (outros cabos e maquinas), no
// runtime e no editor — pintar o caminho e escolher a arte certa, a mesma regra que da ao braco
// o frame da sua direcao.

export type WireShape = 'v' | 'h' | 'ne' | 'nw' | 'se' | 'sw' | 'x';

// Que lados cada forma conecta (N, E, S, W).
const SHAPE_DIRS: Record<WireShape, { n: boolean; e: boolean; s: boolean; w: boolean }> = {
  v: { n: true, e: false, s: true, w: false },
  h: { n: false, e: true, s: false, w: true },
  ne: { n: true, e: true, s: false, w: false },
  nw: { n: true, e: false, s: false, w: true },
  se: { n: false, e: true, s: true, w: false },
  sw: { n: false, e: false, s: true, w: true },
  x: { n: true, e: true, s: true, w: true },
};

/**
 * A forma que um cabo assume dado o que existe nos quatro vizinhos (cabo ou maquina). Dois
 * lados viram reta ou curva; um lado so estica ate ele; tres ou mais (ou nenhum) viram a
 * juncao — o nó que deixa uma rede BIFURCAR.
 */
export const wireShapeFromMask = (n: boolean, e: boolean, s: boolean, w: boolean): WireShape => {
  const count = Number(n) + Number(e) + Number(s) + Number(w);
  if (count >= 3 || count === 0) return 'x';
  if (n && s) return 'v';
  if (e && w) return 'h';
  if (n && e) return 'ne';
  if (n && w) return 'nw';
  if (s && e) return 'se';
  if (s && w) return 'sw';
  // Um vizinho so: o cabo aponta para ele.
  if (n || s) return 'v';
  return 'h';
};

export const WIRE_SHAPES: readonly WireShape[] = ['v', 'h', 'ne', 'nw', 'se', 'sw', 'x'];
export const wireTextureKey = (shape: WireShape, on: boolean): string =>
  `wire-${shape}${on ? '-on' : ''}`;

const SIZE = 16;
const C = SIZE / 2; // centro do tile

// Paleta: capa de borracha escura com um brilho frio, e o amarelo eletrico do nucleo.
const OUTLINE = '#171310';
const RUBBER = '#38322b';
const SHEEN = '#57503f';
const CORE_ON = '#ffd23f';
const CORE_HOT = '#ffe98a';

type Ctx = CanvasRenderingContext2D;

// Uma faixa do centro ate a borda do lado pedido, com a largura dada (centrada no eixo).
const band = (ctx: Ctx, dir: 'n' | 'e' | 's' | 'w', width: number): void => {
  const half = width / 2;
  if (dir === 'n') ctx.fillRect(C - half, 0, width, C + half);
  if (dir === 's') ctx.fillRect(C - half, C - half, width, C + half);
  if (dir === 'w') ctx.fillRect(0, C - half, C + half, width);
  if (dir === 'e') ctx.fillRect(C - half, C - half, C + half, width);
};

const eachDir = (shape: WireShape, draw: (dir: 'n' | 'e' | 's' | 'w') => void): void => {
  const dirs = SHAPE_DIRS[shape];
  (['n', 'e', 's', 'w'] as const).forEach((dir) => { if (dirs[dir]) draw(dir); });
};

const makeCanvas = (shape: WireShape, on: boolean): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  if (!on) {
    // O cabo fisico: contorno, capa, e um fio de brilho frio descentrado (leitura de volume).
    ctx.fillStyle = OUTLINE;
    eachDir(shape, (dir) => band(ctx, dir, 6));
    ctx.fillStyle = RUBBER;
    eachDir(shape, (dir) => band(ctx, dir, 4));
    ctx.fillStyle = SHEEN;
    eachDir(shape, (dir) => {
      // O brilho e uma linha de 1px deslocada 1px do eixo — nunca centrada, senao vira listra.
      if (dir === 'n') ctx.fillRect(C - 2, 0, 1, C);
      if (dir === 's') ctx.fillRect(C - 2, C, 1, C);
      if (dir === 'w') ctx.fillRect(0, C - 2, C, 1);
      if (dir === 'e') ctx.fillRect(C, C - 2, C, 1);
    });
    // O miolo da emenda, sempre presente: e o que faz curva e juncao fecharem sem buraco.
    ctx.fillStyle = RUBBER;
    ctx.fillRect(C - 2, C - 2, 4, 4);
  } else {
    // So o filete da energia: 2px de amarelo com o miolo mais claro. Vai por cima, em aditivo.
    ctx.fillStyle = CORE_ON;
    eachDir(shape, (dir) => band(ctx, dir, 2));
    ctx.fillStyle = CORE_HOT;
    ctx.fillRect(C - 1, C - 1, 2, 2);
  }
  return canvas;
};

// O registro THREE e um mapa de modulo que sobrevive ao restart da cena: registrar uma vez so.
let threeRegistered = false;

/**
 * Publica as 14 texturas do cabo (7 formas × apagado/aceso) nas duas pipelines. O editor usa a
 * versao Phaser apagada (paleta + tabuleiro); o runtime usa as duas em THREE. Idempotente.
 */
export const registerWireTextures = (scene: Phaser.Scene): void => {
  for (const shape of WIRE_SHAPES) {
    for (const on of [false, true]) {
      const key = wireTextureKey(shape, on);
      const needThree = !threeRegistered;
      const needPhaser = !on && !scene.textures.exists(key);
      if (!needThree && !needPhaser) continue;
      const canvas = makeCanvas(shape, on);
      if (needThree) {
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        registerTexture3D(key, tex);
      }
      if (needPhaser) scene.textures.addCanvas(key, canvas);
    }
  }
  threeRegistered = true;
};
