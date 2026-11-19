// A PRAIA DO NORTE (pedido do autor, 2026-11-19): "na parte extrema superior do mapa, depois das serras existentes
// hoje. No astronauta ali faça um caminho, uma trilha subindo, que precisa de foice pra cortar o mato e abrir a trilha.
// Lá em cima aumente o tamanho do mapa e faça uma grande parte de fora a fora. Com faixa de areia completa, vida
// animal, árvores, coqueiros. E o mar."
//
// O MAPA CRESCE PARA O NORTE SEM RENUMERAR NADA: duas linhas de chunk novas ACIMA da linha 0 (`meta.originCy` = -2, ver
// world/worldSchema). Os tiles novos têm `worldY` de -24 a -1; toda coordenada que já existia continua valendo (as
// relíquias, os biomas, o acampamento, os saves).
//
// O QUE HÁ, DO SUL PARA O NORTE:
//   · A SERRA (linhas -1 a ~-6): a mata subindo o morro (relevo 6 e 7, ninguém pisa), a mesma que se via de fora.
//   · A TRILHA, ao norte da fogueira da Thea (x = 42): três tiles de pinheiro viram chão; uma escada sobe ao terraço,
//     outra ao CUME (o mirante, dois níveis acima), e duas descem a face norte até a duna. LIVRE do começo ao fim (o
//     autor, 2026-11-19: "faça o caminho para a praia totalmente livre, em que o herói pode ir em qualquer momento do
//     jogo"); a primeira versão tinha oito cortes de foice obrigatórios. O mato que sobrou no terraço é de enfeite, fora
//     do caminho.
//   · A FONTE TERMAL, numa gruta no pé da serra atrás do lago de lava (x 0..17): do corredor das minas entra-se nela,
//     cercada de paredões de mata alta, SEM NADA DA PRAIA À VISTA (ver SPRING). Só atravessando a lava.
//   · A DUNA (3 linhas): capim-da-praia, aveia-do-mar, salsa, e os primeiros coqueiros.
//   · A AREIA, de fora a fora, numa enseada: o mar chega mais perto no meio e recua nas pontas, onde dois pontais de
//     pedra fecham a praia. O que a maré deixa (conchas, estrela, sargaço, madeira) e os coqueiros em grupos.
//   · O MAR (o frame 33, que bloqueia): fora do mapa ele continua até o horizonte (WorldData.isVoidSea).
//
// A PROVA: sem ferramenta nenhuma, da fogueira da Thea se chega à areia, e toda a areia se alcança.
//
// IDEMPOTENTE e DETERMINÍSTICO (nenhum sorteio: tudo sai de um hash da coordenada). Backup, só na primeira vez, em
// backup/world-pre-praia-do-norte.json.
//
//   node scripts/praia-do-norte.mjs           # aplica
//   node scripts/praia-do-norte.mjs --check   # só confere
//   node scripts/praia-do-norte.mjs --map     # aplica e desenha o mapa em texto
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeCanStep } from './relevo.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const worldPath = path.resolve(here, '../public/world.json');
const backupPath = path.resolve(here, '../backup/world-pre-praia-do-norte.json');
const check = process.argv.includes('--check');
const showMap = process.argv.includes('--map');

const raw = fs.readFileSync(worldPath, 'utf8');
const world = JSON.parse(raw);
const { worldChunksX, chunkColumns: CW, chunkRows: CH } = world.meta;
const W = worldChunksX * CW;
/** As linhas novas: duas de chunk, 24 de tile. */
const NORTH_CHUNKS = 2;
const TOP = -NORTH_CHUNKS * CH;

// ── Os frames (src/game/constants.ts e world/biomes.ts) ─────────────────────────────────────────────────────────
const GRASS = 5;
const SEA = 33;
const SAND = 141;
const ROCK = 39;
const PINES = [4, 4, 14, 15, 16, 17, 18, 4];
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 73, 74, 39, 40]);
const DECOR = { grass: 145, seaOats: 146, vine: 147, shells: 148, starfish: 149, driftwood: 150, coconuts: 151, stones: 152, seaweed: 153 };

// ── O acaso que não é acaso ─────────────────────────────────────────────────────────────────────────────────────
const hash = (x, y, salt) => {
  let h = (x * 374761393 + y * 668265263 + salt * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const smooth = (t) => t * t * (3 - 2 * t);
/** Ruído suave em x (0..1), com `grain` tiles por nó. */
const noise1 = (x, grain, salt) => {
  const f = x / grain;
  const i = Math.floor(f);
  const t = smooth(f - i);
  return hash(i, 0, salt) * (1 - t) + hash(i + 1, 0, salt) * t;
};
const noise2 = (x, y, grain, salt) => {
  const fx = x / grain; const fy = y / grain;
  const ix = Math.floor(fx); const iy = Math.floor(fy);
  const tx = smooth(fx - ix); const ty = smooth(fy - iy);
  const top = hash(ix, iy, salt) * (1 - tx) + hash(ix + 1, iy, salt) * tx;
  const bot = hash(ix, iy + 1, salt) * (1 - tx) + hash(ix + 1, iy + 1, salt) * tx;
  return top * (1 - ty) + bot * ty;
};

// ── A forma da praia ────────────────────────────────────────────────────────────────────────────────────────────
/** A última linha de MAR em cada coluna (mar é y ≤ isto): a enseada chega mais ao sul no meio e recua nas pontas. */
const waterline = (x) => {
  const u = (x - 29.5) / 29.5;
  return Math.round(-18.8 - 2.3 * u * u + (noise1(x, 6, 3) - 0.5) * 1.3);
};
/** A TRILHA: o bloco da subida, colunas 37..48, linhas -8..-1 (ver a legenda em `PASS_LEGEND`). */
const PASS_X0 = 37;
const PASS = {
  [-1]: 'ttttt^tttttt',
  [-2]: 'FFFg111gFFFF',
  [-3]: 'FFFg11g1FFFF',
  [-4]: 'FFFFAFFFFFFF',
  [-5]: 'FHH8888888HF',
  [-6]: 'FFFFFFFFVFFF',
  [-7]: 'FFFFFFFF1FFF',
  [-8]: 'ttFFFFFFvFFt',
};
const PASS_X1 = PASS_X0 + PASS[-1].length - 1;
/**
 * A FONTE TERMAL (pedido do autor, 2026-11-19: "depois do lago de lava... ele atravessa o lago, chega do outro lado,
 * atravessa uma trilha e chega nessa fonte termal"). Do corredor das minas, atrás da lava
 * (scripts/minas-alem-da-lava.mjs), passa-se entre as pedras de minério e entra-se numa GRUTA no pé da serra: o chão no
 * nível de baixo, a água (4 × 2 tiles) no meio, e em volta paredões de dois andares cobertos de pinheiros.
 *
 * ZERO PRAIA À VISTA (o autor, no mesmo dia: "zero contato com a praia, zero visão da praia... separar experiências"). A
 * primeira versão era uma clareira no alto, de frente para o mar. A câmera do jogo alcança ~11 tiles ao norte do herói
 * no chão baixo, e a areia começa na linha -7: entre a gruta e a duna ficam três fileiras de mata ALTA (dois andares,
 * H), e para o leste a mesma mata alta desce até a beira da duna — a copa dos pinheiros tapa o que a câmera veria.
 * O MAPA CONTINUA RETANGULAR (regra do autor): a gruta é aberta DENTRO da serra, sem chunk novo.
 *
 * Legenda: t pinheiro no chão · F a serra de sempre (do gerador) · H mata no morro de dois andares · g chão de capim
 * (0) · d o deque de pedra (0) · w a água (0, com colisão: só se entra nela pelo Z, objects/spring/HotSpring) · L a
 * lanterna de pedra (deque, com colisão) · M o pé do bordo de outono (capim, com colisão).
 */
const SPRING_X0 = 0;
const SPRING = {
  [-1]: 'tgddddddgggtFFFFFF',
  [-2]: 'HMdwwwwLgggHHHHHHH',
  [-3]: 'HHgwwwwgggHHHHHHHH',
  [-4]: 'HHHHHHHHHHHHHHHHHH',
  [-5]: 'HHHHHHHHHHHHHHHHHH',
  [-6]: 'HHHHHHHHHHHHHHFFFF',
};
const SPRING_X1 = SPRING_X0 + SPRING[-1].length - 1;
/** De onde se parte, no corredor das minas (já do outro lado da lava). */
const SPRING_FROM = { x: 7, y: 1 };
const STONE_FLOOR = 23;
/** O pé da descida: o primeiro tile de duna; a coluna dela fica sem coqueiro até a areia. */
const TRAIL_EXIT = { x: 45, y: -9 };
/** Os três pinheiros ao norte da fogueira da Thea que viram chão (a cabeça da trilha). */
const TRAILHEAD = [{ x: 42, y: 3 }, { x: 42, y: 2 }, { x: 42, y: 1 }];

/** A linha mais ao norte da serra em cada coluna (a serra é de -1 até ela). No bloco da trilha, a do bloco. */
const ridgeEdge = (x) => (x >= PASS_X0 && x <= PASS_X1 ? -8 : -4 - Math.round(noise1(x, 4, 11) * 2.6));
/** Os pontais: até que coluna a pedra avança em cada linha (oeste: x ≤ isto; -1 = não há). */
const westHead = (y) => (y >= -12 ? 5 : y >= -16 ? 4 : y >= -19 ? 3 : y === -20 ? 2 : y === -21 ? 1 : y === -22 ? 0 : -1);
const eastHead = (y) => (y >= -11 ? 4 : y >= -17 ? 3 : y >= -20 ? 2 : y === -21 ? 1 : y === -22 ? 0 : -1);
const headland = (x, y) => {
  const w = westHead(y);
  const e = eastHead(y);
  if (x <= w) return { rim: x === w || westHead(y - 1) < x };
  if (x >= W - 1 - e) return { rim: x === W - 1 - e || eastHead(y - 1) < W - 1 - x };
  return null;
};
/** As pedras soltas: três grupos, medidos da linha d'água de cada coluna (dy > 0 na areia, ≤ 0 dentro do mar). */
const ROCK_GROUPS = [
  { x: 13, tiles: [[0, 1], [1, 1], [1, 0], [2, 0], [1, -1]] },
  { x: 36, tiles: [[0, 0], [1, 0], [1, -1], [2, -2]] },
  { x: 22, tiles: [[0, 4], [1, 4]] },
  { x: 50, tiles: [[0, -1], [1, -1], [0, -2]] },
];
const looseRocks = new Set();
for (const g of ROCK_GROUPS) {
  for (const [dx, dy] of g.tiles) looseRocks.add(`${g.x + dx},${waterline(g.x + dx) + dy}`);
}

// ── A geração ───────────────────────────────────────────────────────────────────────────────────────────────────
/** Um tile novo: chão, decoração, colisão, relevo, e o prop que nasce nele. */
const tileAt = (x, y) => {
  const pine = () => PINES[Math.floor(hash(x, y, 7) * PINES.length)];
  const forest = (code) => ({ ground: GRASS, upper: pine(), collision: true, relief: code });
  // A TRILHA
  if (x >= PASS_X0 && x <= PASS_X1 && PASS[y]) {
    const c = PASS[y][x - PASS_X0];
    if (c === 't') return forest(0);
    if (c === 'F') return forest(6);
    if (c === 'H') return forest(7);
    const open = (relief, prop) => ({ ground: GRASS, upper: null, collision: false, relief, prop });
    if (c === '^') return open(2);
    if (c === 'A') return open(9);
    if (c === 'V') return open(11);
    if (c === 'v') return open(4);
    if (c === '1') return open(1);
    if (c === 'g') return open(1, 'tallGrass');
    if (c === '8') return open(8);
    if (c === 'G') return open(8, 'tallGrass');
    throw new Error(`trilha: letra desconhecida "${c}" em ${x},${y}`);
  }
  // A FONTE TERMAL (a serra de sempre em volta dela cai no gerador abaixo)
  const springCode = x >= SPRING_X0 && x <= SPRING_X1 && SPRING[y] ? SPRING[y][x - SPRING_X0] : 'F';
  if (springCode !== 'F') {
    const c = springCode;
    if (c === 't') return forest(0);
    if (c === 'H') return forest(7);
    if (c === 'w') return { ground: STONE_FLOOR, upper: null, collision: true, relief: 0 };
    if (c === 'L') return { ground: STONE_FLOOR, upper: null, collision: true, relief: 0 };
    if (c === 'M') return { ground: GRASS, upper: null, collision: true, relief: 0 };
    const r = hash(x, y, 97);
    // o deque: pedra lisa; ao lado da água, um montinho de seixos aqui e ali
    if (c === 'd') {
      const byWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => SPRING[y + dy]?.[x + dx - SPRING_X0] === 'w');
      return { ground: STONE_FLOOR, upper: byWater && r < 0.34 ? DECOR.stones : null, collision: false, relief: 0 };
    }
    // o chão da gruta: capim, e um tufo aqui e ali
    if (c === 'g') return { ground: GRASS, upper: r < 0.45 ? (hash(x, y, 101) < 0.5 ? 0 : 1) : null, collision: false, relief: 0 };
    throw new Error(`fonte: letra desconhecida "${c}" em ${x},${y}`);
  }
  // O PÉ DA MATA DO VALE: a linha -1 é pinheiro no chão, a continuação da borda de sempre.
  if (y === -1) return forest(0);
  // OS PONTAIS: a beira é pedra (o cubo da serra), o miolo é mata no morro.
  const head = headland(x, y);
  if (head && y <= -2) {
    if (head.rim && y < ridgeEdge(x)) return { ground: GRASS, upper: ROCK, collision: true, relief: 0 };
    return forest(6);
  }
  // A SERRA: a mata no morro; o segundo nível só no miolo, nos picos.
  const edge = ridgeEdge(x);
  if (y >= edge) {
    const inner = y > edge && y < -2;
    return forest(inner && noise2(x, y, 3, 23) > 0.6 ? 7 : 6);
  }
  const wl = waterline(x);
  const rock = looseRocks.has(`${x},${y}`);
  // O MAR
  if (y <= wl) return { ground: SEA, upper: rock ? ROCK : null, collision: rock, relief: 0 };
  if (rock) return { ground: SAND, upper: ROCK, collision: true, relief: 0 };
  // A DUNA E A AREIA
  const fromRidge = edge - y; // 1 = encostado na serra
  const fromSea = y - wl; // 1 = encostado no mar
  const r = hash(x, y, 31);
  const trail = x === TRAIL_EXIT.x && y >= TRAIL_EXIT.y - 3; // a coluna da descida: livre
  if (x === TRAIL_EXIT.x && y === TRAIL_EXIT.y) return { ground: GRASS, upper: null, collision: false, relief: 0 };
  if (fromRidge <= 3) {
    // a duna: o capim cede à areia aos poucos, em manchas
    const grassy = fromRidge + (noise2(x, y, 3, 41) - 0.5) * 2.4 < 2.3;
    const ground = grassy ? GRASS : SAND;
    const clump = noise2(x, y, 4, 53);
    if (!trail && fromSea > 3 && clump > 0.46 && hash(x, y, 59) < 0.34) return { ground, upper: null, collision: false, relief: 0, prop: 'coconutPalm' };
    let upper = null;
    if (r < 0.3) upper = DECOR.grass;
    else if (r < 0.44) upper = DECOR.seaOats;
    else if (r < 0.56) upper = DECOR.vine;
    else if (grassy && r < 0.62) upper = hash(x, y, 61) < 0.5 ? 0 : 1;
    return { ground, upper, collision: false, relief: 0 };
  }
  // a areia aberta
  if (!trail && fromSea >= 4) {
    const clump = noise2(x, y, 5, 67);
    if (clump > 0.6 && hash(x, y, 71) < 0.3) return { ground: SAND, upper: null, collision: false, relief: 0, prop: 'coconutPalm' };
  }
  let upper = null;
  if (fromSea <= 2) upper = null; // a faixa que a onda lava fica limpa
  else if (fromSea === 3) upper = r < 0.13 ? DECOR.seaweed : r < 0.2 ? DECOR.shells : r < 0.23 ? DECOR.starfish : null; // a linha da maré
  else if (r < 0.03) upper = DECOR.shells;
  else if (r < 0.042 && fromSea <= 5) upper = DECOR.starfish;
  else if (r < 0.062) upper = DECOR.driftwood;
  else if (r < 0.077) upper = DECOR.stones;
  else if (r < 0.085) upper = DECOR.seaweed;
  else if (r < 0.12 && fromRidge <= 6) upper = hash(x, y, 73) < 0.6 ? DECOR.grass : DECOR.seaOats;
  return { ground: SAND, upper, collision: false, relief: 0 };
};

const tiles = new Map();
for (let y = TOP; y < 0; y += 1) for (let x = 0; x < W; x += 1) tiles.set(`${x},${y}`, tileAt(x, y));
// OS BOLSOS: um tile de areia cercado de pedra e mar (a quina de um pontal) não se alcança de lugar nenhum. Ele vira
// mar, se encosta no mar, ou pedra. Mede-se a partir do pé da descida, pelo chão da praia, sem contar os coqueiros.
{
  const floor = (t) => t && t.relief === 0 && !t.collision && t.ground !== SEA;
  const seen = new Set([`${TRAIL_EXIT.x},${TRAIL_EXIT.y - 1}`]);
  const queue = [{ x: TRAIL_EXIT.x, y: TRAIL_EXIT.y - 1 }];
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (seen.has(k) || !floor(tiles.get(k))) continue;
      seen.add(k);
      queue.push({ x: x + dx, y: y + dy });
    }
  }
  for (const [k, t] of tiles) {
    const [x, y] = k.split(',').map(Number);
    if (y > -9 || !floor(t) || seen.has(k)) continue;
    const bySea = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tiles.get(`${x + dx},${y + dy}`)?.ground === SEA);
    tiles.set(k, bySea ? { ground: SEA, upper: null, collision: false, relief: 0 } : { ground: t.ground, upper: ROCK, collision: true, relief: 0 });
  }
}
// Os cocos caídos: ao pé de um coqueiro, num vizinho de areia livre.
for (const [k, t] of [...tiles]) {
  if (t.prop !== 'coconutPalm') continue;
  const [x, y] = k.split(',').map(Number);
  if (hash(x, y, 83) > 0.4) continue;
  const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [1, 1]][Math.floor(hash(x, y, 89) * 4)];
  const n = tiles.get(`${x + dx},${y + dy}`);
  if (n && !n.prop && n.upper === null && !n.collision && n.ground !== SEA && n.relief === 0) n.upper = DECOR.coconuts;
}

// ── O mundo, montado ────────────────────────────────────────────────────────────────────────────────────────────
const oldChunks = world.chunks.filter((c) => c.cy >= 0);
// A cabeça da trilha: os três pinheiros viram chão livre (o mato que a primeira versão pôs ali sai).
const atHead = (p) => TRAILHEAD.some(({ x, y }) => p.worldX === x && p.worldY === y);
const oldProps = world.props.filter((p) => p.worldY >= 0 && !(p.type === 'tallGrass' && atHead(p)));
const oldAt = (x, y) => oldChunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
for (const { x, y } of TRAILHEAD) {
  const c = oldAt(x, y);
  c.upper[y - c.cy * CH][x - c.cx * CW] = null;
  c.collisions[y - c.cy * CH][x - c.cx * CW] = false;
}

const newChunks = [];
const newProps = [];
for (let cy = -NORTH_CHUNKS; cy < 0; cy += 1) {
  for (let cx = 0; cx < worldChunksX; cx += 1) {
    const chunk = { cx, cy, ground: [], upper: [], collisions: [], pickups: [], npcs: [] };
    const relief = [];
    for (let r = 0; r < CH; r += 1) {
      const g = []; const u = []; const col = []; const rel = [];
      for (let c = 0; c < CW; c += 1) {
        const x = cx * CW + c; const y = cy * CH + r;
        const t = tiles.get(`${x},${y}`);
        g.push(t.ground); u.push(t.upper); col.push(t.collision); rel.push(t.relief);
        if (t.prop) newProps.push({ type: t.prop, worldX: x, worldY: y });
      }
      chunk.ground.push(g); chunk.upper.push(u); chunk.collisions.push(col); relief.push(rel);
    }
    if (relief.some((row) => row.some((v) => v !== 0))) chunk.relief = relief;
    // a ordem das chaves dos chunks de sempre: cx, cy, ground, upper, collisions, (relief), pickups, npcs
    const { pickups, npcs, ...rest } = chunk;
    newChunks.push({ ...rest, pickups, npcs });
  }
}

// ── A prova ─────────────────────────────────────────────────────────────────────────────────────────────────────
const chunkOf = new Map([...newChunks, ...oldChunks].map((c) => [`${c.cx},${c.cy}`, c]));
const cell = (x, y) => {
  const c = chunkOf.get(`${Math.floor(x / CW)},${Math.floor(y / CH)}`);
  if (!c || x < 0 || x >= W) return null;
  const ly = y - c.cy * CH; const lx = x - c.cx * CW;
  return { ground: c.ground[ly][lx], upper: c.upper[ly][lx], collision: c.collisions[ly][lx], relief: c.relief ? c.relief[ly][lx] : 0 };
};
const allProps = [...oldProps, ...newProps];
const WALK_THROUGH = new Set(['plantSpot', 'bridgeSpot']);
const propAt = new Map();
for (const p of allProps) propAt.set(`${p.worldX},${p.worldY}`, p.type);
const npcAt = new Set(world.chunks.flatMap((c) => c.npcs).map((n) => `${n.worldX},${n.worldY}`));
const canStep = makeCanStep((x, y) => cell(x, y)?.relief ?? 0);
const reach = (scythe, start = { x: 43, y: 5 }) => {
  const open = (x, y) => {
    const t = cell(x, y);
    if (!t || t.collision || t.ground === SEA || (t.upper !== null && SOLID_UPPER.has(t.upper))) return false;
    if (npcAt.has(`${x},${y}`)) return false;
    const p = propAt.get(`${x},${y}`);
    if (!p || WALK_THROUGH.has(p)) return true;
    return p === 'tallGrass' && scythe;
  };
  // (o começo de sempre é ao lado da fogueira da Thea)
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy;
      const k = `${nx},${ny}`;
      if (seen.has(k) || ny > 12 || !open(nx, ny) || !canStep(x, y, nx, ny)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
};
const problems = [];
const noScythe = reach(false);
const withScythe = reach(true);
const beachKeys = [...tiles].filter(([, t]) => (t.ground === SAND || (t.ground === GRASS && t.relief === 0 && !t.collision && t.upper !== ROCK))
  && !t.prop && !t.collision).map(([k]) => k).filter((k) => Number(k.split(',')[1]) <= -9);
// a trilha é LIVRE: sem foice nenhuma se chega ao pé da descida (e cortar não abre nada a mais na subida)
if (!noScythe.has(`${TRAIL_EXIT.x},${TRAIL_EXIT.y - 1}`)) problems.push('sem a foice não se chega ao pé da descida: a trilha não está livre');
if (!withScythe.has(`${TRAIL_EXIT.x},${TRAIL_EXIT.y - 1}`)) problems.push('não se chega ao pé da descida');
// Um coqueiro que tranca um canto da areia sai (a praia inteira se alcança, sem ferramenta).
let stranded = beachKeys.filter((k) => !noScythe.has(k));
let removed = 0;
for (let guard = 0; guard < 40 && stranded.length > 0; guard += 1) {
  const near = newProps.findIndex((p) => p.type === 'coconutPalm' && stranded.some((k) => {
    const [x, y] = k.split(',').map(Number);
    return Math.abs(p.worldX - x) + Math.abs(p.worldY - y) === 1;
  }));
  if (near < 0) break;
  propAt.delete(`${newProps[near].worldX},${newProps[near].worldY}`);
  newProps.splice(near, 1);
  removed += 1;
  const again = reach(false);
  stranded = beachKeys.filter((k) => !again.has(k));
}
if (stranded.length > 0) problems.push(`areia que não se alcança: ${stranded.slice(0, 12).join(' ')}`);
// A subida passa pelos quatro lances, nesta ordem de altura, sem foice.
const final = reach(false);
for (const k of ['42,-1', '41,-4', '45,-6', '45,-8', '43,-5']) if (!final.has(k)) problems.push(`a trilha não passa por ${k}`);
// A fonte: do corredor das minas (do outro lado da lava) se sobe a escada e se chega a cada lado da água; do lado de
// cá da lava, não.
const spring = reach(false, SPRING_FROM);
const pool = [];
for (const [row, line] of Object.entries(SPRING)) {
  [...line].forEach((c, i) => { if (c === 'w') pool.push({ x: SPRING_X0 + i, y: Number(row) }); });
}
for (const k of ['7,-1', '4,-1', '1,-1', '2,-2', '2,-3', '7,-3', '9,-3', '10,-2']) if (!spring.has(k)) problems.push(`a fonte não se alcança do corredor: falta ${k}`);
for (const p of pool) {
  if (spring.has(`${p.x},${p.y}`)) problems.push(`a água da fonte em ${p.x},${p.y} se pisa`);
  const side = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => spring.has(`${p.x + dx},${p.y + dy}`));
  const inner = pool.some((q) => Math.abs(q.x - p.x) + Math.abs(q.y - p.y) === 1);
  if (!side && !inner) problems.push(`a água da fonte em ${p.x},${p.y} não encosta em nada`);
}
if (final.has('4,-1') || noScythe.has('4,-1')) problems.push('a fonte se alcança sem atravessar a lava');
// A borda norte é mar de ponta a ponta (é dela que o mar de fora continua).
for (let x = 0; x < W; x += 1) if (tiles.get(`${x},${TOP}`).ground !== SEA) problems.push(`a borda norte não é mar em x=${x}`);

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

world.meta.worldChunksY = oldChunks.reduce((m, c) => Math.max(m, c.cy), 0) + 1 + NORTH_CHUNKS;
world.meta.originCy = -NORTH_CHUNKS;
world.chunks = [...newChunks, ...oldChunks];
world.props = [...oldProps, ...newProps];

if (showMap) {
  const glyph = (x, y) => {
    const t = cell(x, y);
    const p = propAt.get(`${x},${y}`);
    if (p === 'coconutPalm') return 'Y';
    if (p === 'tallGrass') return 'w';
    if (t.ground === SEA) return t.upper === ROCK ? 'O' : '~';
    if (t.upper === ROCK) return 'O';
    if ([2, 4, 9, 11].includes(t.relief)) return '=';
    if (t.relief === 8) return '8';
    if (t.relief === 1) return '1';
    if (t.relief === 7) return 'M';
    if (t.relief === 6) return 'm';
    if (t.upper !== null && SOLID_UPPER.has(t.upper)) return 'T';
    if (t.ground === SAND) return t.upper === null ? '.' : ',';
    return t.upper === null ? ' ' : '"';
  };
  for (let y = TOP; y < 6; y += 1) {
    let row = '';
    for (let x = 0; x < W; x += 1) row += glyph(x, y);
    console.log(`${String(y).padStart(4)} ${row}`);
  }
}

const out = `${JSON.stringify(world, null, 2)}\n`;
const palms = newProps.filter((p) => p.type === 'coconutPalm').length;
const sand = [...tiles.values()].filter((t) => t.ground === SAND).length;
const sea = [...tiles.values()].filter((t) => t.ground === SEA).length;
const summary = `${W}×${-TOP} tiles novos (${sand} de areia, ${sea} de mar, ${palms} coqueiros${removed ? `, ${removed} tirados por trancar a areia` : ''}); `
  + `a trilha é livre, sem foice; ${beachKeys.length} tiles de praia, todos alcançáveis; a fonte termal (${pool.length} tiles `
  + `de água) só se alcança do corredor, depois da lava.`;
if (check) {
  if (out.trim() !== raw.split('\r\n').join('\n').trim()) {
    console.error('world.json NÃO é o ponto fixo de praia-do-norte.mjs');
    process.exit(1);
  }
  console.log(`world.json OK: a praia do norte está no mapa — ${summary}`);
} else {
  if (!fs.existsSync(backupPath) && out.trim() !== raw.split('\r\n').join('\n').trim()) {
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.writeFileSync(backupPath, raw);
  }
  fs.writeFileSync(worldPath, out);
  console.log(`world.json: a praia do norte — ${summary}`);
}
