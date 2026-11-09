// O BOSQUE (objects/BigTrees): carvalhos velhos, bétulas, carvalhinhos e troncos caídos. São PROPS do world.json
// (`oakTree`, `birchTree`, `youngOak`, `fallenLog`) — o editor põe, move e apaga; quem bloqueia a passagem é o
// próprio prop (o tronco caído ocupa o tile dele e o da direita), sem colisão pintada.
//
// Este script só CONFERE o que estiver no mapa (não planta nem replanta nada — apagar uma árvore no editor é uma
// decisão do autor, e um script que a devolvesse desfaria o trabalho dele):
//   · cada árvore em chão plano (relevo 0) e dentro do mapa;
//   · nunca em cima de uma árvore do tileset (quadros 3/4/14-18/21/36/37/73/74) — uma versão antiga apagou três
//     pinheiros assim;
//   · o segundo tile do tronco caído sem outro prop;
//   · a prova de BFS: nenhum tile que se alcança SEM o bosque deixa de se alcançar COM ele.
//
// `bosqueTiles(world)` é exportado: biomas-flora.mjs não bota flora debaixo das árvores.
//
//   node scripts/bosque.mjs   # confere (sai com erro se algo estiver errado)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { reachable } from './cerca-do-lenhador.mjs';

export const BOSQUE_TYPES = new Set(['oakTree', 'birchTree', 'youngOak', 'fallenLog']);
/** Os quadros de árvore do tileset (pinheiros, secas, antigas: world/biomes.ts). */
const TILE_TREES = new Set([3, 4, 14, 15, 16, 17, 18, 21, 36, 37, 73, 74]);

/** Os tiles que cada peça ocupa: o pé da árvore; o tronco caído deita em dois (x e x+1). */
export const footprint = (p) => (p.type === 'fallenLog'
  ? [{ x: p.worldX, y: p.worldY }, { x: p.worldX + 1, y: p.worldY }]
  : [{ x: p.worldX, y: p.worldY }]);
export const bosqueTiles = (world) => world.props.filter((p) => BOSQUE_TYPES.has(p.type)).flatMap(footprint);

const main = () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const world = JSON.parse(fs.readFileSync(path.resolve(here, '../public/world.json'), 'utf8'));
  const { chunkColumns: CW, chunkRows: CH } = world.meta;
  const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
  const relief = (x, y) => chunkOf(x, y)?.relief?.[y % CH]?.[x % CW] ?? 0;
  const problems = [];
  const trees = world.props.filter((p) => BOSQUE_TYPES.has(p.type));

  for (const p of trees) {
    for (const t of footprint(p)) {
      const c = chunkOf(t.x, t.y);
      if (!c) { problems.push(`${p.type} em ${t.x},${t.y}: fora do mapa`); continue; }
      if (relief(t.x, t.y) !== 0) problems.push(`${p.type} em ${t.x},${t.y}: não é chão plano`);
      const frame = c.upper[t.y % CH][t.x % CW];
      if (TILE_TREES.has(frame)) problems.push(`${p.type} em ${t.x},${t.y}: em cima de uma árvore do mapa (quadro ${frame})`);
    }
    if (p.type === 'fallenLog') {
      const other = world.props.find((q) => q !== p && q.worldX === p.worldX + 1 && q.worldY === p.worldY);
      if (other) problems.push(`tronco caído em ${p.worldX},${p.worldY}: o tile da direita tem ${other.type}`);
    }
  }

  // ── A PROVA: o mundo SEM o bosque e COM ele (o mesmo BFS da cerca: colisão, quadros sólidos, props, NPCs) ──────
  const mine = new Set(bosqueTiles(world).map((t) => `${t.x},${t.y}`));
  const without = reachable({ ...world, props: world.props.filter((p) => !BOSQUE_TYPES.has(p.type)) });
  const withTrees = reachable(world);
  for (const k of without) if (!mine.has(k) && !withTrees.has(k)) problems.push(`com o bosque, ${k} deixa de ser alcançável`);
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log(`world.json OK: ${trees.length} árvores do bosque, em chão plano, sem pisar árvore do mapa, sem fechar caminho.`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
