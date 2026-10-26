import { getTileRelief, worldHasRelief } from './WorldData';

/**
 * A SERRA — o mundo deixou de ser um plano só.
 *
 * Um tile pode estar UM NÍVEL acima do chão (o planalto, um bloco de pedra com grama em cima), e o
 * único jeito de subir nele é por uma ESCADA: um tile próprio, encostado no planalto, que sobe numa
 * direção só. Nada de pular, nada de descer pela borda — a beira do planalto é parede para quem está
 * embaixo e para quem está em cima, e a escada é a porta das duas pontas.
 *
 * Os códigos moram em `WorldChunk.relief` (ver worldSchema):
 *
 *   0  chão
 *   1  planalto (RELIEF_HEIGHT acima do chão)
 *   2  escada que sobe para o NORTE (o planalto fica ao norte dela)
 *   3  ... para o LESTE
 *   4  ... para o SUL
 *   5  ... para o OESTE
 *
 * A ALTURA É CONTÍNUA (`terrainHeightAt`): na escada ela cresce ao longo da subida, então tudo que
 * a lê — o corpo do herói, a câmera, os overlays 2D — sobe o degrau junto com o passo, sem salto.
 */

export const RELIEF_GROUND = 0;
export const RELIEF_HIGH = 1;
/** A altura de um nível, em tiles: a mesma do cubo da montanha (um bloco é um tile de lado). */
export const RELIEF_HEIGHT = 1;

const STAIR_UP: Readonly<Record<number, readonly [number, number]>> = {
  2: [0, -1],
  3: [1, 0],
  4: [0, 1],
  5: [-1, 0],
};

/** Para onde esta escada sobe (dx, dy), ou `undefined` se o código não é escada. */
export const stairUp = (code: number): readonly [number, number] | undefined => STAIR_UP[code];

export const reliefAt = (wx: number, wy: number): number => getTileRelief(wx, wy);

export const isHighTile = (wx: number, wy: number): boolean => getTileRelief(wx, wy) === RELIEF_HIGH;

/**
 * A altura do chão num ponto CONTÍNUO do mundo (em tiles). O tile é o do centro (`floor(v + 0.5)`,
 * a mesma conta do resto do jogo); na escada, a altura vai de 0 na borda de baixo a RELIEF_HEIGHT
 * na borda de cima.
 */
export const terrainHeightAt = (fx: number, fy: number): number => {
  if (!worldHasRelief()) return 0;
  const x = Math.floor(fx + 0.5);
  const y = Math.floor(fy + 0.5);
  const code = getTileRelief(x, y);
  if (code === RELIEF_HIGH) return RELIEF_HEIGHT;
  const up = STAIR_UP[code];
  if (!up) return 0;
  const along = (fx - x) * up[0] + (fy - y) * up[1]; // -0.5 na borda de baixo, +0.5 na de cima
  return Math.max(0, Math.min(1, along + 0.5)) * RELIEF_HEIGHT;
};

/**
 * PODE-SE ANDAR de um tile para o vizinho? Só entre tiles do MESMO nível, ou pela escada no
 * sentido dela: entra-se nela pela ponta de baixo (vindo do chão) ou pela de cima (vindo do
 * planalto), e sai-se pelas mesmas duas pontas. Pelos lados, nunca — a escada tem parede.
 */
export const canStep = (fromX: number, fromY: number, toX: number, toY: number): boolean => {
  if (!worldHasRelief()) return true;
  const a = getTileRelief(fromX, fromY);
  const b = getTileRelief(toX, toY);
  if (a === b && !STAIR_UP[a]) return true;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const ua = STAIR_UP[a];
  if (ua) {
    if (dx === ua[0] && dy === ua[1]) return b === RELIEF_HIGH;
    if (dx === -ua[0] && dy === -ua[1]) return b === RELIEF_GROUND;
    return false;
  }
  const ub = STAIR_UP[b];
  if (ub) {
    if (dx === ub[0] && dy === ub[1]) return a === RELIEF_GROUND;
    if (dx === -ub[0] && dy === -ub[1]) return a === RELIEF_HIGH;
    return false;
  }
  return a === b;
};
