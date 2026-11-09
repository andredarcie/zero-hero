import { describe, expect, it } from 'vitest';

import { findVisitPath, fireSeats, VISIT_RADIUS, type VisitStep } from '@/game/world/visitPath';

/** Um chão desenhado à mão: '#' é sólido, o resto é livre. A linha 0 é y = 0. */
const ground = (rows: string[]): VisitStep => (_fx, _fy, tx, ty) => rows[ty]?.[tx] !== undefined && rows[ty][tx] !== '#';
const open: VisitStep = () => true;

describe('fireSeats', () => {
  it('põe primeiro a fileira do outro lado do fogo, e nunca o fogo nem o herói', () => {
    const seats = fireSeats([5, 5], [5, 6], () => true);
    expect(seats).toHaveLength(7);
    // As três de cima, as mais longe do herói (as quinas um pouco mais que a do meio).
    expect(seats.slice(0, 3)).toEqual([[4, 4], [6, 4], [5, 4]]);
    expect(seats).not.toContainEqual([5, 5]);
    expect(seats).not.toContainEqual([5, 6]);
  });

  it('pula o que não está livre', () => {
    const seats = fireSeats([5, 5], [5, 6], (x, y) => !(y === 4 && x !== 5));
    expect(seats).not.toContainEqual([4, 4]);
    expect(seats[0]).toEqual([5, 4]);
  });
});

describe('findVisitPath', () => {
  it('anda da casa até o lugar mais desejado, um passo de cada vez', () => {
    const path = findVisitPath([0, 0], [[3, 0]], [9, 9], [3, 1], open);
    expect(path).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
  });

  it('contorna a parede e nunca pisa no herói', () => {
    const step = ground([
      '.#...',
      '.#.#.',
      '...#.',
    ]);
    const path = findVisitPath([0, 0], [[2, 0]], [2, 2], [2, 1], step);
    // Sem o herói em (2,2) o caminho passaria por ali; com ele, não há outro: ninguém chega.
    expect(path).toBeNull();
    const around = findVisitPath([0, 0], [[2, 0]], [4, 2], [2, 1], step);
    expect(around?.[0]).toEqual([0, 0]);
    expect(around?.at(-1)).toEqual([2, 0]);
    expect(around).toContainEqual([1, 2]);
    expect(around).not.toContainEqual([1, 0]);
  });

  it('se o primeiro lugar não se alcança, fica com o melhor que se alcança', () => {
    const step = ground([
      '...#.',
      '...#.',
      '...#.',
    ]);
    const path = findVisitPath([0, 1], [[4, 1], [2, 1]], [9, 9], [3, 1], step);
    expect(path?.at(-1)).toEqual([2, 1]);
  });

  it('não procura fora da caixa em volta do fogo', () => {
    const far = VISIT_RADIUS + 10;
    expect(findVisitPath([far, 0], [[0, 0]], [-50, -50], [0, 0], open)).toBeNull();
  });
});
