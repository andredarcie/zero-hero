// O DESCANSO E O FOGO: dormir (na fogueira ou no colchão do acampamento), a visita da Morte, o gato, quem vem sentar
// numa fogueira e as fogueiras que um vizinho mantém acesas.

import { CatCompanion } from '@/game/entities/CatCompanion';
import type { CampfireObject } from '@/game/objects/CampfireObject';
import type { GameScene } from '@/game/scenes/GameScene';

type Tile = readonly [number, number];

export const campProbe = (s: GameScene) => {
  const fireAt = (x: number, y: number): CampfireObject | undefined => s.props.campfires.find((f) => f.worldX === x && f.worldY === y);
  const cat = () => s.camp.catCare['cat'];
  return {
    /** O herói sentado/dormindo, se é no colchão do acampamento, e onde a Morte apareceu (se apareceu). */
    rest: () => ({
      resting: s.camp.rest.isResting,
      sleeping: s.camp.rest.isSleeping,
      atCamp: s.camp.rest['sleepingAtCamp'],
      deathTile: s.camp.rest['deathTile'] ?? null,
    }),

    /** O gato: onde está, se está em casa, e se existe. */
    cat: () => {
      const c = cat();
      return c ? { position: c.position, atHome: c.atHome } : null;
    },
    /** Faz o gato existir (`arriving` = ele chega andando, como no jogo). */
    ensureCat: (arriving = false): void => s.camp.catCare.ensure(arriving),
    /** Encurta a vontade dele de seguir o herói (ms) — para o teste não esperar o sorteio. */
    setCatFollowMs: (ms: number): void => { const c = cat(); if (c instanceof CatCompanion) c['followSpellMs'] = ms; },
    /** Quanto tempo ele já passou em casa (ms) — um valor grande = descansado. */
    setCatHomeMs: (ms: number): void => { const c = cat(); if (c instanceof CatCompanion) c['homeMs'] = ms; },

    /** O caminho de quem vem sentar numa fogueira (null = não há caminho). */
    visitPath: (home: Tile, seats: Tile[], hero: Tile, fire: Tile) => s.camp.visitPath(home, seats, hero, fire),

    /** A fogueira de (x, y): acesa, inteira, e se um vizinho está cuidando dela. */
    campfire: (x: number, y: number) => {
      const f = fireAt(x, y);
      return f ? { x, y, lit: f.isLit, full: f.isFullyLit, keeper: s.fire.fireKeepers.has(f), keptLit: s.fire.keptLitFires.has(f) } : null;
    },
    /** Acende (true) ou apaga (false) todas as fogueiras do mapa, como o vento e o herói fazem. */
    setAllFires: (lit: boolean): void => {
      for (const f of s.props.campfires) {
        if (lit && !f.isLit) f.light();
        else if (!lit && f.isLit) f.extinguish();
      }
    },
    /** As fogueiras que um vizinho mantém acesas. */
    keptLitFires: () => [...s.fire.keptLitFires].map((f) => ({ x: f.worldX, y: f.worldY, lit: f.isLit })),
  };
};
