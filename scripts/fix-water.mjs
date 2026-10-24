// AS ÁGUAS DO MUNDO, LIMPAS — os defeitos de mapa que a revisão dos lagos achou (2026-10-23).
// Rode com `node scripts/fix-water.mjs` (escreve) ou `--check` (só confere se o disco é o ponto
// fixo). Faça um backup antes: `backup/world-pre-water.json` é o desta passada.
//
// O que ele faz, e só isto:
//   1. A MARGEM SUL DO LAGO GRANDE (noroeste) era um pente: dois dentes de terra de 1 tile
//      entrando na água (4,8) e (8,8), e por causa deles um tile de lago ficava SOLTO em (9,8),
//      tocando o lago só pela quina — uma poça de pincel. Os dois dentes viram água, e a poça
//      passa a ser o canto do lago. O PÍER de terra da margem norte (5,3) FICA: o caminho de terra
//      termina nele de propósito.
//   2. As poças de rio SOLTAS: o tile isolado em (50,52) e a vala de 3×1 em (36..38,11), ao pé da
//      rocha de ferro. Água que não é lago nem rio, e não serve a nada que um lago de verdade ao
//      lado não sirva (o balde enche em qualquer água), lê como erro de pincel. Viram chão.
//
// Por que é seguro, e o `--check` reprova se não for: tudo é DETERMINÍSTICO (zero Math.random), o
// script mira um ESTADO (rodar duas vezes = rodar uma), e há uma PROVA DE BFS — todo tile que se
// alcançava a pé do início do jogo antes continua alcançável depois, exceto os que viraram água
// (e só viram água os dentes do item 1, que são becos).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WORLD_PATH = fileURLToPath(new URL('../public/world.json', import.meta.url));
const CHECK = process.argv.includes('--check');

// ── O que o mundo sabe sobre os próprios tiles (espelha src/game/constants.ts) ──────────────────
const SEA_TILE_FRAME = 33;
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 45, 46, 47, 48, 49, 50]);
// Props que NÃO barram o passo. Todo o resto conta como parede para a prova de BFS — conservador:
// um mundo que a prova acha mais fechado do que é só a deixa mais exigente, nunca mais frouxa.
const WALKABLE_PROPS = new Set(['plantSpot', 'moonflower']);

const LAKE_TEETH = [[4, 8], [8, 8]];
const STRAY_RIVER = [[50, 52], [36, 11], [37, 11], [38, 11]];

const raw = readFileSync(WORLD_PATH, 'utf8');
const world = JSON.parse(raw);
const { chunkColumns: CW, chunkRows: CH } = world.meta;

const chunkAt = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
const cell = (x, y) => {
  const c = chunkAt(x, y);
  return c ? { c, lx: ((x % CW) + CW) % CW, ly: ((y % CH) + CH) % CH } : null;
};
const groundAt = (x, y) => { const t = cell(x, y); return t ? t.c.ground[t.ly][t.lx] : null; };

const propsAt = () => {
  const m = new Map();
  for (const p of world.props) {
    const k = `${p.worldX},${p.worldY}`;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(p);
  }
  return m;
};

const isWater = (x, y, props) => groundAt(x, y) === SEA_TILE_FRAME
  || (props.get(`${x},${y}`) ?? []).some((p) => p.type === 'water');

const walkable = (x, y, props) => {
  const t = cell(x, y);
  if (!t) return false;
  if (isWater(x, y, props)) return false;
  if (t.c.collisions[t.ly][t.lx]) return false;
  const up = t.c.upper[t.ly][t.lx];
  if (up !== null && SOLID_UPPER.has(up)) return false;
  return (props.get(`${x},${y}`) ?? []).every((p) => WALKABLE_PROPS.has(p.type));
};

const reachable = () => {
  const props = propsAt();
  const start = world.meta.playerStart;
  const seen = new Set([`${start.worldX},${start.worldY}`]);
  const q = [[start.worldX, start.worldY]];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const k = `${nx},${ny}`;
      if (seen.has(k) || !walkable(nx, ny, props)) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
};

const before = reachable();
const changed = [];

// 1. Os dentes da margem sul do lago grande viram lago (e a poça da quina vira o canto dele).
for (const [x, y] of LAKE_TEETH) {
  const t = cell(x, y);
  if (t.c.ground[t.ly][t.lx] === SEA_TILE_FRAME) continue;
  t.c.ground[t.ly][t.lx] = SEA_TILE_FRAME;
  t.c.upper[t.ly][t.lx] = null; // a moita que estava ali afundaria com o tile: CHÃO + UMA COISA
  t.c.collisions[t.ly][t.lx] = false; // a água bloqueia sozinha (SOLID_GROUND_FRAMES)
  changed.push(`lago +(${x},${y})`);
}

// 2. As poças de rio soltas viram chão (o chão por baixo do rio já é a terra do campo).
for (const [x, y] of STRAY_RIVER) {
  const i = world.props.findIndex((p) => p.type === 'water' && p.worldX === x && p.worldY === y);
  if (i < 0) continue;
  world.props.splice(i, 1);
  changed.push(`rio -(${x},${y})`);
}

// ── A PROVA: ninguém ficou preso ──────────────────────────────────────────────────────────────
const after = reachable();
const lost = [...before].filter((k) => !after.has(k)
  && !LAKE_TEETH.some(([x, y]) => k === `${x},${y}`));
if (lost.length > 0) {
  console.error(`✖ a passada prenderia ${lost.length} tile(s) alcançáveis: ${lost.slice(0, 12).join(' ')}`);
  process.exit(1);
}

const out = `${JSON.stringify(world, null, 2)}\n`;
if (CHECK) {
  if (out !== raw) {
    console.error(`✖ o world.json NÃO é o ponto fixo: faltam ${changed.length} mudança(s) — ${changed.join(', ')}`);
    process.exit(1);
  }
  console.log(`✓ as águas estão limpas (alcançáveis: ${after.size} tiles)`);
} else {
  if (out !== raw) writeFileSync(WORLD_PATH, out, 'utf8');
  console.log(`${changed.length} mudança(s): ${changed.join(', ') || 'nenhuma'}`);
  console.log(`alcançáveis do início: ${before.size} → ${after.size} tiles`);
}
