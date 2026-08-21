#!/usr/bin/env node
// Planta A PIRA no meio do mundo.
//
// Ele LÊ o world.json e ACRESCENTA um prop — nunca reescreve o mundo (a lei da casa: mexer no
// mundo em massa é um script que lê e acrescenta, `enrich-world.mjs` é o modelo). Idempotente:
// mira num TOTAL (uma pira, no centro), então rodar duas vezes não põe duas.
//
//   node scripts/add-pyre.mjs           # planta (ou confirma que já está lá)
//   node scripts/add-pyre.mjs --check   # só verifica, sai 1 se faltar
//
// O TILE é o centro geométrico do mundo 5×5: (30,30). Ele foi escolhido a olho no JSON e
// conferido: chão de grama, sem colisão pintada, sem prop, sem entidade, e com os quatro
// vizinhos livres — a pira BLOQUEIA, então quem não tem por onde chegar não pode montá-la.

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

const WORLD = 'public/world.json';
const check = process.argv.includes('--check');

const world = JSON.parse(readFileSync(WORLD, 'utf8'));
const { worldChunksX, worldChunksY, chunkColumns, chunkRows } = world.meta;
const centerX = Math.floor((worldChunksX * chunkColumns) / 2);
const centerY = Math.floor((worldChunksY * chunkRows) / 2);

const already = (world.props ?? []).filter((p) => p.type === 'pyre');
if (already.length > 0) {
  const at = already.map((p) => `(${p.worldX},${p.worldY})`).join(' ');
  console.log(`pira já plantada: ${at}`);
  process.exit(0);
}
if (check) {
  console.error('FALTA a pira no world.json');
  process.exit(1);
}

// O tile precisa estar vazio: nada de plantar em cima de uma fogueira ou de uma árvore.
const chunk = world.chunks.find(
  (c) => c.cx === Math.floor(centerX / chunkColumns) && c.cy === Math.floor(centerY / chunkRows),
);
if (!chunk) throw new Error(`chunk do centro (${centerX},${centerY}) não existe`);
const localX = centerX % chunkColumns;
const localY = centerY % chunkRows;
if (chunk.collisions?.[localY]?.[localX] === true) {
  throw new Error(`(${centerX},${centerY}) tem colisão pintada`);
}
const occupied = (world.props ?? []).some((p) => p.worldX === centerX && p.worldY === centerY);
if (occupied) throw new Error(`(${centerX},${centerY}) já tem outro prop`);
const entity = [...(chunk.npcs ?? []), ...(chunk.enemies ?? []), ...(chunk.pickups ?? [])]
  .some((e) => e.worldX === centerX && e.worldY === centerY);
if (entity) throw new Error(`(${centerX},${centerY}) tem uma entidade`);

if (!existsSync(`${WORLD}.bak`)) copyFileSync(WORLD, `${WORLD}.bak`);
world.props.push({ type: 'pyre', worldX: centerX, worldY: centerY });
writeFileSync(WORLD, `${JSON.stringify(world, null, 2)}\n`);
console.log(`pira plantada em (${centerX},${centerY}) — backup em ${WORLD}.bak`);
