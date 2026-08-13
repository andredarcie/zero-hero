// AS TRÊS AULAS DO GATO — machado, tocha e picareta, cada uma numa tela só.
//
// Elas saem daqui em DOIS formatos, de uma fonte de verdade só:
//   • `public/levels/level-5|6|7.json` — a sala fechada, com portal no fim. É onde a aula é uma
//     PROVA: a parede é a única porta, e a prova de BFS abaixo recusa o arquivo se ela deixar de
//     ser.
//   • três cartas novas em `public/world.json` — a mesma aula, comprável no baralho. É onde ela
//     tem ECONOMIA: o inimigo paga ao cair, e o balcão do gato compra o que a ferramenta produz.
//
// Por que as duas: moeda só existe na AVENTURA (o `ExplorerHud` só nasce com o construtor de
// chunks rodando), então num level a recompensa em ouro não teria onde aparecer. E a trava de
// ferramenta só pode ser obrigatória num LEVEL, porque numa carta as quatro estradas da costura
// sempre dão a volta. Uma forma só perderia metade da aula.
//
// ── AS FALAS ─────────────────────────────────────────────────────────────────────────────────
// O gato diz o NOME da ferramenta, a TECLA, o ALVO e o que SAI daquilo. Ele não insinua: uma aula
// que precisa ser decifrada é a mesma parede que a parede já é.
//
// Cada aula tem o roteiro DELA (`npcs[].dialog`, ver WorldNpcSpawn). Sem isso as três dividiriam a
// fala da espécie — e pior: o `en.json` tem uma entrada `blackCat` que ganha de qualquer texto
// escrito no arquivo do mundo (é por isso que as cinco falas do gato no level-1 são texto morto).
//
// ── A PROVA DE BFS ───────────────────────────────────────────────────────────────────────────
// Sai com erro (exit 1) se qualquer uma for falsa, para as três aulas e nos dois formatos:
//   • com a parede DE PÉ, o bolso é inalcançável — senão a trava é decorativa;
//   • com a parede DERRUBADA, o bolso (e o portal dentro dele) é alcançável — senão é insolúvel;
//   • a ferramenta, o gato, a fogueira e todo item solto são alcançáveis com a parede de pé;
//   • toda peça da parede pode ser atacada de um tile alcançável;
//   • e, na CARTA, as quatro bocas de estrada continuam se alcançando — nenhuma carta pode fechar
//     a estrada para as vizinhas.
//
//   node scripts/make-cat-lessons.mjs

import fs from 'node:fs';
import path from 'node:path';

const COLS = 12;
const ROWS = 12;
const GRASS = 5;

// Decoração — nada disto bloqueia (ver SOLID_UPPER_FRAMES): tufo de capim e folhagem baixa.
const DECOR = [0, 1, 19, 20];

// ── AS DUAS GEOMETRIAS ───────────────────────────────────────────────────────────────────────
//
// Elas são diferentes, e a diferença NÃO é gosto: é o que cada formato deixa fazer.
//
// Num LEVEL não há costura nenhuma, então a parede pode atravessar a tela inteira e ser a única
// porta. É a forma mais legível que existe — o herói nasce embaixo dela, com a ferramenta no pé e
// o prêmio do outro lado. Uma linha reta, e um problema que se lê sem ler nada.
//
// Numa CARTA o meio pertence às quatro estradas (`openSeams`), e um sólido em cima delas é uma
// carta que SELA o mundo. Lá a parede só pode fechar um CANTO, e a aula deixa de ser obrigatória
// para ser desejável: dá para atravessar a carta sem tocar nela, mas não dá para levar o que ela
// guarda. A primeira versão usou a forma da carta nos dois, e a foto do mapa mostrou o problema —
// uma parede no canto superior direito com o gato no canto oposto: dois assuntos distantes em vez
// de um só.
const GEOS = {
  level: {
    start: { worldX: 6, worldY: 9 },
    cat: { x: 4, y: 9 },
    tool: { x: 6, y: 8 },      // entre o herói e a parede: o caminho do olho é o da mão
    campfire: { x: 2, y: 9 },
    portal: { x: 6, y: 1 },
    spare: { x: 5, y: 10 },    // o item sobressalente (o graveto de reserva)
    // A LINHA INTEIRA, de borda a borda. Onze tiles seriam uma parede com uma fresta na ponta, e
    // a fresta transforma a aula inteira em opcional.
    barrier: Array.from({ length: COLS }, (_, x) => [x, 6]),
    pocket: (x, y) => y <= 5,
    prizes: [[3, 2], [9, 2]],
    enemies: [[2, 4], [10, 4], [6, 3]],
    fuel: [[1, 2], [2, 2], [10, 2], [11, 2], [1, 4]],
    veins: [[2, 8], [10, 8]],
  },
  card: {
    start: null,               // numa carta o herói entra por onde quiser: quem manda é a estrada
    cat: { x: 4, y: 4 },
    tool: { x: 4, y: 5 },
    campfire: { x: 3, y: 3 },
    portal: null,              // uma carta não termina: portal é o fim de um level
    spare: { x: 3, y: 5 },
    /** O L que fecha o canto nordeste. Fora de toda costura — ver o cabeçalho. */
    barrier: [
      [8, 0], [8, 1], [8, 2], [8, 3], [8, 4],
      [9, 4], [10, 4], [11, 4],
    ],
    pocket: (x, y) => x >= 9 && y <= 3,
    prizes: [[10, 0], [10, 3]],
    enemies: [[9, 1], [11, 2]],
    fuel: [[11, 1], [9, 3], [11, 3]],
    veins: [[4, 2], [4, 7]],
  },
};

/** As quatro bocas de estrada, uma tile de amostra cada (ver openSeams em explorerWorld.ts). */
const ROAD_MOUTHS = { norte: [6, 0], sul: [6, 11], oeste: [0, 6], leste: [11, 6] };

const pocketTiles = (geo) => {
  const out = [];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) if (geo.pocket(x, y)) out.push([x, y]);
  }
  return out;
};

// ── AS TRÊS AULAS ────────────────────────────────────────────────────────────────────────────
// Cada uma diz o QUE tem, nunca ONDE: o onde é da geometria, e é o que deixa a mesma aula caber
// numa sala fechada e num canto de carta sem ser escrita duas vezes.
const LESSONS = [
  {
    level: 5,
    cardId: 'cat-woodpile',
    cardName: "Cat's Woodpile",
    cardCost: 4,
    levelName: 'O Machado',
    blurb: 'Uma parede de madeira morta, um machado ao pé do gato, e ferro do outro lado.',
    description: 'A cat, an axe, and a quiet wall of dead wood with iron behind it.',
    dialogId: 'catAxe',
    barrierProp: 'dryTree',
    tool: 'axe',
    // SEM INIMIGO NENHUM. As três aulas são PUZZLE, e terra de puzzle é 100% pacífica — nem o
    // cerco entra por ela, nem ela autora um corpo. A primeira versão punha duas caveiras atrás da
    // parede como "o ouro por conseguir passar"; o prêmio agora são as barras de ferro, que o gato
    // compra no balcão. Uma aula não se interrompe.
    counts: { prizes: 2, enemies: 0, fuel: 0, veins: 0, spare: null },
    dialog: {
      npcName: 'CAT',
      npcColorHex: '#cc99ff',
      npcAssetKey: 'npcs',
      npcFrame: 0,
      voice: { freq: 540, wave: 'triangle' },
      lines: [
        { speaker: 'npc', text: 'Mrrow. Dead wood. Your sword will not move it — a blade cuts what bleeds.' },
        { speaker: 'npc', text: 'The AXE is at my feet. Take it, face a dead tree, and press X. Four swings and it comes down.' },
        { speaker: 'npc', text: 'A felled tree leaves a STICK behind. Keep every one of them: a stick is a torch that has not met fire yet.' },
        { speaker: 'npc', text: 'Behind that wall there is iron, and nothing guarding it. Nothing walks in here. Take your time. Mrrow.' },
      ],
    },
  },
  {
    level: 6,
    cardId: 'cat-kindling',
    cardName: "Cat's Kindling",
    cardCost: 5,
    levelName: 'A Tocha',
    blurb: 'Arbusto seco não se corta: queima. E o fogo anda sozinho de vizinho em vizinho.',
    description: 'A lit hearth, a stick, and dry brush that only fire will open.',
    dialogId: 'catTorch',
    barrierProp: 'dryBush',
    tool: 'wood',
    // O sobressalente: a tocha APAGA sozinha (torchFuelMs), e uma aula que trava porque a chama
    // morreu a meio caminho ensina a coisa errada.
    counts: { prizes: 1, enemies: 0, fuel: 5, veins: 0, spare: 'wood' },
    trade: {
      item: 'charcoal',
      coinsPerUnit: 2,
      offer: 'Charcoal. I will take it off your hands — two coins the lump. How many?',
      empty: 'Your hands are empty. Burn some brush and come back.',
      thanks: 'Mrrow. Pleasure doing business.',
    },
    dialog: {
      npcName: 'CAT',
      npcColorHex: '#cc99ff',
      npcAssetKey: 'npcs',
      npcFrame: 0,
      voice: { freq: 540, wave: 'triangle' },
      lines: [
        { speaker: 'npc', text: 'Mrrow. My hearth is lit. Yours is a stick on the ground.' },
        { speaker: 'npc', text: 'Take the STICK. Face my fire and press X: it wakes as a TORCH. It burns for a while and then it dies — come back and light it again.' },
        { speaker: 'npc', text: 'Dry brush cannot be chopped. It BURNS. Touch one with the torch and the fire walks to its neighbours on its own.' },
        { speaker: 'npc', text: 'Burnt brush leaves CHARCOAL on the ground. Bring it to me and I pay in coin — talk to me again when your hands are full.' },
      ],
    },
  },
  {
    level: 7,
    cardId: 'cat-quarry',
    cardName: "Cat's Quarry",
    cardCost: 6,
    levelName: 'A Picareta',
    blurb: 'Pedra não queima e não se corta: quebra. E a pedra de veio nunca abre — ela PRODUZ.',
    description: 'A cat, a pickaxe, a wall of stone and two veins that never run dry.',
    dialogId: 'catPick',
    barrierProp: 'rock',
    tool: 'pickaxe',
    // Os VEIOS ficam FORA do bolso de propósito: o minério é a aula, e ela não pode estar trancada
    // atrás da parede que ela mesma abre.
    counts: { prizes: 2, enemies: 0, fuel: 0, veins: 2, spare: null },
    trade: {
      item: 'ore',
      coinsPerUnit: 3,
      offer: 'Ore. Rust-stained rock. Three coins apiece — how many?',
      empty: 'Nothing in your hands. Work a vein and come back.',
      thanks: 'Mrrow. Pleasure doing business.',
    },
    dialog: {
      npcName: 'CAT',
      npcColorHex: '#cc99ff',
      npcAssetKey: 'npcs',
      npcFrame: 0,
      voice: { freq: 540, wave: 'triangle' },
      lines: [
        { speaker: 'npc', text: 'Mrrow. Stone does not burn and it does not chop. It BREAKS.' },
        { speaker: 'npc', text: 'The PICKAXE is at my feet. Face a rock, press X, and press it again. The rock opens and leaves a STONE where it stood.' },
        { speaker: 'npc', text: 'The boulders with red veins never open. Every three blows they spit out ORE instead — and they never run dry.' },
        { speaker: 'npc', text: 'Ore is not iron. That is a lesson for a hotter day. Bring the ORE to me and I pay in coin.' },
      ],
    },
  },
];

// ── O QUE CADA AULA VIRA NUMA GEOMETRIA ──────────────────────────────────────────────────────
const layout = (lesson, geo) => {
  const n = lesson.counts;
  const props = [
    { type: 'campfire', x: geo.campfire.x, y: geo.campfire.y, lit: true },
    ...geo.barrier.map(([x, y]) => ({ type: lesson.barrierProp, x, y })),
    ...geo.fuel.slice(0, n.fuel).map(([x, y]) => ({ type: 'dryBush', x, y })),
    ...geo.veins.slice(0, n.veins).map(([x, y]) => ({ type: 'ironRock', x, y })),
  ];
  if (geo.portal) props.push({ type: 'levelPortal', x: geo.portal.x, y: geo.portal.y });
  const pickups = [
    { type: lesson.tool, x: geo.tool.x, y: geo.tool.y },
    ...geo.prizes.slice(0, n.prizes).map(([x, y]) => ({ type: 'iron', x, y })),
  ];
  if (n.spare) pickups.push({ type: n.spare, x: geo.spare.x, y: geo.spare.y });
  const enemies = geo.enemies.slice(0, n.enemies).map(([x, y]) => ({ type: 'undead', x, y }));
  return { props, pickups, enemies };
};

// ── A PROVA ──────────────────────────────────────────────────────────────────────────────────
// Quem BLOQUEIA o herói. Conservador de propósito: um prop novo que não estiver aqui reprova por
// excesso, que é o lado seguro de errar.
const SOLID = new Set([
  'rock', 'ironRock', 'dryTree', 'dryBush', 'dryShrub', 'campfire', 'water',
  'toolbox', 'furnace', 'chest', 'waterWheel', 'lockedDoor', 'swingGate',
]);

const key = (x, y) => `${x},${y}`;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS;

let failed = false;
const fail = (msg) => { console.error(`FALHA: ${msg}`); failed = true; };

const flood = (from, blocked) => {
  const seen = new Set([key(from[0], from[1])]);
  const queue = [from];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const k = key(nx, ny);
      if (seen.has(k) || blocked.has(k)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return seen;
};

const blockedSet = (plan, geo, withBarrier) => {
  const blocked = new Set();
  const wall = new Set(geo.barrier.map(([x, y]) => key(x, y)));
  for (const p of plan.props) {
    if (!SOLID.has(p.type)) continue;
    if (!withBarrier && wall.has(key(p.x, p.y))) continue; // a parede caiu
    blocked.add(key(p.x, p.y));
  }
  blocked.add(key(geo.cat.x, geo.cat.y)); // o NPC ocupa o tile dele (isSolidForEntities)
  return blocked;
};

const proof = (lesson, geoName) => {
  const geo = GEOS[geoName];
  const plan = layout(lesson, geo);
  const tag = `${lesson.cardId}/${geoName}`;
  // Numa carta não há spawn: o herói entra pela estrada, então a prova parte da boca sul.
  const from = geo.start ? [geo.start.worldX, geo.start.worldY] : ROAD_MOUTHS.sul;
  const closed = flood(from, blockedSet(plan, geo, true));
  const open = flood(from, blockedSet(plan, geo, false));

  for (const [x, y] of pocketTiles(geo)) {
    if (closed.has(key(x, y))) {
      fail(`${tag}: o bolso (${x},${y}) é alcançável com a parede DE PÉ — a trava é decorativa`);
      break;
    }
  }
  if (geo.portal && !open.has(key(geo.portal.x, geo.portal.y))) {
    fail(`${tag}: com a parede derrubada o portal continua inalcançável — insolúvel`);
  }
  if (!closed.has(key(geo.tool.x, geo.tool.y))) fail(`${tag}: a ferramenta é inalcançável`);
  const usable = (set, x, y) => [[0, -1], [1, 0], [0, 1], [-1, 0]]
    .some(([dx, dy]) => set.has(key(x + dx, y + dy)));
  if (!usable(closed, geo.cat.x, geo.cat.y)) fail(`${tag}: o gato é inalcançável`);
  if (!usable(closed, geo.campfire.x, geo.campfire.y)) fail(`${tag}: a fogueira é inalcançável`);

  const wall = new Set(geo.barrier.map(([x, y]) => key(x, y)));
  for (const p of plan.props) {
    if (p.type === 'levelPortal') continue;
    if (!inBounds(p.x, p.y)) { fail(`${tag}: ${p.type} fora do mapa (${p.x},${p.y})`); continue; }
    // O que está DENTRO do bolso se mede com a parede derrubada — é onde ele mora de propósito.
    const set = wall.has(key(p.x, p.y)) || !geo.pocket(p.x, p.y) ? closed : open;
    const ok = SOLID.has(p.type) ? usable(set, p.x, p.y) : set.has(key(p.x, p.y));
    if (!ok) fail(`${tag}: ${p.type} em (${p.x},${p.y}) é inalcançável`);
  }
  for (const it of plan.pickups) {
    const set = geo.pocket(it.x, it.y) ? open : closed;
    if (!set.has(key(it.x, it.y))) fail(`${tag}: o item ${it.type} em (${it.x},${it.y}) é inalcançável`);
  }
  for (const e of plan.enemies) {
    if (!open.has(key(e.x, e.y))) fail(`${tag}: o inimigo em (${e.x},${e.y}) nasce dentro de um sólido`);
  }

  // A CARTA não pode fechar a estrada para as vizinhas, nem com a parede de pé.
  if (geoName === 'card') {
    const roads = flood(ROAD_MOUTHS.norte, blockedSet(plan, geo, true));
    const cut = Object.entries(ROAD_MOUTHS).filter(([, [x, y]]) => !roads.has(key(x, y))).map(([nm]) => nm);
    if (cut.length) fail(`${tag}: a carta SELA as bocas ${cut.join(', ')}`);
  }
  return plan;
};

const PLANS = {};
for (const lesson of LESSONS) {
  PLANS[lesson.cardId] = {
    level: proof(lesson, 'level'),
    card: proof(lesson, 'card'),
  };
}
if (failed) process.exit(1);

// ── OS ARQUIVOS ──────────────────────────────────────────────────────────────────────────────
/** Chão liso; a decoração é um tapete de capim que não bloqueia e nunca cai sobre a aula. */
const buildGrids = (geo, plan) => {
  const ground = Array.from({ length: ROWS }, () => Array(COLS).fill(GRASS));
  const upper = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const collisions = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const busy = new Set([
    ...plan.props.map((p) => key(p.x, p.y)),
    ...plan.pickups.map((p) => key(p.x, p.y)),
    key(geo.cat.x, geo.cat.y),
    geo.start ? key(geo.start.worldX, geo.start.worldY) : '',
  ]);
  // Determinístico: nada de Math.random, o arquivo tem de sair igual em toda rodada.
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (busy.has(key(x, y))) continue;
      if ((x * 7 + y * 13 + x * y * 3) % 11 < 7) continue;
      upper[y][x] = DECOR[(x + y) % DECOR.length];
    }
  }
  return { ground, upper, collisions };
};

const dialogOf = (lesson) => (lesson.trade ? { ...lesson.dialog, trade: lesson.trade } : lesson.dialog);

// ── 1. os levels ─────────────────────────────────────────────────────────────────────────────
const indexPath = path.join('public', 'levels', 'index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const geoL = GEOS.level;

for (const lesson of LESSONS) {
  const plan = PLANS[lesson.cardId].level;
  const { ground, upper, collisions } = buildGrids(geoL, plan);
  const level = {
    meta: {
      name: lesson.levelName,
      schemaVersion: 1,
      worldChunksX: 1,
      worldChunksY: 1,
      chunkColumns: COLS,
      chunkRows: ROWS,
      tileSize: 8,
      tilesetKey: 'forest-tileset',
      playerStart: geoL.start,
      puzzle: true,
      exportedAt: new Date().toISOString(),
    },
    chunks: [{
      cx: 0,
      cy: 0,
      ground,
      upper,
      collisions,
      enemies: plan.enemies.map((e) => ({ type: e.type, worldX: e.x, worldY: e.y })),
      pickups: plan.pickups.map((p) => ({ type: p.type, worldX: p.x, worldY: p.y })),
      npcs: [{ type: 'blackCat', worldX: geoL.cat.x, worldY: geoL.cat.y, dialog: lesson.dialogId }],
    }],
    props: plan.props.map((p) => ({ ...p, worldX: p.x, worldY: p.y, x: undefined, y: undefined }))
      .map(({ x, y, ...rest }) => rest),
    dialogs: { [lesson.dialogId]: dialogOf(lesson) },
    globalVariables: {},
  };
  const file = `level-${lesson.level}.json`;
  fs.writeFileSync(path.join('public', 'levels', file), `${JSON.stringify(level, null, 2)}\n`);

  // O index é LIDO e acrescentado, nunca refeito: ele é a lista de autoria de todos os levels.
  const entry = { id: `level-${lesson.level}`, file, name: lesson.levelName, blurb: lesson.blurb };
  const at = index.findIndex((e) => e.id === entry.id);
  if (at >= 0) index[at] = entry;
  else index.splice(index.findIndex((e) => e.id.startsWith('dungeon-')), 0, entry);
  console.log(`level: public/levels/${file} — ${lesson.levelName}`);
}
fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);

// ── 2. as cartas ─────────────────────────────────────────────────────────────────────────────
// O world.json é LIDO e ACRESCENTADO. Idempotente por id da carta: rodar duas vezes não duplica
// nada, e um chunk que já exista é reescrito no lugar (é a mesma fonte de verdade).
const worldPath = path.join('public', 'world.json');
const world = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
const backup = path.join('backup', 'world-pre-cat-lessons.json');
if (!fs.existsSync(backup)) {
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(worldPath, backup);
  console.log(`backup: ${backup}`);
}
const geoC = GEOS.card;

for (const lesson of LESSONS) {
  const plan = PLANS[lesson.cardId].card;
  const { ground, upper, collisions } = buildGrids(geoC, plan);
  let chunk = world.chunks.find((c) => c.catalog?.id === lesson.cardId);
  if (!chunk) {
    const cx = world.chunks.reduce((max, c) => Math.max(max, c.cx), -1) + 1;
    chunk = { cx, cy: 0 };
    world.chunks.push(chunk);
    console.log(`carta nova em cx=${cx}: ${lesson.cardName}`);
  }
  const ox = chunk.cx * COLS;
  // Os props deste chunk saem e voltam: reescrever no lugar é o que torna o script idempotente
  // sem deixar duas paredes empilhadas no mesmo tile.
  world.props = world.props.filter((p) => Math.floor(p.worldX / COLS) !== chunk.cx);
  for (const p of plan.props) {
    if (p.type === 'levelPortal') continue;
    const { x, y, ...rest } = p;
    world.props.push({ ...rest, worldX: ox + x, worldY: y });
  }
  Object.assign(chunk, {
    ground,
    upper,
    collisions,
    enemies: plan.enemies.map((e) => ({ type: e.type, worldX: ox + e.x, worldY: e.y })),
    pickups: plan.pickups.map((p) => ({ type: p.type, worldX: ox + p.x, worldY: p.y })),
    npcs: [{ type: 'blackCat', worldX: ox + geoC.cat.x, worldY: geoC.cat.y, dialog: lesson.dialogId }],
    catalog: {
      id: lesson.cardId,
      name: lesson.cardName,
      cost: lesson.cardCost,
      cardImage: 'generated:hearth',
      description: lesson.description,
      // EXPLÍCITA, e é o único lugar do baralho que precisa disso. A dedução (ver chunkCategoryOf)
      // olha o morador primeiro, e uma aula TEM morador — o gato. Sem esta linha as três cairiam
      // em "narrativa", e com isso ganhariam o cerco de undead no meio da lição.
      category: 'puzzle',
    },
  });
  world.dialogs[lesson.dialogId] = dialogOf(lesson);
}
world.meta.worldChunksX = world.chunks.reduce((max, c) => Math.max(max, c.cx), 0) + 1;
fs.writeFileSync(worldPath, `${JSON.stringify(world, null, 2)}\n`);

console.log(`\nok: 3 levels + 3 cartas (world.json agora tem ${world.chunks.length} chunks)`);
for (const lesson of LESSONS) {
  console.log(`  ${lesson.cardId.padEnd(14)} custo ${lesson.cardCost}  ·  level-${lesson.level}  ·  roteiro ${lesson.dialogId}`);
}
