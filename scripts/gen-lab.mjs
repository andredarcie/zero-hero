#!/usr/bin/env node
// Gera public/lab.json — o mundo do Laboratorio de Puzzles (/lab).
//
// Um mundo MINIMO (2x1 chunks = 24x12 tiles): quase zero caminhada — o spawn ve os dois
// puzzles, e cada travessia tem poucos passos. Andar pelo cenario nao e puzzle.
//
//   - CENTRO (hub): spawn, fogueira acesa, gato-guia e a sala do tesouro trancada.
//   - OESTE, PUZZLE 1 "O Lenhador": um rio corta o mapa de ponta a ponta; nenhuma ponte e
//     nenhum bridgeSpot — a UNICA travessia e derrubar arvores NA DIRECAO da agua
//     (mecanica TIMBER). A chave do tesouro mora numa ilha que so um segundo tombo
//     bem mirado alcanca: a arvore A (colada na margem) ensina, a arvore B (anel d'agua
//     com uma unica direcao valida de tombo) testa.
//   - LESTE, PUZZLE 2 "Fogo Emprestado": fogueira morta cercada por um fosso de lava com
//     uma unica falha: um mato seco. Fogo carregado do hub morre no caminho
//     (TORCH_BURN_MS) — a sacada e usar a propria lava do fosso como isqueiro: acender o
//     graveto ali, queimar o mato, atravessar a brecha e entregar a chama.
//
// Principios aplicados: lock-before-key (porta e fogueira morta visiveis antes das
// chaves), chaves multiuso (tocha queima mato E acende fogueira; lava e obstaculo E
// isqueiro), feedback educativo (tombo errado solta graveto e a arvore renasce em 60s),
// sem soft-lock (nada essencial e consumivel).
//
// Uso: node scripts/gen-lab.mjs   (ou: npm run generate:lab)

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHUNKS_X = 2;
const CHUNKS_Y = 1;
const COLS = 12;
const ROWS = 12;
const GROUND_TILE = 5; // "Terra" — o chao padrao do overworld
const WALL_TILE = 12; // "Pedregulho" — paredes da sala do tesouro (com colisao pintada)

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'lab.json');

// ── Terreno ─────────────────────────────────────────────────────────────────

const chunks = [];
for (let cy = 0; cy < CHUNKS_Y; cy++) {
  for (let cx = 0; cx < CHUNKS_X; cx++) {
    chunks.push({
      cx,
      cy,
      ground: Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => GROUND_TILE)),
      upper: Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null)),
      collisions: Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => false)),
      enemies: [],
      pickups: [],
      npcs: [],
    });
  }
}

const chunkAt = (wx, wy) => chunks.find((c) => c.cx === Math.floor(wx / COLS) && c.cy === Math.floor(wy / ROWS));
const setUpper = (wx, wy, frame, solid = false) => {
  const c = chunkAt(wx, wy);
  c.upper[wy % ROWS][wx % COLS] = frame;
  if (solid) c.collisions[wy % ROWS][wx % COLS] = true;
};
const addPickup = (type, wx, wy) => {
  chunkAt(wx, wy).pickups.push({ type, worldX: wx, worldY: wy });
};
const addNpc = (type, wx, wy) => {
  chunkAt(wx, wy).npcs.push({ type, worldX: wx, worldY: wy });
};

// ── Props ───────────────────────────────────────────────────────────────────

const props = [];
const addProp = (type, wx, wy, extra = {}) => {
  props.push({ type, worldX: wx, worldY: wy, ...extra });
};

// HUB — spawn em (13,6), fogueira-lar acesa logo acima (ela PRECISA ser a fogueira mais
// proxima do playerStart: e assim que o runtime escolhe o fogo inicial).
addProp('campfire', 13, 4, { lit: true });
addNpc('blackCat', 12, 4);
addPickup('heart', 14, 9);

// Sala do tesouro (x 15..18, y 0..2): paredes de pedregulho + porta trancada ao sul.
// A porta fica VISIVEL do spawn — o cadeado aparece antes da chave (lock before key).
const wallCells = [
  [15, 0], [16, 0], [17, 0], [18, 0],
  [15, 1], [18, 1],
  [15, 2], [17, 2], [18, 2],
];
for (const [wx, wy] of wallCells) setUpper(wx, wy, WALL_TILE, true);
addProp('lockedDoor', 16, 2);
addPickup('sword', 16, 1);
addPickup('bomb', 17, 1);

// Flores soltas dao vida ao hub sem atrapalhar a leitura dos puzzles.
setUpper(11, 3, 10);
setUpper(15, 5, 11);
setUpper(10, 9, 7);

// ── PUZZLE 1 — "O Lenhador" (oeste) ────────────────────────────────────────
// O rio atravessa o mapa inteiro (y 0..11) para nao existir contorno por cima/baixo.
for (let wy = 0; wy < CHUNKS_Y * ROWS; wy++) {
  addProp('water', 4, wy);
  addProp('water', 5, wy);
}

// Arvore A: colada na margem leste, alinhada com o rio. Quem chega do hub derruba para
// oeste quase por instinto — e o tronco vira a ponte (TIMBER ensina a mecanica).
addProp('dryTree', 6, 8);
addPickup('axe', 8, 8);

// Arvore B + ilha da chave: o teste. O anel d'agua deixa UMA unica direcao de tombo
// valida (de pe ao sul, cortando para o norte). Errar o lado derruba a arvore em terra
// e ela so renasce em 60s — feedback educativo, sem soft-lock.
const islandRing = [
  [0, 2], [1, 2], [2, 2],
  [0, 3], [2, 3],
  [0, 4], [1, 4], [2, 4],
];
for (const [wx, wy] of islandRing) addProp('water', wx, wy);
addPickup('key', 1, 3);
addProp('dryTree', 1, 5);

// ── PUZZLE 2 — "Fogo Emprestado" (leste) ───────────────────────────────────
// Fogueira morta no centro de um fosso de lava; a unica falha do anel e um mato seco.
// A lava e obstaculo E isqueiro: o graveto acende NELA, queima o mato, atravessa a
// brecha e entrega a chama — tudo dentro da janela da tocha.
addProp('campfire', 21, 6);
const moat = [
  [20, 5], [21, 5], [22, 5],
  [20, 6], [22, 6],
  [20, 7], [22, 7],
];
for (const [wx, wy] of moat) addProp('lava', wx, wy);
addProp('dryBush', 21, 7);
addPickup('wood', 18, 8);

// ── Dialogo do gato-guia ────────────────────────────────────────────────────
// As dicas moram aqui (justica: toda informacao necessaria esta DENTRO do jogo).

const dialogs = {
  blackCat: {
    npcName: 'GATO DO LAB',
    npcColorHex: '#cc99ff',
    npcAssetKey: 'npcs',
    npcFrame: 0,
    voice: { freq: 540, wave: 'triangle' },
    lines: [
      { speaker: 'npc', text: 'Miau. Bem-vindo ao Laboratorio de Puzzles.' },
      { speaker: 'npc', text: 'A oeste, o rio. O machado derruba arvores... e uma arvore cai sempre PARA LONGE de quem corta.' },
      { speaker: 'npc', text: 'A leste, uma fogueira morta cercada de lava. Fogo carregado morre rapido no escuro — melhor acender perto do destino.' },
      { speaker: 'npc', text: 'E a porta trancada ali atras? Dizem que a chave mora numa ilha. Miau.' },
    ],
  },
};

// ── Monta e escreve ─────────────────────────────────────────────────────────

const world = {
  meta: {
    name: 'laboratorio-de-puzzles',
    schemaVersion: 1,
    worldChunksX: CHUNKS_X,
    worldChunksY: CHUNKS_Y,
    chunkColumns: COLS,
    chunkRows: ROWS,
    tileSize: 8,
    tilesetKey: 'forest-tileset',
    playerStart: { worldX: 13, worldY: 6 },
    exportedAt: '2026-07-14T00:00:00.000Z',
  },
  chunks,
  props,
  dialogs,
};

await fs.writeFile(outPath, `${JSON.stringify(world, null, 2)}\n`, 'utf8');
console.log(`Laboratorio de Puzzles gerado em ${outPath}`);
console.log(`  ${CHUNKS_X}x${CHUNKS_Y} chunks, ${props.length} props, spawn em (${world.meta.playerStart.worldX}, ${world.meta.playerStart.worldY})`);
