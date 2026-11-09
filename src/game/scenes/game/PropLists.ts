// AS PEÃ‡AS DO MAPA, por tipo: o que o world.json autora (fogueiras, portÃµes, arbustos, pedras, Ã¡gua, lava, estaÃ§Ãµes)
// e o que o jogador construiu por cima. Quem monta Ã© o WorldBoot (e o Machines, para as estaÃ§Ãµes); quem pergunta Ã© o
// WorldQuery, e o propRegistry Ã© a lista das listas, para colisÃ£o e chÃ£o livre.

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

export class PropLists {
  public campfires: CampfireObject[] = [];
  /** Last clock state applied to all ambient campfires; prevents per-frame effect restarts. */
  public campfiresFollowNight = false;
  public dryBushes: DryBushObject[] = [];
  public lockedDoors: LockedDoorObject[] = [];
  public swingGates: SwingGateObject[] = [];
  public dryTrees: DryTreeObject[] = [];
  public dryShrubs: DryShrubObject[] = [];
  public rocks: RockObject[] = [];
  public tallGrasses: TallGrassObject[] = [];
  // Night-blooming flowers: shut (blocking) near a lit campfire, open (walkable) in the dark.
  public moonflowers: MoonflowerObject[] = [];
  // Canteiros: dug holes where seeds plant on step, mounds water on bump, grass regrows.
  public plantSpots: PlantSpotObject[] = [];
  // A bancada manual: abre o catalogo e fabrica com os materiais da mochila.
  public toolboxes: ToolboxObject[] = [];
  // A CADEIA DO FERRO: o forno reduz minério com carvão; mão e altar malham a esponja.
  public furnaces: FurnaceObject[] = [];
  public altars: AltarObject[] = [];
  public waterTiles: WaterObject[] = [];
  public lavaTiles: LavaObject[] = [];
  // O registro único de props: referencia os MESMOS arrays tipados acima, então destruição,
  // colisão (isSolidForEntities) e reset atravessam todos os props num loop só — um prop novo
  // é uma entrada aqui, não seis edições espalhadas. Consequência: fora do create/shutdown os
  // arrays só podem ser mutados IN PLACE (push/splice); reatribuir um deles órfão o registro.
  // `hazard` marca água e lava (ver isSolidForEntities: quem pede `hazardsPassable` passa por eles).
  // Para o herói, ambos bloqueiam até virarem chão por uma interação.
  public propRegistry: Array<{ list: WorldProp[]; hazard?: boolean }> = [];
  public hearths: CampfireObject[] = [];
  public gardenGates: LockedDoorObject[] = [];
}
