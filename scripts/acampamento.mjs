// O CHÃO DO ACAMPAMENTO DO HERÓI (pedido do autor; objects/HeroCamp.ts): do lado direito do laguinho, na margem nordeste.
// As peças (o colchão, as pedras, as lembranças dos pedidos) são objetos do código; aqui só o chão: os tiles do
// acampamento e a frente dele ficam limpos de enfeite rasteiro, e a prova de BFS garante que, do começo, o herói chega
// ao colchão com todas as peças no lugar (sólidas).
//
// `CAMP_TILES` é exportado: biomas-flora.mjs pula esses tiles, senão devolveria a flora a eles.
//
// LÊ o world.json e acrescenta, como o CLAUDE.md manda: IDEMPOTENTE e DETERMINÍSTICO.
//
//   node scripts/acampamento.mjs           # aplica
//   node scripts/acampamento.mjs --check   # só confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { makeCanStep } from './relevo.mjs';

// A MESMA tabela de objects/HeroCamp.ts — mudou lá, muda aqui.
// O colchão (53,48), as pedras, o tronco, as quatro lembranças e o caderno de campo (53,47); o Z do colchão é dado de
// (54,48), e o do caderno de (54,47).
const SOLID = [[53, 48], [53, 49], [52, 49], [52, 48], [55, 47], [55, 48], [52, 47], [53, 47]];
const FRONT = [[54, 48], [54, 47]];
/** O retângulo do acampamento, com a frente: tudo limpo de enfeite. */
export const CAMP_TILES = (() => {
  const out = new Set();
  for (let y = 46; y <= 49; y += 1) for (let x = 52; x <= 55; x += 1) out.add(`${x},${y}`);
  return out;
})();

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
  for (const k of CAMP_TILES) {
    const [x, y] = k.split(',').map(Number);
    const c = chunkOf(x, y);
    if (c.collisions[y % CH][x % CW]) problems.push(`o tile ${k} do acampamento é sólido`);
    if (taken.has(k)) problems.push(`há uma peça do mapa no acampamento, em ${k}`);
    if (relief(x, y) !== 0) problems.push(`o tile ${k} do acampamento não é chão plano`);
    c.upper[y % CH][x % CW] = null;
  }

  // ── A PROVA: do começo, com as peças sólidas, chega-se ao colchão. ─────────────────────
  const canStep = makeCanStep(relief);
  const solid = new Set(SOLID.map(([x, y]) => `${x},${y}`));
  const blocked = (x, y) => { const c = chunkOf(x, y); return !c || c.collisions[y % CH][x % CW] || solid.has(`${x},${y}`) || taken.has(`${x},${y}`); };
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
  for (const [x, y] of FRONT) if (!seen.has(`${x},${y}`)) problems.push(`do começo não se chega à frente da peça (${x},${y})`);
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

  const out = `${JSON.stringify(world, null, 2)}\n`;
  if (check) {
    if (out.trim() !== raw.split('\r\n').join('\n').trim()) { console.error('world.json NÃO é o ponto fixo de acampamento.mjs'); process.exit(1); }
    console.log('world.json OK: o chão do acampamento está limpo, e do começo se chega ao colchão.');
  } else {
    fs.writeFileSync(worldPath, out);
    console.log('world.json: o chão do acampamento ficou limpo; a prova de BFS passa.');
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
