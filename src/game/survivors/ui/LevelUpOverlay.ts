import { iconUrl } from '../SurvivorsConfig';
import type { UpgradeChoice } from '../choices';

// ── O modal de level-up (o momento-decisão do VS) ─────────────────────────────
//
// O jogo congela (a cena chama scene.pause() antes de abrir) e 3 cartas caem na
// tela. DOM puro como todos os overlays: continua clicável com a cena pausada e
// o texto fica nítido. Teclado 1/2/3, setas+Enter ou clique.

const STYLE_ID = 'zh-survivors-levelup-style';
const ROOT_ID = 'zh-survivors-levelup';
const PIXEL = "'Press Start 2P', monospace";
const SERIF = "Georgia, 'Times New Roman', serif";

const CSS = `
#${ROOT_ID} { position: fixed; inset: 0; z-index: 55; font-family: ${SERIF}; }
#${ROOT_ID} .zhl-scrim {
  position: absolute; inset: 0; background: rgba(4, 4, 10, 0.66);
  opacity: 0; transition: opacity 160ms ease;
}
#${ROOT_ID}.zhl-in .zhl-scrim { opacity: 1; }
#${ROOT_ID} .zhl-panel {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center; gap: 14px;
  width: min(30em, calc(100vw - 2em));
}
#${ROOT_ID} h1 {
  margin: 0; font-family: ${PIXEL}; font-size: 16px; color: #ffd24a;
  text-shadow: 2px 2px 0 #000; letter-spacing: 2px;
  opacity: 0; transition: opacity 200ms ease;
}
#${ROOT_ID}.zhl-in h1 { opacity: 1; }
#${ROOT_ID} .zhl-card {
  display: flex; align-items: center; gap: 14px; width: 100%;
  box-sizing: border-box; padding: 0.8em 1em; cursor: pointer;
  background: #14100c; border: 2px solid #3d342a; color: #d8d1c0;
  opacity: 0; transform: translateY(10px);
  transition: opacity 180ms ease, transform 180ms ease, border-color 90ms ease, background 90ms ease;
}
#${ROOT_ID}.zhl-in .zhl-card { opacity: 1; transform: translateY(0); }
#${ROOT_ID} .zhl-card:hover, #${ROOT_ID} .zhl-card.zhl-sel {
  border-color: #f5c542; background: #1e1710;
}
#${ROOT_ID} .zhl-card img { width: 36px; height: 36px; image-rendering: pixelated; flex: none; }
#${ROOT_ID} .zhl-card .zhl-body { flex: 1; min-width: 0; }
#${ROOT_ID} .zhl-title { font-family: ${PIXEL}; font-size: 10px; color: #e7dcc4; margin-bottom: 5px; }
#${ROOT_ID} .zhl-badge { font-family: ${PIXEL}; font-size: 8px; color: #ffd24a; margin-left: 8px; }
#${ROOT_ID} .zhl-badge.zhl-new { color: #7dff6a; }
#${ROOT_ID} .zhl-desc { font-size: 0.85em; color: #a99f8c; }
#${ROOT_ID} .zhl-key { font-family: ${PIXEL}; font-size: 9px; color: #6b6355; flex: none; }
`;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

export class LevelUpOverlay {
  private readonly root: HTMLDivElement;
  private readonly cards: HTMLDivElement[] = [];
  private selected = 0;
  private destroyed = false;
  private picked = false;

  public constructor(
    level: number,
    private readonly choices: UpgradeChoice[],
    private readonly onPick: (choice: UpgradeChoice) => void,
  ) {
    ensureStyle();
    this.root = document.createElement('div');
    this.root.id = ROOT_ID;

    const scrim = document.createElement('div');
    scrim.className = 'zhl-scrim';
    this.root.appendChild(scrim);

    const panel = document.createElement('div');
    panel.className = 'zhl-panel';
    this.root.appendChild(panel);

    const title = document.createElement('h1');
    title.textContent = `NÍVEL ${level}!`;
    panel.appendChild(title);

    choices.forEach((choice, i) => {
      const card = document.createElement('div');
      card.className = 'zhl-card';
      card.style.transitionDelay = `${80 + i * 90}ms`;

      const img = document.createElement('img');
      img.src = iconUrl(choice.icon);

      const body = document.createElement('div');
      body.className = 'zhl-body';
      const titleRow = document.createElement('div');
      titleRow.className = 'zhl-title';
      titleRow.textContent = choice.title;
      const badge = document.createElement('span');
      badge.className = choice.badge === 'NOVO!' ? 'zhl-badge zhl-new' : 'zhl-badge';
      badge.textContent = choice.badge;
      titleRow.appendChild(badge);
      const desc = document.createElement('div');
      desc.className = 'zhl-desc';
      desc.textContent = choice.desc;
      body.append(titleRow, desc);

      const key = document.createElement('div');
      key.className = 'zhl-key';
      key.textContent = `[${i + 1}]`;

      card.append(img, body, key);
      card.addEventListener('click', () => this.pick(i));
      card.addEventListener('mouseenter', () => this.select(i));
      panel.appendChild(card);
      this.cards.push(card);
    });

    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.handleKeyDown, true);
    this.select(0);
    requestAnimationFrame(() => { if (!this.destroyed) this.root.classList.add('zhl-in'); });
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('keydown', this.handleKeyDown, true);
    this.root.remove();
  }

  private select(i: number): void {
    this.selected = i;
    this.cards.forEach((c, k) => c.classList.toggle('zhl-sel', k === i));
  }

  private pick(i: number): void {
    // Trava de duplo-disparo: um clique + Enter no mesmo frame escolheria duas vezes.
    if (this.picked || this.destroyed) return;
    this.picked = true;
    this.onPick(this.choices[i]);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.destroyed) return;
    event.stopPropagation();
    if (event.key === '1' || event.key === '2' || event.key === '3') {
      const i = Number(event.key) - 1;
      if (i < this.choices.length) this.pick(i);
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
      this.select((this.selected + this.choices.length - 1) % this.choices.length);
      event.preventDefault();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') {
      this.select((this.selected + 1) % this.choices.length);
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      this.pick(this.selected);
      event.preventDefault();
    }
  };
}
