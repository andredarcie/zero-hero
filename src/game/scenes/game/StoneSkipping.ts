// A PEDRA QUE QUICA NA ÁGUA (pedido do autor, 2026-11-11; a conta e a arte em objects/stoneSkip): o Z diante de água
// aberta pega um seixo da beira, o herói mira (o seixo balança na mão e brilha quando passa deitado), e o segundo Z
// joga. A pedra voa sobre a água de verdade, com um anel, umas gotas e uma nota mais aguda a cada quique, até afundar
// ou parar na outra margem. Bater o recorde dá corações. O X desiste.

import { getSoundManager } from '@/game/audio/SoundManager';
import { PROP_TINT } from '@/game/objects/nature/kit';
import {
  PEBBLE_FRAMES, PEBBLE_H, PEBBLE_W, SKIP_DROP, SKIP_RING, TILT_PERIOD_S, hopLengths, pebbleFrame, qualityOf, skipsFor, tiltAt,
} from '@/game/objects/stoneSkip';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { WATER_DEPTH_TILES } from '@/game/render3d/World3D';
import { adventureState } from '@/game/runtime/adventureState';
import type { GameScene } from '../GameScene';

/** O que StoneSkipping usa de GameScene. */
export type StoneSkippingHost = Pick<GameScene,
  'hero' | 'movementController' | 'playerWorld' | 'query' | 'save' | 'sparkle' | 'tweens' | 'verbs' | 'world3d'
>;

const SURFACE = -WATER_DEPTH_TILES + 0.03;
/** A altura da mão (tiles), de onde a pedra sai. */
const HAND_ELEV = 0.42;
/** Mirando sem jogar por tanto tempo, ele desiste sozinho. */
const AIM_TIMEOUT_S = 8;
/** A pedra que para na outra margem fica um pouco ali antes de sumir. */
const BANK_REST_S = 1.6;

interface Ring { bb: Billboard3D; t: number; size: number }
interface Drop { bb: Billboard3D; x: number; y: number; z: number; vx: number; vy: number; vz: number }
interface Aim { t: number; age: number; dx: number; dy: number; glint: boolean }
interface Flight {
  dx: number; dy: number; hops: number[]; i: number; t: number;
  fromX: number; fromY: number; fromZ: number; toZ: number; skips: number;
}

export class StoneSkipping {
  private pebble: Billboard3D | null = null;
  private aim: Aim | null = null;
  private flight: Flight | null = null;
  private bankRest = 0;
  private readonly rings: Ring[] = [];
  private readonly drops: Drop[] = [];
  /** Quantos quiques deu a última pedra (-1: nenhuma ainda; a janela dos playtests). */
  public lastSkips = -1;

  public constructor(private readonly host: StoneSkippingHost) {}

  /** O seixo está na mão, esperando o Z de jogar. */
  public get aiming(): boolean {
    return this.aim !== null;
  }

  /** Dá para quicar daqui: água aberta à frente, e nenhuma pedra na mão nem no ar. */
  public canSkipAt(x: number, y: number): boolean {
    return !this.aim && !this.flight && this.host.query.isOpenWaterAt(x, y);
  }

  /** O Z diante da água: pega um seixo da beira e começa a mirar. */
  public startAt(x: number, y: number): boolean {
    const w3 = this.host.world3d;
    if (!w3 || !this.canSkipAt(x, y)) return false;
    const f = this.host.movementController?.facing ?? { dx: 0, dy: 1 };
    this.host.movementController?.interruptMovement(this.host.playerWorld.worldX, this.host.playerWorld.worldY);
    this.host.movementController?.hold(true);
    // Começa de pé: o primeiro brilho vem logo, mas não colado no Z que pegou o seixo.
    this.aim = { t: TILT_PERIOD_S / 4, age: 0, dx: f.dx, dy: f.dy, glint: false };
    this.clearPebble();
    this.pebble = w3.objects.addBillboard(PEBBLE_FRAMES[2], 0, { centered: true, depthWrite: false })
      .setDisplaySize(PEBBLE_W, PEBBLE_H)
      .setTint(PROP_TINT);
    getSoundManager().ui.playPick('stone');
    this.tickAim(0);
    return true;
  }

  /** O segundo Z: joga, e a qualidade é o quanto a pedra estava deitada nesse instante. */
  public release(): void {
    const aim = this.aim;
    if (!aim) return;
    this.aim = null;
    this.host.movementController?.hold(false);
    const quality = qualityOf(tiltAt(aim.t));
    const hops = hopLengths(skipsFor(quality, Math.random()), quality);
    const start = this.handAt(aim);
    this.flight = { dx: aim.dx, dy: aim.dy, hops, i: 0, t: 0, fromX: start.x, fromY: start.y, fromZ: HAND_ELEV, toZ: SURFACE, skips: 0 };
    this.flight.toZ = this.landingZ(this.flight);
    // O braço vai junto: o corpo dá um tranco para a frente e volta.
    this.host.tweens.add({ targets: this.host.hero, lungeX: aim.dx * 0.12, lungeY: aim.dy * 0.12, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
    getSoundManager().ui.playBagToss();
  }

  /** O X (ou o tempo) desiste: o seixo volta para a beira. */
  public cancel(): void {
    if (!this.aim) return;
    this.aim = null;
    this.host.movementController?.hold(false);
    this.clearPebble();
  }

  public update(deltaMs: number): void {
    const dt = Math.min(0.1, Math.max(0, deltaMs / 1000));
    if (this.aim) this.tickAim(dt);
    if (this.flight) this.tickFlight(dt);
    else if (this.bankRest > 0) {
      this.bankRest -= dt;
      this.pebble?.setAlpha(Math.min(1, this.bankRest / 0.5));
      if (this.bankRest <= 0) this.clearPebble();
    }
    this.tickSplash(dt);
  }

  private handAt(aim: Aim): { x: number; y: number } {
    const hero = this.host.verbs.heroVisualTile();
    return { x: hero.x + aim.dx * 0.42, y: hero.y + aim.dy * 0.42 };
  }

  private tickAim(dt: number): void {
    const aim = this.aim;
    if (!aim) return;
    aim.t += dt;
    aim.age += dt;
    if (aim.age > AIM_TIMEOUT_S) { this.cancel(); return; }
    const tilt = tiltAt(aim.t);
    const at = this.handAt(aim);
    this.pebble?.setTexture(pebbleFrame(tilt))
      .setFlipX(aim.dx !== 0 ? aim.dx < 0 : tilt < 0)
      .setPosition(at.x, at.y)
      .setElevation(HAND_ELEV + Math.sin(aim.age * 9) * 0.01);
    // O BRILHO quando ela passa deitada: é a hora (a mesma gramática da faca que brilha rente ao chão).
    if (Math.abs(tilt) < 6 && !aim.glint) {
      aim.glint = true;
      this.host.sparkle.spawnGlint(at.x, at.y, HAND_ELEV + 0.06, 0.34);
    } else if (Math.abs(tilt) > 16) {
      aim.glint = false;
    }
  }

  /** Onde o voo atual pousa: na água (a superfície, mais baixa) ou na terra da outra margem. */
  private landingZ(f: Flight): number {
    const len = f.hops[f.i];
    return this.host.query.isOpenWaterAt(Math.round(f.fromX + f.dx * len), Math.round(f.fromY + f.dy * len)) ? SURFACE : 0;
  }

  private tickFlight(dt: number): void {
    const f = this.flight;
    if (!f) return;
    const len = f.hops[f.i];
    f.t = Math.min(1, f.t + dt / (0.16 + len * 0.11));
    const x = f.fromX + f.dx * len * f.t;
    const y = f.fromY + f.dy * len * f.t;
    const z = f.fromZ + (f.toZ - f.fromZ) * f.t + Math.sin(f.t * Math.PI) * (0.12 + len * 0.1);
    this.pebble?.setTexture(PEBBLE_FRAMES[Math.floor(f.t * 6) % 2]).setPosition(x, y).setElevation(z);
    if (f.t < 1) return;
    // A OUTRA MARGEM: a pedra para deitada na terra (a altura é sobre o chão do tile, então um platô também serve).
    if (f.toZ !== SURFACE) {
      this.pebble?.setTexture(PEBBLE_FRAMES[0]).setElevation(0.02);
      getSoundManager().ui.playPut('stone');
      this.end(f.skips, true);
      return;
    }
    const last = f.i >= f.hops.length - 1;
    this.splash(x, y, last ? 7 : 4, last ? 1.25 : 0.85);
    if (last) {
      getSoundManager().nature.playStonePlunk();
      this.clearPebble();
      this.end(f.skips, false);
      return;
    }
    f.skips += 1;
    getSoundManager().nature.playStoneSkip(f.skips);
    f.i += 1;
    f.t = 0;
    f.fromX = x;
    f.fromY = y;
    f.fromZ = SURFACE;
    f.toZ = this.landingZ(f);
  }

  /** A pedra parou. Recorde novo (de dois quiques para cima) ganha corações e o sino. */
  private end(skips: number, onBank: boolean): void {
    this.flight = null;
    this.lastSkips = skips;
    this.bankRest = onBank ? BANK_REST_S : 0;
    const save = adventureState();
    if (skips < 2 || skips <= save.skipBest) return;
    save.skipBest = skips;
    const hero = this.host.verbs.heroVisualTile();
    this.host.sparkle.spawnHearts(hero.x, hero.y);
    getSoundManager().ui.playCozyChime();
    this.host.save.persistAdventure();
  }

  private splash(x: number, y: number, n: number, size: number): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    this.rings.push({ bb: w3.objects.addBillboard(SKIP_RING, 0, { flat: true, flatY: SURFACE, depthWrite: false, alphaTest: 0.01 }).setPosition(x, y), t: 0, size });
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + Math.random();
      this.drops.push({
        bb: w3.objects.addBillboard(SKIP_DROP, 0, { centered: true, depthWrite: false, alphaTest: 0.01 }).setDisplaySize(1 / 16, 1 / 16),
        x, y, z: SURFACE + 0.02, vx: Math.cos(a) * 0.55, vy: Math.sin(a) * 0.32, vz: 1.1 + Math.random() * 0.6,
      });
    }
  }

  private tickSplash(dt: number): void {
    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const r = this.rings[i];
      r.t += dt / 1.1;
      const s = (0.22 + r.t * 0.8) * r.size;
      r.bb.setDisplaySize(s, s).setAlpha(0.75 * (1 - r.t));
      if (r.t >= 1) { r.bb.destroy(); this.rings.splice(i, 1); }
    }
    for (let i = this.drops.length - 1; i >= 0; i -= 1) {
      const d = this.drops[i];
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      d.vz -= 6 * dt;
      d.bb.setPosition(d.x, d.y).setElevation(d.z);
      if (d.z < SURFACE) { d.bb.destroy(); this.drops.splice(i, 1); }
    }
  }

  private clearPebble(): void {
    this.pebble?.destroy();
    this.pebble = null;
    this.bankRest = 0;
  }

  public destroy(): void {
    if (this.aim) this.host.movementController?.hold(false);
    this.aim = null;
    this.flight = null;
    this.clearPebble();
    for (const r of this.rings) r.bb.destroy();
    for (const d of this.drops) d.bb.destroy();
    this.rings.length = 0;
    this.drops.length = 0;
  }
}
