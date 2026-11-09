// O QUE O TERRENO ASSADO DEIXA PARA O RESTO DO MUNDO 3D: os tiles em pé (e o índice deles por balde), os afundados,
// a serra, a escada, os maciços, as malhas e os materiais, e os campos de sombra instanciados. Quem escreve é o assado
// (TerrainBaker e os passos dele); quem lê são as sombras, as luzes, o vento e o espelho d'água.

import * as THREE from 'three';
import { SolidCastField } from '../CastShadow3D';
import type { MassHeightGrid, ReliefPoint } from '../terrainGeometry';
import type { TerrainMaterials } from '../terrainMaterials';

/**
 * A standing solid tile (tree/wall), as the shadow pass sees it. The optional fields are
 * cast-pass bookkeeping, written in place so the per-frame loops allocate nothing:
 * `mark` dedupes a tile reachable from two fires' candidate lists, `lastFire` is the
 * heading hysteresis (P5 — between two fires "nearest" must not flip with the flicker),
 * `moonSlot` is where its baked moon silhouette landed, so the statics' fire→moon
 * handoff can retune that one instance's darkness without a re-bake.
 */
export interface SolidTileEntry {
  x: number;
  z: number;
  frame: number;
  mark?: number;
  lastFire?: FireEntry | 'torch' | null;
  moonSlot?: number;
}
export interface FireEntry {
  worldX: number;
  worldY: number;
  lit: boolean;
  scale: number;
  /**
   * O TAMANHO da poça no chão, como fração de `params.fireGlowSize`.
   *
   * Ele existe porque `scale` não servia: `scale` multiplica INTENSIDADE (e só ela), então a
   * única coisa que uma fonte pequena conseguia pedir era ser mais fraca — nunca ser menor. Com
   * `fireGlowSize` em 15 tiles, as 75 tochas de parede da masmorra pintavam 75 poças de 15 tiles
   * cada uma: o chão inteiro saía lavado de laranja e nenhuma tocha lia como MARCO, que é o único
   * motivo de elas existirem. A tocha da MÃO já tinha esse número (o `TORCH_SCALE` de
   * `updateTorch`, que escala o gSize dela na mão); isto é o mesmo número, disponível para o pool.
   */
  sizeScale: number;
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

export class TerrainData {
  // ── ambient particles ──
  // Where the lava lies (for the per-region grade) and how molten the current frame reads, 0..1.
  public readonly lavaSpots: Array<{ x: number; y: number }> = [];
  /** Os tiles de vegetação da janela assada (x + z empacotados) — onde o enxame pousa. */
  public readonly greenTiles: number[] = [];
  public readonly solidTiles: SolidTileEntry[] = [];
  // Exposed solid tiles only (few solid neighbours — clearing edges / lone trees).
  // Deep-in-the-forest-wall tiles are excluded: their overlapping blobs/shadows would
  // merge into one dark block, so only these get a contact blob and cast a shadow.
  public readonly castableSolids: SolidTileEntry[] = [];
  public decorGeo!: THREE.BufferGeometry;
  public readonly grassQuads = new Map<string, number>(); // "x,z" → vertex start
  // The decor quad of EVERY flat decor tile (grassQuads is only the rustleable frame) — the
  // shovel erases foliage/litter under a dug hole, whatever the frame (removeDecorTile).
  public readonly decorQuads = new Map<string, number>(); // "x,z" → vertex start
  /**
   * The terrain's own meshes, kept so an infinite world can throw the window away and bake the
   * next one (see rebuildTerrain). The authored worlds never call it — they bake once at boot.
   */
  public readonly terrainMeshes: THREE.Mesh[] = [];
  /**
   * Terrain materials are built ONCE and reused across re-bakes. Not for allocation's sake:
   * three bakes a material's patched program into its cache key, and a fresh material per
   * re-bake would go looking for that program in the renderer's cache on the frame it is first
   * drawn — the one thing this project's shader rules exist to prevent.
   */
  public terrainMats?: TerrainMaterials;
  /**
   * Capacity the moon-cast field is allocated with while the world streams. A re-bake changes
   * how many exposed solids exist, and an InstancedMesh cannot grow — so a streaming world
   * over-allocates once instead of building a new field (and a new draw) every chunk crossing.
   */
  public moonFieldCapacity = 0;
  /** How many times the terrain has been baked. >1 means the world streams (explorer mode). */
  public terrainBakes = 0;
  /** Spatial hash of castable solids (4×4-tile buckets) for the one MOBILE flame, the torch. */
  public readonly solidBuckets = new Map<number, SolidTileEntry[]>();
  /** Sunken ground tiles (river/lava/sea beds) — where a cast silhouette must stop (2b). */
  public readonly sunkenTiles = new Set<number>();
  /** A superfície assada dos rios (o material do mar) e o quad de cada tile nela — ver drainRiverSurface. */
  public riverSurfaceGeo?: THREE.BufferGeometry;
  public readonly riverQuads = new Map<number, number>(); // tileKey → vertex start
  // …and a reused pool for whichever static solid tiles are near a lit fire this frame.
  /** Every static solid's cast shadow, batched into one instanced draw. See SolidCastField. */
  public solidCastField!: SolidCastField;
  /** Every static solid's MOON shadow — filled once at build, the moon never moves. */
  public moonCastField!: SolidCastField;
  /**
   * A sombra das MASSAS — alvenaria de dungeon e montanha, os dois que viram CUBO. Elas saem do
   * campo instanciado da lua e do fogo e ganham esta malha só, assada sem sobreposição nenhuma:
   * ver buildMassShadowGeometry, que é onde mora o porquê.
   */
  public massTiles: SolidTileEntry[] = [];
  /** A altura em níveis de todo tile que é massa: é o campo de que a sombra sai. */
  public readonly massHeight = new Map<number, number>();
  /** As duas massas, guardadas para o rebuildCubes (a bomba tira um bloco e a poda muda em volta). */
  public wallCubes: SolidTileEntry[] = [];
  public rockCubes: SolidTileEntry[] = [];
  /**
   * A SERRA (ver world/relief): os blocos do planalto — cubos de rocha SEM teto, porque o teto
   * deles e o chao de grama assado um nivel acima — e as escadas, cada uma com o rumo da subida.
   */
  public reliefTiles: Array<{ x: number; z: number }> = [];
  public reliefField?: ReliefPoint;
  public massGrid: MassHeightGrid | null = null;
  public stairTiles: Array<{ x: number; z: number; ux: number; uz: number; base: number }> = [];
  public cubeMeshes: THREE.Mesh[] = [];
}
