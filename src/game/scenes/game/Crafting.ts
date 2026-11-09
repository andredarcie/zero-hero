// A BANCADA: o menu de receitas da estação, o estoque que conta o que está no chão em volta dela, e o gasto.

import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { ToolboxObject } from '@/game/objects/ToolboxObject';
import { recipeCost, recipeMaking, recipeStation, type CraftStation } from '@/game/objects/toolboxRecipes';
import { ToolboxOrderOverlay } from '@/game/runtime/ToolboxOrderOverlay';
import { FurnaceObject } from '@/game/objects/FurnaceObject';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { GameScene } from '../GameScene';

/** O que Crafting usa de GameScene. */
export type CraftingHost = Pick<GameScene,
  'actions' | 'carry' | 'delivery' | 'forge' | 'groundItems' | 'inventory' | 'itemManager' | 'orders'
  | 'playerWorld' | 'query' | 'save' | 'seenItems' | 'steps' | 'time'
>;

export class Crafting {
  public constructor(private readonly host: CraftingHost) {}

  /**
   * O A na frente de uma MÁQUINA DE FABRICAR abre o catálogo dela. Devolve `true` quando havia uma
   * ali — é o contrato de `talkToNpcAt`, e é o que faz o gesto não escorrer para o golpe.
   *
   * Duas peças respondem: a bancada e o forno. Elas dividem a tela, o gesto e o código inteiro de
   * fabricação; o que as separa é uma palavra na receita (`station`).
   */
  public openCraftMenuAt(wx: number, wy: number): boolean {
    const box = this.host.query.getToolboxAt(wx, wy);
    const furnace = box ? undefined : this.host.query.getFurnaceAt(wx, wy);
    const prop = box ?? furnace;
    if (!prop) return false;
    // O FORNO NÃO TEM CATÁLOGO: ele é o guia da quest e só recebe o que pede (ver feedFurnaceAt).
    if (furnace) return this.host.forge.feedFurnaceAt(furnace);
    const station: CraftStation = box ? 'bench' : 'furnace';
    if (this.host.orders.orderOverlay) return true;
    this.host.actions.useBufferMs = 0;
    this.host.steps.stopBreathing();
    this.host.actions.actionButtons?.setVisible(false);
    // A tarja de teclas do jogo desaparece, como a bolsa já faz: com o catálogo aberto ela fica
    // MENTINDO ("Z usa o que você segura") por cima de uma tela onde Z prega um plano — e o
    // rodapé do próprio catálogo já diz o que os dois botões fazem ali dentro.
    this.host.actions.controlsHint?.destroy();
    this.host.actions.controlsHint = undefined;
    getSoundManager().ui.playToolboxOpen();
    this.host.orders.orderOverlay = new ToolboxOrderOverlay({
      read: () => this.host.orders.orderCatalogView(station, prop),
      onCraft: (kind) => this.craftAtStation(prop, station, kind as HeldItemKind),
      // A recusa SOA. Ela era só um tranco de 3px numa grade de onze cartas iguais, e um jogador
      // relatou exatamente o que isso vira na prática: "apertei Z e nada aconteceu". Todo o resto
      // do jogo já recusa com este som; a bancada estava calada.
      onRefuse: () => getSoundManager().ui.playToolboxRefuse(),
      onClose: () => this.host.orders.closeToolboxOrder(),
    }, isTouchDevice());
    return true;
  }

  /**
   * CONSTRUIR NA BANCADA — um gesto manual pelo catalogo.
   *
   * Ele é atômico de propósito: ou os insumos saem da mochila e o produto entra nela no MESMO
   * frame, ou nada acontece. A receita escolhida sempre usa os materiais da mochila.
   *
   * A conta é feita duas vezes de propósito — uma para decidir, outra para gastar. Entre as duas
   * não há nada que possa mexer na mochila, mas gastar sem reconferir é como se perde item numa
   * refatoração futura, e um item perdido em silêncio é o pior defeito que este jogo pode ter.
   */
  private craftAtStation(
    prop: ToolboxObject | FurnaceObject, station: CraftStation, kind: HeldItemKind,
  ): boolean {
    const recipe = recipeMaking(kind);
    // A ESTACAO E CONFERIDA ANTES DE GASTAR. O painel de cada maquina so lista as receitas dela,
    // entao isto nunca deveria falhar — e e exatamente por isso que fica aqui: no dia em que uma
    // carta aparecer no painel errado, a resposta e uma recusa, e nao a mesa fundindo minerio.
    if (!recipe || recipeStation(recipe) !== station) return false;
    const cost = recipeCost(recipe);
    for (const [ingredient, need] of cost) {
      if (this.stationCount(prop.worldX, prop.worldY, ingredient) < need) return false;
    }
    // O FORNO TRABALHA, e enquanto trabalha nao aceita outra fornada: ele tem uma boca so. A
    // recusa e o tranco da carta no catalogo, e ela e honesta — a maquina esta rugindo na tela.
    if (prop instanceof FurnaceObject && prop.isBusy) return false;
    // ONDE A PEÇA VAI PARAR SE DECIDE ANTES DE GASTAR QUALQUER COISA. Sem bancada cheia de itens
    // em volta isto nunca falha; com ela, a alternativa seria consumir o material e não ter onde
    // pousar o produto — e um item perdido em silêncio é o pior defeito que este jogo pode ter.
    //
    // O FORNO não pergunta isso: se a frente estiver ocupada quando a fornada terminar, ele
    // procura outro vizinho livre. Perguntar aqui recusaria uma fornada que a máquina sabe adiar.
    const landing = station === 'bench'
      ? this.host.orders.deliveryTileAround(prop.worldX, prop.worldY)
      : null;
    if (station === 'bench' && !landing) return false;
    for (const [ingredient, need] of cost) this.stationSpend(prop.worldX, prop.worldY, ingredient, need);
    // O insumo pode ter saído da mão: as costas do herói têm de acompanhar.
    this.host.carry.updateBackItem();
    const units = recipe.units ?? 1;
    if (prop instanceof FurnaceObject) {
      // A FORNADA É UM PROCESSO, e agora ela acontece na tela inteira: a carga voa da mão do herói
      // para a boca, o fole sopra três vezes sacudindo a alvenaria, a brasa esguicha e só então a
      // peça PULA pela frente da máquina (ver FurnaceObject.startHandSmelt). O item entra no mundo
      // no fim desse ciclo, entregue pelo `port.put` do forno.
      const charge: HeldItemKind[] = [];
      for (const [ingredient, need] of cost) {
        for (let i = 0; i < need; i += 1) charge.push(ingredient);
      }
      // Nenhum som sai daqui: a boca pegando fogo tem uma voz, disparada pelo `port.lit`.
      prop.startHandSmelt(kind, units, charge, [this.host.playerWorld.worldX, this.host.playerWorld.worldY]);
    } else {
      // A BANCADA é o oposto e continua sendo: uma martelada é um instante, não um processo. A PEÇA
      // NASCE NO CHÃO, e não na mochila — a mochila era a entrega mais curta possível e por isso
      // mesmo não se via nada: a mesa martelava para ninguém. O item entra no mundo AGORA (o arco é
      // só o desenho por cima), então nem morrer no meio do voo o apaga.
      const at = this.host.groundItems.dropItem(kind, landing![0], landing![1], undefined, units) ?? landing!;
      this.host.orders.flingCraftedItem(kind, prop.worldX, prop.worldY, at[0], at[1]);
      prop.playCraft();
      getSoundManager().work.playHammer();
      this.host.time.delayedCall(140, () => getSoundManager().ui.playToolboxDeliver());
    }
    this.host.delivery.questEvent({ type: 'craft', item: kind, units });
    // O item novo se apresenta uma vez, como qualquer outro que o jogador vê pela primeira vez —
    // e ele foi VISTO saindo da máquina, mesmo que ainda não tenha sido apanhado.
    this.host.seenItems.add(kind);
    this.host.save.persistAdventure();
    return true;
  }

  /**
   * O ESTOQUE DE UMA MÁQUINA. Com uma mão só, a bancada e o forno trabalham com o que está NO CHÃO
   * EM VOLTA deles (os oito vizinhos) mais o que está na mão: leva-se uma coisa de cada vez, pousa-se
   * ao lado da mesa, e a carta acende quando o par está ali. Nada fica escondido dentro da máquina.
   */
  private stockAround(x: number, y: number, kind: HeldItemKind): Array<[number, number]> {
    const tiles: Array<[number, number]> = [];
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        if ((ox !== 0 || oy !== 0) && this.host.itemManager?.kindAt(x + ox, y + oy) === kind) tiles.push([x + ox, y + oy]);
      }
    }
    return tiles;
  }

  public stationCount(x: number, y: number, kind: HeldItemKind): number {
    const ground = this.host.itemManager?.snapshot() ?? [];
    let n = this.host.inventory.count(kind);
    for (const [tx, ty] of this.stockAround(x, y, kind)) {
      n += ground.find((it) => it.worldX === tx && it.worldY === ty)?.units ?? 1;
    }
    return n;
  }

  /** Gasta do chão em volta primeiro (a mão fica com o que tem), e só então da mão. */
  private stationSpend(x: number, y: number, kind: HeldItemKind, need: number): void {
    let left = need;
    for (const [tx, ty] of this.stockAround(x, y, kind)) {
      if (left <= 0) break;
      const taken = this.host.itemManager?.takeAt(tx, ty);
      if (!taken) continue;
      const used = Math.min(left, taken.units);
      left -= used;
      // O pacote que sobra volta ao mesmo tile, com a conta que tinha menos o que foi usado.
      if (taken.units > used) this.host.itemManager?.drop(kind, tx, ty, taken.fire, taken.units - used);
    }
    if (left > 0) this.host.inventory.remove(kind, left);
  }
}
