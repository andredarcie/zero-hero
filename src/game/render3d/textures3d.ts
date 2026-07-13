import * as THREE from 'three';

// ── Texture registry for the 3D world renderer ────────────────────────────────
//
// Resolves the SAME art the 2D game uses (public/assets/…) into THREE textures,
// including spritesheet frames (hero walk, tileset tiles, NPC sheet, the dry
// tree's chop states…). Everything is NEAREST-filtered sRGB — crisp pixel art
// inside the smoothly lit 3D world.
//
// All base images are loaded up front by preloadTextures3D() (PreloadScene
// awaits it alongside Phaser's own loader), so frame lookups afterwards are
// synchronous and safe.

type SheetDef = {
  url: string;
  frameW?: number; // omitted → whole image is the single frame
  frameH?: number;
};

const A = '/assets';

// Keys deliberately mirror the game's ASSET_KEYS names where one exists.
const DEFS: Record<string, SheetDef> = {
  hero: { url: `${A}/characters/player/hero.png`, frameW: 16, frameH: 16 },
  'hero-hurt': { url: `${A}/characters/player/hero_hurt.png` },
  'forest-tileset': { url: `${A}/environment/tilesets/forest_tile_set.png`, frameW: 16, frameH: 16 },
  npcs: { url: `${A}/characters/npcs/npcs.png`, frameW: 16, frameH: 16 },
  'npc-salesman': { url: `${A}/characters/npcs/salesman.png` },
  'npc-poet': { url: `${A}/characters/npcs/poet.png` },
  'npc-death': { url: `${A}/ui/states/death.png` },
  mage: { url: `${A}/characters/enemies/mage/mage__1.png` },
  // A fauna do modo Sobreviventes — arte que já vivia em enemies/ sem uso.
  bat: { url: `${A}/characters/enemies/bat/bat.png` },
  'bat-hurt': { url: `${A}/characters/enemies/bat/bat_hurt.png` },
  spider: { url: `${A}/characters/enemies/spider/spider.png` },
  // Os slimes são folhas 16×32 (corpo em cima, poça embaixo); frame 0 = o corpo.
  slime: { url: `${A}/characters/enemies/slime/Slime.png`, frameW: 16, frameH: 16 },
  bigslime: { url: `${A}/characters/enemies/slime/BigSlime.png`, frameW: 16, frameH: 16 },
  undead: { url: `${A}/characters/enemies/undead/undead.png` },
  'undead-hurt': { url: `${A}/characters/enemies/undead/undead_hurt.png` },
  'undead-born-0': { url: `${A}/characters/enemies/undead/undead_born0.png` },
  'undead-born-1': { url: `${A}/characters/enemies/undead/undead_born1.png` },
  'undead-born-2': { url: `${A}/characters/enemies/undead/undead_born2.png` },
  'undead-born-3': { url: `${A}/characters/enemies/undead/undead_born3.png` },
  'undead-born-4': { url: `${A}/characters/enemies/undead/undead_born4.png` },
  'undead-born-5': { url: `${A}/characters/enemies/undead/undead_born5.png` },
  'undead-born-6': { url: `${A}/characters/enemies/undead/undead_born6.png` },
  'campfire-0': { url: `${A}/effects/fire/sprite_fire0.png` },
  'campfire-1': { url: `${A}/effects/fire/sprite_fire1.png` },
  'campfire-2': { url: `${A}/effects/fire/sprite_fire2.png` },
  'tiny-fire-0': { url: `${A}/effects/fire/sprite_tiny_fire0.png` },
  'tiny-fire-1': { url: `${A}/effects/fire/sprite_tiny_fire1.png` },
  'tiny-fire-2': { url: `${A}/effects/fire/sprite_tiny_fire2.png` },
  // woods.png: 16×96 vertical sheet — the dry tree shrinking per axe chop.
  'dry-tree': { url: `${A}/environment/props/woods.png`, frameW: 16, frameH: 16 },
  'dry-bush': { url: `${A}/environment/props/bush.png` },
  'dry-shrub': { url: `${A}/environment/props/dry_shrub.png` },
  rock: { url: `${A}/environment/props/rock.png` },
  'rock-cracked': { url: `${A}/environment/props/rock__1.png` },
  'locked-door-object': { url: `${A}/environment/structures/locked_door.png` },
  'tall-grass-wind-0': { url: `${A}/environment/props/grass_wind0.png` },
  'tall-grass-wind-1': { url: `${A}/environment/props/grass_wind1.png` },
  'cutting-grass-0': { url: `${A}/environment/props/cuting_grass0.png` },
  'cutting-grass-1': { url: `${A}/environment/props/cuting_grass1.png` },
  'cutting-grass-2': { url: `${A}/environment/props/cuting_grass2.png` },
  'cutting-grass-3': { url: `${A}/environment/props/cuting_grass3.png` },
  'cut-grass': { url: `${A}/environment/props/cut_grass.png` },
  'cut-grass-wind-0': { url: `${A}/environment/props/cut_grass_wind0.png` },
  'cut-grass-wind-1': { url: `${A}/environment/props/cut_grass_wind1.png` },
  'grass-fire-0': { url: `${A}/environment/props/grass_fre_0.png` },
  'grass-fire-1': { url: `${A}/environment/props/grass_fre_1.png` },
  'lava-floor': { url: `${A}/environment/terrain/lava_floor.png` },
  'water-0': { url: `${A}/environment/terrain/water_0.png` },
  'water-1': { url: `${A}/environment/terrain/water_1.png` },
  'water-2': { url: `${A}/environment/terrain/water_2.png` },
  'water-3': { url: `${A}/environment/terrain/water_3.png` },
  bridge: { url: `${A}/environment/terrain/bridge.png` },
  coin: { url: `${A}/items/collectibles/coin.png` },
  heart: { url: `${A}/items/collectibles/heart.png` },
  'wood-item': { url: `${A}/items/collectibles/wood.png` },
  // key.png: 16×32 — top frame is the held/HUD key, bottom the map pickup.
  'key-item': { url: `${A}/items/collectibles/key.png`, frameW: 16, frameH: 16 },
  // bomb.png: 16×32 — bomb on top, spark puff below.
  'bomb-item': { url: `${A}/items/equipment/bomb.png`, frameW: 16, frameH: 16 },
  'sword-item': { url: `${A}/items/equipment/sword.png`, frameW: 16, frameH: 16 },
  'sword-on-fire': { url: `${A}/items/equipment/sword_on_fire.png`, frameW: 16, frameH: 16 },
  'axe-icon': { url: `${A}/ui/icons/axe_icon.png` },
  'sword-icon': { url: `${A}/ui/icons/sword_icon.png` },
  'key-item-icon': { url: `${A}/ui/icons/key_icon.png` },
  'bomb-icon': { url: `${A}/ui/icons/bomb_icon.png` },
  'lava-boots-icon': { url: `${A}/ui/icons/lava_boots_icon.png` },
  'pickaxe-icon': { url: `${A}/ui/icons/pickaxe_icon.png` },
  'scythe-icon': { url: `${A}/ui/icons/scythe_icon.png` },
  'wood-icon': { url: `${A}/ui/icons/wood_icon.png` },
  'wood-on-fire-icon': { url: `${A}/ui/icons/wood_on_fire_icon.png` },
};

const baseTextures = new Map<string, THREE.Texture>();
const frameTextures = new Map<string, THREE.Texture>();
let loaded: Promise<void> | null = null;

/** Kick (or reuse) the one-time load of every registered image. */
export const preloadTextures3D = (): Promise<void> => {
  if (loaded) return loaded;
  const manager = new THREE.LoadingManager();
  const loader = new THREE.TextureLoader(manager);
  for (const [key, def] of Object.entries(DEFS)) {
    const t = loader.load(def.url);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    baseTextures.set(key, t);
  }
  loaded = new Promise((resolve) => {
    manager.onLoad = () => resolve();
    manager.onError = () => resolve(); // a missing file should not soft-lock the boot
  });
  return loaded;
};

/**
 * Publish a texture built at runtime (the particle dot, the shockwave ring) under a key, so
 * the FX that spawn it can go through the same Billboard3D path as any authored sprite.
 * Called after preloadTextures3D, so it never races the loader.
 */
export const registerTexture3D = (key: string, texture: THREE.Texture): void => {
  DEFS[key] = { url: '' }; // whole-image "sheet": a frame lookup just returns the base
  baseTextures.set(key, texture);
};

/**
 * A texture for `key`, optionally narrowed to a spritesheet `frame` (row-major,
 * like Phaser's). Frame variants are cached clones sharing the base image.
 */
export const getTexture3D = (key: string, frame = 0): THREE.Texture => {
  const def = DEFS[key];
  const base = baseTextures.get(key);
  if (!def || !base) throw new Error(`textures3d: chave desconhecida '${key}'`);
  if (def.frameW === undefined) return base;

  const cacheKey = `${key}#${frame}`;
  const hit = frameTextures.get(cacheKey);
  if (hit) return hit;

  const img = base.image as { width: number; height: number };
  const cols = Math.max(1, Math.floor(img.width / (def.frameW ?? img.width)));
  const rows = Math.max(1, Math.floor(img.height / (def.frameH ?? img.height)));
  const col = frame % cols;
  const row = Math.floor(frame / cols);
  const t = base.clone();
  t.repeat.set(1 / cols, 1 / rows);
  t.offset.set(col / cols, (rows - 1 - row) / rows);
  t.needsUpdate = true;
  frameTextures.set(cacheKey, t);
  return t;
};

/** Tileset frame UVs for the merged ground/decor meshes (not a cloned texture). */
export const tilesetFrameUv = (
  frame: number,
): { u0: number; u1: number; v0: number; v1: number } => {
  const base = baseTextures.get('forest-tileset');
  const img = base?.image as { width: number; height: number } | undefined;
  const cols = img ? img.width / 16 : 3;
  const rows = img ? img.height / 16 : 9;
  const col = frame % cols;
  const row = Math.floor(frame / cols);
  const inset = 0.35 / 16; // fraction of a frame; keeps NEAREST off neighbours
  return {
    u0: (col + inset) / cols,
    u1: (col + 1 - inset) / cols,
    v0: (rows - row - 1 + inset) / rows,
    v1: (rows - row - inset) / rows,
  };
};

export const getBaseTexture3D = (key: string): THREE.Texture => {
  const base = baseTextures.get(key);
  if (!base) throw new Error(`textures3d: chave desconhecida '${key}'`);
  return base;
};
