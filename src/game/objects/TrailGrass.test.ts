import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adventureState, resetAdventure, saveAdventure } from '@/game/runtime/adventureState';

import type { TallGrassObject } from './TallGrassObject';
import { bindTrailGrass, inBeachTrail } from './TrailGrass';

// O MATO DA TRILHA DA PRAIA: o corte dele fica no save. O mato do vale volta quando a partida recomeça; se este
// voltasse, quem recarregasse o jogo na areia sem a foice ficaria preso do outro lado da serra.

/** Um mato de mentira: só o que a trilha usa dele. */
const grass = (x: number, y: number) => {
  const g = { worldX: x, worldY: y, settled: false, onCut: undefined as (() => void) | undefined, settle: () => { g.settled = true; } };
  return g;
};
const bind = (list: ReturnType<typeof grass>[], persist = vi.fn()): ReturnType<typeof vi.fn> => {
  bindTrailGrass(list as unknown as TallGrassObject[], persist);
  return persist;
};

describe('o mato da trilha da praia', () => {
  beforeEach(() => resetAdventure());

  it('a trilha é tudo ao norte da linha 0 e os três tiles ao norte da fogueira da Thea', () => {
    expect(inBeachTrail(42, 1) && inBeachTrail(42, 2) && inBeachTrail(42, 3)).toBe(true);
    expect(inBeachTrail(41, -3) && inBeachTrail(45, -9) && inBeachTrail(10, -20)).toBe(true);
    expect(inBeachTrail(42, 4) || inBeachTrail(42, 0) || inBeachTrail(41, 2) || inBeachTrail(55, 48)).toBe(false);
  });

  it('cortar um mato da trilha entra no save na hora; o mato do vale não', () => {
    const trail = grass(42, 3);
    const valley = grass(20, 30);
    const persist = bind([trail, valley]);
    expect(valley.onCut).toBeUndefined();
    trail.onCut?.();
    expect([...adventureState().trailCut]).toEqual(['42,3']);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('o que já foi aberto nasce aberto na partida seguinte, e o resto continua em pé', () => {
    adventureState().trailCut.add('41,-3');
    saveAdventure();
    const open = grass(41, -3);
    const closed = grass(43, -5);
    bind([open, closed]);
    expect(open.settled).toBe(true);
    expect(closed.settled).toBe(false);
  });

  it('um save de antes da praia não tem a lista, e carrega com ela vazia', () => {
    expect(adventureState().trailCut.size).toBe(0);
  });
});
