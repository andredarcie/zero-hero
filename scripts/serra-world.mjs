// A SERRA — planaltos de um nivel acima do chao, com uma escada para subir (ver
// src/game/world/relief.ts). Este script LE o `world.json` e escreve o campo `relief` dos chunks;
// nada mais muda (nem chao, nem props, nem itens), exceto a decoracao rasteira do tile da escada,
// que sai porque a escada a cobriria.
//
// Cada serra nasce de uma elipse com a borda mexida por ruido de hash (zero Math.random), e so
// ocupa tile ABERTO: chao andavel, sem arvore, sem prop, sem item, sem NPC. Depois disso:
//   • a forma e "lixada": tile com menos de dois vizinhos de planalto sai (nada de dente fino);
//   • fica so o maior pedaco;
//   • a ESCADA vai na face SUL (sobe para o norte, de frente para a camera); a serra larga ganha uma
//     segunda na face oeste;
//   • A PROVA: tudo o que se alcancava do ponto inicial andando pelo chao continua alcancavel. Uma
//     serra que corta um caminho e descartada inteira (com aviso), nunca "consertada".
//
// Duas coisas depois disso, as duas sem tocar em caminho nenhum do chao:
//   • ARVORES NO PLANALTO: uma ou duas no meio de cada serra, se o resto dela continuar ligado.
//   • A SERRA DE MATA: tile de arvore fechada sobe um nivel, raramente dois (codigos 6-7). Ninguem pisa
//     ali, entao nao ha o que provar; a unica trava e a camera: um morro nao pode tapar quem anda ao
//     norte dele, entao ele so sobe tantos niveis quantos tiles fechados tiver para o norte.
//
// IDEMPOTENTE e DETERMINISTICO. `--check` falha se o disco nao for o ponto fixo.
//
//   node scripts/serra-world.mjs                  # aplica
//   node scripts/serra-world.mjs --check          # so confere
//   node scripts/serra-world.mjs --world arq.json # noutro arquivo
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const worldFlag = process.argv.indexOf('--world');
const worldPath = worldFlag > 0 ? path.resolve(process.argv[worldFlag + 1]) : path.resolve(here, '../public/world.json');
const check = process.argv.includes('--check');

const raw = fs.readFileSync(worldPath, 'utf8');
const world = JSON.parse(raw);
const { worldChunksX, worldChunksY, chunkColumns: CW, chunkRows: CH } = world.meta;
const W = worldChunksX * CW;
const H = worldChunksY * CH;

// O mesmo SOLID_UPPER de cozy-world.mjs (constants.SOLID_UPPER_FRAMES).
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40]);
const SEA = 33;
const HIGH = 1;
// Os codigos da escada (world/relief.ts): 2 sobe para o norte, 3 leste, 4 sul, 5 oeste.
const STAIR_NORTH = 2;
const STAIR_EAST = 3;
const UP = { [STAIR_NORTH]: [0, -1], [STAIR_EAST]: [1, 0] };

// As serras: centro e raios em tiles, nos campos abertos do vale. A ordem e a de autoria.
const RIDGES = [
  { name: 'prado do leste', cx: 53, cy: 30.5, rx: 3.6, ry: 2.2, west: true },
  { name: 'campo do sudoeste', cx: 7, cy: 31.5, rx: 2.7, ry: 1.7, west: false },
  { name: 'planicie do sul', cx: 21, cy: 43.5, rx: 3.8, ry: 1.9, west: true },
  { name: 'prado do centro-leste', cx: 47, cy: 20, rx: 3.4, ry: 1.5, west: false },
  { name: 'estrada do centro', cx: 31, cy: 20, rx: 3.4, ry: 1.2, west: false },
  { name: 'campo do centro-sul', cx: 36, cy: 43, rx: 3.8, ry: 2.2, west: true },
  { name: 'prado do sudeste', cx: 52, cy: 42.5, rx: 3.6, ry: 2, west: true },
  { name: 'ponta do sudoeste', cx: 5, cy: 44.5, rx: 2.8, ry: 1.7, west: false },
  { name: 'vale do sul', cx: 9, cy: 54.5, rx: 3.2, ry: 1.5, west: false },
  { name: 'campo do sul', cx: 19, cy: 54, rx: 3, ry: 1.5, west: true },
  { name: 'margem do sudeste', cx: 49.5, cy: 55, rx: 3, ry: 1.3, west: false },
  { name: 'campina do noroeste', cx: 16, cy: 7, rx: 2.8, ry: 1.4, west: false },
];

// Onde as quests acontecem: nada de serra aqui (a horta e a terra da fogueira precisam de chao).
const RESERVED = [
  { name: 'Iris', x0: 12, y0: 15, x1: 22, y1: 23 },
  { name: 'Bram', x0: 49, y0: 2, x1: 59, y1: 11 },
  { name: 'Hollis', x0: 2, y0: 37, x1: 9, y1: 43 },
  { name: 'Vega', x0: 37, y0: 2, x1: 47, y1: 9 },
  { name: 'Vizinho do sul', x0: 27, y0: 50, x1: 35, y1: 59 },
];
const reserved = (x, y) => RESERVED.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
// As arvores que este script pos em planalto (saem antes de recomecar: ver abaixo).
const TREE_FRAMES = [3, 14, 15, 16];
// So arvore sobe o morro: pedra e parede de dungeon tem o proprio cubo, que ficaria enterrado.
const CLOSED_TREES = new Set([3, 4, 14, 15, 16, 17, 18, 21, 36, 37]);
const SCENIC_BASE = 5;
// O maior trecho reto que a beira de um planalto pode ter.
const MAX_STRAIGHT = 3;
// A borda mordida tira tile, entao os raios crescem. Serra que corta caminho tenta o tamanho seguinte
// antes de desistir: o primeiro que cabe fica.
const GROWS = [1.4, 1.25, 1.1, 1];

const chunkAt = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
const local = (x, y) => [((y % CH) + CH) % CH, ((x % CW) + CW) % CW];
const cellOf = (x, y) => {
  const c = chunkAt(x, y);
  const [r, col] = local(x, y);
  return { c, r, col };
};
const key = (x, y) => `${x},${y}`;

// Recomeca do zero a cada rodada: o resultado depende so do mundo, nunca da serra anterior.
for (const chunk of world.chunks) {
  // Arvore em cima de planalto so existe porque este script a pos.
  for (let r = 0; r < CH; r += 1) {
    for (let col = 0; col < CW; col += 1) {
      if (chunk.relief?.[r]?.[col] !== HIGH || !chunk.collisions[r][col]) continue;
      chunk.collisions[r][col] = false;
      chunk.upper[r][col] = null;
    }
  }
  delete chunk.relief;
}

const propAt = new Map(world.props.map((p) => [key(p.worldX, p.worldY), p.type]));
const taken = new Set([
  ...world.chunks.flatMap((c) => c.pickups).map((p) => key(p.worldX, p.worldY)),
  ...world.chunks.flatMap((c) => c.npcs).map((n) => key(n.worldX, n.worldY)),
]);
const start = world.meta.playerStart;

const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const groundOpen = (x, y) => {
  if (!inside(x, y)) return false;
  const { c, r, col } = cellOf(x, y);
  return c.ground[r][col] !== SEA && !c.collisions[r][col] && !SOLID_UPPER.has(c.upper[r][col] ?? -1);
};
// Tile que pode virar serra: andavel, vazio, longe do ponto inicial e de quem mora no vale.
const free = (x, y) => groundOpen(x, y) && !propAt.has(key(x, y)) && !taken.has(key(x, y))
  && Math.hypot(x - start.worldX, y - start.worldY) > 3 && !reserved(x, y);

// A relief atual, num mapa so (o que vai para os chunks no fim).
const relief = new Map();

// Andar pelo CHAO: serra e escada barram (a prova nao conta subir — conta nao perder caminho).
const walkable = (x, y) => groundOpen(x, y) && !relief.has(key(x, y))
  && (!propAt.has(key(x, y)) || ['plantSpot', 'moonflower', 'gardenGate', 'tallGrass'].includes(propAt.get(key(x, y))));
const flood = () => {
  const seen = new Set([key(start.worldX, start.worldY)]);
  const queue = [[start.worldX, start.worldY]];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy; const k = key(nx, ny);
      if (seen.has(k) || !walkable(nx, ny)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return seen;
};
const baseline = flood();

/** Ruido de hash por tile em [-0.5, 0.5): a borda da serra nao e uma elipse de compasso. */
const noise = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296 - 0.5;
};

const placed = [];
const done = new Set();
const attempts = RIDGES.flatMap((r) => GROWS.map((grow, i) => ({ ...r, grow, last: i === GROWS.length - 1 })));
const giveUp = (ridge, message) => { if (ridge.last) console.warn(message); };
for (const ridge of attempts) {
  if (done.has(ridge.name)) continue;
  const tiles = new Set();
  for (let y = Math.floor(ridge.cy - ridge.ry - 3); y <= Math.ceil(ridge.cy + ridge.ry + 3); y += 1) {
    for (let x = Math.floor(ridge.cx - ridge.rx - 3); x <= Math.ceil(ridge.cx + ridge.rx + 3); x += 1) {
      const d = ((x - ridge.cx) / (ridge.rx * ridge.grow)) ** 2 + ((y - ridge.cy) / (ridge.ry * ridge.grow)) ** 2;
      // Dois ruidos: o miudo morde a beira, e o de dois tiles abre lobulos e reentrancias.
      const lobe = noise(Math.floor(x / 2) + 41, Math.floor(y / 2) + 97);
      if (d + noise(x, y) * 0.9 + lobe * 0.8 <= 1 && free(x, y)) tiles.add(key(x, y));
    }
  }
  // A lixa: tira o que ficou com menos de dois vizinhos, ate parar de mudar.
  const sand = () => {
    for (let changed = true; changed;) {
      changed = false;
      for (const k of [...tiles]) {
        const [x, y] = k.split(',').map(Number);
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => tiles.has(key(x + dx, y + dy))).length;
        if (n < 2) { tiles.delete(k); changed = true; }
      }
    }
  };
  sand();
  // A QUEBRA: beira reta com mais de tres tiles leva uma mordida, ate nao sobrar reta nenhuma.
  const biteLongEdge = () => {
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const [ax, ay] = [Math.abs(dy), Math.abs(dx)];
      const open = (x, y) => tiles.has(key(x, y)) && !tiles.has(key(x + dx, y + dy));
      for (const k of tiles) {
        const [x, y] = k.split(',').map(Number);
        if (!open(x, y) || open(x - ax, y - ay)) continue;
        let run = 1;
        while (open(x + ax * run, y + ay * run)) run += 1;
        if (run <= MAX_STRAIGHT) continue;
        const at = 1 + Math.floor((noise(x, y) + 0.5) * (run - 2));
        tiles.delete(key(x + ax * at, y + ay * at));
        return true;
      }
    }
    return false;
  };
  for (let bites = 0; bites < 60 && biteLongEdge(); bites += 1) sand();
  // O maior pedaco.
  let best = new Set();
  const left = new Set(tiles);
  while (left.size) {
    const first = left.values().next().value;
    const part = new Set([first]);
    const queue = [first];
    left.delete(first);
    while (queue.length) {
      const [x, y] = queue.shift().split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = key(x + dx, y + dy);
        if (!left.has(k)) continue;
        left.delete(k);
        part.add(k);
        queue.push(k);
      }
    }
    if (part.size > best.size) best = part;
  }
  if (best.size < 8) { giveUp(ridge, `serra "${ridge.name}": so ${best.size} tiles, descartada`); continue; }

  // A ESCADA: um tile livre encostado no planalto, com chao livre na ponta de baixo.
  const stairFor = (code) => {
    const [ux, uy] = UP[code];
    let pick = null;
    for (const k of best) {
      const [x, y] = k.split(',').map(Number);
      const sx = x - ux; const sy = y - uy; // a escada, do lado de baixo deste tile
      const lx = sx - ux; const ly = sy - uy; // o chao de onde se sobe
      if (best.has(key(sx, sy)) || !free(sx, sy) || relief.has(key(sx, sy))) continue;
      if (!free(lx, ly) || best.has(key(lx, ly)) || relief.has(key(lx, ly))) continue;
      // Paredes da escada: os dois lados dela nao podem ser planalto (ela ficaria enterrada).
      const [vx, vy] = [-uy, ux];
      if (best.has(key(sx + vx, sy + vy)) || best.has(key(sx - vx, sy - vy))) continue;
      const score = code === STAIR_NORTH ? Math.abs(sx - ridge.cx) : Math.abs(sy - ridge.cy);
      if (!pick || score < pick.score) pick = { x: sx, y: sy, score };
    }
    return pick;
  };
  const stairs = [];
  const south = stairFor(STAIR_NORTH);
  if (!south) { giveUp(ridge, `serra "${ridge.name}": sem lugar para a escada, descartada`); continue; }
  stairs.push({ ...south, code: STAIR_NORTH });
  if (ridge.west) {
    const west = stairFor(STAIR_EAST);
    if (west) stairs.push({ ...west, code: STAIR_EAST });
  }

  for (const k of best) relief.set(k, HIGH);
  for (const s of stairs) relief.set(key(s.x, s.y), s.code);
  // A PROVA: nenhum tile do chao que se alcancava deixa de ser alcancado.
  const after = flood();
  const lost = [...baseline].filter((k) => !relief.has(k) && !after.has(k));
  if (lost.length > 0) {
    for (const k of best) relief.delete(k);
    for (const s of stairs) relief.delete(key(s.x, s.y));
    giveUp(ridge, `serra "${ridge.name}": cortaria ${lost.length} tiles do caminho, descartada`);
    continue;
  }
  // A escada cobre a decoracao rasteira do tile dela.
  for (const s of stairs) {
    const { c, r, col } = cellOf(s.x, s.y);
    c.upper[r][col] = null;
  }
  // AS ARVORES: no miolo da serra, onde as quatro voltas sao planalto. Cada uma so fica se o resto do
  // planalto continuar um pedaco so, ligado a escada.
  const stay = new Set(best);
  const connected = () => {
    const first = [...stay][0];
    const seen = new Set([first]);
    const queue = [first];
    while (queue.length) {
      const [x, y] = queue.shift().split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = key(x + dx, y + dy);
        if (!stay.has(k) || seen.has(k)) continue;
        seen.add(k);
        queue.push(k);
      }
    }
    return seen.size === stay.size;
  };
  const inner = [...best].filter((k) => {
    const [x, y] = k.split(',').map(Number);
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => best.has(key(x + dx, y + dy)));
  }).sort((a, b) => noise(...a.split(',').map(Number)) - noise(...b.split(',').map(Number)));
  let trees = 0;
  for (const k of inner) {
    if (trees >= Math.min(3, Math.floor(best.size / 9))) break;
    stay.delete(k);
    const stairTop = stairs.every((st) => {
      const [ux, uy] = UP[st.code];
      return stay.has(key(st.x + ux, st.y + uy));
    });
    if (!stairTop || !connected()) { stay.add(k); continue; }
    const [x, y] = k.split(',').map(Number);
    const { c, r, col } = cellOf(x, y);
    c.upper[r][col] = TREE_FRAMES[Math.floor((noise(x, y) + 0.5) * TREE_FRAMES.length)];
    c.collisions[r][col] = true;
    trees += 1;
  }
  done.add(ridge.name);
  placed.push(`${ridge.name} (${best.size} tiles, ${trees} arvores, ${stairs.length} escada${stairs.length > 1 ? 's' : ''})`);
}

// A SERRA DE MATA: so arvore fechada, e so tanto quanto a camera deixa (ver o topo).
const smoothNoise = (x, y) => {
  const ix = Math.floor(x); const iy = Math.floor(y);
  const tx = x - ix; const ty = y - iy;
  const sx = tx * tx * (3 - 2 * tx); const sy = ty * ty * (3 - 2 * ty);
  const a = noise(ix, iy); const b = noise(ix + 1, iy); const c = noise(ix, iy + 1); const d = noise(ix + 1, iy + 1);
  return 0.5 + (a + (b - a) * sx + (c - a + (a - b + d - c) * sx) * sy);
};
const closedTree = (x, y) => {
  if (!inside(x, y) || propAt.has(key(x, y)) || taken.has(key(x, y)) || relief.has(key(x, y))) return false;
  const { c, r, col } = cellOf(x, y);
  return c.ground[r][col] !== SEA && c.collisions[r][col] && CLOSED_TREES.has(c.upper[r][col] ?? -1);
};
let scenic = 0;
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    if (!closedTree(x, y)) continue;
    let room = 0;
    while (room < 2 && (y - room - 1 < 0 || closedTree(x, y - room - 1))) room += 1;
    const n = smoothNoise(x / 3.3 + 21, y / 2.7 + 8);
    const level = Math.min(room, n > 0.8 ? 2 : n > 0.35 ? 1 : 0);
    if (level <= 0) continue;
    relief.set(key(x, y), SCENIC_BASE + level);
    scenic += 1;
  }
}
placed.push(`mata na serra (${scenic} tiles)`);

// Para os chunks: so quem tem serra carrega a grade.
for (const [k, v] of relief) {
  const [x, y] = k.split(',').map(Number);
  const { c, r, col } = cellOf(x, y);
  c.relief ??= Array.from({ length: CH }, () => Array.from({ length: CW }, () => 0));
  c.relief[r][col] = v;
}
// A chave entra na ordem do esquema (depois de `collisions`), para o diff do world.json ficar limpo.
world.chunks = world.chunks.map((c) => {
  if (!c.relief) return c;
  const { pickups, npcs, ...rest } = c;
  return { ...rest, pickups, npcs };
});

const out = `${JSON.stringify(world, null, 2)}\n`;
if (check) {
  if (out !== raw) { console.error('world.json NAO e o ponto fixo de serra-world.mjs'); process.exit(1); }
  console.log('world.json ok (ponto fixo da serra)');
} else {
  fs.writeFileSync(worldPath, out);
  console.log(`serras: ${placed.join(' · ') || 'nenhuma'}`);
}
