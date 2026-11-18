import { withKeyNames } from '@/game/runtime/accessibility';
import { renderCards, renderTop, type BuildCardView } from '@/game/runtime/buildCards';
import type { GridCellState } from '@/game/runtime/homeGrid';
import { HAND_FONT, INK, PAPER_SURFACE, WOOD_PANEL, paperTexture } from '@/game/runtime/uiStyle';

export type { BuildCardView } from '@/game/runtime/buildCards';

/** Um tile da grade, como a tela o conhece. */
export interface BuildCellView {
  x: number;
  y: number;
  state: GridCellState;
}

/**
 * O MODO DE CONSTRUÇÃO, na tela (scenes/game/BuildMode; pedido do autor, 2026-11-17): o jogo parado, a grade no chão
 * do acampamento — VERDE onde dá para pôr, VERMELHO onde não dá; desenhada NO MUNDO, por quem abriu (`paint`, ver
 * scenes/game/BuildGridView) — e embaixo a tábua com as cartas do que dá para pôr (runtime/buildCards). Escolhe-se uma
 * carta e depois um tile verde: com o dedo, com o mouse, ou com as setas e o Z. Uma peça já posta, clicada (ou
 * apontada com as setas e o Z), sobe para mudar de lugar — e, levantada, se DESMONTA (o botão, ou Delete): cada peça
 * existe uma vez só, e a desmontada volta para as cartas (objects/homeBuilds).
 *
 * É só a tela: a grade, as cartas e o que cada gesto quer dizer vêm de quem a abriu (`BuildCallbacks`). Por cima do
 * mundo fica só uma película transparente que recebe o toque e o mouse.
 */
const ROOT_ID = 'zh-build';
/** A tecla que abriu a bancada não pode já escolher uma carta. */
const OPEN_GRACE_MS = 250;
const PICK_KEYS: ReadonlySet<string> = new Set(['z', 'j', ' ', 'enter']);
const BACK_KEYS: ReadonlySet<string> = new Set(['escape', 'x', 'k']);
const SCRAP_KEYS: ReadonlySet<string> = new Set(['delete', 'backspace']);

export interface BuildView {
  title: string;
  stock: ReadonlyArray<{ icon: string; label: string; count: number }>;
  cards: readonly BuildCardView[];
  cells: readonly BuildCellView[];
  /** O desenho da peça na mão (a carta escolhida, ou a peça levantada), para a prévia no tile. */
  holding: { kind: string; icon: string } | null;
  texts: { choose: string; place: string; move: string; empty: string; gift: string; scrap: string; back: string; done: string };
}

export interface BuildCallbacks {
  read: () => BuildView;
  /** O tile debaixo de um ponto da tela, ou null. */
  tileAt: (px: number, py: number) => { x: number; y: number } | null;
  /** Desenha a grade no mundo: os tiles, o apontado e a peça na mão (o tipo dela), ou nenhuma. */
  paint: (cells: readonly BuildCellView[], tile: { x: number; y: number } | null, holding: string | null) => void;
  /** Escolher esta carta (pagar ainda não: só quando a peça cai no chão). Devolve se dá. */
  pick: (kind: string) => boolean;
  /** Levantar a peça deste tile para mudar de lugar. Devolve se havia uma peça de mudar ali. */
  lift: (x: number, y: number) => boolean;
  /** Pôr o que está na mão neste tile. Devolve se pôs. */
  place: (x: number, y: number) => boolean;
  /** Largar o que está na mão (a carta volta para a tábua; a peça levantada volta para onde estava). */
  drop: () => void;
  /** Desmontar a peça levantada: o material volta à bancada e a carta à tábua. Devolve se havia uma levantada. */
  scrap: () => boolean;
  refuse: () => void;
  close: () => void;
}

// LETRA GRANDE EM QUALQUER TELA (pedido do autor, 2026-11-17: "tome cuidado com o tamanho das fontes [...] a questão da
// acessibilidade [...] grandes e legíveis, seja em telas grandes, em tablet, em celular"). A letra da tábua é a de mão
// (HAND_FONT), de olho pequeno: ela precisa de mais corpo que uma letra de livro para ler igual. Por isso todo texto aqui
// tem um PISO em pixels que nenhuma tela desce (18 px no texto, 20 px nos botões), cresce com a tela até um teto, e
// todo alvo de toque tem pelo menos 44 px. No celular em pé a dica ganha a linha dela; deitado (pouca altura) a tábua
// encolhe o desenho das cartas, nunca a letra.
/** A tela baixa e deitada (o celular deitado): a tábua vira coluna à direita, desta largura. */
const SIDE_QUERY = '(max-height: 520px) and (orientation: landscape)';
const SIDE_W = 236;
const CSS = `
#${ROOT_ID} { position: fixed; inset: 0; z-index: 45; user-select: none; touch-action: none; }
#${ROOT_ID} .zh-build-hit { position: absolute; inset: 0; cursor: pointer; }
/* Com o jogo parado, as etiquetas do jogo (o "Desenhar" do bicho perto) ficariam congeladas por cima da grade. */
body:has(#${ROOT_ID}) #zh-sketch-cue { display: none !important; }
#${ROOT_ID} .zh-build-top {
  position: absolute; top: max(1.5vh, 8px); left: 50%; transform: translateX(-50%) rotate(-0.6deg); padding: 8px 22px 10px;
  ${PAPER_SURFACE} font-family: ${HAND_FONT}; color: ${INK}; text-align: center; pointer-events: none;
  max-width: calc(100vw - 24px); box-sizing: border-box;
}
#${ROOT_ID} .zh-build-title { font-size: clamp(26px, 3.4vw, 40px); font-weight: 700; line-height: 1.05; }
#${ROOT_ID} .zh-build-stock {
  display: flex; flex-wrap: wrap; gap: 4px 18px; justify-content: center; font-size: clamp(21px, 2.1vw, 27px); font-weight: 700;
  line-height: 1.15;
}
#${ROOT_ID} .zh-build-stock span { display: inline-flex; align-items: center; gap: 4px; }
#${ROOT_ID} .zh-build-stock img { width: clamp(26px, 2.5vw, 34px); height: clamp(26px, 2.5vw, 34px); image-rendering: pixelated; }
#${ROOT_ID} .zh-build-bottom {
  position: absolute; left: 50%; bottom: max(1vh, 6px); transform: translateX(-50%); width: min(1120px, calc(100vw - 16px));
  box-sizing: border-box; padding: 10px 12px 8px; ${WOOD_PANEL}
}
#${ROOT_ID} .zh-build-cards {
  display: flex; gap: 10px; overflow-x: auto; padding: 10px 4px 8px; scrollbar-width: thin; scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch; touch-action: pan-x;
}
#${ROOT_ID} .zh-build-card {
  flex: 0 0 auto; width: clamp(116px, 11.5vw, 148px); min-height: 44px; padding: 8px 6px 6px; border: 0; cursor: pointer;
  text-align: center; position: relative; scroll-snap-align: start;
  ${PAPER_SURFACE} font-family: ${HAND_FONT}; color: ${INK}; transition: transform 120ms ease;
}
#${ROOT_ID} .zh-build-card img.art {
  width: clamp(48px, 5vw, 66px); height: clamp(48px, 5vw, 66px); image-rendering: pixelated; display: block; margin: 0 auto;
}
#${ROOT_ID} .zh-build-card .name {
  font-size: clamp(20px, 1.7vw, 24px); font-weight: 700; line-height: 1.02; min-height: 2.1em;
  display: flex; align-items: center; justify-content: center; overflow-wrap: anywhere;
}
#${ROOT_ID} .zh-build-card .needs {
  display: flex; flex-wrap: wrap; gap: 2px 8px; justify-content: center; font-size: clamp(19px, 1.6vw, 23px); font-weight: 700;
  min-height: 1.4em; line-height: 1.2;
}
#${ROOT_ID} .zh-build-card .needs span { display: inline-flex; align-items: center; gap: 2px; }
#${ROOT_ID} .zh-build-card .needs span.lack { color: #9b2a1c; text-decoration: underline; text-underline-offset: 2px; }
#${ROOT_ID} .zh-build-card .needs img { width: clamp(22px, 1.9vw, 26px); height: clamp(22px, 1.9vw, 26px); image-rendering: pixelated; }
#${ROOT_ID} .zh-build-card[data-state="lacking"] img.art { opacity: 0.55; }
#${ROOT_ID} .zh-build-card[data-next]::after {
  content: '★'; position: absolute; top: 2px; right: 6px; color: #b5701c; font-size: clamp(18px, 1.5vw, 22px);
}
#${ROOT_ID} .zh-build-card[data-cursor] { transform: translateY(-6px) rotate(-2deg); box-shadow: 0 0 0 3px #f4ead2, 0 0 0 6px ${INK}; }
#${ROOT_ID} .zh-build-card[data-armed] { box-shadow: 0 0 0 3px #f4ead2, 0 0 0 7px #3f8f55; }
#${ROOT_ID} .zh-build-card:focus-visible { outline: 3px solid #f4ead2; outline-offset: 3px; }
#${ROOT_ID} .zh-build-card.zh-deny { animation: zh-build-deny 260ms ease; }
@keyframes zh-build-deny { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
#${ROOT_ID} .zh-build-foot {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 14px;
  font-family: ${HAND_FONT}; color: #f4ead2; font-size: clamp(19px, 1.7vw, 24px); line-height: 1.2; padding: 2px 4px 0;
}
#${ROOT_ID} .zh-build-foot .zh-build-hint { flex: 1 1 280px; min-width: 0; }
#${ROOT_ID} .zh-build-foot button {
  border: 0; background: transparent; color: #f4ead2; cursor: pointer; min-height: 44px; min-width: 88px; padding: 4px 12px;
  font-family: ${HAND_FONT}; font-weight: 700; font-size: clamp(21px, 1.9vw, 26px); text-decoration: underline wavy rgba(244, 234, 210, 0.55);
}
#${ROOT_ID} .zh-build-foot button:focus-visible { outline: 3px solid #f4ead2; outline-offset: 2px; }
@media (max-width: 640px) {
  #${ROOT_ID} .zh-build-top { padding: 6px 14px 8px; }
  #${ROOT_ID} .zh-build-title { font-size: 24px; }
  #${ROOT_ID} .zh-build-stock { font-size: 21px; gap: 2px 12px; }
  #${ROOT_ID} .zh-build-stock img { width: 24px; height: 24px; }
  #${ROOT_ID} .zh-build-card { width: 112px; }
  #${ROOT_ID} .zh-build-foot .zh-build-hint { flex-basis: 100%; }
  #${ROOT_ID} .zh-build-foot button { flex: 1 1 0; }
}
/* O CELULAR DEITADO: pouca altura. Embaixo, a tábua cobria as fileiras do sul do acampamento (e tile escondido não se
   toca); então ela vira uma COLUNA à direita, de cartas deitadas, e a câmera põe o acampamento no resto da tela
   (BuildMode lê a mesma pergunta: buildPanelOnSide). */
@media ${SIDE_QUERY} {
  #${ROOT_ID} .zh-build-top {
    top: 4px; left: calc((100vw - ${SIDE_W + 12}px) / 2); padding: 4px 16px 6px; max-width: calc(100vw - ${SIDE_W + 36}px);
  }
  #${ROOT_ID} .zh-build-title { font-size: 24px; }
  #${ROOT_ID} .zh-build-stock { font-size: 20px; gap: 2px 12px; }
  #${ROOT_ID} .zh-build-stock img { width: 24px; height: 24px; }
  #${ROOT_ID} .zh-build-bottom {
    left: auto; right: 6px; top: 6px; bottom: 6px; transform: none; width: ${SIDE_W}px; padding: 6px 8px;
    display: flex; flex-direction: column;
  }
  #${ROOT_ID} .zh-build-cards {
    flex-direction: column; flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 6px 8px 6px 4px;
    gap: 8px; touch-action: pan-y; scroll-snap-type: y proximity;
  }
  #${ROOT_ID} .zh-build-card {
    width: 100%; display: grid; grid-template-columns: 44px 1fr; column-gap: 8px; align-items: center; text-align: left;
    padding: 6px 8px;
  }
  #${ROOT_ID} .zh-build-card img.art { grid-row: 1 / span 2; width: 44px; height: 44px; }
  #${ROOT_ID} .zh-build-card .name { min-height: 0; justify-content: flex-start; }
  #${ROOT_ID} .zh-build-card .needs { justify-content: flex-start; }
  #${ROOT_ID} .zh-build-card[data-cursor] { transform: translateX(-4px) rotate(-1deg); }
  #${ROOT_ID} .zh-build-foot { flex-direction: column; align-items: stretch; gap: 2px; }
  #${ROOT_ID} .zh-build-foot .zh-build-hint { flex: 0 0 auto; font-size: 18px; }
}
`;

/** A tábua vai para o lado direito (o celular deitado): a CSS e a câmera do modo (BuildMode) perguntam a mesma coisa. */
export const buildPanelOnSide = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(SIDE_QUERY).matches;

export class BuildOverlay {
  private readonly root: HTMLDivElement;
  /** A película que recebe o toque e o mouse por cima do mundo (a grade em si é desenhada no chão). */
  private readonly hit: HTMLDivElement;
  private readonly cardsEl: HTMLDivElement;
  private readonly hintEl: HTMLSpanElement;
  private readonly backEl: HTMLButtonElement;
  private readonly scrapEl: HTMLButtonElement;
  private readonly topEl: HTMLDivElement;
  private readonly openedAt: number;
  private view: BuildView;
  private cardCursor = 0;
  /** `choose`: de mão vazia (nas cartas, ou apontando a grade se há tile); `place`: com algo na mão. */
  private mode: 'choose' | 'place' = 'choose';
  private tile: { x: number; y: number } | null = null;
  /**
   * O tile apontado veio do MOUSE passando por cima (não das setas). Aí o X/Esc de mão vazia fecha de uma vez: o "volta
   * às cartas" é de quem anda na grade pelo teclado — com o mouse parado em cima da grade, o Esc só apagava o cursor, e
   * a bancada não fechava nunca no primeiro aperto.
   */
  private hovered = false;
  private closed = false;

  public constructor(private readonly cb: BuildCallbacks, private readonly now: () => number = () => performance.now()) {
    this.openedAt = now();
    this.view = cb.read();
    this.root = document.createElement('div');
    this.root.id = ROOT_ID;
    const style = document.createElement('style');
    style.textContent = CSS;
    this.topEl = document.createElement('div');
    this.topEl.className = 'zh-build-top';
    const paper = paperTexture();
    if (paper) this.topEl.style.backgroundImage = `url(${paper})`;
    const bottom = document.createElement('div');
    bottom.className = 'zh-build-bottom';
    this.cardsEl = document.createElement('div');
    this.cardsEl.className = 'zh-build-cards';
    const foot = document.createElement('div');
    foot.className = 'zh-build-foot';
    this.hintEl = document.createElement('span');
    this.hintEl.className = 'zh-build-hint';
    this.hintEl.setAttribute('aria-live', 'polite');
    this.backEl = this.button(this.view.texts.back, () => this.back());
    this.scrapEl = this.button(this.view.texts.scrap, () => this.scrap());
    foot.append(this.hintEl, this.scrapEl, this.backEl, this.button(this.view.texts.done, () => this.close()));
    bottom.append(this.cardsEl, foot);
    this.hit = document.createElement('div');
    this.hit.className = 'zh-build-hit';
    this.root.append(style, this.hit, this.topEl, bottom);
    this.hit.addEventListener('pointermove', this.onMove);
    this.hit.addEventListener('pointerdown', this.onDown);
    this.hit.addEventListener('contextmenu', (e) => { e.preventDefault(); this.back(); });
    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.onResize);
    this.cardCursor = Math.max(0, this.view.cards.findIndex((c) => c.state === 'ready'));
    this.refresh();
  }

  public get element(): HTMLDivElement {
    return this.root;
  }

  /** A carta sob o cursor, o que está na mão e o tile apontado (a janela do teste e do playtest). */
  public get state(): { mode: 'choose' | 'place'; card: string | null; tile: { x: number; y: number } | null } {
    return { mode: this.mode, card: this.view.cards[this.cardCursor]?.kind ?? null, tile: this.tile };
  }

  /** Lê de novo o que a cena tem (depois de pôr, levantar, pagar) e redesenha. */
  public refresh(): void {
    if (this.closed) return;
    this.view = this.cb.read();
    this.cardCursor = Math.min(this.cardCursor, Math.max(0, this.view.cards.length - 1));
    renderTop(this.topEl, this.view.title, this.view.stock);
    this.renderCards();
    this.renderHint();
    this.draw();
  }

  /** Escolhe a carta deste tipo (o toque, o clique, o Z). */
  public pick(kind: string): void {
    const i = this.view.cards.findIndex((c) => c.kind === kind);
    if (i < 0) return;
    this.cardCursor = i;
    if (!this.cb.pick(kind)) {
      this.deny(i);
      return;
    }
    this.mode = 'place';
    this.tile ??= this.firstFree();
    this.refresh();
  }

  /** O gesto no tile: com algo na mão, pôr; de mão vazia, levantar a peça que estiver ali. */
  public act(x: number, y: number): void {
    this.tile = { x, y };
    if (this.mode === 'place') {
      if (this.cb.place(x, y)) {
        // Posta: a mão esvazia e o teclado volta às cartas (o mouse aponta de novo ao se mexer).
        this.mode = 'choose';
        this.tile = null;
      } else {
        this.cb.refuse();
      }
    } else if (this.cb.lift(x, y)) {
      this.mode = 'place';
    } else {
      this.cb.refuse();
    }
    this.refresh();
  }

  /** Desmonta a peça levantada (ela volta para as cartas); sem peça levantada, a recusa. */
  public scrap(): void {
    if (this.mode !== 'place' || !this.cb.scrap()) { this.cb.refuse(); return; }
    this.mode = 'choose';
    this.tile = null;
    this.refresh();
  }

  /** Volta um passo: largar o que está na mão; de mão vazia, fechar. */
  public back(): void {
    if (this.mode === 'place') {
      this.cb.drop();
      this.mode = 'choose';
      this.refresh();
      return;
    }
    this.close();
  }

  public close(): void {
    if (this.closed) return;
    if (this.mode === 'place') this.cb.drop();
    this.detach();
    this.cb.close();
  }

  /** Fecha SEM avisar a cena: a saída de emergência do desmonte. */
  public destroy(): void {
    if (this.closed) return;
    this.detach();
  }

  private detach(): void {
    this.closed = true;
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onResize);
    this.root.remove();
  }

  private button(label: string, act: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); act(); });
    return b;
  }

  private firstFree(): { x: number; y: number } | null {
    const free = this.view.cells.find((c) => c.state === 'free');
    return free ? { x: free.x, y: free.y } : null;
  }

  private draw(): void {
    this.cb.paint(this.view.cells, this.tile, this.mode === 'place' ? this.view.holding?.kind ?? null : null);
  }

  private renderCards(): void {
    renderCards(this.cardsEl, this.view.cards, {
      cursor: this.cardCursor,
      armed: this.mode === 'place' ? this.view.holding?.kind ?? null : null,
      giftText: this.view.texts.gift,
      onPick: (kind) => this.pick(kind),
    });
  }

  private renderHint(): void {
    const t = this.view.texts;
    const moving = this.mode === 'place' && this.view.holding !== null
      && !this.view.cards.some((c) => c.kind === this.view.holding?.kind && c.state === 'ready');
    this.hintEl.textContent = withKeyNames(this.view.cards.length === 0 && this.mode === 'choose' ? t.empty
      : this.mode === 'place' ? (moving ? t.move : t.place) : t.choose);
    this.backEl.style.visibility = this.mode === 'place' ? 'visible' : 'hidden';
    // levantada (a carta dela não está na tábua): dá para desmontar. Escondido, o botão nem ocupa lugar (a coluna do
    // celular deitado não tem altura para um botão vazio).
    this.scrapEl.hidden = !moving;
    this.scrapEl.style.visibility = moving ? 'visible' : 'hidden';
  }

  private deny(i: number): void {
    const el = this.cardsEl.children[i] as HTMLElement | undefined;
    this.cb.refuse();
    if (!el) return;
    el.classList.remove('zh-deny');
    void el.offsetWidth;
    el.classList.add('zh-deny');
  }

  /**
   * A tela mudou de tamanho (o celular virou, a janela cresceu): com o jogo parado ninguém redesenha o mundo, então a
   * grade pede um quadro — um quadro depois, quando o mundo já mediu a tela nova.
   */
  private readonly onResize = (): void => {
    window.requestAnimationFrame(() => { if (!this.closed) this.draw(); });
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return;
    const tile = this.cb.tileAt(event.clientX, event.clientY);
    if (!tile || !this.cellAt(tile.x, tile.y) || (tile.x === this.tile?.x && tile.y === this.tile.y)) return;
    this.tile = tile;
    this.hovered = true;
    this.draw();
  };

  private readonly onDown = (event: PointerEvent): void => {
    event.preventDefault();
    if (event.button === 2) { this.back(); return; }
    const tile = this.cb.tileAt(event.clientX, event.clientY);
    if (tile && this.cellAt(tile.x, tile.y)) this.act(tile.x, tile.y);
  };

  /**
   * AS TECLAS, em três tempos. Nas CARTAS (de mão vazia): ←/→ escolhem, Z pega, ↑ vai para a grade, X fecha. APONTANDO
   * na grade (de mão vazia): as setas andam, Z levanta a peça que estiver ali, X (ou ↓ além da última fileira) volta às
   * cartas. COM ALGO NA MÃO: as setas andam, Z põe, X larga. Nada do que se aperta aqui chega ao jogo.
   */
  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    event.stopPropagation();
    event.preventDefault();
    const key = event.key.toLowerCase();
    const early = event.repeat || this.now() - this.openedAt < OPEN_GRACE_MS;
    const dir = key === 'arrowleft' || key === 'a' ? [-1, 0] : key === 'arrowright' || key === 'd' ? [1, 0]
      : key === 'arrowup' || key === 'w' ? [0, -1] : key === 'arrowdown' || key === 's' ? [0, 1] : null;
    const pointing = this.mode === 'choose' && this.tile !== null;
    if (SCRAP_KEYS.has(key)) {
      if (!early) this.scrap();
      return;
    }
    if (BACK_KEYS.has(key)) {
      if (early) return;
      if (pointing && !this.hovered) { this.tile = null; this.draw(); return; }
      this.back();
      return;
    }
    if (dir) {
      this.hovered = false;
      if (this.mode === 'choose' && !pointing) {
        if (dir[1] < 0) { this.tile = this.firstFree() ?? (this.view.cells[0] ? { x: this.view.cells[0].x, y: this.view.cells[0].y } : null); this.draw(); return; }
        const n = this.view.cards.length;
        if (dir[0] !== 0 && n > 0) {
          this.cardCursor = (this.cardCursor + dir[0] + n) % n;
          this.renderCards();
        }
        return;
      }
      if (pointing && dir[1] > 0 && this.tile && !this.view.cells.some((c) => c.y > (this.tile?.y ?? 0))) {
        this.tile = null;
        this.draw();
        return;
      }
      this.stepTile(dir[0], dir[1]);
      return;
    }
    if (!PICK_KEYS.has(key) || early) return;
    if (this.tile && (this.mode === 'place' || pointing)) { this.act(this.tile.x, this.tile.y); return; }
    const card = this.view.cards[this.cardCursor];
    if (card) this.pick(card.kind);
  };

  private cellAt(x: number, y: number): BuildCellView | undefined {
    return this.view.cells.find((c) => c.x === x && c.y === y);
  }

  /** O cursor anda um tile, pulando o que não é chão do acampamento (até achar um, nessa direção). */
  private stepTile(dx: number, dy: number): void {
    const from = this.tile ?? this.firstFree();
    if (!from) return;
    for (let i = 1; i <= 12; i += 1) {
      const next = this.cellAt(from.x + dx * i, from.y + dy * i);
      if (next) {
        this.tile = { x: next.x, y: next.y };
        this.draw();
        return;
      }
    }
  }
}
