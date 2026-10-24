import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import type { DialogScript, DialogVoice } from '@/game/dialogs/NpcDialogs';
import { localizedNpc } from '@/game/i18n/i18n';
import type { ChunkData } from './Chunk';
import type { NpcKind, PickupKind, ScreenContent } from './ScreenContent';
import {
  WORLD_SCHEMA_VERSION, type WorldChunk, type WorldData, type WorldProp,
} from './worldSchema';

// Single seam through which the whole runtime reads the finite, authored world. The data is
// loaded once (from public/world.json in PreloadScene) and set here before any gameplay
// scene starts. Everything else — ChunkManager, GameScene, the entity managers — reads
// terrain, spawns, props and dialog through these accessors.

type WorldBounds = {
  minCx: number; maxCx: number;
  minCy: number; maxCy: number;
  minTileX: number; maxTileX: number;
  minTileY: number; maxTileY: number;
};

// ── O FORA DO MUNDO ──────────────────────────────────────────────────────────
//
// Tudo além da grade autorada 0..N-1 é preenchido aqui, para o mundo finito ter uma borda que se
// VÊ em vez de um corte seco. E o que se vê depende do andar: em cima é uma FLORESTA que continua
// para sempre (sob a névoa negra que o World3D deita por cima dela); embaixo é a ALVENARIA da
// dungeon, cujo teto já é preto puro — o escuro entre uma sala e a outra, esticado até o fim.
//
// **POR QUE ISTO PODE SER ÁRVORE DE NOVO.** Já foi: terra sob uma parede de pinheiros (frame 4). E
// caiu no dia em que o machado de aço aprendeu a derrubar qualquer árvore — a borda era feita
// exatamente do que o item novo existe para destruir, e dava para abrir uma porta e sair do mapa.
// A saída na época foi trocar o material por um que item nenhum responde: MAR (a colisão dele vem
// de SOLID_GROUND_FRAMES, incondicional).
//
// Hoje a trava é outra, e é melhor: o machado de aço saiu do jogo e NADA derruba árvore verde
// (a árvore-tile nunca sai do lugar), e todo tile daqui nasce com `collisions: true`, que bloqueia
// sozinho seja qual for o frame. Nenhuma das duas olha para a arte — então a arte voltou a ser
// livre. **Se um dia algo voltar a editar terreno em pé, isto aqui vira uma porta.**
//
// As duas listas são variadas por HASH das coordenadas, nunca por `Math.random`: o mundo tem de
// nascer idêntico a cada boot (o visual-ref compara pixel a pixel, e o three gasta o mesmo fluxo
// de random em UUID — ver a armadilha no CLAUDE.md).
const VOID_FOREST_FRAMES: readonly number[] = [4, 14, 15, 16, 17, 18];
const VOID_FLOOR_FRAMES: readonly number[] = [5, 6];

/** Hash inteiro estável de um tile — o mesmo espírito do `seaVariant` do World3D. */
const voidVariant = (wx: number, wy: number, n: number): number => {
  let h = (wx * 374761393 + wy * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return Math.abs(h ^ (h >>> 16)) % n;
};

const chunkKey = (cx: number, cy: number): string => `${cx},${cy}`;

let world: WorldData | null = null;
let chunkByKey = new Map<string, WorldChunk>();
let bounds: WorldBounds | null = null;

const EMPTY_CONTENT: ScreenContent = { pickups: [], npcs: [] };

// ── the infinite world (explorer mode) ────────────────────────────────────────
//
// Everything above assumes a world that was AUTHORED: a finite grid of chunks read from a
// file, with an edge made of sea. The explorer mode has no file and no edge — the ground is
// generated from a seed as the hero walks, in every direction, forever.
//
// It plugs in HERE rather than beside WorldData because the whole runtime already reads the
// world through this one seam: swap what these accessors answer and ChunkManager, the entity
// managers and World3D are all reading the infinite world without knowing it. Two things a
// generated world cannot answer for itself stay with the authored one: the NPC dialog catalog
// (still world.json's) and the tileset metadata.
//
// The single subtlety is `bounds`, which stops meaning "the world" and starts meaning "the
// WINDOW currently baked into the terrain meshes" — see World3D.rebuildTerrain and
// ExplorerDirector. Nothing but the renderer reads it, because nothing else may: asking an
// infinite world where it ends is a question with no answer.
export type InfiniteWorld = {
  name: string;
  playerStart: { worldX: number; worldY: number };
  /** Generated terrain for a chunk. MUST be memoised by the provider: the runtime edits these
   *  arrays in place (a felled tree clears `upper` + `collisions`) and expects the edit to hold. */
  chunk: (cx: number, cy: number) => ChunkData;
  /** Streamed spawns (hearts, NPCs) for a chunk. */
  content: (cx: number, cy: number) => ScreenContent;
  /** Carriable items laid out at boot — the explorer's camp kit. */
  heldItems: () => Array<{ type: PickupKind; worldX: number; worldY: number }>;
};

let infinite: InfiniteWorld | null = null;
// The props of the chunks currently loaded. The director owns this list and swaps it whole as
// the window moves; GameScene's prop getters read it instead of the authored world's `props`.
let streamedProps: WorldProp[] = [];

export const setInfiniteWorld = (provider: InfiniteWorld | null): void => {
  infinite = provider;
  if (!provider) streamedProps = [];
};

export const isInfiniteWorld = (): boolean => infinite !== null;

/** The chunk rectangle the renderer should bake. Only meaningful while a world is infinite. */
export const setWorldWindow = (minCx: number, minCy: number, maxCx: number, maxCy: number): void => {
  bounds = {
    minCx,
    maxCx,
    minCy,
    maxCy,
    minTileX: minCx * CHUNK_COLUMNS,
    maxTileX: ((maxCx + 1) * CHUNK_COLUMNS) - 1,
    minTileY: minCy * CHUNK_ROWS,
    maxTileY: ((maxCy + 1) * CHUNK_ROWS) - 1,
  };
};

export const setStreamedProps = (props: WorldProp[]): void => { streamedProps = props; };

const allProps = (): WorldProp[] => (infinite ? streamedProps : requireWorld().props);

export const setWorldData = (raw: unknown): void => {
  const data = raw as WorldData | null;
  if (!data || typeof data !== 'object' || !data.meta) {
    throw new Error('world.json invalido: meta ausente');
  }
  if (data.meta.schemaVersion !== WORLD_SCHEMA_VERSION) {
    throw new Error(`world.json schemaVersion ${data.meta.schemaVersion} != ${WORLD_SCHEMA_VERSION}`);
  }
  if (data.meta.chunkColumns !== CHUNK_COLUMNS || data.meta.chunkRows !== CHUNK_ROWS) {
    throw new Error(
      `world.json chunk dims ${data.meta.chunkColumns}x${data.meta.chunkRows} != build ${CHUNK_COLUMNS}x${CHUNK_ROWS}`,
    );
  }

  // UM NPC APARECE UMA VEZ SO NO MAPA — e esta e a porta por onde TODO mundo entra (jogo,
  // editor, level, dungeon), entao a regra mora aqui e nao em cada consumidor. Fica o PRIMEIRO em
  // ordem de leitura (cy, depois cx); os outros caem com um aviso no console, porque um
  // personagem que some em silencio e pior do que um repetido.
  const seenNpcKinds = new Set<string>();
  const droppedNpcs: string[] = [];
  for (const chunk of [...data.chunks].sort((a, b) => a.cy - b.cy || a.cx - b.cx)) {
    if (!chunk.npcs?.length) continue;
    chunk.npcs = chunk.npcs.filter((npc) => {
      if (!seenNpcKinds.has(npc.type)) {
        seenNpcKinds.add(npc.type);
        return true;
      }
      droppedNpcs.push(`${npc.type}@${npc.worldX},${npc.worldY}`);
      return false;
    });
  }
  if (droppedNpcs.length > 0) {
    console.warn(`world: NPC repetido descartado (um de cada por mapa): ${droppedNpcs.join(' ')}`);
  }

  world = data;
  chunkByKey = new Map(data.chunks.map((chunk) => [chunkKey(chunk.cx, chunk.cy), chunk]));
  bounds = {
    minCx: 0,
    maxCx: data.meta.worldChunksX - 1,
    minCy: 0,
    maxCy: data.meta.worldChunksY - 1,
    minTileX: 0,
    maxTileX: (data.meta.worldChunksX * CHUNK_COLUMNS) - 1,
    minTileY: 0,
    maxTileY: (data.meta.worldChunksY * CHUNK_ROWS) - 1,
  };
};

export const isWorldDataReady = (): boolean => world !== null;

const requireWorld = (): WorldData => {
  if (!world) throw new Error('WorldData nao inicializado: chame setWorldData (PreloadScene) antes do jogo');
  return world;
};

const requireBounds = (): WorldBounds => {
  if (!bounds) throw new Error('WorldData nao inicializado: chame setWorldData (PreloadScene) antes do jogo');
  return bounds;
};

export const getWorldBounds = (): WorldBounds => requireBounds();

export const isInsideWorld = (cx: number, cy: number): boolean => {
  if (infinite) return true; // there is no outside
  const b = requireBounds();
  return cx >= b.minCx && cx <= b.maxCx && cy >= b.minCy && cy <= b.maxCy;
};

const buildVoidChunk = (cx: number, cy: number): ChunkData => {
  const ground: number[][] = [];
  const upper: Array<Array<number | null>> = [];
  for (let row = 0; row < CHUNK_ROWS; row += 1) {
    const groundRow: number[] = [];
    const upperRow: Array<number | null> = [];
    for (let col = 0; col < CHUNK_COLUMNS; col += 1) {
      const wx = cx * CHUNK_COLUMNS + col;
      const wy = cy * CHUNK_ROWS + row;
      groundRow.push(VOID_FLOOR_FRAMES[voidVariant(wx, wy, VOID_FLOOR_FRAMES.length)]);
      upperRow.push(VOID_FOREST_FRAMES[voidVariant(wx + 7, wy, VOID_FOREST_FRAMES.length)]);
    }
    ground.push(groundRow);
    upper.push(upperRow);
  }
  return {
    cx,
    cy,
    ground,
    upper,
    // A trava, e ela não depende de nada acima: fora do mundo TUDO bloqueia, qualquer que seja o
    // frame. É esta linha que deixa a arte da borda ser livre.
    collisions: Array.from({ length: CHUNK_ROWS }, () => Array.from({ length: CHUNK_COLUMNS }, () => true)),
  };
};

// Out-of-bounds chunks are solid void, which is what makes the world edges hard: getTile
// reports collision=true there and the existing movement/enemy blockers stop at it.
export const getChunkTerrain = (cx: number, cy: number): ChunkData => {
  if (infinite) return infinite.chunk(cx, cy);
  const chunk = chunkByKey.get(chunkKey(cx, cy));
  if (!chunk) return buildVoidChunk(cx, cy);
  return { cx, cy, ground: chunk.ground, upper: chunk.upper, collisions: chunk.collisions };
};

export const getChunkContent = (cx: number, cy: number): ScreenContent => {
  if (infinite) return infinite.content(cx, cy);
  const chunk = chunkByKey.get(chunkKey(cx, cy));
  if (!chunk) return EMPTY_CONTENT;
  return { pickups: chunk.pickups, npcs: chunk.npcs };
};

export const getPlayerStart = (): { worldX: number; worldY: number } => (
  infinite ? infinite.playerStart : requireWorld().meta.playerStart
);

// The authored display name used by level-select and the in-game level entrance card.
export const getWorldName = (): string => (infinite ? infinite.name : requireWorld().meta.name);

export const getCampfires = (): WorldProp[] => allProps().filter((prop) => prop.type === 'campfire');

export const getDryBushes = (): WorldProp[] => allProps().filter((prop) => prop.type === 'dryBush');

export const getLockedDoors = (): WorldProp[] => allProps().filter((prop) => prop.type === 'lockedDoor');

/** O portao de bater: sem chave, mas so abre com o tile de tras livre (SwingGateObject). */
export const getSwingGates = (): WorldProp[] => allProps().filter((prop) => prop.type === 'swingGate');

export const getDryTrees = (): WorldProp[] => allProps().filter((prop) => prop.type === 'dryTree');

export const getDryShrubs = (): WorldProp[] => allProps().filter((prop) => prop.type === 'dryShrub');

// A pedra de FERRO: a mesma rocha, quebrada pelas mesmas duas picaretadas, mas o que ela
// deixa no chao e um bloco de ferro em vez de uma pedra. Vira RockObject como qualquer outra
// (com `ore: true`), entao colisao, bomba e picareta valem sem uma linha a mais.
export const getIronRocks = (): WorldProp[] => allProps().filter((prop) => prop.type === 'ironRock');

export const getRocks = (): WorldProp[] => allProps().filter((prop) => prop.type === 'rock');

export const getTallGrass = (): WorldProp[] => allProps().filter((prop) => prop.type === 'tallGrass');


export const getWaterTiles = (): WorldProp[] => allProps().filter((prop) => prop.type === 'water');

export const getBridgeSpots = (): WorldProp[] => allProps().filter((prop) => prop.type === 'bridgeSpot');



// A night-blooming flower: a closed bud (blocks) while a campfire burns near it, open petal-bridge
// (walkable) in the dark. See MoonflowerObject.
export const getMoonflowers = (): WorldProp[] => allProps().filter((prop) => prop.type === 'moonflower');


// The dug hole where carried seeds plant themselves on step. See PlantSpotObject.
export const getPlantSpots = (): WorldProp[] => allProps().filter((prop) => prop.type === 'plantSpot');

// The workbench. Carries `dir` for the same load-bearing reason the arm does: it decides which two
// tiles behind it are the slots and which tile in front receives the crafted item.
export const getToolboxes = (): WorldProp[] => allProps().filter((prop) => prop.type === 'toolbox');

export const getFurnaces = (): WorldProp[] => allProps().filter((prop) => prop.type === 'furnace');
// O ALTAR nao guarda o que esta em cima dele aqui, pelo mesmo motivo do bau: o que ha sobre a
// laje e estado de PARTIDA (o jogador pos), e nao conteudo do mapa.
export const getAltars = (): WorldProp[] => allProps().filter((prop) => prop.type === 'altar');

// A FOGUEIRA DO FIM e o PORTAO do jardim que a guarda — os dois existem uma vez so, no centro do
// mapa. Ver GameScene.openGardenGate / GameScene.playRoastEnding.
export const getHearths = (): WorldProp[] => allProps().filter((prop) => prop.type === 'hearth');

export const getGardenGates = (): WorldProp[] => allProps().filter((prop) => prop.type === 'gardenGate');

// Held items (everything except streamed hearts) are loaded once, up front, because the
// hero can drop and swap them anywhere, so they must persist off-screen.
export const getHeldItemPickups = (): Array<{ type: PickupKind; worldX: number; worldY: number }> => {
  const out: Array<{ type: PickupKind; worldX: number; worldY: number }> = [];
  // An infinite world has no authored chunks to walk — it lays out its own kit (the explorer's
  // camp tools), and reading the overworld's chunks here would sprinkle the adventure's tools
  // across a camp that never placed them.
  if (infinite) return infinite.heldItems();
  for (const chunk of requireWorld().chunks) {
    for (const pickup of chunk.pickups) {
      out.push({ type: pickup.type, worldX: pickup.worldX, worldY: pickup.worldY });
    }
  }
  return out;
};

// The visual/audio config (portrait sprite, name colour, frame) stays in world.json; the display
// NAME and spoken LINES come from the active locale catalog, keyed by NPC kind. If the catalog has
// no entry for this kind, fall back to the world.json text so nothing goes blank.
//
// `scriptId` é o roteiro DA INSTÂNCIA (ver WorldNpcSpawn.dialog): o mesmo gato mora em três cartas
// ensinando três coisas, e o roteiro por espécie fazia o gato do machado explicar a picareta.
//
// O LOCALE tem prioridade sobre o arquivo para QUALQUER roteiro que ele conheça (`npc.<id>`):
// o texto do jogo mora num lugar só, e o world.json guarda o retrato, a cor e a voz.
export const getDialog = (kind: NpcKind, scriptId?: string): DialogScript | undefined => {
  const id = scriptId ?? kind;
  const dialog = requireWorld().dialogs[id];
  if (!dialog) return undefined;
  // O locale fala por QUALQUER roteiro que ele conheca — o pedido (`painter`) e o obrigado
  // (`painterDone`) moram la juntos, e o world.json fica so com retrato, cor e voz.
  const localized = localizedNpc(id);
  return {
    npcName: localized?.name ?? dialog.npcName,
    npcColorHex: dialog.npcColorHex,
    npcAssetKey: dialog.npcAssetKey,
    npcFrame: dialog.npcFrame,
    lines: localized?.lines ?? dialog.lines,
  };
};

export const getDialogVoice = (kind: NpcKind, scriptId?: string): DialogVoice | undefined => (
  requireWorld().dialogs[scriptId ?? kind]?.voice
);

export const getDialogKinds = (): NpcKind[] => Object.keys(requireWorld().dialogs) as NpcKind[];
