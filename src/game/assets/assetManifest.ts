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
  // O braco robotico entra como SHEET (e nao como imagem solta) porque o editor precisa poder
  // desenhar uma orientacao especifica: a paleta e o tabuleiro mostram o frame da direcao.
  {
    key: ASSET_KEYS.inserter,
    path: '/assets/environment/props/inserter.png',
    frameWidth: TILESET_FRAME_SIZE,
    frameHeight: TILESET_FRAME_SIZE,
  },
  {
    key: ASSET_KEYS.inserterHand,
    path: '/assets/environment/props/inserter_hand.png',
    frameWidth: TILESET_FRAME_SIZE,
    frameHeight: TILESET_FRAME_SIZE,
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
  {
    // 16x32: bomb on top, spark puff below (see BOMB_FRAMES).
    key: ASSET_KEYS.bombItem,
    path: '/assets/items/equipment/bomb.png',
    frameWidth: 16,
    frameHeight: 16,
  },
  {
    // 16x96: the dry tree shrinking per axe chop (see DRY_TREE_FRAME_COUNT).
    key: ASSET_KEYS.dryTree,
    path: '/assets/environment/props/woods.png',
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
    key: ASSET_KEYS.dryShrub,
    path: '/assets/environment/props/dry_shrub.png',
  },
  // Empty speech bubble shown above the hero's head with the item they still need inside it.
  { key: ASSET_KEYS.hintBalloon,    path: '/assets/ui/icons/ballon_icon.png' },
  { key: ASSET_KEYS.axeIcon,        path: '/assets/ui/icons/axe_icon.png' },
  { key: ASSET_KEYS.greatAxeIcon,   path: '/assets/ui/icons/great_axe_icon.png' },
  { key: ASSET_KEYS.bombIcon,       path: '/assets/ui/icons/bomb_icon.png' },
  { key: ASSET_KEYS.lavaBootsIcon,  path: '/assets/ui/icons/lava_boots_icon.png' },
  { key: ASSET_KEYS.pickaxeIcon,    path: '/assets/ui/icons/pickaxe_icon.png' },
  { key: ASSET_KEYS.scytheIcon,     path: '/assets/ui/icons/scythe_icon.png' },
  { key: ASSET_KEYS.woodIcon,       path: '/assets/ui/icons/wood_icon.png' },
  { key: ASSET_KEYS.woodOnFireIcon, path: '/assets/ui/icons/wood_on_fire_icon.png' },
  { key: ASSET_KEYS.woodItem,       path: '/assets/items/collectibles/wood.png' },
  { key: ASSET_KEYS.rock,           path: '/assets/environment/props/rock.png' },
  { key: ASSET_KEYS.rockCracked,    path: '/assets/environment/props/rock__1.png' },
  { key: ASSET_KEYS.tallGrassWind0, path: '/assets/environment/props/grass_wind0.png' },
  { key: ASSET_KEYS.tallGrassWind1, path: '/assets/environment/props/grass_wind1.png' },
  { key: ASSET_KEYS.cuttingGrass0,  path: '/assets/environment/props/cuting_grass0.png' },
  { key: ASSET_KEYS.cuttingGrass1,  path: '/assets/environment/props/cuting_grass1.png' },
  { key: ASSET_KEYS.cuttingGrass2,  path: '/assets/environment/props/cuting_grass2.png' },
  { key: ASSET_KEYS.cuttingGrass3,  path: '/assets/environment/props/cuting_grass3.png' },
  { key: ASSET_KEYS.seedsItem,      path: '/assets/items/collectibles/seeds.png' },
  { key: ASSET_KEYS.plantHole,      path: '/assets/environment/props/plant_hole.png' },
  { key: ASSET_KEYS.plantMound,     path: '/assets/environment/props/plant_mound.png' },
  { key: ASSET_KEYS.cutGrass,       path: '/assets/environment/props/cut_grass.png' },
  { key: ASSET_KEYS.cutGrassWind0,  path: '/assets/environment/props/cut_grass_wind0.png' },
  { key: ASSET_KEYS.cutGrassWind1,  path: '/assets/environment/props/cut_grass_wind1.png' },
  { key: ASSET_KEYS.grassFire0,     path: '/assets/environment/props/grass_fre_0.png' },
  { key: ASSET_KEYS.grassFire1,     path: '/assets/environment/props/grass_fre_1.png' },
  { key: ASSET_KEYS.lavaFloor,      path: '/assets/environment/terrain/lava_floor.png' },
  { key: ASSET_KEYS.water,          path: '/assets/environment/terrain/water_0.png' },
  { key: ASSET_KEYS.water1,         path: '/assets/environment/terrain/water_1.png' },
  { key: ASSET_KEYS.water2,         path: '/assets/environment/terrain/water_2.png' },
  { key: ASSET_KEYS.water3,         path: '/assets/environment/terrain/water_3.png' },
  { key: ASSET_KEYS.bridge,         path: '/assets/environment/terrain/bridge.png' },
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
