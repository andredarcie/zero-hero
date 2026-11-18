import { describe, expect, it } from 'vitest';

import type * as Engine from '@/game/engine';
import type { DeathVisitHost } from '@/game/entities/DeathVisit';
import type { FireBedHost } from '@/game/entities/FireBed';
import { tLines } from '@/game/i18n/i18n';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { createHeroView } from '@/game/runtime/HeroView';
import type { StarGazeHost } from '@/game/entities/StarGaze';
import {
  DEATH_SCYTHE_KEY, DEATH_VISIT_KEY, DEATH_VISITS, GAZE_SETTLE_MS, REST_TIME_SCALE, Resting, SLEEP_TIME_SCALE,
  type RestBed, type RestHost, type RestParts,
} from '@/game/systems/Resting';

/** O relógio, as teclas e o que a cena fez, tudo à mão do teste. */
interface Rig {
  rest: Resting;
  log: string[];
  scales: number[];
  clock: { sleep: boolean; night: boolean };
  heard: Set<string>;
  later: Array<() => void>;
  press: (code: string, repeat?: boolean) => void;
  listening: () => number;
  beds: Array<{ host: FireBedHost; calls: string[] }>;
  gazes: StarGazeHost[];
  finishGaze: () => void;
  deaths: DeathVisitHost[];
  finishDeath: () => void;
  /** O relógio da cena (ms): o céu da primeira noite espera o corpo assentar nele. */
  setNow: (ms: number) => void;
  stood: Array<{ sleeping: boolean; atFind: boolean }>;
  scythes: Array<{ x: number; y: number }>;
}

const rig = (over: Partial<RestHost> = {}): Rig => {
  const log: string[] = [];
  const scales: number[] = [];
  const clock = { sleep: false, night: false };
  const heard = new Set<string>();
  const later: Array<() => void> = [];
  const listeners = new Set<(event: KeyboardEvent) => void>();
  const beds: Rig['beds'] = [];
  const gazes: StarGazeHost[] = [];
  const deaths: DeathVisitHost[] = [];
  const stood: Rig['stood'] = [];
  const scythes: Rig['scythes'] = [];
  let endGaze: (() => void) | undefined;
  let endDeath: (() => void) | undefined;
  const sceneTime = { now: 0, delayedCall: (_ms: number, fn: () => void) => { later.push(fn); } };
  const scene = {
    tweens: { add: () => undefined, killTweensOf: () => undefined },
    time: sceneTime,
  } as unknown as Engine.Scene;
  const parts: RestParts = {
    bed: (host) => {
      const calls: string[] = [];
      beds.push({ host, calls });
      const bed: RestBed = {
        layDown: () => calls.push('layDown'),
        tick: () => calls.push('tick'),
        quiet: () => calls.push('quiet'),
        rise: () => calls.push('rise'),
        destroy: () => calls.push('destroy'),
      };
      return bed;
    },
    gaze: (host) => {
      gazes.push(host);
      return { run: () => new Promise<void>((resolve) => { endGaze = resolve; }) };
    },
    death: (host) => {
      deaths.push(host);
      return { run: () => new Promise<void>((resolve) => { endDeath = resolve; }) };
    },
  };
  const host: RestHost = {
    scene,
    hero: createHeroView(),
    heroTile: () => ({ x: 10, y: 10 }),
    setTimeScale: (k) => { scales.push(k); },
    isSleepTime: () => clock.sleep,
    isNightTime: () => clock.night,
    settleBody: () => log.push('settle'),
    dropStep: () => log.push('dropStep'),
    freeFeet: () => log.push('freeFeet'),
    dolly: () => undefined,
    vignette: () => undefined,
    listenKeys: (onKey) => {
      listeners.add(onKey);
      return () => listeners.delete(onKey);
    },
    hideBackItem: () => log.push('hideBack'),
    dirt: () => undefined,
    snoreSpot: () => ({ x: 0, y: 0, px: 1 }),
    onStoodUp: (was) => { stood.push(was); },
    sendGuestHome: () => log.push('guestHome'),
    keepGuestForSky: () => log.push('keepGuest'),
    canVisit: () => true,
    heard: (key) => heard.has(key),
    hear: (key) => { heard.add(key); },
    persist: () => undefined,
    growOvernight: () => log.push('grow'),
    isSolid: () => false,
    guestTile: () => null,
    smoke: () => undefined,
    deathSays: () => undefined,
    cutscene: (on) => log.push(on ? 'cutscene:on' : 'cutscene:off'),
    leaveScythe: (at) => { scythes.push(at); },
    ...over,
  };
  const press = (code: string, repeat = false): void => {
    for (const fn of [...listeners]) fn({ code, repeat } as KeyboardEvent);
  };
  return {
    rest: new Resting(host, parts), log, scales, clock, heard, later, press, listening: () => listeners.size,
    beds, gazes, deaths, stood, scythes,
    finishGaze: () => endGaze?.(),
    finishDeath: () => endDeath?.(),
    setNow: (ms) => { sceneTime.now = ms; },
  };
};

/** Deixa as promessas pendentes andarem (a visita da Morte é async). */
const flush = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('Resting', () => {
  it('sentar acelera o relógio, e uma seta levanta', () => {
    const r = rig();
    r.rest.sit(10, 9);
    expect(r.rest.isResting).toBe(true);
    expect(r.rest.fireTile).toEqual({ x: 10, y: 9 });
    expect(r.scales.at(-1)).toBe(REST_TIME_SCALE);
    r.press('KeyZ'); // qualquer outra tecla não levanta (o Z e o X levantam pela cena)
    r.press('ArrowLeft', true); // nem a repetição de quem segura
    expect(r.rest.isResting).toBe(true);
    r.press('ArrowLeft');
    expect(r.rest.isResting).toBe(false);
    expect(r.rest.fireTile).toBeUndefined();
    expect(r.scales.at(-1)).toBe(1);
    expect(r.listening()).toBe(0);
    expect(r.stood).toEqual([{ sleeping: false, atFind: false }]);
  });

  it('os pés só soltam depois de o corpo se esticar, e não se ele sentou de novo', () => {
    const r = rig();
    r.rest.sit(10, 9);
    r.rest.standUp();
    expect(r.log).toContain('dropStep');
    expect(r.log).not.toContain('freeFeet');
    r.rest.sit(10, 9);
    for (const fn of r.later) fn();
    expect(r.log).not.toContain('freeFeet');
    r.rest.standUp();
    for (const fn of r.later) fn();
    expect(r.log).toContain('freeFeet');
  });

  it('sentar duas vezes não deixa duas escutas de tecla', () => {
    const r = rig();
    r.rest.sit(10, 9);
    r.rest.waitForNight(10, 9, () => undefined);
    expect(r.listening()).toBe(1);
  });

  it('no banco com vista, levantar avisa a cena que era um achado', () => {
    const r = rig();
    r.rest.sitOnFind({ x: 12, y: 4 });
    expect(r.rest.atFind).toBe(true);
    r.rest.standUp();
    expect(r.rest.atFind).toBe(false);
    expect(r.stood).toEqual([{ sleeping: false, atFind: true }]);
  });

  it('a noite chega ao lado do telescópio: ele levanta sozinho, quem está ao lado fica, e o aviso vem depois', () => {
    const r = rig();
    let night = 0;
    r.rest.waitForNight(10, 9, () => { night += 1; });
    expect(r.rest.tick()).toBe(false);
    r.clock.night = true;
    expect(r.rest.tick()).toBe(true);
    expect(r.rest.isResting).toBe(false);
    expect(r.log.indexOf('keepGuest')).toBeLessThan(r.log.indexOf('guestHome'));
    expect(night).toBe(0);
    for (const fn of r.later) fn();
    expect(night).toBe(1);
  });

  it('dormindo, o jogador não levanta: nem seta, nem botão — só a manhã (pedido do autor)', () => {
    const r = rig();
    r.rest.lieDown(54, 48, { fixedBed: true, atCamp: true });
    expect(r.rest.canGetUp).toBe(false);
    r.press('ArrowLeft');
    r.rest.getUp();
    expect(r.rest.isSleeping).toBe(true);
    // Sentado, sim.
    const s = rig();
    s.rest.sit(10, 9);
    expect(s.rest.canGetUp).toBe(true);
    s.rest.getUp();
    expect(s.rest.isResting).toBe(false);
  });

  it('dormir: o colchão deita, a noite passa e ele acorda quando clareia', () => {
    const r = rig();
    r.rest.lieDown(54, 48, { fixedBed: true });
    expect(r.rest.isSleeping).toBe(true);
    expect(r.scales.at(-1)).toBe(SLEEP_TIME_SCALE);
    expect(r.beds[0].host.fixed).toBe(true);
    expect(r.beds[0].calls).toEqual(['layDown']);
    expect(r.log).toContain('hideBack');
    // Ainda de dia (não passou pela hora de dormir): continua dormindo.
    expect(r.rest.tick()).toBe(false);
    r.clock.sleep = true;
    r.clock.night = true;
    expect(r.rest.tick()).toBe(false);
    // Fim da hora de dormir, ainda escuro: espera.
    r.clock.sleep = false;
    expect(r.rest.tick()).toBe(false);
    expect(r.log).toContain('grow');
    // Clareou.
    r.clock.night = false;
    expect(r.rest.tick()).toBe(true);
    expect(r.rest.isResting).toBe(false);
    expect(r.beds[0].calls).toContain('rise');
    expect(r.stood).toEqual([{ sleeping: true, atFind: false }]);
  });

  it('numa fogueira de vizinho a Morte não vem', () => {
    const r = rig();
    r.rest.lieDown(10, 9);
    r.clock.sleep = true;
    r.rest.tick();
    r.clock.sleep = false;
    r.rest.tick();
    expect(r.deaths).toHaveLength(0);
  });

  it('a primeira noite no acampamento: o escuro chega, a noite espera o corpo assentar, a câmera vai ao céu e só então a Morte vem (pedido do autor)', async () => {
    const r = rig();
    r.rest.lieDown(54, 48, { fixedBed: true, atCamp: true });
    r.clock.sleep = true;
    r.clock.night = true;
    // Acabou de deitar: a noite para (dormindo ela passaria inteira em segundos), e o céu ainda espera.
    expect(r.rest.tick()).toBe(false);
    expect(r.scales.at(-1)).toBe(0);
    expect(r.gazes).toHaveLength(0);
    r.setNow(GAZE_SETTLE_MS);
    expect(r.rest.tick()).toBe(true);
    expect(r.gazes).toHaveLength(1);
    expect(r.gazes[0].at).toEqual({ x: 10, y: 10 });
    expect(r.deaths).toHaveLength(0);
    expect(r.log).toContain('cutscene:on');
    expect(r.beds[0].calls).toContain('quiet');
    // Olhando o céu, ninguém levanta, e o quadro não volta para o jogo.
    r.rest.standUp();
    expect(r.rest.isResting).toBe(true);
    expect(r.rest.tick()).toBe(false);
    expect(r.gazes).toHaveLength(1);
    expect(r.log.filter((l) => l === 'cutscene:off')).toHaveLength(0);
    // A câmera voltou ao chão: a Morte, na clareira ao lado das pedras.
    r.finishGaze();
    await flush();
    expect(r.deaths).toHaveLength(1);
    expect(r.deaths[0].at).toEqual({ x: 55, y: 49 });
    expect(r.log.filter((l) => l === 'cutscene:off')).toHaveLength(0);
    r.finishDeath();
    await flush();
    expect(r.heard.has(DEATH_VISIT_KEY)).toBe(true);
    expect(r.log.at(-1)).toBe('cutscene:off');
    expect(r.scales.at(-1)).toBe(SLEEP_TIME_SCALE);
    // A mesma noite não traz outra visita nem outro céu: só acorda quando clareia.
    expect(r.rest.tick()).toBe(false);
    r.clock.sleep = false;
    expect(r.rest.tick()).toBe(false);
    expect(r.log).toContain('grow');
    expect(r.gazes).toHaveLength(1);
    expect(r.deaths).toHaveLength(1);
    r.clock.night = false;
    expect(r.rest.tick()).toBe(true);
    // Na primeira noite ela só AVISA (pedido do autor, 2026-11-17): a foice fica para o fim da terceira.
    expect(r.scythes).toEqual([]);
    expect(r.heard.has(DEATH_SCYTHE_KEY)).toBe(false);
  });

  it('a foice só fica no fim da TERCEIRA noite, onde a Morte esteve, e uma vez só', async () => {
    const r = rig();
    r.heard.add(DEATH_VISITS[0].key);
    r.heard.add(DEATH_VISITS[1].key);
    r.rest.lieDown(54, 48, { fixedBed: true, atCamp: true });
    r.setNow(GAZE_SETTLE_MS * 4);
    r.clock.sleep = true;
    r.clock.night = true;
    r.rest.tick();
    r.clock.sleep = false;
    expect(r.rest.tick()).toBe(true);
    r.finishDeath();
    await flush();
    expect(r.heard.has(DEATH_VISITS[2].key)).toBe(true);
    expect(r.scythes).toEqual([]);
    r.clock.night = false;
    expect(r.rest.tick()).toBe(true);
    expect(r.scythes).toEqual([{ x: 55, y: 49 }]);
    expect(r.heard.has(DEATH_SCYTHE_KEY)).toBe(true);
  });

  it('nas noites seguintes a Morte vem de madrugada, sem o céu, uma vez por noite', async () => {
    const r = rig();
    r.heard.add(DEATH_VISIT_KEY);
    r.rest.lieDown(54, 48, { fixedBed: true, atCamp: true });
    r.setNow(GAZE_SETTLE_MS * 4);
    r.clock.sleep = true;
    r.clock.night = true;
    expect(r.rest.tick()).toBe(false);
    expect(r.scales.at(-1)).toBe(SLEEP_TIME_SCALE);
    r.clock.sleep = false;
    expect(r.rest.tick()).toBe(true);
    expect(r.gazes).toHaveLength(0);
    expect(r.deaths).toHaveLength(1);
    expect(r.scales.at(-1)).toBe(0);
    r.finishDeath();
    await flush();
    expect(r.heard.has(DEATH_VISITS[1].key)).toBe(true);
    expect(r.rest.tick()).toBe(false);
    expect(r.deaths).toHaveLength(1);
  });

  it('as três noites, em ordem, e depois nenhuma', async () => {
    const r = rig();
    r.setNow(GAZE_SETTLE_MS * 10);
    for (let night = 0; night < DEATH_VISITS.length + 1; night += 1) {
      r.rest.lieDown(54, 48, { fixedBed: true, atCamp: true });
      r.setNow(GAZE_SETTLE_MS * (11 + night * 2));
      r.clock.sleep = true;
      r.rest.tick();
      if (night === 0) {
        r.finishGaze();
        await flush();
      }
      r.clock.sleep = false;
      r.rest.tick();
      if (r.deaths.length > night) {
        r.deaths[night].say({} as Billboard3D, () => undefined);
        r.finishDeath();
        await flush();
        r.rest.tick();
      }
      r.rest.standUp();
    }
    expect(r.gazes).toHaveLength(1);
    expect(r.deaths).toHaveLength(DEATH_VISITS.length);
    expect(DEATH_VISITS.every((v) => r.heard.has(v.key))).toBe(true);
    expect(DEATH_VISITS.every((v) => tLines(v.lines).length > 0)).toBe(true);
  });

  it('a foice só uma vez, e nunca no laboratório', () => {
    const lab = rig({ canVisit: () => false });
    for (const v of DEATH_VISITS) lab.heard.add(v.key);
    lab.rest.sit(10, 9);
    lab.rest.standUp();
    expect(lab.scythes).toHaveLength(0);
    const r = rig();
    // Só a primeira noite ouvida: nada ainda.
    r.heard.add(DEATH_VISIT_KEY);
    r.rest.sit(10, 9);
    r.rest.standUp();
    expect(r.scythes).toHaveLength(0);
    for (const v of DEATH_VISITS) r.heard.add(v.key);
    r.rest.sit(10, 9);
    r.rest.standUp();
    r.rest.sit(10, 9);
    r.rest.standUp();
    // Sem visita nesta sessão, ela cai aos pés dele.
    expect(r.scythes).toEqual([{ x: 10, y: 10 }]);
  });

  it('a cena acabando, ninguém fica sentado e o colchão some', () => {
    const r = rig();
    r.rest.lieDown(54, 48);
    r.rest.reset();
    expect(r.rest.isResting).toBe(false);
    expect(r.rest.isSleeping).toBe(false);
    expect(r.listening()).toBe(0);
    expect(r.beds[0].calls).toContain('destroy');
  });
});
