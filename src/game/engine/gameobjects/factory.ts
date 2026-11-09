/**
 * `this.add.*` e `this.make.*` (GameObjectFactory/GameObjectCreator): criam o objeto e o põem na
 * lista de desenho da cena (o `make` só põe se pedir).
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { Image, Sprite } from './Image';
import { Container } from './Container';
import { Text, type TextStyleConfig } from './Text';
import { Graphics } from './Graphics';
import { Arc, Ellipse, Rectangle } from './Shapes';
import { ParticleEmitter, type ParticleEmitterConfig } from './Particles';
import { Tilemap } from './Tilemap';
import type { GameObject } from './GameObject';
import type { Systems } from '../scene';
import type { Texture } from '../textures';

export class GameObjectFactory {
  public constructor(private readonly systems: Systems) {}

  private get scene() { return this.systems.scene; }

  public existing<T extends GameObject>(child: T): T {
    this.systems.displayList.add(child);
    const updatable = child as unknown as { preUpdate?: unknown };
    if (updatable.preUpdate) this.systems.updateList.add(child as never);
    return child;
  }

  public image(x: number, y: number, texture?: string | Texture, frame?: string | number): Image {
    return this.systems.displayList.add(new Image(this.scene, x, y, texture, frame)) as Image;
  }

  public sprite(x: number, y: number, texture?: string | Texture, frame?: string | number): Sprite {
    return this.systems.displayList.add(new Sprite(this.scene, x, y, texture, frame)) as Sprite;
  }

  public text(x: number, y: number, text: string | string[], style?: TextStyleConfig): Text {
    return this.systems.displayList.add(new Text(this.scene, x, y, text, style)) as Text;
  }

  public graphics(config?: ConstructorParameters<typeof Graphics>[1]): Graphics {
    return this.systems.displayList.add(new Graphics(this.scene, config)) as Graphics;
  }

  public container(x?: number, y?: number, children?: GameObject | GameObject[]): Container {
    return this.systems.displayList.add(new Container(this.scene, x, y, children)) as Container;
  }

  public rectangle(x?: number, y?: number, width?: number, height?: number, fillColor?: number, fillAlpha?: number): Rectangle {
    return this.systems.displayList.add(new Rectangle(this.scene, x, y, width, height, fillColor, fillAlpha)) as Rectangle;
  }

  public circle(x?: number, y?: number, radius?: number, fillColor?: number, fillAlpha?: number): Arc {
    return this.systems.displayList.add(new Arc(this.scene, x, y, radius, 0, 360, false, fillColor, fillAlpha)) as Arc;
  }

  public arc(x?: number, y?: number, radius?: number, startAngle?: number, endAngle?: number, anticlockwise?: boolean, fillColor?: number, fillAlpha?: number): Arc {
    return this.systems.displayList.add(new Arc(this.scene, x, y, radius, startAngle, endAngle, anticlockwise, fillColor, fillAlpha)) as Arc;
  }

  public ellipse(x?: number, y?: number, width?: number, height?: number, fillColor?: number, fillAlpha?: number): Ellipse {
    return this.systems.displayList.add(new Ellipse(this.scene, x, y, width, height, fillColor, fillAlpha)) as Ellipse;
  }

  public particles(x: number, y: number, texture?: string | Texture, config?: ParticleEmitterConfig): ParticleEmitter {
    return this.systems.displayList.add(new ParticleEmitter(this.scene, x, y, texture, config)) as ParticleEmitter;
  }
}

export class GameObjectCreator {
  public constructor(private readonly systems: Systems) {}

  public graphics(config: ConstructorParameters<typeof Graphics>[1] & { add?: boolean } = {}, addToScene?: boolean): Graphics {
    if (addToScene !== undefined) config.add = addToScene;
    const graphics = new Graphics(this.systems.scene, config);
    if (config.add) this.systems.displayList.add(graphics);
    return graphics;
  }

  public tilemap(config: { tileWidth?: number; tileHeight?: number; width?: number; height?: number }): Tilemap {
    return new Tilemap(this.systems.scene, config);
  }
}
