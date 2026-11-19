// AS ATRAÃ‡Ã•ES DO VALE (sÃ³ na aventura): o acampamento do herÃ³i, a cachoeira, o lago das carpas, o bosque, a cerca, o
// quintal do lenhador, a forja velha, o lugar da queda, os passarinhos, a natureza, o clima, as casas, os achados, a
// estrada velha e a nÃ©voa do jardim. Quem monta Ã© o WorldBoot; quem desmonta, o SceneTeardown.

import type { Season } from '@/game/runtime/seasons';
import { ValleyWeather } from '@/game/entities/ValleyWeather';
import { OldRoad } from '@/game/objects/OldRoad';
import { Trails } from '@/game/objects/Trails';
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
import { CampPieces } from '@/game/objects/CampPieces';
import { NpcHomes } from '@/game/objects/NpcHomes';
import { ValleyFinds } from '@/game/objects/ValleyFinds';
import type { CellTower } from '@/game/objects/CellTower';
import type { CoconutPalms } from '@/game/objects/CoconutPalms';
import type { Beach } from '@/game/objects/beach/buildBeach';
import type { BeachSeat } from '@/game/objects/beach/BeachSeat';

export class ValleySet {
  /** A estrada antiga da espada ao jardim do fim (objects/OldRoad). */
  public oldRoad?: OldRoad;
  /** As trilhas falhas até a Shui e até a Sisi (world/trails, objects/Trails). */
  public trails?: Trails;
  /** A névoa do jardim alto, até o vento levá-la (objects/GardenMist, playMistClearing). */
  public gardenMist?: GardenMist;
  /** A torre de telefonia na ponta do cume do jardim alto (objects/CellTower): só enfeite, com a luz piscando. */
  public cellTower?: CellTower;
  /** A casa de cada vizinho, ao lado de onde ele fica. */
  public npcHomes?: NpcHomes;
  public valleyFinds?: ValleyFinds;
  /** O acampamento do herói: o colchão, o fogo e o caderno, que vêm de início (objects/HeroCamp). */
  public heroCamp?: HeroCamp;
  /** O que o jogador pôs no acampamento pelo modo de construção (objects/CampPieces). */
  public campPieces?: CampPieces;
  /** A cachoeira do acampamento (objects/Waterfall): a nascente do lago do herói. */
  public waterfall?: Waterfall;
  /** O laguinho das carpas no pé da cachoeira (objects/KoiPond). */
  public koiPond?: KoiPond;
  /** As árvores grandes do bosque (objects/BigTrees) e os passarinhos de dia (objects/BirdLife). */
  public bigTrees?: BigTrees;
  /** Os coqueiros da praia do norte (objects/CoconutPalms). */
  public palms?: CoconutPalms;
  /** A praia do norte: os bichos, as pegadas, os montinhos de areia, a câmera do horizonte e o som do mar (objects/beach/buildBeach). */
  public beach?: Beach;
  /** O guarda-sol e a cadeira da praia, de olhar o mar (objects/beach/BeachSeat). */
  public beachSeat?: BeachSeat;
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
