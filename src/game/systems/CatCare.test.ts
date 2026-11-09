import { describe, expect, it } from 'vitest';

import type * as Engine from '@/game/engine';
import { tLines, type I18nLine } from '@/game/i18n/i18n';
import { CatCare, type CatBody, type CatHome, type CatHost, type CatParts } from '@/game/systems/CatCare';

const BARREL = { x: 28, y: 47 };

/** O gato e o barril de mentira: guardam o que o sistema fez com eles. */
class FakeCat implements CatBody {
  public atHome = false;
  public petted = 0;
  public destroyed = false;
  public lastUpdate?: { beside: { x: number; y: number } | null; home: { x: number; y: number } | null; free: boolean };
  public constructor(public position: { x: number; y: number }, public readonly arriving: boolean) {}
  public update(_ms: number, _hero: { x: number; y: number }, beside: { x: number; y: number } | null,
    home: { x: number; y: number } | null, free: boolean): void {
    this.lastUpdate = { beside, home, free };
  }
  public pet(): void { this.petted += 1; }
  public destroy(): void { this.destroyed = true; }
}

const fakeParts = (): CatParts & { cats: FakeCat[] } => {
  const cats: FakeCat[] = [];
  const home: CatHome = {
    at: (x, y) => x === BARREL.x && y === BARREL.y,
    bed: { x: BARREL.x, y: BARREL.y + 0.12 },
    destroy: () => undefined,
  };
  return {
    cats,
    cat: (_scene, x, y, arriving) => { const c = new FakeCat({ x, y }, arriving); cats.push(c); return c; },
    barrel: () => home,
  };
};

interface Rig {
  care: CatCare;
  parts: ReturnType<typeof fakeParts>;
  said: I18nLine[][];
  narrated: I18nLine[][];
  heard: Set<string>;
  later: Array<() => void>;
  hearts: Array<[number, number]>;
}

/** Um host de mentira: grava o que o gato pediu à cena. `later` são os delayedCall, para o teste disparar. */
const rig = (over: Partial<CatHost> = {}): Rig => {
  const said: I18nLine[][] = [];
  const narrated: I18nLine[][] = [];
  const heard = new Set<string>();
  const later: Array<() => void> = [];
  const hearts: Array<[number, number]> = [];
  const scene = { time: { delayedCall: (_ms: number, fn: () => void) => { later.push(fn); } } } as unknown as Engine.Scene;
  const host: CatHost = {
    scene,
    ready: () => true,
    heroTile: () => ({ x: 10, y: 10 }),
    facing: () => ({ dx: 0, dy: 1 }),
    heroVisualTile: () => ({ x: 10, y: 10 }),
    isSolid: () => false,
    restFire: () => null,
    roaming: () => true,
    canAct: () => true,
    hearts: (x, y) => { hearts.push([x, y]); },
    narrate: (lines) => { narrated.push(lines); },
    say: (script) => { said.push(script.lines as I18nLine[]); },
    voice: () => undefined,
    heard: (key) => heard.has(key),
    hear: (key) => { heard.add(key); },
    persist: () => undefined,
    ...over,
  };
  const parts = fakeParts();
  return { care: new CatCare(host, parts), parts, said, narrated, heard, later, hearts };
};

const talkCount = (): number => {
  let n = 0;
  while (tLines(`cat.talk.${n + 1}`).length > 0) n += 1;
  return n;
};

describe('CatCare', () => {
  it('o gato chega ATRÁS do herói, e só uma vez', () => {
    const { care, parts } = rig();
    care.ensure(true);
    care.ensure(true);
    expect(parts.cats).toHaveLength(1);
    // O herói olha para baixo (dy = 1): o gato nasce em cima dele.
    expect(parts.cats[0].position).toEqual({ x: 10, y: 9 });
    expect(parts.cats[0].arriving).toBe(true);
  });

  it('com parede atrás, ele nasce no tile do herói', () => {
    const { care, parts } = rig({ isSolid: (x, y) => x === 10 && y === 9 });
    care.ensure(false);
    expect(parts.cats[0].position).toEqual({ x: 10, y: 10 });
  });

  it('sem aventura (ou sem mundo) não há gato', () => {
    const { care, parts } = rig({ ready: () => false });
    care.ensure(true);
    expect(parts.cats).toHaveLength(0);
    expect(care.position).toBeNull();
    expect(care.pet()).toBe(false);
    care.update(16);
  });

  it('na fogueira ele se enrola do lado do herói; fora dela, segue', () => {
    let fire: { x: number; y: number } | null = { x: 10, y: 9 };
    const { care, parts } = rig({ restFire: () => fire, roaming: () => fire === null });
    care.build();
    care.ensure(false);
    care.update(16);
    // Fogo em cima (fy = -1): meio tile para a direita, um décimo para o fogo.
    expect(parts.cats[0].lastUpdate?.beside?.x).toBeCloseTo(10.55);
    expect(parts.cats[0].lastUpdate?.beside?.y).toBeCloseTo(9.9);
    expect(parts.cats[0].lastUpdate?.free).toBe(false);
    fire = null;
    care.update(16);
    expect(parts.cats[0].lastUpdate).toEqual({ beside: null, home: { x: BARREL.x, y: BARREL.y + 0.12 }, free: true });
  });

  it('o carinho só alcança o gato perto, e ele responde com uma lição', () => {
    const { care, parts, said, later, hearts } = rig();
    care.ensure(false);
    expect(care.pet()).toBe(true);
    expect(parts.cats[0].petted).toBe(1);
    expect(hearts).toEqual([[10, 9]]);
    for (const fn of later) fn(); // o segundo miado e a lição
    expect(said).toEqual([tLines('cat.talk.1')]);
    parts.cats[0].position = { x: 13, y: 9 };
    expect(care.pet()).toBe(false);
  });

  it('as lições saem em ordem, e o que ele já disse fica guardado', () => {
    const { care, said, heard } = rig();
    const total = talkCount();
    expect(total).toBeGreaterThan(1);
    for (let n = 1; n <= total; n += 1) {
      care.talk();
      expect(said.at(-1)).toEqual(tLines(`cat.talk.${n}`));
      expect(heard.has(`cat/talk/${n}`)).toBe(true);
    }
    // Depois de todas, qualquer uma (e nenhuma chave nova).
    care.talk();
    expect(said).toHaveLength(total + 1);
    expect(heard.size).toBe(total);
  });

  it('não fala por cima de outra tela', () => {
    const { care, said } = rig({ canAct: () => false });
    care.talk();
    expect(said).toHaveLength(0);
  });

  it('o barril: vazio é um olhar do narrador; com o gato dormindo, carinho', () => {
    const { care, parts, narrated } = rig({ heroVisualTile: () => ({ x: BARREL.x, y: BARREL.y + 1 }) });
    expect(care.useBarrelAt(BARREL.x, BARREL.y)).toBe(false); // antes de o vale subir não há barril
    care.build();
    expect(care.isBarrelAt(BARREL.x, BARREL.y)).toBe(true);
    expect(care.barrelVerb()).toBe('look');
    expect(care.useBarrelAt(BARREL.x, BARREL.y)).toBe(true);
    expect(narrated).toEqual([tLines('cat.barrel')]);
    expect(care.useBarrelAt(BARREL.x + 5, BARREL.y)).toBe(false);

    care.ensure(false);
    parts.cats[0].atHome = true;
    parts.cats[0].position = { x: BARREL.x, y: BARREL.y };
    expect(care.barrelVerb()).toBe('pet');
    expect(care.useBarrelAt(BARREL.x, BARREL.y)).toBe(true);
    expect(parts.cats[0].petted).toBe(1);
    expect(narrated).toHaveLength(1);

    care.destroy();
    expect(parts.cats[0].destroyed).toBe(true);
    expect(care.isBarrelAt(BARREL.x, BARREL.y)).toBe(false);
    expect(care.position).toBeNull();
  });
});
