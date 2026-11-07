import { INK, RAMPS, type Paint, type Ramp } from '@/game/render3d/pixelForms';

// O ACAMPAMENTO DO HERÓI (objects/HeroCamp): o fogo de pedras, o tronco
// de sentar, as quatro lembranças dos pedidos e a clareira de terra batida embaixo de tudo. Pixel a pixel, na densidade
// das casas e dos achados (16 px por tile), luz de cima e da esquerda.

const STONE: Ramp = ['#c4c6cc', '#9a9ca5', '#6b6e76', '#45484f'];
const IRON = ['#7a7d86', '#55585f', '#383a40'] as const;
const ASH = '#8f877c';
const EMBER = '#7a3a26';

/** Uma linha de pixels (Bresenham), com a espessura de um pixel. */
const line = (rect: Paint, x0: number, y0: number, x1: number, y1: number, color: string): void => {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    rect(color, x, y, 1, 1);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
};

/** Um galho: o contorno de tinta por fora, a madeira por dentro (claro em cima, escuro embaixo). */
const stick = (rect: Paint, x0: number, y0: number, x1: number, y1: number): void => {
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) line(rect, x0 + ox, y0 + oy, x1 + ox, y1 + oy, INK);
  line(rect, x0, y0, x1, y1, RAMPS.wood[1]);
};

// ── O FOGO DE PEDRAS ──────────────────────────────────────────────────────

/**
 * O FOGO DO ACAMPAMENTO, frio (a fogueira acesa é dos vizinhos): oito pedras em roda com o brilho do lado da luz, a
 * cinza e duas achas queimadas cruzadas no meio, e a panela pendurada num tripé de galhos.
 */
export const paintRing = (rect: Paint): void => {
  // A cinza e as achas.
  rect(INK, 3, 11, 10, 4);
  rect(ASH, 4, 12, 8, 2);
  rect(EMBER, 6, 12, 1, 1);
  rect(EMBER, 9, 13, 1, 1);
  line(rect, 4, 13, 11, 11, RAMPS.wood[3]);
  line(rect, 4, 11, 11, 13, RAMPS.wood[2]);
  // As pedras em roda: as de trás menores, as da frente maiores.
  const stones: ReadonlyArray<readonly [number, number, number]> = [
    [2, 10, 2], [5, 9, 2], [9, 9, 2], [12, 10, 2], [0, 12, 3], [13, 12, 3], [3, 14, 3], [8, 14, 3],
  ];
  for (const [x, y, w] of stones) {
    rect(INK, x - 1, y - 1, w + 2, 4);
    rect(STONE[1], x, y, w, 2);
    rect(STONE[0], x, y, Math.max(1, w - 1), 1);
    rect(STONE[2], x + w - 1, y + 1, 1, 1);
  }
  // O tripé: três galhos que se encontram em cima.
  stick(rect, 8, 0, 2, 12);
  stick(rect, 8, 0, 14, 12);
  line(rect, 8, 1, 8, 4, IRON[1]);
  // A panela pendurada.
  rect(INK, 5, 4, 7, 6);
  rect(IRON[1], 6, 5, 5, 4);
  rect(IRON[0], 6, 5, 2, 3);
  rect(IRON[2], 6, 8, 5, 1);
  rect(INK, 4, 5, 9, 1);
  rect(IRON[0], 5, 5, 7, 1);
};

// ── O TRONCO DE SENTAR ────────────────────────────────────────────────────────────────────────────

/** Um desenho pixel a pixel com uma paleta de letras (`.` é vazio, `k` é o contorno). */
const grid = (rect: Paint, rows: readonly string[], pal: Readonly<Record<string, string>>): void => {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const c = row[x];
      if (c === '.') continue;
      const color = c === 'k' ? INK : pal[c];
      if (color) rect(color, x, y, 1, 1);
    }
  });
};

const WOOD = { 0: RAMPS.wood[0], 1: RAMPS.wood[1], 2: RAMPS.wood[2], 3: RAMPS.wood[3] } as Record<string, string>;

/** O TRONCO deitado ao lado do fogo, para sentar: a ponta cortada com os anéis, a casca rachada, um galhinho. */
const LOG = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '..........k.....',
  '.........k1k....',
  '..kkkkkkkkkkkk..',
  '.k010k21212122k.',
  '.k101k12121212k.',
  '.k010k22222222k.',
  '.k111k33333333k.',
  '..kkkkkkkkkkkk..',
  '................',
];
export const paintLog = (rect: Paint): void => grid(rect, LOG, WOOD);

// ── AS LEMBRANÇAS ─────────────────────────────────────────────────────────────────────────────────

/** A LEMBRANÇA DA IRIS: o quadro dela num cavalete, com as quatro tintas de planta. */
const EASEL = [
  '................',
  '.......kk.......',
  '...kkkkkkkkkk...',
  '...kwwwwwwwwk...',
  '...kwoowbbwwk...',
  '...kwooobbbwk...',
  '...kwyywwbrwk...',
  '...kwyyyrrrwk...',
  '...kwwwwwrrwk...',
  '...kkkkkkkkkk...',
  '...k22222222k...',
  '....k1k..k1k....',
  '...k1k.kk.k1k...',
  '...k1k.k1.k1k...',
  '..k1k..k1..k1k..',
  '..kk...kk...kk..',
];
export const paintEasel = (rect: Paint): void => grid(rect, EASEL, {
  ...WOOD, w: '#efe6cf', o: '#d9682a', b: '#3f5fae', y: '#e3b53a', r: '#b8323b',
});

/** A LEMBRANÇA DA VEGA: o mapa de estrelas dela, preso num poste — e Saturno, com o anel. */
const CHART = [
  '................',
  '..kkkkkkkkkkk...',
  '..knnnynnnnnk...',
  '..knnnnnnynnk...',
  '..knyannnnnnk...',
  '..knaaannnynk...',
  '..knnannnnnnk...',
  '..knnnnnynnnk...',
  '..kkkkkkkkkkk...',
  '......k12k......',
  '......k12k......',
  '......k12k......',
  '......k12k......',
  '......k12k......',
  '.....kk12kk.....',
  '.....k3333k.....',
];
export const paintChart = (rect: Paint): void => grid(rect, CHART, { ...WOOD, n: '#1d2b53', y: '#f3e6a0', a: '#d9a35a' });

/** A LEMBRANÇA DA HOLLIS: um varal de cogumelos secando, em dois fios entre dois paus. */
const RACK = [
  '................',
  '.kk..........kk.',
  '.k1mmmmmmmmmm1k.',
  '.k1..m...m...1k.',
  '.k1.kck.kck..1k.',
  '.k1.kek.kek..1k.',
  '.k1mmmmmmmmmm1k.',
  '.k1...m...m..1k.',
  '.k1..kck.kck.1k.',
  '.k1..kek.kek.1k.',
  '.k1..........1k.',
  '.k1..........1k.',
  '.k2..........2k.',
  '.k2..........2k.',
  '.k3..........3k.',
  '.kk..........kk.',
];
export const paintRack = (rect: Paint): void => grid(rect, RACK, { ...WOOD, m: '#c9b48a', c: '#86532a', e: '#e8dcbf' });

/** A LEMBRANÇA DO BRAM: a lenha rachada e empilhada, as pontas das achas à mostra. */
const WOODPILE = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '....kkkkkkkk....',
  '...k10k10k10k...',
  '...k01k01k01k...',
  '..kkkkkkkkkkkk..',
  '..k10k10k10k1k..',
  '..k01k01k01k0k..',
  '.kkkkkkkkkkkkkk.',
  '.k10k10k10k10k..',
  '.k01k01k01k01k..',
  '.kkkkkkkkkkkkk..',
];
export const paintWoodpile = (rect: Paint): void => grid(rect, WOODPILE, WOOD);

// ── A CLAREIRA ────────────────────────────────────────────────────────────────────────────────────

/** A clareira: 5 × 4 tiles, 16 px por tile (cabe entre o lago e o planalto). */
export const CLEARING_W = 80;
export const CLEARING_H = 64;

const hash = (x: number, y: number, seed: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Ruído de valor suave: uma treliça de `cell` px, interpolada (smoothstep) — os torrões, não o grão solto. */
const valueNoise = (x: number, y: number, cell: number, seed: number): number => {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(gx, gy, seed);
  const b = hash(gx + 1, gy, seed);
  const c = hash(gx, gy + 1, seed);
  const d = hash(gx + 1, gy + 1, seed);
  return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
};

/** A terra, do escuro ao claro: sóbria, um pouco quente; a luz do mundo esquenta o resto. */
const SOIL = ['#4f3d2c', '#66503a', '#7d6449', '#957a59', '#ad916b'] as const;
const SOIL_PATH = ['#4a3a2b', '#5c4936', '#6f5a43', '#806a50', '#8f785b'] as const;
const GRASS = ['#4d6a2e', '#66863a', '#82a24a'] as const;
const PEBBLE = ['#c3beb2', '#958f84', '#615c54'] as const;
const ASH_TONES = ['#8a847a', '#a19b90', '#6e6860'] as const;

/**
 * A CLAREIRA DE TERRA BATIDA embaixo do acampamento (pedido do autor: "melhore o pixel art do chão"), pintada como o
 * chão do mundo (spritefactory/sprites/ground-earth.mjs): um RELEVO de duas oitavas de ruído suave (torrões de 8 px e
 * grão de 4 px), e cada pixel iluminado pela INCLINAÇÃO na direção da luz — cima e esquerda —, então o olho lê
 * torrões com o lado claro sempre do mesmo lado, e não um mosqueado. Cinco tons de terra; sem transparência no meio:
 * a borda é dura, e é o capim que entra na terra em fiapos.
 *
 * Por cima: o TRILHO pisado (mais liso e mais escuro) do lado do colchão até a entrada do sudeste, a CINZA espalhada
 * em volta do fogo, pedrinhas com a luz em cima e a sombra embaixo, gravetinhos e umas folhas caídas.
 *
 * As posições são em pixels da textura: 16 por tile, a partir do canto de cima à esquerda da clareira (HeroCamp diz
 * onde ela fica). O colchão fica em (27, 24), as pedras do fogo em (27, 40), a entrada em (60, 56).
 */
export const paintClearing = (ctx: CanvasRenderingContext2D): void => {
  const w = CLEARING_W;
  const h = CLEARING_H;
  const img = ctx.createImageData(w, h);
  const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const put = (x: number, y: number, c: string): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const [r, g, b] = hex(c);
    const k = (y * w + x) * 4;
    img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
  };
  const filled = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && img.data[(y * w + x) * 4 + 3] > 0;

  // A forma: uma elipse com a borda mexida por ruído grosso — dura, sem meio-tom de alfa.
  const inside = (x: number, y: number): number => {
    const nx = (x + 0.5 - w / 2) / (w / 2);
    const ny = (y + 0.5 - h / 2) / (h / 2);
    const r = Math.hypot(nx, ny * 1.02);
    const edge = 0.86 + (valueNoise(x, y, 6, 31) - 0.5) * 0.24 + (valueNoise(x, y, 3, 37) - 0.5) * 0.08;
    return edge - r; // > 0 dentro
  };
  // O trilho: da frente da cabana até a entrada do sudeste, e saindo pela borda.
  const pathPts: ReadonlyArray<readonly [number, number]> = [[36, 24], [44, 34], [54, 44], [60, 52], [62, 64]];
  const pathDist = (x: number, y: number): number => {
    let best = 99;
    for (let i = 0; i < pathPts.length - 1; i += 1) {
      const [ax, ay] = pathPts[i];
      const [bx, by] = pathPts[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
    }
    return best;
  };
  const height = (x: number, y: number): number => 0.65 * valueNoise(x, y, 8, 3) + 0.35 * valueNoise(x, y, 4, 7);

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const onPath = pathDist(x, y) < 4.2 + valueNoise(x, y, 5, 41) * 2;
      if (inside(x, y) <= 0 && !onPath) continue;
      const hh = height(x, y);
      const slope = hh - height(x - 1, y - 1); // a luz vem de cima-à-esquerda
      if (onPath) {
        // pisado: o relevo achata, e a terra escurece
        const t = Math.round(Math.max(0, Math.min(4, 2 + (hh - 0.5) * 1.6 + slope * 7)));
        put(x, y, SOIL_PATH[t]);
      } else {
        const t = Math.round(Math.max(0, Math.min(4, 2 + (hh - 0.5) * 3 + slope * 16)));
        put(x, y, SOIL[t]);
      }
    }
  }

  // A CINZA em volta do fogo: uma mancha cinza que se desfaz em pontos.
  const [fx, fy] = [27, 40];
  for (let y = fy - 9; y <= fy + 8; y += 1) {
    for (let x = fx - 11; x <= fx + 11; x += 1) {
      if (!filled(x, y)) continue;
      const d = Math.hypot((x - fx) / 11, (y - fy) / 8);
      if (d > 1) continue;
      if (d > 0.7 && hash(x, y, 51) > (1 - d) * 3) continue;
      put(x, y, ASH_TONES[hash(x, y, 53) < 0.6 ? 0 : hash(x, y, 55) < 0.6 ? 1 : 2]);
    }
  }

  // O CAPIM entrando na terra: fiapos de 1 px de largura e 2–3 de altura, nascendo na borda, de baixo para cima.
  for (let y = 1; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const e = inside(x, y);
      if (e <= 0 || e > 0.07 || pathDist(x, y) < 6) continue;
      if (hash(x, y, 61) > 0.42) continue;
      const tall = 2 + Math.floor(hash(x, y, 63) * 2);
      for (let k = 0; k < tall; k += 1) put(x, y - k, GRASS[k === tall - 1 ? 2 : k === 0 ? 0 : 1]);
    }
  }

  // PEDRINHAS (luz em cima-à-esquerda, sombra embaixo-à-direita, e a sombra na terra), GRAVETINHOS e FOLHAS.
  const free = (x: number, y: number, r: number): boolean => {
    for (let yy = y - r; yy <= y + r; yy += 1) for (let xx = x - r; xx <= x + r; xx += 1) if (!filled(xx, yy)) return false;
    return Math.hypot(x - fx, y - fy) > 10;
  };
  for (let i = 0; i < 40; i += 1) {
    const x = 3 + Math.floor(hash(i, 1, 71) * (w - 6));
    const y = 3 + Math.floor(hash(i, 2, 73) * (h - 6));
    if (!free(x, y, 2) || pathDist(x, y) < 4) continue;
    const kind = i % 5;
    if (kind <= 1) {
      put(x, y, PEBBLE[0]); put(x + 1, y, PEBBLE[1]); put(x, y + 1, PEBBLE[1]); put(x + 1, y + 1, PEBBLE[2]);
      put(x + 2, y + 1, SOIL[0]); put(x + 1, y + 2, SOIL[0]);
    } else if (kind === 2) {
      put(x, y, PEBBLE[1]); put(x + 1, y + 1, SOIL[0]);
    } else if (kind === 3) {
      put(x, y, '#3f2c1d'); put(x + 1, y + 1, '#3f2c1d'); put(x + 2, y + 1, '#5a3f28'); put(x + 3, y + 2, '#3f2c1d');
    } else {
      put(x, y, hash(i, 3, 75) < 0.5 ? '#b8662e' : '#c99a3e');
      if (hash(i, 4, 77) < 0.5) put(x + 1, y, '#8a4a22');
    }
  }
  ctx.putImageData(img, 0, 0);
};

// ── O BARRIL DO GATO ──────────────────────────────────────────────────────────────────────────────

/**
 * O BARRIL DO GATO (objects/CatBarrel): a casa de Diógenes, deitado de lado com a boca para a câmera. Por cima
 * aparecem as aduelas do corpo, que vai para trás, com um aro de ferro; na frente, a boca redonda com o aro, o
 * escuro de dentro e a palha no fundo, onde o gato se enrola. Luz de cima e da esquerda.
 */
export const paintBarrel = (rect: Paint): void => {
  const IRON = ['#7a7d86', '#55585f', '#383a40'] as const;
  const INSIDE = '#24170f';
  const STRAW = ['#d8b35a', '#b8913f', '#8a6a2c'] as const;
  const ellipse = (x: number, y: number, cy: number, rx: number, ry: number): number => ((x + 0.5 - 8) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
  const body = (x: number, y: number, grow = 0): number => ellipse(x, y, 6, 6.4 + grow, 4.4 + grow);
  const mouth = (x: number, y: number, grow = 0): number => ellipse(x, y, 10.2, 6.4 + grow, 5.4 + grow);
  const noise = (x: number, y: number): number => {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  };
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const m = mouth(x, y);
      if (m <= 1) {
        if (m > 0.8) rect(m > 0.92 ? IRON[2] : (x < 8 && y < 10 ? IRON[0] : IRON[1]), x, y, 1, 1);
        else if (m > 0.6) rect(x + y < 17 ? RAMPS.wood[0] : x + y < 21 ? RAMPS.wood[1] : RAMPS.wood[2], x, y, 1, 1);
        else if (y >= 12) rect(STRAW[noise(x, y) < 0.45 ? 0 : noise(x, y) < 0.8 ? 1 : 2], x, y, 1, 1);
        else rect(INSIDE, x, y, 1, 1);
      } else if (body(x, y) <= 1) {
        // as aduelas correm para trás: listras em pé, a da esquerda na luz, a da direita na sombra, e o aro
        let c: string = Math.floor((x - 1) / 2.4) % 2 === 0 ? RAMPS.wood[1] : RAMPS.wood[2];
        if (x <= 3) c = RAMPS.wood[0];
        if (x >= 13) c = RAMPS.wood[3];
        if (y === 4) c = x <= 3 ? IRON[0] : x >= 13 ? IRON[2] : IRON[1];
        rect(c, x, y, 1, 1);
      } else if (mouth(x, y, 0.85) <= 1 || body(x, y, 0.85) <= 1) {
        rect(INK, x, y, 1, 1);
      }
    }
  }
};
