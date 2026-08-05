// O MUNDO REGANHA AS FERRAMENTAS — acrescenta ao `public/world.json` os props de recurso que a
// troca de mundo (8×8 → 22×8) perdeu. Rode com `node scripts/enrich-overworld-props.mjs`.
//
// ⚠ Ele NÃO é o `generate:world` (aquele reescreve o mundo do zero e apaga o que foi feito à
// mão). Este LÊ o mundo que está lá e ACRESCENTA em duas listas: `world.props` (dryTree, dryBush,
// rock, ironRock, tallGrass) e — uma única vez — um machado em `chunk.pickups`. Terreno, colisão,
// camada de cima, covas, NPCs, fogueiras e portais não são tocados em lugar nenhum deste arquivo.
//
// ── POR QUE ELE EXISTE ────────────────────────────────────────────────────────────────────────
// O mundo autorado de hoje tem 18 props (9 fogueiras + 9 portais) e 1 item (a espada). Sem
// `dryTree` não há graveto; sem graveto não há tocha; sem tocha NENHUMA fogueira morta pode ser
// acesa — e acender uma fogueira é literalmente a condição de final do jogo. Este script devolve
// ao mundo as fontes de cada ferramenta: madeira morta (machado→graveto→tocha), arbusto seco
// (carvão, comida de tocha), rocha (picareta→pedra, o vau de rio), rocha de ferro (insumo da
// caixa de ferramentas) e mato alto (foice→sementes, o loop de plantio — e pavio de fogo).
//
// ── DETERMINÍSTICO E IDEMPOTENTE ──────────────────────────────────────────────────────────────
// Zero `Math.random()`: cada tipo tem um campo de ruído próprio sobre as coordenadas do chunk
// (zonas, não mosaico) e a contagem por chunk é um ALVO — o que já existe do tipo conta para o
// alvo, então rodar duas vezes dá o mesmo mundo.
//
// ── A REGRA QUE NÃO SE NEGOCIA: NADA SELA UM CAMINHO ──────────────────────────────────────────
// Todos estes props BLOQUEIAM o herói, então cada colocação passa por DUAS guardas:
//   1. o filtro barato — o tile precisa continuar com ≥3 vizinhos cardeais andáveis (corredores
//      e portas nunca recebem prop);
//   2. a garantia exata — um BFS a partir do spawn confere que o mundo alcançável perdeu
//      EXATAMENTE o tile do prop (ou nada, num bolsão que já era inalcançável). Um prop que
//      selaria qualquer área é rejeitado. A heurística sozinha deixou 1.700 tiles presos em
//      bolsões na primeira rodada — medido, não presumido; por isso o BFS não é opcional.

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WORLD_PATH = fileURLToPath(new URL('../public/world.json', import.meta.url));

// ── O que o mundo já sabe sobre os próprios tiles (espelha src/game/constants.ts) ─────────────
const SEA_TILE_FRAME = 33;
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 45, 46, 47, 48, 49, 50]);
/** Ninguém planta nada colado no acampamento: o chão de casa fica limpo. */
const CAMP_SAFE_TILES = 8;
/** Distância mínima (chebyshev) de qualquer peça AUTORADA (fogueira, portal, NPC, espada). */
const AUTHORED_CLEARANCE = 2;

/**
 * O ALVO POR CHUNK de cada tipo, decidido por um campo de ruído próprio (célula ~2 chunks →
 * zonas: o bosque seco, o campo de pedras). `at(n)` recebe o ruído 0..1 do chunk e devolve
 * quantos props DESTE tipo aquele chunk deve ter no total.
 */
const PROP_FIELDS = [
  { type: 'dryTree', seed: 0xd27, cell: 2.0, at: (n) => (n > 0.62 ? 2 : n > 0.40 ? 1 : 0) },
  { type: 'dryBush', seed: 0xb05, cell: 2.0, at: (n) => (n > 0.55 ? 1 : 0) },
  { type: 'rock', seed: 0x40c, cell: 2.2, at: (n) => (n > 0.58 ? 1 : 0) },
  { type: 'ironRock', seed: 0x1e0, cell: 2.5, at: (n) => (n > 0.70 ? 1 : 0) },
  { type: 'tallGrass', seed: 0x6a5, cell: 1.8, at: (n) => (n > 0.68 ? 4 : n > 0.55 ? 2 : 0) },
];

/**
 * O MACHADO PERTO DE CASA, uma vez só. A espada mora ao lado do mago; o machado mora uma tela ao
 * norte do spawn, no eixo que leva ao primeiro portal — é ele que abre o loop inteiro do fogo
 * (machado → graveto → tocha → fogueira morta), e trancá-lo numa dungeon trancaria o final do
 * jogo atrás de um labirinto que nada aponta. Só entra se o mundo ainda não tiver NENHUM machado.
 */
const AXE_TARGET = { worldX: 124, worldY: 74 };

const world = JSON.parse(readFileSync(WORLD_PATH, 'utf8'));
const CC = world.meta.chunkColumns;
const CR = world.meta.chunkRows;
const W = world.meta.worldChunksX * CC;
const H = world.meta.worldChunksY * CR;
const start = world.meta.playerStart;

const chunkAt = new Map(world.chunks.map((c) => [`${c.cx},${c.cy}`, c]));
const cellOf = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  const chunk = chunkAt.get(`${Math.floor(x / CC)},${Math.floor(y / CR)}`);
  if (!chunk) return null;
  return { chunk, lx: x % CC, ly: y % CR };
};
const walkableTerrain = (x, y) => {
  const c = cellOf(x, y);
  if (!c) return false;
  if (c.chunk.collisions[c.ly][c.lx]) return false;
  if (c.chunk.ground[c.ly][c.lx] === SEA_TILE_FRAME) return false;
  const up = c.chunk.upper[c.ly][c.lx];
  return up === null || !SOLID_UPPER.has(up);
};

// Hash inteiro + interpolação suave, os mesmos de place-enemies: nada pode variar entre rodadas.
const hash = (x, y, seed) => {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const fade = (t) => t * t * (3 - 2 * t);
const noise = (x, y, cell, seed) => {
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = fade(gx - x0);
  const fy = fade(gy - y0);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
};

// ── O que já ocupa ou protege um tile ─────────────────────────────────────────────────────────
// `blocked` é o mapa vivo do teste de clearance: começa com o mundo autorado e CRESCE com cada
// prop colocado nesta rodada (um prop novo é parede para o próximo candidato).
const blocked = new Set();
const occupied = new Set();
const protectedNear = []; // peças autoradas: nada nasce a menos de AUTHORED_CLEARANCE delas
for (const prop of world.props) {
  occupied.add(`${prop.worldX},${prop.worldY}`);
  blocked.add(`${prop.worldX},${prop.worldY}`);
  protectedNear.push(prop);
}
for (const chunk of world.chunks) {
  for (const list of [chunk.npcs ?? [], chunk.pickups ?? []]) {
    for (const e of list) {
      occupied.add(`${e.worldX},${e.worldY}`);
      protectedNear.push(e);
    }
  }
  for (const den of chunk.enemies ?? []) {
    // A cova precisa do tile dela livre (o corpo nasce ali) — mas ela não protege vizinhança.
    occupied.add(`${den.worldX},${den.worldY}`);
  }
}

const openAt = (x, y) => walkableTerrain(x, y) && !blocked.has(`${x},${y}`);
const openCardinals = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]]
  .filter(([dx, dy]) => openAt(x + dx, y + dy)).length;

/** Quantos tiles o spawn alcança com o conjunto atual de paredes (props incluídos). */
const reachableCount = () => {
  const seen = new Set([`${start.worldX},${start.worldY}`]);
  const queue = [[start.worldX, start.worldY]];
  let n = 0;
  while (queue.length > 0) {
    const [x, y] = queue.pop();
    n += 1;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key) || !walkableTerrain(nx, ny) || blocked.has(key)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return n;
};
let baselineReach = reachableCount();

const canPlace = (x, y) => {
  if (!walkableTerrain(x, y)) return false;
  if (occupied.has(`${x},${y}`)) return false;
  if (Math.abs(x - start.worldX) + Math.abs(y - start.worldY) <= CAMP_SAFE_TILES) return false;
  if (protectedNear.some((p) => Math.max(Math.abs(p.worldX - x), Math.abs(p.worldY - y)) < AUTHORED_CLEARANCE)) return false;
  // Guarda 1, barata: o prop entra e o tile ainda respira por 3 lados.
  if (openCardinals(x, y) < 3) return false;
  // Guarda 2, exata: o mundo alcançável perde no máximo o próprio tile do prop.
  blocked.add(`${x},${y}`);
  const after = reachableCount();
  blocked.delete(`${x},${y}`);
  return baselineReach - after <= 1;
};

const claim = (x, y) => {
  occupied.add(`${x},${y}`);
  blocked.add(`${x},${y}`);
  baselineReach = reachableCount();
};

// Os tiles de um chunk numa ordem embaralhada mas FIXA (varrer em ordem de leitura empilharia
// tudo no canto noroeste).
const shuffledTiles = (chunk, seed) => {
  const tiles = [];
  for (let ly = 0; ly < CR; ly++) {
    for (let lx = 0; lx < CC; lx++) {
      const x = chunk.cx * CC + lx;
      const y = chunk.cy * CR + ly;
      tiles.push({ x, y, k: hash(x, y, seed) });
    }
  }
  return tiles.sort((a, b) => a.k - b.k);
};

// ── A passagem ────────────────────────────────────────────────────────────────────────────────
copyFileSync(WORLD_PATH, `${WORLD_PATH}.backup-enrich-props`);

const existingByChunkType = new Map();
for (const prop of world.props) {
  const key = `${Math.floor(prop.worldX / CC)},${Math.floor(prop.worldY / CR)}:${prop.type}`;
  existingByChunkType.set(key, (existingByChunkType.get(key) ?? 0) + 1);
}

const added = {};
for (const field of PROP_FIELDS) {
  for (const chunk of world.chunks) {
    const target = field.at(noise(chunk.cx, chunk.cy, field.cell, field.seed));
    const have = existingByChunkType.get(`${chunk.cx},${chunk.cy}:${field.type}`) ?? 0;
    let need = target - have;
    if (need <= 0) continue;
    for (const t of shuffledTiles(chunk, field.seed)) {
      if (need <= 0) break;
      if (!canPlace(t.x, t.y)) continue;
      world.props.push({ type: field.type, worldX: t.x, worldY: t.y });
      claim(t.x, t.y);
      added[field.type] = (added[field.type] ?? 0) + 1;
      need -= 1;
    }
  }
}

// ── O machado, uma vez ────────────────────────────────────────────────────────────────────────
const hasAxe = world.chunks.some((c) => (c.pickups ?? []).some((p) => p.type === 'axe'));
if (!hasAxe) {
  // Espiral determinística a partir do alvo até um tile válido.
  let placed = null;
  for (let r = 0; r < 24 && !placed; r += 1) {
    const ring = [];
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        ring.push({ x: AXE_TARGET.worldX + dx, y: AXE_TARGET.worldY + dy });
      }
    }
    ring.sort((a, b) => hash(a.x, a.y, 0xa7e) - hash(b.x, b.y, 0xa7e));
    placed = ring.find((t) => canPlace(t.x, t.y)) ?? null;
  }
  if (placed) {
    const cx = Math.floor(placed.x / CC);
    const cy = Math.floor(placed.y / CR);
    const chunk = chunkAt.get(`${cx},${cy}`);
    chunk.pickups = chunk.pickups ?? [];
    chunk.pickups.push({ type: 'axe', worldX: placed.x, worldY: placed.y });
    claim(placed.x, placed.y);
    added.axe = `1 em (${placed.x},${placed.y})`;
  } else {
    added.axe = 'NÃO COUBE — investigue';
  }
}

// Ordem estável no arquivo: mesma entrada, mesmo JSON, diff limpo.
world.props.sort((a, b) => a.worldY - b.worldY || a.worldX - b.worldX || a.type.localeCompare(b.type));

writeFileSync(WORLD_PATH, JSON.stringify(world));
const totals = {};
for (const p of world.props) totals[p.type] = (totals[p.type] ?? 0) + 1;
console.log(`acrescentado: ${JSON.stringify(added)}`);
console.log(`props totais: ${JSON.stringify(totals)}`);
