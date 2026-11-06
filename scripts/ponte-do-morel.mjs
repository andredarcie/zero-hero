// A PONTE DO MOREL PEDE O MACHADO (pedido do autor). Os dois gravetos soltos ao lado da ponte saem, e
// duas árvores secas, separadas, ficam a poucos passos: o herói fala com o Bram, ganha o machado, corta
// uma, leva o galho, corta a outra. A foice solta no vale também sai: só a Morte dá uma.
//
// A PROVA, partindo da Hollis e com todo prop de abrir aberto (a régua de arvores-secas.mjs):
// - nada que se alcançava antes deixa de se alcançar com as árvores no lugar;
// - cada árvore se alcança a pé e não tem água colada (o tombo dela viraria ponte de graça, TIMBER);
// - o morel continua só do outro lado da ponte.
//
// IDEMPOTENTE e DETERMINÍSTICO (mira no estado final).
//
//   node scripts/ponte-do-morel.mjs           # aplica
//   node scripts/ponte-do-morel.mjs --check   # só confere
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

export const TREES = [[7, 24], [11, 33]];
const REMOVED_PICKUPS = [['scythe', 13, 18], ['wood', 4, 32], ['wood', 4, 33]];
const MOREL = [2, 30];

// constants.SOLID_UPPER_FRAMES
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 73, 74]);
const SEA = 33;
const key = ([x, y]) => `${x},${y}`;
const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
const terrainSolid = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return true;
  const c = chunkOf(x, y);
  return c.collisions[y % CH][x % CW] || SOLID_UPPER.has(c.upper[y % CH][x % CW]) || c.ground[y % CH][x % CW] === SEA;
};
const relief = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : chunkOf(x, y).relief?.[y % CH]?.[x % CW] ?? 0);
// A regra de passo é a do jogo, num lugar só (scripts/relevo.mjs): o cume e as escadas dele inclusive.
const canStep = makeCanStep(relief);

// ── O QUE MUDA ──────────────────────────────────────────────────────────────────────────────
const isRemoved = (p) => REMOVED_PICKUPS.some(([type, x, y]) => p.type === type && p.worldX === x && p.worldY === y);
for (const c of world.chunks) if (c.pickups) c.pickups = c.pickups.filter((p) => !isRemoved(p));
const treeKeys = new Set(TREES.map(key));
const others = world.props.filter((p) => !(p.type === 'dryTree' && treeKeys.has(`${p.worldX},${p.worldY}`)));
world.props = [...others, ...TREES.map(([worldX, worldY]) => ({ type: 'dryTree', worldX, worldY }))];

// ── A PROVA ─────────────────────────────────────────────────────────────────────────────────
const npcs = new Set(world.chunks.flatMap((c) => c.npcs.map((n) => `${n.worldX},${n.worldY}`)));
const pickups = new Set(world.chunks.flatMap((c) => (c.pickups ?? []).map((p) => `${p.worldX},${p.worldY}`)));
const HOLLIS = world.chunks.flatMap((c) => c.npcs).find((n) => n.type === 'radiationSuit');
const NOT_OPENABLE = new Set(['water', 'lava', 'campfire', 'hearth', 'toolbox', 'bridgeSpot']);
const propAt = new Map(others.map((p) => [`${p.worldX},${p.worldY}`, p.type]));

const reach = (passable) => {
  const start = [HOLLIS.worldX, HOLLIS.worldY + 1];
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
const open = (withTrees) => (x, y, k) => {
  if (treeKeys.has(k)) return !withTrees;
  if (terrainSolid(x, y) || npcs.has(k)) return false;
  return !NOT_OPENABLE.has(propAt.get(k));
};

const problems = [];
const before = reach(open(false));
const after = reach(open(true));
const lost = [...before].filter((k) => !after.has(k) && !treeKeys.has(k));
if (lost.length) problems.push(`as árvores fechariam: ${lost.join(' ')}`);
if (after.has(key(MOREL))) problems.push('o morel se alcança sem a ponte');
const bridge = others.find((p) => p.type === 'bridgeSpot');
const sides = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => `${x + dx},${y + dy}`);
if (!bridge || !sides(bridge.worldX, bridge.worldY).some((k) => after.has(k))) problems.push('a ponte não se alcança');
for (const [x, y] of TREES) {
  const k = `${x},${y}`;
  if (terrainSolid(x, y) || relief(x, y) !== 0 || chunkOf(x, y).upper[y % CH][x % CW] !== null) problems.push(`${k}: o tile não é chão livre`);
  if (propAt.has(k) || pickups.has(k) || npcs.has(k)) problems.push(`${k}: o tile já tem uma coisa`);
  if (!sides(x, y).some((s) => after.has(s))) problems.push(`${k}: não se alcança a pé`);
  if (sides(x, y).some((s) => propAt.get(s) === 'water' || propAt.get(s) === 'bridgeSpot')) problems.push(`${k}: água colada (TIMBER)`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const out = `${JSON.stringify(world, null, 2)}\n`;
if (check) {
  if (out.trim() !== raw.split('\r\n').join('\n').trim()) {
    console.error('world.json NÃO é o ponto fixo de ponte-do-morel.mjs');
    process.exit(1);
  }
  console.log('world.json OK: duas árvores secas perto da ponte do morel, sem gravetos nem foice soltos; a prova de BFS passa.');
} else {
  fs.writeFileSync(worldPath, out);
  console.log('world.json: duas árvores secas perto da ponte do morel, gravetos e foice soltos removidos; a prova de BFS passa.');
}
