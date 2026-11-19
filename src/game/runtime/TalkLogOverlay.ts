import { t } from '@/game/i18n/i18n';
import { getTextScale } from '@/game/runtime/accessibility';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import { PARCHMENT_ON, WOOD_PANEL, WOOD_TITLE, WOOD_WELL } from '@/game/runtime/uiStyle';
import { EMPHASIS, VERSE_INDENT_EM, isIndentedVerse } from './poemLayout';
import { talkPeople, type TalkEntry, type TalkLine } from './talkLog';

/**
 * AS CONVERSAS, DE NOVO (pedido do autor, 2026-11-18; o que se guarda está em runtime/talkLog): o menu de pausa abre
 * este caderno por cima do jogo parado. É MADEIRA, como a caixa de fala — é a mesma conversa, só que inteira: o
 * retrato e o nome de quem falou, na cor dele; os versos diagramados como na caixa (os que rimam recuados, a palavra
 * em maiúsculas em dourado, a narração em itálico); as conversas na ordem em que aconteceram, separadas pelo dia, e o
 * caderno abre na mais recente. Em cima, um filtro por personagem.
 *
 * Teclado: ↑↓ rolam, PgUp/PgDn uma página, Home/End o começo e o fim, ←→ trocam o filtro, Esc/X voltam. Dedo: rolar
 * arrastando, tocar num nome filtra. Letra de livro com piso de 18 px, que cresce com o "Tamanho do texto".
 */

const ROOT_ID = 'zh-talk-root';
const STYLE_ID = 'zh-talk-style';
/** O quanto uma seta rola, em px. */
const STEP_PX = 64;
/** O recuo pendurado do verso que não coube numa linha (como nos livros), em em. */
const HANG_EM = 1.6;
const BACK_CODES: ReadonlySet<string> = new Set(['Escape', 'Backspace', 'KeyX', 'KeyK']);

const CSS = `
#${ROOT_ID} {
  position: fixed; inset: 0; z-index: 62; display: flex; align-items: center; justify-content: center;
  padding: calc(12px + env(safe-area-inset-top, 0px)) calc(12px + env(safe-area-inset-right, 0px))
    calc(12px + env(safe-area-inset-bottom, 0px)) calc(12px + env(safe-area-inset-left, 0px));
  -webkit-tap-highlight-color: transparent;
}
#${ROOT_ID} * { box-sizing: border-box; }
#${ROOT_ID} .zh-talk-scrim { position: absolute; inset: 0; background: rgba(6, 5, 4, 0.72); }
#${ROOT_ID} .zh-talk-panel {
  position: relative; display: flex; flex-direction: column; gap: 8px;
  width: min(820px, 100%); height: 100%; padding: 14px 18px 10px;
  ${WOOD_PANEL}
  font-size: calc(clamp(18px, 0.6vw + 12px, 21px) * var(--zh-talk-scale, 1));
}
#${ROOT_ID} h1 { margin: 0; ${WOOD_TITLE} font-size: 1.5em; line-height: 1.1; text-align: center; flex: 0 0 auto; }
#${ROOT_ID} .zh-talk-chips {
  flex: 0 0 auto; display: flex; gap: 8px; overflow-x: auto; padding: 2px 2px 6px;
  scrollbar-width: thin; scrollbar-color: #8a7556 transparent;
}
#${ROOT_ID} .zh-talk-chip {
  flex: 0 0 auto; min-height: 44px; padding: 6px 14px; cursor: pointer; touch-action: manipulation;
  border: 2px solid #5a4a36; border-radius: 3px; background: rgba(7, 5, 3, 0.55);
  color: var(--who, #e7dcc4); font: inherit; font-variant: small-caps; letter-spacing: 0.04em; text-shadow: 0 1px 0 #000;
}
#${ROOT_ID} .zh-talk-chip.is-on { ${PARCHMENT_ON} border-color: #d4c8a4; }
#${ROOT_ID} .zh-talk-chip:focus-visible, #${ROOT_ID} .zh-talk-back:focus-visible, #${ROOT_ID} .zh-talk-list:focus-visible {
  outline: 3px solid #f4ead2; outline-offset: 2px;
}
#${ROOT_ID} .zh-talk-list {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 4px 18px 16px; overscroll-behavior: contain;
  ${WOOD_WELL}
  scrollbar-width: thin; scrollbar-color: #8a7556 transparent;
}
#${ROOT_ID} .zh-talk-list::-webkit-scrollbar { width: 8px; }
#${ROOT_ID} .zh-talk-list::-webkit-scrollbar-thumb { background: #8a7556; }
#${ROOT_ID} .zh-talk-day {
  display: flex; align-items: center; gap: 12px; margin: 18px 0 4px;
  color: #a89c7e; font-variant: small-caps; letter-spacing: 0.08em; font-size: max(18px, 0.92em);
}
#${ROOT_ID} .zh-talk-day::before, #${ROOT_ID} .zh-talk-day::after { content: ''; flex: 1 1 auto; border-top: 1px solid #4a3e30; }
#${ROOT_ID} .zh-talk { padding: 10px 0 6px; border-bottom: 1px dashed rgba(138, 117, 86, 0.35); }
#${ROOT_ID} .zh-talk:last-child { border-bottom: 0; }
#${ROOT_ID} .zh-talk-who {
  display: flex; align-items: center; gap: 0.6em; margin: 0 0 0.5em;
  color: var(--who); font-size: 1.04em; font-weight: 400; font-variant: small-caps; letter-spacing: 0.05em;
}
#${ROOT_ID} .zh-talk-who img {
  width: 2.2em; height: 2.2em; flex: 0 0 auto; image-rendering: pixelated; border: 2px solid var(--who); background: #0b0906;
}
#${ROOT_ID} .zh-talk-line { margin: 0 0 0.75em; line-height: 1.42; color: #f3ecdc; }
#${ROOT_ID} .zh-talk-line.zh-narr { font-style: italic; color: #c9d2e3; }
#${ROOT_ID} .zh-talk-verse { padding-left: ${HANG_EM}em; text-indent: -${HANG_EM}em; }
#${ROOT_ID} .zh-talk-verse.zh-rhyme { padding-left: ${HANG_EM + VERSE_INDENT_EM}em; }
#${ROOT_ID} .zh-talk-em { color: #ffd36b; font-weight: 700; }
#${ROOT_ID} .zh-talk-empty { margin: 2em auto; max-width: 26em; text-align: center; color: #cfc6ad; line-height: 1.5; }
#${ROOT_ID} .zh-talk-foot { flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 16px; }
#${ROOT_ID} .zh-talk-hint { flex: 1 1 260px; min-width: 0; color: #a89c7e; font-size: max(18px, 0.92em); line-height: 1.25; }
#${ROOT_ID} .zh-talk-back {
  min-height: 44px; min-width: 96px; padding: 6px 16px; border: 0; background: transparent; cursor: pointer;
  color: #f3ecdc; font: inherit; font-weight: 700; font-size: 1.05em; text-shadow: 0 1px 0 #000;
  text-decoration: underline wavy rgba(244, 234, 210, 0.5); touch-action: manipulation;
}
@media (max-width: 560px) {
  #${ROOT_ID} .zh-talk-panel { padding: 10px 10px 8px; }
  #${ROOT_ID} .zh-talk-list { padding: 4px 10px 12px; }
  #${ROOT_ID} h1 { font-size: 1.3em; }
}
@media (max-height: 500px) {
  #${ROOT_ID} .zh-talk-panel { padding-top: 8px; gap: 4px; }
  #${ROOT_ID} h1 { font-size: max(22px, 1.2em); }
}
`;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

export interface TalkLogCallbacks {
  /** O retrato de quem falou, como a caixa de fala o mostra (data URL), ou null se a textura não existe. */
  portrait: (asset: string, frame?: number) => string | null;
  onClose: () => void;
}

export class TalkLogOverlay {
  private readonly root: HTMLDivElement;
  private readonly chipsEl: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly people: ReadonlyArray<{ who: string; color: string }>;
  private readonly portraits = new Map<string, string | null>();
  /** Só as conversas desta pessoa (null = todas). */
  private filter: string | null = null;
  private destroyed = false;

  public constructor(private readonly entries: readonly TalkEntry[], private readonly cb: TalkLogCallbacks) {
    ensureStyle();
    this.people = talkPeople(entries);
    this.root = document.createElement('div');
    this.root.id = ROOT_ID;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'zh-talk-title');
    this.root.style.setProperty('--zh-talk-scale', String(getTextScale()));
    const scrim = document.createElement('div');
    scrim.className = 'zh-talk-scrim';
    const panel = document.createElement('div');
    panel.className = 'zh-talk-panel';
    const title = document.createElement('h1');
    title.id = 'zh-talk-title';
    title.textContent = t('talks.title');
    this.chipsEl = document.createElement('div');
    this.chipsEl.className = 'zh-talk-chips';
    this.list = document.createElement('div');
    this.list.className = 'zh-talk-list';
    this.list.tabIndex = 0;
    this.list.setAttribute('aria-label', t('talks.title'));
    const foot = document.createElement('div');
    foot.className = 'zh-talk-foot';
    const hint = document.createElement('span');
    hint.className = 'zh-talk-hint';
    hint.textContent = t(isTouchDevice() ? 'talks.hintTouch' : 'talks.hint');
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'zh-talk-back';
    back.textContent = t('talks.back');
    back.addEventListener('click', () => this.close());
    foot.append(hint, back);
    panel.append(title, this.chipsEl, this.list, foot);
    this.root.append(scrim, panel);
    // Só com mais de uma pessoa o filtro serve para alguma coisa.
    this.chipsEl.style.display = this.people.length > 1 ? '' : 'none';
    this.render();
    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.onKey, true);
    this.list.focus({ preventScroll: true });
    this.toLatest();
  }

  public get element(): HTMLDivElement {
    return this.root;
  }

  /** O filtro e quantas conversas estão na tela (a janela do teste e do playtest). */
  public get state(): { filter: string | null; shown: number } {
    return { filter: this.filter, shown: this.list.querySelectorAll('.zh-talk').length };
  }

  /** Mostra só as conversas desta pessoa (null = todas), e vai para a mais recente. */
  public setFilter(who: string | null): void {
    this.filter = who;
    this.render();
    this.toLatest();
  }

  public close(): void {
    if (this.destroyed) return;
    this.destroy();
    this.cb.onClose();
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('keydown', this.onKey, true);
    this.root.remove();
  }

  private render(): void {
    this.renderChips();
    this.list.replaceChildren();
    const shown = this.entries.filter((e) => this.filter === null || e.who === this.filter);
    if (shown.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'zh-talk-empty';
      empty.textContent = t('talks.empty');
      this.list.appendChild(empty);
      return;
    }
    let day = -1;
    for (const entry of shown) {
      if (entry.day !== day) {
        day = entry.day;
        const head = document.createElement('div');
        head.className = 'zh-talk-day';
        head.textContent = t('talks.day').replace('{n}', String(day + 1));
        this.list.appendChild(head);
      }
      this.list.appendChild(this.renderEntry(entry));
    }
  }

  private renderChips(): void {
    this.chipsEl.replaceChildren();
    const options: Array<{ who: string | null; label: string; color?: string }> = [
      { who: null, label: t('talks.all') },
      ...this.people.map((p) => ({ who: p.who, label: p.who, color: p.color })),
    ];
    for (const o of options) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = o.who === this.filter ? 'zh-talk-chip is-on' : 'zh-talk-chip';
      chip.textContent = o.label;
      chip.setAttribute('aria-pressed', String(o.who === this.filter));
      if (o.color) chip.style.setProperty('--who', o.color);
      chip.addEventListener('click', () => this.setFilter(o.who));
      this.chipsEl.appendChild(chip);
    }
    this.chipsEl.querySelector<HTMLElement>('.is-on')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  private renderEntry(entry: TalkEntry): HTMLElement {
    const box = document.createElement('article');
    box.className = 'zh-talk';
    box.style.setProperty('--who', entry.color);
    const who = document.createElement('h2');
    who.className = 'zh-talk-who';
    const url = this.portraitOf(entry);
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      who.appendChild(img);
    }
    who.appendChild(document.createTextNode(entry.who));
    box.appendChild(who);
    for (const line of entry.lines) box.appendChild(this.renderLine(line));
    return box;
  }

  /** Uma fala: uma estrofe, um verso por linha, os que rimam recuados, o nome da coisa em dourado. */
  private renderLine(line: TalkLine): HTMLElement {
    const el = document.createElement('div');
    el.className = line.speaker === 'narrator' ? 'zh-talk-line zh-narr' : 'zh-talk-line';
    const verses = line.text.split('\n');
    verses.forEach((verse, row) => {
      const v = document.createElement('div');
      v.className = isIndentedVerse(verses.length, row) ? 'zh-talk-verse zh-rhyme' : 'zh-talk-verse';
      verse.split(' ').forEach((word, i) => {
        if (i > 0) v.appendChild(document.createTextNode(' '));
        if (EMPHASIS.test(word.replace(/[^\p{L}]/gu, ''))) {
          const em = document.createElement('span');
          em.className = 'zh-talk-em';
          em.textContent = word;
          v.appendChild(em);
        } else {
          v.appendChild(document.createTextNode(word));
        }
      });
      el.appendChild(v);
    });
    return el;
  }

  private portraitOf(entry: TalkEntry): string | null {
    const key = `${entry.asset}#${entry.frame ?? ''}`;
    if (!this.portraits.has(key)) this.portraits.set(key, this.cb.portrait(entry.asset, entry.frame));
    return this.portraits.get(key) ?? null;
  }

  /** O caderno abre na conversa mais recente (o fim da lista), também depois de o layout assentar. */
  private toLatest(): void {
    this.list.scrollTop = this.list.scrollHeight;
    requestAnimationFrame(() => { if (!this.destroyed) this.list.scrollTop = this.list.scrollHeight; });
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    if (this.destroyed) return;
    // Nada do que se aperta aqui chega ao menu nem ao jogo (o Tab e o Enter num botão seguem o navegador).
    event.stopPropagation();
    const code = event.code;
    const page = Math.max(STEP_PX, this.list.clientHeight * 0.85);
    let handled = true;
    if (BACK_CODES.has(code)) {
      if (!event.repeat) this.close();
    } else if (code === 'ArrowUp' || code === 'KeyW') this.list.scrollTop -= STEP_PX;
    else if (code === 'ArrowDown' || code === 'KeyS') this.list.scrollTop += STEP_PX;
    else if (code === 'PageUp') this.list.scrollTop -= page;
    else if (code === 'PageDown') this.list.scrollTop += page;
    else if (code === 'Home') this.list.scrollTop = 0;
    else if (code === 'End') this.list.scrollTop = this.list.scrollHeight;
    else if (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowRight' || code === 'KeyD') {
      const order = [null, ...this.people.map((p) => p.who)];
      const step = code === 'ArrowLeft' || code === 'KeyA' ? -1 : 1;
      const at = order.indexOf(this.filter);
      if (this.people.length > 1) this.setFilter(order[(at + step + order.length) % order.length]);
    } else handled = false;
    if (handled) event.preventDefault();
  };
}
