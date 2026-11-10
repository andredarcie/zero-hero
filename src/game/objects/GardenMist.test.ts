import { describe, expect, it } from 'vitest';
import { mistTint } from './GardenMist';

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
