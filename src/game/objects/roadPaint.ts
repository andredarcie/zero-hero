// A TERRA BATIDA das estradas do vale (a antiga, objects/OldRoad, e as trilhas falhas, objects/Trails): a mesma
// paleta e o mesmo ruído, para as três lerem como um caminho só, de idades diferentes.

export const ROAD_PX = 16;
// A TERRA MAIS APAGADA (2026-11-11): com o sol dourado do dia, a paleta de antes (#8f7a57…, saturação ~0,39) saía
// uma faixa laranja-viva, a coisa mais saturada do prado — uma trilha de tinta. Mesma terra, um pouco mais escura e
// bem menos saturada (~0,28): ao sol ela ainda esquenta, mas para em marrom de chão batido.
export const ROAD_DIRT = ['#81745e', '#706450', '#615644', '#504737'] as const;
export const ROAD_PEBBLE = ['#9c937f', '#463f33'] as const;

export const roadNoise = (x: number, y: number, seed: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Um ruído liso por células (`cell` pixels): as manchas da terra, a beira que se desfaz, os buracos do capim. */
export const roadBlotch = (x: number, y: number, seed: number, cell: number): number => {
  const fx = x / cell; const fy = y / cell;
  const ix = Math.floor(fx); const iy = Math.floor(fy);
  const sx = (fx - ix) * (fx - ix) * (3 - 2 * (fx - ix));
  const sy = (fy - iy) * (fy - iy) * (3 - 2 * (fy - iy));
  const top = roadNoise(ix, iy, seed) * (1 - sx) + roadNoise(ix + 1, iy, seed) * sx;
  const bottom = roadNoise(ix, iy + 1, seed) * (1 - sx) + roadNoise(ix + 1, iy + 1, seed) * sx;
  return top * (1 - sy) + bottom * sy;
};

/** A cor de um pixel de terra (as quatro da paleta, e de vez em quando uma pedrinha). */
export const roadColor = (x: number, y: number): string => {
  const tone = roadBlotch(x, y, 13, 6) + (roadNoise(x, y, 17) - 0.5) * 0.3;
  if (roadNoise(x, y, 23) > 0.985) return roadNoise(x, y, 29) > 0.5 ? ROAD_PEBBLE[0] : ROAD_PEBBLE[1];
  return ROAD_DIRT[tone < 0.32 ? 0 : tone < 0.55 ? 1 : tone < 0.78 ? 2 : 3];
};
