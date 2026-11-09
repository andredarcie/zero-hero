// AS ENCOMENDAS E A ENTREGA: o catálogo da caixa de ferramentas (o que já tem, o que falta), a caixa que abre e
// fecha a cada quadro, e a peça pronta que salta para um tile livre perto da estação.

import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { catalogSteps, isCraftable, nextStep, recipeCost, type CraftStation } from '@/game/objects/toolboxRecipes';
import type { OrderCatalogView } from '@/game/runtime/ToolboxOrderOverlay';
import { t } from '@/game/i18n/i18n';
import { spriteDataUrl } from '@/game/runtime/spriteDataUrl';
import type { GameScene } from '../GameScene';
import type { ToolboxOrderOverlay } from '@/game/runtime/ToolboxOrderOverlay';
import { ITEM_VISUAL_2D } from './sceneDefs';

export class CraftOrders {
  // O CATALOGO DA ENCOMENDA, e a bancada em que ele foi aberto. Ele congela o mundo como as
  // cartas de chunk (a bolsa e a unica tela deste jogo que roda com o mundo vivo).
  public orderOverlay?: ToolboxOrderOverlay;

  public constructor(private readonly host: GameScene) {}

  /**
   * ONDE A BANCADA LARGA O QUE ACABOU DE FAZER.
   *
   * Os oito vizinhos da mesa, ordenados pela distância até o HERÓI — **menos o tile em que ele
   * está, que fica por último**. Uma regra só, e ela cai onde a intuição cai: a peça pousa
   * FLANQUEANDO quem pediu (as diagonais da mesa que encostam nele), depois nos lados, e só então
   * atrás do móvel.
   *
   * A exclusão do tile do herói é a parte que se aprendeu olhando: a primeira versão preferia "o
   * lado de quem pediu", e como toda interação acontece de um tile colado na mesa, isso era
   * SEMPRE o tile do próprio herói — a peça pousava debaixo dele, escondida pelo corpo, e o voo
   * inteiro terminava atrás do jogador. Ele continua sendo destino válido, mas em último caso: o B
   * apanha o que está sob os pés, então nada se perde; o que se perde é o de ver onde caiu.
   *
   * Um tile serve quando o herói pode PISAR nele (nada de rio, lava ou corpo sólido) e não tem
   * item nenhum em cima: a lei de um item por tile é
   * absoluta, e empilhar é justamente o que faz uma peça sadia parecer quebrada (já aconteceu
   * duas vezes neste projeto).
   */
  public deliveryTileAround(propX: number, propY: number): [number, number] | null {
    if (!this.host.itemManager) return null;
    const { worldX: hx, worldY: hy } = this.host.playerWorld;
    const around: Array<[number, number]> = [];
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oy = -1; oy <= 1; oy += 1) {
        if (ox === 0 && oy === 0) continue;
        around.push([propX + ox, propY + oy]);
      }
    }
    const rank = ([x, y]: [number, number]): number => (
      x === hx && y === hy ? Number.MAX_SAFE_INTEGER : (x - hx) ** 2 + (y - hy) ** 2
    );
    around.sort((a, b) => rank(a) - rank(b));
    for (const [x, y] of around) {
      if (this.host.query.isSolidForEntities(x, y) || this.host.itemManager.hasItemAt(x, y)) continue;
      return [x, y];
    }
    return null;
  }

  /**
   * O VOO — um fantasma da peça saltando da bancada até o tile em que ela já caiu.
   *
   * É um billboard descartável, e não o item de verdade, porque o `ItemPickup` é dono da posição
   * dele (o `render` reescreve elevação todo frame, e o aro roxo mais as cópias de contorno viajam
   * junto): mexer nele por fora seria arranhar estado que o próprio dono reescreve no frame
   * seguinte — a armadilha do `apply()` que este projeto já documentou.
   *
   * A duração casa com o fade-in do item real (200ms): o fantasma pousa no instante em que a peça
   * de verdade termina de aparecer, então a leitura é UMA coisa voando, nunca duas.
   */
  public flingCraftedItem(
    kind: HeldItemKind, fromX: number, fromY: number, toX: number, toY: number,
  ): void {
    const w3 = this.host.world3d;
    const visual = ITEM_VISUAL_2D[kind];
    if (!w3 || !visual) return;
    const ghost = w3
      .objects.addBillboard(visual.texture, visual.frame, { emissive: true, depthLayer: 'ground' })
      .setPosition(fromX, fromY)
      .setDisplaySize(0.5, 0.5)
      .setElevation(0.32);
    // O ARCO é a elevação, nunca a escala: crescer uma arte de pixel para fingir altura é a coisa
    // que este jogo proíbe em todo lugar. Sobe num tween e cai no outro, que é o que dá o peso.
    this.host.tweens.add({
      targets: ghost, x: toX, y: toY, duration: 200, ease: 'Quad.easeOut',
      onComplete: () => ghost.destroy(),
    });
    this.host.tweens.add({
      targets: ghost, elevation: 0.62, duration: 100, ease: 'Quad.easeOut', yoyo: true,
    });
  }

  public closeToolboxOrder(): void {
    this.orderOverlay = undefined;
    this.host.actions.actionButtons?.setVisible(true);
  }

  /**
   * O CATÁLOGO — o que a bancada já fez, mais UMA coisa nova.
   *
   * Ele mostrava TUDO desde o primeiro segundo, e a intenção era boa: "a lista é a lista de
   * ambições, e esconder uma receita por falta de material é o erro do Terraria — quem não carrega
   * o material nunca descobre que a coisa existe". O efeito medido foi outro. Onze cartas de uma
   * vez não são ambição, são uma parede: o jogador que acabou de fazer o primeiro forno não
   * precisa ver todas as ferramentas futuras; precisa saber qual e o proximo passo.
   *
   * Então a mesa passou a mostrar o mínimo para continuar (`catalogSteps`): os degraus que ele já
   * cumpriu, e o primeiro que falta. A promessa de que nada fica escondido continua de pé — só que
   * agora ela é cumprida ao longo do tempo, um degrau de cada vez, em vez de tudo na primeira
   * abertura. E cada carta visível é LEGÍVEL: arte, nome e os dois insumos.
   *
   *   • `next`   — esta é a carta nova, o degrau que a escada está oferecendo agora.
   *   • `ready`  — os dois insumos estão na mochila agora.
   *   • `have`   — por insumo, e comparado com `need` (o `iron+iron` pede dois).
   */
  public orderCatalogView(
    station: CraftStation = 'bench', at?: { worldX: number; worldY: number },
  ): OrderCatalogView {
    const goal = nextStep(station, this.host.seenItems);
    const entries = catalogSteps(station, this.host.seenItems).map((recipe) => {
      const cost = recipeCost(recipe);
      const needs = [...cost.entries()].map(([kind, need]) => {
        const visual = ITEM_VISUAL_2D[kind];
        return {
          kind,
          icon: spriteDataUrl(this.host, visual.texture, visual.frame),
          label: t(`items.name.${kind}`),
          need,
          // Na máquina, o que está em volta dela e na mão; na página de planos, só a mão.
          have: at ? this.host.craft.stationCount(at.worldX, at.worldY, kind) : this.host.inventory.count(kind),
          // A bancada faz este insumo? E o que separa "procure no mundo" de "e aqui mesmo".
          craftable: isCraftable(kind),
        };
      });
      const visual = ITEM_VISUAL_2D[recipe.output];
      return {
        kind: recipe.output,
        icon: spriteDataUrl(this.host, visual.texture, visual.frame),
        label: t(`items.name.${recipe.output}`),
        family: recipe.family,
        // Tudo que a mesa mostra agora é legível — a silhueta cinza existia para uma lista de onze
        // cartas em que a maioria era desconhecida, e essa lista não existe mais.
        known: true,
        next: recipe.output === goal,
        ready: needs.every((n) => n.have >= n.need),
        needs,
      };
    });
    const forno = station === 'furnace';
    return {
      entries,
      title: t(forno ? 'toolbox.titleFurnace' : 'toolbox.title'),
      foot: t(forno ? 'toolbox.keysFurnace' : 'toolbox.keys'),
      footTouch: t(forno ? 'toolbox.keysTouchFurnace' : 'toolbox.keysTouch'),
    };
  }

  /** Atualiza somente a curta pose visual das bancadas manuais. */
  public updateToolboxes(delta: number): void {
    for (const box of this.host.props.toolboxes) box.update(delta);
  }
}
