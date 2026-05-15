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
  {
    key: ASSET_KEYS.swordItem,
    path: '/assets/items/equipment/sword.png',
    frameWidth: TILESET_FRAME_SIZE,
    frameHeight: TILESET_FRAME_SIZE,
  },
  {
    key: ASSET_KEYS.slime,
    path: '/assets/characters/enemies/slime/Slime.png',
    frameWidth: 16,
    frameHeight: 16,
  },
  {
    key: ASSET_KEYS.bigSlime,
    path: '/assets/characters/enemies/slime/BigSlime.png',
    frameWidth: 16,
    frameHeight: 16,
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
    key: ASSET_KEYS.swordItemIcon,
    path: '/assets/ui/icons/sword_icon.png',
  },
  {
    key: ASSET_KEYS.itemShadow,
    path: '/assets/effects/ambient/item_shadow.png',
  },
  {
    key: ASSET_KEYS.lookedDoorObject,
    path: '/assets/environment/structures/locked_door.png',
  },
  {
    key: ASSET_KEYS.undead,
    path: '/assets/characters/enemies/undead/undead.png',
  },
  {
    key: ASSET_KEYS.undeadHurt,
    path: '/assets/characters/enemies/undead/undead_hurt.png',
  },
  {
    key: ASSET_KEYS.coin,
    path: '/assets/items/collectibles/coin.png',
  },
  {
    key: ASSET_KEYS.bat,
    path: '/assets/characters/enemies/bat/bat.png',
  },
  {
    key: ASSET_KEYS.batHurt,
    path: '/assets/characters/enemies/bat/bat_hurt.png',
  },
  {
    key: ASSET_KEYS.mage,
    path: '/assets/characters/enemies/mage/mage__1.png',
  },
  {
    key: ASSET_KEYS.mageHurt,
    path: '/assets/characters/enemies/mage/mage_hurt.png',
  },
  {
    key: ASSET_KEYS.magicBall,
    path: '/assets/characters/enemies/mage/magic_ball.png',
  },
  {
    key: ASSET_KEYS.slimePool,
    path: '/assets/characters/enemies/slime/SlimePool.png',
  },
  {
    key: ASSET_KEYS.bigSlimePool,
    path: '/assets/characters/enemies/slime/BigSlimePool.png',
  },
  {
    key: ASSET_KEYS.spider,
    path: '/assets/characters/enemies/spider/spider.png',
  },
  {
    key: ASSET_KEYS.webSpider,
    path: '/assets/effects/ambient/web_spider.png',
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
