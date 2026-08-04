// Runtime types for per-chunk ("per-screen") content. The world is now finite and fully
// authored in world.json; placement of enemies/NPCs/pickups is data, read through
// WorldData.ts. The procedural generation that used to live here has moved to
// scripts/worldgen/ (seed tooling only). This module is intentionally side-effect-free so
// importing a value from it (ENEMY_BORDER_MARGIN) never pulls generation code into the
// game bundle.

// A FAUNA. Um inimigo chega por duas portas, e elas nao oferecem as mesmas especies:
//
//  - o CERCO (UndeadSpawnDirector) invoca no escuro, em volta do heroi, e so caveira — ele e
//    pressao ambiente, e um bestiario sorteado ali seria ruido que ninguem autorou;
//  - a COVA AUTORADA (`chunk.enemies`, a aba Inimigos do editor) faz UM corpo num tile escolhido
//    a mao e outro ENEMY_RESPAWN_MS depois que aquele cai (EnemySpawnerManager) — e ela aceita
//    qualquer especie desta lista, porque ali quem escolheu foi o autor.
//
// Cada especie e uma FRASE diferente, nao um numero diferente (ver os arquivos em
// entities/enemies/): a caveira telegrafa o golpe, o morcego atravessa o rio, a aranha espreita
// e da o bote, a gosma nao teme a tocha, a torreta nao anda e atira em leque, o mago se recusa
// a chegar perto. Especie nova aqui e cobrada pelo compilador em ENEMY_VISUAL (o editor) e na
// fabrica do EnemyManager — os dois lugares que nao podem ficar sem resposta.
export type EnemyKind = 'undead' | 'bat' | 'spider' | 'slime' | 'bigslime' | 'turret' | 'mage' | 'zora';

/**
 * QUEM VOA — e a unica coisa que muda o mundo de uma especie pra outra.
 *
 * Voar aparece em tres lugares que precisam concordar: o corpo, que atravessa rio e lava
 * (EnemyBase.flies le daqui, entao nenhuma classe repete a informacao), a COVA, que precisa aceitar
 * um tile de agua quando o que vai nascer tem asa (GameScene.canSpawnAuthoredEnemyAt), e o aviso do
 * Salvar no editor, que senao denunciaria como "tile bloqueado" uma cova de morcego perfeitamente
 * boa. Tres copias desta lista seria o jeito garantido de as tres discordarem daqui a um mes.
 *
 * O MAR nao entra nisso: ele e bloqueio implicito de terreno — a moldura do mundo —, e nada no jogo
 * o atravessa, com asa ou sem (ver SOLID_GROUND_FRAMES).
 */
export const FLYING_ENEMY_KINDS: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['bat']);

/**
 * QUEM MORA NA AGUA — a regra de tile INVERTIDA, e a unica no jogo.
 *
 * Todo corpo do jogo recusa agua (ela e hazard); o morcego a tolera porque voa. O zora e o oposto
 * dos dois: ele **so** existe em cima de um tile de rio, e um tile seco e que e o lugar impossivel
 * pra ele. Isso vira do avesso as tres perguntas que a especie responde:
 *
 * - a COVA dele so abre em cima de agua (GameScene.canSpawnAuthoredEnemyAt);
 * - o aviso do Salvar denuncia a cova dele que esta em terra — o inverso de todas as outras;
 * - e ele nao "anda com hazard liberado": ele nao anda, ele MERGULHA e reaparece em outra agua.
 *
 * Ele tambem e a razao de o rio deixar de ser so obstaculo: ate aqui a agua era uma parede que se
 * atravessa com ponte, e agora ela e um lugar de onde sai coisa.
 */
export const AQUATIC_ENEMY_KINDS: ReadonlySet<EnemyKind> = new Set<EnemyKind>(['zora']);
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
