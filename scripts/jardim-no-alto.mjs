// O JARDIM DO FIM NO ALTO (pedido do autor): a área da fogueira do fim tem DOIS níveis e é o ponto mais
// alto do vale. Passa-se o portão (ainda no chão), sobe-se uma escada para o PLANALTO, que é o jardim
// inteiro dentro da sebe, e uma segunda escada leva ao CUME, um 5×5 em volta da fogueira. As duas escadas
// ficam no eixo do portão e da fogueira: a subida é a última caminhada do jogo, reta, até o fogo.
//
// O interior do jardim é o que se alcança da fogueira sem atravessar colisão nem o portão, mais as
// árvores soltas lá dentro (senão viravam um buraco no planalto, com a árvore no fundo).
//
// A PROVA, partindo do começo da aventura: nenhum NPC, item ou prop que se alcançava a pé deixa de se
// alcançar, e a fogueira se alcança subindo as duas escadas a partir do portão.
//
// IDEMPOTENTE e DETERMINÍSTICO. Backup (só na primeira vez) em backup/world-pre-jardim-no-alto.json.
//
//   node scripts/jardim-no-alto.mjs           # aplica
//   node scripts/jardim-no-alto.mjs --check   # só confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeCanStep, RELIEF_HIGH, RELIEF_PEAK } from './relevo.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const worldPath = path.resolve(here, '../public/world.json');
const backupPath = path.resolve(here, '../backup/world-pre-jardim-no-alto.json');
const check = process.argv.includes('--check');

const raw = fs.readFileSync(worldPath, 'utf8');
const world = JSON.parse(raw);
const { worldChunksX, worldChunksY, chunkColumns: CW, chunkRows: CH } = world.meta;
const W = worldChunksX * CW;
const H = worldChunksY * CH;

const HEARTH = world.props.find((p) => p.type === 'hearth');
const GATE = world.props.find((p) => p.type === 'gardenGate');
/** O cume: 5×5 com a fogueira no meio da largura, uma fileira de folga ao sul dela (onde se assa). */
const PEAK = { x0: HEARTH.worldX - 2, x1: HEARTH.worldX + 2, y0: HEARTH.worldY - 3, y1: HEARTH.worldY + 1 };
/**
 * As flores (os frames do BIOME_DECOR que o bioma não troca), em relação à fogueira: as duas laterais do cume,
 * e um canteiro de cada lado da escada do cume, no planalto. Longe do eixo da subida, dos lugares em volta do
 * fogo onde os amigos sentam (HearthReunion.SEAT_OFFSETS) e do meio do fundo, onde a nave da Vega pousa
 * (REUNION_SHIP_NORTH).
 */
const FLOWERS = [66, 67, 68];
const GARDEN_FLOWERS = [
  [-2, -3], [2, -3], [-2, -2], [2, -2], [-2, -1], [2, -1],
  [-1, 2], [1, 2], [-2, 2], [2, 2], [-2, 3], [2, 3],
];
/**
 * As escadas, subindo para o norte no eixo do portão, cada uma da largura de um herói (pedido do autor: a
 * escadaria de três ficou grande demais — "fina, só que bonita"). A beleza é do desenho: pedra lavrada, mureta,
 * pilares e as lanternas em cima deles (World3D.buildStairGeometry, objects/GardenLanterns).
 */
const STAIR_GROUND = { x: GATE.worldX, y: GATE.worldY - 1, code: 2 };
/** Os dois tiles dos lados do portão (ver "os lados do portão ficam no chão", abaixo). */
const GATE_SIDE_KEYS = new Set([GATE.worldX - 1, GATE.worldX + 1].map((x) => `${x},${GATE.worldY}`));
const STAIR_PEAK = { x: GATE.worldX, y: PEAK.y1 + 1, code: 9 };
const STAIRS = [STAIR_GROUND, STAIR_PEAK];
/**
 * O CHÃO DO JARDIM É GRAMA (pedido do autor: "no segundo andar, faça o chão ser de grama mesmo, não coloque
 * pedra"). Uma praça de calçamento em volta da fogueira chegou a existir e saiu; o que sobrou dela volta a ser
 * grama logo abaixo, e `PAVED` fica vazio de propósito.
 */
const STONE = 23;
const GRASS = 5;
const PAVED = [];
/**
 * A MATA ANTIGA (pedido do autor: o jardim alto é o lugar mais antigo, a floresta mais antiga). As árvores do jardim
 * e da sebe em volta viram as ÁRVORES ANCIÃS, e o mato de dentro vira a MOITA VELHA e o CAPIM ANTIGO
 * (spritefactory/sprites/ancient-grove.mjs; ANCIENT_GROVE em world/biomes.ts). O pinheiro florido de uma versão
 * anterior vira anciã também.
 */
const ANCIENT_TREES = [73, 74];
const ANCIENT_BUSH = 75;
const ANCIENT_GRASS = 76;
const OLD_TREES = new Set([4, 14, 15, 16, 17, 18, ...ANCIENT_TREES]);
/** O mato comum que vira o antigo (os rasteiros, os altos e a flora dos biomas que é planta). */
const OLD_DECOR = new Set([0, 1, 7, 8, 10, 11, 19, 20, 63, 64, 72, ANCIENT_BUSH, ANCIENT_GRASS]);
/** No planalto, quanto do chão vazio ganha mato antigo (pelo hash da coordenada, em centésimos). */
const ANCIENT_COVER = 38;
const hash = (x, y) => { let h = (x * 73856093) ^ (y * 19349663); h = (h ^ (h >>> 13)) >>> 0; return h; };

const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 73, 74]);
const SEA = 33;
const SCENIC = new Set([6, 7]);
const key = (x, y) => `${x},${y}`;
const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
const at = (x, y) => { const c = chunkOf(x, y); return { c, lx: x % CW, ly: y % CH }; };
const relief = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : chunkOf(x, y).relief?.[y % CH]?.[x % CW] ?? 0);
const setRelief = (x, y, code) => {
  const { c, lx, ly } = at(x, y);
  c.relief ??= Array.from({ length: CH }, () => new Array(CW).fill(0));
  c.relief[ly][lx] = code;
};
const canStep = makeCanStep(relief);
const solidTile = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return true;
  const { c, lx, ly } = at(x, y);
  return c.collisions[ly][lx] || SOLID_UPPER.has(c.upper[ly][lx]) || c.ground[ly][lx] === SEA;
};

// ── O INTERIOR DO JARDIM ────────────────────────────────────────────────────────────────────
const inside = new Set([key(HEARTH.worldX, HEARTH.worldY)]);
{
  const q = [[HEARTH.worldX, HEARTH.worldY]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy; const k = key(nx, ny);
      // o portão e os dois lados dele fecham o jardim (os lados ficam abertos, no chão, mas são a borda)
      if (inside.has(k) || (nx === GATE.worldX && ny === GATE.worldY) || GATE_SIDE_KEYS.has(k) || solidTile(nx, ny)) continue;
      inside.add(k);
      q.push([nx, ny]);
    }
  }
  // As árvores soltas lá dentro: sólidas, fora da serra de mata, com dois ou mais vizinhos no jardim.
  for (let grew = true; grew;) {
    grew = false;
    for (const k of [...inside]) {
      const [x, y] = k.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy; const nk = key(nx, ny);
        if (inside.has(nk) || GATE_SIDE_KEYS.has(nk) || !solidTile(nx, ny) || SCENIC.has(relief(nx, ny))) continue;
        const around = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([ex, ey]) => inside.has(key(nx + ex, ny + ey))).length;
        if (around >= 2) { inside.add(nk); grew = true; }
      }
    }
  }
}

// ── A PROVA (antes) ─────────────────────────────────────────────────────────────────────────
const NOT_OPENABLE = new Set(['water', 'lava', 'campfire', 'hearth', 'toolbox', 'bridgeSpot', 'rock', 'ironRock', 'coalRock', 'furnace']);
const reach = () => {
  const npcs = new Set(world.chunks.flatMap((c) => c.npcs.map((n) => key(n.worldX, n.worldY))));
  const propAt = new Map(world.props.map((p) => [key(p.worldX, p.worldY), p.type]));
  const start = [world.meta.playerStart.worldX, world.meta.playerStart.worldY];
  const seen = new Set([key(...start)]);
  const q = [start];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy; const k = key(nx, ny);
      if (seen.has(k) || !canStep(x, y, nx, ny) || solidTile(nx, ny) || npcs.has(k) || NOT_OPENABLE.has(propAt.get(k))) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
};
const targets = () => [
  ...world.props.map((p) => ({ what: `${p.type}@${key(p.worldX, p.worldY)}`, x: p.worldX, y: p.worldY })),
  ...world.chunks.flatMap((c) => [...(c.pickups ?? []), ...c.npcs]).map((p) => ({ what: `${p.type}@${key(p.worldX, p.worldY)}`, x: p.worldX, y: p.worldY })),
];
const reachable = (seen, t) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
  const k = key(t.x + dx, t.y + dy);
  return seen.has(k) && (dx === 0 && dy === 0 ? true : canStep(t.x + dx, t.y + dy, t.x, t.y) || relief(t.x, t.y) === relief(t.x + dx, t.y + dy));
});
const before = reach();
const reachableBefore = new Set(targets().filter((t) => reachable(before, t)).map((t) => t.what));

// ── O QUE MUDA ──────────────────────────────────────────────────────────────────────────────
const problems = [];
const inPeak = (x, y) => x >= PEAK.x0 && x <= PEAK.x1 && y >= PEAK.y0 && y <= PEAK.y1;
for (const k of inside) {
  const [x, y] = k.split(',').map(Number);
  setRelief(x, y, inPeak(x, y) ? RELIEF_PEAK : RELIEF_HIGH);
}
for (const s of STAIRS) {
  if (!inside.has(key(s.x, s.y))) problems.push(`a escada em ${key(s.x, s.y)} cairia fora do jardim`);
  if (solidTile(s.x, s.y) || world.props.some((p) => p.worldX === s.x && p.worldY === s.y)) problems.push(`a escada em ${key(s.x, s.y)} não está livre`);
  setRelief(s.x, s.y, s.code);
  // A escada é passagem limpa: a decoração do tile sai (chão + uma coisa).
  const { c, lx, ly } = at(s.x, s.y);
  c.upper[ly][lx] = null;
}
for (let y = PEAK.y0; y <= PEAK.y1; y++) {
  for (let x = PEAK.x0; x <= PEAK.x1; x++) if (!inside.has(key(x, y))) problems.push(`o cume em ${key(x, y)} cai fora do jardim`);
}
// A SEBE SOBE JUNTO: toda árvore em volta do jardim (os oito vizinhos do interior) vira serra de mata no nível
// do planalto. Sem isso o paredão de fora fazia zigue-zague — só algumas árvores da sebe já tinham altura —
// e com isso ele contorna a sebe inteira, com o portão num corte da parede.
const SCENIC_1 = 6;
/**
 * OS LADOS DO PORTÃO FICAM NO CHÃO, sem árvore (pedido do autor: os dois blocos da sebe dos lados do portão
 * apertavam a escada de baixo, que ficava espremida entre paredões). Abertos, eles não abrem caminho: do chão
 * para o planalto só se sobe por escada, e a única é a do portão.
 */
const GATE_SIDES = [...GATE_SIDE_KEYS];
for (const k of GATE_SIDES) {
  const [x, y] = k.split(',').map(Number);
  const { c, lx, ly } = at(x, y);
  if (inside.has(k)) { problems.push(`o lado do portão em ${k} é jardim`); continue; }
  setRelief(x, y, 0);
  c.upper[ly][lx] = null;
  c.collisions[ly][lx] = false;
}
for (const k of inside) {
  const [x, y] = k.split(',').map(Number);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx; const ny = y + dy; const nk = key(nx, ny);
      if (inside.has(nk) || (nx === GATE.worldX && ny === GATE.worldY) || GATE_SIDES.includes(nk) || !solidTile(nx, ny)) continue;
      if (relief(nx, ny) === 0) setRelief(nx, ny, SCENIC_1);
    }
  }
}
// AS FLORES: só em tile de chão do jardim, vazio (chão + uma coisa) e fora das escadas.
const occupied = (x, y) => world.props.some((p) => p.worldX === x && p.worldY === y)
  || world.chunks.some((c) => [...(c.pickups ?? []), ...c.npcs].some((p) => p.worldX === x && p.worldY === y));
const stairAt = (x, y) => STAIRS.some((st) => st.x === x && st.y === y);
// O CALÇAMENTO: chão de pedra, e a decoração do tile sai (as flores de uma versão anterior, inclusive). O
// jardim não tinha pedra nenhuma, então o calçamento de uma versão anterior fora da praça volta a ser grama.
const pavedKeys = new Set(PAVED.map(([dx, dy]) => key(HEARTH.worldX + dx, HEARTH.worldY + dy)));
for (const k of inside) {
  if (pavedKeys.has(k)) continue;
  const [x, y] = k.split(',').map(Number);
  const { c, lx, ly } = at(x, y);
  if (c.ground[ly][lx] === STONE) c.ground[ly][lx] = GRASS;
}
for (const [dx, dy] of PAVED) {
  const x = HEARTH.worldX + dx; const y = HEARTH.worldY + dy;
  if (!inside.has(key(x, y)) || stairAt(x, y)) { problems.push(`o calçamento em ${key(x, y)} cai fora do jardim`); continue; }
  const { c, lx, ly } = at(x, y);
  c.ground[ly][lx] = STONE;
  c.upper[ly][lx] = null;
}
// A MATA ANTIGA: toda árvore na moldura do jardim — o interior e a sebe em volta, um tile além, CANTOS inclusive
// (pelos oito vizinhos, os pinheiros das quinas da sebe ficavam comuns no meio das anciãs) — vira anciã, uma das
// duas pela coordenada.
{
  const xs = [...inside].map((k) => Number(k.split(',')[0]));
  const ys = [...inside].map((k) => Number(k.split(',')[1]));
  for (let y = Math.min(...ys) - 1; y <= Math.max(...ys) + 1; y++) {
    for (let x = Math.min(...xs) - 1; x <= Math.max(...xs) + 1; x++) {
      const { c, lx, ly } = at(x, y);
      if (OLD_TREES.has(c.upper[ly][lx])) c.upper[ly][lx] = ANCIENT_TREES[hash(x, y) % ANCIENT_TREES.length];
    }
  }
}
// O mato de dentro: o que já havia vira o antigo, e o planalto ganha mais (fora das escadas e do caminho entre
// elas, no eixo do portão). Duas de cada três peças são capim, uma é moita.
const ancientDecor = (x, y) => (hash(x + 7, y + 13) % 3 === 0 ? ANCIENT_BUSH : ANCIENT_GRASS);
for (const k of inside) {
  const [x, y] = k.split(',').map(Number);
  if (stairAt(x, y) || pavedKeys.has(k)) continue;
  const { c, lx, ly } = at(x, y);
  const up = c.upper[ly][lx];
  if (up !== null && OLD_DECOR.has(up)) { c.upper[ly][lx] = ancientDecor(x, y); continue; }
  if (up !== null || solidTile(x, y) || inPeak(x, y) || x === GATE.worldX || occupied(x, y)) continue;
  if (hash(x + 31, y + 57) % 100 < ANCIENT_COVER) c.upper[ly][lx] = ancientDecor(x, y);
}
// As de uma versão anterior (a fileira de trás do cume, onde a nave pousa) saem.
for (let x = PEAK.x0 + 1; x <= PEAK.x1 - 1; x++) {
  for (const y of [PEAK.y0, PEAK.y0 + 1]) {
    const { c, lx, ly } = at(x, y);
    if (FLOWERS.includes(c.upper[ly][lx])) c.upper[ly][lx] = null;
  }
}
GARDEN_FLOWERS.forEach(([dx, dy], i) => {
  const x = HEARTH.worldX + dx; const y = HEARTH.worldY + dy;
  if (!inside.has(key(x, y)) || stairAt(x, y) || occupied(x, y) || solidTile(x, y)) { problems.push(`a flor em ${key(x, y)} não cabe`); return; }
  const { c, lx, ly } = at(x, y);
  c.upper[ly][lx] = FLOWERS[i % FLOWERS.length];
});

// ── A PROVA (depois) ────────────────────────────────────────────────────────────────────────
const after = reach();
const lost = targets().filter((t) => reachableBefore.has(t.what) && !reachable(after, t)).map((t) => t.what);
if (lost.length) problems.push(`deixariam de se alcançar: ${lost.join(' ')}`);
// Do portão à fogueira, subindo: chão → escada → planalto → escada → cume, ao lado do fogo.
const hearthSide = key(HEARTH.worldX, HEARTH.worldY + 1);
if (!after.has(hearthSide)) problems.push('a frente da fogueira não se alcança subindo as escadas');
if (relief(HEARTH.worldX, HEARTH.worldY) !== RELIEF_PEAK) problems.push('a fogueira não está no cume');
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const out = `${JSON.stringify(world, null, 2)}\n`;
const peakTiles = [...inside].filter((k) => { const [x, y] = k.split(',').map(Number); return inPeak(x, y); }).length;
if (check) {
  if (out.trim() !== raw.split('\r\n').join('\n').trim()) {
    console.error('world.json NÃO é o ponto fixo de jardim-no-alto.mjs');
    process.exit(1);
  }
  console.log(`world.json OK: o jardim do fim tem dois andares (${inside.size - peakTiles - 2} de planalto, ${peakTiles} de cume, ${STAIRS.length} escadas); a prova de BFS passa.`);
} else {
  if (!fs.existsSync(backupPath) && out.trim() !== raw.split('\r\n').join('\n').trim()) {
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.writeFileSync(backupPath, raw);
  }
  fs.writeFileSync(worldPath, out);
  console.log(`world.json: o jardim do fim sobe dois andares (${inside.size - peakTiles - 2} de planalto, ${peakTiles} de cume, ${STAIRS.length} escadas); a prova de BFS passa.`);
}
