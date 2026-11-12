// AS PEDRAS FICAM NA LAVA (pedido do autor). A área da Vega volta a ser só dela: as nove pedras que
// estavam em volta da nave (cinco comuns e quatro veios de minério) saem dali. O lago d'água do noroeste
// vira um LAGO DE LAVA, emendado no bolsão de lava que já existia, e as pedras vão para a margem dele —
// é lá, nas Terras Queimadas, o lugar das pedras (as outras pedras do vale ficam onde estão). A Vega
// passa a mandar o herói para lá, com a picareta (npc.astronautHint.ore).
//
// A PROVA, partindo do começo da aventura, com as pedras novas FECHADAS (a picareta vem depois):
// - nada que se alcançava a pé antes deixa de se alcançar;
// - cada pedra nova tem um vizinho alcançável (dá para chegar com a picareta);
// - o corredor do norte do lago (o caminho do cogumelo do canto) e o bolsão do chanterelle não mudam.
// Depois de rodar, confira também: `node scripts/trilhas-cogumelos.mjs --check` e `npm run audit:stacks`.
//
// IDEMPOTENTE e DETERMINÍSTICO (mira no estado final). Faz backup em backup/world-pre-pedras-na-lava.json.
//
//   node scripts/pedras-na-lava.mjs           # aplica
//   node scripts/pedras-na-lava.mjs --check   # só confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeCanStep } from './relevo.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const worldPath = path.resolve(here, '../public/world.json');
const backupPath = path.resolve(here, '../backup/world-pre-pedras-na-lava.json');
const check = process.argv.includes('--check');

const raw = fs.readFileSync(worldPath, 'utf8');
const world = JSON.parse(raw);
const { worldChunksX, worldChunksY, chunkColumns: CW, chunkRows: CH } = world.meta;
const W = worldChunksX * CW;
const H = worldChunksY * CH;

/** A área da Vega (a nave em 41,5 e a bancada em 43,7): nenhuma pedra fica aqui. */
const VEGA_AREA = { x0: 35, y0: 0, x1: 48, y1: 12 };
/** O lago d'água do noroeste: todo tile de mar nesta caixa vira lava. */
const LAKE_BOX = { x0: 0, y0: 0, x1: 10, y1: 9 };
/**
 * As pedras na margem do lago de lava. Eram dois veios de CARVÃO, dois de minério e cinco pedras comuns; desde
 * scripts/minas-alem-da-lava.mjs (2026-11-11) os veios moram do outro lado do lago, e aqui na margem ficam nove
 * pedras comuns (as que dão a pedra da travessia). A lista segue o mapa de hoje, para esta prova não desfazer aquela.
 */
const PLACE = [
  ['rock', 4, 9], ['rock', 9, 7], ['rock', 11, 7], ['rock', 7, 10], ['rock', 5, 11], ['rock', 8, 9], ['rock', 12, 5], ['rock', 3, 11], ['rock', 10, 6],
];
const ROCKS = new Set(['rock', 'ironRock', 'coalRock']);

// constants.SOLID_UPPER_FRAMES
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 73, 74]);
const SEA = 33;
const GROUND = 5;
const key = (x, y) => `${x},${y}`;
const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
const at = (x, y) => { const c = chunkOf(x, y); return { c, lx: x % CW, ly: y % CH }; };
const relief = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : chunkOf(x, y).relief?.[y % CH]?.[x % CW] ?? 0);
// A regra de passo é a do jogo, num lugar só (scripts/relevo.mjs): o cume e as escadas dele inclusive.
const canStep = makeCanStep(relief);

// O que não se atravessa a pé (a régua de ponte-do-morel.mjs, com as pedras FECHADAS).
const NOT_OPENABLE = new Set(['water', 'lava', 'campfire', 'hearth', 'toolbox', 'bridgeSpot', 'rock', 'ironRock', 'coalRock']);
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

const before = reach();

// ── O QUE MUDA ──────────────────────────────────────────────────────────────────────────────
const inBox = (b, x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
const placeKeys = new Set(PLACE.map(([, x, y]) => key(x, y)));
// 1. a área da Vega sem pedra
world.props = world.props.filter((p) => !(ROCKS.has(p.type) && inBox(VEGA_AREA, p.worldX, p.worldY)));
// 2. o lago d'água do noroeste vira lava
const lavaNow = new Set(world.props.filter((p) => p.type === 'lava').map((p) => key(p.worldX, p.worldY)));
for (let y = LAKE_BOX.y0; y <= LAKE_BOX.y1; y++) {
  for (let x = LAKE_BOX.x0; x <= LAKE_BOX.x1; x++) {
    const { c, lx, ly } = at(x, y);
    if (c.ground[ly][lx] !== SEA) continue;
    c.ground[ly][lx] = GROUND;
    c.upper[ly][lx] = null;
    c.collisions[ly][lx] = false;
    if (!lavaNow.has(key(x, y))) world.props.push({ type: 'lava', worldX: x, worldY: y });
  }
}
// 3. as pedras na margem (chão + UMA coisa: a decoração do tile sai)
const problems = [];
for (const [type, x, y] of PLACE) {
  const { c, lx, ly } = at(x, y);
  const existing = world.props.find((p) => p.worldX === x && p.worldY === y);
  if (existing && existing.type === type) continue;
  // um veio que muda de tipo (minério → carvão) troca no lugar
  if (existing && ROCKS.has(existing.type) && ROCKS.has(type)) { existing.type = type; continue; }
  if (existing) { problems.push(`${key(x, y)}: já tem ${existing.type}`); continue; }
  const busy = world.chunks.some((ch) => [...(ch.pickups ?? []), ...ch.npcs].some((p) => p.worldX === x && p.worldY === y));
  if (busy) { problems.push(`${key(x, y)}: tem item ou NPC`); continue; }
  if (c.ground[ly][lx] !== GROUND || c.collisions[ly][lx] || SOLID_UPPER.has(c.upper[ly][lx]) || relief(x, y) !== 0) {
    problems.push(`${key(x, y)}: não é chão livre`);
    continue;
  }
  c.upper[ly][lx] = null;
  world.props.push({ type, worldX: x, worldY: y });
}

// ── A PROVA ─────────────────────────────────────────────────────────────────────────────────
const after = reach();
const lost = [...before].filter((k) => !after.has(k) && !placeKeys.has(k));
if (lost.length) problems.push(`as pedras fechariam: ${lost.join(' ')}`);
for (const [, x, y] of PLACE) {
  if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => after.has(key(x + dx, y + dy)))) problems.push(`${key(x, y)}: a pedra não se alcança a pé`);
}
const leftInVega = world.props.filter((p) => ROCKS.has(p.type) && inBox(VEGA_AREA, p.worldX, p.worldY));
if (leftInVega.length) problems.push(`ainda há pedra na área da Vega: ${leftInVega.map((p) => key(p.worldX, p.worldY)).join(' ')}`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const out = `${JSON.stringify(world, null, 2)}\n`;
if (check) {
  if (out.trim() !== raw.split('\r\n').join('\n').trim()) {
    console.error('world.json NÃO é o ponto fixo de pedras-na-lava.mjs');
    process.exit(1);
  }
  console.log('world.json OK: área da Vega sem pedra, lago de lava no noroeste com as pedras na margem; a prova de BFS passa.');
} else {
  // o backup é o mundo de ANTES da primeira rodada: nunca sobrescrever
  if (!fs.existsSync(backupPath) && out.trim() !== raw.split('\r\n').join('\n').trim()) {
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.writeFileSync(backupPath, raw);
  }
  fs.writeFileSync(worldPath, out);
  console.log(`world.json: área da Vega sem pedra, lago de lava no noroeste, ${PLACE.length} pedras na margem; a prova de BFS passa.`);
}
