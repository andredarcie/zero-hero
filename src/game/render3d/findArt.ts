import { INK, paintDome, RAMPS, type Paint, type Ramp } from '@/game/render3d/pixelForms';

// O QUE SE ACHA NO VALE (ver objects/ValleyFinds): 16×16, um tile só, na densidade de pixel das casas. A luz
// vem de cima e da esquerda, como em todo o resto.

export type FindKind = 'bench' | 'chair' | 'helmet' | 'bottle' | 'sign' | 'smithy';

export const FIND_SIZE = 16;

const RUST: Ramp = ['#b08458', '#8a5c3a', '#64402e', '#443028'];
const GLASS: Ramp = ['#a4d0a8', '#6a9e80', '#44705f', '#2c4c46'];
const MOSS = '#6f8f3e';
const MOSS_DARK = '#4c6a32';

/** Uma tábua deitada: em cima pega luz, embaixo fecha, e os veios não caem todos na mesma coluna. */
const plank = (rect: Paint, x: number, y: number, w: number, h: number, ramp: Ramp, seed = 0): void => {
  rect(INK, x - 1, y - 1, w + 2, h + 2);
  rect(ramp[1], x, y, w, h);
  rect(ramp[0], x, y, w, 1);
  if (h > 1) rect(ramp[2], x, y + h - 1, w, 1);
  rect(ramp[2], x + (seed * 5 + 3) % w, y, 1, Math.max(1, h - 1));
};

const post = (rect: Paint, x: number, top: number, bottom: number, ramp: Ramp): void => {
  rect(INK, x - 1, top - 1, 4, bottom - top + 2);
  rect(ramp[2], x, top, 2, bottom - top + 1);
  rect(ramp[1], x, top, 1, bottom - top + 1);
};

/** A cadeira, de frente e um pouco de cima: encosto vazado, assento largo mostrando o tampo, e quatro pernas. */
const bench = (rect: Paint): void => {
  const { wood } = RAMPS;
  // As pernas de trás, mais curtas e escuras porque ficam longe.
  rect(INK, 4, 12, 3, 3);
  rect(INK, 9, 12, 3, 3);
  rect(wood[3], 5, 12, 1, 2);
  rect(wood[3], 10, 12, 1, 2);
  // O encosto: dois montantes, a travessa de cima e uma mais fina. Entre elas se vê o que está atrás.
  post(rect, 3, 1, 9, wood);
  post(rect, 11, 1, 9, wood);
  plank(rect, 3, 1, 10, 2, wood, 1);
  plank(rect, 5, 5, 6, 1, wood, 2);
  // A trava entre as pernas da frente.
  rect(INK, 5, 12, 6, 3);
  rect(wood[2], 5, 13, 6, 1);
  post(rect, 3, 12, 15, wood);
  post(rect, 11, 12, 15, wood);
  // O assento por cima de tudo: o tampo pega a luz, e a borda da frente fecha no escuro.
  rect(INK, 1, 8, 14, 5);
  rect(wood[0], 2, 9, 12, 2);
  rect(wood[1], 8, 9, 6, 1);
  rect(wood[1], 5, 9, 1, 2);
  rect(wood[1], 11, 10, 1, 1);
  rect(wood[2], 2, 11, 12, 1);
};

/** Um desenho pixel a pixel: `.` é vazio, `k` o contorno, `0`..`3` a rampa da madeira (claro → escuro). */
const pixels = (rect: Paint, rows: readonly string[], ramp: Ramp): void => {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const c = row[x];
      if (c === 'k') rect(INK, x, y, 1, 1);
      else if (c >= '0' && c <= '3') rect(ramp[Number(c)], x, y, 1, 1);
    }
  });
};

/**
 * A CADEIRA DA BEIRA DO LAGO (pedido do autor: "uma cadeira de madeira, bem tradicional"), de frente: os
 * dois montantes com o pináculo torneado, duas travessas no encosto (entre elas se vê o que está atrás), o
 * assento largo mostrando o tampo, e as pernas da frente inteiras, com as de trás mais curtas e escuras.
 */
const CHAIR = [
  '...kk......kk...',
  '..k01k....k12k..',
  '..k01kkkkkk12k..',
  '..k0100000012k..',
  '..k01kkkkkk12k..',
  '..k01k....k12k..',
  '..k01k....k12k..',
  '..k01kkkkkk12k..',
  '..k0111111112k..',
  '.kkkkkkkkkkkkkk.',
  '.k000000000000k.',
  '.k001000000100k.',
  '.k222222222222k.',
  '.kkkkkkkkkkkkkk.',
  '.k12k3....3k23k.',
  '.k12k......k23k.',
];
const chair = (rect: Paint): void => pixels(rect, CHAIR, RAMPS.wood);

/**
 * A PLACA DO PORTÃO DO JARDIM ALTO (pedido do autor: "uma placa de madeira já bem velha e com mato em cima"). Madeira
 * gasta, acinzentada pelo tempo, com os riscos das letras quase apagados, o musgo tomando o alto da tábua e o capim
 * subindo pelo pé do poste.
 */
const OLD_WOOD: Ramp = ['#9c8a6c', '#76654c', '#574a38', '#3b3229'];
const SIGN = [
  '................',
  '....G....g......',
  '..gGGg.GgGG.g...',
  '.kkkkkkkkkkkkkk.',
  '.kG01001000100k.',
  '.kg31213131311k.',
  '.k113131213131k.',
  '.k222232222322k.',
  '.kkkkkkkkkkkkkk.',
  '......k12k......',
  '......k12k......',
  '......k13k......',
  '......k12k......',
  '....g.k12k.g....',
  '...gGgk12kGgG...',
  '......kkkk......',
];
const sign = (rect: Paint): void => {
  SIGN.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const c = row[x];
      const color = c === 'k' ? INK : c === 'G' ? MOSS : c === 'g' ? MOSS_DARK
        : c >= '0' && c <= '3' ? OLD_WOOD[Number(c)] : null;
      if (color) rect(color, x, y, 1, 1);
    }
  });
};

const helmet = (rect: Paint): void => {
  // A flor primeiro: ela sai de dentro, e o elmo cobre o pé dela.
  rect(MOSS_DARK, 8, 3, 1, 6);
  rect(MOSS, 9, 5, 2, 1);
  rect(INK, 7, 0, 3, 5);
  rect(INK, 6, 1, 5, 3);
  rect(RAMPS.pink[1], 7, 1, 3, 3);
  rect(RAMPS.pink[0], 7, 1, 2, 1);
  rect('#f4d060', 8, 2, 1, 1);
  paintDome(rect, 7.5, 15, 6, 7, RUST);
  // A viseira e o buraco que deixou a flor passar.
  rect(INK, 3, 11, 9, 2);
  rect(RUST[3], 7, 13, 1, 2);
  rect(INK, 7, 8, 2, 1);
};

const bottle = (rect: Paint): void => {
  // Deitada e meio enterrada, com a boca para a direita.
  rect(INK, 2, 8, 9, 7);
  rect(INK, 11, 9, 3, 5);
  rect(GLASS[1], 3, 9, 7, 5);
  rect(GLASS[0], 3, 9, 6, 1);
  rect(GLASS[2], 3, 13, 7, 1);
  rect(GLASS[1], 11, 10, 2, 3);
  rect(GLASS[0], 11, 10, 2, 1);
  // A rolha.
  rect(INK, 13, 9, 3, 5);
  rect(RAMPS.wood[0], 14, 10, 1, 3);
  // O bilhete enrolado lá dentro, com uma linha de tinta.
  rect(RAMPS.plaster[1], 4, 10, 5, 3);
  rect(RAMPS.plaster[2], 4, 12, 5, 1);
  rect(RAMPS.stone[3], 5, 11, 3, 1);
};

const stool = (rect: Paint): void => {
  const { wood } = RAMPS;
  post(rect, 3, 9, 15, wood);
  post(rect, 11, 9, 15, wood);
  plank(rect, 2, 7, 12, 2, wood, 1);
};

const lantern = (rect: Paint): void => {
  const { metal } = RAMPS;
  rect(INK, 6, 1, 4, 3);
  rect(metal[2], 7, 2, 2, 1);
  rect(INK, 3, 3, 10, 12);
  rect(metal[2], 4, 4, 8, 1);
  rect(metal[3], 4, 13, 8, 1);
  rect('#f4b84a', 5, 5, 6, 8);
  rect('#ffe08a', 6, 6, 4, 6);
  rect('#fff4c8', 7, 8, 2, 3);
  rect(metal[2], 4, 5, 1, 8);
  rect(metal[3], 11, 5, 1, 8);
};

const flowerPot = (rect: Paint): void => {
  // A flor primeiro, e o vaso cobre o pé dela.
  rect(MOSS_DARK, 7, 5, 2, 5);
  rect(MOSS, 9, 7, 2, 1);
  rect(MOSS, 5, 8, 2, 1);
  rect(INK, 5, 0, 6, 6);
  rect(RAMPS.pink[1], 6, 1, 4, 4);
  rect(RAMPS.pink[0], 6, 1, 3, 1);
  rect('#f4d060', 7, 2, 2, 2);
  const clay: Ramp = ['#d88a5a', '#b0683e', '#84482e', '#5a3026'];
  rect(INK, 3, 9, 10, 7);
  rect(clay[1], 4, 10, 8, 2);
  rect(clay[0], 4, 10, 4, 1);
  rect(clay[2], 5, 12, 6, 3);
  rect(clay[1], 5, 12, 3, 2);
};

export const DECOR_PAINTERS: Readonly<Record<'stool' | 'lantern' | 'flowerPot', (rect: Paint) => void>> = {
  stool, lantern, flowerPot,
};

/**
 * A FORJA VELHA: o que sobrou da parede da oficina de um ferreiro que foi embora há muito tempo. Pedras na paleta do
 * tileset (sem contorno, como a arte nova do vale), o alto quebrado em degraus e tomado de musgo, a BOCA DA LAREIRA
 * ainda preta de fuligem, e uma plaquinha de madeira com a bigorna queimada.
 */
const SMITHY = [
  '................',
  '..mM......Mm....',
  '.mSSs....mSSsm..',
  '.dsSsd..mdsSssd.',
  '.lllllm.lllllll.',
  '.sdSsdssSsdlsSd.',
  '.lllllllllllll..',
  '.dsSsdoooodwWWW.',
  '.llllooooo.WffW.',
  '.sSsdooooodWbbW.',
  '.llllooooo.WffW.',
  '.dSsdoooood.WW..',
  '.lllloooool.ll..',
  '.sdsSoooooSsdsd.',
  '.mMllkkkkkllMmM.',
  '..kkkkkkkkkkkk..',
];
const SMITHY_COLORS: Readonly<Record<string, string>> = {
  s: '#8e897d', d: '#7b776d', S: '#cdcdcd', l: '#3a3f3f', o: '#191817', k: '#111214',
  m: '#8a8d49', M: '#626439', w: '#815938', W: '#63452c', f: '#b7916a', b: '#674325',
};
const smithy = (rect: Paint): void => {
  SMITHY.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const color = SMITHY_COLORS[row[x]];
      if (color) rect(color, x, y, 1, 1);
    }
  });
};

export const FIND_PAINTERS: Readonly<Record<FindKind, (rect: Paint) => void>> = {
  bench, chair, helmet, bottle, sign, smithy,
};
