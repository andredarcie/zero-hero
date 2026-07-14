#!/usr/bin/env node
// Gera public/lab.json — o mundo do Laboratorio de Puzzles (/lab).
//
// UM UNICO CHUNK (12x12) — o minimo do engine. A camera enquadra ~um chunk, entao o lab
// INTEIRO cabe numa tela: nenhuma perna passa de poucos passos. Andar nao e puzzle.
//
// Dois puzzles, ABERTOS AO MESMO TEMPO (nao ha ordem imposta):
//
// ── "O PAVIO" (norte) — o puzzle que so existe por causa da propagacao de fogo ──
// Diagnostico do problema: TODO obstaculo deste jogo e uma fechadura com exatamente UMA
// chave (machado->arvore, picareta->pedra, chave->porta), e o balao de dica ainda mostra o
// icone da chave que falta. O jogo entrega o gabarito. Por construcao, puzzle nenhum exige
// pensar — so seguir a fila.
//
// A fogueira morta em (11,2) NAO TEM CHAVE. Ela e inalcancavel:
//   - agua em (11,1) e (11,3), e a borda do mundo a leste;
//   - o unico vizinho pisavel, (10,2), e MATO ALTO — e mato alto BLOQUEIA o heroi.
// Nao existe item no lab que abra isso. Bumpar a fogueira e impossivel: voce nunca fica ao
// lado dela. Entao a pergunta deixa de ser "qual item?" e vira "como o FOGO chega la?".
//
// O corredor de mato (5,2)...(10,2) conduz fogo ate a fogueira — mas esta cortado pelo rio
// em (7,2), e fogo nao atravessa agua. A saida: derrubar a arvore de (7,3) PARA O NORTE.
// O tronco deita sobre (7,2) (mecanica TIMBER) e vira ponte — e ponte e MADEIRA, entao ela
// QUEIMA e passa a chama adiante (WaterObject.burn). Voce constroi uma ponte nao para VOCE
// atravessar, mas para o FOGO atravessar. Depois: um graveto aceso na fogueira de casa,
// encostado na ponta do mato em (5,2), e o pavio corre sozinho ate o fim.
//
// Errar tem conserto (nada de soft-lock): se o jogador acender o mato ANTES de deitar o
// tronco, o fogo morre na margem do rio — mas o mato queimado vira restolho PISAVEL, entao
// da para andar ate a ponte e tocar fogo no mato do outro lado. A falha ensina e nao pune.
//
// ── "A ILHA SEM FOGO" (sudeste) — a regra de UM ITEM levada ao limite ──
// Fogueira morta numa ilha cercada de lava. Atravessar lava exige as BOTAS na mao; acender
// uma fogueira exige um GRAVETO ACESO na mao; e so ha UMA mao. Dentro da ilha, de cima para
// baixo: a fogueira (10,7), um MACHADO (10,8) e uma ARVORE SECA (10,9).
//   1. Com as botas na mao, a fogueira recusa: nao ha mao livre (beco #1).
//   2. Pegar o machado significa LARGAR AS BOTAS de proposito, numa ilha cercada de lava.
//   3. Machado nao acende fogueira (beco #2 — o eureka mora aqui).
//   4. ...mas machado faz LENHA: derrubar a arvore larga um GRAVETO no toco.
//   5. Troca machado por graveto, encosta na lava que te prendeu (ela e fonte de fogo) e
//      entrega a chama. Depois volta ao tile das botas para trocar e sair.
// Nada e consumido e a arvore nao renasce enquanto o graveto estiver no toco: reversivel.
//
// Uso: node scripts/gen-lab.mjs   (ou: npm run generate:lab)

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COLS = 12;
const ROWS = 12;
const GROUND_TILE = 5; // "Terra" — o chao padrao do overworld

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'lab.json');

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

const setUpper = (wx, wy, frame) => { chunk.upper[wy][wx] = frame; };
const addPickup = (type, wx, wy) => chunk.pickups.push({ type, worldX: wx, worldY: wy });
const addNpc = (type, wx, wy) => chunk.npcs.push({ type, worldX: wx, worldY: wy });

const props = [];
const addProp = (type, wx, wy, extra = {}) => props.push({ type, worldX: wx, worldY: wy, ...extra });

// ── HUB ─────────────────────────────────────────────────────────────────────
// A fogueira-lar precisa ser a MAIS PROXIMA do playerStart: e assim que o runtime escolhe
// qual fogo ja nasce aceso (e e nela que se acende o graveto).
addProp('campfire', 5, 5, { lit: true });
// O gato fica a LESTE do fogo: NPCs bloqueiam, e em (4,5) ele tapava a coluna por onde se
// sobe ate o corredor do pavio.
addNpc('blackCat', 6, 5);
addPickup('axe', 6, 6);
addPickup('heart', 2, 5);

// A picareta e a pedra dela. Quebrar a rocha nao "abre" nada — ela LARGA UMA PEDRA no chao,
// e essa pedra e o oposto do graveto: as duas vencem o rio, mas so o deck de madeira e
// COMBUSTIVEL. Ver o corredor do pavio abaixo.
// Fora da coluna x=3: e por ela que se desce do corredor do pavio ate a arvore do graveto, e
// um item no caminho seria pego SEM QUERER — trocando o machado da mao no meio da tarefa.
addPickup('pickaxe', 1, 5);
addProp('rock', 1, 3);

// ── "O PAVIO" (norte) ───────────────────────────────────────────────────────
// O corredor de mato alto: um MURO para o heroi, uma ESTRADA para o fogo.
for (const wx of [5, 6, 8, 9, 10]) addProp('tallGrass', wx, 2);

// O rio corta o corredor em (7,2): o fogo para aqui. E este unico tile pode ser vencido de
// TRES jeitos, com consequencias diferentes — e por isso ele e um `bridgeSpot`, nao agua comum:
//
//   1. derrubar a arvore de (7,3) PARA O NORTE  -> tronco (TIMBER). E madeira: conduz a chama.
//   2. dois gravetos                            -> deck de tabuas. Tambem madeira: conduz.
//   3. UMA PEDRA (da picareta), por cima em (7,1) -> vau. Atravessa VOCE, mas o fogo MORRE ali.
//
// Ou seja: o jogador escolhe entre um PISO e um PAVIO. Escolher pedra nao trava o puzzle — o
// vau e pisavel, entao da para atravessar a pe e tocar fogo no mato do outro lado com a tocha
// na mao. Custa a elegancia, nao a partida.
addProp('bridgeSpot', 7, 2);
addProp('dryTree', 7, 3);

// A fogueira selada: agua nos dois lados, borda do mundo a leste, mato alto (bloqueante) a
// oeste. Nenhum item do lab alcanca isso — so o fogo alcanca.
addProp('campfire', 11, 2);
addProp('water', 11, 1);
addProp('water', 11, 3);

// A arvore do graveto (a "lenha do pavio"). Longe da agua de proposito: perto dela o corte
// viraria TIMBER e o tronco viraria ponte em vez de largar o graveto.
addProp('dryTree', 3, 8);

// ── "A ILHA SEM FOGO" (sudeste) ─────────────────────────────────────────────
addProp('campfire', 10, 7);
addPickup('axe', 10, 8); // a ferramenta ERRADA — e o coracao do puzzle
addProp('dryTree', 10, 9); // ...que vira a ferramenta certa
addPickup('lavaBoots', 6, 10);

for (const [wx, wy] of [
  [8, 7], [8, 8], [8, 9], // oeste
  [11, 7], [11, 8], [11, 9], // leste
  [9, 6], [10, 6], // norte
  [9, 10], [10, 10], // sul
]) addProp('lava', wx, wy);

// Flores soltas: vida no cenario sem sujar a leitura dos puzzles.
setUpper(2, 9, 10);
setUpper(1, 1, 11);
setUpper(3, 4, 7);

// ── Dialogo do gato-guia ────────────────────────────────────────────────────
// O gato enuncia REGRAS, nunca solucoes. Um NPC que entrega a resposta mata o eureka — mas
// uma regra que o jogador nao tem como LER na arte (o fogo caminha; a arvore cai para longe
// de quem corta; a mao e uma so) precisa estar dita em algum lugar. Justica: toda informacao
// necessaria esta DENTRO do jogo.
const dialogs = {
  blackCat: {
    npcName: 'GATO DO LAB',
    npcColorHex: '#cc99ff',
    npcAssetKey: 'npcs',
    npcFrame: 0,
    voice: { freq: 540, wave: 'triangle' },
    lines: [
      { speaker: 'npc', text: 'Miau. Bem-vindo ao Laboratorio de Puzzles.' },
      { speaker: 'npc', text: 'O fogo CAMINHA. Ele pula de mato em mato, de tabua em tabua — e nao pergunta se voce ainda precisava daquilo.' },
      { speaker: 'npc', text: 'Uma arvore cai para LONGE de quem a corta. Onde voce pisa decide onde ela deita.' },
      { speaker: 'npc', text: 'E voce so carrega UMA coisa por vez. Pegar algo novo larga o que estava na mao, ali mesmo no chao.' },
      { speaker: 'npc', text: 'Tem fogueira ai que nenhuma chave alcanca. Pense em quem mais pode chegar la. Miau.' },
    ],
  },
};

const world = {
  meta: {
    name: 'laboratorio-de-puzzles',
    schemaVersion: 1,
    worldChunksX: 1,
    worldChunksY: 1,
    chunkColumns: COLS,
    chunkRows: ROWS,
    tileSize: 8,
    tilesetKey: 'forest-tileset',
    playerStart: { worldX: 5, worldY: 6 },
    exportedAt: '2026-07-14T00:00:00.000Z',
  },
  chunks: [chunk],
  props,
  dialogs,
};

await fs.writeFile(outPath, `${JSON.stringify(world, null, 2)}\n`, 'utf8');
console.log(`Laboratorio de Puzzles gerado em ${outPath}`);
console.log(`  ${COLS}x${ROWS} tiles (1 chunk — cabe numa tela), ${props.length} props`);
