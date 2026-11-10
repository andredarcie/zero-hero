// O CHÃO DO TERRENO: a serra com a curva da margem, o chão de baixo e o do planalto, o rio e o mar com a margem
// orgânica, e a beira mordida do calçamento.

import * as THREE from 'three';
import { CHUNK_COLUMNS, CHUNK_ROWS, GROUND_DETAIL_FRAMES, GROUND_TILE_FRAME, SEA_TILE_FRAMES, terrainVariant, STONE_FLOOR_FRAMES } from '@/game/constants';
import { RELIEF_HEIGHT, reliefLevelAt } from '@/game/world/relief';
import { buildVineGeometry } from '../vineTexture';
import { buildFlatTileGeometry, buildReliefContourGeometry, buildShoreGeometry, CLIFF_WALL_SET, DUNGEON_WALL_SET, groundShadeAt, groundTintAt, makeReliefField, STONE_EDGE_MIN, STONE_EDGE_VAR, STONE_EDGE_WOBBLE, STONE_LIP_Y, tileKey, tileShoreCorners } from '../terrainGeometry';
import type { TerrainMaterials } from '../terrainMaterials';
import type { TerrainTile, TerrainSort } from './TerrainSorter';
import type { World3D } from '../World3D';
import { RIVER_SURFACE_LIFT, WATER_DEPTH_TILES } from './worldDefs';


/** As pinturas de terra nua (constants.groundFrameAt): é a beira delas que o capim morde. */
const EARTH_FRAMES: ReadonlySet<number> = new Set(GROUND_DETAIL_FRAMES);

/** O que TerrainGround usa de World3D. */
export type TerrainGroundHost = Pick<World3D,
  'terrain' | 'tiles'
>;

export class TerrainGround {
  public constructor(private readonly host: TerrainGroundHost) {}

  public bakeRelief(t: TerrainSort, mats: TerrainMaterials): void {
    const { bedTiles, seaTiles, lavaBedTiles, pitTiles, reliefNear, highGroundTiles, groundTiles, solidSet } = t;
    // A SERRA COM A CURVA DA MARGEM (ver makeReliefField). Antes do chão: um tile alto com a quina
    // mordida precisa do chão de baixo por inteiro.
    if (reliefNear.length > 0) {
      const stairKeys = new Set(this.host.tiles.stairTiles.map((t) => tileKey(t.x, t.z)));
      const wetKeysForRelief = new Set<number>();
      for (const list of [bedTiles, seaTiles, lavaBedTiles, pitTiles]) {
        for (const t of list) wetKeysForRelief.add(tileKey(t.x, t.z));
      }
      // O cubo de pedra tem teto na altura do planalto: um beiço entrando nele brigaria pelo mesmo plano.
      for (const t of this.host.tiles.solidTiles) {
        if (DUNGEON_WALL_SET.has(t.frame) || CLIFF_WALL_SET.has(t.frame)) wetKeysForRelief.add(tileKey(t.x, t.z));
      }
      const blocked = (x: number, z: number): boolean => {
        const k = tileKey(x, z);
        return stairKeys.has(k) || wetKeysForRelief.has(k);
      };
      // O nível de cada tile, contado UMA vez por montagem: o campo lê os 9 vizinhos de cada pixel de arte (16×16 por
      // tile), várias vezes por nível, e cada leitura refazia o ruído da serra — o mesmo tile, milhares de vezes. O
      // relevo não muda durante a montagem (nem depois: ninguém o escreve com o jogo rodando), e o campo nasce de
      // novo a cada montagem: o número guardado é o mesmo que a conta daria.
      const levelMemo = new Map<number, number>();
      const levelAtOnce = (x: number, z: number): number => {
        const k = tileKey(x, z);
        let v = levelMemo.get(k);
        if (v === undefined) {
          v = reliefLevelAt(x, z);
          levelMemo.set(k, v);
        }
        return v;
      };
      this.host.tiles.reliefField = makeReliefField(levelAtOnce, blocked);
      const frameOf = new Map<number, number>();
      for (const t of reliefNear) frameOf.set(tileKey(t.x, t.z), t.frame);
      // UM PEDAÇO POR CHUNK, e a câmera só desenha os que estão à vista. A curva tem dezenas de milhares
      // de faces, e a tela mostra uma fração delas: alguns draws a mais pagam muitos triângulos a menos.
      const pieces = new Map<number, typeof reliefNear>();
      for (const t of reliefNear) {
        const k = tileKey(Math.floor(t.x / CHUNK_COLUMNS), Math.floor(t.z / CHUNK_ROWS));
        const piece = pieces.get(k);
        if (piece) piece.push(t);
        else pieces.set(k, [t]);
      }
      for (const piece of pieces.values()) {
        const contour = buildReliefContourGeometry(piece, frameOf, this.host.tiles.reliefField, reliefLevelAt, stairKeys, blocked, groundShadeAt(solidSet));
        highGroundTiles.push(...contour.whole.filter((t) => reliefLevelAt(t.x, t.z) > 0));
        groundTiles.push(...contour.bases);
        if (contour.tops.getIndex()?.count) this.host.terrain.addTerrainMesh(new THREE.Mesh(contour.tops, mats.ground));
        if (contour.walls.getIndex()?.count) this.host.terrain.addTerrainMesh(new THREE.Mesh(contour.walls, mats.rock));
        if (contour.vines.length > 0) this.host.terrain.addTerrainMesh(new THREE.Mesh(buildVineGeometry(contour.vines), mats.vines));
      }
    }
  }

  /** O chão (de baixo e do planalto), o leito do rio, a superfície do rio e do mar, e a margem. Devolve a água toda. */
  public bakeGroundAndWater(t: TerrainSort, mats: TerrainMaterials, groundFrame: ReadonlyMap<number, number>): TerrainTile[] {
    const { groundTiles, highGroundTiles, bedTiles, seaTiles, solidSet } = t;
    // O bioma × a mancha larga × a sombra de copa (groundTintAt): a mesma cor que o beiço e a margem vestem.
    const tint = groundTintAt(solidSet);
    this.host.terrain.addTerrainMesh(new THREE.Mesh(buildFlatTileGeometry(groundTiles, 0, solidSet, undefined, undefined, tint), mats.ground));
    if (highGroundTiles.length > 0) {
      this.host.terrain.addTerrainMesh(new THREE.Mesh(buildFlatTileGeometry(highGroundTiles, (x, z) => reliefLevelAt(x, z) * RELIEF_HEIGHT, solidSet, undefined, undefined, tint), mats.ground));
    }

    // The sunken riverbed (the same dirt, dropped a level) + the earthen banks that
    // wall the channel where it meets the land — together they give the water its depth.
    if (bedTiles.length > 0) {
      this.host.terrain.addTerrainMesh(new THREE.Mesh(
        buildFlatTileGeometry(bedTiles, -WATER_DEPTH_TILES, solidSet), mats.ground,
      ));
    }
    // Where the water's edge IS, per corner of every water tile: the shore ramp the breaking
    // wave rides. `wetKeys` counts river and sea alike, so a river running into a lake does not
    // grow a beach across its own mouth.
    const wetKeys = new Set<number>();
    for (const t of seaTiles) wetKeys.add(tileKey(t.x, t.z));
    for (const t of bedTiles) wetKeys.add(tileKey(t.x, t.z));
    // O RIO É A MESMA ÁGUA DO LAGO. Ele era um quad por tile com a arte própria (water_0..3,
    // azul-ardósia, sem espuma) — duas águas a três tiles uma da outra, e uma lagoa redonda feita
    // de rio parecia represa. Agora a superfície dele sai aqui, com o material do mar: as mesmas
    // três variantes por coordenada (sem a grade de riscos que a arte do rio repetia), a mesma
    // arrebentação nas margens, o mesmo glint e o mesmo espelho. O WaterObject continua dono do
    // TILE (colisão, ponte, vau, balde); quando uma comporta o esvazia, ele pede drainRiverSurface.
    if (bedTiles.length > 0) {
      const riverTiles = bedTiles.map((t) => ({
        x: t.x, z: t.z, frame: SEA_TILE_FRAMES[terrainVariant(t.x, t.z, SEA_TILE_FRAMES.length)],
      }));
      this.host.tiles.riverSurfaceGeo = buildFlatTileGeometry(
        riverTiles, -WATER_DEPTH_TILES + RIVER_SURFACE_LIFT, solidSet,
        (x, z) => tileShoreCorners(x, z, wetKeys),
      );
      riverTiles.forEach((t, i) => this.host.tiles.riverQuads.set(tileKey(t.x, t.z), i * 4));
      this.host.terrain.addTerrainMesh(new THREE.Mesh(this.host.tiles.riverSurfaceGeo, mats.sea));
    }
    if (seaTiles.length > 0) {
      this.host.terrain.addTerrainMesh(new THREE.Mesh(
        buildFlatTileGeometry(
          seaTiles, -WATER_DEPTH_TILES, solidSet, (x, z) => tileShoreCorners(x, z, wetKeys),
        ),
        mats.sea,
      ));
    }
    // A MARGEM, para o rio e o lago iguais (ver buildShoreGeometry): o chão avança sobre a água
    // num contorno orgânico, e o barranco desce por esse contorno — não pela linha reta do tile.
    const wetTiles = seaTiles.length > 0 ? [...bedTiles, ...seaTiles] : bedTiles;
    if (wetTiles.length > 0) {
      const shore = buildShoreGeometry(
        wetKeys, wetTiles, (x, z) => groundFrame.get(tileKey(x, z)) ?? null, WATER_DEPTH_TILES,
        { shadeAt: groundShadeAt(solidSet) },
      );
      this.host.terrain.addTerrainMesh(new THREE.Mesh(shore.lip, mats.ground));
      this.host.terrain.addTerrainMesh(new THREE.Mesh(shore.walls, mats.bank));
    }

    return wetTiles;
  }

  public bakeStoneEdges(t: TerrainSort, mats: TerrainMaterials): void {
    const { groundTiles, reliefNear, solidSet } = t;
    // O CALÇAMENTO NÃO ACABA EM LINHA: o capim morde a beira dele, e pedras soltas avançam sobre o capim. Uma passada
    // por nível, porque há calçamento no planalto, e `keep` segura a borda onde aquele nível tem chão de verdade.
    const floorByLevel = new Map<number, Array<{ x: number; z: number; frame: number }>>();
    // Tile alto em `groundTiles` é a base de uma beira de serra, no chão de baixo: não é piso daquele nível. O piso
    // alto vem de `reliefNear`, que inclui os tiles desenhados pelo contorno, e não só os inteiros.
    for (const t of [...groundTiles.filter((g) => reliefLevelAt(g.x, g.z) === 0), ...reliefNear.filter((n) => n.level > 0)]) {
      const level = reliefLevelAt(t.x, t.z);
      const list = floorByLevel.get(level);
      if (list) list.push(t);
      else floorByLevel.set(level, [t]);
    }
    for (const [level, floor] of floorByLevel) {
      const stoneFloor = floor.filter((t) => STONE_FLOOR_FRAMES.has(t.frame));
      if (stoneFloor.length === 0) continue;
      const frames = new Map<number, number>();
      for (const t of floor) frames.set(tileKey(t.x, t.z), t.frame);
      const stoneKeys = new Set(stoneFloor.map((t) => tileKey(t.x, t.z)));
      const ring = new Map<number, { x: number; z: number }>();
      for (const t of stoneFloor) {
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const k = tileKey(t.x + dx, t.z + dz);
            if (!stoneKeys.has(k) && frames.has(k)) ring.set(k, { x: t.x + dx, z: t.z + dz });
          }
        }
      }
      const y = level * RELIEF_HEIGHT + STONE_LIP_Y;
      const field = this.host.tiles.reliefField;
      const keep = (px: number, pz: number): boolean => !field || field(px, pz) === level;
      const inward = buildShoreGeometry(
        stoneKeys, stoneFloor, (x, z) => frames.get(tileKey(x, z)) ?? null, 0,
        { min: STONE_EDGE_MIN, variance: STONE_EDGE_VAR, round: 0.12, wobble: STONE_EDGE_WOBBLE, y, flatOnly: true, keep, shadeAt: groundShadeAt(solidSet) },
      );
      inward.walls.dispose();
      this.host.terrain.addTerrainMesh(new THREE.Mesh(inward.lip, mats.ground));
      const outward = buildShoreGeometry(
        new Set(ring.keys()), [...ring.values()],
        (x, z) => (stoneKeys.has(tileKey(x, z)) ? frames.get(tileKey(x, z)) ?? null : null), 0,
        { min: -STONE_EDGE_MIN, variance: -STONE_EDGE_VAR, round: 0.12, wobble: STONE_EDGE_WOBBLE, y, flatOnly: true, sourceOnly: true, keep, shadeAt: groundShadeAt(solidSet) },
      );
      outward.walls.dispose();
      this.host.terrain.addTerrainMesh(new THREE.Mesh(outward.lip, mats.ground));
    }

  }

  /**
   * A TERRA NUA NÃO ACABA EM ESCADINHA (2026-11-10): a mancha de terra é decidida por tile inteiro, e a beira dela era
   * a escada da grade — degraus retos a 45°. O capim agora MORDE a beira da terra por um contorno orgânico, o mesmo
   * caminho do calçamento (`buildShoreGeometry` deitado, só o beiço): a mancha arredonda, e o grão do capim avança
   * sobre ela em texel inteiro. Só o capim morde (nunca a pedra), e só no nível de cada um.
   */
  public bakeEarthEdges(t: TerrainSort, mats: TerrainMaterials): void {
    const { groundTiles, reliefNear, solidSet } = t;
    const byLevel = new Map<number, Array<{ x: number; z: number; frame: number }>>();
    for (const g of [...groundTiles.filter((g) => reliefLevelAt(g.x, g.z) === 0), ...reliefNear.filter((n) => n.level > 0)]) {
      const level = reliefLevelAt(g.x, g.z);
      const list = byLevel.get(level);
      if (list) list.push(g);
      else byLevel.set(level, [g]);
    }
    for (const [level, floor] of byLevel) {
      const earth = floor.filter((g) => EARTH_FRAMES.has(g.frame));
      if (earth.length === 0) continue;
      const frames = new Map<number, number>();
      for (const g of floor) frames.set(tileKey(g.x, g.z), g.frame);
      const field = this.host.tiles.reliefField;
      const lip = buildShoreGeometry(
        new Set(earth.map((g) => tileKey(g.x, g.z))), earth,
        (x, z) => (frames.get(tileKey(x, z)) === GROUND_TILE_FRAME ? GROUND_TILE_FRAME : null), 0,
        {
          min: 0.05, variance: 0.3, round: 0.2, wobble: 2.4, y: level * RELIEF_HEIGHT + STONE_LIP_Y, flatOnly: true,
          keep: (px, pz) => !field || field(px, pz) === level, shadeAt: groundShadeAt(solidSet),
        },
      );
      lip.walls.dispose();
      this.host.terrain.addTerrainMesh(new THREE.Mesh(lip.lip, mats.ground));
    }
  }
}
