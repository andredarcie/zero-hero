// ── Zero the Hero — HD-2D prototype in REAL 3D (Three.js) ────────────────────
//
// Faithful 3D recreation of the game's OPENING SCENE, driven by the exact same
// data the 2D game uses: /world.json (terrain, props, NPCs, pickups, player
// start) and the same pixel-art textures, including the real ground tiles from
// forest_tile_set.png.
//
//   · the ground is a merged mesh of real tiles (one quad per tile, UV-mapped
//     into the game's tileset) on a true 3D plane under a pitched camera
//   · trees / props / NPCs / hero are upright billboards standing on it — each
//     still fits its 1-tile footprint (the game's fundamental rule)
//   · the HOME campfire (nearest the player start, same rule as the game) is a
//     real PointLight: flicker, warm pool, TRUE dynamic shadows
//   · sprites are lit like the 2D game lights them: uniformly, by the ground
//     at their feet — warm inside a fire's pool, cold in the open night
//   · HD-2D finish: ACES tonemapping, bloom, tilt-shift, vignette, grain
//
// Controls: WASD / arrows, grid steps at the game's own 140 ms cadence.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ── game data constants (mirrors src/game/constants.ts) ──────────────────────

const CHUNK = 12;
const TILESET_COLS = 3;
const TILESET_ROWS = 9;
const SOLID_UPPER_FRAMES = new Set([3, 4, 14, 15, 16, 17, 18, 21]);
const VOID_GROUND_FRAME = 5;
const VOID_WALL_FRAME = 4;
const MOVE_MS = 140;
const REGION_CHUNKS = 1; // chunks loaded around the start chunk (1 → 3×3, like the game)

interface WorldJson {
  meta: { playerStart: { worldX: number; worldY: number }; worldChunksX: number; worldChunksY: number };
  chunks: Array<{
    cx: number; cy: number;
    ground: number[][];
    upper: Array<Array<number | null>>;
    collisions: boolean[][];
    npcs: Array<{ type: string; worldX: number; worldY: number }>;
    pickups: Array<{ type: string; worldX: number; worldY: number }>;
  }>;
  props: Array<{ type: string; worldX: number; worldY: number; lit?: boolean }>;
}

// ── renderer / scene / camera ─────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#070811');
scene.fog = new THREE.FogExp2('#070811', 0.04);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 100);
const CAM_OFFSET = new THREE.Vector3(0, 8.4, 7.6); // ~48° diorama pitch
const camTarget = new THREE.Vector3();

// ── lights (values tuned live in the browser) ─────────────────────────────────

const ambient = new THREE.AmbientLight('#55689f', 9);
scene.add(ambient);
const moon = new THREE.DirectionalLight('#6478b4', 3.2);
moon.position.set(-6, 10, -4);
scene.add(moon);

const FIRE_INTENSITY = 14;
const fireLight = new THREE.PointLight('#ffa050', FIRE_INTENSITY, 13, 1.8);
fireLight.castShadow = true;
fireLight.shadow.mapSize.set(1024, 1024);
fireLight.shadow.camera.near = 0.4;
fireLight.shadow.camera.far = 14;
fireLight.shadow.bias = -0.005;
scene.add(fireLight);

// ── textures ──────────────────────────────────────────────────────────────────

const texLoader = new THREE.TextureLoader();
const loadPixelTex = (url: string): THREE.Texture => {
  const t = texLoader.load(url);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const A = '/assets';
const tilesetTex = loadPixelTex(`${A}/environment/tilesets/forest_tile_set.png`);
const fireFrames = [0, 1, 2].map((i) => loadPixelTex(`${A}/effects/fire/sprite_fire${i}.png`));
const waterFrames = [0, 1, 2, 3].map((i) => loadPixelTex(`${A}/environment/terrain/water_${i}.png`));
const grassWindFrames = [0, 1].map((i) => loadPixelTex(`${A}/environment/props/grass_wind${i}.png`));

// woods.png is a 16×96 sheet; frame 0 (the full dry tree) is the top slice.
const dryTreeTex = loadPixelTex(`${A}/environment/props/woods.png`);
dryTreeTex.repeat.set(1, 1 / 6);
dryTreeTex.offset.set(0, 5 / 6);

const PROP_TEXTURES: Record<string, THREE.Texture> = {
  dryBush: loadPixelTex(`${A}/environment/props/bush.png`),
  dryShrub: loadPixelTex(`${A}/environment/props/dry_shrub.png`),
  rock: loadPixelTex(`${A}/environment/props/rock.png`),
  lockedDoor: loadPixelTex(`${A}/environment/structures/locked_door.png`),
  dryTree: dryTreeTex,
};

const NPC_SHEET = loadPixelTex(`${A}/characters/npcs/npcs.png`); // 2×3 grid of 16×16
const NPC_SHEET_FRAMES: Record<string, number> = {
  blackCat: 0, mimic: 1, astronaut: 2, businessMan: 3, radiationSuit: 4, painter: 5,
};
const NPC_SINGLES: Record<string, string> = {
  salesman: `${A}/characters/npcs/salesman.png`,
  poet: `${A}/characters/npcs/poet.png`,
  watchman: `${A}/characters/npcs/watchman.png`,
  wizard: `${A}/characters/enemies/mage/mage__1.png`,
  death: `${A}/ui/states/death.png`,
};

const PICKUP_TEXTURES: Record<string, string> = {
  axe: `${A}/ui/icons/axe_icon.png`,
  sword: `${A}/ui/icons/sword_icon.png`,
  key: `${A}/ui/icons/key_icon.png`,
  bomb: `${A}/ui/icons/bomb_icon.png`,
  lavaBoots: `${A}/ui/icons/lava_boots_icon.png`,
  pickaxe: `${A}/ui/icons/pickaxe_icon.png`,
  scythe: `${A}/ui/icons/scythe_icon.png`,
  wood: `${A}/ui/icons/wood_icon.png`,
  heart: `${A}/items/collectibles/heart.png`,
};

// Hero: 80×16 sheet, five 16×16 frames (walk 0-3, idle down = 3).
const HERO_FRAME_COUNT = 5;
const heroFrames: THREE.Texture[] = [];
for (let i = 0; i < HERO_FRAME_COUNT; i++) {
  const t = loadPixelTex(`${A}/characters/player/hero.png`);
  t.repeat.set(1 / HERO_FRAME_COUNT, 1);
  t.offset.set(i / HERO_FRAME_COUNT, 0);
  heroFrames.push(t);
}

// ── HD-2D sprite lighting ─────────────────────────────────────────────────────
// Billboards must not go black when a light sits behind their plane, and the 2D
// game lights each sprite UNIFORMLY by the tile it stands on. Reproduce that:
//   · fragment: light against the GROUND's normal (straight up)
//   · vertex: evaluate lighting at the sprite's FOOT (its object origin), so
//     the whole sprite takes one light sample — warm in a fire pool, cold out.
const lightLikeThe2dGame = (mat: THREE.Material): void => {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      'vViewPosition = - mvPosition.xyz;',
      'vViewPosition = - (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;',
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
       normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`,
    );
  };
};

// ── tileset UV helpers ────────────────────────────────────────────────────────

const frameUv = (frame: number): { u0: number; u1: number; v0: number; v1: number } => {
  const col = frame % TILESET_COLS;
  const row = Math.floor(frame / TILESET_COLS);
  const inset = 0.35; // texels; keeps NEAREST sampling off neighbour frames
  return {
    u0: (col * 16 + inset) / (TILESET_COLS * 16),
    u1: ((col + 1) * 16 - inset) / (TILESET_COLS * 16),
    v0: (TILESET_ROWS * 16 - (row + 1) * 16 + inset) / (TILESET_ROWS * 16),
    v1: (TILESET_ROWS * 16 - row * 16 - inset) / (TILESET_ROWS * 16),
  };
};

// One merged geometry per flat layer (ground / flat decor) — a single draw call.
const buildFlatLayer = (tiles: Array<{ x: number; z: number; frame: number }>, y: number): THREE.BufferGeometry => {
  const pos: number[] = [];
  const uv: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  tiles.forEach(({ x, z, frame }, i) => {
    const f = frameUv(frame);
    // NW, NE, SE, SW (north = -z shows the frame's top)
    pos.push(x - 0.5, y, z - 0.5, x + 0.5, y, z - 0.5, x + 0.5, y, z + 0.5, x - 0.5, y, z + 0.5);
    uv.push(f.u0, f.v1, f.u1, f.v1, f.u1, f.v0, f.u0, f.v0);
    nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    const b = i * 4;
    idx.push(b, b + 3, b + 2, b, b + 2, b + 1);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
};

// ── billboards ────────────────────────────────────────────────────────────────

const solidTiles = new Set<string>();
const tileKey = (x: number, z: number) => `${Math.round(x)},${Math.round(z)}`;

interface BillboardOpts {
  size?: number;
  solid?: boolean;
  uv?: { u0: number; u1: number; v0: number; v1: number };
  tint?: string;
}

const makeBillboard = (tex: THREE.Texture, x: number, z: number, opts: BillboardOpts = {}): THREE.Mesh => {
  const size = opts.size ?? 1;
  const geo = new THREE.PlaneGeometry(size, size);
  geo.translate(0, size / 2, 0); // anchor at the feet
  if (opts.uv) {
    const a = geo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) {
      a.setXY(i, opts.uv.u0 + a.getX(i) * (opts.uv.u1 - opts.uv.u0), opts.uv.v0 + a.getY(i) * (opts.uv.v1 - opts.uv.v0));
    }
  }
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.5,
    roughness: 1,
    metalness: 0,
    color: opts.tint ?? '#ffffff',
  });
  lightLikeThe2dGame(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0, z);
  mesh.castShadow = true;
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: tex,
    alphaTest: 0.5,
  });
  scene.add(mesh);
  if (opts.solid ?? true) solidTiles.add(tileKey(x, z));
  return mesh;
};

// ── build the opening scene from world.json ───────────────────────────────────

const world = (await (await fetch('/world.json')).json()) as WorldJson;
const start = world.meta.playerStart;
const startCx = Math.floor(start.worldX / CHUNK);
const startCy = Math.floor(start.worldY / CHUNK);
const chunkAt = new Map(world.chunks.map((c) => [`${c.cx},${c.cy}`, c]));

const groundTiles: Array<{ x: number; z: number; frame: number }> = [];
const decorTiles: Array<{ x: number; z: number; frame: number }> = [];

for (let cy = startCy - REGION_CHUNKS; cy <= startCy + REGION_CHUNKS; cy++) {
  for (let cx = startCx - REGION_CHUNKS; cx <= startCx + REGION_CHUNKS; cx++) {
    const chunk = chunkAt.get(`${cx},${cy}`);
    for (let row = 0; row < CHUNK; row++) {
      for (let col = 0; col < CHUNK; col++) {
        const wx = cx * CHUNK + col;
        const wy = cy * CHUNK + row;
        if (!chunk) {
          // Outside the authored world: the same solid void border the game shows.
          groundTiles.push({ x: wx, z: wy, frame: VOID_GROUND_FRAME });
          makeBillboard(tilesetTex, wx, wy, { uv: frameUv(VOID_WALL_FRAME) });
          continue;
        }
        groundTiles.push({ x: wx, z: wy, frame: chunk.ground[row][col] });
        const upper = chunk.upper[row][col];
        const collides = chunk.collisions[row][col];
        if (upper !== null) {
          if (collides || SOLID_UPPER_FRAMES.has(upper)) {
            makeBillboard(tilesetTex, wx, wy, { uv: frameUv(upper) }); // a standing tree/wall
          } else {
            decorTiles.push({ x: wx, z: wy, frame: upper }); // flat decor stays on the ground
          }
        } else if (collides) {
          solidTiles.add(tileKey(wx, wy));
        }
      }
    }
  }
}

const inRegion = (wx: number, wy: number): boolean =>
  Math.floor(wx / CHUNK) >= startCx - REGION_CHUNKS && Math.floor(wx / CHUNK) <= startCx + REGION_CHUNKS &&
  Math.floor(wy / CHUNK) >= startCy - REGION_CHUNKS && Math.floor(wy / CHUNK) <= startCy + REGION_CHUNKS;

const groundMat = new THREE.MeshStandardMaterial({
  map: tilesetTex,
  roughness: 1,
  metalness: 0,
  // Slightly cool tint so the warm firelight lands amber instead of lime.
  color: '#c2c6d8',
  side: THREE.DoubleSide,
});
const groundMesh = new THREE.Mesh(buildFlatLayer(groundTiles, 0), groundMat);
groundMesh.receiveShadow = true;
scene.add(groundMesh);

const decorMat = new THREE.MeshStandardMaterial({
  map: tilesetTex,
  transparent: true,
  alphaTest: 0.35,
  roughness: 1,
  metalness: 0,
  color: '#c2c6d8',
  side: THREE.DoubleSide,
});
const decorMesh = new THREE.Mesh(buildFlatLayer(decorTiles, 0.02), decorMat);
decorMesh.receiveShadow = true;
scene.add(decorMesh);

// ── props ─────────────────────────────────────────────────────────────────────

// The home fire: nearest campfire to the player start (the game's own rule).
const campfires = world.props.filter((p) => p.type === 'campfire');
let homeFire = campfires[0];
let best = Infinity;
for (const cf of campfires) {
  const d = Math.hypot(cf.worldX - start.worldX, cf.worldY - start.worldY);
  if (d < best) { best = d; homeFire = cf; }
}

const fireMats: THREE.MeshBasicMaterial[] = [];
const waterMats: THREE.MeshBasicMaterial[] = [];
const grassMats: THREE.MeshStandardMaterial[] = [];

for (const prop of world.props) {
  if (!inRegion(prop.worldX, prop.worldY)) continue;
  const { worldX: x, worldY: z, type } = prop;
  if (type === 'campfire') {
    const lit = prop === homeFire || prop.lit === true;
    if (lit) {
      // Emissive flipbook (HDR-bright → bloom halo), plus the real light below.
      const mat = new THREE.MeshBasicMaterial({
        map: fireFrames[0], transparent: true, alphaTest: 0.35,
        color: new THREE.Color(2.2, 1.9, 1.5), fog: false,
      });
      fireMats.push(mat);
      const geo = new THREE.PlaneGeometry(0.9, 0.9);
      geo.translate(0, 0.45, 0);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, 0, z);
      scene.add(mesh);
      solidTiles.add(tileKey(x, z));
    } else {
      // Dead fire: the same sprite as cold ash-brown charred logs.
      makeBillboard(fireFrames[0], x, z, { size: 0.9, tint: '#4a3a28' });
    }
  } else if (type === 'water' || type === 'bridgeSpot') {
    const mat = new THREE.MeshBasicMaterial({ map: waterFrames[0], color: '#9fb4dd' });
    waterMats.push(mat);
    const mesh = new THREE.Mesh(buildFlatLayer([{ x, z, frame: 0 }], 0.015), mat);
    // buildFlatLayer maps tileset UVs; water is a full standalone texture — reset to 0..1.
    const a = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    a.setXY(0, 0, 1); a.setXY(1, 1, 1); a.setXY(2, 1, 0); a.setXY(3, 0, 0);
    scene.add(mesh);
    solidTiles.add(tileKey(x, z));
  } else if (type === 'lava') {
    const mat = new THREE.MeshBasicMaterial({
      map: loadPixelTex(`${A}/environment/terrain/lava_floor.png`),
      color: new THREE.Color(1.6, 1.2, 0.9), fog: false,
    });
    const mesh = new THREE.Mesh(buildFlatLayer([{ x, z, frame: 0 }], 0.015), mat);
    const a = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    a.setXY(0, 0, 1); a.setXY(1, 1, 1); a.setXY(2, 1, 0); a.setXY(3, 0, 0);
    scene.add(mesh);
    solidTiles.add(tileKey(x, z));
  } else if (type === 'tallGrass') {
    const mat = new THREE.MeshStandardMaterial({
      map: grassWindFrames[0], transparent: true, alphaTest: 0.5, roughness: 1,
    });
    lightLikeThe2dGame(mat);
    grassMats.push(mat);
    const geo = new THREE.PlaneGeometry(0.94, 0.94);
    geo.translate(0, 0.47, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0, z);
    mesh.castShadow = true;
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking, map: grassWindFrames[0], alphaTest: 0.5,
    });
    scene.add(mesh);
    solidTiles.add(tileKey(x, z));
  } else {
    const tex = PROP_TEXTURES[type];
    if (tex) makeBillboard(tex, x, z, { size: type === 'dryShrub' ? 0.8 : type === 'rock' ? 0.9 : 1 });
  }
}

fireLight.position.set(homeFire.worldX, 1.0, homeFire.worldY);

// ── NPCs & pickups from the start chunks ──────────────────────────────────────

for (const chunk of world.chunks) {
  if (Math.abs(chunk.cx - startCx) > REGION_CHUNKS || Math.abs(chunk.cy - startCy) > REGION_CHUNKS) continue;
  for (const npc of chunk.npcs) {
    const sheetFrame = NPC_SHEET_FRAMES[npc.type];
    if (sheetFrame !== undefined) {
      const col = sheetFrame % 2;
      const row = Math.floor(sheetFrame / 2);
      makeBillboard(NPC_SHEET, npc.worldX, npc.worldY, {
        uv: { u0: col / 2, u1: (col + 1) / 2, v0: (2 - row) / 3, v1: (3 - row) / 3 },
      });
    } else if (NPC_SINGLES[npc.type]) {
      makeBillboard(loadPixelTex(NPC_SINGLES[npc.type]), npc.worldX, npc.worldY, {
        size: npc.type === 'death' ? 2 : 1,
      });
    }
  }
  for (const pickup of chunk.pickups) {
    const url = PICKUP_TEXTURES[pickup.type];
    if (!url) continue;
    makeBillboard(loadPixelTex(url), pickup.worldX, pickup.worldY, { size: 0.6, solid: false });
  }
}

// ── hero ──────────────────────────────────────────────────────────────────────

const heroMat = new THREE.MeshStandardMaterial({
  map: heroFrames[3], transparent: true, alphaTest: 0.5, roughness: 1,
});
lightLikeThe2dGame(heroMat);
const heroGeo = new THREE.PlaneGeometry(1, 1);
heroGeo.translate(0, 0.5, 0);
const hero = new THREE.Mesh(heroGeo, heroMat);
hero.castShadow = true;
hero.customDepthMaterial = new THREE.MeshDepthMaterial({
  depthPacking: THREE.RGBADepthPacking, map: heroFrames[3], alphaTest: 0.5,
});
scene.add(hero);

const heroTile = { x: start.worldX, z: start.worldY };
hero.position.set(heroTile.x, 0, heroTile.z);
camTarget.copy(hero.position);
let moving = false;
let moveT = 0;
const moveFrom = new THREE.Vector3();
const moveTo = new THREE.Vector3();
let walkClock = 0;
let facingLeft = false;

const keys = new Set<string>();
window.addEventListener('keydown', (e) => keys.add(e.code));
window.addEventListener('keyup', (e) => keys.delete(e.code));

const tryStep = (): void => {
  let dx = 0;
  let dz = 0;
  if (keys.has('ArrowUp') || keys.has('KeyW')) dz = -1;
  else if (keys.has('ArrowDown') || keys.has('KeyS')) dz = 1;
  else if (keys.has('ArrowLeft') || keys.has('KeyA')) dx = -1;
  else if (keys.has('ArrowRight') || keys.has('KeyD')) dx = 1;
  if (dx === 0 && dz === 0) return;
  const nx = heroTile.x + dx;
  const nz = heroTile.z + dz;
  if (dx !== 0) facingLeft = dx < 0;
  if (solidTiles.has(tileKey(nx, nz)) || !inRegion(nx, nz)) return;
  heroTile.x = nx;
  heroTile.z = nz;
  moveFrom.copy(hero.position);
  moveTo.set(nx, 0, nz);
  moving = true;
  moveT = 0;
};

// ── embers & dust ─────────────────────────────────────────────────────────────

interface Particle { life: number; maxLife: number; vel: THREE.Vector3 }

const makePoints = (count: number, size: number): { points: THREE.Points; pos: Float32Array; col: Float32Array } => {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  return { points, pos, col };
};

const EMBERS = 26;
const embers = makePoints(EMBERS, 0.09);
const emberState: Particle[] = Array.from({ length: EMBERS }, () => ({
  life: Math.random(), maxLife: 0.9 + Math.random() * 0.9, vel: new THREE.Vector3(),
}));

const DUST = 140;
const dust = makePoints(DUST, 0.05);
const dustSeed = new Float32Array(DUST);
for (let i = 0; i < DUST; i++) {
  dust.pos[i * 3] = start.worldX + (Math.random() - 0.5) * 30;
  dust.pos[i * 3 + 1] = 0.2 + Math.random() * 2.4;
  dust.pos[i * 3 + 2] = start.worldY + (Math.random() - 0.5) * 30;
  dustSeed[i] = Math.random() * Math.PI * 2;
}

// ── post-processing: bloom + tilt-shift + vignette + grain ────────────────────

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.65, 0.72,
);
composer.addPass(bloom);

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uTime: { value: 0 },
    uFocusY: { value: 0.52 },
    uBand: { value: 0.14 },
    uBlur: { value: 3.2 },
    uVignette: { value: 0.34 },
    uGrain: { value: 0.02 },
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
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;
    void main() {
      float d = abs(vUv.y - uFocusY);
      float t = smoothstep(uBand, uBand + 0.34, d);
      vec2 px = (uBlur * t) / uResolution;
      vec3 col = texture2D(tDiffuse, vUv).rgb * 0.30;
      col += texture2D(tDiffuse, vUv + vec2( 1.0,  0.6) * px).rgb * 0.12;
      col += texture2D(tDiffuse, vUv + vec2(-1.0,  0.6) * px).rgb * 0.12;
      col += texture2D(tDiffuse, vUv + vec2( 1.0, -0.6) * px).rgb * 0.12;
      col += texture2D(tDiffuse, vUv + vec2(-1.0, -0.6) * px).rgb * 0.12;
      col += texture2D(tDiffuse, vUv + vec2( 0.0,  1.4) * px).rgb * 0.11;
      col += texture2D(tDiffuse, vUv + vec2( 0.0, -1.4) * px).rgb * 0.11;
      vec2 vuv = (vUv - 0.5) * vec2(1.0, 1.2);
      col *= 1.0 - smoothstep(0.5, 0.95, length(vuv)) * uVignette;
      float n = fract(sin(dot(vUv * uResolution + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
const finishPass = new ShaderPass(FinishShader);
composer.addPass(finishPass);

// Live-tuning knobs, same spirit as window.hd2d in the 2D pipeline.
declare global { interface Window { proto3d?: Record<string, unknown> } }
window.proto3d = {
  fireLight, bloom, finish: finishPass.uniforms, camOffset: CAM_OFFSET,
  fog: scene.fog, amb: ambient, moon, exposure: renderer,
};

// ── resize ────────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  finishPass.uniforms.uResolution.value.set(w, h);
});

// ── main loop ─────────────────────────────────────────────────────────────────

const clock = new THREE.Clock();
let fireFrame = 0;
let fireFrameT = 0;
let waterFrame = 0;
let waterFrameT = 0;
let grassFrame = 0;
let grassFrameT = 0;
let flicker = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  // grid movement, 140 ms per tile like the game
  if (!moving) tryStep();
  if (moving) {
    moveT += (dt * 1000) / MOVE_MS;
    if (moveT >= 1) {
      moving = false;
      hero.position.copy(moveTo);
    } else {
      hero.position.lerpVectors(moveFrom, moveTo, moveT);
    }
    walkClock += dt;
    const frame = Math.floor(walkClock * 12) % 4;
    heroMat.map = heroFrames[frame];
    (hero.customDepthMaterial as THREE.MeshDepthMaterial).map = heroFrames[frame];
  } else {
    heroMat.map = heroFrames[3];
  }
  hero.scale.x = facingLeft ? -1 : 1;

  // camera follows the hero at the fixed diorama pitch
  camTarget.lerp(hero.position, 1 - Math.exp(-dt * 6));
  camera.position.copy(camTarget).add(CAM_OFFSET);
  camera.lookAt(camTarget.x, camTarget.y + 0.4, camTarget.z);

  // flipbooks: fire (140 ms), water (260 ms), grass wind (420 ms)
  fireFrameT += dt * 1000;
  if (fireFrameT > 140) {
    fireFrameT = 0;
    fireFrame = (fireFrame + 1) % fireFrames.length;
    for (const m of fireMats) m.map = fireFrames[fireFrame];
  }
  waterFrameT += dt * 1000;
  if (waterFrameT > 260) {
    waterFrameT = 0;
    waterFrame = (waterFrame + 1) % waterFrames.length;
    for (const m of waterMats) m.map = waterFrames[waterFrame];
  }
  grassFrameT += dt * 1000;
  if (grassFrameT > 420) {
    grassFrameT = 0;
    grassFrame = (grassFrame + 1) % grassWindFrames.length;
    for (const m of grassMats) m.map = grassWindFrames[grassFrame];
  }

  // firelight flicker — the same random-walk feel as the 2D game's lightFlicker
  flicker += (Math.random() - 0.5) * 0.35;
  flicker *= 0.9;
  fireLight.intensity = FIRE_INTENSITY * (1 + flicker * 0.25);
  fireLight.position.x = homeFire.worldX + flicker * 0.06;
  fireLight.position.z = homeFire.worldY + flicker * 0.04;

  // embers rise from the home fire
  for (let i = 0; i < EMBERS; i++) {
    const p = emberState[i];
    p.life += dt;
    if (p.life >= p.maxLife) {
      p.life = 0;
      p.maxLife = 0.9 + Math.random() * 0.9;
      embers.pos[i * 3] = homeFire.worldX + (Math.random() - 0.5) * 0.35;
      embers.pos[i * 3 + 1] = 0.5 + Math.random() * 0.2;
      embers.pos[i * 3 + 2] = homeFire.worldY + (Math.random() - 0.5) * 0.35;
      p.vel.set((Math.random() - 0.5) * 0.35, 0.9 + Math.random() * 0.7, (Math.random() - 0.5) * 0.35);
    }
    embers.pos[i * 3] += p.vel.x * dt;
    embers.pos[i * 3 + 1] += p.vel.y * dt;
    embers.pos[i * 3 + 2] += p.vel.z * dt;
    const a = 1 - p.life / p.maxLife;
    embers.col[i * 3] = 1.6 * a;
    embers.col[i * 3 + 1] = 0.75 * a;
    embers.col[i * 3 + 2] = 0.3 * a * a;
  }
  embers.points.geometry.attributes.position.needsUpdate = true;
  embers.points.geometry.attributes.color.needsUpdate = true;

  // dust drifts in the night air, glinting near the firelight
  for (let i = 0; i < DUST; i++) {
    const s = dustSeed[i];
    dust.pos[i * 3] += Math.sin(time * 0.35 + s) * 0.0009;
    dust.pos[i * 3 + 1] += Math.cos(time * 0.22 + s * 2.0) * 0.0011;
    dust.pos[i * 3 + 2] += Math.cos(time * 0.28 + s) * 0.0009;
    const dxp = dust.pos[i * 3] - homeFire.worldX;
    const dzp = dust.pos[i * 3 + 2] - homeFire.worldY;
    const glow = Math.max(0.06, 1 - Math.hypot(dxp, dzp) / 9);
    const tw = 0.55 + 0.45 * Math.sin(time * 1.7 + s * 5.0);
    dust.col[i * 3] = 0.5 * glow * tw;
    dust.col[i * 3 + 1] = 0.42 * glow * tw;
    dust.col[i * 3 + 2] = 0.3 * glow * tw;
  }
  dust.points.geometry.attributes.position.needsUpdate = true;
  dust.points.geometry.attributes.color.needsUpdate = true;

  finishPass.uniforms.uTime.value = time;
  composer.render();
});
