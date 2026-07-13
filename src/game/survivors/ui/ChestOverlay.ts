import { iconUrl } from '../SurvivorsConfig';
import { chestDataUrl } from '../survivorsTextures';
import type { UpgradeChoice } from '../choices';

// ── A cerimônia do baú (o jackpot) ─────────────────────────────────────────────
//
// O criador do VS fazia slot machines, e o baú é a slot machine dele: fanfarra,
// ícones girando e a revelação. Aqui: o baú balança, uma roleta de ícones roda
// rápido e desacelera, e as recompensas caem uma a uma com o ouro contando.
// A cena pausa por baixo (mesmo padrão do level-up).

const STYLE_ID = 'zh-survivors-chest-style';
const ROOT_ID = 'zh-survivors-chest';
const PIXEL = "'Press Start 2P', monospace";
const SERIF = "Georgia, 'Times New Roman', serif";

const SPIN_MS = 1400;
const SPIN_TICK_MS = 90;

const CSS = `
#${ROOT_ID} { position: fixed; inset: 0; z-index: 55; font-family: ${SERIF}; }
#${ROOT_ID} .zhc-scrim {
  position: absolute; inset: 0; background: rgba(4, 4, 10, 0.72);
  opacity: 0; transition: opacity 200ms ease;
}
#${ROOT_ID}.zhc-in .zhc-scrim { opacity: 1; }
#${ROOT_ID} .zhc-panel {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center; gap: 16px;
  width: min(26em, calc(100vw - 2em)); text-align: center;
}
#${ROOT_ID} .zhc-chest { width: 84px; height: 84px; image-rendering: pixelated; }
#${ROOT_ID}.zhc-spinning .zhc-chest { animation: zhc-wobble 240ms ease-in-out infinite; }
@keyframes zhc-wobble {
  0%, 100% { transform: rotate(-6deg) scale(1); }
  50% { transform: rotate(6deg) scale(1.08); }
}
#${ROOT_ID} .zhc-sloticon {
  width: 48px; height: 48px; image-rendering: pixelated;
  background: #14100c; border: 2px solid #3d342a; padding: 8px;
}
#${ROOT_ID} h1 {
  margin: 0; font-family: ${PIXEL}; font-size: 14px; color: #ffd24a;
  text-shadow: 2px 2px 0 #000; letter-spacing: 2px; min-height: 18px;
}
#${ROOT_ID} .zhc-rewards { display: flex; flex-direction: column; gap: 8px; width: 100%; }
#${ROOT_ID} .zhc-reward {
  display: flex; align-items: center; gap: 12px; box-sizing: border-box;
  padding: 0.55em 0.9em; background: #14100c; border: 2px solid #3d342a; color: #d8d1c0;
  opacity: 0; transform: translateY(8px); transition: opacity 200ms ease, transform 200ms ease;
  text-align: left;
}
#${ROOT_ID} .zhc-reward.zhc-show { opacity: 1; transform: translateY(0); }
#${ROOT_ID} .zhc-reward.zhc-evo { border-color: #f5c542; box-shadow: 0 0 12px rgba(245, 197, 66, 0.45); }
#${ROOT_ID} .zhc-reward img { width: 28px; height: 28px; image-rendering: pixelated; flex: none; }
#${ROOT_ID} .zhc-rtitle { font-family: ${PIXEL}; font-size: 9px; color: #e7dcc4; margin-bottom: 4px; }
#${ROOT_ID} .zhc-rdesc { font-size: 0.8em; color: #a99f8c; }
#${ROOT_ID} .zhc-gold { font-family: ${PIXEL}; font-size: 12px; color: #f5c542; text-shadow: 1px 1px 0 #000; }
#${ROOT_ID} .zhc-continue {
  font-family: ${PIXEL}; font-size: 9px; color: #6b6355; cursor: pointer;
  opacity: 0; transition: opacity 200ms ease; padding: 0.6em 1em;
}
#${ROOT_ID} .zhc-continue.zhc-show { opacity: 1; }
`;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

export interface ChestRewards {
  /** Presente: uma evolução aconteceu (a carta dourada). */
  evolution?: { title: string; desc: string; icon: string };
  upgrades: UpgradeChoice[];
  gold: number;
}

export class ChestOverlay {
  private readonly root: HTMLDivElement;
  private destroyed = false;
  private finished = false;
  private spinTimer?: number;
  private readonly timeouts: number[] = [];

  public constructor(
    rewards: ChestRewards,
    /** Toca um tick da roleta (sfx) — injetado para o overlay não conhecer áudio. */
    onSpinTick: () => void,
    onReveal: (isEvolution: boolean) => void,
    private readonly onDone: () => void,
  ) {
    ensureStyle();
    this.root = document.createElement('div');
    this.root.id = ROOT_ID;

    const scrim = document.createElement('div');
    scrim.className = 'zhc-scrim';
    // Depois da revelação, um clique em qualquer lugar continua — o jogador no
    // meio da horda não deve caçar um botão pequeno.
    scrim.addEventListener('click', () => {
      if (!this.root.classList.contains('zhc-spinning')) this.finish();
    });
    this.root.appendChild(scrim);

    const panel = document.createElement('div');
    panel.className = 'zhc-panel';
    this.root.appendChild(panel);

    const chest = document.createElement('img');
    chest.className = 'zhc-chest';
    chest.src = chestDataUrl();
    panel.appendChild(chest);

    const slotIcon = document.createElement('img');
    slotIcon.className = 'zhc-sloticon';
    slotIcon.src = iconUrl('coin');
    panel.appendChild(slotIcon);

    const title = document.createElement('h1');
    title.textContent = '. . .';
    panel.appendChild(title);

    const rewardsBox = document.createElement('div');
    rewardsBox.className = 'zhc-rewards';
    panel.appendChild(rewardsBox);

    const goldLine = document.createElement('div');
    goldLine.className = 'zhc-gold';
    panel.appendChild(goldLine);

    const continueBtn = document.createElement('div');
    continueBtn.className = 'zhc-continue';
    continueBtn.textContent = 'CONTINUAR';
    continueBtn.addEventListener('click', () => this.finish());
    panel.appendChild(continueBtn);

    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.handleKeyDown, true);
    requestAnimationFrame(() => { if (!this.destroyed) this.root.classList.add('zhc-in', 'zhc-spinning'); });

    // A roleta: cicla os ícones das recompensas (e alguns coringas) bem rápido.
    const spinPool = [
      ...rewards.upgrades.map((u) => u.icon),
      ...(rewards.evolution ? [rewards.evolution.icon] : []),
      'coin', 'heart', 'sword-icon', 'bomb-icon',
    ];
    let spinIdx = 0;
    this.spinTimer = window.setInterval(() => {
      spinIdx = (spinIdx + 1) % spinPool.length;
      slotIcon.src = iconUrl(spinPool[spinIdx]);
      onSpinTick();
    }, SPIN_TICK_MS);

    // A revelação: para a roleta, título, e as cartas caem uma a uma.
    this.timeouts.push(window.setTimeout(() => {
      if (this.spinTimer) window.clearInterval(this.spinTimer);
      this.root.classList.remove('zhc-spinning');
      const isEvo = Boolean(rewards.evolution);
      slotIcon.src = iconUrl(rewards.evolution?.icon ?? rewards.upgrades[0]?.icon ?? 'coin');
      title.textContent = isEvo ? 'EVOLUÇÃO!' : 'TESOURO!';
      onReveal(isEvo);

      const entries: Array<{ title: string; desc: string; icon: string; evo: boolean }> = [];
      if (rewards.evolution) entries.push({ ...rewards.evolution, evo: true });
      for (const u of rewards.upgrades) entries.push({ title: u.title, desc: `${u.badge} — ${u.desc}`, icon: u.icon, evo: false });

      entries.forEach((entry, i) => {
        const row = document.createElement('div');
        row.className = entry.evo ? 'zhc-reward zhc-evo' : 'zhc-reward';
        const img = document.createElement('img');
        img.src = iconUrl(entry.icon);
        const body = document.createElement('div');
        const rt = document.createElement('div');
        rt.className = 'zhc-rtitle';
        rt.textContent = entry.title;
        const rd = document.createElement('div');
        rd.className = 'zhc-rdesc';
        rd.textContent = entry.desc;
        body.append(rt, rd);
        row.append(img, body);
        rewardsBox.appendChild(row);
        this.timeouts.push(window.setTimeout(() => row.classList.add('zhc-show'), 150 + i * 220));
      });

      // O ouro conta de 0 ao total — o "cascateio de moedas" da slot machine.
      const goldStart = Date.now();
      const goldMs = 700;
      const tickGold = (): void => {
        if (this.destroyed) return;
        const t = Math.min(1, (Date.now() - goldStart) / goldMs);
        goldLine.textContent = `+${Math.round(rewards.gold * t)} OURO`;
        if (t < 1) requestAnimationFrame(tickGold);
      };
      tickGold();

      this.timeouts.push(window.setTimeout(() => continueBtn.classList.add('zhc-show'), 400 + entries.length * 220));
    }, SPIN_MS));
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.spinTimer) window.clearInterval(this.spinTimer);
    this.timeouts.forEach((t) => window.clearTimeout(t));
    window.removeEventListener('keydown', this.handleKeyDown, true);
    this.root.remove();
  }

  private finish(): void {
    if (this.finished || this.destroyed) return;
    this.finished = true;
    this.onDone();
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.destroyed) return;
    event.stopPropagation();
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
      event.preventDefault();
      // Antes da revelação o Enter não pula a roleta — o suspense é o produto.
      if (!this.root.classList.contains('zhc-spinning')) this.finish();
    }
  };
}
