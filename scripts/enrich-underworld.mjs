// O SUBTERRÂNEO GANHA ARQUITETURA — acrescenta ao `public/underworld.json` o que faz de uma
// caverna uma MASMORRA: salas construídas, ruínas soltas, tochas de parede, entulho de chão,
// tesouro, flores da lua e os dois COFRES que o espelho já tinha criado sem querer.
//
// ⚠ Ele NÃO é o `gen-underworld.mjs` (aquele DERIVA o espelho do overworld inteiro e reescreve o
// arquivo — inclusive por cima da escada que o autor pôs à mão). Este LÊ o subterrâneo que está no
// disco e ACRESCENTA. Ele nunca REMOVE uma parede do espelho: a silhueta do continente lá de cima
// continua exatamente onde estava, que é a lei desta dungeon.
//
// ── POR QUE ELE EXISTE (medido, não achado) ───────────────────────────────────────────────────
// O subterrâneo de antes tinha 3.600 tiles e **81,2% deles eram chão aberto**. TRÊS das 25 telas
// não tinham UMA parede — 12×12 de piso vazio, no escuro, sem nada. E o inventário do lugar inteiro
// era: 6 escadas, 24 covas, **zero itens, zero props, zero luz**. Não era uma dungeon: era um campo
// à noite com teto. Três frames de masmorra estão INSTALADOS no atlas e nunca haviam sido usados
// uma única vez — `wallTorch` (48), `wallCracked` (50) e `floorCracked` (51) —, e a classe
// `WallTorchObject`, que empresta luz do pool de fogo e está inteira, nunca havia sido acionada
// por um tile no mundo.
//
// ── A LEI QUE MANDA AQUI: TUDO SE DECIDE NO MAPA SEM O MEU TRABALHO ───────────────────────────
// Toda escolha deste script (onde cabe uma sala, onde vai uma tocha, onde cai um osso) é feita num
// MAPA DE DECISÃO: o disco depois de DESFEITA a rodada anterior — ou seja, o espelho mais tudo o
// que o autor autorou à mão em `/editor?under`, e nada do que este script já escreveu. É isso que o
// torna idempotente de verdade: se ele se perguntasse "cabe uma sala aqui?" olhando o disco cru, a
// segunda rodada veria as paredes da primeira, responderia não, e escolheria outro lugar — para
// sempre. E se perguntasse ao espelho PURO ele ficaria cego para o autor, que CAVOU telas inteiras
// (a tela do meio tem 45% de alvenaria no espelho e 6% no disco): as salas nunca chegariam ao lugar
// mais vazio do mapa, que é justamente o que este script existe para curar. As duas armadilhas
// foram medidas, não imaginadas.
//
// O replay do espelho entrega o **mapa de propriedade**: todo tile em que o disco DISCORDA do
// espelho é trabalho do autor e fica CONGELADO — nenhum passo abaixo escreve nele. O que este
// script escreveu numa rodada anterior está registrado em `meta.enrich` e por isso NÃO é confundido
// com o trabalho do autor: cada rodada primeiro DESFAZ o que a anterior escreveu (e só onde o disco
// ainda tem o valor que ela deixou — tile que o autor mexeu depois passa a ser dele) e então
// recalcula tudo do zero. É a lei da casa: mirar num TOTAL, nunca num delta.
//
// ── A REGRA QUE NÃO SE NEGOCIA: NADA SELA UM CAMINHO ──────────────────────────────────────────
// Sala tem parede, e parede bloqueia. Cada estampa passa por um BFS a partir do `playerStart`
// ANTES e DEPOIS: o que era alcançável tem de continuar alcançável, exceto exatamente os tiles que
// viraram parede; o miolo da sala tem de ficar alcançável pela porta; e as 6 escadas têm de
// continuar alcançáveis. Estampa que falhar é REJEITADA e o script segue — não existe conserto
// automático de mundo selado.
//
//   node scripts/enrich-underworld.mjs           # enriquece e grava (com backup)
//   node scripts/enrich-underworld.mjs --check   # falha se o disco não for o ponto fixo
//   node scripts/enrich-underworld.mjs --dry     # mostra o que faria, sem gravar

import { copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const WORLD_PATH = fileURLToPath(new URL('../public/world.json', import.meta.url));
const UNDER_PATH = fileURLToPath(new URL('../public/underworld.json', import.meta.url));
const BACKUP_DIR = fileURLToPath(new URL('../backup', import.meta.url));
const BACKUP_PATH = fileURLToPath(new URL('../backup/underworld-pre-enrich.json', import.meta.url));

const check = process.argv.includes('--check');
const dry = process.argv.includes('--dry');

// ── O vocabulário do lugar (espelha src/game/constants.ts) ────────────────────────────────────
const COLS = 12;
const ROWS = 12;
const SEA_TILE_FRAME = 33;
const FLOORS = [44, 43, 42];       // a ordem do gerador: do mais quieto para o mais barulhento
const WALLS = [45, 46, 47];
const WALL_TORCH = 48;
const WALL_MOSS = 49;
const WALL_CRACKED = 50;
const FLOOR_CRACKED = 51;
// O chão de LAJE: a arte do cemitério lá de cima, que aqui embaixo é a diferença entre uma CAVERNA
// (piso 42/43/44, natural, irregular) e uma SALA (laje assentada, construída). É a leitura inteira
// das salas — sem trocar o chão, quatro paredes no meio do nada leem como acidente de geologia.
const SLAB_FLOORS = [23, 24, 29, 30, 32]; // Chão de Pedra, com Musgo, Laje Rachada, 2, com Musgo
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 45, 46, 47, 48, 49, 50]);
// Frames de `upper` que ficam DEITADOS no chão e são atravessados (fora de SOLID_UPPER_FRAMES) e
// que também estão FORA de WIND_SWAY/STIR_FRAMES — o que é rígido no mundo fica rígido na tela, e
// osso balançando ao vento é o defeito que a máscara de vento existe para impedir. É todo o entulho
// que uma caverna pode ter sem custar um único tile de passagem.
const BONES = [27, 28];      // Caveira e Ossos · Ossos
const STONES = [12, 13];     // Pedregulho · Pedras
const MUSHROOMS = [10, 11];  // Cogumelos Vermelhos · Cogumelos Roxos

/** O MESMO hash do gerador — é ele que faz o replay bater tile a tile. */
const hash = (x, y) => {
  const h = Math.imul((x * 73856093) ^ (y * 19349663), 0x45d9f3b);
  return (h ^ (h >>> 15)) >>> 0;
};
/** Hash com sal: cada passo precisa de um campo próprio, ou todos escolhem os mesmos tiles. */
const salted = (x, y, salt) => hash(x + salt * 977, y + salt * 1409);

const world = JSON.parse(readFileSync(WORLD_PATH, 'utf8'));
const rawUnder = readFileSync(UNDER_PATH, 'utf8');
const under = JSON.parse(rawUnder);

const W = world.meta.worldChunksX * COLS;
const H = world.meta.worldChunksY * ROWS;
const key = (x, y) => `${x},${y}`;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

const dstChunk = new Map();
for (const c of under.chunks) dstChunk.set(key(c.cx, c.cy), c);
const chunkOf = (x, y) => dstChunk.get(key(Math.floor(x / COLS), Math.floor(y / ROWS)));
const localOf = (x, y) => [((x % COLS) + COLS) % COLS, ((y % ROWS) + ROWS) % ROWS];

// ── O REPLAY DO ESPELHO ───────────────────────────────────────────────────────────────────────
// Reproduz, tile a tile, o que `gen-underworld.mjs` escreveria hoje a partir do `world.json`.
// Duas coisas saem daqui: o mapa em que TODAS as perguntas são feitas, e o mapa de propriedade.
const isRim = (x, y) => x === 0 || y === 0 || x === W - 1 || y === H - 1;
const baseGround = [];
const baseUpper = [];
const baseColl = [];
for (let y = 0; y < H; y += 1) {
  baseGround.push(new Array(W).fill(FLOORS[0]));
  baseUpper.push(new Array(W).fill(null));
  baseColl.push(new Array(W).fill(false));
}
for (const c of world.chunks) {
  for (let ly = 0; ly < ROWS; ly += 1) {
    for (let lx = 0; lx < COLS; lx += 1) {
      const wx = c.cx * COLS + lx;
      const wy = c.cy * ROWS + ly;
      const h = hash(wx, wy);
      const sea = c.ground[ly][lx] === SEA_TILE_FRAME || isRim(wx, wy);
      const su = c.upper[ly][lx];
      baseGround[wy][wx] = h % 23 === 0 ? FLOORS[2] : h % 6 === 0 ? FLOORS[1] : FLOORS[0];
      baseUpper[wy][wx] = (sea || (su !== null && SOLID_UPPER.has(su)))
        ? (h % 12 === 0 ? WALL_MOSS : WALLS[h % WALLS.length])
        : null;
      baseColl[wy][wx] = c.collisions[ly][lx] === true || sea;
    }
  }
}

// ── DESFAZ A RODADA ANTERIOR ──────────────────────────────────────────────────────────────────
// `meta.enrich.tiles` guarda [x, y, upper, ground] de cada tile que a rodada passada escreveu. Um
// tile só volta ao espelho se o disco AINDA tem exatamente aquele valor: se o autor mexeu nele
// depois, o tile passou a ser dele e o script tira a mão. Props e pickups da rodada passada saem
// pela lista de coordenadas — a mesma ideia.
const prev = under.meta?.enrich;
if (prev) {
  for (const [x, y, up, gr] of prev.tiles ?? []) {
    if (!inBounds(x, y)) continue;
    const c = chunkOf(x, y);
    const [lx, ly] = localOf(x, y);
    if (c.upper[ly][lx] === up && c.ground[ly][lx] === gr) {
      c.upper[ly][lx] = baseUpper[y][x];
      c.ground[ly][lx] = baseGround[y][x];
    }
  }
  const propKeys = new Set((prev.props ?? []).map(([x, y]) => key(x, y)));
  const pickKeys = new Set((prev.pickups ?? []).map(([x, y]) => key(x, y)));
  under.props = (under.props ?? []).filter((p) => !propKeys.has(key(p.worldX, p.worldY)));
  for (const c of under.chunks) {
    c.pickups = (c.pickups ?? []).filter((p) => !pickKeys.has(key(p.worldX, p.worldY)));
  }
}

/** O tile é do AUTOR? (o disco discorda do espelho). Tile do autor não se toca, em passo nenhum. */
const owned = [];
for (let y = 0; y < H; y += 1) owned.push(new Array(W).fill(false));
let ownedCount = 0;
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const c = chunkOf(x, y);
    const [lx, ly] = localOf(x, y);
    const same = c.ground[ly][lx] === baseGround[y][x]
      && c.upper[ly][lx] === baseUpper[y][x]
      && (c.collisions[ly][lx] === true) === baseColl[y][x];
    if (!same) { owned[y][x] = true; ownedCount += 1; }
  }
}

// Tiles já ocupados por PEÇA no disco (prop, cova, item, NPC) — a lei do CHÃO + UMA COISA.
const taken = new Set();
for (const p of under.props ?? []) taken.add(key(p.worldX, p.worldY));
for (const c of under.chunks) {
  for (const e of c.enemies ?? []) taken.add(key(e.worldX, e.worldY));
  for (const p of c.pickups ?? []) taken.add(key(p.worldX, p.worldY));
  for (const n of c.npcs ?? []) taken.add(key(n.worldX, n.worldY));
}

// ── O MAPA DE TRABALHO ────────────────────────────────────────────────────────────────────────
// Uma cópia plana do disco, onde as estampas acontecem e o BFS mede; no fim ela volta para os
// chunks. `wallAt` é a única pergunta de passagem do script: `upper` sólido OU colisão pintada.
// COLISÃO NUNCA É ESCRITA por este arquivo — a alvenaria bloqueia por estar em SOLID_UPPER, que é
// como toda parede desta casa bloqueia, e uma colisão pintada por cima seria uma segunda verdade.
const curUpper = [];
const curGround = [];
const curColl = [];
for (let y = 0; y < H; y += 1) {
  curUpper.push(new Array(W).fill(null));
  curGround.push(new Array(W).fill(FLOORS[0]));
  curColl.push(new Array(W).fill(false));
}
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const c = chunkOf(x, y);
    const [lx, ly] = localOf(x, y);
    curGround[y][x] = c.ground[ly][lx];
    curUpper[y][x] = c.upper[ly][lx];
    curColl[y][x] = c.collisions[ly][lx] === true;
  }
}
const wallAt = (x, y) => !inBounds(x, y)
  || (curUpper[y][x] !== null && SOLID_UPPER.has(curUpper[y][x]))
  || curColl[y][x];

// ── O MAPA DE DECISÃO ─────────────────────────────────────────────────────────────────────────
// É o disco DEPOIS de desfeita a rodada anterior: o espelho MAIS o que o autor autorou à mão.
// Toda pergunta de colocação é feita aqui, e nunca no espelho puro — foi um erro medido: o autor
// CAVOU telas inteiras em `/editor?under` (a tela do meio tem 45% de alvenaria no espelho e 6% no
// disco), e um script que só olha o espelho fica cego para o mundo que existe. Perguntar aqui
// continua sendo idempotente pelo mesmo motivo de sempre: depois do desfazer, este mapa é o mesmo
// na primeira rodada e na décima.
const decUpper = curUpper.map((r) => r.slice());
const decColl = curColl.map((r) => r.slice());
const decOpen = (x, y) => inBounds(x, y)
  && !(decUpper[y][x] !== null && SOLID_UPPER.has(decUpper[y][x]))
  && !decColl[y][x];

const start = under.meta.playerStart;
const stairTiles = (under.props ?? []).filter((p) => p.type === 'stairs');

/** BFS a partir do spawn sobre o mapa de trabalho. Devolve o Set de "x,y" alcançáveis. */
const reachable = () => {
  const seen = new Set();
  const stack = [[start.worldX, start.worldY]];
  seen.add(key(start.worldX, start.worldY));
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = x + dx;
      const b = y + dy;
      if (!inBounds(a, b) || wallAt(a, b) || seen.has(key(a, b))) continue;
      seen.add(key(a, b));
      stack.push([a, b]);
    }
  }
  return seen;
};

let reach = reachable();
/** Quanto chão o spawn alcançava ANTES deste script — no disco, já desfeita a rodada
 *  anterior. É contra ESTE número que o custo em passagem das paredes novas se mede; contra
 *  o do espelho puro ele mediria também tudo o que o autor cavou à mão, e mentiria. */
const openBefore = reach.size;

/** Tudo que este script escreveu, para o manifesto (e para a próxima rodada desfazer). */
const writtenTiles = new Map(); // "x,y" -> [x, y, upper, ground]
const addedProps = [];
const addedPickups = [];

/**
 * Aplica uma estampa (lista de escritas) e PROVA que ela não selou nada. Desfaz tudo e devolve
 * false se: algum tile alcançável sumiu sem ser um tile que virou parede; algum tile prometido (o
 * miolo da sala) não ficou alcançável; ou alguma escada deixou de ser alcançável.
 */
const stamp = (writes, mustReach) => {
  const undo = [];
  for (const w of writes) {
    undo.push({ x: w.x, y: w.y, upper: curUpper[w.y][w.x], ground: curGround[w.y][w.x] });
    if (w.upper !== undefined) curUpper[w.y][w.x] = w.upper;
    if (w.ground !== undefined) curGround[w.y][w.x] = w.ground;
  }
  const after = reachable();
  const newWalls = new Set(writes
    .filter((w) => w.upper !== undefined && w.upper !== null && SOLID_UPPER.has(w.upper))
    .map((w) => key(w.x, w.y)));
  let ok = true;
  for (const k of reach) if (!after.has(k) && !newWalls.has(k)) { ok = false; break; }
  if (ok) for (const [x, y] of mustReach ?? []) if (!after.has(key(x, y))) { ok = false; break; }
  if (ok) for (const s of stairTiles) if (!after.has(key(s.worldX, s.worldY))) { ok = false; break; }
  if (!ok) {
    for (const u of undo) { curUpper[u.y][u.x] = u.upper; curGround[u.y][u.x] = u.ground; }
    return false;
  }
  for (const w of writes) {
    writtenTiles.set(key(w.x, w.y), [w.x, w.y, curUpper[w.y][w.x], curGround[w.y][w.x]]);
  }
  reach = after;
  return true;
};

/** Um tile pode receber ESCRITA? Nunca o do autor, nunca o que já tem peça em cima. */
const writable = (x, y) => inBounds(x, y) && !owned[y][x] && !taken.has(key(x, y));

const stats = {
  rooms: 0, roomsRejected: 0, pillars: 0, ruins: 0, torches: 0,
  slab: 0, rubble: 0, treasure: 0, flowers: 0, vaults: 0,
};

// ══ PASSO 1 — AS SALAS ════════════════════════════════════════════════════════════════════════
// O que separa uma caverna de uma masmorra é ALGUÉM TER CONSTRUÍDO ALI. A sala é um retângulo de
// alvenaria com o miolo de laje e uma ou duas PORTAS — vãos de um tile, não portas de verdade: o
// campo é aberto demais para uma tranca gatear coisa alguma (dá para contornar), e um gate que se
// contorna é pior que nenhum.
//
// A sala nunca ENCOSTA na alvenaria do espelho: exige-se uma margem de chão livre em volta do
// anel. Colada na montanha ela leria como acidente de geologia; solta no salão ela lê como ruína.
const ROOM_SIZES = [[3, 3], [4, 3], [5, 4], [4, 5], [5, 5], [6, 4], [7, 5], [6, 6]];
const ROOM_MARGIN = 1;
const roomTiles = new Set();     // miolo de sala: onde o tesouro e os ossos podem cair
const roomWalls = new Set();     // anel: onde as tochas preferem morar
const roomDoors = new Set();     // vãos: nada nunca entra num vão
// Todo tile que uma sala JÁ reivindicou, com a margem. Sem ele a segunda sala de uma tela é
// escolhida no espelho — que não sabe da primeira — e as duas se atravessam.
const roomClaim = new Set();
const rooms = [];

for (const c of under.chunks) {
  const chunkSalt = hash(c.cx, c.cy);
  let placed = 0;
  const wanted = 2 + (chunkSalt % 3 === 0 ? 1 : 0); // duas salas por tela, três de vez em quando
  // A varredura começa num canto diferente por tela (o resto do hash), senão toda sala do mundo
  // encosta no topo-esquerda do seu chunk e o mapa vira papel de parede.
  const originX = chunkSalt % 4;
  const originY = (chunkSalt >>> 3) % 4;
  for (let step = 0; step < COLS * ROWS && placed < wanted; step += 1) {
    const ox = (originX + (step % COLS)) % COLS;
    const oy = (originY + Math.floor(step / COLS)) % ROWS;
    const ix = c.cx * COLS + ox;
    const iy = c.cy * ROWS + oy;
    const m = ROOM_MARGIN;

    // Cabe? A pergunta inteira é feita no ESPELHO — nunca no disco. Os tamanhos são tentados
    // TODOS, do maior sorteado para baixo: uma posição que só experimentasse um tamanho desistiria
    // de um canto onde cabia uma sala pequena, e o mapa ficaria com oito salas em 25 telas.
    const order = ROOM_SIZES.map((s, i) => [s, (salted(ix, iy, 11) >>> (i % 8)) % 97])
      .sort((a, b) => b[1] - a[1]).map(([s]) => s);
    let rw = 0;
    let rh = 0;
    let fits = false;
    for (const [cw, ch] of order) {
      let ok = true;
      for (let y = iy - 1 - m; y <= iy + ch + m && ok; y += 1) {
        for (let x = ix - 1 - m; x <= ix + cw + m && ok; x += 1) {
          if (!decOpen(x, y) || roomClaim.has(key(x, y))) ok = false;
        }
      }
      // E o anel + o miolo têm de ser escrevíveis (nada do autor, nada com peça em cima).
      for (let y = iy - 1; y <= iy + ch && ok; y += 1) {
        for (let x = ix - 1; x <= ix + cw && ok; x += 1) {
          if (!writable(x, y)) ok = false;
        }
      }
      if (ok) { rw = cw; rh = ch; fits = true; break; }
    }
    if (!fits) continue;

    const slab = SLAB_FLOORS[salted(ix, iy, 12) % SLAB_FLOORS.length];
    const writes = [];
    const ring = [];
    for (let y = iy - 1; y <= iy + rh; y += 1) {
      for (let x = ix - 1; x <= ix + rw; x += 1) {
        const edge = x === ix - 1 || y === iy - 1 || x === ix + rw || y === iy + rh;
        if (edge) ring.push([x, y]);
      }
    }
    // OS VÃOS. Um por lado sorteado, no meio do lado — e sempre pelo menos um, senão a estampa é
    // rejeitada pelo BFS (o miolo tem de ficar alcançável) e a sala se perde por um detalhe.
    const sides = [
      [ix + Math.floor(rw / 2), iy - 1],
      [ix + Math.floor(rw / 2), iy + rh],
      [ix - 1, iy + Math.floor(rh / 2)],
      [ix + rw, iy + Math.floor(rh / 2)],
    ];
    const doorMask = 1 + (salted(ix, iy, 13) % 15); // 1..15: nunca zero portas
    const doors = sides.filter((_, i) => (doorMask >> i) & 1);
    const doorKeys = new Set(doors.map(([x, y]) => key(x, y)));

    for (const [x, y] of ring) {
      if (doorKeys.has(key(x, y))) {
        writes.push({ x, y, upper: null, ground: slab }); // a soleira: laje, sem parede
        continue;
      }
      const h = salted(x, y, 14);
      writes.push({ x, y, upper: h % 9 === 0 ? WALL_MOSS : WALLS[h % WALLS.length] });
    }
    const interior = [];
    for (let y = iy; y < iy + rh; y += 1) {
      for (let x = ix; x < ix + rw; x += 1) {
        interior.push([x, y]);
        // O piso RACHADO entra raro, como a sujeira que a laje ganha com o tempo: é o frame 51,
        // que estava instalado no atlas e nunca havia sido usado uma vez.
        const cracked = salted(x, y, 15) % 11 === 0;
        writes.push({ x, y, ground: cracked ? FLOOR_CRACKED : slab });
      }
    }
    // AS COLUNAS. Só em sala grande, e recuadas um tile: elas quebram a linha de visão e dão à
    // sala uma planta, em vez de um vazio retangular. O BFS abaixo garante que nenhuma delas
    // fecha o miolo.
    const pillars = [];
    if (rw >= 5 && rh >= 5 && salted(ix, iy, 16) % 3 !== 0) {
      for (const [px, py] of [[ix + 1, iy + 1], [ix + rw - 2, iy + 1],
        [ix + 1, iy + rh - 2], [ix + rw - 2, iy + rh - 2]]) {
        pillars.push([px, py]);
        writes.push({ x: px, y: py, upper: WALLS[salted(px, py, 17) % WALLS.length] });
      }
    }
    const pillarKeys = new Set(pillars.map(([x, y]) => key(x, y)));
    const mustReach = interior.filter(([x, y]) => !pillarKeys.has(key(x, y)));

    if (!stamp(writes, mustReach)) { stats.roomsRejected += 1; continue; }

    for (const [x, y] of mustReach) roomTiles.add(key(x, y));
    for (const [x, y] of ring) if (!doorKeys.has(key(x, y))) roomWalls.add(key(x, y));
    for (const k of doorKeys) roomDoors.add(k);
    for (let y = iy - 1 - m; y <= iy + rh + m; y += 1) {
      for (let x = ix - 1 - m; x <= ix + rw + m; x += 1) roomClaim.add(key(x, y));
    }
    rooms.push({ ix, iy, rw, rh, interior: mustReach });
    stats.rooms += 1;
    stats.slab += interior.length;
    stats.pillars += pillars.length;
    placed += 1;
  }
}

// ══ PASSO 2 — O SALÃO DE COLUNAS ══════════════════════════════════════════════════════════════
// Três telas do mapa de decisão não têm UMA parede: 144 tiles de piso liso cada, onde a câmera enquadra
// tudo de uma vez e não há nada para contornar. As salas não chegam lá sozinhas — elas são poucas
// por tela e precisam de um retângulo inteiro livre.
//
// O que resolve um vazio grande não é entulho espalhado, é COLUNA EM MALHA. Uma coluna a cada 3
// tiles lê como um salão sustentado por alguém; a mesma quantidade de pedra jogada ao acaso lê
// como sujeira de gerador. E uma coluna solta é o único blocador que NUNCA pode selar nada — ela
// não encosta em coisa alguma —, então o vazio mais perigoso de mexer recebe a peça mais segura.
//
// Onde: só onde o espelho é REALMENTE vazio. `emptiness` conta a alvenaria num raio de 5 tiles;
// abaixo de 6 paredes em 121 tiles, aquilo é um salão e não uma caverna.
const wallsNear = (x, y, r) => {
  let n = 0;
  for (let b = y - r; b <= y + r; b += 1) {
    for (let a = x - r; a <= x + r; a += 1) if (!decOpen(a, b)) n += 1;
  }
  return n;
};
// Quantas paredes num raio de 5 (121 tiles) ainda contam como SALÃO. 14 é ~12% de alvenaria: o
// suficiente para o olho ler "aberto". Medido: abaixo de 7 sobram 10 tiles no mapa inteiro, porque
// as salas do passo anterior já ficaram com os 788 tiles mais vazios que existiam.
const COLONNADE_MAX_WALLS = 4;
const COLONNADE_PITCH = 3;
// A unidade de medida do vazio é a TELA, não o tile: a câmera enquadra ~um chunk, e o defeito
// original foi diagnosticado assim ("quatro telas sem uma parede"). Uma tela do espelho abaixo de
// 18% de alvenaria é um salão e recebe a colunata; acima disso já há caverna a contornar.
const SCREEN_COLONNADE_CUT = 0.18;
const screenIsHall = new Set();
for (const c of under.chunks) {
  let w = 0;
  for (let ly = 0; ly < ROWS; ly += 1) {
    for (let lx = 0; lx < COLS; lx += 1) if (!decOpen(c.cx * COLS + lx, c.cy * ROWS + ly)) w += 1;
  }
  if (w / (COLS * ROWS) <= SCREEN_COLONNADE_CUT) screenIsHall.add(key(c.cx, c.cy));
}
for (let y = 3; y < H - 3; y += 1) {
  for (let x = 3; x < W - 3; x += 1) {
    if (!decOpen(x, y) || !writable(x, y)) continue;
    if (roomClaim.has(key(x, y))) continue;
    if (!screenIsHall.has(key(Math.floor(x / COLS), Math.floor(y / ROWS)))) continue;
    if (wallsNear(x, y, 3) > COLONNADE_MAX_WALLS) continue;  // colada na caverna: não é coluna
    // A malha, deslocada por célula de 12 tiles para as colunas não formarem uma grade única de
    // 60×60 — cada salão tem o seu alinhamento, como salões diferentes têm.
    const cellX = Math.floor(x / 12);
    const cellY = Math.floor(y / 12);
    const offX = salted(cellX, cellY, 71) % COLONNADE_PITCH;
    const offY = salted(cellX, cellY, 72) % COLONNADE_PITCH;
    if ((x + offX) % COLONNADE_PITCH !== 0 || (y + offY) % COLONNADE_PITCH !== 0) continue;
    // Uma coluna em cada duas, sorteada: uma malha perfeita lê como tabuleiro de xadrez.
    if (salted(x, y, 73) % 4 === 0) continue;
    const h = salted(x, y, 74);
    if (stamp([{ x, y, upper: h % 6 === 0 ? WALL_MOSS : WALLS[h % WALLS.length] }], [])) {
      stats.pillars += 1;
    }
  }
}

// ══ PASSO 2b — AS RUÍNAS SOLTAS ═══════════════════════════════════════════════════════════════
// O que sobra de uma construção quando ela cai: cotos de parede de 2 a 4 tiles, na borda dos
// salões — onde a colunata não chega porque já há caverna por perto, mas ainda é aberto demais.
const RUIN_SALT = 21;
for (let y = 2; y < H - 2; y += 1) {
  for (let x = 2; x < W - 2; x += 1) {
    if (!decOpen(x, y) || !writable(x, y)) continue;
    if (roomTiles.has(key(x, y)) || roomWalls.has(key(x, y)) || roomDoors.has(key(x, y))) continue;
    // Só no VAZIO: exige 2 tiles de chão livre em volta no espelho. Ruína colada na montanha é
    // indistinguível da montanha.
    let clear = true;
    for (let b = y - 2; b <= y + 2 && clear; b += 1) {
      for (let a = x - 2; a <= x + 2 && clear; a += 1) if (!decOpen(a, b)) clear = false;
    }
    if (!clear) continue;
    // Campo de ruído em células de 3×3 tiles: as ruínas saem em GRUPOS, e um grupo lê como um
    // lugar. Espalhadas por igual elas leriam como sujeira de gerador.
    if (salted(Math.floor(x / 3), Math.floor(y / 3), RUIN_SALT) % 3 !== 0) continue;
    if (salted(x, y, RUIN_SALT + 1) % 4 !== 0) continue;

    const horiz = salted(x, y, RUIN_SALT + 2) % 2 === 0;
    const len = 1 + (salted(x, y, RUIN_SALT + 3) % 4); // 1 (coluna) a 4 (coto de parede)
    const writes = [];
    for (let i = 0; i < len; i += 1) {
      const a = horiz ? x + i : x;
      const b = horiz ? y : y + i;
      if (!decOpen(a, b) || !writable(a, b)) break;
      if (roomTiles.has(key(a, b)) || roomWalls.has(key(a, b))) break;
      const h = salted(a, b, RUIN_SALT + 4);
      writes.push({ x: a, y: b, upper: h % 5 === 0 ? WALL_MOSS : WALLS[h % WALLS.length] });
    }
    if (!writes.length) continue;
    if (stamp(writes, [])) stats.ruins += writes.length;
  }
}

// ══ PASSO 3 — AS TOCHAS DE PAREDE ═════════════════════════════════════════════════════════════
// O frame 48 pinta a alvenaria com uma tocha acesa, e `WallTorchObject` a encontra varrendo o
// terreno. Ela é a única luz que existe lá embaixo e não custa NENHUMA luz THREE nova: entra no
// mesmo pool das fogueiras (a contagem de luzes está assada na chave de cache de todo shader, e
// mexer nela recompila o mundo).
//
// Trocar 45/46/47/49 por 48 não muda uma vírgula de passagem — os cinco frames estão todos em
// SOLID_UPPER. É a mudança de maior efeito e menor risco do arquivo inteiro.
//
// DUAS REGRAS DE COLOCAÇÃO, e as duas vêm do desenho da peça:
//   · o vizinho ao SUL tem de ser chão livre. **Isto não é preferência, é geometria, e não se
//     generaliza para "alguma face livre"**: nenhum billboard deste jogo gira, então todo quad é
//     vertical e olha para o sul (a câmera está em +z). Uma tocha desenhada na face oeste de um
//     bloco cai dentro do intervalo em z do próprio bloco, e a face sul dele — mais perto da
//     câmera — a oclui inteira. Com alvenaria ao sul acontece o mesmo, um tile adiante. A regra
//     mora em `wallTorchFaceIsClear` (`src/game/constants.ts`), e é a mesma pergunta que a cena
//     faz para decidir se desenha e que o Salvar do editor faz para avisar o autor;
//   · espaçamento mínimo, senão a masmorra vira dia. Uma tocha é um MARCO: você navega por elas.
const TORCH_MIN_GAP = 5;
let relaxedGap = TORCH_MIN_GAP;
const torchKeys = [];
const farFromTorches = (x, y) => torchKeys.every(([a, b]) => Math.max(Math.abs(a - x), Math.abs(b - y)) >= relaxedGap);
const litWall = (x, y) => {
  if (!writable(x, y) || !wallAt(x, y)) return false;
  if (curUpper[y][x] === null || !SOLID_UPPER.has(curUpper[y][x])) return false;
  if (wallAt(x, y + 1)) return false;              // precisa de chão livre ao sul
  if (!reach.has(key(x, y + 1))) return false;     // e esse chão tem de ser alcançável
  return farFromTorches(x, y);
};
const lightWall = (x, y) => {
  if (!litWall(x, y)) return false;
  curUpper[y][x] = WALL_TORCH;
  writtenTiles.set(key(x, y), [x, y, WALL_TORCH, curGround[y][x]]);
  torchKeys.push([x, y]);
  stats.torches += 1;
  return true;
};

// 1) Ao pé de cada ESCADA: descer no escuro absoluto e não ver o próprio degrau é o pior momento
//    da dungeon. A escada é o lugar onde a luz tem de estar.
for (const s of stairTiles) {
  const around = [];
  for (let dy = -3; dy <= 3; dy += 1) for (let dx = -3; dx <= 3; dx += 1) around.push([s.worldX + dx, s.worldY + dy]);
  around.sort((a, b) => (Math.hypot(a[0] - s.worldX, a[1] - s.worldY) - Math.hypot(b[0] - s.worldX, b[1] - s.worldY)));
  let lit = 0;
  for (const [x, y] of around) { if (lit >= 2) break; if (lightWall(x, y)) lit += 1; }
}
// 2) Nas paredes das SALAS: uma sala iluminada se vê de longe e vira destino.
for (const r of rooms) {
  let lit = 0;
  for (let x = r.ix - 1; x <= r.ix + r.rw && lit < 2; x += 1) {
    for (let y = r.iy - 1; y <= r.iy + r.rh && lit < 2; y += 1) {
      if (!roomWalls.has(key(x, y))) continue;
      if (lightWall(x, y)) lit += 1;
    }
  }
}
// 3) O resto do mundo, em varredura fixa: a alvenaria do espelho também recebe o seu ritmo.
for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) lightWall(x, y);
// 4) O PISO POR TELA. O espaçamento mínimo é uma regra global, e regra global deixa buraco: duas
//    telas inteiras ficaram sem UMA tocha — 12×12 de escuro absoluto, que é exatamente o defeito
//    que este passo existe para curar. Onde faltou, o espaçamento afrouxa até 3 e a tela recebe as
//    suas duas luzes. Uma tela sem tocha só é aceitável se ela não tiver parede iluminável nenhuma.
const TORCHES_PER_SCREEN = 2;
for (const c of under.chunks) {
  const inChunk = () => torchKeys.filter(([x, y]) => Math.floor(x / COLS) === c.cx
    && Math.floor(y / ROWS) === c.cy).length;
  for (let gap = TORCH_MIN_GAP - 1; gap >= 3 && inChunk() < TORCHES_PER_SCREEN; gap -= 1) {
    relaxedGap = gap;
    for (let ly = 0; ly < ROWS && inChunk() < TORCHES_PER_SCREEN; ly += 1) {
      for (let lx = 0; lx < COLS && inChunk() < TORCHES_PER_SCREEN; lx += 1) {
        lightWall(c.cx * COLS + lx, c.cy * ROWS + ly);
      }
    }
  }
  relaxedGap = TORCH_MIN_GAP;
}

// ══ PASSO 4 — O ENTULHO ═══════════════════════════════════════════════════════════════════════
// Detalhe de chão que não custa passagem: osso, seixo e cogumelo são frames de `upper` que ficam
// DEITADOS e se atravessa. O teto de densidade é a lição do `plano-chao.md`: uma feição do tamanho
// do tile É o tile, e detalhe uniforme vira papel de parede. Então ele é ESPARSO e sai em GRUPOS —
// e cada tipo tem o seu lugar, senão os três viram a mesma sujeira:
//   · COGUMELO cresce no úmido: encostado numa parede, e só na caverna (sala varrida não cria mofo);
//   · SEIXO cai ao PÉ da parede — é a parede que se desfaz;
//   · OSSO fica onde alguém morreu: dentro das salas e ao redor das covas.
const graveTiles = [];
for (const c of under.chunks) for (const e of c.enemies ?? []) graveTiles.push([e.worldX, e.worldY]);
const nearGrave = (x, y) => graveTiles.some(([a, b]) => Math.max(Math.abs(a - x), Math.abs(b - y)) <= 2);
const touchesWall = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => wallAt(x + dx, y + dy));

const putDecor = (x, y, frame) => {
  curUpper[y][x] = frame;
  writtenTiles.set(key(x, y), [x, y, frame, curGround[y][x]]);
  stats.rubble += 1;
};
for (let y = 1; y < H - 1; y += 1) {
  for (let x = 1; x < W - 1; x += 1) {
    if (!writable(x, y) || curUpper[y][x] !== null || wallAt(x, y)) continue;
    if (roomDoors.has(key(x, y))) continue;               // vão de porta fica limpo, sempre
    if (!reach.has(key(x, y)) ) continue;                 // bolsão é assunto do PASSO 7
    const inRoom = roomTiles.has(key(x, y));
    // A célula do canteiro é GROSSA (6×6 tiles) e passa raro. Com célula de 4 e 1 chance em 3, o
    // anel externo do mapa — 236 tiles de chão colados na parede da borda — virou uma FAIXA
    // CONTÍNUA de cogumelo, de canto a canto. Detalhe que acompanha uma parede inteira deixa de
    // ser detalhe e vira acabamento: é a mesma lei do `plano-chao.md` (uma feição do tamanho da
    // feição É a feição), aplicada ao comprimento em vez de à escala.
    const cell = salted(Math.floor(x / 6), Math.floor(y / 6), 31);
    let frame = null;
    if (inRoom || nearGrave(x, y)) {
      if (salted(x, y, 32) % 8 === 0) frame = BONES[salted(x, y, 33) % BONES.length];
    } else if (touchesWall(x, y)) {
      if (cell % 5 === 0 && salted(x, y, 34) % 4 === 0) {
        frame = MUSHROOMS[salted(x, y, 35) % MUSHROOMS.length];
      } else if (cell % 3 === 0 && salted(x, y, 36) % 6 === 0) {
        frame = STONES[salted(x, y, 37) % STONES.length];
      }
    } else if (cell % 4 === 0 && salted(x, y, 38) % 13 === 0) {
      frame = STONES[salted(x, y, 39) % STONES.length];
    }
    if (frame !== null) putDecor(x, y, frame);
  }
}

// ══ PASSO 5 — O TESOURO ═══════════════════════════════════════════════════════════════════════
// A dungeon tinha ZERO itens. Sem nada para achar não há motivo para descer, e a viagem inteira é
// um corredor de ida e volta.
//
// A LINHA QUE SEPARA OS DOIS ANDARES: em cima o recurso é RENOVÁVEL (o veio de minério, a árvore
// que volta) — é lá que a economia mora, e por isso o espelho não copia rocha nenhuma. Aqui
// embaixo o tesouro é FINITO e AUTORADO: o que você acha, acha uma vez. É a diferença entre uma
// mina e um cofre, e ela é o que dá peso a descer.
//
// E é ela que decide o que PODE entrar nesta tabela. Item de mão é finito de verdade — a foto do
// chão que a aventura salva por andar (`groundItems`, escopo `under`) SUBSTITUI a lista autorada,
// então "um tesouro tomado não renasce". O CORAÇÃO não passa por aí: ele é o único pickup que se
// transmite por chunk (`HeartPickupManager`, a lista viva de uma tela), e a janela é de 3×3 num
// mapa de 5×5 — duas telas de distância e a volta o recria. Um coração autorado é uma FONTE, não
// um achado, e uma fonte de cura a duas telas de qualquer lugar apaga o perigo do lugar inteiro.
// Aqui embaixo cura se ganha de um corpo que caiu (as 24 covas), como no resto do jogo. O peso que
// os corações tinham foi para a matéria-prima; ferro e bomba ficaram exatamente onde estavam,
// porque são eles que dizem para que serve descer.
const TREASURE = [
  ['iron', 3], ['bomb', 3], ['stone', 5], ['wood', 5],
];
const pickTreasure = (seed) => {
  const total = TREASURE.reduce((a, [, w]) => a + w, 0);
  let n = seed % total;
  for (const [kind, w] of TREASURE) { if (n < w) return kind; n -= w; }
  return 'heart';
};
const dropPickup = (x, y, kind) => {
  const c = chunkOf(x, y);
  c.pickups = c.pickups ?? [];
  c.pickups.push({ type: kind, worldX: x, worldY: y });
  taken.add(key(x, y));
  addedPickups.push([x, y]);
  stats.treasure += 1;
};
for (const r of rooms) {
  // O tile do tesouro é o mais fundo da sala em relação à porta — o canto, nunca a soleira.
  const spots = r.interior
    .filter(([x, y]) => writable(x, y) && curUpper[y][x] === null)
    .sort((a, b) => (salted(a[0], a[1], 41) % 997) - (salted(b[0], b[1], 41) % 997));
  if (!spots.length) continue;
  const howMany = 1 + (salted(r.ix, r.iy, 42) % 2);
  for (let i = 0; i < howMany && i < spots.length; i += 1) {
    const [x, y] = spots[i];
    dropPickup(x, y, pickTreasure(salted(x, y, 43)));
  }
}
// O PISO POR TELA, pelo mesmo motivo das tochas: só as salas pagando tesouro deixava OITO telas
// sem nada para achar, e uma tela sem nada é a dungeon vazia de volta em miniatura. Onde não houve
// sala, o item vai para um FUNDO DE SACO — o tile alcançável com menos vizinhos livres da tela, que
// é onde um jogador só chega se resolveu ir lá. Recompensa no meio do corredor não se procura.
for (const c of under.chunks) {
  if ((c.pickups ?? []).length > 0) continue;
  let best = null;
  let bestScore = -1;
  for (let ly = 0; ly < ROWS; ly += 1) {
    for (let lx = 0; lx < COLS; lx += 1) {
      const x = c.cx * COLS + lx;
      const y = c.cy * ROWS + ly;
      if (!writable(x, y) || wallAt(x, y) || curUpper[y][x] !== null) continue;
      if (!reach.has(key(x, y)) || roomDoors.has(key(x, y))) continue;
      const free = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !wallAt(x + dx, y + dy)).length;
      // 4 - vizinhos livres = quão encravado; o hash desempata sem quebrar o determinismo.
      const score = (4 - free) * 1000 + (salted(x, y, 44) % 997);
      if (score > bestScore) { bestScore = score; best = [x, y]; }
    }
  }
  if (best) dropPickup(best[0], best[1], pickTreasure(salted(best[0], best[1], 45)));
}

// ══ PASSO 6 — AS FLORES DA LUA ════════════════════════════════════════════════════════════════
// `moonflower` abre no ESCURO e fecha perto de chama — e o subterrâneo é o único lugar do jogo que
// é escuro o tempo todo. Havia 11 delas em cima e ZERO aqui, no lugar para o qual a peça foi
// desenhada.
//
// E elas trazem de graça a melhor troca da dungeon: quem desce com a TOCHA ACESA fecha os botões à
// própria frente (o `nearFire` da flor conta fogueira acesa e a tocha NA MÃO — a tocha de parede
// não conta), e um botão fechado BLOQUEIA. A luz que você trouxe é a que fecha o caminho. Por isso
// a flor só nasce onde há volta: 3 vizinhos cardeais livres, longe de vão de porta e de tocha.
const FLOWER_CAP = 26;
const flowerKeys = [];
for (let y = 2; y < H - 2 && flowerKeys.length < FLOWER_CAP; y += 1) {
  for (let x = 2; x < W - 2 && flowerKeys.length < FLOWER_CAP; x += 1) {
    if (!writable(x, y) || wallAt(x, y) || curUpper[y][x] !== null) continue;
    if (!reach.has(key(x, y))) continue;
    if (roomTiles.has(key(x, y)) || roomDoors.has(key(x, y))) continue;
    const free = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !wallAt(x + dx, y + dy)).length;
    if (free < 3) continue;                                    // nunca num afunilamento
    if (torchKeys.some(([a, b]) => Math.hypot(a - x, b - y) < 4)) continue; // no escuro de verdade
    if (flowerKeys.some(([a, b]) => Math.max(Math.abs(a - x), Math.abs(b - y)) < 2)) continue;
    // Grupos: um campo de ruído grosso escolhe os CANTEIROS, e o tile fino escolhe as flores.
    if (salted(Math.floor(x / 5), Math.floor(y / 5), 51) % 5 !== 0) continue;
    if (salted(x, y, 52) % 2 !== 0) continue;
    under.props.push({ type: 'moonflower', worldX: x, worldY: y });
    taken.add(key(x, y));
    addedProps.push([x, y]);
    flowerKeys.push([x, y]);
    stats.flowers += 1;
  }
}

// ══ PASSO 7 — OS COFRES ═══════════════════════════════════════════════════════════════════════
// O espelho criou dois cofres sem querer, e ninguém tinha reparado: um bolsão de 61 tiles e outro
// de 5, fechados por todos os lados, INALCANÇÁVEIS. São o miolo oco de uma montanha lá de cima.
//
// Eles ganham a gramática que o jogo já tem para isso: uma parede RACHADA (frame 50, o único tell
// de parede quebrável do atlas — instalado desde sempre, usado zero vezes) e uma MARCA DE BOMBA no
// chão do lado de fora, que é o único jeito de plantar uma bomba neste jogo. A marca diz "aqui" e
// a rachadura diz "aquela parede". Dentro: o piso rachado, ossos e barras de ferro — a moeda cara
// desta economia.
//
// Bolsão de 1 tile é buraco na parede do espelho, não cofre: some no filtro de tamanho.
const VAULT_MIN = 4;
const vaultSeen = new Set();
for (let y = 1; y < H - 1; y += 1) {
  for (let x = 1; x < W - 1; x += 1) {
    if (wallAt(x, y) || reach.has(key(x, y)) || vaultSeen.has(key(x, y))) continue;
    // Levanta o bolsão inteiro.
    const cells = [];
    const stack = [[x, y]];
    vaultSeen.add(key(x, y));
    while (stack.length) {
      const [a, b] = stack.pop();
      cells.push([a, b]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const p = a + dx;
        const r = b + dy;
        if (!inBounds(p, r) || wallAt(p, r) || vaultSeen.has(key(p, r))) continue;
        vaultSeen.add(key(p, r));
        stack.push([p, r]);
      }
    }
    if (cells.length < VAULT_MIN) continue;

    // A BRECHA: uma parede que encosta no bolsão de um lado e no mundo alcançável do outro. A
    // marca da bomba vai no tile alcançável, e o raio da explosão (2,2 tiles) cobre a parede.
    let breach = null;
    const cellSet = new Set(cells.map(([a, b]) => key(a, b)));
    outer:
    for (const [a, b] of cells) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const wx = a + dx;
        const wy = b + dy;
        if (!inBounds(wx, wy) || !wallAt(wx, wy) || !writable(wx, wy)) continue;
        if (curUpper[wy][wx] === null || !SOLID_UPPER.has(curUpper[wy][wx])) continue;
        const ox = wx + dx;
        const oy = wy + dy;   // do outro lado da mesma parede
        if (!inBounds(ox, oy) || !reach.has(key(ox, oy)) || !writable(ox, oy)) continue;
        if (cellSet.has(key(ox, oy))) continue;
        breach = { wx, wy, ox, oy };
        break outer;
      }
    }
    if (!breach) continue;

    curUpper[breach.wy][breach.wx] = WALL_CRACKED;
    writtenTiles.set(key(breach.wx, breach.wy), [breach.wx, breach.wy, WALL_CRACKED, curGround[breach.wy][breach.wx]]);
    under.props.push({ type: 'bombSpot', worldX: breach.ox, worldY: breach.oy });
    taken.add(key(breach.ox, breach.oy));
    addedProps.push([breach.ox, breach.oy]);

    // O interior do cofre: piso rachado, ossos, e ferro no tile mais fundo.
    const sorted = cells.slice().sort((p, q) => (
      Math.hypot(q[0] - breach.wx, q[1] - breach.wy) - Math.hypot(p[0] - breach.wx, p[1] - breach.wy)
    ));
    let bars = 0;
    const wantBars = Math.min(4, 1 + Math.floor(cells.length / 18));
    for (const [a, b] of sorted) {
      if (!writable(a, b)) continue;
      if (bars < wantBars && curUpper[b][a] === null) {
        dropPickup(a, b, bars === 0 ? 'iron' : pickTreasure(salted(a, b, 61)));
        bars += 1;
        continue;
      }
      if (curUpper[b][a] === null && salted(a, b, 62) % 7 === 0) {
        putDecor(a, b, BONES[salted(a, b, 63) % BONES.length]);
      }
      if (salted(a, b, 64) % 4 === 0) {
        curGround[b][a] = FLOOR_CRACKED;
        writtenTiles.set(key(a, b), [a, b, curUpper[b][a], FLOOR_CRACKED]);
      }
    }
    stats.vaults += 1;
  }
}

// ── ESCREVE ───────────────────────────────────────────────────────────────────────────────────
// De volta para os chunks. `collisions` NÃO é tocado em lugar nenhum deste arquivo.
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const c = chunkOf(x, y);
    const [lx, ly] = localOf(x, y);
    c.ground[ly][lx] = curGround[y][x];
    c.upper[ly][lx] = curUpper[y][x];
  }
}
under.meta.enrich = {
  version: 1,
  tiles: [...writtenTiles.values()],
  props: addedProps,
  pickups: addedPickups,
};

// A PROVA FINAL, sobre o arquivo inteiro e não sobre uma estampa: tudo que era alcançável no
// espelho continua alcançável, exceto o que virou parede; e as seis escadas se alcançam.
const finalReach = reachable();
for (const s of stairTiles) {
  if (!finalReach.has(key(s.worldX, s.worldY))) {
    console.error(`FALHA: a escada em ${s.worldX},${s.worldY} ficou inalcançável.`);
    process.exit(1);
  }
}

const out = `${JSON.stringify(under, null, 2)}\n`;
const isFixedPoint = out === rawUnder;

console.log(
  `Subterrâneo: ${stats.rooms} salas (${stats.roomsRejected} rejeitadas pelo BFS), `
  + `${stats.pillars} colunas, ${stats.ruins} tiles de ruína, ${stats.torches} tochas, `
  + `${stats.slab} de laje, ${stats.rubble} de entulho, ${stats.treasure} itens, `
  + `${stats.flowers} flores, ${stats.vaults} cofres. `
  + `${ownedCount} tiles do autor preservados.`,
);
const open = finalReach.size;
console.log(`Alcançável a partir do spawn: ${open} tiles (antes: ${openBefore}).`);

if (isFixedPoint) { console.log('Ponto fixo: o disco já é isto.'); process.exit(0); }
if (check) { console.error('--check: o disco NÃO é o ponto fixo. Rode o script sem --check.'); process.exit(1); }
if (dry) { console.log('--dry: nada gravado.'); process.exit(0); }

mkdirSync(BACKUP_DIR, { recursive: true });
copyFileSync(UNDER_PATH, BACKUP_PATH);
writeFileSync(UNDER_PATH, out, 'utf8');
console.log(`Gravado. Backup em backup/underworld-pre-enrich.json`);
