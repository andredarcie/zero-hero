import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import {
  CHUNK_COLUMNS, CHUNK_ROWS, SEA_TILE_FRAME, SEA_TILE_FRAMES, SOLID_UPPER_FRAMES,
  TILESET_FRAME_SIZE, TIMINGS,
} from '@/game/constants';
import { getBridgeSpots, getChunkTerrain, getLavaTiles, getWaterTiles, getWorldBounds } from '@/game/world/WorldData';
import { profiler } from '@/game/debug/Profiler';
import { Billboard3D, type Billboard3DOptions } from './Billboard3D';
import {
  applyCast, CAST_MAX_ALPHA, castTransform, handoffCast, makeCastMesh, SolidCastField,
  WIDTH_FACTOR as CAST_WIDTH_FACTOR,
} from './CastShadow3D';
import { buildShadowBlobGeometry, makeShadowBlob, makeShadowBlobMaterial } from './groundShadow';
import { getDofIntensity } from '@/game/runtime/graphicsSettings';
import {
  FIRE_WOBBLE_GLSL, flowTimeUniform, lightCapUniform, lightResUniform, lightStepsUniform,
  lightWobbleUniform, patchPixelMaterial, syncTexelAaUniforms, texelAaUniform,
  type TexelAaUniforms,
} from './pixelArtLight';
import {
  frameFootPad, frameUvWindow, getBaseTexture3D, getTexture3D, registerTexture3D, tilesetFrameUv,
} from './textures3d';
import { getWoodTexture } from './woodTexture';

// The shapes every one-shot world FX is built from — a glowing dot (sparks, embers, motes), a
// hollow ring (impact shockwaves) and a soft puff (smoke). Registered as textures at init; spawn
// them with addBillboard.
//
// Dot and puff are the same picture but NOT the same data: a texture painted on a 2D canvas is
// stored PREMULTIPLIED (rgb = rgb × alpha), so its faint outskirts carry near-black colour. Under
// additive blending that is harmless (black adds nothing) — which is why the dot works. Under the
// normal blending smoke needs, that black is composited IN, and a pale puff comes out as a dark
// smudge on the ground. The puff is therefore built straight from pixel data (no canvas), with
// white rgb all the way out and only the alpha falling off.
export const FX_DOT_TEXTURE = 'fx-dot';
export const FX_RING_TEXTURE = 'fx-ring';
export const FX_PUFF_TEXTURE = 'fx-puff';
export const FX_CRACK_TEXTURE = 'fx-crack';

// ── The 3D world renderer (pixel-art lit) ─────────────────────────────────────
//
// Owns a Three.js canvas layered UNDER the (transparent) Phaser canvas and
// renders the whole authored world in true 3D:
//
//   · terrain: every chunk's ground + flat decor merged into single meshes,
//     UV-mapped into the same forest_tile_set.png the 2D game uses; solid
//     upper tiles (trees/walls) become one merged upright-billboard mesh,
//     each with the ambient ground ellipse that anchored them in 2D
//   · dynamic actors join through Billboard3D (Phaser-sprite-like adapter)
//   · campfires are REAL lights — warm point lights that flicker; one shared
//     "shadow light" snaps to the lit fire nearest the hero and its height bobs
//     with the flame, which is what makes the cast shadows breathe
//   · the hero carries a cool neutral glow; a lit torch adds a warm one
//
// SHADOWS ARE NOT SHADOW MAPS. `renderer.shadowMap.enabled` is false, on
// purpose: the ground shadows are 2D fakes — a soft contact blob under every
// standing thing (groundShadow.ts) plus a projected silhouette pointing away
// from the shadow light (CastShadow3D.ts), plus a faint MOON silhouette on a
// fixed heading so the forest keeps its depth between fires (statics bake into
// one static instanced draw; an actor's one shadow mesh swings from flame-cast
// to moon-cast at a pool's edge). They are cheaper, fully art-directed,
// and they hold the pixel look; a real shadow map fought all three. (The
// castShadow / customDepthMaterial flags left on the meshes are inert while the
// map is off — they are the door back to real shadows, not a live feature.)
//
// The LOOK is pixel art wrapped in an HD-2D finish: the world renders at
// 1/pixelScale resolution with NEAREST-filtered tile art (chunky pixels), the
// direct light quantizes into flat bands (a stepped SNES lantern — see
// pixelArtLight.ts) capped at the art's own colours. On top of the scene render
// sits a post chain ported from the 3D
// prototype: ACES filmic tone mapping, an UnrealBloom halo on every emissive
// (flames, lava, glows, coins), and a single FinishShader that does the
// diorama tilt-shift depth-of-field, vignette and film grain. A cool moon
// DirectionalLight fills the night against the warm fire pools, and additive
// Points give the air brasas (embers) and drifting dust. Every stage is
// live-tunable through window.hd3d.
//
// Phaser keeps running on top: game logic, input, canvas UI and DOM overlays.
// GameScene drives this renderer once per frame (render(dt)) and projects any
// remaining screen-space Phaser FX through projectTile().

// How far past the authored world to mesh the out-of-bounds filler (now open sea).
//
// ONE ring, measured. A second ring looked tempting (more ocean at the horizon) and cost ~9%
// more triangles — 53.1k vs 48.8k on main — which showed up as frame p50 6.9ms against main's
// 6.1ms. One ring instead comes in UNDER main at 40.2k, because the void used to carry an
// upright pine quad per tile (plus its blob and its cast shadow) and open water carries none.
// That is the whole trade: the border got cheaper by becoming flat.
const VOID_MARGIN_CHUNKS = 1;

/**
 * Which of the three sea paintings a given ocean tile wears. A cheap integer hash of the
 * coordinate — deterministic, so the same tile is the same variant on every boot, which is what
 * keeps the reference screenshots byte-identical between runs.
 */
const seaVariant = (x: number, z: number): number => {
  let h = (x * 73856093) ^ (z * 19349663);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % SEA_TILE_FRAMES.length;
};
// Cap on static-solid cast silhouettes drawn at once (trees near a lit fire).
const CAST_POOL_MAX = 72;
/**
 * How many real PointLights the scene keeps for fires. FIXED for the whole run, and
 * deliberately SMALL — a fire does not own a light, it BORROWS one.
 *
 * Two separate costs pull in the same direction here:
 *  · Changing the count mid-run makes three.js recompile every lit material in the world
 *    (an ~800ms freeze — this is what made burning a bush hitch). So it must be constant.
 *  · Every light in the scene is evaluated by every lit FRAGMENT, and our patched shader
 *    does a world-space snap + flame wobble per light. So each one is a permanent per-pixel
 *    tax, whether it is lit or sitting at intensity 0. Measured on this world: ~0.35ms of
 *    frame time per light. So the count must also be small.
 *
 * Each frame the pool is handed to the lit fires NEAREST the camera (see the fire loop).
 * A fire that misses out keeps its glow quad — the big additive halo on the ground, which
 * is what actually reads as "warm pool" — and only loses its 3D shading contribution, at a
 * distance where a range-limited point light was contributing almost nothing anyway.
 */
const FIRE_LIGHT_SLOTS = 8;
// How far a full-strength flame still counts as "lighting" a point, for lightLevelAt. Tiles.
const LIGHT_SAMPLE_REACH = 5.5;

// The axe-blow shudder of a standing TILE (see shakeSolidTile). Matched to DryTreeObject's chop
// recoil so both trees answer an axe the same way: ±7° for ~220ms. The lean is tan(7°) — the
// horizontal offset that tilting a one-tile-tall quad about its foot puts on its top corners.
const TILE_SHAKE_SECONDS = 0.22;
const TILE_SHAKE_CYCLES = 2;
const TILE_SHAKE_LEAN = 0.123;
// River tiles sit this far BELOW the ground plane — a sunken channel (dirt bed +
// dark banks) so the water reads as recessed, with depth. The bridge still spans it
// at ground level. WaterObject sets its surface just above the bed at this depth.
export const WATER_DEPTH_TILES = 0.42;
// Lava tiles sink into a well too, but a SHALLOWER one than the river — molten rock pools
// in a low basin, not a deep channel. Same treatment (dropped bed + dark charred banks), less
// deep. LavaObject sets its surface just above the bed at this depth.
export const LAVA_DEPTH_TILES = 0.16;
// The rustleable ground decor (low grass) — same frame the 2D board renderer tracked.
const LOW_GRASS_TILE = 0;
// Golden-amber firelight (~the 2D warm pool's tint). Keeping the green channel high
// stops the overdriven core from clipping into pure red on the brown ground art.
const FIRE_COLOR = '#ffc873';
// Real flame light shifts colour temperature as it dances: deep orange when the
// flame is low, paler gold at the peak of a flare (hotter = whiter). The live
// firelight lerps between these by its instantaneous brightness.
const FIRE_COOL = new THREE.Color(1.0, 0.5, 0.2);
const FIRE_HOT = new THREE.Color(1.0, 0.87, 0.62);
// The fire pool's AUTHORED colour ramp (the A Short Hike lesson: each light band is a
// colour a painter chose, not one colour darkened by math). Stops sampled from the
// flame sprite's own palette (#F1CC36 yellow core / #C83E3E red body): a pale-gold
// heart, a golden-orange mid band, an ember-red rim. Shared by every fire glow and the
// carried torch; live-tunable via window.hd3d.fireRampCore/Mid/Rim.
const fireRampCoreUniform: THREE.IUniform<THREE.Color> = { value: new THREE.Color('#ffe6a2') };
const fireRampMidUniform: THREE.IUniform<THREE.Color> = { value: new THREE.Color('#f9a04e') };
const fireRampRimUniform: THREE.IUniform<THREE.Color> = { value: new THREE.Color('#a34e2e') };
// The pool's own paint resolution, in texels per tile — COARSER than the art (8 = one
// light block per 2×2 art pixels, cleanly aligned to the art grid). This is A Short
// Hike's low-res trick applied to the light alone: the smooth authored gradient
// crunches into subtle chunky blocks while the frame and the sprites stay sharp.
// 2×2 approved live by the user; 4×4 was tried and read too coarse.
const fireGlowResUniform: THREE.IUniform = { value: 8 };

// Ambient particle counts (additive Points — brasas rising off the fire, dust in the air,
// fireflies drifting in lit clearings, low mist wisps veiling the dark ground).
/** A phone or tablet: a touch-first device, where fill rate is the scarce resource. */
const isHandheld = (): boolean => {
  try {
    return window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 1100;
  } catch {
    return false;
  }
};

// Baked AO: how dark a ground corner goes when all three tiles touching it are standing solids.
const AO_MAX = 0.5;

// Per-region colour grading (see updateBiomeGrade): the split-tone the frame is graded with in the
// woodland, and the one a lava basin drags it toward, plus how far the lava's influence reaches.
const BIOME_LAVA_RADIUS = 11; // tiles

// Tinted shadows, the A Short Hike way: the dark is a COLOUR (violet-blue), never just
// darker — it's what makes the fire pool's warmth read as warmth.
const GRADE_WOOD_SHADOW = new THREE.Vector3(0.88, 0.91, 1.14);
const GRADE_WOOD_HIGH = new THREE.Vector3(1.12, 1.02, 0.86); // warm amber highlights
const GRADE_LAVA_SHADOW = new THREE.Vector3(1.06, 0.92, 0.86); // even the dark runs warm here
const GRADE_LAVA_HIGH = new THREE.Vector3(1.20, 0.98, 0.72); // molten amber

// Fake god rays: a fan of tall additive quads leaning out of the nearest lit fire (see initGodRays).
const GODRAY_COUNT = 5;
const GODRAY_WIDTH = 0.42; // tiles — narrow, or the beams merge into one blob of glow
const GODRAY_HEIGHT = 3.4; // tiles — tall enough to cross the tree line around a clearing
const GODRAY_FAN = 1.15; // tiles between the outermost beams' feet
const GODRAY_LEAN = 1.05; // radians across the whole fan (the beams splay as they climb)

const EMBER_COUNT = 26;
const DUST_COUNT = 140;
const FIREFLY_COUNT = 20;
const MIST_COUNT = 48;

// Module-level handle so world object classes (props, NPCs, enemies, items)
// can create their billboards without threading the renderer everywhere.
let currentWorld3D: World3D | undefined;
export const setCurrentWorld3D = (w: World3D | undefined): void => { currentWorld3D = w; };
export const world3d = (): World3D => {
  if (!currentWorld3D) throw new Error('World3D nao inicializado (GameScene.create)');
  return currentWorld3D;
};

export interface FireLight3D {
  setLit(lit: boolean): void;
  setIntensityScale(s: number): void;
  readonly worldX: number;
  readonly worldY: number;
  destroy(): void;
}

/**
 * A lit BOX in the world (real prop geometry: bridge planks, posts…), skinned with
 * either a flat colour or a pixel-art texture (see woodTexture.ts).
 * Same Lambert + quantized/capped firelight as the merged terrain, so it belongs to
 * the diorama instead of reading as a foreign smooth-shaded object. Position is the
 * box CENTRE in tile coordinates; `elevation` is its centre height in tiles (0 =
 * ground plane). x/y/elevation/alpha/scaleY are plain properties so Phaser tweens
 * can drive them, exactly like Billboard3D.
 */
export interface Box3D {
  x: number;
  y: number;
  elevation: number;
  alpha: number;
  scaleY: number;
  setPosition(tileX: number, tileY: number): Box3D;
  setElevation(tiles: number): Box3D;
  setAlpha(a: number): Box3D;
  setVisible(v: boolean): Box3D;
  destroy(): void;
}

interface FireEntry {
  worldX: number;
  worldY: number;
  lit: boolean;
  scale: number;
  glow: THREE.Mesh; // the visible additive warm halo on the ground around the fire
  // Each fire computes its own flame every frame — brightness, colour and the dancing
  // source point — WITHOUT owning a THREE light. A pooled PointLight is then pointed at
  // whichever fires are nearest the camera (see FIRE_LIGHT_SLOTS). Keeping these here means
  // an unlit or far-off fire still costs nothing but arithmetic.
  intensity: number;
  lx: number; // jittered light position (world tiles)
  lz: number;
  color: THREE.Color;
  camDist: number; // distance to the camera target this frame (drives light assignment)
  flicker: number; // last frame's dance value (reused for the shadow-light height bob)
  level: number; // last frame's instantaneous brightness (~0.6 dim … 1.4 flaring)
  // Realistic-flicker state (see the fire loop in render()):
  seed: number; // fixed phase offset so no two fires flicker in sync
  noise: number; // smoothed random walk — the irregular jitter
  flare: number; // current log-pop flare level (eased toward flareTarget)
  flareTarget: number; // the flare being eased toward (a pop up, a dip, or calm)
  flareTimer: number; // seconds until the next flare/dip is rolled
}

export interface World3DParams {
  camHeight: number;
  camBack: number;
  fov: number;
  /**
   * CSS pixels per rendered pixel. 1 = full resolution (the 2D game's crispness —
   * the pixel-art look comes from the NEAREST-filtered 16px art itself, exactly as
   * before); raise it for a deliberately chunkier retro frame.
   */
  pixelScale: number;
  /**
   * Anti-alias the TILES' pixel grid: 1 = on (default), 0 = the raw NEAREST staircase.
   * The tile art stays crisp either way — only the seam between two texels changes. It is a
   * shader-side A/B of the whole effect (see pixelArtLight/TEXEL_AA_GLSL), so flipping it live
   * through window.hd3d.texelAa costs nothing and recompiles nothing.
   */
  texelAa: number;
  /** Retro light banding: ≥ 1 = that many flat brightness tiers; 0 = smooth (default). */
  lightSteps: number;
  /** Light texels per tile (0 = smooth per-pixel light). See pixelArtLight.lightResUniform. */
  lightRes: number;
  /** How far (tiles) the firelight's contours dent organically (0 = perfect circles). */
  lightWobble: number;
  /** How far direct light may push a surface past its art colour (fire pool brightness). */
  lightCap: number;
  ambient: number;
  fireIntensity: number;
  /** Campfire light reach (THREE distance, in tiles) and falloff exponent (decay).
   *  A big distance + low decay = the wide, smooth warm pool the 2D game had. */
  fireDist: number;
  fireDecay: number;
  /** The visible warm GLOW haze around a fire (the 2D game's cozy yellow halo):
   *  an additive radial sprite on the ground — size in tiles, strength = its opacity. */
  fireGlowSize: number;
  fireGlowStrength: number;
  /** The pool's authored band colours (the A Short Hike painted lighting ramp):
   *  hottest ring → outermost ring. */
  fireRampCore: string;
  fireRampMid: string;
  fireRampRim: string;
  /** The pool's paint resolution in texels/tile — coarser than the art on purpose
   *  (8 = 2×2-art-pixel blocks): the low-res firelight. 0 = smooth. */
  fireGlowRes: number;
  /** Height (tiles) of the shadow-casting fire light: HIGHER = shorter cast shadows
   *  (the 2D game had short shadows); low = long, raking, physically-fiery shadows. */
  shadowHeight: number;
  /** Firelight cast shadows (2D ground silhouettes): the flame's reach in tiles
   *  (past it an object throws no shadow) and the darkness right beside the flame. */
  castShadowRadius: number;
  castShadowAlpha: number;
  /**
   * Moonlight cast shadows — the directional counterpart of the fire silhouettes, so
   * the forest keeps its depth BETWEEN fires. Alpha is the darkness (0 = off); length
   * is in caster heights. The heading follows the moon light itself. Static solids
   * bake into one instanced draw (fillMoonCastField); each actor's single shadow mesh
   * swings from flame-cast to moon-cast at a fire pool's edge (handoffCast).
   */
  moonShadowAlpha: number;
  moonShadowLength: number;
  heroLight: number;
  fogDensity: number;
  /** Cool directional moonlight that fills the night (0 = off). */
  moon: number;
  /**
   * Tint of the ambient + moon fill. Kept NEAR-NEUTRAL so the sprites show their
   * own art colours (a strongly blue fill turned the trees' green teal — user
   * feedback). Push it bluer for a colder night, greyer for truer art colours.
   */
  ambientColor: string;
  moonColor: string;
  // ── HD-2D post chain (all live-tunable) ──
  /** ACES tone-mapping exposure. */
  exposure: number;
  /** Bloom halo strength / radius / luminance threshold. */
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  /** Tilt-shift: screen-Y (0 bottom … 1 top) of the sharp band, its half-height, and max blur px. */
  focusY: number;
  focusBand: number;
  dofBlur: number;
  /**
   * How much of that blur the FOREGROUND (below the hero's band) gets, as a fraction of the
   * background's: Octopath melts the distance and only softens the front, so this stays < 1.
   */
  dofNear: number;
  /** Vignette darkening at the corners (0 = off) and film-grain amount. */
  vignette: number;
  grain: number;
  /** Ambient particle brightness multipliers (0 = off): fireflies in lit clearings, low mist. */
  /** Fake god rays leaning out of the nearest lit fire (0 = off). */
  godRays: number;
  /** Idle handheld drift of the camera, in tiles (0 = a locked-off tripod). */
  camSway: number;
  fireflies: number;
  mist: number;
  /**
   * Cinematic grade (in the FinishShader): split-tone amount (cool shadows / warm
   * highlights, 0 = off), saturation (1 = unchanged) and contrast (1 = unchanged).
   */
  grade: number;
  saturation: number;
  contrast: number;
}

/** A flat dark ellipse on the ground (the hero's contact shadow). */
export interface GroundEllipse {
  setPosition(worldX: number, worldY: number): void;
  setVisible(v: boolean): void;
  destroy(): void;
}

interface GrassRustle {
  vertStart: number; // first vertex index of the quad in the decor geometry
  x: number;
  z: number;
  t: number; // 0..1 across the whole yoyo cycle
}

export class World3D {
  public readonly params: World3DParams = {
    camHeight: 8.4,
    camBack: 7.6,
    fov: 38,
    // The post chain (bloom at half res + the DoF/finish pass) roughly doubles the fill rate, and
    // fill is exactly what a phone GPU is short of. So a phone renders at half resolution and the
    // browser scales the frame back up with NEAREST — which the pixel-art look wants anyway, and
    // which costs a quarter of the fragments. Desktop keeps 1:1 — a half-res DESKTOP frame made
    // the whole game read jagged (user feedback: the ASH treatment belongs to the firelight only).
    pixelScale: isHandheld() ? 2 : 1,
    // A tile floor in perspective cannot land its 16px art on whole screen pixels, and NEAREST
    // answers that by breaking every straight run of texels into a ragged staircase that crawls
    // as the camera moves. This anti-aliases the texel seams analytically — same single texture
    // fetch, no extra pass. See pixelArtLight/TEXEL_AA_GLSL.
    texelAa: 1,
    // A Short Hike-style firelight (user: "pode seguir à risca a forma do Short Hike"):
    // the falloff is SMOOTH (0 = no banding) but painted by the authored colour ramp
    // (fireRamp*) and evaluated on the art's own pixel grid (lightRes) — like ASH, the
    // pixel look comes from RESOLUTION, not from quantised circles. Set ≥ 1 to band it
    // into flat retro tiers instead (the earlier "3 círculos" look; straight quantise —
    // a Bayer dither read as dirty stipple). Live via window.hd3d.lightSteps.
    lightSteps: 0,
    // The light is drawn on a grid of texels-per-tile, so a fire's pool comes out in blocks
    // instead of a silky HD gradient sliding under the art. It MUST match the tileset's own
    // resolution (TILESET_FRAME_SIZE = 16 px per tile): at 8 the light stepped on a grid twice
    // as coarse as the art, which read as a checkerboard laid OVER the pixels rather than as
    // pixel art. Now one light texel == one art pixel. 0 = smooth.
    lightRes: TILESET_FRAME_SIZE,
    // The tiers' edges dent and crawl (~±0.6 tiles) instead of drawing compass circles —
    // "faça mais como a vida real, luz imperfeita" (user feedback). See lightWobbleUniform.
    lightWobble: 1.2,
    // Cap on how far direct light pushes a surface past its art colour. Kept LOW so
    // white sprite pixels never overdrive into an absurd bloom glare (user feedback);
    // the warm fire POOL comes from the additive glow disc below, not from
    // over-brightening the art. Below ~ACES(1.55) stays under the bloom threshold.
    lightCap: 1.55,
    // Lifted from 4.0 (user: "faça o jogo ser menos escuro de modo geral") — the unlit
    // forest is now readable everywhere and the night mood comes from the cool tint and
    // the warm-vs-cold contrast, not from crushing the dark to near-black. The fire pool
    // (additive) still clearly owns its clearing.
    ambient: 8.5,
    fireIntensity: 265,
    // Wide, soft warm pool (the 2D game's cozy campfire glow): far reach, gentle falloff.
    fireDist: 32,
    fireDecay: 0.6,
    // The visible warm halo hovering over the fire — what actually makes it read as
    // THE light source (a PointLight alone only lights surfaces, so the fire looked
    // irrelevant; this additive glow is the 2D game's yellow campfire haze).
    fireGlowSize: 15,
    // Warm cozy pool like the 2D — NOT a blown-out white core. Kept modest after the
    // user found a stronger glow too bright vs the (dim, cozy) 2D reference.
    fireGlowStrength: 0.6,
    // Authored from the flame sprite's own palette (#F1CC36 / #C83E3E) and tuned live
    // against the night: the rim must melt into the dark as warm ember, not alarm red.
    fireRampCore: '#ffe6a2',
    fireRampMid: '#f9a04e',
    fireRampRim: '#a34e2e',
    // One light block per 2×2 art pixels — low-res painted light, aligned to the art
    // grid so it never reads as a foreign checkerboard (4×4 was tried: too coarse).
    fireGlowRes: 8,
    // Shadow-casting fire light height: a balance so objects near the fire cast a
    // SHORT but clearly VISIBLE shadow radiating away from it (like the 2D game) —
    // too high (~4.5) hid the shadows under the objects; ground-level threw long ones.
    shadowHeight: 2.2,
    // Cast shadows radiate ~this many tiles from a flame (the pool where the ground
    // is lit enough for a shadow to read), darkest beside it (see CastShadow3D.ts).
    castShadowRadius: 7.5,
    castShadowAlpha: CAST_MAX_ALPHA,
    // Faint and long: moonlight is a fill, not a spotlight. The shadow must GROUND a
    // tree — never compete with a fire's 0.6-dark breathing casts, and never crush the
    // (already dark) unlit forest floor. Length reads longer than the moon's real
    // elevation would throw, because the tilted camera foreshortens anything laid flat
    // (same reason the fire casts run 1.3–3.2×).
    moonShadowAlpha: 0.22,
    moonShadowLength: 2.1,
    // The hero's neutral self-glow is dim so that near a fire he takes the fire's
    // warm colour, and his white pixels (horns/eyes) don't glare under a bright glow.
    heroLight: 28,
    fogDensity: 0.02,
    // Raised with the ambient (see above) — a fuller moon for a brighter night.
    moon: 3.6,
    // Near-neutral (just a hint of cool) so tree-green etc. read as the art's own
    // colours instead of being tinted teal by a saturated blue night fill.
    ambientColor: '#b4b7c2',
    moonColor: '#97a0b4',
    exposure: 2.05,
    // Gentle bloom: the fire/lava glow softly (like the 2D) instead of glaring.
    bloomStrength: 0.3,
    bloomRadius: 0.65,
    // Threshold sits BETWEEN lit sprites (capped at ~ACES(lightCap) ≈ 0.8) and the
    // HDR emissives (flame/lava boosted past 1 → ~0.88+): the fire glows and blooms
    // while lit white sprite pixels stay just under it and never glare.
    bloomThreshold: 0.85,
    focusY: 0.52,
    focusBand: 0.16,
    dofBlur: 3.2,
    dofNear: 0.55,
    vignette: 0.16, // eased with the brighter night — 0.24 re-darkened the corners
    grain: 0.02,
    // Occasional twinkles near lit fires + a faint low haze — tuned live to sit
    // just under "noticeable" so they never wash the dark or read as floating orbs.
    godRays: 0.55,
    camSway: 0.022,
    fireflies: 3,
    mist: 2.2,
    // Gentle split-tone: enough for the warm/cold HD-2D feel, but low so it doesn't
    // repaint the sprites' own colours. Saturation lifted slightly so the art reads vivid.
    grade: 0.28,
    saturation: 1.18,
    contrast: 1.0,
  };

  public readonly scene = new THREE.Scene();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly ambientLight: THREE.AmbientLight;
  private readonly moonLight: THREE.DirectionalLight;
  private readonly shadowLight: THREE.PointLight;
  private heroLight?: THREE.PointLight;
  private torchLight?: THREE.PointLight;
  private torchGlow?: THREE.Mesh; // the carried flame's visible warm pool (like a fire's)
  // The carried torch is a MOBILE campfire: same reach, flicker and warm glow, riding
  // the hero. State set each frame by setTorchLight; driven (flicker) in updateTorch.
  private readonly torch = {
    x: 0, y: 0, strength: 0, level: 1,
    seed: Math.random() * Math.PI * 2, noise: 0, flare: 0, flareTarget: 0, flareTimer: 0,
  };

  // ── HD-2D post chain ──
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  private finishPass!: ShaderPass;
  private appliedFov = 0;
  private elapsed = 0;

  // ── ambient particles ──
  // Where the lava lies (for the per-region grade) and how molten the current frame reads, 0..1.
  private readonly lavaSpots: Array<{ x: number; y: number }> = [];
  private biomeHeat = 0;
  private readonly godRays: THREE.Mesh[] = [];
  private readonly godRaySeed: number[] = [];
  private embers!: ParticleField;
  private readonly emberState: EmberParticle[] = [];
  private dust!: ParticleField;
  private dustSeed!: Float32Array;
  private dustSeeded = false;
  private fireflies!: ParticleField;
  private fireflySeed!: Float32Array;
  private mist!: ParticleField;
  private mistSeed!: Float32Array;
  private atmosphereSeeded = false;
  private dotTexture?: THREE.CanvasTexture;

  private readonly fires: FireEntry[] = [];
  // The scene's fire PointLights: a fixed, small pool, aimed each frame at the lit fires
  // nearest the camera. Built once at construction — see FIRE_LIGHT_SLOTS.
  private readonly fireLights: THREE.PointLight[] = [];
  private activeFireLights = 0;
  // Glow quads are meshes, not lights: they can come and go freely (no recompile), so they
  // are pooled only to avoid churning geometry/materials as bushes burn.
  private readonly freeGlows: THREE.Mesh[] = [];
  // Rebuilt once per frame so the cast-shadow pass doesn't re-scan every fire (lit or
  // not, near or not) for every single caster.
  private readonly litFires: FireEntry[] = [];
  // Scratch for the per-frame light assignment (never reallocated).
  private readonly lightCandidates: FireEntry[] = [];
  private readonly camTarget = new THREE.Vector3();
  // Impact kick on the camera (see shake()): amplitude in tiles, decaying to zero.
  private shakeMs = 0;
  private shakeDurMs = 1;
  private shakeAmp = 0;
  private viewOffsetX = 0;
  private viewOffsetY = 0;
  private appliedPixelScale = 0;

  private readonly solidTiles: Array<{ x: number; z: number; frame: number }> = [];
  // Exposed solid tiles only (few solid neighbours — clearing edges / lone trees).
  // Deep-in-the-forest-wall tiles are excluded: their overlapping blobs/shadows would
  // merge into one dark block, so only these get a contact blob and cast a shadow.
  private readonly castableSolids: Array<{ x: number; z: number; frame: number }> = [];
  private decorGeo!: THREE.BufferGeometry;
  private readonly grassQuads = new Map<string, number>(); // "x,z" → vertex start
  private readonly activeRustles = new Map<string, GrassRustle>();
  /** Standing tiles mid-shudder from an axe blow — see shakeSolidTile. "x,z" → pose. */
  private readonly activeTileShakes = new Map<string, { vertStart: number; x: number; t: number }>();

  // ── felling a tree TILE (the steel axe) ──
  // The forest is terrain, not props: every standing tile is merged into ONE static mesh, and
  // that is the only reason 846 trees cost one draw call. So an axe that removes a tree cannot
  // remove an object — there is no object. It edits the merged buffers in place, collapsing the
  // four vertices of that one quad onto a point (a degenerate triangle rasterizes nothing). The
  // grass rustle already addressed a single baked quad this way (`grassQuads`); these are the
  // same trick applied to the three buffers a standing tile writes into: its upright quad, its
  // contact blob, and the ambient occlusion it casts on the ground around its feet.
  private solidGeo!: THREE.BufferGeometry;
  private groundGeo!: THREE.BufferGeometry;
  private blobGeo!: THREE.BufferGeometry;
  private readonly solidQuads = new Map<string, number>();     // "x,z" → vertex start
  private readonly solidBlobQuads = new Map<string, number>(); // "x,z" → vertex start
  private readonly groundQuads = new Map<string, number>();    // "x,z" → vertex start
  /** Live set of standing tiles — shrinks as trees fall, so re-baked AO sees the clearing. */
  private solidKeys = new Set<string>();

  // ── firelight cast shadows (2D ground silhouettes) ──
  // One persistent silhouette per dynamic caster (hero, props, NPCs, enemies)…
  private readonly castCasters: Array<{ bb: Billboard3D; mesh: THREE.Mesh }> = [];
  /** Invisible stand-ins that hold the runtime shaders' programs alive. See prewarmShaders. */
  private readonly warmups: Array<{ setVisible(v: boolean): unknown }> = [];
  private readonly projectScratch = new THREE.Vector3();
  // …and a reused pool for whichever static solid tiles are near a lit fire this frame.
  /** Every static solid's cast shadow, batched into one instanced draw. See SolidCastField. */
  private solidCastField!: SolidCastField;
  /** Every static solid's MOON shadow — filled once at build, the moon never moves. */
  private moonCastField!: SolidCastField;
  /** Ground heading a moon shadow points along (from the moon light's own position). */
  private moonCastRotY = 0;
  /** The knob values the moon field was last baked with; a live tune refills it. */
  private readonly appliedMoonShadow = { alpha: -1, length: -1 };

  public constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'world3d';
    // The canvas backing store is LOW resolution (see applyPixelScale); CSS stretches it
    // over the window and `pixelated` upscales with NEAREST — the chunky pixel-art frame.
    this.canvas.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;z-index:0;display:block;image-rendering:pixelated;';
    document.body.prepend(this.canvas);

    // NEAREST pixel art wants no MSAA (it would soften the tile edges), and the
    // post chain renders through offscreen targets where MSAA would be lost anyway.
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
    this.renderer.setPixelRatio(1);
    // Real shadow-maps are OFF: billboards face the camera, so a mapped shadow of
    // them is a thin sliver. Cast shadows are the 2D game's ground silhouettes,
    // laid down per object each frame (see CastShadow3D.ts / updateCastShadows).
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.params.exposure;
    // three.js clears info.render at the top of EVERY renderer.render(), and the post chain runs
    // a dozen of them per frame — so a profiler reading the counters afterwards sees only the
    // last fullscreen copy (1 call, 1 triangle) and reports that as the whole world. Take the
    // reset over ourselves, once per frame, and let the passes accumulate into one honest total.
    this.renderer.info.autoReset = false;
    this.applyPixelScale();

    this.scene.background = new THREE.Color('#070811');
    this.scene.fog = new THREE.FogExp2('#070811', this.params.fogDensity);

    this.camera = new THREE.PerspectiveCamera(
      this.params.fov, window.innerWidth / window.innerHeight, 0.1, 120,
    );
    this.appliedFov = this.params.fov;

    // The night floor: everything stays readable but sunk in dark. Near-neutral tint
    // (params.ambientColor) so sprites keep their own art colours.
    this.ambientLight = new THREE.AmbientLight(this.params.ambientColor, this.params.ambient);
    this.scene.add(this.ambientLight);

    // A moon that fills the night from the upper-left — the cold half of the HD-2D
    // warm/cold contrast, against which the fire pools read golden.
    this.moonLight = new THREE.DirectionalLight(this.params.moonColor, this.params.moon);
    this.moonLight.position.set(-6, 10, -4);
    this.scene.add(this.moonLight);
    // Where the moon throws a ground shadow: along the horizontal component of its
    // light's travel (target − position). Derived from the light so they cannot drift
    // apart — retune the moon's position and every shadow follows.
    const mx = -this.moonLight.position.x;
    const mz = -this.moonLight.position.z;
    const md = Math.hypot(mx, mz) || 1;
    this.moonCastRotY = Math.atan2(-mx / md, -mz / md);

    // Snapped each frame to the lit fire nearest the camera: it carries that fire's
    // intensity/colour so the clearing is lit from one warm point (the fires' own
    // lights are zeroed on the nearest). It no longer casts a shadow-map — the cast
    // shadows are the ground silhouettes below.
    this.shadowLight = new THREE.PointLight(FIRE_COLOR, 0, this.params.fireDist, this.params.fireDecay);
    this.scene.add(this.shadowLight);

    // Every light the scene will ever hold is born here. Nothing adds or removes one after
    // this point: the count is baked into every compiled shader (see FIRE_LIGHT_SLOTS), and
    // the hero/torch lights used to be created lazily — two more hidden recompiles, one of
    // them landing exactly when the player lit the torch.
    this.createFireLights();
    this.ensureHeroLight();
    this.ensureTorchLight();

    this.buildTerrain();
    this.initPostProcessing();
    this.initParticles();
    this.initGodRays();

    window.addEventListener('resize', this.handleResize);
  }

  // ── HD-2D post-processing chain ───────────────────────────────────────────────

  private renderSize(): { w: number; h: number } {
    const ps = Math.max(1, Math.round(this.params.pixelScale));
    return {
      w: Math.max(1, Math.floor(window.innerWidth / ps)),
      h: Math.max(1, Math.floor(window.innerHeight / ps)),
    };
  }

  /**
   * Build the post chain (ported from src/prototype3d/main.ts):
   *   scene → bloom (emissive halo) → FinishShader (tilt-shift DoF + vignette + grain).
   * Everything runs at the low render resolution, so the NEAREST upscale still
   * gives the chunky pixel-art frame.
   */
  private initPostProcessing(): void {
    const { w, h } = this.renderSize();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w, h),
      this.params.bloomStrength,
      this.params.bloomRadius,
      this.params.bloomThreshold,
    );
    this.composer.addPass(this.bloomPass);

    this.finishPass = new ShaderPass(makeFinishShader(w, h));
    this.composer.addPass(this.finishPass);
    this.syncFinishUniforms();
  }

  /** Push the live post knobs into the shader/pass uniforms. */
  private syncFinishUniforms(): void {
    this.renderer.toneMappingExposure = this.params.exposure;
    this.bloomPass.strength = this.params.bloomStrength;
    this.bloomPass.radius = this.params.bloomRadius;
    this.bloomPass.threshold = this.params.bloomThreshold;
    const u = this.finishPass.uniforms;
    u.uFocusY.value = this.params.focusY;
    u.uBand.value = this.params.focusBand;
    // The player's accessibility setting scales the authored blur (0 = a crisp diorama).
    u.uBlur.value = this.params.dofBlur * getDofIntensity();
    u.uNear.value = this.params.dofNear;
    u.uVignette.value = this.params.vignette;
    u.uGrain.value = this.params.grain;
    u.uGrade.value = this.params.grade;
    u.uSaturation.value = this.params.saturation;
    u.uContrast.value = this.params.contrast;
  }

  // ── ambient particles (embers + dust) ─────────────────────────────────────────

  /**
   * God rays, the cheap Octopath way: no volumetrics, just a fan of tall additive quads leaning
   * out of the nearest LIT fire, crossing the trees around the clearing. They breathe with the
   * flame that casts them and feed the bloom, so the light in the air reads as light in the air.
   * Unlit world = no shafts, which keeps them tied to the fantasy: fire is what carves the dark.
   */
  private initGodRays(): void {
    const tex = makeShaftTexture();
    for (let i = 0; i < GODRAY_COUNT; i++) {
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.translate(0, 0.5, 0); // pivots at the fire's foot, so a lean swings the beam's top
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        opacity: 0,
      });
      mat.color.copy(FIRE_HOT);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 2; // over the ground glow, under nothing that matters
      this.scene.add(mesh);
      this.godRays.push(mesh);
      this.godRaySeed.push(Math.random() * Math.PI * 2);
    }
  }

  /**
   * Colour grading per REGION: the woodland is graded cool (blue shadows, faintly amber
   * highlights); a lava field bathes the whole frame in heat. "Where am I" is measured from the
   * ground itself — how much lava lies around the camera — and the tint eases between the two, so
   * walking into a molten basin warms the picture over a few steps instead of cutting to it.
   */
  private updateBiomeGrade(dt: number): void {
    let nearLava = 0;
    for (const p of this.lavaSpots) {
      const d = Math.hypot(p.x - this.camTarget.x, p.y - this.camTarget.z);
      if (d < BIOME_LAVA_RADIUS) nearLava = Math.max(nearLava, 1 - d / BIOME_LAVA_RADIUS);
    }
    // Ease toward the region's grade (a few tenths of a second), never snap.
    this.biomeHeat += (nearLava - this.biomeHeat) * Math.min(1, dt * 1.6);

    const u = this.finishPass.uniforms;
    (u.uShadowTint.value as THREE.Vector3)
      .copy(GRADE_WOOD_SHADOW).lerp(GRADE_LAVA_SHADOW, this.biomeHeat);
    (u.uHighTint.value as THREE.Vector3)
      .copy(GRADE_WOOD_HIGH).lerp(GRADE_LAVA_HIGH, this.biomeHeat);
  }

  private updateGodRays(fire: FireEntry | null): void {
    const strength = this.params.godRays;
    for (let i = 0; i < this.godRays.length; i++) {
      const mesh = this.godRays[i];
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (!fire || strength <= 0) {
        mesh.visible = false;
        continue;
      }
      const seed = this.godRaySeed[i];
      const t = this.elapsed;
      // Fan the beams out around the flame, each leaning a little further than the last.
      const spread = (i / Math.max(1, GODRAY_COUNT - 1)) - 0.5; // -0.5 … 0.5
      const lean = spread * GODRAY_LEAN + Math.sin(t * 0.35 + seed) * 0.04; // slow breathing sway
      mesh.position.set(
        fire.worldX + spread * GODRAY_FAN,
        0.12,
        fire.worldY + Math.cos(seed) * 0.12,
      );
      mesh.rotation.z = lean;
      // The middle beams stand tallest; the outer ones are stubbier, so the fan has a silhouette.
      const height = GODRAY_HEIGHT * (0.62 + 0.76 * (0.5 - Math.abs(spread)));
      mesh.scale.set(GODRAY_WIDTH * fire.scale, height * fire.scale, 1);
      // The shafts ARE the flame's light: they swell and gutter with it, and die when it dies.
      const breath = 0.75 + 0.25 * Math.sin(t * 1.7 + seed * 2.1);
      mat.opacity = strength * 0.5 * fire.level * breath * (fire.lit ? 1 : 0);
      mesh.visible = mat.opacity > 0.004;
    }
  }

  private initParticles(): void {
    const dot = makeSoftDotTexture();
    this.dotTexture = dot;
    // The same two shapes every one-shot FX is built from (sparks, puffs, motes, shockwaves).
    // Published to the texture registry so they spawn as ordinary billboards — a hit spark is
    // a sprite in the world now, not a rectangle drawn over it.
    registerTexture3D(FX_DOT_TEXTURE, dot);
    registerTexture3D(FX_RING_TEXTURE, makeRingTexture());
    registerTexture3D(FX_PUFF_TEXTURE, makePuffTexture());
    registerTexture3D(FX_CRACK_TEXTURE, makeCrackTexture());
    this.embers = makeParticleField(this.scene, EMBER_COUNT, 0.12, dot);
    for (let i = 0; i < EMBER_COUNT; i++) {
      this.emberState.push({ life: Math.random(), maxLife: 0.9 + Math.random() * 0.9, vx: 0, vy: 0, vz: 0 });
    }
    this.dust = makeParticleField(this.scene, DUST_COUNT, 0.06, dot);
    this.dustSeed = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i++) {
      this.dust.pos[i * 3 + 1] = 0.2 + Math.random() * 2.4;
      this.dustSeed[i] = Math.random() * Math.PI * 2;
    }
    // Fireflies: bigger, brighter motes that hover knee-to-head high; they light up
    // only in the glow of a lit fire (a reward for lighting the world).
    this.fireflies = makeParticleField(this.scene, FIREFLY_COUNT, 0.16, dot);
    this.fireflySeed = new Float32Array(FIREFLY_COUNT);
    for (let i = 0; i < FIREFLY_COUNT; i++) this.fireflySeed[i] = Math.random() * Math.PI * 2;
    // Mist: many large, dim, cool wisps clinging low to the ground in the dark.
    this.mist = makeParticleField(this.scene, MIST_COUNT, 1.6, dot);
    this.mistSeed = new Float32Array(MIST_COUNT);
    for (let i = 0; i < MIST_COUNT; i++) this.mistSeed[i] = Math.random() * Math.PI * 2;
  }

  /** Resize the low-res backing store to the current window / pixelScale. */
  private applyPixelScale(): void {
    const ps = Math.max(1, Math.round(this.params.pixelScale));
    this.appliedPixelScale = ps;
    const w = Math.max(1, Math.floor(window.innerWidth / ps));
    const h = Math.max(1, Math.floor(window.innerHeight / ps));
    this.renderer.setSize(w, h, false); // CSS size stays 100% — the browser does the NEAREST upscale
    // The post chain's offscreen targets must track the render resolution too.
    if (this.composer) {
      this.composer.setSize(w, h);
      this.bloomPass.setSize(w, h);
      (this.finishPass.uniforms.uResolution.value as THREE.Vector2).set(w, h);
    }
  }

  // ── static terrain ───────────────────────────────────────────────────────────

  private buildTerrain(): void {
    const b = getWorldBounds();
    // River tiles (plain water + buildable bridge spots) sink into a channel below the
    // ground: their ground quad drops to the bed level and gets dark banks around it.
    const waterSet = new Set<string>(
      [...getWaterTiles(), ...getBridgeSpots()].map((p) => `${p.worldX},${p.worldY}`),
    );
    // Lava tiles sink into their own (shallower) basin, the same way water tiles do.
    const lavaSet = new Set<string>(getLavaTiles().map((p) => `${p.worldX},${p.worldY}`));
    // The SEA (the world's border, and any ocean painted inside it) is a ground FRAME, not a
    // prop — there is no WaterObject for ~11k tiles. It still has to read as water rather than
    // as blue floor, so it borrows the river's whole treatment: the same sunken bed and the
    // same earthen banks where it meets the land. Those banks ARE the coastline.
    const seaSet = new Set<string>();
    const groundTiles: Array<{ x: number; z: number; frame: number }> = [];
    const bedTiles: Array<{ x: number; z: number; frame: number }> = [];
    const lavaBedTiles: Array<{ x: number; z: number; frame: number }> = [];
    const decorTiles: Array<{ x: number; z: number; frame: number }> = [];

    for (let cy = b.minCy - VOID_MARGIN_CHUNKS; cy <= b.maxCy + VOID_MARGIN_CHUNKS; cy++) {
      for (let cx = b.minCx - VOID_MARGIN_CHUNKS; cx <= b.maxCx + VOID_MARGIN_CHUNKS; cx++) {
        const chunk = getChunkTerrain(cx, cy); // void filler outside the authored world
        for (let row = 0; row < CHUNK_ROWS; row++) {
          for (let col = 0; col < CHUNK_COLUMNS; col++) {
            const wx = cx * CHUNK_COLUMNS + col;
            const wy = cy * CHUNK_ROWS + row;
            const tile = { x: wx, z: wy, frame: chunk.ground[row][col] };
            const tk = `${wx},${wy}`;
            if (tile.frame === SEA_TILE_FRAME) {
              seaSet.add(tk);
              // Break the tiling: one frame repeated across ~11k tiles reads as a grid, not as
              // water. The variant is chosen from the coordinate (never random) so the ocean is
              // identical on every boot — visual-ref diffs to 0 pixels, and three.js's shared
              // Math.random stream stays untouched (see the visual-ref trap in CLAUDE.md).
              tile.frame = SEA_TILE_FRAMES[seaVariant(wx, wy)];
              bedTiles.push(tile);
            }
            else if (waterSet.has(tk)) bedTiles.push(tile);
            else if (lavaSet.has(tk)) lavaBedTiles.push(tile);
            else groundTiles.push(tile);
            const upper = chunk.upper[row][col];
            if (upper === null) continue;
            if (chunk.collisions[row][col] || SOLID_UPPER_FRAMES.has(upper)) {
              this.solidTiles.push({ x: wx, z: wy, frame: upper });
            } else {
              decorTiles.push({ x: wx, z: wy, frame: upper });
            }
          }
        }
      }
    }

    // Where the standing tiles are, so the ground can bake an ambient-occlusion corner shade
    // under them (see buildFlatTileGeometry).
    const solidSet = new Set(this.solidTiles.map((t) => `${t.x},${t.z}`));
    this.solidKeys = solidSet; // kept live: felling a tree deletes from it, so re-baked AO agrees
    // The lava field, for the per-region grade (updateBiomeGrade).
    for (const l of getLavaTiles()) this.lavaSpots.push({ x: l.worldX, y: l.worldY });

    const tileset = getBaseTexture3D('forest-tileset');
    // Every tile mesh samples the one atlas, so they share the one size uniform. No `bounds` here:
    // each mesh merges thousands of quads, each windowing onto its own frame, so the frame travels
    // per vertex (aUvBounds) instead. See pixelArtLight/TEXEL_AA_GLSL.
    const tileAa: TexelAaUniforms = { size: { value: new THREE.Vector2() } };
    syncTexelAaUniforms(tileAa, tileset); // the sheet's pixel size; every base texture is loaded by now
    const groundMat = new THREE.MeshLambertMaterial({ map: tileset, vertexColors: true });
    patchPixelMaterial(groundMat, { quantize: true, texelAa: tileAa });
    this.groundGeo = buildFlatTileGeometry(groundTiles, 0, solidSet);
    const ground = new THREE.Mesh(this.groundGeo, groundMat);
    this.scene.add(ground);
    groundTiles.forEach((tile, i) => this.groundQuads.set(`${tile.x},${tile.z}`, i * 4));

    // The sunken riverbed (the same dirt, dropped a level) + the dark earthen banks that
    // wall the channel where it meets the land — together they give the water its depth.
    if (bedTiles.length > 0) {
      const bed = new THREE.Mesh(buildFlatTileGeometry(bedTiles, -WATER_DEPTH_TILES, solidSet), groundMat);
      this.scene.add(bed);
      const bankMat = new THREE.MeshLambertMaterial({ color: 0x2a2016, side: THREE.DoubleSide });
      patchPixelMaterial(bankMat, { quantize: true });
      const sunken = seaSet.size > 0 ? new Set([...waterSet, ...seaSet]) : waterSet;
      this.scene.add(new THREE.Mesh(buildBankGeometry(sunken, bedTiles, WATER_DEPTH_TILES), bankMat));
    }

    // The lava basin: the same recipe, shallower — a dropped bed to close the well's bottom and
    // dark CHARRED banks (near-black basalt) walling it where the melt meets the land.
    if (lavaBedTiles.length > 0) {
      const lavaBed = new THREE.Mesh(buildFlatTileGeometry(lavaBedTiles, -LAVA_DEPTH_TILES, solidSet), groundMat);
      this.scene.add(lavaBed);
      const lavaBankMat = new THREE.MeshLambertMaterial({ color: 0x1a1008, side: THREE.DoubleSide });
      patchPixelMaterial(lavaBankMat, { quantize: true });
      this.scene.add(new THREE.Mesh(buildBankGeometry(lavaSet, lavaBedTiles, LAVA_DEPTH_TILES), lavaBankMat));
    }

    // depthWrite MUST stay false: this flat decor sits at y=0.02, just above the
    // ground-level cast shadows/blobs. If it wrote depth it would occlude those
    // shadows in tile-shaped patches wherever decor grows (dense around fires) —
    // the "invisible square blocks eating the shadow" (user feedback). Flat ground
    // cover never needs to occlude anything, so it simply doesn't write depth.
    const decorMat = new THREE.MeshLambertMaterial({
      map: tileset, transparent: true, alphaTest: 0.35, depthWrite: false, vertexColors: true,
    });
    patchPixelMaterial(decorMat, { quantize: true, texelAa: tileAa });
    this.decorGeo = buildFlatTileGeometry(decorTiles, 0.02, solidSet);
    const decor = new THREE.Mesh(this.decorGeo, decorMat);
    this.scene.add(decor);
    decorTiles.forEach((tile, i) => {
      if (tile.frame === LOW_GRASS_TILE) this.grassQuads.set(`${tile.x},${tile.z}`, i * 4);
    });

    // All standing trees/walls merged into ONE upright mesh (one draw call, one shadow).
    // Lit like the ground at their feet — same treatment the dynamic billboards get.
    const solidMat = new THREE.MeshLambertMaterial({ map: tileset, alphaTest: 0.5 });
    patchPixelMaterial(solidMat, { quantize: true, normalUp: true, texelAa: tileAa });
    this.solidGeo = buildUprightTileGeometry(this.solidTiles);
    this.solidTiles.forEach((tile, i) => this.solidQuads.set(`${tile.x},${tile.z}`, i * 4));
    const solids = new THREE.Mesh(this.solidGeo, solidMat);
    solids.castShadow = true;
    solids.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking, map: tileset, alphaTest: 0.5,
    });
    this.scene.add(solids);

    // Only EXPOSED solids (clearing edges, lone trees) get a grounding blob and cast a
    // shadow. A tile buried in the forest wall has ~all 8 neighbours solid; giving each
    // one a blob/shadow merges them into a dark block hugging the wall (user feedback),
    // and a packed tree reads as a mass anyway. Keep the ones with open space around them.
    for (const t of this.solidTiles) {
      let neighbours = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dz) && solidSet.has(`${t.x + dx},${t.z + dz}`)) neighbours++;
        }
      }
      if (neighbours <= 4) this.castableSolids.push(t);
    }

    // The soft ambient ground blob each obstacle had in 2D ("anchors lifted obstacles so
    // they read as standing up") — merged into one mesh, all sharing the soft blob texture.
    // A touch of forward (+z, toward camera) bias peeks the blob out at the tree's foot.
    this.blobGeo = buildShadowBlobGeometry(
      this.castableSolids.map((t) => ({ x: t.x, z: t.z + 0.06 })), 0.46, 0.42,
    );
    this.castableSolids.forEach((tile, i) => this.solidBlobQuads.set(`${tile.x},${tile.z}`, i * 4));
    const ellipses = new THREE.Mesh(this.blobGeo, makeShadowBlobMaterial(0.34));
    ellipses.renderOrder = 3; // after the additive fire glow, so the blob isn't washed out
    this.scene.add(ellipses);

    // …and the firelight shadow each of them THROWS, all of it in one draw. It used to be one mesh
    // per solid — 36 of the frame's 120 draw calls, and with them the bulk of its garbage, since
    // three allocates inside its uniform setters and the GC bill tracks the draw count.
    this.solidCastField = new SolidCastField(CAST_POOL_MAX, getBaseTexture3D('forest-tileset'));
    this.scene.add(this.solidCastField.mesh);

    // …and the MOON shadow each of them throws, likewise one draw — but this one is baked
    // ONCE, not refilled per frame: the moon never moves, so neither do these. Sized to hold
    // every castable solid in the world; only the on-screen fragments cost anything.
    this.moonCastField = new SolidCastField(
      Math.max(1, this.castableSolids.length), getBaseTexture3D('forest-tileset'),
    );
    this.scene.add(this.moonCastField.mesh);
    this.fillMoonCastField();
  }

  /**
   * Bake every exposed solid's moonlight shadow into its instanced field — once, and again
   * only when the hd3d knobs move. Unlike the fire casts these transforms are constant.
   *
   * end() wants a camera to sort back-to-front (overlapping fog-tinted blacks blend
   * order-dependently — see SolidCastField), but the game camera only ever TRANSLATES:
   * its view direction is fixed, so view depth is simply "north is far" for the whole
   * run, and a virtual camera far to the south bakes the correct order for every frame.
   */
  private fillMoonCastField(): void {
    const alpha = this.params.moonShadowAlpha;
    const length = this.params.moonShadowLength;
    const field = this.moonCastField;
    field.begin();
    if (alpha > 0.02) {
      for (const tile of this.castableSolids) {
        field.add(
          tile.x, tile.z, frameUvWindow('forest-tileset', tile.frame),
          CAST_WIDTH_FACTOR, length, this.moonCastRotY, alpha,
          frameFootPad('forest-tileset', tile.frame),
        );
      }
    }
    field.end(0, 1e6);
    this.appliedMoonShadow.alpha = alpha;
    this.appliedMoonShadow.length = length;
  }

  /**
   * Take one standing tile out of the world — the steel axe felling a tree that is terrain
   * rather than a prop. Everything a solid tile contributes is baked into a merged buffer at
   * boot, so this un-bakes it in place instead of rebuilding anything:
   *
   *   1. its upright quad in the one solids mesh  → collapsed to a point (draws nothing);
   *   2. its contact blob in the one blob mesh    → same;
   *   3. the ambient occlusion it printed on the ground around its feet → re-baked from the
   *      live solid set, or the clearing keeps the shadow of a tree that is no longer there;
   *   4. its firelight cast (refilled per frame from castableSolids) → drop it from that list;
   *   5. its moon cast (baked once) → re-bake, which is why this is not free.
   *
   * Collapsing rather than rebuilding matters: the solids mesh holds ~6000 quads (the forest
   * plus the void ring), and reallocating that buffer per swing would hitch. Caller must also
   * clear the tile in the chunk data — collision lives there, not here.
   */
  /**
   * Repaint one standing tile with a different atlas frame, in place — a tree dropping to the
   * next chop stage. Same reasoning as removeSolidTile: the tile is four vertices inside a
   * merged buffer, so this rewrites their `uv` and `aUvBounds` rather than rebuilding anything.
   * (`aUvBounds` is not optional. It is the window the texel-AA fetch may sample from; leaving
   * it on the old frame lets the filter slide into the neighbouring tile's art.)
   *
   * The cast-shadow fields sample the atlas too, so the silhouette this tile throws has to
   * follow it down — otherwise a stump keeps casting the shadow of a whole tree.
   */
  public setSolidTileFrame(worldX: number, worldY: number, frame: number): void {
    const key = `${worldX},${worldY}`;
    const vertStart = this.solidQuads.get(key);
    if (vertStart === undefined) return;

    const f = tilesetFrameUv(frame);
    const uv = this.solidGeo.attributes.uv as THREE.BufferAttribute;
    const bounds = this.solidGeo.attributes.aUvBounds as THREE.BufferAttribute;
    // Corner order must match buildUprightTileGeometry exactly.
    uv.setXY(vertStart, f.u0, f.v1);
    uv.setXY(vertStart + 1, f.u1, f.v1);
    uv.setXY(vertStart + 2, f.u1, f.v0);
    uv.setXY(vertStart + 3, f.u0, f.v0);
    uv.needsUpdate = true;
    for (let i = 0; i < 4; i++) bounds.setXYZW(vertStart + i, f.cu0, f.cv0, f.cu1, f.cv1);
    bounds.needsUpdate = true;

    const cast = this.castableSolids.find((t) => t.x === worldX && t.z === worldY);
    if (cast) {
      cast.frame = frame;
      this.fillMoonCastField(); // baked once, so it has to be re-baked to see the new frame
    }
  }

  public removeSolidTile(worldX: number, worldY: number): void {
    const key = `${worldX},${worldY}`;
    const vertStart = this.solidQuads.get(key);
    if (vertStart === undefined) return; // not a standing tile, or already felled
    this.solidQuads.delete(key);
    this.solidKeys.delete(key);
    collapseQuad(this.solidGeo, vertStart);

    const blobStart = this.solidBlobQuads.get(key);
    if (blobStart !== undefined) {
      this.solidBlobQuads.delete(key);
      collapseQuad(this.blobGeo, blobStart);
    }

    // Re-bake the AO of the 3x3 around the stump: the felled tile darkened its neighbours'
    // corners, and each of those corners is a vertex colour on a DIFFERENT quad.
    const colour = this.groundGeo.attributes.color as THREE.BufferAttribute;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = worldX + dx;
        const nz = worldY + dz;
        const start = this.groundQuads.get(`${nx},${nz}`);
        if (start === undefined) continue; // a riverbed/lava quad — its own mesh, no AO to fix
        tileAoCorners(nx, nz, this.solidKeys).forEach((shade, c) => {
          colour.setXYZ(start + c, shade, shade, shade);
        });
      }
    }
    colour.needsUpdate = true;

    const castIndex = this.castableSolids.findIndex((t) => t.x === worldX && t.z === worldY);
    if (castIndex >= 0) {
      this.castableSolids.splice(castIndex, 1);
      // The blob/solid quad maps index the GEOMETRY, which never shrinks, so this splice
      // cannot invalidate them. Only the two cast fields read this array.
      this.fillMoonCastField();
    }
  }

  // ── dynamic actors ───────────────────────────────────────────────────────────

  public addBillboard(texKey: string, frame = 0, opts: Billboard3DOptions = {}): Billboard3D {
    const bb = new Billboard3D(this.scene, texKey, frame, opts);
    // Standing objects (a contact blob, or an explicit request) also throw a
    // firelight cast shadow — a ground silhouette driven each frame in render().
    // `castGroundShadow: false` opts OUT even with a blob: a FLOATING part (the robotic arm's
    // claw) keeps its contact blob, but the per-sprite silhouette assumes the caster STANDS at
    // its tile — for a part in the air the streak sprouts from the wrong place, and the owner
    // draws a projected silhouette of its own (see groundCastAt).
    if (
      (opts.groundShadow || opts.castGroundShadow) && opts.castGroundShadow !== false
      && !opts.flat && !opts.additive && !opts.emissive
    ) {
      const mesh = makeCastMesh();
      this.scene.add(mesh);
      this.castCasters.push({ bb, mesh });
    }
    return bb;
  }

  /**
   * The ground-shadow projection at (x, z), for objects that must cast their OWN silhouette
   * (an articulated machine whose parts float between joints — no sprite stands at any tile,
   * so the per-billboard cast is unusable). Returns the same stylization every standing prop
   * uses — nearest lit flame with the moon handoff at the pool's edge (castTransform /
   * handoffCast) — reduced to what a projector needs: the ground DIRECTION the shadow runs
   * along, how far one tile of height lands along it (`unitLen`), and the darkness. A world
   * point at elevation e therefore shadows at `plan(P) + dir · e · unitLen` — which is exactly
   * where the standing sprites' stretched silhouettes put their pixels, so a projected chain
   * GROWS OUT of its base's own cast shadow instead of contradicting it.
   */
  public groundCastAt(x: number, z: number): { dirX: number; dirZ: number; unitLen: number; alpha: number } | null {
    const radius = Math.max(0.5, this.params.castShadowRadius);
    // Same rule as the actors: standing on a lit fire tile has no stable heading.
    const fire = this.onLitFireTile(x, z) ? null : this.nearestLitFire(x, z);
    const fireCast = fire
      ? castTransform(x, z, 1, fire.worldX, fire.worldY, fire.level, radius, this.params.castShadowAlpha)
      : null;
    const cast = handoffCast(fireCast, this.moonCastRotY, this.params.moonShadowLength, this.params.moonShadowAlpha);
    if (!cast) return null;
    // The heading is stored as a quad rotation (head along -Z); the ground vector is its image.
    return { dirX: -Math.sin(cast.rotY), dirZ: -Math.cos(cast.rotY), unitLen: cast.length, alpha: cast.alpha };
  }

  /**
   * How LIT a world point is: 0 = moonlight only, 1 = standing in a flame.
   *
   * This exists for the 2D overlay, which is drawn on the Phaser canvas ABOVE the 3D world and
   * therefore receives none of its lighting, none of its tone mapping and none of the night
   * grade. The swing arc is the last world object still living there, and unlit it renders at
   * FULL art brightness over a night-dark world — which is why the steel axe, whose palette is
   * light greys and bone, swung like a lightbulb while the hero holding it was in shadow.
   *
   * A cheap STAND-IN for the shader, deliberately not a second copy of it: the nearest lit flame
   * (the same `litFires` set the cast shadows rank each frame, plus the carried torch) with a
   * linear falloff. It only has to land the sprite in the same value range as the hero swinging
   * it — anything more faithful would be a second lighting model to keep in sync.
   */
  public lightLevelAt(x: number, y: number): number {
    let best = 0;
    const consider = (fx: number, fy: number, level: number): void => {
      const reach = LIGHT_SAMPLE_REACH * Math.max(0.2, level);
      const d = Math.hypot(fx - x, fy - y);
      best = Math.max(best, 1 - Math.min(1, d / reach));
    };
    for (const f of this.litFires) consider(f.worldX, f.worldY, f.level);
    // The torch is the one light that rides the hero, so it is the one that most often decides
    // how a swing of his should read.
    if (this.torch.strength > 0.15) consider(this.torch.x, this.torch.y, this.torch.level);
    return best;
  }

  /**
   * A soft dark contact blob on the ground (the 2D grounding ellipse). Radii in
   * tiles — keep them near-equal for a round blob; the camera tilt foreshortens
   * it into a natural ground ellipse.
   */
  public addGroundEllipse(rx: number, rz: number, alpha: number): GroundEllipse {
    const mesh = makeShadowBlob(rx, rz, alpha);
    this.scene.add(mesh);
    return {
      setPosition: (worldX, worldY) => { mesh.position.set(worldX, mesh.position.y, worldY); },
      setVisible: (v) => { mesh.visible = v; },
      destroy: () => {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      },
    };
  }

  /** See Box3D. Size is in tiles (sizeH = height/thickness); skin is a flat colour or a
   *  pixel-art texture (the bridge's wood grain — see woodTexture.ts). */
  public addBox(sizeX: number, sizeH: number, sizeZ: number, skin: number | THREE.Texture): Box3D {
    const geo = new THREE.BoxGeometry(sizeX, sizeH, sizeZ);
    // transparent stays on even at alpha 1 so ghost previews and solid props share a material
    // shape (toggling `transparent` at runtime would force a shader recompile).
    const mat = new THREE.MeshLambertMaterial(
      typeof skin === 'number' ? { color: skin, transparent: true } : { map: skin, transparent: true },
    );
    patchPixelMaterial(mat, { quantize: true });
    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);

    const state = { x: 0, y: 0, elev: 0, alpha: 1, scaleY: 1, visible: true };
    const apply = (): void => {
      mesh.position.set(state.x, state.elev, state.y);
      mesh.scale.y = state.scaleY;
      mat.opacity = state.alpha;
      mesh.visible = state.visible && state.alpha > 0.004;
    };
    apply();

    const box: Box3D = {
      get x() { return state.x; },
      set x(v: number) { state.x = v; apply(); },
      get y() { return state.y; },
      set y(v: number) { state.y = v; apply(); },
      get elevation() { return state.elev; },
      set elevation(v: number) { state.elev = v; apply(); },
      get alpha() { return state.alpha; },
      set alpha(v: number) { state.alpha = v; apply(); },
      get scaleY() { return state.scaleY; },
      set scaleY(v: number) { state.scaleY = v; apply(); },
      setPosition(tileX: number, tileY: number) { state.x = tileX; state.y = tileY; apply(); return box; },
      setElevation(tiles: number) { state.elev = tiles; apply(); return box; },
      setAlpha(a: number) { state.alpha = a; apply(); return box; },
      setVisible(v: boolean) { state.visible = v; apply(); return box; },
      destroy: () => {
        this.scene.remove(mesh);
        geo.dispose();
        mat.dispose();
      },
    };
    return box;
  }

  // ── fire lights ──────────────────────────────────────────────────────────────

  /**
   * The scene's fire PointLights, built ONCE at construction and never added to or removed
   * again. See FIRE_LIGHT_SLOTS: a changing light count recompiles every lit material in the
   * world (the burning-bush freeze), and every light is a permanent per-fragment cost — so
   * the count is both fixed and small, and the lights are pointed at whichever fires matter.
   */
  private createFireLights(): void {
    for (let i = 0; i < FIRE_LIGHT_SLOTS; i += 1) {
      const light = new THREE.PointLight(FIRE_COLOR, 0, this.params.fireDist, this.params.fireDecay);
      light.position.set(0, 1.1, 0);
      this.scene.add(light);
      this.fireLights.push(light);
    }
  }

  /**
   * The visible warm halo: a big soft additive radial laid flat over the ground, centred on
   * the fire — this is what actually makes a fire read as a light source (the cozy yellow
   * pool the 2D game drew). It is a MESH, not a light: adding one costs a draw call, never a
   * shader recompile, so every fire keeps its own however many are burning.
   */
  private acquireGlow(): THREE.Mesh {
    const free = this.freeGlows.pop();
    if (free) {
      free.visible = true;
      return free;
    }
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const glow = new THREE.Mesh(geo, makeFireGlowMaterial());
    glow.renderOrder = 2;
    this.scene.add(glow);
    return glow;
  }

  private releaseGlow(glow: THREE.Mesh): void {
    glow.visible = false;
    this.freeGlows.push(glow);
  }

  /**
   * Compile every shader up front, at the final light count. Call once per scene, after the
   * world's props exist and before the first frame — otherwise each material compiles lazily
   * on the frame it is first drawn, and the player wears it.
   */
  public prewarmShaders(): void {
    // renderer.compile() only knows about materials that are IN the scene right now. Everything
    // the game makes LATER — the first ember, the first puff, the first skeleton, the first coin —
    // is compiled and linked by the driver on the frame it is first drawn, and that costs 50–300ms
    // of frozen game. The profile caught two of them: a stall at +1s and another at +6s, each a
    // quarter of a second, each blamed on nothing in particular.
    //
    // So stand in for them. One throwaway billboard per option SHAPE the game creates at runtime
    // puts the program in the cache before the real object ever asks for it — only the shape
    // reaches the program's cache key, never the texture or the position. Note the fogless FX:
    // USE_FOG is baked into the program, so a fogless puff is a different shader from a foggy
    // coin, however alike the two look on screen.
    //
    // This list is guarded rather than trusted: perf-profile fails if ANY program compiles during
    // play, so a new billboard shape that forgets to register here cannot stay forgotten.
    const runtimeVariants: Billboard3DOptions[] = [
      { emissive: true },                     // coin, heart, dropped item, campfire flame
      { additive: true },                     // fire glow, embers
      { groundShadow: true },                 // a skeleton, an NPC: lit, with a contact blob
      { castGroundShadow: true },             // the hero
      { centered: true },                     // the item raised on ITEM GET
      { centered: true, fog: false, depthWrite: false, emissive: true, alphaTest: 0.02 },
      { centered: true, fog: false, depthWrite: false, additive: true },
      { flat: true, fog: false, depthWrite: false, additive: true },   // the ring, the ground crack
      { flat: true, additive: true },                                  // survivors' ground rings
    ];
    for (const opts of runtimeVariants) {
      this.warmups.push(new Billboard3D(this.scene, FX_DOT_TEXTURE, 0, opts).setDisplaySize(0.001, 0.001));
    }

    // The bridge deck. Its boxes are born when you WALK to a river — the chunk streamer builds the
    // water, and a buildable spot immediately ghosts in its deck — so they are not here to be
    // compiled now. And a Lambert BOX wearing a texture, with neither vertex colours nor an alpha
    // test, is a program shape nothing else in this world has: the first river you approach used
    // to cost a frozen quarter of a second.
    this.warmups.push(this.addBox(0.001, 0.001, 0.001, getWoodTexture('plankA', false)));

    // Compile against the COMPOSER'S render target, not against the canvas.
    //
    // This is the whole ball game. The world is never drawn to the canvas: EffectComposer draws it
    // into an offscreen target and the post chain resolves that to the screen. And three bakes the
    // target's colour space into the program's cache key — linear for an offscreen target, sRGB for
    // the canvas. So a prewarm that leaves the canvas bound compiles a complete set of programs the
    // game will never ask for, and the game then compiles its REAL set lazily, one 50–300ms freeze
    // at a time, on the frame each material is first drawn. It looked like the prewarm was running
    // (it was) and doing nothing (it was), which is the worst kind of bug to read.
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.composer.renderTarget1);
    this.renderer.compile(this.scene, this.camera);
    this.renderer.setRenderTarget(prevTarget);

    // Hide them, but do NOT destroy them. destroy() disposes the material, three drops that
    // material's reference to the program, and a program nobody references any more is deleted
    // outright — so tearing the stand-ins down would undo the very compile they were built for.
    // They cost nine invisible quads for the run; the alternative costs a quarter-second freeze.
    for (const w of this.warmups) w.setVisible(false);
  }

  /** Point lights in the scene. Constant for the whole run — see FIRE_LIGHT_SLOTS. */
  public get lightCount(): number {
    return this.fireLights.length + 3; // + shadowLight, heroLight, torchLight
  }

  /** GL counters (draw calls, triangles, compiled programs) for the profiler/HUD. */
  public get rendererInfo(): THREE.WebGLRenderer['info'] {
    return this.renderer.info;
  }

  /** The raw GL context, for the profiler's GPU timer queries. */
  public get gl(): WebGLRenderingContext | WebGL2RenderingContext {
    return this.renderer.getContext();
  }

  /** Live renderer gauges, sampled per frame by the profiler. */
  public stats(): Record<string, number> {
    return {
      sceneObjects: this.scene.children.length,
      pointLights: this.lightCount,
      fires: this.fires.length,
      litFires: this.litFires.length,
      fireLightsUsed: this.activeFireLights,
      castCasters: this.castCasters.length,
      castPool: this.solidCastField.mesh.count,
      moonCastPool: this.moonCastField.mesh.count,
      glowsLive: this.fires.length,
      glowsPooled: this.freeGlows.length,
    };
  }

  public addFireLight(worldX: number, worldY: number, lit: boolean): FireLight3D {
    const glow = this.acquireGlow();
    glow.position.set(worldX, 0.07, worldY);

    const entry: FireEntry = {
      worldX, worldY, lit, scale: 1, glow, flicker: 0, level: 1,
      seed: Math.random() * Math.PI * 2, noise: 0, flare: 0, flareTarget: 0,
      flareTimer: Math.random() * 1.5,
      intensity: 0, lx: worldX, lz: worldY, color: new THREE.Color(FIRE_COLOR), camDist: 0,
    };
    this.fires.push(entry);
    let released = false;
    return {
      worldX,
      worldY,
      setLit: (v) => { entry.lit = v; },
      setIntensityScale: (s) => { entry.scale = s; },
      destroy: () => {
        if (released) return;
        released = true;
        const i = this.fires.indexOf(entry);
        if (i >= 0) this.fires.splice(i, 1);
        this.releaseGlow(glow);
      },
    };
  }

  /**
   * The hero's carried flame. It's the SAME light a campfire casts — same reach,
   * decay, warm colour, flicker and visible glow pool — just riding the hero and
   * scaled by fuel (strength01). Only the state is stored here; updateTorch() (in
   * render) drives the flicker so the torchlight dances exactly like a fire.
   */
  public setTorchLight(worldX: number, worldY: number, strength01: number): void {
    this.torch.x = worldX;
    this.torch.y = worldY;
    this.torch.strength = Math.max(0, strength01);
  }

  /**
   * The carried torch's light + ground pool. Built eagerly (from sealLights) rather
   * than on the first lit torch: creating a PointLight mid-run recompiles every lit
   * material in the scene, so the player used to eat a hitch the moment the flame took.
   */
  private ensureTorchLight(): { light: THREE.PointLight; glow: THREE.Mesh } {
    if (!this.torchLight) {
      this.torchLight = new THREE.PointLight(FIRE_COLOR, 0, this.params.fireDist, this.params.fireDecay);
      this.scene.add(this.torchLight);
    }
    if (!this.torchGlow) {
      const glowGeo = new THREE.PlaneGeometry(1, 1);
      glowGeo.rotateX(-Math.PI / 2);
      this.torchGlow = new THREE.Mesh(glowGeo, makeFireGlowMaterial());
      this.torchGlow.renderOrder = 2;
      this.scene.add(this.torchGlow);
    }
    return { light: this.torchLight, glow: this.torchGlow };
  }

  /** Drive the carried torch as a mobile campfire (same dance as addFireLight's fires). */
  private updateTorch(dt: number, t: number): void {
    const s = this.torch;
    const { light, glow } = this.ensureTorchLight();
    if (s.strength <= 0) {
      light.intensity = 0;
      (glow.material as THREE.MeshBasicMaterial).opacity = 0;
      return;
    }
    // The exact firelight dance (slow swell + flicker + shimmer + jitter + log-pop flare).
    s.noise += (Math.random() - 0.5) * 0.6;
    s.noise *= 0.85;
    const nz = Math.max(-1, Math.min(1, s.noise));
    s.flareTimer -= dt;
    if (s.flareTimer <= 0) {
      s.flareTarget = Math.random() < 0.35 ? Math.random() * 0.6 - 0.15 : 0;
      s.flareTimer = 0.25 + Math.random() * 1.6;
    }
    s.flare += (s.flareTarget - s.flare) * Math.min(1, dt * 7);
    const dance =
      0.12 * Math.sin(t * 1.9 + s.seed) +
      0.09 * Math.sin(t * 5.7 + s.seed * 2.1) +
      0.05 * Math.sin(t * 12.3 + s.seed * 3.7) +
      0.11 * nz + s.flare;
    const level = Math.max(0.4, 1 + dance);
    s.level = level;
    // A handheld flame reads a touch smaller than a full campfire, but same light model.
    const TORCH_SCALE = 0.85;
    light.distance = this.params.fireDist;
    light.decay = this.params.fireDecay;
    light.intensity = this.params.fireIntensity * TORCH_SCALE * s.strength * level;
    light.position.set(
      s.x + 0.05 * Math.sin(t * 4.6 + s.seed) + nz * 0.04,
      1.0,
      s.y + 0.04 * Math.cos(t * 3.9 + s.seed * 1.5) + nz * 0.03,
    );
    const warm = Math.max(0, Math.min(1, (level - 0.75) / 0.7));
    light.color.copy(FIRE_COOL).lerp(FIRE_HOT, warm);
    // The visible warm pool on the ground — what makes the torch read as a light source.
    const gSize = this.params.fireGlowSize * TORCH_SCALE * (0.95 + 0.08 * (level - 1));
    setFireGlow(
      glow, light.position.x, light.position.z, gSize,
      s.strength * this.params.fireGlowStrength * TORCH_SCALE * (0.8 + 0.2 * level),
    );
  }

  /**
   * The hero's own faint ambient glow (the 2D game's neutral "you can always
   * see around yourself" circle). NEUTRAL near-white — it must reveal the
   * ground's own colours, not tint them (only real fire reads warm); fades
   * to 0 during the first-campfire cut-scene.
   */
  public setHeroLight(worldX: number, worldY: number, strength01: number): void {
    const light = this.ensureHeroLight();
    light.position.set(worldX, 1.2, worldY);
    light.intensity = this.params.heroLight * Math.max(0, strength01);
  }

  private ensureHeroLight(): THREE.PointLight {
    if (!this.heroLight) {
      this.heroLight = new THREE.PointLight('#e8e9ec', 0, 8, 1.6);
      this.scene.add(this.heroLight);
    }
    return this.heroLight;
  }

  // ── firelight cast shadows (2D ground silhouettes) ────────────────────────────

  /**
   * The lit light source closest to a world tile (null if none reaches it), for
   * cast-shadow aim. The carried TORCH counts too — a lit torch throws shadows off
   * objects just like a campfire — but it's skipped for whatever holds it (dist
   * ≈ 0), so the hero never casts a shadow from the flame in his own hand.
   */
  private nearestLitFire(x: number, y: number): { worldX: number; worldY: number; level: number } | null {
    let best: { worldX: number; worldY: number; level: number } | null = null;
    // Squared distances: this runs once per caster AND once per candidate solid tile,
    // every frame, so it is the hottest loop in the renderer — and the ranking is
    // identical without the sqrt. `litFires` was filtered for this frame in render().
    let bestD2 = Infinity;
    for (const f of this.litFires) {
      const dx = f.worldX - x;
      const dy = f.worldY - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = f; }
    }
    if (this.torch.strength > 0.15) {
      const dx = this.torch.x - x;
      const dy = this.torch.y - y;
      const d2 = dx * dx + dy * dy;
      // The torch is skipped for whatever holds it (d ≈ 0), so the hero never casts a
      // shadow from the flame in his own hand.
      if (d2 > 0.36 && d2 < bestD2) {
        best = { worldX: this.torch.x, worldY: this.torch.y, level: this.torch.level };
      }
    }
    return best;
  }

  /**
   * True when a caster is standing ON a lit fire tile (now possible: the hero walks lava with the
   * boots, or a stone-capped lava tile that keeps its glow). A directional cast shadow makes no
   * sense there — "point away from the flame" is atan2(≈0,≈0) at the fire underfoot, and among a
   * ring of equal fires the nearest one flips with the hero's breathing bob — both strobe the
   * silhouette. So on a fire tile we drop the directional cast and let the contact blob be the
   * shadow (see updateCastShadows). ≈0.6 tiles, the same radius the torch-holder guard uses.
   */
  private onLitFireTile(x: number, y: number): boolean {
    for (const f of this.litFires) {
      const dx = f.worldX - x;
      const dy = f.worldY - y;
      if (dx * dx + dy * dy < 0.36) return true;
    }
    return false;
  }

  /**
   * Lay down each caster's black silhouette pointing away from its nearest flame —
   * or along the moon's heading where no flame reaches (see CastShadow3D.ts).
   * Dynamic casters (hero/props/NPCs/enemies) each own a mesh; static solid tiles
   * borrow from a pool, so only those near a lit fire this frame consume one.
   */
  private updateCastShadows(): void {
    const radius = Math.max(0.5, this.params.castShadowRadius);
    const alpha = this.params.castShadowAlpha;
    const moonAlpha = this.params.moonShadowAlpha;
    const moonLength = this.params.moonShadowLength;
    // Live tuning (window.hd3d): the statics' moon field is baked, so a knob move re-bakes it.
    if (moonAlpha !== this.appliedMoonShadow.alpha || moonLength !== this.appliedMoonShadow.length) {
      this.fillMoonCastField();
    }

    for (let i = this.castCasters.length - 1; i >= 0; i--) {
      const c = this.castCasters[i];
      if (!c.bb.active) { // the billboard was destroyed — drop its shadow
        this.scene.remove(c.mesh);
        c.mesh.geometry.dispose();
        (c.mesh.material as THREE.Material).dispose();
        this.castCasters.splice(i, 1);
        continue;
      }
      if (!c.bb.visible) { c.mesh.visible = false; continue; }
      const height = Math.abs(c.bb.scaleY);
      // Standing ON a lit fire tile gives no stable heading (the flame is underfoot, and a ring of
      // equal fires flips which is "nearest" with every bob) — so drop the directional cast there
      // and let the contact blob carry the shadow. Otherwise: point away from the nearest flame.
      const fire = this.onLitFireTile(c.bb.x, c.bb.y) ? null : this.nearestLitFire(c.bb.x, c.bb.y);
      const fireCast = fire
        ? castTransform(c.bb.x, c.bb.y, height, fire.worldX, fire.worldY, fire.level, radius, alpha)
        : null;
      const cast = handoffCast(fireCast, this.moonCastRotY, moonLength * height, moonAlpha);
      if (!cast) { c.mesh.visible = false; continue; }
      applyCast(
        c.mesh, c.bb.x, c.bb.y, getTexture3D(c.bb.texKey, c.bb.frame), c.bb.flipX,
        Math.abs(c.bb.scaleX), cast.length, cast.rotY, cast.alpha,
        frameFootPad(c.bb.texKey, c.bb.frame),
      );
    }

    // Static solid tiles (trees/walls) near a lit fire — every one of them in a SINGLE draw.
    // They all silhouette the same image (the tileset) and they are all pure black, which is what
    // lets them batch without changing a pixel. See SolidCastField.
    const field = this.solidCastField;
    field.begin();
    const anyLit = this.torch.strength > 0.15 || this.litFires.length > 0;
    if (anyLit) {
      let p = 0;
      for (const tile of this.castableSolids) {
        if (p >= CAST_POOL_MAX) break;
        const fire = this.nearestLitFire(tile.x, tile.z);
        if (!fire) continue;
        if (Math.hypot(tile.x - fire.worldX, tile.z - fire.worldY) > radius) continue;
        const cast = castTransform(tile.x, tile.z, 1, fire.worldX, fire.worldY, fire.level, radius, alpha);
        if (!cast) continue;
        field.add(
          tile.x, tile.z, frameUvWindow('forest-tileset', tile.frame),
          CAST_WIDTH_FACTOR, cast.length, cast.rotY, cast.alpha,
          frameFootPad('forest-tileset', tile.frame),
        );
        p += 1;
      }
    }
    field.end(this.camTarget.x, this.camTarget.z);
  }

  // ── grass rustle (the 2D board's step-on-grass wobble, on the baked decor) ────

  /** Wobble the low-grass decor quad on this tile, exactly like the 2D rustle. */
  public rustleDecor(worldX: number, worldY: number): void {
    const key = `${worldX},${worldY}`;
    const vertStart = this.grassQuads.get(key);
    if (vertStart === undefined) return;
    this.activeRustles.set(key, { vertStart, x: worldX, z: worldY, t: 0 });
  }

  /**
   * Shudder a standing solid tile, the way DryTreeObject rocks its billboard when the axe bites
   * (±7° for ~220ms). A prop can do that with a tween on `angle` because it OWNS a mesh; a tile
   * is four vertices inside the one merged buffer every standing tile shares, so there is nothing
   * to rotate — the shake has to be written into `position` directly, the grass rustle's trick.
   *
   * Only the TOP two corners move. Shifting all four would slide the whole tree sideways, foot
   * and all; leaning the top over a planted base is what rotation about the foot looks like, and
   * it is what makes the blow read as landing on a tree that is rooted. `TILE_SHAKE_LEAN` is
   * tan(7°) on a one-tile-tall quad, so a tile leans exactly as far as the dry tree rocks.
   */
  public shakeSolidTile(worldX: number, worldY: number): void {
    const key = `${worldX},${worldY}`;
    const vertStart = this.solidQuads.get(key);
    if (vertStart === undefined) return;
    // Re-seeded, never accumulated: a second blow landing mid-shudder restarts it from the rest
    // pose instead of stacking a second offset onto an already-leaning tile.
    this.activeTileShakes.set(key, { vertStart, x: worldX, t: 0 });
  }

  private updateTileShakes(dt: number): void {
    if (this.activeTileShakes.size === 0) return;
    const pos = this.solidGeo.attributes.position as THREE.BufferAttribute;
    for (const [key, s] of this.activeTileShakes) {
      s.t += dt / TILE_SHAKE_SECONDS;
      const done = s.t >= 1;
      // A DAMPED shudder: it oscillates and dies into the rest pose, so the tile always lands
      // back where the merged mesh says it stands. Absolute positions recomputed from the tile's
      // own x (like updateRustles) — offsets accumulated frame to frame would drift the forest.
      const lean = done
        ? 0
        : Math.sin(s.t * Math.PI * 2 * TILE_SHAKE_CYCLES) * TILE_SHAKE_LEAN * (1 - s.t);
      pos.setX(s.vertStart, s.x - 0.5 + lean);
      pos.setX(s.vertStart + 1, s.x + 0.5 + lean);
      if (done) this.activeTileShakes.delete(key);
    }
    pos.needsUpdate = true;
  }

  private updateRustles(dt: number): void {
    if (this.activeRustles.size === 0) return;
    const pos = this.decorGeo.attributes.position as THREE.BufferAttribute;
    const cycle = (TIMINGS.grassRustleDurationMs * 2) / 1000;

    for (const [key, r] of this.activeRustles) {
      r.t += dt / cycle;
      const done = r.t >= 1;
      // Yoyo with Sine.easeOut both ways, like the 2D tween.
      const half = done ? 0 : (r.t < 0.5 ? r.t * 2 : (1 - r.t) * 2);
      const k = Math.sin((half * Math.PI) / 2);
      const angle = (-8 * Math.PI / 180) * k;
      const sx = (1 - 0.12 * k) * 0.5;
      const sz = (1 + 0.08 * k) * 0.5;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      // Quad corners in build order: (-,-) (+,-) (+,+) (-,+)
      const corners: ReadonlyArray<readonly [number, number]> = [
        [-sx, -sz], [sx, -sz], [sx, sz], [-sx, sz],
      ];
      for (let i = 0; i < 4; i++) {
        const [lx, lz] = corners[i];
        pos.setX(r.vertStart + i, r.x + lx * cos - lz * sin);
        pos.setZ(r.vertStart + i, r.z + lx * sin + lz * cos);
      }
      if (done) this.activeRustles.delete(key);
    }
    pos.needsUpdate = true;
  }

  // ── camera ───────────────────────────────────────────────────────────────────

  /**
   * Track the WorldCamera's tile position (its camX/camY under screen centre).
   * Snaps every frame: camX/camY already animate smoothly (the movement tween),
   * and the hero must stay pinned at screen centre exactly like the 2D game.
   */
  public follow(camX: number, camY: number, _snap = false): void {
    this.camTarget.set(camX + this.viewOffsetX, 0, camY + this.viewOffsetY);
    // An impact kick: the camera TRANSLATES (target shifts with it), so the whole diorama
    // jolts as one instead of swinging on a pivot. Decays in render().
    const k = this.shakeMs > 0 ? this.shakeAmp * (this.shakeMs / this.shakeDurMs) : 0;
    // …and under it, always, a slow handheld drift — a camera operator breathing. Tiny (a few
    // hundredths of a tile) and on two out-of-phase periods, so it never reads as a pattern; it
    // just keeps a standing frame from looking frozen.
    const sway = this.params.camSway;
    const swayX = Math.sin(this.elapsed * 0.23) * sway;
    const swayY = Math.sin(this.elapsed * 0.31 + 1.7) * sway * 0.6;
    const ox = swayX + (k > 0 ? (Math.random() * 2 - 1) * k : 0);
    const oy = swayY + (k > 0 ? (Math.random() * 2 - 1) * k : 0);
    this.camera.position.set(
      this.camTarget.x + ox,
      this.camTarget.y + this.params.camHeight + oy,
      this.camTarget.z + this.params.camBack,
    );
    this.camera.lookAt(this.camTarget.x + ox, this.camTarget.y + 0.4 + oy, this.camTarget.z);
    this.camera.updateMatrixWorld();
  }

  /**
   * Impact kick on the world camera, in TILES (a hit ~0.05, death ~0.3). The 3D world is
   * the diorama now, so a Phaser camera shake would only jolt the UI layer above it.
   */
  public shake(durationMs: number, amplitudeTiles: number): void {
    // A landed hit during a fading shake must not cut it short — keep the stronger kick.
    if (this.shakeMs > 0 && amplitudeTiles < this.shakeAmp * (this.shakeMs / this.shakeDurMs)) return;
    this.shakeMs = durationMs;
    this.shakeDurMs = Math.max(1, durationMs);
    this.shakeAmp = amplitudeTiles;
  }

  /**
   * The danger vignette (0 = off): the dark closing in as the undead siege builds. Colour
   * is the cold→blood ramp the spawn director drives; both land as post uniforms.
   */
  public setDangerVignette(amount: number, color: number): void {
    this.finishPass.uniforms.uDanger.value = Math.max(0, amount);
    (this.finishPass.uniforms.uDangerColor.value as THREE.Color).set(color);
  }

  /** Death fade (0 = normal, 1 = black): the world drains and sinks, in the post. */
  public setWorldFade(t: number): void {
    this.finishPass.uniforms.uFade.value = Math.max(0, Math.min(1, t));
  }

  /** Last CSS string pushed into each live colour, so an unchanged knob costs nothing. */
  private readonly appliedColors: Record<string, string> = {};

  private applyColor(key: string, target: THREE.Color, css: string): void {
    if (this.appliedColors[key] === css) return;
    this.appliedColors[key] = css;
    target.set(css);
  }

  /** Dialog pan: shift what sits at screen centre, in tile units. */
  public setViewOffset(dxTiles: number, dyTiles: number): void {
    this.viewOffsetX = dxTiles;
    this.viewOffsetY = dyTiles;
  }

  /** World tile → CSS pixel position on screen (for Phaser-side overlays/FX). */
  public projectTile(worldX: number, worldY: number, elevationTiles = 0): { x: number; y: number } {
    // Scratch, not a fresh Vector3: every 2D overlay in the game (footprints, pips, balloons, the
    // fire compass) projects through here several times a frame, and the garbage adds up into the
    // collector's next pause.
    const v = this.projectScratch.set(worldX, elevationTiles, worldY).project(this.camera);
    return {
      x: Math.round((v.x * 0.5 + 0.5) * window.innerWidth),
      y: Math.round((-v.y * 0.5 + 0.5) * window.innerHeight),
    };
  }

  /** Projected pixel height of one tile at the camera target — the 2D code's "tileSize". */
  public tileScreenSize(): number {
    const a = this.projectTile(this.camTarget.x, this.camTarget.z);
    const c = this.projectTile(this.camTarget.x, this.camTarget.z, 1);
    return Math.max(24, Math.abs(a.y - c.y));
  }

  // ── frame ────────────────────────────────────────────────────────────────────

  public render(dtMs: number): void {
    const dt = Math.min(dtMs / 1000, 0.05);
    this.elapsed += dt;
    this.shakeMs = Math.max(0, this.shakeMs - dtMs);
    // We own the reset now (autoReset is off), so the frame's counters cover every pass the
    // composer runs, not just the last one.
    this.renderer.info.reset();
    profiler.begin('rustle');
    this.updateRustles(dt);
    this.updateTileShakes(dt); // same buffer-poking trick, same budget — see shakeSolidTile
    profiler.end('rustle');

    // Live knobs (window.hd3d).
    texelAaUniform.value = Math.min(1, Math.max(0, this.params.texelAa));
    lightStepsUniform.value = Math.max(0, this.params.lightSteps);
    lightResUniform.value = Math.max(0, this.params.lightRes);
    lightWobbleUniform.value = Math.max(0, this.params.lightWobble);
    lightCapUniform.value = this.params.lightCap;
    // These five are CSS STRINGS, live-tunable through window.hd3d — and Color.set(string) parses
    // the CSS every time it is called. Re-reading them each frame meant five regex parses a frame
    // to arrive back at the colour that was already there. Only re-parse when the knob moves.
    this.applyColor('fireRampCore', fireRampCoreUniform.value, this.params.fireRampCore);
    this.applyColor('fireRampMid', fireRampMidUniform.value, this.params.fireRampMid);
    this.applyColor('fireRampRim', fireRampRimUniform.value, this.params.fireRampRim);
    fireGlowResUniform.value = Math.max(0, this.params.fireGlowRes);
    flowTimeUniform.value = this.elapsed;
    this.ambientLight.intensity = this.params.ambient;
    this.applyColor('ambient', this.ambientLight.color, this.params.ambientColor);
    this.moonLight.intensity = this.params.moon;
    this.applyColor('moon', this.moonLight.color, this.params.moonColor);
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.density = this.params.fogDensity;
    if (this.params.fov !== this.appliedFov) {
      this.camera.fov = this.params.fov;
      this.camera.updateProjectionMatrix();
      this.appliedFov = this.params.fov;
    }
    this.syncFinishUniforms();
    // Tilt-shift focus follows the hero: normally he sits at screen centre, but a
    // dialog pan (setViewOffset) slides him off it — track his projected screen
    // line so the sharp band stays on him. params.focusY biases it from centre.
    const heroX = this.camTarget.x - this.viewOffsetX;
    const heroZ = this.camTarget.z - this.viewOffsetY;
    const heroScreen = this.projectTile(heroX, heroZ, 0.5);
    const trackedFocusY = 1 - heroScreen.y / Math.max(1, window.innerHeight);
    this.finishPass.uniforms.uFocusY.value = trackedFocusY + (this.params.focusY - 0.52);
    if (Math.max(1, Math.round(this.params.pixelScale)) !== this.appliedPixelScale) {
      this.applyPixelScale();
    }

    // Realistic firelight. A real flame's light is never a steady lamp: it has a
    // fast shimmer riding a slower swell, an irregular jitter, and the odd "log
    // pop" flare or momentary dip — and it shifts colour (deep orange when low,
    // paler gold at a flare's peak) and dances its source point. Each fire layers
    // all of that (seeded so no two sync), then the nearest one hands its dance to
    // the single shadow-casting light so the real cast shadows stretch and shrink.
    profiler.begin('fires');
    const t = this.elapsed;
    // Live pool-size knobs (window.hd3d.fireDist / fireDecay).
    this.shadowLight.distance = this.params.fireDist;
    this.shadowLight.decay = this.params.fireDecay;
    let nearest: FireEntry | null = null;
    let bestD = Infinity;
    this.litFires.length = 0;
    for (const f of this.fires) {
      // Irregular jitter: a random walk, low-passed so it wanders instead of buzzing.
      f.noise += (Math.random() - 0.5) * 0.6;
      f.noise *= 0.85;
      const nz = Math.max(-1, Math.min(1, f.noise));
      // Occasional log-pop (a flare up) or a brief settle (a dip), eased in/out.
      f.flareTimer -= dt;
      if (f.flareTimer <= 0) {
        f.flareTarget = Math.random() < 0.35 ? Math.random() * 0.6 - 0.15 : 0;
        f.flareTimer = 0.25 + Math.random() * 1.6;
      }
      f.flare += (f.flareTarget - f.flare) * Math.min(1, dt * 7);
      // Layered dance: slow swell + mid flicker + fast shimmer + jitter + flare.
      const dance =
        0.12 * Math.sin(t * 1.9 + f.seed) +
        0.09 * Math.sin(t * 5.7 + f.seed * 2.1) +
        0.05 * Math.sin(t * 12.3 + f.seed * 3.7) +
        0.11 * nz +
        f.flare;
      const level = Math.max(0.4, 1 + dance); // stays alive at its dimmest
      f.flicker = dance;
      f.level = level;
      const on = f.lit ? 1 : 0;
      // The flame is computed whether or not a real light ends up pointed at it — it is a
      // few sines, and it keeps the glow pool (below) dancing for every fire on screen.
      f.intensity = this.params.fireIntensity * f.scale * on * level;
      f.lx = f.worldX + 0.05 * Math.sin(t * 4.6 + f.seed) + nz * 0.04;
      f.lz = f.worldY + 0.04 * Math.cos(t * 3.9 + f.seed * 1.5) + nz * 0.03;
      // Colour temperature tracks brightness: hotter flame reads paler/whiter-gold.
      const warm = Math.max(0, Math.min(1, (level - 0.75) / 0.7));
      f.color.copy(FIRE_COOL).lerp(FIRE_HOT, warm);
      // The visible warm pool breathes with the flame; it vanishes when unlit.
      const gSize = this.params.fireGlowSize * (0.95 + 0.08 * (level - 1));
      setFireGlow(
        f.glow, f.lx, f.lz, gSize,
        on * f.scale * this.params.fireGlowStrength * (0.8 + 0.2 * level),
      );
      f.camDist = Math.hypot(f.worldX - this.camTarget.x, f.worldY - this.camTarget.z);
      // A fire only counts as a light source once it is actually giving off light. A bush
      // that has just caught (scale ramping up from 0) or is guttering out (scale back to
      // 0) is lit but BLACK: letting it win the "nearest fire" contest below would hand
      // the single shadow-casting light an intensity of zero, and every cast shadow in the
      // clearing would blink out and pop back for the length of the burn.
      if (f.lit && f.scale > 0.05) {
        this.litFires.push(f);
        if (f.camDist < bestD) { bestD = f.camDist; nearest = f; }
      }
    }

    if (nearest) {
      // The nearest fire hands its full dance (position, colour, intensity) to the shadow
      // light; its height rises on a flare so the cast shadows leap with it. That light IS
      // the nearest fire's light — which is why it is skipped in the pool assignment below.
      this.shadowLight.position.set(
        nearest.lx,
        this.params.shadowHeight + nearest.flare * 0.4 + nearest.flicker * 0.12,
        nearest.lz,
      );
      this.shadowLight.intensity = nearest.intensity;
      this.shadowLight.color.copy(nearest.color);
    } else {
      this.shadowLight.intensity = 0;
    }

    // Hand the pooled lights to the lit fires closest to the camera. There are only
    // FIRE_LIGHT_SLOTS of them because every light taxes every lit fragment (see the
    // constant), and a world can hold far more fires than are ever worth shading — the
    // lava field alone is eight tiles. Whoever misses out keeps their glow quad, so the
    // fire still reads as a warm pool on the ground; it just stops shading the 3D around
    // it, at a range where a distance-limited point light was nearly black anyway.
    this.lightCandidates.length = 0;
    for (const f of this.litFires) {
      if (f !== nearest) this.lightCandidates.push(f);
    }
    this.lightCandidates.sort((a, b) => a.camDist - b.camDist);
    let used = 0;
    for (; used < this.fireLights.length && used < this.lightCandidates.length; used += 1) {
      const f = this.lightCandidates[used];
      const light = this.fireLights[used];
      light.distance = this.params.fireDist;
      light.decay = this.params.fireDecay;
      light.position.set(f.lx, 1.1, f.lz);
      light.color.copy(f.color);
      light.intensity = f.intensity;
    }
    this.activeFireLights = used;
    for (let i = used; i < this.fireLights.length; i += 1) this.fireLights[i].intensity = 0;
    profiler.end('fires');

    profiler.begin('torch');
    this.updateTorch(dt, t);
    profiler.end('torch');
    profiler.begin('castShadows');
    this.updateCastShadows();
    profiler.end('castShadows');
    profiler.begin('biome');
    this.updateBiomeGrade(dt);
    profiler.end('biome');
    profiler.begin('godRays');
    this.updateGodRays(nearest);
    profiler.end('godRays');
    profiler.begin('particles');
    this.updateParticles(dt, nearest);
    profiler.end('particles');

    this.finishPass.uniforms.uTime.value = this.elapsed;
    // Any shader that still needs compiling gets compiled+linked HERE, inside the driver,
    // on the frame it is first drawn — which is why an invisible shader-cache invalidation
    // surfaces as a mystery spike in this one section. See Profiler.ts.
    //
    // The CPU time of this section is only the SUBMISSION cost; the GPU timer query is what
    // tells you how long the frame actually took to draw (per-pixel cost — lights, overdraw,
    // the post chain — is invisible to any CPU clock).
    profiler.begin('compose');
    profiler.gpuBegin();
    this.composer.render();
    profiler.gpuEnd();
    profiler.end('compose');
  }

  /** Embers rise from the nearest lit fire; dust drifts in the air around the hero. */
  private updateParticles(dt: number, fire: FireEntry | null): void {
    const t = this.elapsed;

    // First frame with a real camera target: spread the dust across a box around
    // the hero (before follow() runs camTarget is the origin, which would stack
    // every mote on one edge when it wraps).
    if (!this.dustSeeded) {
      for (let i = 0; i < DUST_COUNT; i++) {
        this.dust.pos[i * 3] = this.camTarget.x + (Math.random() - 0.5) * 30;
        this.dust.pos[i * 3 + 2] = this.camTarget.z + (Math.random() - 0.5) * 30;
      }
      this.dustSeeded = true;
    }
    if (!this.atmosphereSeeded) {
      for (let i = 0; i < FIREFLY_COUNT; i++) {
        this.fireflies.pos[i * 3] = this.camTarget.x + (Math.random() - 0.5) * 18;
        this.fireflies.pos[i * 3 + 1] = 0.3 + Math.random() * 1.3;
        this.fireflies.pos[i * 3 + 2] = this.camTarget.z + (Math.random() - 0.5) * 18;
      }
      for (let i = 0; i < MIST_COUNT; i++) {
        this.mist.pos[i * 3] = this.camTarget.x + (Math.random() - 0.5) * 30;
        this.mist.pos[i * 3 + 1] = 0.05 + Math.random() * 0.3;
        this.mist.pos[i * 3 + 2] = this.camTarget.z + (Math.random() - 0.5) * 30;
      }
      this.atmosphereSeeded = true;
    }

    // Embers: reborn at the lit fire, fading amber as they climb. With no lit
    // fire in view they park below the ground (invisible) rather than pop.
    for (let i = 0; i < EMBER_COUNT; i++) {
      const p = this.emberState[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.life = 0;
        p.maxLife = 0.9 + Math.random() * 0.9;
        if (fire) {
          this.embers.pos[i * 3] = fire.worldX + (Math.random() - 0.5) * 0.35;
          this.embers.pos[i * 3 + 1] = 0.5 + Math.random() * 0.2;
          this.embers.pos[i * 3 + 2] = fire.worldY + (Math.random() - 0.5) * 0.35;
        } else {
          this.embers.pos[i * 3 + 1] = -10;
        }
        p.vx = (Math.random() - 0.5) * 0.35;
        p.vy = 0.9 + Math.random() * 0.7;
        p.vz = (Math.random() - 0.5) * 0.35;
      }
      this.embers.pos[i * 3] += p.vx * dt;
      this.embers.pos[i * 3 + 1] += p.vy * dt;
      this.embers.pos[i * 3 + 2] += p.vz * dt;
      const a = fire ? 1 - p.life / p.maxLife : 0;
      this.embers.col[i * 3] = 1.6 * a;
      this.embers.col[i * 3 + 1] = 0.75 * a;
      this.embers.col[i * 3 + 2] = 0.3 * a * a;
    }
    this.embers.mark();

    // Dust: a slow twinkling haze that stays boxed around the camera target and
    // glints brighter near the fire pool.
    const cx = this.camTarget.x;
    const cz = this.camTarget.z;
    for (let i = 0; i < DUST_COUNT; i++) {
      const s = this.dustSeed[i];
      let x = this.dust.pos[i * 3] + Math.sin(t * 0.35 + s) * 0.0009;
      let z = this.dust.pos[i * 3 + 2] + Math.cos(t * 0.28 + s) * 0.0009;
      // Wrap the drifting motes back into a box that follows the hero.
      if (x < cx - 15) x = cx + 15; else if (x > cx + 15) x = cx - 15;
      if (z < cz - 15) z = cz + 15; else if (z > cz + 15) z = cz - 15;
      this.dust.pos[i * 3] = x;
      this.dust.pos[i * 3 + 1] += Math.cos(t * 0.22 + s * 2.0) * 0.0011;
      this.dust.pos[i * 3 + 2] = z;
      const glow = fire
        ? Math.max(0.06, 1 - Math.hypot(x - fire.worldX, z - fire.worldY) / 9)
        : 0.1;
      const tw = 0.55 + 0.45 * Math.sin(t * 1.7 + s * 5.0);
      this.dust.col[i * 3] = 0.5 * glow * tw;
      this.dust.col[i * 3 + 1] = 0.42 * glow * tw;
      this.dust.col[i * 3 + 2] = 0.3 * glow * tw;
    }
    this.dust.mark();

    // Fireflies: bob up and down, drift within a box around the hero, and glow
    // amber-green only inside a lit fire's clearing — twinkling on and off.
    const ffAmt = Math.max(0, this.params.fireflies);
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      const s = this.fireflySeed[i];
      let x = this.fireflies.pos[i * 3] + Math.sin(t * 0.5 + s) * 0.006;
      let z = this.fireflies.pos[i * 3 + 2] + Math.cos(t * 0.42 + s * 1.3) * 0.006;
      if (x < cx - 11) x = cx + 11; else if (x > cx + 11) x = cx - 11;
      if (z < cz - 11) z = cz + 11; else if (z > cz + 11) z = cz - 11;
      this.fireflies.pos[i * 3] = x;
      this.fireflies.pos[i * 3 + 1] = 0.35 + 0.9 * (0.5 + 0.5 * Math.sin(t * 0.6 + s * 1.7));
      this.fireflies.pos[i * 3 + 2] = z;
      const near = fire ? Math.max(0, 1 - Math.hypot(x - fire.worldX, z - fire.worldY) / 7) : 0;
      const blink = Math.max(0, Math.sin(t * 2.3 + s * 4.0));
      const a = ffAmt * near * blink;
      this.fireflies.col[i * 3] = 0.7 * a;
      this.fireflies.col[i * 3 + 1] = 1.0 * a;
      this.fireflies.col[i * 3 + 2] = 0.35 * a;
    }
    this.fireflies.mark();

    // Mist: slow cool wisps hugging the ground; thins right at the fire (heat burns
    // it off) so the lit clearing stays clear while the dark stays veiled.
    const mistAmt = Math.max(0, this.params.mist);
    for (let i = 0; i < MIST_COUNT; i++) {
      const s = this.mistSeed[i];
      let x = this.mist.pos[i * 3] + Math.sin(t * 0.12 + s) * 0.004;
      let z = this.mist.pos[i * 3 + 2] + Math.cos(t * 0.09 + s * 1.4) * 0.004;
      if (x < cx - 16) x = cx + 16; else if (x > cx + 16) x = cx - 16;
      if (z < cz - 16) z = cz + 16; else if (z > cz + 16) z = cz - 16;
      this.mist.pos[i * 3] = x;
      this.mist.pos[i * 3 + 2] = z;
      const clear = fire ? Math.min(1, Math.hypot(x - fire.worldX, z - fire.worldY) / 4) : 1;
      const tw = 0.6 + 0.4 * Math.sin(t * 0.5 + s * 3.0);
      const a = mistAmt * 0.045 * clear * tw;
      this.mist.col[i * 3] = 0.32 * a;
      this.mist.col[i * 3 + 1] = 0.4 * a;
      this.mist.col[i * 3 + 2] = 0.6 * a;
    }
    this.mist.mark();
  }

  private readonly handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.applyPixelScale();
  };

  public dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.scene.traverse((obj) => {
      // Dispose meshes AND particle Points (both carry geometry + material).
      const withGeo = obj as THREE.Object3D & {
        isMesh?: boolean; isPoints?: boolean;
        geometry?: THREE.BufferGeometry; material?: THREE.Material;
      };
      if (withGeo.isMesh || withGeo.isPoints) {
        withGeo.geometry?.dispose();
        withGeo.material?.dispose();
      }
    });
    this.dotTexture?.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}

// ── HD-2D post: the finish shader (tilt-shift DoF + vignette + grain) ─────────
//
// Ported from src/prototype3d/main.ts. A screen-space fake depth-of-field: a
// sharp horizontal band at uFocusY (the hero's line) stays crisp while the top
// (distant background) and bottom (foreground) blur out — the "miniature
// diorama" tilt-shift. Then a soft vignette and a touch of film grain.
const makeFinishShader = (w: number, h: number): THREE.ShaderMaterialParameters & {
  uniforms: Record<string, THREE.IUniform>;
} => ({
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(w, h) },
    uTime: { value: 0 },
    uFocusY: { value: 0.52 },
    uBand: { value: 0.16 },
    uBlur: { value: 3.2 },
    uNear: { value: 0.55 },
    uVignette: { value: 0.24 },
    uGrain: { value: 0.02 },
    uGrade: { value: 0.5 },
    // The split-tone the grade lerps between, per region (see updateBiomeGrade): cool woodland by
    // default, amber where the ground runs molten.
    uShadowTint: { value: new THREE.Vector3(0.88, 0.95, 1.10) },
    uHighTint: { value: new THREE.Vector3(1.12, 1.02, 0.86) },
    uSaturation: { value: 1.1 },
    uContrast: { value: 1.0 },
    uDanger: { value: 0 },
    uDangerColor: { value: new THREE.Color(0x2a3f6b) },
    uFade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uFocusY;
    uniform float uBand;
    uniform float uBlur;
    uniform float uNear;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uGrade;
    uniform vec3 uShadowTint;
    uniform vec3 uHighTint;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uDanger;
    uniform vec3 uDangerColor;
    uniform float uFade;
    varying vec2 vUv;
    void main() {
      // Tilt-shift, asymmetric on purpose: the DISTANCE behind the hero (up the screen) melts
      // away hard, while the foreground under him only softens — Octopath blurs the background
      // far more than the front, and blurring the near edge as hard just hides the ground the
      // player is walking on. uNear scales the near side's ramp.
      float dy = vUv.y - uFocusY;
      float far = smoothstep(uBand, uBand + 0.30, dy);          // above the band = distance
      float near = smoothstep(uBand, uBand + 0.46, -dy) * uNear; // below = foreground
      float t = max(far, near);
      // Quantise the radius to half a pixel: a continuously-varying blur makes the pixel art
      // "boil" as the hero walks, because every frame resamples the same texels differently.
      float radius = floor(uBlur * t * 2.0 + 0.5) * 0.5;
      vec2 px = radius / uResolution;
      vec3 col = texture2D(tDiffuse, vUv).rgb * 0.30;
      col += texture2D(tDiffuse, vUv + vec2( 1.0,  0.6) * px).rgb * 0.12;
      col += texture2D(tDiffuse, vUv + vec2(-1.0,  0.6) * px).rgb * 0.12;
      col += texture2D(tDiffuse, vUv + vec2( 1.0, -0.6) * px).rgb * 0.12;
      col += texture2D(tDiffuse, vUv + vec2(-1.0, -0.6) * px).rgb * 0.12;
      col += texture2D(tDiffuse, vUv + vec2( 0.0,  1.4) * px).rgb * 0.11;
      col += texture2D(tDiffuse, vUv + vec2( 0.0, -1.4) * px).rgb * 0.11;

      // ── cinematic grade: split-tone (cool shadows / warm highlights), then
      //    saturation and contrast — the HD-2D "diorama photograph" look.
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 toned = col * mix(uShadowTint, uHighTint, smoothstep(0.0, 0.55, luma));
      col = mix(col, toned, uGrade);
      col = mix(vec3(luma), col, uSaturation);       // saturation around luma
      col = (col - 0.5) * uContrast + 0.5;           // contrast around mid-grey
      col = max(col, 0.0);

      vec2 vuv = (vUv - 0.5) * vec2(1.0, 1.2);
      col *= 1.0 - smoothstep(0.5, 0.95, length(vuv)) * uVignette;

      // The undead siege made visible: a radial wash creeping in from the screen edge,
      // cold blue while the meter fills and bleeding to red as it peaks (setDangerVignette
      // owns colour and amount). It lives inside the post — graded and grained with the
      // rest of the frame — instead of the flat 2D image it used to be.
      float dr = length((vUv - 0.5) * 2.0);
      float dmask = dr < 0.78
        ? mix(0.0, 0.45, clamp((dr - 0.52) / 0.26, 0.0, 1.0))
        : mix(0.45, 1.0, clamp((dr - 0.78) / 0.22, 0.0, 1.0));
      col = mix(col, uDangerColor, dmask * uDanger);

      float n = fract(sin(dot(vUv * uResolution + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * uGrain;

      // Death: the whole diorama drains of colour and sinks to black from inside the post,
      // so the fade takes the world, its grain and its glow with it (setWorldFade).
      float fadeLuma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(fadeLuma), uFade * 0.85);
      col *= 1.0 - uFade;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
});

// ── ambient particle fields (additive Points) ─────────────────────────────────

interface EmberParticle { life: number; maxLife: number; vx: number; vy: number; vz: number }

interface ParticleField {
  points: THREE.Points;
  pos: Float32Array;
  col: Float32Array;
  mark(): void;
}

// A soft round glow (white opaque centre → transparent rim) so additive Points
// read as soft motes instead of hard squares — shared by every particle field.
// The expanding shockwave of an impact (a landed hit, a deflected blow, a heal tick): a hollow
// ring, laid FLAT on the ground so it reads as a wave washing over the floor of the diorama.
// Low-res + NEAREST like the fire glow, so it breaks into chunky pixels instead of a smooth HD arc.
const RING_TEX_RES = 48;
const makeRingTexture = (): THREE.CanvasTexture => {
  const c = document.createElement('canvas');
  c.width = c.height = RING_TEX_RES;
  const ctx = c.getContext('2d')!;
  const r = RING_TEX_RES / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0.00, 'rgba(255,255,255,0)');
  g.addColorStop(0.62, 'rgba(255,255,255,0)');
  g.addColorStop(0.80, 'rgba(255,255,255,1)'); // the band itself
  g.addColorStop(0.96, 'rgba(255,255,255,0.25)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, RING_TEX_RES, RING_TEX_RES);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

// A single shaft of light: brightest at the flame's mouth, thinning and dying as it climbs, and
// feathered at the sides so the beam has no hard edge. Low-res + NEAREST, like every other glow
// here, so it breaks into pixel blocks rather than a smooth airbrushed cone.
const SHAFT_TEX_W = 16;
const SHAFT_TEX_H = 48;
const makeShaftTexture = (): THREE.DataTexture => {
  const data = new Uint8Array(SHAFT_TEX_W * SHAFT_TEX_H * 4);
  for (let y = 0; y < SHAFT_TEX_H; y++) {
    // v = 0 at the foot (the fire) … 1 at the top: the beam fades out as it rises.
    const v = y / (SHAFT_TEX_H - 1);
    const rise = Math.pow(1 - v, 1.8);
    for (let x = 0; x < SHAFT_TEX_W; x++) {
      const i = (y * SHAFT_TEX_W + x) * 4;
      const across = Math.abs((x + 0.5) / SHAFT_TEX_W - 0.5) * 2; // 0 centre … 1 edge
      const feather = Math.pow(Math.max(0, 1 - across), 1.6);
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(rise * feather * 190);
    }
  }
  const tex = new THREE.DataTexture(data, SHAFT_TEX_W, SHAFT_TEX_H, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
};

// Smoke: the same soft disc as the dot, but written as raw pixels so the colour stays WHITE out
// to the transparent rim (see the FX_PUFF_TEXTURE note). Canvas is deliberately not used here.
const PUFF_TEX_RES = 32;
const makePuffTexture = (): THREE.DataTexture => {
  const size = PUFF_TEX_RES;
  const data = new Uint8Array(size * size * 4);
  const r = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
      // Full in the core, easing to nothing at the rim — alpha only; rgb never darkens.
      const a = Math.max(0, Math.min(1, 1 - d));
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(Math.pow(a, 1.4) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
};

// The undead spawn telegraph: jagged fissures radiating from a point, drawn WHITE so the
// billboard's tint decides the colour (a cold under-glow, not a brown crack — in the dark
// where skulls rise, a dark decal on dark ground would be invisible). Low-res + NEAREST so
// the fissures break into chunky pixel steps like every other FX here.
const CRACK_TEX_RES = 48;
const makeCrackTexture = (): THREE.CanvasTexture => {
  const c = document.createElement('canvas');
  c.width = c.height = CRACK_TEX_RES;
  const ctx = c.getContext('2d')!;
  const r = CRACK_TEX_RES / 2;
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 2;
  const arms = 6;
  for (let a = 0; a < arms; a++) {
    // Each arm is a random walk outward: step, kink sideways, step — a lightning fork, not a ray.
    let ang = (a / arms) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
    let x = r;
    let y = r;
    const reach = r * (0.55 + Math.random() * 0.4);
    const steps = 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < steps; s++) {
      const len = (reach / steps) * (0.7 + Math.random() * 0.6);
      ang += (Math.random() - 0.5) * 0.9;
      x += Math.cos(ang) * len;
      y += Math.sin(ang) * len;
      ctx.lineTo(x, y);
      // A short side-branch halfway out on some arms sells "shattering", not "asterisk".
      if (s === 1 && Math.random() < 0.6) {
        const bAng = ang + (Math.random() < 0.5 ? 1 : -1) * (0.7 + Math.random() * 0.6);
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(bAng) * len * 0.6, y + Math.sin(bAng) * len * 0.6);
        ctx.moveTo(x, y);
      }
    }
    ctx.stroke();
  }
  // A dim pool at the heart of the fissure, so the centre reads hotter than the tips.
  const g = ctx.createRadialGradient(r, r, 0, r, r, r * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CRACK_TEX_RES, CRACK_TEX_RES);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

const makeSoftDotTexture = (): THREE.CanvasTexture => {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

// The additive campfire glow laid over the ground. Evaluated on the art's own pixel
// grid and banded into flat tiers (lightSteps), so the warm pool reads as a hand-shaded
// pixel-art circle of light — chunky stepped rings — instead of a smooth HD gradient.
/** The uniforms a fire's warm pool needs to place itself, kept on the material. */
type GlowUniforms = { center: THREE.IUniform<THREE.Vector2>; radius: THREE.IUniform<number> };

/**
 * The warm POOL a fire pours on the ground — as pixel art.
 *
 * It used to be a smooth 34×34 canvas gradient stretched across ~15 TILES with a NEAREST
 * filter: every texel of it landed as a ~half-tile square, so the pool came out as a coarse
 * checkerboard whose blocks had nothing to do with the art's own pixels ("quadriculada, não
 * pixel art"). Here the falloff is evaluated per fragment instead and snapped to the ART's
 * pixel grid (lightRes texels per tile = the tileset's 16), so the light steps in exactly the
 * pixels it lights. The snap is in WORLD space, so the blocks stay pinned to the ground and
 * never swim as the camera pans or the flame jitters — only their brightness dances.
 */
const makeFireGlowMaterial = (): THREE.MeshBasicMaterial => {
  // Colour comes from the authored band ramp in the shader (fireRamp* uniforms), so the
  // material's own colour stays white.
  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    opacity: 0,
  });
  const glow: GlowUniforms = {
    center: { value: new THREE.Vector2() },
    radius: { value: 1 },
  };
  mat.userData.glow = glow;
  mat.customProgramCacheKey = () => 'fireGlow';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGlowCenter = glow.center;
    shader.uniforms.uGlowRadius = glow.radius;
    shader.uniforms.uLightRes = fireGlowResUniform; // the pool paints COARSER than the art
    shader.uniforms.uLightSteps = lightStepsUniform;
    shader.uniforms.uLightWobble = lightWobbleUniform;
    shader.uniforms.uFlowTime = flowTimeUniform;
    shader.uniforms.uRampCore = fireRampCoreUniform;
    shader.uniforms.uRampMid = fireRampMidUniform;
    shader.uniforms.uRampRim = fireRampRimUniform;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vGlowPos;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vGlowPos = (modelMatrix * vec4(transformed, 1.0)).xz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform vec2 uGlowCenter;
         uniform float uGlowRadius;
         uniform float uLightRes;
         uniform float uLightSteps;
         uniform float uLightWobble;
         uniform float uFlowTime;
         uniform vec3 uRampCore;
         uniform vec3 uRampMid;
         uniform vec3 uRampRim;
         ${FIRE_WOBBLE_GLSL}
         varying vec2 vGlowPos;
         // The falloff the canvas gradient used to bake: a hot core that drops away fast,
         // then a long soft skirt out to the rim.
         float glowCurve(float r) {
           if (r >= 1.0) return 0.0;
           if (r < 0.18) return mix(0.95, 0.60, r / 0.18);
           if (r < 0.45) return mix(0.60, 0.25, (r - 0.18) / 0.27);
           if (r < 0.75) return mix(0.25, 0.06, (r - 0.45) / 0.30);
           return mix(0.06, 0.0, (r - 0.75) / 0.25);
         }
         void main() {`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         vec2 glowTexel = floor(vGlowPos * uLightRes);
         vec2 glowPos = uLightRes > 0.0
           ? (glowTexel + 0.5) / uLightRes
           : vGlowPos;
         // Imperfect firelight: dent the rings with the shared wobble field (the same
         // one warping the direct light, so all the contours lobe together). The dents
         // grow from the core to the rim — up close a flame's pool is roundish; its far
         // skirt is what breaks up.
         float rBase = distance(glowPos, uGlowCenter) / max(0.0001, uGlowRadius);
         glowPos += vec2(
           fireWobble(glowPos, uFlowTime),
           fireWobble(glowPos.yx + 31.7, uFlowTime)
         ) * (uLightWobble * (0.35 + 0.65 * min(rBase, 1.0)));
         float glowA = glowCurve(distance(glowPos, uGlowCenter) / max(0.0001, uGlowRadius));
         // Retro banding: the pool falls off in FLAT TIERS (the stepped pixel-art lantern)
         // rather than a silky HD ramp. Quantised straight — no dither: the tier edges are
         // already stair-stepped by the art-pixel snap above, which is exactly how a pixel
         // artist draws a circle of light (a Bayer dither here read as dirty stipple).
         if (uLightSteps >= 1.0) {
           glowA = floor(glowA * uLightSteps + 0.5) / uLightSteps;
         }
         // The A Short Hike lighting ramp: each band wears its own AUTHORED colour —
         // ember-red rim, golden-orange mid, pale-gold heart — the way a pixel artist
         // paints a pool of firelight, instead of one colour fading by alpha alone.
         // With uLightSteps bands the stops land exactly on rim/mid/core.
         float rampT = uLightSteps >= 2.0
           ? clamp((glowA * uLightSteps - 1.0) / (uLightSteps - 1.0), 0.0, 1.0)
           : glowA;
         diffuseColor.rgb *= rampT < 0.5
           ? mix(uRampRim, uRampMid, rampT * 2.0)
           : mix(uRampMid, uRampCore, rampT * 2.0 - 1.0);
         diffuseColor.a *= glowA;`,
      );
  };
  return mat;
};

/** Place a fire's pool: the disc's rim sits at half the quad, centred on the dancing flame. */
const setFireGlow = (
  mesh: THREE.Mesh, x: number, z: number, size: number, opacity: number,
): void => {
  const mat = mesh.material as THREE.MeshBasicMaterial;
  const glow = mat.userData.glow as GlowUniforms;
  mat.opacity = opacity;
  glow.center.value.set(x, z);
  glow.radius.value = size / 2;
  mesh.scale.set(size, 1, size);
  mesh.position.set(x, 0.07, z);
};

const makeParticleField = (
  parent: THREE.Object3D, count: number, size: number, map?: THREE.Texture,
): ParticleField => {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size, map, vertexColors: true, blending: THREE.AdditiveBlending,
    depthWrite: false, transparent: true, fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false; // positions move on the CPU; skip the stale-bounds cull
  parent.add(points);
  return {
    points, pos, col,
    mark: () => {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
};

// ── merged tile geometry builders ─────────────────────────────────────────────

/**
 * Erase one quad from a merged, indexed geometry by folding its four vertices onto a single
 * point: both its triangles become degenerate and rasterize zero pixels. The alternative —
 * rebuilding the buffer without that quad — reallocates and re-uploads the whole mesh, which
 * for the ~6000-quad forest is a visible hitch on a single axe swing.
 */
const collapseQuad = (geo: THREE.BufferGeometry, vertStart: number): void => {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const x = pos.getX(vertStart);
  const y = pos.getY(vertStart);
  const z = pos.getZ(vertStart);
  for (let i = 0; i < 4; i++) pos.setXYZ(vertStart + i, x, y, z);
  pos.needsUpdate = true;
};

// Corner order of a flat quad, as (dx, dz) in half-tiles — the order positions are pushed in.
const AO_CORNERS: ReadonlyArray<readonly [number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/**
 * Baked ambient occlusion for one flat tile, as four corner shades: a corner hemmed in by
 * standing tiles (trees, walls) sees less of the sky, so it goes darker. This is depth from
 * LIGHT, not from geometry — the rule of the project is that nothing may grow out of its tile.
 *
 * Split out of buildFlatTileGeometry because felling a tree TILE has to re-bake it: the shade
 * around a tree's feet is baked into its NEIGHBOURS' vertex colours, so a tree that vanished
 * without this would leave its own shadow printed on the clearing the player just opened.
 */
const tileAoCorners = (x: number, z: number, solids?: ReadonlySet<string>): number[] =>
  AO_CORNERS.map(([dx, dz]) => {
    let occluders = 0;
    if (solids) {
      if (solids.has(`${x + dx},${z}`)) occluders++;
      if (solids.has(`${x},${z + dz}`)) occluders++;
      if (solids.has(`${x + dx},${z + dz}`)) occluders++;
    }
    return 1 - AO_MAX * (occluders / 3);
  });

const buildFlatTileGeometry = (
  tiles: Array<{ x: number; z: number; frame: number }>,
  y: number,
  solids?: ReadonlySet<string>,
): THREE.BufferGeometry => {
  const pos: number[] = [];
  const uv: number[] = [];
  const bounds: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  tiles.forEach(({ x, z, frame }, i) => {
    const f = tilesetFrameUv(frame);
    pos.push(x - 0.5, y, z - 0.5, x + 0.5, y, z - 0.5, x + 0.5, y, z + 0.5, x - 0.5, y, z + 0.5);
    uv.push(f.u0, f.v1, f.u1, f.v1, f.u1, f.v0, f.u0, f.v0);
    // Which frame of the atlas this quad may sample, so the texel-AA fetch cannot slide into the
    // next tile's art (pixelArtLight/zhTexelUv). Per vertex because it is ONE mesh: the whole
    // ground is a single draw and every quad in it windows onto a different tile.
    for (let k = 0; k < 4; k++) bounds.push(f.cu0, f.cv0, f.cu1, f.cv1);
    nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    for (const shade of tileAoCorners(x, z, solids)) col.push(shade, shade, shade);
    const b = i * 4;
    idx.push(b, b + 3, b + 2, b, b + 2, b + 1);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aUvBounds', new THREE.Float32BufferAttribute(bounds, 4));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
};

// Vertical walls closing the sunken river channel: one quad on every edge where a
// water tile meets a non-water tile, from the land (y=0) down to the bed (y=-depth).
const buildBankGeometry = (
  water: ReadonlySet<string>,
  bedTiles: ReadonlyArray<{ x: number; z: number }>,
  depth: number,
): THREE.BufferGeometry => {
  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const sides: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let v = 0;
  for (const { x, z } of bedTiles) {
    for (const [dx, dz] of sides) {
      if (water.has(`${x + dx},${z + dz}`)) continue; // neighbour is also water → no bank here
      // The shared edge, as two endpoints (a → b) on the ground plane.
      let ax: number; let az: number; let bx: number; let bz: number;
      if (dx !== 0) { ax = bx = x + dx * 0.5; az = z - 0.5; bz = z + 0.5; }
      else { az = bz = z + dz * 0.5; ax = x - 0.5; bx = x + 0.5; }
      // Quad: land edge (a,b at y=0) down to bed edge (b,a at y=-depth).
      pos.push(ax, 0, az, bx, 0, bz, bx, -depth, bz, ax, -depth, az);
      for (let k = 0; k < 4; k++) nrm.push(dx, 0, dz); // horizontal; DoubleSide lights both faces
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
};

const buildUprightTileGeometry = (
  tiles: ReadonlyArray<{ x: number; z: number; frame: number }>,
): THREE.BufferGeometry => {
  const pos: number[] = [];
  const uv: number[] = [];
  const bounds: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  tiles.forEach(({ x, z, frame }, i) => {
    const f = tilesetFrameUv(frame);
    // Upright quad on the tile, facing the (fixed-yaw) camera direction (+z).
    pos.push(x - 0.5, 1, z, x + 0.5, 1, z, x + 0.5, 0, z, x - 0.5, 0, z);
    uv.push(f.u0, f.v1, f.u1, f.v1, f.u1, f.v0, f.u0, f.v0);
    for (let k = 0; k < 4; k++) bounds.push(f.cu0, f.cv0, f.cu1, f.cv1);
    nrm.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
    const b = i * 4;
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aUvBounds', new THREE.Float32BufferAttribute(bounds, 4));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
};
