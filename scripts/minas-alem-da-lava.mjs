// OS VEIOS FICAM DO OUTRO LADO DA LAVA (pedido do autor, 2026-11-11: "faça o jogador obrigatoriamente atravessar do
// outro lado do lago de lava, para aí sim achar pedras que podem minerar. Não deixe as pedras ficar tão na cara assim,
// porque senão ele não vai nem explorar essa parte do cenário").
//
// Os quatro veios do lago (dois de carvão, dois de minério) estavam na margem sul e na leste, à vista de quem chega,
// e três de ferro sobravam soltos pelo vale: a travessia era opcional. Todos viram pedra comum no mesmo lugar.
// Agora eles moram no fundo do CORREDOR DO NORTE, atrás do lago, longe da margem por onde o herói chega. Os dois
// arbustos secos que abriam o corredor pelo leste (10,3 e 10,4; o machado passava por eles sem tocar na lava)
// viram LAVA, emendando o lago no fio de lava do cantarelo: o corredor só se alcança afundando pedra na lava.
// Pela margem leste, por onde se chega, a travessia é de DUAS pedras (de 11,4: 10,4 e depois 10,3 ou 9,4); pelo
// oeste, de noite, é uma (ver MIN_STONES). Onde estavam os veios ficam pedras comuns: são elas que a picareta quebra
// para dar a pedra da travessia.
//
// O mata-moscas do canto (1,1) continua no corredor: agora pede a lava (duas pedras) e o machado (o arbusto em 2,1).
// A dica dele vem depois da do cantarelo, que já ensina que pedra na lava vira chão.
//
// A PROVA, partindo do começo da aventura:
// - com tudo o que uma ferramenta abre ABERTO (machado, foice, fogo, picareta nas pedras comuns), mas a lava fechada,
//   nenhum veio tem um vizinho alcançável;
// - com a lava aberta também, cada veio tem;
// - a travessia mais curta tem exatamente MIN_STONES tiles de lava, a da margem leste tem EAST_STONES, e há pedras
//   comuns de sobra deste lado;
// - o que deixou de se alcançar sem a lava é só o corredor do norte (e o bolsão do mata-moscas).
// Depois de rodar, confira também `npm run audit:stacks`. O `trilhas-cogumelos.mjs` (que já não é ponto fixo do mapa:
// as ferramentas saíram do chão depois dele) aprendeu a mesma lava, para não devolver os arbustos se rodar de novo.
//
// IDEMPOTENTE e DETERMINÍSTICO (mira no estado final). Faz backup em backup/world-pre-minas-alem-da-lava.json.
//
//   node scripts/minas-alem-da-lava.mjs           # aplica
//   node scripts/minas-alem-da-lava.mjs --check   # só confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeCanStep } from './relevo.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const worldPath = path.resolve(here, '../public/world.json');
const backupPath = path.resolve(here, '../backup/world-pre-minas-alem-da-lava.json');
const check = process.argv.includes('--check');

const raw = fs.readFileSync(worldPath, 'utf8');
const world = JSON.parse(raw);
const { worldChunksX, worldChunksY, chunkColumns: CW, chunkRows: CH } = world.meta;
const W = worldChunksX * CW;
const H = worldChunksY * CH;

/** Os arbustos secos da entrada leste do corredor viram lava. */
const NEW_LAVA = [[10, 3], [10, 4]];
/**
 * Os veios antigos viram pedra comum, no mesmo lugar: os quatro da margem à vista (a fonte das pedras da travessia) e
 * os três de ferro que sobraram soltos pelo vale (oeste, sudoeste e sul), que tornavam a travessia opcional.
 */
const OLD_VEINS = [[4, 9], [10, 6], [11, 7], [7, 10], [10, 28], [8, 34], [28, 43]];
/**
 * Os veios novos, na fileira do FUNDO do corredor do norte, colados no paredão: o mais longe da margem que se vê. Um
 * tile livre entre eles (3,0, 5,0, 7,0) e a fileira 1 inteira livre, que é o caminho até o arbusto do mata-moscas.
 */
const NEW_VEINS = [['coalRock', 2, 0], ['coalRock', 4, 0], ['ironRock', 6, 0], ['ironRock', 8, 0]];
/**
 * Quantas pedras a travessia mais curta pede: UMA, pelo oeste (de noite, sobre a flor da lua em 1,3, depois de a foice
 * abrir o mato em 1,4: a pedra vai em 2,3). Pela margem leste, por onde se chega, são duas.
 */
const MIN_STONES = 1;
/** A travessia pela margem leste: do tile de chão 11,4 até o corredor (9,3). */
const EAST = { from: [11, 4], to: [9, 3] };
const EAST_STONES = 2;
/** O corredor do norte (e o bolsão do mata-moscas): o único lugar que pode deixar de se alcançar sem a lava. */
const CORRIDOR = { x0: 0, y0: 0, x1: 11, y1: 3 };

const VEINS = new Set(['ironRock', 'coalRock']);
const FUNGI = new Set(['porcini', 'morel', 'puffball', 'inkCap', 'chanterelle', 'flyAgaric', 'oyster', 'jackOLantern']);
// constants.SOLID_UPPER_FRAMES
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 73, 74]);
const SEA = 33;
const GROUND = 5;
const key = (x, y) => `${x},${y}`;
const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
const at = (x, y) => { const c = chunkOf(x, y); return { c, lx: x % CW, ly: y % CH }; };
const relief = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : chunkOf(x, y).relief?.[y % CH]?.[x % CW] ?? 0);
const canStep = makeCanStep(relief);
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// O que não se abre de jeito nenhum; tudo o mais que bloqueia (arbusto, mato, árvore seca, pedra comum) se abre com
// uma ferramenta. A lava é a pergunta: fechada, aberta, ou com custo (uma pedra por tile).
const NEVER = new Set(['water', 'campfire', 'hearth', 'toolbox', 'furnace', 'altar', 'bridgeSpot', 'ironRock', 'coalRock', 'lockedDoor', 'gardenGate']);
const OPENABLE = new Set(['dryShrub', 'dryBush', 'tallGrass', 'dryTree', 'rock', 'moonflower', 'plantSpot', 'swingGate']);

/**
 * A distância em PEDRAS desde o começo (0-1 BFS): andar custa 0, entrar num tile de lava custa 1. `lava: false`
 * fecha a lava de vez. Devolve o custo mínimo de cada tile alcançado.
 */
const stonesTo = (lavaOpen) => {
  const npcs = new Set(world.chunks.flatMap((c) => c.npcs.map((n) => key(n.worldX, n.worldY))));
  // o cogumelo nascendo é um corpo no caminho (WorldQuery.isSolidForEntities); o resto do chão se pisa
  const items = new Set(world.chunks.flatMap((c) => (c.pickups ?? []).filter((p) => FUNGI.has(p.type)).map((p) => key(p.worldX, p.worldY))));
  const propAt = new Map(world.props.map((p) => [key(p.worldX, p.worldY), p.type]));
  const solid = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    const { c, lx, ly } = at(x, y);
    return c.collisions[ly][lx] || SOLID_UPPER.has(c.upper[ly][lx]) || c.ground[ly][lx] === SEA;
  };
  const start = [world.meta.playerStart.worldX, world.meta.playerStart.worldY];
  const cost = new Map([[key(...start), 0]]);
  const dq = [start];
  while (dq.length) {
    const [x, y] = dq.shift();
    const here = cost.get(key(x, y));
    for (const [dx, dy] of N4) {
      const nx = x + dx; const ny = y + dy; const k = key(nx, ny);
      if (!canStep(x, y, nx, ny) || solid(nx, ny) || npcs.has(k) || items.has(k)) continue;
      const type = propAt.get(k);
      if (type && (NEVER.has(type) || (type !== 'lava' && !OPENABLE.has(type)))) continue;
      if (type === 'lava' && !lavaOpen) continue;
      const next = here + (type === 'lava' ? 1 : 0);
      if (cost.has(k) && cost.get(k) <= next) continue;
      cost.set(k, next);
      if (type === 'lava') dq.push([nx, ny]); else dq.unshift([nx, ny]);
    }
  }
  return cost;
};
const inCorridor = (x, y) => x >= CORRIDOR.x0 && x <= CORRIDOR.x1 && y >= CORRIDOR.y0 && y <= CORRIDOR.y1;
const touches = (reach, x, y) => N4.some(([dx, dy]) => reach.has(key(x + dx, y + dy)));
const best = (reach, x, y) => Math.min(...N4.map(([dx, dy]) => reach.get(key(x + dx, y + dy)) ?? Infinity));

const before = stonesTo(false);

// ── O QUE MUDA ──────────────────────────────────────────────────────────────────────────────
const problems = [];
const clearTile = (x, y) => {
  const { c, lx, ly } = at(x, y);
  c.upper[ly][lx] = null;
  c.collisions[ly][lx] = false;
};
// 1. a entrada leste do corredor vira lava
for (const [x, y] of NEW_LAVA) {
  const existing = world.props.find((p) => p.worldX === x && p.worldY === y);
  if (existing?.type === 'lava') continue;
  if (existing && existing.type !== 'dryShrub') { problems.push(`${key(x, y)}: tem ${existing.type}, esperava um arbusto seco`); continue; }
  if (existing) world.props.splice(world.props.indexOf(existing), 1);
  const { c, lx, ly } = at(x, y);
  if (c.ground[ly][lx] !== GROUND || relief(x, y) !== 0) { problems.push(`${key(x, y)}: não é chão`); continue; }
  clearTile(x, y);
  world.props.push({ type: 'lava', worldX: x, worldY: y });
}
// 2. os veios antigos viram pedra comum, no mesmo lugar (o tile continua bloqueado do mesmo jeito)
for (const [x, y] of OLD_VEINS) {
  const existing = world.props.find((p) => p.worldX === x && p.worldY === y);
  if (existing?.type === 'rock') continue;
  if (!existing || !VEINS.has(existing.type)) { problems.push(`${key(x, y)}: esperava um veio, tem ${existing?.type ?? 'nada'}`); continue; }
  existing.type = 'rock';
}
// 3. os veios novos no fundo do corredor (chão + UMA coisa: a decoração do tile sai)
for (const [type, x, y] of NEW_VEINS) {
  const existing = world.props.find((p) => p.worldX === x && p.worldY === y);
  if (existing?.type === type) continue;
  if (existing) { problems.push(`${key(x, y)}: já tem ${existing.type}`); continue; }
  const busy = world.chunks.some((ch) => [...(ch.pickups ?? []), ...ch.npcs].some((p) => p.worldX === x && p.worldY === y));
  if (busy) { problems.push(`${key(x, y)}: tem item ou NPC`); continue; }
  const { c, lx, ly } = at(x, y);
  if (c.ground[ly][lx] !== GROUND || c.collisions[ly][lx] || SOLID_UPPER.has(c.upper[ly][lx]) || relief(x, y) !== 0) {
    problems.push(`${key(x, y)}: não é chão livre`);
    continue;
  }
  clearTile(x, y);
  world.props.push({ type, worldX: x, worldY: y });
}

// ── A PROVA ─────────────────────────────────────────────────────────────────────────────────
const dry = stonesTo(false);
const wet = stonesTo(true);
const veins = world.props.filter((p) => VEINS.has(p.type));
for (const v of veins) {
  if (touches(dry, v.worldX, v.worldY)) problems.push(`${key(v.worldX, v.worldY)}: o veio se alcança sem atravessar a lava`);
  if (!touches(wet, v.worldX, v.worldY)) problems.push(`${key(v.worldX, v.worldY)}: o veio não se alcança nem atravessando a lava`);
}
const crossing = Math.min(...veins.map((v) => best(wet, v.worldX, v.worldY)));
if (crossing !== MIN_STONES) problems.push(`a travessia mais curta pede ${crossing} pedras, e não ${MIN_STONES}`);
// A margem leste sozinha: a mesma conta, partindo de 11,4 (que se alcança a pé), com o oeste fechado pela pergunta.
const eastCost = (() => {
  const propAt = new Map(world.props.map((p) => [key(p.worldX, p.worldY), p.type]));
  const startKey = key(...EAST.from);
  if (!dry.has(startKey)) return Infinity;
  const cost = new Map([[startKey, 0]]);
  const dq = [EAST.from];
  while (dq.length) {
    const [x, y] = dq.shift();
    for (const [dx, dy] of N4) {
      const nx = x + dx; const ny = y + dy; const k = key(nx, ny);
      if (!wet.has(k) || nx < 0 || ny < 0) continue;
      const lava = propAt.get(k) === 'lava';
      const next = cost.get(key(x, y)) + (lava ? 1 : 0);
      if (cost.has(k) && cost.get(k) <= next) continue;
      // só a margem leste (x >= 10), a lava e o corredor: sem dar a volta pelo sul até o oeste do lago
      if (!lava && !inCorridor(nx, ny) && nx < 10) continue;
      cost.set(k, next);
      if (lava) dq.push([nx, ny]); else dq.unshift([nx, ny]);
    }
  }
  return cost.get(key(...EAST.to)) ?? Infinity;
})();
if (eastCost !== EAST_STONES) problems.push(`pela margem leste a travessia pede ${eastCost} pedras, e não ${EAST_STONES}`);
const newLava = new Set(NEW_LAVA.map(([x, y]) => key(x, y)));
const lost = [...before.keys()].filter((k) => !dry.has(k) && !newLava.has(k)).filter((k) => { const [x, y] = k.split(',').map(Number); return !inCorridor(x, y); });
if (lost.length) problems.push(`fechou mais que o corredor: ${lost.join(' ')}`);
const stones = world.props.filter((p) => p.type === 'rock' && touches(dry, p.worldX, p.worldY)).length;
if (stones < MIN_STONES * 2) problems.push(`só ${stones} pedras comuns se alcançam deste lado`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const summary = `veios no corredor do norte (${NEW_VEINS.map(([t, x, y]) => `${t} ${key(x, y)}`).join(', ')}); travessia de ${crossing} pedra(s) pelo oeste e ${eastCost} pela margem leste; ${stones} pedras comuns deste lado`;
const out = `${JSON.stringify(world, null, 2)}\n`;
if (check) {
  if (out.trim() !== raw.split('\r\n').join('\n').trim()) {
    console.error('world.json NÃO é o ponto fixo de minas-alem-da-lava.mjs');
    process.exit(1);
  }
  console.log(`world.json OK: ${summary}; a prova passa.`);
} else {
  // o backup é o mundo de ANTES da primeira rodada: nunca sobrescrever
  if (!fs.existsSync(backupPath) && out.trim() !== raw.split('\r\n').join('\n').trim()) {
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.writeFileSync(backupPath, raw);
  }
  fs.writeFileSync(worldPath, out);
  console.log(`world.json: ${summary}; a prova passa.`);
}
