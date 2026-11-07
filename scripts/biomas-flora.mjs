// A FLORA DOS BIOMAS — decoração rasteira acrescentada nos tiles VAZIOS de cada bioma (world/biomes.ts),
// para cada região ter a densidade da sua cara: o prado cheio de flor, o bosque úmido cheio de moita,
// a terra vulcânica com pedra por todo lado, o jardim quase limpo.
//
//   npx tsx scripts/biomas-flora.mjs          # aplica (faz backup antes)
//   npx tsx scripts/biomas-flora.mjs --check  # só confere se o disco já é o ponto fixo
//
// As leis do CLAUDE.md, uma por uma:
// - LÊ o world.json e ACRESCENTA; nunca refaz. Só escreve `upper` em tile que não tem `upper`, nem
//   colisão, nem prop, nem item, nem NPC (chão + UMA coisa), e nunca toca em `ground` nem `collisions`.
// - Não bloqueia nada: grava só o frame 0 (moita), que não está em SOLID_UPPER_FRAMES. O que ele VESTE em
//   cada bioma (flor, pedra, moita, capim) quem decide é `decorFrameAt` na hora de desenhar — então
//   mudar a flora de um bioma depois não exige rodar isto de novo.
// - Determinístico (hash da coordenada, zero Math.random) e idempotente: o conjunto de tiles escolhidos é
//   sempre o mesmo, e rodar duas vezes dá o mesmo mundo que rodar uma.
// - Fica longe das portas: nada nasce a menos de 2 tiles de NPC, prop ou item, nem em escada da serra.
import { kinTiles } from './chao-dos-filhos.mjs';
import { CAMP_TILES } from './acampamento.mjs';
import { BARREL_TILE } from './barril-do-gato.mjs';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { biomeAt } from '../src/game/world/biomes.ts';

const WORLD = fileURLToPath(new URL('../public/world.json', import.meta.url));
const BACKUP_DIR = fileURLToPath(new URL('../backup/', import.meta.url));
const check = process.argv.includes('--check');

/** Quanto do chão livre de cada bioma ganha decoração (antes do agrupamento do ruído). */
const DENSITY = { meadow: 0.34, moss: 0.3, ash: 0.26, fields: 0.24, stars: 0.18, woods: 0.16, garden: 0.05 };
const DECOR = 0;
const GROUND = 5;
const STAIRS_FREE = new Set([0, 1]); // relevo: chão e planalto; o resto são degraus

const hash = (x, y, salt) => {
  let h = ((x + salt) * 73856093) ^ ((y - salt) * 19349663);
  h = (h ^ (h >>> 13)) >>> 0;
  return (h % 1024) / 1023;
};
// agrupado: um campo suave (grão de 4 tiles) decide onde a decoração se adensa e onde fica clareira
const smooth = (x, y) => {
  const g = 4; const fx = x / g; const fy = y / g; const cx = Math.floor(fx); const cy = Math.floor(fy);
  const tx = fx - cx; const ty = fy - cy;
  const a = hash(cx, cy, 31) * (1 - tx) + hash(cx + 1, cy, 31) * tx;
  const b = hash(cx, cy + 1, 31) * (1 - tx) + hash(cx + 1, cy + 1, 31) * tx;
  return a * (1 - ty) + b * ty;
};

const world = JSON.parse(readFileSync(WORLD, 'utf8'));
const { chunkColumns: C, chunkRows: R } = world.meta;
const chunkAt = new Map(world.chunks.map((c) => [`${c.cx},${c.cy}`, c]));
const cell = (wx, wy) => {
  const c = chunkAt.get(`${Math.floor(wx / C)},${Math.floor(wy / R)}`);
  if (!c) return null;
  return { c, lx: ((wx % C) + C) % C, ly: ((wy % R) + R) % R };
};

// o que tem comportamento: props, itens e NPCs (com a margem de 2 tiles)
const busy = new Set();
const mark = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) busy.add(`${x + dx},${y + dy}`); };
for (const p of world.props) mark(p.worldX, p.worldY);
for (const c of world.chunks) {
  for (const p of c.pickups ?? []) mark(p.worldX, p.worldY);
  for (const n of c.npcs ?? []) mark(n.worldX, n.worldY);
}

// A ESTRADA ANTIGA (scripts/estrada-antiga.mjs, objects/OldRoad): da espada ao portão do jardim, embaixo dela é
// só a grama. A mesma conta do script dela: a coluna do portão, de alguns passos à frente da espada até o portão.
const gate = world.props.find((p) => p.type === 'gardenGate');
const start = world.meta.playerStart;
const road = gate && gate.worldX === start.worldX
  ? { x: gate.worldX, from: start.worldY - 3 + 1 - 3, to: gate.worldY }
  : null;
const onRoad = (x, y) => road !== null && x === road.x && y >= road.to && y <= road.from;
// O CHÃO DOS COGUMELINHOS-FILHOS (scripts/chao-dos-filhos.mjs): fica liso, para cada filho ter onde nascer.
const kin = kinTiles(world);

let added = 0;
const perBiome = {};
for (const c of world.chunks) {
  for (let ly = 0; ly < R; ly++) {
    for (let lx = 0; lx < C; lx++) {
      const wx = c.cx * C + lx; const wy = c.cy * R + ly;
      if (c.ground[ly][lx] !== GROUND) continue;
      if (c.upper[ly][lx] !== null || c.collisions[ly][lx]) continue;
      if (!STAIRS_FREE.has(c.relief?.[ly]?.[lx] ?? 0)) continue;
      if (busy.has(`${wx},${wy}`) || onRoad(wx, wy) || kin.has(`${wx},${wy}`) || CAMP_TILES.has(`${wx},${wy}`) || (wx === BARREL_TILE.x && wy === BARREL_TILE.y)) continue;
      const biome = biomeAt(wx, wy);
      const chance = DENSITY[biome] * (0.35 + 1.3 * smooth(wx, wy));
      if (hash(wx, wy, 7) >= chance) continue;
      added += 1;
      perBiome[biome] = (perBiome[biome] ?? 0) + 1;
      if (!check) c.upper[ly][lx] = DECOR;
    }
  }
}

if (check) {
  if (added > 0) {
    console.error(`biomas-flora: o disco NÃO é o ponto fixo — ${added} tiles ainda receberiam decoração`, perBiome);
    process.exit(1);
  }
  console.log('biomas-flora: ok, o disco é o ponto fixo');
} else {
  // o backup é o mundo de ANTES da primeira rodada: nunca sobrescrever (rodar de novo apagaria o original)
  mkdirSync(BACKUP_DIR, { recursive: true });
  if (!existsSync(`${BACKUP_DIR}world-pre-biomas.json`)) copyFileSync(WORLD, `${BACKUP_DIR}world-pre-biomas.json`);
  writeFileSync(WORLD, `${JSON.stringify(world, null, 2)}\n`);
  console.log(`biomas-flora: ${added} tiles decorados`, perBiome, '(backup em backup/world-pre-biomas.json)');
}
// `cell` fica para quem quiser estender o script (ler vizinhos); não é usado no passo de hoje.
void cell;
