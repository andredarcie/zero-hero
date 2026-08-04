import type { UpgradeState } from '@/game/runtime/ShopOverlay';

/**
 * O MODO EXPLORADOR — o estado de uma expedicao, e o que sobra dela.
 *
 * A aventura e os levels sao mundos AUTORADOS: o que existe neles foi colocado por alguem, e
 * morrer so custa tempo. O explorador e a aposta oposta — o mundo e infinito e gerado enquanto
 * o heroi anda, e a unica coisa que existe de verdade e o que ele consegue trazer de volta.
 *
 * Toda a tensao do modo mora em tres numeros, e eles vivem aqui:
 *
 *   • **quanto vale um passo a mais.** Longe do acampamento cada caveira paga mais
 *     (`coinMultiplierAt`) — a recompensa cresce junto com o perigo, e e por isso que ir
 *     fundo e uma decisao e nao uma formalidade.
 *   • **50% se voce escolher parar.** Um portal no meio do escuro pergunta se voce quer
 *     voltar; dizer sim custa METADE da bolsa. E caro de proposito: se voltar fosse de graca,
 *     o modo seria "ande ate cansar" em vez de "ande ate ter medo".
 *   • **5% se o escuro escolher por voce.** Morrer nao zera — zerar transforma cada expedicao
 *     ruim em tempo jogado fora —, mas 5% e perto o bastante de nada para a morte doer.
 *
 * O que ATRAVESSA as expedicoes (o banco, as melhorias compradas na fogueira do acampamento e
 * as estatisticas) mora no localStorage, no padrao `zh.*` das outras preferencias — a mesma
 * ideia do meta de um roguelite. O que pertence a UMA expedicao mora em memoria e morre com ela.
 */

const STORAGE_KEY = 'zh.explorer.v1';

/** Fracao da bolsa que sobrevive quando o heroi ESCOLHE voltar por um portal. */
export const EXTRACT_KEEP = 0.5;
/** Fracao da bolsa que sobrevive quando o escuro decide: morrer no mundo aleatorio. */
export const DEATH_KEEP = 0.05;

/** A cada quantos tiles de distancia do acampamento a moeda vale um degrau a mais. */
const DEPTH_STEP_TILES = 24;
/** Tetos: nem a recompensa nem o cerco crescem para sempre — a partir daqui e so o teto. */
const MAX_COIN_MULTIPLIER = 8;
const MAX_DANGER_SCALE = 2.6;

export interface ExplorerStats {
  runs: number;
  extractions: number;
  deaths: number;
  bestHaul: number;
  bestDepth: number;
  totalBanked: number;
}

export interface ExplorerMeta {
  /** Moedas guardadas no acampamento. Sao estas que a fogueira-loja gasta. */
  banked: number;
  /** Melhorias compradas — permanentes, ao contrario da aventura (la elas morrem com a run). */
  upgrades: UpgradeState;
  stats: ExplorerStats;
}

export interface ExplorerRunState {
  /** Semente do mundo desta expedicao: mesmo numero, mesmo mundo. */
  seed: number;
  /** A bolsa CRUA, ainda nao taxada — o que aparece no HUD. */
  coins: number;
  /** Distancia em tiles ate o acampamento, agora. */
  depth: number;
  /** O quao longe esta expedicao chegou (o recorde dela, nao o do jogador). */
  maxDepth: number;
  /** Quantas caveiras cairam nesta expedicao. */
  kills: number;
}

/** Como a expedicao anterior terminou — lido UMA vez pela GameScene que nasce depois dela. */
export type ExplorerArrival =
  | { kind: 'start' }
  | { kind: 'extract'; kept: number; lost: number; depth: number }
  | { kind: 'death'; kept: number; lost: number; depth: number };

const defaultMeta = (): ExplorerMeta => ({
  banked: 0,
  upgrades: { maxHealth: 0, swordSpeed: 0, moveSpeed: 0, magnet: 0 },
  stats: { runs: 0, extractions: 0, deaths: 0, bestHaul: 0, bestDepth: 0, totalBanked: 0 },
});

const num = (value: unknown, fallback: number): number =>
  (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback);

export const loadExplorerMeta = (): ExplorerMeta => {
  const base = defaultMeta();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<ExplorerMeta>;
    return {
      banked: num(parsed.banked, base.banked),
      upgrades: { ...base.upgrades, ...(parsed.upgrades ?? {}) },
      stats: { ...base.stats, ...(parsed.stats ?? {}) },
    };
  } catch {
    return base;
  }
};

export const saveExplorerMeta = (meta: ExplorerMeta): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
  } catch { /* sem storage: a expedicao continua, so nao atravessa a aba */ }
};

// ── o estado vivo do modo ─────────────────────────────────────────────────────
//
// Singleton no padrao de activeLevel.ts / GlobalVariables.ts, e pelo mesmo motivo: a expedicao
// tem que sobreviver ao `scene.restart()` que leva o heroi de volta ao acampamento (morte ou
// portal), e uma cena que se reinicia nao pode guardar nada.

let active = false;
let run: ExplorerRunState | null = null;
let meta: ExplorerMeta = defaultMeta();
let pendingArrival: ExplorerArrival | null = null;
/**
 * `?explorerSeed=N` — a semente da PRIMEIRA expedicao, para o playtest poder andar sempre pelo
 * mesmo terreno.
 *
 * Ela e consumida no uso, e nao mantida: o modo promete um mundo novo a cada expedicao, e um
 * pino permanente transformaria essa promessa em mentira exatamente onde ela e testada. Quem
 * pediu a semente quer o mundo em que ENTRA; o que vem depois da primeira volta e outro mundo,
 * como para qualquer jogador.
 */
let pinnedSeed: number | null = null;

export const pinExplorerSeed = (seed: number | null): void => { pinnedSeed = seed; };

const rollSeed = (): number => {
  if (pinnedSeed !== null) {
    const pinned = pinnedSeed;
    pinnedSeed = null;
    return pinned;
  }
  return Math.floor(Math.random() * 0xffffff);
};

export const isExplorerMode = (): boolean => active;

export const explorerRun = (): ExplorerRunState | null => run;

export const explorerMeta = (): ExplorerMeta => meta;

/**
 * Comeca uma expedicao nova, do zero, a partir do acampamento. `seed` fixa o mundo (o playtest
 * usa isso para andar sempre pelo mesmo terreno); sem ele o mundo e sorteado.
 */
export const startExplorerRun = (seed?: number): ExplorerRunState => {
  active = true;
  meta = loadExplorerMeta();
  meta.stats.runs += 1;
  saveExplorerMeta(meta);
  run = {
    seed: seed ?? rollSeed(),
    coins: 0,
    depth: 0,
    maxDepth: 0,
    kills: 0,
  };
  pendingArrival = { kind: 'start' };
  return run;
};

/**
 * Uma expedicao terminou (portal ou morte) e a proxima comeca: mundo NOVO.
 *
 * O acampamento e o mesmo — ele e definido por distancia a origem, entao a casa nao muda — mas
 * o mato la fora e resorteado. Isso e deliberado: se a semente ficasse parada, o jogador
 * decoraria onde ficam os portais e a pergunta "consigo voltar daqui?" — que e o modo inteiro —
 * viraria uma conta em vez de uma aposta.
 */
export const rerollExplorerWorld = (): void => {
  if (!run) return;
  run.seed = rollSeed();
  meta.stats.runs += 1;
  saveExplorerMeta(meta);
};

/** Sai do modo (voltar ao titulo). O banco ja esta salvo; o resto morre. */
export const endExplorerMode = (): void => {
  active = false;
  run = null;
  pendingArrival = null;
};

/**
 * Quanto vale uma moeda a esta distancia do acampamento. Cresce em DEGRAUS e nao continuamente:
 * o jogador precisa conseguir dizer "passei de nivel" enquanto anda, e um numero que sobe um
 * centesimo por passo nao e uma decisao, e um grafico.
 */
export const coinMultiplierAt = (distTiles: number): number =>
  Math.min(MAX_COIN_MULTIPLIER, 1 + Math.floor(Math.max(0, distTiles) / DEPTH_STEP_TILES));

/**
 * O quanto o escuro aperta a esta distancia. Sobe mais devagar que a recompensa, de proposito:
 * se o perigo crescesse no mesmo passo, andar mais fundo seria matematicamente neutro e a
 * decisao evaporaria. Aqui ir longe e um bom negocio — ate a bolsa ficar grande demais para
 * arriscar, que e exatamente onde o jogo quer que a duvida apareca.
 */
export const dangerScaleAt = (distTiles: number): number =>
  Math.min(MAX_DANGER_SCALE, 1 + Math.max(0, distTiles) / (DEPTH_STEP_TILES * 4));

/** Uma caveira caiu a `distTiles` do acampamento: quantas moedas ela larga. */
export const coinsForKill = (distTiles: number): number => coinMultiplierAt(distTiles);

export const addExplorerCoins = (amount: number): void => {
  if (!run) return;
  run.coins += amount;
};

export const noteExplorerKill = (): void => {
  if (run) run.kills += 1;
};

/** O HUD e o multiplicador leem a distancia daqui; a GameScene a escreve a cada passo. */
export const setExplorerDepth = (distTiles: number): void => {
  if (!run) return;
  run.depth = distTiles;
  run.maxDepth = Math.max(run.maxDepth, distTiles);
};

const settle = (keepFraction: number, kind: 'extract' | 'death'): ExplorerArrival => {
  const carried = run?.coins ?? 0;
  const depth = run?.maxDepth ?? 0;
  const kept = Math.floor(carried * keepFraction);
  const lost = carried - kept;

  meta.banked += kept;
  meta.stats.totalBanked += kept;
  meta.stats.bestHaul = Math.max(meta.stats.bestHaul, carried);
  meta.stats.bestDepth = Math.max(meta.stats.bestDepth, Math.floor(depth));
  if (kind === 'extract') meta.stats.extractions += 1;
  else meta.stats.deaths += 1;
  saveExplorerMeta(meta);

  if (run) {
    run.coins = 0;
    run.depth = 0;
    run.maxDepth = 0;
    run.kills = 0;
  }
  const arrival: ExplorerArrival = { kind, kept, lost, depth: Math.floor(depth) };
  pendingArrival = arrival;
  return arrival;
};

/** O heroi escolheu o portal: metade da bolsa vira banco, ele vive, e a proxima expedicao existe. */
export const extractToCamp = (): ExplorerArrival => settle(EXTRACT_KEEP, 'extract');

/** O escuro decidiu: 5% e o resto fica no mundo. */
export const loseRunToDeath = (): ExplorerArrival => settle(DEATH_KEEP, 'death');

/**
 * Lido UMA vez pela GameScene recem-criada, e consumido na leitura — a mesma regra do
 * portalTransition: um restart por qualquer outro motivo (o menu de pausa, uma recarga da
 * pagina) nao pode fazer o acampamento anunciar de novo uma volta que ja foi contada.
 */
export const consumeExplorerArrival = (): ExplorerArrival | null => {
  const arrival = pendingArrival;
  pendingArrival = null;
  return arrival;
};

/** As melhorias compradas atravessam expedicoes: a loja da fogueira e a progressao do modo. */
export const buyExplorerUpgrade = (id: keyof UpgradeState, cost: number): boolean => {
  if (meta.banked < cost) return false;
  meta.banked -= cost;
  meta.upgrades[id] += 1;
  saveExplorerMeta(meta);
  return true;
};
