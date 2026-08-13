// AS OUTRAS OITO AULAS DO GATO — a segunda leva, e a irmã de `make-cat-lessons.mjs`.
//
// As três primeiras (machado, tocha, picareta) são todas a mesma forma: uma parede de N peças
// iguais que uma ferramenta abre. Estas oito não são — cada uma tem uma TRAVA própria, e o que se
// ensina é a regra dela. Por isso elas moram aqui, com a planta escrita à mão tile a tile, em vez
// de saírem de um gerador de paredes.
//
// ── UMA PLANTA SÓ, PARA OS DOIS FORMATOS ─────────────────────────────────────────────────────
// A primeira leva tem duas geometrias (a do level atravessa a tela, a da carta fecha um canto),
// porque uma parede de doze tiles no meio de uma carta SELA a estrada das vizinhas. Aqui a trava
// já nasce no canto nordeste — fora das quatro costuras (`openSeams`) —, então a mesma planta
// serve de level e de carta sem escolher entre legibilidade e mundo aberto.
//
// O canto é o BOLSO (colunas 9-11, linhas 0-3), fechado por um L de oito tiles (coluna 8 até a
// linha 4, e a linha 4 até a borda leste). Uma peça desse L é a TRAVA; o resto é parede morta —
// e "parede morta" aqui é colisão PINTADA, não rocha: rocha se quebra, e uma aula cuja parede
// aceita picareta ensina a picareta, não a si mesma.
//
// ── A PROVA DE BFS ───────────────────────────────────────────────────────────────────────────
// Para cada aula, e sai com erro (exit 1) se falhar:
//   • com a trava FECHADA o bolso é inalcançável (as duas aulas sem trava — a espada e o portão
//     de bater — declaram `lock: []` e são cobradas ao contrário: o bolso TEM de ser alcançável,
//     porque o que elas ensinam é uma regra, não uma porta);
//   • com a trava ABERTA o bolso e o portal são alcançáveis;
//   • gato, fogueira, ferramenta e todo item solto são alcançáveis antes de abrir;
//   • toda peça sólida pode ser operada de um tile alcançável;
//   • e as quatro bocas de estrada continuam se alcançando — nenhuma carta fecha a estrada.
//
//   node scripts/make-cat-tutorials.mjs

import fs from 'node:fs';
import path from 'node:path';

const COLS = 12;
const ROWS = 12;
const GRASS = 5;
const DECOR = [0, 1, 19, 20];

// ── O QUADRO COMUM ───────────────────────────────────────────────────────────────────────────
const SPAWN = { worldX: 6, worldY: 7 };
const CAT = { x: 5, y: 6 };
const PORTAL = { x: 11, y: 0 };   // no fundo do bolso; só o level o recebe
const PRIZE = { x: 10, y: 2 };    // a barra de ferro que o bolso guarda

/** O L que fecha o bolso. Fora de toda costura — ver o cabeçalho. */
const WALL = [
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4],
  [9, 4], [10, 4], [11, 4],
];
/** A porta: o tile do L em que a trava de cada aula mora. */
const DOOR = [8, 2];
/** O L menos a porta — a parede morta. */
const DEAD_WALL = WALL.filter(([x, y]) => !(x === DOOR[0] && y === DOOR[1]));

const inPocket = (x, y) => x >= 9 && y <= 3;
const POCKET = [];
for (let y = 0; y <= 3; y += 1) for (let x = 9; x <= 11; x += 1) POCKET.push([x, y]);

const ROAD_MOUTHS = { norte: [6, 0], sul: [6, 11], oeste: [0, 6], leste: [11, 6] };

const p = (type, x, y, extra = {}) => ({ type, x, y, ...extra });
const it = (type, x, y) => ({ type, x, y });

// ── AS OITO AULAS ────────────────────────────────────────────────────────────────────────────
const LESSONS = [
  {
    level: 8,
    cardId: 'cat-blade',
    cardName: "Cat's Proving Ground",
    cardCost: 7,
    levelName: 'A Espada',
    blurb: 'Nada aqui morre de um golpe — e o bicho guarda o lado que está armando.',
    description: 'A cat, a sword, and three things that do not die in one hit.',
    category: 'combat',
    dialogId: 'catSword',
    // SEM TRAVA. A espada não abre porta nenhuma: o que ela tem para ensinar é uma regra de mão —
    // que o golpe não mata de primeira, que o corpo pisca invulnerável, e que o bicho guarda o
    // lado que arma. Uma parede aqui seria cenário; o que ensina é o corpo do outro lado dela.
    lock: [],
    walls: [],
    props: [p('campfire', 3, 6, { lit: true })],
    pickups: [it('sword', 6, 6), it('iron', PRIZE.x, PRIZE.y)],
    enemies: [['undead', 9, 1], ['undead', 11, 2], ['undead', 10, 3]],
    lines: [
      'Mrrow. Take the SWORD. Press Z — and press it again, and again.',
      'Nothing here falls to one blow. Strike a body that is still flashing and your blade slides off it: that flash is a body that cannot be hurt yet. Wait a beat.',
      'And watch their feet. When one plants itself and winds up, it is GUARDING the side it faces. Hitting that side gives you sparks and nothing else — walk around it.',
      'Hold Z instead of tapping it and the blade spins: it cuts all eight neighbours at once. Mrrow. Go on.',
    ],
  },

  {
    level: 9,
    cardId: 'cat-crossing',
    cardName: "Cat's Crossing",
    cardCost: 8,
    levelName: 'A Travessia',
    blurb: 'Duas madeiras fazem um deck. Uma pedra faz um vau. Só um dos dois queima.',
    description: 'A cat, a river, and the oldest question: a floor, or a fuse?',
    category: 'puzzle',
    dialogId: 'catCrossing',
    lock: [DOOR],
    walls: [],
    // O L inteiro é RIO. O tile da porta é o único vau construível — o resto é água e fica água.
    props: [
      p('campfire', 3, 6, { lit: true }),
      ...DEAD_WALL.map(([x, y]) => p('water', x, y)),
      p('bridgeSpot', DOOR[0], DOOR[1]),
    ],
    pickups: [
      it('wood', 6, 6), it('wood', 5, 7), it('stone', 4, 7),
      it('iron', PRIZE.x, PRIZE.y),
    ],
    enemies: [],
    lines: [
      'Mrrow. Water. You cannot swim and you cannot chop it.',
      'One tile of that bank will take a crossing. Face it and press X holding TWO STICKS and you nail a plank deck. Or hold ONE STONE and you drop a ford.',
      'They carry you the same. They do not carry FIRE the same: flame runs across planks and eats them. It stops dead at stone, every time.',
      'So the question is never "how do I cross". It is: do I want a floor here, or a fuse? Mrrow.',
    ],
  },

  {
    level: 10,
    cardId: 'cat-blast',
    cardName: "Cat's Blasting Cut",
    cardCost: 9,
    levelName: 'A Bomba',
    blurb: 'A rocha não cede à picareta aqui. Uma marca no chão diz onde a bomba serve.',
    description: 'A cat, a bomb, and the one tile in the rock that will give.',
    category: 'puzzle',
    dialogId: 'catBomb',
    lock: [DOOR],
    // A parede é ROCHA — e não há picareta nenhuma nesta tela, de propósito: ela existe para
    // dizer "esta pedra não é a sua pedra". A única abertura é a marca.
    walls: [],
    props: [
      p('campfire', 3, 6, { lit: true }),
      ...DEAD_WALL.map(([x, y]) => p('rock', x, y)),
      p('bombSpot', DOOR[0], DOOR[1]),
    ],
    pickups: [
      it('bomb', 6, 6), it('bomb', 5, 7), it('bomb', 4, 7),
      it('iron', PRIZE.x, PRIZE.y),
    ],
    enemies: [],
    lines: [
      'Mrrow. That rock is not going anywhere. No pick in the world opens it.',
      'But look at the ground — one tile is MARKED. That is where the stone is thin.',
      'Take a BOMB and stand on the mark: it arms itself the moment you get there, and it counts. Then leave. Three of them on the floor, so you may waste two learning.',
      'Everything you carry that burns, burns on its own clock. Mrrow.',
    ],
  },

  {
    level: 11,
    cardId: 'cat-weight',
    cardName: "Cat's Weighing Stone",
    cardCost: 10,
    levelName: 'O Caixote',
    blurb: 'A placa quer PESO, e o seu peso está do lado errado da porta.',
    description: 'A cat, a crate, and a plate that does not care whose weight it is.',
    category: 'puzzle',
    dialogId: 'catCrate',
    lock: [DOOR],
    walls: DEAD_WALL,
    props: [
      p('campfire', 3, 6, { lit: true }),
      p('electronicGate', DOOR[0], DOOR[1], { variable: 'peso' }),
      p('pressurePlate', 3, 2, { variable: 'peso' }),
      p('woodenCrate', 5, 2),
    ],
    pickups: [it('iron', PRIZE.x, PRIZE.y)],
    enemies: [],
    variables: { peso: false },
    lines: [
      'Mrrow. The plate over there opens the door. Stand on it and see.',
      'You saw. The door is open and you are on the plate, which is the whole joke: your weight cannot be in two places.',
      'So send something else. Walk INTO the crate to push it — no button, just your body — and park it on the plate.',
      'The plate never asked for you. It asks for weight. A crate does; so does a skull, if one ever wanders onto it. Mrrow.',
    ],
  },

  {
    level: 12,
    cardId: 'cat-swing',
    cardName: "Cat's Stubborn Gate",
    cardCost: 11,
    levelName: 'O Portão de Bater',
    blurb: 'Dois portões iguais. Um abre, o outro não — e a diferença está ATRÁS dele.',
    description: 'A cat and two identical gates, one of which will never open.',
    category: 'puzzle',
    dialogId: 'catGate',
    // O portão LIMPO é a trava de verdade — foi a prova que corrigiu isto. Eu o tinha declarado
    // como aula sem porta ("o que se ensina é uma regra"), mas um portão de bater fechado bloqueia
    // igual a qualquer parede: sem abri-lo não se chega ao bolso. O que a aula tem de especial é
    // que existem DOIS, e só um deles cede.
    lock: [DOOR],
    walls: DEAD_WALL.filter(([x, y]) => !(x === 8 && y === 1)),
    props: [
      p('campfire', 3, 6, { lit: true }),
      // O TEIMOSO: uma pedra encostada nas costas dele. O portão bate para dentro, e o que está
      // atrás segura a folha.
      p('swingGate', 8, 1),
      p('rock', 9, 1),
      // E o que abre, três tiles abaixo, com o bolso vazio atrás.
      p('swingGate', DOOR[0], DOOR[1]),
    ],
    pickups: [it('iron', PRIZE.x, PRIZE.y)],
    enemies: [],
    lines: [
      'Mrrow. Two gates, same wood, same hinge. Walk into the top one.',
      'It shudders and stays shut. Nothing is locked — there is a BOULDER sitting against its back, and a gate that swings inward cannot swing through stone.',
      'The lower one has nothing behind it. Walk into that one and it gives.',
      'No key exists for either. A swing gate only ever asks one thing: is the tile behind me empty? Mrrow.',
    ],
  },

  {
    level: 13,
    cardId: 'cat-nightbloom',
    cardName: "Cat's Nightbloom",
    cardCost: 12,
    levelName: 'A Flor e o Balde',
    blurb: 'A flor só abre no ESCURO. E a única coisa que apaga fogo neste jogo é água.',
    description: 'A cat, a bucket, and a flower that shuts because your fire is too bright.',
    category: 'puzzle',
    dialogId: 'catFlower',
    lock: [DOOR],
    walls: DEAD_WALL,
    // UMA fogueira só, e ela é a do problema: o runtime acende a mais próxima do spawn, então
    // uma segunda "fogueira de casa" perto do herói deixaria esta apagada e a flor já aberta.
    // A fogueira fica ao LADO do caminho, nunca nele: em (7,2) ela era o próprio tile de onde se
    // encara a flor, e o corpo dela — fogueira é sólida — trancava a porta que a aula abre. Em
    // (7,1) ela continua a um tile e meio da flor (bem dentro do halo que a mantém fechada) e o
    // corredor até a porta fica livre.
    props: [
      p('campfire', 7, 1, { lit: true }),
      p('moonflower', DOOR[0], DOOR[1]),
      p('water', 3, 2),
    ],
    pickups: [it('bucket', 6, 6), it('iron', PRIZE.x, PRIZE.y)],
    enemies: [],
    lines: [
      'Mrrow. The way through is a FLOWER, and it is shut.',
      'It is shut because of my fire. That bud opens in the dark and closes in the light — it has no opinion about you at all.',
      'Take the BUCKET. Face the puddle and press X to fill it; face the fire and press X to throw it.',
      'Water is the only thing in this world that puts fire OUT. Everything else you own only starts them. Mrrow.',
    ],
  },

  {
    level: 14,
    cardId: 'cat-bloomery',
    cardName: "Cat's Bloomery",
    cardCost: 13,
    levelName: 'A Forja',
    blurb: 'Minério não é ferro. Ele passa pelo fogo, sai esponja, e só a pancada faz a barra.',
    description: 'A cat, a furnace, an altar, and a door that wants one bar of iron.',
    category: 'puzzle',
    dialogId: 'catForge',
    lock: [DOOR],
    walls: DEAD_WALL,
    props: [
      p('campfire', 3, 6, { lit: true }),
      p('electronicGate', DOOR[0], DOOR[1], { variable: 'forja' }),
      p('chest', 6, 2, { variable: 'forja', quota: { kind: 'iron', count: 1 } }),
      p('furnace', 3, 2, { dir: 1 }),
      p('altar', 5, 4),
    ],
    pickups: [
      it('ore', 6, 6), it('ore', 5, 7),
      it('charcoal', 4, 7), it('charcoal', 4, 6),
      it('iron', PRIZE.x, PRIZE.y),
    ],
    enemies: [],
    variables: { forja: false },
    lines: [
      'Mrrow. That door wants ONE BAR OF IRON. You have no iron. You have rust-stained rock.',
      'Face the FURNACE and press Z: it knows two recipes, and one of them turns ore and charcoal into a bloom. Confirming does not hand it to you — it LIGHTS the furnace. Wait for it.',
      'What jumps out is a sponge, not a bar. Carry it to the stone ALTAR, press Z to lay it down, then beat it. Three blows and the slag is gone.',
      'Then feed the bar to the chest with X. Ore, fire, hammer, bar — there is no shortcut, and every forge in this world runs that order. Mrrow.',
    ],
  },

  {
    level: 15,
    cardId: 'cat-current',
    cardName: "Cat's Broken Current",
    cardCost: 14,
    levelName: 'A Bateria',
    blurb: 'O cabo do portão está morto. O outro está vivo — e a bateria atravessa a distância.',
    description: 'A cat, a live wire, a dead one, and a battery to carry the difference.',
    category: 'puzzle',
    dialogId: 'catBattery',
    lock: [DOOR],
    walls: DEAD_WALL,
    props: [
      p('campfire', 3, 6, { lit: true }),
      p('electronicGate', DOOR[0], DOOR[1]),
      // A USINA, à esquerda: a roda sobre o rio, dois cabos, e uma ESTEIRA no fim deles.
      //
      // A esteira não é decoração: cabo só acende com CARGA PASSANDO por ele (`wireLoad`, e
      // `live = load > 0`). Uma linha com fonte e sem consumidor lê como morta — foi o que a
      // primeira versão desta aula fez, e a bateria não tinha onde carregar. Com a esteira
      // rodando, o lado vivo se PROVA sozinho: ele faz alguma coisa, e o outro não.
      p('water', 1, 2),
      p('waterWheel', 1, 3),
      p('wire', 2, 3),
      p('wire', 3, 3),
      p('belt', 4, 3, { dir: 1 }),
      // O CABO MORTO, colado no portão — e separado da usina por três tiles de chão seco.
      p('wire', 7, 2),
      p('wire', 7, 3),
    ],
    pickups: [it('battery', 6, 6), it('iron', PRIZE.x, PRIZE.y)],
    enemies: [],
    lines: [
      'Mrrow. The gate needs current and the cable at its side is DEAD. Look at it: no glow.',
      'The wheel on the river makes plenty — the belt over there runs on it. But that cable stops three tiles short, and I am a cat, not an electrician.',
      'Take the BATTERY. Stand on the live cable and it drinks; you will see it fill.',
      'Then face the dead cable and press X to seat it there. A battery is a piece of wire you can carry. Mrrow.',
    ],
  },

  {
    level: 16,
    cardId: 'cat-furrow',
    cardName: "Cat's Furrow",
    cardCost: 15,
    levelName: 'A Fazenda',
    blurb: 'Foice, pá, semente e balde. A fazenda não multiplica nada — ela MUDA o mato de lugar.',
    description: 'A cat, a scythe, a shovel and a bucket: fuel you can put where you want it.',
    category: 'puzzle',
    dialogId: 'catFarm',
    // SEM TRAVA, e não por preguiça: a fazenda é NEUTRA. Uma foiçada devolve uma semente e uma
    // semente devolve um capim (`dropProduct` sem `units` = 1), então o ciclo nunca produz mais do
    // que o mato autorado já valia. Uma cota de sementes acima disso é insolúvel, e abaixo disso se
    // paga só ceifando — em nenhum dos dois casos a trava obriga a plantar.
    //
    // Tentei também a trava do PAVIO (fogo que precisa atravessar um corta-fogo por cima de mato
    // plantado) e ela cai por geometria: para cavar um tile é preciso poder pisar nele, e quem pisa
    // ali alcança o vizinho com a tocha na mão. A fazenda não tem porta — o que ela tem é um lugar.
    lock: [],
    walls: [],
    props: [
      p('campfire', 3, 6, { lit: true }),
      // O MATO AUTORADO: é ele que dá a primeira semente, e é todo o capital do ciclo.
      p('tallGrass', 4, 2), p('tallGrass', 5, 2), p('tallGrass', 6, 2), p('tallGrass', 4, 3),
      // A poça, para encher o balde. O resto do mapa é terra nua — chão do frame 5, que é
      // justamente o que a pá aceita (DIGGABLE_GROUND_FRAMES).
      p('water', 2, 4),
      p('sellBox', 7, 6, { sells: { kind: 'seeds', coinsPerUnit: 1 } }),
    ],
    pickups: [
      it('scythe', 6, 6), it('shovel', 5, 7), it('bucket', 4, 7),
      it('iron', PRIZE.x, PRIZE.y),
    ],
    enemies: [],
    // O BALCÃO: semente é a coisa mais barata que o gato compra (1), e é assim de propósito — ela
    // é a mais renovável das três. Carvão vale 2, minério vale 3, semente vale 1.
    // O BALCAO DO GATO SAIU: quem compra agora e a CAIXA DE VENDA, um corpo no chao com a placa
    // dizendo o que ela aceita. Vender deixou de ser uma conversa — e uma caixa nao precisa de
    // alguem morando na carta para existir.
    sells: { kind: 'seeds', coinsPerUnit: 1 },
    lines: [
      'Mrrow. Take the SCYTHE and cut that tall grass. What it leaves behind is SEEDS.',
      'Now the SHOVEL. Face bare earth — plain dirt, not stone — and press X. It opens a hole.',
      'Walk over the hole while you carry seeds and they sow themselves. Then fill the BUCKET at the puddle with X, face the mound, and throw it.',
      'Wait a moment and it comes up as real grass: it blocks, it burns, and the scythe takes it again. The hole reopens under it.',
      'It never MULTIPLIES — one seed, one clump, forever. What a farm gives you is grass WHERE YOU WANT IT: a fuse you can lay by hand.',
      'And the box beside me buys the spare. The sign on it shows what it takes; face it with X and it pays, coins on the ground. Mrrow.',
    ],
  },
];

// ── A PROVA ──────────────────────────────────────────────────────────────────────────────────
const SOLID_PROPS = new Set([
  'rock', 'ironRock', 'dryTree', 'dryBush', 'dryShrub', 'campfire', 'water',
  'toolbox', 'furnace', 'chest', 'waterWheel', 'lockedDoor', 'boiler', 'altar',
  'woodenCrate', 'tripHammer',
]);
/** Sólidos ENQUANTO fechados — são as travas, e a prova os abre no segundo passe. */
const LOCK_PROPS = new Set(['electronicGate', 'moonflower', 'swingGate', 'bridgeSpot', 'bombSpot']);

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

const blockedSet = (lesson, opened) => {
  const blocked = new Set(lesson.walls.map(([x, y]) => key(x, y)));
  const lockKeys = new Set(lesson.lock.map(([x, y]) => key(x, y)));
  for (const prop of lesson.props) {
    const k = key(prop.x, prop.y);
    if (opened && lockKeys.has(k)) continue;                 // a trava foi aberta
    if (SOLID_PROPS.has(prop.type) || LOCK_PROPS.has(prop.type)) blocked.add(k);
  }
  blocked.add(key(CAT.x, CAT.y)); // o NPC ocupa o tile dele
  return blocked;
};

const usable = (set, x, y) => [[0, -1], [1, 0], [0, 1], [-1, 0]]
  .some(([dx, dy]) => set.has(key(x + dx, y + dy)));

for (const lesson of LESSONS) {
  const tag = lesson.cardId;
  const closed = flood([SPAWN.worldX, SPAWN.worldY], blockedSet(lesson, false));
  const open = flood([SPAWN.worldX, SPAWN.worldY], blockedSet(lesson, true));
  const hasLock = lesson.lock.length > 0;

  if (hasLock) {
    const vazado = POCKET.find(([x, y]) => closed.has(key(x, y)));
    if (vazado) fail(`${tag}: o bolso (${vazado}) e alcancavel com a trava FECHADA — a trava e decorativa`);
    if (!open.has(key(PORTAL.x, PORTAL.y))) fail(`${tag}: com a trava aberta o portal continua inalcancavel`);
  } else if (!closed.has(key(PORTAL.x, PORTAL.y))) {
    // Aula de REGRA (espada, portão de bater): sem trava, o fundo tem de estar aberto desde já.
    fail(`${tag}: aula sem trava, mas o portal e inalcancavel`);
  }

  for (const item of lesson.pickups) {
    const set = inPocket(item.x, item.y) ? open : closed;
    if (!inBounds(item.x, item.y)) fail(`${tag}: item ${item.type} fora do mapa (${item.x},${item.y})`);
    else if (!set.has(key(item.x, item.y))) fail(`${tag}: o item ${item.type} em (${item.x},${item.y}) e inalcancavel`);
  }
  for (const prop of lesson.props) {
    if (!inBounds(prop.x, prop.y)) { fail(`${tag}: prop ${prop.type} fora do mapa`); continue; }
    if (!SOLID_PROPS.has(prop.type) && !LOCK_PROPS.has(prop.type)) continue;
    const set = inPocket(prop.x, prop.y) ? open : closed;
    if (!usable(set, prop.x, prop.y)) fail(`${tag}: ${prop.type} em (${prop.x},${prop.y}) nao pode ser operado`);
  }
  for (const [, x, y] of lesson.enemies) {
    const set = inPocket(x, y) ? open : closed;
    if (!set.has(key(x, y))) fail(`${tag}: inimigo em (${x},${y}) nasce dentro de um solido`);
  }
  if (!usable(closed, CAT.x, CAT.y)) fail(`${tag}: o gato e inalcancavel`);

  // A CARTA nao pode fechar a estrada das vizinhas.
  const roads = flood(ROAD_MOUTHS.norte, blockedSet(lesson, false));
  const cut = Object.entries(ROAD_MOUTHS).filter(([, [x, y]]) => !roads.has(key(x, y))).map(([n]) => n);
  if (cut.length) fail(`${tag}: a carta SELA as bocas ${cut.join(', ')}`);
}
if (failed) process.exit(1);

// ── OS ARQUIVOS ──────────────────────────────────────────────────────────────────────────────
const buildGrids = (lesson) => {
  const ground = Array.from({ length: ROWS }, () => Array(COLS).fill(GRASS));
  const upper = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const collisions = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  for (const [x, y] of lesson.walls) collisions[y][x] = true;
  const busy = new Set([
    ...lesson.walls.map(([x, y]) => key(x, y)),
    ...lesson.props.map((o) => key(o.x, o.y)),
    ...lesson.pickups.map((o) => key(o.x, o.y)),
    ...lesson.enemies.map(([, x, y]) => key(x, y)),
    ...POCKET.map(([x, y]) => key(x, y)),
    key(CAT.x, CAT.y), key(SPAWN.worldX, SPAWN.worldY), key(PORTAL.x, PORTAL.y),
  ]);
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (busy.has(key(x, y))) continue;
      if ((x * 7 + y * 13 + x * y * 3) % 11 < 7) continue;
      upper[y][x] = DECOR[(x + y) % DECOR.length];
    }
  }
  return { ground, upper, collisions };
};

const dialogOf = (lesson) => ({
  npcName: 'CAT',
  npcColorHex: '#cc99ff',
  npcAssetKey: 'npcs',
  npcFrame: 0,
  voice: { freq: 540, wave: 'triangle' },
  lines: lesson.lines.map((text) => ({ speaker: 'npc', text })),
  ...(lesson.trade ? { trade: lesson.trade } : {}),
});

const propsFor = (lesson, withPortal) => {
  const out = lesson.props.map(({ x, y, ...rest }) => ({ ...rest, worldX: x, worldY: y }));
  if (withPortal) out.push({ type: 'levelPortal', worldX: PORTAL.x, worldY: PORTAL.y });
  return out;
};

// ── 1. os levels ─────────────────────────────────────────────────────────────────────────────
const indexPath = path.join('public', 'levels', 'index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

for (const lesson of LESSONS) {
  const { ground, upper, collisions } = buildGrids(lesson);
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
      playerStart: SPAWN,
      puzzle: true,
      exportedAt: new Date().toISOString(),
    },
    chunks: [{
      cx: 0,
      cy: 0,
      ground,
      upper,
      collisions,
      enemies: lesson.enemies.map(([type, x, y]) => ({ type, worldX: x, worldY: y })),
      pickups: lesson.pickups.map(({ type, x, y }) => ({ type, worldX: x, worldY: y })),
      npcs: [{ type: 'blackCat', worldX: CAT.x, worldY: CAT.y, dialog: lesson.dialogId }],
    }],
    props: propsFor(lesson, true),
    dialogs: { [lesson.dialogId]: dialogOf(lesson) },
    globalVariables: lesson.variables ?? {},
  };
  const file = `level-${lesson.level}.json`;
  fs.writeFileSync(path.join('public', 'levels', file), `${JSON.stringify(level, null, 2)}\n`);
  const entry = { id: `level-${lesson.level}`, file, name: lesson.levelName, blurb: lesson.blurb };
  const at = index.findIndex((e) => e.id === entry.id);
  if (at >= 0) index[at] = entry;
  else index.splice(index.findIndex((e) => e.id.startsWith('dungeon-')), 0, entry);
  console.log(`level: public/levels/${file} — ${lesson.levelName}`);
}
fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);

// ── 2. as cartas ─────────────────────────────────────────────────────────────────────────────
const worldPath = path.join('public', 'world.json');
const world = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
const backup = path.join('backup', 'world-pre-cat-tutorials.json');
if (!fs.existsSync(backup)) {
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(worldPath, backup);
  console.log(`backup: ${backup}`);
}

for (const lesson of LESSONS) {
  const { ground, upper, collisions } = buildGrids(lesson);
  let chunk = world.chunks.find((c) => c.catalog?.id === lesson.cardId);
  if (!chunk) {
    const cx = world.chunks.reduce((max, c) => Math.max(max, c.cx), -1) + 1;
    chunk = { cx, cy: 0 };
    world.chunks.push(chunk);
    console.log(`carta nova em cx=${cx}: ${lesson.cardName}`);
  }
  const ox = chunk.cx * COLS;
  world.props = world.props.filter((prop) => Math.floor(prop.worldX / COLS) !== chunk.cx);
  for (const prop of propsFor(lesson, false)) {
    world.props.push({ ...prop, worldX: ox + prop.worldX });
  }
  Object.assign(chunk, {
    ground,
    upper,
    collisions,
    enemies: lesson.enemies.map(([type, x, y]) => ({ type, worldX: ox + x, worldY: y })),
    pickups: lesson.pickups.map(({ type, x, y }) => ({ type, worldX: ox + x, worldY: y })),
    npcs: [{ type: 'blackCat', worldX: ox + CAT.x, worldY: CAT.y, dialog: lesson.dialogId }],
    catalog: {
      id: lesson.cardId,
      name: lesson.cardName,
      cost: lesson.cardCost,
      cardImage: 'generated:hearth',
      description: lesson.description,
      category: lesson.category,
    },
  });
  world.dialogs[lesson.dialogId] = dialogOf(lesson);
  // As variáveis da trava são GLOBAIS do mundo: sem elas o portão nasce sem nome e nunca abre.
  if (lesson.variables) {
    world.globalVariables = { ...(world.globalVariables ?? {}), ...lesson.variables };
  }
}
world.meta.worldChunksX = world.chunks.reduce((max, c) => Math.max(max, c.cx), 0) + 1;
fs.writeFileSync(worldPath, `${JSON.stringify(world, null, 2)}\n`);

console.log(`\nok: ${LESSONS.length} levels + ${LESSONS.length} cartas (world.json tem ${world.chunks.length} chunks)`);
for (const lesson of LESSONS) {
  console.log(`  ${lesson.cardId.padEnd(16)} ${lesson.category.padEnd(9)} custo ${String(lesson.cardCost).padEnd(3)} level-${lesson.level}`);
}
