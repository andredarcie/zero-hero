import { INK, paintDome, RAMPS, toneOf, type Paint, type Ramp } from '@/game/render3d/pixelForms';

// O QUE SE ACHA NO VALE (ver objects/ValleyFinds): 16×16, um tile só, na densidade de pixel das casas. A luz
// vem de cima e da esquerda, como em todo o resto.

export type FindKind = 'bench' | 'log' | 'helmet' | 'bottle' | 'swing';

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

const log = (rect: Paint): void => {
  const { wood } = RAMPS;
  rect(INK, 0, 7, 12, 9);
  for (let y = 8; y <= 14; y += 1) rect(toneOf(wood, (11 - y) / 3), 1, y, 11, 1);
  // As fendas da casca, desencontradas.
  rect(wood[3], 3, 10, 4, 1);
  rect(wood[3], 7, 12, 4, 1);
  rect(wood[3], 2, 13, 3, 1);
  // A ponta cortada, com os anéis.
  rect(INK, 10, 6, 6, 10);
  rect(RAMPS.stem[1], 11, 7, 4, 8);
  rect(RAMPS.stem[2], 12, 9, 2, 4);
  rect(wood[2], 12, 10, 1, 2);
  // O musgo só em cima, onde a chuva fica.
  rect(MOSS, 2, 8, 5, 1);
  rect(MOSS_DARK, 4, 9, 2, 1);
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

const swing = (rect: Paint): void => {
  const { wood } = RAMPS;
  post(rect, 1, 3, 15, wood);
  post(rect, 13, 3, 15, wood);
  plank(rect, 1, 1, 14, 2, wood, 2);
  // A corda nova é a coisa mais clara do desenho.
  rect(RAMPS.stem[1], 5, 4, 1, 7);
  rect(RAMPS.stem[1], 10, 4, 1, 7);
  plank(rect, 5, 11, 6, 1, wood, 1);
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

export const FIND_PAINTERS: Readonly<Record<FindKind, (rect: Paint) => void>> = {
  bench, log, helmet, bottle, swing,
};
