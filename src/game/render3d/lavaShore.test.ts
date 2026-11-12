import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { buildShoreGeometry, LAVA_DEPTH_TILES, LAVA_LIP_SHADE, LAVA_SHORE, tileKey } from './terrainGeometry';

// A MARGEM DA LAVA (pedido do autor, 2026-11-11: "as bordas do rio de lava são de um cinza chapado... os pontos de lava
// acima do lago viraram dois blocos cinzas puros, sai a faísca mas não tem lava"). O beiço era uma cor lisa num
// material sem arte, e num tile de lava sozinho (ou num fio na diagonal) a quina arredondada fechava o tile inteiro.

const EARTH = 52;

/** O beiço e o barranco de um conjunto de tiles de lava, com chão de terra em volta. */
const shore = (tiles: Array<[number, number]>, core = true) => {
  const wet = new Set(tiles.map(([x, z]) => tileKey(x, z)));
  const list = tiles.map(([x, z]) => ({ x, z }));
  const opts = core ? LAVA_SHORE : { ...LAVA_SHORE, core: undefined };
  return buildShoreGeometry(wet, list, (x, z) => (wet.has(tileKey(x, z)) ? null : EARTH), LAVA_DEPTH_TILES, opts);
};

/**
 * O beiço cobre o ponto (x, z)? Cada corrida do beiço é um retângulo de 4 vértices no chão, em pixels de arte (1/16): o
 * ponto anda meio pixel para não cair em cima de uma divisa, onde nenhum retângulo o conteria.
 */
const covers = (lip: THREE.BufferGeometry, px: number, pz: number): boolean => {
  const x = px + 1 / 32;
  const z = pz + 1 / 32;
  const p = lip.getAttribute('position');
  for (let q = 0; q < p.count; q += 4) {
    const xs = [0, 1, 2, 3].map((k) => p.getX(q + k));
    const zs = [0, 1, 2, 3].map((k) => p.getZ(q + k));
    if (x > Math.min(...xs) && x < Math.max(...xs) && z > Math.min(...zs) && z < Math.max(...zs)) return true;
  }
  return false;
};

// O fio de lava que sobe do lago até o cantarelo, no mapa: (12,4) só encosta no resto pela diagonal.
const TRAIL: Array<[number, number]> = [[10, 1], [10, 2], [10, 3], [10, 4], [11, 3], [12, 4]];

describe('a margem da lava', () => {
  it('todo tile de lava mostra lava no miolo, mesmo sozinho ou no fio da diagonal', () => {
    const { lip } = shore(TRAIL);
    for (const [x, z] of TRAIL) expect(covers(lip, x, z), `${x},${z}`).toBe(false);
    const alone = shore([[30, 30]]);
    expect(covers(alone.lip, 30, 30)).toBe(false);
  });

  it('sem o miolo guardado, a quina arredondada fechava o tile sozinho da diagonal (o defeito)', () => {
    expect(covers(shore(TRAIL, false).lip, 12, 4)).toBe(true);
  });

  it('o beiço ainda existe em volta do miolo: a terra avança sobre a lava, e o barranco desce', () => {
    const { lip, walls } = shore(TRAIL);
    expect(covers(lip, 12 - 0.47, 4)).toBe(true);
    expect(walls.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('o beiço veste a arte do chão de onde vem (uv dentro do quadro da terra), e não uma cor só', () => {
    const { lip } = shore(TRAIL);
    expect(lip.getAttribute('uv')).toBeDefined();
    const bounds = lip.getAttribute('aUvBounds');
    expect(bounds.count).toBe(lip.getAttribute('position').count);
    // um quadro de arte de verdade: a caixa de uv tem área
    expect(bounds.getZ(0)).toBeGreaterThan(bounds.getX(0));
    expect(bounds.getW(0)).toBeGreaterThan(bounds.getY(0));
  });

  it('a queima do beiço escurece o chão, sem apagar a arte', () => {
    expect(LAVA_LIP_SHADE).toBeGreaterThan(0.7);
    expect(LAVA_LIP_SHADE).toBeLessThan(1);
  });
});
