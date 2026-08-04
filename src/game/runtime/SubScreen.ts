import type Phaser from 'phaser';

/**
 * A SUBTELA — o inventario do Zelda, e a unica tela do jogo que mostra numeros do heroi.
 *
 * Ela NAO e HUD, e a diferenca nao e semantica: HUD e o que fica na cara do jogador sem ele
 * pedir. A subtela so existe enquanto esta aberta, congela o jogo enquanto isso (ela mora
 * dentro do menu de pausa, que ja faz `scene.pause()`) e some. Foi essa licenca que o
 * ShopOverlay e o PauseMenu ja usavam; a lei "o mundo ensina, o HUD nao" continua de pe.
 *
 * Duas regras de desenho, e as duas vem do plano:
 *   - **Nada de numero onde um desenho serve.** Vida e uma fileira de coracoes desenhados, e
 *     nao "3/16". A contagem so aparece onde ela e mesmo uma quantidade (tres gravetos), e
 *     mesmo ai como uma etiqueta pequena em cima do icone, nunca como uma linha de texto.
 *   - **A arte e a mesma do jogo.** Os icones sao os proprios frames do Phaser desenhados num
 *     canvas e virados em data URL (`spriteDataUrl`), com NEAREST e sem suavizacao — um
 *     inventario com arte propria seria uma segunda gramatica para os mesmos objetos.
 */

const STYLE_ID = 'zh-subscreen-style';

const CSS = `
.zh-sub {
  margin: 0 0 1.1em;
  border: 1px solid #3d342a; background: #0f0c09;
  padding: 0.9em 0.9em 1em;
}
.zh-sub h2 {
  margin: 0 0 0.7em; text-align: center;
  font-size: 0.85em; font-weight: 700; letter-spacing: 0.34em; text-indent: 0.34em;
  color: #b9ae94;
}
.zh-sub-hearts {
  display: flex; flex-wrap: wrap; justify-content: center; gap: 3px;
  margin: 0 0 0.9em;
}
.zh-sub-heart {
  width: 22px; height: 22px;
  background-repeat: no-repeat; background-size: contain; background-position: center;
  image-rendering: pixelated;
}
.zh-sub-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(46px, 1fr));
  gap: 6px;
}
.zh-sub-slot {
  position: relative; aspect-ratio: 1;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid #2e2820; background: #171310;
  cursor: pointer; user-select: none;
  transition: border-color 90ms ease, background 90ms ease;
}
.zh-sub-slot:hover { border-color: #6b5c46; background: #221b14; }
.zh-sub-slot.zh-on {
  border-color: #d4c8a4; background: #2a2115;
  box-shadow: inset 0 0 0 1px rgba(212, 200, 164, 0.35);
}
.zh-sub-slot img {
  width: 76%; height: 76%; object-fit: contain; image-rendering: pixelated;
  pointer-events: none;
}
.zh-sub-count {
  position: absolute; right: 2px; bottom: 1px;
  font-size: 10px; line-height: 1; color: #e7dcc4;
  text-shadow: 0 1px 0 #000, 1px 0 0 #000, -1px 0 0 #000, 0 -1px 0 #000;
  pointer-events: none;
}
.zh-sub-empty { text-align: center; color: #7d7666; font-size: 0.88em; padding: 0.6em 0; }
.zh-sub-name {
  margin: 0.7em 0 0; text-align: center; min-height: 1.2em;
  color: #cfc9ba; font-size: 0.88em;
}
`;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

// Um frame ja desenhado vira data URL uma vez e fica. A arte e estatica e a chave e
// (textura, frame, escala), entao o cache atravessa aberturas da subtela e ate restarts —
// abrir a mochila nao pode custar um redesenho de canvas por icone.
const urlCache = new Map<string, string>();

/**
 * Um frame do Phaser como data URL, ampliado com NEAREST (o jeito pixel-art). Serve para
 * qualquer textura carregada OU gerada em runtime (o balde e o carvao sao desenhados no boot),
 * porque as duas terminam como imagem/canvas dentro do TextureManager.
 */
export const spriteDataUrl = (
  scene: Phaser.Scene,
  key: string,
  frame: number,
  scale = 4,
): string => {
  const id = `${key}:${frame}:${scale}`;
  const cached = urlCache.get(id);
  if (cached) return cached;

  const texture = scene.textures.get(key);
  const f = texture.get(frame);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, f.cutWidth * scale);
  canvas.height = Math.max(1, f.cutHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    f.source.image as CanvasImageSource,
    f.cutX, f.cutY, f.cutWidth, f.cutHeight,
    0, 0, canvas.width, canvas.height,
  );
  const url = canvas.toDataURL();
  urlCache.set(id, url);
  return url;
};

export interface SubScreenItem {
  kind: string;
  /** data URL do icone (spriteDataUrl) */
  icon: string;
  count: number;
  label: string;
}

export interface SubScreenView {
  title: string;
  emptyLabel: string;
  /** `icon` e o coracao CHEIO, `emptyIcon` o vazio — dois desenhos, nunca um com opacidade. */
  hearts: { max: number; filled: number; icon: string; emptyIcon: string };
  items: SubScreenItem[];
  selected: string;
}

/**
 * O painel do inventario, embutido no topo do menu de pausa. Ele nao guarda estado: le a
 * `view` de volta da cena a cada desenho, entao escolher um item e um caminho so (a cena troca
 * o item do B, o painel pergunta como ficou).
 */
export class SubScreenPanel {
  public readonly el: HTMLDivElement;
  private readonly heartsRow: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly name: HTMLParagraphElement;
  private readonly title: HTMLHeadingElement;

  public constructor(
    private readonly read: () => SubScreenView,
    private readonly onSelect: (kind: string) => void,
  ) {
    ensureStyle();
    this.el = document.createElement('div');
    this.el.className = 'zh-sub';

    this.title = document.createElement('h2');
    this.heartsRow = document.createElement('div');
    this.heartsRow.className = 'zh-sub-hearts';
    this.grid = document.createElement('div');
    this.grid.className = 'zh-sub-grid';
    this.name = document.createElement('p');
    this.name.className = 'zh-sub-name';

    this.el.append(this.title, this.heartsRow, this.grid, this.name);
    this.render();
  }

  /** Setas esquerda/direita andam na grade — o polegar do NES escolhendo o item do B. */
  public step(delta: number): void {
    const view = this.read();
    if (view.items.length === 0) return;
    const at = view.items.findIndex((it) => it.kind === view.selected);
    const next = Math.max(0, Math.min(view.items.length - 1, at + delta));
    this.onSelect(view.items[next].kind);
    this.render();
  }

  public render(): void {
    const view = this.read();
    this.title.textContent = view.title;

    // A vida em coracoes DESENHADOS: o gasto fica no lugar, VAZIO. Sao dois frames da mesma arte
    // (ui/hearts.png), e nao o mesmo coracao com opacidade — o pixel art ja sabe dizer "vazio",
    // e um coracao cheio a 30% de opacidade num painel escuro nao diz nada.
    this.heartsRow.replaceChildren();
    for (let i = 0; i < view.hearts.max; i += 1) {
      const heart = document.createElement('div');
      heart.className = 'zh-sub-heart';
      heart.style.backgroundImage = `url(${i < view.hearts.filled ? view.hearts.icon : view.hearts.emptyIcon})`;
      this.heartsRow.appendChild(heart);
    }

    this.grid.replaceChildren();
    if (view.items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'zh-sub-empty';
      empty.textContent = view.emptyLabel;
      this.grid.appendChild(empty);
      this.name.textContent = '';
      return;
    }

    for (const item of view.items) {
      const slot = document.createElement('div');
      slot.className = item.kind === view.selected ? 'zh-sub-slot zh-on' : 'zh-sub-slot';
      slot.title = item.label;
      const img = document.createElement('img');
      img.src = item.icon;
      img.alt = item.label;
      slot.appendChild(img);
      if (item.count > 1) {
        const count = document.createElement('span');
        count.className = 'zh-sub-count';
        count.textContent = String(item.count);
        slot.appendChild(count);
      }
      slot.addEventListener('click', () => {
        this.onSelect(item.kind);
        this.render();
      });
      this.grid.appendChild(slot);
    }

    const chosen = view.items.find((it) => it.kind === view.selected);
    this.name.textContent = chosen ? chosen.label : '';
  }
}
