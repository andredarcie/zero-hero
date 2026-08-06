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

/**
 * A ESCADA — quantas espadadas cada corpo aguenta, e ela e ESTRITAMENTE CRESCENTE E SEM REPETICAO.
 *
 * A regra e uma so e vale pra sempre: nenhum corpo morre de um golpe, o mais fraco custa DOIS, e
 * cada especie seguinte custa exatamente um a mais que a anterior. Especie nova nao "escolhe um
 * HP" — ela entra num DEGRAU, e como nao ha degrau vago, entrar significa dizer de quem ela e mais
 * dificil. Um numero repetido aqui e duas especies que, na mao, sao a mesma.
 *
 * Isto existe porque a tabela anterior contradizia a propria lei da casa. A espada baixou de 999
 * para 2 de dano justamente para o telegrafo de cada especie ter tempo de acontecer — mas so a
 * caveira e a gosma foram reconferidas naquele dia. As outras seis ficaram com a vida da epoca em
 * que tudo morria no primeiro toque, e o resultado media-se assim: MORCEGO 1, MAGO 2, ARANHA 2,
 * ZORA 2 — quatro corpos de um golpe so. A aranha tem rastejo, agachada, bote, telegrafo e golpe,
 * uma gramatica inteira que so chegava a acontecer se ela te alcancasse primeiro, ou seja, so
 * quando o jogador ja estava perdendo. Nao faltava mecanica no combate: faltava o encontro DURAR o
 * suficiente pra mecanica que ja existia acontecer.
 *
 * A ORDEM e por quanto a especie custa pra resolver, e cada degrau se justifica pela frase dela:
 *
 *   2  MORCEGO    voa torto e nao tem golpe armado — estorvo, e ja e dificil de acertar;
 *   3  CAVEIRA    a professora, e o corpo mais comum do mundo: e a regua de todo o resto;
 *   4  GOSMA      lenta, sem medo da tocha, vem sempre — "aguenta pancada" e a frase dela;
 *   5  ARANHA     precisa viver o rastejo, a agachada e o bote pra ser a aranha;
 *   6  ZORA       nao se arremessa e escolhe a propria janela: mergulha e volta noutra agua;
 *   7  MAGO       se recusa a chegar perto, entao o custo dele e o tempo de fechar a distancia;
 *   8  GOSMA GDE  racha ao morrer: matar um vira matar tres, e ele e o unico que responde ao
 *                 golpe perfeito com MAIS trabalho;
 *   9  TORRETA    mobilia imovel que atira em leque. E o teto porque ela nao persegue ninguem —
 *                 nove golpes so custam caro pra quem ESCOLHE derrubar a parede em vez de passar.
 *
 * O intervalo entre dois acertos e o piso dos i-frames (HURT_INVULN_MS, 450ms), entao a escada
 * tambem e uma escada de TEMPO: 0,45s no morcego e 3,6s na torreta, em degraus de 0,45s.
 */
export const ENEMY_BLOWS: Readonly<Record<EnemyKind, number>> = {
  bat: 2,
  undead: 3,
  slime: 4,
  spider: 5,
  zora: 6,
  mage: 7,
  bigslime: 8,
  turret: 9,
};

/**
 * O dano de uma espadada. Mora AQUI, e nao junto da tabela de itens do GameScene, porque a vida de
 * cada corpo e derivada dele (ver `enemyMaxHealth`): com o numero nos dois lugares, mexer na espada
 * mudaria a escada inteira em silencio, que e exatamente o acidente que criou a tabela velha.
 */
export const SWORD_BLOW_DAMAGE = 2;

/** A vida de uma especie: o degrau dela vezes o dano da espada. Nunca escreva um HP a mao. */
export function enemyMaxHealth(kind: EnemyKind): number {
  return ENEMY_BLOWS[kind] * SWORD_BLOW_DAMAGE;
}

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
  | 'shovel'
  | 'wood'
  | 'stone'
  | 'iron'
  | 'seeds'
  | 'carnivoreSeeds'
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
