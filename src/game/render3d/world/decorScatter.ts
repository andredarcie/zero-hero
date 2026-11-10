// O ESPALHAMENTO DA DECORAÇÃO RASTEIRA (pedido do autor, 2026-11-10: "melhorar o que já tem").
//
// O tufo, a flor e a folha caída nasciam no centro exato do tile, com o mesmo desenho e o mesmo tom em todo tile: a
// grade aparecia — as florzinhas em grupos de 2×2 iguais, o trigo em fileiras de três, e o chão inteiro lia como um
// papel de parede. Três gestos, todos só no DESENHO (o dado do mundo não muda, nem a colisão, nem o que o jogo faz
// com cada tile):
//
//   · o quad ANDA até 2 texels dentro do próprio tile, em texel inteiro (o pixel art não escorrega meio pixel);
//   · o TOM varia um fio de planta para planta (±6%), como numa touceira de verdade;
//   · touceira e CLAREIRA: um ruído largo (~5 tiles) diz onde o mato adensa e onde rareia. Na clareira só parte dos
//     tufos de enchimento aparece; na touceira todos. É o que transforma a distribuição uniforme em mancha.
//
// O que NÃO entra, de propósito: espelhar (a luz desta arte vem sempre da esquerda — espelhar a inverte, a lei do
// CLAUDE.md) e escalar (pixels maiores). As ÁRVORES têm o desvio e a variedade delas noutro lugar, com regras
// próprias porque elas BARRAM (render3d/forest.ts). O mato alto (19/20) fica parado e sempre visível: ele barra o
// herói, e uma barreira que some na clareira mentiria.

import { ANCIENT_GROVE, BIOME_DECOR } from '@/game/world/biomes';

/** O que ANDA dentro do tile: a decoração rasteira e a flora dos biomas (não o mato alto, que barra). */
const SCATTER_FRAMES: ReadonlySet<number> = new Set([
  0, 1, 7, 8, 10, 11, 13,
  ...Object.values(BIOME_DECOR),
  ANCIENT_GROVE.grass,
]);
/** O que pode SUMIR na clareira: só o enchimento (capim, folhagem, folha caída, trevo) — nunca a flor que dá o lugar. */
const THIN_FRAMES: ReadonlySet<number> = new Set([0, 7, 8, BIOME_DECOR.fern, BIOME_DECOR.leaves, BIOME_DECOR.clover]);

/** O passo de um texel de arte, em tiles (16 px por tile). */
const TEXEL = 1 / 16;
const MAX_TEXELS = 2;
/** Na clareira mais aberta, quantos tufos de enchimento ainda aparecem; na touceira, todos. */
const CLEARING_KEEP = 0.4;
/** O tamanho da mancha, em tiles. */
const CLUMP_GRAIN = 5;

const hash = (x: number, z: number, salt: number): number => {
  let h = (x * 73856093) ^ (z * 19349663) ^ (salt * 83492791);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967295;
};
const clumpNoise = (x: number, z: number): number => {
  const fx = x / CLUMP_GRAIN; const fz = z / CLUMP_GRAIN;
  const cx = Math.floor(fx); const cz = Math.floor(fz);
  const tx = fx - cx; const tz = fz - cz;
  const sx = tx * tx * (3 - 2 * tx); const sz = tz * tz * (3 - 2 * tz);
  const at = (i: number, j: number): number => hash(i, j, 911);
  const top = at(cx, cz) * (1 - sx) + at(cx + 1, cz) * sx;
  const bottom = at(cx, cz + 1) * (1 - sx) + at(cx + 1, cz + 1) * sx;
  return top * (1 - sz) + bottom * sz;
};
const smooth = (a: number, b: number, v: number): number => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Este tile de decoração aparece? (Só o enchimento pode sumir, e só na clareira.) */
export const decorShown = (x: number, z: number, frame: number): boolean => {
  if (!THIN_FRAMES.has(frame)) return true;
  const density = smooth(0.3, 0.68, clumpNoise(x, z));
  return hash(x, z, 37) < CLEARING_KEEP + (1 - CLEARING_KEEP) * density;
};

/** Quanto o quad anda (em tiles, texel inteiro) e o tom dele. Fora da lista, nada muda. */
export const decorScatterAt = (x: number, z: number, frame: number): { dx: number; dz: number; shade: number } => {
  if (!SCATTER_FRAMES.has(frame)) return { dx: 0, dz: 0, shade: 1 };
  const step = (salt: number): number => (Math.round(hash(x, z, salt) * 2 * MAX_TEXELS) - MAX_TEXELS) * TEXEL;
  return { dx: step(11), dz: step(23), shade: 0.94 + hash(x, z, 51) * 0.12 };
};
