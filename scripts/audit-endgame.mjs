// DÁ PARA ZERAR? — a auditoria do caminho até a pira acesa.
//
// Zerar este jogo é UMA coisa: fechar a pira central (PYRE_LOGS_REQUIRED toras) e encostar nela
// uma TOCHA ACESA. Tudo o mais é estrada. Este script lê o `public/world.json` e pergunta, em
// ordem, se cada elo dessa corrente existe:
//
//   1. a pira existe, é alcançável, e há onde ficar de pé para encostar nela;
//   2. dá para levar FOGO até lá — a tocha queima por TORCH_BURN_MS e morre, então o que importa
//      não é a distância em linha reta, é se existe uma CADEIA de fontes de fogo (fogueiras
//      acesas, poças de lava, e fogueiras apagadas que o jogador acende pelo caminho) em que
//      cada salto cabe num fôlego de tocha;
//   3. dá para juntar as toras — pelas missões (metade do baralho fecha a torre) ou na mão;
//   4. cada missão que conta é cumprível: o NPC é alcançável, a fogueira que o destrava dá para
//      acender, e a ferramenta que ela pede existe no mundo.
//
// Ele NÃO joga o jogo: é análise estática do mapa. Um "ok" aqui é "o mundo não torna impossível",
// não "eu zerei". Sai 1 se algum elo estiver quebrado.
//
//   node scripts/audit-endgame.mjs

import fs from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

const COLS = 12;
const ROWS = 12;
const SEA_TILE_FRAME = 33;
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 41, 42, 43, 44]);
// O QUE ABRE CADA PROP. `null` = nada abre (parede de verdade); `''` = já é passável.
//
// Esta tabela é o coração da auditoria, porque ela transforma "existe caminho?" na pergunta que
// importa de verdade: **existe caminho COM O QUE O HERÓI TEM NA MÃO NAQUELE MOMENTO?** Um mundo
// em que o machado está atrás de uma árvore que só o machado derruba é um mundo intransponível,
// e nenhuma varredura otimista veria isso.
const OPENED_BY = {
  campfire: null, toolbox: null, furnace: null, altar: null, pyre: null,
  ironRock: null, // o veio nunca quebra — ele é parede permanente (ver CLAUDE.md)
  water: null,    // só se abre num bridgeSpot, tratado à parte
  dryTree: 'axe', dryShrub: 'axe',
  rock: 'pickaxe',
  lava: 'pickaxe', // pedra na lava vira degrau de basalto
  tallGrass: 'scythe', carnivorousPlant: 'scythe',
  dryBush: 'torch', // arbusto seco não se corta: queima
  swingGate: '', moonflower: '', plantSpot: '', bombSpot: '', bridgeSpot: '', levelPortal: '', stairs: '',
};

// Os números do jogo, copiados de src/game/constants.ts. Uma cópia num script de LEITURA é
// barata; se ela divergir, o script mente para menos — e é por isso que ele imprime os valores.
const PYRE_LOGS_REQUIRED = 15;
const TORCH_BURN_MS = 5000;
const MOVE_MS_PER_TILE = 150;
const NPC_GATE_RADIUS_TILES = 3.2;
const QUEST_COUNT = 9;
const QUEST_PYRE_LOGS = Math.ceil(PYRE_LOGS_REQUIRED / Math.ceil(QUEST_COUNT / 2));
/** Quantos tiles cabem num fôlego de tocha, com folga para mirar, virar e apertar o botão. */
const TORCH_TILES = Math.floor((TORCH_BURN_MS / MOVE_MS_PER_TILE) * 0.8);

const world = JSON.parse(await fs.readFile(
  fileURLToPath(new URL('../public/world.json', import.meta.url)), 'utf8',
));

const chunkAt = (x, y) => world.chunks.find(
  (c) => c.cx === Math.floor(x / COLS) && c.cy === Math.floor(y / ROWS),
);
const key = (x, y) => `${x},${y}`;
const propAt = new Map();
for (const p of world.props ?? []) propAt.set(key(p.worldX, p.worldY), p);
const npcs = [];
for (const c of world.chunks) for (const n of c.npcs ?? []) npcs.push(n);
const npcAt = new Set(npcs.map((n) => key(n.worldX, n.worldY)));
const pickups = [];
for (const c of world.chunks) for (const p of c.pickups ?? []) pickups.push(p);

/** Os frames de tile que são ÁRVORE VIVA — só o machado de aço os derruba. */
const TREE_TILE_FRAMES = new Set([3, 4, 36, 37]);

/**
 * O tile é atravessável para quem tem `tools` na mão? Com o conjunto cheio (`ALL_TOOLS`) esta é
 * a pergunta otimista de sempre; com o conjunto vazio, é o BOOTSTRAP — o que o herói alcança de
 * mãos abanando, antes de qualquer ferramenta existir para ele.
 */
const walkableWith = (tools) => (x, y) => {
  const chunk = chunkAt(x, y);
  if (!chunk) return false;
  const lx = ((x % COLS) + COLS) % COLS;
  const ly = ((y % ROWS) + ROWS) % ROWS;
  if (chunk.collisions[ly][lx]) return false;
  if (chunk.ground[ly][lx] === SEA_TILE_FRAME) return false;
  const upper = chunk.upper[ly][lx];
  if (upper !== null && SOLID_UPPER.has(upper)) {
    // Pinheiro vivo é o único tile em pé que uma ferramenta abre.
    if (!TREE_TILE_FRAMES.has(upper) || !tools.has('greatAxe')) return false;
  }
  if (npcAt.has(key(x, y))) return false;
  const prop = propAt.get(key(x, y))?.type;
  if (prop !== undefined) {
    const opener = OPENED_BY[prop];
    if (opener === null) return false;
    if (opener !== '' && !tools.has(opener)) return false;
  }
  return true;
};

const ALL_TOOLS = new Set(['axe', 'pickaxe', 'greatAxe', 'scythe', 'torch']);
let walkable = walkableWith(ALL_TOOLS);

/** Distância em PASSOS de todo tile alcançável a partir de um conjunto de origens. */
const bfs = (origins) => {
  const dist = new Map();
  const queue = [];
  for (const [x, y] of origins) {
    if (!walkable(x, y)) continue;
    dist.set(key(x, y), 0);
    queue.push([x, y]);
  }
  for (let head = 0; head < queue.length; head += 1) {
    const [x, y] = queue[head];
    const d = dist.get(key(x, y));
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (dist.has(key(nx, ny)) || !walkable(nx, ny)) continue;
      dist.set(key(nx, ny), d + 1);
      queue.push([nx, ny]);
    }
  }
  return dist;
};

const neighbours = (x, y) => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
const standingSpots = (x, y) => neighbours(x, y).filter(([nx, ny]) => walkable(nx, ny));

const problems = [];
const notes = [];
const say = (ok, text) => {
  console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${text}`);
  if (!ok) problems.push(text);
};

console.log('DÁ PARA ZERAR?');
console.log(`  pira: ${PYRE_LOGS_REQUIRED} toras · missão paga ${QUEST_PYRE_LOGS} · `
  + `${Math.ceil(QUEST_COUNT / 2)} de ${QUEST_COUNT} missões fecham a torre`);
console.log(`  tocha: ${TORCH_BURN_MS}ms ÷ ${MOVE_MS_PER_TILE}ms/tile = `
  + `${Math.floor(TORCH_BURN_MS / MOVE_MS_PER_TILE)} tiles, ${TORCH_TILES} com folga\n`);

// ── 1. A PIRA ───────────────────────────────────────────────────────────────
console.log('1. A PIRA');
const pyres = (world.props ?? []).filter((p) => p.type === 'pyre');
say(pyres.length === 1, `existe exatamente uma pira no mundo (achei ${pyres.length})`);
if (pyres.length === 0) { console.log('\nSem pira não há fim de jogo.'); process.exit(1); }
const pyre = pyres[0];
const start = world.meta.playerStart;
const fromStart = bfs([[start.worldX, start.worldY]]);
const pyreSpots = standingSpots(pyre.worldX, pyre.worldY);
say(pyreSpots.length > 0, `há onde ficar de pé para encostar nela (${pyreSpots.length} tiles)`);
const pyreReach = pyreSpots.filter(([x, y]) => fromStart.has(key(x, y)));
say(pyreReach.length > 0,
  `a pira (${pyre.worldX},${pyre.worldY}) é alcançável do nascimento `
  + `(${pyreReach.length > 0 ? `${Math.min(...pyreReach.map(([x, y]) => fromStart.get(key(x, y))))} passos` : 'NÃO'})`);

// ── 2. O FOGO ATÉ LÁ ────────────────────────────────────────────────────────
console.log('\n2. LEVAR FOGO ATÉ A PIRA');
const fires = (world.props ?? []).filter((p) => p.type === 'campfire');
const lava = (world.props ?? []).filter((p) => p.type === 'lava');
const litFires = fires.filter((f) => f.lit);
say(litFires.length > 0, `existe fonte de fogo acesa no mundo (${litFires.length} fogueiras + ${lava.length} poças de lava)`);

// Cada fonte de fogo é um NÓ; um salto existe se der para andar de uma até a outra dentro de um
// fôlego de tocha. Fogueira apagada só vira fonte DEPOIS de acesa — então isto é uma propagação.
const sources = [
  ...fires.map((f) => ({ kind: 'campfire', x: f.worldX, y: f.worldY, lit: Boolean(f.lit) })),
  ...lava.map((l) => ({ kind: 'lava', x: l.worldX, y: l.worldY, lit: true })),
];
const spotsOf = (s) => standingSpots(s.x, s.y);
const alight = new Set(sources.filter((s) => s.lit).map((s, i) => i).map(() => 0)); // preenchido abaixo
alight.clear();
sources.forEach((s, i) => { if (s.lit) alight.add(i); });

let grew = true;
let hops = 0;
while (grew) {
  grew = false;
  const origins = [...alight].flatMap((i) => spotsOf(sources[i]));
  if (origins.length === 0) break;
  const reach = bfs(origins);
  for (let i = 0; i < sources.length; i += 1) {
    if (alight.has(i)) continue;
    const near = spotsOf(sources[i]).some(([x, y]) => (reach.get(key(x, y)) ?? Infinity) <= TORCH_TILES);
    if (near) { alight.add(i); grew = true; }
  }
  hops += 1;
  if (hops > sources.length + 2) break;
}
const flameOrigins = [...alight].flatMap((i) => spotsOf(sources[i]));
const flameReach = bfs(flameOrigins);
const pyreFlameSteps = Math.min(...pyreSpots.map(([x, y]) => flameReach.get(key(x, y)) ?? Infinity));
say(pyreFlameSteps <= TORCH_TILES,
  `a tocha chega VIVA à pira: ${Number.isFinite(pyreFlameSteps) ? `${pyreFlameSteps} passos` : 'inalcançável'} `
  + `da fonte de fogo mais próxima (teto ${TORCH_TILES})`);
notes.push(`fontes de fogo acendíveis em cadeia: ${alight.size} de ${sources.length}`);

// ── 3. AS TORAS ─────────────────────────────────────────────────────────────
console.log('\n3. AS TORAS');
const dryTrees = (world.props ?? []).filter((p) => p.type === 'dryTree').length;
const dryShrubs = (world.props ?? []).filter((p) => p.type === 'dryShrub').length;
const woodPickups = pickups.filter((p) => p.type === 'wood').length;
say(dryTrees + woodPickups >= PYRE_LOGS_REQUIRED,
  `dá para fechar a torre na MÃO: ${dryTrees} árvores mortas + ${woodPickups} gravetos no chão `
  + `≥ ${PYRE_LOGS_REQUIRED} toras`);
notes.push(`(e ${dryShrubs} arbustos secos, que não dão graveto)`);

// ── 4. AS MISSÕES QUE CONTAM ────────────────────────────────────────────────
console.log('\n4. AS MISSÕES (metade fecha a torre)');
const toolOf = { axe: 'axe', pickaxe: 'pickaxe', greatAxe: 'greatAxe', scythe: 'scythe', bucket: 'bucket', shovel: 'shovel' };
const have = (kind) => pickups.filter((p) => p.type === kind).length;
const reachablePickup = (kind) => pickups.some(
  (p) => p.type === kind && (fromStart.has(key(p.worldX, p.worldY))
    || standingSpots(p.worldX, p.worldY).some(([x, y]) => fromStart.has(key(x, y)))),
);

// Uma missão de ENTREGA só acontece com o NPC destravado: fogueira ao lado dele acesa.
const gateOf = (npc) => fires.find(
  (f) => Math.hypot(f.worldX - npc.worldX, f.worldY - npc.worldY) <= NPC_GATE_RADIUS_TILES,
);
const litIndexOf = (f) => sources.findIndex((s) => s.kind === 'campfire' && s.x === f.worldX && s.y === f.worldY);

const QUESTS = [
  { npc: 'blackCat', needs: ['wood'], tool: 'axe', why: 'acender 3 fogueiras (o graveto vira tocha)' },
  { npc: 'poet', needs: [], tool: 'greatAxe', why: 'derrubar 4 pinheiros vivos' },
  { npc: 'painter', needs: [], tool: 'scythe', why: 'colher 6 sementes' },
  { npc: 'businessMan', needs: ['wood'], tool: 'axe', why: 'entregar 6 gravetos' },
  { npc: 'salesman', needs: ['wood', 'stone'], tool: 'pickaxe', why: 'entregar 4 pedras + 4 gravetos' },
  { npc: 'radiationSuit', needs: ['iron'], tool: null, why: 'entregar 1 barra de ferro' },
  { npc: 'astronaut', needs: ['ore'], tool: 'pickaxe', why: 'entregar 6 minérios' },
  { npc: 'death', needs: ['wood'], tool: 'axe', why: 'acender 5 fogueiras + fabricar 3 carvões' },
  { npc: 'wizard', needs: [], tool: null, why: 'matar 8 caveiras + pisar em 6 telas' },
];

let doable = 0;
for (const q of QUESTS) {
  const npc = npcs.find((n) => n.type === q.npc);
  if (!npc) { say(false, `${q.npc}: não está no mapa`); continue; }
  const spots = standingSpots(npc.worldX, npc.worldY);
  const reachable = spots.some(([x, y]) => fromStart.has(key(x, y)));
  const gate = gateOf(npc);
  const gateOk = !gate || gate.lit || alight.has(litIndexOf(gate));
  const toolOk = !q.tool || reachablePickup(toolOf[q.tool]);
  const ok = reachable && gateOk && toolOk;
  if (ok) doable += 1;
  const flags = [
    reachable ? null : 'INALCANÇÁVEL',
    gateOk ? null : 'fogueira do gate não acende',
    toolOk ? null : `sem ${q.tool} alcançável`,
  ].filter(Boolean);
  console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${q.npc.padEnd(14)} ${q.why}${flags.length ? `  [${flags.join(', ')}]` : ''}`);
  if (!ok) problems.push(`missão de ${q.npc}: ${flags.join(', ')}`);
}
say(doable >= Math.ceil(QUEST_COUNT / 2),
  `missões viáveis: ${doable} — precisa de ${Math.ceil(QUEST_COUNT / 2)} para fechar a torre só com elas`);

// ── 5. O BOOTSTRAP: a corrente saindo de MÃOS VAZIAS ────────────────────────
//
// A pergunta que nenhuma varredura otimista responde: o herói consegue pegar a PRIMEIRA
// ferramenta sem já ter uma? Um machado atrás de uma árvore que só o machado derruba é um mundo
// intransponível, e o mapa parece perfeito até alguém tentar jogar.
//
// O modelo é um ponto fixo: começa de mãos abanando, varre o alcançável, recolhe o que houver
// ao alcance, e repete até nada de novo aparecer. Cada rodada é um DEGRAU da progressão.
console.log('\n5. O BOOTSTRAP (de mãos vazias até a última ferramenta)');
const held = new Set();
const steps = [];
for (let round = 0; round < 20; round += 1) {
  walkable = walkableWith(held);
  const reach = bfs([[start.worldX, start.worldY]]);
  const canReach = (x, y) => reach.has(key(x, y))
    || neighbours(x, y).some(([nx, ny]) => reach.has(key(nx, ny)));
  const found = new Set();
  for (const pk of pickups) if (!held.has(pk.type) && canReach(pk.worldX, pk.worldY)) found.add(pk.type);
  const propReachable = (type) => (world.props ?? []).some(
    (pr) => pr.type === type && canReach(pr.worldX, pr.worldY),
  );
  // Ferramenta que PRODUZ material abre o material: machado→graveto, picareta→pedra e minério.
  const win = (what, cond) => { if (!held.has(what) && cond) found.add(what); };
  win('wood', held.has('axe') && propReachable('dryTree'));
  win('stone', held.has('pickaxe') && propReachable('rock'));
  win('ore', held.has('pickaxe') && propReachable('ironRock'));
  win('seeds', held.has('scythe') && propReachable('tallGrass'));
  // A TOCHA: um graveto na mão e uma fogueira ACESA ao alcance. É ela que abre arbusto seco.
  win('torch', held.has('wood') && fires.some((f) => f.lit && canReach(f.worldX, f.worldY)));
  if (found.size === 0) break;
  for (const f of found) held.add(f);
  steps.push([...found].sort().join(', '));
}
walkable = walkableWith(held);
steps.forEach((got, i) => console.log(`  degrau ${i + 1}: ${got}`));
for (const tool of ['axe', 'pickaxe', 'greatAxe', 'scythe', 'shovel', 'bucket']) {
  const n = have(tool);
  if (n === 0) { console.log(`  --   ${tool.padEnd(10)} nenhum no mundo`); continue; }
  const ok = held.has(tool);
  console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${tool.padEnd(10)} ${n} no mundo${ok ? '' : ' — NUNCA alcançável a partir do nascimento'}`);
  if (!ok) problems.push(`${tool} existe no mundo mas nenhuma cópia é alcançável na progressão`);
}
say(held.has('wood'), 'o herói consegue GRAVETO (a tora da pira, e o corpo da tocha)');
say(held.has('torch'), 'o herói consegue acender uma TOCHA (graveto + fogueira acesa ao alcance)');

// ── VEREDITO ────────────────────────────────────────────────────────────────
console.log('');
for (const n of notes) console.log(`  · ${n}`);
console.log('');
if (problems.length === 0) {
  console.log('VEREDITO: o mundo não torna o fim impossível. Todos os elos da corrente existem.');
  process.exit(0);
}
console.log(`VEREDITO: ${problems.length} elo(s) quebrado(s):`);
for (const p of problems) console.log(`  - ${p}`);
process.exit(1);
