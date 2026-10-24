// O MUNDO PACIFICO — o passo que tirou o combate e o subterraneo do `world.json` e montou o arco
// novo em cima do mundo autorado. Ele LE o arquivo e acrescenta/remove por regra, nunca o refaz:
//
//   • as COVAS de inimigo somem (o campo `enemies` sai de todo chunk);
//   • a ESCADA para o subterraneo, as marcas de BOMBA e a PIRA saem dos props;
//   • a LAVA vira AGUA, tile por tile (a mesma forma: um lago onde havia um campo em brasa);
//   • a MORTE sai do mapa (o resto dos vizinhos fica — eles ganharam pedidos novos);
//   • o MAGO entra na beira da estrada do sul, ao lado de onde a espada e fincada;
//   • o JARDIM DO CENTRO: a pira vira a FOGUEIRA DO FIM (`hearth`), a sebe de pinheiros que ja
//     cercava a clareira ganha colisao PINTADA (hoje nada derruba arvore verde, e a
//     colisao pintada fica como segunda trava), e o pinheiro do sul vira o PORTAO (`gardenGate`). Dentro, um
//     graveto e um cogumelo esperam o heroi;
//   • os COGUMELOS do bosque: sete, espalhados na sombra das arvores, longe uns dos outros.
//
// IDEMPOTENTE: rodar duas vezes da o mesmo arquivo (cada passo mira o estado final, nao um delta),
// e DETERMINISTICO (zero Math.random). `--check` falha se o disco nao for o ponto fixo.
//
//   node scripts/cozy-world.mjs           # aplica
//   node scripts/cozy-world.mjs --check   # so confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const worldPath = path.resolve(here, '../public/world.json');
const check = process.argv.includes('--check');

const raw = fs.readFileSync(worldPath, 'utf8');
const world = JSON.parse(raw);
const { worldChunksX, worldChunksY, chunkColumns: CW, chunkRows: CH } = world.meta;
const W = worldChunksX * CW;
const H = worldChunksY * CH;

// The frames that stand up and block (constants.SOLID_UPPER_FRAMES), and the pines among them.
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40]);
const TREE_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21]);
const SEA = 33;

const chunkAt = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
const local = (x, y) => [((y % CH) + CH) % CH, ((x % CW) + CW) % CW];
const cell = (x, y) => {
  const c = chunkAt(x, y);
  const [r, col] = local(x, y);
  return {
    get ground() { return c.ground[r][col]; },
    get upper() { return c.upper[r][col]; },
    set upper(v) { c.upper[r][col] = v; },
    get collision() { return c.collisions[r][col]; },
    set collision(v) { c.collisions[r][col] = v; },
  };
};

// ── 1. sem covas, sem escada, sem bomba, sem pira, sem lava ─────────────────────────────────
for (const chunk of world.chunks) delete chunk.enemies;
world.props = world.props
  .filter((p) => p.type !== 'stairs' && p.type !== 'bombSpot' && p.type !== 'carnivorousPlant')
  .map((p) => (p.type === 'lava' ? { type: 'water', worldX: p.worldX, worldY: p.worldY } : p));

// ── 1b. sem parede invisivel ─────────────────────────────────────────────────────────────
// Colisao PINTADA so vale onde ha algo de pe para justifica-la (um pinheiro, uma rocha). Os
// cercados das pecas que sairam (escadas, paredes de bomba) deixaram colisao em chao vazio: um
// tile que barra o heroi sem nada desenhado nele e a pior recusa que um jogo pode dar.
let invisibleWalls = 0;
for (const chunk of world.chunks) {
  for (let r = 0; r < CH; r += 1) {
    for (let col = 0; col < CW; col += 1) {
      if (!chunk.collisions[r][col]) continue;
      if (SOLID_UPPER.has(chunk.upper[r][col] ?? -1)) continue;
      chunk.collisions[r][col] = false;
      invisibleWalls += 1;
    }
  }
}

// ── 1c. o cemiterio vira bosque ──────────────────────────────────────────────────────────
// A cabeca na estaca (22) e a lapide (25) viram PINHEIRO (4): os tres sao de pe e bloqueiam, entao
// nenhum caminho abre ou fecha. A ossada (27) e a teia (28) viram flores (11 e 10). E o nome do
// mundo deixa de ser cinza.
const REPLACE_UPPER = new Map([[22, 4], [25, 4], [27, 11], [28, 10]]);
let graves = 0;
for (const chunk of world.chunks) {
  for (const row of chunk.upper) {
    for (let col = 0; col < row.length; col += 1) {
      if (!REPLACE_UPPER.has(row[col])) continue;
      row[col] = REPLACE_UPPER.get(row[col]);
      graves += 1;
    }
  }
}
// O CHAO do cemiterio (o chunk 1,2) era laje de cripta rachada; ele vira prado, e as arvores
// mortas dele viram pinheiros. Fora dali a laje RACHADA (29-32) vira calcamento liso (23): as
// pracinhas de pedra continuam, so que inteiras.
const STONE = new Set([23, 24, 29, 30, 31, 32]);
const CRACKED = new Set([29, 30, 31, 32]);
for (const chunk of world.chunks) {
  const grove = chunk.cx === 1 && chunk.cy === 2;
  for (let r = 0; r < CH; r += 1) {
    for (let col = 0; col < CW; col += 1) {
      const g = chunk.ground[r][col];
      if (grove && STONE.has(g)) chunk.ground[r][col] = 5;
      else if (CRACKED.has(g)) chunk.ground[r][col] = 23;
      if (grove && (chunk.upper[r][col] === 3 || chunk.upper[r][col] === 21)) chunk.upper[r][col] = 14;
    }
  }
}
world.meta.name = 'Hearth Valley';

// ── 2. os vizinhos ─────────────────────────────────────────────────────────────────────────
const start = world.meta.playerStart;
// O mago para ao lado de onde o heroi termina a abertura: tres passos pela estrada e um para tras.
const WIZARD = { type: 'wizard', worldX: start.worldX + 1, worldY: start.worldY - 4 };
for (const chunk of world.chunks) {
  chunk.npcs = chunk.npcs.filter((n) => n.type !== 'death' && n.type !== 'wizard');
}
chunkAt(WIZARD.worldX, WIZARD.worldY).npcs.push(WIZARD);
cell(WIZARD.worldX, WIZARD.worldY).upper = null;
for (const key of ['death', 'deathDone', 'wizardDone', 'blackCatDone', 'salesmanDone', 'poetDone']) {
  delete world.dialogs[key];
}
for (const key of Object.keys(world.dialogs)) if (/^cat[A-Z]/.test(key)) delete world.dialogs[key];

// ── 3. o jardim do centro ──────────────────────────────────────────────────────────────────
// A pira autorada marca o centro. Na primeira rodada ela vira a fogueira; nas seguintes o
// centro ja e a fogueira, e e ela que se procura.
const centre = world.props.find((p) => p.type === 'pyre' || p.type === 'hearth');
if (!centre) throw new Error('world.json sem pira/fogueira no centro');
const HEARTH = { x: centre.worldX, y: centre.worldY };
world.props = world.props.filter((p) => !(p.type === 'pyre' || p.type === 'hearth'));
world.props.push({ type: 'hearth', worldX: HEARTH.x, worldY: HEARTH.y });

// O portao: o primeiro pinheiro da sebe ao SUL da fogueira, na mesma coluna. Entre a fogueira e
// ele, a coluna e aberta (um corredor de chegada).
const propAt = (x, y) => world.props.find((p) => p.worldX === x && p.worldY === y);
let gateY = HEARTH.y + 1;
const existingGate = world.props.find((p) => p.type === 'gardenGate');
if (existingGate) {
  gateY = existingGate.worldY;
} else {
  while (gateY < H && !SOLID_UPPER.has(cell(HEARTH.x, gateY).upper ?? -1)) gateY += 1;
  // A sebe do sul tem DUAS fileiras em alguns pontos: o portao fica na de fora, e a de dentro abre.
  while (gateY + 1 < H && SOLID_UPPER.has(cell(HEARTH.x, gateY + 1).upper ?? -1)) {
    cell(HEARTH.x, gateY).upper = null;
    cell(HEARTH.x, gateY).collision = false;
    gateY += 1;
  }
}
const GATE = { x: HEARTH.x, y: gateY };
cell(GATE.x, GATE.y).upper = null;
cell(GATE.x, GATE.y).collision = false;
world.props = world.props.filter((p) => p.type !== 'gardenGate');
world.props.push({ type: 'gardenGate', worldX: GATE.x, worldY: GATE.y });

const blocked = (x, y, gateClosed = true) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return true;
  if (gateClosed && x === GATE.x && y === GATE.y) return true;
  const c = cell(x, y);
  if (c.collision || c.ground === SEA || SOLID_UPPER.has(c.upper ?? -1)) return true;
  const prop = propAt(x, y);
  return Boolean(prop && prop.type !== 'plantSpot' && prop.type !== 'moonflower' && prop.type !== 'gardenGate');
};

// O interior: tudo o que se alcanca da fogueira sem atravessar nada.
const flood = (sx, sy, gateClosed) => {
  const seen = new Set([`${sx},${sy}`]);
  const queue = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy; const k = `${nx},${ny}`;
      if (seen.has(k) || blocked(nx, ny, gateClosed)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return seen;
};
// A fogueira bloqueia; o interior nasce do tile logo ao norte do portao.
const inside = flood(GATE.x, GATE.y - 1, true);
if (inside.has(`${start.worldX},${start.worldY}`)) {
  throw new Error('o jardim nao esta fechado: o ponto inicial alcanca a fogueira sem o portao');
}
// A sebe: todo pinheiro vizinho (8-vizinhanca) do interior ganha colisao pintada.
let hedge = 0;
for (const key of inside) {
  const [x, y] = key.split(',').map(Number);
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const c = cell(nx, ny);
      if (TREE_UPPER.has(c.upper ?? -1) && !c.collision) { c.collision = true; hedge += 1; }
    }
  }
}

// ── 4. os itens ────────────────────────────────────────────────────────────────────────────
const allPickups = () => world.chunks.flatMap((c) => c.pickups);
const occupied = (x, y) => Boolean(propAt(x, y))
  || allPickups().some((p) => p.worldX === x && p.worldY === y)
  || world.chunks.some((c) => c.npcs.some((n) => n.worldX === x && n.worldY === y))
  || (x === start.worldX && y === start.worldY);
const placePickup = (type, x, y) => {
  const c = chunkAt(x, y);
  if (c.pickups.some((p) => p.type === type && p.worldX === x && p.worldY === y)) return;
  c.pickups.push({ type, worldX: x, worldY: y });
  cell(x, y).upper = null; // CHAO + UMA COISA
};

// Dentro do jardim: o graveto e o cogumelo do espeto, um de cada lado da chegada.
const gardenSpots = [...inside]
  .map((k) => k.split(',').map(Number))
  .filter(([x, y]) => !occupied(x, y) && Math.abs(y - HEARTH.y) <= 2 && Math.abs(x - HEARTH.x) >= 1)
  .sort((a, b) => (Math.abs(a[0] - HEARTH.x) + Math.abs(a[1] - HEARTH.y + 1))
    - (Math.abs(b[0] - HEARTH.x) + Math.abs(b[1] - HEARTH.y + 1)) || a[0] - b[0] || a[1] - b[1]);
const hasInside = (type) => allPickups().some((p) => p.type === type && inside.has(`${p.worldX},${p.worldY}`));
if (!hasInside('wood')) {
  const spot = gardenSpots.find(([x]) => x < HEARTH.x);
  placePickup('wood', spot[0], spot[1]);
}
if (!hasInside('mushroom')) {
  const spot = gardenSpots.find(([x, y]) => x > HEARTH.x && !occupied(x, y));
  placePickup('mushroom', spot[0], spot[1]);
}

// Os cogumelos do bosque: na sombra (dois ou mais pinheiros em volta), alcancaveis do ponto
// inicial com o portao FECHADO, fora do jardim e a seis tiles ou mais uns dos outros.
const MUSHROOMS = 7;
const reach = flood(start.worldX, start.worldY, true);
const shady = (x, y) => {
  let n = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) if (TREE_UPPER.has(cell(x + dx, y + dy)?.upper ?? -1)) n += 1;
  }
  return n;
};
const wild = allPickups().filter((p) => p.type === 'mushroom' && !inside.has(`${p.worldX},${p.worldY}`));
const candidates = [...reach]
  .map((k) => k.split(',').map(Number))
  .filter(([x, y]) => x > 0 && y > 0 && x < W - 1 && y < H - 1 && !occupied(x, y) && shady(x, y) >= 3)
  // o oeste primeiro: e o bosque da coletora — e, dentro dele, uma ordem fixa
  .sort((a, b) => (a[0] + a[1] * 0.35) - (b[0] + b[1] * 0.35) || a[1] - b[1]);
for (const [x, y] of candidates) {
  if (wild.length >= MUSHROOMS) break;
  if (wild.some((m) => Math.hypot(m.worldX - x, m.worldY - y) < 6)) continue;
  if (Math.hypot(x - start.worldX, y - start.worldY) < 8) continue;
  placePickup('mushroom', x, y);
  wild.push({ worldX: x, worldY: y });
}
if (wild.length < MUSHROOMS) throw new Error(`so ${wild.length} cogumelos cabem no bosque`);

// ── 5. a prova: com o portao aberto, o jardim e alcancavel do ponto inicial ─────────────────
const open = flood(start.worldX, start.worldY, false);
if (!open.has(`${GATE.x},${GATE.y - 1}`)) throw new Error('o portao nao leva a lugar nenhum');

const out = `${JSON.stringify(world, null, 2)}\n`;
if (check) {
  if (out !== raw) { console.error('world.json NAO e o ponto fixo de cozy-world.mjs'); process.exit(1); }
  console.log('world.json ok (ponto fixo)');
} else {
  fs.writeFileSync(worldPath, out);
  console.log(`world.json: fogueira ${HEARTH.x},${HEARTH.y} · portao ${GATE.x},${GATE.y} · sebe +${hedge} · `
    + `cogumelos ${wild.length} · interior ${inside.size} tiles · paredes invisiveis -${invisibleWalls} · cemiterio ${graves}`);
}
