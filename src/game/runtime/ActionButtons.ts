import { t } from '@/game/i18n/i18n';

/**
 * OS DOIS BOTOES, para quem joga com o dedo.
 *
 * O jogo deixou de ser walk-only: A golpeia na direcao em que o heroi olha, B usa o item
 * escolhido na subtela. No teclado isso e Z/X (e J/K, e espaco no A); no telefone precisa de
 * corpo — e o corpo e este par de circulos no canto de baixo, na ordem do NES (B a esquerda,
 * A a direita), longe do polegar que arrasta o heroi do outro lado da tela.
 *
 * `data-zh-ui` nao e decoracao: o andar por toque escuta `touchstart` na JANELA (para o arrasto
 * funcionar em qualquer ponto do vidro), entao sem uma marca dizendo "isto e UI" tocar em A
 * tambem plantaria a ancora do arrasto e o heroi sairia andando junto com o golpe.
 */

const STYLE_ID = 'zh-action-style';
const ROOT_ID = 'zh-action-pad';
const HINT_ID = 'zh-controls-hint';
const SERIF = "Georgia, 'Times New Roman', 'Book Antiqua', serif";

const CSS = `
#${ROOT_ID} {
  position: fixed;
  right: calc(14px + env(safe-area-inset-right, 0px));
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  z-index: 45;
  display: flex; align-items: flex-end; gap: 14px;
  font-family: ${SERIF};
}
#${ROOT_ID} .zh-act {
  width: 62px; height: 62px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; cursor: pointer;
  background: rgba(10, 8, 6, 0.34); border: 1px solid rgba(216, 209, 192, 0.32);
  color: rgba(216, 209, 192, 0.72);
  font-size: 20px; font-weight: 700; letter-spacing: 0.04em;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
  transition: background 90ms ease, color 90ms ease, transform 90ms ease;
}
/* B fica um degrau mais baixo, como no controle: os dois botoes nunca sao a mesma coisa. */
#${ROOT_ID} .zh-act.zh-b { margin-bottom: 14px; }
#${ROOT_ID} .zh-act:active {
  background: rgba(212, 200, 164, 0.85); color: #241d12; transform: scale(0.94);
}
#${HINT_ID} {
  position: fixed; left: 50%; transform: translateX(-50%);
  bottom: calc(18px + env(safe-area-inset-bottom, 0px));
  z-index: 45; pointer-events: none;
  background: rgba(10, 8, 6, 0.78); border: 1px solid rgba(216, 209, 192, 0.3);
  border-radius: 6px; padding: 0.4em 0.8em;
  color: #d8d1c0; font-family: ${SERIF}; font-size: 13px; white-space: nowrap;
  opacity: 0; transition: opacity 320ms ease;
}
#${HINT_ID}.zh-show { opacity: 1; }
`;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

export interface ActionButtonsCallbacks {
  onAttack: () => void;
  /** O dedo SAIU do A. E o botao que carrega a lamina rodopiante, entao soltar e um gesto. */
  onAttackRelease?: () => void;
  onUse: () => void;
}

export class ActionButtons {
  private readonly root: HTMLDivElement;

  public constructor(cb: ActionButtonsCallbacks) {
    ensureStyle();
    this.root = document.createElement('div');
    this.root.id = ROOT_ID;
    this.root.setAttribute('data-zh-ui', '');

    this.root.appendChild(this.button('B', 'zh-act zh-b', t('controls.useTitle'), cb.onUse));
    this.root.appendChild(this.button(
      'A', 'zh-act zh-a', t('controls.attackTitle'), cb.onAttack, cb.onAttackRelease,
    ));
    document.body.appendChild(this.root);
  }

  private button(
    label: string,
    className: string,
    title: string,
    onTap: () => void,
    onRelease?: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.textContent = label;
    btn.title = title;
    // `touchstart` e nao `click`: um golpe tem de sair no instante em que o dedo encosta —
    // o atraso do clique sintetico (~100ms+) e a diferenca entre acertar e apanhar.
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); onTap(); }, { passive: false });
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); onTap(); });
    if (onRelease) {
      // Soltar tem de valer mesmo quando o dedo escorrega pra fora do circulo, senao a carga
      // fica presa e o proximo toque nao dispara nada.
      const release = (e: Event): void => { e.preventDefault(); onRelease(); };
      btn.addEventListener('touchend', release, { passive: false });
      btn.addEventListener('touchcancel', release, { passive: false });
      btn.addEventListener('mouseup', release);
      btn.addEventListener('mouseleave', release);
    }
    return btn;
  }

  public setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'flex' : 'none';
  }

  public destroy(): void {
    this.root.remove();
  }
}

/**
 * A tarja que diz as teclas, uma vez, no comeco da partida — e some.
 *
 * E a unica excecao honesta a "o mundo ensina, o HUD nao": o mundo pode ensinar que uma arvore
 * cai no machado, mas nao ha como um pinheiro dizer que a tecla e X. Ela morre em segundos e
 * nunca volta, entao nao e HUD; e a mesma licenca do "Travou? ↻ recomeça o level".
 */
export class ControlsHint {
  private readonly el: HTMLDivElement;
  private timer?: number;

  public constructor(text: string, showMs = 6500) {
    ensureStyle();
    this.el = document.createElement('div');
    this.el.id = HINT_ID;
    this.el.textContent = text;
    document.body.appendChild(this.el);
    requestAnimationFrame(() => this.el.classList.add('zh-show'));
    this.timer = window.setTimeout(() => this.el.classList.remove('zh-show'), showMs);
  }

  public destroy(): void {
    if (this.timer) window.clearTimeout(this.timer);
    this.el.remove();
  }
}
