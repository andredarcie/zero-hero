import type Phaser from 'phaser';

// Icone pixel-art procedural da CALDEIRA — so para o EDITOR (paleta + preview de colocacao).
// O runtime nunca desenha este sprite: em jogo a caldeira e um modelo THREE de verdade
// (BoilerObject), exatamente como a roda d'agua usa a arte da fabrica so como icone.
// Paleta: o ferro da pedra, a madeira queimada e a brasa — as mesmas familias do jogo.

const PALETTE: Record<string, readonly [number, number, number, number]> = {
  '.': [0, 0, 0, 0], // transparente
  k: [0x1c, 0x16, 0x12, 255], // contorno carbonizado
  m: [0x9a, 0xa0, 0xa8, 255], // ferro claro (a mesma banda da arte do balde)
  d: [0x5c, 0x62, 0x6b, 255], // ferro em sombra
  s: [0x4a, 0x44, 0x3d, 255], // pedra da fornalha
  o: [0xd2, 0x62, 0x2a, 255], // brasa na boca da fornalha
  y: [0xf2, 0xa8, 0x4e, 255], // miolo claro da brasa
  w: [0xdc, 0xe4, 0xea, 255], // sopro de vapor na valvula
};

// 14×16: chamine, domo rebitado, tanque, boca de fornalha acesa. Vertical como o objeto 3D.
const ICON = [
  '....kk.w......',
  '....kmk.w.....',
  '....kmk.......',
  '...kkmkkk.....',
  '..kmmmmmmk....',
  '.kmmdmmdmmk...',
  '.kmdmmmmdmk...',
  '.kmmmmmmmmk...',
  '.kmdmmmmdmk...',
  '.kmmdmmdmmk...',
  '.kkmmmmmmkk...',
  '.kssssssssk...',
  '.kskoyyoksk...',
  '.kskyooyksk...',
  '.kssssssssk...',
  '..kkkkkkkk....',
] as const;

export const BOILER_TEXTURE_KEY = 'boiler-icon';

const makeCanvas = (rows: readonly string[]): HTMLCanvasElement => {
  const h = rows.length;
  const w = rows[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [r, g, b, a] = PALETTE[rows[y][x]] ?? PALETTE['.'];
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

/** Publica o icone da caldeira na pipeline Phaser (a unica que o editor usa). Idempotente. */
export const registerBoilerTexture = (scene: Phaser.Scene): void => {
  if (scene.textures.exists(BOILER_TEXTURE_KEY)) return;
  scene.textures.addCanvas(BOILER_TEXTURE_KEY, makeCanvas(ICON));
};
