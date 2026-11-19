// A COLUNA DE QUEM ESCREVE, à direita do editor de falas (editor/DialogEditor):
//  · COMO FICA NO JOGO: a caixa em que o escritor está, desenhada como a caixa de fala do jogo (a tábua, a letra de
//    livro, o retrato e o nome na cor do personagem, os versos que rimam recuados, o nome da coisa em dourado, a
//    narração em itálico sem retrato), com ◀ ▶ para andar pela conversa como o jogador anda, e "Ler em voz alta" — o
//    primeiro critério do padrão de escrita é a fala lida uma vez em voz alta;
//  · A FICHA do personagem: a escola, a ideia dela e a voz (o que a fala tem de caber);
//  · O GUIA de escrita (docs/escrita-em-verso.md, a conferência de cada estrofe).

import { EMPHASIS, isIndentedVerse } from '@/game/runtime/poemLayout';
import { BOOK_FONT } from '@/game/runtime/uiStyle';
import { bodyOf, isNarrated, type Character, type DialogLang, type Fala } from './dialogDraft';
import { falaTitle } from './falaTitles';

/** Quem fala na prévia: o nome, a cor e o retrato (vazio sem retrato). */
export interface SpeakerLook {
  name: string;
  color: string;
  portrait: string;
}

const GUIDE: readonly string[] = [
  'Lida UMA vez em voz alta, dá para entender?',
  'A frase está na ordem direta (como se fala)?',
  'Toda palavra é do dia a dia?',
  'Cada par de versos é uma frase inteira?',
  'A rima soa como rima? (é aberto não rima com ê; ó não rima com ô)',
  'A escola do personagem aparece como conselho prático, preso à vida dele?',
  'Se é missão: diz para onde ir, o quê e quantos?',
];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

/** A voz do navegador para ler em voz alta (sem ela, o botão não aparece). */
const speech = (): SpeechSynthesis | null => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null);

export class DialogEditorSide {
  public readonly el: HTMLElement;
  private readonly stage: HTMLDivElement;
  private readonly navText: HTMLSpanElement;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly fichaEl: HTMLElement;
  private current: { fala: Fala; index: number; lang: DialogLang; look: SpeakerLook } | null = null;

  public constructor() {
    this.el = el('aside', 'zh-side');
    const prev = el('section', 'zh-prev');
    prev.appendChild(el('h4', '', 'Como fica no jogo'));
    this.stage = el('div', 'zh-prev-stage');
    this.stage.style.fontFamily = BOOK_FONT;
    const nav = el('div', 'zh-prev-nav');
    this.prevBtn = el('button', 'zh-btn', '◀');
    this.prevBtn.title = 'A caixa anterior desta conversa';
    this.nextBtn = el('button', 'zh-btn', '▶');
    this.nextBtn.title = 'A próxima caixa desta conversa';
    this.navText = el('span', 'zh-prev-pos');
    this.prevBtn.addEventListener('click', () => this.step(-1));
    this.nextBtn.addEventListener('click', () => this.step(1));
    nav.append(this.prevBtn, this.navText, this.nextBtn);
    const synth = speech();
    if (synth) {
      const read = el('button', 'zh-btn zh-read', '🔊 Ler em voz alta');
      read.title = 'O navegador lê a caixa: o ouvido acha a rima que não fecha e a frase torta';
      read.addEventListener('click', () => this.readAloud(synth));
      nav.appendChild(read);
    }
    prev.append(this.stage, nav);
    this.fichaEl = el('section', 'zh-ficha');
    const guide = el('details', 'zh-guia');
    guide.open = true;
    guide.appendChild(el('summary', '', 'Guia de escrita'));
    const list = el('ul');
    for (const item of GUIDE) list.appendChild(el('li', '', item));
    guide.append(list, el('p', 'zh-guia-src', 'docs/escrita-em-verso.md — quando a rima e a clareza brigam, troca-se a rima.'));
    this.el.append(prev, this.fichaEl, guide);
    this.render();
  }

  /** A ficha do personagem escolhido. */
  public showCharacter(c: Character | undefined): void {
    this.fichaEl.replaceChildren();
    if (!c) return;
    this.fichaEl.appendChild(el('h4', '', c.name ? `Ficha de ${c.name}` : 'Ficha'));
    const dl = el('dl');
    const row = (term: string, text: string): void => {
      if (!text) return;
      dl.append(el('dt', '', term), el('dd', '', text));
    };
    row('Escola', c.school);
    row('Ideia', c.idea);
    row('Voz', c.voice);
    if (!dl.childElementCount) dl.appendChild(el('dd', '', 'Sem ficha: a fala é da voz do jogo.'));
    this.fichaEl.appendChild(dl);
  }

  /** A prévia vai para esta caixa (e fica nela enquanto se escreve). */
  public preview(fala: Fala, index: number, lang: DialogLang, look: SpeakerLook): void {
    this.current = { fala, index: Math.min(index, fala.pt.length - 1), lang, look };
    this.render();
  }

  /** O texto mudou: a prévia redesenha a caixa em que está. */
  public refresh(): void {
    if (this.current && this.current.index >= this.current.fala.pt.length) this.current.index = this.current.fala.pt.length - 1;
    this.render();
  }

  /** O que a prévia mostra (a janela do teste). */
  public get state(): { fala: string | null; index: number; lang: DialogLang | null; text: string } {
    const c = this.current;
    return { fala: c ? c.fala.path.join('.') : null, index: c?.index ?? -1, lang: c?.lang ?? null, text: this.stage.textContent ?? '' };
  }

  private step(dir: -1 | 1): void {
    const c = this.current;
    if (!c) return;
    c.index = Math.max(0, Math.min(c.fala.pt.length - 1, c.index + dir));
    this.render();
  }

  private render(): void {
    this.stage.replaceChildren();
    const c = this.current;
    this.prevBtn.disabled = !c || c.index <= 0;
    this.nextBtn.disabled = !c || c.index >= c.fala.pt.length - 1;
    if (!c || c.fala.kind === 'name') {
      this.navText.textContent = '';
      this.stage.appendChild(el('p', 'zh-prev-empty', 'Clique numa caixa para ver como ela aparece no jogo.'));
      return;
    }
    this.navText.textContent = `${falaTitle(c.fala.path.join('.')).title} — caixa ${c.index + 1} de ${c.fala.pt.length}`;
    const text = (c.lang === 'pt-br' ? c.fala.pt : c.fala.en)[c.index] ?? '';
    const narrated = isNarrated(text);
    const box = el('div', narrated ? 'zh-prev-box zh-narr' : 'zh-prev-box');
    if (!narrated && c.look.portrait) {
      const img = el('img', 'zh-prev-portrait');
      img.src = c.look.portrait;
      img.alt = '';
      img.style.borderColor = c.look.color;
      box.appendChild(img);
    }
    const colEl = el('div', 'zh-prev-col');
    if (!narrated && c.look.name) {
      const name = el('div', 'zh-prev-name', c.look.name);
      name.style.color = c.look.color;
      colEl.appendChild(name);
    }
    const verses = bodyOf(text).split('\n');
    verses.forEach((verse, row) => {
      const line = el('div', isIndentedVerse(verses.length, row) ? 'zh-prev-verse zh-rhyme' : 'zh-prev-verse');
      verse.split(' ').forEach((word, k) => {
        if (k > 0) line.appendChild(document.createTextNode(' '));
        if (EMPHASIS.test(word.replace(/[^\p{L}]/gu, ''))) line.appendChild(el('span', 'zh-prev-em', word));
        else line.appendChild(document.createTextNode(word));
      });
      colEl.appendChild(line);
    });
    box.append(colEl, el('span', 'zh-prev-next', '▼'));
    this.stage.appendChild(box);
    // Como no jogo (DialogLineWriter.fitVerses): o verso não quebra — a letra encolhe até caber (até 70%).
    const over = colEl.clientWidth > 0 ? colEl.scrollWidth / colEl.clientWidth : 1;
    if (over > 1) colEl.style.fontSize = `${Math.max(0.7, 1 / over).toFixed(3)}em`;
  }

  private readAloud(synth: SpeechSynthesis): void {
    const c = this.current;
    if (!c) return;
    const text = bodyOf((c.lang === 'pt-br' ? c.fala.pt : c.fala.en)[c.index] ?? '');
    // O fim do verso respira: o verso sem pontuação ganha uma vírgula, para a voz parar ali.
    const said = text.split('\n').map((v) => (/[.,;:!?…]$/u.test(v.trim()) ? v : `${v},`)).join(' ');
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(said);
    utter.lang = c.lang === 'pt-br' ? 'pt-BR' : 'en-US';
    utter.rate = 0.92;
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(c.lang === 'pt-br' ? 'pt' : 'en'));
    if (voice) utter.voice = voice;
    synth.speak(utter);
  }
}
