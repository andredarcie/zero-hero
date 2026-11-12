// OS BOTÕES: o A (o item segurado age) e o B (pegar, falar, pousar), a cadência e o buffer de cada um, o ícone do
// botão de toque, e a dica dos controles no começo.

import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { t, tLines } from '@/game/i18n/i18n';
import { canStep } from '@/game/world/relief';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import { ActionButtons, ControlsHint } from '@/game/runtime/ActionButtons';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { GameScene } from '../GameScene';
import { ITEM_VISUAL_2D, SWORD_PLANTED_ELEV, USE_COOLDOWN_MS } from './sceneDefs';

/**
 * **O BOTAO NAO SE PERDE.** Um X apertado durante a cadencia do anterior fica guardado por esta
 * janela e sai no instante em que ela libera, em vez de ser descartado.
 */
const ACTION_BUFFER_MS = 130;

/** O que ActionInput usa de GameScene. */
export type ActionInputHost = Pick<GameScene,
  'arc' | 'bumps' | 'camp' | 'craft' | 'cutsceneActive' | 'dialog' | 'dialogCam' | 'forage' | 'forge' | 'hand'
  | 'heldItem' | 'input' | 'intro' | 'itemManager' | 'machines' | 'movementController' | 'orders' | 'pause' | 'playerWorld'
  | 'questSetup' | 'roastEnding' | 'sparkle' | 'steps' | 'swing' | 'swordPlanting' | 'textures' | 'use'
  | 'useGround' | 'verbs'
>;

export class ActionInput {
  /** O icone de cada item para o B do toque, tirado da textura uma vez (ver syncUseButtonIcon). */
  private readonly useIconCache = new Map<HeldItemKind, string>();

  // A cadencia do X e o pedido guardado dele (ver USE_COOLDOWN_MS / ACTION_BUFFER_MS).
  public useCooldownMs = 0;
  public useBufferMs = 0;
  // Os dois botoes de acao no toque, e a tarja que diz as teclas uma vez (ver ActionButtons).
  public actionButtons?: ActionButtons;
  public controlsHint?: ControlsHint;

  public constructor(private readonly host: ActionInputHost) {}

  /**
   * Liga os dois botoes. No teclado sao Z/J/espaco (falar e cuidar) e X/K (o item) — o par do NES
   * nas teclas que a mao esquerda alcanca sem largar as setas. `addCapture` existe por causa do
   * espaco: sem ele a pagina rola um pouco a cada aperto.
   *
   * Por EVENTO e nao por `JustDown` dentro do update: este update tem varias portas por onde sai
   * mais cedo (dialogo, catalogo, cutscene), e uma tecla lida por polling morre em todas elas.
   */
  public installActionInput(): void {
    const touch = isTouchDevice();
    const kb = this.host.input.keyboard;
    if (kb) {
      kb.addCapture(['Z', 'X', 'J', 'K', 'SPACE']);
      for (const key of ['keydown-Z', 'keydown-J', 'keydown-SPACE']) kb.on(key, this.pressAttack, this);
      for (const key of ['keydown-X', 'keydown-K']) kb.on(key, this.pressUse, this);
    }
    // No telefone os dois botoes precisam de corpo; no teclado basta dizer uma vez quais sao as
    // teclas — e a tarja some sozinha (ver ControlsHint). No toque ela ensina o GESTO de andar,
    // que nenhum botao anuncia.
    if (touch) {
      this.actionButtons = new ActionButtons({
        onAttack: () => this.pressAttack(),
        onAttackRelease: () => undefined,
        onUse: () => this.pressUse(),
      });
      this.syncUseButtonIcon();
    }
    if (this.host.arc.has('intro') && !this.host.intro.openingTalk) this.showControlsHint();
  }

  /** A tarja dos controles: as teclas no teclado, o gesto e os botoes no toque (no alto da tela). */
  public showControlsHint(): void {
    this.controlsHint?.destroy();
    const touch = isTouchDevice();
    this.controlsHint = new ControlsHint(
      t(touch ? 'controls.touchHint' : 'controls.hint'), touch ? 8000 : 6500, touch,
    );
  }

  /**
   * O DESENHO DO B no toque: o item que esta na mao — o mesmo icone da mochila, tirado da textura
   * do motor 2D uma vez por tipo —, ou o losango vazio de mao vazia. Chamado onde o item das costas
   * se atualiza (updateBackItem), que e o lugar por onde toda troca de selecao ja passa.
   */
  public syncUseButtonIcon(): void {
    const buttons = this.actionButtons;
    if (!buttons) return;
    const kind = this.host.heldItem;
    if (kind === 'none') {
      buttons.setUseIcon(null);
      return;
    }
    let src = this.useIconCache.get(kind);
    if (src === undefined) {
      const v = ITEM_VISUAL_2D[kind];
      try {
        src = this.host.textures.getBase64(v.texture, v.frame);
      } catch {
        src = '';
      }
      this.useIconCache.set(kind, src);
    }
    buttons.setUseIcon(src || null, t(`items.name.${kind}`));
  }

  /** A seta, com a bolsa aberta: ela anda com o CURSOR e nao com o herói (que está de pés presos). */
  /**
   * O tile da frente esta ao ALCANCE da mao? So nao esta quando a serra separa os dois: o heroi no
   * planalto olhando o chao la embaixo, ou de baixo olhando o paredao. A escada, no rumo dela, liga.
   */
  public reachesFront(front: { x: number; y: number }): boolean {
    return canStep(this.host.playerWorld.worldX, this.host.playerWorld.worldY, front.x, front.y);
  }

  /**
   * Toda tela que congela o jogo congela tambem os dois botoes. O teclado ja para sozinho com
   * `scene.pause()`, mas os botoes de toque sao DOM e continuam clicaveis — entao a porta tem de
   * estar aqui, e nao so na tecla. A BOLSA entra aqui: o mundo continua correndo atrás dela, mas
   * as mãos estão dentro da mochila.
   */
  public canAct(): boolean {
    return !this.host.dialog.dialogOpen && !this.host.dialogCam.camShifting
      && !this.host.hand.itemGetOpen && !this.host.cutsceneActive
      && !this.host.pause.pauseMenu
      && !this.host.orders.orderOverlay && !this.host.forage.foraging && !this.host.camp.notebook.overlay
      && !this.host.camp.sketching.overlay && this.host.movementController !== undefined;
  }

  /**
   * Gasta o pedido guardado. Um X apertado durante a cadencia espera aqui e sai no instante em
   * que ela libera — e a espera tem prazo, senao um botao apertado ha meio segundo dispararia
   * sozinho. Ver ACTION_BUFFER_MS.
   */
  public spendActionBuffers(delta: number): void {
    if (this.useBufferMs > 0) {
      this.useBufferMs = Math.max(0, this.useBufferMs - delta);
      if (this.useBufferMs > 0 && this.useCooldownMs <= 0) this.pressUse();
    }
  }

  /**
   * O BOTAO Z — a MÃO que cumprimenta e cuida, nunca uma lâmina. Na ordem:
   *
   *   1. FALAR com quem está na frente (o keycap "Z" sobre a cabeça do NPC anuncia esta tecla);
   *   2. a FOGUEIRA DO FIM: acender, e depois assar (ver tendHearthAt);
   *   3. a BANCADA e o FORNO abrem o catálogo;
   *   4. o ALTAR vazio recebe o item selecionado, e o ocupado leva a pancada.
   *
   * Sem nada disso na frente o Z não faz nada — não há golpe no vazio porque não há golpe.
   */
  private pressAttack(event?: KeyboardEvent): void {
    // Uma tecla SEGURADA repete o `keydown` no navegador; o sinal certo pra ignorar a repeticao e
    // o `repeat` do proprio evento, nunca um booleano nosso que um `keyup` perdido deixaria preso.
    if (event?.repeat) return;
    // Meditando, o Z é o fôlego, e quem o escuta é a meditação (MeditationOverlay).
    if (this.host.camp.meditation.active) return;
    // Descansando, o Z só levanta — e dormindo, nem isso: quem acorda o herói é a manhã (ver Resting.canGetUp).
    if (this.host.camp.rest.isResting) { this.host.camp.rest.getUp(); return; }
    // O seixo na mão: o Z joga (StoneSkipping).
    if (this.host.camp.skipping.aiming) { this.host.camp.skipping.release(); return; }
    if (!this.canAct()) return;
    const front = this.host.verbs.facingTile();
    // O balão promete o Z para o que está debaixo do herói: conversar é a única coisa que passa na frente.
    if (this.host.hand.handOfferUnderfoot()) { this.host.hand.takeUnderfoot(); return; }
    // A BEIRA DA SERRA: entre o planalto e o chao de baixo nao ha mao que alcance (ver relief).
    if (!this.reachesFront(front)) { this.host.camp.catCare.pet(); return; }
    if (this.host.dialog.talkToNpcAt(front.x, front.y)) return;
    // A ferramenta guardada que este tile pede vem às costas (a faca diante do cogumelo, o pincel diante do quadro).
    this.host.swing.equipToolFor(front.x, front.y, 'hand');
    if (this.host.questSetup.painterQuest?.neededAt(front.x, front.y) || this.host.questSetup.lumberQuest?.neededAt(front.x, front.y) || this.host.questSetup.astronomerQuest?.neededAt(front.x, front.y)) this.host.bumps.thinkOfNeed(front.x, front.y, true);
    if (this.host.questSetup.painterQuest?.interactAt(front.x, front.y)) return;
    if (this.host.questSetup.lumberQuest?.interactAt(front.x, front.y)) return;
    if (this.host.questSetup.astronomerQuest?.interactAt(front.x, front.y)) return;
    // O Z e a MAO: diante de um cogumelo, colher e o gesto dela tambem (com a faca na mochila).
    if (this.host.forage.harvestMushroomAt(front.x, front.y)) return;
    if (this.host.camp.useFindAt(front.x, front.y)) return;
    if (this.host.camp.useCampAt(front.x, front.y)) return;
    if (this.host.camp.meditation.useAt(front.x, front.y)) return;
    if (this.host.camp.catCare.useBarrelAt(front.x, front.y)) return;
    // A espada fincada não sai do chão. Tocada, ela canta um pouco, e o que ela fez aparece como um
    // pensamento (pedido do autor).
    if (this.host.swordPlanting.plantedSwordTile?.x === front.x && this.host.swordPlanting.plantedSwordTile.y === front.y) {
      getSoundManager().work.playSwordHum();
      this.host.sparkle.spawnGlint(front.x, front.y, SWORD_PLANTED_ELEV + 0.42, 0.5);
      this.host.camp.narrate(tLines('finds.sword'));
      return;
    }
    if (this.host.roastEnding.tendHearthAt(front.x, front.y)) return;
    if (this.host.camp.restAtFireAt(front.x, front.y)) return;
    if (this.host.craft.openCraftMenuAt(front.x, front.y)) return;
    if (this.host.forge.placeOnAltarAt(front.x, front.y)) return;
    if (this.host.forge.workAltarAt(front.x, front.y)) return;
    // O LAZER: diante de água aberta, um seixo para quicar (o balão diz "Quicar pedra"); com um bicho perto e nada na
    // frente para a mão, o caderno de desenho (a etiqueta "Desenhar" embaixo da tela diz, e fica apagada quando a
    // frente pede outra coisa). Pousar no chão livre saiu (HandItems.handAt), então nenhum dos dois rouba gesto.
    if (this.host.camp.skipping.startAt(front.x, front.y)) return;
    if (!this.host.itemManager?.kindAt(front.x, front.y) && this.host.camp.sketching.tryOpen()) return;
    // A MÃO: pegar, trocar ou pousar a coisa do tile da frente.
    if (this.host.hand.handAt(front.x, front.y)) return;
    this.host.bumps.thinkOfNeed(front.x, front.y, true);
    // Z NO VAZIO com o gato do lado e carinho. Ele anda atras e nao num tile, entao mira-lo
    // seria impossivel: basta estar perto e o Z nao ter mais nada a fazer.
    this.host.camp.catCare.pet();
  }

  /**
   * O BOTÃO X — USA O ITEM DA BOLSA no tile à frente, e é só isso que ele faz.
   *
   * O X usa o item escolhido, devolve uma peca colocada no altar ou recolhe uma estacao manual.
   * A ordem abaixo é a única que não desmente as marcas desenhadas no chão: o que o jogador
   * ESCOLHEU (o item) age primeiro e so entao vem recolher.
   */
  private pressUse(event?: KeyboardEvent): void {
    // Segurar o X um instante a mais para equipar fazia o primeiro keydown CONFIRMAR o item e a
    // repetição seguinte, já com a bolsa fechada, USÁ-LO. Quem quer usar duas vezes aperta duas.
    if (event?.repeat) return;
    if (this.host.camp.meditation.active) return;
    if (this.host.camp.rest.isResting) { this.host.camp.rest.getUp(); return; }
    // O seixo na mão: o X desiste de jogar.
    if (this.host.camp.skipping.aiming) { this.host.camp.skipping.cancel(); return; }
    // A BOLSA ABERTA SEQUESTRA O X — e este é o único lugar do código onde isso pode ser decidido.
    if (!this.canAct()) return;
    // A cadencia adia, nao descarta (ver ACTION_BUFFER_MS).
    if (this.useCooldownMs > 0) {
      this.useBufferMs = ACTION_BUFFER_MS;
      return;
    }
    this.useBufferMs = 0;
    this.useCooldownMs = USE_COOLDOWN_MS;
    this.host.steps.stopBreathing();
    const { x, y } = this.host.verbs.facingTile();
    // A BEIRA DA SERRA: o X sai no vazio — a ferramenta nao alcanca o tile do outro nivel.
    if (!this.reachesFront({ x, y })) {
      if (this.host.heldItem !== 'none') this.host.swing.swingHeld(x, y);
      return;
    }
    // 0. A FERRAMENTA CERTA SE APRESENTA SOZINHA: o que está nas costas age primeiro; se não age e uma ferramenta
    //    guardada agiria, ela vem às costas. Ver ActionVerbs.toolFor.
    this.host.swing.equipToolFor(x, y, 'use');
    this.host.bumps.thinkOfNeed(x, y, true);
    if (this.host.questSetup.lumberQuest?.interactAt(x, y)) return;
    if (this.host.questSetup.astronomerQuest?.interactAt(x, y)) return;
    // 1. O ITEM ESCOLHIDO AGE — a tabela inteira (machado→árvore, picareta→rocha, balde→água,
    //    chave→porta, tocha→fogueira, pá→terra, semente→buraco, estação→instala).
    if (this.host.heldItem !== 'none' && this.host.use.useItemAt(x, y)) return;
    // 2. A BIGORNA: malha a peça que trabalha, ou devolve a que não trabalha (a martelada no chão saiu).
    if (this.host.forge.workAltarAt(x, y)) return;
    // 3. RECOLHER a máquina que o JOGADOR construiu.
    if (this.host.machines.pickUpMachineAt(x, y)) return;
    // 3½. A COVA DEBAIXO DOS PÉS: de pé em cima da rachadura, a pá cava ali mesmo (ver digUnderfoot).
    if (this.host.useGround.digUnderfoot()) return;
    // 4. O gesto sai NO VAZIO: um botão que só se mexe quando acerta esconde do jogador o que ele
    //    está segurando. Sem nada selecionado não há braço a balançar.
    if (this.host.heldItem !== 'none') this.host.swing.swingHeld(x, y);
  }
}
