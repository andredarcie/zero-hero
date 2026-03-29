import type Phaser from 'phaser';

import { TIMINGS } from '@/game/constants';
import type { BoardMetrics } from '@/game/shared/grid';

export const animateGrassRustle = (
  scene: Phaser.Scene,
  grass: Phaser.GameObjects.Sprite | undefined,
  metrics: BoardMetrics,
): void => {
  if (!grass) {
    return;
  }

  const baseScaleX = metrics.tileSize / grass.width;
  const baseScaleY = metrics.tileSize / grass.height;

  scene.tweens.killTweensOf(grass);
  grass.setScale(baseScaleX, baseScaleY);
  grass.setAngle(0);

  scene.tweens.add({
    targets: grass,
    angle: -8,
    scaleX: baseScaleX * 0.88,
    scaleY: baseScaleY * 1.08,
    yoyo: true,
    duration: TIMINGS.grassRustleDurationMs,
    ease: 'Sine.easeOut',
    onComplete: () => {
      grass.setScale(baseScaleX, baseScaleY);
      grass.setAngle(0);
    },
  });
};
