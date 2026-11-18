import { describe, expect, it } from 'vitest';

import { DECOR_KINDS } from '@/game/entities/ItemPickup';
import { BENCH_MATERIALS, HOME_BUILDS, canAfford, homeMenu, isBenchMaterial, isHomePiece, refund, spend } from './homeBuilds';

// O QUE O ACAMPAMENTO PODE GANHAR: as construções, pagas com o material que a bancada guarda (só o que o vale nunca
// deixa acabar), uma nova de cada vez; e os presentes dos vizinhos, que chegam quando o pedido fecha.

const none = (): number => 0;

describe('as peças do lar', () => {
  it('toda construção custa só material que nunca acaba, e todo enfeite do caderno tem a sua', () => {
    for (const b of HOME_BUILDS.filter((x) => !x.gift)) {
      expect(Object.keys(b.cost ?? {}).length, b.kind).toBeGreaterThan(0);
      for (const m of Object.keys(b.cost ?? {})) expect(isBenchMaterial(m), `${b.kind}: ${m}`).toBe(true);
    }
    for (const kind of DECOR_KINDS) expect(isHomePiece(kind), kind).toBe(true);
    expect(isHomePiece('sword')).toBe(false);
  });

  it('cada vizinho com pedido deixa uma lembrança, de graça', () => {
    const gifts = HOME_BUILDS.filter((b) => b.gift);
    expect(gifts.map((b) => b.gift).sort()).toEqual(['astronaut', 'businessMan', 'painter', 'radiationSuit']);
    for (const g of gifts) expect(g.cost).toBeUndefined();
  });

  it('a bancada mostra o que já se fez e UMA construção nova, e os presentes dos pedidos fechados', () => {
    const recipes = HOME_BUILDS.filter((b) => !b.gift).map((b) => b.kind);
    const built = new Set<string>();
    for (const kind of recipes) {
      const menu = homeMenu(built, () => false, none, {});
      expect(menu.map((e) => e.kind)).toEqual([...built, kind]);
      expect(menu.at(-1)?.next).toBe(true);
      built.add(kind);
    }
    const all = homeMenu(built, (q) => q === 'painter', none, {});
    expect(all.map((e) => e.kind)).toEqual([...recipes, 'easel']);
    expect(all.find((e) => e.kind === 'easel')).toMatchObject({ state: 'ready', next: false });
  });

  it('a carta diz se dá para pagar', () => {
    const menu = homeMenu(new Set(['log', 'tub']), () => false, none, { wood: 2 });
    expect(menu.find((e) => e.kind === 'log')?.state).toBe('ready');
    expect(menu.find((e) => e.kind === 'tub')?.state).toBe('lacking');
  });

  it('CADA PEÇA UMA VEZ SÓ: a posta sai da lista (a escada continua), e desmontada volta', () => {
    const built = new Set(['log', 'sign', 'tub']);
    const placed = new Set<string>(['log', 'sign', 'easel']);
    const count = (k: string): number => (placed.has(k) ? 1 : 0);
    const menu = homeMenu(built, (q) => q === 'painter', count, { wood: 9 });
    expect(menu.map((e) => e.kind)).toEqual(['tub', 'sundial']);
    expect(menu.find((e) => e.kind === 'sundial')?.next).toBe(true);
    placed.delete('sign');
    placed.delete('easel');
    const back = homeMenu(built, (q) => q === 'painter', count, { wood: 9 });
    expect(back.map((e) => e.kind)).toEqual(['sign', 'tub', 'sundial', 'easel']);
  });

  it('pagar tira do estoque o que custa, e nunca deixa negativo; desmontar devolve', () => {
    expect(refund({ wood: 2, charcoal: 1 }, { wood: 1, stone: 4 })).toEqual({ wood: 3, stone: 4, charcoal: 1, ore: 0 });
    expect(refund(undefined, { ore: 1 })).toEqual({ wood: 0, stone: 0, charcoal: 0, ore: 1 });
    expect(canAfford({ wood: 2, stone: 1 }, { wood: 2, stone: 1 })).toBe(true);
    expect(canAfford({ wood: 2, stone: 1 }, { wood: 3 })).toBe(false);
    expect(canAfford(undefined, {})).toBe(true);
    expect(spend({ wood: 2, stone: 1 }, { wood: 5, stone: 1, ore: 2 })).toEqual({ wood: 3, stone: 0, charcoal: 0, ore: 2 });
    expect(BENCH_MATERIALS).toEqual(['wood', 'stone', 'charcoal', 'ore']);
  });
});
