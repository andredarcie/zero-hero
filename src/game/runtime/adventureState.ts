import type { HeldItemKind } from '@/game/entities/ItemPickup';

/**
 * A MEMORIA DA AVENTURA — o save, e a razao de a morte ter deixado de apagar o mundo.
 *
 * A aventura rodava inteira numa unica instancia de GameScene: morrer, entrar numa dungeon ou
 * fechar o browser jogava fora a mochila, as fogueiras acesas, os dialogos ouvidos e a historia
 * do mago. Num mundo aberto isso nao e dificuldade — e descarte do jogador. Este modulo e o
 * mesmo padrao de `underworld`/`explorerRun` (estado de modulo sobrevive ao `scene.restart()`)
 * com um andar a mais: o retrato vai ao localStorage, entao ele sobrevive tambem a aba.
 *
 * O que NAO entra aqui, de proposito:
 *   • explorador e levels — la, zerar E o desenho (a aposta do explorador e perder; o level e
 *     um puzzle que recomeca limpo).
 *   • a vida atual — acordar na fogueira acorda inteiro; fogueira cura de qualquer jeito.
 *   • props consumidos (rocha quebrada, arbusto queimado) — sao os recursos renovaveis do
 *     mundo, e voltar e o que os mantem colhiveis. A excecao e a ARVORE-TILE derrubada, que e
 *     edicao de TERRENO (greatAxe) e ja sobrevivia ao restart por acidente; aqui o acidente
 *     vira contrato.
 *
 * O ponto de renascimento e a FOGUEIRA: o tile em que o heroi estava da ultima vez que pisou no
 * anel seguro de um fogo aceso. Morrer, continuar, reiniciar — tudo acorda ali. E o bonfire.
 */

const STORAGE_KEY = 'zh.adventure.v1';

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


export interface AdventureSnapshot {
  /** Vira true no primeiro persist de uma run de verdade — e o que o titulo le para o Continue. */
  started: boolean;
  /** Onde o heroi acorda (tile do overworld dentro do anel de um fogo aceso). */
  respawn: { worldX: number; worldY: number } | null;
  coins: number;
  inventory: Array<{ kind: HeldItemKind; count: number }>;
  selected: HeldItemKind | 'none';
  /** "x,y" de cada fogueira do overworld que o jogador acendeu. */
  litFires: Set<string>;
  /**
   * "x,y" -> quantas toras a PIRA daquele tile ja recebeu, e "x,y" das que estao acesas.
   *
   * A ponte construida NAO entra no save e ninguem sentiu, porque ela custa dois gravetos. A pira
   * custa viagens: se a morte apagasse a torre, o objetivo do jogo seria uma punicao. Por isso
   * cada tora entregue persiste na hora.
   */
  pyreLogs: Map<string, number>;
  litPyres: Set<string>;
  litFireCount: number;
  wizardIntroSeen: boolean;
  endingSeen: boolean;
  seenDialogKeys: Set<string>;
  seenItems: Set<string>;
  /** "x,y" de cada pinheiro-tile derrubado (diff de terreno sobre o world.json). */
  felledTrees: Set<string>;
  /**
   * "x,y" de cada buraco de plantio que a PÁ cavou no overworld. Diff sobre os plantSpots
   * autorados, pelo mesmo motivo do felledTrees: o buraco é ESTRUTURA que o jogador fez, e a
   * morte não pode apagá-la. Só a posição entra — o estado do canteiro (monte, mato) é dos
   * renováveis, como o de qualquer canteiro autorado.
   */
  dugSpots: Set<string>;
  /**
   * Estações manuais construídas pelo jogador por mundo. Diff, nunca foto: ver AdventureMachine.
   */
  machines: Map<string, AdventureMachine[]>;
  /**
   * Itens no chao por MUNDO ('world' ou 'under'): a foto substitui a lista autorada daquele
   * arquivo — um item largado fica onde ficou, um tesouro tomado nao renasce.
   */
  groundItems: Map<string, AdventureGroundItem[]>;
  /** "cx,cy" dos chunks do overworld que o heroi ja pisou — o fog of war do mapa. */
  visitedChunks: Set<string>;
  /**
   * O CADERNO DE MISSOES: um contador por tarefa, chaveado `<roteiro>/<tarefa>` (ver
   * runtime/QuestLog). Ele mora aqui porque missao e da AVENTURA — level e explorador nunca
   * hidratam este save, e deixa-los escrever contador sujaria a aventura de quem so foi jogar
   * um puzzle. O numero so SOBE, e "cumprida" e lido dele: nao ha um segundo booleano de
   * "fechou" para discordar da soma.
   */
  questProgress: Map<string, number>;
  /**
   * O tile "x,y" da PIRA CENTRAL — o fim do jogo —, lembrado na primeira vez que o overworld a
   * carrega. Ele existe porque uma missao pode FECHAR longe dela (matar caveira dentro de uma
   * dungeon), e nesse instante nao ha objeto de pira nenhum na cena para receber as toras. Com
   * a chave guardada, o credito cai no `pyreLogs` de qualquer lugar, e a torre esta mais alta
   * quando o heroi volta.
   */
  centralPyre: string | null;
}

const defaultSnapshot = (): AdventureSnapshot => ({
  started: false,
  respawn: null,
  coins: 0,
  inventory: [],
  selected: 'none',
  litFires: new Set(),
  pyreLogs: new Map(),
  litPyres: new Set(),
  litFireCount: 0,
  wizardIntroSeen: false,
  endingSeen: false,
  seenDialogKeys: new Set(),
  seenItems: new Set(),
  felledTrees: new Set(),
  dugSpots: new Set(),
  machines: new Map(),
  groundItems: new Map(),
  visitedChunks: new Set(),
  questProgress: new Map(),
  centralPyre: null,
});

type StoredSnapshot = {
  started?: boolean;
  respawn?: { worldX: number; worldY: number } | null;
  coins?: number;
  inventory?: Array<{ kind: HeldItemKind; count: number }>;
  selected?: HeldItemKind | 'none';
  litFires?: string[];
  pyreLogs?: Record<string, number>;
  litPyres?: string[];
  litFireCount?: number;
  wizardIntroSeen?: boolean;
  endingSeen?: boolean;
  seenDialogKeys?: string[];
  seenItems?: string[];
  felledTrees?: string[];
  dugSpots?: string[];
  machines?: Record<string, AdventureMachine[]>;
  groundItems?: Record<string, AdventureGroundItem[]>;
  visitedChunks?: string[];
  questProgress?: Record<string, number>;
  centralPyre?: string | null;
};

const num = (value: unknown, fallback: number): number =>
  (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback);

// Itens aposentados somem durante a hidratação, inclusive de saves antigos. Sem esta migração,
// uma bota selecionada sobreviveria no JSON e tentaria procurar uma arte que já não existe.
const RETIRED_ITEM_KINDS: ReadonlySet<string> = new Set([
  'lavaBoots', 'battery', 'batteryFull', 'gear', 'wire', 'belt', 'chest', 'boiler',
  'inserter', 'extractor', 'tripHammer',
]);
const isRetiredItem = (kind: unknown): boolean =>
  typeof kind === 'string' && RETIRED_ITEM_KINDS.has(kind);

const cleanGroundItems = (
  value: StoredSnapshot['groundItems'],
): Map<string, AdventureGroundItem[]> => new Map(
  Object.entries(value ?? {}).map(([scope, items]) => [
    scope,
    Array.isArray(items) ? items.filter((item) => item && !isRetiredItem(item.kind)) : [],
  ]),
);

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
      coins: num(p.coins, 0),
      inventory: Array.isArray(p.inventory)
        ? p.inventory.filter((i) => i && typeof i.kind === 'string' && !isRetiredItem(i.kind))
        : [],
      selected: isRetiredItem(p.selected) ? 'none' : (p.selected ?? 'none'),
      litFires: new Set(p.litFires ?? []),
      pyreLogs: new Map(
        Object.entries(p.pyreLogs ?? {}).map(([key, n]) => [key, num(n, 0)]),
      ),
      litPyres: new Set(p.litPyres ?? []),
      litFireCount: num(p.litFireCount, 0),
      wizardIntroSeen: p.wizardIntroSeen === true,
      endingSeen: p.endingSeen === true,
      seenDialogKeys: new Set(p.seenDialogKeys ?? []),
      seenItems: new Set((p.seenItems ?? []).filter((kind) => !isRetiredItem(kind))),
      felledTrees: new Set(p.felledTrees ?? []),
      dugSpots: new Set(p.dugSpots ?? []),
      machines: cleanMachines(p.machines),
      groundItems: cleanGroundItems(p.groundItems),
      visitedChunks: new Set(p.visitedChunks ?? []),
      questProgress: new Map(
        Object.entries(p.questProgress ?? {}).map(([key, n]) => [key, num(n, 0)]),
      ),
      centralPyre: typeof p.centralPyre === 'string' ? p.centralPyre : null,
    };
  } catch {
    return base;
  }
};

// ── o estado vivo ─────────────────────────────────────────────────────────────

let state: AdventureSnapshot | null = null;
/**
 * Pedido de "acorde na fogueira", consumido UMA vez pelo proximo create(). E um pedido em vez
 * de comportamento padrao porque a volta de dungeon tambem reinicia a cena — e ela precisa
 * nascer na boca da caverna (o playerStart reescrito), nunca teleportada para o fogo.
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
    coins: s.coins,
    inventory: s.inventory,
    selected: s.selected,
    litFires: [...s.litFires],
    pyreLogs: Object.fromEntries(s.pyreLogs),
    litPyres: [...s.litPyres],
    litFireCount: s.litFireCount,
    wizardIntroSeen: s.wizardIntroSeen,
    endingSeen: s.endingSeen,
    seenDialogKeys: [...s.seenDialogKeys],
    seenItems: [...s.seenItems],
    felledTrees: [...s.felledTrees],
    dugSpots: [...s.dugSpots],
    machines: Object.fromEntries(s.machines),
    groundItems: Object.fromEntries(s.groundItems),
    visitedChunks: [...s.visitedChunks],
    questProgress: Object.fromEntries(s.questProgress),
    centralPyre: s.centralPyre,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Sem storage (aba privada, cota estourada): a aventura CONTINUA, so nao atravessa a aba. A
    // cota e do dominio inteiro e nao so deste jogo, entao estourar e um caminho real e nao
    // teorico — e o que ele nunca pode ser e fatal: uma excecao aqui derrubaria a descida.
  }
};

/** Recomecar do zero (o "Start over" do titulo): apaga o modulo E o disco. */
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
