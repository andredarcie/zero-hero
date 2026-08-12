// O PRÓLOGO — a economia inteira do construtor de mundo, escrita num lugar só.
//
// A bolsa passou a começar em ZERO (explorerRun/START_COINS), e isso transformou os preços das
// cartas de enfeite em REGRA: agora cada uma delas é um pedaço de tempo do jogador. Este script é
// a tabela desse tempo, mais as duas peças de mundo que ela exige para fechar:
//
//   1. **O PREÇO DE CADA CARTA**, medido numa moeda só: a BARRA DE FERRO, que o astronauta compra
//      por 9. A caveira que entra pela estrada escura paga 1 — então a primeira carta é uma
//      defesa de acampamento de dois minutos, e todas as outras são uma FÁBRICA.
//   2. **A OFICINA DO ASTRONAUTA**: a carta dele passa a trazer a cadeia inteira do ferro dentro
//      dela (machado, balde, lenha que rebrota, poça, bancada, veio, rocha e mato seco). Ela é a
//      primeira compra de propósito — é a carta que ENSINA o jogo e paga por todas as outras.
//   3. **A CARTA FINAL**, o fim do prólogo: a Morte esperando no meio de um adro de pedra. Cara o
//      bastante para que ninguém chegue nela sem montar a linha de produção.
//
// ⚠️ Este script ESCREVE os custos por cima do que houver no arquivo — ele é a tabela de balanço,
// não um enriquecimento. Mexeu num custo pelo /editor e quer manter? Mude a tabela aqui também,
// senão a próxima rodada devolve o número antigo. Todo o resto é idempotente por id: prop e carta
// só entram se ainda não existirem.
//
//   node scripts/add-prologue.mjs

import fs from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

const COLS = 12;
const ROWS = 12;
const GRASS = 5;
const STONE = 23;
const STONE_MOSS = 24;
const PINE = 4;
const PINE_FLOWER = 16;
const TOMB = 25;
const GRASS_TUFT = 0;
const FLOWER_BUSH = 1;
const LEAF_C = 19;
const LEAF_D = 20;

const grid = (value) => Array.from({ length: ROWS }, () => Array(COLS).fill(value));

/**
 * A TABELA DE PREÇOS, em barras de ferro (o astronauta paga 9 por barra).
 *
 * A escada é o argumento: a cratera custa 3 (três caveiras — a única carta que o dinheiro de
 * espada compra, e o preço mais barato que o baralho tem), e a partir dali todo preço é ferro. Uma
 * carta comum custa de uma a três barras; a última custa DEZ, que é a quantidade que ninguém junta
 * na mão sem pôr o martinete para bater.
 */
const COSTS = {
  'crater-quarry': 3,     // a oficina: a primeira compra, e a que paga todas as outras
  'moonlit-lake': 12,
  'blooming-grove': 14,
  'roadside-pond': 16,
  'cat-cold-hearths': 16,
  'whispering-forest': 18,
  'timber-ranks': 20,
  'singing-pines': 20,
  'granite-pass': 22,
  'painted-beds': 24,
  'spider-hollow': 26,
  'sunken-graveyard': 30,
  'glowing-ford': 34,
  'silent-meadow': 36,
  'prologue-end': 90,     // dez barras: o fim do prólogo se COMPRA, e o preço é a fábrica
};

/**
 * O KIT DA CRATERA — o que faltava para a cadeia do ferro existir de verdade num mapa só.
 *
 * Sem isto o prólogo tinha um fundo falso: o machado é fabricável (graveto + pedra) mas graveto só
 * sai de árvore CORTADA A MACHADO — circular, e portanto nenhuma madeira no mundo inteiro. Sem
 * madeira não há carvoaria, sem carvão não há esponja, sem esponja não há ferro, e sem ferro o
 * astronauta pede uma coisa que o jogo não sabe produzir.
 */
const CRATER_KIT = {
  pickups: [
    // O machado ao lado da picareta: as duas ferramentas do módulo dele, uma para pedra e outra
    // para madeira. É o que abre a bancada inteira.
    { type: 'axe', x: 3, y: 5 },
    // O balde: a caldeira ferve água, e sem ele a única energia do mapa seria impossível.
    { type: 'bucket', x: 3, y: 6 },
  ],
  props: [
    // SEIS árvores secas, e elas REBROTAM (TREE_REGROW_MS) — é daqui que sai a lenha da carvoaria,
    // e é por isso que a economia do ferro deixou de ter teto.
    //
    // Eram duas, e a conta não fechava: dez barras (a carta final) pedem dez carvões, dez carvões
    // pedem vinte gravetos, e com duas árvores dando um graveto cada isso eram dez rodadas de um
    // minuto de REBROTA — dez minutos parado olhando dois tocos. Com seis árvores e dois gravetos
    // por derrubada (TREE_STICK_YIELD), a mesma dez barras cabem em duas rebrotas.
    // Os CANDIDATOS estão em ordem de preferência e são mais que seis: cada um passa pela prova
    // de conectividade abaixo, e o primeiro que fecharia um canto é descartado em silêncio. Foi
    // exatamente o que aconteceu com (11,3) e (10,11) na primeira tentativa — duas árvores no
    // canto leste isolaram cinco tiles, e este script não tinha prova nenhuma para pegar isso.
    { type: 'dryTree', x: 1, y: 1 },
    { type: 'dryTree', x: 10, y: 1 },
    { type: 'dryTree', x: 2, y: 1 },
    { type: 'dryTree', x: 9, y: 2 },
    { type: 'dryTree', x: 0, y: 2 },
    { type: 'dryTree', x: 3, y: 3 },
    { type: 'dryTree', x: 9, y: 11 },
    { type: 'dryTree', x: 1, y: 3 },
    // A poça da cratera: água de degelo no fundo da bacia. Ela existe para o BALDE — a caldeira é
    // a única usina construível aqui (a roda d'água pede rio, e roda não se fabrica).
    { type: 'water', x: 0, y: 11 },
    { type: 'water', x: 1, y: 11 },
    { type: 'water', x: 2, y: 11 },
  ],
};

/**
 * A CARTA FINAL — o adro da Morte.
 *
 * Um círculo de pedra no meio do campo, a Morte parada no centro dele, túmulos e pinheiros
 * fechando a roda, e as quatro bocas de estrada abertas (a costura passa por cima de qualquer
 * coisa que feche caminho, então o desenho já nasce respeitando-as). Nenhum inimigo: esta carta
 * não é um lugar para lutar, é o lugar onde alguém agradece.
 */
const prologueEnd = () => {
  const ground = grid(GRASS);
  const upper = grid(null);
  // O adro: um disco de laje no meio, com musgo alternado.
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const d = Math.hypot(x - 5.5, y - 5.5);
      if (d <= 3.6) ground[y][x] = (x + y) % 2 === 0 ? STONE : STONE_MOSS;
    }
  }
  // A roda de túmulos, nas oito posições do relógio — e nunca nas faixas de estrada, que a
  // costura abriria de qualquer jeito (um túmulo apagado no assentamento seria trabalho jogado).
  for (const [x, y] of [[2, 2], [9, 2], [2, 9], [9, 9], [4, 1], [7, 1], [4, 10], [7, 10]]) {
    upper[y][x] = TOMB;
  }
  // Os pinheiros que fecham o horizonte, nos quatro cantos.
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [11, 0], [10, 0], [11, 1],
    [0, 11], [1, 11], [0, 10], [11, 11], [10, 11], [11, 10]]) {
    upper[y][x] = (x + y) % 3 === 0 ? PINE_FLOWER : PINE;
  }
  // O verde do adro: flor no anel de dentro, capim no de fora. Decoração não bloqueia nada.
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (upper[y][x] !== null) continue;
      const d = Math.hypot(x - 5.5, y - 5.5);
      if (d > 3.6 && d <= 5.2 && (x * 7 + y * 5) % 4 === 0) {
        upper[y][x] = (x + y) % 3 === 0 ? FLOWER_BUSH : (x % 2 === 0 ? LEAF_C : LEAF_D);
      } else if (d > 5.2 && (x * 3 + y * 7) % 3 === 0) {
        upper[y][x] = GRASS_TUFT;
      }
    }
  }
  return { ground, upper };
};

const PROLOGUE_CARD = {
  catalog: {
    id: 'prologue-end',
    name: "Death's Threshold",
    cost: COSTS['prologue-end'],
    cardImage: 'assets/environment/tilesets/forest_tile_set.png',
    description: 'A paved ring under old pines, and someone standing in the middle of it. The road ends here — for now.',
  },
  ...prologueEnd(),
  // A Morte no CENTRO exato do adro, de frente para quem chega pela estrada do sul.
  npcs: [{ type: 'death', x: 6, y: 6 }],
  // Duas fogueiras apagadas ladeando o adro: a última coisa que o prólogo ensina é que o mundo
  // se acende, e aqui o gesto é uma homenagem em vez de uma trava.
  //
  // Elas ficam a 4,5 tiles da Morte, e a distância é a razão de serem estas casas: um NPC com
  // fogueira APAGADA a menos de NPC_GATE_RADIUS_TILES (3,2) fala as linhas de MEDO em vez das
  // dele (gateDialog). O agradecimento do fim do prólogo atrás de um fogo que o jogador talvez
  // não tenha como acender seria a pior porta trancada do jogo.
  props: [{ type: 'campfire', x: 3, y: 2 }, { type: 'campfire', x: 8, y: 2 }],
  enemies: [],
  pickups: [],
};

const target = fileURLToPath(new URL('../public/world.json', import.meta.url));
const backup = fileURLToPath(new URL('../backup/world-pre-prologue.json', import.meta.url));
const world = JSON.parse(await fs.readFile(target, 'utf8'));

try {
  await fs.access(backup);
} catch {
  await fs.copyFile(target, backup);
  console.log(`Backup: ${backup}`);
}

// ── 1. a carta final ────────────────────────────────────────────────────────────────────────
const existing = new Set(world.chunks.map((chunk) => chunk.catalog?.id).filter(Boolean));
if (!existing.has(PROLOGUE_CARD.catalog.id)) {
  const cx = world.chunks.reduce((max, chunk) => Math.max(max, chunk.cx), -1) + 1;
  const ox = cx * COLS;
  world.chunks.push({
    cx,
    cy: 0,
    ground: PROLOGUE_CARD.ground,
    upper: PROLOGUE_CARD.upper,
    collisions: grid(false),
    enemies: [],
    pickups: [],
    npcs: PROLOGUE_CARD.npcs.map((npc) => ({ type: npc.type, worldX: ox + npc.x, worldY: npc.y })),
    catalog: PROLOGUE_CARD.catalog,
  });
  for (const prop of PROLOGUE_CARD.props) {
    world.props.push({ type: prop.type, worldX: ox + prop.x, worldY: prop.y });
  }
  world.meta.worldChunksX = world.chunks.reduce((max, chunk) => Math.max(max, chunk.cx), 0) + 1;
  console.log(`Carta final criada em cx=${cx}: ${PROLOGUE_CARD.catalog.name}`);
}

// ── 2. o kit da cratera ─────────────────────────────────────────────────────────────────────
const crater = world.chunks.find((chunk) => chunk.catalog?.id === 'crater-quarry');
if (!crater) throw new Error('crater-quarry não está no world.json');
const craterOx = crater.cx * COLS;
let added = 0;
const occupied = new Set([
  ...world.props
    .filter((p) => Math.floor(p.worldX / COLS) === crater.cx && Math.floor(p.worldY / ROWS) === crater.cy)
    .map((p) => `${p.worldX - craterOx},${p.worldY}`),
  ...crater.pickups.map((p) => `${p.worldX - craterOx},${p.worldY}`),
  ...crater.npcs.map((n) => `${n.worldX - craterOx},${n.worldY}`),
]);
for (const pickup of CRATER_KIT.pickups) {
  if (occupied.has(`${pickup.x},${pickup.y}`)) continue;
  crater.pickups.push({ type: pickup.type, worldX: craterOx + pickup.x, worldY: pickup.y });
  occupied.add(`${pickup.x},${pickup.y}`);
  added += 1;
}
// ── a prova de conectividade, e por que ela mora aqui ───────────────────────────────────────
// A lei da casa: "prop que bloqueia só entra com prova de BFS de que não selou caminho". Este
// script põe árvore, poça e bancada — tudo sólido — e não tinha prova nenhuma. Custou cinco tiles
// isolados no canto leste da cratera, e ninguém teria visto até comprar a carta no jogo.
const SEAM = (() => {
  const out = new Set();
  for (let i = 0; i < 4; i += 1) {
    for (let n = -1; n <= 1; n += 1) {
      for (const [x, y] of [
        [6 + n, i], [6 + n, ROWS - 1 - i], [i, 6 + n], [COLS - 1 - i, 6 + n],
        [i, 8 + n], [COLS - 1 - i, 8 + n],
      ]) if (x >= 0 && y >= 0 && x < COLS && y < ROWS) out.add(`${x},${y}`);
    }
  }
  return out;
})();
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40]);
const BLOCKING = new Set([
  'dryBush', 'dryTree', 'dryShrub', 'rock', 'ironRock', 'tallGrass', 'lava', 'water', 'moonflower',
  'campfire', 'toolbox', 'furnace', 'tripHammer', 'chest', 'boiler', 'woodenCrate', 'lockedDoor',
  'swingGate', 'carnivorousPlant', 'inserter', 'extractor', 'waterWheel', 'electronicGate',
]);
/** Tiles livres que NÃO se alcança a partir da boca norte, com as costuras já abertas. */
const orphanCount = (chunk, props) => {
  const at = new Map(props.map((p) => [`${p.x},${p.y}`, p.type]));
  const blocked = (x, y) => {
    const seam = SEAM.has(`${x},${y}`);
    const upper = seam ? null : chunk.upper[y][x];
    const ground = seam ? 5 : chunk.ground[y][x];
    const prop = at.get(`${x},${y}`);
    return ground === 33 || chunk.collisions[y][x]
      || (upper !== null && SOLID_UPPER.has(upper))
      || (prop !== undefined && BLOCKING.has(prop));
  };
  const seen = new Set(['6,0']);
  const queue = [[6, 0]];
  while (queue.length > 0) {
    const [x, y] = queue.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (seen.has(`${nx},${ny}`) || blocked(nx, ny)) continue;
      seen.add(`${nx},${ny}`);
      queue.push([nx, ny]);
    }
  }
  let orphans = 0;
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) if (!blocked(x, y) && !seen.has(`${x},${y}`)) orphans += 1;
  }
  return orphans;
};

const live = world.props
  .filter((p) => Math.floor(p.worldX / COLS) === crater.cx && Math.floor(p.worldY / ROWS) === crater.cy)
  .map((p) => ({ type: p.type, x: p.worldX - craterOx, y: p.worldY }));
let baseline = orphanCount(crater, live);
/** Quantas árvores secas a cratera deve TER (a lista de candidatos é maior de propósito). */
const DRY_TREE_TARGET = 6;
let planted = live.filter((p) => p.type === 'dryTree').length;
for (const prop of CRATER_KIT.props) {
  if (occupied.has(`${prop.x},${prop.y}`)) continue;
  if (prop.type === 'dryTree' && planted >= DRY_TREE_TARGET) continue;
  const candidate = [...live, { type: prop.type, x: prop.x, y: prop.y }];
  if (BLOCKING.has(prop.type) && orphanCount(crater, candidate) > baseline) {
    console.warn(`  · cratera: ${prop.type} em ${prop.x},${prop.y} RECUSADO (isolaria tiles)`);
    continue;
  }
  live.push({ type: prop.type, x: prop.x, y: prop.y });
  baseline = orphanCount(crater, live);
  world.props.push({ type: prop.type, worldX: craterOx + prop.x, worldY: prop.y });
  occupied.add(`${prop.x},${prop.y}`);
  if (prop.type === 'dryTree') planted += 1;
  added += 1;
}
if (orphanCount(crater, live) > 0) {
  console.error(`FALHA: a cratera ficou com ${orphanCount(crater, live)} tile(s) isolado(s).`);
  process.exit(1);
}

// ── 3. a tabela de preços ───────────────────────────────────────────────────────────────────
let repriced = 0;
for (const chunk of world.chunks) {
  const id = chunk.catalog?.id;
  if (!id || COSTS[id] === undefined || chunk.catalog.cost === COSTS[id]) continue;
  console.log(`  ${id}: ${chunk.catalog.cost} -> ${COSTS[id]}`);
  chunk.catalog.cost = COSTS[id];
  repriced += 1;
}
const missing = world.chunks.filter((c) => c.catalog && COSTS[c.catalog.id] === undefined);
if (missing.length > 0) {
  console.warn(`  ! sem preço na tabela: ${missing.map((c) => c.catalog.id).join(', ')}`);
}

await fs.writeFile(target, `${JSON.stringify(world, null, 2)}\n`, 'utf8');
console.log(`Kit da cratera: ${added} peça(s). Preços atualizados: ${repriced}.`);
