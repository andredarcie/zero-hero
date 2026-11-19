// A VARREDURA DO TERRENO: cada tile do mundo (e da margem de fora dele) no seu balde — chão, rio, mar, lava, poço,
// decoração, sólido, serra, escada, vazio — numa passada só, para os passos do assado.

import {
  CHUNK_COLUMNS, CHUNK_ROWS, groundFrameAt, SAND_TILE_FRAME, SAND_TILE_FRAMES, SEA_TILE_FRAME, SEA_TILE_FRAMES, terrainVariant,
  SOLID_UPPER_FRAMES, TREE_UPPER_FRAMES,
} from '@/game/constants';
import { isSpringPool } from '@/game/world/hotSpring';
import { getBridgeSpots, getChunkTerrain, getLavaTiles, getWaterTiles, getWorldBounds, isInsideWorld } from '@/game/world/WorldData';
import { reliefAt, reliefLevelAt, stairBase, stairUp } from '@/game/world/relief';
import { decorFrameAt } from '@/game/world/biomes';
import { tileKey } from '../terrainGeometry';
import type { World3D } from '../World3D';

// How far past the authored world to mesh the out-of-bounds filler (now open sea).
//
// ONE ring, measured. A second ring looked tempting (more ocean at the horizon) and cost ~9%
// more triangles — 53.1k vs 48.8k on main — which showed up as frame p50 6.9ms against main's
// 6.1ms. One ring instead comes in UNDER main at 40.2k, because the void used to carry an
// upright pine quad per tile (plus its blob and its cast shadow) and open water carries none.
// That is the whole trade: the border got cheaper by becoming flat.
const VOID_MARGIN_CHUNKS = 1;
/**
 * Mais uma faixa ao NORTE, só de morro: é para lá que a câmera olha, e o horizonte precisa de fundo.
 * Sem árvore nenhuma (a conta acima é a do pinheiro por tile), então ela custa só as faces de pedra.
 */
const VOID_NORTH_EXTRA_CHUNKS = 1;
/** Um tile de chão com o frame que ele veste. */
export interface TerrainTile { x: number; z: number; frame: number }
/** O mundo separado por tipo de tile (ver sortTerrain), para os passos do assado. */
export interface TerrainSort {
  b: ReturnType<typeof getWorldBounds>;
  pitSet: Set<string>;
  pitTiles: TerrainTile[];
  groundTiles: TerrainTile[];
  bedTiles: TerrainTile[];
  /** O mar do vale (lago, enseada pintada): afundado, com barranco e espelho. */
  seaTiles: TerrainTile[];
  /**
   * A PRAIA DO NORTE (render3d/surf.ts): o OCEANO é o mar que encosta na areia e todo mar ligado a ele (o de fora do
   * mapa também); a AREIA é o chão de areia no nível do chão. Os dois saem numa malha só, com as ondas.
   */
  oceanTiles: TerrainTile[];
  sandTiles: TerrainTile[];
  lavaBedTiles: TerrainTile[];
  /**
   * A BACIA DA FONTE TERMAL (world/hotSpring): os tiles dela não viram chão — o terreno cava ali uma bacia de verdade
   * (TerrainFeatures.bakeSpring), com o leito de areia, a borda e a parede. O frame é o do leito.
   */
  springTiles: TerrainTile[];
  decorTiles: TerrainTile[];
  highGroundTiles: TerrainTile[];
  reliefNear: Array<TerrainTile & { level: number; far: boolean }>;
  voidTiles: Array<{ x: number; z: number }>;
  solidSet: Set<number>;
  /** Os sólidos que são ÁRVORE (TREE_UPPER_FRAMES): a mata fechada, para a sombra e o sub-bosque dela. */
  treeSet: Set<number>;
}

/** O que TerrainSorter usa de World3D. */
export type TerrainSorterHost = Pick<World3D,
  'tiles'
>;

export class TerrainSorter {
  public constructor(private readonly host: TerrainSorterHost) {}

  /** A varredura do mundo: cada tile no seu balde (chão, rio, mar, lava, poço, decoração, sólido, serra, vazio). */
  public sortTerrain(): TerrainSort {
    const b = getWorldBounds();
    // River tiles (plain water + buildable bridge spots) sink into a
    // channel below the ground: their ground quad drops to the bed and gets dark banks.
    const waterSet = new Set<string>(
      [...getWaterTiles(), ...getBridgeSpots()]
        .map((p) => `${p.worldX},${p.worldY}`),
    );
    // A lava afunda na própria bacia, mais rasa que a do rio. O poço da escada saiu do mundo: o
    // conjunto fica VAZIO em vez de arrancar a bacia do assado.
    const lavaSet = new Set<string>(getLavaTiles().map((p) => `${p.worldX},${p.worldY}`));
    for (const l of getLavaTiles()) this.host.tiles.lavaSpots.push({ x: l.worldX, y: l.worldY });
    const pitSet = new Set<string>();
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
    const sandTiles: Array<{ x: number; z: number; frame: number }> = [];
    const lavaBedTiles: Array<{ x: number; z: number; frame: number }> = [];
    const springTiles: Array<{ x: number; z: number; frame: number }> = [];
    const decorTiles: Array<{ x: number; z: number; frame: number }> = [];
    // O chao do PLANALTO, um nivel acima (ver world/relief). A grama dele e a mesma do mundo; o
    // que muda e a altura do quad.
    const highGroundTiles: Array<{ x: number; z: number; frame: number }> = [];
    // Quem o contorno da serra alcança: o tile alto e o vizinho dele (ver buildReliefContourGeometry).
    const reliefNear: Array<{ x: number; z: number; frame: number; level: number; far: boolean }> = [];
    this.host.tiles.reliefTiles = [];
    this.host.tiles.stairTiles = [];

    // Os tiles FORA do mundo autorado, para a névoa negra saber onde deitar (ver buildVoidMist).
    // Só o de cima tem névoa: embaixo o "escuro gigante" é o teto preto do próprio muro.
    const voidTiles: Array<{ x: number; z: number }> = [];
    for (let cy = b.minCy - VOID_MARGIN_CHUNKS - VOID_NORTH_EXTRA_CHUNKS; cy <= b.maxCy + VOID_MARGIN_CHUNKS; cy++) {
      for (let cx = b.minCx - VOID_MARGIN_CHUNKS; cx <= b.maxCx + VOID_MARGIN_CHUNKS; cx++) {
        const chunk = getChunkTerrain(cx, cy); // void filler outside the authored world
        const outside = !isInsideWorld(cx, cy);
        for (let row = 0; row < CHUNK_ROWS; row++) {
          for (let col = 0; col < CHUNK_COLUMNS; col++) {
            const wx = cx * CHUNK_COLUMNS + col;
            const wy = cy * CHUNK_ROWS + row;
            // O mar de fora (WorldData.isVoidSea) é água aberta até o horizonte: sem névoa negra, sem chão de mata.
            if (outside && chunk.ground[row][col] !== SEA_TILE_FRAME) voidTiles.push({ x: wx, z: wy });
            const tile = { x: wx, z: wy, frame: chunk.ground[row][col] };
            const tk = `${wx},${wy}`;
            if (tile.frame === SEA_TILE_FRAME) {
              seaSet.add(tk);
              // Break the tiling: one frame repeated across ~11k tiles reads as a grid, not as
              // water. The variant is chosen from the coordinate (never random) — see tileVariant.
              tile.frame = SEA_TILE_FRAMES[terrainVariant(wx, wy, SEA_TILE_FRAMES.length)];
              seaTiles.push(tile);
            }
            else if (waterSet.has(tk)) bedTiles.push(tile);
            else if (lavaSet.has(tk)) lavaBedTiles.push(tile);
            else if (pitSet.has(tk)) pitTiles.push(tile);
            // a bacia da fonte termal: o leito dela é areia (o claro por baixo é o que deixa a água turquesa)
            else if (!outside && isSpringPool(wx, wy)) springTiles.push({ ...tile, frame: groundFrameAt(SAND_TILE_FRAME, wx, wy) });
            else {
              // …and the same for the WORLD'S FLOOR, except there the swap is the MINORITY: most
              // of the ground keeps the field it always was, and one patch in GROUND_DETAIL_IN
              // opens into painted earth. The world data still says 5 either way (nothing in
              // world.json moved, the editor still paints one "Terra", the shovel still keys off
              // 5) — what the tile WEARS is decided here, from the coordinate.
              tile.frame = groundFrameAt(tile.frame, wx, wy);
              const level = reliefLevelAt(wx, wy);
              let nearRelief = level > 0;
              for (let dz = -1; dz <= 1 && !nearRelief; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                  if (reliefLevelAt(wx + dx, wy + dz) > 0) { nearRelief = true; break; }
                }
              }
              if (nearRelief) reliefNear.push({ ...tile, level, far: outside });
              if (level > 0) this.host.tiles.reliefTiles.push({ x: wx, z: wy });
              else if (SAND_TILE_FRAMES.has(tile.frame)) sandTiles.push(tile); // a areia é da malha da praia
              else groundTiles.push(tile);
              // A escada mora no andar de onde sai: a do chão fica no chão, a do cume em cima do planalto.
              const code = outside ? 0 : reliefAt(wx, wy);
              const up = outside ? undefined : stairUp(code);
              if (up) this.host.tiles.stairTiles.push({ x: wx, z: wy, ux: up[0], uz: up[1], base: stairBase(code) });
            }
            const stored = chunk.upper[row][col];
            if (stored === null) continue;
            // O BIOMA escolhe o que a decoração veste aqui (world/biomes.ts): só troca rasteiro por
            // rasteiro e árvore sólida por árvore sólida, então colisão e jogo não mudam.
            const upper = decorFrameAt(stored, wx, wy);
            // A faixa extra do norte é só morro: ver VOID_NORTH_EXTRA_CHUNKS.
            if (cy < b.minCy - VOID_MARGIN_CHUNKS) continue;
            if (chunk.collisions[row][col] || SOLID_UPPER_FRAMES.has(upper)) {
              this.host.tiles.solidTiles.push({ x: wx, z: wy, frame: upper });
            } else {
              decorTiles.push({ x: wx, z: wy, frame: upper });
            }
          }
        }
      }
    }

    // Where the standing tiles are, so the ground can bake an ambient-occlusion corner shade
    // under them (see buildFlatTileGeometry).
    const solidSet = new Set(this.host.tiles.solidTiles.map((t) => tileKey(t.x, t.z)));
    const treeSet = new Set(this.host.tiles.solidTiles.filter((t) => TREE_UPPER_FRAMES.has(t.frame)).map((t) => tileKey(t.x, t.z)));

    const { ocean, inland } = this.splitOcean(seaTiles, sandTiles);
    return {
      b, pitSet, pitTiles, groundTiles, bedTiles, seaTiles: inland, oceanTiles: ocean, sandTiles, lavaBedTiles, springTiles, decorTiles,
      highGroundTiles,
      reliefNear, voidTiles, solidSet, treeSet,
    };
  }

  /**
   * O OCEANO é o mar que encosta na areia, e todo mar ligado a ele pelos lados (uma inundação a partir da praia). O
   * resto do mar — um lago pintado com o frame de mar, longe de qualquer areia — continua sendo o mar afundado de
   * sempre, com barranco e espelho. Sem areia no mapa não há oceano, e nada muda.
   */
  private splitOcean(seaTiles: TerrainTile[], sandTiles: readonly TerrainTile[]): { ocean: TerrainTile[]; inland: TerrainTile[] } {
    if (sandTiles.length === 0 || seaTiles.length === 0) return { ocean: [], inland: seaTiles };
    const sea = new Map<number, TerrainTile>();
    for (const t of seaTiles) sea.set(tileKey(t.x, t.z), t);
    const ocean = new Set<number>();
    const queue: TerrainTile[] = [];
    const visit = (x: number, z: number): void => {
      const k = tileKey(x, z);
      const t = sea.get(k);
      if (!t || ocean.has(k)) return;
      ocean.add(k);
      queue.push(t);
    };
    for (const s of sandTiles) {
      visit(s.x + 1, s.z); visit(s.x - 1, s.z); visit(s.x, s.z + 1); visit(s.x, s.z - 1);
    }
    for (let i = 0; i < queue.length; i++) {
      const t = queue[i];
      visit(t.x + 1, t.z); visit(t.x - 1, t.z); visit(t.x, t.z + 1); visit(t.x, t.z - 1);
    }
    return { ocean: queue, inland: seaTiles.filter((t) => !ocean.has(tileKey(t.x, t.z))) };
  }
}
