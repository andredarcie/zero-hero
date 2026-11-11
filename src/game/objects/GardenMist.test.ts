import { describe, expect, it } from 'vitest';
import { heroClearing, mistTint, mistVeil } from './GardenMist';

describe('o herói abre a névoa, e o véu é ralo', () => {
  it('em cima do herói sobra um quinto; a 3 tiles, a névoa inteira; no meio, sempre subindo', () => {
    expect(heroClearing(0)).toBeCloseTo(0.2);
    expect(heroClearing(3)).toBe(1);
    expect(heroClearing(9)).toBe(1);
    let last = 0;
    for (let d = 0; d <= 3; d += 0.25) {
      expect(heroClearing(d)).toBeGreaterThanOrEqual(last);
      last = heroClearing(d);
    }
  });

  it('de noite o véu é mais ralo que de dia, e nenhum é parede', () => {
    expect(mistVeil(0)).toBeLessThan(mistVeil(1));
    expect(mistVeil(1)).toBeLessThan(1);
    expect(mistVeil(-2)).toBe(mistVeil(0));
    expect(mistVeil(5)).toBe(mistVeil(1));
  });
});

const channels = (hex: number): [number, number, number] => [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];

describe('o tom da névoa do jardim acompanha a luz do dia', () => {
  it('de noite é o tom inteiro: a noite não muda', () => {
    expect(mistTint(0)).toBe(0x9cb3d2);
  });

  it('ao meio-dia desce, e continua frio: o azul segue o maior canal e nenhum canal zera', () => {
    const [r, g, b] = channels(mistTint(1));
    const [nr, ng, nb] = channels(mistTint(0));
    expect(r).toBeLessThan(nr);
    expect(g).toBeLessThan(ng);
    expect(b).toBeLessThan(nb);
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
    // A névoa é um véu claro, não fumaça: mais da metade do tom fica.
    expect(r / nr).toBeGreaterThan(0.6);
    expect(r / nr).toBeLessThan(0.9);
  });

  it('entre a noite e o dia ela só desce, sem degrau, e fora de 0..1 não passa das pontas', () => {
    let last = channels(mistTint(0))[2];
    for (let d = 0.05; d <= 1.0001; d += 0.05) {
      const blue = channels(mistTint(d))[2];
      expect(blue).toBeLessThanOrEqual(last);
      expect(last - blue).toBeLessThan(6);
      last = blue;
    }
    expect(mistTint(-1)).toBe(mistTint(0));
    expect(mistTint(3)).toBe(mistTint(1));
  });
});
