// ── Todo o balanceamento do modo Sobreviventes em um lugar só ─────────────────
//
// Modelado sobre o loop do Vampire Survivors: armas atacam sozinhas em cooldown,
// inimigos chegam em ondas por minuto cada vez mais densas, gemas de XP alimentam
// level-ups com 3 escolhas, arma no nível máximo + passivo par evolui via baú de
// elite, e A MORTE encerra a run aos 15:00. Números são a primeira passada de
// tuning — o playtest ajusta.

export type WeaponKind = 'sword' | 'axe' | 'scythe' | 'bomb' | 'torch' | 'aura';
export type PassiveKind = 'might' | 'boots' | 'amulet' | 'reach' | 'heart' | 'magnet';
export type SEnemyKind =
  | 'undead' | 'bat' | 'spider' | 'slime' | 'bigslime'
  | 'mage' | 'archer' | 'turret' | 'reaper';
export type EnemyShotKind = 'magic' | 'arrow' | 'bullet';

// ── Run ────────────────────────────────────────────────────────────────────────

export const RUN_DURATION_SEC = 15 * 60;
// Elites pontuam a run e são a ÚNICA fonte de baús (a fonte de evoluções) — o
// mesmo papel dos minibosses de minuto do VS.
export const ELITE_TIMES_SEC = [180, 360, 540, 720] as const;
export const ELITE_KINDS: readonly SEnemyKind[] = ['undead', 'slime', 'spider', 'bigslime'];
export const REAPER_WARNING_SEC = RUN_DURATION_SEC - 30;

export const PLAYER_BASE = {
  maxHp: 100,
  speedTilesPerSec: 4.4,
  invulnMs: 600,
  // Raio-base do ímã de gemas, em tiles (o passivo multiplica).
  magnetRadiusTiles: 1.6,
} as const;

// ── Curva de XP (a do VS: 5 para o nível 2, +10/nível até o 20, +13 depois) ──
export const xpToNextLevel = (level: number): number => {
  if (level < 20) return 5 + 10 * (level - 1);
  if (level < 40) return 195 + 13 * (level - 19);
  return 468 + 16 * (level - 39);
};

// ── Inimigos ───────────────────────────────────────────────────────────────────

export interface SEnemyDef {
  hp: number;
  speed: number; // tiles/s
  damage: number; // HP por toque (gate: invulnerabilidade do jogador)
  xp: number; // valor da gema dropada
  radius: number; // raio de colisão em tiles
  texKey: string;
  hurtTexKey?: string; // sem ela, o flash de dano é tint branco
  flies?: boolean; // morcegos flutuam (bob de elevação)
  hop?: boolean; // slimes pulam (bounce de escala)
  /** Tint permanente (diferencia variantes que dividem a mesma arte). */
  tint?: number;
  /** Não anda: controla área de onde nasceu (torreta). Nasce mais perto da vista. */
  stationary?: boolean;
  /** Kiter: mantém ESTA distância do herói, rodeando-o (mago). */
  keepDistanceTiles?: number;
  /** Investida: anda devagar e periodicamente dispara um bote (aranha). */
  dash?: { intervalMs: number; durationMs: number; speedMul: number; restMul: number };
  /** Ao morrer, divide-se nestes filhos (bigslime → 2 slimes) e deixa a poça. */
  splitsInto?: { kind: SEnemyKind; count: number; poolTexKey: string };
  /** Atirador: dispara projéteis quando o herói entra no alcance. */
  ranged?: {
    rangeTiles: number;
    cooldownMs: number;
    telegraphMs: number; // vento de "carregando" antes do tiro (reação do jogador)
    castTexKey?: string; // arte de conjuração durante o telegraph (mago)
    shot: EnemyShotKind;
    shotSpeed: number; // tiles/s
    shotDamage: number;
    /** N projéteis em leque radial em vez de um tiro mirado (torreta). */
    radial?: number;
  };
}

export const ENEMY_DEFS: Record<SEnemyKind, SEnemyDef> = {
  // HP calibrado contra a espada nível 1 (12 de dano ±10%): o undead do minuto
  // 0 morre em UM golpe — a fantasia de poder começa de pé, como no VS.
  undead: { hp: 9, speed: 1.7, damage: 6, xp: 1, radius: 0.34, texKey: 'undead', hurtTexKey: 'undead-hurt' },
  bat: { hp: 5, speed: 3.1, damage: 4, xp: 1, radius: 0.3, texKey: 'bat', hurtTexKey: 'bat-hurt', flies: true },
  // A aranha caça como aranha: rastejo espreitando, depois o BOTE.
  spider: {
    hp: 8, speed: 2.1, damage: 5, xp: 2, radius: 0.32, texKey: 'spider',
    dash: { intervalMs: 2200, durationMs: 550, speedMul: 2.6, restMul: 0.55 },
  },
  slime: { hp: 24, speed: 1.15, damage: 8, xp: 3, radius: 0.36, texKey: 'slime', hop: true },
  // O grandão estoura em dois filhotes — matar um vira matar três.
  bigslime: {
    hp: 65, speed: 0.95, damage: 11, xp: 8, radius: 0.4, texKey: 'bigslime', hop: true,
    splitsInto: { kind: 'slime', count: 2, poolTexKey: 'bigslime-pool' },
  },
  // O mago é um kiter: rodeia fora do alcance da espada e conjura bolas mágicas
  // (a arte de conjuração é o telegraph — dá tempo de sair da linha).
  mage: {
    hp: 10, speed: 2.0, damage: 5, xp: 3, radius: 0.32, texKey: 'mage', hurtTexKey: 'mage-hurt',
    keepDistanceTiles: 5.2,
    ranged: { rangeTiles: 7.5, cooldownMs: 2800, telegraphMs: 420, castTexKey: 'mage-cast', shot: 'magic', shotSpeed: 4.4, shotDamage: 10 },
  },
  // O arqueiro é o undead pálido que PARA para atirar: flecha rápida e rasa.
  archer: {
    hp: 11, speed: 1.4, damage: 6, xp: 2, radius: 0.34, texKey: 'undead', hurtTexKey: 'undead-hurt',
    tint: 0x9fd8ff,
    ranged: { rangeTiles: 7, cooldownMs: 3200, telegraphMs: 300, shot: 'arrow', shotSpeed: 7.5, shotDamage: 8 },
  },
  // A torreta não anda: nasce perto da vista e nega a área com leques radiais
  // de balas lentas — o "bullet hell de bolso" que força o jogador a se mover.
  turret: {
    hp: 40, speed: 0, damage: 6, xp: 6, radius: 0.36, texKey: 'turret',
    stationary: true,
    ranged: { rangeTiles: 9, cooldownMs: 3600, telegraphMs: 350, shot: 'bullet', shotSpeed: 3.2, shotDamage: 7, radial: 6 },
  },
  // A MORTE: intocável e mais rápida que o herói — encerra a run, como no VS.
  reaper: { hp: Number.MAX_SAFE_INTEGER, speed: 5.4, damage: 9999, xp: 0, radius: 0.42, texKey: 'npc-death' },
};

export const ELITE_HP_MUL = 32;
export const ELITE_XP = 50;
export const ELITE_GOLD = 25;

// ── Ondas (uma por minuto, como no VS) ─────────────────────────────────────────

export interface WaveDef {
  kinds: readonly SEnemyKind[];
  spawnIntervalMs: number;
  minAlive: number; // abaixo disso o director completa a cota imediatamente
  hpMul: number;
  speedMul: number;
}

// A variedade chega CEDO (pedido do jogador): aranha no minuto 1, mago no 2,
// arqueiro no 3, torreta no 4 — cada minuto apresenta um comportamento novo.
// A frequência é controlada repetindo kinds no array (sorteio uniforme):
// ['undead','undead','mage'] = mago em ~1/3 dos spawns.
export const WAVES: readonly WaveDef[] = [
  { kinds: ['undead', 'undead', 'undead', 'bat'], spawnIntervalMs: 1600, minAlive: 6, hpMul: 1.0, speedMul: 1.0 },
  { kinds: ['undead', 'undead', 'bat', 'spider'], spawnIntervalMs: 1250, minAlive: 12, hpMul: 1.15, speedMul: 1.0 },
  { kinds: ['undead', 'undead', 'bat', 'spider', 'mage'], spawnIntervalMs: 1000, minAlive: 18, hpMul: 1.3, speedMul: 1.0 },
  { kinds: ['undead', 'spider', 'slime', 'archer', 'mage'], spawnIntervalMs: 950, minAlive: 24, hpMul: 1.5, speedMul: 1.02 },
  { kinds: ['undead', 'bat', 'slime', 'mage', 'turret'], spawnIntervalMs: 850, minAlive: 30, hpMul: 1.75, speedMul: 1.04 },
  // Minuto 5: enxame de morcegos — o "evento" clássico de VS que força movimento.
  { kinds: ['bat', 'bat', 'bat', 'spider', 'archer'], spawnIntervalMs: 450, minAlive: 42, hpMul: 1.9, speedMul: 1.06 },
  { kinds: ['undead', 'slime', 'bat', 'mage', 'bigslime'], spawnIntervalMs: 800, minAlive: 44, hpMul: 2.2, speedMul: 1.06 },
  { kinds: ['undead', 'slime', 'spider', 'archer', 'turret'], spawnIntervalMs: 750, minAlive: 50, hpMul: 2.55, speedMul: 1.08 },
  { kinds: ['slime', 'bigslime', 'undead', 'mage'], spawnIntervalMs: 700, minAlive: 56, hpMul: 2.9, speedMul: 1.08 },
  // Minuto 9: enxame de aranhas, com arqueiros mordendo pelas costas.
  { kinds: ['spider', 'spider', 'spider', 'bat', 'archer'], spawnIntervalMs: 420, minAlive: 66, hpMul: 3.3, speedMul: 1.1 },
  { kinds: ['undead', 'bat', 'spider', 'slime', 'mage', 'turret'], spawnIntervalMs: 600, minAlive: 72, hpMul: 3.8, speedMul: 1.12 },
  { kinds: ['undead', 'bat', 'spider', 'slime', 'bigslime', 'archer'], spawnIntervalMs: 550, minAlive: 80, hpMul: 4.3, speedMul: 1.14 },
  { kinds: ['slime', 'bigslime', 'spider', 'mage', 'turret'], spawnIntervalMs: 500, minAlive: 88, hpMul: 4.9, speedMul: 1.16 },
  { kinds: ['undead', 'bat', 'spider', 'slime', 'bigslime', 'mage', 'archer'], spawnIntervalMs: 430, minAlive: 100, hpMul: 5.6, speedMul: 1.18 },
  // Minuto 14: o frenesi final antes d'A MORTE — o bestiário inteiro.
  { kinds: ['bat', 'spider', 'slime', 'bigslime', 'undead', 'mage', 'archer', 'turret'], spawnIntervalMs: 340, minAlive: 115, hpMul: 6.4, speedMul: 1.22 },
];

export const waveForTime = (elapsedSec: number): WaveDef =>
  WAVES[Math.min(WAVES.length - 1, Math.floor(elapsedSec / 60))];

// Teto duro de vivos: acima disso o director espera (o pool também é este tamanho).
export const MAX_ALIVE_ENEMIES = 130;

// ── Armas ──────────────────────────────────────────────────────────────────────

export interface WeaponLevelStats {
  damage: number;
  cooldownMs: number;
  // Multiplicador de alcance/raio, em tiles (sentido varia por arma: alcance do
  // arco da espada, raio da explosão da bomba, raio da órbita da tocha…).
  area: number;
  count: number;
  speed: number; // tiles/s de projétil (0 = não se aplica)
}

export interface WeaponDef {
  kind: WeaponKind;
  name: string;
  desc: string;
  icon: string; // key do textures3d — o DOM resolve o PNG via iconUrl()
  evolvePassive: PassiveKind;
  evolvedName: string;
  evolvedDesc: string;
  levels: readonly WeaponLevelStats[]; // 8 níveis
  evolved: WeaponLevelStats;
}

const W = (damage: number, cooldownMs: number, area: number, count: number, speed = 0): WeaponLevelStats =>
  ({ damage, cooldownMs, area, count, speed });

export const WEAPON_DEFS: Record<WeaponKind, WeaponDef> = {
  sword: {
    kind: 'sword',
    name: 'Espada do Zero',
    desc: 'Corta em arco na direção do movimento.',
    icon: 'sword-icon',
    evolvePassive: 'might',
    evolvedName: 'Lâmina do Herói',
    evolvedDesc: 'Corta dos dois lados, enorme.',
    levels: [
      W(12, 1250, 1.5, 1), W(15, 1200, 1.6, 1), W(18, 1150, 1.7, 1), W(22, 1100, 1.8, 1),
      W(26, 1050, 1.9, 1), W(30, 1000, 2.0, 1), W(35, 950, 2.1, 1), W(40, 900, 2.2, 1),
    ],
    evolved: W(62, 650, 2.6, 2),
  },
  axe: {
    kind: 'axe',
    name: 'Machado',
    desc: 'Gira em arco por cima, atravessando tudo.',
    icon: 'axe-icon',
    evolvePassive: 'boots',
    evolvedName: 'Machado Vulcânico',
    evolvedDesc: 'Uma tempestade de lâminas rodopiantes.',
    levels: [
      W(14, 1500, 1, 1, 7), W(17, 1450, 1, 1, 7), W(20, 1400, 1, 2, 7.5), W(24, 1350, 1.1, 2, 7.5),
      W(28, 1300, 1.1, 2, 8), W(32, 1250, 1.2, 3, 8), W(36, 1200, 1.2, 3, 8.5), W(42, 1150, 1.3, 3, 8.5),
    ],
    evolved: W(58, 850, 1.5, 5, 10),
  },
  scythe: {
    kind: 'scythe',
    name: 'Foice',
    desc: 'Voa até o inimigo mais próximo, perfurando.',
    icon: 'scythe-icon',
    evolvePassive: 'amulet',
    evolvedName: 'Ceifadora da Morte',
    evolvedDesc: 'Um leque de foices que atravessa a horda.',
    levels: [
      W(8, 950, 1, 1, 11), W(10, 900, 1, 1, 11), W(12, 850, 1, 2, 11.5), W(14, 800, 1, 2, 11.5),
      W(16, 750, 1, 2, 12), W(19, 700, 1, 3, 12), W(22, 650, 1, 3, 12.5), W(26, 600, 1, 3, 13),
    ],
    evolved: W(34, 380, 1, 6, 14),
  },
  bomb: {
    kind: 'bomb',
    name: 'Bomba',
    desc: 'Cai sobre um inimigo e explode em área.',
    icon: 'bomb-icon',
    evolvePassive: 'reach',
    evolvedName: 'Cataclismo',
    evolvedDesc: 'Um bombardeio que abre crateras.',
    levels: [
      W(20, 2700, 1.6, 1), W(24, 2600, 1.7, 1), W(28, 2500, 1.8, 1), W(33, 2400, 1.9, 1),
      W(38, 2300, 2.0, 2), W(43, 2200, 2.1, 2), W(48, 2100, 2.3, 2), W(54, 2000, 2.5, 2),
    ],
    evolved: W(85, 1500, 3.2, 3),
  },
  torch: {
    kind: 'torch',
    name: 'Tochas Orbitais',
    desc: 'Chamas giram ao seu redor, queimando quem encosta.',
    icon: 'wood-on-fire-icon',
    evolvePassive: 'magnet',
    evolvedName: 'Coroa de Fogo',
    evolvedDesc: 'Um anel de chamas famintas.',
    levels: [
      W(8, 0, 1.5, 1), W(10, 0, 1.55, 2), W(12, 0, 1.6, 2), W(14, 0, 1.65, 3),
      W(16, 0, 1.7, 3), W(18, 0, 1.75, 4), W(21, 0, 1.8, 4), W(24, 0, 1.9, 5),
    ],
    evolved: W(34, 0, 2.2, 7),
  },
  aura: {
    kind: 'aura',
    name: 'Calor da Fogueira',
    desc: 'Uma aura quente que fere quem se aproxima.',
    icon: 'campfire-icon',
    evolvePassive: 'heart',
    evolvedName: 'Alma da Fogueira',
    evolvedDesc: 'O fogo protege: fere mais e afasta a horda.',
    levels: [
      W(4, 750, 1.5, 1), W(5, 720, 1.6, 1), W(6, 690, 1.7, 1), W(7, 660, 1.8, 1),
      W(8, 630, 1.9, 1), W(9, 600, 2.0, 1), W(10, 560, 2.15, 1), W(12, 520, 2.3, 1),
    ],
    evolved: W(18, 380, 2.9, 1),
  },
};

export const WEAPON_MAX_LEVEL = 8;
export const STARTING_WEAPON: WeaponKind = 'sword';

// ── Passivos ───────────────────────────────────────────────────────────────────

export interface PassiveDef {
  kind: PassiveKind;
  name: string;
  desc: string;
  icon: string;
  maxLevel: number;
}

export const PASSIVE_DEFS: Record<PassiveKind, PassiveDef> = {
  might: { kind: 'might', name: 'Pedra de Amolar', desc: '+10% de dano por nível.', icon: 'pickaxe-icon', maxLevel: 5 },
  boots: { kind: 'boots', name: 'Botas de Lava', desc: '+8% de velocidade por nível.', icon: 'lava-boots-icon', maxLevel: 5 },
  amulet: { kind: 'amulet', name: 'Amuleto-Chave', desc: '-8% de recarga por nível.', icon: 'key-item-icon', maxLevel: 5 },
  reach: { kind: 'reach', name: 'Graveto Longo', desc: '+10% de área por nível.', icon: 'wood-icon', maxLevel: 5 },
  heart: { kind: 'heart', name: 'Coração Robusto', desc: '+15 de vida máxima e regeneração.', icon: 'heart', maxLevel: 5 },
  magnet: { kind: 'magnet', name: 'Talismã Magnético', desc: '+30% de raio de coleta por nível.', icon: 'coin', maxLevel: 5 },
};

// Bônus derivados dos passivos (multiplicadores aplicados pelo WeaponSystem).
export const passiveBonuses = (levels: ReadonlyMap<PassiveKind, number>) => {
  const lvl = (k: PassiveKind): number => levels.get(k) ?? 0;
  return {
    damageMul: 1 + 0.10 * lvl('might'),
    moveSpeedMul: 1 + 0.08 * lvl('boots'),
    cooldownMul: Math.pow(0.92, lvl('amulet')),
    areaMul: 1 + 0.10 * lvl('reach'),
    maxHpBonus: 15 * lvl('heart'),
    regenPerSec: 0.25 * lvl('heart'),
    magnetMul: 1 + 0.30 * lvl('magnet'),
  };
};

// ── Baú (o jackpot) ────────────────────────────────────────────────────────────

// Sem evolução pendente, o baú rola 1/3/5 upgrades — as odds do VS.
export const CHEST_UPGRADE_ODDS: ReadonlyArray<{ count: number; chance: number }> = [
  { count: 5, chance: 0.05 },
  { count: 3, chance: 0.25 },
  { count: 1, chance: 0.7 },
];
export const CHEST_GOLD_MIN = 20;
export const CHEST_GOLD_MAX = 80;

// ── Drops de chão ──────────────────────────────────────────────────────────────

export const DROP_CHANCE_HEART = 0.012;
export const DROP_CHANCE_COIN = 0.02;
export const DROP_CHANCE_MAGNET = 0.004;
export const COIN_GOLD_VALUE = 5;
export const HEART_HEAL_AMOUNT = 30;

// ── Metaprogressão (PowerUps permanentes, comprados com ouro entre runs) ──────

export type PowerUpKind =
  | 'power' | 'vigor' | 'haste' | 'cooldown' | 'attraction' | 'greed' | 'growth' | 'revival';

export interface PowerUpDef {
  kind: PowerUpKind;
  name: string;
  desc: string;
  maxRank: number;
  baseCost: number;
  costMul: number; // custo do rank n = baseCost * costMul^n
}

export const POWERUP_DEFS: Record<PowerUpKind, PowerUpDef> = {
  power: { kind: 'power', name: 'Poder', desc: '+4% de dano por rank.', maxRank: 5, baseCost: 40, costMul: 1.7 },
  vigor: { kind: 'vigor', name: 'Vigor', desc: '+10 de vida máxima por rank.', maxRank: 5, baseCost: 35, costMul: 1.7 },
  haste: { kind: 'haste', name: 'Rapidez', desc: '+3% de velocidade por rank.', maxRank: 5, baseCost: 35, costMul: 1.7 },
  cooldown: { kind: 'cooldown', name: 'Recarga', desc: '-3% de recarga por rank.', maxRank: 5, baseCost: 45, costMul: 1.7 },
  attraction: { kind: 'attraction', name: 'Atração', desc: '+12% de raio de coleta por rank.', maxRank: 5, baseCost: 30, costMul: 1.7 },
  greed: { kind: 'greed', name: 'Ganância', desc: '+10% de ouro por rank.', maxRank: 5, baseCost: 50, costMul: 1.7 },
  growth: { kind: 'growth', name: 'Crescimento', desc: '+5% de XP por rank.', maxRank: 5, baseCost: 50, costMul: 1.7 },
  revival: { kind: 'revival', name: 'Reviver', desc: 'Volta dos mortos uma vez por run.', maxRank: 1, baseCost: 500, costMul: 1 },
};

export const powerUpCost = (def: PowerUpDef, currentRank: number): number =>
  Math.round(def.baseCost * Math.pow(def.costMul, currentRank));

export const powerUpBonuses = (ranks: Readonly<Partial<Record<PowerUpKind, number>>>) => {
  const r = (k: PowerUpKind): number => ranks[k] ?? 0;
  return {
    damageMul: 1 + 0.04 * r('power'),
    maxHpBonus: 10 * r('vigor'),
    moveSpeedMul: 1 + 0.03 * r('haste'),
    cooldownMul: Math.pow(0.97, r('cooldown')),
    magnetMul: 1 + 0.12 * r('attraction'),
    goldMul: 1 + 0.10 * r('greed'),
    xpMul: 1 + 0.05 * r('growth'),
    revivals: r('revival'),
  };
};

// ── Recursos visuais compartilhados ───────────────────────────────────────────

// Ícones para o DOM (HUD, level-up, resultados). As keys 3D viram URLs de PNG.
const ICON_URLS: Record<string, string> = {
  'sword-icon': 'assets/ui/icons/sword_icon.png',
  'axe-icon': 'assets/ui/icons/axe_icon.png',
  'scythe-icon': 'assets/ui/icons/scythe_icon.png',
  'bomb-icon': 'assets/ui/icons/bomb_icon.png',
  'wood-on-fire-icon': 'assets/ui/icons/wood_on_fire_icon.png',
  'campfire-icon': 'assets/effects/fire/sprite_fire0.png',
  'pickaxe-icon': 'assets/ui/icons/pickaxe_icon.png',
  'lava-boots-icon': 'assets/ui/icons/lava_boots_icon.png',
  'key-item-icon': 'assets/ui/icons/key_icon.png',
  'wood-icon': 'assets/ui/icons/wood_icon.png',
  heart: 'assets/items/collectibles/heart.png',
  coin: 'assets/items/collectibles/coin.png',
};

export const iconUrl = (icon: string): string =>
  `${import.meta.env.BASE_URL}${ICON_URLS[icon] ?? ICON_URLS['sword-icon']}`;
