// ENRIQUECER O MUNDO — mato, flores, covas e fogueiras por cima do `public/world.json` que ja
// existe. Rode com `node scripts/enrich-world.mjs`.
//
// ⚠ POR QUE ISTO NAO E O `generate:world`. O `scripts/generateWorld.ts` REESCREVE o world.json do
// zero, num mundo 8x8 com uma fogueira e nenhum portal — e o mundo de hoje e 22x8, autorado a mao
// no editor, com 9 portais de level, 10 NPCs e 140 covas. Rodar o gerador apagaria tudo isso sem
// perguntar, exatamente como o `gen-levels` faz com os levels. Entao este script LE o mundo que
// esta la, acrescenta, e devolve — nunca refaz.
//
// E IDEMPOTENTE de proposito: decoracao so entra onde a camada de cima esta vazia, e covas e
// fogueiras miram um TOTAL (nao um delta). Rodar duas vezes da o mesmo mundo que rodar uma.
//
// A distribuicao e por RUIDO, nao por sorteio tile a tile: sorteio uniforme espalha confete e o
// mapa fica com a mesma densidade em todo lugar, que le como textura de fundo. Com um campo suave
// por cima, o mundo ganha clareira e matagal — regioes densas e regioes peladas —, e e a diferenca
// entre elas que faz o lugar parecer um lugar.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WORLD_PATH = fileURLToPath(new URL('../public/world.json', import.meta.url));

// ── O que o mundo ja sabe sobre os proprios tiles (espelha src/game/constants.ts) ──────────────
const SEA_TILE_FRAME = 33;
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 45, 46, 47, 48, 49, 50]);
const TREE_FRAMES = new Set([3, 4, 14, 15, 16, 17, 18, 21]);
const ROCKY_UPPER = new Set([39, 40]);
const STONE_GROUND = new Set([23, 24, 29, 30, 31, 32]);
/** LIGHT_RADIUS_TILES: nenhum monstro nasce dentro da luz de um fogo aceso. */
const LIGHT_RADIUS_TILES = 4.5;

// ── As familias de decoracao (os rotulos sao os da paleta do editor) ───────────────────────────
// Nenhuma delas bloqueia: frame de camada de cima fora de SOLID_UPPER deita no chao e se pisa por
// cima. Entao decorar o mundo inteiro nao mexe em um unico caminho.
//
// `Gravetos` (9) e `Graveto Solto` (2) ficam DE FORA a proposito, e essa e a unica escolha aqui
// que nao e estetica: graveto e um ITEM neste jogo — a lenha da tocha, as tabuas da ponte. Um tile
// que desenha um graveto e nao entrega nenhum e uma afordancia mentindo, e o mapa inteiro
// coberto delas ensinaria o jogador a parar de olhar pro chao.
// Os rotulos da paleta enganam e vale registrar, porque foi olhando os pixels ampliados que a
// mistura daqui mudou: "Cogumelos Vermelhos"(10) e "Cogumelos Roxos"(11) sao, na arte, quatro
// florzinhas vermelhas e quatro lilases — flor, nao fungo. So o 1 ("Arbusto Florido") e mato: uma
// moita redonda com flores por cima. Entao a familia FLOR tem tres membros e nao um, e ela nao
// podia continuar presa a sombra das arvores como cogumelo estaria.
const GRASS = [0, 7, 8, 19, 20]; // Folhagem 1..5: moitas escuras (0) e tufos de capim (7/8/19/20)
const BLOOM_SMALL = [10, 11]; // as florzinhas vermelhas e lilases — o que se acha no campo aberto
const BLOOM_BUSH = [1]; // o arbusto florido: massa, e por isso melhor a meia-sombra
const STONES = [12, 13]; // Pedregulho / Pedras: pe de montanha
const DECOR_FRAMES = new Set([...GRASS, ...BLOOM_SMALL, ...BLOOM_BUSH, ...STONES, 2, 9]);

// Quanto do chao livre acaba com alguma coisa em cima. 7% era o que havia (o mundo lia como
// pelado); 30% e matagal de verdade sem virar sopa — e como o ruido agrupa, na pratica isso
// significa clareiras quase limpas e bolsoes bem densos, nao 30% em todo lugar.
const DECOR_TARGET_FRACTION = 0.30;
/**
 * Quantas covas de morto-vivo o mundo passa a ter, no TOTAL. E o dobro das 24 que o autor tinha
 * marcado — e e um numero absoluto, nao "vezes dois", justamente pra este script poder rodar de
 * novo sem dobrar o dobro. (Foi assim que a primeira versao daqui saiu de 48 para 96.)
 */
const UNDEAD_TARGET = 48;
/** Quantas fogueiras o mundo passa a ter no total, contando a de casa. */
const CAMPFIRE_TARGET = 9;
/** Distancia minima entre duas fogueiras, em tiles: fogo perto de fogo nao abre corredor nenhum. */
const CAMPFIRE_MIN_SPACING = 26;

const world = JSON.parse(readFileSync(WORLD_PATH, 'utf8'));
const CC = world.meta.chunkColumns;
const CR = world.meta.chunkRows;
const W = world.meta.worldChunksX * CC;
const H = world.meta.worldChunksY * CR;

const chunkAt = new Map(world.chunks.map((c) => [`${c.cx},${c.cy}`, c]));
const cellOf = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  const chunk = chunkAt.get(`${Math.floor(x / CC)},${Math.floor(y / CR)}`);
  if (!chunk) return null;
  return { chunk, lx: x % CC, ly: y % CR };
};
const groundAt = (x, y) => cellOf(x, y)?.chunk.ground[cellOf(x, y).ly][cellOf(x, y).lx] ?? null;
const upperAt = (x, y) => {
  const c = cellOf(x, y);
  return c ? c.chunk.upper[c.ly][c.lx] : null;
};
const blockedAt = (x, y) => {
  const c = cellOf(x, y);
  if (!c) return true;
  if (c.chunk.collisions[c.ly][c.lx]) return true;
  if (c.chunk.ground[c.ly][c.lx] === SEA_TILE_FRAME) return true;
  const up = c.chunk.upper[c.ly][c.lx];
  return up !== null && SOLID_UPPER.has(up);
};

// ── Ruido ──────────────────────────────────────────────────────────────────────────────────────
// Hash inteiro + interpolacao suave. Nao ha `Math.random()` em lugar nenhum aqui: o mundo tem de
// sair identico em qualquer maquina e em qualquer rodada, senao "rode de novo" vira outro mapa.
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
/** Duas oitavas: manchas grandes (o bioma) moduladas por manchas pequenas (o canteiro). */
const lushness = (x, y) => 0.62 * noise(x, y, 17, 1337) + 0.38 * noise(x, y, 5, 90210);

// ── Tiles ocupados por alguma coisa que nao e terreno ──────────────────────────────────────────
const occupied = new Set();
for (const prop of world.props) occupied.add(`${prop.worldX},${prop.worldY}`);
for (const chunk of world.chunks) {
  for (const list of [chunk.enemies, chunk.npcs, chunk.pickups]) {
    for (const e of list) occupied.add(`${e.worldX},${e.worldY}`);
  }
}
const start = world.meta.playerStart;

const neighbourhood = (x, y, radius, test) => {
  let n = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (test(x + dx, y + dy)) n += 1;
    }
  }
  return n;
};

// ── 1. Mato, flores, cogumelos e pedras ────────────────────────────────────────────────────────
//
// O QUE nasce onde sai da VIZINHANCA, e nao de um sorteio plano: cogumelo debaixo de arvore,
// pedra no pe da montanha, flor em campo aberto. E o que separa "o mapa tem mais coisas" de "o
// mapa tem lugares" — um cogumelo no meio do descampado e so um pixel colorido.
const pickFrom = (list, x, y, seed) => list[Math.floor(hash(x, y, seed) * list.length) % list.length];
const decorFor = (x, y) => {
  const trees = neighbourhood(x, y, 2, (nx, ny) => TREE_FRAMES.has(upperAt(nx, ny)));
  const rock = neighbourhood(x, y, 1, (nx, ny) => ROCKY_UPPER.has(upperAt(nx, ny)))
    + neighbourhood(x, y, 1, (nx, ny) => STONE_GROUND.has(groundAt(nx, ny)));
  const roll = hash(x, y, 24601);
  // Pedra chama pedra: cascalho no pe da montanha, e nunca um canteiro de flores brotando do
  // pedregulho. E a unica familia que EXCLUI as outras, porque e a unica que fala de solo.
  if (rock >= 3) return roll < 0.62 ? pickFrom(STONES, x, y, 11) : pickFrom(GRASS, x, y, 44);
  // Meia-sombra da mata: a moita florida tem massa e cabe debaixo de arvore; o capim escuro (0)
  // fecha o resto. Flor pequena tambem aparece aqui, so que menos — ela e coisa de campo.
  if (trees >= 2) {
    if (roll < 0.26) return pickFrom(BLOOM_BUSH, x, y, 33);
    if (roll < 0.42) return pickFrom(BLOOM_SMALL, x, y, 22);
    return pickFrom(GRASS, x, y, 44);
  }
  // Campo aberto: capim com flor no meio, ~1 em cada 3. Mais que isso e o campo vira canteiro e a
  // flor deixa de ser a coisa que se acha; menos, e o mundo continua a savana pelada de antes.
  if (roll < 0.30) return pickFrom(BLOOM_SMALL, x, y, 22);
  if (roll < 0.36) return pickFrom(BLOOM_BUSH, x, y, 33);
  return pickFrom(GRASS, x, y, 44);
};

const freeTiles = [];
let decorNow = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const up = upperAt(x, y);
    if (up !== null) {
      if (DECOR_FRAMES.has(up)) decorNow += 1;
      continue;
    }
    if (blockedAt(x, y)) continue;
    if (occupied.has(`${x},${y}`)) continue;
    // O tile do heroi fica limpo: nascer em cima de um arbusto e a primeira imagem do jogo.
    if (Math.abs(x - start.worldX) + Math.abs(y - start.worldY) <= 1) continue;
    freeTiles.push({ x, y, score: lushness(x, y) });
  }
}

// Ordenar por densidade e cortar no alvo, em vez de sortear por tile: assim o numero final e
// exato e as manchas ficam onde o campo mandou, e nao onde a moeda caiu.
freeTiles.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
const decorTarget = Math.round((freeTiles.length + decorNow) * DECOR_TARGET_FRACTION);
const toPlant = Math.max(0, decorTarget - decorNow);
let planted = 0;
for (const tile of freeTiles) {
  if (planted >= toPlant) break;
  const cell = cellOf(tile.x, tile.y);
  cell.chunk.upper[cell.ly][cell.lx] = decorFor(tile.x, tile.y);
  planted += 1;
}

// ── 2. O DOBRO de covas de morto-vivo ──────────────────────────────────────────────────────────
//
// Dobrar nao e espalhar caveira nova pelo mapa: e ADENSAR o que o autor ja marcou. Cada cova nova
// nasce perto de uma que ja existia, entao os trechos assombrados ficam mais assombrados e o
// resto do mundo continua sendo o resto do mundo — que e o que faz um trecho assombrado existir.
const undeadSpawns = [];
for (const chunk of world.chunks) {
  for (const e of chunk.enemies) if (e.type === 'undead') undeadSpawns.push(e);
}
const litFires = (() => {
  const fires = world.props.filter((p) => p.type === 'campfire');
  let home = -1;
  let best = Infinity;
  fires.forEach((f, i) => {
    const d = Math.hypot(f.worldX - start.worldX, f.worldY - start.worldY);
    if (d < best) { best = d; home = i; }
  });
  return fires.filter((f, i) => i === home || f.lit === true);
})();
const inFirelight = (x, y) => litFires.some(
  (f) => Math.hypot(f.worldX - x, f.worldY - y) <= LIGHT_RADIUS_TILES,
);
const spawnTaken = new Set();
for (const chunk of world.chunks) {
  for (const e of chunk.enemies) spawnTaken.add(`${e.worldX},${e.worldY}`);
}
const canHoldSpawn = (x, y) => !blockedAt(x, y)
  && !spawnTaken.has(`${x},${y}`)
  && !occupied.has(`${x},${y}`)
  && !inFirelight(x, y)
  && Math.abs(x - start.worldX) + Math.abs(y - start.worldY) > 6;

const addSpawn = (x, y) => {
  const chunk = chunkAt.get(`${Math.floor(x / CC)},${Math.floor(y / CR)}`);
  if (!chunk) return false;
  chunk.enemies.push({ type: 'undead', worldX: x, worldY: y });
  spawnTaken.add(`${x},${y}`);
  return true;
};

let undeadAdded = 0;
// Anel a anel a partir da cova de origem: a mais perto que servir ganha. Um raio grande de uma vez
// espalharia a cova nova pro chunk vizinho, que e o oposto de adensar.
for (const origin of undeadSpawns) {
  if (undeadSpawns.length + undeadAdded >= UNDEAD_TARGET) break;
  let placed = false;
  for (let r = 2; r <= 6 && !placed; r++) {
    for (let dy = -r; dy <= r && !placed; dy++) {
      for (let dx = -r; dx <= r && !placed; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = origin.worldX + dx;
        const y = origin.worldY + dy;
        if (!canHoldSpawn(x, y)) continue;
        placed = addSpawn(x, y);
        if (placed) undeadAdded += 1;
      }
    }
  }
}

// ── 3. Fogueiras ───────────────────────────────────────────────────────────────────────────────
//
// APAGADAS, todas. Fogueira acesa e zona segura (monstro nao entra na luz) e e a loja — semear
// nove delas acesas seria plantar nove ilhas de paz num mundo cuja unica tensao e o escuro. O
// jogo ja tem uma resposta pronta pra fogo morto: a tocha. Cada uma destas e um destino, e a
// primeira coisa que o jogador faz com ela e decidir se vale a caminhada com a chama na mao.
const campfires = world.props.filter((p) => p.type === 'campfire');
const farFromFires = (x, y) => campfires.every(
  (f) => Math.hypot(f.worldX - x, f.worldY - y) >= CAMPFIRE_MIN_SPACING,
);
// Uma fogueira OCUPA o tile dela. Numa passagem de um tile ela seria uma parede nova no meio do
// caminho, entao ela so pousa numa clareira: 20 dos 24 vizinhos abertos.
const isClearing = (x, y) => !blockedAt(x, y)
  && !occupied.has(`${x},${y}`)
  && neighbourhood(x, y, 2, (nx, ny) => !blockedAt(nx, ny)) >= 20;

const campfireCandidates = [];
for (let y = 2; y < H - 2; y++) {
  for (let x = 2; x < W - 2; x++) {
    if (!isClearing(x, y)) continue;
    campfireCandidates.push({ x, y, score: hash(x, y, 5150) });
  }
}
campfireCandidates.sort((a, b) => b.score - a.score);
let firesAdded = 0;
for (const spot of campfireCandidates) {
  if (campfires.length >= CAMPFIRE_TARGET) break;
  if (!farFromFires(spot.x, spot.y)) continue;
  const fire = { type: 'campfire', worldX: spot.x, worldY: spot.y };
  world.props.push(fire);
  campfires.push(fire);
  occupied.add(`${spot.x},${spot.y}`);
  firesAdded += 1;
}

writeFileSync(WORLD_PATH, `${JSON.stringify(world, null, 2)}\n`, 'utf8');

const finalDecor = (() => {
  let n = 0;
  for (const c of world.chunks) {
    for (let y = 0; y < CR; y++) for (let x = 0; x < CC; x++) if (DECOR_FRAMES.has(c.upper[y][x])) n += 1;
  }
  return n;
})();
console.log(
  `world.json enriquecido: decoracao ${decorNow} -> ${finalDecor} (+${planted}), `
  + `covas de undead ${undeadSpawns.length} -> ${undeadSpawns.length + undeadAdded}, `
  + `fogueiras ${campfires.length - firesAdded} -> ${campfires.length} (+${firesAdded} apagadas)`,
);
