import { iconUrl, POWERUP_DEFS, powerUpCost, type PowerUpKind } from '../SurvivorsConfig';
import { buyPowerUp, type SurvivorsMeta } from '../meta';

// ── Resultados + loja de PowerUps (o "só mais uma run") ───────────────────────
//
// A tela pós-morte do VS faz dois trabalhos: mostra o quão longe você foi (a
// régua a bater) e deixa gastar o ouro em melhorias PERMANENTES na mesma tela —
// para a próxima run já nascer mais forte. Painel duplo: resultados ⇄ loja.

const STYLE_ID = 'zh-survivors-results-style';
const ROOT_ID = 'zh-survivors-results';
const PIXEL = "'Press Start 2P', monospace";
const SERIF = "Georgia, 'Times New Roman', serif";

const CSS = `
#${ROOT_ID} { position: fixed; inset: 0; z-index: 58; font-family: ${SERIF}; }
#${ROOT_ID} .zhr-scrim {
  position: absolute; inset: 0; background: rgba(4, 4, 10, 0.78);
  opacity: 0; transition: opacity 300ms ease;
}
#${ROOT_ID}.zhr-in .zhr-scrim { opacity: 1; }
#${ROOT_ID} .zhr-panel {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(26em, calc(100vw - 2em)); max-height: calc(100vh - 2em); overflow-y: auto;
  box-sizing: border-box; background: #14100c; border: 1px solid #3d342a; color: #d8d1c0;
  box-shadow: 0 12px 44px rgba(0, 0, 0, 0.65); padding: 1.4em 1.6em;
  font-size: clamp(13px, 2.4vh, 16px);
  opacity: 0; transition: opacity 300ms ease;
}
#${ROOT_ID}.zhr-in .zhr-panel { opacity: 1; }
#${ROOT_ID} h1 {
  margin: 0 0 0.9em; text-align: center; font-family: ${PIXEL}; font-size: 15px;
  letter-spacing: 2px; text-shadow: 2px 2px 0 #000;
}
#${ROOT_ID} h1.zhr-win { color: #ffd24a; }
#${ROOT_ID} h1.zhr-loss { color: #c44536; }
#${ROOT_ID} .zhr-row {
  display: flex; justify-content: space-between; gap: 1em; margin: 0.45em 0;
}
#${ROOT_ID} .zhr-label { color: #a99f8c; }
#${ROOT_ID} .zhr-value { color: #e7dcc4; }
#${ROOT_ID} .zhr-gold { color: #f5c542; }
#${ROOT_ID} .zhr-btn {
  display: block; box-sizing: border-box; width: 100%; padding: 0.55em 0.8em; margin: 0.55em 0;
  text-align: center; cursor: pointer; user-select: none;
  border: 1px solid #3d342a; color: #d8d1c0;
  transition: background 90ms ease, color 90ms ease;
}
#${ROOT_ID} .zhr-btn:hover { background: #d4c8a4; color: #241d12; }
#${ROOT_ID} .zhr-btn.zhr-dim { color: #8b8474; font-size: 0.92em; }
#${ROOT_ID} .zhr-sep { border: 0; border-top: 1px solid #3d342a; margin: 1em 0 0.8em; }
#${ROOT_ID} .zhr-shoprow {
  display: flex; align-items: center; gap: 0.8em; margin: 0.5em 0;
}
#${ROOT_ID} .zhr-shoprow img { width: 22px; height: 22px; image-rendering: pixelated; flex: none; }
#${ROOT_ID} .zhr-shopbody { flex: 1; min-width: 0; }
#${ROOT_ID} .zhr-shopname { color: #e7dcc4; }
#${ROOT_ID} .zhr-ranks { color: #f5c542; letter-spacing: 2px; font-size: 0.8em; }
#${ROOT_ID} .zhr-shopdesc { font-size: 0.78em; color: #a99f8c; }
#${ROOT_ID} .zhr-buy {
  flex: none; padding: 0.35em 0.7em; cursor: pointer; border: 1px solid #3d342a;
  color: #f5c542; font-size: 0.82em; white-space: nowrap;
  transition: background 90ms ease, color 90ms ease;
}
#${ROOT_ID} .zhr-buy:hover { background: #d4c8a4; color: #241d12; }
#${ROOT_ID} .zhr-buy.zhr-off { color: #6b6355; cursor: default; }
#${ROOT_ID} .zhr-buy.zhr-off:hover { background: transparent; color: #6b6355; }
`;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

// Ícones da loja: reaproveita os PNGs mais próximos de cada conceito.
const POWERUP_ICONS: Record<PowerUpKind, string> = {
  power: 'pickaxe-icon',
  vigor: 'heart',
  haste: 'lava-boots-icon',
  cooldown: 'key-item-icon',
  attraction: 'coin',
  greed: 'coin',
  growth: 'wood-icon',
  revival: 'heart',
};

export interface RunResults {
  victory: boolean;
  timeMs: number;
  level: number;
  kills: number;
  goldEarned: number;
}

export class ResultsOverlay {
  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private destroyed = false;
  private view: 'results' | 'shop' = 'results';

  public constructor(
    private readonly results: RunResults,
    private readonly meta: SurvivorsMeta,
    private readonly cb: { onRestart: () => void; onQuit: () => void; onBuy?: () => void },
  ) {
    ensureStyle();
    this.root = document.createElement('div');
    this.root.id = ROOT_ID;

    const scrim = document.createElement('div');
    scrim.className = 'zhr-scrim';
    this.root.appendChild(scrim);

    this.panel = document.createElement('div');
    this.panel.className = 'zhr-panel';
    this.root.appendChild(this.panel);

    this.renderResults();
    document.body.appendChild(this.root);
    requestAnimationFrame(() => { if (!this.destroyed) this.root.classList.add('zhr-in'); });
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.root.remove();
  }

  private renderResults(): void {
    this.view = 'results';
    this.panel.textContent = '';

    const title = document.createElement('h1');
    title.className = this.results.victory ? 'zhr-win' : 'zhr-loss';
    title.textContent = this.results.victory ? 'VOCÊ SOBREVIVEU!' : 'A NOITE VENCEU';
    this.panel.appendChild(title);

    const m = Math.floor(this.results.timeMs / 60000);
    const s = Math.floor((this.results.timeMs % 60000) / 1000);
    this.row('Tempo', `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    this.row('Nível', String(this.results.level));
    this.row('Abatidos', String(this.results.kills));
    this.row('Ouro ganho', `+${this.results.goldEarned}`, true);
    this.row('Ouro total', String(this.meta.gold), true);

    this.panel.appendChild(this.separator());

    this.button('JOGAR DE NOVO', () => this.cb.onRestart());
    this.button('LOJA DE MELHORIAS', () => this.renderShop());
    const quit = this.button('VOLTAR AO MENU', () => this.cb.onQuit());
    quit.classList.add('zhr-dim');
  }

  private renderShop(): void {
    this.view = 'shop';
    this.panel.textContent = '';

    const title = document.createElement('h1');
    title.className = 'zhr-win';
    title.textContent = 'MELHORIAS';
    this.panel.appendChild(title);

    const goldRow = document.createElement('div');
    goldRow.className = 'zhr-row';
    const goldLabel = document.createElement('span');
    goldLabel.className = 'zhr-label';
    goldLabel.textContent = 'Seu ouro';
    const goldValue = document.createElement('span');
    goldValue.className = 'zhr-value zhr-gold';
    goldValue.textContent = String(this.meta.gold);
    goldRow.append(goldLabel, goldValue);
    this.panel.appendChild(goldRow);
    this.panel.appendChild(this.separator());

    for (const def of Object.values(POWERUP_DEFS)) {
      const rank = this.meta.powerUps[def.kind] ?? 0;
      const maxed = rank >= def.maxRank;
      const cost = powerUpCost(def, rank);

      const row = document.createElement('div');
      row.className = 'zhr-shoprow';
      const img = document.createElement('img');
      img.src = iconUrl(POWERUP_ICONS[def.kind]);
      const body = document.createElement('div');
      body.className = 'zhr-shopbody';
      const name = document.createElement('div');
      name.className = 'zhr-shopname';
      name.textContent = def.name;
      const ranks = document.createElement('span');
      ranks.className = 'zhr-ranks';
      ranks.textContent = ` ${'●'.repeat(rank)}${'○'.repeat(def.maxRank - rank)}`;
      name.appendChild(ranks);
      const desc = document.createElement('div');
      desc.className = 'zhr-shopdesc';
      desc.textContent = def.desc;
      body.append(name, desc);

      const buy = document.createElement('div');
      buy.className = maxed || this.meta.gold < cost ? 'zhr-buy zhr-off' : 'zhr-buy';
      buy.textContent = maxed ? 'MAX' : `${cost} ouro`;
      if (!maxed) {
        buy.addEventListener('click', () => {
          if (buyPowerUp(this.meta, def.kind)) {
            this.cb.onBuy?.();
            this.renderShop();
          }
        });
      }

      row.append(img, body, buy);
      this.panel.appendChild(row);
    }

    this.panel.appendChild(this.separator());
    this.button('VOLTAR', () => this.renderResults());
  }

  private row(label: string, value: string, gold = false): void {
    const row = document.createElement('div');
    row.className = 'zhr-row';
    const l = document.createElement('span');
    l.className = 'zhr-label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = gold ? 'zhr-value zhr-gold' : 'zhr-value';
    v.textContent = value;
    row.append(l, v);
    this.panel.appendChild(row);
  }

  private button(label: string, onClick: () => void): HTMLDivElement {
    const btn = document.createElement('div');
    btn.className = 'zhr-btn';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    this.panel.appendChild(btn);
    return btn;
  }

  private separator(): HTMLHRElement {
    const hr = document.createElement('hr');
    hr.className = 'zhr-sep';
    return hr;
  }
}
