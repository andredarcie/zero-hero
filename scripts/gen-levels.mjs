#!/usr/bin/env node
// Gera public/levels/*.json — o LEVEL jogavel.
//
// REGRA: um level e SEMPRE UM chunk 12x12 — o tamanho padrao/original. A camera enquadra ~um
// chunk, entao o level inteiro cabe numa tela e nada exige caminhada (andar nao e puzzle).
// makeLevel NAO aceita multi-chunk de proposito: o tamanho e fixo para essa regra nao se perder.
//
// Este script semeia o Level 1 base: "A ESPADA NA PEDRA". Levels adicionais sao criados no
// gerenciador do /lab; ao regenerar a base, o manifesto abaixo preserva e relista esses arquivos.
// O desenho e uma CORRENTE DE PRODUCAO — cada ferramenta fabrica o insumo do passo seguinte,
// nunca so "abre a propria porta" (a regra do CLAUDE.md: itens PRODUZEM, nao deletam):
//
//   foice → SEMENTES (o mato replantavel)     machado → TIMBER! (a arvore vira ponte de tronco)
//   semente + buraco + balde d'agua → o mato BROTA onde o pavio precisa dele
//   graveto + fogueira → tocha                tocha → queima o arbusto que esconde a 1a pedra
//   pedra → apaga lava (basalto)              basalto → botas de lava
//   botas → entram no Quarteirao em Chamas    bomba (la dentro) → explode a cela da picareta
//   pedras da cela → MINERAM A SAIDA          picareta → quebra a rocha da porta → mais pedra
//   pedra → vau no rio (pedra atravessa carga; botas so atravessam VOCE)
//   fogo → corre palha + ponte + capim, COME a propria ponte e abre o corredor da CHAVE
//   chave → comporta → drena o fosso          balde → apaga a guardia → a flor abre no escuro
//   flor aberta → A ESPADA.
//
// Travas que sustentam o puzzle (todas assertadas no playtest "espada"):
// - O Quarteirao em Chamas (SW) so tem entrada POR CIMA da lava (botas). Uma mao: nada entra nem
//   sai carregado por cima de lava — a saida com carga e MINERADA (pedra da cela → basalto).
//   A bomba nao pode ser desperdicada fora: ela nasce dentro e so sai depois de aberta a saida,
//   que so abre gastando a bomba na cela. A geometria guarda a bomba.
// - TUDO se opera ANDANDO (o jogo nao tem botao de usar item): o bombSpot em (1,9) e a marca
//   visivel onde a bomba se arma quando o heroi pisa segurando-a — e (1,9) alcanca as TRES rochas
//   da cela (distancias 1, 1 e 2 <= raio 2.2), entao a unica detonacao possivel abre tudo. Sem
//   soft-lock por construcao. O pavio idem: plantSpots (buracos de plantio) em (8,4) e (8,3) —
//   os dois elos entre o capim-estopim e a ponte de tronco. Pisar no buraco com SEMENTES semeia
//   (o monte se ergue quando o heroi sai do tile), o balde cheio rega no bump, e o MATO DE
//   VERDADE brota ali — que conduz o fogo, e cortado rende sementes de novo. Ciclo renovavel:
//   pavio queimado nunca e beco sem saida (o buraco reabre quando o mato e consumido).
// - O tile de apagar a guardia (10,10) so e alcancavel pela PORTA-comporta: quem vadeia o fosso
//   de botas esta de maos vazias — o balde nunca chega la por agua. A chave e obrigatoria.
// - A cela da espada usa DUAS moonflowers como parede (botas nao atravessam um botao fechado);
//   lagoa/rocha nao servem de parede ali porque botas vadeiam agua e picareta quebra rocha.
// - O pavio cruza o rio na ponte de TRONCO e a devora na passagem — a ponte do fogo nunca e a
//   ponte do heroi; a volta com a chave exige o VAU de pedra (fogo nao cruza vau).
// - Sem soft-lock de pedra: toda lava "errada" que se apaga no Quarteirao vira mais uma saida, e
//   o vau tem alternativa de gravetos (arvores rebrotam). Fogueira-lar apagada por engano? A lava
//   e a chama-piloto eterna: acende a tocha de novo.
//
// Uso: node scripts/gen-levels.mjs   (ou: npm run generate:levels)

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COLS = 12;
const ROWS = 12;
const GROUND_TILE = 5; // "Terra"

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'levels');

// Um mundo de UM chunk 12x12 (o tamanho padrao — ver a REGRA no topo). Sem parametro de tamanho:
// o level nunca cresce alem de uma tela.
const makeLevel = ({ name, playerStart, build }) => {
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

  const props = [];
  const helpers = {
    setUpper: (wx, wy, frame) => { chunk.upper[wy][wx] = frame; },
    addPickup: (type, wx, wy) => chunk.pickups.push({ type, worldX: wx, worldY: wy }),
    addNpc: (type, wx, wy) => chunk.npcs.push({ type, worldX: wx, worldY: wy }),
    addProp: (type, wx, wy, extra = {}) => props.push({ type, worldX: wx, worldY: wy, ...extra }),
  };

  const dialogs = build(helpers) ?? {};

  return {
    meta: {
      name,
      schemaVersion: 1,
      worldChunksX: 1,
      worldChunksY: 1,
      chunkColumns: COLS,
      chunkRows: ROWS,
      tileSize: 8,
      tilesetKey: 'forest-tileset',
      playerStart,
      puzzle: true, // sem cerco de undead (ver CLAUDE.md)
      exportedAt: '2026-07-16T00:00:00.000Z',
    },
    chunks: [chunk],
    props,
    dialogs,
  };
};

const cat = (npcName, lines) => ({
  blackCat: {
    npcName,
    npcColorHex: '#cc99ff',
    npcAssetKey: 'npcs',
    npcFrame: 0,
    voice: { freq: 540, wave: 'triangle' },
    lines: lines.map((text) => ({ speaker: 'npc', text })),
  },
});

// ── A ESPADA NA PEDRA — o mapa, regiao por regiao ────────────────────────────
//   NORTE (y0-2)   O RIO + O CORREDOR DA CHAVE. Rio na linha y=2 (vau em 3,2; travessia do fogo
//                  em 8,1/8,2), rio DOBRADO (y=1) sela o corredor de capim em y=0 onde a chave
//                  dorme sob o mato e a fogueira selada (11,0) espera a chama.
//   OESTE (x0-2)   A SALA DAS FERRAMENTAS: machado e balde atras da cerca-viva de capim (foice).
//   CENTRO         Spawn, fogueira-lar, graveto de acender, o gato. A arvore-TIMBER em (8,3) e o
//                  capim-estopim (8,5) alinham o pavio da coluna x=8.
//   SUDOESTE       O QUARTEIRAO EM CHAMAS: murado de lava, so de botas. Dentro: a bomba, e a cela
//                  de rochas com a picareta. A saida com carga e minerada (pedra → basalto).
//   SUL            O arbusto seco esconde a pedra-lote (4,10); o plug de lava (5,10) sela as botas.
//   SUDESTE        O SANTUARIO: fosso de agua parada + porta-COMPORTA (9,10); dentro, a fogueira
//                  guardia (10,9) mantem fechadas as DUAS flores-da-lua que muram a espada (11,11).
const level = makeLevel({
  name: 'A Espada na Pedra',
  playerStart: { worldX: 6, worldY: 7 },
  build: ({ setUpper, addPickup, addNpc, addProp }) => {
    // ═══ NORTE: o rio e o corredor da chave ═══════════════════════════════════
    for (const wx of [6, 7, 8, 10]) addProp('tallGrass', wx, 0); // o corredor (muro p/ heroi, estrada p/ fogo)
    addProp('tallGrass', 9, 0);
    addPickup('key', 9, 0); // a CHAVE dorme sob o mato — so o fogo (ou a foice, na unha) a expoe
    addProp('campfire', 11, 0); // a fogueira SELADA — o ponto final do pavio
    for (const wx of [6, 7, 9, 10, 11]) addProp('water', wx, 1); // rio dobrado: sela o corredor
    addProp('bridgeSpot', 8, 1); // vao norte da travessia do fogo
    for (const wx of [0, 1, 2, 4, 5, 6, 7, 9, 10, 11]) addProp('water', wx, 2); // o rio
    addProp('bridgeSpot', 3, 2); // o VAU do heroi (pedra — fogo nao cruza)
    addProp('bridgeSpot', 8, 2); // vao sul da travessia do fogo (tronco — o fogo a come)
    addProp('dryTree', 8, 3); // a arvore-TIMBER: derrube ao NORTE e o tronco vira ponte dupla
    // Os buracos de plantio do pavio (o jogo e walk-only: pisar com sementes semeia; regar e um
    // bump de balde cheio; o mato REAL brota e conduz o fogo). (8,3) divide o tile com a arvore
    // de proposito: o buraco espera DEBAIXO dela ate o TIMBER abrir o toco — so entao da para
    // pisar ali. O EditorStore aceita 2 props numa celula.
    addProp('plantSpot', 8, 4);
    addProp('plantSpot', 8, 3);

    // ═══ OESTE: a sala das ferramentas ════════════════════════════════════════
    addProp('dryTree', 0, 4); // parede norte da sala (e reserva de graveto)
    addProp('dryTree', 1, 4);
    addPickup('axe', 0, 5);
    addPickup('bucket', 1, 6);
    for (const wy of [5, 6, 7]) addProp('tallGrass', 2, wy); // a cerca-viva (porta da foice; rende palha)

    // ═══ CENTRO: lar, spawn, o estopim ════════════════════════════════════════
    addPickup('wood', 4, 7); // o graveto de acender (a lenha ao lado do lar)
    addProp('campfire', 5, 7, { lit: true }); // fogueira-LAR
    addNpc('blackCat', 7, 7);
    addPickup('scythe', 6, 8); // a primeira ferramenta, a um passo do spawn
    addProp('tallGrass', 8, 5); // o ESTOPIM do pavio: capim isolado, aceso com a tocha

    // ═══ SUDOESTE: o Quarteirao em Chamas ═════════════════════════════════════
    for (const wx of [0, 1, 2]) addProp('lava', wx, 8); // muro norte (e parede sul da sala oeste)
    for (const wy of [9, 10, 11]) addProp('lava', 3, wy); // muro leste
    addProp('rock', 0, 9); // a cela da picareta: 3 rochas, todas no raio da marca de bomba
    addProp('rock', 1, 10);
    addProp('rock', 1, 11);
    addProp('bombSpot', 1, 9); // a MARCA: pise aqui com a bomba e ela se arma (alcanca as 3 rochas)
    addPickup('bomb', 2, 10); // a bomba nasce DENTRO — a geometria a guarda p/ a cela
    addPickup('pickaxe', 0, 11); // o premio da cela

    // ═══ SUL: o arbusto, a pedra-lote, as botas ═══════════════════════════════
    addProp('dryBush', 4, 9); // porta de fogo do nicho da pedra
    addPickup('stone', 4, 10); // a PRIMEIRA pedra e dada; as outras, você fabrica
    addProp('lava', 5, 10); // o plug: uma pedra o faz basalto — a licao antes do Quarteirao
    addProp('water', 4, 11); // lagoas-parede do nicho das botas (e fonte de balde)
    addProp('water', 6, 11);
    addPickup('lavaBoots', 5, 11);

    // ═══ SUDESTE: o santuario da espada ═══════════════════════════════════════
    for (const wx of [9, 10, 11]) addProp('water', wx, 8); // o fosso (agua PARADA: a comporta drena)
    addProp('water', 9, 9);
    addProp('water', 9, 11);
    addProp('rock', 8, 10); // a rocha da soleira: SO a picareta abre o tile de alcancar a porta
    addProp('lockedDoor', 9, 10, { floodgate: true }); // a COMPORTA: a chave drena o fosso
    addProp('campfire', 10, 9, { lit: true }); // a GUARDIA: mantem as flores fechadas
    addPickup('heart', 11, 9); // premio do leito drenado
    addProp('moonflower', 10, 11); // as DUAS flores muram a espada (botas nao passam botao fechado)
    addProp('moonflower', 11, 10);
    addPickup('sword', 11, 11); // A ESPADA NA PEDRA

    // ═══ Decor (cantos mortos, fora de toda rota) ═════════════════════════════
    setUpper(0, 0, 11);
    setUpper(2, 1, 7);
    setUpper(10, 4, 10);
    setUpper(9, 5, 7);
    setUpper(11, 6, 11);

    return cat('GATO DA ESPADA', [
      'Miau. A espada dorme atras das flores que so abrem no ESCURO — e do fosso que so a chave drena.',
      'Cada ferramenta FAZ alguma coisa, e o que ela faz e a chave da porta seguinte. A foice colhe SEMENTES: plante nos buracos, regue com o balde e o mato brota onde voce precisar dele. O machado derruba a arvore SOBRE o rio; a picareta faz pedra.',
      'Pedra apaga lava e vira vau. Mas repare: o fogo cruza a ponte de madeira e a COME — e nunca pisa num vau de pedra.',
      'As botas atravessam VOCE, nada mais: por cima da lava e da agua vai so quem esta de maos vazias. Quer levar carga? Fabrique o chao.',
      'La no quarteirao de lava, pise na MARCA segurando a bomba — ela se arma sozinha. Depois, a saida se MINERA: a pedra da cela esfria o muro. E nao corte o pavio que ainda vai acender. Miau.',
    ]);
  },
});

await fs.mkdir(outDir, { recursive: true });
let previousIndex = [];
try {
  previousIndex = JSON.parse(await fs.readFile(path.join(outDir, 'index.json'), 'utf8'));
} catch { /* primeira geracao */ }
await fs.writeFile(path.join(outDir, 'level-1.json'), `${JSON.stringify(level, null, 2)}\n`, 'utf8');

const previousByFile = new Map(previousIndex.map((entry) => [entry.file, entry]));
const files = (await fs.readdir(outDir))
  .filter((file) => /^level-\d+\.json$/u.test(file))
  .sort((a, b) => Number(/\d+/u.exec(a)[0]) - Number(/\d+/u.exec(b)[0]));
const index = await Promise.all(files.map(async (file) => {
  const number = Number(/\d+/u.exec(file)[0]);
  const stored = JSON.parse(await fs.readFile(path.join(outDir, file), 'utf8'));
  return {
    id: `level-${number}`,
    file,
    name: stored.meta?.name || `Level ${number}`,
    blurb: number === 1
      ? 'Onze itens, uma mao so: forje o caminho ate a espada com as sobras de cada ferramenta.'
      : previousByFile.get(file)?.blurb ?? '',
  };
}));
await fs.writeFile(path.join(outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8');

console.log(`Level gerado em ${outDir}`);
for (const entry of index) console.log(`  ${entry.file} — "${entry.name}" (${entry.blurb})`);
