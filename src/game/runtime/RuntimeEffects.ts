import type Phaser from 'phaser';

import { TIMINGS } from '@/game/constants';

export const animateGrassRustle = (
  scene: Phaser.Scene,
  grass: Phaser.GameObjects.Sprite | undefined,
  tileSize: number,
): void => {
  if (!grass) return;

  const baseScaleX = tileSize / grass.width;
  const baseScaleY = tileSize / grass.height;

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
