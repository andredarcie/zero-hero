// A PAUSA: abrir o menu (o jogo para por baixo) e fechar (ele volta).

import { PauseMenu } from '@/game/runtime/PauseMenu';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { GameScene } from '../GameScene';
import { PauseTouchButton } from '@/game/runtime/PauseMenu';

export class PauseControl {
  // Pause: the DOM menu (only while open) + the always-there touch button on mobile. While
  // the menu is up the scene is hard-paused (scene.pause() — update, tweens, timers, anims
  // all freeze on the current frame); the DOM keeps working because it lives off-canvas.
  public pauseMenu?: PauseMenu;
  public pauseTouchButton?: PauseTouchButton;

  public constructor(private readonly host: GameScene) {}

  public openPauseMenu(): void {
    // Never pause over another modal state — their overlays own ESC/scrim already, and the
    // dialog camera pan must not be frozen midway.
    if (this.pauseMenu || this.host.dialog.dialogOpen || this.host.dialogCam.camShifting
      || this.host.hand.itemGetOpen || this.host.cutsceneActive) return;
    // A bolsa e a pausa nunca convivem: uma congela o mundo e a outra existe justamente por nao
    // congelar. Quem abre a pausa fecha a bolsa (sem equipar nada — fechar nao e confirmar).
    this.pauseTouchButton?.setVisible(false);
    this.host.actions.actionButtons?.setVisible(false);
    // scene.get('title') is undefined in the editor playtest config; without it "quit" would
    // have nowhere to go, so the entry is hidden.
    const canQuit = Boolean(this.host.scene.get('title'));
    this.pauseMenu = new PauseMenu(this.host, {
      onResume: () => this.closePauseMenu(),
      onQuit: canQuit
        ? () => {
          this.closePauseMenu();
          getSoundManager().music.stopMusic();
          getSoundManager().ambience.stopAmbience();
          // Sair pelo menu GUARDA: o retrato fecha aqui e o titulo passa a oferecer Continue.
          this.host.save.persistAdventure();
          this.host.scene.start('title');
        }
        : undefined,
    });
    this.host.actions.useBufferMs = 0;
    this.host.scene.pause();
  }

  private closePauseMenu(): void {
    if (!this.pauseMenu) return;
    this.pauseMenu.destroy();
    this.pauseMenu = undefined;
    this.pauseTouchButton?.setVisible(true);
    this.host.actions.actionButtons?.setVisible(true);
    this.host.scene.resume();
  }
}
