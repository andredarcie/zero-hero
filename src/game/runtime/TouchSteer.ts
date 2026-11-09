// A ALAVANCA DE TOQUE: o dedo que pousa vira o centro, o arrasto vira direção, e a alavanca desenhada acompanha. O
// passo em si é do PlayerMovementController; aqui só se lê o dedo.

import * as Engine from '@/game/engine';
import { TouchStick } from './ActionButtons';
import type { PlayerMovementController } from './PlayerMovementController';

/** Drag needed before the gesture commits to a direction. */
const SWIPE_THRESHOLD_PX = 11;
/** The drag anchor trails the finger on a leash this long, so turning around stays cheap. */
const SWIPE_ANCHOR_LEASH_PX = 18;

/** O que TouchSteer usa de PlayerMovementController. */
export type TouchSteerHost = Pick<PlayerMovementController,
  'heldStill' | 'rootedMs' | 'stick' | 'touchDir'
>;

export class TouchSteer {
  private touchAnchor: { pointerId: number; x: number; y: number } | null = null;
  private stickShown = false;
  private lastFinger = { x: 0, y: 0 };

  public constructor(private readonly host: TouchSteerHost) {}

  /**
   * Os pés estão presos agora? (o escudo do herói lê isto: quem ataca abaixa a guarda)
   *
   * A bolsa aberta conta, e conta de propósito: quem está com as duas mãos dentro da mochila não
   * está aparando tiro nenhum. É a mesma frase do golpe, e é o que faz folhear custar alguma coisa
   * num jogo que não pausa para você folhear.
   */
  public get isRooted(): boolean {
    return this.host.rootedMs > 0 || this.host.heldStill;
  }

  /** O anel acompanha o dedo; aparece só enquanto há dedo E os pés estão livres. */
  public syncStick(): void {
    const anchor = this.touchAnchor;
    const want = anchor !== null && !this.isRooted && this.host.stick !== undefined;
    if (want && anchor && this.host.stick) {
      if (!this.stickShown) this.host.stick.show(anchor.x, anchor.y);
      this.host.stick.update(anchor.x, anchor.y, this.lastFinger.x, this.lastFinger.y);
    } else if (this.stickShown) {
      this.host.stick?.hide();
    }
    this.stickShown = want;
  }

  public handleTouchStart(e: TouchEvent): void {
    if (this.touchAnchor !== null) return;
    // O arrasto escuta a JANELA inteira (andar tem de funcionar em qualquer ponto do vidro),
    // entao ele tem de recusar explicitamente o que e UI: sem isto, tocar no botao A tambem
    // plantaria a ancora do arrasto e o heroi sairia andando junto com o golpe.
    if ((e.target as HTMLElement | null)?.closest?.('[data-zh-ui]')) return;
    const t = e.changedTouches[0];
    this.touchAnchor = { pointerId: t.identifier, x: t.clientX, y: t.clientY };
    this.lastFinger = { x: t.clientX, y: t.clientY };
    this.host.stick ??= new TouchStick(SWIPE_ANCHOR_LEASH_PX);
    this.syncStick();
  }

  public handleTouchMove(e: TouchEvent): void {
    const anchor = this.touchAnchor;
    if (!anchor) return;
    const t = Array.from(e.changedTouches).find((c) => c.identifier === anchor.pointerId);
    if (!t) return;
    this.trackDrag(anchor, t.clientX, t.clientY);
    this.lastFinger = { x: t.clientX, y: t.clientY };
    this.syncStick();
  }

  public handleTouchEnd(e: TouchEvent): void {
    const anchor = this.touchAnchor;
    if (!anchor) return;
    if (!Array.from(e.changedTouches).some((c) => c.identifier === anchor.pointerId)) return;
    this.host.touchDir = null;
    this.touchAnchor = null;
    this.syncStick();
  }

  public handlePointerDown(pointer: Engine.Input.Pointer): void {
    if (pointer.wasTouch) return;
    this.touchAnchor = { pointerId: pointer.id, x: pointer.x, y: pointer.y };
  }

  public handlePointerMove(pointer: Engine.Input.Pointer): void {
    if (pointer.wasTouch) return;
    const anchor = this.touchAnchor;
    if (!pointer.isDown || !anchor || anchor.pointerId !== pointer.id) return;
    this.trackDrag(anchor, pointer.x, pointer.y);
  }

  public handlePointerUpOrCancel(pointer: Engine.Input.Pointer): void {
    if (pointer.wasTouch) return;
    if (!this.touchAnchor || this.touchAnchor.pointerId !== pointer.id) return;
    this.host.touchDir = null;
    this.touchAnchor = null;
  }

  /**
   * Turn the drag into a held direction — and let the ANCHOR chase the finger on a short leash.
   *
   * The anchor used to be re-planted under the finger on every change of direction, so reversing
   * meant dragging the whole threshold again from a standing start, and the hero kept walking the
   * old way until you had. Leashed, the finger is never more than SWIPE_ANCHOR_LEASH_PX from the
   * anchor, so the vector always describes where the thumb is heading *now*.
   *
   * There is no "let go by returning to centre": you walk while the finger is out, and you stop by
   * lifting it. That is the gesture as it stands — a drag, nothing to learn.
   */
  private trackDrag(anchor: { x: number; y: number }, px: number, py: number): void {
    let dx = px - anchor.x;
    let dy = py - anchor.y;
    const len = Math.hypot(dx, dy);

    if (len > SWIPE_ANCHOR_LEASH_PX) {
      const pull = (len - SWIPE_ANCHOR_LEASH_PX) / len;
      anchor.x += dx * pull;
      anchor.y += dy * pull;
      dx = px - anchor.x;
      dy = py - anchor.y;
    }

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    // Inside the dead zone the last direction stands: a thumb wobbling on the glass must not
    // stutter the hero between two tiles.
    if (absX < SWIPE_THRESHOLD_PX && absY < SWIPE_THRESHOLD_PX) return;

    this.host.touchDir = absX >= absY
      ? { dx: dx >= 0 ? 1 : -1, dy: 0 }
      : { dx: 0, dy: dy >= 0 ? 1 : -1 };
  }
}
