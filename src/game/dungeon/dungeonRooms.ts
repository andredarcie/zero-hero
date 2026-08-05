import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import type { Rng } from './dungeonRandom';

/**
 * A SALA — e por que ela é EXATAMENTE UM CHUNK.
 *
 * A dungeon de hoje herdou a sala do cartucho: 16×11 tiles com anel de 2, desalinhada do chunk
 * 12×12 em que o jogo inteiro pensa. Aqui a sala passa a ser o chunk, e isso paga em quatro
 * lugares de uma vez: a câmera enquadra ~um chunk (**sala = tela**), a lei "uma espécie por tela"
 * vira literal em vez de aproximada, a densidade de covas já se mede por chunk, e o `visitedChunks`
 * do save já é a memória de onde o herói esteve. O editor também autora chunk — é o que faz a
 * biblioteca de templates existir de graça.
 *
 * Anel de parede de 1 tile por sala. Entre duas salas vizinhas isso dá **2 tiles de alvenaria**,
 * que é a espessura do Zelda, e é o que faz uma parede sem porta ler como maciça.
 *
 * ── O ESQUELETO VEM ANTES DA DECORAÇÃO ──────────────────────────────────────────────────────
 * Antes de qualquer forma ser pintada, as FAIXAS de cada porta até o miolo são reservadas. Uma
 * forma nunca pode selar uma porta porque ela não tem permissão de escrever ali — a conexão é
 * anterior ao desenho. Isso substitui o "gere e conserte" por "construa correto", que é a mesma
 * escolha que a acreção do Brogue faz: a estrutura nasce transitável.
 *
 * O que sobra de risco é ILHA — um pedaço de chão que a forma fechou por acidente. Esse o passo
 * final resolve: alaga de parede tudo o que o flood-fill do miolo não alcança. Chão inalcançável
 * dentro de uma sala é onde um tesouro nasce preso.
 */

/** As classes de tile. O retrato salvo guarda ISTO, nunca o frame (ver `dungeonSnapshot`). */
export const TILE = {
  floor: 0,
  wall: 1,
  /** Fosso: tile de mar. Bloqueia incondicionalmente e nada no jogo o remove. */
  pit: 2,
  /** Piso rachado — a marca de que ali houve parede. */
  cracked: 3,
  /** Alvenaria com tocha acesa: a única luz de uma dungeon (WallTorchObject varre o terreno). */
  torch: 4,
} as const;

export type TileClass = 0 | 1 | 2 | 3 | 4;
export type RoomGrid = TileClass[][];

export const ROOM_W = CHUNK_COLUMNS;
export const ROOM_H = CHUNK_ROWS;

/** Lados, na ordem N-L-S-O — a mesma de `PropDir` e a mesma dos frames direcionais. */
export type Side = 0 | 1 | 2 | 3;
export const SIDES: readonly Side[] = [0, 1, 2, 3];
export const sideBit = (side: Side): number => 1 << side;
export const hasDoor = (mask: number, side: Side): boolean => (mask & sideBit(side)) !== 0;
export const oppositeSide = (side: Side): Side => ((side + 2) % 4) as Side;

/** As duas colunas (ou linhas) por onde toda porta passa. Porta de 2 tiles: passagem, não agulha. */
const DOOR_A = 5;
const DOOR_B = 6;

/**
 * Coordenada na FAIXA de uma porta: `along` = quantos tiles para dentro (0 = o próprio anel),
 * `across` = qual das duas colunas da porta (0 ou 1).
 *
 * Existe para que toda construção que se apoia numa porta (a faixa protegida, o cabo, a placa, o
 * caixote, o portão) seja escrita UMA vez, em coordenada de faixa, e sirva aos quatro lados. A
 * alternativa é quatro cópias da mesma geometria, e três delas erradas.
 */
export const laneToXY = (side: Side, along: number, across: 0 | 1): { x: number; y: number } => {
  switch (side) {
    case 0: return { x: DOOR_A + across, y: along };
    case 1: return { x: ROOM_W - 1 - along, y: DOOR_A + across };
    case 2: return { x: DOOR_B - across, y: ROOM_H - 1 - along };
    default: return { x: along, y: DOOR_B - across };
  }
};

const inInterior = (x: number, y: number): boolean =>
  x >= 1 && y >= 1 && x <= ROOM_W - 2 && y <= ROOM_H - 2;

export type RoomShape =
  | 'vazia' | 'pilares' | 'anel' | 'alcovas' | 'fosso' | 'serpente'
  | 'poco' | 'salao' | 'dentes' | 'cela';

/** As formas que qualquer sala pode receber. O marco de cada dungeon sai de uma lista à parte. */
export const COMMON_SHAPES: readonly RoomShape[] = [
  'vazia', 'pilares', 'anel', 'alcovas', 'fosso', 'serpente', 'dentes', 'cela',
];

type Painter = (grid: RoomGrid, guard: boolean[][], rng: Rng) => void;

const put = (grid: RoomGrid, guard: boolean[][], x: number, y: number, cls: TileClass): void => {
  if (!inInterior(x, y) || guard[y][x]) return;
  grid[y][x] = cls;
};

const SHAPES: Record<RoomShape, Painter> = {
  vazia: () => { /* o salão liso: a sala em que a briga é o assunto inteiro */ },

  pilares: (grid, guard) => {
    for (let y = 2; y <= ROOM_H - 3; y += 2) {
      for (let x = 2; x <= ROOM_W - 3; x += 2) put(grid, guard, x, y, TILE.wall);
    }
  },

  anel: (grid, guard) => {
    for (let y = 2; y <= ROOM_H - 3; y++) {
      for (let x = 2; x <= ROOM_W - 3; x++) {
        const onRing = x === 2 || y === 2 || x === ROOM_W - 3 || y === ROOM_H - 3;
        if (onRing) put(grid, guard, x, y, TILE.wall);
      }
    }
  },

  alcovas: (grid, guard) => {
    const corners: ReadonlyArray<readonly [number, number]> = [[1, 1], [ROOM_W - 4, 1], [1, ROOM_H - 4], [ROOM_W - 4, ROOM_H - 4]];
    for (const [ox, oy] of corners) {
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
          // O miolo da alcova fica vazio: é um nicho, e nicho é onde um coração cabe.
          if (x === 1 && y === 1) continue;
          put(grid, guard, ox + x, oy + y, TILE.wall);
        }
      }
    }
  },

  fosso: (grid, guard) => {
    for (const [ox, oy] of [[2, 2], [ROOM_W - 5, 2], [2, ROOM_H - 5], [ROOM_W - 5, ROOM_H - 5]] as const) {
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) put(grid, guard, ox + x, oy + y, TILE.pit);
      }
    }
  },

  serpente: (grid, guard, rng) => {
    const flip = rng.chance(0.5);
    for (const [row, from, to] of [[3, 1, 8], [6, 3, 10], [9, 1, 8]] as const) {
      for (let x = from; x <= to; x++) {
        put(grid, guard, flip ? ROOM_W - 1 - x : x, row, TILE.wall);
      }
    }
  },

  poco: (grid, guard) => {
    // O poço: a sala inteira é fosso, e o que sobra são as faixas das portas. Ela lê como uma
    // ponte em cruz sobre o vazio — e é o marco mais barato que este gerador tem.
    for (let y = 2; y <= ROOM_H - 3; y++) {
      for (let x = 2; x <= ROOM_W - 3; x++) put(grid, guard, x, y, TILE.pit);
    }
  },

  salao: (grid, guard) => {
    for (const [x, y] of [[3, 3], [ROOM_W - 4, 3], [3, ROOM_H - 4], [ROOM_W - 4, ROOM_H - 4]] as const) {
      put(grid, guard, x, y, TILE.wall);
    }
  },

  dentes: (grid, guard) => {
    for (let x = 2; x <= ROOM_W - 3; x += 3) {
      put(grid, guard, x, 1, TILE.wall);
      put(grid, guard, x, 2, TILE.wall);
      put(grid, guard, x + 1, ROOM_H - 2, TILE.wall);
      put(grid, guard, x + 1, ROOM_H - 3, TILE.wall);
    }
  },

  cela: (grid, guard, rng) => {
    // Uma cela 4×4 num quadrante, com miolo vazio e uma fresta para a faixa mais próxima. O
    // conteúdo dela é visível de fora antes de ser alcançável — que é o que faz um jogador
    // atravessar a sala inteira por um coração.
    const ox = rng.chance(0.5) ? 1 : ROOM_W - 5;
    const oy = rng.chance(0.5) ? 1 : ROOM_H - 5;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const edge = x === 0 || y === 0 || x === 3 || y === 3;
        if (edge) put(grid, guard, ox + x, oy + y, TILE.wall);
      }
    }
    // A fresta, sempre virada para o centro da sala.
    const doorX = ox < ROOM_W / 2 ? ox + 3 : ox;
    put(grid, guard, doorX, oy + 1, TILE.floor);
    grid[oy + 1][doorX] = TILE.floor;
  },
};

/** Uma sala inteiramente maciça: as células da grade em que nenhum nó da missão caiu. */
export const solidRoom = (): RoomGrid =>
  Array.from({ length: ROOM_H }, () => Array.from({ length: ROOM_W }, () => TILE.wall as TileClass));

export type PaintedRoom = {
  grid: RoomGrid;
  /** As faixas reservadas — o conteúdo evita pousar nelas, para não entupir a passagem. */
  guard: boolean[][];
};

/**
 * Pinta uma sala: anel, faixas das portas, forma, e o alagamento final das ilhas.
 *
 * `mask` diz que lados têm porta; `shape` é a forma; `rng` decide as variações internas dela.
 */
export const paintRoom = (mask: number, shape: RoomShape, rng: Rng): PaintedRoom => {
  const grid: RoomGrid = Array.from({ length: ROOM_H }, (_, y) => Array.from(
    { length: ROOM_W },
    (_, x) => (inInterior(x, y) ? TILE.floor : TILE.wall) as TileClass,
  ));
  const guard: boolean[][] = Array.from({ length: ROOM_H }, () => new Array<boolean>(ROOM_W).fill(false));

  // O miolo 2×2 é sempre livre: é onde todas as faixas se encontram.
  for (let y = DOOR_A; y <= DOOR_B; y++) {
    for (let x = DOOR_A; x <= DOOR_B; x++) {
      grid[y][x] = TILE.floor;
      guard[y][x] = true;
    }
  }

  // As faixas: do anel até o miolo, duas colunas de largura. `along` vai até DOOR_A porque é ali
  // que a faixa encosta no miolo — daí em diante o quadrado central já garante o encontro.
  for (const side of SIDES) {
    if (!hasDoor(mask, side)) continue;
    for (let along = 0; along <= DOOR_A; along++) {
      for (const across of [0, 1] as const) {
        const { x, y } = laneToXY(side, along, across);
        grid[y][x] = TILE.floor;
        guard[y][x] = true;
      }
    }
  }

  SHAPES[shape](grid, guard, rng);

  // ── O ALAGAMENTO DAS ILHAS ──────────────────────────────────────────────────────────────
  // Flood a partir do miolo. O que não for alcançado e ainda for chão vira parede: chão fechado
  // dentro de uma sala não é segredo, é um lugar onde um tesouro nasce preso.
  const seen = Array.from({ length: ROOM_H }, () => new Array<boolean>(ROOM_W).fill(false));
  const stack: Array<readonly [number, number]> = [[DOOR_A, DOOR_A]];
  seen[DOOR_A][DOOR_A] = true;
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= ROOM_W || ny >= ROOM_H || seen[ny][nx]) continue;
      const cls = grid[ny][nx];
      if (cls !== TILE.floor && cls !== TILE.cracked) continue;
      seen[ny][nx] = true;
      stack.push([nx, ny]);
    }
  }
  for (let y = 0; y < ROOM_H; y++) {
    for (let x = 0; x < ROOM_W; x++) {
      if (!seen[y][x] && (grid[y][x] === TILE.floor || grid[y][x] === TILE.cracked)) grid[y][x] = TILE.wall;
    }
  }

  return { grid, guard };
};

/** Um tile é chão de andar? (Fosso e alvenaria não são, e a tocha é alvenaria acesa.) */
export const isWalkableClass = (cls: TileClass): boolean => cls === TILE.floor || cls === TILE.cracked;
