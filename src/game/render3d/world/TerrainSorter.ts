// A VARREDURA DO TERRENO: cada tile do mundo (e da margem de fora dele) no seu balde — chão, rio, mar, lava, poço,
// decoração, sólido, serra, escada, vazio — numa passada só, para os passos do assado.

import { CHUNK_COLUMNS, CHUNK_ROWS, groundFrameAt, SEA_TILE_FRAME, SEA_TILE_FRAMES, terrainVariant, SOLID_UPPER_FRAMES } from '@/game/constants';
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
  seaTiles: TerrainTile[];
  lavaBedTiles: TerrainTile[];
  decorTiles: TerrainTile[];
  highGroundTiles: TerrainTile[];
  reliefNear: Array<TerrainTile & { level: number; far: boolean }>;
  voidTiles: Array<{ x: number; z: number }>;
  solidSet: Set<number>;
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
    const lavaBedTiles: Array<{ x: number; z: number; frame: number }> = [];
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
            if (outside) voidTiles.push({ x: wx, z: wy });
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

    return { b, pitSet, pitTiles, groundTiles, bedTiles, seaTiles, lavaBedTiles, decorTiles, highGroundTiles, reliefNear, voidTiles, solidSet };
  }
}
