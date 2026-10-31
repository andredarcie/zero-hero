import type { HeldItemKind } from '@/game/entities/ItemPickup';
import type { DyeKind } from '@/game/quests/dyePlants';

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

/** Em que conversa a quest da Iris está (ver quests/PainterQuest). */
export type PaintStage = 'start' | 'dig' | 'sow' | 'water' | 'grow' | 'harvest' | 'paint' | 'done';

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
}

/** Em que etapa a quest do Bram está, e como cada ofício saiu: é sobre isso que ele comenta. */
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

export interface AdventureSnapshot {
  /** Vira true no primeiro persist de uma run de verdade — e o que o titulo le para o Continue. */
  started: boolean;
  /** De onde o heroi CONTINUA: o tile em que ele estava no ultimo retrato. */
  respawn: { worldX: number; worldY: number } | null;
  inventory: Array<{ kind: HeldItemKind; count: number }>;
  selected: HeldItemKind | 'none';
  /** A abertura (a chegada, a espada fincada, o mago) ja tocou: ela acontece uma vez por partida. */
  introSeen: boolean;
  /** O portao do jardim ja abriu (o ultimo pedido fechou e a cena dele tocou). */
  gateOpened: boolean;
  /** A fogueira do fim ja foi acesa pelo heroi. */
  hearthLit: boolean;
  /** O cogumelo foi assado e os creditos rolaram. */
  endingSeen: boolean;
  seenDialogKeys: Set<string>;
  seenItems: Set<string>;
  /** As conversas que ja deram o presente do NPC (a ferramenta do pedido) — um presente, uma vez. */
  giftsGiven: Set<string>;
  /**
   * "x,y" de cada buraco de plantio que a PÁ cavou no overworld. Diff sobre os plantSpots
   * autorados: o buraco é ESTRUTURA que o jogador fez.
   */
  dugSpots: Set<string>;
  /** Estações manuais construídas pelo jogador por mundo. Diff, nunca foto: ver AdventureMachine. */
  machines: Map<string, AdventureMachine[]>;
  /**
   * Itens no chao por MUNDO: a foto substitui a lista autorada daquele arquivo — um item largado
   * fica onde ficou, um cogumelo colhido nao renasce.
   */
  groundItems: Map<string, AdventureGroundItem[]>;
  /** "cx,cy" dos chunks que o heroi ja pisou — o fog of war do mapa. */
  visitedChunks: Set<string>;
  /**
   * O CADERNO DE MISSOES: um contador por tarefa, chaveado `<roteiro>/<tarefa>` (ver
   * runtime/QuestLog). O numero so SOBE, e "cumprida" e lido dele: nao ha um segundo booleano de
   * "fechou" para discordar da soma.
   */
  questProgress: Map<string, number>;
  paintQuest: PaintQuestSave;
  lumberQuest: LumberQuestSave;
}

const defaultSnapshot = (): AdventureSnapshot => ({
  started: false,
  respawn: null,
  inventory: [],
  selected: 'none',
  introSeen: false,
  gateOpened: false,
  hearthLit: false,
  endingSeen: false,
  seenDialogKeys: new Set(),
  seenItems: new Set(),
  giftsGiven: new Set(),
  dugSpots: new Set(),
  machines: new Map(),
  groundItems: new Map(),
  visitedChunks: new Set(),
  questProgress: new Map(),
  paintQuest: { stage: 'start', plots: [] },
  lumberQuest: {
    stage: 'start', standing: false, laid: 0, clean: 0, attempts: 0,
  },
});

type StoredSnapshot = {
  started?: boolean;
  respawn?: { worldX: number; worldY: number } | null;
  inventory?: Array<{ kind: HeldItemKind; count: number }>;
  selected?: HeldItemKind | 'none';
  introSeen?: boolean;
  gateOpened?: boolean;
  hearthLit?: boolean;
  endingSeen?: boolean;
  seenDialogKeys?: string[];
  seenItems?: string[];
  giftsGiven?: string[];
  dugSpots?: string[];
  machines?: Record<string, AdventureMachine[]>;
  groundItems?: Record<string, AdventureGroundItem[]>;
  visitedChunks?: string[];
  questProgress?: Record<string, number>;
  paintQuest?: PaintQuestSave;
  lumberQuest?: Partial<LumberQuestSave>;
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
const REMOVED_KINDS: ReadonlySet<string> = new Set(['greatAxe']);

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
    (Array.isArray(items) ? items : []).map((it) => ((it.kind as string) === 'mushroom'
      ? { ...it, kind: (LEGACY_MUSHROOM_AT[`${it.worldX},${it.worldY}`] ?? 'porcini') as HeldItemKind }
      : it)),
  ]),
);

const load = (): AdventureSnapshot => {
  const base = defaultSnapshot();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
      hearthLit: p.hearthLit === true,
      endingSeen: p.endingSeen === true,
      seenDialogKeys: new Set(p.seenDialogKeys ?? []),
      seenItems: new Set(p.seenItems ?? []),
      giftsGiven: new Set(p.giftsGiven ?? []),
      dugSpots: new Set(p.dugSpots ?? []),
      machines: cleanMachines(p.machines),
      groundItems: migrateGround(p.groundItems),
      visitedChunks: new Set(p.visitedChunks ?? []),
      questProgress: new Map(
        // A Hollis pedia que se ENCONTRASSE cada espécie (`gather`); hoje ela pede que se ENTREGUE
        // (`deliver`, uma de cada vez). O que já foi achado num save antigo vale como entregue.
        Object.entries(p.questProgress ?? {}).map(([key, n]) => [
          key.replace('radiationSuit/gather:', 'radiationSuit/deliver:'), num(n, 0),
        ]),
      ),
      paintQuest: p.paintQuest && typeof p.paintQuest.stage === 'string' && Array.isArray(p.paintQuest.plots)
        ? p.paintQuest
        : base.paintQuest,
      lumberQuest: { ...base.lumberQuest, ...(p.lumberQuest ?? {}) },
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
    hearthLit: s.hearthLit,
    endingSeen: s.endingSeen,
    seenDialogKeys: [...s.seenDialogKeys],
    seenItems: [...s.seenItems],
    giftsGiven: [...s.giftsGiven],
    dugSpots: [...s.dugSpots],
    machines: Object.fromEntries(s.machines),
    groundItems: Object.fromEntries(s.groundItems),
    visitedChunks: [...s.visitedChunks],
    questProgress: Object.fromEntries(s.questProgress),
    paintQuest: s.paintQuest,
    lumberQuest: s.lumberQuest,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage cheio/bloqueado: o modulo continua valendo nesta aba, so nao sobrevive a ela.
  }
};

/** Recomecar do zero (o "New game" do titulo): apaga o modulo E o disco. */
export const resetAdventure = (): void => {
  state = defaultSnapshot();
  respawnRequested = false;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* nada a apagar */ }
};

export const requestAdventureRespawn = (): void => { respawnRequested = true; };

export const consumeAdventureRespawn = (): boolean => {
  const requested = respawnRequested;
  respawnRequested = false;
  return requested;
};
