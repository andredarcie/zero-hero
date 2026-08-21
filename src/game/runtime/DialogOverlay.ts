import type Phaser from 'phaser';

import { dialogBoxMetrics } from '@/game/constants';
import type { DialogLine, DialogScript, DialogVoice } from '@/game/dialogs/NpcDialogs';
import { getSoundManager } from '@/game/audio/SoundManager';
import { t } from '@/game/i18n/i18n';

// A CAIXA DE FALA TRADICIONAL: uma barra no RODAPÉ, UMA mensagem por vez.
//
// Ela é DOM por cima do canvas do Phaser (o mesmo caminho do editor, ver EditorDomUi): o canvas
// é um buffer de pixel art escalado com NEAREST (image-rendering: pixelated), então texto
// serifado desenhado DENTRO dele nunca pode ser nítido. No DOM o navegador rasteriza a fonte na
// resolução do aparelho — afiada, antialiasada, e responsiva de graça.
//
// O painel LATERAL com o log rolando (estilo Disco Elysium) foi arrancado: ele comia metade da
// tela, empurrava o mundo para o canto e pedia que se lesse a conversa inteira de uma vez. Aqui
// a fala em curso é a ÚNICA na tela e o mundo continua enquadrado ACIMA da caixa — quem fala
// aparece. A altura da caixa é `dialogBoxMetrics`, e a câmera lê a MESMA função (GameScene):
// duas respostas diferentes e a fala taparia o NPC que a diz.
//
// O menu não sumiu, mudou de forma: o caso comum é UMA opção (continuar/fechar) e ela vira o ▼
// que pisca no canto — o gesto é apertar Z/Enter ou tocar a caixa. Um NPC com BALCÃO
// (script.trade — o astronauta comprando ferro) abre uma JANELA DE ESCOLHA sobre a caixa, e
// vender pergunta a QUANTIDADE (o caixa: − n +, confirmar, desistir). Quem executa a transação é
// a GameScene (DialogTradePort) — aqui só mora o desenho da conversa.

const CHAR_DELAY_MS = 28;
const STYLE_ID = 'zh-dialog-style';
const ROOT_ID = 'zh-dialog-root';
const SERIF = "Georgia, 'Times New Roman', 'Book Antiqua', serif";

/** A mão da cena no mundo: quantas unidades o herói tem, e a venda de fato (devolve moedas). */
export type DialogTradePort = {
  count: () => number;
  sell: (units: number) => number;
};

type DialogOption = {
  label: string;
  /** data-opt — a identidade do botão para o playtest, nunca para lógica. */
  testId: string;
  pick: () => void;
};

const CSS = `
#${ROOT_ID} { position: fixed; inset: 0; pointer-events: none; z-index: 50; }
#${ROOT_ID} * { box-sizing: border-box; }
/* Sem cortina por cima do mundo: a conversa acontece NELE. O escurecido é só o pé da tela, para
   a caixa assentar sobre alguma coisa em vez de flutuar sobre grama clara. */
#${ROOT_ID} .zh-dlg-scrim {
  position: absolute; pointer-events: auto;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0) 45%, rgba(0, 0, 0, 0.42) 100%);
  opacity: 0; transition: opacity 160ms ease;
}
/* O dock ocupa EXATAMENTE o retângulo da caixa; a janela de escolha se pendura acima dele. */
#${ROOT_ID} .zh-dlg-dock { position: absolute; pointer-events: none; font-family: ${SERIF}; }
#${ROOT_ID} .zh-dlg-panel {
  position: absolute; inset: 0; pointer-events: auto;
  display: flex; align-items: stretch; gap: 0.9em;
  padding: 0.7em 0.9em;
  background: #14100c; color: #d8d1c0;
  border: 2px solid #6b5b45; border-radius: 2px;
  box-shadow: inset 0 0 0 2px #2a2118, 0 8px 26px rgba(0, 0, 0, 0.55);
  opacity: 0; transform: translateY(10px);
  transition: opacity 160ms ease, transform 160ms ease;
}
#${ROOT_ID}.zh-in .zh-dlg-panel { opacity: 1; transform: none; }
#${ROOT_ID}.zh-in .zh-dlg-scrim { opacity: 1; }
#${ROOT_ID} .zh-dlg-portrait {
  flex: 0 0 auto; width: 3.4em; height: 3.4em;
  image-rendering: pixelated; border: 2px solid #fff; background: #0b0906;
}
#${ROOT_ID} .zh-dlg-col {
  flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column;
}
#${ROOT_ID} .zh-dlg-name {
  flex: 0 0 auto;
  font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
  font-size: 0.86em; margin-bottom: 0.22em;
}
#${ROOT_ID} .zh-dlg-body {
  flex: 1 1 auto; min-height: 0; line-height: 1.5;
  padding-right: 1.6em; /* o ▼ mora no canto: o texto não passa por baixo dele */
  overflow-y: auto; overflow-x: hidden;
  scrollbar-width: thin; scrollbar-color: #3d342a transparent;
}
#${ROOT_ID} .zh-dlg-body::-webkit-scrollbar { width: 6px; }
#${ROOT_ID} .zh-dlg-body::-webkit-scrollbar-thumb { background: #3d342a; border-radius: 3px; }
#${ROOT_ID} .zh-dlg-body.zh-narr { font-style: italic; color: #8e99ad; }
/* O ▼ é o "e agora?" do caso comum: ele só aparece com a fala assentada. */
#${ROOT_ID} .zh-dlg-next {
  position: absolute; right: 0.6em; bottom: 0.3em;
  pointer-events: auto; cursor: pointer;
  color: #d4c8a4; font-size: 0.95em; line-height: 1;
  animation: zh-dlg-bob 900ms ease-in-out infinite;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
@keyframes zh-dlg-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(0.25em); } }
/* A JANELA DE ESCOLHA: um quadro próprio pousado sobre a caixa, à direita — o formato de
   sempre. Ela não existe quando a fala tem uma saída só. */
#${ROOT_ID} .zh-dlg-choices {
  position: absolute; right: 0; bottom: calc(100% + 0.5em);
  pointer-events: auto; display: none;
  min-width: 14em; max-width: 100%;
  padding: 0.4em 0.45em;
  background: #14100c; color: #d8d1c0;
  border: 2px solid #6b5b45; border-radius: 2px;
  box-shadow: inset 0 0 0 2px #2a2118, 0 8px 26px rgba(0, 0, 0, 0.55);
}
#${ROOT_ID} .zh-dlg-choices.zh-on { display: block; }
#${ROOT_ID} .zh-dlg-opt {
  padding: 0.4em 0.6em; border-radius: 2px;
  color: #cfc9ba; cursor: pointer;
  transition: background 90ms ease, color 90ms ease;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
/* A seleção é UM estado só, alimentado por teclado (setas/WASD), mouse (hover) e toque —
   três entradas, um destaque, para o dedo e a seta nunca discordarem do Enter. */
#${ROOT_ID} .zh-dlg-opt.is-selected { background: #d4c8a4; color: #241d12; }
#${ROOT_ID} .zh-dlg-opt .zh-opt-num { opacity: 0.6; margin-right: 0.7em; }
/* O caixa: − n + na linha de cima, confirmar/desistir como opções normais embaixo. */
#${ROOT_ID} .zh-dlg-trade { display: flex; align-items: center; gap: 0.6em; padding: 0.35em 0.6em 0.55em; }
#${ROOT_ID} .zh-dlg-qty-btn {
  pointer-events: auto; width: 2em; padding: 0.15em 0;
  background: #241d12; color: #d8d1c0; border: 1px solid #3d342a; border-radius: 2px;
  font-family: inherit; font-size: 1em; cursor: pointer;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
#${ROOT_ID} .zh-dlg-qty-btn:hover { background: #d4c8a4; color: #241d12; }
#${ROOT_ID} .zh-dlg-qty { flex: 1 1 auto; min-width: 6em; text-align: center; color: #e8dfc7; }
/* No dedo, alvo tem tamanho de dedo: as escolhas ocupam a largura inteira da caixa e crescem
   até o mínimo confortável (~44px) — a mesma conversa, só com mais carne onde o toque acerta. */
@media (pointer: coarse) {
  #${ROOT_ID} .zh-dlg-choices { left: 0; right: 0; min-width: 0; }
  #${ROOT_ID} .zh-dlg-opt { padding: 0.7em 0.6em; min-height: 44px; display: flex; align-items: center; }
  #${ROOT_ID} .zh-dlg-qty-btn { width: 2.6em; min-height: 44px; font-size: 1.1em; }
  #${ROOT_ID} .zh-dlg-trade { gap: 0.9em; }
  #${ROOT_ID} .zh-dlg-next { font-size: 1.15em; right: 0.5em; bottom: 0.2em; }
}
/* Tela estreita (telefone em pé): o retrato encolhe para o texto não virar uma coluna de duas
   palavras. Ele não some — é ele que diz QUEM fala. */
@media (max-width: 560px) {
  #${ROOT_ID} .zh-dlg-panel { gap: 0.6em; padding: 0.6em 0.7em; }
  #${ROOT_ID} .zh-dlg-portrait { width: 2.7em; height: 2.7em; }
}
`;

export class DialogOverlay {
  private readonly root: HTMLDivElement;
  private readonly dock: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly scrim: HTMLDivElement;
  private readonly portraitEl: HTMLImageElement;
  private readonly nameEl: HTMLDivElement;
  private readonly bodyEl: HTMLDivElement;
  private readonly nextEl: HTMLDivElement;
  private readonly choicesEl: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly portraitUrl: string;

  private lineIndex = 0;
  private charIndex = 0;
  private isTyping = false;
  private pointerArmed = false;
  private destroyed = false;
  private closing = false;
  private typewriterEvent?: Phaser.Time.TimerEvent;

  private currentIsNarrator = false;
  /** O texto e o "e agora?" da linha em curso — a fala pode ser do roteiro OU injetada pelo caixa. */
  private currentText = '';
  private currentOnDone?: () => void;

  /** O menu como dado, na ordem desenhada. Uma opção só = o ▼; duas ou mais = a janela. */
  private options: DialogOption[] = [];
  private optionEls: HTMLDivElement[] = [];
  /** Qual opção Enter/Espaço/Z escolhem — movida por ↑↓/WS, hover e toque. */
  private selected = 0;
  /** O caixa está aberto (− n + visível): ←→/AD ajustam, Enter confirma, Esc desiste. */
  private amountOpen = false;
  private qty = 1;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly script: DialogScript,
    private readonly onClose: () => void,
    private readonly voice?: DialogVoice,
    private readonly trade?: DialogTradePort,
  ) {
    this.canvas = scene.game.canvas;

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    this.root = document.createElement('div');
    this.root.id = ROOT_ID;

    this.scrim = document.createElement('div');
    this.scrim.className = 'zh-dlg-scrim';
    this.root.appendChild(this.scrim);

    this.dock = document.createElement('div');
    this.dock.className = 'zh-dlg-dock';
    this.root.appendChild(this.dock);

    this.choicesEl = document.createElement('div');
    this.choicesEl.className = 'zh-dlg-choices';
    this.dock.appendChild(this.choicesEl);

    // A caixa é montada UMA vez e reescrita a cada fala: com uma mensagem por vez não há lista
    // para crescer, e recriar o quadro faria a moldura piscar entre linhas.
    this.panel = document.createElement('div');
    this.panel.className = 'zh-dlg-panel';
    this.portraitEl = document.createElement('img');
    this.portraitEl.className = 'zh-dlg-portrait';
    this.portraitEl.alt = '';
    const col = document.createElement('div');
    col.className = 'zh-dlg-col';
    this.nameEl = document.createElement('div');
    this.nameEl.className = 'zh-dlg-name';
    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'zh-dlg-body';
    col.append(this.nameEl, this.bodyEl);
    this.nextEl = document.createElement('div');
    this.nextEl.className = 'zh-dlg-next';
    this.nextEl.textContent = '▼';
    this.nextEl.style.display = 'none';
    this.panel.append(this.portraitEl, col, this.nextEl);
    this.dock.appendChild(this.panel);

    document.body.appendChild(this.root);

    this.portraitUrl = this.buildPortraitUrl();
    this.portraitEl.src = this.portraitUrl;
    this.portraitEl.style.borderColor = this.script.npcColorHex;
    this.nameEl.style.color = this.script.npcColorHex;
    this.nameEl.textContent = this.script.npcName.toUpperCase();

    this.layout();
    window.addEventListener('resize', this.layout);
    window.addEventListener('keydown', this.handleKeyDown, true);

    // Fade in, then reveal the first line. The pointer advance is armed a beat later so the
    // keypress that opened the dialog can't instantly skip through it.
    requestAnimationFrame(() => { if (!this.destroyed) this.root.classList.add('zh-in'); });
    this.scene.time.delayedCall(180, () => { if (!this.destroyed) this.showLine(0); });
    this.scene.time.delayedCall(220, () => {
      if (this.destroyed) return;
      this.pointerArmed = true;
      this.scrim.addEventListener('click', this.handlePointer);
      this.panel.addEventListener('click', this.handlePointer);
    });
  }

  /** Kept for parity with the old canvas overlay; DOM handles its own events. */
  public update(): void { /* no-op */ }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.typewriterEvent?.remove();
    this.typewriterEvent = undefined;
    window.removeEventListener('resize', this.layout);
    window.removeEventListener('keydown', this.handleKeyDown, true);
    this.scrim.removeEventListener('click', this.handlePointer);
    this.panel.removeEventListener('click', this.handlePointer);
    this.root.remove();
  }

  // ── Layout: a barra do rodapé, em pixels de viewport ───────────────────────
  private readonly layout = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    const { boxHeight, fontSize, margin } = dialogBoxMetrics(rect.width, rect.height);

    // Ancorada pelo PÉ da tela (e não pelo topo da caixa) para o entalhe do telefone caber:
    // `env(safe-area-inset-bottom)` empurra a caixa para cima onde existe barra de gestos.
    const bottomGap = Math.round(window.innerHeight - (rect.top + rect.height) + margin);
    this.dock.style.left = `${Math.round(rect.left + margin)}px`;
    this.dock.style.width = `${Math.round(rect.width - margin * 2)}px`;
    this.dock.style.bottom = `calc(${bottomGap}px + env(safe-area-inset-bottom, 0px))`;
    this.dock.style.height = `${boxHeight}px`;
    // A tipografia acompanha o canvas: a mesma conversa lida de um telefone e de um monitor.
    this.dock.style.fontSize = `${fontSize}px`;

    this.scrim.style.left = `${Math.round(rect.left)}px`;
    this.scrim.style.top = `${Math.round(rect.top)}px`;
    this.scrim.style.width = `${Math.round(rect.width)}px`;
    this.scrim.style.height = `${Math.round(rect.height)}px`;
  };

  /** Rasterize the NPC's sprite frame to a data URL so DOM can show it crisply. */
  private buildPortraitUrl(): string {
    const key = this.script.npcAssetKey;
    const tex = this.scene.textures.get(key);
    // add.image(key, frame) shows frame 0 for a spritesheet and the whole image otherwise;
    // mirror that so the portrait matches the sprite in-world.
    const frame = this.script.npcFrame ?? (tex.has('0') ? '0' : undefined);
    return frame === undefined
      ? this.scene.textures.getBase64(key)
      : this.scene.textures.getBase64(key, String(frame));
  }

  // ── O typewriter, agora com dono: cada fala diz o que acontece quando termina ──

  /** Datilografa uma fala (do roteiro ou injetada) e chama `onDone` quando ela assenta. */
  private typeLine(line: DialogLine, onDone: () => void): void {
    this.typewriterEvent?.remove();
    this.typewriterEvent = undefined;
    this.clearOptions();

    this.charIndex = 0;
    this.isTyping = true;
    this.currentIsNarrator = line.speaker === 'narrator';
    this.currentText = line.text;
    this.currentOnDone = onDone;
    this.showLineFrame(line);

    this.typewriterEvent = this.scene.time.addEvent({
      delay: CHAR_DELAY_MS,
      loop: true,
      callback: () => {
        this.charIndex++;
        this.bodyEl.textContent = this.currentText.slice(0, this.charIndex);
        // Old-RPG "talking" blip: one per couple of letters, skipping spaces and narration.
        const ch = this.currentText[this.charIndex - 1];
        if (this.voice && !this.currentIsNarrator && ch && ch !== ' ' && this.charIndex % 2 === 0) {
          getSoundManager().playDialogBlip(this.voice.freq, this.voice.wave);
        }
        if (this.charIndex >= this.currentText.length) {
          this.typewriterEvent?.remove();
          this.typewriterEvent = undefined;
          this.finishLine();
        }
      },
    });
  }

  private showLine(index: number): void {
    this.lineIndex = index;
    this.typeLine(this.script.lines[index], () => this.scriptLineDone());
  }

  /**
   * Veste a caixa para a fala que vai entrar: o NPC traz retrato e nome em caps na cor dele; a
   * narração é itálico apagado, sem atribuição e com a caixa inteira para si. UMA mensagem por
   * vez — o que estava escrito some aqui.
   */
  private showLineFrame(line: DialogLine): void {
    const isNarrator = line.speaker === 'narrator';
    this.portraitEl.style.display = isNarrator ? 'none' : '';
    this.nameEl.style.display = isNarrator ? 'none' : '';
    this.bodyEl.className = isNarrator ? 'zh-dlg-body zh-narr' : 'zh-dlg-body';
    this.bodyEl.textContent = '';
    this.bodyEl.scrollTop = 0;
  }

  private finishLine(): void {
    this.isTyping = false;
    this.currentOnDone?.();
  }

  /**
   * Uma fala do ROTEIRO terminou: montar o menu. O caso sem balcão é o de sempre (continuar/
   * fechar numa opção só, que vira o ▼). Com balcão, a PRIMEIRA fala abre a escolha do usuário —
   * continuar conversando ou vender — e a ÚLTIMA troca "continuar" por "fechar".
   */
  private scriptLineDone(): void {
    const isLast = this.lineIndex >= this.script.lines.length - 1;
    const next = (): void => this.showLine(this.lineIndex + 1);
    if (this.script.trade && this.trade) {
      if (isLast) this.tradeMenu();
      else if (this.lineIndex === 0) {
        this.setOptions([
          { label: 'Keep talking.', testId: 'talk', pick: next },
          this.sellOption(),
        ]);
      } else {
        this.setOptions([{ label: t('dialog.continue'), testId: 'continue', pick: next }]);
      }
      return;
    }
    this.setOptions([{
      label: isLast ? t('dialog.close') : t('dialog.continue'),
      testId: isLast ? 'close' : 'continue',
      pick: isLast ? (): void => this.close() : next,
    }]);
  }

  // ── O balcão ───────────────────────────────────────────────────────────────

  private sellOption(): DialogOption {
    const trade = this.script.trade!;
    return {
      label: `Sell ${trade.item}. (${trade.coinsPerUnit} coins each)`,
      testId: 'sell',
      pick: () => this.openCounter(),
    };
  }

  /** O menu de "balcão aberto": vender de novo, ou encerrar a conversa. */
  private tradeMenu(): void {
    this.setOptions([
      this.sellOption(),
      { label: t('dialog.close'), testId: 'close', pick: () => this.close() },
    ]);
  }

  private openCounter(): void {
    const trade = this.script.trade;
    const port = this.trade;
    if (!trade || !port) return;
    // Mochila sem o item: a recusa é uma FALA do NPC, nunca um menu mudo.
    if (port.count() <= 0) {
      this.typeLine({ speaker: 'npc', text: trade.empty }, () => this.tradeMenu());
      return;
    }
    this.typeLine({ speaker: 'npc', text: trade.offer }, () => this.showAmount());
  }

  /** O caixa: começa oferecendo TUDO (a intenção mais comum) e as setas lapidam. */
  private showAmount(): void {
    this.amountOpen = true;
    this.qty = Math.max(1, this.trade?.count() ?? 1);
    this.renderAmount();
  }

  private adjustQty(delta: number): void {
    const max = Math.max(1, this.trade?.count() ?? 1);
    this.qty = Math.min(max, Math.max(1, this.qty + delta));
    this.renderAmount();
  }

  private renderAmount(): void {
    const trade = this.script.trade;
    if (!trade) return;
    this.options = [];
    this.optionEls = [];
    this.selected = 0;
    this.choicesEl.innerHTML = '';
    this.nextEl.style.display = 'none';

    const row = document.createElement('div');
    row.className = 'zh-dlg-trade';
    const minus = document.createElement('button');
    minus.className = 'zh-dlg-qty-btn';
    minus.dataset.opt = 'minus';
    minus.textContent = '−';
    minus.addEventListener('click', () => this.adjustQty(-1));
    const qty = document.createElement('span');
    qty.className = 'zh-dlg-qty';
    qty.dataset.qty = String(this.qty);
    qty.textContent = `${this.qty} ${trade.item} × ${trade.coinsPerUnit}`;
    const plus = document.createElement('button');
    plus.className = 'zh-dlg-qty-btn';
    plus.dataset.opt = 'plus';
    plus.textContent = '+';
    plus.addEventListener('click', () => this.adjustQty(1));
    row.append(minus, qty, plus);
    this.choicesEl.appendChild(row);

    this.appendOption({
      label: `Sell ${this.qty} for ${this.qty * trade.coinsPerUnit} coins.`,
      testId: 'confirm',
      pick: () => this.confirmSale(),
    }, 1);
    this.appendOption({
      label: 'Never mind.',
      testId: 'back',
      pick: () => { this.amountOpen = false; this.tradeMenu(); },
    }, 2);
    this.choicesEl.classList.add('zh-on');
  }

  private confirmSale(): void {
    const trade = this.script.trade;
    const port = this.trade;
    if (!trade || !port || !this.amountOpen) return;
    this.amountOpen = false;
    const units = this.qty;
    const coins = port.sell(units);
    if (coins <= 0) {
      this.typeLine({ speaker: 'npc', text: trade.empty }, () => this.tradeMenu());
      return;
    }
    // O recibo é do NARRADOR (o número exato) e o agradecimento é do NPC — e com UMA mensagem
    // por vez elas são duas TELAS, não duas linhas empilhadas: sem o aperto no meio, o número
    // que o jogador precisa conferir passaria voando por baixo do "obrigado".
    this.typeLine({ speaker: 'narrator', text: `Sold ${units} ${trade.item} for ${coins} coins.` }, () => {
      this.setOptions([{
        label: t('dialog.continue'),
        testId: 'continue',
        pick: () => this.typeLine({ speaker: 'npc', text: trade.thanks }, () => this.tradeMenu()),
      }]);
    });
  }

  // ── O menu: o ▼ do caso comum, a janela de escolha do resto ────────────────

  private clearOptions(): void {
    this.options = [];
    this.optionEls = [];
    this.selected = 0;
    this.amountOpen = false;
    this.choicesEl.innerHTML = '';
    this.choicesEl.classList.remove('zh-on');
    this.nextEl.style.display = 'none';
  }

  /** Uma escolha de verdade está na tela — e aí tocar a CAIXA não escolhe nada por engano. */
  private get choicesOpen(): boolean {
    return this.optionEls.length > 0 || this.amountOpen;
  }

  private setOptions(list: DialogOption[]): void {
    this.clearOptions();
    // Saída única: nada de menu de um item só. O ▼ diz "tem mais" e o gesto é a caixa inteira.
    if (list.length === 1) {
      this.options = list;
      this.nextEl.dataset.opt = list[0].testId;
      this.nextEl.title = list[0].label;
      this.nextEl.style.display = '';
      return;
    }
    list.forEach((option, index) => this.appendOption(option, index + 1));
    this.choicesEl.classList.add('zh-on');
  }

  private appendOption(option: DialogOption, number: number): void {
    const index = this.options.length;
    this.options.push(option);
    const el = document.createElement('div');
    el.className = 'zh-dlg-opt';
    el.dataset.opt = option.testId;
    const num = document.createElement('span');
    num.className = 'zh-opt-num';
    num.textContent = `${number}.`;
    const label = document.createElement('span');
    label.textContent = option.label;
    el.append(num, label);
    el.addEventListener('click', option.pick);
    // O mouse passeando move a MESMA seleção das setas — um destaque, três entradas.
    el.addEventListener('mouseenter', () => this.select(index));
    this.optionEls.push(el);
    this.choicesEl.appendChild(el);
    this.select(this.selected);
  }

  private select(index: number): void {
    if (this.options.length === 0) return;
    this.selected = Math.min(this.options.length - 1, Math.max(0, index));
    this.optionEls.forEach((el, i) => el.classList.toggle('is-selected', i === this.selected));
  }

  private advance(): void {
    if (this.destroyed || this.closing) return;
    if (this.isTyping) {
      this.skipTypewriter();
      return;
    }
    // Com uma escolha na tela, tocar a CAIXA não decide nada: escolher é apertar a escolha — o
    // mesmo motivo de o Enter confirmar só o que está escrito no rótulo destacado.
    if (this.choicesOpen) return;
    this.options[this.selected]?.pick();
  }

  private skipTypewriter(): void {
    this.typewriterEvent?.remove();
    this.typewriterEvent = undefined;
    this.bodyEl.textContent = this.currentText;
    this.finishLine();
  }

  private readonly handlePointer = (): void => {
    if (this.pointerArmed) this.advance();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.destroyed) return;
    const confirmKey = event.code === 'Space' || event.code === 'Enter'
      || event.code === 'NumpadEnter' || event.code === 'KeyZ';
    if (confirmKey) {
      event.preventDefault();
      // Tecla SEGURADA não metralha a conversa: cada linha e cada escolha custam um aperto.
      if (event.repeat) return;
      if (this.isTyping) this.skipTypewriter();
      else this.options[this.selected]?.pick();
    } else if ((event.code === 'ArrowUp' || event.code === 'KeyW'
      || event.code === 'ArrowDown' || event.code === 'KeyS') && !this.isTyping) {
      event.preventDefault();
      const delta = event.code === 'ArrowUp' || event.code === 'KeyW' ? -1 : 1;
      this.select(this.selected + delta);
    } else if (/^Digit[1-9]$/u.test(event.code) && !this.isTyping && !this.amountOpen) {
      const index = Number(event.code.slice(5)) - 1;
      if (this.options[index]) {
        event.preventDefault();
        this.options[index].pick();
      }
    } else if ((event.code === 'ArrowLeft' || event.code === 'KeyA'
      || event.code === 'ArrowRight' || event.code === 'KeyD') && this.amountOpen) {
      event.preventDefault();
      this.adjustQty(event.code === 'ArrowLeft' || event.code === 'KeyA' ? -1 : 1);
    } else if (event.code === 'Escape') {
      event.preventDefault();
      if (this.amountOpen) {
        this.amountOpen = false;
        this.tradeMenu();
      } else this.close();
    }
  };

  private close(): void {
    if (this.closing) return;
    this.closing = true;
    this.typewriterEvent?.remove();
    this.typewriterEvent = undefined;
    this.root.classList.remove('zh-in');
    this.scene.time.delayedCall(160, () => { if (!this.destroyed) this.onClose(); });
  }
}
