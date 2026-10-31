import type Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import { getLang, setLang, t, type Lang } from '@/game/i18n/i18n';
import {
  getDaylight, getDofIntensity, isThriftyPixels, setDaylight, setDofIntensity, setThriftyPixels,
} from '@/game/runtime/graphicsSettings';
import {
  KEY_BG, KEY_BORDER, KEY_GLYPH, PIXEL_FONT, pixelFrame,
} from '@/game/runtime/uiStyle';
import {
  canVibrate, haptic, hasBigButtons, hasHaptics, hasSolidButtons, isLeftHanded,
  setBigButtons, setHaptics, setLeftHanded, setSolidButtons,
} from '@/game/runtime/touchSettings';

// The pause screen is plain DOM layered over the Phaser canvas — the same approach as
// DialogOverlay / EditorDomUi. That choice matters here because DOM keeps receiving input while the
// Phaser scene is hard-paused (scene.pause() freezes update/tweens/timers AND scene input, so the
// menu must live outside the canvas to stay clickable).
//
// A PAUSA É O TÍTULO DO JOGO, sem painel: letra de pixel solta sobre o mundo escurecido, e só três
// saídas. Tudo o que se ajusta mora em Opções, como dado (`optionSections`): opção nova é uma linha
// na tabela, e ela já nasce andando com teclado, mouse e dedo.

const STYLE_ID = 'zh-pause-style';
const ROOT_ID = 'zh-pause-root';
const TOUCH_BTN_ID = 'zh-pause-touch-btn';
const SLIDER_STEPS = 10;

const CSS = `
#${ROOT_ID} {
  position: fixed; inset: 0; z-index: 60;
  font-family: ${PIXEL_FONT}; color: #e7dcc4; text-shadow: 2px 2px 0 #000;
  -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none;
}
#${ROOT_ID} * { box-sizing: border-box; }
#${ROOT_ID} .zh-pause-scrim {
  position: absolute; inset: 0;
  background: rgba(6, 5, 4, 0.66);
  -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
  opacity: 0; transition: opacity 160ms ease;
}
#${ROOT_ID}.zh-in .zh-pause-scrim { opacity: 1; }
#${ROOT_ID} .zh-pause-page {
  position: absolute; inset: 0; display: none; flex-direction: column; align-items: center;
  padding: calc(16px + env(safe-area-inset-top, 0px)) calc(16px + env(safe-area-inset-right, 0px))
    calc(16px + env(safe-area-inset-bottom, 0px)) calc(16px + env(safe-area-inset-left, 0px));
  pointer-events: none;
}
#${ROOT_ID} .zh-pause-page.zh-on { display: flex; }
#${ROOT_ID} .zh-pause-page.zh-main { justify-content: center; }
#${ROOT_ID} h1 { margin: 0; font-weight: 400; font-size: 40px; line-height: 1.2; color: ${KEY_GLYPH}; flex: 0 0 auto; }
#${ROOT_ID} .zh-main h1 { margin-bottom: 40px; }
#${ROOT_ID} .zh-pause-page.zh-options h1 { font-size: 24px; margin-bottom: 16px; }
#${ROOT_ID} button {
  appearance: none; border: 0; background: none; margin: 0; padding: 0;
  font: inherit; color: inherit; text-shadow: inherit; cursor: pointer; touch-action: manipulation;
}
/* AS SAÍDAS: o selecionado acende na cor do keycap, com o cursor de pixel ao lado. */
#${ROOT_ID} .zh-pause-btn {
  position: relative; display: block; flex: 0 0 auto; min-height: 56px; padding: 16px 40px;
  font-size: 24px; line-height: 1; pointer-events: auto; color: #cfc6ad; white-space: nowrap;
}
#${ROOT_ID} .zh-pause-btn.is-selected { color: ${KEY_BORDER}; }
#${ROOT_ID} .zh-pause-btn.is-selected::before {
  content: '>'; position: absolute; left: 8px; top: 16px;
  animation: zh-pause-nudge 640ms steps(2, jump-none) infinite;
}
#${ROOT_ID} .zh-pause-btn:active { transform: translateY(2px); }
@keyframes zh-pause-nudge { 0% { transform: translateX(0); } 100% { transform: translateX(4px); } }
/* AS OPÇÕES: a lista rola, o título e o Voltar ficam. */
#${ROOT_ID} .zh-pause-list {
  flex: 1 1 auto; min-height: 0; width: min(640px, 100%); overflow-y: auto; pointer-events: auto;
  scrollbar-width: thin; scrollbar-color: #8a7556 transparent; overscroll-behavior: contain;
}
#${ROOT_ID} .zh-pause-list::-webkit-scrollbar { width: 8px; }
#${ROOT_ID} .zh-pause-list::-webkit-scrollbar-thumb { background: #8a7556; }
#${ROOT_ID} section { min-width: 0; padding-bottom: 8px; }
#${ROOT_ID} h2 { margin: 0; padding: 16px 8px 8px; font-weight: 400; font-size: 16px; line-height: 1; color: #a89c7e; }
#${ROOT_ID} .zh-pause-row {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  width: 100%; min-height: 48px; padding: 0 8px; font-size: 16px; line-height: 1.2; text-align: left;
}
#${ROOT_ID} .zh-pause-row.is-selected { color: ${KEY_BORDER}; background: rgba(255, 224, 102, 0.08); }
#${ROOT_ID} .zh-pause-value { display: flex; align-items: center; flex: 0 0 auto; }
#${ROOT_ID} .zh-pause-value b { font-weight: 400; min-width: 9em; text-align: center; }
/* As setas têm alvo de dedo: a linha tem 48px, e cada seta ocupa a altura dela. */
#${ROOT_ID} .zh-pause-arrow { width: 32px; height: 48px; flex: 0 0 auto; color: inherit; }
#${ROOT_ID} .zh-pause-arrow:active { transform: translateY(2px); }
/* O VOLUME É UMA FILA DE BLOCOS: o ajuste do jogo em pixel, nunca o deslizador do sistema. */
#${ROOT_ID} .zh-pause-blocks {
  display: flex; align-items: center; gap: 3px; height: 48px; padding: 0 4px;
  flex: 0 0 auto; cursor: pointer; touch-action: none;
}
#${ROOT_ID} .zh-pause-blocks i { display: block; width: 14px; height: 20px; background: rgba(245, 239, 220, 0.16); }
#${ROOT_ID} .zh-pause-blocks i.zh-full { background: currentColor; box-shadow: 2px 2px 0 #000; }
/* Tela pequena: 12px dá três pixels de aparelho por pixel de arte num celular, e continua nítido. */
@media (max-width: 560px), (max-height: 500px) {
  #${ROOT_ID} h1 { font-size: 24px; }
  #${ROOT_ID} .zh-main h1 { margin-bottom: 24px; }
  #${ROOT_ID} .zh-pause-page.zh-options h1 { font-size: 16px; margin-bottom: 4px; }
  #${ROOT_ID} .zh-pause-btn { font-size: 16px; min-height: 48px; padding-left: 28px; padding-right: 28px; }
  #${ROOT_ID} .zh-pause-btn.is-selected::before { top: 16px; left: 4px; }
  #${ROOT_ID} .zh-pause-row { font-size: 12px; gap: 8px; }
  #${ROOT_ID} h2 { font-size: 12px; padding-top: 12px; }
  #${ROOT_ID} .zh-pause-blocks i { width: 11px; }
  #${ROOT_ID} .zh-pause-blocks { gap: 2px; }
}
@media (max-width: 340px) {
  #${ROOT_ID} .zh-pause-btn { font-size: 12px; }
  #${ROOT_ID} .zh-pause-btn.is-selected::before { top: 18px; }
}
/* Telefone deitado: duas colunas de seções, e o que não couber rola para baixo, nunca de lado. */
@media (max-height: 500px) and (min-width: 640px) {
  #${ROOT_ID} .zh-pause-list {
    width: 100%; display: grid; grid-template-columns: 1fr 1fr; column-gap: 24px; align-content: start;
  }
  #${ROOT_ID} .zh-pause-arrow { width: 24px; }
  #${ROOT_ID} .zh-pause-page.zh-main { padding-top: 8px; padding-bottom: 8px; }
}
@media (prefers-reduced-motion: reduce) {
  #${ROOT_ID} .zh-pause-btn.is-selected::before { animation: none; }
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
  /** Absent (editor playtest — the title scene isn't registered) hides the quit entry. */
  onQuit?: () => void;
}

/** Uma escolha entre valores com nome, ou um nível de 0 a 1. É tudo o que uma opção pode ser. */
type OptionDef =
  | { kind: 'choice'; label: string; values: { text: () => string; apply: () => void; active: () => boolean }[] }
  | { kind: 'level'; label: string; read: () => number; write: (v: number) => void; release?: () => void };

type OptionSection = { title: string; options: OptionDef[] };

const onOff = (read: () => boolean, write: (v: boolean) => void): Extract<OptionDef, { kind: 'choice' }>['values'] => [
  { text: () => t('pause.on'), apply: () => write(true), active: read },
  { text: () => t('pause.off'), apply: () => write(false), active: () => !read() },
];

const two = (
  a: [string, () => void, () => boolean],
  b: [string, () => void, () => boolean],
): Extract<OptionDef, { kind: 'choice' }>['values'] => [a, b].map(([key, apply, active]) => ({
  text: () => t(key), apply, active,
}));

const setFullscreen = (on: boolean): void => {
  if (on) void document.documentElement.requestFullscreen();
  else if (document.fullscreenElement) void document.exitFullscreen();
};

// Os nomes de idioma ficam na língua deles: é por eles que quem não lê a atual acha a saída.
// Trocar recarrega a página (ver i18n.ts); a aventura já está salva a cada evento que muda o mundo.
const LANGUAGES: { lang: Lang; name: string }[] = [
  { lang: 'pt-br', name: 'Português' },
  { lang: 'en', name: 'English' },
];

/** TODAS as opções do jogo. Só aparece o que este aparelho pode mudar. */
const optionSections = (): OptionSection[] => {
  const sound = getSoundManager();
  const image: OptionDef[] = [];
  // A tela cheia é da página, não do Phaser: o canvas já ocupa a janela. O iPhone não deixa.
  if (document.fullscreenEnabled) {
    image.push({ kind: 'choice', label: 'pause.fullscreen', values: onOff(() => Boolean(document.fullscreenElement), setFullscreen) });
  }
  image.push(
    // A hora do dia e a nitidez são chaves: só dois estados valem a pena (ver graphicsSettings).
    {
      kind: 'choice',
      label: 'pause.timeOfDay',
      values: two(
        ['pause.night', () => setDaylight(0), () => getDaylight() < 0.5],
        ['pause.day', () => setDaylight(1), () => getDaylight() >= 0.5],
      ),
    },
    {
      kind: 'choice',
      label: 'pause.sharpness',
      values: two(
        ['pause.sharpFull', () => setThriftyPixels(false), () => !isThriftyPixels()],
        ['pause.sharpThrifty', () => setThriftyPixels(true), () => isThriftyPixels()],
      ),
    },
    // O desfoque das bordas é a assinatura do visual, mas cansa a vista de alguns: zero o desliga.
    { kind: 'level', label: 'pause.blur', read: getDofIntensity, write: setDofIntensity },
  );

  const sections: OptionSection[] = [
    {
      title: 'pause.sectionSound',
      options: [
        { kind: 'level', label: 'pause.music', read: () => sound.getMusicVolume(), write: (v) => sound.setMusicVolume(v) },
        // O som ao soltar é o que deixa julgar o nível.
        { kind: 'level', label: 'pause.sfx', read: () => sound.getSfxVolume(), write: (v) => sound.setSfxVolume(v), release: () => sound.playItemStash() },
      ],
    },
    { title: 'pause.sectionImage', options: image },
  ];

  // Sem dedo não há botão na tela a mover, e a vibração só existe onde o navegador vibra.
  if (isTouchDevice()) {
    const touch: OptionDef[] = [
      {
        kind: 'choice',
        label: 'pause.hand',
        values: two(
          ['pause.handRight', () => setLeftHanded(false), () => !isLeftHanded()],
          ['pause.handLeft', () => setLeftHanded(true), isLeftHanded],
        ),
      },
      {
        kind: 'choice',
        label: 'pause.size',
        values: two(
          ['pause.sizeNormal', () => setBigButtons(false), () => !hasBigButtons()],
          ['pause.sizeBig', () => setBigButtons(true), hasBigButtons],
        ),
      },
      {
        kind: 'choice',
        label: 'pause.look',
        values: two(
          ['pause.lookSoft', () => setSolidButtons(false), () => !hasSolidButtons()],
          ['pause.lookSolid', () => setSolidButtons(true), hasSolidButtons],
        ),
      },
    ];
    if (canVibrate()) {
      touch.push({ kind: 'choice', label: 'pause.vibration', values: onOff(hasHaptics, (v) => { setHaptics(v); if (v) haptic(20); }) });
    }
    sections.push({ title: 'pause.sectionTouch', options: touch });
  }

  sections.push({
    title: 'pause.sectionGame',
    options: [{
      kind: 'choice',
      label: 'pause.language',
      values: LANGUAGES.map(({ lang, name }) => ({
        text: () => name,
        apply: () => setLang(lang),
        active: () => getLang() === lang,
      })),
    }],
  });
  return sections;
};

/** Uma linha viva da lista de opções: quem a move (teclado, mouse ou dedo) chama a mesma coisa. */
type OptionRow = {
  el: HTMLElement;
  /** Seta para a esquerda (-1) ou para a direita (+1). */
  step: (direction: number) => void;
  /** Enter/Z: a escolha gira; o nível não faz nada (é setas ou arrasto). */
  activate: () => void;
  refresh: () => void;
};

export class PauseMenu {
  private readonly root: HTMLDivElement;
  private readonly mainPage: HTMLDivElement;
  private readonly optionsPage: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private readonly mainButtons: HTMLButtonElement[] = [];
  private readonly rows: OptionRow[] = [];
  private readonly backBtn: HTMLButtonElement;
  private page: 'main' | 'options' = 'main';
  /** A linha acesa da página atual. Nas opções, a última posição é o Voltar. */
  private selected = 0;
  private destroyed = false;

  public constructor(scene: Phaser.Scene, private readonly cb: PauseMenuCallbacks) {
    void scene; // the menu is scene-agnostic DOM; kept in the signature for overlay parity
    ensureStyle();

    this.root = document.createElement('div');
    this.root.id = ROOT_ID;

    const scrim = document.createElement('div');
    scrim.className = 'zh-pause-scrim';
    // Tocar fora volta ao jogo, mas só na primeira página: nas opções, o dedo que erra uma linha
    // não pode jogar a pessoa de volta no mundo.
    scrim.addEventListener('click', () => { if (this.page === 'main') this.cb.onResume(); });
    this.root.appendChild(scrim);

    this.mainPage = this.pageEl('zh-main', t('pause.title'));
    this.mainButton(t('pause.resume'), () => this.cb.onResume());
    this.mainButton(t('pause.options'), () => this.showPage('options'));
    if (this.cb.onQuit) {
      // Sem "certeza?": sair guarda a aventura, e o título oferece Continuar. Nada se perde.
      const onQuit = this.cb.onQuit;
      this.mainButton(t('pause.quit'), onQuit);
    }

    this.optionsPage = this.pageEl('zh-options', t('pause.options'));
    this.list = document.createElement('div');
    this.list.className = 'zh-pause-list';
    this.optionsPage.appendChild(this.list);
    for (const section of optionSections()) {
      const box = document.createElement('section');
      const title = document.createElement('h2');
      title.textContent = t(section.title);
      box.appendChild(title);
      for (const def of section.options) {
        const row = def.kind === 'choice' ? this.choiceRow(def) : this.levelRow(def);
        const index = this.rows.length;
        this.rows.push(row);
        row.el.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') this.select(index); });
        row.el.addEventListener('pointerdown', () => this.select(index));
        row.refresh();
        box.appendChild(row.el);
      }
      this.list.appendChild(box);
    }
    this.backBtn = this.pageButton(this.optionsPage, t('pause.back'), () => this.showPage('main'));
    this.backBtn.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') this.select(this.rows.length); });

    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.handleKeyDown, true);
    document.addEventListener('fullscreenchange', this.handleFullscreenChange);
    this.showPage('main');
    requestAnimationFrame(() => { if (!this.destroyed) this.root.classList.add('zh-in'); });
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('keydown', this.handleKeyDown, true);
    document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
    this.root.remove();
  }

  // ── building blocks ────────────────────────────────────────────────────────

  private pageEl(variant: string, title: string): HTMLDivElement {
    const page = document.createElement('div');
    page.className = `zh-pause-page ${variant}`;
    const heading = document.createElement('h1');
    heading.textContent = title;
    page.appendChild(heading);
    this.root.appendChild(page);
    return page;
  }

  private pageButton(parent: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'zh-pause-btn';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    parent.appendChild(btn);
    return btn;
  }

  private mainButton(label: string, onClick: () => void): void {
    const index = this.mainButtons.length;
    const btn = this.pageButton(this.mainPage, label, onClick);
    btn.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') this.select(index); });
    this.mainButtons.push(btn);
  }

  private rowEl(label: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'zh-pause-row';
    const name = document.createElement('span');
    name.textContent = t(label);
    el.appendChild(name);
    return el;
  }

  private choiceRow(def: Extract<OptionDef, { kind: 'choice' }>): OptionRow {
    const el = this.rowEl(def.label);
    const value = document.createElement('span');
    value.className = 'zh-pause-value';
    const text = document.createElement('b');
    const arrow = (glyph: string, direction: number): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'zh-pause-arrow';
      btn.textContent = glyph;
      btn.setAttribute('aria-label', glyph === '<' ? t('pause.previous') : t('pause.next'));
      btn.addEventListener('click', (event) => { event.stopPropagation(); row.step(direction); });
      return btn;
    };
    const current = (): number => Math.max(0, def.values.findIndex((v) => v.active()));
    const row: OptionRow = {
      el,
      step: (direction) => {
        const n = def.values.length;
        def.values[(current() + direction + n) % n].apply();
        row.refresh();
      },
      activate: () => row.step(1),
      refresh: () => { text.textContent = def.values[current()].text(); },
    };
    value.append(arrow('<', -1), text, arrow('>', 1));
    el.appendChild(value);
    // A linha inteira é alvo: o dedo não precisa acertar a seta.
    el.addEventListener('click', () => row.step(1));
    el.style.cursor = 'pointer';
    return row;
  }

  private levelRow(def: Extract<OptionDef, { kind: 'level' }>): OptionRow {
    const el = this.rowEl(def.label);
    const bar = document.createElement('div');
    bar.className = 'zh-pause-blocks';
    bar.setAttribute('role', 'slider');
    bar.setAttribute('aria-label', t(def.label));
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    const blocks = Array.from({ length: SLIDER_STEPS }, () => bar.appendChild(document.createElement('i')));
    el.appendChild(bar);
    const refresh = (): void => {
      const level = Math.round(def.read() * SLIDER_STEPS);
      blocks.forEach((block, i) => block.classList.toggle('zh-full', i < level));
      bar.setAttribute('aria-valuenow', String(level * SLIDER_STEPS));
    };
    const setLevel = (level: number): void => {
      def.write(Math.max(0, Math.min(SLIDER_STEPS, level)) / SLIDER_STEPS);
      refresh();
    };
    const fromPointer = (event: PointerEvent): void => {
      const rect = bar.getBoundingClientRect();
      setLevel(Math.round(((event.clientX - rect.left) / rect.width) * SLIDER_STEPS));
    };
    bar.addEventListener('pointerdown', (event) => {
      bar.setPointerCapture(event.pointerId);
      fromPointer(event);
    });
    bar.addEventListener('pointermove', (event) => { if (bar.hasPointerCapture(event.pointerId)) fromPointer(event); });
    bar.addEventListener('pointerup', () => def.release?.());
    return {
      el,
      step: (direction) => {
        setLevel(Math.round(def.read() * SLIDER_STEPS) + direction);
        def.release?.();
      },
      activate: () => { /* nível não gira */ },
      refresh,
    };
  }

  // ── a seleção: uma só, para teclado, mouse e dedo ──────────────────────────

  private get selectable(): HTMLElement[] {
    return this.page === 'main' ? this.mainButtons : [...this.rows.map((r) => r.el), this.backBtn];
  }

  private showPage(page: 'main' | 'options'): void {
    const leaving = this.page;
    this.page = page;
    this.mainPage.classList.toggle('zh-on', page === 'main');
    this.optionsPage.classList.toggle('zh-on', page === 'options');
    if (page === 'options') this.list.scrollTop = 0;
    // Voltar das opções reacende "Opções", de onde a pessoa veio.
    this.select(page === 'main' && leaving === 'options' ? 1 : 0);
  }

  private select(index: number): void {
    const items = this.selectable;
    this.selected = (index + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle('is-selected', i === this.selected));
  }

  private confirm(): void {
    if (this.page === 'main') {
      this.mainButtons[this.selected]?.click();
    } else if (this.selected === this.rows.length) {
      this.showPage('main');
    } else {
      this.rows[this.selected]?.activate();
    }
  }

  private readonly handleFullscreenChange = (): void => {
    if (!this.destroyed) this.rows.forEach((row) => row.refresh());
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.destroyed) return;
    const code = event.code;
    const up = code === 'ArrowUp' || code === 'KeyW';
    const down = code === 'ArrowDown' || code === 'KeyS';
    const left = code === 'ArrowLeft' || code === 'KeyA';
    const right = code === 'ArrowRight' || code === 'KeyD';
    const accept = code === 'Enter' || code === 'NumpadEnter' || code === 'Space' || code === 'KeyZ' || code === 'KeyJ';
    if (!(code === 'Escape' || up || down || left || right || accept)) return;
    event.preventDefault();
    // Andar pela lista com a seta segurada é bom; confirmar e sair segurando, nunca.
    if (event.repeat && !(up || down || left || right)) return;
    if (code === 'Escape') {
      if (this.page === 'options') this.showPage('main');
      else this.cb.onResume();
    } else if (up || down) {
      this.select(this.selected + (up ? -1 : 1));
      this.selectable[this.selected].scrollIntoView({ block: 'nearest' });
    } else if (left || right) {
      if (this.page === 'options') this.rows[this.selected]?.step(left ? -1 : 1);
    } else {
      this.confirm();
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
