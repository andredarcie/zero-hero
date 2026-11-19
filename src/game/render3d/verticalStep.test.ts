import { describe, expect, it } from 'vitest';

import { defaultWorld3DParams, VERTICAL_SCREEN_SHARE, verticalStepSpeedup } from './worldParams';

// O PASSO VERTICAL (worldParams.verticalStepSpeedup): o chão do passo para o norte corre na tela como corria com a
// câmera de 46,5° — a caminhada que o autor achava certa.

const screenShare = (h: number, b: number, speedup: number): number => Math.sin(Math.atan2(h - 0.4, b)) * speedup;

describe('o passo para o norte e para o sul', () => {
  it('com a câmera de fábrica, o chão vertical corre a 72% do de lado, como na câmera antiga', () => {
    const p = defaultWorld3DParams();
    const k = verticalStepSpeedup(p.camHeight, p.camBack);
    expect(k).toBeGreaterThan(1.5);
    expect(k).toBeLessThan(1.7);
    expect(screenShare(p.camHeight, p.camBack, k)).toBeCloseTo(VERTICAL_SCREEN_SHARE, 3);
  });

  it('com a câmera antiga (46,5°) o passo não muda', () => {
    expect(verticalStepSpeedup(8.636, 7.813)).toBeCloseTo(1, 2);
  });

  it('o zoom não mexe nele (o dolly leva os dois números pelo mesmo fator; só a inclinação conta)', () => {
    const p = defaultWorld3DParams();
    const near = verticalStepSpeedup(0.4 + (p.camHeight - 0.4) * 0.6, p.camBack * 0.6);
    expect(near).toBeCloseTo(verticalStepSpeedup(p.camHeight, p.camBack), 6);
  });

  it('nunca deixa o passo mais lento que o de lado', () => {
    expect(verticalStepSpeedup(20, 1)).toBe(1);
  });
});
