import { HAND_FONT, INK, INK_RED, PAPER_SURFACE, SOFT_BLUR, paperTexture } from '@/game/runtime/uiStyle';

/**
 * O CADERNO DE CAMPO, ABERTO (pedido do autor, 2026-11-11; a lista mora em runtime/notebook). É o que o herói ESCREVE
 * e GUARDA, então é papel e pena (uiStyle): duas folhas sobre a capa de couro, a costura escurecendo o meio. Na folha
 * da esquerda, a lista por seção; na da direita, a página da coisa escolhida: o desenho grande, o nome e as notas.
 * O que ainda não foi achado é só o vulto em tinta, sem nome e sem nota.
 *
 * Congela o mundo como o catálogo da bancada (FrameTick, ActionInput.canAct). As setas folheiam (esquerda e direita
 * pulam de seção); X, Z ou Esc fecham. No dedo, tocar uma linha abre a página, e o rodapé fecha o caderno.
 */

export interface NotebookPage {
  kind: string;
  /** A seção, já no idioma: a lista põe um título a cada troca. */
  section: string;
  known: boolean;
  /** A arte pequena da lista e a grande da página (data URLs do motor 2D). */
  icon: string;
  art: string;
  name: string;
  /** Só os cogumelos: o nome científico e se se come. */
  latin?: string;
  edibility?: { label: string; poison: boolean };
  text: string[];
  notes?: string[];
}

export interface NotebookView {
  title: string;
  /** "12 de 29": quanto da coleção já está no caderno. */
  count: string;
  pages: NotebookPage[];
  foot: string;
  unknownName: string;
  unknownText: string;
}

export interface NotebookCallbacks {
  view: NotebookView;
  /** A página virou (o som da folha mora na cena). */
  onTurn?: () => void;
  onClose: () => void;
}

const STYLE_ID = 'zh-book-style';

/** A dobra do meio: as duas folhas escurecem perto da costura. */
const FOLD = 'rgba(60, 36, 16, 0.55)';

const CSS = `
.zh-book-backdrop {
  position: fixed; inset: 0; z-index: 60;
  display: flex; align-items: center; justify-content: center;
  ${SOFT_BLUR}
  opacity: 0; transition: opacity 200ms ease; padding: 1rem;
}
.zh-book-backdrop.zh-in { opacity: 1; }
/* A CAPA: couro gasto com um filete de costura, e o caderno aberto em cima, um tico torto na mesa. */
.zh-book {
  display: grid; grid-template-columns: minmax(220px, 300px) minmax(260px, 400px);
  height: min(560px, calc(100vh - 2rem)); max-width: 100%;
  padding: 10px;
  background: #5a3220 linear-gradient(160deg, rgba(255, 220, 170, 0.08), rgba(0, 0, 0, 0.25));
  border-radius: 6px;
  box-shadow: inset 0 0 0 2px #3a1f12, inset 0 0 0 4px rgba(214, 170, 110, 0.22), 0 10px 30px rgba(0, 0, 0, 0.6);
  transform: translateY(14px) rotate(-0.6deg) scale(0.98);
  transition: transform 260ms cubic-bezier(0.2, 0.9, 0.3, 1.15);
}
.zh-book-backdrop.zh-in .zh-book { transform: rotate(-0.6deg); }
.zh-book-page {
  position: relative; min-height: 0; display: flex; flex-direction: column;
  ${PAPER_SURFACE}
  padding: 14px 16px 10px;
}
.zh-book-left { box-shadow: inset -18px 0 18px -14px ${FOLD}; border-radius: 3px 0 0 3px; }
.zh-book-right { box-shadow: inset 18px 0 18px -14px ${FOLD}; border-radius: 0 3px 3px 0; padding-left: 22px; }
.zh-book-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.zh-book-title { margin: 0; font-size: 1.7rem; line-height: 1.1; font-weight: 700; }
.zh-book-count { margin: 0; font-size: 1.1rem; opacity: 0.75; white-space: nowrap; }
.zh-book-list {
  flex: 1; min-height: 0; overflow-y: auto; padding-right: 4px;
  scrollbar-width: thin; scrollbar-color: rgba(60, 36, 16, 0.4) transparent;
}
/* Os títulos das seções em tinta vermelha, como num caderno de campo. */
.zh-book-section {
  margin: 10px 0 2px; font-size: 1.2rem; font-weight: 700; color: ${INK_RED};
  border-bottom: 1px solid rgba(60, 36, 16, 0.25);
}
.zh-book-row {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 1px 6px; border: 0; border-radius: 2px; background: transparent;
  font-family: ${HAND_FONT}; font-weight: 600; font-size: 1.2rem; color: ${INK}; text-align: left;
  cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
.zh-book-row:hover { background: rgba(122, 82, 40, 0.08); }
/* A linha que está sendo lida: uma mancha de lápis por baixo. */
.zh-book-row.zh-at { background: rgba(122, 82, 40, 0.2); }
.zh-book-row img { width: 32px; height: 32px; object-fit: contain; image-rendering: pixelated; flex: none; }
.zh-book-row.zh-unknown span { opacity: 0.45; }
/* O QUE AINDA NÃO FOI ACHADO: só o vulto, em tinta. */
.zh-unknown img { filter: brightness(0); opacity: 0.5; }
.zh-book-foot {
  margin: 6px 0 0; padding: 0; border: 0; background: transparent;
  font-family: ${HAND_FONT}; font-weight: 600; font-size: 1rem; color: ${INK}; opacity: 0.65; text-align: center;
}
button.zh-book-foot { cursor: pointer; opacity: 0.85; text-decoration: underline; text-underline-offset: 3px; }
.zh-book-detail {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; align-items: center; text-align: center;
}
.zh-book-detail.zh-turn { animation: zh-book-turn 220ms ease; }
@keyframes zh-book-turn { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .zh-book-detail.zh-turn { animation: none; } }
/* O DESENHO: a arte do jogo, grande e em pixel, num quadro riscado a pena. */
.zh-book-art {
  flex: none; width: 128px; height: 128px; margin: 6px auto 8px; display: grid; place-items: center;
  outline: 1.5px dashed rgba(60, 36, 16, 0.4); outline-offset: -4px; border-radius: 2px;
  background: rgba(255, 248, 230, 0.25);
}
.zh-book-art img { width: 96px; height: 96px; object-fit: contain; image-rendering: pixelated; }
.zh-book-name { margin: 0; font-size: 1.8rem; line-height: 1.05; font-weight: 700; }
.zh-book-latin {
  margin: 2px 0 0; font-size: 1.15rem; font-style: italic;
  text-decoration: underline wavy rgba(60, 36, 16, 0.45); text-underline-offset: 4px;
}
.zh-book-edible { margin: 4px 0 0; font-size: 1.15rem; }
.zh-book-edible.zh-poison { color: ${INK_RED}; }
.zh-book-text { margin: 8px 0 0; font-size: 1.25rem; line-height: 1.25; max-width: 30ch; }
.zh-book-text.zh-faint { opacity: 0.55; }
.zh-book-notes { margin: 8px 0 0; padding: 0; list-style: none; font-size: 1.15rem; line-height: 1.2; max-width: 30ch; text-align: left; }
.zh-book-notes li { margin: 3px 0; }
/* No celular em pé, as duas folhas uma em cima da outra: a lista em cima, a página embaixo. */
@media (max-width: 640px) {
  .zh-book { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(0, 1.15fr); width: 100%; height: calc(100vh - 2rem); }
  .zh-book-left { box-shadow: inset 0 -18px 18px -14px ${FOLD}; border-radius: 3px 3px 0 0; }
  .zh-book-right { box-shadow: inset 0 18px 18px -14px ${FOLD}; border-radius: 0 0 3px 3px; padding-left: 16px; }
  .zh-book-art { width: 96px; height: 96px; }
  .zh-book-art img { width: 72px; height: 72px; }
}
`;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

const img = (src: string, alt: string): HTMLImageElement => {
  const node = document.createElement('img');
  node.src = src;
  node.alt = alt;
  return node;
};

const CLOSE_KEYS: ReadonlySet<string> = new Set(['escape', 'x', 'k', 'i', 'z', 'j', 'enter', ' ']);
/** O Z que abriu o caderno não pode fechá-lo: as teclas de fechar só valem depois deste respiro. */
const OPEN_GRACE_MS = 250;

export class NotebookOverlay {
  private readonly root: HTMLDivElement;
  private readonly rows: HTMLButtonElement[] = [];
  private readonly detail: HTMLDivElement;
  private readonly openedAt = performance.now();
  private cursor = 0;
  private closed = false;

  public constructor(private readonly cb: NotebookCallbacks, touch: boolean) {
    ensureStyle();
    const { view } = cb;
    this.root = el('div', 'zh-book-backdrop');
    // Ver ActionButtons: sem esta marca, tocar numa linha também plantaria a âncora do arrasto no mundo.
    this.root.setAttribute('data-zh-ui', '');
    const book = el('section', 'zh-book');
    book.setAttribute('role', 'dialog');
    book.setAttribute('aria-modal', 'true');
    book.setAttribute('aria-label', view.title);

    const left = this.sheet('zh-book-left');
    const head = el('header', 'zh-book-head');
    head.append(el('h2', 'zh-book-title', view.title), el('p', 'zh-book-count', view.count));
    const list = el('div', 'zh-book-list');
    let section = '';
    view.pages.forEach((page, i) => {
      if (page.section !== section) {
        section = page.section;
        list.appendChild(el('h3', 'zh-book-section', section));
      }
      list.appendChild(this.row(page, i));
    });
    // No dedo o rodapé é o jeito de fechar (fora do caderno sobra pouca tela num celular em pé).
    const foot = touch ? el('button', 'zh-book-foot', view.foot) : el('p', 'zh-book-foot', view.foot);
    if (foot instanceof HTMLButtonElement) {
      foot.type = 'button';
      foot.addEventListener('click', () => this.close());
    }
    left.append(head, list, foot);

    const right = this.sheet('zh-book-right');
    this.detail = el('div', 'zh-book-detail');
    right.appendChild(this.detail);
    book.append(left, right);
    this.root.appendChild(book);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.handleKey, true);

    // Abre na primeira coisa já achada: a página em branco de um vulto não é o melhor jeito de começar.
    this.cursor = Math.max(0, view.pages.findIndex((p) => p.known));
    this.show(false);
    requestAnimationFrame(() => { if (!this.closed) this.root.classList.add('zh-in'); });
  }

  /** O índice da página aberta (a janela dos playtests). */
  public get at(): number {
    return this.cursor;
  }

  private sheet(cls: string): HTMLDivElement {
    const page = el('div', `zh-book-page ${cls}`);
    const paper = paperTexture();
    if (paper) page.style.backgroundImage = `url(${paper})`;
    return page;
  }

  private row(page: NotebookPage, index: number): HTMLButtonElement {
    const row = el('button', `zh-book-row${page.known ? '' : ' zh-unknown'}`);
    row.type = 'button';
    row.dataset.kind = page.kind;
    const name = page.known ? page.name : this.cb.view.unknownName;
    row.append(img(page.icon, name), el('span', '', name));
    row.addEventListener('click', () => this.go(index));
    this.rows.push(row);
    return row;
  }

  /** Folhear até a página `index` (se é outra, a folha vira). */
  public go(index: number): void {
    const to = Math.max(0, Math.min(this.rows.length - 1, index));
    if (to === this.cursor) return;
    this.cursor = to;
    this.show(true);
  }

  private show(turned: boolean): void {
    this.rows.forEach((row, i) => row.classList.toggle('zh-at', i === this.cursor));
    this.rows[this.cursor]?.scrollIntoView({ block: 'nearest' });
    this.writePage(this.cb.view.pages[this.cursor]);
    if (!turned) return;
    this.detail.classList.remove('zh-turn');
    void this.detail.offsetWidth; // reinicia a animação da folha
    this.detail.classList.add('zh-turn');
    this.cb.onTurn?.();
  }

  /** A FOLHA DA DIREITA: o desenho, o nome e as notas; de um vulto, só o vulto. */
  private writePage(page: NotebookPage | undefined): void {
    this.detail.replaceChildren();
    if (!page) return;
    const { unknownName, unknownText } = this.cb.view;
    const art = el('div', `zh-book-art${page.known ? '' : ' zh-unknown'}`);
    art.appendChild(img(page.art, page.known ? page.name : unknownName));
    this.detail.append(art, el('h2', 'zh-book-name', page.known ? page.name : unknownName));
    if (!page.known) {
      this.detail.appendChild(el('p', 'zh-book-text zh-faint', unknownText));
      return;
    }
    if (page.latin) this.detail.appendChild(el('p', 'zh-book-latin', page.latin));
    if (page.edibility) {
      this.detail.appendChild(el('p', `zh-book-edible${page.edibility.poison ? ' zh-poison' : ''}`, page.edibility.label));
    }
    for (const line of page.text) this.detail.appendChild(el('p', 'zh-book-text', line));
    if (page.notes?.length) {
      const notes = el('ul', 'zh-book-notes');
      for (const note of page.notes) notes.appendChild(el('li', '', `~ ${note}`));
      this.detail.appendChild(notes);
    }
  }

  /** O começo da próxima seção (`dir` 1), ou o da seção atual e depois o da anterior (`dir` -1). */
  private sectionStart(index: number, dir: -1 | 1): number {
    const pages = this.cb.view.pages;
    const starts = pages.map((_, i) => i).filter((i) => i === 0 || pages[i].section !== pages[i - 1].section);
    const mine = starts.filter((s) => s <= index).pop() ?? 0;
    if (dir > 0) return starts.find((s) => s > index) ?? index;
    return mine < index ? mine : (starts.filter((s) => s < mine).pop() ?? 0);
  }

  private readonly handleKey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    // Nada do que se aperta com o caderno aberto chega ao jogo.
    event.stopPropagation();
    const key = event.key.toLowerCase();
    if (CLOSE_KEYS.has(key)) {
      event.preventDefault();
      if (!event.repeat && performance.now() - this.openedAt > OPEN_GRACE_MS) this.close();
      return;
    }
    const to = (index: number): void => { event.preventDefault(); this.go(index); };
    if (key === 'arrowdown' || key === 's') to(this.cursor + 1);
    else if (key === 'arrowup' || key === 'w') to(this.cursor - 1);
    else if (key === 'arrowright' || key === 'd' || key === 'pagedown') to(this.sectionStart(this.cursor, 1));
    else if (key === 'arrowleft' || key === 'a' || key === 'pageup') to(this.sectionStart(this.cursor, -1));
    else if (key === 'home') to(0);
    else if (key === 'end') to(this.rows.length - 1);
  };

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    window.removeEventListener('keydown', this.handleKey, true);
    this.root.classList.remove('zh-in');
    window.setTimeout(() => this.root.remove(), 200);
    this.cb.onClose();
  }

  /** Fecha SEM avisar a cena: a saída de emergência do desmonte. */
  public destroy(): void {
    this.closed = true;
    window.removeEventListener('keydown', this.handleKey, true);
    this.root.remove();
  }
}
