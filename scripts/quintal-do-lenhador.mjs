// O QUINTAL DO LENHADOR (pedido do autor: "adicione mais coisas pra tornar o lugar que o lenhador mora mais único").
// Põe as peças de objects/LumberYard.ts dentro da cerca do Bram (scripts/cerca-do-lenhador.mjs), longe de tudo que a
// quest dele usa: o cepo nasce em 52,5 / 52,6 / 51,5; a fogueira e os dois assentos em volta de 56,7 (ou dos
// vizinhos da lista do LumberQuest.build); o banco do vale em 52,7 (ValleyFinds) e a casa em 49..51 × 6..7.
//
//   pilha de lenha  49,2 e 50,2 (encostadas na cerca do norte)   cavalete com serra  54,2
//   toco            57,2 e 49,9                                  toco com machado    58,9
//   carrinho de mão 58,6                                         placa               52,12 (fora, ao lado do portão)
//
// O enfeite rasteiro debaixo de cada peça sai. Não toca em `ground` nem em `collisions`. Prova de BFS. IDEMPOTENTE.
//   node scripts/quintal-do-lenhador.mjs           # aplica
//   node scripts/quintal-do-lenhador.mjs --check   # só confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOLID_UPPER, reachable } from './cerca-do-lenhador.mjs';

const PIECES = [
  { type: 'woodpile', x: 49, y: 2 },
  { type: 'woodpile', x: 50, y: 2 },
  { type: 'sawhorse', x: 54, y: 2 },
  { type: 'stump', x: 57, y: 2 },
  { type: 'stump', x: 49, y: 9 },
  { type: 'axeStump', x: 58, y: 9 },
  { type: 'wheelbarrow', x: 58, y: 6 },
  { type: 'yardSign', x: 52, y: 12 },
];
const TYPES = new Set(PIECES.map((p) => p.type));
/** O que a quest do Bram e o vale usam no quintal: nenhuma peça aqui. */
const RESERVED = ['52,5', '52,6', '51,5', '56,5', '56,6', '56,7', '56,8', '56,9', '55,8', '55,9', '55,7', '57,7', '57,6', '57,8', '53,8', '53,9', '53,7', '52,7', '52,8'];

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
  if (RESERVED.includes(k)) problems.push(`${p.type} em ${k}: lugar da quest do lenhador`);
  const c = chunkOf(p.x, p.y);
  const up = c.upper[p.y % CH][p.x % CW];
  if (SOLID_UPPER.has(up)) problems.push(`${p.type} em ${k}: em cima de algo sólido do mapa (quadro ${up})`);
  if ((c.relief?.[p.y % CH]?.[p.x % CW] ?? 0) !== 0) problems.push(`${p.type} em ${k}: não é chão plano`);
  const other = world.props.find((q) => q.worldX === p.x && q.worldY === p.y && !TYPES.has(q.type));
  if (other) problems.push(`${p.type} em ${k}: já há ${other.type}`);
  for (const ch of world.chunks) for (const q of [...ch.pickups, ...ch.npcs]) if (q.worldX === p.x && q.worldY === p.y) problems.push(`${p.type} em ${k}: já há ${q.type ?? 'npc'}`);
  c.upper[p.y % CH][p.x % CW] = null;
}
// As que já estão ficam no lugar delas na lista (o --check compara o arquivo inteiro); só as que faltam entram no fim.
const wanted = (q) => PIECES.some((p) => p.type === q.type && p.x === q.worldX && p.y === q.worldY);
world.props = [
  ...world.props.filter((q) => !(TYPES.has(q.type) && mine.has(`${q.worldX},${q.worldY}`) && !wanted(q))),
  ...PIECES.filter((p) => !world.props.some((q) => q.type === p.type && q.worldX === p.x && q.worldY === p.y))
    .map((p) => ({ type: p.type, worldX: p.x, worldY: p.y })),
];

const was = reachable(before);
const now = reachable(world);
for (const k of was) if (!mine.has(k) && !now.has(k)) problems.push(`com o quintal, ${k} deixa de ser alcançável`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

const out = `${JSON.stringify(world, null, 2)}\n`;
if (check) {
  if (out.trim() !== raw.split('\r\n').join('\n').trim()) { console.error('world.json NÃO é o ponto fixo de quintal-do-lenhador.mjs'); process.exit(1); }
  console.log('world.json OK: o quintal do lenhador tem as peças dele, longe da quest, sem fechar caminho.');
} else {
  fs.writeFileSync(worldPath, out);
  console.log(`world.json: ${PIECES.length} peças no quintal do lenhador; a prova de BFS passa.`);
}
