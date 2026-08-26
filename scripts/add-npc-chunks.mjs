// AS CARTAS DE NPC — oito cenários-tutorial acrescentados à biblioteca de chunks.
//
// Modelo enrich-*: este script LÊ public/world.json e ACRESCENTA — nunca refaz. Idempotente
// (um template só entra se o id ainda não existir), determinístico (zero Math.random, zero
// timestamp), e faz backup antes da primeira escrita.
//
// O contrato de cada cenário de NPC (pedido do usuário):
//   · uma fogueira ACESA ao lado do NPC (luz de fogueira é parede para todo monstro);
//   · o PRESENTE no chão ao lado dele — um item que faz sentido para aquele NPC;
//   · o terreno com a cara do NPC;
//   · matéria-prima para TESTAR o item ali mesmo (o mini tutorial);
//   · a fala (world.json dialogs + en.json) explicando o item e para que serve.
//
// As costuras do runtime (openSeams) limpam as faixas de estrada: N x5-7/y0-3 · S x5-7/y8-11 ·
// W x0-3/y5-9 · E x8-11/y5-9 (com a variante y7-9 do leste). Nada essencial mora nelas.

import fs from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

const COLS = 12;
const ROWS = 12;
const GRASS = 5;
const WATER = 33;
const TREE = 4;

const grid = (value) => Array.from({ length: ROWS }, () => Array(COLS).fill(value));

/** Uma definição local (0..11); o script re-baseia tudo para o slot mundial do template. */
const makeChunk = ({ catalog, npc, gift, extraPickups = [], props = [], paint }) => {
  const ground = grid(GRASS);
  const upper = grid(null);
  paint?.(ground, upper);
  return {
    catalog,
    ground,
    upper,
    collisions: grid(false),
    enemies: [],
    npcs: [{ type: npc, x: 5, y: 5 }],
    pickups: [{ type: gift, x: 4, y: 5 }, ...extraPickups],
    props: [{ type: 'campfire', x: 6, y: 5, lit: true }, ...props],
  };
};

const NPC_CHUNKS = [
  makeChunk({
    catalog: {
      id: 'cat-cold-hearths', name: "Cat's Hearths", cost: 1, cardImage: 'generated:hearth', enabled: true,
      description: 'The cat, its fire, and two hearths gone cold. Wake a branch and carry flame.',
    },
    npc: 'blackCat',
    gift: 'wood',
    props: [
      { type: 'campfire', x: 2, y: 2, lit: false },
      { type: 'campfire', x: 9, y: 10, lit: false },
      { type: 'dryBush', x: 3, y: 2 },
      { type: 'dryBush', x: 8, y: 10 },
    ],
    paint: (ground, upper) => {
      for (const [x, y] of [[0, 0], [11, 0], [0, 11], [11, 11]]) upper[y][x] = TREE;
      for (const [x, y] of [[1, 1], [10, 2], [2, 10], [9, 1], [10, 10]]) upper[y][x] = 11;
    },
  }),
  makeChunk({
    catalog: {
      id: 'crater-quarry', name: "Astronaut's Crater", cost: 7, cardImage: 'generated:hearth',
      description: 'A stranded astronaut and a field of samples. The pickaxe cracks them open.',
    },
    npc: 'astronaut',
    gift: 'pickaxe',
    props: [
      { type: 'rock', x: 2, y: 2 },
      { type: 'rock', x: 3, y: 1 },
      { type: 'rock', x: 9, y: 1 },
      { type: 'ironRock', x: 8, y: 2 },
      { type: 'ironRock', x: 10, y: 3 },
    ],
    paint: (ground) => {
      for (let y = 1; y <= 3; y += 1) {
        for (let x = 1; x <= 10; x += 1) ground[y][x] = (x + y) % 2 === 0 ? 23 : 24;
      }
      for (const [x, y] of [[2, 10], [3, 10], [8, 10], [9, 10]]) ground[y][x] = 24;
    },
  }),
  makeChunk({
    catalog: {
      id: 'timber-ranks', name: "Businessman's Timber", cost: 6, cardImage: 'generated:hearth',
      description: 'Dry timber in tidy rows, and a businessman who calls it inventory. Axe included.',
    },
    npc: 'businessMan',
    gift: 'axe',
    props: [
      { type: 'dryTree', x: 2, y: 1 },
      { type: 'dryTree', x: 4, y: 1 },
      { type: 'dryTree', x: 8, y: 1 },
      { type: 'dryTree', x: 10, y: 1 },
      { type: 'dryTree', x: 2, y: 3 },
      { type: 'dryTree', x: 4, y: 3 },
      { type: 'dryTree', x: 8, y: 3 },
      { type: 'dryTree', x: 10, y: 3 },
    ],
    paint: (ground, upper) => {
      for (const [x, y] of [[1, 10], [10, 10]]) upper[y][x] = 8;
    },
  }),
  makeChunk({
    catalog: {
      id: 'glowing-ford', name: "Workman's Ford", cost: 8, cardImage: 'generated:hearth',
      description: 'A workman, a stone, and a glowing pool that cools into a permanent road.',
    },
    npc: 'radiationSuit',
    gift: 'stone',
    extraPickups: [{ type: 'iron', x: 9, y: 2 }],
    props: [
      { type: 'lava', x: 8, y: 1 }, { type: 'lava', x: 9, y: 1 }, { type: 'lava', x: 10, y: 1 },
      { type: 'lava', x: 8, y: 2 },                                 { type: 'lava', x: 10, y: 2 },
      { type: 'lava', x: 8, y: 3 }, { type: 'lava', x: 9, y: 3 }, { type: 'lava', x: 10, y: 3 },
    ],
    paint: (_ground, upper) => {
      for (const [x, y] of [[7, 4], [1, 2]]) upper[y][x] = 10;
    },
  }),
  makeChunk({
    catalog: {
      id: 'painted-beds', name: "Artist's Beds", cost: 6, cardImage: 'generated:hearth',
      description: 'The artist dug her beds already. Seeds are pigment; the meadow is the canvas.',
    },
    npc: 'painter',
    gift: 'seeds',
    props: [
      { type: 'plantSpot', x: 2, y: 10 },
      { type: 'plantSpot', x: 3, y: 10 },
      { type: 'plantSpot', x: 4, y: 10 },
      { type: 'plantSpot', x: 8, y: 10 },
      { type: 'plantSpot', x: 9, y: 10 },
    ],
    paint: (ground, upper) => {
      for (const [x, y] of [[1, 4], [10, 4], [1, 10], [10, 10]]) upper[y][x] = 6;
      for (const [x, y] of [[1, 1], [10, 1]]) upper[y][x] = 7;
    },
  }),
  makeChunk({
    catalog: {
      id: 'roadside-pond', name: "Salesman's Pond", cost: 5, cardImage: 'generated:hearth',
      description: 'A salesman with one free sample: a bucket, and the pond to fill it in.',
    },
    npc: 'salesman',
    gift: 'bucket',
    paint: (ground, upper) => {
      for (let y = 1; y <= 3; y += 1) for (let x = 1; x <= 3; x += 1) ground[y][x] = WATER;
      for (const [x, y] of [[10, 2], [10, 10], [1, 10]]) upper[y][x] = 8;
    },
  }),
  makeChunk({
    catalog: {
      id: 'singing-pines', name: "Poet's Pines", cost: 5, cardImage: 'generated:hearth',
      description: 'Living pines crowd the poet\'s verse. The great axe fells even living wood.',
    },
    npc: 'poet',
    gift: 'greatAxe',
    paint: (ground, upper) => {
      for (let y = 1; y <= 3; y += 1) {
        for (let x = 1; x <= 3; x += 1) upper[y][x] = TREE;
        for (let x = 8; x <= 10; x += 1) upper[y][x] = TREE;
      }
      for (let x = 1; x <= 3; x += 1) upper[10][x] = TREE;
      for (let x = 8; x <= 10; x += 1) upper[10][x] = TREE;
      upper[4][3] = TREE;
      upper[4][8] = TREE;
    },
  }),
  makeChunk({
    catalog: {
      id: 'silent-meadow', name: "Death's Meadow", cost: 9, cardImage: 'generated:hearth',
      description: 'Death, off duty, lends the scythe. The tall grass grew too loud; reap it.',
    },
    npc: 'death',
    gift: 'scythe',
    props: [
      { type: 'tallGrass', x: 2, y: 2 },
      { type: 'tallGrass', x: 3, y: 2 },
      { type: 'tallGrass', x: 2, y: 3 },
      { type: 'tallGrass', x: 4, y: 2 },
      { type: 'tallGrass', x: 8, y: 2 },
      { type: 'tallGrass', x: 9, y: 2 },
      { type: 'tallGrass', x: 9, y: 3 },
      { type: 'tallGrass', x: 2, y: 10 },
      { type: 'tallGrass', x: 3, y: 10 },
      { type: 'tallGrass', x: 8, y: 10 },
      { type: 'tallGrass', x: 9, y: 10 },
    ],
    paint: (ground, upper) => {
      for (const [x, y] of [[1, 1], [10, 1], [1, 11], [10, 11]]) upper[y][x] = 11;
    },
  }),
];

/** A fala: config visual/voz (world.json) + as linhas do presente (espelham o en.json). */
const line = (text) => ({ speaker: 'npc', text });
const NPC_DIALOG_CONFIG = {
  blackCat: {
    npcName: 'CAT', npcColorHex: '#cc99ff', npcAssetKey: 'npcs', npcFrame: 0,
    voice: { freq: 540, wave: 'triangle' },
    lines: [
      line('A hero. How novel. I was napping.'),
      line('That branch beside me? Take it. Hold it into my fire and it wakes as a TORCH.'),
      line('Two hearths in this clearing sit cold. Carry the flame to them.'),
      line('Burnt brush leaves CHARCOAL. Put it in the marked box: the balloon calls the plane, and the plane drops your coins.'),
    ],
  },
  astronaut: {
    npcName: 'ASTRONAUT', npcColorHex: '#44ccff', npcAssetKey: 'npcs', npcFrame: 2,
    voice: { freq: 470, wave: 'square' },
    lines: [
      line('Take the PICKAXE — the veined boulders never run dry, three swings a lump. Bring me six of that ORE and my ship stops being scrap.'),
    ],
    // O BALCÃO: o astronauta COMPRA ferro por quantidade dentro do diálogo (DialogOverlay).
    // O preço mora aqui — mudar a economia da mineração é editar este número e rodar o script.
    trade: {
      item: 'iron',
      coinsPerUnit: 3,
      offer: 'Iron! The lab pays 3 coins a lump. How many are you selling?',
      empty: 'Your pack has no iron. The veined boulders — three good swings each, they never run dry.',
      thanks: 'Prime samples. Pleasure doing science with you.',
    },
  },
  businessMan: {
    npcName: 'BUSINESSMAN', npcColorHex: '#ffdd44', npcAssetKey: 'npcs', npcFrame: 3,
    voice: { freq: 250, wave: 'sawtooth' },
    lines: [
      line('The AXE is yours, an advance — it fells DEAD wood in two chops. Clear my dry ranks and bring me six STICKS: timber is the only market left.'),
    ],
  },
  radiationSuit: {
    npcName: 'WORKMAN', npcColorHex: '#66ff44', npcAssetKey: 'npcs', npcFrame: 4,
    voice: { freq: 340, wave: 'square' },
    lines: [
      line('Take this STONE — thrown into lava it cools into a step. Something metal sank past the molten pool: walk one bar of IRON back to me.'),
    ],
  },
  painter: {
    npcName: 'ARTIST', npcColorHex: '#ff88aa', npcAssetKey: 'npcs', npcFrame: 5,
    voice: { freq: 620, wave: 'sine' },
    lines: [
      line('Take the SHOVEL and dig the beds south of me. Green is a colour you GROW, so bring me six SEEDS and paint this field.'),
    ],
  },
  salesman: {
    npcName: 'SALESMAN', npcColorHex: '#6fe6c7', npcAssetKey: 'npc-salesman',
    voice: { freq: 410, wave: 'triangle' },
    lines: [
      line('Friend! You look thirsty. Or dry. Either way — opportunity.'),
      line('Free sample: this BUCKET. Fill it in my pond, just west of the fire.'),
      line('A full bucket waters crops and drowns small fires. Endless uses. Zero coins. Today only.'),
      line('Tell your friends. If you find any out there.'),
    ],
  },
  poet: {
    npcName: 'POET', npcColorHex: '#9bb7ff', npcAssetKey: 'npc-poet',
    voice: { freq: 360, wave: 'sine' },
    lines: [
      line('The pines sing, but they crowd the verse.'),
      line('This GREAT AXE fells even LIVING trees — the small axe only knows dead wood.'),
      line('Open a clearing in my grove. Listen how the song changes where light falls.'),
      line('Every good line needs its silence. Cut me one.'),
    ],
  },
  death: {
    npcName: 'DEATH', npcColorHex: '#f3f4f6', npcAssetKey: 'npc-death',
    voice: { freq: 150, wave: 'square' },
    lines: [
      line('Take the SCYTHE — I am off duty. Light five cold hearths and burn me three loads of CHARCOAL, and you and I are even.'),
    ],
  },
};

const target = fileURLToPath(new URL('../public/world.json', import.meta.url));
const backup = fileURLToPath(new URL('../backup/world-pre-npc-cards.json', import.meta.url));
const world = JSON.parse(await fs.readFile(target, 'utf8'));

const existing = new Set(world.chunks.map((chunk) => chunk.catalog?.id).filter(Boolean));
let nextCx = world.chunks.reduce((max, chunk) => Math.max(max, chunk.cx), -1) + 1;
let added = 0;

try {
  await fs.access(backup);
} catch {
  await fs.copyFile(target, backup);
  console.log(`Backup: ${backup}`);
}

let renamed = 0;
for (const def of NPC_CHUNKS) {
  if (existing.has(def.catalog.id)) {
    // O template já mora no mundo: o TERRENO autorado fica, mas o CATÁLOGO (nome, custo,
    // descrição) segue este arquivo — é assim que um rename chega às cartas já nascidas.
    const chunk = world.chunks.find((c) => c.catalog?.id === def.catalog.id);
    if (chunk && JSON.stringify(chunk.catalog) !== JSON.stringify(def.catalog)) {
      chunk.catalog = def.catalog;
      renamed += 1;
    }
    continue;
  }
  const cx = nextCx;
  nextCx += 1;
  const ox = cx * COLS;
  world.chunks.push({
    cx,
    cy: 0,
    ground: def.ground,
    upper: def.upper,
    collisions: def.collisions,
    enemies: [],
    pickups: def.pickups.map((p) => ({ type: p.type, worldX: ox + p.x, worldY: p.y })),
    npcs: def.npcs.map((n) => ({ type: n.type, worldX: ox + n.x, worldY: n.y })),
    catalog: def.catalog,
  });
  for (const prop of def.props) {
    const { x, y, ...rest } = prop;
    const placed = { ...rest, worldX: ox + x, worldY: y };
    world.props.push(placed);
  }
  added += 1;
}

for (const [kind, dialog] of Object.entries(NPC_DIALOG_CONFIG)) {
  world.dialogs[kind] = dialog;
}

world.meta.worldChunksX = world.chunks.reduce((max, chunk) => Math.max(max, chunk.cx), 0) + 1;

await fs.writeFile(target, `${JSON.stringify(world, null, 2)}\n`, 'utf8');
console.log(
  `Added ${added} NPC chunk templates, updated ${renamed} catalogs `
  + `(library now ${world.chunks.length} chunks, dialogs for ${Object.keys(NPC_DIALOG_CONFIG).length} NPCs).`,
);
