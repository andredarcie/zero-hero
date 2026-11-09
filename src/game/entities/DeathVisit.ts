import type * as Engine from '@/game/engine';

import { getSoundManager } from '@/game/audio/SoundManager';
import { ASSET_KEYS } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { WHITE_SAFE_TINT } from '@/game/render3d/pixelForms';
import { world3d } from '@/game/render3d/World3D';

/**
 * A MORTE VEM VER QUEM DORMIU. Na primeira noite dormida no colchão, ela surge do outro lado da fogueira,
 * fala do guerreiro que ele foi e some antes de clarear. O herói não levanta: é ela quem vem.
 */

export interface DeathVisitHost {
  scene: Engine.Scene;
  at: { x: number; y: number };
  smoke: (x: number, y: number) => void;
  /** Ela fala, e `onClosed` roda com a cena de novo congelada. */
  say: (body: Billboard3D, onClosed: () => void) => void;
}

const SIZE = 1.6;
const FLOAT = 0.22;
const ARRIVE_MS = 1500;
const LEAVE_MS = 1200;

export class DeathVisit {
  private readonly body: Billboard3D;

  public constructor(private readonly host: DeathVisitHost) {
    this.body = world3d()
      .addBillboard(ASSET_KEYS.npcDeath, 0, { alphaTest: 0.01 })
      .setDisplaySize(SIZE, SIZE)
      .setTint(WHITE_SAFE_TINT)
      .setPosition(host.at.x, host.at.y)
      .setElevation(FLOAT)
      .setAlpha(0);
  }

  public async run(): Promise<void> {
    const { at, smoke, say } = this.host;
    const sound = getSoundManager();
    sound.playDeathArrive();
    smoke(at.x, at.y);
    await this.to({ targets: this.body, alpha: 1, elevation: 0, duration: ARRIVE_MS, ease: 'Sine.easeOut' });
    await this.pause(600);
    await new Promise<void>((resolve) => say(this.body, resolve));
    await this.pause(500);
    sound.playDeathLeave();
    smoke(at.x, at.y);
    await this.to({ targets: this.body, alpha: 0, elevation: FLOAT, duration: LEAVE_MS, ease: 'Sine.easeIn' });
    this.body.destroy();
  }

  private to(config: Engine.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => {
      this.host.scene.tweens.add({ ...config, onComplete: () => resolve() });
    });
  }

  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => { this.host.scene.time.delayedCall(ms, resolve); });
  }
}
