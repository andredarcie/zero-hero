import Phaser from 'phaser';

import { FONT_FAMILY, TEXT_RESOLUTION } from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';
import { setActiveLevel } from '@/game/runtime/activeLevel';
import { t, tWords } from '@/game/i18n/i18n';

// The game's start screen. It used to be theatrical — the title assembling one word per water
// drop — but it now shows the title and the credit STRAIGHT AWAY and offers a choice: play the
// adventure, or play the standalone puzzle levels. The menu flow reaches it already localized
// (Language → Title), so the buttons render in the chosen language.
//
//   • Jogar aventura → the story intro, then the wizard's opening area (Intro → Game).
//   • Jogar levels   → the level list (LevelSelectScene), then the chosen level.
//   • [S]            → the Vampire-Survivors-style mode.
const ACCENT = 0xf5d97a;
const BTN_FILL = 0x14141f;
const BTN_FILL_SEL = 0x22222f;
const BTN_STROKE = 0x3a3a4a;

interface MenuButton {
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  activate: () => void;
}

export class TitleScene extends Phaser.Scene {
  public static readonly key = 'title';

  private buttons: MenuButton[] = [];
  private selected = 0;
  private starting = false;
  private survivorsHint?: Phaser.GameObjects.Text;

  public constructor() {
    super(TitleScene.key);
  }

  public create(): void {
    const { width, height } = this.scale;
    this.starting = false;
    this.buttons = [];
    this.selected = 0;
    this.cameras.main.setBackgroundColor('#08080d');
    this.cameras.main.fadeIn(500, 0, 0, 0);

    // The menu bed is already playing (started on the language screen, which comes first and
    // unlocks audio) — so the title just shows itself; nothing to wait for.

    const titleSize = Phaser.Math.Clamp(Math.floor(width / 18), 20, 56);
    const creditSize = Phaser.Math.Clamp(Math.floor(width / 46), 9, 18);

    this.add
      .text(width / 2, Math.round(height * 0.28), tWords('title.words').join(' '), {
        fontFamily: FONT_FAMILY, fontSize: `${titleSize}px`, color: '#e7dcc4', resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2);

    this.add
      .text(width / 2, Math.round(height * 0.42), `${t('title.by')} ${t('title.author')}`, {
        fontFamily: FONT_FAMILY, fontSize: `${creditSize}px`, color: '#8a8594', resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2);

    // The two doors of the game, stacked and centred.
    this.buttons = [
      this.makeButton(t('title.playAdventure'), Math.round(height * 0.62), () => this.startAdventure()),
      this.makeButton(t('title.playLevels'), Math.round(height * 0.74), () => this.startLevels()),
    ];
    this.applySelection();

    this.survivorsHint = this.add
      .text(width / 2, Math.round(height * 0.90), t('title.survivors'), {
        fontFamily: FONT_FAMILY,
        fontSize: `${Phaser.Math.Clamp(Math.floor(width / 72), 7, 11)}px`,
        color: '#8a4a3a',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2)
      .setAlpha(0.75);

    // Arm input a beat later so the key/tap that left the language screen can't fire a button.
    this.time.delayedCall(300, () => {
      this.input.keyboard?.on('keydown', this.handleKey, this);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
  }

  private makeButton(text: string, y: number, activate: () => void): MenuButton {
    const { width } = this.scale;
    const w = Phaser.Math.Clamp(width * 0.42, 200, 360);
    const h = Phaser.Math.Clamp(this.scale.height * 0.09, 40, 64);
    const bg = this.add
      .rectangle(width / 2, y, w, h, BTN_FILL, 1)
      .setStrokeStyle(2, BTN_STROKE)
      .setDepth(1)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(width / 2, y, text, {
        fontFamily: FONT_FAMILY,
        fontSize: `${Phaser.Math.Clamp(Math.floor(width / 40), 11, 22)}px`,
        color: '#cfc9bd',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2);

    const index = this.buttons.length;
    bg.on(Phaser.Input.Events.POINTER_OVER, () => this.setSelected(index));
    bg.on(Phaser.Input.Events.POINTER_DOWN, () => { this.setSelected(index); activate(); });
    return { bg, label, activate };
  }

  private setSelected(index: number): void {
    if (this.starting || index === this.selected) return;
    this.selected = index;
    this.applySelection();
    getSoundManager().playWaterDrop();
  }

  private move(delta: number): void {
    const n = this.buttons.length;
    if (n === 0) return;
    this.setSelected((this.selected + delta + n) % n);
  }

  private applySelection(): void {
    this.buttons.forEach((btn, i) => {
      const sel = i === this.selected;
      btn.bg.setFillStyle(sel ? BTN_FILL_SEL : BTN_FILL, 1);
      btn.bg.setStrokeStyle(sel ? 3 : 2, sel ? ACCENT : BTN_STROKE);
      btn.label.setColor(sel ? '#fff2c8' : '#8a8594');
    });
  }

  private readonly handleKey = (event: KeyboardEvent): void => {
    if (this.starting) return;
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowLeft':
        this.move(-1);
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        this.move(1);
        break;
      case 'Enter':
      case ' ':
        this.buttons[this.selected]?.activate();
        break;
      case '1':
        this.buttons[0]?.activate();
        break;
      case '2':
        this.buttons[1]?.activate();
        break;
      default:
        // The second door is a keystroke, not a button: [S] drops into Survivors.
        if (event.key.toLowerCase() === 's') this.startSurvivors();
        break;
    }
  };

  private fadeThen(go: () => void): void {
    if (this.starting) return;
    this.starting = true;
    getSoundManager().unlock();
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, go);
  }

  private startAdventure(): void {
    setActiveLevel(null); // the story runs the real overworld, not a level
    this.fadeThen(() => this.scene.start('intro'));
  }

  private startLevels(): void {
    this.fadeThen(() => this.scene.start('levelselect'));
  }

  private startSurvivors(): void {
    getSoundManager().playTitleImpact();
    this.fadeThen(() => this.scene.start('survivors'));
  }

  private teardown(): void {
    this.input.keyboard?.off('keydown', this.handleKey, this);
  }
}
