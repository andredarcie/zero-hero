// A ROCHA DA SERRA (pedido do autor, 2026-11-11: "melhore drasticamente o visual das colinas e serras de pedra").
//
// A serra e a colina usavam a pintura do CALÇAMENTO (cobble-organic: pedras redondas com rejunte) nas paredes e no
// topo. Em pé, pedra redonda com rejunte é MURO: a montanha lia como uma ruína de tijolo bege, e a colina como um
// canteiro com muro de arrimo. Penhasco é rocha FRATURADA: lajes altas, fenda quase sempre vertical, uma quebra de
// camada aqui e ali, a luz no alto e o pé no escuro. Visto de cima, o alto de um rochedo é laje grande com fenda
// QUEBRADA — a fenda que fecha em volta de cada pedra é o que faz um calçamento.
//
// Procedural pelo mesmo motivo do `cobble-organic`: várias pinturas da mesma estatística. As lajes são células de
// Voronoi com a distância esticada (custa mais andar de lado que de pé, então a célula sai alta); a fenda é a troca
// de dono de um pixel para o vizinho da direita ou de baixo (sempre um pixel de largura). A face fecha em toro só na
// horizontal (as faces de tiles vizinhos emendam de lado; de pé, uma camada sobre a outra é quebra de estrato, e
// é natural). O topo fecha em toro nas duas direções. A luz vem de cima-à-esquerda: o pixel com a fenda à esquerda
// ou acima é a beira acesa, com a fenda à direita ou abaixo é a beira em sombra.
//
//   node spritefactory/factory.mjs build cliff-rock
//   node spritefactory/install-tile.mjs cliff-rock environment/tilesets/forest_tile_set.png 120
//
// Frames: 120..123 a face, 124..125 a face com musgo, 126..127 o topo, 128..129 o topo com musgo.

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

/** O dono de cada pixel: o índice da laje mais perto, na métrica dada. */
const owners = (seeds, metric) => {
  const own = [];
  for (let y = 0; y < TILE; y += 1) {
    const row = [];
    for (let x = 0; x < TILE; x += 1) {
      let best = 0;
      let bd = Infinity;
      seeds.forEach((s, i) => {
        const d = metric(x + 0.5 - s.x, y + 0.5 - s.y, s);
        if (d < bd) { bd = d; best = i; }
      });
      row.push(best);
    }
    own.push(row);
  }
  return own;
};

/** Um passo de valor para baixo (H → B → S → K), o que a sombra faz. */
const DARKER = { L: 'H', H: 'B', B: 'S', S: 'K', K: 'K', M: 'M' };

/** O musgo: nasce na fenda e sobe pela pedra em volta, em manchas. */
const mossOver = (cells, rng, patches) => {
  for (const p of patches) {
    for (let y = 0; y < TILE; y += 1) {
      for (let x = 0; x < TILE; x += 1) {
        if (Math.hypot(wrap(x + 0.5 - p.x), (y + 0.5 - p.y) * (p.flat ?? 1)) >= p.r) continue;
        if (cells[y][x] === 'M' || cells[y][x] === 'K') cells[y][x] = 'D';
        else if (rng() < 0.5) cells[y][x] = 'G';
      }
    }
  }
};

/**
 * A FACE DO PENHASCO: duas fileiras de lajes altas (a de cima e a de baixo, desencontradas), então a fenda é quase
 * sempre vertical e a quebra de camada cai numa altura diferente em cada coluna.
 */
const face = (seed, moss) => {
  const rng = rngOf(seed);
  const seeds = [];
  // Poucas lajes, largas: três por tile no alto e duas ou três embaixo (com quatro ou mais, a parede vira tábua).
  for (const [row, count] of [[0, 3], [1, 2 + Math.floor(rng() * 2)]]) {
    const off = rng() * (TILE / count);
    for (let i = 0; i < count; i += 1) {
      seeds.push({
        x: (off + (i + 0.25 + rng() * 0.5) * (TILE / count)) % TILE,
        y: row === 0 ? 2 + rng() * 5 : 10 + rng() * 5,
        sx: 1.15 + rng() * 0.35,
        tone: rng(),
      });
    }
  }
  const signed = (d) => {
    const a = ((d % TILE) + TILE) % TILE;
    return a > TILE / 2 ? a - TILE : a;
  };
  const own = owners(seeds, (dx, dy, s) => Math.hypot(wrap(dx) * s.sx, dy * 0.6));
  const at = (x, y) => own[Math.min(TILE - 1, Math.max(0, y))][((x % TILE) + TILE) % TILE];
  const crack = (x, y) => at(x, y) !== at(x + 1, y) || (y < TILE - 1 && at(x, y) !== at(x, y + 1));
  const cells = [];
  for (let y = 0; y < TILE; y += 1) {
    const row = [];
    for (let x = 0; x < TILE; x += 1) {
      if (crack(x, y)) { row.push('M'); continue; }
      const s = seeds[at(x, y)];
      // Cada laje é um bloco com faces: o lado esquerdo pega a luz, o direito vira para a sombra.
      const side = signed(x + 0.5 - s.x);
      let c = s.tone < 0.25 ? 'S' : 'B';
      if (side < -1.5) c = c === 'S' ? 'B' : 'H';
      else if (side > 1.5) c = DARKER[c];
      // a beira acesa e a beira em sombra de cada laje
      if (crack(x - 1, y) || (y > 0 && crack(x, y - 1))) c = c === 'S' ? 'B' : c === 'B' ? 'H' : 'L';
      else if (crack(x + 1, y) || crack(x, y + 1)) c = DARKER[c];
      else if (rng() < 0.04) c = DARKER[c]; // o grão da rocha
      // o alto da parede pega a luz; o pé fica no escuro
      if (y === 0 && rng() < 0.75) c = c === 'S' ? 'B' : c === 'B' ? 'H' : 'L';
      if (y >= 12) c = DARKER[c];
      if (y >= 14 && rng() < 0.5) c = DARKER[c];
      row.push(c);
    }
    cells.push(row);
  }
  // A fenda debaixo de uma quebra de camada é mais funda: a laje de cima faz sombra na de baixo.
  for (let y = 1; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) {
      if (cells[y - 1][x] === 'M' && cells[y][x] !== 'M' && at(x, y - 1) !== at(x, y)) cells[y][x] = DARKER[cells[y][x]];
    }
  }
  if (moss) {
    // musgo nas quebras de camada e no alto, onde a água para
    mossOver(cells, rng, Array.from({ length: 3 }, (_, i) => ({
      x: rng() * TILE, y: i === 0 ? 1 : 4 + rng() * 9, r: 2.2 + rng() * 1.6, flat: 1.6,
    })));
  }
  return cells.map((r) => r.join(''));
};

/**
 * O ALTO DO ROCHEDO, visto de cima: lajes grandes e de tamanhos diferentes, a fenda entre elas QUEBRADA (um terço
 * dela some, e duas lajes vizinhas se emendam), uma pedrinha solta aqui e ali.
 */
const top = (seed, moss) => {
  const rng = rngOf(seed);
  // Três lajes grandes por tile (com mais, volta a ser calçamento), de tamanhos diferentes.
  const seeds = Array.from({ length: 3 }, (_, i) => ({
    x: (i * 5.3 + rng() * 4) % TILE, y: rng() * TILE, sx: 0.8 + rng() * 0.6, sy: 0.8 + rng() * 0.6, tone: rng(),
  }));
  const own = owners(seeds, (dx, dy, s) => Math.hypot(wrap(dx) * s.sx, wrap(dy) * s.sy));
  const at = (x, y) => own[((y % TILE) + TILE) % TILE][((x % TILE) + TILE) % TILE];
  // A fenda é quebrada por trechos de 4 pixels (por pixel ela vira pontilhado): quase metade dela some, e duas lajes
  // vizinhas se emendam sem junta.
  const broken = Array.from({ length: 16 }, () => rng() < 0.5);
  const gap = (x, y) => broken[(Math.floor((((x % TILE) + TILE) % TILE) / 4) + 4 * Math.floor((((y % TILE) + TILE) % TILE) / 4)) % 16];
  const crack = (x, y) => !gap(x, y) && (at(x, y) !== at(x + 1, y) || at(x, y) !== at(x, y + 1));
  const cells = [];
  for (let y = 0; y < TILE; y += 1) {
    const row = [];
    for (let x = 0; x < TILE; x += 1) {
      if (crack(x, y)) { row.push('M'); continue; }
      const s = seeds[at(x, y)];
      // O alto pega o sol de cheio: a laje é clara, uma ou outra mais escura, e o grão sobe para a luz.
      // (laje inteira escura ou clara é rara: num tile só ela vira um desenho que se repete de tile em tile)
      let c = s.tone < 0.1 ? 'S' : s.tone > 0.92 ? 'H' : 'B';
      if (crack(x - 1, y) || crack(x, y - 1)) c = c === 'S' ? 'B' : c === 'B' ? 'H' : 'L';
      else if (crack(x + 1, y) || crack(x, y + 1)) c = DARKER[c];
      else if (rng() < 0.05) c = rng() < 0.5 ? DARKER[c] : c === 'S' ? 'B' : 'H';
      row.push(c);
    }
    cells.push(row);
  }
  // as pedrinhas soltas: um pixel aceso com a sombra embaixo à direita
  for (let k = 0; k < 2; k += 1) {
    const x = Math.floor(rng() * (TILE - 1));
    const y = Math.floor(rng() * (TILE - 1));
    if (cells[y][x] === 'M' || cells[y + 1][x + 1] === 'M') continue;
    cells[y][x] = 'L';
    cells[y + 1][x + 1] = 'K';
  }
  if (moss) mossOver(cells, rng, Array.from({ length: 3 }, () => ({ x: rng() * TILE, y: rng() * TILE, r: 2 + rng() * 2 })));
  return cells.map((r) => r.join(''));
};

const SHEET = [
  face(0xc11ff_01, false), // → 120 ┐
  face(0xc11ff_02, false), // → 121 │ a face do penhasco
  face(0xc11ff_03, false), // → 122 │
  face(0xc11ff_04, false), // → 123 ┘
  face(0xc11ff_05, true), //  → 124 ┐ a face com musgo
  face(0xc11ff_06, true), //  → 125 ┘
  top(0x70b_01, false), //    → 126 ┐ o alto do rochedo
  top(0x70b_02, false), //    → 127 ┘
  top(0x70b_03, true), //     → 128 ┐ o alto com musgo
  top(0x70b_04, true), //     → 129 ┘
];

export default {
  name: 'cliff-rock',
  kind: 'terrain',
  palette: {
    K: '#252827', // o fundo da fenda debaixo de uma laje, o pé
    M: '#2e3231', // a fenda
    S: '#434748', // a rocha na sombra
    B: '#565a5a', // a rocha
    H: '#6c6f6c', // a beira acesa
    L: '#82837d', // a crista, onde o sol bate primeiro
    G: '#4f5129', // o musgo sobre a pedra (o mesmo do calçamento)
    D: '#42441f', // o musgo na fenda
  },
  frames: SHEET,
  // A rocha mais funda e um passo mais fria que o calçamento (#7b776d). Medido no jogo com a primeira paleta (a do
  // calçamento esfriada): o alto da serra saía com brilho mediano 100 e pico 172, contra 70 do capim aceso — o sol
  // dourado deixava a pedra bege e clara, e coisa clara iluminada estoura. Esta fica perto do capim, e cinza sob o sol.
  allowNewColors: ['#252827', '#2e3231', '#434748', '#565a5a', '#6c6f6c', '#82837d', '#4f5129', '#42441f'],
  notes: 'Acrescenta 120..129 (só arte de desenho; nenhum tile do mundo guarda estes ids). A serra e a colina '
    + 'continuam guardando 39/40 e o chão delas; quem escolhe esta pintura é o terrainGeometry.',
};
