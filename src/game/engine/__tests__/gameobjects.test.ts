import { beforeAll, describe, expect, it, vi } from 'vitest';

import * as Engine from '@/game/engine';
import { bootEngine, type BootedEngine } from '@/test-support/engine';

// OS OBJETOS 2D, o TEXTO, o GRAPHICS, as TEXTURAS e o CARREGADOR, numa cena de verdade do motor (sem GPU, com um
// canvas 2D real): o que se cobra é o que o jogo lê deles — tamanho, origem, transformação, quem desenha e quem não,
// os pixels que um Graphics pinta numa textura, e os arquivos que o carregador entrega.

class Stage extends Engine.Scene {
  public constructor() { super('stage'); }
}

let booted: BootedEngine;
let scene: Stage;
const pixel = (canvas: HTMLCanvasElement, x: number, y: number): number[] =>
  Array.from((canvas.getContext('2d') as CanvasRenderingContext2D).getImageData(x, y, 1, 1).data);

beforeAll(async () => {
  booted = await bootEngine([Stage]);
  scene = booted.game.scene.getScene('stage') as Stage;
});

describe('objetos', () => {
  it('a imagem tem o tamanho do quadro e a origem no meio', () => {
    const white = scene.textures.getFrame('__WHITE');
    const img = scene.add.image(10, 20, '__WHITE');
    expect([img.x, img.y]).toEqual([10, 20]);
    expect([img.width, img.height]).toEqual([white.realWidth, white.realHeight]);
    expect([img.originX, img.originY]).toEqual([0.5, 0.5]);
    img.setOrigin(0, 1).setScale(3);
    expect([img.displayOriginX, img.displayOriginY]).toEqual([0, img.height]);
    expect(img.displayWidth).toBe(img.width * 3);
    img.setDisplaySize(12, 8);
    expect([img.scaleX, img.scaleY]).toEqual([12 / img.width, 8 / img.height]);
  });

  it('quem não desenha: invisível, alfa 0 ou escala 0', () => {
    const cam = scene.cameras.main;
    const img = scene.add.image(0, 0, '__WHITE');
    expect(img.willRender(cam)).toBe(true);
    img.setAlpha(0);
    expect(img.willRender(cam)).toBe(false);
    img.setAlpha(1).setVisible(false);
    expect(img.willRender(cam)).toBe(false);
    img.setVisible(true).setScale(0);
    expect(img.willRender(cam)).toBe(false);
  });

  it('o ângulo é guardado em [-180, 180) e a rotação em radianos', () => {
    const img = scene.add.image(0, 0, '__WHITE').setAngle(270);
    expect(img.angle).toBe(-90);
    expect(img.rotation).toBeCloseTo(-Math.PI / 2, 10);
    img.setRotation(Math.PI);
    expect(img.angle).toBeCloseTo(-180, 10);
  });

  it('tinta, espelho e profundidade', () => {
    const img = scene.add.image(0, 0, '__WHITE');
    expect(img.isTinted).toBe(false);
    img.setTint(0xff0000);
    expect(img.isTinted).toBe(true);
    img.clearTint();
    expect(img.isTinted).toBe(false);
    img.setFlip(true, false);
    expect([img.flipX, img.flipY]).toEqual([true, false]);
    img.toggleFlipY().resetFlip();
    expect([img.flipX, img.flipY]).toEqual([false, false]);
  });

  it('a lista de desenho ordena pela profundidade, e empate mantém a ordem de entrada', () => {
    const a = scene.add.image(0, 0, '__WHITE').setName('a').setDepth(5);
    const b = scene.add.image(0, 0, '__WHITE').setName('b').setDepth(1);
    const c = scene.add.image(0, 0, '__WHITE').setName('c').setDepth(5);
    scene.sys.depthSort();
    const order = scene.sys.displayList.getChildren().filter((o) => [a, b, c].includes(o as never)).map((o) => o.name);
    expect(order).toEqual(['b', 'a', 'c']);
  });

  it('destroy tira da cena e avisa', () => {
    const img = scene.add.image(0, 0, '__WHITE');
    const onDestroy = vi.fn();
    img.on('destroy', onDestroy);
    img.destroy();
    expect(onDestroy).toHaveBeenCalledOnce();
    expect(scene.sys.displayList.exists(img)).toBe(false);
  });

  it('o sprite entra na lista de atualização, a imagem não', () => {
    const sprite = scene.add.sprite(0, 0, '__WHITE');
    const update = vi.spyOn(sprite, 'preUpdate');
    booted.tick(2);
    expect(update).toHaveBeenCalledTimes(2);
    sprite.destroy();
  });
});

describe('contêiner', () => {
  it('leva os filhos: eles saem da cena e herdam a posição do pai', () => {
    const child = scene.add.image(10, 10, '__WHITE');
    const box = scene.add.container(100, 50, [child]);
    expect(scene.sys.displayList.exists(child)).toBe(false);
    expect(box.length).toBe(1);
    expect(box.exists(child)).toBe(true);
    const m = child.getWorldTransformMatrix();
    expect([m.tx, m.ty]).toEqual([110, 60]);
    box.setScale(2);
    const m2 = child.getWorldTransformMatrix();
    expect([m2.tx, m2.ty]).toEqual([120, 70]);
  });

  it('add, getAt, getIndex, remove e removeAll', () => {
    const box = scene.add.container(0, 0);
    const a = scene.add.image(0, 0, '__WHITE');
    const b = scene.add.image(0, 0, '__WHITE');
    box.add([a, b]);
    expect(box.getAt(1)).toBe(b);
    expect(box.getIndex(a)).toBe(0);
    box.remove(a);
    expect(box.getAll()).toEqual([b]);
    box.removeAll(true);
    expect(box.length).toBe(0);
  });

  it('destruir o contêiner destrói os filhos', () => {
    const child = scene.add.image(0, 0, '__WHITE');
    const box = scene.add.container(0, 0, child);
    const onDestroy = vi.fn();
    child.on('destroy', onDestroy);
    box.destroy();
    expect(onDestroy).toHaveBeenCalledOnce();
  });
});

describe('formas', () => {
  it('retângulo, círculo e elipse têm o tamanho pedido', () => {
    const rect = scene.add.rectangle(0, 0, 30, 10, 0xff0000);
    expect([rect.width, rect.height]).toEqual([30, 10]);
    expect(rect.isFilled).toBe(true);
    rect.setStrokeStyle(2, 0x00ff00);
    expect(rect.isStroked).toBe(true);
    const circle = scene.add.circle(0, 0, 8, 0xffffff);
    expect([circle.width, circle.height]).toEqual([16, 16]);
    circle.setRadius(4);
    expect(circle.width).toBe(8);
    const ellipse = scene.add.ellipse(0, 0, 20, 6, 0x0000ff);
    expect([ellipse.width, ellipse.height]).toEqual([20, 6]);
    rect.setSize(5, 5);
    expect(rect.width).toBe(5);
  });
});

describe('texto', () => {
  const style = { fontFamily: 'monospace', fontSize: '16px', color: '#ffffff' };

  it('mede o próprio texto e muda de tamanho quando o texto muda', () => {
    const text = scene.add.text(0, 0, 'oi', style);
    const small = text.width;
    expect(small).toBeGreaterThan(0);
    expect(text.height).toBeGreaterThan(0);
    text.setText('uma frase bem mais longa');
    expect(text.width).toBeGreaterThan(small);
    expect(text.text).toBe('uma frase bem mais longa');
  });

  it('quebra a linha na largura pedida', () => {
    const text = scene.add.text(0, 0, 'um dois tres quatro cinco seis sete oito', { ...style, wordWrap: { width: 60 } });
    const lines = text.getWrappedText();
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(line.length).toBeLessThan(20);
    text.setWordWrapWidth(null);
    expect(text.getWrappedText()).toHaveLength(1);
  });

  it('margem e espaçamento de linha aumentam a caixa', () => {
    const text = scene.add.text(0, 0, 'a\nb', style);
    const { width, height } = text;
    text.setPadding(4, 4, 4, 4);
    expect(text.width).toBe(width + 8);
    expect(text.height).toBe(height + 8);
    const padded = text.height;
    text.setLineSpacing(10);
    expect(text.height).toBe(padded + 10);
  });

  it('cada texto gasta 31 sorteios (o UUID da textura): a sequência do jogo depende disso', () => {
    const spy = vi.spyOn(Math, 'random');
    scene.add.text(0, 0, 'x', style);
    expect(spy).toHaveBeenCalledTimes(31);
    spy.mockRestore();
  });

  it('a textura do texto existe enquanto ele existe', () => {
    const before = scene.textures.getTextureKeys().length;
    const text = scene.add.text(0, 0, 'x', style);
    expect(scene.textures.getTextureKeys().length).toBe(before + 1);
    text.destroy();
    expect(scene.textures.getTextureKeys().length).toBe(before);
  });
});

describe('graphics', () => {
  it('pinta os comandos numa textura de verdade (generateTexture)', () => {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0xff0000, 1).fillRect(0, 0, 4, 4);
    g.fillStyle(0x0000ff, 1).fillRect(4, 0, 4, 4);
    g.generateTexture('rg-test', 8, 4);
    const canvas = scene.textures.get('rg-test').getSourceImage() as HTMLCanvasElement;
    expect(pixel(canvas, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(pixel(canvas, 6, 1)).toEqual([0, 0, 255, 255]);
  });

  it('linha, triângulo e contorno também saem no canvas; clear apaga os comandos', () => {
    const g = scene.make.graphics({ add: false });
    g.lineStyle(2, 0x00ff00, 1).lineBetween(0, 5, 10, 5);
    g.fillStyle(0xffffff, 1).fillTriangle(0, 10, 10, 10, 5, 19);
    g.lineStyle(1, 0xffff00, 1).strokeRect(12, 12, 6, 6);
    g.generateTexture('shapes-test', 20, 20);
    const canvas = scene.textures.get('shapes-test').getSourceImage() as HTMLCanvasElement;
    expect(pixel(canvas, 5, 5)[1]).toBeGreaterThan(200);
    expect(pixel(canvas, 5, 15)).toEqual([255, 255, 255, 255]);
    g.clear();
    g.generateTexture('empty-test', 4, 4);
    const empty = scene.textures.get('empty-test').getSourceImage() as HTMLCanvasElement;
    expect(pixel(empty, 1, 1)[3]).toBe(0);
  });
});

describe('texturas', () => {
  it('a folha de sprite vira quadros numerados do tamanho pedido', () => {
    const source = booted.host.createCanvas(32, 16);
    const texture = scene.textures.addSpriteSheet('sheet-test', source as unknown as HTMLImageElement, { frameWidth: 8, frameHeight: 8 });
    expect(texture).not.toBeNull();
    expect(texture!.getFrameNames()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const f5 = scene.textures.getFrame('sheet-test', 5);
    expect([f5.cutX, f5.cutY, f5.cutWidth, f5.cutHeight]).toEqual([8, 8, 8, 8]);
  });

  it('canvas como textura, exists, remove e base64', () => {
    const tex = scene.textures.createCanvas('canvas-test', 2, 2)!;
    const ctx = tex.getContext();
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(0, 0, 2, 2);
    tex.refresh();
    expect(scene.textures.exists('canvas-test')).toBe(true);
    expect(scene.textures.getBase64('canvas-test')).toMatch(/^data:image\/png;base64,/u);
    scene.textures.remove('canvas-test');
    expect(scene.textures.exists('canvas-test')).toBe(false);
    expect(scene.textures.getBase64('nao-existe')).toBe('');
  });

  it('uma chave repetida é recusada', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(scene.textures.createCanvas('__WHITE', 2, 2)).toBeNull();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('carregador', () => {
  class Loading extends Engine.Scene {
    public progress: number[] = [];
    public created = false;
    public constructor() { super('loading'); }
    public preload(): void {
      this.load.on('progress', (v: number) => this.progress.push(v));
      this.load.spritesheet('hero-test', '/assets/characters/player/hero.png', { frameWidth: 16, frameHeight: 16 });
      this.load.image('rock-test', '/assets/environment/props/rock.png');
      this.load.json('world-test', '/world.json');
    }
    public readyAtCreate: boolean[] = [];
    public create(): void {
      this.readyAtCreate = [this.textures.exists('hero-test'), this.textures.exists('rock-test'), this.cache.json.exists('world-test')];
      this.created = true;
    }
  }

  it('baixa imagem, folha e JSON de public/, avisa o progresso e só então cria a cena', async () => {
    const { game, until } = await bootEngine([Loading]);
    const loading = game.scene.getScene('loading') as Loading;
    await until(() => loading.created);
    expect(loading.readyAtCreate).toEqual([true, true, true]);
    expect(loading.progress.at(-1)).toBe(1);
    expect(game.textures.exists('hero-test')).toBe(true);
    expect(game.textures.get('hero-test').frameTotal).toBeGreaterThan(2);
    expect(game.textures.exists('rock-test')).toBe(true);
    const world = game.cache.json.get<{ meta: { worldChunksX: number } }>('world-test');
    expect(world.meta.worldChunksX).toBe(5);
  });

  it('um arquivo que não existe avisa o erro e a cena sobe mesmo assim', async () => {
    class Missing extends Engine.Scene {
      public created = false;
      public failed: string[] = [];
      public constructor() { super('missing'); }
      public preload(): void {
        this.load.on('loaderror', (file: { key: string }) => this.failed.push(file.key));
        this.load.image('ghost', '/assets/nao-existe.png');
      }
      public create(): void { this.created = true; }
    }
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { game, until } = await bootEngine([Missing]);
    const missing = game.scene.getScene('missing') as Missing;
    await until(() => missing.created);
    expect(missing.failed).toEqual(['ghost']);
    expect(game.textures.exists('ghost')).toBe(false);
    err.mockRestore();
  });
});
