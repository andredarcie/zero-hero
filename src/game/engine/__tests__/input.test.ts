import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as Engine from '@/game/engine';
import { bootEngine, type BootedEngine } from '@/test-support/engine';

// A ENTRADA pela página do anfitrião (host.ts): o teste aperta as teclas e clica no canvas como o navegador
// entregaria, e o motor tem de dar ao jogo o que ele sempre deu — `isDown`, `JustDown` uma vez só por toque, o
// `keydown-X`, as teclas soltas ao perder o foco, e o clique no objeto interativo de cima.

const K = Engine.Input.Keyboard.KeyCodes;

class Play extends Engine.Scene {
  public events_: string[] = [];
  public constructor() { super('play'); }
}

let booted: BootedEngine;
let scene: Play;

beforeEach(async () => {
  booted = await bootEngine([Play], { page: true });
  scene = booted.game.scene.getScene('play') as Play;
});

describe('teclado', () => {
  it('isDown enquanto a tecla está apertada; JustDown só no primeiro quadro', () => {
    const z = scene.input.keyboard!.addKey(K.Z);
    const page = booted.host.page!;
    page.key('keydown', K.Z);
    booted.tick(1);
    expect(z.isDown).toBe(true);
    expect(Engine.Input.Keyboard.JustDown(z)).toBe(true);
    expect(Engine.Input.Keyboard.JustDown(z)).toBe(false);
    page.key('keyup', K.Z);
    booted.tick(1);
    expect(z.isDown).toBe(false);
    expect(Engine.Input.Keyboard.JustUp(z)).toBe(true);
  });

  it('o evento keydown-X sai para a cena, e a tecla capturada não chega ao navegador', () => {
    const onX = vi.fn();
    scene.input.keyboard!.on('keydown-X', onX);
    scene.input.keyboard!.addKey(K.X);
    const event = booted.host.page!.key('keydown', K.X);
    booted.tick(1);
    expect(onX).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it('com modificador a tecla não é capturada (o atalho do navegador continua valendo)', () => {
    scene.input.keyboard!.addKey(K.R);
    const event = booted.host.page!.key('keydown', K.R, { ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
  });

  it('as setas do createCursorKeys', () => {
    const cursors = scene.input.keyboard!.createCursorKeys();
    booted.host.page!.key('keydown', K.LEFT);
    booted.tick(1);
    expect(cursors.left.isDown).toBe(true);
    expect(cursors.right.isDown).toBe(false);
  });

  it('perder o foco solta todas as teclas (nada fica "preso" apertado)', () => {
    const z = scene.input.keyboard!.addKey(K.Z);
    booted.host.page!.key('keydown', K.Z);
    booted.tick(1);
    expect(z.isDown).toBe(true);
    booted.host.page!.visibility!.blur();
    expect(z.isDown).toBe(false);
  });

  it('dormir a cena também solta as teclas', () => {
    const z = scene.input.keyboard!.addKey(K.Z);
    booted.host.page!.key('keydown', K.Z);
    booted.tick(1);
    booted.game.scene.sleep('play');
    expect(z.isDown).toBe(false);
  });

  it('o mesmo evento repetido (mesmo código, tipo e instante) conta uma vez só', () => {
    const z = scene.input.keyboard!.addKey(K.Z);
    const onDown = vi.fn();
    z.on('down', onDown);
    const page = booted.host.page!;
    const event = Engine.Input.Keyboard.KeyCodes.Z;
    page.key('keydown', event, { timeStamp: 42 });
    page.key('keydown', event, { timeStamp: 42 });
    booted.tick(1);
    expect(onDown).toHaveBeenCalledTimes(1);
  });
});

describe('ponteiro', () => {
  it('o clique no objeto interativo dispara o pointerdown dele, e fora dele não', () => {
    const target = scene.add.rectangle(100, 100, 40, 40, 0xffffff).setInteractive();
    const onDown = vi.fn();
    target.on('pointerdown', onDown);
    booted.tick(1);
    const page = booted.host.page!;
    page.mouse('mousedown', 100, 100);
    booted.tick(1);
    expect(onDown).toHaveBeenCalledOnce();
    page.mouse('mouseup', 100, 100);
    page.mouse('mousedown', 10, 10);
    booted.tick(1);
    expect(onDown).toHaveBeenCalledOnce();
  });

  // Quem fica por cima sai da ordem de DESENHO (a lista da câmera), que sem GPU não existe; o que vale sem desenho
  // é que dois objetos empilhados não recebem o mesmo clique (topOnly).
  it('dois objetos empilhados: só um recebe o clique (topOnly)', () => {
    const below = scene.add.rectangle(50, 50, 40, 40, 0xffffff).setInteractive();
    const above = scene.add.rectangle(50, 50, 40, 40, 0xffffff).setInteractive();
    const hits: string[] = [];
    below.on('pointerdown', () => hits.push('below'));
    above.on('pointerdown', () => hits.push('above'));
    booted.tick(1);
    booted.host.page!.mouse('mousedown', 50, 50);
    expect(hits).toHaveLength(1);
    scene.input.topOnly = false;
    booted.host.page!.mouse('mouseup', 50, 50);
    booted.host.page!.mouse('mousedown', 50, 50);
    expect(hits).toHaveLength(3);
  });

  it('a cena ouve o pointerdown em qualquer lugar e sabe onde foi', () => {
    const positions: Array<[number, number]> = [];
    scene.input.on('pointerdown', (p: Engine.Input.Pointer) => positions.push([p.x, p.y]));
    booted.host.page!.mouse('mousedown', 33, 44);
    booted.tick(1);
    expect(positions).toEqual([[33, 44]]);
    expect(scene.input.activePointer.isDown).toBe(true);
  });

  it('passar por cima e sair: pointerover / pointerout, e o cursor da mão', () => {
    const target = scene.add.rectangle(100, 100, 40, 40, 0xffffff).setInteractive({ useHandCursor: true });
    const seen: string[] = [];
    target.on('pointerover', () => seen.push('over'));
    target.on('pointerout', () => seen.push('out'));
    booted.tick(1);
    const page = booted.host.page!;
    page.mouse('mousemove', 100, 100, { buttons: 0 });
    booted.tick(1);
    expect(page.cursor).toBe('pointer');
    page.mouse('mousemove', 5, 5, { buttons: 0 });
    booted.tick(1);
    expect(seen).toEqual(['over', 'out']);
  });

  it('desligado, o objeto não recebe o clique', () => {
    const target = scene.add.rectangle(100, 100, 40, 40, 0xffffff).setInteractive();
    const onDown = vi.fn();
    target.on('pointerdown', onDown);
    target.disableInteractive();
    booted.tick(1);
    booted.host.page!.mouse('mousedown', 100, 100);
    booted.tick(1);
    expect(onDown).not.toHaveBeenCalled();
  });
});
