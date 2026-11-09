import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as Engine from '@/game/engine';
import { TransformMatrix } from '@/game/engine/matrix';
import { bootEngine, type BootedEngine } from '@/test-support/engine';

// OS SISTEMAS DE UMA CENA rodando no motor de verdade: câmera (rolagem, limites, zoom, ponto do mundo e os
// efeitos de escurecer/clarão/tremor), animações e temporizadores andando com o quadro, partículas e o mapa de
// tiles do editor, e o tamanho da tela.

class Stage extends Engine.Scene {
  public constructor() { super('stage'); }
}

let booted: BootedEngine;
let scene: Stage;

beforeEach(async () => {
  booted = await bootEngine([Stage], { width: 320, height: 240 });
  scene = booted.game.scene.getScene('stage') as Stage;
});

describe('câmera', () => {
  it('nasce do tamanho da tela; rolagem, centerOn e o ponto do mundo', () => {
    const cam = scene.cameras.main;
    expect([cam.width, cam.height]).toEqual([320, 240]);
    cam.setScroll(100, 50);
    expect([cam.scrollX, cam.scrollY]).toEqual([100, 50]);
    cam.centerOn(500, 400);
    expect([cam.midPoint.x, cam.midPoint.y]).toEqual([500, 400]);
    cam.preRender();
    const p = cam.getWorldPoint(0, 0);
    expect([p.x, p.y]).toEqual([340, 280]);
  });

  it('com limites, a rolagem não sai do mundo', () => {
    const cam = scene.cameras.main.setBounds(0, 0, 1000, 800);
    cam.setScroll(-500, 5000);
    cam.preRender();
    expect(cam.scrollX).toBe(0);
    expect(cam.scrollY).toBe(800 - 240);
    cam.removeBounds();
    cam.setScroll(-500, 0);
    cam.preRender();
    expect(cam.scrollX).toBe(-500);
  });

  it('o zoom muda o tamanho do que se vê', () => {
    const cam = scene.cameras.main.setZoom(2);
    expect(cam.zoom).toBe(2);
    expect(cam.displayWidth).toBe(160);
    cam.preRender();
    expect(cam.worldView.width).toBe(160);
  });

  it('escurecer: começa, avança com o quadro e avisa o fim', () => {
    const cam = scene.cameras.main;
    const seen: string[] = [];
    cam.on('camerafadeoutstart', () => seen.push('start'));
    cam.on('camerafadeoutcomplete', () => seen.push('complete'));
    cam.fadeOut(200, 0, 0, 0);
    booted.tick(6);
    expect(cam.fadeEffect.progress).toBeGreaterThan(0.3);
    expect(cam.fadeEffect.progress).toBeLessThan(1);
    booted.tick(10);
    expect(seen).toEqual(['start', 'complete']);
    cam.fadeIn(100);
    booted.tick(10);
    expect(cam.fadeEffect.isRunning).toBe(false);
  });

  it('clarão e tremor também terminam e avisam', () => {
    const cam = scene.cameras.main;
    const done = vi.fn();
    cam.on('cameraflashcomplete', done);
    cam.on('camerashakecomplete', done);
    cam.flash(100);
    cam.shake(100, 0.05);
    booted.tick(12);
    expect(done).toHaveBeenCalledTimes(2);
  });

  it('a tela mudou de tamanho: a câmera principal acompanha', () => {
    booted.game.scale.resize(640, 360);
    expect([booted.game.scale.width, booted.game.scale.height]).toEqual([640, 360]);
    expect([scene.cameras.main.width, scene.cameras.main.height]).toEqual([640, 360]);
    expect([booted.game.canvas.width, booted.game.canvas.height]).toEqual([640, 360]);
  });

  it('uma segunda câmera e as câmeras sob um ponto', () => {
    const mini = scene.cameras.add(220, 0, 100, 80);
    expect(scene.cameras.getCamerasBelowPointer({ x: 250, y: 10 })[0]).toBe(mini);
    expect(scene.cameras.getCamerasBelowPointer({ x: 10, y: 200 })).toEqual([scene.cameras.main]);
  });
});

describe('animações e temporizadores com o quadro', () => {
  it('um tween anda pelo relógio próprio e chega no valor final', async () => {
    const target = { x: 0 };
    const done = vi.fn();
    scene.tweens.add({ targets: target, x: 100, duration: 200, onComplete: done });
    expect(scene.tweens.isTweening(target)).toBe(true);
    await booted.until(() => done.mock.calls.length > 0, 60);
    expect(target.x).toBe(100);
    expect(scene.tweens.isTweening(target)).toBe(false);
  });

  it('killTweensOf para no meio, e o valor fica onde estava', () => {
    const target = { x: 0 };
    scene.tweens.add({ targets: target, x: 100, duration: 1000 });
    booted.tick(10);
    const mid = target.x;
    scene.tweens.killTweensOf(target);
    booted.tick(10);
    expect(target.x).toBe(mid);
    expect(mid).toBeGreaterThan(0);
  });

  it('delayedCall dispara uma vez, no tempo da cena', () => {
    const fn = vi.fn();
    scene.time.delayedCall(100, fn);
    booted.tick(5);
    expect(fn).not.toHaveBeenCalled();
    booted.tick(3);
    expect(fn).toHaveBeenCalledOnce();
    booted.tick(10);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('cena pausada congela tweens e temporizadores', () => {
    const fn = vi.fn();
    scene.time.delayedCall(50, fn);
    booted.game.scene.pause('stage');
    booted.tick(20);
    expect(fn).not.toHaveBeenCalled();
    booted.game.scene.resume('stage');
    booted.tick(5);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('desligar a cena destrói os temporizadores pendentes', () => {
    const fn = vi.fn();
    scene.time.delayedCall(50, fn);
    booted.game.scene.stop('stage');
    booted.tick(10);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('partículas', () => {
  it('emite pela frequência, cada uma vive o tempo dela e morre', () => {
    const emitter = scene.add.particles(0, 0, '__WHITE', {
      x: { min: -10, max: 10 }, lifespan: 200, speedY: { min: 10, max: 20 }, frequency: 50, quantity: 1,
      alpha: { start: 1, end: 0 }, tint: [0xff0000, 0x00ff00],
    });
    booted.tick(10);
    const alive = emitter.getAliveParticleCount();
    expect(alive).toBeGreaterThan(1);
    emitter.stop();
    booted.tick(30);
    expect(emitter.getAliveParticleCount()).toBe(0);
    expect(emitter.getDeadParticleCount()).toBeGreaterThan(0);
  });

  it('emitParticle solta várias de uma vez, no ponto pedido', () => {
    const emitter = scene.add.particles(0, 0, '__WHITE', { lifespan: 1000, emitting: false });
    emitter.emitParticle(5, 10, 20);
    expect(emitter.getAliveParticleCount()).toBe(5);
  });
});

describe('mapa de tiles (o editor)', () => {
  it('a folha vira tileset, e cada tile posto tem índice e lugar', () => {
    const sheet = booted.host.createCanvas(32, 16);
    scene.textures.addCanvas('tiles-test', sheet);
    const map = scene.make.tilemap({ tileWidth: 8, tileHeight: 8, width: 5, height: 4 });
    const set = map.addTilesetImage('tiles-test')!;
    expect([set.columns, set.rows, set.total]).toEqual([4, 2, 8]);
    expect(set.getTileTextureCoordinates(5)).toEqual({ x: 8, y: 8 });
    expect(set.getTileTextureCoordinates(99)).toBeNull();
    const layer = map.createBlankLayer('ground', set)!;
    expect([layer.width, layer.height]).toEqual([40, 32]);
    expect(layer.getTileAt(1, 1)).toBeNull();
    const tile = layer.putTileAt(3, 1, 1)!;
    expect([tile.index, tile.pixelX, tile.pixelY]).toEqual([3, 8, 8]);
    expect(layer.getTileAt(1, 1)).toBe(tile);
    layer.removeTileAt(1, 1);
    expect(layer.getTileAt(1, 1)).toBeNull();
    expect(layer.putTileAt(1, 9, 9)).toBeNull();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(map.createBlankLayer('ground', set)).toBeNull();
    expect(map.addTilesetImage('nao-existe')).toBeNull();
    warn.mockRestore();
  });
});

describe('matriz e cor', () => {
  it('a matriz compõe translação, rotação e escala, e inverte', () => {
    const m = new TransformMatrix();
    m.applyITRS(10, 20, Math.PI / 2, 2, 2);
    expect(m.getX(1, 0)).toBeCloseTo(10, 5);
    expect(m.getY(1, 0)).toBeCloseTo(22, 5);
    const out = { x: 0, y: 0 };
    m.applyInverse(10, 22, out);
    expect(out.x).toBeCloseTo(1, 5);
    expect(out.y).toBeCloseTo(0, 5);
  });

  it('a cor vira número e volta', () => {
    const c = Engine.Display.Color.HexStringToColor('#336699');
    expect(c.color).toBe(0x336699);
    expect(Engine.Display.Color.GetColor(0x33, 0x66, 0x99)).toBe(0x336699);
    const mid = Engine.Display.Color.Interpolate.ColorWithColor(new Engine.Display.Color(0, 0, 0), new Engine.Display.Color(200, 100, 50), 100, 50);
    expect([mid.r, mid.g, mid.b]).toEqual([100, 50, 25]);
  });
});
