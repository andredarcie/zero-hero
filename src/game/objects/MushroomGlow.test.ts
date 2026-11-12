import { describe, expect, it } from 'vitest';

import { FUNGUS_SPECS, MUSHROOM_KINDS } from '@/game/fungi/fungi';
import { glowingOf, nightAmount } from './MushroomGlow';

// O COGUMELO QUE BRILHA (o cogumelo-da-oliveira, opcional): de noite ele acende no chão; de dia, nada.

describe('o brilho do cogumelo', () => {
  it('é da noite: nada de dia, inteiro de noite, e chega devagar no fim da tarde', () => {
    expect(nightAmount(0.5)).toBe(0);
    expect(nightAmount(0.4)).toBe(0);
    expect(nightAmount(0.9)).toBe(1);
    expect(nightAmount(0.05)).toBe(1);
    const dusk = nightAmount(0.74);
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
    const dawn = nightAmount(0.26);
    expect(dawn).toBeGreaterThan(0);
    expect(dawn).toBeLessThan(1);
  });

  it('só a espécie que brilha de verdade acende (o cogumelo-da-oliveira)', () => {
    const all = MUSHROOM_KINDS.map((kind, i) => ({ kind, worldX: i, worldY: 0 }));
    expect(glowingOf(all).map((m) => m.kind)).toEqual(['jackOLantern']);
    expect(FUNGUS_SPECS.jackOLantern.edibility).toBe('poison');
  });
});
