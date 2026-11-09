// AS TECLAS DE ANDAR: o aperto novo (que vale mesmo no meio de um passo), a seta segurada, e a direção guardada para
// o próximo tile. Quem anda é o PlayerMovementController.

import * as Engine from '@/game/engine';
import type { PlayerMovementController } from './PlayerMovementController';

/**
 * Slack on top of a step: a press made ANYWHERE inside a step must still be alive when that step
 * reaches its tile boundary and can spend it. Tie it to the step or the two drift apart — a fixed
 * 120ms buffer silently ate a tap made early in a 150ms step. Braid holds a button 230ms; this
 * lands in the same country.
 */
const INPUT_BUFFER_SLACK_MS = 30;
export interface Dir {
  dx: number;
  dy: number;
}

/** O que MoveKeys usa de PlayerMovementController. */
export type MoveKeysHost = Pick<PlayerMovementController,
  'bufferedDir' | 'cursors' | 'heldStill' | 'scene' | 'stepMs' | 'touchDir' | 'wasd'
>;

export class MoveKeys {
  private bufferedAtMs = 0;

  public constructor(private readonly host: MoveKeysHost) {}

  /** Keep the newest fresh key press alive for INPUT_BUFFER_MS so a tile boundary can spend it. */
  public pollFreshPress(): void {
    // `readJustPressed` roda MESMO com os pés presos: `JustDown` é leitura destrutiva, e uma seta
    // gasta na bolsa que ficasse com a flag armada sairia como um passo minutos depois. Drena-se
    // sempre; o que a trava faz é jogar fora em vez de guardar.
    const dir = this.readJustPressed();
    if (!dir || this.host.heldStill) return;
    this.host.bufferedDir = dir;
    this.bufferedAtMs = this.host.scene.time.now;
  }

  /**
   * The direction to spend on this tile boundary. A recent tap outranks a held key — that is what
   * makes a quick turn register instead of being eaten by the step already in flight.
   */
  public takeDirection(): (Dir & { fresh: boolean }) | null {
    const buffered = this.host.bufferedDir;
    this.host.bufferedDir = null;
    if (buffered && this.host.scene.time.now - this.bufferedAtMs <= this.host.stepMs + INPUT_BUFFER_SLACK_MS) {
      return { ...buffered, fresh: true };
    }

    const held = this.readHeld();
    return held ? { ...held, fresh: false } : null;
  }

  private readJustPressed(): Dir | null {
    const c = this.host.cursors;
    const w = this.host.wasd;
    const just = (a?: Engine.Input.Keyboard.Key, b?: Engine.Input.Keyboard.Key): boolean => {
      const ja = a ? Engine.Input.Keyboard.JustDown(a) : false;
      const jb = b ? Engine.Input.Keyboard.JustDown(b) : false;
      return ja || jb;
    };

    // Every key must be polled, not just the winner: JustDown clears the flag it reads, so an
    // early return would strand the others' flags set and fire them on some later frame.
    const left = just(c?.left, w.left);
    const right = just(c?.right, w.right);
    const up = just(c?.up, w.up);
    const down = just(c?.down, w.down);

    if (left) return { dx: -1, dy: 0 };
    if (right) return { dx: 1, dy: 0 };
    if (up) return { dx: 0, dy: -1 };
    if (down) return { dx: 0, dy: 1 };
    return null;
  }

  /** A held key, or the drag — which is a key like any other as far as the walk is concerned. */
  private readHeld(): Dir | null {
    const c = this.host.cursors;
    const w = this.host.wasd;
    const held = (a?: Engine.Input.Keyboard.Key, b?: Engine.Input.Keyboard.Key): boolean =>
      Boolean(a?.isDown) || Boolean(b?.isDown);

    if (held(c?.left, w.left)) return { dx: -1, dy: 0 };
    if (held(c?.right, w.right)) return { dx: 1, dy: 0 };
    if (held(c?.up, w.up)) return { dx: 0, dy: -1 };
    if (held(c?.down, w.down)) return { dx: 0, dy: 1 };
    return this.host.touchDir;
  }
}
