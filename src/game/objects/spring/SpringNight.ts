import { nightAmount } from '@/game/objects/DecorLife';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';

import { LANTERN, LANTERN_GLOW, LANTERN_H, LANTERN_W, OVER_WATER } from './springArt';

/**
 * A NOITE DA FONTE (objects/spring/HotSpring): o que faz a gruta ser um lugar só dela quando escurece.
 *
 *   · A LANTERNA DE PEDRA na beira da água: de dia é pedra com musgo; ao anoitecer a janelinha acende (o desenho
 *     emissivo por cima), um halo morno a envolve e uma poça de luz parada se derrama no deque e na água (a mesma das
 *     janelas das casas, WorldLights.addStillGlow: só desenho, nunca luz THREE — a conta de luzes do mundo é fixa). A
 *     chama respira.
 *   · OS VAGA-LUMES: pontinhos que vagueiam devagar pela gruta, piscando cada um no seu tempo. Só de noite.
 *
 * Quem acende e apaga é o relógio do jogo (DecorLife.nightAmount, a mesma passagem da lanterna do lar).
 */

const TINT = 0xb4b0aa;
const HALO_TINT = 0xffb24a;
/** O halo: na altura da janela, bem mais largo que a lanterna. */
const HALO = { elevation: 1.02, w: 2.2, h: 1.7, alpha: 0.55 };
/** A poça de luz: puxada para o lado da água (a lanterna fica a leste dela), sobre a água e o deque. */
const POOL = { toWater: -1.1, forward: 0.25, tiles: 4, alpha: 0.5 };
const FIREFLIES = 9;
const FIREFLY_TINT = 0xd8f27a;

interface Firefly { bb: Billboard3D; x: number; y: number; h: number; tx: number; ty: number; th: number; phase: number; rate: number }

export class SpringNight {
  private readonly lantern: Billboard3D;
  private readonly window: Billboard3D;
  private readonly halo: Billboard3D;
  private readonly pool: { setVisible(on: boolean): void; destroy(): void };
  private readonly flies: Firefly[] = [];
  private poolOn = false;
  private visible = true;
  private clock = 0;
  /** O quanto é noite agora (0..1; a janela do playtest lê). */
  public night = 0;
  /** A respiração da chama neste quadro (em volta de 1): a água doura no mesmo passo (render3d/springWater). */
  public flicker = 1;

  public constructor(
    private readonly at: { x: number; y: number },
    /** Onde os vaga-lumes andam (tiles). */
    private readonly area: { x0: number; y0: number; x1: number; y1: number },
  ) {
    const objects = world3d().objects;
    const size = { w: LANTERN_W / 16, h: LANTERN_H / 16 };
    this.lantern = objects.addBillboard(LANTERN, 0, { groundShadow: { rx: 0.36, rz: 0.15, alpha: 0.32 } })
      .setTint(TINT)
      .setDisplaySize(size.w, size.h)
      .setPosition(at.x, at.y);
    this.window = objects.addBillboard(LANTERN_GLOW, 0, { emissive: true, fog: false, renderOrder: OVER_WATER })
      .setDisplaySize(size.w, size.h)
      .setPosition(at.x, at.y + 0.01)
      .setVisible(false);
    this.halo = objects.addBillboard(FX_DOT_TEXTURE, 0, {
      centered: true, additive: true, emissive: true, fog: false, depthWrite: false, renderOrder: OVER_WATER,
    })
      .setTint(HALO_TINT)
      .setPosition(at.x, at.y + 0.02)
      .setElevation(HALO.elevation)
      .setDisplaySize(HALO.w, HALO.h)
      .setAlpha(0);
    this.pool = world3d().lights.addStillGlow(at.x + POOL.toWater, at.y + POOL.forward, POOL.tiles, POOL.alpha);
    for (let i = 0; i < FIREFLIES; i += 1) {
      const bb = objects.addBillboard(FX_DOT_TEXTURE, 0, {
        centered: true, additive: true, emissive: true, fog: false, depthWrite: false, alphaTest: 0.01, renderOrder: OVER_WATER,
      })
        .setTint(FIREFLY_TINT)
        .setDisplaySize(0.15, 0.15)
        .setAlpha(0);
      const fly: Firefly = { bb, x: 0, y: 0, h: 0, tx: 0, ty: 0, th: 0, phase: Math.random() * 10, rate: 1.4 + Math.random() * 1.6 };
      this.retarget(fly);
      fly.x = fly.tx;
      fly.y = fly.ty;
      fly.h = fly.th;
      this.retarget(fly);
      this.flies.push(fly);
    }
  }

  /** O tile da lanterna (sólido: WorldQuery pergunta pela colisão do world.json). */
  public get tile(): { x: number; y: number } {
    return this.at;
  }

  public update(dt: number, phase: number): void {
    if (!this.visible) return;
    this.clock += dt;
    const t = this.clock;
    this.night = nightAmount(phase);
    const lit = this.night > 0.02;
    this.window.setVisible(lit).setAlpha(Math.min(1, this.night * 1.2));
    const breathe = 0.86 + 0.09 * Math.sin(t * 6.1) + 0.05 * Math.sin(t * 15.3);
    this.flicker = breathe / 0.86;
    this.halo.setAlpha(HALO.alpha * this.night * breathe);
    const poolOn = this.night > 0.5;
    if (poolOn !== this.poolOn) {
      this.poolOn = poolOn;
      this.pool.setVisible(poolOn);
    }
    for (const f of this.flies) {
      const k = Math.min(1, dt * 0.45);
      f.x += (f.tx - f.x) * k;
      f.y += (f.ty - f.y) * k;
      f.h += (f.th - f.h) * k;
      if (Math.hypot(f.tx - f.x, f.ty - f.y) < 0.15) this.retarget(f);
      const blink = Math.max(0, Math.sin(t * f.rate + f.phase));
      f.bb.setPosition(f.x, f.y).setElevation(f.h).setAlpha(this.night * (0.15 + 0.85 * blink * blink));
    }
  }

  private retarget(f: Firefly): void {
    const { x0, y0, x1, y1 } = this.area;
    f.tx = x0 + Math.random() * (x1 - x0);
    f.ty = y0 + Math.random() * (y1 - y0);
    f.th = 0.3 + Math.random() * 1.1;
  }

  public setVisible(on: boolean): void {
    this.visible = on;
    this.lantern.setVisible(on);
    this.window.setVisible(on && this.night > 0.02);
    this.halo.setVisible(on);
    this.pool.setVisible(on && this.poolOn);
    for (const f of this.flies) f.bb.setVisible(on);
  }

  public destroy(): void {
    this.lantern.destroy();
    this.window.destroy();
    this.halo.destroy();
    this.pool.destroy();
    for (const f of this.flies) f.bb.destroy();
    this.flies.length = 0;
  }
}
