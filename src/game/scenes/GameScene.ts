import Phaser from 'phaser';

import {
  ANIMATION_KEYS,
  ASSET_KEYS,
  CHUNK_COLUMNS,
  CHUNK_ROWS,
  FONT_FAMILY,
  GAMEPLAY_HERO_MAX_SIZE,
  GAMEPLAY_HERO_SCALE,
  HERO_FRAMES,
  HUD_HEALTH_MAX,
  HUD_RESERVED_ROWS,
  MIN_BOARD_TILE_SIZE,
  SCENE_DEPTHS,
  TIMINGS,
} from '@/game/constants';
import { CoinManager } from '@/game/entities/CoinManager';
import { EnemyManager } from '@/game/entities/EnemyManager';
import { HeartPickupManager } from '@/game/entities/HeartPickupManager';
import { SwordPickupManager } from '@/game/entities/SwordPickupManager';
import { SwordSlash } from '@/game/runtime/SwordOrbit';
import { CampfireObject } from '@/game/objects/CampfireObject';
import { ShopOverlay, type UpgradeState, getUpgradeCost, UPGRADES_CFG } from '@/game/runtime/ShopOverlay';
import { GameBoardRenderer } from '@/game/runtime/GameBoardRenderer';
import { MinimapRenderer } from '@/game/runtime/MinimapRenderer';
import { PlayerMovementController } from '@/game/runtime/PlayerMovementController';
import { animateGrassRustle } from '@/game/runtime/RuntimeEffects';
import { WorldCamera } from '@/game/runtime/WorldCamera';
import { createBoardMetrics, type BoardMetrics } from '@/game/shared/grid';
import { ChunkManager } from '@/game/world/ChunkManager';
import { buildScreenContentMap, type ScreenContent } from '@/game/world/ScreenContent';
import { START_SCREEN_PLAYER_X, START_SCREEN_PLAYER_Y } from '@/game/world/WorldGenerator';

export class GameScene extends Phaser.Scene {
  public static readonly key = 'game';

  private camera?: WorldCamera;
  private chunkManager?: ChunkManager;
  private enemyManager?: EnemyManager;
  private coinManager?: CoinManager;
  private heartPickupManager?: HeartPickupManager;
  private swordPickupManager?: SwordPickupManager;
  private swordSlash?: SwordSlash;
  private swordEquipped = false;
  private swordOnFire = false;
  private campfire?: CampfireObject;
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
  private shopButton?: Phaser.GameObjects.Text;
  private eKey?: Phaser.Input.Keyboard.Key;
  private upgrades: UpgradeState = { maxHealth: 0, swordSpeed: 0, moveSpeed: 0, magnet: 0 };
  private activeScreen = { cx: 0, cy: 0 };

  // Lighting
  private darknessOverlay?: Phaser.GameObjects.RenderTexture;
  private lightCircleImg?: Phaser.GameObjects.Image;
  private playerShadow?: Phaser.GameObjects.Ellipse;
  private readonly lightFlicker = { radius: 1.0, velocity: 0 };

  // Footprints
  private footprintStep = false;

  // Breathing idle
  private breathingTween?: Phaser.Tweens.Tween;
  private lastStepTime = 0;
  private breathingBaseY = 0;

  public constructor() {
    super(GameScene.key);
  }

  public create(): void {
    const startWorldX = START_SCREEN_PLAYER_X;
    const startWorldY = START_SCREEN_PLAYER_Y;

    this.isDead = false;
    this.playerMaxHealth = HUD_HEALTH_MAX;
    this.playerHealth = HUD_HEALTH_MAX;
    this.playerInvincible = false;
    this.playerWorld = { worldX: startWorldX, worldY: startWorldY };
    this.activeScreen = {
      cx: Math.floor(startWorldX / CHUNK_COLUMNS),
      cy: Math.floor(startWorldY / CHUNK_ROWS),
    };
    this.shopOpen = false;
    this.upgrades = { maxHealth: 0, swordSpeed: 0, moveSpeed: 0, magnet: 0 };

    this.cameras.main.setBackgroundColor('#1a1a2e');

    this.chunkManager = new ChunkManager();
    const screenContent: Map<string, ScreenContent> = buildScreenContentMap(this.chunkManager);
    this.enemyManager = new EnemyManager(this, screenContent);
    this.coinManager = new CoinManager(this);
    this.heartPickupManager = new HeartPickupManager(this, screenContent);
    this.swordPickupManager = new SwordPickupManager(this, screenContent);
    this.swordEquipped = false;
    this.swordOnFire = false;
    this.swordSlash = undefined;
    this.camera = new WorldCamera(0, 0, 0, 0);
    this.camera.setActiveScreen(startWorldX, startWorldY);
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
        if (this.enemyManager?.getEnemyAt(wx, wy)) return true;
        if (this.campfire && wx === this.campfire.worldX && wy === this.campfire.worldY) return true;
        return this.chunkManager?.isCellBlocked(wx, wy) ?? false;
      },
      (wx, wy) => animateGrassRustle(this, this.boardRenderer?.getGrassSprite(wx, wy), this.tileSize),
      (wx, wy) => this.handlePlayerBump(wx, wy),
      (cx, cy) => this.handleScreenTransitionComplete(cx, cy),
    );

    this.eKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    this.shopButton = this.add.text(0, 0, '[ LOJA ]', {
      fontFamily: FONT_FAMILY, fontSize: '10px', color: '#9977bb', resolution: Math.max(2, Math.ceil(window.devicePixelRatio)),
    })
      .setDepth(SCENE_DEPTHS.uiLabel)
      .setVisible(false)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => { this.shopButton?.setColor('#cc99ff'); })
      .on('pointerout',  () => { this.shopButton?.setColor('#9977bb'); })
      .on('pointerdown', () => { this.toggleShop(); });

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.handleResize({ width: this.scale.width, height: this.scale.height });

    // Campfire placed 2 tiles right and 4 tiles up from player spawn, in the start chunk
    this.campfire = new CampfireObject(this, startWorldX + 2, startWorldY - 4);

    this.initLighting();
    this.loadActiveScreenContent();
  }

  public shutdown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.enemyManager?.destroy();
    this.coinManager?.destroy();
    this.heartPickupManager?.destroy();
    this.swordPickupManager?.destroy();
    this.swordSlash?.destroy();
    this.campfire?.destroy();
    this.shopOverlay?.destroy();
    this.breathingTween?.destroy();
    this.breathingTween = undefined;
    this.lightCircleImg?.destroy();
    this.darknessOverlay?.destroy();
    this.playerShadow?.destroy();
    if (this.textures.exists('_campfire_light')) this.textures.remove('_campfire_light');
    this.swordSlash = undefined;
    this.campfire = undefined;
    this.lightCircleImg = undefined;
    this.darknessOverlay = undefined;
    this.playerShadow = undefined;
  }

  public update(_time: number, delta: number): void {
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
    const stepDx = this.playerWorld.worldX - prevWorldX;
    const stepDy = this.playerWorld.worldY - prevWorldY;
    if ((stepDx !== 0 || stepDy !== 0) && !this.camera.transitioning) {
      this.spawnFootprint(prevWorldX, prevWorldY, stepDx, stepDy);
      this.lastStepTime = this.time.now;
      this.stopBreathing();
    } else if (this.time.now - this.lastStepTime > 180) {
      this.startBreathing();
    }
    this.syncActiveScreenState();
    this.boardRenderer.updateWorld(this.camera, this.chunkManager, this.tileSize);
    const isScreenTransitioning = this.camera.transitioning;

    const isPickupOccupied = (x: number, y: number): boolean =>
      (this.heartPickupManager?.hasPickupAt(x, y) ?? false) ||
      (this.swordPickupManager?.hasPickupAt(x, y) ?? false);

    const isItemOccupied = (x: number, y: number): boolean =>
      isPickupOccupied(x, y) || (this.enemyManager?.getEnemyAt(x, y) !== null);

    if (this.enemyManager) {
      if (!isScreenTransitioning) {
        const attacked = this.enemyManager.update(
          delta,
          this.playerWorld.worldX,
          this.playerWorld.worldY,
          (wx, wy) => this.chunkManager?.isCellBlocked(wx, wy) ?? false,
        );
        if (attacked) this.handleEnemyAttackPlayer();
      }
      this.enemyManager.render(this.tileSize, this.camera);
    }

    if (this.coinManager && this.camera) {
      const hudCoin = this.boardRenderer?.getHudCoinAnchor() ?? { x: 0, y: 0 };
      if (!isScreenTransitioning) {
        this.coinManager.update(
          this.playerWorld.worldX,
          this.playerWorld.worldY,
          hudCoin,
          (total) => this.boardRenderer?.setCoinCount(total, this),
        );
      }
      this.coinManager.render(this.tileSize, this.camera);
    }

    if (this.heartPickupManager && this.chunkManager) {
      if (!isScreenTransitioning) {
        this.heartPickupManager.update(
          delta,
          this.playerWorld.worldX,
          this.playerWorld.worldY,
          this.playerHealth,
          this.chunkManager,
          isItemOccupied,
          () => {
            this.playerHealth = Math.min(this.playerMaxHealth, this.playerHealth + 1);
            this.boardRenderer?.setHealth(this.playerHealth);
          },
        );
      }
      this.heartPickupManager.render(this.tileSize, this.camera!);
    }

    if (this.swordPickupManager && this.chunkManager) {
      if (!isScreenTransitioning) {
        this.swordPickupManager.update(
          delta,
          this.playerWorld.worldX,
          this.playerWorld.worldY,
          this.swordEquipped,
          this.chunkManager,
          isItemOccupied,
          () => this.equipSword(),
        );
      }
      this.swordPickupManager.render(this.tileSize, this.camera!);
    }

    if (this.playerInvincible) {
      this.invincibleTimer -= delta;
      if (this.invincibleTimer <= 0) {
        this.playerInvincible = false;
        this.player?.setAlpha(1);
      }
    }

    if (this.campfire) this.campfire.render(this.tileSize, this.camera);

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
      this.camera.viewportColumns = CHUNK_COLUMNS;
      this.camera.viewportRows = CHUNK_ROWS;
    }

    const hudMetrics = this.buildHudMetrics(width, height, this.tileSize);
    this.boardRenderer?.render(hudMetrics);
    this.minimapRenderer?.layout(this.boardRenderer?.getHudMapBounds() ?? { x: 0, y: 0, width: 0, height: 0 });

    this.player?.setDisplaySize(this.tileSize, this.tileSize);
    this.movementController?.syncPlayerToWorld(this.playerWorld.worldX, this.playerWorld.worldY, this.tileSize);
    this.shopButton?.setPosition(width / 2, Math.floor(this.tileSize * 0.5)).setOrigin(0.5);

    if (this.darknessOverlay) {
      const hudH = this.tileSize * HUD_RESERVED_ROWS;
      this.darknessOverlay.setPosition(0, hudH).resize(width, Math.max(1, height - hudH));
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

  private syncActiveScreenState(): void {
    if (this.camera?.transitioning) return;

    const nextCx = Math.floor(this.playerWorld.worldX / CHUNK_COLUMNS);
    const nextCy = Math.floor(this.playerWorld.worldY / CHUNK_ROWS);
    if (nextCx === this.activeScreen.cx && nextCy === this.activeScreen.cy) return;

    this.activeScreen = { cx: nextCx, cy: nextCy };
    this.loadActiveScreenContent();
  }

  private handleScreenTransitionComplete(cx: number, cy: number): void {
    this.activeScreen = { cx, cy };
    this.coinManager?.resetForScreenChange();
    this.loadActiveScreenContent();
  }

  private loadActiveScreenContent(): void {
    this.enemyManager?.enterScreen(this.activeScreen.cx, this.activeScreen.cy);
    this.heartPickupManager?.enterScreen(this.activeScreen.cx, this.activeScreen.cy);
    this.swordPickupManager?.enterScreen(this.activeScreen.cx, this.activeScreen.cy, this.swordEquipped);
  }

  private handlePlayerBump(wx: number, wy: number): void {
    // Campfire interaction — swing sword, then ignite
    if (this.campfire && wx === this.campfire.worldX && wy === this.campfire.worldY) {
      this.campfire.onHit();
      if (this.swordEquipped && this.swordSlash && this.camera) {
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

    const enemy = this.enemyManager?.getEnemyAt(wx, wy);
    if (!enemy) return;

    const hits = this.swordEquipped ? 1 + this.upgrades.swordSpeed : 1;
    for (let i = 0; i < hits; i++) enemy.takeDamage();

    if (this.swordEquipped && this.swordSlash && this.camera) {
      const dx = wx - this.playerWorld.worldX;
      const dy = wy - this.playerWorld.worldY;
      const screen = this.camera.tileToScreen(this.playerWorld.worldX, this.playerWorld.worldY, this.tileSize);
      this.swordSlash.slash(screen.x, screen.y, dx, dy, this.tileSize);
      enemy.triggerKnockback(dx, dy, this.tileSize);
      if (this.swordOnFire && enemy.isAlive) this.spawnFireHitEffect(wx, wy);
    }

    this.movementController?.interruptMovement(this.playerWorld.worldX, this.playerWorld.worldY);
    this.player?.setTint(0xffff00);
    this.time.delayedCall(120, () => { this.player?.clearTint(); });

    if (!enemy.isAlive && this.chunkManager) {
      this.coinManager?.spawnCoins(enemy.worldX, enemy.worldY, this.chunkManager);
    }
  }

  private igniteSword(): void {
    this.swordOnFire = true;
    this.swordSlash?.setOnFire(true);
    this.boardRenderer?.setHudSwordOnFire(true);
    // Orange flash on the player as the fire transfers
    this.player?.setTint(0xff6600);
    this.time.delayedCall(250, () => { this.player?.clearTint(); });
  }

  private spawnFireHitEffect(wx: number, wy: number): void {
    if (!this.camera) return;
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

  private toggleShop(): void {
    if (this.shopOpen) this.closeShop(); else this.openShop();
  }

  private openShop(): void {
    if (this.shopOpen) return;
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

  private equipSword(): void {
    this.swordEquipped = true;
    this.swordPickupManager?.onSwordEquipped();
    this.swordSlash?.destroy();
    this.swordSlash = new SwordSlash(this);
    this.boardRenderer?.setHudItemTexture(ASSET_KEYS.swordItemIcon);
  }

  private handleEnemyAttackPlayer(): void {
    if (this.playerInvincible || this.isDead) return;

    this.playerHealth = Math.max(0, this.playerHealth - 1);
    this.boardRenderer?.setHealth(this.playerHealth);

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
    this.isDead = true;
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
      resolution: Math.max(2, Math.ceil(window.devicePixelRatio)),
    })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(SCENE_DEPTHS.toast + 1);

    const sub = this.add.text(width / 2, height / 2 + Math.floor(this.tileSize * 1.8), 'new world...', {
      fontFamily: FONT_FAMILY,
      fontSize: `${Math.floor(this.tileSize * 0.55)}px`,
      color: '#aaaaaa',
      resolution: Math.max(2, Math.ceil(window.devicePixelRatio)),
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
      onComplete: () => {
        this.time.delayedCall(1400, () => {
          this.scene.restart();
        });
      },
    });
  }

  private initLighting(): void {
    // Radial gradient: white (opaque) centre → transparent edge, used with erase() to punch light holes
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0,    'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.75, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    this.textures.addCanvas('_campfire_light', canvas);

    const { width, height } = this.scale;
    const hudH = this.tileSize * HUD_RESERVED_ROWS;

    this.darknessOverlay = this.add
      .renderTexture(0, hudH, width, Math.max(1, height - hudH))
      .setDepth(SCENE_DEPTHS.lighting)
      .setOrigin(0);

    // Off-display-list image used solely as the erase stamp
    this.lightCircleImg = this.make.image({ key: '_campfire_light', add: false });

    this.playerShadow = this.add
      .ellipse(0, 0, 1, 1, 0x000000, 0.55)
      .setDepth(SCENE_DEPTHS.decorBelowPlayer)
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

    if (this.campfire && this.camera) {
      const hudH = this.tileSize * HUD_RESERVED_ROWS;
      const cfScreen = this.camera.tileToScreen(this.campfire.worldX, this.campfire.worldY, this.tileSize);
      const cfRadius = this.tileSize * 4.5 * this.lightFlicker.radius;
      this.lightCircleImg.setDisplaySize(cfRadius * 2, cfRadius * 2);
      rt.erase(this.lightCircleImg, cfScreen.x, cfScreen.y - hudH);
    }

    // Small ambient glow around the player — always visible so gameplay isn't pitch-black
    if (this.camera) {
      const hudH = this.tileSize * HUD_RESERVED_ROWS;
      const pScreen = this.camera.tileToScreen(this.playerWorld.worldX, this.playerWorld.worldY, this.tileSize);
      const pRadius = this.tileSize * 4.5;
      this.lightCircleImg.setDisplaySize(pRadius * 2, pRadius * 2);
      rt.erase(this.lightCircleImg, pScreen.x, pScreen.y - hudH);
    }
  }

  private updatePlayerShadow(): void {
    this.playerShadow?.setVisible(false);
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

    // Alternate left / right foot using perpendicular offset
    const sign = this.footprintStep ? 1 : -1;
    this.footprintStep = !this.footprintStep;

    // Perpendicular to movement direction
    const perpX = -dy;
    const perpY = dx;
    const offset = this.tileSize * 0.17;

    const screen = this.camera.tileToScreen(fromWorldX, fromWorldY, this.tileSize);
    const fx = screen.x + perpX * offset * sign;
    const fy = screen.y + perpY * offset * sign + this.tileSize * 0.28;

    const w = Math.max(3, Math.floor(this.tileSize * (dy !== 0 ? 0.30 : 0.16)));
    const h = Math.max(3, Math.floor(this.tileSize * (dx !== 0 ? 0.30 : 0.16)));

    const print = this.add
      .ellipse(fx, fy, w, h, 0x1a0e06, 0.75)
      .setDepth(SCENE_DEPTHS.decorBelowPlayer - 1);

    this.tweens.add({
      targets: print,
      alpha: 0,
      y: fy - this.tileSize * 0.22,
      duration: 750,
      ease: 'Power1.easeIn',
      onComplete: () => { print.destroy(); },
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
