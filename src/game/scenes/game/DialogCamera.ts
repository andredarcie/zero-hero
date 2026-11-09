// A CÂMERA DO DIÁLOGO: o centro da tela que desliza para o balão caber, e volta; e o olhar da câmera para um ponto.

import { dialogBoxMetrics } from '@/game/constants';
import type { GameScene } from '../GameScene';
import * as Engine from '@/game/engine';

const CAMERA_LOOK_MS = 1100;
const CAMERA_LOOK_DRIFT_TILES = 1.2;
const CAMERA_LOOK_DRIFT_RATE = 0.00022;

/** O que DialogCamera usa de GameScene. */
export type DialogCameraHost = Pick<GameScene,
  'camera' | 'cameraLook' | 'cameraLookBlend' | 'dialog' | 'playerWorld' | 'scale' | 'tileSize' | 'time'
  | 'tweens' | 'view'
>;

export class DialogCamera {
  /** O último alvo: é dele que a câmera volta, depois que o `cameraLook` já acabou. */
  private cameraLookLast?: { x: number; y: number };

  // While a dialog is open the camera pans so the hero + NPC sit centered on the stage ABOVE
  // the speech box (a bar along the bottom). camShifting keeps the world frozen-but-reprojected
  // during the pan; dialogNpcWorld lets a resize re-apply the offset.
  public camShifting = false;
  public camShiftTween?: Engine.Tweens.Tween;

  public constructor(private readonly host: DialogCameraHost) {}

  public cameraLookOffset(delta: number, camX: number, camY: number): { x: number; y: number } {
    const goal = this.host.cameraLook ? 1 : 0;
    const step = delta / CAMERA_LOOK_MS;
    this.host.cameraLookBlend = goal > this.host.cameraLookBlend
      ? Math.min(1, this.host.cameraLookBlend + step)
      : Math.max(0, this.host.cameraLookBlend - step);
    if (this.host.cameraLookBlend === 0) return { x: 0, y: 0 };
    if (this.host.cameraLook) this.cameraLookLast = this.host.cameraLook;
    const at = this.cameraLookLast;
    if (!at) return { x: 0, y: 0 };
    const eased = this.host.cameraLookBlend * this.host.cameraLookBlend * (3 - 2 * this.host.cameraLookBlend);
    // Bem devagar, de um lado para o outro do bosque: é ele, vivo, e não uma foto.
    const drift = Math.sin(this.host.time.now * CAMERA_LOOK_DRIFT_RATE) * CAMERA_LOOK_DRIFT_TILES;
    return { x: (at.x + drift - camX) * eased, y: (at.y - camY) * eased };
  }

  // ── Dialog camera pan ──────────────────────────────────────────────────────
  // Base screen anchor during normal play: hero centered horizontally, mid play-area.
  public baseScreenCenter(): { x: number; y: number } {
    const { width, height } = this.host.scale;
    return {
      x: Math.floor(width / 2),
      y: Math.floor(height / 2),
    };
  }

  // Screen anchor while a dialog is open: put the hero↔NPC midpoint at the center of the PALCO
  // — a faixa que sobra ACIMA da caixa de fala, que é uma barra no rodapé. A altura dela sai de
  // `dialogBoxMetrics`, a mesma conta que o DialogOverlay desenha: fosse outra, a fala taparia
  // quem a diz. camX stays on the hero, so shifting only screenCenterX/Y keeps the hero's
  // sprite pinned correctly to the ground it stands on.
  public dialogScreenCenter(npcWorld?: { worldX: number; worldY: number }): { x: number; y: number } {
    const base = this.baseScreenCenter();
    const { boxHeight, margin } = dialogBoxMetrics(this.host.scale.width, this.host.scale.height);
    const stageCenterY = Math.floor((this.host.scale.height - boxHeight - margin) / 2);
    if (!npcWorld) return { x: base.x, y: stageCenterY };
    const dx = npcWorld.worldX - this.host.playerWorld.worldX;
    const dy = npcWorld.worldY - this.host.playerWorld.worldY;
    return {
      x: Math.round(base.x - (dx * this.host.tileSize) / 2),
      y: Math.round(stageCenterY - (dy * this.host.tileSize) / 2),
    };
  }

  public startDialogCameraShift(npcWorld?: { worldX: number; worldY: number }): void {
    const target = this.dialogScreenCenter(npcWorld);
    this.animateScreenCenter(target.x, target.y);
  }

  public endDialogCameraShift(): void {
    this.host.dialog.dialogNpcWorld = undefined;
    const base = this.baseScreenCenter();
    this.animateScreenCenter(base.x, base.y);
  }

  public animateScreenCenter(tx: number, ty: number, duration = 300): void {
    if (!this.host.camera) return;
    this.camShiftTween?.stop();
    this.camShifting = true;
    const state = { x: this.host.camera.screenCenterX, y: this.host.camera.screenCenterY };
    this.camShiftTween = this.host.tweens.add({
      targets: state,
      x: tx,
      y: ty,
      duration,
      ease: 'Cubic.easeInOut',
      onUpdate: () => {
        if (!this.host.camera) return;
        this.host.camera.screenCenterX = Math.round(state.x);
        this.host.camera.screenCenterY = Math.round(state.y);
        this.host.view.reprojectStatic();
      },
      onComplete: () => {
        this.camShiftTween = undefined;
        this.camShifting = false;
        if (!this.host.camera) return;
        this.host.camera.screenCenterX = Math.round(tx);
        this.host.camera.screenCenterY = Math.round(ty);
        this.host.view.reprojectStatic();
      },
    });
  }
}
