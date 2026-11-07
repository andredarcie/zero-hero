// A BIGORNA DA VEGA (pedido do autor): a mesa de ferramentas saiu do mapa — ela não servia para nada na quest —, e no
// lugar dela, ao lado do forno fixo, fica a BIGORNA, também fixa. É nela, e só nela, que a esponja de ferro vira barra
// (o herói a põe em cima, pega o martelinho e malha); a Vega vem buscar a barra pronta.
//
// LÊ o world.json e acrescenta, como o CLAUDE.md manda: IDEMPOTENTE e DETERMINÍSTICO. Prova por BFS que, da Vega, o
// herói chega a pé ao lado da bigorna.
//
//   node scripts/bigorna-da-vega.mjs           # aplica
//   node scripts/bigorna-da-vega.mjs --check   # só confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeCanStep } from './relevo.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const worldPath = path.resolve(here, '../public/world.json');
const check = process.argv.includes('--check');

const raw = fs.readFileSync(worldPath, 'utf8');
const world = JSON.parse(raw);
const { chunkColumns: CW, chunkRows: CH } = world.meta;
const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));

const furnace = world.props.find((p) => p.type === 'furnace');
const problems = [];
if (!furnace) problems.push('o forno da Vega não está no mapa');
/** A bigorna: o tile onde a mesa ficava, ao lado do forno (sudoeste dele). */
const ANVIL = furnace ? { x: furnace.worldX - 1, y: furnace.worldY + 1 } : { x: 0, y: 0 };

world.props = world.props.filter((p) => p.type !== 'toolbox' && p.type !== 'altar');
// Logo depois do forno na lista (e não no fim): ponte-do-morel.mjs reescreve a lista com as árvores secas no fim.
world.props.splice(world.props.indexOf(furnace) + 1, 0, { type: 'altar', worldX: ANVIL.x, worldY: ANVIL.y });
const at = chunkOf(ANVIL.x, ANVIL.y);
if (at.collisions[ANVIL.y % CH][ANVIL.x % CW]) problems.push(`o tile da bigorna ${ANVIL.x},${ANVIL.y} é sólido`);
at.upper[ANVIL.y % CH][ANVIL.x % CW] = null;
for (const c of world.chunks) {
  if (c.pickups.some((p) => p.worldX === ANVIL.x && p.worldY === ANVIL.y)) problems.push('há um item no tile da bigorna');
}

// ── A PROVA: da Vega, a pé, chega-se ao lado da bigorna. ─────────────────────────────────────────
const relief = (x, y) => chunkOf(x, y)?.relief?.[y % CH]?.[x % CW] ?? 0;
const canStep = makeCanStep(relief);
const solid = (x, y) => { const c = chunkOf(x, y); return !c || c.collisions[y % CH][x % CW]; };
const OPEN = new Set(['tallGrass', 'plantSpot', 'bridgeSpot']);
const blocked = new Set(world.props.filter((p) => !OPEN.has(p.type)).map((p) => `${p.worldX},${p.worldY}`));
const vega = world.chunks.flatMap((c) => c.npcs).find((n) => n.type === 'astronaut');
if (!vega) problems.push('a Vega não está no mapa');
else {
  const seen = new Set([`${vega.worldX},${vega.worldY}`]);
  const q = [[vega.worldX, vega.worldY]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy; const k = `${nx},${ny}`;
      if (seen.has(k) || solid(nx, ny) || blocked.has(k) || !canStep(x, y, nx, ny)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  const side = [[0, 1], [1, 0], [-1, 0], [0, -1]].find(([dx, dy]) => seen.has(`${ANVIL.x + dx},${ANVIL.y + dy}`));
  if (!side) problems.push('da Vega não se chega ao lado da bigorna');
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

const out = `${JSON.stringify(world, null, 2)}\n`;
if (check) {
  if (out.trim() !== raw.split('\r\n').join('\n').trim()) { console.error('world.json NÃO é o ponto fixo de bigorna-da-vega.mjs'); process.exit(1); }
  console.log(`world.json OK: sem mesa de ferramentas; a bigorna está em ${ANVIL.x},${ANVIL.y}, ao lado do forno, e se alcança a pé.`);
} else {
  fs.writeFileSync(worldPath, out);
  console.log(`world.json: a mesa saiu; a bigorna ficou em ${ANVIL.x},${ANVIL.y}, ao lado do forno; a prova de BFS passa.`);
}
