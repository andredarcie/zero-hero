import { t } from '@/game/i18n/i18n';
import { setKeyCapture } from '@/game/runtime/accessibility';
import { isPadEvent, usingPad } from '@/game/runtime/gamepad';
import { PadKeyboard } from '@/game/runtime/PadKeyboard';
import { HOME_NAME_MAX, cleanHomeName } from '@/game/runtime/homeState';
import { HAND_FONT, INK, PAPER_SURFACE, paperTexture, seedOf, tornEdge } from '@/game/runtime/uiStyle';

/**
 * A PLACA DO ACAMPAMENTO, aberta (scenes/game/CampHome): um papel com uma linha para escrever o nome do lugar, à mão.
 * Enter escreve, Esc deixa como estava; no toque, os dois botões de pena. O que se digita é da placa: nenhuma tecla
 * chega ao jogo, e a troca de teclas (runtime/accessibility) para enquanto ela está aberta — senão uma letra remapeada
 * viraria um Z do jogo no meio do nome. O CONTROLE não digita: com ele, a placa ganha um teclado de letras no papel
 * (runtime/PadKeyboard), aberto já na hora se o jogador está no controle, ou no primeiro botão dele.
 */
const ROOT_ID = 'zh-name-card';

const CSS = `
#${ROOT_ID} {
  position: fixed; inset: 0; z-index: 50; display: flex; align-items: flex-end; justify-content: center;
  padding: 1rem 1rem max(8vh, 1rem); background: rgba(8, 10, 14, 0.18); opacity: 0; transition: opacity 240ms ease;
}
#${ROOT_ID}.zh-in { opacity: 1; }
#${ROOT_ID} .zh-name-paper {
  width: min(480px, 94vw); padding: 20px 26px 14px; ${PAPER_SURFACE} font-family: ${HAND_FONT}; color: ${INK}; text-align: center;
  transform: translateY(14px) rotate(1deg); transition: transform 300ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
#${ROOT_ID}.zh-in .zh-name-paper { transform: rotate(1deg); }
#${ROOT_ID} .zh-name-title { font-size: clamp(1.3rem, 3.4vw, 1.6rem); font-weight: 600; }
#${ROOT_ID} .zh-name-input {
  width: 100%; margin: 8px 0 6px; padding: 2px 4px; border: 0; border-bottom: 2px solid ${INK}; outline: none;
  background: transparent; color: ${INK}; font-family: ${HAND_FONT}; font-weight: 700; text-align: center;
  font-size: clamp(1.7rem, 5vw, 2.2rem);
}
#${ROOT_ID} .zh-name-input::placeholder { color: rgba(40, 24, 13, 0.32); }
#${ROOT_ID} .zh-name-actions { display: flex; justify-content: center; gap: 28px; }
#${ROOT_ID} .zh-name-actions button {
  border: 0; background: transparent; color: ${INK}; cursor: pointer; font-family: ${HAND_FONT}; font-weight: 700;
  font-size: clamp(1.2rem, 3.2vw, 1.4rem); text-decoration: underline wavy rgba(40, 24, 13, 0.45); padding: 4px 6px;
}
#${ROOT_ID} .zh-name-foot { font-size: 1rem; opacity: 0.7; margin-top: 2px; }
`;

export interface NameCardCallbacks {
  /** O nome novo, já limpo (vazio = a placa volta a ficar em branco). */
  onWrite: (name: string) => void;
  onClose: () => void;
}

export class NameCard {
  private readonly root: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly paper: HTMLDivElement;
  private readonly foot: HTMLDivElement;
  private padKeys?: PadKeyboard;
  private closed = false;

  public constructor(current: string, placeholder: string, private readonly cb: NameCardCallbacks, touch = false) {
    this.root = document.createElement('div');
    this.root.id = ROOT_ID;
    const style = document.createElement('style');
    style.textContent = CSS;
    const paper = document.createElement('div');
    this.paper = paper;
    paper.className = 'zh-name-paper';
    const texture = paperTexture();
    if (texture) paper.style.backgroundImage = `url(${texture})`;
    paper.style.clipPath = tornEdge(seedOf('camp-sign'), 0.7);
    const title = document.createElement('div');
    title.className = 'zh-name-title';
    title.textContent = t('home.sign.title');
    this.input = document.createElement('input');
    this.input.className = 'zh-name-input';
    this.input.type = 'text';
    this.input.maxLength = HOME_NAME_MAX;
    this.input.value = current;
    this.input.placeholder = placeholder;
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.input.setAttribute('aria-label', t('home.sign.title'));
    paper.addEventListener('keydown', this.handleKey);
    paper.addEventListener('keyup', this.swallow);
    paper.addEventListener('keypress', this.swallow);
    const actions = document.createElement('div');
    actions.className = 'zh-name-actions';
    actions.append(this.button(t('home.sign.write'), () => this.write()), this.button(t('home.sign.cancel'), () => this.close()));
    const foot = document.createElement('div');
    this.foot = foot;
    foot.className = 'zh-name-foot';
    foot.textContent = t(touch ? 'home.sign.keysTouch' : 'home.sign.keys');
    paper.append(title, this.input, actions, foot);
    this.root.append(style, paper);
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.handleOutside, true);
    setKeyCapture(true);
    const pad = usingPad();
    window.requestAnimationFrame(() => {
      this.root.classList.add('zh-in');
      // No controle a linha não ganha o foco: num celular ou tablet, o foco abriria o teclado do aparelho por cima.
      if (!pad) this.input.focus();
      this.input.select();
    });
    if (pad) this.openPadKeys();
  }

  /** O teclado de letras do controle, embaixo da linha (uma vez só). */
  private openPadKeys(): PadKeyboard {
    if (this.padKeys) return this.padKeys;
    this.padKeys = new PadKeyboard({ input: this.input, write: () => this.write(), close: () => this.close() });
    this.input.after(this.padKeys.element);
    this.foot.textContent = t('home.sign.keysPad');
    this.paper.style.width = 'min(560px, 96vw)';
    return this.padKeys;
  }

  public get element(): HTMLDivElement {
    return this.root;
  }

  /** Escreve o que está na linha (Enter, ou o botão). */
  public write(): void {
    if (this.closed) return;
    this.closed = true;
    const name = cleanHomeName(this.input.value);
    this.detach();
    this.cb.onWrite(name);
    this.cb.onClose();
  }

  /** Deixa a placa como estava. */
  public close(): void {
    if (this.closed) return;
    this.closed = true;
    this.detach();
    this.cb.onClose();
  }

  /** Fecha SEM avisar a cena: a saída de emergência do desmonte. */
  public destroy(): void {
    if (this.closed) return;
    this.closed = true;
    this.detach();
  }

  private button(label: string, act: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); act(); });
    return b;
  }

  private readonly swallow = (event: KeyboardEvent): void => { event.stopPropagation(); };

  /** Com o foco fora da linha (um clique no papel), a tecla também é da placa: o Esc fecha, o resto volta à linha. */
  private readonly handleOutside = (event: KeyboardEvent): void => {
    // O botão do controle é do teclado de letras, esteja o foco onde estiver.
    if (isPadEvent(event)) {
      event.stopPropagation();
      event.preventDefault();
      this.openPadKeys().key(event);
      return;
    }
    if (event.target instanceof Node && this.root.contains(event.target)) return;
    event.stopPropagation();
    event.preventDefault();
    if (event.key === 'Escape') this.close();
    else if (event.key === 'Enter') this.write();
    else this.input.focus();
  };

  /** A tecla na linha (ou num botão do papel) não sobe para o jogo; Enter e Esc são da placa. */
  private readonly handleKey = (event: KeyboardEvent): void => {
    event.stopPropagation();
    if (event.key === 'Enter') { event.preventDefault(); this.write(); }
    else if (event.key === 'Escape') { event.preventDefault(); this.close(); }
  };

  private detach(): void {
    window.removeEventListener('keydown', this.handleOutside, true);
    setKeyCapture(false);
    this.root.remove();
  }
}
