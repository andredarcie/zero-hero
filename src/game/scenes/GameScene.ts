import Phaser from 'phaser';

import {
  ASSET_KEYS,
  CHOPPABLE_UPPER_FRAMES,
  CHUNK_COLUMNS,
  CHUNK_ROWS,
  DIGGABLE_GROUND_FRAMES,
  dialogBoxMetrics,
  FONT_FAMILY,
  GAMEPLAY_HERO_MAX_SIZE,
  GAMEPLAY_HERO_SCALE,
  HERO_FRAMES,
  ITEM_FRAMES,
  KEY_FRAMES,
  MIN_BOARD_TILE_SIZE,
  MOONFLOWER_LIGHT_TILES,
  NPC_VISUALS,
  SCENE_DEPTHS,
  TEXT_RESOLUTION,
  TORCH_BURN_MS,
  TREE_CHOP_STAGE_FRAMES,
  TREE_STICK_YIELD,
  TREE_TILE_STICK_CHANCE,
  SEA_TILE_FRAMES,
  SEED_PACK_KINDS,
  SOLID_UPPER_FRAMES,
  UNIT_PACK_KINDS,
  BLOOM_BLOWS,
} from '@/game/constants';
import type { AppMode } from '@/game/config';
import type { DialogScript, DialogVoice } from '@/game/dialogs/NpcDialogs';
import {
  clearGameDebugApi,
  registerGameDebugApi,
  registerSceneDebugHooks,
  type GameDebugApi,
} from '@/game/debug/debugHooks';
import { initProfiler, profiler } from '@/game/debug/Profiler';
import { getTimeOfDay, isNightTime, setTimeOfDay, setTimeScale, timeOfDayLabel } from '@/game/runtime/timeOfDay';
import { LootManager } from '@/game/entities/LootManager';
import { isNpcAsleep, NpcManager } from '@/game/entities/NpcManager';
import { ItemManager } from '@/game/entities/ItemManager';
import type { CollectedItem } from '@/game/entities/ItemManager';
import { MACHINE_ITEM_KINDS, isBagItem, type HeldItemKind } from '@/game/entities/ItemPickup';
import { CHOP_DRIVE_AT_MS, CHOP_IMPACT_MS, CHOP_TOTAL_MS, SwordSlash } from '@/game/runtime/SwordOrbit';
import { CampfireObject } from '@/game/objects/CampfireObject';
import { DryBushObject } from '@/game/objects/DryBushObject';
import { DryTreeObject } from '@/game/objects/DryTreeObject';
import { DryShrubObject } from '@/game/objects/DryShrubObject';
import { WaterObject } from '@/game/objects/WaterObject';
import { LockedDoorObject } from '@/game/objects/LockedDoorObject';
import { SwingGateObject } from '@/game/objects/SwingGateObject';
import { RockObject } from '@/game/objects/RockObject';
import { TallGrassObject } from '@/game/objects/TallGrassObject';
import { PlantSpotObject, type PlantableSeed } from '@/game/objects/PlantSpotObject';
import { ToolboxObject } from '@/game/objects/ToolboxObject';
import {
  catalogSteps, isCraftable, nextStep, recipeCost, recipeMaking, recipeStation,
  type CraftStation,
} from '@/game/objects/toolboxRecipes';
import {
  ToolboxOrderOverlay, type OrderCatalogView,
} from '@/game/runtime/ToolboxOrderOverlay';
import { MoonflowerObject } from '@/game/objects/MoonflowerObject';
import { FurnaceObject, type FurnaceWorldPort } from '@/game/objects/FurnaceObject';
import { AltarObject } from '@/game/objects/AltarObject';
import { hammerResult } from '@/game/objects/hammering';
import type { WorldProp } from '@/game/objects/WorldProp';
// O DEF de um prop (o registro de dados: tipo + tile + flags) contra o OBJETO de prop (a coisa
// viva com sprite e colisao) — dois tipos com o mesmo nome em modulos diferentes. Aqui os dois
// se encontram, porque o mundo infinito converte um no outro enquanto o heroi anda.
import type { PropDir } from '@/game/world/worldSchema';
import { t, tLines } from '@/game/i18n/i18n';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import {
  FX_DOT_TEXTURE, FX_PUFF_TEXTURE, FX_RING_TEXTURE,
  setCurrentWorld3D, World3D,
} from '@/game/render3d/World3D';
import { registerBucketTextures } from '@/game/render3d/bucketTexture';
import { registerCharcoalTexture } from '@/game/render3d/charcoalTexture';
import { registerPlacementTextures } from '@/game/render3d/placementTexture';
import {
  BASKET_TEXTURE, CAIRN_TEXTURE, EASEL_GREEN_TEXTURE, EASEL_GREY_TEXTURE, GROUND_CRACK_TEXTURE, HEART_TEXTURE,
  BUTTERFLY_TEXTURE, LEAF_TEXTURE,
  ROAST_STICK_DONE_TEXTURE, ROAST_STICK_TEXTURE, registerCozyTextures,
} from '@/game/render3d/cozyTextures';
import { HeroThought } from '@/game/runtime/HeroThought';
import { PlacementHints } from '@/game/runtime/PlacementHints';
import { DialogOverlay } from '@/game/runtime/DialogOverlay';
import { PauseMenu, PauseTouchButton, isTouchDevice } from '@/game/runtime/PauseMenu';
import { ItemGetOverlay, type ItemGetConfig } from '@/game/runtime/ItemGetOverlay';
import {
  createHeroView, heroFootY, resetHeroView, tickHeroView, type HeroView,
} from '@/game/runtime/HeroView';
import { Inventory } from '@/game/runtime/Inventory';
import { ActionButtons, ControlsHint } from '@/game/runtime/ActionButtons';
import { spriteDataUrl, type SubScreenView } from '@/game/runtime/SubScreen';
import { QuickBag, type QuickBagView } from '@/game/runtime/QuickBag';
import { PlayerMovementController } from '@/game/runtime/PlayerMovementController';
import { WorldCamera } from '@/game/runtime/WorldCamera';
import { getSoundManager } from '@/game/audio/SoundManager';
import { createBoardMetrics } from '@/game/shared/grid';
import { ChunkManager } from '@/game/world/ChunkManager';
import type { NpcKind, ScreenContent } from '@/game/world/ScreenContent';
import {
  getCampfires,
  getChunkContent,
  getChunkTerrain,
  getWorldBounds,
  getDryBushes,
  getDryTrees,
  getDryShrubs,
  getHeldItemPickups,
  getWaterTiles,
  getBridgeSpots,
  getPlantSpots,
  getToolboxes,
  getIronRocks,
  getFurnaces,
  getAltars,
  getMoonflowers,
  getLockedDoors,
  getSwingGates,
  getRocks,
  getTallGrass,
  getDialog,
  getDialogKinds,
  getDialogVoice,
  getPlayerStart,
  getHearths,
  getGardenGates,
  getWorldName,
} from '@/game/world/WorldData';
import {
  adventureState,
  consumeAdventureRespawn,
  saveAdventure,
  type AdventureGroundItem,
  type AdventureMachine,
} from '@/game/runtime/adventureState';
import {
  allQuestsDone,
  isQuestDone,
  questDeliveriesDue,
  questDialogFor,
  questSnapshot,
  recordQuestEvent,
  type QuestEvent,
} from '@/game/runtime/QuestLog';
import { NPC_QUESTS, questFor } from '@/game/dialogs/NpcQuests';
import { CatCompanion } from '@/game/entities/CatCompanion';
import { FireVisitor } from '@/game/entities/FireVisitor';

// The per-item 2D art (Phaser texture atlas keys): the swing arc, the overhead chop and the
// death elegy's back item all draw from here. The 3D twin is BACK_ITEM_VISUAL_3D below.
const ITEM_VISUAL_2D: Record<HeldItemKind, { texture: string; frame: number }> = {
  sword: { texture: ASSET_KEYS.swordItemIcon, frame: 0 },
  key: { texture: ASSET_KEYS.keyItem, frame: KEY_FRAMES.held },
  axe: { texture: ASSET_KEYS.axeIcon, frame: 0 },
  greatAxe: { texture: ASSET_KEYS.greatAxeIcon, frame: 0 },
  pickaxe: { texture: ASSET_KEYS.pickaxeIcon, frame: 0 },
  scythe: { texture: ASSET_KEYS.scytheIcon, frame: 0 },
  shovel: { texture: ASSET_KEYS.shovelIcon, frame: 0 },
  wood: { texture: ASSET_KEYS.woodIcon, frame: 0 },
  stone: { texture: ASSET_KEYS.rock, frame: 0 },
  iron: { texture: ASSET_KEYS.ironItem, frame: 0 },
  ore: { texture: ASSET_KEYS.oreItem, frame: 0 },
  bloom: { texture: ASSET_KEYS.bloomItem, frame: 0 },
  seeds: { texture: ASSET_KEYS.seedsItem, frame: 0 },
  bucket: { texture: 'bucket-icon', frame: 0 },
  bucketFull: { texture: 'bucket-full-icon', frame: 0 },
  charcoal: { texture: 'charcoal-item', frame: 0 },
  furnace: { texture: ASSET_KEYS.furnace, frame: 0 },
  altar: { texture: ASSET_KEYS.altar, frame: 0 },
  mushroom: { texture: ASSET_KEYS.mushroomItem, frame: 0 },
};

// The same per-item art resolved through the 3D texture registry (textures3d keys),
// for the back-item billboard that rides the hero in the world.
const BACK_ITEM_VISUAL_3D: Record<HeldItemKind, { texture: string; frame: number }> = {
  sword: { texture: 'sword-icon', frame: 0 },
  key: { texture: 'key-item', frame: KEY_FRAMES.held },
  axe: { texture: 'axe-icon', frame: 0 },
  greatAxe: { texture: 'great-axe-icon', frame: 0 },
  pickaxe: { texture: 'pickaxe-icon', frame: 0 },
  scythe: { texture: 'scythe-icon', frame: 0 },
  shovel: { texture: 'shovel-icon', frame: 0 },
  wood: { texture: 'wood-icon', frame: 0 },
  stone: { texture: 'rock', frame: 0 },
  iron: { texture: 'iron-item', frame: 0 },
  ore: { texture: 'ore-item', frame: 0 },
  bloom: { texture: 'bloom-item', frame: 0 },
  seeds: { texture: 'seeds-item', frame: 0 },
  bucket: { texture: 'bucket-icon', frame: 0 },
  bucketFull: { texture: 'bucket-full-icon', frame: 0 },
  charcoal: { texture: 'charcoal-item', frame: 0 },
  furnace: { texture: 'furnace', frame: 0 },
  altar: { texture: 'altar', frame: 0 },
  mushroom: { texture: 'mushroom-item', frame: 0 },
};


// The raised sprite for each item's first-time "item get" ceremony. The caption is NOT here: it
// comes from the locale (`items.get.<kind>`), the one place the game's text lives.
const ITEM_GET_CFG: Record<HeldItemKind, Omit<ItemGetConfig, 'label'>> = {
  sword: { texture: ASSET_KEYS.swordItem, frame: ITEM_FRAMES.swordIdle },
  key: { texture: ASSET_KEYS.keyItem, frame: KEY_FRAMES.held },
  axe: { texture: ASSET_KEYS.axeIcon, frame: 0 },
  greatAxe: { texture: ASSET_KEYS.greatAxeIcon, frame: 0 },
  pickaxe: { texture: ASSET_KEYS.pickaxeIcon, frame: 0 },
  scythe: { texture: ASSET_KEYS.scytheIcon, frame: 0 },
  shovel: { texture: ASSET_KEYS.shovelIcon, frame: 0 },
  wood: { texture: ASSET_KEYS.woodIcon, frame: 0 },
  stone: { texture: ASSET_KEYS.rock, frame: 0 },
  iron: { texture: ASSET_KEYS.ironItem, frame: 0 },
  seeds: { texture: ASSET_KEYS.seedsItem, frame: 0 },
  bucket: { texture: 'bucket-icon', frame: 0 },
  bucketFull: { texture: 'bucket-full-icon', frame: 0 },
  charcoal: { texture: 'charcoal-item', frame: 0 },
  ore: { texture: ASSET_KEYS.oreItem, frame: 0 },
  bloom: { texture: ASSET_KEYS.bloomItem, frame: 0 },
  furnace: { texture: ASSET_KEYS.furnace, frame: 0 },
  altar: { texture: ASSET_KEYS.altar, frame: 0 },
  mushroom: { texture: ASSET_KEYS.mushroomItem, frame: 0 },
};

// ── OS DOIS BOTOES ───────────────────────────────────────────────────────────
//
// Este jogo nao tem combate: nao ha inimigo, nao ha dano e nao ha morte. Os dois botoes sao
// gestos de MAO, nunca de briga:
//
//   Z  →  FALAR com quem esta na frente, abrir o catalogo da bancada, pousar a peca no altar,
//         acender e cuidar da fogueira do fim. Nada no Z saca lamina — a espada ficou fincada na
//         entrada do vale (ver playIntro).
//   X  →  o item escolhido na bolsa, no tile a frente: o machado na arvore seca, a picareta na
//         pedra, o balde no rio, a semente no buraco.
/** O X tem cadencia: usar uma ferramenta e um gesto, nao uma metralhadora. */
const USE_COOLDOWN_MS = 300;
/**
 * **O BOTAO NAO SE PERDE.** Um X apertado durante a cadencia do anterior fica guardado por esta
 * janela e sai no instante em que ela libera, em vez de ser descartado.
 */
const ACTION_BUFFER_MS = 130;

// How long a burning tile takes to set its neighbours alight. Slow enough that the fire is a
// thing you WATCH travel, fast enough that a fuse pays off inside one held thought. See
// GameScene.scheduleFireSpread.
const FIRE_SPREAD_MS = 850;

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
const TORCH_FLAME_FRAME_MS = 110;

// Chest height, in tiles: where the world's one-shot FX (flash, sparks, motes) hang. In 3D they
// live at the body's real height, so they are lit, occluded and blurred like anything else.
const FX_BODY_ELEV = 0.5;

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
// Os cacos de uma pedra de FERRO: a rampa quente do veio, com um unico cinza sobrando.
const ORE_CHIP_TINTS = [0x826841, 0x733e11, 0x99a0a8, 0x68380f] as const;

// The 4 grid moves a walking entity has (fire spread steps by these).
const CARDINAL_DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
];

// How many river tiles a single felled tree can bridge when it topples ("TIMBER!"). A wider
// river needs more than one tree.
const TIMBER_MAX_SPAN = 3;

// ── A ABERTURA E O FIM ───────────────────────────────────────────────────────
/** A hora em que a abertura e o fim acontecem: dez da noite, a hora dos vaga-lumes. */
const INTRO_CLOCK = 0.92;
/** Quantos tiles o cavaleiro anda pela estrada antes de parar. */
const INTRO_WALK_TILES = 3;
/** Um passo cansado: bem mais lento que o andar normal. */
const INTRO_STEP_MS = 520;
/**
 * A altura do CENTRO da espada fincada (o billboard e centrado e mede um tile): 0,22 deixa um
 * pouco de ponta dentro da terra, que o chao esconde.
 */
const SWORD_PLANTED_ELEV = 0.36;
/** De quantos tiles a leste o mago chega andando. */
const WIZARD_WALK_TILES = 5;
/**
 * Quanto o relogio acelera com o heroi sentado numa fogueira: 24x faz o dia (8 min) passar em uns
 * vinte segundos — rapido o bastante para VER o ceu andar, devagar o bastante para nao piscar.
 */
const REST_TIME_SCALE = 24;
/** De quantos tiles um vizinho atravessa o vale para sentar na fogueira com o heroi. */
const VISIT_RADIUS = 12;
/** Quantos vaga-lumes derivam em volta do heroi a noite. */
const FIREFLY_COUNT = 18;
/** Quantas borboletas passeiam em volta do heroi de dia (o turno dos vaga-lumes). */
const BUTTERFLY_COUNT = 5;
const BUTTERFLY_TINTS = [0xfff6dc, 0xffe27a, 0xbfe0ff, 0xffc9a8, 0xf3f0ff] as const;
/** As folhas que se soltam das arvores perto do heroi, de dia: no maximo tantas ao mesmo tempo. */
const LEAF_MAX = 6;
const LEAF_TINTS = [0x9cc46a, 0xd8c25a, 0xd08a44, 0xb7cf72] as const;
/** Quanto tempo a folha descansa no chao antes de sumir (e quanto leva sumindo). */
const LEAF_REST_MS = 2600;
const LEAF_FADE_MS = 900;
/** Quanto tempo os creditos levam para atravessar a tela. */
const CREDITS_SCROLL_MS = 26000;

// ── AS MARCAS DO VALE AJUDADO ─────────────────────────────────────────────────
// Uma por pedido: o que aparece (ou muda) ao lado do NPC quando ele fecha. `before` e a pose de
// antes, se a marca ja existe desde o comeco (o cavalete da Iris, com a tela cinza).
type QuestMarkDef = { dialog: string; npc: NpcKind; before?: string; after: string; keepFireLit?: boolean };
type QuestMarkState = {
  def: QuestMarkDef; tile: { x: number; y: number }; npcAt: { x: number; y: number }; done: boolean; bb?: Billboard3D;
};
const QUEST_MARKS: readonly QuestMarkDef[] = [
  { dialog: 'astronaut', npc: 'astronaut', after: CAIRN_TEXTURE },
  { dialog: 'radiationSuit', npc: 'radiationSuit', after: BASKET_TEXTURE },
  { dialog: 'painter', npc: 'painter', before: EASEL_GREY_TEXTURE, after: EASEL_GREEN_TEXTURE },
  // a lenha do Bram e a fogueira dele, que passa a ficar acesa dia e noite
  { dialog: 'businessMan', npc: 'businessMan', after: 'wood-item', keepFireLit: true },
];

// How long to hide the back item during a swing (a touch longer than SwordSlash's arc + fade,
// ~155 + 65ms) so the item never shows on the back and in the swing arc at the same time.
const SWING_HIDE_MS = 240;

// Where a swing PIVOTS on the hero, in tiles above the ground: a swing comes from the HANDS, and
// the hero is about one tile tall.
const SWING_HAND_ELEVATION = 0.55;
// Facing away (north), the pivot is also pulled a little TOWARD the camera, so the arc crosses
// the hero's body and reads as happening in FRONT of him.
const SWING_BACK_TURNED_NEAR = 0.3;
export class GameScene extends Phaser.Scene {
  public static readonly key = 'game';

  private camera?: WorldCamera;
  private chunkManager?: ChunkManager;
  private npcManager?: NpcManager;
  private lootManager?: LootManager;
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
  // Guttering flicker for a dying carried flame — a random-walk like lightFlicker, but its
  // amplitude grows as the fuel runs out, so the torchlight jitters harder near the end.
  private readonly torchGutter = { level: 1.0, velocity: 0 };
  // Cadence for the smoke wisps / embers trailing off a guttering torch.
  private torchEmberTimer = 0;
  // Pixel-flame billboard pinned on the torch's tip; its size tracks the remaining fuel.
  private torchFlameBb?: Billboard3D;
  private campfires: CampfireObject[] = [];
  /** Last clock state applied to all ambient campfires; prevents per-frame effect restarts. */
  private campfiresFollowNight = false;
  private dryBushes: DryBushObject[] = [];
  private lockedDoors: LockedDoorObject[] = [];
  private swingGates: SwingGateObject[] = [];
  private dryTrees: DryTreeObject[] = [];
  private dryShrubs: DryShrubObject[] = [];
  private rocks: RockObject[] = [];
  private tallGrasses: TallGrassObject[] = [];
  // Night-blooming flowers: shut (blocking) near a lit campfire, open (walkable) in the dark.
  private moonflowers: MoonflowerObject[] = [];
  // Canteiros: dug holes where seeds plant on step, mounds water on bump, grass regrows.
  private plantSpots: PlantSpotObject[] = [];
  // A bancada manual: abre o catalogo e fabrica com os materiais da mochila.
  private toolboxes: ToolboxObject[] = [];
  // O CATALOGO DA ENCOMENDA, e a bancada em que ele foi aberto. Ele congela o mundo como as
  // cartas de chunk (a bolsa e a unica tela deste jogo que roda com o mundo vivo).
  private orderOverlay?: ToolboxOrderOverlay;
  private orderBox?: ToolboxObject;
  /** As marcas de "a peça cai aqui" — o quadrado no chão e o keycap (ver PlacementHints). */
  private placementHints?: PlacementHints;
  /** O balao de PENSAMENTO do heroi: um icone, um instante. Ver HeroThought. */
  private heroThought?: HeroThought;
  // A CADEIA DO FERRO: o forno reduz minério com carvão; mão e altar malham a esponja.
  /**
   * Quantas marteladas a ESPONJA de cada tile ja levou. Ela e um item no chao, e itens no chao
   * nao tem estado proprio neste jogo — entao a contagem mora aqui, por tile, e some quando o
   * tile deixa de ter uma esponja. `BLOOM_BLOWS` é a fonte única para a mão e o altar.
   */
  private readonly bloomBlows = new Map<string, number>();
  private furnaces: FurnaceObject[] = [];
  private altars: AltarObject[] = [];
  private waterTiles: WaterObject[] = [];
  // O registro único de props: referencia os MESMOS arrays tipados acima, então destruição,
  // colisão (isSolidForEntities) e reset atravessam todos os props num loop só — um prop novo
  // é uma entrada aqui, não seis edições espalhadas. Consequência: fora do create/shutdown os
  // arrays só podem ser mutados IN PLACE (push/splice); reatribuir um deles órfão o registro.
  // `hazard` marca água e lava para os poucos sistemas que ignoram chão perigoso, como inimigos
  // voadores e projéteis. Para o herói, ambos bloqueiam até virarem chão por uma interação.
  private propRegistry: Array<{ list: WorldProp[]; hazard?: boolean }> = [];
  // The hero has no Phaser GameObject in the world: he is plain state (tweened like any
  // object) drawn by the 3D billboard alone. See HeroView.
  private readonly hero: HeroView = createHeroView();
  // The held item, slung diagonally on the hero's back like it's tucked in a satchel.
  // In-world it's a 3D billboard riding the hero billboard (so the body occludes it
  // properly); the 2D image only returns for the screen-space death elegy.
  private backItem?: Phaser.GameObjects.Image;
  private backItemBb?: Billboard3D;
  // Hides the back item while the same item is mid-swing, so it isn't shown in two places.
  private backItemSwingTimer?: Phaser.Time.TimerEvent;
  private movementController?: PlayerMovementController;
  private playerWorld = { worldX: 0, worldY: 0 };
  // A cadencia do X e o pedido guardado dele (ver USE_COOLDOWN_MS / ACTION_BUFFER_MS).
  private useCooldownMs = 0;
  private useBufferMs = 0;
  private tileSize = MIN_BOARD_TILE_SIZE;
  private dialogOpen = false;
  private dialogOverlay?: DialogOverlay;
  // Dialog variants the player already heard this run (kind:base / kind:locked / wizard:beat).
  // An NPC whose *current* variant isn't here yet shows a "!" marker above its head.
  private readonly seenDialogKeys = new Set<string>();
  // While a dialog is open the camera pans so the hero + NPC sit centered on the stage ABOVE
  // the speech box (a bar along the bottom). camShifting keeps the world frozen-but-reprojected
  // during the pan; dialogNpcWorld lets a resize re-apply the offset.
  private camShifting = false;
  private camShiftTween?: Phaser.Tweens.Tween;
  private dialogNpcWorld?: { worldX: number; worldY: number };
  private itemGetOpen = false;
  // True quando esta cena e a AVENTURA (overworld ou uma dungeon dela) — o unico modo com
  // memoria persistente (adventureState). Explorador e levels nunca ligam isto.
  private adventure = false;
  // Qual arquivo de mundo esta aberto ('world' ou 'under') — a chave da foto de itens no
  // chao dentro do save.
  private adventureScope = 'world';
  private cutsceneActive = false;
  // A ABERTURA e o FIM: a espada fincada na entrada do vale, o mago, o portao do jardim e a
  // fogueira que so o heroi acende (ver playIntro / openGardenGate / playRoastEnding).
  private introDone = false;
  private gateOpened = false;
  private hearthLit = false;
  private roasted = false;
  private plantedSword?: Billboard3D;
  private plantedSwordTile?: { x: number; y: number };
  private readonly questMarks: QuestMarkState[] = [];
  // Quem ja deu o "oi" (o pulinho quando o heroi chega perto) nesta sessao.
  private readonly greetedNpcs = new Set<string>();
  // Sentado numa fogueira (ver restAtFireAt): o tempo corre e o heroi descansa.
  private resting = false;
  private restKeyListener?: (event: KeyboardEvent) => void;
  /** A fogueira em que ele esta sentado (o gato se enrola do lado dele, de frente para ela). */
  private restFireTile?: { x: number; y: number };
  // A COMPANHIA: o gato que chega com o primeiro favor, e o vizinho que vem sentar na fogueira.
  private cat?: CatCompanion;
  private fireVisitor?: FireVisitor;
  // As fogueiras que um pedido deixou acesas para sempre (a do Bram): o relogio nao as apaga.
  private readonly keptLitFires = new Set<CampfireObject>();
  // A espada saiu das costas e esta nas maos (a abertura): positionBackItem a solta.
  private swordInHands = false;
  private letterbox?: [HTMLDivElement, HTMLDivElement];
  private vignette?: HTMLDivElement;
  private moonShaft?: Billboard3D;
  private groundCrack?: Billboard3D;
  private dollyBase?: { h: number; b: number };
  private wizardStandIn?: Billboard3D;
  private roasting = false;
  private roastStick?: Billboard3D;
  private fireflyLevel = 0;
  private ambienceClockMs = 0;
  private creditsRoll?: HTMLDivElement;
  private hearths: CampfireObject[] = [];
  private gardenGates: LockedDoorObject[] = [];
  // Os vaga-lumes da noite (ver updateFireflies): pontos sem luz que derivam em volta do heroi.
  private readonly fireflies: Array<{ bb: Billboard3D; ox: number; oy: number; phase: number; speed: number }> = [];
  // O turno do dia (ver updateDaytimeLife): borboletas e folhas caindo.
  private daylifeLevel = 0;
  private readonly butterflies: Array<{
    bb: Billboard3D; x: number; y: number; tx: number; ty: number; phase: number; size: number;
  }> = [];
  private readonly leaves: Array<{
    bb: Billboard3D; x: number; y: number; elev: number; t: number; sway: number; spin: number; landedMs: number;
  }> = [];
  private leafClockMs = 0;
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
  // Center chunk of the streamed window; NaN forces the first stream.
  private streamCenter = { cx: NaN, cy: NaN };
  private debugApi?: GameDebugApi;
  private clearDebugHooks?: () => void;



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

    // A AVENTURA TEM MEMORIA. O jogo e UM mundo aberto, e ele hidrata do retrato em
    // adventureState, que sobrevive ao scene.restart() por ser estado de modulo e ao browser por
    // viver no localStorage.
    //
    // Quem fica de fora e o PLAYTEST DO EDITOR (`appMode === 'editor'`): ali o mundo em memoria
    // pode estar sujo de edicao nao salva, e deixa-lo escrever no save contaminaria a partida de
    // quem so foi testar um tile.
    this.adventure = this.registry.get('appMode') === 'game';
    // Arvores derrubadas voltam ao chao ANTES do World3D assar o terreno (o construtor le os
    // chunks): o corte e um diff por cima do world.json, que volta limpo do disco a cada boot.
    if (this.adventure) {
      this.applyFelledTreeDiff();
      this.applyDugSpotDiff();
    }

    let start = getPlayerStart();
    // "Continue de onde parou" e um PEDIDO (o Continue do titulo), nunca o padrao.
    if (this.adventure && consumeAdventureRespawn() && adventureState().respawn) {
      start = { ...adventureState().respawn! };
    }
    const { worldX: startWorldX, worldY: startWorldY } = start;

    this.useCooldownMs = 0;
    this.useBufferMs = 0;
    this.tweens.timeScale = 1;
    this.playerWorld = { worldX: startWorldX, worldY: startWorldY };
    this.streamCenter = { cx: NaN, cy: NaN };
    // O heroi e um campo `readonly` e o Phaser REUSA esta instancia de cena no restart: sem
    // isto, o que a cena anterior escreveu nele chega inteiro na seguinte.
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
    registerCozyTextures(this);
    // The 3D canvas is position:fixed (z-index 0), which paints ABOVE static content.
    // Promote the Phaser canvas into its own stacking level so the whole 2D side —
    // lighting overlays, FX, canvas UI — draws over the 3D world, not under it.
    this.game.canvas.style.position = 'relative';
    this.game.canvas.style.zIndex = '1';
    window.hd3d = this.world3d.params;
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.render3D, this);

    // Decode the SFX + music loops. A aventura tem trilha ("Little Hearth") sobre os leitos do vale,
    // e ESTA E A UNICA VEZ EM QUE A TRILHA E ESCOLHIDA: quem baixa a musica sao as telas que a
    // tomam — dialogo, item-get, cutscene —, e cada uma a devolve com fadeMusicIn ao fechar.
    getSoundManager().preload();
    if (this.adventure) getSoundManager().startMusic('overworld', 2400);
    else getSoundManager().stopMusic(1800);
    getSoundManager().startAmbience();

    // Phaser does not auto-call shutdown(); wire it so scene.restart() cleans up
    // listeners/textures instead of leaking them across runs.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    this.chunkManager = new ChunkManager();
    const getContent = (cx: number, cy: number): ScreenContent => getChunkContent(cx, cy);
    this.cutsceneActive = false;
    this.cutsceneFireLight = undefined;
    this.cutsceneHeroLight = 1;
    this.seenDialogKeys.clear();
    this.introDone = false;
    this.gateOpened = false;
    this.hearthLit = false;
    this.roasted = false;
    if (this.adventure) {
      // A historia e os dialogos ouvidos voltam do save.
      const st = adventureState();
      this.introDone = st.introSeen;
      // O ultimo pedido grava ao ser ENTREGUE, mas o portao so abre quando o obrigado fecha. Um
      // jogo fechado nesse meio voltava com tudo cumprido e o jardim trancado para sempre.
      this.gateOpened = st.gateOpened || allQuestsDone();
      this.hearthLit = st.hearthLit;
      this.roasted = st.endingSeen;
      st.seenDialogKeys.forEach((k) => this.seenDialogKeys.add(k));
    } else {
      // O playtest do editor nao tem abertura: quem aperta P quer testar o tile, nao a historia.
      this.introDone = true;
    }
    this.npcManager = new NpcManager(this, getContent, (kind, wx, wy, dialog) => {
      const key = this.dialogKeyFor(kind, wx, wy, dialog);
      return key !== null && !this.seenDialogKeys.has(key);
    }, (wx, wy) => {
      // O keycap "Z" só existe quando falar é o que o botão FARIA agora: mundo correndo e o NPC
      // exatamente no tile encarado.
      if (!this.canAct() || !this.movementController) return false;
      const front = this.facingTile();
      return front.x === wx && front.y === wy;
    });
    // O mago so entra em cena DURANTE a abertura: ate la o lugar dele na estrada fica vazio.
    if (!this.introDone) this.npcManager.setKindHidden('wizard', true);
    this.lootManager = new LootManager(this);
    this.itemManager = new ItemManager(this);
    // O chao tambem lembra: a foto salva dos itens substitui a lista autorada — um item largado
    // fica onde ficou, um cogumelo colhido nao renasce. Sem foto, vale o autorado.
    this.adventureScope = 'world';
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
    // One reusable swing animator, alive for the whole scene: the tools swing through it
    // (SwordSlash.slash accepts a custom item sprite).
    this.swordSlash = new SwordSlash(this);
    this.camera = new WorldCamera(startWorldX, startWorldY, 0, 0);
    this.camera.world3d = this.world3d;
    this.world3d.follow(startWorldX, startWorldY, true);

    // The hero's contact blob rides the billboard like every other actor's; zBias peeks the
    // shadow past his boots.
    this.heroBillboard = this.world3d.addBillboard('hero', HERO_FRAMES.idleDown, {
      castGroundShadow: true,
      groundShadow: { rx: 0.34, rz: 0.32, alpha: 0.34, zBias: 0.1 },
    })
      .setPosition(startWorldX, startWorldY)
      .setDisplaySize(1, 1);

    // The 2D back-item image idles hidden (the in-world carried item is a billboard — see
    // updateBackItem).
    this.backItem = this.add
      .image(0, 0, ASSET_KEYS.swordItemIcon)
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(SCENE_DEPTHS.player - 1);

    this.movementController = new PlayerMovementController(
      this,
      this.hero,
      this.camera,
      (wx, wy) => this.isSolidForEntities(wx, wy),
      // Fires once per tile ENTERED (never per frame): decor rustle + walk-on interactions.
      (wx, wy, dx, dy) => {
        this.world3d?.rustleDecor(wx, wy);
        this.handleTileEntered(wx, wy, dx, dy);
      },
      (wx, wy) => this.handlePlayerBump(wx, wy),
    );

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.handleResize({ width: this.scale.width, height: this.scale.height });

    // All world props are authored in world.json; their collision is resolved at runtime.
    const campfireDefs = getCampfires();
    // A tela em que se nasce ja conta como pisada — o mapa nunca abre 100% escuro.
    if (this.adventure) {
      adventureState().visitedChunks.add(
        `${Math.floor(startWorldX / CHUNK_COLUMNS)},${Math.floor(startWorldY / CHUNK_ROWS)}`,
      );
    }
    this.campfiresFollowNight = isNightTime();
    this.campfires = campfireDefs.map((c) => new CampfireObject(
      this, c.worldX, c.worldY, this.campfiresFollowNight,
    ));
    // A FOGUEIRA DO FIM nao segue o relogio: ela nasce apagada e so o heroi a acende, dentro do
    // jardim. Ela mora na MESMA classe das outras fogueiras (arte, luz, fumaca), so que fora da
    // lista que o dia acende e apaga sozinho.
    this.hearths = getHearths().map((h) => new CampfireObject(this, h.worldX, h.worldY, this.hearthLit));
    // O PORTAO DO JARDIM e a porta trancada sem chave: quem a abre e o ultimo pedido fechado.
    this.gardenGates = getGardenGates().map((g) => {
      const gate = new LockedDoorObject(this, g.worldX, g.worldY);
      if (this.gateOpened) gate.unlock();
      return gate;
    });
    this.dryBushes = getDryBushes().map((b) => {
      const bush = new DryBushObject(this, b.worldX, b.worldY);
      // O fogo PRODUZINDO: um arbusto que terminou de arder deixa carvao (comida da tocha).
      bush.onBurnedOut = () => this.dropCharcoalFromBush(bush.worldX, bush.worldY);
      return bush;
    });
    this.lockedDoors = getLockedDoors().map((d) => new LockedDoorObject(this, d.worldX, d.worldY, d.floodgate === true));
    this.swingGates = getSwingGates().map((g) => new SwingGateObject(this, g.worldX, g.worldY));
    this.dryTrees = getDryTrees().map((t) => new DryTreeObject(this, t.worldX, t.worldY));
    this.dryShrubs = getDryShrubs().map((s) => new DryShrubObject(this, s.worldX, s.worldY));
    // As duas pedras vivem no MESMO array de proposito: colisao, picareta e o registro de props ja
    // atravessam `rocks`, e a unica coisa que a de minerio muda e a arte e o que ela deixa cair.
    this.rocks = [
      ...getRocks().map((r) => new RockObject(this, r.worldX, r.worldY)),
      ...getIronRocks().map((r) => new RockObject(this, r.worldX, r.worldY, true)),
    ];
    this.tallGrasses = getTallGrass().map((g) => new TallGrassObject(this, g.worldX, g.worldY));
    this.moonflowers = getMoonflowers().map((m) => new MoonflowerObject(this, m.worldX, m.worldY));
    this.plantSpots = getPlantSpots().map((s) => new PlantSpotObject(this, s.worldX, s.worldY));
    // Os buracos que a PÁ cavou voltam do save (diff sobre os autorados, o padrão felledTrees).
    if (this.adventure) {
      for (const key of adventureState().dugSpots) {
        const [wx, wy] = key.split(',').map(Number);
        if (!Number.isFinite(wx) || !Number.isFinite(wy)) continue;
        if (this.plantSpots.some((s) => s.worldX === wx && s.worldY === wy)) continue;
        // Um mundo re-autorado pode ter posto parede onde havia terra: o save cede ao mundo.
        if (this.chunkManager?.isCellBlocked(wx, wy)) continue;
        this.plantSpots.push(new PlantSpotObject(this, wx, wy));
      }
    }
    // Mesma regra de default de toda peca direcional (`dir ?? 1`): um JSON antigo nunca vira um
    // prop quebrado, e leste e a direcao que o editor oferece primeiro.
    this.toolboxes = getToolboxes().map(
      (t) => new ToolboxObject(this, t.worldX, t.worldY, t.dir ?? 1),
    );
    this.furnaces = getFurnaces().map(
      (f) => new FurnaceObject(this, f.worldX, f.worldY, f.dir ?? 1),
    );
    this.altars = getAltars().map((a) => new AltarObject(this, a.worldX, a.worldY));
    // O que o jogador construiu volta do save AQUI — depois dos autorados, para que uma peca
    // autorada num tile sempre ganhe do diff (o save cede ao mundo).
    this.restoreBuiltMachines();
    // Both `water` and `bridgeSpot` are river tiles (WaterObjects render animated water). A
    // plain `water` tile is an impassable river; a `bridgeSpot` is a river tile you CAN bridge.
    this.waterTiles = [
      ...getWaterTiles().map((w) => new WaterObject(this, w.worldX, w.worldY, false)),
      ...getBridgeSpots().map((b) => {
        const w = new WaterObject(this, b.worldX, b.worldY, true);
        // A scene-level burst of pale light the moment the last board is nailed home.
        w.onBuilt = () => this.softWash(0xd2be96, 0.16, 700);
        return w;
      }),
    ];
    this.propRegistry = [
      { list: this.campfires },
      { list: this.hearths },
      { list: this.gardenGates },
      { list: this.dryBushes },
      { list: this.lockedDoors },
      { list: this.swingGates },
      { list: this.dryTrees },
      { list: this.dryShrubs },
      { list: this.rocks },
      { list: this.tallGrasses },
      { list: this.moonflowers },
      { list: this.plantSpots },
      { list: this.toolboxes },
      { list: this.furnaces },
      { list: this.altars },
      // A agua continua no registro como hazard: o heroi so passa depois que o tile deixou de
      // bloquear (uma ponte).
      { list: this.waterTiles, hazard: true },
    ];
    // A ESPADA FINCADA. Ela e o primeiro gesto da historia e fica onde o heroi a deixou, para
    // sempre: na abertura ela desce das costas para o chao (playIntro); quem continua uma partida
    // a encontra ja de pe ali.
    if (this.introDone && this.adventure) {
      const ps = getPlayerStart();
      this.plantSwordAt(ps.worldX, ps.worldY - INTRO_WALK_TILES + 1);
      this.crackGroundAt(ps.worldX, ps.worldY - INTRO_WALK_TILES + 1, false);
    }

    this.keptLitFires.clear();
    this.buildQuestMarks();
    this.streamChunks(true);

    // The world is fully built, so compile every shader now rather than lazily, one hitch at
    // a time, on the frames each material is first drawn.
    this.world3d.prewarmShaders();
    initProfiler(this.world3d);
    this.events.on(Phaser.Scenes.Events.PRE_UPDATE, profiler.frameStart, profiler);

    this.registerDebugApi();

    // Live playtest launched from the world editor: ESC stops the run and wakes the
    // sleeping EditorScene, with the in-memory (possibly unsaved) world still loaded.
    // In the real game ESC pauses instead (plus a discreet touch button on mobile).
    if ((this.registry.get('appMode') as AppMode | undefined) === 'editor') {
      this.enableEditorReturn();
    } else {
      // O ESC TEM UM DONO SÓ. Com a bolsa aberta ele a fecha e para por aí.
      this.input.keyboard?.on('keydown-ESC', () => {
        if (this.quickBag?.isOpen) { this.quickBag.close(); return; }
        // Sentado na fogueira, o ESC so levanta: ele levantava E abria a pausa no mesmo toque.
        if (this.resting) { this.standUp(); return; }
        this.openPauseMenu();
      });
      if (isTouchDevice()) {
        this.pauseTouchButton = new PauseTouchButton(() => this.openPauseMenu());
      }
    }

    this.placementHints = new PlacementHints(this);
    this.heroThought = new HeroThought(this, ASSET_KEYS.thoughtTorch);
    this.installActionInput();

    // O GATO de quem ja fez algum favor volta junto com a partida.
    if (Object.values(NPC_QUESTS).some(isQuestDone)) this.ensureCat(false);

    // A ABERTURA: a primeira vez no vale e uma cena, nao um controle. Ela toca uma vez por partida
    // (o save lembra), e continuar uma partida pula direto para o heroi parado na estrada.
    if (!this.introDone) void this.playIntro();
  }

  /** Espera em ms presa ao relogio da CENA — pausar o jogo pausa a sequencia junto. */
  private wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => { this.time.delayedCall(ms, resolve); });
  }

  private openPauseMenu(): void {
    // Never pause over another modal state — their overlays own ESC/scrim already, and the
    // dialog camera pan must not be frozen midway.
    if (this.pauseMenu || this.dialogOpen || this.camShifting
      || this.itemGetOpen || this.cutsceneActive) return;
    // A bolsa e a pausa nunca convivem: uma congela o mundo e a outra existe justamente por nao
    // congelar. Quem abre a pausa fecha a bolsa (sem equipar nada — fechar nao e confirmar).
    this.quickBag?.close();
    this.quickBag?.setButtonVisible(false);
    this.pauseTouchButton?.setVisible(false);
    this.actionButtons?.setVisible(false);
    // scene.get('title') is undefined in the editor playtest config; without it "quit" would
    // have nowhere to go, so the entry is hidden.
    const canQuit = Boolean(this.scene.get('title'));
    this.pauseMenu = new PauseMenu(this, {
      onResume: () => this.closePauseMenu(),
      onQuit: canQuit
        ? () => {
          this.closePauseMenu();
          getSoundManager().stopMusic();
          getSoundManager().stopAmbience();
          // Sair pelo menu GUARDA: o retrato fecha aqui e o titulo passa a oferecer Continue.
          this.persistAdventure();
          this.scene.start('title');
        }
        : undefined,
      // A SUBTELA. Ela e lida de novo a cada desenho do painel (nunca um retrato tirado ao
      // abrir), entao escolher um item tem um caminho so.
      readSubScreen: () => this.subScreenView(),
      onSelectItem: (kind) => { this.selectItem(kind as HeldItemKind); },
    });
    this.useBufferMs = 0;
    this.scene.pause();
  }

  /**
   * O que a subtela mostra: a mochila com a ARTE DO JOGO (os proprios frames do Phaser virados em
   * data URL). Um inventario com desenho proprio seria uma segunda gramatica para os mesmos
   * objetos — o jogador tem de reconhecer na mochila o que viu no chao.
   */
  private subScreenView(): SubScreenView {
    const row = ({ kind, count }: { kind: HeldItemKind; count: number }) => {
      const visual = ITEM_VISUAL_2D[kind];
      return {
        kind,
        count,
        icon: spriteDataUrl(this, visual.texture, visual.frame),
        label: t(`items.name.${kind}`),
      };
    };
    return {
      title: t('subscreen.title'),
      emptyLabel: t('subscreen.empty'),
      items: this.inventory.bag().map(row),
      // A mesma separação da bolsa (uma resposta só para "o que tem gesto?"): a grade escolhe, os
      // contadores apenas informam.
      materials: this.inventory.materials().map(row),
      selected: this.heldItem,
      map: this.subScreenMap(),
      // A PAGINA DE PLANOS e o MESMO catalogo da bancada (`orderCatalogView`), so que em leitura.
      plans: this.toolboxes.length
        ? { title: t('subscreen.plansTitle'), rows: this.orderCatalogView().entries }
        : undefined,
    };
  }

  /**
   * O mapa da subtela: um quadrado por chunk, fog of war vindo dos chunks PISADOS (o save), e
   * so as marcas que o heroi ja viu — fogueiras em tela visitada, mais ele mesmo.
   */
  private subScreenMap(): SubScreenView['map'] {
    if (!this.adventure) return undefined;
    const bounds = getWorldBounds();
    const st = adventureState();
    const chunkOf = (wx: number, wy: number): { cx: number; cy: number } => (
      { cx: Math.floor(wx / CHUNK_COLUMNS), cy: Math.floor(wy / CHUNK_ROWS) }
    );
    const visited = new Set(st.visitedChunks);
    const marks: NonNullable<SubScreenView['map']>['marks'] = [];
    for (const cf of [...this.campfires, ...this.hearths]) {
      const { cx, cy } = chunkOf(cf.worldX, cf.worldY);
      if (visited.has(`${cx},${cy}`)) marks.push({ cx, cy, kind: cf.isLit ? 'fireLit' : 'fireDead' });
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
    this.hero.sizePx = this.tileSize;

    // The walk cycle ticks here (POST_UPDATE runs even when update() early-returns).
    tickHeroView(this.hero, delta);
    this.syncHeroBillboard();
    // Os vaga-lumes vivem aqui e nao no update: eles sao a moldura das cutscenes (a abertura e o
    // fim), e o update fica parado justamente nelas.
    this.updateFireflies(delta);
    this.updateDaytimeLife(delta);
    this.updateAmbienceMix(delta);

    // A vista do heroi + a tocha na mao dele, as duas montadas no corpo DESENHADO.
    const hb = this.heroBillboard;
    if (hb) {
      const f = this.movementController?.facing ?? { dx: 0, dy: 1 };
      w3.setHeroSight(hb.x, hb.y, f.dx, f.dy, this.cutsceneHeroLight);
      const torchOn = this.isTorchLit && !this.cutsceneActive;
      const fuel = TORCH_MIN_LIGHT_FRAC + (1 - TORCH_MIN_LIGHT_FRAC) * this.torchFuelFrac;
      w3.setTorchLight(hb.x, hb.y, torchOn ? fuel * this.torchGutter.level : 0);
    }

    w3.render(delta);
    profiler.end('render3d');
    profiler.gauge('tweens', this.tweens.getTweens().length);
    profiler.gauge('displayList', this.children.length);
    profiler.frameEnd();
  }

  // Draw the hero's state onto its 3D billboard: position from the screen-centre pin
  // + any lunge offset, size/frame/flip/tint verbatim.
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
    // The walk bob is elevation, not a shift of y (y is the ground plane here). `lift` is what a
    // cut-scene owns; the bob rides on top of it.
    b.setElevation(h.bobLift + h.lift);
    b.setDisplaySize(
      Math.max(0.05, (h.sizePx * h.scaleX) / ts),
      Math.max(0.05, (h.sizePx * h.scaleY) / ts),
    );
    b.setTexture(ASSET_KEYS.hero, h.frame);
    b.setFlipX(h.flipX);
    b.setAlpha(h.alpha);
    b.setAngle(h.spin);

    // The carried item rides the just-synced hero position.
    this.positionBackItem();

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
  // inspect live state and pop the exact UI it wants to validate.
  private registerDebugApi(): void {
    this.debugApi = {
      getState: () => ({
        scene: GameScene.key,
        timeOfDay: { phase: getTimeOfDay(), clock: timeOfDayLabel() },
        player: { worldX: this.playerWorld.worldX, worldY: this.playerWorld.worldY },
        heldOnFire: this.heldOnFire,
        heldItem: this.heldItem,
        inventory: this.inventory.list(),
        bagOpen: this.quickBag?.isOpen === true,
        orderOpen: this.orderOverlay !== undefined,
        facing: { ...(this.movementController?.facing ?? { dx: 0, dy: 1 }) },
        groundItems: this.itemManager?.snapshot() ?? [],
        toolboxes: this.toolboxes.map((box) => ({
          worldX: box.worldX,
          worldY: box.worldY,
          dir: box.dir,
          phase: box.currentPhase,
          frame: box.currentFrame,
          busy: box.isBusy,
        })),
        thought: this.heroThought?.visibleIcon ?? null,
        furnaces: this.furnaces.map((f) => ({
          worldX: f.worldX,
          worldY: f.worldY,
          dir: f.dir,
          output: f.outputTile,
          phase: f.currentPhase,
          busy: f.isBusy,
          smelted: f.smeltCount,
        })),
        altars: this.altars.map((a) => ({
          worldX: a.worldX,
          worldY: a.worldY,
          holding: a.carrying,
          blows: a.blowsLanded,
          forged: a.forgeCount,
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
        plantSpots: this.plantSpots.map((spot) => ({
          worldX: spot.worldX,
          worldY: spot.worldY,
          state: spot.currentState,
        })),
        heroLift: this.hero.lift,
        heroScale: this.hero.scaleX,
        levelName: getWorldName(),
        dialogOpen: this.dialogOpen,
        itemGetOpen: this.itemGetOpen,
        cutsceneActive: this.cutsceneActive,
        resting: this.resting,
        companions: {
          cat: this.cat ? { ...this.cat.position } : null,
          visitor: this.fireVisitor ? { kind: this.fireVisitor.kind, seated: this.fireVisitor.isSeated } : null,
        },
        litFires: this.campfires.filter((cf) => cf.isLit).length,
        ending: { gateOpen: this.gateOpened, hearthLit: this.hearthLit, roasted: this.roasted },
        introDone: this.introDone,
        // A trilha que o jogo esta PEDINDO (null = vento/silencio). Ela e escolhida uma vez, no
        // create — e por aqui que um cenario cobra isso.
        music: getSoundManager().requestedTrack,
        activeScreen: {
          cx: Math.floor(this.playerWorld.worldX / CHUNK_COLUMNS),
          cy: Math.floor(this.playerWorld.worldY / CHUNK_ROWS),
        },
      }),
      openDialog: (kind = 'blackCat') => {
        if (this.dialogOpen) return false;
        this.openNpcDialog(kind);
        return true;
      },
      closeDialog: () => {
        this.dialogOverlay?.destroy();
        this.dialogOverlay = undefined;
        this.dialogOpen = false;
        this.endDialogCameraShift();
      },
      listNpcKinds: () => getDialogKinds(),
      // AS MISSÕES NÃO TÊM TELA — então o caderno delas precisa ao menos ser LEGÍVEL daqui, ou
      // seria um sistema que ninguém consegue provar que funciona (ver runtime/QuestLog).
      quests: () => questSnapshot(),
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
    this.heroBillboard?.destroy();
    this.heroBillboard = undefined;
    this.plantedSword?.destroy();
    this.plantedSword = undefined;
    this.plantedSwordTile = undefined;
    for (const mark of this.questMarks) mark.bb?.destroy();
    this.questMarks.length = 0;
    this.greetedNpcs.clear();
    if (this.restKeyListener) window.removeEventListener('keydown', this.restKeyListener);
    this.restKeyListener = undefined;
    this.resting = false;
    this.restFireTile = undefined;
    setTimeScale(1);
    this.cat?.destroy();
    this.cat = undefined;
    this.fireVisitor?.destroy();
    this.fireVisitor = undefined;
    this.keptLitFires.clear();
    this.wizardStandIn?.destroy();
    this.wizardStandIn = undefined;
    this.roastStick?.destroy();
    this.roastStick = undefined;
    this.letterbox?.forEach((bar) => bar.remove());
    this.letterbox = undefined;
    this.vignette?.remove();
    this.vignette = undefined;
    this.moonShaft?.destroy();
    this.moonShaft = undefined;
    this.groundCrack?.destroy();
    this.groundCrack = undefined;
    this.dollyBase = undefined;
    this.swordInHands = false;
    this.roasting = false;
    this.fireflyLevel = 0;
    for (const fly of this.fireflies) fly.bb.destroy();
    this.fireflies.length = 0;
    this.daylifeLevel = 0;
    for (const b of this.butterflies) b.bb.destroy();
    this.butterflies.length = 0;
    for (const l of this.leaves) l.bb.destroy();
    this.leaves.length = 0;
    this.creditsRoll?.remove();
    this.creditsRoll = undefined;
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
    this.npcManager?.destroy();
    this.dialogOverlay?.destroy();
    this.dialogOverlay = undefined;
    this.itemGetOverlay?.destroy();
    this.itemGetOverlay = undefined;
    this.itemGetOpen = false;
    this.pauseMenu?.destroy();
    this.pauseMenu = undefined;
    this.pauseTouchButton?.destroy();
    this.pauseTouchButton = undefined;
    this.actionButtons?.destroy();
    this.actionButtons = undefined;
    this.quickBag?.destroy();
    this.quickBag = undefined;
    this.controlsHint?.destroy();
    this.controlsHint = undefined;
    this.orderOverlay?.destroy();
    this.orderOverlay = undefined;
    this.orderBox = undefined;
    this.lootManager?.destroy();
    this.itemManager?.destroy();
    this.placementHints?.destroy();
    this.placementHints = undefined;
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
    this.backItemSwingTimer?.remove();
    this.backItemSwingTimer = undefined;
    this.backItem?.destroy();
    this.backItem = undefined;
    this.backItemBb?.destroy();
    this.backItemBb = undefined;
    this.breathingTween?.destroy();
    this.breathingTween = undefined;
    this.footprints.length = 0;
    this.torchFlameBb?.destroy();
    this.torchFlameBb = undefined;
    this.torchGutter.level = 1.0;
    this.torchGutter.velocity = 0;
    this.torchEmberTimer = 0;
    this.swordSlash = undefined;
    this.useBufferMs = 0;
    if (this.tweens) this.tweens.timeScale = 1;
  }

  public update(_time: number, delta: number): void {
    // A marca some junto: um quadrado branco prometendo um gesto durante um dialogo e a mesma
    // mentira que o balao de dica era. `syncPlacementHints` a reacende logo abaixo se o jogo
    // estiver mesmo correndo.
    this.placementHints?.clear();
    this.heroThought?.clear();

    // The camera pan (open or close) drives its own reprojection from the tween, so keep the
    // world frozen here until it finishes — otherwise gameplay would fight the pan.
    if (this.dialogOpen || this.camShifting) {
      this.dialogOverlay?.update();
      return;
    }

    // The item-get and the cut-scenes freeze gameplay; only their own tweens run.
    if (this.itemGetOpen || this.cutsceneActive) return;
    // SENTADO NA FOGUEIRA: o mundo anda (o relogio acelerado, as fogueiras seguindo o ceu), o
    // heroi nao. Qualquer tecla o levanta (ver restAtFireAt).
    if (this.resting) {
      this.syncCampfiresToClock();
      if (this.npcManager && this.camera) this.npcManager.render(this.tileSize, this.camera);
      this.updateCat(delta);
      this.renderProps();
      return;
    }
    // O CATALOGO de fabricacao congela igual.
    if (this.orderOverlay) return;

    if (!this.movementController || !this.chunkManager || !this.camera) {
      return;
    }

    // A cadencia do X. Ele NAO e lido aqui: chega por evento de teclado (e pelo circulo no
    // toque), porque um `JustDown` lido dentro do update morre em toda porta que este metodo tem
    // para sair mais cedo.
    this.useCooldownMs = Math.max(0, this.useCooldownMs - delta);
    this.spendActionBuffers(delta);
    const prevWorldX = this.playerWorld.worldX;
    const prevWorldY = this.playerWorld.worldY;
    this.playerWorld = this.movementController.update(
      this.playerWorld.worldX,
      this.playerWorld.worldY,
      delta,
    );
    const stepDx = this.playerWorld.worldX - prevWorldX;
    const stepDy = this.playerWorld.worldY - prevWorldY;

    this.syncCampfiresToClock();

    if (stepDx !== 0 || stepDy !== 0) {
      this.lastStepTime = this.time.now;
      this.stopBreathing();
      this.spawnFootprint(prevWorldX, prevWorldY, stepDx, stepDy);
    } else if (!this.dialogOpen && !this.camShifting && this.time.now - this.lastStepTime > 180) {
      this.startBreathing();
    }
    this.streamChunks();
    this.updateFootprints();
    this.heroThought?.tick(delta);

    // Burn the carried flame down; snuff it when the fuel runs out. Re-igniting at a lit
    // campfire refills it.
    if (this.heldOnFire) {
      this.torchFuelMs -= delta;
      if (this.torchFuelMs <= 0) this.extinguishTorch();
    }
    this.updateTorchFx(delta);

    if (this.lootManager && this.camera) {
      // O drop apanhado some no HERÓI: o que se guarda voa pro corpo, porque a mochila não tem
      // posição na tela.
      this.lootManager.update(
        this.playerWorld.worldX,
        this.playerWorld.worldY,
        { x: this.camera.screenCenterX, y: this.camera.screenCenterY },
      );
      this.lootManager.render(this.tileSize, this.camera);
    }

    if (this.itemManager) {
      // O combustivel de um graveto aceso no chao queima no mesmo relogio do da mao.
      this.itemManager.tickFires(delta);
      // CARVAO sob a tocha ACESA: consome em vez de guardar — o passo COME o carvao e a chama
      // volta ao combustivel cheio.
      if (this.isTorchLit
        && this.itemManager.kindAt(this.playerWorld.worldX, this.playerWorld.worldY) === 'charcoal') {
        this.itemManager.takeAt(this.playerWorld.worldX, this.playerWorld.worldY);
        this.refuelTorch();
        getSoundManager().playIgnite();
        this.hero.tint = 0xff6600;
        this.time.delayedCall(250, () => { this.hero.tint = null; });
        this.persistAdventure(); // o carvao comido saiu do chao
      }
      // PISAR APANHA. TUDO. `stash` e nunca `add`: guardar NÃO troca o item da mão.
      const { worldX: px, worldY: py } = this.playerWorld;
      const underfoot = this.itemManager.kindAt(px, py);
      if (underfoot) this.collectUnderfoot(px, py);
      this.itemManager.render(this.tileSize, this.camera!);
    }

    // Felled trees grow back after a while (renewable gravetos = no soft-lock). The clock only
    // ticks while the tile is clear — a dropped item (the graveto) on the stump pauses it.
    for (const tree of this.dryTrees) {
      if (tree.updateRegrow(delta, this.isTileClearForRegrow(tree.worldX, tree.worldY))) {
        tree.regrow();
      }
    }
    // Plots whose grown grass was consumed reopen their hole for replanting (the farming loop).
    this.updatePlantSpots();
    // A flor da lua le a luz das fogueiras e abre/fecha por conta dela.
    this.updateMoonflowers(delta);
    this.updateFurnaces(delta);
    // O ALTAR não tem ciclo: o único relógio dele é o da brasa que a pancada deixou no tampo.
    for (const altar of this.altars) altar.update(delta);
    this.updateToolboxes(delta);

    // As marcas de posicionamento seguem o corpo NO MESMO frame em que ele vira.
    this.syncPlacementHints();
    if (this.npcManager && this.camera) this.npcManager.render(this.tileSize, this.camera);
    this.greetNearbyNpcs();
    this.updateCat(delta);
    this.renderProps();
  }

  /** O "OI": o NPC da um pulinho na primeira vez que o heroi chega a dois passos dele. */
  private greetNearbyNpcs(): void {
    const npcs = this.npcManager?.getActiveWorldPositions() ?? [];
    for (const n of npcs) {
      const key = `${n.worldX},${n.worldY}`;
      if (this.greetedNpcs.has(key)) continue;
      // Quem dorme nao cumprimenta — e nem gasta o "oi": ele acontece quando o vizinho acordar.
      if (isNpcAsleep(n.kind)) continue;
      if (Math.hypot(n.worldX - this.playerWorld.worldX, n.worldY - this.playerWorld.worldY) > 2.3) continue;
      this.greetedNpcs.add(key);
      this.npcManager?.hop(n.worldX, n.worldY, 0.16);
    }
  }

  /**
   * DESCANSAR. O Z numa fogueira ACESA (uma qualquer do vale; a do fim tem o gesto proprio) senta o
   * cavaleiro de frente para ela, e o tempo passa depressa: o ceu anda, a luz muda, os grilos e os
   * passaros trocam de turno. Nada a fazer, nada a ganhar — e esse e o ponto. Qualquer tecla (ou
   * seta) levanta.
   */
  private restAtFireAt(wx: number, wy: number): boolean {
    const fire = this.getCampfireAt(wx, wy);
    if (!fire?.isLit || this.resting) return false;
    this.resting = true;
    this.stopBreathing();
    this.movementController?.hold(true);
    this.quickBag?.close();
    this.controlsHint?.destroy();
    this.controlsHint = undefined;
    this.hero.frame = HERO_FRAMES.idleDown;
    this.tweens.add({ targets: this.hero, scaleY: 0.84, scaleX: 1.05, duration: 380, ease: 'Sine.easeOut' });
    void this.dollyTo(0.82, 1600);
    this.setVignette(0.35, 1600);
    getSoundManager().playCozyChime();
    setTimeScale(REST_TIME_SCALE);
    this.restFireTile = { x: wx, y: wy };
    this.inviteFireVisitor(wx, wy);
    // Seta ou qualquer tecla levanta — as setas nao passam por pressAttack/pressUse.
    this.restKeyListener = (event: KeyboardEvent): void => {
      if (event.repeat || !this.resting) return;
      // O ESC nao esta aqui: quem o escuta e o handler da pausa (ver create), que levanta e para.
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
        this.standUp();
      }
    };
    window.addEventListener('keydown', this.restKeyListener);
    this.persistAdventure();
    return true;
  }

  /** Levantar da fogueira: o relogio volta ao normal e o corpo se estica. */
  private standUp(): void {
    if (!this.resting) return;
    this.resting = false;
    this.restFireTile = undefined;
    setTimeScale(1);
    if (this.restKeyListener) window.removeEventListener('keydown', this.restKeyListener);
    this.restKeyListener = undefined;
    // O vizinho que veio sentar levanta junto e volta para casa pelo mesmo caminho; a casa so
    // volta a ter gente quando ele chega.
    const visitor = this.fireVisitor;
    if (visitor) {
      visitor.leave(() => {
        if (this.fireVisitor === visitor) this.fireVisitor = undefined;
        this.npcManager?.setKindAway(visitor.kind, false);
      });
    }
    // A seta que levantou nao pode virar passo: os pes so soltam depois de o corpo se esticar, e o
    // pedido de direcao guardado no controle cai fora.
    this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
    this.time.delayedCall(340, () => {
      if (this.resting) return;
      this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
      this.movementController?.hold(false);
    });
    this.tweens.add({ targets: this.hero, scaleY: 1, scaleX: 1, duration: 320, ease: 'Back.easeOut' });
    void this.dollyTo(1, 1100);
    this.setVignette(0, 900);
    this.useBufferMs = 0;
    this.useCooldownMs = USE_COOLDOWN_MS;
  }

  // ── A COMPANHIA ─────────────────────────────────────────────────────────────

  /**
   * O GATO CHEGA com o primeiro favor feito (e quem continua uma partida ja o encontra junto).
   * Nao vai ao save: ele e lido dos pedidos, e um booleano a mais so poderia discordar deles.
   */
  private ensureCat(arriving: boolean): void {
    if (this.cat || !this.adventure || !this.world3d) return;
    const { dx, dy } = this.movementController?.facing ?? { dx: 0, dy: 1 };
    const px = this.playerWorld.worldX;
    const py = this.playerWorld.worldY;
    // Ele aparece ATRAS do heroi (do lado que ele nao olha), ou em cima dele se ali for parede.
    const behindFree = !this.isSolidForEntities(px - dx, py - dy);
    this.cat = new CatCompanion(this, behindFree ? px - dx : px, behindFree ? py - dy : py, arriving);
  }

  private updateCat(delta: number): void {
    if (!this.cat) return;
    let beside: { x: number; y: number } | null = null;
    const fire = this.restFireTile;
    if (this.resting && fire) {
      // ENROLADO DO LADO: meio tile para o lado do heroi, de frente para a mesma fogueira.
      const hero = this.heroVisualTile();
      const fx = Math.sign(fire.x - this.playerWorld.worldX);
      const fy = Math.sign(fire.y - this.playerWorld.worldY);
      beside = { x: hero.x - fy * 0.55 + fx * 0.1, y: hero.y + fx * 0.55 + fy * 0.1 };
    }
    this.cat.update(delta, this.heroVisualTile(), beside);
  }

  /** O carinho: so com o gato perto. Devolve se havia gato para afagar. */
  private petCat(): boolean {
    const cat = this.cat;
    if (!cat) return false;
    const hero = this.heroVisualTile();
    if (Math.hypot(cat.position.x - hero.x, cat.position.y - hero.y) > 1.7) return false;
    cat.pet();
    this.spawnHearts(cat.position.x, cat.position.y);
    // A voz do gato e a mesma do roteiro dele (NpcDialogs): aguda e redonda, um miado de duas notas.
    const voice = getDialogVoice('blackCat');
    getSoundManager().playDialogBlip(voice?.freq ?? 540, voice?.wave ?? 'triangle');
    this.time.delayedCall(120, () => getSoundManager().playDialogBlip((voice?.freq ?? 540) * 0.8, voice?.wave ?? 'triangle'));
    return true;
  }

  /**
   * O VIZINHO MAIS PERTO VEM SENTAR na fogueira em que o heroi acabou de sentar — se houver um a
   * ate VISIT_RADIUS tiles, com caminho de verdade ate um lugar livre em volta do fogo.
   */
  private inviteFireVisitor(fx: number, fy: number): void {
    if (this.fireVisitor || !this.npcManager || !this.adventure) return;
    const hx = this.playerWorld.worldX;
    const hy = this.playerWorld.worldY;
    // Os lugares em volta do fogo, o do lado OPOSTO ao heroi primeiro: e ali que alguem senta para
    // conversar sem dizer nada.
    const seats: Array<[number, number]> = [];
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const x = fx + ox;
        const y = fy + oy;
        if ((ox === 0 && oy === 0) || (x === hx && y === hy)) continue;
        if (this.isSolidForEntities(x, y) || this.itemManager?.hasItemAt(x, y)) continue;
        seats.push([x, y]);
      }
    }
    if (seats.length === 0) return;
    seats.sort((a, b) => Math.hypot(b[0] - hx, b[1] - hy) - Math.hypot(a[0] - hx, a[1] - hy));
    const neighbours = this.npcManager.getActiveWorldPositions()
      .filter((n) => Math.hypot(n.worldX - fx, n.worldY - fy) <= VISIT_RADIUS)
      .sort((a, b) => Math.hypot(a.worldX - fx, a.worldY - fy) - Math.hypot(b.worldX - fx, b.worldY - fy));
    for (const n of neighbours.slice(0, 3)) {
      const path = this.findVisitPath([n.worldX, n.worldY], seats, [hx, hy], [fx, fy]);
      if (!path) continue;
      this.npcManager.setKindAway(n.kind, true);
      this.fireVisitor = new FireVisitor(this, n.kind, path);
      this.fireVisitor.arrive();
      return;
    }
  }

  /**
   * O caminho do vizinho ate o lugar livre mais desejado que ele alcanca: BFS em 4 direcoes pelo
   * chao livre, preso a uma caixa em volta do fogo (nunca o mapa inteiro). A casa dele conta como
   * livre (e ele mesmo que a ocupa), o tile do heroi nunca.
   */
  private findVisitPath(
    home: readonly [number, number],
    seats: ReadonlyArray<readonly [number, number]>,
    hero: readonly [number, number],
    fire: readonly [number, number],
  ): Array<[number, number]> | null {
    const box = VISIT_RADIUS + 3;
    const keyOf = (x: number, y: number): string => `${x},${y}`;
    const seatRank = new Map(seats.map(([x, y], i) => [keyOf(x, y), i]));
    const cameFrom = new Map<string, string | null>([[keyOf(home[0], home[1]), null]]);
    const queue: Array<[number, number]> = [[home[0], home[1]]];
    let best: string | null = null;
    let bestRank = Infinity;
    for (let head = 0; head < queue.length; head += 1) {
      const [x, y] = queue[head];
      const rank = seatRank.get(keyOf(x, y));
      if (rank !== undefined && rank < bestRank) { best = keyOf(x, y); bestRank = rank; if (rank === 0) break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        const k = keyOf(nx, ny);
        if (cameFrom.has(k)) continue;
        if (Math.abs(nx - fire[0]) > box || Math.abs(ny - fire[1]) > box) continue;
        if ((nx === hero[0] && ny === hero[1]) || this.isSolidForEntities(nx, ny)) continue;
        cameFrom.set(k, keyOf(x, y));
        queue.push([nx, ny]);
      }
    }
    if (!best) return null;
    const path: Array<[number, number]> = [];
    for (let k: string | null = best; k; k = cameFrom.get(k) ?? null) {
      const [x, y] = k.split(',').map(Number);
      path.unshift([x, y]);
    }
    return path;
  }

  /**
   * O CLARAO MANSO: no lugar do `camera.flash` (um estalo de tela inteira, de luta), uma luz que
   * SOBE e ASSENTA — um terco do tempo para chegar, o resto para ir embora, sempre em seno.
   */
  private softWash(color: number, peak: number, durationMs: number): void {
    const { width, height } = this.scale;
    const wash = this.add.rectangle(0, 0, width, height, color, 0)
      .setOrigin(0).setScrollFactor(0).setDepth(SCENE_DEPTHS.toast - 1)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: wash, fillAlpha: peak, duration: durationMs / 3, ease: 'Sine.easeOut',
      onComplete: () => this.tweens.add({
        targets: wash, fillAlpha: 0, duration: (durationMs * 2) / 3, ease: 'Sine.easeInOut',
        onComplete: () => wash.destroy(),
      }),
    });
  }

  /** Coracoes subindo de um tile — o obrigado de quem foi ajudado. */
  private spawnHearts(wx: number, wy: number): void {
    const w3 = this.world3d;
    if (!w3) return;
    for (let i = 0; i < 3; i += 1) {
      this.time.delayedCall(i * 220, () => {
        const heart = w3.addBillboard(HEART_TEXTURE, 0, { centered: true, fog: false, emissive: true })
          .setPosition(wx + (i - 1) * 0.22, wy + 0.05)
          .setElevation(1.05)
          .setDisplaySize(0.36, 0.32);
        this.tweens.add({ targets: heart, elevation: 1.75 + i * 0.1, duration: 1500, ease: 'Sine.easeOut' });
        this.tweens.add({ targets: heart, x: heart.x + (i - 1) * 0.12, duration: 1500, ease: 'Sine.easeInOut' });
        this.tweens.add({ targets: heart, alpha: 0, delay: 900, duration: 600, onComplete: () => heart.destroy() });
      });
    }
  }

  /**
   * O corpo que pisa neste tile aparece na tela agora? Projetado pela camera 3D DE VERDADE
   * (tileToScreen), nunca pelo retangulo plano do getVisibleRange: em perspectiva o quadro e
   * assimetrico.
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

    this.hero.sizePx = this.tileSize; // o render3D reescreve isto todo frame; aqui e so pro primeiro
    this.movementController?.syncPlayerToWorld(this.playerWorld.worldX, this.playerWorld.worldY, this.tileSize);
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

    const active = new Set<string>();
    const radius = 1;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        active.add(`${pcx + dx},${pcy + dy}`);
      }
    }

    this.npcManager?.syncChunks(active);
    // Held items (sword/key) are loaded once and never streamed — see ItemManager.
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
  /** O funil por onde passam colisao, tiro, ocupacao, instalacao e recolhimento. */
  private propAt<T extends WorldProp>(list: T[], wx: number, wy: number): T | undefined {
    return list.find((p) => p.worldX === wx && p.worldY === wy);
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

  /** Tudo o que ocupa este tile MENOS o próprio herói — parede, prop, item caído. */
  private isTileTaken(wx: number, wy: number): boolean {
    return this.isSolidForEntities(wx, wy)
      || (this.itemManager?.hasItemAt(wx, wy) ?? false);
  }

  /**
   * Ha ALGUMA COISA neste tile? Nao "e solido" — solido e o que barra um corpo, e isto aqui e a
   * pergunta mais ampla: tem qualquer coisa ocupando o lugar.
   *
   * O portão de bater só pode girar para um tile vazio. Um item caído no chão não é sólido — o
   * herói anda por cima dele —, mas ainda ocupa o lugar para esse gesto.
   */
  private isTileOccupied(wx: number, wy: number): boolean {
    return this.isTileTaken(wx, wy)
      || (wx === this.playerWorld.worldX && wy === this.playerWorld.worldY);
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

  private getMoonflowerAt(wx: number, wy: number): MoonflowerObject | undefined {
    return this.propAt(this.moonflowers, wx, wy);
  }

  private getToolboxAt(wx: number, wy: number): ToolboxObject | undefined {
    return this.propAt(this.toolboxes, wx, wy);
  }

  /**
   * O A na frente de uma MÁQUINA DE FABRICAR abre o catálogo dela. Devolve `true` quando havia uma
   * ali — é o contrato de `talkToNpcAt`, e é o que faz o gesto não escorrer para o golpe.
   *
   * Duas peças respondem: a bancada e o forno. Elas dividem a tela, o gesto e o código inteiro de
   * fabricação; o que as separa é uma palavra na receita (`station`).
   */
  private openCraftMenuAt(wx: number, wy: number): boolean {
    const box = this.getToolboxAt(wx, wy);
    const furnace = box ? undefined : this.getFurnaceAt(wx, wy);
    const prop = box ?? furnace;
    if (!prop) return false;
    const station: CraftStation = box ? 'bench' : 'furnace';
    if (this.orderOverlay) return true;
    this.useBufferMs = 0;
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
   * CONSTRUIR NA BANCADA — um gesto manual pelo catalogo.
   *
   * Ele é atômico de propósito: ou os insumos saem da mochila e o produto entra nela no MESMO
   * frame, ou nada acontece. A receita escolhida sempre usa os materiais da mochila.
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
    // O FORNO não pergunta isso: se a frente estiver ocupada quando a fornada terminar, ele
    // procura outro vizinho livre. Perguntar aqui recusaria uma fornada que a máquina sabe adiar.
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
      // no fim desse ciclo, entregue pelo `port.put` do forno.
      const charge: HeldItemKind[] = [];
      for (const [ingredient, need] of cost) {
        for (let i = 0; i < need; i += 1) charge.push(ingredient);
      }
      // Nenhum som sai daqui: a boca pegando fogo tem uma voz, disparada pelo `port.lit`.
      prop.startHandSmelt(kind, units, charge, [this.playerWorld.worldX, this.playerWorld.worldY]);
    } else {
      // A BANCADA é o oposto e continua sendo: uma martelada é um instante, não um processo. A PEÇA
      // NASCE NO CHÃO, e não na mochila — a mochila era a entrega mais curta possível e por isso
      // mesmo não se via nada: a mesa martelava para ninguém. O item entra no mundo AGORA (o arco é
      // só o desenho por cima), então nem morrer no meio do voo o apaga.
      this.itemManager?.drop(kind, landing![0], landing![1], undefined, units);
      this.flingCraftedItem(kind, prop.worldX, prop.worldY, landing![0], landing![1]);
      prop.playCraft();
      getSoundManager().playHammer();
      this.time.delayedCall(140, () => getSoundManager().playToolboxDeliver());
    }
    this.questEvent({ type: 'craft', item: kind, units });
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
   * Um tile serve quando o herói pode PISAR nele (nada de rio, lava ou corpo sólido) e não tem
   * item nenhum em cima: a lei de um item por tile é
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
   * precisa ver todas as ferramentas futuras; precisa saber qual e o proximo passo.
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

  private getFurnaceAt(wx: number, wy: number): FurnaceObject | undefined {
    return this.propAt(this.furnaces, wx, wy);
  }

  /**
   * Há uma estação manual neste tile? Uma pergunta só para construção e restauração do save.
   */
  private machineAt(wx: number, wy: number): boolean {
    return this.getFurnaceAt(wx, wy) !== undefined || this.getAltarAt(wx, wy) !== undefined;
  }

  private getPlantSpotAt(wx: number, wy: number): PlantSpotObject | undefined {
    return this.propAt(this.plantSpots, wx, wy);
  }

  private getWaterAt(wx: number, wy: number): WaterObject | undefined {
    return this.propAt(this.waterTiles, wx, wy);
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
   * caller is explicitly hazard-passable (flying enemies). The hero adds enemies on top
   * (to attack them).
   */
  private isSolidForEntities(wx: number, wy: number, hazardsPassable = false): boolean {
    if (this.chunkManager?.isCellBlocked(wx, wy)) return true;
    for (const entry of this.propRegistry) {
      if (entry.hazard && hazardsPassable) continue;
      if (this.propAt(entry.list, wx, wy)?.blocking) return true;
    }
    if (this.npcManager?.hasNpcAt(wx, wy)) return true;
    if (this.plantedSwordTile?.x === wx && this.plantedSwordTile.y === wy) return true;
    if (this.isQuestMarkAt(wx, wy)) return true;
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

  // ── OS DOIS BOTOES ─────────────────────────────────────────────────────────

  /**
   * Liga os dois botoes. No teclado sao Z/J/espaco (falar e cuidar) e X/K (o item) — o par do NES
   * nas teclas que a mao esquerda alcanca sem largar as setas. `addCapture` existe por causa do
   * espaco: sem ele a pagina rola um pouco a cada aperto.
   *
   * Por EVENTO e nao por `JustDown` dentro do update: este update tem varias portas por onde sai
   * mais cedo (dialogo, catalogo, cutscene), e uma tecla lida por polling morre em todas elas.
   */
  private installActionInput(): void {
    const touch = isTouchDevice();
    // A BOLSA nasce antes das teclas porque as teclas perguntam por ela: com a bolsa aberta, o I,
    // as setas e o X sao DELA, e so voltam a ser do heroi quando ela fecha.
    this.quickBag = new QuickBag({
      read: () => this.quickBagView(),
      onSet: (kind) => { this.selectItem(kind as HeldItemKind); },
      onToggleRequest: () => this.toggleBag(),
      onOpenChange: (open) => this.onBagOpenChanged(open),
    }, touch);

    const kb = this.input.keyboard;
    if (kb) {
      kb.addCapture(['Z', 'X', 'J', 'K', 'SPACE', 'I']);
      for (const key of ['keydown-Z', 'keydown-J', 'keydown-SPACE']) kb.on(key, this.pressAttack, this);
      for (const key of ['keydown-X', 'keydown-K']) kb.on(key, this.pressUse, this);
      // I ABRE E FECHA A BOLSA. A bolsa nao age no mundo, ela so decide o que o X carrega.
      kb.on('keydown-I', this.toggleBag, this);
      // As setas so chegam aqui quando a bolsa esta aberta; fora dela quem as le e o andar.
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
        onAttackRelease: () => undefined,
        onUse: () => this.pressUse(),
      });
    } else if (this.introDone) {
      this.controlsHint = new ControlsHint(t('controls.hint'));
    }
  }

  /** A seta, com a bolsa aberta: ela anda com o CURSOR e nao com o herói (que está de pés presos). */
  private routeBagStep(event: KeyboardEvent | undefined, delta: number): void {
    if (!this.quickBag?.isOpen) return;
    // Tecla segurada repete no navegador — e uma fileira de itens percorrida a 30 passos por
    // segundo não é uma escolha.
    if (event?.repeat) return;
    this.quickBag.step(delta);
  }

  /**
   * A BOLSA ABRE E FECHA — e nada mais no jogo faz isso. Ela recusa exatamente onde o menu de
   * pausa recusa: nenhuma tela que já congelou o mundo pode ganhar uma segunda por cima.
   */
  private toggleBag(): void {
    if (!this.quickBag) return;
    if (this.quickBag.isOpen) { this.quickBag.close(); return; }
    if (this.pauseMenu || this.dialogOpen || this.camShifting
      || this.itemGetOpen || this.cutsceneActive || this.orderOverlay) return;
    this.quickBag.openBag();
  }

  /**
   * Folhear a bolsa prende os pés (as setas são do cursor agora) e cala os dois botões (`canAct`)
   * — o par do toque sai da tela junto, para que só exista um conjunto de controles de cada vez.
   */
  private onBagOpenChanged(open: boolean): void {
    this.movementController?.hold(open);
    this.actionButtons?.setVisible(!open);
    if (!open) return;
    // A tarja das teclas mora no MESMO rodapé da tela que a bolsa, e ela já cumpriu o trabalho.
    this.controlsHint?.destroy();
    this.controlsHint = undefined;
    this.useBufferMs = 0;
  }

  /**
   * O que a bolsa desenha: a mochila com a ARTE DO JOGO e o item que o X carrega AGORA — o cursor
   * é da bolsa, o equipado é da cena.
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
      materials: this.inventory.materials().map(row),
      equipped: this.heldItem,
      emptyLabel: t('bag.empty'),
    };
  }

  /**
   * Toda tela que congela o jogo congela tambem os dois botoes. O teclado ja para sozinho com
   * `scene.pause()`, mas os botoes de toque sao DOM e continuam clicaveis — entao a porta tem de
   * estar aqui, e nao so na tecla. A BOLSA entra aqui: o mundo continua correndo atrás dela, mas
   * as mãos estão dentro da mochila.
   */
  private canAct(): boolean {
    return !this.dialogOpen && !this.camShifting
      && !this.itemGetOpen && !this.cutsceneActive
      && !this.pauseMenu && this.quickBag?.isOpen !== true
      && !this.orderOverlay
      && this.movementController !== undefined;
  }

  /**
   * Gasta o pedido guardado. Um X apertado durante a cadencia espera aqui e sai no instante em
   * que ela libera — e a espera tem prazo, senao um botao apertado ha meio segundo dispararia
   * sozinho. Ver ACTION_BUFFER_MS.
   */
  private spendActionBuffers(delta: number): void {
    if (this.quickBag?.isOpen) return;
    if (this.useBufferMs > 0) {
      this.useBufferMs = Math.max(0, this.useBufferMs - delta);
      if (this.useBufferMs > 0 && this.useCooldownMs <= 0) this.pressUse();
    }
  }

  /**
   * ONDE O HEROI ESTA DESENHADO, em tiles fracionarios — que durante um passo NAO e o tile logico.
   * A posicao logica pula para o tile de destino no instante em que o passo comeca, mas o corpo
   * na tela ainda esta atras, deslizando. Todo efeito preso ao HEROI tem de sair daqui.
   */
  private heroVisualTile(): { x: number; y: number } {
    return this.movementController?.visualWorld(this.playerWorld.worldX, this.playerWorld.worldY)
      ?? { x: this.playerWorld.worldX, y: this.playerWorld.worldY };
  }

  /**
   * O tile a frente: para onde ele OLHA, nao para onde ele anda. E a mesma direcao que o sprite
   * esta mostrando (PlayerMovementController.facing), entao o alvo do gesto nunca pode divergir
   * do corpo que o jogador ve.
   */
  private facingTile(): { x: number; y: number } {
    const f = this.movementController?.facing ?? { dx: 0, dy: 1 };
    return { x: this.playerWorld.worldX + f.dx, y: this.playerWorld.worldY + f.dy };
  }

  /**
   * Para onde o heroi olha, no indice N/L/S/O usado pela bancada e pelo forno. Faz a direção
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
   * mao humana no localStorage) nao pode virar um frame fora da folha.
   */
  private static asPropDir(value: number | undefined): PropDir {
    const n = Math.trunc(value ?? 1);
    return (Number.isFinite(n) ? (((n % 4) + 4) % 4) : 1) as PropDir;
  }

  /**
   * O BOTAO Z — a MÃO que cumprimenta e cuida, nunca uma lâmina. Na ordem:
   *
   *   1. FALAR com quem está na frente (o keycap "Z" sobre a cabeça do NPC anuncia esta tecla);
   *   2. a FOGUEIRA DO FIM: acender, e depois assar (ver tendHearthAt);
   *   3. a BANCADA e o FORNO abrem o catálogo;
   *   4. o ALTAR vazio recebe o item selecionado, e o ocupado leva a pancada.
   *
   * Sem nada disso na frente o Z não faz nada — não há golpe no vazio porque não há golpe.
   */
  private pressAttack(event?: KeyboardEvent): void {
    // Uma tecla SEGURADA repete o `keydown` no navegador; o sinal certo pra ignorar a repeticao e
    // o `repeat` do proprio evento, nunca um booleano nosso que um `keyup` perdido deixaria preso.
    if (event?.repeat) return;
    if (this.resting) { this.standUp(); return; }
    if (!this.canAct()) return;
    const front = this.facingTile();
    if (this.talkToNpcAt(front.x, front.y)) return;
    if (this.tendHearthAt(front.x, front.y)) return;
    if (this.restAtFireAt(front.x, front.y)) return;
    if (this.openCraftMenuAt(front.x, front.y)) return;
    if (this.placeOnAltarAt(front.x, front.y)) return;
    if (this.strikeAltarAt(front.x, front.y)) return;
    // Z NO VAZIO com o gato do lado e carinho. Ele anda atras e nao num tile, entao mira-lo
    // seria impossivel: basta estar perto e o Z nao ter mais nada a fazer.
    this.petCat();
  }

  /**
   * O BOTÃO X — USA O ITEM DA BOLSA no tile à frente, e é só isso que ele faz.
   *
   * O X usa o item escolhido, devolve uma peca colocada no altar ou recolhe uma estacao manual.
   * A ordem abaixo é a única que não desmente as marcas desenhadas no chão: o que o jogador
   * ESCOLHEU (o item) age primeiro e so entao vem recolher.
   */
  private pressUse(event?: KeyboardEvent): void {
    // Segurar o X um instante a mais para equipar fazia o primeiro keydown CONFIRMAR o item e a
    // repetição seguinte, já com a bolsa fechada, USÁ-LO. Quem quer usar duas vezes aperta duas.
    if (event?.repeat) return;
    if (this.resting) { this.standUp(); return; }
    // A BOLSA ABERTA SEQUESTRA O X — e este é o único lugar do código onde isso pode ser decidido.
    if (this.quickBag?.isOpen) { this.quickBag.commit(); return; }
    if (!this.canAct()) return;
    // A cadencia adia, nao descarta (ver ACTION_BUFFER_MS).
    if (this.useCooldownMs > 0) {
      this.useBufferMs = ACTION_BUFFER_MS;
      return;
    }
    this.useBufferMs = 0;
    this.useCooldownMs = USE_COOLDOWN_MS;
    this.stopBreathing();
    const { x, y } = this.facingTile();
    // 0. A FERRAMENTA CERTA SE APRESENTA SOZINHA: diante de um tronco só existe uma resposta, e
    //    fazer o jogador dizê-la em voz alta é cobrar burocracia por uma escolha que não existe.
    //    Ver `toolWantedAt`.
    this.equipToolFor(x, y);
    // 1. O ITEM ESCOLHIDO AGE — a tabela inteira (machado→árvore, picareta→rocha, balde→água,
    //    chave→porta, tocha→fogueira, pá→terra, semente→buraco, estação→instala).
    if (this.heldItem !== 'none' && this.useItemAt(x, y)) return;
    // 1b. MARTELAR A ESPONJA continua valendo com a bolsa VAZIA.
    if (this.heldItem === 'none' && this.strikeBloomAt(x, y)) return;
    // 2. O ALTAR CHEIO devolve a peca para a mochila.
    if (this.takeFromAltarAt(x, y)) return;
    // 3. RECOLHER a máquina que o JOGADOR construiu.
    if (this.pickUpMachineAt(x, y)) return;
    // 4. O gesto sai NO VAZIO: um botão que só se mexe quando acerta esconde do jogador o que ele
    //    está segurando. Sem nada selecionado não há braço a balançar.
    if (this.heldItem !== 'none') this.swingHeld(x, y);
  }

  /**
   * O X contra um altar ocupado devolve a peca guardada nele para a mochila.
   */
  private takeFromAltarAt(wx: number, wy: number): boolean {
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
    // `clearHeldItem` e não um `remove` solto: ele é quem sabe que uma tocha que sai da mão apaga.
    this.clearHeldItem();
    getSoundManager().playToolboxDeliver();
    this.persistAdventure();
    return true;
  }

  /**
   * A PANCADA NA LAJE — a mesma para a espada (Z) e para a ferramenta (X).
   *
   * A esponja recém-saída do forno é ferro poroso encharcado de escória, e só vira metal depois de
   * apanhar quente: são `BLOOM_BLOWS` pancadas, como na martelada no chão.
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
    const kind = this.npcManager.getKindAt(wx, wy);
    if (!kind) return false;
    // The wizard runs the story dialogue (progress-driven); every other NPC uses its base line.
    if (kind === 'wizard') this.openWizardDialog({ worldX: wx, worldY: wy });
    else this.openNpcDialog(kind, { worldX: wx, worldY: wy }, this.npcManager.getDialogIdAt(wx, wy));
    return true;
  }

  /**
   * INSTALAR a estação que esta na mao no tile a frente. Devolve `false` quando o item não é uma
   * estação — e ai a tabela do A segue para as outras linhas dela.
   *
   * A DIREÇÃO nasce de para onde o herói está olhando, nunca de um menu.
   */
  private buildMachineAt(wx: number, wy: number): boolean {
    const kind = this.heldItem;
    if (kind === 'none' || !MACHINE_ITEM_KINDS.has(kind)) return false;
    if (!this.canBuildMachineAt(kind, wx, wy)) {
      this.swingHeld(wx, wy);
      getSoundManager().playToolboxRefuse();
      return true;
    }
    const dir = this.facingDirIndex();
    if (!this.installMachine(kind, wx, wy, dir)) return false;
    this.inventory.remove(kind, 1);
    this.updateBackItem();
    // O mesmo martelo da bancada: montar uma estação soa como fabricação. Um som novo
    // aqui ensinaria que instalar e outra categoria de gesto, e nao e — e fabricacao.
    getSoundManager().playToolboxDeliver();
    this.persistAdventure();
    return true;
  }

  /**
   * O ATO de pôr a estação no mundo, sem nada em volta: nem cobrar a mochila, nem tocar som, nem
   * gravar o save. E o corpo compartilhado entre o gesto do jogador (`buildMachineAt`), a volta
   * do save (`restoreBuiltMachines`) e o hook de teste — porque a alternativa e a construcao
   * existir escrita tres vezes.
   *
   * Devolve `false` para um item que nao vira prop, nunca para um tile ruim: quem
   * checa o tile e quem chama, porque cada um deles recusa de um jeito diferente (o jogador ve
   * o gesto falhar, o save simplesmente descarta a peca).
   */
  private installMachine(kind: HeldItemKind, wx: number, wy: number, dir: PropDir): boolean {
    switch (kind) {
      case 'furnace': this.furnaces.push(new FurnaceObject(this, wx, wy, dir, true)); break;
      // O ALTAR nao recebe `dir`: ele nao tem frente — e uma laje, e se trabalha nela de qualquer
      // lado. Uma peca que aceitasse direcao sem usa-la ensinaria que o G do editor faz algo aqui.
      case 'altar': this.altars.push(new AltarObject(this, wx, wy, true)); break;
      default: return false;
    }
    return true;
  }

  /**
   * Hook de playtest para instalar uma estação pelo mesmo caminho do botão A.
   */
  public buildTestMachine(kind: HeldItemKind, wx: number, wy: number, dir = 1): boolean {
    // A mesma recusa de tile do botão A impede fixtures impossíveis.
    if (this.machineAt(wx, wy)) return false;
    return this.installMachine(kind, wx, wy, GameScene.asPropDir(dir));
  }

  /**
   * ESTE TILE ACEITA ESTA PECA? — a pergunta que o botao e a MARCA fazem, e por isso ela existe
   * uma vez so. Duas copias divergindo seria o pior defeito possivel desta reforma: um quadrado
   * branco no chao prometendo um gesto que o botao recusa.
   *
   * `machineAt` entra na conta para a construção e a restauração concordarem sobre ocupação.
   */
  /**
   * A PEGADA de uma estação: todo tile que ela vai ocupar depois de instalada.
   */
  private machineFootprint(kind: HeldItemKind, wx: number, wy: number): Array<[number, number]> {
    return [[wx, wy]];
  }

  private canBuildMachineAt(kind: HeldItemKind, wx: number, wy: number): boolean {
    if (!MACHINE_ITEM_KINDS.has(kind)) return false;
    for (const [tx, ty] of this.machineFootprint(kind, wx, wy)) {
      if (this.isTileOccupied(tx, ty) || this.machineAt(tx, ty)) return false;
    }
    return true;
  }

  private syncPlacementHints(): void {
    const hints = this.placementHints;
    if (!hints) return;
    const kind = this.heldItem;
    if (kind === 'none' || !MACHINE_ITEM_KINDS.has(kind)) {
      hints.clear();
      return;
    }
    const { x, y } = this.facingTile();
    const target = this.canBuildMachineAt(kind, x, y) ? { x, y } : null;
    hints.show(target);
  }

  /**
   * RECOLHER a maquina que esta a frente. TUDO que se instala se recolhe — inclusive o que o
   * mapa autorou.
   *
   * Isto e o par exato do `buildMachineAt`, e a razao de a construcao ser segura: todo gesto
   * deste jogo que poe alguma coisa no mundo tem um gesto que a tira (pousar com B, pegar com
   * B). Sem a volta, errar um tile custaria a peca — e o jogador pararia de experimentar, que e
   * o que mantém a experimentação segura.
   *
   * O campo `playerBuilt` continua existindo porque é ele que diz o que vai ao
   * SAVE (o mundo autorado ja mora no world.json; gravar tudo o duplicaria no proximo boot).
   */
  private pickUpMachineAt(wx: number, wy: number): boolean {
    const furnace = this.getFurnaceAt(wx, wy);
    if (furnace) {
      // O FORNO TRABALHANDO nao sobe: a carga ja saiu da mochila e esta dentro dele, e recolher
      // a maquina agora sumia com ela. A recusa e o tranco da alvenaria, como em toda trava.
      if (furnace.isBusy) {
        furnace.bump();
        getSoundManager().playToolboxRefuse();
        return true;
      }
      this.removeProp(this.furnaces, furnace);
      return this.collectMachine('furnace', wx, wy);
    }
    // A LAJE VAZIA sobe; com uma peça em cima, não — o X ali é o gesto de tirar a peça (ver
    // `takeFromAltarAt`), e ele roda antes deste. É a mesma regra de um recipiente cheio, e pela mesma
    // razão: recolher um móvel com carga dentro é a carga sumindo em silêncio.
    const altar = this.getAltarAt(wx, wy);
    if (altar && altar.carrying === null) {
      this.removeProp(this.altars, altar);
      return this.collectMachine('altar', wx, wy);
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
    this.onCollectItem({ kind, worldX: wx, worldY: wy });
    return true;
  }

  /**
   * MARTELAR A ESPONJA no chão.
   *
   * Uma lupa recem-saida do forno e ferro poroso encharcado de escoria: so vira metal util
   * depois de apanhar quente, ate a escoria espirrar fora. Sao `BLOOM_BLOWS` pancadas.
   *
   * A contagem morre junto com a esponja: se o item sai do tile,
   * o proximo bolo que chegar ali comeca do zero. Guardar pancadas de uma peca que nao esta mais
   * la faria a esponja seguinte sair pronta pela metade sem nada no mundo explicando por que.
   */
  private strikeBloomAt(wx: number, wy: number): boolean {
    if (this.itemManager?.kindAt(wx, wy) !== 'bloom') return false;
    const key = `${wx},${wy}`;
    const blows = (this.bloomBlows.get(key) ?? 0) + 1;
    this.swingHeld(wx, wy);
    getSoundManager().playHammer();
    this.world3d?.shake(60, 0.002);
    if (blows < BLOOM_BLOWS) {
      this.bloomBlows.set(key, blows);
      return true;
    }
    // A ULTIMA pancada: a escoria sai e o que fica e barra. A troca acontece no MESMO tile —
    // uma bigorna não move a peça. O resultado sai da tabela compartilhada (`hammering.ts`),
    // usada também pelo altar.
    this.bloomBlows.delete(key);
    const made = hammerResult('bloom') ?? 'iron';
    this.itemManager?.takeAt(wx, wy);
    this.itemManager?.drop(made, wx, wy);
    this.world3d?.shake(90, 0.003);
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
   * vazia: quem atravessa o mapa com a picareta escolhida continua com a picareta.
   * A cerimônia de item novo continua acontecendo — mas só para o que tem gesto: um "ITEM GET"
   * de tela cheia para o terceiro minério do dia seria o jogo parando para nada.
   *
   * O FOGO só sobe junto com a peça se ela for parar na mão. Uma tocha acesa dentro da mochila
   * seria fogo que não está em lugar nenhum do mundo (a mesma lei do `selectItem`).
   */
  private collectUnderfoot(wx: number, wy: number): void {
    const taken = this.itemManager?.takeAt(wx, wy);
    if (!taken) return;
    const handWasEmpty = this.heldItem === 'none';
    this.inventory.stash(taken.kind, taken.units ?? 1);
    this.inventory.selectFirstIfEmpty();
    if (handWasEmpty && this.heldItem === taken.kind) {
      this.heldOnFire = taken.kind === 'wood' && taken.fire !== undefined;
      this.torchFuelMs = taken.fire?.fuelMs ?? 0;
    }
    this.updateBackItem();
    if ((isBagItem(taken.kind) || taken.kind === 'mushroom') && !this.seenItems.has(taken.kind)) {
      this.seenItems.add(taken.kind);
      this.showItemGet(taken.kind, () => {});
    } else {
      this.seenItems.add(taken.kind);
      // O som de GUARDAR (ver playItemStash): grave e descendo, o couro da mochila. Aqui tocava
      // um tilintar metálico de moeda, herdado de quando o jogo tinha carteira — e um graveto
      // entrando na mochila soava como dinheiro entrando no bolso.
      getSoundManager().playItemStash();
    }
    this.persistAdventure();
  }

  private pickUpItemAt(wx: number, wy: number): boolean {
    const taken = this.itemManager?.takeAt(wx, wy);
    if (!taken) return false;
    this.onCollectItem({
      kind: taken.kind, worldX: wx, worldY: wy,
      fire: taken.fire, units: taken.units,
    });
    return true;
  }

  /**
   * Pousar o item selecionado num tile livre. Um tile guarda UM item (dois seriam um
   * desaparecimento silencioso), e nada se pousa dentro de parede, prop ou bicho.
   *
   * O fogo desce junto: um graveto aceso deixado no chão continua queimando e acende o que houver
   * de inflamável ao lado.
   */
  private placeItemAt(wx: number, wy: number): boolean {
    const kind = this.heldItem;
    if (kind === 'none' || !this.itemManager) return false;
    if (this.itemManager.hasItemAt(wx, wy) || this.isTileOccupied(wx, wy)) return false;

    const fire = this.isTorchLit ? { fuelMs: this.torchFuelMs } : undefined;
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
    this.itemManager.drop(kind, wx, wy, fire, units);
    if (fire) this.scheduleGroundTorchSpread(wx, wy);
    getSoundManager().playFootstep(); // o baque surdo de pousar algo no chao
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
    // INSTALAR UMA ESTAÇÃO é usar — a tabela inteira já é "o que este item faz contra o tile à
    // frente", e forno/altar viram props no chão.
    // Não é um modo de construção, não é um menu, não é um botão novo — é a mesma linha da tabela
    // em que mora o machado contra a árvore. (Recolher é o mesmo X, depois que a tabela cala.)
    if (this.buildMachineAt(wx, wy)) return true;

    // A ESPONJA se pousa para ser martelada; o resto da mochila age contra o tile.
    const held = this.heldItem;
    if (held === 'bloom') return this.placeItemAt(wx, wy);

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
          // ciclo de 3 pancadas ele PRODUZ um bloco, que SALTA e pousa em volta da pedra.
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

    // A BOMBA saiu daqui. Ela tem resposta em TODO tile desde que pode ser posta em qualquer
    // chão, e uma linha assim no meio da tabela engoliria a tabela inteira: com a bomba
    // selecionada, o X nunca mais tiraria uma peça do altar nem recolheria uma estação. Ela é o
    // ÚLTIMO degrau do aperto, logo antes do gesto no vazio — ver `pressUse` e `bombDropTile`.

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
   * O ESBARRAO, agora so com gestos de CORPO: abrir o portao de bater,
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

    // Fogueira: o esbarrao so faz a chama reagir. A LOJA que abria aqui foi removida por
    // inteiro, e depois dela a MOEDA que a alimentava — o jogo nao tem dinheiro nenhum.
    // Acender, apagar e reabastecer a tocha vivem no botao B.
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
   * A recusa fisica de uma trava. E o que sobra do esbarrao depois que os itens foram para o
   * botao B: o mundo responde ao corpo, sem nunca dizer qual e a chave (o balao de
   * item-que-falta foi arrancado do jogo e nao volta por esta porta).
   */
  private bumpRefusal(wx: number, wy: number): void {
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
    const grass = this.getTallGrassAt(wx, wy);
    if (grass?.blocking && grass.isTall) grass.shake();
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

    // A pedra se abre, e o mundo so sente de leve — num vale tranquilo nada sacode a tela.
    if (shattered) this.spawnShockwave(wx, wy, 0xb6bcc4, 0.3, 1.05, 260);
    w3.shake(shattered ? 90 : 50, shattered ? 0.008 : 0.003);
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

  /**
   * Fotografa o que e volatil na cena (mochila, itens no chao, dialogos, missoes) para dentro do
   * adventureState e grava. Chamado nos eventos que mudam o mundo — acender fogueira,
   * pegar/pousar item, fabricar, falar, viajar, morrer — e barato o bastante para nao ser
   * economizado: o retrato inteiro tem poucos KB.
   */
  private persistAdventure(): void {
    if (!this.adventure) return;
    const st = adventureState();
    st.started = true;
    st.inventory = this.inventory.list();
    st.selected = this.inventory.selected;
    st.introSeen = this.introDone;
    st.gateOpened = this.gateOpened;
    st.hearthLit = this.hearthLit;
    st.endingSeen = this.roasted;
    // De onde ele CONTINUA: o tile em que esta agora. Durante a abertura ele ainda nao chegou a
    // lugar nenhum, entao o retrato nao anda (o Continue o poria no meio da caminhada).
    if (this.introDone) st.respawn = { worldX: this.playerWorld.worldX, worldY: this.playerWorld.worldY };
    st.seenDialogKeys = new Set(this.seenDialogKeys);
    st.seenItems = new Set(this.seenItems);
    if (this.itemManager) {
      const ground: AdventureGroundItem[] = this.itemManager.snapshot().map((s) => ({
        kind: s.kind, worldX: s.worldX, worldY: s.worldY, count: s.units,
      }));
      // A FORNADA EM CURSO vai ao save como a peca que ela vai virar, na boca do forno: os insumos
      // ja sairam da mochila, e sem isto fechar o jogo nos ~4s do fole sumia com eles.
      for (const furnace of this.furnaces) {
        const pending = furnace.pendingProduct;
        if (pending) ground.push({ kind: pending.kind, worldX: pending.tile[0], worldY: pending.tile[1], count: pending.units });
      }
      st.groundItems.set(this.adventureScope, ground);
    }
    // Estações construídas pelo jogador. As autoradas já moram no world.json.
    st.machines.set(this.adventureScope, this.snapshotBuiltMachines());
    saveAdventure();
  }


  /** O diff de estações manuais que vai ao save: só as peças do jogador. */
  private snapshotBuiltMachines(): AdventureMachine[] {
    const out: AdventureMachine[] = [];
    for (const furnace of this.furnaces) {
      if (!furnace.playerBuilt) continue;
      out.push({
        type: 'furnace', worldX: furnace.worldX, worldY: furnace.worldY, dir: furnace.dir,
      });
    }
    // A LAJE nao guarda `dir` (nao tem frente) nem o que esta em cima: a peca sobre ela e estado
    // de partida como a carga do bau, mas ao contrario do bau ela nunca fica sozinha no mundo —
    // o jogador esta ali malhando. Salvar o meio de uma martelada seria salvar um gesto.
    for (const altar of this.altars) {
      if (!altar.playerBuilt) continue;
      out.push({ type: 'altar', worldX: altar.worldX, worldY: altar.worldY });
    }
    return out;
  }

  /**
   * O caminho de volta: o diff de estacoes manuais do save, aplicado sobre o mundo construido.
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
      if (occupied(x, y)) continue;
      if (!this.installMachine(machine.type, x, y, dir)) continue;
    }
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
    this.questEvent({ type: 'light' });
    if (!cf.light()) return;
    getSoundManager().playIgnite();
    this.spawnFireHitEffect(wx, wy);
    this.softWash(0xffc86e, 0.12, 900);
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

  // ── Walk-on ─────────────────────────────────────────────────────────────────
  /**
   * Um tile ENTRADO (uma vez por passo, nunca por frame). `_dx`/`_dy` são a direção do passo que
   * trouxe o herói até aqui — zero quando alguém chamou isto de fora do andar (o debug).
   */
  private handleTileEntered(wx: number, wy: number, _dx = 0, _dy = 0): void {
    // O fog of war do mapa: o chunk pisado entra no save (176 chaves no maximo, um evento raro).
    if (this.adventure) {
      const chunkKey = `${Math.floor(wx / CHUNK_COLUMNS)},${Math.floor(wy / CHUNK_ROWS)}`;
      const st = adventureState();
      if (!st.visitedChunks.has(chunkKey)) {
        st.visitedChunks.add(chunkKey);
        this.questEvent({ type: 'explore' });
        saveAdventure();
      }
    }
    // Depositar itens usa o botao B contra o tile a frente (ver pressUse/placeItemAt).
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
    const grass = new TallGrassObject(this, spot.worldX, spot.worldY);
    grass.sproutIn();
    this.tallGrasses.push(grass);
    spot.setGrown(grass);
    getSoundManager().playGrassCut(); // the blades pushing out — the same dry rustle
    // BROTOU — e é isto que a pintora pediu: verde que alguém plantou (ver NpcQuests).
    this.questEvent({ type: 'grow' });
    this.spawnGrowSparkle(spot.worldX, spot.worldY);
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
      this.world3d?.shake(50, 0.007, dx, dy);
    });
    if (this.adventure) {
      adventureState().dugSpots.add(`${wx},${wy}`);
      this.persistAdventure();
    }
  }

  /** Atualiza somente a curta pose visual das bancadas manuais. */
  private updateToolboxes(delta: number): void {
    for (const box of this.toolboxes) box.update(delta);
  }

  /**
   * O FORNO — a reducao do minerio, que e a unica quimica de verdade deste jogo.
   *
   * A receita vem exclusivamente do catalogo e da mochila. O port serve apenas para pousar o
   * produto quando a animacao manual termina.
   */
  private updateFurnaces(delta: number): void {
    if (!this.furnaces.length) return;
    const port: FurnaceWorldPort = {
      put: (kind, x, y, units) => this.itemManager?.drop(kind, x, y, undefined, units),
      occupied: (x, y) => this.isTileOccupied(x, y),
      // O mesmo vizinho livre que a bancada usa, escolhido pela distancia ate o heroi.
      landing: (x, y) => this.deliveryTileAround(x, y),
      lit: () => getSoundManager().playFurnaceIgnite(),
      breath: () => getSoundManager().playFurnaceBreath(),
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
        const idx = this.tallGrasses.indexOf(grass);
        if (idx >= 0) this.tallGrasses.splice(idx, 1);
        grass.destroy(); // the remains decay away and the dug hole shows again
        spot.reopen();
      });
    }
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
   * vence — mas um ITEM pode ter sido recolhido nesse meio-tempo, e fogo nao nasce de um tile vazio.
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
    return this.itemManager?.hasLitItemAt(wx, wy) ?? false;
  }

  // ── O congelamento (ver FreezeManager, onde mora a lei) ─────────────────────

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

  // ── A HISTORIA: a chegada, os vizinhos, o jardim e a fogueira ─────────────────
  //
  // O jogo inteiro e um arco so, e ele mora aqui:
  //
  //   1. A ABERTURA (playIntro): o cavaleiro chega pela estrada do sul com a espada nas costas,
  //      para e a finca no chao. Silencio, vaga-lumes. O mago se aproxima e diz o que ninguem
  //      disse a ele ainda: acabou, e agora e preciso achar um sentido alem disso.
  //   2. OS VIZINHOS (dialogs/NpcQuests): quatro pedidos pequenos, cada um com o presente que o
  //      torna possivel. Nada se perde, nada tem prazo.
  //   3. O PORTAO (openGardenGate): quando o ultimo pedido fecha, o jardim do centro do vale abre.
  //   4. A FOGUEIRA (tendHearthAt / playRoastEnding): o heroi acende o fogo, espeta um cogumelo
  //      num graveto e fica ali, assando, enquanto a brisa passa. Fim, e os creditos.

  /**
   * A ESPADA FINCADA: a MESMA arte que o heroi carrega nas costas (`BACK_ITEM_VISUAL_3D.sword`),
   * de ponta para baixo, com um terco da lamina enterrado. Ela fica de pe no tile onde ele a
   * deixou e bloqueia o tile como qualquer coisa cravada no chao. Cenario — nenhum botao a tira.
   */
  private plantSwordAt(wx: number, wy: number): Billboard3D | undefined {
    if (!this.world3d) return undefined;
    const visual = BACK_ITEM_VISUAL_3D.sword;
    this.plantedSword?.destroy();
    this.plantedSword = this.world3d
      .addBillboard(visual.texture, visual.frame, { centered: true })
      .setPosition(wx, wy)
      .setElevation(SWORD_PLANTED_ELEV)
      .setDisplaySize(1, 1)
      .setAngle(180);
    this.plantedSwordTile = { x: wx, y: wy };
    return this.plantedSword;
  }

  /**
   * AS MARCAS DO VALE AJUDADO — o que muda no mundo quando um pedido fecha (ver QUEST_MARKS).
   *
   * O "obrigado" era so uma fala, e uma fala some. A marca fica: o marco de pedras da Vega, o cesto
   * da Hollis, a lenha do Bram (e a fogueira dele, acesa para sempre) e o cavalete da Iris, cuja
   * tela cinza vira paisagem. Ela nasce do ESTADO do pedido (nenhum campo novo no save) e mora num
   * tile escolhido uma vez, no boot: o mais perto do NPC (ate tres) que nao e ponto de corte (os
   * livres do anel de oito em volta dele sao uma corrida so) — um bloco assim nunca fecha caminho.
   */
  private buildQuestMarks(): void {
    const npcs = new Map<string, { x: number; y: number }>();
    const bounds = getWorldBounds();
    for (let cy = bounds.minCy; cy <= bounds.maxCy; cy += 1) {
      for (let cx = bounds.minCx; cx <= bounds.maxCx; cx += 1) {
        for (const n of getChunkContent(cx, cy).npcs) npcs.set(n.type, { x: n.worldX, y: n.worldY });
      }
    }
    const npcTiles = new Set([...npcs.values()].map((p) => `${p.x},${p.y}`));
    const taken = new Set<string>();
    const free = (x: number, y: number): boolean => !npcTiles.has(`${x},${y}`) && !taken.has(`${x},${y}`)
      && !this.isSolidForEntities(x, y) && !(this.itemManager?.hasItemAt(x, y) ?? false)
      && !this.getPlantSpotAt(x, y) && !this.isOpenWaterAt(x, y);
    // Do mais perto para o mais longe, ate tres tiles; no empate, o lado (a marca ao lado do NPC le
    // melhor que em cima ou embaixo dele) e depois uma ordem fixa.
    const OFFSETS: Array<[number, number]> = [];
    for (let dy = -3; dy <= 3; dy += 1) for (let dx = -3; dx <= 3; dx += 1) if (dx || dy) OFFSETS.push([dx, dy]);
    OFFSETS.sort((a, b) => (Math.hypot(...a) - Math.hypot(...b)) || (Math.abs(a[1]) - Math.abs(b[1])) || (b[0] - a[0]) || (a[1] - b[1]));
    this.questMarks.length = 0;
    for (const def of QUEST_MARKS) {
      const at = npcs.get(def.npc);
      if (!at) continue;
      let tile: { x: number; y: number } | undefined;
      for (const [dx, dy] of OFFSETS) {
        const x = at.x + dx; const y = at.y + dy;
        if (!free(x, y)) continue;
        // NAO E PONTO DE CORTE: os tiles livres do anel de oito vizinhos formam UMA corrida so
        // (vizinhos consecutivos no anel sao vizinhos de passo), entao quem passava por aqui
        // continua passando em volta. Pelo menos tres livres, para a peca nao entupir um canto.
        const ring: Array<[number, number]> = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
        const open = ring.map(([ox, oy]) => !this.isSolidForEntities(x + ox, y + oy) || npcTiles.has(`${x + ox},${y + oy}`));
        let runs = 0;
        for (let k = 0; k < 8; k += 1) if (open[k] && !open[(k + 7) % 8]) runs += 1;
        const openCount = open.filter(Boolean).length;
        const roomy = openCount === 8 || (openCount >= 3 && runs <= 1);
        if (roomy) { tile = { x, y }; break; }
      }
      if (!tile) continue;
      taken.add(`${tile.x},${tile.y}`);
      const quest = questFor(def.dialog);
      const done = this.adventure && quest !== undefined && isQuestDone(quest);
      const mark: QuestMarkState = { def, tile, done, npcAt: at };
      this.questMarks.push(mark);
      this.drawQuestMark(mark, false);
    }
  }

  /** Desenha (ou troca) a marca: antes do pedido, a pose `before` se houver; depois, a `after`. */
  private drawQuestMark(mark: QuestMarkState, animate: boolean): void {
    const w3 = this.world3d;
    if (!w3) return;
    const texture = mark.done ? mark.def.after : mark.def.before;
    if (!texture) return;
    if (!mark.bb) {
      mark.bb = w3.addBillboard(texture, 0, { groundShadow: { rx: 0.3, rz: 0.2, alpha: 0.28 } })
        .setPosition(mark.tile.x, mark.tile.y)
        .setDisplaySize(0.9, 0.9);
    } else {
      mark.bb.setTexture(texture, 0);
    }
    if (mark.done && mark.def.keepFireLit) {
      const fire = this.nearestCampfireWithin(mark.npcAt.x, mark.npcAt.y, 2.5);
      if (fire) {
        this.keptLitFires.add(fire);
        fire.light();
      }
    }
    if (!animate) return;
    // O SURGIMENTO: a peca brota do chao com um pulinho, um brilho e um sino.
    const bb = mark.bb;
    bb.setDisplaySize(0.2, 0.2);
    this.tweens.add({ targets: bb, displayWidth: 0.9, displayHeight: 0.9, duration: 520, ease: 'Back.easeOut' });
    this.spawnGrowSparkle(mark.tile.x, mark.tile.y);
    this.spawnGlint(mark.tile.x, mark.tile.y, 0.7, 0.5);
  }

  /** Um pedido fechou: as marcas que ainda nao sabiam disso mudam agora, com festa. */
  private refreshQuestMarks(): void {
    for (const mark of this.questMarks) {
      if (mark.done) continue;
      const quest = questFor(mark.def.dialog);
      if (!quest || !isQuestDone(quest)) continue;
      mark.done = true;
      this.drawQuestMark(mark, true);
    }
  }

  private isQuestMarkAt(wx: number, wy: number): boolean {
    return this.questMarks.some((m) => m.bb !== undefined && m.tile.x === wx && m.tile.y === wy);
  }

  /** As FAIXAS DE CINEMA: duas barras pretas que entram pelas bordas e dizem "agora e cena". */
  private setLetterbox(on: boolean, ms = 900): void {
    if (!this.letterbox) {
      const make = (edge: 'top' | 'bottom'): HTMLDivElement => {
        const bar = document.createElement('div');
        bar.style.cssText = `position:fixed;left:0;right:0;${edge}:0;height:11vh;background:#000;`
          + `z-index:40;pointer-events:none;transform:translateY(${edge === 'top' ? '-100%' : '100%'});`
          + `transition:transform ${ms}ms cubic-bezier(.22,.8,.3,1);`;
        document.body.appendChild(bar);
        return bar;
      };
      this.letterbox = [make('top'), make('bottom')];
    }
    const [top, bottom] = this.letterbox;
    requestAnimationFrame(() => {
      top.style.transform = on ? 'translateY(0)' : 'translateY(-100%)';
      bottom.style.transform = on ? 'translateY(0)' : 'translateY(100%)';
    });
  }

  /**
   * O DOLLY: a camera anda pela propria linha de visao (camHeight e camBack pelo MESMO fator — a
   * lei do World3D; mexer num so giraria a camera). `factor` < 1 aproxima.
   */
  private dollyTo(factor: number, duration: number, ease = 'Sine.easeInOut'): Promise<void> {
    const w3 = this.world3d;
    if (!w3) return Promise.resolve();
    if (!this.dollyBase) this.dollyBase = { h: w3.params.camHeight, b: w3.params.camBack };
    const base = this.dollyBase;
    const from = w3.params.camHeight / base.h;
    return new Promise<void>((resolve) => {
      this.tweens.addCounter({
        from, to: factor, duration, ease,
        onUpdate: (tw) => {
          const f = tw.getValue() ?? factor;
          w3.params.camHeight = base.h * f;
          w3.params.camBack = base.b * f;
        },
        onComplete: () => resolve(),
      });
    });
  }

  /** Um brilho de estrela que acende e some num ponto — o fio da lamina pegando a luz. */
  private spawnGlint(wx: number, wy: number, elevation: number, size = 0.5): void {
    const w3 = this.world3d;
    if (!w3) return;
    const star = w3
      .addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 3 })
      .setTint(0xfff6d8)
      .setPosition(wx, wy)
      .setElevation(elevation)
      .setDisplaySize(0.05, 0.05);
    this.tweens.add({
      targets: star, displayWidth: size, displayHeight: size * 0.35, duration: 140, yoyo: true,
      ease: 'Quad.easeOut', onComplete: () => star.destroy(),
    });
    const ray = w3
      .addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 3 })
      .setTint(0xfff6d8)
      .setPosition(wx, wy)
      .setElevation(elevation)
      .setDisplaySize(0.05, 0.05);
    this.tweens.add({
      targets: ray, displayWidth: size * 0.25, displayHeight: size * 1.1, duration: 140, yoyo: true,
      ease: 'Quad.easeOut', onComplete: () => ray.destroy(),
    });
  }

  /** Uma faisca dourada subindo em volta de um ponto (a lamina juntando o ultimo peso). */
  private spawnRiseMote(wx: number, wy: number, elevation: number): void {
    const w3 = this.world3d;
    if (!w3) return;
    const mote = w3
      .addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 2 })
      .setTint(Math.random() < 0.5 ? 0xffe9a8 : 0xfff6d8)
      .setPosition(wx + (Math.random() - 0.5) * 0.9, wy + (Math.random() - 0.5) * 0.4)
      .setElevation(elevation - 0.4 + Math.random() * 0.3)
      .setDisplaySize(0.08, 0.08)
      .setAlpha(0.9);
    this.tweens.add({
      targets: mote, elevation: elevation + 0.3 + Math.random() * 0.3, alpha: 0,
      duration: 500 + Math.random() * 300, ease: 'Sine.easeOut', onComplete: () => mote.destroy(),
    });
  }

  /** Um tween como promessa — a abertura e uma sequencia, e cada tempo espera o anterior. */
  private tweenTo(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise<void>((resolve) => {
      this.tweens.add({ ...config, onComplete: () => resolve() });
    });
  }

  /** A VINHETA: as bordas da tela escurecem quando o tempo desacelera — o olho vai ao centro. */
  private setVignette(level: number, ms: number): void {
    if (!this.vignette) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;z-index:39;pointer-events:none;opacity:0;'
        + 'background:radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 34%, rgba(0,0,0,0.78) 100%);';
      document.body.appendChild(el);
      this.vignette = el;
    }
    const el = this.vignette;
    el.style.transition = `opacity ${ms}ms ease`;
    requestAnimationFrame(() => { el.style.opacity = String(level); });
  }

  /**
   * A RAMPA DE TEMPO: o `timeScale` dos tweens anda suave ate `to`, em tempo REAL (o relogio da
   * cena nao desacelera junto, entao a rampa e medida por ele). Camera lenta que liga num estalo
   * le como travamento; a que entra em rampa le como intencao.
   */
  private rampTimeScale(to: number, ms: number): Promise<void> {
    const from = this.tweens.timeScale;
    const start = this.time.now;
    return new Promise<void>((resolve) => {
      const ev = this.time.addEvent({
        delay: 16, loop: true, callback: () => {
          const k = Math.min(1, (this.time.now - start) / ms);
          this.tweens.timeScale = from + (to - from) * (k * k * (3 - 2 * k));
          if (k >= 1) { ev.remove(); resolve(); }
        },
      });
    });
  }

  /** Um FANTASMA da lamina no rastro do mergulho: a mesma arte, palida, apagando. */
  private spawnSwordGhost(from: Billboard3D): void {
    const w3 = this.world3d;
    if (!w3) return;
    const visual = BACK_ITEM_VISUAL_3D.sword;
    const ghost = w3
      .addBillboard(visual.texture, visual.frame, { centered: true, additive: true, fog: false, depthWrite: false })
      .setTint(0x9fc4ff)
      .setPosition(from.x, from.y)
      .setElevation(from.elevation)
      .setDisplaySize(1, 1)
      .setAngle(from.angle)
      .setAlpha(0.55);
    this.tweens.add({ targets: ghost, alpha: 0, duration: 260, ease: 'Quad.easeOut', onComplete: () => ghost.destroy() });
  }

  /** FAISCAS QUENTES: aco batendo em pedra enterrada — voam em arco e caem. */
  private spawnImpactSparks(wx: number, wy: number, count: number): void {
    const w3 = this.world3d;
    if (!w3) return;
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const reach = 0.7 + Math.random() * 1.1;
      const spark = w3
        .addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 3 })
        .setTint(Math.random() < 0.5 ? 0xffc46b : 0xfff0c0)
        .setPosition(wx, wy)
        .setElevation(0.12)
        .setDisplaySize(0.07, 0.07);
      const peak = 0.4 + Math.random() * 0.6;
      const dur = 380 + Math.random() * 260;
      this.tweens.add({ targets: spark, x: wx + Math.cos(a) * reach, y: wy + Math.sin(a) * reach * 0.6, duration: dur, ease: 'Quad.easeOut' });
      this.tweens.add({
        targets: spark, elevation: peak, duration: dur * 0.4, ease: 'Quad.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: spark, elevation: 0.02, alpha: 0, duration: dur * 0.6, ease: 'Quad.easeIn',
            onComplete: () => spark.destroy(),
          });
        },
      });
    }
  }

  /** A onda do impacto ESPANTA os vaga-lumes: cada um e empurrado para longe do ponto. */
  private scatterFireflies(wx: number, wy: number): void {
    for (const fly of this.fireflies) {
      const dx = fly.ox - wx;
      const dy = fly.oy - wy;
      const d = Math.max(0.6, Math.hypot(dx, dy));
      const push = 2.4 / d;
      this.tweens.add({ targets: fly, ox: fly.ox + (dx / d) * push, oy: fly.oy + (dy / d) * push, duration: 900, ease: 'Expo.easeOut' });
    }
  }

  /** A LUZ DA LUA sobre a espada: uma coluna palida e macia, sem luz THREE (a lei da casa). */
  private spawnMoonShaft(wx: number, wy: number): void {
    const w3 = this.world3d;
    if (!w3) return;
    const shaft = w3
      .addBillboard(FX_PUFF_TEXTURE, 0, { centered: true, additive: true, fog: false, depthWrite: false })
      .setTint(0xb8c8ff)
      .setPosition(wx, wy + 0.18)
      .setElevation(1.05)
      .setDisplaySize(0.62, 2.3)
      .setAlpha(0);
    this.moonShaft = shaft;
    this.tweens.add({ targets: shaft, alpha: 0.16, duration: 1800, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: shaft, displayWidth: 0.74, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** A FENDA no chao onde a espada entrou: deitada, do tamanho do tile, para sempre. */
  private crackGroundAt(wx: number, wy: number, animate: boolean): void {
    const w3 = this.world3d;
    if (!w3) return;
    this.groundCrack?.destroy();
    const crack = w3.addBillboard(GROUND_CRACK_TEXTURE, 0, { flat: true, flatY: 0.02, depthWrite: false })
      .setPosition(wx, wy)
      .setDisplaySize(1, 1);
    this.groundCrack = crack;
    if (!animate) return;
    crack.setDisplaySize(0.2, 0.2).setAlpha(0);
    this.tweens.add({ targets: crack, displayWidth: 1, displayHeight: 1, alpha: 1, duration: 180, ease: 'Expo.easeOut' });
  }

  /**
   * A ESPADA DESCE DAS COSTAS PARA O CHAO — o gesto que fecha uma vida, filmado como tal.
   *
   *   1. ENQUADRAR: o quadro desce meio tile para caber o heroi E o chao onde a espada vai.
   *   2. DESEMBAINHAR: a espada sai das costas (a mesma arte, o mesmo billboard) para as maos.
   *   3. ERGUER: ela sobe girando para ficar de PONTA PARA BAIXO; a camera avanca, faiscas sobem,
   *      e no alto o tempo desacelera em rampa enquanto as bordas escurecem.
   *   4. CRAVAR: um mergulho seco com rastro e assobio; no impacto o mundo CONGELA um instante,
   *      a tela pisca, o chao racha, faiscas quentes e torroes voam, duas ondas de poeira correm e
   *      os vaga-lumes se espantam.
   *   5. ASSENTAR: a lamina vibra e para; a lua desce sobre ela; o cavaleiro baixa a cabeca, fica
   *      um instante assim — e da um passo para tras sem tirar os olhos dela.
   */
  private async playSwordPlanting(): Promise<void> {
    const hb = this.heroBillboard;
    const sword = this.backItemBb;
    const front = this.facingTile();
    if (!hb || !sword || !this.camera) return;
    const sound = getSoundManager();
    this.swordInHands = true; // positionBackItem para de prender a espada nas costas

    // 1. ENQUADRAR.
    const base = this.baseScreenCenter();
    await new Promise<void>((resolve) => {
      this.cutscenePan(base.x, base.y - Math.round(this.tileSize * 0.45), 900, resolve);
    });
    const handX = hb.x + 0.04;
    const handY = hb.y + 0.32; // na frente do corpo (o heroi olha para a camera)

    // 2. DESEMBAINHAR.
    this.hero.frame = HERO_FRAMES.attack;
    sound.playSwordPickup();
    await this.tweenTo({
      targets: sword, x: handX, y: handY, elevation: 0.62, angle: 0, duration: 420, ease: 'Back.easeOut',
    });
    this.spawnGlint(handX, handY, 1.02, 0.55);
    await this.wait(560);

    // 3. ERGUER, girando: ponta para baixo, acima da cabeca.
    void this.dollyTo(0.72, 1700, 'Sine.easeInOut');
    this.setVignette(0.55, 1400);
    const rise = this.tweenTo({
      targets: sword, elevation: 1.28, angle: 540, y: hb.y + 0.12, duration: 1150, ease: 'Cubic.easeInOut',
    });
    const motes = this.time.addEvent({
      delay: 60, repeat: 40, callback: () => this.spawnRiseMote(sword.x, sword.y, sword.elevation),
    });
    this.hero.scaleY = 1.05;
    await rise;
    // CAMERA LENTA no alto, em rampa: o mundo quase para, so a lamina respira.
    await this.rampTimeScale(0.2, 260);
    sound.playSingingBowl();
    this.spawnGlint(sword.x, sword.y, sword.elevation - 0.45, 1);
    this.world3d?.shake(700, 0.01);
    this.setVignette(0.85, 500);
    await this.tweenTo({ targets: sword, elevation: 1.4, duration: 200, ease: 'Sine.easeOut' });
    motes.remove();
    await this.rampTimeScale(1, 160);
    await this.wait(220);

    // 4. CRAVAR: o assobio, o rastro, o mergulho seco ate o tile da frente.
    sound.playSwordSlash();
    this.hero.scaleY = 0.84;
    this.hero.scaleX = 1.07;
    await this.tweenTo({
      targets: sword, x: front.x, y: front.y, elevation: SWORD_PLANTED_ELEV - 0.08,
      duration: 130, ease: 'Expo.easeIn',
      onUpdate: () => this.spawnSwordGhost(sword),
    });
    // O IMPACTO.
    this.tweens.timeScale = 0; // hitstop: o mundo segura o quadro do golpe
    sound.playTitleImpact();
    sound.playRockSmash();
    this.cameras.main.flash(150, 255, 246, 220);
    this.world3d?.shake(420, 0.17, 0, 1);
    this.crackGroundAt(front.x, front.y, false);
    await new Promise<void>((resolve) => { window.setTimeout(resolve, 120); });
    this.tweens.timeScale = 1;
    this.crackGroundAt(front.x, front.y, true);
    void this.dollyTo(0.66, 130, 'Quad.easeOut').then(() => this.dollyTo(0.76, 700, 'Sine.easeOut'));
    this.spawnShockwave(front.x, front.y, 0xd8c3a0, 0.3, 2.8, 560);
    this.spawnShockwave(front.x, front.y, 0xfff0c8, 0.2, 1.5, 320);
    this.time.delayedCall(90, () => this.spawnShockwave(front.x, front.y, 0x8f7a60, 0.4, 3.6, 800));
    this.spawnImpactSparks(front.x, front.y, 16);
    this.spawnDirtBurst(front.x, front.y, 28);
    this.spawnSmokePuff(front.x - 0.3, front.y + 0.1);
    this.spawnSmokePuff(front.x + 0.3, front.y + 0.1);
    this.time.delayedCall(160, () => this.spawnSmokePuff(front.x, front.y + 0.25));
    this.time.delayedCall(320, () => this.spawnSmokePuff(front.x + 0.15, front.y - 0.1));
    this.scatterFireflies(front.x, front.y);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [-1, 1], [1, 1], [-2, 0], [2, 0]]) {
      this.world3d?.rustleDecor(front.x + dx, front.y + dy);
    }
    this.setVignette(0.5, 900);

    // 5. ASSENTAR: a lamina vibra e para; ela agora e a espada fincada.
    sword.setPosition(front.x, front.y);
    const wobble = { t: 0 };
    await this.tweenTo({
      targets: wobble, t: 1, duration: 1000, ease: 'Linear',
      onUpdate: () => {
        const decay = 1 - wobble.t;
        sword.setAngle(180 + Math.sin(wobble.t * Math.PI * 10) * 8 * decay * decay);
        sword.setElevation(SWORD_PLANTED_ELEV - 0.08 * decay);
      },
    });
    this.swordInHands = false;
    this.backItemBb = undefined; // o billboard das costas virou a espada do chao
    this.plantedSword?.destroy();
    this.plantedSword = sword.setAngle(180).setElevation(SWORD_PLANTED_ELEV);
    this.plantedSwordTile = { x: front.x, y: front.y };
    this.spawnMoonShaft(front.x, front.y);
    this.time.delayedCall(500, () => this.spawnGlint(front.x, front.y, SWORD_PLANTED_ELEV + 0.42, 0.6));
    this.persistAdventure();
    // A CABECA BAIXA: ele continua curvado sobre ela um instante, em silencio.
    this.hero.frame = HERO_FRAMES.idleDown;
    await this.tweenTo({ targets: this.hero, scaleY: 0.9, scaleX: 1.03, duration: 600, ease: 'Sine.easeOut' });
    await this.wait(1500);
    await this.tweenTo({ targets: this.hero, scaleX: 1, scaleY: 1, duration: 900, ease: 'Sine.easeInOut' });
    await this.wait(300);
    // Um passo para tras, sem tirar os olhos dela.
    await this.scriptStep(0, -1, 760, true);
    this.setVignette(0, 2000);
    // O quadro acompanha o passo: o heroi e a espada, agora a dois tiles, continuam juntos nele.
    await new Promise<void>((resolve) => {
      this.cutscenePan(base.x, base.y - Math.round(this.tileSize * 0.95), 1200, resolve);
    });
  }

  /**
   * Um passo ROTEIRIZADO: o heroi anda um tile sem o controle de movimento (que esta parado
   * durante a cutscene). A camera desliza junto, as pernas giram com o chao — o mesmo desenho de
   * um passo de verdade, so que quem aperta a seta e a cena.
   */
  private scriptStep(dx: number, dy: number, stepMs: number, keepFacing = false): Promise<void> {
    const from = { x: this.playerWorld.worldX, y: this.playerWorld.worldY };
    const to = { x: from.x + dx, y: from.y + dy };
    // `keepFacing`: o passo para TRAS, de olho no que fica — as pernas andam, o corpo nao vira.
    const look = keepFacing ? { ...(this.movementController?.facing ?? { dx, dy }) } : { dx, dy };
    this.movementController?.faceTo(look.dx, look.dy, true);
    this.playerWorld = { worldX: to.x, worldY: to.y };
    this.handleTileEntered(to.x, to.y, dx, dy);
    getSoundManager().playFootstep();
    return new Promise<void>((resolve) => {
      const k = { t: 0 };
      let last = 0;
      this.tweens.add({
        targets: k,
        t: 1,
        duration: stepMs,
        ease: 'Linear',
        onUpdate: () => {
          this.hero.walkDist += k.t - last;
          last = k.t;
          this.camera?.centerOn(from.x + dx * k.t, from.y + dy * k.t);
          if (this.camera) { this.hero.x = this.camera.screenCenterX; this.hero.y = this.camera.screenCenterY; }
        },
        onComplete: () => {
          this.streamChunks();
          resolve();
        },
      });
    });
  }

  /** Vira o heroi para uma direcao, parado (a cena olha em volta por ele). */
  private scriptFace(dx: number, dy: number): void {
    this.movementController?.faceTo(dx, dy, false);
  }

  /**
   * A ABERTURA — a unica cena do jogo que acontece sem o jogador, e por isso ela e curta.
   *
   * Ela e NOITE de proposito (o relogio do mundo e posto as dez da noite): e a hora dos
   * vaga-lumes, e a hora em que um cavaleiro cansado para de andar.
   */
  private async playIntro(): Promise<void> {
    const w3 = this.world3d;
    if (!w3 || !this.camera) return;
    this.cutsceneActive = true;
    setTimeOfDay(INTRO_CLOCK);
    this.ambienceClockMs = 0;
    this.campfiresFollowNight = !isNightTime();
    this.syncCampfiresToClock();
    this.updateBackItem(); // a espada nas costas: ela ainda e dele
    this.setLetterbox(true, 1400);
    w3.setWorldFade(1);
    this.cutsceneHeroLight = 0.6;
    await this.wait(400);
    this.tweens.addCounter({
      from: 1, to: 0, duration: 2200, ease: 'Sine.easeOut',
      onUpdate: (tw) => this.world3d?.setWorldFade(tw.getValue() ?? 0),
    });

    // 1. A ESTRADA: ele chega andando, devagar, do sul.
    for (let i = 0; i < INTRO_WALK_TILES; i += 1) await this.scriptStep(0, -1, INTRO_STEP_MS);
    this.scriptFace(0, -1);
    await this.wait(900);

    // 2. A ESPADA: ele se vira para a estrada que fez, tira a espada das costas e a crava no chao.
    this.scriptFace(0, 1);
    await this.wait(600);
    await this.playSwordPlanting();

    // 3. O SILENCIO: a musica ja tinha baixado; ele olha em volta, e o vale e so vaga-lume.
    getSoundManager().fadeMusicOut();
    await this.wait(1400);
    this.scriptFace(-1, 0);
    await this.wait(1100);
    this.scriptFace(1, 0);
    await this.wait(1100);
    this.scriptFace(0, -1);
    await this.wait(1300);

    // 4. O MAGO: uma figura vem pelo leste, sem pressa nenhuma.
    this.scriptFace(1, 0);
    await this.walkWizardIn();

    // 5. A CONVERSA. As faixas saem: a fala precisa do rodape inteiro.
    this.setLetterbox(false, 700);
    const base = getDialog('wizard');
    const wizardAt = { worldX: this.playerWorld.worldX + 1, worldY: this.playerWorld.worldY };
    await new Promise<void>((resolve) => {
      if (!base) { resolve(); return; }
      this.openDialogScript({ ...base, lines: tLines('wizard.intro') }, wizardAt, getDialogVoice('wizard'), resolve);
    });

    // 6. O CONTROLE VOLTA: o mago fica ali, na beira da estrada, para quem quiser conversar.
    this.npcManager?.setKindHidden('wizard', false);
    this.wizardStandIn?.destroy();
    this.wizardStandIn = undefined;
    this.introDone = true;
    void this.dollyTo(1, 1800);
    const shaft = this.moonShaft;
    this.moonShaft = undefined;
    if (shaft) this.tweens.add({ targets: shaft, alpha: 0, duration: 2400, onComplete: () => shaft.destroy() });
    this.seenDialogKeys.add(`wizard:${this.wizardLine()}`);
    this.cutsceneHeroLight = 1;
    this.cutsceneActive = false;
    this.updateBackItem();
    getSoundManager().fadeMusicIn();
    if (!isTouchDevice()) this.controlsHint = new ControlsHint(t('controls.hint'));
    this.persistAdventure();
  }

  /** O mago chega a pe pela direita da estrada e para ao lado do heroi. */
  private walkWizardIn(): Promise<void> {
    const w3 = this.world3d;
    const visual = NPC_VISUALS.wizard;
    const endX = this.playerWorld.worldX + 1;
    const y = this.playerWorld.worldY;
    if (!w3) return Promise.resolve();
    this.wizardStandIn = w3.addBillboard(visual.key, visual.frame ?? 0, { groundShadow: true })
      .setPosition(endX + WIZARD_WALK_TILES, y)
      .setDisplaySize(1, 1)
      .setFlipX(true);
    const standIn = this.wizardStandIn;
    return new Promise<void>((resolve) => {
      const k = { t: 0 };
      this.tweens.add({
        targets: k,
        t: 1,
        duration: WIZARD_WALK_TILES * 820,
        ease: 'Sine.easeOut',
        onUpdate: () => {
          standIn.setPosition(endX + WIZARD_WALK_TILES * (1 - k.t), y);
          // O passo dele e lento e redondo: um quique pequeno por tile.
          standIn.setElevation(Math.abs(Math.sin(k.t * WIZARD_WALK_TILES * Math.PI)) * 0.05);
        },
        onComplete: () => { standIn.setElevation(0); resolve(); },
      });
    });
  }

  /**
   * OS VAGA-LUMES: pontos de luz SEM luz (a lei mais cara da casa — nenhuma PointLight nasce em
   * runtime), aditivos, derivando em volta do heroi. Eles so existem de noite, e nas duas cenas
   * que precisam deles (a abertura e o fim) a noite e garantida pela propria cena.
   */
  private updateFireflies(delta: number): void {
    const w3 = this.world3d;
    if (!w3) return;
    const want = isNightTime() || this.roasting ? 1 : 0;
    this.fireflyLevel += (want - this.fireflyLevel) * Math.min(1, delta / 1500);
    if (this.fireflyLevel < 0.01 && this.fireflies.length === 0) return;
    const at = this.heroVisualTile();
    if (this.fireflies.length === 0) {
      for (let i = 0; i < FIREFLY_COUNT; i += 1) {
        const bb = w3
          .addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 2.4 })
          .setTint(i % 3 === 0 ? 0xfff2a0 : 0xd6ff8a)
          .setDisplaySize(0.085, 0.085);
        this.fireflies.push({
          bb,
          ox: at.x + (Math.random() - 0.5) * 9,
          oy: at.y + (Math.random() - 0.5) * 7,
          phase: Math.random() * Math.PI * 2,
          speed: 0.0006 + Math.random() * 0.0007,
        });
      }
    }
    for (const fly of this.fireflies) {
      fly.phase += delta * fly.speed;
      // Longe demais do heroi, o vaga-lume reaparece do outro lado do quadro — o enxame nunca
      // fica para tras, e nunca nasce colado na cara dele.
      if (Math.abs(fly.ox - at.x) > 5.5 || Math.abs(fly.oy - at.y) > 4.5) {
        fly.ox = at.x + (Math.random() - 0.5) * 9;
        fly.oy = at.y + (Math.random() - 0.5) * 7;
      }
      fly.ox += Math.sin(fly.phase * 0.37) * delta * 0.00018;
      fly.oy += Math.cos(fly.phase * 0.29) * delta * 0.00014;
      const blink = Math.max(0, Math.sin(fly.phase * 2.3));
      fly.bb
        .setPosition(fly.ox + Math.sin(fly.phase) * 0.45, fly.oy + Math.cos(fly.phase * 0.8) * 0.3)
        .setElevation(0.35 + 0.4 * (0.5 + 0.5 * Math.sin(fly.phase * 1.3)))
        .setAlpha(this.fireflyLevel * (0.2 + 0.8 * blink));
    }
  }

  /**
   * O TURNO DO DIA, o que os vaga-lumes sao para a noite. BORBOLETAS que vagueiam em volta do
   * heroi, de alvo em alvo, batendo asa (a largura respira: uma arte so), e FOLHAS que se soltam
   * das arvores DE VERDADE perto dele e descem balancando ate o chao, onde descansam e somem.
   * Nada disso traz luz (a lei do pool fixo), e tudo entra e sai em rampa com o nascer e o por do sol.
   */
  private updateDaytimeLife(delta: number): void {
    const w3 = this.world3d;
    if (!w3) return;
    const want = !isNightTime() && !this.roasting && !this.cutsceneActive ? 1 : 0;
    this.daylifeLevel += (want - this.daylifeLevel) * Math.min(1, delta / 1500);
    if (this.daylifeLevel < 0.01 && this.butterflies.length === 0 && this.leaves.length === 0) return;
    const at = this.heroVisualTile();
    const pickTarget = (): [number, number] => [at.x + (Math.random() - 0.5) * 8, at.y + (Math.random() - 0.5) * 6];

    if (this.butterflies.length === 0 && this.daylifeLevel > 0.01) {
      for (let i = 0; i < BUTTERFLY_COUNT; i += 1) {
        const [x, y] = pickTarget();
        const [tx, ty] = pickTarget();
        const size = 0.25 + Math.random() * 0.07;
        const bb = w3.addBillboard(BUTTERFLY_TEXTURE, 0, { centered: true, depthWrite: false })
          .setTint(BUTTERFLY_TINTS[i % BUTTERFLY_TINTS.length])
          .setDisplaySize(size, size * 0.86);
        this.butterflies.push({ bb, x, y, tx, ty, phase: Math.random() * 10, size });
      }
    }
    for (const b of this.butterflies) {
      b.phase += delta * 0.001;
      // Longe do quadro ela volta por outro lado; perto do alvo, escolhe outro.
      if (Math.abs(b.x - at.x) > 6 || Math.abs(b.y - at.y) > 5) [b.x, b.y] = pickTarget();
      if (Math.hypot(b.tx - b.x, b.ty - b.y) < 0.3) [b.tx, b.ty] = pickTarget();
      const dx = b.tx - b.x;
      const dy = b.ty - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const step = delta * 0.0011;
      // O voo de borboleta nunca e reto: um zigue-zague por cima da reta ate o alvo.
      const wob = Math.sin(b.phase * 5.3) * 0.7;
      b.x += (dx / d - (dy / d) * wob) * step;
      b.y += (dy / d + (dx / d) * wob) * step;
      const flap = Math.abs(Math.sin(b.phase * 22));
      b.bb
        .setPosition(b.x, b.y)
        .setElevation(0.45 + 0.25 * Math.sin(b.phase * 1.7) + 0.06 * flap)
        .setDisplaySize(b.size * (0.25 + 0.75 * flap), b.size * 0.86)
        .setAlpha(this.daylifeLevel);
    }
    if (want === 0 && this.daylifeLevel < 0.02) {
      for (const b of this.butterflies) b.bb.destroy();
      this.butterflies.length = 0;
    }

    // As folhas: de tempos em tempos, uma arvore perto do heroi solta uma.
    this.leafClockMs -= delta;
    const chunks = this.chunkManager;
    if (chunks && this.leafClockMs <= 0 && this.leaves.length < LEAF_MAX && this.daylifeLevel > 0.5) {
      this.leafClockMs = 700 + Math.random() * 1300;
      for (let tries = 0; tries < 8; tries += 1) {
        const wx = Math.round(at.x + (Math.random() - 0.5) * 9);
        const wy = Math.round(at.y + (Math.random() - 0.5) * 6);
        if (!chunks.hasChunkCoordinate(Math.floor(wx / CHUNK_COLUMNS), Math.floor(wy / CHUNK_ROWS))) continue;
        const { upper } = chunks.getTile(wx, wy);
        if (upper === null || !CHOPPABLE_UPPER_FRAMES.has(upper)) continue;
        const bb = w3.addBillboard(LEAF_TEXTURE, 0, { centered: true, depthWrite: false })
          .setTint(LEAF_TINTS[Math.floor(Math.random() * LEAF_TINTS.length)])
          .setDisplaySize(0.17, 0.13);
        this.leaves.push({
          bb, x: wx + (Math.random() - 0.5) * 0.6, y: wy + 0.15, elev: 0.95 + Math.random() * 0.3,
          t: 0, sway: Math.random() * 6, spin: Math.random() < 0.5 ? -1 : 1, landedMs: -1,
        });
        break;
      }
    }
    for (let i = this.leaves.length - 1; i >= 0; i -= 1) {
      const leaf = this.leaves[i];
      leaf.t += delta;
      let alpha = 1;
      if (leaf.landedMs < 0) {
        // Cai como folha: devagar, balancando para os lados, e o balanco e o que a faz girar.
        leaf.elev -= delta * 0.00022;
        const sway = Math.sin(leaf.t * 0.0032 + leaf.sway);
        leaf.x += sway * delta * 0.00035;
        leaf.bb.setAngle(sway * 40 * leaf.spin);
        if (leaf.elev <= 0.02) {
          leaf.elev = 0.02;
          leaf.landedMs = 0;
        }
      } else {
        // No chao: descansa um pouco e some.
        leaf.landedMs += delta;
        alpha = 1 - Math.min(1, Math.max(0, leaf.landedMs - LEAF_REST_MS) / LEAF_FADE_MS);
        if (alpha <= 0) {
          leaf.bb.destroy();
          this.leaves.splice(i, 1);
          continue;
        }
      }
      leaf.bb.setPosition(leaf.x, leaf.y).setElevation(leaf.elev).setAlpha(alpha * this.daylifeLevel);
    }
  }

  /**
   * O SOM DO LUGAR: quanto de dia, de noite e de agua os leitos de ambiente tocam agora. A noite
   * entra e sai em rampa em volta do nascer e do por do sol (nada de corte), e o marulho cresce
   * nos ultimos seis tiles ate a beira de qualquer agua — prop de rio ou lago pintado no terreno
   * (`isOpenWaterAt`, a resposta unica para as duas). Medido de 400 em 400ms: o ganho desliza
   * sozinho no SoundManager.
   */
  private updateAmbienceMix(delta: number): void {
    this.ambienceClockMs -= delta;
    if (this.ambienceClockMs > 0) return;
    this.ambienceClockMs = 400;
    const phase = getTimeOfDay();
    const night = Math.min(1, Math.max(0, 0.5 + 1.6 * Math.cos(2 * Math.PI * phase)));
    const { worldX: hx, worldY: hy } = this.playerWorld;
    let nearest = Infinity;
    for (let dy = -6; dy <= 6; dy += 1) {
      for (let dx = -6; dx <= 6; dx += 1) {
        const d = Math.hypot(dx, dy);
        if (d < nearest && this.isOpenWaterAt(hx + dx, hy + dy)) nearest = d;
      }
    }
    const water = Number.isFinite(nearest) ? Math.min(1, Math.max(0, 1 - (nearest - 1) / 5)) : 0;
    getSoundManager().setAmbienceMix(night, water);
  }

  /**
   * O QUE O MAGO DIRIA AGORA. Ele nao tem missao: ele e quem aponta. Antes do portao ele lembra
   * que ha gente esperando; com o portao aberto ele manda o heroi para o centro do vale; depois
   * do fim ele so fica feliz.
   */
  private wizardLine(): 'guide' | 'gate' | 'after' {
    if (this.roasted) return 'after';
    if (this.gateOpened) return 'gate';
    return 'guide';
  }

  private openWizardDialog(npcWorld: { worldX: number; worldY: number }): void {
    if (this.dialogOpen) return;
    const base = getDialog('wizard');
    if (!base) return;
    const line = this.wizardLine();
    this.seenDialogKeys.add(`wizard:${line}`);
    this.persistAdventure();
    this.openDialogScript({ ...base, lines: tLines(`wizard.${line}`) }, npcWorld, getDialogVoice('wizard'));
  }

  /** O presente que este NPC ainda tem para dar (a ferramenta do pedido), se tiver. */
  private pendingGift(dialogId: string): Array<{ item: HeldItemKind; count: number }> | undefined {
    if (!this.adventure) return undefined;
    const quest = questFor(dialogId);
    if (!quest?.gift || adventureState().giftsGiven.has(dialogId)) return undefined;
    return quest.gift;
  }

  /**
   * POR O PRESENTE NA MAO: cada item entra na mochila, e o que o heroi nunca teve ganha a
   * cerimonia de item-get, um de cada vez (a fila e o callback do anterior).
   */
  private handGift(dialogId: string, gift: Array<{ item: HeldItemKind; count: number }>): void {
    adventureState().giftsGiven.add(dialogId);
    for (const { item, count } of gift) this.inventory.add(item, count);
    this.inventory.selectFirstIfEmpty();
    // O presente vai para a mao: e a ferramenta do pedido que acabou de ser feito.
    const first = gift.find(({ item }) => isBagItem(item));
    if (first) this.selectItem(first.item);
    this.updateBackItem();
    this.persistAdventure();
    const fresh = gift.map(({ item }) => item).filter((item) => !this.seenItems.has(item));
    const next = (): void => {
      const kind = fresh.shift();
      if (!kind) return;
      this.seenItems.add(kind);
      this.showItemGet(kind, next);
    };
    if (fresh.length > 0) next();
    else getSoundManager().playSwordPickup();
  }

  /**
   * UM PEDIDO FECHOU. O vale agradece com pouco — um sino, um brilho no heroi — e, se era o
   * ultimo, o portao do jardim se abre.
   */
  private celebrateQuestDone(_npcWorld: { worldX: number; worldY: number } | undefined): void {
    this.refreshQuestMarks();
    getSoundManager().playSingingBowl();
    this.spawnGrowSparkle(this.playerWorld.worldX, this.playerWorld.worldY);
    // O primeiro favor traz o gato: o vale decidiu que o cavaleiro fica.
    this.time.delayedCall(1200, () => this.ensureCat(true));
    if (!this.gateOpened && allQuestsDone()) this.time.delayedCall(700, () => this.openGardenGate());
  }

  /**
   * O PORTAO DO JARDIM ABRE. Ele fica longe de onde o ultimo pedido fechou, entao ninguem o ve
   * abrir: quem conta e o som que atravessa o vale e uma linha do narrador. O mago passa a falar
   * disso tambem — ele e o mapa deste jogo.
   */
  private openGardenGate(): void {
    if (this.gateOpened) return;
    this.gateOpened = true;
    for (const gate of this.gardenGates) gate.unlock();
    this.persistAdventure();
    getSoundManager().playGateSwing();
    this.softWash(0xffecbe, 0.2, 1600);
    const base = getDialog('wizard');
    if (!base || this.dialogOpen) return;
    this.openDialogScript({ ...base, npcName: '', lines: tLines('gate.opened') }, undefined, undefined);
  }

  /** As fogueiras do fim deste tile, se houver. */
  private getHearthAt(wx: number, wy: number): CampfireObject | undefined {
    return this.propAt(this.hearths, wx, wy);
  }

  /**
   * O Z NA FOGUEIRA DO FIM. Apagada, ele a ACENDE (sem tocha: ele tem pederneira, e este fogo e
   * dele). Acesa, ele senta e assa — se tiver um graveto e um cogumelo. Sem um dos dois, o
   * pensamento dele mostra o que falta (o icone, nunca a palavra).
   */
  private tendHearthAt(wx: number, wy: number): boolean {
    const hearth = this.getHearthAt(wx, wy);
    if (!hearth) return false;
    if (this.roasted || this.cutsceneActive) return true;
    if (!hearth.isLit) {
      void this.lightHearth(hearth, wx, wy);
      return true;
    }
    if (this.inventory.count('wood') < 1) { this.heroThought?.show(ASSET_KEYS.woodIcon); return true; }
    if (this.inventory.count('mushroom') < 1) { this.heroThought?.show(ASSET_KEYS.mushroomItem); return true; }
    void this.playRoastEnding(hearth, wx, wy);
    return true;
  }

  /** Acender a fogueira do fim: tres faiscas, a chama pegando aos poucos, e o calor. */
  private async lightHearth(hearth: CampfireObject, wx: number, wy: number): Promise<void> {
    this.cutsceneActive = true;
    this.stopBreathing();
    for (let i = 0; i < 3; i += 1) {
      this.hero.frame = HERO_FRAMES.attack;
      getSoundManager().playRockSmash();
      this.spawnFireHitEffect(wx, wy);
      await this.wait(180);
      this.hero.frame = HERO_FRAMES.idleDown;
      await this.wait(320);
    }
    await new Promise<void>((resolve) => {
      const grow = { t: 0 };
      this.tweens.add({
        targets: grow, t: 1, duration: 1600, ease: 'Sine.easeIn',
        onUpdate: () => hearth.igniteProgress(grow.t),
        onComplete: () => resolve(),
      });
    });
    hearth.light();
    this.hearthLit = true;
    getSoundManager().playIgnite();
    this.spawnFireHitEffect(wx, wy);
    this.softWash(0xffd28c, 0.22, 1400);
    this.persistAdventure();
    this.cutsceneActive = false;
  }

  /**
   * O FIM. Ele senta na frente do fogo, espeta o cogumelo no graveto e o segura sobre a chama.
   * O chapeu doura aos poucos, os vaga-lumes passam, a brisa mexe no mato. Ninguem diz nada por
   * um tempo — e entao o quadro escurece e os creditos sobem.
   */
  private async playRoastEnding(hearth: CampfireObject, wx: number, wy: number): Promise<void> {
    const w3 = this.world3d;
    const hb = this.heroBillboard;
    if (!w3 || !hb) return;
    this.cutsceneActive = true;
    this.roasting = true;
    this.roasted = true;
    this.inventory.remove('wood');
    this.inventory.remove('mushroom');
    this.extinguishTorch();
    this.updateBackItem();
    this.backItemBb?.setVisible(false);
    this.quickBag?.setButtonVisible(false);
    this.actionButtons?.setVisible(false);
    this.controlsHint?.destroy();
    this.controlsHint = undefined;
    // O SAVE SO APRENDE O FIM QUANDO OS CREDITOS SOBEM (la embaixo). Gravado aqui, um jogo
    // fechado no meio da cena voltava "zerado", sem graveto, sem cogumelo e sem final para ver.
    this.stopBreathing();
    getSoundManager().fadeMusicOut();

    // Mais tarde, naquela noite: o mundo apaga um instante e volta escuro, so o fogo e os
    // vaga-lumes acesos.
    await this.fadeWorld(0, 1, 900);
    setTimeOfDay(INTRO_CLOCK);
    this.ambienceClockMs = 0;
    this.campfiresFollowNight = !isNightTime();
    this.syncCampfiresToClock();
    if (!hearth.isLit) hearth.light();
    // SENTADO: o corpo baixa e alarga um pouco (a pose de quem dobrou os joelhos na frente do
    // fogo), de frente para a chama.
    const toFire = { dx: Math.sign(wx - this.playerWorld.worldX), dy: Math.sign(wy - this.playerWorld.worldY) };
    this.scriptFace(toFire.dx, toFire.dy);
    this.hero.scaleY = 0.84;
    this.hero.scaleX = 1.04;
    const stick = w3.addBillboard(ROAST_STICK_TEXTURE, 0, { centered: true })
      .setDisplaySize(0.62, 0.62);
    const stickAt = (): void => {
      stick.setPosition(hb.x + toFire.dx * 0.55 + 0.08, hb.y + toFire.dy * 0.42 + 0.06);
    };
    stickAt();
    stick.setElevation(0.42);
    this.roastStick = stick;
    await this.fadeWorld(1, 0, 1800);

    // O espeto balanca devagar sobre a chama — a mao de quem nao tem pressa nenhuma.
    this.tweens.add({ targets: stick, elevation: 0.5, duration: 1400, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    for (let i = 0; i < 6; i += 1) {
      await this.wait(900);
      stickAt();
      if (i % 2 === 0) this.spawnFireHitEffect(wx, wy);
      this.world3d?.rustleDecor(this.playerWorld.worldX - 1, this.playerWorld.worldY);
      this.world3d?.rustleDecor(this.playerWorld.worldX + 1, this.playerWorld.worldY + 1);
    }
    // Dourou.
    stick.setTexture(ROAST_STICK_DONE_TEXTURE, 0);
    getSoundManager().playSingingBowl();
    this.spawnFireHitEffect(wx, wy);
    await this.wait(2400);

    // Uma frase, e o silencio.
    await new Promise<void>((resolve) => {
      const base = getDialog('wizard');
      if (!base) { resolve(); return; }
      this.openDialogScript({ ...base, npcName: '', lines: tLines('ending.lines') }, undefined, undefined, resolve);
    });
    await this.wait(2600);
    this.persistAdventure();
    this.rollCredits();
  }

  /** Um fade do mundo 3D entre dois niveis (0 = claro, 1 = preto). */
  private fadeWorld(from: number, to: number, duration: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.tweens.addCounter({
        from, to, duration, ease: 'Sine.easeInOut',
        onUpdate: (tw) => this.world3d?.setWorldFade(tw.getValue() ?? to),
        onComplete: () => resolve(),
      });
    });
  }

  /**
   * OS CREDITOS. Uma tela DOM por cima de tudo (o texto em serifa nitida, como o dialogo): o
   * quadro escurece, "The End" assenta, os nomes sobem devagar, e no fim o titulo volta. Uma
   * tecla depois do primeiro instante pula para o titulo.
   */
  private rollCredits(): void {
    this.creditsRoll?.remove();
    const root = document.createElement('div');
    root.className = 'zh-credits';
    root.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:60', 'background:#000', 'opacity:0',
      'transition:opacity 2.4s ease', 'display:flex', 'flex-direction:column', 'align-items:center',
      'overflow:hidden', "font-family:Georgia,'Times New Roman',serif", 'color:#e7dcc4',
    ].join(';');
    const end = document.createElement('div');
    end.textContent = t('ending.theEnd');
    end.style.cssText = 'position:absolute;top:40%;width:100%;text-align:center;font-style:italic;'
      + 'font-size:clamp(28px,6vw,64px);opacity:0;transition:opacity 2.2s ease;';
    const roll = document.createElement('div');
    roll.style.cssText = 'position:absolute;top:100%;width:100%;text-align:center;line-height:1.9;'
      + 'font-size:clamp(14px,2.4vw,22px);';
    for (const line of tLines('ending.credits')) {
      const p = document.createElement('div');
      p.textContent = line.text;
      if (line.speaker === 'narrator') p.style.cssText = 'color:#8a8594;font-size:0.8em;margin-top:1.4em;';
      else p.style.cssText = 'color:#e7dcc4;';
      roll.appendChild(p);
    }
    root.append(end, roll);
    document.body.appendChild(root);
    this.creditsRoll = root;
    requestAnimationFrame(() => { root.style.opacity = '1'; });

    let went = false;
    const goTitle = (): void => {
      if (went) return;
      went = true;
      window.removeEventListener('keydown', onKey, true);
      root.style.opacity = '0';
      getSoundManager().stopMusic();
      getSoundManager().stopAmbience();
      window.setTimeout(() => {
        root.remove();
        if (this.creditsRoll === root) this.creditsRoll = undefined;
        if (this.scene.get('title')) this.scene.start('title');
        else this.scene.restart();
      }, 1200);
    };
    let skippable = false;
    const onKey = (event: KeyboardEvent): void => {
      if (!skippable) return;
      event.preventDefault();
      goTitle();
    };
    window.addEventListener('keydown', onKey, true);
    window.setTimeout(() => { end.style.opacity = '1'; getSoundManager().startMusic('menu', 3000); }, 2600);
    window.setTimeout(() => {
      end.style.opacity = '0';
      skippable = true;
      roll.style.transition = `top ${CREDITS_SCROLL_MS}ms linear`;
      roll.style.top = '-120%';
    }, 7200);
    window.setTimeout(goTitle, 7200 + CREDITS_SCROLL_MS + 1500);
  }

  /** Um brilho verde subindo de um tile: o canteiro brotou, ou alguem ficou contente. */
  private spawnGrowSparkle(wx: number, wy: number): void {
    const w3 = this.world3d;
    if (!w3) return;
    for (let i = 0; i < 8; i += 1) {
      const mote = w3
        .addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 2 })
        .setTint(i % 2 === 0 ? 0xc8ff9a : 0xfff0b0)
        .setPosition(wx + (Math.random() - 0.5) * 0.8, wy + (Math.random() - 0.5) * 0.5)
        .setElevation(0.1 + Math.random() * 0.2)
        .setDisplaySize(0.1, 0.1)
        .setAlpha(0.9);
      this.tweens.add({
        targets: mote,
        elevation: 0.9 + Math.random() * 0.5,
        alpha: 0,
        duration: 700 + Math.random() * 500,
        delay: i * 60,
        ease: 'Sine.easeOut',
        onComplete: () => mote.destroy(),
      });
    }
  }

  private openNpcDialog(
    kind: import('@/game/world/ScreenContent').NpcKind,
    npcWorld?: { worldX: number; worldY: number },
    scriptId?: string,
  ): void {
    if (this.dialogOpen) return;
    const askId = scriptId ?? kind;
    const base = getDialog(kind, askId);
    if (!base) return;
    // A ENTREGA VEM ANTES DA FALA. Cumprida a missão, `spokenDialogId` devolve o outro roteiro —
    // já nesta mesma conversa, que é o ponto: entregar e ouvir o obrigado é um gesto só.
    const closedNow = this.settleQuestDelivery(askId);
    const speakId = this.spokenDialogId(askId);
    // Roteiro alternativo sem entrada no world.json cai no de sempre: uma missão sem fala nova
    // não pode emudecer o NPC.
    let script = speakId === askId ? base : (getDialog(kind, speakId) ?? base);
    // O PRESENTE: a primeira conversa com quem pede põe na mão do herói a ferramenta do pedido
    // (ver NpcQuest.gift). Ele chega DEPOIS da fala, quando a caixa fecha — primeiro o pedido,
    // depois o machado, que é a ordem em que alguém pede um favor de verdade.
    const gift = this.pendingGift(askId);
    // O PRÓXIMO PASSO de um pedido longo (NpcQuest.hints): na primeira conversa ele vem depois do
    // pedido; nas seguintes ele É a conversa — repetir o pedido inteiro não ensina nada novo.
    const hint = this.questHint(askId);
    const hintLines = hint ? tLines(`npc.${askId}Hint.${hint}`) : [];
    if (hintLines.length > 0) script = { ...script, lines: gift ? [...script.lines, ...hintLines] : hintLines };
    if (npcWorld) {
      const key = this.dialogKeyFor(kind, npcWorld.worldX, npcWorld.worldY, scriptId);
      if (key) {
        this.seenDialogKeys.add(key);
        this.persistAdventure(); // o "!" apagado fica apagado
      }
    }
    this.openDialogScript(script, npcWorld, getDialogVoice(kind, speakId) ?? getDialogVoice(kind, askId), () => {
      if (gift) {
        if (npcWorld) this.npcManager?.hop(npcWorld.worldX, npcWorld.worldY);
        this.handGift(askId, gift);
      }
      // O pedido fechou nesta conversa: um pulinho de alegria, coracoes, e o vale responde.
      if (closedNow) {
        if (npcWorld) {
          this.npcManager?.hop(npcWorld.worldX, npcWorld.worldY, 0.3);
          this.spawnHearts(npcWorld.worldX, npcWorld.worldY);
        }
        this.celebrateQuestDone(npcWorld);
      }
    });
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
    if (kind === 'wizard') return `wizard:${this.wizardLine()}`;
    if (!getDialog(kind, scriptId)) return null;
    // A chave é do ROTEIRO FALADO, não da espécie: três gatos com três aulas são três "!" a
    // apagar, e com a chave por espécie ouvir um deles apagaria a marca dos outros dois. Ela lê
    // o roteiro que a MISSÃO escolheu, e é assim que fechar um pedido reacende o "!" do NPC —
    // ele tem fala nova, que é exatamente o que a marca sempre quis dizer.
    void wx; void wy;
    const hint = this.questHint(scriptId ?? kind);
    return `${this.spokenDialogId(scriptId ?? kind)}:${hint ? `hint:${hint}` : 'base'}`;
  }

  /**
   * O degrau em que o herói está num pedido longo: o primeiro item de `hints` que ele ainda não
   * teve nas mãos. Com todos vistos (a barra foi parar numa receita, digamos) fica o último — o
   * que falta é sempre refazer o fim. Pedido cumprido não ensina mais nada.
   */
  private questHint(dialogId: string): HeldItemKind | null {
    if (!this.adventure || this.spokenDialogId(dialogId) !== dialogId) return null;
    const steps = questFor(dialogId)?.hints;
    if (!steps || steps.length === 0) return null;
    return steps.find((item) => !this.seenItems.has(item)) ?? steps[steps.length - 1];
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
    this.useBufferMs = 0;
    // A caixa de fala mora no MESMO rodapé que o par A/B e o botão da bolsa. Eles já estão
    // calados (`canAct`), então o que sobra deles é o pedaço que espia ao lado da caixa: saem
    // de cena junto, como saem quando a bolsa abre.
    this.quickBag?.setButtonVisible(false);
    this.actionButtons?.setVisible(false);
    // Pan so the hero + NPC sit centered on the stage ABOVE the box.
    this.dialogNpcWorld = npcWorld;
    this.startDialogCameraShift(npcWorld);
    // Focus on the conversation: fade the music down while the NPC talks.
    getSoundManager().fadeMusicOut();
    this.dialogOverlay = new DialogOverlay(this, script, () => {
      this.dialogOverlay?.destroy();
      this.dialogOverlay = undefined;
      this.dialogOpen = false;
      this.quickBag?.setButtonVisible(true);
      this.actionButtons?.setVisible(true);
      this.endDialogCameraShift();
      getSoundManager().fadeMusicIn();
      onClosed?.();
    }, voice);
  }

  // ── AS MISSÕES DOS NPCs ────────────────────────────────────────────────────
  // O sistema inteiro (ver dialogs/NpcQuests + runtime/QuestLog) toca a cena em três lugares e
  // em mais nenhum: o FUNIL abaixo, que conta o que aconteceu no mundo; a ENTREGA, que é o
  // gesto de falar com quem pediu; e a ESCOLHA DE ROTEIRO, que é o único efeito visível de tudo
  // isto — o NPC dizendo outra coisa. Não há tela de missão, de propósito.

  /**
   * O FUNIL. Fora da aventura ele não existe: o contador mora no save, e um level ou uma corrida
   * do explorador escrevendo nele sujaria a aventura de quem só foi jogar um puzzle.
   */
  private questEvent(event: QuestEvent): void {
    if (!this.adventure) return;
    const { moved, closed } = recordQuestEvent(event);
    if (!moved) return;
    this.persistAdventure();
    // Uma tarefa sem entrega (o canteiro brotando) pode fechar o pedido no meio do mundo, longe
    // de quem pediu: o vale reage na hora, e o obrigado espera a próxima conversa.
    if (closed.length > 0) this.celebrateQuestDone(undefined);
  }

  /** O roteiro que este NPC fala AGORA — o alternativo, se ele já recebeu o que pediu. */
  private spokenDialogId(dialogId: string): string {
    return this.adventure ? questDialogFor(dialogId) : dialogId;
  }

  /**
   * ENTREGAR É FALAR — e é TUDO OU NADA. Não há botão de dar: quem pediu cobra na conversa. Mas
   * ele só leva a carga INTEIRA de um pedido: com quatro dos seis minérios na mochila, o
   * astronauta não encosta em nenhum.
   *
   * Isto não é rigor, é a única leitura honesta num sistema SEM interface. Entrega parcial seria
   * confisco silencioso: o jogador veria a mochila esvaziar ao passar perto de quem pediu, sem
   * nada na tela dizendo que aquilo virou progresso — e sem nada dizendo quanto ainda falta. Com
   * tudo-ou-nada, o único momento em que a mochila muda é o mesmo momento em que o NPC passa a
   * falar outra coisa: a resposta chega junto com o preço.
   */
  private settleQuestDelivery(dialogId: string): boolean {
    if (!this.adventure) return false;
    let handed = false;
    let closed = false;
    for (const due of questDeliveriesDue(dialogId)) {
      if (this.inventory.count(due.item) < due.missing) continue;
      this.inventory.remove(due.item, due.missing);
      const result = recordQuestEvent({ type: 'deliver', dialog: dialogId, item: due.item, units: due.missing });
      if (result.closed.length > 0) closed = true;
      handed = true;
    }
    if (!handed) return false;
    // A entrega pode ter esvaziado a mão: as costas do herói têm de acompanhar.
    this.updateBackItem();
    this.persistAdventure();
    return closed;
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

  // Screen anchor while a dialog is open: put the hero↔NPC midpoint at the center of the PALCO
  // — a faixa que sobra ACIMA da caixa de fala, que é uma barra no rodapé. A altura dela sai de
  // `dialogBoxMetrics`, a mesma conta que o DialogOverlay desenha: fosse outra, a fala taparia
  // quem a diz. camX stays on the hero, so shifting only screenCenterX/Y keeps the hero's
  // sprite pinned correctly to the ground it stands on.
  private dialogScreenCenter(npcWorld?: { worldX: number; worldY: number }): { x: number; y: number } {
    const base = this.baseScreenCenter();
    const { boxHeight, margin } = dialogBoxMetrics(this.scale.width, this.scale.height);
    const stageCenterY = Math.floor((this.scale.height - boxHeight - margin) / 2);
    if (!npcWorld) return { x: base.x, y: stageCenterY };
    const dx = npcWorld.worldX - this.playerWorld.worldX;
    const dy = npcWorld.worldY - this.playerWorld.worldY;
    return {
      x: Math.round(base.x - (dx * this.tileSize) / 2),
      y: Math.round(stageCenterY - (dy * this.tileSize) / 2),
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
    this.lootManager?.render(this.tileSize, this.camera);
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
      w.setBuildHint(dist === 1 && !this.dialogOpen);
      w.render(this.tileSize, this.camera);
    }
    // O keycap da marca de posicionamento e overlay 2D projetado, como o "!" do NPC.
    if (this.camera) this.placementHints?.render(this.tileSize, this.camera, this.time.now);
    // O aviso de apanhar segue o corpo DESENHADO, e nao o tile logico: a logica salta para o
    // destino no primeiro frame do passo, e o nome sairia um tile na frente do heroi a cada passo.
    if (this.camera) {
      const at = this.movementController?.visualWorld(this.playerWorld.worldX, this.playerWorld.worldY)
        ?? { x: this.playerWorld.worldX, y: this.playerWorld.worldY };
      // O balao de pensamento monta no MESMO ponto do aviso de apanhar, e pelo mesmo motivo: a
      // ancora e o corpo DESENHADO. O relogio dele corre no update (ver HeroThought.tick).
      this.heroThought?.render(this.tileSize, this.camera, this.time.now, at);
    }
    // O MESMO keycap sobre a BANCADA que o herói está encarando: sem ele o catálogo de fabricacao
    // seria um recurso invisível, que é justamente o defeito que ele veio consertar. A condição é
    // a precondição dos dois botões — adjacente E de frente —, lida do mesmo `facingTile` que o A
    // vai usar, para o anúncio nunca prometer um gesto que o botão recusaria.
    if (this.toolboxes.length || this.furnaces.length || this.altars.length) {
      const front = this.facingTile();
      const canTalk = !this.dialogOpen && !this.orderOverlay
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
      // Efeito e audio so existem perto do heroi.
      const effectsVisible = Math.hypot(
        mf.worldX - this.playerWorld.worldX,
        mf.worldY - this.playerWorld.worldY,
      ) <= 10;
      mf.update(delta, effectsVisible);
    }
  }

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
    this.questEvent({ type: 'gather', item: item.kind, units: item.units ?? 1 });
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
    // Ate a espada ficar fincada, as costas mostram ELA; depois disso, de maos vazias, nada.
    const carried: HeldItemKind | null = this.heldItem === 'none' ? (this.introDone ? null : 'sword') : this.heldItem;
    if (!carried) {
      this.backItemBb?.setVisible(false);
      return;
    }
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
    if (!bb?.visible || !hb || this.swordInHands) return;
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
    const { upper, collision } = chunks.getTile(wx, wy);
    // COLISAO PINTADA E UMA TRAVA: a sebe que cerca o jardim do centro e de pinheiro, e o machado
    // de aco derruba pinheiro. Sem esta linha o portao do fim seria uma porta numa parede que se
    // corta — a arvore com colisao autorada a mao e cenario, nunca lenha.
    if (collision) return null;
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
    if (this.adventure) {
      // Edicao de TERRENO entra no save como diff (applyFelledTreeDiff a reaplica em cada boot).
      adventureState().felledTrees.add(`${wx},${wy}`);
      this.questEvent({ type: 'fell' }); // a clareira que o poeta pede se mede aqui
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
      this.itemManager.drop(kind, worldX, worldY, undefined, units);
      this.persistAdventure();
      return;
    }
    for (const [dx, dy] of CARDINAL_DIRS) {
      const nx = worldX + dx;
      const ny = worldY + dy;
      // O produto nunca cai num rio, na lava ou dentro de um corpo solido — um item so pousa
      // onde o heroi pode pisar pra busca-lo.
      if (this.isSolidForEntities(nx, ny) || this.itemManager.hasItemAt(nx, ny)) continue;
      this.itemManager.drop(kind, nx, ny, undefined, units);
      this.persistAdventure();
      return;
    }
  }

  private dropTreeStick(worldX: number, worldY: number): void {
    // Um PACOTE de dois (ver TREE_STICK_YIELD), e não dois itens no chão: apanhar é um gesto só,
    // e o pacote já existe no jogo (o cabo sai de cinco em cinco).
    this.dropProduct('wood', worldX, worldY, TREE_STICK_YIELD);
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
   * O bloco que o VEIO produz SALTA E ESPALHA (pedido do usuário: minerar tem que fluir):
   * pula da pedra, quica num tile vizinho e se pega ANDANDO por cima — a exceção deliberada
   * ao "nada entra na mochila por pisada". A outra metade da exceção: `stash`, nunca `add` —
   * o minério entra na mochila e a MÃO do herói fica exatamente com o que estava (a picareta,
   * no meio da mineração, não pode ser roubada por cada bloco que cai).
   */
  private spawnOreLoot(rock: RockObject): void {
    if (!this.lootManager || !this.chunkManager) return;
    this.lootManager.spawnLoot(
      rock.worldX, rock.worldY, this.chunkManager, 1,
      // A arte do MINERIO, e nao a do ferro: ela ficou para tras quando a cadeia do ferro entrou,
      // e o resultado eram dois "minerios" diferentes na tela — um com cara de bloco de metal
      // (este) e outro com cara de pedra (o do chao). Mesma coisa, dois desenhos.
      { key: 'ore-item', size: 0.6 },
      () => {
        this.inventory.stash('ore', 1);
        // O MESMO som do minerio apanhado no chao (ver playItemStash). Um objeto que soa de dois
        // jeitos conforme a procedencia e a mesma confusao que a arte errada fazia, so que pelo
        // ouvido.
        getSoundManager().playItemStash();
        this.persistAdventure();
      },
    );
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
  }

  /** Apply sunrise/sunset to every ambient fire once per transition, never every frame. */
  private syncCampfiresToClock(): void {
    const night = isNightTime();
    if (night === this.campfiresFollowNight) return;
    this.campfiresFollowNight = night;
    for (const campfire of this.campfires) {
      if (this.keptLitFires.has(campfire)) continue; // aceso por um pedido: o dia nao o apaga
      campfire.setClockLit(night);
    }
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
      this.softWash(0x96b4cd, 0.12, 900);
    }
  }

  // A regrowing tree may only sprout (and only counts its clock) when NOTHING is on its tile —
  // the hero, an enemy, or an item. The item check is key: a felled tree drops a graveto on its
  // stump, and the tree must not grow back until that graveto is picked up (the regrow clock
  // stays paused while it sits there).
  private isTileClearForRegrow(wx: number, wy: number): boolean {
    if (wx === this.playerWorld.worldX && wy === this.playerWorld.worldY) return false;
    if (this.itemManager?.hasItemAt(wx, wy)) return false;
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
        this.world3d?.shake(160, 0.003);
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
    this.itemGetOverlay = new ItemGetOverlay(this, {
      ...ITEM_GET_CFG[kind], label: t(`items.get.${kind}`),
    }, () => {
      this.itemGetOverlay?.destroy();
      this.itemGetOverlay = undefined;
      this.itemGetOpen = false;
      getSoundManager().fadeMusicIn();
      afterClose();
    });
  }

  private startBreathing(): void {
    if (this.breathingTween?.isPlaying()) return;
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

  private stopBreathing(): void {
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
