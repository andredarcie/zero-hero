import Phaser from 'phaser';

import {
  ANIMATION_KEYS,
  ASSET_KEYS,
  CAMPFIRE_SAFE_RADIUS_TILES,
  CHUNK_COLUMNS,
  CHUNK_ROWS,
  FONT_FAMILY,
  GAMEPLAY_HERO_MAX_SIZE,
  GAMEPLAY_HERO_SCALE,
  HERO_FRAMES,
  HUD_HEALTH_MAX,
  ITEM_FRAMES,
  KEY_FRAMES,
  HUD_RESERVED_ROWS,
  LIGHT_RADIUS_TILES,
  MIN_BOARD_TILE_SIZE,
  SCENE_DEPTHS,
  TEXT_RESOLUTION,
  TIMINGS,
  ySortDepth,
} from '@/game/constants';
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
import { LockedDoorObject } from '@/game/objects/LockedDoorObject';
import { DialogOverlay } from '@/game/runtime/DialogOverlay';
import { ItemGetOverlay, type ItemGetConfig } from '@/game/runtime/ItemGetOverlay';
import { ShopOverlay, type UpgradeState, getUpgradeCost, UPGRADES_CFG } from '@/game/runtime/ShopOverlay';
import { GameBoardRenderer } from '@/game/runtime/GameBoardRenderer';
import { MinimapRenderer } from '@/game/runtime/MinimapRenderer';
import { PlayerMovementController } from '@/game/runtime/PlayerMovementController';
import { animateGrassRustle } from '@/game/runtime/RuntimeEffects';
import { WorldCamera } from '@/game/runtime/WorldCamera';
import { getSoundManager } from '@/game/audio/SoundManager';
import { createBoardMetrics, type BoardMetrics } from '@/game/shared/grid';
import { ChunkManager } from '@/game/world/ChunkManager';
import type { ScreenContent } from '@/game/world/ScreenContent';
import {
  getCampfires,
  getChunkContent,
  getDryBushes,
  getHeldItemPickups,
  getLockedDoors,
  getDialog,
  getDialogKinds,
  getDialogVoice,
  getPlayerStart,
} from '@/game/world/WorldData';

// The darkness/light overlay renders into a texture this many times smaller than the screen,
// then scales back up with NEAREST — so every light circle is made of chunky pixel blocks
// (matching the game's pixel-art scale) instead of a smooth high-res gradient. Higher = chunkier.
const LIGHT_DOWNSCALE = 6;

// How each held item shows in the HUD slot / flies in (the on-fire sword swaps its own way).
const HUD_ITEM_VISUAL: Record<HeldItemKind, { texture: string; frame: number }> = {
  sword: { texture: ASSET_KEYS.swordItemIcon, frame: 0 },
  key: { texture: ASSET_KEYS.keyItem, frame: KEY_FRAMES.held },
};

// The raised sprite + caption for each item's first-time "item get" ceremony.
const ITEM_GET_CFG: Record<HeldItemKind, ItemGetConfig> = {
  sword: { texture: ASSET_KEYS.swordItem, frame: ITEM_FRAMES.swordIdle, label: 'VOCE PEGOU A ESPADA!' },
  key: { texture: ASSET_KEYS.keyItem, frame: KEY_FRAMES.held, label: 'VOCE PEGOU A CHAVE!' },
};

export class GameScene extends Phaser.Scene {
  public static readonly key = 'game';

  private camera?: WorldCamera;
  private chunkManager?: ChunkManager;
  private enemyManager?: EnemyManager;
  private spawnDirector?: UndeadSpawnDirector;
  private playerSafe = true;
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
  private swordOnFire = false;
  private campfires: CampfireObject[] = [];
  private dryBushes: DryBushObject[] = [];
  private lockedDoors: LockedDoorObject[] = [];
  private boardRenderer?: GameBoardRenderer;
  private minimapRenderer?: MinimapRenderer;
  private player?: Phaser.GameObjects.Sprite;
  private movementController?: PlayerMovementController;
  private playerWorld = { worldX: 0, worldY: 0 };
  private playerMaxHealth = HUD_HEALTH_MAX;
  private playerHealth = HUD_HEALTH_MAX;
  private playerInvincible = false;
  private invincibleTimer = 0;
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
  private itemGetOverlay?: ItemGetOverlay;
  private shopButton?: Phaser.GameObjects.Text;
  private eKey?: Phaser.Input.Keyboard.Key;
  private upgrades: UpgradeState = { maxHealth: 0, swordSpeed: 0, moveSpeed: 0, magnet: 0 };
  // Center chunk of the streamed window; NaN forces the first stream.
  private streamCenter = { cx: NaN, cy: NaN };
  private debugApi?: GameDebugApi;

  // Lighting
  private darknessOverlay?: Phaser.GameObjects.RenderTexture;
  private lightCircleImg?: Phaser.GameObjects.Image;
  private playerShadow?: Phaser.GameObjects.Ellipse;
  private readonly lightFlicker = { radius: 1.0, velocity: 0 };

  // Footprints (world-anchored so they scroll with the ground)
  private footprintStep = false;
  private readonly footprints: Array<{ obj: Phaser.GameObjects.Ellipse; worldX: number; worldY: number; offX: number; offY: number }> = [];

  // Breathing idle
  private breathingTween?: Phaser.Tweens.Tween;
  private lastStepTime = 0;
  private breathingBaseY = 0;

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

    // Decode the chiptune SFX + music, and start the looping background track.
    getSoundManager().preload();
    getSoundManager().startMusic();

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
    this.npcManager = new NpcManager(this, getContent);
    this.coinManager = new CoinManager(this);
    this.heartPickupManager = new HeartPickupManager(this, getContent);
    this.itemManager = new ItemManager(this);
    this.itemManager.loadAuthored(getHeldItemPickups());
    this.heldItem = 'none';
    this.seenItems.clear();
    this.swordOnFire = false;
    // One reusable swing animator, alive for the whole scene: the sword uses it to attack,
    // the key uses it to strike a door (SwordSlash.slash accepts a custom item sprite).
    this.swordSlash = new SwordSlash(this);
    this.camera = new WorldCamera(startWorldX, startWorldY, 0, 0);
    this.boardRenderer = new GameBoardRenderer(this);
    this.minimapRenderer = new MinimapRenderer(this);

    this.player = this.add
      .sprite(0, 0, ASSET_KEYS.hero, HERO_FRAMES.idleDown)
      .setOrigin(0.5)
      .setDepth(SCENE_DEPTHS.player);

    this.createAnimations();

    this.movementController = new PlayerMovementController(
      this,
      this.player,
      this.camera,
      (wx, wy) => {
        // The hero also stops on enemies (to attack them); everything else that blocks is
        // shared with enemies via isSolidForEntities.
        if (this.enemyManager?.getEnemyAt(wx, wy)) return true;
        return this.isSolidForEntities(wx, wy);
      },
      (wx, wy) => animateGrassRustle(this, this.boardRenderer?.getGrassSprite(wx, wy), this.tileSize),
      (wx, wy) => this.handlePlayerBump(wx, wy),
    );

    this.eKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    this.shopButton = this.add.text(0, 0, '[ LOJA ]', {
      fontFamily: FONT_FAMILY, fontSize: '10px', color: '#9977bb', resolution: TEXT_RESOLUTION,
    })
      .setDepth(SCENE_DEPTHS.uiLabel)
      .setVisible(false)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => { this.shopButton?.setColor('#cc99ff'); })
      .on('pointerout',  () => { this.shopButton?.setColor('#9977bb'); })
      .on('pointerdown', () => { this.toggleShop(); });

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.handleResize({ width: this.scale.width, height: this.scale.height });

    // Campfires, dry bushes and locked doors are authored props in world.json.
    this.campfires = getCampfires().map((c) => new CampfireObject(this, c.worldX, c.worldY));
    this.dryBushes = getDryBushes().map((b) => new DryBushObject(this, b.worldX, b.worldY));
    this.lockedDoors = getLockedDoors().map((d) => new LockedDoorObject(this, d.worldX, d.worldY));

    this.initLighting();
    this.streamChunks(true);

    this.registerDebugApi();

    // Live playtest launched from the world editor: ESC stops the run and wakes the
    // sleeping EditorScene, with the in-memory (possibly unsaved) world still loaded.
    if (this.registry.get('appMode') === 'editor') this.enableEditorReturn();
  }

  private enableEditorReturn(): void {
    this.add.text(this.scale.width - 8, 8, '[ESC] voltar ao editor', {
      fontFamily: FONT_FAMILY,
      fontSize: '10px',
      color: '#f4a261',
      stroke: '#000000',
      strokeThickness: 3,
      resolution: TEXT_RESOLUTION,
    }).setOrigin(1, 0).setDepth(SCENE_DEPTHS.toast);

    this.input.keyboard?.on('keydown-ESC', () => {
      getSoundManager().stopMusic();
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
        swordOnFire: this.swordOnFire,
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
    this.shopOverlay?.destroy();
    this.breathingTween?.destroy();
    this.breathingTween = undefined;
    this.footprints.length = 0;
    this.lightCircleImg?.destroy();
    this.darknessOverlay?.destroy();
    this.playerShadow?.destroy();
    if (this.textures.exists('_campfire_light')) this.textures.remove('_campfire_light');
    this.swordSlash = undefined;
    this.campfires = [];
    this.dryBushes = [];
    this.lockedDoors = [];
    this.lightCircleImg = undefined;
    this.darknessOverlay = undefined;
    this.playerShadow = undefined;
  }

  public update(_time: number, delta: number): void {
    // The camera pan (open or close) drives its own reprojection from the tween, so keep the
    // world frozen here until it finishes — otherwise gameplay would fight the pan.
    if (this.dialogOpen || this.camShifting) {
      this.dialogOverlay?.update();
      return;
    }

    // Item-get presentation freezes gameplay; only its own tweens keep running.
    if (this.itemGetOpen) return;

    if (this.eKey && Phaser.Input.Keyboard.JustDown(this.eKey)) this.toggleShop();

    if (this.camera) {
      this.updateLighting(delta);
      this.updatePlayerShadow();
    }

    if (this.isDead || this.shopOpen || !this.movementController || !this.boardRenderer || !this.chunkManager || !this.camera) {
      return;
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
    } else if (this.time.now - this.lastStepTime > 180) {
      this.startBreathing();
    }
    this.streamChunks();
    this.boardRenderer.updateWorld(this.camera, this.chunkManager, this.tileSize);
    this.updateFootprints();

    const isPickupOccupied = (x: number, y: number): boolean =>
      (this.heartPickupManager?.hasPickupAt(x, y) ?? false) ||
      (this.itemManager?.hasItemAt(x, y) ?? false);

    const isItemOccupied = (x: number, y: number): boolean =>
      isPickupOccupied(x, y) || (this.enemyManager?.getEnemyAt(x, y) !== null);

    // Safety: near a campfire the hero is untouchable (undead never step into firelight and
    // nothing spawns); in the dark the spawn director ramps the siege up over time.
    const distToFire = this.distToNearestCampfireTiles(this.playerWorld.worldX, this.playerWorld.worldY);
    this.playerSafe = distToFire <= CAMPFIRE_SAFE_RADIUS_TILES;
    this.boardRenderer.setSafety(this.playerSafe);

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
    }

    if (this.coinManager && this.camera) {
      const hudCoin = this.boardRenderer?.getHudCoinAnchor() ?? { x: 0, y: 0 };
      this.coinManager.update(
        this.playerWorld.worldX,
        this.playerWorld.worldY,
        hudCoin,
        (total) => { getSoundManager().playCoinPickup(); this.boardRenderer?.setCoinCount(total, this); },
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
          this.boardRenderer?.setHealth(this.playerHealth);
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

    if (this.npcManager && this.camera) this.npcManager.render(this.tileSize, this.camera);
    for (const cf of this.campfires) cf.render(this.tileSize, this.camera);
    for (const b of this.dryBushes) b.render(this.tileSize, this.camera);
    for (const d of this.lockedDoors) d.render(this.tileSize, this.camera);

    this.minimapRenderer?.update(this.playerWorld.worldX, this.playerWorld.worldY, this.chunkManager);
  }

  private handleResize(gameSize: Phaser.Structs.Size | { width: number; height: number }): void {
    const { width, height } = gameSize;
    this.cameras.main.setViewport(0, 0, width, height);

    this.tileSize = this.computeTileSize(width, height);

    const reservedTopHeight = this.tileSize * HUD_RESERVED_ROWS;
    const screenCenterX = Math.floor(width / 2);
    const screenCenterY = Math.floor(reservedTopHeight + (height - reservedTopHeight) / 2);

    if (this.camera) {
      this.camera.screenCenterX = screenCenterX;
      this.camera.screenCenterY = screenCenterY;
      // Visible tile counts around the centered hero (used for the streaming window).
      this.camera.viewportColumns = Math.ceil(width / this.tileSize);
      this.camera.viewportRows = Math.ceil((height - reservedTopHeight) / this.tileSize);
      // A resize mid-dialog would recentre the hero under the panel; re-apply the pan offset.
      if (this.dialogOpen) {
        const t = this.dialogScreenCenter(this.dialogNpcWorld);
        this.camera.screenCenterX = t.x;
        this.camera.screenCenterY = t.y;
      }
    }

    const hudMetrics = this.buildHudMetrics(width, height, this.tileSize);
    this.boardRenderer?.render(hudMetrics);
    this.minimapRenderer?.layout(this.boardRenderer?.getHudMapBounds() ?? { x: 0, y: 0, width: 0, height: 0 });

    this.player?.setDisplaySize(this.tileSize, this.tileSize);
    this.movementController?.syncPlayerToWorld(this.playerWorld.worldX, this.playerWorld.worldY, this.tileSize);
    this.shopButton?.setPosition(width / 2, Math.floor(this.tileSize * 0.5)).setOrigin(0.5);

    if (this.darknessOverlay) {
      const hudH = this.tileSize * HUD_RESERVED_ROWS;
      this.darknessOverlay
        .setPosition(0, hudH)
        .setScale(LIGHT_DOWNSCALE)
        .resize(Math.ceil(width / LIGHT_DOWNSCALE), Math.max(1, Math.ceil((height - hudH) / LIGHT_DOWNSCALE)));
      this.darknessOverlay.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }

  private computeTileSize(width: number, height: number): number {
    const metrics = createBoardMetrics(width, height, {
      columns: CHUNK_COLUMNS,
      rows: CHUNK_ROWS,
      minTileSize: MIN_BOARD_TILE_SIZE,
      characterScale: GAMEPLAY_HERO_SCALE,
      maxCharacterSize: GAMEPLAY_HERO_MAX_SIZE,
      reservedTopRows: HUD_RESERVED_ROWS,
    });
    return metrics.tileSize;
  }

  private buildHudMetrics(width: number, height: number, tileSize: number): BoardMetrics {
    const reservedTopHeight = tileSize * HUD_RESERVED_ROWS;
    return {
      columns: CHUNK_COLUMNS,
      rows: CHUNK_ROWS,
      tileSize,
      offsetX: 0,
      offsetY: reservedTopHeight,
      width,
      height: height - reservedTopHeight,
      characterSize: tileSize,
    };
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

  /**
   * Everything a walking entity (hero or enemy) cannot step onto: authored terrain collision
   * and trees (via ChunkManager.isCellBlocked), campfires, standing dry bushes, and NPCs.
   * The hero adds enemies on top (to attack them); enemies add a chunk-border margin.
   */
  private isSolidForEntities(wx: number, wy: number): boolean {
    if (this.chunkManager?.isCellBlocked(wx, wy)) return true;
    if (this.getCampfireAt(wx, wy)) return true;
    if (this.getDryBushAt(wx, wy)?.blocking) return true;
    if (this.getLockedDoorAt(wx, wy)?.blocking) return true;
    if (this.npcManager?.hasNpcAt(wx, wy)) return true;
    return false;
  }

  private distToNearestCampfireTiles(wx: number, wy: number): number {
    let best = Infinity;
    for (const cf of this.campfires) {
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
      if (kind) this.openNpcDialog(kind, { worldX: wx, worldY: wy });
      return;
    }

    // Campfire interaction — swing sword, then ignite
    const campfire = this.getCampfireAt(wx, wy);
    if (campfire) {
      campfire.onHit();
      if (this.swordEquipped && this.swordSlash && this.camera) {
        getSoundManager().playSwordSlash();
        const dx = wx - this.playerWorld.worldX;
        const dy = wy - this.playerWorld.worldY;
        const screen = this.camera.tileToScreen(this.playerWorld.worldX, this.playerWorld.worldY, this.tileSize);
        this.swordSlash.slash(screen.x, screen.y, dx, dy, this.tileSize);
        if (!this.swordOnFire) {
          // Ignite at the moment the blade reaches the campfire (end of main swing arc)
          this.time.delayedCall(150, () => { this.igniteSword(); });
        }
      }
      this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
      return;
    }

    // Dry bush — the flaming sword sets it alight; it chars to ash and opens the tile.
    const bush = this.getDryBushAt(wx, wy);
    if (bush?.blocking) {
      bush.shake();
      if (this.swordEquipped && this.swordSlash && this.camera) {
        getSoundManager().playSwordSlash();
        const dx = wx - this.playerWorld.worldX;
        const dy = wy - this.playerWorld.worldY;
        const screen = this.camera.tileToScreen(this.playerWorld.worldX, this.playerWorld.worldY, this.tileSize);
        this.swordSlash.slash(screen.x, screen.y, dx, dy, this.tileSize);
        if (this.swordOnFire) {
          // Ignite when the blade reaches the bush (end of the main swing arc).
          this.time.delayedCall(150, () => {
            if (bush.ignite()) this.spawnFireHitEffect(wx, wy);
          });
        }
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
        // swing lands (same timing the flaming sword uses to ignite a bush).
        door.shake();
        if (this.swordSlash && this.camera) {
          getSoundManager().playSwordSlash();
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
      }
      this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
      return;
    }

    const enemy = this.enemyManager?.getEnemyAt(wx, wy);
    if (!enemy) return;

    // No sword, no fight — the hero can't hurt enemies until the blade is found.
    if (!this.swordEquipped) return;

    const hits = 1 + this.upgrades.swordSpeed;
    for (let i = 0; i < hits; i++) enemy.takeDamage();

    if (this.swordEquipped && this.swordSlash && this.camera) {
      getSoundManager().playSwordSlash();
      const dx = wx - this.playerWorld.worldX;
      const dy = wy - this.playerWorld.worldY;
      const screen = this.camera.tileToScreen(this.playerWorld.worldX, this.playerWorld.worldY, this.tileSize);
      this.swordSlash.slash(screen.x, screen.y, dx, dy, this.tileSize);
      enemy.triggerKnockback(dx, dy, this.tileSize);
      if (this.swordOnFire && enemy.isAlive) this.spawnFireHitEffect(wx, wy);
    }

    getSoundManager().playEnemyHit();
    this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
    this.player?.setTint(0xffff00);
    this.time.delayedCall(120, () => { this.player?.clearTint(); });

    if (!enemy.isAlive && this.chunkManager) {
      getSoundManager().playEnemyDeath();
      this.coinManager?.spawnCoins(enemy.worldX, enemy.worldY, this.chunkManager);
    }
  }

  private igniteSword(): void {
    getSoundManager().playIgnite();
    this.swordOnFire = true;
    this.swordSlash?.setOnFire(true);
    this.boardRenderer?.setHudSwordOnFire(true);
    // Orange flash on the player as the fire transfers
    this.player?.setTint(0xff6600);
    this.time.delayedCall(250, () => { this.player?.clearTint(); });
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
    }, getDialogVoice(kind));
  }

  // ── Dialog camera pan ──────────────────────────────────────────────────────
  // Base screen anchor during normal play: hero centered horizontally, mid play-area.
  private baseScreenCenter(): { x: number; y: number } {
    const { width, height } = this.scale;
    const reservedTopHeight = this.tileSize * HUD_RESERVED_ROWS;
    return {
      x: Math.floor(width / 2),
      y: Math.floor(reservedTopHeight + (height - reservedTopHeight) / 2),
    };
  }

  // Screen anchor while a dialog is open: put the hero↔NPC midpoint at the center of the
  // left half (the dialog panel covers the right half). camX stays on the hero, so shifting
  // only screenCenterX/Y keeps the hero's sprite pinned correctly to the ground it stands on.
  private dialogScreenCenter(npcWorld?: { worldX: number; worldY: number }): { x: number; y: number } {
    const base = this.baseScreenCenter();
    const leftHalfCenterX = Math.floor(this.scale.width * 0.25);
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
    this.boardRenderer.updateWorld(this.camera, this.chunkManager, this.tileSize);
    this.updateFootprints();
    this.enemyManager?.render(this.tileSize, this.camera);
    this.coinManager?.render(this.tileSize, this.camera);
    this.heartPickupManager?.render(this.tileSize, this.camera);
    this.itemManager?.render(this.tileSize, this.camera);
    this.npcManager?.render(this.tileSize, this.camera);
    for (const cf of this.campfires) cf.render(this.tileSize, this.camera);
    for (const b of this.dryBushes) b.render(this.tileSize, this.camera);
    for (const d of this.lockedDoors) d.render(this.tileSize, this.camera);
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
      this.boardRenderer?.setMaxHearts(this.playerMaxHealth);
      this.boardRenderer?.setHealth(this.playerHealth);
    } else if (id === 'moveSpeed') {
      this.movementController?.setMoveDuration(Math.max(60, 140 - this.upgrades.moveSpeed * 20));
    } else if (id === 'magnet') {
      this.coinManager?.setMagnetRadius(2);
    }

    this.boardRenderer?.setCoinCount(this.coinManager?.coinTotal ?? 0, this);
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
    this.swordOnFire = false;
    this.swordSlash?.setOnFire(false);
    this.boardRenderer?.setHudSwordOnFire(false);
    this.boardRenderer?.setHudItemTexture(null); // stays empty until the item flies in

    getSoundManager().playSwordPickup();

    if (this.seenItems.has(item.kind)) {
      this.flyItemToHud(item.kind);
    } else {
      this.seenItems.add(item.kind);
      this.showItemGet(item.kind, () => this.flyItemToHud(item.kind));
    }
  }

  // Fly the collected item from the hero up into the HUD slot, then show it there.
  private flyItemToHud(kind: HeldItemKind): void {
    const anchor = this.boardRenderer?.getHudItemAnchor();
    const visual = HUD_ITEM_VISUAL[kind];
    if (!anchor || !this.camera) {
      this.boardRenderer?.setHudItemTexture(visual.texture, visual.frame);
      return;
    }
    const startSize = Math.max(anchor.size, Math.floor(this.tileSize * 0.8));
    const flyer = this.add
      .sprite(this.camera.screenCenterX, this.camera.screenCenterY, visual.texture, visual.frame)
      .setDepth(SCENE_DEPTHS.toast + 6)
      .setDisplaySize(startSize, startSize);
    this.tweens.add({
      targets: flyer,
      x: anchor.x,
      y: anchor.y,
      displayWidth: anchor.size,
      displayHeight: anchor.size,
      duration: 380,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        flyer.destroy();
        this.boardRenderer?.setHudItemTexture(visual.texture, visual.frame);
      },
    });
  }

  // Zelda-style "item get" beat: freeze the game, spotlight the hero, raise the item.
  private showItemGet(kind: HeldItemKind, afterClose: () => void): void {
    if (this.itemGetOpen) { afterClose(); return; }
    this.itemGetOpen = true;
    getSoundManager().fadeMusicOut();
    this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
    this.itemGetOverlay = new ItemGetOverlay(this, ITEM_GET_CFG[kind], () => {
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
    this.boardRenderer?.setHealth(this.playerHealth);
    getSoundManager().playPlayerHurt();

    if (this.playerHealth <= 0) {
      this.triggerDeath();
      return;
    }

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

  private triggerDeath(): void {
    if (this.isDead) return;
    this.isDead = true;
    getSoundManager().playPlayerDeath();
    this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);

    const { width, height } = this.scale;

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0)
      .setOrigin(0)
      .setDepth(SCENE_DEPTHS.toast);

    const label = this.add.text(width / 2, height / 2, 'YOU DIED', {
      fontFamily: FONT_FAMILY,
      fontSize: `${Math.floor(this.tileSize * 1.1)}px`,
      color: '#cc2222',
      stroke: '#000000',
      strokeThickness: 4,
      resolution: TEXT_RESOLUTION,
    })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(SCENE_DEPTHS.toast + 1);

    const sub = this.add.text(width / 2, height / 2 + Math.floor(this.tileSize * 1.8), 'respawning...', {
      fontFamily: FONT_FAMILY,
      fontSize: `${Math.floor(this.tileSize * 0.55)}px`,
      color: '#aaaaaa',
      resolution: TEXT_RESOLUTION,
    })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(SCENE_DEPTHS.toast + 1);

    this.tweens.add({
      targets: overlay,
      fillAlpha: 0.75,
      duration: 600,
      ease: 'Power2',
    });

    this.tweens.add({
      targets: [label, sub],
      alpha: 1,
      duration: 600,
      delay: 200,
      ease: 'Power2',
    });

    // Restart handling is independent of the tween above, so a stalled/dropped tween can
    // never leave the player stuck on the "YOU DIED" screen.
    let restarting = false;
    const doRestart = (): void => {
      if (restarting) return;
      restarting = true;
      this.scene.restart();
    };

    // Auto-restart, and after a short grace period let the player skip with any key / tap.
    const autoTimer = this.time.delayedCall(1600, doRestart);
    this.time.delayedCall(700, () => {
      const skip = (): void => { autoTimer.remove(); doRestart(); };
      this.input.once(Phaser.Input.Events.POINTER_DOWN, skip);
      this.input.keyboard?.once('keydown', skip);
    });
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

    const { width, height } = this.scale;
    const hudH = this.tileSize * HUD_RESERVED_ROWS;

    // Darkness + light holes render into a LOW-RESOLUTION texture (1/LIGHT_DOWNSCALE) that is
    // scaled back up with NEAREST, so the whole light — body and edge — reads as chunky pixel
    // art. Every erase coordinate/radius in updateLighting is divided by LIGHT_DOWNSCALE.
    this.darknessOverlay = this.add
      .renderTexture(0, hudH, Math.ceil(width / LIGHT_DOWNSCALE), Math.max(1, Math.ceil((height - hudH) / LIGHT_DOWNSCALE)))
      .setOrigin(0)
      .setScale(LIGHT_DOWNSCALE)
      .setDepth(SCENE_DEPTHS.lighting);
    this.darknessOverlay.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);


    // Off-display-list image used solely as the erase stamp
    this.lightCircleImg = this.make.image({ key: '_campfire_light', add: false });

    this.playerShadow = this.add
      .ellipse(0, 0, 1, 1, 0x000000, 0.3)
      .setDepth(SCENE_DEPTHS.decorBelowPlayer + 0.5)
      .setVisible(false);
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
    const hudH = this.tileSize * HUD_RESERVED_ROWS;
    const light = this.lightCircleImg;
    // Punch a light hole at screen (sx, sy) of the given screen radius. The overlay texture is
    // 1/S the screen size, so coordinates and sizes are divided by S before erasing.
    const eraseLight = (sx: number, sy: number, radius: number): void => {
      light.setDisplaySize((radius * 2) / S, (radius * 2) / S);
      rt.erase(light, sx / S, (sy - hudH) / S);
    };

    // Campfire glow (flickers)
    const cfRadius = this.tileSize * LIGHT_RADIUS_TILES * this.lightFlicker.radius;
    for (const cf of this.campfires) {
      const cfScreen = this.camera.tileToScreen(cf.worldX, cf.worldY, this.tileSize);
      eraseLight(cfScreen.x, cfScreen.y, cfRadius);
    }

    // Hero ambient glow — pinned at screen centre.
    const bodyRadius = this.tileSize * LIGHT_RADIUS_TILES;
    eraseLight(this.camera.screenCenterX, this.camera.screenCenterY, bodyRadius);

    // NPCs carry the same glow. Undead carry NO light: they are creatures of the dark and
    // only become visible when they step into someone else's glow.
    for (const pos of this.npcManager?.getActiveWorldPositions() ?? []) {
      const s = this.camera.tileToScreen(pos.worldX, pos.worldY, this.tileSize);
      eraseLight(s.x, s.y, bodyRadius);
    }

    // Coins — a smaller hole.
    const coinRadius = this.tileSize * 1.8;
    for (const pos of this.coinManager?.getActiveWorldPositions() ?? []) {
      const s = this.camera.tileToScreen(pos.worldX, pos.worldY, this.tileSize);
      eraseLight(s.x, s.y, coinRadius);
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
