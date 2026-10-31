import type Phaser from 'phaser';
import * as THREE from 'three';

import type { DyeKind } from '@/game/quests/dyePlants';
import { registerTexture3D } from '@/game/render3d/textures3d';

// A ARTE DA QUEST DA IRIS: as três coisas que ela dá, os três tempos das plantas de tinta, a mesa em
// que as tintas nascem e o quadro. Pixel desenhado aqui, como o resto da arte gerada no boot, nas
// duas pipelines (o Phaser para o item na tela, o THREE para o mundo).

const PALETTE: Readonly<Record<string, readonly [number, number, number, number]>> = {
  '.': [0, 0, 0, 0],
  k: [32, 24, 18, 255], // contorno
  P: [226, 210, 170, 255], // papel
  p: [190, 168, 124, 255],
  W: [176, 124, 76, 255], // madeira
  w: [124, 84, 50, 255],
  S: [168, 168, 160, 255], // pedra do pilão
  s: [112, 112, 108, 255],
  B: [233, 226, 206, 255], // cerdas
  G: [92, 158, 70, 255], // folha
  g: [54, 108, 52, 255],
  R: [232, 98, 44, 255], // urucum
  r: [176, 48, 28, 255],
  I: [226, 132, 170, 255], // a flor rosa do urucum
  A: [58, 78, 176, 255], // anil
  a: [132, 112, 208, 255], // a flor do anil
  Y: [242, 194, 48, 255], // cúrcuma
  y: [250, 240, 214, 255], // a flor clara da cúrcuma
  C: [179, 32, 58, 255], // garança
  c: [236, 214, 92, 255], // a flor miúda da garança
  e: [84, 72, 58, 255], // pote vazio
};

const SEED_PACK = [
  '................',
  '....kkkkkkkk....',
  '...kpPpPpPpPk...',
  '...kkkkkkkkkk...',
  '...kPPPPPPPPk...',
  '...kPIPPPPaPk...',
  '...kIcIPPaYak...',
  '...kPIPPPPaPk...',
  '...kPPgPPgPPk...',
  '...kPPgPPgPPk...',
  '...kPYPPPPCPk...',
  '...kYrYPPCcCk...',
  '...kPYPPPPCPk...',
  '...kPPPPPPPPk...',
  '....kkkkkkkk....',
  '................',
];

const BUNDLE = [
  '................',
  '...kk..kkk..k...',
  '..kIIk.kaak.kYk.',
  '..kIrIkkaYakkYk.',
  '..kkIkgkaakkkY.k',
  '...kgkgkkkkgkkcc',
  '...kgggkgkggkcCc',
  '....kgggggggkkck',
  '.....kgggggkgkk.',
  '......kWWWk.....',
  '......kwwwk.....',
  '......kgggk.....',
  '.....kgkgkgk....',
  '....kgk.g.kgk...',
  '....kk..k..kk...',
  '................',
];

const BRUSH = [
  '................',
  '.............kk.',
  '............kWwk',
  '...........kWwk.',
  '..........kWwk..',
  '.........kWwk...',
  '........kWwk....',
  '.......kWwk.....',
  '......kSsk......',
  '.....kSsSk......',
  '....kBBSk.......',
  '...kBBBk........',
  '..kBRBk.........',
  '..kRRk..........',
  '..kkk...........',
  '................',
];

const SPROUT = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '......kk.kk.....',
  '.....kGGkGGk....',
  '......kGGGk.....',
  '.......kgk......',
  '.......kgk......',
  '.....kkwwwkk....',
  '....kwWWWWWwk...',
  '................',
];

const BUD = [
  '................',
  '................',
  '................',
  '................',
  '.......kk.......',
  '......kGGk......',
  '...kk.kGGk.kk...',
  '..kGGkkgkkGGGk..',
  '...kGGggggGGk...',
  '....kkkggkkk....',
  '..kGGkkggkkGGk..',
  '...kGGggggGGk...',
  '....kkkggkkk....',
  '.....kkwwwkk....',
  '....kwWWWWWwk...',
  '................',
];

const FLOWERS: Readonly<Record<DyeKind, readonly string[]>> = {
  // Urucum: flor rosa e o ouriço vermelho, que é onde mora a tinta.
  urucum: [
    '.......kk.......',
    '...kkkkIIkkkk...',
    '..kIIkIcIkIIk...',
    '..kIcIkIkIcIk...',
    '...kIkgkgkIk.k..',
    '....kGgkgGk.kRk.',
    '..kkGGggGGkkrRk.',
    '.kRRkGGgGkkRrk..',
    '.krRRkkgkkgkk...',
    '..krrkggGGk.....',
    '...kkGGggk......',
    '.....kkggkk.....',
    '...kGGkggkGGk...',
    '.....kkwwwkk....',
    '....kwWWWWWwk...',
    '................',
  ],
  // Anil: espigas de florzinhas, e folha miúda. O azul vem da folha, não da flor.
  anil: [
    '................',
    '...kk...kk..kk..',
    '..kaak.kaakkaak.',
    '..kAak.kAakkAak.',
    '..kaakkkaakkaak.',
    '...kAkgkAkgkAk..',
    '....kkgkkkgkkk..',
    '..kGkggkgkggkGk.',
    '.kGGggGkgGgggGk.',
    '..kkGgkkgkkgGk..',
    '.kGGgGkggkGggGk.',
    '..kkkGgggggkkk..',
    '....kGGggGGk....',
    '.....kkwwwkk....',
    '....kwWWWWWwk...',
    '................',
  ],
  // Cúrcuma: a flor em cone, branca e verde, entre folhas largas. O amarelo está na raiz.
  curcuma: [
    '.......kk.......',
    '......kyyk......',
    '.....kyGyyk.....',
    '.....kyyGyk.....',
    '.....kGyyGk.....',
    '..kk.kyGyyk.kk..',
    '.kGGkkGyyGkkGGk.',
    '.kGgGkkGGkkGgGk.',
    '.kGggGkggkGggGk.',
    '.kGggGkggkGggGk.',
    '..kGggGggGggGk..',
    '...kGgGggGgGk...',
    '....kkGggGkk....',
    '.....kkwwwkk....',
    '....kwWWWWWwk...',
    '................',
  ],
  // Garança: arbusto de folha em roda e estrelinhas amarelas. O vermelho está na raiz.
  garanca: [
    '................',
    '....kk....kk....',
    '...kcck..kcck...',
    '.kk.kkgkkgkk.kk.',
    'kcckkGGggGGkkcck',
    '.kkgGgGkkGgGgkk.',
    '..kGkgkcckgkGk..',
    '.kGGggkcckggGGk.',
    '..kkGgkkkkgGkk..',
    '.kcckGggggGkcck.',
    '.kcckgGggGgkcck.',
    '..kkkGGggGGkkk..',
    '....kkGggGkk....',
    '.....kkwwwkk....',
    '....kwWWWWWwk...',
    '................',
  ],
};

// A MESA DA IRIS: o pilão no meio e os quatro potes. `1`-`4` são os potes, trocados pela cor quando
// a tinta fica pronta (ver `tableRows`).
const TABLE = [
  '................',
  '................',
  '.........kk.....',
  '........kWk.....',
  '.......kWk......',
  '.....kkkkkkk....',
  '.....kSsSSsk....',
  'kkk.kkSSSSkkkkk.',
  'k1k.k2kssk3k.k4k',
  'k1k.k2kkkk3k.k4k',
  'kkkkkkkkkkkkkkkk',
  'kWWWWWWWWWWWWWWk',
  'kwwwwwwwwwwwwwwk',
  '.kk.........kk..',
  '.kWk.......kWk..',
  '.kk.........kk..',
];

const POT_COLORS: readonly string[] = ['R', 'A', 'Y', 'C'];

const tableRows = (filled: number): string[] => TABLE.map((row) => row.replace(/[1-4]/g, (slot) => {
  const index = Number(slot) - 1;
  return index < filled ? POT_COLORS[index] : 'e';
}));

export const DYE_SEEDS_TEXTURE = 'paint-dye-seeds';
export const DYE_BUNDLE_TEXTURE = 'paint-dye-bundle';
export const BRUSH_TEXTURE = 'paint-brush';
export const DYE_SPROUT_TEXTURE = 'paint-plant-sprout';
export const DYE_BUD_TEXTURE = 'paint-plant-bud';
export const EASEL_BLANK_TEXTURE = 'paint-easel-blank';
export const EASEL_ART_TEXTURE = 'paint-easel-art';

export const dyeFlowerTexture = (kind: DyeKind): string => `paint-plant-${kind}`;
/** A mesa com `filled` potes prontos (0 a 4). */
export const paintTableTexture = (filled: number): string => `paint-table-${filled}`;

const rowsCanvas = (rows: readonly string[]): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length;
  canvas.height = rows.length;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const img = ctx.createImageData(canvas.width, canvas.height);
  rows.forEach((row, y) => {
    for (let x = 0; x < canvas.width; x += 1) {
      const [r, g, b, a] = PALETTE[row[x]] ?? PALETTE['.'];
      img.data.set([r, g, b, a], (y * canvas.width + x) * 4);
    }
  });
  ctx.putImageData(img, 0, 0);
  return canvas;
};

// O QUADRO, em 32×32 porque é o único desenho do jogo que tem de caber um desenho dentro.
const EASEL_SIZE = 32;
const CANVAS_X = 4;
const CANVAS_Y = 2;
const CANVAS_W = 24;
const CANVAS_H = 18;

const easelCanvas = (art?: CanvasImageSource): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = EASEL_SIZE;
  canvas.height = EASEL_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  const rect = (color: string, x: number, y: number, w: number, h: number): void => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  // As pernas: duas abertas e a de trás no meio.
  for (let i = 0; i < 10; i += 1) {
    rect('#201812', 7 - Math.floor(i / 2), 21 + i, 3, 1);
    rect('#8e623a', 8 - Math.floor(i / 2), 21 + i, 1, 1);
    rect('#201812', 22 + Math.floor(i / 2), 21 + i, 3, 1);
    rect('#8e623a', 23 + Math.floor(i / 2), 21 + i, 1, 1);
  }
  rect('#201812', 15, 21, 2, 8);
  rect('#201812', 3, 21, 26, 2);
  rect('#8e623a', 4, 21, 24, 1);
  // A tela.
  rect('#201812', CANVAS_X - 1, CANVAS_Y - 1, CANVAS_W + 2, CANVAS_H + 2);
  // A tela é um creme contido: branco de verdade estoura no brilho do mundo à noite.
  rect('#d8d4ca', CANVAS_X, CANVAS_Y, CANVAS_W, CANVAS_H);
  if (art) ctx.drawImage(art, CANVAS_X, CANVAS_Y, CANVAS_W, CANVAS_H);
  return canvas;
};

const publish3D = (key: string, canvas: HTMLCanvasElement): void => {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  registerTexture3D(key, tex);
};

// O registro THREE é um mapa de módulo que sobrevive ao restart da cena: registrar uma vez só.
let threeRegistered = false;

export const registerPaintTextures = (scene: Phaser.Scene): void => {
  const sheets: ReadonlyArray<readonly [string, HTMLCanvasElement]> = [
    [DYE_SEEDS_TEXTURE, rowsCanvas(SEED_PACK)],
    [DYE_BUNDLE_TEXTURE, rowsCanvas(BUNDLE)],
    [BRUSH_TEXTURE, rowsCanvas(BRUSH)],
    [DYE_SPROUT_TEXTURE, rowsCanvas(SPROUT)],
    [DYE_BUD_TEXTURE, rowsCanvas(BUD)],
    [EASEL_BLANK_TEXTURE, easelCanvas()],
    ...(Object.keys(FLOWERS) as DyeKind[]).map((kind) => [dyeFlowerTexture(kind), rowsCanvas(FLOWERS[kind])] as const),
    ...[0, 1, 2, 3, 4].map((filled) => [paintTableTexture(filled), rowsCanvas(tableRows(filled))] as const),
  ];
  for (const [key, canvas] of sheets) {
    if (!threeRegistered) publish3D(key, canvas);
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas);
  }
  threeRegistered = true;
};

/** Põe o desenho do jogador no quadro. A textura é trocada inteira: um desenho, uma textura. */
export const publishEaselArt = (art: CanvasImageSource): void => {
  publish3D(EASEL_ART_TEXTURE, easelCanvas(art));
};
