import { describe, expect, it } from 'vitest';

import { nearestRoomyTile, roomAt, ROOMY_TILES } from './roomyTile';

const flat = (): boolean => true;

// O acampamento, em miniatura: o colchão B (sólido) com o caderno em cima e as pedras embaixo; à esquerda dele o
// lugar do varal da Shui, cercado pelo mapa da Thea, o tronco e o mato; à direita, o chão aberto.
const CAMP = [
  '..........',
  '#.###.....',
  '##.B......',
  '#####.....',
  '..........',
];
const camp = (x: number, y: number): boolean => CAMP[y]?.[x] !== '.';

describe('roomyTile', () => {
  it('conta o espaço em volta, até o teto', () => {
    expect(roomAt(2, 2, camp, ROOMY_TILES, flat)).toBe(1);
    expect(roomAt(4, 2, camp, ROOMY_TILES, flat)).toBe(ROOMY_TILES);
    expect(roomAt(3, 2, camp, ROOMY_TILES, flat)).toBe(0);
  });

  it('de cima do colchão, desce para o chão aberto e não para o beco ao lado', () => {
    // a ordem de antes (frente, costas, esquerda, direita) punha o herói no beco (2,2), preso para sempre
    expect(nearestRoomyTile(3, 2, camp, 4, flat)).toEqual({ x: 4, y: 2 });
  });

  it('de dentro do beco, sai para o tile livre com espaço mais perto', () => {
    const to = nearestRoomyTile(2, 2, camp, 4, flat);
    expect(to).not.toBeNull();
    expect(Math.abs((to?.x ?? 99) - 2) + Math.abs((to?.y ?? 99) - 2)).toBe(2);
    expect(roomAt(to?.x ?? -1, to?.y ?? -1, camp, ROOMY_TILES, flat)).toBe(ROOMY_TILES);
  });

  it('quem já está num lugar aberto fica onde está', () => {
    expect(nearestRoomyTile(8, 0, camp, 4, flat)).toEqual({ x: 8, y: 0 });
  });

  it('o relevo conta: a serra separa o que parece junto', () => {
    const solid = (x: number, y: number): boolean => x < 0 || y < 0 || x > 1 || y > 2;
    const cliff = (fx: number, _fy: number, tx: number): boolean => fx === tx;
    expect(roomAt(0, 1, solid, ROOMY_TILES, flat)).toBe(ROOMY_TILES);
    expect(roomAt(0, 1, solid, ROOMY_TILES, cliff)).toBe(3);
  });
});
