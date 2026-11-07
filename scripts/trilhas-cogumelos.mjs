// AS TRILHAS DOS COGUMELOS — cada um dos seis fungos da Hollis pede um gesto diferente:
//
//   porcini     (2,40)   só chegar e colher (ao lado da Hollis: scripts/porcini-da-hollis.mjs)
//   morel       (2,30)   ilha num lago: dois gravetos fazem a ponte em (2,31)
//   puffball    (12,21)  mato alto em volta: a foice abre
//   inkCap      (11,10)  arbustos secos em volta: o graveto aceso queima
//   chanterelle (11,2)   lava em volta: a pedra da picareta afunda em (11,3) e vira chão
//   flyAgaric   (1,1)    mato morto no caminho: o machado abre
//
// Com uma mão só, a faca fica no chão enquanto a ferramenta trabalha: pegar a ferramenta troca as
// duas, e depois é voltar para buscar a faca. Por isso cada ferramenta mora perto da sua trilha.
//
// LÊ o world.json e acrescenta, como o CLAUDE.md manda: IDEMPOTENTE (cada passo mira o estado
// final) e DETERMINÍSTICO. No fim PROVA por BFS, partindo da Hollis: as ferramentas e o porcini se
// alcançam com as mãos vazias, os outros cinco NÃO — e cada um passa a se alcançar com o gesto dele.
//
//   node scripts/trilhas-cogumelos.mjs           # aplica
//   node scripts/trilhas-cogumelos.mjs --check   # só confere
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
const SEA = 33;

const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
const terrainSolid = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return true;
  const c = chunkOf(x, y);
  const r = y % CH;
  const k = x % CW;
  return c.collisions[r][k] || SOLID_UPPER.has(c.upper[r][k]) || c.ground[r][k] === SEA;
};

// ── O QUE ENTRA ─────────────────────────────────────────────────────────────────────────────
const PROPS = {
  water: [[0, 29], [1, 29], [0, 30], [1, 30], [0, 31], [1, 31], [3, 31]],
  bridgeSpot: [[2, 31]],
  tallGrass: [[12, 19], [11, 20], [12, 20], [11, 21], [10, 21]],
  dryBush: [[11, 8], [11, 9], [10, 9], [9, 9], [10, 10]],
  // (11,3) é por onde se atravessa; (12,4) fica de fora dela: a lava que ainda acende o graveto
  // depois que a pedra fechou a outra.
  lava: [[11, 3], [10, 2], [10, 1], [12, 4]],
  dryShrub: [[10, 4], [10, 3], [2, 1]],
  rock: [[15, 6], [16, 6]],
};
// Ferramentas que MUDAM de lugar (cada uma existe uma vez no mundo) e o que é novo.
const MOVE_PICKUPS = { scythe: [13, 18], axe: [12, 6], pickaxe: [14, 6] };
const NEW_PICKUPS = [
  { type: 'wood', at: [4, 32] },
  { type: 'wood', at: [4, 33] },
  { type: 'wood', at: [13, 5] },
];

const placed = new Map();
for (const [type, tiles] of Object.entries(PROPS)) for (const [x, y] of tiles) placed.set(`${x},${y}`, type);
const pickupTiles = new Set([
  ...Object.values(MOVE_PICKUPS).map(([x, y]) => `${x},${y}`),
  ...NEW_PICKUPS.map((p) => `${p.at[0]},${p.at[1]}`),
]);

// O PLANALTO (relief, ver world/relief.ts): 0 chão, 1 planalto, 2-5 escada subindo N/L/S/O. Só se
// muda de nível pela escada, então a prova anda por `canStep` como o herói.
const relief = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : chunkOf(x, y).relief?.[y % CH]?.[x % CW] ?? 0);
// A regra de passo é a do jogo, num lugar só (scripts/relevo.mjs): o cume e as escadas dele inclusive.
const canStep = makeCanStep(relief);

// Terreno sólido nesses tiles seria um pinheiro apagado em silêncio: melhor parar aqui.
for (const k of [...placed.keys(), ...pickupTiles]) {
  const [x, y] = k.split(',').map(Number);
  if (terrainSolid(x, y)) throw new Error(`tile ${k} é terreno sólido`);
  if (relief(x, y) !== 0) throw new Error(`tile ${k} está no planalto`);
}

// ── APLICA ──────────────────────────────────────────────────────────────────────────────────
// CHÃO + UMA COISA: o tile que recebe uma peça perde a decoração (e o prop antigo, se houver).
world.props = world.props.filter((p) => !placed.has(`${p.worldX},${p.worldY}`) && !pickupTiles.has(`${p.worldX},${p.worldY}`));
for (const [type, tiles] of Object.entries(PROPS)) {
  for (const [x, y] of tiles) world.props.push({ type, worldX: x, worldY: y });
}
for (const c of world.chunks) {
  c.pickups = c.pickups.filter((p) => {
    const k = `${p.worldX},${p.worldY}`;
    if (placed.has(k)) return false;
    if (MOVE_PICKUPS[p.type]) return false;
    if (p.type === 'wood' && pickupTiles.has(k)) return false;
    return true;
  });
}
const putPickup = (type, x, y) => {
  chunkOf(x, y).pickups.push({ type, worldX: x, worldY: y });
};
for (const [type, [x, y]] of Object.entries(MOVE_PICKUPS)) putPickup(type, x, y);
for (const { type, at: [x, y] } of NEW_PICKUPS) putPickup(type, x, y);
for (const k of [...placed.keys(), ...pickupTiles]) {
  const [x, y] = k.split(',').map(Number);
  chunkOf(x, y).upper[y % CH][x % CW] = null;
}

// ── A PROVA ─────────────────────────────────────────────────────────────────────────────────
const BLOCKING = new Set(['campfire', 'hearth', 'gardenGate', 'dryBush', 'lockedDoor', 'dryTree', 'dryShrub', 'rock',
  'ironRock', 'tallGrass', 'moonflower', 'plantSpot', 'toolbox', 'furnace', 'altar', 'water', 'bridgeSpot', 'lava']);
const propAt = new Map(world.props.map((p) => [`${p.worldX},${p.worldY}`, p.type]));
const npcs = new Set(world.chunks.flatMap((c) => c.npcs.map((n) => `${n.worldX},${n.worldY}`)));
const SHROOMS = { porcini: [2, 40], morel: [2, 30], puffball: [12, 21], inkCap: [11, 10], chanterelle: [11, 2], flyAgaric: [1, 1] };
const shroomTiles = new Set(Object.values(SHROOMS).map(([x, y]) => `${x},${y}`));

/** Os tiles que um herói alcança a pé a partir da Hollis, com estes tipos de prop abertos. */
const reach = (openTypes) => {
  const hollis = world.chunks.flatMap((c) => c.npcs).find((n) => n.type === 'radiationSuit');
  const start = [hollis.worldX, hollis.worldY];
  const seen = new Set([start.join(',')]);
  const q = [start];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const k = `${nx},${ny}`;
      if (seen.has(k) || terrainSolid(nx, ny) || npcs.has(k) || shroomTiles.has(k) || !canStep(x, y, nx, ny)) continue;
      const t = propAt.get(k);
      if (t && BLOCKING.has(t) && !openTypes.has(t)) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
};
const touches = (seen, [x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(`${x + dx},${y + dy}`));

const bare = reach(new Set());
const problems = [];
for (const [type, at] of [...Object.entries(MOVE_PICKUPS), ...NEW_PICKUPS.map((p) => [p.type, p.at])]) {
  if (!bare.has(at.join(','))) problems.push(`${type} em ${at} não se alcança a pé`);
}
for (const tile of PROPS.rock) if (!touches(bare, tile)) problems.push(`a rocha ${tile} não se alcança a pé`);
if (!touches(bare, SHROOMS.porcini)) problems.push('o porcini devia ser só chegar');
const keys = { morel: 'bridgeSpot', puffball: 'tallGrass', inkCap: 'dryBush', chanterelle: 'lava', flyAgaric: 'dryShrub' };
for (const [kind, type] of Object.entries(keys)) {
  if (touches(bare, SHROOMS[kind])) problems.push(`${kind} ainda se alcança sem o gesto`);
  if (!touches(reach(new Set([type])), SHROOMS[kind])) problems.push(`${kind} não abre com ${type}`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const out = `${JSON.stringify(world, null, 2)}\n`;
if (check) {
  if (out.trim() !== raw.split('\r\n').join('\n').trim()) {
    console.error('world.json NÃO é o ponto fixo de trilhas-cogumelos.mjs');
    process.exit(1);
  }
  console.log('world.json OK: as seis trilhas estão de pé e a prova de BFS passa.');
} else {
  fs.writeFileSync(worldPath, out);
  console.log('world.json: seis trilhas aplicadas; a prova de BFS passa.');
}
