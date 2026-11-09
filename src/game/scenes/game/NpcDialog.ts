// A CONVERSA: falar com quem está à frente, que fala ele diz (a da quest, a já ouvida, a opcional), a janela do
// diálogo, e o aceno de quem passa perto.

import type { DialogScript, DialogVoice } from '@/game/dialogs/NpcDialogs';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { t, tLines, type I18nLine } from '@/game/i18n/i18n';
import { isMushroomKind } from '@/game/fungi/fungi';
import { DialogOverlay } from '@/game/runtime/DialogOverlay';
import { getSoundManager } from '@/game/audio/SoundManager';
import { getDialog, getDialogVoice } from '@/game/world/WorldData';
import { adventureState } from '@/game/runtime/adventureState';
import { allQuestsDone, isQuestComplete, isQuestDone, questDialogFor } from '@/game/runtime/QuestLog';
import { questFor } from '@/game/dialogs/NpcQuests';
import type { GameScene } from '../GameScene';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { FORAGER_DIALOG, LUMBER_DIALOG, PAINTER_DIALOG, SKY_DIALOG } from './sceneDefs';

export class NpcDialog {
  public dialogOpen = false;
  public dialogOverlay?: DialogOverlay;
  public dialogNpcWorld?: { worldX: number; worldY: number };
  /** Quem está falando numa cena, quando ele não é o NPC de sempre (o Marco sentado à fogueira). */
  public dialogSpeaker?: Billboard3D;
  // Quem ja deu o "oi" (o pulinho quando o heroi chega perto) nesta sessao.
  public readonly greetedNpcs = new Set<string>();

  public constructor(private readonly host: GameScene) {}

  /** O "OI": o NPC da um pulinho na primeira vez que o heroi chega a dois passos dele. */
  public greetNearbyNpcs(): void {
    const npcs = this.host.npcManager?.getActiveWorldPositions() ?? [];
    for (const n of npcs) {
      const key = `${n.worldX},${n.worldY}`;
      if (this.greetedNpcs.has(key)) continue;
      if (Math.hypot(n.worldX - this.host.playerWorld.worldX, n.worldY - this.host.playerWorld.worldY) > 2.3) continue;
      this.greetedNpcs.add(key);
      this.host.npcManager?.hop(n.worldX, n.worldY, 0.16);
    }
  }

  /**
   * FALAR COM QUEM ESTA A FRENTE. Devolve `false` quando nao ha ninguem ali.
   *
   * O dialogo era do ESBARRAO, e por isso era a unica coisa do jogo que acontecia sem ninguem ter
   * pedido: bastava a seta encostar no NPC — atravessando um vao, fugindo de uma caveira, tentando
   * contornar o velho pra chegar na fogueira — e a tela parava, a camera panorava e uma conversa
   * comecava. Um gesto que interrompe o jogo inteiro nao pode ser um acidente de trajeto.
   *
   * Agora ele e o B, como usar qualquer outra coisa do mundo, e isso nao acrescenta nada pro
   * jogador aprender: a parede ja VIRA o heroi (e um NPC bloqueia como qualquer parede), entao
   * encarar quem se quer ouvir e o mesmo gesto de mira que a arvore e a rocha ja cobravam. A
   * afordancia tambem ja estava pronta e nao custou um pixel novo — o "!" que flutua sobre quem tem
   * assunto novo deixou de descrever um acidente e passou a apontar pra um botao.
   */
  public talkToNpcAt(wx: number, wy: number): boolean {
    if (!this.host.npcManager?.hasNpcAt(wx, wy)) return false;
    const kind = this.host.npcManager.getKindAt(wx, wy);
    if (!kind) return false;
    // The wizard runs the story dialogue (progress-driven); every other NPC uses its base line.
    if (kind === 'wizard') this.host.delivery.openWizardDialog({ worldX: wx, worldY: wy });
    else this.openNpcDialog(kind, { worldX: wx, worldY: wy }, this.host.npcManager.getDialogIdAt(wx, wy));
    return true;
  }

  public openNpcDialog(
    kind: import('@/game/world/ScreenContent').NpcKind,
    npcWorld?: { worldX: number; worldY: number },
    scriptId?: string,
  ): void {
    if (this.dialogOpen) return;
    const askId = scriptId ?? kind;
    const base = getDialog(kind, askId);
    if (!base) return;
    if (askId === PAINTER_DIALOG && this.host.adventure && npcWorld && this.host.questSetup.painterQuest?.talk(base, npcWorld)) return;
    if (askId === LUMBER_DIALOG && this.host.adventure && npcWorld && this.host.questSetup.lumberQuest?.talk(base, npcWorld)) return;
    if (askId === SKY_DIALOG && this.host.adventure && npcWorld && this.host.questSetup.astronomerQuest?.talk(base, npcWorld)) return;
    // A ENTREGA VEM ANTES DA FALA. Cumprida a missão, `spokenDialogId` devolve o outro roteiro —
    // já nesta mesma conversa, que é o ponto: entregar e ouvir o obrigado é um gesto só.
    // ENTREGAR É FALAR: o que está na mão vai para quem pediu (uma coisa de cada vez).
    const delivery = this.host.delivery.settleQuestDelivery(askId);
    const basket = this.host.delivery.settleBasket(askId);
    const closedNow = delivery?.closed === true || basket?.closed === true;
    const speakId = this.spokenDialogId(askId);
    // Roteiro alternativo sem entrada no world.json cai no de sempre: uma missão sem fala nova
    // não pode emudecer o NPC.
    let script = speakId === askId ? base : (getDialog(kind, speakId) ?? base);
    // Com o fogo aceso, as mãos do Marco pararam de tremer, e a voz também.
    if (askId === LUMBER_DIALOG && speakId !== askId) script = { ...script, calm: true };
    // O PRESENTE: a primeira conversa com quem pede põe na mão do herói a ferramenta do pedido
    // (ver NpcQuest.gift). Ele chega DEPOIS da fala, quando a caixa fecha — primeiro o pedido,
    // depois o machado, que é a ordem em que alguém pede um favor de verdade.
    const gift = this.host.delivery.pendingGift(askId);
    // O PRÓXIMO PASSO de um pedido longo (NpcQuest.hints): na primeira conversa ele vem depois do
    // pedido; nas seguintes ele É a conversa — repetir o pedido inteiro não ensina nada novo.
    const hint = this.questHint(askId);
    const hintLines = hint ? tLines(`npc.${askId}Hint.${hint}`) : [];
    if (hintLines.length > 0) script = { ...script, lines: gift ? [...script.lines, ...hintLines] : hintLines };
    const optional = askId === FORAGER_DIALOG ? this.foragerOptionalLines(closedNow) : [];
    if (optional.length > 0) script = { ...script, lines: optional };
    // O COGUMELO DEVOLVIDO (pedido do autor): para cada um, ela diz o NOME ("Ah, uma bufa-de-lobo!") e
    // depois uma curiosidade daquela espécie; o obrigado fecha. Tudo antes do resto da conversa.
    const named = (kinds: readonly HeldItemKind[]): I18nLine[] => [
      ...kinds.flatMap((k): I18nLine[] => [
        { speaker: 'npc', text: t(`fungi.species.${k}.named`) },
        { speaker: 'npc', text: t(`fungi.species.${k}.curiosity`) },
      ]),
      { speaker: 'npc', text: t('fungi.thanks') },
    ];
    if (delivery && isMushroomKind(delivery.kind)) script = { ...script, lines: [...named([delivery.kind]), ...script.lines] };
    if (basket) script = { ...script, lines: [...named(basket.kinds), ...script.lines] };
    // O ÚLTIMO PEDIDO DO VALE fechou nesta conversa (pedido do autor): a fala termina com a chave do jardim alto,
    // e ela chega depois que a caixa fecha (celebrateQuestDone → giveGardenKey).
    if (closedNow && allQuestsDone() && !adventureState().gardenKeyGiven) script = { ...script, lines: [...script.lines, ...tLines('garden.key')] };
    if (askId === FORAGER_DIALOG && npcWorld) script = this.host.forage.withPorciniGlance(script, npcWorld);
    if (npcWorld) {
      const key = this.dialogKeyFor(kind, npcWorld.worldX, npcWorld.worldY, scriptId);
      if (key) {
        this.host.seenDialogKeys.add(key);
        this.host.save.persistAdventure(); // o "!" apagado fica apagado
      }
    }
    const open = (): void => this.openDialogScript(script, npcWorld, getDialogVoice(kind, speakId) ?? getDialogVoice(kind, askId), () => {
      if (gift) {
        if (npcWorld) this.host.npcManager?.hop(npcWorld.worldX, npcWorld.worldY);
        this.host.delivery.handGift(askId, gift, npcWorld);
      }
      // A FACA VOLTA à mão vazia de quem foi falar com a Shui (ela a guardou no corte).
      if (askId === FORAGER_DIALOG && !gift && this.host.heldItem === 'none' && this.host.forage.knifeWithShui()) {
        this.host.forage.returnKnife(npcWorld);
      }
      // O pedido fechou nesta conversa: um pulinho de alegria, coracoes, e o vale responde.
      if (closedNow) {
        if (npcWorld) {
          this.host.npcManager?.hop(npcWorld.worldX, npcWorld.worldY, 0.3);
          this.host.sparkle.spawnHearts(npcWorld.worldX, npcWorld.worldY);
        }
        this.host.delivery.celebrateQuestDone(npcWorld);
      }
    });
    if (basket && npcWorld) {
      // A cesta vira de uma vez: um cogumelo atrás do outro, e só então a conversa.
      this.host.cutsceneActive = true;
      this.host.steps.stopBreathing();
      basket.kinds.forEach((flying, i) => this.host.time.delayedCall(i * 130, () => {
        this.host.orders.flingCraftedItem(flying, this.host.playerWorld.worldX, this.host.playerWorld.worldY, npcWorld.worldX, npcWorld.worldY);
        getSoundManager().ui.playPick('soft', i);
      }));
      const landed = basket.kinds.length * 130 + 200;
      this.host.time.delayedCall(landed, () => {
        this.host.npcManager?.hop(npcWorld.worldX, npcWorld.worldY, 0.34);
        this.host.sparkle.spawnHearts(npcWorld.worldX, npcWorld.worldY);
        getSoundManager().ui.playCozyChime();
      });
      this.host.time.delayedCall(landed + 360, () => {
        this.host.cutsceneActive = false;
        open();
      });
      return;
    }
    if (!delivery || !npcWorld) { open(); return; }
    // A DEVOLUÇÃO tem corpo: a coisa salta das costas do herói para quem pediu, ele pula de
    // alegria, e só então fala. Meio segundo de mundo parado, para o gesto ser visto.
    this.host.cutsceneActive = true;
    this.host.steps.stopBreathing();
    this.host.orders.flingCraftedItem(delivery.kind, this.host.playerWorld.worldX, this.host.playerWorld.worldY, npcWorld.worldX, npcWorld.worldY);
    getSoundManager().ui.playItemStash();
    this.host.time.delayedCall(200, () => {
      this.host.npcManager?.hop(npcWorld.worldX, npcWorld.worldY, 0.34);
      this.host.sparkle.spawnHearts(npcWorld.worldX, npcWorld.worldY);
      getSoundManager().ui.playCozyChime();
    });
    this.host.time.delayedCall(560, () => {
      this.host.cutsceneActive = false;
      open();
    });
  }

  // Identity of the dialog an NPC would speak *right now*: the wizard's current story beat,
  // or (for everyone else) the base lines vs the campfire-gated "locked" lines. Used both to
  // mark a dialog as heard and to decide whether the "!" new-dialog marker shows.
  public dialogKeyFor(
    kind: import('@/game/world/ScreenContent').NpcKind,
    wx: number,
    wy: number,
    scriptId?: string,
  ): string | null {
    if (kind === 'wizard') return `wizard:${this.host.delivery.wizardLine()}`;
    if (!getDialog(kind, scriptId)) return null;
    if ((scriptId ?? kind) === PAINTER_DIALOG && this.host.adventure && this.host.questSetup.painterQuest && !this.host.questSetup.painterQuest.isDone) return this.host.questSetup.painterQuest.talkKey();
    if ((scriptId ?? kind) === LUMBER_DIALOG && this.host.adventure && this.host.questSetup.lumberQuest && !this.host.questSetup.lumberQuest.isDone) return this.host.questSetup.lumberQuest.talkKey();
    if ((scriptId ?? kind) === SKY_DIALOG && this.host.adventure && this.host.questSetup.astronomerQuest && !this.host.questSetup.astronomerQuest.isDone) return this.host.questSetup.astronomerQuest.talkKey();
    // A chave é do ROTEIRO FALADO, não da espécie: três gatos com três aulas são três "!" a
    // apagar, e com a chave por espécie ouvir um deles apagaria a marca dos outros dois. Ela lê
    // o roteiro que a MISSÃO escolheu, e é assim que fechar um pedido reacende o "!" do NPC —
    // ele tem fala nova, que é exatamente o que a marca sempre quis dizer.
    void wx; void wy;
    const hint = this.questHint(scriptId ?? kind);
    return `${this.spokenDialogId(scriptId ?? kind)}:${hint ? `hint:${hint}` : 'base'}`;
  }

  /**
   * O degrau em que o herói está num pedido longo: o primeiro item de `hints` que ele ainda não
   * teve nas mãos. Com todos vistos (a barra foi parar numa receita, digamos) fica o último — o
   * que falta é sempre refazer o fim. Pedido cumprido não ensina mais nada.
   */
  private questHint(dialogId: string): HeldItemKind | null {
    if (!this.host.adventure || this.spokenDialogId(dialogId) !== dialogId) return null;
    const steps = questFor(dialogId)?.hints;
    if (!steps || steps.length === 0) return null;
    return steps.find((item) => !this.host.seenItems.has(item)) ?? steps[steps.length - 1];
  }

  /**
   * OS COGUMELOS OPCIONAIS: fechado o pedido, a Shui continua dizendo onde nasce o próximo, sem cobrar. Quem traz
   * os seis ouve o reconhecimento. O agradecimento da hora em que o pedido fecha continua sendo o `Done`.
   */
  private foragerOptionalLines(closedNow: boolean): I18nLine[] {
    const quest = questFor(FORAGER_DIALOG);
    if (!this.host.adventure || !quest || !isQuestDone(quest)) return [];
    if (isQuestComplete(quest)) return tLines(`npc.${FORAGER_DIALOG}All`);
    if (closedNow) return [];
    const next = quest.hints?.find((item) => !this.host.seenItems.has(item));
    return next ? tLines(`npc.${FORAGER_DIALOG}Hint.${next}`) : [];
  }

  // Open the conversation panel for a ready-made script (pan the camera, dim the music), running
  // `onClosed` once the dialog is dismissed.
  public openDialogScript(
    script: DialogScript,
    npcWorld: { worldX: number; worldY: number } | undefined,
    voice: DialogVoice | undefined,
    onClosed?: () => void,
  ): void {
    this.dialogOpen = true;
    this.host.steps.stopBreathing();
    this.host.actions.useBufferMs = 0;
    // A caixa de fala mora no MESMO rodapé que o par A/B e o botão da bolsa. Eles já estão
    // calados (`canAct`), então o que sobra deles é o pedaço que espia ao lado da caixa: saem
    // de cena junto, como saem quando a bolsa abre.
    this.host.actions.actionButtons?.setVisible(false);
    // Pan so the hero + NPC sit centered on the stage ABOVE the box.
    this.dialogNpcWorld = npcWorld;
    this.host.dialogCam.startDialogCameraShift(npcWorld);
    // Focus on the conversation: fade the music down while the NPC talks.
    getSoundManager().music.fadeMusicOut();
    this.dialogOverlay = new DialogOverlay(this.host, script, () => {
      this.dialogOverlay?.destroy();
      this.dialogOverlay = undefined;
      this.dialogOpen = false;
      this.host.actions.actionButtons?.setVisible(true);
      this.host.dialogCam.endDialogCameraShift();
      getSoundManager().music.fadeMusicIn();
      // As falas lidas nesta conversa entram no save (runtime/readLines): da próxima vez, aparecem de uma vez.
      if (this.host.adventure) this.host.save.persistAdventure();
      onClosed?.();
    }, voice, this.dialogSpeaker ?? (npcWorld && this.host.npcManager?.bodyAt(npcWorld.worldX, npcWorld.worldY)) ?? this.host.intro.wizardStandIn);
  }

  /** O roteiro que este NPC fala AGORA — o alternativo, se ele já recebeu o que pediu. */
  private spokenDialogId(dialogId: string): string {
    return this.host.adventure ? questDialogFor(dialogId) : dialogId;
  }
}
