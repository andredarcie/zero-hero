import { t } from '@/game/i18n/i18n';
import { HAND_FONT, INK } from '@/game/runtime/uiStyle';

/**
 * O TECLADO DA PLACA, para quem escreve o nome do acampamento com o controle (runtime/gamepad: o controle não digita).
 * Uma grade de letras escrita à mão no próprio papel da placa (runtime/NameCard), com os acentos do português: o
 * direcional anda, o Z (o A do controle) escreve a letra, o Delete (o botão da esquerda) apaga, o Enter (o de cima)
 * escreve o nome na placa. A primeira letra sai maiúscula; o "Aa" troca a próxima. O mouse também aperta as teclas.
 */

const LETTERS: readonly (readonly string[])[] = [
  [...'ABCDEFGHIJ'],
  [...'KLMNOPQRST'],
  [...'UVWXYZÇÁÃÉ'],
  [...'ÂÊÍÓÔÕÚ\'-.'],
];
type Special = 'shift' | 'space' | 'erase' | 'done';
const SPECIALS: readonly Special[] = ['shift', 'space', 'erase', 'done'];

const CSS = `
.zh-padkb { margin: 10px auto 4px; display: grid; gap: 4px; font-family: ${HAND_FONT}; color: ${INK}; }
.zh-padkb-row { display: flex; justify-content: center; gap: 4px; }
.zh-padkb button {
  min-width: 1.9em; padding: 1px 4px; border: 2px solid transparent; border-radius: 4px; background: transparent;
  font-family: inherit; font-weight: 700; font-size: clamp(1.05rem, 3vw, 1.3rem); color: inherit; cursor: pointer;
}
.zh-padkb button.zh-wide { min-width: 4.6em; font-size: clamp(0.95rem, 2.6vw, 1.15rem); }
.zh-padkb button.is-on { border-color: ${INK}; background: rgba(40, 24, 13, 0.1); }
`;

export interface PadKeyboardHost {
  readonly input: HTMLInputElement;
  /** Escreve o nome na placa (o "escrever"). */
  write: () => void;
  /** Deixa a placa como estava. */
  close: () => void;
}

export class PadKeyboard {
  public readonly element: HTMLDivElement;
  private readonly buttons: HTMLButtonElement[][] = [];
  private row = 0;
  private col = 0;
  private upper: boolean;

  public constructor(private readonly host: PadKeyboardHost) {
    this.upper = host.input.value === '' || this.allSelected();
    this.element = document.createElement('div');
    this.element.className = 'zh-padkb';
    const style = document.createElement('style');
    style.textContent = CSS;
    this.element.appendChild(style);
    for (const letters of LETTERS) this.addRow(letters.map((ch) => ({ label: ch, act: () => this.type(ch) })));
    this.addRow(SPECIALS.map((kind) => ({ label: t(`home.sign.pad.${kind}`), act: () => this.special(kind), wide: true })));
    this.render();
  }

  /** Uma tecla do controle (já traduzida em tecla do jogo). Devolve se era dela. */
  public key(event: KeyboardEvent): boolean {
    switch (event.code) {
      case 'ArrowUp': this.move(0, -1); return true;
      case 'ArrowDown': this.move(0, 1); return true;
      case 'ArrowLeft': this.move(-1, 0); return true;
      case 'ArrowRight': this.move(1, 0); return true;
      case 'KeyZ': if (!event.repeat) this.buttons[this.row][this.col].click(); return true;
      case 'Delete': this.erase(); return true;
      case 'Enter': if (!event.repeat) this.host.write(); return true;
      case 'KeyX':
      case 'Escape': if (!event.repeat) this.host.close(); return true;
      default: return false;
    }
  }

  private addRow(keys: { label: string; act: () => void; wide?: boolean }[]): void {
    const rowEl = document.createElement('div');
    rowEl.className = 'zh-padkb-row';
    const row: HTMLButtonElement[] = [];
    const r = this.buttons.length;
    keys.forEach((k, c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.tabIndex = -1;
      b.textContent = k.label;
      if (k.wide) b.classList.add('zh-wide');
      b.addEventListener('click', () => { this.row = r; this.col = c; k.act(); this.render(); });
      // O botão não rouba o foco da linha (no computador, o teclado continua escrevendo nela).
      b.addEventListener('pointerdown', (e) => e.preventDefault());
      row.push(b);
      rowEl.appendChild(b);
    });
    this.buttons.push(row);
    this.element.appendChild(rowEl);
  }

  /** Andar pela grade: de lado dá a volta na fileira; para cima e para baixo cai na tecla mais perto na outra fileira. */
  private move(dx: number, dy: number): void {
    if (dy !== 0) {
      const from = this.buttons[this.row];
      const at = (this.col + 0.5) / from.length;
      this.row = (this.row + dy + this.buttons.length) % this.buttons.length;
      this.col = Math.min(this.buttons[this.row].length - 1, Math.floor(at * this.buttons[this.row].length));
    } else {
      const n = this.buttons[this.row].length;
      this.col = (this.col + dx + n) % n;
    }
    this.render();
  }

  private allSelected(): boolean {
    const i = this.host.input;
    return i.value.length > 0 && i.selectionStart === 0 && i.selectionEnd === i.value.length;
  }

  /** Escreve no fim da linha — ou no lugar do nome inteiro, se ele estava selecionado (como a placa abre). */
  private insert(text: string): void {
    const i = this.host.input;
    const base = this.allSelected() ? '' : i.value;
    i.value = (base + text).slice(0, i.maxLength > 0 ? i.maxLength : undefined);
    i.setSelectionRange(i.value.length, i.value.length);
  }

  private type(ch: string): void {
    this.insert(this.upper ? ch : ch.toLocaleLowerCase());
    if (/\p{L}/u.test(ch)) this.upper = false;
  }

  private erase(): void {
    const i = this.host.input;
    i.value = this.allSelected() ? '' : i.value.slice(0, -1);
    i.setSelectionRange(i.value.length, i.value.length);
    if (i.value === '') this.upper = true;
    this.render();
  }

  private special(kind: Special): void {
    if (kind === 'shift') this.upper = !this.upper;
    else if (kind === 'space') this.insert(' ');
    else if (kind === 'erase') this.erase();
    else this.host.write();
  }

  private render(): void {
    this.buttons.forEach((row, r) => row.forEach((b, c) => {
      b.classList.toggle('is-on', r === this.row && c === this.col);
      if (r < LETTERS.length) b.textContent = this.upper ? LETTERS[r][c] : LETTERS[r][c].toLocaleLowerCase();
    }));
  }
}
