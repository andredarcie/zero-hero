// O MATO EM VOLTA DO ACAMPAMENTO (pedido do autor, 2026-11-17: "em volta do acampamento, remova um pouco das árvores e
// coloque o mato alto, bastante mato alto, dando a impressão de que o jogador teria que cortar esses matos para expandir
// o seu próprio acampamento"). O mato desta zona é VERDE no jogo (objects/TallGrassObject.green: não pega fogo), e só a
// foice que a Morte deixa no fim da terceira noite o corta (systems/Resting). Na grade do modo de construção ele é
// vermelho (runtime/homeGrid); cortado, vira chão livre e verde, e o save lembra (objects/CampGrass).
//
// O que este script faz, e só isto:
//   1. tira os PINHEIROS listados em PINES_OUT (o autor pediu: "remova um pouco das árvores"; só estes, um a um, e só se
//      o tile ainda é pinheiro — rodar de novo não tira mais nada);
//   2. põe um prop `tallGrass` em todo chão livre da zona, menos o miolo do acampamento e a passagem para o sul
//      (scripts/acampamento.mjs, CAMP_TILES), limpando a decoração rasteira debaixo (chão + uma coisa);
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
  const cell = (x, y, layer) => chunkOf(x, y)?.[layer]?.[y % CH]?.[x % CW];
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
      return !c || c.collisions[y % CH][x % CW] || SOLID_UPPER.has(c.upper[y % CH][x % CW]) || taken.has(`${x},${y}`);
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
  const grass = [];
  for (let y = CAMP_ZONE.y0; y <= CAMP_ZONE.y1; y += 1) {
    for (let x = CAMP_ZONE.x0; x <= CAMP_ZONE.x1; x += 1) {
      const k = `${x},${y}`;
      const c = chunkOf(x, y);
      if (!c || CAMP_TILES.has(k) || KEEP_OPEN.has(k) || CAMP_SOLID.some(([sx, sy]) => sx === x && sy === y)) continue;
      if (relief(x, y) !== 0 || c.collisions[y % CH][x % CW] || c.ground[y % CH][x % CW] === WATER_GROUND) continue;
      if (SOLID_UPPER.has(c.upper[y % CH][x % CW]) || people.has(k)) continue;
      const prop = props.get(k);
      if (prop && prop.type !== 'tallGrass') continue;
      grass.push([x, y]);
      c.upper[y % CH][x % CW] = null;
      if (!prop) world.props.push({ type: 'tallGrass', worldX: x, worldY: y });
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
