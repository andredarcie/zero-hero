import * as THREE from 'three';
import type Phaser from 'phaser';

import { registerTexture3D } from '@/game/render3d/textures3d';

// A arte da CALDEIRA — pixel-art procedural em TRES estados, porque o sprite E a maquina no
// runtime (billboard como todo prop do mundo, a pedido do estilo do jogo): fria (brasa morta,
// lampada apagada), aquecida (a boca da fornalha acende laranja — o termometro que se le de
// longe) e gerando (a lampada verde do dinamo — a MESMA gramatica de "circuito fechou" da roda
// d'agua). O BoilerObject troca a textura nas BORDAS de estado, como a fogueira troca frames.
// O editor usa a versao fria como icone de paleta/tabuleiro.

const BASE_PALETTE: Record<string, readonly [number, number, number, number]> = {
  '.': [0, 0, 0, 0], // transparente
  k: [0x1c, 0x16, 0x12, 255], // contorno carbonizado
  m: [0x9a, 0xa0, 0xa8, 255], // ferro claro
  d: [0x5c, 0x62, 0x6b, 255], // ferro em sombra (cintas rebitadas)
  s: [0x4a, 0x44, 0x3d, 255], // pedra da fornalha
};

// Os tres estados so trocam brasa (o, y) e lampada (G) — o corpo nunca muda.
const LOOK_PALETTE: Record<BoilerLook, Record<string, readonly [number, number, number, number]>> = {
  cold: {
    o: [0x2f, 0x2a, 0x25, 255], // carvao morto na boca
    y: [0x24, 0x1c, 0x14, 255],
    G: [0x45, 0x4b, 0x52, 255], // lampada apagada
  },
  hot: {
    o: [0xd2, 0x62, 0x2a, 255], // brasa viva
    y: [0xf2, 0xa8, 0x4e, 255],
    G: [0x45, 0x4b, 0x52, 255],
  },
  on: {
    o: [0xd2, 0x62, 0x2a, 255],
    y: [0xf2, 0xa8, 0x4e, 255],
    G: [0x7d, 0xde, 0x99, 255], // o verde do dinamo: circuito fechado
  },
};

// 14×16: chamine, domo, tanque rebitado com a lampada na face, fornalha de pedra com a boca.
const SPRITE = [
  '....kk........',
  '....kmk.......',
  '....kmk.......',
  '...kkmkkk.....',
  '..kmmmmmmk....',
  '.kmmdmmdmmk...',
  '.kmdmmmmdmk...',
  '.kmmmGGmmmk...',
  '.kmdmGGmdmk...',
  '.kmmdmmdmmk...',
  '.kkmmmmmmkk...',
  '.kssssssssk...',
  '.kskoyyoksk...',
  '.kskyooyksk...',
  '.kssssssssk...',
  '..kkkkkkkk....',
] as const;

export type BoilerLook = 'cold' | 'hot' | 'on';

/** A textura de cada estado. A fria mantem a chave historica do icone do editor. */
export const boilerTextureKey = (look: BoilerLook): string =>
  (look === 'cold' ? 'boiler-icon' : `boiler-${look}`);

/** Proporcao da arte (14 de largura por 16 de altura) — o billboard respeita o pixel. */
export const BOILER_SPRITE_ASPECT = 16 / 14;

const makeCanvas = (look: BoilerLook): HTMLCanvasElement => {
  const rows = SPRITE;
  const h = rows.length;
  const w = rows[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const palette = { ...BASE_PALETTE, ...LOOK_PALETTE[look] };
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [r, g, b, a] = palette[rows[y][x]] ?? BASE_PALETTE['.'];
      const idx = (y * w + x) * 4;
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
};

// O registro THREE e um mapa de modulo que sobrevive ao restart da cena: registrar uma vez so.
let threeRegistered = false;

/**
 * Publica os tres estados na pipeline THREE (o billboard do runtime) e o estado FRIO na Phaser
 * (icone de paleta/tabuleiro do editor). Idempotente por pipeline, como balde e carvao.
 */
export const registerBoilerTexture = (scene: Phaser.Scene): void => {
  for (const look of ['cold', 'hot', 'on'] as const) {
    const key = boilerTextureKey(look);
    const needThree = !threeRegistered;
    const needPhaser = look === 'cold' && !scene.textures.exists(key);
    if (!needThree && !needPhaser) continue;
    const canvas = makeCanvas(look);
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
  threeRegistered = true;
};
