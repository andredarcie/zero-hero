// AS CARTAS DE TERRENO II — três cenários que estreiam as famílias de tiles que a biblioteca
// ainda não usava: a MONTANHA em cubo (39/40), o CEMITÉRIO inteiro (22/25/27/28/29-32) e os
// pinheiros de fruto/flor com a terra lavrável (14-18, 1, 19/20, 2/9, 6).
//
// Modelo enrich-*: este script LÊ public/world.json e ACRESCENTA — nunca refaz. Idempotente
// (um template só entra se o id ainda não existir), determinístico (zero Math.random, zero
// timestamp), e faz backup antes da primeira escrita.
//
// As costuras do runtime (openSeams) limpam as faixas de estrada em TODA carta colocada:
// N x5-7/y0-3 · S x5-7/y8-11 · W x0-3/y5-9 · E x8-11/y5-9. Nada essencial mora nelas — o que
// for pintado ali vira grama quando a carta assenta.

import fs from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

const COLS = 12;
const ROWS = 12;
const GRASS = 5;

const grid = (value) => Array.from({ length: ROWS }, () => Array(COLS).fill(value));

// ── Granite Pass — a montanha em cubo, e o morcego que é o único a ignorá-la ────────────────
// Quatro maciços de rocha (39, com musgo 40) nos cantos, um pátio de pedra (23/24) na
// encruzilhada e a trilha gasta na fiada norte. Pedras soltas (12/13) no pé dos paredões,
// rocha/ferro para a picareta — e dois morcegos, porque no chunk feito de parede a espécie
// certa é a que voa por cima dela.
const granitePass = () => {
  const ground = grid(GRASS);
  const upper = grid(null);
  const massifs = [
    // NW descendo em degraus            // NE espelhado, mais alto no canto
    [0, 0, 4], [1, 0, 4], [2, 0, 3], [3, 0, 2], [4, 0, 1],
    [0, 8, 11], [1, 8, 11], [2, 9, 11], [3, 10, 11], [4, 11, 11],
    // SW e SE, mais baixos: o sul é a saída fácil
    [10, 0, 2], [11, 0, 4],
    [10, 9, 11], [11, 8, 11],
  ];
  for (const [y, x0, x1] of massifs) {
    for (let x = x0; x <= x1; x += 1) upper[y][x] = (x * 7 + y * 3) % 5 === 0 ? 40 : 39;
  }
  // O pátio central e a trilha norte: o mesmo xadrez de pedra do cemitério, servindo de piso.
  for (let y = 4; y <= 7; y += 1) for (let x = 4; x <= 7; x += 1) ground[y][x] = (x + y) % 2 === 0 ? 23 : 24;
  for (let x = 2; x <= 9; x += 1) ground[4][x] = (x + 4) % 2 === 0 ? 23 : 24;
  // Pedras caídas (deitadas, atravessáveis) no pé dos maciços.
  for (const [x, y, frame] of [[2, 4, 13], [4, 2, 12], [9, 4, 12], [3, 10, 12], [8, 10, 13]]) upper[y][x] = frame;
  return { ground, upper };
};

// ── Sunken Graveyard — o cemitério inteiro de uma vez ───────────────────────────────────────
// Pátio de pedra (23/24) com lajes rachadas (29/30) e musgo (32); covas abertas (31) nos
// quatro cantos, ladeadas de túmulos (25); cabeças na estaca (22) marcando a encruzilhada;
// ossos (27/28) e árvores mortas (3/21) na cerca. Três covas abertas são pontos de spawn de
// undead — a cova desenhada É a cova que pare — e não há fogueira aqui de propósito: luz
// acesa calaria as covas.
const sunkenGraveyard = () => {
  const ground = grid(GRASS);
  const upper = grid(null);
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if ((x * 7 + y) % 13 === 0) ground[y][x] = 29;
      else if ((x + y * 7) % 17 === 0) ground[y][x] = 30;
      else if ((x * 3 + y * 5) % 11 === 0) ground[y][x] = 32;
      else ground[y][x] = (x + y) % 2 === 0 ? 23 : 24;
    }
  }
  for (const [x, y] of [[2, 2], [9, 2], [2, 10], [9, 10]]) ground[y][x] = 31;
  for (const [x, y] of [[1, 2], [3, 2], [8, 2], [10, 2], [1, 10], [3, 10], [8, 10], [10, 10]]) upper[y][x] = 25;
  for (const [x, y] of [[4, 4], [7, 4], [4, 7], [7, 7]]) upper[y][x] = 22;
  for (const [x, y, frame] of [[5, 4, 27], [6, 7, 28], [1, 4, 28], [10, 4, 27], [4, 8, 28]]) upper[y][x] = frame;
  for (const [x, y, frame] of [[0, 0, 3], [4, 0, 21], [11, 0, 21], [0, 4, 3], [11, 4, 21], [0, 11, 21], [11, 11, 3]]) {
    upper[y][x] = frame;
  }
  return { ground, upper };
};

// ── Blooming Grove — o pomar: as variantes de pinheiro e a terra que a pá aceita ───────────
// Quatro canteiros de terra lavrada (6 — chão que a PÁ cava, ao contrário da grama) com
// pinheiros de fruto (15), de flor (16) e as variantes 14/17/18/4 nos cantos, um arbusto
// florido (1) no meio de cada canteiro, e a serrapilheira (19/20) com gravetos caídos (2/9).
// Nenhum inimigo: é a carta barata e mansa do baralho.
const bloomingGrove = () => {
  const ground = grid(GRASS);
  const upper = grid(null);
  const beds = [[1, 3, 1, 3], [8, 10, 1, 3], [1, 3, 10, 11], [8, 10, 10, 11]];
  for (const [x0, x1, y0, y1] of beds) {
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) ground[y][x] = 6;
  }
  const pines = [
    [1, 1, 15], [3, 1, 16], [1, 3, 14], [3, 3, 17],
    [8, 1, 16], [10, 1, 15], [8, 3, 18], [10, 3, 4],
    [1, 10, 17], [3, 10, 15], [1, 11, 16], [3, 11, 14],
    [8, 10, 4], [10, 10, 16], [8, 11, 15], [10, 11, 18],
  ];
  for (const [x, y, frame] of pines) upper[y][x] = frame;
  for (const [x, y] of [[2, 2], [9, 2], [2, 10], [9, 10]]) upper[y][x] = 1;
  for (const [x, y, frame] of [[4, 1, 2], [2, 4, 19], [4, 3, 9], [9, 4, 20], [11, 4, 2], [4, 8, 19], [7, 7, 20], [4, 10, 9]]) {
    upper[y][x] = frame;
  }
  return { ground, upper };
};

const TERRAIN_CHUNKS = [
  {
    catalog: {
      id: 'granite-pass', name: 'Granite Pass', cost: 6,
      cardImage: 'assets/environment/tilesets/forest_tile_set.png',
      description: 'Standing granite no axe answers. Bats nest in the pass, and iron sleeps under the cliffs.',
    },
    ...granitePass(),
    enemies: [{ type: 'bat', x: 4, y: 8 }, { type: 'bat', x: 8, y: 4 }],
    props: [
      { type: 'rock', x: 3, y: 3 },
      { type: 'ironRock', x: 10, y: 4 },
      { type: 'rock', x: 4, y: 10 },
    ],
  },
  {
    catalog: {
      id: 'sunken-graveyard', name: 'Sunken Graveyard', cost: 8,
      cardImage: 'assets/environment/tilesets/forest_tile_set.png',
      description: 'A paved yard of tombs under dead trees. Three open graves have not finished being graves.',
    },
    ...sunkenGraveyard(),
    enemies: [{ type: 'undead', x: 2, y: 2 }, { type: 'undead', x: 9, y: 2 }, { type: 'undead', x: 9, y: 10 }],
    props: [],
  },
  {
    catalog: {
      id: 'blooming-grove', name: 'Blooming Grove', cost: 4,
      cardImage: 'assets/environment/tilesets/forest_tile_set.png',
      description: 'Fruit pines and flowering ones over soft dug earth. Nothing here bites; everything grows.',
    },
    ...bloomingGrove(),
    enemies: [],
    props: [],
  },
];

const target = fileURLToPath(new URL('../public/world.json', import.meta.url));
const backup = fileURLToPath(new URL('../backup/world-pre-terrain-cards.json', import.meta.url));
const world = JSON.parse(await fs.readFile(target, 'utf8'));

const existing = new Set(world.chunks.map((chunk) => chunk.catalog?.id).filter(Boolean));
let nextCx = world.chunks.reduce((max, chunk) => Math.max(max, chunk.cx), -1) + 1;
let added = 0;

try {
  await fs.access(backup);
} catch {
  await fs.copyFile(target, backup);
  console.log(`Backup: ${backup}`);
}

for (const def of TERRAIN_CHUNKS) {
  if (existing.has(def.catalog.id)) continue;
  const cx = nextCx;
  nextCx += 1;
  const ox = cx * COLS;
  world.chunks.push({
    cx,
    cy: 0,
    ground: def.ground,
    upper: def.upper,
    collisions: grid(false),
    enemies: def.enemies.map((e) => ({ type: e.type, worldX: ox + e.x, worldY: e.y })),
    pickups: [],
    npcs: [],
    catalog: def.catalog,
  });
  for (const prop of def.props) {
    world.props.push({ type: prop.type, worldX: ox + prop.x, worldY: prop.y });
  }
  added += 1;
}

world.meta.worldChunksX = world.chunks.reduce((max, chunk) => Math.max(max, chunk.cx), 0) + 1;

await fs.writeFile(target, `${JSON.stringify(world, null, 2)}\n`, 'utf8');
console.log(`Added ${added} terrain chunk templates (library now ${world.chunks.length} chunks).`);
