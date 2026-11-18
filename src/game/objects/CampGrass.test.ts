import { beforeEach, describe, expect, it } from 'vitest';

import { adventureState, resetAdventure } from '@/game/runtime/adventureState';
import { REGROW_GROW_DAYS, REGROW_IDLE_DAYS, regrowLevel } from '@/game/runtime/campRegrowth';
import { CampGrass, type CampGrassWorld } from './CampGrass';
import type { TallGrassObject } from './TallGrassObject';

// O MATO DO ACAMPAMENTO: o save lembra o tile cortado e a hora; no boot ele nasce cortado (chão limpo). E ELE VOLTA:
// sem uso, um dia limpo, depois o broto, o joelho, o quase, e em pé de novo (sai do save). A peça em cima, o herói
// pisando e ser passagem contam como uso. O mato de fora da zona é recurso do vale e não entra na conta.

/** Um tufo de mentira, com o mesmo contrato do TallGrassObject que o CampGrass lê. */
const tuft = (x: number, y: number) => {
  const g = {
    worldX: x, worldY: y, st: 'tall' as 'tall' | 'cut' | 'growing', lv: 0, onCut: undefined as undefined | (() => void),
    get isTall() { return this.st === 'tall'; },
    get isGrowing() { return this.st === 'growing'; },
    get growthLevel() { return this.st === 'tall' ? 1 : this.st === 'growing' ? this.lv : 0; },
    settle() { this.st = 'cut'; },
    cut() { this.st = 'cut'; this.onCut?.(); },
    growTo(level: number) { if (level <= 0) { this.st = 'cut'; this.lv = 0; } else { this.st = 'growing'; this.lv = level; } },
    regrow() { this.st = 'tall'; this.lv = 0; },
  };
  return g as unknown as TallGrassObject & typeof g;
};

const world = (over: Partial<CampGrassWorld> = {}) => {
  const w = { clock: 0, used: new Set<string>(), closable: true };
  const api: CampGrassWorld = {
    now: () => w.clock,
    used: (x, y) => w.used.has(`${x},${y}`),
    canClose: () => w.closable,
    ...over,
  };
  return { w, api };
};

describe('o relógio do mato que volta', () => {
  it('um dia limpo, três degraus no dia seguinte, e em pé', () => {
    expect(regrowLevel(0, 0.5)).toBe(0);
    expect(regrowLevel(0, REGROW_IDLE_DAYS + 0.01)).toBe(0.25);
    expect(regrowLevel(0, REGROW_IDLE_DAYS + REGROW_GROW_DAYS * 0.5)).toBe(0.5);
    expect(regrowLevel(0, REGROW_IDLE_DAYS + REGROW_GROW_DAYS * 0.9)).toBe(0.75);
    expect(regrowLevel(0, REGROW_IDLE_DAYS + REGROW_GROW_DAYS)).toBe(1);
    expect(regrowLevel(5, 2)).toBe(0); // o relógio andou para trás: nada passou
  });
});

describe('CampGrass', () => {
  beforeEach(() => { resetAdventure(); });

  it('a foice avisa: o tile entra no save com a hora do corte; o mato de fora não conta', () => {
    const { w, api } = world();
    const inside = tuft(50, 47);
    const outside = tuft(10, 10);
    new CampGrass([inside, outside], api);
    w.clock = 3.2;
    inside.cut();
    outside.cut();
    expect(adventureState().home.cleared).toEqual(['50,47']);
    expect(adventureState().home.clearedAt['50,47']).toBe(3.2);
  });

  it('no boot, o mato que o save lembra já nasce cortado, no degrau do relógio dele', () => {
    const { w, api } = world();
    w.clock = 10;
    adventureState().home.cleared = ['51,46', '52,44'];
    adventureState().home.clearedAt = { '51,46': 9.8, '52,44': 10 - REGROW_IDLE_DAYS - REGROW_GROW_DAYS * 0.5 };
    const fresh = tuft(51, 46);
    const growing = tuft(52, 44);
    const standing = tuft(50, 46);
    const grass = new CampGrass([fresh, growing, standing], api);
    grass.settleSaved();
    expect(fresh.isTall).toBe(false);
    expect(fresh.isGrowing).toBe(false);
    expect(growing.growthLevel).toBe(0.5);
    expect(grass.standing).toBe(1);
  });

  it('sem uso, brota, cresce e fica em pé de novo — e sai do save', () => {
    const { w, api } = world();
    const g = tuft(50, 47);
    const grass = new CampGrass([g], api);
    g.cut();
    w.clock = REGROW_IDLE_DAYS * 0.5;
    expect(grass.tick()).toBe(false);
    expect(g.growthLevel).toBe(0);
    w.clock = REGROW_IDLE_DAYS + 0.01;
    expect(grass.tick()).toBe(true);
    expect(g.isGrowing).toBe(true);
    w.clock = REGROW_IDLE_DAYS + REGROW_GROW_DAYS;
    grass.tick();
    expect(g.isTall).toBe(true);
    expect(adventureState().home.cleared).toEqual([]);
    expect(adventureState().home.clearedAt).toEqual({});
  });

  it('a peça em cima ou o herói pisando zeram o relógio; o broto pisado some', () => {
    const { w, api } = world();
    const g = tuft(50, 47);
    const grass = new CampGrass([g], api);
    g.cut();
    w.clock = REGROW_IDLE_DAYS + 0.3;
    grass.tick();
    expect(g.isGrowing).toBe(true);
    w.used.add('50,47');
    grass.tick();
    expect(g.growthLevel).toBe(0);
    w.used.clear();
    w.clock += REGROW_IDLE_DAYS * 0.9;
    grass.tick();
    expect(g.growthLevel).toBe(0); // o relógio recomeçou quando ele pisou
  });

  it('o tile que é passagem não fecha: crescer ali trancaria alguém', () => {
    const { w, api } = world();
    const g = tuft(50, 47);
    const grass = new CampGrass([g], api);
    g.cut();
    w.closable = false;
    w.clock = REGROW_IDLE_DAYS + REGROW_GROW_DAYS + 0.1;
    grass.tick();
    expect(g.isTall).toBe(false);
    expect(adventureState().home.cleared).toEqual(['50,47']);
  });

  it('o painel de testes faz o mato sem uso voltar já, e o usado continua limpo', () => {
    const { w, api } = world();
    const free = tuft(50, 47);
    const busy = tuft(51, 47);
    const grass = new CampGrass([free, busy], api);
    w.clock = 2;
    free.cut();
    busy.cut();
    w.used.add('51,47');
    grass.regrowNow();
    expect(free.isTall).toBe(true);
    expect(busy.isTall).toBe(false);
  });
});
