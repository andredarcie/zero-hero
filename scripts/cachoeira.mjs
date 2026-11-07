// A CACHOEIRA DO ACAMPAMENTO (pedido do autor: "veja um lugar ideal, faça uma fonte da água caindo tipo cachoeira";
// objects/Waterfall.ts). O lugar: o planalto baixo logo ao sul do acampamento do herói. A parede sul dele fica de
// frente para a câmera, e o laguinho do acampamento começa um passo a leste. Uma nascente brota entre pedras na beira
// do planalto (53,55), cai a parede e enche um poço (53,56) que escorre por (53,57) até o laguinho (54,57): a
// cachoeira é de onde vem a água do lago do herói. (Em (52,55) a nascente fechava um bolso do planalto: a prova reprovou.)
//
// O script:
//   · põe as duas peças de água do poço (props `water`, como as do laguinho) e tira o enfeite rasteiro de baixo delas;
//   · torna sólido o tile da nascente (as pedras e o olho d'água ficam em cima dele);
//   · prova por BFS que nada que se alcançava do começo deixa de se alcançar, fora os próprios tiles de água e o da
//     nascente, e que a beira do laguinho (51,58) continua alcançável para o herói olhar a queda de perto.
//
// `WATERFALL_TILES` é exportado: biomas-flora.mjs pula esses tiles, senão devolveria a flora a eles.
//
// IDEMPOTENTE e DETERMINÍSTICO.
//   node scripts/cachoeira.mjs           # aplica
//   node scripts/cachoeira.mjs --check   # só confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { makeCanStep } from './relevo.mjs';

// AS MESMAS coordenadas de objects/Waterfall.ts — mudou lá, muda aqui.
export const SPRING_TILE = { x: 53, y: 55 };
// O poço do pé (53,56) e o LAGUINHO DAS CARPAS logo abaixo dele (pedido do autor: "a parte de baixo faça um lago com
// carpas"; objects/KoiPond.ts), que deságua no laguinho do acampamento por (53,57)→(54,57).
// Depois, "lago maior": o poço e o laguinho do acampamento viraram UM lago, o retângulo 5×3 (52..56, 56..58).
export const POOL_TILES = [
  { x: 52, y: 56 }, { x: 53, y: 56 }, { x: 54, y: 56 }, { x: 55, y: 56 },
  { x: 52, y: 57 }, { x: 53, y: 57 },
  { x: 52, y: 58 }, { x: 53, y: 58 }, { x: 54, y: 58 }, { x: 55, y: 58 }, { x: 56, y: 58 },
];
/** O tile de água do laguinho em que o poço deságua. */
const LAKE_TILE = { x: 54, y: 57 };
/** De onde o herói olha a queda. */
const VIEW_TILE = { x: 51, y: 58 };
// O RIACHO DO ALTO ("faça água em cima pra parecer realista"): o olho d'água em (52,54) e o leito em (53,54), em cima
// do planalto, desenhados por Waterfall.paintStream; sólidos, porque ninguém anda dentro do riacho.
export const STREAM_TILES = [{ x: 52, y: 54 }, { x: 53, y: 54 }];
export const WATERFALL_TILES = [SPRING_TILE, ...STREAM_TILES, ...POOL_TILES];

const main = () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const worldPath = path.resolve(here, '../public/world.json');
  const check = process.argv.includes('--check');
  const raw = fs.readFileSync(worldPath, 'utf8');
  const world = JSON.parse(raw);
  const { chunkColumns: CW, chunkRows: CH } = world.meta;
  const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
  const relief = (x, y) => chunkOf(x, y)?.relief?.[y % CH]?.[x % CW] ?? 0;
  const problems = [];
  const isWater = (x, y) => world.props.some((p) => p.type === 'water' && p.worldX === x && p.worldY === y);

  if (relief(SPRING_TILE.x, SPRING_TILE.y) !== 1) problems.push('a nascente não está na beira do planalto');
  if (relief(SPRING_TILE.x, SPRING_TILE.y + 1) !== 0) problems.push('abaixo da nascente não é chão: não há parede para a água cair');
  if (!isWater(LAKE_TILE.x, LAKE_TILE.y)) problems.push(`o laguinho não começa em ${LAKE_TILE.x},${LAKE_TILE.y}`);

  // O mundo de antes (para a prova), e então as mudanças.
  const before = JSON.parse(JSON.stringify(world));
  for (const t of POOL_TILES) {
    if (relief(t.x, t.y) !== 0) problems.push(`o poço em ${t.x},${t.y} não é chão plano`);
    const other = world.props.find((p) => p.worldX === t.x && p.worldY === t.y && p.type !== 'water');
    if (other) problems.push(`há ${other.type} no tile do poço ${t.x},${t.y}`);
    if (!isWater(t.x, t.y)) world.props.push({ type: 'water', worldX: t.x, worldY: t.y });
    chunkOf(t.x, t.y).upper[t.y % CH][t.x % CW] = null;
  }
  for (const t of STREAM_TILES) {
    if (relief(t.x, t.y) !== 1) problems.push(`o riacho em ${t.x},${t.y} não está em cima do planalto`);
    const c = chunkOf(t.x, t.y);
    c.upper[t.y % CH][t.x % CW] = null;
    c.collisions[t.y % CH][t.x % CW] = true;
  }
  {
    const c = chunkOf(SPRING_TILE.x, SPRING_TILE.y);
    c.upper[SPRING_TILE.y % CH][SPRING_TILE.x % CW] = null;
    c.collisions[SPRING_TILE.y % CH][SPRING_TILE.x % CW] = true;
  }
  for (const c of world.chunks) {
    for (const p of [...c.pickups, ...c.npcs]) {
      if (WATERFALL_TILES.some((t) => t.x === p.worldX && t.y === p.worldY)) problems.push(`há ${p.type} num tile da cachoeira (${p.worldX},${p.worldY})`);
    }
  }

  // ── A PROVA ─────────────────────────────────────────────────────────────────────────────
  const canStep = makeCanStep(relief);
  const reach = (w) => {
    const taken = new Set(w.props.map((p) => `${p.worldX},${p.worldY}`));
    for (const c of w.chunks) for (const p of [...c.pickups, ...c.npcs]) taken.add(`${p.worldX},${p.worldY}`);
    const cof = (x, y) => w.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
    const blocked = (x, y) => { const ch = cof(x, y); return !ch || ch.collisions[y % CH][x % CW] || taken.has(`${x},${y}`); };
    const start = w.meta.playerStart;
    const seen = new Set([`${start.worldX},${start.worldY}`]);
    const q = [[start.worldX, start.worldY]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy; const k = `${nx},${ny}`;
        if (seen.has(k) || blocked(nx, ny) || !canStep(x, y, nx, ny)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return seen;
  };
  const was = reach(before);
  const now = reach(world);
  const mine = new Set(WATERFALL_TILES.map((t) => `${t.x},${t.y}`));
  for (const k of was) if (!mine.has(k) && !now.has(k)) problems.push(`com a cachoeira, ${k} deixa de ser alcançável`);
  if (!now.has(`${VIEW_TILE.x},${VIEW_TILE.y}`)) problems.push(`a beira do poço (${VIEW_TILE.x},${VIEW_TILE.y}) não é alcançável`);
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

  const out = `${JSON.stringify(world, null, 2)}\n`;
  if (check) {
    if (out.trim() !== raw.split('\r\n').join('\n').trim()) { console.error('world.json NÃO é o ponto fixo de cachoeira.mjs'); process.exit(1); }
    console.log('world.json OK: o poço da cachoeira está no lugar, e ela não fecha caminho nenhum.');
  } else {
    fs.writeFileSync(worldPath, out);
    console.log('world.json: a nascente e o poço da cachoeira estão no lugar; a prova de BFS passa.');
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
