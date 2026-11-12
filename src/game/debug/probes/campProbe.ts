// O DESCANSO E O FOGO: dormir (na fogueira ou no colchão do acampamento), a visita da Morte, o gato, quem vem sentar
// numa fogueira e as fogueiras que um vizinho mantém acesas.

import { CatCompanion } from '@/game/entities/CatCompanion';
import type { CampfireObject } from '@/game/objects/CampfireObject';
import { adventureState } from '@/game/runtime/adventureState';
import type { AnimalKind } from '@/game/runtime/sketches';
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

    /** O caderno de campo: aberto, a página aberta, e as páginas (achadas ou vulto). */
    notebook: () => ({
      open: s.camp.notebook.overlay !== undefined,
      at: s.camp.notebook.overlay?.at ?? null,
      pages: s.camp.notebook.view().pages.map((p) => ({ kind: p.kind, known: p.known })),
    }),
    /** Abre o caderno como o Z faz; `page` folheia até a página dessa coisa. */
    openNotebook: (page?: string): void => {
      s.camp.notebook.open();
      const index = s.camp.notebook.view().pages.findIndex((p) => p.kind === page);
      if (index >= 0) s.camp.notebook.overlay?.go(index);
    },
    closeNotebook: (): void => { s.camp.notebook.overlay?.close(); },

    /** O caderno de desenho: o bicho que o Z desenharia agora, e o desenho aberto (progresso, o que o bicho faz). */
    sketch: () => ({ target: s.camp.sketching.target(), open: s.camp.sketching.overlay?.state ?? null, cue: s.camp.sketching.cueText }),
    /** Abre o desenho de um bicho (sem precisar achá-lo no mundo), e segura ou solta a pena. */
    openSketch: (kind: AnimalKind): void => s.camp.sketching.open(kind),
    holdPen: (on: boolean): void => { s.camp.sketching.overlay?.hold(on); },
    /** A meditação: a sessão por dentro (null sem sessão), e a profundidade forçada para fotografar o fundo. */
    meditation: () => s.camp.meditation.state,
    meditationDepth: (depth: number): void => s.camp.meditation.setDepth(depth),
    /** A pedra que quica: mirando, quantos quiques deu a última, e o recorde. */
    skip: () => ({ aiming: s.camp.skipping.aiming, last: s.camp.skipping.lastSkips, best: adventureState().skipBest }),
  };
};
