// O DESCANSO E O FOGO: dormir (na fogueira ou no colchão do acampamento), a visita da Morte, o gato, quem vem sentar
// numa fogueira e as fogueiras que um vizinho mantém acesas.

import { CatCompanion } from '@/game/entities/CatCompanion';
import type { CampfireObject } from '@/game/objects/CampfireObject';
import { createCanvas } from '@/game/platform/platform';
import { heroCape } from '@/game/render3d/heroDye';
import { textureImage } from '@/game/render3d/textures3d';
import { adventureState } from '@/game/runtime/adventureState';
import { clothRamp, type ClothDye } from '@/game/runtime/homeState';
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

    /** A manhã depois dos créditos (MorningAfter): ainda por tocar, e o bilhete na tela. */
    morning: () => ({ pending: s.morning.pending, note: s.morning.noteOpen }),

    /** O LAR (CampHome): o save do lar, as cores da tina, as telas abertas, o título escrito e o mato ainda em pé. */
    home: () => ({
      ...adventureState().home,
      worn: heroCape(),
      dyes: [...s.camp.home.dyes()],
      dyeOpen: s.camp.home.dyeCard !== undefined,
      cursor: s.camp.home.dyeCard?.cursor ?? null,
      nameOpen: s.camp.home.nameCard !== undefined,
      title: s.camp.home.titleText,
      grassStanding: s.camp.home.grassStanding,
      grassGrowing: s.camp.home.campGrass?.growing ?? 0,
    }),
    /**
     * O MATO DE UM TILE (objects/TallGrassObject): em pé, voltando (e o degrau), ou cortado; e quantos pedaços de fio
     * e de toco a malha desenha dele (0 = chão limpo).
     */
    grassAt: (x: number, y: number) => {
      const g = s.props.tallGrasses.find((t) => t.worldX === x && t.worldY === y);
      if (!g) return null;
      const tuft = g['tuft'] as { state: string; count: number };
      return { tall: g.isTall, growing: g.isGrowing, level: g.growthLevel, blocking: g.blocking, drawn: tuft.state, quads: tuft.count };
    },
    /** Passa o relógio do mato do acampamento de uma vez (o painel de testes): todo cortado e sem uso volta já. */
    regrowCampGrass: (): void => { s.camp.home.campGrass?.regrowNow(); },
    /**
     * O MODO DE CONSTRUÇÃO (BuildMode): aberto, a cena pausada, o que a tela aponta, as cartas (tipo e estado) e a grade
     * (quantos tiles de cada cor, e o estado de cada um).
     */
    build: () => {
      const open = s.camp.build.overlay !== undefined;
      const cells = open ? s.camp.build.view().cells : [];
      const count = (state: string): number => cells.filter((c) => c.state === state).length;
      return {
        open,
        opening: s.camp.build.isOpen && !open,
        paused: s.scene.isPaused() === true,
        screen: s.camp.build.overlay?.state ?? null,
        cards: open ? s.camp.build.view().cards.map((c) => ({ kind: c.kind, state: c.state, next: c.next })) : [],
        free: count('free'),
        grass: count('grass'),
        blocked: count('blocked'),
        cells: cells.map((c) => ({ x: c.x, y: c.y, state: c.state })),
      };
    },
    /** A cena da tela de construção: um tile da grade (o centro dele) em pixels, para o cenário clicar como um jogador. */
    buildTilePx: (x: number, y: number): { x: number; y: number } | null => s.world3d?.projection.projectTile(x, y, 0) ?? null,
    /** Quantos quadradinhos da grade estão deitados no chão do mundo agora (scenes/game/BuildGridView). */
    gridInWorld: (): number => s.camp.build['grid']?.['cells'].size ?? 0,
    /** A folha do herói que o mundo 3D desenha agora tem esta cor (#rrggbb) em algum pixel? É a capa tingida de verdade. */
    heroSheetHas: (hex: string): boolean => {
      const image = textureImage('hero');
      if (!image) return false;
      const canvas = createCanvas();
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return false;
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, image.width, image.height).data;
      const want = Number.parseInt(hex.slice(1), 16);
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0 && ((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) === want) return true;
      }
      return false;
    },
    /** A rampa do pano tingido nesta cor (a mesma conta da capa), para o cenário saber o que procurar. */
    clothRamp: (dye: ClothDye): readonly string[] => clothRamp(dye),

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
    /** A câmera de cena (o céu da primeira noite, a vista de dentro do elmo): o quanto ela está no quadro, de 0 a 1. */
    lens: (): number => s.world3d?.cam.lens?.blend ?? 0,
    /** O chá da Shui: se ele está para vir, se está acontecendo, e o segundo da viagem (null fora dela). */
    tea: () => ({
      due: s.camp.tea.due(),
      active: s.camp.tea.active,
      trip: s.world3d?.screen.trip.enabled ? s.world3d.screen.trip.look.time : null,
    }),
  };
};
