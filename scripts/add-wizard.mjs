// O MAGO GANHA UM CORPO — ele tinha roteiro, história e missão, e não estava plantado no mapa.
//
// Modelo enrich-*: LÊ public/world.json e ACRESCENTA — nunca refaz. Idempotente (com um mago já
// no mapa ele não escreve nada, esteja onde estiver), determinístico (zero Math.random, zero
// timestamp) e proibido de tocar em terreno, colisões, props ou em qualquer outra entidade.
//
// `node scripts/add-wizard.mjs --check` não escreve: sai 1 se o mago ainda não estiver no mapa.
//
// ONDE, E POR QUÊ. Ele fica no tile a LESTE da fogueira acesa mais próxima do `playerStart` — a
// fogueira-lar, que é a que o runtime escolhe. As duas razões são a mesma:
//
//   · é o COMEÇO DO JOGO. Um fogo aceso é o único farol de um mundo escuro, e é para onde o
//     jogador anda primeiro. O mago abre a história ("Finally... you've arrived") e uma abertura
//     que o jogador precise caçar não abre nada.
//   · é a LORE. A fala dele chama aquela fogueira de "the last flame of the world" e manda
//     acordar o graveto "in THIS flame" — apontando para a fogueira ao lado. Plantado longe de
//     uma, a instrução dele apontaria para o vazio.
//
// A PROVA DE BFS não é cerimônia: NPC BLOQUEIA o tile em que está, e um corpo no lugar errado
// sela um caminho para sempre. O script compara o alcançável a partir do `playerStart` antes e
// depois — a única diferença aceita é o próprio tile do mago.

import fs from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

const COLS = 12;
const ROWS = 12;
const SEA_TILE_FRAME = 33;
// Espelha SOLID_UPPER_FRAMES (src/game/constants.ts). Uma cópia num script de escrita só é
// perigosa quando ela é a autoridade; aqui ela só pode ser CONSERVADORA DEMAIS, e uma parede a
// mais no BFS falha o script em vez de aprovar um caminho selado.
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 41, 42, 43, 44]);

const worldPath = fileURLToPath(new URL('../public/world.json', import.meta.url));
const backupPath = fileURLToPath(new URL('../backup/world-pre-wizard.json', import.meta.url));
const check = process.argv.includes('--check');

const raw = await fs.readFile(worldPath, 'utf8');
const world = JSON.parse(raw);

const chunkAt = (x, y) => world.chunks.find(
  (c) => c.cx === Math.floor(x / COLS) && c.cy === Math.floor(y / ROWS),
);
const local = (x, y) => [((x % COLS) + COLS) % COLS, ((y % ROWS) + ROWS) % ROWS];

const npcs = [];
for (const chunk of world.chunks) for (const npc of chunk.npcs ?? []) npcs.push(npc);
const propAt = new Map();
for (const prop of world.props ?? []) propAt.set(`${prop.worldX},${prop.worldY}`, prop);
const npcAt = new Set(npcs.map((n) => `${n.worldX},${n.worldY}`));

// ── Já está no mapa? ────────────────────────────────────────────────────────
const standing = npcs.find((n) => n.type === 'wizard');
if (standing) {
  console.log(`O mago já está no mapa, em ${standing.worldX},${standing.worldY}. Nada a fazer.`);
  process.exit(0);
}
if (check) {
  console.error('--check: o mago NÃO está no mapa. Rode o script sem --check.');
  process.exit(1);
}

// ── A fogueira-lar: a acesa mais próxima do playerStart, que é o que o runtime escolhe ──
const start = world.meta.playerStart;
const fires = (world.props ?? []).filter((p) => p.type === 'campfire' && p.lit);
if (fires.length === 0) {
  console.error('Não há fogueira ACESA no mundo — sem a última chama, o mago não tem onde ficar.');
  process.exit(1);
}
const dist = (p) => Math.hypot(p.worldX - start.worldX, p.worldY - start.worldY);
const home = fires.reduce((best, f) => (dist(f) < dist(best) ? f : best));

// ── O tile: o vizinho cardeal livre mais a leste, e depois o que houver ─────
/**
 * O que é parede PARA SEMPRE. Rocha, árvore morta, mato alto, água e lava bloqueiam HOJE e o
 * jogo inteiro é sobre removê-los — contá-los como parede responderia a pergunta errada ("o
 * herói consegue passar agora?") em vez da que importa ("existe caminho?"). Fica de fora só o
 * que nenhuma ferramenta abre: o terreno, e os props que são móveis fixos.
 */
const PERMANENT_PROPS = new Set(['campfire', 'toolbox', 'furnace', 'altar', 'pyre']);

const walkable = (x, y) => {
  const chunk = chunkAt(x, y);
  if (!chunk) return false; // fora do mundo o chão é mar
  const [lx, ly] = local(x, y);
  if (chunk.collisions[ly][lx]) return false;
  if (chunk.ground[ly][lx] === SEA_TILE_FRAME) return false;
  const upper = chunk.upper[ly][lx];
  if (upper !== null && SOLID_UPPER.has(upper)) return false;
  if (PERMANENT_PROPS.has(propAt.get(`${x},${y}`)?.type)) return false;
  if (npcAt.has(`${x},${y}`)) return false;
  return true;
};

/** O tile DELE, ao contrário, tem de estar limpo de verdade: ninguém divide um tile. */
const vacant = (x, y) => {
  const chunk = chunkAt(x, y);
  if (!chunk || !walkable(x, y)) return false;
  const [lx, ly] = local(x, y);
  return chunk.upper[ly][lx] === null && !propAt.has(`${x},${y}`);
};

const candidates = [
  [home.worldX + 1, home.worldY],
  [home.worldX - 1, home.worldY],
  [home.worldX, home.worldY + 1],
  [home.worldX, home.worldY - 1],
];
const spot = candidates.find(([x, y]) => vacant(x, y));
if (!spot) {
  console.error(`Nenhum vizinho livre da fogueira-lar (${home.worldX},${home.worldY}).`);
  process.exit(1);
}
const [wx, wy] = spot;

// ── A prova: o corpo dele não sela nada ─────────────────────────────────────
const flood = (blocked) => {
  const seen = new Set();
  const queue = [[start.worldX, start.worldY]];
  seen.add(`${start.worldX},${start.worldY}`);
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const key = `${nx},${ny}`;
      if (seen.has(key) || key === blocked || !walkable(nx, ny)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
};
const before = flood(null);
const after = flood(`${wx},${wy}`);
const lost = [...before].filter((k) => !after.has(k));
if (!before.has(`${wx},${wy}`)) {
  console.error(`O tile ${wx},${wy} não é alcançável a partir do playerStart — o mago ficaria ilhado.`);
  process.exit(1);
}
if (lost.length !== 1 || lost[0] !== `${wx},${wy}`) {
  console.error(
    `O corpo do mago em ${wx},${wy} selaria ${lost.length - 1} tiles: ${lost.slice(0, 8).join(' ')}...`,
  );
  process.exit(1);
}

// ── Escreve ─────────────────────────────────────────────────────────────────
// O backup é o TEXTO original, guardado antes de a mutação existir: um backup tirado do objeto
// já editado é uma cópia do estrago.
await fs.mkdir(fileURLToPath(new URL('../backup', import.meta.url)), { recursive: true });
await fs.writeFile(backupPath, raw, 'utf8');

const target = chunkAt(wx, wy);
target.npcs = [...(target.npcs ?? []), { type: 'wizard', worldX: wx, worldY: wy }];
await fs.writeFile(worldPath, `${JSON.stringify(world, null, 2)}\n`, 'utf8');
console.log(
  `O mago está em ${wx},${wy} (chunk ${target.cx},${target.cy}), ao lado da fogueira-lar `
  + `${home.worldX},${home.worldY} — ${dist({ worldX: wx, worldY: wy }).toFixed(1)} tiles do `
  + `playerStart ${start.worldX},${start.worldY}. BFS: nada selado.`,
);
