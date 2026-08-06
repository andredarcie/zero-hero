import type Phaser from 'phaser';

import { DIALOG_PANEL_FRACTION, DIALOG_PANEL_MAX_WIDTH } from '@/game/constants';
import type { DialogLine, DialogScript, DialogVoice } from '@/game/dialogs/NpcDialogs';
import { getSoundManager } from '@/game/audio/SoundManager';
import { t } from '@/game/i18n/i18n';

// Disco Elysium-style conversation skin. It is rendered as plain DOM layered over the
// Phaser canvas — the same approach the level editor uses (see EditorDomUi). The game
// canvas is a low-resolution pixel-art buffer scaled up with NEAREST sampling
// (image-rendering: pixelated), so serif text drawn *inside* it can never be sharp: it
// inherits the buffer's low resolution and blocky upscale. Rendering the text in DOM lets
// the browser rasterize the font natively at full device resolution — razor-sharp,
// antialiased, and free to use real scrolling for the running dialogue log.
//
// O rodapé deixou de ser UMA opção: ele é um MENU. O caso comum continua sendo uma opção só
// (Continue/Close), mas um NPC com BALCÃO (script.trade — o astronauta comprando ferro) ganha
// a escolha do usuário: depois da PRIMEIRA fala, "continuar conversando" ou "vender"; vender
// pergunta a QUANTIDADE (o caixa: − n +, confirmar, desistir) e paga em moedas na hora. Quem
// executa a transação é a GameScene (DialogTradePort) — aqui só mora o desenho da conversa.

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
#${ROOT_ID} .zh-dlg-scrim {
  position: absolute; pointer-events: auto;
  background: rgba(0, 0, 0, 0.3);
  opacity: 0; transition: opacity 160ms ease;
}
#${ROOT_ID} .zh-dlg-panel {
  position: absolute; pointer-events: auto;
  display: flex; flex-direction: column;
  background: #14100c; border-left: 1px solid #3d342a;
  color: #d8d1c0; font-family: ${SERIF};
  box-shadow: -10px 0 30px rgba(0, 0, 0, 0.55);
  opacity: 0; transition: opacity 160ms ease;
  overflow: hidden;
}
#${ROOT_ID}.zh-in .zh-dlg-panel,
#${ROOT_ID}.zh-in .zh-dlg-scrim { opacity: 1; }
#${ROOT_ID} .zh-dlg-log {
  flex: 1 1 auto; min-height: 0;
  display: flex; flex-direction: column;
  overflow-y: auto; overflow-x: hidden;
  padding: 1.4em 1.5em 0.9em;
  scrollbar-width: thin; scrollbar-color: #3d342a transparent;
}
#${ROOT_ID} .zh-dlg-log::-webkit-scrollbar { width: 8px; }
#${ROOT_ID} .zh-dlg-log::-webkit-scrollbar-thumb { background: #3d342a; border-radius: 4px; }
/* Anchor the log to the bottom like Disco Elysium: the newest line sits just above the
   options and the conversation grows upward. margin-top:auto pushes content down while it
   is shorter than the viewport, then collapses so older lines scroll off the top. */
#${ROOT_ID} .zh-dlg-log-inner { margin-top: auto; }
#${ROOT_ID} .zh-dlg-entry { margin-bottom: 1.1em; }
#${ROOT_ID} .zh-dlg-entry:last-child { margin-bottom: 0; }
#${ROOT_ID} .zh-dlg-head { display: flex; align-items: center; gap: 0.55em; margin-bottom: 0.3em; }
#${ROOT_ID} .zh-dlg-portrait {
  flex: 0 0 auto; width: 2.6em; height: 2.6em;
  image-rendering: pixelated; border: 2px solid #fff; background: #0b0906;
}
#${ROOT_ID} .zh-dlg-name {
  font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
  font-size: 0.92em;
}
#${ROOT_ID} .zh-dlg-body { line-height: 1.5; }
#${ROOT_ID} .zh-dlg-body.zh-narr { font-style: italic; color: #8e99ad; }
#${ROOT_ID} .zh-dlg-body::after {
  content: '_'; opacity: 0; margin-left: 0.05em;
}
#${ROOT_ID} .zh-dlg-body.zh-typing::after {
  opacity: 1; animation: zh-dlg-caret 0.6s steps(1) infinite;
}
@keyframes zh-dlg-caret { 50% { opacity: 0; } }
#${ROOT_ID} .zh-dlg-options { flex: 0 0 auto; border-top: 1px solid #3d342a; padding: 0.5em 1.2em 1em; }
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
#${ROOT_ID} .zh-dlg-qty { min-width: 7em; text-align: center; color: #e8dfc7; }
/* No dedo, alvo tem tamanho de dedo: opções e botões do caixa crescem até o mínimo confortável
   (~44px) — a mesma conversa, só com mais carne onde o toque acerta. */
@media (pointer: coarse) {
  #${ROOT_ID} .zh-dlg-opt { padding: 0.7em 0.6em; min-height: 44px; display: flex; align-items: center; }
  #${ROOT_ID} .zh-dlg-qty-btn { width: 2.6em; min-height: 44px; font-size: 1.1em; }
  #${ROOT_ID} .zh-dlg-trade { gap: 0.9em; }
}
`;

export class DialogOverlay {
  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly scrim: HTMLDivElement;
  private readonly log: HTMLDivElement;
  private readonly logInner: HTMLDivElement;
  private readonly optionsEl: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly portraitUrl: string;

  private activeBody?: HTMLDivElement;

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

  /** O menu do rodapé como dado, na ordem desenhada. */
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

    this.panel = document.createElement('div');
    this.panel.className = 'zh-dlg-panel';
    this.root.appendChild(this.panel);

    this.log = document.createElement('div');
    this.log.className = 'zh-dlg-log';
    this.logInner = document.createElement('div');
    this.logInner.className = 'zh-dlg-log-inner';
    this.log.appendChild(this.logInner);
    this.panel.appendChild(this.log);

    this.optionsEl = document.createElement('div');
    this.optionsEl.className = 'zh-dlg-options';
    this.panel.appendChild(this.optionsEl);

    document.body.appendChild(this.root);

    this.portraitUrl = this.buildPortraitUrl();
    this.layout();
    window.addEventListener('resize', this.layout);
    window.addEventListener('keydown', this.handleKeyDown, true);

    // Fade in, then reveal the first line. The pointer/scrim advance is armed a beat later
    // so the keypress that opened the dialog can't instantly skip through it.
    requestAnimationFrame(() => { if (!this.destroyed) this.root.classList.add('zh-in'); });
    this.scene.time.delayedCall(180, () => { if (!this.destroyed) this.showLine(0); });
    this.scene.time.delayedCall(220, () => {
      if (this.destroyed) return;
      this.pointerArmed = true;
      this.scrim.addEventListener('click', this.handlePointer);
      this.log.addEventListener('click', this.handlePointer);
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
    this.log.removeEventListener('click', this.handlePointer);
    this.root.remove();
  }

  // ── Layout: hug the right PANEL_FRACTION of the canvas, in viewport pixels ──
  private readonly layout = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    // Hug the right fraction of the canvas, but cap the width so text never over-stretches.
    const panelW = Math.round(Math.min(rect.width * DIALOG_PANEL_FRACTION, DIALOG_PANEL_MAX_WIDTH));

    this.panel.style.left = `${Math.round(rect.left + rect.width - panelW)}px`;
    this.panel.style.top = `${Math.round(rect.top)}px`;
    this.panel.style.width = `${panelW}px`;
    this.panel.style.height = `${Math.round(rect.height)}px`;

    this.scrim.style.left = `${Math.round(rect.left)}px`;
    this.scrim.style.top = `${Math.round(rect.top)}px`;
    this.scrim.style.width = `${Math.round(rect.width - panelW)}px`;
    this.scrim.style.height = `${Math.round(rect.height)}px`;

    // Scale the whole panel's typography to the canvas so it reads as part of the game.
    const base = Math.max(12, Math.min(18, Math.round(rect.height / 32)));
    this.panel.style.fontSize = `${base}px`;
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
    this.activeBody = this.appendEntry(line);

    this.typewriterEvent = this.scene.time.addEvent({
      delay: CHAR_DELAY_MS,
      loop: true,
      callback: () => {
        this.charIndex++;
        if (this.activeBody) this.activeBody.textContent = this.currentText.slice(0, this.charIndex);
        this.log.scrollTop = this.log.scrollHeight;
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
   * Append a log entry: NPC lines get a bordered portrait plus the caps name in the NPC's
   * color; narration renders as dim italic with no attribution. Returns the body element
   * the typewriter fills.
   */
  private appendEntry(line: DialogLine): HTMLDivElement {
    const isNarrator = line.speaker === 'narrator';
    const entry = document.createElement('div');
    entry.className = 'zh-dlg-entry';

    if (!isNarrator) {
      const head = document.createElement('div');
      head.className = 'zh-dlg-head';
      const portrait = document.createElement('img');
      portrait.className = 'zh-dlg-portrait';
      portrait.src = this.portraitUrl;
      portrait.alt = '';
      portrait.style.borderColor = this.script.npcColorHex;
      const name = document.createElement('div');
      name.className = 'zh-dlg-name';
      name.textContent = this.script.npcName.toUpperCase();
      name.style.color = this.script.npcColorHex;
      head.append(portrait, name);
      entry.appendChild(head);
    }

    const body = document.createElement('div');
    body.className = isNarrator ? 'zh-dlg-body zh-narr zh-typing' : 'zh-dlg-body zh-typing';
    entry.appendChild(body);

    this.logInner.appendChild(entry);
    this.log.scrollTop = this.log.scrollHeight;
    return body;
  }

  private finishLine(): void {
    this.isTyping = false;
    this.activeBody?.classList.remove('zh-typing');
    this.log.scrollTop = this.log.scrollHeight;
    this.currentOnDone?.();
  }

  /**
   * Uma fala do ROTEIRO terminou: montar o menu. O caso sem balcão é o de sempre (Continue/
   * Close numa opção só). Com balcão, a PRIMEIRA fala abre a escolha do usuário — continuar
   * conversando ou vender — e a ÚLTIMA troca "continuar" por "fechar", com vender sempre à mão.
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
    this.optionsEl.innerHTML = '';

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
    this.optionsEl.appendChild(row);

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
    this.log.scrollTop = this.log.scrollHeight;
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
    // O recibo é do NARRADOR (o número exato), o agradecimento é do NPC — e o balcão reabre.
    this.typeLine({ speaker: 'narrator', text: `Sold ${units} ${trade.item} for ${coins} coins.` }, () => {
      this.typeLine({ speaker: 'npc', text: trade.thanks }, () => this.tradeMenu());
    });
  }

  // ── O menu do rodapé ───────────────────────────────────────────────────────

  private clearOptions(): void {
    this.options = [];
    this.optionEls = [];
    this.selected = 0;
    this.amountOpen = false;
    this.optionsEl.innerHTML = '';
  }

  private setOptions(list: DialogOption[]): void {
    this.clearOptions();
    list.forEach((option, index) => this.appendOption(option, index + 1));
    this.log.scrollTop = this.log.scrollHeight;
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
    this.optionsEl.appendChild(el);
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
    // Com o caixa aberto o clique no LOG não escolhe nada: vender é um botão, não um toque
    // distraído — o mesmo motivo de o Enter confirmar só o que está escrito no rótulo.
    if (this.amountOpen) return;
    this.options[this.selected]?.pick();
  }

  private skipTypewriter(): void {
    this.typewriterEvent?.remove();
    this.typewriterEvent = undefined;
    if (this.activeBody) this.activeBody.textContent = this.currentText;
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
