import type Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import { getLocale, setLocale, t, type Locale } from '@/game/i18n/i18n';
import { getDofIntensity, setDofIntensity } from '@/game/runtime/graphicsSettings';

// The pause screen is plain DOM layered over the Phaser canvas — the same approach as
// DialogOverlay / EditorDomUi. That choice matters twice here: serif text and native range
// sliders render crisply at device resolution, and DOM keeps receiving input while the
// Phaser scene is hard-paused (scene.pause() freezes update/tweens/timers AND scene input,
// so the menu must live outside the canvas to stay clickable).

const STYLE_ID = 'zh-pause-style';
const ROOT_ID = 'zh-pause-root';
const TOUCH_BTN_ID = 'zh-pause-touch-btn';
const SERIF = "Georgia, 'Times New Roman', 'Book Antiqua', serif";
// Destructive actions (restart / quit) arm on the first tap and only fire on the second;
// the label snaps back after this long so a stray tap can't linger armed forever.
const CONFIRM_RESET_MS = 2600;

const CSS = `
#${ROOT_ID} { position: fixed; inset: 0; z-index: 60; pointer-events: none; font-family: ${SERIF}; }
#${ROOT_ID} .zh-pause-scrim {
  position: absolute; inset: 0; pointer-events: auto;
  background: rgba(0, 0, 0, 0.55);
  opacity: 0; transition: opacity 140ms ease;
}
#${ROOT_ID} .zh-pause-panel {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  pointer-events: auto;
  width: min(23em, calc(100vw - 2.5em));
  max-height: calc(100vh - 2em); overflow-y: auto;
  background: #14100c; border: 1px solid #3d342a; color: #d8d1c0;
  box-shadow: 0 12px 44px rgba(0, 0, 0, 0.65);
  padding: 1.5em 1.7em 1.4em;
  font-size: clamp(13px, 2.4vh, 17px);
  opacity: 0; transition: opacity 140ms ease;
}
#${ROOT_ID}.zh-in .zh-pause-scrim,
#${ROOT_ID}.zh-in .zh-pause-panel { opacity: 1; }
#${ROOT_ID} h1 {
  margin: 0 0 1em; text-align: center;
  font-size: 1.05em; font-weight: 700;
  letter-spacing: 0.4em; text-indent: 0.4em; /* re-center: tracking pads the right edge */
  color: #e7dcc4;
}
#${ROOT_ID} .zh-pause-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 1.2em; margin: 0.75em 0;
}
#${ROOT_ID} .zh-pause-label { color: #cfc9ba; white-space: nowrap; }
#${ROOT_ID} .zh-pause-btn {
  display: block; box-sizing: border-box; width: 100%;
  padding: 0.5em 0.8em; margin: 0.55em 0;
  text-align: center; cursor: pointer; user-select: none;
  border: 1px solid #3d342a; color: #d8d1c0;
  transition: background 90ms ease, color 90ms ease;
}
#${ROOT_ID} .zh-pause-btn:hover { background: #d4c8a4; color: #241d12; }
#${ROOT_ID} .zh-pause-btn.zh-dim { color: #8b8474; font-size: 0.92em; }
#${ROOT_ID} .zh-pause-btn.zh-dim:hover { background: #3d342a; color: #d8d1c0; }
#${ROOT_ID} .zh-pause-sep { border: 0; border-top: 1px solid #3d342a; margin: 1em 0 0.8em; }
#${ROOT_ID} input[type=range] {
  width: 9.5em; accent-color: #d4c8a4; cursor: pointer;
}
#${ROOT_ID} .zh-pause-langs { display: flex; gap: 0.4em; }
#${ROOT_ID} .zh-pause-lang {
  padding: 0.3em 0.7em; cursor: pointer; user-select: none;
  border: 1px solid #3d342a; color: #8b8474;
  transition: background 90ms ease, color 90ms ease;
}
#${ROOT_ID} .zh-pause-lang:hover { color: #d8d1c0; }
#${ROOT_ID} .zh-pause-lang.zh-active {
  border-color: #d4c8a4; color: #e7dcc4; background: #241d12; cursor: default;
}
#${TOUCH_BTN_ID} {
  position: fixed;
  top: calc(10px + env(safe-area-inset-top, 0px));
  right: calc(10px + env(safe-area-inset-right, 0px));
  z-index: 45;
  width: 42px; height: 42px; padding: 0;
  display: flex; align-items: center; justify-content: center; gap: 5px;
  background: rgba(10, 8, 6, 0.3); border: 1px solid rgba(216, 209, 192, 0.3);
  border-radius: 8px; cursor: pointer;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
#${TOUCH_BTN_ID} span {
  width: 4px; height: 14px; background: rgba(216, 209, 192, 0.65); border-radius: 1px;
}
`;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

export interface PauseMenuCallbacks {
  onResume: () => void;
  onRestart: () => void;
  /** Absent (editor playtest — the title scene isn't registered) hides the quit entry. */
  onQuit?: () => void;
}

export class PauseMenu {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly resumeBtn: HTMLDivElement;
  private readonly musicLabel: HTMLSpanElement;
  private readonly sfxLabel: HTMLSpanElement;
  private readonly dofLabel: HTMLSpanElement;
  private readonly langLabel: HTMLSpanElement;
  private readonly langBtns = new Map<Locale, HTMLSpanElement>();
  private readonly fullscreenBtn?: HTMLDivElement;
  private readonly restartBtn: HTMLDivElement;
  private readonly quitBtn?: HTMLDivElement;
  private destroyed = false;
  private confirmTimer?: number;
  private armed?: HTMLDivElement;

  public constructor(scene: Phaser.Scene, private readonly cb: PauseMenuCallbacks) {
    void scene; // the menu is scene-agnostic DOM; kept in the signature for overlay parity
    ensureStyle();
    const sound = getSoundManager();

    this.root = document.createElement('div');
    this.root.id = ROOT_ID;

    const scrim = document.createElement('div');
    scrim.className = 'zh-pause-scrim';
    scrim.addEventListener('click', () => this.cb.onResume());
    this.root.appendChild(scrim);

    const panel = document.createElement('div');
    panel.className = 'zh-pause-panel';
    this.root.appendChild(panel);

    this.title = document.createElement('h1');
    panel.appendChild(this.title);

    this.resumeBtn = this.button(panel, () => this.cb.onResume());

    panel.appendChild(this.separator());

    // Volume sliders write straight through to the SoundManager (already persisted there).
    const music = this.sliderRow(panel, sound.getMusicVolume(), (v) => sound.setMusicVolume(v));
    this.musicLabel = music;
    const sfx = this.sliderRow(panel, sound.getSfxVolume(), (v) => {
      sound.setSfxVolume(v);
    }, () => sound.playCoinPickup()); // preview blip on release so the level is judgeable
    this.sfxLabel = sfx;

    // Depth of field: the tilt-shift blur is the HD-2D signature, but a permanently soft screen
    // edge gives some players eye strain — so it's an accessibility slider (0 = a crisp diorama).
    // The renderer reads it every frame, so it takes hold the moment the game resumes.
    this.dofLabel = this.sliderRow(panel, getDofIntensity(), (v) => setDofIntensity(v));

    // Language: swaps the catalog immediately; the menu re-labels itself. World text that was
    // already rendered (HUD, dialogs) picks the new locale up on its next build/scene restart.
    const langRow = document.createElement('div');
    langRow.className = 'zh-pause-row';
    this.langLabel = document.createElement('span');
    this.langLabel.className = 'zh-pause-label';
    const langs = document.createElement('div');
    langs.className = 'zh-pause-langs';
    ([['pt-br', 'PT-BR'], ['en', 'EN']] as Array<[Locale, string]>).forEach(([locale, short]) => {
      const btn = document.createElement('span');
      btn.className = 'zh-pause-lang';
      btn.textContent = short;
      btn.addEventListener('click', () => {
        if (getLocale() === locale) return;
        setLocale(locale);
        this.refreshTexts();
      });
      this.langBtns.set(locale, btn);
      langs.appendChild(btn);
    });
    langRow.append(this.langLabel, langs);
    panel.appendChild(langRow);

    // Fullscreen is page-level (documentElement), not Phaser's ScaleManager: the canvas
    // already fills the window, so fullscreening the page is the whole job. Hidden where the
    // browser forbids it (iPhone Safari).
    if (document.fullscreenEnabled) {
      this.fullscreenBtn = this.button(panel, () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen();
      });
      document.addEventListener('fullscreenchange', this.handleFullscreenChange);
    }

    panel.appendChild(this.separator());

    this.restartBtn = this.button(panel, () => this.confirmThen(this.restartBtn, this.cb.onRestart));
    this.restartBtn.classList.add('zh-dim');
    if (this.cb.onQuit) {
      const onQuit = this.cb.onQuit;
      this.quitBtn = this.button(panel, () => this.confirmThen(this.quitBtn as HTMLDivElement, onQuit));
      this.quitBtn.classList.add('zh-dim');
    }

    this.refreshTexts();
    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.handleKeyDown, true);
    requestAnimationFrame(() => { if (!this.destroyed) this.root.classList.add('zh-in'); });
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.confirmTimer) window.clearTimeout(this.confirmTimer);
    window.removeEventListener('keydown', this.handleKeyDown, true);
    document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
    this.root.remove();
  }

  // ── building blocks ────────────────────────────────────────────────────────

  private button(parent: HTMLElement, onClick: () => void): HTMLDivElement {
    const btn = document.createElement('div');
    btn.className = 'zh-pause-btn';
    btn.addEventListener('click', onClick);
    parent.appendChild(btn);
    return btn;
  }

  private separator(): HTMLHRElement {
    const hr = document.createElement('hr');
    hr.className = 'zh-pause-sep';
    return hr;
  }

  private sliderRow(
    parent: HTMLElement,
    value: number,
    onInput: (v: number) => void,
    onRelease?: () => void,
  ): HTMLSpanElement {
    const row = document.createElement('div');
    row.className = 'zh-pause-row';
    const label = document.createElement('span');
    label.className = 'zh-pause-label';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(Math.round(value * 100));
    slider.addEventListener('input', () => onInput(Number(slider.value) / 100));
    if (onRelease) slider.addEventListener('change', onRelease);
    row.append(label, slider);
    parent.appendChild(row);
    return label;
  }

  /** Two-tap guard for destructive entries: first tap arms ("Are you sure?"), second fires. */
  private confirmThen(btn: HTMLDivElement, action: () => void): void {
    if (this.armed === btn) {
      if (this.confirmTimer) window.clearTimeout(this.confirmTimer);
      this.armed = undefined;
      action();
      return;
    }
    this.armed = btn;
    if (this.confirmTimer) window.clearTimeout(this.confirmTimer);
    this.refreshTexts();
    btn.textContent = t('pause.confirm');
    this.confirmTimer = window.setTimeout(() => {
      this.armed = undefined;
      if (!this.destroyed) this.refreshTexts();
    }, CONFIRM_RESET_MS);
  }

  private refreshTexts(): void {
    this.title.textContent = t('pause.title');
    this.resumeBtn.textContent = t('pause.resume');
    this.musicLabel.textContent = t('pause.music');
    this.sfxLabel.textContent = t('pause.sfx');
    this.dofLabel.textContent = t('pause.dof');
    this.langLabel.textContent = t('pause.language');
    this.langBtns.forEach((btn, locale) => btn.classList.toggle('zh-active', getLocale() === locale));
    if (this.fullscreenBtn) {
      this.fullscreenBtn.textContent = document.fullscreenElement
        ? t('pause.fullscreenExit')
        : t('pause.fullscreen');
    }
    this.restartBtn.textContent = t('pause.restart');
    if (this.quitBtn) this.quitBtn.textContent = t('pause.quit');
  }

  private readonly handleFullscreenChange = (): void => {
    if (!this.destroyed) this.refreshTexts();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.destroyed) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      this.cb.onResume();
    }
  };
}

// ── discreet touch pause button (mobile) ──────────────────────────────────────

export const isTouchDevice = (): boolean =>
  'ontouchstart' in window || navigator.maxTouchPoints > 0;

/**
 * A small translucent ⏸ button pinned to the top-right of the screen on touch devices —
 * ESC has no finger. Lives for the whole GameScene run; hidden while the menu is open.
 */
export class PauseTouchButton {
  private readonly el: HTMLButtonElement;

  public constructor(onTap: () => void) {
    ensureStyle();
    this.el = document.createElement('button');
    this.el.id = TOUCH_BTN_ID;
    this.el.type = 'button';
    this.el.append(document.createElement('span'), document.createElement('span'));
    this.el.addEventListener('click', onTap);
    document.body.appendChild(this.el);
  }

  public setVisible(visible: boolean): void {
    this.el.style.display = visible ? 'flex' : 'none';
  }

  public destroy(): void {
    this.el.remove();
  }
}
