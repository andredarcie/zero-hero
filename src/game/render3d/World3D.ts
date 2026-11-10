
import * as THREE from 'three';

import { GroundLightMap } from './GroundLightMap';
import { installLazyMatrices } from './lazyMatrices';
import { AmbientParticles } from './AmbientParticles';

import { WaterMirror } from './WaterMirror';

import { ChunkShroud3D } from './ChunkShroud3D';

import { getDaylight } from '@/game/runtime/graphicsSettings';
import { getTimeOfDay, initializeTimeOfDay } from '@/game/runtime/timeOfDay';

import { registerTexture3D } from './textures3d';

import { createCanvas, platform } from '@/game/platform/platform';

import { makePuffTexture, makeRingTexture, makeSoftDotTexture } from './fxTextures';

import { defaultWorld3DParams } from './worldParams';

import { TerrainData, type SolidTileEntry } from './world/TerrainData';
import { WorldObjects } from './world/WorldObjects';
import { WorldLights } from './world/WorldLights';
import { LightProbe } from './world/LightProbe';
import { HeroLights } from './world/HeroLights';
import { SolidCastEmitter } from './world/SolidCastEmitter';
import { CastShadows } from './world/CastShadows';
import { ShadowLayers } from './world/ShadowLayers';
import { TerrainSorter } from './world/TerrainSorter';
import { TerrainGround } from './world/TerrainGround';
import { TerrainFeatures } from './world/TerrainFeatures';
import { TerrainBaker } from './world/TerrainBaker';
import { ShaderPrewarm } from './world/ShaderPrewarm';
import { WorldLook, type World3DParams } from './world/WorldLook';
import { SkyLight } from './world/SkyLight';
import { AirLight } from './AirLight';
import { WorldScreen } from './world/WorldScreen';
import { CameraRig } from './world/CameraRig';
import { WorldProjection } from './world/WorldProjection';
import { FrameRenderer } from './world/FrameRenderer';
import { FIRE_COLOR, FX_DOT_TEXTURE, RIVER_SURFACE_LIFT, WATER_DEPTH_TILES } from './world/worldDefs';
export type { World3DParams } from './world/WorldLook';
export { FX_DOT_TEXTURE } from './world/worldDefs';
export { STAIRS_PIT_DEPTH } from './world/TerrainFeatures';
export { WATER_DEPTH_TILES } from './world/worldDefs';
export type { TerrainTile } from './world/TerrainSorter';
export type { CastMemory } from './world/LightProbe';
export type { FireLight3D } from './world/WorldLights';
export type { Box3D, BoxSkinOpts, GroundEllipse } from './world/WorldObjects';

export const FX_RING_TEXTURE = 'fx-ring';
export const FX_PUFF_TEXTURE = 'fx-puff';

// ── The 3D world renderer (pixel-art lit) ─────────────────────────────────────
//
// Owns a Three.js canvas layered UNDER the (transparent) 2D canvas and
// renders the whole authored world in true 3D:
//
//   · terrain: every chunk's ground + flat decor merged into single meshes,
//     UV-mapped into the same forest_tile_set.png the 2D game uses; solid
//     upper tiles (trees/walls) become one merged upright-billboard mesh,
//     each with the ambient ground ellipse that anchored them in 2D
//   · dynamic actors join through Billboard3D (2D-sprite-like adapter)
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
// and they hold the pixel look; a real shadow map fought all three. (The old
// inert castShadow / customDepthMaterial flags are gone — they allocated a dead
// depth material per billboard; git history is the door back to real shadows.)
//
// The LOOK is pixel art wrapped in an HD-2D finish: the world renders at
// 1/pixelScale resolution with NEAREST-filtered tile art (chunky pixels), the
// direct light quantizes into flat bands (a stepped SNES lantern — see
// pixelArtLight.ts) capped at the art's own colours. On top of the scene render
// sits a post chain ported from the 3D
// prototype: ACES filmic tone mapping, an UnrealBloom halo on every emissive
// (flames, lava, glows, loot), and a single FinishShader that does the
// diorama tilt-shift depth-of-field, vignette and film grain. A cool moon
// DirectionalLight fills the night against the warm fire pools, and additive
// Points give the air brasas (embers) and drifting dust. Every stage is
// live-tunable through window.hd3d.
//
// The 2D engine keeps running on top: game logic, input, canvas UI and DOM overlays.
// GameScene drives this renderer once per frame (render(dt)) and projects any
// remaining screen-space 2D FX through projectTile().

// O PLANO DO ESPELHO: entre a superfície do mar e a do rio (RIVER_SURFACE_LIFT acima dela), as
// duas águas espelham no mesmo plano — a diferença entre elas é menos de meio pixel de arte.
const REFLECT_PLANE_Y = -WATER_DEPTH_TILES + RIVER_SURFACE_LIFT / 2;

// Module-level handle so world object classes (props, NPCs, items)
// can create their billboards without threading the renderer everywhere.
let currentWorld3D: World3D | undefined;
export const setCurrentWorld3D = (w: World3D | undefined): void => { currentWorld3D = w; };
export const world3d = (): World3D => {
  if (!currentWorld3D) throw new Error('World3D nao inicializado (GameScene.create)');
  return currentWorld3D;
};

export class World3D {
  public readonly params: World3DParams = defaultWorld3DParams();

  public readonly scene = new THREE.Scene();
  /** A mortalha dos chunks não-comprados do construtor de mundo (vazia fora dele). */
  public readonly chunkShroud = new ChunkShroud3D(this.scene);
  public readonly renderer: THREE.WebGLRenderer;
  /** Desliga o `resize` da janela (a janela é a da plataforma, ver platform.ts). */
  private stopWatchingResize: (() => void) | null = null;
  public readonly canvas: HTMLCanvasElement;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly ambientLight: THREE.AmbientLight;
  public readonly moonLight: THREE.DirectionalLight;
  public readonly shadowLight: THREE.PointLight;

  public appliedFov = 0;
  public elapsed = 0;
  /**
   * O relógio do mundo (ms desde que ele nasceu, avançado pelo próprio render). O vento lê ESTE relógio, e não o do
   * navegador: no jogo os dois andam juntos, e nas fotos de referência (visual-ref) só este é fixado.
   */
  public get elapsedMs(): number {
    return this.elapsed * 1000;
  }

  /** As brasas, a poeira, os vaga-lumes e a névoa (ver AmbientParticles). */
  public particles!: AmbientParticles;
  private dotTexture?: THREE.CanvasTexture;

  /** A soma das luzes pontuais por célula de luz do chão (ver GroundLightMap). */
  public groundLight!: GroundLightMap;
  public readonly camTarget = new THREE.Vector3();

  /** O espelho d'água (ver WaterMirror e pixelArtLight.WATER_REFLECT_GLSL). */
  public mirror!: WaterMirror;
  /** Moon-field instances dimmed by the statics' handoff, to restore next frame. */
  public readonly moonDimmed: SolidTileEntry[] = [];
  /** Ground heading a moon shadow points along (from the moon light's own position). */
  public moonCastRotY = 0;
  /** The knob values the moon field was last baked with; a live tune refills it. */
  public readonly appliedMoonShadow = { alpha: -1, length: -1, rotY: 0 };

  /** O terreno assado: tiles, malhas, materiais e campos de sombra. (ver TerrainData) */
  public readonly tiles = new TerrainData();

  public constructor() {
    // A HORA DO DIA vem ANTES de tudo. O renderizador nasce de novo a cada `scene.restart()` (a
    // morte é um), então a escolha mora fora dele (graphicsSettings + `?day`/`?night`), e ela tem
    // de estar aplicada antes que o fundo, o fog e as duas luzes sejam criados desta tabela — do
    // contrário o primeiro frame de uma partida de dia nasceria à meia-noite e viraria no segundo.
    // Old saved preferences and ?day/?night remain useful as a starting point, then the clock
    // takes over. This preserves existing deep links without freezing the sky forever.
    initializeTimeOfDay(getDaylight() >= 0.5 ? 0.5 : 0);
    this.look.applySky(getTimeOfDay());

    this.canvas = createCanvas();
    this.canvas.id = 'world3d';
    // The canvas backing store is LOW resolution (see applyPixelScale); CSS stretches it
    // over the window and `pixelated` upscales with NEAREST — the chunky pixel-art frame.
    this.canvas.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;z-index:0;display:block;image-rendering:pixelated;';
    platform().display.mountBehind(this.canvas);

    // NEAREST pixel art wants no MSAA (it would soften the tile edges), and the
    // post chain renders through offscreen targets where MSAA would be lost anyway.
    installLazyMatrices();
    this.renderer = platform().createRenderer3D(this.canvas);
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
    this.screen.applyPixelScale();

    // Fundo e fog são a MESMA cor por obrigação: um fog que não termina na cor do fundo desenha
    // uma emenda no infinito. Vem de `params.skyColor`, que o `render` mantém vivo.
    this.scene.background = new THREE.Color(this.params.skyColor);
    this.scene.fog = new THREE.FogExp2(this.params.skyColor, this.params.fogDensity);

    // A razão é a do BUFFER, que pode levar a margem da câmera de pixel suave (ver applyPixelScale).
    const bufSize = this.renderer.getSize(new THREE.Vector2());
    this.appliedFov = this.screen.effectiveFov(bufSize.x / bufSize.y);
    this.camera = new THREE.PerspectiveCamera(this.appliedFov, bufSize.x / bufSize.y, 0.1, 120);

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
    this.lights.createFireLights();
    this.groundLight = new GroundLightMap(this.renderer, () => this.lights.livePointLights());
    this.mirror = new WaterMirror(this.renderer, this.scene, this.camera, this.groundLight.view, REFLECT_PLANE_Y);
    this.hero.ensureHeroLight();
    this.hero.ensureTorchLight();
    // O disco da vista nasce aqui pelo mesmo motivo que a tocha: ele usa o programa do
    // `fireGlow`, e um material novo no meio do jogo é um link de shader no frame errado.
    this.hero.ensureSightGlow();

    this.terrain.buildTerrain();
    this.shadows.initShadowMask();
    this.screen.initPostProcessing();
    this.initParticles();

    this.stopWatchingResize = platform().display.onResize(this.handleResize);
  }

  // ── HD-2D post-processing chain ───────────────────────────────────────────────

  // ── ambient particles (embers + dust) ─────────────────────────────────────────

  private initParticles(): void {
    const dot = makeSoftDotTexture();
    this.dotTexture = dot;
    // The same two shapes every one-shot FX is built from (sparks, puffs, motes, shockwaves).
    // Published to the texture registry so they spawn as ordinary billboards — a hit spark is
    // a sprite in the world now, not a rectangle drawn over it.
    registerTexture3D(FX_DOT_TEXTURE, dot);
    registerTexture3D(FX_RING_TEXTURE, makeRingTexture());
    registerTexture3D(FX_PUFF_TEXTURE, makePuffTexture());
    this.particles = new AmbientParticles(this.scene, dot, this.tiles.greenTiles);
  }

  // ── static terrain ───────────────────────────────────────────────────────────

  // ── dynamic actors ───────────────────────────────────────────────────────────

  // ── fire lights ──────────────────────────────────────────────────────────────

  /**
   * O tile (x, y) está perto do que a câmera mostra? (A área de chão visível do último quadro, mais
   * 2 tiles de folga — um sprite de 1 tile em pé com o pé fora da tela ainda aparece, e a câmera anda
   * no máximo um terço de tile por quadro.) Para animar só o que alguém pode ver: o que fica fora
   * volta a ser animado no quadro em que entra, e a animação é função do relógio, não do histórico.
   */
  public isNearView(x: number, y: number, extra = 0): boolean {
    const v = this.groundLight.view;
    return x >= v.minX - extra && x <= v.maxX + extra && y >= v.minZ - extra && y <= v.maxZ + extra;
  }

  /** Point lights in the scene. Constant for the whole run — see FIRE_LIGHT_SLOTS. */
  public get lightCount(): number {
    return this.lights.fireLights.length + 3; // + shadowLight, heroLight, torchLight
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
      fires: this.lights.fires.length,
      litFires: this.lights.litFires.length,
      fireLightsUsed: this.lights.activeFireLights,
      castCasters: this.casts.castCasters.length,
      castPool: this.tiles.solidCastField.mesh.count,
      moonCastPool: this.tiles.moonCastField.mesh.count,
      // Os retângulos da barra dos maciços (ver buildMassShadowGeometry): é o número que diz se o
      // greedy mesh está fazendo o trabalho dele, e o que se olha se a barra um dia pesar.
      massShadowQuads: (this.shadows.massShadowMesh?.geometry.getIndex()?.count ?? 0) / 6,
      glowsLive: this.lights.fires.length,
      glowsPooled: this.lights.freeGlows.length,
    };
  }

  // ── firelight cast shadows (2D ground silhouettes) ────────────────────────────

  // ── camera ───────────────────────────────────────────────────────────────────

  // ── a hora do dia ────────────────────────────────────────────────────────────

  // ── frame ────────────────────────────────────────────────────────────────────

  private readonly handleResize = (): void => {
    this.screen.applyPixelScale(); // ela também acerta a razão da câmera (a do buffer)
  };
  /** Os objetos soltos: billboard, elipse, caixa, malha acesa, farfalhar. (ver WorldObjects) */
  public readonly objects: WorldObjects = new WorldObjects(this);
  /** O pool de luzes de fogo e as fogueiras. (ver WorldLights) */
  public readonly lights: WorldLights = new WorldLights(this);
  /** Quanto de luz chega a um ponto, e de qual fogo. (ver LightProbe) */
  public readonly probe: LightProbe = new LightProbe(this);
  /** A tocha na mão e a vista do herói. (ver HeroLights) */
  public readonly hero: HeroLights = new HeroLights(this);
  /** A sombra que um sólido joga para longe de uma chama. (ver SolidCastEmitter) */
  public readonly emit: SolidCastEmitter = new SolidCastEmitter(this);
  /** As sombras de fogo, refeitas a cada quadro. (ver CastShadows) */
  public readonly casts: CastShadows = new CastShadows(this);
  /** A máscara de sombra e a sombra dos maciços. (ver ShadowLayers) */
  public readonly shadows: ShadowLayers = new ShadowLayers(this);
  /** A varredura que põe cada tile no seu balde. (ver TerrainSorter) */
  public readonly sorter: TerrainSorter = new TerrainSorter(this);
  /** A serra, o chão, a água e o calçamento. (ver TerrainGround) */
  public readonly ground: TerrainGround = new TerrainGround(this);
  /** A lava, o poço, a decoração, os sólidos, a névoa e as sombras assadas. (ver TerrainFeatures) */
  public readonly features: TerrainFeatures = new TerrainFeatures(this);
  /** O assado do terreno: a ordem dos passos, os cubos e o re-assado. (ver TerrainBaker) */
  public readonly terrain: TerrainBaker = new TerrainBaker(this);
  /** A compilação de todos os shaders antes do primeiro quadro. (ver ShaderPrewarm) */
  public readonly prewarm: ShaderPrewarm = new ShaderPrewarm(this);
  /** O céu, a hora do dia e o grade de cor. (ver WorldLook) */
  public readonly look: WorldLook = new WorldLook(this);
  /** As nuvens, o céu na água e a cor da luz no ar, a cada quadro. (ver SkyLight) */
  public readonly sky: SkyLight = new SkyLight(this);
  /** A luz no ar: os fachos de sol entre as copas e o halo das chamas. (ver AirLight) */
  public readonly air: AirLight = new AirLight(this);
  /** O tamanho do buffer e a cadeia de pós. (ver WorldScreen) */
  public readonly screen: WorldScreen = new WorldScreen(this);
  /** A câmera que segue o herói. (ver CameraRig) */
  public readonly cam: CameraRig = new CameraRig(this);
  /** Do mundo para a tela e de volta. (ver WorldProjection) */
  public readonly projection: WorldProjection = new WorldProjection(this);
  /** O quadro: atualizar tudo e desenhar. (ver FrameRenderer) */
  public readonly frame: FrameRenderer = new FrameRenderer(this);

  public dispose(): void {
    this.stopWatchingResize?.();
    this.stopWatchingResize = null;
    // `material` pode ser ARRAY (a alvenaria de cubo das dungeons agrupa teto/lados): um
    // `material?.dispose()` direto estoura "dispose is not a function" no meio do teardown e
    // deixa a cena que vem depois (o editor acordando do ESC) sem o wake. Ninguém viu por anos
    // porque só o editor do subterrâneo percorre esse caminho com um mesh multi-material vivo.
    const disposeMaterial = (mat?: THREE.Material | THREE.Material[]): void => {
      if (Array.isArray(mat)) mat.forEach((entry) => entry.dispose());
      else mat?.dispose();
    };
    this.scene.traverse((obj) => {
      // Dispose meshes AND particle Points (both carry geometry + material).
      const withGeo = obj as THREE.Object3D & {
        isMesh?: boolean; isPoints?: boolean;
        geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[];
      };
      if (withGeo.isMesh || withGeo.isPoints) {
        withGeo.geometry?.dispose();
        disposeMaterial(withGeo.material);
      }
    });
    this.dotTexture?.dispose();
    this.shadows.maskScene.traverse((obj) => {
      const withGeo = obj as THREE.Object3D & {
        isMesh?: boolean; geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[];
      };
      if (withGeo.isMesh) {
        withGeo.geometry?.dispose();
        disposeMaterial(withGeo.material);
      }
    });
    this.shadows.maskTarget.dispose();
    this.screen.composer.dispose();
    this.air.dispose();
    this.groundLight.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}

