// AS CARTAS GANHAM MATO — o baralho comprável deixa de ser chão pelado.
//
// As 14 cartas do construtor de mundo nasceram desenhando a IDEIA de cada uma (o lago, a pedreira,
// o cemitério) e nada mais: fora dos poucos tiles que contam a história, o chunk é um campo liso de
// terra roxa. Este script planta o resto — capim, flores, cogumelos, folhagem, gravetos, pinheiros
// — e põe os props que cada cena pedia e não tinha (junco na margem, flor-da-lua no escuro, mais
// pedra na pedreira).
//
// Modelo enrich-*: LÊ public/world.json e ACRESCENTA — nunca refaz.
//   · idempotente — a decoração é uma FUNÇÃO PURA de (carta, tile), e só entra em célula vazia;
//     prop só entra se não houver prop naquele tile. Rodar duas vezes dá byte a byte o mesmo
//     arquivo (o script confere sozinho: `--check` compara com o que está no disco).
//   · determinístico — zero Math.random, zero timestamp: o ruído é um hash das coordenadas.
//   · não toca em `ground`, em `collisions`, nem em nada que o autor já pôs.
//
// AS DUAS LEIS QUE ESTE SCRIPT OBEDECE
//
// 1. **A decoração se AGRUPA.** Salpicar tile a tile por sorteio uniforme faz textura de papel de
//    parede, não lugar: o olho lê ruído. O que entra aqui é um campo de ruído de valor (lattice
//    grosso, interpolado) — moitas com miolo e franja. A FLOR mora no miolo da moita (flor cresce
//    onde o capim é fundo), o graveto mora na franja: a mesma regra em toda carta, e é ela que
//    dá relevo a um chunk plano.
//
// 2. **Nada que BLOQUEIA entra sem prova de BFS.** Pinheiro é tile sólido, junco/pedra/flor-da-lua
//    fechada são props sólidos: um deles no corredor errado sela a carta para sempre — e uma carta
//    é comprada UMA vez, então não há como o jogador desfazer. Cada candidato é testado sozinho
//    contra o mapa inteiro (já com as COSTURAS abertas, que é como a carta assenta no mundo) e
//    recusado se aumentar o número de tiles órfãos, desligar uma das quatro bocas de estrada ou
//    isolar uma coisa com que se interage. Duas cartas já nascem com bolsões de propósito
//    (whispering-forest, glowing-ford): o teste é NÃO PIORAR, nunca "zerar".
//
// As COSTURAS (openSeams, em explorer/explorerWorld.ts) atravessam toda carta colocada:
// N x5-7/y0-3 · S x5-7/y8-11 · W x0-3/y5-9 · E x8-11/y5-9 — 64 dos 144 tiles. Elas ABREM o que
// bloqueia e nada mais, então MATO E FLOR PASSAM por elas; o que não pode nascer ali é o que
// fecha (pinheiro, junco, pedra), porque a costura existe justamente para garantir a passagem.
//
//   node scripts/enrich-chunk-cards.mjs            # planta e grava
//   node scripts/enrich-chunk-cards.mjs --check    # só confere que o disco já é o ponto fixo
//   node scripts/enrich-chunk-cards.mjs --map      # despeja as cartas em ASCII

import fs from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

const COLS = 12;
const ROWS = 12;

// ── o atlas (forest_tile_set.png, 3 colunas) ────────────────────────────────────────────────
// Só os frames que este script planta. Os sólidos são o espelho de SOLID_UPPER_FRAMES: se um
// frame novo entrar lá e não aqui, a prova de BFS passa a mentir.
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40]);
const SEA_TILE = 33;

const GRASS_TUFT = 0; // o único capim que RESPONDE ao pisão (LOW_GRASS_TILE, no World3D)
const FLOWER_BUSH = 1;
const LOOSE_STICK = 2;
const DEAD_TREE = 3;
const PINE = 4;
const LEAF_A = 7;
const LEAF_B = 8;
const STICKS = 9;
const MUSHROOM_RED = 10;
const MUSHROOM_PURPLE = 11;
const BOULDER = 12;
const PEBBLES = 13;
const PINE_2 = 14;
const PINE_FRUIT = 15;
const PINE_FLOWER = 16;
const PINE_3 = 17;
const PINE_4 = 18;
const LEAF_C = 19;
const LEAF_D = 20;
const DEAD_TREE_2 = 21;

// Props que fecham o tile (a flor-da-lua fechada inclusive: ela só é passável ABERTA, e no escuro
// — perto de fogueira acesa ela é parede). Quem entra na prova de BFS como muro.
const BLOCKING_PROPS = new Set([
  'dryBush', 'dryTree', 'dryShrub', 'rock', 'ironRock', 'tallGrass', 'lava', 'water',
  'bridgeSpot', 'lockedDoor', 'swingGate', 'woodenCrate', 'moonflower', 'campfire',
  'carnivorousPlant', 'boiler', 'furnace', 'tripHammer', 'chest', 'toolbox', 'inserter',
  'extractor', 'waterWheel', 'electronicGate',
]);

// ── ruído determinístico ────────────────────────────────────────────────────────────────────

const hash01 = (x, y, seed) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const smooth = (t) => t * t * (3 - 2 * t);

/** Ruído de valor: um lattice grosso interpolado, que é o que faz a moita ter miolo e franja. */
const valueNoise = (x, y, seed, cell) => {
  const gx = Math.floor(x / cell); const gy = Math.floor(y / cell);
  const fx = smooth((x % cell) / cell); const fy = smooth((y % cell) / cell);
  const a = hash01(gx, gy, seed); const b = hash01(gx + 1, gy, seed);
  const c = hash01(gx, gy + 1, seed); const d = hash01(gx + 1, gy + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
};

/**
 * DUAS OITAVAS, e a segunda existe por um defeito medido: com um lattice só, uma fileira baixa do
 * lattice apagava uma FAIXA INTEIRA de 12 tiles de ponta a ponta da carta. Careca em faixa lê
 * pior que chão pelado — parece cortada. A oitava fina (célula 2) quebra a faixa sem desmanchar
 * a moita, que continua vindo da oitava grossa.
 */
const patchNoise = (x, y, seed, cell) => (
  0.64 * valueNoise(x, y, seed, cell) + 0.36 * valueNoise(x, y, seed + 911, 2)
);

// ── as paletas: o humor de cada terreno em três listas ───────────────────────────────────────
// `core` é o miolo da moita (o que floresce), `body` o corpo dela, `fringe` a franja.
const PALETTES = {
  meadow: { core: [FLOWER_BUSH, MUSHROOM_RED], body: [GRASS_TUFT, LEAF_C, LEAF_D, LEAF_A], fringe: [GRASS_TUFT, LEAF_B, LOOSE_STICK] },
  garden: { core: [FLOWER_BUSH, MUSHROOM_PURPLE, MUSHROOM_RED], body: [GRASS_TUFT, LEAF_C, LEAF_A, LEAF_D], fringe: [LEAF_B, GRASS_TUFT, LOOSE_STICK] },
  forest: { core: [MUSHROOM_PURPLE, MUSHROOM_RED, FLOWER_BUSH], body: [LEAF_C, LEAF_D, GRASS_TUFT, LEAF_A], fringe: [STICKS, LOOSE_STICK, LEAF_B, PEBBLES] },
  shore: { core: [FLOWER_BUSH, MUSHROOM_RED], body: [GRASS_TUFT, LEAF_A, LEAF_C], fringe: [PEBBLES, LEAF_B, LOOSE_STICK] },
  stone: { core: [LEAF_C], body: [LEAF_B, LEAF_A, GRASS_TUFT], fringe: [PEBBLES, BOULDER, LOOSE_STICK] },
  scorched: { core: [LEAF_B], body: [LEAF_B, LEAF_A], fringe: [STICKS, LOOSE_STICK, PEBBLES] },
  boneyard: { core: [MUSHROOM_PURPLE], body: [LEAF_C, LEAF_D, LEAF_B], fringe: [PEBBLES, STICKS, LOOSE_STICK] },
};

// ── as receitas, uma por carta ──────────────────────────────────────────────────────────────
// `cover` é a fração de tiles livres que ganham alguma coisa; `cell` o tamanho da moita em tiles
// (2 = pontilhado nervoso, 5 = manchas largas); `bloom` é a altura da moita a partir da qual ela
// FLORESCE (0,5 = metade do capim vira flor, 0,8 = só o miolo mais fundo). `trees` sorteia
// dentro das ZONAS autoradas — a
// intenção ("pinheiro no canto", "morto ao pé do paredão") é escrita, o tile exato vem do ruído.
// `props` é sempre mão: prop é peça de jogo, e peça de jogo se põe uma a uma.
const RECIPES = [
  {
    id: 'moonlit-lake',
    palette: 'shore', cover: 0.62, cell: 3, seed: 11, bloom: 0.68,
    // O junco cerca a água e as flores-da-lua ficam ABERTAS a noite inteira: esta é a única carta
    // sem fogueira nenhuma, então nada aqui fecha uma pétala.
    trees: { perZone: 2, frames: [PINE, PINE_2, PINE_3, PINE_4], zones: [[0, 0, 2, 2], [9, 0, 11, 2], [0, 9, 2, 11], [9, 9, 11, 11]] },
    props: [
      { type: 'moonflower', x: 1, y: 3 }, { type: 'moonflower', x: 10, y: 3 },
      { type: 'moonflower', x: 4, y: 10 }, { type: 'tallGrass', x: 1, y: 4 },
      { type: 'tallGrass', x: 10, y: 4 }, { type: 'rock', x: 2, y: 11 },
    ],
  },
  {
    id: 'whispering-forest',
    palette: 'forest', cover: 0.66, cell: 3, seed: 23, bloom: 0.7,
    // Mata fechada: o chão entre os troncos é serrapilheira e cogumelo, e as clareiras do meio
    // (y5/y6, a travessia) ficam com o capim baixo.
    props: [
      { type: 'dryShrub', x: 4, y: 2 }, { type: 'dryShrub', x: 4, y: 9 },
      { type: 'rock', x: 5, y: 4 }, { type: 'tallGrass', x: 6, y: 7 },
      // LENHA. A carta era uma mata inteira sem um graveto para dar: os pinheiros dela são TILES,
      // e tile só cai com o machado de aço (que ninguém tem no prólogo). Três árvores secas fazem
      // a floresta finalmente pagar o que ela promete na arte.
      { type: 'dryTree', x: 5, y: 5 }, { type: 'dryTree', x: 6, y: 6 },
      { type: 'dryTree', x: 4, y: 4 },
    ],
  },
  {
    id: 'spider-hollow',
    palette: 'forest', cover: 0.58, cell: 2, seed: 31, bloom: 0.74,
    // A cova é apertada de propósito (a aranha dá o bote em 3 tiles): nada de árvore aqui dentro,
    // só o mato em que ela se esconde.
    props: [
      { type: 'tallGrass', x: 3, y: 3 }, { type: 'tallGrass', x: 8, y: 3 },
      { type: 'dryShrub', x: 4, y: 6 },
    ],
  },
  {
    id: 'cat-cold-hearths',
    palette: 'meadow', cover: 0.62, cell: 4, seed: 43, bloom: 0.62,
    // A carta mansa: o gato, o fogo e o quintal florido em volta.
    trees: { perZone: 2, frames: [PINE_FLOWER, PINE_FRUIT, PINE_2, PINE], zones: [[0, 0, 3, 3], [8, 0, 11, 3], [0, 10, 4, 11], [7, 10, 11, 11]] },
    props: [
      { type: 'tallGrass', x: 1, y: 4 }, { type: 'tallGrass', x: 10, y: 4 },
      { type: 'moonflower', x: 4, y: 11 }, { type: 'rock', x: 9, y: 11 },
    ],
  },
  {
    id: 'crater-quarry',
    palette: 'stone', cover: 0.3, cell: 3, seed: 57,
    // Pedreira: a vegetação não passa da borda do pátio, e o que sobra no meio é entulho.
    //
    // Esta carta é a OFICINA do astronauta, e a lista de props abaixo é a cadeia do ferro inteira
    // posta no chão: veio (minério), rocha (pedra → o forno se faz de duas), a BANCADA em que
    // tudo se monta, e o mato seco que é a única fonte de CARVÃO do jogo — sem ele o forno não
    // reduz óxido nenhum e o pedido dele seria impossível de atender.
    trees: { perZone: 1, frames: [DEAD_TREE, DEAD_TREE_2], zones: [[0, 0, 1, 3], [10, 0, 11, 3], [0, 10, 3, 11], [8, 10, 11, 11]] },
    props: [
      { type: 'rock', x: 4, y: 3 }, { type: 'rock', x: 8, y: 11 },
      { type: 'ironRock', x: 1, y: 10 }, { type: 'ironRock', x: 10, y: 10 },
      // A bancada olha para o SUL (dir 2): as duas bandejas ficam ACIMA dela, entre ela e a
      // fogueira, e a saída cai na estrada que vem do sul — de frente para quem chega.
      { type: 'toolbox', x: 7, y: 7, dir: 2 },
      { type: 'dryBush', x: 2, y: 4 }, { type: 'dryBush', x: 4, y: 4 },
      { type: 'dryBush', x: 8, y: 4 }, { type: 'dryBush', x: 10, y: 4 },
    ],
  },
  {
    id: 'timber-ranks',
    palette: 'meadow', cover: 0.46, cell: 3, seed: 67, bloom: 0.74,
    // O pátio de madeira: as fileiras ganham uma terceira, e o capim cresce entre elas.
    trees: { perZone: 2, frames: [PINE_2, PINE_3], zones: [[0, 0, 1, 2], [10, 0, 11, 2]] },
    props: [
      { type: 'dryTree', x: 2, y: 10 }, { type: 'dryTree', x: 4, y: 10 },
      { type: 'dryTree', x: 8, y: 10 }, { type: 'dryTree', x: 10, y: 10 },
      { type: 'dryShrub', x: 3, y: 4 }, { type: 'dryShrub', x: 9, y: 4 },
    ],
  },
  {
    id: 'glowing-ford',
    palette: 'scorched', cover: 0.66, cell: 3, seed: 71,
    // Perto da lava nada verdeja: `keepAwayFrom` empurra a mata para longe do poço, e o que
    // sobra na beira é galho seco e cascalho.
    keepAwayFrom: { types: ['lava'], radius: 1 },
    trees: { perZone: 1, frames: [DEAD_TREE, DEAD_TREE_2], zones: [[0, 0, 1, 3], [0, 10, 3, 11], [10, 10, 11, 11]] },
    props: [
      { type: 'dryShrub', x: 0, y: 3 }, { type: 'dryShrub', x: 11, y: 10 },
      { type: 'rock', x: 0, y: 4 },
    ],
  },
  {
    id: 'painted-beds',
    palette: 'garden', cover: 0.72, cell: 4, seed: 83, bloom: 0.58,
    // A carta da pintora: aqui a flor não é um sotaque, é o assunto.
    trees: { perZone: 2, frames: [PINE_FLOWER, PINE_FRUIT], zones: [[0, 0, 1, 1], [10, 0, 11, 1], [0, 11, 2, 11]] },
    props: [
      { type: 'moonflower', x: 0, y: 4 }, { type: 'moonflower', x: 11, y: 4 },
      { type: 'moonflower', x: 4, y: 11 },
    ],
  },
  {
    id: 'roadside-pond',
    palette: 'shore', cover: 0.6, cell: 4, seed: 97, bloom: 0.72,
    // O açude do vendedor: junco na margem, flores no caminho e pinheiro fazendo sombra.
    trees: { perZone: 3, frames: [PINE, PINE_2, PINE_FRUIT, PINE_3], zones: [[6, 0, 11, 3], [0, 10, 4, 11], [8, 10, 11, 11]] },
    props: [
      { type: 'moonflower', x: 0, y: 2 }, { type: 'tallGrass', x: 4, y: 1 },
      { type: 'tallGrass', x: 2, y: 4 }, { type: 'tallGrass', x: 8, y: 4 },
      { type: 'rock', x: 4, y: 3 },
    ],
  },
  {
    id: 'singing-pines',
    palette: 'forest', cover: 0.64, cell: 3, seed: 103, bloom: 0.64,
    // Debaixo do pinheiro é agulha, cogumelo e sombra; a clareira do meio fica limpa para o verso.
    trees: { perZone: 2, frames: [PINE_FRUIT, PINE_FLOWER, PINE_4, PINE_2], zones: [[0, 0, 4, 0], [7, 0, 11, 0], [0, 11, 4, 11], [7, 11, 11, 11]] },
    props: [
      { type: 'tallGrass', x: 2, y: 4 }, { type: 'tallGrass', x: 9, y: 4 },
      { type: 'dryShrub', x: 4, y: 9 }, { type: 'rock', x: 6, y: 4 },
    ],
  },
  {
    id: 'silent-meadow',
    palette: 'meadow', cover: 0.82, cell: 5, seed: 109, bloom: 0.62,
    // A carta mais cara do baralho, e a que precisava mais disto: "o mato alto cresceu demais,
    // ceife". O capim tem de estar em toda parte para a foice significar alguma coisa.
    trees: { perZone: 1, frames: [PINE_FLOWER, PINE_FRUIT, PINE_2], zones: [[0, 0, 1, 1], [10, 0, 11, 1], [0, 11, 1, 11], [10, 11, 11, 11]] },
    props: [
      { type: 'tallGrass', x: 1, y: 2 }, { type: 'tallGrass', x: 10, y: 2 },
      { type: 'tallGrass', x: 1, y: 3 }, { type: 'tallGrass', x: 10, y: 3 },
      { type: 'tallGrass', x: 4, y: 4 }, { type: 'tallGrass', x: 7, y: 4 },
      { type: 'tallGrass', x: 4, y: 7 }, { type: 'tallGrass', x: 7, y: 7 },
      { type: 'tallGrass', x: 1, y: 10 }, { type: 'tallGrass', x: 10, y: 10 },
      { type: 'moonflower', x: 2, y: 11 },
    ],
  },
  {
    id: 'granite-pass',
    palette: 'stone', cover: 0.34, cell: 3, seed: 127,
    // O musgo e o cascalho ao pé dos paredões; o passo continua limpo.
    trees: { perZone: 1, frames: [DEAD_TREE, DEAD_TREE_2], zones: [[4, 3, 4, 4], [8, 2, 9, 3]] },
    props: [
      { type: 'rock', x: 8, y: 3 }, { type: 'rock', x: 4, y: 10 },
      { type: 'ironRock', x: 8, y: 10 },
    ],
  },
  {
    id: 'sunken-graveyard',
    palette: 'boneyard', cover: 0.52, cell: 3, seed: 149, bloom: 0.72,
    // Cemitério calçado: o verde só entra pela RACHADURA da laje, e o que floresce é cogumelo.
    trees: { perZone: 2, frames: [DEAD_TREE, DEAD_TREE_2], zones: [[0, 0, 2, 1], [9, 0, 11, 1], [0, 10, 2, 11], [9, 10, 11, 11]] },
    props: [
      { type: 'dryShrub', x: 4, y: 3 }, { type: 'dryShrub', x: 4, y: 10 },
      { type: 'dryTree', x: 2, y: 4 }, { type: 'dryTree', x: 9, y: 4 },
    ],
  },
  {
    id: 'blooming-grove',
    palette: 'garden', cover: 0.78, cell: 4, seed: 163, bloom: 0.54,
    // "Nada aqui morde; tudo cresce" — a carta barata que agora paga o preço dela em flor.
    trees: { perZone: 2, frames: [PINE_FLOWER, PINE_FRUIT, PINE_2, PINE_4], zones: [[0, 0, 4, 0], [7, 0, 11, 0]] },
    props: [
      { type: 'moonflower', x: 2, y: 4 }, { type: 'moonflower', x: 9, y: 4 },
      { type: 'moonflower', x: 5, y: 7 }, { type: 'tallGrass', x: 0, y: 2 },
      { type: 'tallGrass', x: 11, y: 2 },
      // O bosque também dá lenha: duas secas entre as vivas.
      { type: 'dryTree', x: 4, y: 5 }, { type: 'dryTree', x: 7, y: 6 },
    ],
  },
];

// ── as costuras, e o mapa de bloqueio ───────────────────────────────────────────────────────

/** Os tiles que openSeams (explorerWorld.ts) apaga em TODA carta colocada. */
const seamTiles = () => {
  const out = new Set();
  for (let i = 0; i < 4; i += 1) {
    for (let n = -1; n <= 1; n += 1) {
      for (const [x, y] of [
        [6 + n, i], [6 + n, ROWS - 1 - i], [i, 6 + n], [COLS - 1 - i, 6 + n], [i, 8 + n], [COLS - 1 - i, 8 + n],
      ]) {
        if (x >= 0 && y >= 0 && x < COLS && y < ROWS) out.add(`${x},${y}`);
      }
    }
  }
  return out;
};
const SEAMS = seamTiles();

/**
 * O mundo como a carta assenta: costuras abertas, tile sólido e prop sólido virando muro.
 * É este mapa — e não o desenho autorado — que a prova de BFS mede.
 */
const blockedMap = (chunk, props) => {
  const propAt = new Map(props.map((p) => [`${p.x},${p.y}`, p.type]));
  const out = [];
  for (let y = 0; y < ROWS; y += 1) {
    const row = [];
    for (let x = 0; x < COLS; x += 1) {
      const seam = SEAMS.has(`${x},${y}`);
      const upper = seam ? null : chunk.upper[y][x];
      const ground = seam ? 5 : chunk.ground[y][x];
      const prop = propAt.get(`${x},${y}`);
      row.push(
        ground === SEA_TILE
        || chunk.collisions[y][x]
        || (upper !== null && SOLID_UPPER.has(upper))
        || (prop !== undefined && BLOCKING_PROPS.has(prop)),
      );
    }
    out.push(row);
  }
  return out;
};

/** Da boca norte, tudo que se alcança andando em cruz. */
const reachable = (blocked) => {
  const seen = new Set();
  const start = [6, 0];
  if (blocked[0][6]) return seen; // a costura garante que não acontece; se acontecer, a prova falha
  seen.add('6,0');
  const queue = [start];
  while (queue.length > 0) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const key = `${nx},${ny}`;
      if (seen.has(key) || blocked[ny][nx]) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
};

const MOUTHS = [[6, 0], [6, ROWS - 1], [0, 7], [COLS - 1, 7]];

/**
 * O boletim de saúde de uma carta: quantos tiles livres ficaram órfãos, se as quatro bocas de
 * estrada continuam ligadas, e quantas coisas interativas estão ao alcance da mão. Um candidato
 * a árvore/prop só entra se NENHUM dos três piorar.
 */
const health = (chunk, props, interactive) => {
  const blocked = blockedMap(chunk, props);
  const seen = reachable(blocked);
  let orphans = 0;
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) if (!blocked[y][x] && !seen.has(`${x},${y}`)) orphans += 1;
  }
  const mouths = MOUTHS.filter(([x, y]) => seen.has(`${x},${y}`)).length;
  // Uma coisa com que se interage (NPC, item, fogueira, canteiro) está viva se ela mesma ou um
  // vizinho é alcançável: o herói age no tile À FRENTE, então encostar basta.
  const served = interactive.filter(({ x, y }) => (
    seen.has(`${x},${y}`)
    || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(`${x + dx},${y + dy}`))
  )).length;
  return { orphans, mouths, served };
};

const worse = (before, after) => (
  after.orphans > before.orphans || after.mouths < before.mouths || after.served < before.served
);

// ── a plantação ─────────────────────────────────────────────────────────────────────────────

const pick = (list, x, y, seed) => list[Math.floor(hash01(x, y, seed + 7919) * list.length) % list.length];

const main = async () => {
  const args = new Set(process.argv.slice(2));
  const checkOnly = args.has('--check');
  const showMap = args.has('--map');

  const target = fileURLToPath(new URL('../public/world.json', import.meta.url));
  const backup = fileURLToPath(new URL('../backup/world-pre-card-planting.json', import.meta.url));
  const original = await fs.readFile(target, 'utf8');
  const world = JSON.parse(original);

  const byId = new Map(world.chunks.filter((c) => c.catalog).map((c) => [c.catalog.id, c]));
  let plantedTiles = 0; let plantedTrees = 0; let plantedProps = 0; let rejected = 0;

  for (const recipe of RECIPES) {
    const chunk = byId.get(recipe.id);
    if (!chunk) { console.warn(`  ! carta ausente: ${recipe.id}`); continue; }
    const ox = chunk.cx * COLS;
    const oy = chunk.cy * ROWS;

    // O que já mora nesta carta, em coordenadas locais.
    const props = world.props
      .filter((p) => p.worldX >= ox && p.worldX < ox + COLS && p.worldY >= oy && p.worldY < oy + ROWS)
      .map((p) => ({ type: p.type, x: p.worldX - ox, y: p.worldY - oy }));
    const occupied = new Set(props.map((p) => `${p.x},${p.y}`));
    const interactive = [
      ...chunk.npcs.map((n) => ({ x: n.worldX - ox, y: n.worldY - oy })),
      ...chunk.pickups.map((p) => ({ x: p.worldX - ox, y: p.worldY - oy })),
      ...props.filter((p) => p.type === 'campfire' || p.type === 'plantSpot')
        .map((p) => ({ x: p.x, y: p.y })),
    ];
    for (const entry of [...chunk.npcs, ...chunk.pickups, ...chunk.enemies]) {
      occupied.add(`${entry.worldX - ox},${entry.worldY - oy}`);
    }

    const base = health(chunk, props, interactive);

    // 1. Props autorados — cada um sozinho contra o mapa inteiro.
    for (const spec of recipe.props ?? []) {
      const key = `${spec.x},${spec.y}`;
      if (occupied.has(key)) continue; // já há coisa aqui: idempotência, e nunca sobrescrever o autor
      if (BLOCKING_PROPS.has(spec.type) && SEAMS.has(key)) {
        console.warn(`  · ${recipe.id}: prop ${spec.type} em ${key} RECUSADO (é costura de estrada)`);
        rejected += 1;
        continue;
      }
      const candidate = [...props, { type: spec.type, x: spec.x, y: spec.y }];
      if (BLOCKING_PROPS.has(spec.type) && worse(base, health(chunk, candidate, interactive))) {
        console.warn(`  · ${recipe.id}: prop ${spec.type} em ${key} RECUSADO (fecharia caminho)`);
        rejected += 1;
        continue;
      }
      props.push({ type: spec.type, x: spec.x, y: spec.y });
      occupied.add(key);
      // `dir` é o COMPORTAMENTO de uma máquina (de que tile ela tira, em qual ela põe), não um
      // enfeite: uma bancada sem direção nasceria com as bandejas em cima de qualquer coisa.
      world.props.push(spec.dir === undefined
        ? { type: spec.type, worldX: ox + spec.x, worldY: oy + spec.y }
        : { type: spec.type, worldX: ox + spec.x, worldY: oy + spec.y, dir: spec.dir });
      plantedProps += 1;
    }

    // 2. Árvores — sorteadas dentro das zonas autoradas e provadas UMA A UMA contra o mapa inteiro.
    //
    //    `perZone` é um TOTAL, não um acréscimo: a zona termina com N tiles sólidos, contando os
    //    que já estavam lá. É o que torna o script um ponto fixo — a primeira versão pedia "6
    //    árvores nesta carta", e na segunda rodada as zonas já estavam cheias de MATO, então ela
    //    encontrava seis buracos novos e plantava seis árvores a mais, para sempre.
    //
    //    Por zona e não por carta: um sorteio global empilha tudo no canto que tirou os números
    //    mais altos, e a intenção escrita na receita ("um pinheiro em cada canto") vira um bosque
    //    num canto e três cantos vazios.
    const tree = recipe.trees;
    if (tree) {
      for (const [x0, y0, x1, y1] of tree.zones) {
        const spots = [];
        let standing = 0;
        for (let y = y0; y <= y1; y += 1) {
          for (let x = x0; x <= x1; x += 1) {
            const upper = chunk.upper[y][x];
            if (upper !== null && SOLID_UPPER.has(upper)) { standing += 1; continue; }
            if (SEAMS.has(`${x},${y}`) || occupied.has(`${x},${y}`)) continue;
            if (upper !== null || chunk.ground[y][x] === SEA_TILE) continue;
            spots.push({ x, y, roll: hash01(x, y, recipe.seed + 401) });
          }
        }
        spots.sort((a, b) => (b.roll - a.roll) || (a.y - b.y) || (a.x - b.x));
        for (const spot of spots) {
          if (standing >= tree.perZone) break;
          chunk.upper[spot.y][spot.x] = pick(tree.frames, spot.x, spot.y, recipe.seed);
          if (worse(base, health(chunk, props, interactive))) {
            chunk.upper[spot.y][spot.x] = null;
            rejected += 1;
            continue;
          }
          occupied.add(`${spot.x},${spot.y}`);
          standing += 1;
          plantedTrees += 1;
        }
        if (standing < tree.perZone) {
          console.warn(`  · ${recipe.id}: zona ${x0},${y0}-${x1},${y1} ficou com ${standing}/${tree.perZone} árvores`);
        }
      }
    }

    // 3. A decoração — nada disto bloqueia, então não passa pelo BFS: é pintura de chão.
    const palette = PALETTES[recipe.palette];
    const away = recipe.keepAwayFrom;
    const awaySpots = away
      ? props.filter((p) => away.types.includes(p.type)).map((p) => [p.x, p.y])
      : [];
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (chunk.upper[y][x] !== null) continue;      // o autor mandou aqui
        if (occupied.has(`${x},${y}`)) continue;       // prop/NPC/item/cova
        if (chunk.ground[y][x] === SEA_TILE) continue; // capim não flutua
        if (awaySpots.some(([px, py]) => Math.abs(px - x) <= away.radius && Math.abs(py - y) <= away.radius)) continue;
        // A soma de duas oitavas se aperta no meio (o teorema central do limite em ação), então o
        // corte e as duas fronteiras da moita moram em 0,5 ± algo, e não em 1 - cover.
        const t = patchNoise(x, y, recipe.seed, recipe.cell);
        const floor = 0.5 - 0.42 * recipe.cover;
        if (t < floor) continue;
        const rank = Math.min(1, (t - floor) / Math.max(0.08, 0.92 - floor));
        const list = rank > (recipe.bloom ?? 0.78) ? palette.core : rank > 0.2 ? palette.body : palette.fringe;
        chunk.upper[y][x] = pick(list, x, y, recipe.seed);
        plantedTiles += 1;
      }
    }

    if (showMap) {
      let decor = 0; let flowers = 0;
      for (const row of chunk.upper) {
        for (const f of row) {
          if (f === null || SOLID_UPPER.has(f)) continue;
          decor += 1;
          if (f === FLOWER_BUSH || f === MUSHROOM_RED || f === MUSHROOM_PURPLE) flowers += 1;
        }
      }
      console.log(`    ${recipe.id}: ${decor} decor (${flowers} flor) de 144`);
    }

    const after = health(chunk, props, interactive);
    const verdict = worse(base, after);
    if (verdict) {
      console.error(`FALHA em ${recipe.id}: ${JSON.stringify(base)} -> ${JSON.stringify(after)}`);
      process.exit(1);
    }
    if (showMap) dumpCard(recipe.id, chunk, props);
  }

  const next = `${JSON.stringify(world, null, 2)}\n`;

  // Comparação cega a fim de linha: no Windows o `core.autocrlf` devolve o arquivo em CRLF a cada
  // checkout, e um `--check` que olhasse os bytes acusaria "diverge" só por causa disso.
  const same = next.replace(/\r\n/gu, '\n') === original.replace(/\r\n/gu, '\n');

  if (checkOnly) {
    if (same) { console.log('OK: o world.json no disco já é o ponto fixo deste script.'); return; }
    console.error('DIVERGE: rodar o script mudaria o world.json (ele não está plantado, ou a receita mudou).');
    process.exit(1);
  }

  if (same) {
    console.log('Nada a fazer: as cartas já estão plantadas (ponto fixo).');
    return;
  }
  try {
    await fs.access(backup);
  } catch {
    await fs.copyFile(target, backup);
    console.log(`Backup: ${backup}`);
  }
  await fs.writeFile(target, next, 'utf8');
  console.log(
    `Plantado: ${plantedTiles} tiles de mato/flor, ${plantedTrees} árvores, ${plantedProps} props`
    + ` (${rejected} candidatos recusados pela prova de BFS).`,
  );
};

const dumpCard = (id, chunk, props) => {
  const propAt = new Map(props.map((p) => [`${p.x},${p.y}`, p.type[0].toUpperCase()]));
  console.log(`--- ${id}`);
  for (let y = 0; y < ROWS; y += 1) {
    let row = '';
    for (let x = 0; x < COLS; x += 1) {
      const p = propAt.get(`${x},${y}`);
      const u = chunk.upper[y][x];
      row += p ?? (u === null ? (SEAMS.has(`${x},${y}`) ? ',' : '.')
        : SOLID_UPPER.has(u) ? '#'
          : u === FLOWER_BUSH || u === MUSHROOM_RED || u === MUSHROOM_PURPLE ? '*'
            : u === PEBBLES || u === BOULDER || u === LOOSE_STICK || u === STICKS ? '-' : 'v');
    }
    console.log(`  ${row}`);
  }
};

await main();
