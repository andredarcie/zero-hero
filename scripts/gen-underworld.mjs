// O SUBTERRÂNEO — o espelho do overworld, um andar abaixo.
//
// O jogo tem UMA dungeon, e ela é o mapa de cima visto por baixo: o MESMO tamanho, as MESMAS
// coordenadas. Descer num portal em (x,y) põe o herói em (x,y) lá embaixo; subir no portal de
// lá devolve ele ao mesmo (x,y) aqui. É o Dark World do Link to the Past, e a graça é a mesma:
// você já sabe onde está, porque a forma do lugar bate com a forma que você decorou.
//
// O QUE O ESPELHO COPIA, e o que ele não copia:
//
//   · copia o ESQUELETO — a colisão, tile a tile. Onde havia montanha ou pinheiro em cima, há
//     alvenaria embaixo; onde havia campo aberto, há chão de caverna. A silhueta do continente
//     é a mesma, e é isso que faz o mapa de cima valer como mapa de baixo.
//   · NÃO copia a MOBÍLIA. Rocha, árvore morta, mato, água, lava, fogueira, bancada: nada disso
//     desce. Duas razões — elas são recursos do mundo de cima (e duplicá-las dobraria a economia
//     em silêncio), e são obstáculos que o herói REMOVE, então copiá-las faria o subterrâneo ser
//     um lugar mais aberto que o espelho, não igual a ele.
//   · NÃO copia NPC nenhum. Ninguém mora lá embaixo. As missões são todas do mundo de cima.
//   · o MAR continua sendo a moldura: fora da borda o chão é mar nos dois andares, e nada no
//     jogo atravessa mar.
//
// O que ele ACRESCENTA é o que faz do lugar uma dungeon: as covas das quatro espécies que nunca
// aparecem lá em cima (gosma, gosma grande, torreta, mago), uma por tela, na lei de sempre.
//
// Modelo enrich-*: LÊ o `public/world.json` e ESCREVE dois arquivos —
//   · `public/underworld.json` (novo, derivado inteiro daqui);
//   · os PORTAIS no `public/world.json`, acrescentados (nunca refaz o mundo de cima).
// Idempotente, determinístico (zero Math.random), com backup e `--check`.
//
//   node scripts/gen-underworld.mjs
//   node scripts/gen-underworld.mjs --check

import fs from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

const COLS = 12;
const ROWS = 12;
const SEA_TILE_FRAME = 33;
// Espelham src/game/constants.ts (DUNGEON_TILES / SOLID_UPPER_FRAMES).
// Os três frames de chão de caverna, ORDENADOS DO MAIS QUIETO PARA O MAIS BARULHENTO — 44 é
// quase liso, 43 tem manchas médias, 42 é feito de blocos grandes. A ordem importa porque o
// sorteio abaixo usa o primeiro como chão e os outros como sujeira: com 42 na frente, 2.957
// tiles viram uma grade de mosaico que grita mais alto que tudo o que existe na tela.
const FLOORS = [44, 43, 42];
const WALLS = [45, 46, 47];
const WALL_MOSS = 49;
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50]);
// Props que o herói NÃO remove — só estes contam como parede ao escolher onde pôr um portal.
const PERMANENT_PROPS = new Set(['campfire', 'toolbox', 'furnace', 'altar', 'pyre', 'ironRock']);

/** As quatro espécies que o mundo de cima nunca usa. Uma por tela, como manda a lei da casa. */
const UNDER_SPECIES = ['slime', 'bigslime', 'turret', 'mage'];

/** Em que telas nasce uma boca de caverna. Cantos + centro: espalhado, e fácil de decorar. */
const PORTAL_CHUNKS = [[0, 0], [4, 0], [2, 2], [0, 4], [4, 4]];

/**
 * Um hash posicional — o lugar do `Math.random()` num script que precisa ser determinístico.
 * Ele existe só para o chão e a parede não serem um carimbo só repetido 3.600 vezes.
 */
const hash = (x, y) => {
  const h = Math.imul(x * 73856093 ^ y * 19349663, 0x45d9f3b);
  return (h ^ (h >>> 15)) >>> 0;
};

const worldPath = fileURLToPath(new URL('../public/world.json', import.meta.url));
const underPath = fileURLToPath(new URL('../public/underworld.json', import.meta.url));
const backupPath = fileURLToPath(new URL('../backup/world-pre-portals.json', import.meta.url));
const check = process.argv.includes('--check');

const rawWorld = await fs.readFile(worldPath, 'utf8');
const world = JSON.parse(rawWorld);

const key = (x, y) => `${x},${y}`;
const chunkAt = (grid, x, y) => grid.find(
  (c) => c.cx === Math.floor(x / COLS) && c.cy === Math.floor(y / ROWS),
);
const localOf = (x, y) => [((x % COLS) + COLS) % COLS, ((y % ROWS) + ROWS) % ROWS];

// A ESCADA não conta como mobília ao escolher onde pôr uma escada: ela é
// pisável, e sem esta exceção a segunda rodada do script escolheria tiles diferentes da
// primeira — o script deixaria de ser idempotente por olhar o próprio trabalho.
const propAt = new Map();
for (const p of world.props ?? []) {
  // Escada e portal são PISÁVEIS: nenhum dos dois conta como mobília na hora de escolher onde
  // abrir uma escada. Sem esta exceção o script olha o próprio trabalho — a rodada seguinte vê
  // a escada que ele acabou de abrir, recusa aquele tile e escolhe outro, para sempre.
  if (p.type !== 'stairs' && p.type !== 'levelPortal') propAt.set(key(p.worldX, p.worldY), p);
}
const npcAt = new Set();
for (const c of world.chunks) for (const n of c.npcs ?? []) npcAt.add(key(n.worldX, n.worldY));

// ── O ESPELHO ───────────────────────────────────────────────────────────────
const WORLD_W = world.meta.worldChunksX * COLS;
const WORLD_H = world.meta.worldChunksY * ROWS;

/**
 * A CAVERNA É FECHADA POR PEDRA, e o anel externo inteiro é muro.
 *
 * Em cima o mundo termina em arvoredo e no fim dos chunks — funciona lá, porque o lado de fora
 * não existe e o runtime bloqueia por isso. Embaixo isso deixaria buracos: 11 tiles abertos só
 * na fileira do norte, encostando no nada. Uma caverna termina em ROCHA, e a rocha é a mesma
 * alvenaria de sempre — ela já bloqueia por estar em SOLID_UPPER, sem regra nova nenhuma.
 */
const isRim = (x, y) => x === 0 || y === 0 || x === WORLD_W - 1 || y === WORLD_H - 1;

const mirrorChunk = (chunk) => {
  const ground = [];
  const upper = [];
  const collisions = [];
  for (let ly = 0; ly < ROWS; ly += 1) {
    const gRow = [];
    const uRow = [];
    const cRow = [];
    for (let lx = 0; lx < COLS; lx += 1) {
      const wx = chunk.cx * COLS + lx;
      const wy = chunk.cy * ROWS + ly;
      const h = hash(wx, wy);
      const srcGround = chunk.ground[ly][lx];
      const srcUpper = chunk.upper[ly][lx];
      // NÃO HÁ MAR EMBAIXO DA TERRA. Onde em cima é oceano, aqui é ROCHA MACIÇA: uma caverna
      // termina em pedra, e uma parede de alvenaria diz isso sem precisar de uma regra nova —
      // ela já bloqueia por estar em SOLID_UPPER, como toda a alvenaria da casa.
      const sea = srcGround === SEA_TILE_FRAME || isRim(wx, wy);
      // O CHÃO É QUASE TODO O FRAME MAIS QUIETO, com os outros dois entrando como sujeira. Com
      // os três sorteados por igual, 2.957 tiles viram um xadrez que pisca — a variação vira
      // PADRÃO, e padrão lê como piso de banheiro, não como caverna.
      gRow.push(h % 23 === 0 ? FLOORS[2] : h % 6 === 0 ? FLOORS[1] : FLOORS[0]);
      if (sea || (srcUpper !== null && SOLID_UPPER.has(srcUpper))) {
        // Montanha, pinheiro e a borda do mundo viram ALVENARIA. O musgo entra raro, só para a
        // parede não ser um carimbo: é o mesmo bloco, com outra cara. ARCHOTE nenhum — não há
        // fogo aceso lá embaixo, e um archote é uma fogueira presa na parede.
        uRow.push(h % 12 === 0 ? WALL_MOSS : WALLS[h % WALLS.length]);
      } else {
        uRow.push(null); // decor de grama não desce: lá embaixo não cresce nada
      }
      cRow.push(chunk.collisions[ly][lx] === true || sea);
    }
    ground.push(gRow);
    upper.push(uRow);
    collisions.push(cRow);
  }
  return { cx: chunk.cx, cy: chunk.cy, ground, upper, collisions, enemies: [], pickups: [], npcs: [] };
};

const under = {
  meta: {
    ...world.meta,
    name: 'Under the Ashen Wilds',
    exportedAt: world.meta.exportedAt,
  },
  chunks: world.chunks.map(mirrorChunk),
  props: [],
  dialogs: {},
};

// ── ONDE FICAM AS BOCAS ─────────────────────────────────────────────────────
// Um portal precisa de chão livre nos DOIS andares. Como o subterrâneo copia a colisão e joga
// fora a mobília, todo tile livre em cima é livre embaixo — então basta escolher em cima.
const openAbove = (x, y) => {
  const chunk = chunkAt(world.chunks, x, y);
  if (!chunk) return false;
  const [lx, ly] = localOf(x, y);
  if (chunk.collisions[ly][lx]) return false;
  if (chunk.ground[ly][lx] === SEA_TILE_FRAME) return false;
  if (chunk.upper[ly][lx] !== null) return false;
  if (propAt.has(key(x, y))) return false;
  if (npcAt.has(key(x, y))) return false;
  // A pira é o fim do jogo: nada de escada colada nela.
  const pyre = (world.props ?? []).find((p) => p.type === 'pyre');
  if (pyre && Math.hypot(pyre.worldX - x, pyre.worldY - y) < 3) return false;
  return true;
};

/**
 * O lance de degraus corre para o NORTE (ver StairsObject), e o herói percorre meio tile por
 * ele ao atravessar. Então a escada precisa de chão livre ao norte — senão a descida acontece
 * dentro de uma parede — e de vizinhos por onde chegar. Sem esta pergunta o buscador em espiral
 * entrega o primeiro tile livre que achar, inclusive o canto 0,0 encravado na borda do mundo.
 */
const stairsFits = (x, y) => {
  if (!openAbove(x, y)) return false;
  if (!openAbove(x, y - 1)) return false;
  const around = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => openAbove(x + dx, y + dy));
  return around.length >= 3;
};

/** O tile livre mais perto do centro daquela tela — a busca é em espiral, e determinística. */
const portalTileIn = (cx, cy) => {
  const centerX = cx * COLS + Math.floor(COLS / 2);
  const centerY = cy * ROWS + Math.floor(ROWS / 2);
  for (let r = 0; r < Math.max(COLS, ROWS); r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = centerX + dx;
        const y = centerY + dy;
        if (stairsFits(x, y)) return [x, y];
      }
    }
  }
  return null;
};

const portals = [];
for (const [cx, cy] of PORTAL_CHUNKS) {
  const spot = portalTileIn(cx, cy);
  if (!spot) {
    console.error(`Sem tile livre para uma boca de caverna na tela ${cx},${cy}.`);
    process.exit(1);
  }
  portals.push(spot);
}

// O MESMO tile nos dois andares — é essa igualdade que faz descer e subir serem simétricos.
// A peça é uma ESCADA (StairsObject): um poço de pedra com degraus, que o herói desce ANDANDO.
for (const [x, y] of portals) {
  under.props.push({ type: 'stairs', worldX: x, worldY: y });
}
under.meta.playerStart = { worldX: portals[0][0], worldY: portals[0][1] };

// ── AS COVAS ────────────────────────────────────────────────────────────────
// Uma espécie por TELA (lei da casa), e só as quatro que o mundo de cima nunca usa. Só entra
// cova em tela que tenha chão de sobra, e nunca no tile de um portal.
const portalKeys = new Set(portals.map(([x, y]) => key(x, y)));
let dens = 0;
for (const chunk of under.chunks) {
  const species = UNDER_SPECIES[(chunk.cx * 5 + chunk.cy) % UNDER_SPECIES.length];
  const free = [];
  for (let ly = 0; ly < ROWS; ly += 1) {
    for (let lx = 0; lx < COLS; lx += 1) {
      const wx = chunk.cx * COLS + lx;
      const wy = chunk.cy * ROWS + ly;
      if (chunk.collisions[ly][lx] || chunk.upper[ly][lx] !== null) continue;
      if (chunk.ground[ly][lx] === SEA_TILE_FRAME) continue;
      if (portalKeys.has(key(wx, wy))) continue;
      free.push([wx, wy]);
    }
  }
  if (free.length < 24) continue; // tela apertada demais: sem cova
  // UMA cova por tela. O número que se olha não é covas por tela, é covas dentro de 14 tiles —
  // a distância de visão da caveira, que vale umas quatro telas (ver CLAUDE.md). A duas por
  // tela, o herói acordaria dez corpos de uma vez ao entrar num corredor.
  const spot = free[hash(chunk.cx, chunk.cy) % free.length];
  chunk.enemies.push({ type: species, worldX: spot[0], worldY: spot[1] });
  dens += 1;
}

// ── ESCREVE ─────────────────────────────────────────────────────────────────
const existingPortals = (world.props ?? []).filter((p) => p.type === 'stairs');
const portalsMatch = existingPortals.length === portals.length
  && portals.every(([x, y]) => existingPortals.some((p) => p.worldX === x && p.worldY === y));
const underText = `${JSON.stringify(under, null, 2)}\n`;
const currentUnder = await fs.readFile(underPath, 'utf8').catch(() => null);
const underMatch = currentUnder === underText;

if (portalsMatch && underMatch) {
  console.log(`Ponto fixo: ${portals.length} bocas de caverna e o espelho já no disco.`);
  process.exit(0);
}
if (check) {
  console.error('--check: o disco NÃO é o ponto fixo. Rode o script sem --check.');
  process.exit(1);
}

await fs.mkdir(fileURLToPath(new URL('../backup', import.meta.url)), { recursive: true });
await fs.writeFile(backupPath, rawWorld, 'utf8');
await fs.writeFile(underPath, underText, 'utf8');

if (!portalsMatch) {
  world.props = [...(world.props ?? []).filter((p) => p.type !== 'stairs' && p.type !== 'levelPortal')];
  for (const [x, y] of portals) world.props.push({ type: 'stairs', worldX: x, worldY: y });
  await fs.writeFile(worldPath, `${JSON.stringify(world, null, 2)}\n`, 'utf8');
}

console.log(
  `Espelho escrito: ${under.chunks.length} telas, ${dens} covas de `
  + `${UNDER_SPECIES.join('/')}, ${portals.length} bocas de caverna em `
  + `${portals.map(([x, y]) => `${x},${y}`).join(' · ')}.`,
);
