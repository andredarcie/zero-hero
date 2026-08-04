// UMA ESPÉCIE POR TELA — reorganiza as covas do `public/world.json`. Rode com
// `node scripts/place-enemies.mjs`.
//
// ⚠ Ele NÃO é o `generate:world` (aquele reescreve o mundo inteiro do zero e apaga o que foi feito
// à mão). Este LÊ o mundo que está lá e mexe em UMA coisa só: `chunk.enemies`. Terreno, colisão,
// camada de cima, props, NPCs e pickups não são tocados em lugar nenhum deste arquivo.
//
// ── A REGRA ───────────────────────────────────────────────────────────────────────────────────
// **Região = CHUNK = a tela.** A câmera enquadra ~um chunk, então o chunk é a unidade que o
// jogador realmente experimenta: ele entra numa tela e ela tem uma cara. Duas espécies misturadas
// na mesma tela não são "variedade", são ruído — o jogador não consegue aprender o que a tela
// pede, porque cada corpo pede uma coisa diferente. É a gramática do Zelda 1, e é a razão de a
// pergunta "como se atravessa esta tela?" ter resposta.
//
// ── O QUE ELE PRESERVA ────────────────────────────────────────────────────────────────────────
// A cova que o autor cavou é uma DECISÃO, e o tile dela é a parte que importa (aquele corredor,
// aquela margem). Então:
//   - tela com uma espécie só  → fica exatamente como está, e ela é a espécie da tela;
//   - tela misturada           → a espécie DOMINANTE vence e as outras covas VIRAM ela, no mesmo
//                                tile — o lugar escolhido sobrevive, a espécie é que cede;
//   - cova que ficou ilegal    → anda para o tile legal mais próximo da mesma tela (um zora tem de
//                                estar na água, e uma aranha não pode ficar nela);
//   - tela vazia               → ganha uma espécie e algumas covas, exceto no acampamento.
//
// ── DETERMINÍSTICO E IDEMPOTENTE ──────────────────────────────────────────────────────────────
// Zero `Math.random()`: a espécie sai de um campo de ruído sobre as coordenadas do chunk, e a
// contagem de covas mira um TOTAL por tela (nunca um delta). Rodar duas vezes dá o mesmo mundo.
// O ruído é grosso de propósito — vale ~2,5 chunks —, então telas vizinhas costumam cair na mesma
// espécie e o mapa ganha ZONAS (a costa dos zoras, o matagal das aranhas) em vez de um mosaico
// onde cada tela é uma surpresa isolada.
//
// ⚠ ORDEM: rode este DEPOIS do `enrich-world.mjs`. Aquele adensa covas de morto-vivo mirando um
// total global e não sabe de tela nenhuma — rodá-lo por último remisturaria as espécies.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WORLD_PATH = fileURLToPath(new URL('../public/world.json', import.meta.url));

// ── O que o mundo já sabe sobre os próprios tiles (espelha src/game/constants.ts) ──────────────
const SEA_TILE_FRAME = 33;
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 45, 46, 47, 48, 49, 50]);
/** LIGHT_RADIUS_TILES: luz de fogueira acesa cala uma cova, então nenhuma nasce dentro dela. */
const LIGHT_RADIUS_TILES = 4.5;
/** Ninguém nasce colado no spawn do herói (nem numa tela vizinha ao acampamento). */
const CAMP_SAFE_TILES = 8;
const CAMP_SAFE_CHUNKS = 1;
/** Duas covas encostadas viram um cerco autorado — o que já existe e não é isto. */
const DEN_MIN_SPACING = 2;

/**
 * A ESCADA DE PERIGO, em anéis de chunk a partir do acampamento. Não é dificuldade por número
 * (HP maior não faz inimigo diferente): é o REPERTÓRIO que muda. Perto de casa o mundo pede
 * coragem de encostar; longe, ele pede que você resolva o tiro, o veneno e a massa.
 *
 * A CONTAGEM é o número que mais custou aqui, e ela não é "quantos cabem na tela": a cova acorda
 * na distância de visão da caveira (14 tiles), e 14 tiles é um círculo de ~4,3 chunks — ou seja,
 * o herói acorda as covas de meia dúzia de telas ao mesmo tempo. Com 3 covas por tela (o número
 * do Zelda 1, onde a tela é um corte duro e não tem vizinhas acordadas) ele andava com 13 corpos
 * em volta, o dobro do que a luz de fogueira consegue negociar. Uma a duas por tela dá ~7, medido
 * — e é este número, não a contagem por tela, que se olha ao mexer aqui.
 */
const TIERS = [
  { maxDist: 3, kinds: ['slime', 'spider'], dens: 1 },
  { maxDist: 6, kinds: ['spider', 'bat', 'undead'], dens: 1 },
  { maxDist: Infinity, kinds: ['undead', 'mage', 'turret', 'bigslime'], dens: 2 },
];
/**
 * O MORTO-VIVO ANDA EM MAIOR NÚMERO, e este fator é a única coisa que o separa do resto.
 *
 * Ele é o corpo-base da aventura — a espécie que o cerco também invoca, a que aprendeu o telegrafo,
 * a que marcha para placas. As outras seis são PERGUNTAS pontuais (o mago que não deixa chegar, o
 * zora que mora no rio); a caveira é o ruído de fundo do escuro, e ruído de fundo ralo não é
 * ameaça, é decoração.
 *
 * ⚠ MEXER AQUI MEXE NA DENSIDADE, e o número que se olha NÃO é covas por tela: é **covas dentro de
 * 14 tiles** (ver o cabeçalho de TIERS). A cova acorda na distância de visão da caveira, que vale
 * ~4 telas, então cada cova a mais numa zona de morto-vivo é um corpo a mais cercando o herói.
 *
 * MEDIDO, e não presumido — as três rodadas, no mundo de hoje:
 *
 *   fator | undead | covas em 14 tiles (média / MÁXIMO)
 *   ------|--------|-----------------------------------
 *     1   |   54   |  5.3 / 10
 *     2   |   82   |  6.1 / 16
 *     3   |  120   |  7.5 / 25   ← atual
 *
 * O fator não é a contagem: o alvo por tela esbarra nos tiles válidos e no espaçamento mínimo, e é
 * por isso que 3 dá 2,2× e não 3×. E fica o aviso que o cabeçalho de TIERS já dava: **13 corpos em
 * volta do herói** era o número apontado ali como quebrado. O máximo de hoje é quase o dobro disso.
 * Se a mão disser que é demais, este é o único número a mexer — e o script é idempotente, então
 * baixá-lo pede restaurar o world.json antes (ele mira num alvo, mas não REMOVE excesso).
 */
const UNDEAD_DENS_FACTOR = 3;
/** A água é uma região por si só: onde ela manda, quem mora é o zora. */
const ZORA_DENS = 2;
/** Quanto da tela precisa ser água aberta para ela virar uma tela de zora. */
const ZORA_WATER_FRACTION = 0.35;

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
/** Um corpo que ANDA pode nascer aqui? (mar, colisão pintada e camada de cima sólida barram) */
const walkableAt = (x, y) => {
  const c = cellOf(x, y);
  if (!c) return false;
  if (c.chunk.collisions[c.ly][c.lx]) return false;
  if (c.chunk.ground[c.ly][c.lx] === SEA_TILE_FRAME) return false;
  const up = c.chunk.upper[c.ly][c.lx];
  return up === null || !SOLID_UPPER.has(up);
};
/** E a pergunta invertida, a única do jogo: o zora só existe em cima de água aberta. */
const waterAt = (x, y) => {
  const c = cellOf(x, y);
  if (!c) return false;
  return c.chunk.ground[c.ly][c.lx] === SEA_TILE_FRAME && !c.chunk.collisions[c.ly][c.lx];
};

// Hash inteiro + interpolação suave, o mesmo do enrich-world: nada aqui pode variar entre duas
// rodadas, ou "rode de novo" vira outro mundo.
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

// ── O que já ocupa um tile (nada nasce em cima de prop, NPC ou item) ───────────────────────────
const occupied = new Set();
for (const prop of world.props) occupied.add(`${prop.worldX},${prop.worldY}`);
for (const chunk of world.chunks) {
  for (const list of [chunk.npcs ?? [], chunk.pickups ?? []]) {
    for (const e of list) occupied.add(`${e.worldX},${e.worldY}`);
  }
}

// A fogueira de CASA é a mais próxima do spawn (é assim que o runtime escolhe qual nasce acesa);
// as outras só contam se o autor as marcou acesas.
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

const homeChunk = { cx: Math.floor(start.worldX / CC), cy: Math.floor(start.worldY / CR) };
const chunkDist = (c) => Math.max(Math.abs(c.cx - homeChunk.cx), Math.abs(c.cy - homeChunk.cy));

/** O tile pode receber uma cova DESTA espécie? */
const canHold = (kind, x, y, taken) => {
  if (taken.has(`${x},${y}`)) return false;
  if (occupied.has(`${x},${y}`)) return false;
  if (inFirelight(x, y)) return false;
  if (Math.abs(x - start.worldX) + Math.abs(y - start.worldY) <= CAMP_SAFE_TILES) return false;
  return kind === 'zora' ? waterAt(x, y) : walkableAt(x, y);
};
/** ...e longe o bastante da cova mais próxima já colocada nesta tela. */
const spacedFrom = (x, y, dens) => dens.every(
  (d) => Math.max(Math.abs(d.worldX - x), Math.abs(d.worldY - y)) >= DEN_MIN_SPACING,
);

// Os tiles de uma tela numa ordem embaralhada mas FIXA: varrer em ordem de leitura empilharia
// toda cova no canto noroeste da tela.
const shuffledTiles = (chunk) => {
  const tiles = [];
  for (let ly = 0; ly < CR; ly++) {
    for (let lx = 0; lx < CC; lx++) {
      const x = chunk.cx * CC + lx;
      const y = chunk.cy * CR + ly;
      tiles.push({ x, y, k: hash(x, y, 0x5eed) });
    }
  }
  return tiles.sort((a, b) => a.k - b.k);
};

const speciesFor = (chunk) => {
  // 1. A água manda: uma tela que é mais rio que terra é a casa do zora, em qualquer anel.
  let water = 0;
  for (let ly = 0; ly < CR; ly++) {
    for (let lx = 0; lx < CC; lx++) if (chunk.ground[ly][lx] === SEA_TILE_FRAME) water += 1;
  }
  if (water / (CC * CR) >= ZORA_WATER_FRACTION) return 'zora';
  // 2. O anel escolhe o repertório, e o ruído grosso escolhe dentro dele — daí as zonas.
  const tier = TIERS.find((t) => chunkDist(chunk) <= t.maxDist);
  const n = noise(chunk.cx, chunk.cy, 2.5, 0xb105);
  return tier.kinds[Math.min(tier.kinds.length - 1, Math.floor(n * tier.kinds.length))];
};

const denTargetFor = (chunk, kind) => {
  if (kind === 'zora') return ZORA_DENS;
  const dens = TIERS.find((t) => chunkDist(chunk) <= t.maxDist).dens;
  return kind === 'undead' ? dens * UNDEAD_DENS_FACTOR : dens;
};

// ── A passagem ────────────────────────────────────────────────────────────────────────────────
let converted = 0;
let moved = 0;
let dropped = 0;
let added = 0;
const byKind = {};
const purityBefore = { pure: 0, mixed: 0 };

for (const chunk of world.chunks) {
  const existing = chunk.enemies ?? [];
  const kinds = new Set(existing.map((e) => e.type));
  if (existing.length > 0) purityBefore[kinds.size > 1 ? 'mixed' : 'pure'] += 1;

  // A espécie da tela: a que o autor já tinha (dominante, se havia mistura), ou a da regra.
  let kind;
  if (kinds.size === 1) {
    [kind] = kinds;
  } else if (kinds.size > 1) {
    const count = new Map();
    for (const e of existing) count.set(e.type, (count.get(e.type) ?? 0) + 1);
    // Empate resolvido pelo nome, para o resultado não depender da ordem do arquivo.
    kind = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    converted += existing.length - count.get(kind);
  } else {
    // Tela vazia: o acampamento e a coroa de telas em volta dele ficam vazios de propósito — o
    // lugar para onde se volta a pé sangrando não pode ter uma cova esperando na porta.
    if (chunkDist(chunk) <= CAMP_SAFE_CHUNKS) continue;
    kind = speciesFor(chunk);
  }

  const taken = new Set();
  const dens = [];
  // Cada cova que já existia tenta ficar exatamente onde está; se o tile não serve mais para a
  // espécie da tela, ela anda para o tile legal mais próximo AQUI DENTRO (uma cova que pulasse
  // para a tela vizinha quebraria a regra que este script existe para impor).
  for (const den of existing) {
    if (canHold(kind, den.worldX, den.worldY, taken) && spacedFrom(den.worldX, den.worldY, dens)) {
      taken.add(`${den.worldX},${den.worldY}`);
      dens.push({ type: kind, worldX: den.worldX, worldY: den.worldY });
      continue;
    }
    const spot = shuffledTiles(chunk)
      .map((t) => ({ ...t, d: Math.hypot(t.x - den.worldX, t.y - den.worldY) }))
      .sort((a, b) => a.d - b.d)
      .find((t) => canHold(kind, t.x, t.y, taken) && spacedFrom(t.x, t.y, dens));
    if (!spot) { dropped += 1; continue; }
    taken.add(`${spot.x},${spot.y}`);
    dens.push({ type: kind, worldX: spot.x, worldY: spot.y });
    moved += 1;
  }

  // E o total da tela é um ALVO, não um acréscimo: é isto que faz rodar de novo não dobrar nada.
  const target = denTargetFor(chunk, kind);
  for (const t of shuffledTiles(chunk)) {
    if (dens.length >= target) break;
    if (!canHold(kind, t.x, t.y, taken) || !spacedFrom(t.x, t.y, dens)) continue;
    taken.add(`${t.x},${t.y}`);
    dens.push({ type: kind, worldX: t.x, worldY: t.y });
    added += 1;
  }

  // Ordem estável no arquivo: mesma entrada, mesmo JSON, diff limpo.
  dens.sort((a, b) => a.worldY - b.worldY || a.worldX - b.worldX);
  chunk.enemies = dens;
  byKind[kind] = (byKind[kind] ?? 0) + dens.length;
}

const chunksWith = world.chunks.filter((c) => c.enemies.length > 0);
const mixedAfter = chunksWith.filter((c) => new Set(c.enemies.map((e) => e.type)).size > 1).length;

writeFileSync(WORLD_PATH, JSON.stringify(world));
console.log(
  `telas com inimigo: ${chunksWith.length}/${world.chunks.length} `
  + `(antes: ${purityBefore.pure} puras + ${purityBefore.mixed} misturadas)\n`
  + `covas: ${chunksWith.reduce((n, c) => n + c.enemies.length, 0)} `
  + `(convertidas ${converted}, movidas ${moved}, novas ${added}, descartadas ${dropped})\n`
  + `por espécie: ${JSON.stringify(byKind)}\n`
  + `telas ainda misturadas: ${mixedAfter} (tem de ser 0)`,
);
