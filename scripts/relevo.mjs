// A REGRA DE PASSO DA SERRA para os scripts do mundo — a mesma de src/game/world/relief.ts (canStepCodes),
// num lugar só, para as provas de BFS de todos os scripts concordarem com o jogo.
//
//   0 chão · 1 planalto · 2-5 escada chão → planalto (N/L/S/O) · 6-7 serra de mata (ninguém pisa)
//   8 cume (o segundo andar) · 9-12 escada planalto → cume (N/L/S/O)
export const RELIEF_GROUND = 0;
export const RELIEF_HIGH = 1;
export const RELIEF_PEAK = 8;
export const STAIR_UP = {
  2: [0, -1], 3: [1, 0], 4: [0, 1], 5: [-1, 0],
  9: [0, -1], 10: [1, 0], 11: [0, 1], 12: [-1, 0],
};
export const stairBase = (code) => (code >= 9 && code <= 12 ? 1 : 0);
const floorCode = (level) => (level === 0 ? RELIEF_GROUND : level === 1 ? RELIEF_HIGH : RELIEF_PEAK);

/** Pode-se andar do tile de código `a` para o vizinho de código `b`, no passo (dx, dy)? */
export const canStepCodes = (a, b, dx, dy) => {
  const ua = STAIR_UP[a];
  const ub = STAIR_UP[b];
  if (!ua && !ub) return a === b;
  if (ua) {
    const base = stairBase(a);
    if (dx === ua[0] && dy === ua[1]) return b === floorCode(base + 1);
    if (dx === -ua[0] && dy === -ua[1]) return b === floorCode(base);
    return false;
  }
  const base = stairBase(b);
  if (dx === ub[0] && dy === ub[1]) return a === floorCode(base);
  if (dx === -ub[0] && dy === -ub[1]) return a === floorCode(base + 1);
  return false;
};

/** O `canStep(fx, fy, tx, ty)` de um mundo, dado o leitor de relevo `relief(x, y)`. */
export const makeCanStep = (relief) => (fx, fy, tx, ty) => canStepCodes(relief(fx, fy), relief(tx, ty), tx - fx, ty - fy);
