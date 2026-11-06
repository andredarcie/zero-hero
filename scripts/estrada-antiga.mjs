// A ESTRADA ANTIGA (pedido do autor): da espada fincada, reto para o norte, até a escada do jardim do fim. Desde o
// começo do jogo ela diz "ali é importante, vá ali" — mas sem gritar: é terra batida meio apagada, com capim
// atravessando. O DESENHO dela é do jogo (objects/OldRoad: uma película de terra por cima da grama); este script
// só abre a linha no mundo:
//
//  · os pinheiros que fechavam a coluna saem (a estrada é reta, e árvore no meio dela a cortaria);
//  · TODO enfeite da linha sai (tufo, flor, arbusto): embaixo da estrada é só a grama, com a estrada por cima
//    (pedido do autor — um tufo saindo de dentro da película de terra ficava estranho). O `biomas-flora` sabe
//    da estrada e não planta nela de novo.
//
// A coluna é a do portão do jardim, que é a mesma da espada (o começo do jogo). A estrada começa alguns passos à
// frente da espada — logo ali ainda é mato — e vai até o pé do portão.
//
// A PROVA, partindo do começo da aventura: só se tira árvore, então nada deixa de se alcançar.
//
// IDEMPOTENTE e DETERMINÍSTICO. Backup (só na primeira vez) em backup/world-pre-estrada-antiga.json.
//
//   node scripts/estrada-antiga.mjs           # aplica
//   node scripts/estrada-antiga.mjs --check   # só confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const worldPath = path.resolve(here, '../public/world.json');
const backupPath = path.resolve(here, '../backup/world-pre-estrada-antiga.json');
const check = process.argv.includes('--check');

const raw = fs.readFileSync(worldPath, 'utf8');
const world = JSON.parse(raw);
const { chunkColumns: CW, chunkRows: CH } = world.meta;

/** O mesmo número de `ROAD_GRASS_GAP` em objects/OldRoad.ts: quantos tiles de mato entre a espada e a estrada. */
export const ROAD_GRASS_GAP = 3;
/** Os passos que a abertura dá até fincar a espada (GameScene.INTRO_WALK_TILES). */
const INTRO_WALK_TILES = 3;

const GATE = world.props.find((p) => p.type === 'gardenGate');
const START = world.meta.playerStart;
const SWORD = { x: START.worldX, y: START.worldY - INTRO_WALK_TILES + 1 };
// Até o tile do PORTÃO, que encosta no pé da escada (pedido do autor: a trilha continua até a escada).
const ROAD = { x: GATE.worldX, from: SWORD.y - ROAD_GRASS_GAP, to: GATE.worldY };

const TREES = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22]);
const key = (x, y) => `${x},${y}`;
const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
const at = (x, y) => { const c = chunkOf(x, y); return { c, lx: x % CW, ly: y % CH }; };

const problems = [];
if (SWORD.x !== GATE.worldX) problems.push(`a espada (${SWORD.x}) e o portão (${GATE.worldX}) não estão na mesma coluna`);
for (let y = ROAD.to; y <= ROAD.from; y++) {
  const { c, lx, ly } = at(ROAD.x, y);
  if (c.relief?.[ly]?.[lx]) problems.push(`a estrada passa por relevo em ${key(ROAD.x, y)}`);
  if (world.props.some((p) => p.worldX === ROAD.x && p.worldY === y && p.type !== 'tallGrass' && p.type !== 'gardenGate')) problems.push(`há uma peça na estrada em ${key(ROAD.x, y)}`);
  const up = c.upper[ly][lx];
  if (up === null) continue;
  if (TREES.has(up)) c.collisions[ly][lx] = false;
  c.upper[ly][lx] = null;
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const out = `${JSON.stringify(world, null, 2)}\n`;
if (check) {
  if (out.trim() !== raw.split('\r\n').join('\n').trim()) {
    console.error('world.json NÃO é o ponto fixo de estrada-antiga.mjs');
    process.exit(1);
  }
  console.log(`world.json OK: a estrada antiga está aberta, da espada (${key(SWORD.x, SWORD.y)}) ao portão, ${ROAD.from - ROAD.to + 1} tiles.`);
} else {
  if (!fs.existsSync(backupPath) && out.trim() !== raw.split('\r\n').join('\n').trim()) {
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.writeFileSync(backupPath, raw);
  }
  fs.writeFileSync(worldPath, out);
  console.log(`world.json: a estrada antiga aberta, da espada (${key(SWORD.x, SWORD.y)}) ao portão, ${ROAD.from - ROAD.to + 1} tiles.`);
}
