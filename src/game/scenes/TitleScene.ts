import Phaser from 'phaser';

import { FONT_FAMILY, TEXT_RESOLUTION } from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';
import { t, tWords } from '@/game/i18n/i18n';

// The game's start screen. Deliberately theatrical: the screen sits dark until the first
// gesture (which also unlocks audio), then the title assembles ONE WORD PER WATER DROP —
// ZERO · THE · HERO · POR · ANDRÉ N. DARCIE — each word dropping in on its own drip with a
// flash, a small camera jolt and a spreading ripple. Once the title is whole, the prompt
// returns and the next key/tap begins the run (Preload → Title → Intro → Game).
type TitleState = 'idle' | 'revealing' | 'done';

const REVEAL_START_MS = 350; // pause after the first gesture before the first drop
const REVEAL_GAP_MS = 1000; // one word per ~second — slow, patient, dripping

export class TitleScene extends Phaser.Scene {
  public static readonly key = 'title';

  private state: TitleState = 'idle';
  private starting = false;
  private revealTargets: Phaser.GameObjects.Text[] = [];
  private revealIndex = 0;
  private revealTimers: Phaser.Time.TimerEvent[] = [];
  private prompt?: Phaser.GameObjects.Text;
  private promptTween?: Phaser.Tweens.Tween;

  public constructor() {
    super(TitleScene.key);
  }

  public create(): void {
    const { width, height } = this.scale;
    this.state = 'idle';
    this.starting = false;
    this.revealTargets = [];
    this.revealIndex = 0;
    this.revealTimers = [];
    this.cameras.main.setBackgroundColor('#08080d');
    this.cameras.main.fadeIn(900, 0, 0, 0);

    // Decode the SFX + loops and ask for the menu ambience (soft water drops). The
    // AudioContext stays locked until the first gesture, so nothing sounds yet — the drips
    // bed and the reveal drops both bloom the moment the player first presses a key/taps.
    getSoundManager().preload();
    getSoundManager().startMusic('menu', 1600);

    // The title words and the credit, laid out in their final places but invisible — each
    // will drop in on its own beat.
    const titleSize = Phaser.Math.Clamp(Math.floor(width / 18), 20, 56);
    const creditSize = Phaser.Math.Clamp(Math.floor(width / 46), 9, 18);
    const titleStyle = {
      fontFamily: FONT_FAMILY, fontSize: `${titleSize}px`, color: '#cfc9bd', resolution: TEXT_RESOLUTION,
    } as const;
    const creditStyle = {
      fontFamily: FONT_FAMILY, fontSize: `${creditSize}px`, color: '#7f7a86', resolution: TEXT_RESOLUTION,
    } as const;

    const titleWords = this.layoutRow(tWords('title.words'), width / 2, Math.round(height * 0.42), titleStyle, titleSize * 0.42);
    const creditWords = this.layoutRow([t('title.by'), t('title.author')], width / 2, Math.round(height * 0.60), creditStyle, creditSize * 0.7);
    this.revealTargets = [...titleWords, ...creditWords];

    // Quiet prompt — shown before the reveal begins and again once the title is whole.
    this.prompt = this.add
      .text(width / 2, Math.round(height * 0.80), t('title.prompt'), {
        fontFamily: FONT_FAMILY,
        fontSize: `${Phaser.Math.Clamp(Math.floor(width / 64), 7, 12)}px`,
        color: '#5a5560',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(2);
    this.blinkPrompt();

    // Small delay before arming input, so a leftover keypress can't fire the reveal instantly.
    this.time.delayedCall(400, () => {
      this.input.keyboard?.on('keydown', this.handleInput, this);
      this.input.on(Phaser.Input.Events.POINTER_DOWN, this.handleInput, this);
    });
  }

  // Build a horizontal row of word Texts centred on cx, each invisible, and return them in order.
  private layoutRow(
    words: readonly string[],
    cx: number,
    y: number,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    gap: number,
  ): Phaser.GameObjects.Text[] {
    const objs = words.map((w) => this.add.text(0, y, w, style).setOrigin(0.5).setDepth(3).setAlpha(0));
    const total = objs.reduce((s, o) => s + o.width, 0) + gap * Math.max(0, objs.length - 1);
    let x = cx - total / 2;
    for (const o of objs) {
      o.setX(x + o.width / 2);
      x += o.width + gap;
    }
    return objs;
  }

  private blinkPrompt(): void {
    if (!this.prompt) return;
    this.promptTween?.stop();
    this.prompt.setAlpha(0);
    this.promptTween = this.tweens.add({
      targets: this.prompt, alpha: 0.6, duration: 900, delay: 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  // One input handler for the whole screen; behaviour depends on the reveal state.
  private handleInput(): void {
    if (this.state === 'idle') this.beginReveal();
    else if (this.state === 'revealing') this.skipReveal();
    else this.start();
  }

  private beginReveal(): void {
    this.state = 'revealing';
    getSoundManager().unlock(); // first gesture — lift the autoplay lock so the drops sound
    this.promptTween?.stop();
    if (this.prompt) this.tweens.add({ targets: this.prompt, alpha: 0, duration: 250 });
    this.revealTimers = this.revealTargets.map((_, i) =>
      this.time.delayedCall(REVEAL_START_MS + i * REVEAL_GAP_MS, () => this.revealNext()));
  }

  private revealNext(): void {
    if (this.revealIndex >= this.revealTargets.length) return;
    this.revealWord(this.revealTargets[this.revealIndex]);
    this.revealIndex += 1;
    if (this.revealIndex >= this.revealTargets.length) {
      this.time.delayedCall(1100, () => this.finishReveal());
    }
  }

  // Pressing during the reveal fast-forwards: drop the remaining words in a quick cascade.
  private skipReveal(): void {
    this.revealTimers.forEach((t) => t.remove(false));
    this.revealTimers = [];
    let k = 0;
    while (this.revealIndex < this.revealTargets.length) {
      const o = this.revealTargets[this.revealIndex];
      this.revealIndex += 1;
      this.time.delayedCall(k * 110, () => this.revealWord(o));
      k += 1;
    }
    this.time.delayedCall(k * 110 + 500, () => this.finishReveal());
  }

  private finishReveal(): void {
    if (this.state === 'done') return;
    this.state = 'done';
    this.blinkPrompt();
  }

  // The drama of a single word landing. The final word — the author's name — gets its own
  // cinematic treatment (an impact hit, a full-screen flash, a hard jolt, a gold flare and a
  // shockwave) instead of the water drop the other words get.
  private revealWord(o: Phaser.GameObjects.Text): void {
    const isFinale = o === this.revealTargets[this.revealTargets.length - 1];
    if (isFinale) {
      this.revealFinale(o);
      return;
    }
    getSoundManager().playWaterDrop();
    o.setAlpha(0).setScale(1.35).setTintFill(0xffffff);
    this.tweens.add({ targets: o, alpha: 1, duration: 200, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: o, scale: 1, duration: 460, ease: 'Back.easeOut' });
    this.time.delayedCall(150, () => o.clearTint());
    this.cameras.main.shake(140, 0.004);

    const ripple = this.add
      .ellipse(o.x, o.y + o.height * 0.34, Math.max(12, o.width * 0.5), 6, 0x9fb4c8, 0.45)
      .setDepth(1);
    this.tweens.add({
      targets: ripple, scaleX: 2.4, scaleY: 3.2, alpha: 0, duration: 680, ease: 'Cubic.easeOut',
      onComplete: () => ripple.destroy(),
    });
  }

  private revealFinale(o: Phaser.GameObjects.Text): void {
    getSoundManager().playTitleImpact();
    // Kept simple: the author's name appears in gold — like the other words but a touch larger
    // and warmer — over the epic impact. No screen flash or shockwave; just a soft camera jolt.
    o.setAlpha(0).setScale(1.4).setTintFill(0xfff2c8);
    this.tweens.add({ targets: o, alpha: 1, duration: 240, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: o, scale: 1, duration: 540, ease: 'Back.easeOut' });
    this.time.delayedCall(220, () => o.setTintFill(0xf5d97a)); // settle to solid gold (fill, so it reads over the dim base colour)
    this.cameras.main.shake(180, 0.005);
  }

  private readonly start = (): void => {
    if (this.starting) return;
    this.starting = true;
    getSoundManager().unlock(); // first user gesture — lift the autoplay lock
    this.cameras.main.fadeOut(450, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('language');
    });
  };
}
