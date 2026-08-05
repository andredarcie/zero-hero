// AS DUNGEONS GANHAM CORPO — povoa `public/levels/dungeon-1..9.json` com covas, corações e um
// TESOURO na sala mais funda. Rode com `node scripts/enrich-dungeons.mjs`.
//
// ⚠ Ele NÃO reescreve dungeon nenhuma: LÊ cada arquivo e ACRESCENTA em `chunk.enemies` e
// `chunk.pickups`. Terreno, colisão, paredes, o portal de saída e o playerStart não são tocados.
//
// ── POR QUE ELE EXISTE ────────────────────────────────────────────────────────────────────────
// As 9 dungeons eram 506 chunks de arquitetura pura: zero inimigos, zero itens, zero recompensa.
// Entrar num portal era uma viagem de ida e volta por um labirinto vazio. Agora cada dungeon é
// uma descida com corpo (a escada de espécies sobe com o número da dungeon) e um PORQUÊ: o
// tesouro na sala mais distante da entrada — as ferramentas que o overworld pede (picareta,
// balde, foice, o machado de aço) e, nas dungeons sem ferramenta nova, o kit de expedição
// (gravetos, pedras, corações).
//
// ── AS LEIS QUE ELE RESPEITA ──────────────────────────────────────────────────────────────────
//   • UMA ESPÉCIE POR CHUNK (a lei do bestiário) — o pool da dungeon escolhe por ruído.
//   • Sem zora: não há água aqui. Sem cova na sala da entrada nem colada no portal de saída.
//   • Bigslime só em sala grande (ele se divide; sala apertada viraria purê inescapável).
//   • Determinístico e idempotente: zero Math.random, alvos por chunk (o que existe conta),
//     tesouro só entra se a dungeon ainda não tem nenhum pickup que não seja coração.
//   • Coração é a cura da dungeon (fogueira não existe aqui): um por sala funda, espaçados.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 45, 46, 47, 48, 49, 50]);
const SEA_TILE_FRAME = 33;
/** Cova nem colada na entrada nem no portal: os primeiros passos de uma sala são leitura, não briga. */
const ENTRANCE_CLEAR_TILES = 6;
const DEN_MIN_SPACING = 2;

/**
 * A escada da descida: o pool de espécies sobe com o número da dungeon — as primeiras ensinam o
 * corpo mais fraco (morcego, gosma), as últimas cobram o repertório inteiro (mago, torreta).
 * `dens` é o alvo por sala; `treasure` é o que espera na sala mais funda.
 */
const DUNGEONS = {
  1: { kinds: ['bat', 'slime'], dens: 1, treasure: [['pickaxe', 1]] },
  2: { kinds: ['slime', 'spider'], dens: 1, treasure: [['bucket', 1]] },
  3: { kinds: ['spider', 'undead'], dens: 2, treasure: [['scythe', 1]] },
  4: { kinds: ['undead', 'bat'], dens: 2, treasure: [['wood', 3]] },
  5: { kinds: ['undead', 'spider', 'slime'], dens: 2, treasure: [['wood', 3], ['heart', 1]] },
  6: { kinds: ['undead', 'mage'], dens: 2, treasure: [['greatAxe', 1]] },
  7: { kinds: ['bigslime', 'undead'], dens: 2, treasure: [['stone', 3], ['heart', 1]] },
  8: { kinds: ['turret', 'undead'], dens: 2, treasure: [['wood', 4], ['heart', 1]] },
  9: { kinds: ['mage', 'turret', 'bigslime', 'undead'], dens: 2, treasure: [['heart', 2], ['wood', 2], ['stone', 2]] },
};
/** Um coração a cada tantas salas fundas (metade mais distante do BFS). */
const ROOMS_PER_HEART = 5;
/** Sala apertada não recebe bigslime (ele multiplica) nem segunda cova. */
const SMALL_ROOM_TILES = 25;

const hash = (x, y, seed) => {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

for (const [levelStr, cfg] of Object.entries(DUNGEONS)) {
  const level = Number(levelStr);
  const path = fileURLToPath(new URL(`../public/levels/dungeon-${level}.json`, import.meta.url));
  const world = JSON.parse(readFileSync(path, 'utf8'));
  const CC = world.meta.chunkColumns;
  const CR = world.meta.chunkRows;
  const W = world.meta.worldChunksX * CC;
  const H = world.meta.worldChunksY * CR;
  const start = world.meta.playerStart;

  const chunkAt = new Map(world.chunks.map((c) => [`${c.cx},${c.cy}`, c]));
  const walkable = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const c = chunkAt.get(`${Math.floor(x / CC)},${Math.floor(y / CR)}`);
    if (!c) return false;
    const lx = x % CC;
    const ly = y % CR;
    if (c.collisions[ly][lx]) return false;
    if (c.ground[ly][lx] === SEA_TILE_FRAME) return false;
    const up = c.upper[ly][lx];
    return up === null || !SOLID_UPPER.has(up);
  };

  // BFS da entrada: a distância de cada tile é o que define "sala funda" e onde mora o tesouro.
  const dist = new Map([[`${start.worldX},${start.worldY}`, 0]]);
  const queue = [[start.worldX, start.worldY]];
  while (queue.length > 0) {
    const [x, y] = queue.shift();
    const d = dist.get(`${x},${y}`);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (dist.has(key) || !walkable(nx, ny)) continue;
      dist.set(key, d + 1);
      queue.push([nx, ny]);
    }
  }

  const occupied = new Set();
  for (const prop of world.props) occupied.add(`${prop.worldX},${prop.worldY}`);
  for (const chunk of world.chunks) {
    for (const list of [chunk.npcs ?? [], chunk.pickups ?? [], chunk.enemies ?? []]) {
      for (const e of list) occupied.add(`${e.worldX},${e.worldY}`);
    }
  }
  const portal = world.props.find((p) => p.type === 'levelPortal');
  const nearDoor = (x, y) =>
    Math.hypot(x - start.worldX, y - start.worldY) <= ENTRANCE_CLEAR_TILES
    || (portal && Math.hypot(x - portal.worldX, y - portal.worldY) <= ENTRANCE_CLEAR_TILES);

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

  // ── O TESOURO na sala mais funda ────────────────────────────────────────────────────────────
  // O tile mais distante alcançável; os itens pousam nele e nos vizinhos livres em espiral.
  const report = { level, dens: 0, hearts: 0, treasure: null };
  const hasTreasure = world.chunks.some((c) => (c.pickups ?? []).some((p) => p.type !== 'heart'));
  if (!hasTreasure) {
    let far = null;
    for (const [key, d] of dist) {
      if (occupied.has(key)) continue;
      if (!far || d > far.d) far = { key, d };
    }
    if (far) {
      const [fx, fy] = far.key.split(',').map(Number);
      const spots = [];
      for (let r = 0; r < 6 && spots.length < 9; r += 1) {
        for (let dy = -r; dy <= r; dy += 1) {
          for (let dx = -r; dx <= r; dx += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const x = fx + dx;
            const y = fy + dy;
            const key = `${x},${y}`;
            if (!dist.has(key) || occupied.has(key)) continue;
            if (spots.some((s) => s.x === x && s.y === y)) continue;
            spots.push({ x, y });
          }
        }
      }
      let i = 0;
      for (const [type, count] of cfg.treasure) {
        for (let n = 0; n < count && i < spots.length; n += 1, i += 1) {
          const spot = spots[i];
          const chunk = chunkAt.get(`${Math.floor(spot.x / CC)},${Math.floor(spot.y / CR)}`);
          chunk.pickups = chunk.pickups ?? [];
          chunk.pickups.push({ type, worldX: spot.x, worldY: spot.y });
          occupied.add(`${spot.x},${spot.y}`);
        }
      }
      report.treasure = `${cfg.treasure.map(([t, n]) => `${t}x${n}`).join('+')} @ (${fx},${fy}) dist ${far.d}`;
    }
  }

  // ── AS COVAS, uma espécie por sala ──────────────────────────────────────────────────────────
  const roomsByDepth = [];
  for (const chunk of world.chunks) {
    const tiles = shuffledTiles(chunk, 0x5eed).filter((t) => dist.has(`${t.x},${t.y}`));
    if (tiles.length === 0) continue;
    const depth = Math.min(...tiles.map((t) => dist.get(`${t.x},${t.y}`)));
    roomsByDepth.push({ chunk, tiles, depth });
  }
  roomsByDepth.sort((a, b) => a.depth - b.depth);

  for (const room of roomsByDepth) {
    const { chunk, tiles } = room;
    const existing = chunk.enemies ?? [];
    const small = tiles.length < SMALL_ROOM_TILES;
    const target = small ? Math.min(1, cfg.dens) : cfg.dens;
    if (existing.length >= target) continue;

    // A espécie da sala: a que já existe, ou a que o ruído escolhe no pool da dungeon —
    // filtrado para salas pequenas (bigslime precisa de espaço para as metades).
    let kind;
    if (existing.length > 0) {
      [kind] = existing.map((e) => e.type);
    } else {
      const pool = cfg.kinds.filter((k) => !(small && k === 'bigslime'));
      const n = hash(chunk.cx, chunk.cy, 0xd06 + level);
      kind = pool[Math.min(pool.length - 1, Math.floor(n * pool.length))] ?? 'undead';
    }

    const dens = [...existing];
    for (const t of tiles) {
      if (dens.length >= target) break;
      const key = `${t.x},${t.y}`;
      if (occupied.has(key) || nearDoor(t.x, t.y)) continue;
      if (!dens.every((d) => Math.max(Math.abs(d.worldX - t.x), Math.abs(d.worldY - t.y)) >= DEN_MIN_SPACING)) continue;
      dens.push({ type: kind, worldX: t.x, worldY: t.y });
      occupied.add(key);
      report.dens += 1;
    }
    dens.sort((a, b) => a.worldY - b.worldY || a.worldX - b.worldX);
    chunk.enemies = dens;
  }

  // ── OS CORAÇÕES das salas fundas (a única cura aqui dentro) ─────────────────────────────────
  const deepRooms = roomsByDepth.filter((r) => r.depth > 0).slice(-Math.ceil(roomsByDepth.length / 2));
  const heartTarget = Math.max(1, Math.floor(deepRooms.length / ROOMS_PER_HEART));
  const existingHearts = world.chunks.reduce(
    (n, c) => n + (c.pickups ?? []).filter((p) => p.type === 'heart').length, 0,
  );
  let need = heartTarget - existingHearts;
  for (let i = 0; i < deepRooms.length && need > 0; i += Math.max(1, ROOMS_PER_HEART)) {
    const room = deepRooms[i];
    const spot = room.tiles.find((t) => !occupied.has(`${t.x},${t.y}`) && !nearDoor(t.x, t.y));
    if (!spot) continue;
    room.chunk.pickups = room.chunk.pickups ?? [];
    room.chunk.pickups.push({ type: 'heart', worldX: spot.x, worldY: spot.y });
    occupied.add(`${spot.x},${spot.y}`);
    report.hearts += 1;
    need -= 1;
  }

  writeFileSync(path, JSON.stringify(world));
  console.log(
    `dungeon-${level}: +${report.dens} covas, +${report.hearts} coracoes, tesouro: ${report.treasure ?? 'ja existia'}`,
  );
}
