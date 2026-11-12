// O CHÃO DA PEDRA DE MEDITAR (pedido do autor, 2026-11-12; objects/MeditationSpot.ts, com a MESMA tabela de tiles): o
// alto da colina de capim ao norte do centro do vale, o ponto mais longe de tudo no mapa. As peças (a pedra com a
// almofada e a pilha de pedras) são objetos do código; aqui só o chão: os dois tiles delas ficam limpos de enfeite,
// e a prova de BFS garante que, do começo da aventura, sem ferramenta nenhuma, o herói chega à frente da pedra.
//
// LÊ o world.json e acrescenta, como o CLAUDE.md manda: IDEMPOTENTE e DETERMINÍSTICO.
//
//   node scripts/meditacao.mjs           # aplica
//   node scripts/meditacao.mjs --check   # só confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeCanStep } from './relevo.mjs';

// A MESMA tabela de objects/MeditationSpot.ts: mudou lá, muda aqui.
const SEAT = [30, 20];
const CAIRN = [32, 20];
/** O tile logo atrás da pedra: o fundo do herói sentado (o enfeite dele sai, ver abaixo). */
const BEHIND_SEAT = [30, 19];
/** De onde o Z alcança a pedra (pelo menos um tem de ser chão alcançável). */
const FRONTS = [[30, 21], [31, 20], [29, 20], [30, 19]];
/** O alto da colina: as duas peças ficam nele, no mesmo nível. */
const PLATEAU_LEVEL = 1;

const here = path.dirname(fileURLToPath(import.meta.url));
const worldPath = path.resolve(here, '../public/world.json');
const check = process.argv.includes('--check');
const raw = fs.readFileSync(worldPath, 'utf8');
const world = JSON.parse(raw);
const { worldChunksX, worldChunksY, chunkColumns: CW, chunkRows: CH } = world.meta;
const W = worldChunksX * CW;
const H = worldChunksY * CH;
const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
const relief = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : chunkOf(x, y).relief?.[y % CH]?.[x % CW] ?? 0);
// constants.SOLID_UPPER_FRAMES
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 73, 74]);
const SEA = 33;
const key = (x, y) => `${x},${y}`;

const problems = [];
const taken = new Set([
  ...world.props.map((p) => key(p.worldX, p.worldY)),
  ...world.chunks.flatMap((c) => [...(c.pickups ?? []), ...c.npcs].map((p) => key(p.worldX, p.worldY))),
]);
for (const [x, y] of [SEAT, CAIRN]) {
  const c = chunkOf(x, y);
  const lx = x % CW;
  const ly = y % CH;
  if (c.collisions[ly][lx]) problems.push(`o tile ${key(x, y)} é sólido`);
  if (c.ground[ly][lx] === SEA) problems.push(`o tile ${key(x, y)} é água`);
  if (taken.has(key(x, y))) problems.push(`há uma peça do mapa em ${key(x, y)}`);
  if (relief(x, y) !== PLATEAU_LEVEL) problems.push(`o tile ${key(x, y)} não está no alto da colina (relevo ${relief(x, y)})`);
  // Chão + UMA coisa: o enfeite do tile sai (a pedra é a coisa).
  c.upper[ly][lx] = null;
}
// O FUNDO DE QUEM SENTA: o tufo de capim alto logo atrás da pedra sai. Sentado de pernas cruzadas o herói é mais baixo
// que de pé, e o tufo aparecia entre os chifres dele, como uma planta no elmo. Só enfeite rasteiro: árvore nunca.
for (const [x, y] of [BEHIND_SEAT]) {
  const c = chunkOf(x, y);
  const was = c.upper[y % CH][x % CW];
  if (SOLID_UPPER.has(was)) problems.push(`atrás da pedra, em ${key(x, y)}, há uma peça sólida (${was}): não se apaga`);
  else c.upper[y % CH][x % CW] = null;
}

// ── A PROVA: do começo, com as peças sólidas e sem ferramenta nenhuma, chega-se à frente da pedra. ─────────
const canStep = makeCanStep(relief);
const solid = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return true;
  const c = chunkOf(x, y);
  const lx = x % CW;
  const ly = y % CH;
  return c.collisions[ly][lx] || SOLID_UPPER.has(c.upper[ly][lx]) || c.ground[ly][lx] === SEA
    || taken.has(key(x, y)) || key(x, y) === key(...SEAT) || key(x, y) === key(...CAIRN);
};
const start = [world.meta.playerStart.worldX, world.meta.playerStart.worldY];
const dist = new Map([[key(...start), 0]]);
const q = [start];
while (q.length) {
  const [x, y] = q.shift();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (dist.has(key(nx, ny)) || solid(nx, ny) || !canStep(x, y, nx, ny)) continue;
    dist.set(key(nx, ny), dist.get(key(x, y)) + 1);
    q.push([nx, ny]);
  }
}
const reach = FRONTS.map(([x, y]) => dist.get(key(x, y))).filter((d) => d !== undefined);
if (!reach.length) problems.push('do começo não se chega à frente da pedra');
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const out = `${JSON.stringify(world, null, 2)}\n`;
const same = out.trim() === raw.split('\r\n').join('\n').trim();
const summary = `a pedra em ${key(...SEAT)} e a pilha em ${key(...CAIRN)}, a ${Math.min(...reach)} passos do começo`;
if (check) {
  if (!same) { console.error('world.json NÃO é o ponto fixo de meditacao.mjs'); process.exit(1); }
  console.log(`world.json OK: ${summary}; a prova passa.`);
} else {
  if (!same) fs.writeFileSync(worldPath, out);
  console.log(`world.json: ${summary}; a prova passa.`);
}
