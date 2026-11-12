// OS DOIS COGUMELOS NOVOS (pedido do autor, 2026-11-11: "investigue áreas do mapa em que não tem nada para fazer...
// a parte acima do acampamento do herói até o lenhador, e do lado esquerdo do astronauta uma área parada de floresta.
// Adicione mais 2 cogumelos, não obrigatórios, para ter mais coisa para ser feita").
//
// A investigação mediu, para cada tile em que se anda, a distância até a coisa mais próxima para fazer (vizinho, item,
// peça de quest, achado). As duas áreas do autor eram as duas maiores sem nada:
//   · à esquerda da Thea, a clareira cercada de pinheiros (x 26..33, y 2..12), ao lado da nave caída: até 12 passos
//     de qualquer coisa;
//   · acima do acampamento até o Marco (x 40..59, y 24..47): até 19 passos; no meio dela, o campo das flores da lua,
//     com duas árvores secas soltas.
//
//   cogumelo-da-oliveira (jackOLantern)  (30,2)   ao pé dos pinheiros da clareira. Brilha de noite (MushroomGlow):
//                                                o gesto é ir no escuro e seguir a luz.
//   cogumelo-ostra (oyster)              (44,30)  no pé da árvore seca do campo das flores da lua: nasce na madeira
//                                                morta. O gesto é achar a árvore seca.
//
// Nenhum dos dois pede ferramenta de vizinho nenhum (só a faca da Shui, que colhe todos). A PROVA, por BFS a partir do
// começo da aventura, com toda peça que bloqueia FECHADA (nenhuma ferramenta): cada cogumelo novo tem um vizinho
// alcançável a pé. Depois de rodar: `node scripts/chao-dos-filhos.mjs` (o chão liso dos filhos deles).
//
// IDEMPOTENTE e DETERMINÍSTICO (mira no estado final). Faz backup em backup/world-pre-cogumelos-novos.json.
//
//   node scripts/cogumelos-novos.mjs           # aplica
//   node scripts/cogumelos-novos.mjs --check   # só confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeCanStep } from './relevo.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const worldPath = path.resolve(here, '../public/world.json');
const backupPath = path.resolve(here, '../backup/world-pre-cogumelos-novos.json');
const check = process.argv.includes('--check');

const raw = fs.readFileSync(worldPath, 'utf8');
const world = JSON.parse(raw);
const { worldChunksX, worldChunksY, chunkColumns: CW, chunkRows: CH } = world.meta;
const W = worldChunksX * CW;
const H = worldChunksY * CH;

const PLACE = [['jackOLantern', 30, 2], ['oyster', 44, 30]];

// constants.SOLID_UPPER_FRAMES
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 73, 74]);
const SEA = 33;
const GROUND = 5;
const key = (x, y) => `${x},${y}`;
const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
const at = (x, y) => { const c = chunkOf(x, y); return { c, lx: x % CW, ly: y % CH }; };
const relief = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : chunkOf(x, y).relief?.[y % CH]?.[x % CW] ?? 0);
const canStep = makeCanStep(relief);
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ── O QUE MUDA ──────────────────────────────────────────────────────────────────────────────
const problems = [];
for (const [type, x, y] of PLACE) {
  const { c, lx, ly } = at(x, y);
  const there = (c.pickups ?? []).find((p) => p.worldX === x && p.worldY === y);
  if (there?.type === type) continue;
  if (there) { problems.push(`${key(x, y)}: já tem ${there.type}`); continue; }
  if (world.chunks.some((ch) => (ch.pickups ?? []).some((p) => p.type === type))) { problems.push(`${type} já existe em outro lugar`); continue; }
  if (world.props.some((p) => p.worldX === x && p.worldY === y)) { problems.push(`${key(x, y)}: tem peça`); continue; }
  if (world.chunks.some((ch) => ch.npcs.some((n) => n.worldX === x && n.worldY === y))) { problems.push(`${key(x, y)}: tem NPC`); continue; }
  if (c.ground[ly][lx] !== GROUND || c.collisions[ly][lx] || SOLID_UPPER.has(c.upper[ly][lx])) { problems.push(`${key(x, y)}: não é chão livre`); continue; }
  // chão + UMA coisa: o enfeite do tile sai
  c.upper[ly][lx] = null;
  c.pickups = [...(c.pickups ?? []), { type, worldX: x, worldY: y }];
}

// ── A PROVA ─────────────────────────────────────────────────────────────────────────────────
const solid = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return true;
  const { c, lx, ly } = at(x, y);
  return c.collisions[ly][lx] || SOLID_UPPER.has(c.upper[ly][lx]) || c.ground[ly][lx] === SEA;
};
const blocked = new Set([
  ...world.props.map((p) => key(p.worldX, p.worldY)),
  ...world.chunks.flatMap((c) => [...(c.pickups ?? []), ...c.npcs].map((p) => key(p.worldX, p.worldY))),
]);
const start = [world.meta.playerStart.worldX, world.meta.playerStart.worldY];
const dist = new Map([[key(...start), 0]]);
const q = [start];
while (q.length) {
  const [x, y] = q.shift();
  for (const [dx, dy] of N4) {
    const nx = x + dx; const ny = y + dy; const k = key(nx, ny);
    if (dist.has(k) || solid(nx, ny) || blocked.has(k) || !canStep(x, y, nx, ny)) continue;
    dist.set(k, dist.get(key(x, y)) + 1);
    q.push([nx, ny]);
  }
}
const reachIn = {};
for (const [type, x, y] of PLACE) {
  const steps = N4.map(([dx, dy]) => dist.get(key(x + dx, y + dy))).filter((d) => d !== undefined);
  if (!steps.length) problems.push(`${type} em ${key(x, y)} não se alcança a pé, sem ferramenta`);
  else reachIn[type] = Math.min(...steps);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const summary = PLACE.map(([type, x, y]) => `${type} em ${key(x, y)} (${reachIn[type]} passos do começo)`).join('; ');
const out = `${JSON.stringify(world, null, 2)}\n`;
if (check) {
  if (out.trim() !== raw.split('\r\n').join('\n').trim()) {
    console.error('world.json NÃO é o ponto fixo de cogumelos-novos.mjs');
    process.exit(1);
  }
  console.log(`world.json OK: ${summary}; a prova passa.`);
} else {
  if (!fs.existsSync(backupPath) && out.trim() !== raw.split('\r\n').join('\n').trim()) {
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.writeFileSync(backupPath, raw);
  }
  fs.writeFileSync(worldPath, out);
  console.log(`world.json: ${summary}; a prova passa.`);
}
