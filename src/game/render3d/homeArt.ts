import * as THREE from 'three';

import { paintedCanvas } from '@/game/render3d/homeTextures';
import { INK, RAMPS, type Paint, type Ramp } from '@/game/render3d/pixelForms';
import { registerTexture3D } from '@/game/render3d/textures3d';
import { CLOTH_DYES, DYE_SWATCH, clothRamp, type ClothDye } from '@/game/runtime/homeState';
import type { Season } from '@/game/runtime/seasons';

// O LAR DO HERÓI (runtime/homeState): os enfeites novos da bancada do acampamento, a tina de tingir, a placa com o
// nome e a manta do colchão. 16 px por tile, contorno de tinta, luz de cima e da esquerda — o mesmo traço do acampamento
// (render3d/campArt) e dos enfeites de antes (render3d/findArt), com as rampas de `pixelForms`.

const MOSS = '#6f8f3e';
const MOSS_DARK = '#4c6a32';
/** O minério: pedra com óxido de ferro, ferrugem por fora (a mesma cor do minério e do elmo achado). */
const RUST: Ramp = ['#b08458', '#8a5c3a', '#64402e', '#443028'];
/** O fio que segura as pedras do sino. */
const CORD = '#5e5446';
/** O carvão com que o herói escreve na placa. */
const CHARCOAL = '#2a2630';
/** A água da tina antes de qualquer tinta. */
const WATER: Ramp = ['#7aa0ae', '#5a7d8c', '#3f5f6e', '#2c4652'];

/** Uma pedra arredondada: o contorno sem os cantos, o tampo claro, a sombra embaixo e à direita. */
const pebble = (rect: Paint, x: number, y: number, w: number, h: number, ramp: Ramp = RAMPS.stone): void => {
  rect(INK, x - 1, y, w + 2, h);
  rect(INK, x, y - 1, w, h + 2);
  rect(ramp[1], x, y, w, h);
  rect(ramp[0], x, y, w - 1, 1);
  rect(ramp[0], x, y, 1, Math.max(1, h - 1));
  rect(ramp[2], x + 1, y + h - 1, w - 1, 1);
  rect(ramp[2], x + w - 1, y + 1, 1, Math.max(1, h - 1));
};

/**
 * O RELÓGIO DE SOL: o mostrador redondo de pedra num pé de pedra, com as marcas das horas, e o graveto em pé que faz a
 * sombra (o gnômon). A sombra desenhada cai para a esquerda; a hora de verdade o X lê (scenes/game/CampHome).
 */
const sundial = (rect: Paint): void => {
  const s = RAMPS.stone;
  const w = RAMPS.wood;
  // A base e o pé.
  rect(INK, 3, 13, 10, 3);
  rect(s[1], 4, 14, 8, 1);
  rect(s[0], 4, 14, 3, 1);
  rect(INK, 5, 9, 6, 5);
  rect(s[1], 6, 10, 4, 4);
  rect(s[0], 6, 10, 1, 4);
  rect(s[2], 9, 10, 1, 4);
  // O mostrador: a laje redonda vista um pouco de cima.
  rect(INK, 2, 4, 12, 7);
  rect(INK, 1, 5, 14, 5);
  rect(s[0], 2, 5, 12, 3);
  rect(s[1], 2, 8, 12, 1);
  rect(s[2], 3, 9, 10, 1);
  // As marcas das horas e a sombra do gnômon, comprida para a esquerda.
  for (const [x, y] of [[3, 6], [5, 5], [11, 5], [12, 6], [12, 8]] as const) rect(s[2], x, y, 1, 1);
  rect(s[3], 3, 7, 4, 1);
  rect(s[3], 5, 6, 2, 1);
  // O gnômon: o triângulo em pé no meio do mostrador (o lado reto aponta o céu, a rampa faz a sombra).
  for (let i = 0; i < 5; i += 1) {
    rect(INK, 7, 1 + i, i + 3, 1);
    if (i > 0) rect(w[1], 8, 1 + i, i, 1);
  }
  rect(INK, 7, 0, 2, 1);
  rect(w[0], 8, 2, 1, 4);
};

/** A PILHA DE PEDRAS, equilibradas uma em cima da outra, a maior embaixo, com musgo na de baixo. */
const cairn = (rect: Paint): void => {
  pebble(rect, 2, 12, 12, 3);
  rect(MOSS_DARK, 3, 14, 3, 1);
  rect(MOSS, 3, 13, 2, 1);
  pebble(rect, 3, 9, 9, 2);
  pebble(rect, 6, 6, 6, 2);
  pebble(rect, 6, 3, 4, 2);
};

/**
 * O SINO DE VENTO: um graveto fincado e curvado no alto, como um gancho de pastor; dele pende um disco de madeira, e do
 * disco três lascas de minério por fios. `sway` empurra a ponta de baixo de cada lasca para um lado (-1, 0, 1): são os
 * três quadros do balanço.
 */
export const windChime = (sway: -1 | 0 | 1) => (rect: Paint): void => {
  const w = RAMPS.wood;
  // A pedra que firma o pé.
  pebble(rect, 2, 14, 4, 1);
  // O gancho: o poste e a curva do alto, para a direita.
  rect(INK, 2, 2, 4, 13);
  rect(w[1], 3, 3, 2, 12);
  rect(w[0], 3, 3, 1, 12);
  rect(INK, 3, 0, 8, 3);
  rect(INK, 9, 2, 3, 2);
  rect(w[1], 4, 1, 6, 1);
  rect(w[0], 4, 1, 3, 1);
  rect(w[1], 10, 2, 1, 1);
  // O fio do disco e o disco.
  rect(CORD, 10, 3, 1, 2);
  rect(INK, 7, 5, 7, 3);
  rect(w[1], 8, 6, 5, 1);
  rect(w[0], 8, 6, 2, 1);
  // As três lascas: cada uma numa altura, e a de fora balança mais.
  // Lascas finas, de um pixel, com a sombra de tinta só do lado direito: três caixas de contorno virariam um bloco.
  const shards: ReadonlyArray<readonly [number, number, number]> = [[8, 12, 1], [10, 14, 1], [12, 13, 2]];
  for (const [x, bottom, reach] of shards) {
    const dx = sway * reach;
    rect(CORD, x, 8, 1, bottom - 11);
    rect(RUST[0], x + dx, bottom - 3, 1, 1);
    rect(RUST[1], x + dx, bottom - 2, 1, 2);
    rect(RUST[3], x + dx, bottom, 1, 1);
    rect(INK, x + dx + 1, bottom - 2, 1, 3);
  }
};

/** As flores do vaso em cada estação: pétala clara, pétala escura e o miolo. O inverno não tem flor, só o broto. */
const POT_FLOWERS: Readonly<Record<Season, readonly [string, string, string] | null>> = {
  spring: [RAMPS.pink[0], RAMPS.pink[1], '#f4d060'],
  summer: ['#f8e488', '#f4c430', '#8a5c3a'],
  autumn: ['#f4a050', '#d0702a', '#6e2f28'],
  winter: null,
};

/**
 * O VASO DE PEDRA, com a flor da estação: a primavera é a flor rosa de sempre (`findArt.flowerPot`), o verão amarelo,
 * o outono laranja, e no inverno a planta descansa — só a folha e o broto fechado.
 */
export const flowerPotFor = (season: Season) => (rect: Paint): void => {
  const flower = POT_FLOWERS[season];
  // A haste e as folhas primeiro; o vaso cobre o pé delas.
  rect(MOSS_DARK, 7, flower ? 5 : 7, 2, flower ? 5 : 3);
  rect(MOSS, 9, 7, 2, 1);
  rect(MOSS, 5, 8, 2, 1);
  if (flower) {
    rect(INK, 5, 0, 6, 6);
    rect(flower[1], 6, 1, 4, 4);
    rect(flower[0], 6, 1, 3, 1);
    rect(flower[2], 7, 2, 2, 2);
  } else {
    rect(INK, 6, 4, 4, 4);
    rect(MOSS_DARK, 7, 5, 2, 2);
    rect(MOSS, 7, 5, 1, 1);
  }
  const s = RAMPS.stone;
  rect(INK, 3, 9, 10, 7);
  rect(s[1], 4, 10, 8, 2);
  rect(s[0], 4, 10, 4, 1);
  rect(s[2], 5, 12, 6, 3);
  rect(s[1], 5, 12, 3, 2);
  // O carvão no fundo aparece pela boca do vaso.
  rect(CHARCOAL, 5, 10, 6, 1);
};

/** O tom de um pano tingido como rampa de quatro (o mais escuro desce mais um degrau). */
const clothRamp4 = (dye: ClothDye): Ramp => {
  const [a, b, c] = clothRamp(dye);
  return [a, b, c, INK];
};

/** A tina: a água pura, ou a tinta da última cor que tingiu a capa (o líquido mostra a cor, do claro ao escuro). */
const tubLiquid = (dye: ClothDye): Ramp => {
  if (dye === 'natural') return WATER;
  const [, mid, dark] = clothRamp(dye);
  return [DYE_SWATCH[dye], mid, dark, INK];
};

/**
 * A TINA DE TINGIR: meio barril de aduelas com dois aros de ferro, cheio até a boca. O líquido é a água pura, ou a tinta
 * da última cor usada.
 */
export const tub = (dye: ClothDye) => (rect: Paint): void => {
  const w = RAMPS.wood;
  const m = RAMPS.metal;
  const liquid = tubLiquid(dye);
  // O corpo: as aduelas, claras à esquerda, com as juntas.
  rect(INK, 2, 6, 12, 10);
  rect(w[1], 3, 7, 10, 8);
  rect(w[0], 3, 7, 2, 8);
  for (const x of [5, 8, 11]) rect(w[2], x, 7, 1, 8);
  rect(w[2], 3, 14, 10, 1);
  // Os aros de ferro.
  for (const y of [8, 12]) {
    rect(m[2], 3, y, 10, 1);
    rect(m[1], 3, y, 3, 1);
  }
  // A boca: o rebordo de madeira e o líquido, com um brilho.
  rect(INK, 1, 3, 14, 5);
  rect(w[0], 2, 6, 12, 1);
  rect(liquid[1], 2, 4, 12, 2);
  rect(liquid[2], 2, 5, 12, 1);
  rect(liquid[0], 4, 4, 3, 1);
  rect(liquid[0], 9, 5, 1, 1);
};

/** A PLACA DO ACAMPAMENTO: uma tábua num poste. Com nome, as letras a carvão (riscos: no pixel elas não se leem). */
export const sign = (named: boolean) => (rect: Paint): void => {
  const w = RAMPS.wood;
  // O poste, com o capim no pé.
  rect(INK, 6, 9, 4, 7);
  rect(w[1], 7, 9, 2, 6);
  rect(w[0], 7, 9, 1, 6);
  rect(MOSS, 4, 14, 2, 1);
  rect(MOSS_DARK, 10, 14, 2, 1);
  // A tábua.
  rect(INK, 1, 2, 14, 8);
  rect(w[1], 2, 3, 12, 6);
  rect(w[0], 2, 3, 12, 1);
  rect(w[2], 2, 8, 12, 1);
  rect(w[2], 9, 4, 1, 1);
  rect(w[2], 4, 7, 2, 1);
  if (!named) return;
  for (const [x, y, len] of [[3, 5, 3], [7, 5, 2], [10, 5, 3], [4, 7, 4], [9, 7, 3]] as const) rect(CHARCOAL, x, y, len, 1);
};

/**
 * O COLCHÃO COM A MANTA tingida (32 px, como o colchão das fogueiras): o mesmo colchão e o mesmo travesseiro, e a manta
 * dobrada no pé, cobrindo dois terços, com a dobra clara em cima e a costura.
 */
export const bedWithBlanket = (dye: ClothDye) => (rect: Paint): void => {
  const p = RAMPS.plaster;
  const c = clothRamp4(dye);
  rect(INK, 4, 9, 24, 14);
  rect(p[1], 5, 10, 22, 12);
  rect(p[2], 5, 20, 22, 2);
  rect(p[0], 6, 11, 6, 9);
  rect(p[2], 6, 19, 6, 1);
  // A manta.
  rect(INK, 13, 9, 1, 14);
  rect(c[1], 14, 10, 13, 12);
  rect(c[0], 14, 10, 13, 2);
  rect(c[2], 14, 12, 13, 1);
  for (const x of [18, 23]) rect(c[2], x, 13, 1, 8);
  rect(c[2], 14, 20, 13, 2);
};

// ── O REGISTRO ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Os enfeites novos, para o registro dos achados (findArt.DECOR_PAINTERS): `valley-find-<tipo>`, nas duas pipelines. */
export const HOME_DECOR_PAINTERS = {
  sundial,
  cairn,
  windChime: windChime(0),
  // O vaso agora é de pedra, com carvão no fundo (é a receita dele): o de barro de antes não se fazia em lugar nenhum.
  flowerPot: flowerPotFor('spring'),
} as const;

/** Os quadros do balanço do sino: o parado é o `valley-find-windChime`. */
export const CHIME_FRAMES = ['valley-find-windChime', 'home-chime-left', 'home-chime-right'] as const;
/** O vaso de cada estação (a primavera é o vaso de sempre). */
export const potTexture = (season: Season): string => (season === 'spring' ? 'valley-find-flowerPot' : `home-pot-${season}`);
export const tubTexture = (dye: ClothDye): string => `home-tub-${dye}`;
export const signTexture = (named: boolean): string => (named ? 'home-sign-named' : 'home-sign-blank');
/** A manta natural é o colchão de sempre (skyTextures.BED_TEXTURE): só as tingidas têm textura própria. */
export const blanketTexture = (dye: ClothDye): string => `home-bed-${dye}`;

/** O que só o mundo 3D desenha (o acampamento e os quadros extras dos enfeites). */
const SHEETS = (): ReadonlyArray<readonly [string, (rect: Paint) => void, number]> => [
  [CHIME_FRAMES[1], windChime(-1), 16],
  [CHIME_FRAMES[2], windChime(1), 16],
  ...(['summer', 'autumn', 'winter'] as const).map((season) => [potTexture(season), flowerPotFor(season), 16] as const),
  ...CLOTH_DYES.map((dye) => [tubTexture(dye), tub(dye), 16] as const),
  [signTexture(false), sign(false), 16],
  [signTexture(true), sign(true), 16],
  ...CLOTH_DYES.filter((dye) => dye !== 'natural').map((dye) => [blanketTexture(dye), bedWithBlanket(dye), 32] as const),
];

// O registro THREE é um mapa de módulo que sobrevive ao restart da cena: registrar uma vez só.
let registered = false;

export const registerHomeArt = (): void => {
  if (registered) return;
  for (const [key, paint, size] of SHEETS()) {
    const tex = new THREE.CanvasTexture(paintedCanvas(paint, size, size));
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    registerTexture3D(key, tex);
  }
  registered = true;
};

/** As chaves que `registerHomeArt` publica (o teste confere que todas existem depois dele). */
export const homeArtKeys = (): string[] => SHEETS().map(([key]) => key);
