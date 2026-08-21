import type { EnemyKind, NpcKind, PickupKind } from '@/game/world/ScreenContent';

// The world is a finite, fully-authored 5x5-chunk map defined entirely by a single
// `world.json`. These types are the schema shared by the runtime loader (WorldData.ts) and
// the offline seed generator (scripts/generateWorld.ts). Keep them close to the existing
// runtime shapes (ScreenContent spawns, DialogScript) so nothing downstream has to change.
export const WORLD_SCHEMA_VERSION = 1;

export type WorldMeta = {
  name: string;
  schemaVersion: typeof WORLD_SCHEMA_VERSION;
  worldChunksX: number; // number of chunks across (e.g. 8)
  worldChunksY: number; // number of chunks down (e.g. 8)
  chunkColumns: number; // tiles per chunk, must equal CHUNK_COLUMNS (validated on load)
  chunkRows: number; // tiles per chunk, must equal CHUNK_ROWS (validated on load)
  tileSize: number;
  tilesetKey: string;
  playerStart: { worldX: number; worldY: number };
  // A puzzle world (the /levels files) — the undead siege is suppressed for it, the way it
  // already is in the lab. Absent/false on the real overworld. NOTE: apenas o CERCO (ambiente,
  // em volta do heroi) morre aqui; pontos de spawn autorados valem em todo mundo, e e num level
  // que eles mais valem — ver GameScene.create.
  puzzle?: boolean;
  exportedAt: string;
};

// Entity placements use absolute tile coordinates — the exact shape the runtime managers
// already consume (see EnemySpawn/PickupSpawn/NpcSpawn in ScreenContent.ts).
//
// Um inimigo autorado NAO e um corpo, e um PONTO DE SPAWN: aquele tile faz um corpo quando o heroi
// chega perto e faz outro ENEMY_RESPAWN_MS depois que aquele cai (EnemySpawnerManager). Por isso
// nao tem estado nenhum no arquivo — vida, direcao, o relogio do respawn: nada disso e autorado,
// nasce com o corpo e morre com ele. Um campo aqui seria estado de partida gravado no mapa.
export type WorldEnemySpawn = { type: EnemyKind; worldX: number; worldY: number };
export type WorldPickupSpawn = { type: PickupKind; worldX: number; worldY: number };
/**
 * `dialog` é o ROTEIRO desta instância, e não do tipo dela.
 *
 * A fala nasceu indexada por espécie (`dialogs[kind]`), e isso bastava enquanto cada NPC morava num
 * lugar só. Com o baralho de cartas o mesmo gato passou a viver em três mapas diferentes ensinando
 * três coisas diferentes — e um roteiro por espécie faz o gato do machado explicar a picareta. Este
 * campo aponta para uma chave qualquer de `dialogs`; sem ele, continua valendo o tipo.
 */
export type WorldNpcSpawn = { type: NpcKind; worldX: number; worldY: number; dialog?: string };

// One screen = terrain grids + the entities that live on it. This is the unit the runtime
// streams and the (future) editor will paint, so terrain and content are co-located.
export type WorldChunk = {
  cx: number; // chunk index, 0..worldChunksX-1
  cy: number; // chunk index, 0..worldChunksY-1
  ground: number[][]; // [row][col], chunkRows x chunkColumns
  upper: Array<Array<number | null>>;
  collisions: boolean[][];
  enemies: WorldEnemySpawn[];
  pickups: WorldPickupSpawn[];
  npcs: WorldNpcSpawn[];
};

// World-level props (not tied to a chunk) so a campfire/dry bush/door can be free-placed
// and repeated. Their collision is resolved at runtime, not baked into the grid:
// `dryBush` blocks until fire burns it to ash; `lockedDoor` blocks until opened with a key;
// `dryTree` blocks until chopped to a stump with the axe; `rock` blocks until broken with
// the pickaxe; `tallGrass` blocks until cut with the scythe (or burned); `lava` blocks until a
// stone cools into a basalt step; `water` (a river tile) blocks — a bridge can be built
// over it ONLY where a `bridgeSpot` marker is placed (2 wood sticks / a felled tree); `dryShrub`
// is a small dead bush the axe clears (no drop, no regrow) — a pure physical barrier; `bombSpot`
// is the walkable mark where a carried bomb plants itself when the hero steps on it (the game is
// walk-only — no "use item" button — so placing is a step like collecting is); `plantSpot` is a
// small dug hole: step on it carrying SEEDS (the scythe's product) to plant — a mound covers the
// hole, a full bucket waters it, and real tall grass sprouts after a while; consume that grass
// (scythe → new seeds, or fire) and the hole reopens. The game's renewable, placeable fuel.
// `swingGate` is the locked door's twin WITHOUT a lock: it opens by itself when the hero bumps
// it, but only if the tile BEHIND it is clear — a swing leaf needs room to swing. It is the one
// barrier in the game that no item opens; what opens it is changing the far side.
// `toolbox` is the workbench: two slot tiles behind it, the machine, and the output tile in front
// (A B [caixa] resultado). Drop an item on each slot and a RECIPE turns the pair into a third
// item — the only thing in the game that makes an item out of other items, instead of out of a
// prop the hero hits with a tool.
// `carnivorousPlant` is the farmed DEFENSE: grown from carnivore seeds in a plantSpot (or
// authored), it blocks its tile and EATS any enemy that stops beside it — then chews, exposed.
// It is a plant to everything else: fire burns it, the scythe fells it (no drop).
// `pyre` e a pira: nasce so com a base (laje + berco), sobe uma tora por graveto entregue com o
// X e, fechada, aceita a tocha ACESA. Ela nao e combustivel do sistema de fogo — acender e um
// gesto, nunca um incendio que chegou sozinho. Ver PyreObject.
export type PropKind = 'campfire' | 'dryBush' | 'lockedDoor' | 'swingGate' | 'dryTree' | 'rock'
  | 'ironRock' | 'tallGrass' | 'lava' | 'water' | 'dryShrub' | 'bridgeSpot' | 'moonflower'
  | 'bombSpot' | 'plantSpot' | 'carnivorousPlant' | 'toolbox' | 'levelPortal' | 'furnace'
  | 'altar' | 'pyre'
  // A ESCADA entre os dois andares do mundo — a porta FÍSICA (ver StairsObject). O
  // `levelPortal` continua sendo outra coisa: a travessia mágica que encadeia LEVELS de puzzle.
  | 'stairs';

// Which way a prop faces. Clockwise from north, and the SAME order as the frames in a directional
// sheet, so `dir` indexes the art directly: 0=N 1=L 2=S 3=O.
export type PropDir = 0 | 1 | 2 | 3;
// `lit` only applies to campfires: an optional override forcing a fire to start already lit.
// The runtime does not depend on it — the campfire nearest the player start is always the lit
// "home" fire — so it survives being dropped by editor saves (which re-emit only type/x/y).
// `floodgate` only applies to a `lockedDoor`: opening it (with a key) DRAINS the run of water it
// holds back, opening a path AND laying a firebreak. Like `lit`, an editor save drops the flag,
// so floodgate doors are authored in gen-levels, not built in the editor.
// `dir` applies to workstations and unlike `lit`/`floodgate` above it is NOT droppable.
// Their rotation is
// placed by hand in the editor and IS the prop's behaviour — which tile it takes from and which
// it puts to. So the editor store had to learn to carry `dir` through place/erase/undo, instead
// of re-emitting bare type/x/y the way it does for every other prop.
export type WorldProp = {
  type: PropKind;
  worldX: number;
  worldY: number;
  lit?: boolean;
  floodgate?: boolean;
  dir?: PropDir;
};

export type WorldDialogLine = { speaker: 'npc' | 'narrator'; text: string };

/**
 * O BALCÃO de um NPC: ele compra `item` a `coinsPerUnit` moedas a unidade, por QUANTIDADE,
 * dentro do próprio diálogo (depois da primeira fala o painel oferece "vender" ao lado de
 * "continuar conversando" — ver DialogOverlay). As três falas são o roteiro do caixa: a
 * oferta (pergunta o quanto), a recusa de mochila vazia, e o fechamento da venda.
 */
export type WorldDialogTrade = {
  item: string;
  coinsPerUnit: number;
  offer: string;
  empty: string;
  thanks: string;
};

// Folds NPC_DIALOGS + DIALOG_VOICES into one editable record per NPC.
export type WorldDialog = {
  npcName: string;
  npcColorHex: string;
  npcAssetKey: string;
  npcFrame?: number;
  voice: { freq: number; wave: OscillatorType };
  lines: WorldDialogLine[];
  trade?: WorldDialogTrade;
};

export type WorldData = {
  meta: WorldMeta;
  chunks: WorldChunk[]; // exactly worldChunksX * worldChunksY entries
  props: WorldProp[];
  /**
   * Os roteiros. A chave é normalmente o NpcKind — e continua sendo o padrão —, mas uma INSTÂNCIA
   * pode apontar para uma chave própria (ver WorldNpcSpawn.dialog), e por isso o índice é string:
   * é o que deixa o mesmo gato ensinar o machado numa carta e a picareta na outra.
   */
  dialogs: Partial<Record<NpcKind, WorldDialog>> & Partial<Record<string, WorldDialog>>;
};
