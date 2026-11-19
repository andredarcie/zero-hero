import type * as Engine from '@/game/engine';
import { HotSpring } from '@/game/objects/spring/HotSpring';

import { BeachLife } from './BeachLife';
import { BeachSteps } from './BeachSteps';
import { Crabs } from './Crabs';
import type { BeachWorld } from './kit';
import { SandMounds } from './SandMounds';
import { Sandpipers } from './Sandpipers';
import { Seagulls } from './Seagulls';
import { SeaVista } from './SeaVista';
import { SurfSound } from './SurfSound';

/** A praia montada: o maestro e cada sistema, à mão de quem os pergunta (o playtest, o painel de testes). */
export interface Beach {
  life: BeachLife;
  vista: SeaVista;
  steps: BeachSteps;
  crabs: Crabs;
  gulls: Seagulls;
  pipers: Sandpipers;
  sound: SurfSound;
  /** Os montinhos de areia que o balde recolhe (a única areia do jogo). */
  mounds: SandMounds;
  /** A fonte termal no alto da serra, atrás do lago de lava (objects/spring): é da faixa do norte, como a praia. */
  spring: HotSpring;
  destroy(): void;
}

/**
 * Monta a praia do norte: o maestro (BeachLife) e cada sistema dela, na ordem em que rodam. Um arquivo só para a lista:
 * quem acrescenta um bicho mexe aqui, e não no boot do mundo.
 */
export const buildBeach = (scene: Engine.Scene, world: BeachWorld): Beach => {
  const life = new BeachLife(scene, world);
  const beach: Beach = {
    life,
    vista: life.add(new SeaVista()),
    steps: life.add(new BeachSteps()),
    crabs: life.add(new Crabs()),
    gulls: life.add(new Seagulls()),
    pipers: life.add(new Sandpipers()),
    sound: life.add(new SurfSound()),
    mounds: life.add(new SandMounds()),
    spring: life.add(new HotSpring()),
    destroy: () => life.destroy(),
  };
  return beach;
};
