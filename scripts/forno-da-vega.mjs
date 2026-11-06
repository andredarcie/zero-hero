// O FORNO DA VEGA E A PICARETA SÓ DELA (pedido do autor).
//
// - Nenhuma picareta solta no vale: a única forma de ter uma é a Vega entregar (AstronomerQuest.give).
// - O chão de pedra acima da nave vira floresta (pinheiros): pedra no vale, só na margem do lago de
//   lava (scripts/pedras-na-lava.mjs). As quatro pedras do chão na linha 10 ficam: são as aberturas da
//   cerca viva por onde se sai da área dela.
// - O FORNO JÁ EXISTE, fixo, à direita da fogueira dela: o jogador não constrói forno (a receita saiu
//   da bancada). Ele é o guia da quest — pede o próximo item e devolve o resultado (AstronomerQuest).
//
// A PROVA, partindo do começo da aventura: nenhum NPC, item ou prop que se alcançava a pé deixa de se
// alcançar (os tiles que viram floresta e o do forno saem da conta, porque passam a ser sólidos).
//
// IDEMPOTENTE e DETERMINÍSTICO. Backup (só na primeira vez) em backup/world-pre-forno-da-vega.json.
//
//   node scripts/forno-da-vega.mjs           # aplica
//   node scripts/forno-da-vega.mjs --check   # só confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeCanStep } from './relevo.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const worldPath = path.resolve(here, '../public/world.json');
const backupPath = path.resolve(here, '../backup/world-pre-forno-da-vega.json');
const check = process.argv.includes('--check');

const raw = fs.readFileSync(worldPath, 'utf8');
const world = JSON.parse(raw);
const { worldChunksX, worldChunksY, chunkColumns: CW, chunkRows: CH } = world.meta;
const W = worldChunksX * CW;
const H = worldChunksY * CH;

/** O chão de pedra acima da nave (linhas 1..3). */
const FLOOR_BOX = { x0: 35, y0: 0, x1: 48, y1: 3 };
const STONE_FLOOR = new Set([23, 24, 57, 58, 59, 60]);
const GROUND = 5;
/**
 * Fica grama, sem pinheiro: a passagem até a árvore seca de (45,2), que é uma das raras da quest do Bram
 * (scripts/arvores-secas.mjs) — sem ela a floresta a cercava.
 */
const KEEP_OPEN = new Set(['45,3']);
/** Os pinheiros da floresta nova, escolhidos pelo hash da coordenada. */
const PINES = [4, 14, 17, 18];
/**
 * O forno: ao lado da bancada, à direita da fogueira da Vega, boca para baixo (dir 2). Em (45,5) ele fechava,
 * com os dois arbustos dos lados, o único acesso à árvore seca de (45,2).
 */
export const FURNACE = { x: 44, y: 6, dir: 2 };

const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 73, 74]);
const SEA = 33;
const key = (x, y) => `${x},${y}`;
const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
const at = (x, y) => { const c = chunkOf(x, y); return { c, lx: x % CW, ly: y % CH }; };
const relief = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : chunkOf(x, y).relief?.[y % CH]?.[x % CW] ?? 0);
// A regra de passo é a do jogo, num lugar só (scripts/relevo.mjs): o cume e as escadas dele inclusive.
const canStep = makeCanStep(relief);
const NOT_OPENABLE = new Set(['water', 'lava', 'campfire', 'hearth', 'toolbox', 'bridgeSpot', 'rock', 'ironRock', 'coalRock', 'furnace']);
const reach = () => {
  const npcs = new Set(world.chunks.flatMap((c) => c.npcs.map((n) => key(n.worldX, n.worldY))));
  const propAt = new Map(world.props.map((p) => [key(p.worldX, p.worldY), p.type]));
  const solid = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    const { c, lx, ly } = at(x, y);
    return c.collisions[ly][lx] || SOLID_UPPER.has(c.upper[ly][lx]) || c.ground[ly][lx] === SEA;
  };
  const start = [world.meta.playerStart.worldX, world.meta.playerStart.worldY];
  const seen = new Set([key(...start)]);
  const q = [start];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy; const k = key(nx, ny);
      if (seen.has(k) || !canStep(x, y, nx, ny) || solid(nx, ny) || npcs.has(k) || NOT_OPENABLE.has(propAt.get(k))) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
};
/** O que precisa continuar alcançável: um vizinho de cada NPC, item e prop. */
const targets = () => [
  ...world.props.map((p) => ({ what: `${p.type}@${key(p.worldX, p.worldY)}`, x: p.worldX, y: p.worldY })),
  ...world.chunks.flatMap((c) => [...(c.pickups ?? []), ...c.npcs]).map((p) => ({ what: `${p.type}@${key(p.worldX, p.worldY)}`, x: p.worldX, y: p.worldY })),
];
const reachable = (seen, t) => seen.has(key(t.x, t.y)) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(key(t.x + dx, t.y + dy)));
const hash = (x, y) => { let h = (x * 73856093) ^ (y * 19349663); h = (h ^ (h >>> 13)) >>> 0; return h; };

const before = reach();
const reachableBefore = new Set(targets().filter((t) => reachable(before, t)).map((t) => t.what));

// ── O QUE MUDA ──────────────────────────────────────────────────────────────────────────────
// 1. nenhuma picareta solta
for (const c of world.chunks) if (c.pickups) c.pickups = c.pickups.filter((p) => p.type !== 'pickaxe');
// 2. o chão de pedra acima da nave vira floresta (o tile com prop fica só com o chão de grama)
const propKeys = new Set(world.props.map((p) => key(p.worldX, p.worldY)));
for (let y = FLOOR_BOX.y0; y <= FLOOR_BOX.y1; y++) {
  for (let x = FLOOR_BOX.x0; x <= FLOOR_BOX.x1; x++) {
    const { c, lx, ly } = at(x, y);
    if (!STONE_FLOOR.has(c.ground[ly][lx])) continue;
    c.ground[ly][lx] = GROUND;
    c.upper[ly][lx] = propKeys.has(key(x, y)) || KEEP_OPEN.has(key(x, y)) ? null : PINES[hash(x, y) % PINES.length];
  }
}
// 3. o forno fixo
const problems = [];
const existing = world.props.find((p) => p.type === 'furnace');
if (!existing) {
  const { c, lx, ly } = at(FURNACE.x, FURNACE.y);
  const busy = propKeys.has(key(FURNACE.x, FURNACE.y))
    || world.chunks.some((ch) => [...(ch.pickups ?? []), ...ch.npcs].some((p) => p.worldX === FURNACE.x && p.worldY === FURNACE.y));
  if (busy || c.ground[ly][lx] !== GROUND || c.collisions[ly][lx] || SOLID_UPPER.has(c.upper[ly][lx])) problems.push('o tile do forno não está livre');
  c.upper[ly][lx] = null;
  world.props.push({ type: 'furnace', worldX: FURNACE.x, worldY: FURNACE.y, dir: FURNACE.dir });
} else if (existing.worldX !== FURNACE.x || existing.worldY !== FURNACE.y) {
  // um forno desta mesma rodada, em outro lugar: muda para o lugar certo
  const { c, lx, ly } = at(FURNACE.x, FURNACE.y);
  c.upper[ly][lx] = null;
  existing.worldX = FURNACE.x; existing.worldY = FURNACE.y; existing.dir = FURNACE.dir;
}

// ── A PROVA ─────────────────────────────────────────────────────────────────────────────────
const after = reach();
const lost = targets().filter((t) => reachableBefore.has(t.what) && !reachable(after, t)).map((t) => t.what);
if (lost.length) problems.push(`deixariam de se alcançar: ${lost.join(' ')}`);
const [fx, fy] = [FURNACE.x, FURNACE.y + 1];
if (!after.has(key(fx, fy))) problems.push('a boca do forno não se alcança');
if (world.chunks.some((c) => (c.pickups ?? []).some((p) => p.type === 'pickaxe'))) problems.push('ainda há picareta solta');
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const out = `${JSON.stringify(world, null, 2)}\n`;
if (check) {
  if (out.trim() !== raw.split('\r\n').join('\n').trim()) {
    console.error('world.json NÃO é o ponto fixo de forno-da-vega.mjs');
    process.exit(1);
  }
  console.log('world.json OK: sem picareta solta, floresta acima da nave, forno fixo da Vega; a prova de BFS passa.');
} else {
  if (!fs.existsSync(backupPath) && out.trim() !== raw.split('\r\n').join('\n').trim()) {
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.writeFileSync(backupPath, raw);
  }
  fs.writeFileSync(worldPath, out);
  console.log('world.json: picareta solta removida, floresta acima da nave, forno fixo da Vega; a prova de BFS passa.');
}
