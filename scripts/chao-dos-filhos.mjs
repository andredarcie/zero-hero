// O CHÃO DOS COGUMELINHOS-FILHOS (pedido do autor): um filho só nasce em chão limpo — num tile com arbusto, flor ou
// mato ele parecia um defeito. Este script sorteia os tiles dos filhos com a MESMA conta do jogo
// (src/game/objects/MushroomKin.ts: alcance, chance por anel, hash do tile) e tira o enfeite rasteiro dos tiles
// sorteados, para que cada filho tenha o seu chão liso. Árvore não sai: o filho daquele tile só não nasce.
//
// `kinTiles(world)` é exportado: biomas-flora.mjs pula esses tiles, senão devolveria a flora a eles.
//
// LÊ o world.json e acrescenta, como o CLAUDE.md manda: IDEMPOTENTE e DETERMINÍSTICO.
//
//   node scripts/chao-dos-filhos.mjs           # aplica
//   node scripts/chao-dos-filhos.mjs --check   # só confere
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// A MESMA conta de objects/MushroomKin.ts — mudou lá, muda aqui.
const REACH = 5;
const RING_CHANCE = [0, 0.35, 0.21, 0.12, 0.065, 0.035];
const hash = (x, y, seed) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
const MUSHROOMS = new Set(['porcini', 'morel', 'puffball', 'inkCap', 'chanterelle', 'flyAgaric', 'oyster', 'jackOLantern']);
// constants.SOLID_UPPER_FRAMES: tronco e copa de árvore, que não saem.
const SOLID_UPPER = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40, 73, 74]);

/** Os tiles em que nasce um filho (chave "x,y"), com o cogumelo de cada um — antes de olhar o enfeite. */
export const kinTiles = (world) => {
  const { chunkColumns: CW, chunkRows: CH } = world.meta;
  const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));
  const relief = (x, y) => chunkOf(x, y)?.relief?.[((y % CH) + CH) % CH]?.[((x % CW) + CW) % CW] ?? 0;
  const taken = new Set(world.props.map((p) => `${p.worldX},${p.worldY}`));
  for (const c of world.chunks) {
    for (const p of c.pickups ?? []) taken.add(`${p.worldX},${p.worldY}`);
    for (const n of c.npcs ?? []) taken.add(`${n.worldX},${n.worldY}`);
  }
  const out = new Map();
  for (const c of world.chunks) {
    for (const m of c.pickups ?? []) {
      if (!MUSHROOMS.has(m.type)) continue;
      for (let dy = -REACH; dy <= REACH; dy += 1) {
        for (let dx = -REACH; dx <= REACH; dx += 1) {
          const ring = Math.round(Math.hypot(dx, dy));
          if (ring < 1 || ring > REACH) continue;
          const x = m.worldX + dx;
          const y = m.worldY + dy;
          if (hash(x, y, 1) > RING_CHANCE[ring]) continue;
          const k = `${x},${y}`;
          const chunk = chunkOf(x, y);
          if (!chunk || taken.has(k) || relief(x, y) !== relief(m.worldX, m.worldY)) continue;
          if (chunk.collisions[((y % CH) + CH) % CH][((x % CW) + CW) % CW]) continue;
          out.set(k, m.type);
        }
      }
    }
  }
  return out;
};

const main = () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const worldPath = path.resolve(here, '../public/world.json');
  const check = process.argv.includes('--check');
  const raw = fs.readFileSync(worldPath, 'utf8');
  const world = JSON.parse(raw);
  const { chunkColumns: CW, chunkRows: CH } = world.meta;
  const chunkOf = (x, y) => world.chunks.find((c) => c.cx === Math.floor(x / CW) && c.cy === Math.floor(y / CH));

  const tiles = kinTiles(world);
  let cleared = 0;
  let trees = 0;
  const perKind = {};
  for (const [k, kind] of tiles) {
    const [x, y] = k.split(',').map(Number);
    const c = chunkOf(x, y);
    const frame = c.upper[y % CH][x % CW];
    if (frame !== null && SOLID_UPPER.has(frame)) { trees += 1; continue; }
    if (frame !== null) { c.upper[y % CH][x % CW] = null; cleared += 1; }
    perKind[kind] = (perKind[kind] ?? 0) + 1;
  }

  const out = `${JSON.stringify(world, null, 2)}\n`;
  if (check) {
    if (out.trim() !== raw.split('\r\n').join('\n').trim()) {
      console.error(`world.json NÃO é o ponto fixo de chao-dos-filhos.mjs (${cleared} tiles ainda com enfeite)`);
      process.exit(1);
    }
    console.log(`world.json OK: os filhos têm chão liso`, perKind, `(${trees} tiles de árvore ficam sem filho)`);
  } else {
    fs.writeFileSync(worldPath, out);
    console.log(`world.json: ${cleared} tiles limpos para os filhos`, perKind, `(${trees} de árvore ficam sem filho)`);
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
