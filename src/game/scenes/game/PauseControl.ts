// A PAUSA: abrir o menu (o jogo para por baixo) e fechar (ele volta); e o ajuste do zoom, que abre das opções.

import { PauseMenu } from '@/game/runtime/PauseMenu';
import { ZoomSetup } from '@/game/runtime/ZoomSetup';
import { getSoundManager } from '@/game/audio/SoundManager';
import type * as Engine from '@/game/engine';
import type { GameScene } from '../GameScene';
import { PauseTouchButton } from '@/game/runtime/PauseMenu';

/** O que PauseControl usa de GameScene (e a cena do motor, que ele passa a quem monta objetos do mundo). */
export type PauseControlHost = Engine.Scene & Pick<GameScene,
  'actions' | 'cutsceneActive' | 'dialog' | 'dialogCam' | 'hand' | 'save' | 'scene' | 'view' | 'world3d'
>;

export class PauseControl {
  // Pause: the DOM menu (only while open) + the always-there touch button on mobile. While
  // the menu is up the scene is hard-paused (scene.pause() — update, tweens, timers, anims
  // all freeze on the current frame); the DOM keeps working because it lives off-canvas.
  public pauseMenu?: PauseMenu;
  public pauseTouchButton?: PauseTouchButton;
  /** O ajuste do zoom, aberto das opções por cima do jogo parado (ver ZoomSetup). */
  public zoomSetup?: ZoomSetup;

  public constructor(private readonly host: PauseControlHost) {}

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
      onZoom: () => this.openZoomSetup(),
    });
    this.host.actions.useBufferMs = 0;
    this.host.scene.pause();
  }

  /**
   * O AJUSTE DO ZOOM: o menu some, o quadro parado fica, e a régua mexe nele. A cena está pausada e não desenha
   * sozinha, então cada mudança desenha UM quadro à mão, com o tempo parado (delta 0) e a câmera pulando para o zoom
   * novo em vez de deslizar — o mundo não anda um passo. O OK devolve as opções, com o valor novo na linha.
   */
  private openZoomSetup(): void {
    if (!this.pauseMenu || this.zoomSetup) return;
    this.pauseMenu.suspend();
    this.zoomSetup = new ZoomSetup({
      redraw: () => {
        this.host.world3d?.cam.snapZoom();
        this.host.view.render3D(0, 0);
      },
      onDone: () => this.closeZoomSetup(),
    });
  }

  private closeZoomSetup(): void {
    this.zoomSetup?.destroy();
    this.zoomSetup = undefined;
    this.pauseMenu?.wake();
  }

  private closePauseMenu(): void {
    if (!this.pauseMenu) return;
    this.zoomSetup?.destroy();
    this.zoomSetup = undefined;
    this.pauseMenu.destroy();
    this.pauseMenu = undefined;
    this.pauseTouchButton?.setVisible(true);
    this.host.actions.actionButtons?.setVisible(true);
    this.host.scene.resume();
  }
}
