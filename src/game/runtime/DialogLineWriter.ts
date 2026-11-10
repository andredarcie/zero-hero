// A FALA QUE ESTÁ SENDO ESCRITA: a máquina de escrever (letra a letra, com a voz e a boca do personagem), o pulo para
// o fim da linha, e as opções que aparecem quando ela termina. A caixa, o retrato e as teclas são do DialogOverlay.

import { isInstantText } from '@/game/runtime/accessibility';
import { markLineRead, wasLineRead } from '@/game/runtime/readLines';
import type { DialogLine } from '@/game/dialogs/NpcDialogs';
import { planSpeech, type SpokenChar } from '@/game/dialogs/voicePersonas';
import { getSoundManager } from '@/game/audio/SoundManager';
import { t } from '@/game/i18n/i18n';
import type { DialogOverlay } from './DialogOverlay';
import { MIN_VERSE_SCALE, isIndentedVerse, versePauseAfter } from './poemLayout';

const CHAR_DELAY_MS = 28;
/** Palavra em maiúsculas é o nome da coisa que importa (BALDE, TOCHA): ela entra com mais peso. */
const EMPHASIS = /^\p{Lu}{3,}$/u;
export type DialogOption = {
  label: string;
  /** data-opt — a identidade do botão para o playtest, nunca para lógica. */
  testId: string;
  pick: () => void;
};

/** O que DialogLineWriter usa de DialogOverlay. */
export type DialogLineWriterHost = Pick<DialogOverlay,
  'bodyEl' | 'choicesEl' | 'close' | 'isTyping' | 'nameEl' | 'nextEl' | 'optionEls' | 'options' | 'persona'
  | 'portraitEl' | 'scene' | 'script' | 'select' | 'selected' | 'talk' | 'typewriterEvent' | 'voice'
>;

export class DialogLineWriter {
  private lineIndex = 0;
  private charIndex = 0;
  /** A fala em curso, letra a letra: quanto cada uma espera e qual solta sílaba. */
  private speech: SpokenChar[] = [];
  private chars: string[] = [];
  /** A peça de cada letra da fala; espaço não tem peça. */
  private letters: (HTMLSpanElement | null)[] = [];
  private currentIsNarrator = false;
  /** O texto e o "e agora?" da linha em curso — a fala pode ser do roteiro OU injetada pelo caixa. */
  private currentText = '';
  private currentOnDone?: () => void;
  /** Quantos versos a caixa tem, e em qual a datilografia está (ver poemLayout.versePauseAfter). */
  private verseCount = 1;
  private verseRow = 0;
  /** O bloco dos versos: a largura do verso mais longo (ver fitVerses). */
  private stanzaEl?: HTMLDivElement;

  public constructor(private readonly host: DialogLineWriterHost) {}

  /** Datilografa uma fala (do roteiro ou injetada) e chama `onDone` quando ela assenta. */
  private typeLine(line: DialogLine, onDone: () => void): void {
    this.host.typewriterEvent?.remove();
    this.host.typewriterEvent = undefined;
    this.clearOptions();

    this.charIndex = 0;
    this.host.isTyping = true;
    this.currentIsNarrator = line.speaker === 'narrator';
    this.currentText = line.text;
    this.currentOnDone = onDone;
    this.verseCount = line.text.split('\n').length;
    this.verseRow = 0;
    this.showLineFrame(line);

    // A narração é a voz do jogo, e não de alguém: aparece no mesmo passo, em silêncio.
    const speaks = Boolean(this.host.voice) && !this.currentIsNarrator;
    this.speech = speaks ? planSpeech(line.text, this.host.persona, this.host.voice?.freq ?? 0) : [];
    this.chars = [...line.text];
    this.buildLetters();
    if (speaks && this.host.persona.radio) getSoundManager().ui.playRadioClick(false);
    // Fala já lida (runtime/readLines) aparece inteira: quem volta para relembrar não espera a datilografia.
    if (isInstantText() || wasLineRead(line.text)) { this.skipTypewriter(); return; }
    this.typeNextChar(CHAR_DELAY_MS);
  }

  /** Uma letra de cada vez: a espera muda com quem fala e com a pontuação da letra anterior. */
  private typeNextChar(delay: number): void {
    this.host.typewriterEvent = this.host.scene.time.delayedCall(delay, () => {
      this.charIndex++;
      this.revealLetter(this.charIndex - 1);
      const spoken = this.speech[this.charIndex - 1];
      if (spoken?.syllable) {
        getSoundManager().ui.playDialogSyllable(spoken.syllable);
        this.host.talk.kick(this.host.persona, spoken.syllable.accent);
      }
      if (this.charIndex >= this.chars.length) {
        this.host.typewriterEvent = undefined;
        this.settleLine();
        return;
      }
      let next = spoken?.delayMs ?? CHAR_DELAY_MS;
      // O FIM DO VERSO RESPIRA, com voz ou sem ela, e mais depois do verso que rima no meio da quadra: a rima cai.
      if (this.chars[this.charIndex - 1] === '\n') {
        next += versePauseAfter(this.verseCount, this.verseRow);
        this.verseRow++;
      }
      this.typeNextChar(next);
    });
  }

  /**
   * Monta a fala inteira, invisível: o lugar de cada letra já é o definitivo. O POEMA (runtime/poemLayout): cada verso
   * é uma linha própria, os que rimam numa quadra entram recuados, e o bloco tem a largura do verso mais longo.
   */
  private buildLetters(): void {
    this.letters = [];
    const body = this.host.bodyEl;
    body.textContent = '';
    body.style.setProperty('--voice', this.host.script.npcColorHex);
    body.dataset.letters = this.host.persona.letters;
    const stanza = document.createElement('div');
    stanza.className = 'zh-stanza';
    body.appendChild(stanza);
    this.stanzaEl = stanza;
    // A quebra entre versos, como o espaço, não é letra: só guarda o lugar, para a letra N continuar sendo o
    // caractere N da fala (a voz a conta assim).
    let index = 0;
    const verses = this.currentText.split('\n');
    verses.forEach((verse, row) => {
      if (row > 0) {
        this.letters.push(null);
        index++;
      }
      const line = document.createElement('div');
      line.className = isIndentedVerse(verses.length, row) ? 'zh-verse zh-rhyme' : 'zh-verse';
      stanza.appendChild(line);
      const words = verse.split(' ');
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
        line.appendChild(box);
        if (position < words.length - 1) {
          line.appendChild(document.createTextNode(' '));
          this.letters.push(null);
          index++;
        }
      });
    });
    this.fitVerses();
  }

  /**
   * A ESTROFE INTEIRA À VISTA, UM VERSO POR LINHA: se o verso mais longo não cabe na largura, ou os versos não cabem
   * na altura (o texto "Enorme"), a letra encolhe (até MIN_VERSE_SCALE); só se nem assim couber na largura, os versos
   * podem quebrar, e a sobra desce com recuo fundo (o CSS de `.zh-wrap`). Sem layout (o DOM dos testes) não mede nada.
   */
  private fitVerses(): void {
    const body = this.host.bodyEl;
    const stanza = this.stanzaEl;
    if (!stanza) return;
    stanza.style.fontSize = '';
    body.classList.remove('zh-wrap');
    const style = window.getComputedStyle(body);
    const roomW = body.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0');
    const roomH = body.clientHeight - parseFloat(style.paddingTop || '0') - parseFloat(style.paddingBottom || '0');
    if (roomW <= 0 || roomH <= 0) return;
    const scale = Math.min(1, roomW / stanza.scrollWidth, roomH / stanza.scrollHeight);
    if (scale >= 1) return;
    stanza.style.fontSize = `${Math.max(MIN_VERSE_SCALE, scale)}em`;
    if (stanza.scrollWidth > roomW + 1) body.classList.add('zh-wrap');
  }

  private revealLetter(index: number): void {
    const letter = this.letters[index];
    if (!letter) return;
    letter.classList.add('zh-on');
    // A fala maior que a caixa rola para acompanhar a letra nova.
    const body = this.host.bodyEl;
    const bottom = letter.offsetTop + letter.offsetHeight;
    if (bottom > body.scrollTop + body.clientHeight) body.scrollTop = bottom - body.clientHeight;
  }

  private settleLine(): void {
    if (this.host.persona.radio && this.host.voice && !this.currentIsNarrator) getSoundManager().ui.playRadioClick(true);
    this.finishLine();
  }

  public showLine(index: number): void {
    this.lineIndex = index;
    this.host.script.onLine?.(index);
    this.typeLine(this.host.script.lines[index], () => this.scriptLineDone());
  }

  /**
   * Veste a caixa para a fala que vai entrar: o NPC traz retrato e nome em caps na cor dele; a
   * narração é itálico apagado, sem atribuição e com a caixa inteira para si. UMA mensagem por
   * vez — o que estava escrito some aqui.
   */
  private showLineFrame(line: DialogLine): void {
    const isNarrator = line.speaker === 'narrator';
    this.host.portraitEl.style.display = isNarrator ? 'none' : '';
    this.host.nameEl.style.display = isNarrator ? 'none' : '';
    this.host.bodyEl.className = isNarrator ? 'zh-dlg-body zh-narr' : 'zh-dlg-body';
    this.host.bodyEl.scrollTop = 0;
  }

  private finishLine(): void {
    this.host.isTyping = false;
    markLineRead(this.currentText); // inteira na tela: da próxima vez ela aparece de uma vez
    this.currentOnDone?.();
  }

  /** Uma fala do ROTEIRO terminou: continuar, ou fechar se era a última. */
  private scriptLineDone(): void {
    const isLast = this.lineIndex >= this.host.script.lines.length - 1;
    const next = (): void => this.showLine(this.lineIndex + 1);
    this.setOptions([{
      label: isLast ? t('dialog.close') : t('dialog.continue'),
      testId: isLast ? 'close' : 'continue',
      pick: isLast ? (): void => this.host.close() : next,
    }]);
  }

  private clearOptions(): void {
    this.host.options = [];
    this.host.optionEls = [];
    this.host.selected = 0;
    this.host.choicesEl.innerHTML = '';
    this.host.choicesEl.classList.remove('zh-on');
    this.host.nextEl.style.display = 'none';
  }

  private setOptions(list: DialogOption[]): void {
    this.clearOptions();
    // Saída única: nada de menu de um item só. O ▼ diz "tem mais" e o gesto é a caixa inteira.
    if (list.length === 1) {
      this.host.options = list;
      this.host.nextEl.dataset.opt = list[0].testId;
      this.host.nextEl.title = list[0].label;
      this.host.nextEl.style.display = '';
      return;
    }
    list.forEach((option, index) => this.appendOption(option, index + 1));
    this.host.choicesEl.classList.add('zh-on');
  }

  private appendOption(option: DialogOption, number: number): void {
    const index = this.host.options.length;
    this.host.options.push(option);
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
    el.addEventListener('mouseenter', () => this.host.select(index));
    this.host.optionEls.push(el);
    this.host.choicesEl.appendChild(el);
    this.host.select(this.host.selected);
  }

  public skipTypewriter(): void {
    this.host.typewriterEvent?.remove();
    this.host.typewriterEvent = undefined;
    this.letters.forEach((letter) => letter?.classList.add('zh-on'));
    this.settleLine();
  }
}
