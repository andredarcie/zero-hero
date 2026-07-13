import {
  PASSIVE_DEFS, WEAPON_DEFS, WEAPON_MAX_LEVEL,
  type PassiveKind, type WeaponKind,
} from './SurvivorsConfig';
import type { WeaponSystem } from './Weapons';

// ── As 3 escolhas do level-up ──────────────────────────────────────────────────
//
// O coração da decisão de build do VS: a cada nível, 3 opções sorteadas entre
// arma nova / nível de arma / passivo. O que o jogador JÁ possui pesa mais no
// sorteio (aprofundar a build > diluí-la), e quando não há mais o que oferecer,
// entram os consolos de ouro/cura — exatamente o fallback do VS.

export interface UpgradeChoice {
  type: 'weapon' | 'passive' | 'gold' | 'heal';
  weapon?: WeaponKind;
  passive?: PassiveKind;
  title: string;
  /** "NOVO!" | "NÍVEL n" | "" */
  badge: string;
  desc: string;
  icon: string;
}

const WEIGHT_OWNED = 3;
const WEIGHT_NEW = 2;

export const GOLD_CHOICE_AMOUNT = 25;
export const HEAL_CHOICE_AMOUNT = 30;

export const buildLevelUpChoices = (ws: WeaponSystem, count = 3): UpgradeChoice[] => {
  const pool: Array<{ weight: number; choice: UpgradeChoice }> = [];

  for (const def of Object.values(WEAPON_DEFS)) {
    const level = ws.weaponLevel(def.kind);
    const owned = ws.hasWeapon(def.kind);
    const evolved = ws.ownedWeapons().find((w) => w.kind === def.kind)?.evolved ?? false;
    if (evolved || level >= WEAPON_MAX_LEVEL) continue;
    pool.push({
      weight: owned ? WEIGHT_OWNED : WEIGHT_NEW,
      choice: {
        type: 'weapon',
        weapon: def.kind,
        title: def.name,
        badge: owned ? `NÍVEL ${level + 1}` : 'NOVO!',
        desc: def.desc,
        icon: def.icon,
      },
    });
  }

  for (const def of Object.values(PASSIVE_DEFS)) {
    const level = ws.passiveLevel(def.kind);
    if (level >= def.maxLevel) continue;
    pool.push({
      weight: level > 0 ? WEIGHT_OWNED : WEIGHT_NEW,
      choice: {
        type: 'passive',
        passive: def.kind,
        title: def.name,
        badge: level > 0 ? `NÍVEL ${level + 1}` : 'NOVO!',
        desc: def.desc,
        icon: def.icon,
      },
    });
  }

  const out: UpgradeChoice[] = [];
  while (out.length < count && pool.length > 0) {
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let roll = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i].weight;
      if (roll <= 0) { idx = i; break; }
    }
    out.push(pool[idx].choice);
    pool.splice(idx, 1);
  }

  // Build completa: o consolo de ouro/cura mantém o level-up sempre valendo algo.
  while (out.length < count) {
    out.push(out.length % 2 === 0
      ? { type: 'gold', title: 'Bolsa de Ouro', badge: `+${GOLD_CHOICE_AMOUNT}`, desc: 'Ouro para a loja de melhorias.', icon: 'coin' }
      : { type: 'heal', title: 'Assado da Fogueira', badge: `+${HEAL_CHOICE_AMOUNT}`, desc: 'Recupera vida na hora.', icon: 'heart' });
  }

  return out;
};

/** Um upgrade aleatório imediato (o rolo do baú). Null se a build está completa. */
export const randomChestUpgrade = (ws: WeaponSystem): UpgradeChoice | null => {
  const options = buildLevelUpChoices(ws, 1);
  const first = options[0];
  if (!first || first.type === 'gold' || first.type === 'heal') return null;
  return first;
};
