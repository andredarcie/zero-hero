import type * as Engine from '@/game/engine';

import { getSoundManager } from '@/game/audio/SoundManager';
import { squashBounce, TheaShip, type TheaShipHost } from '@/game/entities/TheaShip';
import type { Billboard3D } from '@/game/render3d/Billboard3D';

/**
 * A THEA VAI EMBORA. Com o céu de volta, a nave acha o caminho até o planalto. Thea agradece, entra, e
 * ela dispara até virar um brilho na beira da tela.
 */

export interface TheaDepartureHost extends TheaShipHost {
  thea: Billboard3D;
  hero: { x: number; y: number };
  heroBody: { scaleX: number; scaleY: number };
  /** Thea fala, e `onClosed` roda com a cena de novo congelada. */
  say: (onClosed: () => void) => void;
  hearts: (x: number, y: number) => void;
  heroLooksUp: () => void;
}

const STEP_MS = 340;

export class TheaDeparture {
  private readonly ship: TheaShip;

  public constructor(private readonly host: TheaDepartureHost) {
    this.ship = new TheaShip(host);
  }

  public async run(): Promise<void> {
    const { thea, at, hero, heroBody, scene } = this.host;
    const sound = getSoundManager();
    // Thea levanta, e chama: o sinal do rádio e dois pulinhos.
    await this.to({ targets: thea, displayWidth: 1, displayHeight: 1, duration: 260, ease: 'Back.easeOut' });
    sound.story.playShipCall();
    await this.hop(thea, 0.32);
    await this.hop(thea, 0.32);
    await this.pause(350);
    await this.ship.land();
    squashBounce(scene, heroBody, heroBody.scaleX, heroBody.scaleY, 0.12);
    await this.pause(500);
    this.ship.openDoor();
    await this.pause(420);
    // Ao lado da porta, de frente para o herói.
    await this.walk(at.x + 0.9, at.y + 0.9);
    await this.pause(250);
    await new Promise<void>((resolve) => this.host.say(resolve));
    this.host.hearts(hero.x, hero.y);
    squashBounce(scene, heroBody, heroBody.scaleX, heroBody.scaleY);
    await this.hop(thea, 0.5);
    await this.pause(500);
    await this.walk(at.x, at.y + 0.12);
    await this.enter();
    await this.pause(300);
    this.ship.closeDoor();
    await this.pause(450);
    this.host.heroLooksUp();
    await this.ship.liftOff();
    this.ship.twinkle();
    sound.ui.playCozyChime();
    await this.pause(1100);
    this.ship.destroy();
  }

  private to(config: Engine.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => {
      this.host.scene.tweens.add({ ...config, onComplete: () => resolve() });
    });
  }

  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => { this.host.scene.time.delayedCall(ms, resolve); });
  }

  private hop(body: Billboard3D, height: number): Promise<void> {
    return this.to({ targets: body, elevation: height, duration: 150, ease: 'Sine.easeOut', yoyo: true });
  }

  private walk(toX: number, toY: number): Promise<void> {
    const { thea } = this.host;
    const fromX = thea.x;
    const fromY = thea.y;
    const steps = Math.hypot(toX - fromX, toY - fromY);
    const pass = { t: 0 };
    return this.to({
      targets: pass,
      t: 1,
      duration: Math.max(1, steps) * STEP_MS,
      ease: 'Linear',
      onUpdate: () => {
        thea.setPosition(fromX + (toX - fromX) * pass.t, fromY + (toY - fromY) * pass.t);
        thea.setElevation(Math.abs(Math.sin(pass.t * steps * Math.PI)) * 0.08);
      },
    }).then(() => { thea.setElevation(0); });
  }

  private enter(): Promise<void> {
    const { thea } = this.host;
    getSoundManager().ui.playItemStash();
    return this.to({ targets: thea, displayWidth: 0.45, displayHeight: 0.45, elevation: 0.3, duration: 340, ease: 'Back.easeIn' })
      .then(() => { thea.setVisible(false); });
  }
}
