import { t } from '@/game/i18n/i18n';

/**
 * A PERGUNTA — o unico momento do jogo em que o jogador escolhe com palavras.
 *
 * O resto de Zero the Hero e walk-only: nao existe botao de acao, e tudo se resolve pisando ou
 * esbarrando. Este overlay quebra a regra de propósito, e a excecao tem um motivo estreito: a
 * decisao "voltar levando metade, ou continuar arriscando tudo" e IRREVERSIVEL e custa dinheiro.
 * Todo o resto do jogo pode ser desfeito andando de volta; isto nao. Uma decisao dessas nao pode
 * ser tomada por um passo em falso — pisar num portal sem querer e a coisa mais facil do mundo.
 *
 * Por isso ele nao e "aperte para confirmar", e uma pergunta de duas portas, e a porta perigosa
 * (Sim, eu volto) NAO e a que o teclado escolhe sozinho: Enter e Escape fazem o que a inercia
 * do jogador quer que facam — continuar a expedicao.
 */

const STYLE_ID = 'zh-extract-style';
const ROOT_ID = 'zh-extract-root';
const SERIF = "Georgia, 'Times New Roman', 'Book Antiqua', serif";

const CSS = `
#${ROOT_ID} { position: fixed; inset: 0; z-index: 62; font-family: ${SERIF}; }
#${ROOT_ID} .zh-ex-scrim {
  position: absolute; inset: 0; background: rgba(24, 6, 34, 0.55);
  opacity: 0; transition: opacity 160ms ease;
}
#${ROOT_ID} .zh-ex-panel {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(25em, calc(100vw - 2.5em));
  background: #140f1c; border: 1px solid #4b3a5e; color: #d8d1c0;
  box-shadow: 0 12px 44px rgba(0, 0, 0, 0.7);
  padding: 1.6em 1.7em 1.4em; text-align: center;
  font-size: clamp(13px, 2.4vh, 17px);
  opacity: 0; transform: translate(-50%, -46%);
  transition: opacity 160ms ease, transform 160ms ease;
}
#${ROOT_ID}.zh-in .zh-ex-scrim { opacity: 1; }
#${ROOT_ID}.zh-in .zh-ex-panel { opacity: 1; transform: translate(-50%, -50%); }
#${ROOT_ID} h1 {
  margin: 0 0 0.7em; font-size: 1.1em; font-weight: 700;
  letter-spacing: 0.16em; text-indent: 0.16em; color: #e0c8f0;
}
#${ROOT_ID} .zh-ex-ledger {
  margin: 0 0 1.2em; font-size: 0.92em; color: #a49c8b; line-height: 1.55;
  white-space: pre-line; /* o \\n do catalogo de textos quebra linha de verdade */
}
#${ROOT_ID} .zh-ex-ledger b { color: #f0d489; font-weight: 700; }
#${ROOT_ID} .zh-ex-ledger .zh-ex-lost { color: #c8705f; }
#${ROOT_ID} .zh-ex-btn {
  display: block; box-sizing: border-box; width: 100%;
  padding: 0.55em 0.8em; margin: 0.5em 0;
  cursor: pointer; user-select: none;
  border: 1px solid #4b3a5e; color: #d8d1c0;
  transition: background 90ms ease, color 90ms ease, border-color 90ms ease;
}
#${ROOT_ID} .zh-ex-btn:hover { background: #c9a4e0; color: #1d1226; border-color: #c9a4e0; }
#${ROOT_ID} .zh-ex-btn.zh-stay { color: #8b8474; font-size: 0.92em; }
#${ROOT_ID} .zh-ex-btn.zh-stay:hover { background: #3d342a; color: #d8d1c0; border-color: #3d342a; }
`;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

export interface ExtractPromptOptions {
  /** A bolsa desta expedicao, ainda inteira. */
  coins: number;
  /** Quanto dela sobrevive se ele disser sim. */
  kept: number;
  onYes: () => void;
  onNo: () => void;
}

export class ExtractPrompt {
  private readonly root: HTMLDivElement;
  private destroyed = false;
  private answered = false;

  public constructor(private readonly opts: ExtractPromptOptions) {
    ensureStyle();
    this.root = document.createElement('div');
    this.root.id = ROOT_ID;

    const scrim = document.createElement('div');
    scrim.className = 'zh-ex-scrim';
    // Clicar fora e a resposta segura, nunca a cara: fechar sem querer nao pode custar metade
    // da bolsa.
    scrim.addEventListener('click', () => this.answer(false));
    this.root.appendChild(scrim);

    const panel = document.createElement('div');
    panel.className = 'zh-ex-panel';
    this.root.appendChild(panel);

    const title = document.createElement('h1');
    title.textContent = t('explorer.prompt.title');
    panel.appendChild(title);

    const ledger = document.createElement('p');
    ledger.className = 'zh-ex-ledger';
    ledger.innerHTML = t('explorer.prompt.ledger')
      .replace('{coins}', `<b>${opts.coins}</b>`)
      .replace('{kept}', `<b>${opts.kept}</b>`)
      .replace('{lost}', `<span class="zh-ex-lost">${opts.coins - opts.kept}</span>`);
    panel.appendChild(ledger);

    const yes = document.createElement('div');
    yes.className = 'zh-ex-btn';
    yes.textContent = t('explorer.prompt.yes');
    yes.addEventListener('click', () => this.answer(true));
    panel.appendChild(yes);

    const no = document.createElement('div');
    no.className = 'zh-ex-btn zh-stay';
    no.textContent = t('explorer.prompt.no');
    no.addEventListener('click', () => this.answer(false));
    panel.appendChild(no);

    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.handleKey, true);
    requestAnimationFrame(() => { if (!this.destroyed) this.root.classList.add('zh-in'); });
  }

  private answer(yes: boolean): void {
    if (this.answered) return;
    this.answered = true;
    this.destroy();
    if (yes) this.opts.onYes();
    else this.opts.onNo();
  }

  private readonly handleKey = (event: KeyboardEvent): void => {
    if (this.destroyed) return;
    // Sem tecla de atalho para o SIM. Enter e Escape — as duas teclas que um jogador aperta por
    // reflexo — continuam a expedicao; dizer sim exige mirar e clicar.
    if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      this.answer(false);
    }
  };

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('keydown', this.handleKey, true);
    this.root.remove();
  }
}
