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
    // 16x32 sheet of two keys (top = held/HUD, bottom = map pickup); see KEY_FRAMES.
    key: ASSET_KEYS.keyItem,
    path: '/assets/items/collectibles/key.png',
    frameWidth: TILESET_FRAME_SIZE,
    frameHeight: TILESET_FRAME_SIZE,
  },
  {
    key: ASSET_KEYS.swordOnFire,
    path: '/assets/items/equipment/sword_on_fire.png',
    frameWidth: TILESET_FRAME_SIZE,
    frameHeight: TILESET_FRAME_SIZE,
  },
  {
    key: ASSET_KEYS.npcs,
    path: '/assets/characters/npcs/npcs.png',
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
    key: ASSET_KEYS.npcSalesman,
    path: '/assets/characters/npcs/salesman.png',
  },
  {
    key: ASSET_KEYS.npcPoet,
    path: '/assets/characters/npcs/poet.png',
  },
  {
    key: ASSET_KEYS.npcDeath,
    path: '/assets/ui/states/death.png',
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
  { key: ASSET_KEYS.undeadBorn0, path: '/assets/characters/enemies/undead/undead_born0.png' },
  { key: ASSET_KEYS.undeadBorn1, path: '/assets/characters/enemies/undead/undead_born1.png' },
  { key: ASSET_KEYS.undeadBorn2, path: '/assets/characters/enemies/undead/undead_born2.png' },
  { key: ASSET_KEYS.undeadBorn3, path: '/assets/characters/enemies/undead/undead_born3.png' },
  { key: ASSET_KEYS.undeadBorn4, path: '/assets/characters/enemies/undead/undead_born4.png' },
  { key: ASSET_KEYS.undeadBorn5, path: '/assets/characters/enemies/undead/undead_born5.png' },
  { key: ASSET_KEYS.undeadBorn6, path: '/assets/characters/enemies/undead/undead_born6.png' },
  {
    key: ASSET_KEYS.coin,
    path: '/assets/items/collectibles/coin.png',
  },
  {
    key: ASSET_KEYS.dryBush,
    path: '/assets/environment/props/bush.png',
  },
  {
    // Still loaded even though the mage enemy is gone: the "wizard" NPC uses this sprite
    // (see NPC_VISUALS in constants.ts).
    key: ASSET_KEYS.mage,
    path: '/assets/characters/enemies/mage/mage__1.png',
  },
  { key: ASSET_KEYS.campfireFrame0, path: '/assets/effects/fire/sprite_fire0.png' },
  { key: ASSET_KEYS.campfireFrame1, path: '/assets/effects/fire/sprite_fire1.png' },
  { key: ASSET_KEYS.campfireFrame2, path: '/assets/effects/fire/sprite_fire2.png' },
  { key: ASSET_KEYS.tinyFire0,      path: '/assets/effects/fire/sprite_tiny_fire0.png' },
  { key: ASSET_KEYS.tinyFire1,      path: '/assets/effects/fire/sprite_tiny_fire1.png' },
  { key: ASSET_KEYS.tinyFire2,      path: '/assets/effects/fire/sprite_tiny_fire2.png' },
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
