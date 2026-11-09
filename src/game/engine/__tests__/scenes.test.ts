import { describe, expect, it } from 'vitest';

import * as Engine from '@/game/engine';
import { bootEngine } from '@/test-support/engine';

// AS CENAS: o motor sobe no Node (sem navegador, sem GPU), liga a primeira cena e anda os quadros. O que se cobra é
// o que o jogo inteiro assume: a ordem init → preload → create, as trocas que só valem no quadro seguinte, a ordem
// de atualização (de trás para frente) e o que cada estado (pausada, dormindo, parada) deixa de fazer.

const log: string[] = [];

class First extends Engine.Scene {
  public updates = 0;
  public constructor() { super('first'); }
  public init(data: unknown): void { log.push(`first.init:${JSON.stringify(data)}`); }
  public preload(): void { log.push('first.preload'); }
  public create(): void {
    log.push('first.create');
    this.events.once(Engine.Scenes.Events.SHUTDOWN, () => log.push('first.shutdown'));
  }
  public update(): void { this.updates++; log.push('first.update'); }
}

class Second extends Engine.Scene {
  public updates = 0;
  public received: unknown = null;
  public constructor() { super('second'); }
  public create(data: unknown): void { this.received = data; log.push('second.create'); }
  public update(): void { this.updates++; log.push('second.update'); }
}

describe('cenas', () => {
  it('a primeira cena liga sozinha: init, preload e create, nessa ordem', async () => {
    log.length = 0;
    const { game, tick } = await bootEngine([First, Second]);
    expect(log.slice(0, 3)).toEqual(['first.init:{}', 'first.preload', 'first.create']);
    expect(game.scene.isActive('first')).toBe(true);
    expect(game.scene.isActive('second')).toBe(false);
    tick(3);
    const first = game.scene.getScene('first') as First;
    expect(first.updates).toBe(3);
  });

  it('a troca pedida por this.scene só vale no quadro seguinte, e o dado chega no create', async () => {
    log.length = 0;
    const { game, tick } = await bootEngine([First, Second]);
    const first = game.scene.getScene('first') as First;
    first.scene.start('second', { from: 'first' });
    expect(game.scene.isActive('second')).toBe(false);
    tick(1);
    const second = game.scene.getScene('second') as Second;
    expect(second.received).toEqual({ from: 'first' });
    expect(game.scene.isActive('first')).toBe(false);
    expect(log).toContain('first.shutdown');
  });

  it('as cenas atualizam de trás para frente (a de cima primeiro)', async () => {
    const { game, tick } = await bootEngine([First, Second]);
    game.scene.run('second');
    log.length = 0;
    tick(1);
    expect(log).toEqual(['second.update', 'first.update']);
  });

  it('pausada não atualiza; dormindo não atualiza nem aparece; acordar e retomar voltam', async () => {
    const { game, tick } = await bootEngine([First]);
    const first = game.scene.getScene('first') as First;
    const before = first.updates;
    game.scene.pause('first');
    expect(game.scene.isPaused('first')).toBe(true);
    tick(2);
    expect(first.updates).toBe(before);
    game.scene.resume('first');
    tick(1);
    expect(first.updates).toBe(before + 1);
    game.scene.sleep('first');
    expect(game.scene.isSleeping('first')).toBe(true);
    expect(game.scene.isVisible('first')).toBe(false);
    tick(2);
    expect(first.updates).toBe(before + 1);
    game.scene.run('first');
    expect(game.scene.isActive('first')).toBe(true);
    tick(1);
    expect(first.updates).toBe(before + 2);
  });

  it('restart desliga e religa a mesma cena', async () => {
    log.length = 0;
    const { game, tick } = await bootEngine([First]);
    const first = game.scene.getScene('first') as First;
    first.scene.restart({ again: true });
    tick(1);
    expect(log).toContain('first.shutdown');
    expect(log.filter((l) => l === 'first.create')).toHaveLength(2);
    expect(log).toContain('first.init:{"again":true}');
  });

  it('getScenes, getIndex e stop', async () => {
    const { game } = await bootEngine([First, Second]);
    expect(game.scene.getScenes(false).map((s) => s.sys.settings.key)).toEqual(['first', 'second']);
    expect(game.scene.getScenes(true).map((s) => s.sys.settings.key)).toEqual(['first']);
    expect(game.scene.getIndex('second')).toBe(1);
    expect(game.scene.getScene('nope')).toBeNull();
    game.scene.stop('first');
    expect(game.scene.isActive('first')).toBe(false);
  });

  it('o registro é do jogo inteiro', async () => {
    const { game } = await bootEngine([First, Second]);
    const first = game.scene.getScene('first') as First;
    const second = game.scene.getScene('second') as Second;
    first.registry.set('appMode', 'game');
    expect(second.registry.get('appMode')).toBe('game');
    expect(game.registry.has('appMode')).toBe(true);
    game.registry.remove('appMode');
    expect(game.registry.has('appMode')).toBe(false);
  });
});

describe('o laço de quadros', () => {
  it('o delta é suavizado: um quadro de 1 s vira o delta de antes', async () => {
    const { game, tick } = await bootEngine([First]);
    tick(20, 16);
    expect(game.loop.delta).toBeCloseTo(16, 5);
    tick(1, 1000);
    expect(game.loop.delta).toBeLessThan(40);
    expect(game.loop.rawDelta).toBe(1000);
  });

  it('PRE_STEP, STEP, POST_STEP, PRE_RENDER e POST_RENDER saem em ordem a cada quadro (sem GPU também)', async () => {
    const { game, tick } = await bootEngine([First]);
    const seen: string[] = [];
    for (const name of ['prestep', 'step', 'poststep', 'prerender', 'postrender']) game.events.on(name, () => seen.push(name));
    tick(1);
    expect(seen).toEqual(['prestep', 'step', 'poststep', 'prerender', 'postrender']);
  });

  it('pausar o jogo para o quadro inteiro; retomar volta', async () => {
    const { game, tick } = await bootEngine([First]);
    const first = game.scene.getScene('first') as First;
    game.pause();
    const before = first.updates;
    tick(3);
    expect(first.updates).toBe(before);
    game.resume();
    tick(1);
    expect(first.updates).toBe(before + 1);
  });

  it('aba escondida pausa o relógio do laço; visível de novo, o tempo parado é descontado', async () => {
    const { game, host, tick } = await bootEngine([First], { page: true });
    const page = host.page!;
    const paused: string[] = [];
    game.events.on(Engine.Core.Events.PAUSE, () => paused.push('pause'));
    game.events.on(Engine.Core.Events.RESUME, () => paused.push('resume'));
    tick(5);
    page.visibility!.hidden();
    host.advance(5000);
    page.visibility!.visible();
    expect(paused).toEqual(['pause', 'resume']);
    page.visibility!.blur();
    expect(game.hasFocus).toBe(false);
    page.visibility!.focus();
    expect(game.hasFocus).toBe(true);
    expect(page.focusCount).toBeGreaterThan(0);
    expect(page.mounted).toEqual([{ parent: undefined, pixelated: true }]);
  });

  it('destroy desliga as cenas no quadro seguinte', async () => {
    const { game, tick } = await bootEngine([First]);
    const first = game.scene.getScene('first') as First;
    let destroyed = false;
    game.events.once(Engine.Core.Events.DESTROY, () => { destroyed = true; });
    game.destroy();
    tick(1);
    expect(destroyed).toBe(true);
    expect(first.sys.getStatus()).toBe(Engine.Scenes.SceneStatus.DESTROYED);
  });
});
