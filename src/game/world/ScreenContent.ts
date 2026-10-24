// Runtime types for per-chunk ("per-screen") content. The world is now finite and fully
// authored in world.json; placement of NPCs/pickups is data, read through
// WorldData.ts. The procedural generation that used to live here has moved to
// scripts/worldgen/ (seed tooling only). This module is intentionally side-effect-free so
// importing a value from it never pulls generation code into the
// game bundle.

export type PickupKind =
  | 'sword'
  | 'key'
  | 'axe'
  | 'pickaxe'
  | 'scythe'
  | 'shovel'
  | 'wood'
  | 'stone'
  | 'iron'
  | 'seeds'
  // A CADEIA DO FERRO tambem cai no chao: o forno cospe a esponja, a picareta cospe o minerio,
  // e o arbusto queimado deixa carvao. Os tres ja eram autorados em level (o level-4 planta os
  // tres) e ja nasciam em runtime — faltava so o TIPO reconhecer isso, e a falta derrubava o
  // editor: `PICKUP_VISUAL` e um Record sobre este tipo, e o que nao esta aqui nao tem arte la.
  | 'ore'
  | 'bloom'
  | 'charcoal'
  | 'bucket'
  // O COGUMELO: a coleta do micologo, e o que o heroi espeta no graveto na fogueira do fim.
  | 'mushroom';
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

export type PickupSpawn = {
  type: PickupKind;
  worldX: number;
  worldY: number;
};

export type NpcSpawn = {
  type: NpcKind;
  worldX: number;
  worldY: number;
  /** O roteiro DESTA instância (uma chave de `dialogs`); sem ele, o do tipo. Ver WorldNpcSpawn. */
  dialog?: string;
};

export type ScreenContent = {
  pickups: PickupSpawn[];
  npcs: NpcSpawn[];
};
