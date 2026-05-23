import Phaser from 'phaser';

import { FONT_FAMILY, SCENE_DEPTHS } from '@/game/constants';
import type { DialogScript } from '@/game/dialogs/NpcDialogs';

const DEPTH = SCENE_DEPTHS.toast + 5;
const CHAR_DELAY_MS = 28;
const NPC_TEXT_COLOR = '#dde8ff';
const NAR_TEXT_COLOR = '#7788aa';

export class DialogOverlay {
  private readonly all: Phaser.GameObjects.GameObject[] = [];
  private readonly speakerLabel: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;
  private readonly promptText: Phaser.GameObjects.Text;

  private lineIndex = 0;
  private charIndex = 0;
  private isTyping = false;
  private typewriterEvent?: Phaser.Time.TimerEvent;
  private blinkTween?: Phaser.Tweens.Tween;
  private closing = false;

  private readonly spaceKey: Phaser.Input.Keyboard.Key | undefined;
  private readonly enterKey: Phaser.Input.Keyboard.Key | undefined;
  private readonly escKey: Phaser.Input.Keyboard.Key | undefined;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly script: DialogScript,
    private readonly onClose: () => void,
  ) {
    const { width, height } = scene.scale;
    const panelH = Math.max(110, Math.round(height * 0.36));
    const panelW = Math.round(width * 0.92);
    const panelX = Math.round((width - panelW) / 2);
    const panelY = height - panelH - 8;
    const PAD = Math.max(8, Math.round(panelW * 0.026));

    const reg = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.all.push(o); return o; };

    reg(scene.add.rectangle(0, 0, width, height, 0x000000, 0.55)
      .setOrigin(0).setDepth(DEPTH).setInteractive());

    reg(scene.add.rectangle(panelX, panelY, panelW, panelH, 0x07070e)
      .setOrigin(0).setDepth(DEPTH + 1));

    const npcColorInt = parseInt(script.npcColorHex.slice(1), 16);

    reg(scene.add.rectangle(panelX, panelY, panelW, 3, npcColorInt)
      .setOrigin(0).setDepth(DEPTH + 2));

    // Portrait column
    const portraitColW = Math.round(panelH * 0.78);
    const portraitSize = portraitColW - PAD * 2;
    reg(scene.add.image(
      panelX + PAD + portraitSize / 2,
      panelY + panelH / 2,
      script.npcAssetKey,
      script.npcFrame,
    ).setDisplaySize(portraitSize, portraitSize).setOrigin(0.5).setDepth(DEPTH + 2));

    // Vertical divider
    const divX = panelX + portraitColW;
    reg(scene.add.rectangle(divX, panelY + PAD, 1, panelH - PAD * 2, npcColorInt, 0.3)
      .setOrigin(0).setDepth(DEPTH + 2));

    const textX = divX + PAD;
    const textAreaW = (panelX + panelW - PAD) - textX;
    const fontSize = Math.max(6, Math.min(9, Math.floor(panelH / 15)));
    const res = Math.max(2, Math.ceil(window.devicePixelRatio));

    this.speakerLabel = reg(scene.add.text(textX, panelY + PAD, '', {
      fontFamily: FONT_FAMILY, fontSize: `${fontSize}px`,
      color: script.npcColorHex, resolution: res,
    }).setOrigin(0, 0).setDepth(DEPTH + 3)) as Phaser.GameObjects.Text;

    this.bodyText = reg(scene.add.text(textX, panelY + PAD + fontSize + 10, '', {
      fontFamily: FONT_FAMILY, fontSize: `${fontSize}px`,
      color: NPC_TEXT_COLOR,
      wordWrap: { width: textAreaW },
      lineSpacing: 6, resolution: res,
    }).setOrigin(0, 0).setDepth(DEPTH + 3)) as Phaser.GameObjects.Text;

    this.promptText = reg(scene.add.text(
      panelX + panelW - PAD, panelY + panelH - PAD, '',
      { fontFamily: FONT_FAMILY, fontSize: `${Math.max(5, fontSize - 1)}px`, color: '#445566', resolution: res },
    ).setOrigin(1, 1).setDepth(DEPTH + 3).setAlpha(0)) as Phaser.GameObjects.Text;

    this.spaceKey = scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.enterKey = scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.escKey   = scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    // Delay pointer listener so the bump keypress doesn't instantly advance
    scene.time.delayedCall(220, () => {
      if (!this.closing) {
        scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this);
      }
    });

    // Fade in, then start first line
    for (const obj of this.all) (obj as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(0);
    scene.tweens.add({
      targets: this.all, alpha: 1, duration: 180, ease: 'Power1',
      onComplete: () => { if (!this.closing) this.showLine(0); },
    });
  }

  public update(): void {
    if (this.closing) return;
    if (this.spaceKey && Phaser.Input.Keyboard.JustDown(this.spaceKey)) this.advance();
    if (this.enterKey && Phaser.Input.Keyboard.JustDown(this.enterKey)) this.advance();
    if (this.escKey   && Phaser.Input.Keyboard.JustDown(this.escKey))   this.close();
  }

  public destroy(): void {
    this.typewriterEvent?.remove();
    this.blinkTween?.destroy();
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this);
    if (this.spaceKey) this.scene.input.keyboard?.removeKey(this.spaceKey);
    if (this.enterKey) this.scene.input.keyboard?.removeKey(this.enterKey);
    if (this.escKey)   this.scene.input.keyboard?.removeKey(this.escKey);
    for (const obj of this.all) obj.destroy();
  }

  private showLine(index: number): void {
    this.typewriterEvent?.remove();
    this.typewriterEvent = undefined;
    this.blinkTween?.destroy();
    this.blinkTween = undefined;
    this.promptText.setAlpha(0);

    this.lineIndex = index;
    this.charIndex = 0;
    this.isTyping = true;

    const line = this.script.lines[index];
    const isNarrator = line.speaker === 'narrator';

    this.speakerLabel.setText(isNarrator ? '' : this.script.npcName);
    this.bodyText.setColor(isNarrator ? NAR_TEXT_COLOR : NPC_TEXT_COLOR);
    this.bodyText.setText('');

    const fullText = isNarrator ? `(${line.text})` : line.text;

    this.typewriterEvent = this.scene.time.addEvent({
      delay: CHAR_DELAY_MS,
      loop: true,
      callback: () => {
        this.charIndex++;
        this.bodyText.setText(fullText.slice(0, this.charIndex));
        if (this.charIndex >= fullText.length) {
          this.typewriterEvent?.remove();
          this.typewriterEvent = undefined;
          this.finishLine();
        }
      },
    });
  }

  private finishLine(): void {
    this.isTyping = false;
    const isLast = this.lineIndex >= this.script.lines.length - 1;
    this.promptText.setText(isLast ? '[ FECHAR ]' : '[ CONTINUAR ]').setAlpha(1);
    this.blinkTween = this.scene.tweens.add({
      targets: this.promptText,
      alpha: 0.2, duration: 600,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  private advance(): void {
    if (this.closing) return;
    if (this.isTyping) {
      this.skipTypewriter();
      return;
    }
    this.blinkTween?.destroy();
    this.blinkTween = undefined;
    if (this.lineIndex >= this.script.lines.length - 1) {
      this.close();
    } else {
      this.showLine(this.lineIndex + 1);
    }
  }

  private skipTypewriter(): void {
    this.typewriterEvent?.remove();
    this.typewriterEvent = undefined;
    this.isTyping = false;
    const line = this.script.lines[this.lineIndex];
    const isNarrator = line.speaker === 'narrator';
    this.bodyText.setText(isNarrator ? `(${line.text})` : line.text);
    this.finishLine();
  }

  private readonly handlePointerDown = (): void => { this.advance(); };

  private close(): void {
    this.closing = true;
    this.typewriterEvent?.remove();
    this.blinkTween?.destroy();
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this);
    this.scene.tweens.add({
      targets: this.all, alpha: 0, duration: 150, ease: 'Power1',
      onComplete: () => this.onClose(),
    });
  }
}
