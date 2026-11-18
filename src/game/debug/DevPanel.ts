// O PAINEL DE TESTES DO LOCALHOST, a tela (pedido do autor, 2026-11-17). O que cada botão faz mora no jogo
// (scenes/game/DevTools); o conteúdo das abas em debug/devPanelViews.
//
// A TECLA: a do console dos jogos de PC — a primeira da fileira dos números, À ESQUERDA DO 1 (`Backquote`: ' no
// teclado brasileiro, ` no americano). O jogo não usa nenhuma tecla daquela fileira fora os dígitos (que o jogador pode
// escolher para o Z e o X, ver runtime/accessibility), então ela nunca disputa um gesto. Lida pela POSIÇÃO (`code`), o
// acento morto do teclado não atrapalha. Digitando (o nome da placa), ela escreve, não abre.
// No toque (o celular na rede de casa) não há essa tecla: um botãozinho no canto abre o mesmo painel.
//
// Aberto, o JOGO PARA (como na bancada) e nenhuma tecla chega a ele; fechado, ele volta — se já estava parado por
// outra tela (a bancada aberta por baixo), continua parado.

import { isTouchDevice } from '@/game/runtime/PauseMenu';
import { DEV_TABS, renderTab, type DevPanelApi, type DevTab } from './devPanelViews';

const ROOT_ID = 'zh-dev';
const STYLE_ID = 'zh-dev-style';
const FAB_ID = 'zh-dev-fab';
const SERIF = "Georgia, 'Times New Roman', 'Book Antiqua', serif";

const CSS = `
#${ROOT_ID} { position: fixed; inset: 0; z-index: 95; font-family: ${SERIF}; color: #e7dcc4; }
#${ROOT_ID} .zh-dev-scrim { position: absolute; inset: 0; background: rgba(8, 6, 4, 0.66); }
#${ROOT_ID} .zh-dev-panel {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); box-sizing: border-box;
  width: min(820px, calc(100vw - 16px)); height: min(720px, calc(100vh - 16px)); display: flex; flex-direction: column;
  background: #17120d; border: 1px solid #4a3f30; box-shadow: 0 14px 48px rgba(0, 0, 0, 0.7);
  font-size: clamp(17px, 1.6vw, 19px); line-height: 1.3;
}
#${ROOT_ID} header { display: flex; align-items: center; gap: 12px; padding: 12px 16px 8px; border-bottom: 1px solid #3d342a; }
#${ROOT_ID} header h2 { margin: 0; font-size: clamp(20px, 2.2vw, 24px); letter-spacing: 0.08em; flex: 1; }
#${ROOT_ID} header small { color: #9b917c; font-size: 15px; }
#${ROOT_ID} .zh-dev-close { min-width: 44px; min-height: 44px; font-size: 24px; }
#${ROOT_ID} nav { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px; border-bottom: 1px solid #3d342a; }
#${ROOT_ID} nav button { flex: 1 1 auto; }
#${ROOT_ID} nav button.zh-on { background: #d4c8a4; color: #241d12; border-color: #d4c8a4; }
#${ROOT_ID} main { flex: 1; overflow-y: auto; padding: 4px 16px 12px; -webkit-overflow-scrolling: touch; }
#${ROOT_ID} footer { padding: 10px 16px; border-top: 1px solid #3d342a; min-height: 1.4em; color: #f0d98a; }
#${ROOT_ID} .zh-dev-sec { margin: 14px 0 6px; }
#${ROOT_ID} .zh-dev-sec h3 { margin: 0 0 4px; font-size: 1.05em; color: #f4ead2; }
#${ROOT_ID} .zh-dev-hint { margin: 0 0 8px; color: #a99f88; font-size: 0.92em; }
#${ROOT_ID} .zh-dev-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0; }
#${ROOT_ID} .zh-dev-btn, #${ROOT_ID} nav button, #${ROOT_ID} .zh-dev-close, #${ROOT_ID} .zh-dev-item {
  min-height: 44px; padding: 8px 14px; border: 1px solid #5a4d3a; background: #241c14; color: #efe5cf; cursor: pointer;
  font: inherit; border-radius: 3px;
}
#${ROOT_ID} button:hover { border-color: #d4c8a4; }
#${ROOT_ID} button:focus-visible { outline: 3px solid #f0d98a; outline-offset: 2px; }
#${ROOT_ID} .zh-dev-main { background: #3f5a2e; border-color: #6f8a4c; }
#${ROOT_ID} .zh-dev-danger { background: #6b1f18; border-color: #c83e3e; }
#${ROOT_ID} .zh-dev-pill { min-width: 52px; padding: 8px 10px; }
#${ROOT_ID} .zh-dev-pill.zh-on { background: #d4c8a4; color: #241d12; }
#${ROOT_ID} .zh-dev-seg { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 6px 0; }
#${ROOT_ID} .zh-dev-seg .zh-dev-hint { margin: 0 4px 0 0; }
#${ROOT_ID} .zh-dev-quest {
  display: flex; align-items: center; gap: 12px; padding: 8px 10px; margin: 6px 0; border: 1px solid #3d342a;
}
#${ROOT_ID} .zh-dev-quest.zh-done { opacity: 0.7; }
#${ROOT_ID} .zh-dev-qtext { flex: 1; display: flex; flex-direction: column; }
#${ROOT_ID} .zh-dev-qtext .zh-dev-hint { margin: 0; }
#${ROOT_ID} .zh-dev-check { color: #9fd17c; font-size: 1.4em; padding: 0 10px; }
#${ROOT_ID} .zh-dev-items { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
#${ROOT_ID} .zh-dev-item { display: flex; align-items: center; gap: 8px; text-align: left; padding: 6px 10px; }
#${ROOT_ID} .zh-dev-item img { width: 32px; height: 32px; image-rendering: pixelated; flex: none; }
#${ROOT_ID} .zh-dev-ilabel { flex: 1; min-width: 0; display: flex; flex-direction: column; }
#${ROOT_ID} .zh-dev-ilabel em { font-size: 0.8em; color: #a99f88; font-style: normal; }
#${ROOT_ID} .zh-dev-item.zh-on { border-color: #9fd17c; }
#${ROOT_ID} .zh-dev-stock { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 6px 0; }
#${ROOT_ID} .zh-dev-stock img { width: 32px; height: 32px; image-rendering: pixelated; }
#${ROOT_ID} .zh-dev-stock strong { min-width: 11em; }
@media (max-width: 560px) {
  #${ROOT_ID} .zh-dev-panel { width: 100vw; height: 100vh; border: 0; }
  #${ROOT_ID} .zh-dev-items { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
  #${ROOT_ID} header small { display: none; }
}
#${FAB_ID} {
  position: fixed; left: max(8px, env(safe-area-inset-left)); bottom: 50%; z-index: 94; min-width: 44px; min-height: 44px;
  padding: 6px 10px; border: 1px solid #5a4d3a; background: rgba(23, 18, 13, 0.72); color: #efe5cf; border-radius: 3px;
  font: 16px ${SERIF};
}
`;

const isTyping = (target: EventTarget | null): boolean => {
  const node = target as HTMLElement | null;
  return Boolean(node && (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT' || node.isContentEditable));
};

export interface DevPanelHooks {
  /** O painel abriu: o jogo para (devolve se FOI ele quem parou, para saber se retoma depois). */
  pause: () => boolean;
  resume: () => void;
}

export class DevPanel {
  private root?: HTMLDivElement;
  private fab?: HTMLButtonElement;
  private tab: DevTab = 'Missões';
  private status = '';
  private pausedByUs = false;
  private main?: HTMLElement;
  private footer?: HTMLElement;
  private nav?: HTMLElement;

  public constructor(private readonly api: DevPanelApi, private readonly hooks: DevPanelHooks) {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    window.addEventListener('keydown', this.onKey, true);
    if (isTouchDevice()) {
      this.fab = document.createElement('button');
      this.fab.id = FAB_ID;
      this.fab.type = 'button';
      this.fab.textContent = 'Testes';
      this.fab.setAttribute('aria-label', 'Abrir o painel de testes');
      this.fab.addEventListener('click', () => this.open());
      document.body.appendChild(this.fab);
    }
  }

  public get isOpen(): boolean {
    return this.root !== undefined;
  }

  public open(): void {
    if (this.root) return;
    this.pausedByUs = this.hooks.pause();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Painel de testes');
    const scrim = document.createElement('div');
    scrim.className = 'zh-dev-scrim';
    scrim.addEventListener('pointerdown', () => this.close());
    const panel = document.createElement('div');
    panel.className = 'zh-dev-panel';
    const header = document.createElement('header');
    const h2 = document.createElement('h2');
    h2.textContent = 'Painel de testes';
    const small = document.createElement('small');
    small.textContent = "só no localhost · tecla ' (à esquerda do 1) ou Esc fecha";
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'zh-dev-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Fechar');
    close.addEventListener('click', () => this.close());
    header.append(h2, small, close);
    this.nav = document.createElement('nav');
    this.main = document.createElement('main');
    this.footer = document.createElement('footer');
    this.footer.setAttribute('aria-live', 'polite');
    panel.append(header, this.nav, this.main, this.footer);
    root.append(scrim, panel);
    document.body.appendChild(root);
    this.root = root;
    this.draw();
    close.focus();
  }

  public close(): void {
    if (!this.root) return;
    this.root.remove();
    this.root = undefined;
    if (this.pausedByUs) this.hooks.resume();
    this.pausedByUs = false;
  }

  public destroy(): void {
    this.root?.remove();
    this.root = undefined;
    this.fab?.remove();
    window.removeEventListener('keydown', this.onKey, true);
  }

  private draw(): void {
    if (!this.nav || !this.main || !this.footer) return;
    this.nav.replaceChildren();
    DEV_TABS.forEach((tab, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${i + 1} ${tab}`;
      b.className = tab === this.tab ? 'zh-on' : '';
      b.setAttribute('aria-pressed', String(tab === this.tab));
      b.addEventListener('click', () => { this.tab = tab; this.draw(); });
      this.nav?.appendChild(b);
    });
    const scroll = this.main.scrollTop;
    this.main.replaceChildren(...renderTab(this.tab, {
      api: this.api,
      say: (text) => { this.status = text; },
      redraw: () => this.draw(),
    }));
    this.main.scrollTop = scroll;
    this.footer.textContent = this.status;
  }

  /** A tecla do console abre e fecha; aberto, os números trocam de aba e nada chega ao jogo. */
  private readonly onKey = (event: KeyboardEvent): void => {
    const toggle = event.code === 'Backquote' && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (!this.root) {
      if (!toggle || isTyping(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.open();
      return;
    }
    event.stopImmediatePropagation();
    if (toggle || event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    const n = Number.parseInt(event.key, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= DEV_TABS.length) {
      event.preventDefault();
      this.tab = DEV_TABS[n - 1];
      this.draw();
    }
    // Tab, Enter e Espaço seguem para os botões (o foco e o clique do navegador); o resto não chega ao jogo.
  };
}
