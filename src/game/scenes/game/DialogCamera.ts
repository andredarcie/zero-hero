// A CÂMERA DO DIÁLOGO: o centro da tela que desliza para o balão caber, e volta; e o olhar da câmera para um ponto.

import { dialogBoxMetrics } from '@/game/constants';
import type { GameScene } from '../GameScene';
import * as Engine from '@/game/engine';

const CAMERA_LOOK_MS = 1100;
const CAMERA_LOOK_DRIFT_TILES = 1.2;
const CAMERA_LOOK_DRIFT_RATE = 0.00022;
/** O olhar da conversa para um ponto do mundo (o porcini da Shui, o cepo do Marco): ida e volta, e quanto segura nele. */
const GLANCE_PAN_MS = 700;
const GLANCE_HOLD_MS = 1500;

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
  /**
   * UM ENQUADRAMENTO DE CENA que a conversa respeita (a noite na fogueira): enquanto ele existe, abrir e fechar a fala
   * não mexe na câmera, e o centro da tela é o que ele diz (lido de novo a cada vez, então vale também num resize).
   */
  public stageFrame?: () => { x: number; y: number };

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
    if (this.stageFrame) return this.stageFrame();
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
    const base = this.stageFrame?.() ?? this.baseScreenCenter();
    this.animateScreenCenter(base.x, base.y);
  }

  /**
   * O OLHAR DA CONVERSA: a câmera vai devagar até um ponto do mundo, `onArrive` faz ele brilhar, segura um pouco e volta
   * para o NPC — só se a mesma conversa continua aberta.
   */
  public glanceAt(spot: { x: number; y: number }, npcWorld: { worldX: number; worldY: number }, onArrive: () => void): void {
    if (!this.host.camera) return;
    const base = this.baseScreenCenter();
    const { boxHeight, margin } = dialogBoxMetrics(this.host.scale.width, this.host.scale.height);
    const stageCenterY = Math.floor((this.host.scale.height - boxHeight - margin) / 2);
    const dx = spot.x - this.host.playerWorld.worldX;
    const dy = spot.y - this.host.playerWorld.worldY;
    this.animateScreenCenter(Math.round(base.x - dx * this.host.tileSize), Math.round(stageCenterY - dy * this.host.tileSize), GLANCE_PAN_MS);
    this.host.time.delayedCall(GLANCE_PAN_MS, () => {
      if (this.host.dialog.dialogOpen) onArrive();
    });
    this.host.time.delayedCall(GLANCE_PAN_MS + GLANCE_HOLD_MS, () => {
      if (!this.host.dialog.dialogOpen || this.host.dialog.dialogNpcWorld !== npcWorld) return;
      const back = this.dialogScreenCenter(npcWorld);
      this.animateScreenCenter(back.x, back.y, GLANCE_PAN_MS);
    });
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
