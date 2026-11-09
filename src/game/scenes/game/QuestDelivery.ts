// A ENTREGA: o que o vizinho recebe na conversa, o cesto conferido, o presente que ele devolve, a festa de um pedido
// fechado, e o mago.

import { UNIT_PACK_KINDS } from '@/game/constants';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { tLines } from '@/game/i18n/i18n';
import { isMushroomKind } from '@/game/fungi/fungi';
import { getSoundManager } from '@/game/audio/SoundManager';
import { getDialog, getDialogVoice } from '@/game/world/WorldData';
import { adventureState } from '@/game/runtime/adventureState';
import { allQuestsDone, questDeliveriesDue, recordQuestEvent, type QuestEvent } from '@/game/runtime/QuestLog';
import { questFor } from '@/game/dialogs/NpcQuests';
import { DEATH_VISIT_KEY, DEATH_VISITS } from '@/game/systems/Resting';
import type { GameScene } from '../GameScene';
import { FORAGER_DIALOG } from './sceneDefs';

/** O que QuestDelivery usa de GameScene. */
export type QuestDeliveryHost = Pick<GameScene,
  'adventure' | 'camp' | 'carry' | 'dialog' | 'gardenUnlock' | 'gateOpened' | 'groundItems' | 'hand'
  | 'heldItem' | 'inventory' | 'marks' | 'orders' | 'playerWorld' | 'roasted' | 'save' | 'seenDialogKeys'
  | 'seenItems' | 'sparkle' | 'time' | 'torch' | 'valley'
>;

export class QuestDelivery {
  public constructor(private readonly host: QuestDeliveryHost) {}

  /**
   * O QUE O MAGO DIRIA AGORA. Ele nao tem missao: ele e quem aponta. Antes do portao ele lembra
   * que ha gente esperando; com o portao aberto ele manda o heroi para o centro do vale; depois
   * do fim ele so fica feliz.
   */
  public wizardLine(): 'tent' | 'again' | 'guide' | 'gate' | 'after' {
    if (this.host.roasted) return 'after';
    if (this.host.gateOpened) return 'gate';
    // Antes da primeira noite na barraca (a visita da Morte é dessa noite), ele lembra dela.
    if (this.host.adventure && !this.host.seenDialogKeys.has(DEATH_VISIT_KEY)) return 'tent';
    // Entre a primeira visita e a última, ele sabe que ela volta e manda dormir de novo: não consola.
    if (this.host.adventure && DEATH_VISITS.some((v) => !this.host.seenDialogKeys.has(v.key))) return 'again';
    return 'guide';
  }

  public openWizardDialog(npcWorld: { worldX: number; worldY: number }): void {
    if (this.host.dialog.dialogOpen) return;
    const base = getDialog('wizard');
    if (!base) return;
    const line = this.wizardLine();
    this.host.seenDialogKeys.add(`wizard:${line}`);
    this.host.save.persistAdventure();
    this.host.dialog.openDialogScript({ ...base, lines: tLines(`wizard.${line}`) }, npcWorld, getDialogVoice('wizard'));
  }

  /** O presente que este NPC ainda tem para dar (a ferramenta do pedido), se tiver. */
  public pendingGift(dialogId: string): Array<{ item: HeldItemKind; count: number }> | undefined {
    if (!this.host.adventure) return undefined;
    const quest = questFor(dialogId);
    if (!quest?.gift || adventureState().giftsGiven.has(dialogId)) return undefined;
    return quest.gift;
  }

  /**
   * POR O PRESENTE NA MAO: cada item entra na mochila, e o que o heroi nunca teve ganha a
   * cerimonia de item-get, um de cada vez (a fila e o callback do anterior).
   */
  public handGift(
    dialogId: string,
    gift: Array<{ item: HeldItemKind; count: number }>,
    from?: { worldX: number; worldY: number },
  ): void {
    adventureState().giftsGiven.add(dialogId);
    // UMA COISA NA MÃO: o primeiro presente vai para ela (o que estava nela pousa ao lado), e o
    // resto o NPC pousa no chão perto do herói, num arco que mostra de onde veio.
    const [first, ...rest] = gift;
    if (first) this.host.hand.takeIntoHand(first.item, first.count);
    const { worldX: hx, worldY: hy } = this.host.playerWorld;
    for (const { item, count } of rest) {
      const units = UNIT_PACK_KINDS.has(item) ? [count] : Array.from({ length: count }, () => 1);
      for (const n of units) {
        const at = this.host.groundItems.dropNear(item, n, hx, hy);
        if (at && from) this.host.orders.flingCraftedItem(item, from.worldX, from.worldY, at[0], at[1]);
      }
    }
    this.host.save.persistAdventure();
    const fresh = gift.map(({ item }) => item).filter((item) => !this.host.seenItems.has(item));
    const next = (): void => {
      const kind = fresh.shift();
      if (!kind) return;
      this.host.seenItems.add(kind);
      this.host.hand.showItemGet(kind, next);
    };
    if (fresh.length > 0) next();
    else getSoundManager().ui.playSwordPickup();
  }

  /**
   * UM PEDIDO FECHOU. O vale agradece com pouco — um sino, um brilho no heroi — e, se era o
   * ultimo, o portao do jardim se abre.
   */
  public celebrateQuestDone(_npcWorld: { worldX: number; worldY: number } | undefined): void {
    // O ACAMPAMENTO: a lembrança de quem pediu aparece no canto do herói (objects/HeroCamp).
    this.host.time.delayedCall(1500, () => this.host.valley.heroCamp?.refresh(true));
    this.host.marks.refreshQuestMarks();
    getSoundManager().ui.playSingingBowl();
    this.host.sparkle.spawnGrowSparkle(this.host.playerWorld.worldX, this.host.playerWorld.worldY);
    // O primeiro favor traz o gato: o vale decidiu que o cavaleiro fica.
    this.host.time.delayedCall(1200, () => this.host.camp.catCare.ensure(true));
    // O ÚLTIMO PEDIDO: quem o fechou acabou de dizer, na fala final, que o herói pode andar pelo jardim alto, e
    // entrega a chave (isLastQuest). O portão não abre sozinho: abre com ela.
    if (allQuestsDone() && !adventureState().gardenKeyGiven) this.host.time.delayedCall(500, () => this.host.gardenUnlock.giveGardenKey(_npcWorld));
  }

  /**
   * O FUNIL. Fora da aventura ele não existe: o contador mora no save, e um level ou uma corrida
   * do explorador escrevendo nele sujaria a aventura de quem só foi jogar um puzzle.
   */
  public questEvent(event: QuestEvent): void {
    if (!this.host.adventure) return;
    const { moved, closed } = recordQuestEvent(event);
    if (!moved) return;
    this.host.save.persistAdventure();
    // Uma tarefa sem entrega (o canteiro brotando) pode fechar o pedido no meio do mundo, longe
    // de quem pediu: o vale reage na hora, e o obrigado espera a próxima conversa.
    if (closed.length > 0) this.celebrateQuestDone(undefined);
  }

  /**
   * ENTREGAR É FALAR — e é TUDO OU NADA. Não há botão de dar: quem pediu cobra na conversa. Mas
   * ele só leva a carga INTEIRA de um pedido: com quatro dos seis minérios na mochila, o
   * astronauta não encosta em nenhum.
   *
   * Isto não é rigor, é a única leitura honesta num sistema SEM interface. Entrega parcial seria
   * confisco silencioso: o jogador veria a mochila esvaziar ao passar perto de quem pediu, sem
   * nada na tela dizendo que aquilo virou progresso — e sem nada dizendo quanto ainda falta. Com
   * tudo-ou-nada, o único momento em que a mochila muda é o mesmo momento em que o NPC passa a
   * falar outra coisa: a resposta chega junto com o preço.
   */
  public settleQuestDelivery(dialogId: string): { kind: HeldItemKind; closed: boolean } | null {
    if (!this.host.adventure) return null;
    const held = this.host.heldItem;
    if (held === 'none') return null;
    const due = questDeliveriesDue(dialogId).find((d) => d.item === held);
    // A Shui leva QUALQUER cogumelo, até o de uma espécie que ela já tem, e também depois de fechado o pedido: o
    // colhido não sai das costas (ver `handAt`), e sem ela ele ficaria preso nelas — com a faca do lado de lá.
    const forager = dialogId === FORAGER_DIALOG && isMushroomKind(held);
    if (!due && !forager) return null;
    const units = due ? Math.min(due.missing, this.host.inventory.count(held)) : 1;
    if (this.host.torch.heldOnFire) this.host.torch.extinguishTorch();
    this.host.inventory.remove(held, units);
    const closed = due || forager
      ? recordQuestEvent({ type: 'deliver', dialog: dialogId, item: held, units }).closed.length > 0
      : false;
    this.host.carry.updateBackItem();
    this.host.save.persistAdventure();
    return { kind: held, closed };
  }

  /** A cesta inteira para a Shui, antes ou depois de fechar o pedido: as opcionais também contam. */
  public settleBasket(dialogId: string): { kinds: HeldItemKind[]; closed: boolean } | null {
    if (!this.host.adventure || dialogId !== FORAGER_DIALOG) return null;
    const st = adventureState();
    if (st.basket.length === 0) return null;
    const kinds = [...st.basket];
    st.basket = [];
    let closed = false;
    for (const kind of kinds) {
      if (recordQuestEvent({ type: 'deliver', dialog: dialogId, item: kind, units: 1 }).closed.length > 0) closed = true;
    }
    this.host.save.persistAdventure();
    return { kinds, closed };
  }
}
