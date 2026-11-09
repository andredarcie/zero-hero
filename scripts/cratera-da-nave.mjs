// A CRATERA DA NAVE DA THEA (pedido do autor: "no lugar exato onde era a casa dele, faça uma cratera com algumas peças
// quebradas da nave… é para ter essa referência de storytelling via environment"). A casa da astronauta ficava em
// 36..38 × 7..8 (o meio da linha de baixo em 37,8); ela saiu (a Thea não tem casa). Aqui fica o buraco da queda e
// os pedaços da nave em volta da borda (objects/CrashSite.ts):
//
//   o buraco (o fundo é sólido)  37,8      a aleta cravada  37,6 (borda norte)
//   a chapa do casco             36,9      o propulsor      39,7 (borda leste, a boca para fora, fumegando)
//
// O enfeite rasteiro debaixo de cada peça sai. Não toca em `ground` nem em `collisions`. Prova de BFS. IDEMPOTENTE.
//   node scripts/cratera-da-nave.mjs           # aplica
//   node scripts/cratera-da-nave.mjs --check   # só confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOLID_UPPER, reachable } from './cerca-do-lenhador.mjs';

const PIECES = [
  { type: 'crashCrater', x: 37, y: 8 },
  { type: 'shipFin', x: 37, y: 6 },
  { type: 'shipHull', x: 36, y: 9 },
  { type: 'shipThruster', x: 39, y: 7 },
];
const TYPES = new Set(PIECES.map((p) => p.type));
/** O buraco espalha terra em volta: o enfeite rasteiro dentro deste raio sai (a queda arrancou). */
const BLAST = { x: 37, y: 8, rx: 2, ry: 1.6 };

const here = path.dirname(fileURLToPath(import.meta.url));
const worldPath = path.resolve(here, '../public/world.json');
const check = process.argv.includes('--check');
const raw = fs.readFileSync(worldPath, 'utf8');
const world = JSON.parse(raw);
const before = JSON.parse(raw);
const { chunkColumns: CW, chunkRows: CH } = world.meta;
const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
const problems = [];
const mine = new Set(PIECES.map((p) => `${p.x},${p.y}`));

for (const p of PIECES) {
  const k = `${p.x},${p.y}`;
  const c = chunkOf(p.x, p.y);
  const up = c.upper[p.y % CH][p.x % CW];
  if (SOLID_UPPER.has(up)) problems.push(`${p.type} em ${k}: em cima de algo sólido do mapa (quadro ${up})`);
  if ((c.relief?.[p.y % CH]?.[p.x % CW] ?? 0) !== 0) problems.push(`${p.type} em ${k}: não é chão plano`);
  const other = world.props.find((q) => q.worldX === p.x && q.worldY === p.y && !TYPES.has(q.type));
  if (other) problems.push(`${p.type} em ${k}: já há ${other.type}`);
  for (const ch of world.chunks) for (const q of [...ch.pickups, ...ch.npcs]) if (q.worldX === p.x && q.worldY === p.y) problems.push(`${p.type} em ${k}: já há ${q.type ?? 'npc'}`);
}
// A queda arrancou o capim e as flores em volta (só o rasteiro: árvore, pedra e parede ficam).
for (let y = Math.floor(BLAST.y - BLAST.ry); y <= Math.ceil(BLAST.y + BLAST.ry); y += 1) {
  for (let x = Math.floor(BLAST.x - BLAST.rx); x <= Math.ceil(BLAST.x + BLAST.rx); x += 1) {
    if (((x - BLAST.x) / BLAST.rx) ** 2 + ((y - BLAST.y) / BLAST.ry) ** 2 > 1) continue;
    const c = chunkOf(x, y);
    const up = c.upper[y % CH][x % CW];
    if (up !== null && !SOLID_UPPER.has(up)) c.upper[y % CH][x % CW] = null;
  }
}
const wanted = (q) => PIECES.some((p) => p.type === q.type && p.x === q.worldX && p.y === q.worldY);
world.props = [
  ...world.props.filter((q) => !(TYPES.has(q.type) && mine.has(`${q.worldX},${q.worldY}`) && !wanted(q))),
  ...PIECES.filter((p) => !world.props.some((q) => q.type === p.type && q.worldX === p.x && q.worldY === p.y))
    .map((p) => ({ type: p.type, worldX: p.x, worldY: p.y })),
];

const was = reachable(before);
const now = reachable(world);
for (const k of was) if (!mine.has(k) && !now.has(k)) problems.push(`com a cratera, ${k} deixa de ser alcançável`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

const out = `${JSON.stringify(world, null, 2)}\n`;
if (check) {
  if (out.trim() !== raw.split('\r\n').join('\n').trim()) { console.error('world.json NÃO é o ponto fixo de cratera-da-nave.mjs'); process.exit(1); }
  console.log('world.json OK: a cratera da nave está onde era a casa da Thea, sem fechar caminho.');
} else {
  fs.writeFileSync(worldPath, out);
  console.log(`world.json: a cratera e ${PIECES.length - 1} pedaços da nave; a prova de BFS passa.`);
}
