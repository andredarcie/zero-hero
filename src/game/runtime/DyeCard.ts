import { t } from '@/game/i18n/i18n';
import { withKeyNames } from '@/game/runtime/accessibility';
import { CAPE_GREENS, DYE_SWATCH, type ClothDye, type ClothTarget } from '@/game/runtime/homeState';
import { HAND_FONT, INK, PAPER_SURFACE, paperTexture, seedOf, tornEdge } from '@/game/runtime/uiStyle';

/**
 * A TINA DE TINGIR, aberta (scenes/game/CampHome): um papel no terço de baixo da tela — o herói fica à vista no meio
 * dela, e a capa muda de cor ali mesmo, a cada mergulho. Duas fileiras de amostras, a CAPA e a MANTA; as setas andam, o
 * Z mergulha o pano na cor escolhida e o X fecha. No toque, tocar a amostra já tinge.
 *
 * É só a tela: quem decide o que acontece com a cor é quem a abriu (`onDye`).
 */
const ROOT_ID = 'zh-dye-card';
/** A tecla que abriu a tina não pode fechá-la no mesmo instante. */
const OPEN_GRACE_MS = 250;
const DIP_KEYS: ReadonlySet<string> = new Set(['z', 'j', ' ', 'enter']);
const CLOSE_KEYS: ReadonlySet<string> = new Set(['escape', 'x', 'k']);
const ROWS: readonly ClothTarget[] = ['cape', 'blanket'];

/** A amostra de cada pano sem tinta: o verde da capa, e o cru listrado de azul da manta de sempre. */
const NATURAL_SWATCH: Readonly<Record<ClothTarget, string>> = {
  cape: CAPE_GREENS[0],
  blanket: 'repeating-linear-gradient(90deg, #d9d0b9 0 5px, #3a6e8e 5px 7px)',
};

const CSS = `
#${ROOT_ID} {
  position: fixed; inset: 0; z-index: 50; display: flex; align-items: flex-end; justify-content: center;
  padding: 1rem 1rem max(6vh, 1rem); background: rgba(8, 10, 14, 0.12); opacity: 0; transition: opacity 240ms ease;
}
#${ROOT_ID}.zh-in { opacity: 1; }
#${ROOT_ID} .zh-dye-paper {
  width: min(540px, 94vw); padding: 18px 24px 14px; ${PAPER_SURFACE} font-family: ${HAND_FONT}; color: ${INK};
  transform: translateY(14px) rotate(-0.8deg); transition: transform 300ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
#${ROOT_ID}.zh-in .zh-dye-paper { transform: rotate(-0.8deg); }
#${ROOT_ID} .zh-dye-title { font-size: clamp(1.4rem, 3.6vw, 1.75rem); font-weight: 700; text-align: center; margin-bottom: 6px; }
#${ROOT_ID} .zh-dye-row { display: flex; align-items: center; gap: 10px; margin: 6px 0; }
#${ROOT_ID} .zh-dye-label { width: 4.6em; font-size: clamp(1.1rem, 3vw, 1.35rem); font-weight: 600; opacity: 0.55; }
#${ROOT_ID} .zh-dye-row[data-active] .zh-dye-label { opacity: 1; }
#${ROOT_ID} .zh-dye-swatches { display: flex; flex-wrap: wrap; gap: 8px; }
#${ROOT_ID} .zh-dye-swatch {
  width: 34px; height: 34px; border: 0; padding: 0; cursor: pointer; border-radius: 3px 5px 4px 6px;
  box-shadow: inset 0 0 0 2px rgba(40, 24, 13, 0.55); transition: transform 120ms ease;
}
#${ROOT_ID} .zh-dye-swatch[data-worn] { box-shadow: inset 0 0 0 2px rgba(40, 24, 13, 0.55), 0 0 0 3px #f4ead2, 0 0 0 5px ${INK}; }
#${ROOT_ID} .zh-dye-row[data-active] .zh-dye-swatch[data-cursor] { transform: translateY(-4px) rotate(-4deg) scale(1.12); }
#${ROOT_ID} .zh-dye-name { text-align: center; font-size: clamp(1.15rem, 3.2vw, 1.4rem); min-height: 1.4em; margin-top: 4px; }
#${ROOT_ID} .zh-dye-foot { text-align: center; font-size: 1rem; opacity: 0.7; margin-top: 2px; }
`;

export interface DyeCardView {
  /** As cores que a tina já tem (a natural sempre). */
  dyes: readonly ClothDye[];
  /** O que cada pano está vestindo agora. */
  worn: Readonly<Record<ClothTarget, ClothDye>>;
  touch: boolean;
}

export interface DyeCardCallbacks {
  onDye: (target: ClothTarget, dye: ClothDye) => void;
  onClose: () => void;
}

export class DyeCard {
  private readonly root: HTMLDivElement;
  private readonly openedAt: number;
  private readonly worn: Record<ClothTarget, ClothDye>;
  private row = 0;
  private col = 0;
  private closed = false;

  public constructor(
    private readonly view: DyeCardView,
    private readonly cb: DyeCardCallbacks,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.openedAt = now();
    this.worn = { ...view.worn };
    this.col = Math.max(0, view.dyes.indexOf(this.worn.cape));
    this.root = document.createElement('div');
    this.root.id = ROOT_ID;
    const style = document.createElement('style');
    style.textContent = CSS;
    this.root.appendChild(style);
    this.root.appendChild(this.paper());
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.handleKey, true);
    window.requestAnimationFrame(() => this.root.classList.add('zh-in'));
    this.render();
  }

  public get element(): HTMLDivElement {
    return this.root;
  }

  /** A amostra que o cursor aponta agora: a fileira (capa ou manta) e a cor. */
  public get cursor(): { target: ClothTarget; dye: ClothDye } {
    return { target: ROWS[this.row], dye: this.view.dyes[this.col] };
  }

  /** Mergulha o pano da fileira na cor: a tela marca a nova, e quem abriu a tina tinge de verdade. */
  public dip(target: ClothTarget, dye: ClothDye): void {
    if (this.closed || !this.view.dyes.includes(dye)) return;
    this.row = ROWS.indexOf(target);
    this.col = this.view.dyes.indexOf(dye);
    if (this.worn[target] !== dye) {
      this.worn[target] = dye;
      this.cb.onDye(target, dye);
    }
    this.render();
  }

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

  private paper(): HTMLDivElement {
    const paper = document.createElement('div');
    paper.className = 'zh-dye-paper';
    const texture = paperTexture();
    if (texture) paper.style.backgroundImage = `url(${texture})`;
    paper.style.clipPath = tornEdge(seedOf('dye-tub'), 0.7);
    const title = document.createElement('div');
    title.className = 'zh-dye-title';
    title.textContent = t('home.tub.title');
    paper.appendChild(title);
    ROWS.forEach((target, row) => {
      const line = document.createElement('div');
      line.className = 'zh-dye-row';
      line.dataset.target = target;
      const label = document.createElement('div');
      label.className = 'zh-dye-label';
      label.textContent = t(`home.tub.${target}`);
      const swatches = document.createElement('div');
      swatches.className = 'zh-dye-swatches';
      this.view.dyes.forEach((dye) => {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'zh-dye-swatch';
        swatch.dataset.dye = dye;
        swatch.setAttribute('aria-label', `${t(`home.tub.${target}`)}: ${t(`home.dye.${dye}`)}`);
        swatch.style.background = dye === 'natural' ? NATURAL_SWATCH[target] : DYE_SWATCH[dye];
        swatch.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.row = row;
          this.dip(target, dye);
        });
        swatches.appendChild(swatch);
      });
      line.append(label, swatches);
      paper.appendChild(line);
    });
    const name = document.createElement('div');
    name.className = 'zh-dye-name';
    const foot = document.createElement('div');
    foot.className = 'zh-dye-foot';
    foot.textContent = withKeyNames(t(this.view.touch ? 'home.tub.keysTouch' : 'home.tub.keys'));
    paper.append(name, foot);
    return paper;
  }

  private render(): void {
    this.root.querySelectorAll<HTMLElement>('.zh-dye-row').forEach((line, row) => {
      line.toggleAttribute('data-active', row === this.row);
      const target = line.dataset.target as ClothTarget;
      line.querySelectorAll<HTMLElement>('.zh-dye-swatch').forEach((swatch, col) => {
        swatch.toggleAttribute('data-worn', swatch.dataset.dye === this.worn[target]);
        swatch.toggleAttribute('data-cursor', col === this.col);
      });
    });
    const name = this.root.querySelector('.zh-dye-name');
    if (name) name.textContent = t(`home.dye.${this.view.dyes[this.col]}`);
  }

  private readonly handleKey = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    // Nada do que se aperta com a tina aberta chega ao jogo.
    event.stopPropagation();
    event.preventDefault();
    const key = event.key.toLowerCase();
    const early = event.repeat || this.now() - this.openedAt < OPEN_GRACE_MS;
    if (CLOSE_KEYS.has(key)) { if (!early) this.close(); return; }
    if (DIP_KEYS.has(key)) { if (!early) this.dip(ROWS[this.row], this.view.dyes[this.col]); return; }
    const n = this.view.dyes.length;
    if (key === 'arrowright' || key === 'd') this.col = (this.col + 1) % n;
    else if (key === 'arrowleft' || key === 'a') this.col = (this.col + n - 1) % n;
    else if (key === 'arrowdown' || key === 's' || key === 'arrowup' || key === 'w') {
      this.row = (this.row + 1) % ROWS.length;
      this.col = Math.max(0, this.view.dyes.indexOf(this.worn[ROWS[this.row]]));
    } else return;
    this.render();
  };

  private detach(): void {
    window.removeEventListener('keydown', this.handleKey, true);
    this.root.remove();
  }
}
