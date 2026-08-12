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
 * A ABERTURA são TRÊS cartas a 3 moedas — três caveiras, o que a estrada escura rende em dois
 * minutos de espada. As três custam o MESMO de propósito: a primeira decisão do jogo tem de ser
 * uma decisão, e uma carta ao alcance ao lado de duas trancadas não é escolher entre três coisas,
 * é escolher entre uma coisa e dois cadeados.
 *
 * DA QUARTA EM DIANTE A ESCADA SOBE DE UM EM UM (5, 6, 7, 8, 9, 10, 11, 13, 14), e o teto é a carta
 * final a 36 — quatro barras. A tabela inteira caiu para perto de um TERÇO do que era (a escada ia
 * de 16 a 36, com o fim a 90), e a razão não é generosidade: com a bolsa começando em zero e a
 * caveira pagando 1, cada preço é um pedaço de TEMPO do jogador, e a escada velha cobrava uma
 * fábrica montada antes da segunda decisão. O que se quer de um degrau é que ele custe mais uma
 * caveira que o anterior — não cinco vezes o anterior, que é uma parede com uma tarefa atrás.
 * O ferro continua sendo a moeda de verdade (o astronauta paga 9 por barra): uma carta comum é
 * meia barra a uma barra e meia, e o fim do prólogo continua exigindo a linha de produção.
 *
 * Quem lê este trio é a mão de abertura (`ExplorerDirector.offers`), e ela o lê pelo PREÇO: são as
 * três mais baratas do baralho, nunca uma lista de ids no código. Reprecificar uma carta aqui
 * troca a abertura sem que o código fique sabendo de nada.
 */
const COSTS = {
  'crater-quarry': 3,     // a oficina: a carta que ENSINA o jogo e paga por todas as outras
  'moonlit-lake': 3,      // as duas outras da abertura: uma água e um jardim, para que a escolha
  'blooming-grove': 3,    // de estreia seja de GOSTO — nenhuma delas é a certa
  // ...e daqui em diante a escada SOBE DE UM EM UM, do piso que a abertura estabeleceu. Ela ia de
  // 3 para 16 — seis vezes mais caro de uma vez, e o próprio comentário desta tabela chamava isso
  // de torto e pedia a reescrita a partir do novo piso. É esta. Um degrau que custa mais uma
  // caveira que o anterior é uma decisão de cada vez; um que custa cinco vezes o anterior é uma
  // parede com uma tarefa atrás.
  'roadside-pond': 5,
  'cat-cold-hearths': 5,
  'whispering-forest': 6,
  'timber-ranks': 7,
  'singing-pines': 7,
  'granite-pass': 8,
  'painted-beds': 9,
  'spider-hollow': 10,
  'sunken-graveyard': 11,
  'glowing-ford': 13,
  'silent-meadow': 14,
  'prologue-end': 36,     // quatro barras: o fim do prólogo se COMPRA, e o preço é a fábrica
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
 * O KIT DO LAGO — a carta que deixou de ser uma paisagem e virou uma OFICINA DE IDEIAS.
 *
 * O Lago é uma das três cartas de abertura (3 moedas), e até aqui ele era só bonito: água, três
 * flores da lua e capim. Uma das primeiras decisões do jogo não pode ser entre uma oficina e um
 * papel de parede — então ele ganhou as três coisas que fazem dele uma escolha de verdade:
 *
 *   1. **RENDA.** Três zoras vivendo na água. Eles pagam 3 moedas cada (AQUATIC_KILL_COINS, contra
 *      1 da caveira) e voltam sozinhos a cada ENEMY_RESPAWN_MS — é a única fonte de moeda que o
 *      jogador pode PROCURAR no mapa em vez de esperar na estrada. O preço é a posição: eles moram
 *      onde a espada não alcança de graça, e quem chega junto da água leva cusparada de gelo.
 *   2. **ENERGIA DE GRAÇA.** Uma roda d'água já montada e já girando, na borda oeste. Ela é a única
 *      usina que o jogador NÃO consegue fabricar (não há receita de roda), então vê-la funcionando
 *      é a diferença entre "existe eletricidade neste jogo" e "existe eletricidade e ela é minha".
 *   3. **O CONVITE.** Um pacote de cinco CABOS na grama ao lado dela — o suficiente para uma linha
 *      curta. Nada obriga a usá-los: é um "e se?" pousado no chão, que é a forma mais barata de um
 *      jogo sugerir um plano sem escrever um objetivo na tela.
 *
 * A roda fica FORA das faixas de estrada (openSeams limpa x0-3/x8-11 nas linhas 5-9 e x5-7 nas
 * colunas 0-3/8-11): uma peça sólida numa costura seria uma estrada fechada por decoração.
 */
const LAKE_KIT = {
  /** `zora` só nasce em água ABERTA — todos estes tiles são do lago, e nenhum é costura. */
  enemies: [
    { type: 'zora', x: 5, y: 4 },
    { type: 'zora', x: 8, y: 4 },
    { type: 'zora', x: 6, y: 6 },
  ],
  /**
   * O cabo nasce em PACOTE (spawnPackSize: 5) — um item no chão, cinco na mochila. São DOIS
   * pacotes: cinco fios fazem uma linha curta e dez fazem uma linha que atravessa a carta, e a
   * diferença entre as duas é a diferença entre "dá pra ligar a roda em alguma coisa" e "dá pra
   * escolher em QUE coisa" — que é o pensamento que este monte de cabo existe para provocar.
   */
  pickups: [
    { type: 'wire', x: 3, y: 2 },
    { type: 'wire', x: 4, y: 2 },
  ],
  props: [
    // A roda no tile de água (2,3): a leste, o sul e o norte dela são lago (é isso que a faz
    // girar), e o vizinho de cima, (2,2), é grama limpa — a ponta de terra em que o primeiro cabo
    // encosta. Sem esse vizinho a roda seria uma usina sem tomada.
    { type: 'waterWheel', x: 2, y: 3 },
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

// ── 3. o kit do lago ────────────────────────────────────────────────────────────────────────
const lake = world.chunks.find((chunk) => chunk.catalog?.id === 'moonlit-lake');
if (!lake) throw new Error('moonlit-lake não está no world.json');
const lakeOx = lake.cx * COLS;
const lakeOy = lake.cy * ROWS;
let lakeAdded = 0;
const lakeTaken = new Set([
  ...world.props
    .filter((p) => Math.floor(p.worldX / COLS) === lake.cx && Math.floor(p.worldY / ROWS) === lake.cy)
    .map((p) => `${p.worldX - lakeOx},${p.worldY - lakeOy}`),
  ...lake.pickups.map((p) => `${p.worldX - lakeOx},${p.worldY - lakeOy}`),
  ...lake.enemies.map((e) => `${e.worldX - lakeOx},${e.worldY - lakeOy}`),
]);
// A ÁGUA do lago é TERRENO (frame de chão), e não prop: quem valida um zora é o tile.
const LAKE_WATER = new Set([9, 12, 13, 26, 27, 28, 29, 30, 32, 33, 34, 35]);
const wet = (x, y) => LAKE_WATER.has(lake.ground[y][x]);
for (const enemy of LAKE_KIT.enemies) {
  if (lakeTaken.has(`${enemy.x},${enemy.y}`)) continue;
  if (!wet(enemy.x, enemy.y)) {
    console.warn(`  · lago: ${enemy.type} em ${enemy.x},${enemy.y} RECUSADO (não é água aberta)`);
    continue;
  }
  lake.enemies.push({ type: enemy.type, worldX: lakeOx + enemy.x, worldY: lakeOy + enemy.y });
  lakeTaken.add(`${enemy.x},${enemy.y}`);
  lakeAdded += 1;
}
for (const pickup of LAKE_KIT.pickups) {
  if (lakeTaken.has(`${pickup.x},${pickup.y}`)) continue;
  lake.pickups.push({ type: pickup.type, worldX: lakeOx + pickup.x, worldY: lakeOy + pickup.y });
  lakeTaken.add(`${pickup.x},${pickup.y}`);
  lakeAdded += 1;
}
for (const prop of LAKE_KIT.props) {
  if (lakeTaken.has(`${prop.x},${prop.y}`)) continue;
  if (prop.type === 'waterWheel' && !wet(prop.x, prop.y)) {
    console.warn(`  · lago: roda em ${prop.x},${prop.y} RECUSADA (o tile não é água)`);
    continue;
  }
  world.props.push({ type: prop.type, worldX: lakeOx + prop.x, worldY: lakeOy + prop.y });
  lakeTaken.add(`${prop.x},${prop.y}`);
  lakeAdded += 1;
}

// ── 4. a tabela de preços ───────────────────────────────────────────────────────────────────
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
console.log(`Kit da cratera: ${added} peça(s). Kit do lago: ${lakeAdded}. Preços atualizados: ${repriced}.`);
