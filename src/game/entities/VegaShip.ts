import type Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { WHITE_SAFE_TINT } from '@/game/render3d/pixelForms';
import {
  SHIP_FLAME_TEXTURE, SHIP_OPEN_TEXTURE, SHIP_TEXTURE, STEAM_TEXTURE,
} from '@/game/render3d/skyTextures';
import { world3d } from '@/game/render3d/World3D';

/**
 * A NAVE DA VEGA: desce do fundo do quadro freando no fogo, pousa com o baque e a poeira, abre e fecha a
 * porta, carrega e dispara. É cena, sem colisão: nada dela fica no mundo. Quem a usa decide o que
 * acontece entre uma coisa e outra (ver VegaDeparture e HearthReunion).
 */

export interface VegaShipHost {
  scene: Phaser.Scene;
  at: { x: number; y: number };
  smoke: (x: number, y: number) => void;
  dirt: (x: number, y: number, count: number) => void;
  shake: (ms: number, amplitude: number) => void;
  sparkle: (x: number, y: number) => void;
  project: (x: number, y: number, elevation: number) => { x: number; y: number };
}

const SHIP_SIZE = 2; // 32 pixels em 2 tiles: a densidade do chão
/** De onde ela vem e para onde ela vai: longe, ao norte, e no alto. */
const SKY_NORTH = 26;
const SKY_HIGH = 9;
const LAND_MS = 2300;
const CHARGE_MS = 1200;
const LAUNCH_MS = 1650;
const FLAME_W = 0.72;
const FLAME_H = 1.25;
const FLAME_GROUND_ELEVATION = 0.25;
/** O ritmo do fogo tremendo. */
const FLICKER_MS = 45;
const DUST_RING = 8;

/** O corpo baixa e volta passando do ponto. */
export const squashBounce = (scene: Phaser.Scene, body: { scaleX: number; scaleY: number }, restX: number, restY: number, depth = 0.14): void => {
  scene.tweens.killTweensOf(body);
  scene.tweens.add({
    targets: body,
    scaleX: restX * (1 + depth),
    scaleY: restY * (1 - depth),
    duration: 110,
    ease: 'Sine.easeOut',
    onComplete: () => {
      scene.tweens.add({ targets: body, scaleX: restX, scaleY: restY, duration: 420, ease: 'Back.easeOut' });
    },
  });
};

export class VegaShip {
  private readonly ship: Billboard3D;
  private readonly flame: Billboard3D;
  /** De 0 (apagado) a 1 (cheio). */
  private flamePower = 0;
  private readonly flicker: Phaser.Time.TimerEvent;
  private jitter = 0;

  public constructor(private readonly host: VegaShipHost) {
    const { at } = host;
    this.ship = world3d()
      .addBillboard(SHIP_TEXTURE, 0, { groundShadow: { rx: 0.95, rz: 0.42, alpha: 0.32 } })
      .setDisplaySize(SHIP_SIZE, SHIP_SIZE)
      .setTint(WHITE_SAFE_TINT)
      .setPosition(at.x, at.y - SKY_NORTH)
      .setElevation(SKY_HIGH);
    this.flame = world3d()
      .addBillboard(SHIP_FLAME_TEXTURE, 0, { fog: false, emissive: true, additive: true })
      .setVisible(false);
    this.flicker = host.scene.time.addEvent({ delay: FLICKER_MS, loop: true, callback: () => this.tickFlame() });
  }

  public destroy(): void {
    this.host.scene.tweens.killTweensOf(this.ship);
    this.flicker.remove();
    this.flame.destroy();
    this.ship.destroy();
  }

  private to(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => {
      this.host.scene.tweens.add({ ...config, onComplete: () => resolve() });
    });
  }

  public openDoor(): void {
    const { at } = this.host;
    this.ship.setTexture(SHIP_OPEN_TEXTURE, 0);
    getSoundManager().playShipDoor();
    squashBounce(this.host.scene, this.ship, SHIP_SIZE, SHIP_SIZE, 0.04);
    this.host.smoke(at.x - 0.5, at.y + 0.1);
    this.host.smoke(at.x + 0.5, at.y + 0.1);
  }

  public closeDoor(): void {
    this.ship.setTexture(SHIP_TEXTURE, 0);
    getSoundManager().playShipDoor();
    squashBounce(this.host.scene, this.ship, SHIP_SIZE, SHIP_SIZE, 0.05);
  }

  /** O fogo segue a nave, tremendo. */
  private tickFlame(): void {
    const on = this.flamePower > 0.01;
    this.flame.setVisible(on);
    if (!on) return;
    // No chão o jato não tem para onde ir: ele abre para os lados, na frente da nave.
    const grounded = this.ship.elevation < FLAME_GROUND_ELEVATION;
    const w = FLAME_W * this.flamePower * (0.85 + Math.random() * 0.3) * (grounded ? 2.4 : 1);
    const h = FLAME_H * this.flamePower * (0.8 + Math.random() * 0.45) * (grounded ? 0.42 : 1);
    this.flame
      .setDisplaySize(w, h)
      .setPosition(this.ship.x + (Math.random() - 0.5) * 0.04 + this.jitter, this.ship.y + (grounded ? 0.3 : 0.02))
      .setElevation(Math.max(0, this.ship.elevation + 0.14 - h * 0.8));
  }

  private dustRing(radius: number): void {
    const { at, smoke, dirt } = this.host;
    for (let i = 0; i < DUST_RING; i += 1) {
      const a = (i / DUST_RING) * Math.PI * 2;
      smoke(at.x + Math.cos(a) * radius, at.y + Math.sin(a) * radius * 0.5);
    }
    // Para os lados: no meio, a terra cairia em cima da porta.
    dirt(at.x - radius * 1.1, at.y + 0.2, 7);
    dirt(at.x + radius * 1.1, at.y + 0.2, 7);
  }

  /** Vem do fundo do quadro, freando no fogo, até o baque. */
  public async land(): Promise<void> {
    const { at } = this.host;
    getSoundManager().playShipDescend();
    this.flamePower = 1;
    const fromY = at.y - SKY_NORTH;
    const pass = { t: 0 };
    let dustClock = 0;
    await this.to({
      targets: pass,
      t: 1,
      duration: LAND_MS,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        this.ship.setPosition(at.x, fromY + (at.y - fromY) * pass.t);
        this.ship.setElevation(SKY_HIGH * (1 - pass.t));
        // O fogo cede conforme ela freia, e a poeira começa quando ele alcança o chão.
        this.flamePower = 0.45 + (1 - pass.t) * 0.55;
        if (pass.t > 0.86 && this.host.scene.time.now > dustClock) {
          dustClock = this.host.scene.time.now + 160;
          this.host.smoke(at.x + (Math.random() - 0.5) * 1.6, at.y + (Math.random() - 0.5) * 0.5);
        }
      },
    });
    this.flamePower = 0;
    getSoundManager().playShipLand();
    this.host.shake(280, 0.075);
    squashBounce(this.host.scene, this.ship, SHIP_SIZE, SHIP_SIZE, 0.2);
    this.dustRing(1);
    this.host.sparkle(at.x, at.y);
  }

  /** Carrega tremendo, encolhe, e dispara para o fundo, esticada pela velocidade. */
  public async liftOff(): Promise<void> {
    const { at } = this.host;
    const { tweens } = this.host.scene;
    getSoundManager().playShipLift();
    this.host.shake(CHARGE_MS, 0.018);
    const power = { p: 0.15 };
    let dustClock = 0;
    await this.to({
      targets: power,
      p: 1,
      duration: CHARGE_MS,
      ease: 'Sine.easeIn',
      onUpdate: () => {
        this.flamePower = power.p;
        this.jitter = (Math.random() - 0.5) * 0.05 * power.p;
        this.ship.setPosition(at.x + this.jitter, at.y);
        if (this.host.scene.time.now > dustClock) {
          dustClock = this.host.scene.time.now + 130;
          this.host.smoke(at.x + (Math.random() - 0.5) * 1.8, at.y + (Math.random() - 0.5) * 0.5);
        }
      },
    });
    tweens.killTweensOf(this.ship);
    await this.to({ targets: this.ship, displayWidth: SHIP_SIZE * 1.12, displayHeight: SHIP_SIZE * 0.84, duration: 170, ease: 'Sine.easeOut' });
    this.jitter = 0;
    this.host.shake(340, 0.1);
    this.dustRing(1.2);
    tweens.add({ targets: this.ship, displayWidth: SHIP_SIZE * 0.82, displayHeight: SHIP_SIZE * 1.3, duration: 240, ease: 'Back.easeOut' });
    const pass = { t: 0 };
    let trailClock = 0;
    await this.to({
      targets: pass,
      t: 1,
      duration: LAUNCH_MS,
      ease: 'Expo.easeIn',
      onUpdate: () => {
        this.ship.setPosition(at.x, at.y - SKY_NORTH * pass.t);
        this.ship.setElevation(SKY_HIGH * pass.t);
        if (this.host.scene.time.now > trailClock) {
          trailClock = this.host.scene.time.now + 55;
          this.trail();
        }
      },
    });
    this.flamePower = 0;
  }

  /** O rastro: fiapos que ficam no ar e somem. */
  private trail(): void {
    const size = 0.16 + Math.random() * 0.14;
    const puff = world3d()
      .addBillboard(STEAM_TEXTURE, 0, { fog: false, emissive: true, alphaTest: 0.01 })
      .setDisplaySize(size, size)
      .setPosition(this.ship.x + (Math.random() - 0.5) * 0.3, this.ship.y)
      .setElevation(this.ship.elevation)
      .setAlpha(0.7);
    this.host.scene.tweens.add({
      targets: puff, alpha: 0, displayWidth: size * 2.2, displayHeight: size * 2.2, duration: 760, ease: 'Sine.easeOut', onComplete: () => puff.destroy(),
    });
  }

  /** O último brilho, na beira da tela onde ela sumiu: uma estrela de pixel, por cima de tudo. */
  public twinkle(): void {
    const { at, project } = this.host;
    const seen = project(at.x, at.y - SKY_NORTH * 0.35, SKY_HIGH * 0.35);
    const x = Math.max(24, Math.min(window.innerWidth - 24, seen.x));
    const y = Math.max(40, seen.y);
    const star = document.createElement('div');
    star.style.cssText = `position: fixed; left: ${x}px; top: ${y}px; width: 0; height: 0; z-index: 50; pointer-events: none;`;
    for (const [w, h] of [[36, 6], [6, 36], [16, 16]] as const) {
      const bar = document.createElement('div');
      bar.style.cssText = `position: absolute; left: ${-w / 2}px; top: ${-h / 2}px; width: ${w}px; height: ${h}px; background: #fff4c4;`;
      star.appendChild(bar);
    }
    document.body.appendChild(star);
    star.animate([
      { transform: 'scale(0)', opacity: 1 },
      { transform: 'scale(1.3)', opacity: 1, offset: 0.3 },
      { transform: 'scale(0.6)', opacity: 1, offset: 0.55 },
      { transform: 'scale(1)', opacity: 1, offset: 0.7 },
      { transform: 'scale(0)', opacity: 0 },
    ], { duration: 950, easing: 'ease-out' }).onfinish = () => star.remove();
  }
}
