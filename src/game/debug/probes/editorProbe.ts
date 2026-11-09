// O EDITOR visto pelo playtest (`window.editorDebug`): montar a fixture de um cenário — limpar uma área, pintar um
// tile, pôr uma peça, mudar o spawn — pelos mesmos caminhos que o pincel do editor usa, e ler o que ficou.
// Como as sondas do jogo (ver index.ts), só no modo de desenvolvimento.

import type { CellLayerId, CellValue, PlacedEntity } from '@/game/editor/EditorStore';
import type { EditorScene } from '@/game/scenes/EditorScene';

export const buildEditorProbes = (s: EditorScene) => {
  const store = () => {
    if (!s.store) throw new Error('o editor ainda não montou o mapa');
    return s.store;
  };
  return {
    ready: (): boolean => Boolean(s.store),
    /** Limpa o retângulo [x0..x1]×[y0..y1]: tira as peças, a camada de cima e a colisão pintada. */
    clearArea: (x0: number, y0: number, x1: number, y1: number): void => {
      for (let x = x0; x <= x1; x += 1) {
        for (let y = y0; y <= y1; y += 1) {
          store().entities.eraseEntitiesAt(x, y);
          store().setCell('upper', x, y, null);
          store().setCell('collision', x, y, false);
        }
      }
    },
    setCell: (layer: CellLayerId, x: number, y: number, value: CellValue): boolean => store().setCell(layer, x, y, value),
    place: (entity: PlacedEntity): void => store().entities.placeEntity(entity),
    setSpawn: (x: number, y: number): void => store().meta.setSpawn(x, y),
    /** Quantas peças de `type` o mapa tem (no retângulo [x0..x1]×[y0..y1], se pedido). */
    count: (type: string, area?: { x0: number; y0: number; x1: number; y1: number }): number => store().entities.allEntities()
      .filter((e) => e.type === type && (!area || (e.worldX >= area.x0 && e.worldX <= area.x1 && e.worldY >= area.y0 && e.worldY <= area.y1)))
      .length,
    /** Quantos quadros a folha `key` tem no motor 2D (uma folha mal fatiada vira um quadro só). */
    sheetFrames: (key: string): number => (s.textures.exists(key) ? s.textures.get(key).getFrameNames().length : 0),
  };
};

export type EditorProbes = ReturnType<typeof buildEditorProbes>;
