// O PAINEL DAS CONVERSAS do editor de falas (editor/DialogEditor): as falas de um personagem (ou as que a busca
// achou), cada uma com o TÍTULO e QUANDO o jogador a vê (editor/falaTitles) — o caminho do código fica pequeno, no
// canto, para quem programa —, e as caixas dela (editor/DialogEditorBox). O nome do personagem é uma linha só.

import type { VerseRule } from '@/game/i18n/verseCheck';
import { boxProblems, renderBox, type BoxCallbacks, type BoxLook } from './DialogEditorBox';
import { falaKey, type Character, type DialogLang, type Fala } from './dialogDraft';
import { falaTitle } from './falaTitles';

export { OUT_OF_GAME, boxProblems } from './DialogEditorBox';

/** Quantas caixas deste personagem têm aviso. */
export const characterWarnings = (c: Character, rule: VerseRule): number =>
  c.falas.reduce((n, f) => n + f.pt.filter((_, i) => boxProblems(f, i, rule).length > 0).length, 0);

/** Esta fala tem alguma caixa com aviso? */
export const falaWarns = (f: Fala, rule: VerseRule): boolean => f.pt.some((_, i) => boxProblems(f, i, rule).length > 0);

export interface FalasCallbacks extends BoxCallbacks {
  /** Quem fala nas caixas deste personagem: o nome e o retrato. */
  look: (c: Character) => Omit<BoxLook, 'english'>;
}

export interface FalasOptions {
  /** O nome do personagem em cima de cada grupo (a busca mostra vários). */
  titled: boolean;
  english: boolean;
  /** O que dizer quando não há nada a mostrar. */
  empty: string;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

export class DialogEditorFalas {
  public readonly el: HTMLDivElement;

  public constructor(private readonly cb: FalasCallbacks) {
    this.el = el('div', 'zh-falas-body');
  }

  /** Desenha os grupos (um personagem, ou cada personagem que a busca achou). */
  public show(groups: ReadonlyArray<{ character: Character; falas: readonly Fala[] }>, opts: FalasOptions): void {
    this.el.replaceChildren();
    if (groups.every((g) => g.falas.length === 0)) {
      this.el.appendChild(el('p', 'zh-falas-empty', opts.empty));
      return;
    }
    for (const g of groups) {
      if (opts.titled) this.el.appendChild(el('h3', 'zh-falas-group', g.character.name || g.character.id));
      const look: BoxLook = { ...this.cb.look(g.character), english: opts.english };
      for (const f of g.falas) this.el.appendChild(this.renderFala(f, look));
    }
  }

  /** Leva a caixa à vista e põe o cursor nela (a prévia e o desfazer apontam para ela). */
  public reveal(f: Fala, i: number, lang: DialogLang): void {
    const section = [...this.el.querySelectorAll<HTMLElement>('.zh-fala')]
      .find((s) => s.dataset.fala === falaKey(f) && s.dataset.section === f.section);
    const box = section?.querySelector(`.zh-box[data-box="${i}"]`);
    box?.scrollIntoView?.({ block: 'nearest' });
    box?.querySelector<HTMLTextAreaElement>(`textarea[data-lang="${lang}"]`)?.focus({ preventScroll: true });
  }

  private renderFala(f: Fala, look: BoxLook): HTMLElement {
    const box = el('section', 'zh-fala');
    box.dataset.fala = falaKey(f);
    box.dataset.section = f.section;
    const { title, when, unused } = falaTitle(falaKey(f));
    const head = el('header', 'zh-fala-head');
    const text = el('div', 'zh-fala-text');
    const h = el('h4', '', title);
    if (unused) h.appendChild(el('span', 'zh-fala-unused', 'não aparece no jogo hoje'));
    if (unused) box.classList.add('is-unused');
    text.appendChild(h);
    if (when) text.appendChild(el('p', 'zh-fala-when', when));
    const code = el('code', 'zh-fala-code', falaKey(f));
    code.title = 'O caminho desta fala no código (src/game/i18n/dialogos)';
    head.append(text, code);
    box.appendChild(head);
    if (f.kind === 'name') {
      box.appendChild(this.renderName(f, look.english));
      return box;
    }
    f.pt.forEach((_, i) => box.appendChild(renderBox(f, i, look, this.cb)));
    if (f.kind === 'boxes') {
      const add = el('button', 'zh-btn zh-fala-add', '+ Nova caixa no fim');
      add.type = 'button';
      add.addEventListener('click', () => this.cb.structure(f, 'pôr uma caixa', () => {
        f.pt.push('');
        f.en.push('');
      }));
      box.appendChild(add);
    }
    return box;
  }

  private renderName(f: Fala, english: boolean): HTMLElement {
    const row = el('div', 'zh-name-row');
    for (const lang of (english ? ['pt-br', 'en'] : ['pt-br']) as DialogLang[]) {
      const label = el('label', 'zh-name-col');
      label.appendChild(el('span', 'zh-box-lang', lang === 'pt-br' ? 'Português' : 'Inglês'));
      const input = el('input');
      input.type = 'text';
      input.value = (lang === 'pt-br' ? f.pt : f.en)[0];
      input.addEventListener('input', () => {
        (lang === 'pt-br' ? f.pt : f.en)[0] = input.value;
        this.cb.changed();
      });
      label.appendChild(input);
      row.appendChild(label);
    }
    return row;
  }
}
