// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CAMP_CENTER } from '@/game/objects/HeroCamp';
import type { HomePieceKind } from '@/game/objects/homeBuilds';
import { localStore } from '@/game/platform/platform';
import { applyHeroCape } from '@/game/render3d/heroDye';
import { adventureState, resetAdventure, saveAdventure } from '@/game/runtime/adventureState';
import { setTimeOfDay } from '@/game/runtime/timeOfDay';
import { AWAY_RADIUS, CampHome, pieceHandVerb, sundialReading, type CampHomeHost } from './CampHome';

// A capa de verdade troca a folha do herói na GPU; aqui só importa que ela foi pedida, e em que cor.
vi.mock('@/game/render3d/heroDye', () => ({ applyHeroCape: vi.fn() }));

// O LAR NA CENA: a bancada guarda o material; as peças postas respondem (a tina tinge a capa e a manta, a placa guarda o
// nome, o tronco é de sentar, o relógio de sol diz a hora, a lembrança se lê); chegar em casa escreve o nome.

const makeHost = () => {
  const placed: Array<{ kind: HomePieceKind; x: number; y: number }> = [];
  const pieces = {
    at: (x: number, y: number) => placed.find((p) => p.x === x && p.y === y)?.kind ?? null,
    get list() { return placed; },
    count: (k: HomePieceKind) => placed.filter((p) => p.kind === k).length,
    refreshLook: vi.fn(),
    render: vi.fn(),
  };
  const bench = { bump: vi.fn() };
  const host = {
    actions: { useBufferMs: 0, actionButtons: { setVisible: vi.fn() }, controlsHint: undefined },
    bumps: { heroThought: { show: vi.fn() } },
    carry: { updateBackItem: vi.fn() },
    cutsceneActive: false,
    heldItem: 'none' as string,
    inventory: { takeAll: vi.fn(() => ({ kind: host.heldItem, count: 1 })) },
    orders: { flingCraftedItem: vi.fn() },
    playerWorld: { worldX: 54, worldY: 45 },
    props: { tallGrasses: [] },
    query: { getToolboxAt: (x: number, y: number) => (x === 55 && y === 45 ? bench : undefined) },
    save: { persistAdventure: vi.fn() },
    seenItems: new Set<string>(),
    sparkle: { spawnGrowSparkle: vi.fn() },
    steps: { stopBreathing: vi.fn() },
    torch: { heldOnFire: false },
    valley: { heroCamp: { setBlanket: vi.fn() }, campPieces: pieces },
    time: { now: 0 },
  };
  return { host, placed, pieces, bench, home: new CampHome(host as unknown as CampHomeHost) };
};

describe('CampHome', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetAdventure();
    vi.mocked(applyHeroCape).mockClear();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame'] });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('o save guarda o lar: as cores, o nome, as peças postas, o estoque da bancada e o mato cortado', () => {
    Object.assign(adventureState().home, {
      cape: 'anil', name: 'Recanto', pieces: [{ kind: 'tub', x: 52, y: 46 }], cleared: ['50,47'], built: ['log'],
    });
    adventureState().home.stock.wood = 3;
    saveAdventure();
    const raw = JSON.parse(localStore().getItem('zh.cozy.v1') ?? '{}') as { home?: Record<string, unknown> };
    expect(raw.home).toMatchObject({
      cape: 'anil', name: 'Recanto', pieces: [{ kind: 'tub', x: 52, y: 46 }], cleared: ['50,47'], built: ['log'],
      stock: { wood: 3, stone: 0, charcoal: 0, ore: 0 },
    });
  });

  it('o relógio de sol marca a meia hora mais perto, e de noite não marca nada', () => {
    expect(sundialReading(0.5, false)).toBe('12h');
    expect(sundialReading(15.5 / 24, false)).toBe('15h30');
    expect(sundialReading(15.5 / 24, true)).toBe('3:30 pm');
    expect(sundialReading(9 / 24, true)).toBe('9 am');
    expect(sundialReading(2 / 24, false)).toBeNull();
  });

  it('cada peça posta tem o seu gesto, e o enfeite que só enfeita não pede nada à mão', () => {
    expect(pieceHandVerb('tub')).toBe('dye');
    expect(pieceHandVerb('sign')).toBe('write');
    expect(pieceHandVerb('log')).toBe('sit');
    expect(pieceHandVerb('sundial')).toBe('readHour');
    expect(pieceHandVerb('windChime')).toBe('ring');
    expect(pieceHandVerb('easel')).toBe('look');
    expect(pieceHandVerb('lantern')).toBeNull();
    expect(pieceHandVerb(null)).toBeNull();
  });

  it('o X com material diante da bancada o GUARDA nela; ferramenta, tocha acesa ou longe dela, não', () => {
    const { host, home, bench } = makeHost();
    host.heldItem = 'knife';
    expect(home.canStockAt(55, 45)).toBe(false);
    host.heldItem = 'stone';
    expect(home.canStockAt(54, 44)).toBe(false);
    expect(home.stockBenchAt(55, 45)).toBe(true);
    expect(adventureState().home.stock.stone).toBe(1);
    expect(bench.bump).toHaveBeenCalled();
    expect(host.orders.flingCraftedItem).toHaveBeenCalled();
    expect(host.save.persistAdventure).toHaveBeenCalled();
    host.heldItem = 'wood';
    host.torch.heldOnFire = true;
    expect(home.canStockAt(55, 45)).toBe(false);
  });

  it('sem as flores da Sisi a tina não abre: o herói pensa nelas e o narrador diz de onde vem a tinta', () => {
    const { host, home, placed } = makeHost();
    placed.push({ kind: 'tub', x: 52, y: 46 });
    const narrate = vi.fn();
    expect(home.usePieceAt(52, 46, narrate, vi.fn())).toBe(true);
    expect(host.bumps.heroThought.show).toHaveBeenCalled();
    expect(narrate).toHaveBeenCalledWith('camp.tubEmpty');
    expect(home.isOpen).toBe(false);
  });

  it('com as flores, a tina tinge a capa no corpo do herói e a manta no colchão, e a tina mostra a tinta', () => {
    const { host, home, pieces } = makeHost();
    host.seenItems.add('dyeBundle');
    home.useTub(vi.fn());
    expect(home.isOpen).toBe(true);
    home.dip('cape', 'anil');
    expect(applyHeroCape).toHaveBeenLastCalledWith('anil', host);
    home.dip('blanket', 'garanca');
    expect(host.valley.heroCamp.setBlanket).toHaveBeenLastCalledWith('garanca');
    expect(pieces.refreshLook).toHaveBeenCalled();
    expect(adventureState().home).toMatchObject({ cape: 'anil', blanket: 'garanca' });
    home.dyeCard?.close();
    expect(home.isOpen).toBe(false);
  });

  it('o tronco é de sentar: perto do fogo, olhando o fogo; longe, olhando a frente', () => {
    const { home, placed } = makeHost();
    placed.push({ kind: 'log', x: 52, y: 49 }, { kind: 'log', x: 58, y: 45 });
    const sit = vi.fn();
    home.usePieceAt(52, 49, vi.fn(), sit);
    expect(sit).toHaveBeenLastCalledWith({ x: 53, y: 49 });
    home.usePieceAt(58, 45, vi.fn(), sit);
    expect(sit).toHaveBeenLastCalledWith({ x: 58, y: 46 });
  });

  it('a lembrança posta se lê; o enfeite que só enfeita não responde ao Z', () => {
    const { home, placed } = makeHost();
    placed.push({ kind: 'easel', x: 55, y: 47 }, { kind: 'lantern', x: 52, y: 50 });
    const narrate = vi.fn();
    expect(home.usePieceAt(55, 47, narrate, vi.fn())).toBe(true);
    expect(narrate).toHaveBeenCalledWith('camp.easel');
    expect(home.usePieceAt(52, 50, narrate, vi.fn())).toBe(false);
  });

  it('o nome escrito vai para a placa e para o alto da tela', () => {
    const { home, pieces } = makeHost();
    expect(home.homeName).not.toBe('');
    home.writeName('Recanto da Lua');
    expect(adventureState().home.name).toBe('Recanto da Lua');
    expect(pieces.refreshLook).toHaveBeenCalled();
    expect(home.titleText).toContain('Recanto da Lua');
  });

  it('chegar em casa depois de ter ido longe escreve o nome uma vez; quem começa em casa não "chega"', () => {
    setTimeOfDay(0.5);
    const { host, home } = makeHost();
    adventureState().home.name = 'Casa do Lago';
    host.playerWorld = { worldX: 54, worldY: 48 };
    home.applyLook();
    home.update(16);
    expect(home.titleText).toBeNull();
    host.playerWorld = { worldX: CAMP_CENTER.x + AWAY_RADIUS + 2, worldY: CAMP_CENTER.y };
    home.update(16);
    host.playerWorld = { worldX: 54, worldY: 48 };
    home.update(16);
    expect(home.titleText).toContain('Casa do Lago');
    vi.advanceTimersByTime(10_000);
    home.update(16);
    expect(home.titleText).toBeNull();
  });

  it('o relógio de sol posto diz a hora pelo X, e o sino toca', () => {
    setTimeOfDay(15 / 24);
    const { home, placed } = makeHost();
    placed.push({ kind: 'sundial', x: 50, y: 50 }, { kind: 'windChime', x: 51, y: 50 }, { kind: 'cairn', x: 52, y: 50 });
    expect(home.decorVerbAt(50, 50)).toBe('readHour');
    expect(home.decorVerbAt(51, 50)).toBe('ring');
    expect(home.decorVerbAt(52, 50)).toBeNull();
    expect(home.useDecorAt(50, 50)).toBe(true);
    expect(home.titleText).toContain('15');
    expect(home.useDecorAt(51, 50)).toBe(true);
  });
});
