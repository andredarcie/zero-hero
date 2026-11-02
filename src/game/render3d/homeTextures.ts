import type Phaser from 'phaser';
import * as THREE from 'three';

import { terrainVariant } from '@/game/constants';
import {
  INK, paintColumn, paintDome, RAMPS, toneOf, type Paint, type Ramp,
} from '@/game/render3d/pixelForms';
import { registerTexture3D } from '@/game/render3d/textures3d';
import type { NpcKind } from '@/game/world/ScreenContent';

// AS CASAS DOS VIZINHOS: 48×48, três tiles de largura na mesma densidade de pixel do resto. Cada uma diz
// quem mora nela: a cápsula remendada da Vega, a cabana de toras do Bram, a casa manchada de tinta da
// Iris e o cogumelo do Hollis. Cada casa tem uma segunda camada só com as janelas
// acesas, que entra de noite (ver NpcHomes).

export type HomeKind = Extract<NpcKind, 'astronaut' | 'businessMan' | 'painter' | 'radiationSuit'>;

const GLOW = '#ffd870';
const GLOW_CORE = '#fff0b0';

/** A janela. De dia, vidro frio com o reflexo no canto da luz; acesa, ela sai na camada de cima. */
const windowPane = (rect: Paint, glow: boolean, x: number, y: number, w: number, h: number, frame: string = INK): void => {
  if (glow) {
    rect(GLOW, x, y, w, h);
    rect(GLOW_CORE, x, y, Math.ceil(w / 2), Math.ceil(h / 2));
    rect(frame, x + Math.floor(w / 2), y, 1, h);
    rect(frame, x, y + Math.floor(h / 2), w, 1);
    return;
  }
  rect(frame, x - 1, y - 1, w + 2, h + 2);
  rect('#2f4a5c', x, y, w, h);
  rect('#5f8a9a', x, y, Math.ceil(w / 2), Math.ceil(h / 2));
  rect('#a9d0d4', x, y, 2, 1);
  rect(frame, x + Math.floor(w / 2), y, 1, h);
  rect(frame, x, y + Math.floor(h / 2), w, 1);
};

/** O telhado de duas águas, de frente: fiadas desencontradas, cada uma com a borda de baixo mais escura. */
const paintGable = (rect: Paint, cx: number, top: number, rows: number, startHalf: number, grow: number, ramp: Ramp): void => {
  for (let i = 0; i < rows; i += 1) {
    const y = top + i;
    const half = Math.round(startHalf + i * grow);
    rect(INK, cx - half - 1, y, half * 2 + 2, 1);
    const left = cx - half;
    for (let x = left; x < cx + half; x += 1) {
      const course = Math.floor(i / 3);
      const stagger = (x + course * 3) % 6;
      const lit = x < cx ? 0.5 : -0.05;
      let tone = toneOf(ramp, lit);
      if (i % 3 === 2) tone = stagger === 0 ? ramp[3] : ramp[2];
      else if (stagger === 0 && i % 3 === 1) tone = ramp[2];
      rect(tone, x, y, 1, 1);
    }
  }
  rect(INK, cx - Math.round(startHalf + (rows - 1) * grow) - 1, top + rows, Math.round(startHalf + (rows - 1) * grow) * 2 + 2, 1);
};

const vegaHome = (rect: Paint, glow: boolean): void => {
  if (glow) {
    windowPane(rect, true, 13, 22, 8, 7, '#535668');
    rect(GLOW, 26, 34, 6, 10);
    rect(GLOW_CORE, 27, 35, 2, 8);
    return;
  }
  // A antena: o prato pega luz em cima, a haste é fina e o cabo desce pelo casco.
  rect(INK, 35, 6, 2, 10);
  rect(RAMPS.metal[1], 35, 6, 1, 10);
  rect(INK, 29, 3, 13, 4);
  rect(RAMPS.metal[0], 30, 3, 7, 2);
  rect(RAMPS.metal[2], 37, 3, 4, 2);
  rect(RAMPS.metal[3], 31, 5, 9, 1);
  rect(RAMPS.orange[0], 35, 1, 2, 2);
  // A cápsula, em volume.
  paintDome(rect, 24, 44, 20, 32, RAMPS.metal);
  // A faixa laranja acompanha a curva do casco, com a mesma luz.
  for (let x = 5; x < 44; x += 1) {
    const nx = (x + 0.5 - 24) / 20;
    const bow = Math.round((1 - nx * nx) * 2);
    rect(toneOf(RAMPS.orange, nx * -0.95 + 0.25), x, 30 + bow, 1, 3);
  }
  // As emendas das chapas, desencontradas, em tom escuro do próprio metal.
  for (const [x, y, w] of [[11, 18, 7], [27, 15, 9], [8, 37, 6], [33, 25, 7], [15, 39, 5]] as const) rect(RAMPS.metal[3], x, y, w, 1);
  // Os remendos: ela consertou isso sozinha, com o que tinha.
  rect(RAMPS.metal[3], 31, 18, 8, 6);
  rect('#a58a52', 32, 18, 6, 5);
  rect('#c7a868', 32, 18, 3, 2);
  rect('#7c6438', 37, 22, 1, 1);
  rect(RAMPS.metal[3], 8, 26, 5, 3);
  rect(RAMPS.metal[1], 9, 26, 3, 2);
  windowPane(rect, false, 13, 22, 8, 7, '#3d4052');
  // A porta, deslocada: nada aqui é simétrico, ela caiu assim.
  rect(INK, 25, 33, 8, 13);
  rect(RAMPS.metal[2], 26, 34, 6, 12);
  rect(RAMPS.metal[1], 26, 34, 2, 12);
  rect(RAMPS.orange[1], 30, 39, 1, 2);
  // A terra que subiu em volta quando ela afundou aqui.
  for (let x = 2; x < 46; x += 1) {
    const heap = Math.abs(((x * 7) % 11) - 5) > 3 ? 2 : 1;
    rect('#3f2f24', x, 46 - heap, 1, heap + 1);
    if (heap === 2) rect('#6a5236', x, 44, 1, 1);
  }
};

const bramHome = (rect: Paint, glow: boolean): void => {
  if (glow) {
    windowPane(rect, true, 10, 28, 6, 6, RAMPS.door[3]);
    windowPane(rect, true, 33, 28, 6, 6, RAMPS.door[3]);
    return;
  }
  // A chaminé de pedra, atrás do telhado, em blocos desencontrados.
  rect(INK, 32, 2, 9, 16);
  for (let y = 3; y < 18; y += 1) {
    for (let x = 33; x < 40; x += 1) {
      const course = Math.floor((y - 3) / 3);
      const seam = (y - 3) % 3 === 2 || (x + course * 2) % 4 === 0;
      rect(seam ? RAMPS.stone[3] : (x < 36 ? RAMPS.stone[0] : RAMPS.stone[1]), x, y, 1, 1);
    }
  }
  // As paredes: cada tora é redonda (claro em cima, escuro embaixo) e sobra no canto.
  rect(INK, 3, 22, 42, 24);
  for (let row = 0; row < 6; row += 1) {
    const y = 23 + row * 4;
    for (let x = 4; x < 44; x += 1) {
      const lit = x < 24 ? 0 : 1;
      rect(RAMPS.wood[lit], x, y, 1, 1);
      rect(RAMPS.wood[lit + 1 > 3 ? 3 : lit + (row % 2 === 0 ? 0 : 1)], x, y + 1, 1, 1);
      rect(RAMPS.wood[2], x, y + 2, 1, 1);
      rect(RAMPS.wood[3], x, y + 3, 1, 1);
    }
    // Veios curtos, nunca alinhados de uma tora para a outra.
    rect(RAMPS.wood[2], 7 + row * 5, y + 1, 4, 1);
    rect(RAMPS.wood[2], 31 - row * 3, y, 3, 1);
    // As pontas: anéis de topo.
    for (const x of [3, 42]) {
      rect(INK, x, y, 3, 4);
      rect(RAMPS.wood[0], x, y, 2, 3);
      rect(RAMPS.wood[2], x + 1, y + 1, 1, 1);
    }
  }
  // A sombra do beiral, na parede.
  rect(RAMPS.wood[3], 4, 23, 40, 3);
  rect('#2e1d1e', 4, 23, 40, 1);
  // O telhado, com o beiral sobrando dois pixels de cada lado.
  paintGable(rect, 24, 7, 16, 5, 1.42, RAMPS.thatch);
  windowPane(rect, false, 10, 28, 6, 6, RAMPS.door[3]);
  windowPane(rect, false, 33, 28, 6, 6, RAMPS.door[3]);
  // A porta de tábuas, com a luz na da esquerda.
  rect(INK, 20, 29, 9, 17);
  rect(RAMPS.door[0], 21, 30, 3, 16);
  rect(RAMPS.door[1], 24, 30, 2, 16);
  rect(RAMPS.door[2], 26, 30, 2, 16);
  rect(RAMPS.door[3], 21, 34, 7, 1);
  rect(RAMPS.door[3], 21, 41, 7, 1);
  rect('#e0c070', 26, 37, 1, 2);
  // A lenha, de topo: círculos, não caixas.
  rect(INK, 0, 38, 4, 8);
  for (const [x, y] of [[0, 39], [0, 42]] as const) {
    rect(RAMPS.wood[0], x, y, 3, 2);
    rect(RAMPS.wood[2], x + 1, y + 1, 1, 1);
  }
};

const irisHome = (rect: Paint, glow: boolean): void => {
  if (glow) {
    windowPane(rect, true, 8, 26, 14, 9, RAMPS.door[3]);
    return;
  }
  // As paredes de reboco: claro à esquerda, a quina escura à direita.
  rect(INK, 5, 21, 38, 25);
  rect(RAMPS.plaster[1], 6, 22, 36, 24);
  rect(RAMPS.plaster[0], 6, 22, 10, 24);
  rect(RAMPS.plaster[2], 35, 22, 7, 24);
  rect(RAMPS.plaster[3], 40, 22, 2, 24);
  // O reboco gasto, em pedacinhos soltos.
  for (const [x, y, w] of [[25, 42, 4], [8, 42, 3], [37, 30, 2], [18, 40, 2]] as const) rect(RAMPS.plaster[2], x, y, w, 1);
  // A sombra do beiral.
  rect(RAMPS.plaster[3], 6, 22, 36, 2);
  rect(RAMPS.plaster[2], 6, 24, 36, 1);
  // As manchas de tinta, em forma de pingo: cada uma tem um miolo e um respingo.
  const splat = (color: string, dark: string, x: number, y: number): void => {
    rect(color, x, y, 4, 2);
    rect(color, x + 1, y - 1, 2, 1);
    rect(dark, x + 2, y + 2, 2, 1);
    rect(color, x + 5, y + 3, 1, 1);
    rect(dark, x + 3, y + 3, 1, 2);
  };
  // Sem vermelho na parede: de noite, à luz do fogo, escorria como sangue.
  splat('#4aa35a', '#2c7044', 26, 26);
  splat('#4a60c4', '#2c3a86', 36, 37);
  splat('#f2c230', '#b48a24', 8, 39);
  splat('#a868d0', '#6c3e96', 33, 30);
  // O telhado, torto de propósito.
  paintGable(rect, 23, 2, 19, 3, 1.28, RAMPS.pink);
  // A janela de ateliê, com a jardineira.
  windowPane(rect, false, 8, 26, 14, 9, RAMPS.door[3]);
  rect(INK, 7, 36, 16, 3);
  rect(RAMPS.door[0], 8, 36, 7, 2);
  rect(RAMPS.door[1], 15, 36, 7, 2);
  for (const [color, dark, x] of [['#e8622c', '#a83e22', 9], ['#f2c230', '#b48a24', 13], ['#4a60c4', '#2c3a86', 17], ['#c42a4a', '#861c3c', 20]] as const) {
    rect('#4c8a44', x, 35, 1, 1);
    rect(color, x - 1, 33, 2, 2);
    rect(dark, x, 34, 1, 1);
  }
  // A porta azul, com os potes.
  rect(INK, 26, 33, 8, 13);
  rect(RAMPS.blue[0], 27, 34, 2, 12);
  rect(RAMPS.blue[1], 29, 34, 2, 12);
  rect(RAMPS.blue[2], 31, 34, 2, 12);
  rect(RAMPS.blue[3], 27, 39, 6, 1);
  rect('#f2c230', 31, 40, 1, 2);
  for (const [color, x] of [['#e8622c', 36], ['#4a60c4', 40]] as const) {
    rect(INK, x - 1, 42, 5, 4);
    rect(RAMPS.door[2], x, 43, 3, 3);
    rect(RAMPS.door[1], x, 44, 1, 2);
    rect(color, x, 43, 3, 1);
  }
};

const hollisHome = (rect: Paint, glow: boolean): void => {
  if (glow) {
    windowPane(rect, true, 16, 11, 6, 5, RAMPS.cap[3]);
    rect(GLOW, 20, 36, 6, 9);
    rect(GLOW_CORE, 21, 37, 2, 7);
    return;
  }
  // O talo, redondo, abrindo no pé. A sombra do chapéu cai sobre ele.
  paintColumn(rect, () => 23, 24, 45, (y) => 9 + (y - 24) * 0.17, RAMPS.stem);
  for (let y = 26; y < 31; y += 1) rect(y < 28 ? RAMPS.stem[3] : RAMPS.stem[2], 14, y, 19, 1);
  // As lamelas, em leque a partir do meio.
  rect(INK, 7, 23, 34, 3);
  for (let x = 8; x < 40; x += 2) rect(RAMPS.stem[x < 22 ? 2 : 3], x, 24, 1, 1);
  // O chapéu, em volume.
  paintDome(rect, 24, 23, 23, 21, RAMPS.cap);
  // As pintas seguem a curva: menores perto da borda, cada uma com a sombra embaixo e à direita.
  for (const [x, y, w, h] of [[6, 18, 5, 3], [15, 19, 4, 2], [29, 18, 6, 3], [38, 15, 4, 3], [10, 10, 4, 3], [30, 7, 5, 3], [23, 13, 3, 2]] as const) {
    rect(RAMPS.stem[1], x, y, w, h);
    rect(RAMPS.stem[0], x, y, Math.ceil(w / 2), 1);
    rect(RAMPS.stem[3], x + 1, y + h, w - 1, 1);
  }
  windowPane(rect, false, 16, 11, 6, 5, RAMPS.cap[3]);
  // A porta arredondada.
  rect(INK, 19, 36, 8, 10);
  rect(INK, 20, 35, 6, 1);
  rect(RAMPS.door[0], 20, 36, 2, 10);
  rect(RAMPS.door[1], 22, 36, 2, 10);
  rect(RAMPS.door[2], 24, 36, 2, 10);
  rect('#e0c070', 24, 40, 1, 2);
  // O micélio: os fios brancos de que ele fala, saindo do pé e sumindo na terra.
  for (const [x, y, w] of [[3, 45, 9], [36, 45, 10], [7, 44, 3], [38, 44, 2], [1, 46, 3], [44, 46, 3]] as const) rect(RAMPS.stem[1], x, y, w, 1);
};

export const HOME_PAINTERS: Readonly<Record<HomeKind, (rect: Paint, glow: boolean) => void>> = {
  astronaut: vegaHome,
  businessMan: bramHome,
  painter: irisHome,
  radiationSuit: hollisHome,
};

export const homeTexture = (kind: HomeKind): string => `home-${kind}`;
export const homeGlowTexture = (kind: HomeKind): string => `home-${kind}-glow`;
export const homeYardTexture = (kind: HomeKind): string => `home-${kind}-yard`;

/** O terreiro, em tiles: a mancha de terra batida em volta da casa. */
export const YARD_WIDTH = 7;
export const YARD_DEPTH = 5;
const YARD_TEXELS = 16;
const YARD_EARTH = '#77654a';
const YARD_WORN = '#6c5b42';
const YARD_PEBBLE = '#8a785a';
const YARD_FRINGE = '#5f5a38';

const yardNoise = (x: number, y: number, seed: number): number => terrainVariant(x + seed * 31, y - seed * 17, 1000) / 999;

/** Terra limpa: um tom só, com manchas gastas e poucas pedrinhas. A beira é irregular, nunca uma elipse exata. */
const paintYard = (rect: Paint, seed: number): void => {
  const w = YARD_WIDTH * YARD_TEXELS;
  const h = YARD_DEPTH * YARD_TEXELS;
  for (let by = 0; by < h; by += 2) {
    for (let bx = 0; bx < w; bx += 2) {
      const nx = (bx + 1 - w / 2) / (w / 2);
      const ny = (by + 1 - h / 2) / (h / 2);
      const reach = Math.hypot(nx, ny) + (yardNoise(bx >> 2, by >> 2, seed) - 0.5) * 0.14;
      if (reach > 0.97) continue;
      const fringe = reach > 0.88;
      if (fringe && yardNoise(bx, by, seed + 1) < 0.4) continue;
      // Por ondas e não por blocos: uma mancha quadrada vira tabuleiro de xadrez no chão.
      const worn = Math.sin(bx * 0.11 + seed) + Math.sin(by * 0.17 + seed * 2) + Math.sin((bx + by) * 0.07) + yardNoise(bx, by, seed + 2) * 0.7 > 1.5;
      rect(fringe ? YARD_FRINGE : worn ? YARD_WORN : YARD_EARTH, bx, by, 2, 2);
      if (!fringe && yardNoise(bx, by, seed + 3) > 0.985) rect(YARD_PEBBLE, bx, by, 1, 1);
    }
  }
};

export const paintedCanvas = (paint: (rect: Paint) => void, width = 48, height = 48): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  paint((color, x, y, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  });
  return canvas;
};

// O registro THREE é um mapa de módulo que sobrevive ao restart da cena: registrar uma vez só.
let threeRegistered = false;

export const registerHomeTextures = (scene: Phaser.Scene): void => {
  (Object.keys(HOME_PAINTERS) as HomeKind[]).forEach((kind, seed) => {
    const painter = HOME_PAINTERS[kind];
    const sheets: ReadonlyArray<readonly [string, HTMLCanvasElement]> = [
      [homeTexture(kind), paintedCanvas((rect) => painter(rect, false))],
      [homeGlowTexture(kind), paintedCanvas((rect) => painter(rect, true))],
      [homeYardTexture(kind), paintedCanvas((rect) => paintYard(rect, seed + 1), YARD_WIDTH * YARD_TEXELS, YARD_DEPTH * YARD_TEXELS)],
    ];
    for (const [key, canvas] of sheets) {
      if (!threeRegistered) {
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        registerTexture3D(key, tex);
      }
      if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas);
    }
  });
  threeRegistered = true;
};
