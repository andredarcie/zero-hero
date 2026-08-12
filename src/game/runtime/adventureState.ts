import type { HeldItemKind } from '@/game/entities/ItemPickup';
import type { DungeonSnapshot } from '@/game/dungeon/dungeonSnapshot';

/**
 * A MEMORIA DA AVENTURA — o save, e a razao de a morte ter deixado de apagar o mundo.
 *
 * A aventura rodava inteira numa unica instancia de GameScene: morrer, entrar numa dungeon ou
 * fechar o browser jogava fora a mochila, as fogueiras acesas, os dialogos ouvidos e a historia
 * do mago. Num mundo aberto isso nao e dificuldade — e descarte do jogador. Este modulo e o
 * mesmo padrao de `dungeonTrip`/`explorerRun` (estado de modulo sobrevive ao `scene.restart()`)
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

/**
 * Uma MAQUINA que o jogador construiu. Ela e a primeira coisa neste save que nao e nem item nem
 * marca: e ESTRUTURA — e por isso entra pela mesma porta do `felledTrees` e do `dugSpots`, como
 * um DIFF sobre o que o `world.json` autora, e nunca como uma foto que substitui o mundo.
 *
 * A distincao vale uma tarde: se as maquinas fossem foto, um mundo re-autorado (uma caldeira nova
 * posta no /editor, uma carta de chunk comprada) perderia o que o autor pos, ou pior, duplicaria
 * a peca do jogador em cima dela. Como diff, o mundo sempre ganha e o save so acrescenta.
 *
 * `content` so existe no bau, e e a razao de ele ser a peca que faz a fabrica valer a pena: e o
 * que o jogador encontra quando volta. Perder isso na morte seria devolver a automacao ao ponto
 * em que ela nao produzia nada.
 */
export interface AdventureMachine {
  type: 'wire' | 'belt' | 'chest' | 'boiler' | 'inserter' | 'extractor' | 'furnace' | 'tripHammer'
  | 'altar';
  worldX: number;
  worldY: number;
  /** Esteira, braco e extrator: para onde a peca ENTREGA (0=N, 1=L, 2=S, 3=O). */
  dir?: number;
  /** So o bau: o que esta guardado la dentro. */
  content?: { kind: HeldItemKind; count: number } | null;
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
   * A FABRICA que o jogador construiu, por MUNDO ('world' ou 'dungeon-N') — a mesma chave dos
   * groundItems, porque uma esteira deitada numa dungeon nao pode reaparecer no overworld. Diff,
   * nunca foto: ver AdventureMachine.
   */
  machines: Map<string, AdventureMachine[]>;
  /**
   * Itens no chao por MUNDO ('world' ou 'dungeon-N'): a foto substitui a lista autorada daquele
   * arquivo — um item largado fica onde ficou, um tesouro tomado nao renasce.
   */
  groundItems: Map<string, AdventureGroundItem[]>;
  /** "cx,cy" dos chunks do overworld que o heroi ja pisou — o fog of war do mapa. */
  visitedChunks: Set<string>;
  /**
   * A SEMENTE DESTA PARTIDA. Cunhada uma vez (ver `adventureRunSeed`), ela decide as nove
   * dungeons — que agora sao geradas, nao lidas do disco. Recomecar do zero cunha outra, e e ai
   * que mora o replay: a mesma aventura, nove masmorras que ninguem viu.
   */
  runSeed: number;
  /**
   * O RETRATO de cada dungeon ja gerada, por escopo ('dungeon-N'). Ele e a promessa de que uma
   * dungeon, uma vez vista, e daquele save para sempre — inclusive atraves de uma mudanca no
   * gerador, porque hidratar o retrato nunca consulta a semente (ver dungeon/dungeonWorld).
   */
  dungeons: Map<string, DungeonSnapshot>;
}

const defaultSnapshot = (): AdventureSnapshot => ({
  started: false,
  respawn: null,
  coins: 0,
  inventory: [],
  selected: 'none',
  litFires: new Set(),
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
  runSeed: 0,
  dungeons: new Map(),
});

type StoredSnapshot = {
  started?: boolean;
  respawn?: { worldX: number; worldY: number } | null;
  coins?: number;
  inventory?: Array<{ kind: HeldItemKind; count: number }>;
  selected?: HeldItemKind | 'none';
  litFires?: string[];
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
  runSeed?: number;
  dungeons?: Record<string, DungeonSnapshot>;
};

const num = (value: unknown, fallback: number): number =>
  (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback);

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
      inventory: Array.isArray(p.inventory) ? p.inventory.filter((i) => i && typeof i.kind === 'string') : [],
      selected: p.selected ?? 'none',
      litFires: new Set(p.litFires ?? []),
      litFireCount: num(p.litFireCount, 0),
      wizardIntroSeen: p.wizardIntroSeen === true,
      endingSeen: p.endingSeen === true,
      seenDialogKeys: new Set(p.seenDialogKeys ?? []),
      seenItems: new Set(p.seenItems ?? []),
      felledTrees: new Set(p.felledTrees ?? []),
      dugSpots: new Set(p.dugSpots ?? []),
      machines: new Map(Object.entries(p.machines ?? {})),
      groundItems: new Map(Object.entries(p.groundItems ?? {})),
      visitedChunks: new Set(p.visitedChunks ?? []),
      runSeed: num(p.runSeed, 0),
      dungeons: new Map(Object.entries(p.dungeons ?? {})),
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
    runSeed: s.runSeed,
    dungeons: Object.fromEntries(s.dungeons),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Sem storage (aba privada, cota estourada): a aventura CONTINUA, so nao atravessa a aba. As
    // nove dungeons somam ~50 KB de retrato — folgado nos ~5 MB do localStorage —, mas a cota e
    // do dominio inteiro e nao so deste jogo, entao estourar e um caminho real e nao teorico. O
    // que ele nunca pode ser e fatal: uma excecao aqui derrubaria a viagem ate a dungeon.
  }
};

/**
 * A SEMENTE DA PARTIDA, cunhada na primeira vez que alguem pergunta.
 *
 * E o unico `Math.random()` de todo o sistema de dungeons: daqui para baixo tudo e consequencia
 * dela (ver dungeon/dungeonRandom). Ela nasce preguicosa em vez de junto do save porque um save
 * que ja existia antes desta versao tambem precisa de uma — e nascer na primeira descida e o
 * momento exato em que ela passa a significar alguma coisa.
 */
export const adventureRunSeed = (): number => {
  const s = adventureState();
  if (!s.runSeed) {
    s.runSeed = (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
    saveAdventure();
  }
  return s.runSeed;
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
