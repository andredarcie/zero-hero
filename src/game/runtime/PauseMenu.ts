import type Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import { otherLang, setLang, t } from '@/game/i18n/i18n';
import {
  getDaylight, getDofIntensity, isThriftyPixels, setDaylight, setDofIntensity, setThriftyPixels,
} from '@/game/runtime/graphicsSettings';
import { SubScreenPanel, type SubScreenView } from '@/game/runtime/SubScreen';
import {
  BOOK_FONT, KEY_BG, KEY_BORDER, KEY_GLYPH, PARCHMENT_ON, WOOD_PANEL, WOOD_TITLE, pixelFrame,
} from '@/game/runtime/uiStyle';
import {
  canVibrate, haptic, hasBigButtons, hasHaptics, hasSolidButtons, isLeftHanded,
  setBigButtons, setHaptics, setLeftHanded, setSolidButtons,
} from '@/game/runtime/touchSettings';

// The pause screen is plain DOM layered over the Phaser canvas — the same approach as
// DialogOverlay / EditorDomUi. That choice matters twice here: serif text and native range
// sliders render crisply at device resolution, and DOM keeps receiving input while the
// Phaser scene is hard-paused (scene.pause() freezes update/tweens/timers AND scene input,
// so the menu must live outside the canvas to stay clickable).

const STYLE_ID = 'zh-pause-style';
const ROOT_ID = 'zh-pause-root';
const TOUCH_BTN_ID = 'zh-pause-touch-btn';
// Destructive actions (restart / quit) arm on the first tap and only fire on the second;
// the label snaps back after this long so a stray tap can't linger armed forever.
const CONFIRM_RESET_MS = 2600;

const CSS = `
#${ROOT_ID} { position: fixed; inset: 0; z-index: 60; pointer-events: none; font-family: ${BOOK_FONT}; }
#${ROOT_ID} .zh-pause-scrim {
  position: absolute; inset: 0; pointer-events: auto;
  /* A pausa e a unica tela que PARA o mundo: ele escurece e sai de foco — e ainda esta la. */
  background: rgba(6, 5, 4, 0.5);
  -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
  opacity: 0; transition: opacity 200ms ease;
}
#${ROOT_ID} .zh-pause-panel {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  pointer-events: auto;
  width: min(23em, calc(100vw - 2.5em));
  max-height: calc(100vh - 2em); overflow-y: auto;
  ${WOOD_PANEL}
  color: #d8d1c0;
  padding: 1.3em 1.5em 1.2em;
  font-size: clamp(14px, 2.6vh, 18px);
  opacity: 0; transform: translate(-50%, calc(-50% + 12px));
  transition: opacity 200ms ease, transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1.15);
}
/* A rolagem da madeira: a do corpo do dialogo, nunca a barra cinza-clara do sistema. */
#${ROOT_ID} .zh-pause-panel { scrollbar-width: thin; scrollbar-color: #5a4a35 transparent; }
#${ROOT_ID} .zh-pause-panel::-webkit-scrollbar { width: 8px; }
#${ROOT_ID} .zh-pause-panel::-webkit-scrollbar-track { background: transparent; }
#${ROOT_ID} .zh-pause-panel::-webkit-scrollbar-thumb { background: #5a4a35; border-radius: 0; }
#${ROOT_ID}.zh-in .zh-pause-scrim { opacity: 1; }
#${ROOT_ID}.zh-in .zh-pause-panel { opacity: 1; transform: translate(-50%, -50%); }
#${ROOT_ID} h1 {
  margin: 0 0 0.7em; text-align: center;
  ${WOOD_TITLE}
  font-size: 1.45em;
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
  border-radius: 2px; color: #d8d1c0;
  transition: background 90ms ease, color 90ms ease;
}
/* A opcao e a do dialogo: texto solto na madeira, e o pergaminho claro na que esta sob a mao. */
#${ROOT_ID} .zh-pause-btn:hover { ${PARCHMENT_ON} }
#${ROOT_ID} .zh-pause-btn.zh-dim { color: #8b8474; font-size: 0.92em; }
#${ROOT_ID} .zh-pause-btn.zh-dim:hover { background: rgba(212, 200, 164, 0.16); color: #d8d1c0; }
/* O veio entre as secoes: um sulco na tabua (sombra em cima, luz embaixo). */
#${ROOT_ID} .zh-pause-sep {
  border: 0; height: 2px; margin: 1em 0 0.8em;
  background: linear-gradient(#0a0705 0 1px, rgba(255, 226, 180, 0.08) 1px 2px);
}
#${ROOT_ID} input[type=range] {
  width: 9.5em; accent-color: #d4c8a4; cursor: pointer;
}
#${TOUCH_BTN_ID} {
  position: fixed;
  top: calc(10px + env(safe-area-inset-top, 0px));
  right: calc(10px + env(safe-area-inset-right, 0px));
  z-index: 45;
  /* 48px: o alvo mínimo de toque (48dp no Android, 44pt no iOS). Eram 42. */
  width: 48px; height: 48px; padding: 0;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  /* A TECLA DE PIXEL do mundo (o keycap): fundo, borda amarela e canto vazado. */
  background: ${pixelFrame(12, 'rgba(36, 29, 15, 0.78)', KEY_BORDER)} center / 100% 100% no-repeat;
  image-rendering: pixelated; border: 0; border-radius: 0; cursor: pointer;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
#${TOUCH_BTN_ID} span {
  width: 8px; height: 20px; background: ${KEY_GLYPH}; border-radius: 0;
}
#${TOUCH_BTN_ID}:active { transform: translateY(2px); }
body.zh-solid-btns #${TOUCH_BTN_ID} {
  background: ${pixelFrame(12, KEY_BG, KEY_BORDER)} center / 100% 100% no-repeat;
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
  /**
   * Ausente = sem botao de recomecar. A aventura nao tem: nada se perde neste jogo, entao nao ha
   * de onde "recomecar" — o New game do titulo e a porta para uma partida limpa.
   */
  onRestart?: () => void;
  /** Absent (editor playtest — the title scene isn't registered) hides the quit entry. */
  onQuit?: () => void;
  /**
   * A SUBTELA (a mochila e o mapa), desenhada no topo do painel. Ela mora aqui, e nao
   * numa tela propria, porque as duas obedecem a mesma lei: so existem enquanto o jogador as
   * pediu. Uma segunda tela significaria uma segunda tecla, um segundo congelamento do jogo e
   * duas coisas que o ESC poderia querer dizer.
   *
   * `readSubScreen` e lido a cada desenho (nunca um retrato tirado ao abrir), entao escolher um
   * item e um caminho so: a cena troca o item do B e o painel pergunta de novo como ficou.
   */
  readSubScreen?: () => SubScreenView;
  onSelectItem?: (kind: string) => void;
}

export class PauseMenu {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly resumeBtn: HTMLDivElement;
  private readonly musicLabel: HTMLSpanElement;
  private readonly sfxLabel: HTMLSpanElement;
  private readonly dofLabel: HTMLSpanElement;
  private readonly daylightBtn: HTMLDivElement;
  private readonly sharpBtn: HTMLDivElement;
  private readonly languageBtn: HTMLDivElement;
  /** As opções de toque (ver touchSettings) — só existem num aparelho de toque. */
  private readonly touchBtns?: {
    hand: HTMLDivElement; size: HTMLDivElement; look: HTMLDivElement; haptics?: HTMLDivElement;
  };
  private readonly subScreen?: SubScreenPanel;
  private readonly fullscreenBtn?: HTMLDivElement;
  private readonly restartBtn?: HTMLDivElement;
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

    // A mochila vem ANTES das opcoes: quem apertou ESC no meio de uma expedicao veio ver o que
    // tem e escolher o item do B; volume e idioma sao a segunda razao, nunca a primeira.
    if (this.cb.readSubScreen && this.cb.onSelectItem) {
      const onSelectItem = this.cb.onSelectItem;
      this.subScreen = new SubScreenPanel(this.cb.readSubScreen, (kind) => onSelectItem(kind));
      panel.appendChild(this.subScreen.el);
    }

    this.resumeBtn = this.button(panel, () => this.cb.onResume());

    panel.appendChild(this.separator());

    // Volume sliders write straight through to the SoundManager (already persisted there).
    const music = this.sliderRow(panel, sound.getMusicVolume(), (v) => sound.setMusicVolume(v));
    this.musicLabel = music;
    const sfx = this.sliderRow(panel, sound.getSfxVolume(), (v) => {
      sound.setSfxVolume(v);
    }, () => sound.playItemStash()); // preview blip on release so the level is judgeable
    this.sfxLabel = sfx;

    // Depth of field: the tilt-shift blur is the HD-2D signature, but a permanently soft screen
    // edge gives some players eye strain — so it's an accessibility slider (0 = a crisp diorama).
    // The renderer reads it every frame, so it takes hold the moment the game resumes.
    this.dofLabel = this.sliderRow(panel, getDofIntensity(), (v) => setDofIntensity(v));

    // A HORA DO DIA. Botão e não deslizador porque não há meio-termo: o céu é uma chave que troca
    // vinte knobs de uma vez (render3d/skyPreset.ts). Como o fullscreen, o rótulo diz o que o toque
    // FAZ, não onde se está. O renderizador lê o ajuste todo frame, então ele pega no instante em
    // que o jogo volta a andar — a cena está pausada aqui dentro, e o mundo congelado com ela.
    this.daylightBtn = this.button(panel, () => {
      setDaylight(getDaylight() >= 0.5 ? 0 : 1);
      this.refreshTexts();
    });

    // A NITIDEZ. Chave e não deslizador pelo mesmo motivo da hora do dia: só há dois estados que
    // valem a pena (a tela inteira, ou metade dela). Ela existe porque o jogo desenha em pixel de
    // APARELHO desde que o serrilhado do celular foi consertado — e isso é caro exatamente onde o
    // conserto mais importa. Quem decide se o aparelho aguenta é quem está segurando o aparelho:
    // um detector de "é celular" já tentou decidir por todo mundo e foi ele que embaçou a tela.
    this.sharpBtn = this.button(panel, () => {
      setThriftyPixels(!isThriftyPixels());
      this.refreshTexts();
    });

    // OS CONTROLES DE TOQUE: mão, tamanho, visibilidade e vibração (ver touchSettings). Só no
    // toque — no teclado não há botão na tela a mover —, e a vibração só onde o navegador vibra.
    if (isTouchDevice()) {
      const flip = (toggle: () => void) => () => { toggle(); this.refreshTexts(); };
      this.touchBtns = {
        hand: this.button(panel, flip(() => setLeftHanded(!isLeftHanded()))),
        size: this.button(panel, flip(() => setBigButtons(!hasBigButtons()))),
        look: this.button(panel, flip(() => setSolidButtons(!hasSolidButtons()))),
        haptics: canVibrate()
          ? this.button(panel, flip(() => { setHaptics(!hasHaptics()); haptic(20); }))
          : undefined,
      };
    }

    // O IDIOMA: o jogo tem dois, e o botao oferece o OUTRO — escrito na lingua de destino ("Play
    // in English" no pt-br), para quem nao le a lingua atual achar a saida. Trocar recarrega a
    // pagina (ver i18n.ts); a aventura ja esta salva a cada evento que muda o mundo.
    this.languageBtn = this.button(panel, () => setLang(otherLang()));

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

    if (this.cb.onRestart) {
      const onRestart = this.cb.onRestart;
      this.restartBtn = this.button(panel, () => this.confirmThen(this.restartBtn as HTMLDivElement, onRestart));
      this.restartBtn.classList.add('zh-dim');
    }
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
    this.daylightBtn.textContent = getDaylight() >= 0.5 ? t('pause.nightfall') : t('pause.daylight');
    // O rótulo diz o que o toque FAZ, como o do fullscreen e o do dia — nunca onde se está.
    this.sharpBtn.textContent = isThriftyPixels() ? t('pause.sharpOn') : t('pause.sharpOff');
    if (this.touchBtns) {
      // O mesmo contrato: o rótulo diz o que o toque FAZ.
      this.touchBtns.hand.textContent = isLeftHanded() ? t('pause.rightHand') : t('pause.leftHand');
      this.touchBtns.size.textContent = hasBigButtons() ? t('pause.smallButtons') : t('pause.bigButtons');
      this.touchBtns.look.textContent = hasSolidButtons() ? t('pause.softButtons') : t('pause.solidButtons');
      if (this.touchBtns.haptics) {
        this.touchBtns.haptics.textContent = hasHaptics() ? t('pause.hapticsOff') : t('pause.hapticsOn');
      }
    }
    if (this.fullscreenBtn) {
      this.fullscreenBtn.textContent = document.fullscreenElement
        ? t('pause.fullscreenExit')
        : t('pause.fullscreen');
    }
    this.languageBtn.textContent = t('pause.switchLanguage');
    if (this.restartBtn) this.restartBtn.textContent = t('pause.restart');
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
      return;
    }
    // As setas andam na mochila enquanto ela esta aberta. A cena esta com `scene.pause()`, entao
    // nada disto chega ao heroi — a mesma tecla que anda no mundo escolhe o item aqui dentro.
    if (this.subScreen && (event.code === 'ArrowLeft' || event.code === 'ArrowRight')) {
      event.preventDefault();
      this.subScreen.step(event.code === 'ArrowRight' ? 1 : -1);
    }
  };
}

// ── discreet touch pause button (mobile) ──────────────────────────────────────

// O terceiro teste nao e redundancia: ha aparelho que responde `maxTouchPoints = 0` e nao expoe
// `ontouchstart` (alguns Android em modo desktop, e o emulador de dispositivo do Chrome), e
// nesses o par de botoes sumia — deixando o jogo sem A e sem B num aparelho que so tem dedo.
// Errar para o lado de MOSTRAR e barato: num desktop de verdade `pointer: coarse` e falso.
export const isTouchDevice = (): boolean => {
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return true;
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
};

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
    // Ver ActionButtons: sem esta marca, o toque no botao tambem viraria um arrasto de andar.
    this.el.setAttribute('data-zh-ui', '');
    this.el.setAttribute('aria-label', t('pause.title'));
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
