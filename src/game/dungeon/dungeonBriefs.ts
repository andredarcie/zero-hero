import type { EnemyKind, PickupKind } from '@/game/world/ScreenContent';

/**
 * O BRIEF — o que o gerador NÃO tem permissão de sortear.
 *
 * Uma dungeon gerada sem brief é um labirinto: ela pode ser grande, pequena, cheia de morcegos ou
 * de magos, e nada disso significa coisa alguma para o jogo em volta. O brief é o contrato com o
 * resto da aventura, e cada campo dele existe porque alguma coisa fora daqui depende dele:
 *
 * • **`treasure`** — a escada de ferramentas do overworld (picareta → balde → foice → machado de
 *   aço). Sortear isto quebraria a progressão do mundo inteiro: o jogo não tem outra fonte de
 *   picareta. Só a ARRUMAÇÃO é aleatória; a recompensa nunca.
 * • **`species` + `dens`** — a escada do bestiário. As primeiras dungeons ensinam o corpo mais
 *   fraco, as últimas cobram o repertório. E vale a lei: uma espécie por SALA, escolhida deste
 *   pool.
 * • **`rooms`** — 10 a 20, e isso é uma decisão de design contra o gerador: as nove de hoje têm
 *   até 57 salas e 157 covas, e o que uma dungeon de 57 salas pede do jogador é caminhada. Nível
 *   pequeno é mais interessante de gerar e mais interessante de jogar.
 * • **`locks`** — quais fechaduras esta dungeon pode usar. A primeira não usa nenhuma (ela ensina
 *   o ciclo), e cada uma seguinte entra quando o jogador já tem vocabulário para ela.
 * • **`landmark`** — a forma da sala do tesouro. É a resposta aos 10.000 pratos de aveia: o
 *   jogador precisa de UMA frase para lembrar de cada dungeon, e "tinha muitas salas" não é uma.
 */

/** As fechaduras que uma dungeon pode plantar. Ver `dungeonLocks` para o porquê de serem só duas. */
export type DungeonLock = 'key' | 'plate';

/** A forma da sala do tesouro — o marco daquela dungeon. */
export type DungeonLandmark = 'salao' | 'poco' | 'anel' | 'alcovas';

export type DungeonBrief = {
  level: number;
  name: string;
  /** A grade de salas em que o layout é embutido (células, não tiles). */
  gridW: number;
  gridH: number;
  /** Quantas salas a dungeon deve ter. O gerador chega nisto ou reprova. */
  rooms: number;
  species: readonly EnemyKind[];
  /** Covas por sala (a sala de entrada nunca recebe nenhuma). */
  dens: number;
  locks: readonly DungeonLock[];
  treasure: ReadonlyArray<readonly [PickupKind, number]>;
  landmark: DungeonLandmark;
};

/**
 * Os nomes continuam sendo os do Zelda 1 — não por nostalgia, mas porque eles já estão no
 * `world.json` (a boca de cada caverna) e na cabeça de quem jogou o overworld. A FORMA é que
 * deixou de ser a do cartucho.
 */
export const DUNGEON_BRIEFS: readonly DungeonBrief[] = [
  {
    level: 1,
    name: 'A Águia',
    gridW: 4,
    gridH: 4,
    rooms: 10,
    species: ['bat', 'slime'],
    dens: 1,
    locks: [],
    treasure: [['pickaxe', 1]],
    landmark: 'salao',
  },
  {
    level: 2,
    name: 'A Lua',
    gridW: 4,
    gridH: 4,
    rooms: 11,
    species: ['slime', 'spider'],
    dens: 1,
    locks: ['key'],
    treasure: [['bucket', 1]],
    landmark: 'anel',
  },
  {
    level: 3,
    name: 'O Manji',
    gridW: 5,
    gridH: 4,
    rooms: 12,
    species: ['spider', 'undead'],
    dens: 2,
    locks: ['key'],
    treasure: [['scythe', 1]],
    landmark: 'alcovas',
  },
  {
    level: 4,
    name: 'A Serpente',
    gridW: 5,
    gridH: 4,
    rooms: 13,
    species: ['undead', 'bat'],
    dens: 2,
    locks: ['key', 'plate'],
    // A PÁ, um degrau depois da foice (d3): a foice dá a semente, a pá dá o buraco — é a ordem
    // em que o loop da fazenda se completa na mão do jogador. Era um kit de gravetos, do tempo
    // em que o buraco só existia autorado (ver "os tesouros sobem de degrau" no progress.md).
    treasure: [['shovel', 1]],
    landmark: 'poco',
  },
  {
    level: 5,
    name: 'O Lagarto',
    gridW: 5,
    gridH: 5,
    rooms: 14,
    species: ['undead', 'spider', 'slime'],
    dens: 2,
    locks: ['key', 'plate'],
    // O PACOTE DE SEMENTES CARNÍVORAS, um degrau depois da pá (d4): com o kit da fazenda
    // completo, a d5 entrega a colheita que se defende sozinha. Era um kit de gravetos.
    treasure: [['carnivoreSeeds', 1], ['heart', 1]],
    landmark: 'salao',
  },
  {
    level: 6,
    name: 'O Dragão',
    gridW: 5,
    gridH: 5,
    rooms: 15,
    species: ['undead', 'mage'],
    dens: 2,
    locks: ['key', 'plate'],
    treasure: [['greatAxe', 1]],
    landmark: 'anel',
  },
  {
    level: 7,
    name: 'O Demônio',
    gridW: 6,
    gridH: 5,
    rooms: 16,
    species: ['bigslime', 'undead'],
    dens: 2,
    locks: ['key', 'plate'],
    treasure: [['stone', 3], ['heart', 1]],
    landmark: 'poco',
  },
  {
    level: 8,
    name: 'O Leão',
    gridW: 6,
    gridH: 5,
    rooms: 17,
    species: ['turret', 'undead'],
    dens: 2,
    locks: ['key', 'plate'],
    treasure: [['wood', 4], ['heart', 1]],
    landmark: 'alcovas',
  },
  {
    level: 9,
    name: 'A Morte',
    gridW: 6,
    gridH: 6,
    rooms: 20,
    species: ['mage', 'turret', 'bigslime', 'undead'],
    dens: 2,
    locks: ['key', 'plate'],
    treasure: [['heart', 2], ['wood', 2], ['stone', 2]],
    landmark: 'salao',
  },
];

export const DUNGEON_COUNT = DUNGEON_BRIEFS.length;

export const briefFor = (level: number): DungeonBrief => {
  const brief = DUNGEON_BRIEFS.find((b) => b.level === level);
  if (!brief) throw new Error(`dungeon ${level} nao tem brief (validos: 1..${DUNGEON_COUNT})`);
  return brief;
};
