// A ROCHA DA SERRA E DA COLINA (pedido do autor, 2026-11-11: "melhore drasticamente o visual das colinas e serras de
// pedra"). O que mudou na tela, e por quê:
//
//   · A PAREDE era o calçamento (pedra redonda com rejunte, quadros 39/40) posto em pé: a montanha lia como ruína de
//     tijolo bege, a colina como canteiro com muro de arrimo. Agora ela é ROCHA FRATURADA (spritefactory/sprites/
//     cliff-rock.mjs, quadros 120..125): lajes altas e largas, fenda quase sempre vertical, a quebra de camada numa
//     altura diferente em cada coluna, a crista acesa e o pé no escuro. Musgo numa face de cada quatro.
//   · O ALTO DA SERRA era o mesmo calçamento deitado (uma praça). Agora é laje grande com a fenda QUEBRADA
//     (quadros 126..129). O dado do mundo não muda: a serra continua guardando 39/40, e o chão das colinas o dele.
//   · A LUZ DA PAREDE desce mais (o pé a `CLIFF_FOOT`) e cada face tem o seu tom (`facetShade`): a parede de um tom só
//     lia como um papel colado no morro.
//   · A FRANJA DE CAPIM (`fringeDrop`): o capim do topo da colina passa da beira e cai uns pixels pela frente da
//     pedra, em fios de comprimentos diferentes — é o que diz "morro com mato em cima", e não "muro com gramado".

import { terrainVariant } from '@/game/constants';

/** A face do penhasco, lisa e com musgo. */
export const CLIFF_FACE_FRAMES: readonly number[] = [120, 121, 122, 123];
export const CLIFF_FACE_MOSS: readonly number[] = [124, 125];
/** Uma face em cada tantas leva musgo. */
const MOSS_EVERY = 4;
/** O alto da serra: as lajes lisas duas vezes, as de musgo uma (o musgo mora mais na fenda da parede). */
export const ROCK_TOP_FRAMES: readonly number[] = [126, 127, 128, 126, 127, 129];
/**
 * O alto da serra um passo acima do tom da pedra (`rockToneAt`): ele olha para o sol, e com a mesma luz da parede o
 * maciço perdia o volume — topo e face no mesmo escuro.
 */
export const ROCK_TOP_LIFT = 1.08;
/** Quanto o pé da parede escurece (era 0,78, o do cubo: a parede saía de um tom só, do alto ao chão). */
export const CLIFF_FOOT = 0.66;
/** O quanto o tom de uma face varia da vizinha, para cima e para baixo. */
const FACET_SPREAD = 0.07;

const hash = (x: number, z: number): number => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** A pintura da face no nível `y` do tile (tx, tz). */
export const cliffFaceFrame = (tx: number, tz: number, y: number): number => {
  if (terrainVariant(tx * 3 + 11, tz + y * 5, MOSS_EVERY) === 0) {
    return CLIFF_FACE_MOSS[terrainVariant(tx, tz + y * 7, CLIFF_FACE_MOSS.length)];
  }
  return CLIFF_FACE_FRAMES[terrainVariant(tx, tz + y * 7, CLIFF_FACE_FRAMES.length)];
};

/**
 * O tom da pedra num ponto da parede: um ruído LISO ao longo dela (a ~1 tile), lido em cada vértice. Por face (um
 * tom por pedaço) a troca caía na divisa de cada tile, e a parede reta virava uma fileira de placas.
 */
export const facetShade = (x: number, z: number, level: number): number => {
  const fx = x * 0.9 + level * 13.7;
  const fz = z * 0.9;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const top = hash(ix, iz) * (1 - sx) + hash(ix + 1, iz) * sx;
  const bottom = hash(ix, iz + 1) * (1 - sx) + hash(ix + 1, iz + 1) * sx;
  return 1 + FACET_SPREAD * (2 * (top * (1 - sz) + bottom * sz) - 1);
};

/** A franja fica um fio à frente da pedra (a trepadeira, a 0,012, passa na frente dela). */
export const FRINGE_AHEAD = 0.006;
/** A franja: a cor do fio no alto (rente à beira) e na ponta, sobre a cor do chão do topo. */
export const FRINGE_SHADE: readonly [number, number] = [0.86, 0.6];
/** Quantos pixels de arte o capim cai pela frente da pedra, por coluna do mundo: 0 (a pedra aparece) a 3. */
export const fringeDrop = (gx: number, gz: number): number => {
  const h = hash(gx + 0.5, gz * 1.7 + 3.1);
  return h < 0.12 ? 0 : h < 0.45 ? 1 : h < 0.82 ? 2 : 3;
};
