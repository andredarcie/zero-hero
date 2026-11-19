// A AREIA DA PRAIA DO NORTE (pedido do autor, 2026-11-19: "faixa de areia completa... tudo com alta qualidade de pixel
// art"). É o primeiro chão claro do jogo, e o mais difícil de acertar por isso: a luz do vale estoura o que é claro
// (ver a revisão de arte de 2026-11-10), então a areia NÃO é creme. Ela é o cinza quente da pedra clara do calçamento,
// salpicado de ocre, e é a luz dourada do vale que a faz areia (a conta está junto da paleta, lá embaixo).
//
// QUATRO PINTURAS, como a terra (ground-earth.mjs) e pela mesma razão: uma só, repetida em mil tiles, vira papel de
// parede. As quatro têm a MESMA distribuição de valor (corte por quantil), e a coordenada sorteia qual cada tile veste
// (constants.groundFrameAt). O mapa guarda uma só (a 141).
//
//   0 GRÃO          areia solta: grão de 2 px sobre manchas de 4 px
//   1 GRÃO          a mesma, outra semente
//   2 ONDULAÇÃO     as rugas que o vento deixa: duas cristas por tile, levemente onduladas, luz de cima à esquerda
//   3 CONCHINHAS    grão com dois cacos de concha (creme) e um seixo escuro
//
// Tudo periódico no toro de 16×16 (a treliça do ruído e as rugas envolvem em `mod`): a costura fecha entre dois tiles
// quaisquer, inclusive de variantes diferentes. A maior feição tem 4 px — acima de meio tile, o que se vê é a grade
// (a lição do ground-earth).
//
//   node spritefactory/factory.mjs build beach-sand
//   node spritefactory/install-tile.mjs beach-sand environment/tilesets/forest_tile_set.png 141

const TILE = 16;

const makeRng = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Ruído de valor periódico no tile (`cells` divide 16). */
const periodicNoise = (rng, cells) => {
  const lattice = Array.from({ length: cells * cells }, () => rng());
  const at = (cx, cy) => lattice[(((cy % cells) + cells) % cells) * cells + (((cx % cells) + cells) % cells)];
  const smooth = (t) => t * t * (3 - 2 * t);
  const step = cells / TILE;
  return (x, y) => {
    const fx = x * step; const fy = y * step;
    const x0 = Math.floor(fx); const y0 = Math.floor(fy);
    const tx = smooth(fx - x0); const ty = smooth(fy - y0);
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bot = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bot * ty;
  };
};

const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * sorted.length)))];
};

// Quanto de área cada degrau ocupa, do escuro ao claro: sombra do grão, base, grão de ocre, brilho. Igual nas quatro.
// (O ocre e o brilho são poucos: com um quinto de ocre e 5% de creme, a areia ao sol faiscava de amarelo e branco.)
const SHARE = [0.22, 0.62, 0.135, 0.025];
const STEPS = 'SBLH';

const wrap = (v) => ((v % TILE) + TILE) % TILE;

const paint = (seed, kind) => {
  const rng = makeRng(seed);
  const mid = periodicNoise(rng, 4);
  const fine = periodicNoise(rng, 8);
  const speck = periodicNoise(rng, 16); // o grão de 1 px: areia é o único chão que tem
  const height = new Float64Array(TILE * TILE);
  for (let y = 0; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) {
      let h = 0.34 * mid(x, y) + 0.36 * fine(x, y) + 0.3 * speck(x, y);
      if (kind === 'ripple') {
        // As rugas do vento: duas cristas por tile, onduladas (um ciclo de seno por tile, então fecham no toro). A
        // crista é clara no lado de onde vem a luz (em cima) e deixa a sombra logo abaixo.
        const phase = wrap(y + Math.round(1.6 * Math.sin((x / TILE) * Math.PI * 2))) % 8;
        const ridge = phase === 0 ? 0.42 : phase === 1 ? 0.16 : phase === 2 ? -0.34 : phase === 7 ? 0.1 : 0;
        h = 0.5 * h + 0.25 + ridge;
      }
      height[y * TILE + x] = h;
    }
  }
  const cuts = [];
  let acc = 0;
  for (let i = 0; i < SHARE.length - 1; i += 1) {
    acc += SHARE[i];
    cuts.push(quantile(height, acc));
  }
  const cells = [];
  for (let y = 0; y < TILE; y += 1) {
    const row = [];
    for (let x = 0; x < TILE; x += 1) {
      const v = height[y * TILE + x];
      let i = 0;
      while (i < cuts.length && v >= cuts[i]) i += 1;
      row.push(STEPS[i]);
    }
    cells.push(row);
  }
  // Os grãos escuros (mica, um caco de pau): três por tile, um pixel cada, nunca dois encostados.
  for (let i = 0; i < 3; i += 1) {
    const x = Math.floor(rng() * TILE);
    const y = Math.floor(rng() * TILE);
    cells[y][x] = 'D';
  }
  if (kind === 'shells') {
    // Dois cacos de concha, de 2 px (creme, com a sombra do lado de baixo à direita), e um seixo.
    for (let i = 0; i < 2; i += 1) {
      const x = 2 + Math.floor(rng() * 11);
      const y = 2 + Math.floor(rng() * 11);
      cells[y][x] = 'C';
      cells[y][wrap(x + 1)] = i ? 'C' : 'H';
      cells[wrap(y + 1)][wrap(x + 1)] = 'S';
    }
    const px = 3 + Math.floor(rng() * 10);
    const py = 3 + Math.floor(rng() * 10);
    cells[py][px] = 'D';
    cells[py][wrap(px + 1)] = 'D';
    cells[wrap(py - 1)][px] = 'S';
  }
  return cells.map((r) => r.join(''));
};

export default {
  name: 'beach-sand',
  kind: 'terrain',
  // DUAS VERSÕES ERRADAS ANTES DESTA, e as duas pela mesma conta. A areia foi pintada com a madeira da casa (#9c7a58,
  // depois o ocre #826841): tons de areia NO ARQUIVO. Mas a luz do vale é dourada — o sol, o ar e o split-tone empurram
  // a mesma cor —, e ouro sobre ocre dá LARANJA-QUEIMADO: areia de deserto, com o vermelho no teto e o azul no chão (as
  // fotos do playtest `praia`). Escurecer não resolve: muda o valor, não o matiz. Quem vira areia clara sob luz dourada
  // é um albedo quase NEUTRO: o cinza quente da pedra do calçamento, que já é do tileset, salpicado do ocre claro. No
  // arquivo ela parece cascalho; ao sol do vale, é areia.
  palette: {
    D: '#5e5a56', // o grão escuro
    S: '#7b776d', // a sombra entre os grãos: a pedra do calçamento
    B: '#8e897d', // a base: a pedra clara do calçamento, que o sol do vale doura até areia
    L: '#a2895b', // o grão de ocre claro: o que dá o amarelo à areia
    H: '#ccbd99', // o brilho: o creme do tileset
    C: '#e3dad1', // o caco de concha: o osso quente, em dois pixels por tile
  },
  // As três pedras do calçamento são cores do forest_tile_set.png que o censo do linter não lista (ele mede os PNGs
  // soltos, e o atlas do chão é quem as usa).
  allowNewColors: ['#5e5a56', '#7b776d', '#8e897d'],
  frames: [
    paint(0xbeac_0001, 'grain'),
    paint(0xbeac_0007, 'grain'),
    paint(0xbeac_000d, 'ripple'),
    paint(0xbeac_0013, 'shells'),
  ],
  notes: 'A areia da praia do norte: quatro pinturas periodicas no toro, com a mesma distribuicao de valor (corte por '
    + 'quantil). A rampa e a madeira clara da casa: o dia a clareia ate areia sem estourar. O mapa guarda a 141; a '
    + 'coordenada sorteia qual das quatro cada tile veste.',
};
