import { POWERUP_DEFS, powerUpCost, type PowerUpKind } from './SurvivorsConfig';

// ── Persistência entre runs (o gancho "só mais uma") ──────────────────────────
//
// Ouro sobrevive à morte e compra PowerUps permanentes — a metaprogressão que dá
// ao Vampire Survivors o seu "mesmo perdendo eu ganhei alguma coisa". Tudo em uma
// chave de localStorage, no padrão zh.* das outras preferências.

const STORAGE_KEY = 'zh.survivors.v1';

export interface SurvivorsMeta {
  gold: number;
  powerUps: Partial<Record<PowerUpKind, number>>;
  stats: {
    runs: number;
    wins: number;
    totalKills: number;
    bestTimeMs: number;
    bestLevel: number;
  };
}

const defaultMeta = (): SurvivorsMeta => ({
  gold: 0,
  powerUps: {},
  stats: { runs: 0, wins: 0, totalKills: 0, bestTimeMs: 0, bestLevel: 0 },
});

export const loadMeta = (): SurvivorsMeta => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultMeta();
    const parsed = JSON.parse(raw) as Partial<SurvivorsMeta>;
    const base = defaultMeta();
    return {
      gold: typeof parsed.gold === 'number' && parsed.gold >= 0 ? Math.floor(parsed.gold) : base.gold,
      powerUps: parsed.powerUps && typeof parsed.powerUps === 'object' ? parsed.powerUps : base.powerUps,
      stats: { ...base.stats, ...(parsed.stats ?? {}) },
    };
  } catch {
    return defaultMeta();
  }
};

export const saveMeta = (meta: SurvivorsMeta): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
  } catch { /* storage indisponível — a run continua, só não persiste */ }
};

/** Compra um rank do PowerUp se houver ouro e espaço; retorna se comprou. */
export const buyPowerUp = (meta: SurvivorsMeta, kind: PowerUpKind): boolean => {
  const def = POWERUP_DEFS[kind];
  const rank = meta.powerUps[kind] ?? 0;
  if (rank >= def.maxRank) return false;
  const cost = powerUpCost(def, rank);
  if (meta.gold < cost) return false;
  meta.gold -= cost;
  meta.powerUps[kind] = rank + 1;
  saveMeta(meta);
  return true;
};
