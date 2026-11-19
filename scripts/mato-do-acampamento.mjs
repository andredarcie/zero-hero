// O MATO EM VOLTA DO ACAMPAMENTO (pedido do autor, 2026-11-17: "em volta do acampamento, remova um pouco das árvores e
// coloque o mato alto, bastante mato alto, dando a impressão de que o jogador teria que cortar esses matos para expandir
// o seu próprio acampamento"). O mato desta zona é VERDE no jogo (objects/TallGrassObject.green: não pega fogo), e só a
// foice que a Morte deixa no fim da terceira noite o corta (systems/Resting). Na grade do modo de construção ele é
// vermelho (runtime/homeGrid); cortado, vira chão livre e verde, e o save lembra (objects/CampGrass).
//
// O que este script faz, e só isto:
//   1. tira os PINHEIROS listados em PINES_OUT (o autor pediu: "remova um pouco das árvores"; só estes, um a um, e só se
//      o tile ainda é pinheiro — rodar de novo não tira mais nada);
//   2. põe um prop `tallGrass` no chão livre da zona, menos o miolo do acampamento e a passagem para o sul
//      (scripts/acampamento.mjs, CAMP_TILES), limpando a decoração rasteira debaixo (chão + uma coisa) — RALO
//      (o autor, 2026-11-19: "está demais... deixa um pouco mais ralo: se tem um mato alto aqui, dê um espaço e coloque
//      outro; não coloque tudo em carreira"): nenhum tufo encosta noutro de lado (sempre um tile de chão entre os dois)
//      e no máximo um encosta de quina, numa ordem sorteada pela coordenada — sai espalhado, nunca em fileira. O tufo
//      que não cabe mais na conta sai do arquivo (o tile fica chão);
//   3. PROVA por busca de caminho que nenhum tile que se alcançava do começo do jogo deixou de se alcançar (fora o
//      próprio mato), e que do começo se chega ao colchão, ao caderno e à bancada sem foice nenhuma.
//
// LÊ o world.json e acrescenta, como o CLAUDE.md manda: IDEMPOTENTE e DETERMINÍSTICO.
//
//   node scripts/mato-do-acampamento.mjs           # aplica
//   node scripts/mato-do-acampamento.mjs --check   # só confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { CAMP_TILES } from './acampamento.mjs';
import { makeCanStep } from './relevo.mjs';

/** A MESMA zona de runtime/homeGrid.ts (CAMP_ZONE) — mudou lá, muda aqui. */
export const CAMP_ZONE = { x0: 48, y0: 44, x1: 59, y1: 52 };
/** Os pinheiros que saem (pedido do autor): os de dentro da clareira a oeste e os da beira leste, perto da bancada. */
const PINES_OUT = [
  [49, 47], [50, 47], [51, 47], [50, 48], [51, 48], [49, 49], [49, 50],
  [56, 46], [57, 46], [56, 47], [57, 47], [57, 49], [57, 45],
];
/** Chão que fica sem mato de propósito: o pé da escada do morrinho ao norte (51,44), senão ele ficaria trancado. */
const KEEP_OPEN = new Set(['51,45']);
/**
 * Os tufos que entram PRIMEIRO no sorteio (e por isso sempre ficam): o (56,48), o primeiro que a foice alcança da frente
 * do acampamento (55,48), e o (57,47), de quina com ele — os dois que os cenários `lar`, `mato-alto` e `mato-volta` cortam.
 */
const SEEDS = ['56,48', '57,47'];
/** O sorteio da ordem: um número fixo por tile (o mesmo a cada rodada, então o script continua idempotente). */
const order = (x, y) => {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ 0x5bd1e995) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  return (h ^ (h >>> 12)) >>> 0;
};
/** As árvores e paredes do tileset (constants.SOLID_UPPER_FRAMES): sólidas no jogo sem `collisions` no arquivo. */
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 73, 74]);
/** O quadro do pinheiro do mapa. */
const PINE = 4;
/** O chão de mar/lago do tileset (constants.SEA_TILE_FRAME). */
const WATER_GROUND = 33;
/** O colchão, as pedras e o caderno (objects/HeroCamp) e o tile de frente de cada um e da bancada. */
const CAMP_SOLID = [[53, 48], [53, 49], [53, 47]];
const FRONT = [[54, 48], [54, 47], [54, 45]];

const inZone = (x, y) => x >= CAMP_ZONE.x0 && x <= CAMP_ZONE.x1 && y >= CAMP_ZONE.y0 && y <= CAMP_ZONE.y1;

const main = () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const worldPath = path.resolve(here, '../public/world.json');
  const check = process.argv.includes('--check');
  const raw = fs.readFileSync(worldPath, 'utf8');
  const world = JSON.parse(raw);
  const { chunkColumns: CW, chunkRows: CH } = world.meta;
  const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
  // a linha DENTRO do chunk: o mapa tem linhas negativas (a praia do norte, `meta.originCy`), e -1 % 12 é -1
  const ly = (y) => ((y % CH) + CH) % CH;
  const lx = (x) => ((x % CW) + CW) % CW;
  const cell = (x, y, layer) => chunkOf(x, y)?.[layer]?.[ly(y)]?.[lx(x)];
  const relief = (x, y) => cell(x, y, 'relief') ?? 0;
  const canStep = makeCanStep(relief);
  const problems = [];

  /** O que barra o passo agora: colisão, árvore do mapa, qualquer prop, item ou NPC autorado, e as peças do acampamento. */
  const blockedIn = (w) => {
    const taken = new Set(w.props.map((p) => `${p.worldX},${p.worldY}`));
    for (const c of w.chunks) {
      for (const p of c.pickups) taken.add(`${p.worldX},${p.worldY}`);
      for (const n of c.npcs) taken.add(`${n.worldX},${n.worldY}`);
    }
    for (const [x, y] of CAMP_SOLID) taken.add(`${x},${y}`);
    const of = (x, y) => w.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
    return (x, y) => {
      const c = of(x, y);
      return !c || c.collisions[ly(y)][lx(x)] || SOLID_UPPER.has(c.upper[ly(y)][lx(x)]) || taken.has(`${x},${y}`);
    };
  };
  const reach = (blocked) => {
    const start = world.meta.playerStart;
    const seen = new Set([`${start.worldX},${start.worldY}`]);
    const q = [[start.worldX, start.worldY]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy; const k = `${nx},${ny}`;
        if (seen.has(k) || blocked(nx, ny) || !canStep(x, y, nx, ny)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return seen;
  };
  const before = reach(blockedIn(world));

  // 1. Os pinheiros que saem.
  for (const [x, y] of PINES_OUT) {
    const c = chunkOf(x, y);
    if (!inZone(x, y)) problems.push(`o pinheiro ${x},${y} está fora da zona do acampamento`);
    if (c.upper[y % CH][x % CW] === PINE) c.upper[y % CH][x % CW] = null;
  }

  // 2. O mato.
  const props = new Map(world.props.map((p) => [`${p.worldX},${p.worldY}`, p]));
  const people = new Set();
  for (const c of world.chunks) {
    for (const p of c.pickups) people.add(`${p.worldX},${p.worldY}`);
    for (const n of c.npcs) people.add(`${n.worldX},${n.worldY}`);
  }
  // onde o mato PODE nascer (o chão livre; o mato que já está lá conta como livre)
  const spots = [];
  for (let y = CAMP_ZONE.y0; y <= CAMP_ZONE.y1; y += 1) {
    for (let x = CAMP_ZONE.x0; x <= CAMP_ZONE.x1; x += 1) {
      const k = `${x},${y}`;
      const c = chunkOf(x, y);
      if (!c || CAMP_TILES.has(k) || KEEP_OPEN.has(k) || CAMP_SOLID.some(([sx, sy]) => sx === x && sy === y)) continue;
      if (relief(x, y) !== 0 || c.collisions[y % CH][x % CW] || c.ground[y % CH][x % CW] === WATER_GROUND) continue;
      if (SOLID_UPPER.has(c.upper[y % CH][x % CW]) || people.has(k)) continue;
      const prop = props.get(k);
      if (prop && prop.type !== 'tallGrass') continue;
      spots.push([x, y]);
    }
  }
  // o ralo: as sementes primeiro, o resto na ordem sorteada; entra quem não tem vizinho de lado e no máximo um de quina
  const rank = (x, y) => (SEEDS.includes(`${x},${y}`) ? -1 - (SEEDS.length - SEEDS.indexOf(`${x},${y}`)) : order(x, y));
  spots.sort((a, b) => rank(...a) - rank(...b));
  // o caminho, tufo a tufo: o mato da zona fora, e quem entra não pode prender nenhum chão que se alcançava
  const zoneGrass = (p) => p.type === 'tallGrass' && inZone(p.worldX, p.worldY);
  const baseBlocked = blockedIn({ ...world, props: world.props.filter((p) => !zoneGrass(p)) });
  const walk = (blocked) => {
    const start = world.meta.playerStart;
    const seen = new Set([`${start.worldX},${start.worldY}`]);
    const q = [[start.worldX, start.worldY]];
    for (let i = 0; i < q.length; i += 1) {
      const [x, y] = q[i];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy; const k = `${nx},${ny}`;
        if (seen.has(k) || blocked(nx, ny) || !canStep(x, y, nx, ny)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return seen;
  };
  const open = walk(baseBlocked);
  const keepsWay = (set) => {
    const seen = walk((x, y) => baseBlocked(x, y) || set.has(`${x},${y}`));
    for (const k of open) if (!set.has(k) && !seen.has(k)) return false;
    return true;
  };
  const chosen = new Set();
  const QUINAS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const quinas = (x, y) => QUINAS.filter(([dx, dy]) => chosen.has(`${x + dx},${y + dy}`));
  for (const [x, y] of spots) {
    const has = (dx, dy) => chosen.has(`${x + dx},${y + dy}`);
    if (has(1, 0) || has(-1, 0) || has(0, 1) || has(0, -1)) continue;
    // de quina, no máximo duas, e nunca duas OPOSTAS (três tufos numa diagonal já são uma fileira) — para ele e para
    // cada vizinho de quina, que ganharia uma (senão o do meio fica com quatro: um losango)
    const straight = (list) => list.length > 2 || (list.length === 2 && list[0][0] === -list[1][0] && list[0][1] === -list[1][1]);
    const q = quinas(x, y);
    if (straight(q) || q.some(([dx, dy]) => straight([...quinas(x + dx, y + dy), [-dx, -dy]]))) continue;
    // dois tufos de quina mais uma árvore já fecham um canto: o tufo que prenderia um chão não entra
    const trial = new Set(chosen).add(`${x},${y}`);
    if (!keepsWay(trial)) continue;
    chosen.add(`${x},${y}`);
  }
  for (const s of SEEDS) if (!chosen.has(s)) problems.push(`a semente ${s} não virou mato`);
  const grass = [];
  for (const [x, y] of spots) {
    const k = `${x},${y}`;
    const c = chunkOf(x, y);
    if (chosen.has(k)) {
      grass.push([x, y]);
      c.upper[y % CH][x % CW] = null;
      if (!props.has(k)) world.props.push({ type: 'tallGrass', worldX: x, worldY: y });
    } else if (props.get(k)?.type === 'tallGrass') {
      world.props = world.props.filter((p) => !(p.type === 'tallGrass' && p.worldX === x && p.worldY === y));
    }
  }

  // 3. A prova.
  const after = reach(blockedIn(world));
  const grassKeys = new Set(grass.map(([x, y]) => `${x},${y}`));
  const lost = [...before].filter((k) => !grassKeys.has(k) && !after.has(k));
  if (lost.length) problems.push(`o mato fechou caminho para ${lost.length} tile(s): ${lost.slice(0, 12).join(' ')}`);
  for (const [x, y] of FRONT) if (!after.has(`${x},${y}`)) problems.push(`do começo não se chega à frente da peça (${x},${y})`);
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }

  const out = `${JSON.stringify(world, null, 2)}\n`;
  if (check) {
    if (out.trim() !== raw.split('\r\n').join('\n').trim()) { console.error('world.json NÃO é o ponto fixo de mato-do-acampamento.mjs'); process.exit(1); }
    console.log(`world.json OK: ${grass.length} tufos de mato alto em volta do acampamento; nenhum caminho fechou.`);
  } else {
    fs.writeFileSync(worldPath, out);
    console.log(`world.json: ${grass.length} tufos de mato alto em volta do acampamento; a prova de caminho passa.`);
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
