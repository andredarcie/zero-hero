import { describe, expect, it } from 'vitest';
import { WaterIndex } from './waterIndex';

describe('os limites da água à vista (WaterIndex.boundsInView: o recorte do espelho)', () => {
  const view = { minX: 0, maxX: 20, minZ: 0, maxZ: 15 };

  it('devolve a caixa dos tiles de água dentro da área visível', () => {
    const w = new WaterIndex();
    for (const [x, z] of [[4, 6], [5, 6], [6, 7], [9, 3]]) w.add(x, z);
    const out = { x0: 0, z0: 0, x1: 0, z1: 0 };
    expect(w.boundsInView(view, out)).toBe(true);
    expect(out).toEqual({ x0: 4, z0: 3, x1: 9, z1: 7 });
  });

  it('ignora a água fora da área visível, e sem água nenhuma diz que não há', () => {
    const w = new WaterIndex();
    w.add(40, 40);
    const out = { x0: 0, z0: 0, x1: 0, z1: 0 };
    expect(w.boundsInView(view, out)).toBe(false);
    w.add(2, 2);
    expect(w.boundsInView(view, out)).toBe(true);
    expect(out).toEqual({ x0: 2, z0: 2, x1: 2, z1: 2 });
  });

  it('sem área visível medida (o primeiro quadro) não há água à vista', () => {
    const w = new WaterIndex();
    w.add(2, 2);
    const out = { x0: 0, z0: 0, x1: 0, z1: 0 };
    expect(w.boundsInView({ minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity }, out)).toBe(false);
  });
});
