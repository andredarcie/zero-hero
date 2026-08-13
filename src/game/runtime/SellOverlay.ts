import { getSoundManager } from '@/game/audio/SoundManager';

/**
 * O MODAL DA CAIXA DE EXTRAÇÃO — quanto vender, e por quanto.
 *
 * Ele é DOM como todas as telas de decisão do jogo (o diálogo, a mesa de cartas, o catálogo da
 * bancada): texto serifado nítido, e um lugar que continua funcionando com a cena pausada.
 *
 * A gramática é a do caixa do balcão de NPC, que o jogador já viu: ←/→ mudam a quantidade, Enter
 * fecha o negócio, Esc desiste. O que ele mostra a mais é o TOTAL em moedas, atualizado a cada
 * passo — a decisão é "quanto disto virou dinheiro", e ela não pode exigir multiplicação de
 * cabeça.
 */

export type SellOverlayOptions = {
  /** O ícone do item, em data-URL (a mesma arte que a bolsa usa). */
  icon: string;
  itemLabel: string;
  coinsPerUnit: number;
  available: number;
  onConfirm: (units: number) => void;
  onCancel: () => void;
};

const ROOT_ID = 'zh-sell-root';
const STYLE_ID = 'zh-sell-style';

const CSS = `
#${ROOT_ID} {
  position: fixed; inset: 0; z-index: 70;
  display: grid; place-items: center;
  background: rgba(4, 5, 10, 0.62);
  font-family: Georgia, 'Times New Roman', serif;
  opacity: 0; transition: opacity 120ms ease;
}
#${ROOT_ID}.zh-in { opacity: 1; }
#${ROOT_ID} .zh-sell-panel {
  min-width: min(24rem, 92vw);
  padding: 1.4em 1.8em 1.2em;
  background: #0b0d13; border: 1px solid #d7b86b;
  box-shadow: 0 4px 0 #00000088, inset 0 0 0 1px rgba(215, 184, 107, 0.16);
  color: #f5ead1; text-align: center;
}
#${ROOT_ID} .zh-sell-title {
  margin: 0 0 1em; font-family: 'Press Start 2P', monospace;
  font-size: 0.62rem; letter-spacing: 0.22em; text-indent: 0.22em; color: #ffe4a0;
}
#${ROOT_ID} .zh-sell-item { display: flex; align-items: center; justify-content: center; gap: 0.8em; }
#${ROOT_ID} .zh-sell-icon {
  width: 3rem; height: 3rem; image-rendering: pixelated;
  border: 1px solid #3d342a; background: #070811;
}
#${ROOT_ID} .zh-sell-name { font-size: 1.05rem; color: #f5ead1; }
#${ROOT_ID} .zh-sell-unit { font-size: 0.8rem; color: #8a9299; }
#${ROOT_ID} .zh-sell-count {
  margin: 1em 0 0.3em; display: flex; align-items: center; justify-content: center; gap: 1.1em;
}
#${ROOT_ID} .zh-sell-arrow {
  font-family: 'Press Start 2P', monospace; font-size: 0.8rem;
  color: #d7b86b; background: none; border: none; cursor: pointer; padding: 0.3em 0.5em;
}
#${ROOT_ID} .zh-sell-arrow:disabled { color: #59616a; cursor: default; }
#${ROOT_ID} .zh-sell-n {
  font-family: 'Press Start 2P', monospace; font-size: 1.1rem; color: #ffe4a0; min-width: 3.2ch;
}
#${ROOT_ID} .zh-sell-total {
  margin-top: 0.5em; font-family: 'Press Start 2P', monospace;
  font-size: 0.72rem; color: #ffd779;
}
#${ROOT_ID} .zh-sell-foot {
  margin-top: 1.3em; padding-top: 0.8em; border-top: 1px solid #262a36;
  font-size: 0.76rem; color: #8a9299;
}
`;

export class SellOverlay {
  private readonly root: HTMLDivElement;
  private readonly opts: SellOverlayOptions;
  private units: number;
  private closed = false;

  public constructor(opts: SellOverlayOptions) {
    this.opts = opts;
    // Abre com TUDO selecionado: quem encosta numa caixa de venda quase sempre quer despachar o
    // que tem. Baixar é um toque; subir de zero até vinte seria vinte.
    this.units = Math.max(1, opts.available);

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.root = document.createElement('div');
    this.root.id = ROOT_ID;
    this.root.innerHTML = `
      <div class="zh-sell-panel" role="dialog" aria-modal="true" aria-label="Sell">
        <h2 class="zh-sell-title">AIRLIFT · WHAT GOES OUT?</h2>
        <div class="zh-sell-item">
          <img class="zh-sell-icon" alt="" src="${opts.icon}">
          <div>
            <div class="zh-sell-name">${opts.itemLabel}</div>
            <div class="zh-sell-unit">${opts.coinsPerUnit} ${opts.coinsPerUnit === 1 ? 'coin' : 'coins'} each · ${opts.available} in the pack</div>
          </div>
        </div>
        <div class="zh-sell-count">
          <button class="zh-sell-arrow" data-step="-1" type="button">&#9664;</button>
          <span class="zh-sell-n"></span>
          <button class="zh-sell-arrow" data-step="1" type="button">&#9654;</button>
        </div>
        <div class="zh-sell-total"></div>
        <div class="zh-sell-foot">&#8592; &#8594; choose &#183; Enter ships it &#183; Esc keeps it</div>
      </div>`;
    document.body.appendChild(this.root);
    requestAnimationFrame(() => this.root.classList.add('zh-in'));

    this.root.querySelectorAll<HTMLButtonElement>('.zh-sell-arrow').forEach((btn) => {
      btn.addEventListener('click', () => this.step(Number(btn.dataset.step)));
    });
    // Clicar fora desiste — a mesma saída que o Esc, e a que o dedo procura primeiro.
    this.root.addEventListener('click', (ev) => { if (ev.target === this.root) this.cancel(); });
    window.addEventListener('keydown', this.onKey, true);
    this.render();
  }

  private step(by: number): void {
    const next = Math.min(this.opts.available, Math.max(1, this.units + by));
    if (next === this.units) return;
    this.units = next;
    getSoundManager().playItemStash(); // o toc seco de mexer numa pilha — o mesmo da mochila
    this.render();
  }

  private render(): void {
    const n = this.root.querySelector('.zh-sell-n');
    const total = this.root.querySelector('.zh-sell-total');
    if (n) n.textContent = String(this.units);
    if (total) total.textContent = `${this.units * this.opts.coinsPerUnit} COINS`;
    const dec = this.root.querySelector<HTMLButtonElement>('[data-step="-1"]');
    const inc = this.root.querySelector<HTMLButtonElement>('[data-step="1"]');
    if (dec) dec.disabled = this.units <= 1;
    if (inc) inc.disabled = this.units >= this.opts.available;
  }

  private readonly onKey = (ev: KeyboardEvent): void => {
    if (this.closed) return;
    // `stopPropagation` em TUDO o que ele entende: com a cena viva por baixo, uma seta que escapa
    // daqui também anda com o herói, e o Enter também confirmaria outra coisa.
    const key = ev.key;
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') { this.step(-1); }
    else if (key === 'ArrowRight' || key === 'd' || key === 'D') { this.step(1); }
    else if (key === 'Enter' || key === 'z' || key === 'Z') { this.confirm(); }
    else if (key === 'Escape' || key === 'x' || key === 'X') { this.cancel(); }
    else return;
    ev.preventDefault();
    ev.stopPropagation();
  };

  private confirm(): void {
    const units = this.units;
    this.close();
    this.opts.onConfirm(units);
  }

  private cancel(): void {
    this.close();
    this.opts.onCancel();
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    window.removeEventListener('keydown', this.onKey, true);
    this.root.classList.remove('zh-in');
    window.setTimeout(() => this.root.remove(), 140);
  }
}
