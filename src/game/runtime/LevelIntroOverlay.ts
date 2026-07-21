import Phaser from 'phaser';

import { FONT_FAMILY, TEXT_RESOLUTION } from '@/game/constants';

// A short, quiet title card when a standalone puzzle level begins. It lives on Phaser's
// transparent UI canvas so the HD-2D world remains visible underneath, while the restrained
// dark band and gold pixel ornaments give the authored level name a deliberate entrance.
const OVERLAY_DEPTH = 100;
const HOLD_MS = 2050;
const EXIT_MS = 520;

export class LevelIntroOverlay {
  private readonly scrim: Phaser.GameObjects.Rectangle;
  private readonly band: Phaser.GameObjects.Rectangle;
  private readonly content: Phaser.GameObjects.Container;
  private readonly ornament: Phaser.GameObjects.Graphics;
  private readonly levelLabel: Phaser.GameObjects.Text;
  private readonly title: Phaser.GameObjects.Text;
  private exitTimer?: Phaser.Time.TimerEvent;
  private closed = false;

  public constructor(
    private readonly scene: Phaser.Scene,
    levelNumber: number,
    levelName: string,
    private readonly onComplete: () => void,
  ) {
    this.scrim = scene.add.rectangle(0, 0, 1, 1, 0x03050a, 1)
      .setOrigin(0.5)
      .setAlpha(0.72)
      .setDepth(OVERLAY_DEPTH);

    this.band = scene.add.rectangle(0, 0, 1, 1, 0x08090f, 1)
      .setOrigin(0.5)
      .setAlpha(0)
      .setScale(1, 0.22)
      .setDepth(OVERLAY_DEPTH + 1);

    this.ornament = scene.add.graphics();
    this.levelLabel = scene.add.text(0, 0, `LEVEL ${String(levelNumber).padStart(2, '0')}`, {
      fontFamily: FONT_FAMILY,
      fontSize: '10px',
      color: '#c9a961',
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5).setLetterSpacing(4);

    this.title = scene.add.text(0, 0, levelName.trim(), {
      fontFamily: FONT_FAMILY,
      fontSize: '28px',
      color: '#fff3cf',
      align: 'center',
      stroke: '#07070b',
      strokeThickness: 6,
      shadow: { offsetX: 0, offsetY: 4, color: '#000000', blur: 0, stroke: true, fill: true },
      resolution: TEXT_RESOLUTION,
    }).setOrigin(0.5);

    this.content = scene.add.container(0, 0, [this.ornament, this.levelLabel, this.title])
      .setAlpha(0)
      .setScale(0.96)
      .setDepth(OVERLAY_DEPTH + 2);

    this.resize(scene.scale.width, scene.scale.height);
    this.playEntrance();
  }

  public get isOpen(): boolean {
    return !this.closed;
  }

  public resize(width: number, height: number): void {
    if (this.closed) return;
    const centerX = Math.round(width / 2);
    const centerY = Math.round(height / 2);
    const titleSize = Phaser.Math.Clamp(Math.floor(width / 34), 16, 36);
    const labelSize = Phaser.Math.Clamp(Math.floor(width / 105), 8, 12);
    const textWidth = Phaser.Math.Clamp(width * 0.78, 230, 920);

    this.scrim.setPosition(centerX, centerY).setSize(width, height);
    this.title.setFontSize(titleSize).setWordWrapWidth(textWidth, true);
    this.levelLabel.setFontSize(labelSize);

    const bandHeight = Phaser.Math.Clamp(Math.max(172, this.title.height + 124), 172, Math.min(286, height * 0.54));
    this.band.setPosition(centerX, centerY).setSize(width, bandHeight);
    this.content.setPosition(centerX, centerY);
    this.levelLabel.setPosition(0, -Math.round(bandHeight * 0.27));
    this.title.setPosition(0, 2);

    const lineWidth = Phaser.Math.Clamp(width * 0.54, 190, 590);
    const halfLine = lineWidth / 2;
    const frameY = bandHeight / 2 - 17;
    const dividerY = Math.min(bandHeight * 0.29, (this.title.height / 2) + 32);
    this.ornament.clear();
    this.ornament.lineStyle(1, 0xc9a961, 0.38);
    this.ornament.beginPath();
    this.ornament.moveTo(-halfLine, -frameY);
    this.ornament.lineTo(halfLine, -frameY);
    this.ornament.moveTo(-halfLine, frameY);
    this.ornament.lineTo(halfLine, frameY);
    this.ornament.moveTo(-halfLine * 0.48, dividerY);
    this.ornament.lineTo(-9, dividerY);
    this.ornament.moveTo(9, dividerY);
    this.ornament.lineTo(halfLine * 0.48, dividerY);
    this.ornament.strokePath();
    this.ornament.fillStyle(0xf5d97a, 0.9);
    this.ornament.fillPoints([
      new Phaser.Geom.Point(0, dividerY - 4),
      new Phaser.Geom.Point(4, dividerY),
      new Phaser.Geom.Point(0, dividerY + 4),
      new Phaser.Geom.Point(-4, dividerY),
    ], true);
    this.ornament.fillStyle(0xc9a961, 0.62);
    this.ornament.fillRect(-halfLine - 2, -frameY - 2, 4, 4);
    this.ornament.fillRect(halfLine - 2, -frameY - 2, 4, 4);
    this.ornament.fillRect(-halfLine - 2, frameY - 2, 4, 4);
    this.ornament.fillRect(halfLine - 2, frameY - 2, 4, 4);
  }

  public destroy(): void {
    this.close(false);
  }

  private playEntrance(): void {
    const targetY = this.content.y;
    this.content.y = targetY + 12;

    this.scene.tweens.add({
      targets: this.scrim,
      alpha: 0.5,
      duration: 700,
      ease: 'Sine.easeOut',
    });
    this.scene.tweens.add({
      targets: this.band,
      alpha: 0.88,
      scaleY: 1,
      duration: 460,
      ease: 'Cubic.easeOut',
    });
    this.scene.tweens.add({
      targets: this.content,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      y: targetY,
      delay: 130,
      duration: 540,
      ease: 'Cubic.easeOut',
    });

    this.exitTimer = this.scene.time.delayedCall(HOLD_MS, () => this.playExit());
  }

  private playExit(): void {
    if (this.closed) return;
    this.scene.tweens.add({
      targets: this.content,
      alpha: 0,
      y: this.content.y - 9,
      duration: 390,
      ease: 'Cubic.easeIn',
    });
    this.scene.tweens.add({
      targets: this.band,
      alpha: 0,
      scaleY: 0.62,
      duration: EXIT_MS,
      ease: 'Cubic.easeInOut',
    });
    this.scene.tweens.add({
      targets: this.scrim,
      alpha: 0,
      duration: EXIT_MS,
      ease: 'Sine.easeIn',
      onComplete: () => this.close(true),
    });
  }

  private close(notify: boolean): void {
    if (this.closed) return;
    this.closed = true;
    this.exitTimer?.remove();
    this.exitTimer = undefined;
    this.scene.tweens.killTweensOf([this.scrim, this.band, this.content]);
    this.content.destroy(true);
    this.band.destroy();
    this.scrim.destroy();
    if (notify) this.onComplete();
  }
}
