import type Phaser from 'phaser';

import { dialogBoxMetrics, isTallDialog } from '@/game/constants';
import type { DialogLine, DialogScript, DialogVoice } from '@/game/dialogs/NpcDialogs';
import { personaFor, planSpeech, type SpokenChar, type VoicePersona } from '@/game/dialogs/voicePersonas';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { TalkingBody } from '@/game/runtime/TalkingBody';
import { t } from '@/game/i18n/i18n';
import { BOOK_FONT, PARCHMENT_ON, WOOD_PANEL } from '@/game/runtime/uiStyle';

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
// que pisca no canto — o gesto é apertar Z/Enter ou tocar a caixa. A janela de escolha (várias
// opções empilhadas sobre a caixa) continua de pé para quem precisar dela.
//
// Houve aqui um BALCÃO: o astronauta comprava ferro, e vender abria um caixa (− n +, confirmar,
// desistir) que pagava em MOEDA. A moeda foi removida do jogo por inteiro, e com ela o balcão —
// um caixa que não paga nada não é uma escolha, é um menu que gasta o item do jogador.

const CHAR_DELAY_MS = 28;
const STYLE_ID = 'zh-dialog-style';
const ROOT_ID = 'zh-dialog-root';
/** Palavra em maiúsculas é o nome da coisa que importa (BALDE, TOCHA): ela entra com mais peso. */
const EMPHASIS = /^\p{Lu}{3,}$/u;
/** O retrato em ems por unidade de esticada: ele sobe enquanto estica. */
const PORTRAIT_LIFT_EM = 0.9;
const PORTRAIT_TILT_DEG = 170;

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
#${ROOT_ID} .zh-dlg-dock { position: absolute; pointer-events: none; font-family: ${BOOK_FONT}; }
#${ROOT_ID} .zh-dlg-panel {
  position: absolute; inset: 0; pointer-events: auto;
  display: flex; align-items: stretch; gap: 0.9em;
  padding: 0.8em 1.1em;
  ${WOOD_PANEL}
  opacity: 0; transform: translateY(28px) scale(0.96);
  transition: opacity 160ms ease, transform 300ms cubic-bezier(0.2, 1.5, 0.4, 1);
}
#${ROOT_ID}.zh-in .zh-dlg-panel { opacity: 1; transform: none; }
#${ROOT_ID}.zh-in .zh-dlg-scrim { opacity: 1; }
#${ROOT_ID} .zh-dlg-portrait {
  flex: 0 0 auto; width: 3.6em; height: 3.6em;
  image-rendering: pixelated; border: 2px solid #fff; background: #0b0906;
  transform-origin: 50% 100%; will-change: transform;
}
#${ROOT_ID} .zh-dlg-col {
  flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column;
}
#${ROOT_ID} .zh-dlg-name {
  flex: 0 0 auto;
  letter-spacing: 0.05em; font-variant: small-caps; color: #e5b558;
  font-size: 0.98em; margin-bottom: 0.3em;
}
#${ROOT_ID} .zh-dlg-body {
  flex: 1 1 auto; min-height: 0; line-height: 1.45; letter-spacing: 0.01em;
  padding-right: 1.6em; /* o ▼ mora no canto: o texto não passa por baixo dele */
  overflow-y: auto; overflow-x: hidden;
  scrollbar-width: thin; scrollbar-color: #3d342a transparent;
  position: relative;
}
/* CADA LETRA É UMA PEÇA, já no lugar desde o começo da fala: a palavra nunca pula de linha no meio
   da datilografia. O jeito de entrar é de quem fala (data-letters). */
#${ROOT_ID} .zh-word { display: inline-block; white-space: nowrap; }
#${ROOT_ID} .zh-ch { display: inline-block; opacity: 0; white-space: pre; }
#${ROOT_ID} .zh-ch.zh-on { opacity: 1; animation: zh-ch-pop 300ms cubic-bezier(0.2, 0.8, 0.3, 1) both; }
#${ROOT_ID} [data-letters="snap"] .zh-ch.zh-on { animation: zh-ch-snap 130ms ease-out both; }
#${ROOT_ID} [data-letters="drop"] .zh-ch.zh-on { animation: zh-ch-drop 380ms cubic-bezier(0.3, 0.7, 0.3, 1) both; }
#${ROOT_ID} [data-letters="drift"] .zh-ch.zh-on { animation: zh-ch-drift 520ms ease-out both; }
#${ROOT_ID} [data-letters="stiff"] .zh-ch.zh-on { animation: none; }
#${ROOT_ID} [data-letters="float"] .zh-ch.zh-on {
  animation: zh-ch-drift 420ms ease-out both, zh-ch-wave 2400ms ease-in-out 420ms infinite;
  animation-delay: 0ms, calc(420ms + var(--i) * -90ms);
}
#${ROOT_ID} [data-letters="shiver"] .zh-ch.zh-on {
  animation: zh-ch-pop 300ms ease-out both, zh-ch-tremble 340ms linear 300ms infinite;
  animation-delay: 0ms, calc(300ms + var(--i) * -47ms);
}
#${ROOT_ID} .zh-dlg-body.zh-narr .zh-ch.zh-on { animation: zh-ch-fade 360ms ease-out both; }
/* O nome da coisa: dourado, e chega maior. */
#${ROOT_ID} .zh-em .zh-ch { color: #ffd36b; font-weight: 700; }
#${ROOT_ID} .zh-dlg-body:not(.zh-narr):not([data-letters="stiff"]) .zh-em .zh-ch.zh-on { animation: zh-ch-em 420ms cubic-bezier(0.2, 0.8, 0.3, 1) both; }
@keyframes zh-ch-pop {
  0% { opacity: 0; transform: translateY(0.6em) scale(0.45); text-shadow: 0 0 0.5em var(--voice); }
  55% { opacity: 1; transform: translateY(-0.16em) scale(1.14); text-shadow: 0 0 0.4em var(--voice); }
  100% { opacity: 1; transform: none; text-shadow: none; }
}
@keyframes zh-ch-snap {
  0% { opacity: 0; transform: scale(1.5); }
  100% { opacity: 1; transform: none; }
}
@keyframes zh-ch-drop {
  0% { opacity: 0; transform: translateY(-0.7em) rotate(10deg); }
  60% { opacity: 1; transform: translateY(0.07em) rotate(-2deg); }
  100% { opacity: 1; transform: none; }
}
@keyframes zh-ch-drift {
  0% { opacity: 0; transform: translateY(0.35em); text-shadow: 0 0 0.7em var(--voice); }
  100% { opacity: 1; transform: none; text-shadow: none; }
}
@keyframes zh-ch-fade {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
@keyframes zh-ch-em {
  0% { opacity: 0; transform: translateY(0.5em) scale(0.4); text-shadow: 0 0 0.8em #ffd36b; }
  50% { opacity: 1; transform: translateY(-0.24em) scale(1.38); text-shadow: 0 0 0.6em #ffd36b; }
  100% { opacity: 1; transform: none; text-shadow: none; }
}
@keyframes zh-ch-wave {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-0.07em); }
}
@keyframes zh-ch-tremble {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(0.018em, -0.014em); }
  50% { transform: translate(-0.014em, 0.018em); }
  75% { transform: translate(0.012em, 0.01em); }
}
@media (prefers-reduced-motion: reduce) {
  #${ROOT_ID} .zh-dlg-body .zh-ch.zh-on,
  #${ROOT_ID} .zh-dlg-body:not(.zh-narr):not([data-letters="stiff"]) .zh-em .zh-ch.zh-on { animation: zh-ch-fade 120ms linear both; }
}
#${ROOT_ID} .zh-dlg-body::-webkit-scrollbar { width: 6px; }
#${ROOT_ID} .zh-dlg-body::-webkit-scrollbar-thumb { background: #3d342a; border-radius: 3px; }
#${ROOT_ID} .zh-dlg-body.zh-narr { font-style: italic; color: #c9d2e3; }
/* O ▼ é o "e agora?" do caso comum: ele só aparece com a fala assentada. */
#${ROOT_ID} .zh-dlg-next {
  position: absolute; right: 0.6em; bottom: 0.3em;
  pointer-events: auto; cursor: pointer;
  color: #d4c8a4; font-size: 0.95em; line-height: 1;
  animation: zh-dlg-pop 260ms cubic-bezier(0.2, 1.8, 0.4, 1) both, zh-dlg-bob 900ms ease-in-out 260ms infinite;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
@keyframes zh-dlg-pop { 0% { opacity: 0; transform: scale(0.2); } 100% { opacity: 1; transform: none; } }
@keyframes zh-dlg-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(0.25em); } }
/* A JANELA DE ESCOLHA: um quadro próprio pousado sobre a caixa, à direita — o formato de
   sempre. Ela não existe quando a fala tem uma saída só. */
#${ROOT_ID} .zh-dlg-choices {
  position: absolute; right: 0; bottom: calc(100% + 0.5em);
  pointer-events: auto; display: none;
  min-width: 14em; max-width: 100%;
  padding: 0.4em 0.45em;
  ${WOOD_PANEL}
  color: #d8d1c0;
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
#${ROOT_ID} .zh-dlg-opt.is-selected { ${PARCHMENT_ON} }
#${ROOT_ID} .zh-dlg-opt .zh-opt-num { opacity: 0.6; margin-right: 0.7em; }
/* No dedo, alvo tem tamanho de dedo: as escolhas ocupam a largura inteira da caixa e crescem
   até o mínimo confortável (~44px) — a mesma conversa, só com mais carne onde o toque acerta. */
@media (pointer: coarse) {
  #${ROOT_ID} .zh-dlg-choices { left: 0; right: 0; min-width: 0; }
  #${ROOT_ID} .zh-dlg-opt { padding: 0.7em 0.6em; min-height: 44px; display: flex; align-items: center; }
  #${ROOT_ID} .zh-dlg-next { font-size: 1.15em; right: 0.5em; bottom: 0.2em; }
}
/* Tela estreita (telefone em pé): o retrato encolhe para o texto não virar uma coluna de duas
   palavras. Ele não some — é ele que diz QUEM fala. */
@media (max-width: 560px) {
  #${ROOT_ID} .zh-dlg-panel { gap: 0.6em; padding: 0.6em 0.7em; }
  #${ROOT_ID} .zh-dlg-portrait { width: 2.7em; height: 2.7em; }
}
/* TELEFONE EM PÉ: o retrato sobe para a linha do nome e o texto ganha a largura inteira da caixa. */
#${ROOT_ID}.zh-tall .zh-dlg-panel {
  display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto minmax(0, 1fr);
  column-gap: 0.6em; row-gap: 0.45em; padding: 0.65em 0.8em;
}
#${ROOT_ID}.zh-tall .zh-dlg-col { display: contents; }
#${ROOT_ID}.zh-tall .zh-dlg-portrait { width: 3em; height: 3em; grid-row: 1; grid-column: 1; }
#${ROOT_ID}.zh-tall .zh-dlg-name { grid-row: 1; grid-column: 2; align-self: center; margin: 0; font-size: 1.15em; }
#${ROOT_ID}.zh-tall .zh-dlg-body { grid-row: 2; grid-column: 1 / -1; line-height: 1.38; }
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
  private readonly persona: VoicePersona;
  /** A fala em curso, letra a letra: quanto cada uma espera e qual solta sílaba. */
  private speech: SpokenChar[] = [];
  private chars: string[] = [];
  /** A peça de cada letra da fala; espaço não tem peça. */
  private letters: (HTMLSpanElement | null)[] = [];
  private readonly talk: TalkingBody;

  private currentIsNarrator = false;
  /** O texto e o "e agora?" da linha em curso — a fala pode ser do roteiro OU injetada pelo caixa. */
  private currentText = '';
  private currentOnDone?: () => void;

  /** O menu como dado, na ordem desenhada. Uma opção só = o ▼; duas ou mais = a janela. */
  private options: DialogOption[] = [];
  private optionEls: HTMLDivElement[] = [];
  /** Qual opção Enter/Espaço/Z escolhem — movida por ↑↓/WS, hover e toque. */
  private selected = 0;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly script: DialogScript,
    private readonly onClose: () => void,
    private readonly voice?: DialogVoice,
    speaker?: Billboard3D,
  ) {
    this.canvas = scene.game.canvas;
    this.persona = personaFor(script);
    this.talk = new TalkingBody(speaker);

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
    this.nameEl.textContent = this.script.npcName;

    this.layout();
    window.addEventListener('resize', this.layout);
    // A conversa para o `update` do mundo, mas a cena continua emitindo este evento: é ele que
    // move o corpo de quem fala, também na abertura, com a cutscene ativa.
    this.scene.events.on('update', this.animateTalk);
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
    this.scene.events.off('update', this.animateTalk);
    this.talk.restore();
    window.removeEventListener('resize', this.layout);
    window.removeEventListener('keydown', this.handleKeyDown, true);
    this.scrim.removeEventListener('click', this.handlePointer);
    this.panel.removeEventListener('click', this.handlePointer);
    this.root.remove();
  }

  /** A mola de quem fala, um passo por frame: o corpo no mundo e o retrato leem a mesma pose. */
  private readonly animateTalk = (_time: number, delta: number): void => {
    // O fechamento nasce num timer, DENTRO desta mesma emissão de `update`: sem a guarda, este
    // passo ainda rodaria depois do `restore` e deixaria o NPC torto para sempre.
    if (this.destroyed) return;
    this.talk.update(delta);
    const { stretch, lean } = this.talk;
    this.portraitEl.style.transform = `translateY(${(-Math.max(0, stretch) * PORTRAIT_LIFT_EM).toFixed(3)}em) `
      + `rotate(${(lean * PORTRAIT_TILT_DEG).toFixed(2)}deg) `
      + `scale(${(1 - stretch * 0.6).toFixed(3)}, ${(1 + stretch).toFixed(3)})`;
  };

  // ── Layout: a barra do rodapé, em pixels de viewport ───────────────────────
  private readonly layout = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    const { boxHeight, fontSize, margin } = dialogBoxMetrics(rect.width, rect.height);
    this.root.classList.toggle('zh-tall', isTallDialog(rect.width, rect.height));

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

    // A narração é a voz do jogo, e não de alguém: aparece no mesmo passo, em silêncio.
    const speaks = Boolean(this.voice) && !this.currentIsNarrator;
    this.speech = speaks ? planSpeech(line.text, this.persona, this.voice?.freq ?? 0) : [];
    this.chars = [...line.text];
    this.buildLetters();
    if (speaks && this.persona.radio) getSoundManager().playRadioClick(false);
    this.typeNextChar(CHAR_DELAY_MS);
  }

  /** Uma letra de cada vez: a espera muda com quem fala e com a pontuação da letra anterior. */
  private typeNextChar(delay: number): void {
    this.typewriterEvent = this.scene.time.delayedCall(delay, () => {
      this.charIndex++;
      this.revealLetter(this.charIndex - 1);
      const spoken = this.speech[this.charIndex - 1];
      if (spoken?.syllable) {
        getSoundManager().playDialogSyllable(spoken.syllable);
        this.talk.kick(this.persona, spoken.syllable.accent);
      }
      if (this.charIndex >= this.chars.length) {
        this.typewriterEvent = undefined;
        this.settleLine();
        return;
      }
      this.typeNextChar(spoken?.delayMs ?? CHAR_DELAY_MS);
    });
  }

  /** Monta a fala inteira, invisível: o lugar de cada letra já é o definitivo. */
  private buildLetters(): void {
    this.letters = [];
    const body = this.bodyEl;
    body.textContent = '';
    body.style.setProperty('--voice', this.script.npcColorHex);
    body.dataset.letters = this.persona.letters;
    const words = this.currentText.split(' ');
    let index = 0;
    words.forEach((word, position) => {
      const box = document.createElement('span');
      box.className = EMPHASIS.test(word.replace(/[^\p{L}]/gu, '')) ? 'zh-word zh-em' : 'zh-word';
      for (const char of word) {
        const letter = document.createElement('span');
        letter.className = 'zh-ch';
        letter.textContent = char;
        letter.style.setProperty('--i', String(index));
        box.appendChild(letter);
        this.letters.push(letter);
        index++;
      }
      body.appendChild(box);
      if (position < words.length - 1) {
        body.appendChild(document.createTextNode(' '));
        this.letters.push(null);
        index++;
      }
    });
  }

  private revealLetter(index: number): void {
    const letter = this.letters[index];
    if (!letter) return;
    letter.classList.add('zh-on');
    // A fala maior que a caixa rola para acompanhar a letra nova.
    const body = this.bodyEl;
    const bottom = letter.offsetTop + letter.offsetHeight;
    if (bottom > body.scrollTop + body.clientHeight) body.scrollTop = bottom - body.clientHeight;
  }

  private settleLine(): void {
    if (this.persona.radio && this.voice && !this.currentIsNarrator) getSoundManager().playRadioClick(true);
    this.finishLine();
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
    this.bodyEl.scrollTop = 0;
  }

  private finishLine(): void {
    this.isTyping = false;
    this.currentOnDone?.();
  }

  /** Uma fala do ROTEIRO terminou: continuar, ou fechar se era a última. */
  private scriptLineDone(): void {
    const isLast = this.lineIndex >= this.script.lines.length - 1;
    const next = (): void => this.showLine(this.lineIndex + 1);
    this.setOptions([{
      label: isLast ? t('dialog.close') : t('dialog.continue'),
      testId: isLast ? 'close' : 'continue',
      pick: isLast ? (): void => this.close() : next,
    }]);
  }

  // ── O menu: o ▼ do caso comum, a janela de escolha do resto ────────────────

  private clearOptions(): void {
    this.options = [];
    this.optionEls = [];
    this.selected = 0;
    this.choicesEl.innerHTML = '';
    this.choicesEl.classList.remove('zh-on');
    this.nextEl.style.display = 'none';
  }

  /** Uma escolha de verdade está na tela — e aí tocar a CAIXA não escolhe nada por engano. */
  private get choicesOpen(): boolean {
    return this.optionEls.length > 0;
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
    this.letters.forEach((letter) => letter?.classList.add('zh-on'));
    this.settleLine();
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
    } else if (/^Digit[1-9]$/u.test(event.code) && !this.isTyping) {
      const index = Number(event.code.slice(5)) - 1;
      if (this.options[index]) {
        event.preventDefault();
        this.options[index].pick();
      }
    } else if (event.code === 'Escape') {
      event.preventDefault();
      this.close();
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
