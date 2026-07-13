import * as THREE from 'three';

import { registerTexture3D } from '@/game/render3d/textures3d';

// ── Pixel art procedural do modo Sobreviventes ────────────────────────────────
//
// Três sprites que o jogo-base não tem — gema de XP, ímã e baú — desenhados
// pixel a pixel num canvas minúsculo e publicados no registro 3D
// (registerTexture3D), para passarem pelo mesmo caminho Billboard3D de qualquer
// arte de arquivo. A gema é BRANCA de propósito: o tint do billboard dá a cor
// de cada tier (ciano/verde/vermelho/dourado), um sprite só para os quatro.

export const XP_GEM_TEXTURE = 'survivors-xp-gem';
export const MAGNET_TEXTURE = 'survivors-magnet';
export const CHEST_TEXTURE = 'survivors-chest';

let registered = false;

const makeCanvas = (size: number, draw: (px: (x: number, y: number, color: string) => void) => void): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const px = (x: number, y: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  };
  draw(px);
  return canvas;
};

const makeTexture = (size: number, draw: (px: (x: number, y: number, color: string) => void) => void): THREE.Texture => {
  const tex = new THREE.CanvasTexture(makeCanvas(size, draw));
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

const drawChest = (px: (x: number, y: number, color: string) => void): void => {
  const WOOD = '#8a5a2b';
  const WOOD_DARK = '#5c3a18';
  const WOOD_LIGHT = '#a8743c';
  const GOLD = '#f5c542';
  const GOLD_DARK = '#c79a1e';
  for (let y = 3; y <= 11; y++) {
    for (let x = 1; x <= 12; x++) {
      const border = y === 3 || y === 11 || x === 1 || x === 12;
      px(x, y, border ? WOOD_DARK : WOOD);
    }
  }
  for (let x = 2; x <= 11; x++) px(x, 4, WOOD_LIGHT); // brilho da tampa
  for (let y = 3; y <= 11; y++) { px(6, y, GOLD); px(7, y, GOLD_DARK); } // cinta
  for (let x = 1; x <= 12; x++) px(x, 7, x === 6 || x === 7 ? GOLD : WOOD_DARK); // linha da tampa
  px(6, 7, GOLD); px(7, 7, GOLD); px(6, 8, GOLD); px(7, 8, GOLD_DARK); // fecho
};

/** O mesmo baú, como data-URL — para os overlays DOM (a cerimônia do jackpot). */
export const chestDataUrl = (): string => makeCanvas(14, drawChest).toDataURL();

export const registerSurvivorsTextures = (): void => {
  if (registered) return;
  registered = true;

  // Gema de XP: um losango 6x8 branco com facetas cinza (o tint colore).
  registerTexture3D(XP_GEM_TEXTURE, makeTexture(8, (px) => {
    const rows: Array<[number, number]> = [[3, 4], [2, 5], [1, 6], [1, 6], [2, 5], [3, 4]];
    rows.forEach(([x0, x1], i) => {
      for (let x = x0; x <= x1; x++) px(x, i + 1, '#ffffff');
    });
    // Facetas: uma diagonal clara e uma sombra para ler como cristal.
    px(3, 2, '#f4f4f4'); px(2, 3, '#e2e2e2'); px(4, 4, '#c8c8c8'); px(5, 3, '#d6d6d6');
  }));

  // Ímã: a ferradura clássica vermelha de pontas brancas.
  registerTexture3D(MAGNET_TEXTURE, makeTexture(12, (px) => {
    const R = '#d43a2e';
    const D = '#9c2118';
    const W = '#f2ede2';
    for (let y = 2; y <= 7; y++) { px(2, y, R); px(3, y, R); px(8, y, R); px(9, y, R); }
    for (let x = 3; x <= 8; x++) { px(x, 8, R); px(x, 9, D); }
    px(2, 8, R); px(9, 8, R); px(2, 7, D); px(9, 7, D);
    px(2, 2, W); px(3, 2, W); px(8, 2, W); px(9, 2, W);
    px(2, 3, W); px(3, 3, W); px(8, 3, W); px(9, 3, W);
  }));

  // Baú: caixa de madeira com cinta e fecho dourados — o jackpot precisa LER
  // como jackpot mesmo com 8 pixels de altura.
  registerTexture3D(CHEST_TEXTURE, makeTexture(14, drawChest));
};
