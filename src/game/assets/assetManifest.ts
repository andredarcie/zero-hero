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
    // Sprite Factory: o forno — a boca em quatro direcoes, e o mesmo par apagado/aceso.
    //
    // Ele nao esta aqui por causa do mundo 3D (aquele le `textures3d`), e sim porque TODA arte que
    // a UI 2D desenha precisa passar pelo Phaser: o catalogo da bancada, a bolsa e a subtela pedem
    // um data URL do frame (`spriteDataUrl`), e uma textura que so existe no lado 3D devolve
    // imagem QUEBRADA. Foi o que aconteceu com estas duas — e a silhueta preta do catalogo
    // escondeu o defeito por um bom tempo, porque uma imagem quebrada chapada de preto e
    // indistinguivel de um vulto.
    key: ASSET_KEYS.furnace,
    path: '/assets/environment/props/furnace.png',
    frameWidth: TILESET_FRAME_SIZE,
    frameHeight: TILESET_FRAME_SIZE,
  },
  {
    // Sprite Factory: o ALTAR — laje fria (0) e com o tampo em brasa (1). Precisa do lado Phaser
    // como o forno e o altar: o icone do editor e qualquer UI 2D leem o frame por aqui.
    key: ASSET_KEYS.altar,
    path: '/assets/environment/props/altar.png',
    frameWidth: TILESET_FRAME_SIZE,
    frameHeight: TILESET_FRAME_SIZE,
  },
  {
    // Sprite Factory: o mato alto em pe — 4 frames de vento + o toco (frame 4). Entra como
    // SHEET porque o editor precisa desenhar um frame especifico (o 0, o mato inteiro).
    key: ASSET_KEYS.tallGrassUp,
    path: '/assets/environment/props/tall_grass_up.png',
    frameWidth: TILESET_FRAME_SIZE,
    frameHeight: TILESET_FRAME_SIZE,
  },
  {
    // Sprite Factory: a pedra de ferro — inteira (0) e rachada (1). Entra como SHEET porque
    // os dois estados sao frames de um arquivo so; a rocha comum e antiga e usa dois PNGs.
    key: ASSET_KEYS.ironRock,
    path: '/assets/environment/props/iron_rock.png',
    frameWidth: TILESET_FRAME_SIZE,
    frameHeight: TILESET_FRAME_SIZE,
  },
  {
    // Sprite Factory: o buraco de plantio pronto (0) + os tres tempos da cavada da pa
    // (raspao 1, depressao 2, fundo 3). O frame final fica no TOPO da coluna para toda
    // referencia `frame: 0` antiga continuar apontando pro buraco de sempre.
    key: ASSET_KEYS.plantHole,
    path: '/assets/environment/props/plant_hole.png',
    frameWidth: TILESET_FRAME_SIZE,
    frameHeight: TILESET_FRAME_SIZE,
  },
  {
    // Sprite Factory: as 9 poses de UMA flor da lua abrindo (ver MOONFLOWER_FRAMES) — cinco em pe
    // e quatro deitadas. Entra como SHEET porque o editor precisa desenhar UM frame (o aberto).
    key: ASSET_KEYS.moonflower,
    path: '/assets/environment/props/moonflower.png',
    frameWidth: TILESET_FRAME_SIZE,
    frameHeight: TILESET_FRAME_SIZE,
  },
  {
    // Sprite Factory: as poses da bancada manual (ver TOOLBOX_FRAMES).
    key: ASSET_KEYS.toolbox,
    path: '/assets/environment/props/workbench.png',
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
    // 16x96: the dry tree shrinking per axe chop (see DRY_TREE_FRAME_COUNT).
    key: ASSET_KEYS.dryTree,
    path: '/assets/environment/props/woods.png',
    frameWidth: 16,
    frameHeight: 16,
  },
] as const;

const SHARED_IMAGES: readonly ImageAsset[] = [
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
    key: ASSET_KEYS.swordItemIcon,
    path: '/assets/ui/icons/sword_icon.png',
  },
  {
    key: ASSET_KEYS.lookedDoorObject,
    path: '/assets/environment/structures/locked_door.png',
  },
  {
    key: ASSET_KEYS.swingGateObject,
    path: '/assets/environment/structures/swing_gate.png',
  },
  {
    // Sprite Factory: o mesmo balao com o GRAVETO ACESO dentro — o que falta para o arbusto pegar.
    key: ASSET_KEYS.thoughtTorch,
    path: '/assets/ui/icons/thought_torch.png',
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
  { key: ASSET_KEYS.axeIcon,        path: '/assets/ui/icons/axe_icon.png' },
  { key: ASSET_KEYS.pickaxeIcon,    path: '/assets/ui/icons/pickaxe_icon.png' },
  { key: ASSET_KEYS.scytheIcon,     path: '/assets/ui/icons/scythe_icon.png' },
  { key: ASSET_KEYS.shovelIcon,     path: '/assets/ui/icons/shovel_icon.png' },
  { key: ASSET_KEYS.woodIcon,       path: '/assets/ui/icons/wood_icon.png' },
  { key: ASSET_KEYS.woodItem,       path: '/assets/items/collectibles/wood.png' },
  { key: ASSET_KEYS.rock,           path: '/assets/environment/props/rock.png' },
  { key: ASSET_KEYS.ironItem,       path: '/assets/items/collectibles/iron.png' },
  { key: ASSET_KEYS.oreItem,        path: '/assets/items/collectibles/ore.png' },
  { key: ASSET_KEYS.bloomItem,      path: '/assets/items/collectibles/bloom.png' },
  { key: ASSET_KEYS.rockCracked,    path: '/assets/environment/props/rock_cracked.png' },
  { key: ASSET_KEYS.seedsItem,      path: '/assets/items/collectibles/seeds.png' },
  { key: ASSET_KEYS.mushroomItem,   path: '/assets/items/collectibles/mushroom.png' },
  { key: ASSET_KEYS.plantMound,     path: '/assets/environment/props/plant_mound.png' },
  { key: ASSET_KEYS.water,          path: '/assets/environment/terrain/water_0.png' },
  { key: ASSET_KEYS.water1,         path: '/assets/environment/terrain/water_1.png' },
  { key: ASSET_KEYS.water2,         path: '/assets/environment/terrain/water_2.png' },
  { key: ASSET_KEYS.water3,         path: '/assets/environment/terrain/water_3.png' },
  { key: ASSET_KEYS.bridge,         path: '/assets/environment/terrain/bridge.png' },
  {
    // O mago (NPC "wizard", ver NPC_VISUALS). A arte ainda mora na pasta dos inimigos de antes.
    key: ASSET_KEYS.mage,
    path: '/assets/characters/enemies/mage/mage__1.png',
  },
  { key: ASSET_KEYS.campfireFrame1, path: '/assets/effects/fire/sprite_fire1.png' },
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
