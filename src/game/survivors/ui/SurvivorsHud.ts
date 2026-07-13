import { iconUrl, PASSIVE_DEFS, WEAPON_DEFS, type PassiveKind, type WeaponKind } from '../SurvivorsConfig';

// ── HUD do modo Sobreviventes (DOM, como todos os overlays da casa) ───────────
//
// A leitura de um relance que o VS exige: barra de XP colada no topo (a
// recompensa constante precisa ser visível SEMPRE), timer gigante (a run é uma
// corrida contra ele), kills/ouro como contadores de dopamina, a build nos
// slots à esquerda e a vida embaixo. Tudo pointer-events:none — o HUD nunca
// rouba um clique do jogo.

const STYLE_ID = 'zh-survivors-hud-style';
const ROOT_ID = 'zh-survivors-hud';
const PIXEL = "'Press Start 2P', monospace";

const CSS = `
#${ROOT_ID} { position: fixed; inset: 0; z-index: 40; pointer-events: none; font-family: ${PIXEL}; color: #e7dcc4; }
#${ROOT_ID} * { image-rendering: pixelated; }
#${ROOT_ID} .zhs-xpwrap {
  position: absolute; top: 0; left: 0; right: 0; height: 14px;
  background: rgba(8, 8, 14, 0.82); border-bottom: 2px solid #2c2620;
}
#${ROOT_ID} .zhs-xpfill {
  height: 100%; width: 0%;
  background: linear-gradient(180deg, #7fd4ff 0%, #3aa0e8 60%, #2a6fb0 100%);
  transition: width 120ms linear;
}
#${ROOT_ID} .zhs-level {
  position: absolute; top: 2px; right: 6px; font-size: 9px; color: #cfe9ff;
  text-shadow: 1px 1px 0 #000;
}
#${ROOT_ID} .zhs-timer {
  position: absolute; top: 26px; left: 50%; transform: translateX(-50%);
  font-size: 22px; letter-spacing: 2px; text-shadow: 2px 2px 0 #000;
}
#${ROOT_ID} .zhs-counters {
  position: absolute; top: 26px; right: 12px; display: flex; flex-direction: column;
  gap: 8px; align-items: flex-end; font-size: 11px; text-shadow: 1px 1px 0 #000;
}
#${ROOT_ID} .zhs-counter { display: flex; align-items: center; gap: 6px; }
#${ROOT_ID} .zhs-counter img { width: 18px; height: 18px; }
#${ROOT_ID} .zhs-slots {
  position: absolute; top: 26px; left: 10px; display: flex; flex-direction: column; gap: 4px;
}
#${ROOT_ID} .zhs-slotrow { display: flex; gap: 4px; }
#${ROOT_ID} .zhs-slot {
  position: relative; width: 28px; height: 28px;
  background: rgba(8, 8, 14, 0.7); border: 2px solid #3d342a;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
}
#${ROOT_ID} .zhs-slot img { width: 20px; height: 20px; position: relative; z-index: 1; }
#${ROOT_ID} .zhs-slot .zhs-lv {
  position: absolute; right: 0px; bottom: -1px; font-size: 7px; color: #ffd24a;
  text-shadow: 1px 1px 0 #000; z-index: 3;
}
#${ROOT_ID} .zhs-slot.zhs-evolved { border-color: #f5c542; box-shadow: 0 0 6px rgba(245, 197, 66, 0.6); }
/* O sweep de recarga: um véu escuro que enche o slot no disparo e drena até
   liberar — o relógio de cada arma, legível de canto de olho. */
#${ROOT_ID} .zhs-slot .zhs-cd {
  position: absolute; left: 0; right: 0; bottom: 0; height: 0%;
  background: rgba(4, 4, 10, 0.78);
  border-top: 1px solid rgba(255, 210, 74, 0.55);
  z-index: 2; pointer-events: none;
}
@keyframes zhs-pop { 0% { transform: scale(1.35); } 100% { transform: scale(1); } }
#${ROOT_ID} .zhs-slot img.zhs-pop { animation: zhs-pop 150ms ease-out; }
/* Relógios de recarga JUNTO do herói (sempre no centro da tela): uma fileira de
   mini-ícones circulares com sweep radial — o olhar nunca precisa subir à HUD. */
#${ROOT_ID} .zhs-ccd {
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, 46px);
  display: flex; gap: 6px;
}
#${ROOT_ID} .zhs-ccd .zhs-ccd-slot {
  position: relative; width: 24px; height: 24px; border-radius: 50%;
  background: rgba(8, 8, 14, 0.5); border: 2px solid rgba(216, 209, 192, 0.3);
  display: flex; align-items: center; justify-content: center;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
#${ROOT_ID} .zhs-ccd img { width: 14px; height: 14px; position: relative; z-index: 1; }
#${ROOT_ID} .zhs-ccd .zhs-ccd-fill {
  position: absolute; inset: 0; border-radius: 50%; z-index: 2; pointer-events: none;
}
#${ROOT_ID} .zhs-ccd .zhs-ccd-slot.zhs-ready {
  border-color: #ffd24a; box-shadow: 0 0 6px rgba(245, 197, 66, 0.65);
}
#${ROOT_ID} .zhs-ccd img.zhs-pop { animation: zhs-pop 150ms ease-out; }
#${ROOT_ID} .zhs-hpwrap {
  position: absolute; bottom: 18px; left: 50%; transform: translateX(-50%);
  width: 200px; height: 12px; background: rgba(8, 8, 14, 0.82); border: 2px solid #2c2620;
}
#${ROOT_ID} .zhs-hpfill {
  height: 100%; width: 100%;
  background: linear-gradient(180deg, #ff6a5a 0%, #d43a2e 60%, #9c2118 100%);
  transition: width 100ms linear;
}
#${ROOT_ID} .zhs-banner {
  position: absolute; top: 34%; left: 50%; transform: translate(-50%, -50%);
  font-size: 18px; color: #ffd24a; text-align: center; text-shadow: 2px 2px 0 #000;
  opacity: 0; transition: opacity 300ms ease; letter-spacing: 2px; line-height: 1.7;
}
#${ROOT_ID} .zhs-banner.zhs-danger { color: #ff5a5a; }
#${ROOT_ID} .zhs-banner.zhs-in { opacity: 1; }
`;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

export class SurvivorsHud {
  private readonly root: HTMLDivElement;
  private readonly xpFill: HTMLDivElement;
  private readonly levelLabel: HTMLDivElement;
  private readonly timer: HTMLDivElement;
  private readonly kills: HTMLSpanElement;
  private readonly gold: HTMLSpanElement;
  private readonly weaponRow: HTMLDivElement;
  private readonly passiveRow: HTMLDivElement;
  private readonly hpFill: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private bannerTimer?: number;
  private lastTimerText = '';
  private lastSlotsKey = '';
  // Slot de cada arma: o véu de recarga + o ícone (para o pop de disparo).
  private readonly cooldownFills = new Map<WeaponKind, { fill: HTMLDivElement; img: HTMLImageElement; lastFrac: number }>();
  // Os relógios radiais sob o herói (a leitura principal, pedida pelo jogador).
  private readonly centerRow: HTMLDivElement;
  private readonly centerFills = new Map<WeaponKind, { slot: HTMLDivElement; fill: HTMLDivElement; img: HTMLImageElement; lastFrac: number }>();

  public constructor() {
    ensureStyle();
    this.root = document.createElement('div');
    this.root.id = ROOT_ID;

    const xpWrap = document.createElement('div');
    xpWrap.className = 'zhs-xpwrap';
    this.xpFill = document.createElement('div');
    this.xpFill.className = 'zhs-xpfill';
    xpWrap.appendChild(this.xpFill);
    this.root.appendChild(xpWrap);

    this.levelLabel = document.createElement('div');
    this.levelLabel.className = 'zhs-level';
    this.root.appendChild(this.levelLabel);

    this.timer = document.createElement('div');
    this.timer.className = 'zhs-timer';
    this.timer.textContent = '00:00';
    this.root.appendChild(this.timer);

    const counters = document.createElement('div');
    counters.className = 'zhs-counters';
    const killCounter = document.createElement('div');
    killCounter.className = 'zhs-counter';
    const skullImg = document.createElement('img');
    skullImg.src = `${import.meta.env.BASE_URL}assets/characters/enemies/undead/undead.png`;
    this.kills = document.createElement('span');
    this.kills.textContent = '0';
    killCounter.append(skullImg, this.kills);
    const goldCounter = document.createElement('div');
    goldCounter.className = 'zhs-counter';
    const coinImg = document.createElement('img');
    coinImg.src = iconUrl('coin');
    this.gold = document.createElement('span');
    this.gold.textContent = '0';
    goldCounter.append(coinImg, this.gold);
    counters.append(killCounter, goldCounter);
    this.root.appendChild(counters);

    const slots = document.createElement('div');
    slots.className = 'zhs-slots';
    this.weaponRow = document.createElement('div');
    this.weaponRow.className = 'zhs-slotrow';
    this.passiveRow = document.createElement('div');
    this.passiveRow.className = 'zhs-slotrow';
    slots.append(this.weaponRow, this.passiveRow);
    this.root.appendChild(slots);

    const hpWrap = document.createElement('div');
    hpWrap.className = 'zhs-hpwrap';
    this.hpFill = document.createElement('div');
    this.hpFill.className = 'zhs-hpfill';
    hpWrap.appendChild(this.hpFill);
    this.root.appendChild(hpWrap);

    this.banner = document.createElement('div');
    this.banner.className = 'zhs-banner';
    this.root.appendChild(this.banner);

    this.centerRow = document.createElement('div');
    this.centerRow.className = 'zhs-ccd';
    this.root.appendChild(this.centerRow);

    document.body.appendChild(this.root);
  }

  public setXp(frac: number, level: number): void {
    this.xpFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
    this.levelLabel.textContent = `NV ${level}`;
  }

  public setTime(elapsedSec: number): void {
    const m = Math.floor(elapsedSec / 60);
    const s = Math.floor(elapsedSec % 60);
    const text = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (text !== this.lastTimerText) {
      this.lastTimerText = text;
      this.timer.textContent = text;
    }
  }

  public setKills(n: number): void {
    this.kills.textContent = String(n);
  }

  public setGold(n: number): void {
    this.gold.textContent = String(n);
  }

  public setHp(current: number, max: number): void {
    this.hpFill.style.width = `${Math.max(0, Math.min(1, current / max)) * 100}%`;
  }

  /** Reconstrói os slots quando a build muda (barato: só em level-up/baú). */
  public syncSlots(
    weapons: ReadonlyArray<{ kind: WeaponKind; level: number; evolved: boolean }>,
    passives: ReadonlyArray<{ kind: PassiveKind; level: number }>,
  ): void {
    const key = `${weapons.map((w) => `${w.kind}${w.level}${w.evolved ? 'E' : ''}`).join(',')}|${passives.map((p) => `${p.kind}${p.level}`).join(',')}`;
    if (key === this.lastSlotsKey) return;
    this.lastSlotsKey = key;

    this.weaponRow.textContent = '';
    this.cooldownFills.clear();
    for (const w of weapons) {
      this.weaponRow.appendChild(this.slot(iconUrl(WEAPON_DEFS[w.kind].icon), w.evolved ? 'MAX' : String(w.level), w.evolved, w.kind));
    }
    this.passiveRow.textContent = '';
    for (const p of passives) {
      this.passiveRow.appendChild(this.slot(iconUrl(PASSIVE_DEFS[p.kind].icon), String(p.level), false));
    }

    // Os relógios radiais sob o herói. A tocha fica de fora: é contínua — um
    // anel eternamente "pronto" seria só ruído colado no personagem.
    this.centerRow.textContent = '';
    this.centerFills.clear();
    for (const w of weapons) {
      if (w.kind === 'torch') continue;
      const slot = document.createElement('div');
      slot.className = 'zhs-ccd-slot';
      const img = document.createElement('img');
      img.src = iconUrl(WEAPON_DEFS[w.kind].icon);
      const fill = document.createElement('div');
      fill.className = 'zhs-ccd-fill';
      slot.append(img, fill);
      this.centerRow.appendChild(slot);
      this.centerFills.set(w.kind, { slot, fill, img, lastFrac: 0 });
    }
  }

  /** Atualiza os relógios de recarga (chamado todo frame — só estilos). */
  public setCooldowns(states: ReadonlyArray<{ kind: WeaponKind; frac: number }>): void {
    for (const { kind, frac } of states) {
      // O véu vertical do slot da HUD (canto superior esquerdo).
      const slot = this.cooldownFills.get(kind);
      if (slot) {
        slot.fill.style.height = `${Math.round(frac * 100)}%`;
        if (frac > slot.lastFrac + 0.5) this.pop(slot.img);
        slot.lastFrac = frac;
      }
      // O relógio radial sob o herói: sweep cônico que se esvazia até liberar.
      const center = this.centerFills.get(kind);
      if (center) {
        const deg = Math.round(frac * 360);
        center.fill.style.background = deg > 0
          ? `conic-gradient(rgba(4, 4, 10, 0.78) ${deg}deg, transparent ${deg}deg)`
          : 'transparent';
        center.slot.classList.toggle('zhs-ready', frac <= 0.02);
        if (frac > center.lastFrac + 0.5) this.pop(center.img);
        center.lastFrac = frac;
      }
    }
  }

  /** O salto de vazio→cheio É o disparo: o ícone dá um pop no mesmo instante. */
  private pop(img: HTMLImageElement): void {
    img.classList.remove('zhs-pop');
    void img.offsetWidth; // reinicia a animação CSS
    img.classList.add('zhs-pop');
  }

  /** Aviso central (elite, A MORTE) — some sozinho. */
  public showBanner(lines: string[], danger: boolean, ms = 2600): void {
    if (this.bannerTimer) window.clearTimeout(this.bannerTimer);
    this.banner.textContent = '';
    lines.forEach((line, i) => {
      if (i > 0) this.banner.appendChild(document.createElement('br'));
      this.banner.appendChild(document.createTextNode(line));
    });
    this.banner.classList.toggle('zhs-danger', danger);
    this.banner.classList.add('zhs-in');
    this.bannerTimer = window.setTimeout(() => this.banner.classList.remove('zhs-in'), ms);
  }

  public destroy(): void {
    if (this.bannerTimer) window.clearTimeout(this.bannerTimer);
    this.root.remove();
  }

  private slot(src: string, level: string, evolved: boolean, weaponKind?: WeaponKind): HTMLDivElement {
    const el = document.createElement('div');
    el.className = evolved ? 'zhs-slot zhs-evolved' : 'zhs-slot';
    const img = document.createElement('img');
    img.src = src;
    const lv = document.createElement('span');
    lv.className = 'zhs-lv';
    lv.textContent = level;
    el.append(img, lv);
    // Só armas têm relógio; passivos são estáticos.
    if (weaponKind) {
      const fill = document.createElement('div');
      fill.className = 'zhs-cd';
      el.appendChild(fill);
      this.cooldownFills.set(weaponKind, { fill, img, lastFrac: 0 });
    }
    return el;
  }
}
