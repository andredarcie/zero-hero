// O ASSADO DO TERRENO: a ordem dos passos (TerrainSorter, TerrainGround, TerrainFeatures), os cubos que se refazem
// quando um bloco cai, o re-assado do modo explorador, e as mudanças pontuais (a decoração arrancada, o rio vazio).

import * as THREE from 'three';
import { RELIEF_HEIGHT, reliefLevelAt } from '@/game/world/relief';
import { bakedShadowAlpha, bakedShadowLength, WIDTH_FACTOR as CAST_WIDTH_FACTOR } from '../CastShadow3D';
import { buildVineGeometry } from '../vineTexture';
import { getBaseTexture3D } from '../textures3d';
import { solidCastArt } from './SolidCastEmitter';
import { buildFlatTileGeometry, buildMassHeightGrid, buildReliefContourGeometry, buildStairGeometry, buildTileCubeGeometry, collapseQuad, isMassFrame, shapeRock, tileKey } from '../terrainGeometry';
import { makeTerrainMaterials, type TerrainMaterials } from '../terrainMaterials';
import type { SolidTileEntry } from './TerrainData';
import { StandingDecor } from './StandingDecor';
import type { World3D } from '../World3D';
import { MIN_CAST_LEN } from './worldDefs';

/** O que TerrainBaker usa de World3D. */
export type TerrainBakerHost = Pick<World3D,
  'appliedMoonShadow' | 'camTarget' | 'elapsed' | 'emit' | 'features' | 'ground' | 'mirror' | 'moonCastRotY' | 'moonDimmed' | 'params' | 'probe'
  | 'scene' | 'shadows' | 'sorter' | 'tiles'
>;

export class TerrainBaker {
  public constructor(private readonly host: TerrainBakerHost) {}

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
    for (const mesh of this.host.tiles.terrainMeshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    this.host.tiles.terrainMeshes.length = 0;
    this.host.tiles.solidTiles.length = 0;
    this.host.tiles.castableSolids.length = 0;
    this.host.tiles.massTiles.length = 0;
    this.host.tiles.massHeight.clear();
    this.host.tiles.reliefTiles = [];
    this.host.tiles.reliefField = undefined;
    this.host.tiles.massGrid = null;
    this.host.tiles.stairTiles = [];
    this.host.tiles.lavaSpots.length = 0;
    this.host.tiles.greenTiles.length = 0; // as moitas da janela velha não existem mais
    this.host.tiles.solidBuckets.clear();
    this.host.tiles.sunkenTiles.clear();
    this.host.mirror.clearWater();
    this.host.tiles.riverQuads.clear();
    this.host.tiles.riverSurfaceGeo = undefined;
    // Both caches are keyed on tiles that no longer exist.
    this.host.probe.fireCastLists.clear();
    this.host.probe.fireListRadius = -1;
    this.buildTerrain();
  }

  public buildTerrain(): void {
    this.host.tiles.terrainBakes += 1;
    const t = this.host.sorter.sortTerrain();
    if (!this.host.tiles.terrainMats) this.host.tiles.terrainMats = makeTerrainMaterials(getBaseTexture3D('forest-tileset'));
    const mats = this.host.tiles.terrainMats;
    // A serra vem ANTES do chão: um tile alto com a quina mordida precisa do chão de baixo por inteiro, e o contorno
    // devolve a `groundTiles` as bases que ele não cobre.
    this.host.ground.bakeRelief(t, mats);
    const groundFrame = new Map<number, number>();
    for (const g of t.groundTiles) groundFrame.set(tileKey(g.x, g.z), g.frame);
    const wetTiles = this.host.ground.bakeGroundAndWater(t, mats, groundFrame);
    this.host.ground.bakeStoneEdges(t, mats);
    this.host.ground.bakeEarthEdges(t, mats);
    this.host.features.bakeLavaAndPit(t, mats, groundFrame);
    // A DECORAÇÃO não deita: só o chão puro fica no chão, e o resto fica em pé (render3d/standingDecor.ts).
    const decor = this.host.features.bakeDecor(t);
    this.host.tiles.standing ??= new StandingDecor({
      addMesh: (mesh) => this.addTerrainMesh(mesh),
      actors: () => this.host.mirror?.actorBodies ?? [],
      focus: () => this.host.camTarget,
      stand: () => this.host.params.stand,
      now: () => this.host.elapsed,
    });
    this.host.tiles.standing.bake(decor, t.solidSet, mats.standing, mats.standingFront);
    this.host.features.bakeSolids(t, mats);
    this.host.features.bakeMistAndShadows(t, mats, wetTiles);
    this.fillMoonCastField();
    this.rebuildCubes(mats);
  }

  /**
   * As malhas de CUBO (alvenaria de dungeon, montanha) e a sombra que elas projetam.
   *
   * Ela refaz as duas INTEIRAS em vez de remendar um tile, e isso é de propósito: a geometria de um
   * cubo é PODADA pelos vizinhos (uma face só nasce onde o vizinho não é bloco), então tirar um
   * bloco do meio de um maciço reabre faces em três vizinhos ao mesmo tempo. Remendar só o buraco
   * deixaria um vão com o interior dos vizinhos virado para fora, e o backface culling o mostraria
   * vazado.
   *
   * O custo é uma vez por bloco derrubado (a bomba na parede rachada), sobre ~1.200 cubos: alguns
   * milissegundos, num frame que já parou para uma explosão.
   */
  private rebuildCubes(mats: TerrainMaterials): void {
    for (const mesh of this.host.tiles.cubeMeshes) {
      const i = this.host.tiles.terrainMeshes.indexOf(mesh);
      if (i >= 0) this.host.tiles.terrainMeshes.splice(i, 1);
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    this.host.tiles.cubeMeshes.length = 0;

    const push = (mesh: THREE.Mesh): void => {
      this.host.tiles.cubeMeshes.push(mesh);
      this.addTerrainMesh(mesh);
    };
    if (this.host.tiles.wallCubes.length > 0) {
      const cubeSet = new Set(this.host.tiles.wallCubes.map((t) => tileKey(t.x, t.z)));
      push(new THREE.Mesh(
        buildTileCubeGeometry(this.host.tiles.wallCubes, (x, z) => cubeSet.has(tileKey(x, z))),
        [mats.wallTop, mats.solid], // grupo 0 = teto preto, grupo 1 = as faces de tijolo
      ));
    }
    // A MONTANHA, pelo mesmo caminho e com duas diferencas: o teto e ROCHA iluminada (uma
    // montanha vista de cima e um planalto, nao o vazio entre duas salas) e as faces vem
    // sombreadas no vertice, que e de onde o volume vem quando a luz e sempre de cima.
    const stairSet = new Set(this.host.tiles.stairTiles.map((t) => tileKey(t.x, t.z)));
    const rock = this.host.tiles.rockCubes.length > 0
      ? shapeRock(this.host.tiles.rockCubes, (x, z) => this.host.tiles.sunkenTiles.has(tileKey(x, z)) || stairSet.has(tileKey(x, z)) || reliefLevelAt(x, z) > 0)
      : null;
    if (rock) {
      // O topo da montanha é PEDRA, não chão: fica sem a cor do bioma e sem a sombra de canto (a pedra conta a si
      // mesma como obstáculo e escureceria inteira). O `whole` só leva o que está no alto — o chão em volta já é
      // desenhado pelo terreno, e por cima dele saía uma segunda camada branca.
      const contour = buildReliefContourGeometry(rock.near, rock.frameOf, rock.field, rock.levelAt, stairSet, rock.blocked);
      push(new THREE.Mesh(contour.tops, mats.ground));
      push(new THREE.Mesh(contour.walls, mats.rock));
      if (contour.vines.length > 0) push(new THREE.Mesh(buildVineGeometry(contour.vines), mats.vines));
      const highWhole = contour.whole.filter((t) => rock.levelAt(t.x, t.z) > 0);
      if (highWhole.length > 0) {
        push(new THREE.Mesh(buildFlatTileGeometry(highWhole, (x, z) => rock.levelAt(x, z) * RELIEF_HEIGHT), mats.ground));
      }
    }

    // A escada. A pedra da serra sai pelo contorno, em buildTerrain: ela não muda com a bomba.
    if (this.host.tiles.stairTiles.length > 0) push(new THREE.Mesh(buildStairGeometry(this.host.tiles.stairTiles), mats.stair));

    // Os maciços entram na MESMA lista de sombra de propósito: um muro de dungeon, uma montanha e
    // o planalto da serra são a mesma geometria, e dar a cada um a sua resposta seria a segunda voz.
    // Toda a serra projeta, a de fora do mapa também: é da sombra dela que a borda do mundo vive.
    this.host.tiles.massTiles = [...this.host.tiles.wallCubes, ...this.host.tiles.rockCubes];
    this.host.tiles.massHeight.clear();
    for (const t of this.host.tiles.massTiles) this.host.tiles.massHeight.set(tileKey(t.x, t.z), rock?.levelAt(t.x, t.z) || 1);
    const stairKeys = new Set(this.host.tiles.stairTiles.map((t) => tileKey(t.x, t.z)));
    this.host.tiles.massGrid = buildMassHeightGrid(
      [...this.host.tiles.massTiles, ...this.host.tiles.reliefTiles],
      (x, z) => this.host.tiles.massHeight.get(tileKey(x, z)) ?? 0,
      reliefLevelAt,
      this.host.tiles.reliefField,
      (x, z) => this.host.tiles.sunkenTiles.has(tileKey(x, z)) || stairKeys.has(tileKey(x, z)),
      rock,
    );
    this.host.shadows.rebuildMassShadow();
  }

  /** Every terrain mesh goes through here, so a re-bake can take them all back out again. */
  public addTerrainMesh(mesh: THREE.Mesh): void {
    this.host.scene.add(mesh);
    this.host.tiles.terrainMeshes.push(mesh);
    // O que fica EM PÉ aparece na água (WaterMirror): a mata, a pedra, a serra, a escada, a decoração da margem. O
    // chão não: visto de baixo ele é verso, e a água não se reflete em si mesma.
    const mats = this.host.tiles.terrainMats;
    const m = mesh.material;
    if (mats && (Array.isArray(m) || m === mats.trees || m === mats.solid || m === mats.rock || m === mats.stair || m === mats.standing)) {
      this.host.mirror.addScenery(mesh);
    }
  }

  /**
   * O tile de rio ESVAZIOU (a comporta abriu): a superfície dele some da malha assada e o leito
   * aparece embaixo. Os quatro vértices dobram num ponto — o mesmo truque do capim cavado
   * (removeDecorTile): nada realoca, e o tile some no quadro em que a onda do esvaziamento chega.
   */
  public drainRiverSurface(worldX: number, worldY: number): void {
    const key = tileKey(worldX, worldY);
    const start = this.host.tiles.riverQuads.get(key);
    if (start === undefined || !this.host.tiles.riverSurfaceGeo) return;
    this.host.tiles.riverQuads.delete(key);
    collapseQuad(this.host.tiles.riverSurfaceGeo, start);
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
  public fillMoonCastField(): void {
    const alpha = bakedShadowAlpha(this.host.params.moonShadowAlpha);
    const length = bakedShadowLength(this.host.params.moonShadowLength);
    const field = this.host.tiles.moonCastField;
    field.begin();
    if (alpha > 0.02) {
      for (const tile of this.host.tiles.castableSolids) {
        tile.moonSlot = undefined;
        // O CUBO NÃO ENTRA AQUI. Alvenaria e montanha são MASSA, e a sombra delas é a barra
        // assada em `rebuildMassShadow`: uma silhueta esticada por tile é o que fazia o muro da
        // dungeon largar um losango por tile no chão (o relato do autor). Uma árvore continua
        // vindo por aqui, que é para o que este campo foi feito — ela é um objeto solto, e a
        // silhueta dela é o desenho da copa.
        if (isMassFrame(tile.frame)) continue;
        // A silhueta é a da árvore que se VÊ: sai do pé dela (fora do centro do tile), recortada da forma que ela
        // veste, e uma árvore alta deita uma sombra do dobro do comprimento (ver solidCastArt).
        const art = solidCastArt(tile);
        const reach = length * art.height;
        // A sombra deita no chão da árvore e para na beira dele: passar dali é flutuar no ar.
        const clamped = this.host.emit.clampCastAtSunken(tile.x, tile.z, this.host.moonCastRotY, reach);
        field.add(
          art.x, art.z, art.uv,
          CAST_WIDTH_FACTOR, clamped >= MIN_CAST_LEN ? clamped : reach, this.host.moonCastRotY, alpha,
          art.footPad,
          tile, // handed back below with the slot the sort assigned — the handoff's handle
          reliefLevelAt(tile.x, tile.z) * RELIEF_HEIGHT,
        );
      }
    }
    field.end(0, 1e6, (ref, slot) => { (ref as SolidTileEntry).moonSlot = slot; });
    // A re-bake rewrote every instance's alpha, so nothing is dimmed any more.
    this.host.moonDimmed.length = 0;
    this.host.appliedMoonShadow.alpha = alpha;
    this.host.appliedMoonShadow.length = length;
    this.host.appliedMoonShadow.rotY = this.host.moonCastRotY;
  }

  /**
   * Erase one decor tile — the shovel turning the soil under a dug hole. All decor stands
   * (StandingDecor.clearTile folds its quad onto a point and kills its rustle; nothing
   * reallocates). Caller also clears the tile in the chunk data — a later rebake reads from
   * there, not from this mesh.
   */
  public removeDecorTile(worldX: number, worldY: number): void {
    this.host.tiles.standing?.clearTile(worldX, worldY);
  }
}
