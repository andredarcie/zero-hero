import Phaser from 'phaser';

import {
  ASSET_KEYS,
  BOMB_FRAMES,
  CAMPFIRE_SAFE_RADIUS_TILES,
  CHOPPABLE_UPPER_FRAMES,
  CHUNK_COLUMNS,
  CHUNK_ROWS,
  DIALOG_PANEL_FRACTION,
  DIALOG_PANEL_MAX_WIDTH,
  FONT_FAMILY,
  GAMEPLAY_HERO_MAX_SIZE,
  GAMEPLAY_HERO_SCALE,
  HERO_FRAMES,
  HUD_HEALTH_MAX,
  ITEM_FRAMES,
  KEY_FRAMES,
  LIGHT_RADIUS_TILES,
  MIN_BOARD_TILE_SIZE,
  NPC_GATE_RADIUS_TILES,
  SCENE_DEPTHS,
  TEXT_RESOLUTION,
  TIMINGS,
  TORCH_BURN_MS,
  TREE_CHOP_STAGE_FRAMES,
  TREE_TILE_STICK_CHANCE,
} from '@/game/constants';
import type { AppMode } from '@/game/config';
import type { DialogScript, DialogVoice } from '@/game/dialogs/NpcDialogs';
import { clearGameDebugApi, registerGameDebugApi, type GameDebugApi } from '@/game/debug/debugHooks';
import { initProfiler, profiler } from '@/game/debug/Profiler';
import { CoinManager } from '@/game/entities/CoinManager';
import type { EnemyBase } from '@/game/entities/EnemyBase';
import { EnemyManager } from '@/game/entities/EnemyManager';
import { RING_MAX_TILES, UndeadSpawnDirector } from '@/game/entities/UndeadSpawnDirector';
import { NpcManager } from '@/game/entities/NpcManager';
import { HeartPickupManager } from '@/game/entities/HeartPickupManager';
import { ItemManager } from '@/game/entities/ItemManager';
import type { CollectedItem } from '@/game/entities/ItemManager';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { CHOP_DRIVE_AT_MS, CHOP_IMPACT_MS, CHOP_TOTAL_MS, SwordSlash } from '@/game/runtime/SwordOrbit';
import { CampfireObject } from '@/game/objects/CampfireObject';
import { DryBushObject } from '@/game/objects/DryBushObject';
import { DryTreeObject } from '@/game/objects/DryTreeObject';
import { DryShrubObject } from '@/game/objects/DryShrubObject';
import { LavaObject } from '@/game/objects/LavaObject';
import { WaterObject } from '@/game/objects/WaterObject';
import { LockedDoorObject } from '@/game/objects/LockedDoorObject';
import { RockObject } from '@/game/objects/RockObject';
import { TallGrassObject } from '@/game/objects/TallGrassObject';
import { PlantSpotObject } from '@/game/objects/PlantSpotObject';
import { RoboticArmObject, type ArmWorldPort } from '@/game/objects/RoboticArmObject';
import { MoonflowerObject } from '@/game/objects/MoonflowerObject';
import { BombSpotObject } from '@/game/objects/BombSpotObject';
import { t, tLines } from '@/game/i18n/i18n';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import {
  FX_DOT_TEXTURE, FX_PUFF_TEXTURE, FX_RING_TEXTURE,
  setCurrentWorld3D, World3D,
} from '@/game/render3d/World3D';
import { registerBucketTextures } from '@/game/render3d/bucketTexture';
import { registerMoonflowerTextures } from '@/game/render3d/moonflowerTexture';
import { DialogOverlay } from '@/game/runtime/DialogOverlay';
import { getActiveLevel } from '@/game/runtime/activeLevel';
import { LevelButtons, PauseMenu, PauseTouchButton, isTouchDevice } from '@/game/runtime/PauseMenu';
import { ItemGetOverlay, type ItemGetConfig } from '@/game/runtime/ItemGetOverlay';
import { ShopOverlay, type UpgradeState, getUpgradeCost, UPGRADES_CFG } from '@/game/runtime/ShopOverlay';
import { createHeroView, heroFootY, tickHeroView, type HeroView } from '@/game/runtime/HeroView';
import { PlayerMovementController } from '@/game/runtime/PlayerMovementController';
import { WorldCamera } from '@/game/runtime/WorldCamera';
import { getSoundManager } from '@/game/audio/SoundManager';
import { createBoardMetrics } from '@/game/shared/grid';
import { ChunkManager } from '@/game/world/ChunkManager';
import type { ScreenContent } from '@/game/world/ScreenContent';
import {
  getCampfires,
  getChunkContent,
  getDryBushes,
  getDryTrees,
  getDryShrubs,
  getHeldItemPickups,
  getLavaTiles,
  getWaterTiles,
  getBombSpots,
  getBridgeSpots,
  getPlantSpots,
  getInserters,
  getMoonflowers,
  getLockedDoors,
  getRocks,
  getTallGrass,
  getDialog,
  getDialogKinds,
  getDialogVoice,
  getPlayerStart,
  isPuzzleWorld,
} from '@/game/world/WorldData';

// How each held item shows in the HUD slot / flies in (a burning item swaps its own way).
const HUD_ITEM_VISUAL: Record<HeldItemKind, { texture: string; frame: number }> = {
  sword: { texture: ASSET_KEYS.swordItemIcon, frame: 0 },
  key: { texture: ASSET_KEYS.keyItem, frame: KEY_FRAMES.held },
  axe: { texture: ASSET_KEYS.axeIcon, frame: 0 },
  greatAxe: { texture: ASSET_KEYS.greatAxeIcon, frame: 0 },
  bomb: { texture: ASSET_KEYS.bombIcon, frame: 0 },
  lavaBoots: { texture: ASSET_KEYS.lavaBootsIcon, frame: 0 },
  pickaxe: { texture: ASSET_KEYS.pickaxeIcon, frame: 0 },
  scythe: { texture: ASSET_KEYS.scytheIcon, frame: 0 },
  wood: { texture: ASSET_KEYS.woodIcon, frame: 0 },
  stone: { texture: ASSET_KEYS.rock, frame: 0 },
  seeds: { texture: ASSET_KEYS.seedsItem, frame: 0 },
  bucket: { texture: 'bucket-icon', frame: 0 },
  bucketFull: { texture: 'bucket-full-icon', frame: 0 },
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
  wood: { texture: 'wood-icon', frame: 0 },
  stone: { texture: 'rock', frame: 0 },
  seeds: { texture: 'seeds-item', frame: 0 },
  bucket: { texture: 'bucket-icon', frame: 0 },
  bucketFull: { texture: 'bucket-full-icon', frame: 0 },
};

// Bumping something you can't use yet pops a speech balloon over the hero's head showing
// exactly the item still needed. One entry per "locked" interaction — a lit flame for dead
// fires and dry brush, the matching tool for trees/rock/grass, a key for doors, lava boots
// for lava. "fire" reuses the burning-torch HUD icon (a lit flame is what the hero must carry).
const NEED_ITEM_ICON = {
  fire: { texture: ASSET_KEYS.woodOnFireIcon, frame: 0 },
  key: { texture: ASSET_KEYS.keyItemIcon, frame: 0 },
  axe: { texture: ASSET_KEYS.axeIcon, frame: 0 },
  greatAxe: { texture: ASSET_KEYS.greatAxeIcon, frame: 0 },
  pickaxe: { texture: ASSET_KEYS.pickaxeIcon, frame: 0 },
  scythe: { texture: ASSET_KEYS.scytheIcon, frame: 0 },
  lavaBoots: { texture: ASSET_KEYS.lavaBootsIcon, frame: 0 },
  graveto: { texture: ASSET_KEYS.woodIcon, frame: 0 }, // a wood stick, to build a bridge
  bomb: { texture: ASSET_KEYS.bombIcon, frame: 0 }, // stepping on a bombSpot empty-handed
  seeds: { texture: ASSET_KEYS.seedsItem, frame: 0 }, // stepping on an open plantSpot hole
  water: { texture: 'bucket-full-icon', frame: 0 }, // bumping a dry mound: it wants watering
} as const;
type NeedItemKind = keyof typeof NEED_ITEM_ICON;

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
  wood: { texture: ASSET_KEYS.woodIcon, frame: 0, label: 'VOCE PEGOU UM GRAVETO!' },
  stone: { texture: ASSET_KEYS.rock, frame: 0, label: 'VOCE PEGOU UMA PEDRA!' },
  seeds: { texture: ASSET_KEYS.seedsItem, frame: 0, label: 'VOCE PEGOU SEMENTES! PLANTE NUM BURACO' },
  bucket: { texture: 'bucket-icon', frame: 0, label: 'VOCE PEGOU UM BALDE! ENCHA NO RIO' },
  bucketFull: { texture: 'bucket-full-icon', frame: 0, label: 'BALDE CHEIO DE AGUA!' },
};

// What a blow does to a skull (max health 3). Three tiers: bare fists land BARE_HAND_DAMAGE
// (three punches kill — see strikeEnemy); any common item in hand (key, stick, axe, pickaxe,
// scythe) lands 1.5 (two blows kill); the sword — or the stick while it BURNS — one-shots.
const MELEE_DAMAGE: Partial<Record<HeldItemKind, number>> = {
  sword: 999,
  wood: 1.5,
  axe: 1.5,
  greatAxe: 1.5,
  key: 1.5,
  pickaxe: 1.5,
  scythe: 1.5,
  stone: 1.5, // a rock in the fist is as good as any other blunt tool
};
const BARE_HAND_DAMAGE = 1;

// Standing guard: an idle hero swings his weapon on his own at any enemy that closes to an
// adjacent tile, so defending doesn't require walking into the attacker (bump-attacking still
// works as before). This is the minimum delay between automatic swings.
const AUTO_ATTACK_COOLDOWN_MS = 450;

const BOMB_FUSE_MS = 1600;
const BOMB_BLAST_RADIUS_TILES = 2.2;

// How long a burning tile takes to set its neighbours alight. Slow enough that the fire is a
// thing you WATCH travel (and can still run from), fast enough that a fuse pays off inside one
// held thought. See GameScene.scheduleFireSpread.
const FIRE_SPREAD_MS = 850;

// Resting in a lit campfire's safe ring mends one heart every this many ms (leaving the ring
// resets the timer, so healing is a "warm up by the fire" beat, not passive regen anywhere).
const HEALTH_REGEN_MS = 1200;
// While the fire mends the hero, warm ember motes stream fire→hero on this cadence, so the
// healing visibly COMES FROM the campfire instead of a heart just popping in the HUD.
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
  // Per-frame memo for undeadReachableTiles (the spawn director probes many tiles per tick).
  private reachableFrame = -1;
  private readonly reachableTiles = new Set<string>();
  private playerSafe = true;
  // Music staging: how long the field has been clear of undead (hysteresis so the
  // combat track doesn't flap while skulls spawn and die in quick succession).
  private dangerCalmMs = 0;
  private npcManager?: NpcManager;
  private coinManager?: CoinManager;
  private heartPickupManager?: HeartPickupManager;
  private itemManager?: ItemManager;
  private swordSlash?: SwordSlash;
  // The hero carries a single item at a time. `swordEquipped` is derived from it so the
  // existing combat code is untouched. `seenItems` tracks which kinds have had their one-time
  // "item get" ceremony, so re-picking a dropped item just flies it to the HUD.
  private heldItem: 'none' | HeldItemKind = 'none';
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
  private dryBushes: DryBushObject[] = [];
  private lockedDoors: LockedDoorObject[] = [];
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
  private inserters: RoboticArmObject[] = [];
  private lavaTiles: LavaObject[] = [];
  private waterTiles: WaterObject[] = [];
  // Lit bombs on the ground — world-anchored billboards ticking until they blow.
  private activeBombs: Array<{ worldX: number; worldY: number; sprite: Billboard3D }> = [];
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
  private playerMaxHealth = HUD_HEALTH_MAX;
  private playerHealth = HUD_HEALTH_MAX;
  private playerInvincible = false;
  private invincibleTimer = 0;
  // Combat juice: while > 0 the whole world (tweens included) is frozen on an impact frame.
  private hitstopMs = 0;
  // Cooldown between automatic defensive swings while standing still.
  private autoAttackCooldownMs = 0;
  // Returns the hero to screen centre after a hurt-knockback shove.
  private playerKnockTween?: Phaser.Tweens.Tween;
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
  private shopOpen = false;
  private shopOverlay?: ShopOverlay;
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
  // Level runs only: the always-visible restart + pause squares top-right (see LevelButtons).
  private levelButtons?: LevelButtons;
  private upgrades: UpgradeState = { maxHealth: 0, swordSpeed: 0, moveSpeed: 0, magnet: 0 };
  // Center chunk of the streamed window; NaN forces the first stream.
  private streamCenter = { cx: NaN, cy: NaN };
  private debugApi?: GameDebugApi;


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

  // "You need this item" balloon over the hero's head (see showNeedItemHint)
  private needItemHint?: Phaser.GameObjects.Container;
  private needItemHintTween?: Phaser.Tweens.Tween;

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
    const { worldX: startWorldX, worldY: startWorldY } = getPlayerStart();

    this.isDead = false;
    this.playerMaxHealth = HUD_HEALTH_MAX;
    this.playerHealth = HUD_HEALTH_MAX;
    this.playerInvincible = false;
    this.hitstopMs = 0;
    this.autoAttackCooldownMs = 0;
    this.tweens.timeScale = 1;
    this.playerKnockTween = undefined;
    this.playerWorld = { worldX: startWorldX, worldY: startWorldY };
    this.streamCenter = { cx: NaN, cy: NaN };
    this.shopOpen = false;
    this.upgrades = { maxHealth: 0, swordSpeed: 0, moveSpeed: 0, magnet: 0 };

    // Phaser's canvas is transparent: the 3D world shows through from below.
    // Build the renderer before ANY world object — they attach their billboards to it.
    this.world3d = new World3D();
    setCurrentWorld3D(this.world3d);
    // Generate the bucket's + moonflower's pixel art into both texture pipelines before any
    // prop/item is built (their billboards resolve their textures on construction below).
    registerBucketTextures(this);
    registerMoonflowerTextures(this);
    // The 3D canvas is position:fixed (z-index 0), which paints ABOVE static content.
    // Promote the Phaser canvas into its own stacking level so the whole 2D side —
    // lighting overlays, FX, canvas UI — draws over the 3D world, not under it.
    this.game.canvas.style.position = 'relative';
    this.game.canvas.style.zIndex = '1';
    window.hd3d = this.world3d.params;
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.render3D, this);

    // Decode the SFX + music loops. The world's default "soundtrack" is just the wind bed —
    // no melodic exploration track — so fade out whatever the intro left playing (the title
    // theme) and let the wind carry the world. Only combat later raises the danger track.
    getSoundManager().preload();
    getSoundManager().stopMusic(1800);
    getSoundManager().startAmbience();
    this.dangerCalmMs = 0;

    // Phaser does not auto-call shutdown(); wire it so scene.restart() (death) cleans up
    // listeners/textures instead of leaking them across runs.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    this.chunkManager = new ChunkManager();
    const getContent = (cx: number, cy: number): ScreenContent => getChunkContent(cx, cy);
    // No enemy lives in the authored world: every skull is summoned around the hero by the
    // spawn director while they linger in the dark, away from campfires. The puzzle lab
    // (/lab) AND the standalone puzzle levels (/levels, meta.puzzle) run WITHOUT the siege:
    // skulls respawning mid-solve are pure noise when the point is a puzzle — test darkness
    // pressure in the real world instead.
    this.enemyManager = new EnemyManager(this);
    const siegeOff = this.registry.get('appMode') === 'lab' || isPuzzleWorld();
    this.spawnDirector = siegeOff ? undefined : new UndeadSpawnDirector();
    this.playerSafe = true;
    this.healthRegenTimer = 0;
    this.firstCampfireLit = false;
    this.litFireCount = 0;
    this.wizardIntroSeen = false;
    this.cutsceneActive = false;
    this.cutsceneFireLight = undefined;
    this.cutsceneHeroLight = 1;
    this.seenDialogKeys.clear();
    this.npcManager = new NpcManager(this, getContent, (kind, wx, wy) => {
      const key = this.dialogKeyFor(kind, wx, wy);
      return key !== null && !this.seenDialogKeys.has(key);
    });
    this.coinManager = new CoinManager(this);
    this.heartPickupManager = new HeartPickupManager(this, getContent);
    this.itemManager = new ItemManager(this);
    this.itemManager.loadAuthored(getHeldItemPickups());
    this.heldItem = 'none';
    this.seenItems.clear();
    this.heldOnFire = false;
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
    this.campfires = campfireDefs.map(
      (c, i) => new CampfireObject(this, c.worldX, c.worldY, i === homeIdx || c.lit === true),
    );
    this.dryBushes = getDryBushes().map((b) => new DryBushObject(this, b.worldX, b.worldY));
    this.lockedDoors = getLockedDoors().map((d) => new LockedDoorObject(this, d.worldX, d.worldY, d.floodgate === true));
    this.dryTrees = getDryTrees().map((t) => new DryTreeObject(this, t.worldX, t.worldY));
    this.dryShrubs = getDryShrubs().map((s) => new DryShrubObject(this, s.worldX, s.worldY));
    this.rocks = getRocks().map((r) => new RockObject(this, r.worldX, r.worldY));
    this.tallGrasses = getTallGrass().map((g) => new TallGrassObject(this, g.worldX, g.worldY));
    this.moonflowers = getMoonflowers().map((m) => new MoonflowerObject(this, m.worldX, m.worldY));
    this.bombSpots = getBombSpots().map((s) => new BombSpotObject(this, s.worldX, s.worldY));
    this.plantSpots = getPlantSpots().map((s) => new PlantSpotObject(this, s.worldX, s.worldY));
    // `dir ?? 1`: um braco sem direcao gravada aponta pro leste. Ele nunca fica sem direcao de
    // verdade (o editor sempre grava uma), mas o default evita que um JSON antigo vire um prop
    // quebrado — e leste e o que o editor oferece primeiro.
    this.inserters = getInserters().map((a) => new RoboticArmObject(a.worldX, a.worldY, a.dir ?? 1));
    this.lavaTiles = getLavaTiles().map((l) => new LavaObject(this, l.worldX, l.worldY));
    // Both `water` and `bridgeSpot` are river tiles (WaterObjects render animated water). A
    // plain `water` tile is an impassable river; a `bridgeSpot` is a river tile you CAN bridge
    // (buildable = true), marked so the level designer chooses exactly where crossings are
    // allowed. They're separate props (one per tile) so the editor's "one prop per cell" holds.
    this.waterTiles = [
      ...getWaterTiles().map((w) => new WaterObject(this, w.worldX, w.worldY, false)),
      ...getBridgeSpots().map((b) => {
        const w = new WaterObject(this, b.worldX, b.worldY, true);
        // A scene-level burst of pale light the moment the last board is nailed home.
        w.onBuilt = () => this.cameras.main.flash(160, 210, 190, 150);
        return w;
      }),
    ];

    this.initLighting();
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
    // The lab only gets the return handler when it actually came FROM the editor —
    // `/lab?play` boots the GameScene directly, with no editor scene to wake.
    const appMode = this.registry.get('appMode') as AppMode | undefined;
    const launchedFromEditor = appMode === 'editor'
      || (appMode === 'lab' && (this.scene.isActive('editor') || this.scene.isSleeping('editor')));
    if (launchedFromEditor) {
      this.enableEditorReturn();
    } else {
      this.input.keyboard?.on('keydown-ESC', () => this.openPauseMenu());
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
  }

  /** Restart the current run — shared by the pause menu entry and the level restart button. */
  private restartRun(): void {
    if (this.pauseMenu) return; // the floating buttons are hidden while the menu is up anyway
    getSoundManager().stopMusic();
    this.scene.restart(); // WorldData still holds this level, so it rebuilds the same one
  }

  private openPauseMenu(): void {
    // Never pause over another modal state — their overlays own ESC/scrim already, and the
    // dialog camera pan must not be frozen midway.
    if (this.pauseMenu || this.dialogOpen || this.camShifting || this.shopOpen
      || this.itemGetOpen || this.cutsceneActive || this.isDead) return;
    this.pauseTouchButton?.setVisible(false);
    this.levelButtons?.setVisible(false);
    // scene.get('title') is undefined in the editor playtest config; without it "quit" would
    // have nowhere to go, so the entry is hidden (mirrors the intro-ending fallback).
    const canQuit = Boolean(this.scene.get('title'));
    // Playing a level (not the adventure): offer a jump back to the level list. Gated on the
    // scene existing too — the lab/editor configs don't register it.
    const inLevel = getActiveLevel() !== null && Boolean(this.scene.get('levelselect'));
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
          this.scene.start('title');
        }
        : undefined,
    });
    this.scene.pause();
  }

  private closePauseMenu(): void {
    if (!this.pauseMenu) return;
    this.pauseMenu.destroy();
    this.pauseMenu = undefined;
    this.pauseTouchButton?.setVisible(true);
    this.levelButtons?.setVisible(true);
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

    // The walk cycle: Phaser's animation component used to drive the sprite's frame from
    // the display list, which kept ticking even when update() early-returned (dialog pan,
    // cut-scene). POST_UPDATE runs on those frames too, so it ticks in the same places.
    tickHeroView(this.hero, delta);
    this.syncHeroBillboard();

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
      cam.camX + (h.x - cam.screenCenterX) / ts,
      cam.camY + (heroFootY(h) - cam.screenCenterY) / ts - 0.5,
    );
    // The walk bob. It has to be elevation and not a shift of y: y is the ground plane here, so
    // nudging it would send the hero *backwards into the scene* instead of up into the air. The
    // contact shadow deliberately ignores elevation, so it stays planted while he bounces.
    b.setElevation(h.bobLift);
    b.setDisplaySize(
      Math.max(0.05, (h.sizePx * h.scaleX) / ts),
      Math.max(0.05, (h.sizePx * h.scaleY) / ts),
    );
    b.setTexture('hero', h.frame);
    b.setFlipX(h.flipX);
    b.setAlpha(h.alpha);

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
        swordOnFire: this.heldOnFire && this.swordEquipped,
        heldOnFire: this.heldOnFire,
        heldItem: this.heldItem,
        groundItems: this.itemManager?.snapshot() ?? [],
        coins: this.coinManager?.coinTotal ?? 0,
        dialogOpen: this.dialogOpen,
        shopOpen: this.shopOpen,
        itemGetOpen: this.itemGetOpen,
        isDead: this.isDead,
        litFires: this.campfires.filter((cf) => cf.isLit).length,
        safety: {
          safe: this.playerSafe,
          danger: this.spawnDirector?.danger ?? 0,
          undeadCount: this.enemyManager?.aliveCount ?? 0,
        },
        activeScreen: {
          cx: Math.floor(this.playerWorld.worldX / CHUNK_COLUMNS),
          cy: Math.floor(this.playerWorld.worldY / CHUNK_ROWS),
        },
      }),
      openDialog: (kind = 'blackCat') => {
        if (this.dialogOpen || this.shopOpen || this.isDead) return false;
        this.openNpcDialog(kind);
        return true;
      },
      closeDialog: () => {
        this.dialogOverlay?.destroy();
        this.dialogOverlay = undefined;
        this.dialogOpen = false;
        this.endDialogCameraShift();
      },
      openShop: () => this.openShop(),
      closeShop: () => this.closeShop(),
      triggerSwordGet: () => {
        if (!this.itemGetOpen) {
          this.onCollectItem({ kind: 'sword', worldX: this.playerWorld.worldX, worldY: this.playerWorld.worldY });
        }
      },
      listNpcKinds: () => getDialogKinds(),
    };
    registerGameDebugApi(this.debugApi, this);
  }

  public shutdown(): void {
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
    this.levelButtons?.destroy();
    this.levelButtons = undefined;
    this.coinManager?.destroy();
    this.heartPickupManager?.destroy();
    this.itemManager?.destroy();
    this.swordSlash?.destroy();
    this.campfires.forEach((cf) => cf.destroy());
    this.dryBushes.forEach((b) => b.destroy());
    this.lockedDoors.forEach((d) => d.destroy());
    this.dryTrees.forEach((t) => t.destroy());
    this.dryShrubs.forEach((s) => s.destroy());
    this.rocks.forEach((r) => r.destroy());
    this.tallGrasses.forEach((g) => g.destroy());
    this.moonflowers.forEach((m) => m.destroy());
    this.bombSpots.forEach((s) => s.destroy());
    this.plantSpots.forEach((s) => s.destroy());
    this.inserters.forEach((a) => a.destroy());
    this.lavaTiles.forEach((l) => l.destroy());
    this.waterTiles.forEach((w) => w.destroy());
    this.activeBombs.forEach((b) => b.sprite.destroy());
    this.shopOverlay?.destroy();
    this.backItemSwingTimer?.remove();
    this.backItemSwingTimer = undefined;
    this.backItem?.destroy();
    this.backItem = undefined;
    this.backItemBb?.destroy();
    this.backItemBb = undefined;
    this.breathingTween?.destroy();
    this.breathingTween = undefined;
    this.needItemHintTween?.stop();
    this.needItemHintTween = undefined;
    this.needItemHint?.destroy();
    this.needItemHint = undefined;
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
    this.campfires = [];
    this.dryBushes = [];
    this.lockedDoors = [];
    this.dryTrees = [];
    this.dryShrubs = [];
    this.rocks = [];
    this.tallGrasses = [];
    this.moonflowers = [];
    this.bombSpots = [];
    this.plantSpots = [];
    this.inserters = [];
    this.lavaTiles = [];
    this.waterTiles = [];
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

    // Hide the low-health outline up front; the active-play FX below re-shows it each frame if
    // still low. So any frozen state (dialog, shop, item-get, death) leaves it hidden instead
    // of stranding it, misaligned, where the hero last was. Same deal for the fire compass.
    this.hideLowHealthOutlines();
    this.hideFireCompass();

    // The camera pan (open or close) drives its own reprojection from the tween, so keep the
    // world frozen here until it finishes — otherwise gameplay would fight the pan.
    if (this.dialogOpen || this.camShifting) {
      this.dialogOverlay?.update();
      return;
    }

    // The item-get and first-campfire cut-scene both freeze gameplay; only their own tweens run.
    if (this.itemGetOpen || this.cutsceneActive) return;

    if (this.isDead || this.shopOpen || !this.movementController || !this.chunkManager || !this.camera) {
      return;
    }

    // No item buttons exist: the game is walk-only. The bomb plants itself on its spot mark and
    // seeds sow themselves into an open hole when the hero steps there carrying them (see
    // handleTileEntered). The shop opens by bumping a lit campfire (the Souls bonfire).

    const prevWorldX = this.playerWorld.worldX;
    const prevWorldY = this.playerWorld.worldY;
    this.playerWorld = this.movementController.update(
      this.playerWorld.worldX,
      this.playerWorld.worldY,
      delta,
    );
    const stepDx = this.playerWorld.worldX - prevWorldX;
    const stepDy = this.playerWorld.worldY - prevWorldY;
    if (stepDx !== 0 || stepDy !== 0) {
      this.lastStepTime = this.time.now;
      this.stopBreathing();
      this.spawnFootprint(prevWorldX, prevWorldY, stepDx, stepDy);
    } else if (!this.dialogOpen && !this.camShifting && this.time.now - this.lastStepTime > 180) {
      // A bump into an NPC opens the dialog synchronously inside movementController.update()
      // above — it already stopped breathing and re-pinned the hero at centre origin. Don't
      // re-start breathing this frame, or its bottom-origin pose makes the frozen reprojection
      // draw the hero half a tile high (a visible "jump") for the whole conversation.
      this.startBreathing();
    }
    this.streamChunks();
    this.updateFootprints();

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
    this.playerSafe = distToFire <= CAMPFIRE_SAFE_RADIUS_TILES;

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
        this.playerSafe,
        this.isTorchLit,
        (wx, wy) => {
          // Enemies respect the same solid tiles as the hero (terrain, trees, campfires,
          // dry bushes, NPCs) — and they refuse to step into campfire light: the undead
          // exist only in the dark. The hero's own glow is not a barrier (they hunt him).
          if (this.isSolidForEntities(wx, wy)) return true;
          return this.isTileLitByCampfire(wx, wy);
        },
      );
      if (attacked) this.handleEnemyAttackPlayer(attacked);

      // Standing guard: the idle hero defends himself against anything that got adjacent.
      this.autoAttackCooldownMs = Math.max(0, this.autoAttackCooldownMs - delta);
      this.tryAutoAttack();

      this.enemyManager.render(this.tileSize, this.camera);

      this.spawnDirector?.update(delta, {
        playerWorldX: this.playerWorld.worldX,
        playerWorldY: this.playerWorld.worldY,
        distToFireTiles: distToFire,
        aliveUndead: this.enemyManager.aliveCount,
        canSpawnAt: (wx, wy) => this.canSpawnUndeadAt(wx, wy),
        spawn: (wx, wy) => this.enemyManager?.spawnUndead(wx, wy),
      });

      // Souls staging: the combat track rises only while undead are actually out and the
      // hero is beyond the firelight; a few calm seconds after the last one falls it fades
      // back to the wind-only default. Suppressed while any overlay/cutscene owns the music.
      // isDead matters here: triggerDeath (silence, total) can fire earlier in THIS same
      // update pass, and without it the danger check below would restart the combat track
      // right on top of the death screen.
      const uiOwnsMusic = this.cutsceneActive || this.dialogOpen || this.shopOpen || this.itemGetOpen || this.isDead;
      if (this.enemyManager.aliveCount > 0 && !this.playerSafe) {
        this.dangerCalmMs = 0;
        if (!uiOwnsMusic) getSoundManager().startMusic('danger', 900);
      } else {
        this.dangerCalmMs += delta;
        if (!uiOwnsMusic && this.dangerCalmMs > 4000) getSoundManager().stopMusic(2600);
      }
    }

    if (this.coinManager && this.camera) {
      // No HUD coin counter anymore — coins are just absorbed into the hero (screen centre).
      const heroScreen = { x: this.camera.screenCenterX, y: this.camera.screenCenterY };
      this.coinManager.update(
        this.playerWorld.worldX,
        this.playerWorld.worldY,
        heroScreen,
        () => { getSoundManager().playCoinPickup(); },
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
      const collected = this.itemManager.update(this.playerWorld.worldX, this.playerWorld.worldY);
      if (collected) this.onCollectItem(collected);
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
    this.updateInserters(delta);

    if (this.npcManager && this.camera) this.npcManager.render(this.tileSize, this.camera);
    this.renderProps();
    // Cast shadows are real: the fire's shadow light in the 3D renderer throws them.
  }

  private handleResize(gameSize: Phaser.Structs.Size | { width: number; height: number }): void {
    const { width, height } = gameSize;
    this.cameras.main.setViewport(0, 0, width, height);

    // Seed tileSize from the classic board metric; render3D refines it to the
    // true projected tile size on the next frame.
    this.tileSize = this.computeTileSize(width, height);

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
    this.hero.sizePx = this.tileSize;
    this.movementController?.syncPlayerToWorld(this.playerWorld.worldX, this.playerWorld.worldY, this.tileSize);
  }

  private computeTileSize(width: number, height: number): number {
    const metrics = createBoardMetrics(width, height, {
      columns: CHUNK_COLUMNS,
      rows: CHUNK_ROWS,
      minTileSize: MIN_BOARD_TILE_SIZE,
      characterScale: GAMEPLAY_HERO_SCALE,
      maxCharacterSize: GAMEPLAY_HERO_MAX_SIZE,
      reservedTopRows: 0, // HUD removed — no reserved rows, the board fills the screen
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

    // Enemies are not streamed: the world has none — see UndeadSpawnDirector.
    this.npcManager?.syncChunks(active);
    this.heartPickupManager?.syncChunks(active);
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

  private get swordEquipped(): boolean {
    return this.heldItem === 'sword';
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

  private getCampfireAt(wx: number, wy: number): CampfireObject | undefined {
    return this.campfires.find((cf) => cf.worldX === wx && cf.worldY === wy);
  }

  private getDryBushAt(wx: number, wy: number): DryBushObject | undefined {
    return this.dryBushes.find((b) => b.worldX === wx && b.worldY === wy);
  }

  private getLockedDoorAt(wx: number, wy: number): LockedDoorObject | undefined {
    return this.lockedDoors.find((d) => d.worldX === wx && d.worldY === wy);
  }

  private getDryTreeAt(wx: number, wy: number): DryTreeObject | undefined {
    return this.dryTrees.find((t) => t.worldX === wx && t.worldY === wy);
  }

  private getDryShrubAt(wx: number, wy: number): DryShrubObject | undefined {
    return this.dryShrubs.find((s) => s.worldX === wx && s.worldY === wy);
  }

  private getRockAt(wx: number, wy: number): RockObject | undefined {
    return this.rocks.find((r) => r.worldX === wx && r.worldY === wy);
  }

  private getTallGrassAt(wx: number, wy: number): TallGrassObject | undefined {
    return this.tallGrasses.find((g) => g.worldX === wx && g.worldY === wy);
  }


  private getMoonflowerAt(wx: number, wy: number): MoonflowerObject | undefined {
    return this.moonflowers.find((m) => m.worldX === wx && m.worldY === wy);
  }

  private getBombSpotAt(wx: number, wy: number): BombSpotObject | undefined {
    return this.bombSpots.find((s) => s.worldX === wx && s.worldY === wy);
  }

  private getInserterAt(wx: number, wy: number): RoboticArmObject | undefined {
    return this.inserters.find((a) => a.worldX === wx && a.worldY === wy);
  }

  private getPlantSpotAt(wx: number, wy: number): PlantSpotObject | undefined {
    return this.plantSpots.find((s) => s.worldX === wx && s.worldY === wy);
  }

  private getLavaAt(wx: number, wy: number): LavaObject | undefined {
    return this.lavaTiles.find((l) => l.worldX === wx && l.worldY === wy);
  }

  private getWaterAt(wx: number, wy: number): WaterObject | undefined {
    return this.waterTiles.find((w) => w.worldX === wx && w.worldY === wy);
  }

  /**
   * Everything a walking entity (hero or enemy) cannot step onto: authored terrain collision
   * and trees (via ChunkManager.isCellBlocked), campfires, standing dry bushes/trees/grass,
   * unbroken rocks, NPCs — and lava, unless the caller can cross it (hero wearing the lava
   * boots). The hero adds enemies on top (to attack them); enemies add lit tiles.
   */
  private isSolidForEntities(wx: number, wy: number, hazardsPassable = false): boolean {
    if (this.chunkManager?.isCellBlocked(wx, wy)) return true;
    if (this.getCampfireAt(wx, wy)) return true;
    if (this.getDryBushAt(wx, wy)?.blocking) return true;
    if (this.getLockedDoorAt(wx, wy)?.blocking) return true;
    if (this.getDryTreeAt(wx, wy)?.blocking) return true;
    if (this.getDryShrubAt(wx, wy)?.blocking) return true;
    if (this.getRockAt(wx, wy)?.blocking) return true;
    if (this.getTallGrassAt(wx, wy)?.blocking) return true;
    if (this.getMoonflowerAt(wx, wy)?.blocking) return true; // a shut bud blocks; an open bloom doesn't
    if (this.getPlantSpotAt(wx, wy)?.blocking) return true; // a planted mound is a body; the hole isn't
    // The arm is a machine, so it is solid — and that is exactly what makes it worth placing.
    // It hands an item across the very tile the hero has to walk around.
    if (this.getInserterAt(wx, wy)?.blocking) return true;
    // Lava and water are the two hazards the lava boots ("botas de risco") let the hero wade —
    // enemies always pass hazardsPassable=false, so a river stays a wall to them. A lava tile
    // cooled to basalt by a dropped stone is solid ground everyone walks, boots or no boots.
    const lava = this.getLavaAt(wx, wy);
    if (lava && !lava.solidified && !hazardsPassable) return true;
    if (this.getWaterAt(wx, wy)?.blocking && !hazardsPassable) return true;
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

  // Firelight is undead-repellent: tiles inside a campfire's glow are walls to them.
  private isTileLitByCampfire(wx: number, wy: number): boolean {
    return this.distToNearestCampfireTiles(wx, wy) <= LIGHT_RADIUS_TILES;
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
   * Every tile an undead could walk to the hero from: a flood-fill out from the hero's tile
   * over undead-passable ground (not solid, not firelit — the exact blockers they move by),
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
        if (this.isTileLitByCampfire(nx, ny)) continue;
        this.reachableTiles.add(key);
        queue.push([nx, ny]);
      }
    }
    return this.reachableTiles;
  }

  private handlePlayerBump(wx: number, wy: number): void {
    // A bump interrupts movement and re-pins the hero to screen centre. The idle breathing
    // pose parks the sprite on a bottom origin with a compensating y-offset, so that repin
    // must happen from the canonical centre origin — otherwise the hero visibly jumps up
    // half a tile. Bumps aren't steps, so nothing else stops breathing here.
    this.stopBreathing();

    if (this.npcManager?.hasNpcAt(wx, wy)) {
      const kind = this.npcManager.getKindAt(wx, wy);
      // The wizard runs the story dialogue (progress-driven); every other NPC uses its base line.
      if (kind === 'wizard') this.openWizardDialog({ worldX: wx, worldY: wy });
      else if (kind) this.openNpcDialog(kind, { worldX: wx, worldY: wy });
      return;
    }

    // Campfire interaction. A LIT fire relights/refuels the carried torch; a DEAD fire is
    // brought back to life by carrying a flame into it (the heart of the game).
    const campfire = this.getCampfireAt(wx, wy);
    if (campfire) {
      campfire.onHit();
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
        } else if (this.registry.get('appMode') !== 'lab' && !isPuzzleWorld()) {
          // Any other bump on a lit hearth is RESTING at it: the upgrade shop opens — the game's
          // Souls bonfire, and the walk-only replacement for the old E key. Adventure only: a
          // puzzle level has no coins and no enemies, so a shop there would be pure noise.
          this.openShop();
        }
      } else if (this.isFlammableHeld && this.heldOnFire) {
        // Carry the flame into a dead campfire to reignite the world.
        this.swingHeld(wx, wy);
        this.time.delayedCall(150, () => { this.lightCampfire(campfire, wx, wy); });
      } else {
        // Dead fire and no flame in hand: show the "bring fire" balloon.
        this.showNeedItemHint('fire');
      }
      this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
      return;
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
        } else {
          // Lava is blocking (no boots on) and there's no torch to light here: show the boots.
          this.showNeedItemHint('lavaBoots');
        }
      }
      this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
      return;
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
        } else {
          this.showNeedItemHint('graveto');
        }
      }
      this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
      return;
    }

    // Dry bush — a flaming item sets it alight; it chars to ash and opens the tile.
    const bush = this.getDryBushAt(wx, wy);
    if (bush?.blocking) {
      bush.shake();
      if (this.isFlammableHeld && this.heldOnFire) {
        this.swingHeld(wx, wy);
        // Ignite when the flame reaches the bush (end of the main swing arc).
        this.time.delayedCall(150, () => {
          if (!bush.ignite()) return;
          profiler.mark('bush.ignite');
          this.spawnFireHitEffect(wx, wy);
          this.scheduleFireSpread(wx, wy); // it will carry to whatever is touching it
        });
      } else {
        // Needs a lit flame to catch: show the fire balloon.
        this.showNeedItemHint('fire');
      }
      this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
      return;
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
        this.showNeedItemHint('axe');
      }
      this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
      return;
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
        this.showNeedItemHint('axe');
      }
      this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
      return;
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
          if (!rock.smash(dirX, dirY)) return;
          getSoundManager().playRockSmash();
          const shattered = !rock.blocking;
          this.spawnRockDebris(wx, wy, dirX, dirY, shattered);
          if (shattered) this.dropStone(rock.worldX, rock.worldY); // shattered, not just cracked
        });
      } else {
        rock.shake();
        this.showNeedItemHint('pickaxe');
      }
      this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
      return;
    }

    // Moonflower — a shut bud in the light. No item opens it; only the DARK does (put out the
    // campfires nearby, e.g. with the bucket). A bump just rustles it — the cat's lines carry the
    // rule, so there is no missing-item balloon here.
    const flower = this.getMoonflowerAt(wx, wy);
    if (flower?.blocking) {
      flower.shake();
      this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
      return;
    }

    // A planted mound — the seed under fresh earth, waiting for water. Bump with the FULL
    // bucket to water it (the douse gesture turned nurturing); the grass sprouts a while later.
    // A dry-handed bump shows the "needs water" balloon; an already-watered mound just waits.
    const plantSpot = this.getPlantSpotAt(wx, wy);
    if (plantSpot?.blocking) {
      if (plantSpot.isMound && this.heldItem === 'bucketFull') {
        this.swingHeld(wx, wy);
        this.time.delayedCall(120, () => {
          this.throwBucketWater(wx, wy, () => this.waterPlantSpot(plantSpot, wx, wy));
        });
      } else if (plantSpot.isMound) {
        this.showNeedItemHint('water');
      }
      this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
      return;
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
        this.showNeedItemHint('scythe');
      }
      this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
      return;
    }

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
        this.showNeedItemHint('key');
      }
      this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
      return;
    }

    // A TREE TILE — the forest itself, and the only thing the steel axe does that the plain axe
    // cannot. Checked last, after every prop: props stand ON tiles, so a rock or a door in front
    // of a pine must answer first. Nothing else in the game edits terrain, which is exactly why
    // this reads as the strongest tool in the world.
    if (this.tryChopTreeTile(wx, wy)) return;

    const enemy = this.enemyManager?.getEnemyAt(wx, wy);
    if (!enemy) return;

    // Still clawing out of the ground: the skull is invulnerable, so the blow GLANCES OFF.
    // This must not run the normal impact package (sparks, knockback, hitstop) — that made a
    // negated hit look exactly like a landed one. Instead: the swing still plays, but a cold
    // deflect ring + a pale flash on the skull say "no damage", with only a token shake.
    if (enemy.isSpawning) {
      if (MELEE_DAMAGE[this.heldItem as HeldItemKind] !== undefined) this.swingHeld(wx, wy);
      enemy.flashImmune();
      this.spawnDeflect(wx, wy);
      this.world3d?.shake(40, 0.03);
      this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
      return;
    }

    // Bare-handed or armed, a bump IS the attack: fists shove and chip (3 punches kill),
    // items land their MELEE_DAMAGE tier — strikeEnemy resolves the tier.
    this.strikeEnemy(enemy, wx, wy);
  }

  /**
   * Land a melee blow on an enemy at (wx, wy): damage, swing arc, knockback, and all the
   * impact juice. Shared by the walk-into-it bump attack and the standing-guard auto-attack.
   * Damage tiers (skull max health 3): bare fists 1 — a punch that also shoves; a common
   * item 1.5 — two blows kill; the sword or the burning stick one-shots. A non-melee
   * holdable (bomb, lava boots) can't hurt an enemy at all — no-op.
   */
  private strikeEnemy(enemy: EnemyBase, wx: number, wy: number): void {
    const bareHanded = this.heldItem === 'none';
    const itemDamage = MELEE_DAMAGE[this.heldItem as HeldItemKind];
    if (!bareHanded && itemDamage === undefined) return;
    const damage = bareHanded ? BARE_HAND_DAMAGE : this.heldOnFire ? 999 : itemDamage!;

    const hits = this.heldItem === 'sword' ? 1 + this.upgrades.swordSpeed : 1;
    for (let i = 0; i < hits; i++) enemy.takeDamage(damage);

    if (!bareHanded) this.swingHeld(wx, wy);
    const dx = wx - this.playerWorld.worldX;
    const dy = wy - this.playerWorld.worldY;
    enemy.triggerKnockback(dx, dy);
    if (this.heldOnFire && enemy.isAlive) this.spawnFireHitEffect(wx, wy);

    getSoundManager().playEnemyHit();
    this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
    this.hero.tint = 0xffff00;
    this.time.delayedCall(120, () => { this.hero.tint = null; });

    // Impact juice: sparks at the point of contact, a kick of screen shake, and a few
    // frames of hitstop — all heavier when the blow kills.
    const lethal = !enemy.isAlive;
    this.spawnHitSpark(wx, wy, lethal);
    this.world3d?.shake(lethal ? 150 : 90, lethal ? 0.15 : 0.09);
    this.triggerHitstop(lethal ? 110 : 60);
    if (lethal) getSoundManager().playEnemyDeath();
  }

  /**
   * Standing guard: while the hero stands still with a melee-capable item in hand, he swings
   * on his own at any enemy that closes to an adjacent tile — the player doesn't have to walk
   * into the attacker to defend (though the bump attack still works exactly as before).
   */
  private tryAutoAttack(): void {
    if (this.autoAttackCooldownMs > 0) return;
    if (this.movementController?.moving) return;
    if (this.dialogOpen || this.cutsceneActive || this.itemGetOpen || this.camShifting) return;
    if (MELEE_DAMAGE[this.heldItem as HeldItemKind] === undefined) return;

    const px = this.playerWorld.worldX;
    const py = this.playerWorld.worldY;
    const dirs: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      const enemy = this.enemyManager?.getEnemyAt(px + dx, py + dy);
      if (!enemy || enemy.isSpawning) continue;
      this.autoAttackCooldownMs = AUTO_ATTACK_COOLDOWN_MS;
      // strikeEnemy repins the hero via interruptMovement; leave the breathing pose first
      // (same reason handlePlayerBump does) or the repin jumps the sprite half a tile up.
      this.stopBreathing();
      this.strikeEnemy(enemy, px + dx, py + dy);
      return;
    }
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

  /** Sparks + a white impact flash where a melee blow lands; heavier when the blow kills. */
  private spawnHitSpark(wx: number, wy: number, lethal: boolean): void {
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
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.8;
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
  private spawnRockDebris(wx: number, wy: number, dirX: number, dirY: number, shattered: boolean): void {
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
        .setTintFill(ROCK_CHIP_TINTS[i % ROCK_CHIP_TINTS.length])
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
    if (this.heldItem === 'sword') {
      this.swordSlash.slash(screen.x, screen.y, dx, dy, this.tileSize);
      return;
    }
    const visual = HUD_ITEM_VISUAL[this.heldItem];
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
   */
  private swingAnchor(dy: number): { x: number; y: number } {
    // The arc is a 2D sprite over the 3D world, so it has to be TOLD how lit the hero is or it
    // swings at full art brightness through the night. See World3D.lightLevelAt / SWING_DARK.
    this.swordSlash?.setLightLevel(
      this.world3d?.lightLevelAt(this.playerWorld.worldX, this.playerWorld.worldY) ?? 1,
    );
    const nearer = dy < 0 ? SWING_BACK_TURNED_NEAR : 0;
    return this.camera!.tileToScreen(
      this.playerWorld.worldX,
      this.playerWorld.worldY + nearer,
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
    const visual = HUD_ITEM_VISUAL[item];
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
  private lightCampfire(cf: CampfireObject, wx: number, wy: number): void {
    if (cf.isLit) return;
    this.litFireCount += 1; // drives the wizard's story progression
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

  // Pops the speech balloon above the hero's head with `kind`'s icon inside it — the single
  // "you need THIS item" beat shared by every locked interaction (dead fire → flame, door →
  // key, dry tree → axe, rock → pickaxe, tall grass → scythe, lava → boots …).
  private showNeedItemHint(kind: NeedItemKind): void {
    if (!this.camera) return;
    const { texture, frame } = NEED_ITEM_ICON[kind];
    const size = this.tileSize;
    const iconSize = size * 0.72;
    // The hero is always pinned at screen centre; sit the balloon's tail just above its head.
    const cx = this.camera.screenCenterX;
    const tailY = this.camera.screenCenterY - size * 0.55;

    // Holding into a wall re-bumps every ~220ms: reuse a live balloon (swap the icon, replay
    // the pop) instead of stacking overlays on top of each other. setTexture resets the sprite
    // to the new frame's native size, so re-pin the display size after swapping.
    if (this.needItemHint?.active) {
      const icon = this.needItemHint.getByName('icon') as Phaser.GameObjects.Image | null;
      icon?.setTexture(texture, frame).setDisplaySize(iconSize, iconSize);
      this.needItemHint.setPosition(cx, tailY);
      this.replayNeedItemHint();
      return;
    }

    const balloonH = size * 1.5;
    const balloonW = balloonH * (26 / 22); // ballon_icon.png is 26x22
    const balloon = this.add.image(0, 0, ASSET_KEYS.hintBalloon)
      .setOrigin(0.5, 1) // tail tip anchored at the container origin
      .setDisplaySize(balloonW, balloonH);
    // Centre the icon in the bubble body, above the little downward tail.
    const icon = this.add.image(0, -balloonH * 0.58, texture, frame)
      .setName('icon')
      .setDisplaySize(iconSize, iconSize);

    this.needItemHint = this.add.container(cx, tailY, [balloon, icon]).setDepth(SCENE_DEPTHS.toast);
    this.replayNeedItemHint();
  }

  // Pop the balloon in (a little overshoot), hold, then float up and fade away.
  private replayNeedItemHint(): void {
    const c = this.needItemHint;
    if (!c) return;
    this.needItemHintTween?.stop();
    const baseY = c.y;
    c.setScale(0.5).setAlpha(1).setY(baseY);
    this.needItemHintTween = this.tweens.add({
      targets: c,
      scale: 1,
      duration: 170,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.needItemHintTween = this.tweens.add({
          targets: c,
          y: baseY - this.tileSize * 0.4,
          alpha: 0,
          delay: 700,
          duration: 320,
          ease: 'Power1.easeIn',
          onComplete: () => {
            c.destroy();
            if (this.needItemHint === c) this.needItemHint = undefined;
          },
        });
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

  // ── Bomb / seeds ────────────────────────────────────────────────────────────
  // The game is walk-only — no "use item" button — so every placement has a walk-on affordance:
  // a spot mark (a breathing purple ghost of the thing that goes there). The hero stepping onto
  // it with the right item in hand places it, exactly like stepping on a pickup collects it.
  // With anything else in hand the step pops the need-item balloon showing what the mark wants.
  private handleTileEntered(wx: number, wy: number): void {
    // A ORIGEM de um braco robotico: pisar nela segurando qualquer coisa DEPOSITA a carga ali,
    // e a maquina leva dali em diante. Isto nao e um atalho de conveniencia — sem ele o braco
    // seria impossivel de alimentar. O jogo nao tem botao de largar item: o heroi so pousa o que
    // carrega TROCANDO por outro item que ja esteja no chao, e a origem de um braco comeca vazia.
    // A garra parada no ar sobre o tile, com a sombra caindo embaixo, e o aviso de que pisar ali
    // faz alguma coisa (a mesma gramatica da bomba-fantasma no bombSpot).
    //
    // Vem antes de tudo porque um tile de origem e um destino deliberado: se ele coincidir com
    // outra marca, entregar a carga a maquina e a leitura mais forte.
    const feeding = this.inserters.find((arm) => {
      const [ix, iy] = arm.inputTile;
      return ix === wx && iy === wy;
    });
    if (feeding && this.heldItem !== 'none' && !this.itemManager?.hasItemAt(wx, wy)) {
      const kind = this.heldItem;
      this.clearHeldItem();
      this.itemManager?.drop(kind, wx, wy);
      return;
    }

    const bombSpot = this.getBombSpotAt(wx, wy);
    if (bombSpot && !bombSpot.isSpent) {
      if (this.heldItem === 'bomb') {
        bombSpot.use(); // the ghost materialises into the real bomb
        this.placeBombAt(wx, wy);
      } else {
        this.showNeedItemHint('bomb');
      }
      return;
    }

    // An open planting hole: step on it carrying seeds and they go into the ground — the mound
    // rises the moment the hero steps OFF (see updatePlantSpots), then wants the bucket. The
    // "needs seeds" balloon shows once per open-hole period: holes sit on walking lanes, and a
    // balloon on every crossing would be noise, not teaching.
    const plantSpot = this.getPlantSpotAt(wx, wy);
    if (plantSpot && plantSpot.isHole) {
      if (this.heldItem === 'seeds') {
        this.clearHeldItem(); // the seeds are sown
        plantSpot.plant();
      } else if (!plantSpot.hintShown) {
        plantSpot.hintShown = true;
        this.showNeedItemHint('seeds');
      }
    }
  }

  // The one consumable: planted on a bombSpot, it sits lit; after the fuse it explodes —
  // killing every enemy in the blast and setting fire to everything flammable there.
  private placeBombAt(worldX: number, worldY: number): void {
    if (this.heldItem !== 'bomb' || !this.world3d) return;

    this.clearHeldItem();
    getSoundManager().playBombPlace();

    const sprite = this.world3d
      // The hero is STANDING on this tile as the bomb is planted, and walks off it while the
      // fuse burns: ground layer, or the two upright quads are coplanar (see DEPTH_LAYER).
      .addBillboard('bomb-item', BOMB_FRAMES.item, { depthLayer: 'ground' })
      .setPosition(worldX, worldY)
      .setDisplaySize(0.62, 0.62);
    const bomb = { worldX, worldY, sprite };
    this.activeBombs.push(bomb);

    // Fuse: accelerating red blink until it blows.
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: BOMB_FUSE_MS,
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        const blink = Math.sin(t * t * 40) > 0;
        sprite.setTint(blink ? 0xff4444 : 0xffffff);
      },
    });
    this.time.delayedCall(BOMB_FUSE_MS, () => this.explodeBomb(bomb));
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
    const port: ArmWorldPort = {
      hasItem: (x, y) => this.itemManager?.hasItemAt(x, y) ?? false,
      take: (x, y) => this.itemManager?.takeAt(x, y) ?? null,
      put: (kind, x, y) => this.itemManager?.drop(kind, x, y),
      blocked: (x, y) => this.isSolidForEntities(x, y),
      grabbed: () => getSoundManager().playArmGrab(),
      swinging: () => getSoundManager().playArmServo(),
      released: () => getSoundManager().playArmRelease(),
    };
    for (const arm of this.inserters) arm.update(delta, port);
  }

  // Watch the plots each frame: raise the mound of a sown hole the moment the hero steps off
  // it (a dome must never be born blocking under someone's feet — the dropped-item arming
  // rule), and reopen the hole of a plot whose grown grass was consumed (cut/burnt).
  private updatePlantSpots(): void {
    for (const spot of this.plantSpots) {
      if (spot.isSown
        && (spot.worldX !== this.playerWorld.worldX || spot.worldY !== this.playerWorld.worldY)) {
        spot.raiseMound();
        continue;
      }
      const grass = spot.grownGrass;
      if (!grass || grass.blocking || spot.reopenPending) continue;
      spot.reopenPending = true;
      this.time.delayedCall(GameScene.PLANT_REOPEN_MS, () => {
        this.tallGrasses = this.tallGrasses.filter((g) => g !== grass);
        grass.destroy(); // the stubble decays away and the dug hole shows again
        spot.reopen();
      });
    }
  }

  private explodeBomb(bomb: { worldX: number; worldY: number; sprite: Billboard3D }): void {
    const index = this.activeBombs.indexOf(bomb);
    if (index < 0) return;
    this.activeBombs.splice(index, 1);
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

    // Kill every enemy caught in the blast.
    for (const enemy of this.enemyManager?.getAliveEnemies() ?? []) {
      if (!inBlast(enemy.worldX, enemy.worldY)) continue;
      enemy.takeDamage(999);
      if (!enemy.isAlive) {
        getSoundManager().playEnemyDeath();
      }
    }

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
    // to cross the river beyond it. (Two blows finish any rock: intact -> cracked -> broken.)
    let brokeRock = false;
    for (const rockObj of this.rocks) {
      if (!inBlast(rockObj.worldX, rockObj.worldY) || !rockObj.blocking) continue;
      rockObj.smash(0, 0);
      rockObj.smash(0, 0);
      if (!rockObj.blocking) {
        this.spawnRockDebris(rockObj.worldX, rockObj.worldY, 0, -1, true);
        this.dropStone(rockObj.worldX, rockObj.worldY);
        brokeRock = true;
      }
    }
    if (brokeRock) getSoundManager().playRockSmash();
  }

  // ── Fire spread ────────────────────────────────────────────────────────────
  // Fire is the one system in this world the player STEERS instead of unlocks. Everything
  // else here is a lock and a key — bump the rock with the pickaxe, the tree with the axe —
  // a 1:1 table with exactly one right answer, which the hint balloon then hands you. Fire is
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
  ): void {
    if (this.dialogOpen) return;
    const script = getDialog(kind);
    if (!script) return;
    if (npcWorld) {
      const key = this.dialogKeyFor(kind, npcWorld.worldX, npcWorld.worldY);
      if (key) this.seenDialogKeys.add(key);
    }
    // An NPC beside a still-dead campfire is too scared to talk: swap in the locked lines.
    const shown = this.gateDialog(script, npcWorld);
    this.openDialogScript(shown, npcWorld, getDialogVoice(kind));
  }

  // Identity of the dialog an NPC would speak *right now*: the wizard's current story beat,
  // or (for everyone else) the base lines vs the campfire-gated "locked" lines. Used both to
  // mark a dialog as heard and to decide whether the "!" new-dialog marker shows.
  private dialogKeyFor(kind: import('@/game/world/ScreenContent').NpcKind, wx: number, wy: number): string | null {
    if (kind === 'wizard') return `wizard:${this.wizardStoryState()}`;
    if (!getDialog(kind)) return null;
    const cf = this.nearestCampfireWithin(wx, wy, NPC_GATE_RADIUS_TILES);
    return cf && !cf.isLit ? `${kind}:locked` : `${kind}:base`;
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
    }, voice);
  }

  // Gate an NPC's dialog behind their campfire: if a dead fire sits within range, show the
  // scared "locked" lines (keeping the NPC's portrait/colour/voice) instead of the real ones.
  private gateDialog(script: DialogScript, npcWorld?: { worldX: number; worldY: number }): DialogScript {
    if (!npcWorld) return script;
    const cf = this.nearestCampfireWithin(npcWorld.worldX, npcWorld.worldY, NPC_GATE_RADIUS_TILES);
    if (cf && !cf.isLit) return { ...script, lines: tLines('lockedLines') };
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

  private renderProps(): void {
    if (!this.camera) return;
    for (const lv of this.lavaTiles) lv.render(this.tileSize, this.camera);
    for (const w of this.waterTiles) {
      // Show the "build a bridge here" indicator on any un-bridged river tile the hero stands
      // orthogonally next to — the exact tile a graveto would go into.
      const dist = Math.abs(w.worldX - this.playerWorld.worldX) + Math.abs(w.worldY - this.playerWorld.worldY);
      w.setBuildHint(dist === 1 && !this.dialogOpen && !this.shopOpen && !this.isDead);
      w.render(this.tileSize, this.camera);
    }
    for (const cf of this.campfires) cf.render(this.tileSize, this.camera);
    for (const b of this.dryBushes) b.render(this.tileSize, this.camera);
    for (const d of this.lockedDoors) d.render(this.tileSize, this.camera);
    for (const t of this.dryTrees) t.render(this.tileSize, this.camera);
    for (const s of this.dryShrubs) s.render(this.tileSize, this.camera);
    // (no rocks: they have no 2D FX left to re-project — see RockObject)
    for (const g of this.tallGrasses) g.render(this.tileSize, this.camera);
    // Moonflowers: shut while a LIT campfire is within ~2.6 tiles, open (walkable) in the dark.
    // Driven here because the campfires live in GameScene; the flower owns only look + collision.
    for (const mf of this.moonflowers) {
      const nearFire = this.campfires.some((cf) => cf.isLit
        && Math.hypot(cf.worldX - mf.worldX, cf.worldY - mf.worldY) <= 2.6);
      mf.setNearFire(nearFire);
      mf.render(this.tileSize, this.camera);
    }
    // Bombs are world-anchored billboards; nothing to reproject here.
  }

  private openShop(): void {
    if (this.shopOpen) return;
    getSoundManager().playShopOpen();
    this.shopOpen = true;
    this.shopOverlay = new ShopOverlay(
      this,
      this.coinManager?.coinTotal ?? 0,
      this.upgrades,
      (id) => this.handleBuy(id),
      () => this.closeShop(),
    );
  }

  private closeShop(): void {
    getSoundManager().playShopClose();
    this.shopOpen = false;
    this.shopOverlay?.destroy();
    this.shopOverlay = undefined;
  }

  private handleBuy(id: keyof UpgradeState): void {
    const cost = getUpgradeCost(id, this.upgrades[id]);
    if (cost === null || !this.coinManager?.spendCoins(cost)) return;

    this.upgrades[id] += 1;

    if (id === 'maxHealth') {
      this.playerMaxHealth += 1;
      this.playerHealth = Math.min(this.playerHealth + 1, this.playerMaxHealth);
    } else if (id === 'moveSpeed') {
      // ms per tile, now that the walk runs at one constant speed. Three levels take the base
      // walk (150ms/tile, 6.7 tiles/s) up to 105ms — 9.5 tiles/s, about the pace the whole game
      // used to move at. So the boots are what earn the old speed rather than starting there.
      this.movementController?.setMoveDuration(
        Math.max(90, TIMINGS.moveDurationMs - this.upgrades.moveSpeed * 15),
      );
    } else if (id === 'magnet') {
      this.coinManager?.setMagnetRadius(2);
    }

    this.shopOverlay?.refresh(this.coinManager?.coinTotal ?? 0, this.upgrades);

    // Update the UPGRADES_CFG iteration for any upgrade that needs it
    void UPGRADES_CFG; // ensure import is used
  }

  // The hero stepped onto a ground item. Swap: the item currently held (if any) drops on the
  // exact tile the new one occupied; the new one becomes the held item. First time for a kind
  // → the "item get" ceremony; every pickup then flies into the HUD slot.
  private onCollectItem(item: CollectedItem): void {
    const previous = this.heldItem;
    if (previous !== 'none') this.itemManager?.drop(previous, item.worldX, item.worldY);

    this.heldItem = item.kind;
    this.heldOnFire = false; // fire never survives a swap — the dropped item lands unlit
    this.torchFuelMs = 0;
    this.swordSlash?.setOnFire(false);
    this.updateBackItem(); // the held item now shows on the hero's back (no HUD slot)

    if (this.seenItems.has(item.kind)) {
      // Repeat pickup: no ceremony, just the pickup chime (the item shows on the back).
      getSoundManager().playSwordPickup();
    } else {
      // First-time pickup: the ItemGetOverlay ceremony plays its own pickup chime at the reveal.
      this.seenItems.add(item.kind);
      this.showItemGet(item.kind, () => {});
    }
  }

  // Empty the hero's hand: used when an item is consumed (bomb dropped, graveto deposited into
  // a bridge). Clears the fire/fuel state; the held item then vanishes from the hero's back.
  private clearHeldItem(): void {
    this.heldItem = 'none';
    this.heldOnFire = false;
    this.torchFuelMs = 0;
    this.updateBackItem();
  }

  // Refresh the item slung on the hero's back to match the held item (hidden when empty). Uses
  // the same per-item visual as the HUD so what you carry reads the same in both places.
  private updateBackItem(): void {
    if (this.heldItem === 'none') {
      this.backItemBb?.setVisible(false);
      return;
    }
    // A lit graveto is held upright in the hand; the separate pixel-flame effect supplies
    // the fire, so the carried sprite itself always remains the plain stick.
    const torchLit = this.isTorchLit;
    const visual = BACK_ITEM_VISUAL_3D[this.heldItem];
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
      // Deliberately SILENT bare-handed. The forest is ~850 tiles and the hero scrapes along it
      // constantly while walking, so a balloon on every bump would be wallpaper — and the
      // need-item hint only means anything while it stays rare. Holding the PLAIN axe is the
      // opposite case: the player has an axe and is being refused, and this balloon is the only
      // place the game ever explains that there are two.
      if (this.heldItem === 'axe') this.showNeedItemHint('greatAxe');
      this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
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
    this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
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
    return true;
  }

  private dropTreeStick(worldX: number, worldY: number): void {
    if (this.itemManager?.hasItemAt(worldX, worldY)) return; // never stack two on one tile
    this.itemManager?.drop('wood', worldX, worldY);
  }

  // Mowing tall grass leaves a handful of SEEDS behind, on the stubble tile — the scythe's
  // product, and what makes it a producer, not a password: plant them in a plantSpot hole,
  // water, and the grass returns. Like the graveto, they wait until the hero steps off and on.
  private dropSeeds(worldX: number, worldY: number): void {
    if (this.itemManager?.hasItemAt(worldX, worldY)) return; // never stack two on one tile
    this.itemManager?.drop('seeds', worldX, worldY);
  }

  // A shattered rock leaves a stone behind, on the tile it used to block. Wood's opposite:
  // it fords a river and it will never carry a flame (see WaterObject.placeStone / burn).
  private dropStone(worldX: number, worldY: number): void {
    if (this.itemManager?.hasItemAt(worldX, worldY)) return; // never stack two on one tile
    this.itemManager?.drop('stone', worldX, worldY);
  }

  // A stone dropped into lava cools it into basalt: a permanent walkable firebreak (LavaObject
  // owns the visual swap + releasing its heat-light). Steam and a thump sell the quench. This is
  // the lava counterpart of a stone ford — a floor over the hazard that never becomes a fuse.
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
    this.heldItem = 'bucketFull';
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
    this.heldItem = 'bucket';
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

  private handleEnemyAttackPlayer(attacker: EnemyBase): void {
    if (this.playerInvincible || this.isDead) return;

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
    this.invincibleTimer = 1500;

    this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);

    // Taking a hit lands hard: heavy shake, a red screen flash, hitstop, the skull lunging
    // into the blow, and the hero physically shoved away from the attacker.
    this.cameras.main.shake(200, 0.01);
    this.cameras.main.flash(110, 160, 30, 30);
    this.triggerHitstop(90);
    if (this.camera) {
      const kdx = Math.sign(this.playerWorld.worldX - attacker.worldX);
      const kdy = Math.sign(this.playerWorld.worldY - attacker.worldY);
      attacker.triggerKnockback(kdx, kdy); // lunge toward the hero
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
      duration: 80,
      yoyo: true,
      repeat: 5,
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
      duration: 1500,
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
      const visual = HUD_ITEM_VISUAL[this.heldItem];
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
      this.tweens.add({ targets: this.backItem, alpha: 0, duration: 3200, delay: 900, ease: 'Sine.easeIn' });
    }

    this.tweens.add({
      targets: this.deathHero,
      alpha: 0,
      duration: 3200,
      delay: 900,
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
        this.tweens.add({ targets: line, alpha: 1, duration: 3000, ease: 'Sine.easeInOut' });
      },
    });

    // Restart is independent of the tweens so a stalled tween never traps the player. Let the
    // words linger, then tap/any key to continue; auto-restart after a long, unhurried grace.
    let restarting = false;
    const doRestart = (): void => {
      if (restarting) return;
      restarting = true;
      this.scene.restart();
    };
    const autoTimer = this.time.delayedCall(12000, doRestart);
    this.time.delayedCall(4800, () => {
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
    // Back to rest: no squash, one tile tall.
    this.hero.scaleX = 1;
    this.hero.scaleY = 1;
    this.hero.sizePx = this.tileSize;
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
