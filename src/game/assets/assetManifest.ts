import type Phaser from 'phaser';

import { ASSET_KEYS, TILESET_FRAME_SIZE } from '@/game/constants';

type SpritesheetAsset = {
  key: string;
  path: string;
  frameWidth: number;
  frameHeight: number;
};

type ImageAsset = {
  key: string;
  path: string;
};

const resolveAssetUrl = (path: string): string => `${import.meta.env.BASE_URL}${path.replace(/^\/+/u, '')}`;

const SHARED_SPRITESHEETS: readonly SpritesheetAsset[] = [
  {
    key: ASSET_KEYS.hero,
    path: '/assets/characters/player/hero.png',
    frameWidth: TILESET_FRAME_SIZE,
    frameHeight: TILESET_FRAME_SIZE,
  },
  {
    key: ASSET_KEYS.forestTileset,
    path: '/assets/environment/tilesets/forest_tile_set.png',
    frameWidth: TILESET_FRAME_SIZE,
    frameHeight: TILESET_FRAME_SIZE,
  },
  {
    key: ASSET_KEYS.hudHearts,
    path: '/assets/ui/hud/hearts.png',
    frameWidth: 7,
    frameHeight: 7,
  },
] as const;

const SHARED_IMAGES: readonly ImageAsset[] = [
  {
    key: ASSET_KEYS.hudSlot,
    path: '/assets/ui/hud/hud_slot.png',
  },
  {
    key: ASSET_KEYS.keyItem,
    path: '/assets/items/collectibles/key.png',
  },
  {
    key: ASSET_KEYS.keyItemIcon,
    path: '/assets/ui/icons/key_icon.png',
  },
  {
    key: ASSET_KEYS.swordItem,
    path: '/assets/items/equipment/sword.png',
  },
  {
    key: ASSET_KEYS.swordItemIcon,
    path: '/assets/ui/icons/sword_icon.png',
  },
] as const;

export const preloadSharedAssets = (scene: Phaser.Scene): void => {
  SHARED_SPRITESHEETS.forEach((asset) => {
    scene.load.spritesheet(asset.key, resolveAssetUrl(asset.path), {
      frameWidth: asset.frameWidth,
      frameHeight: asset.frameHeight,
    });
  });

  SHARED_IMAGES.forEach((asset) => {
    scene.load.image(asset.key, resolveAssetUrl(asset.path));
  });
};
