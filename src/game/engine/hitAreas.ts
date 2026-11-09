// A ÁREA DE TOQUE de um objeto interativo: o retângulo dado, ou o da textura quando não se dá nenhum, e a fila de
// entrada no InputPlugin. Licenças em LICENSES.md.

import type { GameObject } from './gameobjects/GameObject';
import type { InputPlugin } from './input';

/** O RectangleContains: bordas inclusas, retângulo vazio nunca contém. */
const RectangleContains = (rect: { x: number; y: number; width: number; height: number }, x: number, y: number): boolean => {
  if (rect.width <= 0 || rect.height <= 0) return false;
  return rect.x <= x && rect.x + rect.width >= x && rect.y <= y && rect.y + rect.height >= y;
};

export class HitAreas {
  public constructor(private readonly host: InputPlugin) {}

  public setHitArea(gameObjects: GameObject | GameObject[], hitArea?: unknown): InputPlugin {
    const list = Array.isArray(gameObjects) ? gameObjects : [gameObjects];
    if (hitArea === undefined) return this.setHitAreaFromTexture(list);
    let cursor: string | false = false;
    let useHandCursor = false;
    if (hitArea && typeof hitArea === 'object' && Object.keys(hitArea).length) {
      const config = hitArea as { cursor?: string; useHandCursor?: boolean };
      cursor = config.cursor ?? false;
      useHandCursor = config.useHandCursor ?? false;
      this.setHitAreaFromTexture(list);
    }
    for (const gameObject of list) {
      if (!gameObject.input) continue;
      const io = gameObject.input;
      io.customHitArea = false;
      io.dropZone = false;
      io.cursor = useHandCursor ? 'pointer' : cursor;
      this.queueForInsertion(gameObject);
    }
    return this.host;
  }

  public setHitAreaFromTexture(gameObjects: GameObject[]): InputPlugin {
    for (const gameObject of gameObjects) {
      const frame = (gameObject as GameObject & { frame?: { realWidth: number; realHeight: number } }).frame;
      let width = 0;
      let height = 0;
      if (gameObject.width) {
        width = gameObject.width;
        height = gameObject.height;
      } else if (frame) {
        width = frame.realWidth;
        height = frame.realHeight;
      }
      if (gameObject.type === 'Container' && (width === 0 || height === 0)) {
        console.warn('Container.setInteractive must specify a Shape or call setSize() first');
        continue;
      }
      if (width !== 0 && height !== 0) {
        gameObject.input = {
          gameObject,
          enabled: true,
          draggable: false,
          dropZone: false,
          cursor: false,
          hitArea: { x: 0, y: 0, width, height },
          hitAreaCallback: RectangleContains,
          customHitArea: false,
          localX: 0,
          localY: 0,
          dragState: 0,
        };
        this.queueForInsertion(gameObject);
      }
    }
    return this.host;
  }

  private queueForInsertion(child: GameObject): InputPlugin {
    if (this.host._pendingInsertion.indexOf(child) === -1 && this.host._list.indexOf(child) === -1) this.host._pendingInsertion.push(child);
    return this.host;
  }
}
