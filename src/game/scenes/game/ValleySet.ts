// AS ATRAÃ‡Ã•ES DO VALE (sÃ³ na aventura): o acampamento do herÃ³i, a cachoeira, o lago das carpas, o bosque, a cerca, o
// quintal do lenhador, a forja velha, o lugar da queda, os passarinhos, a natureza, o clima, as casas, os achados, a
// estrada velha e a nÃ©voa do jardim. Quem monta Ã© o WorldBoot; quem desmonta, o SceneTeardown.

import type { Season } from '@/game/runtime/seasons';
import { ValleyWeather } from '@/game/entities/ValleyWeather';
import { OldRoad } from '@/game/objects/OldRoad';
import { GardenMist } from '@/game/objects/GardenMist';
import { BigTrees } from '@/game/objects/BigTrees';
import { WoodFence } from '@/game/objects/WoodFence';
import { LumberYard } from '@/game/objects/LumberYard';
import { OldForge } from '@/game/objects/OldForge';
import { CrashSite } from '@/game/objects/CrashSite';
import { BirdLife } from '@/game/objects/BirdLife';
import { KoiPond } from '@/game/objects/KoiPond';
import { NatureLife } from '@/game/objects/nature/NatureLife';
import { Waterfall } from '@/game/objects/Waterfall';
import { HeroCamp } from '@/game/objects/HeroCamp';
import { NpcHomes } from '@/game/objects/NpcHomes';
import { ValleyFinds } from '@/game/objects/ValleyFinds';

export class ValleySet {
  /** A estrada antiga da espada ao jardim do fim (objects/OldRoad). */
  public oldRoad?: OldRoad;
  /** A névoa do jardim alto, até o vento levá-la (objects/GardenMist, playMistClearing). */
  public gardenMist?: GardenMist;
  /** A casa de cada vizinho, ao lado de onde ele fica. */
  public npcHomes?: NpcHomes;
  public valleyFinds?: ValleyFinds;
  /** O acampamento do herói, com as lembranças dos pedidos fechados (objects/HeroCamp). */
  public heroCamp?: HeroCamp;
  /** A cachoeira do acampamento (objects/Waterfall): a nascente do lago do herói. */
  public waterfall?: Waterfall;
  /** O laguinho das carpas no pé da cachoeira (objects/KoiPond). */
  public koiPond?: KoiPond;
  /** As árvores grandes do bosque (objects/BigTrees) e os passarinhos de dia (objects/BirdLife). */
  public bigTrees?: BigTrees;
  /** A cerca de madeira (objects/WoodFence): o quintal do lenhador. */
  public woodFence?: WoodFence;
  /** As coisas do quintal do lenhador (objects/LumberYard). */
  public lumberYard?: LumberYard;
  /** O que sobrou da forja do ferreiro que morou ao lado da Thea (objects/OldForge). */
  public oldForge?: OldForge;
  /** A cratera onde a nave da Thea caiu (objects/CrashSite). */
  public crashSite?: CrashSite;
  public birdLife?: BirdLife;
  /** Os bichos, as plantas e o que o tempo deixa para trás (objects/nature). */
  public nature?: NatureLife;
  public weather?: ValleyWeather;
  public shownSeason?: Season;
}
