// As três formas de onde sai todo efeito de uma vez do mundo (ver FX_DOT_TEXTURE no World3D): o ponto que brilha, o anel
// deitado no chão e a baforada de fumaça. Registradas como textura no começo; quem quer uma usa addBillboard.

import * as THREE from 'three';
import { createCanvas } from '@/game/platform/platform';

// The expanding ring (the altar answering, a pulse washing out from the hero): a hollow ring, laid
// FLAT on the ground so it reads as a wave washing over the floor of the diorama.
// Low-res + NEAREST like the fire glow, so it breaks into chunky pixels instead of a smooth HD arc.
const RING_TEX_RES = 48;
export const makeRingTexture = (): THREE.CanvasTexture => {
  const c = createCanvas();
  c.width = c.height = RING_TEX_RES;
  const ctx = c.getContext('2d')!;
  const r = RING_TEX_RES / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0.00, 'rgba(255,255,255,0)');
  g.addColorStop(0.62, 'rgba(255,255,255,0)');
  g.addColorStop(0.80, 'rgba(255,255,255,1)'); // the band itself
  g.addColorStop(0.96, 'rgba(255,255,255,0.25)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, RING_TEX_RES, RING_TEX_RES);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

// Smoke: the same soft disc as the dot, but written as raw pixels so the colour stays WHITE out
// to the transparent rim (see the FX_PUFF_TEXTURE note). Canvas is deliberately not used here.
const PUFF_TEX_RES = 32;
export const makePuffTexture = (): THREE.DataTexture => {
  const size = PUFF_TEX_RES;
  const data = new Uint8Array(size * size * 4);
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
      // Full in the core, easing to nothing at the rim — alpha only; rgb never darkens.
      const a = Math.max(0, Math.min(1, 1 - d));
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(Math.pow(a, 1.4) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
};

// A soft round glow (white opaque centre → transparent rim) so additive Points
// read as soft motes instead of hard squares — shared by every particle field.
export const makeSoftDotTexture = (): THREE.CanvasTexture => {
  const c = createCanvas();
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};
