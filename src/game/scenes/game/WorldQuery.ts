// AS PERGUNTAS AO MAPA: que peça está num tile (fogueira, pedra, porta...), se ele bloqueia quem anda, se é água
// aberta, árvore viva, chão livre para a natureza ou para rebrotar.

import { CHUNK_COLUMNS, CHUNK_ROWS, TREE_UPPER_FRAMES, SEA_TILE_FRAMES } from '@/game/constants';
import type { Surface } from '@/game/audio/materials';
import { isDecorKind } from '@/game/entities/ItemPickup';
import { CampfireObject } from '@/game/objects/CampfireObject';
import { DryBushObject } from '@/game/objects/DryBushObject';
import { DryTreeObject } from '@/game/objects/DryTreeObject';
import { DryShrubObject } from '@/game/objects/DryShrubObject';
import { LavaObject } from '@/game/objects/LavaObject';
import { WaterObject } from '@/game/objects/WaterObject';
import { LockedDoorObject } from '@/game/objects/LockedDoorObject';
import { SwingGateObject } from '@/game/objects/SwingGateObject';
import { RockObject } from '@/game/objects/RockObject';
import { TallGrassObject } from '@/game/objects/TallGrassObject';
import { PlantSpotObject } from '@/game/objects/PlantSpotObject';
import { ToolboxObject } from '@/game/objects/ToolboxObject';
import { MoonflowerObject } from '@/game/objects/MoonflowerObject';
import { FurnaceObject } from '@/game/objects/FurnaceObject';
import { AltarObject } from '@/game/objects/AltarObject';
import type { WorldProp } from '@/game/objects/WorldProp';
import { isMushroomKind } from '@/game/fungi/fungi';
import { getOccupiedTiles } from '@/game/world/WorldData';
import { isBareTreeAt } from '@/game/world/biomes';
import type { GameScene } from '../GameScene';

/** O que WorldQuery usa de GameScene. */
export type WorldQueryHost = Pick<GameScene,
  'camp' | 'chunkManager' | 'itemManager' | 'marks' | 'npcManager' | 'playerWorld' | 'props' | 'questSetup'
  | 'roasted' | 'swordPlanting' | 'valley'
>;

export class WorldQuery {
  /** Os tiles ocupados por objetos do mapa (fixos: lidos uma vez), para a natureza não nascer em cima deles. */
  private propTiles?: Set<string>;

  public constructor(private readonly host: WorldQueryHost) {}

  // A busca posicional dita UMA vez; os getters tipados abaixo são a superfície que o resto
  // da cena usa (cada um devolve o tipo concreto do seu sistema).
  /** O funil por onde passam colisao, tiro, ocupacao, instalacao e recolhimento. */
  public propAt<T extends WorldProp>(list: T[], wx: number, wy: number): T | undefined {
    return list.find((p) => p.worldX === wx && p.worldY === wy);
  }

  public getCampfireAt(wx: number, wy: number): CampfireObject | undefined {
    return this.propAt(this.host.props.campfires, wx, wy);
  }

  /** Onde se senta e se dorme: toda fogueira comum e, depois dos creditos, tambem a do fim. */
  public getRestFireAt(wx: number, wy: number): CampfireObject | undefined {
    return this.getCampfireAt(wx, wy) ?? (this.host.roasted ? this.getHearthAt(wx, wy) : undefined);
  }

  public getDryBushAt(wx: number, wy: number): DryBushObject | undefined {
    return this.propAt(this.host.props.dryBushes, wx, wy);
  }

  /** A porta trancada deste tile — as portas comuns e o portão do jardim alto, que também abre com a chave. */
  public getLockedDoorAt(wx: number, wy: number): LockedDoorObject | undefined {
    return this.propAt(this.host.props.lockedDoors, wx, wy) ?? this.propAt(this.host.props.gardenGates, wx, wy);
  }

  public getSwingGateAt(wx: number, wy: number): SwingGateObject | undefined {
    return this.propAt(this.host.props.swingGates, wx, wy);
  }

  /** Tudo o que ocupa este tile MENOS o próprio herói — parede, prop, item caído. */
  /**
   * Chão livre para a natureza (flor, cogumelo, poça, bicho pousando): dentro do mapa, sem parede, sem água, sem
   * item, e sem nenhum objeto do mapa no tile (pedra, capim alto, flor-da-lua, moita...).
   */
  public isNatureFree(wx: number, wy: number): boolean {
    const chunks = this.host.chunkManager;
    if (!chunks || !chunks.hasChunkCoordinate(Math.floor(wx / CHUNK_COLUMNS), Math.floor(wy / CHUNK_ROWS))) return false;
    this.propTiles ??= getOccupiedTiles();
    return !this.propTiles.has(`${wx},${wy}`) && !this.isTileTaken(wx, wy) && !this.isOpenWaterAt(wx, wy);
  }

  /** Uma árvore do mapa (tile), viva — a que o bioma veste de árvore morta não conta (world/biomes). */
  public isLiveTileTree(wx: number, wy: number): boolean {
    const chunks = this.host.chunkManager;
    if (!chunks || !chunks.hasChunkCoordinate(Math.floor(wx / CHUNK_COLUMNS), Math.floor(wy / CHUNK_ROWS))) return false;
    const { upper } = chunks.getTile(wx, wy);
    return upper !== null && TREE_UPPER_FRAMES.has(upper) && !isBareTreeAt(upper, wx, wy);
  }

  public isTileTaken(wx: number, wy: number): boolean {
    return this.isSolidForEntities(wx, wy)
      || (this.host.itemManager?.hasItemAt(wx, wy) ?? false);
  }

  /**
   * Ha ALGUMA COISA neste tile? Nao "e solido" — solido e o que barra um corpo, e isto aqui e a
   * pergunta mais ampla: tem qualquer coisa ocupando o lugar.
   *
   * O portão de bater só pode girar para um tile vazio. Um item caído no chão não é sólido — o
   * herói anda por cima dele —, mas ainda ocupa o lugar para esse gesto.
   */
  public isTileOccupied(wx: number, wy: number): boolean {
    return this.isTileTaken(wx, wy)
      || (wx === this.host.playerWorld.worldX && wy === this.host.playerWorld.worldY);
  }

  public getDryTreeAt(wx: number, wy: number): DryTreeObject | undefined {
    return this.propAt(this.host.props.dryTrees, wx, wy);
  }

  public getDryShrubAt(wx: number, wy: number): DryShrubObject | undefined {
    return this.propAt(this.host.props.dryShrubs, wx, wy);
  }

  public getRockAt(wx: number, wy: number): RockObject | undefined {
    return this.propAt(this.host.props.rocks, wx, wy);
  }

  public getTallGrassAt(wx: number, wy: number): TallGrassObject | undefined {
    return this.propAt(this.host.props.tallGrasses, wx, wy);
  }

  public getMoonflowerAt(wx: number, wy: number): MoonflowerObject | undefined {
    return this.propAt(this.host.props.moonflowers, wx, wy);
  }

  public getToolboxAt(wx: number, wy: number): ToolboxObject | undefined {
    return this.propAt(this.host.props.toolboxes, wx, wy);
  }

  public getFurnaceAt(wx: number, wy: number): FurnaceObject | undefined {
    return this.propAt(this.host.props.furnaces, wx, wy);
  }

  public getPlantSpotAt(wx: number, wy: number): PlantSpotObject | undefined {
    return this.propAt(this.host.props.plantSpots, wx, wy);
  }

  public getLavaAt(wx: number, wy: number): LavaObject | undefined {
    return this.propAt(this.host.props.lavaTiles, wx, wy);
  }

  public getWaterAt(wx: number, wy: number): WaterObject | undefined {
    return this.propAt(this.host.props.waterTiles, wx, wy);
  }

  /**
   * AGUA ABERTA — a agua que ainda e agua: onde o balde enche e de onde vem o som do lago.
   *
   * Ela tem DUAS procedencias neste jogo, e essa e a pegadinha: o `water` PROP (WaterObject), o
   * rio, e o TILE DE TERRENO (SEA_TILE_FRAMES), o lago. Na tela as duas sao a mesma agua (World3D
   * assa o rio com o material do lago), mas no dado continuam duas, e quem so olhasse uma ficaria
   * cego para a outra.
   *
   * A ordem importa: se ha prop, e ELE quem responde — uma ponte, um vau de pedra ou um canal
   * drenado deixam de ser agua aberta mesmo com agua pintada por baixo.
   */
  public isOpenWaterAt(wx: number, wy: number): boolean {
    const prop = this.getWaterAt(wx, wy);
    if (prop) return prop.blocking;
    // So dentro dos chunks autorados: fora deles o WorldData fabrica terreno descartavel a cada
    // consulta, e o balde nao pode encher nem a trilha do lago tocar numa coordenada que nao existe.
    const chunkX = Math.floor(wx / CHUNK_COLUMNS);
    const chunkY = Math.floor(wy / CHUNK_ROWS);
    if (this.host.chunkManager?.hasChunkCoordinate(chunkX, chunkY) !== true) return false;
    const ground = this.host.chunkManager.getTile(wx, wy).ground;
    return SEA_TILE_FRAMES.includes(ground);
  }

  /**
   * Everything a walking body cannot step onto: authored terrain collision and trees (via
   * ChunkManager.isCellBlocked), every registered prop whose `blocking` says so (see
   * WorldProp/propRegistry), NPCs — and the two hazard tiles (lava, water), unless the caller is
   * explicitly hazard-passable.
   */
  public isSolidForEntities(wx: number, wy: number, hazardsPassable = false): boolean {
    if (this.host.chunkManager?.isCellBlocked(wx, wy)) return true;
    for (const entry of this.host.props.propRegistry) {
      if (entry.hazard && hazardsPassable) continue;
      if (this.propAt(entry.list, wx, wy)?.blocking) return true;
    }
    if (this.host.npcManager?.hasNpcAt(wx, wy)) return true;
    if (this.host.swordPlanting.plantedSwordTile?.x === wx && this.host.swordPlanting.plantedSwordTile.y === wy) return true;
    if (this.host.marks.isQuestMarkAt(wx, wy)) return true;
    if (this.host.questSetup.painterQuest?.isSolidAt(wx, wy)) return true;
    if (this.host.questSetup.lumberQuest?.isSolidAt(wx, wy)) return true;
    if (this.host.questSetup.astronomerQuest?.isSolidAt(wx, wy)) return true;
    if (this.host.valley.npcHomes?.isSolidAt(wx, wy)) return true;
    if (this.host.valley.valleyFinds?.at(wx, wy)) return true;
    if (this.host.valley.heroCamp?.at(wx, wy)) return true;
    if (this.host.camp.catCare.isBarrelAt(wx, wy)) return true;
    if (this.host.valley.bigTrees?.at(wx, wy)) return true;
    if (this.host.valley.woodFence?.at(wx, wy)) return true;
    if (this.host.valley.lumberYard?.at(wx, wy)) return true;
    if (this.host.valley.oldForge?.at(wx, wy)) return true;
    if (this.host.valley.crashSite?.at(wx, wy)) return true;
    // O cogumelo nascendo e um corpo no caminho: o heroi encosta nele e fica DE FRENTE — que e a
    // mira da faca. Pisa-lo para apanhar seria arranca-lo, e o jogo ensina o contrario.
    if (isMushroomKind(this.host.itemManager?.kindAt(wx, wy))) return true;
    // O que enfeita fica onde foi posto: pisar nele não o leva embora.
    if (isDecorKind(this.host.itemManager?.kindAt(wx, wy))) return true;
    return false;
  }

  public getAltarAt(wx: number, wy: number): AltarObject | undefined {
    return this.propAt(this.host.props.altars, wx, wy);
  }

  /** As fogueiras do fim deste tile, se houver. */
  public getHearthAt(wx: number, wy: number): CampfireObject | undefined {
    return this.propAt(this.host.props.hearths, wx, wy);
  }

  // A felled tree leaves a stick behind: drop a `wood` pickup on the (now passable) stump tile.
  // `wood` is the flammable item, so the stick is exactly "an item you can use to make fire".
  /**
   * A ARVORE VERDE em (wx, wy)? Ela e TILE, assada na malha estatica do terreno, e nada no jogo a
   * derruba — e essa garantia que deixa a floresta inteira ser escrita uma vez so na GPU.
   */
  public isTreeTileAt(wx: number, wy: number): boolean {
    const upper = this.host.chunkManager?.getTile(wx, wy).upper ?? null;
    return upper !== null && TREE_UPPER_FRAMES.has(upper);
  }

  // A regrowing tree may only sprout (and only counts its clock) when NOTHING is on its tile —
  // the hero or an item. The item check is key: a felled tree drops a graveto on its
  // stump, and the tree must not grow back until that graveto is picked up (the regrow clock
  // stays paused while it sits there).
  public isTileClearForRegrow(wx: number, wy: number): boolean {
    if (wx === this.host.playerWorld.worldX && wy === this.host.playerWorld.worldY) return false;
    if (this.host.itemManager?.hasItemAt(wx, wy)) return false;
    return true;
  }

  /** De que é o chão debaixo do pé: a ponte é madeira, e o resto sai do desenho do tile. */
  public surfaceAt(wx: number, wy: number): Surface {
    if (this.host.props.waterTiles.some((w) => w.worldX === wx && w.worldY === wy)) return 'wood';
    const { ground } = this.host.chunkManager?.getTile(wx, wy) ?? { ground: 5 };
    if (ground === 23 || ground === 24) return 'stone';
    return ground === 6 ? 'dirt' : 'grass';
  }
}
