// O FORNO E O FERRO DA THEA: o que o forno fixo pede (carvão, minério; areia, cinza) e o que devolve, a barra na
// bigorna, e a etapa do tripé. O telescópio é da AstronomerScope; as falas, da AstronomerQuest.

import { getSoundManager } from '@/game/audio/SoundManager';
import type { DialogScript } from '@/game/dialogs/NpcDialogs';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { tLines } from '@/game/i18n/i18n';
import type { SkyQuestSave } from '@/game/runtime/adventureState';
import type { AstronomerQuest } from './AstronomerQuest';

// O que a Thea lembra em cada degrau do ferro: buscar o minério, levar ao forno (ele pede o resto) e
// martelar a esponja. O forno não se constrói mais, então não há degrau de forno nem de carvão.
const IRON_STEPS: readonly HeldItemKind[] = ['ore', 'bloom', 'iron'];

/** O que AstronomerForge usa de AstronomerQuest. */
export type AstronomerForgeHost = Pick<AstronomerQuest,
  'host' | 'placeCamp' | 'save' | 'showHeaps' | 'showTripod' | 'tripodTile'
>;

export class AstronomerForge {
  public constructor(private readonly host: AstronomerForgeHost) {}

  private get oven(): NonNullable<SkyQuestSave['furnace']> {
    this.host.save.furnace ??= { charcoal: false, bloom: false, sand: false, glass: false };
    return this.host.save.furnace;
  }

  /**
   * O QUE O FORNO PEDE AGORA, ou `null` se ele não tem nada a fazer nesta etapa. A ordem é a da química e
   * a da quest: o carvão (fica aceso lá dentro), o minério (sai a esponja); depois a areia e a cinza (sai o
   * vidro). Ele nunca abre escolha: o jogador só entrega o que ele pede.
   */
  public furnaceNeed(): HeldItemKind | null {
    const oven = this.oven;
    if (this.host.save.stage === 'iron') {
      if (oven.bloom || this.host.host.seen('bloom')) return null;
      return oven.charcoal ? 'ore' : 'charcoal';
    }
    if (this.host.save.stage === 'glass') {
      if (oven.glass) return null;
      return oven.sand ? 'ash' : 'sand';
    }
    return null;
  }

  /** Há fogo esperando dentro do forno: o carvão antes do minério, a areia antes da cinza. */
  public furnaceKindled(): boolean {
    const oven = this.oven;
    if (this.host.save.stage === 'iron') return oven.charcoal && !oven.bloom;
    if (this.host.save.stage === 'glass') return oven.sand && !oven.glass;
    return false;
  }

  /**
   * O herói entregou `kind` (que é o que `furnaceNeed` pedia). Devolve se a receita FECHOU e o que sai pela
   * boca (`null` = a fornada não devolve peça: o carvão fica lá dentro esperando o minério).
   */
  public feedFurnace(kind: HeldItemKind): { done: boolean; product: HeldItemKind | null } {
    const oven = this.oven;
    let result: { done: boolean; product: HeldItemKind | null } = { done: false, product: null };
    if (kind === 'charcoal') {
      // O carvão acende e fica lá dentro, em brasa, esperando o minério.
      oven.charcoal = true;
      result = { done: true, product: null };
    } else if (kind === 'ore') {
      oven.bloom = true;
      result = { done: true, product: 'bloom' };
    } else if (kind === 'sand') {
      oven.sand = true;
    } else if (kind === 'ash') {
      oven.glass = true;
      result = { done: true, product: 'glass' };
    }
    this.host.host.persist();
    return result;
  }

  public ironStep(): HeldItemKind {
    return IRON_STEPS.find((item) => !this.host.host.seen(item)) ?? 'iron';
  }

  /** O ferro salta para ela, e o tripé nasce ao lado, com a cinza e a areia já esperando. */
  public deliverIron(base: DialogScript, at: { worldX: number; worldY: number }): void {
    const hero = this.host.host.hero();
    this.host.placeCamp();
    const tile = this.host.tripodTile ?? { x: at.worldX, y: at.worldY };
    this.host.host.removeFromHand('iron', 1);
    this.host.host.fling('iron', hero.x, hero.y, tile.x, tile.y);
    getSoundManager().ui.playItemStash();
    this.host.host.hop(at.worldX, at.worldY, 0.34);
    this.host.showTripod(true);
    this.host.showHeaps(true);
    this.host.save.stage = 'glass';
    this.host.host.persist();
    this.host.host.say({ ...base, lines: tLines('npc.astronautStep.tripod') }, at, () => this.host.host.markHeard());
  }

  /** A Thea está esperando a barra de ferro (é ela quem vem buscá-la na bigorna). */
  public wantsIronAtAnvil(): boolean {
    return this.host.save.stage === 'iron';
  }

  /**
   * A BARRA FOI BUSCADA NA BIGORNA (pedido do autor): a Thea veio correndo, pegou a barra e voltou dizendo que vai
   * construir o tripé — o que `deliverIron` fazia quando o herói levava a barra, sem a barra passar pela mão dele.
   */
  public ironFromAnvil(): void {
    this.host.placeCamp();
    this.host.showTripod(true);
    this.host.showHeaps(true);
    this.host.save.stage = 'glass';
    this.host.host.persist();
  }
}
