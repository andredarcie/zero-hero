import { t } from '@/game/i18n/i18n';
import { applyTouchSettings, haptic } from '@/game/runtime/touchSettings';

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
 *
 * O botao diz o que FAZ: o A leva a MAO (falar, acender, abrir — nada no A e golpe), o B leva o
 * ITEM que esta na mao, trocado a cada troca de selecao (`setUseIcon`). A letra continua, pequena
 * no canto, porque e ela que o balao sobre o NPC mostra ("A"): o desenho diz o que o botao faz, a
 * letra liga o botao ao aviso do mundo.
 *
 * As preferencias de toque (canhoto, botoes grandes, botoes solidos, vibracao) moram em
 * touchSettings e chegam aqui como classes no <body>.
 */

const STYLE_ID = 'zh-action-style';
const ROOT_ID = 'zh-action-pad';
const HINT_ID = 'zh-controls-hint';
const STICK_ID = 'zh-touch-stick';
const SERIF = "Georgia, 'Times New Roman', 'Book Antiqua', serif";

/** A MAO aberta, em pixel art (12×12): falar, acender, abrir. */
const HAND_SVG = `<svg viewBox="0 0 12 12" width="30" height="30" shape-rendering="crispEdges" aria-hidden="true" fill="currentColor">
<rect x="3" y="2" width="1" height="5"/><rect x="5" y="1" width="1" height="6"/>
<rect x="7" y="2" width="1" height="5"/><rect x="9" y="3" width="1" height="4"/>
<rect x="1" y="5" width="1" height="2"/><rect x="2" y="6" width="1" height="3"/>
<rect x="3" y="6" width="7" height="3"/><rect x="4" y="9" width="5" height="2"/></svg>`;
/** Mao vazia no B: um losango vazado — "nada selecionado", sem prometer gesto nenhum. */
const EMPTY_USE_SVG = `<svg viewBox="0 0 12 12" width="22" height="22" shape-rendering="crispEdges" aria-hidden="true" fill="currentColor">
<rect x="5" y="1" width="2" height="1"/><rect x="4" y="2" width="1" height="1"/><rect x="7" y="2" width="1" height="1"/>
<rect x="3" y="3" width="1" height="1"/><rect x="8" y="3" width="1" height="1"/>
<rect x="2" y="4" width="1" height="1"/><rect x="9" y="4" width="1" height="1"/>
<rect x="1" y="5" width="1" height="2"/><rect x="10" y="5" width="1" height="2"/>
<rect x="2" y="7" width="1" height="1"/><rect x="9" y="7" width="1" height="1"/>
<rect x="3" y="8" width="1" height="1"/><rect x="8" y="8" width="1" height="1"/>
<rect x="4" y="9" width="1" height="1"/><rect x="7" y="9" width="1" height="1"/>
<rect x="5" y="10" width="2" height="1"/></svg>`;

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
  position: relative;
  width: 62px; height: 62px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; cursor: pointer;
  /* Contraste de componente (WCAG 1.4.11, 3:1): o fundo escuro e a borda clara seguram o botao
     contra o chao claro do dia sem virar um disco opaco por cima do mundo. */
  background: rgba(10, 8, 6, 0.52); border: 2px solid rgba(231, 220, 196, 0.6);
  color: #e7dcc4;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none;
  transition: background 90ms ease, color 90ms ease, transform 90ms ease;
}
#${ROOT_ID} .zh-act img {
  width: 34px; height: 34px; object-fit: contain; image-rendering: pixelated; pointer-events: none;
}
#${ROOT_ID} .zh-act .zh-key {
  position: absolute; right: 7px; bottom: 5px;
  font-size: 12px; font-weight: 700; line-height: 1; letter-spacing: 0;
  color: rgba(231, 220, 196, 0.85); pointer-events: none;
}
/* B fica um degrau mais baixo, como no controle: os dois botoes nunca sao a mesma coisa. */
#${ROOT_ID} .zh-act.zh-b { margin-bottom: 14px; }
#${ROOT_ID} .zh-act:active {
  background: rgba(212, 200, 164, 0.92); color: #241d12; transform: scale(0.94);
}
#${ROOT_ID} .zh-act:active .zh-key { color: #241d12; }
/* CANHOTO: o par vai para a esquerda, com o A na beirada (o polegar a alcanca primeiro). */
body.zh-left-hand #${ROOT_ID} {
  right: auto; left: calc(14px + env(safe-area-inset-left, 0px)); flex-direction: row-reverse;
}
body.zh-big-btns #${ROOT_ID} .zh-act { width: 80px; height: 80px; }
body.zh-big-btns #${ROOT_ID} .zh-act img { width: 44px; height: 44px; }
body.zh-big-btns #${ROOT_ID} .zh-act .zh-key { font-size: 14px; right: 9px; bottom: 7px; }
body.zh-big-btns #${ROOT_ID} .zh-act.zh-b { margin-bottom: 18px; }
body.zh-solid-btns #${ROOT_ID} .zh-act {
  background: rgba(24, 19, 12, 0.9); border-color: #e7dcc4;
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
/* No toque a tarja sobe: embaixo moram os botoes, e uma dica por cima do botao que ela explica
   esconde justamente o que ela aponta. */
#${HINT_ID}.zh-hint-top {
  bottom: auto; top: calc(64px + env(safe-area-inset-top, 0px)); font-size: 15px;
}
#${HINT_ID}.zh-show { opacity: 1; }
/* O JOYSTICK QUE APARECE: um anel onde o polegar encostou e o pomo seguindo o dedo. */
#${STICK_ID} {
  position: fixed; left: 0; top: 0; width: 96px; height: 96px; margin: -48px 0 0 -48px;
  border-radius: 50%; border: 2px solid rgba(231, 220, 196, 0.38);
  background: rgba(10, 8, 6, 0.2);
  z-index: 44; pointer-events: none; opacity: 0; transition: opacity 120ms ease;
}
#${STICK_ID}.zh-on { opacity: 1; }
#${STICK_ID} i {
  position: absolute; left: 50%; top: 50%; width: 38px; height: 38px; margin: -19px 0 0 -19px;
  border-radius: 50%; background: rgba(231, 220, 196, 0.5);
}
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
  private readonly useBtn: HTMLButtonElement;
  private useIcon: string | null | undefined = undefined;

  public constructor(cb: ActionButtonsCallbacks) {
    ensureStyle();
    applyTouchSettings();
    this.root = document.createElement('div');
    this.root.id = ROOT_ID;
    this.root.setAttribute('data-zh-ui', '');

    this.useBtn = this.button('B', 'zh-act zh-b', t('controls.useTitle'), EMPTY_USE_SVG, cb.onUse);
    this.root.appendChild(this.useBtn);
    this.root.appendChild(this.button(
      'A', 'zh-act zh-a', t('controls.attackTitle'), HAND_SVG, cb.onAttack, cb.onAttackRelease,
    ));
    document.body.appendChild(this.root);
  }

  private button(
    key: string,
    className: string,
    label: string,
    iconSvg: string,
    onTap: () => void,
    onRelease?: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = `${iconSvg}<span class="zh-key">${key}</span>`;
    // `touchstart` e nao `click`: um golpe tem de sair no instante em que o dedo encosta —
    // o atraso do clique sintetico (~100ms+) e a diferenca entre acertar e apanhar.
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); haptic(); onTap(); }, { passive: false });
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

  /**
   * O desenho do B: o ITEM que esta na mao (uma imagem pronta, `data:`), ou nada selecionado
   * (`null`) — e ai o losango vazado. So reescreve quando muda: a cena chama isto a cada troca.
   */
  public setUseIcon(src: string | null, label?: string): void {
    if (src === this.useIcon) return;
    this.useIcon = src;
    const key = '<span class="zh-key">B</span>';
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      this.useBtn.replaceChildren(img);
      this.useBtn.insertAdjacentHTML('beforeend', key);
    } else {
      this.useBtn.innerHTML = `${EMPTY_USE_SVG}${key}`;
    }
    this.useBtn.setAttribute('aria-label', label ? `${t('controls.useTitle')}: ${label}` : t('controls.useTitle'));
  }

  public setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'flex' : 'none';
  }

  public destroy(): void {
    this.root.remove();
  }
}

/**
 * O JOYSTICK QUE APARECE. O andar por toque e um arrasto em qualquer ponto da tela, e ele era
 * INVISIVEL: quem nunca jogou nao tinha como descobrir o gesto, e quem jogava nao via para onde o
 * polegar estava apontando. Agora um anel nasce onde o dedo encostou e um pomo segue o dedo — o
 * anel anda junto com a ancora (que persegue o dedo numa coleira curta, ver
 * PlayerMovementController.trackDrag), entao ele sempre conta a verdade sobre a direcao.
 */
export class TouchStick {
  private readonly el: HTMLDivElement;
  private readonly knob: HTMLElement;

  public constructor(private readonly leashPx: number) {
    ensureStyle();
    this.el = document.createElement('div');
    this.el.id = STICK_ID;
    this.knob = document.createElement('i');
    this.el.appendChild(this.knob);
    document.body.appendChild(this.el);
  }

  public show(x: number, y: number): void {
    this.el.style.transform = `translate(${x}px, ${y}px)`;
    this.knob.style.transform = '';
    this.el.classList.add('zh-on');
  }

  /** O anel na ancora, o pomo na direcao do dedo (no maximo ate a borda do anel). */
  public update(anchorX: number, anchorY: number, fingerX: number, fingerY: number): void {
    this.el.style.transform = `translate(${anchorX}px, ${anchorY}px)`;
    const dx = fingerX - anchorX;
    const dy = fingerY - anchorY;
    const len = Math.hypot(dx, dy);
    const reach = 29; // px: o pomo para na borda de dentro do anel
    const k = len > 0 ? Math.min(1, len / this.leashPx) * (reach / len) : 0;
    this.knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  }

  public hide(): void {
    this.el.classList.remove('zh-on');
  }

  public destroy(): void {
    this.el.remove();
  }
}

/**
 * A tarja que diz as teclas, uma vez, no comeco da partida — e some.
 *
 * E a unica excecao honesta a "o mundo ensina, o HUD nao": o mundo pode ensinar que uma arvore
 * cai no machado, mas nao ha como um pinheiro dizer que a tecla e X. Ela morre em segundos e
 * nunca volta, entao nao e HUD; e a mesma licenca do "Travou? ↻ recomeça o level". No toque ela
 * ensina o GESTO de andar (o arrasto nao tem botao que o anuncie) e sobe para o alto da tela.
 */
export class ControlsHint {
  private readonly el: HTMLDivElement;
  private timer?: number;

  public constructor(text: string, showMs = 6500, top = false) {
    ensureStyle();
    this.el = document.createElement('div');
    this.el.id = HINT_ID;
    if (top) this.el.classList.add('zh-hint-top');
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
