// O MATO ALTO DESENHADO FIO A FIO (pedido do autor, 2026-11-17: "refaça do zero a grama alta que a foice corta [...] a
// paleta tem de combinar com o cenário [...] boas práticas de pixel art [...] variável, para não parecer plantação").
//
// O mato velho era UM desenho de 16×16 com quatro quadros de vento: uns riscos finos de uma cor só sobre uma mancha roxa.
// Todos os tufos do vale eram o mesmo desenho, um por tile, centrado — de longe, uma plantação em fileiras.
//
// O QUE ESTE MÓDULO FAZ: uma BIBLIOTECA DE FIOS, cada um no seu retângulo de 8×16 do atlas, com o pé na fileira de
// baixo. Um tufo não é um desenho: é um sorteio de 8 a 12 fios da biblioteca, cada um em pé num ponto do tile, numa
// profundidade, com o seu tom (render3d/world/TallGrassField). Como cada fio mora sozinho no atlas, nenhum cobre o
// outro no desenho — no mundo eles se cobrem de verdade, pela profundidade, e o vento pode curvar cada um sem abrir
// buraco no vizinho.
//
// AS REGRAS DE PIXEL ART que o gerador segue (e o teste confere):
//   · a PALETA é a do forest_tile_set.png, só ela: as olivas do capim (#42441f #4d4f2c #626439 #8a8d49), o pé de
//     ardósia (#3a3f3f), a palha (#58553c #686347 #826841 #886644), o ouro da espiga (#d9b453) e o claro do talo
//     cortado (#d4c2b1). Sem degradê, sem contorno: a folha leva a rampa do bioma no shader, como o capim do mapa;
//   · LINHA LIMPA: o fio sobe uma fileira por vez e nunca anda mais de um pixel para o lado por fileira (sem buraco,
//     sem degrau duplo); a curva é convexa, então os trechos retos encurtam da base para a ponta — o arco de pixel;
//   · a LUZ vem da esquerda, como no tileset: na parte larga do fio o pixel da esquerda é claro e o da direita escuro;
//   · a folha AFINA: até dois pixels de largura embaixo, um em cima; uma em cada seis dobra a ponta para baixo;
//   · o PÉ é escuro (um ou dois pixels de ardósia), como o capim do autor — é o pé que o shader não deixa balançar.
//
// Determinístico: a mesma semente dá o mesmo atlas (o teste e o playtest veem o mesmo mato).

export type Rgb = readonly [number, number, number];

/** A paleta do mato, toda tirada do forest_tile_set.png. */
export const TALL_GRASS_PALETTE = {
  foot: [0x3a, 0x3f, 0x3f],
  deep: [0x42, 0x44, 0x1f],
  dark: [0x4d, 0x4f, 0x2c],
  mid: [0x62, 0x64, 0x39],
  light: [0x8a, 0x8d, 0x49],
  strawDark: [0x58, 0x55, 0x3c],
  stalk: [0x68, 0x63, 0x47],
  straw: [0x82, 0x68, 0x41],
  strawLight: [0x88, 0x66, 0x44],
  seedGold: [0xd9, 0xb4, 0x53],
  cutFace: [0xd4, 0xc2, 0xb1],
  shadow: [0x00, 0x00, 0x00],
} as const satisfies Record<string, Rgb>;

/** O alfa da sombra de contato: o preto a 39% do capim do autor. */
export const SHADOW_ALPHA = 100;

export const CELL_W = 8;
export const CELL_H = 16;
export const ATLAS_COLS = 16;
export const ATLAS_ROWS = 4;
export const ATLAS_W = CELL_W * ATLAS_COLS;
export const ATLAS_H = CELL_H * ATLAS_ROWS;

/** As células: 40 fios verdes, 8 de palha (espiga e fio seco), 12 tocos cortados, e as duas sombras (16 de largura). */
export const GREEN_CELLS = 40;
export const STRAW_CELLS = 8;
export const STUB_CELLS = 12;
const FIRST_STRAW = GREEN_CELLS;
const FIRST_STUB = GREEN_CELLS + STRAW_CELLS;
/** A sombra do tufo (16×16, células 60 e 61) e a do toco (células 62 e 63). */
export const SHADOW_CELL = 60;
export const STUB_SHADOW_CELL = 62;

export type BladeKind = 'green' | 'seed' | 'dry' | 'stub';

/** Uma corrida de pixels de uma coluna da célula (fileira 0 = o topo da célula). */
export interface ArtRun {
  col: number;
  top: number;
  bottom: number;
  /** Quantos pixels do fio ficam abaixo desta corrida (0 = ela é o pé). */
  base: number;
}

/** Um fio da biblioteca: a célula, o pé, a altura, as corridas que o desenham e para onde ele se inclina. */
export interface BladeArt {
  cell: number;
  kind: BladeKind;
  footCol: number;
  /** A fileira do pé na célula (sempre a de baixo). */
  footRow: number;
  height: number;
  footRows: number;
  runs: ArtRun[];
  /** Quantos pixels a ponta anda para o lado, do pé (negativo = para a esquerda). */
  lean: number;
}

export interface TallGrassAtlas {
  width: number;
  height: number;
  /** RGBA, fileira por fileira, a partir do topo. */
  pixels: Uint8ClampedArray<ArrayBuffer>;
  green: BladeArt[];
  straw: BladeArt[];
  stubs: BladeArt[];
}

/** Um gerador pequeno e determinístico (mulberry32). */
export const seededRandom = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Onde fica uma célula no atlas (o canto de cima à esquerda, em pixels). */
export const cellOrigin = (cell: number): { x: number; y: number } => ({
  x: (cell % ATLAS_COLS) * CELL_W,
  y: Math.floor(cell / ATLAS_COLS) * CELL_H,
});

type Paint = Map<string, Rgb>;
const key = (x: number, y: number): string => `${x},${y}`;

/**
 * O caminho de um fio, do pé para a ponta: uma fileira por vez, nunca mais de um pixel para o lado por fileira. `x(t)`
 * é convexa (`t^k`), então o fio sobe reto e só se dobra perto da ponta, que é como a folha de capim cede ao peso dela.
 */
const bladePath = (footCol: number, height: number, lean: number, k: number): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  let prev = footCol;
  for (let i = 0; i < height; i += 1) {
    const t = height === 1 ? 0 : i / (height - 1);
    let x = Math.round(footCol + lean * t ** k);
    if (x > prev + 1) x = prev + 1;
    if (x < prev - 1) x = prev - 1;
    out.push([x, CELL_H - 1 - i]);
    prev = x;
  }
  return out;
};

/**
 * Um fio verde: a folha que afina e se abre em arco (uma fonte, não uma vareta), a luz da esquerda, a ponta clara (ou
 * seca, ou dobrada). OS TONS SÃO OS DO CAPIM DO AUTOR: corpo em oliva e oliva-escuro, o oliva-claro só no fio de luz e
 * na ponta — no tileset ele é raro (3 pixels em 300), e a rampa do bioma estica o claro até o amarelo.
 */
const paintGreen = (rand: () => number, P: typeof TALL_GRASS_PALETTE): { paint: Paint; footCol: number; lean: number } => {
  // um em quatro é folha curta, de enchimento: o tufo é cheio embaixo e ralo em cima
  const height = rand() < 0.25 ? 6 + Math.floor(rand() * 3) : 9 + Math.floor(rand() * 7);
  const k = 1.15 + rand() * 0.7;
  // a inclinação cabe na célula e nunca passa de um pixel por fileira
  const maxLean = Math.min(5, (height - 1) / (k * 1.08));
  const lean = Math.round((rand() * 2 - 1) * maxLean * 2) / 2;
  const footCol = Math.min(CELL_W - 2, Math.max(1, Math.round(3.5 - lean * 0.5)));
  const path = bladePath(footCol, height, lean, k);
  const wide = height >= 9 && rand() < 0.4 ? Math.round(height * (0.3 + rand() * 0.2)) : 0;
  const footRows = rand() < 0.55 ? 1 : 2;
  const dryTip = rand() < 0.18;
  const droop = height >= 11 && Math.abs(lean) >= 1.5 && rand() < 0.4;
  // a folha à sombra (metade delas) é oliva-escuro com o oliva de luz; a acesa é oliva com o claro de luz
  const shaded = rand() < 0.5 || lean > 1.5;
  const body = shaded ? P.dark : P.mid;
  const lit = shaded ? P.mid : P.light;
  const paint: Paint = new Map();
  path.forEach(([x, y], i) => {
    const t = i / Math.max(1, height - 1);
    let c: Rgb = i < footRows ? P.foot : i === footRows ? P.deep : body;
    // o fio de luz: só no alto da folha que se vira para a esquerda (para o sol do tileset)
    if (i > footRows && i >= height - 2 && t > 0.6 && lean <= 0) c = lit;
    if (i === height - 1) c = dryTip ? P.straw : lit;
    paint.set(key(x, y), c);
    // a parte larga: o pixel da direita, à sombra
    if (i > footRows && i < wide && x + 1 < CELL_W) paint.set(key(x + 1, y), P.deep);
  });
  if (droop) {
    // A PONTA DOBRADA: dois pixels que descem para o lado da inclinação, como folha comprida que não se aguenta.
    const s = Math.sign(lean);
    const [tx, ty] = path[path.length - 1];
    const a: [number, number] = [tx + s, ty];
    const b: [number, number] = [tx + 2 * s, ty + 1];
    for (const [x, y] of [a, b]) if (x >= 0 && x < CELL_W) paint.set(key(x, y), dryTip ? P.straw : body);
  }
  return { paint, footCol, lean };
};

/** Uma espiga (talo fino com a cabeça de sementes) ou um fio seco, cor de palha. */
const paintStraw = (rand: () => number, P: typeof TALL_GRASS_PALETTE, seed: boolean): { paint: Paint; footCol: number; lean: number } => {
  const height = seed ? 12 + Math.floor(rand() * 4) : 10 + Math.floor(rand() * 5);
  const k = 1.6 + rand() * 0.8;
  const lean = Math.round((rand() * 2 - 1) * (seed ? 2 : 3) * 2) / 2;
  const footCol = Math.min(CELL_W - 3, Math.max(2, Math.round(3.5 - lean * 0.5)));
  const path = bladePath(footCol, height, lean, k);
  const paint: Paint = new Map();
  path.forEach(([x, y], i) => {
    const c: Rgb = i === 0 ? P.foot : seed ? (i < height * 0.4 ? P.strawDark : P.stalk) : (i < 2 ? P.strawDark : i === height - 1 ? P.strawLight : P.straw);
    paint.set(key(x, y), c);
  });
  if (seed) {
    // A CABEÇA: uma espiga de dois pixels de largura no alto do talo — o lado da luz (esquerda) claro, o da sombra
    // escuro, a ponta às vezes num grão de ouro. Lê como espiga, e não como bandeirinha.
    const [tx, ty] = path[path.length - 1];
    const head: Array<[number, number, Rgb]> = [
      [tx, ty, rand() < 0.4 ? P.seedGold : P.strawLight],
      [tx, ty + 1, P.straw], [tx - 1, ty + 1, P.strawLight],
      [tx, ty + 2, P.straw], [tx - 1, ty + 2, P.straw],
      [tx, ty + 3, P.strawDark],
    ];
    for (const [x, y, c] of head) if (x >= 0 && x < CELL_W && y >= 0 && y < CELL_H - 1) paint.set(key(x, y), c);
  }
  return { paint, footCol, lean };
};

/** Um toco: o fio cortado rente, dois a cinco pixels, com o talo claro onde a lâmina passou. */
const paintStub = (rand: () => number, P: typeof TALL_GRASS_PALETTE): { paint: Paint; footCol: number; lean: number } => {
  const height = 2 + Math.floor(rand() * 4); // 2..5
  const footCol = 2 + Math.floor(rand() * 4);
  const lean = rand() < 0.3 ? (rand() < 0.5 ? -1 : 1) : 0;
  const path = bladePath(footCol, height, lean, 1);
  const wide = rand() < 0.35;
  const dry = rand() < 0.2;
  const paint: Paint = new Map();
  path.forEach(([x, y], i) => {
    const top = i === height - 1;
    // o talo claro onde a lâmina passou: um em três é o creme do corte fresco, os outros o oliva-claro
    const c: Rgb = i === 0 ? P.foot : top ? (rand() < 0.35 ? P.cutFace : P.light) : dry ? P.straw : P.mid;
    paint.set(key(x, y), c);
    if (wide && i > 0 && x + 1 < CELL_W) paint.set(key(x + 1, y), top ? P.light : P.dark);
  });
  return { paint, footCol, lean };
};

/** As corridas de cada coluna (fileira 0 = o topo), com quantos pixels do fio ficam abaixo de cada uma. */
export const runsOf = (paint: Paint, footRow: number): ArtRun[] => {
  const byCol = new Map<number, number[]>();
  for (const k of paint.keys()) {
    const [x, y] = k.split(',').map(Number);
    const rows = byCol.get(x) ?? [];
    rows.push(y);
    byCol.set(x, rows);
  }
  const runs: ArtRun[] = [];
  for (const [col, rows] of [...byCol.entries()].sort((a, b) => a[0] - b[0])) {
    rows.sort((a, b) => a - b);
    let top = rows[0];
    for (let i = 1; i <= rows.length; i += 1) {
      if (i < rows.length && rows[i] === rows[i - 1] + 1) continue;
      const bottom = rows[i - 1];
      runs.push({ col, top, bottom, base: footRow - bottom });
      if (i < rows.length) top = rows[i];
    }
  }
  return runs.sort((a, b) => a.base - b.base || a.col - b.col);
};

const toArt = (cell: number, kind: BladeKind, made: { paint: Paint; footCol: number; lean: number }): BladeArt => {
  const footRow = CELL_H - 1;
  const runs = runsOf(made.paint, footRow);
  const top = Math.min(...runs.map((r) => r.top));
  let footRows = 0;
  const dark = new Set([TALL_GRASS_PALETTE.foot, TALL_GRASS_PALETTE.deep].map((c) => c.join(',')));
  while (dark.has((made.paint.get(key(made.footCol, footRow - footRows)) ?? []).join(','))) footRows += 1;
  return {
    cell, kind, footCol: made.footCol, footRow, height: footRow - top + 1, footRows: Math.max(1, footRows), runs, lean: made.lean,
  };
};

/**
 * A PONTA de um fio acima do corte (`cut` pixels do pé ficam no toco): a região da célula que ela ocupa, para o voo do
 * corte (render3d/world/GrassFlyers). Null se o fio é baixo demais para ter ponta.
 */
export const tipRegion = (art: BladeArt, cut = 3): { col0: number; col1: number; row0: number; row1: number } | null => {
  const row1 = art.footRow - cut;
  const row0 = art.footRow - art.height + 1;
  if (row1 < row0) return null;
  const cols = art.runs.filter((r) => r.top <= row1 && r.bottom >= row0).map((r) => r.col);
  if (cols.length === 0) return null;
  return { col0: Math.min(...cols), col1: Math.max(...cols), row0, row1 };
};

/** Uma sombra de contato pontilhada (o preto a 39% do capim), oval, na região 16×16 de `cell` e `cell + 1`. */
const paintShadow = (pixels: Uint8ClampedArray, cell: number, rx: number, rz: number): void => {
  const o = cellOrigin(cell);
  for (let y = 0; y < CELL_H; y += 1) {
    for (let x = 0; x < CELL_W * 2; x += 1) {
      const dx = (x + 0.5 - CELL_W) / rx;
      const dz = (y + 0.5 - CELL_H / 2) / rz;
      const d = dx * dx + dz * dz;
      // o miolo cheio, a borda em xadrez (o pontilhado que a pixel art usa no lugar do degradê)
      const on = d < 0.55 || (d < 1 && (x + y) % 2 === 0);
      if (!on) continue;
      const i = ((o.y + y) * ATLAS_W + o.x + x) * 4;
      pixels[i + 3] = SHADOW_ALPHA;
    }
  }
};

/** O atlas inteiro, com a biblioteca de fios. */
export const buildTallGrassAtlas = (seed = 0x6d61746f): TallGrassAtlas => {
  const rand = seededRandom(seed);
  const P = TALL_GRASS_PALETTE;
  const pixels = new Uint8ClampedArray(ATLAS_W * ATLAS_H * 4);
  const put = (cell: number, paint: Paint): void => {
    const o = cellOrigin(cell);
    for (const [k, c] of paint) {
      const [x, y] = k.split(',').map(Number);
      const i = ((o.y + y) * ATLAS_W + o.x + x) * 4;
      pixels.set([c[0], c[1], c[2], 255], i);
    }
  };
  const green: BladeArt[] = [];
  const straw: BladeArt[] = [];
  const stubs: BladeArt[] = [];
  // nenhum fio repete outro: um desenho que já existe é sorteado de novo (a folha curta, com poucos pixels, empata às vezes)
  const shapes = new Set<string>();
  for (let c = 0; c < GREEN_CELLS; c += 1) {
    let made = paintGreen(rand, P);
    const sig = (m: typeof made): string => [...m.paint.keys()].sort().join(';');
    for (let tries = 0; tries < 12 && shapes.has(sig(made)); tries += 1) made = paintGreen(rand, P);
    shapes.add(sig(made));
    put(c, made.paint);
    green.push(toArt(c, 'green', made));
  }
  for (let c = 0; c < STRAW_CELLS; c += 1) {
    const seedHead = c < 5;
    const made = paintStraw(rand, P, seedHead);
    put(FIRST_STRAW + c, made.paint);
    straw.push(toArt(FIRST_STRAW + c, seedHead ? 'seed' : 'dry', made));
  }
  for (let c = 0; c < STUB_CELLS; c += 1) {
    const made = paintStub(rand, P);
    put(FIRST_STUB + c, made.paint);
    stubs.push(toArt(FIRST_STUB + c, 'stub', made));
  }
  paintShadow(pixels, SHADOW_CELL, 7.2, 5.4);
  paintShadow(pixels, STUB_SHADOW_CELL, 5.6, 3.8);
  return { width: ATLAS_W, height: ATLAS_H, pixels, green, straw, stubs };
};
