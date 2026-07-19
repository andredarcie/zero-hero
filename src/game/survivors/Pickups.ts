import Phaser from 'phaser';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import { CHEST_TEXTURE, MAGNET_TEXTURE } from './survivorsTextures';

// ── Pickups de chão ────────────────────────────────────────────────────────────
//
// Os "algo bom a poucos passos" do VS: coração (cura), ímã (vácuo total), moeda
// (ouro da metaprogressão) e o BAÚ dos elites (o jackpot). Billboards emissivos
// com bob, coletados por proximidade — o baú tem raio maior porque o jogador
// PRECISA conseguir pegá-lo no meio da horda.

export type PickupKind = 'heart' | 'magnet' | 'coin' | 'chest';

const PICKUP_VISUAL: Record<PickupKind, { tex: string; size: number; radius: number }> = {
  heart: { tex: 'heart', size: 0.4, radius: 0.55 },
  magnet: { tex: MAGNET_TEXTURE, size: 0.45, radius: 0.55 },
  coin: { tex: 'coin', size: 0.34, radius: 0.55 },
  chest: { tex: CHEST_TEXTURE, size: 0.62, radius: 0.8 },
};

const MAX_PICKUPS = 48;

class Pickup {
  public active = false;
  public kind: PickupKind = 'coin';
  public x = 0;
  public y = 0;
  public bobPhase = 0;
  public sprite?: Billboard3D;
  public glow?: Billboard3D;
}

export class PickupField {
  private readonly pool: Pickup[] = [];

  public constructor(private readonly onPickup: (kind: PickupKind) => void) {}

  public spawn(kind: PickupKind, x: number, y: number): void {
    let p: Pickup | null = null;
    for (const c of this.pool) {
      if (!c.active) { p = c; break; }
    }
    if (!p) {
      if (this.pool.length >= MAX_PICKUPS) return;
      p = new Pickup();
      this.pool.push(p);
    }

    const visual = PICKUP_VISUAL[kind];
    p.active = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.bobPhase = Math.random() * Math.PI * 2;

    // O pool troca a textura do slot; o glow aditivo embaixo só existe no baú.
    // Camada GROUND: coletar é passar POR CIMA — o herói divide o tile com a gema o tempo todo,
    // e dois quads coplanares piscariam um através do outro (ver DEPTH_LAYER em Billboard3D).
    if (!p.sprite) {
      p.sprite = world3d().addBillboard(visual.tex, 0, {
        emissive: true, depthLayer: 'ground',
      });
    } else {
      p.sprite.setTexture(visual.tex, 0);
    }
    p.sprite
      .setPosition(p.x, p.y)
      .setDisplaySize(visual.size, visual.size)
      .setAlpha(1)
      .setVisible(true);
    p.glow?.destroy();
    p.glow = undefined;
    if (kind === 'chest') {
      p.glow = world3d().addBillboard('fx-ring', 0, { flat: true, additive: true, emissiveBoost: 1.8 });
      p.glow.setTint(0xf5c542).setPosition(p.x, p.y).setDisplaySize(1.1, 1.1).setAlpha(0.9);
    }
  }

  public update(deltaMs: number, px: number, py: number): void {
    const dt = deltaMs / 1000;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.bobPhase += dt * 3.2;
      const visual = PICKUP_VISUAL[p.kind];
      p.sprite
        ?.setPosition(p.x, p.y)
        .setElevation(0.1 + Math.sin(p.bobPhase) * 0.06);
      if (p.glow) {
        const pulse = 1.0 + Math.sin(p.bobPhase * 1.4) * 0.18;
        p.glow.setDisplaySize(pulse, pulse);
      }

      const dx = px - p.x;
      const dy = py - p.y;
      if (dx * dx + dy * dy <= visual.radius * visual.radius) {
        this.despawn(p);
        this.onPickup(p.kind);
      }
    }
  }

  public hasActiveChest(): boolean {
    return this.pool.some((p) => p.active && p.kind === 'chest');
  }

  public destroy(): void {
    for (const p of this.pool) {
      p.sprite?.destroy();
      p.glow?.destroy();
      p.sprite = undefined;
      p.glow = undefined;
      p.active = false;
    }
    this.pool.length = 0;
  }

  private despawn(p: Pickup): void {
    p.active = false;
    p.sprite?.setVisible(false);
    p.glow?.destroy();
    p.glow = undefined;
  }
}

/** Rola os drops raros de um kill comum (coração/ímã/moeda). */
export const rollDrop = (
  heartChance: number,
  coinChance: number,
  magnetChance: number,
): PickupKind | null => {
  const r = Math.random();
  if (r < magnetChance) return 'magnet';
  if (r < magnetChance + heartChance) return 'heart';
  if (r < magnetChance + heartChance + coinChance) return 'coin';
  return null;
};

/** Posição de drop com um pequeno espalhamento, para pickups não empilharem. */
export const scatter = (x: number, y: number): { x: number; y: number } => ({
  x: x + Phaser.Math.FloatBetween(-0.3, 0.3),
  y: y + Phaser.Math.FloatBetween(-0.3, 0.3),
});
