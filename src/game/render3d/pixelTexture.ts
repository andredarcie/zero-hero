// UMA TEXTURA DE PIXEL ART FEITA EM CÓDIGO: os pixels RGBA (fileira 0 = o topo) num canvas, e o canvas numa textura de
// pixel nítido (sem filtro, sem mipmap, em sRGB). O mato alto, os retalhos da foice e a grade do acampamento nascem assim.
// `createImageData` e não `new ImageData`: o jogo também sobe sem navegador (os testes de boot), e lá só o contexto tem.

import * as THREE from 'three';
import { createCanvas } from '@/game/platform/platform';

export const pixelTexture = (pixels: Uint8ClampedArray, width: number, height: number): THREE.CanvasTexture => {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(width, height);
    img.data.set(pixels);
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};
