// A CERCA DO LENHADOR (pedido do autor: "hoje o lenhador é cercado por árvores, na verdade faça ser cercado por uma
// cerca de madeira… quero cada lugar cada vez mais único"). O quintal do Bram (o lenhador, NPC `businessMan` em 53,5)
// era uma clareira murada por pinheiros. Este script troca o muro de pinheiros por uma cerca de madeira
// (props `woodFence`, objects/WoodFence.ts) em volta do quintal, com o portão onde a passagem já era (53-54 no sul):
//
//   · a cerca: norte y=1, oeste x=48, leste x=59 (a borda do mapa), sul y=11 — menos o portão;
//   · os pinheiros de DENTRO do quintal saem (o quintal fica aberto, de terra e capim); os de fora (a mata ao norte
//     e o lado da Vega, a oeste) ficam onde estão;
//   · o enfeite rasteiro debaixo de um tile de cerca sai (a cerca não nasce em cima de uma moita).
//
// Não toca em `ground` nem em `collisions`. A PROVA de BFS: nenhum tile que se alcançava deixa de se alcançar.
// IDEMPOTENTE e DETERMINÍSTICO.
//   node scripts/cerca-do-lenhador.mjs           # aplica
//   node scripts/cerca-do-lenhador.mjs --check   # só confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { makeCanStep } from './relevo.mjs';

/** O que bloqueia pelo quadro de cima (constants.ts SOLID_UPPER_FRAMES): árvores, lápide, montanha, alvenaria. */
export const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 73, 74, 39, 40, 45, 46, 47, 48, 49, 50]);
/** As árvores do tileset (constants.ts TREE_UPPER_FRAMES). */
const TREE_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 36, 37]);
/** O que nunca anda por cima: o mar (constants.ts SOLID_GROUND_FRAMES). */
const SOLID_GROUND = new Set([33]);

const YARD = { x0: 48, y0: 1, x1: 59, y1: 11 };
const GATE = [{ x: 53, y: 11 }, { x: 54, y: 11 }];

export const fenceTiles = () => {
  const out = [];
  for (let x = YARD.x0; x <= YARD.x1; x += 1) {
    for (let y = YARD.y0; y <= YARD.y1; y += 1) {
      const edge = x === YARD.x0 || x === YARD.x1 || y === YARD.y0 || y === YARD.y1;
      if (edge && !GATE.some((g) => g.x === x && g.y === y)) out.push({ x, y });
    }
  }
  return out;
};

/** Quem alcança o quê, a partir do início do herói (o que bloqueia no jogo: colisão, quadros sólidos, props, NPCs). */
export const reachable = (world) => {
  const { chunkColumns: CW, chunkRows: CH } = world.meta;
  const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
  const relief = (x, y) => chunkOf(x, y)?.relief?.[y % CH]?.[x % CW] ?? 0;
  const canStep = makeCanStep(relief);
  const taken = new Set();
  for (const p of world.props) {
    taken.add(`${p.worldX},${p.worldY}`);
    if (p.type === 'fallenLog') taken.add(`${p.worldX + 1},${p.worldY}`);
  }
  for (const c of world.chunks) for (const p of [...c.pickups, ...c.npcs]) taken.add(`${p.worldX},${p.worldY}`);
  const blocked = (x, y) => {
    const c = chunkOf(x, y);
    if (!c) return true;
    const lx = x % CW;
    const ly = y % CH;
    return c.collisions[ly][lx] || SOLID_GROUND.has(c.ground[ly][lx]) || SOLID_UPPER.has(c.upper[ly][lx]) || taken.has(`${x},${y}`);
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
  return seen;
};

const main = () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const worldPath = path.resolve(here, '../public/world.json');
  const check = process.argv.includes('--check');
  const raw = fs.readFileSync(worldPath, 'utf8');
  const world = JSON.parse(raw);
  const before = JSON.parse(raw);
  const { chunkColumns: CW, chunkRows: CH } = world.meta;
  const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
  const problems = [];
  const fence = fenceTiles();
  const fenceKeys = new Set(fence.map((t) => `${t.x},${t.y}`));

  // Os pinheiros de dentro do quintal saem.
  for (let x = YARD.x0 + 1; x < YARD.x1; x += 1) {
    for (let y = YARD.y0 + 1; y < YARD.y1; y += 1) {
      const c = chunkOf(x, y);
      if (TREE_UPPER.has(c.upper[y % CH][x % CW])) c.upper[y % CH][x % CW] = null;
    }
  }
  // A cerca: nada de outro prop, NPC ou item no tile dela; o que havia de quadro em cima sai.
  for (const t of fence) {
    const c = chunkOf(t.x, t.y);
    if (!c) { problems.push(`${t.x},${t.y} fora do mapa`); continue; }
    const other = world.props.find((p) => p.worldX === t.x && p.worldY === t.y && p.type !== 'woodFence');
    if (other) problems.push(`há ${other.type} em ${t.x},${t.y}`);
    for (const ch of world.chunks) {
      for (const p of [...ch.pickups, ...ch.npcs]) if (p.worldX === t.x && p.worldY === t.y) problems.push(`há ${p.type ?? 'npc'} em ${t.x},${t.y}`);
    }
    c.upper[t.y % CH][t.x % CW] = null;
  }
  world.props = [
    ...world.props.filter((p) => !(p.type === 'woodFence' && !fenceKeys.has(`${p.worldX},${p.worldY}`))),
    ...fence.filter((t) => !world.props.some((p) => p.type === 'woodFence' && p.worldX === t.x && p.worldY === t.y))
      .map((t) => ({ type: 'woodFence', worldX: t.x, worldY: t.y })),
  ];

  // ── A PROVA ─────────────────────────────────────────────────────────────────────────────
  const was = reachable(before);
  const now = reachable(world);
  for (const k of was) if (!fenceKeys.has(k) && !now.has(k)) problems.push(`com a cerca, ${k} deixa de ser alcançável`);
  // O quintal se alcança pelo portão (o NPC em 53,5 não é pisável; o tile da frente dele é).
  if (!now.has('53,10') || !now.has('53,6')) problems.push('o quintal do lenhador não se alcança pelo portão');
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

  const out = `${JSON.stringify(world, null, 2)}\n`;
  if (check) {
    if (out.trim() !== raw.split('\r\n').join('\n').trim()) { console.error('world.json NÃO é o ponto fixo de cerca-do-lenhador.mjs'); process.exit(1); }
    console.log('world.json OK: o quintal do lenhador está cercado, com o portão no sul, e nenhum caminho fechou.');
  } else {
    fs.writeFileSync(worldPath, out);
    console.log(`world.json: ${fence.length} tiles de cerca em volta do quintal do lenhador; a prova de BFS passa.`);
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
