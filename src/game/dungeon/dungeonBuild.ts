import type { EnemyKind, PickupKind } from '@/game/world/ScreenContent';
import type { WorldData, WorldProp } from '@/game/world/worldSchema';
import { briefFor, type DungeonBrief, type DungeonLock } from './dungeonBriefs';
import { embedMission, sideBetween, type Cell, type Placement } from './dungeonLayout';
import { buildMission, type Mission, type MissionRole } from './dungeonMission';
import { Rng, mixSeed, tileHash } from './dungeonRandom';
import {
  COMMON_SHAPES, ROOM_H, ROOM_W, SIDES, TILE, hasDoor, isWalkableClass, laneToXY, oppositeSide,
  paintRoom, sideBit, type RoomShape, type TileClass,
} from './dungeonRooms';
import { materialiseDungeon } from './dungeonSnapshot';
import { pickTemplate, type RoomTemplate } from './dungeonTemplates';
import { verifyDungeon } from './dungeonVerify';

/**
 * O CONSTRUTOR — onde a missão vira mapa, e onde ficam as decisões que o resto do jogo cobra.
 *
 * A ordem aqui é a tese inteira do gerador: **missão → espaço → sala → conteúdo → juiz**. Cada
 * passo só sabe do anterior, e nenhum deles pode consertar o seguinte. Quando o juiz reprova, o
 * remédio nunca é remendar a planta: é sortear outra dungeon com a semente seguinte. Uma planta
 * remendada é uma planta cuja garantia ninguém consegue mais enunciar.
 *
 * ── O QUE ESTE ARQUIVO PROMETE PARA FORA ────────────────────────────────────────────────────
 * • Uma espécie por SALA, do pool do brief, e cova nenhuma na sala de entrada nem a menos de
 *   `DEN_CLEAR_TILES` da escada — os primeiros passos de uma dungeon são leitura, não briga.
 * • O tesouro do brief na sala do objetivo, atrás da fechadura do ciclo.
 * • Coração como única cura (não existe fogueira aqui — luz de fogueira é parede para monstro, e
 *   uma delas lá dentro reescreveria o encontro).
 * • Colisão vinda do FRAME, nunca pintada (ver `materialiseDungeon`).
 */

const MAX_ATTEMPTS = 24;
/** Nem cova nem coração a menos disto da escada de entrada/saída (o mesmo raio do gerador antigo). */
const DEN_CLEAR_TILES = 6;
/** Duas covas nunca coladas: elas têm de ser dois encontros, não um. */
const DEN_SPACING = 2;
/** Um coração a cada tantas salas fundas. */
const ROOMS_PER_HEART = 4;

export type Tile = { x: number; y: number };

export type DungeonRoomInfo = {
  id: number;
  role: MissionRole;
  cell: Cell;
  /** Bitmask N-L-S-O dos lados com porta. */
  doors: number;
  originX: number;
  originY: number;
  shape: RoomShape | 'template';
  species: EnemyKind | null;
  depth: number;
};

export type DungeonEdgeInfo = {
  a: number;
  b: number;
  loop?: 'a' | 'b';
  gate?: DungeonLock;
  /** Os quatro tiles do corredor: dois no anel de cada sala. */
  tiles: Tile[];
};

export type DungeonLockInfo = {
  kind: DungeonLock;
  /** Onde o prop que bloqueia mora (dois tiles: a porta tem duas colunas). */
  gateTiles: Tile[];
  keyTile?: Tile;
  plateTile?: Tile;
  crateTile?: Tile;
  /** Por onde o caixote é empurrado até a placa, do caixote para a placa. */
  pushLane?: Tile[];
};

export type DungeonPlan = {
  level: number;
  seed: number;
  cycle: string;
  brief: DungeonBrief;
  rooms: DungeonRoomInfo[];
  edges: DungeonEdgeInfo[];
  locks: DungeonLockInfo[];
  start: Tile;
  portal: Tile;
  treasure: Tile[];
  entranceRoom: number;
  goalRoom: number;
  /** O caminho de emergência: sem ciclo, sem fechadura. O juiz não cobra loop dele. */
  linear: boolean;
};

export type BuiltDungeon = {
  world: WorldData;
  plan: DungeonPlan;
  /** Quantas sementes foram precisas até uma passar no juiz. */
  attempts: number;
  /** Por que cada tentativa reprovada reprovou — é o que a auditoria conta. */
  rejects: string[];
};

// ── as formas por papel ───────────────────────────────────────────────────────

/** A sala do objetivo usa o marco do brief; a antessala precisa de chão livre para a fechadura. */
const SAFE_SHAPES: readonly RoomShape[] = ['vazia', 'salao', 'pilares', 'dentes'];

const shapeFor = (role: MissionRole, brief: DungeonBrief, rng: Rng): RoomShape => {
  if (role === 'goal') return brief.landmark;
  if (role === 'entrance') return rng.chance(0.5) ? 'vazia' : 'salao';
  if (role === 'antechamber') return rng.pick(SAFE_SHAPES);
  if (role === 'arena') return rng.chance(0.6) ? 'vazia' : 'pilares';
  return rng.pick(COMMON_SHAPES);
};

// ── montagem ──────────────────────────────────────────────────────────────────

type Draft = { world: WorldData; plan: DungeonPlan };

const assemble = (
  brief: DungeonBrief,
  seed: number,
  mission: Mission,
  placement: Placement,
  rng: Rng,
  library: readonly RoomTemplate[],
): Draft => {
  const W = brief.gridW * ROOM_W;
  const H = brief.gridH * ROOM_H;
  const classes: TileClass[][] = Array.from({ length: H }, () => new Array<TileClass>(W).fill(TILE.wall));
  const guard: boolean[][] = Array.from({ length: H }, () => new Array<boolean>(W).fill(false));

  // A profundidade de cada sala, em salas, a partir da entrada. É ela que decide o que é "fundo":
  // coração, e a ordem em que o conteúdo é distribuído.
  const depth = new Map<number, number>([[mission.entrance, 0]]);
  const queue = [mission.entrance];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const edge of mission.edges) {
      const next = edge.a === id ? edge.b : (edge.b === id ? edge.a : -1);
      if (next < 0 || depth.has(next)) continue;
      depth.set(next, (depth.get(id) ?? 0) + 1);
      queue.push(next);
    }
  }

  // ── as portas ───────────────────────────────────────────────────────────────
  const doors = new Map<number, number>();
  const edges: DungeonEdgeInfo[] = [];
  for (const edge of mission.edges) {
    const ca = placement.get(edge.a)!;
    const cb = placement.get(edge.b)!;
    const side = sideBetween(ca, cb);
    doors.set(edge.a, (doors.get(edge.a) ?? 0) | sideBit(side));
    doors.set(edge.b, (doors.get(edge.b) ?? 0) | sideBit(oppositeSide(side)));
    const tiles: Tile[] = [];
    for (const across of [0, 1] as const) {
      const a = laneToXY(side, 0, across);
      const b = laneToXY(oppositeSide(side), 0, across);
      tiles.push({ x: ca.gx * ROOM_W + a.x, y: ca.gy * ROOM_H + a.y });
      tiles.push({ x: cb.gx * ROOM_W + b.x, y: cb.gy * ROOM_H + b.y });
    }
    edges.push({ a: edge.a, b: edge.b, loop: edge.loop, gate: edge.gate, tiles });
  }

  // ── as salas ────────────────────────────────────────────────────────────────
  const rooms: DungeonRoomInfo[] = [];
  for (const node of mission.nodes) {
    const cell = placement.get(node.id)!;
    const mask = doors.get(node.id) ?? 0;
    const originX = cell.gx * ROOM_W;
    const originY = cell.gy * ROOM_H;
    const shape = shapeFor(node.role, brief, rng);

    // Template só entra em sala GENÉRICA: entrada, objetivo, antessala e arena têm contrato
    // (escada, tesouro, fechadura, espaço para brigar) e uma peça autorada não sabe disso.
    const generic = node.role === 'plain' || node.role === 'reward' || node.role === 'rest' || node.role === 'key';
    const template = generic ? pickTemplate(library, mask, rng) : null;
    const painted = template ? { grid: template, guard: laneGuard(mask) } : paintRoom(mask, shape, rng);

    for (let y = 0; y < ROOM_H; y++) {
      for (let x = 0; x < ROOM_W; x++) {
        classes[originY + y][originX + x] = painted.grid[y][x];
        guard[originY + y][originX + x] = painted.guard[y][x];
      }
    }
    rooms.push({
      id: node.id,
      role: node.role,
      cell,
      doors: mask,
      originX,
      originY,
      shape: template ? 'template' : shape,
      species: null,
      depth: depth.get(node.id) ?? 0,
    });
  }

  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const at = (t: Tile): TileClass => classes[t.y]?.[t.x] ?? TILE.wall;
  const carve = (t: Tile): void => { if (classes[t.y]?.[t.x] !== undefined) classes[t.y][t.x] = TILE.floor; };
  const occupied = new Set<string>();
  const take = (t: Tile): void => { occupied.add(`${t.x},${t.y}`); };
  const isFree = (t: Tile): boolean =>
    isWalkableClass(at(t)) && !occupied.has(`${t.x},${t.y}`);

  const roomTile = (room: DungeonRoomInfo, x: number, y: number): Tile =>
    ({ x: room.originX + x, y: room.originY + y });

  /** Tiles livres de uma sala, do centro para fora — conteúdo pousa onde se vê ao entrar. */
  const freeTilesOf = (room: DungeonRoomInfo, avoidGuard = true): Tile[] => {
    const out: Tile[] = [];
    for (let y = 1; y < ROOM_H - 1; y++) {
      for (let x = 1; x < ROOM_W - 1; x++) {
        const t = roomTile(room, x, y);
        if (!isFree(t)) continue;
        if (avoidGuard && guard[t.y][t.x]) continue;
        out.push(t);
      }
    }
    return out.sort((a, b) => {
      const da = Math.abs(a.x - room.originX - 5.5) + Math.abs(a.y - room.originY - 5.5);
      const db = Math.abs(b.x - room.originX - 5.5) + Math.abs(b.y - room.originY - 5.5);
      return da - db;
    });
  };

  // ── a escada de entrada, e o herói um tile acima dela ───────────────────────
  const entranceRoom = roomById.get(mission.entrance)!;
  const portalCandidates = [
    ...freeTilesOf(entranceRoom, false).filter((t) => t.y >= entranceRoom.originY + 6),
    ...freeTilesOf(entranceRoom, false),
  ];
  const portal = portalCandidates[0] ?? roomTile(entranceRoom, 5, 5);
  take(portal);
  const above: Tile = { x: portal.x, y: portal.y - 1 };
  // Nascer EM CIMA do portal seria seguro (pisar só conta ao ENTRAR num tile), mas o primeiro
  // passo para trás sairia da dungeon sem querer. Um tile acima, a saída é um passo deliberado
  // para o sul — exatamente onde o Zelda a põe.
  const start = isWalkableClass(at(above)) ? above : portal;
  take(start);

  const props: WorldProp[] = [{ type: 'levelPortal', worldX: portal.x, worldY: portal.y }];

  // ── as fechaduras ──────────────────────────────────────────────────────────
  const locks: DungeonLockInfo[] = [];
  const gateEdge = edges.find((e) => e.gate);
  if (gateEdge) {
    const ante = roomById.get(gateEdge.a === mission.goal ? gateEdge.b : gateEdge.a)!;
    const goalCell = placement.get(mission.goal)!;
    const side = sideBetween(ante.cell, goalCell);
    const lane = (along: number, across: 0 | 1): Tile => {
      const p = laneToXY(side, along, across);
      return { x: ante.originX + p.x, y: ante.originY + p.y };
    };
    const gateTiles = [lane(0, 0), lane(0, 1)];

    if (gateEdge.gate === 'key') {
      for (const t of gateTiles) {
        props.push({ type: 'lockedDoor', worldX: t.x, worldY: t.y });
        take(t);
      }
      const keyRoom = rooms.find((r) => r.role === 'key') ?? rooms.find((r) => r.role === 'reward');
      const keyTile = keyRoom ? freeTilesOf(keyRoom)[0] ?? freeTilesOf(keyRoom, false)[0] : undefined;
      if (keyTile) take(keyTile);
      locks.push({ kind: 'key', gateTiles, keyTile });
    } else {
      // A PLACA, construída em coordenada de FAIXA — a mesma geometria serve aos quatro lados.
      //
      //   [portão][portão]     along 0   ← o corredor para o objetivo
      //   [cabo  ][cabo  ]     along 1   ← energiza os dois portões
      //   [cabo  ]             along 2
      //   [placa ]             along 3   ← o caixote pousa aqui e a rede acende
      //   [livre ]             along 4   ← o caixote atravessa
      //   [caixa ]             along 5
      //   [herói ]             along 6   ← e empurra para o norte
      //
      // A coluna `across = 1` fica limpa de propósito: é por ela que o herói passa depois de o
      // portão subir. Sem ela, o próprio caixote que resolveu o puzzle selaria o corredor.
      for (const t of gateTiles) {
        props.push({ type: 'electronicGate', worldX: t.x, worldY: t.y });
        take(t);
      }
      for (const t of [lane(1, 0), lane(1, 1), lane(2, 0)]) {
        props.push({ type: 'wire', worldX: t.x, worldY: t.y });
        take(t);
      }
      const plateTile = lane(3, 0);
      const crateTile = lane(5, 0);
      const pushLane = [lane(4, 0), lane(3, 0)];
      // O empurrão precisa de chão atrás do caixote: a faixa protegida vai até `along` 5, e o
      // tile em que o herói se planta (6) pode ter caído numa forma. Cavar é sempre seguro.
      carve(lane(6, 0));
      props.push({ type: 'pressurePlate', worldX: plateTile.x, worldY: plateTile.y, variable: 'dungeon-gate' });
      props.push({ type: 'woodenCrate', worldX: crateTile.x, worldY: crateTile.y });
      take(plateTile);
      take(crateTile);
      locks.push({ kind: 'plate', gateTiles, plateTile, crateTile, pushLane });
    }
  }

  // ── o tesouro ──────────────────────────────────────────────────────────────
  const goalRoom = roomById.get(mission.goal)!;
  const pickups: Array<{ type: PickupKind; worldX: number; worldY: number }> = [];
  const treasure: Tile[] = [];
  const goalSpots = [...freeTilesOf(goalRoom), ...freeTilesOf(goalRoom, false)];
  for (const [type, count] of brief.treasure) {
    for (let n = 0; n < count; n++) {
      const t = goalSpots.find((cand) => isFree(cand));
      if (!t) break;
      take(t);
      pickups.push({ type, worldX: t.x, worldY: t.y });
      treasure.push(t);
    }
  }

  const keyLock = locks.find((l) => l.kind === 'key');
  if (keyLock?.keyTile) {
    pickups.push({ type: 'key', worldX: keyLock.keyTile.x, worldY: keyLock.keyTile.y });
  }

  // ── as covas: uma espécie por SALA ─────────────────────────────────────────
  const enemies: Array<{ type: EnemyKind; worldX: number; worldY: number }> = [];
  const farFromStairs = (t: Tile): boolean =>
    Math.hypot(t.x - portal.x, t.y - portal.y) > DEN_CLEAR_TILES;
  for (const room of [...rooms].sort((a, b) => a.depth - b.depth)) {
    if (room.role === 'entrance') continue;
    const target = room.role === 'arena' ? brief.dens + 2 : brief.dens;
    // Sala apertada não recebe bigslime (ele se divide; sala justa vira purê inescapável) nem a
    // segunda cova.
    const spots = freeTilesOf(room);
    const tight = spots.length < 20;
    const pool = brief.species.filter((k) => !(tight && k === 'bigslime'));
    const kind = pool.length > 0 ? rng.pick(pool) : brief.species[0];
    room.species = kind;
    const placed: Tile[] = [];
    for (const t of rng.shuffled(spots)) {
      if (placed.length >= (tight ? Math.min(1, target) : target)) break;
      if (!farFromStairs(t) || !isFree(t)) continue;
      if (!placed.every((p) => Math.max(Math.abs(p.x - t.x), Math.abs(p.y - t.y)) >= DEN_SPACING)) continue;
      placed.push(t);
      take(t);
      enemies.push({ type: kind, worldX: t.x, worldY: t.y });
    }
  }

  // ── os corações das salas fundas (a única cura aqui dentro) ────────────────
  const deep = [...rooms].sort((a, b) => b.depth - a.depth).filter((r) => r.depth > 0);
  for (let i = 0; i < deep.length; i += ROOMS_PER_HEART) {
    const room = deep[i];
    const t = freeTilesOf(room).find((cand) => farFromStairs(cand));
    if (!t) continue;
    take(t);
    pickups.push({ type: 'heart', worldX: t.x, worldY: t.y });
  }

  // ── as tochas de parede ────────────────────────────────────────────────────
  //
  // Duas fontes, e as duas são necessárias. As AUTORADAS marcam as salas que importam (entrada,
  // objetivo, chave, arena): o par de chamas na parede norte é a legenda de "aqui tem alguma
  // coisa", e é a única legenda que este jogo aceita — física, não texto.
  //
  // As de RUÍDO são o resto do subterrâneo. Sem elas a dungeon fica escura de um jeito que não é
  // atmosfera, é falta: o gerador antigo acendia 4% de TODA a alvenaria (centenas de chamas), e uma
  // planta com oito tochas ao lado daquilo lê como sala sem terminar. A diferença é que aqui a
  // tocha exige **chão ao sul** — ela mora na FACE da parede (a chama avança meio tile para o sul,
  // ver WallTorchObject), então uma acesa numa parede sem sala na frente é uma chama dentro da
  // pedra.
  //
  // Custo: entradas numa lista, não luzes. O pool de oito lâmpadas mira nas chamas mais próximas da
  // câmera a cada quadro e o resto continua sendo malha — nada aqui pode somar uma luz THREE.
  for (const room of rooms) {
    if (!['entrance', 'goal', 'key', 'arena'].includes(room.role)) continue;
    for (const x of [2, ROOM_W - 3]) {
      const t = roomTile(room, x, 0);
      if (classes[t.y][t.x] === TILE.wall) classes[t.y][t.x] = TILE.torch;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (classes[y][x] !== TILE.wall) continue;
      if (!isWalkableClass(classes[y + 1]?.[x] ?? TILE.wall)) continue;
      if (tileHash(seed, x, y, 0x7c) < 0.05) classes[y][x] = TILE.torch;
    }
  }

  const world = materialiseDungeon({
    level: brief.level,
    seed,
    name: `Dungeon ${brief.level}: ${brief.name}`,
    classes,
    props,
    enemies,
    pickups,
    start: { worldX: start.x, worldY: start.y },
  });

  const plan: DungeonPlan = {
    level: brief.level,
    seed,
    cycle: mission.cycle,
    brief,
    rooms,
    edges,
    locks,
    start,
    portal,
    treasure,
    entranceRoom: mission.entrance,
    goalRoom: mission.goal,
    linear: false,
  };
  return { world, plan };
};

/** As faixas protegidas de um template — ele não passou pelo `paintRoom`, mas o conteúdo precisa. */
const laneGuard = (mask: number): boolean[][] => {
  const guard = Array.from({ length: ROOM_H }, () => new Array<boolean>(ROOM_W).fill(false));
  for (let y = 5; y <= 6; y++) for (let x = 5; x <= 6; x++) guard[y][x] = true;
  for (const side of SIDES) {
    if (!hasDoor(mask, side)) continue;
    for (let along = 0; along <= 5; along++) {
      for (const across of [0, 1] as const) {
        const { x, y } = laneToXY(side, along, across);
        guard[y][x] = true;
      }
    }
  }
  return guard;
};

// ── a saída de emergência ─────────────────────────────────────────────────────

/**
 * O caminho linear: uma fileira de salas, sem ciclo e sem fechadura.
 *
 * Ele existe para que **nunca** chegue ao jogador uma dungeon reprovada. Se 24 sementes seguidas
 * falharem (o que a auditoria mede e que não acontece hoje), o que se entrega é uma dungeon
 * modesta e correta, não uma interessante e quebrada.
 */
const buildFallback = (brief: DungeonBrief, seed: number): Draft => {
  const rng = new Rng(mixSeed(seed, 0xfa11));
  const count = Math.min(brief.rooms, brief.gridW * brief.gridH);
  const cells: Cell[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / brief.gridW);
    const gy = brief.gridH - 1 - row;
    const gx = row % 2 === 0 ? i % brief.gridW : brief.gridW - 1 - (i % brief.gridW);
    cells.push({ gx, gy });
  }

  const W = brief.gridW * ROOM_W;
  const H = brief.gridH * ROOM_H;
  const classes: TileClass[][] = Array.from({ length: H }, () => new Array<TileClass>(W).fill(TILE.wall));
  const rooms: DungeonRoomInfo[] = [];
  const edges: DungeonEdgeInfo[] = [];
  const masks = cells.map(() => 0);
  for (let i = 0; i + 1 < cells.length; i++) {
    const side = sideBetween(cells[i], cells[i + 1]);
    masks[i] |= sideBit(side);
    masks[i + 1] |= sideBit(oppositeSide(side));
    const tiles: Tile[] = [];
    for (const across of [0, 1] as const) {
      const a = laneToXY(side, 0, across);
      const b = laneToXY(oppositeSide(side), 0, across);
      tiles.push({ x: cells[i].gx * ROOM_W + a.x, y: cells[i].gy * ROOM_H + a.y });
      tiles.push({ x: cells[i + 1].gx * ROOM_W + b.x, y: cells[i + 1].gy * ROOM_H + b.y });
    }
    edges.push({ a: i, b: i + 1, tiles });
  }

  cells.forEach((cell, i) => {
    const painted = paintRoom(masks[i], i === cells.length - 1 ? brief.landmark : 'vazia', rng);
    for (let y = 0; y < ROOM_H; y++) {
      for (let x = 0; x < ROOM_W; x++) classes[cell.gy * ROOM_H + y][cell.gx * ROOM_W + x] = painted.grid[y][x];
    }
    rooms.push({
      id: i,
      role: i === 0 ? 'entrance' : (i === cells.length - 1 ? 'goal' : 'plain'),
      cell,
      doors: masks[i],
      originX: cell.gx * ROOM_W,
      originY: cell.gy * ROOM_H,
      shape: 'vazia',
      species: brief.species[0],
      depth: i,
    });
  });

  const portal: Tile = { x: rooms[0].originX + 5, y: rooms[0].originY + 6 };
  const start: Tile = { x: portal.x, y: portal.y - 1 };
  const props: WorldProp[] = [{ type: 'levelPortal', worldX: portal.x, worldY: portal.y }];
  const goal = rooms[rooms.length - 1];
  const pickups: Array<{ type: PickupKind; worldX: number; worldY: number }> = [];
  const treasure: Tile[] = [];
  let n = 0;
  for (const [type, count2] of brief.treasure) {
    for (let k = 0; k < count2; k++) {
      const t: Tile = { x: goal.originX + 4 + (n % 4), y: goal.originY + 5 };
      pickups.push({ type, worldX: t.x, worldY: t.y });
      treasure.push(t);
      n++;
    }
  }

  const world = materialiseDungeon({
    level: brief.level,
    seed,
    name: `Dungeon ${brief.level}: ${brief.name}`,
    classes,
    props,
    enemies: [],
    pickups,
    start: { worldX: start.x, worldY: start.y },
  });

  return {
    world,
    plan: {
      level: brief.level,
      seed,
      cycle: 'linear (emergencia)',
      brief,
      rooms,
      edges,
      locks: [],
      start,
      portal,
      treasure,
      entranceRoom: 0,
      goalRoom: rooms.length - 1,
      linear: true,
    },
  };
};

// ── a porta de entrada ────────────────────────────────────────────────────────

/**
 * Gera a dungeon `level` a partir de `seed`. Puro: mesma entrada, mesma saída, em qualquer runtime
 * de JS — é isso que deixa a auditoria offline (`scripts/audit-dungeons.ts`) medir o mesmo jogo que
 * o jogador vê, e é isso que permite ao retrato salvo ser opcional em vez de obrigatório.
 */
export const buildDungeon = (
  level: number,
  seed: number,
  library: readonly RoomTemplate[] = [],
): BuiltDungeon => {
  const brief = briefFor(level);
  const rejects: string[] = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = new Rng(mixSeed(seed, attempt, 0x1a7e));
    const mission = buildMission(brief, rng);
    const placement = embedMission(mission, brief, rng);
    if (!placement) { rejects.push('layout-nao-coube'); continue; }
    const draft = assemble(brief, seed, mission, placement, rng, library);
    const verdict = verifyDungeon(draft.world, draft.plan);
    if (verdict.ok) return { ...draft, attempts: attempt + 1, rejects };
    rejects.push(...verdict.reasons);
  }

  return { ...buildFallback(brief, seed), attempts: MAX_ATTEMPTS, rejects };
};
