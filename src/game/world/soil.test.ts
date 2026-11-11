import { afterEach, describe, expect, it } from 'vitest';

import { GROUND_DETAIL_FRAMES, GROUND_TILE_FRAME, groundFrameAt, setSoilSource, SOIL_AUTO, SOIL_EARTH, SOIL_GRASS } from '@/game/constants';

// O SOLO PINTADO (constants.setSoilSource): a terra do chão nasce da conta de ruído e bioma, e o autor troca tile a
// tile pelo editor. Foi pedido porque a terra não saía com pincel nenhum.

const isEarth = (x: number, y: number): boolean => GROUND_DETAIL_FRAMES.includes(groundFrameAt(GROUND_TILE_FRAME, x, y));

/** O primeiro tile do mapa que a conta deixa de terra (ou de grama). */
const firstTile = (earth: boolean): { x: number; y: number } => {
  for (let y = 0; y < 60; y += 1) for (let x = 0; x < 60; x += 1) if (isEarth(x, y) === earth) return { x, y };
  throw new Error(earth ? 'nenhuma terra no mapa' : 'nenhuma grama no mapa');
};

afterEach(() => setSoilSource(() => SOIL_AUTO));

describe('o solo pintado', () => {
  it('a grama pintada tira a terra, a terra pintada abre chão batido, e o automático volta ao que era', () => {
    setSoilSource(() => SOIL_AUTO);
    const earth = firstTile(true);
    const grass = firstTile(false);
    setSoilSource((x, y) => (x === earth.x && y === earth.y ? SOIL_GRASS : x === grass.x && y === grass.y ? SOIL_EARTH : SOIL_AUTO));
    expect(isEarth(earth.x, earth.y)).toBe(false);
    expect(isEarth(grass.x, grass.y)).toBe(true);
    setSoilSource(() => SOIL_AUTO);
    expect(isEarth(earth.x, earth.y)).toBe(true);
    expect(isEarth(grass.x, grass.y)).toBe(false);
  });

  it('uma mancha inteira de grama pintada fica toda de grama (a regra do tile ilhado não a desfaz)', () => {
    setSoilSource(() => SOIL_AUTO);
    const { x: ex, y: ey } = firstTile(true);
    setSoilSource((x, y) => (Math.abs(x - ex) <= 1 && Math.abs(y - ey) <= 1 ? SOIL_GRASS : SOIL_AUTO));
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) expect(isEarth(ex + dx, ey + dy)).toBe(false);
  });

  it('só o chão de grama e terra obedece: o calçamento e o outro tile de grama não viram terra', () => {
    setSoilSource(() => SOIL_EARTH);
    expect(groundFrameAt(6, 3, 3)).toBe(6);
    expect(GROUND_DETAIL_FRAMES).not.toContain(groundFrameAt(23, 3, 3));
    expect(isEarth(3, 3)).toBe(true);
  });
});
