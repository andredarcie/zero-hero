import { t } from '@/game/i18n/i18n';
import { BOOK_FONT, WOOD_PANEL } from '@/game/runtime/uiStyle';
import { ZoomSlider } from '@/game/runtime/ZoomSlider';

/**
 * O AJUSTE DO ZOOM (pedido do autor): a régua não mora na HUD; ela abre pelas opções da pausa, por cima do jogo
 * PARADO. O menu some, o mundo continua congelado no quadro da pausa, e a régua aparece sozinha na borda direita,
 * com uma tabuinha no alto dizendo o que fazer. Cada mudança redesenha o quadro parado com a câmera nova
 * (`redraw`, ver PauseControl); o OK — ou Enter, Esc, espaço, Z — devolve as opções. As setas para cima e para
 * baixo (e + e −) andam a régua: com o jogo parado, elas não são de ninguém.
 */

const STYLE_ID = 'zh-zoom-setup-style';
const HINT_ID = 'zh-zoom-hint';

const CSS = `
#${HINT_ID} {
  position: fixed; left: 50%; transform: translateX(-50%);
  top: calc(18px + env(safe-area-inset-top, 0px));
  z-index: 61; pointer-events: none;
  /* A tabuinha de madeira (a moldura do diálogo), como a dica dos controles. */
  ${WOOD_PANEL}
  border-width: 2px; padding: 0.35em 0.9em;
  color: #d8d1c0; font-family: ${BOOK_FONT}; font-size: 15px; white-space: nowrap;
}
`;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

export interface ZoomSetupCallbacks {
  /** Redesenha o quadro parado com o zoom de agora. */
  redraw: () => void;
  /** O OK: quem abriu fecha a tela (destroy) e volta para onde estava. */
  onDone: () => void;
}

const UP = new Set(['ArrowUp', 'KeyW', 'Equal', 'NumpadAdd']);
const DOWN = new Set(['ArrowDown', 'KeyS', 'Minus', 'NumpadSubtract']);
const DONE = new Set(['Enter', 'NumpadEnter', 'Escape', 'Space', 'KeyZ', 'KeyJ']);

export class ZoomSetup {
  public readonly slider: ZoomSlider;
  private readonly hint: HTMLDivElement;

  public constructor(private readonly cb: ZoomSetupCallbacks) {
    ensureStyle();
    this.hint = document.createElement('div');
    this.hint.id = HINT_ID;
    this.hint.textContent = t('hud.zoomHint');
    document.body.appendChild(this.hint);
    this.slider = new ZoomSlider({ onChange: () => cb.redraw(), onDone: () => cb.onDone() });
    window.addEventListener('keydown', this.onKeyDown, true);
    cb.redraw();
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.slider.destroy();
    this.hint.remove();
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const code = event.code;
    if (!UP.has(code) && !DOWN.has(code) && !DONE.has(code)) return;
    event.preventDefault();
    event.stopPropagation();
    if (UP.has(code)) this.slider.step(1);
    else if (DOWN.has(code)) this.slider.step(-1);
    else if (!event.repeat) this.cb.onDone();
  };
}
