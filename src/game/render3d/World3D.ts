import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import {
  CHUNK_COLUMNS, CHUNK_ROWS, CLIFF_WALL_FRAMES, DUNGEON_WALL_FRAMES, SEA_TILE_FRAME, SEA_TILE_FRAMES,
  SOLID_UPPER_FRAMES, TILESET_FRAME_SIZE, TIMINGS,
} from '@/game/constants';
import {
  getBridgeSpots, getChunkTerrain, getLavaTiles, getStairs, getWaterTiles, getWorldBounds, isInsideWorld,
} from '@/game/world/WorldData';
import { profiler } from '@/game/debug/Profiler';
import { Billboard3D, type Billboard3DOptions } from './Billboard3D';
import { ChunkShroud3D, shroudDayUniform } from './ChunkShroud3D';
import {
  applyCast, CAST_MAX_ALPHA, type CastPose, castTransformInto, handoffCastInto,
  makeCastMaskMaterial, makeCastMesh, SolidCastField, WIDTH_FACTOR as CAST_WIDTH_FACTOR,
} from './CastShadow3D';
import { buildShadowBlobGeometry, makeShadowBlob, makeShadowBlobMaterial } from './groundShadow';
import {
  getDaylight, getDofIntensity, getPixelScale, setDaylight,
} from '@/game/runtime/graphicsSettings';
import { isUnderground } from '@/game/runtime/underworld';
import {
  FIRE_WOBBLE_GLSL, flowTimeUniform, lightCapUniform, lightResUniform, lightStepsUniform, windUniform,
  lightWobbleUniform, patchPixelMaterial, seaFlowUniform, SHADOW_MASK_GLSL, shadowMaskOnUniform,
  shadowMaskRectUniform, shadowMaskUniform, syncTexelAaUniforms, texelAaUniform, waterGlintUniform,
  type TexelAaUniforms,
} from './pixelArtLight';
import { DAY_SKY } from './skyPreset';
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
export const FX_ICE_TEXTURE = 'fx-ice';
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
// A altura da CORTINA de névoa. As árvores medem 1; 1.3 cobre a copa com folga, para nenhuma
// ponta de pinheiro furar a névoa por cima.
const VOID_MIST_HEIGHT = 1.3;

/**
 * O BAQUE DIRECIONAL (ver `shake`): quanto do impacto é uma INCLINAÇÃO na direção do golpe e
 * quanto continua sendo o chacoalho aleatório.
 *
 * A inclinação é a menor das duas de propósito. O que um impacto tem a dizer sobre si é sobretudo
 * "aconteceu", e só depois "veio dali" — uma câmera que salta forte para um lado a cada golpe
 * cansa em trinta segundos, e o combate deste jogo acerta muitas vezes por briga. Com 0,55 contra
 * 0,7, a direção aparece como um viés que se lê sem se notar.
 *
 * Um tremor SEM direção não passa por nenhuma das duas: ele mantém o chacoalho cheio (fator 1) e
 * sai idêntico ao que sempre foi — a bomba, a pedra quebrando e o portão não mudaram um pixel.
 */
const SHAKE_LEAN = 0.55;
const SHAKE_RATTLE = 0.7;

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
// Cap on static-solid cast silhouettes drawn at once (trees near a lit flame). Raised from
// 72 with the camera cull below: an instance is two triangles, and what used to make the
// number scary — 36 separate DRAW CALLS — has been one instanced draw for a while now.
// With CAST_CAMERA_REACH bounding the candidates, the count is bounded by what fits on
// screen (measured: ~40 in the home clearing, ~80 walking a forest wall with a torch).
const CAST_POOL_MAX = 128;
/**
 * How far from the camera target a static tile may be and still spend a pool slot.
 *
 * Without this the pool is spent in FIRE order, and a fire the player cannot see is served
 * first: measured with the torch lit in the home clearing, 13 of 42 slots (31%) were drawing
 * silhouettes around the lava field ~35 tiles away, off screen, while trees at the hero's
 * feet went without. The camera frames ~30x17 tiles; 18 covers it with margin for a shadow
 * whose caster is just off screen but whose silhouette reaches into it.
 */
const CAST_CAMERA_REACH = 18;
// The shadow mask's coverage, in tiles around the camera target: wider than the view so
// a silhouette entering from off-screen is already in the data when its caster shows.
const MASK_TILES_X = 48;
const MASK_TILES_Z = 32;
// Scratch for save/restore around the mask render (never reallocated).
const maskClearScratch = { color: new THREE.Color() };
// Shortest cast worth drawing, in tiles. Below this a silhouette is a smudge under the
// caster's own feet that reads as a MISSING shadow rather than a short one — so the water
// clamp drops the cast instead of leaving a stub (see emitSolidCast).
const MIN_CAST_LEN = 0.9;
// NUMERIC tile/bucket keys for the shadow pass's lookups. A `${x},${z}` string key would
// allocate on every probe of the hottest loops; these fold the coordinate into one number.
// The +4096 offset keeps negatives (the void ring runs past the world bounds) positive.
const tileKey = (x: number, z: number): number => (x + 4096) * 16384 + (z + 4096);
const bucketKey = (x: number, z: number): number => ((x + 4096) >> 2) * 16384 + ((z + 4096) >> 2);
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
/**
 * O quanto o SOL já acende qualquer lugar do mundo, para `lightLevelAt`. Não é 1: mesmo ao
 * meio-dia a fogueira tem de ter para onde subir, senão chegar perto do fogo com a espada na mão
 * deixa de mudar alguma coisa e o único desenho que o arco faz da luz do mundo morre.
 */
const DAYLIGHT_SWING_FLOOR = 0.82;

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
/**
 * O POÇO DA ESCADA: um buraco DE VERDADE no chão da superfície, pelo mesmo caminho do rio — o
 * quad de chão daquele tile desce, e paredes fecham o vão onde ele encontra a terra.
 *
 * Ele existe porque a lição nº 1 da `StairsObject` ("nada abaixo de y=0 existe") sempre teve uma
 * exceção e ninguém a usou: o chão do mundo é opaco em y=0 **até alguém afundá-lo**, e o rio faz
 * exatamente isso desde o primeiro dia. Enquanto a escada só DESENHAVA a profundidade (pisadas que
 * encolhem sobre uma laje preta), o rio ao lado dela tinha um leito de verdade.
 *
 * Mais fundo que o rio (0.42) porque é outra coisa: um canal é raso e se atravessa, um poço de
 * escada engole. E o piso NÃO é livre: ele tem de ficar abaixo de `STAIRS_DROP_TILES` (0,55), que
 * é o quanto a caminhada afunda o corpo do herói. Com um poço mais raso que a queda, ele termina
 * a descida ATRAVESSANDO o fundo — e o fundo é a única coisa que ainda o esconde.
 */
export const STAIRS_PIT_DEPTH = 0.62;
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
/**
 * A rampa da VISTA DO HERÓI — a mesma pintura de bandas, na cor OPOSTA à do fogo.
 *
 * Fogo é ouro; a vista é o cinza-lunar da própria noite (a família do `moonColor`), e ela tem de
 * ser assim por duas razões: uma poça quente em volta do herói leria como tocha acesa — ele
 * pareceria carregar fogo que não tem — e roubaria da fogueira a única cor quente do mundo, que é
 * o contraste em que este jogo inteiro se apoia. Fria, ela lê como o escuro CEDENDO, não como
 * chama. Cravada no arquivo porque ela só existe de noite (`heroSightGlow` = 0 no DAY_SKY).
 */
const SIGHT_RAMP_CORE: THREE.IUniform<THREE.Color> = { value: new THREE.Color('#cdd6e6') };
const SIGHT_RAMP_MID: THREE.IUniform<THREE.Color> = { value: new THREE.Color('#8f9cba') };
const SIGHT_RAMP_RIM: THREE.IUniform<THREE.Color> = { value: new THREE.Color('#4a5a7d') };
/**
 * A vista NÃO TREME. O `uLightWobble` é o campo de ruído que amassa os anéis de uma poça de fogo —
 * é chama imperfeita, e é a assinatura do fogo. Emprestá-lo para a vista faria o herói parecer
 * carregar uma tocha invisível; ela é firme porque é o olho dele, não uma chama.
 */
const zeroWobbleUniform: THREE.IUniform = { value: 0 };
// The pool's own paint resolution, in texels per tile — COARSER than the art (8 = one
// light block per 2×2 art pixels, cleanly aligned to the art grid). This is A Short
// Hike's low-res trick applied to the light alone: the smooth authored gradient
// crunches into subtle chunky blocks while the frame and the sprites stay sharp.
// 2×2 approved live by the user; 4×4 was tried and read too coarse.
const fireGlowResUniform: THREE.IUniform = { value: 8 };

// Ambient particle counts (additive Points — brasas rising off the fire, dust in the air,
// fireflies drifting in lit clearings, low mist wisps veiling the dark ground).
/**
 * O maior tamanho que um pixel desenhado pode ter, em pixels de aparelho, antes de o renderizador
 * dobrar a divisão (ver `renderScale`).
 *
 * Ele não é um teto de `devicePixelRatio`: é o limite de QUALIDADE que decide o divisor inteiro.
 * Num telefone de 3× ele manda desenhar a 1,5× a tela CSS — cada pixel vira um bloco de 2×2 no
 * painel, uniforme. Baixá-lo para 1 pediria a resolução nativa do aparelho (2,25× o preenchimento);
 * subi-lo para 3 devolveria blocos de 3×3, que já é o mundo quadriculado de antes.
 */
const MAX_DEVICE_PIXEL_RATIO = 2;

// Baked AO: how dark a ground corner goes when all three tiles touching it are standing solids.
const AO_MAX = 0.5;

// Per-region colour grading (see updateBiomeGrade): the split-tone the frame is graded with in the
// woodland, and the one a lava basin drags it toward, plus how far the lava's influence reaches.
const BIOME_LAVA_RADIUS = 11; // tiles

// Tinted shadows, the A Short Hike way: the dark is a COLOUR (violet-blue), never just
// darker — it's what makes the fire pool's warmth read as warmth.
const GRADE_WOOD_SHADOW = new THREE.Vector3(0.88, 0.91, 1.14);
const GRADE_WOOD_HIGH = new THREE.Vector3(1.12, 1.02, 0.86); // warm amber highlights
/**
 * O MESMO bosque ao meio-dia. Ele precisa de par próprio — e não do de cima com `grade` mais alto
 * — porque a separação quente/frio do dia é MAIOR e tem outra cor: o que enche a sombra de um dia
 * de sol é o CÉU (azul), e o que bate no alto é o SOL (ouro). Aqui é o único desenho de "quente
 * contra frio" que sobra no dia, e é onde o amarelo dele é decidido.
 *
 * O alto puxa forte para o ouro porque a CURVA come tinta: `pow(0.66)` transforma uma razão de
 * 1,24× em 1,15× na tela. Todo tom escolhido aqui chega mais fraco do que parece — e é por isso
 * que este par é mais extremo que o noturno em vez de ser o noturno com o volume alto.
 */
const GRADE_DAY_SHADOW = new THREE.Vector3(0.84, 0.93, 1.2);
const GRADE_DAY_HIGH = new THREE.Vector3(1.24, 1.06, 0.72);
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
const FIREFLY_COUNT = 44;
const MIST_COUNT = 48;

// O VAGA-LUME MORA NO MATO. Estes são os frames de decoração que contam como vegetação viva —
// capim, folhagem, o arbusto florido e os cogumelos —, e deliberadamente NÃO a serrapilheira
// (graveto, seixo, osso): um enxame precisa dizer "aqui é verde", e piscar sobre cascalho não diz
// nada. É o mesmo atlas que o editor pinta, então plantar mato numa carta (ver
// scripts/enrich-chunk-cards.mjs) povoa a carta de vaga-lume sem tocar em código.
const FIREFLY_HOST_FRAMES: ReadonlySet<number> = new Set([0, 1, 7, 8, 10, 11, 19, 20]);

// ── O QUE O VENTO MOVE ────────────────────────────────────────────────────────────────────────
// Duas listas, e as duas existem para dizer o que NÃO se mexe. As malhas do terreno são fundidas
// por camada, não por assunto: a mesma malha em pé carrega o pinheiro e o TÚMULO, e a mesma malha
// deitada carrega o capim e os OSSOS. Sem estas listas, o vento sacudiria a pedra do cemitério —
// e uma lápide balançando desmente, num quadro, a solidez de tudo o mais que está parado.
//
// A mata em pé: pinheiros (4/14-18), árvore seca (3/21) e os dois estágios de tombamento (36/37),
// que continuam sendo madeira em pé. Fora ficam a cabeça na estaca (22) e o túmulo (25).
const WIND_SWAY_FRAMES: ReadonlySet<number> = new Set([3, 4, 14, 15, 16, 17, 18, 21, 36, 37]);
// O mato deitado: capim, folhagem e o arbusto florido. Cogumelo, graveto, seixo, pedregulho e osso
// ficam de fora — o que é rígido no mundo tem de ficar rígido na tela.
const WIND_STIR_FRAMES: ReadonlySet<number> = new Set([0, 1, 7, 8, 19, 20]);
// A caixa em que o enxame vive, em tiles a partir do alvo da câmera. Um pouco maior que a tela:
// entrar no quadro voando é a metade do efeito, e um bicho que só existe dentro do enquadramento
// aparece do nada na borda.
const FIREFLY_BOX = 10;
/** Quanto um vaga-lume se afasta da moita que escolheu, em tiles. */
const FIREFLY_ROAM = 1.9;

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
  /**
   * Fogo que ANDA (a tocha do heroi ja era um; o corpo em chamas e o segundo). Move a ENTRADA
   * do pool — luz, halo no chao e sombra vao atras no proximo frame — sem criar nem destruir
   * luz nenhuma, que e a lei mais cara da casa. `worldX/worldY` ficam sendo o tile de origem.
   */
  setPosition(x: number, y: number): void;
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

/** Como uma caixa veste a pele dela. Ver `addBox` e `tileBoxUv`. */
export interface BoxSkinOpts {
  /**
   * O TEXEL DA CAIXA PASSA A MEDIR O MESMO QUE O PIXEL DO MUNDO.
   *
   * Sem isto, a `BoxGeometry` estica a arte INTEIRA em cada face — e como as faces de uma peca
   * tem tamanhos muito diferentes, cada uma sai com um pixel de outro tamanho e de outro formato.
   * Medido no meio-fio da escada: 1,7 px de largura por 24 px de altura, um texel 20:1, que e
   * granito virando listra esticada. Com `pixelTiled` a arte e RECORTADA na densidade do mundo
   * (16 texels por tile), entao uma pedra de 0,1 tile mostra 1,6 texel de pedra — pouco, mas do
   * tamanho certo. Num jogo cuja lei e "16 px por tile", a alvenaria tambem obedece.
   */
  pixelTiled?: boolean;
  /**
   * Onde o recorte comeca, em TEXELS a partir do canto superior esquerdo da arte (so com
   * `pixelTiled`). E o que faz duas pisadas vizinhas nao serem o mesmo desenho — uma folha de
   * pedra, recortes diferentes, que e como pixel art sempre fez variacao.
   */
  uvShift?: readonly [number, number];
  /** Sem luz nenhuma: a cor sai crua. So para o que NAO e superficie — ver `addBox`. */
  unlit?: boolean;
}

/**
 * Recorta a arte de uma caixa na densidade de pixel do mundo, face a face.
 *
 * A `BoxGeometry` do three tem 6 faces de 4 vertices, nesta ordem: +X, −X, +Y, −Y, +Z, −Z; a UV
 * de cada uma vai de 0 a 1. Multiplicar essa UV pelo tamanho da face em texels do mundo (e somar
 * o deslocamento) e tudo o que e preciso — e fica na GEOMETRIA, que ja e unica por caixa, em vez
 * de num clone da textura: a `DataTexture` de pedra e compartilhada em cache, e clona-la por
 * caixa seria uma subida de textura nova por meio-fio.
 */
const tileBoxUv = (
  geo: THREE.BoxGeometry,
  sizeX: number,
  sizeH: number,
  sizeZ: number,
  skin: THREE.Texture,
  shift: readonly [number, number] = [0, 0],
): void => {
  const image = skin.image as { width?: number; height?: number } | undefined;
  const texW = image?.width ?? TILESET_FRAME_SIZE;
  const texH = image?.height ?? TILESET_FRAME_SIZE;
  // O modo de repeticao e parametro de TEXTURA, e o three so o aplica na subida — trocar o campo
  // sem `needsUpdate` deixa a textura grampeada na GPU e o recorte sai esticando o texel da borda
  // em vez de repetir. So a primeira caixa paga: as seguintes acham a textura ja em Repeat.
  if (skin.wrapS !== THREE.RepeatWrapping || skin.wrapT !== THREE.RepeatWrapping) {
    skin.wrapS = THREE.RepeatWrapping;
    skin.wrapT = THREE.RepeatWrapping;
    skin.needsUpdate = true;
  }
  // Que dimensao do mundo corre em u e em v, por face.
  const spans: ReadonlyArray<readonly [number, number]> = [
    [sizeZ, sizeH], [sizeZ, sizeH], // ±X: a profundidade em u, a altura em v
    [sizeX, sizeZ], [sizeX, sizeZ], // ±Y: topo e base — largura em u, profundidade em v
    [sizeX, sizeH], [sizeX, sizeH], // ±Z: largura em u, altura em v
  ];
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let face = 0; face < spans.length; face += 1) {
    const [spanU, spanV] = spans[face];
    const ru = (spanU * TILESET_FRAME_SIZE) / texW;
    const rv = (spanV * TILESET_FRAME_SIZE) / texH;
    // v cresce para CIMA na textura, e o deslocamento e contado a partir do TOPO da arte (que e
    // como se le um sprite): por isso o recorte ancora em `1 - rv` e o shift desce dali.
    const ou = shift[0] / texW;
    const ov = 1 - rv - shift[1] / texH;
    for (let i = face * 4; i < face * 4 + 4; i += 1) {
      uv.setXY(i, uv.getX(i) * ru + ou, uv.getY(i) * rv + ov);
    }
  }
  uv.needsUpdate = true;
};

/**
 * A standing solid tile (tree/wall), as the shadow pass sees it. The optional fields are
 * cast-pass bookkeeping, written in place so the per-frame loops allocate nothing:
 * `mark` dedupes a tile reachable from two fires' candidate lists, `lastFire` is the
 * heading hysteresis (P5 — between two fires "nearest" must not flip with the flicker),
 * `moonSlot` is where its baked moon silhouette landed, so the statics' fire→moon
 * handoff can retune that one instance's darkness without a re-bake.
 */
interface SolidTileEntry {
  x: number;
  z: number;
  frame: number;
  mark?: number;
  lastFire?: FireEntry | 'torch' | null;
  moonSlot?: number;
}

/** Anything that remembers which flame last threw its shadow (heading hysteresis).
 *  Exported as an opaque handle: long-lived groundCastAt callers (the robotic arm) hold
 *  one so their shadow's heading gets the same hysteresis the billboard casters have. */
export interface CastMemory {
  lastFire?: FireEntry | 'torch' | null;
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
  /**
   * Quanta VIDA a agua do mar tem: 1 = o padrao, 0 = uma foto (a agua parada de antes), 2 = o
   * dobro. Escala a corrente, a marola e a arrebentacao de uma vez — "mais/menos movimento" e uma
   * decisao unica de olho, e ela precisa poder ser tomada com o jogo rodando (window.hd3d.seaFlow),
   * nao por recompilacao. Ver as SEA_* GLSL em pixelArtLight.
   */
  seaFlow: number;
  /**
   * A HORA DO DIA: 0 = a noite autorada (o padrão do jogo), 1 = o dia de sol.
   *
   * Não é um número contínuo — é uma CHAVE. Virá-la troca ~vinte outros knobs de uma vez
   * (`skyPreset.DAY_SKY`), e voltar a 0 devolve cada um ao valor de fábrica. Ela é o único knob
   * deste objeto que escreve nos outros, então tunar à mão e depois virar a chave descarta o que
   * foi tunado — é o preço de um preset, e ele é o certo: "dia" é uma decisão só.
   *
   * Interpolar entre os dois seria bonito (um amanhecer) e caro: a alpha/comprimento da sombra
   * projetada re-ASSA o campo instanciado dos sólidos, e um lerp por frame seria uma re-assadura
   * por frame. Por isso a troca é seca.
   */
  daylight: number;
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
  /**
   * Heading hysteresis for the cast shadows, as a distance RATIO (1 = off). Midway between
   * two lit fires, "nearest" flips with the flames' breathing and the shadow snaps direction
   * every few frames — so the incumbent flame keeps a caster until a challenger is clearly
   * closer (its distance under ratio × the incumbent's).
   */
  castHysteresis: number;
  /**
   * How much a caster's ELEVATION moves its silhouette (1 = full, 0 = the old pinned look):
   * a lifted caster's shadow slides away from the light and thins, so a jump/bob reads on
   * the ground — the same projection the robotic arm's skeleton shadow already used.
   */
  castElevation: number;
  /**
   * Stop silhouettes at the water's edge (1 = on). The river/lava/sea beds are SUNKEN, and
   * a quad laid at ground level would float in the air across the channel — so a cast that
   * reaches a sunken tile is clamped at the bank and dimmed.
   */
  castWaterClamp: number;
  /**
   * Give the STATIC solids the same fire→moon handoff the actors have (1 = on): inside a
   * lit pool a tree's baked moon silhouette fades by the fire cast's strength, so a tree
   * and an NPC on the same pool edge behave the same instead of the tree wearing two
   * shadows at once.
   */
  moonHandoff: number;
  /**
   * THE SHADOW MASK (plano.md fase 3, experimental — 0 = the classic decal path).
   * At 1 the fire silhouettes stop being black quads multiplied over the finished frame
   * and become DATA: drawn once into a small top-down RT (max-blended — overlaps can
   * never double-darken), which the lit materials sample to attenuate ONLY the point
   * lights' direct term. Consequences, in order of importance: sprites RECEIVE shade
   * (the hero darkens inside a tree's shadow), a shadow can never be darker than the
   * unlit night (ambient and moon pass through), and the CPU sort dies (max-blend is
   * order-free). Billboards sample at a probe leaned toward their own light so a caster
   * never stands in its own silhouette. Live-flippable: all programs are compiled at
   * boot and the flip is a uniform.
   */
  shadowMask: number;
  /** Mask texels per tile (the mask's own pixel-art grain). */
  shadowMaskRes: number;
  /**
   * A NÉVOA NEGRA do fora do mundo, em TILES: quantos ela leva para fechar em preto a partir da
   * fronteira autorada (0 = sem névoa, e a mata de fora fica exposta como qualquer outra).
   *
   * É knob e não constante porque é a única coisa que decide quanto de "mundo lá fora" o jogador
   * enxerga — subir esconde a mata e o mapa parece maior; baixar mostra a floresta e o mapa ganha
   * horizonte. Decisão de olho, e olho não recompila.
   */
  voidMist: number;
  heroLight: number;
  /**
   * A VISTA DO HERÓI: quanto o quadro ABRE em volta dele (0 = nada, e a noite é a de antes).
   *
   * Não é uma lâmpada, é uma CURVA — e a razão está medida no doc de `setHeroSight`: à noite o
   * `lightCap` já está gasto pela lua, então nenhuma luz THREE nova pode clarear o chão nem um
   * por cento. Quem levanta um quadro neste jogo é o `pow` (a mesma lei do `lift`, ver
   * skyPreset.ts), e aqui ele é aplicado só onde ele está.
   */
  heroSight: number;
  /**
   * O DISCO da vista: a poça fria desenhada no chão, na mesma opacidade em que a fogueira mede a
   * dela (`fireGlowStrength`). É ele que dá SILHUETA à vista — a curva sozinha clareia uma região
   * sem borda nem centro, e isso a olho é "a tela está mais clara", não "o herói tem luz".
   */
  heroSightGlow: number;
  /** O raio da vista, em TILES de chão (o círculo vira elipse na tela, pela inclinação da câmera). */
  heroSightTiles: number;
  /**
   * Quantos tiles a vista pende PARA ONDE ELE OLHA. É o que a faz ler como visão e não como
   * auréola: virar-se varre o campo claro, então o herói enxerga à frente, não em volta.
   */
  heroSightLean: number;
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
  /**
   * O AR: a cor do fundo E do fog, que são obrigatoriamente a mesma (um fog que não termina na cor
   * do fundo desenha uma emenda no infinito). A câmera olha 48° para baixo e o horizonte nunca
   * entra no quadro, então isto não é "o céu": é a cor em que a distância se dissolve.
   */
  skyColor: string;
  /** A estrela que a água pisca: a lua fria de noite, o sol branco de dia (pixelArtLight). */
  glintColor: string;
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
  /**
   * A CURVA DE TELA — o expoente com que o quadro pronto é levantado. 1 = a rampa reta que este
   * jogo sempre teve (a noite, intocada); menores levantam sombra e meio-tom sem mexer no branco.
   *
   * Ela existe porque este jogo NÃO tem tone mapping. O `RenderPass` desenha o mundo num render
   * target, e o three só monta o ACES quando o alvo é a tela (`WebGLPrograms`: `toneMapping` fica
   * em `NoToneMapping` com um alvo ligado) — então `params.exposure` não chega a shader nenhum e
   * o valor LINEAR do buffer vai cru para o canvas, que o mostra como se fosse sRGB. É daí que
   * vem o escuro fundo e contrastado da noite, e é por isso que a `ambient` precisou de 8,5.
   *
   * Consequência para o DIA: não há curva nenhuma comprimindo o alto, então "mais luz" estoura o
   * branco antes de clarear a sombra — 1,0 é um corte seco. `lift` é a ferramenta certa para
   * levantar um quadro: `pow` é monótono, leva 1 em 1 e abre justamente os graves, que é onde a
   * diferença entre meio-dia e meia-noite mora. Fica em 1 na noite, e em 1 ela é literalmente a
   * identidade (o `if` no shader nem roda) — a noite não muda um bit por causa disto.
   */
  lift: number;
  grain: number;
  /**
   * O VENTO na vegetação (0 = mundo parado, 1 = padrão, 2 = o dobro). É um knob vivo porque
   * "quanto de vento" é decisão de olho, e não pode custar uma recompilação de shader — a mesma
   * regra do `seaFlow`.
   */
  wind: number;
  /** Ambient particle brightness multipliers (0 = off): fireflies over the grass, low mist. */
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
    // O enquadramento do jogo: a camera em (0, camHeight, camBack) olhando pro alvo. Estes dois
    // numeros sao 72% do par original (8.4/7.6) — dois passos de slider: 80%, e depois 90% desse
    // 80%. A camera desceu pela propria linha de visao, o tile ficou ~1.4x maior na tela e o
    // enquadramento pegou menos mundo. Escolhidos a olho, com um slider temporario que existiu so
    // pra isso e ja saiu do repo; achar o proximo valor e refaze-lo, e o que ele fazia esta dito
    // na linha abaixo — multiplicar os DOIS por um fator so, e nada mais.
    //
    // ZOOM AQUI E DOLLY, NUNCA fov, e os dois numeros andam SEMPRE pelo mesmo fator: a RAZAO
    // camHeight/camBack (1.1053) e a direcao de visao, e meio jogo tem essa razao assada dentro
    // de si — e o DEPTH_UP com que a arte da flor da lua desenha os frames em pe
    // (spritefactory/sprites/moonflower.mjs). Mexer num dos dois sozinho gira a camera e faz esse
    // material mentir em silencio, sem erro nenhum: a flor fica plantada torta.
    camHeight: 6.048,
    camBack: 5.472,
    fov: 38,
    // UM PARA TODOS. O celular desenhava na METADE (`isHandheld() ? 2 : 1`) para economizar
    // preenchimento — e essa metade se somava ao `devicePixelRatio` que a conta do buffer ignorava,
    // dando um quadro a 1/6 da tela: o serrilhado que o autor viu. O reescalonamento invisível foi
    // consertado em `renderSize`, e este continuar em 2 seria manter METADE do defeito só no
    // aparelho onde ele mais aparece.
    //
    // O preço é real e é do telefone: com o teto de DPR em 2, um aparelho de 3× passa a desenhar
    // ~16× os fragmentos de antes. Se algum engasgar, o botão de NITIDEZ do menu de pausa devolve
    // o modo econômico — e `hd3d.pixelScale` faz o mesmo pelo console, ao vivo. O valor de fábrica
    // vem do ajuste do jogador (`getPixelScale`), não de um palpite sobre o aparelho.
    pixelScale: getPixelScale(),
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
    seaFlow: 1,
    // O jogo nasceu de noite, e todo número abaixo foi escolhido a olho contra o escuro: a noite
    // É o padrão, e o dia é o delta (render3d/skyPreset.ts). O valor real vem do ajuste do jogador
    // no construtor — este 0 é só o que o TypeScript precisa ver.
    daylight: 0,
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
    // Switch flames only when the challenger is 15% closer — see the param doc (P5).
    castHysteresis: 0.85,
    castElevation: 1,
    castWaterClamp: 1,
    moonHandoff: 1,
    // OFF by default: the mask changes how shadows compose (subtractive light instead of
    // multiplied decals), so it ships behind the knob until its look is signed off
    // against the reference shots (plano.md fase 3's parity gate).
    shadowMask: 0,
    shadowMaskRes: 12,
    // 4 tiles, medido no jogo e não no papel: da borda do mundo até o topo da tela cabem ~5 tiles
    // de fora, então uma rampa de 6 mal começava (a mata saa como floresta normal) e uma de 1
    // cortava a preto na primeira fileira. Em 4 aparecem duas ou três fileiras de mata e a névoa
    // fecha antes da borda da tela — vê-se floresta, e vê-se ela ser engolida.
    voidMist: 4,
    // The hero's neutral self-glow is dim so that near a fire he takes the fire's
    // warm colour, and his white pixels (horns/eyes) don't glare under a bright glow.
    heroLight: 28,
    // A VISTA. 0.30 de força = expoente 0.70 no coração dela: o chão em volta do herói sobe ~50%
    // nos graves e o longe fica exatamente onde estava. Ela PODE ser forte porque é LOCAL — o que
    // se enxerga é a diferença entre o pé dele e o escuro em volta, nunca o número. (A v1 ficou em
    // 0.14 porque a elipse cobria a tela inteira, e força global nenhuma se vê.)
    heroSight: 0.3,
    // O disco: 0.24 contra os 0.6 de uma fogueira. Menos da metade, e frio — é para se ver onde ele
    // pisa, nunca para competir com a poça quente que é a recompensa de acender o mundo.
    heroSightGlow: 0.24,
    // 2,6 tiles: ~um quinto da largura da tela, contra os 15 do halo de uma fogueira — a vista
    // mostra onde ele PISA, a fogueira é que abre a região. Subir isto é o caminho mais curto de
    // volta ao defeito da v1: uma elipse que passa do quadro não é vista, é `lift`.
    heroSightTiles: 2.6,
    heroSightLean: 0.9,
    fogDensity: 0.02,
    // Raised with the ambient (see above) — a fuller moon for a brighter night.
    moon: 3.6,
    // Near-neutral (just a hint of cool) so tree-green etc. read as the art's own
    // colours instead of being tinted teal by a saturated blue night fill.
    ambientColor: '#b4b7c2',
    moonColor: '#97a0b4',
    // Quase preto: a distância da noite não é azul, é ausência. O fog usa a MESMA cor.
    skyColor: '#070811',
    // Frio e apagado — é a lua na ondulação. (Em linear: os 0.45/0.58/0.82 de sempre.)
    glintColor: '#b3c8ea',
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
    lift: 1, // a noite é a rampa reta — ver o doc do campo
    grain: 0.02,
    // Occasional twinkles near lit fires + a faint low haze — tuned live to sit
    // just under "noticeable" so they never wash the dark or read as floating orbs.
    godRays: 0.55,
    camSway: 0.022,
    wind: 1,
    fireflies: 3,
    mist: 2.2,
    // Gentle split-tone: enough for the warm/cold HD-2D feel, but low so it doesn't
    // repaint the sprites' own colours. Saturation lifted slightly so the art reads vivid.
    grade: 0.28,
    saturation: 1.18,
    contrast: 1.0,
  };

  public readonly scene = new THREE.Scene();
  /** A mortalha dos chunks não-comprados do construtor de mundo (vazia fora dele). */
  public readonly chunkShroud = new ChunkShroud3D(this.scene);
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
  // A VISTA do herói: onde ele está, para onde olha, e quanto dela existe agora (a cut-scene a
  // apaga). Escrita por setHeroSight; projetada na tela e entregue ao post em updateHeroSight —
  // pela mesma razão do torch, a câmera deste frame só está pronta dentro do render.
  private readonly sight = { x: 0, y: 0, fx: 0, fy: 1, strength: 0 };
  /** O disco visível da vista: a poça fria no chão. Nasce no construtor, com as luzes. */
  private sightGlow?: THREE.Mesh;

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
  private readonly fireflyState: FireflyParticle[] = [];
  /** Os tiles de vegetação da janela assada (x + z empacotados) — onde o enxame pousa. */
  private readonly greenTiles: number[] = [];
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
  /** Para onde o baque inclina, normalizado em espaco de tile. (0,0) = tremor sem direcao. */
  private shakeDirX = 0;
  private shakeDirY = 0;
  private viewOffsetX = 0;
  private viewOffsetY = 0;
  private appliedPixelScale = 0;
  /** A escala com que o buffer foi assado — o `uBlur` se mede nela (ver syncFinishUniforms). */
  private appliedRenderScale = 1;

  private readonly solidTiles: SolidTileEntry[] = [];
  // Exposed solid tiles only (few solid neighbours — clearing edges / lone trees).
  // Deep-in-the-forest-wall tiles are excluded: their overlapping blobs/shadows would
  // merge into one dark block, so only these get a contact blob and cast a shadow.
  private readonly castableSolids: SolidTileEntry[] = [];
  private decorGeo!: THREE.BufferGeometry;
  private readonly grassQuads = new Map<string, number>(); // "x,z" → vertex start
  // The decor quad of EVERY flat decor tile (grassQuads is only the rustleable frame) — the
  // shovel erases foliage/litter under a dug hole, whatever the frame (removeDecorTile).
  private readonly decorQuads = new Map<string, number>(); // "x,z" → vertex start
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
  /**
   * Live set of standing tiles — shrinks as trees fall, so re-baked AO sees the clearing.
   *
   * Keyed by the NUMERIC tileKey rather than by "x,z". It reads worse and it is not a
   * micro-optimisation: baking the ground's ambient occlusion asks this set three times per
   * corner, i.e. TWELVE lookups per ground tile, and with string keys that was twelve string
   * allocations per tile — ~60% of the whole terrain bake. The explorer mode re-bakes a window
   * of the world every time the hero crosses a chunk, so that bake had to stop being a hitch.
   */
  private solidKeys = new Set<number>();
  /**
   * The terrain's own meshes, kept so an infinite world can throw the window away and bake the
   * next one (see rebuildTerrain). The authored worlds never call it — they bake once at boot.
   */
  private readonly terrainMeshes: THREE.Mesh[] = [];
  /**
   * Terrain materials are built ONCE and reused across re-bakes. Not for allocation's sake:
   * three bakes a material's patched program into its cache key, and a fresh material per
   * re-bake would go looking for that program in the renderer's cache on the frame it is first
   * drawn — the one thing this project's shader rules exist to prevent.
   */
  private terrainMats?: {
    ground: THREE.MeshLambertMaterial;
    /** O MAR: o mesmo atlas do chão, com a corrente e a arrebentação (worldFx 'seaFlow'). */
    sea: THREE.MeshLambertMaterial;
    bank: THREE.MeshLambertMaterial;
    lavaBank: THREE.MeshLambertMaterial;
    /** As paredes do POÇO da escada, e o fundo dele: preto que não recebe luz (ver o bake). */
    pit: THREE.MeshBasicMaterial;
    pitFloor: THREE.MeshBasicMaterial;
    decor: THREE.MeshLambertMaterial;
    solid: THREE.MeshLambertMaterial;
    /** A MONTANHA em cubo: o mesmo atlas, com o volume nas cores de vértice (ROCK_CUBE_SHADE). */
    rock: THREE.MeshLambertMaterial;
    /** O topo do cubo de parede de dungeon: preto puro, sem luz. */
    wallTop: THREE.MeshBasicMaterial;
    /** A NÉVOA NEGRA que engole a mata de fora do mapa (ver makeVoidMistMaterial). */
    voidMist: THREE.MeshBasicMaterial;
    blob: THREE.Material;
  };
  /**
   * Capacity the moon-cast field is allocated with while the world streams. A re-bake changes
   * how many exposed solids exist, and an InstancedMesh cannot grow — so a streaming world
   * over-allocates once instead of building a new field (and a new draw) every chunk crossing.
   */
  private moonFieldCapacity = 0;
  /** How many times the terrain has been baked. >1 means the world streams (explorer mode). */
  private terrainBakes = 0;

  // ── firelight cast shadows (2D ground silhouettes) ──
  // One persistent silhouette per dynamic caster (hero, props, NPCs, enemies)…
  private readonly castCasters: Array<{
    bb: Billboard3D;
    mesh: THREE.Mesh;
    /** The decal material the mesh was born with, and the mask-RT variant — the
     *  shadowMask toggle swaps them (both programs compiled at boot). */
    sceneMat: THREE.Material;
    maskMat: THREE.Material;
  } & CastMemory> = [];
  // ── the shadow mask (hd3d.shadowMask — see the param doc) ──
  private maskTarget!: THREE.WebGLRenderTarget;
  private readonly maskScene = new THREE.Scene();
  private maskCamera!: THREE.OrthographicCamera;
  private appliedMaskMode = false;
  // ── a hora do dia (hd3d.daylight — ver skyPreset.ts) ──
  /**
   * O que os knobs do DAY_SKY valiam de fábrica, capturado antes da primeira escrita: é esta a
   * NOITE. Guardá-la em vez de escrever um preset "night" à mão é o que impede as duas de
   * divergirem — mexer no padrão lá em cima já muda a noite para a qual o dia volta.
   */
  private readonly nightSky: Partial<World3DParams> = {};
  private appliedDaylight = false;
  // NOTA: aqui viviam os CAMPOS INSTANCIADOS de silhueta de ator (um por sprite sheet), com um
  // opt-in publico (`enableActorCastBatching`) e um limiar de 3 casters. Eles existiam para UMA
  // coisa: a horda do modo Sobreviventes, cujas ~100 caveiras eram ~100 draws de sombra. O modo
  // saiu do jogo, e com ele o unico chamador do opt-in — o conjunto ficava vazio para sempre e
  // todo o caminho era codigo morto atras de um `if`. A aventura NUNCA batchou de proposito:
  // dobrar N quads ordenados individualmente num mesh so muda a ordem da fila transparente, e
  // portanto a mistura com o fog (o mato alto batchou sozinho uma vez e as fotos de referencia
  // pegaram a diferenca). Se um dia voltar a existir uma horda, o que volta e isto, com o opt-in.
  // ── the cast pass's reusable scratch (zero per-frame allocation — see plano.md P8) ──
  private readonly fireCastScratch: CastPose = { length: 0, rotY: 0, alpha: 0 };
  private readonly castScratch: CastPose = { length: 0, rotY: 0, alpha: 0 };
  private readonly nearestScratch = { worldX: 0, worldY: 0, level: 0 };
  /** Per-lit-fire candidate solids within castShadowRadius. Fires never move, so this is
   *  built once per fire (and dropped when a tree falls / the radius knob turns) instead
   *  of scanning every castable solid × every fire × every frame — the old hottest loop. */
  private readonly fireCastLists = new Map<FireEntry, SolidTileEntry[]>();
  private fireListRadius = -1;
  /** Spatial hash of castable solids (4×4-tile buckets) for the one MOBILE flame, the torch. */
  private readonly solidBuckets = new Map<number, SolidTileEntry[]>();
  /** Monotonic id stamped on tiles as the cast pass visits them (cross-list dedupe). */
  private castFrameId = 0;
  /** Sunken ground tiles (river/lava/sea beds) — where a cast silhouette must stop (2b). */
  private readonly sunkenTiles = new Set<number>();
  /** Moon-field instances dimmed by the statics' handoff, to restore next frame. */
  private readonly moonDimmed: SolidTileEntry[] = [];
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
    // A HORA DO DIA vem ANTES de tudo. O renderizador nasce de novo a cada `scene.restart()` (a
    // morte é um), então a escolha mora fora dele (graphicsSettings + `?day`/`?night`), e ela tem
    // de estar aplicada antes que o fundo, o fog e as duas luzes sejam criados desta tabela — do
    // contrário o primeiro frame de uma partida de dia nasceria à meia-noite e viraria no segundo.
    this.applySky(getDaylight() >= 0.5);

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

    // Fundo e fog são a MESMA cor por obrigação: um fog que não termina na cor do fundo desenha
    // uma emenda no infinito. Vem de `params.skyColor`, que o `render` mantém vivo.
    this.scene.background = new THREE.Color(this.params.skyColor);
    this.scene.fog = new THREE.FogExp2(this.params.skyColor, this.params.fogDensity);

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
    // O disco da vista nasce aqui pelo mesmo motivo que a tocha: ele usa o programa do
    // `fireGlow`, e um material novo no meio do jogo é um link de shader no frame errado.
    this.ensureSightGlow();

    this.buildTerrain();
    this.initShadowMask();
    this.initPostProcessing();
    this.initParticles();
    this.initGodRays();

    window.addEventListener('resize', this.handleResize);
  }

  // ── HD-2D post-processing chain ───────────────────────────────────────────────

  /**
   * O TAMANHO DO BUFFER, e a conta que estava errada no celular.
   *
   * Ela media a tela em pixels CSS (`innerWidth`) com `setPixelRatio(1)`, ou seja: fingia que um
   * pixel CSS é um pixel de aparelho. Num monitor comum é — e por isso o desktop sempre saiu
   * nítido. Num telefone um pixel CSS são TRÊS pixels de aparelho, então o quadro já saía esticado
   * 3× antes de qualquer `pixelScale`; com o `pixelScale: 2` que o celular usava por cima disso, o
   * jogo era desenhado a 1/6 da resolução da tela e ampliado de volta. É o serrilhado que o autor
   * viu, e ele não era o pixel art: era um segundo reescalonamento, invisível no código.
   *
   * Agora `renderScale` é medido em PIXEL DE APARELHO — `pixelScale` finalmente quer dizer o que o
   * nome diz (quantos pixels de tela um pixel desenhado ocupa) e a mesma imagem sai do mesmo jeito
   * no monitor e no telefone.
   *
   * O TETO de 2 no `devicePixelRatio` é a mesma prudência do `prototype3d/main.ts` deste repositório
   * e dos exemplos do three: acima de 2 a diferença é invisível a olho e a conta de preenchimento
   * dobra de novo — e preenchimento é justamente o que falta numa GPU de telefone.
   */
  private renderScale(): number {
    const ps = Math.max(1, Math.round(this.params.pixelScale));
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    // `blocks` = quantos PIXELS DE APARELHO um pixel desenhado ocupa, e ele é INTEIRO. Essa é a
    // outra metade do conserto, e ela é de graça: com um fator quebrado (1,5, que é o que um teto
    // de 2 dá num telefone de 3×) o navegador amplia uns pixels para 1 e outros para 2, e o que se
    // vê é uma grade de blocos de tamanhos diferentes — serrilhado irregular, justamente o que
    // `image-rendering: pixelated` deveria evitar. Em fator inteiro todo bloco é igual.
    //
    // No telefone de 3× ele também sai MAIS BARATO que o teto de 2 (buffer 1,5× a tela CSS contra
    // 2×), então a versão certa é a mais rápida das duas.
    // O `- 1e-6` não é superstição: o navegador devolve `devicePixelRatio` = 2.0000000298 numa
    // tela 2×, e um `ceil` cru sobre isso dá 2 em vez de 1 — a retina passava a desenhar na
    // METADE por causa do último bit de um float.
    const blocks = Math.max(1, Math.ceil(dpr / MAX_DEVICE_PIXEL_RATIO - 1e-6)) * ps;
    return dpr / blocks;
  }

  private renderSize(): { w: number; h: number } {
    const scale = this.renderScale();
    return {
      w: Math.max(1, Math.round(window.innerWidth * scale)),
      h: Math.max(1, Math.round(window.innerHeight * scale)),
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
    // O borrão é medido em PIXELS DO BUFFER, então ele tem de acompanhar a escala em que o buffer
    // foi assado — senão a mesma cena, desenhada com o dobro da resolução, sai com metade do
    // tilt-shift. O número autorado continua sendo "quantos pixels de TELA", que é como o olho o
    // escolheu. (E a preferência de acessibilidade do jogador segue por cima: 0 = diorama nítido.)
    u.uBlur.value = this.params.dofBlur * getDofIntensity() * this.appliedRenderScale;
    u.uNear.value = this.params.dofNear;
    u.uVignette.value = this.params.vignette;
    u.uLift.value = Math.max(0.05, this.params.lift);
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

    // O bosque tem duas horas do dia; a bacia de lava não — pedra derretida é a mesma fornalha ao
    // meio-dia e à meia-noite, e é ela que o grade está descrevendo ali.
    const u = this.finishPass.uniforms;
    (u.uShadowTint.value as THREE.Vector3)
      .copy(this.appliedDaylight ? GRADE_DAY_SHADOW : GRADE_WOOD_SHADOW)
      .lerp(GRADE_LAVA_SHADOW, this.biomeHeat);
    (u.uHighTint.value as THREE.Vector3)
      .copy(this.appliedDaylight ? GRADE_DAY_HIGH : GRADE_WOOD_HIGH)
      .lerp(GRADE_LAVA_HIGH, this.biomeHeat);
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
    registerTexture3D(FX_ICE_TEXTURE, makeIceTexture());
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
    // Fireflies: bigger, brighter motes that hover knee-to-head high over the vegetation.
    // 0,18 tile: o bicho é um PONTO de luz, não uma bola. Ele nasceu em 0,16 (invisível), passou
    // por 0,34 (uma bolha amarela maior que um cogumelo — o relato foi "muito grande") e parou
    // aqui: o que o faz enxergar não é o tamanho, é o bloom em volta de um núcleo aceso.
    this.fireflies = makeParticleField(this.scene, FIREFLY_COUNT, 0.18, dot);
    this.fireflySeed = new Float32Array(FIREFLY_COUNT);
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      this.fireflySeed[i] = Math.random() * Math.PI * 2;
      this.fireflyState.push({
        hx: 0, hz: 0, vx: 0, vz: 0,
        dart: Math.random() * 2.5,
        blink: Math.random() * Math.PI * 2,
        // Cada um pisca no SEU ritmo: com um só, trinta bichos acendem no mesmo quadro e o
        // enxame vira um estrobo. O espalhamento é o que faz parecer trinta bichos.
        rate: 1.5 + Math.random() * 1.9,
        settle: Math.random() * 0.5,
        homed: false,
      });
    }
    // Mist: many large, dim, cool wisps clinging low to the ground in the dark.
    this.mist = makeParticleField(this.scene, MIST_COUNT, 1.6, dot);
    this.mistSeed = new Float32Array(MIST_COUNT);
    for (let i = 0; i < MIST_COUNT; i++) this.mistSeed[i] = Math.random() * Math.PI * 2;
  }

  /** Resize the backing store to the current window × renderScale (ver renderSize). */
  private applyPixelScale(): void {
    this.appliedPixelScale = Math.max(1, Math.round(this.params.pixelScale));
    this.appliedRenderScale = this.renderScale();
    // A MESMA conta do `renderSize`, e não uma segunda cópia dela: enquanto eram duas, mexer numa
    // deixava a outra desenhando com o tamanho antigo até o primeiro resize.
    const { w, h } = this.renderSize();
    this.renderer.setSize(w, h, false); // CSS size stays 100% — the browser does the NEAREST upscale
    // The post chain's offscreen targets must track the render resolution too.
    if (this.composer) {
      this.composer.setSize(w, h);
      this.bloomPass.setSize(w, h);
      (this.finishPass.uniforms.uResolution.value as THREE.Vector2).set(w, h);
    }
  }

  // ── static terrain ───────────────────────────────────────────────────────────

  /**
   * Throw the baked terrain window away and bake the one `getWorldBounds()` now reports.
   *
   * This exists for ONE caller: the explorer mode, whose world has no bounds at all — it is
   * generated as the hero walks, so the merged meshes can only ever hold a WINDOW of it, and
   * the window has to move. Everything else in the game bakes once in the constructor and
   * never calls this.
   *
   * What it does not touch is as important as what it does: no light is created or destroyed
   * (the pool is sealed for the run), and no material is rebuilt (see terrainMats) — so a
   * re-bake cannot recompile a shader. It is geometry, and geometry may come and go.
   */
  public rebuildTerrain(): void {
    for (const mesh of this.terrainMeshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    this.terrainMeshes.length = 0;
    this.solidTiles.length = 0;
    this.castableSolids.length = 0;
    this.lavaSpots.length = 0;
    this.solidQuads.clear();
    this.solidBlobQuads.clear();
    this.groundQuads.clear();
    this.grassQuads.clear();
    this.decorQuads.clear();
    this.greenTiles.length = 0; // as moitas da janela velha não existem mais
    this.solidBuckets.clear();
    this.sunkenTiles.clear();
    this.activeRustles.clear();
    this.activeTileShakes.clear();
    // Both caches are keyed on tiles that no longer exist.
    this.fireCastLists.clear();
    this.fireListRadius = -1;
    this.buildTerrain();
  }

  private buildTerrain(): void {
    this.terrainBakes += 1;
    const b = getWorldBounds();
    // River tiles (plain water + buildable bridge spots) sink into a
    // channel below the ground: their ground quad drops to the bed and gets dark banks.
    const waterSet = new Set<string>(
      [...getWaterTiles(), ...getBridgeSpots()]
        .map((p) => `${p.worldX},${p.worldY}`),
    );
    // Lava tiles sink into their own (shallower) basin, the same way water tiles do.
    const lavaSet = new Set<string>(getLavaTiles().map((p) => `${p.worldX},${p.worldY}`));
    // O POÇO DA ESCADA — só na SUPERFÍCIE. Lá embaixo a escada é uma MASSA que sai do piso e sobe
    // (ver StairsObject): furar o chão da caverna abriria um buraco debaixo da própria escadaria.
    const pitSet = isUnderground()
      ? new Set<string>()
      : new Set<string>(getStairs().map((p) => `${p.worldX},${p.worldY}`));
    const pitTiles: Array<{ x: number; z: number; frame: number }> = [];
    // The SEA (the world's border, and any ocean painted inside it) is a ground FRAME, not a
    // prop — there is no WaterObject for ~11k tiles. It still has to read as water rather than
    // as blue floor, so it borrows the river's whole treatment: the same sunken bed and the
    // same earthen banks where it meets the land. Those banks ARE the coastline.
    const seaSet = new Set<string>();
    const groundTiles: Array<{ x: number; z: number; frame: number }> = [];
    const bedTiles: Array<{ x: number; z: number; frame: number }> = [];
    // The sea's own tiles, split OUT of the bed so they can wear the animated material (the
    // current, the breaking shore — see the SEA_* GLSL in pixelArtLight). Everything else about
    // them is unchanged: same sunken bed height, same earthen banks, same place in `sunkenTiles`.
    const seaTiles: Array<{ x: number; z: number; frame: number }> = [];
    const lavaBedTiles: Array<{ x: number; z: number; frame: number }> = [];
    const decorTiles: Array<{ x: number; z: number; frame: number }> = [];

    // Os tiles FORA do mundo autorado, para a névoa negra saber onde deitar (ver buildVoidMist).
    // Só o de cima tem névoa: embaixo o "escuro gigante" é o teto preto do próprio muro.
    const voidTiles: Array<{ x: number; z: number }> = [];
    for (let cy = b.minCy - VOID_MARGIN_CHUNKS; cy <= b.maxCy + VOID_MARGIN_CHUNKS; cy++) {
      for (let cx = b.minCx - VOID_MARGIN_CHUNKS; cx <= b.maxCx + VOID_MARGIN_CHUNKS; cx++) {
        const chunk = getChunkTerrain(cx, cy); // void filler outside the authored world
        const outside = !isInsideWorld(cx, cy);
        for (let row = 0; row < CHUNK_ROWS; row++) {
          for (let col = 0; col < CHUNK_COLUMNS; col++) {
            const wx = cx * CHUNK_COLUMNS + col;
            const wy = cy * CHUNK_ROWS + row;
            if (outside) voidTiles.push({ x: wx, z: wy });
            const tile = { x: wx, z: wy, frame: chunk.ground[row][col] };
            const tk = `${wx},${wy}`;
            if (tile.frame === SEA_TILE_FRAME) {
              seaSet.add(tk);
              // Break the tiling: one frame repeated across ~11k tiles reads as a grid, not as
              // water. The variant is chosen from the coordinate (never random) so the ocean is
              // identical on every boot — visual-ref diffs to 0 pixels, and three.js's shared
              // Math.random stream stays untouched (see the visual-ref trap in CLAUDE.md).
              tile.frame = SEA_TILE_FRAMES[seaVariant(wx, wy)];
              seaTiles.push(tile);
            }
            else if (waterSet.has(tk)) bedTiles.push(tile);
            else if (lavaSet.has(tk)) lavaBedTiles.push(tile);
            else if (pitSet.has(tk)) pitTiles.push(tile);
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
    const solidSet = new Set(this.solidTiles.map((t) => tileKey(t.x, t.z)));
    this.solidKeys = solidSet; // kept live: felling a tree deletes from it, so re-baked AO agrees
    // The lava field, for the per-region grade (updateBiomeGrade).
    for (const l of getLavaTiles()) this.lavaSpots.push({ x: l.worldX, y: l.worldY });

    const tileset = getBaseTexture3D('forest-tileset');
    if (!this.terrainMats) {
      // Every tile mesh samples the one atlas, so they share the one size uniform. No `bounds`
      // here: each mesh merges thousands of quads, each windowing onto its own frame, so the
      // frame travels per vertex (aUvBounds) instead. See pixelArtLight/TEXEL_AA_GLSL.
      const tileAa: TexelAaUniforms = { size: { value: new THREE.Vector2() } };
      syncTexelAaUniforms(tileAa, tileset); // the sheet's pixel size; every base texture is loaded by now
      const ground = new THREE.MeshLambertMaterial({ map: tileset, vertexColors: true });
      patchPixelMaterial(ground, { quantize: true, texelAa: tileAa });
      // O MAR, que é o mesmo chão com movimento (worldFx 'seaFlow'): a corrente escorrendo dentro
      // do frame, a arrebentação na praia e o glint do rio. Material separado e NÃO um flag no do
      // chão porque o efeito é um programa a mais — e todo tile de terra do mundo pagaria por ele.
      const sea = new THREE.MeshLambertMaterial({ map: tileset, vertexColors: true });
      patchPixelMaterial(sea, { quantize: true, texelAa: tileAa, worldFx: 'seaFlow' });
      sea.name = 'terrain-sea'; // o playtest acha o material do mar por aqui, sem adivinhar índice
      const bank = new THREE.MeshLambertMaterial({ color: 0x2a2016, side: THREE.DoubleSide });
      patchPixelMaterial(bank, { quantize: true });
      const lavaBank = new THREE.MeshLambertMaterial({ color: 0x1a1008, side: THREE.DoubleSide });
      patchPixelMaterial(lavaBank, { quantize: true });
      // AS PAREDES E O FUNDO DO POÇO DA ESCADA. `MeshBasicMaterial` de propósito, e não Lambert:
      // um buraco não é uma superfície, então ele não recebe luz nenhuma — nem a do dia, nem a da
      // tocha na mão do herói (ver o doc de STAIRS_PIT_DEPTH). A parede é um fio mais clara que o
      // fundo, só para a beira do poço ter uma aresta em vez de virar uma mancha só.
      // PRETO PURO, e o zero e o argumento. Um quase-preto (0x040308) sobreviveria a luz — `Basic`
      // nao recebe nenhuma — mas NAO sobrevive ao POST: a vista do heroi aplica um `pow` local nos
      // graves, e 0.0006 elevado a 0.7 vira 0.0075, doze vezes mais claro. O buraco ficava MARROM
      // quando o heroi chegava perto, que e a licao 3 da StairsObject acontecendo de novo por uma
      // porta nova. Zero e ponto fixo de tudo o que a cadeia faz: `pow(0,k)=0`, `0*grade=0`. E o
      // mesmo motivo pelo qual o teto do muro de dungeon e preto puro.
      const pit = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
      const pitFloor = new THREE.MeshBasicMaterial({ color: 0x000000 });
      // depthWrite MUST stay false: this flat decor sits at y=0.02, just above the
      // ground-level cast shadows/blobs. If it wrote depth it would occlude those
      // shadows in tile-shaped patches wherever decor grows (dense around fires) —
      // the "invisible square blocks eating the shadow" (user feedback). Flat ground
      // cover never needs to occlude anything, so it simply doesn't write depth.
      const decor = new THREE.MeshLambertMaterial({
        map: tileset, transparent: true, alphaTest: 0.35, depthWrite: false, vertexColors: true,
      });
      patchPixelMaterial(decor, { quantize: true, texelAa: tileAa, wind: 'stir' });
      const solid = new THREE.MeshLambertMaterial({ map: tileset, alphaTest: 0.5 });
      patchPixelMaterial(solid, { quantize: true, normalUp: true, texelAa: tileAa, wind: 'lean' });
      // A MONTANHA. Dois motivos para ela não usar `solid`, e os dois são o cubo:
      //   · vertexColors, porque `normalUp` acende TODA face como se ela olhasse para cima (é a lei
      //     de iluminação deste jogo, e o cubo de dungeon a segue) — então o volume do bloco não
      //     pode vir da normal, tem de vir pintado no vértice (ROCK_CUBE_SHADE);
      //   · sem alphaTest, porque a arte de pedra é uma parede full-bleed cuja última linha é a
      //     sombra de contato em alpha 0.1 — com corte em 0.5 ela desapareceria e cada bloco
      //     ficaria com uma fresta de 1px no pé, vazando o chão de trás.
      const rock = new THREE.MeshLambertMaterial({ map: tileset, vertexColors: true });
      patchPixelMaterial(rock, { quantize: true, normalUp: true, texelAa: tileAa });
      rock.name = 'terrain-rock';
      // O TOPO DA PAREDE DE DUNGEON: PRETO PURO, e sem luz nenhuma.
      //
      // Foram tres tentativas antes desta, e todas erraram para o mesmo lado — claro demais. Um
      // degrade de ambiente-ocluido nos cantos (a receita que jogo de bloco costuma usar), depois
      // o mesmo degrade em Lambert para reagir a tocha, depois as duas cores mais escuras que
      // existem na propria arte de dungeon. Nenhuma prestou: qualquer valor acima de zero, num
      // ambiente com a ambiente forte que este jogo usa, faz o topo competir com o chao — e o
      // topo nao e uma superficie que o jogador deva ler, e o vazio entre uma sala e a outra.
      //
      // Basic e nao Lambert porque com preto puro a luz e irrelevante (preto vezes o que for
      // continua preto) e Basic e o caminho mais curto ate esse resultado.
      const wallTop = new THREE.MeshBasicMaterial({ color: 0x000000 });
      this.terrainMats = {
        ground, sea, bank, lavaBank, pit, pitFloor, decor, solid, rock, wallTop,
        voidMist: makeVoidMistMaterial(),
        blob: makeShadowBlobMaterial(0.34),
      };
    }
    const mats = this.terrainMats;

    this.groundGeo = buildFlatTileGeometry(groundTiles, 0, solidSet);
    this.addTerrainMesh(new THREE.Mesh(this.groundGeo, mats.ground));
    groundTiles.forEach((tile, i) => this.groundQuads.set(`${tile.x},${tile.z}`, i * 4));

    // The sunken riverbed (the same dirt, dropped a level) + the dark earthen banks that
    // wall the channel where it meets the land — together they give the water its depth.
    // The sea's surface is its own mesh (the animated material), the river's bed is not: a
    // river tile's WATER is a prop quad above the bed, and the bed under it is plain dirt.
    if (bedTiles.length > 0) {
      this.addTerrainMesh(new THREE.Mesh(
        buildFlatTileGeometry(bedTiles, -WATER_DEPTH_TILES, solidSet), mats.ground,
      ));
    }
    if (seaTiles.length > 0) {
      // Where the water's edge IS, per corner of every sea tile: the shore ramp the breaking
      // wave rides. `wetKeys` counts river tiles as water too, so a river running into the sea
      // does not grow a beach across its own mouth.
      const wetKeys = new Set<number>();
      for (const t of seaTiles) wetKeys.add(tileKey(t.x, t.z));
      for (const t of bedTiles) wetKeys.add(tileKey(t.x, t.z));
      this.addTerrainMesh(new THREE.Mesh(
        buildFlatTileGeometry(
          seaTiles, -WATER_DEPTH_TILES, solidSet, (x, z) => tileShoreCorners(x, z, wetKeys),
        ),
        mats.sea,
      ));
    }
    // The banks close the channel wherever water meets land — one wall per exposed edge, for
    // the river and the sea alike (they share the depth, so they share the coastline).
    const wetTiles = seaTiles.length > 0 ? [...bedTiles, ...seaTiles] : bedTiles;
    if (wetTiles.length > 0) {
      const sunken = seaSet.size > 0 ? new Set([...waterSet, ...seaSet]) : waterSet;
      this.addTerrainMesh(new THREE.Mesh(
        buildBankGeometry(sunken, wetTiles, WATER_DEPTH_TILES), mats.bank,
      ));
    }

    // The lava basin: the same recipe, shallower — a dropped bed to close the well's bottom and
    // dark CHARRED banks (near-black basalt) walling it where the melt meets the land.
    if (lavaBedTiles.length > 0) {
      this.addTerrainMesh(new THREE.Mesh(
        buildFlatTileGeometry(lavaBedTiles, -LAVA_DEPTH_TILES, solidSet), mats.ground,
      ));
      this.addTerrainMesh(new THREE.Mesh(
        buildBankGeometry(lavaSet, lavaBedTiles, LAVA_DEPTH_TILES), mats.lavaBank,
      ));
    }

    // O POÇO DA ESCADA: o mesmo leito afundado + paredes do rio, com UMA diferença que é a peça
    // toda — ele não é iluminado. Um canal de rio é uma superfície ao ar livre e recebe a luz do
    // mundo; um poço é a AUSÊNCIA de chão, e a lição nº 3 da StairsObject já tinha medido o que
    // acontece quando se tenta pintar isso com um material iluminado: a caixa escura soma a
    // ambiente quente, vira lama, e CLAREIA junto com o dia e com a tocha na mão — o oposto de um
    // buraco. `pit` é `MeshBasicMaterial`, então o fundo e as paredes são o mesmo preto ao
    // meio-dia, à meia-noite e sob a tocha. É esta a sombra escura que mora dentro do buraco.
    if (pitTiles.length > 0) {
      this.addTerrainMesh(new THREE.Mesh(
        buildFlatTileGeometry(pitTiles, -STAIRS_PIT_DEPTH, solidSet), mats.pitFloor,
      ));
      this.addTerrainMesh(new THREE.Mesh(
        buildBankGeometry(pitSet, pitTiles, STAIRS_PIT_DEPTH), mats.pit,
      ));
      for (const t of pitTiles) this.sunkenTiles.add(tileKey(t.x, t.z));
    }

    this.decorGeo = buildFlatTileGeometry(
      decorTiles, 0.02, solidSet, undefined, (frame) => (WIND_STIR_FRAMES.has(frame) ? 1 : 0),
    );
    this.addTerrainMesh(new THREE.Mesh(this.decorGeo, mats.decor));
    decorTiles.forEach((tile, i) => {
      this.decorQuads.set(`${tile.x},${tile.z}`, i * 4);
      if (tile.frame === LOW_GRASS_TILE) this.grassQuads.set(`${tile.x},${tile.z}`, i * 4);
      // Onde o enxame de vaga-lumes pode pousar. Sai da MESMA varredura da decoração porque é a
      // mesma pergunta ("que tile é verde?"): um segundo passo sobre o mundo seria uma segunda
      // resposta, livre para discordar.
      if (FIREFLY_HOST_FRAMES.has(tile.frame)) this.greenTiles.push(tile.x, tile.z);
    });

    // A alvenaria de dungeon e a MONTANHA saem da malha dos quads e viram CUBO (ver
    // buildTileCubeGeometry). Elas sao separadas por dois motivos: um bloco macico precisa de
    // espessura para ler como bloco macico, e `solidQuads` — o indice que o machado usa para
    // derrubar uma arvore em pe — assume 4 vertices por tile. Um cubo tem entre 8 e 20, e
    // misturar os dois numa malha so faria a aritmetica desse indice apontar para o vertice
    // errado no primeiro golpe. (Nenhum dos dois e cortavel, entao nenhum dos dois entra nesse
    // indice — e o quad continua sendo o que uma ARVORE e: uma silhueta, sem lado.)
    const wallCubes = this.solidTiles.filter((t) => DUNGEON_WALL_SET.has(t.frame));
    const rockCubes = this.solidTiles.filter((t) => CLIFF_WALL_SET.has(t.frame));
    const quadTiles = wallCubes.length > 0 || rockCubes.length > 0
      ? this.solidTiles.filter((t) => !DUNGEON_WALL_SET.has(t.frame) && !CLIFF_WALL_SET.has(t.frame))
      : this.solidTiles;

    // All standing trees/walls merged into ONE upright mesh (one draw call, one shadow).
    // Lit like the ground at their feet — same treatment the dynamic billboards get.
    // TODA árvore fica no centro exato do seu tile — a de dentro do mapa e a de fora igualmente.
    //
    // Houve aqui um desvio de profundidade por tile na mata de fora, para as fileiras não lerem
    // como pomar. Foi erro de leitura: **o mundo é uma grade, e a grade é o desenho.** Uma árvore
    // fora do centro do tile não lê como floresta natural, lê como peça solta — e desmente a única
    // coisa que todo tile deste jogo promete: que ali cabe exatamente um. A variedade da mata vem
    // dos SEIS frames de pinheiro, que é variação DENTRO do tile, e da névoa por cima.
    this.solidGeo = buildUprightTileGeometry(quadTiles);
    quadTiles.forEach((tile, i) => this.solidQuads.set(`${tile.x},${tile.z}`, i * 4));
    this.addTerrainMesh(new THREE.Mesh(this.solidGeo, mats.solid));

    if (wallCubes.length > 0) {
      const cubeSet = new Set(wallCubes.map((t) => tileKey(t.x, t.z)));
      this.addTerrainMesh(new THREE.Mesh(
        buildTileCubeGeometry(wallCubes, (x, z) => cubeSet.has(tileKey(x, z))),
        [mats.wallTop, mats.solid], // grupo 0 = teto preto, grupo 1 = as faces de tijolo
      ));
    }

    // A MONTANHA, pelo mesmo caminho e com duas diferencas: o teto e ROCHA iluminada (uma
    // montanha vista de cima e um planalto, nao o vazio entre duas salas) e as faces vem
    // sombreadas no vertice, que e de onde o volume vem quando a luz e sempre de cima.
    if (rockCubes.length > 0) {
      const rockSet = new Set(rockCubes.map((t) => tileKey(t.x, t.z)));
      this.addTerrainMesh(new THREE.Mesh(
        buildTileCubeGeometry(rockCubes, (x, z) => rockSet.has(tileKey(x, z)), ROCK_CUBE_SHADE),
        mats.rock,
      ));
    }

    // Only EXPOSED solids (clearing edges, lone trees) get a grounding blob and cast a
    // shadow. A tile buried in the forest wall has ~all 8 neighbours solid; giving each
    // one a blob/shadow merges them into a dark block hugging the wall (user feedback),
    // and a packed tree reads as a mass anyway. Keep the ones with open space around them.
    for (const t of this.solidTiles) {
      let neighbours = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dz) && solidSet.has(tileKey(t.x + dx, t.z + dz))) neighbours++;
        }
      }
      if (neighbours <= 4) this.castableSolids.push(t);
    }

    // The shadow pass's spatial index (see updateCastShadows): buckets answer "which
    // standing tiles sit near the TORCH" without scanning the world, and the sunken set
    // is where a silhouette must stop instead of floating over the river/lava/sea channel.
    //
    // Indexed over EVERY standing tile, not just the exposed ones. The exposed-only rule
    // (<= 4 solid neighbours) exists so that packed forest-wall tiles don't each get a
    // contact blob and merge into one dark block — a real problem, and one that belongs to
    // the always-on ambient layers (the blob mesh and the baked moon field keep the rule).
    // For the FIRE cast it was a bad trade the moment the torch existed: a mobile flame
    // walks right up to the forest wall and lights those tiles brightly, and a brightly lit
    // tree with no shadow is exactly what the player notices (reported twice). It is also
    // nearly free — of 846 standing tiles only 93 are excluded, and a cast is only emitted
    // while a flame is actually in reach.
    for (const t of this.solidTiles) {
      const bk = bucketKey(t.x, t.z);
      const bucket = this.solidBuckets.get(bk);
      if (bucket) bucket.push(t);
      else this.solidBuckets.set(bk, [t]);
    }
    // A NÉVOA NEGRA sobre a mata de fora (só na superfície — ver makeVoidMistMaterial): uma
    // CORTINA em pé por tile, no mesmo plano das árvores, um pouco mais alta que a copa. Uma
    // malha, um draw, e a rampa inteira mora no shader.
    if (!isUnderground() && voidTiles.length > 0) {
      const mist = new THREE.Mesh(buildMistCurtainGeometry(voidTiles, VOID_MIST_HEIGHT), mats.voidMist);
      mist.renderOrder = 4; // depois da poça de fogo e do blob: a névoa cobre o que vier antes
      const u = mats.voidMist.userData.mist as MistUniforms;
      // O retângulo é a BORDA do mundo, não o centro do último tile: um tile em `x` ocupa
      // [x-0.5, x+0.5], então meio tile de folga de cada lado é o que faz a rampa começar em
      // zero exatamente onde o chão autorado acaba.
      u.rect.value.set(b.minTileX - 0.5, b.minTileY - 0.5, b.maxTileX + 0.5, b.maxTileY + 0.5);
      u.depth.value = this.params.voidMist;
      this.addTerrainMesh(mist);
    }

    for (const t of wetTiles) this.sunkenTiles.add(tileKey(t.x, t.z));
    for (const t of lavaBedTiles) this.sunkenTiles.add(tileKey(t.x, t.z));

    // The soft ambient ground blob each obstacle had in 2D ("anchors lifted obstacles so
    // they read as standing up") — merged into one mesh, all sharing the soft blob texture.
    // A touch of forward (+z, toward camera) bias peeks the blob out at the tree's foot.
    this.blobGeo = buildShadowBlobGeometry(
      this.castableSolids.map((t) => ({ x: t.x, z: t.z + 0.06 })), 0.46, 0.42,
    );
    this.castableSolids.forEach((tile, i) => this.solidBlobQuads.set(`${tile.x},${tile.z}`, i * 4));
    const ellipses = new THREE.Mesh(this.blobGeo, mats.blob);
    ellipses.renderOrder = 3; // after the additive fire glow, so the blob isn't washed out
    this.addTerrainMesh(ellipses);

    // …and the firelight shadow each of them THROWS, all of it in one draw. It used to be one mesh
    // per solid — 36 of the frame's 120 draw calls, and with them the bulk of its garbage, since
    // three allocates inside its uniform setters and the GC bill tracks the draw count.
    // Fixed capacity, so a streaming re-bake keeps the same field (and the same draw).
    if (!this.solidCastField) {
      this.solidCastField = new SolidCastField(CAST_POOL_MAX, getBaseTexture3D('forest-tileset'));
      this.scene.add(this.solidCastField.mesh);
    }

    // …and the MOON shadow each of them throws, likewise one draw — but this one is baked
    // ONCE, not refilled per frame: the moon never moves, so neither do these. Sized to hold
    // every castable solid in the world; only the on-screen fragments cost anything.
    //
    // An InstancedMesh cannot grow, and a streaming window's count changes with every re-bake —
    // so once a window has been re-baked the field is over-allocated with headroom and kept,
    // instead of allocating a new one (and a new draw) every time the hero crosses a chunk.
    const needed = Math.max(1, this.castableSolids.length);
    if (!this.moonCastField || needed > this.moonFieldCapacity) {
      this.moonCastField?.mesh.removeFromParent();
      this.moonFieldCapacity = this.terrainBakes > 1
        ? Math.ceil(needed * 1.5) // already streaming: leave room for the next, denser window
        : needed;
      this.moonCastField = new SolidCastField(this.moonFieldCapacity, getBaseTexture3D('forest-tileset'));
      this.scene.add(this.moonCastField.mesh);
    }
    this.fillMoonCastField();
  }

  /** Every terrain mesh goes through here, so a re-bake can take them all back out again. */
  private addTerrainMesh(mesh: THREE.Mesh): void {
    this.scene.add(mesh);
    this.terrainMeshes.push(mesh);
  }

  /**
   * The shadow mask's plumbing (hd3d.shadowMask — see the param doc): a small top-down
   * ortho RT following the camera. Built unconditionally (it is tiny) so flipping the
   * knob mid-run allocates nothing; the mask is only RENDERED while the knob is on.
   */
  private initShadowMask(): void {
    const res = Math.max(4, this.params.shadowMaskRes);
    this.maskTarget = new THREE.WebGLRenderTarget(MASK_TILES_X * res, MASK_TILES_Z * res, {
      depthBuffer: false,
      magFilter: THREE.LinearFilter, // the mask is light data, not art — soft edges are penumbra
      minFilter: THREE.LinearFilter,
    });
    // up = +z so the RT's v axis grows with world z — the exact mapping zhShadowMask
    // assumes (uv = (worldXZ - rect.xy) / rect.zw).
    this.maskCamera = new THREE.OrthographicCamera(
      -MASK_TILES_X / 2, MASK_TILES_X / 2, MASK_TILES_Z / 2, -MASK_TILES_Z / 2, 0.1, 20,
    );
    this.maskCamera.up.set(0, 0, 1);
    shadowMaskUniform.value = this.maskTarget.texture;
  }

  /**
   * Move the fire silhouettes between the SCENE (classic decals multiplied over the
   * frame) and the MASK scene (value writers into the RT). Meshes may come and go
   * freely — only lights are frozen — and every material variant here compiled at boot
   * (prewarmShaders), so the flip costs one reparenting walk and zero compiles.
   */
  private applyShadowMaskMode(on: boolean): void {
    this.appliedMaskMode = on;
    shadowMaskOnUniform.value = on ? 1 : 0;
    const parent = on ? this.maskScene : this.scene;
    for (const c of this.castCasters) {
      c.mesh.removeFromParent();
      parent.add(c.mesh);
      c.mesh.material = on ? c.maskMat : c.sceneMat;
    }
    this.solidCastField.mesh.removeFromParent();
    parent.add(this.solidCastField.mesh);
    this.solidCastField.setMaskMode(on);
    // The MOON casts and the arm's ShadowStrips stay scene-side for now (they multiply
    // the final colour either way); migrating them into a second mask channel is the
    // documented follow-up (plano.md fase 3, passo v).
  }

  /** Draw this frame's fire silhouettes into the mask RT (mask mode only). */
  private renderShadowMask(): void {
    const cam = this.maskCamera;
    const res = Math.max(4, this.params.shadowMaskRes);
    // Snap the window to the mask's own texel grid, or the sampled shadows swim
    // against the world as the camera pans (the lightRes lesson, applied to the RT).
    const cx = Math.round(this.camTarget.x * res) / res;
    const cz = Math.round(this.camTarget.z * res) / res;
    cam.position.set(cx, 10, cz);
    cam.lookAt(cx, 0, cz);
    cam.updateMatrixWorld();
    shadowMaskRectUniform.value.set(
      cx - MASK_TILES_X / 2, cz - MASK_TILES_Z / 2, MASK_TILES_X, MASK_TILES_Z,
    );
    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.getClearColor(maskClearScratch.color);
    const prevAlpha = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(this.maskTarget);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear(true, false, false);
    this.renderer.render(this.maskScene, cam);
    this.renderer.setRenderTarget(prevTarget);
    this.renderer.setClearColor(maskClearScratch.color, prevAlpha);
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
        tile.moonSlot = undefined;
        field.add(
          tile.x, tile.z, frameUvWindow('forest-tileset', tile.frame),
          CAST_WIDTH_FACTOR, length, this.moonCastRotY, alpha,
          frameFootPad('forest-tileset', tile.frame),
          tile, // handed back below with the slot the sort assigned — the handoff's handle
        );
      }
    }
    field.end(0, 1e6, (ref, slot) => { (ref as SolidTileEntry).moonSlot = slot; });
    // A re-bake rewrote every instance's alpha, so nothing is dimmed any more.
    this.moonDimmed.length = 0;
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

  /**
   * Erase one FLAT decor quad (low grass, foliage, litter) from the merged decor mesh — the
   * shovel turning the soil under a dug hole. Same collapse trick as removeSolidTile: the four
   * vertices fold onto a point, nothing reallocates. The active rustle (if any) dies with it,
   * and it MUST: updateRustles rewrites absolute corner positions every frame, so a live
   * rustle would resurrect the collapsed quad on its next tick. Caller also clears the tile in
   * the chunk data — a later rebake reads from there, not from this mesh.
   */
  public removeDecorTile(worldX: number, worldY: number): void {
    const key = `${worldX},${worldY}`;
    const vertStart = this.decorQuads.get(key);
    if (vertStart === undefined) return; // no decor here, or already dug away
    this.decorQuads.delete(key);
    this.grassQuads.delete(key);
    this.activeRustles.delete(key);
    collapseQuad(this.decorGeo, vertStart);
  }

  public removeSolidTile(worldX: number, worldY: number): void {
    const key = `${worldX},${worldY}`;
    const vertStart = this.solidQuads.get(key);
    if (vertStart === undefined) return; // not a standing tile, or already felled
    this.solidQuads.delete(key);
    this.solidKeys.delete(tileKey(worldX, worldY));
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

    // The fire cast pass indexes EVERY standing tile (see buildTerrain), so a felled tree
    // has to leave that array too or its stump keeps throwing a whole tree's silhouette.
    // Splicing cannot invalidate solidQuads/solidBlobQuads: those store vertex OFFSETS into
    // geometry that never shrinks, not indices into these arrays.
    const solidIndex = this.solidTiles.findIndex((t) => t.x === worldX && t.z === worldY);
    const felled = solidIndex >= 0 ? this.solidTiles[solidIndex] : undefined;
    if (solidIndex >= 0) this.solidTiles.splice(solidIndex, 1);
    if (felled) {
      this.fireCastLists.clear();
      const bucket = this.solidBuckets.get(bucketKey(worldX, worldY));
      if (bucket) {
        const bi = bucket.indexOf(felled);
        if (bi >= 0) bucket.splice(bi, 1);
      }
    }

    // …and the exposed set, which is what the contact blobs and the baked MOON field read.
    const castIndex = this.castableSolids.findIndex((t) => t.x === worldX && t.z === worldY);
    if (castIndex >= 0) {
      this.castableSolids.splice(castIndex, 1);
      this.fillMoonCastField(); // baked once, so a vanished caster means a re-bake
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
      const sceneMat = mesh.material as THREE.Material;
      const maskMat = makeCastMaskMaterial();
      if (this.appliedMaskMode) {
        this.maskScene.add(mesh);
        mesh.material = maskMat;
      } else {
        this.scene.add(mesh);
      }
      this.castCasters.push({ bb, mesh, sceneMat, maskMat, lastFire: null });
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
  public groundCastAt(
    x: number,
    z: number,
    memory?: CastMemory,
  ): { dirX: number; dirZ: number; unitLen: number; alpha: number } | null {
    const radius = Math.max(0.5, this.params.castShadowRadius);
    const heightScale = 2.2 / Math.max(0.5, this.params.shadowHeight);
    // Callers that live across frames (the robotic arm) pass their own memory so the
    // heading hysteresis holds for them too; a memory-less call gets a fresh (reset)
    // holder — hysteresis needs history, and a shared default would leak one caller's
    // incumbent flame into another's.
    const mem = memory ?? this.groundCastFallback;
    if (!memory) mem.lastFire = null;
    // Same rule as the actors: standing on a lit fire tile has no stable heading.
    const fromFire = !this.onLitFireTile(x, z)
      && this.nearestLitFireInto(x, z, mem, this.nearestScratch)
      && castTransformInto(
        this.fireCastScratch, x, z, 1,
        this.nearestScratch.worldX, this.nearestScratch.worldY, this.nearestScratch.level,
        radius, this.params.castShadowAlpha, heightScale,
      );
    if (!handoffCastInto(
      this.castScratch, fromFire ? this.fireCastScratch : null,
      this.moonCastRotY, this.params.moonShadowLength, this.params.moonShadowAlpha,
    )) return null;
    const cast = this.castScratch;
    // The heading is stored as a quad rotation (head along -Z); the ground vector is its image.
    return { dirX: -Math.sin(cast.rotY), dirZ: -Math.cos(cast.rotY), unitLen: cast.length, alpha: cast.alpha };
  }

  private readonly groundCastFallback: CastMemory = {};

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
    // DE DIA O PISO NÃO É ZERO. A chama é a única luz que este cálculo conhece, e isso está certo
    // à noite — longe do fogo o arco tem mesmo de escurecer. Ao meio-dia a mesma conta devolvia 0
    // no campo aberto e a espada saía como um borrão escuro por cima de um mundo batido de sol: o
    // "branco estourado" ao contrário, e pelo mesmo motivo (o traço não recebe a luz da cena).
    // O sol não tem posição para consultar — ele bate em tudo —, então ele é um PISO.
    let best = this.appliedDaylight ? DAYLIGHT_SWING_FLOOR : 0;
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
  public addBox(
    sizeX: number,
    sizeH: number,
    sizeZ: number,
    skin: number | THREE.Texture,
    opts: BoxSkinOpts = {},
  ): Box3D {
    const geo = new THREE.BoxGeometry(sizeX, sizeH, sizeZ);
    if (opts.pixelTiled && typeof skin !== 'number') tileBoxUv(geo, sizeX, sizeH, sizeZ, skin, opts.uvShift);
    // transparent stays on even at alpha 1 so ghost previews and solid props share a material
    // shape (toggling `transparent` at runtime would force a shader recompile).
    //
    // `unlit` e a excecao, e ela existe para UMA coisa: o vao da escada. Buraco nao e superficie
    // — ele nao tem nada para a luz bater —, e um Lambert escuro somava ambiente, luar, fogueira
    // e tocha ate clarear. Um buraco que fica mais claro ao meio-dia deixa de ser buraco. Isto
    // NAO e um atalho de performance nem um jeito de "pintar" pecas: quem se pinta e superficie,
    // e superficie recebe luz.
    const mat = opts.unlit
      ? new THREE.MeshBasicMaterial(
        typeof skin === 'number' ? { color: skin, transparent: true } : { map: skin, transparent: true },
      )
      : new THREE.MeshLambertMaterial(
        typeof skin === 'number' ? { color: skin, transparent: true } : { map: skin, transparent: true },
      );
    if (!opts.unlit) patchPixelMaterial(mat, { quantize: true });
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

  /**
   * Low-poly prop geometry that needs to rotate as a real THREE hierarchy (the water wheel's
   * torus, spokes, paddles and axle). It uses the exact same quantized Lambert material as
   * `addBox`, so custom geometry receives the game's fire/moon lighting instead of looking like
   * a foreign smooth PBR model. Ownership of geometry/material stays with the caller.
   */
  public addLitMesh(geometry: THREE.BufferGeometry, skin: number | THREE.Texture): THREE.Mesh {
    const material = new THREE.MeshLambertMaterial(
      typeof skin === 'number'
        ? { color: skin, transparent: true, flatShading: true }
        : { map: skin, transparent: true, flatShading: true },
    );
    patchPixelMaterial(material, { quantize: true });
    const mesh = new THREE.Mesh(geometry, material);
    this.scene.add(mesh);
    return mesh;
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
      // Um quad deitado e aditivo, ainda LIDO pelo fog: o disco de calor da poca de fogo e os
      // aneis no chao. Fica no prewarm mesmo que hoje nasca tarde — um `alphaTest`/flag novo
      // vira outro programa, e compilar shader em runtime e o pior stall que este jogo tem.
      { flat: true, additive: true },
      // The moonflower's two bodies. They are LIT sprites with a lowered alphaTest, because they
      // CROSS-DISSOLVE into each other (see MoonflowerObject) and the lit default of 0.5 would pop
      // a fading sprite out of existence instead of fading it. `alphaTest` reaches the program's
      // cache key, so "the same billboard with a different cutoff" is a different shader — and the
      // lying one is born hidden, so compile() (which walks only VISIBLE objects) would never see
      // it and the first bloom of the run would pay for the link.
      { groundShadow: true, alphaTest: 0.02 },
      { flat: true, alphaTest: 0.02 },
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

    // The terrain's two newest materials, which a STREAMING world can meet mid-run. Every other
    // terrain material is in the scene already (the first bake ran in the constructor), but the
    // sea's mesh only exists if the baked window HAS water and the mountain's only if it has rock —
    // and the explorer re-bakes a moving window, so a lake can enter the world on frame 4000 and
    // compile its program there: a 50-300ms freeze mid-expedition. (`explorador` asserts zero new
    // programs across a traversal, so this would also fail the suite, correctly.)
    const mats = this.terrainMats;
    if (mats) {
      const stand = [
        new THREE.Mesh(
          buildFlatTileGeometry(
            [{ x: 0, z: 0, frame: SEA_TILE_FRAME }], -80, undefined, () => [0, 0, 0, 0],
          ),
          mats.sea,
        ),
        new THREE.Mesh(
          buildTileCubeGeometry(
            [{ x: 0, z: 0, frame: CLIFF_WALL_FRAMES[0] }], () => false, ROCK_CUBE_SHADE,
          ),
          mats.rock,
        ),
      ];
      for (const mesh of stand) {
        mesh.position.set(0, -80, 0); // out of the world, and hidden right after the compile
        this.scene.add(mesh);
        this.warmups.push({ setVisible: (v: boolean) => { mesh.visible = v; } });
      }
    }

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

    // The shadow mask's material variants too (castMask / solidCastFieldMask): flip the
    // silhouettes into mask mode for one compile pass so toggling hd3d.shadowMask later
    // never compiles a program mid-run. The mask RT is bound for it — same colour-space
    // reasoning as the composer target above.
    this.applyShadowMaskMode(true);
    this.renderer.setRenderTarget(this.maskTarget);
    this.renderer.compile(this.maskScene, this.maskCamera);
    this.applyShadowMaskMode(false);

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
      setPosition: (x, y) => {
        // A cache de solidos da sombra e POR POSICAO (ver fireCastLists): invalida so na troca
        // de TILE — invalidar a cada frame faria um fogo ambulante pagar uma varredura completa
        // de solidTiles por quadro, para uma sombra que nao mudou de vizinhanca.
        if (Math.round(x) !== Math.round(entry.worldX) || Math.round(y) !== Math.round(entry.worldY)) {
          this.fireCastLists.delete(entry);
        }
        entry.worldX = x;
        entry.worldY = y;
      },
      destroy: () => {
        if (released) return;
        released = true;
        const i = this.fires.indexOf(entry);
        if (i >= 0) this.fires.splice(i, 1);
        this.fireCastLists.delete(entry); // its candidate-solids cache goes with it
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
   * A LUZ PRÓPRIA DO HERÓI — a vista dele, e por que ela é uma CURVA e não uma lâmpada.
   *
   * A lâmpada existe (`heroLight`, neutra e fraca, logo abaixo) e à noite ela não pode mostrar
   * nada. A conta é esta, e vale para QUALQUER luz nova que alguém queira pendurar no herói:
   * `lightCap` (1.55) limita a soma da luz DIRETA a `albedo × cap − ambiente`, a ambiente de 8.5
   * já gasta ~1.24 e a lua gasta o resto — sobra ~2% de vermelho no chão aberto. Uma PointLight a
   * mais entrega irradiância de sobra e o teto joga tudo fora: o chão à volta do herói continua
   * exatamente com a mesma cor. (É por isso que a fogueira precisa do disco aditivo para ler como
   * luz: a PointLight dela também bate no teto.)
   *
   * Então a vista é o que skyPreset.ts já ensina: **quem levanta um quadro é a CURVA**. O post
   * aplica um `pow` LOCAL, centrado nos pés dele e pendendo para onde ele olha — os graves em
   * volta abrem, o 1 continua 1, e o longe fica no escuro em que estava. Três consequências que
   * fazem dela uma VISÃO e não uma auréola:
   *
   *   · **Ninguém mais a vê.** Ela não é matéria na cena: não acende bicho, não derrete o escuro
   *     de uma cova, não conta como fogo para `nearestLitFireInto` — não projeta sombra nenhuma.
   *   · **Ela cede à luz de verdade.** O `pow` abre o grave e não mexe no alto, então dentro da
   *     poça de uma fogueira ela não soma quase nada. A economia de acender o mundo fica de pé:
   *     a vista mostra o tile em que ele pisa, a fogueira é que abre a região.
   *   · **Ela não é banda.** Todo desenho de luz deste jogo é escadinha de pixel art (o disco da
   *     fogueira, o `lightSteps`); esta não, porque não é luz caindo no chão — é o olho.
   *
   * `strength01` é a mesma da lâmpada: a cut-scene da primeira fogueira a apaga e a devolve.
   */
  public setHeroSight(
    worldX: number, worldY: number, faceX: number, faceY: number, strength01: number,
  ): void {
    const s = Math.max(0, strength01);
    this.sight.x = worldX;
    this.sight.y = worldY;
    // Normalizado aqui, uma vez: o `facing` do controlador é um passo de tile (±1, 0), mas um
    // diagonal futuro entraria como (1,1) e esticaria o pêndulo em √2 sem ninguém pedir.
    const len = Math.hypot(faceX, faceY) || 1;
    this.sight.fx = faceX / len;
    this.sight.fy = faceY / len;
    this.sight.strength = s;

    // A lâmpada segue a MESMA frente da vista (uma coisa só olhando para um lado só), ainda que o
    // teto acima quase não a deixe aparecer — com o teto solto, ou fora do chão aberto, ela existe.
    // Metade do pêndulo: ela mora no CORPO (y = 1.2) e a vista mora no chão à frente dos pés, então
    // pendê-la o mesmo tanto tiraria a luz de dentro do herói que ela existe para banhar.
    const lean = this.params.heroSightLean;
    const light = this.ensureHeroLight();
    light.position.set(worldX + this.sight.fx * lean * 0.5, 1.2, worldY + this.sight.fy * lean * 0.5);
    light.intensity = this.params.heroLight * s;
  }

  private ensureHeroLight(): THREE.PointLight {
    if (!this.heroLight) {
      this.heroLight = new THREE.PointLight('#e8e9ec', 0, 8, 1.6);
      this.scene.add(this.heroLight);
    }
    return this.heroLight;
  }

  /**
   * O disco da vista: o MESMO quad de poça que a fogueira e a tocha usam (mesmo programa, mesma
   * escadinha de banda no grid da arte), com a rampa fria e sem tremor.
   *
   * Ele existe porque a curva sozinha não tem SILHUETA. Um `pow` local clareia uma região e nada
   * mais — sem borda, sem centro, sem forma —, e a olho isso lê como "a tela está mais clara", não
   * como "o herói tem luz". Neste renderizador quem dá forma a uma luz é sempre o disco aditivo;
   * está escrito no doc do `acquireGlow` desde a primeira fogueira. A curva revela, o disco é o
   * desenho — e as duas juntas são a vista.
   */
  private ensureSightGlow(): THREE.Mesh {
    if (!this.sightGlow) {
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.rotateX(-Math.PI / 2);
      this.sightGlow = new THREE.Mesh(geo, makeFireGlowMaterial({
        ramp: { core: SIGHT_RAMP_CORE, mid: SIGHT_RAMP_MID, rim: SIGHT_RAMP_RIM },
        wobble: zeroWobbleUniform,
      }));
      this.sightGlow.renderOrder = 2;
      this.scene.add(this.sightGlow);
    }
    return this.sightGlow;
  }

  /**
   * Entrega a vista ao post: onde ela cai na TELA e que tamanho tem lá.
   *
   * Ela é medida por PROJEÇÃO, nunca por uma conta de tela. O herói mora ~no centro, então a
   * tentação é cravar (0.5, 0.5) e um raio em pixels — e as duas partes quebram. O centro
   * escorrega numa fala (`setViewOffset` desloca o herói para caber na caixa de diálogo), e o
   * raio não é um círculo: a câmera olha 48° para baixo, então um disco de chão chega à tela como
   * uma ELIPSE, mais larga que alta.
   *
   * **A ARMADILHA, e ela custou uma versão inteira: a medida tem de ser CENTRADA.** A primeira
   * tirava o semi-eixo vertical projetando um ponto o raio inteiro AO SUL — e o sul é a direção da
   * CÂMERA. A perspectiva não é simétrica nesse eixo: 4,5 tiles ao sul caem quase no colo da lente
   * e projetaram 955px numa tela de 800. A elipse saía maior que o quadro, `length(sd)` dava ~0 em
   * todo pixel e a "vista" virava um `lift` GLOBAL — o mundo inteiro clareava por igual, que é
   * exatamente parecer que nada aconteceu.
   *
   * Então mede-se o tamanho de UM tile, com um par simétrico em volta do herói (±1 leste/oeste,
   * ±1 norte/sul) e uma diferença centrada: o erro de primeira ordem da perspectiva se cancela, e
   * o raio vira uma multiplicação. Continua seguindo `fov`, `camHeight` e inclinação de graça.
   */
  private updateHeroSight(): void {
    const u = this.finishPass.uniforms;
    const glow = this.ensureSightGlow();
    const glowMat = glow.material as THREE.MeshBasicMaterial;
    const amount = this.params.heroSight * this.sight.strength;
    const glowAmount = this.params.heroSightGlow * this.sight.strength;
    // Escondido de verdade, não só transparente: de dia os dois knobs são 0, e um quad aditivo de
    // cinco tiles desenhado a cada frame para somar zero é overdraw pago à toa.
    glow.visible = glowAmount > 0.002;
    if (amount <= 0.0005 && glowAmount <= 0.0005) {
      u.uSight.value = 0;
      glowMat.opacity = 0;
      return;
    }
    const r = Math.max(0.5, this.params.heroSightTiles);
    const lean = this.params.heroSightLean;
    // Os pés, não o peito: a vista é o chão que ele distingue. E ela pende para a frente dele.
    const cx = this.sight.x + this.sight.fx * lean;
    const cy = this.sight.y + this.sight.fy * lean;
    const at = this.projectTile(cx, cy, 0);
    // Um tile em pixels, nos dois eixos, por diferença CENTRADA (ver o doc acima).
    const pxPerTileX = Math.abs(
      this.projectTile(cx + 1, cy, 0).x - this.projectTile(cx - 1, cy, 0).x,
    ) / 2;
    const pxPerTileY = Math.abs(
      this.projectTile(cx, cy + 1, 0).y - this.projectTile(cx, cy - 1, 0).y,
    ) / 2;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    u.uSight.value = amount;
    (u.uSightAt.value as THREE.Vector2).set(at.x / w, 1 - at.y / h);
    (u.uSightR.value as THREE.Vector2).set(
      Math.max(0.02, (r * pxPerTileX) / w),
      Math.max(0.02, (r * pxPerTileY) / h),
    );

    // O disco, no MUNDO (o quad é chão de verdade, então aqui não há projeção nenhuma). Ele pende
    // METADE do que a curva pende: a poça tem de continuar contendo os pés dele — uma luz que sai
    // de baixo do corpo deixa de parecer que é dele.
    setFireGlow(
      glow,
      this.sight.x + this.sight.fx * lean * 0.5,
      this.sight.y + this.sight.fy * lean * 0.5,
      r * 2,
      glowAmount,
    );
  }

  // ── firelight cast shadows (2D ground silhouettes) ────────────────────────────

  /**
   * The lit light source closest to a world tile (null if none reaches it), for
   * cast-shadow aim. The carried TORCH counts too — a lit torch throws shadows off
   * objects just like a campfire — but it's skipped for whatever holds it (dist
   * ≈ 0), so the hero never casts a shadow from the flame in his own hand.
   */
  /**
   * The flame that owns `holder`'s shadow this frame, written into `out` (no allocation —
   * this runs once per caster and once per candidate solid, every frame). Squared
   * distances throughout; `litFires` was filtered for this frame in render().
   *
   * `holder.lastFire` is the heading HYSTERESIS (P5): midway between two lit fires the
   * nearest one flips with the flames' breathing, and the shadow used to snap direction
   * with it. The incumbent keeps the caster until a challenger is castHysteresis× closer.
   */
  private nearestLitFireInto(
    x: number,
    y: number,
    holder: CastMemory,
    out: { worldX: number; worldY: number; level: number },
  ): boolean {
    let best: FireEntry | 'torch' | null = null;
    let bestD2 = Infinity;
    for (const f of this.litFires) {
      const dx = f.worldX - x;
      const dy = f.worldY - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = f; }
    }
    let torchD2 = Infinity;
    if (this.torch.strength > 0.15) {
      const dx = this.torch.x - x;
      const dy = this.torch.y - y;
      torchD2 = dx * dx + dy * dy;
      // The torch is skipped for whatever holds it (d ≈ 0), so the hero never casts a
      // shadow from the flame in his own hand.
      if (torchD2 > 0.36 && torchD2 < bestD2) { best = 'torch'; bestD2 = torchD2; }
    }
    if (!best) {
      holder.lastFire = null;
      return false;
    }

    const hyst = this.params.castHysteresis;
    const prev = holder.lastFire;
    if (prev && prev !== best && hyst < 1) {
      let prevD2 = Infinity;
      if (prev === 'torch') {
        if (this.torch.strength > 0.15 && torchD2 > 0.36) prevD2 = torchD2;
      } else if (prev.lit && prev.scale > 0.05) {
        const dx = prev.worldX - x;
        const dy = prev.worldY - y;
        prevD2 = dx * dx + dy * dy;
      }
      // Keep the incumbent unless the challenger is clearly closer (ratio² on squared d).
      if (prevD2 !== Infinity && bestD2 > prevD2 * hyst * hyst) best = prev;
    }
    holder.lastFire = best;

    if (best === 'torch') {
      out.worldX = this.torch.x;
      out.worldY = this.torch.y;
      out.level = this.torch.level;
    } else {
      out.worldX = best.worldX;
      out.worldY = best.worldY;
      out.level = best.level;
    }
    return true;
  }

  /** Per-lit-fire candidate solids, built once per fire — fires never move (see the field).
   *  Over every standing tile, not just the exposed ones — see the bucket note in buildTerrain. */
  private listForFire(f: FireEntry, radius: number): SolidTileEntry[] {
    let list = this.fireCastLists.get(f);
    if (!list) {
      list = [];
      const r2 = radius * radius;
      for (const t of this.solidTiles) {
        const dx = t.x - f.worldX;
        const dz = t.z - f.worldY;
        if (dx * dx + dz * dz <= r2) list.push(t);
      }
      this.fireCastLists.set(f, list);
    }
    return list;
  }

  /**
   * Stop a silhouette at the water's edge (2b): march the heading in half-tile steps and
   * clamp the length just short of the first SUNKEN tile (river/lava/sea bed) it would
   * cross — a ground-level quad over a sunken channel floats in mid-air otherwise. Starts
   * past the caster's own tile, so standing on a bridge (or wading with the boots) never
   * self-clamps. Returns the (possibly shorter) length.
   */
  private clampCastAtSunken(x: number, z: number, rotY: number, length: number): number {
    const dirX = -Math.sin(rotY);
    const dirZ = -Math.cos(rotY);
    for (let s = 0.6; s < length; s += 0.5) {
      const tx = Math.round(x + dirX * s);
      const tz = Math.round(z + dirZ * s);
      if (this.sunkenTiles.has(tileKey(tx, tz))) return Math.max(0.3, s - 0.25);
    }
    return length;
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
    // The shadowHeight knob made honest (0d): it always promised "higher light = shorter
    // shadows" but only ever moved the LIGHT. Normalized so the tuned default (2.2) is
    // exactly the old behaviour.
    const heightScale = 2.2 / Math.max(0.5, this.params.shadowHeight);
    // Live tuning (window.hd3d): the statics' moon field is baked, so a knob move re-bakes it.
    if (moonAlpha !== this.appliedMoonShadow.alpha || moonLength !== this.appliedMoonShadow.length) {
      this.fillMoonCastField();
    }

    // Restore the moon instances the statics' handoff dimmed last frame (2d) — the pass
    // below re-dims whichever still sit inside a lit pool.
    if (this.moonDimmed.length > 0) {
      const full = this.appliedMoonShadow.alpha;
      for (const tile of this.moonDimmed) {
        if (tile.moonSlot !== undefined) this.moonCastField.setInstanceAlpha(tile.moonSlot, full);
      }
      this.moonDimmed.length = 0;
    }

    // ── dynamic casters ── um mesh por ator, ordenado individualmente (ver a nota nos campos).
    for (let i = this.castCasters.length - 1; i >= 0; i--) {
      const c = this.castCasters[i];
      if (!c.bb.active) { // the billboard was destroyed — drop its shadow
        c.mesh.removeFromParent(); // scene or maskScene, whichever mode holds it
        c.mesh.geometry.dispose();
        c.sceneMat.dispose();
        c.maskMat.dispose();
        this.castCasters.splice(i, 1);
        continue;
      }
      if (!c.bb.visible) { c.mesh.visible = false; continue; }
      const height = Math.abs(c.bb.scaleY);
      // Standing ON a lit fire tile gives no stable heading (the flame is underfoot, and a ring of
      // equal fires flips which is "nearest" with every bob) — so drop the directional cast there
      // and let the contact blob carry the shadow. Otherwise: point away from the nearest flame.
      const fromFire = !this.onLitFireTile(c.bb.x, c.bb.y)
        && this.nearestLitFireInto(c.bb.x, c.bb.y, c, this.nearestScratch)
        && castTransformInto(
          this.fireCastScratch, c.bb.x, c.bb.y, height,
          this.nearestScratch.worldX, this.nearestScratch.worldY, this.nearestScratch.level,
          radius, alpha, heightScale,
        );
      if (!handoffCastInto(
        this.castScratch, fromFire ? this.fireCastScratch : null,
        this.moonCastRotY, moonLength * height, moonAlpha,
      )) { c.mesh.visible = false; continue; }
      const cast = this.castScratch;

      // A sprite spun in the camera plane (the bomb's wobble) turns its silhouette with
      // it (2e) — the quad has no yaw, so the spin IS the ground rotation, mirrored.
      let rotY = cast.rotY;
      const spin = c.bb.mesh.rotation.z;
      if (spin !== 0) rotY -= spin;

      // Steer the sprite's mask-receive probe toward its own light (opposite the cast
      // heading): sampling there keeps a caster out of its OWN silhouette, which starts
      // exactly at its feet. Costs two writes; only read while hd3d.shadowMask is on.
      c.bb.maskProbe.value.set(Math.sin(rotY) * 0.45, Math.cos(rotY) * 0.45);

      // Elevation (2a): a lifted caster's silhouette slides away from the light and
      // thins — the same projection the arm's skeleton shadow already used (groundCastAt),
      // now the rule for every caster. Sells the walk bob, the coin arc, the ITEM GET.
      let ax = c.bb.x;
      let az = c.bb.y;
      // A silhueta EXISTE tanto quanto o dono dela. Sem isto, um corpo que apaga (o heroi
      // entrando na escada, um bicho sumindo) deixa a propria sombra de fogueira estampada no
      // chao a plena forca — o mesmo defeito que o blob de contato tinha, so que projetado.
      let a = cast.alpha * c.bb.alpha;
      const elev = c.bb.elevation * this.params.castElevation;
      if (elev > 0) {
        const unit = cast.length / Math.max(0.05, height);
        ax -= Math.sin(rotY) * elev * unit;
        az -= Math.cos(rotY) * elev * unit;
        a /= 1 + 1.2 * elev;
      }

      // The silhouette stops at the water's edge instead of floating over the channel (2b).
      // Floored at MIN_CAST_LEN, unlike the statics' path: a static keeps a separate baked
      // moon instance when its fire cast is dropped, but an actor owns exactly ONE quad, so
      // cutting it to a stub would leave the hero standing on the bank with no shadow at
      // all. A shadow overhanging the water by half a tile is the lesser wrong.
      let length = cast.length;
      if (this.params.castWaterClamp > 0) {
        const clamped = this.clampCastAtSunken(ax, az, rotY, length);
        if (clamped < length) {
          length = Math.max(MIN_CAST_LEN, clamped);
          a *= 0.6;
        }
      }

      const width = Math.abs(c.bb.scaleX);
      applyCast(
        c.mesh, ax, az, getTexture3D(c.bb.texKey, c.bb.frame), c.bb.flipX,
        width, length, rotY, a,
        frameFootPad(c.bb.texKey, c.bb.frame),
      );
    }

    // ── static solid tiles (trees/walls) near a lit flame — one instanced draw ──
    // Candidates come from the per-fire lists plus the torch's spatial buckets (P8): the
    // world is never scanned per frame any more. `mark` dedupes a tile two flames reach.
    const field = this.solidCastField;
    field.begin();
    const torchLive = this.torch.strength > 0.15;
    if (torchLive || this.litFires.length > 0) {
      if (this.fireListRadius !== radius) { // the radius knob moved — the lists are stale
        this.fireCastLists.clear();
        this.fireListRadius = radius;
      }
      this.castFrameId += 1;
      const id = this.castFrameId;
      for (const f of this.litFires) {
        const list = this.listForFire(f, radius);
        for (const tile of list) {
          if (tile.mark === id) continue;
          tile.mark = id;
          this.emitSolidCast(tile, radius, alpha, heightScale, moonAlpha);
        }
      }
      if (torchLive) {
        const r2 = radius * radius;
        const bx0 = (Math.round(this.torch.x - radius) + 4096) >> 2;
        const bx1 = (Math.round(this.torch.x + radius) + 4096) >> 2;
        const bz0 = (Math.round(this.torch.y - radius) + 4096) >> 2;
        const bz1 = (Math.round(this.torch.y + radius) + 4096) >> 2;
        for (let bx = bx0; bx <= bx1; bx++) {
          for (let bz = bz0; bz <= bz1; bz++) {
            const bucket = this.solidBuckets.get(bx * 16384 + bz);
            if (!bucket) continue;
            for (const tile of bucket) {
              if (tile.mark === id) continue;
              const dx = tile.x - this.torch.x;
              const dz = tile.z - this.torch.y;
              if (dx * dx + dz * dz > r2) continue;
              tile.mark = id;
              this.emitSolidCast(tile, radius, alpha, heightScale, moonAlpha);
            }
          }
        }
      }
    }
    field.end(this.camTarget.x, this.camTarget.z);
  }

  /** One static tile's fire silhouette into the field — plus its moon handoff (2d). */
  private emitSolidCast(
    tile: SolidTileEntry,
    radius: number,
    alpha: number,
    heightScale: number,
    moonAlpha: number,
  ): void {
    if (this.solidCastField.pendingCount >= CAST_POOL_MAX) return;
    // Spend the pool on what the player can SEE (see CAST_CAMERA_REACH): candidates arrive
    // in fire order, so without this a fire off screen is served before the hero's own.
    const cdx = tile.x - this.camTarget.x;
    const cdz = tile.z - this.camTarget.z;
    if (cdx * cdx + cdz * cdz > CAST_CAMERA_REACH * CAST_CAMERA_REACH) return;
    if (!this.nearestLitFireInto(tile.x, tile.z, tile, this.nearestScratch)) return;
    const n = this.nearestScratch;
    const dx = tile.x - n.worldX;
    const dz = tile.z - n.worldY;
    if (dx * dx + dz * dz > radius * radius) return;
    if (!castTransformInto(
      this.fireCastScratch, tile.x, tile.z, 1, n.worldX, n.worldY, n.level, radius, alpha, heightScale,
    )) return;
    const p = this.fireCastScratch;

    // An axe blow mid-shudder shakes the silhouette with the tile (2e) — same damped
    // sine as updateTileShakes. (String key only while a shake is live; the map is
    // almost always empty, so the hot path never composes one.)
    let rotY = p.rotY;
    if (this.activeTileShakes.size > 0) {
      const sh = this.activeTileShakes.get(`${tile.x},${tile.z}`);
      if (sh && sh.t < 1) {
        rotY += Math.sin(sh.t * Math.PI * 2 * TILE_SHAKE_CYCLES) * TILE_SHAKE_LEAN * (1 - sh.t);
      }
    }

    // The silhouette stops at the water's edge (2b) — but the clamp may never REMOVE a
    // shadow, only shorten one.
    //
    // Two wrong versions preceded this. Clamping to the bank could cut a cast to 0.35
    // tiles: a smudge under the trunk that reads as "this tree has no shadow". Dropping
    // the cast instead was worse — a whole row of trees along the bank, lit by the fire,
    // with no fire shadow at all (reported). So a clamp that would leave less than
    // MIN_CAST_LEN is abandoned and the full silhouette is drawn: a shadow overhanging
    // the channel is the lesser wrong, which is the same call the actor path makes and
    // for the same reason. Trees far enough back still stop cleanly at the bank, which is
    // the case the clamp was built for.
    let length = p.length;
    let a = p.alpha;
    if (this.params.castWaterClamp > 0) {
      const clamped = this.clampCastAtSunken(tile.x, tile.z, rotY, length);
      if (clamped < length && clamped >= MIN_CAST_LEN) {
        length = clamped;
        a *= 0.6;
      }
    }

    this.solidCastField.add(
      tile.x, tile.z, frameUvWindow('forest-tileset', tile.frame),
      CAST_WIDTH_FACTOR, length, rotY, a,
      frameFootPad('forest-tileset', tile.frame),
    );

    // The statics' fire→moon handoff (2d): inside a lit pool the tile's baked moon
    // silhouette lets go as the fire cast takes over — an actor's handoffCast, applied to
    // the one instance — so a tree and an NPC on the same pool edge behave the same,
    // instead of the tree wearing fire AND moon shadows at once.
    //
    // The fire's darkness DISPLACES the moon's; it never merely scales it down. The first
    // version dimmed by the ratio a/moonAlpha, which let a faint fire cast (0.07) delete a
    // third of a 0.22 moon shadow and pay back only 0.07 — pointing somewhere else. Trees
    // at a pool's edge came out with two faint smudges instead of one readable shadow, and
    // the ones the water clamp had already shortened looked like they had NO shadow (user
    // report, and exactly what the numbers showed). Subtracting instead keeps the invariant
    // the actors' handoff gets from its `max(fire, moon)`: a caster's total shadow presence
    // never drops below what moonlight alone would have given it.
    if (this.params.moonHandoff > 0 && moonAlpha > 0.02 && tile.moonSlot !== undefined) {
      const left = Math.max(0, moonAlpha - a);
      if (left < moonAlpha - 0.005) {
        this.moonCastField.setInstanceAlpha(tile.moonSlot, left);
        this.moonDimmed.push(tile);
      }
    }
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
    // A DIRECAO DO BAQUE (ver shake). Sem direcao, `lean` e zero e `rattle` vale 1 — o tremor sai
    // identico ao de sempre, sem uma conta a mais no caminho quente.
    //
    // O eixo `y` do tile vira o eixo VERTICAL da tela e nao a profundidade, de proposito: o que se
    // quer aqui e a tela pular na direcao do golpe, e mexer na profundidade so mudaria a escala do
    // mundo por um instante (um zoom, nao um baque).
    const dirX = this.shakeDirX;
    const dirY = this.shakeDirY;
    const aimed = dirX !== 0 || dirY !== 0;
    const rattle = aimed ? SHAKE_RATTLE : 1;
    const lean = aimed ? SHAKE_LEAN : 0;
    const ox = swayX + (k > 0 ? k * (dirX * lean + (Math.random() * 2 - 1) * rattle) : 0);
    const oy = swayY + (k > 0 ? k * (dirY * lean + (Math.random() * 2 - 1) * rattle) : 0);
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
  /**
   * O baque de impacto. `dirX/dirY` sao OPCIONAIS e vem em espaco de TILE (o mesmo par que o golpe
   * usa): com eles a camera ganha um empurrao naquela direcao por cima do chacoalho; sem eles o
   * tremor e exatamente o de antes — aleatorio nos dois eixos, sem uma unica conta a mais.
   *
   * A parte direcional e uma INCLINACAO e nao um solavanco: o chacoalho continua sendo a maior
   * parte do movimento (ver SHAKE_LEAN/SHAKE_RATTLE). Um golpe vindo do oeste e um vindo do leste
   * desenhavam o mesmo tremor, e a direcao e a unica coisa que um impacto tem a dizer sobre si
   * alem de "aconteceu" — mas exagerar isso vira enjoo de camera, que e o defeito oposto e pior.
   */
  public shake(durationMs: number, amplitudeTiles: number, dirX = 0, dirY = 0): void {
    // A landed hit during a fading shake must not cut it short — keep the stronger kick.
    if (this.shakeMs > 0 && amplitudeTiles < this.shakeAmp * (this.shakeMs / this.shakeDurMs)) return;
    this.shakeMs = durationMs;
    this.shakeDurMs = Math.max(1, durationMs);
    this.shakeAmp = amplitudeTiles;
    const len = Math.hypot(dirX, dirY);
    this.shakeDirX = len > 1e-4 ? dirX / len : 0;
    this.shakeDirY = len > 1e-4 ? dirY / len : 0;
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

  // ── a hora do dia ────────────────────────────────────────────────────────────

  /**
   * Vira a chave do céu: a noite autorada ⇄ o dia de sol (`skyPreset.DAY_SKY`).
   *
   * Ela só escreve em `params` — nenhuma luz nasce, nenhuma morre, nenhum material é recompilado.
   * O resto do frame já sabe reagir a knob que se mexe: o campo instanciado de sombra dos sólidos
   * se re-assa sozinho quando alpha/comprimento mudam (`updateCastShadows`), e fundo, fog, cor da
   * ambiente e cor do sol entram por `applyColor` no topo do `render`. É por isso que a troca
   * custa uma re-assadura de sombras e nada mais.
   */
  private applySky(day: boolean): void {
    if (Object.keys(this.nightSky).length === 0) {
      // A NOITE, capturada dos valores de fábrica na primeira passagem — antes de qualquer
      // escrita. Ver o campo: é isto que impede a noite de existir duas vezes.
      const factory = this.nightSky as Record<string, number | string>;
      const current = this.params as unknown as Record<string, number | string>;
      for (const key of Object.keys(DAY_SKY)) factory[key] = current[key];
    }
    Object.assign(this.params, day ? DAY_SKY : this.nightSky);
    this.params.daylight = day ? 1 : 0;
    this.appliedDaylight = day;
  }

  /**
   * Duas portas para a mesma verdade: o menu de pausa (que grava) e `hd3d.daylight` (o console).
   * Quem MEXEU desde o último frame é quem quis dizer alguma coisa — e o que ficou decidido volta
   * para as duas, para o rótulo do menu e o knob nunca contarem histórias diferentes.
   */
  private syncDaylight(): void {
    const stored = getDaylight() >= 0.5;
    const want = stored !== this.appliedDaylight ? stored : this.params.daylight >= 0.5;
    if (want === this.appliedDaylight) return;
    this.applySky(want);
    setDaylight(want ? 1 : 0);
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

  /**
   * O INVERSO do `projectTile`: pixel na tela → o tile do CHAO que esta debaixo dele.
   *
   * SEM CHAMADOR HOJE — nasceu para a mira do revolver, que saiu do jogo. Fica de pe porque a
   * conta e a armadilha, e nao a peca: qualquer coisa que um dia traduza pixel em tile (mira,
   * clique-para-andar, um cursor de editor) vai cair nela. O heroi fica no centro da tela, entao
   * a tentacao e dizer "a direcao e (mouse - centro)" — mas a camera olha o mundo de cima e
   * INCLINADA, e num plano em perspectiva um passo pra cima na tela vale muito mais mundo do que
   * um passo pro lado. Resolver por delta de tela sai sempre "achatado", e o erro cresce com a
   * distancia do centro. Aqui a leitura e feita onde ela acontece: no plano do chao, pelo raio
   * que sai da camera e passa pelo pixel.
   *
   * `elevationTiles` e a altura do plano interceptado: mirar no plano do PEITO (e nao no chao) e
   * o que faz o cursor cair em cima do corpo que o jogador ve, e nao nos pes dele.
   */
  public screenToGround(
    pixelX: number,
    pixelY: number,
    elevationTiles = 0,
  ): { worldX: number; worldY: number } {
    const ndcX = (pixelX / Math.max(1, window.innerWidth)) * 2 - 1;
    const ndcY = -((pixelY / Math.max(1, window.innerHeight)) * 2 - 1);
    const dir = this.projectScratch.set(ndcX, ndcY, 0.5).unproject(this.camera).sub(this.camera.position);
    // Camera olhando pra baixo: `dir.y` e sempre negativo na pratica. O guarda e pro caso
    // degenerado (raio paralelo ao plano), em que nao ha intersecao nenhuma — devolver o alvo da
    // camera e melhor que devolver Infinity e mandar uma bala pro infinito.
    if (Math.abs(dir.y) < 1e-6) return { worldX: this.camTarget.x, worldY: this.camTarget.z };
    const t = (elevationTiles - this.camera.position.y) / dir.y;
    return {
      worldX: this.camera.position.x + dir.x * t,
      worldY: this.camera.position.z + dir.z * t,
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
    this.chunkShroud.update(dtMs); // avança (e encerra) as dissoluções de compra de chunk

    // Live knobs (window.hd3d). A hora do dia vem PRIMEIRO: ela reescreve os outros.
    this.syncDaylight();
    texelAaUniform.value = Math.min(1, Math.max(0, this.params.texelAa));
    lightStepsUniform.value = Math.max(0, this.params.lightSteps);
    lightResUniform.value = Math.max(0, this.params.lightRes);
    lightWobbleUniform.value = Math.max(0, this.params.lightWobble);
    lightCapUniform.value = this.params.lightCap;
    seaFlowUniform.value = Math.max(0, this.params.seaFlow);
    // These five are CSS STRINGS, live-tunable through window.hd3d — and Color.set(string) parses
    // the CSS every time it is called. Re-reading them each frame meant five regex parses a frame
    // to arrive back at the colour that was already there. Only re-parse when the knob moves.
    this.applyColor('fireRampCore', fireRampCoreUniform.value, this.params.fireRampCore);
    this.applyColor('fireRampMid', fireRampMidUniform.value, this.params.fireRampMid);
    this.applyColor('fireRampRim', fireRampRimUniform.value, this.params.fireRampRim);
    fireGlowResUniform.value = Math.max(0, this.params.fireGlowRes);
    flowTimeUniform.value = this.elapsed;
    // A névoa do fora do mundo é knob vivo (hd3d.voidMist): a malha já está assada, e o que
    // muda é só a profundidade da rampa dentro do shader.
    if (this.terrainMats) {
      (this.terrainMats.voidMist.userData.mist as MistUniforms).depth.value = Math.max(0, this.params.voidMist);
    }
    windUniform.value = Math.max(0, this.params.wind);
    // A mortalha do explorador tem duas paletas, e a escolha é a mesma do céu: de noite ela é mais
    // funda que o escuro, de dia é um banco de neblina batido de sol (ver ChunkShroud3D).
    shroudDayUniform.value = this.appliedDaylight ? 1 : 0;
    this.ambientLight.intensity = this.params.ambient;
    this.applyColor('ambient', this.ambientLight.color, this.params.ambientColor);
    // A mesma DirectionalLight é a lua e o SOL — de roupa trocada, nunca substituída: criar uma
    // luz em runtime recompilaria todo shader do mundo (ver FIRE_LIGHT_SLOTS).
    this.moonLight.intensity = this.params.moon;
    this.applyColor('moon', this.moonLight.color, this.params.moonColor);
    this.applyColor('glint', waterGlintUniform.value, this.params.glintColor);
    if (this.scene.background instanceof THREE.Color) {
      this.applyColor('sky', this.scene.background, this.params.skyColor);
    }
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.applyColor('fog', this.scene.fog.color, this.params.skyColor);
      this.scene.fog.density = this.params.fogDensity;
    }
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
    // A NITIDEZ do menu de pausa entra por aqui, como a hora do dia: quem MEXEU desde o último
    // frame manda. Assim o botão pega no instante em que o jogo volta a andar, e `hd3d.pixelScale`
    // continua funcionando pelo console (ele vence enquanto o menu não é tocado).
    const wanted = getPixelScale();
    if (wanted !== this.appliedPixelScale && wanted !== Math.round(this.params.pixelScale)) {
      this.params.pixelScale = wanted;
    }
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
    this.updateHeroSight(); // a vista dele: projetada com a câmera JÁ desta hora (ver o doc)
    profiler.end('torch');
    profiler.begin('castShadows');
    const maskOn = this.params.shadowMask > 0;
    if (maskOn !== this.appliedMaskMode) this.applyShadowMaskMode(maskOn);
    this.updateCastShadows();
    if (maskOn) this.renderShadowMask();
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
        this.fireflies.pos[i * 3 + 1] = -10; // fora do chão até achar mato (ver rehomeFirefly)
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

    this.updateFireflies(dt, fire, cx, cz);

    // Mist: slow cool wisps hugging the ground; thins right at the fire (heat burns
    // it off) so the lit clearing stays clear while the dark stays veiled.
    //
    // De DIA a mesma névoa é POEIRA: motes dourados boiando no ar batido de sol. É o mesmo campo
    // de partículas, com a mesma deriva e a mesma abertura junto do fogo — só a cor troca, porque
    // o que se vê boiando ao meio-dia não é vapor frio, é pó pegando luz. (Um segundo campo só
    // para isto seriam 48 Points a mais desenhados sempre, para metade deles estar sempre invisível.)
    const mistAmt = Math.max(0, this.params.mist);
    const dayMix = this.appliedDaylight ? 1 : 0;
    const mistR = 0.32 + (0.66 - 0.32) * dayMix;
    const mistG = 0.4 + (0.56 - 0.4) * dayMix;
    const mistB = 0.6 + (0.34 - 0.6) * dayMix;
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
      this.mist.col[i * 3] = mistR * a;
      this.mist.col[i * 3 + 1] = mistG * a;
      this.mist.col[i * 3 + 2] = mistB * a;
    }
    this.mist.mark();
  }

  /**
   * O ENXAME. Ele mudou de dono: antes o vaga-lume só acendia dentro do halo de uma fogueira
   * ACESA, e no construtor de mundo (onde toda fogueira de carta nasce apagada) isso queria dizer
   * que ele não existia — a única luz do mundo era o acampamento. Agora quem o chama é o MATO:
   * cada bicho escolhe uma moita real da janela assada (`greenTiles`) e orbita ali. É uma regra
   * que o mundo ensina sem legenda — onde pisca, é verde — e é o que faz plantar flor numa carta
   * povoá-la de vaga-lume sem tocar em código.
   *
   * A fogueira não sumiu da conta: perto dela o enxame ADENSA (o brilho sobe), que é o resquício
   * da recompensa antiga sem ela ser a condição de existir.
   *
   * Nada aqui cria luz THREE: são Points aditivos. A lei do jogo é que a CONTAGEM de luzes está
   * selada — um vaga-lume que iluminasse o chão recompilaria o mundo inteiro (~550ms) na primeira
   * vez que acendesse.
   */
  private updateFireflies(dt: number, fire: FireEntry | null, cx: number, cz: number): void {
    const amount = Math.max(0, this.params.fireflies);
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      const p = this.fireflyState[i];
      const px = this.fireflies.pos[i * 3];
      const pz = this.fireflies.pos[i * 3 + 2];

      // Longe demais do quadro (ou ainda sem casa): procura outra moita. O relógio existe para
      // que um mundo de pedra — onde a busca sempre falha — não pague a varredura todo quadro.
      const strayed = Math.abs(p.hx - cx) > FIREFLY_BOX || Math.abs(p.hz - cz) > FIREFLY_BOX;
      p.settle -= dt;
      if ((!p.homed || strayed) && p.settle <= 0) {
        p.settle = 0.45;
        this.rehomeFirefly(i, cx, cz);
      }
      if (!p.homed) {
        this.fireflies.pos[i * 3 + 1] = -10; // sem mato por perto não há vaga-lume: some inteiro
        this.fireflies.col[i * 3] = 0;
        this.fireflies.col[i * 3 + 1] = 0;
        this.fireflies.col[i * 3 + 2] = 0;
        continue;
      }

      // O voo: uma arrancada curta de vez em quando, atrito no resto do tempo e uma mola fraca
      // puxando de volta para a moita. Um seno puro (o que havia antes) lê como partícula; o que
      // lê como bicho é a mudança BRUSCA de direção entre trechos de deriva.
      p.dart -= dt;
      if (p.dart <= 0) {
        p.dart = 0.5 + Math.random() * 1.9;
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.5 + Math.random() * 1.3;
        p.vx += Math.cos(angle) * speed;
        p.vz += Math.sin(angle) * speed;
      }
      const drag = Math.exp(-2.6 * dt);
      p.vx = p.vx * drag + (p.hx - px) * 1.5 * dt;
      p.vz = p.vz * drag + (p.hz - pz) * 1.5 * dt;
      let x = px + p.vx * dt;
      let z = pz + p.vz * dt;
      // A coleira: nunca mais que FIREFLY_ROAM da moita, ou o enxame se dissolve na tela.
      const dx = x - p.hx; const dz = z - p.hz;
      const dist = Math.hypot(dx, dz);
      if (dist > FIREFLY_ROAM) {
        x = p.hx + (dx / dist) * FIREFLY_ROAM;
        z = p.hz + (dz / dist) * FIREFLY_ROAM;
        p.vx *= -0.35; p.vz *= -0.35;
      }
      this.fireflies.pos[i * 3] = x;
      this.fireflies.pos[i * 3 + 2] = z;
      // A altura acompanha a velocidade: quem corre, sobe. Sem isso o bicho voa numa mesa de
      // vidro, e é a subida na arrancada que dá volume ao enxame.
      const climb = Math.min(1, Math.hypot(p.vx, p.vz) * 0.55);
      const s = this.fireflySeed[i];
      this.fireflies.pos[i * 3 + 1] = 0.3 + 0.35 * climb
        + 0.34 * (0.5 + 0.5 * Math.sin(this.elapsed * 0.7 + s * 1.7));

      // O pisca: aceso curto, apagado longo — a assinatura do bicho. `blink` corre no ritmo dele,
      // e o expoente é o que separa "acende e apaga" de "pulsa".
      p.blink += dt * p.rate;
      const pulse = Math.max(0, Math.sin(p.blink));
      const near = fire ? Math.max(0, 1 - Math.hypot(x - fire.worldX, z - fire.worldY) / 8) : 0;
      // O expoente 3 apagava o enxame: com ele o bicho passa ~85% do ciclo escuro, e com 44
      // deles espalhados numa caixa maior que a tela sobravam dois pontos por quadro. Quadrado
      // (mais um resto de brasa, que é o corpo dele visto de perto) mantém o pisca e devolve o
      // enxame — foi medido em foto, não no papel.
      const a = amount * (0.5 + 0.5 * near) * (0.12 + 0.88 * pulse * pulse);
      this.fireflies.col[i * 3] = 0.75 * a;
      this.fireflies.col[i * 3 + 1] = 1.0 * a;
      this.fireflies.col[i * 3 + 2] = 0.3 * a;
    }
    this.fireflies.mark();
  }

  /**
   * Sorteia uma moita dentro do quadro para este vaga-lume. Amostragem por REJEIÇÃO sobre o índice
   * inteiro da janela (que tem milhares de tiles) em vez de um índice espacial: são 18 tentativas
   * no pior caso, para no máximo 34 bichos, e só quando um deles perdeu a casa. Falhar é uma
   * resposta legítima — quer dizer "não há verde aqui", e o bicho fica invisível.
   */
  private rehomeFirefly(index: number, cx: number, cz: number): void {
    const p = this.fireflyState[index];
    const count = this.greenTiles.length / 2;
    p.homed = false;
    if (count === 0) return;
    for (let attempt = 0; attempt < 18; attempt++) {
      const t = Math.floor(Math.random() * count) * 2;
      const gx = this.greenTiles[t];
      const gz = this.greenTiles[t + 1];
      if (Math.abs(gx - cx) > FIREFLY_BOX || Math.abs(gz - cz) > FIREFLY_BOX) continue;
      p.hx = gx + (Math.random() - 0.5) * 0.6;
      p.hz = gz + (Math.random() - 0.5) * 0.6;
      p.vx = 0; p.vz = 0;
      p.homed = true;
      this.fireflies.pos[index * 3] = p.hx;
      this.fireflies.pos[index * 3 + 2] = p.hz;
      return;
    }
  }

  private readonly handleResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.applyPixelScale();
  };

  public dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    // `material` pode ser ARRAY (a alvenaria de cubo das dungeons agrupa teto/lados): um
    // `material?.dispose()` direto estoura "dispose is not a function" no meio do teardown e
    // deixa a cena que vem depois (o editor acordando do ESC) sem o wake. Ninguém viu por anos
    // porque só o /lab de dungeon percorre esse caminho com um mesh multi-material vivo.
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
    this.maskScene.traverse((obj) => {
      const withGeo = obj as THREE.Object3D & {
        isMesh?: boolean; geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[];
      };
      if (withGeo.isMesh) {
        withGeo.geometry?.dispose();
        disposeMaterial(withGeo.material);
      }
    });
    this.maskTarget.dispose();
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
    uLift: { value: 1 },
    // A VISTA DO HERÓI (ver setHeroSight): a curva local, onde ela cai na tela, e os dois
    // semi-eixos da elipse que um disco de chão vira aos 48° da câmera. Escritos por
    // updateHeroSight; em 0 o quadro é literalmente o de antes.
    uSight: { value: 0 },
    uSightAt: { value: new THREE.Vector2(0.5, 0.5) },
    uSightR: { value: new THREE.Vector2(0.2, 0.2) },
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
    uniform float uLift;
    uniform float uSight;
    uniform vec2 uSightAt;
    uniform vec2 uSightR;
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
      // ── A CURVA DE TELA (uLift) — ver o doc de params.lift ───────────────────
      // Este jogo nao tem tone mapping (o mundo e desenhado num render target, e o three so monta
      // o ACES quando o alvo e a TELA), entao o linear vai cru para o canvas e nao ha ombro
      // nenhum segurando o alto: subir luz estoura o branco antes de clarear a sombra. O pow e o
      // ombro que falta — monotono, leva 1 em 1, abre os graves. O DIA vive dela.
      //
      // Ela entra DEPOIS do split-tone de proposito: o grade classifica sombra x luz por luma, e
      // levantar antes faria o quadro inteiro passar por "luz" — o dia perderia justamente a
      // sombra azul que o faz parecer dia. luma sobe junto, senao a saturacao abaixo giraria em
      // torno de um cinza que nao existe mais.
      //
      // O if e o que garante que a NOITE nao muda um bit: em uLift = 1 nada disto roda.
      if (uLift < 0.999) {
        col = pow(max(col, vec3(0.0)), vec3(uLift));
        luma = pow(max(luma, 0.0), uLift);
      }
      // ── A VISTA DO HEROI (uSight) — ver setHeroSight ─────────────────────────
      // A MESMA curva de cima, so que LOCAL: um pow centrado nos pes dele e pendendo para onde ele
      // olha. Ela abre os graves em volta e deixa o 1 onde esta, entao dentro da poca de uma
      // fogueira ela quase nao soma — a vista mostra o tile em que ele pisa, o fogo e que abre a
      // regiao. E ela e LISA de proposito: todo desenho de luz deste jogo e escadinha de pixel art
      // (o disco da fogueira, uLightSteps), mas isto nao e luz caindo no chao, e o olho.
      //
      // O nucleo e chato ate 35% do raio e so entao cai: um pico no centro seguiria o heroi como
      // uma mancha de lente. E a saturacao sobe AMARRADA a ela, nunca por um knob proprio: pow
      // comprime razao entre canais, e um quadro local mais claro e menos colorido que a vizinhanca
      // le como neblina (a licao inteira do skyPreset.ts).
      float sight = 0.0;
      if (uSight > 0.0) {
        vec2 sd = (vUv - uSightAt) / max(uSightR, vec2(0.0001));
        sight = uSight * (1.0 - smoothstep(0.35, 1.0, length(sd)));
        float sexp = 1.0 - sight;
        col = pow(max(col, vec3(0.0)), vec3(sexp));
        luma = pow(max(luma, 0.0), sexp);
      }
      col = mix(vec3(luma), col, uSaturation + sight * 0.35); // saturation around luma
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

/**
 * Um vaga-lume. `hx/hz` é a MOITA que ele escolheu (ele orbita ali, não a caixa da câmera), e o
 * resto é o voo: velocidade própria, um relógio até a próxima arrancada, e a fase/ritmo do
 * pisca. `settle` é o tempo até tentar achar mato de novo quando não há nenhum por perto.
 */
interface FireflyParticle {
  hx: number; hz: number;
  vx: number; vz: number;
  dart: number;
  blink: number; rate: number;
  settle: number;
  homed: boolean;
}

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

// O BLOCO DE GELO (o congelamento — ver FreezeManager): um cristal facetado, desenhado BRANCO
// como todo FX desta casa para o tint do billboard decidir a cor. Low-res + NEAREST para quebrar
// em degraus de pixel como o resto da arte. O corpo é translúcido de propósito — o que congela
// continua VISÍVEL dentro do bloco (a informação é "aquilo ali, travado", nunca "um cubo novo") —
// e a faceta clara fica no alto-esquerdo, de onde a luz desta arte sempre vem.
const ICE_TEX_RES = 28;
const makeIceTexture = (): THREE.CanvasTexture => {
  const c = document.createElement('canvas');
  c.width = c.height = ICE_TEX_RES;
  const ctx = c.getContext('2d')!;
  const s = ICE_TEX_RES;
  const m = s / 2;

  // O corpo do cristal: um hexágono irregular, mais estreito no topo (gelo empilha pra cima).
  const body: Array<[number, number]> = [
    [m, 1.5], [s - 3.5, m * 0.72], [s - 2.5, s - m * 0.5], [m, s - 1.5], [2.5, s - m * 0.5], [3.5, m * 0.72],
  ];
  ctx.beginPath();
  ctx.moveTo(body[0][0], body[0][1]);
  for (let i = 1; i < body.length; i++) ctx.lineTo(body[i][0], body[i][1]);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.44)';
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.stroke();

  // A faceta de luz do alto-esquerdo: um quarto do corpo, mais denso.
  ctx.beginPath();
  ctx.moveTo(m, 2.5);
  ctx.lineTo(4.5, m * 0.78);
  ctx.lineTo(m * 0.7, m);
  ctx.lineTo(m, m * 0.62);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.34)';
  ctx.fill();

  // Duas arestas internas: o que separa "cristal" de "bolha".
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.moveTo(m, 2.5);
  ctx.lineTo(m * 0.72, s - m * 0.55);
  ctx.moveTo(m, 2.5);
  ctx.lineTo(s - m * 0.6, s - m * 0.7);
  ctx.stroke();

  // Três brilhos de um pixel, o glint que a arte 16×16 desta casa usa para dizer "liso e frio".
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.fillRect(Math.round(m * 0.62), Math.round(m * 0.62), 1, 1);
  ctx.fillRect(Math.round(s - m * 0.8), Math.round(m * 0.95), 1, 1);
  ctx.fillRect(Math.round(m * 0.9), Math.round(s - m * 0.75), 1, 1);

  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
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
const makeFireGlowMaterial = (opts: {
  /** A rampa de bandas desta poça. Omitida = a do FOGO (o padrão de sempre). */
  ramp?: { core: THREE.IUniform<THREE.Color>; mid: THREE.IUniform<THREE.Color>; rim: THREE.IUniform<THREE.Color> };
  /** O ruído que amassa os anéis. Omitido = o do fogo; a vista do herói passa o zero. */
  wobble?: THREE.IUniform;
} = {}): THREE.MeshBasicMaterial => {
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
    shader.uniforms.uLightWobble = opts.wobble ?? lightWobbleUniform;
    shader.uniforms.uFlowTime = flowTimeUniform;
    shader.uniforms.uRampCore = opts.ramp?.core ?? fireRampCoreUniform;
    shader.uniforms.uRampMid = opts.ramp?.mid ?? fireRampMidUniform;
    shader.uniforms.uRampRim = opts.ramp?.rim ?? fireRampRimUniform;
    // The mask shades the glow POOL too (hd3d.shadowMask): with the decal silhouettes
    // gone from the scene, the additive haze must dim itself where a cast falls — same
    // data, same place, instead of a black quad drawn over it.
    shader.uniforms.uShadowMask = shadowMaskUniform;
    shader.uniforms.uMaskRect = shadowMaskRectUniform;
    shader.uniforms.uMaskOn = shadowMaskOnUniform;
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
         ${SHADOW_MASK_GLSL}
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
         diffuseColor.a *= glowA * (1.0 - zhShadowMask(vGlowPos, vec2(0.0)));`,
      );
  };
  return mat;
};

/**
 * A NÉVOA NEGRA que cobre a floresta de fora do mapa.
 *
 * O fora do mundo deixou de ser mar e virou floresta (ver `WorldData.buildVoidChunk`), e uma
 * floresta iluminada como qualquer outra não diz "aqui acaba o mundo" — diz "tem mais mapa ali".
 * Quem diz é a névoa: ela nasce em ZERO na fronteira autorada e fecha em preto alguns tiles
 * adiante, então a mata desaparece dentro dela em vez de terminar numa régua.
 *
 * Três decisões que a fazem ler como névoa e não como uma tampa preta:
 *
 *   · **A alfa vem da distância ao RETÂNGULO do mundo**, medida no fragmento (`uMistRect`), e não
 *     de uma máscara por vértice. É a fronteira do mundo, que é uma caixa — e uma conta de caixa
 *     em quatro linhas dá a rampa exata em qualquer formato de mapa, sem re-assar nada.
 *   · **A borda é ROÍDA por ruído** no mesmo campo de valor que o fogo usa (`fireWobble`), com o
 *     tempo escorrendo devagar. Sem isso a rampa é um degradê de photoshop, e degradê nenhum é
 *     névoa.
 *   · **Ela é quantizada no grid da ARTE** (`uLightRes`), como todo desenho de luz deste jogo. Uma
 *     rampa lisa num mundo de pixel art é o único objeto da tela com resolução infinita.
 *
 * Preto com mistura normal, e não `AdditiveBlending`: aditivo só clareia — o preto aditivo é
 * literalmente nada. Aqui a névoa TAPA, então ela é alfa por cima.
 */
type MistUniforms = { rect: THREE.IUniform<THREE.Vector4>; depth: THREE.IUniform<number> };

const makeVoidMistMaterial = (): THREE.MeshBasicMaterial => {
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    depthWrite: false,
    fog: false, // ela JÁ é a distância; um fog por cima a lavaria na cor do céu
    opacity: 1,
  });
  const mist: MistUniforms = {
    rect: { value: new THREE.Vector4(0, 0, 0, 0) },
    depth: { value: 6 },
  };
  mat.userData.mist = mist;
  mat.customProgramCacheKey = () => 'voidMist';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMistRect = mist.rect;
    shader.uniforms.uMistDepth = mist.depth;
    shader.uniforms.uLightRes = fireGlowResUniform;
    shader.uniforms.uFlowTime = flowTimeUniform;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec2 vMistPos;\nvoid main() {')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vMistPos = (modelMatrix * vec4(transformed, 1.0)).xz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform vec4 uMistRect;
         uniform float uMistDepth;
         uniform float uLightRes;
         uniform float uFlowTime;
         ${FIRE_WOBBLE_GLSL}
         varying vec2 vMistPos;
         void main() {`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         // Snap no grid da arte: a névoa engrossa em blocos de pixel, como a poça da fogueira.
         vec2 mistTexel = floor(vMistPos * uLightRes);
         vec2 mistPos = uLightRes > 0.0 ? (mistTexel + 0.5) / uLightRes : vMistPos;
         // Distância ao retângulo do mundo: 0 lá dentro, crescendo para fora (a conta de caixa).
         vec2 outside = max(uMistRect.xy - mistPos, mistPos - uMistRect.zw);
         float d = length(max(outside, vec2(0.0)));
         // A frente da névoa não é reta: o mesmo ruído das chamas, andando devagar, come a borda.
         d += fireWobble(mistPos * 0.35, uFlowTime * 0.25) * uMistDepth * 0.5;
         diffuseColor.a *= smoothstep(0.0, max(0.5, uMistDepth), d);`,
      );
  };
  return mat;
};

/**
 * A CORTINA da névoa: um quad EM PÉ por tile, no mesmo plano em que as árvores são desenhadas.
 *
 * A primeira versão era uma TAMPA — quads deitados acima da copa — e a geometria a derrubou: com
 * a câmera a 48°, um plano horizontal sobre o tile (x,z) projeta ACIMA do lugar onde a árvore
 * daquele mesmo tile desenha. Ou seja, a tampa velava o tile de TRÁS e deixava a árvore da frente
 * exposta; o que aparecia na tela era um degradê deslocado, nunca a mata sumindo dentro da névoa.
 * Em pé, no mesmo z e um pouco mais alta que a copa, ela cobre exatamente o que está atrás dela.
 *
 * Sem uv, sem atlas e sem normal: a cortina é uma cor só, e quem a desenha é o shader a partir da
 * posição de mundo (ver makeVoidMistMaterial).
 */
const buildMistCurtainGeometry = (
  tiles: ReadonlyArray<{ x: number; z: number }>, height: number,
): THREE.BufferGeometry => {
  const pos: number[] = [];
  const idx: number[] = [];
  tiles.forEach(({ x, z }, i) => {
    // MEIO TILE À FRENTE (+z é a câmera). No próprio z a cortina fica na MESMA profundidade da
    // árvore daquele tile, e o teste de profundidade padrão (`less`) reprova o empate: a névoa
    // era descartada exatamente em cima do que ela existe para velar. Na borda da frente do
    // tile ela fica meio tile à frente da sua árvore e meio atrás da próxima — sem empate nenhum.
    const zf = z + 0.5;
    pos.push(x - 0.5, height, zf, x + 0.5, height, zf, x + 0.5, 0, zf, x - 0.5, 0, zf);
    const b = i * 4;
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
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
const tileAoCorners = (x: number, z: number, solids?: ReadonlySet<number>): number[] =>
  AO_CORNERS.map(([dx, dz]) => {
    let occluders = 0;
    if (solids) {
      if (solids.has(tileKey(x + dx, z))) occluders++;
      if (solids.has(tileKey(x, z + dz))) occluders++;
      if (solids.has(tileKey(x + dx, z + dz))) occluders++;
    }
    return 1 - AO_MAX * (occluders / 3);
  });

/**
 * A COSTA, por canto — o degrau que a arrebentação do mar sobe e desce (SEA_SHALLOW_GLSL).
 *
 * Mesma leitura de três vizinhos que a oclusão-ambiente do chão faz, e de propósito: as duas
 * perguntam "o que encosta neste canto?", e se discordassem a espuma nasceria meio tile fora da
 * praia que a sombra desenha. 0 = mar aberto, 1 = um canto cercado de terra (o fundo de uma
 * enseada); a beira de uma costa reta chega a 2/3, que é a faixa em que os limiares do shader
 * estão calibrados.
 */
const tileShoreCorners = (x: number, z: number, wet: ReadonlySet<number>): number[] =>
  AO_CORNERS.map(([dx, dz]) => {
    let land = 0;
    if (!wet.has(tileKey(x + dx, z))) land++;
    if (!wet.has(tileKey(x, z + dz))) land++;
    if (!wet.has(tileKey(x + dx, z + dz))) land++;
    return land / 3;
  });

const buildFlatTileGeometry = (
  tiles: Array<{ x: number; z: number; frame: number }>,
  y: number,
  solids?: ReadonlySet<number>,
  /** Per-corner shore ramp, emitted as the `aShore` attribute the sea's material reads. */
  shore?: (x: number, z: number) => number[],
  /**
   * Emite o atributo `aWind` (ver WIND_WAVE_GLSL). Só a malha de DECORAÇÃO passa isto: o chão, o
   * leito e o mar não têm vegetação nenhuma, e um atributo a mais em 11 mil quads de oceano seria
   * meio megabyte para multiplicar por zero.
   */
  windMask?: (frame: number) => number,
): THREE.BufferGeometry => {
  const pos: number[] = [];
  const uv: number[] = [];
  const bounds: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const shr: number[] = [];
  const wind: number[] = [];
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
    if (shore) shr.push(...shore(x, z));
    if (windMask) {
      const stir = windMask(frame);
      for (let k = 0; k < 4; k++) wind.push(stir, x, z);
    }
    const b = i * 4;
    idx.push(b, b + 3, b + 2, b, b + 2, b + 1);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aUvBounds', new THREE.Float32BufferAttribute(bounds, 4));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (shore) geo.setAttribute('aShore', new THREE.Float32BufferAttribute(shr, 1));
  if (windMask) geo.setAttribute('aWind', new THREE.Float32BufferAttribute(wind, 3));
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

/**
 * OS BLOCOS MACICOS, em CUBO — a alvenaria da dungeon e a MONTANHA do mundo aberto.
 *
 * Todo o resto que fica em pe aqui e um quad vertical: uma arvore, uma lapide. Isso funciona
 * porque sao objetos com silhueta, vistos de frente por uma camera que nunca gira — um pinheiro
 * nao tem "lado". Uma parede de masmorra tem: ela e um bloco macico, e o corredor que ela forma so
 * le como corredor se a espessura aparecer. Com quad, uma sala de dungeon vira um desenho de sala;
 * com cubo, vira uma sala. A montanha entrou aqui pela mesma frase: um penhasco desenhado como
 * carta em pe e o adesivo de uma montanha — o mapa fica com paredes de papel, e o topo, que e a
 * metade dela que a camera de cima realmente ve, nao existe.
 *
 * ── Faces escondidas nao entram ─────────────────────────────────────────────────────────────
 * Um cubo cheio custaria 20 vertices por tile, e a dungeon 9 tem ~8 mil tiles de parede: 160 mil
 * vertices para uma masmorra em que a esmagadora maioria dos blocos esta cercada de blocos e nao
 * mostra lado nenhum. Entao cada face lateral so e emitida quando o vizinho daquele lado NAO e
 * parede — a mesma poda que qualquer engine de voxel faz, e aqui ela derruba a conta para perto
 * do que o quad ja custava. Medido na montanha do overworld: 6.147 tiles dao 9.321 faces, ou seja
 * 1,52x os triangulos que os quads em pe custavam — e em troca a malha ficou opaca (o quad em pe
 * era alphaTest, que descarta fragmento e estraga o early-Z).
 *
 * A face NORTE nunca e emitida: a camera esta em (0, camHeight, camBack) olhando o alvo e o mundo
 * nao tem yaw, entao o lado -z de um bloco e sempre o lado de tras. Emiti-la seria pagar geometria
 * para nunca ser vista.
 *
 * ── Uma malha nova, o MESMO material ────────────────────────────────────────────────────────
 * A dungeon reaproveita `mats.solid` tal e qual, e a montanha usa `mats.rock`, que existe desde o
 * primeiro bake e nunca e recriado (terrainMats): material novo em runtime recompilaria todo shader
 * do mundo (a lei do projeto). O que muda a cada bake e so a geometria — e geometria pode nascer e
 * morrer a vontade.
 *
 * ── O VOLUME e PINTADO, nao iluminado ───────────────────────────────────────────────────────
 * `mats.solid`/`mats.rock` levam `normalUp`: toda face e acesa como se olhasse para cima. Isso e a
 * lei de iluminacao deste jogo (uma tocha atras de um plano nunca pode apagar o plano), mas a conta
 * de um cubo: com a mesma luz nas seis faces, teto e frente saem no MESMO tom e o cubo volta a ler
 * como adesivo. Entao a diferenca entre as faces vem em cor de VERTICE (`shade`), com a luz do alto
 * a esquerda que o resto do jogo usa: teto cheio, oeste quase cheio, sul um degrau abaixo, leste no
 * escuro — e um degrade para o PE de cada face lateral, que e a sombra propria do bloco.
 *
 * A dungeon nao leva `shade` de proposito: o teto dela e preto puro (ver mats.wallTop — foram tres
 * tentativas de sombrear aquele teto e todas competiram com o chao), e sombrear as laterais de uma
 * massa que ja e quase preta nao acrescenta leitura nenhuma.
 */
/** Os frames que viram cubo. Set porque a consulta roda por tile no bake. */
const DUNGEON_WALL_SET: ReadonlySet<number> = new Set(DUNGEON_WALL_FRAMES);
const CLIFF_WALL_SET: ReadonlySet<number> = new Set(CLIFF_WALL_FRAMES);

/** Quanto cada face de um cubo vale de luz, e quanto o PE de uma face lateral escurece. */
type CubeShade = {
  top: number; south: number; west: number; east: number; foot: number;
};

/**
 * A MONTANHA iluminada do alto-a-esquerda. Numeros modestos de proposito: a arte de pedra ja e
 * escura (37% dela e a argamassa em #3b3b3b) e a noite deste jogo escurece por cima disto — o
 * bastante para as quinas se separarem, nunca o bastante para a face leste virar um buraco.
 */
const ROCK_CUBE_SHADE: CubeShade = {
  top: 1, south: 0.84, west: 0.95, east: 0.72, foot: 0.78,
};

const buildTileCubeGeometry = (
  tiles: ReadonlyArray<{ x: number; z: number; frame: number }>,
  isWall: (x: number, z: number) => boolean,
  shade?: CubeShade,
): THREE.BufferGeometry => {
  const pos: number[] = [];
  const uv: number[] = [];
  const bounds: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const topIdx: number[] = [];
  const sideIdx: number[] = [];
  const face = (
    f: ReturnType<typeof tilesetFrameUv>,
    a: readonly [number, number, number], b: readonly [number, number, number],
    c: readonly [number, number, number], d: readonly [number, number, number],
    n: readonly [number, number, number],
    into: number[],
    /** Luz na dupla de cima e na dupla de baixo da face — o degrade que assenta o bloco no chao. */
    lit?: readonly [number, number],
  ): void => {
    const base = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    // a=cima-esq, b=cima-dir, c=baixo-dir, d=baixo-esq — a mesma ordem do quad em pe, para a
    // arte cair de pe em toda face e o `aUvBounds` continuar sendo a janela certa do texel-AA.
    uv.push(f.u0, f.v1, f.u1, f.v1, f.u1, f.v0, f.u0, f.v0);
    for (let k = 0; k < 4; k++) bounds.push(f.cu0, f.cv0, f.cu1, f.cv1);
    for (let k = 0; k < 4; k++) nrm.push(...n);
    if (lit) {
      for (const s of [lit[0], lit[0], lit[1], lit[1]]) col.push(s, s, s);
    }
    into.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  for (const { x, z, frame } of tiles) {
    const f = tilesetFrameUv(frame);
    const [x0, x1] = [x - 0.5, x + 0.5];
    const [z0, z1] = [z - 0.5, z + 0.5];
    const side = (s: number): readonly [number, number] | undefined =>
      (shade ? [s, s * shade.foot] : undefined);
    // O TETO, sempre — sem ele o bloco fica oco por cima (a face de tras e descartada pelo
    // backface culling, entao o buraco mostraria o nada). Na dungeon ele vai para o GRUPO PRETO:
    // uma parede vista de cima nao e uma parede, e desenhar o tijolo ali punha um campo de
    // alvenaria do tamanho da dungeon competindo com o chao pela atencao. Na MONTANHA e o
    // contrario — o teto e o planalto, a face que a camera de cima mais ve, e a rocha ali e o que
    // faz a massa ler como terreno e nao como muro.
    face(
      f, [x0, 1, z0], [x1, 1, z0], [x1, 1, z1], [x0, 1, z1], [0, 1, 0],
      shade ? sideIdx : topIdx, shade ? [shade.top, shade.top] : undefined,
    );
    // A face SUL: a frente do bloco, e a unica lateral que a camera enxerga de cheio.
    if (!isWall(x, z + 1)) {
      face(f, [x0, 1, z1], [x1, 1, z1], [x1, 0, z1], [x0, 0, z1], [0, 0, 1], sideIdx,
        side(shade?.south ?? 1));
    }
    if (!isWall(x - 1, z)) {
      face(f, [x0, 1, z0], [x0, 1, z1], [x0, 0, z1], [x0, 0, z0], [-1, 0, 0], sideIdx,
        side(shade?.west ?? 1));
    }
    if (!isWall(x + 1, z)) {
      face(f, [x1, 1, z1], [x1, 1, z0], [x1, 0, z0], [x1, 0, z1], [1, 0, 0], sideIdx,
        side(shade?.east ?? 1));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aUvBounds', new THREE.Float32BufferAttribute(bounds, 4));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex([...topIdx, ...sideIdx]);
  if (shade) {
    // Um material so, um grupo so: o teto entrou na mesma lista das laterais.
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geo;
  }
  // Dois grupos, dois materiais, UMA malha: o teto preto e os lados texturizados. Continua sendo
  // uma geometria so — o custo de um material a mais aqui e um bind, nao um draw call por bloco.
  geo.addGroup(0, topIdx.length, 0);
  geo.addGroup(topIdx.length, sideIdx.length, 1);
  return geo;
};

const buildUprightTileGeometry = (
  tiles: ReadonlyArray<{ x: number; z: number; frame: number }>,
): THREE.BufferGeometry => {
  const pos: number[] = [];
  const uv: number[] = [];
  const bounds: number[] = [];
  const nrm: number[] = [];
  const wind: number[] = [];
  const idx: number[] = [];
  tiles.forEach(({ x, z, frame }, i) => {
    const f = tilesetFrameUv(frame);
    // Upright quad on the tile, facing the (fixed-yaw) camera direction (+z). NO CENTRO EXATO do
    // tile, sempre: o mundo é uma grade e a grade é o desenho (ver o chamador em buildTerrain).
    pos.push(x - 0.5, 1, z, x + 0.5, 1, z, x + 0.5, 0, z, x - 0.5, 0, z);
    uv.push(f.u0, f.v1, f.u1, f.v1, f.u1, f.v0, f.u0, f.v0);
    for (let k = 0; k < 4; k++) bounds.push(f.cu0, f.cv0, f.cu1, f.cv1);
    nrm.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
    // Quem obedece ao VENTO, e o centro do tile de onde a onda é lida (ver WIND_WAVE_GLSL). É
    // por vértice porque é UMA malha: a árvore que balança e o túmulo que não estão nela juntos.
    const sway = WIND_SWAY_FRAMES.has(frame) ? 1 : 0;
    for (let k = 0; k < 4; k++) wind.push(sway, x, z);
    const b = i * 4;
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aUvBounds', new THREE.Float32BufferAttribute(bounds, 4));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('aWind', new THREE.Float32BufferAttribute(wind, 3));
  geo.setIndex(idx);
  return geo;
};
