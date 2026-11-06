// AJUSTES DO VALE (pedido do autor, jogando).
//
// - NADA DE GRAVETO NEM PEDRA SOLTOS: graveto só sai de árvore seca cortada com o machado, e pedra só de
//   rocha quebrada com a picareta. Todo `wood` e `stone` que estava solto no chão sai.
// - Os dois portões de metal e a pedra a noroeste do mago (o bolsão sem saída em 20..22 × 49..50) não
//   serviam para nada: o bolsão inteiro vira pinheiro, emendando a fileira de árvores dos dois lados.
// - O mato alto bem na frente da cadeira da beira do lago sai: o balão da foice aparecia toda vez que o
//   herói ia sentar.
//
// A PROVA, partindo do começo da aventura: nenhum NPC, item ou prop que se alcançava a pé deixa de se
// alcançar (os tiles do bolsão saem da conta, porque viram árvore).
//
// IDEMPOTENTE e DETERMINÍSTICO. Backup (só na primeira vez) em backup/world-pre-ajustes-do-vale.json.
//
//   node scripts/ajustes-do-vale.mjs           # aplica
//   node scripts/ajustes-do-vale.mjs --check   # só confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeCanStep } from './relevo.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const worldPath = path.resolve(here, '../public/world.json');
const backupPath = path.resolve(here, '../backup/world-pre-ajustes-do-vale.json');
const check = process.argv.includes('--check');

const raw = fs.readFileSync(worldPath, 'utf8');
const world = JSON.parse(raw);
const { worldChunksX, worldChunksY, chunkColumns: CW, chunkRows: CH } = world.meta;
const W = worldChunksX * CW;
const H = worldChunksY * CH;

const LOOSE = new Set(['wood', 'stone']);
/** O bolsão dos portões: vira floresta inteiro. */
const POCKET = { x0: 20, y0: 49, x1: 22, y1: 50 };
const POCKET_PROPS = new Set(['swingGate', 'rock']);
const PINES = [4, 14, 17, 18];
/** O mato na frente da cadeira da beira do lago (ValleyFinds: a cadeira em 41,50). */
const GRASS_BY_CHAIR = ['42,51'];

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
const targets = () => [
  ...world.props.map((p) => ({ what: `${p.type}@${key(p.worldX, p.worldY)}`, x: p.worldX, y: p.worldY })),
  ...world.chunks.flatMap((c) => [...(c.pickups ?? []), ...c.npcs]).map((p) => ({ what: `${p.type}@${key(p.worldX, p.worldY)}`, x: p.worldX, y: p.worldY })),
];
const reachable = (seen, t) => seen.has(key(t.x, t.y)) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(key(t.x + dx, t.y + dy)));
const hash = (x, y) => { let h = (x * 73856093) ^ (y * 19349663); h = (h ^ (h >>> 13)) >>> 0; return h; };
const inPocket = (x, y) => x >= POCKET.x0 && x <= POCKET.x1 && y >= POCKET.y0 && y <= POCKET.y1;

const before = reach();
const reachableBefore = new Set(targets().filter((t) => reachable(before, t)).map((t) => t.what));

// ── O QUE MUDA ──────────────────────────────────────────────────────────────────────────────
// 1. nenhum graveto nem pedra soltos
for (const c of world.chunks) if (c.pickups) c.pickups = c.pickups.filter((p) => !LOOSE.has(p.type));
// 2. o bolsão dos portões vira floresta
world.props = world.props.filter((p) => !(inPocket(p.worldX, p.worldY) && POCKET_PROPS.has(p.type)));
const problems = [];
for (let y = POCKET.y0; y <= POCKET.y1; y++) {
  for (let x = POCKET.x0; x <= POCKET.x1; x++) {
    if (world.props.some((p) => p.worldX === x && p.worldY === y)) problems.push(`prop inesperado no bolsão em ${key(x, y)}`);
    const { c, lx, ly } = at(x, y);
    c.collisions[ly][lx] = false;
    c.upper[ly][lx] = PINES[hash(x, y) % PINES.length];
  }
}
// 3. o mato na frente da cadeira do lago
world.props = world.props.filter((p) => !(p.type === 'tallGrass' && GRASS_BY_CHAIR.includes(key(p.worldX, p.worldY))));
// 4. nenhum TILE DE CHÃO na camada de decoração: um quadro de chão inteiro (a grama 5/6, as terras 52-56)
//    posto como enfeite cobre o tile com um quadrado de quatro bordas retas — no chão de cinzas do lago de
//    lava, eram selos verdes (pedido do autor: nada de risco reto no chão).
const GROUND_ART = new Set([5, 6, 52, 53, 54, 55, 56]);
for (const c of world.chunks) {
  for (const row of c.upper) for (let i = 0; i < row.length; i++) if (GROUND_ART.has(row[i])) row[i] = null;
}

// ── A PROVA ─────────────────────────────────────────────────────────────────────────────────
const after = reach();
const lost = targets().filter((t) => reachableBefore.has(t.what) && !reachable(after, t)).map((t) => t.what);
if (lost.length) problems.push(`deixariam de se alcançar: ${lost.join(' ')}`);
if (world.chunks.some((c) => (c.pickups ?? []).some((p) => LOOSE.has(p.type)))) problems.push('ainda há graveto ou pedra soltos');
if (!after.has('41,51')) problems.push('a frente da cadeira do lago não se alcança');
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const out = `${JSON.stringify(world, null, 2)}\n`;
if (check) {
  if (out.trim() !== raw.split('\r\n').join('\n').trim()) {
    console.error('world.json NÃO é o ponto fixo de ajustes-do-vale.mjs');
    process.exit(1);
  }
  console.log('world.json OK: sem graveto nem pedra soltos, bolsão dos portões é floresta, nada de mato na frente da cadeira; a prova de BFS passa.');
} else {
  if (!fs.existsSync(backupPath) && out.trim() !== raw.split('\r\n').join('\n').trim()) {
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.writeFileSync(backupPath, raw);
  }
  fs.writeFileSync(worldPath, out);
  console.log('world.json: graveto e pedra soltos removidos, bolsão dos portões vira floresta, mato da cadeira do lago removido; a prova de BFS passa.');
}
