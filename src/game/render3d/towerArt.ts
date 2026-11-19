// A TORRE DE TELEFONIA DO JARDIM ALTO (objects/CellTower): a torre de celular do Brasil. Treliça de aço de seção
// constante — as duas pernas retas e paralelas, do pé ao topo (pedido do autor: "reta e não torta"; a que afinava para
// cima desenhava as pernas em degrauzinhos e parecia torta) —, pintada em faixas vermelhas e brancas (a pintura de
// obstáculo para avião, sete faixas, vermelho nas pontas); as três antenas de painel no topo, o para-raios com a luz
// vermelha, as micro-ondas redondas presas nas pernas, as sapatas de concreto e o gabinete de equipamento no pé. Só
// desenho, sem motor: a luz que pisca é outra peça, por cima (CellTower).

import { RAMPS, type Paint } from './pixelForms';

/** Onde ela fica, a partir da fogueira do fim: a quina de trás, à direita, do cume 5×5 (scripts/jardim-no-alto.mjs). */
export const CELL_TOWER_OFFSET = { dx: 2, dy: -3 } as const;
export const TOWER_W = 24;
/** Cinco tiles de altura (pedido do autor: "um pouco menor"; eram sete). */
export const TOWER_H = 80;
/**
 * AS LUZES DE OBSTÁCULO, em pixels do desenho (o centro de cada lâmpada): a do topo do para-raios e as duas do meio, uma
 * em cada perna — torre alta no Brasil leva balizamento intermediário. As do meio são também as que cabem no quadro de
 * quem está no cume (a câmera é baixa e perto: o topo da torre sai da tela).
 */
export const TOWER_LIGHTS_PX: ReadonlyArray<{ x: number; y: number }> = [{ x: 12, y: 2 }, { x: 5, y: 45 }, { x: 19, y: 45 }];

const [WHITE_HI, WHITE, STEEL, STEEL_DK] = RAMPS.metal;
const [RED_HI, RED] = RAMPS.orange;
const [CONCRETE_HI, CONCRETE, CONCRETE_LO] = RAMPS.stone;

/** A treliça começa aqui (o topo das pernas) e termina no pé. */
const TOP = 14;
const FOOT = 73;
/** As duas pernas, retas: simétricas no meio do desenho, e o pé inteiro dentro do tile (os 16 px do meio, x 4..19). */
const LEG_L = 6;
const LEG_R = 17;
/** As cintas horizontais, a cada dez pixels. */
const GIRTS = [TOP, 24, 34, 44, 54, 64, FOOT];
/** O chão do pé: exatamente o tile. */
const FOOT_X0 = 4;
const FOOT_W = 16;

/** As sete faixas, de cima para baixo: vermelho nas pontas. */
const bandOf = (y: number): number => Math.max(0, Math.min(6, Math.floor(((y - 4) / (FOOT - 4)) * 7)));
const steel = (y: number, lit: boolean): string => {
  const red = bandOf(y) % 2 === 0;
  if (red) return lit ? RED_HI : RED;
  return lit ? WHITE_HI : WHITE;
};

const line = (rect: Paint, x0: number, y0: number, x1: number, y1: number): void => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i += 1) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    rect(steel(y, false), x, y, 1, 1);
  }
};

export const paintTower = (rect: Paint): void => {
  const px = (color: string, x: number, y: number): void => rect(color, x, y, 1, 1);
  // as sapatas e o chão de brita do pé, dentro do tile
  rect(CONCRETE_LO, FOOT_X0, FOOT + 4, FOOT_W, 3);
  rect(CONCRETE, FOOT_X0, FOOT + 3, FOOT_W, 2);
  rect(CONCRETE_HI, FOOT_X0, FOOT + 3, FOOT_W, 1);
  for (const x of [LEG_L - 1, LEG_R]) {
    rect(CONCRETE_LO, x, FOOT, 2, 3);
    rect(CONCRETE_HI, x, FOOT, 2, 1);
  }
  // o gabinete de equipamento, no pé, dentro da treliça
  rect(STEEL_DK, 9, FOOT - 9, 6, 12);
  rect(WHITE, 9, FOOT - 9, 5, 11);
  rect(WHITE_HI, 9, FOOT - 9, 5, 1);
  rect(STEEL, 12, FOOT - 7, 1, 8);
  rect(STEEL, 10, FOOT - 6, 1, 1);
  rect(STEEL, 10, FOOT - 4, 1, 1);
  rect(STEEL, 10, FOOT - 2, 1, 1);
  // os X entre as cintas, e as cintas
  for (let g = 0; g < GIRTS.length - 1; g += 1) {
    line(rect, LEG_L, GIRTS[g], LEG_R, GIRTS[g + 1]);
    line(rect, LEG_R, GIRTS[g], LEG_L, GIRTS[g + 1]);
  }
  for (const y of GIRTS) {
    for (let x = LEG_L; x <= LEG_R; x += 1) rect(steel(y, x < (LEG_L + LEG_R) / 2), x, y, 1, 1);
  }
  // as duas pernas, retas: a da esquerda pega a luz
  for (let y = TOP; y <= FOOT; y += 1) {
    px(steel(y, true), LEG_L, y);
    px(steel(y, false), LEG_R, y);
    // a esteira dos cabos, descendo rente à perna direita
    if (y > TOP + 2 && y % 2 === 0) px(STEEL_DK, LEG_R - 1, y);
  }
  // o mastro do topo e o para-raios
  rect(STEEL, 11, 3, 2, TOP - 3);
  px(WHITE_HI, 11, 4);
  // as luzes de obstáculo (as lâmpadas; o brilho que pisca é da CellTower)
  for (const { x, y } of TOWER_LIGHTS_PX) {
    rect('#7a2c2c', x - 1, y - 1, 2, 2);
    px('#de6a4a', x - 1, y - 1);
  }
  // a plataforma e as três antenas de painel
  rect(STEEL_DK, 5, TOP - 1, 14, 1);
  rect(STEEL, 6, TOP - 2, 12, 1);
  for (const x of [5, 11, 17]) {
    rect(STEEL_DK, x, 4, 2, 9);
    rect(WHITE_HI, x, 4, 1, 9);
    rect(WHITE, x + 1, 4, 1, 9);
    px(STEEL, x, 3);
  }
  // as micro-ondas: um tambor maior na perna da direita, um pequeno na da esquerda
  const drum = (cx: number, cy: number, r: number): void => {
    for (let y = -r; y <= r; y += 1) {
      for (let x = -r; x <= r; x += 1) {
        const d = Math.hypot(x, y);
        if (d > r + 0.3) continue;
        rect(d > r - 0.8 ? STEEL : x + y < -1 ? WHITE_HI : WHITE, cx + x, cy + y, 1, 1);
      }
    }
    px(STEEL_DK, cx, cy);
  };
  drum(LEG_R + 2, 28, 3);
  drum(LEG_L - 2, 56, 2);
};
