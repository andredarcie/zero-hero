#!/usr/bin/env node
// Gera public/lab.json — o mundo do Laboratorio de Puzzles (/lab).
//
// UM UNICO CHUNK (12x12) — o minimo que o engine aceita. E de proposito: a camera enquadra
// ~um chunk, entao o laboratorio INTEIRO cabe numa tela so. O jogador ve os dois puzzles, a
// porta trancada e o premio sem rolar o cenario, e nenhuma travessia passa de ~4 passos.
// Andar nao e puzzle: cada tile de caminhada a toa e tempo roubado da ideia.
//
// Os dois puzzles se ENCADEIAM — o premio do primeiro e a ferramenta do segundo — e cada um
// e construido sobre uma regra que o jogador ja carrega mas nunca foi obrigado a PENSAR:
//
//   PUZZLE 1 — "O Lenhador" (oeste). O rio nao tem bridgeSpot: a unica travessia e a mecanica
//   TIMBER (arvore derrubada NA DIRECAO da agua vira ponte). A arvore A, colada na margem,
//   ENSINA — mas ensina um modelo errado ("arvore perto de agua = ponte"). A arvore B CORRIGE
//   o modelo: a ilha da chave so tem uma face de agua, entao existe UMA unica direcao de tombo
//   valida e o jogador e forcado a perceber a regra real — a arvore cai para LONGE de quem
//   corta, logo e a SUA POSICAO que mira a ponte. Errar so custa 60s (a arvore renasce).
//   Premio: a chave -> a porta -> as BOTAS DE LAVA, que sao a ferramenta do puzzle 2.
//
//   PUZZLE 2 — "A Travessia Impossivel" (leste). Uma fogueira morta numa ilha inteiramente
//   cercada de lava. Para atravessar a lava e preciso estar segurando as BOTAS. Para acender
//   uma fogueira morta e preciso estar segurando um GRAVETO ACESO. E o heroi so carrega UMA
//   coisa por vez. O puzzle parece impossivel — e essa impossibilidade aparente E o puzzle.
//
//   A saida usa tres regras do jogo de uma vez:
//     1. ha um graveto largado DENTRO da ilha, visivel de fora (o "lock" antes da "key");
//     2. pegar um item DERRUBA o que estava na mao, no tile do item novo (ItemManager.drop) —
//        entao da para TROCAR de ferramenta ja do outro lado, e as botas ficam esperando ali;
//     3. a lava que te prendeu e uma FONTE DE FOGO: encostar o graveto nela acende a tocha.
//   Ou seja: atravessa com as botas, pisa no graveto (as botas caem ali), acende o graveto na
//   propria lava do anel, acende a fogueira, volta ao tile das botas para trocar e sai.
//   Nada e consumido: da para desfazer qualquer passo, entao nao existe soft-lock.
//
// Uso: node scripts/gen-lab.mjs   (ou: npm run generate:lab)

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHUNKS_X = 1;
const CHUNKS_Y = 1;
const COLS = 12;
const ROWS = 12;
const GROUND_TILE = 5; // "Terra" — o chao padrao do overworld
const WALL_TILE = 12; // "Pedregulho" — paredes da sala do tesouro (com colisao pintada)

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'lab.json');

// ── Terreno ─────────────────────────────────────────────────────────────────

const chunk = {
  cx: 0,
  cy: 0,
  ground: Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => GROUND_TILE)),
  upper: Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null)),
  collisions: Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => false)),
  enemies: [],
  pickups: [],
  npcs: [],
};

const setUpper = (wx, wy, frame, solid = false) => {
  chunk.upper[wy][wx] = frame;
  if (solid) chunk.collisions[wy][wx] = true;
};
const addPickup = (type, wx, wy) => chunk.pickups.push({ type, worldX: wx, worldY: wy });
const addNpc = (type, wx, wy) => chunk.npcs.push({ type, worldX: wx, worldY: wy });

const props = [];
const addProp = (type, wx, wy, extra = {}) => props.push({ type, worldX: wx, worldY: wy, ...extra });

// ── HUB (centro) ────────────────────────────────────────────────────────────
// Spawn (6,6). A fogueira-lar precisa ser a MAIS PROXIMA do playerStart: e assim que o
// runtime escolhe qual fogo ja nasce aceso.
addProp('campfire', 6, 5, { lit: true });
addNpc('blackCat', 5, 5);
addPickup('heart', 8, 5);

// ── PUZZLE 1 — "O Lenhador" (oeste) ────────────────────────────────────────
// O rio corta o mapa de ponta a ponta (x 2 e 3, y 0..11): nao existe contorno.
for (let wy = 0; wy < ROWS; wy++) {
  addProp('water', 2, wy);
  addProp('water', 3, wy);
}

// Arvore A (ensina): 1 passo do spawn. Quem pega o machado em (5,7) ja esta de frente para
// ela, corta para oeste por instinto — e o tronco deita sobre o rio.
addPickup('axe', 5, 7);
addProp('dryTree', 4, 7);

// Arvore B (testa): a ilha da chave (0,3) so toca agua ao norte (0,2), a leste (1,3) e ao sul
// (0,4) — a oeste e a borda solida do mundo. A unica arvore e a (0,5), entao existe UMA unica
// direcao de tombo que constroi a ponte: de pe em (0,6), cortando para o NORTE. Cortar de
// (1,5) derruba a arvore em terra firme e nao leva a lugar nenhum.
addProp('water', 0, 2);
addProp('water', 1, 3);
addProp('water', 0, 4);
addPickup('key', 0, 3);
addProp('dryTree', 0, 5);

// ── A porta (o elo entre os dois puzzles) ──────────────────────────────────
// Logo abaixo do spawn: o jogador ve a porta e o que ha atras dela desde o primeiro frame,
// muito antes de ter a chave — e o caminho de volta da ilha ate ela e curto.
for (const [wx, wy] of [[5, 9], [7, 9], [5, 10], [7, 10], [5, 11], [6, 11], [7, 11]]) {
  setUpper(wx, wy, WALL_TILE, true);
}
addProp('lockedDoor', 6, 9);
addPickup('lavaBoots', 6, 10); // o premio do puzzle 1 E a ferramenta do puzzle 2

// ── PUZZLE 2 — "A Travessia Impossivel" (leste) ────────────────────────────
// Ilha (9..10, 7..8) cercada por um anel de lava COMPLETO — sem brecha nenhuma.
// Dentro: a fogueira morta e um graveto largado. Fora: nada que ajude.
addProp('campfire', 10, 7);
// O graveto fica no canto OPOSTO a entrada (o heroi entra por (9,7)/(9,8)), e isso e a coisa
// mais importante do puzzle: se ele estivesse no tile de entrada, o jogador pisaria nele sem
// querer e a troca aconteceria SOZINHA — o passo esperto seria executado pelo sistema, nao
// pelo jogador. Longe da entrada, a ordem natural vira: entra com as botas -> esbarra na
// fogueira -> leva o balao de "precisa de fogo" -> percebe que NAO TEM MAO LIVRE -> olha o
// graveto do outro lado e entende que pegar significa LARGAR AS BOTAS, de proposito, numa
// ilha cercada de lava. Essa hesitacao e o puzzle.
addPickup('wood', 10, 8);

for (const [wx, wy] of [[9, 6], [10, 6], [8, 7], [11, 7], [8, 8], [11, 8], [9, 9], [10, 9]]) {
  addProp('lava', wx, wy);
}

// Flores soltas: vida no cenario sem sujar a leitura dos puzzles.
setUpper(7, 4, 10);
setUpper(4, 10, 11);
setUpper(9, 3, 7);

// ── Dialogo do gato-guia ────────────────────────────────────────────────────
// O gato enuncia as REGRAS, nunca as solucoes. Um puzzle cuja resposta o NPC entrega de
// bandeja deixa de ter eureka — mas uma regra que o jogador nao tem como ler na arte
// (a direcao do tombo, o limite de um item na mao) precisa estar dita em algum lugar.

const dialogs = {
  blackCat: {
    npcName: 'GATO DO LAB',
    npcColorHex: '#cc99ff',
    npcAssetKey: 'npcs',
    npcFrame: 0,
    voice: { freq: 540, wave: 'triangle' },
    lines: [
      { speaker: 'npc', text: 'Miau. Bem-vindo ao Laboratorio de Puzzles.' },
      { speaker: 'npc', text: 'Regra numero um: uma arvore cai para LONGE de quem a corta. Onde voce pisa decide onde ela deita.' },
      { speaker: 'npc', text: 'Regra numero dois: voce so carrega UMA coisa por vez. Pegar algo novo larga o que estava na mao — ali mesmo, no chao.' },
      { speaker: 'npc', text: 'O resto voce descobre sozinho. E dai que vem a graca. Miau.' },
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
    playerStart: { worldX: 6, worldY: 6 },
    exportedAt: '2026-07-14T00:00:00.000Z',
  },
  chunks: [chunk],
  props,
  dialogs,
};

await fs.writeFile(outPath, `${JSON.stringify(world, null, 2)}\n`, 'utf8');
console.log(`Laboratorio de Puzzles gerado em ${outPath}`);
console.log(`  ${COLS}x${ROWS} tiles (1 chunk — cabe numa tela), ${props.length} props, spawn (${world.meta.playerStart.worldX}, ${world.meta.playerStart.worldY})`);
