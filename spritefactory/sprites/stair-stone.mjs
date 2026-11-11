// A PEDRA LAVRADA DA ESCADA (pedido do autor, 2026-11-11: "melhore a qualidade da escada e faça ela combinar" com a
// rocha nova da serra, sprites/cliff-rock.mjs).
//
// A escada era o calçamento (pedra redonda com rejunte, quadro 23) em todas as faces, e a malha ESPREMIA a arte: o
// espelho de cada degrau (um quarto de tile de altura) levava o quadro inteiro, e a mureta e o pilar o esticavam na
// altura. Lia como escada de madeira bege. Agora são três pinturas de pedra CORTADA, na paleta da rocha, desenhadas
// para a medida da escada — um degrau é um quarto de tile, então tudo aqui anda em faixas de 4 pixels:
//
//   · o DEGRAU (130): quatro faixas de 4 linhas, uma por degrau. A linha de baixo de cada faixa é a QUINA da frente
//     (o mundo põe a frente do degrau no pé da faixa), acesa — é a quina clara que conta os degraus de cima; a de cima
//     é o fundo, encostado no espelho do degrau seguinte, mais escura. Duas juntas por degrau, desencontradas.
//   · a SILHARIA (131, e 133 com musgo): fiadas de 4 pixels — o espelho de um degrau é exatamente uma fiada —, blocos
//     de 5 a 8 pixels em amarração, a aresta de cima acesa e a junta embaixo. Mureta, espelho e pilar.
//   · o CAPEAMENTO (132): a pedra comprida de cima da mureta e do pilar, clara, com junta a cada palmo. A mureta só
//     mostra as 2 ou 3 colunas da beira do quadro (ela tem 0,14 tile de espessura), então as duas beiras são as que
//     importam.
//
//   node spritefactory/factory.mjs build stair-stone
//   node spritefactory/install-tile.mjs stair-stone environment/tilesets/forest_tile_set.png 130 [--force]
//
// Frames: 130 o degrau, 131 a silharia, 132 o capeamento, 133 a silharia com musgo, 134 o espelho do degrau.

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

const blank = (c) => Array.from({ length: TILE }, () => Array.from({ length: TILE }, () => c));
const toGrid = (cells) => cells.map((r) => r.join(''));
const DARKER = { L: 'H', H: 'B', B: 'S', S: 'K', K: 'K', M: 'M' };
const LIGHTER = { K: 'S', S: 'B', B: 'H', H: 'L', L: 'L', M: 'M' };

/** As juntas de lado de cada faixa: blocos de `min` a `max` pixels, a primeira desencontrada da faixa de cima. */
const joints = (rng, min, max, offset) => {
  const out = [];
  let x = offset;
  while (out.length < 6) {
    out.push(((x % TILE) + TILE) % TILE);
    x += min + Math.floor(rng() * (max - min + 1));
    if (x - offset >= TILE - min + 1) break;
  }
  return out;
};

/** O degrau: a quina acesa embaixo de cada faixa, o fundo escuro em cima, duas pedras por degrau. */
const tread = (seed) => {
  const rng = rngOf(seed);
  const cells = blank('B');
  for (let band = 0; band < 4; band += 1) {
    const top = band * 4;
    const cuts = joints(rng, 6, 9, Math.floor(rng() * 8) + band * 5);
    for (let r = 0; r < 4; r += 1) {
      const y = top + r;
      for (let x = 0; x < TILE; x += 1) {
        let c = r === 0 ? 'S' : r === 3 ? 'H' : 'B';
        if (r === 3 && rng() < 0.3) c = 'L'; // a quina gasta pega mais luz
        if (r > 0 && r < 3 && rng() < 0.08) c = rng() < 0.5 ? 'S' : 'H'; // o grão
        cells[y][x] = c;
      }
      for (const j of cuts) {
        if (r === 3) { cells[y][j] = 'S'; continue; } // na quina a junta é só um entalhe
        cells[y][j] = 'M';
        cells[y][(j + 1) % TILE] = LIGHTER[cells[y][(j + 1) % TILE]]; // a beira da pedra seguinte, acesa
      }
    }
  }
  return toGrid(cells);
};

/** A silharia: fiadas de 4 pixels em amarração, a aresta de cima acesa, a junta embaixo. */
const ashlar = (seed, moss) => {
  const rng = rngOf(seed);
  const cells = blank('B');
  let offset = Math.floor(rng() * 6);
  for (let course = 0; course < 4; course += 1) {
    const top = course * 4;
    const cuts = joints(rng, 5, 8, offset);
    offset += 3 + Math.floor(rng() * 2); // a junta de cima nunca cai sobre a de baixo
    const tones = cuts.map(() => (rng() < 0.2 ? 'S' : rng() < 0.15 ? 'H' : 'B'));
    for (let r = 0; r < 4; r += 1) {
      const y = top + r;
      for (let x = 0; x < TILE; x += 1) {
        // o bloco a que este pixel pertence (o da última junta à esquerda, em toro)
        let k = cuts.length - 1;
        for (let i = 0; i < cuts.length; i += 1) if (((x - cuts[i] + TILE) % TILE) < ((x - cuts[k] + TILE) % TILE)) k = i;
        let c = tones[k];
        if (r === 0) c = LIGHTER[c]; // a aresta de cima
        if (r === 2 && rng() < 0.1) c = DARKER[c];
        if (r === 3) c = 'M'; // a junta da fiada
        cells[y][x] = c;
      }
      if (r < 3) {
        for (const j of cuts) {
          cells[y][j] = 'M';
          const right = (j + 1) % TILE;
          if (cells[y][right] !== 'M') cells[y][right] = LIGHTER[cells[y][right]];
        }
      }
    }
  }
  if (moss) {
    // musgo na junta e subindo pela pedra, de baixo para cima (a água escorre e para na fiada)
    for (let y = 0; y < TILE; y += 1) {
      for (let x = 0; x < TILE; x += 1) {
        const near = Math.hypot((x - 4) / 3, (y - 13) / 2) < 1.6 || Math.hypot((x - 12) / 3.5, (y - 7) / 1.8) < 1.4;
        if (!near) continue;
        if (cells[y][x] === 'M') cells[y][x] = 'D';
        else if (rng() < 0.55) cells[y][x] = 'G';
      }
    }
  }
  return toGrid(cells);
};

/**
 * O ESPELHO do degrau: a face em pé de cada pedra de degrau. Em cima, colado na quina, a sombra funda que a quina faz;
 * embaixo, a pedra; juntas só em pé, desencontradas de um degrau para o outro. (A silharia não servia: a aresta acesa
 * de cada fiada caía justo debaixo da quina, onde é sombra.)
 */
const riser = (seed) => {
  const rng = rngOf(seed);
  const cells = blank('B');
  for (let band = 0; band < 4; band += 1) {
    const top = band * 4;
    const cuts = joints(rng, 6, 9, Math.floor(rng() * 8) + band * 3);
    for (let r = 0; r < 4; r += 1) {
      const y = top + r;
      for (let x = 0; x < TILE; x += 1) {
        let c = r === 0 ? 'K' : r === 1 ? 'S' : 'B';
        if (r >= 2 && rng() < 0.08) c = 'S';
        cells[y][x] = c;
      }
      if (r > 0) for (const j of cuts) cells[y][j] = 'M';
    }
  }
  return toGrid(cells);
};

/** O capeamento: pedra comprida e clara, junta a cada palmo, as duas beiras do quadro com aresta. */
const coping = (seed) => {
  const rng = rngOf(seed);
  const cells = blank('H');
  let y = Math.floor(rng() * 3);
  const seams = [];
  while (y < TILE) { seams.push(y); y += 5 + Math.floor(rng() * 3); }
  for (let yy = 0; yy < TILE; yy += 1) {
    for (let x = 0; x < TILE; x += 1) {
      let c = 'H';
      if (x === 0 || x === 15) c = x === 0 ? 'L' : 'B'; // a aresta acesa à esquerda, a da sombra à direita
      else if (rng() < 0.07) c = rng() < 0.5 ? 'B' : 'L';
      if (seams.includes(yy)) c = x === 0 ? 'B' : 'S';
      if (seams.includes(yy - 1) && x > 0) c = LIGHTER[c] === 'L' ? 'L' : c; // a pedra seguinte começa acesa
      cells[yy][x] = c;
    }
  }
  return toGrid(cells);
};

export default {
  name: 'stair-stone',
  kind: 'terrain',
  palette: {
    K: '#252827',
    M: '#2e3231', // a junta
    S: '#434748',
    B: '#565a5a', // a pedra (a mesma da rocha da serra)
    H: '#6c6f6c',
    L: '#82837d', // a quina e a aresta acesas
    G: '#4f5129', // o musgo
    D: '#42441f',
  },
  frames: [
    tread(0x57a1_01), //        → 130 o degrau
    ashlar(0x57a1_02, false), // → 131 a silharia
    coping(0x57a1_03), //       → 132 o capeamento
    ashlar(0x57a1_04, true), //  → 133 a silharia com musgo
    riser(0x57a1_05), //        → 134 o espelho do degrau
  ],
  // A paleta é a da rocha da serra (cliff-rock.mjs): a escada é talhada da mesma pedra.
  allowNewColors: ['#252827', '#2e3231', '#434748', '#565a5a', '#6c6f6c', '#82837d', '#4f5129', '#42441f'],
  notes: 'Acrescenta 130..134 (só arte de desenho). Faixas de 4 pixels: um degrau é um quarto de tile, e o espelho '
    + 'de um degrau é exatamente uma fiada da silharia.',
};
