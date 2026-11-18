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
// O acampamento COMEÇA só com o colchão (53,48), as pedras do fogo (53,49) e o caderno de campo (53,47) (pedido do
// autor, 2026-11-17: o resto o jogador põe pela bancada); o Z do colchão é dado de (54,48), o do caderno de (54,47). A
// BANCADA (55,45) é um prop `toolbox` deste arquivo (o jogo a monta como qualquer bancada), lida de (54,45).
const SOLID = [[53, 48], [53, 49], [53, 47]];
export const CAMP_BENCH = { worldX: 55, worldY: 45 };
/**
 * A FRENTE DA BANCADA (55,46): a bancada olha para o sul (`dir: 2`), e ali morava um carvalhinho do bosque, colado nela —
 * o herói só a usava de lado. Saiu a pedido do autor (2026-11-17: "remova essa árvore, o herói usa a mesa de frente,
 * que é mais natural"); o tile fica livre de tudo, e a grade nunca põe peça nele (runtime/homeGrid.CAMP_PASSAGES).
 */
export const CAMP_BENCH_FRONT = { worldX: 55, worldY: 46 };
const FRONT = [[54, 48], [54, 47], [54, 45], [CAMP_BENCH_FRONT.worldX, CAMP_BENCH_FRONT.worldY]];
/**
 * O MIOLO do acampamento: a clareira de terra batida e a fileira da bancada, mais a passagem para o sul. Fica limpo de
 * enfeite, e é o chão livre de saída — em volta dele é o mato alto verde (scripts/mato-do-acampamento.mjs).
 */
export const CAMP_TILES = (() => {
  const out = new Set();
  for (let y = 45; y <= 50; y += 1) for (let x = 52; x <= 55; x += 1) out.add(`${x},${y}`);
  for (const [x, y] of [[54, 51], [54, 52]]) out.add(`${x},${y}`);
  return out;
})();
/** As árvores e paredes do tileset (constants.SOLID_UPPER_FRAMES): sólidas no jogo sem `collisions` no arquivo. */
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 73, 74]);

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
  // A BANCADA DO LAR: um prop `toolbox` como qualquer outro (idempotente: só entra se ainda não estiver lá).
  const benchKey = `${CAMP_BENCH.worldX},${CAMP_BENCH.worldY}`;
  if (!world.props.some((p) => p.type === 'toolbox' && `${p.worldX},${p.worldY}` === benchKey)) {
    world.props.push({ type: 'toolbox', worldX: CAMP_BENCH.worldX, worldY: CAMP_BENCH.worldY, dir: 2 });
  }
  // A frente da bancada fica livre: sai o que estiver nela (o carvalhinho do bosque que a escondia).
  world.props = world.props.filter((p) => p.worldX !== CAMP_BENCH_FRONT.worldX || p.worldY !== CAMP_BENCH_FRONT.worldY);
  const taken = new Set(world.props.map((p) => `${p.worldX},${p.worldY}`));
  for (const c of world.chunks) {
    for (const p of c.pickups) taken.add(`${p.worldX},${p.worldY}`);
    for (const n of c.npcs) taken.add(`${n.worldX},${n.worldY}`);
  }
  // As árvores do BOSQUE (objects/BigTrees, postas no /editor) podem fazer sombra na beira da clareira (menos na frente
  // da bancada, acima). Elas continuam sólidas na prova de caminho.
  const GROVE = new Set(['oakTree', 'birchTree', 'youngOak', 'fallenLog']);
  const grove = new Set(world.props.filter((p) => GROVE.has(p.type)).map((p) => `${p.worldX},${p.worldY}`));
  const treeAt = (x, y) => SOLID_UPPER.has(chunkOf(x, y)?.upper?.[y % CH]?.[x % CW]);
  for (const k of CAMP_TILES) {
    const [x, y] = k.split(',').map(Number);
    const c = chunkOf(x, y);
    if (c.collisions[y % CH][x % CW]) problems.push(`o tile ${k} do acampamento é sólido`);
    if (treeAt(x, y)) problems.push(`há uma árvore do mapa no acampamento, em ${k}`);
    if (taken.has(k) && k !== benchKey && !grove.has(k)) problems.push(`há uma peça do mapa no acampamento, em ${k}`);
    if (relief(x, y) !== 0) problems.push(`o tile ${k} do acampamento não é chão plano`);
    c.upper[y % CH][x % CW] = null;
  }

  // ── A PROVA: do começo, com as peças sólidas (e as árvores do mapa), chega-se a cada peça. ─────────────────────
  const canStep = makeCanStep(relief);
  const solid = new Set(SOLID.map(([x, y]) => `${x},${y}`));
  const blocked = (x, y) => {
    const c = chunkOf(x, y);
    return !c || c.collisions[y % CH][x % CW] || treeAt(x, y) || solid.has(`${x},${y}`) || taken.has(`${x},${y}`);
  };
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
