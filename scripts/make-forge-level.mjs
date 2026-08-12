// A FORJA — o level-4, e o único do jogo que ensina a cadeia do ferro inteira.
//
// Ele NÃO é gerado a partir de nada: é escrito à mão aqui, num caminho DESOCUPADO
// (`public/levels/level-4.json`), e o `index.json` é LIDO e acrescentado, nunca refeito. É a lei
// da casa — `generate:levels` sobrescreve sem merge e sem perguntar, e por isso não se usa.
//
// ── O que o level ensina, na ordem em que ele obriga ────────────────────────────────────────
//   1. A pedra vira PEDRA, e duas pedras viram um FORNO na bancada.
//   2. O veio vira MINÉRIO — que não é ferro, e sozinho não vira nada.
//   3. Minério + CARVÃO no forno viram uma ESPONJA.
//   4. Três marteladas (botão A) na esponja viram FERRO.
//   5. Dois ferros viram uma ENGRENAGEM; engrenagem + esponja viram o MARTINETE.
//   6. O martinete ligado na roda d'água martela sozinho — e é aí que o level acaba de dizer o
//      que tinha para dizer: **você automatizou exatamente o trabalho que acabou de fazer à mão.**
//   7. A porta não quer chave: quer DOIS FERROS no baú de encomenda.
//
// As máquinas vêm PRONTAS no chão (um depósito na fileira de baixo), e há três ESPONJAS já
// fundidas ao lado do spawn: o martinete tem de poder ser testado no primeiro minuto, sem passar
// por minerar-instalar-fundir antes. O level existe para mostrar
// a cadeia rodando, e obrigar a fabricar cada peça antes da primeira esponja enterraria a aula
// debaixo de vinte minutos de picareta. A bancada e as receitas continuam lá para quem quiser.
//
// E o depósito cria um GARGALO de propósito: a roda d'água dá 4 W, e um extrator (4) mais um
// martinete (3) já pedem 7. A fábrica arrasta na proporção exata — a caldeira e o balde são a
// resposta, e deixar arrastando também é uma escolha legítima.
//
// ── A prova de BFS ──────────────────────────────────────────────────────────────────────────
// A lei: "level com prop que bloqueia SÓ se escreve com prova de BFS". Este arquivo sai com erro
// (exit 1) se qualquer uma destas três coisas for falsa:
//   • com o portão FECHADO, o portal é inalcançável (senão a trava é decorativa);
//   • com o portão ABERTO, o portal é alcançável (senão o level é insolúvel para sempre);
//   • tudo que o jogador precisa tocar — bancada, veio, pedras, carvão, roda, baú — é alcançável.

import fs from 'node:fs';
import path from 'node:path';

const COLS = 12;
const ROWS = 12;
const GROUND = 5; // o mesmo chão liso do level-3

// ── O MAPA ────────────────────────────────────────────────────────────────────────────────────
const PLAYER_START = { worldX: 2, worldY: 9 };

const props = [
  // O LAR: a fogueira acesa mais próxima do spawn é a que o runtime acende sozinho.
  { type: 'campfire', worldX: 1, worldY: 9, lit: true },

  // A PEDRA — a picareta quebra, e duas pedras são o forno. É a única máquina da fábrica que não
  // leva metal, e é por isso que ela é a primeira coisa construível deste level.
  { type: 'rock', worldX: 1, worldY: 1 },
  { type: 'rock', worldX: 2, worldY: 1 },
  { type: 'rock', worldX: 1, worldY: 2 },

  // O VEIO — infinito, três picaretadas por bloco. Ele entrega MINÉRIO.
  { type: 'ironRock', worldX: 8, worldY: 1 },
  { type: 'ironRock', worldX: 9, worldY: 1 },
  { type: 'ironRock', worldX: 8, worldY: 2 },

  // Os arbustos secos: com um graveto aceso na fogueira eles queimam e às vezes deixam CARVÃO.
  // O level não depende disso (há carvão no chão), mas o caminho existe — e é ele que explica de
  // onde vem o carvão num mundo em que ninguém entrega nada.
  { type: 'dryBush', worldX: 1, worldY: 4 },
  { type: 'dryBush', worldX: 2, worldY: 4 },

  // A BANCADA, olhando pro leste: bandejas em (2,5) e (3,5), saída em (5,5).
  { type: 'toolbox', worldX: 4, worldY: 5, dir: 1 },

  // A USINA: a roda d'água (4 W) e o fio que leva a corrente até o meio do mapa. Uma roda banca
  // exatamente UM martinete (3 W) e sobra 1 — a promessa que o número faz.
  { type: 'water', worldX: 1, worldY: 6 },
  { type: 'waterWheel', worldX: 1, worldY: 7 },
  { type: 'wire', worldX: 2, worldY: 7 },
  { type: 'wire', worldX: 3, worldY: 7 },
  { type: 'wire', worldX: 4, worldY: 7 },
  { type: 'wire', worldX: 5, worldY: 7 },

  // A TRAVA: uma QUANTIDADE, nunca uma chave. O baú cobra dois ferros e publica o progresso; o
  // portão ligado ao mesmo nome sobe na proporção e só libera na última entrega.
  // O baú fica ACIMA do corredor, nunca dentro dele: ele é sólido, e a prova de BFS pegou a
  // primeira versão em que o próprio baú tapava a única porta que o portão deveria ser.
  { type: 'chest', worldX: 8, worldY: 9, variable: 'encomenda', quota: { kind: 'iron', count: 2 } },
  { type: 'electronicGate', worldX: 9, worldY: 10, variable: 'encomenda' },
  { type: 'levelPortal', worldX: 10, worldY: 10 },
];

// A parede que faz do portão a ÚNICA porta. Colisão pintada, e não rocha: rocha quebra na
// picareta, e o jogador tem uma no bolso desde o primeiro minuto.
const WALLS = [
  [9, 9], [10, 9], [11, 9],
  [9, 11],
];

const pickups = [
  { type: 'pickaxe', worldX: 3, worldY: 9 },

  // A CARVOARIA: oito carvões em fileira ao lado do fogo. A solução gasta cinco; a folga é rede
  // contra soft-lock, não generosidade — um level de demonstração que trava por um carvão
  // desperdiçado ensina a coisa errada.
  ...Array.from({ length: 8 }, (_, i) => ({ type: 'charcoal', worldX: 1 + i, worldY: 8 })),

  // O DEPÓSITO — todas as máquinas prontas no chão, numa prateleira que se lê de relance.
  //
  // Elas são de graça aqui de propósito: este level existe para MOSTRAR a cadeia rodando, e
  // obrigar a fabricar cada peça antes de ver a primeira esponja sair enterraria a aula debaixo
  // de vinte minutos de picareta. A bancada continua no mapa, e as receitas continuam valendo —
  // quem quiser forjar o próprio martinete ainda pode, e vai precisar ter martelado à mão antes.
  { type: 'furnace', worldX: 2, worldY: 10 },
  { type: 'tripHammer', worldX: 3, worldY: 10 },
  { type: 'extractor', worldX: 4, worldY: 10 },
  { type: 'inserter', worldX: 5, worldY: 10 },
  { type: 'chest', worldX: 6, worldY: 10 },
  // A CALDEIRA e o BALDE são a resposta ao gargalo que este depósito cria de propósito: a roda
  // dá 4 W, e um extrator (4) mais um martinete (3) já pedem 7. A fábrica inteira ARRASTA na
  // proporção exata — e é o jogador que decide se isso é um problema. Encostar a caldeira no fogo
  // e enchê-la de água resolve; deixar arrastando também é uma escolha legítima.
  { type: 'boiler', worldX: 7, worldY: 10 },
  { type: 'bucket', worldX: 8, worldY: 11 },

  // A LINHA: esteiras e cabo para ligar tudo isso.
  ...Array.from({ length: 4 }, (_, i) => ({ type: 'belt', worldX: 2 + i, worldY: 11 })),
  { type: 'wire', worldX: 6, worldY: 11 },
  { type: 'wire', worldX: 7, worldY: 11 },

  // Dois gravetos: a ponta solta para quem quiser acender uma tocha e fazer o próprio carvão.
  { type: 'wood', worldX: 1, worldY: 10 },
  { type: 'wood', worldX: 1, worldY: 11 },

  // ── A FILEIRA DE TESTE ──────────────────────────────────────────────────────────────────────
  // Três ESPONJAS prontas, ao lado do spawn. Elas existem para que o martinete possa ser testado
  // no primeiro minuto: sem elas, ver a máquina bater exige minerar (3 picaretadas), instalar o
  // forno e esperar uma fornada de 4 s — três etapas entre a vontade de testar e o teste.
  //
  // E três delas, não uma, porque a peça se prova de três jeitos diferentes: uma para martelar À
  // MÃO (e sentir o trabalho que a máquina vai tirar de você), uma para pôr na bigorna e ver o
  // malho cair, e uma para gastar errando — pôr uma esteira debaixo da bigorna, por exemplo, e
  // descobrir que a esponja foge antes do primeiro golpe.
  //
  // Elas ficam no CAMPO ABERTO de y=6, e nao ao lado do carvao: a primeira versao pos as tres
  // logo abaixo da fileira de carvao, e de cima os dois leem igual (dois calhaus escuros com
  // pontos quentes). O jogador varreu o mapa e nao as achou — estavam a tres tiles dele, na linha
  // de baixo do carvao. Aqui elas tem espaco proprio, e ficam justamente onde o martinete vai
  // morar: encostadas no cabo que sai da roda.
  { type: 'bloom', worldX: 6, worldY: 6 },
  { type: 'bloom', worldX: 7, worldY: 6 },
  { type: 'bloom', worldX: 8, worldY: 6 },

  // MINÉRIO já quebrado: alimenta o forno sem passar pela picareta. O veio continua no mapa para
  // quem quiser fazer o caminho inteiro.
  ...Array.from({ length: 4 }, (_, i) => ({ type: 'ore', worldX: 2 + i, worldY: 3 })),
  // Mais CABO: a rede sai da roda em y=7, e o martinete precisa encostar num fio. Com dois
  // pedaços só, onde ele pode morar já vinha decidido — e escolher o lugar é metade da peça.
  { type: 'wire', worldX: 6, worldY: 3 },
  { type: 'wire', worldX: 7, worldY: 3 },
];


// ── A PROVA ──────────────────────────────────────────────────────────────────────────────────
// Quem BLOQUEIA o herói. A lista é conservadora de propósito: se um prop novo entrar aqui sem ser
// classificado, a prova reprova por excesso — que é o lado seguro de errar.
const SOLID = new Set([
  'rock', 'ironRock', 'toolbox', 'waterWheel', 'chest', 'campfire', 'water', 'dryBush', 'furnace',
  'tripHammer', 'boiler', 'lockedDoor', 'swingGate', 'dryTree', 'dryShrub',
]);

const key = (x, y) => `${x},${y}`;

const blockedSet = (gateClosed) => {
  const blocked = new Set(WALLS.map(([x, y]) => key(x, y)));
  for (const p of props) {
    if (p.type === 'electronicGate') {
      if (gateClosed) blocked.add(key(p.worldX, p.worldY));
      continue;
    }
    if (SOLID.has(p.type)) blocked.add(key(p.worldX, p.worldY));
  }
  return blocked;
};

const reachable = (gateClosed) => {
  const blocked = blockedSet(gateClosed);
  const seen = new Set([key(PLAYER_START.worldX, PLAYER_START.worldY)]);
  const queue = [[PLAYER_START.worldX, PLAYER_START.worldY]];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const k = key(nx, ny);
      if (seen.has(k) || blocked.has(k)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return seen;
};

/** Um prop sólido se USA do lado: basta um vizinho ortogonal alcançável. */
const usable = (open, x, y) => [[0, -1], [1, 0], [0, 1], [-1, 0]]
  .some(([dx, dy]) => open.has(key(x + dx, y + dy)));

const fail = (msg) => { console.error(`FALHA: ${msg}`); process.exitCode = 1; };

/** Fora da grade nao e "bloqueado": e inexistente, e a mensagem tem de dizer isso. */
const inBounds = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
for (const list of [props, pickups]) {
  for (const e of list) {
    if (!inBounds(e.worldX, e.worldY)) {
      fail(`${e.type} em ${e.worldX},${e.worldY} esta FORA do mapa (a grade e ${COLS}x${ROWS}, 0..${COLS - 1})`);
    }
  }
}
if (!inBounds(PLAYER_START.worldX, PLAYER_START.worldY)) fail('o spawn esta fora do mapa');
for (const [x, y] of WALLS) {
  if (!inBounds(x, y)) fail(`parede em ${x},${y} esta fora do mapa`);
}

const closed = reachable(true);
const open = reachable(false);
const portal = props.find((p) => p.type === 'levelPortal');

if (closed.has(key(portal.worldX, portal.worldY))) {
  fail('com o portão FECHADO o portal é alcançável — a trava é decorativa');
}
if (!open.has(key(portal.worldX, portal.worldY))) {
  fail('com o portão ABERTO o portal continua inalcançável — o level é insolúvel');
}
if (!closed.has(key(PLAYER_START.worldX, PLAYER_START.worldY))) {
  fail('o spawn está dentro de uma parede');
}
for (const p of props) {
  if (p.type === 'levelPortal' || p.type === 'electronicGate') continue;
  if (SOLID.has(p.type)) {
    if (!usable(closed, p.worldX, p.worldY)) fail(`${p.type} em ${p.worldX},${p.worldY} é inalcançável`);
  } else if (!closed.has(key(p.worldX, p.worldY))) {
    fail(`${p.type} em ${p.worldX},${p.worldY} é inalcançável`);
  }
}
for (const it of pickups) {
  if (!closed.has(key(it.worldX, it.worldY))) fail(`o item ${it.type} em ${it.worldX},${it.worldY} é inalcançável`);
}
// A bancada só serve se as DUAS bandejas e a saída forem pisáveis: é onde o jogador larga carga.
const bench = props.find((p) => p.type === 'toolbox');
for (const [bx, by, what] of [
  [bench.worldX - 2, bench.worldY, 'bandeja de trás'],
  [bench.worldX - 1, bench.worldY, 'bandeja da frente'],
  [bench.worldX + 1, bench.worldY, 'saída'],
]) {
  if (!closed.has(key(bx, by))) fail(`a ${what} da bancada (${bx},${by}) está bloqueada`);
}
if (process.exitCode === 1) process.exit(1);

// ── O ARQUIVO ────────────────────────────────────────────────────────────────────────────────
const ground = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => GROUND));
const upper = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
const collisions = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => false));
for (const [x, y] of WALLS) collisions[y][x] = true;

const level = {
  meta: {
    name: 'A Forja',
    schemaVersion: 1,
    worldChunksX: 1,
    worldChunksY: 1,
    chunkColumns: COLS,
    chunkRows: ROWS,
    tileSize: 8,
    tilesetKey: 'forest-tileset',
    playerStart: PLAYER_START,
    puzzle: true,
    exportedAt: new Date().toISOString(),
  },
  chunks: [{ cx: 0, cy: 0, ground, upper, collisions, enemies: [], pickups, npcs: [] }],
  props,
  dialogs: {},
  globalVariables: { encomenda: false },
};

const out = path.join('public', 'levels', 'level-4.json');
fs.writeFileSync(out, `${JSON.stringify(level, null, 2)}\n`);

// O index é LIDO e acrescentado. Nunca refeito: ele é a lista de autoria de todos os levels.
const indexPath = path.join('public', 'levels', 'index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const entry = {
  id: 'level-4',
  file: 'level-4.json',
  name: 'A Forja',
  blurb: 'Minério não é ferro. Queime-o com carvão, malhe a esponja — e construa a máquina que malha por você.',
};
const at = index.findIndex((e) => e.id === entry.id);
if (at >= 0) index[at] = entry; else index.splice(3, 0, entry);
fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);

console.log(`ok: ${out} (${props.length} props, ${pickups.length} itens)`);
console.log(`   portão fechado: ${closed.size} tiles alcançáveis · aberto: ${open.size}`);
