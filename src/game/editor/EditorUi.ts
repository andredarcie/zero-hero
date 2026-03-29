import Phaser from 'phaser';

import { DEFAULT_GAME_HEIGHT, EDITOR_BUTTON_HEIGHT, FONT_FAMILY, SCENE_DEPTHS } from '@/game/constants';

export const createButton = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  onClick: () => void,
): Phaser.GameObjects.Rectangle => scene.add.rectangle(x, y, width, height, 0xa8dadc, 1)
  .setOrigin(0)
  .setStrokeStyle(1, 0x264653, 1)
  .setInteractive({ useHandCursor: true })
  .setDepth(SCENE_DEPTHS.uiOverlay)
  .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => scene.input.setDefaultCursor('pointer'))
  .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => scene.input.setDefaultCursor('default'))
  .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => onClick());

export const createButtonLabel = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
): Phaser.GameObjects.Text => scene.add.text(x, y, text, {
  color: '#081014',
  fontFamily: FONT_FAMILY,
  fontSize: '12px',
}).setOrigin(0.5).setDepth(SCENE_DEPTHS.uiLabel);

export const createToast = (
  scene: Phaser.Scene,
  x: number,
  y: number,
  message: string,
): Phaser.GameObjects.Text => scene.add.text(x, y, message, {
  color: '#f1faee',
  backgroundColor: '#17323b',
  fontFamily: FONT_FAMILY,
  fontSize: '12px',
  padding: { x: 8, y: 4 },
}).setDepth(SCENE_DEPTHS.toast);

export const defaultBottomButtonY = {
  save: DEFAULT_GAME_HEIGHT - (EDITOR_BUTTON_HEIGHT + 74),
  export: DEFAULT_GAME_HEIGHT - (EDITOR_BUTTON_HEIGHT + 38),
  clear: DEFAULT_GAME_HEIGHT - 32,
} as const;
