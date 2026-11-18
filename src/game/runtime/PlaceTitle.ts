import { HAND_FONT, INK, PAPER_SURFACE, paperTexture, seedOf, tornEdge } from '@/game/runtime/uiStyle';

/**
 * UMA TIRA DE PAPEL ESCRITA À MÃO no alto da tela, que aparece, fica um pouco e some sozinha — sem tecla nenhuma, sem
 * parar o jogo. É o nome do acampamento quando o herói chega em casa (scenes/game/CampHome), e a hora que o relógio de
 * sol marca. Papel e pena: é o que o herói escreve (ver uiStyle).
 */
const CLASS = 'zh-place-title';
export const PLACE_TITLE_TIMES = { inMs: 700, holdMs: 2600, outMs: 900 } as const;

const CSS = `
.${CLASS} {
  position: fixed; left: 50%; top: max(7vh, 1.2rem); z-index: 40; pointer-events: none;
  transform: translate(-50%, -8px) rotate(-1.5deg); opacity: 0;
  transition: opacity ${PLACE_TITLE_TIMES.inMs}ms ease, transform ${PLACE_TITLE_TIMES.inMs}ms ease;
  padding: 8px 26px 10px; ${PAPER_SURFACE} font-family: ${HAND_FONT}; color: ${INK}; text-align: center; white-space: nowrap;
}
.${CLASS}.zh-in { opacity: 1; transform: translate(-50%, 0) rotate(-1.5deg); }
.${CLASS}.zh-out { opacity: 0; transition-duration: ${PLACE_TITLE_TIMES.outMs}ms; }
.${CLASS} .zh-place-main { font-size: clamp(1.6rem, 4.6vw, 2.3rem); font-weight: 700; line-height: 1.1; }
.${CLASS} .zh-place-sub { font-size: clamp(1rem, 2.6vw, 1.2rem); opacity: 0.7; }
`;

/** O estilo mora no `<head>`, uma vez só: a tira aparece muitas vezes, e o texto dela fica só o texto. */
const STYLE_ID = 'zh-place-title-style';
const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

export class PlaceTitle {
  private readonly root: HTMLDivElement;
  private readonly timers: number[] = [];
  private gone = false;

  public constructor(private readonly main: string, private readonly sub = '', private readonly onGone: () => void = () => {}) {
    ensureStyle();
    this.root = document.createElement('div');
    this.root.className = CLASS;
    this.root.setAttribute('role', 'status');
    const texture = paperTexture();
    if (texture) this.root.style.backgroundImage = `url(${texture})`;
    this.root.style.clipPath = tornEdge(seedOf(main), 0.6);
    const line = document.createElement('div');
    line.className = 'zh-place-main';
    line.textContent = main;
    this.root.appendChild(line);
    if (sub) {
      const small = document.createElement('div');
      small.className = 'zh-place-sub';
      small.textContent = sub;
      this.root.appendChild(small);
    }
    document.body.appendChild(this.root);
    window.requestAnimationFrame(() => this.root.classList.add('zh-in'));
    this.timers.push(window.setTimeout(() => this.root.classList.add('zh-out'), PLACE_TITLE_TIMES.inMs + PLACE_TITLE_TIMES.holdMs));
    this.timers.push(window.setTimeout(() => this.destroy(), PLACE_TITLE_TIMES.inMs + PLACE_TITLE_TIMES.holdMs + PLACE_TITLE_TIMES.outMs));
  }

  public get element(): HTMLDivElement {
    return this.root;
  }

  /** O que está escrito: a linha grande e, se houver, a pequena embaixo. */
  public get text(): string {
    return this.sub ? `${this.main} · ${this.sub}` : this.main;
  }

  public get isGone(): boolean {
    return this.gone;
  }

  public destroy(): void {
    if (this.gone) return;
    this.gone = true;
    for (const id of this.timers) window.clearTimeout(id);
    this.root.remove();
    this.onGone();
  }
}
