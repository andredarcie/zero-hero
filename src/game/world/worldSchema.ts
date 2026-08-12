import type { EnemyKind, NpcKind, PickupKind } from '@/game/world/ScreenContent';
import type { HeldItemKind } from '@/game/entities/ItemPickup';

// The world is now a finite, fully-authored 8x8-chunk map defined entirely by a single
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
export type WorldNpcSpawn = { type: NpcKind; worldX: number; worldY: number };

/**
 * Metadata that turns an authored editor chunk into a card the player can buy.
 * Terrain and entities keep using the normal WorldChunk fields; this small record is the
 * catalogue-facing identity used by the world-builder mode.
 */
export type ChunkCatalogEntry = {
  id: string;
  name: string;
  cost: number;
  cardImage: string;
  description?: string;
  /**
   * Esta carta está NO BARALHO do jogador? Ausente = sim.
   *
   * O default é a ausência, e não `true`, porque toda carta escrita antes deste campo existir
   * continua valendo — e porque quem edita o world.json à mão nunca precisa lembrar de um campo
   * para publicar um chunk novo. Quem lê é `getChunkTemplates`: uma carta desligada continua
   * inteira no arquivo (terreno, props, morador) e simplesmente não é oferecida no portão. É
   * assim que uma região fica pronta no editor antes de o jogo poder comprá-la.
   */
  enabled?: boolean;
};

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
  /** Present in public/world.json, which is now the editable chunk library. */
  catalog?: ChunkCatalogEntry;
};

// World-level props (not tied to a chunk) so a campfire/dry bush/door can be free-placed
// and repeated. Their collision is resolved at runtime, not baked into the grid:
// `dryBush` blocks until fire burns it to ash; `lockedDoor` blocks until opened with a key;
// `dryTree` blocks until chopped to a stump with the axe; `rock` blocks until broken with
// the pickaxe; `tallGrass` blocks until cut with the scythe (or burned); `lava` blocks
// unless the hero wears the lava boots; `water` (a river tile) blocks — a bridge can be built
// over it ONLY where a `bridgeSpot` marker is placed (2 wood sticks / a felled tree); `dryShrub`
// is a small dead bush the axe clears (no drop, no regrow) — a pure physical barrier; `bombSpot`
// is the walkable mark where a carried bomb plants itself when the hero steps on it (the game is
// walk-only — no "use item" button — so placing is a step like collecting is); `plantSpot` is a
// small dug hole: step on it carrying SEEDS (the scythe's product) to plant — a mound covers the
// hole, a full bucket waters it, and real tall grass sprouts after a while; consume that grass
// (scythe → new seeds, or fire) and the hole reopens. The game's renewable, placeable fuel.
// `inserter`: the robotic arm. It takes whatever item is lying on the tile behind it and puts it
// on the tile in front — the only thing in the game that moves an item without the hero carrying
// it, which is why it can cross a barrier the hero cannot. `waterWheel` is its believable power
// source: installed inside a continuous river, it publishes power into a named variable.
// `swingGate` is the locked door's twin WITHOUT a lock: it opens by itself when the hero bumps
// it, but only if the tile BEHIND it is clear — a swing leaf needs room to swing. It is the one
// barrier in the game that no item opens; what opens it is changing the far side (burning the
// grass standing there), which is why it pairs with fire and the robotic arm.
// `toolbox` is the workbench: two slot tiles behind it, the machine, and the output tile in front
// (A B [caixa] resultado). Drop an item on each slot and a RECIPE turns the pair into a third
// item — the only thing in the game that makes an item out of other items, instead of out of a
// prop the hero hits with a tool.
// `carnivorousPlant` is the farmed DEFENSE: grown from carnivore seeds in a plantSpot (or
// authored), it blocks its tile and EATS any enemy that stops beside it — then chews, exposed.
// It is a plant to everything else: fire burns it, the scythe fells it (no drop).
export type PropKind = 'campfire' | 'dryBush' | 'lockedDoor' | 'swingGate' | 'dryTree' | 'rock' | 'ironRock' | 'tallGrass' | 'lava' | 'water' | 'dryShrub' | 'bridgeSpot' | 'moonflower' | 'bombSpot' | 'plantSpot' | 'carnivorousPlant' | 'inserter' | 'toolbox' | 'woodenCrate' | 'pressurePlate' | 'waterWheel' | 'boiler' | 'wire' | 'electronicGate' | 'levelPortal' | 'furnace' | 'tripHammer'
  // A FABRICA. Os tres nomes abaixo sao os MESMOS de tres HeldItemKind (ver ItemPickup), e isso
  // e o que faz instalar uma maquina ser uma identidade em vez de uma tabela de-para. Esteira e
  // extrator carregam `dir` pela mesma razao do braco: ele decide de que tile a peca tira e em
  // qual ela poe. O bau nao carrega direcao — deposito nao tem frente.
  | 'belt' | 'chest' | 'extractor';

// Which way a prop faces. Clockwise from north, and the SAME order as the frames in a directional
// sheet, so `dir` indexes the art directly: 0=N 1=L 2=S 3=O.
export type PropDir = 0 | 1 | 2 | 3;
// `lit` only applies to campfires: an optional override forcing a fire to start already lit.
// The runtime does not depend on it — the campfire nearest the player start is always the lit
// "home" fire — so it survives being dropped by editor saves (which re-emit only type/x/y).
// `floodgate` only applies to a `lockedDoor`: opening it (with a key) DRAINS the run of water it
// holds back, opening a path AND laying a firebreak. Like `lit`, an editor save drops the flag,
// so floodgate doors are authored in gen-levels, not built in the editor.
// `dir` applies to an `inserter` and to a `toolbox`, and unlike `lit`/`floodgate` above it is NOT
// droppable.
// Those two are authored in gen-levels and the runtime can live without them; a rotation is
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
  // Pressure plates and water wheels publish into this named circuit; an inserter may consume
  // it as optional power. The field lives on the prop because each mechanism can use a different
  // circuit. An unbound inserter keeps legacy self-powered behaviour.
  //
  // O BAÚ também publica aqui, e é a peça que fez isto virar mais do que um interruptor: com
  // `quota`, ele publica QUANTO já entregou (ver ChestObject), e o portão eletrônico ligado ao
  // mesmo nome SOBE na proporção. É a única fechadura do jogo que não é uma chave: é uma
  // QUANTIDADE — o que a mão faz devagar e uma linha de produção faz sozinha.
  variable?: string;
  /**
   * Só para `chest`: a ENTREGA que esta arca cobra. Ela deixa de ser depósito e vira fechadura —
   * aceita só este tipo, e o que estiver ligado ao `variable` dela lê o progresso.
   *
   * Como `lit` e `floodgate`, um save do /editor DERRUBA este campo (o store re-emite só
   * type/x/y/dir/variable): quota é autoria de arquivo, feita no JSON do level, não no tabuleiro.
   */
  quota?: { kind: HeldItemKind; count: number };
  /**
   * So para `levelPortal`, e so no overworld: QUAL dungeon esta boca abre (1..9).
   * Um portal sem `level` e a saida — no modo level ele encadeia para o proximo, e dentro de uma
   * dungeon ele devolve o heroi ao tile do overworld por onde entrou (ver runtime/dungeonTrip).
   */
  level?: number;
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
  dialogs: Partial<Record<NpcKind, WorldDialog>>;
  // Named boolean puzzle state. Optional keeps every schema-v1 world written before global
  // variables valid; the editor normalises it to an empty record as soon as it opens one.
  globalVariables?: Record<string, boolean>;
};
