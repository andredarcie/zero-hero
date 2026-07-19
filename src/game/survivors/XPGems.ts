import Phaser from 'phaser';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import { XP_GEM_TEXTURE } from './survivorsTextures';

// ── Gemas de XP ────────────────────────────────────────────────────────────────
//
// O micro-prêmio contínuo do VS: todo inimigo solta uma gema; o ímã do herói as
// suga; cada coleta empurra a barra. Pool fixo de billboards emissivos, tiers
// por cor (um sprite branco tintado), e MERGE quando o pool estoura — matar 600
// inimigos não pode virar 600 meshes, então o excedente engorda a gema viva mais
// próxima (o VS faz o mesmo).

const MAX_GEMS = 320;
const COLLECT_RADIUS_TILES = 0.4;
const MAGNET_ACCEL = 46; // tiles/s² durante a sucção
const MAGNET_MAX_SPEED = 17;

// Cores por valor: as da tradição VS (azul 1, verde 5, vermelho 20, dourado 100+).
const tierTint = (value: number): number => {
  if (value >= 100) return 0xffd24a;
  if (value >= 20) return 0xff5a5a;
  if (value >= 5) return 0x7dff6a;
  return 0x59d7ff;
};

class Gem {
  public active = false;
  public x = 0;
  public y = 0;
  public value = 1;
  public magnetized = false;
  public speed = 0;
  public bobPhase = 0;
  public sprite?: Billboard3D;
}

export class XPGemField {
  private readonly pool: Gem[] = [];
  private alive = 0;

  public constructor(private readonly onCollect: (value: number) => void) {}

  public get activeCount(): number {
    return this.alive;
  }

  public spawn(x: number, y: number, value: number): void {
    let gem: Gem | null = null;
    for (const g of this.pool) {
      if (!g.active) { gem = g; break; }
    }
    if (!gem) {
      if (this.pool.length >= MAX_GEMS) {
        this.mergeInto(x, y, value);
        return;
      }
      gem = new Gem();
      this.pool.push(gem);
    }

    gem.active = true;
    gem.x = x + Phaser.Math.FloatBetween(-0.2, 0.2);
    gem.y = y + Phaser.Math.FloatBetween(-0.2, 0.2);
    gem.value = value;
    gem.magnetized = false;
    gem.speed = 0;
    gem.bobPhase = Math.random() * Math.PI * 2;
    if (!gem.sprite) {
      gem.sprite = world3d().addBillboard(XP_GEM_TEXTURE, 0, {
        emissive: true,
        emissiveBoost: 1.5,
      });
    }
    gem.sprite
      .setPosition(gem.x, gem.y)
      .setDisplaySize(0.3, 0.3)
      .setAlpha(1)
      .setVisible(true)
      .setTint(tierTint(value));
    this.alive += 1;
  }

  /** O pickup-ímã do chão: TODA gema viva voa para o herói de uma vez. */
  public vacuumAll(): void {
    for (const g of this.pool) {
      if (g.active) g.magnetized = true;
    }
  }

  public update(deltaMs: number, px: number, py: number, magnetRadiusTiles: number): void {
    const dt = deltaMs / 1000;
    for (const g of this.pool) {
      if (!g.active) continue;
      const dx = px - g.x;
      const dy = py - g.y;
      const dist = Math.hypot(dx, dy);

      if (!g.magnetized && dist <= magnetRadiusTiles) g.magnetized = true;

      if (g.magnetized) {
        // Acelera até o herói — a "sucção" que faz o vácuo do ímã ser um pico.
        g.speed = Math.min(MAGNET_MAX_SPEED, g.speed + MAGNET_ACCEL * dt);
        if (dist > 0.001) {
          g.x += (dx / dist) * g.speed * dt;
          g.y += (dy / dist) * g.speed * dt;
        }
        if (dist <= COLLECT_RADIUS_TILES) {
          this.despawn(g);
          this.onCollect(g.value);
          continue;
        }
      } else {
        g.bobPhase += dt * 3;
      }

      g.sprite
        ?.setPosition(g.x, g.y)
        .setElevation(0.12 + Math.sin(g.bobPhase) * 0.05);
    }
  }

  public destroy(): void {
    for (const g of this.pool) {
      g.sprite?.destroy();
      g.sprite = undefined;
      g.active = false;
    }
    this.pool.length = 0;
    this.alive = 0;
  }

  private despawn(g: Gem): void {
    g.active = false;
    g.sprite?.setVisible(false);
    this.alive -= 1;
  }

  // Pool cheio: soma o valor à gema viva mais próxima do ponto e recolore o tier.
  private mergeInto(x: number, y: number, value: number): void {
    let best: Gem | null = null;
    let bestD = Infinity;
    for (const g of this.pool) {
      if (!g.active) continue;
      const d = (g.x - x) * (g.x - x) + (g.y - y) * (g.y - y);
      if (d < bestD) { bestD = d; best = g; }
    }
    if (!best) return;
    best.value += value;
    best.sprite?.setTint(tierTint(best.value));
  }
}
