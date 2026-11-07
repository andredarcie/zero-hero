// O PORCINI AO LADO DA HOLLIS (pedido do autor): o primeiro cogumelo é o que ensina o corte, então ele nasce à
// vista — três tiles à esquerda dela, na mesma linha, com o caminho limpo entre os dois. Na fala, ela aponta
// ("aqui do meu lado esquerdo") e a câmera vai até ele e volta.
//
// LÊ o world.json e acrescenta, como o CLAUDE.md manda: IDEMPOTENTE e DETERMINÍSTICO. Prova por BFS que o
// porcini se alcança da Hollis de mãos vazias.
//
//   node scripts/porcini-da-hollis.mjs           # aplica
//   node scripts/porcini-da-hollis.mjs --check   # só confere
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

const hollis = world.chunks.flatMap((c) => c.npcs).find((n) => n.type === 'radiationSuit');
/** Três tiles à esquerda dela, na mesma linha. */
const SPOT = [hollis.worldX - 3, hollis.worldY];
/** Os tiles que ficam limpos de mato: o do cogumelo, os dois entre ele e ela, e o de baixo dele (que o tapava). */
const CLEAR = [[SPOT[0], SPOT[1]], [SPOT[0] + 1, SPOT[1]], [SPOT[0] + 2, SPOT[1]], [SPOT[0], SPOT[1] + 1]];

const problems = [];
// O porcini do vale (fora do jardim do fim, que tem o dele) vai para o lado dela.
const garden = world.props.find((p) => p.type === 'hearth');
const inGarden = (p) => garden && Math.abs(p.worldX - garden.worldX) <= 6 && Math.abs(p.worldY - garden.worldY) <= 6;
for (const c of world.chunks) c.pickups = c.pickups.filter((p) => p.type !== 'porcini' || inGarden(p));
chunkOf(...SPOT).pickups.push({ type: 'porcini', worldX: SPOT[0], worldY: SPOT[1] });
for (const [x, y] of CLEAR) {
  const c = chunkOf(x, y);
  if (c.collisions[y % CH][x % CW]) problems.push(`o tile ${x},${y} é sólido`);
  c.upper[y % CH][x % CW] = null;
}
if (world.props.some((p) => CLEAR.some(([x, y]) => p.worldX === x && p.worldY === y))) problems.push('há uma peça no caminho do porcini');

// ── A PROVA: da Hollis, de mãos vazias, chega-se ao lado do porcini. ─────────────────────────────
const relief = (x, y) => chunkOf(x, y)?.relief?.[y % CH]?.[x % CW] ?? 0;
const canStep = makeCanStep(relief);
const solid = (x, y) => { const c = chunkOf(x, y); return !c || c.collisions[y % CH][x % CW]; };
const blocked = new Set(world.props.map((p) => `${p.worldX},${p.worldY}`));
const seen = new Set([`${hollis.worldX},${hollis.worldY}`]);
const q = [[hollis.worldX, hollis.worldY]];
while (q.length) {
  const [x, y] = q.shift();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx; const ny = y + dy; const k = `${nx},${ny}`;
    if (seen.has(k) || solid(nx, ny) || blocked.has(k) || (nx === SPOT[0] && ny === SPOT[1]) || !canStep(x, y, nx, ny)) continue;
    seen.add(k); q.push([nx, ny]);
  }
}
if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(`${SPOT[0] + dx},${SPOT[1] + dy}`))) problems.push('o porcini não se alcança da Hollis');
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

const out = `${JSON.stringify(world, null, 2)}\n`;
if (check) {
  if (out.trim() !== raw.split('\r\n').join('\n').trim()) { console.error('world.json NÃO é o ponto fixo de porcini-da-hollis.mjs'); process.exit(1); }
  console.log(`world.json OK: o porcini está em ${SPOT}, à esquerda da Hollis, e se alcança a pé.`);
} else {
  fs.writeFileSync(worldPath, out);
  console.log(`world.json: o porcini foi para ${SPOT}, à esquerda da Hollis; a prova de BFS passa.`);
}
