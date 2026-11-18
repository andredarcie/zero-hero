import { HAND_FONT, PAPER_SURFACE, paperTexture, seedOf, tornEdge } from '@/game/runtime/uiStyle';

/**
 * O BILHETE DA MANHÃ SEGUINTE (pedido do autor, 2026-11-17): depois dos créditos o Zero acorda no acampamento, e o
 * jogo avisa que a aventura principal acabou e o vale continua aberto. É papel escrito a pena — o material do que o
 * herói escreve e guarda (ver uiStyle) —, como a nota do caderno no fim da meditação.
 *
 * Fecha com qualquer tecla, clique ou toque, depois de um respiro (a tecla que estava apertada não pode fechá-lo no
 * mesmo instante em que aparece). A tecla que fecha é do bilhete: não chega ao jogo, para não virar passo nem pausa.
 */
const ROOT_ID = 'zh-afterword';
/** O respiro antes de qualquer gesto fechar o bilhete. */
export const AFTERWORD_BREATH_MS = 700;

const CSS = `
/* No terço de baixo da tela: o herói que acabou de levantar fica à vista, no meio dela. */
#${ROOT_ID} {
  position: fixed; inset: 0; z-index: 50; display: flex; align-items: flex-end; justify-content: center;
  padding: 1rem 1rem max(9vh, 1.5rem); background: rgba(8, 10, 14, 0.2); opacity: 0; transition: opacity 420ms ease;
}
#${ROOT_ID}.zh-in { opacity: 1; }
#${ROOT_ID} .zh-afterword-card {
  width: min(460px, 92vw); padding: 26px 28px 22px; ${PAPER_SURFACE} text-align: center;
  font-family: ${HAND_FONT}; font-size: clamp(1.25rem, 3.4vw, 1.6rem); line-height: 1.25;
  transform: translateY(16px) rotate(-1.2deg); transition: transform 420ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
#${ROOT_ID}.zh-in .zh-afterword-card { transform: rotate(-1.2deg); }
`;

export class AfterwordNote {
  private readonly root: HTMLDivElement;
  private readonly shownAt: number;
  private closed = false;

  public constructor(
    text: string,
    private readonly onClose: () => void,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.shownAt = now();
    const root = document.createElement('div');
    root.id = ROOT_ID;
    const style = document.createElement('style');
    style.textContent = CSS;
    const card = document.createElement('div');
    card.className = 'zh-afterword-card';
    const paper = paperTexture();
    if (paper) card.style.backgroundImage = `url(${paper})`;
    card.style.clipPath = tornEdge(seedOf(text), 0.8);
    card.textContent = text;
    root.append(style, card);
    document.body.appendChild(root);
    this.root = root;
    window.requestAnimationFrame(() => root.classList.add('zh-in'));
    window.addEventListener('keydown', this.onKey, true);
    root.addEventListener('pointerdown', this.onPointer);
  }

  /** O bilhete inteiro, para quem precisa olhar (o teste). */
  public get element(): HTMLDivElement {
    return this.root;
  }

  /** Tira o bilhete na hora, sem `onClose` (a cena saiu por outro caminho). */
  public destroy(): void {
    if (this.closed) return;
    this.closed = true;
    this.detach();
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    this.tryClose();
  };

  private readonly onPointer = (event: PointerEvent): void => {
    event.preventDefault();
    this.tryClose();
  };

  private tryClose(): void {
    if (this.closed || this.now() - this.shownAt < AFTERWORD_BREATH_MS) return;
    this.closed = true;
    this.detach();
    this.onClose();
  }

  private detach(): void {
    window.removeEventListener('keydown', this.onKey, true);
    this.root.removeEventListener('pointerdown', this.onPointer);
    this.root.remove();
  }
}
