#!/usr/bin/env node
// UM NPC APARECE UMA VEZ SÓ NO MAPA — este script põe o disco de acordo com a regra.
//
// A regra já vive no runtime (`WorldData.setWorldData` descarta repetido na carga) e no editor
// (`EditorStore.placeEntity` MOVE em vez de clonar; o Salvar avisa). Este script é a terceira
// perna: o arquivo em git também tem de obedecer, senão o autor abre o /editor e vê um mundo que
// o jogo não desenha.
//
//   node scripts/unique-npcs.mjs           # aplica (e diz exatamente o que tirou)
//   node scripts/unique-npcs.mjs --check   # não escreve; sai 1 se houver repetido
//
// QUEM FICA: o PRIMEIRO em ordem de leitura (cy, depois cx, depois y, depois x) — a mesma ordem
// que o runtime usa, para o disco e o jogo nunca discordarem sobre qual sobreviveu.
//
// O QUE ELE NÃO TOCA: os diálogos. Um gato removido leva embora o corpo, não a fala — `catAxe` e
// os outros continuam inteiros no `dialogs`, prontos para um personagem novo dizê-los. Também não
// mexe em pickups: os itens que estavam ao lado de cada NPC ficam onde estão.

import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

const WORLD = process.argv.find((a) => a.endsWith('.json') && !a.startsWith('--')) ?? 'public/world.json';
const check = process.argv.includes('--check');

const world = JSON.parse(readFileSync(WORLD, 'utf8'));
const chunks = [...world.chunks].sort((a, b) => a.cy - b.cy || a.cx - b.cx);

const seen = new Set();
const removed = [];
for (const chunk of chunks) {
  const npcs = chunk.npcs ?? [];
  if (npcs.length === 0) continue;
  chunk.npcs = [...npcs]
    .sort((a, b) => a.worldY - b.worldY || a.worldX - b.worldX)
    .filter((npc) => {
      if (!seen.has(npc.type)) {
        seen.add(npc.type);
        return true;
      }
      removed.push(npc);
      return false;
    });
}

if (removed.length === 0) {
  console.log(`${WORLD}: ok — ${seen.size} NPC(s), um de cada tipo.`);
  process.exit(0);
}

console.log(`${WORLD}: ${removed.length} NPC(s) repetido(s):`);
for (const npc of removed) {
  console.log(`  - ${npc.type} em (${npc.worldX},${npc.worldY})${npc.dialog ? ` — fala "${npc.dialog}"` : ''}`);
}

if (check) {
  console.error('FALHA: o disco tem NPC repetido (rode sem --check para corrigir)');
  process.exit(1);
}

if (!existsSync(`${WORLD}.bak`)) copyFileSync(WORLD, `${WORLD}.bak`);
writeFileSync(WORLD, `${JSON.stringify(world, null, 2)}\n`);
console.log(`removidos. Ficaram ${seen.size} NPC(s), um de cada tipo. Backup em ${WORLD}.bak`);
