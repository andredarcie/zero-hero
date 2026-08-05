import {
  CHUNK_COLUMNS, CHUNK_ROWS, DUNGEON_TILES, SEA_TILE_FRAME, TILE_SIZE,
} from '@/game/constants';
import type { EnemyKind, PickupKind } from '@/game/world/ScreenContent';
import {
  WORLD_SCHEMA_VERSION, type WorldChunk, type WorldData, type WorldProp,
} from '@/game/world/worldSchema';
import { TILE, type TileClass } from './dungeonRooms';
import { tileHash } from './dungeonRandom';

/**
 * O RETRATO — a dungeon gerada, do tamanho de um save.
 *
 * A promessa é simples de dizer e cara de cumprir: **uma vez gerada, aquela dungeon é daquele save
 * para sempre**. Entrar, sair, morrer, fechar a aba, atualizar o jogo — e a planta é a mesma.
 *
 * O jeito óbvio (guardar o `world.json` da dungeon) custa medido 95 KB na menor e 183 KB na maior,
 * e nove delas estouram o orçamento de um `localStorage`. O jeito daqui guarda o SIGNIFICADO de
 * cada tile (chão, parede, fosso, rachado, tocha) em RLE e recalcula a ARTE da semente:
 *
 *     dungeon-1 (6.912 tiles)    95 KB cru   →  31 KB se guardasse o frame  →  4,0 KB de classe
 *     dungeon-9 (12.672 tiles)  183 KB cru   →  68 KB                       →  7,8 KB
 *
 * Os 31/68 KB do meio são a medida do erro que este arquivo evita: a variante de piso e de
 * alvenaria é sorteada tile a tile, então gravá-la é gravar ruído — 8× o tamanho para dizer o que
 * `tileHash(seed, x, y)` já diz de graça.
 *
 * ── POR QUE O RETRATO MANDA SOBRE A SEMENTE ─────────────────────────────────────────────────
 * A semente sozinha bastaria... enquanto o gerador não mudasse. Mudou (e ele vai mudar), a mesma
 * semente passa a dar outra planta, e o jogador que estava no meio da descida vê o mundo se
 * remontar em volta dele. Por isso a ordem de leitura é: **retrato primeiro, semente só se não
 * houver retrato** — e o retrato é gravado JÁ NA ENTRADA, não só na saída, senão a primeira aba
 * fechada apaga a dungeon que acabou de nascer.
 */

/**
 * A versão do gerador. Sobe quando a FORMA do retrato muda (uma classe nova, um campo novo) — não
 * quando o gerador passa a desenhar melhor. Retrato de versão antiga é lido do jeito que dá; o que
 * ele nunca é é jogado fora, porque jogar fora é exatamente remontar o mundo do jogador.
 */
export const DUNGEON_GENERATOR_VERSION = 1;

export type DungeonSnapshot = {
  v: number;
  level: number;
  seed: number;
  name: string;
  /** Tamanho em chunks (= em salas). */
  cw: number;
  ch: number;
  start: [number, number];
  /** RLE em pares (classe, quantidade), varrendo o mundo em linha, da esquerda para a direita. */
  tiles: number[];
  props: WorldProp[];
  enemies: Array<[EnemyKind, number, number]>;
  pickups: Array<[PickupKind, number, number]>;
};

// ── a arte, recalculada da semente ────────────────────────────────────────────

/**
 * O frame de cada classe. Piso e alvenaria têm três variantes cada, sorteadas pela COORDENADA
 * (nunca pela sequência do gerador — ver `dungeonRandom`), e a alvenaria ganha musgo e rachadura
 * em minoria só para a massa não ficar plana.
 */
export const framesForClass = (cls: TileClass, x: number, y: number, seed: number): { ground: number; upper: number | null } => {
  const g = tileHash(seed, x, y, 0x9a);
  const floor = DUNGEON_TILES.floors[Math.floor(g * DUNGEON_TILES.floors.length) % DUNGEON_TILES.floors.length];
  if (cls === TILE.pit) return { ground: SEA_TILE_FRAME, upper: null };
  if (cls === TILE.cracked) return { ground: DUNGEON_TILES.floorCracked, upper: null };
  if (cls === TILE.floor) return { ground: floor, upper: null };
  if (cls === TILE.torch) return { ground: floor, upper: DUNGEON_TILES.wallTorch };
  const v = tileHash(seed, x, y, 0x3b);
  const upper = v < 0.06
    ? DUNGEON_TILES.wallMoss
    : (v < 0.09
      ? DUNGEON_TILES.wallCracked
      : DUNGEON_TILES.walls[Math.floor(v * 97) % DUNGEON_TILES.walls.length]);
  return { ground: floor, upper };
};

/** O caminho de volta: de que classe é este par de frames. É o inverso exato de `framesForClass`. */
export const classForFrames = (ground: number, upper: number | null): TileClass => {
  if (upper === DUNGEON_TILES.wallTorch) return TILE.torch;
  if (upper !== null) return TILE.wall;
  if (ground === SEA_TILE_FRAME) return TILE.pit;
  if (ground === DUNGEON_TILES.floorCracked) return TILE.cracked;
  return TILE.floor;
};

// ── montar o mundo ────────────────────────────────────────────────────────────

export type MaterialiseInput = {
  level: number;
  seed: number;
  name: string;
  /** [y][x], em tiles do mundo inteiro. */
  classes: TileClass[][];
  props: WorldProp[];
  enemies: Array<{ type: EnemyKind; worldX: number; worldY: number }>;
  pickups: Array<{ type: PickupKind; worldX: number; worldY: number }>;
  start: { worldX: number; worldY: number };
};

/**
 * Classes + conteúdo → o `WorldData` que o runtime inteiro já sabe ler. É o buraco de fechadura:
 * a partir daqui nada no jogo sabe que esta dungeon não veio de um arquivo.
 *
 * `collisions` sai TUDO FALSO de propósito. Quem bloqueia é o FRAME (alvenaria em `upper`, mar no
 * `ground`), pelas regras implícitas de SOLID_UPPER_FRAMES/SOLID_GROUND_FRAMES — a mesma escolha
 * do `explorerWorld`, e pelo mesmo motivo: colisão pintada sobrevive ao tile que a justificava, e
 * o dia em que alguma coisa abrir uma parede aqui, a passagem abre junto.
 */
export const materialiseDungeon = (input: MaterialiseInput): WorldData => {
  const h = input.classes.length;
  const w = input.classes[0].length;
  const chunksX = Math.ceil(w / CHUNK_COLUMNS);
  const chunksY = Math.ceil(h / CHUNK_ROWS);

  const chunks: WorldChunk[] = [];
  for (let cy = 0; cy < chunksY; cy++) {
    for (let cx = 0; cx < chunksX; cx++) {
      const ground: number[][] = [];
      const upper: Array<Array<number | null>> = [];
      const collisions: boolean[][] = [];
      for (let ly = 0; ly < CHUNK_ROWS; ly++) {
        const gRow: number[] = [];
        const uRow: Array<number | null> = [];
        for (let lx = 0; lx < CHUNK_COLUMNS; lx++) {
          const x = cx * CHUNK_COLUMNS + lx;
          const y = cy * CHUNK_ROWS + ly;
          const cls = input.classes[y]?.[x] ?? TILE.wall;
          const frames = framesForClass(cls, x, y, input.seed);
          gRow.push(frames.ground);
          uRow.push(frames.upper);
        }
        ground.push(gRow);
        upper.push(uRow);
        collisions.push(new Array<boolean>(CHUNK_COLUMNS).fill(false));
      }
      chunks.push({
        cx,
        cy,
        ground,
        upper,
        collisions,
        enemies: input.enemies
          .filter((e) => Math.floor(e.worldX / CHUNK_COLUMNS) === cx && Math.floor(e.worldY / CHUNK_ROWS) === cy),
        pickups: input.pickups
          .filter((p) => Math.floor(p.worldX / CHUNK_COLUMNS) === cx && Math.floor(p.worldY / CHUNK_ROWS) === cy),
        npcs: [],
      });
    }
  }

  return {
    meta: {
      name: input.name,
      schemaVersion: WORLD_SCHEMA_VERSION,
      worldChunksX: chunksX,
      worldChunksY: chunksY,
      chunkColumns: CHUNK_COLUMNS,
      chunkRows: CHUNK_ROWS,
      tileSize: TILE_SIZE,
      tilesetKey: 'forest-tileset',
      playerStart: { ...input.start },
      // Mundo-puzzle: o cerco de undead fica desligado (as covas autoradas continuam valendo).
      puzzle: true,
      exportedAt: new Date(0).toISOString(),
    },
    chunks,
    props: input.props,
    dialogs: {},
    // O circuito da fechadura de placa existe declarado mesmo quando esta dungeon não tem uma: um
    // mundo que declara os nomes que os props dele citam é um mundo que o editor abre sem avisos.
    globalVariables: { 'dungeon-gate': false },
  };
};

// ── o retrato ─────────────────────────────────────────────────────────────────

const rleEncode = (values: readonly number[]): number[] => {
  const out: number[] = [];
  let current = values[0];
  let run = 0;
  for (const v of values) {
    if (v === current) { run++; continue; }
    out.push(current, run);
    current = v;
    run = 1;
  }
  out.push(current, run);
  return out;
};

const rleDecode = (pairs: readonly number[], total: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    for (let n = 0; n < pairs[i + 1]; n++) out.push(pairs[i]);
  }
  while (out.length < total) out.push(TILE.wall);
  return out;
};

/** Fotografa o mundo VIVO (não o gerado): terreno editado lá dentro entra no retrato ao sair. */
export const snapshotDungeon = (world: WorldData, level: number, seed: number): DungeonSnapshot => {
  const cw = world.meta.worldChunksX;
  const ch = world.meta.worldChunksY;
  const w = cw * CHUNK_COLUMNS;
  const h = ch * CHUNK_ROWS;
  const byKey = new Map(world.chunks.map((c) => [`${c.cx},${c.cy}`, c]));
  const flat: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const chunk = byKey.get(`${Math.floor(x / CHUNK_COLUMNS)},${Math.floor(y / CHUNK_ROWS)}`);
      if (!chunk) { flat.push(TILE.wall); continue; }
      const ly = y % CHUNK_ROWS;
      const lx = x % CHUNK_COLUMNS;
      flat.push(classForFrames(chunk.ground[ly][lx], chunk.upper[ly][lx]));
    }
  }

  const enemies: Array<[EnemyKind, number, number]> = [];
  const pickups: Array<[PickupKind, number, number]> = [];
  for (const chunk of world.chunks) {
    for (const e of chunk.enemies ?? []) enemies.push([e.type, e.worldX, e.worldY]);
    for (const p of chunk.pickups ?? []) pickups.push([p.type, p.worldX, p.worldY]);
  }

  return {
    v: DUNGEON_GENERATOR_VERSION,
    level,
    seed,
    name: world.meta.name,
    cw,
    ch,
    start: [world.meta.playerStart.worldX, world.meta.playerStart.worldY],
    tiles: rleEncode(flat),
    props: world.props,
    enemies,
    pickups,
  };
};

export const worldFromSnapshot = (snap: DungeonSnapshot): WorldData => {
  const w = snap.cw * CHUNK_COLUMNS;
  const h = snap.ch * CHUNK_ROWS;
  const flat = rleDecode(snap.tiles, w * h);
  const classes: TileClass[][] = [];
  for (let y = 0; y < h; y++) {
    classes.push(flat.slice(y * w, (y + 1) * w) as TileClass[]);
  }
  return materialiseDungeon({
    level: snap.level,
    seed: snap.seed,
    name: snap.name,
    classes,
    props: snap.props,
    enemies: snap.enemies.map(([type, worldX, worldY]) => ({ type, worldX, worldY })),
    pickups: snap.pickups.map(([type, worldX, worldY]) => ({ type, worldX, worldY })),
    start: { worldX: snap.start[0], worldY: snap.start[1] },
  });
};
