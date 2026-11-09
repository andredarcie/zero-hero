// A FORJA VELHA (pedido do autor: a Thea não tem casa — caiu do céu —, então o forno e a bigorna ao lado dela são de
// alguém que morou ali antes e foi embora). Põe os restos da oficina do ferreiro (objects/OldForge.ts) em volta do
// forno (44,6) e da bigorna (43,7), e confere:
//   · o pedaço de parede com a placa (achado `smithy` em 45,3, objects/ValleyFinds) num tile livre, com chão ao sul
//     para o herói chegar de frente e ler;
//   · os quatro vizinhos do forno e da bigorna continuam livres (o herói usa o forno de qualquer lado, e a Thea
//     vem pegar a barra num deles);
//   · nenhum caminho fecha (BFS, contando o achado como sólido).
// O enfeite rasteiro debaixo de cada peça sai. Não toca em `ground` nem em `collisions`. IDEMPOTENTE.
//   node scripts/forja-velha.mjs           # aplica
//   node scripts/forja-velha.mjs --check   # só confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOLID_UPPER, reachable } from './cerca-do-lenhador.mjs';

const PIECES = [
  { type: 'forgeRubble', x: 46, y: 5 },
  { type: 'forgeRack', x: 45, y: 8 },
];
const FIND = { x: 45, y: 3 };
const TYPES = new Set(PIECES.map((p) => p.type));

const here = path.dirname(fileURLToPath(import.meta.url));
const worldPath = path.resolve(here, '../public/world.json');
const check = process.argv.includes('--check');
const raw = fs.readFileSync(worldPath, 'utf8');
const world = JSON.parse(raw);
const before = JSON.parse(raw);
const { chunkColumns: CW, chunkRows: CH } = world.meta;
const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
const problems = [];

for (const t of [...PIECES, FIND]) {
  const k = `${t.x},${t.y}`;
  const c = chunkOf(t.x, t.y);
  const up = c.upper[t.y % CH][t.x % CW];
  if (SOLID_UPPER.has(up)) problems.push(`${k}: em cima de algo sólido do mapa (quadro ${up})`);
  const other = world.props.find((q) => q.worldX === t.x && q.worldY === t.y && !TYPES.has(q.type));
  if (other) problems.push(`${k}: já há ${other.type}`);
  c.upper[t.y % CH][t.x % CW] = null;
}
const mine = new Set([...PIECES, FIND].map((p) => `${p.x},${p.y}`));
// As que já estão ficam no lugar delas na lista (o --check compara o arquivo inteiro); só as que faltam entram no fim.
const wanted = (q) => PIECES.some((p) => p.type === q.type && p.x === q.worldX && p.y === q.worldY);
world.props = [
  ...world.props.filter((q) => !(TYPES.has(q.type) && mine.has(`${q.worldX},${q.worldY}`) && !wanted(q))),
  ...PIECES.filter((p) => !world.props.some((q) => q.type === p.type && q.worldX === p.x && q.worldY === p.y))
    .map((p) => ({ type: p.type, worldX: p.x, worldY: p.y })),
];

// O forno e a bigorna, livres dos quatro lados (o que já era livre antes).
for (const station of world.props.filter((p) => p.type === 'furnace' || p.type === 'altar')) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const k = `${station.worldX + dx},${station.worldY + dy}`;
    if (mine.has(k)) problems.push(`${k}: encostado no ${station.type}, no lado por onde se usa`);
  }
}

const withFind = { ...world, props: [...world.props, { type: 'find', worldX: FIND.x, worldY: FIND.y }] };
const was = reachable(before);
const now = reachable(withFind);
for (const k of was) if (!mine.has(k) && !now.has(k)) problems.push(`com a forja velha, ${k} deixa de ser alcançável`);
if (!now.has(`${FIND.x},${FIND.y + 1}`)) problems.push('não se chega de frente à parede da forja (o sul dela)');
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

const out = `${JSON.stringify(world, null, 2)}\n`;
if (check) {
  if (out.trim() !== raw.split('\r\n').join('\n').trim()) { console.error('world.json NÃO é o ponto fixo de forja-velha.mjs'); process.exit(1); }
  console.log('world.json OK: a forja velha está no lugar, o forno e a bigorna livres, nenhum caminho fechou.');
} else {
  fs.writeFileSync(worldPath, out);
  console.log(`world.json: ${PIECES.length} restos da forja velha; a prova de BFS passa.`);
}
