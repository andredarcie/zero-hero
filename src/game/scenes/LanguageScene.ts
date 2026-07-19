import Phaser from 'phaser';

import { FONT_FAMILY, TEXT_RESOLUTION } from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';
import { LOCALES, getLocale, setLocale, t, type Locale } from '@/game/i18n/i18n';

// Language picker — the FIRST screen of the menu flow (Language → Title → aventura|levels). It
// comes before the title so the title's buttons render in the chosen language. Built to work
// equally on PC and touch: two large panels the player can drive with arrows + Enter, the number
// keys 1/2, or a hover/click/tap. The layout is responsive — panels sit side by side in landscape
// and stack in portrait (phones) — and re-lays out on resize/orientation change.
//
// Being first, it also owns audio bring-up: the AudioContext stays locked until a user gesture,
// so the menu music + drips are queued here and bloom on the first key/tap (which unlocks them).
const ACCENT = 0xf5d97a;
const PANEL_FILL = 0x14141f;
const PANEL_FILL_SEL = 0x22222f;
const PANEL_STROKE = 0x3a3a4a;

interface Panel {
  locale: Locale;
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

export class LanguageScene extends Phaser.Scene {
  public static readonly key = 'language';

  private panels: Panel[] = [];
  private selected = 0;
  private heading?: Phaser.GameObjects.Text;
  private hint?: Phaser.GameObjects.Text;
  private confirming = false;

  public constructor() {
    super(LanguageScene.key);
  }

  public create(): void {
    const { width } = this.scale;
    this.confirming = false;
    this.panels = [];
    this.selected = Math.max(0, LOCALES.indexOf(getLocale()));

    this.cameras.main.setBackgroundColor('#08080d');
    this.cameras.main.fadeIn(400, 0, 0, 0);

    // Decode the SFX + loops and queue the menu ambience; it's silent until the first gesture
    // lifts the autoplay lock (unlockAudio, below).
    getSoundManager().preload();
    getSoundManager().startMusic('menu', 1600);

    this.heading = this.add
      .text(0, 0, t('language.heading'), {
        fontFamily: FONT_FAMILY,
        fontSize: `${Phaser.Math.Clamp(Math.floor(width / 26), 12, 28)}px`,
        color: '#cfc9bd',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2);

    this.hint = this.add
      .text(0, 0, t('language.hint'), {
        fontFamily: FONT_FAMILY,
        fontSize: `${Phaser.Math.Clamp(Math.floor(width / 64), 7, 12)}px`,
        color: '#5a5560',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2);

    LOCALES.forEach((locale, i) => {
      const bg = this.add
        .rectangle(0, 0, 10, 10, PANEL_FILL, 1)
        .setStrokeStyle(2, PANEL_STROKE)
        .setDepth(1)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(0, 0, t(`language.options.${locale}`), {
          fontFamily: FONT_FAMILY,
          fontSize: `${Phaser.Math.Clamp(Math.floor(width / 30), 12, 26)}px`,
          color: '#cfc9bd',
          resolution: TEXT_RESOLUTION,
        })
        .setOrigin(0.5)
        .setDepth(2);

      // Hover highlights (desktop); a click/tap picks that language and moves on (touch-friendly:
      // one gesture, no separate confirm step).
      bg.on(Phaser.Input.Events.POINTER_OVER, () => this.setSelected(i));
      bg.on(Phaser.Input.Events.POINTER_DOWN, () => { this.unlockAudio(); this.confirm(i); });

      this.panels.push({ locale, bg, label });
    });

    this.layout();
    this.applySelection();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);

    // Arm the keyboard a beat later so the key/tap that left the title screen can't leak through
    // and pick a language instantly.
    this.time.delayedCall(250, () => {
      this.input.keyboard?.on('keydown', this.handleKey, this);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
  }

  // Position the heading, both panels and the hint for the current screen size / orientation.
  private readonly layout = (): void => {
    const { width, height } = this.scale;
    const stacked = width < height * 1.1; // portrait-ish → stack the panels vertically
    const cy = Math.round(height * 0.55);

    this.heading?.setPosition(width / 2, Math.round(height * (stacked ? 0.2 : 0.24)));
    this.hint?.setPosition(width / 2, Math.round(height * 0.87));

    if (stacked) {
      const panelW = Math.min(width * 0.82, 460);
      const panelH = Phaser.Math.Clamp(height * 0.16, 54, 120);
      const gap = panelH * 0.45;
      const startY = cy - (this.panels.length * panelH + (this.panels.length - 1) * gap) / 2 + panelH / 2;
      this.panels.forEach((p, i) => this.placePanel(p, width / 2, startY + i * (panelH + gap), panelW, panelH));
    } else {
      const panelW = Phaser.Math.Clamp(width * 0.34, 150, 320);
      const panelH = Phaser.Math.Clamp(height * 0.36, 120, 280);
      const gap = Phaser.Math.Clamp(width * 0.06, 16, 80);
      const startX = width / 2 - (this.panels.length * panelW + (this.panels.length - 1) * gap) / 2 + panelW / 2;
      this.panels.forEach((p, i) => this.placePanel(p, startX + i * (panelW + gap), cy, panelW, panelH));
    }
  };

  private placePanel(panel: Panel, x: number, y: number, w: number, h: number): void {
    panel.bg.setPosition(x, y).setSize(w, h);
    // A Rectangle's hit area doesn't follow setSize on its own — refresh it so taps stay accurate.
    panel.bg.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, w, h),
      Phaser.Geom.Rectangle.Contains,
    );
    panel.bg.input!.cursor = 'pointer';
    panel.label.setPosition(x, y);
  }

  // First gesture on this (the first) screen lifts the autoplay lock so the menu bed sounds.
  private unlockAudio(): void {
    getSoundManager().unlock();
  }

  private setSelected(index: number): void {
    if (this.confirming || index === this.selected) return;
    this.selected = index;
    this.applySelection();
    getSoundManager().playWaterDrop();
  }

  private move(delta: number): void {
    const n = this.panels.length;
    this.setSelected((this.selected + delta + n) % n);
  }

  private applySelection(): void {
    this.panels.forEach((panel, i) => {
      const sel = i === this.selected;
      panel.bg.setFillStyle(sel ? PANEL_FILL_SEL : PANEL_FILL, 1);
      panel.bg.setStrokeStyle(sel ? 3 : 2, sel ? ACCENT : PANEL_STROKE);
      panel.label.setColor(sel ? '#fff2c8' : '#8a8594');
    });
  }

  private readonly handleKey = (event: KeyboardEvent): void => {
    if (this.confirming) return;
    this.unlockAudio();
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        this.move(-1);
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        this.move(1);
        break;
      case 'Enter':
      case ' ':
        this.confirm(this.selected);
        break;
      case '1':
        this.confirm(0);
        break;
      case '2':
        this.confirm(1);
        break;
      default:
        break;
    }
  };

  private confirm(index: number): void {
    if (this.confirming) return;
    this.confirming = true;
    this.selected = index;
    this.applySelection();
    setLocale(this.panels[index].locale);
    getSoundManager().playWaterDrop();

    this.cameras.main.fadeOut(350, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('title');
    });
  }

  private teardown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.input.keyboard?.off('keydown', this.handleKey, this);
  }
}
