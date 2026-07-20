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

// Resolved against Vite's base URL — GitHub Pages serves the game under /zero-hero/,
// so a hardcoded '/assets' misses the prefix, 404s every 3D texture and crashes the
// first addBillboard (image null). Same pattern as assetManifest's resolveAssetUrl.
const A = `${import.meta.env.BASE_URL.replace(/\/$/u, '')}/assets`;

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
  'slime-pool': { url: `${A}/characters/enemies/slime/SlimePool.png` },
  'bigslime-pool': { url: `${A}/characters/enemies/slime/BigSlimePool.png` },
  'mage-hurt': { url: `${A}/characters/enemies/mage/mage_hurt.png` },
  'mage-cast': { url: `${A}/characters/enemies/mage/mage_magic.png` },
  'magic-ball': { url: `${A}/characters/enemies/mage/magic_ball.png` },
  turret: { url: `${A}/characters/enemies/turret/turret.png` },
  'turret-bullet': { url: `${A}/characters/enemies/turret/turret_bullet.png` },
  'arrow-undead': { url: `${A}/characters/enemies/undead/arrow_undead.png` },
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
  // Sprite Factory: caldeira em 3 estados (fria / fornalha acesa / gerando) — ver BOILER_FRAMES.
  boiler: { url: `${A}/environment/props/boiler.png`, frameW: 16, frameH: 16 },
  // Sprite Factory: cabo de energia — 7 formas apagadas + 7 filetes gold (ver wireShapes.ts).
  wire: { url: `${A}/environment/props/wire.png`, frameW: 16, frameH: 16 },
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
  // O mato alto EM PE (spritefactory): touceira lateral p/ billboard upright, 2 frames de vento.
  'tall-grass-up': { url: `${A}/environment/props/tall_grass_up.png`, frameW: 16, frameH: 16 },
  // O ciclo de plantio (spritefactory): buraco cavado, monte da semente coberta, e as sementes.
  // O braco robotico (spritefactory). O sheet da base tem 4 frames e eles NAO sao animacao:
  // sao as 4 orientacoes (0=N 1=L 2=S 3=O). Um billboard nao tem yaw — setAngle gira no plano
  // da camera, nao no mundo — entao "girar o prop" so pode existir como escolha de frame.
  inserter: { url: `${A}/environment/props/inserter.png`, frameW: 16, frameH: 16 },
  'inserter-hand': { url: `${A}/environment/props/inserter_hand.png`, frameW: 16, frameH: 16 },
  'wooden-crate': { url: `${A}/environment/props/wooden_crate.png` },
  'pressure-plate': { url: `${A}/environment/props/pressure_plate.png`, frameW: 16, frameH: 16 },
  'water-wheel': { url: `${A}/environment/props/water_wheel.png`, frameW: 16, frameH: 16 },
  'plant-hole': { url: `${A}/environment/props/plant_hole.png` },
  'plant-mound': { url: `${A}/environment/props/plant_mound.png` },
  'seeds-item': { url: `${A}/items/collectibles/seeds.png` },
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
  // heart.png e um SHEET 16x32, igual key.png: em cima o coracao liso (navy), embaixo o de mapa,
  // com contorno claro. Sem frameW aqui, getTexture3D devolvia a folha INTEIRA e o pickup
  // desenhava os dois coracoes espremidos num quadrado de 0.65 tile. Ver HEART_FRAMES.
  heart: { url: `${A}/items/collectibles/heart.png`, frameW: 16, frameH: 16 },
  'wood-item': { url: `${A}/items/collectibles/wood.png` },
  // key.png: 16×32 — top frame is the held key, bottom the map pickup.
  'key-item': { url: `${A}/items/collectibles/key.png`, frameW: 16, frameH: 16 },
  // bomb.png: 16×32 — bomb on top, spark puff below.
  'bomb-item': { url: `${A}/items/equipment/bomb.png`, frameW: 16, frameH: 16 },
  'sword-item': { url: `${A}/items/equipment/sword.png`, frameW: 16, frameH: 16 },
  'sword-on-fire': { url: `${A}/items/equipment/sword_on_fire.png`, frameW: 16, frameH: 16 },
  'axe-icon': { url: `${A}/ui/icons/axe_icon.png` },
  'great-axe-icon': { url: `${A}/ui/icons/great_axe_icon.png` },
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
const framePixels = new Map<string, ImageData | null>();
const footPads = new Map<string, number>();
let loaded: Promise<void> | null = null;

/** Kick (or reuse) the one-time load of every registered image. */
export const preloadTextures3D = (): Promise<void> => {
  if (loaded) return loaded;
  const manager = new THREE.LoadingManager();
  const loader = new THREE.TextureLoader(manager);
  for (const [key, def] of Object.entries(DEFS)) {
    const t = loader.load(def.url);
    // The TILESET alone is filtered LINEAR — everything else stays NEAREST.
    //
    // Not a softening: the tile materials never sample between two texels except inside the
    // one-pixel band where a pixel genuinely straddles a seam (zhTexelUv, pixelArtLight), and there
    // the GPU's bilinear unit is precisely the tool for the job — it is what turns the ragged
    // staircase of a tile floor in perspective into a clean edge, for free. Texel interiors are
    // still fetched dead-centre, so the art comes out as crisp as NEAREST drew it.
    //
    // Sprites keep NEAREST: they face the camera, their pixels land square, and they have no
    // staircase to fix. NEAREST also makes the AA maths a no-op, so a sheet only opts in by
    // switching its filter here — which is why this line is the whole switch.
    const smooth = key === 'forest-tileset';
    t.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
    t.minFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
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
 * The UV window a spritesheet frame occupies: `uv * repeat + offset`.
 *
 * This is the transform getTexture3D bakes into its cloned texture, pulled out so a shader that
 * addresses a frame ITSELF (the instanced cast-shadow field, which samples one shared tileset for
 * every solid it shadows) computes the identical window. Two copies of this arithmetic would drift.
 */
// frameUvWindow is called once per shadowed solid per FRAME (the instanced cast fields
// window each silhouette onto its tile's frame), and the values are constants of the
// sheet — so the object is built once per (key, frame) and cached. Two-level (map by key,
// array by frame) rather than a `key#frame` string key: composing that string would itself
// be one small allocation per shadow per frame, i.e. the very garbage this cache removes.
// Callers must treat the result as read-only.
type UvWindow = { offsetX: number; offsetY: number; repeatX: number; repeatY: number };
const uvWindows = new Map<string, Array<UvWindow | undefined>>();
export const frameUvWindow = (
  key: string,
  frame: number,
): UvWindow => {
  let perFrame = uvWindows.get(key);
  if (!perFrame) {
    perFrame = [];
    uvWindows.set(key, perFrame);
  }
  const hit = perFrame[frame];
  if (hit) return hit;
  const def = DEFS[key];
  const base = baseTextures.get(key);
  if (!def || !base) throw new Error(`textures3d: chave desconhecida '${key}'`);
  const img = base.image as { width: number; height: number };
  const cols = Math.max(1, Math.floor(img.width / (def.frameW ?? img.width)));
  const rows = Math.max(1, Math.floor(img.height / (def.frameH ?? img.height)));
  const col = frame % cols;
  const row = Math.floor(frame / cols);
  const win = def.frameW === undefined
    ? { offsetX: 0, offsetY: 0, repeatX: 1, repeatY: 1 }
    : {
      offsetX: col / cols,
      offsetY: (rows - 1 - row) / rows,
      repeatX: 1 / cols,
      repeatY: 1 / rows,
    };
  perFrame[frame] = win;
  return win;
};

/**
 * The base image's pixels, read back once per sheet (or null when the texture was BUILT at
 * runtime rather than loaded — a DataTexture's image is a raw array, not something a canvas
 * can draw, and every caller here treats "unknown" as "no padding", which is the behaviour
 * these textures already had).
 */
const sheetPixels = (key: string): ImageData | null => {
  const hit = framePixels.get(key);
  if (hit !== undefined) return hit;
  let data: ImageData | null = null;
  try {
    const img = baseTextures.get(key)?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (img?.width && img.height) {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        data = ctx.getImageData(0, 0, img.width, img.height);
      }
    }
  } catch {
    data = null;
  }
  framePixels.set(key, data);
  return data;
};

/**
 * How much of a frame is EMPTY below its art, as a fraction of the frame's height.
 *
 * A frame is a box; the drawing inside it need not fill it. Almost all of this game's art is
 * flush with the bottom of its frame — a sprite stands on the frame's floor — but not all of
 * it: the rock leaves two rows of nothing under it, and the dry tree's stump three.
 *
 * Upright, that margin costs nothing: the rows are transparent and the quad's foot is the
 * frame's floor either way. A CAST SHADOW is where it bites, because a shadow lays that same
 * frame FLAT and STRETCHES it along the ground — so two transparent pixels stop being two
 * pixels and become `pad × length` tiles of bare ground between an object and its own
 * silhouette. That is exactly why the rock's shadow sat half a tile downwind of the rock.
 *
 * It is a property of the drawing and of nothing else, so it is measured from the drawing —
 * once per frame, at the same alpha the shadow's own alphaTest cuts the silhouette with, so
 * the pad counts precisely the rows the shadow will not draw.
 */
export const frameFootPad = (key: string, frame = 0): number => {
  const cacheKey = `${key}#${frame}`;
  const hit = footPads.get(cacheKey);
  if (hit !== undefined) return hit;

  let pad = 0;
  const def = DEFS[key];
  const img = sheetPixels(key);
  if (def && img) {
    const fw = def.frameW ?? img.width;
    const fh = def.frameH ?? img.height;
    const cols = Math.max(1, Math.floor(img.width / fw));
    const x0 = (frame % cols) * fw;
    const y0 = Math.floor(frame / cols) * fh;
    for (let y = fh - 1; y >= 0; y--) {
      let opaque = false;
      for (let x = 0; x < fw; x++) {
        if (img.data[((y0 + y) * img.width + (x0 + x)) * 4 + 3] > 102) { opaque = true; break; }
      }
      if (opaque) { pad = (fh - 1 - y) / fh; break; }
    }
  }
  footPads.set(cacheKey, pad);
  return pad;
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

  const w = frameUvWindow(key, frame);
  const t = base.clone();
  t.repeat.set(w.repeatX, w.repeatY);
  t.offset.set(w.offsetX, w.offsetY);
  t.needsUpdate = true;
  frameTextures.set(cacheKey, t);
  return t;
};

/**
 * Tileset frame UVs for the merged ground/decor meshes (not a cloned texture).
 *
 * `u0…v1` is the frame's exact box — the quad covers all 16 texels of its tile, at equal width, so
 * the pixel grid runs unbroken from one tile into the next. `cu0…cv1` is that box pulled in by half
 * a texel: the box of the frame's texel CENTRES, which is where zhTexelUv clamps its sample so a
 * bilinear fetch can never reach across into the neighbouring frame of the atlas.
 *
 * The quad UVs used to carry a 0.35-texel inset for the same reason ("keeps NEAREST off
 * neighbours"). It bought safety by cropping every tile's border pixels to two-thirds of their
 * width — a hitch in the pixel grid at every tile boundary, which is the opposite of what we want
 * from a fix for the jaggies. The shader clamp does the job exactly, so the inset is gone.
 */
export const tilesetFrameUv = (
  frame: number,
): {
  u0: number; u1: number; v0: number; v1: number;
  cu0: number; cu1: number; cv0: number; cv1: number;
} => {
  const base = baseTextures.get('forest-tileset');
  const img = base?.image as { width: number; height: number } | undefined;
  const cols = img ? img.width / 16 : 3;
  const rows = img ? img.height / 16 : 9;
  const col = frame % cols;
  const row = Math.floor(frame / cols);
  const u0 = col / cols;
  const u1 = (col + 1) / cols;
  const v0 = (rows - row - 1) / rows;
  const v1 = (rows - row) / rows;
  const hx = 0.5 / (img ? img.width : cols * 16);
  const hy = 0.5 / (img ? img.height : rows * 16);
  return {
    u0, u1, v0, v1,
    cu0: u0 + hx, cu1: u1 - hx, cv0: v0 + hy, cv1: v1 - hy,
  };
};

export const getBaseTexture3D = (key: string): THREE.Texture => {
  const base = baseTextures.get(key);
  if (!base) throw new Error(`textures3d: chave desconhecida '${key}'`);
  return base;
};
