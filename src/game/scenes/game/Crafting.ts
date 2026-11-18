// AS MÁQUINAS: o Z na BANCADA abre o modo de construção do acampamento (scenes/game/BuildMode), e o Z no FORNO da
// Thea o alimenta com o que a quest pede (ForgeWork.feedFurnaceAt). E a conta do que está em volta de uma máquina.

import type { HeldItemKind } from '@/game/entities/ItemPickup';
import type { GameScene } from '../GameScene';

/** O que Crafting usa de GameScene. */
export type CraftingHost = Pick<GameScene, 'camp' | 'forge' | 'inventory' | 'itemManager' | 'query'>;

export class Crafting {
  public constructor(private readonly host: CraftingHost) {}

  /**
   * O Z na frente de uma MÁQUINA. Devolve `true` quando havia uma ali — é o contrato de `talkToNpcAt`, e é o que faz o
   * gesto não escorrer para o golpe.
   *
   * A BANCADA é a do lar (pedido do autor, 2026-11-17): o catálogo de fabricar que ela abria saiu, e o Z abre o modo de
   * construção do acampamento, com o jogo parado e a grade no chão. O FORNO não tem catálogo: ele é o guia da quest e
   * só recebe o que pede.
   */
  public openCraftMenuAt(wx: number, wy: number): boolean {
    if (this.host.query.getToolboxAt(wx, wy)) {
      void this.host.camp.build.open();
      return true;
    }
    const furnace = this.host.query.getFurnaceAt(wx, wy);
    return furnace ? this.host.forge.feedFurnaceAt(furnace) : false;
  }

  /**
   * O ESTOQUE EM VOLTA DE UMA MÁQUINA: o que está NO CHÃO nos oito vizinhos dela, mais o que está na mão (a conta que o
   * catálogo de fabricar mostrava; CraftOrders a lê).
   */
  public stationCount(x: number, y: number, kind: HeldItemKind): number {
    const ground = this.host.itemManager?.snapshot() ?? [];
    let n = this.host.inventory.count(kind);
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        if (ox === 0 && oy === 0) continue;
        const it = ground.find((g) => g.worldX === x + ox && g.worldY === y + oy && g.kind === kind);
        if (it) n += it.units ?? 1;
      }
    }
    return n;
  }
}
