// O QUE SE ERGUE DO TERRENO: a bacia de lava e o poço da escada, a decoração rasteira, as árvores e os cubos, a névoa
// negra de fora do mapa, e as sombras assadas (o blob de cada sólido e os campos instanciados do fogo e da lua).

import * as THREE from 'three';
import { DUNGEON_TILES } from '@/game/constants';
import { RELIEF_HEIGHT, reliefLevelAt } from '@/game/world/relief';
import { isLifeHome } from '@/game/world/biomeLife';
import { ANCIENT_GROVE, BIOME_DECOR, biomeTreeTintAt } from '@/game/world/biomes';
import { SolidCastField } from '../CastShadow3D';
import { buildShadowBlobGeometry } from '../groundShadow';
import { getBaseTexture3D } from '../textures3d';
import { bucketKey, buildBankGeometry, buildFlatTileGeometry, groundTintAt, buildLavaSurface, buildScorchGeometry, buildShoreGeometry, buildUprightTileGeometry, CLIFF_WALL_SET, DUNGEON_WALL_SET, LAVA_BANK_BANDS, LAVA_DEPTH_TILES, LAVA_RIM_TINT, tileKey, WIND_STIR_FRAMES } from '../terrainGeometry';
import { buildMistCurtainGeometry, type MistUniforms } from '../glowMaterials';
import type { TerrainMaterials } from '../terrainMaterials';
import type { TerrainTile, TerrainSort } from './TerrainSorter';
import type { World3D } from '../World3D';
import { CAST_POOL_MAX } from './worldDefs';
import { decorScatterAt, decorShown } from './decorScatter';

// A altura da CORTINA de névoa. As árvores medem 1; 1.3 cobre a copa com folga, para nenhuma
// ponta de pinheiro furar a névoa por cima.
const VOID_MIST_HEIGHT = 1.3;
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
// O VAGA-LUME MORA NO MATO. Estes são os frames de decoração que contam como vegetação viva —
// capim, folhagem, o arbusto florido e os cogumelos —, e deliberadamente NÃO a serrapilheira
// (graveto, seixo, osso): um enxame precisa dizer "aqui é verde", e piscar sobre cascalho não diz
// nada. É o mesmo atlas que o editor pinta, então plantar mato numa carta (ver
// scripts/enrich-chunk-cards.mjs) povoa a carta de vaga-lume sem tocar em código.
const FIREFLY_HOST_FRAMES: ReadonlySet<number> = new Set([
  0, 1, 7, 8, 10, 11, 19, 20,
  // a flora dos biomas que é planta (cristal, brasa e folha caída não seguram vaga-lume)
  BIOME_DECOR.fern, BIOME_DECOR.mossBloom, BIOME_DECOR.wheat, BIOME_DECOR.daisies, BIOME_DECOR.poppies,
  BIOME_DECOR.bluebells, BIOME_DECOR.clover, ANCIENT_GROVE.bush, ANCIENT_GROVE.grass,
]);

/** O que TerrainFeatures usa de World3D. */
export type TerrainFeaturesHost = Pick<World3D,
  'mirror' | 'params' | 'scene' | 'terrain' | 'tiles'
>;

export class TerrainFeatures {
  public constructor(private readonly host: TerrainFeaturesHost) {}

  public bakeLavaAndPit(t: TerrainSort, mats: TerrainMaterials, groundFrame: ReadonlyMap<number, number>): void {
    const { lavaBedTiles, pitTiles, pitSet, solidSet } = t;
    // The lava basin: the same recipe, shallower — a dropped bed to close the well's bottom and
    // dark CHARRED banks (near-black basalt) walling it where the melt meets the land.
    if (lavaBedTiles.length > 0) {
      this.host.terrain.addTerrainMesh(new THREE.Mesh(
        buildFlatTileGeometry(lavaBedTiles, -LAVA_DEPTH_TILES, solidSet), mats.ground,
      ));
      const lavaKeys = new Set(lavaBedTiles.map((t) => tileKey(t.x, t.z)));
      // A MESMA MARGEM DA ÁGUA, mais funda e mais larga: um poço de um tile precisa de curva dentro dele.
      const lavaShore = buildShoreGeometry(
        lavaKeys, lavaBedTiles, (x, z) => groundFrame.get(tileKey(x, z)) ?? null, LAVA_DEPTH_TILES,
        {
          // a beira ondula mais e as quinas arredondam mais (2026-11-10): o lago lia como um retângulo de tiles
          min: 0.03, variance: 0.45, round: 0.22, corner: 0.8, wobble: 2.6, bands: LAVA_BANK_BANDS, mud: 0x2a1006,
          lipTint: LAVA_RIM_TINT,
        },
      );
      this.host.terrain.addTerrainMesh(new THREE.Mesh(lavaShore.lip, mats.bank));
      this.host.terrain.addTerrainMesh(new THREE.Mesh(lavaShore.walls, mats.lavaBank));
      this.host.terrain.addTerrainMesh(new THREE.Mesh(buildLavaSurface(lavaKeys, lavaBedTiles), mats.lava));
      this.host.terrain.addTerrainMesh(new THREE.Mesh(buildScorchGeometry(lavaKeys, lavaBedTiles), mats.bank));
    }

    // O POÇO DA ESCADA: o mesmo leito afundado + paredes do rio, com UMA diferença que é a peça
    // toda — ele não é iluminado. Um canal de rio é uma superfície ao ar livre e recebe a luz do
    // mundo; um poço é a AUSÊNCIA de chão, e a lição nº 3 da StairsObject já tinha medido o que
    // acontece quando se tenta pintar isso com um material iluminado: a caixa escura soma a
    // ambiente quente, vira lama, e CLAREIA junto com o dia e com a tocha na mão — o oposto de um
    // buraco. `pit` é `MeshBasicMaterial`, então o fundo e as paredes são o mesmo preto ao
    // meio-dia, à meia-noite e sob a tocha. É esta a sombra escura que mora dentro do buraco.
    if (pitTiles.length > 0) {
      this.host.terrain.addTerrainMesh(new THREE.Mesh(
        buildFlatTileGeometry(pitTiles, -STAIRS_PIT_DEPTH, solidSet), mats.pitFloor,
      ));
      this.host.terrain.addTerrainMesh(new THREE.Mesh(
        buildBankGeometry(pitSet, pitTiles, STAIRS_PIT_DEPTH), mats.pit,
      ));
      for (const t of pitTiles) this.host.tiles.sunkenTiles.add(tileKey(t.x, t.z));
    }

  }

  public bakeDecor(t: TerrainSort, mats: TerrainMaterials): void {
    const { solidSet } = t;
    // TOUCEIRA E CLAREIRA (ver decorScatter.ts): o enchimento rareia onde o ruído largo abre o chão. Só no desenho —
    // o tile continua com a decoração no dado, e o que o jogo faz com ele não muda.
    const decorTiles = t.decorTiles.filter((d) => decorShown(d.x, d.z, d.frame));
    // A decoracao do PLANALTO sobe com ele: a mesma malha (o indice dos quads e o do arbusto que
    // farfalha), so a altura de cada quad muda.
    this.host.tiles.decorGeo = buildFlatTileGeometry(
      decorTiles, (x, z) => 0.02 + reliefLevelAt(x, z) * RELIEF_HEIGHT, solidSet, undefined,
      (frame) => (WIND_STIR_FRAMES.has(frame) ? 1 : 0),
      // a decoração leva a cor INTEIRA do bioma, a mesma do chão: a rampa (render3d/biomeRamp.ts) só a aplica na
      // folha, então o tufo é do mesmo verde do chão em que nasce e a flor mantém a cor dela (a margarida continua
      // branca, a campânula continua azul). Antes era metade da cor em tudo, e o tufo destoava do chão. A mesma mancha
      // larga e a mesma sombra de copa do chão (groundTintAt), para o tufo não destoar da mancha em que nasce.
      groundTintAt(solidSet),
      // …e cada planta anda um pouco dentro do tile e varia um fio de tom (ver decorScatter.ts)
      decorScatterAt,
    );
    this.host.terrain.addTerrainMesh(new THREE.Mesh(this.host.tiles.decorGeo, mats.decor));
    decorTiles.forEach((tile, i) => {
      this.host.tiles.decorQuads.set(`${tile.x},${tile.z}`, i * 4);
      if (tile.frame === LOW_GRASS_TILE) this.host.tiles.grassQuads.set(`${tile.x},${tile.z}`, i * 4);
      // Onde o enxame de vaga-lumes pode pousar. Sai da MESMA varredura da decoração porque é a
      // mesma pergunta ("que tile é verde?"): um segundo passo sobre o mundo seria uma segunda
      // resposta, livre para discordar.
      // E só onde eles moram (world/biomeLife): a geada e o musgo. A luz que vem de todo canto polui a noite.
      if (FIREFLY_HOST_FRAMES.has(tile.frame) && isLifeHome('fireflies', tile.x, tile.z)) this.host.tiles.greenTiles.push(tile.x, tile.z);
    });

  }

  public bakeSolids(t: TerrainSort, mats: TerrainMaterials): void {
    const { solidSet } = t;
    // A alvenaria de dungeon e a MONTANHA saem da malha dos quads e viram CUBO (ver
    // buildTileCubeGeometry). Elas sao separadas por dois motivos: um bloco macico precisa de
    // espessura para ler como bloco macico, e o quad continua sendo o que uma ARVORE
    // e: uma silhueta, sem lado.
    // O FRAME DA TOCHA NÃO CHEGA AO CUBO: ele é um MARCADOR, e a peça é um objeto.
    //
    // O frame 48 traz uma tocha PINTADA na alvenaria, e um cubo veste o mesmo frame no teto e nas
    // três laterais podadas. Isso dava duas coisas erradas de uma vez: uma tocha numa quina
    // aparecia pintada em três faces com chama viva em UMA, e mesmo na parede reta ficavam duas
    // chamas no mesmo tile — a do desenho e a do `WallTorchObject` por cima dela. Aqui o tile
    // volta a ser muro liso (a variante é sorteada pela coordenada, para a fileira não repetir o
    // mesmo tijolo), e a tocha inteira — copo, chama, halo — passa a ser desenhada pelo objeto,
    // na face certa e uma vez só. O que o autor pinta no `/editor` continua sendo o 48.
    const wallCubes = this.host.tiles.solidTiles.filter((t) => DUNGEON_WALL_SET.has(t.frame)).map(
      (t) => (t.frame === DUNGEON_TILES.wallTorch
        ? { ...t, frame: DUNGEON_TILES.walls[Math.abs(t.x * 7 + t.z * 13) % DUNGEON_TILES.walls.length] }
        : t),
    );
    const rockCubes = this.host.tiles.solidTiles.filter((t) => CLIFF_WALL_SET.has(t.frame));
    const quadTiles = wallCubes.length > 0 || rockCubes.length > 0
      ? this.host.tiles.solidTiles.filter((t) => !DUNGEON_WALL_SET.has(t.frame) && !CLIFF_WALL_SET.has(t.frame))
      : this.host.tiles.solidTiles;

    // All standing trees/walls merged into ONE upright mesh (one draw call, one shadow).
    // Lit like the ground at their feet — same treatment the dynamic billboards get.
    // TODA árvore fica no centro exato do seu tile — a de dentro do mapa e a de fora igualmente.
    //
    // Houve aqui um desvio de profundidade por tile na mata de fora, para as fileiras não lerem
    // como pomar. Foi erro de leitura: **o mundo é uma grade, e a grade é o desenho.** Uma árvore
    // fora do centro do tile não lê como floresta natural, lê como peça solta — e desmente a única
    // coisa que todo tile deste jogo promete: que ali cabe exatamente um. A variedade da mata vem
    // dos SEIS frames de pinheiro, que é variação DENTRO do tile, e da névoa por cima.
    this.host.terrain.addTerrainMesh(new THREE.Mesh(buildUprightTileGeometry(quadTiles, (x, z) => reliefLevelAt(x, z) * RELIEF_HEIGHT, biomeTreeTintAt), mats.trees));

    // Quem é CUBO é MASSA. As duas listas ficam guardadas porque a massa é a única geometria do
    // mundo que se REFAZ inteira quando um tile some (a bomba na parede rachada): a poda de faces
    // de um cubo depende dos VIZINHOS, então tirar um bloco no meio de um maciço reabre faces em
    // volta dele — colapsar só o buraco deixaria o vão transparente por trás. Ver rebuildCubes.
    this.host.tiles.wallCubes = wallCubes;
    this.host.tiles.rockCubes = rockCubes;
    // …e as malhas delas nascem no FIM do build (ver o fecho de buildTerrain): a barra de sombra
    // sai junto, e ela precisa do `sunkenTiles` inteiro para não flutuar sobre o rio.

    // Only EXPOSED solids (clearing edges, lone trees) get a grounding blob and cast a
    // shadow. A tile buried in the forest wall has ~all 8 neighbours solid; giving each
    // one a blob/shadow merges them into a dark block hugging the wall (user feedback),
    // and a packed tree reads as a mass anyway. Keep the ones with open space around them.
    for (const t of this.host.tiles.solidTiles) {
      let neighbours = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dz) && solidSet.has(tileKey(t.x + dx, t.z + dz))) neighbours++;
        }
      }
      if (neighbours <= 4) this.host.tiles.castableSolids.push(t);
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
    for (const t of this.host.tiles.solidTiles) {
      const bk = bucketKey(t.x, t.z);
      const bucket = this.host.tiles.solidBuckets.get(bk);
      if (bucket) bucket.push(t);
      else this.host.tiles.solidBuckets.set(bk, [t]);
    }
  }

  public bakeMistAndShadows(t: TerrainSort, mats: TerrainMaterials, wetTiles: readonly TerrainTile[]): void {
    const { b, voidTiles, lavaBedTiles } = t;
    // A NÉVOA NEGRA sobre a mata de fora (só na superfície — ver makeVoidMistMaterial): uma
    // CORTINA em pé por tile, no mesmo plano das árvores, um pouco mais alta que a copa. Uma
    // malha, um draw, e a rampa inteira mora no shader.
    if (voidTiles.length > 0) {
      const mist = new THREE.Mesh(
        buildMistCurtainGeometry(voidTiles, (x, z) => reliefLevelAt(x, z) * RELIEF_HEIGHT + VOID_MIST_HEIGHT),
        mats.voidMist,
      );
      mist.renderOrder = 4; // depois da poça de fogo e do blob: a névoa cobre o que vier antes
      const u = mats.voidMist.userData.mist as MistUniforms;
      // O retângulo é a BORDA do mundo, não o centro do último tile: um tile em `x` ocupa
      // [x-0.5, x+0.5], então meio tile de folga de cada lado é o que faz a rampa começar em
      // zero exatamente onde o chão autorado acaba.
      u.rect.value.set(b.minTileX - 0.5, b.minTileY - 0.5, b.maxTileX + 0.5, b.maxTileY + 0.5);
      u.depth.value = this.host.params.voidMist;
      this.host.terrain.addTerrainMesh(mist);
    }

    for (const t of wetTiles) {
      this.host.tiles.sunkenTiles.add(tileKey(t.x, t.z));
      this.host.mirror.addWaterTile(t.x, t.z);
    }
    for (const t of lavaBedTiles) this.host.tiles.sunkenTiles.add(tileKey(t.x, t.z));

    // The soft ambient ground blob each obstacle had in 2D ("anchors lifted obstacles so
    // they read as standing up") — merged into one mesh, all sharing the soft blob texture.
    // A touch of forward (+z, toward camera) bias peeks the blob out at the tree's foot.
    const blobGeo = buildShadowBlobGeometry(
      this.host.tiles.castableSolids.map((t) => ({ x: t.x, z: t.z + 0.06, lift: reliefLevelAt(t.x, t.z) * RELIEF_HEIGHT })), 0.46, 0.42,
    );
    const ellipses = new THREE.Mesh(blobGeo, mats.blob);
    ellipses.renderOrder = 3; // after the additive fire glow, so the blob isn't washed out
    this.host.terrain.addTerrainMesh(ellipses);

    // …and the firelight shadow each of them THROWS, all of it in one draw. It used to be one mesh
    // per solid — 36 of the frame's 120 draw calls, and with them the bulk of its garbage, since
    // three allocates inside its uniform setters and the GC bill tracks the draw count.
    // Fixed capacity, so a streaming re-bake keeps the same field (and the same draw).
    if (!this.host.tiles.solidCastField) {
      this.host.tiles.solidCastField = new SolidCastField(CAST_POOL_MAX, getBaseTexture3D('forest-tileset'));
      this.host.scene.add(this.host.tiles.solidCastField.mesh);
    }

    // …and the MOON shadow each of them throws, likewise one draw — but this one is baked
    // ONCE, not refilled per frame: the moon never moves, so neither do these. Sized to hold
    // every castable solid in the world; only the on-screen fragments cost anything.
    //
    // An InstancedMesh cannot grow, and a streaming window's count changes with every re-bake —
    // so once a window has been re-baked the field is over-allocated with headroom and kept,
    // instead of allocating a new one (and a new draw) every time the hero crosses a chunk.
    const needed = Math.max(1, this.host.tiles.castableSolids.length);
    if (!this.host.tiles.moonCastField || needed > this.host.tiles.moonFieldCapacity) {
      this.host.tiles.moonCastField?.mesh.removeFromParent();
      this.host.tiles.moonFieldCapacity = this.host.tiles.terrainBakes > 1
        ? Math.ceil(needed * 1.5) // already streaming: leave room for the next, denser window
        : needed;
      this.host.tiles.moonCastField = new SolidCastField(this.host.tiles.moonFieldCapacity, getBaseTexture3D('forest-tileset'));
      this.host.scene.add(this.host.tiles.moonCastField.mesh);
    }
  }
}
