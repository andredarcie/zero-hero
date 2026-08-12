import { CHUNK_COLUMNS, CHUNK_ROWS, SOLID_GROUND_FRAMES, SOLID_UPPER_FRAMES } from '@/game/constants';
import type { ChunkData } from '@/game/world/Chunk';
import type { PickupKind, ScreenContent } from '@/game/world/ScreenContent';
import { getChunkTemplates, type ChunkTemplate } from '@/game/world/WorldData';
import type { WorldProp } from '@/game/world/worldSchema';

/** The fixed home chunk. Every new run starts around this fire. */
export const CAMP_X = 6;
export const CAMP_Y = 6;
export const CAMP_SPAWN_X = 6;
export const CAMP_SPAWN_Y = 9;

const GROUND_FRAME = 5;
const TREE_FRAME = 4;
// O capim e a folhagem do acampamento. O frame 6 estava nesta lista e é um frame de CHÃO ("Terra
// 2"): opaco, ele virava um quadrado de terra flutuando na camada de cima, tapando o chão de que
// deveria fazer parte. Aqui só entra arte vazada.
const DECOR_FRAMES = [0, 7, 8, 19, 20] as const;
const FLOWER_FRAMES = [1, 10, 11] as const;

/** Hash 2D determinístico (0..1): o acampamento é o mesmo em toda partida, sem Math.random. */
const tileNoise = (x: number, y: number, seed: number): number => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export type ChunkDirection = 'north' | 'east' | 'south' | 'west';

export type ChunkFrontier = {
  id: string;
  sourceCx: number;
  sourceCy: number;
  targetCx: number;
  targetCy: number;
  direction: ChunkDirection;
  /** The buy plate, inside the last owned chunk. */
  gateX: number;
  gateY: number;
  /** Where the next quiet undead enters from the unrevealed road. */
  enemyX: number;
  enemyY: number;
};

export type BuiltChunk = { cx: number; cy: number; typeId: string; name: string };

const keyOf = (cx: number, cy: number): string => `${cx},${cy}`;
const cloneGrid = <T>(grid: T[][]): T[][] => grid.map((row) => [...row]);

const clear = (chunk: ChunkData, lx: number, ly: number): void => {
  if (lx < 0 || ly < 0 || lx >= CHUNK_COLUMNS || ly >= CHUNK_ROWS) return;
  chunk.ground[ly][lx] = GROUND_FRAME;
  chunk.upper[ly][lx] = null;
  chunk.collisions[ly][lx] = false;
};

/**
 * A costura ABRE O QUE BLOQUEIA — ela não raspa o tile até a terra.
 *
 * Ela raspava: `clear` zerava chão, camada de cima e colisão nos 64 tiles das quatro faixas de
 * estrada, que são 44% da carta. O efeito era um SINAL DE MAIS de terra pelada no meio de todo
 * chunk comprado, e nenhuma quantidade de mato plantado nas bordas consertava isso — o miolo era
 * apagado no assentamento. A garantia que a costura existe para dar é uma só: "esta faixa é
 * passável, então qualquer carta encaixa em qualquer outra". Grama, flor e cogumelo não bloqueiam
 * nada, logo não têm por que morrer aqui — e o pátio de pedra do desfiladeiro também não.
 */
const unblock = (chunk: ChunkData, lx: number, ly: number): void => {
  if (lx < 0 || ly < 0 || lx >= CHUNK_COLUMNS || ly >= CHUNK_ROWS) return;
  if (SOLID_GROUND_FRAMES.has(chunk.ground[ly][lx])) chunk.ground[ly][lx] = GROUND_FRAME;
  const upper = chunk.upper[ly][lx];
  if (upper !== null && SOLID_UPPER_FRAMES.has(upper)) chunk.upper[ly][lx] = null;
  chunk.collisions[ly][lx] = false;
};

/** Every authored template receives generous seams, so any card can fit beside any other. */
const openSeams = (chunk: ChunkData): ChunkData => {
  for (let i = 0; i < 4; i += 1) {
    for (let n = -1; n <= 1; n += 1) {
      unblock(chunk, 6 + n, i);
      unblock(chunk, 6 + n, CHUNK_ROWS - 1 - i);
      unblock(chunk, i, 6 + n);
      unblock(chunk, CHUNK_COLUMNS - 1 - i, 6 + n);
      // The starter's east road deliberately sits lower. Keeping this second horizontal seam
      // lets any authored card connect to it without changing that recognizable home layout.
      unblock(chunk, i, 8 + n);
      unblock(chunk, CHUNK_COLUMNS - 1 - i, 8 + n);
    }
  }
  return chunk;
};

const starterChunk = (): ChunkData => {
  const chunk: ChunkData = {
    cx: 0,
    cy: 0,
    ground: Array.from({ length: CHUNK_ROWS }, () => Array(CHUNK_COLUMNS).fill(GROUND_FRAME)),
    upper: Array.from({ length: CHUNK_ROWS }, () => Array<number | null>(CHUNK_COLUMNS).fill(null)),
    collisions: Array.from({ length: CHUNK_ROWS }, () => Array(CHUNK_COLUMNS).fill(false)),
  };

  // A clareira: cerca de pinheiros, e dentro dela um quintal de mato com flor nas moitas mais
  // fundas — a mesma gramática das cartas compradas (ver scripts/enrich-chunk-cards.mjs), porque
  // um acampamento pelado no meio de vizinhos floridos leria como chão que não terminou.
  for (let y = 0; y < CHUNK_ROWS; y += 1) {
    for (let x = 0; x < CHUNK_COLUMNS; x += 1) {
      const border = x === 0 || y === 0 || x === CHUNK_COLUMNS - 1 || y === CHUNK_ROWS - 1;
      if (border) { chunk.upper[y][x] = TREE_FRAME; continue; }
      const t = tileNoise(x, y, 7);
      if (t < 0.42) continue;
      chunk.upper[y][x] = t > 0.93
        ? FLOWER_FRAMES[Math.floor(tileNoise(x, y, 13) * FLOWER_FRAMES.length) % FLOWER_FRAMES.length]
        : DECOR_FRAMES[Math.floor(tileNoise(x, y, 29) * DECOR_FRAMES.length) % DECOR_FRAMES.length];
    }
  }

  // Three authored roads only: west, north, and a slightly lower east road.
  for (let x = 0; x <= 4; x += 1) for (let y = 5; y <= 7; y += 1) clear(chunk, x, y);
  for (let y = 0; y <= 4; y += 1) for (let x = 5; x <= 7; x += 1) clear(chunk, x, y);
  for (let x = 8; x < CHUNK_COLUMNS; x += 1) for (let y = 7; y <= 9; y += 1) clear(chunk, x, y);
  return chunk;
};

const placedTemplate = (template: ChunkTemplate, cx: number, cy: number): ChunkData => openSeams({
  cx,
  cy,
  ground: cloneGrid(template.ground),
  upper: cloneGrid(template.upper),
  collisions: cloneGrid(template.collisions),
});

/**
 * An unrevealed chunk is EMPTY dark ground. Who hides it is the SHROUD (ChunkShroud3D), never
 * the terrain — and the shroud south of bought land is a flat fog CARPET on the ground, so
 * nothing may STAND here: a tree would poke straight through it (the old solid-forest fill
 * became the "black wall" the user saw). Undead walk in over this open ground; player
 * collision is enforced at the seam (blocksPlayerAt), never by tiles.
 */
const darkChunk = (cx: number, cy: number): ChunkData => ({
  cx,
  cy,
  ground: Array.from({ length: CHUNK_ROWS }, () => Array(CHUNK_COLUMNS).fill(GROUND_FRAME)),
  upper: Array.from({ length: CHUNK_ROWS }, () => Array<number | null>(CHUNK_COLUMNS).fill(null)),
  collisions: Array.from({ length: CHUNK_ROWS }, () => Array(CHUNK_COLUMNS).fill(false)),
});

export const distanceFromCamp = (worldX: number, worldY: number): number =>
  Math.hypot(worldX - CAMP_X, worldY - CAMP_Y);

/**
 * O que o acampamento oferece de graça — HOJE, NADA.
 *
 * Era a espada, deitada ao lado da fogueira: a primeira coisa que o explorador fazia era apanhá-la,
 * porque sem ela não havia como bater em nada. Ela deixou de ser item (o herói nasce com a dele —
 * ver GameScene.swordEquipped), então o gesto virou uma reverência a uma regra que não existe mais.
 * A lista fica: o dia em que o acampamento tiver um presente, ele entra aqui.
 */
export const campKit = (): Array<{ type: Exclude<PickupKind, 'heart'>; worldX: number; worldY: number }> => [];

const startProps = (): WorldProp[] => [
  { type: 'campfire', worldX: CAMP_X, worldY: CAMP_Y, lit: true },
];

const startContent = (): ScreenContent => ({
  enemies: [],
  pickups: [],
  // Close enough to read in the opening camera, while unmistakably above-left of the fire.
  npcs: [{ type: 'wizard', worldX: CAMP_X - 2, worldY: CAMP_Y - 1 }],
});

const directionData: ReadonlyArray<{
  direction: ChunkDirection;
  dx: number;
  dy: number;
  gate: (cx: number, cy: number, starter: boolean) => readonly [number, number];
  enemy: (cx: number, cy: number) => readonly [number, number];
}> = [
  {
    direction: 'north', dx: 0, dy: -1,
    gate: (cx, cy) => [cx * CHUNK_COLUMNS + 6, cy * CHUNK_ROWS + 1],
    enemy: (cx, cy) => [cx * CHUNK_COLUMNS + 6, cy * CHUNK_ROWS - 1],
  },
  {
    direction: 'east', dx: 1, dy: 0,
    gate: (cx, cy, starter) => [cx * CHUNK_COLUMNS + 10, cy * CHUNK_ROWS + (starter ? 8 : 6)],
    enemy: (cx, cy) => [cx * CHUNK_COLUMNS + CHUNK_COLUMNS, cy * CHUNK_ROWS + (cx === 0 && cy === 0 ? 8 : 6)],
  },
  {
    direction: 'south', dx: 0, dy: 1,
    gate: (cx, cy) => [cx * CHUNK_COLUMNS + 6, cy * CHUNK_ROWS + 10],
    enemy: (cx, cy) => [cx * CHUNK_COLUMNS + 6, cy * CHUNK_ROWS + CHUNK_ROWS],
  },
  {
    direction: 'west', dx: -1, dy: 0,
    gate: (cx, cy) => [cx * CHUNK_COLUMNS + 1, cy * CHUNK_ROWS + 6],
    enemy: (cx, cy) => [cx * CHUNK_COLUMNS - 1, cy * CHUNK_ROWS + 6],
  },
];

export class ExplorerWorldSource {
  private readonly chunks = new Map<string, ChunkData>();
  private readonly built = new Map<string, string>([[keyOf(0, 0), '__start__']]);
  private readonly templates: ChunkTemplate[];
  /** Cartas já compradas NESTA run: cada carta existe uma vez só no baralho. */
  private readonly used = new Set<string>();

  public constructor(public readonly seed: number) {
    this.templates = getChunkTemplates();
  }

  /**
   * O baralho COMPRÁVEL: só as cartas ainda não usadas. Quem resolve um chunk JÁ CONSTRUÍDO
   * (terreno, props, conteúdo) continua lendo `this.templates` — a carta sai do baralho, o
   * terreno que ela virou fica no mundo.
   */
  public catalog(): ChunkTemplate[] {
    return this.templates.filter((entry) => !this.used.has(entry.catalog.id));
  }

  /** Se ALGUMA carta já foi comprada nesta run — quem pergunta é a mão de ABERTURA. */
  public hasPurchased(): boolean { return this.used.size > 0; }

  public isBuilt(cx: number, cy: number): boolean { return this.built.has(keyOf(cx, cy)); }

  public chunk(cx: number, cy: number): ChunkData {
    const key = keyOf(cx, cy);
    let chunk = this.chunks.get(key);
    if (chunk) return chunk;
    const typeId = this.built.get(key);
    if (typeId === '__start__') chunk = starterChunk();
    else if (typeId) {
      const template = this.templates.find((entry) => entry.catalog.id === typeId) ?? this.templates[0];
      chunk = template ? placedTemplate(template, cx, cy) : darkChunk(cx, cy);
    } else chunk = darkChunk(cx, cy);
    this.chunks.set(key, chunk);
    return chunk;
  }

  public chunkProps(cx: number, cy: number): WorldProp[] {
    const typeId = this.built.get(keyOf(cx, cy));
    if (typeId === '__start__') return startProps();
    const template = this.templates.find((entry) => entry.catalog.id === typeId);
    if (!template) return [];
    return template.props.map((prop) => ({
      ...prop,
      worldX: cx * CHUNK_COLUMNS + prop.worldX,
      worldY: cy * CHUNK_ROWS + prop.worldY,
    }));
  }

  public chunkContent(cx: number, cy: number): ScreenContent {
    const typeId = this.built.get(keyOf(cx, cy));
    if (typeId === '__start__') return startContent();
    const template = this.templates.find((entry) => entry.catalog.id === typeId);
    if (!template) return { enemies: [], pickups: [], npcs: [] };
    const place = <T extends { worldX: number; worldY: number }>(entry: T): T => ({
      ...entry,
      worldX: cx * CHUNK_COLUMNS + entry.worldX,
      worldY: cy * CHUNK_ROWS + entry.worldY,
    });
    return {
      enemies: template.enemies.map(place),
      pickups: template.pickups.map(place),
      npcs: template.npcs.map(place),
    };
  }

  public frontiers(): ChunkFrontier[] {
    const out: ChunkFrontier[] = [];
    const claimedTargets = new Set<string>();
    for (const [sourceKey] of this.built) {
      const [sourceCx, sourceCy] = sourceKey.split(',').map(Number);
      const starter = sourceCx === 0 && sourceCy === 0;
      for (const def of directionData) {
        if (starter && def.direction === 'south') continue;
        const targetCx = sourceCx + def.dx;
        const targetCy = sourceCy + def.dy;
        const targetKey = keyOf(targetCx, targetCy);
        if (this.built.has(targetKey) || claimedTargets.has(targetKey)) continue;
        claimedTargets.add(targetKey);
        const [gateX, gateY] = def.gate(sourceCx, sourceCy, starter);
        const [enemyX, enemyY] = def.enemy(sourceCx, sourceCy);
        out.push({
          id: `${sourceKey}:${def.direction}`,
          sourceCx,
          sourceCy,
          targetCx,
          targetCy,
          direction: def.direction,
          gateX,
          gateY,
          enemyX,
          enemyY,
        });
      }
    }
    return out;
  }

  public frontierAt(worldX: number, worldY: number): ChunkFrontier | undefined {
    return this.frontiers().find((gate) => gate.gateX === worldX && gate.gateY === worldY);
  }

  public purchase(frontier: ChunkFrontier, typeId: string): BuiltChunk | null {
    if (this.isBuilt(frontier.targetCx, frontier.targetCy)) return null;
    if (this.used.has(typeId)) return null; // carta única: ninguém compra a mesma terra duas vezes
    const template = this.templates.find((entry) => entry.catalog.id === typeId);
    if (!template) return null;
    this.used.add(typeId);
    this.built.set(keyOf(frontier.targetCx, frontier.targetCy), typeId);
    // Terrain already baked as darkness must be regenerated as the chosen authored template.
    this.chunks.delete(keyOf(frontier.targetCx, frontier.targetCy));
    for (const def of directionData) {
      this.chunks.delete(keyOf(frontier.targetCx + def.dx, frontier.targetCy + def.dy));
    }
    return {
      cx: frontier.targetCx,
      cy: frontier.targetCy,
      typeId,
      name: template.catalog.name,
    };
  }

  public builtChunks(): BuiltChunk[] {
    return [...this.built.entries()].map(([key, typeId]) => {
      const [cx, cy] = key.split(',').map(Number);
      const template = this.templates.find((entry) => entry.catalog.id === typeId);
      return { cx, cy, typeId, name: template?.catalog.name ?? 'Campfire Clearing' };
    });
  }
}
