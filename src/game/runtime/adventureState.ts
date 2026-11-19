import type { HeldItemKind } from '@/game/entities/ItemPickup';
import type { DyeKind } from '@/game/quests/dyePlants';
import { localStore } from '@/game/platform/platform';
import { cleanHomeName, isClothDye, type ClothDye } from '@/game/runtime/homeState';
import { cleanTalks, type TalkEntry } from '@/game/runtime/talkLog';
import { BENCH_MATERIALS, homeBuild, isHomePiece, refund, type BenchMaterial, type HomePieceKind } from '@/game/objects/homeBuilds';

/**
 * A MEMORIA DA AVENTURA — o save.
 *
 * Estado de modulo (sobrevive ao `scene.restart()`) com um andar a mais: o retrato vai ao
 * localStorage, entao ele sobrevive tambem a aba. Neste jogo nada se perde — nao ha morte, nao ha
 * game over —, entao o save so tem um trabalho: lembrar o que o jogador FEZ (os pedidos ajudados,
 * a mochila, o canteiro cavado, a abertura ja vista) e de onde ele continua.
 *
 * O que NAO entra aqui, de proposito: props consumidos (rocha quebrada, arbusto queimado) — sao
 * os recursos renovaveis do mundo, e voltar e o que os mantem colhiveis. A excecao e a
 * ARVORE-TILE derrubada, que e edicao de TERRENO e precisa sobreviver ao boot.
 */

// A chave mudou junto com o jogo: um save da aventura de combate (dungeon, pira, paredes
// bombardeadas) descreve um mundo que nao existe mais, e hidratar dele daria ao jogador uma
// partida no meio de uma historia que ele nunca jogou.
const STORAGE_KEY = 'zh.cozy.v1';

export interface AdventureGroundItem {
  kind: HeldItemKind;
  worldX: number;
  worldY: number;
  /** O pacote (sementes): quantas unidades este item vale. Ausente = 1 (saves antigos). */
  count?: number;
}

/** Uma estação manual que o jogador construiu, persistida como diff sobre o mundo autorado. */
export interface AdventureMachine {
  type: 'furnace' | 'altar';
  worldX: number;
  worldY: number;
  /** O forno usa a direção para definir sua saída visual. */
  dir?: number;
}

/** Em que conversa a quest da Sisi está (ver quests/PainterQuest). */
export type PaintStage = 'start' | 'dig' | 'sow' | 'water' | 'grow' | 'harvest' | 'paint' | 'review' | 'done';

export interface PaintPlot {
  x: number;
  y: number;
  kind: DyeKind;
  /** De 0 (só o monte) a 3 (em flor). */
  level: number;
  growMs: number;
  watered: boolean;
  cut: boolean;
}

export interface PaintQuestSave {
  stage: PaintStage;
  plots: PaintPlot[];
  /** O desenho do jogador (PNG em data URL): é ele que fica no quadro para sempre. */
  art?: string;
  /** Onde ela armou o quadro: ele só existe depois das tintas. */
  easel?: { x: number; y: number };
  /** O que ela vai dizer do desenho quando o herói voltar a falar com ela. */
  review?: { form: string; color: string };
}

/** Em que etapa a quest da Thea está, e quais dos quatro alvos o herói já achou no céu. */
export interface SkyQuestSave {
  stage: 'start' | 'iron' | 'glass' | 'polish' | 'carry' | 'night' | 'done';
  found: string[];
  /** Ela foi embora na nave. Quem fechou o pedido antes desta cena continua com ela em casa. */
  departed?: boolean;
  /**
   * O FORNO DELA, que guia a quest (ver AstronomerQuest.furnaceNeed): se o carvão já está aceso lá dentro,
   * o que ele já devolveu (a esponja, o vidro) e a areia que já está esperando a cinza.
   */
  furnace?: { charcoal: boolean; bloom: boolean; sand: boolean; glass: boolean };
}

/** Em que etapa a quest do Marco está, e como cada ofício saiu: é sobre isso que ele comenta. */
export interface LumberQuestSave {
  stage: 'start' | 'gather' | 'ready' | 'light' | 'done';
  /** Há um galho em pé no cepo, esperando o machado. */
  standing: boolean;
  /** Quantos galhos já estão na terra. */
  laid: number;
  /** Quantos racharam no primeiro golpe. */
  clean: number;
  /** Quantas vezes a brasa morreu antes de pegar. */
  attempts: number;
}

/** Uma peça que o jogador pôs no acampamento (objects/homeBuilds, scenes/game/BuildMode). */
export interface HomePieceSave {
  kind: HomePieceKind;
  x: number;
  y: number;
}

/** O LAR (runtime/homeState): a cor da capa do herói e da manta do colchão, e o nome que ele deu ao acampamento. */
export interface HomeSave {
  cape: ClothDye;
  blanket: ClothDye;
  /** Vazio = ainda sem nome (a placa em branco; o título da chegada usa o nome de sempre). */
  name: string;
  /** O que o jogador pôs no acampamento, onde pôs. Diff sobre o acampamento de partida (colchão, fogo, caderno). */
  pieces: HomePieceSave[];
  /** O material guardado na bancada (o X com material na mão guarda; a construção gasta daqui). */
  stock: Record<BenchMaterial, number>;
  /** "x,y" do mato alto do acampamento já cortado: é ESTRUTURA que o jogador fez (o resto do mato do vale volta). */
  cleared: string[];
  /**
   * DESDE QUANDO cada tile cortado está SEM USO, no relógio absoluto do jogo (o dia + a fração do dia): o mato do
   * acampamento que o herói não usa volta a crescer com o tempo (objects/CampGrass, runtime/campRegrowth). Tile sem
   * hora conta como cortado agora.
   */
  clearedAt: Record<string, number>;
  /** As construções já feitas uma vez: é por elas que a escada da bancada anda. */
  built: HomePieceKind[];
}

export interface AdventureSnapshot {
  /** Vira true no primeiro persist de uma run de verdade — e o que o titulo le para o Continue. */
  started: boolean;
  /** De onde o heroi CONTINUA: o tile em que ele estava no ultimo retrato. */
  respawn: { worldX: number; worldY: number } | null;
  inventory: Array<{ kind: HeldItemKind; count: number }>;
  selected: HeldItemKind | 'none';
  /** A abertura (a chegada, a espada fincada, o mago) ja tocou: ela acontece uma vez por partida. */
  introSeen: boolean;
  /** O portao do jardim ja abriu (o heroi usou a chave nele). */
  gateOpened: boolean;
  /** Quem fechou o ultimo pedido ja entregou a chave do jardim alto. */
  gardenKeyGiven: boolean;
  /** O vento ja levou a nevoa do jardim alto (a cena do cume tocou). */
  mistCleared: boolean;
  /** A fogueira do fim ja foi acesa pelo heroi. */
  hearthLit: boolean;
  /** O cogumelo foi assado e os creditos rolaram. */
  endingSeen: boolean;
  /** O dia do relógio: as estações saem dele. */
  day: number;
  /** A hora do relógio: sem ela, toda volta seria meia-noite, e quem joga pouco nunca chegaria à próxima. */
  clock: number | null;
  /** Os cogumelos na cesta, a caminho da Shui. */
  basket: HeldItemKind[];
  seenDialogKeys: Set<string>;
  seenItems: Set<string>;
  /** O CADERNO DO ACAMPAMENTO: cada coisa que já passou pelas mãos do herói (runtime/notebook). */
  found: Set<string>;
  /** Os bichos desenhados no caderno: quanto de cada desenho já está no papel (0..1; runtime/sketches). */
  sketches: Map<string, number>;
  /** O recorde de quiques de uma pedra na água (scenes/game/StoneSkipping). */
  skipBest: number;
  /** As sessões de meditação com fôlego de verdade, e qual nota do caderno vem na próxima (scenes/game/Meditation). */
  meditations: number;
  meditationFacts: number;
  /** As conversas que ja deram o presente do NPC (a ferramenta do pedido) — um presente, uma vez. */
  giftsGiven: Set<string>;
  /**
   * "x,y" de cada buraco de plantio que a PÁ cavou no overworld. Diff sobre os plantSpots
   * autorados: o buraco é ESTRUTURA que o jogador fez.
   */
  dugSpots: Set<string>;
  /**
   * "x,y" de cada tile de MATO DA TRILHA DA PRAIA que a foice já abriu (objects/TrailGrass). O mato do vale volta
   * quando a partida recomeça (é recurso); este é PASSAGEM: se voltasse, quem recarregasse o jogo na areia sem a foice
   * na mão ficaria preso do outro lado da serra.
   */
  trailCut: Set<string>;
  /** Estações manuais construídas pelo jogador por mundo. Diff, nunca foto: ver AdventureMachine. */
  machines: Map<string, AdventureMachine[]>;
  /**
   * Itens no chao por MUNDO: a foto substitui a lista autorada daquele arquivo — um item largado
   * fica onde ficou, um cogumelo colhido nao renasce.
   */
  groundItems: Map<string, AdventureGroundItem[]>;
  /** "cx,cy" dos chunks que o heroi ja pisou — o fog of war do mapa. */
  visitedChunks: Set<string>;
  /** As falas que o jogador já leu inteiras (resumo de cada texto): aparecem de uma vez (runtime/readLines). */
  readLines: Set<string>;
  /** O caderno das conversas: o que cada um disse, para reler no menu de pausa (runtime/talkLog). */
  talks: TalkEntry[];
  /**
   * O CADERNO DE MISSOES: um contador por tarefa, chaveado `<roteiro>/<tarefa>` (ver
   * runtime/QuestLog). O numero so SOBE, e "cumprida" e lido dele: nao ha um segundo booleano de
   * "fechou" para discordar da soma.
   */
  questProgress: Map<string, number>;
  paintQuest: PaintQuestSave;
  lumberQuest: LumberQuestSave;
  skyQuest: SkyQuestSave;
  home: HomeSave;
}

const defaultSnapshot = (): AdventureSnapshot => ({
  started: false,
  respawn: null,
  inventory: [],
  selected: 'none',
  introSeen: false,
  gateOpened: false,
  gardenKeyGiven: false,
  mistCleared: false,
  hearthLit: false,
  endingSeen: false,
  day: 0,
  clock: null,
  basket: [],
  seenDialogKeys: new Set(),
  seenItems: new Set(),
  found: new Set(),
  sketches: new Map(),
  skipBest: 0,
  meditations: 0,
  meditationFacts: 0,
  giftsGiven: new Set(),
  dugSpots: new Set(),
  trailCut: new Set(),
  machines: new Map(),
  groundItems: new Map(),
  visitedChunks: new Set(),
  readLines: new Set(),
  talks: [],
  questProgress: new Map(),
  paintQuest: { stage: 'start', plots: [] },
  lumberQuest: {
    stage: 'start', standing: false, laid: 0, clean: 0, attempts: 0,
  },
  skyQuest: { stage: 'start', found: [] },
  home: {
    cape: 'natural', blanket: 'natural', name: '', pieces: [], stock: { wood: 0, stone: 0, charcoal: 0, ore: 0 }, cleared: [],
    clearedAt: {}, built: [],
  },
});

type StoredSnapshot = {
  started?: boolean;
  respawn?: { worldX: number; worldY: number } | null;
  inventory?: Array<{ kind: HeldItemKind; count: number }>;
  selected?: HeldItemKind | 'none';
  introSeen?: boolean;
  gateOpened?: boolean;
  gardenKeyGiven?: boolean;
  mistCleared?: boolean;
  hearthLit?: boolean;
  endingSeen?: boolean;
  day?: number;
  clock?: number | null;
  basket?: HeldItemKind[];
  seenDialogKeys?: string[];
  seenItems?: string[];
  found?: string[];
  sketches?: Record<string, number>;
  skipBest?: number;
  meditations?: number;
  meditationFacts?: number;
  giftsGiven?: string[];
  dugSpots?: string[];
  trailCut?: string[];
  machines?: Record<string, AdventureMachine[]>;
  groundItems?: Record<string, AdventureGroundItem[]>;
  visitedChunks?: string[];
  readLines?: string[];
  talks?: unknown;
  questProgress?: Record<string, number>;
  paintQuest?: PaintQuestSave;
  lumberQuest?: Partial<LumberQuestSave>;
  skyQuest?: Partial<SkyQuestSave>;
  home?: Partial<Record<keyof HomeSave, unknown>>;
};

/**
 * O lar do save, conferido: cor que a tina não conhece volta a ser a natural, o nome passa pela limpeza da placa, peça
 * que o jogo não conhece (ou repetida no mesmo tile) sai, e o estoque é número inteiro e nunca negativo.
 */
const cleanHome = (value: StoredSnapshot['home']): HomeSave => {
  const seen = new Set<string>();
  const kinds = new Set<string>();
  const extras: HomePieceKind[] = [];
  // O BANQUINHO SAIU (pedido do autor, 2026-11-17: o tronco já senta): o que estava posto num save antigo vira tronco,
  // no mesmo tile, e o assento não some.
  const legacy = (p: unknown): unknown => ((p as { kind?: unknown } | null)?.kind === 'stool' ? { ...(p as object), kind: 'log' } : p);
  const pieces = (Array.isArray(value?.pieces) ? (value.pieces as unknown[]).map(legacy) : []).filter((p): p is HomePieceSave => {
    const piece = p as Partial<HomePieceSave> | null;
    if (!piece || !isHomePiece(piece.kind) || !Number.isInteger(piece.x) || !Number.isInteger(piece.y)) return false;
    const at = `${piece.x},${piece.y}`;
    if (seen.has(at)) return false;
    // CADA PEÇA UMA VEZ SÓ (2026-11-17, objects/homeBuilds): a repetida de um save de antes sai, e o material volta.
    if (kinds.has(piece.kind)) { extras.push(piece.kind); return false; }
    seen.add(at);
    kinds.add(piece.kind);
    return true;
  }).map((p) => ({ kind: p.kind, x: p.x, y: p.y }));
  const rawStock = (value?.stock ?? {}) as Partial<Record<string, unknown>>;
  const stock = extras.reduce<Record<BenchMaterial, number>>(
    (s, kind) => refund(homeBuild(kind).cost, s),
    Object.fromEntries(BENCH_MATERIALS.map((m) => [m, num(rawStock[m], 0)])) as Record<BenchMaterial, number>,
  );
  const strings = (list: unknown): string[] => (Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : []);
  return {
    cape: isClothDye(value?.cape) ? value.cape : 'natural',
    blanket: isClothDye(value?.blanket) ? value.blanket : 'natural',
    name: cleanHomeName(value?.name),
    pieces,
    stock,
    cleared: [...new Set(strings(value?.cleared))],
    clearedAt: cleanClearedAt(value?.clearedAt, strings(value?.cleared)),
    built: [...new Set(strings(value?.built).map((k) => (k === 'stool' ? 'log' : k)).filter(isHomePiece))],
  };
};

/** As horas dos tiles cortados: só os que ainda estão cortados, e só números de verdade (frações de dia). */
const cleanClearedAt = (value: unknown, cleared: readonly string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!value || typeof value !== 'object') return out;
  for (const key of cleared) {
    const at = (value as Record<string, unknown>)[key];
    if (typeof at === 'number' && Number.isFinite(at) && at >= 0) out[key] = at;
  }
  return out;
};

const num = (value: unknown, fallback: number): number =>
  (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback);

const cleanMachines = (
  value: StoredSnapshot['machines'],
): Map<string, AdventureMachine[]> => new Map(
  Object.entries(value ?? {}).map(([scope, machines]) => [
    scope,
    Array.isArray(machines)
      ? machines.filter((machine) => machine?.type === 'furnace' || machine?.type === 'altar')
      : [],
  ]),
);

/** Itens que sairam do jogo: um save antigo que os guarde simplesmente os esquece. */
const REMOVED_KINDS: ReadonlySet<string> = new Set(['greatAxe', 'seeds']);

/**
 * Itens que o world.json deixava soltos e saíram (pedido do autor): a foice, que agora só a Morte dá, e os
 * dois gravetos ao lado da ponte do morel, que agora saem das árvores secas. O save antigo ainda os guarda.
 */
const REMOVED_PICKUPS: ReadonlySet<string> = new Set(['scythe@13,18', 'wood@4,32', 'wood@4,33']);

/**
 * O COGUMELO GENERICO VIROU SEIS ESPECIES (fungi.ts). Um save de antes guarda 'mushroom' em dois
 * lugares: na mochila (vira porcini — o de comer, para o fim continuar possivel) e na foto do chao,
 * onde cada um ganha a especie que o world.json deu aquele tile (scripts/cozy-world.mjs).
 */
const LEGACY_MUSHROOM_AT: Readonly<Record<string, string>> = {
  '1,1': 'flyAgaric', '11,2': 'chanterelle', '11,10': 'inkCap', '12,21': 'puffball',
  '2,30': 'morel', '31,29': 'porcini', '1,36': 'porcini', '2,46': 'puffball',
};

const migrateInventory = (
  list: Array<{ kind: HeldItemKind; count: number }>,
): Array<{ kind: HeldItemKind; count: number }> => list.map((i) => (
  (i.kind as string) === 'mushroom' ? { ...i, kind: 'porcini' as HeldItemKind } : i
));

const migrateGround = (
  value: StoredSnapshot['groundItems'],
): Map<string, AdventureGroundItem[]> => new Map(
  Object.entries(value ?? {}).map(([scope, items]) => [
    scope,
    (Array.isArray(items) ? items : []).filter((it) => !REMOVED_KINDS.has(it.kind as string)
      && !REMOVED_PICKUPS.has(`${it.kind as string}@${it.worldX},${it.worldY}`)).map((it) => ((it.kind as string) === 'mushroom'
      ? { ...it, kind: (LEGACY_MUSHROOM_AT[`${it.worldX},${it.worldY}`] ?? 'porcini') as HeldItemKind }
      : it)),
  ]),
);

const load = (): AdventureSnapshot => {
  const base = defaultSnapshot();
  try {
    const raw = localStore().getItem(STORAGE_KEY);
    if (!raw) return base;
    const p = JSON.parse(raw) as StoredSnapshot;
    return {
      started: p.started === true,
      respawn: p.respawn && typeof p.respawn.worldX === 'number' && typeof p.respawn.worldY === 'number'
        ? { worldX: p.respawn.worldX, worldY: p.respawn.worldY }
        : null,
      inventory: Array.isArray(p.inventory)
        ? migrateInventory(p.inventory.filter((i) => i && typeof i.kind === 'string' && !REMOVED_KINDS.has(i.kind)))
        : [],
      selected: p.selected && !REMOVED_KINDS.has(p.selected) ? p.selected : 'none',
      introSeen: p.introSeen === true,
      gateOpened: p.gateOpened === true,
      gardenKeyGiven: p.gardenKeyGiven === true || p.gateOpened === true,
      mistCleared: p.mistCleared === true || p.endingSeen === true,
      hearthLit: p.hearthLit === true,
      endingSeen: p.endingSeen === true,
      day: typeof p.day === 'number' ? p.day : 0,
      clock: typeof p.clock === 'number' ? p.clock : null,
      basket: Array.isArray(p.basket) ? p.basket : [],
      seenDialogKeys: new Set(p.seenDialogKeys ?? []),
      seenItems: new Set(p.seenItems ?? []),
      found: new Set(p.found ?? []),
      sketches: new Map(Object.entries(p.sketches ?? {}).map(([k, v]) => [k, Math.min(1, Math.max(0, Number(v) || 0))])),
      skipBest: num(p.skipBest, 0),
      meditations: num(p.meditations, 0),
      meditationFacts: num(p.meditationFacts, 0),
      giftsGiven: new Set(p.giftsGiven ?? []),
      dugSpots: new Set(p.dugSpots ?? []),
      trailCut: new Set(Array.isArray(p.trailCut) ? p.trailCut.filter((k) => typeof k === 'string') : []),
      machines: cleanMachines(p.machines),
      groundItems: migrateGround(p.groundItems),
      visitedChunks: new Set(p.visitedChunks ?? []),
      readLines: new Set(p.readLines ?? []),
      talks: cleanTalks(p.talks),
      questProgress: new Map(
        // A Shui pedia que se ENCONTRASSE cada espécie (`gather`); hoje ela pede que se ENTREGUE
        // (`deliver`, uma de cada vez). O que já foi achado num save antigo vale como entregue.
        Object.entries(p.questProgress ?? {}).map(([key, n]) => [
          key.replace('radiationSuit/gather:', 'radiationSuit/deliver:'), num(n, 0),
        ]),
      ),
      paintQuest: p.paintQuest && typeof p.paintQuest.stage === 'string' && Array.isArray(p.paintQuest.plots)
        ? p.paintQuest
        : base.paintQuest,
      lumberQuest: { ...base.lumberQuest, ...(p.lumberQuest ?? {}) },
      skyQuest: { ...base.skyQuest, ...(p.skyQuest ?? {}) },
      home: cleanHome(p.home),
    };
  } catch {
    return base;
  }
};

let state: AdventureSnapshot | null = null;
/**
 * Pedido de "continue de onde parou", consumido UMA vez pelo proximo create() (o Continue do
 * titulo). E um pedido em vez de padrao porque o playtest do editor tambem cria a cena.
 */
let respawnRequested = false;

export const adventureState = (): AdventureSnapshot => {
  if (!state) state = load();
  return state;
};

export const hasAdventureSave = (): boolean => adventureState().started;

export const saveAdventure = (): void => {
  const s = adventureState();
  const stored: StoredSnapshot = {
    started: s.started,
    respawn: s.respawn,
    inventory: s.inventory,
    selected: s.selected,
    introSeen: s.introSeen,
    gateOpened: s.gateOpened,
    gardenKeyGiven: s.gardenKeyGiven,
    mistCleared: s.mistCleared,
    hearthLit: s.hearthLit,
    endingSeen: s.endingSeen,
    day: s.day,
    clock: s.clock,
    basket: s.basket,
    seenDialogKeys: [...s.seenDialogKeys],
    seenItems: [...s.seenItems],
    found: [...s.found],
    sketches: Object.fromEntries(s.sketches),
    skipBest: s.skipBest,
    meditations: s.meditations,
    meditationFacts: s.meditationFacts,
    giftsGiven: [...s.giftsGiven],
    dugSpots: [...s.dugSpots],
    trailCut: [...s.trailCut],
    machines: Object.fromEntries(s.machines),
    groundItems: Object.fromEntries(s.groundItems),
    visitedChunks: [...s.visitedChunks],
    readLines: [...s.readLines],
    talks: s.talks,
    questProgress: Object.fromEntries(s.questProgress),
    paintQuest: s.paintQuest,
    lumberQuest: s.lumberQuest,
    skyQuest: s.skyQuest,
    home: s.home,
  };
  try {
    localStore().setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage cheio/bloqueado: o modulo continua valendo nesta aba, so nao sobrevive a ela.
  }
};

/** Recomecar do zero (o "New game" do titulo): apaga o modulo E o disco. */
export const resetAdventure = (): void => {
  state = defaultSnapshot();
  respawnRequested = false;
  try {
    localStore().removeItem(STORAGE_KEY);
  } catch { /* nada a apagar */ }
};

export const requestAdventureRespawn = (): void => { respawnRequested = true; };

export const consumeAdventureRespawn = (): boolean => {
  const requested = respawnRequested;
  respawnRequested = false;
  return requested;
};
