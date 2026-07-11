import Phaser from 'phaser';

import {
  ANIMATION_KEYS,
  ASSET_KEYS,
  BOMB_FRAMES,
  CAMPFIRE_SAFE_RADIUS_TILES,
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
  ySortDepth,
} from '@/game/constants';
import type { DialogScript, DialogVoice } from '@/game/dialogs/NpcDialogs';
import { clearGameDebugApi, registerGameDebugApi, type GameDebugApi } from '@/game/debug/debugHooks';
import { CoinManager } from '@/game/entities/CoinManager';
import { EnemyManager } from '@/game/entities/EnemyManager';
import { UndeadSpawnDirector } from '@/game/entities/UndeadSpawnDirector';
import { NpcManager } from '@/game/entities/NpcManager';
import { HeartPickupManager } from '@/game/entities/HeartPickupManager';
import { ItemManager } from '@/game/entities/ItemManager';
import type { CollectedItem } from '@/game/entities/ItemManager';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { SwordSlash } from '@/game/runtime/SwordOrbit';
import { CampfireObject } from '@/game/objects/CampfireObject';
import { DryBushObject } from '@/game/objects/DryBushObject';
import { DryTreeObject } from '@/game/objects/DryTreeObject';
import { DryShrubObject } from '@/game/objects/DryShrubObject';
import { LavaObject } from '@/game/objects/LavaObject';
import { WaterObject } from '@/game/objects/WaterObject';
import { LockedDoorObject } from '@/game/objects/LockedDoorObject';
import { RockObject } from '@/game/objects/RockObject';
import { TallGrassObject } from '@/game/objects/TallGrassObject';
import { t, tLines } from '@/game/i18n/i18n';
import { DialogOverlay } from '@/game/runtime/DialogOverlay';
import { ItemGetOverlay, type ItemGetConfig } from '@/game/runtime/ItemGetOverlay';
import { ShopOverlay, type UpgradeState, getUpgradeCost, UPGRADES_CFG } from '@/game/runtime/ShopOverlay';
import { GameBoardRenderer } from '@/game/runtime/GameBoardRenderer';
import { CastShadowPool, type FireLightCtx, type ShadowCaster } from '@/game/runtime/CastShadow';
import { PlayerMovementController } from '@/game/runtime/PlayerMovementController';
import { animateGrassRustle } from '@/game/runtime/RuntimeEffects';
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
  getBridgeSpots,
  getLockedDoors,
  getRocks,
  getTallGrass,
  getDialog,
  getDialogKinds,
  getDialogVoice,
  getPlayerStart,
} from '@/game/world/WorldData';

// The darkness/light overlay renders into a texture this many times smaller than the screen,
// then scales back up with NEAREST — so every light circle is made of chunky pixel blocks
// (matching the game's pixel-art scale) instead of a smooth high-res gradient. Higher = chunkier.
const LIGHT_DOWNSCALE = 6;

// The low-res light/fog overlays bleed this many texels past every screen edge: their position is
// shifted up-left and their size padded on both axes, so the visible viewport falls strictly inside
// the fully-filled interior of the texture. Without this, upscaling the RenderTexture with NEAREST
// leaves a ~1px seam at an edge (notably the very top) where the fog/dark is missing. Erase/draw
// coordinates in updateLighting are inset by LIGHT_MARGIN texels to keep light holes aligned.
const LIGHT_MARGIN = 1;

// Firelight isn't just "un-dark" — fire sources (campfires + lava) stamp a warm amber pool over
// the already-dimmed ground so a flame visibly warms the world, against the cold-blue dark. The
// pool sits slightly inside the light circle (WARM_POOL_SCALE < 1) so its rim fades back to
// neutral before the darkness; WARM_INTENSITY is the additive strength of the amber core. The
// hero's own glow deliberately stays neutral, so only real fire reads as warm.
const WARM_POOL_SCALE = 0.82;
const WARM_INTENSITY = 0.5;

// Distance fog — a second, deeper darkness layer stacked over the base dim. It is FULL everywhere
// and only clears in a WIDE, soft halo around each light source (campfire, hero, NPC, lava), so
// anywhere out of a flame's reach settles into a thick cold gloom while lit areas stay readable.
// The result: the farther you are from light, the darker it gets — the dark "fogs in" at the edges
// of vision. Rendered into the same low-res overlay → chunky pixel fog, matching the light style.
// FOG_MAX_ALPHA = how black the far dark gets (on top of the base dim); FOG_LIFT_SCALE = how far
// past a light's own glow the fog is pushed back (× the light radius); FOG_COLOR = its cold tint.
const FOG_MAX_ALPHA = 0.38;
const FOG_LIFT_SCALE = 2.15;
const FOG_COLOR = 0x02030d;

// How each held item shows in the HUD slot / flies in (a burning item swaps its own way).
const HUD_ITEM_VISUAL: Record<HeldItemKind, { texture: string; frame: number }> = {
  sword: { texture: ASSET_KEYS.swordItemIcon, frame: 0 },
  key: { texture: ASSET_KEYS.keyItem, frame: KEY_FRAMES.held },
  axe: { texture: ASSET_KEYS.axeIcon, frame: 0 },
  bomb: { texture: ASSET_KEYS.bombIcon, frame: 0 },
  lavaBoots: { texture: ASSET_KEYS.lavaBootsIcon, frame: 0 },
  pickaxe: { texture: ASSET_KEYS.pickaxeIcon, frame: 0 },
  scythe: { texture: ASSET_KEYS.scytheIcon, frame: 0 },
  wood: { texture: ASSET_KEYS.woodIcon, frame: 0 },
};

// Bumping something you can't use yet pops a speech balloon over the hero's head showing
// exactly the item still needed. One entry per "locked" interaction — a lit flame for dead
// fires and dry brush, the matching tool for trees/rock/grass, a key for doors, lava boots
// for lava. "fire" reuses the burning-torch HUD icon (a lit flame is what the hero must carry).
const NEED_ITEM_ICON = {
  fire: { texture: ASSET_KEYS.woodOnFireIcon, frame: 0 },
  key: { texture: ASSET_KEYS.keyItemIcon, frame: 0 },
  axe: { texture: ASSET_KEYS.axeIcon, frame: 0 },
  pickaxe: { texture: ASSET_KEYS.pickaxeIcon, frame: 0 },
  scythe: { texture: ASSET_KEYS.scytheIcon, frame: 0 },
  lavaBoots: { texture: ASSET_KEYS.lavaBootsIcon, frame: 0 },
  graveto: { texture: ASSET_KEYS.woodIcon, frame: 0 }, // a wood stick, to build a bridge
} as const;
type NeedItemKind = keyof typeof NEED_ITEM_ICON;

// The raised sprite + caption for each item's first-time "item get" ceremony.
const ITEM_GET_CFG: Record<HeldItemKind, ItemGetConfig> = {
  sword: { texture: ASSET_KEYS.swordItem, frame: ITEM_FRAMES.swordIdle, label: 'VOCE PEGOU A ESPADA!' },
  key: { texture: ASSET_KEYS.keyItem, frame: KEY_FRAMES.held, label: 'VOCE PEGOU A CHAVE!' },
  axe: { texture: ASSET_KEYS.axeIcon, frame: 0, label: 'VOCE PEGOU O MACHADO!' },
  bomb: { texture: ASSET_KEYS.bombItem, frame: BOMB_FRAMES.item, label: 'VOCE PEGOU A BOMBA! [ESPACO] SOLTA' },
  lavaBoots: { texture: ASSET_KEYS.lavaBootsIcon, frame: 0, label: 'VOCE PEGOU AS BOTAS DE LAVA!' },
  pickaxe: { texture: ASSET_KEYS.pickaxeIcon, frame: 0, label: 'VOCE PEGOU A PICARETA!' },
  scythe: { texture: ASSET_KEYS.scytheIcon, frame: 0, label: 'VOCE PEGOU A FOICE!' },
  wood: { texture: ASSET_KEYS.woodIcon, frame: 0, label: 'VOCE PEGOU UM GRAVETO!' },
};

// What each melee-capable item does to an enemy on a bump. The sword is an instant kill — one
// hit drops any enemy. The wood stick (the "graveto") and the axe are improvised weapons that
// hit for half — enough to fight skulls in a pinch, but the sword is lethal.
const MELEE_DAMAGE: Partial<Record<HeldItemKind, number>> = {
  sword: 999,
  wood: 0.5,
  axe: 0.5,
};

const BOMB_FUSE_MS = 1600;
const BOMB_BLAST_RADIUS_TILES = 2.2;

// Resting in a lit campfire's safe ring mends one heart every this many ms (leaving the ring
// resets the timer, so healing is a "warm up by the fire" beat, not passive regen anywhere).
const HEALTH_REGEN_MS = 2500;

// At or below this many hearts the hero shows the low-health "heartbeat" (a red pixel outline).
const LOW_HEALTH_HEARTS = 2;
// The 8 offset directions used to build the red outline around the hero (cardinals + diagonals).
const OUTLINE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1],
];

// How many river tiles a single felled tree can bridge when it topples ("TIMBER!"). A wider
// river needs more than one tree.
const TIMBER_MAX_SPAN = 3;

// How long to hide the back item during a swing (a touch longer than SwordSlash's arc + fade,
// ~155 + 65ms) so the item never shows on the back and in the swing arc at the same time.
const SWING_HIDE_MS = 240;

export class GameScene extends Phaser.Scene {
  public static readonly key = 'game';

  private camera?: WorldCamera;
  private chunkManager?: ChunkManager;
  private enemyManager?: EnemyManager;
  private spawnDirector?: UndeadSpawnDirector;
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
  private campfires: CampfireObject[] = [];
  private dryBushes: DryBushObject[] = [];
  private lockedDoors: LockedDoorObject[] = [];
  private dryTrees: DryTreeObject[] = [];
  private dryShrubs: DryShrubObject[] = [];
  private rocks: RockObject[] = [];
  private tallGrasses: TallGrassObject[] = [];
  private lavaTiles: LavaObject[] = [];
  private waterTiles: WaterObject[] = [];
  // Lit bombs on the ground, world-anchored so they scroll with the map until they blow.
  private activeBombs: Array<{ worldX: number; worldY: number; sprite: Phaser.GameObjects.Sprite }> = [];
  private spaceKey?: Phaser.Input.Keyboard.Key;
  private boardRenderer?: GameBoardRenderer;
  private player?: Phaser.GameObjects.Sprite;
  // The held item, slung diagonally on the hero's back like it's tucked in a satchel.
  private backItem?: Phaser.GameObjects.Image;
  // Hides the back item while the same item is mid-swing, so it isn't shown in two places.
  private backItemSwingTimer?: Phaser.Time.TimerEvent;
  private movementController?: PlayerMovementController;
  private playerWorld = { worldX: 0, worldY: 0 };
  private playerMaxHealth = HUD_HEALTH_MAX;
  private playerHealth = HUD_HEALTH_MAX;
  private playerInvincible = false;
  private invincibleTimer = 0;
  // Counts up while resting in a campfire's safe ring; mends a heart each HEALTH_REGEN_MS.
  private healthRegenTimer = 0;
  private tileSize = MIN_BOARD_TILE_SIZE;
  private isDead = false;
  private shopOpen = false;
  private shopOverlay?: ShopOverlay;
  private dialogOpen = false;
  private dialogOverlay?: DialogOverlay;
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
  private eKey?: Phaser.Input.Keyboard.Key;
  private upgrades: UpgradeState = { maxHealth: 0, swordSpeed: 0, moveSpeed: 0, magnet: 0 };
  // Center chunk of the streamed window; NaN forces the first stream.
  private streamCenter = { cx: NaN, cy: NaN };
  private debugApi?: GameDebugApi;

  // Lighting
  private darknessOverlay?: Phaser.GameObjects.RenderTexture;
  // Warm additive layer: only fire sources (campfires + lava) stamp an amber pool into it, so
  // firelight reads as warm against the cold-blue dark while the hero's own glow stays neutral.
  private warmOverlay?: Phaser.GameObjects.RenderTexture;
  // Distance-fog layer: a deeper darkness that only clears in a wide halo around each light, so the
  // world "fogs into" black the farther a tile is from any flame/glow. See FOG_* knobs up top.
  private fogOverlay?: Phaser.GameObjects.RenderTexture;
  private lightCircleImg?: Phaser.GameObjects.Image;
  private warmLightImg?: Phaser.GameObjects.Image;
  private fogLightImg?: Phaser.GameObjects.Image;
  private playerShadow?: Phaser.GameObjects.Ellipse;
  private readonly lightFlicker = { radius: 1.0, velocity: 0 };
  // Dynamic firelight cast shadows: the tree tiles are handled inside GameBoardRenderer; this pool
  // covers the runtime props (dry trees, rocks, bushes, shrubs, gates) standing in a flame's glow.
  private castShadowPool?: CastShadowPool;

  // Low-health "heartbeat": a pulsing red PIXEL OUTLINE around the hero (never painting the
  // sprite itself), ramping up as the last hearts drain. Built the classic pixel-art way —
  // red-filled copies of the hero sprite offset in 8 directions, drawn behind it, so only the
  // border shows through.
  private readonly lowHealthOutlines: Phaser.GameObjects.Sprite[] = [];
  private heartbeatPhase = 0;

  // Footprints (world-anchored so they scroll with the ground)
  private footprintStep = false;
  private readonly footprints: Array<{ obj: Phaser.GameObjects.Ellipse; worldX: number; worldY: number; offX: number; offY: number }> = [];

  // Breathing idle
  private breathingTween?: Phaser.Tweens.Tween;
  private lastStepTime = 0;
  private breathingBaseY = 0;

  // "You need this item" balloon over the hero's head (see showNeedItemHint)
  private needItemHint?: Phaser.GameObjects.Container;
  private needItemHintTween?: Phaser.Tweens.Tween;

  public constructor() {
    super(GameScene.key);
  }

  public create(): void {
    const { worldX: startWorldX, worldY: startWorldY } = getPlayerStart();

    this.isDead = false;
    this.playerMaxHealth = HUD_HEALTH_MAX;
    this.playerHealth = HUD_HEALTH_MAX;
    this.playerInvincible = false;
    this.playerWorld = { worldX: startWorldX, worldY: startWorldY };
    this.streamCenter = { cx: NaN, cy: NaN };
    this.shopOpen = false;
    this.upgrades = { maxHealth: 0, swordSpeed: 0, moveSpeed: 0, magnet: 0 };

    this.cameras.main.setBackgroundColor('#1a1a2e');

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
    // spawn director while they linger in the dark, away from campfires.
    this.enemyManager = new EnemyManager(this);
    this.spawnDirector = new UndeadSpawnDirector();
    this.playerSafe = true;
    this.healthRegenTimer = 0;
    this.firstCampfireLit = false;
    this.litFireCount = 0;
    this.wizardIntroSeen = false;
    this.cutsceneActive = false;
    this.cutsceneFireLight = undefined;
    this.cutsceneHeroLight = 1;
    this.npcManager = new NpcManager(this, getContent);
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
    this.boardRenderer = new GameBoardRenderer(this);

    this.player = this.add
      .sprite(0, 0, ASSET_KEYS.hero, HERO_FRAMES.idleDown)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.player);

    // Item slung on the hero's back — hidden until something is picked up (see updateBackItem).
    this.backItem = this.add
      .image(0, 0, ASSET_KEYS.swordItemIcon)
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(SCENE_DEPTHS.player - 1);

    this.createAnimations();

    this.movementController = new PlayerMovementController(
      this,
      this.player,
      this.camera,
      (wx, wy) => {
        // The hero also stops on enemies (to attack them); everything else that blocks is
        // shared with enemies via isSolidForEntities — except lava, which the hero can
        // cross while wearing the lava boots.
        if (this.enemyManager?.getEnemyAt(wx, wy)) return true;
        return this.isSolidForEntities(wx, wy, this.heldItem === 'lavaBoots');
      },
      (wx, wy) => animateGrassRustle(this, this.boardRenderer?.getGrassSprite(wx, wy), this.tileSize),
      (wx, wy) => this.handlePlayerBump(wx, wy),
    );

    this.eKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.spaceKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

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
    this.lockedDoors = getLockedDoors().map((d) => new LockedDoorObject(this, d.worldX, d.worldY));
    this.dryTrees = getDryTrees().map((t) => new DryTreeObject(this, t.worldX, t.worldY));
    this.dryShrubs = getDryShrubs().map((s) => new DryShrubObject(this, s.worldX, s.worldY));
    this.rocks = getRocks().map((r) => new RockObject(this, r.worldX, r.worldY));
    this.tallGrasses = getTallGrass().map((g) => new TallGrassObject(this, g.worldX, g.worldY));
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

    this.registerDebugApi();

    // Live playtest launched from the world editor: ESC stops the run and wakes the
    // sleeping EditorScene, with the in-memory (possibly unsaved) world still loaded.
    if (this.registry.get('appMode') === 'editor') this.enableEditorReturn();
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
    registerGameDebugApi(this.debugApi);
  }

  public shutdown(): void {
    if (this.debugApi) {
      clearGameDebugApi(this.debugApi);
      this.debugApi = undefined;
    }
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
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
    this.lavaTiles.forEach((l) => l.destroy());
    this.waterTiles.forEach((w) => w.destroy());
    this.activeBombs.forEach((b) => b.sprite.destroy());
    this.shopOverlay?.destroy();
    this.backItemSwingTimer?.remove();
    this.backItemSwingTimer = undefined;
    this.backItem?.destroy();
    this.backItem = undefined;
    this.breathingTween?.destroy();
    this.breathingTween = undefined;
    this.needItemHintTween?.stop();
    this.needItemHintTween = undefined;
    this.needItemHint?.destroy();
    this.needItemHint = undefined;
    this.footprints.length = 0;
    this.lightCircleImg?.destroy();
    this.warmLightImg?.destroy();
    this.fogLightImg?.destroy();
    this.castShadowPool?.destroy();
    this.castShadowPool = undefined;
    this.darknessOverlay?.destroy();
    this.warmOverlay?.destroy();
    this.fogOverlay?.destroy();
    this.playerShadow?.destroy();
    this.lowHealthOutlines.forEach((o) => o.destroy());
    this.lowHealthOutlines.length = 0;
    if (this.textures.exists('_campfire_light')) this.textures.remove('_campfire_light');
    if (this.textures.exists('_warm_light')) this.textures.remove('_warm_light');
    if (this.textures.exists('_fog_light')) this.textures.remove('_fog_light');
    this.swordSlash = undefined;
    this.campfires = [];
    this.dryBushes = [];
    this.lockedDoors = [];
    this.dryTrees = [];
    this.dryShrubs = [];
    this.rocks = [];
    this.tallGrasses = [];
    this.lavaTiles = [];
    this.waterTiles = [];
    this.activeBombs = [];
    this.lightCircleImg = undefined;
    this.warmLightImg = undefined;
    this.fogLightImg = undefined;
    this.darknessOverlay = undefined;
    this.warmOverlay = undefined;
    this.fogOverlay = undefined;
    this.playerShadow = undefined;
    this.heartbeatPhase = 0;
  }

  public update(_time: number, delta: number): void {
    // Hide the low-health outline up front; the active-play FX below re-shows it each frame if
    // still low. So any frozen state (dialog, shop, item-get, death) leaves it hidden instead
    // of stranding it, misaligned, where the hero last was.
    this.hideLowHealthOutlines();

    // The camera pan (open or close) drives its own reprojection from the tween, so keep the
    // world frozen here until it finishes — otherwise gameplay would fight the pan.
    if (this.dialogOpen || this.camShifting) {
      this.dialogOverlay?.update();
      return;
    }

    // The item-get and first-campfire cut-scene both freeze gameplay; only their own tweens run.
    if (this.itemGetOpen || this.cutsceneActive) return;

    if (this.eKey && Phaser.Input.Keyboard.JustDown(this.eKey)) this.toggleShop();

    if (this.camera) {
      this.updateLighting(delta);
      this.updatePlayerShadow();
    }

    if (this.isDead || this.shopOpen || !this.movementController || !this.boardRenderer || !this.chunkManager || !this.camera) {
      return;
    }

    // The bomb is the one consumable: SPACE drops it lit on the hero's tile.
    if (this.heldItem === 'bomb' && this.spaceKey && Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.placeBomb();
    }

    const prevWorldX = this.playerWorld.worldX;
    const prevWorldY = this.playerWorld.worldY;
    this.playerWorld = this.movementController.update(this.playerWorld.worldX, this.playerWorld.worldY);
    // Y-sort the hero so it walks in front of / behind obstacles by row.
    this.player?.setDepth(ySortDepth(this.playerWorld.worldY, 0.03));
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
    // Firelight cast shadows breathe with the flame flicker (already advanced by updateLighting
    // above). Build the light context once and thread it through the tree renderer and, later,
    // the prop shadow pool (after renderProps positions the props).
    const shadowCtx = this.buildFireLightCtx();
    this.boardRenderer.updateWorld(this.camera, this.chunkManager, this.tileSize, shadowCtx);
    this.updateFootprints();
    this.positionBackItem();

    // Burn the carried flame down; snuff it when the fuel runs out (leaving the hero exposed
    // in the dark). Re-igniting at a lit campfire or lava refills it.
    if (this.heldOnFire) {
      this.torchFuelMs -= delta;
      if (this.torchFuelMs <= 0) this.extinguishTorch();
    }

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
      if (this.healthRegenTimer >= HEALTH_REGEN_MS) {
        this.healthRegenTimer = 0;
        this.playerHealth = Math.min(this.playerMaxHealth, this.playerHealth + 1);
        getSoundManager().playHeartPickup();
      }
    } else {
      this.healthRegenTimer = 0;
    }

    if (this.enemyManager) {
      const attacked = this.enemyManager.update(
        delta,
        this.playerWorld.worldX,
        this.playerWorld.worldY,
        this.playerSafe,
        (wx, wy) => {
          // Enemies respect the same solid tiles as the hero (terrain, trees, campfires,
          // dry bushes, NPCs) — and they refuse to step into campfire light: the undead
          // exist only in the dark. The hero's own glow is not a barrier (they hunt him).
          if (this.isSolidForEntities(wx, wy)) return true;
          return this.isTileLitByCampfire(wx, wy);
        },
      );
      if (attacked) this.handleEnemyAttackPlayer();
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
      const uiOwnsMusic = this.cutsceneActive || this.dialogOpen || this.shopOpen || this.itemGetOpen;
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
        this.player?.setAlpha(1);
      }
    }

    this.updateLowHealthFx(delta);

    // Felled trees grow back after a while (renewable gravetos = no soft-lock). The clock only
    // ticks while the tile is clear — crucially, a dropped item (the graveto) on the stump
    // pauses it, so the timer truly starts only once that item is picked up.
    for (const tree of this.dryTrees) {
      if (tree.updateRegrow(delta, this.isTileClearForRegrow(tree.worldX, tree.worldY))) {
        tree.regrow();
      }
    }

    if (this.npcManager && this.camera) this.npcManager.render(this.tileSize, this.camera);
    this.renderProps();

    // Prop cast shadows, now that renderProps has placed every prop for this frame.
    this.castShadowPool?.update(this.collectPropCasters(), shadowCtx, this.tileSize, this.camera);
  }

  // The nearest-lit-flame lookup + flame flicker the cast-shadow maths needs, rebuilt each frame.
  private buildFireLightCtx(): FireLightCtx {
    const cam = this.camera!;
    const tileSize = this.tileSize;
    const campfires = this.campfires;
    // Shadows reach a little past the light's resting radius: the glow itself breathes out to
    // ~LIGHT_RADIUS × 1.2 with the flicker, so objects lit near the edge must still cast (else
    // some clearly-lit trees would sit shadowless).
    const radiusTiles = LIGHT_RADIUS_TILES + 1.5;
    return {
      flicker: this.lightFlicker.radius,
      radiusPx: radiusTiles * tileSize,
      nearest: (wx, wy) => {
        let best: CampfireObject | undefined;
        let bestD = Infinity;
        for (const cf of campfires) {
          if (!cf.isLit) continue;
          const d = Math.hypot(cf.worldX - wx, cf.worldY - wy);
          if (d < bestD) { bestD = d; best = cf; }
        }
        if (!best || bestD > radiusTiles) return null;
        const s = cam.tileToScreen(best.worldX, best.worldY, tileSize);
        return { sx: s.x, sy: s.y };
      },
    };
  }

  // Every actor/prop that should throw a firelight shadow while standing in a flame's glow: the
  // hero, the NPCs, and the standing props. Felled/broken/opened props opt out via a null
  // shadowCaster; tall grass, lava and water are flat and never cast.
  private collectPropCasters(): ShadowCaster[] {
    const casters: ShadowCaster[] = [];
    const add = (
      arr: ReadonlyArray<{ shadowCaster: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image | null; worldX: number; worldY: number }>,
    ): void => {
      for (const p of arr) {
        const sprite = p.shadowCaster;
        if (sprite) casters.push({ sprite, worldX: p.worldX, worldY: p.worldY });
      }
    };
    add(this.dryTrees);
    add(this.dryShrubs);
    add(this.dryBushes);
    add(this.rocks);
    add(this.lockedDoors);

    // NPCs standing near a lit fire throw shadows too.
    if (this.npcManager) {
      for (const c of this.npcManager.getShadowCasters()) casters.push(c);
    }
    // The hero, pinned at screen centre — its silhouette sweeps around its feet with the flame.
    // Anchor it at the fixed screen centre (not its scrolling tile) so the shadow never lags the
    // hero as the world scrolls under it during a step.
    if (this.player && this.camera && !this.isDead) {
      casters.push({
        sprite: this.player,
        worldX: this.playerWorld.worldX,
        worldY: this.playerWorld.worldY,
        footScreen: {
          x: this.camera.screenCenterX,
          y: this.camera.screenCenterY + Math.round(this.tileSize * 0.3),
        },
      });
    }
    return casters;
  }

  private handleResize(gameSize: Phaser.Structs.Size | { width: number; height: number }): void {
    const { width, height } = gameSize;
    this.cameras.main.setViewport(0, 0, width, height);

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

    this.player?.setDisplaySize(this.tileSize, this.tileSize);
    this.movementController?.syncPlayerToWorld(this.playerWorld.worldX, this.playerWorld.worldY, this.tileSize);

    const g = this.lightOverlayGeom(width, height);
    if (this.darknessOverlay) {
      this.darknessOverlay
        .setPosition(g.x, g.y)
        .setScale(LIGHT_DOWNSCALE)
        .resize(g.texW, g.texH);
      this.darknessOverlay.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    if (this.warmOverlay) {
      this.warmOverlay
        .setPosition(g.x, g.y)
        .setScale(LIGHT_DOWNSCALE)
        .resize(g.texW, g.texH);
      this.warmOverlay.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    if (this.fogOverlay) {
      this.fogOverlay
        .setPosition(g.x, g.y)
        .setScale(LIGHT_DOWNSCALE)
        .resize(g.texW, g.texH);
      this.fogOverlay.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
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
  private isSolidForEntities(wx: number, wy: number, lavaPassable = false): boolean {
    if (this.chunkManager?.isCellBlocked(wx, wy)) return true;
    if (this.getCampfireAt(wx, wy)) return true;
    if (this.getDryBushAt(wx, wy)?.blocking) return true;
    if (this.getLockedDoorAt(wx, wy)?.blocking) return true;
    if (this.getDryTreeAt(wx, wy)?.blocking) return true;
    if (this.getDryShrubAt(wx, wy)?.blocking) return true;
    if (this.getRockAt(wx, wy)?.blocking) return true;
    if (this.getTallGrassAt(wx, wy)?.blocking) return true;
    if (!lavaPassable && this.getLavaAt(wx, wy)) return true;
    if (this.getWaterAt(wx, wy)?.blocking) return true;
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

  // Firelight is undead-repellent: tiles inside a campfire's glow are walls to them.
  private isTileLitByCampfire(wx: number, wy: number): boolean {
    return this.distToNearestCampfireTiles(wx, wy) <= LIGHT_RADIUS_TILES;
  }

  // A skull can rise only on an open, dark tile that nothing occupies.
  private canSpawnUndeadAt(wx: number, wy: number): boolean {
    if (this.isSolidForEntities(wx, wy)) return false;
    if (this.isTileLitByCampfire(wx, wy)) return false;
    if (this.enemyManager?.getEnemyAt(wx, wy)) return false;
    if (wx === this.playerWorld.worldX && wy === this.playerWorld.worldY) return false;
    return true;
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
        if (this.isFlammableHeld) {
          this.swingHeld(wx, wy);
          // Light the torch at the fire, or top it back up if it's already burning.
          if (!this.heldOnFire) this.time.delayedCall(150, () => { this.igniteHeldItem(); });
          else this.refuelTorch();
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
    if (lava) {
      if (this.isFlammableHeld && !this.heldOnFire) {
        this.swingHeld(wx, wy);
        this.time.delayedCall(150, () => { this.igniteHeldItem(); });
      } else {
        // Lava is blocking (no boots on) and there's no torch to light here: show the boots.
        this.showNeedItemHint('lavaBoots');
      }
      this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
      return;
    }

    // River — only tiles marked with a `bridgeSpot` are buildable. On a buildable spot, bump it
    // holding a wood stick (a "graveto") to deposit it; two gravetos build the bridge. Plain
    // river tiles just block (no interaction).
    const water = this.getWaterAt(wx, wy);
    if (water?.blocking) {
      if (water.canBuild) {
        if (this.heldItem === 'wood') {
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
          if (bush.ignite()) this.spawnFireHitEffect(wx, wy);
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
      if (this.heldItem === 'axe') {
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
      if (this.heldItem === 'axe') {
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

    // Rock — the pickaxe cracks it, then shatters it open.
    const rock = this.getRockAt(wx, wy);
    if (rock?.blocking) {
      if (this.heldItem === 'pickaxe') {
        this.swingHeld(wx, wy);
        this.time.delayedCall(150, () => {
          if (rock.smash(this.tileSize)) getSoundManager().playRockSmash();
        });
      } else {
        rock.shake();
        this.showNeedItemHint('pickaxe');
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
        this.time.delayedCall(110, () => grass.cut());
      } else if (this.isFlammableHeld && this.heldOnFire) {
        this.swingHeld(wx, wy);
        this.time.delayedCall(150, () => {
          if (grass.ignite()) this.spawnFireHitEffect(wx, wy);
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
          if (door.unlock()) getSoundManager().playShopOpen();
        });
      } else {
        door.shake();
        this.showNeedItemHint('key');
      }
      this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
      return;
    }

    const enemy = this.enemyManager?.getEnemyAt(wx, wy);
    if (!enemy) return;

    // Only a melee-capable item hurts enemies: the sword (full damage, scaled by upgrades)
    // or the wood club (half damage, no upgrade scaling).
    const damage = MELEE_DAMAGE[this.heldItem as HeldItemKind];
    if (damage === undefined) return;

    const hits = this.heldItem === 'sword' ? 1 + this.upgrades.swordSpeed : 1;
    for (let i = 0; i < hits; i++) enemy.takeDamage(damage);

    this.swingHeld(wx, wy);
    const dx = wx - this.playerWorld.worldX;
    const dy = wy - this.playerWorld.worldY;
    enemy.triggerKnockback(dx, dy, this.tileSize);
    if (this.heldOnFire && enemy.isAlive) this.spawnFireHitEffect(wx, wy);

    getSoundManager().playEnemyHit();
    this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
    this.player?.setTint(0xffff00);
    this.time.delayedCall(120, () => { this.player?.clearTint(); });

    if (!enemy.isAlive) {
      getSoundManager().playEnemyDeath();
    }
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
    const screen = this.camera.tileToScreen(this.playerWorld.worldX, this.playerWorld.worldY, this.tileSize);
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

  // Light the held item (the wood club — the only flammable item) at a fire source
  // (lit campfire or lava). The sword is not flammable, so it never reaches here.
  private igniteHeldItem(): void {
    if (!this.isFlammableHeld || this.heldOnFire) return;
    getSoundManager().playIgnite();
    this.heldOnFire = true;
    this.refuelTorch();
    this.updateBackItem(); // the graveto on the back now shows aflame
    // Orange flash on the player as the fire transfers
    this.player?.setTint(0xff6600);
    this.time.delayedCall(250, () => { this.player?.clearTint(); });
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

  // A few grey puffs rising where a flame died.
  private spawnSmokePuff(wx: number, wy: number): void {
    if (!this.camera) return;
    const s = this.camera.tileToScreen(wx, wy, this.tileSize);
    for (let i = 0; i < 3; i++) {
      const ox = Phaser.Math.Between(-4, 4);
      const puff = this.add
        .circle(s.x + ox, s.y - this.tileSize * 0.2, Math.max(2, Math.floor(this.tileSize * 0.12)), 0x8a8a8a, 0.55)
        .setDepth(SCENE_DEPTHS.player + 3);
      this.tweens.add({
        targets: puff,
        y: puff.y - this.tileSize * 0.7,
        alpha: 0,
        scale: 1.8,
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

  // ── Bomb ───────────────────────────────────────────────────────────────────
  // The one consumable: SPACE drops it lit under the hero; after the fuse it explodes —
  // killing every enemy in the blast and setting fire to everything flammable there.
  private placeBomb(): void {
    if (this.heldItem !== 'bomb') return;
    const worldX = this.playerWorld.worldX;
    const worldY = this.playerWorld.worldY;

    this.clearHeldItem();
    getSoundManager().playBombPlace();

    const sprite = this.add
      .sprite(0, 0, ASSET_KEYS.bombItem, BOMB_FRAMES.item)
      .setOrigin(0.5)
      .setDepth(ySortDepth(worldY) - 0.3);
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

  private explodeBomb(bomb: { worldX: number; worldY: number; sprite: Phaser.GameObjects.Sprite }): void {
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

    // Set fire to everything flammable in the area.
    for (const bushObj of this.dryBushes) {
      if (inBlast(bushObj.worldX, bushObj.worldY) && bushObj.ignite()) {
        this.spawnFireHitEffect(bushObj.worldX, bushObj.worldY);
      }
    }
    for (const grassObj of this.tallGrasses) {
      if (inBlast(grassObj.worldX, grassObj.worldY) && grassObj.ignite()) {
        this.spawnFireHitEffect(grassObj.worldX, grassObj.worldY);
      }
    }
  }

  private spawnFireHitEffect(wx: number, wy: number): void {
    if (!this.camera) return;
    getSoundManager().playFireHit();
    const screen = this.camera.tileToScreen(wx, wy, this.tileSize);
    const fireKeys = [ASSET_KEYS.tinyFire0, ASSET_KEYS.tinyFire1, ASSET_KEYS.tinyFire2];
    const baseSize = Math.floor(this.tileSize * 0.38);

    for (let i = 0; i < 3; i++) {
      const ox = Phaser.Math.Between(-Math.floor(this.tileSize * 0.28), Math.floor(this.tileSize * 0.28));
      const oy = Phaser.Math.Between(-Math.floor(this.tileSize * 0.15), Math.floor(this.tileSize * 0.10));
      const f  = this.add
        .image(screen.x + ox, screen.y + oy, fireKeys[i % fireKeys.length])
        .setDisplaySize(baseSize, baseSize)
        .setDepth(SCENE_DEPTHS.player + 3)
        .setOrigin(0.5);

      this.tweens.add({
        targets: f,
        alpha:   0,
        y:       f.y - Math.floor(this.tileSize * 0.55),
        duration: 320 + i * 90,
        ease:    'Power2.easeOut',
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
    // An NPC beside a still-dead campfire is too scared to talk: swap in the locked lines.
    const shown = this.gateDialog(script, npcWorld);
    this.openDialogScript(shown, npcWorld, getDialogVoice(kind));
  }

  // The wizard tells the story of Zero, always opening (on the very first talk) with the intro
  // beat — its narrator line MUST be the first thing he shows. Later visits give "protect the
  // flame"; the second lit fire unlocks the closing prophecy, which ends the intro.
  private openWizardDialog(npcWorld: { worldX: number; worldY: number }): void {
    if (this.dialogOpen) return;
    const base = getDialog('wizard');
    if (!base) return;
    const state = this.wizardStoryState();
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
  // Used to redraw every frame of the dialog camera pan (update() is short-circuited then).
  private reprojectStatic(): void {
    if (!this.camera || !this.boardRenderer || !this.chunkManager) return;
    this.updateLighting(0);
    this.updatePlayerShadow();
    this.player?.setPosition(this.camera.screenCenterX, this.camera.screenCenterY);
    this.positionBackItem();
    // Keep the firelight shadows glued to the props/trees as the camera pans during a dialog.
    const shadowCtx = this.buildFireLightCtx();
    this.boardRenderer.updateWorld(this.camera, this.chunkManager, this.tileSize, shadowCtx);
    this.updateFootprints();
    this.enemyManager?.render(this.tileSize, this.camera);
    this.coinManager?.render(this.tileSize, this.camera);
    this.heartPickupManager?.render(this.tileSize, this.camera);
    this.itemManager?.render(this.tileSize, this.camera);
    this.npcManager?.render(this.tileSize, this.camera);
    this.renderProps();
    this.castShadowPool?.update(this.collectPropCasters(), shadowCtx, this.tileSize, this.camera);
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
    for (const r of this.rocks) r.render(this.tileSize, this.camera);
    for (const g of this.tallGrasses) g.render(this.tileSize, this.camera);
    for (const bomb of this.activeBombs) {
      const s = this.camera.tileToScreen(bomb.worldX, bomb.worldY, this.tileSize);
      const size = Math.max(10, Math.floor(this.tileSize * 0.62));
      bomb.sprite.setPosition(s.x, s.y).setDisplaySize(size, size).setDepth(ySortDepth(bomb.worldY) - 0.3);
    }
  }

  private toggleShop(): void {
    if (this.shopOpen) this.closeShop(); else this.openShop();
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
      this.movementController?.setMoveDuration(Math.max(60, 140 - this.upgrades.moveSpeed * 20));
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
    if (!this.backItem) return;
    if (this.heldItem === 'none') {
      this.backItem.setVisible(false);
      return;
    }
    // A lit graveto shows its flame on the hero's back too, so the carried fire reads at a glance.
    const visual = this.heldItem === 'wood' && this.heldOnFire
      ? { texture: ASSET_KEYS.woodOnFireIcon, frame: 0 }
      : HUD_ITEM_VISUAL[this.heldItem];
    // Real size: draw the item at one full tile, the same pixel scale as the hero and the
    // world sprites — no shrinking.
    const size = this.tileSize;
    this.backItem
      .setTexture(visual.texture, visual.frame)
      .setDisplaySize(size, size)
      .setRotation(-0.62) // tilted like a slung tool — "meio cruzado"
      .setVisible(true);
    this.positionBackItem();
  }

  // Pin the back item high on the hero's back, anchored to screen centre (the hero is always
  // there — breathing keeps it visually centred too — so we don't read player.y). Facing up
  // means we see his back, so the item sits IN FRONT of the hero (whole object shows); any
  // other facing puts it BEHIND, where the body hides all but the tip poking over the shoulder.
  // Facing comes from the movement controller (the sprite's own facing), so it never gets out
  // of sync with the hero — a bump never flips the item to the front on its own.
  private positionBackItem(): void {
    if (!this.backItem?.visible || !this.camera) return;
    const size = this.tileSize;
    const facingUp = (this.movementController?.facing.dy ?? 1) < 0;
    // Facing up: the item sits on the visible back, drawn in front of the hero → whole object.
    // Otherwise: it rides higher and behind the hero, so only the tip clears his shoulder.
    const offY = facingUp ? -0.12 : -0.34;
    this.backItem.setPosition(
      this.camera.screenCenterX - size * 0.14,
      this.camera.screenCenterY + size * offY,
    );
    const heroDepth = this.player?.depth ?? SCENE_DEPTHS.player;
    this.backItem.setDepth(facingUp ? heroDepth + 0.02 : heroDepth - 0.02);
  }

  // Hide the back item for the duration of a swing (reset the timer if the hero swings again),
  // then restore it via updateBackItem. positionBackItem no-ops while it's hidden.
  private hideBackItemDuringSwing(): void {
    if (!this.backItem) return;
    this.backItem.setVisible(false);
    this.backItemSwingTimer?.remove();
    this.backItemSwingTimer = this.time.delayedCall(SWING_HIDE_MS, () => {
      this.backItemSwingTimer = undefined;
      if (!this.itemGetOpen) this.updateBackItem(); // updateBackItem keeps it hidden if empty-handed
    });
  }

  // A felled tree leaves a stick behind: drop a `wood` pickup on the (now passable) stump tile.
  // `wood` is the flammable item, so the stick is exactly "an item you can use to make fire".
  private dropTreeStick(worldX: number, worldY: number): void {
    if (this.itemManager?.hasItemAt(worldX, worldY)) return; // never stack two on one tile
    this.itemManager?.drop('wood', worldX, worldY);
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

  private handleEnemyAttackPlayer(): void {
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
    this.player?.setTint(0xff4444);
    this.tweens.add({
      targets: this.player,
      alpha: 0.3,
      duration: 80,
      yoyo: true,
      repeat: 5,
      onComplete: () => { this.player?.setAlpha(1).clearTint(); },
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
    // Death cuts music and even the wind to nothing; out of that silence swells the low
    // "you died" cluster, and the hall swallows it back into silence.
    getSoundManager().stopMusic();
    getSoundManager().stopAmbience();
    getSoundManager().playPlayerDeath();
    this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
    // update() stops running FX once dead, so clean these up here.
    this.hideLowHealthOutlines();
    this.stopBreathing();

    const { width, height } = this.scale;
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    const D = SCENE_DEPTHS.toast;

    // 1. The whole world sinks into black, behind the hero.
    const black = this.add.rectangle(0, 0, width, height, 0x000000, 0).setOrigin(0).setDepth(D);
    this.tweens.add({ targets: black, fillAlpha: 1, duration: 1500, ease: 'Sine.easeIn' });

    // 2. Only the hero remains, dead-centre on the void — then it fades away, slowly.
    if (this.player) this.tweens.killTweensOf(this.player); // drop leftover hurt-blink
    this.player?.setPosition(cx, cy).setDepth(D + 1).setAlpha(1).clearTint();

    // The item slung on the hero's back fades out together with him — it dies with the hero.
    this.backItemSwingTimer?.remove();
    this.backItemSwingTimer = undefined;
    if (this.backItem?.visible) {
      this.tweens.killTweensOf(this.backItem);
      this.backItem.setDepth(D + 1);
      this.tweens.add({ targets: this.backItem, alpha: 0, duration: 3200, delay: 900, ease: 'Sine.easeIn' });
    }

    this.tweens.add({
      targets: this.player,
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

  // Position + texel size for the low-res light overlays, bled LIGHT_MARGIN texels past every
  // screen edge (see the constant) so the viewport sits strictly inside the filled interior.
  private lightOverlayGeom(width: number, height: number): { x: number; y: number; texW: number; texH: number } {
    return {
      x: -LIGHT_MARGIN * LIGHT_DOWNSCALE,
      y: -LIGHT_MARGIN * LIGHT_DOWNSCALE,
      texW: Math.ceil(width / LIGHT_DOWNSCALE) + LIGHT_MARGIN * 2,
      texH: Math.max(1, Math.ceil(height / LIGHT_DOWNSCALE)) + LIGHT_MARGIN * 2,
    };
  }

  private initLighting(): void {
    // Smooth radial gradient light stamp (white centre → transparent edge). It stays smooth;
    // the pixel-art chunkiness comes from the low-resolution darkness overlay below, not here.
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    // HARD, discrete rings (duplicate stops = no smooth blend). A stepped SNES-era "lantern"
    // with a few flat brightness tiers, not a soft PS5 glow. Combined with the low-res overlay
    // below this reads as chunky, banded pixel light.
    grad.addColorStop(0.00, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.66)');
    grad.addColorStop(0.68, 'rgba(255,255,255,0.66)');
    grad.addColorStop(0.68, 'rgba(255,255,255,0.33)');
    grad.addColorStop(0.88, 'rgba(255,255,255,0.33)');
    grad.addColorStop(0.88, 'rgba(255,255,255,0)');
    grad.addColorStop(1.00, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    if (this.textures.exists('_campfire_light')) this.textures.remove('_campfire_light');
    this.textures.addCanvas('_campfire_light', canvas);
    this.textures.get('_campfire_light').setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Warm firelight stamp — a smooth amber radial (hot core → transparent edge). Drawn ADDITIVELY
    // into warmOverlay so it warms + brightens the ground near a flame instead of merely undimming
    // it. Smooth here on purpose: the low-res overlay below turns it chunky like the rest of the
    // light. The colour is already amber, so it needs no tint when stamped.
    const warmCanvas = document.createElement('canvas');
    warmCanvas.width = size;
    warmCanvas.height = size;
    const wctx = warmCanvas.getContext('2d')!;
    const wgrad = wctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    wgrad.addColorStop(0.00, 'rgba(255,170,80,1)');
    wgrad.addColorStop(0.35, 'rgba(255,140,55,0.72)');
    wgrad.addColorStop(0.70, 'rgba(220,90,40,0.28)');
    wgrad.addColorStop(1.00, 'rgba(200,70,30,0)');
    wctx.fillStyle = wgrad;
    wctx.fillRect(0, 0, size, size);
    if (this.textures.exists('_warm_light')) this.textures.remove('_warm_light');
    this.textures.addCanvas('_warm_light', warmCanvas);
    this.textures.get('_warm_light').setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Fog-lift stamp — a SMOOTH, wide radial used to erase the distance-fog around a light. Unlike
    // the stepped lantern stamp above, this fades gradually (full clear at the core → no clear at
    // the rim) so the gloom creeps back in gently, not in hard rings, the farther you walk out.
    const fogCanvas = document.createElement('canvas');
    fogCanvas.width = size;
    fogCanvas.height = size;
    const fctx = fogCanvas.getContext('2d')!;
    const fgrad = fctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    fgrad.addColorStop(0.00, 'rgba(255,255,255,1)');
    fgrad.addColorStop(0.30, 'rgba(255,255,255,0.9)');
    fgrad.addColorStop(0.60, 'rgba(255,255,255,0.45)');
    fgrad.addColorStop(0.82, 'rgba(255,255,255,0.12)');
    fgrad.addColorStop(1.00, 'rgba(255,255,255,0)');
    fctx.fillStyle = fgrad;
    fctx.fillRect(0, 0, size, size);
    if (this.textures.exists('_fog_light')) this.textures.remove('_fog_light');
    this.textures.addCanvas('_fog_light', fogCanvas);
    this.textures.get('_fog_light').setFilter(Phaser.Textures.FilterMode.NEAREST);

    const { width, height } = this.scale;
    const g = this.lightOverlayGeom(width, height);

    // Darkness + light holes render into a LOW-RESOLUTION texture (1/LIGHT_DOWNSCALE) that is
    // scaled back up with NEAREST, so the whole light — body and edge — reads as chunky pixel
    // art. Every erase coordinate/radius in updateLighting is divided by LIGHT_DOWNSCALE.
    this.darknessOverlay = this.add
      .renderTexture(g.x, g.y, g.texW, g.texH)
      .setOrigin(0)
      .setScale(LIGHT_DOWNSCALE)
      .setDepth(SCENE_DEPTHS.lighting);
    this.darknessOverlay.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Warm firelight layer, one notch above the darkness so its amber pools sit on the already
    // dimmed ground. ADD blend: transparent everywhere except where a fire stamps its glow.
    this.warmOverlay = this.add
      .renderTexture(g.x, g.y, g.texW, g.texH)
      .setOrigin(0)
      .setScale(LIGHT_DOWNSCALE)
      .setDepth(SCENE_DEPTHS.lighting + 0.1)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.warmOverlay.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Distance fog — a deeper darkness stacked just above the base dim (below the warm layer). It
    // is full everywhere each frame, then every light erases a wide halo into it, so the dark grows
    // thicker the farther a tile is from any flame. Same low-res texture → chunky pixel fog.
    this.fogOverlay = this.add
      .renderTexture(g.x, g.y, g.texW, g.texH)
      .setOrigin(0)
      .setScale(LIGHT_DOWNSCALE)
      .setDepth(SCENE_DEPTHS.lighting + 0.05);
    this.fogOverlay.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

    // Off-display-list images used solely as the erase / warm-draw stamps
    this.lightCircleImg = this.make.image({ key: '_campfire_light', add: false });
    this.warmLightImg = this.make.image({ key: '_warm_light', add: false });
    this.fogLightImg = this.make.image({ key: '_fog_light', add: false });

    // Pool of cast-shadow silhouettes for the runtime props.
    this.castShadowPool = new CastShadowPool(this, SCENE_DEPTHS.castShadow);

    this.playerShadow = this.add
      .ellipse(0, 0, 1, 1, 0x000000, 0.3)
      .setDepth(SCENE_DEPTHS.decorBelowPlayer + 0.5)
      .setVisible(false);

    // Red low-health outline — one red-filled copy of the hero per offset direction, drawn just
    // behind the hero so only the border shows. Synced to the hero's frame/pose each tick.
    this.lowHealthOutlines.length = 0;
    for (let i = 0; i < OUTLINE_DIRS.length; i++) {
      this.lowHealthOutlines.push(
        this.add.sprite(0, 0, ASSET_KEYS.hero, HERO_FRAMES.idleDown).setVisible(false),
      );
    }
  }

  private updateLighting(delta: number): void {
    if (!this.darknessOverlay || !this.lightCircleImg) return;

    // Perlin-free flicker: random-walk on radius scale
    this.lightFlicker.velocity += (Math.random() - 0.5) * 0.018;
    this.lightFlicker.velocity *= 0.85;
    this.lightFlicker.radius = Phaser.Math.Clamp(
      this.lightFlicker.radius + this.lightFlicker.velocity * (delta / 16),
      0.80, 1.20,
    );

    const rt = this.darknessOverlay;
    rt.clear();
    rt.fill(0x06061a, 1);
    rt.setAlpha(0.45);

    if (!this.camera) return;

    const S = LIGHT_DOWNSCALE;
    const light = this.lightCircleImg;
    // Punch a light hole at screen (sx, sy) of the given screen radius. The overlay texture is
    // 1/S the screen size, so coordinates and sizes are divided by S before erasing.
    const eraseLight = (sx: number, sy: number, radius: number): void => {
      light.setDisplaySize((radius * 2) / S, (radius * 2) / S);
      rt.erase(light, sx / S + LIGHT_MARGIN, sy / S + LIGHT_MARGIN);
    };

    // Warm firelight layer: cleared each frame, then fire sources stamp an amber pool into it.
    const warm = this.warmOverlay;
    const warmImg = this.warmLightImg;
    warm?.clear();
    const drawWarm = (sx: number, sy: number, radius: number, intensity: number): void => {
      if (!warm || !warmImg || intensity <= 0) return;
      warmImg.setAlpha(intensity);
      warmImg.setDisplaySize((radius * 2) / S, (radius * 2) / S);
      warm.draw(warmImg, sx / S + LIGHT_MARGIN, sy / S + LIGHT_MARGIN);
    };

    // Distance fog: full deep dark each frame, then every light pushes it back in a wide halo. The
    // farther a tile is from any glow, the less the fog is lifted → the darker it stays (fog-in).
    const fog = this.fogOverlay;
    const fogImg = this.fogLightImg;
    if (fog) {
      fog.clear();
      fog.fill(FOG_COLOR, 1);
      fog.setAlpha(FOG_MAX_ALPHA);
    }
    // Clear the fog around a light: `strength` (0..1) scales the lift (for the blooming cut-scene
    // fire); `scale` widens the halo past the light's own glow so the lit pool sits inside clear air.
    const liftFog = (sx: number, sy: number, radius: number, strength = 1): void => {
      if (!fog || !fogImg || strength <= 0) return;
      fogImg.setAlpha(strength);
      const r = radius * FOG_LIFT_SCALE;
      fogImg.setDisplaySize((r * 2) / S, (r * 2) / S);
      fog.erase(fogImg, sx / S + LIGHT_MARGIN, sy / S + LIGHT_MARGIN);
    };

    // Campfire glow (flickers) — only lit fires punch a hole in the dark AND warm the ground.
    const cfRadius = this.tileSize * LIGHT_RADIUS_TILES * this.lightFlicker.radius;
    for (const cf of this.campfires) {
      if (!cf.isLit) continue;
      const cfScreen = this.camera.tileToScreen(cf.worldX, cf.worldY, this.tileSize);
      eraseLight(cfScreen.x, cfScreen.y, cfRadius);
      liftFog(cfScreen.x, cfScreen.y, cfRadius);
      drawWarm(cfScreen.x, cfScreen.y, cfRadius * WARM_POOL_SCALE, WARM_INTENSITY);
    }

    // First-campfire cut-scene: the fire isn't "lit" yet, so its glow blooms open slowly here,
    // scaled by the cut-scene progress (0..1).
    if (this.cutsceneFireLight) {
      const cl = this.cutsceneFireLight;
      const s = this.camera.tileToScreen(cl.worldX, cl.worldY, this.tileSize);
      const r = this.tileSize * LIGHT_RADIUS_TILES * cl.progress;
      eraseLight(s.x, s.y, r);
      liftFog(s.x, s.y, r, cl.progress);
      drawWarm(s.x, s.y, r * WARM_POOL_SCALE, WARM_INTENSITY * cl.progress);
    }

    // Hero ambient glow — pinned at screen centre. Fades out during the campfire cut-scene
    // (cutsceneHeroLight → 0) so the blooming fire is the only light on screen.
    const bodyRadius = this.tileSize * LIGHT_RADIUS_TILES;
    if (this.cutsceneHeroLight > 0.001) {
      eraseLight(this.camera.screenCenterX, this.camera.screenCenterY, bodyRadius * this.cutsceneHeroLight);
      liftFog(this.camera.screenCenterX, this.camera.screenCenterY, bodyRadius, this.cutsceneHeroLight);
    }

    // NPCs carry the same glow. Undead carry NO light: they are creatures of the dark and
    // only become visible when they step into someone else's glow.
    for (const pos of this.npcManager?.getActiveWorldPositions() ?? []) {
      const s = this.camera.tileToScreen(pos.worldX, pos.worldY, this.tileSize);
      eraseLight(s.x, s.y, bodyRadius);
      liftFog(s.x, s.y, bodyRadius);
    }

    // Coins — a smaller hole.
    const coinRadius = this.tileSize * 1.8;
    for (const pos of this.coinManager?.getActiveWorldPositions() ?? []) {
      const s = this.camera.tileToScreen(pos.worldX, pos.worldY, this.tileSize);
      eraseLight(s.x, s.y, coinRadius);
    }

    // Lava glows: each tile punches a small warm hole (molten rock is its own light) and, being
    // molten, casts an even hotter amber pool than a campfire.
    const lavaRadius = this.tileSize * 1.5;
    for (const lv of this.lavaTiles) {
      const s = this.camera.tileToScreen(lv.worldX, lv.worldY, this.tileSize);
      eraseLight(s.x, s.y, lavaRadius);
      liftFog(s.x, s.y, lavaRadius);
      drawWarm(s.x, s.y, lavaRadius * 1.15, WARM_INTENSITY);
    }
  }

  private updatePlayerShadow(): void {
    if (!this.playerShadow || !this.camera) return;
    const cx = this.camera.screenCenterX;
    const cy = this.camera.screenCenterY;
    this.playerShadow
      .setVisible(!this.isDead)
      .setPosition(cx, cy + Math.round(this.tileSize * 0.34))
      .setDisplaySize(this.tileSize * 0.6, this.tileSize * 0.26);
  }

  // Low-health heartbeat: on the last hearts, pulse a red PIXEL OUTLINE around the hero — never
  // tinting the sprite itself, just a border that throbs, faster/stronger the closer to death.
  private updateLowHealthFx(delta: number): void {
    const low = !this.isDead && this.playerHealth > 0 && this.playerHealth <= LOW_HEALTH_HEARTS;
    const player = this.player;
    if (!low || !player) {
      this.hideLowHealthOutlines();
      if (!low) this.heartbeatPhase = 0;
      return;
    }

    // One heart left beats faster/harder than two.
    const critical = this.playerHealth <= 1;
    const rate = critical ? 0.010 : 0.006; // radians per ms
    const intensity = critical ? 0.95 : 0.62;
    this.heartbeatPhase += delta * rate;
    // Sharpen the sine into a "thump": calm baseline with a quick red spike.
    const beat = Math.pow((Math.sin(this.heartbeatPhase) + 1) / 2, 3) * intensity;

    const w = Math.max(2, Math.round(this.tileSize * 0.08)); // outline thickness (screen px)
    const alpha = Math.min(1, 0.2 + beat); // always faintly present, spiking on the beat
    const frameName = player.frame.name;
    const key = player.texture.key;
    const depth = player.depth - 0.01; // just behind the hero, so only the border shows
    for (let i = 0; i < this.lowHealthOutlines.length; i++) {
      const [dx, dy] = OUTLINE_DIRS[i];
      this.lowHealthOutlines[i]
        .setTexture(key, frameName)
        .setFlipX(player.flipX)
        .setOrigin(player.originX, player.originY)
        .setScale(player.scaleX, player.scaleY)
        .setPosition(player.x + dx * w, player.y + dy * w)
        .setDepth(depth)
        .setTintFill(0xff2a2a) // solid red silhouette
        .setAlpha(alpha)
        .setVisible(true);
    }
  }

  private hideLowHealthOutlines(): void {
    for (const o of this.lowHealthOutlines) o.setVisible(false);
  }

  private startBreathing(): void {
    if (!this.player || this.breathingTween?.isPlaying()) return;
    this.breathingTween?.destroy();
    // Save center-origin Y, then pivot to bottom so scale only grows upward
    this.breathingBaseY = this.player.y;
    this.player.setOrigin(0.5, 1.0);
    this.player.y = this.breathingBaseY + this.tileSize * 0.5;
    const sx = this.player.scaleX;
    const sy = this.player.scaleY;
    this.breathingTween = this.tweens.add({
      targets: this.player,
      scaleY: sy * 1.045,
      scaleX: sx * 0.972,
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
    // Restore center origin and reset scale/position
    this.player?.setOrigin(0.5, 0.5);
    this.player?.setDisplaySize(this.tileSize, this.tileSize);
    if (this.player) this.player.y = this.breathingBaseY;
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

  private createAnimations(): void {
    if (this.anims.exists(ANIMATION_KEYS.heroWalk)) return;
    this.anims.create({
      key: ANIMATION_KEYS.heroWalk,
      frames: this.anims.generateFrameNumbers(ASSET_KEYS.hero, {
        start: HERO_FRAMES.walkStart,
        end: HERO_FRAMES.walkEnd,
      }),
      frameRate: TIMINGS.walkFrameRate,
      repeat: -1,
    });
  }
}
