import Phaser from 'phaser';

import {
  ASSET_KEYS,
  BOMB_FRAMES,
  CAMPFIRE_SAFE_RADIUS_TILES,
  CHOPPABLE_UPPER_FRAMES,
  CHUNK_COLUMNS,
  CHUNK_ROWS,
  DIGGABLE_GROUND_FRAMES,
  DUNGEON_TILES,
  DIALOG_PANEL_FRACTION,
  DIALOG_PANEL_MAX_WIDTH,
  FONT_FAMILY,
  GAMEPLAY_HERO_MAX_SIZE,
  GAMEPLAY_HERO_SCALE,
  UI_HEART_FRAMES,
  HERO_FRAMES,
  PLAYER_HEALTH_MAX,
  ITEM_FRAMES,
  KEY_FRAMES,
  CAMPFIRE_SCORCH_RADIUS_TILES,
  LIGHT_RADIUS_TILES,
  MIN_BOARD_TILE_SIZE,
  MOONFLOWER_LIGHT_TILES,
  NPC_GATE_RADIUS_TILES,
  SCENE_DEPTHS,
  TEXT_RESOLUTION,
  TORCH_BURN_MS,
  TREE_CHOP_STAGE_FRAMES,
  BATTERY_FEED_MS,
  BATTERY_FRAMES,
  TREE_STICK_YIELD,
  TREE_TILE_STICK_CHANCE,
  TILESET_FRAME_SIZE,
  SEA_TILE_FRAMES,
  SEED_PACK_KINDS,
  SOLID_UPPER_FRAMES,
  UNIT_PACK_KINDS,
  POWER_WATTS,
  BLOOM_BLOWS,
} from '@/game/constants';
import type { AppMode } from '@/game/config';
import type { DialogScript, DialogTrade, DialogVoice } from '@/game/dialogs/NpcDialogs';
import {
  clearGameDebugApi,
  registerGameDebugApi,
  registerSceneDebugHooks,
  type GameDebugApi,
} from '@/game/debug/debugHooks';
import { initProfiler, profiler } from '@/game/debug/Profiler';
import { CoinManager } from '@/game/entities/CoinManager';
import { EnemyBase } from '@/game/entities/EnemyBase';
import { EnemyManager, type EnemyHit } from '@/game/entities/EnemyManager';
import { EnemySpawnerManager } from '@/game/entities/EnemySpawnerManager';
import { RING_MAX_TILES, UndeadSpawnDirector } from '@/game/entities/UndeadSpawnDirector';
import { NpcManager } from '@/game/entities/NpcManager';
import { HeartPickupManager } from '@/game/entities/HeartPickupManager';
import { ItemManager } from '@/game/entities/ItemManager';
import type { CollectedItem } from '@/game/entities/ItemManager';
import { MACHINE_ITEM_KINDS, isBagItem, type HeldItemKind } from '@/game/entities/ItemPickup';
import { CHOP_DRIVE_AT_MS, CHOP_IMPACT_MS, CHOP_TOTAL_MS, SwordSlash } from '@/game/runtime/SwordOrbit';
import { CampfireObject } from '@/game/objects/CampfireObject';
import { DryBushObject } from '@/game/objects/DryBushObject';
import { DryTreeObject } from '@/game/objects/DryTreeObject';
import { DryShrubObject } from '@/game/objects/DryShrubObject';
import { LavaObject } from '@/game/objects/LavaObject';
import { WaterObject } from '@/game/objects/WaterObject';
import { LockedDoorObject } from '@/game/objects/LockedDoorObject';
import { SwingGateObject } from '@/game/objects/SwingGateObject';
import { RockObject } from '@/game/objects/RockObject';
import { TallGrassObject } from '@/game/objects/TallGrassObject';
import { PlantSpotObject, type PlantableSeed } from '@/game/objects/PlantSpotObject';
import { CarnivorousPlantObject } from '@/game/objects/CarnivorousPlantObject';
import { RoboticArmObject, type ArmWorldPort } from '@/game/objects/RoboticArmObject';
import { ToolboxObject, type ToolboxWorldPort } from '@/game/objects/ToolboxObject';
import {
  catalogSteps, isCraftable, nextStep, recipeCost, recipeMaking, recipeStation,
  type CraftStation,
} from '@/game/objects/toolboxRecipes';
import {
  ToolboxOrderOverlay, type OrderCatalogView,
} from '@/game/runtime/ToolboxOrderOverlay';
import { MoonflowerObject } from '@/game/objects/MoonflowerObject';
import { BombSpotObject } from '@/game/objects/BombSpotObject';
import { WoodenCrateObject } from '@/game/objects/WoodenCrateObject';
import { PressurePlateObject } from '@/game/objects/PressurePlateObject';
import { WaterWheelObject, type WaterFlow } from '@/game/objects/WaterWheelObject';
import { BoilerObject } from '@/game/objects/BoilerObject';
import { WireObject } from '@/game/objects/WireObject';
import { BeltObject, type BeltWorldPort } from '@/game/objects/BeltObject';
import { ChestObject } from '@/game/objects/ChestObject';
import { ExtractorObject, type ExtractorWorldPort } from '@/game/objects/ExtractorObject';
import { FurnaceObject, type FurnaceWorldPort } from '@/game/objects/FurnaceObject';
import { TripHammerObject, type TripHammerWorldPort } from '@/game/objects/TripHammerObject';
import { AltarObject } from '@/game/objects/AltarObject';
import { hammerResult } from '@/game/objects/hammering';
import { ElectronicGateObject } from '@/game/objects/ElectronicGateObject';
import { LevelPortalObject } from '@/game/objects/LevelPortalObject';
import { WallTorchObject } from '@/game/objects/WallTorchObject';
import type { WorldProp } from '@/game/objects/WorldProp';
// O DEF de um prop (o registro de dados: tipo + tile + flags) contra o OBJETO de prop (a coisa
// viva com sprite e colisao) — dois tipos com o mesmo nome em modulos diferentes. Aqui os dois
// se encontram, porque o mundo infinito converte um no outro enquanto o heroi anda.
import type { PropDir, WorldProp as WorldPropDef } from '@/game/world/worldSchema';
import { t, tLines } from '@/game/i18n/i18n';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import {
  FX_DOT_TEXTURE, FX_PUFF_TEXTURE, FX_RING_TEXTURE,
  setCurrentWorld3D, World3D,
} from '@/game/render3d/World3D';
import { registerBucketTextures } from '@/game/render3d/bucketTexture';
import { registerCharcoalTexture } from '@/game/render3d/charcoalTexture';
import { registerPlacementTextures } from '@/game/render3d/placementTexture';
import { SellBoxObject } from '@/game/objects/SellBoxObject';
import { SellOverlay } from '@/game/runtime/SellOverlay';
import { registerFultonTextures } from '@/game/render3d/fultonTexture';
import { PickupPrompt } from '@/game/runtime/PickupPrompt';
import { HeroThought } from '@/game/runtime/HeroThought';
import { PlacementHints, type HintTile } from '@/game/runtime/PlacementHints';
import { wireShapeFromMask, wireShapeFrame } from '@/game/world/wireShapes';
import { solvePowerGrid, tileKey, type PowerNode } from '@/game/world/powerGrid';
import { registerLevelPortalTextures } from '@/game/render3d/levelPortalTexture';
import {
  PORTAL_TUNNEL_MIN_CRUISE_MS,
  destroyPortalTunnel,
  finishPortalTunnel,
  portalTunnelActive,
  PORTAL_TUNNEL_EXIT_MS,
  portalTunnelElapsedMs,
  startPortalTunnel,
} from '@/game/render3d/PortalTunnel';
import {
  PORTAL_FALL_HEIGHT_TILES,
  clearPendingPortalArrival,
  consumePendingPortalArrival,
  setPendingPortalArrival,
} from '@/game/runtime/portalTransition';
import { DialogOverlay, type DialogTradePort } from '@/game/runtime/DialogOverlay';
import { ExplorerDirector, type PropMemory } from '@/game/explorer/ExplorerDirector';
import { ExplorerHud } from '@/game/explorer/ExplorerHud';
import { ExtractPrompt } from '@/game/explorer/ExtractPrompt';
import { ChunkGateMarker } from '@/game/explorer/ChunkGateMarker';
import { ChunkGatePrompt, ChunkPurchaseOverlay } from '@/game/explorer/ChunkPurchaseOverlay';
import { ChunkUndeadDirector } from '@/game/explorer/ChunkUndeadDirector';
import { distanceFromCamp, type ChunkFrontier } from '@/game/explorer/explorerWorld';
import {
  EXTRACT_KEEP,
  addExplorerCoins,
  coinMultiplierAt,
  coinsForKill,
  consumeExplorerArrival,
  consumeExplorerCard,
  dangerScaleAt,
  endExplorerMode,
  explorerMeta,
  explorerRun,
  extractToCamp,
  isExplorerMode,
  loseRunToDeath,
  noteExplorerKill,
  rerollExplorerWorld,
  setExplorerDepth,
  spendExplorerCoins,
} from '@/game/explorer/explorerRun';
import { getActiveLevel, levelFilePath, setActiveLevel } from '@/game/runtime/activeLevel';
import { clearDungeonTrip, getDungeonTrip, setDungeonTrip } from '@/game/runtime/dungeonTrip';
import { clearActiveDungeon, dungeonWorldFor, persistActiveDungeon } from '@/game/dungeon/dungeonWorld';
import { LevelIntroOverlay } from '@/game/runtime/LevelIntroOverlay';
import { LevelButtons, PauseMenu, PauseTouchButton, isTouchDevice } from '@/game/runtime/PauseMenu';
import { ItemGetOverlay, type ItemGetConfig } from '@/game/runtime/ItemGetOverlay';
import { createHeroView, heroFootY, resetHeroView, tickHeroView, type HeroView } from '@/game/runtime/HeroView';
import { FREEZE_MS, FreezeManager } from '@/game/runtime/FreezeManager';
import { Inventory } from '@/game/runtime/Inventory';
import { ActionButtons, ControlsHint } from '@/game/runtime/ActionButtons';
import { spriteDataUrl, type SubScreenView } from '@/game/runtime/SubScreen';
import { QuickBag, type QuickBagView } from '@/game/runtime/QuickBag';
import { PlayerMovementController } from '@/game/runtime/PlayerMovementController';
import { GlobalVariables } from '@/game/runtime/GlobalVariables';
import { WorldCamera } from '@/game/runtime/WorldCamera';
import { getSoundManager } from '@/game/audio/SoundManager';
import { createBoardMetrics } from '@/game/shared/grid';
import { ChunkManager } from '@/game/world/ChunkManager';
import {
  AQUATIC_ENEMY_KINDS, ENEMY_BLOWS, FLYING_ENEMY_KINDS, SWORD_BLOW_DAMAGE,
  type EnemyKind, type ScreenContent,
} from '@/game/world/ScreenContent';
import {
  getCampfires,
  getChunkContent,
  getChunkTerrain,
  getWorldBounds,
  getDryBushes,
  getDryTrees,
  getDryShrubs,
  getEnemySpawns,
  getHeldItemPickups,
  getLavaTiles,
  getWaterTiles,
  getBombSpots,
  getBridgeSpots,
  getPlantSpots,
  getCarnivorousPlants,
  getInserters,
  getToolboxes,
  getIronRocks,
  getWoodenCrates,
  getPressurePlates,
  getBoilers,
  getWaterWheels,
  getWires,
  getBelts,
  getChests,
  getExtractors,
  getFurnaces,
  getTripHammers,
  getAltars,
  getElectronicGates,
  getLevelPortals,
  getSellBoxes,
  getGlobalVariables,
  getMoonflowers,
  getLockedDoors,
  getSwingGates,
  getRocks,
  getTallGrass,
  getDialog,
  getDialogKinds,
  getDialogVoice,
  getPlayerStart,
  getWorldName,
  isPuzzleWorld,
  setWorldData,
  type ChunkTemplate,
} from '@/game/world/WorldData';
import {
  adventureState,
  consumeAdventureRespawn,
  requestAdventureRespawn,
  saveAdventure,
  type AdventureMachine,
} from '@/game/runtime/adventureState';

type LevelManifestEntry = { file: string; level: number };

// ── A TRAVESSIA DO PORTAL, batida por batida ────────────────────────────────
// Quatro tempos, e a ordem deles e o efeito: o heroi some ANTES da viagem comecar, e a viagem
// acaba ANTES de ele reaparecer. Se dois se sobrepusessem, nenhum dos dois seria visto.
//
//   1. succao   — o portal come o heroi e a luz do mundo   (GameScene, level velho)
//   2. vazio    — o portal girando sozinho no escuro       (GameScene, level velho)
//   3. tunel    — a viagem                                  (PortalTunnel, sobrevive ao restart)
//   4. queda    — o heroi cai do ceu no mundo novo          (GameScene, level novo)
/** Quanto tempo o portal leva para engolir o heroi. */
const PORTAL_SUCK_MS = 900;
/** O portal sozinho depois de engolir — a pausa que deixa o gesto ser visto. */
const PORTAL_EMPTY_MS = 620;
/** Tempo entre abrir o tunel e destruir a cena por baixo dele (o overlay tem de cobrir antes). */
const PORTAL_TUNNEL_HANDOFF_MS = 260;
/** A queda do outro lado: alto o bastante para ter peso, curto o bastante para nao cansar. */
const PORTAL_FALL_MS = 620;

// O frame do CABO carregado na mao: o trecho reto e horizontal, apagado. Vale um nome porque ele
// aparece nas tres tabelas de arte de item e um `wireShapeFrame('h', false)` solto em cada uma
// seria a mesma decisao escrita tres vezes.
const WIRE_ITEM_FRAME = wireShapeFrame('h', false);


// The per-item 2D art (Phaser texture atlas keys): the swing arc, the overhead chop and the
// death elegy's back item all draw from here. The 3D twin is BACK_ITEM_VISUAL_3D below.
const ITEM_VISUAL_2D: Record<HeldItemKind, { texture: string; frame: number }> = {
  sword: { texture: ASSET_KEYS.swordItemIcon, frame: 0 },
  key: { texture: ASSET_KEYS.keyItem, frame: KEY_FRAMES.held },
  axe: { texture: ASSET_KEYS.axeIcon, frame: 0 },
  greatAxe: { texture: ASSET_KEYS.greatAxeIcon, frame: 0 },
  bomb: { texture: ASSET_KEYS.bombIcon, frame: 0 },
  lavaBoots: { texture: ASSET_KEYS.lavaBootsIcon, frame: 0 },
  pickaxe: { texture: ASSET_KEYS.pickaxeIcon, frame: 0 },
  scythe: { texture: ASSET_KEYS.scytheIcon, frame: 0 },
  shovel: { texture: ASSET_KEYS.shovelIcon, frame: 0 },
  wood: { texture: ASSET_KEYS.woodIcon, frame: 0 },
  stone: { texture: ASSET_KEYS.rock, frame: 0 },
  iron: { texture: ASSET_KEYS.ironItem, frame: 0 },
  ore: { texture: ASSET_KEYS.oreItem, frame: 0 },
  bloom: { texture: ASSET_KEYS.bloomItem, frame: 0 },
  seeds: { texture: ASSET_KEYS.seedsItem, frame: 0 },
  carnivoreSeeds: { texture: ASSET_KEYS.carnivoreSeedsItem, frame: 0 },
  bucket: { texture: 'bucket-icon', frame: 0 },
  bucketFull: { texture: 'bucket-full-icon', frame: 0 },
  charcoal: { texture: 'charcoal-item', frame: 0 },
  battery: { texture: ASSET_KEYS.battery, frame: BATTERY_FRAMES.empty },
  batteryFull: { texture: ASSET_KEYS.battery, frame: BATTERY_FRAMES.full },
  // A FABRICA carregada na mao: cada peca e a PROPRIA arte dela, como a pedra ja era. O jogador
  // tem de reconhecer no braco do heroi a mesma coisa que vai ficar plantada no chao.
  gear: { texture: ASSET_KEYS.gearItem, frame: 0 },
  wire: { texture: ASSET_KEYS.wire, frame: WIRE_ITEM_FRAME },
  belt: { texture: ASSET_KEYS.belt, frame: 1 },
  chest: { texture: ASSET_KEYS.chest, frame: 0 },
  boiler: { texture: ASSET_KEYS.boiler, frame: 0 },
  inserter: { texture: ASSET_KEYS.inserter, frame: 1 },
  extractor: { texture: ASSET_KEYS.extractor, frame: 1 },
  furnace: { texture: ASSET_KEYS.furnace, frame: 0 },
  tripHammer: { texture: ASSET_KEYS.tripHammer, frame: 3 },
  altar: { texture: ASSET_KEYS.altar, frame: 0 },
};

// The same per-item art resolved through the 3D texture registry (textures3d keys),
// for the back-item billboard that rides the hero in the world.
const BACK_ITEM_VISUAL_3D: Record<HeldItemKind, { texture: string; frame: number }> = {
  sword: { texture: 'sword-icon', frame: 0 },
  key: { texture: 'key-item', frame: KEY_FRAMES.held },
  axe: { texture: 'axe-icon', frame: 0 },
  greatAxe: { texture: 'great-axe-icon', frame: 0 },
  bomb: { texture: 'bomb-icon', frame: 0 },
  lavaBoots: { texture: 'lava-boots-icon', frame: 0 },
  pickaxe: { texture: 'pickaxe-icon', frame: 0 },
  scythe: { texture: 'scythe-icon', frame: 0 },
  shovel: { texture: 'shovel-icon', frame: 0 },
  wood: { texture: 'wood-icon', frame: 0 },
  stone: { texture: 'rock', frame: 0 },
  iron: { texture: 'iron-item', frame: 0 },
  ore: { texture: 'ore-item', frame: 0 },
  bloom: { texture: 'bloom-item', frame: 0 },
  seeds: { texture: 'seeds-item', frame: 0 },
  carnivoreSeeds: { texture: 'carnivore-seeds', frame: 0 },
  bucket: { texture: 'bucket-icon', frame: 0 },
  bucketFull: { texture: 'bucket-full-icon', frame: 0 },
  charcoal: { texture: 'charcoal-item', frame: 0 },
  battery: { texture: 'battery', frame: BATTERY_FRAMES.empty },
  batteryFull: { texture: 'battery', frame: BATTERY_FRAMES.full },
  // O par 3D da fabrica — as mesmas folhas, porque item e maquina sao o mesmo objeto.
  gear: { texture: 'gear-item', frame: 0 },
  wire: { texture: 'wire', frame: WIRE_ITEM_FRAME },
  belt: { texture: 'belt', frame: 1 },
  chest: { texture: 'chest', frame: 0 },
  boiler: { texture: 'boiler', frame: 0 },
  inserter: { texture: 'inserter', frame: 1 },
  extractor: { texture: 'extractor', frame: 1 },
  furnace: { texture: 'furnace', frame: 0 },
  tripHammer: { texture: 'trip-hammer', frame: 3 },
  altar: { texture: 'altar', frame: 0 },
};


// The raised sprite + caption for each item's first-time "item get" ceremony.
const ITEM_GET_CFG: Record<HeldItemKind, ItemGetConfig> = {
  sword: { texture: ASSET_KEYS.swordItem, frame: ITEM_FRAMES.swordIdle, label: 'VOCE PEGOU A ESPADA!' },
  key: { texture: ASSET_KEYS.keyItem, frame: KEY_FRAMES.held, label: 'VOCE PEGOU A CHAVE!' },
  axe: { texture: ASSET_KEYS.axeIcon, frame: 0, label: 'VOCE PEGOU O MACHADO!' },
  greatAxe: { texture: ASSET_KEYS.greatAxeIcon, frame: 0, label: 'MACHADO DE ACO! DERRUBA QUALQUER ARVORE' },
  bomb: { texture: ASSET_KEYS.bombItem, frame: BOMB_FRAMES.item, label: 'VOCE PEGOU A BOMBA! LEVE-A ATE A MARCA' },
  lavaBoots: { texture: ASSET_KEYS.lavaBootsIcon, frame: 0, label: 'VOCE PEGOU AS BOTAS DE LAVA!' },
  pickaxe: { texture: ASSET_KEYS.pickaxeIcon, frame: 0, label: 'VOCE PEGOU A PICARETA!' },
  scythe: { texture: ASSET_KEYS.scytheIcon, frame: 0, label: 'VOCE PEGOU A FOICE!' },
  shovel: { texture: ASSET_KEYS.shovelIcon, frame: 0, label: 'VOCE PEGOU A PA! CAVE NA TERRA' },
  wood: { texture: ASSET_KEYS.woodIcon, frame: 0, label: 'VOCE PEGOU UM GRAVETO!' },
  stone: { texture: ASSET_KEYS.rock, frame: 0, label: 'VOCE PEGOU UMA PEDRA!' },
  // A unica legenda do jogo que aponta pra OUTRA peca, e ela existe porque o ferro e o unico
  // item sem uso proprio: sozinho ele nao abre, nao queima, nao atravessa nada. Sem essa linha,
  // "peguei um bloco de metal e ele nao faz nada" seria a leitura correta — e errada.
  iron: { texture: ASSET_KEYS.ironItem, frame: 0, label: 'UM BLOCO DE FERRO! SO SERVE NUMA BANCADA' },
  seeds: { texture: ASSET_KEYS.seedsItem, frame: 0, label: 'VOCE PEGOU SEMENTES! PLANTE NUM BURACO' },
  carnivoreSeeds: { texture: ASSET_KEYS.carnivoreSeedsItem, frame: 0, label: 'SEMENTES CARNIVORAS! A PLANTA COME QUEM CHEGAR' },
  bucket: { texture: 'bucket-icon', frame: 0, label: 'VOCE PEGOU UM BALDE! ENCHA NO RIO' },
  bucketFull: { texture: 'bucket-full-icon', frame: 0, label: 'BALDE CHEIO DE AGUA!' },
  charcoal: { texture: 'charcoal-item', frame: 0, label: 'CARVAO! PISE NELE COM A TOCHA ACESA' },
  battery: { texture: ASSET_KEYS.battery, frame: BATTERY_FRAMES.empty, label: 'UMA BATERIA! CARREGUE PISANDO NUM CABO VIVO' },
  batteryFull: { texture: ASSET_KEYS.battery, frame: BATTERY_FRAMES.full, label: 'BATERIA CARREGADA! POUSE JUNTO A UM CABO' },
  // A CERIMONIA DA FABRICA. Cada legenda diz UMA coisa e ela e sempre a mesma: qual botao. Essa
  // e a unica informacao que o mundo nao consegue dar sozinho aqui — a peca no chao ja mostra o
  // que ela e, a broca ja mostra de que lado ela morde, o filete ja mostra se ha corrente; o que
  // nenhum pixel diz e que INSTALAR mora no botao de acao. Dito uma vez, na primeira vez.
  // A CADEIA DO FERRO se apresenta na primeira vez que cada elo aparece, e so ai — as tres frases
  // juntas sao a aula inteira: minerio NAO e ferro, o forno precisa de carvao, e a esponja
  // precisa apanhar. Nenhum pixel consegue dizer isso sozinho.
  ore: { texture: ASSET_KEYS.oreItem, frame: 0, label: 'MINERIO! E PEDRA COM FERRO PRESO DENTRO — O FORNO TIRA' },
  // A LEGENDA MENTIA, e mentiu por semanas: ela mandava martelar com o A, e o A virou a ESPADA na
  // reforma dos dois botões — quem seguia a instrução do próprio jogo apertava Z na esponja no chão
  // e via o herói dar uma espadada no ar. O relato foi exatamente esse ("não tem como bater no
  // chão"). Hoje a esponja se trabalha em dois lugares e os dois são o X: no ALTAR (o lugar, que é
  // o que a carta do astronauta ensina) ou no chão onde ela caiu.
  bloom: { texture: ASSET_KEYS.bloomItem, frame: 0, label: 'ESPONJA DE FERRO! PONHA NO ALTAR (Z) E MALHE COM O X' },
  gear: { texture: ASSET_KEYS.gearItem, frame: 0, label: 'UMA ENGRENAGEM! ELA SO SERVE NA BANCADA' },
  wire: { texture: ASSET_KEYS.wire, frame: WIRE_ITEM_FRAME, label: 'CABOS! O A DEITA UM NO CHAO' },
  belt: { texture: ASSET_KEYS.belt, frame: 1, label: 'UMA ESTEIRA! O A INSTALA, E ELA LEVA PRA ONDE VOCE OLHA' },
  chest: { texture: ASSET_KEYS.chest, frame: 0, label: 'UM BAU! O A INSTALA, O B GUARDA E TIRA' },
  boiler: { texture: ASSET_KEYS.boiler, frame: 0, label: 'UMA CALDEIRA! O A INSTALA — ELA PRECISA DE FOGO AO LADO' },
  inserter: { texture: ASSET_KEYS.inserter, frame: 1, label: 'UM BRACO! O A INSTALA — ELE TIRA DE TRAS E POE NA FRENTE' },
  extractor: { texture: ASSET_KEYS.extractor, frame: 1, label: 'UM EXTRATOR! O A INSTALA DE COSTAS PRO VEIO DE FERRO' },
  furnace: { texture: ASSET_KEYS.furnace, frame: 0, label: 'UM FORNO! MINERIO NUMA BANDEJA, CARVAO NA OUTRA' },
  tripHammer: { texture: ASSET_KEYS.tripHammer, frame: 3, label: 'UM MARTINETE! LIGADO, ELE MARTELA A ESPONJA POR VOCE' },
  altar: { texture: ASSET_KEYS.altar, frame: 0, label: 'UM ALTAR! O X INSTALA — Z POE A PECA, BATER MALHA' },
};

// O que um golpe tira de uma caveira (vida maxima 3). Dois degraus, agora que o soco morreu junto
// com a mao vazia (a espada nao se solta mais): a ESPADA, no botao Z, tira 2 — duas espadadas, e a
// segunda e a que importa; e qualquer item comum no X (chave, graveto, machado, picareta, foice)
// tira 1.5, tambem dois golpes. O UNICO golpe que ainda mata de uma vez e o graveto ACESO.
const MELEE_DAMAGE: Partial<Record<HeldItemKind, number>> = {
  // A ESPADA NAO MATA MAIS DE UM GOLPE, e esta linha e a mudanca de design mais cara deste
  // arquivo. Ela valia 999: todo corpo do jogo morria no primeiro acerto, entao o telegrafo de
  // 500ms que cada especie carrega NUNCA acontecia, o atordoamento nunca importava, o arremesso
  // nunca comprava nada e o encontro inteiro era "chegue perto, aperte Z". Nao havia combate —
  // havia execucao.
  //
  // O numero vem de ScreenContent e nao e escrito aqui porque a vida de TODA especie e derivada
  // dele (ver ENEMY_BLOWS/enemyMaxHealth): a escada de 2 a 9 espadadas e uma tabela de degraus,
  // nao de HP, entao mexer nesta linha reescala o bestiario inteiro de uma vez — que e o
  // comportamento correto, e o oposto do que houve quando ela caiu de 999 pra 2 e so duas
  // especies foram reconferidas (as outras seis ficaram morrendo de um golpe por meses).
  //
  // O `A Link to the Past` faz exatamente isso e nem disfarca: o soldado verde da primeira sala
  // aguenta varias espadadas com a espada inicial, e e por isso que aquela sala consegue ENSINAR
  // alguma coisa.
  sword: SWORD_BLOW_DAMAGE,
  wood: 1.5,
  axe: 1.5,
  greatAxe: 1.5,
  key: 1.5,
  pickaxe: 1.5,
  scythe: 1.5,
  shovel: 1.5,
  stone: 1.5, // a rock in the fist is as good as any other blunt tool
  charcoal: 1.5, // a lump of coal, likewise
  iron: 1.5, // ...e um lingote de metal, que era o unico bloco desta lista que nao batia em nada
  battery: 1.5, // an iron canister, likewise
  batteryFull: 1.5,
};

// ── OS DOIS BOTOES ───────────────────────────────────────────────────────────
//
// O jogo era walk-only: bater era andar contra o inimigo, e um heroi parado se defendia
// sozinho (a "guarda"). As duas coisas morrem aqui, e pelo mesmo motivo — enquanto encostar
// resolver, o botao A nao significa nada, e um golpe automatico e um golpe que o jogador nao
// deu. Agora:
//
//   A  →  a espada, na direcao em que ele olha (nao precisa encostar). Sem espada, o soco.
//   B  →  o item escolhido na subtela, no tile a frente: usa, ou pousa ali.
//
// Esbarrar continua existindo, e continua sendo um gesto de CORPO: empurra caixote, abre
// portao de bater, conversa com NPC, senta na fogueira acesa — e leva dano de contato de quem
// esta do outro lado. O que ele nao faz mais e machucar ninguem.
/** Quanto tempo um golpe leva antes de o proximo poder sair (o arco dura ~220ms). */
const ATTACK_COOLDOWN_MS = 260;
/** O mesmo para o B. Um pouco mais lento: usar uma ferramenta e um gesto, nao uma metralhadora. */
const USE_COOLDOWN_MS = 300;

// (Houve um REVOLVER aqui: a única peça que se mirava com o mouse em 360°, e a única exceção à
// lei dos dois botões. Ele saiu inteiro — arma, balas, cruz de mira e o desligamento do arrasto
// de mouse junto. O jogo voltou a ter uma gramática só: A é a espada na direção em que o herói
// olha, B é o item no tile à frente, e nada se aponta.)

// ── A ESGRIMA: o que faz um golpe ser fluido ─────────────────────────────────
//
// Tres coisas, e nenhuma delas e o dano.
//
/**
 * **O BOTAO NAO SE PERDE.** Um A apertado durante a cadencia do golpe anterior (ou durante o
 * hitstop, que congela o update inteiro por ate 110ms) era simplesmente DESCARTADO — e o jogador
 * que encadeia dois golpes no ritmo certo era punido por acertar o ritmo. Agora ele fica guardado
 * por esta janela e sai no instante em que a cadencia libera. E o `input buffering` que todo jogo
 * de acao tem: as referencias medem 80-120ms em plataforma e 6-8 frames em corpo a corpo, e 130ms
 * cai no meio disso. Curto o bastante pra nunca dar um golpe que voce nao pediu.
 */
const ACTION_BUFFER_MS = 130;
/**
 * O COMPROMISSO DO GOLPE: por quanto tempo os pés ficam presos ao apertar A.
 *
 * O herói golpeava em pleno passo, na velocidade máxima, e isso é o que fazia o espaçamento não
 * custar nada: dá para atacar e recuar no mesmo gesto, então nunca há um instante em que estar
 * perto é perigoso. Preso por um sexto de segundo, atacar vira uma DECISÃO — e é a mesma janela
 * que o `A Link to the Past` cobra do Link, que fica plantado enquanto a espada varre.
 *
 * Curto de propósito: mais que isto e o jogo passa a parecer travado, que é o defeito oposto e
 * pior. A raiz também não congela um passo em curso — ver PlayerMovementController.root.
 */
const SWING_ROOT_MS = 160;
/** O giro é o gesto caro: ele planta o herói por mais tempo, e é o que ele paga pelos oito tiles. */
const SPIN_ROOT_MS = 260;
/**
 * A INVESTIDA: quanto o corpo do herói avança na direção do golpe, em tiles (ver HeroView.lungeX).
 *
 * Pequena de propósito — um oitavo de tile é um pixel e meio na arte, e é o suficiente: o que
 * vende o peso é a CURVA (sai em 60ms, volta em 130ms, dentro da raiz de 160), não a distância.
 * Um avanço grande faria o herói parecer que anda ao golpear, e andar é justamente o que a raiz
 * acabou de proibir.
 */
const SWING_LUNGE_TILES = 0.13;
const SWING_LUNGE_OUT_MS = 60;
const SWING_LUNGE_BACK_MS = 130;
/**
 * Quanto tempo o herói fica na POSE DE ATAQUE (ver HERO_FRAMES.attack).
 *
 * Casado com a raiz (`SWING_ROOT_MS`), não com o arco: o arco dura 155ms mais 65 de sumiço, e
 * deixar a pose até o fim do sumiço mostraria o herói ainda golpeando depois de a lâmina já ter
 * ido. O que o corpo dele conta é o COMPROMISSO — enquanto os pés estão presos, ele está no golpe;
 * quando soltam, acabou. Uma coisa só de aprender, dois relógios que terminam juntos.
 */
const SWING_POSE_MS = SWING_ROOT_MS;
/**
 * **O GOLPE VARRE A ÁREA À FRENTE — o bloco 2×3.** O desenho sempre foi uma foice larga em volta
 * do herói e o acerto era UM tile; virou a fileira da frente (3 tiles), e agora são DUAS fileiras:
 * a colada no corpo e a da ponta da lâmina. Seis tiles, até seis corpos no mesmo gesto — que é a
 * sensação que uma espada larga promete e que um acerto de um tile desmentia.
 *
 * As duas fileiras não são a mesma coisa e por isso são duas listas:
 *   - **NEAR** é o que o CORPO alcança. O soco de mão vazia para aqui, e o arco desenhado da
 *     espada nasce aqui.
 *   - **FAR** é o que só a LÂMINA alcança, e ela precisa de caminho: um tile da fileira de trás
 *     só conta se o tile à frente dele não for parede (ver `arcTiles`). Sem isso a espada cortaria
 *     através de rocha, que é a primeira coisa que o jogador tenta e a primeira que ele não
 *     perdoa.
 *
 * Os lados puros (±90°) continuam de fora: quem quer cortar em volta paga o preço da lâmina
 * rodopiante. Cada par é `[à frente, para o lado]` em tiles, rodado para a direção olhada em
 * `arcTiles`. O PRIMEIRO par tem de continuar sendo o tile à frente: é o alvo canônico, o que todo
 * playtest de mira lê. O contrato VISUAL disto é a órbita do punho (`SLASH_ORBIT_FACTOR`, no
 * SwordOrbit): a espada é desenhada no tamanho que ela tem — nunca esticada, e sem nenhum efeito
 * na frente dela — e alcança porque o braço estende, pondo a ponta a ~1,7 tiles, dentro da segunda
 * fileira. Os dois números andam juntos, ou o acerto volta a mentir sobre o alcance.
 */
const SWING_ARC_NEAR: ReadonlyArray<readonly [number, number]> = [[1, 0], [1, 1], [1, -1]];
const SWING_ARC_FAR: ReadonlyArray<readonly [number, number]> = [[2, 0], [2, 1], [2, -1]];
/**
 * **O ACERTO COMPRA TEMPO.** Quanto o corpo atingido fica atordoado — sem andar, sem armar
 * (`EnemyBase.applyHitstun`). E a "janela de oportunidade" que a anatomia de um ataque reserva
 * pra recuperacao, so que do lado de ca: um pouco maior que a cadencia do golpe, entao encadear
 * mantem o bicho preso e a iniciativa e de quem esta batendo.
 */
const HITSTUN_MS = 300;
const HITSTUN_SPIN_MS = 420;

/**
 * **A RECUSA TAMBÉM É UM IMPACTO.** Quanto o mundo congela quando o golpe do herói NÃO passa.
 *
 * O acerto sempre teve hitstop (60ms, 110 quando mata) e as duas recusas não tinham nada — então a
 * lâmina atravessava uma guarda erguida com MENOS resistência do que atravessava o ar. Um golpe
 * aparado é um encontro de duas coisas duras, e o hitstop é a ferramenta mais barata e mais direta
 * que existe para dizer "isto não passou".
 *
 * O aparo trava mais que o resvalo porque são coisas diferentes: aparar é aço encontrando aço
 * (CONTORNE), resvalar é a lâmina escorregando de um corpo que ainda pisca (ESPERE). Os dois ficam
 * abaixo do hitstop de um acerto — recusar nunca pode pesar mais que conectar.
 */
const GUARD_HITSTOP_MS = 55;
const GLANCE_HITSTOP_MS = 28;

// ── A LAMINA RODOPIANTE ──────────────────────────────────────────────────────
//
// Segure o A, o gume junta forca, solte e o heroi gira cortando os OITO vizinhos. E a unica
// resposta do jogo a estar cercado — e o cerco de caveiras e metade da aventura —, e ela custa:
// meio segundo parado no meio da matilha, e uma cadencia mais longa depois.
/** Quanto tempo com o A segurado ate a lamina ficar carregada. */
const SPIN_CHARGE_MS = 450;
/**
 * A partir de quando o segurar COMEÇA A FALAR. Os 450ms entre o aperto e o sino eram mudos —
 * nenhum som, nenhum brilho, nada crescendo — e um gesto que só se comunica quando termina só
 * existe para quem já sabia dele. Deste ponto em diante sobem faíscas cada vez mais vivas e um
 * zumbido fino que cresce até o sino (ver tickSpinCharge). O limiar existe por causa do TOQUE:
 * todo golpe do A é um segurar de alguns frames, e uma carga que falasse no primeiro milissegundo
 * transformaria cada espadada num começo de giro falso.
 */
const SPIN_CHARGE_TELL_MS = 120;
/** A cadencia depois do giro. Longa de proposito: o gesto e um compromisso, nao uma alternativa. */
const SPIN_COOLDOWN_MS = 460;
/** Faisca de carga a cada tantos ms enquanto a lamina esta pronta — o aviso de que ela esta. */
const SPIN_READY_MOTE_MS = 90;

/**
 * Quanto tempo dura o perdao de virar-se para um monstro (ver `turnedTowardCreature`). Tem de
 * cobrir um toque humano inteiro — 3 a 6 frames — e nao pode chegar perto do intervalo de um
 * esbarrao segurado (220ms), ou segurar a seta contra um bicho deixaria de custar caro.
 */
const CREATURE_TURN_GRACE_MS = 180;

/**
 * A JANELA DE INVENCIBILIDADE do herói depois de levar um golpe, e a piscada que a mostra.
 *
 * Os dois números eram independentes e discordavam: a janela é de 1500ms e a piscada tocava
 * `repeat: 5` de 80ms com yoyo — 960ms. Nos últimos 540ms o herói parecia vulnerável e não era,
 * que é exatamente o defeito consertado do lado do inimigo (ver EnemyBase.hurtInvulnMs). Agora a
 * contagem SAI da janela: um número, e a piscada não pode mais mentir sobre ele.
 *
 * `floor` e não `ceil` de propósito — é melhor parar de piscar 60ms antes de a janela fechar do
 * que continuar piscando depois de já poder apanhar.
 */
const PLAYER_INVULN_MS = 1500;
/**
 * O ATORDOAMENTO DO HERÓI — quanto tempo um golpe recebido tira dele, e ele existe porque a lei
 * mais importante do combate só valia num sentido.
 *
 * "O acerto compra TEMPO": todo corpo que o herói atinge fica 300ms sem andar e sem armar
 * (`HITSTUN_MS`). O herói atingido não pagava nada — levava os i-frames, o arremesso e o hitstop, e
 * podia golpear no frame seguinte. Ou seja, trocar dano era LUCRO para quem tem a espada: apanhar
 * não custava iniciativa nenhuma, e a única coisa que o telegrafo de 500ms podia comprar do jogador
 * era um coração.
 *
 * 240ms, e o número não é escolhido no vácuo: é exatamente a duração do tween que devolve o herói
 * ao centro da tela depois do empurrão. Ele recupera o controle no instante em que o corpo assenta,
 * então o que se vê e o que se pode fazer terminam juntos — mais que isso viraria uma pausa
 * sentida, e menos deixaria o herói agindo enquanto ainda está sendo jogado para trás.
 *
 * Abaixo dos 300ms do inimigo de propósito: quem apanha já perdeu um coração, e o jogo nunca deve
 * cobrar duas vezes pela mesma falha. E toda a janela cabe dentro dos 1500ms de invencibilidade —
 * o herói está atordoado, mas nunca atordoado E vulnerável.
 */
const PLAYER_STAGGER_MS = 240;
const PLAYER_BLINK_HALF_MS = 80;
const PLAYER_BLINK_REPEAT = Math.max(0, Math.floor(PLAYER_INVULN_MS / (PLAYER_BLINK_HALF_MS * 2)) - 1);

const BOMB_FUSE_MS = 1600;
const BOMB_BLAST_RADIUS_TILES = 2.2;

// How long a burning tile takes to set its neighbours alight. Slow enough that the fire is a
// thing you WATCH travel (and can still run from), fast enough that a fuse pays off inside one
// held thought. See GameScene.scheduleFireSpread.
const FIRE_SPREAD_MS = 850;

// Chance de um corpo abatido soltar um coracao — SO com o heroi ferido (coracao no chao com
// vida cheia e lixo visual). E a unica cura de campo da aventura: a fogueira cura em casa, o
// drop cura na estrada e nas dungeons, onde fogueira nao existe.
const HEART_DROP_CHANCE = 0.2;

// Uma caveira paga SEMPRE, e uma em cada quatro paga dobrado (ver GameScene.undeadCoins).
const UNDEAD_DOUBLE_COIN_CHANCE = 0.25;

// O QUE UM CORPO DE ÁGUA PAGA. Três, contra a moeda da caveira — e o número é o preço de um
// problema, não de uma vida: o zora mora onde a espada não alcança, e matá-lo exige escolher a
// margem certa e esperar a janela em que ele emerge. Um corpo que cobra uma POSIÇÃO paga mais que
// um que caminha até você. É também a única fonte de moeda que o jogador pode PROCURAR no mapa —
// um lago comprado vira uma renda, e é isso que faz a carta de água ser uma decisão econômica.
const AQUATIC_KILL_COINS = 3;

// Resting in a lit campfire's safe ring mends one heart every this many ms (leaving the ring
// resets the timer, so healing is a "warm up by the fire" beat, not passive regen anywhere).
const HEALTH_REGEN_MS = 1200;
// While the fire mends the hero, warm ember motes stream fire→hero on this cadence, so the
// healing visibly COMES FROM the campfire instead of just silently happening.
const HEAL_MOTE_INTERVAL_MS = 110;
const HEAL_MOTE_TRAVEL_MS = 750;

// Below this fuel fraction the carried flame starts GUTTERING: its light jitters and closes
// in, the held torch flickers, and smoke wisps trail off the tip — the burnout announces
// itself instead of the flame dying without warning on a hidden clock.
const TORCH_GUTTER_FRAC = 0.4;
// The torch's light shrinks with its fuel (full circle → this fraction right before it dies),
// so the closing pool of firelight IS the fuel gauge.
const TORCH_MIN_LIGHT_FRAC = 0.4;
// The flame on the torch's tip: the same little fire that burns on a lit bush, cycling at a
// deliberately coarse cadence — the frame flip IS the animation, there is no smooth sway.
const TORCH_FLAME_KEYS = ['tiny-fire-0', 'tiny-fire-1', 'tiny-fire-2'] as const;
/**
 * A janela pós-degelo em que o herói não recongela (ver freezeHero): tempo de UM passo e meio
 * fora da linha de tiro — o suficiente para o congelamento nunca virar um laço sem saída, curto
 * o bastante para dois zoras em fogo cruzado continuarem sendo um problema de verdade.
 */
const HERO_FREEZE_IMMUNE_MS = 1300;
const TORCH_FLAME_FRAME_MS = 110;

// Chest height, in tiles: where a blow lands and where the world's one-shot FX (flash, sparks,
// motes) hang. The 2D game pinned them to the sprite's screen centre; in 3D they live at the
// body's real height, so they are lit, occluded and blurred like anything else out there.
const FX_BODY_ELEV = 0.5;
const FLASH_SIZE = 0.5; // tiles across, before the hit's growth tween

// What every one-shot FX billboard shares: it hangs around its point (centred), the night fog
// never touches it, and it never writes depth — see Billboard3D for why each of those matters
// to a translucent particle.
const FX_BILLBOARD = { centered: true, fog: false, depthWrite: false } as const;

// How far in front of a rock's centre its struck FACE is (tiles). The pick's debris comes off the
// face the hero is swinging at, not out of the middle of the tile he cannot even see.
const ROCK_FACE_TILES = 0.34;
// Granite greys for the chips — a solid FILL (see spawnRockDebris), so these are the exact colours
// that fly. Pale enough to read against the night ground, and short of the near-white that sends an
// unlit sprite over the bloom threshold and turns a stone chip into a spark.
const ROCK_CHIP_TINTS = [0xb4bac1, 0x99a0a8, 0xc3c9cf, 0x848c95] as const;
// Os cacos de uma pedra de FERRO. Mesma ideia, paleta quente: a rampa drywood do veio, com um
// unico cinza sobrando pra lembrar que o minerio vem embrulhado em rocha. E o que faz a pancada
// numa pedra de minerio parecer diferente ANTES do item cair — a diferenca chega no golpe, nao
// so no drop.
const ORE_CHIP_TINTS = [0x826841, 0x733e11, 0x99a0a8, 0x68380f] as const;

// The undead danger meter (UndeadSpawnDirector, 0..1) creeps onto the screen as a cold
// vignette: the deeper the dark wakes, the harder the edges close in — and near full danger
// it warms from cold night-blue toward blood-red and breathes faster. Without it the siege
// ramp was totally invisible (only the music changed).
const DANGER_VIGNETTE_MAX_ALPHA = 0.5;
const DANGER_VIGNETTE_COLD = 0x0a0d24;
const DANGER_VIGNETTE_BLOOD = 0x3d0a12;

// At or below this many hearts the hero shows the low-health "heartbeat" (a red pixel outline).
const LOW_HEALTH_HEARTS = 2;
// Low-health fire compass (Skyrim-style): a small flame marker orbits the hero at this radius,
// pointing at the nearest lit campfire, so a dying player always knows where safety is.
const FIRE_COMPASS_ORBIT_TILES = 1.55;
// The 8 offset directions used to build the red outline around the hero (cardinals + diagonals).
const OUTLINE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1],
];
// The 4 grid moves a walking entity has — the undead reachability flood-fill steps by these.
const CARDINAL_DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
];

// How many river tiles a single felled tree can bridge when it topples ("TIMBER!"). A wider
// river needs more than one tree.
const TIMBER_MAX_SPAN = 3;

// A planted bomb burning its fuse. The tween handle rides along so an early detonation
// (fire reaching the payload) can kill the blink together with the sprite.
type ActiveBomb = { worldX: number; worldY: number; sprite: Billboard3D; fuseTween: Phaser.Tweens.Tween };

// How long to hide the back item during a swing (a touch longer than SwordSlash's arc + fade,
// ~155 + 65ms) so the item never shows on the back and in the swing arc at the same time.
const SWING_HIDE_MS = 240;

// Where a swing PIVOTS on the hero, in tiles above the ground. Every arc used to be projected at
// elevation 0 — the tile he STANDS on — so the sword, the axe and the pick all swung from his
// ankles: the blade raked the ground and, facing north, the whole arc sat past his head instead
// of in his hands. A swing comes from the HANDS, and the hero is about one tile tall.
const SWING_HAND_ELEVATION = 0.55;
// Facing away (north), the pivot is also pulled a little TOWARD the camera, so the arc crosses
// the hero's body and reads as happening in FRONT of him. Without it a northward swing projects
// beyond his back — correct in world space, but on screen it reads as him hitting behind himself.
// The same asymmetry positionBackItem already encodes for the item slung on his back.
const SWING_BACK_TURNED_NEAR = 0.3;

export class GameScene extends Phaser.Scene {
  public static readonly key = 'game';

  private camera?: WorldCamera;
  private chunkManager?: ChunkManager;
  private enemyManager?: EnemyManager;
  private spawnDirector?: UndeadSpawnDirector;
  // As covas AUTORADAS (aba Inimigos do editor): tile fixo, um corpo por vez, outro depois que
  // ele cai. Vive ao lado do cerco e nao dentro dele — ver EnemySpawnerManager.
  private enemySpawners?: EnemySpawnerManager;
  // Per-frame memo for undeadReachableTiles (the spawn director probes many tiles per tick).
  private reachableFrame = -1;
  private readonly reachableTiles = new Set<string>();
  private playerSafe = true;
  // Music staging: how long the field has been clear of undead (hysteresis so the
  // combat track doesn't flap while skulls spawn and die in quick succession).
  private dangerCalmMs = 0;
  private npcManager?: NpcManager;
  // O CONGELAMENTO (a bola do zora): quem trava qualquer coisa num tile — ver FreezeManager.
  private freezeManager?: FreezeManager;
  // A janela pós-degelo em que o herói NÃO recongela: sem ela, dois zoras alternando cuspes
  // seriam um stun-lock sem contra-jogada — o jogador precisa de um instante para sair da linha.
  private heroFreezeImmuneMs = 0;
  private coinManager?: CoinManager;
  private heartPickupManager?: HeartPickupManager;
  private itemManager?: ItemManager;
  private swordSlash?: SwordSlash;
  /**
   * A MOCHILA. O heroi carregava um item so, e pegar outro largava o primeiro; com dois botoes
   * ele guarda tudo e ESCOLHE o que fica no B (ver Inventory).
   *
   * `heldItem` continua existindo, e continua querendo dizer exatamente o que sempre quis: o que
   * esta na mao AGORA. Toda fechadura do mundo pergunta isso, e a resposta segue sendo uma so —
   * o que mudou foi de onde ela vem. Por isso ele virou um getter sobre a selecao, e nao um
   * campo que a mochila teria de manter em sincronia (dois lugares guardando a mesma verdade e
   * a maneira certa de eles discordarem daqui a um mes).
   */
  private readonly inventory = new Inventory();
  private get heldItem(): 'none' | HeldItemKind {
    return this.inventory.selected;
  }

  /**
   * Escrever em `heldItem` e a porta de AUTORIA (debug e playtest): "ponha isto na mochila e
   * deixe na mao". Ela existe porque os cenarios montam o estado assim desde sempre
   * (`__scene.heldItem = 'pickaxe'`), e trocar isso por um metodo novo faria toda a suite mentir
   * sobre o que ela testa. `'none'` significa MAOS VAZIAS: solta a selecao sem esvaziar a
   * mochila — que e exatamente o que uma assercao de "bare-handed" quer dizer.
   */
  private set heldItem(kind: 'none' | HeldItemKind) {
    // `'sword'` VIRA `'none'`, e não um no-op silencioso: a espada saiu da mochila, então "ponha a
    // espada na mão" hoje significa "nenhum item selecionado — só a arma do herói". Sem esta
    // tradução, um cenário antigo escreveria `heldItem = 'sword'` e continuaria com a picareta
    // empunhada sem nada avisar.
    if (kind === 'none' || kind === 'sword') this.inventory.select('none');
    else this.inventory.add(kind);
    this.updateBackItem();
  }

  // `seenItems` tracks which kinds have had their one-time "item get" ceremony, so re-picking a
  // dropped item just flies it onto the hero's back.
  private readonly seenItems = new Set<HeldItemKind>();
  // Fire lives on the held item: only the wood club can be lit at a campfire (the sword can't).
  private heldOnFire = false;
  // Remaining life of the carried flame, in ms. Counts down while heldOnFire; re-igniting at
  // any living fire (lit campfire or lava) refills it. Zero snuffs the torch.
  private torchFuelMs = 0;
  // A carga da batteryFull NA MAO — o par eletrico do torchFuelMs: viaja com o item em toda
  // troca de maos (chao -> mao -> chao -> garra), entao pegar e re-encaixar nunca recarrega.
  private heldBatteryChargeMs = 0;
  // Guttering flicker for a dying carried flame — a random-walk like lightFlicker, but its
  // amplitude grows as the fuel runs out, so the torchlight jitters harder near the end.
  private readonly torchGutter = { level: 1.0, velocity: 0 };
  // Cadence for the smoke wisps / embers trailing off a guttering torch.
  private torchEmberTimer = 0;
  // Pixel-flame billboard pinned on the torch's tip; its size tracks the remaining fuel.
  private torchFlameBb?: Billboard3D;
  private campfires: CampfireObject[] = [];
  private dryBushes: DryBushObject[] = [];
  private lockedDoors: LockedDoorObject[] = [];
  private swingGates: SwingGateObject[] = [];
  private dryTrees: DryTreeObject[] = [];
  private dryShrubs: DryShrubObject[] = [];
  private rocks: RockObject[] = [];
  private tallGrasses: TallGrassObject[] = [];
  // Night-blooming flowers: shut (blocking) near a lit campfire, open (walkable) in the dark.
  private moonflowers: MoonflowerObject[] = [];
  // Walk-on marks where a carried bomb plants itself (the game has no "use item" button).
  private bombSpots: BombSpotObject[] = [];
  // Canteiros: dug holes where seeds plant on step, mounds water on bump, grass regrows.
  private plantSpots: PlantSpotObject[] = [];
  // As plantas carnívoras — autoradas OU brotadas da semente carnívora em runtime (o push é
  // sempre in place: o propRegistry referencia este array; ver o comentário dele).
  private carnivorousPlants: CarnivorousPlantObject[] = [];
  private inserters: RoboticArmObject[] = [];
  // A bancada: duas bandejas atras, o corpo, a saida na frente. Ver ToolboxObject.
  private toolboxes: ToolboxObject[] = [];
  // O CATALOGO DA ENCOMENDA, e a bancada em que ele foi aberto. Ele congela o mundo como as
  // cartas de chunk (a bolsa e a unica tela deste jogo que roda com o mundo vivo).
  private orderOverlay?: ToolboxOrderOverlay;
  private orderBox?: ToolboxObject;
  private woodenCrates: WoodenCrateObject[] = [];
  private pressurePlates: PressurePlateObject[] = [];
  private waterWheels: WaterWheelObject[] = [];
  private boilers: BoilerObject[] = [];
  private electronicGates: ElectronicGateObject[] = [];
  private levelPortals: LevelPortalObject[] = [];
  /** As caixas de venda: o único corpo que devolve moeda (ver SellBoxObject). */
  private sellBoxes: SellBoxObject[] = [];
  /** A mesa de despacho aberta (ver SellOverlay). */
  private sellOverlay?: SellOverlay;
  /** As tochas de parede de uma dungeon — nascem de TILES, nao de props (ver WallTorchObject). */
  private wallTorches: WallTorchObject[] = [];
  /**
   * O MODO EXPLORADOR. Presente so quando a expedicao esta rodando; nos outros modos e
   * undefined e nada disto existe. Ele e quem move a janela do mundo infinito (o terreno
   * assado e os props vivos) enquanto o heroi anda — ver ExplorerDirector.
   */
  private explorer?: ExplorerDirector;
  private explorerHud?: ExplorerHud;
  private chunkUndead?: ChunkUndeadDirector;
  private readonly chunkGateMarkers = new Map<string, ChunkGateMarker>();
  private chunkGatePrompt?: ChunkGatePrompt;
  private chunkPurchaseOverlay?: ChunkPurchaseOverlay;
  private extractPrompt?: ExtractPrompt;
  /** Portais ja recusados: perguntar de novo a cada passo dentro do mesmo tile seria assedio. */
  private declinedPortals = new Set<string>();
  private levelIntroOpen = false;
  private levelIntroOverlay?: LevelIntroOverlay;
  private levelTransitioning = false;
  /**
   * A luz do mundo como ela era antes da succao comer (ambient / moon / exposure).
   *
   * So existe para o caminho de ERRO: quando a transicao falha, a cena continua viva e nao pode
   * ficar no escuro que o portal abriu. No caminho feliz nada e restaurado — o World3D inteiro
   * e descartado no restart e o do level novo nasce com os padroes.
   */
  private litParams?: { ambient: number; moon: number; exposure: number };
  // Os cabos de energia + o indice espacial deles e o conjunto dos que estao VIVOS neste frame
  // (recalculado em updatePowerGrid — a corrente nao tem memoria, so a fonte).
  private wires: WireObject[] = [];
  private wireIndex = new Map<string, WireObject>();
  private liveWires = new Set<string>();
  /**
   * Quanto da propria vazao cada CONSUMIDOR esta recebendo (0..1), por tile — a saida de
   * `solvePowerGrid`, reescrita todo frame. Ela substituiu o booleano "ha corrente aqui": um
   * booleano nao tem gargalo, e sem gargalo nao ha fabrica, so fiacao.
   */
  private powerSatisfaction: ReadonlyMap<string, number> = new Map();
  /** As marcas de "a peça cai aqui" — o quadrado no chão e o keycap (ver PlacementHints). */
  private placementHints?: PlacementHints;
  /** O aviso "X — Take <coisa>" sobre a cabeca do heroi. Ver PickupPrompt. */
  private pickupPrompt?: PickupPrompt;
  /** O balao de PENSAMENTO do heroi: um icone, um instante. Ver HeroThought. */
  private heroThought?: HeroThought;
  // A FABRICA construida pelo jogador (e a autorada no /editor, que usa as mesmas classes).
  private belts: BeltObject[] = [];
  private chests: ChestObject[] = [];
  private extractors: ExtractorObject[] = [];
  // A CADEIA DO FERRO: o forno reduz minerio com carvao, o martinete malha a esponja.
  /**
   * Quantas marteladas a ESPONJA de cada tile ja levou. Ela e um item no chao, e itens no chao
   * nao tem estado proprio neste jogo — entao a contagem mora aqui, por tile, e some quando o
   * tile deixa de ter uma esponja. E a mesma contagem que o martinete faz internamente
   * (BLOOM_BLOWS), porque a mao e a maquina precisam custar o MESMO: um numero diferente para o
   * mesmo gesto faria o alivio de automatizar virar uma conta em vez de uma sensacao.
   */
  private readonly bloomBlows = new Map<string, number>();
  private furnaces: FurnaceObject[] = [];
  private tripHammers: TripHammerObject[] = [];
  private altars: AltarObject[] = [];
  private globalVariables = new GlobalVariables();
  private lavaTiles: LavaObject[] = [];
  private waterTiles: WaterObject[] = [];
  // O registro único de props: referencia os MESMOS arrays tipados acima, então destruição,
  // colisão (isSolidForEntities) e reset atravessam todos os props num loop só — um prop novo
  // é uma entrada aqui, não seis edições espalhadas. Consequência: fora do create/shutdown os
  // arrays só podem ser mutados IN PLACE (push/splice); reatribuir um deles órfão o registro.
  // `hazard` marca os dois tiles que as botas de lava vadeiam (lava e água) — todo o resto
  // bloqueia incondicionalmente pelo próprio `blocking` do prop.
  private propRegistry: Array<{ list: WorldProp[]; hazard?: boolean }> = [];
  // Lit bombs on the ground — world-anchored billboards ticking until they blow.
  // `fuseTween` viaja no registro para a explosao poder MATA-LO: o fogo alcancando a bomba
  // explode antes do fim do fusivel, e sem parar o tween o pisca continuava rodando setTint
  // num material ja disposed ate o fusivel "terminar".
  private activeBombs: ActiveBomb[] = [];
  // The hero has no Phaser GameObject in the world: he is plain state (tweened like any
  // object) drawn by the 3D billboard alone. See HeroView.
  private readonly hero: HeroView = createHeroView();
  // The held item, slung diagonally on the hero's back like it's tucked in a satchel.
  // In-world it's a 3D billboard riding the hero billboard (so the body occludes it
  // properly); the 2D image only returns for the screen-space death elegy.
  private backItem?: Phaser.GameObjects.Image;
  // The hero's 2D stand-in, struck only for the screen-space death elegy.
  private deathHero?: Phaser.GameObjects.Sprite;
  private backItemBb?: Billboard3D;
  // Hides the back item while the same item is mid-swing, so it isn't shown in two places.
  private backItemSwingTimer?: Phaser.Time.TimerEvent;
  private movementController?: PlayerMovementController;
  private playerWorld = { worldX: 0, worldY: 0 };
  private playerMaxHealth = PLAYER_HEALTH_MAX;
  private playerHealth = PLAYER_HEALTH_MAX;
  /** A escada de tom da moeda: quantas seguidas, e quando foi a última (ver o onCollect dela). */
  private coinChainStep = 0;
  private coinChainAt = -Infinity;
  private playerInvincible = false;
  private invincibleTimer = 0;
  /** > 0 = o herói ainda pertence ao golpe que levou (ver PLAYER_STAGGER_MS). */
  private playerStaggerMs = 0;
  // Combat juice: while > 0 the whole world (tweens included) is frozen on an impact frame.
  private hitstopMs = 0;
  // Os dois botoes, cada um com sua cadencia (ver ATTACK_COOLDOWN_MS / USE_COOLDOWN_MS).
  private attackCooldownMs = 0;
  private useCooldownMs = 0;
  // ...e cada um com seu buffer: um botao apertado durante a cadencia nao se perde, espera aqui
  // e sai no instante em que ela libera (ver ACTION_BUFFER_MS).
  private attackBufferMs = 0;
  private useBufferMs = 0;
  // A LAMINA RODOPIANTE. `attackHeld` existe porque o navegador repete o `keydown` de uma tecla
  // segurada — sem ele, segurar o A seria uma metralhadora em vez de uma carga.
  private attackHeld = false;
  private chargeMs = 0;
  private chargeReady = false;
  private chargeMoteMs = 0;
  // Ate quando virar-se para um monstro sai de graca (ver turnedTowardCreature)...
  private creatureTurnGraceUntilMs = 0;
  // ...e EM QUEM ela foi gasta. A carencia e o perdao de UM esbarrao contra UM corpo, e sem este
  // par ela era um relogio solto: virar-se para a caveira ao norte comprava 180ms de esbarrao de
  // graca no slime a leste. Contra matilha — que e metade da aventura — isso e um golpe gratis.
  private creatureTurnGraceOn?: EnemyBase;
  // Returns the hero to screen centre after a hurt-knockback shove.
  private playerKnockTween?: Phaser.Tweens.Tween;
  /** A investida do golpe (ver SWING_LUNGE_TILES) — dona exclusiva de hero.lungeX/lungeY. */
  private swingLungeTween?: Phaser.Tweens.Tween;
  // Counts up while resting in a campfire's safe ring; mends a heart each HEALTH_REGEN_MS.
  private healthRegenTimer = 0;
  // Cadence for the ember motes streaming fire→hero while the campfire mends him.
  private healMoteTimer = 0;
  // Low-health fire compass: an arrow orbiting the hero, pointing toward the nearest lit fire.
  private fireCompassArrow?: Phaser.GameObjects.Polygon;
  // Screen-edge vignette driven by the undead danger meter (see DANGER_VIGNETTE_* knobs).
  // It lives in the 3D post chain (World3D.setDangerVignette) — this only paces its breath.
  private dangerPulsePhase = 0;
  private tileSize = MIN_BOARD_TILE_SIZE;
  private isDead = false;
  private dialogOpen = false;
  private dialogOverlay?: DialogOverlay;
  // Dialog variants the player already heard this run (kind:base / kind:locked / wizard:beat).
  // An NPC whose *current* variant isn't here yet shows a "!" marker above its head.
  private readonly seenDialogKeys = new Set<string>();
  // While a dialog is open the camera pans so the hero + NPC sit centered in the left half
  // of the screen (the dialog panel covers the right half). camShifting keeps the world
  // frozen-but-reprojected during the pan; dialogNpcWorld lets a resize re-apply the offset.
  private camShifting = false;
  private camShiftTween?: Phaser.Tweens.Tween;
  private dialogNpcWorld?: { worldX: number; worldY: number };
  private itemGetOpen = false;
  // First-campfire cut-scene: plays once, when the player relights their first dead fire.
  private firstCampfireLit = false;
  // True quando esta cena e a AVENTURA (overworld ou uma dungeon dela) — o unico modo com
  // memoria persistente (adventureState). Explorador e levels nunca ligam isto.
  private adventure = false;
  // Qual arquivo de mundo esta aberto ('world' ou 'dungeon-N') — a chave da foto de itens no
  // chao dentro do save.
  private adventureScope = 'world';
  // Wizard story progression: how many dead fires the hero has relit, and whether the wizard's
  // intro beat has already played (so a second visit shows the "protect the flame" lines).
  private litFireCount = 0;
  private wizardIntroSeen = false;
  private cutsceneActive = false;
  // While set, updateLighting erases a growing light hole at this campfire (0..1) — the
  // slow-motion glow blooming open before the fire fully ignites.
  private cutsceneFireLight?: { worldX: number; worldY: number; progress: number };
  // Scales the hero's ambient glow (1 = normal). During the first-campfire cut-scene it fades to
  // 0 so all the light comes from the blooming fire, then eases back to 1 as we return to the hero.
  private cutsceneHeroLight = 1;
  private itemGetOverlay?: ItemGetOverlay;
  // Pause: the DOM menu (only while open) + the always-there touch button on mobile. While
  // the menu is up the scene is hard-paused (scene.pause() — update, tweens, timers, anims
  // all freeze on the current frame); the DOM keeps working because it lives off-canvas.
  private pauseMenu?: PauseMenu;
  private pauseTouchButton?: PauseTouchButton;
  // Os dois botoes de acao no toque, e a tarja que diz as teclas uma vez (ver ActionButtons).
  private actionButtons?: ActionButtons;
  private controlsHint?: ControlsHint;
  // A BOLSA: a mochila aberta COM O JOGO RODANDO (ver QuickBag). Ela nao pausa nada — quem paga
  // o preco de folhear e o heroi, de pes presos e sem os dois botoes enquanto ela estiver aberta.
  private quickBag?: QuickBag;
  // Level runs only: the always-visible restart + pause squares top-right (see LevelButtons).
  private levelButtons?: LevelButtons;
  // Center chunk of the streamed window; NaN forces the first stream.
  private streamCenter = { cx: NaN, cy: NaN };
  private debugApi?: GameDebugApi;
  private clearDebugHooks?: () => void;


  // Low-health "heartbeat": a pulsing red PIXEL OUTLINE around the hero (never painting the
  // sprite itself), ramping up as the last hearts drain. Built the classic pixel-art way —
  // red-filled copies of the hero billboard offset in 8 directions, drawn just behind it, so
  // only the border shows through.
  private readonly lowHealthOutlines: Billboard3D[] = [];
  private heartbeatPhase = 0;

  // Footprints (world-anchored so they scroll with the ground)
  private footprintStep = false;
  private readonly footprints: Array<{ obj: Phaser.GameObjects.Ellipse; worldX: number; worldY: number; offX: number; offY: number }> = [];

  // Breathing idle
  private breathingTween?: Phaser.Tweens.Tween;
  private lastStepTime = 0;


  // The real HD-2D: the whole world renders in true 3D (render3d/World3D.ts) on a
  // canvas UNDER this transparent Phaser one. Phaser keeps logic, input, canvas UI
  // and screen-space FX; the hero's hidden Phaser sprite (all the movement/juice
  // code still drives it) is mirrored onto a 3D billboard every frame.
  private world3d?: World3D;
  private heroBillboard?: Billboard3D;

  public constructor() {
    super(GameScene.key);
  }

  public create(): void {
    // O MUNDO INFINITO tem que ser ligado antes de qualquer outra coisa: `getPlayerStart()` na
    // linha seguinte ja pergunta a ele onde fica o acampamento, e o World3D (mais abaixo) assa
    // o terreno dentro do proprio construtor lendo a janela que o diretor acabou de definir.
    // Ligar depois seria assar o mundo autorado e so entao trocar o chao debaixo dele.
    this.explorer = undefined;
    this.chunkUndead = undefined;
    this.declinedPortals.clear();
    if (isExplorerMode()) {
      const run = explorerRun();
      if (run) {
        this.explorer = new ExplorerDirector(run.seed);
        this.explorer.install();
        this.chunkUndead = new ChunkUndeadDirector();
      }
    }

    // A AVENTURA TEM MEMORIA. O modo aventura (o overworld e as dungeons dele) hidrata do
    // retrato em adventureState — que sobrevive ao scene.restart() por ser estado de modulo e
    // ao browser por viver no localStorage. Explorador e levels ficam de fora: la, zerar E o
    // desenho (a aposta do explorador e perder; o level e um puzzle que recomeca limpo).
    this.adventure = !isExplorerMode()
      && this.registry.get('appMode') === 'game'
      && (getActiveLevel() === null || getDungeonTrip() !== null);
    const inDungeon = getDungeonTrip() !== null;
    // Arvores derrubadas voltam ao chao ANTES do World3D assar o terreno (o construtor le os
    // chunks): o corte e um diff por cima do world.json, que volta limpo do disco a cada boot
    // e a cada saida de dungeon.
    if (this.adventure && !inDungeon) {
      this.applyFelledTreeDiff();
      this.applyDugSpotDiff();
    }

    let start = getPlayerStart();
    // "Acorde na fogueira" e um PEDIDO (morte, Continue do titulo), nunca o padrao: a volta de
    // dungeon tambem reinicia a cena, e ela nasce na boca da caverna, nao teleportada pro fogo.
    if (this.adventure && consumeAdventureRespawn() && !inDungeon && adventureState().respawn) {
      start = { ...adventureState().respawn! };
    }
    const { worldX: startWorldX, worldY: startWorldY } = start;

    this.isDead = false;
    this.playerMaxHealth = PLAYER_HEALTH_MAX;
    this.playerHealth = PLAYER_HEALTH_MAX;
    this.playerInvincible = false;
    this.hitstopMs = 0;
    this.attackCooldownMs = 0;
    this.useCooldownMs = 0;
    this.resetChargeAndBuffers();
    this.tweens.timeScale = 1;
    this.playerKnockTween = undefined;
    this.playerWorld = { worldX: startWorldX, worldY: startWorldY };
    this.streamCenter = { cx: NaN, cy: NaN };
    this.levelIntroOpen = false;
    this.levelTransitioning = false;
    // O heroi e um campo `readonly` e o Phaser REUSA esta instancia de cena no restart: sem
    // isto, o que a cena anterior escreveu nele (o alpha da morte, o encolhimento da succao do
    // portal) chega inteiro no level seguinte e o heroi nasce invisivel.
    resetHeroView(this.hero);

    // Phaser's canvas is transparent: the 3D world shows through from below.
    // Build the renderer before ANY world object — they attach their billboards to it.
    this.world3d = new World3D();
    setCurrentWorld3D(this.world3d);
    // Generate the bucket's + charcoal's pixel art into both texture pipelines before any
    // prop/item is built (their billboards resolve their textures on construction below).
    registerBucketTextures(this);
    registerCharcoalTexture(this);
    registerPlacementTextures(this);
    registerLevelPortalTextures(this);
    registerFultonTextures();
    // The 3D canvas is position:fixed (z-index 0), which paints ABOVE static content.
    // Promote the Phaser canvas into its own stacking level so the whole 2D side —
    // lighting overlays, FX, canvas UI — draws over the 3D world, not under it.
    this.game.canvas.style.position = 'relative';
    this.game.canvas.style.zIndex = '1';
    window.hd3d = this.world3d.params;
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.render3D, this);

    // Decode the SFX + music loops. A AVENTURA de overworld tem trilha: "Ashen Fields", que
    // ficou anos no repositorio "para revival facil" — revivida. O vento continua por baixo
    // (ele e ambience, nao musica) e o combate segue soprepondo a danger track. Dungeon, level
    // e explorador ficam so no vento: o escuro deles e desenho, nao falta de musica.
    getSoundManager().preload();
    if (this.adventure && !inDungeon) getSoundManager().startMusic('overworld', 2400);
    else getSoundManager().stopMusic(1800);
    getSoundManager().startAmbience();
    this.dangerCalmMs = 0;

    // Phaser does not auto-call shutdown(); wire it so scene.restart() (death) cleans up
    // listeners/textures instead of leaking them across runs.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    this.chunkManager = new ChunkManager();
    const getContent = (cx: number, cy: number): ScreenContent => getChunkContent(cx, cy);
    // Duas portas por onde entra caveira, e elas nao se confundem. A primeira e o CERCO: o
    // spawn director invoca em volta do heroi enquanto ele demora no escuro, longe de fogueira.
    // O lab (/lab) e os levels (/levels, meta.puzzle) rodam SEM o cerco — caveira nascendo no
    // meio de uma solucao e ruido puro quando o assunto e um puzzle; pressao de escuridao se
    // testa no mundo de verdade.
    this.enemyManager = new EnemyManager(this, {
      isOpenWater: (wx, wy) => this.isOpenWaterAt(wx, wy),
      // A vizinhanca e varrida em QUADRADO em vez de filtrar a lista de props, porque metade da
      // agua deste jogo nao e prop nenhum (ver isOpenWaterAt). Sao (2r+1)^2 consultas de tile — 81
      // no raio de 4 — e so acontece quando um zora mergulha, a cada ~2,4s.
      openWaterNear: (cx, cy, radius) => {
        const found: Array<{ worldX: number; worldY: number }> = [];
        for (let y = cy - radius; y <= cy + radius; y += 1) {
          for (let x = cx - radius; x <= cx + radius; x += 1) {
            if (this.isOpenWaterAt(x, y)) found.push({ worldX: x, worldY: y });
          }
        }
        return found;
      },
    });
    // O RASTRO DA TOCHA VIVA (ver EnemyBase.updateBurning): cada passo de um corpo em chamas
    // tenta acender o próprio tile e os 4 vizinhos — o MESMO buraco de fechadura do
    // espalhamento, então mato, ponte, fogueira morta e OUTRO CORPO respondem igual, sem uma
    // segunda tabela de combustível. Reinstalado a cada create: o closure fecha sobre a cena
    // viva, e um restart (morte) não pode deixar um rastro apontando pra cena morta.
    EnemyBase.setEmberTouch((wx, wy) => {
      this.igniteFlammableAt(wx, wy);
      for (const [dx, dy] of CARDINAL_DIRS) this.igniteFlammableAt(wx + dx, wy + dy);
    });
    // O SINO DA MORTE (ver EnemyBase.setDeathToll): TODO corpo que morre paga, não importa o que o
    // matou — a espada, a bomba, a tocha viva ou a brasa da fogueira. Reinstalado a cada create
    // pelo mesmo motivo do rastro acima: o closure fecha sobre a cena viva.
    EnemyBase.setDeathToll((enemy) => this.rewardKill(enemy.worldX, enemy.worldY, enemy.kind));
    // O CONGELAMENTO (ver FreezeManager): a bola do zora não fere — trava. Este é o consumidor
    // dos pousos dela: bola rebatida que tocou um corpo congela o corpo; bola que morreu num
    // tile congela o que estiver ali (árvore, NPC, caixote…). Só o cuspe gela — a bola do mago
    // e a bala da torreta continuam morrendo como sempre.
    this.freezeManager = new FreezeManager(this, (wx, wy) => this.isTileFramed(wx, wy));
    this.heroFreezeImmuneMs = 0;
    this.enemyManager.setShotLandedHandler((ev) => {
      if (ev.kind !== 'spit') return;
      if (ev.enemy) this.freezeEnemy(ev.enemy);
      else this.freezeAtTile(Math.round(ev.x), Math.round(ev.y));
    });
    const siegeOff = this.registry.get('appMode') === 'lab' || isPuzzleWorld() || Boolean(this.explorer);
    this.spawnDirector = siegeOff ? undefined : new UndeadSpawnDirector();
    // A segunda porta sao as COVAS AUTORADAS, e elas valem em TODO mundo — inclusive no lab e
    // nos levels, exatamente onde o cerco esta desligado. A razao e a diferenca entre as duas:
    // o cerco e ambiente (ninguem pediu por ele, e nao se sabe onde vai bater), a cova e uma
    // decisao de autor num tile escolhido a mao. Desligar aqui seria tirar do editor a unica
    // maneira de por um guarda num corredor.
    this.enemySpawners = new EnemySpawnerManager(getEnemySpawns());
    this.playerSafe = true;
    this.healthRegenTimer = 0;
    this.firstCampfireLit = false;
    this.litFireCount = 0;
    this.wizardIntroSeen = false;
    this.cutsceneActive = false;
    this.cutsceneFireLight = undefined;
    this.cutsceneHeroLight = 1;
    this.seenDialogKeys.clear();
    if (this.adventure) {
      // A historia do mago e os dialogos ouvidos voltam do save — antes disto, entrar numa
      // dungeon (scene.restart) apagava a memoria do mundo inteiro.
      const st = adventureState();
      this.litFireCount = st.litFireCount;
      this.firstCampfireLit = st.litFireCount > 0;
      this.wizardIntroSeen = st.wizardIntroSeen;
      st.seenDialogKeys.forEach((k) => this.seenDialogKeys.add(k));
    }
    this.npcManager = new NpcManager(this, getContent, (kind, wx, wy, dialog) => {
      const key = this.dialogKeyFor(kind, wx, wy, dialog);
      return key !== null && !this.seenDialogKeys.has(key);
    }, (wx, wy) => {
      // O keycap "Z" só existe quando falar é o que o botão FARIA agora: herói vivo, mundo
      // correndo, e o NPC exatamente no tile encarado.
      if (!this.canAct() || !this.movementController) return false;
      const front = this.facingTile();
      return front.x === wx && front.y === wy;
    });
    this.coinManager = new CoinManager(this);
    if (this.adventure) this.coinManager.restoreTotal(adventureState().coins);
    // A bolsa do construtor de mundo começa cheia (START_COINS) e sobrevive ao restart da
    // cena: o HUD tem de nascer mostrando o que o run já carrega, nunca um zero de mentira.
    else if (this.explorer) this.coinManager.restoreTotal(explorerRun()?.coins ?? 0);
    this.heartPickupManager = new HeartPickupManager(this, getContent);
    this.itemManager = new ItemManager(this);
    // O chao tambem lembra: a foto salva dos itens DESTE mundo (overworld ou dungeon-N)
    // substitui a lista autorada — um item largado fica onde ficou, um tesouro tomado nao
    // renasce. Sem foto (mundo nunca visitado, ou fora da aventura), vale o autorado.
    this.adventureScope = inDungeon ? `dungeon-${getDungeonTrip()!.level}` : 'world';
    const savedGround = this.adventure ? adventureState().groundItems.get(this.adventureScope) : undefined;
    this.itemManager.loadAuthored(
      savedGround
        ? savedGround.map((g) => ({ type: g.kind, worldX: g.worldX, worldY: g.worldY, units: g.count }))
        : getHeldItemPickups(),
    );
    this.inventory.clear(); // fora da aventura a mochila e da RUN e comeca de maos vazias
    this.seenItems.clear();
    if (this.adventure) {
      const st = adventureState();
      for (const it of st.inventory) this.inventory.add(it.kind, it.count);
      this.inventory.select(st.selected);
      st.seenItems.forEach((k) => this.seenItems.add(k as HeldItemKind));
      this.updateBackItem(); // o item selecionado volta as costas do heroi ja no primeiro frame
    }
    this.heldOnFire = false;
    this.heldBatteryChargeMs = 0;
    // One reusable swing animator, alive for the whole scene: the sword uses it to attack,
    // the key uses it to strike a door (SwordSlash.slash accepts a custom item sprite).
    this.swordSlash = new SwordSlash(this);
    this.camera = new WorldCamera(startWorldX, startWorldY, 0, 0);
    this.camera.world3d = this.world3d;
    this.world3d.follow(startWorldX, startWorldY, true);

    // The hero's contact blob rides the billboard like every other actor's (the manual
    // GroundEllipse this replaces was the last special case); zBias is the +0.1 forward
    // nudge the old ellipse always had, peeking the shadow past his boots.
    this.heroBillboard = this.world3d.addBillboard('hero', HERO_FRAMES.idleDown, {
      castGroundShadow: true,
      groundShadow: { rx: 0.34, rz: 0.32, alpha: 0.34, zBias: 0.1 },
    })
      .setPosition(startWorldX, startWorldY)
      .setDisplaySize(1, 1);

    // The 2D back-item image only appears in the screen-space death elegy (the in-world
    // carried item is a billboard — see updateBackItem); it idles hidden until then.
    this.backItem = this.add
      .image(0, 0, ASSET_KEYS.swordItemIcon)
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(SCENE_DEPTHS.player - 1);

    this.movementController = new PlayerMovementController(
      this,
      this.hero,
      this.camera,
      (wx, wy) => {
        // The hero also stops on enemies (to attack them); everything else that blocks is
        // shared with enemies via isSolidForEntities — except the hazards (lava AND water),
        // which the hero wades while holding the lava boots.
        if (this.enemyManager?.getEnemyAt(wx, wy)) return true;
        // Unbought chunks remain behind the fog seam. Enemies deliberately do NOT consult this
        // gate, which is how the dead can walk in from an unfinished road while the hero cannot
        // walk out before buying a card.
        if (this.explorer?.blocksPlayerAt(wx, wy)) return true;
        return this.isSolidForEntities(wx, wy, this.heldItem === 'lavaBoots');
      },
      // Fires once per tile ENTERED (never per frame): decor rustle + walk-on interactions.
      (wx, wy) => {
        this.world3d?.rustleDecor(wx, wy);
        this.handleTileEntered(wx, wy);
      },
      (wx, wy) => this.handlePlayerBump(wx, wy),
    );


    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.handleResize({ width: this.scale.width, height: this.scale.height });

    // (A LOJA da fogueira foi removida, e as melhorias dela junto: a vida e a cadência são as
    // base do jogo agora — quem quiser progressão de corpo cria uma peça nova, não um menu.)
    this.playerMaxHealth = PLAYER_HEALTH_MAX;
    this.playerHealth = this.playerMaxHealth; // toda expedicao comeca inteira

    // All world props are authored in world.json; their collision is resolved at runtime.
    // Only ONE fire starts lit — the "home" fire, derived as the campfire nearest the player
    // start (so the premise holds even if an editor save drops an explicit `lit` flag). Every
    // other campfire is dead until the hero carries a flame to it. An explicit `lit: true` in
    // world.json can still force extra lit fires.
    const campfireDefs = getCampfires();
    let homeIdx = -1;
    let homeBest = Infinity;
    campfireDefs.forEach((c, i) => {
      const d = Math.hypot(c.worldX - startWorldX, c.worldY - startWorldY);
      if (d < homeBest) { homeBest = d; homeIdx = i; }
    });
    // Fogueiras que o jogador acendeu ficam acesas — atraves de morte, dungeon e browser. E o
    // progresso central do jogo (litFireCount vem junto, hidratado acima).
    // A tela em que se nasce ja conta como pisada — o mapa nunca abre 100% escuro.
    if (this.adventure && !inDungeon) {
      adventureState().visitedChunks.add(
        `${Math.floor(startWorldX / CHUNK_COLUMNS)},${Math.floor(startWorldY / CHUNK_ROWS)}`,
      );
    }
    const savedLit = this.adventure && !inDungeon ? adventureState().litFires : undefined;
    this.campfires = campfireDefs.map(
      (c, i) => new CampfireObject(
        this, c.worldX, c.worldY,
        i === homeIdx || c.lit === true || (savedLit?.has(`${c.worldX},${c.worldY}`) ?? false),
      ),
    );
    this.dryBushes = getDryBushes().map((b) => {
      const bush = new DryBushObject(this, b.worldX, b.worldY);
      // O fogo PRODUZINDO: um arbusto que terminou de arder as vezes deixa carvao (comida da
      // tocha). So arbustos — nunca o mato alto, que e o loop de pavio/plantio (ver constante).
      bush.onBurnedOut = () => this.dropCharcoalFromBush(bush.worldX, bush.worldY);
      return bush;
    });
    this.lockedDoors = getLockedDoors().map((d) => new LockedDoorObject(this, d.worldX, d.worldY, d.floodgate === true));
    this.swingGates = getSwingGates().map((g) => new SwingGateObject(this, g.worldX, g.worldY));
    this.dryTrees = getDryTrees().map((t) => new DryTreeObject(this, t.worldX, t.worldY));
    this.dryShrubs = getDryShrubs().map((s) => new DryShrubObject(this, s.worldX, s.worldY));
    // As duas pedras vivem no MESMO array de proposito: colisao, picareta, bomba e o registro
    // de props ja atravessam `rocks`, e a unica coisa que a de minerio muda e a arte e o que
    // ela deixa cair. Uma segunda lista significaria repetir todos esses caminhos pra ganhar
    // um `if` — e esquecer um deles um dia (a bomba foi exatamente o que quase escapou).
    this.rocks = [
      ...getRocks().map((r) => new RockObject(this, r.worldX, r.worldY)),
      ...getIronRocks().map((r) => new RockObject(this, r.worldX, r.worldY, true)),
    ];
    this.tallGrasses = getTallGrass().map((g) => new TallGrassObject(this, g.worldX, g.worldY));
    this.moonflowers = getMoonflowers().map((m) => new MoonflowerObject(this, m.worldX, m.worldY));
    this.bombSpots = getBombSpots().map((s) => new BombSpotObject(this, s.worldX, s.worldY));
    this.plantSpots = getPlantSpots().map((s) => new PlantSpotObject(this, s.worldX, s.worldY));
    // Os buracos que a PÁ cavou voltam do save (diff sobre os autorados, o padrão felledTrees) —
    // só na aventura de OVERWORLD: dungeon não tem terra, e level/explorador zeram por desenho.
    if (this.adventure && !getDungeonTrip()) {
      for (const key of adventureState().dugSpots) {
        const [wx, wy] = key.split(',').map(Number);
        if (!Number.isFinite(wx) || !Number.isFinite(wy)) continue;
        if (this.plantSpots.some((s) => s.worldX === wx && s.worldY === wy)) continue;
        // Um mundo re-autorado pode ter posto parede onde havia terra: um buraco não nasce
        // dentro de rocha — o save cede ao mundo, nunca o contrário (o mesmo espírito do
        // applyDugSpotDiff, que não derruba um sólido novo).
        if (this.chunkManager?.isCellBlocked(wx, wy)) continue;
        this.plantSpots.push(new PlantSpotObject(this, wx, wy));
      }
    }
    // `dir ?? 1`: um braco sem direcao gravada aponta pro leste. Ele nunca fica sem direcao de
    // verdade (o editor sempre grava uma), mas o default evita que um JSON antigo vire um prop
    // quebrado — e leste e o que o editor oferece primeiro.
    this.carnivorousPlants = getCarnivorousPlants().map(
      (p) => new CarnivorousPlantObject(this, p.worldX, p.worldY),
    );
    this.inserters = getInserters().map(
      (a) => new RoboticArmObject(a.worldX, a.worldY, a.dir ?? 1, a.variable),
    );
    // Mesma regra de default do braco (`dir ?? 1`): um JSON antigo nunca vira um prop quebrado,
    // e leste e a direcao que o editor oferece primeiro.
    this.toolboxes = getToolboxes().map(
      (t) => new ToolboxObject(this, t.worldX, t.worldY, t.dir ?? 1),
    );
    this.globalVariables = new GlobalVariables(getGlobalVariables());
    this.woodenCrates = getWoodenCrates().map((crate) => new WoodenCrateObject(this, crate.worldX, crate.worldY));
    this.pressurePlates = getPressurePlates().map(
      (plate) => new PressurePlateObject(this, plate.worldX, plate.worldY, plate.variable),
    );
    this.waterWheels = getWaterWheels().map(
      (wheel) => new WaterWheelObject(this, wheel.worldX, wheel.worldY, wheel.variable),
    );
    this.boilers = getBoilers().map(
      (b) => new BoilerObject(this, b.worldX, b.worldY, b.variable),
    );
    this.electronicGates = getElectronicGates().map(
      (gate) => new ElectronicGateObject(this, gate.worldX, gate.worldY, gate.variable),
    );
    this.levelPortals = getLevelPortals().map(
      (portal) => new LevelPortalObject(portal.worldX, portal.worldY, portal.level),
    );
    this.sellBoxes = getSellBoxes().map((box) => this.makeSellBox(box));

    // AS TOCHAS DE PAREDE. Elas nao estao na lista de props: sao o frame `wallTorch` pintado na
    // alvenaria pelo gerador de dungeons, entao a unica forma de encontra-las e varrer o terreno.
    // A varredura roda uma vez, no boot, e so onde ha chance de haver alguma — um mundo sem
    // nenhum tile de tocha sai da conta no primeiro chunk.
    this.wallTorches = [];
    const bounds = getWorldBounds();
    for (let cy = bounds.minCy; cy <= bounds.maxCy; cy++) {
      for (let cx = bounds.minCx; cx <= bounds.maxCx; cx++) {
        const chunk = getChunkTerrain(cx, cy);
        for (let row = 0; row < CHUNK_ROWS; row++) {
          for (let col = 0; col < CHUNK_COLUMNS; col++) {
            if (chunk.upper[row][col] !== DUNGEON_TILES.wallTorch) continue;
            const wx = cx * CHUNK_COLUMNS + col; const wy = cy * CHUNK_ROWS + row;
            // Fase desencontrada por coordenada (nunca aleatoria): vinte chamas em unissono leem
            // como um efeito ligando, e um valor derivado do tile mantem o mundo identico a cada
            // boot — o que a `visual-ref` exige para um diff de pixel significar alguma coisa.
            this.wallTorches.push(
              new WallTorchObject(this, wx, wy).offsetPhase(((wx * 7 + wy * 13) % 9) * 37),
            );
          }
        }
      }
    }
    this.wires = getWires().map((w) => new WireObject(this, w.worldX, w.worldY));
    // A FABRICA autorada. As mesmas classes que a construcao do jogador usa — o que muda e so o
    // `playerBuilt`, que decide se o B de mao vazia pode recolher a peca de volta. Uma esteira
    // autorada num level e parte do puzzle; a que o jogador deitou e propriedade dele.
    this.belts = getBelts().map((b) => new BeltObject(this, b.worldX, b.worldY, b.dir ?? 1));
    this.chests = getChests().map(
      (c) => new ChestObject(this, c.worldX, c.worldY, false, c.quota, c.variable),
    );
    this.extractors = getExtractors().map(
      (e) => new ExtractorObject(this, e.worldX, e.worldY, e.dir ?? 1),
    );
    this.furnaces = getFurnaces().map(
      (f) => new FurnaceObject(this, f.worldX, f.worldY, f.dir ?? 1),
    );
    this.altars = getAltars().map((a) => new AltarObject(this, a.worldX, a.worldY));
    this.tripHammers = getTripHammers().map(
      (h) => new TripHammerObject(this, h.worldX, h.worldY, h.dir ?? 1),
    );
    // O que o jogador construiu e o que ele guardou nos baus voltam do save AQUI — depois dos
    // autorados, para que uma peca autorada num tile sempre ganhe do diff (o save cede ao mundo,
    // a mesma regra dos buracos da pa logo acima).
    this.restoreBuiltMachines();
    this.wireIndex = new Map(this.wires.map((w) => [`${w.worldX},${w.worldY}`, w]));
    this.liveWires = new Set();
    this.powerSatisfaction = new Map();
    this.resolveWireShapes();
    this.lavaTiles = getLavaTiles().map((l) => new LavaObject(this, l.worldX, l.worldY));
    // Both `water` and `bridgeSpot` are river tiles (WaterObjects render animated water). A
    // plain `water` tile is an impassable river; a `bridgeSpot` is a river tile you CAN bridge
    // (buildable = true), marked so the level designer chooses exactly where crossings are
    // allowed. They're separate props (one per tile) so the editor's "one prop per cell" holds.
    this.waterTiles = [
      ...getWaterTiles().map((w) => new WaterObject(this, w.worldX, w.worldY, false)),
      // A roda substitui o prop `water` no editor, mas continua sendo um tile de rio no
      // runtime. Renderizar a agua no mesmo ponto deixa as pas realmente dentro do canal e,
      // principalmente, permite drenar exatamente a agua que move o rotor.
      ...getWaterWheels().map((w) => new WaterObject(this, w.worldX, w.worldY, false)),
      ...getBridgeSpots().map((b) => {
        const w = new WaterObject(this, b.worldX, b.worldY, true);
        // A scene-level burst of pale light the moment the last board is nailed home.
        w.onBuilt = () => this.cameras.main.flash(160, 210, 190, 150);
        return w;
      }),
    ];
    this.propRegistry = [
      { list: this.campfires },
      { list: this.dryBushes },
      { list: this.lockedDoors },
      { list: this.swingGates },
      { list: this.dryTrees },
      { list: this.dryShrubs },
      { list: this.rocks },
      { list: this.tallGrasses },
      { list: this.moonflowers },
      { list: this.bombSpots },
      { list: this.plantSpots },
      { list: this.carnivorousPlants },
      { list: this.inserters },
      { list: this.toolboxes },
      { list: this.furnaces },
      { list: this.tripHammers },
      { list: this.altars },
      { list: this.woodenCrates },
      { list: this.pressurePlates },
      { list: this.waterWheels },
      { list: this.boilers },
      { list: this.electronicGates },
      { list: this.levelPortals },
      { list: this.sellBoxes },
      { list: this.wires },
      { list: this.belts },
      { list: this.chests },
      { list: this.extractors },
      // Lava e água são os dois hazards que as botas de lava deixam o herói vadear — inimigos
      // sempre consultam com hazardsPassable=false, então um rio segue sendo parede para eles.
      { list: this.lavaTiles, hazard: true },
      { list: this.waterTiles, hazard: true },
    ];

    // Circuitos so podem ser calculados depois que a agua existe: a roda le os quatro tiles
    // vizinhos, e um gerador sem corrente deve nascer apagado, nunca true por um frame.
    this.updateMechanismCircuits(0);

    this.initLighting();
    this.streamChunks(true);

    // A mortalha dos chunks não-comprados precisa existir ANTES do prewarm logo abaixo: é ele
    // que compila os dois programas dela junto com todo o resto — deixá-la para depois seria
    // um shader compilando no meio da primeira caminhada.
    if (this.explorer && this.world3d) this.explorer.syncShroud(this.world3d);

    // The world is fully built, so compile every shader now rather than lazily, one hitch at
    // a time, on the frames each material is first drawn.
    this.world3d.prewarmShaders();
    initProfiler(this.world3d);
    this.events.on(Phaser.Scenes.Events.PRE_UPDATE, profiler.frameStart, profiler);

    this.registerDebugApi();

    // Live playtest launched from the world editor: ESC stops the run and wakes the
    // sleeping EditorScene, with the in-memory (possibly unsaved) world still loaded.
    // In the real game ESC pauses instead (plus a discreet touch button on mobile).
    // The lab only gets the return handler when it actually came FROM the editor —
    // `/lab?play` boots the GameScene directly, with no editor scene to wake.
    const appMode = this.registry.get('appMode') as AppMode | undefined;
    const launchedFromEditor = appMode === 'editor'
      || (appMode === 'lab' && (this.scene.isActive('editor') || this.scene.isSleeping('editor')));
    if (launchedFromEditor) {
      this.enableEditorReturn();
    } else {
      // O ESC TEM UM DONO SÓ. Com a bolsa aberta ele a fecha e para por aí — abrir a pausa por
      // cima dela seria a segunda coisa que uma tecla faz num aperto só, e é exatamente o bug que
      // manter I / setas / X / ESC roteados daqui existe para impedir.
      this.input.keyboard?.on('keydown-ESC', () => {
        if (this.quickBag?.isOpen) { this.quickBag.close(); return; }
        this.openPauseMenu();
      });
      // A level run shows restart + pause squares top-right on EVERY device: a puzzle can be
      // spent into a corner (fuse burnt early, bomb wasted), and starting over is part of play —
      // that has to be said on screen, not buried inside ESC. The adventure keeps the discreet
      // touch-only pause button.
      if (getActiveLevel() !== null) {
        this.levelButtons = new LevelButtons({
          onRestart: () => this.restartRun(),
          onPause: () => this.openPauseMenu(),
        });
      } else if (isTouchDevice()) {
        this.pauseTouchButton = new PauseTouchButton(() => this.openPauseMenu());
      }
    }

    this.placementHints = new PlacementHints(this);
    this.pickupPrompt = new PickupPrompt(this);
    this.heroThought = new HeroThought(this, ASSET_KEYS.thoughtTorch);
    this.installActionInput();

    // O HUD do explorador (a bolsa e a distancia) e o recibo da expedicao anterior. Depois do
    // resto da UI de proposito: se a expedicao terminou, o cartao que conta o que sobrou e a
    // primeira coisa que o jogador deve ler ao acordar no acampamento.
    if (this.explorer) {
      this.explorerHud = new ExplorerHud();
      this.chunkGatePrompt = new ChunkGatePrompt();
      this.syncChunkGates(this.explorer.frontiers(), (explorerRun()?.coins ?? 0) >= this.explorer.minCost());
      const arrival = consumeExplorerArrival();
      if (arrival) this.explorerHud.showArrival(arrival);
      this.buildPinnedCard();
    }

    const activeLevel = getActiveLevel();
    // Chegou pelo portal? Entao o level nao comeca: ele ATERRISSA. O cartao de titulo espera o
    // heroi tocar o chao (ver playPortalArrival), porque anunciar o nome de um lugar onde o
    // heroi ainda nao pisou e anunciar cedo demais.
    if (consumePendingPortalArrival()) {
      void this.playPortalArrival(activeLevel);
    } else {
      // Nenhuma chegada pendente e um tunel aberto significa que a viagem foi abandonada no meio
      // (morte, voltar ao menu, um restart por outro motivo): o overlay nao pode ficar de pe.
      if (portalTunnelActive()) destroyPortalTunnel();
      if (activeLevel !== null) this.showLevelIntro(activeLevel);
    }
  }

  /**
   * A CHEGADA — o heroi cai do ceu no mundo novo.
   *
   * A cena ja esta inteira montada quando isto roda: o mundo, as luzes e o heroi existem, so
   * que ele esta a `PORTAL_FALL_HEIGHT_TILES` do chao e o tunel ainda cobre a tela. A ordem e
   * o ponto — primeiro o mundo fica pronto por tras do overlay, DEPOIS o overlay sai. Nunca
   * ha um frame de mundo meio-construido a vista.
   *
   * A queda usa `Quad.easeIn` porque queda tem gravidade: acelera ate o chao. Um easeOut aqui
   * (o reflexo de sempre) faria o heroi FLUTUAR para baixo e pousar como uma pena.
   */
  private async playPortalArrival(activeLevel: number | null): Promise<void> {
    const h = this.hero;
    this.cutsceneActive = true;
    this.levelButtons?.setVisible(false);
    // Escala, alpha e giro ja voltaram ao normal no topo do create (resetHeroView) — a unica
    // coisa que a chegada acrescenta e a altura. A sombra de contato fica no chao enquanto ele
    // despenca (o billboard ignora elevacao na sombra, por design) e e ela que denuncia ONDE
    // ele vai cair.
    h.lift = PORTAL_FALL_HEIGHT_TILES;
    h.frame = HERO_FRAMES.idleDown;

    // O tunel so sai quando o mundo esta pronto — e nunca antes do cruzeiro minimo, senao um
    // level que carrega instantaneamente transformaria a viagem num piscar.
    const remaining = PORTAL_TUNNEL_MIN_CRUISE_MS - portalTunnelElapsedMs();
    if (remaining > 0) await this.wait(remaining);

    // A queda comeca DENTRO do clarao de saida, nao depois dele: esperar o overlay morrer
    // entregaria o mundo novo com o heroi pendurado, parado, no ar — e a chegada perderia o
    // unico frame que ela tem para vender. Assim a tela abre com ele ja despencando.
    const clearing = finishPortalTunnel();
    await this.wait(PORTAL_TUNNEL_EXIT_MS * 0.6);

    await new Promise<void>((resolve) => {
      this.tweens.addCounter({
        from: PORTAL_FALL_HEIGHT_TILES,
        to: 0,
        duration: PORTAL_FALL_MS,
        ease: 'Quad.easeIn',
        onUpdate: (tween) => { h.lift = tween.getValue() ?? 0; },
        onComplete: () => resolve(),
      });
    });

    // O impacto: esmaga e volta. O heroi cresce em cima dos proprios pes plantados
    // (syncHeroBillboard ancora no pe), entao o squash le como peso e nao como um pulo.
    h.lift = 0;
    await clearing; // o overlay ja deve ter morrido aqui; garante que ninguem fique para tras
    getSoundManager().playPortalLand();
    this.world3d?.shake(260, 0.05);
    this.spawnLandingDust();
    this.tweens.add({
      targets: h,
      scaleX: 1.28,
      scaleY: 0.7,
      duration: 70,
      ease: 'Quad.easeOut',
      yoyo: true,
      onComplete: () => { h.scaleX = 1; h.scaleY = 1; },
    });

    this.cutsceneActive = false;
    if (activeLevel !== null) this.showLevelIntro(activeLevel);
    else this.levelButtons?.setVisible(true);
  }

  /** O anel de poeira que a aterrissagem levanta — os mesmos puffs do fogo apagado. */
  private spawnLandingDust(): void {
    const w3 = this.world3d;
    if (!w3) return;
    const { worldX, worldY } = this.playerWorld;
    for (let i = 0; i < 7; i += 1) {
      const angle = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
      // Poeira, nao fagulha: emissive e NAO aditivo, igual a fumaca do fogo apagado — poeira
      // que brilha viraria explosao, e o heroi so chegou.
      const puff = w3
        .addBillboard(FX_PUFF_TEXTURE, 0, { ...FX_BILLBOARD, emissive: true, alphaTest: 0.02 })
        .setTint(0xc9bfae)
        .setPosition(worldX, worldY)
        .setElevation(0.12)
        .setDisplaySize(0.2, 0.2)
        .setAlpha(0.5);
      this.tweens.add({
        targets: { t: 0 },
        t: 1,
        duration: 380 + Math.random() * 160,
        ease: 'Quad.easeOut',
        onUpdate: (tween) => {
          const k = tween.getValue() ?? 0;
          const reach = 0.15 + k * 0.62;
          puff
            .setPosition(worldX + Math.cos(angle) * reach, worldY + Math.sin(angle) * reach * 0.6)
            .setElevation(0.12 + k * 0.2)
            .setDisplaySize(0.2 + k * 0.26, 0.2 + k * 0.26)
            .setAlpha(0.5 * (1 - k));
        },
        onComplete: () => puff.destroy(),
      });
    }
  }

  private showLevelIntro(levelNumber: number): void {
    this.levelIntroOpen = true;
    this.levelButtons?.setVisible(false);
    const overlay = new LevelIntroOverlay(this, levelNumber, getWorldName(), () => {
      if (this.levelIntroOverlay !== overlay) return;
      this.levelIntroOverlay = undefined;
      this.levelIntroOpen = false;
      this.levelButtons?.revealAfterLevelIntro();
    });
    this.levelIntroOverlay = overlay;
  }

  /** Restart the current run — shared by the pause menu entry and the level restart button. */
  private restartRun(): void {
    if (this.pauseMenu) return; // the floating buttons are hidden while the menu is up anyway
    getSoundManager().stopMusic();
    // No explorador, recomecar CUSTA o mesmo que morrer. Se fosse de graca, seria a saida
    // otima de toda expedicao ruim — e as duas porcentagens que sustentam o modo passariam a
    // ser opcionais. Sair do mundo sem passar por um portal e sair perdendo, sempre.
    if (this.explorer) {
      loseRunToDeath();
      rerollExplorerWorld();
    } else if (this.adventure) {
      // Na aventura "reiniciar" nao e recomecar do zero (isso e o Start over do titulo): e
      // voltar a fogueira com tudo — o mesmo contrato da morte, sem o funeral.
      this.persistAdventure();
      requestAdventureRespawn();
    }
    this.scene.restart(); // WorldData still holds this level, so it rebuilds the same one
  }

  /**
   * A SUCCAO — o portal comendo o heroi, e depois a luz do mundo inteiro.
   *
   * O heroi ja esta EM CIMA do tile do portal quando isto roda (`handleTileEntered` dispara na
   * chegada), entao nao ha para onde arrasta-lo: a succao e ele ser puxado para DENTRO, no
   * lugar. Sobe um pouco (o vortice o descola do chao), gira, encolhe ate nada e so ai apaga —
   * some por tamanho, nunca por alpha sozinho, que leria como fantasma e nao como sugado.
   *
   * O buraco negro come a LUZ junto: `params.ambient`, `moon` e `exposure` sao aplicados por
   * frame (World3D.syncParams), entao um tween neles apaga o mundo de verdade, sem nenhuma
   * maquinaria nova — e sem tocar na CONTAGEM de luzes, que e a unica coisa que este renderer
   * nao perdoa (FIRE_LIGHT_SLOTS: mudar o numero recompila todo shader do mundo).
   */
  private playPortalSuck(portal: LevelPortalObject): Promise<void> {
    const w3 = this.world3d;
    const h = this.hero;
    getSoundManager().playPortalSuck();
    portal.activate();
    this.world3d?.shake(PORTAL_SUCK_MS, 0.02);

    const lit = w3
      ? { ambient: w3.params.ambient, moon: w3.params.moon, exposure: w3.params.exposure }
      : null;
    this.litParams = lit ?? undefined;

    return new Promise<void>((resolve) => {
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: PORTAL_SUCK_MS,
        ease: 'Cubic.easeIn', // devagar no comeco: o portal AGARRA antes de puxar
        onUpdate: (tween) => {
          const k = tween.getValue() ?? 0;
          portal.setSwallow(k);
          h.lift = k * 0.85;
          h.spin = k * k * 540; // o giro so pega no fim, quando ele ja esta sem chao
          h.scaleX = 1 - k;
          h.scaleY = 1 - k;
          // Ele apaga junto com o proprio brilho: a luz que o heroi carrega e comida tambem.
          this.cutsceneHeroLight = 1 - k;
          if (lit && w3) {
            // A luz sai por DOIS caminhos, e os dois sao necessarios.
            //
            // `ambient`/`moon` matam as fontes — e a luz indo embora de verdade, com as
            // sombras e o contraste que vem junto. Mas sozinhos eles nao esvaziam a tela:
            // num level de lava quem ilumina e o emissive do chao, que nao depende de luz
            // nenhuma. Media medida num frame do level 1: 45.6 antes, 45.2 no fim da succao.
            //
            // `setWorldFade` fecha a conta no POST (dessatura e escurece o frame inteiro, o
            // mesmo dreno da morte). E o unico lugar onde isso funciona: `params.exposure`
            // e inerte aqui, porque o mundo e desenhado num render target do EffectComposer
            // e o three so aplica tone mapping ao desenhar direto no canvas — a mesma
            // armadilha de alvo-vinculado que o prewarmShaders documenta.
            w3.setWorldFade(k * 0.88);
            w3.params.ambient = lit.ambient * (1 - k * 0.96);
            w3.params.moon = lit.moon * (1 - k * 0.92);
          }
        },
        onComplete: () => {
          h.alpha = 0;
          h.scaleX = 0.001;
          h.scaleY = 0.001;
          getSoundManager().playPortalSwallow();
          this.world3d?.shake(240, 0.045);
          resolve();
        },
      });
    });
  }

  // ── o explorador: a pergunta do portal, e as duas maneiras de a expedicao acabar ──────────

  /**
   * O heroi pisou num portal la fora. Congela a expedicao e pergunta.
   *
   * Recusar nao gasta o portal — ele fica ali, e o jogador pode voltar quando a bolsa pesar
   * mais. O que a recusa gasta e a PERGUNTA: enquanto o heroi nao sair do tile, ninguem
   * pergunta de novo, senao continuar andando por cima do portal viraria um interrogatorio.
   */
  private askExtraction(portal: LevelPortalObject): void {
    if (this.extractPrompt || this.levelTransitioning || this.isDead) return;
    const key = `${portal.worldX},${portal.worldY}`;
    if (this.declinedPortals.has(key)) return;

    const coins = explorerRun()?.coins ?? 0;
    this.cutsceneActive = true; // congela o mundo enquanto a pergunta esta na tela
    this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
    getSoundManager().playShopOpen();
    this.extractPrompt = new ExtractPrompt({
      coins,
      kept: Math.floor(coins * EXTRACT_KEEP),
      onYes: () => {
        this.extractPrompt = undefined;
        void this.returnToCamp(portal);
      },
      onNo: () => {
        this.extractPrompt = undefined;
        this.declinedPortals.add(key);
        this.cutsceneActive = false;
      },
    });
  }

  /**
   * SIM: metade da bolsa vira banco e o heroi volta vivo.
   *
   * A viagem inteira e a do portal dos levels — succao, vazio, tunel, queda — e isso nao e
   * reaproveitamento por economia: e a mesma FRASE. O jogo ja ensinou que atravessar um portal
   * e assim, e uma expedicao que voltasse por um fade seria uma segunda gramatica para a mesma
   * coisa. A diferenca esta so no outro lado do tunel: em vez do proximo level, o acampamento.
   */
  private async returnToCamp(portal: LevelPortalObject): Promise<void> {
    if (this.levelTransitioning) return;
    this.levelTransitioning = true;
    this.cutsceneActive = true;
    this.explorerHud?.setVisible(false);

    await this.playPortalSuck(portal);
    await this.wait(PORTAL_EMPTY_MS);
    startPortalTunnel(this.world3d ? this.world3d.tileScreenSize() / TILESET_FRAME_SIZE : undefined);
    getSoundManager().playPortalTravel();
    await this.wait(PORTAL_TUNNEL_HANDOFF_MS);

    // A ordem importa: liquidar ANTES do restart. A cena nova le a chegada (o recibo) no
    // create, e ela so existe se a conta ja tiver sido fechada.
    extractToCamp();
    rerollExplorerWorld();
    setPendingPortalArrival(); // do outro lado ele CAI no acampamento, como em qualquer viagem
    this.scene.restart();
  }

  /** Purple threshold crossed: resolve the next entry from the same manifest as level select. */
  private async completeLevel(portal: LevelPortalObject): Promise<void> {
    const current = getActiveLevel();
    if (this.levelTransitioning || current === null) return;
    this.levelTransitioning = true;
    // Congela o jogo ANTES da primeira animacao: a succao dura quase um segundo e o heroi nao
    // pode aceitar mais um passo enquanto esta sendo engolido.
    this.cutsceneActive = true;
    this.levelButtons?.setVisible(false);

    // O manifesto e buscado em PARALELO com a succao, e nao depois dela: a rede nao pode ser o
    // que decide quanto tempo o portal leva para comer o heroi.
    const nextEntry = this.resolveNextLevel(current);

    await this.playPortalSuck(portal);
    // O BEIJO DE VIUVA: o portal sozinho, girando no escuro que ele mesmo abriu. Sem esta
    // pausa a viagem comeca em cima do proprio heroi sumindo e ninguem ve nenhuma das duas.
    await this.wait(PORTAL_EMPTY_MS);

    // O tunel nasce AQUI, com a cena velha ainda viva: ele precisa cobrir a tela antes do
    // restart, e o custo de criar o segundo contexto WebGL fica escondido atras do portal que
    // ainda esta na frente. `artPixel` faz o pixel do tunel ter a grossura do pixel do mundo.
    startPortalTunnel(this.world3d ? this.world3d.tileScreenSize() / TILESET_FRAME_SIZE : undefined);
    getSoundManager().playPortalTravel();
    // Nada de mexer no BUS de musica aqui. A tentacao e abaixa-lo durante a viagem, mas este
    // caminho tem duas saidas — o proximo level e o menu, quando nao ha proximo — e so uma
    // delas voltaria para levanta-lo. O bus ficaria mudo no menu. A cena nova ja resolve a
    // trilha sozinha (create chama stopMusic + startAmbience).
    await this.wait(PORTAL_TUNNEL_HANDOFF_MS);

    try {
      const next = await nextEntry;
      if (!next) {
        // Fim da fila: nao ha mundo do outro lado para o heroi cair, entao o tunel nao leva a
        // lugar nenhum — ele fecha aqui mesmo e o menu recebe a tela.
        setActiveLevel(null);
        await finishPortalTunnel();
        if (this.scene.isSleeping('editor') || this.scene.isActive('editor')) {
          this.scene.stop();
          this.scene.wake('editor');
        } else if (this.scene.get('levelselect')) {
          this.scene.start('levelselect');
        } else {
          const url = new URL(window.location.href);
          url.searchParams.set('level', String(current));
          url.searchParams.delete('play');
          window.location.assign(url.toString());
        }
        return;
      }

      const levelResponse = await window.fetch(levelFilePath(next.level), { cache: 'no-store' });
      if (!levelResponse.ok) throw new Error(`Falha ao carregar ${next.file}`);
      setWorldData(await levelResponse.json());
      setActiveLevel(next.level);
      // O bilhete que sobrevive ao restart: a proxima GameScene nasce com o heroi no ar.
      setPendingPortalArrival();
      // A live test that advances stops owning the old editor store; on the next scene create,
      // ESC becomes the normal pause menu instead of waking a stale previous-level canvas.
      if (this.scene.isSleeping('editor') || this.scene.isActive('editor')) this.scene.stop('editor');
      this.scene.restart();
    } catch (error) {
      // A viagem nao pode terminar num tunel eterno: derruba o overlay antes de mostrar o erro,
      // ou a mensagem fica atras dele.
      clearPendingPortalArrival();
      destroyPortalTunnel();
      this.cameras.main.fadeIn(260, 68, 18, 96);
      this.restoreWorldLight();
      this.levelTransitioning = false;
      this.cutsceneActive = false;
      this.cutsceneHeroLight = 1;
      this.levelButtons?.setVisible(true);
      portal.setSwallow(0);
      portal.deactivate();
      // O heroi volta a existir: ele foi encolhido a zero pela succao, e um erro nao pode
      // deixar o jogador olhando para um level sem personagem.
      this.hero.alpha = 1;
      this.hero.scaleX = 1;
      this.hero.scaleY = 1;
      this.hero.lift = 0;
      this.hero.spin = 0;
      const message = this.add.text(this.scale.width / 2, this.scale.height * 0.2,
        error instanceof Error ? error.message : 'Falha ao abrir o proximo level', {
          fontFamily: FONT_FAMILY,
          fontSize: '10px',
          color: '#e6b8ff',
          stroke: '#170b20',
          strokeThickness: 3,
          resolution: TEXT_RESOLUTION,
        }).setOrigin(0.5).setDepth(SCENE_DEPTHS.toast);
      this.time.delayedCall(2600, () => message.destroy());
    }
  }

  /** O manifesto de levels, resolvido em paralelo com a succao (a rede nao dita o ritmo). */
  /**
   * DESCER numa dungeon a partir do overworld, e SUBIR de volta. As duas usam a travessia de
   * portal inteira — sucção, vazio, túnel, queda —, porque o jogo já ensinou que atravessar um
   * portal é assim; um fade seria uma segunda gramática para a mesma coisa.
   *
   * `beats` é a coreografia compartilhada: ela roda os quatro tempos e, entre o túnel cobrir a
   * tela e o restart, chama `swap` — que é onde cada direção troca o mundo por outro. A busca do
   * arquivo começa ANTES da sucção de propósito: a rede não pode decidir quanto tempo o portal
   * leva para engolir o herói.
   */
  private async portalTrip(
    portal: LevelPortalObject,
    fetching: Promise<void>,
    swap: () => void,
  ): Promise<void> {
    if (this.levelTransitioning) return;
    this.levelTransitioning = true;
    this.cutsceneActive = true;
    this.levelButtons?.setVisible(false);

    await this.playPortalSuck(portal);
    await this.wait(PORTAL_EMPTY_MS);
    startPortalTunnel(this.world3d ? this.world3d.tileScreenSize() / TILESET_FRAME_SIZE : undefined);
    getSoundManager().playPortalTravel();
    await this.wait(PORTAL_TUNNEL_HANDOFF_MS);

    try {
      await fetching;
      swap();
      setPendingPortalArrival();
      if (this.scene.isSleeping('editor') || this.scene.isActive('editor')) this.scene.stop('editor');
      this.scene.restart();
    } catch {
      // Mesma recuperacao de completeLevel: a viagem nao pode terminar num tunel eterno, e o
      // heroi nao pode ficar encolhido a zero num mundo que continua existindo.
      clearPendingPortalArrival();
      destroyPortalTunnel();
      this.cameras.main.fadeIn(260, 68, 18, 96);
      this.restoreWorldLight();
      this.levelTransitioning = false;
      this.cutsceneActive = false;
      this.cutsceneHeroLight = 1;
      this.levelButtons?.setVisible(true);
      portal.setSwallow(0);
      portal.deactivate();
      this.hero.alpha = 1;
      this.hero.scaleX = 1;
      this.hero.scaleY = 1;
      this.hero.lift = 0;
    }
  }

  /**
   * As nove dungeons sao GERADAS a partir da semente desta partida, e lembradas depois disso (ver
   * `dungeon/dungeonWorld`). `?dungeons=static` volta a ler os nove arquivos do disco — as plantas
   * exatas do Zelda 1, que continuam no repositorio: elas sao o controle do A/B, a rede de
   * seguranca de um build ruim, e o que a lista de levels ainda joga.
   */
  private static useStaticDungeons(): boolean {
    return new URLSearchParams(window.location.search).get('dungeons') === 'static';
  }

  private async enterDungeon(portal: LevelPortalObject): Promise<void> {
    const level = portal.level;
    if (level === undefined) return;
    this.persistAdventure(); // a foto do overworld (mochila, chao) fecha antes da viagem
    let world: unknown;
    // A geracao roda DENTRO da travessia do portal — que ja e assincrona e ja dura ~1,5s (succao,
    // vazio, tunel, queda). Ela ocupa o mesmo lugar que a rede ocupava; o jogador nao espera nada
    // que ja nao esperasse.
    const fetching = GameScene.useStaticDungeons()
      ? window
        .fetch(`${import.meta.env.BASE_URL}levels/dungeon-${level}.json`, { cache: 'no-store' })
        .then((res) => { if (!res.ok) throw new Error(`dungeon ${level} indisponivel`); return res.json(); })
        .then((json: unknown) => { world = json; })
      : dungeonWorldFor(level, import.meta.env.BASE_URL).then((generated) => { world = generated; });
    await this.portalTrip(portal, fetching, () => {
      setWorldData(world as Parameters<typeof setWorldData>[0]);
      setActiveLevel(level);
      // O bilhete de volta: o tile do overworld onde ele entrou. Sem isto o heroi reapareceria
      // no ponto de nascimento do mundo, a meio mapa da caverna que acabou de visitar.
      setDungeonTrip({ level, returnX: portal.worldX, returnY: portal.worldY });
    });
  }

  private async leaveDungeon(portal: LevelPortalObject): Promise<void> {
    const trip = getDungeonTrip();
    if (!trip) return;
    this.persistAdventure(); // a foto da dungeon (tesouro tomado, itens largados) fecha aqui
    // ...e o retrato da PLANTA fecha junto. O runtime edita os arrays de chunk no lugar, entao
    // fotografar agora e fotografar o que a visita mudou — e o mundo la fora nunca volta a
    // perguntar a semente por esta dungeon.
    persistActiveDungeon();
    let world: { meta: { playerStart: { worldX: number; worldY: number } } } | undefined;
    const fetching = window
      .fetch(`${import.meta.env.BASE_URL}world.json`, { cache: 'no-store' })
      .then((res) => { if (!res.ok) throw new Error('overworld indisponivel'); return res.json(); })
      .then((json: typeof world) => { world = json; });
    await this.portalTrip(portal, fetching, () => {
      // O overworld volta do disco limpo, sem memoria da visita — entao o ponto de nascimento
      // dele e reescrito aqui, uma vez, para a boca de caverna. E a unica coisa que a volta
      // precisa dizer ao mundo que acabou de carregar.
      if (world) world.meta.playerStart = { worldX: trip.returnX, worldY: trip.returnY };
      setWorldData(world as unknown as Parameters<typeof setWorldData>[0]);
      setActiveLevel(null);
      clearDungeonTrip();
      clearActiveDungeon();
    });
  }

  private async resolveNextLevel(current: number): Promise<LevelManifestEntry | undefined> {
    const indexResponse = await window.fetch(
      `${import.meta.env.BASE_URL}levels/index.json`,
      { cache: 'no-store' },
    );
    if (!indexResponse.ok) throw new Error('Manifesto de levels indisponivel');
    const rawEntries = await indexResponse.json() as Array<{ file?: string }>;
    const entries = rawEntries.flatMap((entry): LevelManifestEntry[] => {
      const match = entry.file ? /^level-(\d+)\.json$/u.exec(entry.file) : null;
      return match ? [{ file: entry.file!, level: Number(match[1]) }] : [];
    }).sort((a, b) => a.level - b.level);
    const currentIndex = entries.findIndex((entry) => entry.level === current);
    return currentIndex >= 0
      ? entries[currentIndex + 1]
      : entries.find((entry) => entry.level > current);
  }

  /** Devolve a luz que a succao comeu — so importa quando a transicao FALHA e a cena sobrevive. */
  private restoreWorldLight(): void {
    const w3 = this.world3d;
    if (!w3 || !this.litParams) return;
    w3.setWorldFade(0);
    w3.params.ambient = this.litParams.ambient;
    w3.params.moon = this.litParams.moon;
    w3.params.exposure = this.litParams.exposure;
  }

  /** Espera em ms presa ao relogio da CENA — pausar o jogo pausa a sequencia junto. */
  private wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => { this.time.delayedCall(ms, resolve); });
  }

  private openPauseMenu(): void {
    // Never pause over another modal state — their overlays own ESC/scrim already, and the
    // dialog camera pan must not be frozen midway.
    if (this.pauseMenu || this.dialogOpen || this.camShifting
      || this.itemGetOpen || this.levelIntroOpen || this.cutsceneActive || this.isDead) return;
    // A bolsa e a pausa nunca convivem: uma congela o mundo e a outra existe justamente por nao
    // congelar. Quem abre a pausa fecha a bolsa (sem equipar nada — fechar nao e confirmar).
    this.quickBag?.close();
    this.quickBag?.setButtonVisible(false);
    this.pauseTouchButton?.setVisible(false);
    this.levelButtons?.setVisible(false);
    this.actionButtons?.setVisible(false);
    // scene.get('title') is undefined in the editor playtest config; without it "quit" would
    // have nowhere to go, so the entry is hidden (mirrors the intro-ending fallback).
    const canQuit = Boolean(this.scene.get('title'));
    // Playing a level (not the adventure): offer a jump back to the level list. Gated on the
    // scene existing too — the lab/editor configs don't register it. Uma dungeon tambem tem
    // activeLevel, mas ela e AVENTURA (a volta dela e a escada, nunca a lista de levels).
    const inLevel = getActiveLevel() !== null && getDungeonTrip() === null
      && Boolean(this.scene.get('levelselect'));
    this.pauseMenu = new PauseMenu(this, {
      onResume: () => this.closePauseMenu(),
      onRestart: () => {
        this.closePauseMenu();
        this.restartRun();
      },
      onLevelList: inLevel
        ? () => {
          this.closePauseMenu();
          getSoundManager().stopMusic();
          getSoundManager().stopAmbience();
          this.scene.start('levelselect');
        }
        : undefined,
      onQuit: canQuit
        ? () => {
          this.closePauseMenu();
          getSoundManager().stopMusic();
          getSoundManager().stopAmbience();
          // Sair pelo menu ABANDONA a expedicao: a bolsa que estava em risco fica no escuro,
          // como em qualquer outra saida que nao seja o portal. O banco (e as melhorias que ele
          // comprou) ja esta no localStorage e sobrevive — e ele que o modo promete guardar.
          // Na aventura, sair GUARDA: o retrato fecha aqui e o titulo passa a oferecer Continue.
          this.persistAdventure();
          endExplorerMode();
          this.scene.start('title');
        }
        : undefined,
      // A SUBTELA. Ela e lida de novo a cada desenho do painel (nunca um retrato tirado ao
      // abrir), entao escolher um item tem um caminho so: a cena troca o item do B e o painel
      // pergunta como ficou.
      readSubScreen: () => this.subScreenView(),
      onSelectItem: (kind) => { this.selectItem(kind as HeldItemKind); },
    });
    // NENHUM PEDIDO E NENHUMA CARGA ATRAVESSA A PAUSA, e isto e a outra metade do `keyup` perdido
    // que o `pressAttack` ja documenta. `scene.pause()` adormece o plugin de teclado junto com a
    // cena: o jogador solta o A com a subtela aberta e o `keyup-Z` nunca chega, entao `attackHeld`
    // fica preso em `true`. Ao voltar, a lamina termina de carregar sozinha — o sino toca do nada
    // e o heroi solta faiscas douradas indefinidamente, sem ninguem segurando botao nenhum.
    this.resetChargeAndBuffers();
    this.scene.pause();
  }

  /**
   * O que a subtela mostra: os coracoes e a mochila, com a ARTE DO JOGO (os proprios frames do
   * Phaser virados em data URL). Um inventario com desenho proprio seria uma segunda gramatica
   * para os mesmos objetos — o jogador tem de reconhecer na mochila o que viu no chao.
   */
  private subScreenView(): SubScreenView {
    return {
      title: t('subscreen.title'),
      emptyLabel: t('subscreen.empty'),
      hearts: {
        max: this.playerMaxHealth,
        filled: this.playerHealth,
        // ui/hearts.png: o coracao do HUD cheio e vazio — arte que estava no repositorio desde
        // sempre e nunca havia sido desenhada uma vez, porque o jogo nao tem HUD.
        icon: spriteDataUrl(this, ASSET_KEYS.hearts, UI_HEART_FRAMES.full),
        emptyIcon: spriteDataUrl(this, ASSET_KEYS.hearts, UI_HEART_FRAMES.empty),
      },
      items: this.inventory.bag().map(({ kind, count }) => {
        const visual = ITEM_VISUAL_2D[kind];
        return {
          kind,
          count,
          icon: spriteDataUrl(this, visual.texture, visual.frame),
          label: t(`items.name.${kind}`),
        };
      }),
      // A mesma separação da bolsa (uma resposta só para "o que tem gesto?"): a grade escolhe, os
      // contadores apenas informam. Duas telas discordando sobre onde mora o minério seria a
      // segunda voz que este jogo não permite.
      materials: this.inventory.materials().map(({ kind, count }) => {
        const visual = ITEM_VISUAL_2D[kind];
        return {
          kind,
          count,
          icon: spriteDataUrl(this, visual.texture, visual.frame),
          label: t(`items.name.${kind}`),
        };
      }),
      selected: this.heldItem,
      map: this.subScreenMap(),
      // A PAGINA DE PLANOS e o MESMO catalogo da bancada (`orderCatalogView`), so que em leitura:
      // duas telas que mostram a mesma receita nao podem ter duas ideias sobre o que ela pede.
      //
      // E ela so existe em mundo que TEM bancada. Uma pagina de receitas num level sem bancada
      // seria a promessa de um gesto que nao tem onde acontecer — que e a mesma mentira do balao
      // de item-que-falta, so que paginada.
      plans: this.toolboxes.length
        ? { title: t('subscreen.plansTitle'), rows: this.orderCatalogView().entries }
        : undefined,
    };
  }

  /**
   * O mapa da subtela: um quadrado por chunk, fog of war vindo dos chunks PISADOS (o save), e
   * so as marcas que o heroi ja viu — fogueira acesa/morta e portal em tela visitada, mais ele
   * mesmo. So a aventura de overworld tem mapa: level e uma tela unica, o explorador e infinito
   * por desenho (o mapa dele mataria a aposta), e a dungeon se aprende andando, como no Zelda.
   */
  private subScreenMap(): SubScreenView['map'] {
    if (!this.adventure || getDungeonTrip()) return undefined;
    const bounds = getWorldBounds();
    const st = adventureState();
    const chunkOf = (wx: number, wy: number): { cx: number; cy: number } => (
      { cx: Math.floor(wx / CHUNK_COLUMNS), cy: Math.floor(wy / CHUNK_ROWS) }
    );
    const visited = new Set(st.visitedChunks);
    const marks: NonNullable<SubScreenView['map']>['marks'] = [];
    for (const cf of this.campfires) {
      const { cx, cy } = chunkOf(cf.worldX, cf.worldY);
      if (visited.has(`${cx},${cy}`)) marks.push({ cx, cy, kind: cf.isLit ? 'fireLit' : 'fireDead' });
    }
    for (const portal of getLevelPortals()) {
      const { cx, cy } = chunkOf(portal.worldX, portal.worldY);
      if (visited.has(`${cx},${cy}`)) marks.push({ cx, cy, kind: 'portal' });
    }
    marks.push({ ...chunkOf(this.playerWorld.worldX, this.playerWorld.worldY), kind: 'hero' });
    return {
      title: t('subscreen.mapTitle'),
      chunksX: bounds.maxCx - bounds.minCx + 1,
      chunksY: bounds.maxCy - bounds.minCy + 1,
      visited: [...visited],
      marks,
    };
  }

  private closePauseMenu(): void {
    if (!this.pauseMenu) return;
    this.pauseMenu.destroy();
    this.pauseMenu = undefined;
    this.quickBag?.setButtonVisible(true);
    this.pauseTouchButton?.setVisible(true);
    this.levelButtons?.setVisible(true);
    this.actionButtons?.setVisible(true);
    this.scene.resume();
  }

  // ── the 3D frame ─────────────────────────────────────────────────────────────
  // Runs on POST_UPDATE so it sees this frame's final state (movement tweens
  // included) and keeps running even when update() early-returns (dialog pan,
  // cut-scenes). Freezes with the scene on pause — a still backdrop for the menu.

  private render3D(_time: number, delta: number): void {
    const w3 = this.world3d;
    const cam = this.camera;
    if (!w3 || !cam) return;
    profiler.begin('render3d');

    // The dialog pan shifts WorldCamera.screenCenter; translate that into a
    // camera view offset in tiles so the 3D framing pans the same way.
    const ts = Math.max(1, this.tileSize);
    const defCx = Math.floor(this.scale.width / 2);
    const defCy = Math.floor(this.scale.height / 2);
    w3.setViewOffset((defCx - cam.screenCenterX) / ts, (defCy - cam.screenCenterY) / ts);
    w3.follow(cam.camX, cam.camY);

    // The projected size of one tile at screen centre IS the legacy "tileSize"
    // every remaining Phaser-side FX scales itself by.
    this.tileSize = w3.tileScreenSize();
    // E o heroi mede EXATAMENTE um tile — aqui, todo frame, junto do numero de que ele depende.
    //
    // Isto era escrito em dois lugares que nao eram este: o `handleResize` (com a formula 2D
    // antiga, que da OUTRO numero) e o `stopBreathing` (com o numero certo). O heroi entao nascia
    // com o tamanho da formula velha e PULAVA para o certo no primeiro passo — que e quando o
    // passo chama `stopBreathing`. Pior que o tamanho: `heroFootY` soma meio `sizePx`, entao com
    // os dois numeros discordando o corpo era plantado a ~0,1 tile ao norte do tile em que o
    // heroi realmente estava. Uma fonte so, derivada da projecao, mata os dois defeitos.
    this.hero.sizePx = this.tileSize;

    // The walk cycle: Phaser's animation component used to drive the sprite's frame from
    // the display list, which kept ticking even when update() early-returned (dialog pan,
    // cut-scene). POST_UPDATE runs on those frames too, so it ticks in the same places.
    tickHeroView(this.hero, delta);
    this.syncHeroBillboard();
    // A arma e a cruz sao desenhadas no POST_UPDATE, junto do heroi, e nao no update: elas se
    // ancoram na posicao projetada dele, e essa posicao so existe depois que a camera 3D deste
    // frame ja escreveu. Desenhar antes seria mirar com a camera do frame passado.

    // Hero glow + carried torch as real lights riding the hero.
    const hb = this.heroBillboard;
    if (hb) {
      w3.setHeroLight(hb.x, hb.y, this.cutsceneHeroLight);
      const torchOn = this.isTorchLit && !this.cutsceneActive;
      const fuel = TORCH_MIN_LIGHT_FRAC + (1 - TORCH_MIN_LIGHT_FRAC) * this.torchFuelFrac;
      w3.setTorchLight(hb.x, hb.y, torchOn ? fuel * this.torchGutter.level : 0);
    }

    w3.render(delta);
    profiler.end('render3d');
    // Gameplay gauges: what the game was DOING on a frame is usually the fastest way to
    // explain what that frame cost.
    profiler.gauge('enemies', this.enemyManager?.aliveCount ?? 0);
    profiler.gauge('tweens', this.tweens.getTweens().length);
    profiler.gauge('displayList', this.children.length);
    profiler.gauge('litCampfires', this.litFireCount);
    profiler.frameEnd();
  }

  // Draw the hero's state onto its 3D billboard: position from the screen-centre pin
  // + any knockback offset, size/frame/flip/tint verbatim.
  private syncHeroBillboard(): void {
    const b = this.heroBillboard;
    const h = this.hero;
    const cam = this.camera;
    if (!b || !cam) return;
    const ts = Math.max(1, this.tileSize);

    // Anchor the mapping at the hero's FEET, not his centre: the billboard is planted on the
    // ground of its tile and grows upward, so breathing (which stretches scaleY) must not move
    // the foot line — otherwise the hero looks like he is hopping.
    b.setPosition(
      cam.camX + (h.x - cam.screenCenterX) / ts + h.lungeX,
      cam.camY + (heroFootY(h) - cam.screenCenterY) / ts - 0.5 + h.lungeY,
    );
    // The walk bob. It has to be elevation and not a shift of y: y is the ground plane here, so
    // nudging it would send the hero *backwards into the scene* instead of up into the air. The
    // contact shadow deliberately ignores elevation, so it stays planted while he bounces.
    // `lift` is what a cut-scene owns (the portal's suck, the arrival's fall); the bob rides on
    // top of it so a hero who lands mid-stride still bounces.
    b.setElevation(h.bobLift + h.lift);
    b.setDisplaySize(
      Math.max(0.05, (h.sizePx * h.scaleX) / ts),
      Math.max(0.05, (h.sizePx * h.scaleY) / ts),
    );
    b.setTexture('hero', h.frame);
    b.setFlipX(h.flipX);
    b.setAlpha(h.alpha);
    b.setAngle(h.spin);

    // The carried item rides the just-synced hero position (the contact blob is the
    // billboard's own groundShadow now — it follows by itself, and hides with the body).
    this.positionBackItem();

    // Death plays its 2D screen-space elegy with a Phaser stand-in; hide the 3D body.
    b.setVisible(!this.isDead);
    if (this.isDead) {
      this.backItemBb?.setVisible(false);
      return;
    }

    if (h.tint !== null) b.setTint(h.tint);
    else b.clearTint();
  }

  private enableEditorReturn(): void {
    this.add.text(this.scale.width - 8, 8, t('editorReturn'), {
      fontFamily: FONT_FAMILY,
      fontSize: '10px',
      color: '#f4a261',
      stroke: '#000000',
      strokeThickness: 3,
      resolution: TEXT_RESOLUTION,
    }).setOrigin(1, 0).setDepth(SCENE_DEPTHS.toast);

    this.input.keyboard?.on('keydown-ESC', () => {
      getSoundManager().stopMusic();
      getSoundManager().stopAmbience();
      this.scene.stop();
      this.scene.wake('editor');
    });
  }

  // Deterministic control surface for the playtest harness (see /playtest). Lets the agent
  // inspect live state and pop the exact UI it wants to validate (dialog / shop).
  private registerDebugApi(): void {
    this.debugApi = {
      getState: () => ({
        scene: GameScene.key,
        player: { worldX: this.playerWorld.worldX, worldY: this.playerWorld.worldY },
        health: this.playerHealth,
        maxHealth: this.playerMaxHealth,
        swordEquipped: this.swordEquipped,
        swordOnFire: this.heldOnFire, // o fogo mora no graveto da mao; a espada nunca queima
        heldOnFire: this.heldOnFire,
        // `heldItem` continua sendo "o que esta na mao" — hoje, o item selecionado no B. A
        // MOCHILA e o campo novo, e e ela que o playtest da subtela precisa ver.
        heldItem: this.heldItem,
        inventory: this.inventory.list(),
        // A BOLSA (ver QuickBag): aberta ou nao. O cenario le isto para provar as duas metades do
        // modo — que o mundo continuou correndo com ela aberta, e que apanhar a fecha.
        bagOpen: this.quickBag?.isOpen === true,
        // O CATALOGO DA ENCOMENDA (ver ToolboxOrderOverlay): aberto ou nao. Ao contrario da bolsa,
        // ele CONGELA o mundo — e e isso que o cenario cobra dele.
        orderOpen: this.orderOverlay !== undefined,
        // A ESGRIMA, do lado de fora: para onde o heroi olha, quais tiles o arco varre agora e se
        // a lamina esta carregada. O `arc` e a MESMA lista que o golpe usa (arcTiles), nao uma
        // copia — um cenario que assertasse uma segunda tabela estaria guardando a tabela, e nao
        // o golpe.
        facing: { ...(this.movementController?.facing ?? { dx: 0, dy: 1 }) },
        // Com a espada NA MÃO são as duas fileiras; senão, só a de perto — a MESMA pergunta
        // que o golpe faz (o A empunha o item da mão), para o cenário nunca ler um alcance
        // que o herói não tem.
        arc: this.arcTiles(2),
        spinCharged: this.chargeReady,
        groundItems: this.itemManager?.snapshot() ?? [],
        crates: this.woodenCrates.map((crate) => ({ worldX: crate.worldX, worldY: crate.worldY })),
        pressurePlates: this.pressurePlates.map((plate) => ({
          worldX: plate.worldX,
          worldY: plate.worldY,
          variable: plate.variable,
          pressed: plate.pressed,
        })),
        waterWheels: this.waterWheels.map((wheel) => ({
          worldX: wheel.worldX,
          worldY: wheel.worldY,
          variable: wheel.variable,
          wired: this.wireTouching(wheel.worldX, wheel.worldY),
          hasFlow: wheel.hasFlow,
          speed: Number(wheel.speed.toFixed(3)),
          generating: wheel.isGenerating,
          frame: wheel.frame,
          rotation: Number(wheel.rotation.toFixed(3)),
        })),
        wires: this.wires.map((wire) => ({
          worldX: wire.worldX,
          worldY: wire.worldY,
          shape: wire.wireShape,
          live: wire.isLive,
          playerBuilt: wire.playerBuilt,
        })),
        // A FABRICA vista de fora. `power` e o campo que o cenario do gargalo le: e a MESMA
        // satisfacao que move a maquina (nao uma segunda conta), entao um teste que a asserta
        // esta guardando a rede, e nao um relatorio sobre ela.
        belts: this.belts.map((belt) => ({
          worldX: belt.worldX,
          worldY: belt.worldY,
          dir: belt.dir,
          power: Number(this.powerAt(belt.worldX, belt.worldY).toFixed(3)),
          playerBuilt: belt.playerBuilt,
        })),
        chests: this.chests.map((chest) => ({
          worldX: chest.worldX,
          worldY: chest.worldY,
          kind: chest.storedKind,
          count: chest.storedCount,
          playerBuilt: chest.playerBuilt,
        })),
        extractors: this.extractors.map((ex) => ({
          worldX: ex.worldX,
          worldY: ex.worldY,
          dir: ex.dir,
          input: ex.inputTile,
          output: ex.outputTile,
          running: ex.isRunning,
          power: Number(this.powerAt(ex.worldX, ex.worldY).toFixed(3)),
          playerBuilt: ex.playerBuilt,
        })),
        boilers: this.boilers.map((boiler) => ({
          worldX: boiler.worldX,
          worldY: boiler.worldY,
          variable: boiler.variable,
          heated: boiler.isHeated,
          water: Number(boiler.waterFrac.toFixed(3)),
          pressure: Number(boiler.pressure.toFixed(3)),
          generating: boiler.isGenerating,
        })),
        inserters: this.inserters.map((arm) => ({
          worldX: arm.worldX,
          worldY: arm.worldY,
          variable: arm.variable,
          playerBuilt: arm.playerBuilt,
          power: Number(this.powerAt(arm.worldX, arm.worldY).toFixed(3)),
          powered: arm.isPowered,
          reversed: arm.isReversed,
          owes: arm.owesReturn,
          source: arm.sourceTile,
          dest: arm.destTile,
          busy: arm.isBusy,
        })),
        toolboxes: this.toolboxes.map((box) => ({
          worldX: box.worldX,
          worldY: box.worldY,
          dir: box.dir,
          slots: box.slotTiles,
          output: box.outputTile,
          phase: box.currentPhase,
          frame: box.currentFrame,
          busy: box.isBusy,
          holding: box.heldProduct,
          refusals: box.refusalCount,
        })),
        // O BALAO DE PENSAMENTO do heroi: qual icone esta na cabeca dele agora (null = nenhum).
        thought: this.heroThought?.visibleIcon ?? null,
        // A CADEIA DO FERRO: o forno e o martinete, como o cenario os observa.
        furnaces: this.furnaces.map((f) => ({
          worldX: f.worldX,
          worldY: f.worldY,
          dir: f.dir,
          slots: f.slotTiles,
          output: f.outputTile,
          phase: f.currentPhase,
          busy: f.isBusy,
          smelted: f.smeltCount,
        })),
        // O ALTAR: onde ele esta, o que ha em cima e quantas pancadas aquilo ja levou.
        altars: this.altars.map((a) => ({
          worldX: a.worldX,
          worldY: a.worldY,
          holding: a.carrying,
          blows: a.blowsLanded,
          forged: a.forgeCount,
        })),
        tripHammers: this.tripHammers.map((h) => ({
          worldX: h.worldX,
          worldY: h.worldY,
          dir: h.dir,
          anvil: h.anvilTile,
          running: h.isRunning,
          blows: h.blowsLanded,
          power: Number(this.powerAt(h.worldX, h.worldY).toFixed(3)),
        })),
        electronicGates: this.electronicGates.map((gate) => ({
          worldX: gate.worldX,
          worldY: gate.worldY,
          powered: gate.isPowered,
          open: gate.isOpen,
          moving: gate.isMoving,
          blocking: gate.blocking,
          openness: Number(gate.openness.toFixed(3)),
          frame: gate.frame,
        })),
        swingGates: this.swingGates.map((g) => ({
          worldX: g.worldX,
          worldY: g.worldY,
          open: g.isOpen,
          refusals: g.refusalCount,
        })),
        moonflowers: this.moonflowers.map((mf) => ({
          worldX: mf.worldX,
          worldY: mf.worldY,
          open: mf.isOpen,
          blocking: mf.blocking,
          openness: Number(mf.openAmount.toFixed(3)),
          ...mf.view,
        })),
        levelPortals: this.levelPortals.map((portal) => ({
          worldX: portal.worldX,
          worldY: portal.worldY,
          activated: portal.isActivated,
          frame: portal.frame,
          visibleParticles: portal.visibleParticleCount,
          swallow: portal.swallowAmount,
        })),
        heroLift: this.hero.lift,
        heroScale: this.hero.scaleX,
        portalTunnel: portalTunnelActive(),
        activeLevel: getActiveLevel(),
        levelName: getWorldName(),
        levelIntroOpen: this.levelIntroOpen,
        levelTransitioning: this.levelTransitioning,
        globalVariables: this.globalVariables.snapshot(),
        coins: this.coinManager?.coinTotal ?? 0,
        dialogOpen: this.dialogOpen,
        itemGetOpen: this.itemGetOpen,
        isDead: this.isDead,
        // O herói virou estátua? (a bola do zora — ver FreezeManager; `zora` e `gelo` leem isto)
        heroFrozen: this.isHeroFrozen,
        litFires: this.campfires.filter((cf) => cf.isLit).length,
        safety: {
          safe: this.playerSafe,
          danger: this.spawnDirector?.danger ?? 0,
          undeadCount: this.enemyManager?.aliveCount ?? 0,
        },
        // A trilha que o jogo esta PEDINDO (null = vento/silencio). E como um cenario cobra que
        // corpo fora do quadro nao liga musica de combate — ver framedAliveCount no update.
        music: getSoundManager().requestedTrack,
        // `undead` guardou o nome antigo de proposito (todo cenario existente le por ele), mas hoje
        // ele lista o bestiario inteiro — cada entrada diz a propria especie em `kind`.
        undead: this.enemyManager?.snapshot() ?? [],
        shots: this.enemyManager?.shotSnapshot() ?? [],
        // As ossadas que caveira morta deixou no chao (CorpseDecals): so a contagem — o que um
        // cenario tem a cobrar e "matar deixa marca", nao onde cada osso caiu.
        corpses: this.enemyManager?.corpseCount ?? 0,
        enemySpawners: this.enemySpawners?.snapshot() ?? [],
        activeScreen: {
          cx: Math.floor(this.playerWorld.worldX / CHUNK_COLUMNS),
          cy: Math.floor(this.playerWorld.worldY / CHUNK_ROWS),
        },
        explorer: this.explorer
          ? {
            seed: explorerRun()?.seed ?? 0,
            carried: explorerRun()?.coins ?? 0,
            banked: explorerMeta().banked,
            depth: Number(distanceFromCamp(this.playerWorld.worldX, this.playerWorld.worldY).toFixed(2)),
            maxDepth: Number((explorerRun()?.maxDepth ?? 0).toFixed(2)),
            multiplier: coinMultiplierAt(distanceFromCamp(this.playerWorld.worldX, this.playerWorld.worldY)),
            kills: explorerRun()?.kills ?? 0,
            promptOpen: this.chunkPurchaseOverlay !== undefined,
            builder: {
              cardsOpen: this.chunkPurchaseOverlay !== undefined,
              gateUnderPlayer: this.explorer.gateAt(
                this.playerWorld.worldX,
                this.playerWorld.worldY,
              )?.id ?? null,
              gates: this.explorer.frontiers().map((gate) => ({
                id: gate.id,
                direction: gate.direction,
                gateX: gate.gateX,
                gateY: gate.gateY,
                targetCx: gate.targetCx,
                targetCy: gate.targetCy,
              })),
              built: this.explorer.source.builtChunks(),
              catalog: this.explorer.source.catalog().map((entry) => ({ ...entry.catalog })),
              // A mortalha de escuridão: quem está coberto e quem está dissolvendo (a compra).
              shroud: this.world3d?.chunkShroud.stats() ?? { covered: [], revealing: [] },
            },
            // A instrumentacao da janela: quantas vezes o terreno foi reassado e quanto custou
            // o ultimo. E o numero que decide se o modo pode existir — ver ExplorerDirector.
            rebuilds: this.explorer.rebuilds,
            lastRebuildMs: Number(this.explorer.lastRebuildMs.toFixed(2)),
            props: {
              campfires: this.campfires.length,
              portals: this.levelPortals.length,
              dryTrees: this.dryTrees.length,
              rocks: this.rocks.length,
            },
            stats: explorerMeta().stats,
          }
          : null,
      }),
      openDialog: (kind = 'blackCat') => {
        if (this.dialogOpen || this.isDead) return false;
        this.openNpcDialog(kind);
        return true;
      },
      closeDialog: () => {
        this.dialogOverlay?.destroy();
        this.dialogOverlay = undefined;
        this.dialogOpen = false;
        this.endDialogCameraShift();
      },
      triggerSwordGet: () => {
        if (!this.itemGetOpen) {
          this.onCollectItem({ kind: 'sword', worldX: this.playerWorld.worldX, worldY: this.playerWorld.worldY });
        }
      },
      listNpcKinds: () => getDialogKinds(),
      // A escada de vida do bestiario, pro playtest cobrar a LEI (crescente, sem repeticao) em vez
      // de repetir os numeros dela — uma copia no cenario e a copia que diverge no dia do balanco.
      enemyBlows: () => ENEMY_BLOWS,
    };
    registerGameDebugApi(this.debugApi, this);
    this.clearDebugHooks?.();
    this.clearDebugHooks = registerSceneDebugHooks(this, () => JSON.stringify({
      coordinateSystem: 'tile grid; origin=(0,0) at world top-left; +x east/right, +y south/down',
      ...this.debugApi?.getState(),
    }));
  }

  public shutdown(): void {
    this.clearDebugHooks?.();
    this.clearDebugHooks = undefined;
    if (this.debugApi) {
      clearGameDebugApi(this.debugApi);
      this.debugApi = undefined;
    }
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    // 3D teardown: stop the frame hook, drop the billboards, dispose the renderer.
    this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.render3D, this);
    this.events.off(Phaser.Scenes.Events.PRE_UPDATE, profiler.frameStart, profiler);
    profiler.detach();
    for (const t of this.wallTorches) t.destroy();
    this.wallTorches = [];
    this.heroBillboard?.destroy();
    this.heroBillboard = undefined;
    // Phaser destroys the scene's own GameObjects on shutdown; drop the handle so a restart
    // never finds a stale one.
    this.deathHero = undefined;
    if (window.hd3d === this.world3d?.params) window.hd3d = undefined;
    setCurrentWorld3D(undefined);
    this.world3d?.dispose();
    this.world3d = undefined;
    if (this.camera) this.camera.world3d = undefined;
    this.camShiftTween?.stop();
    this.camShiftTween = undefined;
    this.camShifting = false;
    this.cutsceneActive = false;
    this.cutsceneFireLight = undefined;
    this.cutsceneHeroLight = 1;
    this.dialogNpcWorld = undefined;
    this.enemyManager?.destroy();
    this.spawnDirector = undefined;
    this.enemySpawners = undefined;
    this.npcManager?.destroy();
    this.dialogOverlay?.destroy();
    this.dialogOverlay = undefined;
    this.itemGetOverlay?.destroy();
    this.itemGetOverlay = undefined;
    this.itemGetOpen = false;
    this.levelIntroOverlay?.destroy();
    this.levelIntroOverlay = undefined;
    this.levelIntroOpen = false;
    this.pauseMenu?.destroy();
    this.pauseMenu = undefined;
    this.pauseTouchButton?.destroy();
    this.pauseTouchButton = undefined;
    this.levelButtons?.destroy();
    this.levelButtons = undefined;
    this.actionButtons?.destroy();
    this.actionButtons = undefined;
    this.quickBag?.destroy();
    this.quickBag = undefined;
    this.controlsHint?.destroy();
    this.controlsHint = undefined;
    this.explorerHud?.destroy();
    this.explorerHud = undefined;
    this.chunkGatePrompt?.destroy();
    this.chunkGatePrompt = undefined;
    this.chunkPurchaseOverlay?.destroy();
    this.chunkPurchaseOverlay = undefined;
    this.orderOverlay?.destroy();
    this.orderOverlay = undefined;
    this.orderBox = undefined;
    for (const marker of this.chunkGateMarkers.values()) marker.destroy();
    this.chunkGateMarkers.clear();
    this.chunkUndead = undefined;
    this.extractPrompt?.destroy();
    this.extractPrompt = undefined;
    // O diretor morre com a cena: a janela e a memoria dos props sao da EXPEDICAO, e o create
    // seguinte instala um novo (com a semente que o explorerRun guardou — esse sim atravessa).
    this.explorer = undefined;
    this.coinManager?.destroy();
    this.heartPickupManager?.destroy();
    this.itemManager?.destroy();
    // O gelo morre com a cena (blocos, relógios e ganchos): um degelo atravessando um restart
    // chamaria onThaw numa cena morta.
    this.freezeManager?.destroy();
    this.freezeManager = undefined;
    this.placementHints?.destroy();
    this.placementHints = undefined;
    this.pickupPrompt?.destroy();
    this.pickupPrompt = undefined;
    this.heroThought?.destroy();
    this.heroThought = undefined;
    this.swordSlash?.destroy();
    // Truncar in place (length = 0) esvazia também o array tipado — é o mesmo objeto — então
    // nenhum campo fica segurando props destruídos até o próximo create reatribuí-lo.
    for (const { list } of this.propRegistry) {
      list.forEach((p) => p.destroy());
      list.length = 0;
    }
    this.propRegistry = [];
    // O índice espacial e o conjunto vivo dos cabos seguem a mesma regra de reset do shutdown:
    // nada segura wrapper destruído entre um shutdown e o próximo create.
    this.wireIndex.clear();
    this.liveWires.clear();
    // A satisfacao e recalculada TODO frame, mas ela e um mapa que segura chaves de tiles do
    // mundo antigo: um restart (morte, portal) que a levasse junto faria a primeira leitura de
    // energia do mundo novo responder com a conta do anterior.
    this.powerSatisfaction = new Map();
    this.activeBombs.forEach((b) => b.sprite.destroy());
    this.backItemSwingTimer?.remove();
    this.backItemSwingTimer = undefined;
    this.backItem?.destroy();
    this.backItem = undefined;
    this.backItemBb?.destroy();
    this.backItemBb = undefined;
    this.breathingTween?.destroy();
    this.breathingTween = undefined;
    this.footprints.length = 0;
    this.lowHealthOutlines.forEach((o) => o.destroy());
    this.lowHealthOutlines.length = 0;
    this.fireCompassArrow?.destroy();
    this.fireCompassArrow = undefined;
    this.dangerPulsePhase = 0;
    this.torchFlameBb?.destroy();
    this.torchFlameBb = undefined;
    this.torchGutter.level = 1.0;
    this.torchGutter.velocity = 0;
    this.torchEmberTimer = 0;
    this.swordSlash = undefined;
    this.resetChargeAndBuffers();
    this.globalVariables = new GlobalVariables();
    this.activeBombs = [];
    this.heartbeatPhase = 0;
    // Never leak a frozen tween clock into the next scene run.
    this.hitstopMs = 0;
    if (this.tweens) this.tweens.timeScale = 1;
    this.playerKnockTween = undefined;
  }

  public update(_time: number, delta: number): void {
    // Hitstop: a melee impact freezes the whole world — tweens included, so knockbacks hold
    // their pose at full stretch — for a few frames. This countdown MUST run before every
    // other gate below: a dialog/item-get/cutscene can open on the very frame a hit lands,
    // and those states return early — if they preceded this block, tweens.timeScale would
    // stay 0 forever and their own (tween-driven) sequences could never finish.
    if (this.hitstopMs > 0) {
      this.hitstopMs -= delta;
      if (this.hitstopMs > 0) return; // hold the impact frame, FX and all
      this.tweens.timeScale = 1;
    }

    for (const portal of this.levelPortals) portal.update(delta);
    if (this.levelTransitioning || this.levelIntroOpen) return;

    // Hide the low-health outline up front; the active-play FX below re-shows it each frame if
    // still low. So any frozen state (dialog, item-get, death) leaves it hidden instead
    // of stranding it, misaligned, where the hero last was. Same deal for the fire compass.
    this.hideLowHealthOutlines();
    this.hideFireCompass();
    // A marca some junto: um quadrado branco prometendo um gesto durante um dialogo (ou com o
    // heroi morto) e a mesma mentira que o balao de dica era. `syncPlacementHints` a reacende
    // logo abaixo se o jogo estiver mesmo correndo.
    this.placementHints?.clear();
    this.pickupPrompt?.show(null);
    this.heroThought?.clear();

    // The camera pan (open or close) drives its own reprojection from the tween, so keep the
    // world frozen here until it finishes — otherwise gameplay would fight the pan.
    if (this.dialogOpen || this.camShifting) {
      this.dialogOverlay?.update();
      return;
    }

    // The item-get and first-campfire cut-scene both freeze gameplay; only their own tweens run.
    if (this.itemGetOpen || this.cutsceneActive || this.chunkPurchaseOverlay) return;
    // O CATALOGO da encomenda congela igual: escolher uma ambicao de fabrica na frente de uma
    // bancada nao e um gesto de combate, entao ele nao precisa do preco que a bolsa paga.
    if (this.orderOverlay) return;

    if (this.isDead || !this.movementController || !this.chunkManager || !this.camera) {
      return;
    }

    // A cadencia dos dois botoes. Eles NAO sao lidos aqui: chegam por evento de teclado (e pelo
    // par de circulos no toque), porque um `JustDown` lido dentro do update morre em toda porta
    // que este metodo tem para sair mais cedo — e uma tecla apertada durante um dialogo voltaria
    // a valer, sozinha, no frame em que ele fechasse.
    this.attackCooldownMs = Math.max(0, this.attackCooldownMs - delta);
    this.useCooldownMs = Math.max(0, this.useCooldownMs - delta);
    // O atordoamento corre AQUI e não num tween: este é o mesmo ponto onde as cadências correm, e
    // ele fica depois de todas as portas de saída antecipada do update — um herói atordoado que
    // abrisse a subtela não pode continuar se recuperando com o jogo parado.
    this.playerStaggerMs = Math.max(0, this.playerStaggerMs - delta);
    this.spendActionBuffers(delta);
    this.tickSpinCharge(delta);
    const prevWorldX = this.playerWorld.worldX;
    const prevWorldY = this.playerWorld.worldY;
    this.playerWorld = this.movementController.update(
      this.playerWorld.worldX,
      this.playerWorld.worldY,
      delta,
    );
    const stepDx = this.playerWorld.worldX - prevWorldX;
    const stepDy = this.playerWorld.worldY - prevWorldY;

    for (const t of this.wallTorches) t.update(delta);

    if (stepDx !== 0 || stepDy !== 0) {
      this.lastStepTime = this.time.now;
      this.stopBreathing();
      this.spawnFootprint(prevWorldX, prevWorldY, stepDx, stepDy);
    } else if (!this.dialogOpen && !this.camShifting && this.time.now - this.lastStepTime > 180) {
      // As duas portas acima (`dialogOpen`, `camShifting`) sao a rede de um diálogo que abriu neste
      // mesmo frame: ele para a respiracao e reancora o heroi no centro, e re-comecar a respiracao
      // por cima disso faria a pose de origem-no-pe desenhar o heroi meio tile alto — um "pulo"
      // visivel durante a conversa inteira, porque a reprojecao fica congelada enquanto ela dura.
      // (O dialogo hoje abre pelo botao B, ver `talkToNpcAt`; antes ele abria de dentro do
      // `movementController.update()` logo acima, que e de onde esta rede veio.)
      this.startBreathing();
    }
    for (const box of this.sellBoxes) box.update(delta);
    this.streamChunks();
    this.updateFootprints();
    this.updateExplorerHud();
    this.heroThought?.tick(delta);
    this.updateChunkBuilderUi();

    // Burn the carried flame down; snuff it when the fuel runs out (leaving the hero exposed
    // in the dark). Re-igniting at a lit campfire or lava refills it.
    if (this.heldOnFire) {
      this.torchFuelMs -= delta;
      if (this.torchFuelMs <= 0) this.extinguishTorch();
    }
    // After positionBackItem above, so the flame-tip glow rides this frame's torch position.
    this.updateTorchFx(delta);

    const isPickupOccupied = (x: number, y: number): boolean =>
      (this.heartPickupManager?.hasPickupAt(x, y) ?? false) ||
      (this.itemManager?.hasItemAt(x, y) ?? false);

    const isItemOccupied = (x: number, y: number): boolean =>
      isPickupOccupied(x, y) || (this.enemyManager?.getEnemyAt(x, y) !== null);

    // Safety: near a campfire the hero is untouchable (undead never step into firelight and
    // nothing spawns); in the dark the spawn director ramps the siege up over time.
    const distToFire = this.distToNearestCampfireTiles(this.playerWorld.worldX, this.playerWorld.worldY);
    const wasSafe = this.playerSafe;
    this.playerSafe = distToFire <= CAMPFIRE_SAFE_RADIUS_TILES;
    // Pisar no anel de um fogo aceso e o "descanso" da aventura: este tile vira o lugar onde o
    // heroi acorda (morte, Continue). So na transicao — ancorar por frame gravaria save a toa.
    if (this.playerSafe && !wasSafe) this.anchorRespawnHere();

    // Warming up by the fire heals: while safe in the ring, mend a heart every HEALTH_REGEN_MS.
    if (this.playerSafe && this.playerHealth < this.playerMaxHealth) {
      this.healthRegenTimer += delta;
      // The whole time he mends, warm motes stream from the fire into the hero — the healing
      // visibly comes FROM the campfire, building up gradually until the heart lands.
      this.healMoteTimer += delta;
      if (this.healMoteTimer >= HEAL_MOTE_INTERVAL_MS) {
        this.healMoteTimer = 0;
        this.spawnHealMote();
      }
      if (this.healthRegenTimer >= HEALTH_REGEN_MS) {
        this.healthRegenTimer = 0;
        this.playerHealth = Math.min(this.playerMaxHealth, this.playerHealth + 1);
        getSoundManager().playHeartPickup();
        this.spawnHealBurst();
      }
    } else {
      this.healthRegenTimer = 0;
      this.healMoteTimer = 0;
    }

    if (this.enemyManager) {
      const attacked = this.enemyManager.update(
        delta,
        this.playerWorld.worldX,
        this.playerWorld.worldY,
        this.isTorchLit,
        {
          // A LUZ DEIXOU DE SER PAREDE. Ela repelia todo monstro, e a regra caiu junto com o
          // motivo dela: hoje a fogueira QUEIMA quem chega a dois tiles (ver tickScorch), e uma
          // parede invisível por cima de uma brasa visível são duas respostas para a mesma
          // pergunta — a pior delas mágica. Sobrou o sólido de sempre (terreno, árvore, lenha,
          // arbusto, NPC), igual para o herói e para eles.
          onFoot: (wx, wy) => this.isSolidForEntities(wx, wy),
          // QUEM VOA (o morcego) ve o mesmo mundo menos os hazards: rio e lava nao seguram asa.
          // O mar continua segurando — ele e bloqueio implicito de terreno, a moldura do mundo,
          // e nada no jogo o atravessa. A luz tambem continua: e regra de criatura, nao de chao.
          flying: (wx, wy) => this.isSolidForEntities(wx, wy, true),
          // Uma BALA e outra coisa: parede a mata, luz e agua nao (ver isShotBlockedAt — e um teste
          // proprio porque tem de ignorar uma classe de TERRENO, nao so os props de hazard).
          shot: (wx, wy) => this.isShotBlockedAt(wx, wy),
        },
        this.playerInvincible,
        // O QUADRO: fora dele bicho nao fala nem comeca golpe (ver EnemyBase.setFrameGate).
        (wx, wy) => this.isTileFramed(wx, wy),
        // O CALOR: encostado na fogueira o corpo ARDE e vai perdendo vida (ver tickScorch). É o
        // que ficou no lugar do desmanche silencioso da matilha quando o herói alcançava o fogo.
        (wx, wy) => this.isTileScorchedByCampfire(wx, wy),
        this.lurablePlates(),
      );
      if (attacked) this.handleEnemyAttackPlayer(attacked);

      // O CONGELAMENTO: relógios, degelos e o desenho de cada bloco (ver FreezeManager). O herói
      // congelado ganha a raiz de novo a cada frame — cinto e suspensório: nenhum caminho de
      // dano/interrupção pode devolver os pés antes do degelo.
      this.freezeManager?.update(delta);
      this.heroFreezeImmuneMs = Math.max(0, this.heroFreezeImmuneMs - delta);
      if (this.isHeroFrozen) this.movementController?.root(80);

      this.enemyManager.render(this.tileSize, this.camera);

      this.spawnDirector?.update(delta, {
        playerWorldX: this.playerWorld.worldX,
        playerWorldY: this.playerWorld.worldY,
        distToFireTiles: distToFire,
        aliveUndead: this.enemyManager.aliveCount,
        canSpawnAt: (wx, wy) => this.canSpawnUndeadAt(wx, wy),
        spawn: (wx, wy) => this.enemyManager?.spawnUndead(wx, wy),
        // O cerco APERTA com a distancia do acampamento: e o outro lado da moeda que fica mais
        // valiosa la fora. Sobe mais devagar que a recompensa de proposito (ver dangerScaleAt),
        // senao ir fundo seria matematicamente neutro e nao haveria decisao nenhuma a tomar.
        pressure: this.explorer
          ? dangerScaleAt(distanceFromCamp(this.playerWorld.worldX, this.playerWorld.worldY))
          : 1,
      });

      // World-builder pressure comes ONLY from roads whose next chunk has not been bought.
      // There is no wave banner and no ring spawn around the hero: one corpse simply walks in
      // from the dark, then another later, with a small global cap.
      if (this.explorer && this.chunkUndead) {
        // SÓ A TERRA DE COMBATE DEIXA O ESCURO ENTRAR. O cerco nasce nas estradas inacabadas, e
        // ele entrava por todas — o mapa do poeta e a aula do gato incluídos. Uma conversa cortada
        // por uma caveira não é tensão, é ruído. A estrada filtra pela categoria da terra que a
        // possui (ver ChunkCategory); o acampamento conta como combate, senão a primeira caveira
        // do jogo — a que paga a primeira carta — nunca chegaria.
        const source = this.explorer.source;
        this.chunkUndead.update(
          delta,
          this.explorer.frontiers().filter((f) => source.categoryAt(f.sourceCx, f.sourceCy) === 'combat'),
          this.enemyManager.aliveCount,
          (wx, wy) => { this.enemyManager?.spawnUndead(wx, wy); },
        );
      }

      // ...e as covas autoradas, que rodam mesmo onde o cerco nao existe (lab/levels). A ordem
      // importa pouco, mas vem depois de proposito: o cerco conta a populacao viva pro teto dele,
      // e uma caveira de cova nascida neste frame ja entra nessa conta no frame seguinte.
      this.enemySpawners?.update(delta, {
        playerWorldX: this.playerWorld.worldX,
        playerWorldY: this.playerWorld.worldY,
        playerSafe: this.playerSafe,
        canSpawnAt: (wx, wy, type) => this.canSpawnAuthoredEnemyAt(wx, wy, type),
        // A cova autorada e a unica porta por onde entra especie que nao e caveira: o `type` vem
        // do tile que o autor pintou na aba Inimigos. O mesmo teste de tile viaja com ela porque
        // o slime GRANDE precisa refaze-lo ao morrer, pros filhotes nao nascerem dentro da pedra.
        spawn: (wx, wy, type) => this.enemyManager?.spawn(
          type,
          wx,
          wy,
          (cx, cy) => this.canSpawnAuthoredEnemyAt(cx, cy),
        ),
      });

      // Souls staging: the combat track rises only while undead are actually out and the
      // hero is beyond the firelight; a few calm seconds after the last one falls it fades
      // back to the wind-only default. Suppressed while any overlay/cutscene owns the music.
      // isDead matters here: triggerDeath (silence, total) can fire earlier in THIS same
      // update pass, and without it the danger check below would restart the combat track
      // right on top of the death screen.
      const uiOwnsMusic = this.cutsceneActive || this.dialogOpen || this.itemGetOpen || this.isDead;
      // framedAliveCount, e nao aliveCount: um corpo vivo FORA do quadro (a caveira que ficou
      // pra tras, a gosma vagando a 12 tiles) segurava a trilha de combate numa tela vazia — o
      // jogador ouvia perigo que nao tinha como ver. Musica de perigo e promessa de corpo NA tela.
      if (this.enemyManager.framedAliveCount > 0 && !this.playerSafe) {
        this.dangerCalmMs = 0;
        if (!uiOwnsMusic) getSoundManager().startMusic('danger', 900);
      } else {
        this.dangerCalmMs += delta;
        // A calmaria devolve a trilha do mundo (aventura de overworld) ou o vento (o resto).
        if (!uiOwnsMusic && this.dangerCalmMs > 4000) {
          if (this.adventure && !getDungeonTrip()) getSoundManager().startMusic('overworld', 2600);
          else getSoundManager().stopMusic(2600);
        }
      }
    }

    if (this.coinManager && this.camera) {
      const heroScreen = { x: this.camera.screenCenterX, y: this.camera.screenCenterY };
      // A moeda apanhada VOA pro contador do HUD (que pulsa ao crescer) — pegar moeda tem de
      // parecer sempre bom. Sem HUD na tela (aventura, levels), ela some no herói como antes.
      this.coinManager.update(
        this.playerWorld.worldX,
        this.playerWorld.worldY,
        { counter: this.hudCoinAnchor() ?? heroScreen, hero: heroScreen },
        () => {
          // A ESCADA DE TOM: moeda cai em punhado (uma venda de nove barras paga nove), e nove
          // vezes o mesmo blip é ruído. Cada moeda apanhada logo depois da anterior sobe meio
          // tom; a sequência zera sozinha depois de 700ms sem nenhuma, que é o intervalo em que
          // o ouvido para de ligar uma na outra.
          const now = this.time.now;
          this.coinChainStep = now - this.coinChainAt < 700 ? this.coinChainStep + 1 : 0;
          this.coinChainAt = now;
          getSoundManager().playCoinPickup(this.coinChainStep);
          // No explorador a moeda entra na BOLSA da expedicao — que e o numero em risco, e
          // portanto o unico que o HUD mostra. So metade dela (ou 5%) vira banco no fim.
          if (this.explorer) addExplorerCoins(1);
          // Na aventura a carteira e progresso: cada moeda absorvida ja dorme no save.
          else this.persistAdventure();
        },
      );
      this.coinManager.render(this.tileSize, this.camera);
    }

    if (this.heartPickupManager && this.chunkManager) {
      this.heartPickupManager.update(
        delta,
        this.playerWorld.worldX,
        this.playerWorld.worldY,
        this.playerHealth,
        this.chunkManager,
        isItemOccupied,
        () => {
          getSoundManager().playHeartPickup();
          this.playerHealth = Math.min(this.playerMaxHealth, this.playerHealth + 1);
        },
      );
      this.heartPickupManager.render(this.tileSize, this.camera!);
    }

    if (this.itemManager) {
      // O combustivel de um graveto aceso no chao queima na mesma moeda do da mao.
      this.itemManager.tickFires(delta);
      // CARVAO sob a tocha ACESA: consome em vez de trocar — o passo COME o carvao e a chama
      // volta ao combustivel cheio. E o unico jeito walk-only de reabastecer longe de fogo
      // vivo, e por isso o carvao existe (o fogo produzindo o proprio alimento).
      if (this.isTorchLit
        && this.itemManager.kindAt(this.playerWorld.worldX, this.playerWorld.worldY) === 'charcoal') {
        this.itemManager.takeAt(this.playerWorld.worldX, this.playerWorld.worldY);
        this.refuelTorch();
        getSoundManager().playIgnite();
        this.hero.tint = 0xff6600;
        this.time.delayedCall(250, () => { this.hero.tint = null; });
        this.persistAdventure(); // o carvao comido saiu do chao
      }
      // ── PISAR APANHA. TUDO. ───────────────────────────────────────────────────────────────
      //
      // Era uma lista de exceções (minério, cabo, carvão) sobre a lei "pegar é o botão B". A lei
      // caiu junto com o gesto de LARGAR: o X vira "usar o item selecionado" (ver `pressUse`), e
      // sem largar não existe mão a ser roubada — apanhar deixou de poder custar alguma coisa.
      // O que restava da regra antiga era um botão gasto para dizer sim ao óbvio.
      //
      // `stash` e nunca `add`: guardar NÃO troca o item da mão. Quem está com a picareta escolhida
      // atravessa um chão coberto de coisas e continua com a picareta — a seleção é do jogador, e
      // só um `selectFirstIfEmpty` (a primeira ferramenta da partida) a preenche sozinho.
      const { worldX: px, worldY: py } = this.playerWorld;
      const underfoot = this.itemManager.kindAt(px, py);
      if (underfoot) this.collectUnderfoot(px, py);
      this.itemManager.render(this.tileSize, this.camera!);
    }

    if (this.playerInvincible) {
      this.invincibleTimer -= delta;
      if (this.invincibleTimer <= 0) {
        this.playerInvincible = false;
        this.hero.alpha = 1;
      }
    }

    this.updateLowHealthFx(delta);
    this.updateFireCompass();
    this.updateDangerVignette(delta);

    // Felled trees grow back after a while (renewable gravetos = no soft-lock). The clock only
    // ticks while the tile is clear — crucially, a dropped item (the graveto) on the stump
    // pauses it, so the timer truly starts only once that item is picked up.
    for (const tree of this.dryTrees) {
      if (tree.updateRegrow(delta, this.isTileClearForRegrow(tree.worldX, tree.worldY))) {
        tree.regrow();
      }
    }
    // Plots whose grown grass was consumed reopen their hole for replanting (the farming loop).
    this.updatePlantSpots();
    // A planta carnívora à espreita: todo inimigo parado num vizinho dela é comido.
    this.updateCarnivorousPlants();
    // A flor da lua le a luz das fogueiras e abre/fecha por conta dela.
    this.updateMoonflowers(delta);
    // Produtores primeiro, a corrente nos cabos depois, consumidores por ultimo: placa/roda/
    // caldeira atualizam a rede no MESMO frame em que o braco consulta energia, sem um pulso
    // atrasado ao abrir ou fechar um circuito. Os cabos correm FORA do updateMechanismCircuits
    // porque tem uma fonte que nao e maquina: a bateria carregada pousada no chao.
    this.updateMechanismCircuits(delta);
    this.updatePowerGrid(delta);
    this.updateElectronicGates(delta);
    this.updateInserters(delta);
    // A LINHA, na ordem em que a materia corre: o extrator cria, a esteira leva, a bancada
    // transforma. Cada peca le o chao DEPOIS de quem a alimenta ter escrito nele, entao a
    // fabrica anda inteira num frame so em vez de um estagio por quadro — que e a diferenca
    // entre uma linha que corre e uma que engasga visivelmente a cada junta.
    this.updateExtractors(delta);
    this.updateFurnaces(delta);
    this.updateTripHammers(delta);
    // O ALTAR não tem ciclo: o único relógio dele é o da brasa que a pancada deixou no tampo, e
    // ele corre aqui porque desenho de peça é trabalho de peça, nunca do botão que a acertou.
    for (const altar of this.altars) altar.update(delta);
    this.updateBelts(delta);
    // Depois dos bracos, de proposito: a saida de um braco pode ser a bandeja de uma caixa, e
    // ler o chao no mesmo frame em que a carga assentou faz a fabrica andar sem um frame de atraso.
    this.updateToolboxes(delta);

    // As marcas de posicionamento seguem o corpo NO MESMO frame em que ele vira (elas leem
    // `facingTile`), entao elas moram aqui e nao no render: um frame de atraso faria o quadrado
    // branco apontar para o tile anterior a cada passo, que e pior do que nao ter marca.
    this.syncPlacementHints();
    this.syncPickupPrompt();
    if (this.npcManager && this.camera) this.npcManager.render(this.tileSize, this.camera);
    this.renderProps();
    // Cast shadows are real: the fire's shadow light in the 3D renderer throws them.
  }

  /**
   * O corpo que pisa neste tile aparece na tela agora? Projetado pela camera 3D DE VERDADE
   * (tileToScreen), nunca pelo retangulo plano do getVisibleRange: em perspectiva o quadro e
   * assimetrico — ~4,5 tiles pros lados, ~6,5 pro norte e so ~2,5 pro sul (a camera inclinada
   * engole o perto) — e um retangulo simetrico mente nas quatro bordas. A folga e de UM CORPO:
   * meio tile pros lados e um tile alem da borda de baixo (os pes saem mas a cabeca ainda
   * aparece); na borda de cima nao ha folga, porque o corpo desenha PRA CIMA dos proprios pes.
   *
   * E o predicado da lei "o que a tela nao mostra nao fala nem comeca golpe" (EnemyBase) e do
   * que a trilha de perigo conta (EnemyManager.framedAliveCount).
   */
  public isTileFramed(worldX: number, worldY: number): boolean {
    if (!this.camera) return true;
    const p = this.camera.tileToScreen(worldX, worldY, this.tileSize);
    const slack = this.tileSize / 2;
    return p.x >= -slack && p.x <= this.scale.width + slack
      && p.y >= 0 && p.y <= this.scale.height + this.tileSize;
  }

  private handleResize(gameSize: Phaser.Structs.Size | { width: number; height: number }): void {
    const { width, height } = gameSize;
    this.cameras.main.setViewport(0, 0, width, height);

    // O tileSize e a PROJECAO de um tile pela camera 3D — nunca a formula 2D antiga, que da um
    // numero bem diferente (~60px contra ~93px num viewport de 1280x720, porque a camera enquadra
    // menos de um chunk desde que o zoom desceu). A formula velha so responde antes de o mundo 3D
    // existir, no primeiro `handleResize` do boot.
    this.tileSize = this.world3d?.tileScreenSize() ?? this.computeTileSize(width, height);

    if (this.camera) {
      this.camera.screenCenterX = Math.floor(width / 2);
      this.camera.screenCenterY = Math.floor(height / 2);
      // Visible tile counts around the centered hero (used for the streaming window).
      this.camera.viewportColumns = Math.ceil(width / this.tileSize);
      this.camera.viewportRows = Math.ceil(height / this.tileSize);
      // A resize mid-dialog would recentre the hero under the panel; re-apply the pan offset.
      if (this.dialogOpen) {
        const t = this.dialogScreenCenter(this.dialogNpcWorld);
        this.camera.screenCenterX = t.x;
        this.camera.screenCenterY = t.y;
      }
    }

    // The screen centre just moved; a live hurt-shove would keep easing toward the OLD
    // centre and strand the hero off his tile, so finish it before re-pinning.
    this.cancelPlayerKnockback();
    this.hero.sizePx = this.tileSize; // o render3D reescreve isto todo frame; aqui e so pro primeiro
    this.movementController?.syncPlayerToWorld(this.playerWorld.worldX, this.playerWorld.worldY, this.tileSize);
    this.levelIntroOverlay?.resize(width, height);
  }

  private computeTileSize(width: number, height: number): number {
    const metrics = createBoardMetrics(width, height, {
      columns: CHUNK_COLUMNS,
      rows: CHUNK_ROWS,
      minTileSize: MIN_BOARD_TILE_SIZE,
      characterScale: GAMEPLAY_HERO_SCALE,
      maxCharacterSize: GAMEPLAY_HERO_MAX_SIZE,
    });
    return metrics.tileSize;
  }

  // Stream content for the 3x3 chunk window around the player, loading/unloading as the
  // hero roams the open world.
  private streamChunks(force = false): void {
    const pcx = Math.floor(this.playerWorld.worldX / CHUNK_COLUMNS);
    const pcy = Math.floor(this.playerWorld.worldY / CHUNK_ROWS);
    if (!force && pcx === this.streamCenter.cx && pcy === this.streamCenter.cy) return;
    this.streamCenter = { cx: pcx, cy: pcy };

    // O mundo infinito se move junto: a janela de chunks assados no renderer se recentraliza e
    // os props entram e saem com ela. So aqui, e nunca por frame — este e o unico ponto do
    // jogo que ja sabe que o heroi trocou de chunk.
    if (this.explorer && !force) {
      this.explorer.update(this.playerWorld.worldX, this.playerWorld.worldY, this, this.world3d);
    }

    const active = new Set<string>();
    const radius = 1;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        active.add(`${pcx + dx},${pcy + dy}`);
      }
    }

    // Enemies are not streamed: the world has none — see UndeadSpawnDirector.
    this.npcManager?.syncChunks(active);
    this.heartPickupManager?.syncChunks(active);
    // Held items (sword/key) are loaded once and never streamed — see ItemManager.
  }

  // ── ganchos de teste do explorador (dev/playtest) ────────────────────────────
  //
  // Os tres existem porque as asserções do modo sao sobre CONTAS — 50% e 5% —, e chegar a uma
  // bolsa redonda catando moeda de caveira mediria o combate em vez da regra. Sao metodos
  // publicos e sem nada de esperto: quem chama e `playtest/scenarios/explorador.mjs`.

  /** Força os ids da PRÓXIMA mão de cartas (consumida no uso) — determinismo do playtest. */
  public explorerDebugSetNextOffers(ids: string[]): void {
    if (this.explorer) this.explorer.debugNextOffers = [...ids];
  }

  /**
   * O "TESTAR ESTA CARTA" do editor: constrói a carta marcada colada no acampamento e põe o herói
   * dentro dela, sem passar pelo portão.
   *
   * A compra em si NÃO é o que se está testando — ela é um Enter, e é a mesma para as dezoito
   * cartas. O que se testa é o CONTEÚDO: o desenho, os props, quem mora ali e o que ele fala. Por
   * isso o atalho pula o portão em vez de encher a bolsa de moeda e deixar o autor procurar a
   * própria carta no baralho.
   *
   * O herói pousa no tile pisável mais perto do centro: um teleporte cego cairia dentro da própria
   * parede que a carta autorou, e o autor abriria o teste preso numa pedra.
   */
  private buildPinnedCard(): void {
    const id = consumeExplorerCard();
    const explorer = this.explorer;
    if (!id || !explorer) return;
    const gate = explorer.frontiers()[0];
    if (!gate) return;
    if (!explorer.purchase(gate, id, this, this.world3d)) {
      // Carta desligada no baralho (`catalog.enabled === false`) ou id que não existe mais: o
      // teste não acontece, e o autor fica no acampamento em vez de num mundo meio construído.
      return;
    }
    const cx = gate.targetCx * CHUNK_COLUMNS;
    const cy = gate.targetCy * CHUNK_ROWS;
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let y = 0; y < CHUNK_ROWS; y += 1) {
      for (let x = 0; x < CHUNK_COLUMNS; x += 1) {
        const wx = cx + x;
        const wy = cy + y;
        if (this.isSolidForEntities(wx, wy)) continue;
        const d = (x - CHUNK_COLUMNS / 2) ** 2 + (y - CHUNK_ROWS / 2) ** 2;
        if (d < bestD) { bestD = d; best = [wx, wy]; }
      }
    }
    if (!best) return;
    this.playerWorld = { worldX: best[0], worldY: best[1] };
    this.movementController?.syncPlayerToWorld(best[0], best[1], this.tileSize);
    this.syncChunkGates(explorer.frontiers(), (explorerRun()?.coins ?? 0) >= explorer.minCost());
  }

  /** Poe uma bolsa exata na expedicao. */
  public explorerDebugSetCoins(amount: number): void {
    const run = explorerRun();
    if (!run) return;
    run.coins = Math.max(0, Math.floor(amount));
    this.coinManager?.restoreTotal(run.coins);
  }

  /** Dispara a extracao pelo portal mais proximo, como se o jogador tivesse dito sim. */
  public explorerDebugExtract(): void {
    const portal = this.levelPortals[0] ?? new LevelPortalObject(
      this.playerWorld.worldX, this.playerWorld.worldY,
    );
    void this.returnToCamp(portal);
  }

  /** Mata o heroi na hora (a cinematica roda inteira, e ela e que fecha a conta). */
  public explorerDebugKill(): void {
    this.playerHealth = 0;
    this.triggerDeath();
  }

  /** A bolsa e a profundidade, os dois termos da aposta. Ver ExplorerHud. */
  private updateExplorerHud(): void {
    if (!this.explorerHud) return;
    const dist = distanceFromCamp(this.playerWorld.worldX, this.playerWorld.worldY);
    setExplorerDepth(dist);
    this.explorerHud.update(explorerRun()?.coins ?? 0, this.explorer?.source.builtChunks().length ?? 1);
    // ...e o MAPA do que já foi comprado, com a casa do herói acesa (ver ExplorerHud.updateMap).
    // A conta de chunk é a mesma do resto do jogo: o piso da divisão pelo tamanho do chunk.
    const built = this.explorer?.source.builtChunks() ?? [];
    this.explorerHud.updateMap(
      built,
      Math.floor(this.playerWorld.worldX / CHUNK_COLUMNS),
      Math.floor(this.playerWorld.worldY / CHUNK_ROWS),
    );
  }

  private updateChunkBuilderUi(): void {
    const explorer = this.explorer;
    if (!explorer || !this.chunkGatePrompt) return;
    const coins = explorerRun()?.coins ?? 0;
    const minCost = explorer.minCost();
    this.syncChunkGates(explorer.frontiers(), coins >= minCost);
    // O halo do marco desperto respira. Ele mora aqui e não num tween por marcador porque são
    // até cinco na tela e a fase de cada um é própria — cinco tweens fariam o mesmo seno com
    // cinco donos.
    for (const marker of this.chunkGateMarkers.values()) marker.update(this.time.now);
    if (this.chunkPurchaseOverlay) { this.chunkGatePrompt.hide(); return; }
    const gate = explorer.gateAt(this.playerWorld.worldX, this.playerWorld.worldY);
    if (gate) this.chunkGatePrompt.show(minCost, coins);
    else this.chunkGatePrompt.hide();
  }

  private openChunkCards(gate: ChunkFrontier): void {
    const explorer = this.explorer;
    if (!explorer || this.chunkPurchaseOverlay) return;
    const coins = explorerRun()?.coins ?? 0;
    const offers = explorer.offers(coins);
    if (offers.length === 0 || !offers.some((entry) => entry.catalog.cost <= coins)) return;
    this.movementController?.hold(true);
    this.actionButtons?.setVisible(false);
    this.chunkGatePrompt?.hide();
    getSoundManager().playShopOpen();

    const finish = (): void => {
      this.chunkPurchaseOverlay?.destroy();
      this.chunkPurchaseOverlay = undefined;
      this.movementController?.hold(false);
      this.actionButtons?.setVisible(true);
      this.updateChunkBuilderUi();
    };
    const overlay = new ChunkPurchaseOverlay(
      gate,
      offers,
      coins,
      (choice: ChunkTemplate) => {
        if ((explorerRun()?.coins ?? 0) < choice.catalog.cost) { finish(); return; }
        const built = explorer.purchase(gate, choice.catalog.id, this, this.world3d);
        if (!built) { finish(); return; }
        spendExplorerCoins(choice.catalog.cost);
        this.coinManager?.spendCoins(choice.catalog.cost);
        getSoundManager().playShopClose();
        finish();
      },
      () => {
        getSoundManager().playShopClose();
        finish();
      },
      // O alvo do voo da carta-luz: a boca da estrada comprada, projetada na tela. É lá que a
      // dissolução da mortalha começa — a carta pousa exatamente onde a névoa vai morrer.
      () => this.world3d?.projectTile(gate.enemyX, gate.enemyY, 0.35) ?? null,
    );
    overlay.bindChoices(offers);
    this.chunkPurchaseOverlay = overlay;
  }

  // ── o mundo infinito: props entrando e saindo da janela ──────────────────────
  //
  // A GameScene e o "host" do ExplorerDirector: ele decide QUAIS chunks estao vivos, ela sabe
  // como construir e destruir um prop. Os dois metodos abaixo sao esse contrato, e sao a razao
  // de o modo caber sem tocar em nenhuma das dezenas de leituras de prop espalhadas pela cena:
  // as listas continuam sendo as mesmas listas, so que agora alguem mexe nelas durante a run.

  /** Constroi os props destes defs e os empurra nas listas tipadas (in place — ver propRegistry). */
  public spawnStreamedProps(defs: readonly WorldPropDef[]): void {
    // NASCER DUAS VEZES no mesmo tile é o defeito que este conjunto fecha. Quem sai da janela é
    // destruído por `despawnPropsOutside`, mas ela varre só o CENÁRIO: a fábrica (bancada, cabo,
    // esteira, baú, forno, martinete, braço, extrator, placa, portão) fica de fora de propósito,
    // porque uma peça que o JOGADOR construiu não está em template nenhum e some para sempre se
    // for varrida. Só que o outro lado da moeda nunca foi escrito: voltar para um chunk cuja
    // carta autorou uma dessas peças manda construí-la OUTRA VEZ, e aí são duas máquinas
    // empilhadas no mesmo tile a cada ida e volta. A guarda é do lado do nascimento — é o único
    // que sabe as duas coisas ao mesmo tempo — e é uma pergunta só: já tem prop aqui?
    const taken = new Set<string>();
    for (const entry of this.propRegistry) {
      for (const prop of entry.list) taken.add(`${prop.worldX},${prop.worldY}`);
    }
    for (const def of defs) {
      if (taken.has(`${def.worldX},${def.worldY}`)) continue;
      taken.add(`${def.worldX},${def.worldY}`);
      switch (def.type) {
        case 'campfire':
          this.campfires.push(new CampfireObject(this, def.worldX, def.worldY, def.lit === true));
          break;
        case 'dryTree':
          this.dryTrees.push(new DryTreeObject(this, def.worldX, def.worldY));
          break;
        case 'dryBush': {
          const bush = new DryBushObject(this, def.worldX, def.worldY);
          bush.onBurnedOut = () => this.dropCharcoalFromBush(bush.worldX, bush.worldY);
          this.dryBushes.push(bush);
          break;
        }
        case 'rock':
          this.rocks.push(new RockObject(this, def.worldX, def.worldY));
          break;
        case 'ironRock':
          this.rocks.push(new RockObject(this, def.worldX, def.worldY, true));
          break;
        case 'tallGrass':
          this.tallGrasses.push(new TallGrassObject(this, def.worldX, def.worldY));
          break;
        case 'plantSpot':
          // Os canteiros dos cenários de NPC (a carta do pintor): covas prontas para semente.
          this.plantSpots.push(new PlantSpotObject(this, def.worldX, def.worldY));
          break;
        case 'levelPortal':
          this.levelPortals.push(new LevelPortalObject(def.worldX, def.worldY));
          break;
        // Os tipos abaixo entraram quando as CARTAS AUTORADAS chegaram: o gerador antigo só
        // plantava os de cima, mas o /editor deixa pôr qualquer prop num chunk da biblioteca —
        // e um prop que o editor aceita e este switch não conhece simplesmente NÃO NASCE (foi
        // exatamente o chamado do usuário: "coloquei lava e não apareceu lava").
        case 'lava':
          // A luz vem do POOL (addFireLight) — nascer em runtime não recompila shader nenhum.
          this.lavaTiles.push(new LavaObject(this, def.worldX, def.worldY));
          break;
        case 'water':
          this.waterTiles.push(new WaterObject(this, def.worldX, def.worldY, false));
          break;
        case 'bridgeSpot': {
          const w = new WaterObject(this, def.worldX, def.worldY, true);
          w.onBuilt = () => this.cameras.main.flash(160, 210, 190, 150);
          this.waterTiles.push(w);
          break;
        }
        case 'dryShrub':
          this.dryShrubs.push(new DryShrubObject(this, def.worldX, def.worldY));
          break;
        case 'moonflower':
          this.moonflowers.push(new MoonflowerObject(this, def.worldX, def.worldY));
          break;
        case 'bombSpot':
          this.bombSpots.push(new BombSpotObject(this, def.worldX, def.worldY));
          break;
        case 'lockedDoor':
          this.lockedDoors.push(new LockedDoorObject(this, def.worldX, def.worldY, def.floodgate === true));
          break;
        case 'swingGate':
          this.swingGates.push(new SwingGateObject(this, def.worldX, def.worldY));
          break;
        case 'woodenCrate':
          this.woodenCrates.push(new WoodenCrateObject(this, def.worldX, def.worldY));
          break;
        case 'carnivorousPlant':
          this.carnivorousPlants.push(new CarnivorousPlantObject(this, def.worldX, def.worldY));
          break;
        // A FÁBRICA nasce em chunk comprado como qualquer outro prop. Ela pôde entrar aqui
        // porque a rede deixou de ter estado próprio pra recompor: `updatePowerGrid` resolve
        // TUDO por posição, todo frame, a partir das listas — não há mais um índice vivo que
        // uma peça nascendo no meio da run poderia dessincronizar. A única coisa que ainda
        // precisa de uma mão é a FORMA do cabo, e é ela que o `refreshWireNetwork` reescreve
        // no fim deste método.
        case 'wire':
          this.wires.push(new WireObject(this, def.worldX, def.worldY));
          break;
        case 'belt':
          this.belts.push(new BeltObject(this, def.worldX, def.worldY, def.dir ?? 1));
          break;
        case 'chest':
          this.chests.push(
            new ChestObject(this, def.worldX, def.worldY, false, def.quota, def.variable),
          );
          break;
        case 'boiler':
          this.boilers.push(new BoilerObject(this, def.worldX, def.worldY, def.variable));
          break;
        case 'inserter':
          this.inserters.push(
            new RoboticArmObject(def.worldX, def.worldY, def.dir ?? 1, def.variable),
          );
          break;
        case 'furnace':
          this.furnaces.push(new FurnaceObject(this, def.worldX, def.worldY, def.dir ?? 1));
          break;
        case 'altar':
          this.altars.push(new AltarObject(this, def.worldX, def.worldY));
          break;
        case 'tripHammer':
          this.tripHammers.push(new TripHammerObject(this, def.worldX, def.worldY, def.dir ?? 1));
          break;
        case 'extractor':
          this.extractors.push(new ExtractorObject(this, def.worldX, def.worldY, def.dir ?? 1));
          break;
        case 'pressurePlate':
          this.pressurePlates.push(
            new PressurePlateObject(this, def.worldX, def.worldY, def.variable),
          );
          break;
        case 'electronicGate':
          this.electronicGates.push(
            new ElectronicGateObject(this, def.worldX, def.worldY, def.variable),
          );
          break;
        case 'sellBox':
          if (def.sells) this.sellBoxes.push(this.makeSellBox(def));
          break;
        case 'toolbox':
          this.toolboxes.push(new ToolboxObject(this, def.worldX, def.worldY, def.dir ?? 1));
          break;
        // A RODA D'ÁGUA ficou de fora deste switch por um bom motivo, e o motivo caducou: ela não
        // é só um prop — ela SUBSTITUI a água do tile dela (o rio corre sob as pás, e é dele que o
        // dinamo vive), então nascer aqui significava manter DOIS arrays em par, e meio construída
        // ela é pior que ausente (um rotor girando sobre chão seco). O resultado prático era pior
        // ainda: uma carta de chunk com uma roda autorada nascia SEM ela, em silêncio — foi o que
        // aconteceu com a roda do Lago.
        //
        // O par agora é uma linha, e é condicional: o quad de rio só nasce onde a água NÃO é
        // terreno. Num level a roda substitui um prop de rio e precisa dele; num lago do overworld
        // a água já está pintada no chão, e um segundo quad ali seria um rio desenhado por cima de
        // um lago. Quem move a roda é `waterFlowAt`, e ele lê as duas procedências.
        case 'waterWheel':
          this.waterWheels.push(
            new WaterWheelObject(this, def.worldX, def.worldY, def.variable),
          );
          if (!this.isOpenWaterAt(def.worldX, def.worldY)) {
            this.waterTiles.push(new WaterObject(this, def.worldX, def.worldY, false));
          }
          break;
        default:
          break;
      }
    }
    // A FORMA do cabo é a única coisa da rede que não se deduz por frame: ela é fixada quando o
    // mundo muda de forma. Um chunk comprado pode ter trazido cabo e máquina de uma vez, então
    // a reindexação acontece UMA vez no fim, e não dentro do laço.
    this.refreshWireNetwork();
  }

  /** Keeps the road squares in lockstep with the current frontier graph and purse. */
  public syncChunkGates(gates: readonly ChunkFrontier[], enabled: boolean): void {
    const wanted = new Map(gates.map((gate) => [gate.id, gate]));
    for (const [id, marker] of this.chunkGateMarkers) {
      if (wanted.has(id)) continue;
      marker.destroy();
      this.chunkGateMarkers.delete(id);
    }
    for (const gate of gates) {
      const existing = this.chunkGateMarkers.get(gate.id);
      if (existing) existing.setEnabled(enabled);
      else this.chunkGateMarkers.set(gate.id, new ChunkGateMarker(gate, enabled));
    }
  }

  /** A compra regenerou este chunk na fonte: derruba o cache de colisão baixado dele. */
  public invalidateTerrain(cx: number, cy: number): void {
    this.chunkManager?.invalidate(cx, cy);
  }

  /**
   * Itens autorados E NPCs do template comprado nascem AGORA: o ItemManager carrega a lista
   * autorada uma vez no boot e nunca streama, e o NpcManager pula chunks já ativos — sem esta
   * mão, o presente e o morador do chunk recém-comprado só existiriam depois de sair da janela
   * e voltar. Corações ficam de fora (eles streamam por chunk).
   */
  public spawnBuiltChunkContent(cx: number, cy: number): void {
    const content = this.explorer?.source.chunkContent(cx, cy);
    if (!content) return;
    if (this.itemManager) {
      for (const pickup of content.pickups) {
        if (pickup.type === 'heart') continue;
        if (this.itemManager.hasItemAt(pickup.worldX, pickup.worldY)) continue;
        this.itemManager.drop(pickup.type, pickup.worldX, pickup.worldY);
      }
    }
    this.npcManager?.refreshChunk(cx, cy);
  }

  /** A purchased combat template becomes alive immediately, without waiting for a chunk swap. */
  public spawnBuiltChunkEnemies(cx: number, cy: number): void {
    const content = this.explorer?.source.chunkContent(cx, cy);
    if (!content || !this.enemyManager) return;
    for (const enemy of content.enemies) {
      if (this.enemyManager.getEnemyAt(enemy.worldX, enemy.worldY)) continue;
      this.enemyManager.spawn(
        enemy.type,
        enemy.worldX,
        enemy.worldY,
        (wx, wy) => !this.isSolidForEntities(wx, wy),
      );
    }
  }

  /**
   * Destroi todo prop cujo chunk saiu da janela, devolvendo ao diretor o que cada um tinha de
   * memoravel. So duas coisas sao: uma fogueira ACESA (o jogador pagou por aquela luz com uma
   * tocha e uma caminhada) e um prop CONSUMIDO — pedra quebrada, arvore virada toco, portal ja
   * usado. Todo o resto o gerador refaz identico a partir da semente.
   */
  public despawnPropsOutside(chunks: ReadonlySet<string>): Array<{ key: string; memory: PropMemory }> {
    const out: Array<{ key: string; memory: PropMemory }> = [];
    const outside = (p: { worldX: number; worldY: number }): boolean => !chunks.has(
      `${Math.floor(p.worldX / CHUNK_COLUMNS)},${Math.floor(p.worldY / CHUNK_ROWS)}`,
    );
    const sweep = <T extends { worldX: number; worldY: number; destroy(): void }>(
      list: T[],
      memoryOf: (prop: T) => PropMemory,
    ): void => {
      for (let i = list.length - 1; i >= 0; i--) {
        const prop = list[i];
        if (!outside(prop)) continue;
        out.push({ key: `${prop.worldX},${prop.worldY}`, memory: memoryOf(prop) });
        prop.destroy();
        list.splice(i, 1);
      }
    };

    sweep(this.campfires, (cf) => ({ lit: cf.isLit }));
    sweep(this.dryBushes, (bush) => ({ gone: !bush.blocking }));
    sweep(this.rocks, (rock) => ({ gone: !rock.blocking }));
    sweep(this.tallGrasses, (grass) => ({ gone: !grass.blocking }));
    // A arvore seca NAO e lembrada de proposito: ela ja volta sozinha (TREE_REGROW_MS), e o
    // gerador a devolve inteira — que e exatamente o estado que ela teria daqui a um minuto.
    // Lembrar o toco transformaria o regrow, que existe para a lenha nunca acabar, em uma
    // cicatriz permanente no mundo.
    sweep(this.dryTrees, () => ({}));
    // O canteiro volta pristino ao re-entrar na janela — no construtor a cova é cenário de
    // tutorial, não estado de fazenda (a aventura, que lembra, tem o save para isso).
    sweep(this.plantSpots, () => ({}));
    sweep(this.levelPortals, () => ({}));
    // Os tipos das cartas autoradas (o espelho do switch do spawnStreamedProps). Memorável:
    // a PORTA aberta fica aberta (a chave foi consumida — voltar trancada seria soft-lock) e
    // o arbusto cortado fica cortado. O resto é cenário que o template refaz idêntico.
    sweep(this.lavaTiles, () => ({}));
    sweep(this.waterTiles, () => ({}));
    sweep(this.dryShrubs, (shrub) => ({ gone: !shrub.blocking }));
    sweep(this.moonflowers, () => ({}));
    sweep(this.bombSpots, () => ({}));
    sweep(this.lockedDoors, (door) => ({ gone: !door.blocking }));
    sweep(this.swingGates, () => ({}));
    sweep(this.woodenCrates, () => ({}));
    sweep(this.carnivorousPlants, () => ({}));
    return out;
  }

  // Footprints are placed in world space and re-projected every frame so they stay glued to
  // the ground as the world scrolls under the centered hero.
  private updateFootprints(): void {
    if (!this.camera) return;
    for (const f of this.footprints) {
      const s = this.camera.tileToScreen(f.worldX, f.worldY, this.tileSize);
      f.obj.setPosition(s.x + f.offX, s.y + f.offY);
    }
  }

  /**
   * A ESPADA E DO HEROI, e nao da mochila — por isso isto e uma constante.
   *
   * Ela era um item como qualquer outro: ocupava slot, competia com a picareta pela selecao, e o
   * botao Z so cortava se ela estivesse EMPUNHADA. Na pratica isso fazia o jogador voltar na bolsa
   * antes de toda briga, e transformava a unica defesa do jogo numa consulta de menu — com a
   * caveira ja em cima. Agora o Z e a espada, sempre, venha o que vier selecionado no X; ela nao
   * entra na mochila, nao aparece na fileira e nao se perde.
   */
  private get swordEquipped(): boolean {
    return true;
  }

  /**
   * Either axe cuts DEAD wood (dryTree, dryShrub) — the steel axe is strictly the plain axe
   * plus living trees, never a replacement that invalidates the one the player already has.
   * Anything gated on this stays gated on the cheap tool, so no puzzle built around the plain
   * axe can be skipped (or broken) by finding the steel one.
   */
  private get holdsAnAxe(): boolean {
    return this.heldItem === 'axe' || this.heldItem === 'greatAxe';
  }

  /**
   * A FERRAMENTA QUE ESTE TILE PEDE — e que o herói já tem na mochila. `null` quando o tile não
   * tem uma resposta única (a esmagadora maioria) ou quando a ferramenta dele não foi encontrada
   * ainda: aí o X segue com o que estiver selecionado, e a recusa física de sempre acontece.
   *
   * A lista é curta de propósito e só entra aqui o que tem UMA resposta possível: madeira morta
   * pede machado, pinheiro vivo pede o de aço, pedra pede picareta. Balde, chave, semente e tocha
   * ficam de fora porque os alvos deles aceitam mais de uma coisa (a fogueira acesa reabastece a
   * tocha E apaga com o balde), e adivinhar ali seria escolher pelo jogador em vez de poupá-lo.
   */
  private toolWantedAt(wx: number, wy: number): HeldItemKind | null {
    // MADEIRA MORTA: os dois machados servem, e o COMUM vem primeiro — o de aço é um superset, e
    // gastar o caro onde o barato resolve inverteria a escada de ferramentas do jogo.
    if ((this.getDryTreeAt(wx, wy)?.blocking ?? false)
      || (this.getDryShrubAt(wx, wy)?.blocking ?? false)) {
      return this.firstOwned(['axe', 'greatAxe']);
    }
    // ÁRVORE VIVA é TILE, e só o machado de aço a derruba (ver tryChopTreeTile). Oferecer o comum
    // aqui seria o jogo prometendo um gesto que ele mesmo recusa no frame seguinte.
    if (this.treeTileFrameAt(wx, wy) !== null) return this.firstOwned(['greatAxe']);
    // PEDRA e VEIO são a mesma rocha, e a picareta é a resposta dos dois.
    if (this.getRockAt(wx, wy)?.blocking ?? false) return this.firstOwned(['pickaxe']);
    return null;
  }

  /** O primeiro destes que está na mochila, na ordem em que foram pedidos. */
  private firstOwned(kinds: readonly HeldItemKind[]): HeldItemKind | null {
    return kinds.find((kind) => this.inventory.count(kind) > 0) ?? null;
  }

  /**
   * Saca a ferramenta que o tile à frente pede, se o herói a tiver e ainda não estiver com ela.
   *
   * A TOCHA ACESA é intocável, e é a única exceção: o fogo mora no graveto que está na mão, e
   * trocar de item o apaga (ver selectItem). Perder a chama por passar na frente de uma árvore
   * seria o gesto automático cobrando a coisa mais cara do jogo — e quem carrega fogo está
   * sempre a caminho de outro lugar.
   */
  private equipToolFor(wx: number, wy: number): void {
    if (this.heldOnFire) return;
    const wanted = this.toolWantedAt(wx, wy);
    if (!wanted || wanted === this.heldItem) return;
    this.selectItem(wanted);
  }

  // A busca posicional dita UMA vez; os getters tipados abaixo são a superfície que o resto
  // da cena usa (cada um devolve o tipo concreto do seu sistema).
  /**
   * O prop que ocupa este tile — e "ocupa" inclui a PEGADA de quem e maior que um tile (`covers`).
   *
   * Este metodo e o funil por onde passam colisao, tiro, ocupacao, instalar, recolher e o braco
   * robotico. Ensinar a pegada aqui — e so aqui — e o que faz o martinete de dois tiles bloquear,
   * ser encontrado e ser recolhido pelas DUAS metades sem uma unica edicao nos quarenta lugares
   * que chamam isto. A alternativa era cada sistema lembrar sozinho de perguntar duas vezes, que e
   * a forma mais confiavel de metade de uma maquina virar chao atravessavel.
   */
  private propAt<T extends WorldProp>(list: T[], wx: number, wy: number): T | undefined {
    return list.find((p) => (p.worldX === wx && p.worldY === wy)
      || p.covers?.some(([cx, cy]) => cx === wx && cy === wy));
  }

  private getCampfireAt(wx: number, wy: number): CampfireObject | undefined {
    return this.propAt(this.campfires, wx, wy);
  }

  private getDryBushAt(wx: number, wy: number): DryBushObject | undefined {
    return this.propAt(this.dryBushes, wx, wy);
  }

  private getLockedDoorAt(wx: number, wy: number): LockedDoorObject | undefined {
    return this.propAt(this.lockedDoors, wx, wy);
  }

  private getSwingGateAt(wx: number, wy: number): SwingGateObject | undefined {
    return this.propAt(this.swingGates, wx, wy);
  }

  /**
   * Ha ALGUMA COISA neste tile? Nao "e solido" — solido e o que barra um corpo, e isto aqui e a
   * pergunta mais ampla: tem qualquer coisa ocupando o lugar.
   *
   * Os dois usos precisam exatamente disso e por isso dividem a resposta: o caixote so pode ser
   * empurrado para um tile vazio, e o portao de bater so pode girar para um tile vazio. Um item
   * caido no chao nao e solido — o heroi anda por cima dele —, mas ele impede as duas coisas,
   * e uma segunda copia desta lista era a maneira certa de as duas discordarem daqui a um mes.
   */
  private isTileOccupied(wx: number, wy: number): boolean {
    return this.isSolidForEntities(wx, wy)
      || (this.enemyManager?.getEnemyAt(wx, wy) ?? null) !== null
      || (wx === this.playerWorld.worldX && wy === this.playerWorld.worldY)
      || (this.heartPickupManager?.hasPickupAt(wx, wy) ?? false)
      || (this.itemManager?.hasItemAt(wx, wy) ?? false)
      || this.activeBombs.some((bomb) => bomb.worldX === wx && bomb.worldY === wy);
  }

  private getDryTreeAt(wx: number, wy: number): DryTreeObject | undefined {
    return this.propAt(this.dryTrees, wx, wy);
  }

  private getDryShrubAt(wx: number, wy: number): DryShrubObject | undefined {
    return this.propAt(this.dryShrubs, wx, wy);
  }

  private getRockAt(wx: number, wy: number): RockObject | undefined {
    return this.propAt(this.rocks, wx, wy);
  }

  private getTallGrassAt(wx: number, wy: number): TallGrassObject | undefined {
    return this.propAt(this.tallGrasses, wx, wy);
  }

  private getCarnivorousPlantAt(wx: number, wy: number): CarnivorousPlantObject | undefined {
    return this.propAt(this.carnivorousPlants, wx, wy);
  }

  private getMoonflowerAt(wx: number, wy: number): MoonflowerObject | undefined {
    return this.propAt(this.moonflowers, wx, wy);
  }

  private getBombSpotAt(wx: number, wy: number): BombSpotObject | undefined {
    return this.propAt(this.bombSpots, wx, wy);
  }

  private getInserterAt(wx: number, wy: number): RoboticArmObject | undefined {
    return this.propAt(this.inserters, wx, wy);
  }

  private getToolboxAt(wx: number, wy: number): ToolboxObject | undefined {
    return this.propAt(this.toolboxes, wx, wy);
  }

  /** A caixa cujo tile de bandeja e este (a marca em que pisar DEPOSITA a carga). */
  private getToolboxSlotAt(wx: number, wy: number): ToolboxObject | undefined {
    return this.toolboxes.find((box) => box.slotTiles.some(([sx, sy]) => sx === wx && sy === wy));
  }

  /**
   * O A na frente de uma MÁQUINA DE FABRICAR abre o catálogo dela. Devolve `true` quando havia uma
   * ali — é o contrato de `talkToNpcAt`, e é o que faz o gesto não escorrer para o golpe.
   *
   * Duas peças respondem: a bancada e o forno. Elas dividem a tela, o gesto e o código inteiro de
   * fabricação; o que as separa é uma palavra na receita (`station`). Enquanto o forno tinha
   * interação própria — fantasmas nas bandejas, receita para adivinhar — o jogador precisava
   * aprender duas coisas para o mesmo botão contra o mesmo tipo de máquina.
   */
  private openCraftMenuAt(wx: number, wy: number): boolean {
    const box = this.getToolboxAt(wx, wy);
    const furnace = box ? undefined : this.getFurnaceAt(wx, wy);
    const prop = box ?? furnace;
    if (!prop) return false;
    const station: CraftStation = box ? 'bench' : 'furnace';
    if (this.orderOverlay) return true;
    // O Z que ABRIU o catálogo pode estar sendo segurado: sem isto o keyup se perde com o painel
    // aberto e a lâmina rodopiante termina de carregar sozinha (a mesma rede do diálogo).
    this.resetChargeAndBuffers();
    this.stopBreathing();
    this.quickBag?.close();
    this.quickBag?.setButtonVisible(false);
    this.actionButtons?.setVisible(false);
    // A tarja de teclas do jogo desaparece, como a bolsa já faz: com o catálogo aberto ela fica
    // MENTINDO ("Z usa o que você segura") por cima de uma tela onde Z prega um plano — e o
    // rodapé do próprio catálogo já diz o que os dois botões fazem ali dentro.
    this.controlsHint?.destroy();
    this.controlsHint = undefined;
    this.orderBox = box;
    getSoundManager().playToolboxOpen();
    this.orderOverlay = new ToolboxOrderOverlay({
      read: () => this.orderCatalogView(station),
      onCraft: (kind) => this.craftAtStation(prop, station, kind as HeldItemKind),
      // A recusa SOA. Ela era só um tranco de 3px numa grade de onze cartas iguais, e um jogador
      // relatou exatamente o que isso vira na prática: "apertei Z e nada aconteceu". Todo o resto
      // do jogo já recusa com este som; a bancada estava calada.
      onRefuse: () => getSoundManager().playToolboxRefuse(),
      onClose: () => this.closeToolboxOrder(),
    }, isTouchDevice());
    return true;
  }

  /**
   * CONSTRUIR NA BANCADA — o gesto que substituiu as duas bandejas.
   *
   * Ele é atômico de propósito: ou os insumos saem da mochila e o produto entra nela no MESMO
   * frame, ou nada acontece. A versão de bandeja cobrava três viagens (largar A, largar B, buscar
   * o produto) por uma decisão que o jogador já tinha tomado ao escolher no menu — e cobrava
   * também o risco de largar um insumo e ser interrompido por um bicho no meio.
   *
   * A bandeja NÃO morreu: ela continua sendo como as MÁQUINAS alimentam a bancada (um braço
   * robótico não abre menu). O que mudou é que ninguém mais é obrigado a usá-la.
   *
   * A conta é feita duas vezes de propósito — uma para decidir, outra para gastar. Entre as duas
   * não há nada que possa mexer na mochila, mas gastar sem reconferir é como se perde item numa
   * refatoração futura, e um item perdido em silêncio é o pior defeito que este jogo pode ter.
   */
  private craftAtStation(
    prop: ToolboxObject | FurnaceObject, station: CraftStation, kind: HeldItemKind,
  ): boolean {
    const recipe = recipeMaking(kind);
    // A ESTACAO E CONFERIDA ANTES DE GASTAR. O painel de cada maquina so lista as receitas dela,
    // entao isto nunca deveria falhar — e e exatamente por isso que fica aqui: no dia em que uma
    // carta aparecer no painel errado, a resposta e uma recusa, e nao a mesa fundindo minerio.
    if (!recipe || recipeStation(recipe) !== station) return false;
    const cost = recipeCost(recipe);
    for (const [ingredient, need] of cost) {
      if (this.inventory.count(ingredient) < need) return false;
    }
    // O FORNO TRABALHA, e enquanto trabalha nao aceita outra fornada: ele tem uma boca so. A
    // recusa e o tranco da carta no catalogo, e ela e honesta — a maquina esta rugindo na tela.
    if (prop instanceof FurnaceObject && prop.isBusy) return false;
    // ONDE A PEÇA VAI PARAR SE DECIDE ANTES DE GASTAR QUALQUER COISA. Sem bancada cheia de itens
    // em volta isto nunca falha; com ela, a alternativa seria consumir o material e não ter onde
    // pousar o produto — e um item perdido em silêncio é o pior defeito que este jogo pode ter.
    //
    // O FORNO não pergunta isso: ele tem uma SAÍDA (o tile da frente), e se ela estiver ocupada
    // quando a fornada terminar ele SEGURA a peça na boca até liberar — a mesma espera que a
    // fornada de bandeja já fazia. Perguntar aqui recusaria uma fornada que a máquina sabe adiar.
    const landing = station === 'bench'
      ? this.deliveryTileAround(prop.worldX, prop.worldY)
      : null;
    if (station === 'bench' && !landing) return false;
    for (const [ingredient, need] of cost) this.inventory.remove(ingredient, need);
    // Nada ENTRA na mochila agora, mas os insumos saíram — e gastar o último de um tipo move a
    // seleção. As costas do herói têm de acompanhar, senão ele carrega o desenho de um item que
    // não tem mais.
    this.updateBackItem();
    const units = recipe.units ?? 1;
    if (prop instanceof FurnaceObject) {
      // A FORNADA É UM PROCESSO, e agora ela acontece na tela inteira: a carga voa da mão do herói
      // para a boca, o fole sopra três vezes sacudindo a alvenaria, a brasa esguicha e só então a
      // peça PULA pela frente da máquina (ver FurnaceObject.startHandSmelt). O item entra no mundo
      // no fim desse ciclo — quem o entrega é o `port.put` do forno, o mesmo da fornada de bandeja.
      const charge: HeldItemKind[] = [];
      for (const [ingredient, need] of cost) {
        for (let i = 0; i < need; i += 1) charge.push(ingredient);
      }
      // Nenhum som sai daqui: a boca pegando fogo tem UMA voz (a do `port.lit`), e ela é a mesma
      // que a fornada de bandeja toca. Dois sons para o mesmo evento na mesma máquina fariam o
      // jogador achar que são duas coisas diferentes acontecendo.
      prop.startHandSmelt(kind, units, charge, [this.playerWorld.worldX, this.playerWorld.worldY]);
    } else {
      // A BANCADA é o oposto e continua sendo: uma martelada é um instante, não um processo. A PEÇA
      // NASCE NO CHÃO, e não na mochila — a mochila era a entrega mais curta possível e por isso
      // mesmo não se via nada: a mesa martelava para ninguém. O item entra no mundo AGORA (o arco é
      // só o desenho por cima), então nem morrer no meio do voo o apaga.
      this.itemManager?.drop(kind, landing![0], landing![1], undefined, undefined, units);
      this.flingCraftedItem(kind, prop.worldX, prop.worldY, landing![0], landing![1]);
      prop.playCraft();
      getSoundManager().playHammer();
      this.time.delayedCall(140, () => getSoundManager().playToolboxDeliver());
    }
    // O item novo se apresenta uma vez, como qualquer outro que o jogador vê pela primeira vez —
    // e ele foi VISTO saindo da máquina, mesmo que ainda não tenha sido apanhado.
    this.seenItems.add(kind);
    this.persistAdventure();
    return true;
  }

  /**
   * ONDE A BANCADA LARGA O QUE ACABOU DE FAZER.
   *
   * Os oito vizinhos da mesa, ordenados pela distância até o HERÓI — **menos o tile em que ele
   * está, que fica por último**. Uma regra só, e ela cai onde a intuição cai: a peça pousa
   * FLANQUEANDO quem pediu (as diagonais da mesa que encostam nele), depois nos lados, e só então
   * atrás do móvel.
   *
   * A exclusão do tile do herói é a parte que se aprendeu olhando: a primeira versão preferia "o
   * lado de quem pediu", e como toda interação acontece de um tile colado na mesa, isso era
   * SEMPRE o tile do próprio herói — a peça pousava debaixo dele, escondida pelo corpo, e o voo
   * inteiro terminava atrás do jogador. Ele continua sendo destino válido, mas em último caso: o B
   * apanha o que está sob os pés, então nada se perde; o que se perde é o de ver onde caiu.
   *
   * Um tile serve quando o herói pode PISAR nele (nada de rio, lava ou corpo sólido — buscar a
   * peça não pode exigir botas) e não tem item nenhum em cima: a lei de um item por tile é
   * absoluta, e empilhar é justamente o que faz uma peça sadia parecer quebrada (já aconteceu
   * duas vezes neste projeto).
   */
  private deliveryTileAround(propX: number, propY: number): [number, number] | null {
    if (!this.itemManager) return null;
    const { worldX: hx, worldY: hy } = this.playerWorld;
    const around: Array<[number, number]> = [];
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oy = -1; oy <= 1; oy += 1) {
        if (ox === 0 && oy === 0) continue;
        around.push([propX + ox, propY + oy]);
      }
    }
    const rank = ([x, y]: [number, number]): number => (
      x === hx && y === hy ? Number.MAX_SAFE_INTEGER : (x - hx) ** 2 + (y - hy) ** 2
    );
    around.sort((a, b) => rank(a) - rank(b));
    for (const [x, y] of around) {
      if (this.isSolidForEntities(x, y) || this.itemManager.hasItemAt(x, y)) continue;
      return [x, y];
    }
    return null;
  }

  /**
   * O VOO — um fantasma da peça saltando da bancada até o tile em que ela já caiu.
   *
   * É um billboard descartável, e não o item de verdade, porque o `ItemPickup` é dono da posição
   * dele (o `render` reescreve elevação todo frame, e o aro roxo mais as cópias de contorno viajam
   * junto): mexer nele por fora seria arranhar estado que o próprio dono reescreve no frame
   * seguinte — a armadilha do `apply()` que este projeto já documentou.
   *
   * A duração casa com o fade-in do item real (200ms): o fantasma pousa no instante em que a peça
   * de verdade termina de aparecer, então a leitura é UMA coisa voando, nunca duas.
   */
  private flingCraftedItem(
    kind: HeldItemKind, fromX: number, fromY: number, toX: number, toY: number,
  ): void {
    const w3 = this.world3d;
    const visual = ITEM_VISUAL_2D[kind];
    if (!w3 || !visual) return;
    const ghost = w3
      .addBillboard(visual.texture, visual.frame, { emissive: true, depthLayer: 'ground' })
      .setPosition(fromX, fromY)
      .setDisplaySize(0.5, 0.5)
      .setElevation(0.32);
    // O ARCO é a elevação, nunca a escala: crescer uma arte de pixel para fingir altura é a coisa
    // que este jogo proíbe em todo lugar. Sobe num tween e cai no outro, que é o que dá o peso.
    this.tweens.add({
      targets: ghost, x: toX, y: toY, duration: 200, ease: 'Quad.easeOut',
      onComplete: () => ghost.destroy(),
    });
    this.tweens.add({
      targets: ghost, elevation: 0.62, duration: 100, ease: 'Quad.easeOut', yoyo: true,
    });
  }

  private closeToolboxOrder(): void {
    this.orderOverlay = undefined;
    this.orderBox = undefined;
    this.quickBag?.setButtonVisible(true);
    this.actionButtons?.setVisible(true);
  }

  /**
   * O CATÁLOGO — o que a bancada já fez, mais UMA coisa nova.
   *
   * Ele mostrava TUDO desde o primeiro segundo, e a intenção era boa: "a lista é a lista de
   * ambições, e esconder uma receita por falta de material é o erro do Terraria — quem não carrega
   * o material nunca descobre que a coisa existe". O efeito medido foi outro. Onze cartas de uma
   * vez não são ambição, são uma parede: o jogador que acabou de fazer o primeiro forno não
   * precisa saber que existe extrator, precisa saber QUAL É O PRÓXIMO PASSO.
   *
   * Então a mesa passou a mostrar o mínimo para continuar (`catalogSteps`): os degraus que ele já
   * cumpriu, e o primeiro que falta. A promessa de que nada fica escondido continua de pé — só que
   * agora ela é cumprida ao longo do tempo, um degrau de cada vez, em vez de tudo na primeira
   * abertura. E cada carta visível é LEGÍVEL: arte, nome e os dois insumos.
   *
   *   • `next`   — esta é a carta nova, o degrau que a escada está oferecendo agora.
   *   • `ready`  — os dois insumos estão na mochila agora.
   *   • `have`   — por insumo, e comparado com `need` (o `iron+iron` pede dois).
   */
  private orderCatalogView(station: CraftStation = 'bench'): OrderCatalogView {
    const goal = nextStep(station, this.seenItems);
    const entries = catalogSteps(station, this.seenItems).map((recipe) => {
      const cost = recipeCost(recipe);
      const needs = [...cost.entries()].map(([kind, need]) => {
        const visual = ITEM_VISUAL_2D[kind];
        return {
          kind,
          icon: spriteDataUrl(this, visual.texture, visual.frame),
          label: t(`items.name.${kind}`),
          need,
          have: this.inventory.count(kind),
          // A bancada faz este insumo? E o que separa "procure no mundo" de "e aqui mesmo".
          craftable: isCraftable(kind),
        };
      });
      const visual = ITEM_VISUAL_2D[recipe.output];
      return {
        kind: recipe.output,
        icon: spriteDataUrl(this, visual.texture, visual.frame),
        label: t(`items.name.${recipe.output}`),
        family: recipe.family,
        // Tudo que a mesa mostra agora é legível — a silhueta cinza existia para uma lista de onze
        // cartas em que a maioria era desconhecida, e essa lista não existe mais.
        known: true,
        next: recipe.output === goal,
        ready: needs.every((n) => n.have >= n.need),
        needs,
      };
    });
    const forno = station === 'furnace';
    return {
      entries,
      title: t(forno ? 'toolbox.titleFurnace' : 'toolbox.title'),
      foot: t(forno ? 'toolbox.keysFurnace' : 'toolbox.keys'),
      footTouch: t(forno ? 'toolbox.keysTouchFurnace' : 'toolbox.keysTouch'),
    };
  }

  private getWoodenCrateAt(wx: number, wy: number): WoodenCrateObject | undefined {
    return this.propAt(this.woodenCrates, wx, wy);
  }

  private getWaterWheelAt(wx: number, wy: number): WaterWheelObject | undefined {
    return this.propAt(this.waterWheels, wx, wy);
  }

  private getBoilerAt(wx: number, wy: number): BoilerObject | undefined {
    return this.propAt(this.boilers, wx, wy);
  }

  private getElectronicGateAt(wx: number, wy: number): ElectronicGateObject | undefined {
    return this.propAt(this.electronicGates, wx, wy);
  }

  private getBeltAt(wx: number, wy: number): BeltObject | undefined {
    return this.propAt(this.belts, wx, wy);
  }

  private getChestAt(wx: number, wy: number): ChestObject | undefined {
    return this.propAt(this.chests, wx, wy);
  }

  private getExtractorAt(wx: number, wy: number): ExtractorObject | undefined {
    return this.propAt(this.extractors, wx, wy);
  }

  private getFurnaceAt(wx: number, wy: number): FurnaceObject | undefined {
    return this.propAt(this.furnaces, wx, wy);
  }

  private getTripHammerAt(wx: number, wy: number): TripHammerObject | undefined {
    return this.propAt(this.tripHammers, wx, wy);
  }

  /**
   * Ha QUALQUER peca de rede neste tile? A pergunta existe porque duas delas — o cabo e a
   * esteira — nao sao solidas (o heroi pisa nelas de proposito), entao `isTileOccupied` responde
   * `false` sobre um tile que ja tem maquina. Uma pergunta so, para a construcao e para o
   * restore do save nao poderem discordar sobre o que e "ocupado por uma maquina".
   */
  private machineAt(wx: number, wy: number): boolean {
    return this.getBoilerAt(wx, wy) !== undefined
      || this.getWaterWheelAt(wx, wy) !== undefined
      || this.getPressurePlateAt(wx, wy) !== undefined
      || this.getInserterAt(wx, wy) !== undefined
      || this.getElectronicGateAt(wx, wy) !== undefined
      || this.getBeltAt(wx, wy) !== undefined
      || this.getChestAt(wx, wy) !== undefined
      || this.getExtractorAt(wx, wy) !== undefined
      || this.getFurnaceAt(wx, wy) !== undefined
      || this.getTripHammerAt(wx, wy) !== undefined
      || this.wires.some((w) => w.worldX === wx && w.worldY === wy);
  }

  private getLevelPortalAt(wx: number, wy: number): LevelPortalObject | undefined {
    return this.propAt(this.levelPortals, wx, wy);
  }

  private getPressurePlateAt(wx: number, wy: number): PressurePlateObject | undefined {
    return this.propAt(this.pressurePlates, wx, wy);
  }

  /**
   * The plates an undead may fixate on. A skull is DRAWN to a pressure plate — it wants to stand
   * on it — so the plate becomes a switch the player throws by leading a monster onto it instead
   * of spending his one hand on a crate. See UndeadEnemy.setPlateTarget.
   *
   * Two plates are not on offer, and both for the same reason — a balloon over a creature's head
   * is a promise, and a promise it cannot keep is worse than no balloon at all:
   *  - one standing in campfire light: the undead refuse to enter it (same rule that governs
   *    every other step they take), so that march could never end;
   *  - one already carrying a crate: the tile is blocked and the plate is pressed anyway.
   * The HERO standing on a plate is NOT a disqualifier — he walks off, and dropping the fixation
   * every time he crosses would make the skull dither in the middle of the room.
   */
  private lurablePlates(): Array<{ worldX: number; worldY: number }> {
    if (!this.pressurePlates.length) return [];
    return this.pressurePlates
      .filter((plate) => !this.isTileLitByCampfire(plate.worldX, plate.worldY)
        && !this.getWoodenCrateAt(plate.worldX, plate.worldY)
        && !this.isSolidForEntities(plate.worldX, plate.worldY))
      .map((plate) => ({ worldX: plate.worldX, worldY: plate.worldY }));
  }

  private getPlantSpotAt(wx: number, wy: number): PlantSpotObject | undefined {
    return this.propAt(this.plantSpots, wx, wy);
  }

  private getLavaAt(wx: number, wy: number): LavaObject | undefined {
    return this.propAt(this.lavaTiles, wx, wy);
  }

  private getWaterAt(wx: number, wy: number): WaterObject | undefined {
    return this.propAt(this.waterTiles, wx, wy);
  }

  /**
   * O QUE PARA UMA BALA — e ela nao e "o que para um corpo menos os hazards", que foi o erro.
   *
   * `isSolidForEntities(.., hazardsPassable)` perdoa os PROPS de hazard (rio e lava autorados), e
   * com isso a bala atravessava o rio de um level. Mas metade da agua deste jogo nao e prop nenhum:
   * o overworld escreve rio, lago e oceano no TERRENO (SEA_TILE_FRAMES, que esta dentro de
   * SOLID_GROUND_FRAMES). Resultado do bug: um zora nascido num lago pintado matava o proprio cuspe
   * no tile em que estava — o tiro morria antes do primeiro passo, e o bicho "nao fazia nada".
   *
   * Entao a regra do tiro se escreve sozinha: **para o que atravanca um VOO** — colisao pintada,
   * tile de pe (arvore, montanha, alvenaria), prop solido e corpo de NPC — e ignora o que so
   * atravanca PE: agua, lava, buraco. Fora do mundo tambem para, senao a bala sai do mapa e viaja
   * pelo vazio ate o TTL.
   */
  private isShotBlockedAt(wx: number, wy: number): boolean {
    const chunkX = Math.floor(wx / CHUNK_COLUMNS);
    const chunkY = Math.floor(wy / CHUNK_ROWS);
    if (this.chunkManager?.hasChunkCoordinate(chunkX, chunkY) !== true) return true;
    const tile = this.chunkManager.getTile(wx, wy);
    if (tile.collision) return true;
    if (tile.upper !== null && SOLID_UPPER_FRAMES.has(tile.upper)) return true;
    for (const entry of this.propRegistry) {
      if (entry.hazard) continue; // rio e lava nao param bala
      if (this.propAt(entry.list, wx, wy)?.blocking) return true;
    }
    return this.npcManager?.hasNpcAt(wx, wy) === true;
  }

  /**
   * AGUA ABERTA — a agua que ainda e agua, e a unica coisa que o zora chama de casa.
   *
   * Ela tem DUAS procedencias neste jogo, e essa e a pegadinha: o `water` PROP (WaterObject), que e
   * como um level autora um rio, e o TILE DE TERRENO (SEA_TILE_FRAMES), que e como o gerador do
   * overworld escreve toda agua que existe — rio, lago e oceano saem do mesmo frame. Um zora que so
   * enxergasse prop ficaria mudo em cima de qualquer lago do mundo grande, que foi exatamente o
   * defeito que este metodo conserta.
   *
   * A ordem importa: se ha prop, e ELE quem responde — uma ponte, um vau de pedra ou um canal
   * drenado deixam de ser casa mesmo com agua pintada por baixo. E dessa assimetria sai uma
   * consequencia de design que vale dizer em voz alta: **num rio-prop o jogador tem resposta**
   * (tapar, vadear, drenar), **na agua pintada e no mar, nao** — e ali o zora e tao inegociavel
   * quanto o Zola do Zelda, o que e justo, porque aquilo e a moldura do mundo e nao uma sala.
   */
  private isOpenWaterAt(wx: number, wy: number): boolean {
    const prop = this.getWaterAt(wx, wy);
    if (prop) return prop.blocking;
    // FORA DO MUNDO tambem e o frame do mar (WorldData.VOID_GROUND_FRAME = SEA_TILE_FRAME: e assim
    // que o mapa finito ganha borda dura). Sem este teste, um zora autorado perto da beirada
    // emergiria em coordenada inexistente — vivo, atirando, num lugar onde a camera nunca vai.
    const chunkX = Math.floor(wx / CHUNK_COLUMNS);
    const chunkY = Math.floor(wy / CHUNK_ROWS);
    if (this.chunkManager?.hasChunkCoordinate(chunkX, chunkY) !== true) return false;
    const ground = this.chunkManager.getTile(wx, wy).ground;
    return SEA_TILE_FRAMES.includes(ground);
  }

  /**
   * Everything a walking entity (hero or enemy) cannot step onto: authored terrain collision
   * and trees (via ChunkManager.isCellBlocked), every registered prop whose `blocking` says so
   * (see WorldProp/propRegistry), NPCs — and the two hazard tiles (lava, water), unless the
   * caller can wade them (hero wearing the lava boots; enemies never can). The hero adds
   * enemies on top (to attack them).
   */
  private isSolidForEntities(wx: number, wy: number, hazardsPassable = false): boolean {
    if (this.chunkManager?.isCellBlocked(wx, wy)) return true;
    for (const entry of this.propRegistry) {
      if (entry.hazard && hazardsPassable) continue;
      if (this.propAt(entry.list, wx, wy)?.blocking) return true;
    }
    if (this.npcManager?.hasNpcAt(wx, wy)) return true;
    return false;
  }

  // Distance to the nearest LIT campfire. Dead fires give no safety, no light and don't repel
  // the undead — they are just cold obstacles until the hero brings a flame.
  private distToNearestCampfireTiles(wx: number, wy: number): number {
    let best = Infinity;
    for (const cf of this.campfires) {
      if (!cf.isLit) continue;
      best = Math.min(best, Math.hypot(cf.worldX - wx, cf.worldY - wy));
    }
    return best;
  }

  /** The nearest LIT campfire (no radius cap) — the fire that is healing/calling the hero. */
  private nearestLitCampfire(wx: number, wy: number): CampfireObject | undefined {
    let best: CampfireObject | undefined;
    let bestD = Infinity;
    for (const cf of this.campfires) {
      if (!cf.isLit) continue;
      const d = Math.hypot(cf.worldX - wx, cf.worldY - wy);
      if (d < bestD) { bestD = d; best = cf; }
    }
    return best;
  }

  /**
   * Este tile está DENTRO da luz de uma fogueira acesa? Ele já foi a parede que repelia todo
   * monstro; hoje responde por duas coisas só (ver LIGHT_RADIUS_TILES): onde uma cova ou o cerco
   * NÃO abrem, e a placa de pressão que a caveira se recusa a caçar. Quem empurra corpo agora é o
   * CALOR, e ele tem raio próprio — `isTileScorchedByCampfire`.
   */
  private isTileLitByCampfire(wx: number, wy: number): boolean {
    return this.distToNearestCampfireTiles(wx, wy) <= LIGHT_RADIUS_TILES;
  }

  /**
   * O CALOR: este tile está a dois tiles ou menos de uma fogueira ACESA? Ali o corpo pega fogo e
   * perde vida enquanto ficar (ver EnemyBase.tickScorch e CAMPFIRE_SCORCH_RADIUS_TILES).
   *
   * Ele era uma coroa FORA da parede de luz — a parede caiu, e o calor virou a única coisa que a
   * fogueira faz a um monstro. Duas tiles é o anel colado na lenha: perto o bastante para ser uma
   * decisão de quem chega, longe o bastante para não pegar quem passa.
   *
   * Lê da MESMA distância que a luz (só fogueira ACESA conta), porque as duas são a mesma pergunta
   * feita a dois raios: com uma segunda fonte de verdade, apagar uma fogueira deixaria de esfriar
   * o anel dela.
   */
  private isTileScorchedByCampfire(wx: number, wy: number): boolean {
    return this.distToNearestCampfireTiles(wx, wy) <= CAMPFIRE_SCORCH_RADIUS_TILES;
  }

  // A skull can rise only on an open, dark tile that nothing occupies — and only where it
  // could actually WALK to the hero (same 4-dir moves and blockers it hunts by). A skull
  // born across a river or behind a rock wall would just pace its pocket, menacing nobody.
  private canSpawnUndeadAt(wx: number, wy: number): boolean {
    if (this.isSolidForEntities(wx, wy)) return false;
    if (this.isTileLitByCampfire(wx, wy)) return false;
    if (this.enemyManager?.getEnemyAt(wx, wy)) return false;
    if (wx === this.playerWorld.worldX && wy === this.playerWorld.worldY) return false;
    return this.undeadReachableTiles().has(`${wx},${wy}`);
  }

  /**
   * O mesmo teste para uma COVA AUTORADA, menos a alcancabilidade — e essa subtracao e a peca.
   * `undeadReachableTiles` e um flood-fill a partir do HEROI, limitado ao anel do cerco + 3, e
   * existe porque o cerco escolhe o tile na hora e nao pode escolher um bolsao. Uma cova nao
   * escolhe nada: o autor ja escolheu, e cobrar dela um alcance medido em volta do heroi
   * reprovaria toda cova a mais de 10 tiles — ou seja, quase todas. O editor avisa no Salvar
   * quando o tile esta bloqueado; o resto e responsabilidade de quem autorou.
   *
   * O que FICA e o que tambem vale pro heroi ou pra qualquer corpo: tile solido, corpo em cima e
   * — a regra do mundo, nao deste sistema — LUZ DE FOGUEIRA. Monstro nao existe na luz, entao uma
   * cova acesa fica calada, e isso e jogo: acender a fogueira do corredor CALA a cova dele,
   * enquanto ela estiver acesa. E a mesma alavanca do balde e da tocha, sem uma linha nova. Vale
   * pra TODA especie, inclusive a maquina: a luz e a lei do mundo sobre onde monstro pode existir,
   * e uma excecao aqui tiraria do jogador a unica alavanca que ele tem sobre uma cova.
   *
   * A unica coisa que a especie muda e o CHAO, e ela muda de tres maneiras:
   *
   *   - quem anda recusa rio e lava (o caso normal);
   *   - quem VOA os aceita (FLYING_ENEMY_KINDS);
   *   - quem e AQUATICO inverte a pergunta (AQUATIC_ENEMY_KINDS): o zora so nasce em agua ABERTA, e
   *     terra seca e que e o tile impossivel pra ele. Agua com ponte, com vau ou drenada nao conta —
   *     e por isso que tapar o rio tira o bicho de la, sem uma regra nova pra isso.
   *
   * `kind` e opcional porque o slime grande usa este mesmo teste pros filhotes dele, que sao sempre
   * gosma de chao.
   */
  private canSpawnAuthoredEnemyAt(wx: number, wy: number, kind?: EnemyKind): boolean {
    if (kind !== undefined && AQUATIC_ENEMY_KINDS.has(kind)) {
      if (!this.isOpenWaterAt(wx, wy)) return false;
      if (this.enemyManager?.getEnemyAt(wx, wy)) return false;
      return !this.isTileLitByCampfire(wx, wy);
    }
    const flies = kind !== undefined && FLYING_ENEMY_KINDS.has(kind);
    if (this.isSolidForEntities(wx, wy, flies)) return false;
    if (this.isTileLitByCampfire(wx, wy)) return false;
    if (this.enemyManager?.getEnemyAt(wx, wy)) return false;
    return !(wx === this.playerWorld.worldX && wy === this.playerWorld.worldY);
  }

  /**
   * Every tile an undead could walk to the hero from: a flood-fill out from the hero's tile
   * over undead-passable ground (not solid — the exact blockers they move by; a luz deixou de ser
   * um deles, entao um caminho que passa raspando numa fogueira agora conta),
   * bounded a few tiles past the spawn ring so a path may detour around a short wall. Other
   * undead are ignored: they move, so they never permanently seal a path. Memoised per frame
   * — the director probes up to 14 candidate tiles per spawn tick, and each probe must cost
   * a set lookup, not its own flood.
   */
  private undeadReachableTiles(): Set<string> {
    const frame = this.game.loop.frame;
    if (frame === this.reachableFrame) return this.reachableTiles;
    this.reachableFrame = frame;
    this.reachableTiles.clear();

    const px = this.playerWorld.worldX;
    const py = this.playerWorld.worldY;
    const maxR = RING_MAX_TILES + 3;
    const queue: Array<readonly [number, number]> = [[px, py]];
    this.reachableTiles.add(`${px},${py}`);
    for (let head = 0; head < queue.length; head++) {
      const [cx, cy] = queue[head];
      for (const [ox, oy] of CARDINAL_DIRS) {
        const nx = cx + ox;
        const ny = cy + oy;
        if (Math.abs(nx - px) > maxR || Math.abs(ny - py) > maxR) continue;
        const key = `${nx},${ny}`;
        if (this.reachableTiles.has(key)) continue;
        if (this.isSolidForEntities(nx, ny)) continue;
        this.reachableTiles.add(key);
        queue.push([nx, ny]);
      }
    }
    return this.reachableTiles;
  }

  // ── OS DOIS BOTOES ─────────────────────────────────────────────────────────

  /**
   * Liga A e B. No teclado sao Z/J/espaco (o golpe) e X/K (o item) — o par do NES nas teclas
   * que a mao esquerda alcanca sem largar as setas. `addCapture` existe por causa do espaco:
   * sem ele a pagina rola um pouco a cada golpe.
   *
   * Por EVENTO e nao por `JustDown` dentro do update: este update tem meia duzia de portas por
   * onde sai mais cedo (dialogo, loja, cutscene, hitstop), e uma tecla lida por polling morre
   * em todas elas — ou pior, fica guardada e dispara sozinha no frame em que o dialogo fecha.
   */
  private installActionInput(): void {
    const touch = isTouchDevice();
    // A BOLSA nasce antes das teclas porque as teclas perguntam por ela: com a bolsa aberta, o I,
    // as setas e o X sao DELA, e so voltam a ser do heroi quando ela fecha (ver `routeBagKey`).
    this.quickBag = new QuickBag({
      read: () => this.quickBagView(),
      onSet: (kind) => { this.selectItem(kind as HeldItemKind); },
      onToggleRequest: () => this.toggleBag(),
      onOpenChange: (open) => this.onBagOpenChanged(open),
    }, touch);

    const kb = this.input.keyboard;
    if (kb) {
      kb.addCapture(['Z', 'X', 'J', 'K', 'SPACE', 'I']);
      // O A tem DOIS gestos agora — o toque (o golpe) e o segurar (a lamina rodopiante) —, entao
      // ele precisa do `keyup` tambem. O `keydown` de uma tecla segurada REPETE no navegador; o
      // `attackHeld` e o que separa "apertei de novo" de "ainda estou segurando".
      for (const key of ['keydown-Z', 'keydown-J', 'keydown-SPACE']) kb.on(key, this.pressAttack, this);
      for (const key of ['keyup-Z', 'keyup-J', 'keyup-SPACE']) kb.on(key, this.releaseAttack, this);
      for (const key of ['keydown-X', 'keydown-K']) kb.on(key, this.pressUse, this);
      // I ABRE E FECHA A BOLSA. Ela e o unico gesto do jogo que nao e A, B nem seta — e nao e
      // excecao a "os dois botoes": a bolsa nao age no mundo, ela so decide o que o B carrega.
      kb.on('keydown-I', this.toggleBag, this);
      // As setas so chegam aqui quando a bolsa esta aberta; fora dela quem as le e o andar, por
      // polling, e este ouvinte devolve sem tocar em nada.
      for (const key of ['keydown-LEFT', 'keydown-A']) {
        kb.on(key, (e: KeyboardEvent) => this.routeBagStep(e, -1));
      }
      for (const key of ['keydown-RIGHT', 'keydown-D']) {
        kb.on(key, (e: KeyboardEvent) => this.routeBagStep(e, 1));
      }
      kb.on('keydown-ENTER', () => { if (this.quickBag?.isOpen) this.quickBag.commit(); });
    }
    // No telefone os dois botoes precisam de corpo; no teclado basta dizer uma vez quais sao as
    // teclas — e a tarja some sozinha (ver ControlsHint).
    if (touch) {
      this.actionButtons = new ActionButtons({
        onAttack: () => this.pressAttack(),
        onAttackRelease: () => this.releaseAttack(),
        onUse: () => this.pressUse(),
      });
    } else {
      this.controlsHint = new ControlsHint(t('controls.hint'));
    }
  }

  /** A seta, com a bolsa aberta: ela anda com o CURSOR e nao com o herói (que está de pés presos). */
  private routeBagStep(event: KeyboardEvent | undefined, delta: number): void {
    if (!this.quickBag?.isOpen) return;
    // Tecla segurada repete no navegador — e uma fileira de itens percorrida a 30 passos por
    // segundo não é uma escolha. A mesma leitura do `pressAttack`: `event.repeat`, nunca um
    // booleano nosso, que um `keyup` perdido deixaria preso.
    if (event?.repeat) return;
    this.quickBag.step(delta);
  }

  /**
   * A BOLSA ABRE E FECHA — e nada mais no jogo faz isso.
   *
   * Ela recusa exatamente onde o menu de pausa recusa: nenhuma tela que já congelou o mundo pode
   * ganhar uma segunda por cima (o diálogo, a loja, a cutscene, a morte, a própria pausa). Fora
   * disso ela abre SEM pedir licença ao combate — é o ponto do modo.
   */
  private toggleBag(): void {
    if (!this.quickBag) return;
    if (this.quickBag.isOpen) { this.quickBag.close(); return; }
    if (this.pauseMenu || this.dialogOpen || this.camShifting
      || this.itemGetOpen || this.levelIntroOpen || this.cutsceneActive || this.isDead
      || this.levelTransitioning || this.orderOverlay) return;
    this.quickBag.openBag();
  }

  /**
   * O PREÇO DE FOLHEAR, num jogo que não pausa para você folhear: os pés presos (as setas são do
   * cursor agora) e os dois botões calados (`canAct`) — o par A/B do toque sai da tela junto, para
   * que só exista um conjunto de controles de cada vez.
   *
   * A carga do A morre ao abrir, pela mesma razão que morre na pausa: um A meio carregado que
   * atravessasse a bolsa sairia sozinho, como lâmina rodopiante, no frame em que ela fechasse. O
   * ATORDOAMENTO, ao contrário da pausa, ATRAVESSA — a bolsa não congela nada, e apagar a pancada
   * que o herói acabou de levar seria comprar tempo de recuperação abrindo um menu.
   */
  private onBagOpenChanged(open: boolean): void {
    this.movementController?.hold(open);
    this.actionButtons?.setVisible(!open);
    if (!open) return;
    // A tarja das teclas mora no MESMO rodapé da tela que a bolsa, e ela já cumpriu o trabalho
    // dela: quem abriu a bolsa aprendeu o que ela tinha a ensinar (ver ControlsHint).
    this.controlsHint?.destroy();
    this.controlsHint = undefined;
    this.attackBufferMs = 0;
    this.useBufferMs = 0;
    this.attackHeld = false;
    this.chargeMs = 0;
    this.chargeReady = false;
    this.chargeMoteMs = 0;
    getSoundManager().stopSpinChargeHum();
  }

  /**
   * O que a bolsa desenha: a mochila com a ARTE DO JOGO (os mesmos frames virados em data URL que
   * a subtela usa) e o item que o B carrega AGORA — o cursor é da bolsa, o equipado é da cena.
   */
  private quickBagView(): QuickBagView {
    const row = (entry: { kind: HeldItemKind; count: number }) => {
      const visual = ITEM_VISUAL_2D[entry.kind];
      return {
        kind: entry.kind,
        count: entry.count,
        icon: spriteDataUrl(this, visual.texture, visual.frame),
        label: t(`items.name.${entry.kind}`),
      };
    };
    return {
      items: this.inventory.bag().map(row),
      // A MATÉRIA-PRIMA não entra na fileira: ela é uma linha de contadores embaixo, sem cursor.
      // Ver MATERIAL_ITEM_KINDS — o que não tem gesto não pode ocupar um slot do botão X.
      materials: this.inventory.materials().map(row),
      equipped: this.heldItem,
      emptyLabel: t('bag.empty'),
    };
  }

  /**
   * Toda tela que congela o jogo congela tambem os dois botoes. O teclado ja para sozinho com
   * `scene.pause()` (o plugin do Phaser fica inativo junto com a cena), mas os botoes de toque
   * sao DOM e continuam clicaveis — entao a porta tem de estar aqui, e nao so na tecla.
   */
  private canAct(): boolean {
    // O ATORDOAMENTO NÃO ENTRA AQUI, de propósito — ele é uma CADÊNCIA, não uma porta fechada.
    //
    // Esta função separa "o jogo não está jogando agora" (diálogo, loja, morte, menu) de tudo o
    // mais, e o que ela recusa é DESCARTADO. Um botão apertado no fim de um atordoamento tem de
    // sair no instante em que ele acaba, que é exatamente o que o buffer existe para fazer (ver
    // ACTION_BUFFER_MS: "o jogador que encadeia dois golpes no ritmo certo era punido por acertar
    // o ritmo"). Então o atordoamento mora junto da cadência, em `swingAttack`/`pressUse`, onde o
    // pedido é ADIADO — e o herói continua perdendo os 240ms, só não perde o aperto.
    //
    // A BOLSA entra aqui e NÃO é uma tela congelada como as outras: o mundo continua correndo
    // atrás dela. O que ela fecha são os dois botões — as mãos estão dentro da mochila —, e é
    // isso, com os pés presos, que faz folhear custar alguma coisa.
    return !this.isDead && !this.dialogOpen && !this.camShifting
      && !this.itemGetOpen && !this.cutsceneActive && !this.levelIntroOpen
      && !this.levelTransitioning && !this.pauseMenu && this.quickBag?.isOpen !== true
      && !this.chunkPurchaseOverlay && !this.orderOverlay
      && this.movementController !== undefined;
  }

  /**
   * Gasta os pedidos guardados. Um A ou um B apertado durante a cadencia (ou durante o hitstop,
   * que congela o update inteiro) espera aqui e sai no instante em que a cadencia libera — e a
   * espera tem prazo, senao um botao apertado ha meio segundo dispararia sozinho e o jogador
   * levaria um golpe que nao pediu. Ver ACTION_BUFFER_MS.
   */
  private spendActionBuffers(delta: number): void {
    // Com a bolsa aberta ninguém gasta nada: o B ali dentro CONFIRMA um item (ver `pressUse`), e
    // um pedido guardado saindo por este caminho equiparia o cursor sem o jogador ter pedido.
    if (this.quickBag?.isOpen) return;
    // O atordoamento adia o GASTO, nunca a contagem — e a diferenca importa nos dois sentidos. Se
    // a janela congelasse junto, um aperto feito antes da pancada sairia 240ms depois, que e um
    // golpe que o jogador ja nao pediu (o buffer e curto justamente pra isso nao acontecer). E o
    // gasto PRECISA ser barrado aqui e nao so la dentro: `swingAttack` re-arma o buffer quando
    // recusa, entao chama-lo todo frame durante o atordoamento manteria a janela viva pra sempre.
    const busy = this.playerStaggerMs > 0;
    if (this.attackBufferMs > 0) {
      this.attackBufferMs = Math.max(0, this.attackBufferMs - delta);
      if (this.attackBufferMs > 0 && this.attackCooldownMs <= 0 && !busy) this.swingAttack();
    }
    if (this.useBufferMs > 0) {
      this.useBufferMs = Math.max(0, this.useBufferMs - delta);
      if (this.useBufferMs > 0 && this.useCooldownMs <= 0 && !busy) this.pressUse();
    }
  }

  /**
   * A carga da lamina rodopiante, enquanto o A esta segurado. Quando ela FICA pronta o jogo tem
   * de dizer — um gesto que so existe se voce adivinhar quando ele existe nao existe. O aviso e
   * um sino curto no instante em que carrega, e depois faiscas subindo do heroi enquanto durar:
   * a mesma gramatica das brasas que a fogueira manda quando cura, e nenhuma luz nova (a lei mais
   * cara da casa — uma luz THREE em runtime recompila todo shader do mundo).
   */
  private tickSpinCharge(delta: number): void {
    if (!this.attackHeld) return;
    // A carga não pergunta mais o que está na bolsa: o Z é a espada em qualquer circunstância,
    // então segurá-lo é sempre carregar a lâmina (ver swingAttack).
    const wasTelling = this.chargeMs >= SPIN_CHARGE_TELL_MS;
    this.chargeMs += delta;
    if (!this.chargeReady && this.chargeMs >= SPIN_CHARGE_MS) {
      this.chargeReady = true;
      this.chargeMoteMs = SPIN_READY_MOTE_MS;
      getSoundManager().stopSpinChargeHum(); // o sino assume; o zumbido nao pode sobrar por baixo
      getSoundManager().playSpinReady();
    }
    if (!this.chargeReady) {
      // A CARGA EM CURSO (ver SPIN_CHARGE_TELL_MS): passado o limiar de toque, faiscas ralas e
      // fracas que engrossam ate o sino — a mesma gramatica das prontas, em intensidade crescente,
      // para que "carregando" e "carregada" sejam a mesma frase em dois volumes. O zumbido nasce
      // junto e ja sabe quando morrer (a duracao vai no start), entao um update congelado por
      // hitstop nao o deixa subindo para sempre.
      if (this.chargeMs >= SPIN_CHARGE_TELL_MS) {
        if (!wasTelling) getSoundManager().startSpinChargeHum(SPIN_CHARGE_MS - SPIN_CHARGE_TELL_MS);
        const t = Math.min(1, (this.chargeMs - SPIN_CHARGE_TELL_MS) / (SPIN_CHARGE_MS - SPIN_CHARGE_TELL_MS));
        this.chargeMoteMs += delta;
        if (this.chargeMoteMs >= 240 - 130 * t) {
          this.chargeMoteMs = 0;
          this.spawnChargeMote(0.35 + 0.55 * t);
        }
      }
      return;
    }
    this.chargeMoteMs += delta;
    if (this.chargeMoteMs >= SPIN_READY_MOTE_MS) {
      this.chargeMoteMs = 0;
      this.spawnChargeMote();
    }
  }

  /** Nenhum pedido e nenhuma carga atravessa um restart, uma morte ou uma troca de level. */
  private resetChargeAndBuffers(): void {
    this.attackBufferMs = 0;
    this.useBufferMs = 0;
    this.attackHeld = false;
    this.chargeMs = 0;
    this.chargeReady = false;
    this.chargeMoteMs = 0;
    getSoundManager().stopSpinChargeHum(); // a carga morreu; o som dela nao pode sobreviver
    // Nem o atordoamento atravessa uma morte ou um recomeço: o herói do run seguinte nasceria sem
    // conseguir apertar nada, e a causa estaria num golpe que ele levou na partida anterior.
    this.playerStaggerMs = 0;
    this.creatureTurnGraceUntilMs = 0;
    this.creatureTurnGraceOn = undefined;
    this.swingLungeTween?.stop();
    this.swingLungeTween = undefined;
    this.hero.lungeX = 0;
    this.hero.lungeY = 0;
    this.hero.attackMs = 0; // nem a pose do golpe atravessa uma morte ou um recomeço
  }

  /**
   * ONDE O HEROI ESTA DESENHADO, em tiles fracionarios — que durante um passo NAO e o tile logico.
   *
   * A posicao logica pula para o tile de destino no instante em que o passo comeca (e tem de
   * pular: o telegrafo do bicho trava naquele tile e a esquiva e decidida contra ele), mas o corpo
   * na tela ainda esta atras, deslizando. Todo efeito preso ao HEROI tem de sair daqui — o
   * `swingAnchor` ja fazia isso para o arco, e as faiscas de carga e o anel do giro nao faziam:
   * carregar andando punha o brilho ate um tile a frente de quem estava brilhando.
   */
  private heroVisualTile(): { x: number; y: number } {
    return this.movementController?.visualWorld(this.playerWorld.worldX, this.playerWorld.worldY)
      ?? { x: this.playerWorld.worldX, y: this.playerWorld.worldY };
  }

  /**
   * Uma faisca dourada subindo do heroi: a lamina esta carregada e o jogador tem de ver isso.
   * `intensity` < 1 e a carga EM CURSO (ver tickSpinCharge): a mesma faisca, menor e mais palida,
   * crescendo com o progresso — nunca uma segunda linguagem para o mesmo gesto.
   */
  private spawnChargeMote(intensity = 1): void {
    const w3 = this.world3d;
    if (!w3) return;
    const { x: worldX, y: worldY } = this.heroVisualTile();
    const mote = w3
      .addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 2 })
      .setTint(0xffe9a8)
      .setPosition(worldX + (Math.random() - 0.5) * 0.7, worldY + (Math.random() - 0.5) * 0.5)
      .setElevation(0.1)
      .setDisplaySize(0.07 + 0.06 * intensity, 0.07 + 0.06 * intensity)
      .setAlpha(0.35 + 0.55 * intensity);
    this.tweens.add({
      targets: mote,
      elevation: 0.55 + Math.random() * 0.35,
      alpha: 0,
      scaleX: 0.4,
      scaleY: 0.4,
      duration: 280 + Math.random() * 160,
      ease: 'Sine.easeOut',
      onComplete: () => mote.destroy(),
    });
  }

  /**
   * A CARGA MORRENDO (ver spinAttack): as mesmas faiscas douradas, agora apagadas e CAINDO — o
   * inverso exato da subida que a carga desenhou. Subir e carregar; cair e o que sobrou dela.
   */
  private spawnChargeFizzle(): void {
    const w3 = this.world3d;
    if (!w3) return;
    const { x: worldX, y: worldY } = this.heroVisualTile();
    for (let i = 0; i < 4; i++) {
      const mote = w3
        .addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true })
        .setTint(0xbfa46a)
        .setPosition(worldX + (Math.random() - 0.5) * 0.6, worldY + (Math.random() - 0.5) * 0.4)
        .setElevation(0.45 + Math.random() * 0.25)
        .setDisplaySize(0.1, 0.1)
        .setAlpha(0.75);
      this.tweens.add({
        targets: mote,
        elevation: 0.04,
        x: mote.x + (Math.random() - 0.5) * 0.3,
        alpha: 0,
        scaleX: 0.4,
        scaleY: 0.4,
        duration: 260 + Math.random() * 120,
        ease: 'Quad.easeIn', // acelera para baixo: gravidade, nao brasa subindo
        onComplete: () => mote.destroy(),
      });
    }
  }

  /** O anel que sai do heroi quando a lamina gira: o alcance do golpe, desenhado uma vez. */
  private spawnSpinRing(): void {
    const w3 = this.world3d;
    if (!w3) return;
    // No corpo DESENHADO (ver heroVisualTile): a raiz do giro impede COMECAR um passo, nunca
    // congela um em curso, entao o giro pode sair com o heroi ainda deslizando entre dois tiles.
    const at = this.heroVisualTile();
    const ring = w3
      .addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 2 })
      .setTint(0xfff0b8)
      .setPosition(at.x, at.y)
      .setElevation(FX_BODY_ELEV)
      .setDisplaySize(0.5, 0.5);
    this.tweens.add({
      targets: ring,
      scaleX: 3.4,
      scaleY: 3.4,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /**
   * O tile a frente: para onde ele OLHA, nao para onde ele anda. E a mesma direcao que o sprite
   * esta mostrando (PlayerMovementController.facing), entao o alvo do golpe nunca pode divergir
   * do corpo que o jogador ve.
   */
  private facingTile(): { x: number; y: number } {
    const f = this.movementController?.facing ?? { dx: 0, dy: 1 };
    return { x: this.playerWorld.worldX + f.dx, y: this.playerWorld.worldY + f.dy };
  }

  /**
   * Para onde o heroi olha, no indice N/L/S/O que TODA maquina direcional deste jogo usa (o
   * braco, a esteira, o extrator, a bancada). E o que faz a direcao de uma peca recem-construida
   * nascer do corpo do jogador em vez de um menu: ele se vira e poe.
   */
  private facingDirIndex(): PropDir {
    const f = this.movementController?.facing ?? { dx: 0, dy: 1 };
    if (f.dy < 0) return 0;
    if (f.dx > 0) return 1;
    if (f.dy > 0) return 2;
    return 3;
  }

  /**
   * A direcao que veio do SAVE, domada. Um numero gravado por uma versao anterior (ou por uma
   * mao humana no localStorage) nao pode virar um frame fora da folha: quatro direcoes e o
   * contrato, e o leste e o default de todo prop direcional deste jogo.
   */
  private static asPropDir(value: number | undefined): PropDir {
    const n = Math.trunc(value ?? 1);
    return (Number.isFinite(n) ? (((n % 4) + 4) % 4) : 1) as PropDir;
  }

  /**
   * O BOTAO A, apertado. Duas coisas saem daqui, nesta ordem:
   *
   *   1. o GOLPE, imediato (ou guardado no buffer se a cadencia ainda nao liberou);
   *   2. a CARGA da lamina rodopiante comeca a contar, e vive ate o `keyup`.
   *
   * Sao os dois gestos do mesmo botao, e o toque nunca paga pela existencia do segundo: o golpe
   * sai no instante do aperto, como sempre saiu. Um botao que so respondesse quando solto seria
   * um botao com 450ms de atraso, que e o oposto do que esta reforma quer.
   */
  private pressAttack(event?: KeyboardEvent): void {
    // Uma tecla SEGURADA repete o `keydown` no navegador. O sinal certo pra ignorar a repeticao e
    // o `repeat` do proprio evento, e nao um booleano nosso: um `keyup` perdido (o jogo pausa e o
    // plugin de teclado dorme com a tecla apertada) deixaria esse booleano preso em `true` e o
    // botao A morto ate a proxima recarga. Do toque nao vem evento nenhum, e touchstart nao
    // repete — entao `undefined` e sempre um aperto de verdade.
    if (event?.repeat) return;
    if (!this.canAct()) return;
    this.attackHeld = true;
    this.chargeMs = 0;
    this.chargeReady = false;
    this.swingAttack();
  }

  /**
   * O A solto. Se a lamina chegou a carregar, ELA sai aqui — e o giro nao respeita o buffer nem
   * a cadencia do toque: o jogador ja pagou por ele segurando meio segundo parado.
   */
  private releaseAttack(): void {
    if (!this.attackHeld) return;
    this.attackHeld = false;
    const ready = this.chargeReady;
    this.chargeMs = 0;
    this.chargeReady = false;
    // Soltar no meio da subida aborta a carga: o zumbido morre com ela (ver startSpinChargeHum).
    // Com a lamina pronta o sino ja o substituiu e isto e um no-op.
    getSoundManager().stopSpinChargeHum();
    if (ready && this.canAct()) this.spinAttack();
  }

  /**
   * O GOLPE — a espada, no arco da frente. Sem espada na mochila, o soco.
   *
   * O arco sai mesmo no vazio, de proposito: um golpe que so aparece quando acerta esconde do
   * jogador qual e o alcance da arma, e o alcance e a unica coisa que ele precisa aprender para
   * lutar sem encostar. E ele varre os TRES tiles do arco desenhado (ver SWING_ARC): a foice de
   * 155° que a animacao sempre mostrou e o que o acerto passou a valer.
   */
  private swingAttack(): void {
    if (!this.canAct()) return;
    // FALAR é o próprio botão de AÇÃO quando há alguém NA FRENTE — o aviso "Z" que flutua na
    // cabeça do NPC anuncia exatamente esta tecla. Vem ANTES da cadência e do corpo: puxar
    // assunto não saca lâmina, não dá investida e não gasta golpe. (O B continua falando —
    // as duas mãos sabem cumprimentar.)
    {
      const front = this.facingTile();
      if (this.talkToNpcAt(front.x, front.y)) return;
      // A BANCADA É A ÚNICA MÁQUINA QUE TEM O QUE DIZER, e por isso ela entra exatamente aqui —
      // no mesmo degrau do NPC, antes da cadência e antes do corpo. Encarar a caixa e apertar A
      // abre o CATÁLOGO: o jogador escolhe o que quer construir, e a resposta ("do que preciso")
      // volta desenhada nas bandejas dela. É o Guia do Terraria — mostrar um objeto e receber a
      // receita —, só que quem responde é a própria máquina, no lugar em que o gesto acontece.
      //
      // Vem antes de `useItemAt` de propósito: nenhum item do jogo tem o que fazer com o corpo da
      // bancada (ela é sólida, e alimentar é o B nas bandejas), então conversar com ela nunca
      // rouba um gesto de ferramenta — e com a mão cheia continua valendo, que é justamente
      // quando o jogador está a meio caminho de um plano.
      // AS DUAS MÁQUINAS DE FABRICAR ABREM A MESMA TELA. O forno respondia ao A de outro jeito
      // (acendia os fantasmas nas bandejas e balançava), e eram duas gramáticas para o mesmo botão
      // contra o mesmo tipo de peça: uma pedia menu, a outra pedia que você adivinhasse a receita
      // e trouxesse as coisas na mão. Agora o A é uma coisa só — escolha e confirme —, e o que
      // muda entre elas é o que cada uma sabe fazer.
      if (this.openCraftMenuAt(front.x, front.y)) return;
      // A CAIXA DE EXTRACAO responde ao mesmo botao e no mesmo degrau: maquina que abre TELA.
      if (this.openSellBoxAt(front.x, front.y)) return;
      // O ALTAR VAZIO: o Z PÕE nele o item selecionado na bolsa. Fica no mesmo degrau da bancada
      // (antes da cadência e do corpo) e pela mesma razão — pôr uma coisa numa mesa não saca
      // lâmina. Com a laje já ocupada isto devolve `false` de propósito: dali em diante o Z volta
      // a ser a espada, e a espada descendo na peça é a PANCADA (ver strikeAltarAt logo abaixo).
      if (this.placeOnAltarAt(front.x, front.y)) return;
    }
    // A cadencia nao DESCARTA o pedido, ela o adia — ver ACTION_BUFFER_MS. O ATORDOAMENTO entra
    // aqui pelo mesmo motivo e no mesmo lugar: ele e uma cadencia imposta por quem bateu, e o
    // aperto feito no fim dele tem de sair quando ele acaba (ver PLAYER_STAGGER_MS).
    if (this.attackCooldownMs > 0 || this.playerStaggerMs > 0) {
      this.attackBufferMs = ACTION_BUFFER_MS;
      return;
    }
    this.attackBufferMs = 0;
    this.attackCooldownMs = ATTACK_COOLDOWN_MS;
    this.stopBreathing();
    this.movementController?.root(SWING_ROOT_MS);
    this.lungeIntoSwing();
    this.hero.attackMs = SWING_POSE_MS; // o CORPO entra no golpe, e nao so a lamina

    const { x, y } = this.facingTile();
    // O Z É A ESPADA, E SÓ ELA. A tabela de itens inteira mudou de botão (ela é o X agora — ver
    // `pressUse`), e com isso este gesto ficou com uma resposta só: o corte de sempre, o arco de
    // duas fileiras, a rebatida e a carga do giro. Antes o mesmo botão era espada, soco, machado,
    // balde e chave conforme o que estivesse na bolsa — o que fazia da defesa uma consulta de
    // menu no meio da briga, e do arco um desenho que mudava de alcance sem o jogador pedir.
    // O SOCO MORREU JUNTO: mão vazia deixou de existir, porque a espada não se solta.
    this.swingSword(x, y);
    const arc = this.arcTiles(2);
    this.sweepArc(arc, 'sword');
    this.reflectShotsIn(arc);
    // A LÂMINA DESCE NA LAJE. Vem DEPOIS do arco inteiro, e não no lugar dele: o golpe acontece de
    // qualquer jeito (a lei do arco que sai mesmo no vazio), e a pancada é o que ele encontrou pela
    // frente. Só o tile encarado conta — bater de raspão no altar do lado enquanto se luta não
    // pode martelar a peça de alguém.
    this.strikeAltarAt(x, y);
  }

  /**
   * A REBATIDA: o MESMO arco do golpe tenta devolver a bola de gelo (ver
   * EnemyProjectileManager.reflectAt — só o cuspe do zora aceita). "O momento certo" não é um
   * relógio novo: é a bola estar DENTRO do arco durante o gesto — a janela que o jogador já
   * aprendeu com todo corpo que a espada alcança. A resposta é o pacote do aparo (o tim da
   * guarda + hitstop): o mesmo som de "não passou", agora dizendo "voltou".
   */
  private reflectShotsIn(tiles: Array<{ x: number; y: number }>): void {
    const returned = this.enemyManager?.reflectShots(tiles) ?? 0;
    if (returned <= 0) return;
    getSoundManager().playGuardBlock();
    this.triggerHitstop(70);
    const f = this.movementController?.facing ?? { dx: 0, dy: 1 };
    this.world3d?.shake(70, 0.05, f.dx, f.dy);
  }

  /**
   * O corpo indo atrás da lâmina (ver SWING_LUNGE_TILES). Sai rápido e volta devagar, que é a
   * curva de um golpe — o contrário (sair devagar) leria como o herói sendo empurrado.
   */
  private lungeIntoSwing(): void {
    const f = this.movementController?.facing ?? { dx: 0, dy: 1 };
    // Só o tween da investida é morto — NUNCA um `killTweensOf(this.hero)`, que levaria junto o
    // arremesso de dano e a respiração, que moram no mesmo objeto e têm donos próprios.
    this.swingLungeTween?.stop();
    this.swingLungeTween = this.tweens.add({
      targets: this.hero,
      lungeX: f.dx * SWING_LUNGE_TILES,
      lungeY: f.dy * SWING_LUNGE_TILES,
      duration: SWING_LUNGE_OUT_MS,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.swingLungeTween = this.tweens.add({
          targets: this.hero,
          lungeX: 0,
          lungeY: 0,
          duration: SWING_LUNGE_BACK_MS,
          ease: 'Sine.easeIn',
          onComplete: () => { this.swingLungeTween = undefined; },
        });
      },
    });
  }

  /**
   * A LAMINA RODOPIANTE: o heroi gira e corta os OITO vizinhos de uma vez.
   *
   * E a unica resposta do jogo a estar cercado, e ela existe porque o cerco de caveiras existe:
   * um golpe direcional contra quatro corpos e uma conta que nao fecha. Custa a carga (meio
   * segundo parado, com a matilha andando) e uma cadencia longa depois — e por isso ela e uma
   * DECISAO e nao um golpe melhor.
   */
  private spinAttack(): void {
    // Sem porta de item: a espada e do heroi (ver swordEquipped), entao o giro so depende da carga.
    // O GIRO PERDE-SE SE VOCE APANHAR CARREGANDO, e ele precisa da trava EXPLICITA porque e o unico
    // gesto que ignora a cadencia de proposito ("o jogador ja pagou por ele segurando meio segundo
    // parado") — sem esta linha, ele seria a unica coisa que sai do meio de um atordoamento.
    //
    // E e o risco que a peca sempre cobrou: meio segundo parado no meio da matilha. Perder a carga
    // ao levar o golpe e a outra metade desse trato, nao um castigo a mais. Mas um preco cobrado
    // em silencio nao e um trato: o jogador pagou meio segundo e a lamina simplesmente nao saia,
    // sem nada dizer que a carga MORREU aqui. O fiasco — um descer curto e as faiscas de carga
    // caindo apagadas — e o recibo.
    if (this.playerStaggerMs > 0) {
      getSoundManager().playSpinFizzle();
      this.spawnChargeFizzle();
      return;
    }
    this.attackBufferMs = 0;
    this.attackCooldownMs = SPIN_COOLDOWN_MS;
    this.stopBreathing();
    this.movementController?.root(SPIN_ROOT_MS);
    // O giro segura a pose por toda a raiz dele (260ms, mais longa que a do toque): o gesto e maior
    // e o corpo tem de ficar nele o tempo todo, ou o heroi volta ao repouso com a lamina ainda no ar.
    this.hero.attackMs = SPIN_ROOT_MS;
    this.hideBackItemDuringSwing(SPIN_COOLDOWN_MS);

    if (this.swordSlash && this.camera) {
      // swingAnchor ja conta ao arco quanta luz ha onde o heroi esta (ver SWING_DARK): sem isso
      // uma lamina clara rodopiaria como um lampiao numa noite fechada.
      const screen = this.swingAnchor(0);
      this.swordSlash.spin(screen.x, screen.y, this.tileSize);
    }
    getSoundManager().playSwordSlash();
    getSoundManager().playSpinRelease();

    const { worldX, worldY } = this.playerWorld;
    const ring: Array<{ x: number; y: number }> = [];
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (ox === 0 && oy === 0) continue;
        ring.push({ x: worldX + ox, y: worldY + oy });
      }
    }
    this.sweepArc(ring, 'spin');
    this.reflectShotsIn(ring); // a lâmina rodopiante devolve bola de qualquer lado — é o giro
    this.world3d?.shake(120, 0.08);
    this.spawnSpinRing();
  }

  /**
   * Os tiles que o golpe varre. `reach` é 1 para o soco (só a fileira colada no corpo) e 2 para a
   * espada (o bloco 2×3 inteiro — ver SWING_ARC_NEAR/FAR). O primeiro par é sempre o tile à
   * frente, o alvo canônico que todo playtest de mira lê.
   *
   * A fileira de trás é FILTRADA por caminho: `[2, lat]` só entra se `[1, lat]` não for parede
   * para um tiro. Reaproveita `isShotBlockedAt` de propósito — é a mesma pergunta que uma bala
   * faz (o que interrompe uma trajetória: parede e prop sólido, nunca luz nem água) — e é o que
   * impede a lâmina de atravessar rocha para acertar quem está atrás dela.
   */
  private arcTiles(reach: 1 | 2 = 2): Array<{ x: number; y: number }> {
    const f = this.movementController?.facing ?? { dx: 0, dy: 1 };
    // Rotacao do gabarito para a direcao olhada: (dx,dy) e o "para frente" e (-dy,dx) o "para o
    // lado". Uma conta so, para nao existirem quatro tabelas cardinais que podem discordar.
    const toWorld = ([fwd, lat]: readonly [number, number]): { x: number; y: number } => ({
      x: this.playerWorld.worldX + f.dx * fwd - f.dy * lat,
      y: this.playerWorld.worldY + f.dy * fwd + f.dx * lat,
    });
    const tiles = SWING_ARC_NEAR.map(toWorld);
    if (reach < 2) return tiles;
    for (const [fwd, lat] of SWING_ARC_FAR) {
      const gate = toWorld([fwd - 1, lat]); // o tile do meio, entre o herói e o alvo
      if (this.isShotBlockedAt(gate.x, gate.y)) continue;
      tiles.push(toWorld([fwd, lat]));
    }
    return tiles;
  }

  /**
   * Resolve um golpe contra uma lista de tiles. Um corpo por tile, entao ninguem leva dois golpes
   * do mesmo gesto; e o mesmo caminho de invulneravel-que-resvala do golpe de um tile so.
   *
   * O GESTO TEM DUAS VOZES, E ELAS TEM ORCAMENTOS SEPARADOS. O arco varre ate seis tiles e o giro
   * oito, entao a voz do ACERTO (o baque, a piscada do heroi, o som da morte, o encontrao) e a voz
   * da RECUSA (o tim da guarda, o tranco do resvalo) precisam sair uma vez cada por gesto — mas
   * uma nunca pode calar a outra. Com um contador so havia defeito nos DOIS sentidos: um corpo que
   * resvalou no primeiro tile roubava o som da morte do corpo do lado, e quando NADA landava (um
   * giro no meio de uma matilha inteira guardando) oito recusas disparavam oito tins no mesmo
   * frame.
   *
   * O que e do CORPO — o anel do resvalo, a faisca da guarda, o pacote de impacto — nao entra em
   * orcamento nenhum: ele responde por AQUELE corpo, e calar o segundo corpo de um arco e mentir
   * sobre o que aconteceu com ele. So a voz e uma so.
   */
  private sweepArc(tiles: Array<{ x: number; y: number }>, weapon: 'sword' | 'spin'): void {
    let hitSpoken = false;
    let refusalSpoken = false;
    /**
     * UM GOLPE POR CORPO, e este conjunto é o que finalmente torna essa frase verdadeira.
     *
     * O código garantia um corpo por TILE, que não é a mesma coisa — porque o acerto MOVE o corpo,
     * e o arco é varrido em ordem. Um bicho no tile da frente (`[1,0]`) é arremessado para
     * `[2,0]`, que é justamente o tile seguinte da lista: o laço o encontrava de novo, agora dentro
     * dos próprios i-frames, e desenhava o anel de RECUSA em cima do corpo que a mesma espadada
     * acabou de acertar. Uma espadada dizia "acertei" e "resvalou" sobre o mesmo bicho — e o anel
     * frio é o sinal de "espere, ele está piscando", ou seja, ensinava exatamente o contrário do
     * que tinha acabado de acontecer.
     *
     * Ficou invisível por muito tempo por acidente: o anel era gasto pelo orçamento de voz do
     * gesto (`echo`), então o segundo encontro caía calado. Ao separar as duas vozes — para que uma
     * recusa legítima nunca fosse silenciada por um acerto — o defeito apareceu.
     */
    const resolved = new Set<EnemyBase>();
    for (const tile of tiles) {
      const enemy = this.enemyManager?.getEnemyAt(tile.x, tile.y);
      if (!enemy || resolved.has(enemy)) continue;
      resolved.add(enemy);
      // Ainda saindo do chao: a caveira e invulneravel e o golpe RESVALA — anel frio e clarao
      // palido, nunca o pacote de impacto (que faria um golpe negado parecer um golpe certeiro).
      if (enemy.isSpawning) {
        enemy.flashImmune();
        this.spawnDeflect(tile.x, tile.y);
        if (!refusalSpoken) {
          getSoundManager().playBladeGlance();
          // Inclinado na direcao do golpe, como toda recusa: um baque sem direcao era o unico
          // tremor "sorteado" que restava no combate.
          this.world3d?.shake(40, 0.03, tile.x - this.playerWorld.worldX, tile.y - this.playerWorld.worldY);
          this.triggerHitstop(GLANCE_HITSTOP_MS);
          refusalSpoken = true;
        }
        continue;
      }
      if (this.strikeEnemy(enemy, tile.x, tile.y, weapon, hitSpoken, refusalSpoken) === 'landed') {
        hitSpoken = true;
      } else {
        refusalSpoken = true;
      }
    }
  }

  /**
   * O arco da ESPADA, que nao e o mesmo de `swingHeld` (aquele desenha o item das costas).
   * O heroi pode estar com o balde escolhido no B e mesmo assim sacar a espada — e por isso o
   * item das costas so some quando o que esta la e justamente a espada.
   */
  private swingSword(wx: number, wy: number): void {
    if (!this.swordSlash || !this.camera) return;
    getSoundManager().playSwordSlash();
    // As costas mostram a espada quando nada esta selecionado (ver updateBackItem) — e ai ela tem
    // de sumir durante o arco, ou a mesma lamina aparece em dois lugares.
    if (this.heldItem === 'none') this.hideBackItemDuringSwing();
    const screen = this.swingAnchor(wy - this.playerWorld.worldY);
    this.swordSlash.slash(
      screen.x, screen.y,
      wx - this.playerWorld.worldX, wy - this.playerWorld.worldY,
      this.tileSize,
    );
  }

  /**
   * O BOTÃO X — USA O ITEM DA BOLSA no tile à frente, e é só isso que ele faz.
   *
   * A gramática dos dois botões ficou uma frase por botão: **o Z é a espada, o X é a ferramenta.**
   * Bater com a espada e quebrar a rocha deixaram de ser o mesmo botão disputando a mesma bolsa —
   * o herói corta com o Z e pica a pedra com o X, sem passar por um menu entre os dois.
   *
   * O QUE SAIU DAQUI:
   *
   *   - **LARGAR.** O X não joga mais nada no chão. Um botão que ora usa, ora larga é um botão que
   *     desarma o jogador por engano — e largar existia para trocar de mão, que a mochila resolveu
   *     faz tempo. O que era "pousar para depositar" virou ENTREGA (`deliverToMachineAt`): a
   *     máquina já diz o que precisa, e o X entrega isso, venha da bolsa ou do contador.
   *   - **APANHAR.** Pisar apanha (ver `collectUnderfoot`). Sem o gesto de largar, apanhar deixou
   *     de ter custo — não há mão a ser roubada —, e o botão ficou livre para ter um sentido só.
   *   - **FALAR.** Continua no Z, que é a tecla que o keycap sobre a cabeça do NPC sempre anunciou.
   *
   * A ordem abaixo é a única que não desmente as marcas desenhadas no chão: o que o jogador
   * ESCOLHEU (o item) age primeiro, depois o que a máquina PEDE, e só então recolher.
   */
  private pressUse(event?: KeyboardEvent): void {
    // O B NÃO REPETE MAIS, e a bolsa é quem cobrou isso. O A já ignorava a repetição do navegador
    // pelo `event.repeat` (ver `pressAttack`); o B não, e com a bolsa atrás da mesma tecla isso
    // virou uma armadilha real: segurar o X um instante a mais para equipar fazia o primeiro
    // keydown CONFIRMAR o item e a repetição seguinte, já com a bolsa fechada, USÁ-LO no tile da
    // frente. Quem quer usar duas vezes aperta duas vezes — a cadência (USE_COOLDOWN_MS) continua
    // sendo o que separa os dois apertos.
    if (event?.repeat) return;
    // A BOLSA ABERTA SEQUESTRA O B — e este é o único lugar do código onde isso pode ser decidido.
    // Se a bolsa tivesse o próprio ouvinte de X, o MESMO aperto faria as duas coisas em sequência:
    // confirmaria o item e, meio milissegundo depois já com a bolsa fechada, USARIA o que acabou
    // de ser equipado contra o tile da frente.
    if (this.quickBag?.isOpen) { this.quickBag.commit(); return; }
    if (!this.canAct()) return;
    // A cadencia adia, nao descarta — a mesma lei do A (ver ACTION_BUFFER_MS). Vale mais aqui do
    // que parece: o B tambem e uma arma (o graveto aceso), e o hitstop de um acerto come 110ms
    // de update inteiros — exatamente o intervalo em que a segunda golpada e apertada.
    if (this.useCooldownMs > 0 || this.playerStaggerMs > 0) { // ...e o atordoamento, idem
      this.useBufferMs = ACTION_BUFFER_MS;
      return;
    }
    this.useBufferMs = 0;
    this.useCooldownMs = USE_COOLDOWN_MS;
    this.stopBreathing();
    const { x, y } = this.facingTile();
    // A road seal is activated from under the hero's feet. It outranks normal B actions because
    // the prompt explicitly asks for this button while the hero is standing on the square.
    const buildGate = this.explorer?.gateAt(this.playerWorld.worldX, this.playerWorld.worldY);
    if (buildGate) {
      if ((explorerRun()?.coins ?? 0) >= this.explorer!.minCost()) this.openChunkCards(buildGate);
      return;
    }
    // 0. A FERRAMENTA CERTA SE APRESENTA SOZINHA. Bateu numa árvore com o machado na mochila? O
    //    herói saca o machado. Numa rocha, com a picareta? Ele saca a picareta. Não é um atalho
    //    de conveniência: é a diferença entre um jogo que pergunta "qual item você escolheu?" e um
    //    que entende o que você está fazendo. O gesto que a bolsa cobrava antes (parar, abrir,
    //    girar o cursor, fechar) não decidia NADA — diante de um tronco só existe uma resposta, e
    //    fazer o jogador dizê-la em voz alta é cobrar burocracia por uma escolha que não existe.
    //
    //    Ele TROCA a seleção de verdade, e é o que o mantém honesto: o braço desenha o machado, as
    //    costas do herói mostram o machado, e o próximo X continua com ele na mão. Um gesto que
    //    usasse uma ferramenta invisível faria a animação mentir sobre o que está acontecendo.
    //
    //    E ele não rouba gesto nenhum: um tronco e uma rocha são sólidos, e não há UM item na
    //    tabela que faça outra coisa contra eles. Ver `toolWantedAt`.
    this.equipToolFor(x, y);
    // 1. O ITEM ESCOLHIDO AGE — a tabela inteira (machado→árvore, picareta→rocha, balde→água,
    //    chave→porta, tocha→fogueira, pá→terra, semente→buraco, máquina→instala). É o primeiro
    //    degrau porque é o único que o jogador PEDIU explicitamente: ele abriu a bolsa e escolheu
    //    aquilo. As marcas no chão (`PlacementHints`) desenham exatamente este passo.
    if (this.heldItem !== 'none' && this.useItemAt(x, y)) return;
    // 1b. MARTELAR A ESPONJA continua valendo com a bolsa VAZIA. Ela é a única linha da tabela que
    //     não olha o que está na mão (bater não é usar uma ferramenta), e sem esta porta um herói
    //     que pousou a esponja e ficou sem itens não teria como voltar a bater nela — um beco sem
    //     saída no meio da cadeia do ferro.
    if (this.heldItem === 'none' && this.strikeBloomAt(x, y)) return;
    // 2. A MÁQUINA PEDE, O X ENTREGA. A bandeja do forno, a bigorna do martinete e o baú com cota
    //    sabem o que querem e mostram isso; o herói entrega da mochila — inclusive do CONTADOR, que
    //    é onde minério, carvão e ferro moram agora. Depois do item escolhido de propósito: com uma
    //    esteira na mão de frente para o forno, o gesto é construir a esteira, não alimentar.
    if (this.deliverToMachineAt(x, y)) return;
    // 3. RECOLHER a máquina que o JOGADOR construiu — a outra metade de "tudo que se instala se
    //    recolhe". Deixou de exigir mão vazia: a mão nunca mais está vazia (a bolsa quase sempre
    //    tem alguma coisa), e exigir isso tornaria a peça irremovível na prática. Vem por último
    //    entre os gestos, então uma ferramenta que TEM o que fazer ali nunca desmonta nada.
    if (this.pickUpMachineAt(x, y)) return;
    // 4. O gesto sai NO VAZIO — a mesma lei do golpe: um botão que só se mexe quando acerta esconde
    //    do jogador o que ele está segurando. Sem nada selecionado não há braço a balançar.
    if (this.heldItem !== 'none') this.swingHeld(x, y);
  }

  /**
   * A ENTREGA — o X contra uma máquina que está PEDINDO alguma coisa.
   *
   * Ela substitui o gesto de pousar: era "largue o minério na bandeja" e virou "o forno pede
   * minério, o X dá". A diferença que importa é de onde sai a carga — da MOCHILA inteira, contador
   * incluído. Sem isto, tirar o minério da bolsa (que é o que esta reforma faz) teria arrancado
   * junto a única forma de alimentar o forno na mão.
   *
   * Devolve `true` quando havia máquina ali e o gesto foi gasto — inclusive numa recusa desenhada.
   */
  /**
   * A CAIXA DE VENDA a partir do prop: a placa desenha a arte do PRÓPRIO item que ela compra, e é
   * daqui que ela sai — a tabela de arte 3D mora nesta cena, não no objeto.
   */
  private makeSellBox(def: import('@/game/world/worldSchema').WorldProp): SellBoxObject {
    const kind = def.sells?.kind as HeldItemKind;
    const art = BACK_ITEM_VISUAL_3D[kind];
    return new SellBoxObject(
      this, def.worldX, def.worldY, kind, def.sells?.coinsPerUnit ?? 1, art.texture, art.frame,
    );
  }

  /**
   * VENDER: o X contra a caixa entrega o PUNHADO INTEIRO do tipo que ela compra, e ela derruba o
   * pagamento no chão em volta de si.
   *
   * O punhado inteiro, e não uma unidade, pela mesma razão do baú: vender vinte minérios um aperto
   * por vez seria uma tarefa, e a caixa existe para tirar tarefa do caminho. E o pagamento cai no
   * MUNDO (a lei da casa — dinheiro ganho é dinheiro que se apanha), o que também dá ao gesto a
   * parte visível que um número no canto da tela não tem.
   */
  /**
   * O Z CONTRA A CAIXA ABRE A MESA DE DESPACHO. Ele mora no mesmo degrau da bancada e do forno —
   * as tres sao maquinas que respondem ao A com uma TELA de escolha, e nao com um gesto imediato.
   * Vender e uma decisao ("quanto disto?"), e decisao neste jogo abre painel.
   */
  private openSellBoxAt(wx: number, wy: number): boolean {
    const box = this.propAt(this.sellBoxes, wx, wy);
    if (!box) return false;
    if (!box.isReady) return true;   // ja esta no ar: o gesto foi gasto, e o ceu e a resposta
    if (this.sellOverlay) return true;
    const have = this.inventory.count(box.kind);
    if (have <= 0) { box.refuse(); return true; }
    const art = ITEM_VISUAL_2D[box.kind];
    this.movementController?.hold(true);
    this.sellOverlay = new SellOverlay({
      icon: spriteDataUrl(this, art.texture, art.frame),
      itemLabel: t(`items.name.${box.kind}`),
      coinsPerUnit: box.coinsPerUnit,
      available: have,
      onConfirm: (units) => {
        this.closeSellOverlay();
        const n = Math.min(units, this.inventory.count(box.kind));
        if (n <= 0) return;
        this.inventory.remove(box.kind, n);
        this.updateBackItem(); // o vendido podia ser o item da mao — as costas ficam honestas
        getSoundManager().playShopClose();
        // A CARGA SOBE AGORA; a moeda so cai quando o aviao passar (ver SellBoxObject.extract).
        box.extract(box.priceFor(n), (bx, by, coins) => {
          if (this.chunkManager) {
            this.coinManager?.spawnCoins(bx, by, this.chunkManager, coins);
          }
          getSoundManager().playCoinPickup();
          this.persistAdventure();
        });
        this.persistAdventure();
      },
      onCancel: () => this.closeSellOverlay(),
    });
    getSoundManager().playShopOpen();
    return true;
  }

  private closeSellOverlay(): void {
    this.sellOverlay?.close();
    this.sellOverlay = undefined;
    this.movementController?.hold(false);
  }

  private deliverToMachineAt(wx: number, wy: number): boolean {
    // O BAÚ é os dois sentidos num corpo só (depositar e tirar um punhado), e continua sendo o
    // primeiro: ele é o único que aceita QUALQUER coisa, então perguntar a ele é barato.
    if (this.useChestAt(wx, wy)) return true;
    // A BIGORNA: põe a peça dentro, ou devolve a que está lá.
    if (this.useTripHammerAt(wx, wy)) return true;
    // O ALTAR devolve o que está em cima dele. Só chega aqui o que a pancada NÃO trabalha (a peça
    // malhável virou golpe lá atrás, na tabela): é a metade simétrica do Z que pôs, e o que
    // garante que nada fique preso na laje — a mesma lei do baú e da bigorna, um aperto põe, o
    // seguinte devolve.
    const altar = this.getAltarAt(wx, wy);
    if (altar?.carrying) {
      const back = altar.take();
      if (back) {
        this.inventory.add(back);
        this.updateBackItem();
        getSoundManager().playSwordPickup();
        this.persistAdventure();
        return true;
      }
    }
    // AS BANDEJAS DO FORNO SAÍRAM DAQUI (2026-08-12). Elas eram alimentadas por aperto, e o que
    // decidia O QUE entregar era o fantasma que a máquina pregava no chão — uma receita só, fixa,
    // de quando o forno não tinha menu. Com o catálogo (que já sabe duas receitas e vai saber
    // mais), a fornada da MÃO acontece por inteiro no Z: escolher, gastar da mochila, ver a
    // máquina trabalhar. Encher bandeja com a mão virou o caminho longo para o mesmo lugar, e o
    // único que precisava de um segundo anúncio na tela.
    //
    // As bandejas continuam ali para as MÁQUINAS (esteira, braço), e o X continua TIRANDO delas o
    // que estiver posto (`machineFloorAt`, logo abaixo) — chão de máquina não é bolso, e o que
    // entrou tem de poder sair.
    //
    // O CHÃO DE ENTRADA DO BRAÇO é uma bandeja como as do forno, e ela precisa desta linha para
    // continuar existindo: alimentar o braço robótico SEMPRE foi "pouse a carga no tile de onde
    // ele tira", e pousar acabou. Sem isto, um level inteiro fica insolúvel — o portão de bater
    // pede que o braço leve FOGO até o mato do outro lado, e o graveto aceso só chega lá pela mão
    // do herói. A pergunta é a mesma da bandeja: a máquina quer algo NESTE tile.
    const armInput = this.inserters.find((arm) => {
      const [sx, sy] = arm.sourceTile;
      return sx === wx && sy === wy;
    });
    if (armInput && this.heldItem !== 'none' && !(this.itemManager?.hasItemAt(wx, wy) ?? false)
      && this.placeItemAt(wx, wy)) {
      return true;
    }
    // TIRAR DE VOLTA O QUE ESTÁ NA MÁQUINA — a bandeja servida, a carga parada na esteira, a
    // bateria encaixada no cabo. É a metade simétrica da entrega, e é a ÚNICA forma de reaver
    // essas coisas agora que a pisada não as apanha (ver `collectUnderfoot`). O mesmo par de
    // gestos que o baú e a bigorna já tinham: um aperto põe, o seguinte devolve.
    if (this.machineFloorAt(wx, wy) && this.pickUpItemAt(wx, wy)) return true;
    return false;
  }

  private getAltarAt(wx: number, wy: number): AltarObject | undefined {
    return this.propAt(this.altars, wx, wy);
  }

  /**
   * O Z NA LAJE VAZIA: põe nela o item SELECIONADO na bolsa (o "secundário" — o que o X usaria).
   *
   * Devolve `false` quando não havia altar ali, quando ele já está ocupado (um lugar, uma peça) ou
   * quando não há nada selecionado — e nos três casos o gesto SEGUE para o golpe, que é o que
   * mantém o botão com uma frase só: o Z é a espada, e pôr uma coisa numa mesa é a exceção curta
   * que só existe enquanto a mesa está vazia.
   */
  private placeOnAltarAt(wx: number, wy: number): boolean {
    const altar = this.getAltarAt(wx, wy);
    if (!altar || altar.carrying !== null) return false;
    const kind = this.heldItem;
    if (kind === 'none') return false;
    if (!altar.place(kind)) return false;
    // `clearHeldItem` e não um `remove` solto: ele é quem sabe que uma tocha que sai da mão APAGA
    // (o fogo mora no graveto que estava sendo carregado) e que a carga da bateria vai junto. Um
    // remove cru deixaria a cena com chama acesa sobre uma mão que não segura mais nada.
    this.clearHeldItem();
    getSoundManager().playToolboxDeliver();
    this.persistAdventure();
    return true;
  }

  /**
   * A PANCADA NA LAJE — a mesma para a espada (Z) e para a ferramenta (X).
   *
   * A esponja recém-saída do forno é ferro poroso encharcado de escória, e só vira metal depois de
   * apanhar quente: são `BLOOM_BLOWS` pancadas, as MESMAS que o martinete leva e as mesmas da
   * martelada no chão. É essa igualdade que faz a automação ser sentida como alívio.
   *
   * Bater no que a pancada não trabalha continua sendo possível e não faz nada — pedido explícito
   * do usuário, e a laje se defende de mentir por outro caminho: o que trabalha cospe brasa, o que
   * não trabalha solta lasca cinzenta e um baque seco (ver AltarObject.strike).
   */
  private strikeAltarAt(wx: number, wy: number): boolean {
    const altar = this.getAltarAt(wx, wy);
    if (!altar || altar.carrying === null) return false;
    const result = altar.strike();
    if (result === 'none') return false;
    getSoundManager().playHammer();
    if (result === 'forged') {
      // O ITEM NOVO se apresenta uma vez, como qualquer outro que o jogador vê pela primeira vez —
      // e ele foi VISTO nascer na laje, mesmo que ainda não tenha sido apanhado.
      const made = altar.carrying;
      if (made) this.seenItems.add(made);
      getSoundManager().playToolboxForge();
      this.persistAdventure();
    }
    return true;
  }

  /**
   * O B CONTRA O MARTINETE — por a peca na bigorna, ou tira-la de volta.
   *
   * Devolve `true` sempre que houve um martinete ali E o gesto fazia sentido; `false` deixa o B
   * seguir para o pouso normal, que e o que tem de acontecer quando o jogador esta com um graveto
   * na mao de frente pra maquina (ele quer largar o graveto, e nao alimentar a forja com ele).
   *
   * A pergunta "cabe?" e `TripHammerObject.accepts`, e e a MESMA que o aviso sobre a cabeca do
   * heroi consulta — senao o texto promete um gesto que o botao recusa.
   */
  private useTripHammerAt(wx: number, wy: number): boolean {
    const hammer = this.propAt(this.tripHammers, wx, wy);
    if (!hammer) return false;
    // BIGORNA OCUPADA DEVOLVE, sempre — e não mais só com a mão vazia. Um lugar guarda uma peça,
    // então o único gesto que resta contra uma bigorna carregada é tirar o que está lá; perguntar
    // primeiro o que está selecionado só serviria para recusar em silêncio.
    if (hammer.carrying) {
      const back = hammer.release();
      if (!back) return false;
      this.inventory.add(back);
      this.updateBackItem();
      getSoundManager().playSwordPickup();
      this.persistAdventure();
      return true;
    }
    // A MÁQUINA PEDE O QUE ELA SABE TRABALHAR. A bigorna aceita qualquer carga (é o que impede o
    // braço robótico de perder uma entrega em silêncio — ver TripHammerObject.accept), mas quando
    // é o HERÓI que entrega ela prefere a esponja: com o machado selecionado e uma esponja na
    // mochila, "pôr na bigorna" só pode significar uma coisa. Sem esponja, vale o que está na mão.
    const workable = this.inventory.list()
      .find((entry) => TripHammerObject.works(entry.kind))?.kind;
    const held = workable ?? (this.heldItem === 'none' ? undefined : this.heldItem);
    if (held === undefined) return false;   // bigorna vazia e nada a pôr: o X segue e desmonta
    if (!hammer.accept(held)) return false;
    this.inventory.remove(held);
    this.updateBackItem();
    getSoundManager().playToolboxDeliver();
    this.persistAdventure();
    return true;
  }

  /**
   * FALAR COM QUEM ESTA A FRENTE. Devolve `false` quando nao ha ninguem ali.
   *
   * O dialogo era do ESBARRAO, e por isso era a unica coisa do jogo que acontecia sem ninguem ter
   * pedido: bastava a seta encostar no NPC — atravessando um vao, fugindo de uma caveira, tentando
   * contornar o velho pra chegar na fogueira — e a tela parava, a camera panorava e uma conversa
   * comecava. Um gesto que interrompe o jogo inteiro nao pode ser um acidente de trajeto.
   *
   * Agora ele e o B, como usar qualquer outra coisa do mundo, e isso nao acrescenta nada pro
   * jogador aprender: a parede ja VIRA o heroi (e um NPC bloqueia como qualquer parede), entao
   * encarar quem se quer ouvir e o mesmo gesto de mira que a arvore e a rocha ja cobravam. A
   * afordancia tambem ja estava pronta e nao custou um pixel novo — o "!" que flutua sobre quem tem
   * assunto novo deixou de descrever um acidente e passou a apontar pra um botao.
   */
  private talkToNpcAt(wx: number, wy: number): boolean {
    if (!this.npcManager?.hasNpcAt(wx, wy)) return false;
    // NPC congelado não conversa: o gesto foi gasto na recusa (o bloco treme — a lei da trava).
    // `true` de propósito: o B não pode escorrer para "pousar o item" na frente de alguém.
    if (this.freezeManager?.frozenAt(wx, wy)) {
      this.freezeManager.pulse(wx, wy);
      return true;
    }
    const kind = this.npcManager.getKindAt(wx, wy);
    if (!kind) return false;
    // The wizard runs the story dialogue (progress-driven); every other NPC uses its base line.
    if (kind === 'wizard' && !this.explorer) this.openWizardDialog({ worldX: wx, worldY: wy });
    else this.openNpcDialog(kind, { worldX: wx, worldY: wy }, this.npcManager.getDialogIdAt(wx, wy));
    return true;
  }

  /**
   * O BAU pelo botao B: mao cheia DEPOSITA, mao vazia TIRA. Devolve `false` se nao ha bau ali.
   *
   * Depositar leva o PUNHADO INTEIRO do tipo selecionado, e nao uma unidade: guardar vinte
   * minerios um aperto por vez seria uma tarefa, e o bau existe justamente para tirar tarefa do
   * caminho. Tirar devolve UM de cada vez, porque o gesto oposto tem outro proposito — pescar o
   * que se precisa agora — e porque a mochila ja e uma lista com contagem.
   */
  private useChestAt(wx: number, wy: number): boolean {
    const chest = this.getChestAt(wx, wy);
    if (!chest) return false;
    if (this.freezeManager?.frozenAt(wx, wy)) {
      this.freezeManager.pulse(wx, wy);
      return true;
    }
    // O QUE ESTE BAÚ QUER, se ele quer algo em particular: a cota da fábrica (a trava que cobra uma
    // entrega) ou o tipo que ele já guarda. Como minério e ferro saíram da bolsa e viraram
    // contador, é por aqui que uma entrega de matéria-prima acontece — sem isto, um baú com cota de
    // ferro seria uma porta que ninguém mais consegue abrir na mão.
    const asked = chest.quota?.kind ?? chest.storedKind;
    const held = asked && this.inventory.count(asked) > 0 && !chest.isFull
      ? asked
      : this.heldItem;
    // GUARDAR só acontece quando o baú realmente aceita. O que ele não pode receber (outro tipo,
    // ou ele cheio) NÃO é mais uma recusa: o gesto escorrega para tirar de volta, logo abaixo —
    // um baú é reversível por natureza, e recusar aqui deixaria o jogador sem nenhum jeito de
    // reaver o que guardou, agora que "mão vazia" virou um estado inalcançável.
    if (held !== 'none' && chest.accepts(held) && !chest.isFull) {
      const stored = chest.store(held, this.inventory.count(held));
      if (stored <= 0) {
        this.swingHeld(wx, wy);
        getSoundManager().playToolboxRefuse();
        return true;
      }
      this.inventory.remove(held, stored);
      this.updateBackItem();
      getSoundManager().playSwordPickup();
      this.persistAdventure();
      return true;
    }
    // TIRAR DE VOLTA deixou de exigir a mão vazia, e essa mudança é obrigatória: a bolsa quase
    // sempre tem alguma coisa selecionada agora, então "mão vazia" virou um estado que o jogador
    // não consegue alcançar de propósito. O critério passou a ser o baú: o que ele NÃO pode
    // guardar (outro tipo, ou ele cheio), ele devolve.
    const taken = chest.withdraw(1);
    if (!taken) {
      // Bau vazio: e a deixa para recolher a propria peca (o `pickUpMachineAt` roda depois deste
      // na ordem do X). `false` deixa o gesto seguir.
      return false;
    }
    this.onCollectItem({ kind: taken.kind, worldX: wx, worldY: wy, units: taken.units });
    this.persistAdventure();
    return true;
  }

  /**
   * INSTALAR a maquina que esta na mao no tile a frente. Devolve `false` quando o item nao e uma
   * maquina — e ai a tabela do A segue para as outras linhas dela.
   *
   * A DIRECAO nasce de para onde o heroi esta OLHANDO, e nunca de um menu: a peca entrega no
   * sentido em que ele andaria. E a mesma decisao do `dir` do braco e da esteira ("para onde a
   * maquina POE"), o que faz a regra ser uma so no jogo inteiro — e faz girar uma esteira ser
   * "vire-se e ponha de novo", que e um gesto que o corpo do jogador ja sabe fazer.
   */
  private buildMachineAt(wx: number, wy: number): boolean {
    const kind = this.heldItem;
    if (kind === 'none' || !MACHINE_ITEM_KINDS.has(kind)) return false;
    // A ENGRENAGEM NAO INSTALA NADA, e e a unica peca da familia que nao instala: ela e insumo
    // de bancada. Devolver `false` aqui e o que faz o A dela sair no VAZIO (a lei do botao),
    // que e a resposta correta — ela realmente nao tem nada a ver com nenhum tile.
    if (kind === 'gear') return false;
    // A recusa e FISICA: o item sai no arco contra o tile e volta, nunca uma legenda dizendo
    // "aqui nao". `true` porque o gesto foi gasto — o A nao pode escorrer para o arco no vazio
    // depois de ja ter tentado uma coisa.
    if (this.freezeManager?.frozenAt(wx, wy)) {
      this.freezeManager.pulse(wx, wy);
      return true;
    }
    if (!this.canBuildMachineAt(kind, wx, wy)) {
      this.swingHeld(wx, wy);
      getSoundManager().playToolboxRefuse();
      return true;
    }
    // O EXTRATOR SE ORIENTA SOZINHO, e isso NAO e conveniencia: sem ele a peca era inaimavel.
    //
    // A regra geral de instalacao e "a peca nasce no tile a frente, virada pra onde voce olha",
    // e ela funciona para tudo — menos para a unica maquina cuja ENTRADA e sempre uma parede. O
    // extrator tira do tile de TRAS, e o tile de tras dele tem de ser um veio de minerio; para
    // um jogador poder escolher essa direcao com o corpo, ele teria de estar PISANDO no veio. E
    // impossivel: veio de ferro e rocha, e rocha nao se pisa.
    //
    // Entao a broca procura a pedra. Encostado num veio, ele vira de costas pra ela; longe de
    // qualquer veio, cai na regra geral e obedece o olhar do heroi (que e o que faz um extrator
    // posto no lugar errado ainda ter uma direcao previsivel, em vez de uma arbitraria).
    const dir = kind === 'extractor'
      ? this.extractorAim(wx, wy) ?? this.facingDirIndex()
      : this.facingDirIndex();
    if (!this.installMachine(kind, wx, wy, dir)) return false;
    this.inventory.remove(kind, 1);
    this.updateBackItem();
    this.refreshWireNetwork();
    // O mesmo martelo da bancada: montar uma maquina soa como montar uma maquina. Um som novo
    // aqui ensinaria que instalar e outra categoria de gesto, e nao e — e fabricacao.
    getSoundManager().playToolboxDeliver();
    this.world3d?.shake(70, 0.008);
    this.persistAdventure();
    return true;
  }

  /**
   * O ATO de por a maquina no mundo, sem nada em volta: nem cobrar a mochila, nem tocar som, nem
   * gravar o save. E o corpo compartilhado entre o gesto do jogador (`buildMachineAt`), a volta
   * do save (`restoreBuiltMachines`) e o hook de teste — porque a alternativa e a construcao
   * existir escrita tres vezes, e a terceira copia esquecer o `refreshWireNetwork`.
   *
   * Devolve `false` para um item que nao vira prop (a engrenagem), nunca para um tile ruim: quem
   * checa o tile e quem chama, porque cada um deles recusa de um jeito diferente (o jogador ve
   * o gesto falhar, o save simplesmente descarta a peca).
   */
  private installMachine(kind: HeldItemKind, wx: number, wy: number, dir: PropDir): boolean {
    switch (kind) {
      case 'wire': this.wires.push(new WireObject(this, wx, wy, true)); break;
      case 'belt': this.belts.push(new BeltObject(this, wx, wy, dir, true)); break;
      case 'chest': this.chests.push(new ChestObject(this, wx, wy, true)); break;
      case 'boiler': this.boilers.push(new BoilerObject(this, wx, wy, undefined, true)); break;
      case 'inserter': this.inserters.push(new RoboticArmObject(wx, wy, dir, undefined, true)); break;
      case 'extractor': this.extractors.push(new ExtractorObject(this, wx, wy, dir, true)); break;
      case 'furnace': this.furnaces.push(new FurnaceObject(this, wx, wy, dir, true)); break;
      case 'tripHammer': this.tripHammers.push(new TripHammerObject(this, wx, wy, dir, true)); break;
      // O ALTAR nao recebe `dir`: ele nao tem frente — e uma laje, e se trabalha nela de qualquer
      // lado. Uma peca que aceitasse direcao sem usa-la ensinaria que o G do editor faz algo aqui.
      case 'altar': this.altars.push(new AltarObject(this, wx, wy, true)); break;
      default: return false;
    }
    this.refreshWireNetwork();
    return true;
  }

  /**
   * O hook do PLAYTEST para montar uma fabrica de vinte pecas sem vinte viagens do heroi.
   *
   * Ele passa pelo MESMO `installMachine` que o botao A usa — e isso e o ponto. Um atalho de
   * teste que construisse por fora seria um teste guardando um caminho que o jogador nunca
   * percorre; o cenario `fabrica` prova o gesto de instalar UMA vez, com o A de verdade, e usa
   * isto so para o cenario de rede, onde o que esta sob teste e a conta e nao o botao.
   */
  public buildTestMachine(kind: HeldItemKind, wx: number, wy: number, dir = 1): boolean {
    // A MESMA recusa de tile do botao A. Sem ela o hook conseguiria empilhar um cabo em cima de
    // uma esteira — um estado que nenhum jogador alcanca —, e um cenario montado assim estaria
    // medindo uma fabrica impossivel. Foi exatamente o que aconteceu na primeira verificacao
    // desta reforma: uma sonda empilhou as duas pecas e o diagnostico levou meia hora.
    if (this.machineAt(wx, wy)) return false;
    return this.installMachine(kind, wx, wy, GameScene.asPropDir(dir));
  }

  /**
   * ESTE TILE ACEITA ESTA PECA? — a pergunta que o botao e a MARCA fazem, e por isso ela existe
   * uma vez so. Duas copias divergindo seria o pior defeito possivel desta reforma: um quadrado
   * branco no chao prometendo um gesto que o botao recusa.
   *
   * `machineAt` entra na conta porque a esteira e o cabo NAO sao solidos (o heroi pisa neles),
   * entao o `isTileOccupied` os deixa passar — e sem esta pergunta daria pra deitar um cabo em
   * cima de uma esteira. E o EXTRATOR tem uma condicao a mais, que e a peca inteira dele: ele so
   * mora encostado num veio, porque a entrada dele e o tile de tras e o tile de tras tem de ser
   * minerio. Um extrator plantado no meio do campo nao e uma escolha ruim do jogador — e uma
   * maquina que nunca vai fazer nada, e o jogo tem de dizer isso ANTES do aperto.
   */
  /**
   * A PEGADA de uma maquina: todo tile que ela vai ocupar depois de instalada.
   *
   * So o martinete tem mais de um — a mesa de pedra no tile alvo e o pilar do malho a leste —, e
   * uma direcao so (ver `PILLAR_DX`). A pegada e uma lista e nao um booleano porque `canBuild` e o
   * desenho do aviso leem dela a MESMA resposta: sem isso, o quadrado branco prometeria um gesto
   * cabivel num tile e o botao recusaria por causa do outro.
   */
  private machineFootprint(kind: HeldItemKind, wx: number, wy: number): Array<[number, number]> {
    return kind === 'tripHammer' ? [[wx, wy], [wx + 1, wy]] : [[wx, wy]];
  }

  private canBuildMachineAt(kind: HeldItemKind, wx: number, wy: number): boolean {
    if (!MACHINE_ITEM_KINDS.has(kind) || kind === 'gear') return false;
    for (const [tx, ty] of this.machineFootprint(kind, wx, wy)) {
      if (this.isTileOccupied(tx, ty) || this.machineAt(tx, ty)) return false;
      if (this.freezeManager?.frozenAt(tx, ty)) return false;
    }
    if (kind === 'extractor' && this.extractorAim(wx, wy) === null) return false;
    return true;
  }

  /**
   * Todo tile por perto onde um extrator TERIA veio para morder — os quadrados frios que
   * aparecem em volta de cada veio enquanto ele esta na mao.
   *
   * O raio e o do quadro (ver `framed`): marcar um veio do outro lado do mapa nao ajuda ninguem
   * a decidir onde pisar, e encheria o chao de quadrados que o jogador nao alcanca com os olhos.
   */
  private extractorSpots(): HintTile[] {
    const out: HintTile[] = [];
    const seen = new Set<string>();
    for (const rock of this.rocks) {
      if (!rock.ore) continue;
      if (Math.abs(rock.worldX - this.playerWorld.worldX) > 7) continue;
      if (Math.abs(rock.worldY - this.playerWorld.worldY) > 7) continue;
      for (const [dx, dy] of CARDINAL_DIRS) {
        const x = rock.worldX + dx; const y = rock.worldY + dy;
        const key = tileKey(x, y);
        if (seen.has(key)) continue;
        seen.add(key);
        if (this.canBuildMachineAt('extractor', x, y)) out.push({ x, y });
      }
    }
    return out;
  }

  /**
   * O aviso deste frame — e a BOLSA aberta o cala, porque ela sequestra o X (ela confirma o
   * item): um "X põe a esponja" por cima de uma bolsa aberta é uma legenda que mente.
   */
  private syncPickupPrompt(): void {
    const prompt = this.pickupPrompt;
    if (!prompt) return;
    if (this.quickBag?.isOpen) { prompt.show(null); return; }
    // APANHAR SAIU DO AVISO junto com o botão: pisar apanha, e um aviso que anuncia uma tecla para
    // um gesto que acontece sozinho é uma legenda mentindo. Sobrou a ENTREGA — o único gesto do X
    // cujo alvo não está desenhado no chão, porque a carga entra DENTRO de um corpo sólido.
    const put = this.deliveryTargetAhead();
    prompt.show(put === null ? null
      : t('prompt.put').replace('{item}', t(`items.name.${put}`)));
  }

  /**
   * O que o X vai ENTREGAR à máquina em frente, ou `null`.
   *
   * SÓ O MARTINETE RESPONDE, e agora é literal: a bigorna é o único lugar do jogo em que a carga
   * entra DENTRO de um corpo sólido — não há item desenhado no chão para o jogador ler, então o
   * que a máquina quer precisa ser dito de outro jeito.
   *
   * O FORNO SAIU DAQUI (2026-08-12, a pedido do usuário: "no forno aparecem duas coisas"). De
   * frente para ele o jogador via um "Z" na alvenaria e um "X — Place iron ore" sobre a própria
   * cabeça, e são dois caminhos para a mesma fornada: um abre o catálogo e funde da mochila, o
   * outro enche uma bandeja de cada vez. Dois anúncios para uma máquina fazem o jogador escolher
   * entre gramáticas antes de fazer qualquer coisa. Ficou o Z — o gesto que resolve tudo.
   *
   * As bandejas continuam ali e continuam aceitando o X (é assim que uma esteira ou um braço
   * alimentam o forno, e a mão pode fazer o mesmo). O que elas perderam foi a LEGENDA: o que cada
   * bandeja quer já está desenhado nela, em fantasma, respirando — e um desenho no chão nunca
   * precisou de um texto para ser lido.
   */
  private deliveryTargetAhead(): HeldItemKind | null {
    const { x, y } = this.facingTile();
    // A BIGORNA: o que o X vai pôr lá dentro — a mesma escolha que `useTripHammerAt` faz (a
    // esponja antes do que estiver na mão), ou nada quando ela já está carregada.
    const hammer = this.propAt(this.tripHammers, x, y);
    if (!hammer || hammer.carrying) return null;
    const workable = this.inventory.list()
      .find((entry) => TripHammerObject.works(entry.kind))?.kind;
    const held = workable ?? (this.heldItem === 'none' ? null : this.heldItem);
    return held ?? null;
  }

  private syncPlacementHints(): void {
    const hints = this.placementHints;
    if (!hints) return;
    const kind = this.heldItem;
    if (kind === 'none' || !MACHINE_ITEM_KINDS.has(kind) || kind === 'gear') {
      hints.clear();
      return;
    }
    const { x, y } = this.facingTile();
    const target = this.canBuildMachineAt(kind, x, y) ? { x, y } : null;
    // O extrator pinta os OUTROS lugares possíveis, e é a única peça que o faz: o lugar certo dele
    // não é óbvio (a broca tem de morder um veio), e o azul frio é o que ensina isso antes do
    // aperto.
    //
    // O MARTINETE pintava aqui o tile que ele ia BATER — a bigorna, dois passos adiante de quem
    // instalava —, e essa marca morreu com o motivo dela: a bigorna virou a BASE da máquina. O
    // relato que a fez nascer ("coloquei o martelo, coloquei a esponja, liguei na energia e nada
    // acontece") tinha uma causa mais funda que uma dica podia contornar mas não consertar, e o
    // conserto de verdade foi tirar o alvo invisível da peça.
    // A SEGUNDA CASA do martinete entra como marca fria: ele ocupa dois tiles, e uma máquina que
    // nasce por cima de um vizinho que o jogador não viu ser reservado é a mesma promessa quebrada
    // que o quadrado branco existe para evitar. Só aparece quando o gesto vai mesmo acontecer.
    const others: HintTile[] = kind === 'extractor'
      ? this.extractorSpots()
      : (target && kind === 'tripHammer'
        ? this.machineFootprint(kind, x, y).slice(1).map(([tx, ty]) => ({ x: tx, y: ty }))
        : []);
    hints.show(target, others);
  }

  /**
   * De costas pra qual veio este extrator deve nascer? `null` quando nao ha nenhum encostado.
   *
   * Entre dois veios ele prefere aquele cuja SAIDA esta livre — porque a alternativa e uma
   * maquina que nasce correta e entupida, e "nasceu entupida" e indistinguivel de "nasceu
   * quebrada" para quem esta aprendendo a peca. So se nenhuma saida servir ele aceita a primeira
   * pedra que achar: melhor uma maquina que precisa de um empurrao do que uma virada pro nada.
   */
  private extractorAim(wx: number, wy: number): PropDir | null {
    let fallback: PropDir | null = null;
    // N, L, S, O — a ordem canonica dos props direcionais, e nao a do CARDINAL_DIRS (que e a do
    // flood-fill): `dir` indexa a folha de arte, entao ele so pode ser contado nesta ordem.
    const DIRS: ReadonlyArray<readonly [PropDir, number, number]> = [
      [0, 0, -1], [1, 1, 0], [2, 0, 1], [3, -1, 0],
    ];
    for (const [dir, vx, vy] of DIRS) {
      // A entrada e o tile de TRAS (ver ExtractorObject.inputTile): P menos o vetor da direcao.
      if (this.getRockAt(wx - vx, wy - vy)?.ore !== true) continue;
      if (fallback === null) fallback = dir;
      const chest = this.getChestAt(wx + vx, wy + vy);
      const outputFree = chest ? chest.accepts('ore') : !this.isTileOccupied(wx + vx, wy + vy);
      if (outputFree) return dir;
    }
    return fallback;
  }

  /**
   * RECOLHER a maquina que esta a frente. TUDO que se instala se recolhe — inclusive o que o
   * mapa autorou.
   *
   * Isto e o par exato do `buildMachineAt`, e a razao de a construcao ser segura: todo gesto
   * deste jogo que poe alguma coisa no mundo tem um gesto que a tira (pousar com B, pegar com
   * B). Sem a volta, errar um tile custaria a peca — e o jogador pararia de experimentar, que e
   * a unica coisa que uma fabrica pede.
   *
   * O `playerBuilt` protegia a peca autorada, com o argumento de que desmontar o puzzle seria o
   * primeiro gesto de todo level. O usuario derrubou o argumento, e ele estava certo: uma linha
   * de demonstracao que nao se pode DESMONTAR nao ensina — ela so pode ser olhada. Desmontar a
   * vitrine e a forma mais direta de descobrir do que ela e feita, e tudo que sai dela volta pra
   * mochila, entao nada se perde. O campo continua existindo porque e ele que diz o que vai ao
   * SAVE (o mundo autorado ja mora no world.json; gravar tudo o duplicaria no proximo boot).
   *
   * A unica coisa blindada e o bau com QUOTA — ele nao e deposito, e a fechadura do level.
   */
  private pickUpMachineAt(wx: number, wy: number): boolean {
    const chest = this.getChestAt(wx, wy);
    // O BAU CHEIO NAO SOBE: ele se ESVAZIA primeiro, um punhado por aperto (`useChestAt` roda
    // antes deste na ordem do B). Recolher um bau com carga dentro seria a carga sumindo ou a
    // mochila enchendo de uma vez — as duas coisas caladas.
    //
    // E o bau com QUOTA nao sobe nunca: ele nao e um deposito, e a fechadura de um level. Esta e
    // a UNICA excecao a regra de que tudo que se instala se recolhe, e ela e sobre autoria, nao
    // sobre a peca: uma encomenda que o jogador pode carregar embora nao e uma trava.
    if (chest && chest.isEmpty && !chest.quota) {
      this.removeProp(this.chests, chest);
      return this.collectMachine('chest', wx, wy);
    }
    const belt = this.getBeltAt(wx, wy);
    if (belt) {
      this.removeProp(this.belts, belt);
      return this.collectMachine('belt', wx, wy);
    }
    const extractor = this.getExtractorAt(wx, wy);
    if (extractor) {
      this.removeProp(this.extractors, extractor);
      return this.collectMachine('extractor', wx, wy);
    }
    const furnace = this.getFurnaceAt(wx, wy);
    if (furnace) {
      this.removeProp(this.furnaces, furnace);
      return this.collectMachine('furnace', wx, wy);
    }
    const hammer = this.getTripHammerAt(wx, wy);
    if (hammer) {
      this.removeProp(this.tripHammers, hammer);
      return this.collectMachine('tripHammer', wx, wy);
    }
    // A LAJE VAZIA sobe; com uma peça em cima, não — o X ali é o gesto de tirar a peça (ver
    // `deliverToMachineAt`), e ele roda antes deste. É a mesma regra do baú cheio, e pela mesma
    // razão: recolher um móvel com carga dentro é a carga sumindo em silêncio.
    const altar = this.getAltarAt(wx, wy);
    if (altar && altar.carrying === null) {
      this.removeProp(this.altars, altar);
      return this.collectMachine('altar', wx, wy);
    }
    const boiler = this.getBoilerAt(wx, wy);
    if (boiler) {
      this.removeProp(this.boilers, boiler);
      return this.collectMachine('boiler', wx, wy);
    }
    const arm = this.getInserterAt(wx, wy);
    if (arm) {
      this.removeProp(this.inserters, arm);
      return this.collectMachine('inserter', wx, wy);
    }
    const wire = this.wires.find((w) => w.worldX === wx && w.worldY === wy);
    if (wire) {
      this.removeProp(this.wires, wire);
      return this.collectMachine('wire', wx, wy);
    }
    return false;
  }

  /** Tira o prop da lista IN PLACE (o propRegistry referencia ESTES arrays) e o destroi. */
  private removeProp<T extends WorldProp>(list: T[], prop: T): void {
    const idx = list.indexOf(prop);
    if (idx >= 0) list.splice(idx, 1);
    prop.destroy();
  }

  /** A peca recolhida volta para a mochila pelo caminho de qualquer item apanhado. */
  private collectMachine(kind: HeldItemKind, wx: number, wy: number): boolean {
    this.refreshWireNetwork();
    this.onCollectItem({ kind, worldX: wx, worldY: wy });
    return true;
  }

  /**
   * O mundo mudou de FORMA: um cabo nasceu, uma maquina saiu. Reindexa os cabos e reescreve os
   * plugues, para o fio entrar visivelmente na peca nova no MESMO frame.
   *
   * Isto era um passo de boot ("cabos e maquinas nao andam"). A frase morreu no dia em que a
   * maquina virou item — e esquecer de chamar isto num caminho novo de construcao nao quebra
   * nada logicamente (a rede e resolvida por posicao, todo frame), mas deixa o cabo desenhado
   * com a forma errada ate o proximo boot, que e o tipo de defeito que ninguem associa a causa.
   */
  private refreshWireNetwork(): void {
    this.wireIndex = new Map(this.wires.map((w) => [tileKey(w.worldX, w.worldY), w]));
    this.resolveWireShapes();
  }

  /**
   * MARTELAR A ESPONJA — o gesto que o martinete existe para tirar das maos do jogador.
   *
   * Uma lupa recem-saida do forno e ferro poroso encharcado de escoria: so vira metal util
   * depois de apanhar quente, ate a escoria espirrar fora. Sao `BLOOM_BLOWS` pancadas, as mesmas
   * que a maquina leva — e e essa igualdade que faz a automacao ser sentida como alivio, e nao
   * lida como numero.
   *
   * A contagem morre junto com a esponja: se o item sai do tile (o heroi pega, uma esteira leva),
   * o proximo bolo que chegar ali comeca do zero. Guardar pancadas de uma peca que nao esta mais
   * la faria a esponja seguinte sair pronta pela metade sem nada no mundo explicando por que.
   */
  private strikeBloomAt(wx: number, wy: number): boolean {
    if (this.itemManager?.kindAt(wx, wy) !== 'bloom') return false;
    const key = `${wx},${wy}`;
    const blows = (this.bloomBlows.get(key) ?? 0) + 1;
    this.swingHeld(wx, wy);
    getSoundManager().playHammer();
    this.world3d?.shake(60, 0.004);
    if (blows < BLOOM_BLOWS) {
      this.bloomBlows.set(key, blows);
      return true;
    }
    // A ULTIMA pancada: a escoria sai e o que fica e barra. A troca acontece no MESMO tile —
    // uma bigorna nao move a peca (a mesma lei do martinete). O QUE ela vira sai da tabela
    // compartilhada (`hammering.ts`): a martelada na mao, o martinete e o altar transformam
    // pelas mesmas linhas, ou a segunda receita nasce discordando de si mesma em tres lugares.
    this.bloomBlows.delete(key);
    const made = hammerResult('bloom') ?? 'iron';
    this.itemManager?.takeAt(wx, wy);
    this.itemManager?.drop(made, wx, wy);
    this.world3d?.shake(90, 0.007);
    return true;
  }

  /**
   * APANHAR o item deste tile. Devolve `false` quando nao havia nada — e ai o B segue pro resto
   * da sua tabela.
   *
   * O jogo coletava por PISADA, e isso acabou: andar por cima de uma coisa nao e escolher pega-la.
   * A regra vale nos dois sentidos e e o que torna o gesto reversivel — pousar com B e pegar de
   * volta com B —, alem de resolver sozinho o acidente que o flag `armed` do ItemPickup existia
   * para remendar (o item largado que voltava pra mao no mesmo frame).
   *
   * A mochila GUARDA em vez de trocar, entao pegar com a mao cheia e legitimo: o item novo entra
   * na lista e vira a selecao (`onCollectItem`), porque apanhar uma coisa e sempre a intencao de
   * usa-la.
   */
  /**
   * APANHAR PISANDO — o único jeito de pegar uma coisa do chão agora.
   *
   * Ele guarda com `stash` (nunca rouba a seleção) e só empunha o que cai numa mão que estava
   * vazia: quem atravessa a fábrica com a picareta escolhida sai do outro lado com a picareta.
   * A cerimônia de item novo continua acontecendo — mas só para o que tem gesto: um "ITEM GET"
   * de tela cheia para o terceiro minério do dia seria o jogo parando para nada.
   *
   * O FOGO E A CARGA só sobem junto com a peça se ela for parar na mão. Uma tocha acesa dentro da
   * mochila seria fogo que não está em lugar nenhum do mundo (a mesma lei do `selectItem`).
   */
  private collectUnderfoot(wx: number, wy: number): void {
    if (this.freezeManager?.frozenAt(wx, wy)) return; // item preso no gelo não sobe
    // O CHÃO DA MÁQUINA NÃO É O SEU BOLSO. Sem esta linha o herói vira um aspirador da própria
    // fábrica: atravessar a linha de esteiras leva a carga junto, passar pela bandeja do forno
    // desfaz a entrega que ele acabou de fazer, e pisar na bateria encaixada num cabo morto
    // ARRANCA a bateria — matando a rede que ela alimentava. Nenhum desses é um gesto; são
    // acidentes de caminho. Para tirar de volta o que está numa máquina existe o X (ver
    // `deliverToMachineAt`), que é o mesmo gesto do baú e da bigorna.
    if (this.machineFloorAt(wx, wy)) return;
    const taken = this.itemManager?.takeAt(wx, wy);
    if (!taken) return;
    const handWasEmpty = this.heldItem === 'none';
    this.inventory.stash(taken.kind, taken.units ?? 1);
    this.inventory.selectFirstIfEmpty();
    if (handWasEmpty && this.heldItem === taken.kind) {
      this.heldOnFire = taken.kind === 'wood' && taken.fire !== undefined;
      this.torchFuelMs = taken.fire?.fuelMs ?? 0;
      this.heldBatteryChargeMs = taken.kind === 'batteryFull'
        ? (taken.chargeMs ?? BATTERY_FEED_MS)
        : 0;
    }
    this.updateBackItem();
    if (isBagItem(taken.kind) && !this.seenItems.has(taken.kind)) {
      this.seenItems.add(taken.kind);
      this.showItemGet(taken.kind, () => {});
    } else {
      this.seenItems.add(taken.kind);
      // COISA NÃO SOA COMO MOEDA (ver playItemStash). Aqui tocava o tilintar do dinheiro, e com
      // ele um graveto, uma pedra e um minério entravam na mochila com o som da carteira — as
      // duas únicas coisas que este jogo pede que o jogador conte separado.
      getSoundManager().playItemStash();
    }
    this.persistAdventure();
  }

  /**
   * Este tile é CHÃO DE MÁQUINA? — a bandeja de uma estação, ou o corpo de uma peça que não é
   * sólida (esteira, cabo, placa). São os lugares onde um item deitado PERTENCE à máquina, e não
   * ao chão: a pisada não os apanha, e o X os devolve.
   */
  private machineFloorAt(wx: number, wy: number): boolean {
    if (this.machineAt(wx, wy)) return true;
    const slotOf = (prop: { slotTiles: readonly (readonly [number, number])[] }): boolean =>
      prop.slotTiles.some(([sx, sy]) => sx === wx && sy === wy);
    if (this.furnaces.some(slotOf) || this.toolboxes.some(slotOf)) return true;
    // A ENTRADA E A SAÍDA DO BRAÇO contam como chão da máquina: atravessar a linha não pode
    // roubar a carga que espera a garra, nem a que ela acabou de pousar do outro lado.
    return this.inserters.some((arm) => {
      const [sx, sy] = arm.sourceTile;
      const [dx, dy] = arm.destTile;
      return (sx === wx && sy === wy) || (dx === wx && dy === wy);
    });
  }

  private pickUpItemAt(wx: number, wy: number): boolean {
    // Item preso no gelo não sobe pra mochila: a mão bate no bloco (pulse) e o gesto acabou.
    if ((this.itemManager?.hasItemAt(wx, wy) ?? false) && this.freezeManager?.frozenAt(wx, wy)) {
      this.freezeManager.pulse(wx, wy);
      return true;
    }
    const taken = this.itemManager?.takeAt(wx, wy);
    if (!taken) return false;
    this.onCollectItem({
      kind: taken.kind, worldX: wx, worldY: wy,
      fire: taken.fire, chargeMs: taken.chargeMs, units: taken.units,
    });
    return true;
  }

  /**
   * Pousar o item selecionado num tile livre. Um tile guarda UM item (dois seriam um
   * desaparecimento silencioso), e nada se pousa dentro de parede, prop ou bicho.
   *
   * O fogo e a carga DESCEM junto: um graveto aceso deixado no chao continua queimando (e
   * acende o que houver de inflamavel ao lado), e uma bateria cheia pousada ao lado de um cabo
   * morto alimenta a rede. Os dois eram, ate aqui, consequencia de pisar; agora sao de por.
   */
  private placeItemAt(wx: number, wy: number): boolean {
    const kind = this.heldItem;
    if (kind === 'none' || !this.itemManager) return false;
    if (this.itemManager.hasItemAt(wx, wy) || this.isTileOccupied(wx, wy)) return false;

    const fire = this.isTorchLit ? { fuelMs: this.torchFuelMs } : undefined;
    const charge = kind === 'batteryFull' ? this.heldBatteryChargeMs : undefined;
    const onDeadWire = this.wireIndex.has(`${wx},${wy}`) && !this.liveWires.has(`${wx},${wy}`);
    // O PACOTE pousa inteiro (semente e minério — ver UNIT_PACK_KINDS): o punhado da mochila
    // vira um item só no chão, e pegá-lo de volta devolve a mesma contagem (ItemPickup.units).
    // Pousar uma e pegar cinco seria uma máquina de imprimir semente — o pacote viaja.
    const units = UNIT_PACK_KINDS.has(kind) ? this.inventory.count(kind) : 1;
    if (UNIT_PACK_KINDS.has(kind)) {
      this.inventory.remove(kind, units);
      this.updateBackItem();
    } else {
      this.clearHeldItem();
    }
    this.itemManager.drop(kind, wx, wy, fire, charge, units);
    if (fire) this.scheduleGroundTorchSpread(wx, wy);
    if (kind === 'batteryFull' && onDeadWire) getSoundManager().playBatteryDock();
    else getSoundManager().playFootstep(); // o baque surdo de pousar algo no chao
    this.persistAdventure();
    return true;
  }

  /**
   * A TABELA DE ITENS — o que cada coisa na mao faz contra o tile a frente. Ela era o corpo do
   * esbarrao, depois foi o botao B; hoje ela e o BOTAO A ("o botao de acao usa o item
   * segurado" — ver swingAttack, que ja pagou cadencia, raiz, investida e pose antes de chamar
   * aqui). O esbarrao ficou so com os gestos de CORPO (handlePlayerBump); o B ficou com pegar,
   * falar e pousar.
   *
   * Devolve true quando o item fez alguma coisa — inclusive quando ele foi RECUSADO por uma
   * regra do proprio prop (uma agua que nao aceita ponte ali). Falso significa "este tile nao
   * tem nada a ver com o que voce esta segurando" — e ai o swingAttack faz o arco sair no
   * VAZIO (a lei do A). Pousar nao e mais o fallback disto: pousar mora no B.
   */
  private useItemAt(wx: number, wy: number): boolean {
    // A ESPONJA vem antes de tudo, e ela e o unico caso desta tabela que NAO olha QUAL item esta
    // na mao: martelar nao e usar uma ferramenta, e bater — serve o machado, a picareta, a pedra.
    // Mao vazia e espada empunhada nao chegam aqui (o A delas e combate, ver swingAttack), e isso
    // esta certo nas duas pontas: ninguem soca ferro quente, e ninguem malha uma lupa com o fio
    // de uma lamina.
    if (this.strikeBloomAt(wx, wy)) return true;
    // A PEÇA NO ALTAR, pela mesma regra e no mesmo degrau: se a laje segura algo que a pancada
    // TRABALHA, o X é uma pancada — não importa o que esteja na mão (a picareta, o machado, uma
    // pedra), porque malhar não é usar uma ferramenta, é bater. O que ela segura e a pancada não
    // trabalha cai adiante, na ENTREGA, onde o X vira o gesto de tirar de volta: assim todo aperto
    // contra o altar faz alguma coisa, e o jogador nunca fica com uma peça presa na mesa.
    const onAltar = this.getAltarAt(wx, wy)?.carrying;
    if (onAltar && hammerResult(onAltar) !== undefined) {
      this.swingHeld(wx, wy);
      return this.strikeAltarAt(wx, wy);
    }
    // Um bicho na frente leva o item na cara, na escada de dano de sempre (MELEE_DAMAGE): o
    // graveto ACESO mata de um golpe, uma ferramenta qualquer em dois. E o que mantem a tocha
    // sendo uma arma agora que o A e so a espada.
    const enemy = this.enemyManager?.getEnemyAt(wx, wy);
    if (enemy && MELEE_DAMAGE[this.heldItem as HeldItemKind] !== undefined) {
      // ATACAR PRENDE OS PES — inclusive pelo B. A raiz e a investida moravam so no botao A, e a
      // exceção caiu justo no golpe mais forte que o jogo tem: o graveto ACESO e a unica coisa que
      // ainda mata de um golpe, e era tambem a unica que se dava em velocidade maxima de
      // caminhada. Sem compromisso, espacamento nao custa nada (ver SWING_ROOT_MS).
      //
      // So neste ramo, nunca no resto da tabela do B: prender os pes para apanhar um graveto, usar
      // o machado numa arvore ou pousar uma pedra seria o defeito oposto — o jogo travando no meio
      // de um gesto que nao e uma briga.
      this.movementController?.root(SWING_ROOT_MS);
      this.lungeIntoSwing();
      // O corpo entra no golpe do B tambem — mas SO neste ramo. As outras coisas que o B balanca
      // (o machado na arvore, a picareta na rocha) tem gesto proprio, e por cima: um golpe de cima
      // com a pose de um golpe horizontal seriam duas animacoes discordando no mesmo frame.
      this.hero.attackMs = SWING_POSE_MS;
      if (enemy.isSpawning) {
        this.swingHeld(wx, wy);
        enemy.flashImmune();
        this.spawnDeflect(wx, wy);
        // O mesmo pacote de recusa do botao A (ver sweepArc): anel frio, raspao e um tranco curto.
        // O B tambem e uma arma, e uma recusa muda de um lado e sonora do outro seriam duas regras.
        getSoundManager().playBladeGlance();
        this.world3d?.shake(40, 0.03);
        this.triggerHitstop(GLANCE_HITSTOP_MS);
        return true;
      }
      this.strikeEnemy(enemy, wx, wy, 'item');
      return true;
    }

    // TILE CONGELADO RECUSA A TABELA INTEIRA: o machado não morde a árvore no gelo, a picareta
    // não abre a rocha, a tocha não acende a fogueira morta — até o degelo. Um gate só, espacial
    // (ver FreezeManager.frozenAt), em vez de um `if` por linha da tabela; a resposta é o tremor
    // do bloco. `true` = o gesto foi gasto aqui — o item NÃO cai no chão como fallback.
    // (O corpo congelado ficou de fora de propósito, no ramo acima: gelo trava, nunca protege.)
    if (this.freezeManager?.frozenAt(wx, wy)) {
      this.freezeManager.pulse(wx, wy);
      return true;
    }

    // INSTALAR UMA MAQUINA é usar — a tabela inteira já é "o que este item faz contra o tile à
    // frente", e uma caldeira faz uma coisa muito clara contra um tile vazio: vira uma caldeira.
    // Não é um modo de construção, não é um menu, não é um botão novo — é a mesma linha da tabela
    // em que mora o machado contra a árvore. (Recolher é o mesmo X, depois que a tabela cala.)
    if (this.buildMachineAt(wx, wy)) return true;

    // O ITEM QUE NÃO É ARMA CONTRA UM CORPO — o balde, a bomba, as botas, as sementes. Era o
    // único gesto MUDO do botão B: o ramo armado acima exigia entrada na MELEE_DAMAGE, o resto da
    // tabela não sabe de bicho, e `placeItemAt` recusava em silêncio porque o tile está ocupado.
    // O jogador apertava B e nada no mundo se mexia — a leitura de botão quebrado. A lei é "toda
    // recusa tem desenho próprio": o item balança (o gesto que ele pediu), o corpo ABSORVE o toque
    // (o mesmo agachamento do recuo da torreta: encostou, não ganhou terreno) e um toc surdo diz
    // que ali não havia mordida nenhuma. Sem raiz nos pés: cutucar não é atacar.
    if (enemy) {
      this.swingHeld(wx, wy);
      if (!enemy.isSpawning) enemy.triggerKnockback(0, 0);
      getSoundManager().playItemBonk();
      return true;
    }

    // AS DUAS PEÇAS QUE SE POUSAM, e são só estas duas — o resto da mochila age contra o tile.
    //
    //   - a ESPONJA, porque o uso dela é ser MARTELADA onde está (é o motivo de a `bloom` não ter
    //     virado contador junto com o minério e o ferro: esses são números que entram numa receita,
    //     e ela é um objeto que se trabalha);
    //   - a BATERIA sobre um CABO, que é o ENCAIXE: pousada ao lado da rede morta ela é a semente
    //     do flood-fill (updateWireEnergy) e a única forma de energia atravessar um vão. Ela vivia
    //     do gesto de largar, e largar acabou — sem esta linha, a peça inteira ficaria sem porta de
    //     entrada e o cabo isolado nunca mais acenderia.
    //
    // DEPOIS do corpo à frente, de propósito: contra um bicho o pouso falharia (o tile está
    // ocupado) e o gesto sairia MUDO, sem nem o toc de cutucar. Contra a bigorna do martinete ele
    // também falha — e aí é a entrega que assume, ver `deliverToMachineAt`.
    const held = this.heldItem;
    if (held === 'bloom') return this.placeItemAt(wx, wy);
    if ((held === 'batteryFull' || held === 'battery') && this.wireIndex.has(`${wx},${wy}`)) {
      return this.placeItemAt(wx, wy);
    }

    // Campfire interaction. A LIT fire relights/refuels the carried torch; a DEAD fire is
    // brought back to life by carrying a flame into it (the heart of the game).
    const campfire = this.getCampfireAt(wx, wy);
    if (campfire) {
      if (campfire.isLit) {
        if (this.heldItem === 'bucketFull') {
          // Throw the bucket of water on the fire — the water leaves the bucket with the swing,
          // ARCS across as a slug of droplets, and the fire hisses out when it LANDS. The one
          // deliberate way to UNDO a fire (one use, then back to the river).
          this.swingHeld(wx, wy);
          this.time.delayedCall(120, () => {
            this.throwBucketWater(wx, wy, () => this.douseCampfire(campfire, wx, wy));
          });
        } else if (this.isFlammableHeld) {
          this.swingHeld(wx, wy);
          // Light the torch at the fire, or top it back up if it's already burning.
          if (!this.heldOnFire) this.time.delayedCall(150, () => { this.igniteHeldItem(); });
          else this.refuelTorch();
        } else {
          // Qualquer outro item na fogueira acesa nao faz nada: SENTAR nela (a loja) e um gesto
          // de corpo e mora no esbarrao — ver handlePlayerBump.
          return false;
        }
      } else if (this.isFlammableHeld && this.heldOnFire) {
        // Carry the flame into a dead campfire to reignite the world.
        this.swingHeld(wx, wy);
        this.time.delayedCall(150, () => { this.lightCampfire(campfire, wx, wy); });
      }
      return true;
    }

    // The boiler asks for BOTH elements, each by its own bump: the lit torch STOKES the
    // firebox (~16s of internal burn — a timed round trip, never a switch; the torch survives
    // the transfer, like lighting a campfire), and the full bucket FILLS the tank (the throw
    // empties the bucket, like dousing). Steam IS the water leaving: only fire over a WET tank
    // pressurizes, and boiling drains the sight glass until the next bucket. The two dark
    // voids in the art are the two visual asks (cold mouth = fire, empty glass = water) — e a
    // ARTE e quem diz o que falta agora, sem balao nenhum traduzindo.
    const boiler = this.getBoilerAt(wx, wy);
    if (boiler) {
      if (this.heldItem === 'bucketFull') {
        this.swingHeld(wx, wy);
        this.time.delayedCall(120, () => {
          this.throwBucketWater(wx, wy, () => {
            boiler.fillWater();
            getSoundManager().playSplash();
          });
        });
      } else if (this.isFlammableHeld && this.heldOnFire) {
        this.swingHeld(wx, wy);
        this.time.delayedCall(150, () => {
          boiler.stoke();
          this.spawnFireHitEffect(wx, wy);
        });
      }
      return true;
    }

    // Lava is molten fire: bumping it with a flammable item (no flame yet) lights the torch,
    // exactly like a lit campfire. With the lava boots on, the hero walks onto it instead of
    // bumping, so this only fires when lava is blocking.
    const lava = this.getLavaAt(wx, wy);
    if (lava && !lava.solidified) {
      // While a stone is still SINKING in (`cooling`), the tile blocks and takes no interaction —
      // the hero cannot cross a half-placed stone, so he just waits for it to settle. Interactions
      // apply only to still-molten lava.
      if (!lava.cooling) {
        if (this.heldItem === 'stone') {
          // A stone dropped into the melt sinks to a stepping-stone crown — the lava twin of the
          // stone ford. It costs the stone but frees the hand (no boots needed to cross here once
          // it settles), and the tile is a firebreak forever after.
          this.swingHeld(wx, wy); // toss the stone into the lava
          this.clearHeldItem();
          this.time.delayedCall(150, () => { this.solidifyLava(lava, wx, wy); });
        } else if (this.isFlammableHeld && !this.heldOnFire) {
          this.swingHeld(wx, wy);
          this.time.delayedCall(150, () => { this.igniteHeldItem(); });
        }
      }
      return true;
    }

    // River — only tiles marked with a `bridgeSpot` are buildable. Two things can span it, and
    // WHICH you choose is a real decision, not a formality:
    //   - two gravetos build a plank deck. It is wood: fire runs across it (and eats it).
    //   - ONE stone fords it. Cheaper, instant, permanent — and fire stops dead at it.
    // A floor, or a fuse. Plain river tiles just block (no interaction).
    const water = this.getWaterAt(wx, wy);
    if (water?.blocking) {
      if (this.heldItem === 'bucket') {
        // Dip the empty bucket in the river to fill it — works on ANY river tile, not just a
        // bridgeSpot (you are drawing water, not building). The full bucket douses a campfire.
        this.fillBucket(wx, wy);
      } else if (water.canBuild) {
        if (this.heldItem === 'stone') {
          this.clearHeldItem(); // the stone goes into the river
          water.placeStone();
        } else if (this.heldItem === 'wood') {
          this.clearHeldItem(); // the graveto is consumed
          // WaterObject owns the carpentry now: it nails this deposit's boards in with hammer
          // beats + sawdust, and cross-fades to the finished tile (firing onBuilt) on the last.
          water.deposit();
        }
      }
      return true;
    }

    // A OUTRA PROCEDÊNCIA da água: a pintada no TERRENO (SEA_TILE_FRAMES — é assim que o
    // overworld escreve TODO rio, lago e oceano). O balde enchia só no rio-prop, e esse era o
    // gesto MUDO da aventura: B mirando a água do mundo grande não fazia nada (o pousar recusa
    // em silêncio porque o mar bloqueia) — e sem encher o balde, regar um canteiro era
    // impossível fora dos levels: a fazenda inteira nascia trancada no modo principal.
    // `isOpenWaterAt` é a resposta ÚNICA para as duas procedências (a lição do zora) — e uma
    // ponte, um vau ou um canal drenado deixam de ser água em cima dela, como têm de deixar.
    if (this.heldItem === 'bucket' && this.isOpenWaterAt(wx, wy)) {
      this.fillBucket(wx, wy);
      return true;
    }

    // Dry bush — a flaming item sets it alight; it chars to ash and opens the tile.
    const bush = this.getDryBushAt(wx, wy);
    if (bush?.blocking) {
      bush.shake();
      // O GRAVETO APAGADO É O ÚNICO CASO EM QUE O HERÓI PENSA ALTO. Ele bateu no arbusto com a
      // coisa certa na mão e não aconteceu nada — e a distância entre o que ele tem e o que ele
      // precisa é UM gesto (acender numa fogueira, na lava, num arbusto já em chamas). Isto não é
      // o balão de item-que-falta que foi arrancado: aquele respondia a qualquer fechadura e
      // entregava a solução de um enigma; este só existe quando o item JÁ ESTÁ NA MÃO e o gesto
      // JÁ FOI FEITO. Sem ele o jogo respondia com um tremor idêntico ao de "isto é uma parede",
      // e as duas coisas não são a mesma — uma diz "não é aqui", a outra diz "falta uma faísca".
      if (this.isFlammableHeld && !this.heldOnFire) this.heroThought?.show(ASSET_KEYS.thoughtTorch);
      if (this.isFlammableHeld && this.heldOnFire) {
        this.swingHeld(wx, wy);
        // Ignite when the flame reaches the bush (end of the main swing arc).
        this.time.delayedCall(150, () => {
          if (!bush.ignite()) return;
          profiler.mark('bush.ignite');
          this.spawnFireHitEffect(wx, wy);
          this.scheduleFireSpread(wx, wy); // it will carry to whatever is touching it
        });
      }
      return true;
    }

    // Dry tree — the axe chops it down stage by stage until only a stump is left. On the
    // felling chop: if water lies beyond in the chop direction, TIMBER! — the trunk topples
    // across the river as a free log bridge. Otherwise it just drops a graveto on the ground.
    const tree = this.getDryTreeAt(wx, wy);
    if (tree?.blocking) {
      if (this.holdsAnAxe) {
        this.swingHeld(wx, wy);
        // Capture the chop direction now (the hero is stopped, but a queued key could shift it).
        const px = this.playerWorld.worldX;
        const py = this.playerWorld.worldY;
        this.time.delayedCall(150, () => {
          if (tree.chop()) {
            getSoundManager().playWoodChop();
            if (!tree.blocking) {
              if (this.tryTimberBridge(tree.worldX, tree.worldY, wx - px, wy - py)) {
                tree.cancelRegrow(); // its trunk became the bridge — no regrowth
              } else {
                this.dropTreeStick(tree.worldX, tree.worldY);
              }
            }
          }
        });
      } else {
        tree.shake();
      }
      return true;
    }

    // Dry shrub — a small dead bush the axe clears in one hit. It drops nothing and never grows
    // back: purely a physical barrier.
    const shrub = this.getDryShrubAt(wx, wy);
    if (shrub?.blocking) {
      if (this.holdsAnAxe) {
        this.swingHeld(wx, wy);
        this.time.delayedCall(150, () => {
          if (shrub.chop()) {
            getSoundManager().playWoodChop();
            this.spawnBridgeChips(wx, wy, 4);
          }
        });
      } else {
        shrub.shake();
      }
      return true;
    }

    // Rock — the pickaxe cracks it, then shatters it open, and the shattered rock LEAVES A
    // STONE BEHIND. That drop is the whole point of the item: a pickaxe that only removed its
    // obstacle produced nothing but passage, which makes it a password rather than a tool.
    // Now its output (stone) is another interaction's input (a ford across the river) — the
    // same shape as the axe, which is the only item that was ever interesting for exactly this
    // reason: a felled tree becomes firewood, or a bridge.
    const rock = this.getRockAt(wx, wy);
    if (rock?.blocking) {
      if (this.heldItem === 'pickaxe') {
        // The direction of the blow, captured now: the delayed impact below must not read the
        // hero's facing again, since a queued key could have turned him in the meantime.
        const dirX = Math.sign(wx - this.playerWorld.worldX);
        const dirY = Math.sign(wy - this.playerWorld.worldY);
        this.swingPickaxe(wx, wy);
        this.time.delayedCall(CHOP_IMPACT_MS, () => {
          const blow = rock.smash(dirX, dirY);
          if (blow === 'none') return;
          getSoundManager().playRockSmash();
          this.spawnRockDebris(wx, wy, dirX, dirY, blow !== 'struck', rock.ore);
          // A pedra comum ABRE e deixa o espolio no tile; o VEIO de ferro nunca abre — a cada
          // ciclo de 3 pancadas ele PRODUZ um bloco, que espalha como moeda em volta da pedra.
          if (blow === 'shattered') this.dropRockSpoil(rock);
          else if (blow === 'yielded') this.spawnOreLoot(rock);
        });
      } else {
        rock.shake();
      }
      return true;
    }

    // Moonflower — a shut bud in the light. No item opens it; only the DARK does (put out the
    // campfires nearby, e.g. with the bucket). A bump just rustles it — the cat's lines carry
    // the rule.
    const flower = this.getMoonflowerAt(wx, wy);
    if (flower?.blocking) {
      flower.shake();
      return true;
    }

    // A planted mound — the seed under fresh earth, waiting for water. Bump with the FULL
    // bucket to water it (the douse gesture turned nurturing); the grass sprouts a while later.
    // A dry-handed bump just rustles it; an already-watered mound just waits.
    const plantSpot = this.getPlantSpotAt(wx, wy);
    if (plantSpot?.blocking) {
      if (plantSpot.isMound && this.heldItem === 'bucketFull') {
        this.swingHeld(wx, wy);
        this.time.delayedCall(120, () => {
          this.throwBucketWater(wx, wy, () => this.waterPlantSpot(plantSpot, wx, wy));
        });
      }
      return true;
    }

    // A PLANTA CARNÍVORA responde como o mato (é planta): a foice a derruba (sem colheita —
    // predador não é lavoura), o fogo a acende (e espalha — combustível como toda planta),
    // qualquer outra coisa a faz retesar. Ela nunca morde o herói: é a peça DELE.
    const carnivore = this.getCarnivorousPlantAt(wx, wy);
    if (carnivore?.blocking) {
      if (this.heldItem === 'scythe') {
        this.swingHeld(wx, wy);
        getSoundManager().playGrassCut();
        this.time.delayedCall(110, () => carnivore.cut());
      } else if (this.isFlammableHeld && this.heldOnFire) {
        this.swingHeld(wx, wy);
        this.time.delayedCall(150, () => {
          if (!carnivore.ignite()) return;
          this.spawnFireHitEffect(wx, wy);
          this.scheduleFireSpread(wx, wy);
        });
      } else {
        carnivore.shake();
      }
      return true;
    }

    // Tall grass — the scythe mows it down to stubble; fire burns it to the same stubble.
    const grass = this.getTallGrassAt(wx, wy);
    if (grass?.blocking && grass.isTall) {
      if (this.heldItem === 'scythe') {
        this.swingHeld(wx, wy);
        getSoundManager().playGrassCut();
        // The mow drops a handful of SEEDS on the stubble — the scythe's product. Plant them in
        // a dug hole (plantSpot), water, and the grass grows back: the renewable fuel loop.
        this.time.delayedCall(110, () => { if (grass.cut()) this.dropSeeds(grass.worldX, grass.worldY); });
      } else if (this.isFlammableHeld && this.heldOnFire) {
        this.swingHeld(wx, wy);
        this.time.delayedCall(150, () => {
          if (!grass.ignite()) return;
          this.spawnFireHitEffect(wx, wy);
          this.scheduleFireSpread(wx, wy); // grass carries fire — this is the fuse
        });
      } else {
        grass.shake();
      }
      return true;
    }

    // (O portao de bater NAO esta nesta tabela: nenhum item o abre — o que o abre e o corpo,
    // e por isso ele mora no esbarrao. Ver handlePlayerBump.)

    // Locked door — opens when the hero is holding a key. The key is NOT consumed: it stays
    // in hand (no item is ever destroyed), so it can open more doors.
    const door = this.getLockedDoorAt(wx, wy);
    if (door?.blocking) {
      if (this.heldItem === 'key') {
        // Swing the key at the door with the sword's exact slash arc, then open when the
        // swing lands (same timing the flaming torch uses to ignite a bush).
        door.shake();
        if (this.swordSlash && this.camera) {
          getSoundManager().playSwordSlash();
          this.hideBackItemDuringSwing(); // the key swings out of hand, so hide the back copy
          const dx = wx - this.playerWorld.worldX;
          const dy = wy - this.playerWorld.worldY;
          const screen = this.camera.tileToScreen(this.playerWorld.worldX, this.playerWorld.worldY, this.tileSize);
          this.swordSlash.slash(screen.x, screen.y, dx, dy, this.tileSize, {
            texture: ASSET_KEYS.keyItem,
            frame: KEY_FRAMES.held,
          });
        }
        this.time.delayedCall(150, () => {
          if (!door.unlock()) return;
          getSoundManager().playShopOpen();
          // A floodgate drains the water it dammed — a key that reshapes the map, not just opens
          // a tile: a new path AND a fresh firebreak where the river used to run.
          if (door.isFloodgate) this.openFloodgate(door.worldX, door.worldY);
        });
      } else {
        door.shake();
      }
      return true;
    }

    // A ARVORE que e TILE — a floresta em si, e a unica coisa que o machado de aco faz e o
    // comum nao. Por ultimo, depois de todo prop: props ficam EM CIMA de tiles, entao uma rocha
    // ou uma porta na frente de um pinheiro respondem primeiro.
    if (this.tryChopTreeTile(wx, wy)) return true;

    // As MARCAS que pedem um item especifico. Elas vem depois das travas porque uma marca e um
    // chao com desenho: nunca disputam tile com uma rocha ou uma porta.
    const bombSpot = this.getBombSpotAt(wx, wy);
    if (bombSpot && !bombSpot.isSpent && this.heldItem === 'bomb') {
      // A ordem importa: primeiro a bomba REALMENTE planta, so entao o fantasma se gasta. Ao
      // contrario, um placeBombAt recusado consumiria a marca sem produzir bomba nenhuma.
      if (this.placeBombAt(wx, wy)) bombSpot.use();
      return true;
    }

    // A SEMENTE no buraco aberto — o plantio, no compasso da casa: o golpe desenha, a terra
    // recebe no impacto, e a semente só é GASTA se entrou (o buraco teve 150ms pra deixar de
    // ser buraco). As DUAS sementes plantam pelo mesmo gesto — o canteiro lembra qual recebeu
    // (sownKind) e é isso que decide o broto: mato, ou a planta carnívora. Pousar uma semente
    // EM CIMA do buraco continua possível — pelo B, como item.
    const hole = this.getPlantSpotAt(wx, wy);
    if (hole?.isHole && SEED_PACK_KINDS.has(this.heldItem)) {
      const sowing = this.heldItem as PlantableSeed;
      this.swingHeld(wx, wy);
      this.time.delayedCall(150, () => {
        if (this.heldItem === sowing && hole.isHole && hole.plant(sowing)) this.clearHeldItem();
      });
      return true;
    }

    // A PÁ — a única ferramenta cuja fechadura é o CHÃO NU de terra (canDigAt): ela cava um
    // canteiro (plantSpot). Por último de propósito, depois de todo prop e de toda marca:
    // qualquer coisa EM CIMA da terra responde primeiro, e onde não há terra o `false` deixa
    // o arco sair no vazio.
    if (this.heldItem === 'shovel' && this.canDigAt(wx, wy)) {
      this.swingHeld(wx, wy);
      this.time.delayedCall(150, () => this.digPlantHole(wx, wy));
      return true;
    }

    return false;
  }

  /**
   * O ESBARRAO, agora so com gestos de CORPO: empurrar o caixote, abrir o portao de bater,
   * conversar, sentar na fogueira acesa — e apanhar de quem esta do outro lado.
   *
   * Bater deixou de acontecer aqui. Enquanto andar contra o inimigo resolvesse, o botao A nao
   * significaria nada; encostar num bicho passa a ser dano de CONTATO, como no Zelda. E o que o
   * corpo ainda faz contra uma trava e o que sempre fez: um tremor, nunca uma legenda.
   */
  private handlePlayerBump(wx: number, wy: number): void {
    // A bump interrupts movement and re-pins the hero to screen centre. The idle breathing
    // pose parks the sprite on a bottom origin with a compensating y-offset, so that repin
    // must happen from the canonical centre origin — otherwise the hero visibly jumps up
    // half a tile. Bumps aren't steps, so nothing else stops breathing here.
    this.stopBreathing();

    // GELO TRAVA TODO GESTO DE CORPO — o caixote não empurra, o portão não gira, a fogueira não
    // senta, e o BICHO congelado não morde (uma estátua não cobra dano de contato: é exatamente
    // o prêmio de congelá-la). A recusa é o tremor do bloco, nunca um texto (a lei da casa).
    if (this.freezeManager?.frozenAt(wx, wy)) {
      this.freezeManager.pulse(wx, wy);
      return;
    }

    // Empurrar: colidir com um caixote tenta exatamente um empurrao cardinal. O heroi fica no
    // tile em que esta; no passo seguinte ele entra no espaco que o caixote deixou.
    const crate = this.getWoodenCrateAt(wx, wy);
    if (crate) {
      const dx = Math.sign(wx - this.playerWorld.worldX);
      const dy = Math.sign(wy - this.playerWorld.worldY);
      if (dx !== 0 || dy !== 0) {
        if (this.isTileOccupied(wx + dx, wy + dy)) crate.refusePush(dx, dy);
        else crate.push(dx, dy);
      }
      this.updateMechanismCircuits(0);
      return;
    }

    // (FALAR SAIU DAQUI. O esbarrao abria o dialogo, e com isso conversar era a unica coisa do jogo
    // que acontecia sem ninguem ter pedido: bastava a seta encostar no NPC — atravessando um vao,
    // fugindo de uma caveira, tentando contornar o velho pra chegar na fogueira — e a tela parava.
    // Hoje falar e o botao B, como usar qualquer coisa (ver `talkToNpcAt`). O esbarrao continua
    // fazendo o que faz com toda parede: VIRA o heroi para o NPC, que e justamente o gesto de mira
    // que o B precisa. E a afordancia ja existia e nao custou nada — o "!" que flutua sobre quem tem
    // assunto novo agora aponta para um botao em vez de descrever um acidente.)

    // Portao de bater — a porta sem chave, e o unico bloqueio que o CORPO abre. Ele gira para o
    // lado de la, entao qualquer coisa parada no tile atras dele trava tudo, e o sentido do
    // esbarrao (nao uma rotacao autorada) e quem diz onde e "o lado de la".
    const gate = this.getSwingGateAt(wx, wy);
    if (gate?.blocking) {
      const dx = Math.sign(wx - this.playerWorld.worldX);
      const dy = Math.sign(wy - this.playerWorld.worldY);
      if (this.isTileOccupied(wx + dx, wy + dy)) {
        gate.refuse();
        getSoundManager().playGateStrain();
      } else {
        gate.swingOpen();
        getSoundManager().playGateSwing();
      }
      return;
    }

    // Encostar num bicho e DANO DE CONTATO: ele responde pelo caminho de sempre (i-frames,
    // arremesso, tremor), entao andar contra a caveira continua sendo uma pessima ideia — so
    // que agora e ela quem ganha a troca.
    const enemy = this.enemyManager?.getEnemyAt(wx, wy);
    if (enemy && !enemy.isSpawning) {
      if (this.turnedTowardCreature(wx, wy, enemy)) return;
      this.handleEnemyAttackPlayer({ enemy, ranged: false, bump: true, fromX: enemy.worldX, fromY: enemy.worldY });
      return;
    }

    // Fogueira: o esbarrao so faz a chama reagir (a LOJA que abria aqui foi removida por
    // inteiro — moeda agora se ganha e se gasta no MUNDO: caveira, balcão de NPC, selo de
    // estrada). Acender, apagar e reabastecer a tocha vivem no botao B.
    const campfire = this.getCampfireAt(wx, wy);
    if (campfire) {
      campfire.onHit();
      return;
    }

    // Tudo o mais responde FISICAMENTE, e so: a rocha estremece, a porta chacoalha, a bancada
    // sacode as ferramentas la dentro. O corpo nunca diz o que falta.
    this.bumpRefusal(wx, wy);
  }

  /**
   * MIRAR NUM MONSTRO E DE GRACA — e este metodo e a reforma inteira num paragrafo.
   *
   * A parede vira o heroi (`PlayerMovementController`), e e assim que se mira: os dois botoes
   * agem no tile a frente, entao apertar a seta contra uma coisa e o unico jeito de encara-la. So
   * que um MONSTRO tambem e uma coisa que bloqueia — e apertar a seta contra ele cobrava um
   * coracao de dano de contato. Com uma caveira ao norte e o heroi olhando pro sul, a jogada
   * correta do jogo era se machucar de proposito pra poder revidar. Nenhum Zelda cobra isso,
   * porque em nenhum deles virar custa alguma coisa.
   *
   * Entao a primeira investida contra uma criatura que o heroi AINDA NAO ENCARA gasta-se virando
   * o corpo, e nada mais. A carencia existe porque um toque humano dura de 3 a 6 frames: sem ela
   * o segundo frame da mesma tecla ja leria "ja estou olhando pra ele" e cobraria o coracao que o
   * primeiro perdoou — o perdao duraria 16ms e o jogador nunca o veria. Continue apertando e o
   * dano de contato volta inteiro: encostar num monstro continua sendo uma pessima ideia, so
   * deixou de ser o preco de olhar pra ele.
   *
   * Vale SO para criatura. Caixote, portao de bater, NPC e rocha continuam respondendo ao
   * primeiro esbarrao, venha ele de onde vier: nenhum deles cobra nada por ser tocado, e adiar a
   * resposta deles seria transformar um perdao em atraso.
   *
   * E vale so para AQUELA criatura. A carencia perdoa o toque humano que sobra do gesto de virar,
   * e um toque humano acontece contra um corpo so — cercado, o perdao gasto numa caveira nao pode
   * comprar meio esbarrao de graca na proxima.
   */
  private turnedTowardCreature(wx: number, wy: number, enemy: EnemyBase): boolean {
    const now = this.time.now;
    const f = this.movementController?.facing;
    // O controlador chama o esbarrao ANTES de escrever a nova direcao, entao `facing` aqui ainda
    // e para onde o heroi olhava — que e exatamente a pergunta que este metodo faz.
    const turning = f !== undefined
      && (Math.sign(wx - this.playerWorld.worldX) !== f.dx
        || Math.sign(wy - this.playerWorld.worldY) !== f.dy);
    if (turning) {
      this.creatureTurnGraceUntilMs = now + CREATURE_TURN_GRACE_MS;
      this.creatureTurnGraceOn = enemy;
      return true;
    }
    return this.creatureTurnGraceOn === enemy && now < this.creatureTurnGraceUntilMs;
  }

  /**
   * A recusa fisica de uma trava. E o que sobra do esbarrao depois que os itens foram para o
   * botao B: o mundo responde ao corpo, sem nunca dizer qual e a chave (o balao de
   * item-que-falta foi arrancado do jogo e nao volta por esta porta).
   */
  private bumpRefusal(wx: number, wy: number): void {
    const gateElec = this.getElectronicGateAt(wx, wy);
    if (gateElec?.blocking) { gateElec.bump(); return; }

    const toolbox = this.getToolboxAt(wx, wy);
    if (toolbox) { toolbox.bump(); getSoundManager().playToolboxRefuse(); return; }

    const furnace = this.getFurnaceAt(wx, wy);
    if (furnace) { furnace.bump(); getSoundManager().playToolboxRefuse(); return; }

    this.getRockAt(wx, wy)?.shake();
    this.getDryTreeAt(wx, wy)?.shake();
    this.getDryShrubAt(wx, wy)?.shake();
    this.getDryBushAt(wx, wy)?.shake();
    this.getMoonflowerAt(wx, wy)?.shake();
    this.getLockedDoorAt(wx, wy)?.shake();
    this.getCarnivorousPlantAt(wx, wy)?.shake();
    const grass = this.getTallGrassAt(wx, wy);
    if (grass?.blocking && grass.isTall) grass.shake();
  }

  /**
   * Land a melee blow on an enemy at (wx, wy): damage, swing arc, knockback, and all the
   * impact juice. Um golpe tem tres procedencias, e o `weapon` e quem as separa:
   *   - `sword`: o botao A com a espada na mochila — 2 de dano, duas espadadas na caveira;
   *   - `fist`:  o botao A sem espada — o soco, tres para matar;
   *   - `item`:  o botao B com o item selecionado — a escada MELEE_DAMAGE de sempre (o graveto
   *              ACESO mata de um golpe, uma ferramenta qualquer em dois). Um item que nao bate
   *              (bomba, botas) nao faz nada.
   * So o golpe de `item` desenha o proprio arco aqui: A ja desenhou o dele antes de acertar,
   * porque ele sai mesmo no vazio.
   *
   * Devolve o QUE ACONTECEU com este corpo, porque quem varre um arco precisa saber qual das duas
   * vozes do gesto foi gasta — ver `sweepArc`.
   */
  private strikeEnemy(
    enemy: EnemyBase,
    wx: number,
    wy: number,
    weapon: 'sword' | 'item' | 'spin',
    // O que o GESTO ja disse. Este corpo pode ser o segundo (ou o oitavo) do mesmo golpe: o arco
    // varre ate seis tiles e o giro oito. O que e do CORPO (dano, faisca, anel, arremesso)
    // acontece uma vez por corpo; a VOZ — som e piscada do heroi — sai uma vez por gesto, e cada
    // uma das duas tem o proprio orcamento, ou um resvalo cala a morte do corpo ao lado.
    hitSpoken = false,
    refusalSpoken = false,
  ): 'landed' | 'refused' {
    // O ARCO SAI ANTES DE SE SABER SE ACERTOU, e por isso ele vem antes das duas recusas abaixo.
    // E a mesma lei do botao A ("o arco sai mesmo no vazio, de proposito"): um golpe que so
    // aparece quando conecta esconde o alcance da arma — e, pior aqui, faz o jogador apertar B
    // contra um corpo piscando e nao ver mao nenhuma se mexer. A faisca de recusa explica o que
    // aconteceu; ela nao substitui o gesto de ter atacado.
    if (weapon === 'item') this.swingHeld(wx, wy);

    // O CORPO AINDA ESTA PISCANDO do golpe anterior: o gesto RESVALA. Ele nao pode ser silencioso
    // (o jogador apertou o botao e viu a lamina passar por dentro do bicho) nem pode ser um
    // acerto, entao usa o mesmo pacote de recusa do corpo que ainda esta nascendo — anel palido,
    // sem dano, sem faisca de impacto. Ver EnemyBase.hurtInvulnMs.
    //
    // O anel sai SEMPRE, mesmo que outro corpo do mesmo arco ja tenha resvalado: ele e a resposta
    // DAQUELE corpo. Um resvalo mudo no meio de um giro le como a lamina passando por dentro do
    // bicho sem nada acontecer, que e a leitura de bug.
    if (enemy.isHurtInvulnerable) {
      this.spawnDeflect(wx, wy);
      if (!refusalSpoken) {
        getSoundManager().playBladeGlance();
        // O mesmo baque leve do resvalo em corpo nascendo (ver sweepArc): eram a MESMA recusa com
        // dois pesos — uma sacudia a câmera e a outra não —, e duas recusas iguais que respondem
        // diferente ensinam que são coisas diferentes, que é mentira.
        this.world3d?.shake(40, 0.03, wx - this.playerWorld.worldX, wy - this.playerWorld.worldY);
        this.triggerHitstop(GLANCE_HITSTOP_MS);
      }
      return 'refused';
    }

    // A GUARDA: o bicho que esta armando um golpe encara o que vai bater, e o que vem de la bate
    // na guarda dele. E a aula que o soldado da primeira sala do `A Link to the Past` da sem uma
    // linha de texto — atacar de frente nao passa, contornar passa —, e ela so existe dentro da
    // janela do telegrafo: fora dela, todo lado do corpo vale.
    const guardX = Math.sign(this.playerWorld.worldX - wx);
    const guardY = Math.sign(this.playerWorld.worldY - wy);
    if (enemy.guardsAgainst(guardX, guardY)) {
      // A faisca e do CORPO (ela diz "ESTE lado esta fechado", e a posicao dela e a informacao);
      // o tim e o tranco sao a VOZ da recusa, e saem uma vez por gesto. Um giro no meio de uma
      // matilha inteira guardando disparava oito tins no mesmo frame.
      this.spawnGuardSpark(wx, wy, guardX, guardY);
      if (!refusalSpoken) {
        getSoundManager().playGuardBlock();
        // O baque inclina na direcao do GOLPE (heroi -> corpo), que e o inverso de `guardX/guardY`:
        // a camera acompanha a lamina indo, mesmo quando ela nao passa.
        this.world3d?.shake(50, 0.035, -guardX, -guardY);
        this.triggerHitstop(GUARD_HITSTOP_MS);
      }
      return 'refused';
    }

    let damage: number;
    if (weapon === 'sword' || weapon === 'spin') {
      damage = MELEE_DAMAGE.sword ?? 2;
    } else {
      const itemDamage = MELEE_DAMAGE[this.heldItem as HeldItemKind];
      if (itemDamage === undefined) return 'refused';
      // O graveto ACESO segue matando de um golpe, e agora ele e a unica coisa que faz isso: o
      // fogo e um recurso que se gasta (o combustivel corre, a chama entrega sua posicao no
      // escuro e a mao fica presa nele), entao ele pode comprar o que a espada deixou de dar.
      damage = this.heldOnFire ? 999 : itemDamage;
    }

    enemy.takeDamage(damage);

    // ── O ACERTO MUDA O TABULEIRO ──────────────────────────────────────────────
    //
    // Ate aqui um golpe recebido nao mexia em NADA do bicho: o recuo era um deslocamento de
    // desenho que voltava sozinho, e os relogios de passo e de ataque dele seguiam correndo. Bater
    // e nao bater davam a mesma posicao no frame seguinte — e sem posicao nao ha espacamento, que
    // e a unica coisa que um combate de grade tem pra ensinar. Agora todo golpe compra as duas
    // coisas que o jogador precisa: TEMPO (o atordoamento) e ESPACO (o tile de arremesso). Quem
    // nao pode ser arremessado — a torreta, que e mobilia, e o zora, que escolhe onde a agua o
    // devolve — leva o recuo elastico de sempre e nada mais (ver EnemyBase.canBeShoved).
    const dx = wx - this.playerWorld.worldX;
    const dy = wy - this.playerWorld.worldY;
    if (enemy.isAlive) {
      enemy.applyHitstun(weapon === 'spin' ? HITSTUN_SPIN_MS : HITSTUN_MS);
      // A direcao do arremesso e a do heroi para o corpo — inclusive na diagonal, que so o giro
      // produz: um corpo atingido pelo rodopio voa para FORA dele, e nao para um cardinal
      // arredondado que o desenho do golpe nao mostrou.
      const shoved = enemy.shove(Math.sign(dx), Math.sign(dy), (tx, ty) => this.canEnemyEnter(enemy, tx, ty));
      // ENCURRALAR PAGA. O arremesso barrado por uma parede era a jogada boa mais silenciosa do
      // jogo: dava exatamente o mesmo recuo de um empurrao no vazio. Agora o encontrao tem peso
      // proprio — mais hitstop, tremor mais fundo e a poeira do impacto na PAREDE, no ponto em que
      // o corpo bateu. E o jogo tem a melhor parede possivel pra isso, que e a luz da fogueira.
      if (shoved === 'slammed') {
        // A poeira e do CORPO: ela sai no ponto em que ELE bateu na parede. O baque, o tremor e o
        // hitstop sao a voz do acerto — o encontrao e a melhor coisa que o gesto fez, entao ele
        // fala junto com o primeiro golpe que landou e nao se repete a cada corpo encurralado.
        this.spawnSlamDust(wx + Math.sign(dx) * 0.5, wy + Math.sign(dy) * 0.5);
        if (!hitSpoken) {
          this.triggerHitstop(90);
          this.world3d?.shake(120, 0.12, dx, dy); // a camera vai junto com o corpo contra a parede
          getSoundManager().playBodySlam();
        }
        // A PAREDE QUE É FOGO ACENDE O QUE BATE NELA (a tocha viva — ver EnemyBase.igniteBody):
        // encurralar contra fogueira acesa, arbusto em chamas ou lava transforma o melhor golpe
        // do jogo na ignição do único sistema que o jogador conduz. Só o TILE que arde conta
        // (fireOnTile) — o encontrão contra a borda da luz continua sendo só um encontrão.
        if (this.fireOnTile(enemy.worldX + Math.sign(dx), enemy.worldY + Math.sign(dy))) {
          this.igniteEnemy(enemy);
        }
      } else if (shoved === 'moved' && this.fireOnTile(enemy.worldX, enemy.worldY)) {
        // O corpo CAIU num tile que arde (um graveto aceso no chão; lava, para quem voa por
        // cima dela): mesmo destino do encontrão — o arremesso pousou dentro do fogo.
        this.igniteEnemy(enemy);
      }
    } else {
      // O CORPO MORTO TAMBEM VOA. Aqui havia um `triggerKnockback`, e ele nao fazia nada: aquele
      // metodo sai na primeira linha se o corpo ja morreu, e `render()` para de escrever a posicao
      // do billboard depois da morte — entao o unico golpe do jogo que nao movia ninguem era
      // justamente o que matava. Ver EnemyBase.deathFling.
      enemy.deathFling(dx, dy);
    }
    // O GRAVETO ACESO SEMPRE DEIXA FOGO NO CORPO. Havia um `&& enemy.isAlive` aqui, e ele tornava
    // esta linha INALCANCAVEL: a chama da 999 de dano (ela e a unica coisa que ainda mata de um
    // golpe), entao o corpo nunca esta vivo quando se chega aqui — o unico golpe do jogo que
    // deveria terminar em fogo era justamente o que nunca mostrava nenhum.
    if (weapon === 'item' && this.heldOnFire) this.spawnFireHitEffect(wx, wy);

    if (!hitSpoken) {
      getSoundManager().playEnemyHit(enemy.kind); // na altura da especie (ver ENEMY_VOICE)
      this.hero.tint = 0xffff00;
      this.time.delayedCall(120, () => { this.hero.tint = null; });
      // O QUADRO DE IMPACTO: o hitstop logo abaixo congela a lamina no meio do arco, e este
      // lampejo e o que diz por que ela parou. Ver SwordSlash.flashHit.
      this.swordSlash?.flashHit();
    }

    // Impact juice: sparks at the point of contact, a kick of screen shake, and a few
    // frames of hitstop — all heavier when the blow kills. O tremor e o hitstop ficam FORA do
    // orcamento da voz de proposito: os dois se resolvem por si (o hitstop e um `Math.max` e o
    // tremor e o ultimo que manda), e gastar a vez neles faria uma morte no terceiro tile do arco
    // herdar o baque leve do arranhao do primeiro.
    const lethal = !enemy.isAlive;
    this.spawnHitSpark(wx, wy, lethal, dx, dy);
    // A mesma direcao das faiscas: o baque sai PARA FORA do golpe, e nao para um lado sorteado.
    this.world3d?.shake(lethal ? 150 : 90, lethal ? 0.15 : 0.09, dx, dy);
    this.triggerHitstop(lethal ? 110 : 60);
    // A moeda NÃO sai daqui: quem paga é a morte, não o golpe (ver EnemyBase.setDeathToll). Esta
    // linha era a única fonte de recompensa do jogo, e por isso um corpo comido pelo fogo — hoje o
    // fim mais comum de uma caveira — morria de graça.
    if (lethal && !hitSpoken) getSoundManager().playEnemyDeath(enemy.kind);
    return 'landed';
  }

  /**
   * Onde um corpo arremessado pode cair. E o mesmo mundo que o EnemyManager entrega ao bicho pra
   * ele ANDAR — e a luz da fogueira saiu dos dois juntos. Arremessar uma caveira para a beira do
   * fogo deixou de bater num muro invisivel e passou a ser a jogada que parece: ela cai la e
   * COMECA A ARDER (ver tickScorch). O golpe que empurra virou uma forma de cozinhar.
   */
  private canEnemyEnter(enemy: EnemyBase, wx: number, wy: number): boolean {
    if (this.isSolidForEntities(wx, wy, enemy.flies)) return false;
    if (wx === this.playerWorld.worldX && wy === this.playerWorld.worldY) return false;
    const other = this.enemyManager?.getEnemyAt(wx, wy);
    return other === null || other === undefined || other === enemy;
  }

  /**
   * UM CORPO CAIU: ele LARGA MOEDA — sempre, e não importa quem o matou (a espada, a bomba, a
   * tocha viva ou o calor da fogueira). Quem chama e o sino da morte, dentro do `die()`
   * (EnemyBase.setDeathToll); ate 2026-08-12 quem chamava era o golpe da espada, e morte por
   * fogo — hoje o fim mais comum de uma caveira, que assa na beira da luz — nao pagava nada.
   *
   * No explorador a moeda e o placar da aposta, e o multiplicador de profundidade e quem
   * transforma "andar mais" numa decisao. Na AVENTURA (que teve loja e nenhuma fonte de moeda por
   * toda a vida do jogo) o preco vem da escada de vida: um corpo paga um degrau a menos do que
   * custa em golpes (ENEMY_BLOWS - 1) — o morcego rende 1, a torreta 8. A mesma tabela que diz
   * "de quem e mais dificil" diz "quanto vale", e nenhum numero novo entra no jogo.
   *
   * A CAVEIRA e a excecao, e ela e a regra na pratica: `undeadCoins()`, 1 moeda com 25% de chance
   * de duas (ver la). Ela e o corpo que o jogador mais mata, e o unico que o mundo produz sozinho.
   *
   * O CORACAO so cai de um corpo quando o heroi esta FERIDO — coracao no chao com vida cheia e
   * lixo visual — e e a unica cura de campo: a fogueira cura em casa, o drop cura na estrada
   * (e dentro das dungeons, onde fogueira nao existe).
   */
  private rewardKill(wx: number, wy: number, kind: EnemyKind): void {
    if (!this.chunkManager) return;
    // ONDE A MOEDA CAI NÃO É ONDE O CORPO CAIU, quando o corpo caiu na ÁGUA. Um zora morre no
    // meio do lago, e uma moeda espalhada ali é uma moeda que o herói vê e nunca alcança — o
    // pior tipo de recompensa, a que se mostra e não se pega. A praia mais próxima resolve isso
    // sem uma regra nova para o jogador aprender: o dinheiro chega na terra, como tudo o mais.
    const [dx, dy] = this.shoreDropTile(wx, wy);
    if (this.explorer) {
      noteExplorerKill();
      // A aposta do explorador MULTIPLICA o que o corpo vale (longe paga mais, ver
      // coinMultiplierAt): a base da caveira entra aqui inteira, entao perto do acampamento ela
      // larga exatamente 1-2 moedas e la no fundo o mesmo sorteio vale ate oito vezes isso.
      this.coinManager?.spawnCoins(
        dx, dy, this.chunkManager, this.coinsForKind(kind) * coinsForKill(distanceFromCamp(wx, wy)),
      );
      return;
    }
    if (!this.adventure) return; // num level de puzzle a recompensa e a solucao
    this.coinManager?.spawnCoins(dx, dy, this.chunkManager, this.coinsForKind(kind));
    if (
      this.playerHealth < this.playerMaxHealth
      && Math.random() < HEART_DROP_CHANCE
      && !(this.heartPickupManager?.hasPickupAt(dx, dy) ?? true)
      && !(this.itemManager?.hasItemAt(dx, dy) ?? true)
    ) {
      this.heartPickupManager?.spawnDropped(dx, dy);
    }
  }

  /**
   * O QUE ESTE CORPO VALE, em moedas — a base, antes do multiplicador de profundidade.
   *
   *   • a CAVEIRA: 1, e 2 numa morte a cada quatro (ver undeadCoins) — o corpo mais comum do jogo;
   *   • o AQUÁTICO: 3, e é o preço de um problema. Ele mora onde a espada do herói não alcança de
   *     graça: ou se luta da margem, na janela em que ele emerge para cuspir, ou não se luta. Um
   *     corpo que exige uma posição para ser morto paga mais que um que caminha até você;
   *   • o resto: a escada de vida da aventura (`ENEMY_BLOWS - 1`), e 1 no explorador, onde quem
   *     manda no número é a distância de casa.
   */
  private coinsForKind(kind: EnemyKind): number {
    if (kind === 'undead') return this.undeadCoins();
    if (AQUATIC_ENEMY_KINDS.has(kind)) return AQUATIC_KILL_COINS;
    return this.explorer ? 1 : Math.max(1, (ENEMY_BLOWS[kind] ?? 2) - 1);
  }

  /**
   * A PRAIA MAIS PRÓXIMA deste tile — onde um drop pousa quando o corpo morreu na água.
   *
   * Anéis crescentes a partir do tile da morte, até o primeiro chão em que o herói PODE pisar (a
   * mesma pergunta que o passo dele faz, sem as botas de lava). Cinco tiles de raio é mais que a
   * largura de qualquer lago autorado até hoje; se nada aparecer, a moeda cai onde caiu — perder
   * uma moeda num pântano gigante é melhor que perdê-la num `return` silencioso.
   */
  private shoreDropTile(wx: number, wy: number): readonly [number, number] {
    if (!this.isSolidForEntities(wx, wy)) return [wx, wy];
    for (let r = 1; r <= 5; r += 1) {
      for (let oy = -r; oy <= r; oy += 1) {
        for (let ox = -r; ox <= r; ox += 1) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue; // só o anel novo
          const x = wx + ox;
          const y = wy + oy;
          if (!this.isSolidForEntities(x, y) && !this.isTileOccupied(x, y)) return [x, y];
        }
      }
    }
    return [wx, wy];
  }

  /**
   * O QUE UMA CAVEIRA VALE: **1 moeda, e 2 em uma morte a cada quatro**.
   *
   * Ela pagava 2 fixas (a escada `ENEMY_BLOWS - 1`), e duas coisas mudaram junto: agora TODA morte
   * paga — inclusive a que o mundo dá sozinho, quando a matilha assa na beira de uma fogueira — e a
   * caveira é o corpo que o cerco produz sem parar. Com 2 garantidas por corpo, a moeda deixaria de
   * ser um prêmio para virar um pingo constante; com 1 e um bônus raro, cada morte ainda pode
   * surpreender. O sorteio é por MORTE (nunca por moeda): duas moedas saltando juntas é o evento.
   */
  private undeadCoins(): number {
    return Math.random() < UNDEAD_DOUBLE_COIN_CHANCE ? 2 : 1;
  }

  /**
   * Freeze the world on the current frame for a beat. tweens.timeScale goes to 0 so every
   * in-flight tween (knockback stretch, death pop) holds its impact pose; update() counts
   * the freeze down in real time and restores the timescale.
   */
  private triggerHitstop(ms: number): void {
    this.hitstopMs = Math.max(this.hitstopMs, ms);
    this.tweens.timeScale = 0;
  }

  /**
   * Sparks + a white impact flash where a melee blow lands; heavier when the blow kills.
   *
   * AS FAÍSCAS TÊM DIREÇÃO, e é ela que diz de onde veio o golpe. Elas saíam em 360° uniformes
   * (`ang = (i/count) * 2π`), então um golpe vindo do oeste e um vindo do leste desenhavam
   * exatamente a mesma estrela — a única coisa que o impacto tinha a dizer sobre si mesmo era
   * "aconteceu aqui", e nunca "veio dali". Agora elas saem num LEQUE para fora do golpe, que é a
   * mesma regra que a faísca da guarda já respeitava (`spawnGuardSpark`: a posição é a informação).
   *
   * O golpe que MATA abre o leque quase até o círculo: ali não há mais direção a ensinar, e a
   * explosão em volta é o vocabulário certo para uma coisa que se desfez.
   */
  private spawnHitSpark(wx: number, wy: number, lethal: boolean, dirX = 0, dirY = 0): void {
    const w3 = this.world3d;
    if (!w3) return;

    // A hot flash at the point of contact: an additive dot hanging at chest height, blooming
    // outward. It lives in the world (it is lit, bloomed and blurred with everything else)
    // rather than being a circle painted on the canvas.
    const flash = w3
      .addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 2 })
      .setTint(0xffffff)
      .setPosition(wx, wy)
      .setElevation(FX_BODY_ELEV)
      .setDisplaySize(FLASH_SIZE * (lethal ? 1.5 : 1), FLASH_SIZE * (lethal ? 1.5 : 1));
    const flashTo = FLASH_SIZE * (lethal ? 3 : 1.9);
    this.tweens.add({
      targets: flash,
      scaleX: flashTo,
      scaleY: flashTo,
      alpha: 0,
      duration: lethal ? 210 : 150,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });

    // Sparks thrown off the blow, flying out across the ground plane and arcing up a little.
    const count = lethal ? 7 : 4;
    // O eixo do leque: a direção do golpe (do herói para o corpo). Sem direção — a bomba, o fogo,
    // um caminho de dano que não vem de um braço — ele volta a ser o círculo de antes.
    const aimed = dirX !== 0 || dirY !== 0;
    const axis = aimed ? Math.atan2(dirY, dirX) : 0;
    // Meio leque, em radianos. O golpe que fere abre ~150° (um leque nítido para a frente); o que
    // mata abre quase tudo, porque ali o corpo se desfez e não há mais lado nenhum a apontar.
    const spread = lethal ? Math.PI * 0.82 : Math.PI * 0.42;
    for (let i = 0; i < count; i++) {
      // -1..1 ao longo do leque (`count` nunca é 1, então a divisão é segura), mais um tremor por
      // faísca: sem ele as quatro saem em leque perfeito, que lê como um decalque e não como pó.
      const fan = ((i / (count - 1)) * 2 - 1) * spread;
      const ang = aimed
        ? axis + fan + (Math.random() - 0.5) * 0.35
        : (i / count) * Math.PI * 2 + Math.random() * 0.8;
      const dist = 0.45 + Math.random() * (lethal ? 0.75 : 0.4);
      const spark = w3
        .addBillboard(ASSET_KEYS.bombItem, BOMB_FRAMES.spark, {
          ...FX_BILLBOARD, emissive: true, alphaTest: 0.05, emissiveBoost: 2,
        })
        .setPosition(wx, wy)
        .setElevation(FX_BODY_ELEV)
        .setDisplaySize(0.22, 0.22);
      this.tweens.add({
        targets: spark,
        x: wx + Math.cos(ang) * dist,
        y: wy + Math.sin(ang) * dist * 0.7, // foreshortened: the ground plane is tilted away
        elevation: FX_BODY_ELEV + 0.1 + Math.random() * 0.25,
        alpha: 0,
        angle: Phaser.Math.Between(-180, 180),
        duration: 170 + Math.random() * 120,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  /**
   * Steel into granite. EVERY blow throws stone — not just the one that opens the tile — because
   * a first hit that merely swapped the sprite for a cracked one was the whole reason mining read
   * as pressing a button twice.
   *
   * The chips are real debris in the 3D world: they burst off the struck FACE (not the middle of
   * the tile), arc back at the hero, fall under gravity, BOUNCE where they land and lie in the
   * grass a moment before they go. The old shatter drew flat rectangles on the Phaser canvas at
   * `lastScreen` — a screen position nothing ever refreshed, so the "shards" fired off the
   * top-left corner of the screen. (dirX, dirY) points from the hero into the rock.
   */
  private spawnRockDebris(wx: number, wy: number, dirX: number, dirY: number, shattered: boolean, ore = false): void {
    const w3 = this.world3d;
    if (!w3) return;

    // The point of contact: the face he is actually hitting, at about chest height on the rock.
    const ix = wx - dirX * ROCK_FACE_TILES;
    const iy = wy - dirY * ROCK_FACE_TILES;
    const iz = 0.52;
    // Where the stone goes. The blow throws it back at the man swinging — but he is standing
    // BETWEEN the rock and the camera, so a chip thrown straight back at him flies into his own
    // billboard and is never seen. So the spray is a wide V: out to BOTH SIDES of the blow, with
    // only a bias backwards. It is what a struck rock does anyway (the chip leaves along the
    // face, not along the pick), and it is the only version of it the player can watch.
    const back = Math.atan2(-dirY, -dirX);
    const tints = ore ? ORE_CHIP_TINTS : ROCK_CHIP_TINTS;

    for (let i = 0; i < (shattered ? 12 : 7); i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const ang  = back + side * (0.55 + Math.random() * 0.95);
      const dist = 0.3 + Math.random() * (shattered ? 0.8 : 0.45);
      const size = 0.11 + Math.random() * (shattered ? 0.13 : 0.08);
      const riseMs = 110 + Math.random() * 70;
      const fallMs = 300 + Math.random() * 140;
      // Unlit, like every other one-shot FX in this world (see spawnSmokePuff's note). A chip is a
      // piece of the rock, so a LIT one is the honest choice and it was the first thing I tried —
      // and at night it renders BLACK: a rock you cannot see, coming off a rock you can. The night
      // owns the world; it does not get to own the feedback.
      //
      // And it is FILLED, not tinted: a tint multiplies the rock's art, and a chip is small enough
      // that it samples the mound's dark body pixels and comes out charcoal. Fill keeps the
      // silhouette and paints it granite.
      const chip = w3
        .addBillboard(ASSET_KEYS.rock, 0, { ...FX_BILLBOARD, emissive: true, alphaTest: 0.05 })
        .setTintFill(tints[i % tints.length])
        .setPosition(ix, iy)
        .setElevation(iz)
        .setDisplaySize(size, size);

      // Horizontal flight: it leaves fast and drags to a stop over the whole arc (the y throw is
      // foreshortened — the ground plane is tilted away from us).
      this.tweens.add({
        targets: chip,
        x: ix + Math.cos(ang) * dist,
        y: iy + Math.sin(ang) * dist * 0.7,
        angle: Phaser.Math.Between(-540, 540), // end over end
        duration: riseMs + fallMs,
        ease: 'Quad.easeOut',
      });
      // …and the gravity arc under it: up off the face, then down, and it BOUNCES where it lands.
      // That bounce is the entire difference between a chip of rock and a puff of smoke.
      this.tweens.add({
        targets: chip,
        elevation: iz + 0.22 + Math.random() * 0.3,
        duration: riseMs,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: chip,
            elevation: 0.03, // on the ground, where it stays
            duration: fallMs,
            ease: 'Bounce.easeOut',
            onComplete: () => {
              this.tweens.add({
                targets: chip,
                alpha: 0,
                delay: 260, // it lies there first — debris that vanishes on landing never landed
                duration: 240,
                onComplete: () => chip.destroy(),
              });
            },
          });
        },
      });
    }

    // Dust knocked out of the crack, and the sparks of the point biting stone.
    for (let i = 0; i < (shattered ? 4 : 2); i++) {
      const puff = w3
        .addBillboard(FX_PUFF_TEXTURE, 0, { ...FX_BILLBOARD, emissive: true, alphaTest: 0.02 })
        .setTint(0xb0a89c)
        .setPosition(ix + (Math.random() - 0.5) * 0.3, iy + (Math.random() - 0.5) * 0.2)
        .setElevation(iz - 0.15)
        .setDisplaySize(0.24, 0.24)
        .setAlpha(0.4);
      this.tweens.add({
        targets: puff,
        elevation: iz + 0.35 + Math.random() * 0.2,
        scaleX: 0.55,
        scaleY: 0.55,
        alpha: 0,
        duration: 420 + i * 90,
        ease: 'Power2.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
    for (let i = 0; i < 2; i++) {
      const ang = back + (i === 0 ? 1 : -1) * (0.4 + Math.random() * 0.8); // off the face, like the chips
      const spark = w3
        .addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 2 })
        .setTint(0xffe0a8) // struck steel, not fire: a pale gold, and gone in a blink
        .setPosition(ix, iy)
        .setElevation(iz)
        .setDisplaySize(0.08, 0.08);
      this.tweens.add({
        targets: spark,
        x: ix + Math.cos(ang) * 0.4,
        y: iy + Math.sin(ang) * 0.28,
        elevation: iz + 0.12,
        alpha: 0,
        duration: 110 + Math.random() * 70,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }

    // The blow lands in the room, not just on the rock: the world takes a kick and a few frames
    // of hitstop — the same juice a melee hit gets, because this IS one.
    if (shattered) this.spawnShockwave(wx, wy, 0xb6bcc4, 0.3, 1.05, 260);
    w3.shake(shattered ? 150 : 70, shattered ? 0.11 : 0.045);
    this.triggerHitstop(shattered ? 80 : 45);
  }

  // A blow glancing off an invulnerable target: a cold blue ring + a few pale shards
  // skittering flat off the point of contact. Deliberately NOT spawnHitSpark's hot white
  // flash — negated damage must never share the visual language of a landed hit.
  private spawnDeflect(wx: number, wy: number): void {
    const w3 = this.world3d;
    if (!w3) return;

    // The cold shockwave washes out over the GROUND (a flat ring), where the 2D game could only
    // draw a circle on the screen. Same rule as before: never spawnHitSpark's hot white flash.
    this.spawnShockwave(wx, wy, 0xaec6ff, 0.32, 1.1, 230);

    for (let i = 0; i < 3; i++) {
      // Shards fly out of the upper half only (the blow bounced UP and away, not through).
      const ang = -Math.PI * (0.15 + Math.random() * 0.7);
      const dist = 0.35 + Math.random() * 0.3;
      const shard = w3
        .addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true })
        .setTint(0xaec6ff)
        .setPosition(wx, wy)
        .setElevation(FX_BODY_ELEV)
        .setDisplaySize(0.12, 0.12)
        .setAlpha(0.85);
      this.tweens.add({
        targets: shard,
        x: wx + Math.cos(ang) * dist,
        elevation: FX_BODY_ELEV + Math.abs(Math.sin(ang)) * dist,
        alpha: 0,
        duration: 200 + Math.random() * 90,
        ease: 'Cubic.easeOut',
        onComplete: () => shard.destroy(),
      });
    }
  }

  /**
   * A poeira do ENCONTRÃO: o corpo bateu na parede e ela devolve o pó, no ponto do impacto e
   * espalhando para os lados dele — nunca para a frente, que é onde o corpo não pôde ir.
   */
  private spawnSlamDust(cx: number, cy: number): void {
    const w3 = this.world3d;
    if (!w3) return;
    for (let i = 0; i < 5; i++) {
      const ang = Math.PI * (0.15 + Math.random() * 0.7) * (i % 2 === 0 ? 1 : -1);
      const puff = w3
        .addBillboard(FX_PUFF_TEXTURE, 0, { ...FX_BILLBOARD })
        .setTint(0x9a9284)
        .setPosition(cx, cy)
        .setElevation(FX_BODY_ELEV * 0.6)
        .setDisplaySize(0.16, 0.16)
        .setAlpha(0.7);
      this.tweens.add({
        targets: puff,
        x: cx + Math.cos(ang) * 0.4,
        y: cy + Math.sin(ang) * 0.25,
        scaleX: 0.34,
        scaleY: 0.34,
        alpha: 0,
        duration: 320,
        ease: 'Cubic.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  }

  /**
   * A GUARDA APARANDO — e ela precisa dizer uma coisa que o resvalo NÃO diz.
   *
   * Os dois usavam o mesmo `spawnDeflect`, e são lições opostas: o resvalo dos i-frames significa
   * ESPERE (o corpo está piscando, bata de novo daqui a pouco) e a guarda significa CONTORNE (este
   * lado está fechado, o outro não). Ensinar as duas com o mesmo anel centrado é não ensinar
   * nenhuma.
   *
   * Então a guarda não desenha um anel: desenha um LEQUE curto de faíscas na BORDA do corpo, no
   * lado de onde o golpe veio — a posição é a informação. Cor de aço quente, não o azul frio do
   * resvalo, pela mesma razão: duas recusas, duas paletas.
   */
  private spawnGuardSpark(wx: number, wy: number, fromDx: number, fromDy: number): void {
    const w3 = this.world3d;
    if (!w3) return;
    // O ponto de contato: meio tile na direção de quem bateu — a borda do corpo, não o centro.
    const cx = wx + fromDx * 0.45;
    const cy = wy + fromDy * 0.45;
    // As faíscas saem PARA TRÁS, na direção de quem bateu: o golpe foi devolvido, não absorvido.
    for (let i = 0; i < 4; i++) {
      const spread = (i - 1.5) * 0.36;
      const dx = fromDx !== 0 ? fromDx : spread;
      const dy = fromDy !== 0 ? fromDy : spread;
      const shard = w3
        .addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true })
        .setTint(0xffe6b0)
        .setPosition(cx, cy)
        .setElevation(FX_BODY_ELEV)
        .setDisplaySize(0.11, 0.11)
        .setAlpha(0.95);
      this.tweens.add({
        targets: shard,
        x: cx + dx * 0.34 + (fromDx !== 0 ? spread * 0.5 : 0),
        y: cy + dy * 0.34 + (fromDy !== 0 ? spread * 0.5 : 0),
        alpha: 0,
        duration: 190,
        ease: 'Cubic.easeOut',
        onComplete: () => shard.destroy(),
      });
    }
  }

  /**
   * An impact wave washing out over the ground: a flat additive ring at the tile, growing from
   * `from` to `to` tiles across. Shared by the landed hit, the deflected blow and the heal tick,
   * so every "something struck here" beat speaks with one shape.
   */
  private spawnShockwave(
    wx: number, wy: number, color: number, from: number, to: number, durationMs: number,
  ): void {
    const w3 = this.world3d;
    if (!w3) return;
    const ring = w3
      .addBillboard(FX_RING_TEXTURE, 0, { additive: true, flat: true, flatY: 0.05, fog: false, depthWrite: false })
      .setTint(color)
      .setPosition(wx, wy)
      .setDisplaySize(from, from);
    this.tweens.add({
      targets: ring,
      scaleX: to,
      scaleY: to,
      alpha: 0,
      duration: durationMs,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /** The held item can catch fire at a campfire: only the wood club burns — the sword never does. */
  private get isFlammableHeld(): boolean {
    return this.heldItem === 'wood';
  }

  /**
   * Swing the current held item at a tile with the sword's slash arc. The sword swings
   * itself (the animator owns its fire state); every other item swings its own sprite —
   * burning wood carries its flame into the arc.
   */
  private swingHeld(wx: number, wy: number): void {
    if (!this.swordSlash || !this.camera || this.heldItem === 'none') return;
    getSoundManager().playSwordSlash();
    // The held item flies out in the swing arc, so hide the copy slung on the back for the
    // swing's duration — otherwise the item appears in two places at once.
    this.hideBackItemDuringSwing();
    const dx = wx - this.playerWorld.worldX;
    const dy = wy - this.playerWorld.worldY;
    const screen = this.swingAnchor(dy);
    // Sem ramo de espada aqui: ela nao e item, entao nunca e o que esta na mao (ver swingSword,
    // que e o arco do botao Z).
    const visual = ITEM_VISUAL_2D[this.heldItem];
    this.swordSlash.slash(screen.x, screen.y, dx, dy, this.tileSize, {
      texture: visual.texture, // wood uses its single-stick icon (the "graveto")
      frame: visual.frame,
      onFire: this.heldItem === 'wood' && this.heldOnFire,
      flipX: this.heldItem === 'axe', // the axe is single-edged — face its blade into the swing
    });
  }

  /**
   * Where a swing pivots on screen: the hero's HANDS, not the tile under his boots, and pulled
   * toward the camera when his back is turned. See SWING_HAND_ELEVATION / SWING_BACK_TURNED_NEAR.
   *
   * E o ponto e o do CORPO DESENHADO, nao o do tile logico: durante um passo os dois estao a ate
   * um tile de distancia (ver PlayerMovementController.visualWorld), e ancorar no logico punha o
   * arco flutuando na frente do heroi sempre que ele corria e batia ao mesmo tempo. Como ele fica
   * pregado no centro da tela enquanto anda, esse ponto tambem nao se move durante a animacao —
   * o arco acompanha a corrida sem precisar ser reposicionado quadro a quadro.
   */
  private swingAnchor(dy: number): { x: number; y: number } {
    // The arc is a 2D sprite over the 3D world, so it has to be TOLD how lit the hero is or it
    // swings at full art brightness through the night. See World3D.lightLevelAt / SWING_DARK.
    this.swordSlash?.setLightLevel(
      this.world3d?.lightLevelAt(this.playerWorld.worldX, this.playerWorld.worldY) ?? 1,
    );
    const at = this.movementController?.visualWorld(this.playerWorld.worldX, this.playerWorld.worldY)
      ?? { x: this.playerWorld.worldX, y: this.playerWorld.worldY };
    const nearer = dy < 0 ? SWING_BACK_TURNED_NEAR : 0;
    return this.camera!.tileToScreen(
      at.x,
      at.y + nearer,
      this.tileSize,
      SWING_HAND_ELEVATION,
    );
  }

  /**
   * The overhead MINING swing (SwordSlash.chop), not the sword's arc: raised over the head, held
   * there, and driven down into one spot. It belongs to the two tools heavy enough to earn it —
   * the pickaxe into stone, and the steel axe into a tree. Combat keeps the flat slash (nobody
   * hauls a pick over their head at a skeleton standing on top of them), and this is the only
   * swing that lands late, at CHOP_IMPACT_MS.
   */
  private swingChop(item: 'pickaxe' | 'greatAxe', wx: number, wy: number): void {
    if (!this.swordSlash || !this.camera) return;
    // The whoosh belongs to the DRIVE, not to the wind-up: a pick hauled slowly overhead makes no
    // sound at all, and the noise is what tells the player the blow is now unstoppable.
    this.time.delayedCall(CHOP_DRIVE_AT_MS, () => getSoundManager().playSwordSlash());
    this.hideBackItemDuringSwing(CHOP_TOTAL_MS); // a chop is far longer than a slash
    const dx = wx - this.playerWorld.worldX;
    const dy = wy - this.playerWorld.worldY;
    const screen = this.swingAnchor(dy);
    const visual = ITEM_VISUAL_2D[item];
    this.swordSlash.chop(screen.x, screen.y, dx, dy, this.tileSize, {
      texture: visual.texture,
      frame: visual.frame,
    });
  }

  private swingPickaxe(wx: number, wy: number): void {
    this.swingChop('pickaxe', wx, wy);
  }

  /** Hero is carrying a burning torch (the lit graveto): fire in hand, light, and enemy ward. */
  private get isTorchLit(): boolean {
    return this.heldItem === 'wood' && this.heldOnFire;
  }

  // Light the held item (the wood club — the only flammable item) at a fire source
  // (lit campfire or lava). The sword is not flammable, so it never reaches here.
  private igniteHeldItem(): void {
    if (!this.isFlammableHeld || this.heldOnFire) return;
    getSoundManager().playIgnite();
    this.heldOnFire = true;
    this.refuelTorch();
    this.updateBackItem(); // the plain graveto stays visible beneath the flame effect
    // Orange flash on the player as the fire transfers
    this.hero.tint = 0xff6600;
    this.time.delayedCall(250, () => { this.hero.tint = null; });
  }

  /** Fill the carried flame back to full. */
  private refuelTorch(): void {
    this.torchFuelMs = TORCH_BURN_MS;
  }

  /** The carried flame burned out in the dark: fall back to an unlit item. */
  private extinguishTorch(): void {
    if (!this.heldOnFire) return;
    this.heldOnFire = false;
    this.torchFuelMs = 0;
    this.swordSlash?.setOnFire(false);
    this.updateBackItem(); // back to the plain graveto once the flame dies
    this.spawnSmokePuff(this.playerWorld.worldX, this.playerWorld.worldY);
  }

  /** Remaining torch fuel as 0..1 (0 when unlit). */
  private get torchFuelFrac(): number {
    return this.isTorchLit ? Phaser.Math.Clamp(this.torchFuelMs / TORCH_BURN_MS, 0, 1) : 0;
  }

  // The carried flame visibly dies instead of running out on a hidden clock: a glow on the
  // flame tip shrinks with the fuel the whole burn, and once it dips into the gutter zone
  // the flame flickers erratically (sprite alpha + light jitter via torchGutter, which
  // updateLighting also reads) while smoke wisps and stray embers trail off the tip at an
  // accelerating pace. The final snuff (extinguishTorch) still puffs its smoke as before.
  private updateTorchFx(delta: number): void {
    const showing = this.isTorchLit && this.backItemBb?.visible === true && !this.cutsceneActive;
    if (!showing) {
      this.torchFlameBb?.setVisible(false);
      this.torchGutter.level = 1.0;
      this.torchGutter.velocity = 0;
      this.torchEmberTimer = 0;
      // A dying-flame alpha flicker must never survive onto the relit (or swapped) item.
      if (this.backItemBb && this.backItemBb.alpha !== 1) this.backItemBb.setAlpha(1);
      return;
    }

    const frac = this.torchFuelFrac;
    // 0 while healthy, ramping to 1 as the fuel crosses the gutter threshold toward empty.
    const dying = Phaser.Math.Clamp(1 - frac / TORCH_GUTTER_FRAC, 0, 1);

    // Mean-reverting random flicker: the level jitters around a centre that SINKS as the
    // fuel runs out (a guttering flame sags more than it spikes). Pure random walk pins at
    // the clamp for long stretches and reads as steady — the pull keeps it oscillating.
    const gutterCentre = 1 - dying * 0.28;
    this.torchGutter.velocity +=
      (Math.random() - 0.5) * (0.03 + dying * 0.16) +
      (gutterCentre - this.torchGutter.level) * 0.015;
    this.torchGutter.velocity *= 0.8;
    this.torchGutter.level = Phaser.Math.Clamp(
      this.torchGutter.level + this.torchGutter.velocity * (delta / 16),
      1 - (0.12 + dying * 0.45),
      1.06,
    );

    // The torch sprite itself only flickers once it's guttering — a healthy flame is steady.
    this.backItemBb!.setAlpha(dying > 0 ? 0.7 + 0.3 * Phaser.Math.Clamp(this.torchGutter.level, 0, 1) : 1);

    // Flame-tip fire: a real 3D emissive billboard (the same tiny-fire sprite that burns on a
    // lit bush), so the flame blooms in the post and sits IN the world — where it used to be a
    // flat 2D image pasted over the canvas, outside the bloom and the tone mapping. Its cycling
    // frames and a one-notch sideways nudge are the whole animation language: no smooth sway.
    const bb = this.backItemBb!;
    if (!this.torchFlameBb) {
      this.torchFlameBb = this.world3d?.addBillboard(
        TORCH_FLAME_KEYS[0], 0, { emissive: true, emissiveBoost: 4 },
      );
      if (!this.torchFlameBb) return;
    }
    const lvl = this.torchGutter.level;
    const flickerStep = (Math.floor(this.time.now / 90) % 3) - 1;
    const flameW = 0.16 + 0.26 * frac; // tiles
    const flameH = flameW * (1.35 + 0.12 * lvl);
    const frameKey = TORCH_FLAME_KEYS[
      Math.floor(this.time.now / TORCH_FLAME_FRAME_MS) % TORCH_FLAME_KEYS.length
    ];
    // The stick stands 1 tile tall from elevation 0.18; the flame licks just past its tip.
    this.torchFlameBb
      .setTexture(frameKey)
      .setPosition(bb.x + flickerStep * 0.03, bb.y)
      .setElevation(0.94 - flameH * 0.1)
      .setDisplaySize(flameW, flameH)
      .setAlpha(dying > 0 ? 0.65 + 0.35 * lvl : 1)
      .setVisible(true);
    // A guttering flame reddens; a healthy one keeps its HDR boost (clearTint restores it).
    if (dying > 0) this.torchFlameBb.setTint(0xd8562a);
    else this.torchFlameBb.clearTint();

    // Smoke + embers off the tip while guttering, faster the closer to burnout.
    if (dying > 0) {
      this.torchEmberTimer += delta;
      if (this.torchEmberTimer >= 340 - dying * 210) {
        this.torchEmberTimer = 0;
        this.spawnTorchWisp(bb.x, bb.y, dying);
      }
    } else {
      this.torchEmberTimer = 0;
    }
  }

  // One wisp off a guttering torch: a tiny ember or a puff of smoke, rising off the flame's tip.
  // (wx, wy) is the torch's tile; the wisp starts just above its head.
  private spawnTorchWisp(wx: number, wy: number, dying: number): void {
    const w3 = this.world3d;
    if (!w3) return;
    const ember = Math.random() < 0.35;
    const size = ember ? 0.07 : 0.1 + dying * 0.05;
    // An ember glows (additive, HDR → it blooms); smoke only occludes.
    const wisp = w3
      .addBillboard(ember ? FX_DOT_TEXTURE : FX_PUFF_TEXTURE, 0, ember
        ? { ...FX_BILLBOARD, additive: true, emissiveBoost: 2 }
        : { ...FX_BILLBOARD, emissive: true, alphaTest: 0.02 })
      .setTint(ember ? 0xffb060 : 0xcac5bd)
      .setPosition(wx + (Math.random() - 0.5) * 0.08, wy)
      .setElevation(1.06)
      .setDisplaySize(size, size)
      .setAlpha(ember ? 0.95 : 0.5);
    this.tweens.add({
      targets: wisp,
      x: wisp.x + (Math.random() - 0.5) * 0.24,
      elevation: 1.06 + (ember ? 0.35 : 0.6),
      alpha: 0,
      duration: ember ? 320 : 480 + Math.floor(dying * 160),
      ease: 'Linear',
      onComplete: () => wisp.destroy(),
    });
  }

  /** Bring a dead campfire to life with fanfare, expanding the safe ring under the hero. */
  /**
   * Fotografa o que e volatil na cena (mochila, moedas, melhorias, itens no chao, dialogos) para
   * dentro do adventureState e grava. Chamado nos eventos que mudam o mundo — acender fogueira,
   * pegar/pousar item, comprar, falar, viajar, morrer — e barato o bastante para nao ser
   * economizado: o retrato inteiro tem poucos KB.
   */
  private persistAdventure(): void {
    if (!this.adventure) return;
    const st = adventureState();
    st.started = true;
    st.coins = this.coinManager?.coinTotal ?? st.coins;
    st.inventory = this.inventory.list();
    st.selected = this.inventory.selected;
    st.litFireCount = this.litFireCount;
    st.wizardIntroSeen = this.wizardIntroSeen;
    st.seenDialogKeys = new Set(this.seenDialogKeys);
    st.seenItems = new Set(this.seenItems);
    if (this.itemManager) {
      st.groundItems.set(
        this.adventureScope,
        this.itemManager.snapshot().map((s) => ({
          kind: s.kind, worldX: s.worldX, worldY: s.worldY, count: s.units,
        })),
      );
    }
    // A FABRICA do jogador, e o que ha dentro dos baus dele. So o que ele CONSTRUIU (o
    // `playerBuilt`): as pecas autoradas ja moram no world.json, e grava-las aqui as duplicaria
    // no proximo boot — cada carga do save empilharia mais uma caldeira em cima da mesma.
    st.machines.set(this.adventureScope, this.snapshotBuiltMachines());
    saveAdventure();
  }


  /** O diff de fabrica que vai ao save: so as pecas do jogador, com o conteudo dos baus. */
  private snapshotBuiltMachines(): AdventureMachine[] {
    const out: AdventureMachine[] = [];
    for (const wire of this.wires) {
      if (!wire.playerBuilt) continue;
      out.push({ type: 'wire', worldX: wire.worldX, worldY: wire.worldY });
    }
    for (const belt of this.belts) {
      if (!belt.playerBuilt) continue;
      out.push({ type: 'belt', worldX: belt.worldX, worldY: belt.worldY, dir: belt.dir });
    }
    for (const furnace of this.furnaces) {
      if (!furnace.playerBuilt) continue;
      out.push({
        type: 'furnace', worldX: furnace.worldX, worldY: furnace.worldY, dir: furnace.dir,
      });
    }
    for (const hammer of this.tripHammers) {
      if (!hammer.playerBuilt) continue;
      out.push({
        type: 'tripHammer', worldX: hammer.worldX, worldY: hammer.worldY, dir: hammer.dir,
      });
    }
    for (const extractor of this.extractors) {
      if (!extractor.playerBuilt) continue;
      out.push({
        type: 'extractor', worldX: extractor.worldX, worldY: extractor.worldY, dir: extractor.dir,
      });
    }
    for (const boiler of this.boilers) {
      if (!boiler.playerBuilt) continue;
      out.push({ type: 'boiler', worldX: boiler.worldX, worldY: boiler.worldY });
    }
    // A LAJE nao guarda `dir` (nao tem frente) nem o que esta em cima: a peca sobre ela e estado
    // de partida como a carga do bau, mas ao contrario do bau ela nunca fica sozinha no mundo —
    // o jogador esta ali malhando. Salvar o meio de uma martelada seria salvar um gesto.
    for (const altar of this.altars) {
      if (!altar.playerBuilt) continue;
      out.push({ type: 'altar', worldX: altar.worldX, worldY: altar.worldY });
    }
    for (const arm of this.inserters) {
      if (!arm.playerBuilt) continue;
      out.push({ type: 'inserter', worldX: arm.worldX, worldY: arm.worldY, dir: arm.dir });
    }
    for (const chest of this.chests) {
      // O bau e a UNICA excecao ao `playerBuilt` nesta lista: um bau AUTORADO tambem tem
      // conteudo, e conteudo e estado de partida. Ele entra sem `dir` e o restore o reconhece
      // pela posicao — ver restoreBuiltMachines.
      const kind = chest.storedKind;
      if (!chest.playerBuilt && !kind) continue;
      out.push({
        type: 'chest',
        worldX: chest.worldX,
        worldY: chest.worldY,
        content: kind ? { kind, count: chest.storedCount } : null,
      });
    }
    return out;
  }

  /**
   * O caminho de volta: o diff de fabrica do save, aplicado por cima do mundo ja construido.
   *
   * O MUNDO SEMPRE GANHA, e essa e a unica regra aqui — a mesma dos buracos da pa. Se o autor
   * pos uma peca no tile onde o jogador tinha uma, a do autor fica e a do save e descartada; se
   * o terreno mudou e o tile virou parede, a peca nao nasce. O contrario (o save sobrescrevendo)
   * transformaria toda edicao no /editor e toda carta de chunk comprada num campo minado.
   *
   * Levels e explorador nunca chegam aqui: la, zerar E o desenho.
   */
  private restoreBuiltMachines(): void {
    if (!this.adventure) return;
    const saved = adventureState().machines.get(this.adventureScope);
    if (!saved?.length) return;
    const occupied = (x: number, y: number): boolean =>
      this.chunkManager?.isCellBlocked(x, y) === true || this.machineAt(x, y);
    for (const machine of saved) {
      const { worldX: x, worldY: y } = machine;
      const dir = GameScene.asPropDir(machine.dir);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      // O bau AUTORADO nao renasce: ele ja existe. O que o save devolve nele e so a carga.
      if (machine.type === 'chest') {
        const existing = this.getChestAt(x, y);
        if (existing) {
          existing.restore(machine.content?.kind ?? null, machine.content?.count ?? 0);
          continue;
        }
      }
      if (occupied(x, y)) continue;
      if (!this.installMachine(machine.type, x, y, dir)) continue;
      // O bau NOVO tambem volta com o que tinha dentro — ele acabou de nascer no fim da lista.
      if (machine.type === 'chest') {
        this.chests[this.chests.length - 1]
          .restore(machine.content?.kind ?? null, machine.content?.count ?? 0);
      }
    }
  }

  /**
   * O tile em que o heroi esta AGORA vira o ponto onde ele acorda (morte, Continue). Chamado ao
   * entrar no anel seguro de um fogo aceso — o unico chao do jogo que promete manha seguinte.
   * So no overworld: dentro de dungeon o retorno e sempre a fogueira la de fora.
   */
  private anchorRespawnHere(): void {
    if (!this.adventure || getDungeonTrip()) return;
    const st = adventureState();
    const { worldX, worldY } = this.playerWorld;
    if (st.respawn && st.respawn.worldX === worldX && st.respawn.worldY === worldY) return;
    st.respawn = { worldX, worldY };
    this.persistAdventure();
  }

  /**
   * Reaplica ao terreno recem-carregado as arvores-tile que o jogador ja derrubou. O corte e
   * uma mutacao das arrays do WorldData (fellTreeTile) e o world.json volta LIMPO do disco a
   * cada boot e a cada volta de dungeon — sem este diff, a floresta desderrubava sozinha.
   * Roda ANTES do World3D existir: o construtor assa a malha lendo estes mesmos chunks.
   */
  private applyFelledTreeDiff(): void {
    const bounds = getWorldBounds();
    for (const key of adventureState().felledTrees) {
      const [wx, wy] = key.split(',').map(Number);
      if (!Number.isFinite(wx) || !Number.isFinite(wy)) continue;
      const cx = Math.floor(wx / CHUNK_COLUMNS);
      const cy = Math.floor(wy / CHUNK_ROWS);
      // Fora do mundo autorado getChunkTerrain fabrica um chunk de mar descartavel — mutar ali
      // seria gravar no vazio. So tiles dentro dos limites reais entram no diff.
      if (cx < bounds.minCx || cx > bounds.maxCx || cy < bounds.minCy || cy > bounds.maxCy) continue;
      const terrain = getChunkTerrain(cx, cy);
      const lx = ((wx % CHUNK_COLUMNS) + CHUNK_COLUMNS) % CHUNK_COLUMNS;
      const ly = ((wy % CHUNK_ROWS) + CHUNK_ROWS) % CHUNK_ROWS;
      terrain.upper[ly][lx] = null;
      terrain.collisions[ly][lx] = false;
    }
  }

  /**
   * A superfície sob um buraco CAVADO também não volta: a pá limpou a grama baixa (decor da
   * camada upper) na cavada, e o world.json volta limpo do disco — sem este diff, a folhagem
   * renasceria POR BAIXO do buraco salvo. Mesmo compasso do applyFelledTreeDiff: roda ANTES do
   * World3D assar. Só decor NÃO-sólido sai (um gerador futuro pondo árvore ali não é derrubado
   * por um buraco); a ossada fica de fora porque ela é memória de SESSÃO (CorpseDecals), nunca
   * do save.
   */
  private applyDugSpotDiff(): void {
    const bounds = getWorldBounds();
    for (const key of adventureState().dugSpots) {
      const [wx, wy] = key.split(',').map(Number);
      if (!Number.isFinite(wx) || !Number.isFinite(wy)) continue;
      const cx = Math.floor(wx / CHUNK_COLUMNS);
      const cy = Math.floor(wy / CHUNK_ROWS);
      if (cx < bounds.minCx || cx > bounds.maxCx || cy < bounds.minCy || cy > bounds.maxCy) continue;
      const terrain = getChunkTerrain(cx, cy);
      const lx = ((wx % CHUNK_COLUMNS) + CHUNK_COLUMNS) % CHUNK_COLUMNS;
      const ly = ((wy % CHUNK_ROWS) + CHUNK_ROWS) % CHUNK_ROWS;
      const upper = terrain.upper[ly][lx];
      if (upper !== null && !SOLID_UPPER_FRAMES.has(upper) && !terrain.collisions[ly][lx]) {
        terrain.upper[ly][lx] = null;
      }
    }
  }

  private lightCampfire(cf: CampfireObject, wx: number, wy: number): void {
    if (cf.isLit) return;
    this.litFireCount += 1; // drives the wizard's story progression
    if (this.adventure && !getDungeonTrip()) {
      // O fogo aceso entra no save na hora — e o heroi que o acendeu esta a um passo dele: este
      // tile vira o ponto de acordar (anchorRespawnHere persiste).
      adventureState().litFires.add(`${cf.worldX},${cf.worldY}`);
      this.anchorRespawnHere();
      this.persistAdventure();
    }
    // The very first fire the player brings back to life plays the one-time cut-scene.
    if (!this.firstCampfireLit) {
      this.firstCampfireLit = true;
      this.playFirstCampfireCutscene(cf, wx, wy);
      return;
    }
    if (!cf.light()) return;
    getSoundManager().playIgnite();
    this.spawnFireHitEffect(wx, wy);
    this.cameras.main.flash(220, 255, 200, 110);
    // The new safe ring is born under the hero — clear PERIGO now instead of waiting a frame.
    const dist = this.distToNearestCampfireTiles(this.playerWorld.worldX, this.playerWorld.worldY);
    this.playerSafe = dist <= CAMPFIRE_SAFE_RADIUS_TILES;
  }

  // The first cut-scene of the game: lighting the first dead fire. Freezes the world, clears all
  // enemies, pans the camera onto the fire, ignites it in slow motion with its glow blooming open,
  // hits a bright flash + fire roar at the peak, then pans back to the hero and resumes.
  private playFirstCampfireCutscene(cf: CampfireObject, wx: number, wy: number): void {
    if (!this.camera) { cf.light(); return; }
    this.cutsceneActive = true;
    this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
    this.stopBreathing();
    this.hideLowHealthOutlines();
    this.enemyManager?.despawnAll(); // all enemies vanish to focus on the moment
    getSoundManager().fadeMusicOut();

    // The hero's own glow cuts out instantly — the campfire becomes the only light on screen.
    this.cutsceneHeroLight = 0;

    const { width, height } = this.scale;
    // Screen-centre offset that puts the campfire tile at the true middle of the screen.
    const fireCenter = {
      x: Math.round(width / 2 - (cf.worldX - this.playerWorld.worldX) * this.tileSize),
      y: Math.round(height / 2 - (cf.worldY - this.playerWorld.worldY) * this.tileSize),
    };
    const heroCenter = this.baseScreenCenter();
    this.cutsceneFireLight = { worldX: cf.worldX, worldY: cf.worldY, progress: 0 };

    // Phase 1 — pan the camera off the hero and onto the fire (slow).
    this.cutscenePan(fireCenter.x, fireCenter.y, 1600, () => {
      // Phase 2 — slow-motion ignition: the dead fire catches bit by bit and its light blooms.
      const grow = { t: 0 };
      this.tweens.add({
        targets: grow,
        t: 1,
        duration: 3400,
        ease: 'Sine.easeIn',
        onUpdate: () => {
          cf.igniteProgress(grow.t);
          if (this.cutsceneFireLight) this.cutsceneFireLight.progress = grow.t * 0.7;
          if (Math.random() < 0.08) this.spawnFireHitEffect(wx, wy); // building sparks
          this.reprojectStatic();
        },
        onComplete: () => {
          // Phase 3 — the peak: full ignition, blinding flash, fire roar.
          cf.light();
          this.cutsceneFireLight = undefined; // the real campfire light takes over now
          this.cameras.main.flash(600, 255, 220, 150);
          getSoundManager().playIgnite();
          this.spawnFireHitEffect(wx, wy);
          this.reprojectStatic();
          // Hold on the blaze, then pan back to the hero and resume.
          this.time.delayedCall(1400, () => {
            // The hero's glow eases back in as the camera returns to him.
            this.tweens.add({ targets: this, cutsceneHeroLight: 1, duration: 1400, ease: 'Sine.easeOut' });
            this.cutscenePan(heroCenter.x, heroCenter.y, 1400, () => {
              this.cutsceneActive = false;
              this.cutsceneHeroLight = 1;
              getSoundManager().fadeMusicIn();
              const dist = this.distToNearestCampfireTiles(this.playerWorld.worldX, this.playerWorld.worldY);
              this.playerSafe = dist <= CAMPFIRE_SAFE_RADIUS_TILES;
            });
          });
        },
      });
    });
  }

  // Tween the camera's screen-centre to (tx, ty) over `duration`, re-projecting the frozen world
  // each frame. Like animateScreenCenter but with a custom duration + done callback, and it does
  // NOT touch camShifting (the cut-scene owns the freeze via cutsceneActive).
  private cutscenePan(tx: number, ty: number, duration: number, onDone: () => void): void {
    if (!this.camera) { onDone(); return; }
    const state = { x: this.camera.screenCenterX, y: this.camera.screenCenterY };
    this.tweens.add({
      targets: state,
      x: tx,
      y: ty,
      duration,
      ease: 'Cubic.easeInOut',
      onUpdate: () => {
        if (!this.camera) return;
        this.camera.screenCenterX = Math.round(state.x);
        this.camera.screenCenterY = Math.round(state.y);
        this.reprojectStatic();
      },
      onComplete: () => {
        if (this.camera) {
          this.camera.screenCenterX = Math.round(tx);
          this.camera.screenCenterY = Math.round(ty);
          this.reprojectStatic();
        }
        onDone();
      },
    });
  }

  // One warm ember mote drifting from the nearest lit campfire into the hero — the visible
  // stream that says "the fire is healing you". Screen-anchored (the hero rests inside the
  // ring, so both endpoints barely move over a mote's short life), like spawnSmokePuff.
  private spawnHealMote(): void {
    const w3 = this.world3d;
    if (!w3) return;
    const cf = this.nearestLitCampfire(this.playerWorld.worldX, this.playerWorld.worldY);
    if (!cf) return;
    const spread = 0.22;
    const size = 0.07 + Math.random() * 0.06;
    const mote = w3
      .addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 2 })
      .setTint(0xffc36b)
      .setPosition(cf.worldX + (Math.random() - 0.5) * spread * 2, cf.worldY + (Math.random() - 0.5) * spread)
      .setElevation(0.3 + Math.random() * spread)
      .setDisplaySize(size, size)
      .setAlpha(0.9);
    // It drifts off the flame and sinks into the hero's chest, shrinking as it's absorbed —
    // a real path through the world now, so it passes behind whatever stands between them.
    this.tweens.add({
      targets: mote,
      x: this.playerWorld.worldX + (Math.random() - 0.5) * 0.12,
      y: this.playerWorld.worldY,
      elevation: FX_BODY_ELEV,
      scaleX: size * 0.35,
      scaleY: size * 0.35,
      alpha: 0.55,
      duration: HEAL_MOTE_TRAVEL_MS,
      ease: 'Sine.easeInOut',
      onComplete: () => mote.destroy(),
    });
  }

  // The heal tick landed: a warm wave blooms out of the hero, the payoff of the mote stream.
  private spawnHealBurst(): void {
    this.spawnShockwave(this.playerWorld.worldX, this.playerWorld.worldY, 0xffc36b, 0.44, 1.7, 430);
    // Brief warm glow on the hero himself as the heart mends.
    this.hero.tint = 0xffd9a0;
    this.time.delayedCall(220, () => { this.hero.tint = null; });
  }

  // A few grey puffs rising where a flame died.
  private spawnSmokePuff(wx: number, wy: number): void {
    const w3 = this.world3d;
    if (!w3) return;
    for (let i = 0; i < 3; i++) {
      // Unlit but NOT additive: smoke must not glow — it veils. The near-zero alphaTest lets it
      // fade out instead of popping when its opacity crosses the default cutoff.
      const puff = w3
        .addBillboard(FX_PUFF_TEXTURE, 0, { ...FX_BILLBOARD, emissive: true, alphaTest: 0.02 })
        .setTint(0xcac5bd)
        .setPosition(wx + (Math.random() - 0.5) * 0.16, wy)
        .setElevation(0.35)
        .setDisplaySize(0.26, 0.26)
        .setAlpha(0.38);
      this.tweens.add({
        targets: puff,
        elevation: 1.05,
        alpha: 0,
        scaleX: 0.47,
        scaleY: 0.47,
        duration: 500 + i * 120,
        ease: 'Power2.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  }

  // Wood chips bursting up as a plank is laid — a small spray per deposit, a bigger one when
  // the bridge finishes. Screen-anchored (the hero is stopped here), like spawnSmokePuff.
  private spawnBridgeChips(wx: number, wy: number, count: number): void {
    if (!this.camera) return;
    const s = this.camera.tileToScreen(wx, wy, this.tileSize);
    const colors = [0x815938, 0x63452c, 0x966b48];
    const size = Math.max(2, Math.floor(this.tileSize * 0.13));
    for (let i = 0; i < count; i++) {
      const chip = this.add
        .rectangle(s.x + Phaser.Math.Between(-4, 4), s.y + Phaser.Math.Between(-3, 3), size, size, colors[i % colors.length])
        .setDepth(SCENE_DEPTHS.player + 3)
        .setAngle(Phaser.Math.Between(0, 360));
      this.tweens.add({
        targets: chip,
        x: chip.x + Phaser.Math.Between(-6, 6) * (this.tileSize * 0.06),
        y: chip.y - this.tileSize * (0.35 + Math.random() * 0.5),
        angle: chip.angle + Phaser.Math.Between(-200, 200),
        alpha: 0,
        duration: 320 + i * 18,
        ease: 'Quad.easeOut',
        onComplete: () => chip.destroy(),
      });
    }
  }

  // Torrões de terra chutados por uma pazada — o gesto das lascas da ponte com a física
  // invertida: lasca de madeira voa e SOME no ar; torrão é PESO — sobe rápido, para, e CAI de
  // volta, apagando só quando pousa. Cores da própria arte do buraco (aro recém-cavado, sombra
  // e nightsoil), para que o que voa e o que fica no chão leiam como a mesma terra.
  private spawnDirtBurst(wx: number, wy: number, count: number): void {
    if (!this.camera) return;
    const s = this.camera.tileToScreen(wx, wy, this.tileSize);
    const colors = [0x63452c, 0x3e2533, 0x452939];
    const size = Math.max(2, Math.floor(this.tileSize * 0.11));
    for (let i = 0; i < count; i++) {
      const clod = this.add
        .rectangle(s.x + Phaser.Math.Between(-5, 5), s.y + Phaser.Math.Between(-2, 2), size, size, colors[i % colors.length])
        .setDepth(SCENE_DEPTHS.player + 3)
        .setAngle(Phaser.Math.Between(0, 360));
      const driftX = Phaser.Math.Between(-8, 8) * (this.tileSize * 0.045);
      const rise = this.tileSize * (0.28 + Math.random() * 0.34);
      this.tweens.add({
        targets: clod,
        x: clod.x + driftX * 0.6,
        y: clod.y - rise,
        angle: clod.angle + Phaser.Math.Between(-160, 160),
        duration: 150 + i * 12,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: clod,
            x: clod.x + driftX * 0.4,
            // Cai um fio ALÉM de onde subiu: o torrão pousa em volta do buraco, não dentro.
            y: clod.y + rise * (0.8 + Math.random() * 0.35),
            angle: clod.angle + Phaser.Math.Between(-120, 120),
            alpha: 0,
            duration: 190 + i * 14,
            ease: 'Quad.easeIn',
            onComplete: () => clod.destroy(),
          });
        },
      });
    }
  }

  // ── Bomb / seeds ────────────────────────────────────────────────────────────
  // The game is walk-only — no "use item" button — so every placement has a walk-on affordance:
  // a spot mark (a breathing purple ghost of the thing that goes there). The hero stepping onto
  // it with the right item in hand places it, exactly like stepping on a pickup collects it.
  // With anything else in hand the step does nothing: the mark's own art is the invitation.
  private handleTileEntered(wx: number, wy: number): void {
    // O fog of war do mapa: o chunk pisado entra no save (176 chaves no maximo, um evento raro).
    if (this.adventure && !getDungeonTrip()) {
      const chunkKey = `${Math.floor(wx / CHUNK_COLUMNS)},${Math.floor(wy / CHUNK_ROWS)}`;
      const st = adventureState();
      if (!st.visitedChunks.has(chunkKey)) {
        st.visitedChunks.add(chunkKey);
        saveAdventure();
      }
    }
    const levelPortal = this.getLevelPortalAt(wx, wy);
    if (levelPortal) {
      // O MESMO portal, duas leituras. Num level ele e a saida para o proximo — nao ha o que
      // decidir, so passar. No explorador ele e a unica pergunta do modo, e por isso ele
      // PERGUNTA em vez de engolir: pisar sem querer no caminho de casa nao pode custar metade
      // da bolsa (ver ExtractPrompt).
      if (this.explorer) this.askExtraction(levelPortal);
      // A BOCA DE CAVERNA do overworld: ela sabe qual dungeon abre, e por isso e a unica das tres
      // leituras que carrega um numero. Sem ele nao daria para distinguir a entrada da saida —
      // sao o mesmo prop, no mesmo tile, e o que muda e de que lado o heroi esta.
      else if (levelPortal.level !== undefined) void this.enterDungeon(levelPortal);
      // Dentro de uma dungeon, o mesmo portal e a escada de volta.
      else if (getDungeonTrip()) void this.leaveDungeon(levelPortal);
      else void this.completeLevel(levelPortal);
      return;
    }

    // OS DEPOSITOS SAIRAM DAQUI, e essa e a maior consequencia dos dois botoes.
    //
    // Metade das pecas do jogo vivia em cima de um truque: como nao havia botao, PISAR num tile
    // depositava o que estava na mao — era assim que se alimentava o braco robotico, as duas
    // bandejas da caixa de ferramentas, o buraco de plantio, a marca da bomba e o cabo morto que
    // recebe a bateria. O preco era um acidente silencioso: atravessar uma bandeja carregando a
    // coisa errada entregava a coisa errada, sem gesto nenhum do jogador.
    //
    // Agora depositar e o botao B contra o tile a frente (ver pressUse/placeItemAt). As
    // afordancias continuam valendo INTEIRAS: a bomba-fantasma que respira, a bandeja que pulsa
    // enquanto esta vazia e a garra parada no ar nunca disseram "pise aqui" — disseram "ponha
    // algo aqui", e continuam certas.
    //
    // O que fica: pisar num cabo VIVO com a bateria VAZIA a carrega. Nao e um deposito — e o
    // espelho de encher o balde no rio, e ganhar carga nunca foi uma coisa que o jogador possa
    // fazer sem querer e perder.
    if (this.heldItem === 'battery' && this.liveWires.has(`${wx},${wy}`)) {
      this.inventory.replace('battery', 'batteryFull');
      this.heldBatteryChargeMs = BATTERY_FEED_MS; // a rede viva enche ate a boca
      this.updateBackItem();
      getSoundManager().playBatteryCharge();
      this.spawnBatteryChargeFx(wx, wy);
    }
  }

  // The one consumable: planted on a bombSpot, it sits lit; after the fuse it explodes —
  // killing every enemy in the blast and setting fire to everything flammable there.
  // Returns true only if the bomb really was planted (the caller spends the spot on that).
  private placeBombAt(worldX: number, worldY: number): boolean {
    if (this.heldItem !== 'bomb' || !this.world3d) return false;

    this.clearHeldItem();
    getSoundManager().playBombPlace();

    const sprite = this.world3d
      // The hero is STANDING on this tile as the bomb is planted, and walks off it while the
      // fuse burns: ground layer, or the two upright quads are coplanar (see DEPTH_LAYER).
      .addBillboard('bomb-item', BOMB_FRAMES.item, { depthLayer: 'ground' })
      .setPosition(worldX, worldY)
      .setDisplaySize(0.62, 0.62);

    // Fuse: accelerating red blink until it blows. The handle lives on the bomb record so an
    // EARLY explosion (fire reaching the payload) can kill the blink with the sprite.
    const fuseTween = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: BOMB_FUSE_MS,
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        const blink = Math.sin(t * t * 40) > 0;
        sprite.setTint(blink ? 0xff4444 : 0xffffff);
      },
    });
    const bomb = { worldX, worldY, sprite, fuseTween };
    this.activeBombs.push(bomb);
    this.time.delayedCall(BOMB_FUSE_MS, () => this.explodeBomb(bomb));
    return true;
  }

  // ── The farming loop (plantSpot) ────────────────────────────────────────────
  // Seeds (the scythe's product) planted in a hole + a bucket of water = REAL tall grass, a
  // little later and with a sprout animation. From then on it is grass like any other — blocks,
  // conducts fire, falls to the scythe (yielding seeds again). When that grass is consumed, the
  // hole reopens (see updatePlantSpots): the loop is renewable by design — placeable fuel the
  // player GROWS, so a burnt fuse is never a dead end.
  private static readonly PLANT_GROW_MS = 3500;
  private static readonly PLANT_REOPEN_MS = 2600;

  // The thrown water LANDED on a planted mound: the earth darkens, drinks, and germination
  // starts. (The bucket already emptied at the throw — see throwBucketWater.)
  private waterPlantSpot(spot: PlantSpotObject, wx: number, wy: number): void {
    if (!spot.water(GameScene.PLANT_GROW_MS, () => this.growPlantedGrass(spot))) return;
    getSoundManager().playSplash();
    this.spawnSmokePuff(wx, wy); // the mist of the pour settling over the wet earth
  }

  /** The watered mound germinated: sprout the real grass (waiting for the tile to be clear). */
  private growPlantedGrass(spot: PlantSpotObject): void {
    if (!spot.isWatered) return; // scene reset re-guard
    if (!this.isTileClearForRegrow(spot.worldX, spot.worldY)) {
      this.time.delayedCall(400, () => this.growPlantedGrass(spot));
      return;
    }
    // O canteiro brota O QUE recebeu (sownKind): a semente comum vira mato — combustível; a
    // carnívora vira a planta-armadilha — defesa. O mesmo monte, a mesma água, dois destinos.
    if (spot.sownKind === 'carnivoreSeeds') {
      const plant = new CarnivorousPlantObject(this, spot.worldX, spot.worldY);
      plant.sproutIn();
      this.carnivorousPlants.push(plant);
      spot.setGrown(plant);
    } else {
      const grass = new TallGrassObject(this, spot.worldX, spot.worldY);
      grass.sproutIn();
      this.tallGrasses.push(grass);
      spot.setGrown(grass);
    }
    getSoundManager().playGrassCut(); // the blades pushing out — the same dry rustle
  }

  /**
   * A PÁ pode cavar aqui? A fechadura dela é o CHÃO NU DE TERRA (DIGGABLE_GROUND_FRAMES — o
   * pátio de pedra, a laje, a alvenaria de dungeon e o mar recusam a lâmina), e "nu" é a
   * pergunta LARGA duas vezes: nada ocupando o tile (isTileOccupied: parede, bicho, item,
   * coração, bomba, o próprio herói) e nenhum prop NEM NÃO-BLOQUEANTE em cima — um toco de
   * mato, uma marca de bomba, um cabo, uma placa ou um canteiro já cavado são todos "este
   * chão já tem dono". Congelado também recusa: gelo primeiro, terra depois.
   */
  private canDigAt(wx: number, wy: number): boolean {
    const chunkX = Math.floor(wx / CHUNK_COLUMNS);
    const chunkY = Math.floor(wy / CHUNK_ROWS);
    if (this.chunkManager?.hasChunkCoordinate(chunkX, chunkY) !== true) return false;
    if (!DIGGABLE_GROUND_FRAMES.has(this.chunkManager.getTile(wx, wy).ground)) return false;
    if (this.freezeManager?.frozenAt(wx, wy)) return false;
    if (this.isTileOccupied(wx, wy)) return false;
    for (const entry of this.propRegistry) {
      if (this.propAt(entry.list, wx, wy)) return false;
    }
    return true;
  }

  /**
   * O impacto da pá: nasce um canteiro (plantSpot) DE VERDADE — o mesmo objeto dos autorados,
   * então semente, balde, mato e reabertura já o conhecem sem uma linha nova. O push é in
   * place de propósito (o propRegistry referencia este array; ver o comentário dele). Na
   * aventura de overworld o buraco é ESTRUTURA do jogador e entra no save como diff (o padrão
   * felledTrees) — dungeon não tem terra, e level/explorador zeram por desenho.
   */
  private digPlantHole(wx: number, wy: number): void {
    if (!this.canDigAt(wx, wy)) return; // o mundo teve 150ms para mudar — reconfere no impacto
    getSoundManager().playGrassCut(); // terra revirada — o mesmo farfalhar seco do plantio
    // SÓ O BURACO FICA NO TILE: cavar revolve a superfície inteira. A grama baixa assada no
    // terreno (decor da camada upper — não-sólido por construção: um frame sólido teria barrado
    // o canDigAt) e a ossada/mancha de quem morreu ali SOMEM sob a terra virada. Sem isto o
    // recorte do buraco desenha por cima de folhagem e osso — três pinturas no mesmo chão.
    const chunks = this.chunkManager;
    if (chunks) {
      const chunk = chunks.getChunk(Math.floor(wx / CHUNK_COLUMNS), Math.floor(wy / CHUNK_ROWS));
      const lx = ((wx % CHUNK_COLUMNS) + CHUNK_COLUMNS) % CHUNK_COLUMNS;
      const ly = ((wy % CHUNK_ROWS) + CHUNK_ROWS) % CHUNK_ROWS;
      if (chunk.upper[ly][lx] !== null) {
        chunk.upper[ly][lx] = null;
        this.world3d?.removeDecorTile(wx, wy);
      }
    }
    this.enemyManager?.removeCorpseAt(wx, wy);
    const spot = new PlantSpotObject(this, wx, wy, { dug: true });
    this.plantSpots.push(spot);
    // A CAVADA AOS POUCOS: o canteiro aprofunda em quatro tempos (os frames do sheet — ver
    // PlantSpotObject.animateDigIn), e cada tempo tem o seu peso aqui fora. A poeira seca sobe
    // no impacto; os torrões voam em três levas que MINGUAM (a primeira pazada tira o grosso);
    // e a última batida — a que chuta os torrões desenhados pra fora do aro — assenta com o
    // baque surdo e um tremorzinho na direção da pazada. Tudo no compasso de DIG_STAGE_MS:
    // uma fonte só, ou o som e a terra dessincronizam do desenho na primeira mexida no número.
    this.spawnSmokePuff(wx, wy);
    this.spawnDirtBurst(wx, wy, 7);
    const beat = PlantSpotObject.DIG_STAGE_MS;
    this.time.delayedCall(beat, () => this.spawnDirtBurst(wx, wy, 5));
    this.time.delayedCall(beat * 2, () => this.spawnDirtBurst(wx, wy, 4));
    this.time.delayedCall(beat * 3, () => {
      this.spawnDirtBurst(wx, wy, 3);
      getSoundManager().playFootstep(); // o assentar da terra — o mesmo baque de pousar algo
      const dx = Math.sign(wx - this.playerWorld.worldX);
      const dy = Math.sign(wy - this.playerWorld.worldY);
      this.world3d?.shake(50, 0.025, dx, dy);
    });
    if (this.adventure && !getDungeonTrip()) {
      adventureState().dugSpots.add(`${wx},${wy}`);
      this.persistAdventure();
    }
  }

  /**
   * Drive every robotic arm. The arms get a tiny port instead of the scene itself: an arm only
   * ever needs to ask four things about the world, and handing it `this` would let it reach the
   * other three thousand lines by accident.
   *
   * `blocked` deliberately passes hazardsPassable=false — the lava boots are the HERO's
   * privilege, not the machine's. An arm will not lay an item down in a river or on lava, where
   * it would be stranded on a tile the hero can only reach wearing the one item that cannot
   * carry anything out.
   */
  private updateInserters(delta: number): void {
    if (!this.inserters.length) return;
    // A regra da roda d'agua, aplicada ao unico som do braco que REPETE enquanto o estado durar:
    // uma maquina travada do outro lado do mapa nao pode ficar batendo no ouvido de ninguem. Uma
    // variavel de laco em vez de um port por braco — o port e compartilhado de proposito, e
    // construir um objeto novo por braco por quadro seria lixo por quadro.
    let strainAudible = false;
    const port: ArmWorldPort = {
      hasItem: (x, y) => this.itemManager?.hasItemAt(x, y) ?? false,
      take: (x, y) => this.itemManager?.takeAt(x, y) ?? null,
      put: (kind, x, y, fire, chargeMs, units) => {
        // A BIGORNA ENGOLE a carga: com o martelo virado para dentro de si, a linha
        // esteira -> braco -> martinete -> (salta) -> bau continua inteira. `accept` so recusa
        // com a bigorna cheia, e nesse caso a carga cai no chao como sempre — nunca some.
        const anvil = this.propAt(this.tripHammers, x, y);
        if (anvil?.accept(kind)) return;
        this.itemManager?.drop(kind, x, y, fire, chargeMs, units);
        // A carga chegou ACESA: o graveto pousado e uma fonte de fogo — os vizinhos
        // inflamaveis pegam. E assim que a chama atravessa um muro sem combustivel nenhum.
        if (fire) this.scheduleGroundTorchSpread(x, y);
      },
      // Inimigos tambem contam: isSolidForEntities nao os inclui, e sem isto o braco largava a
      // carga debaixo de um undead parado na saida.
      blocked: (x, y) => {
        // Um martinete de bigorna VAZIA nao bloqueia o braco: ele e um destino de entrega, como
        // uma bandeja. Cheio, volta a ser corpo solido — e o braco espera, que e o que ele ja
        // faz diante de qualquer saida ocupada.
        const anvil = this.propAt(this.tripHammers, x, y);
        if (anvil) return anvil.carrying !== null;
        return this.isSolidForEntities(x, y)
          || (this.enemyManager?.getEnemyAt(x, y) ?? null) !== null;
      },
      grabbed: () => getSoundManager().playArmGrab(),
      swinging: () => getSoundManager().playArmServo(),
      released: () => getSoundManager().playArmRelease(),
      strained: () => { if (strainAudible) getSoundManager().playArmStrain(); },
    };
    for (const arm of this.inserters) {
      strainAudible = Math.hypot(
        arm.worldX - this.playerWorld.worldX,
        arm.worldY - this.playerWorld.worldY,
      ) <= 10;
      // Tres modos, do mais fisico ao legado: um braco ENCOSTADO em cabo e um consumidor
      // cabeado — energia chega se um cabo vizinho esta VIVO (ou pela variavel sem fio, se
      // tambem houver: as duas redes somam por OR, como os produtores entre si). Sem cabo
      // nenhum: com vinculo, a variavel decide (falha segura); sem vinculo, autoalimentado
      // (compatibilidade com os bracos de antes da rede existir).
      //
      // `false` deixa a maquina parada, como sempre — mas antes de morrer ela DESFAZ a entrega
      // que fez (RoboticArmObject, no topo). Um braco autoalimentado, que nunca ve `false`, e a
      // unica variante sem volta, porque e a unica sem chave para desligar.
      const varPower = arm.variable ? this.globalVariables.get(arm.variable) === true : undefined;
      // A VAZAO chegou ao braco, e ela e o que o faz arrastar em vez de parar. A variavel sem
      // fio continua sendo tudo-ou-nada (ela nao e uma rede, e um interruptor), entao ela entra
      // como 1 e o OR de antes virou um `max` — mesma semantica, agora com quantidade.
      const satisfaction = this.wireTouching(arm.worldX, arm.worldY)
        ? Math.max(this.powerAt(arm.worldX, arm.worldY), varPower === true ? 1 : 0)
        : ((varPower ?? true) ? 1 : 0);
      const powered = satisfaction > 0;
      // Sem energia o delta vai INTEIRO: e com ele que o braco desfaz a entrega em curso (o
      // `REVERSE_RATE` dele). Escalar o delta de uma maquina desligada por uma satisfacao de
      // zero congelaria a garra no ar para sempre, com a carga pendurada.
      arm.update(powered ? delta * satisfaction : delta, port, powered);
    }
  }

  /**
   * Toca cada caixa de ferramentas. Mesmo desenho do braco robotico — um port minusculo em vez da
   * cena inteira —, e pelo mesmo motivo: a bancada precisa saber cinco coisas sobre o mundo, e
   * entregar `this` a deixaria alcancar as outras tres mil linhas por acidente.
   *
   * `occupied` e a pergunta LARGA (isTileOccupied), nao "e solido": um item caido nao bloqueia o
   * heroi, mas dois itens no mesmo tile seriam um sumico silencioso — e a mesma razao pela qual o
   * caixote e o portao de bater ja dividem essa lista.
   */
  private updateToolboxes(delta: number): void {
    if (!this.toolboxes.length) return;
    const port: ToolboxWorldPort = {
      kindAt: (x, y) => this.itemManager?.kindAt(x, y) ?? null,
      // A forja consome UMA unidade. O punhado (semente, minério — UNIT_PACK_KINDS) pousa
      // inteiro num item só, e engoli-lo aqui fundiria 5 ferros numa foice: o resto volta
      // ao tile no mesmo frame, e a bancada pega só o que a receita pede.
      take: (x, y) => {
        const taken = this.itemManager?.takeAt(x, y);
        if (!taken) return null;
        if (taken.units > 1) {
          this.itemManager?.drop(taken.kind, x, y, taken.fire, taken.chargeMs, taken.units - 1);
        }
        return taken.kind;
      },
      // `units` TEM de atravessar: a receita do cabo produz um PACOTE (ver TOOLBOX_RECIPES), e
      // esta linha ignorava o argumento — a bancada entregava um cabo por forja em vez de
      // quatro. O tipo do port pedia o parametro e o `drop` sabia recebe-lo; quem o perdia era
      // exatamente o ponto no meio, que e onde um argumento novo sempre se perde.
      put: (kind, x, y, units) => this.itemManager?.drop(kind, x, y, undefined, undefined, units),
      occupied: (x, y) => this.isTileOccupied(x, y),
      opened: () => getSoundManager().playToolboxOpen(),
      hammered: () => getSoundManager().playToolboxForge(),
      delivered: () => getSoundManager().playToolboxDeliver(),
      refused: () => getSoundManager().playToolboxRefuse(),
    };
    for (const box of this.toolboxes) {
      // A regra da roda d'agua: efeito e audio so existem perto do heroi. Uma bancada trabalhando
      // do outro lado do mapa nao pode martelar no ouvido de ninguem.
      const effectsVisible = Math.hypot(
        box.worldX - this.playerWorld.worldX,
        box.worldY - this.playerWorld.worldY,
      ) <= 10;
      box.update(delta, port, effectsVisible);
    }
  }

  /**
   * O FORNO — a reducao do minerio, que e a unica quimica de verdade deste jogo.
   *
   * O port e o mesmo da bancada, e de proposito: as duas maquinas comem dois itens do chao e
   * cospem um terceiro adiante. `occupied` continua sendo a pergunta LARGA (isTileOccupied), nao
   * "e solido": dois itens no mesmo tile seriam um sumico silencioso.
   */
  private updateFurnaces(delta: number): void {
    if (!this.furnaces.length) return;
    const port: FurnaceWorldPort = {
      kindAt: (x, y) => this.itemManager?.kindAt(x, y) ?? null,
      // Uma fornada come UMA unidade de cada. O punhado (o minerio sai do veio em pacote) pousa
      // inteiro num item so, e engoli-lo aqui fundiria cinco minerios numa esponja: o resto volta
      // ao tile no mesmo frame, exatamente como a bancada ja faz.
      take: (x, y) => {
        const taken = this.itemManager?.takeAt(x, y);
        if (!taken) return null;
        if (taken.units > 1) {
          this.itemManager?.drop(taken.kind, x, y, taken.fire, taken.chargeMs, taken.units - 1);
        }
        return taken.kind;
      },
      // `units` vem da fornada de CATALOGO: uma receita pode render mais de uma peca, e a fornada
      // de bandeja simplesmente nao passa o argumento (uma esponja por vez).
      put: (kind, x, y, units) => this.itemManager?.drop(kind, x, y, undefined, undefined, units),
      occupied: (x, y) => this.isTileOccupied(x, y),
      // A saida de emergencia da fornada de MAO (ver FurnaceObject.pickDeliverTile): o mesmo
      // vizinho livre que a bancada usa, escolhido pela distancia ate o heroi.
      landing: (x, y) => this.deliveryTileAround(x, y),
      lit: () => getSoundManager().playBoilerIgnite(),
      breath: () => getSoundManager().playBoilerPuff(),
      delivered: () => getSoundManager().playToolboxDeliver(),
    };
    for (const furnace of this.furnaces) {
      const effectsVisible = Math.hypot(
        furnace.worldX - this.playerWorld.worldX,
        furnace.worldY - this.playerWorld.worldY,
      ) <= 10;
      furnace.update(delta, port, effectsVisible);
    }
  }

  /**
   * O MARTINETE — a martelada tirada das mãos do jogador.
   *
   * A cena entra com duas coisas que a máquina não pode saber: ONDE cabe a peça pronta (só quem
   * conhece o chão, a água e o que já está caído responde isso) e se o herói está perto o bastante
   * para OUVIR. O resto — o ciclo, o peso do malho, a escória — é todo dela.
   */
  private updateTripHammers(delta: number): void {
    if (!this.tripHammers.length) return;
    const port: TripHammerWorldPort = {
      // A peça pronta SALTA para um tile livre: o mesmo gesto e o mesmo cálculo da bancada, porque
      // "a máquina te entrega no chão" tem de ser uma coisa só no jogo inteiro.
      eject: (kind, fromX, fromY) => {
        const landing = this.deliveryTileAround(fromX, fromY);
        if (!landing) return false;
        this.itemManager?.drop(kind, landing[0], landing[1]);
        this.flingCraftedItem(kind, fromX, fromY, landing[0], landing[1]);
        this.seenItems.add(kind);
        this.persistAdventure();
        return true;
      },
      struck: (finished) => {
        getSoundManager().playHammer();
        if (finished) this.time.delayedCall(120, () => getSoundManager().playToolboxDeliver());
      },
    };
    for (const hammer of this.tripHammers) {
      // Fora do quadro a máquina anda, mas não FALA: o `struck` toca som e sacode a tela, e um
      // martinete a dez tiles de distância gritando é o mesmo defeito de "ouço o que não vejo"
      // que o bestiário já pagou. O gate mora aqui, e não no port, porque é a CENA que sabe onde
      // o herói está.
      const near = Math.hypot(
        hammer.worldX - this.playerWorld.worldX,
        hammer.worldY - this.playerWorld.worldY,
      ) <= 10;
      hammer.update(
        delta,
        near ? port : { ...port, struck: () => {} },
        this.powerAt(hammer.worldX, hammer.worldY),
      );
    }
  }

  /**
   * A ESTEIRA. Um port minusculo, como o do braco e o da bancada — e pelo mesmo motivo: a peca
   * precisa saber quatro coisas sobre o mundo, e entregar `this` a deixaria alcancar as outras
   * tres mil linhas por acidente.
   *
   * `shift` e o unico metodo interessante: ele MOVE o item preservando tudo que ele carrega —
   * fogo, carga de bateria, contagem de pacote. Um graveto ACESO que entra numa esteira sai
   * aceso do outro lado (e acende o que houver de inflamavel no caminho, porque quem espalha
   * fogo continua sendo o sistema de fogo, nao a esteira), e cinco ferros continuam sendo cinco.
   * Reconstruir o item pelo `kind` teria apagado os tres silenciosamente.
   */
  private updateBelts(delta: number): void {
    if (!this.belts.length) return;
    const port: BeltWorldPort = {
      kindAt: (x, y) => this.itemManager?.kindAt(x, y) ?? null,
      shift: (fromX, fromY, toX, toY) => {
        const taken = this.itemManager?.takeAt(fromX, fromY);
        if (!taken) return false;
        // O BAU e o fim de linha: uma esteira que aponta pra ele DEPOSITA em vez de empilhar
        // no chao. E o que faz uma producao rodando sozinha caber em algum lugar — sem isso a
        // linha entope no segundo bloco e a automacao inteira vira enfeite.
        const chest = this.getChestAt(toX, toY);
        if (chest) {
          const stored = chest.store(taken.kind, taken.units);
          if (stored >= taken.units) { this.persistAdventure(); return true; }
          // Coube parte: o resto VOLTA pro tile de origem. Nunca some — a mesma lei do
          // `ChestObject.store`, que devolve o que realmente entrou.
          this.itemManager?.drop(
            taken.kind, fromX, fromY, taken.fire, taken.chargeMs, taken.units - stored,
          );
          if (stored > 0) this.persistAdventure();
          return stored > 0;
        }
        this.itemManager?.drop(taken.kind, toX, toY, taken.fire, taken.chargeMs, taken.units);
        // Fogo VIAJA: um graveto aceso que assentou num tile novo volta a ser um foco de
        // incendio ali, pelo mesmo caminho de sempre (o `placeItemAt` ja faz isso ao pousar).
        if (taken.fire) this.scheduleGroundTorchSpread(toX, toY);
        return true;
      },
      // O BAU que ainda aceita NAO conta como bloqueado — senao a esteira pararia na frente do
      // proprio deposito. Qualquer outra coisa (parede, prop, bicho, item) barra.
      blocked: (x, y) => {
        const chest = this.getChestAt(x, y);
        if (chest) return chest.isFull;
        return this.isTileOccupied(x, y);
      },
      stepped: () => { /* o passo e mudo: uma linha de dez esteiras seria um chocalho */ },
    };
    for (const belt of this.belts) {
      belt.update(delta, port, this.powerAt(belt.worldX, belt.worldY));
    }
  }

  /**
   * O EXTRATOR. A unica maquina que cria materia, e por isso a unica cuja saida passa pelo canal
   * do MINERIO e nao pelo dos itens: o bloco entra no mundo como qualquer bloco que o veio
   * solta. `oreAt` pergunta pela `ironRock` — a rocha que nunca quebra —, e nao por uma rocha
   * qualquer: um extrator que comesse pedra comum consumiria o proprio suporte dele.
   */
  private updateExtractors(delta: number): void {
    if (!this.extractors.length) return;
    const port: ExtractorWorldPort = {
      oreAt: (x, y) => this.getRockAt(x, y)?.ore === true,
      blocked: (x, y) => {
        const chest = this.getChestAt(x, y);
        if (chest) return !chest.accepts('ore');
        // Um bloco de ferro ja caido na saida nao barra: ele ENGROSSA (o mesmo `units` do veio).
        const there = this.itemManager?.kindAt(x, y);
        if (there === 'ore') return false;
        return this.isTileOccupied(x, y);
      },
      deliver: (kind, x, y) => {
        const chest = this.getChestAt(x, y);
        if (chest) {
          const stored = chest.store(kind, 1);
          if (stored > 0) this.persistAdventure();
          return stored > 0;
        }
        // ENGROSSAR em vez de empilhar dois itens no mesmo tile: e o contrato que o veio ja
        // usava (dropOreYield), e mante-lo aqui e o que deixa um extrator sem esteira acumular
        // um monte legivel em vez de travar no primeiro bloco.
        const existing = this.itemManager?.takeAt(x, y);
        const units = existing && existing.kind === kind ? existing.units + 1 : 1;
        if (existing && existing.kind !== kind) {
          this.itemManager?.drop(
            existing.kind, x, y, existing.fire, existing.chargeMs, existing.units,
          );
          return false;
        }
        this.itemManager?.drop(kind, x, y, undefined, undefined, units);
        this.persistAdventure();
        return true;
      },
      bit: (x, y) => {
        // A regra da roda d'agua: fisica sempre, barulho so perto do heroi. Um extrator do outro
        // lado do mapa nao pode martelar no ouvido de ninguem — e a lei do quadro, aplicada a
        // uma maquina em vez de a um bicho.
        const near = Math.hypot(
          x - this.playerWorld.worldX, y - this.playerWorld.worldY,
        ) <= 10;
        if (!near) return;
        // O MESMO som e os MESMOS estilhacos da picareta no veio. Nao e economia: a maquina tem
        // de dizer "isto e minerar", e o jogador ja aprendeu o que minerar soa. Um efeito
        // proprio ensinaria uma segunda coisa para o mesmo acontecimento.
        getSoundManager().playRockSmash();
        this.spawnRockDebris(x, y, 0, 0, false, true);
      },
    };
    for (const extractor of this.extractors) {
      extractor.update(delta, port, this.powerAt(extractor.worldX, extractor.worldY));
    }
  }

  /**
   * Consumidor fail-safe: qualquer corrente que chegue ergue; perder a ultima fecha. Ele e o
   * unico consumidor que NAO degrada com a vazao — um portao nao tem velocidade, so altura —,
   * entao ele le a satisfacao como booleano. Continua puxando 1 watt na conta, de proposito:
   * uma grade aberta pesa na rede, e descobrir isso e parte do jogo.
   */
  private updateElectronicGates(delta: number): void {
    for (const gate of this.electronicGates) {
      const powered = this.powerAt(gate.worldX, gate.worldY) > 0;
      const effectsVisible = Math.hypot(
        gate.worldX - this.playerWorld.worldX,
        gate.worldY - this.playerWorld.worldY,
      ) <= 10;
      gate.update(delta, powered, effectsVisible, this.gateCeiling(gate.variable));
    }
  }

  /**
   * Ate onde uma grade PODE subir: o progresso da entrega do bau ligado ao mesmo circuito, ou 1
   * quando nao ha vinculo (o portao de sempre). Varios baus no mesmo nome contam pelo MENOR — a
   * porta espera a entrega mais atrasada, que e a unica leitura possivel de "duas encomendas".
   *
   * E aqui que a fabrica deixou de ser opcional. Enquanto a trava era energia, o jogo inteiro de
   * producao cabia em "ligue um cabo": uma chave, um giro, fim. Uma trava de QUANTIDADE nao tem
   * atalho — ou a mao trabalha muito, ou a linha trabalha por ela.
   */
  private gateCeiling(variable: string | undefined): number {
    if (!variable) return 1;
    let progress: number | null = null;
    for (const chest of this.chests) {
      if (chest.variable !== variable) continue;
      progress = progress === null ? chest.progress : Math.min(progress, chest.progress);
    }
    // Vinculo sem bau nenhum e um level mal autorado, e a resposta e a MAIS SEGURA: a porta fica
    // fechada. Abrir seria um portao que se destranca por o autor ter esquecido a arca.
    if (progress === null) return 0;
    // A ENTREGA INCOMPLETA NUNCA CHEGA AO LIMIAR DE PASSAGEM. A grade so vira chao em 0.86
    // (PASSABLE_AT), entao mapear o progresso direto abria a porta com 18 de 20 — a fechadura
    // cobrava um numero e aceitava outro. Comprimindo o percurso incompleto em [0, 0.82], a
    // subida continua legivel a cada punhado E o ultimo punhado e o que ABRE: o pagamento fica
    // no gesto que o merece, em vez de acontecer dois minerios antes, sem ninguem perceber.
    return progress >= 1 ? 1 : progress * 0.82;
  }

  /**
   * Recalcula todos os PRODUTORES de circuito juntos. Placas e rodas que compartilham nome sao
   * ligadas em paralelo (OR): qualquer fonte mantem a rede energizada. Fazer a agregacao aqui,
   * em vez de cada objeto escrever direto, impede a ultima fonte do frame de apagar as demais.
   */
  private updateMechanismCircuits(delta: number): void {
    if (!this.pressurePlates.length && !this.waterWheels.length && !this.boilers.length
      && !this.chests.length) return;
    const controlled = new Map<string, boolean>();

    for (const plate of this.pressurePlates) {
      const occupied = (plate.worldX === this.playerWorld.worldX && plate.worldY === this.playerWorld.worldY)
        || this.getWoodenCrateAt(plate.worldX, plate.worldY) !== undefined
        || (this.enemyManager?.getEnemyAt(plate.worldX, plate.worldY) ?? null) !== null;
      plate.setPressed(occupied);
      if (!plate.variable || !this.globalVariables.has(plate.variable)) continue;
      controlled.set(plate.variable, (controlled.get(plate.variable) ?? false) || occupied);
    }

    for (const wheel of this.waterWheels) {
      const flow = this.waterFlowAt(wheel.worldX, wheel.worldY);
      const effectsVisible = Math.hypot(
        wheel.worldX - this.playerWorld.worldX,
        wheel.worldY - this.playerWorld.worldY,
      ) <= 10;
      wheel.update(delta, flow, effectsVisible);
      if (!wheel.variable || !this.globalVariables.has(wheel.variable)) continue;
      controlled.set(
        wheel.variable,
        (controlled.get(wheel.variable) ?? false) || wheel.isGenerating,
      );
    }

    for (const boiler of this.boilers) {
      const heated = this.fireHeatAt(boiler.worldX, boiler.worldY);
      const effectsVisible = Math.hypot(
        boiler.worldX - this.playerWorld.worldX,
        boiler.worldY - this.playerWorld.worldY,
      ) <= 10;
      boiler.update(delta, heated, effectsVisible);
      if (!boiler.variable || !this.globalVariables.has(boiler.variable)) continue;
      controlled.set(
        boiler.variable,
        (controlled.get(boiler.variable) ?? false) || boiler.isGenerating,
      );
    }

    // O BAU COM QUOTA publica no mesmo barramento nomeado que a placa, a roda e a caldeira. O
    // portao le o progresso direto do bau (ele precisa da FRACAO, e uma variavel e booleana), mas
    // publicar aqui mantem a promessa do circuito nomeado: qualquer consumidor de variavel — um
    // braco, amanha uma porta — pode reagir a "a encomenda ficou pronta" sem conhecer o bau.
    for (const chest of this.chests) {
      if (!chest.variable || !chest.quota || !this.globalVariables.has(chest.variable)) continue;
      controlled.set(
        chest.variable,
        (controlled.get(chest.variable) ?? false) || chest.isSatisfied,
      );
    }

    controlled.forEach((value, name) => this.globalVariables.set(name, value));
  }

  /**
   * A forma de cada cabo nasce dos vizinhos — outros cabos e as MAQUINAS da rede (produtores e
   * consumidores), para o fio visivelmente entrar na caldeira e sair no braco. O autor nunca
   * escolhe forma; pintar o caminho e a autoria inteira (a mesma regra que da ao braco o frame
   * da direcao).
   *
   * Ela era fixada UMA vez no boot, com o comentario "cabos e maquinas nao andam". Isso deixou
   * de ser verdade no dia em que a maquina virou item: agora todo `buildMachineAt` e todo
   * `pickUpMachineAt` chamam isto de novo, porque uma caldeira nova ao lado de um cabo tem de
   * ganhar o plugue dela no mesmo frame — senao o fio entra visivelmente em lugar nenhum.
   * Custa uma varredura dos cabos, que e barata e so acontece quando o mundo muda de forma.
   */
  private resolveWireShapes(): void {
    const machine = (x: number, y: number): boolean =>
      this.getBoilerAt(x, y) !== undefined
      || this.getWaterWheelAt(x, y) !== undefined
      || this.getPressurePlateAt(x, y) !== undefined
      || this.getInserterAt(x, y) !== undefined
      || this.getBeltAt(x, y) !== undefined
      || this.getExtractorAt(x, y) !== undefined
      || this.getFurnaceAt(x, y) !== undefined
      || this.getTripHammerAt(x, y) !== undefined
      || this.getElectronicGateAt(x, y) !== undefined;
    // A roda tem a tomada desenhada na BORDA direita do proprio sprite. O cabo vizinho ja chega
    // ate a divisa do tile, portanto o plugue generico (divisa -> centro) atravessaria o rotor.
    // As demais maquinas ainda precisam desse trecho interno para alcancar o pe central.
    // A ESTEIRA fica de fora desta lista pela mesma razao da roda: ela e full bleed, entao o
    // cabo vizinho ja encosta no leito dela — um plugue interno atravessaria as setas.
    const needsCenterPlug = (x: number, y: number): boolean =>
      this.getBoilerAt(x, y) !== undefined
      || this.getPressurePlateAt(x, y) !== undefined
      || this.getInserterAt(x, y) !== undefined
      || this.getExtractorAt(x, y) !== undefined
      || this.getElectronicGateAt(x, y) !== undefined;
    const connects = (x: number, y: number): boolean =>
      this.wireIndex.has(`${x},${y}`) || machine(x, y);
    for (const wire of this.wires) {
      wire.setShape(wireShapeFromMask(
        connects(wire.worldX, wire.worldY - 1),
        connects(wire.worldX + 1, wire.worldY),
        connects(wire.worldX, wire.worldY + 1),
        connects(wire.worldX - 1, wire.worldY),
      ));
      // Vizinho que e MAQUINA ganha um plugue no tile dela — o cabo entra ate o pe em vez de
      // morrer na divisa (ver WireObject.setMachineSides).
      wire.setMachineSides({
        n: needsCenterPlug(wire.worldX, wire.worldY - 1),
        e: needsCenterPlug(wire.worldX + 1, wire.worldY),
        s: needsCenterPlug(wire.worldX, wire.worldY + 1),
        w: needsCenterPlug(wire.worldX - 1, wire.worldY),
      });
    }
  }

  /**
   * A REDE, resolvida inteira uma vez por frame. Roda depois dos produtores e antes dos
   * consumidores no MESMO frame, entao ninguem le um pulso atrasado — a corrente nao tem
   * memoria; o que persiste e o estado fisico das fontes (pressao, giro, carga), nunca o fio.
   *
   * Ela era um flood-fill BOOLEANO, e o que mudou aqui e a peca inteira: agora cada fonte
   * publica watts, cada maquina puxa watts, e o que sai e uma satisfacao de 0 a 1 por
   * consumidor (`solvePowerGrid`, TS puro). Com um booleano, ligar o decimo braco na mesma roda
   * custava o mesmo que ligar o primeiro — nao havia o que projetar, so o que conectar.
   *
   * A geografia nao mudou nada: cabo conduz, maquina se liga ao cabo ortogonal, e um vao de um
   * tile continua sendo um circuito aberto. E isso que mantem o cabo sendo peca de puzzle.
   */
  private updatePowerGrid(delta: number): void {
    if (!this.wires.length && !this.belts.length) {
      if (this.powerSatisfaction.size) this.powerSatisfaction = new Map();
      return;
    }
    const sources: PowerNode[] = [];
    for (const boiler of this.boilers) {
      if (boiler.isGenerating) {
        sources.push({ x: boiler.worldX, y: boiler.worldY, watts: POWER_WATTS.boiler });
      }
    }
    // A roda injeta em QUALQUER cabo ortogonal quando o dinamo gira. Nao depende de `variable`:
    // o fio e a conexao fisica, e a rede leva a energia ate cada consumidor.
    for (const wheel of this.waterWheels) {
      if (wheel.isGenerating) {
        sources.push({ x: wheel.worldX, y: wheel.worldY, watts: POWER_WATTS.waterWheel });
      }
    }
    for (const plate of this.pressurePlates) {
      if (plate.pressed) {
        sources.push({ x: plate.worldX, y: plate.worldY, watts: POWER_WATTS.pressurePlate });
      }
    }
    // A bateria carregada pousada no chao e a FONTE PORTATIL: energia que atravessou o rio na
    // mao do heroi (ou o muro na garra do braco) e agora alimenta a rede encostada nela. Ela
    // entra como fonte de SEGUNDA CLASSE (ver PowerGridInput.batteries), e e isso que preserva
    // a lei que ela sempre teve: drena SO enquanto alimenta. Agora a lei ficou ate mais exata —
    // uma bateria numa rede com geracao de sobra nao gasta carga NENHUMA, em vez de queimar
    // vinte segundos so por estar encostada num fio.
    const batteries: PowerNode[] = (this.itemManager?.chargedBatteries() ?? []).map(
      (b) => ({ x: b.x, y: b.y, watts: POWER_WATTS.battery }),
    );

    // Os consumidores. Um braco SEM cabo nenhum encostado nao entra na conta: ele e um dos dois
    // modos legados (variavel sem fio, ou autoalimentado) que existiam antes da rede, e cobrar
    // watts dele quebraria todo puzzle autorado que nunca teve um fio.
    const sinks: PowerNode[] = [];
    for (const arm of this.inserters) {
      if (this.wireTouching(arm.worldX, arm.worldY)) {
        sinks.push({ x: arm.worldX, y: arm.worldY, watts: POWER_WATTS.inserter });
      }
    }
    for (const belt of this.belts) {
      sinks.push({ x: belt.worldX, y: belt.worldY, watts: POWER_WATTS.belt });
    }
    for (const hammer of this.tripHammers) {
      sinks.push({ x: hammer.worldX, y: hammer.worldY, watts: POWER_WATTS.tripHammer });
    }
    for (const extractor of this.extractors) {
      sinks.push({ x: extractor.worldX, y: extractor.worldY, watts: POWER_WATTS.extractor });
    }
    for (const gate of this.electronicGates) {
      sinks.push({ x: gate.worldX, y: gate.worldY, watts: POWER_WATTS.electronicGate });
    }

    // Os CONDUTORES sao os cabos MAIS as esteiras: uma esteira leva corrente ao longo da propria
    // linha (ver PowerGridInput.conductors). Sem isso, dez esteiras pediriam dez cabos deitados
    // ao lado — o defeito que so apareceu ao montar a primeira linha no jogo de verdade.
    const conductors = new Set(this.wireIndex.keys());
    for (const belt of this.belts) conductors.add(tileKey(belt.worldX, belt.worldY));

    const solution = solvePowerGrid({ conductors, sources, batteries, sinks });
    this.powerSatisfaction = solution.satisfactionAt;

    // O cabo mostra a CARGA, nao o liga/desliga: folgado respira devagar e forte, apertado pulsa
    // rapido, faminto treme (ver WireObject.setLoad). E o gargalo dito com pixel — o jogador ve a
    // conta antes de sentir o resultado dela.
    // `liveWires` fica so com CABO de verdade, mesmo agora que a esteira conduz: quem pergunta
    // por ele e a bateria carregando por pisada ("carregue pisando num CABO vivo") e o baque de
    // encaixe do dock. Pisar numa esteira viva nao pode virar um segundo jeito de carregar
    // bateria que nenhuma legenda do jogo menciona.
    this.liveWires.clear();
    for (const wire of this.wires) {
      const load = solution.wireLoad.get(tileKey(wire.worldX, wire.worldY)) ?? 0;
      if (load > 0) this.liveWires.add(tileKey(wire.worldX, wire.worldY));
      wire.setLoad(load);
    }
    // A carga so escoa na proporcao do que a bateria REALMENTE entregou neste frame.
    for (const [key, draw] of solution.batteryDraw) {
      if (draw <= 0) continue;
      const comma = key.indexOf(',');
      this.itemManager?.drainBatteryAt(
        Number(key.slice(0, comma)), Number(key.slice(comma + 1)), delta * draw,
      );
    }
  }

  /** Quanto da vazao pedida a rede esta bancando neste tile (0..1). Sem cabo: 0. */
  private powerAt(x: number, y: number): number {
    return this.powerSatisfaction.get(tileKey(x, y)) ?? 0;
  }

  /** Ha QUALQUER cabo encostado (vivo ou morto)? — o que converte a maquina ao modo cabeado. */
  private wireTouching(x: number, y: number): boolean {
    for (const [dx, dy] of CARDINAL_DIRS) {
      if (this.wireIndex.has(`${x + dx},${y + dy}`)) return true;
    }
    return false;
  }

  /**
   * Ha CHAMA encostada neste tile? — o espelho de waterFlowAt para a caldeira. Conta tudo que
   * visivelmente arde num vizinho ortogonal: fogueira ACESA (regime permanente — e o balde a
   * desliga), arbusto/mato QUEIMANDO (o pulso de um pavio plantado), lava (geotermica: o poco
   * segue derretido em volta da coroa mesmo com pedra assentada — so a coroa vira chao) e um
   * graveto ACESO pousado no chao (a entrega do braco robotico — fogo cruzando o muro ate a
   * fornalha). Calor nao e espalhamento: nada aqui PEGA fogo por causa da caldeira.
   */
  private fireHeatAt(worldX: number, worldY: number): boolean {
    for (const [dx, dy] of CARDINAL_DIRS) {
      const nx = worldX + dx;
      const ny = worldY + dy;
      if (this.getCampfireAt(nx, ny)?.isLit) return true;
      if (this.getDryBushAt(nx, ny)?.isBurning) return true;
      if (this.getTallGrassAt(nx, ny)?.isBurning) return true;
      if (this.getLavaAt(nx, ny)) return true;
      if (this.itemManager?.hasLitItemAt(nx, ny)) return true;
    }
    return false;
  }

  /** A roda ocupa o proprio canal. Ela so recebe corrente quando a agua sob as pas ainda existe
   * e o rio continua por um vizinho ortogonal ativo; drenar o tile da maquina corta a fonte. */
  private waterFlowAt(worldX: number, worldY: number): WaterFlow | null {
    // A ÁGUA TEM DUAS PROCEDÊNCIAS, e esta função perguntava por UMA (a lei que o `isOpenWaterAt`
    // existe para cobrar). Ela lia só o `water` PROP — o rio que um level autora —, então uma roda
    // plantada num LAGO do overworld, que é tile de terreno, ficava parada para sempre: a peça mais
    // cara de ler do jogo (uma roda d'água imóvel dentro d'água) falhando em silêncio.
    //
    // `isOpenWaterAt` responde pelas duas e já desconta o que deixou de ser água: ponte, vau de
    // pedra e canal DRENADO devolvem `false` porque a `blocking` do prop devolve false neles — a
    // comporta rio acima continua secando a roda, que é o circuito que o level do portão usa.
    if (!this.isOpenWaterAt(worldX, worldY)) return null;
    const dirs: readonly WaterFlow[] = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
    ];
    for (const dir of dirs) {
      if (this.isOpenWaterAt(worldX + dir.dx, worldY + dir.dy)) return dir;
    }
    return null;
  }

  /**
   * A PLANTA CARNÍVORA À ESPREITA — todo inimigo que ENCOSTA (para num dos 4 vizinhos de uma
   * planta pronta) é COMIDO. As recusas são as do resto do jogo: quem ainda NASCE é
   * invulnerável (a lei do nascimento) e um corpo CONGELADO é estátua (uma bocarra não morde
   * através do bloco). No pico do bote a adjacência é RECONFERIDA — um corpo que saiu do tile
   * durante a arma da mandíbula é um bote no ar, e a planta mastiga o vazio mesmo assim: errar
   * também custa a recarga, e é isso que faz o bote ser esquivável. O gole não paga moeda nem
   * deixa ossada (ver EnemyBase.consume); a encenação é gated por distância (a regra da roda
   * d'água: a física roda sempre, o barulho só perto do herói).
   */
  private updateCarnivorousPlants(): void {
    for (const plant of this.carnivorousPlants) {
      if (!plant.readyToEat) continue;
      for (const [dx, dy] of CARDINAL_DIRS) {
        const enemy = this.enemyManager?.getEnemyAt(plant.worldX + dx, plant.worldY + dy);
        if (!enemy || !enemy.isAlive || enemy.isSpawning || enemy.isFrozen) continue;
        const near = Math.hypot(
          plant.worldX - this.playerWorld.worldX, plant.worldY - this.playerWorld.worldY,
        ) <= 10;
        if (near) getSoundManager().playGrassCut(); // as folhas se armando no bote
        let caught = false;
        plant.eat(dx, () => {
          const stillTouching = Math.abs(enemy.worldX - plant.worldX)
            + Math.abs(enemy.worldY - plant.worldY) === 1;
          if (!stillTouching || !enemy.isAlive || enemy.isSpawning || enemy.isFrozen) return;
          caught = true;
          // A mordida PRENDEU: o corpo é arrastado pelo ar até a boca — o mesmo relógio da
          // planta (DRAG_MS), então ele chega no exato instante em que a bocarra fecha.
          enemy.consume(plant.worldX, plant.worldY, CarnivorousPlantObject.DRAG_MS);
          this.spawnSmokePuff(enemy.worldX, enemy.worldY); // as folhas do bote, no tile da presa
        }, () => {
          if (!caught || !near) return;
          getSoundManager().playItemBonk(); // o baque surdo da bocarra fechando sobre o corpo
          this.world3d?.shake(50, 0.03, dx, dy);
        });
        break; // um corpo por vez — a mastigação é a recarga (e a janela de passar por ela)
      }
    }
  }

  // Watch the plots each frame: raise the mound of a sown hole the moment the hero steps off
  // it (a dome must never be born blocking under someone's feet — the dropped-item arming
  // rule), and reopen the hole of a plot whose grown grass was consumed (cut/burnt).
  private updatePlantSpots(): void {
    for (const spot of this.plantSpots) {
      // The dome must never be born blocking on TOP of something. The original rule only
      // checked the hero ("um domo nunca nasce sob os pes") — but an item lying on the sown
      // tile (an arm's deposit, a swap) or an enemy standing there would be engulfed by the
      // rising mound, unrecoverable behind its collision. isTileClearForRegrow is the same
      // gate the regrowing tree and the sprouting grass already wait on: hero, enemy, item
      // and crate all hold the mound down until the tile is truly clear.
      if (spot.isSown && this.isTileClearForRegrow(spot.worldX, spot.worldY)) {
        spot.raiseMound();
        continue;
      }
      const grass = spot.grownGrass;
      if (!grass || grass.blocking || spot.reopenPending) continue;
      spot.reopenPending = true;
      this.time.delayedCall(GameScene.PLANT_REOPEN_MS, () => {
        // Splice in place, never filter-and-reassign: o propRegistry referencia ESTES arrays.
        // A planta consumida pode ser mato OU a carnívora — cada uma mora na sua lista.
        if (grass instanceof TallGrassObject) {
          const idx = this.tallGrasses.indexOf(grass);
          if (idx >= 0) this.tallGrasses.splice(idx, 1);
        } else {
          const idx = this.carnivorousPlants.indexOf(grass);
          if (idx >= 0) this.carnivorousPlants.splice(idx, 1);
        }
        grass.destroy(); // the remains decay away and the dug hole shows again
        spot.reopen();
      });
    }
  }

  private explodeBomb(bomb: ActiveBomb): void {
    const index = this.activeBombs.indexOf(bomb);
    if (index < 0) return;
    this.activeBombs.splice(index, 1);
    // Fire can detonate the payload BEFORE the fuse runs out — kill the blink tween with the
    // sprite, or it keeps calling setTint on a disposed material until the fuse "ends".
    bomb.fuseTween.remove();
    bomb.sprite.destroy();
    if (!this.camera) return;

    getSoundManager().playBombExplode();
    this.cameras.main.shake(160, 0.008);

    const center = this.camera.tileToScreen(bomb.worldX, bomb.worldY, this.tileSize);
    const inBlast = (wx: number, wy: number): boolean =>
      Math.hypot(wx - bomb.worldX, wy - bomb.worldY) <= BOMB_BLAST_RADIUS_TILES;

    // White core flash + expanding ring.
    const flash = this.add
      .circle(center.x, center.y, this.tileSize * 0.8, 0xfff3d0, 0.95)
      .setDepth(SCENE_DEPTHS.upper + 1);
    this.tweens.add({
      targets: flash,
      radius: this.tileSize * BOMB_BLAST_RADIUS_TILES,
      alpha: 0,
      duration: 330,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });

    // Sparks + little fires scattered over the blast area.
    const fireKeys = [ASSET_KEYS.tinyFire0, ASSET_KEYS.tinyFire1, ASSET_KEYS.tinyFire2];
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * this.tileSize * BOMB_BLAST_RADIUS_TILES;
      const isSpark = i % 2 === 0;
      const size = Math.floor(this.tileSize * (isSpark ? 0.3 : 0.42));
      const puff = this.add
        .sprite(center.x + Math.cos(ang) * dist, center.y + Math.sin(ang) * dist,
          isSpark ? ASSET_KEYS.bombItem : fireKeys[i % fireKeys.length],
          isSpark ? BOMB_FRAMES.spark : 0)
        .setDisplaySize(size, size)
        .setDepth(SCENE_DEPTHS.upper + 1);
      this.tweens.add({
        targets: puff,
        alpha: 0,
        y: puff.y - this.tileSize * 0.5,
        duration: 340 + i * 45,
        ease: 'Power2.easeOut',
        onComplete: () => puff.destroy(),
      });
    }

    // Kill every enemy caught in the blast — e a explosao JOGA os corpos para fora dela. Uma bomba
    // que deixasse tres caveiras se desmanchando em pe, cada uma no seu tile, seria a unica coisa
    // do jogo com raio de acao e sem sopro. Ver EnemyBase.deathFling: o mesmo arremesso que o golpe
    // que mata passou a dar, so que a direcao aqui e a do centro da explosao para o corpo.
    //
    // A EXPLOSAO PERGUNTA ANTES DE FERIR, como todo caminho de dano deste jogo deve. O
    // `EnemyBase.takeDamage` ja escrevia a regra e a bomba era a unica que nao a seguia: "quem
    // chama SEMPRE pergunta antes (`isHurtInvulnerable`) para poder responder na tela — este guarda
    // e a rede, nao a porta". Sem a pergunta, um corpo que acabou de levar uma espadada ATRAVESSAVA
    // a explosao inteira e nada aparecia: nem anel, nem som, nem dano. O jogador via a bomba
    // estourar em cima da caveira e a caveira seguir andando, sem uma unica pista do porque.
    //
    // A recusa continua sendo recusa (os i-frames valem para TODA fonte de dano, ou o combate volta
    // a ser uma serra) — o que muda e que agora ela tem desenho, que e o anel frio de sempre.
    let blastKilled = false;
    let blastRefused = false;
    for (const enemy of this.enemyManager?.getAliveEnemies() ?? []) {
      if (!inBlast(enemy.worldX, enemy.worldY)) continue;
      if (enemy.isHurtInvulnerable) {
        this.spawnDeflect(enemy.worldX, enemy.worldY);
        blastRefused = true;
        continue;
      }
      enemy.takeDamage(999);
      if (!enemy.isAlive) {
        // A VOZ DA EXPLOSAO SAI UMA VEZ, como a do arco (ver sweepArc): uma bomba no meio de uma
        // matilha disparava um som de morte por corpo, todos no mesmo frame.
        if (!blastKilled) getSoundManager().playEnemyDeath(enemy.kind);
        blastKilled = true;
        enemy.deathFling(enemy.worldX - bomb.worldX, enemy.worldY - bomb.worldY);
      }
    }
    // So se NADA morreu: com um corpo caindo, o som da morte ja disse que a explosao encontrou
    // gente, e o raspao por cima dele seria uma segunda voz para o mesmo estouro.
    if (blastRefused && !blastKilled) getSoundManager().playBladeGlance();

    // Set fire to everything flammable in the area — and each of those then spreads on its
    // own, so the bomb is a way to start a fire somewhere the hero cannot stand.
    for (const bushObj of this.dryBushes) {
      if (inBlast(bushObj.worldX, bushObj.worldY) && bushObj.ignite()) {
        this.spawnFireHitEffect(bushObj.worldX, bushObj.worldY);
        this.scheduleFireSpread(bushObj.worldX, bushObj.worldY);
      }
    }
    for (const grassObj of this.tallGrasses) {
      if (inBlast(grassObj.worldX, grassObj.worldY) && grassObj.ignite()) {
        this.spawnFireHitEffect(grassObj.worldX, grassObj.worldY);
        this.scheduleFireSpread(grassObj.worldX, grassObj.worldY);
      }
    }

    // The blast shatters rock in range and throws the pieces as usable STONE: the bomb PRODUCES
    // matter, it does not only clear a path. One charge can open a wall AND hand you the fords
    // to cross the river beyond it. (Two blows finish a plain rock: intact -> cracked -> broken.
    // The iron VEIN survives any blast — the two blows only advance its 3-hit cycle, so a bomb
    // can milk it, never open it.)
    let brokeRock = false;
    for (const rockObj of this.rocks) {
      if (!inBlast(rockObj.worldX, rockObj.worldY) || !rockObj.blocking) continue;
      const blows = [rockObj.smash(0, 0), rockObj.smash(0, 0)];
      if (!rockObj.blocking) {
        this.spawnRockDebris(rockObj.worldX, rockObj.worldY, 0, -1, true, rockObj.ore);
        this.dropRockSpoil(rockObj);
        brokeRock = true;
      } else if (blows.includes('yielded')) {
        this.spawnRockDebris(rockObj.worldX, rockObj.worldY, 0, -1, true, true);
        this.spawnOreLoot(rockObj);
        brokeRock = true;
      }
    }
    if (brokeRock) getSoundManager().playRockSmash();
  }

  // ── Fire spread ────────────────────────────────────────────────────────────
  // Fire is the one system in this world the player STEERS instead of unlocks. Everything
  // else here is a lock and a key — bump the rock with the pickaxe, the tree with the axe —
  // a 1:1 table with exactly one right answer. Fire is
  // different: it travels on its own, through whatever will carry it, and it does not care
  // what you still needed. So the question stops being "which item?" and becomes "what will
  // this reach, and what do I have to cut away first so it doesn't?".
  //
  // The fuel graph is: tall grass, dry bushes, and BUILT BRIDGES (they are wood — see
  // WaterObject.burn). Stone, water, lava and bare ground are firebreaks; the scythe and the
  // axe MAKE firebreaks, which is what finally gives them a use beyond opening their own tile.
  //
  // A DEAD CAMPFIRE catches from an adjacent flame — that is the whole point. It means a fire
  // can be lit WITHOUT the hero ever standing next to it: lay a path of fuel and let the fire
  // walk there. But a LIT campfire never spreads outward: it is a sink, not a source.
  // Otherwise every hearth in the world would set its own meadow alight the moment it was lit.
  private scheduleFireSpread(wx: number, wy: number): void {
    this.time.delayedCall(FIRE_SPREAD_MS, () => {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        this.igniteFlammableAt(wx + dx, wy + dy);
      }
    });
  }

  /**
   * A versao CONDICIONAL do scheduleFireSpread, para um graveto ACESO pousado no chao. Um
   * arbusto que agendou espalhamento ainda esta queimando quando o fusivel de FIRE_SPREAD_MS
   * vence — mas um ITEM o braco robotico pode ter CARREGADO EMBORA nesse meio-tempo (o ciclo
   * de pegar leva ~0.5s, menos que os 850ms do fusivel), e fogo nao nasce de um tile vazio.
   * O teste no DISPARO (hasLitItemAt) tambem cobre o caso-borda do deposito com combustivel
   * exatamente zero: pousa como madeira apagada e nao arma espalhamento nenhum.
   */
  private scheduleGroundTorchSpread(wx: number, wy: number): void {
    this.time.delayedCall(FIRE_SPREAD_MS, () => {
      if (!this.itemManager?.hasLitItemAt(wx, wy)) return;
      for (const [dx, dy] of CARDINAL_DIRS) {
        this.igniteFlammableAt(wx + dx, wy + dy);
      }
    });
  }

  /**
   * Set alight whatever burns on this tile, and chain the spread onward from it. Each object's
   * own ignite() refuses if it is already burning or spent, which is what terminates the chain.
   * Returns true if something caught here.
   */
  private igniteFlammableAt(wx: number, wy: number): boolean {
    // FOGO DERRETE GELO ANTES DE ACENDER QUALQUER COISA: um tile congelado gasta o pulso de
    // fogo no degelo (vapor, nada pega). Vale para mato, ponte E corpo congelado — uma pergunta
    // só, espacial, como todo gate do gelo (ver FreezeManager.meltAt).
    if (this.freezeManager?.meltAt(wx, wy)) return false;
    // FOGO QUE CHEGA NUM TILE COME QUEM ESTIVER PARADO NELE: o corpo é combustível como o mato
    // (a tocha viva — ver EnemyBase.igniteBody). Fora do retorno de propósito: o corpo NÃO faz
    // o tile arder (ele corre dali, e fogo não nasce de tile vazio — a lição do graveto que o
    // braço carrega embora), então a cadeia de espalhamento segue como se ele não estivesse lá.
    const victim = this.enemyManager?.getEnemyAt(wx, wy);
    if (victim) this.igniteEnemy(victim);

    const bush = this.getDryBushAt(wx, wy);
    if (bush?.ignite()) {
      this.spawnFireHitEffect(wx, wy);
      this.scheduleFireSpread(wx, wy);
      return true;
    }

    const grass = this.getTallGrassAt(wx, wy);
    if (grass?.ignite()) {
      this.spawnFireHitEffect(wx, wy);
      this.scheduleFireSpread(wx, wy);
      return true;
    }

    // A planta carnívora é PLANTA: combustível como o mato — o fogo é uma das três respostas
    // do jogador a uma que ficou no lugar errado (as outras: a foice, e simplesmente contorná-la).
    const carnivore = this.getCarnivorousPlantAt(wx, wy);
    if (carnivore?.ignite()) {
      this.spawnFireHitEffect(wx, wy);
      this.scheduleFireSpread(wx, wy);
      return true;
    }

    // A placed bomb is a PAYLOAD on the fuse: fire reaching it sets it off. So you can blow up
    // something you could never stand next to — lay a fuse to the bomb and let the fire arrive,
    // the same idea as lighting a campfire the hero cannot reach.
    const bomb = this.activeBombs.find((b) => b.worldX === wx && b.worldY === wy);
    if (bomb) {
      this.explodeBomb(bomb);
      return true;
    }

    // A bridge is wood: it carries the flame across the water and is eaten doing it.
    const water = this.getWaterAt(wx, wy);
    if (water?.burn()) {
      this.spawnFireHitEffect(wx, wy);
      this.scheduleFireSpread(wx, wy);
      return true;
    }

    // The destination. Fire stops here — a lit hearth does not go on to burn the world down.
    const campfire = this.getCampfireAt(wx, wy);
    if (campfire && !campfire.isLit) {
      this.lightCampfire(campfire, wx, wy);
      return true;
    }

    return false;
  }

  /**
   * O FOGO ALCANÇOU UM CORPO (a tocha viva). O estado é do corpo (igniteBody recusa morto,
   * nascendo, já ardendo e quem vive na água); daqui sai só a ENCENAÇÃO da pegada — e ela tem
   * o gate do quadro, porque um corpo acendendo fora da tela não pode falar (a lei do framed).
   */
  private igniteEnemy(enemy: EnemyBase): void {
    if (!enemy.igniteBody()) return;
    if (this.isTileFramed(enemy.worldX, enemy.worldY)) {
      this.spawnFireHitEffect(enemy.worldX, enemy.worldY);
    }
  }

  /**
   * Este tile É fogo agora? — a pergunta do encontrão (ver o `shove` no strike). Aqui só o que
   * visivelmente arde no próprio tile: fogueira acesa, arbusto/mato em chamas, lava e um graveto
   * aceso no chão.
   *
   * Não confundir com os dois raios da fogueira, que são outra coisa: a LUZ repele
   * (isTileLitByCampfire) e o CALOR logo fora dela assa quem insiste em ficar
   * (isTileScorchedByCampfire) — mas nenhum dos dois ACENDE um corpo, e é isso que impede uma
   * fogueira de fabricar incendiários que saem por aí acendendo o mato e as fogueiras mortas.
   */
  private fireOnTile(wx: number, wy: number): boolean {
    if (this.getCampfireAt(wx, wy)?.isLit) return true;
    if (this.getDryBushAt(wx, wy)?.isBurning) return true;
    if (this.getTallGrassAt(wx, wy)?.isBurning) return true;
    if (this.getLavaAt(wx, wy)) return true;
    return this.itemManager?.hasLitItemAt(wx, wy) ?? false;
  }

  // ── O congelamento (ver FreezeManager, onde mora a lei) ─────────────────────

  /** O herói está congelado agora? — o gate que os botões e o update leem. */
  private get isHeroFrozen(): boolean {
    return this.freezeManager?.isFrozen('hero') ?? false;
  }

  /**
   * A bola de gelo alcançou um CORPO. Fogo e gelo se anulam: num corpo em chamas ela APAGA o
   * fogo (o corpo sobrevive à tocha viva — o zora salvando a matilha é jogada dele) em vez de
   * congelar. A estátua continua ferível e empurrável — o gelo trava, nunca protege.
   */
  private freezeEnemy(enemy: EnemyBase): void {
    if (!enemy.isAlive || enemy.isSpawning) return;
    if (enemy.isBurning) {
      if (enemy.extinguish() && this.isTileFramed(enemy.worldX, enemy.worldY)) {
        getSoundManager().playFireHit(); // o chiado de vapor que este jogo já tem
      }
      return;
    }
    this.freezeManager?.freeze({
      id: enemy,
      x: enemy.visualX,
      y: enemy.visualY,
      size: 0.8,
      elevation: 0.34,
      follow: () => (enemy.isAlive ? { x: enemy.visualX, y: enemy.visualY } : null),
      stillValid: () => enemy.isAlive,
      onFreeze: () => enemy.enterFreeze(),
      onThaw: () => enemy.exitFreeze(),
    });
  }

  /**
   * O frio fechou sobre o HERÓI: pés na raiz, botões na cadência (adiados, nunca descartados — a
   * lei do buffer) e o corpo frio. Sem dano nenhum: a bola do zora trava, e o perigo é o resto
   * da matilha chegar enquanto você é uma estátua.
   */
  private freezeHero(): void {
    if (this.isDead || this.heroFreezeImmuneMs > 0) return;
    this.freezeManager?.freeze({
      id: 'hero',
      x: this.playerWorld.worldX,
      y: this.playerWorld.worldY,
      size: 0.82,
      elevation: 0.36,
      follow: () => ({ x: this.playerWorld.worldX, y: this.playerWorld.worldY }),
      stillValid: () => !this.isDead,
      onFreeze: () => {
        // Virar estátua fecha a bolsa pela mesma razão que apanhar fecha (`handleEnemyAttackPlayer`):
        // ela é a única tela que fica aberta com o mundo correndo, e o mundo acabou de responder.
        this.quickBag?.close();
        this.stopBreathing();
        this.movementController?.root(FREEZE_MS);
        this.playerStaggerMs = Math.max(this.playerStaggerMs, FREEZE_MS);
        this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
        this.hero.tint = 0xaee0ff;
      },
      onThaw: () => {
        // A imunidade pós-degelo é a contra-jogada do stun-lock (ver heroFreezeImmuneMs).
        this.heroFreezeImmuneMs = HERO_FREEZE_IMMUNE_MS;
        if (!this.isDead) this.hero.tint = null;
      },
    });
  }

  /**
   * QUALQUER COISA PODE SER CONGELADA — e este método é a lista inteira do que "qualquer coisa"
   * significa, em ordem de precedência: corpo, herói, NPC, e então o que estiver plantado no
   * tile (caixote, fogueira morta, arbusto, mato, pedra, tronco, árvore — prop ou tile —, item
   * no chão). Fogueira ACESA recusa com vapor: fogo derrete gelo antes de o gelo existir.
   * O que "travado" significa não mora aqui: mora nos gates (`frozenAt`) de cada interação.
   */
  private freezeAtTile(wx: number, wy: number): boolean {
    const enemy = this.enemyManager?.getEnemyAt(wx, wy);
    if (enemy) {
      this.freezeEnemy(enemy);
      return true;
    }
    if (wx === this.playerWorld.worldX && wy === this.playerWorld.worldY) {
      this.freezeHero();
      return true;
    }
    const campfire = this.getCampfireAt(wx, wy);
    if (campfire?.isLit) {
      // O fogo vence antes de o gelo nascer: só o vapor conta o que aconteceu.
      this.freezeManager?.steamAt(wx, wy);
      return false;
    }
    const tall = this.getDryTreeAt(wx, wy) !== undefined || this.treeTileFrameAt(wx, wy) !== null;
    const freezable = tall
      || campfire !== undefined
      || this.getWoodenCrateAt(wx, wy) !== undefined
      || this.getDryBushAt(wx, wy) !== undefined
      || this.getDryShrubAt(wx, wy) !== undefined
      || this.getTallGrassAt(wx, wy) !== undefined
      || (this.getRockAt(wx, wy)?.blocking ?? false)
      || this.npcManager?.hasNpcAt(wx, wy) === true
      || (this.itemManager?.hasItemAt(wx, wy) ?? false);
    if (!freezable) return false;
    return this.freezeManager?.freeze({
      id: `tile:${wx},${wy}`,
      x: wx,
      y: wy,
      // Árvore e NPC são corpos altos: o bloco sobe com eles (sem nunca vazar do tile).
      size: tall ? 1 : this.npcManager?.hasNpcAt(wx, wy) ? 0.85 : 0.72,
      elevation: tall ? 0.52 : 0.3,
    }) ?? false;
  }

  private spawnFireHitEffect(wx: number, wy: number): void {
    const w3 = this.world3d;
    if (!w3) return;
    getSoundManager().playFireHit();

    for (let i = 0; i < 3; i++) {
      const f = w3
        .addBillboard(TORCH_FLAME_KEYS[i % TORCH_FLAME_KEYS.length], 0, {
          ...FX_BILLBOARD, emissive: true, alphaTest: 0.05, emissiveBoost: 3,
        })
        .setPosition(wx + (Math.random() - 0.5) * 0.56, wy + (Math.random() - 0.5) * 0.3)
        .setElevation(FX_BODY_ELEV)
        .setDisplaySize(0.38, 0.38);

      this.tweens.add({
        targets: f,
        alpha: 0,
        elevation: FX_BODY_ELEV + 0.55,
        duration: 320 + i * 90,
        ease: 'Power2.easeOut',
        onComplete: () => { f.destroy(); },
      });
    }
  }

  private openNpcDialog(
    kind: import('@/game/world/ScreenContent').NpcKind,
    npcWorld?: { worldX: number; worldY: number },
    scriptId?: string,
  ): void {
    if (this.dialogOpen) return;
    const script = getDialog(kind, scriptId);
    if (!script) return;
    if (npcWorld) {
      const key = this.dialogKeyFor(kind, npcWorld.worldX, npcWorld.worldY, scriptId);
      if (key) {
        this.seenDialogKeys.add(key);
        this.persistAdventure(); // o "!" apagado fica apagado
      }
    }
    // An NPC beside a still-dead campfire is too scared to talk: swap in the locked lines.
    const shown = this.gateDialog(script, npcWorld);
    this.openDialogScript(shown, npcWorld, getDialogVoice(kind, scriptId));
  }

  // Identity of the dialog an NPC would speak *right now*: the wizard's current story beat,
  // or (for everyone else) the base lines vs the campfire-gated "locked" lines. Used both to
  // mark a dialog as heard and to decide whether the "!" new-dialog marker shows.
  private dialogKeyFor(
    kind: import('@/game/world/ScreenContent').NpcKind,
    wx: number,
    wy: number,
    scriptId?: string,
  ): string | null {
    if (kind === 'wizard') return `wizard:${this.wizardStoryState()}`;
    if (!getDialog(kind, scriptId)) return null;
    // A chave é do ROTEIRO, não da espécie: três gatos com três aulas são três "!" a apagar, e
    // com a chave por espécie ouvir um deles apagaria a marca dos outros dois.
    const id = scriptId ?? kind;
    const cf = this.nearestCampfireWithin(wx, wy, NPC_GATE_RADIUS_TILES);
    return cf && !cf.isLit ? `${id}:locked` : `${id}:base`;
  }

  // The wizard tells the story of Zero, always opening (on the very first talk) with the intro
  // beat — its narrator line MUST be the first thing he shows. Later visits give "protect the
  // flame"; the second lit fire unlocks the closing prophecy, which ends the intro.
  private openWizardDialog(npcWorld: { worldX: number; worldY: number }): void {
    if (this.dialogOpen) return;
    const base = getDialog('wizard');
    if (!base) return;
    const state = this.wizardStoryState();
    this.seenDialogKeys.add(`wizard:${state}`);
    if (state === 'intro') this.wizardIntroSeen = true;
    this.persistAdventure(); // o beat ouvido do mago e historia, e historia nao se repete
    const lines = tLines(`wizard.${state}`);
    this.openDialogScript(
      { ...base, lines },
      npcWorld,
      getDialogVoice('wizard'),
      state === 'prophecy' ? () => this.playIntroEnding() : undefined,
    );
  }

  private wizardStoryState(): 'intro' | 'protect' | 'prophecy' {
    if (!this.wizardIntroSeen) return 'intro';       // 1st talk: intro
    if (this.litFireCount >= 1) return 'prophecy';   // once a fire is lit he jumps to the finale
    return 'protect';                                // optional 2nd talk before any fire is lit
  }

  // Open the conversation panel for a ready-made script (pan the camera, dim the music), running
  // `onClosed` once the dialog is dismissed.
  private openDialogScript(
    script: DialogScript,
    npcWorld: { worldX: number; worldY: number } | undefined,
    voice: DialogVoice | undefined,
    onClosed?: () => void,
  ): void {
    this.dialogOpen = true;
    this.stopBreathing();
    // O Z que ABRIU a conversa pode estar sendo segurado: sem isto o keyup se perde com o
    // painel aberto e a lâmina rodopiante termina de carregar sozinha — a mesma rede da
    // subtela (ver resetChargeAndBuffers no openSubScreen).
    this.resetChargeAndBuffers();
    // Pan so the hero + NPC sit centered in the left half; the panel fills the right half.
    this.dialogNpcWorld = npcWorld;
    this.startDialogCameraShift(npcWorld);
    // Focus on the conversation: fade the music down while the NPC talks.
    getSoundManager().fadeMusicOut();
    this.dialogOverlay = new DialogOverlay(this, script, () => {
      this.dialogOverlay?.destroy();
      this.dialogOverlay = undefined;
      this.dialogOpen = false;
      this.endDialogCameraShift();
      getSoundManager().fadeMusicIn();
      onClosed?.();
    }, voice, this.tradePortFor(script.trade, npcWorld));
  }

  /**
   * A mão do BALCÃO no mundo: o overlay pergunta quanto o herói tem e executa a venda. O
   * pagamento NÃO entra na carteira por decreto — o NPC DERRUBA as moedas em volta de si,
   * como um inimigo derrubaria, e o jogador ainda tem que passar por elas (pedido do
   * usuário: dinheiro ganho é dinheiro no MUNDO). A mochila esvazia na hora; a carteira só
   * muda quando cada moeda é apanhada, pelo caminho único de toda moeda.
   */
  private tradePortFor(
    trade: DialogTrade | undefined,
    npcWorld?: { worldX: number; worldY: number },
  ): DialogTradePort | undefined {
    if (!trade) return undefined;
    const kind = trade.item as HeldItemKind;
    return {
      count: () => this.inventory.count(kind),
      sell: (units: number) => {
        const n = Math.min(Math.max(0, Math.floor(units)), this.inventory.count(kind));
        if (n <= 0) return 0;
        this.inventory.remove(kind, n);
        this.updateBackItem(); // o item vendido podia ser o da mão — as costas ficam honestas
        const coins = n * trade.coinsPerUnit;
        const at = npcWorld ?? { worldX: this.playerWorld.worldX, worldY: this.playerWorld.worldY };
        if (this.chunkManager) this.coinManager?.spawnCoins(at.worldX, at.worldY, this.chunkManager, coins);
        getSoundManager().playCoinPickup(); // o tilintar da mão fechando o negócio
        this.persistAdventure(); // a mochila mudou já; as moedas entram uma a uma ao pegar
        return coins;
      },
    };
  }

  // Gate an NPC's dialog behind their campfire: if a dead fire sits within range, show the
  // scared "locked" lines (keeping the NPC's portrait/colour/voice) instead of the real ones.
  private gateDialog(script: DialogScript, npcWorld?: { worldX: number; worldY: number }): DialogScript {
    if (!npcWorld) return script;
    const cf = this.nearestCampfireWithin(npcWorld.worldX, npcWorld.worldY, NPC_GATE_RADIUS_TILES);
    // A variante travada perde o BALCÃO junto com as falas: um NPC com medo não vende nada.
    if (cf && !cf.isLit) return { ...script, lines: tLines('lockedLines'), trade: undefined };
    return script;
  }

  private nearestCampfireWithin(wx: number, wy: number, radius: number): CampfireObject | undefined {
    let best: CampfireObject | undefined;
    let bestD = radius;
    for (const cf of this.campfires) {
      const d = Math.hypot(cf.worldX - wx, cf.worldY - wy);
      if (d <= bestD) { bestD = d; best = cf; }
    }
    return best;
  }

  // ── Dialog camera pan ──────────────────────────────────────────────────────
  // Base screen anchor during normal play: hero centered horizontally, mid play-area.
  private baseScreenCenter(): { x: number; y: number } {
    const { width, height } = this.scale;
    return {
      x: Math.floor(width / 2),
      y: Math.floor(height / 2),
    };
  }

  // Screen anchor while a dialog is open: put the hero↔NPC midpoint at the center of the
  // left half (the dialog panel covers the right half). camX stays on the hero, so shifting
  // only screenCenterX/Y keeps the hero's sprite pinned correctly to the ground it stands on.
  private dialogScreenCenter(npcWorld?: { worldX: number; worldY: number }): { x: number; y: number } {
    const base = this.baseScreenCenter();
    // The panel covers the right side (capped width); centre the hero+NPC in the game area left of it.
    const panelW = Math.min(this.scale.width * DIALOG_PANEL_FRACTION, DIALOG_PANEL_MAX_WIDTH);
    const leftHalfCenterX = Math.floor((this.scale.width - panelW) / 2);
    if (!npcWorld) return { x: leftHalfCenterX, y: base.y };
    const dx = npcWorld.worldX - this.playerWorld.worldX;
    const dy = npcWorld.worldY - this.playerWorld.worldY;
    return {
      x: Math.round(leftHalfCenterX - (dx * this.tileSize) / 2),
      y: Math.round(base.y - (dy * this.tileSize) / 2),
    };
  }

  private startDialogCameraShift(npcWorld?: { worldX: number; worldY: number }): void {
    const target = this.dialogScreenCenter(npcWorld);
    this.animateScreenCenter(target.x, target.y);
  }

  private endDialogCameraShift(): void {
    this.dialogNpcWorld = undefined;
    const base = this.baseScreenCenter();
    this.animateScreenCenter(base.x, base.y);
  }

  private animateScreenCenter(tx: number, ty: number): void {
    if (!this.camera) return;
    this.camShiftTween?.stop();
    this.camShifting = true;
    const state = { x: this.camera.screenCenterX, y: this.camera.screenCenterY };
    this.camShiftTween = this.tweens.add({
      targets: state,
      x: tx,
      y: ty,
      duration: 300,
      ease: 'Cubic.easeInOut',
      onUpdate: () => {
        if (!this.camera) return;
        this.camera.screenCenterX = Math.round(state.x);
        this.camera.screenCenterY = Math.round(state.y);
        this.reprojectStatic();
      },
      onComplete: () => {
        this.camShiftTween = undefined;
        this.camShifting = false;
        if (!this.camera) return;
        this.camera.screenCenterX = Math.round(tx);
        this.camera.screenCenterY = Math.round(ty);
        this.reprojectStatic();
      },
    });
  }

  // Re-project the frozen world to the current camera anchor without advancing any gameplay.
  // Used to redraw every frame of the dialog camera pan (update() is short-circuited then;
  // render3D on POST_UPDATE keeps the 3D camera itself panning).
  private reprojectStatic(): void {
    if (!this.camera || !this.chunkManager) return;
    this.hero.x = this.camera.screenCenterX;
    this.hero.y = this.camera.screenCenterY;
    this.positionBackItem();
    this.updateFootprints();
    this.enemyManager?.render(this.tileSize, this.camera);
    this.coinManager?.render(this.tileSize, this.camera);
    this.heartPickupManager?.render(this.tileSize, this.camera);
    this.itemManager?.render(this.tileSize, this.camera);
    this.npcManager?.render(this.tileSize, this.camera);
    this.renderProps();
  }

  // Per-frame prop work. Props are static in world space (the 3D camera does the moving), so
  // only the two with real per-frame logic appear here — the old per-type render() no-ops are
  // gone with the 2D projection they used to serve.
  private renderProps(): void {
    if (!this.camera) return;
    for (const w of this.waterTiles) {
      // Show the "build a bridge here" indicator on any un-bridged river tile the hero stands
      // orthogonally next to — the exact tile a graveto would go into.
      const dist = Math.abs(w.worldX - this.playerWorld.worldX) + Math.abs(w.worldY - this.playerWorld.worldY);
      w.setBuildHint(dist === 1 && !this.dialogOpen && !this.isDead);
      w.render(this.tileSize, this.camera);
    }
    // O keycap da marca de posicionamento e overlay 2D projetado, como o "!" do NPC.
    if (this.camera) this.placementHints?.render(this.tileSize, this.camera, this.time.now);
    // O aviso de apanhar segue o corpo DESENHADO, e nao o tile logico: a logica salta para o
    // destino no primeiro frame do passo, e o nome sairia um tile na frente do heroi a cada passo.
    if (this.camera) {
      const at = this.movementController?.visualWorld(this.playerWorld.worldX, this.playerWorld.worldY)
        ?? { x: this.playerWorld.worldX, y: this.playerWorld.worldY };
      this.pickupPrompt?.render(this.tileSize, this.camera, this.time.now, at);
      // O balao de pensamento monta no MESMO ponto do aviso de apanhar, e pelo mesmo motivo: a
      // ancora e o corpo DESENHADO. O relogio dele corre no update (ver HeroThought.tick).
      this.heroThought?.render(this.tileSize, this.camera, this.time.now, at);
    }
    // O MESMO keycap sobre a BANCADA que o herói está encarando: sem ele o catálogo da encomenda
    // seria um recurso invisível, que é justamente o defeito que ele veio consertar. A condição é
    // a precondição dos dois botões — adjacente E de frente —, lida do mesmo `facingTile` que o A
    // vai usar, para o anúncio nunca prometer um gesto que o botão recusaria.
    if (this.toolboxes.length || this.furnaces.length || this.altars.length) {
      const front = this.facingTile();
      const canTalk = !this.dialogOpen && !this.isDead && !this.orderOverlay
        && this.quickBag?.isOpen !== true;
      for (const box of this.toolboxes) {
        const facing = canTalk && box.worldX === front.x && box.worldY === front.y;
        box.renderHint(this.tileSize, this.camera, facing, this.time.now);
      }
      // O FORNO usa o MESMO anúncio: as duas máquinas que respondem ao A vestem o mesmo keycap,
      // e uma terceira que respondesse teria de vestir o mesmo também.
      for (const furnace of this.furnaces) {
        const facing = canTalk && furnace.worldX === front.x && furnace.worldY === front.y;
        furnace.renderHint(this.tileSize, this.camera, facing, this.time.now);
      }
      // ...e o ALTAR é a terceira. Com uma diferença: ele só anuncia o Z quando há o que PÔR nele
      // (laje vazia + item selecionado). Cheia, o Z volta a ser a espada — e um keycap prometendo
      // "põe" em cima de uma laje ocupada seria uma legenda mentindo sobre o próprio botão.
      for (const altar of this.altars) {
        const facing = canTalk && altar.worldX === front.x && altar.worldY === front.y
          && altar.carrying === null && this.heldItem !== 'none';
        altar.renderHint(this.tileSize, this.camera, facing, this.time.now);
      }
    }
    // Bombs are world-anchored billboards; nothing to reproject here.
  }

  /**
   * Moonflowers: shut while a flame burns within MOONFLOWER_LIGHT_TILES, open (walkable) in the
   * dark. The proximity test lives here because the fires do; the flower owns look, collision
   * and juice.
   *
   * Tres chamas contam, e as tres sao a mesma coisa vista em tres lugares: a fogueira ACESA, a
   * TOCHA na mao do heroi e o graveto aceso POUSADO no chao (a tocha que ele largou, ou a que o
   * braco entregou). A do meio e a unica fonte que ANDA no jogo inteiro, e e o que muda a peca:
   * ate agora a flor so respondia ao mapa, e agora ela responde ao JOGADOR — chegar perto de
   * uma ponte de petalas com fogo na mao a fecha antes de o heroi pisar nela, e atravessar passa
   * a custar deixar a luz pra tras. A lava fica de fora de proposito (ver MOONFLOWER_LIGHT_TILES).
   *
   * A tocha e a lista de chamas no chao sao lidas FORA do laco: elas nao dependem de qual flor
   * esta sendo perguntada, e varrer os itens do mundo uma vez por flor por frame seria pagar o
   * mesmo varrimento tantas vezes quantas flores o mapa tiver.
   *
   * This runs in update() and NOT in renderProps(), which reprojectStatic() also calls: a dialog
   * pan must not advance the bloom, and the animation needs a delta that a reprojection has no
   * business having.
   */
  private updateMoonflowers(delta: number): void {
    if (this.moonflowers.length === 0) return;
    const torch = this.isTorchLit ? this.playerWorld : null;
    const laid = this.itemManager?.litItems() ?? [];
    for (const mf of this.moonflowers) {
      const near = (x: number, y: number): boolean => Math.hypot(x - mf.worldX, y - mf.worldY)
        <= MOONFLOWER_LIGHT_TILES;
      const nearFire = this.campfires.some((cf) => cf.isLit && near(cf.worldX, cf.worldY))
        || (torch !== null && near(torch.worldX, torch.worldY))
        || laid.some((f) => near(f.x, f.y));
      mf.setNearFire(nearFire);
      // A regra da roda d'agua: efeito e audio so existem perto do heroi.
      const effectsVisible = Math.hypot(
        mf.worldX - this.playerWorld.worldX,
        mf.worldY - this.playerWorld.worldY,
      ) <= 10;
      mf.update(delta, effectsVisible);
    }
  }

  /**
   * A carteira que a loja gasta.
   *
   * Na aventura e a bolsa da run — nao ha outra. No explorador sao as moedas do BANCO, e nunca
   * as que o heroi carrega: gastar em campo o que ainda esta em risco esvaziaria a aposta pelo
   * outro lado (bastaria comprar tudo antes de morrer). A fogueira do acampamento so vende o
   * que ja foi trazido para casa.
   */
  /**
   * O heroi pisou num item do chao. Ele GUARDA — nao troca mais.
   *
   * A troca ("o que estava na mao cai no tile do novo") era a lei de uma mao so, e caiu com o
   * walk-only: com a mochila, pegar nunca mais custa largar. O item novo entra e passa a ser o
   * selecionado, porque apanhar uma coisa e sempre a intencao de usa-la.
   *
   * Primeira vez de um tipo → a cerimonia do ItemGet; da segunda em diante, so o chime.
   */
  private onCollectItem(item: CollectedItem): void {
    // O pacote entra inteiro (as sementes valem SEEDS_PER_PACK recém-colhidas; um punhado
    // pousado volta com a contagem que tinha). A bolsa e a subtela já mostram o número.
    this.inventory.add(item.kind, item.units ?? 1);
    this.heldBatteryChargeMs = item.kind === 'batteryFull'
      ? (item.chargeMs ?? BATTERY_FEED_MS)
      : 0;
    // Um graveto ACESO apanhado do chao sobe aceso, com o combustivel que lhe resta — o par
    // do deposito no braco. O item LARGADO na troca ainda pousa apagado (a queda apaga);
    // fogo so desce ao chao pela entrega deliberada a uma maquina.
    if (item.kind === 'wood' && item.fire) {
      this.heldOnFire = true;
      this.torchFuelMs = item.fire.fuelMs;
    } else {
      this.heldOnFire = false;
      this.torchFuelMs = 0;
    }
    this.swordSlash?.setOnFire(false);
    this.updateBackItem(); // the held item shows on the hero's back — the game's only inventory

    if (this.seenItems.has(item.kind)) {
      // Repeat pickup: no ceremony, just the pickup chime (the item shows on the back).
      getSoundManager().playSwordPickup();
    } else {
      // First-time pickup: the ItemGetOverlay ceremony plays its own pickup chime at the reveal.
      this.seenItems.add(item.kind);
      this.showItemGet(item.kind, () => {});
    }
    this.persistAdventure(); // a mochila e o chao mudaram juntos
  }

  /**
   * GASTAR o item selecionado (a bomba plantada, o graveto que virou ponte, a pedra que virou
   * vau). Com a mochila isto deixou de esvaziar a mao e passou a tirar UMA unidade da lista: se
   * ainda ha graveto, a mao continua com um graveto; se acabou, a selecao anda para o vizinho
   * de slot (ver Inventory.remove).
   */
  private clearHeldItem(): void {
    const kind = this.heldItem;
    if (kind !== 'none') this.inventory.remove(kind);
    this.heldOnFire = false;
    this.torchFuelMs = 0;
    this.heldBatteryChargeMs = 0;
    this.updateBackItem();
  }

  /** Escolher o item do B (a subtela, e o playtest). Recusa o que nao esta na mochila. */
  private selectItem(kind: HeldItemKind | 'none'): boolean {
    if (!this.inventory.select(kind)) return false;
    // Trocar de item apaga a tocha da MAO: o fogo mora no graveto que estava sendo carregado, e
    // ele acabou de ir para a mochila. Guardar uma tocha acesa dentro da mochila seria a unica
    // maneira de o jogo ter fogo que nao esta em lugar nenhum do mundo.
    if (this.heldOnFire && kind !== 'wood') this.extinguishTorch();
    this.updateBackItem();
    return true;
  }

  // Refresh the item slung on the hero's back to match the held item (hidden when empty). Uses
  // the same per-item art as the swing so what you carry reads the same in both places.
  private updateBackItem(): void {
    // COM A BOLSA VAZIA, O QUE ELE CARREGA É A ESPADA. Ela não é item e não tem slot, mas o herói
    // a tem desde o primeiro frame — e um herói que só mostra a lâmina no instante do golpe é um
    // herói que parece desarmado durante o prólogo inteiro, que é justamente quando a mochila
    // ainda está vazia. Com qualquer coisa selecionada, as costas mostram a SELEÇÃO: é ela que o
    // botão X vai usar, e é isso que o jogador precisa ler no corpo.
    const carried: HeldItemKind = this.heldItem === 'none' ? 'sword' : this.heldItem;
    // A lit graveto is held upright in the hand; the separate pixel-flame effect supplies
    // the fire, so the carried sprite itself always remains the plain stick.
    const torchLit = this.isTorchLit;
    const visual = BACK_ITEM_VISUAL_3D[carried];
    if (!this.backItemBb) {
      // CENTRED, unlike the standing sprites: a billboard's origin is normally its feet, and
      // setAngle pivots about that origin. A tree or an enemy SHOULD rock about its foot — but
      // a carried item hangs in the air, and pivoting it about its bottom edge swings the whole
      // blade out of the hero's silhouette instead of tilting it in place. The 2D sprite this
      // replaced rotated about its centre (setOrigin(0.5)); this restores that.
      this.backItemBb = this.world3d?.addBillboard(visual.texture, visual.frame, { centered: true });
      if (!this.backItemBb) return;
    }
    // Real size: draw the item at one full tile, the same pixel scale as the hero and the
    // world sprites — no shrinking.
    this.backItemBb
      .setTexture(visual.texture, visual.frame)
      .setDisplaySize(1, 1)
      .setAngle(torchLit ? 0 : -35.5) // torch stands upright; other tools ride "meio cruzado"
      .setVisible(true);
    this.positionBackItem();
  }

  // Pin the item on the hero's back, riding the hero billboard. Its ELEVATION is the same at every
  // facing; only its DEPTH follows him, and it has to, because "on his back" is a side of a body:
  // when he faces the camera his back is the far side (item behind, the body hides all but what
  // clears his shoulder — the z-buffer doing what depth-sorting did in 2D), and when he faces UP
  // his back is the side we are looking at, so the item is NEARER than he is.
  //
  // Pushing it behind at every facing looked like the simpler rule and deleted the item outright in
  // the one pose that exists to show it: facing north the hero quad covers it completely and not a
  // pixel of the axe survives. What actually earned the old complaint ("vejo apenas o que dá pra ver
  // do machado, não ele completo") was not the near depth — it was riding at elevation 0.84, above
  // the hero's 0→1 body, where nothing could occlude it at any depth and it floated over his head.
  // Elevation is what fixes that, and it stays fixed at 0.55 here for every facing: the item spans
  // 0.05→1.05, i.e. across his spine, so facing up reads as a tool STRAPPED ON, not hovering.
  private positionBackItem(): void {
    const bb = this.backItemBb;
    const hb = this.heroBillboard;
    if (!bb?.visible || !hb) return;
    // Lit torch: gripped upright in the hand at the hero's side, raised so the flame clears
    // the shoulder — always in front of the body (it's held out, never hidden behind him).
    // The billboard is centred (see updateBackItem), so its elevation is the height of the
    // sprite's MIDDLE, not of its feet: half a tile more than the offsets the 2D sprite used,
    // which measured from the hero's centre.
    // Whatever he carries rides the walk bob with him, or it floats while he bounces underneath.
    const bob = this.hero.bobLift;
    if (this.isTorchLit) {
      bb.setPosition(hb.x + 0.32, hb.y + 0.02).setElevation(0.68 + bob);
      return;
    }
    // Facing comes from the movement controller (the sprite's own facing), so the item can never
    // get out of sync with the body the hero is actually showing.
    const facingUp = (this.movementController?.facing.dy ?? 1) < 0;
    bb.setPosition(hb.x - 0.10, hb.y + (facingUp ? 0.02 : -0.02)).setElevation(0.55 + bob);
  }

  // Hide the back item for the duration of a swing (reset the timer if the hero swings again),
  // then restore it via updateBackItem. positionBackItem no-ops while it's hidden. The pickaxe's
  // overhead chop runs about twice as long as a slash, so it passes its own duration — otherwise
  // the pick would reappear on his back while it is still buried in the rock.
  private hideBackItemDuringSwing(durationMs = SWING_HIDE_MS): void {
    this.backItemBb?.setVisible(false);
    this.backItemSwingTimer?.remove();
    this.backItemSwingTimer = this.time.delayedCall(durationMs, () => {
      this.backItemSwingTimer = undefined;
      if (!this.itemGetOpen) this.updateBackItem(); // updateBackItem keeps it hidden if empty-handed
    });
  }

  // A felled tree leaves a stick behind: drop a `wood` pickup on the (now passable) stump tile.
  // `wood` is the flammable item, so the stick is exactly "an item you can use to make fire".
  /**
   * The frame of the choppable TREE tile at (wx, wy), or null if that tile is not one.
   *
   * Bounded to the authored world on purpose. Outside it there is only open sea, whose terrain
   * WorldData synthesises fresh on every call — a "chop" out there would edit a throwaway object
   * and leave the mesh and the collision disagreeing forever. The sea has no upper layer anyway,
   * so this is belt and braces: the border must not be editable by any means.
   */
  private treeTileFrameAt(wx: number, wy: number): number | null {
    const chunks = this.chunkManager;
    if (!chunks) return null;
    const cx = Math.floor(wx / CHUNK_COLUMNS);
    const cy = Math.floor(wy / CHUNK_ROWS);
    if (!chunks.hasChunkCoordinate(cx, cy)) return null;
    const { upper } = chunks.getTile(wx, wy);
    return upper !== null && CHOPPABLE_UPPER_FRAMES.has(upper) ? upper : null;
  }

  /**
   * Fell a tree that is a TILE rather than a prop — the steel axe's whole reason to exist.
   * Returns true if the bump was about a tree tile at all (whether or not it fell), so the
   * caller stops there.
   *
   * One swing takes it down: a tile has no stages to shrink through (that is the dryTree prop's
   * job, and its 6-frame sheet), and it leaves no stump — the tile simply opens. What it DOES
   * leave is a graveto, because an item whose only output is passage is a password and not a
   * tool: felling a pine has to feed the fire economy exactly like felling a dead tree does.
   */
  private tryChopTreeTile(wx: number, wy: number): boolean {
    if (this.treeTileFrameAt(wx, wy) === null) return false;

    if (this.heldItem !== 'greatAxe') {
      // Silencio, com machado na mao ou sem nada. O pinheiro que recusa o machado comum era o
      // unico lugar onde o jogo dizia em voz alta que existem DOIS machados; sem os baloes,
      // quem descobre isso e o jogador, batendo e reparando que o machado de aco derruba o que
      // o comum nao derruba. E o mesmo preco que todas as outras travas pagaram.
      return true;
    }

    // The OVERHEAD chop, not the sword's flat sweep. Felling a pine is the pickaxe's motion, not
    // a duelist's: hauled up, hung on its own weight, driven into one spot. The timing here always
    // assumed it — the blow is scheduled at CHOP_IMPACT_MS, the chop's impact frame — but the call
    // played a slash, which is over (arc + fade, ~220ms) BEFORE the hit lands at 245ms, with the
    // axe already back on the hero's back at SWING_HIDE_MS. So the sound, the chips and the tree
    // dropping a stage all fired at nothing. Swinging the motion the timings belong to fixes the
    // look and the sync in one move.
    this.swingChop('greatAxe', wx, wy);
    this.time.delayedCall(CHOP_IMPACT_MS, () => {
      const felled = this.chopTreeTile(wx, wy);
      if (felled === null) return; // gone already (a second swing landing late)
      getSoundManager().playWoodChop();
      this.spawnBridgeChips(wx, wy, felled ? 6 : 4);
      // Only the LAST chop can pay out, and only sometimes — see TREE_TILE_STICK_CHANCE.
      if (felled && this.rollTreeTileStick()) this.dropTreeStick(wx, wy);
    });
    return true;
  }

  /**
   * Whether this felled tile pays out a graveto. Its own method purely so the playtest can
   * sample the rate without swinging an axe ~200 times through the real input path.
   */
  private rollTreeTileStick(): boolean {
    return Math.random() < TREE_TILE_STICK_CHANCE;
  }

  /**
   * One swing against a tree tile. Returns true if this was the FELLING chop, false if the tree
   * merely dropped to its next stage, null if there was no tree left to hit.
   *
   * A tile comes down in stages like the dryTree prop does — full tree, crown gone, stump, gone —
   * but where the prop shrinks through its own sheet, a tile has to swap to another frame of the
   * tileset ATLAS, because World3D bakes every standing tile into one mesh sampling that atlas.
   */
  private chopTreeTile(wx: number, wy: number): boolean | null {
    const frame = this.treeTileFrameAt(wx, wy);
    if (frame === null) return null;
    const stage = TREE_CHOP_STAGE_FRAMES.indexOf(frame);
    const next = TREE_CHOP_STAGE_FRAMES[stage + 1]; // stage -1 (a whole tree) → the first stage
    if (next === undefined) {
      this.fellTreeTile(wx, wy);
      return true;
    }
    this.setTreeTileFrame(wx, wy, next);
    // The blow landed on a tree that is STILL STANDING, so rock it — the same answer the dry tree
    // gives the plain axe (DryTreeObject's chop recoil). A tile cannot tween like a prop, so the
    // lean is written into the merged mesh; see World3D.shakeSolidTile. The felling blow above
    // gets none: there is no tree left to shudder, it comes down instead.
    this.world3d?.shakeSolidTile(wx, wy);
    return false;
  }

  /** Move a tree tile to another frame in BOTH places it exists: the chunk data and the mesh. */
  private setTreeTileFrame(wx: number, wy: number, frame: number): void {
    const chunks = this.chunkManager;
    if (!chunks) return;
    const chunk = chunks.getChunk(Math.floor(wx / CHUNK_COLUMNS), Math.floor(wy / CHUNK_ROWS));
    const lx = ((wx % CHUNK_COLUMNS) + CHUNK_COLUMNS) % CHUNK_COLUMNS;
    const ly = ((wy % CHUNK_ROWS) + CHUNK_ROWS) % CHUNK_ROWS;
    chunk.upper[ly][lx] = frame;
    this.world3d?.setSolidTileFrame(wx, wy, frame);
  }

  /**
   * Take the tree out of the terrain: the chunk data (which is where collision lives, via
   * SOLID_UPPER_FRAMES) and the merged static mesh (which is where the art lives). Both, or the
   * world desyncs into an invisible wall / a walk-through tree.
   *
   * The chunk arrays here are the SAME arrays WorldData holds, so this edit outlives the chunk
   * cache — which is what we want (a felled tree stays felled for the run) and is also why it
   * must never run outside the authored bounds; see treeTileFrameAt.
   */
  private fellTreeTile(wx: number, wy: number): boolean {
    const chunks = this.chunkManager;
    if (!chunks || this.treeTileFrameAt(wx, wy) === null) return false;
    const chunk = chunks.getChunk(Math.floor(wx / CHUNK_COLUMNS), Math.floor(wy / CHUNK_ROWS));
    const lx = ((wx % CHUNK_COLUMNS) + CHUNK_COLUMNS) % CHUNK_COLUMNS;
    const ly = ((wy % CHUNK_ROWS) + CHUNK_ROWS) % CHUNK_ROWS;
    chunk.upper[ly][lx] = null;
    // The worldgen paints an explicit collision under every obstacle frame as well, so clearing
    // only the upper frame would leave the tile blocked by an invisible wall.
    chunk.collisions[ly][lx] = false;
    this.world3d?.removeSolidTile(wx, wy);
    if (this.adventure && !getDungeonTrip()) {
      // Edicao de TERRENO entra no save como diff (applyFelledTreeDiff a reaplica em cada boot).
      adventureState().felledTrees.add(`${wx},${wy}`);
      this.persistAdventure();
    }
    return true;
  }

  /**
   * Deixa o PRODUTO de uma ferramenta no chao. O tile do obstaculo acabou de abrir e e o
   * lugar natural — mas se um item ja estiver ali (um braco depositou na janela do corte, um
   * swap), o produto NAO evapora: cai no primeiro vizinho cardeal livre. "Items should
   * PRODUCE" so vale se a producao chega ao chao; a regra "um item por tile" continua
   * absoluta — suprimir e o ultimo recurso, apenas com todos os vizinhos tomados.
   */
  private dropProduct(
    kind: HeldItemKind, worldX: number, worldY: number, units?: number,
  ): void {
    if (!this.itemManager) return;
    if (!this.itemManager.hasItemAt(worldX, worldY)) {
      this.itemManager.drop(kind, worldX, worldY, undefined, undefined, units);
      this.persistAdventure();
      return;
    }
    for (const [dx, dy] of CARDINAL_DIRS) {
      const nx = worldX + dx;
      const ny = worldY + dy;
      // isSolidForEntities sem botas: o produto nunca cai num rio, na lava ou dentro de um
      // corpo solido — um item so pousa onde o heroi pode pisar pra busca-lo.
      if (this.isSolidForEntities(nx, ny) || this.itemManager.hasItemAt(nx, ny)) continue;
      this.itemManager.drop(kind, nx, ny, undefined, undefined, units);
      this.persistAdventure();
      return;
    }
  }

  private dropTreeStick(worldX: number, worldY: number): void {
    // Um PACOTE de dois (ver TREE_STICK_YIELD), e não dois itens no chão: apanhar é um gesto só,
    // e o pacote já existe no jogo (o cabo sai de cinco em cinco).
    this.dropProduct('wood', worldX, worldY, TREE_STICK_YIELD);
  }

  /** A carga saltando do cabo pra bateria: anel gold no chao + faiscas subindo da mao. */
  private spawnBatteryChargeFx(wx: number, wy: number): void {
    const w3 = this.world3d;
    if (!w3) return;
    const ring = w3
      .addBillboard(FX_RING_TEXTURE, 0, { flat: true, flatY: 0.03, additive: true, fog: false, depthWrite: false })
      .setTint(0xf1cc36)
      .setPosition(wx, wy)
      .setDisplaySize(0.2, 0.2)
      .setAlpha(0.8);
    this.tweens.add({
      targets: ring, scaleX: 1.1, scaleY: 1.1, alpha: 0, duration: 420,
      ease: 'Quad.easeOut', onComplete: () => ring.destroy(),
    });
    for (let i = 0; i < 4; i += 1) {
      const spark = w3
        .addBillboard(FX_DOT_TEXTURE, 0, { centered: true, fog: false, additive: true, depthWrite: false, emissive: true })
        .setTint(i % 2 === 0 ? 0xf1cc36 : 0xf8e394)
        .setPosition(wx + (Math.random() - 0.5) * 0.2, wy + 0.02)
        .setElevation(0.2)
        .setDisplaySize(0.055, 0.055);
      this.tweens.add({
        targets: spark, elevation: 0.55 + Math.random() * 0.2, alpha: 0,
        duration: 300 + i * 50, ease: 'Quad.easeOut', onComplete: () => spark.destroy(),
      });
    }
  }

  /**
   * TODO arbusto seco queimado deixa CARVÃO na cinza — o fogo produzindo, sem sorteio.
   *
   * Era 1 em 4 (`CHARCOAL_DROP_CHANCE`), e a razão da época fazia sentido: o carvão era a comida
   * da tocha e a única fonte dele era queimar mato, então a raridade era o que metrificava o fogo.
   * Duas coisas mudaram desde então — o carvão virou o REAGENTE da cadeia do ferro (nenhuma barra
   * existe sem ele) e o forno ganhou a CARVOARIA (madeira+madeira), que é uma fonte renovável e
   * previsível. Contra uma receita que se pode repetir a qualquer hora, um sorteio no arbusto não
   * é economia: é um imposto sobre quem escolheu o caminho do fogo, e o jogador queima quatro
   * arbustos para ter o que uma árvore dá de graça.
   *
   * Arbustos só, nunca mato alto: o mato é o pavio e o laço de plantio, e um item surpresa nascendo
   * num pavio queimado cairia no caminho de quem está andando por cima dele.
   */
  private dropCharcoalFromBush(worldX: number, worldY: number): void {
    this.dropProduct('charcoal', worldX, worldY);
  }

  // Mowing tall grass leaves a handful of SEEDS behind, on the stubble tile — the scythe's
  // product, and what makes it a producer, not a password: plant them in a plantSpot hole,
  // water, and the grass returns. Like the graveto, they wait until the hero steps off and on.
  private dropSeeds(worldX: number, worldY: number): void {
    this.dropProduct('seeds', worldX, worldY);
  }

  // A shattered rock leaves a stone behind, on the tile it used to block. Wood's opposite:
  // it fords a river and it will never carry a flame (see WaterObject.placeStone / burn).
  private dropStone(worldX: number, worldY: number): void {
    this.dropProduct('stone', worldX, worldY);
  }

  /**
   * O que uma pedra ESTOURADA deixa pra tras: pedra, ou um bloco de ferro se ela tinha veio.
   *
   * Existe como funcao propria porque DOIS caminhos quebram pedra — a picareta e a explosao —
   * e eles ja tinham divergido uma vez. Com a regra escrita em dois lugares, uma pedra de
   * minerio aberta a bomba largaria calmamente uma pedra comum, e o jogador levaria um bom
   * tempo pra desconfiar que o defeito era esse.
   */
  private dropRockSpoil(rock: RockObject): void {
    // A rocha de VEIO entrega MINERIO, nao ferro: o que sai de uma pedra e pedra com oxido
    // dentro. O metal so existe depois do forno — e essa etapa e a peca inteira desta cadeia.
    this.dropProduct(rock.ore ? 'ore' : 'stone', rock.worldX, rock.worldY);
  }

  /**
   * O bloco que o VEIO produz ESPALHA COMO MOEDA (pedido do usuário: minerar tem que fluir):
   * salta da pedra, quica num tile vizinho e se pega ANDANDO por cima — a exceção deliberada
   * ao "nada entra na mochila por pisada". A outra metade da exceção: `stash`, nunca `add` —
   * o minério entra na mochila e a MÃO do herói fica exatamente com o que estava (a picareta,
   * no meio da mineração, não pode ser roubada por cada bloco que cai).
   */
  /**
   * O alvo do voo da moeda: o NÚMERO do HUD, convertido de coordenada de página para a do
   * canvas do Phaser (o voo é um sprite Phaser; o HUD é DOM — dois espaços, uma régua).
   */
  private hudCoinAnchor(): { x: number; y: number } | null {
    const rect = this.explorerHud?.coinAnchorRect();
    if (!rect) return null;
    const canvas = this.game.canvas.getBoundingClientRect();
    if (canvas.width <= 0 || canvas.height <= 0) return null;
    return {
      x: (rect.left + rect.width / 2 - canvas.left) * (this.scale.width / canvas.width),
      y: (rect.top + rect.height / 2 - canvas.top) * (this.scale.height / canvas.height),
    };
  }

  private spawnOreLoot(rock: RockObject): void {
    if (!this.coinManager || !this.chunkManager) return;
    this.coinManager.spawnLoot(
      rock.worldX, rock.worldY, this.chunkManager, 1,
      // A arte do MINERIO, e nao a do ferro: ela ficou para tras quando a cadeia do ferro entrou,
      // e o resultado eram dois "minerios" diferentes na tela — um com cara de bloco de metal
      // (este) e outro com cara de pedra (o do chao). Mesma coisa, dois desenhos.
      { key: 'ore-item', size: 0.6 },
      () => {
        this.inventory.stash('ore', 1);
        // O MESMO som do minerio apanhado no chao (ver playItemStash). Um objeto que soa de dois
        // jeitos conforme a procedencia e a mesma confusao que a arte errada fazia, so que pelo
        // ouvido — e ele voa como moeda, entao soar como moeda era a confusao em dobro.
        getSoundManager().playItemStash();
        this.persistAdventure();
      },
    );
  }

  // A stone dropped into lava cools it into basalt: a permanent walkable firebreak (LavaObject
  // owns the visual swap; its glow and heat-light deliberately KEEP burning — the melt around
  // the crown is still molten, only the crown is a floor). Steam and a thump sell the quench.
  // This is the lava counterpart of a stone ford — a floor over the hazard that never becomes
  // a fuse.
  private solidifyLava(lava: LavaObject, worldX: number, worldY: number): void {
    if (!lava.solidify()) return;
    this.spawnSmokePuff(worldX, worldY);
    this.world3d?.shake(90, 0.02);
  }

  // Dip the empty bucket in the river: it comes up full. Empty→full shows as the art the hero
  // carries (no HUD). A splash sells the dip.
  private fillBucket(wx: number, wy: number): void {
    if (this.heldItem !== 'bucket') return;
    this.swingHeld(wx, wy); // the bucket arcs down into the water
    this.inventory.replace('bucket', 'bucketFull'); // o mesmo slot, cheio — ver Inventory.replace
    getSoundManager().playSplash();
    this.updateBackItem();
  }

  // The thrown water LANDED on a lit campfire: it hisses out to cold logs and steam rises —
  // a double puff, because a whole bucketload quenching embers is a CLOUD, not a wisp. (The
  // bucket already emptied at the throw.) Killing this fire may end the safe ring under the
  // hero, so the safety flag is recomputed here (the mirror of lightCampfire).
  private douseCampfire(cf: CampfireObject, wx: number, wy: number): void {
    if (!cf.extinguish()) return;
    getSoundManager().playSplash();
    this.spawnSmokePuff(wx, wy); // steam off the dead logs...
    this.time.delayedCall(140, () => this.spawnSmokePuff(wx, wy)); // ...billowing in two breaths
    const dist = this.distToNearestCampfireTiles(this.playerWorld.worldX, this.playerWorld.worldY);
    this.playerSafe = dist <= CAMPFIRE_SAFE_RADIUS_TILES;
  }

  // The water leaves the bucket NOW — the hand empties with the throw, not with the landing —
  // and a slug of droplets carries it to the target; `onLand` fires when it arrives.
  private throwBucketWater(wx: number, wy: number, onLand: () => void): void {
    if (this.heldItem !== 'bucketFull') return;
    this.inventory.replace('bucketFull', 'bucket');
    this.updateBackItem();
    this.spawnWaterThrow(wx, wy, onLand);
  }

  // A thrown bucketload: bulk puffs carry the water's MASS under bright additive glints, all
  // riding one parabola from the hero's hands to the target tile (spread + stagger so it reads
  // as a slosh, not a projectile). The douse/watering happens where the water actually IS —
  // when it lands — capped by a low splash burst, not at the end of an invisible swing.
  private spawnWaterThrow(toX: number, toY: number, onLand: () => void): void {
    const w3 = this.world3d;
    if (!w3) { onLand(); return; }
    const FLIGHT_MS = 220;
    const fromX = this.playerWorld.worldX;
    const fromY = this.playerWorld.worldY;
    const startX = fromX + (toX - fromX) * 0.3; // leaves from the bucket's arc, not the hero's feet
    const startY = fromY + (toY - fromY) * 0.3;

    for (let i = 0; i < 9; i++) {
      const isBulk = i < 3;
      const drop = w3
        .addBillboard(isBulk ? FX_PUFF_TEXTURE : FX_DOT_TEXTURE, 0, {
          ...FX_BILLBOARD, additive: !isBulk, emissive: isBulk, emissiveBoost: isBulk ? 1 : 1.5,
        })
        .setTint(isBulk ? 0x9fb4dd : 0xbbf2f4)
        .setPosition(startX, startY)
        .setElevation(0.42)
        .setDisplaySize(isBulk ? 0.3 : 0.13, isBulk ? 0.24 : 0.13)
        .setAlpha(isBulk ? 0.85 : 1);
      const tx = toX + (Math.random() - 0.5) * 0.42;
      const ty = toY + (Math.random() - 0.5) * 0.3;
      this.tweens.addCounter({
        from: 0,
        to: 1,
        duration: FLIGHT_MS,
        delay: i * 14, // the slug stretches: front droplets land while the tail is still flying
        onUpdate: (tween) => {
          const k = tween.getValue() ?? 0;
          drop.setPosition(startX + (tx - startX) * k, startY + (ty - startY) * k);
          // A real toss: up out of the bucket, over the top, down onto the target.
          drop.setElevation(0.42 + (0.06 - 0.42) * k + 0.24 * Math.sin(Math.PI * k));
        },
        onComplete: () => drop.destroy(),
      });
    }

    this.time.delayedCall(FLIGHT_MS + 60, () => {
      onLand();
      this.spawnWaterSplash(toX, toY);
    });
  }

  // The landing: a foam sheet bursts outward low over the target while beads bounce off it.
  private spawnWaterSplash(wx: number, wy: number): void {
    const w3 = this.world3d;
    if (!w3) return;
    const sheet = w3
      .addBillboard(FX_PUFF_TEXTURE, 0, { ...FX_BILLBOARD, additive: true })
      .setTint(0x9fb4dd)
      .setPosition(wx, wy)
      .setElevation(0.08)
      .setDisplaySize(0.3, 0.24)
      .setAlpha(0.8);
    this.tweens.add({
      targets: sheet,
      scaleX: 2.6,
      scaleY: 2.1,
      alpha: 0,
      duration: 240,
      ease: 'Cubic.easeOut',
      onComplete: () => sheet.destroy(),
    });
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + Math.random() * 0.7;
      const dist = 0.28 + Math.random() * 0.3;
      const bead = w3
        .addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 1.5 })
        .setTint(0xbbf2f4)
        .setPosition(wx, wy)
        .setElevation(0.12)
        .setDisplaySize(0.12, 0.12);
      this.tweens.add({
        targets: bead,
        x: wx + Math.cos(ang) * dist,
        y: wy + Math.sin(ang) * dist * 0.7, // foreshortened: the ground plane is tilted away
        elevation: 0.02,
        alpha: 0,
        duration: 190 + Math.random() * 90,
        ease: 'Quad.easeOut',
        onComplete: () => bead.destroy(),
      });
    }
  }

  // A floodgate opened: drain the whole connected run of standing water it was holding back. A
  // flood-fill from the gate's neighbours across contiguous river tiles — so the designer never
  // lists which tiles a gate controls; the water it dams is simply the water it touches. The
  // drained bed is walkable AND a firebreak, reshaping both the crossing and the fire map.
  //
  // The EMPTYING IS A WAVE: each tile's visual drains one beat after the tile nearer the gate
  // (state still flips instantly — collision and the fill itself must not wait on theatrics).
  // The order is the message: water flowing OUT THROUGH THE DOOR reads as plumbing; the first
  // cut's synchronized fade read as the water glitching away.
  private openFloodgate(doorX: number, doorY: number): void {
    const DRAIN_WAVE_MS = 150; // per BFS ring — a 5-tile moat empties in under a second
    const seen = new Set<string>();
    const queue: Array<[number, number, number]> = [[doorX, doorY, 0]];
    let drainedAny = false;
    while (queue.length) {
      const [x, y, depth] = queue.shift() as [number, number, number];
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const water = this.getWaterAt(x, y);
      // Spread only through STANDING water (a bridge/ford/already-drained tile dams the drain).
      if ((x !== doorX || y !== doorY) && (!water || !water.blocking)) continue;
      if (water?.drain(depth * DRAIN_WAVE_MS)) drainedAny = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        queue.push([x + dx, y + dy, depth + 1]);
      }
    }
    if (drainedAny) {
      this.cameras.main.flash(220, 150, 180, 205);
      this.world3d?.shake(130, 0.02);
    }
  }

  // A regrowing tree may only sprout (and only counts its clock) when NOTHING is on its tile —
  // the hero, an enemy, or an item. The item check is key: a felled tree drops a graveto on its
  // stump, and the tree must not grow back until that graveto is picked up (the regrow clock
  // stays paused while it sits there).
  private isTileClearForRegrow(wx: number, wy: number): boolean {
    if (wx === this.playerWorld.worldX && wy === this.playerWorld.worldY) return false;
    if (this.enemyManager?.getEnemyAt(wx, wy)) return false;
    if (this.itemManager?.hasItemAt(wx, wy)) return false;
    // A pushable crate can be parked on any passable tile — a stump, an open hole — and a
    // tree or mound growing back THROUGH it would weld two blocking bodies onto one tile.
    if (this.getWoodenCrateAt(wx, wy)) return false;
    return true;
  }

  // TIMBER! — a tree felled with a river directly beyond it (in the chop direction) topples
  // across the water and becomes a FREE log bridge (no gravetos spent). `dx,dy` is the unit
  // chop/topple direction. Returns true if it bridged at least one water tile (then the tree's
  // wood went into the bridge, so no graveto drops).
  private tryTimberBridge(treeX: number, treeY: number, dx: number, dy: number): boolean {
    if ((dx === 0 && dy === 0) || (dx !== 0 && dy !== 0)) return false; // one cardinal direction
    const spanned: WaterObject[] = [];
    for (let i = 1; i <= TIMBER_MAX_SPAN; i++) {
      const w = this.getWaterAt(treeX + dx * i, treeY + dy * i);
      // TIMBER works on ANY river tile (a felled tree bridges wherever it lands) — unlike the
      // manual graveto build, which only works on marked bridgeSpots.
      if (!w || !w.blocking) break;
      spanned.push(w);
    }
    if (spanned.length === 0) return false;
    this.playTimberFall(treeX, treeY, dx, dy, spanned);
    return true;
  }

  // The falling-tree spectacle: a full-tree sprite tips over from its base and slides across
  // the water, then the log bridge tiles snap in with a splash + shake.
  private playTimberFall(treeX: number, treeY: number, dx: number, dy: number, spanned: WaterObject[]): void {
    if (!this.camera) return;
    const size = this.tileSize;
    const s = this.camera.tileToScreen(treeX, treeY, size);
    const faller = this.add
      .sprite(s.x, s.y + size * 0.5, ASSET_KEYS.dryTree, 0)
      .setOrigin(0.5, 1) // pivot at the base, like a real tree tipping over
      .setDisplaySize(size, size)
      .setDepth(SCENE_DEPTHS.player + 4);

    const dir = dx !== 0 ? Math.sign(dx) : Math.sign(dy);
    getSoundManager().playTreeFall();
    this.cameras.main.shake(120, 0.0015);

    this.tweens.add({
      targets: faller,
      angle: 86 * dir,
      x: s.x + dx * size * 0.8,
      y: s.y + size * 0.5 + dy * size * 0.6,
      duration: 460,
      ease: 'Quad.easeIn',
      onComplete: () => {
        // The trunk lands: reveal each log tile in sequence with a splash, from near to far.
        spanned.forEach((w, i) => {
          this.time.delayedCall(i * 70, () => {
            w.buildBridgeNow();
            this.spawnSplash(w.worldX, w.worldY);
            getSoundManager().playSplash();
          });
        });
        getSoundManager().playBridgeBuilt();
        this.cameras.main.shake(200, 0.004);
        this.tweens.add({ targets: faller, alpha: 0, duration: 220, onComplete: () => faller.destroy() });
      },
    });
  }

  // A quick spray of pale droplets where the trunk hits the river.
  private spawnSplash(wx: number, wy: number): void {
    if (!this.camera) return;
    const s = this.camera.tileToScreen(wx, wy, this.tileSize);
    const r = Math.max(2, Math.floor(this.tileSize * 0.1));
    for (let i = 0; i < 6; i++) {
      const drop = this.add
        .circle(s.x + Phaser.Math.Between(-5, 5), s.y, r, 0xbfe6ef, 0.85)
        .setDepth(SCENE_DEPTHS.player + 3);
      this.tweens.add({
        targets: drop,
        y: drop.y - this.tileSize * (0.3 + Math.random() * 0.4),
        x: drop.x + Phaser.Math.Between(-6, 6),
        alpha: 0,
        duration: 260 + i * 20,
        ease: 'Quad.easeOut',
        onComplete: () => drop.destroy(),
      });
    }
  }

  // Zelda-style "item get" beat: freeze the game, spotlight the hero, raise the item.
  private showItemGet(kind: HeldItemKind, afterClose: () => void): void {
    if (this.itemGetOpen) { afterClose(); return; }
    this.itemGetOpen = true;
    getSoundManager().fadeMusicOut();
    this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
    // interruptMovement just snapped the camera to the hero's tile mid-frame — after the tiles
    // were already drawn at the old camera but before props/items. Re-project the whole world
    // once so everything realigns to the final camera before the ceremony freezes it (otherwise
    // props/items look shifted a tile until the overlay closes).
    this.reprojectStatic();
    this.itemGetOverlay = new ItemGetOverlay(this, { ...ITEM_GET_CFG[kind], label: t(`items.get.${kind}`) }, () => {
      this.itemGetOverlay?.destroy();
      this.itemGetOverlay = undefined;
      this.itemGetOpen = false;
      getSoundManager().fadeMusicIn();
      afterClose();
    });
  }

  /**
   * O ESCUDO — e ele não é um item, é a DIREÇÃO EM QUE O HERÓI OLHA.
   *
   * O combate não tinha verbo defensivo nenhum: o único jeito de não apanhar era andar para trás,
   * e como andar para trás sempre funciona, nunca havia decisão. No `A Link to the Past` metade
   * da leitura de uma luta é o escudo, que apara sozinho o que vem da frente do Link.
   *
   * Aqui ele é intrínseco de propósito. O herói tem UMA mão (a mochila entrega um item por vez) e
   * um escudo que ocupasse essa mão custaria a tocha, o machado e o balde para comprar uma defesa
   * — e o jogo já ensinou que a parede VIRA o herói e que virar-se para uma criatura é de graça.
   * Fazer da direção olhada a defesa não acrescenta botão nenhum: transforma o gesto que o jogador
   * já faz (encarar) na resposta que faltava.
   *
   * **E ele só apara TIRO** (quem chama testa `hit.ranged`), que é a regra do original e a única
   * que não desmonta o resto do combate. Se encarar aparasse também o golpe de corpo, encarar
   * seria invencibilidade: todo bicho que anda bate de perto, e o jogador ficaria imune a metade
   * do bestiário parado, sem se mover. Contra o corpo a resposta continua sendo a que o telegrafo
   * de 500ms ensina — SAIR DO TILE —, e contra o tiro passa a ser encarar. Dois problemas, duas
   * respostas, e nenhuma delas resolve a outra.
   *
   * Três recusas, e cada uma existe por um motivo:
   *  - **cone frontal de 90°**: o eixo dominante do golpe tem de ser o eixo encarado, senão o
   *    escudo viraria uma bolha e apanhar deixaria de ser possível de frente;
   *  - **não apara durante o próprio golpe** (`SWING_ROOT_MS`): quem ataca abaixa a guarda — é o
   *    preço que faz atacar ser uma decisão e não um reflexo grátis;
   *  - **não apara o que nasce em cima dele** (a explosão, o fogo do chão): não há direção de onde
   *    se defender de uma coisa que já está no seu tile.
   */
  private blocksBlowFrom(fromX: number, fromY: number): boolean {
    if (this.movementController?.isRooted === true) return false;
    const dx = fromX - this.playerWorld.worldX;
    const dy = fromY - this.playerWorld.worldY;
    if (dx === 0 && dy === 0) return false;
    const f = this.movementController?.facing ?? { dx: 0, dy: 1 };
    return Math.abs(dx) >= Math.abs(dy)
      ? Math.sign(dx) === f.dx && f.dx !== 0
      : Math.sign(dy) === f.dy && f.dy !== 0;
  }

  /**
   * O que o jogador VÊ quando o escudo apara: a faísca fria no ponto do impacto, o tim de metal e
   * um baque curto de câmera. Nada de dano, nada de invencibilidade gasta — aparar não consome a
   * janela de 1,5s que levar um golpe daria, ou defender seria uma forma cara de apanhar.
   */
  private playShieldBlock(fromX: number, fromY: number): void {
    this.spawnDeflect(fromX, fromY);
    getSoundManager().playGuardBlock();
    // Na direcao do VOO da bala (de onde ela veio para o heroi): o escudo aparou, mas o empurrao
    // que ela trazia continua sendo dela.
    this.world3d?.shake(60, 0.04,
      this.playerWorld.worldX - fromX, this.playerWorld.worldY - fromY);
    this.hero.tint = 0xbcd4ff;
    this.time.delayedCall(90, () => { this.hero.tint = null; });
  }

  /**
   * O heroi levou um golpe. Ele chega por duas procedencias e a diferenca esta em `ranged`: um
   * golpe de CORPO faz o bicho investir na direcao do heroi (o tombo pra frente, que e a metade
   * animada do impacto); um TIRO nao tem ninguem pra investir — o empurrao vem da direcao do voo,
   * e o mago cinco tiles atras fica exatamente onde estava. `fromX/fromY` e a origem nos dois
   * casos (o tile do bicho, ou o ponto onde a bala encostou).
   */
  private handleEnemyAttackPlayer(hit: EnemyHit): void {
    if (this.isDead) return;
    // A direcao do golpe (de quem bateu para o heroi) serve as tres respostas abaixo — o resvalo,
    // o tranco do atacante e o baque de camera —, entao ela se resolve antes de qualquer porta.
    const kdx = Math.sign(this.playerWorld.worldX - hit.fromX);
    const kdy = Math.sign(this.playerWorld.worldY - hit.fromY);
    if (this.playerInvincible) {
      // O GOLPE NA JANELA DE INVENCIBILIDADE EVAPORAVA EM SILÊNCIO — a única recusa do jogo sem
      // desenho nenhum. A clava conectava no herói piscando e nada acontecia: nem som, nem pixel,
      // que é a leitura de bug ("o ataque me atravessou"). Agora ele RESVALA, com o mesmo pacote
      // frio dos i-frames do bicho (anel + raspão): a mesma regra, a mesma resposta, dos dois
      // lados do combate. Só o golpe de CORPO que o BICHO desferiu — o tiro já morre com o próprio
      // estouro no EnemyProjectile, e o esbarrão do herói piscando não é um golpe de ninguém (ver
      // EnemyHit.bump): um anel a cada encostão seria a recusa virando spam.
      if (!hit.ranged && !hit.bump) {
        const at = this.heroVisualTile();
        this.spawnDeflect(at.x, at.y);
        getSoundManager().playBladeGlance();
        // O atacante ainda INVESTE: o gesto dele aconteceu — o que falhou foi só a mordida.
        hit.enemy?.triggerKnockback(kdx, kdy);
      }
      return;
    }
    // O ESCUDO — e ele só apara TIRO. Ver `blocksBlowFrom`.
    if (hit.ranged && this.blocksBlowFrom(hit.fromX, hit.fromY)) {
      this.playShieldBlock(hit.fromX, hit.fromY);
      return;
    }

    // A BOLA DO ZORA NÃO FERE — TRAVA (ver FreezeManager). Dano zero, coração nenhum: o preço
    // de ser acertado é virar estátua com a matilha em volta. Passa DEPOIS do escudo (encarar a
    // bola ainda a apara — a lei do tiro vale para ela inteira) e nunca gasta a janela de
    // invencibilidade: congelar não é apanhar.
    if (hit.ranged && hit.shotKind === 'spit') {
      this.freezeHero();
      return;
    }

    // A PANCADA ARRANCA A MÃO DE DENTRO DA BOLSA. Ela é a única tela do jogo que fica aberta com o
    // mundo correndo, então ela é também a única que algo do mundo pode FECHAR — e tem de fechar:
    // um herói apanhando enquanto folheia calmamente uma fileira de ícones desmente, num quadro, a
    // promessa inteira do modo (folhear custa; a mochila é um lugar perigoso de se estar).
    this.quickBag?.close();

    // Same reason as handlePlayerBump: reset the breathing pose before the hurt shake repins
    // the hero, so it doesn't jump up half a tile mid-hit.
    this.stopBreathing();

    this.playerHealth = Math.max(0, this.playerHealth - 1);

    // The killing blow is silent — the death screen is total silence, so don't play the hurt sfx.
    if (this.playerHealth <= 0) {
      this.triggerDeath();
      return;
    }

    getSoundManager().playPlayerHurt();

    this.playerInvincible = true;
    this.invincibleTimer = PLAYER_INVULN_MS;

    // O ACERTO COMPRA TEMPO DOS DOIS LADOS. O herói para de andar E de agir enquanto o empurrão o
    // devolve ao centro — ver PLAYER_STAGGER_MS. São duas travas porque são duas coisas: a raiz
    // segura os PÉS (e ela sabe não congelar um passo no meio do tile), e `playerStaggerMs` segura
    // os BOTÕES — adiando o pedido como uma cadência, nunca descartando (ver `spendActionBuffers`).
    // `max` e não atribuição: um golpe de corpo no herói CONGELADO não pode devolver os botões
    // antes do degelo (a raiz já é max por construção — ver PlayerMovementController.root).
    this.playerStaggerMs = Math.max(this.playerStaggerMs, PLAYER_STAGGER_MS);
    this.movementController?.root(PLAYER_STAGGER_MS);

    this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);

    // Taking a hit lands hard: heavy shake, a red screen flash, hitstop, the skull lunging
    // into the blow, and the hero physically shoved away from the attacker.
    //
    // O BAQUE É DO MUNDO, NÃO DA UI. Aqui havia um `cameras.main.shake(200, 0.01)` — a câmera
    // Phaser, que só segura FX e UI por cima do canvas 3D — e o mundo em si ficava PARADO: o único
    // golpe do jogo que não sacudia o mundo era justamente o que o herói levava, enquanto todo
    // golpe que ele DÁ sacode (90/0.09, 150/0.15 na morte). Nos combates de referência a régua é a
    // inversa: apanhar é o momento mais pesado. Então o golpe recebido pesa MAIS que o desferido
    // (170/0.14, entre o acerto e a morte) e inclina na direção do golpe, como todos os outros —
    // e o mundo sacudindo em volta do herói empurrado meio tile é o corpo inteiro do impacto.
    this.world3d?.shake(170, 0.14, kdx, kdy);
    this.cameras.main.flash(110, 160, 30, 30);
    this.triggerHitstop(90);
    if (this.camera) {
      // So o golpe de corpo lunga: uma bala nao arrasta quem a disparou atras dela.
      if (!hit.ranged) hit.enemy?.triggerKnockback(kdx, kdy); // lunge toward the hero
      // The hero is always pinned to screen centre; the shove displaces him and eases him
      // back. startBreathing waits for this tween, so the return never gets cut.
      const bx = this.camera.screenCenterX;
      const by = this.camera.screenCenterY;
      this.hero.x = bx + kdx * this.tileSize * 0.34;
      this.hero.y = by + kdy * this.tileSize * 0.34;
      this.playerKnockTween = this.tweens.add({
        targets: this.hero,
        x: bx,
        y: by,
        duration: 240,
        ease: 'Power3.easeOut',
        onComplete: () => { this.playerKnockTween = undefined; },
      });
    }

    this.hero.tint = 0xff4444;
    this.tweens.add({
      targets: this.hero,
      alpha: 0.3,
      duration: PLAYER_BLINK_HALF_MS,
      yoyo: true,
      repeat: PLAYER_BLINK_REPEAT,
      onComplete: () => {
        this.hero.alpha = 1;
        this.hero.tint = null;
      },
    });
  }

  // The intro's finale: after the wizard's closing prophecy, the world fades to black, a card
  // says the introduction is complete, and the game returns to the title screen.
  private playIntroEnding(): void {
    this.cutsceneActive = true; // freeze gameplay for the finale
    if (this.adventure) {
      // O final visto entra no save: quem continuar depois dele mantem o mundo aceso que
      // construiu (e o titulo continua oferecendo Continue, nao um recomeco).
      adventureState().endingSeen = true;
      this.persistAdventure();
    }
    this.hideLowHealthOutlines();
    getSoundManager().fadeMusicOut();

    const { width, height } = this.scale;
    const D = SCENE_DEPTHS.toast + 5;

    const black = this.add.rectangle(0, 0, width, height, 0x000000, 0).setOrigin(0).setDepth(D);
    this.tweens.add({
      targets: black,
      fillAlpha: 1,
      duration: 1900,
      ease: 'Sine.easeIn',
      onComplete: () => {
        const title = this.add.text(width / 2, Math.round(height * 0.44), t('endCard.title'), {
          fontFamily: "Georgia, 'Times New Roman', 'Book Antiqua', serif",
          fontStyle: 'italic',
          fontSize: `${Math.max(24, Math.min(52, Math.round(height * 0.05)))}px`,
          color: '#e7dcc4',
          align: 'center',
          resolution: 2,
        }).setOrigin(0.5).setAlpha(0).setDepth(D + 1);
        const sub = this.add.text(width / 2, Math.round(height * 0.56), t('endCard.subtitle'), {
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: `${Math.max(13, Math.min(26, Math.round(height * 0.024)))}px`,
          color: '#b7ad98',
          align: 'center',
          resolution: 2,
        }).setOrigin(0.5).setAlpha(0).setDepth(D + 1);
        this.tweens.add({ targets: [title, sub], alpha: 1, duration: 1700, delay: 500, ease: 'Sine.easeInOut' });

        let went = false;
        const goTitle = (): void => {
          if (went) return;
          went = true;
          // Fully stop the (ducked) track so the next scene does a fresh start — a
          // crossfade here would inherit the duck and come up silent.
          getSoundManager().stopMusic();
          getSoundManager().stopAmbience();
          // In the editor playtest the title scene isn't registered — just restart instead.
          if (this.scene.get('title')) this.scene.start('title');
          else this.scene.restart();
        };
        const autoTimer = this.time.delayedCall(7000, goTitle);
        this.time.delayedCall(3600, () => {
          const skip = (): void => { autoTimer.remove(); goTitle(); };
          this.input.once(Phaser.Input.Events.POINTER_DOWN, skip);
          this.input.keyboard?.once('keydown', skip);
        });
      },
    });
  }

  private triggerDeath(): void {
    if (this.isDead) return;
    this.isDead = true;
    // A hitstop must never outlive the fight — the death sequence runs on tweens.
    // (stopBreathing below cancels any in-flight hurt-knockback shove.)
    this.hitstopMs = 0;
    this.tweens.timeScale = 1;
    // Nem golpe guardado nem carga na lamina sobrevive a morte: o silencio da tela de morte nao
    // pode ser interrompido por um botao que o heroi apertou enquanto caia.
    this.resetChargeAndBuffers();
    // E a bolsa some junto com o resto da UI: ela e a unica que fica aberta com o mundo correndo,
    // e o mundo acabou de parar de vez (ver QuickBag). Os pes se soltam com ela.
    this.quickBag?.close();
    this.quickBag?.setButtonVisible(false);
    // One last heavy blow before the silence.
    this.world3d?.shake(300, 0.26);
    // Death cuts music and even the wind to nothing; out of that silence swells the low
    // "you died" cluster, and the hall swallows it back into silence.
    getSoundManager().stopMusic();
    getSoundManager().stopAmbience();
    getSoundManager().playPlayerDeath();
    this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
    // update() stops running FX once dead, so clean these up here. The Phaser overlays matter
    // more than they used to: the fade happens INSIDE the 3D post now, so anything still drawn
    // on the canvas above the world would hang over the black instead of sinking with it.
    this.hideLowHealthOutlines();
    this.stopBreathing();
    this.hideFireCompass();
    this.npcManager?.hideExclaims();
    // The hero's 3D body leaves the world for the elegy; his torch flame goes with it.
    this.torchFlameBb?.setVisible(false);

    const { width, height } = this.scale;
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    const D = SCENE_DEPTHS.toast;

    // 1. The whole world sinks into black, behind the hero — driven from INSIDE the post
    // (World3D.setWorldFade), so the diorama drains of colour and dims with its own bloom,
    // fire glow and grain, instead of a flat black rectangle being pasted over the top.
    this.world3d?.setDangerVignette(0, DANGER_VIGNETTE_COLD);
    const fade = { t: 0 };
    this.tweens.add({
      targets: fade,
      t: 1,
      duration: 900,
      ease: 'Sine.easeIn',
      onUpdate: () => this.world3d?.setWorldFade(fade.t),
    });

    // 2. Only the hero remains, dead-centre on the void — then it fades away, slowly.
    // The death elegy is a 2D screen-space scene, so it gets a Phaser stand-in struck from
    // the hero's last pose; syncHeroBillboard hides the 3D body for as long as it holds.
    this.tweens.killTweensOf(this.hero); // drop a leftover hurt-blink
    this.hero.alpha = 1;
    this.hero.tint = null;
    this.deathHero?.destroy();
    this.deathHero = this.add
      .sprite(cx, cy, ASSET_KEYS.hero, this.hero.frame)
      .setOrigin(0.5)
      .setDisplaySize(this.tileSize, this.tileSize)
      .setFlipX(this.hero.flipX)
      .setDepth(D + 1);

    // The item slung on the hero's back fades out together with him — it dies with the hero.
    // The in-world billboard hides with the 3D body (syncHeroBillboard); its 2D twin dresses
    // up in the same pose for the screen-space elegy.
    this.backItemSwingTimer?.remove();
    this.backItemSwingTimer = undefined;
    if (this.backItemBb?.visible && this.backItem && this.heldItem !== 'none') {
      this.backItemBb.setVisible(false);
      const torchLit = this.isTorchLit;
      const visual = ITEM_VISUAL_2D[this.heldItem];
      const ts = this.tileSize;
      this.tweens.killTweensOf(this.backItem);
      this.backItem
        .setTexture(visual.texture, visual.frame)
        .setDisplaySize(ts, ts)
        .setRotation(torchLit ? 0 : -0.62)
        // Same pose as the living billboard, converted to screen space: the 2D hero is centred at
        // cy with origin 0.5, i.e. elevation 0.5, so an elevation E sits at -(E - 0.5) tiles.
        // positionBackItem's 0.55 is therefore -0.05 — and it no longer splits on facing, since
        // the elegy is drawn ON TOP of the corpse either way and only the height ever showed.
        .setPosition(
          torchLit ? cx + ts * 0.32 : cx - ts * 0.10,
          torchLit ? cy - ts * 0.18 : cy - ts * 0.05,
        )
        .setAlpha(1)
        .setDepth(D + 1)
        .setVisible(true);
      this.tweens.add({ targets: this.backItem, alpha: 0, duration: 1600, delay: 500, ease: 'Sine.easeIn' });
    }

    this.tweens.add({
      targets: this.deathHero,
      alpha: 0,
      duration: 1600,
      delay: 500,
      ease: 'Sine.easeIn',
      onComplete: () => {
        // 3. The epitaph rises out of the dark, in the middle of the screen.
        const line = this.add.text(cx, cy, t('death.epitaph'), {
          fontFamily: "Georgia, 'Times New Roman', 'Book Antiqua', serif",
          fontStyle: 'italic',
          fontSize: `${Math.max(22, Math.min(48, Math.round(height * 0.046)))}px`,
          color: '#d0c9ba',
          align: 'center',
          lineSpacing: Math.round(height * 0.022),
          resolution: 2,
        })
          .setOrigin(0.5)
          .setAlpha(0)
          .setDepth(D + 2);
        this.tweens.add({ targets: line, alpha: 1, duration: 1200, ease: 'Sine.easeInOut' });
      },
    });

    // Restart is independent of the tweens so a stalled tween never traps the player. A MORTE
    // DEVOLVE RÁPIDO (pedido do usuário): a elegia inteira continua — mundo drenando, herói
    // sumindo, epitáfio — mas comprimida (~3.3s até o texto pleno), o pulo arma cedo e o
    // retorno automático vem em 5s. O custo de morrer é a caminhada de volta, nunca a espera.
    let restarting = false;
    const doRestart = (): void => {
      if (restarting) return;
      restarting = true;
      // No explorador a morte nao e um restart: e o fim de uma EXPEDICAO. 5% da bolsa vira
      // banco (perto o bastante de nada para doer, longe o bastante de zero para a expedicao
      // ruim nao ter sido tempo jogado fora), o mundo la fora e resorteado, e o heroi acorda
      // no acampamento — que e o unico lugar deste modo que nao muda.
      if (this.explorer) {
        loseRunToDeath();
        rerollExplorerWorld();
      } else if (this.adventure) {
        // NA AVENTURA A MORTE NAO APAGA MAIS NADA. Mochila, moedas, melhorias, fogueiras e
        // historia atravessam (persistAdventure + hidratacao do create); o custo de morrer e
        // ACORDAR NA FOGUEIRA — a distancia de volta, nao o progresso. E o bonfire.
        this.persistAdventure();
        requestAdventureRespawn();
        if (getDungeonTrip()) {
          // Morrer na dungeon acorda do lado de FORA, na fogueira: o overworld volta do disco
          // (o mesmo gesto de leaveDungeon) e a viagem se encerra aqui, sem escada.
          //
          // O retrato da planta fecha ANTES da volta, pelo mesmo motivo da saida pela escada: a
          // dungeon em que o heroi acabou de morrer e a mesma que ele vai encontrar ao voltar —
          // a morte custa a caminhada de volta, nunca um mundo novo.
          persistActiveDungeon();
          clearActiveDungeon();
          void window
            .fetch(`${import.meta.env.BASE_URL}world.json`, { cache: 'no-store' })
            .then((res) => { if (!res.ok) throw new Error('overworld indisponivel'); return res.json(); })
            .then((json: unknown) => {
              setWorldData(json as Parameters<typeof setWorldData>[0]);
              setActiveLevel(null);
              clearDungeonTrip();
            })
            .catch(() => { /* sem rede: renasce dentro da propria dungeon */ })
            .finally(() => { this.scene.restart(); });
          return;
        }
      }
      this.scene.restart();
    };
    const autoTimer = this.time.delayedCall(5000, doRestart);
    // O pulo arma depois do impacto inicial (o baque + o mundo drenando): cedo o bastante pra
    // quem quer voltar JÁ, tarde o bastante pra um botão apertado enquanto caía não engolir a
    // elegia sem ninguém ter visto que morreu.
    this.time.delayedCall(1600, () => {
      const skip = (): void => { autoTimer.remove(); doRestart(); };
      this.input.once(Phaser.Input.Events.POINTER_DOWN, skip);
      this.input.keyboard?.once('keydown', skip);
    });
  }

  private initLighting(): void {
    // Real lighting lives in the 3D renderer (cold ambient night, warm fire point lights
    // with true breathing cast shadows, hero glow — all quantized into pixel-art bands;
    // see render3d/World3D.ts + pixelArtLight.ts), and so do the world FX that used to be
    // painted flat over the canvas: the torch flame is a billboard, the danger vignette and
    // the death fade are post uniforms. What's left here are the hero-anchored 3D helpers.

    // Red low-health outline — one red-filled copy of the hero per offset direction, drawn just
    // behind the hero billboard so only the border shows. Synced to the hero's pose each tick.
    // Emissive: the outline is a flat UI-ish colour, never shaded by the world's lights.
    this.lowHealthOutlines.forEach((o) => o.destroy());
    this.lowHealthOutlines.length = 0;
    if (this.world3d) {
      for (let i = 0; i < OUTLINE_DIRS.length; i++) {
        this.lowHealthOutlines.push(
          this.world3d.addBillboard('hero', HERO_FRAMES.idleDown, { emissive: true }).setVisible(false),
        );
      }
    }

  }

  // Damage heartbeat: ANY missing health draws a pulsing PIXEL OUTLINE around the hero — never
  // tinting the sprite itself, just a border that throbs. Merely scratched (even one heart off
  // full) reads as a calm yellow glow; on the last hearts it turns red, beating faster and
  // harder the closer to death.
  private updateLowHealthFx(delta: number): void {
    const hurt = !this.isDead && this.playerHealth > 0 && this.playerHealth < this.playerMaxHealth;
    const hb = this.heroBillboard;
    if (!hurt || !hb) {
      this.hideLowHealthOutlines();
      if (!hurt) this.heartbeatPhase = 0;
      return;
    }

    // Three tiers: yellow warning above the red threshold, red on the last hearts, and one
    // heart left beats fastest/hardest of all.
    const low = this.playerHealth <= LOW_HEALTH_HEARTS;
    const critical = this.playerHealth <= 1;
    const rate = critical ? 0.010 : low ? 0.006 : 0.0035; // radians per ms
    const intensity = critical ? 0.95 : low ? 0.62 : 0.38;
    this.heartbeatPhase += delta * rate;
    // Sharpen the sine into a "thump": calm baseline with a quick spike.
    const beat = Math.pow((Math.sin(this.heartbeatPhase) + 1) / 2, 3) * intensity;

    const w = 0.08; // outline thickness in tiles (was tileSize * 0.08 screen px)
    const alpha = Math.min(1, (low ? 0.2 : 0.14) + beat); // always faintly present, spiking on the beat
    const color = low ? 0xff2a2a : 0xffd23f; // red = danger, yellow = "you've taken damage"
    for (let i = 0; i < this.lowHealthOutlines.length; i++) {
      const [dx, dy] = OUTLINE_DIRS[i];
      this.lowHealthOutlines[i]
        .setTexture(hb.texKey, hb.frame)
        .setFlipX(hb.flipX)
        .setDisplaySize(Math.abs(hb.displayWidth), hb.displayHeight)
        // Screen-up offsets become elevation (screen +y is down → negative elevation);
        // z sits a hair behind the hero so only the border shows through (the z-buffer
        // plays the old "depth - 0.01" role).
        .setPosition(hb.x + dx * w, hb.y - 0.01)
        .setElevation(hb.elevation - dy * w)
        .setTintFill(color)
        .setAlpha(alpha)
        .setVisible(true);
    }
  }

  private hideLowHealthOutlines(): void {
    for (const o of this.lowHealthOutlines) o.setVisible(false);
  }

  // Skyrim-compass-style pointer: while the low-health heartbeat is on (and the hero is not
  // already inside a fire's safe ring), a faint amber arrow orbits him, pointing at the
  // nearest lit campfire — a dying player always knows which way safety lies. It throbs
  // in time with the heartbeat outline so both read as one "you are dying, go THERE" signal.
  private updateFireCompass(): void {
    const low = !this.isDead && this.playerHealth > 0 && this.playerHealth <= LOW_HEALTH_HEARTS;
    const cf = low && !this.playerSafe && this.camera
      ? this.nearestLitCampfire(this.playerWorld.worldX, this.playerWorld.worldY)
      : undefined;
    if (!cf || !this.camera) {
      this.hideFireCompass();
      return;
    }

    if (!this.fireCompassArrow) {
      // A proper arrow (shaft + head), pointing +x at rotation 0; rotated toward the fire.
      const len = this.tileSize * 0.36;   // total length
      const sh = this.tileSize * 0.05;    // shaft half-thickness
      const hh = this.tileSize * 0.14;    // head half-width
      const neck = len * 0.08;            // where the shaft ends and the head begins
      this.fireCompassArrow = this.add
        .polygon(0, 0, [
          -len * 0.5, -sh,
          neck, -sh,
          neck, -hh,
          len * 0.5, 0,
          neck, hh,
          neck, sh,
          -len * 0.5, sh,
        ], 0xffc36b, 0.95)
        .setDepth(SCENE_DEPTHS.ui);
    }

    const s = this.camera.tileToScreen(cf.worldX, cf.worldY, this.tileSize);
    const cx = this.camera.screenCenterX;
    const cy = this.camera.screenCenterY;
    const ang = Math.atan2(s.y - cy, s.x - cx);
    const orbit = this.tileSize * FIRE_COMPASS_ORBIT_TILES;
    // Throb with the same heartbeat as the red outline (updateLowHealthFx advances the phase).
    const beat = Math.pow((Math.sin(this.heartbeatPhase) + 1) / 2, 3);
    const alpha = 0.25 + beat * 0.3; // ghostly — a hint at the edge of vision, not a HUD element

    this.fireCompassArrow
      .setPosition(cx + Math.cos(ang) * orbit, cy + Math.sin(ang) * orbit)
      .setRotation(ang)
      .setAlpha(alpha)
      .setVisible(true);
  }

  private hideFireCompass(): void {
    this.fireCompassArrow?.setVisible(false);
  }

  // The undead siege made visible: the spawn director's hidden danger meter (0..1) closes a
  // vignette over the screen edges. It creeps in as the dark wakes, BREATHES faster the higher
  // the danger, and past ~half meter its cold blue warms toward blood-red — so the player
  // feels the spawn cadence ramping long before the horde itself shows it. Near a fire the
  // meter drains (~2.5s) and the vignette melts away with it.
  private updateDangerVignette(delta: number): void {
    const w3 = this.world3d;
    if (!w3) return;
    const danger = this.spawnDirector?.danger ?? 0;
    if (danger < 0.02 || this.isDead || this.cutsceneActive) {
      w3.setDangerVignette(0, DANGER_VIGNETTE_COLD);
      this.dangerPulsePhase = 0;
      return;
    }

    this.dangerPulsePhase += delta * (0.0011 + danger * 0.0024);
    // Same sharpened-sine "thump" as the low-health heartbeat, so both danger signals breathe
    // with one visual language.
    const breath = Math.pow((Math.sin(this.dangerPulsePhase) + 1) / 2, 2);
    const alpha = Math.pow(danger, 1.35) * DANGER_VIGNETTE_MAX_ALPHA * (1 - 0.22 * (1 - breath));

    // Cold for most of the ramp; the last stretch bleeds toward red as the frenzy peaks.
    const heat = Phaser.Math.Clamp((danger - 0.55) / 0.45, 0, 1);
    const cold = Phaser.Display.Color.ValueToColor(DANGER_VIGNETTE_COLD);
    const blood = Phaser.Display.Color.ValueToColor(DANGER_VIGNETTE_BLOOD);
    const mix = Phaser.Display.Color.Interpolate.ColorWithColor(cold, blood, 100, heat * 100);

    w3.setDangerVignette(alpha, Phaser.Display.Color.GetColor(mix.r, mix.g, mix.b));
  }

  private startBreathing(): void {
    if (this.breathingTween?.isPlaying()) return;
    // A hurt-knockback shove is still easing the hero back to centre — let it finish;
    // breathing starts on a later frame, once the tween completes and clears itself.
    if (this.playerKnockTween) return;
    this.breathingTween?.destroy();
    // The billboard stands on its feet, so stretching it only grows it upward — no origin
    // pivot needed (the old Phaser sprite had to flip its origin and offset y to fake this).
    this.breathingTween = this.tweens.add({
      targets: this.hero,
      scaleY: 1.045,
      scaleX: 0.972,
      duration: 1100,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /**
   * Kill an in-flight hurt-knockback shove and re-pin the hero to screen centre. Called
   * from stopBreathing (every gameplay repin goes through it: dialog pan, death, bumps)
   * and from handleResize, both of which are about to reposition the hero anyway.
   */
  private cancelPlayerKnockback(): void {
    if (!this.playerKnockTween) return;
    this.playerKnockTween.stop();
    this.playerKnockTween = undefined;
    if (this.camera) {
      this.hero.x = this.camera.screenCenterX;
      this.hero.y = this.camera.screenCenterY;
    }
  }

  private stopBreathing(): void {
    // Runs before the early return: callers repin the hero, so a live shove must not
    // keep writing stale coordinates underneath them (e.g. during the dialog camera pan).
    this.cancelPlayerKnockback();
    if (!this.breathingTween) return;
    this.breathingTween.stop();
    this.breathingTween.destroy();
    this.breathingTween = undefined;
    // Back to rest: no squash. (O `sizePx` NAO se escreve aqui — ele sai da projecao da camera
    // uma vez por frame, no render3D. Era esta linha que "consertava" o tamanho do heroi no
    // primeiro passo, escondendo que ele nascia errado.)
    this.hero.scaleX = 1;
    this.hero.scaleY = 1;
  }

  private spawnFootprint(fromWorldX: number, fromWorldY: number, dx: number, dy: number): void {
    if (!this.camera) return;
    getSoundManager().playFootstep();

    // Alternate left / right foot using perpendicular offset
    const sign = this.footprintStep ? 1 : -1;
    this.footprintStep = !this.footprintStep;

    // Perpendicular to movement direction
    const perpX = -dy;
    const perpY = dx;
    const offset = this.tileSize * 0.17;
    const offX = perpX * offset * sign;
    const offY = perpY * offset * sign + this.tileSize * 0.28;

    const s = this.camera.tileToScreen(fromWorldX, fromWorldY, this.tileSize);
    const w = Math.max(3, Math.floor(this.tileSize * (dy !== 0 ? 0.30 : 0.16)));
    const h = Math.max(3, Math.floor(this.tileSize * (dx !== 0 ? 0.30 : 0.16)));

    const print = this.add
      .ellipse(s.x + offX, s.y + offY, w, h, 0x1a0e06, 0.75)
      .setDepth(SCENE_DEPTHS.decorBelowPlayer - 1);

    const entry = { obj: print, worldX: fromWorldX, worldY: fromWorldY, offX, offY };
    this.footprints.push(entry);

    this.tweens.add({
      targets: print,
      alpha: 0,
      duration: 700,
      ease: 'Power1.easeIn',
      onComplete: () => {
        print.destroy();
        const i = this.footprints.indexOf(entry);
        if (i >= 0) this.footprints.splice(i, 1);
      },
    });
  }

}
