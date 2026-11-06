// AS ÁRVORES SECAS FICAM RARAS — a quest do Bram pede que o herói ande e procure (pedido do autor).
// Só `KEEP` continua seca, e a mais perto do cepo está a mais de trinta passos; as outras viram árvore
// verde, que é tile e nunca sai do lugar. Por isso a PROVA: partindo do Bram, com todo prop de abrir
// aberto, o que se alcançava antes continua se alcançando; e cada árvore que fica se alcança a pé.
//
// IDEMPOTENTE e DETERMINÍSTICO (mira no estado final, igual a trilhas-cogumelos.mjs).
//
//   node scripts/arvores-secas.mjs           # aplica
//   node scripts/arvores-secas.mjs --check   # só confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeCanStep } from './relevo.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const worldPath = path.resolve(here, '../public/world.json');
const check = process.argv.includes('--check');

const raw = fs.readFileSync(worldPath, 'utf8');
const world = JSON.parse(raw);
const { worldChunksX, worldChunksY, chunkColumns: CW, chunkRows: CH } = world.meta;
const W = worldChunksX * CW;
const H = worldChunksY * CH;

// constants.SOLID_UPPER_FRAMES
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 73, 74]);
const GREEN_FRAMES = new Set([3, 4, 14, 15]);
const SEA = 33;

// As duas últimas são as da ponte do morel (scripts/ponte-do-morel.mjs).
const KEEP = [[43, 30], [40, 29], [39, 3], [45, 2], [21, 28], [14, 28], [17, 5], [8, 19], [7, 24], [11, 33]];
const REPLACED = [
  [50, 1], [52, 1], [56, 1], [50, 3], [52, 3], [56, 3], [58, 3], [50, 10], [52, 10], [56, 10], [58, 10],
  [48, 5], [48, 6], [48, 7], [37, 1], [38, 1], [46, 1], [18, 6], [16, 4],
  [6, 16], [4, 14], [4, 16], [5, 19], [3, 21], [2, 14],
  [8, 36], [8, 37], [8, 38], [8, 39], [8, 40], [9, 40], [10, 40], [11, 40],
];
// A porta de um recanto do lago: verde, ela o selaria para sempre, então segue seca.
const DOOR = [[1, 13]];
const key = ([x, y]) => `${x},${y}`;
const replaced = new Set(REPLACED.map(key));

const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
const upperAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : chunkOf(x, y).upper[y % CH][x % CW]);
const terrainSolid = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return true;
  const c = chunkOf(x, y);
  return c.collisions[y % CH][x % CW] || SOLID_UPPER.has(c.upper[y % CH][x % CW]) || c.ground[y % CH][x % CW] === SEA;
};

// O PLANALTO (relief, ver world/relief.ts): 0 chão, 1 planalto, 2-5 escada subindo N/L/S/O. Só se
// muda de nível pela escada, então a prova anda por `canStep` como o herói.
const relief = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : chunkOf(x, y).relief?.[y % CH]?.[x % CW] ?? 0);
// A regra de passo é a do jogo, num lugar só (scripts/relevo.mjs): o cume e as escadas dele inclusive.
const canStep = makeCanStep(relief);

// A espécie da árvore que já cresce mais perto, para não destoar do bosque em volta.
const nearestGreen = (x, y) => {
  for (let r = 1; r <= 24; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const frame = upperAt(x + dx, y + dy);
        if (GREEN_FRAMES.has(frame) && !replaced.has(`${x + dx},${y + dy}`)) return frame;
      }
    }
  }
  return 14;
};

// ── A PROVA ─────────────────────────────────────────────────────────────────────────────────
const BRAM = world.chunks.flatMap((c) => c.npcs).find((n) => n.type === 'businessMan');
const npcs = new Set(world.chunks.flatMap((c) => c.npcs.map((n) => `${n.worldX},${n.worldY}`)));
const NOT_OPENABLE = new Set(['water', 'lava', 'campfire', 'hearth', 'toolbox']);

const reach = (passable) => {
  const start = [BRAM.worldX, BRAM.worldY];
  const seen = new Set([key(start)]);
  const q = [start];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (seen.has(k) || !canStep(x, y, x + dx, y + dy) || !passable(x + dx, y + dy, k)) continue;
      seen.add(k);
      q.push([x + dx, y + dy]);
    }
  }
  return seen;
};

const original = new Map(world.props.map((p) => [`${p.worldX},${p.worldY}`, p.type]));
const openWith = (solidReplaced) => (x, y, k) => {
  if (replaced.has(k)) return !solidReplaced;
  if (terrainSolid(x, y) || npcs.has(k)) return false;
  const type = original.get(k);
  return !type || !NOT_OPENABLE.has(type);
};
const before = reach(openWith(false));
const after = reach(openWith(true));
const lost = [...before].filter((k) => !after.has(k) && !replaced.has(k));

const problems = [];
if (lost.length) problems.push(`viraria árvore e fecharia: ${lost.join(' ')}`);
const bare = reach((x, y, k) => !replaced.has(k) && !terrainSolid(x, y) && !npcs.has(k) && !original.has(k));
for (const tile of KEEP) {
  const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => bare.has(`${tile[0] + dx},${tile[1] + dy}`));
  if (!touches) problems.push(`a árvore seca ${tile} não se alcança a pé`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

// ── O QUE MUDA ──────────────────────────────────────────────────────────────────────────────
world.props = world.props.filter((p) => !(p.type === 'dryTree' && replaced.has(`${p.worldX},${p.worldY}`)));
for (const [x, y] of REPLACED) {
  const c = chunkOf(x, y);
  if (!SOLID_UPPER.has(c.upper[y % CH][x % CW])) c.upper[y % CH][x % CW] = nearestGreen(x, y);
}
const left = world.props.filter((p) => p.type === 'dryTree').map((p) => `${p.worldX},${p.worldY}`).sort();
if (left.join(' ') !== [...KEEP, ...DOOR].map(key).sort().join(' ')) {
  console.error(`as árvores secas no mundo não são KEEP: ${left.join(' ')}`);
  process.exit(1);
}

const out = `${JSON.stringify(world, null, 2)}\n`;
if (check) {
  if (out.trim() !== raw.split('\r\n').join('\n').trim()) {
    console.error('world.json NÃO é o ponto fixo de arvores-secas.mjs');
    process.exit(1);
  }
  console.log(`world.json OK: ${KEEP.length + DOOR.length} árvores secas, e a prova de BFS passa.`);
} else {
  fs.writeFileSync(worldPath, out);
  console.log(`world.json: ${REPLACED.length} árvores secas viraram verdes, ${KEEP.length + DOOR.length} ficaram; a prova de BFS passa.`);
}
