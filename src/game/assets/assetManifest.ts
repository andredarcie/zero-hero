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
    // A MOEDA GIRA: quatro poses numa fita (cara, três-quartos, fio, três-quartos de volta). Ela
    // era um frame PARADO na lista de imagens — e é o objeto que este jogo mais mostra na tela.
    key: ASSET_KEYS.coin,
    path: '/assets/items/collectibles/coin.png',
    frameWidth: TILESET_FRAME_SIZE,
    frameHeight: TILESET_FRAME_SIZE,
  },
  {
    key: ASSET_KEYS.hero,
    path: '/assets/characters/player/hero.png',
    frameWidth: TILESET_FRAME_SIZE,
    frameHeight: TILESET_FRAME_SIZE,
  },
  {
    // Sprite Factory: os pedacos em que a caveira se parte ao morrer ([0] cabeca, [1] osso
    // quebrado). Sheet de duas frames em linha — por isso aqui, e nao na lista de imagens.
    key: ASSET_KEYS.undeadBits,
    path: '/assets/characters/enemies/undead/undead_bits.png',
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
    key: ASSET_KEYS.hearts,
    path: '/assets/ui/hearts.png',
    frameWidth: 7,
    frameHeight: 7,
  },
  {
    // Sprite Factory: o MARCO da estrada — laje dormente (0) e desperta (1).
    key: ASSET_KEYS.roadSeal,
    path: '/assets/environment/props/road_seal.png',
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
    // Sprite Factory: a planta carnivora em 6 tempos — fechada, bote, engolida, mastiga A/B
    // e a murcha. Entra como SHEET porque o editor desenha um frame (a fechada).
    key: ASSET_KEYS.carnivorousPlant,
    path: '/assets/environment/props/carnivorous_plant.png',
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
    // Sprite Factory: arco medieval fixo + quatro fases discretas do vortice roxo.
    key: ASSET_KEYS.levelPortal,
    path: '/assets/environment/props/level_portal.png',
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
  {
    // 16x32: gosma pousada (0) e esticada no pulo (1) — ver SLIME_FRAMES.
    key: ASSET_KEYS.slime,
    path: '/assets/characters/enemies/slime/Slime.png',
    frameWidth: 16,
    frameHeight: 16,
  },
  {
    // O mesmo par, no corpo grande.
    key: ASSET_KEYS.bigSlime,
    path: '/assets/characters/enemies/slime/BigSlime.png',
    frameWidth: 16,
    frameHeight: 16,
  },
  {
    // Sprite Factory (zora.mjs): 16x80 — submerso, emergindo, erguido, cuspindo e o cuspe.
    // Ver ZORA_FRAMES; o ultimo frame e a municao dele, no mesmo sheet.
    key: ASSET_KEYS.zora,
    path: '/assets/characters/enemies/zora/zora.png',
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
    key: ASSET_KEYS.swingGateObject,
    path: '/assets/environment/structures/swing_gate.png',
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
  // Sprite Factory: a arma da caveira. (Os PEDACOS do desmonte sao um sheet de duas frames, entao
  // vivem em SHARED_SPRITESHEETS, la em cima.)
  { key: ASSET_KEYS.undeadBone, path: '/assets/characters/enemies/undead/undead_bone.png' },
  // A ossada: a frame 27 do forest_tile_set recortada pixel a pixel para uma textura PROPRIA — ver
  // ASSET_KEYS.bones. A arte e a mesma; o que muda e o filtro com que ela e amostrada.
  { key: ASSET_KEYS.bones, path: '/assets/environment/props/bones.png' },
  { key: ASSET_KEYS.spiderWeb, path: '/assets/environment/props/spider_web.png' },
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
  { key: ASSET_KEYS.greatAxeIcon,   path: '/assets/ui/icons/great_axe_icon.png' },
  { key: ASSET_KEYS.bombIcon,       path: '/assets/ui/icons/bomb_icon.png' },
  { key: ASSET_KEYS.pickaxeIcon,    path: '/assets/ui/icons/pickaxe_icon.png' },
  { key: ASSET_KEYS.scytheIcon,     path: '/assets/ui/icons/scythe_icon.png' },
  { key: ASSET_KEYS.shovelIcon,     path: '/assets/ui/icons/shovel_icon.png' },
  { key: ASSET_KEYS.woodIcon,       path: '/assets/ui/icons/wood_icon.png' },
  { key: ASSET_KEYS.woodOnFireIcon, path: '/assets/ui/icons/wood_on_fire_icon.png' },
  { key: ASSET_KEYS.woodItem,       path: '/assets/items/collectibles/wood.png' },
  { key: ASSET_KEYS.rock,           path: '/assets/environment/props/rock.png' },
  { key: ASSET_KEYS.ironItem,       path: '/assets/items/collectibles/iron.png' },
  { key: ASSET_KEYS.oreItem,        path: '/assets/items/collectibles/ore.png' },
  { key: ASSET_KEYS.bloomItem,      path: '/assets/items/collectibles/bloom.png' },
  { key: ASSET_KEYS.rockCracked,    path: '/assets/environment/props/rock_cracked.png' },
  { key: ASSET_KEYS.cuttingGrass0,  path: '/assets/environment/props/cuting_grass0.png' },
  { key: ASSET_KEYS.cuttingGrass1,  path: '/assets/environment/props/cuting_grass1.png' },
  { key: ASSET_KEYS.cuttingGrass2,  path: '/assets/environment/props/cuting_grass2.png' },
  { key: ASSET_KEYS.cuttingGrass3,  path: '/assets/environment/props/cuting_grass3.png' },
  { key: ASSET_KEYS.seedsItem,      path: '/assets/items/collectibles/seeds.png' },
  { key: ASSET_KEYS.carnivoreSeedsItem, path: '/assets/items/collectibles/carnivore_seeds.png' },
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
    // Duas leituras dividem esta arte: o NPC "wizard" (NPC_VISUALS) e o mago INIMIGO, que por
    // isso nasce com um tom frio por cima (ver MageEnemy).
    key: ASSET_KEYS.mage,
    path: '/assets/characters/enemies/mage/mage__1.png',
  },
  // A FAUNA AUTORAVEL (aba Inimigos). O editor precisa destas texturas do lado PHASER — a
  // paleta e o tabuleiro sao 2D —, e o jogo precisa das mesmas do lado 3D (textures3d DEFS).
  { key: ASSET_KEYS.bat,          path: '/assets/characters/enemies/bat/bat.png' },
  { key: ASSET_KEYS.batHurt,      path: '/assets/characters/enemies/bat/bat_hurt.png' },
  { key: ASSET_KEYS.spider,       path: '/assets/characters/enemies/spider/spider.png' },
  { key: ASSET_KEYS.slimePool,    path: '/assets/characters/enemies/slime/SlimePool.png' },
  { key: ASSET_KEYS.bigSlimePool, path: '/assets/characters/enemies/slime/BigSlimePool.png' },
  { key: ASSET_KEYS.turret,       path: '/assets/characters/enemies/turret/turret.png' },
  { key: ASSET_KEYS.turretBullet, path: '/assets/characters/enemies/turret/turret_bullet.png' },
  { key: ASSET_KEYS.mageHurt,     path: '/assets/characters/enemies/mage/mage_hurt.png' },
  { key: ASSET_KEYS.mageCast,     path: '/assets/characters/enemies/mage/mage_magic.png' },
  { key: ASSET_KEYS.magicBall,    path: '/assets/characters/enemies/mage/magic_ball.png' },
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
