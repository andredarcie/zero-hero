import Phaser from 'phaser';

import { ASSET_KEYS, FONT_FAMILY, HERO_FRAMES, TEXT_RESOLUTION } from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';

type Segment = { text: string; color: string };

const DEFAULT_COLOR = '#e9ecef';
const CHAR_DELAY_MS = 55;
const LINE_PAUSE_MS = 650;
const AUTO_START_MS = 4200;

// "Woman's Voice" — intro screen. [color=...] words are colored inline.
const INTRO_LINES: readonly string[] = [
  'Wake up [color=#868e96]Zero[/color]!',
  'You have to become [color=#1f92ef]One[/color].',
];

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
    this.cameras.main.setBackgroundColor('#08080f');
    this.cameras.main.fadeIn(700, 0, 0, 0);

    // The title theme carries straight through the intro (idempotent if already playing;
    // also covers dev flows that boot directly into this scene).
    getSoundManager().preload();
    getSoundManager().startMusic('title', 1200);

    // The sleeping hero, dim and breathing
    const heroSize = Math.round(Math.min(width, height) * 0.2);
    const hero = this.add
      .image(width / 2, Math.round(height * 0.4), ASSET_KEYS.hero, HERO_FRAMES.idleDown)
      .setOrigin(0.5)
      .setAlpha(0)
      .setTint(0x5a5a7a)
      .setDisplaySize(heroSize, heroSize);
    this.tweens.add({ targets: hero, alpha: 0.85, duration: 1300, ease: 'Sine.easeInOut' });
    this.tweens.add({
      targets: hero,
      scaleX: hero.scaleX * 1.045,
      scaleY: hero.scaleY * 1.045,
      duration: 1900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Build both voice lines hidden, positioned and centered, ready to type
    const fontSize = Phaser.Math.Clamp(Math.floor(width / 26), 8, 16);
    const res = TEXT_RESOLUTION;
    const lineYs = [Math.round(height * 0.62), Math.round(height * 0.72)];

    INTRO_LINES.forEach((raw, i) => {
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
    if (index < INTRO_LINES.length - 1) {
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
      .text(width / 2, Math.round(height * 0.9), '[ press any key ]', {
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
    this.time.delayedCall(AUTO_START_MS, () => this.startGame());
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
