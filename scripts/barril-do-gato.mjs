// O CHÃO DO BARRIL DO GATO (pedido do autor; objects/CatBarrel.ts): o tile do barril fica limpo de enfeite rasteiro,
// e a prova de BFS garante que o barril (sólido) não fecha nenhum caminho: do começo, todo tile que se alcançava sem
// ele continua alcançável com ele, e chega-se a um lado do barril para o Z.
//
// `BARREL_TILE` é exportado: biomas-flora.mjs pula esse tile, senão devolveria a flora a ele.
//
// LÊ o world.json e acrescenta, como o CLAUDE.md manda: IDEMPOTENTE e DETERMINÍSTICO.
//
//   node scripts/barril-do-gato.mjs           # aplica
//   node scripts/barril-do-gato.mjs --check   # só confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { makeCanStep } from './relevo.mjs';

// A MESMA coordenada de objects/CatBarrel.ts — mudou lá, muda aqui.
export const BARREL_TILE = { x: 28, y: 47 };

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
  const taken = new Set(world.props.map((p) => `${p.worldX},${p.worldY}`));
  for (const c of world.chunks) {
    for (const p of c.pickups) taken.add(`${p.worldX},${p.worldY}`);
    for (const n of c.npcs) taken.add(`${n.worldX},${n.worldY}`);
  }
  const { x: bx, y: by } = BARREL_TILE;
  const key = `${bx},${by}`;
  const c = chunkOf(bx, by);
  if (c.collisions[by % CH][bx % CW]) problems.push(`o tile ${key} do barril é sólido`);
  if (taken.has(key)) problems.push(`há uma peça do mapa no tile do barril, ${key}`);
  if (relief(bx, by) !== 0) problems.push(`o tile ${key} do barril não é chão plano`);
  c.upper[by % CH][bx % CW] = null;

  // ── A PROVA: com o barril sólido, nada que se alcançava deixa de se alcançar. ──────────
  const canStep = makeCanStep(relief);
  const reach = (barrel) => {
    const blocked = (x, y) => { const ch = chunkOf(x, y); return !ch || ch.collisions[y % CH][x % CW] || taken.has(`${x},${y}`) || (barrel && x === bx && y === by); };
    const start = world.meta.playerStart;
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
  const without = reach(false);
  const withBarrel = reach(true);
  for (const k of without) if (k !== key && !withBarrel.has(k)) problems.push(`com o barril, ${k} deixa de ser alcançável`);
  if (![[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => withBarrel.has(`${bx + dx},${by + dy}`))) problems.push('nenhum lado do barril é alcançável');
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

  const out = `${JSON.stringify(world, null, 2)}\n`;
  if (check) {
    if (out.trim() !== raw.split('\r\n').join('\n').trim()) { console.error('world.json NÃO é o ponto fixo de barril-do-gato.mjs'); process.exit(1); }
    console.log('world.json OK: o chão do barril está limpo, e o barril não fecha caminho nenhum.');
  } else {
    fs.writeFileSync(worldPath, out);
    console.log('world.json: o chão do barril ficou limpo; a prova de BFS passa.');
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
