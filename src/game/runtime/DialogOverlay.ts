import type Phaser from 'phaser';

import { DIALOG_PANEL_FRACTION, DIALOG_PANEL_MAX_WIDTH } from '@/game/constants';
import type { DialogLine, DialogScript, DialogVoice } from '@/game/dialogs/NpcDialogs';
import { getSoundManager } from '@/game/audio/SoundManager';
import { t } from '@/game/i18n/i18n';

// Disco Elysium-style conversation skin. It is rendered as plain DOM layered over the
// Phaser canvas — the same approach the level editor uses (see EditorDomUi). The game
// canvas is a low-resolution pixel-art buffer scaled up with NEAREST sampling
// (image-rendering: pixelated), so serif text drawn *inside* it can never be sharp: it
// inherits the buffer's low resolution and blocky upscale. Rendering the text in DOM lets
// the browser rasterize the font natively at full device resolution — razor-sharp,
// antialiased, and free to use real scrolling for the running dialogue log.
//
// The public surface (constructor, update, destroy) matches the old canvas overlay so
// GameScene needs no changes.

const CHAR_DELAY_MS = 28;
const STYLE_ID = 'zh-dialog-style';
const ROOT_ID = 'zh-dialog-root';
const SERIF = "Georgia, 'Times New Roman', 'Book Antiqua', serif";

const CSS = `
#${ROOT_ID} { position: fixed; inset: 0; pointer-events: none; z-index: 50; }
#${ROOT_ID} .zh-dlg-scrim {
  position: absolute; pointer-events: auto;
  background: rgba(0, 0, 0, 0.3);
  opacity: 0; transition: opacity 160ms ease;
}
#${ROOT_ID} .zh-dlg-panel {
  position: absolute; pointer-events: auto;
  display: flex; flex-direction: column;
  background: #14100c; border-left: 1px solid #3d342a;
  color: #d8d1c0; font-family: ${SERIF};
  box-shadow: -10px 0 30px rgba(0, 0, 0, 0.55);
  opacity: 0; transition: opacity 160ms ease;
  overflow: hidden;
}
#${ROOT_ID}.zh-in .zh-dlg-panel,
#${ROOT_ID}.zh-in .zh-dlg-scrim { opacity: 1; }
#${ROOT_ID} .zh-dlg-log {
  flex: 1 1 auto; min-height: 0;
  display: flex; flex-direction: column;
  overflow-y: auto; overflow-x: hidden;
  padding: 1.4em 1.5em 0.9em;
  scrollbar-width: thin; scrollbar-color: #3d342a transparent;
}
#${ROOT_ID} .zh-dlg-log::-webkit-scrollbar { width: 8px; }
#${ROOT_ID} .zh-dlg-log::-webkit-scrollbar-thumb { background: #3d342a; border-radius: 4px; }
/* Anchor the log to the bottom like Disco Elysium: the newest line sits just above the
   options and the conversation grows upward. margin-top:auto pushes content down while it
   is shorter than the viewport, then collapses so older lines scroll off the top. */
#${ROOT_ID} .zh-dlg-log-inner { margin-top: auto; }
#${ROOT_ID} .zh-dlg-entry { margin-bottom: 1.1em; }
#${ROOT_ID} .zh-dlg-entry:last-child { margin-bottom: 0; }
#${ROOT_ID} .zh-dlg-head { display: flex; align-items: center; gap: 0.55em; margin-bottom: 0.3em; }
#${ROOT_ID} .zh-dlg-portrait {
  flex: 0 0 auto; width: 2.6em; height: 2.6em;
  image-rendering: pixelated; border: 2px solid #fff; background: #0b0906;
}
#${ROOT_ID} .zh-dlg-name {
  font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
  font-size: 0.92em;
}
#${ROOT_ID} .zh-dlg-body { line-height: 1.5; }
#${ROOT_ID} .zh-dlg-body.zh-narr { font-style: italic; color: #8e99ad; }
#${ROOT_ID} .zh-dlg-body::after {
  content: '_'; opacity: 0; margin-left: 0.05em;
}
#${ROOT_ID} .zh-dlg-body.zh-typing::after {
  opacity: 1; animation: zh-dlg-caret 0.6s steps(1) infinite;
}
@keyframes zh-dlg-caret { 50% { opacity: 0; } }
#${ROOT_ID} .zh-dlg-options { flex: 0 0 auto; border-top: 1px solid #3d342a; padding: 0.5em 1.2em 1em; }
/* Reserve the option row's height even while hidden (visibility, not display) so revealing
   it never shrinks the log area and pushes the newest line out of view. */
#${ROOT_ID} .zh-dlg-opt {
  visibility: hidden; padding: 0.4em 0.6em; border-radius: 2px;
  color: #cfc9ba; cursor: pointer;
  transition: background 90ms ease, color 90ms ease;
}
#${ROOT_ID} .zh-dlg-opt.zh-show { visibility: visible; }
#${ROOT_ID} .zh-dlg-opt.zh-show:hover { background: #d4c8a4; color: #241d12; }
#${ROOT_ID} .zh-dlg-opt .zh-opt-num { opacity: 0.6; margin-right: 0.7em; }
`;

export class DialogOverlay {
  private readonly root: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly scrim: HTMLDivElement;
  private readonly log: HTMLDivElement;
  private readonly logInner: HTMLDivElement;
  private readonly option: HTMLDivElement;
  private readonly optionLabel: HTMLSpanElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly portraitUrl: string;

  private activeBody?: HTMLDivElement;

  private lineIndex = 0;
  private charIndex = 0;
  private isTyping = false;
  private pointerArmed = false;
  private destroyed = false;
  private closing = false;
  private typewriterEvent?: Phaser.Time.TimerEvent;

  private currentIsNarrator = false;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly script: DialogScript,
    private readonly onClose: () => void,
    private readonly voice?: DialogVoice,
  ) {
    this.canvas = scene.game.canvas;

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    this.root = document.createElement('div');
    this.root.id = ROOT_ID;

    this.scrim = document.createElement('div');
    this.scrim.className = 'zh-dlg-scrim';
    this.root.appendChild(this.scrim);

    this.panel = document.createElement('div');
    this.panel.className = 'zh-dlg-panel';
    this.root.appendChild(this.panel);

    this.log = document.createElement('div');
    this.log.className = 'zh-dlg-log';
    this.logInner = document.createElement('div');
    this.logInner.className = 'zh-dlg-log-inner';
    this.log.appendChild(this.logInner);
    this.panel.appendChild(this.log);

    const options = document.createElement('div');
    options.className = 'zh-dlg-options';
    this.option = document.createElement('div');
    this.option.className = 'zh-dlg-opt';
    const num = document.createElement('span');
    num.className = 'zh-opt-num';
    num.textContent = '1.';
    this.optionLabel = document.createElement('span');
    this.option.append(num, this.optionLabel);
    this.option.addEventListener('click', () => this.advance());
    options.appendChild(this.option);
    this.panel.appendChild(options);

    document.body.appendChild(this.root);

    this.portraitUrl = this.buildPortraitUrl();
    this.layout();
    window.addEventListener('resize', this.layout);
    window.addEventListener('keydown', this.handleKeyDown, true);

    // Fade in, then reveal the first line. The pointer/scrim advance is armed a beat later
    // so the keypress that opened the dialog can't instantly skip through it.
    requestAnimationFrame(() => { if (!this.destroyed) this.root.classList.add('zh-in'); });
    this.scene.time.delayedCall(180, () => { if (!this.destroyed) this.showLine(0); });
    this.scene.time.delayedCall(220, () => {
      if (this.destroyed) return;
      this.pointerArmed = true;
      this.scrim.addEventListener('click', this.handlePointer);
      this.log.addEventListener('click', this.handlePointer);
    });
  }

  /** Kept for parity with the old canvas overlay; DOM handles its own events. */
  public update(): void { /* no-op */ }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.typewriterEvent?.remove();
    this.typewriterEvent = undefined;
    window.removeEventListener('resize', this.layout);
    window.removeEventListener('keydown', this.handleKeyDown, true);
    this.scrim.removeEventListener('click', this.handlePointer);
    this.log.removeEventListener('click', this.handlePointer);
    this.root.remove();
  }

  // ── Layout: hug the right PANEL_FRACTION of the canvas, in viewport pixels ──
  private readonly layout = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    // Hug the right fraction of the canvas, but cap the width so text never over-stretches.
    const panelW = Math.round(Math.min(rect.width * DIALOG_PANEL_FRACTION, DIALOG_PANEL_MAX_WIDTH));

    this.panel.style.left = `${Math.round(rect.left + rect.width - panelW)}px`;
    this.panel.style.top = `${Math.round(rect.top)}px`;
    this.panel.style.width = `${panelW}px`;
    this.panel.style.height = `${Math.round(rect.height)}px`;

    this.scrim.style.left = `${Math.round(rect.left)}px`;
    this.scrim.style.top = `${Math.round(rect.top)}px`;
    this.scrim.style.width = `${Math.round(rect.width - panelW)}px`;
    this.scrim.style.height = `${Math.round(rect.height)}px`;

    // Scale the whole panel's typography to the canvas so it reads as part of the game.
    const base = Math.max(12, Math.min(18, Math.round(rect.height / 32)));
    this.panel.style.fontSize = `${base}px`;
  };

  /** Rasterize the NPC's sprite frame to a data URL so DOM can show it crisply. */
  private buildPortraitUrl(): string {
    const key = this.script.npcAssetKey;
    const tex = this.scene.textures.get(key);
    // add.image(key, frame) shows frame 0 for a spritesheet and the whole image otherwise;
    // mirror that so the portrait matches the sprite in-world.
    const frame = this.script.npcFrame ?? (tex.has('0') ? '0' : undefined);
    return frame === undefined
      ? this.scene.textures.getBase64(key)
      : this.scene.textures.getBase64(key, String(frame));
  }

  private showLine(index: number): void {
    this.typewriterEvent?.remove();
    this.typewriterEvent = undefined;
    this.hideOption();

    this.lineIndex = index;
    this.charIndex = 0;
    this.isTyping = true;

    const line = this.script.lines[index];
    this.currentIsNarrator = line.speaker === 'narrator';
    this.activeBody = this.appendEntry(line);

    const fullText = line.text;
    this.typewriterEvent = this.scene.time.addEvent({
      delay: CHAR_DELAY_MS,
      loop: true,
      callback: () => {
        this.charIndex++;
        if (this.activeBody) this.activeBody.textContent = fullText.slice(0, this.charIndex);
        this.log.scrollTop = this.log.scrollHeight;
        // Old-RPG "talking" blip: one per couple of letters, skipping spaces and narration.
        const ch = fullText[this.charIndex - 1];
        if (this.voice && !this.currentIsNarrator && ch && ch !== ' ' && this.charIndex % 2 === 0) {
          getSoundManager().playDialogBlip(this.voice.freq, this.voice.wave);
        }
        if (this.charIndex >= fullText.length) {
          this.typewriterEvent?.remove();
          this.typewriterEvent = undefined;
          this.finishLine();
        }
      },
    });
  }

  /**
   * Append a log entry: NPC lines get a bordered portrait plus the caps name in the NPC's
   * color; narration renders as dim italic with no attribution. Returns the body element
   * the typewriter fills.
   */
  private appendEntry(line: DialogLine): HTMLDivElement {
    const isNarrator = line.speaker === 'narrator';
    const entry = document.createElement('div');
    entry.className = 'zh-dlg-entry';

    if (!isNarrator) {
      const head = document.createElement('div');
      head.className = 'zh-dlg-head';
      const portrait = document.createElement('img');
      portrait.className = 'zh-dlg-portrait';
      portrait.src = this.portraitUrl;
      portrait.alt = '';
      portrait.style.borderColor = this.script.npcColorHex;
      const name = document.createElement('div');
      name.className = 'zh-dlg-name';
      name.textContent = this.script.npcName.toUpperCase();
      name.style.color = this.script.npcColorHex;
      head.append(portrait, name);
      entry.appendChild(head);
    }

    const body = document.createElement('div');
    body.className = isNarrator ? 'zh-dlg-body zh-narr zh-typing' : 'zh-dlg-body zh-typing';
    entry.appendChild(body);

    this.logInner.appendChild(entry);
    this.log.scrollTop = this.log.scrollHeight;
    return body;
  }

  private finishLine(): void {
    this.isTyping = false;
    this.activeBody?.classList.remove('zh-typing');
    const isLast = this.lineIndex >= this.script.lines.length - 1;
    this.optionLabel.textContent = isLast ? t('dialog.close') : t('dialog.continue');
    this.option.classList.add('zh-show');
    // Keep the just-finished line pinned to the bottom, above the options.
    this.log.scrollTop = this.log.scrollHeight;
  }

  private hideOption(): void {
    this.option.classList.remove('zh-show');
  }

  private advance(): void {
    if (this.destroyed || this.closing) return;
    if (this.isTyping) {
      this.skipTypewriter();
      return;
    }
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
    if (this.activeBody) this.activeBody.textContent = this.script.lines[this.lineIndex].text;
    this.log.scrollTop = this.log.scrollHeight;
    this.finishLine();
  }

  private readonly handlePointer = (): void => {
    if (this.pointerArmed) this.advance();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.destroyed) return;
    if (event.code === 'Space' || event.code === 'Enter' || event.code === 'NumpadEnter') {
      event.preventDefault();
      this.advance();
    } else if (event.code === 'Escape') {
      event.preventDefault();
      this.close();
    }
  };

  private close(): void {
    if (this.closing) return;
    this.closing = true;
    this.typewriterEvent?.remove();
    this.typewriterEvent = undefined;
    this.root.classList.remove('zh-in');
    this.scene.time.delayedCall(160, () => { if (!this.destroyed) this.onClose(); });
  }
}
