// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CAMP_BED, CAMP_RING } from '@/game/objects/HeroCamp';
import { AFTERWORD_BREATH_MS } from '@/game/runtime/AfterwordNote';
import { setTimeScale } from '@/game/runtime/timeOfDay';
import { SLEEP_TIME_SCALE } from '@/game/systems/Resting';
import { MorningAfter, type MorningAfterHost } from './MorningAfter';
import { MORNING_AFTER_KEY } from './sceneDefs';

// O mundo do disco volta na hora (o fetch é da plataforma; aqui não há disco).
vi.mock('@/game/world/reloadWorld', () => ({ reloadWorldData: () => Promise.resolve() }));
// O relógio do vale: o teste só olha para que ritmo ele foi posto.
vi.mock('@/game/runtime/timeOfDay', async (original) => ({
  ...(await original<typeof import('@/game/runtime/timeOfDay')>()),
  setTimeScale: vi.fn(),
}));

// A MANHÃ DEPOIS DO FIM: os créditos deixam o recado e a cena recomeça; o boot lê o recado uma vez e o herói nasce no
// colchão; ele dorme (sem a Morte), levanta sozinho quando o descanso acaba, o save guarda, e o bilhete aparece e
// segura o herói até fechar.

const makeHost = (adventure = true) => {
  const registry = new Map<string, unknown>();
  let resting = false;
  const polls: Array<{ callback: () => void; removed: boolean }> = [];
  const host = {
    adventure,
    cutsceneActive: false,
    registry: {
      get: (k: string) => registry.get(k),
      set: (k: string, v: unknown) => { registry.set(k, v); },
      remove: (k: string) => { registry.delete(k); },
    },
    camp: { rest: { lieDown: vi.fn(() => { resting = true; }), get isResting() { return resting; } } },
    // O boot já o tirou do colchão (sólido) para o vizinho com espaço.
    playerWorld: { worldX: CAMP_BED.x + 1, worldY: CAMP_BED.y },
    movementController: { interruptMovement: vi.fn() },
    cinema: { fadeWorld: vi.fn(() => Promise.resolve()), wait: vi.fn(() => Promise.resolve()) },
    save: { persistAdventure: vi.fn() },
    scene: { restart: vi.fn() },
    time: {
      addEvent: (cfg: { callback: () => void }) => {
        const ev = { callback: cfg.callback, removed: false, remove() { this.removed = true; } };
        polls.push(ev);
        return ev;
      },
    },
    world3d: { look: { setWorldFade: vi.fn() } },
  };
  const tick = (): void => { for (const p of polls) if (!p.removed) p.callback(); };
  return { host, registry, tick, wake: () => { resting = false; }, morning: new MorningAfter(host as unknown as MorningAfterHost) };
};
const flush = (): Promise<void> => new Promise((r) => { setTimeout(r, 0); });

describe('MorningAfter', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.mocked(setTimeScale).mockClear();
    vi.useFakeTimers({ toFake: ['performance', 'requestAnimationFrame'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a cena que não veio dos créditos nasce como sempre', () => {
    const { morning } = makeHost();
    expect(morning.takeRequest()).toBeNull();
    expect(morning.pending).toBe(false);
  });

  it('depois dos créditos: o recado fica e a cena recomeça', async () => {
    const { morning, registry, host } = makeHost();
    morning.restartAtCamp();
    expect(registry.get(MORNING_AFTER_KEY)).toBe(true);
    await flush();
    expect(host.scene.restart).toHaveBeenCalledTimes(1);
  });

  it('o boot lê o recado uma vez só: o herói nasce no colchão do acampamento', () => {
    const { morning, registry } = makeHost();
    registry.set(MORNING_AFTER_KEY, true);
    expect(morning.takeRequest()).toEqual({ worldX: CAMP_BED.x, worldY: CAMP_BED.y });
    expect(morning.pending).toBe(true);
    expect(morning.takeRequest()).toBeNull();
  });

  it('fora da aventura (o playtest do editor) nunca é a manhã, e o recado não fica para depois', () => {
    const { morning, registry } = makeHost(false);
    registry.set(MORNING_AFTER_KEY, true);
    expect(morning.takeRequest()).toBeNull();
    expect(registry.has(MORNING_AFTER_KEY)).toBe(false);
  });

  it('a manhã: deita no colchão sem a Morte, espera ele levantar sozinho, guarda e mostra o bilhete', async () => {
    const { morning, host, tick, wake } = makeHost();
    const playing = morning.play();
    await flush();
    expect(host.world3d.look.setWorldFade).toHaveBeenCalledWith(1);
    // Deita NO colchão, mesmo que o boot o tenha tirado de lá (o colchão é sólido).
    expect(host.playerWorld).toEqual({ worldX: CAMP_BED.x, worldY: CAMP_BED.y });
    expect(host.movementController.interruptMovement).toHaveBeenCalledWith(CAMP_BED.x, CAMP_BED.y);
    // O colchão fixo do acampamento, e SEM `atCamp`: nem a Morte nem o céu da primeira noite caem sobre o fim.
    expect(host.camp.rest.lieDown).toHaveBeenCalledWith(CAMP_RING.x, CAMP_RING.y, { fixedBed: true });
    expect(host.cinema.fadeWorld).toHaveBeenCalledWith(1, 0, expect.any(Number));
    // A noite espera o acampamento aparecer (relógio parado) e depois passa no ritmo do sono.
    expect(vi.mocked(setTimeScale).mock.calls.map(([s]) => s)).toEqual([0, SLEEP_TIME_SCALE]);
    // Dormindo: nada de bilhete nem de save ainda.
    tick();
    await flush();
    expect(morning.noteOpen).toBe(false);
    expect(host.save.persistAdventure).not.toHaveBeenCalled();
    // Clareou e o descanso o levantou.
    wake();
    tick();
    await playing;
    expect(host.save.persistAdventure).toHaveBeenCalledTimes(1);
    expect(morning.noteOpen).toBe(true);
    expect(host.cutsceneActive).toBe(true);
    // Fechado o bilhete, o herói é do jogador de novo.
    vi.advanceTimersByTime(AFTERWORD_BREATH_MS + 10);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', cancelable: true }));
    expect(morning.noteOpen).toBe(false);
    expect(host.cutsceneActive).toBe(false);
  });

  it('a cena saindo no meio, o bilhete some com ela', async () => {
    const { morning, tick, wake } = makeHost();
    const playing = morning.play();
    wake();
    tick();
    await playing;
    morning.reset();
    expect(morning.noteOpen).toBe(false);
    expect(document.querySelector('#zh-afterword')).toBeNull();
  });
});
