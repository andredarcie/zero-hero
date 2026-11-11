import type { Paint } from '@/game/render3d/pixelForms';

// O TERREIRO DAS CASAS: a terra batida debaixo e em frente de cada casa, pintada pixel a pixel num decalque deitado
// (objects/NpcHomes) de 5 × 3,5 tiles, na densidade de pixel do resto do mundo (16 por tile).
//
// A PIXEL ART DE ANTES (pedido do autor, 2026-11-11: "melhore a qualidade do pixel art da terra de chão abaixo das
// casas"). Ampliado, o terreiro era lama: cinco marrons em manchas grandes e de contorno mole, um grão em blocos de
// 2×2 (mais grosso que o capim em volta, lia como imagem de baixa resolução), pixels soltos espalhados pelo capim,
// rachaduras sorteadas como rabiscos, folhas laranja de um pixel, tufos de capim num verde fixo que não era o do
// bioma — e GRAVETOS desenhados, que este jogo proíbe no chão (graveto é item: o desenhado que não se pega ensina o
// jogador a parar de olhar para o chão; ver world/biomes).
//
// Agora ele é feito como a terra nua do mapa (spritefactory/sprites/ground-earth.mjs):
//
//   · um RELEVO de torrões (ruído de 4 px mais o grão de 2 px), cortado por QUANTIL em base, torrão e crista, e
//     iluminado da cima-à-esquerda (a inclinação na diagonal da luz sobe ou desce um degrau). A FENDA é o degrau
//     abaixo da base e só fica do lado da sombra (encostada em algo mais alto na direção da luz): arco, nunca anel;
//   · o CAMINHO que desce da porta é a mesma terra PISADA: o relevo achatado (quase sem fenda) e um degrau mais claro;
//   · a BEIRA é a de um rebaixo: onde o capim fica em cima ou à esquerda, ele faz sombra na terra (um pixel escuro);
//     embaixo e à direita a terra sobe ao encontro dele e pega a luz;
//   · o CAPIM VOLTA por buracos na terra perto da beira — buracos de verdade (transparentes), então o que aparece é o
//     capim do chão, na cor do bioma. Nenhum verde pintado aqui;
//   · os TORRÕES SOLTOS fora da beira são grupos de dois pixels ou mais, e a máscara passa por uma suavização que tira
//     espinho e furo de um pixel só;
//   · poucas pedrinhas (luz em cima à esquerda, sombra colada embaixo) e umas folhas secas na beira, em tom apagado.
//
// A paleta é a das estradas (objects/roadPaint): o caminho que chega no terreiro é a mesma terra.

/** O terreiro, em tiles. */
export const YARD_WIDTH = 5;
export const YARD_DEPTH = 3.5;
export const YARD_TEXELS = 16;

/** Do fundo da fenda à crista acesa: a terra das estradas (roadPaint.ROAD_DIRT) e um degrau abaixo dela. */
export const YARD_RAMP = ['#3d3529', '#504737', '#615644', '#706450', '#81745e'] as const;
const DEEP = 0;
const CRACK = 1;
const BASE = 2;
const RAISED = 3;
const CREST = 4;
export const YARD_PEBBLE = ['#9c937f', '#7d7464'] as const;
/** A folha seca, apagada: a laranja de antes era a coisa mais saturada do terreiro, e de um pixel só lia como sujeira. */
export const YARD_LEAF = ['#7a5d36', '#5f4a2c'] as const;
/** Até onde vai a terra inteira (na conta da distância ao centro, com a beira ondulada). */
const SOLID_REACH = 0.86;
/** Onde o capim começa a voltar, para dentro da beira. */
const HOLE_BAND = 0.2;
/** Quanto do relevo é base, torrão e crista (corte por quantil, como a terra do mapa). */
const BAND_SHARE = [0.6, 0.28, 0.12] as const;
/**
 * Quanto do relevo a luz acende e a sombra apaga (cada lado). Com 0,1 (o do chão do mapa) e a terra clara o relevo
 * mal aparecia; com 0,14 e a terra de fora mais escura, o terreiro virava cascalho.
 */
const SLOPE_SHARE = 0.12;
/** O caminho pisado: quanto do relevo sobra nele. */
const PATH_RELIEF = 0.4;

const noise = (x: number, y: number, seed: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Ruído liso de `cell` pixels: o contorno orgânico das manchas. */
const blotch = (x: number, y: number, seed: number, cell: number): number => {
  const fx = x / cell;
  const fy = y / cell;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const sx = (fx - ix) * (fx - ix) * (3 - 2 * (fx - ix));
  const sy = (fy - iy) * (fy - iy) * (3 - 2 * (fy - iy));
  const top = noise(ix, iy, seed) * (1 - sx) + noise(ix + 1, iy, seed) * sx;
  const bottom = noise(ix, iy + 1, seed) * (1 - sx) + noise(ix + 1, iy + 1, seed) * sx;
  return top * (1 - sy) + bottom * sy;
};

const quantile = (values: number[], q: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * sorted.length)))];
};

export const paintYard = (rect: Paint, seed: number): void => {
  const w = YARD_WIDTH * YARD_TEXELS;
  const h = YARD_DEPTH * YARD_TEXELS;
  const at = (x: number, y: number): number => y * w + x;
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h;

  // A FORMA: uma mancha oval de beira ondulada, mais chão diante da porta (o decalque já fica à frente da casa).
  const reachAt = (x: number, y: number): number => {
    const nx = (x + 0.5 - w / 2) / (w / 2);
    const ny = (y + 0.5 - h / 2) / (h / 2);
    return Math.hypot(nx, ny) + (blotch(x, y, seed + 4, 13) - 0.5) * 0.5 + (blotch(x, y, seed + 5, 4) - 0.5) * 0.16;
  };
  // O caminho desce da porta com uma curva só dele, e abre um pouco antes de chegar no capim.
  const doorY = Math.round(h * 0.3);
  const pathX = (y: number): number => w / 2 + Math.sin(y * 0.09 + seed * 1.7) * 5;
  const onPath = (x: number, y: number): number => {
    if (y < doorY) return 2;
    const half = 6 + (y - doorY) * 0.09 + (blotch(x, y, seed + 6, 3) - 0.5) * 3;
    return Math.abs(x - pathX(y)) / half;
  };

  // A MÁSCARA: a terra inteira, os buracos por onde o capim volta perto da beira (nunca no caminho) e os torrões soltos
  // logo fora dela.
  let earth = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const r = reachAt(x, y);
      let on = r < SOLID_REACH;
      const rim = r - (SOLID_REACH - HOLE_BAND);
      if (on && rim > 0 && onPath(x, y) > 1.1 && blotch(x, y, seed + 12, 2.5) > 0.8 - rim * 1.3) on = false;
      if (!on && r < SOLID_REACH + 0.1 && blotch(x, y, seed + 7, 2.5) > 0.8 + (r - SOLID_REACH) * 1.5) on = true;
      earth[at(x, y)] = on ? 1 : 0;
    }
  }
  // Sem espinho e sem furo de um pixel: duas passadas de maioria nos quatro vizinhos.
  const isEarth = (m: Uint8Array, x: number, y: number): boolean => inside(x, y) && m[at(x, y)] === 1;
  for (let pass = 0; pass < 2; pass += 1) {
    const next = earth.slice();
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const n = Number(isEarth(earth, x - 1, y)) + Number(isEarth(earth, x + 1, y)) + Number(isEarth(earth, x, y - 1)) + Number(isEarth(earth, x, y + 1));
        if (earth[at(x, y)] && n <= 1) next[at(x, y)] = 0;
        else if (!earth[at(x, y)] && n >= 3) next[at(x, y)] = 1;
      }
    }
    earth = next;
  }
  const ground = (x: number, y: number): boolean => isEarth(earth, x, y);

  // O RELEVO: torrões de 4 px e o grão de 2 px; no caminho, achatado (terra pisada).
  const height = new Float64Array(w * h);
  const heights: number[] = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!ground(x, y)) continue;
      let v = 0.72 * blotch(x, y, seed + 20, 4) + 0.28 * blotch(x, y, seed + 21, 2);
      if (onPath(x, y) < 1) v = 0.5 + (v - 0.5) * PATH_RELIEF;
      height[at(x, y)] = v;
      heights.push(v);
    }
  }
  const cut1 = quantile(heights, BAND_SHARE[0]);
  const cut2 = quantile(heights, BAND_SHARE[0] + BAND_SHARE[1]);
  // A inclinação na diagonal da luz; o vizinho que é capim conta como da mesma altura (a beira tem luz própria).
  const hAt = (x: number, y: number, fallback: number): number => (ground(x, y) ? height[at(x, y)] : fallback);
  const slope = new Float64Array(w * h);
  const slopes: number[] = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!ground(x, y)) continue;
      const v = height[at(x, y)];
      slope[at(x, y)] = v - hAt(x - 1, y - 1, v);
      slopes.push(slope[at(x, y)]);
    }
  }
  const lit = quantile(slopes, 1 - SLOPE_SHARE);
  const shade = quantile(slopes, SLOPE_SHARE);
  const step = new Int8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!ground(x, y)) continue;
      const v = height[at(x, y)];
      const s = slope[at(x, y)];
      step[at(x, y)] = (v < cut1 ? 0 : v < cut2 ? 1 : 2) + (s > lit ? 1 : 0) - (s < shade ? 1 : 0);
    }
  }
  // A fenda só do lado da sombra: some a que não encosta em nada mais alto na direção da luz (vira arco, não anel).
  const stepAt = (x: number, y: number): number => (ground(x, y) ? step[at(x, y)] : 0);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!ground(x, y)) continue;
      let s = step[at(x, y)];
      if (s < 0 && !(stepAt(x - 1, y) >= 0 || stepAt(x, y - 1) >= 0 || stepAt(x - 1, y - 1) >= 0)) s = 0;
      // FORA DO CAMINHO a terra é menos pisada, mais úmida e mais escura (a base é o degrau de baixo, e a fenda vai ao
      // fundo); NO CAMINHO ela é a terra batida, um degrau mais clara. Com a mesma rampa nos dois, o terreiro inteiro
      // saía um bege lavado e o caminho da porta sumia nele.
      const trodden = onPath(x, y) < 0.8;
      let tone = trodden
        ? (s < 0 ? CRACK : s <= 1 ? RAISED : CREST)
        : (s < 0 ? DEEP : s === 0 ? CRACK : s === 1 ? BASE : s === 2 ? RAISED : CREST);
      // a beira do caminho fica no meio: nem pisada nem bruta
      if (!trodden && onPath(x, y) < 1.15) tone = Math.max(tone, BASE);
      // A BEIRA DO REBAIXO: o capim em cima ou à esquerda faz sombra; embaixo e à direita a terra sobe e pega luz.
      if (!ground(x, y - 1) || !ground(x - 1, y) || !ground(x - 1, y - 1)) tone = !ground(x, y - 1) ? DEEP : Math.min(tone, CRACK);
      else if (!ground(x, y + 1) || !ground(x + 1, y) || !ground(x + 1, y + 1)) tone = Math.min(CREST, Math.max(tone, BASE) + 1);
      rect(YARD_RAMP[tone], x, y, 1, 1);
    }
  }

  // OS DETALHES, poucos e com folga entre eles: nada encostado em nada.
  const taken = new Uint8Array(w * h);
  const free = (x: number, y: number, rx: number, ry: number): boolean => {
    for (let dy = -ry; dy <= ry; dy += 1) {
      for (let dx = -rx; dx <= rx; dx += 1) if (!ground(x + dx, y + dy) || taken[at(x + dx, y + dy)]) return false;
    }
    return true;
  };
  const scatter = (count: number, salt: number, want: (x: number, y: number) => boolean, draw: (x: number, y: number, i: number) => void): void => {
    let placed = 0;
    for (let i = 0; i < count * 20 && placed < count; i += 1) {
      const x = Math.floor(noise(i, salt, seed + 9) * w);
      const y = Math.floor(noise(salt, i, seed + 10) * h);
      if (!want(x, y) || !free(x, y, 2, 2)) continue;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 2; dx += 1) if (inside(x + dx, y + dy)) taken[at(x + dx, y + dy)] = 1;
      draw(x, y, i);
      placed += 1;
    }
  };
  const firm = (x: number, y: number): boolean => reachAt(x, y) < SOLID_REACH - 0.1 && y > doorY - 4;
  // As pedrinhas, fora do caminho: a luz em cima à esquerda, a sombra colada embaixo (para não boiarem).
  scatter(7, 2, (x, y) => firm(x, y) && onPath(x, y) > 1.3, (x, y, i) => {
    const big = i % 3 === 0;
    rect(YARD_PEBBLE[1], x, y, big ? 3 : 2, 1);
    rect(YARD_PEBBLE[0], x, y, 1, 1);
    if (big) rect(YARD_PEBBLE[1], x + 1, y - 1, 1, 1);
    rect(YARD_RAMP[DEEP], x + 1, y + 1, big ? 2 : 1, 1);
  });
  // As folhas secas que o vento junta na beira: um risco de dois pixels na diagonal.
  scatter(4, 4, (x, y) => {
    const r = reachAt(x, y);
    return r > SOLID_REACH - 0.24 && r < SOLID_REACH - 0.06 && onPath(x, y) > 1.2;
  }, (x, y) => {
    rect(YARD_LEAF[0], x, y, 1, 1);
    rect(YARD_LEAF[1], x + 1, y + 1, 1, 1);
  });
};
