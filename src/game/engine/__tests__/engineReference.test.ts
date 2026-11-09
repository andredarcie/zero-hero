import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { Color, HexStringToColor, ValueToColor } from '../color';
import { EventEmitter } from '../events';
import { Between, Clamp, FloatBetween, getEaseFunction, Shuffle, Wrap, WrapDegrees, WrapRadians } from '../math';
import type { Systems } from '../scene';
import { Clock } from '../time';
import { TweenManager, type NumberTweenBuilderConfig, type TweenBuilderConfig } from '../tweens';
import { EASE_NAMES, SCENARIOS, type EngineAdapter } from './referenceScenarios';

// O motor de hoje rodando os cenários de referência (ver referenceScenarios.ts): cada registro tem de bater, número
// por número, com o gabarito gravado. Falhou = o motor mudou o jeito de animar, cronometrar ou emitir eventos.

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = JSON.parse(readFileSync(path.join(here, 'reference.fixtures.json'), 'utf8')) as Record<string, unknown[]>;

/** Os sistemas mínimos de uma cena: o emissor dela e o relógio do jogo. */
const fakeSystems = (loopTime = 0): { sys: Systems; events: EventEmitter } => {
  const events = new EventEmitter();
  // O relógio de parede é o `Date.now()` que os cenários fixam (o mesmo que o gabarito leu).
  const sys = { events, game: { loop: { time: loopTime }, host: { wallNow: () => Date.now() } } } as unknown as Systems;
  return { sys, events };
};

const startScene = (events: EventEmitter) => {
  events.emit('boot');
  events.emit('start');
  return {
    frame: (time: number, delta: number) => { events.emit('preupdate', time, delta); events.emit('update', time, delta); },
    shutdown: () => { events.emit('shutdown'); },
  };
};

const engine: EngineAdapter = {
  tween: (config) => new TweenManager(fakeSystems().sys).add(config as TweenBuilderConfig),
  counter: (config) => new TweenManager(fakeSystems().sys).addCounter(config as NumberTweenBuilderConfig),
  tweenManager: () => {
    const { sys, events } = fakeSystems();
    const manager = new TweenManager(sys);
    return {
      manager: {
        add: (c) => manager.add(c as TweenBuilderConfig),
        addCounter: (c) => manager.addCounter(c as NumberTweenBuilderConfig),
        killTweensOf: (t) => manager.killTweensOf(t),
        isTweening: (t) => manager.isTweening(t),
        getTweens: () => manager.getTweens(),
        pauseAll: () => manager.pauseAll(),
        resumeAll: () => manager.resumeAll(),
      },
      ...startScene(events),
    };
  },
  clock: (loopTime) => {
    const { sys, events } = fakeSystems(loopTime);
    const clock = new Clock(sys);
    return { clock, ...startScene(events) };
  },
  emitter: () => new EventEmitter(),
  ease: (name, params) => getEaseFunction(name, params),
  wrap: Wrap,
  wrapDegrees: WrapDegrees,
  wrapRadians: WrapRadians,
  clamp: Clamp,
  between: Between,
  floatBetween: FloatBetween,
  shuffle: Shuffle,
  interpolateRGB: (r1, g1, b1, r2, g2, b2, length, index) => Color.Interpolate.RGBWithRGB(r1, g1, b1, r2, g2, b2, length, index),
  hexToColor: HexStringToColor,
  valueToColor: ValueToColor,
  newColor: (r, g, b, a) => new Color(r, g, b, a),
};

/**
 * IGUAL AO GABARITO ATÉ O ARREDONDAMENTO. O último bit de um `Math.pow` é do JavaScript, não do motor: o V8 mudou a
 * conta entre versões (o Node 22 do CI dá 2^-0,5 = 0,7071067811865475, o Node 24 em que o gabarito foi gravado dá
 * …476, o arredondamento certo), e a curva Expo saía vermelha no CI sem nada no motor ter mudado. A folga é de 16 ulps
 * do maior dos dois, com um piso de 1e-12 para as contas que cancelam (um tween que chega perto de zero vindo de 100).
 * Um estrago de verdade fica muito acima dela: 0,0001 numa curva é ~10^8 vezes a folga, e um `>=` virando `>` no
 * temporizador muda eventos, que comparam exatos (texto, ordem e contagem nunca têm folga).
 */
const near = (got: number, want: number): boolean => Object.is(got, want)
  || Math.abs(got - want) <= Math.max(1e-12, 16 * Number.EPSILON * Math.max(Math.abs(got), Math.abs(want)));

/** O primeiro lugar em que o registro de hoje difere do gabarito, ou null. */
const firstDifference = (got: unknown, want: unknown, at = '$'): string | null => {
  if (typeof want === 'number' && typeof got === 'number') return near(got, want) ? null : `${at}: ${got} ≠ ${want}`;
  if (Array.isArray(want)) {
    if (!Array.isArray(got)) return `${at}: ${JSON.stringify(got)} não é lista`;
    if (got.length !== want.length) return `${at}: ${got.length} itens ≠ ${want.length}`;
    for (let i = 0; i < want.length; i++) {
      const d = firstDifference(got[i], want[i], `${at}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (want !== null && typeof want === 'object') {
    if (got === null || typeof got !== 'object' || Array.isArray(got)) return `${at}: ${JSON.stringify(got)} não é objeto`;
    const wantKeys = Object.keys(want).sort();
    const gotKeys = Object.keys(got).sort();
    if (wantKeys.join() !== gotKeys.join()) return `${at}: chaves ${gotKeys.join(',')} ≠ ${wantKeys.join(',')}`;
    for (const k of wantKeys) {
      const d = firstDifference((got as Record<string, unknown>)[k], (want as Record<string, unknown>)[k], `${at}.${k}`);
      if (d) return d;
    }
    return null;
  }
  return Object.is(got, want) ? null : `${at}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`;
};

describe('motor 2D: o mesmo comportamento do gabarito', () => {
  it('o gabarito tem um registro para cada cenário', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(Object.keys(SCENARIOS).sort());
  });

  for (const [name, run] of Object.entries(SCENARIOS)) {
    it(name, () => {
      // O gabarito passou por JSON (NaN/Infinity viram null, -0 vira 0): o registro de hoje passa pelo mesmo caminho.
      const log = JSON.parse(JSON.stringify(run(engine))) as unknown[];
      expect(firstDifference(log, FIXTURES[name])).toBeNull();
    });
  }
});

/** Todo .ts do jogo (fora do próprio motor e dos testes). */
const gameSources = (): string[] => {
  const root = path.resolve(here, '../../..');
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out.filter((f) => !f.includes(`${path.sep}engine${path.sep}`));
};

describe('curvas de easing', () => {
  it('toda curva que o jogo escreve está no gabarito (fora dele, o nome cairia no Linear sem aviso)', () => {
    const used = new Set<string>();
    for (const file of gameSources()) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\bease:\s*['"`]([^'"`]+)['"`]/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(10);
    const missing = [...used].filter((name) => !EASE_NAMES.includes(name));
    expect(missing).toEqual([]);
  });
});
