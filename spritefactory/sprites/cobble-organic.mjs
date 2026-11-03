// A PEDRA QUE NÃO É GRADE: calçamento e muro com pedras de contorno irregular, em vez da alvenaria que deixava
// ver o quadrado de cada tile.
//
// Procedural pelo mesmo motivo do `ground-earth`: é preciso várias pinturas de mesma estatística. Cada pedra é uma
// célula de Voronoi no toro de 16×16, então a costura fecha entre dois tiles e nenhuma junta segue a borda do
// tile. A junta é mais larga onde três pedras se encontram, o que arredonda os cantos. A luz vem de cima-à-esquerda.
//
//   node spritefactory/factory.mjs build cobble-organic
//   node spritefactory/install-tile.mjs cobble-organic environment/tilesets/forest_tile_set.png 23 --src=0:2 --force
//   node spritefactory/install-tile.mjs cobble-organic environment/tilesets/forest_tile_set.png 39 --src=2:2 --force
//   node spritefactory/install-tile.mjs cobble-organic environment/tilesets/forest_tile_set.png 57 --src=4:4

const TILE = 16;

const rngOf = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const wrap = (d) => {
  const a = Math.abs(d) % TILE;
  return Math.min(a, TILE - a);
};

const paint = (seed, stones, moss) => {
  const rng = rngOf(seed);
  // As sementes saem de uma grade tremida: sorteio puro empilha pedras e deixa buracos.
  const side = Math.ceil(Math.sqrt(stones));
  const seeds = [];
  for (let j = 0; j < side; j += 1) {
    for (let i = 0; i < side; i += 1) {
      if (seeds.length >= stones) break;
      seeds.push({
        x: (i + 0.15 + rng() * 0.7) * (TILE / side),
        y: (j + 0.15 + rng() * 0.7) * (TILE / side),
        sx: 0.8 + rng() * 0.5,
        sy: 0.8 + rng() * 0.5,
        tone: rng(),
      });
    }
  }
  const signed = (d) => {
    const a = ((d % TILE) + TILE) % TILE;
    return a > TILE / 2 ? a - TILE : a;
  };
  const grid = [];
  for (let y = 0; y < TILE; y += 1) {
    let row = '';
    for (let x = 0; x < TILE; x += 1) {
      const near = seeds
        .map((s) => ({ s, d: Math.hypot(wrap(x + 0.5 - s.x) * s.sx, wrap(y + 0.5 - s.y) * s.sy) }))
        .sort((a, b) => a.d - b.d);
      const seam = near[1].d - near[0].d;
      const corner = near[2].d - near[0].d;
      if (seam < 1 || corner < 2) { row += 'M'; continue; }
      const { s } = near[0];
      const lit = -(signed(x + 0.5 - s.x) + signed(y + 0.5 - s.y));
      const step = lit + (s.tone - 0.5) * 3;
      row += step > 2 ? 'H' : step > -1.5 ? 'B' : 'S';
    }
    grid.push(row);
  }
  if (!moss) return grid;
  // O musgo nasce na junta e sobe um pouco pela pedra, em manchas.
  const cells = grid.map((r) => r.split(''));
  const patches = Array.from({ length: 3 }, () => ({ x: rng() * TILE, y: rng() * TILE, r: 2.5 + rng() * 2 }));
  for (let y = 0; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) {
      const inside = patches.some((p) => Math.hypot(wrap(x + 0.5 - p.x), wrap(y + 0.5 - p.y)) < p.r);
      if (!inside) continue;
      if (cells[y][x] === 'M') cells[y][x] = 'D';
      else if (rng() < 0.45) cells[y][x] = 'G';
    }
  }
  return cells.map((r) => r.join(''));
};

const SHEET = [
  paint(0xc0b1e_01, 6, false), // → 23: calçamento
  paint(0xc0b1e_02, 6, true), //  → 24: calçamento com musgo
  paint(0xc0b1e_03, 4, false), // → 39: muro, pedras maiores
  paint(0xc0b1e_04, 4, true), //  → 40: muro com musgo
  paint(0xc0b1e_05, 7, false), // → 57 ┐ variantes do calçamento: só arte, escolhidas por hash da coordenada
  paint(0xc0b1e_06, 5, false), // → 58 ┘
  paint(0xc0b1e_07, 7, true), //  → 59 ┐
  paint(0xc0b1e_08, 5, true), //  → 60 ┘
];

export default {
  name: 'cobble-organic',
  kind: 'terrain',
  palette: {
    M: '#3d3b36', // a junta
    B: '#7b776d', // a pedra
    H: '#8e897d', // a luz dela
    S: '#67635a', // a sombra dela
    G: '#4f5129', // o musgo sobre a pedra
    D: '#42441f', // o musgo na junta
  },
  frames: SHEET,
  // Tons próprios da pedra, mais escuros que a paleta geral: sob o sol do jogo ela precisa contrastar com o capim.
  allowNewColors: ['#3d3b36', '#7b776d', '#8e897d', '#67635a', '#42441f', '#4f5129'],
  notes: 'Substitui os frames 23, 24, 39 e 40 e acrescenta 57 a 60. Pedras de contorno '
    + 'irregular, em toro de 16x16: a junta nunca acompanha a borda do tile.',
};
