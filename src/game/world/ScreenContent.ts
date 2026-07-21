// Runtime types for per-chunk ("per-screen") content. The world is now finite and fully
// authored in world.json; placement of enemies/NPCs/pickups is data, read through
// WorldData.ts. The procedural generation that used to live here has moved to
// scripts/worldgen/ (seed tooling only). This module is intentionally side-effect-free so
// importing a value from it (ENEMY_BORDER_MARGIN) never pulls generation code into the
// game bundle.

// The skull ("undead") is the game's only enemy, and it is never authored: the world ships
// with zero enemies and the UndeadSpawnDirector summons skulls around the hero in the dark.
// The kind (and the per-chunk `enemies` arrays in world.json) remain only for schema compat.
export type EnemyKind = 'undead';
// 'heart' streams per chunk (HeartPickupManager); every other kind is a carriable held item
// loaded once by ItemManager (the hero can drop/swap them anywhere, so they persist off-screen).
export type PickupKind =
  | 'heart'
  | 'sword'
  | 'key'
  | 'axe'
  | 'greatAxe'
  | 'bomb'
  | 'lavaBoots'
  | 'pickaxe'
  | 'scythe'
  | 'wood'
  | 'stone'
  | 'iron'
  | 'seeds'
  | 'bucket'
  | 'battery';
export type NpcKind =
  | 'blackCat'
  | 'mimic'
  | 'astronaut'
  | 'businessMan'
  | 'radiationSuit'
  | 'painter'
  | 'salesman'
  | 'poet'
  | 'wizard'
  | 'death';

export type EnemySpawn = {
  type: EnemyKind;
  worldX: number;
  worldY: number;
};

export type PickupSpawn = {
  type: PickupKind;
  worldX: number;
  worldY: number;
};

export type NpcSpawn = {
  type: NpcKind;
  worldX: number;
  worldY: number;
};

export type ScreenContent = {
  enemies: EnemySpawn[];
  pickups: PickupSpawn[];
  npcs: NpcSpawn[];
};
