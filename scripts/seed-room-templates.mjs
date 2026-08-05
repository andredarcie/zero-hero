// SEMEIA A FOLHA DE PEÇAS — `public/levels/dungeon-0.json`, a biblioteca de salas do gerador.
//
//   node scripts/seed-room-templates.mjs
//
// ⚠️ Ele NUNCA sobrescreve: se o arquivo já existe, avisa e sai. A folha é AUTORADA — o lugar
// dela é o `/lab?dungeon=0`, e um script que passasse por cima do que alguém desenhou é a
// bomba-relógio que o CLAUDE.md proíbe em maiúsculas. Isto aqui é só o primeiro empurrão: oito
// salas que as formas paramétricas não sabem fazer, para a biblioteca nascer com o que ela existe
// para provar — que caminho torto, volta e ponte em L cabem numa sala.
//
// ── COMO O GERADOR LÊ ISTO ──────────────────────────────────────────────────────────────────
// Cada CHUNK é uma sala. De que lados ela tem porta se deduz da geometria (os dois tiles do meio
// de cada parede estarem abertos), então não há metadado a manter em dia. Chunk todo maciço = vaga
// vazia, ignorada. Cada sala serve a até 8 assinaturas (4 rotações × espelho), então uma peça de
// canto cobre os quatro cantos.
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'levels', 'dungeon-0.json');

const W = 12;
const H = 12;
const FLOOR = 42;
const WALL = 45;
const PIT = 33;

// N=1 L=2 S=4 O=8 — a mesma ordem de PropDir e a mesma de `dungeonRooms`.
const N = 1;
const E = 2;
const S = 4;
const O = 8;

/** Coordenada na faixa de uma porta — cópia fiel de `laneToXY` (dungeonRooms.ts). */
const laneToXY = (side, along, across) => {
  switch (side) {
    case 0: return { x: 5 + across, y: along };
    case 1: return { x: W - 1 - along, y: 5 + across };
    case 2: return { x: 6 - across, y: H - 1 - along };
    default: return { x: along, y: 6 - across };
  }
};

const blank = () => Array.from({ length: H }, (_, y) => Array.from(
  { length: W },
  (_, x) => (x >= 1 && y >= 1 && x <= W - 2 && y <= H - 2 ? FLOOR : WALL),
));

const solid = () => Array.from({ length: H }, () => new Array(W).fill(WALL));

const carveDoors = (grid, mask) => {
  for (const side of [0, 1, 2, 3]) {
    if ((mask & (1 << side)) === 0) continue;
    for (const across of [0, 1]) {
      const { x, y } = laneToXY(side, 0, across);
      grid[y][x] = FLOOR;
    }
  }
};

/** O anel de uma caixa (só as bordas). */
const box = (grid, x0, y0, x1, y1, tile = WALL) => {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x === x0 || x === x1 || y === y0 || y === y1) grid[y][x] = tile;
    }
  }
};

const fill = (grid, x0, y0, x1, y1, tile) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y][x] = tile;
};

const walkable = (tile) => tile === FLOOR;

/** O mesmo `isSane` do carregador: toda porta tem de chegar ao miolo. */
const sane = (grid) => {
  if (!walkable(grid[5][5])) return 'miolo fechado';
  const seen = Array.from({ length: H }, () => new Array(W).fill(false));
  const stack = [[5, 5]];
  seen[5][5] = true;
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny][nx] || !walkable(grid[ny][nx])) continue;
      seen[ny][nx] = true;
      stack.push([nx, ny]);
    }
  }
  for (const side of [0, 1, 2, 3]) {
    const a = laneToXY(side, 0, 0);
    const b = laneToXY(side, 0, 1);
    const open = walkable(grid[a.y][a.x]) && walkable(grid[b.y][b.x]);
    if (open && !(seen[a.y][a.x] && seen[b.y][b.x])) return `porta ${side} não chega ao miolo`;
  }
  return null;
};

const ROOMS = [
  {
    // A ESPIRAL DUPLA: dois anéis com as aberturas em lados opostos. Entrar pelo sul é dar a volta
    // inteira pelo corredor de fora até a abertura do norte, e depois a volta de dentro. Nenhuma
    // forma paramétrica faz isto — todas elas garantem faixa reta de porta a porta.
    name: 'espiral-dupla',
    mask: N | S,
    paint: (g) => {
      box(g, 2, 2, 9, 9);
      fill(g, 5, 2, 6, 2, FLOOR); // a abertura do anel de fora, ao norte
      box(g, 4, 4, 7, 7);
      fill(g, 5, 7, 6, 7, FLOOR); // a de dentro, ao sul
    },
  },
  {
    // PONTE TORTA: a sala é um poço, e a passagem é um L. A faixa reta não existe aqui.
    name: 'ponte-torta',
    mask: N | E,
    paint: (g) => {
      fill(g, 1, 1, 10, 10, PIT);
      fill(g, 5, 1, 6, 6, FLOOR);
      fill(g, 5, 5, 10, 6, FLOOR);
    },
  },
  {
    name: 'claustro',
    mask: N | E,
    paint: (g) => {
      box(g, 1, 1, 4, 4);
      fill(g, 4, 2, 4, 3, FLOOR);
      box(g, 7, 7, 10, 10);
      fill(g, 7, 8, 7, 9, FLOOR);
      box(g, 1, 7, 4, 10);
      fill(g, 2, 7, 3, 7, FLOOR);
    },
  },
  {
    // A CAPELA: nave central entre duas fileiras de colunas, e um altar no fundo.
    name: 'capela',
    mask: N | S,
    paint: (g) => {
      for (let y = 2; y <= 9; y += 2) {
        g[y][3] = WALL;
        g[y][8] = WALL;
      }
      fill(g, 1, 1, 2, 1, WALL);
      fill(g, 9, 1, 10, 1, WALL);
    },
  },
  {
    name: 'sala-do-trono',
    mask: N,
    paint: (g) => {
      fill(g, 3, 8, 8, 9, WALL);
      fill(g, 5, 8, 6, 8, FLOOR);
      g[3][2] = WALL;
      g[3][9] = WALL;
      fill(g, 1, 5, 2, 6, PIT);
      fill(g, 9, 5, 10, 6, PIT);
    },
  },
  {
    name: 'nicho-duplo',
    mask: N,
    paint: (g) => {
      box(g, 1, 6, 4, 9);
      g[7][4] = FLOOR;
      box(g, 7, 6, 10, 9);
      g[7][7] = FLOOR;
      fill(g, 2, 2, 3, 3, PIT);
      fill(g, 8, 2, 9, 3, PIT);
    },
  },
  {
    name: 'praca',
    mask: N | E | S | O,
    paint: (g) => {
      fill(g, 2, 2, 3, 3, PIT);
      fill(g, 8, 2, 9, 3, PIT);
      fill(g, 2, 8, 3, 9, PIT);
      fill(g, 8, 8, 9, 9, PIT);
      g[4][4] = WALL;
      g[4][7] = WALL;
      g[7][4] = WALL;
      g[7][7] = WALL;
    },
  },
  {
    name: 'ossario',
    mask: N | E | S,
    paint: (g) => {
      for (let y = 2; y <= 9; y += 3) fill(g, 1, y, 3, y, WALL);
      for (let y = 3; y <= 9; y += 3) fill(g, 8, y, 10, y, WALL);
    },
  },
];

if (existsSync(OUT)) {
  console.log(`${path.relative(ROOT, OUT)} já existe — nada a fazer (a folha é autorada; edite em /lab?dungeon=0).`);
  process.exit(0);
}

const chunks = [];
const COLS = 4;
const ROWS = 3;
let index = 0;
let bad = 0;
for (let cy = 0; cy < ROWS; cy++) {
  for (let cx = 0; cx < COLS; cx++) {
    const room = ROOMS[index++];
    let grid;
    if (!room) {
      grid = solid(); // vaga vazia: o carregador ignora, e ela fica de espaço para desenhar
    } else {
      grid = blank();
      carveDoors(grid, room.mask);
      room.paint(grid);
      carveDoors(grid, room.mask); // a forma nunca sela a própria porta
      const why = sane(grid);
      if (why) {
        console.error(`✗ ${room.name}: ${why}`);
        bad++;
      } else {
        console.log(`✓ ${room.name.padEnd(16)} portas ${room.mask.toString(2).padStart(4, '0')}`);
      }
    }
    chunks.push({
      cx,
      cy,
      ground: grid.map((row) => row.map((tile) => (tile === PIT ? PIT : FLOOR))),
      upper: grid.map((row) => row.map((tile) => (tile === WALL ? WALL : null))),
      collisions: Array.from({ length: H }, () => new Array(W).fill(false)),
      enemies: [],
      pickups: [],
      npcs: [],
    });
  }
}

if (bad > 0) {
  console.error(`\n${bad} sala(s) inválidas — nada escrito.`);
  process.exit(1);
}

writeFileSync(OUT, JSON.stringify({
  meta: {
    name: 'Salas — a folha de peças do gerador',
    schemaVersion: 1,
    worldChunksX: COLS,
    worldChunksY: ROWS,
    chunkColumns: W,
    chunkRows: H,
    tileSize: 8,
    tilesetKey: 'forest-tileset',
    playerStart: { worldX: 5, worldY: 5 },
    puzzle: true,
    exportedAt: new Date().toISOString(),
  },
  chunks,
  props: [],
  dialogs: {},
}));
console.log(`\nescrito ${path.relative(ROOT, OUT)} — ${ROOMS.length} salas em ${COLS}×${ROWS} vagas`);
