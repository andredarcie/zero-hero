import Phaser from 'phaser';

import { FONT_FAMILY, TEXT_RESOLUTION } from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';

// The game's start screen — deliberately understated: just the title in the dark and a quiet
// prompt. Any key / tap begins the run (Preload → Title → Intro → Game; the intro's finale
// returns here).
export class TitleScene extends Phaser.Scene {
  public static readonly key = 'title';

  private starting = false;

  public constructor() {
    super(TitleScene.key);
  }

  public create(): void {
    const { width, height } = this.scale;
    this.starting = false;
    this.cameras.main.setBackgroundColor('#08080d');
    this.cameras.main.fadeIn(900, 0, 0, 0);

    // Start decoding audio right away and ask for the title theme. On a fresh page load
    // the AudioContext is locked until the first gesture — the theme then blooms on the
    // player's first key/tap (and carries on through the intro screen).
    getSoundManager().preload();
    getSoundManager().startMusic('title', 1200);

    // Title — muted, centered, no flourish.
    const titleSize = Phaser.Math.Clamp(Math.floor(width / 18), 20, 56);
    const title = this.add
      .text(width / 2, Math.round(height * 0.44), 'ZERO THE HERO', {
        fontFamily: FONT_FAMILY,
        fontSize: `${titleSize}px`,
        color: '#cfc9bd',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(2);
    this.tweens.add({ targets: title, alpha: 1, duration: 1200, ease: 'Sine.easeInOut' });

    // Quiet prompt.
    const prompt = this.add
      .text(width / 2, Math.round(height * 0.62), 'pressione qualquer tecla', {
        fontFamily: FONT_FAMILY,
        fontSize: `${Phaser.Math.Clamp(Math.floor(width / 64), 7, 12)}px`,
        color: '#5a5560',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(2);
    this.tweens.add({
      targets: prompt,
      alpha: 0.6,
      duration: 900,
      delay: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Small delay before input, so a leftover keypress can't skip the title instantly.
    this.time.delayedCall(450, () => {
      this.input.keyboard?.once('keydown', this.start, this);
      this.input.once(Phaser.Input.Events.POINTER_DOWN, this.start, this);
    });
  }

  private readonly start = (): void => {
    if (this.starting) return;
    this.starting = true;
    getSoundManager().unlock(); // first user gesture — lift the autoplay lock
    this.cameras.main.fadeOut(450, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('intro');
    });
  };
}
