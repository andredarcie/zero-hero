import { describe, expect, it } from 'vitest';

import { TILESET } from '@/game/objects/nature/kit';
import { RAMPS } from './pixelForms';
import { drawSakura, SAKURA_H, SAKURA_W } from './sakuraArt';

// A CEREJEIRA DA MEDITAÇÃO: a maior árvore do vale sem engolir a clareira, no traço e na paleta do jogo, rosa na copa,
// e os dois quadros de vento só balançam.

const draw = (f: number): Map<string, string> => {
  const px = new Map<string, string>();
  drawSakura((x, y, color) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx < 0 || ry < 0 || rx >= SAKURA_W || ry >= SAKURA_H) return;
    px.set(`${rx},${ry}`, color);
  }, f);
  return px;
};
const coords = (px: Map<string, string>): Array<[number, number, string]> =>
  [...px].map(([k, c]) => { const [x, y] = k.split(',').map(Number); return [x, y, c]; });

describe('a cerejeira da meditação', () => {
  const still = draw(0);

  it('é a maior árvore do vale (o carvalho velho do bosque tem 44×44), mas não a de 7 tiles que engolia a clareira', () => {
    expect(SAKURA_W).toBeGreaterThan(44 * 1.4);
    expect(SAKURA_H).toBeGreaterThan(44 * 1.4);
    expect(SAKURA_W).toBeLessThanOrEqual(80);
    expect(SAKURA_H).toBeLessThanOrEqual(76);
    const xs = coords(still).map(([x]) => x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(SAKURA_W * 0.9);
  });

  it('o pé do tronco fica no meio da linha de baixo (é dele que o billboard se apoia no chão)', () => {
    const bark = new Set<string>([TILESET.bark, TILESET.barkDk, TILESET.barkDeep]);
    const foot = coords(still).filter(([, y, c]) => y >= SAKURA_H - 8 && bark.has(c)).map(([x]) => x);
    expect(foot.length).toBeGreaterThan(10);
    const mid = foot.reduce((a, b) => a + b, 0) / foot.length;
    expect(Math.abs(mid - SAKURA_W / 2)).toBeLessThan(6);
  });

  it('só usa cores do tileset e da rampa rosa do jogo, sem preto puro (nada de paleta própria)', () => {
    const allowed = new Set<string>([...Object.values(TILESET), ...RAMPS.pink]);
    const used = new Set(still.values());
    for (const c of used) expect(allowed.has(c), c).toBe(true);
    expect(used.has('#000000')).toBe(false);
  });

  it('a copa é rosa: a parte de cima é quase toda flor (a rampa rosa e o branco das flores)', () => {
    const bloom = new Set<string>([...RAMPS.pink, TILESET.bone]);
    const top = coords(still).filter(([, y]) => y < SAKURA_H * 0.48);
    const pink = top.filter(([, , c]) => bloom.has(c)).length;
    expect(pink / top.length).toBeGreaterThan(0.85);
  });

  it('a flor branca é acento, não chiado: pouca, e na crista dos tufos', () => {
    const white = [...still.values()].filter((c) => c === TILESET.bone).length;
    expect(white / still.size).toBeGreaterThan(0.01);
    expect(white / still.size).toBeLessThan(0.12);
  });

  it('o quadro de vento só balança: quase todos os pixels iguais', () => {
    const wind = draw(1);
    let differ = 0;
    for (const [k, c] of still) if (wind.get(k) !== c) differ += 1;
    expect(differ / still.size).toBeLessThan(0.2);
    expect(differ).toBeGreaterThan(0);
  });
});
