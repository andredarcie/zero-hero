import fs from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

const COLS = 12;
const ROWS = 12;
const GRASS = 5;
const WATER = 33;
const TREE = 4;
const DECOR = [0, 6, 7, 8, 10, 11];

const grid = (value) => Array.from({ length: ROWS }, () => Array(COLS).fill(value));
const blank = (cx, catalog) => ({
  cx,
  cy: 0,
  ground: grid(GRASS),
  upper: grid(null),
  collisions: grid(false),
  enemies: [],
  pickups: [],
  npcs: [],
  catalog,
});

const lake = blank(0, {
  id: 'moonlit-lake',
  name: 'Moonlit Lake',
  cost: 3,
  cardImage: 'assets/environment/terrain/water_0.png',
  description: 'Open banks around a cold lake. Easy to cross around, hard to own.',
});
for (let y = 3; y <= 8; y += 1) {
  for (let x = 2; x <= 9; x += 1) {
    const bank = x === 2 || x === 9 || y === 3 || y === 8;
    if (!bank || (x + y) % 4 !== 0) lake.ground[y][x] = WATER;
  }
}
for (let y = 0; y < ROWS; y += 1) {
  lake.upper[y][(y * 5 + 2) % COLS] = DECOR[y % DECOR.length];
}

const forest = blank(1, {
  id: 'whispering-forest',
  name: 'Whispering Forest',
  cost: 5,
  cardImage: 'assets/environment/tilesets/forest_tile_set.png',
  description: 'Dense timber, narrow clearings, and room for the roads to branch again.',
});
for (let y = 0; y < ROWS; y += 1) {
  for (let x = 0; x < COLS; x += 1) {
    const road = Math.abs(x - 5.5) <= 1 || Math.abs(y - 5.5) <= 1;
    if (!road && (x * 13 + y * 7) % 10 < 5) forest.upper[y][x] = TREE;
    else if (!road && (x * 3 + y * 11) % 17 === 0) forest.upper[y][x] = DECOR[(x + y) % DECOR.length];
  }
}

const spiders = blank(2, {
  id: 'spider-hollow',
  name: 'Spider Hollow',
  cost: 7,
  cardImage: 'assets/environment/props/spider_web.png',
  description: 'A web-choked hollow. Every living enemy authored here is a spider.',
});
for (let y = 0; y < ROWS; y += 1) {
  for (let x = 0; x < COLS; x += 1) {
    const wall = x <= 1 || x >= 10 || y <= 1 || y >= 10;
    const chamberPillar = (x === 4 || x === 7) && (y === 4 || y === 7);
    if (wall || chamberPillar) spiders.upper[y][x] = TREE;
    else if ((x + y * 2) % 13 === 0) spiders.upper[y][x] = 11;
  }
}
spiders.enemies.push(
  { type: 'spider', worldX: 28, worldY: 5 },
  { type: 'spider', worldX: 31, worldY: 7 },
  { type: 'spider', worldX: 33, worldY: 4 },
);

const world = {
  meta: {
    name: 'chunk-library',
    schemaVersion: 1,
    worldChunksX: 3,
    worldChunksY: 1,
    chunkColumns: COLS,
    chunkRows: ROWS,
    tileSize: 8,
    tilesetKey: 'forest-tileset',
    playerStart: { worldX: 6, worldY: 6 },
    exportedAt: new Date().toISOString(),
  },
  chunks: [lake, forest, spiders],
  props: [],
  dialogs: {
    wizard: {
      npcName: 'WIZARD',
      npcColorHex: '#a97bff',
      npcAssetKey: 'mage',
      voice: { freq: 220, wave: 'sine' },
      lines: [
        { speaker: 'npc', text: 'The dark did not leave us a world. It left us choices.' },
        { speaker: 'npc', text: 'Take the sword. The dead on unfinished roads still carry coin.' },
        { speaker: 'npc', text: 'Stand on a road seal and press B. Spend what you earn, and decide what exists next.' },
      ],
    },
  },
};

const target = fileURLToPath(new URL('../public/world.json', import.meta.url));
await fs.writeFile(target, `${JSON.stringify(world, null, 2)}\n`, 'utf8');
console.log(`Wrote ${world.chunks.length} chunk templates to ${target}`);
