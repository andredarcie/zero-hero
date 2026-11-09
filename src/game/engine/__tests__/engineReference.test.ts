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

describe('motor 2D: o mesmo comportamento do gabarito', () => {
  it('o gabarito tem um registro para cada cenário', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(Object.keys(SCENARIOS).sort());
  });

  for (const [name, run] of Object.entries(SCENARIOS)) {
    it(name, () => {
      // O gabarito passou por JSON (NaN/Infinity viram null, -0 vira 0): o registro de hoje passa pelo mesmo caminho.
      const log = JSON.parse(JSON.stringify(run(engine))) as unknown[];
      expect(log).toEqual(FIXTURES[name]);
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
