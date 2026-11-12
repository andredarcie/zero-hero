// O QUE OS BOTÕES FARIAM: o verbo do B e do A para o tile à frente (o balão de ação), e onde o herói está e para onde
// olha.

import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { hammerResult } from '@/game/objects/hammering';
import type { PropDir } from '@/game/world/worldSchema';
import { t } from '@/game/i18n/i18n';
import { isMushroomKind } from '@/game/fungi/fungi';
import type { ActionPromptView, PromptRow } from '@/game/runtime/ActionPrompt';
import type { GameScene } from '../GameScene';
import type { ActionPrompt } from '@/game/runtime/ActionPrompt';
import { ITEM_VISUAL_2D } from './sceneDefs';

/** O que ActionVerbs usa de GameScene. */
export type ActionVerbsHost = Pick<GameScene,
  'actions' | 'bumps' | 'camp' | 'garden' | 'hand' | 'heldItem' | 'inventory' | 'itemManager' | 'machines'
  | 'movementController' | 'npcManager' | 'playerWorld' | 'query' | 'questSetup' | 'arc' | 'swing'
  | 'swordPlanting' | 'torch' | 'valley'
>;

/** Os verbos que aceitam QUALQUER coisa (o altar vazio recebe o que vier): uma ferramenta guardada não os responde. */
const ANY_ITEM_VERBS: ReadonlySet<string> = new Set(['put']);

export class ActionVerbs {
  public actionPrompt?: ActionPrompt;

  public constructor(private readonly host: ActionVerbsHost) {}

  /**
   * ONDE O HEROI ESTA DESENHADO, em tiles fracionarios — que durante um passo NAO e o tile logico.
   * A posicao logica pula para o tile de destino no instante em que o passo comeca, mas o corpo
   * na tela ainda esta atras, deslizando. Todo efeito preso ao HEROI tem de sair daqui.
   */
  public heroVisualTile(): { x: number; y: number } {
    return this.host.movementController?.visualWorld(this.host.playerWorld.worldX, this.host.playerWorld.worldY)
      ?? { x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY };
  }

  /**
   * O tile a frente: para onde ele OLHA, nao para onde ele anda. E a mesma direcao que o sprite
   * esta mostrando (PlayerMovementController.facing), entao o alvo do gesto nunca pode divergir
   * do corpo que o jogador ve.
   */
  public facingTile(): { x: number; y: number } {
    const f = this.host.movementController?.facing ?? { dx: 0, dy: 1 };
    return { x: this.host.playerWorld.worldX + f.dx, y: this.host.playerWorld.worldY + f.dy };
  }

  /**
   * Para onde o heroi olha, no indice N/L/S/O usado pela bancada e pelo forno. Faz a direção
   * nascer do corpo do jogador em vez de um menu: ele se vira e poe.
   */
  public facingDirIndex(): PropDir {
    const f = this.host.movementController?.facing ?? { dx: 0, dy: 1 };
    if (f.dy < 0) return 0;
    if (f.dx > 0) return 1;
    if (f.dy > 0) return 2;
    return 3;
  }

  /**
   * O BALÃO DESTA HORA: o que o Z e o X fazem agora, em palavras. A ordem é a dos botões (`pressAttack` e
   * `pressUse`), para ele nunca prometer um gesto que outro passaria na frente. Só aparece com o corpo já
   * parado no tile. Pousar no chão livre e o carinho no gato ficam de fora: valem quase sempre, e o balão
   * viraria parte da paisagem.
   */
  public currentPrompt(at: { readonly x: number; readonly y: number }): { view: ActionPromptView; at: { x: number; y: number } } | null {
    const hero = { x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY };
    if (at.x !== hero.x || at.y !== hero.y || this.host.bumps.heroThought?.visibleIcon) return null;
    if (!this.host.actions.canAct()) return null;
    // Dormindo não há "Levantar": o sono acaba sozinho, de manhã (Resting.canGetUp).
    if (this.host.camp.rest.isResting) return this.host.camp.rest.canGetUp ? { view: { rows: [{ label: t('actions.getUp'), key: 'hand' }] }, at: hero } : null;
    const front = this.facingTile();
    const reach = this.host.actions.reachesFront(front);
    const under = this.host.hand.handOfferUnderfoot();
    const rows: PromptRow[] = [];
    let icons: Pick<ActionPromptView, 'ground' | 'held'> = {};
    const offerItem = (kind: HeldItemKind): void => {
      const held = this.host.heldItem;
      // Só material sobre material troca: ferramenta vai para as guardadas (ver Inventory.fits).
      const swaps = held !== 'none' && !this.host.inventory.fits(kind);
      rows.push({ label: t(swaps ? 'actions.swap' : 'actions.take'), key: 'hand' });
      icons = { ground: ITEM_VISUAL_2D[kind], held: swaps ? ITEM_VISUAL_2D[held] : undefined };
    };
    if (under) {
      offerItem(under);
    } else if (reach) {
      const verb = this.handVerbAt(front.x, front.y) ?? this.toolFor(front.x, front.y, 'hand')?.verb ?? null;
      // "Colocar minério de ferro": no forno o verbo leva o nome do que entra (pedido do autor)
      if (verb === 'feed') rows.push({ label: `${t('actions.feed')} ${t(`items.name.${this.host.heldItem}`).toLowerCase()}`, key: 'hand' });
      else if (verb) rows.push({ label: t(`actions.${verb}`), key: 'hand' });
      else {
        const there = this.host.itemManager?.kindAt(front.x, front.y);
        const held = this.host.heldItem;
        // O cogumelo colhido não sai das costas: só o que cabe sem largá-lo (uma ferramenta) se pega.
        if (there && !isMushroomKind(there) && there !== held && !(isMushroomKind(held) && !this.host.inventory.fits(there))) offerItem(there);
      }
    }
    const ahead = reach ? this.useVerbAt(front.x, front.y) ?? this.toolFor(front.x, front.y, 'use')?.verb ?? null : null;
    // De pé numa cova rachada, o X cava ali mesmo quando a frente não pede nada (ItemUseGround.digUnderfoot).
    const digHere = !ahead && this.canDigUnderfoot(hero);
    const use = ahead ?? (digHere ? 'dig' : null);
    if (use) rows.push({ label: t(`actions.${use}`), key: 'use' });
    if (rows.length === 0) return null;
    return { view: { rows, ...icons }, at: under || digHere || front.y > hero.y ? hero : front };
  }

  /** A pá cavaria debaixo dos pés dele? A cova rachada, e a pá nas costas ou guardada (e livre para vir). */
  private canDigUnderfoot(hero: { x: number; y: number }): boolean {
    if (!this.host.garden.canDigAt(hero.x, hero.y, true)) return false;
    const held = this.host.heldItem;
    return held === 'shovel' || (this.host.inventory.owns('shovel') && !this.host.torch.heldOnFire && !isMushroomKind(held));
  }

  /**
   * A FERRAMENTA GUARDADA QUE ESTE TILE PEDE, e o verbo dela — quando o que está nas costas não faz nada ali. É a
   * mesma pergunta do balão e do botão (`handVerbAt`/`useVerbAt`), feita como se cada guardada estivesse nas
   * costas (Inventory.peek): o balão nunca promete o que a tecla recusaria. Duas costas ficam de fora: a TOCHA
   * ACESA (trocar de item apaga o fogo, e quem carrega fogo está a caminho de outro lugar) e o COGUMELO COLHIDO
   * (ele não sai das costas).
   */
  public toolFor(x: number, y: number, button: 'hand' | 'use'): { tool: HeldItemKind; verb: string } | null {
    const verbAt = (): string | null => (button === 'hand' ? this.handVerbAt(x, y) : this.useVerbAt(x, y));
    const held = this.host.heldItem;
    if (this.host.torch.heldOnFire || isMushroomKind(held) || verbAt()) return null;
    for (const tool of this.host.inventory.keptTools()) {
      const verb = this.host.inventory.peek(tool, verbAt);
      if (verb && !ANY_ITEM_VERBS.has(verb)) return { tool, verb };
    }
    return null;
  }

  /** O que o Z faz no tile da frente, na ordem de `pressAttack`. Pegar e trocar são à parte: levam desenhos. */
  public handVerbAt(x: number, y: number): string | null {
    if (this.host.npcManager?.hasNpcAt(x, y)) return 'talk';
    const quest = this.host.questSetup.painterQuest?.actionAt(x, y) ?? this.host.questSetup.lumberQuest?.actionAt(x, y) ?? this.host.questSetup.astronomerQuest?.actionAt(x, y);
    if (quest) return quest;
    const there = this.host.itemManager?.kindAt(x, y);
    if (isMushroomKind(there)) return this.host.heldItem === 'knife' ? 'harvest' : null;
    if (this.host.camp.catCare.isBarrelAt(x, y)) return this.host.camp.catCare.barrelVerb();
    const camp = this.host.valley.heroCamp?.at(x, y);
    if (camp) return camp === 'log' ? 'sit' : camp === 'bed' ? 'sleep' : camp === 'notebook' ? 'read' : 'look';
    const find = this.host.valley.valleyFinds?.at(x, y);
    if (find) {
      if (find.view) return 'sit';
      if (find.owner) return 'knock';
      return find.kind === 'bottle' || find.kind === 'sign' || find.kind === 'smithy' ? 'read' : 'look';
    }
    if (this.host.swordPlanting.plantedSwordTile?.x === x && this.host.swordPlanting.plantedSwordTile.y === y) return 'touch';
    const hearth = this.host.query.getHearthAt(x, y);
    if (hearth && !this.host.arc.has('ending')) {
      if (!hearth.isLit) return 'light';
      return this.host.heldItem === 'wood' ? 'roast' : null;
    }
    if (this.host.query.getRestFireAt(x, y)?.isLit) return 'sit';
    if (this.host.query.getToolboxAt(x, y)) return 'craft';
    if (this.host.query.getFurnaceAt(x, y)) {
      const need = this.host.questSetup.astronomerQuest?.furnaceNeed();
      return need && this.host.heldItem === need ? 'feed' : null;
    }
    const altar = this.host.query.getAltarAt(x, y);
    if (altar) {
      if (altar.carrying === null) return this.host.heldItem !== 'none' ? 'put' : null;
      return hammerResult(altar.carrying) !== undefined ? 'hammer' : 'takeBack';
    }
    return null;
  }

  /** O que o X faz no tile da frente, na ordem de `pressUse` e da tabela de `useItemAt`. */
  public useVerbAt(x: number, y: number): string | null {
    const fire = this.host.query.getRestFireAt(x, y);
    // Na fogueira de vizinho não se dorme: só no acampamento.
    if (fire && !this.host.torch.heldActsOnFire(fire)) return null;
    const held = this.host.heldItem;
    if (held === 'none') {
      const altar = this.host.query.getAltarAt(x, y);
      if (altar) return altar.carrying ? (hammerResult(altar.carrying) !== undefined ? 'hammer' : 'takeBack') : null;
      // o forno da Thea é fixo: não se recolhe
      return null;
    }
    const spot = this.host.query.getPlantSpotAt(x, y);
    if (held === 'dyeSeeds' && spot?.isHole) return 'sow';
    if (isMushroomKind(this.host.itemManager?.kindAt(x, y))) return null;
    const onAltar = this.host.query.getAltarAt(x, y)?.carrying;
    if (onAltar && hammerResult(onAltar) !== undefined) return 'hammer';
    if (this.host.machines.canBuildMachineAt(held, x, y)) return 'install';
    const lit = this.host.torch.isFlammableHeld && this.host.torch.heldOnFire;
    const campfire = this.host.query.getCampfireAt(x, y);
    if (campfire) {
      if (!campfire.isLit) return lit ? 'light' : null;
      if (held === 'bucketFull') return 'douse';
      if (this.host.torch.isFlammableHeld) return this.host.torch.heldOnFire ? 'refuel' : 'light';
      return null;
    }
    const lava = this.host.query.getLavaAt(x, y);
    if (lava && !lava.solidified) {
      if (lava.cooling) return null;
      if (held === 'stone') return 'cover';
      if (this.host.torch.isFlammableHeld) return this.host.torch.heldOnFire ? 'refuel' : 'light';
      return null;
    }
    const water = this.host.query.getWaterAt(x, y);
    if (water?.blocking) {
      if (held === 'bucket') return 'fill';
      if (!water.canBuild) return null;
      if (held === 'stone') return 'ford';
      return held === 'wood' ? 'bridge' : null;
    }
    if (held === 'bucket' && this.host.query.isOpenWaterAt(x, y)) return 'fill';
    const bush = this.host.query.getDryBushAt(x, y);
    if (bush?.blocking) return lit ? 'burn' : this.host.swing.holdsAnAxe && !bush.isBurning ? 'chop' : null;
    if (this.host.query.getDryTreeAt(x, y)?.blocking || this.host.query.getDryShrubAt(x, y)?.blocking) return this.host.swing.holdsAnAxe ? 'chop' : null;
    if (this.host.query.getRockAt(x, y)?.blocking) return held === 'pickaxe' ? 'break' : null;
    if (spot?.blocking) return spot.isMound && held === 'bucketFull' ? 'water' : null;
    const grass = this.host.query.getTallGrassAt(x, y);
    if (grass?.blocking && grass.isTall) {
      if (held === 'scythe') return 'mow';
      return lit ? 'burn' : null;
    }
    if (this.host.query.getLockedDoorAt(x, y)?.blocking) return held === 'key' ? 'unlock' : null;
    return held === 'shovel' && this.host.garden.canDigAt(x, y) ? 'dig' : null;
  }
}
