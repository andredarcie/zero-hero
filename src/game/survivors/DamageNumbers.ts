import Phaser from 'phaser';

import { FONT_FAMILY, SCENE_DEPTHS, TEXT_RESOLUTION } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// ── Números de dano flutuantes ─────────────────────────────────────────────────
//
// O feedback mais barato e mais viciante do gênero: cada golpe imprime seu dano
// subindo do corpo do inimigo. Pool fixo de Texts Phaser (a camada 2D sobre o
// mundo 3D), com um teto de spawns por frame — quando a Ceifadora perfura 30
// slimes num tiro, 12 números bastam para a sensação e o resto seria só custo.

const POOL_SIZE = 36;
const MAX_SPAWNS_PER_FRAME = 12;
const FLOAT_MS = 520;

export class DamageNumbers {
  private readonly pool: Phaser.GameObjects.Text[] = [];
  private spawnsThisFrame = 0;

  public constructor(private readonly scene: Phaser.Scene) {
    for (let i = 0; i < POOL_SIZE; i++) {
      this.pool.push(
        scene.add
          .text(0, 0, '', {
            fontFamily: FONT_FAMILY,
            fontSize: '11px',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3,
            resolution: TEXT_RESOLUTION,
          })
          .setOrigin(0.5)
          .setDepth(SCENE_DEPTHS.toast)
          .setVisible(false),
      );
    }
  }

  /** Chamar uma vez por frame, antes das armas dispararem. */
  public beginFrame(): void {
    this.spawnsThisFrame = 0;
  }

  public spawn(worldX: number, worldY: number, amount: number, camera: WorldCamera, tileSize: number, crit = false): void {
    if (this.spawnsThisFrame >= MAX_SPAWNS_PER_FRAME) return;
    const free = this.pool.find((t) => !t.visible);
    if (!free) return;

    const screen = camera.tileToScreen(worldX, worldY, tileSize);
    const { width, height } = this.scene.scale;
    if (screen.x < -20 || screen.x > width + 20 || screen.y < -20 || screen.y > height + 20) return;

    this.spawnsThisFrame += 1;
    free
      .setText(String(Math.round(amount)))
      .setColor(crit ? '#ffd24a' : '#ffffff')
      .setFontSize(crit ? 14 : 11)
      .setPosition(screen.x + Phaser.Math.Between(-6, 6), screen.y - tileSize * 0.9)
      .setAlpha(1)
      .setScale(crit ? 1.25 : 1)
      .setVisible(true);

    this.scene.tweens.add({
      targets: free,
      y: free.y - tileSize * 0.7,
      alpha: 0,
      duration: FLOAT_MS,
      ease: 'Cubic.easeOut',
      onComplete: () => free.setVisible(false),
    });
  }

  public destroy(): void {
    for (const t of this.pool) {
      this.scene.tweens.killTweensOf(t);
      t.destroy();
    }
    this.pool.length = 0;
  }
}
