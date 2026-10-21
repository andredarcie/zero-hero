import * as THREE from 'three';
import type Phaser from 'phaser';

import { registerTexture3D } from '@/game/render3d/textures3d';

// A PECA DO FIM que nao tinha arte: o ESPETO com o cogumelo, cru e assado. Desenhadas uma vez e publicadas nas DUAS pipelines de textura,
// o mesmo esquema do bucketTexture/charcoalTexture: THREE (billboard no mundo) e Phaser.
//
type Rgba = readonly [number, number, number, number];

const PALETTE: Record<string, Rgba> = {
  '.': [0, 0, 0, 0],
  k: [0x1b, 0x1d, 0x33, 255], // contorno: o navy de tinta do jogo
  y: [0xe2, 0xbf, 0x6a, 255], // dourado (o chapeu assado)
  // o espeto e o cogumelo
  t: [0x7a, 0x52, 0x2c, 255], // graveto
  u: [0xa8, 0x77, 0x44, 255], // graveto claro
  c: [0x3f, 0x6f, 0xb8, 255], // chapeu azul do cogumelo (a mesma cor dos do bosque)
  v: [0x7b, 0xa7, 0xe0, 255], // brilho do chapeu
  n: [0xe8, 0xdc, 0xc0, 255], // pe do cogumelo
  r: [0xb5, 0x6a, 0x2e, 255], // chapeu ja tostado
  // as marcas do vale ajudado
  g: [0x8d, 0x8a, 0x84, 255], // pedra
  G: [0xb3, 0xaf, 0xa6, 255], // pedra, brilho
  o: [0x5e, 0x5b, 0x56, 255], // pedra, sombra
  M: [0x5f, 0x7a, 0x3e, 255], // musgo
  w: [0x8a, 0x62, 0x38, 255], // vime
  W: [0xb0, 0x84, 0x4e, 255], // vime claro
  z: [0x5a, 0x3c, 0x22, 255], // madeira do cavalete
  Z: [0x7d, 0x56, 0x33, 255], // madeira clara
  a: [0xe9, 0xe1, 0xd0, 255], // tela crua
  A: [0x9b, 0x97, 0x8f, 255], // tela cinza (o que ela pintava)
  x: [0x6f, 0x6c, 0x66, 255], // tela cinza escura
  B: [0x8f, 0xc6, 0xe8, 255], // ceu pintado
  e: [0x7f, 0xb0, 0x54, 255], // morro verde pintado
  E: [0x5c, 0x8f, 0x3c, 255], // morro verde escuro
  f: [0xf2, 0xd3, 0x6b, 255], // sol / flor pintada
  // o coracaozinho do obrigado
  h: [0xf0, 0x7a, 0x8c, 255], // rosa
  H: [0xff, 0xc4, 0xcc, 255], // brilho
  // a rachadura que a espada abriu no chao
  q: [0x16, 0x0f, 0x0d, 230], // o fundo da fenda
  p: [0x3a, 0x2a, 0x22, 170], // a borda revolvida
};

// 16×16: o graveto com o cogumelo espetado na ponta, inclinado sobre o fogo.
const ROAST_STICK = [
  '................',
  '...........kkk..',
  '..........kcvck.',
  '.........kccvcck',
  '.........kkkkkk.',
  '..........knnk..',
  '.........kutk...',
  '........kutk....',
  '.......kutk.....',
  '......kutk......',
  '.....kutk.......',
  '....kutk........',
  '...kutk.........',
  '..kutk..........',
  '..kkk...........',
  '................',
] as const;

// 16×16, deitada no chao: a TERRA RACHADA onde a espada entrou — fendas finas que saem do centro
// e se ramificam, sem nunca sair do tile.
const GROUND_CRACK = [
  '................',
  '.......p........',
  '.......q.....p..',
  '..p....q....q...',
  '...q...qp..q....',
  '....q...q.q.....',
  '.....qq.qq......',
  'pqq...qqqq..qqp.',
  '......qqqqqq...q',
  '.....q..qq.q....',
  '....q...q...q...',
  '...p...q.....q..',
  '..q....q......p.',
  '.p.....p........',
  '................',
  '................',
] as const;

// O MARCO da Vega: tres pedras empilhadas, a de baixo com musgo.
const CAIRN = [
  '................',
  '................',
  '.......kk.......',
  '......kGgk......',
  '......kggk......',
  '.....kkookk.....',
  '....kGGgggok....',
  '....kggggggk....',
  '.....kooook.....',
  '...kkkkkkkkkk...',
  '..kGGggggggggk..',
  '..kgggggggMMgk..',
  '..kMgggggggggk..',
  '..koooooooooMk..',
  '...kkkkkkkkkk...',
  '................',
];

// O CESTO da Hollis, cheio de chapeuzinhos azuis.
const BASKET = [
  '................',
  '................',
  '................',
  '................',
  '....kkk.kkk.....',
  '...kcvckcvck....',
  '..kkcccckcckkk..',
  '..kcvck.kkcvck..',
  '..kWkkkkkkkkWk..',
  '..kwWwWwWwWwwk..',
  '..kWwWwWwWwWWk..',
  '...kwWwWwWwWk...',
  '...kWwWwWwWwk...',
  '....kkkkkkkk....',
  '................',
  '................',
];

// O CAVALETE da Iris: a tela que ela pinta, cinza antes e verde depois.
const EASEL_GREY = [
  '................',
  '..kkkkkkkkkkkk..',
  '..kAAAAAAAAAAk..',
  '..kAxAAAAAAAAk..',
  '..kAAAAAxxAAAk..',
  '..kAAAxxAAAAAk..',
  '..kxxxAAAAxxxk..',
  '..kAAAAAAAAAAk..',
  '..kkkkkkkkkkkk..',
  '....kzZkkZzk....',
  '...kzZk..kZzk...',
  '...kzk....kzk...',
  '..kzZk....kZzk..',
  '..kzk......kzk..',
  '..kk........kk..',
  '................',
];
const EASEL_GREEN = [
  '................',
  '..kkkkkkkkkkkk..',
  '..kBBBBBBBffBk..',
  '..kBBBBBBBffBk..',
  '..kBBBBBeeBBBk..',
  '..kBBeeeeEeBBk..',
  '..keeEEeeeeeek..',
  '..kEeefeEEeefk..',
  '..kkkkkkkkkkkk..',
  '....kzZkkZzk....',
  '...kzZk..kZzk...',
  '...kzk....kzk...',
  '..kzZk....kZzk..',
  '..kzk......kzk..',
  '..kk........kk..',
  '................',
];

// O CORACAO do obrigado: 9x8, rosa, com um brilho no canto.
const HEART = [
  '.kkk.kkk.',
  'khHhkhhhk',
  'kHhhhhhhk',
  'khhhhhhhk',
  '.khhhhhk.',
  '..khhhk..',
  '...khk...',
  '....k....',
] as const;

// O mesmo espeto depois de assado: o chapeu dourou.
const ROAST_STICK_DONE = ROAST_STICK.map((row) => row.replace(/c/g, 'r').replace(/v/g, 'y'));

export const ROAST_STICK_TEXTURE = 'roast-stick';
export const GROUND_CRACK_TEXTURE = 'ground-crack';
export const CAIRN_TEXTURE = 'quest-cairn';
export const HEART_TEXTURE = 'cozy-heart';
export const BASKET_TEXTURE = 'quest-basket';
export const EASEL_GREY_TEXTURE = 'quest-easel-grey';
export const EASEL_GREEN_TEXTURE = 'quest-easel-green';
export const ROAST_STICK_DONE_TEXTURE = 'roast-stick-done';

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

// O registro THREE e um mapa de modulo que sobrevive ao restart da cena: registrar uma vez so.
let threeRegistered = false;

/** Publica as tres texturas nas duas pipelines. Chamar no boot da cena (GameScene.create). */
export const registerCozyTextures = (scene: Phaser.Scene): void => {
  const sheets: ReadonlyArray<readonly [string, readonly string[]]> = [
    [ROAST_STICK_TEXTURE, ROAST_STICK],
    [GROUND_CRACK_TEXTURE, GROUND_CRACK],
    [CAIRN_TEXTURE, CAIRN],
    [HEART_TEXTURE, HEART],
    [BASKET_TEXTURE, BASKET],
    [EASEL_GREY_TEXTURE, EASEL_GREY],
    [EASEL_GREEN_TEXTURE, EASEL_GREEN],
    [ROAST_STICK_DONE_TEXTURE, ROAST_STICK_DONE],
  ];
  for (const [key, rows] of sheets) {
    const needPhaser = !scene.textures.exists(key);
    if (threeRegistered && !needPhaser) continue;
    const canvas = makeCanvas(rows);
    if (!threeRegistered) {
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
