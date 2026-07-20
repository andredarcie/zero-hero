import Phaser from 'phaser';

import {
  ASSET_KEYS, CHUNK_COLUMNS, CHUNK_ROWS, FONT_FAMILY, GAMEPLAY_HERO_MAX_SIZE, GAMEPLAY_HERO_SCALE,
  HERO_FRAMES, MIN_BOARD_TILE_SIZE, TEXT_RESOLUTION,
} from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';
import { t } from '@/game/i18n/i18n';
import { createBoardMetrics } from '@/game/shared/grid';

type Segment = { text: string; color: string };

const DEFAULT_COLOR = '#e9ecef';
const CHAR_DELAY_MS = 55;
const LINE_PAUSE_MS = 650;
// The hero grows from a speck to its exact in-game size over this long; reaching full size
// ends the intro. Long enough for the singing bowl to swell and both voice lines to speak.
const GROW_MS = 7000;

// "Woman's Voice" — intro screen, from the active locale. [color=...] words are colored inline
// (translators keep the markup around the highlighted word: "Zero"/"One").
const introLines = (): readonly string[] => [t('intro.line1'), t('intro.line2')];

const parseColorMarkup = (line: string): Segment[] => {
  const segments: Segment[] = [];
  const re = /\[color=(#[0-9a-fA-F]{3,8})\]([\s\S]*?)\[\/color\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: line.slice(lastIndex, match.index), color: DEFAULT_COLOR });
    }
    segments.push({ text: match[2], color: match[1] });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < line.length) {
    segments.push({ text: line.slice(lastIndex), color: DEFAULT_COLOR });
  }
  return segments;
};

export class IntroScene extends Phaser.Scene {
  public static readonly key = 'intro';

  private readonly lineTexts: Phaser.GameObjects.Text[][] = [];
  private readonly lineFullText: string[][] = [];
  private currentLine = 0;
  private charIndex = 0;
  private typing = false;
  private finished = false;
  private starting = false;
  private typeEvent?: Phaser.Time.TimerEvent;
  private promptText?: Phaser.GameObjects.Text;
  private blink?: Phaser.Tweens.Tween;

  public constructor() {
    super(IntroScene.key);
  }

  public create(): void {
    const { width, height } = this.scale;
    // Scenes are constructed once and re-entered on every new run (quit-to-title, prophecy
    // ending). Reset all run state like TitleScene/LanguageScene do — a stale `starting`
    // swallows every key press and the typewriter writes into destroyed Text objects,
    // leaving a black screen that never advances.
    this.lineTexts.length = 0;
    this.lineFullText.length = 0;
    this.currentLine = 0;
    this.charIndex = 0;
    this.typing = false;
    this.finished = false;
    this.starting = false;
    this.typeEvent = undefined;
    this.promptText = undefined;
    this.blink = undefined;
    this.cameras.main.setBackgroundColor('#08080f');
    this.cameras.main.fadeIn(700, 0, 0, 0);

    // The intro's sound is now spiritual: fade out the title-screen drips and let a Tibetan
    // singing bowl swell as the hero wakes. (preload also covers dev flows that boot here.)
    getSoundManager().preload();
    getSoundManager().stopMusic(800);
    getSoundManager().playSingingBowl();

    // A soul waking into the world: the hero begins as a tiny, cold speck and GROWS — brightening
    // from dim to full colour — until it reaches the exact size it will be in gameplay, at which
    // point the world begins. That target is the game's tile size (the hero is one tile), computed
    // the same way GameScene does, so the hand-off is seamless.
    const gameHeroSize = createBoardMetrics(width, height, {
      columns: CHUNK_COLUMNS,
      rows: CHUNK_ROWS,
      minTileSize: MIN_BOARD_TILE_SIZE,
      characterScale: GAMEPLAY_HERO_SCALE,
      maxCharacterSize: GAMEPLAY_HERO_MAX_SIZE,
    }).tileSize;
    const startSize = Math.max(2, Math.round(gameHeroSize * 0.05));

    const hero = this.add
      .image(width / 2, Math.round(height * 0.42), ASSET_KEYS.hero, HERO_FRAMES.idleDown)
      .setOrigin(0.5)
      .setAlpha(0)
      .setTint(0x4a4a6a)
      .setDisplaySize(startSize, startSize)
      .setDepth(1);
    this.tweens.add({ targets: hero, alpha: 1, duration: 1600, ease: 'Sine.easeIn' });

    const cold = Phaser.Display.Color.ValueToColor(0x4a4a6a);
    const warm = Phaser.Display.Color.ValueToColor(0xffffff);
    this.tweens.add({
      targets: hero,
      displayWidth: gameHeroSize,
      displayHeight: gameHeroSize,
      duration: GROW_MS,
      ease: 'Cubic.easeIn',
      onUpdate: (tween) => {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(cold, warm, 100, Math.round(tween.progress * 100));
        hero.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      },
      // Reaching full size does NOT advance the scene — the intro waits for the player. It only
      // proceeds to the game on a key press / tap (handled in handleAdvance once the lines finish).
      onComplete: () => hero.clearTint(),
    });

    // Build both voice lines hidden, positioned and centered, ready to type
    const fontSize = Phaser.Math.Clamp(Math.floor(width / 26), 8, 16);
    const res = TEXT_RESOLUTION;
    const lineYs = [Math.round(height * 0.62), Math.round(height * 0.72)];

    introLines().forEach((raw, i) => {
      const segs = parseColorMarkup(raw);
      const texts = segs.map((s) =>
        this.add
          .text(0, lineYs[i], s.text, {
            fontFamily: FONT_FAMILY,
            fontSize: `${fontSize}px`,
            color: s.color,
            resolution: res,
          })
          .setOrigin(0, 0.5)
          .setDepth(1));

      const totalW = texts.reduce((acc, t) => acc + t.width, 0);
      let x = Math.round((width - totalW) / 2);
      texts.forEach((t) => {
        t.setX(x);
        x += t.width;
        t.setText('');
      });

      this.lineTexts.push(texts);
      this.lineFullText.push(segs.map((s) => s.text));
    });

    this.input.keyboard?.on('keydown', this.handleAdvance, this);
    this.time.delayedCall(280, () => {
      this.input.on(Phaser.Input.Events.POINTER_DOWN, this.handleAdvance, this);
    });

    this.time.delayedCall(650, () => this.typeLine(0));
  }

  private typeLine(index: number): void {
    this.currentLine = index;
    this.charIndex = 0;
    this.typing = true;

    const totalChars = this.lineFullText[index].reduce((acc, s) => acc + s.length, 0);

    this.typeEvent = this.time.addEvent({
      delay: CHAR_DELAY_MS,
      loop: true,
      callback: () => {
        this.charIndex++;
        this.renderLineProgress(index, this.charIndex);
        if (this.charIndex >= totalChars) {
          this.typeEvent?.remove();
          this.typeEvent = undefined;
          this.typing = false;
          this.onLineComplete(index);
        }
      },
    });
  }

  private renderLineProgress(index: number, count: number): void {
    let remaining = count;
    const fulls = this.lineFullText[index];
    this.lineTexts[index].forEach((t, i) => {
      const full = fulls[i];
      const take = Phaser.Math.Clamp(remaining, 0, full.length);
      t.setText(full.slice(0, take));
      remaining -= full.length;
    });
  }

  private onLineComplete(index: number): void {
    if (index < this.lineFullText.length - 1) {
      this.time.delayedCall(LINE_PAUSE_MS, () => {
        if (!this.starting) this.typeLine(index + 1);
      });
    } else {
      this.finished = true;
      this.showPrompt();
    }
  }

  private showPrompt(): void {
    const { width, height } = this.scale;
    const res = TEXT_RESOLUTION;
    this.promptText = this.add
      .text(width / 2, Math.round(height * 0.9), t('intro.prompt'), {
        fontFamily: FONT_FAMILY,
        fontSize: '7px',
        color: '#5a6472',
        resolution: res,
      })
      .setOrigin(0.5)
      .setDepth(1);
    this.blink = this.tweens.add({
      targets: this.promptText,
      alpha: 0.25,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    // No timed auto-start: the intro ends when the hero finishes growing to full size (or the
    // player presses to skip ahead).
  }

  private readonly handleAdvance = (): void => {
    if (this.starting) return;

    if (this.typing) {
      this.typeEvent?.remove();
      this.typeEvent = undefined;
      const total = this.lineFullText[this.currentLine].reduce((acc, s) => acc + s.length, 0);
      this.renderLineProgress(this.currentLine, total);
      this.typing = false;
      this.onLineComplete(this.currentLine);
      return;
    }

    if (this.finished) this.startGame();
  };

  private startGame(): void {
    if (this.starting) return;
    this.starting = true;

    this.typeEvent?.remove();
    this.blink?.remove();
    this.input.keyboard?.off('keydown', this.handleAdvance, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handleAdvance, this);

    this.cameras.main.fadeOut(450, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('game');
    });
  }
}
