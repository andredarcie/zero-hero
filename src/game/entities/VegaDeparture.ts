import type Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import { squashBounce, VegaShip, type VegaShipHost } from '@/game/entities/VegaShip';
import type { Billboard3D } from '@/game/render3d/Billboard3D';

/**
 * A VEGA VAI EMBORA. Com o céu de volta, a nave acha o caminho até o planalto. Vega agradece, entra, e
 * ela dispara até virar um brilho na beira da tela.
 */

export interface VegaDepartureHost extends VegaShipHost {
  vega: Billboard3D;
  hero: { x: number; y: number };
  heroBody: { scaleX: number; scaleY: number };
  /** Vega fala, e `onClosed` roda com a cena de novo congelada. */
  say: (onClosed: () => void) => void;
  hearts: (x: number, y: number) => void;
  heroLooksUp: () => void;
}

const STEP_MS = 340;

export class VegaDeparture {
  private readonly ship: VegaShip;

  public constructor(private readonly host: VegaDepartureHost) {
    this.ship = new VegaShip(host);
  }

  public async run(): Promise<void> {
    const { vega, at, hero, heroBody, scene } = this.host;
    const sound = getSoundManager();
    // Vega levanta, e chama: o sinal do rádio e dois pulinhos.
    await this.to({ targets: vega, displayWidth: 1, displayHeight: 1, duration: 260, ease: 'Back.easeOut' });
    sound.playShipCall();
    await this.hop(vega, 0.32);
    await this.hop(vega, 0.32);
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
    await this.hop(vega, 0.5);
    await this.pause(500);
    await this.walk(at.x, at.y + 0.12);
    await this.enter();
    await this.pause(300);
    this.ship.closeDoor();
    await this.pause(450);
    this.host.heroLooksUp();
    await this.ship.liftOff();
    this.ship.twinkle();
    sound.playCozyChime();
    await this.pause(1100);
    this.ship.destroy();
  }

  private to(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
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
    const { vega } = this.host;
    const fromX = vega.x;
    const fromY = vega.y;
    const steps = Math.hypot(toX - fromX, toY - fromY);
    const pass = { t: 0 };
    return this.to({
      targets: pass,
      t: 1,
      duration: Math.max(1, steps) * STEP_MS,
      ease: 'Linear',
      onUpdate: () => {
        vega.setPosition(fromX + (toX - fromX) * pass.t, fromY + (toY - fromY) * pass.t);
        vega.setElevation(Math.abs(Math.sin(pass.t * steps * Math.PI)) * 0.08);
      },
    }).then(() => { vega.setElevation(0); });
  }

  private enter(): Promise<void> {
    const { vega } = this.host;
    getSoundManager().playItemStash();
    return this.to({ targets: vega, displayWidth: 0.45, displayHeight: 0.45, elevation: 0.3, duration: 340, ease: 'Back.easeIn' })
      .then(() => { vega.setVisible(false); });
  }
}
