import Phaser from 'phaser';

import {
  ANIMATION_KEYS,
  ASSET_KEYS,
  CHUNK_SIZE,
  FONT_FAMILY,
  GAMEPLAY_HERO_MAX_SIZE,
  GAMEPLAY_HERO_SCALE,
  HERO_FRAMES,
  HUD_HEALTH_MAX,
  HUD_RESERVED_ROWS,
  MIN_BOARD_TILE_SIZE,
  SCENE_DEPTHS,
  TIMINGS,
  WORLD_VIEWPORT_COLS,
  WORLD_VIEWPORT_ROWS,
} from '@/game/constants';
import { CoinManager } from '@/game/entities/CoinManager';
import type { EnemyBase } from '@/game/entities/EnemyBase';
import { EnemyManager } from '@/game/entities/EnemyManager';
import { HeartPickupManager } from '@/game/entities/HeartPickupManager';
import { SwordPickupManager } from '@/game/entities/SwordPickupManager';
import { SwordOrbit } from '@/game/runtime/SwordOrbit';
import { ShopOverlay, type UpgradeState, getUpgradeCost, UPGRADES_CFG } from '@/game/runtime/ShopOverlay';
import { GameBoardRenderer } from '@/game/runtime/GameBoardRenderer';
import { MinimapRenderer } from '@/game/runtime/MinimapRenderer';
import { PlayerMovementController } from '@/game/runtime/PlayerMovementController';
import { animateGrassRustle } from '@/game/runtime/RuntimeEffects';
import { WorldCamera } from '@/game/runtime/WorldCamera';
import { createBoardMetrics, type BoardMetrics } from '@/game/shared/grid';
import { ChunkManager } from '@/game/world/ChunkManager';

export class GameScene extends Phaser.Scene {
  public static readonly key = 'game';

  private camera?: WorldCamera;
  private chunkManager?: ChunkManager;
  private enemyManager?: EnemyManager;
  private coinManager?: CoinManager;
  private heartPickupManager?: HeartPickupManager;
  private swordPickupManager?: SwordPickupManager;
  private swordOrbit?: SwordOrbit;
  private swordEquipped = false;
  private readonly swordLastHit = new WeakMap<EnemyBase, number>();
  private swordHitCooldown = 500;
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

  public constructor() {
    super(GameScene.key);
  }

  public create(): void {
    this.isDead = false;
    this.playerMaxHealth = HUD_HEALTH_MAX;
    this.playerHealth = HUD_HEALTH_MAX;
    this.playerInvincible = false;
    this.playerWorld = { worldX: 0, worldY: 0 };
    this.shopOpen = false;
    this.upgrades = { maxHealth: 0, swordSpeed: 0, moveSpeed: 0, magnet: 0 };
    this.swordHitCooldown = 500;

    const seed = (this.scene.settings.data as Record<string, number> | undefined)?.seed
      ?? Math.floor(Math.random() * 1_000_000);

    this.cameras.main.setBackgroundColor('#1a1a2e');

    this.chunkManager = new ChunkManager(seed);
    this.enemyManager = new EnemyManager(this);
    this.coinManager = new CoinManager(this);
    this.heartPickupManager = new HeartPickupManager(this);
    this.swordPickupManager = new SwordPickupManager(this);
    this.swordEquipped = false;
    this.swordOrbit = undefined;
    this.camera = new WorldCamera(0, 0, 0, 0);
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
        return this.chunkManager?.isCellBlocked(wx, wy) ?? false;
      },
      (wx, wy) => animateGrassRustle(this, this.boardRenderer?.getGrassSprite(wx, wy), this.tileSize),
      (wx, wy) => this.handlePlayerBump(wx, wy),
    );

    this.eKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    this.shopButton = this.add.text(0, 0, '[ LOJA ]', {
      fontFamily: FONT_FAMILY, fontSize: '10px', color: '#9977bb',
    })
      .setDepth(SCENE_DEPTHS.uiLabel)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => { this.shopButton?.setColor('#cc99ff'); })
      .on('pointerout',  () => { this.shopButton?.setColor('#9977bb'); })
      .on('pointerdown', () => { this.toggleShop(); });

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.handleResize({ width: this.scale.width, height: this.scale.height });
  }

  public shutdown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.enemyManager?.destroy();
    this.coinManager?.destroy();
    this.heartPickupManager?.destroy();
    this.swordPickupManager?.destroy();
    this.swordOrbit?.destroy();
    this.shopOverlay?.destroy();
    this.swordOrbit = undefined;
  }

  public update(_time: number, delta: number): void {
    if (this.eKey && Phaser.Input.Keyboard.JustDown(this.eKey)) this.toggleShop();
    if (this.isDead || this.shopOpen || !this.movementController || !this.boardRenderer || !this.chunkManager || !this.camera) {
      return;
    }

    this.playerWorld = this.movementController.update(this.playerWorld.worldX, this.playerWorld.worldY);
    this.boardRenderer.updateWorld(this.camera, this.chunkManager, this.tileSize);

    const isPickupOccupied = (x: number, y: number): boolean =>
      (this.heartPickupManager?.hasPickupAt(x, y) ?? false) ||
      (this.swordPickupManager?.hasPickupAt(x, y) ?? false);

    const isItemOccupied = (x: number, y: number): boolean =>
      isPickupOccupied(x, y) || (this.enemyManager?.getEnemyAt(x, y) !== null);

    this.spawnInVisibleChunks(isPickupOccupied);

    if (this.enemyManager) {
      const attacked = this.enemyManager.update(
        delta,
        this.playerWorld.worldX,
        this.playerWorld.worldY,
        (wx, wy) => this.chunkManager?.isCellBlocked(wx, wy) ?? false,
      );
      if (attacked) this.handleEnemyAttackPlayer();
      this.enemyManager.render(this.tileSize, this.camera);
    }

    if (this.coinManager && this.camera) {
      const hudCoin = this.boardRenderer?.getHudCoinAnchor() ?? { x: 0, y: 0 };
      this.coinManager.update(
        this.playerWorld.worldX,
        this.playerWorld.worldY,
        hudCoin,
        (total) => this.boardRenderer?.setCoinCount(total, this),
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
          this.playerHealth = Math.min(this.playerMaxHealth, this.playerHealth + 1);
          this.boardRenderer?.setHealth(this.playerHealth);
        },
      );
      this.heartPickupManager.render(this.tileSize, this.camera!);
    }

    if (this.swordPickupManager && this.chunkManager) {
      this.swordPickupManager.update(
        delta,
        this.playerWorld.worldX,
        this.playerWorld.worldY,
        this.swordEquipped,
        this.chunkManager,
        isItemOccupied,
        () => this.equipSword(),
      );
      this.swordPickupManager.render(this.tileSize, this.camera!);
    }

    if (this.swordOrbit && this.camera && this.enemyManager) {
      const NEARBY = 6;
      const hasNearbyEnemy = this.enemyManager.getAliveEnemies().some(
        (e) => Math.abs(e.worldX - this.playerWorld.worldX) <= NEARBY &&
               Math.abs(e.worldY - this.playerWorld.worldY) <= NEARBY,
      );
      const screen = this.camera.tileToScreen(this.playerWorld.worldX, this.playerWorld.worldY, this.tileSize);
      this.swordOrbit.update(screen.x, screen.y, this.tileSize, delta, hasNearbyEnemy);

      if (hasNearbyEnemy) {
        const tile = this.swordOrbit.getWorldTile(this.playerWorld.worldX, this.playerWorld.worldY);
        const hit = this.enemyManager.getEnemyAt(tile.x, tile.y);
        if (hit) {
          const lastHit = this.swordLastHit.get(hit) ?? 0;
          if (this.time.now - lastHit > this.swordHitCooldown) {
            this.swordLastHit.set(hit, this.time.now);
            hit.takeDamage();
            if (!hit.isAlive && this.chunkManager) {
              this.coinManager?.spawnCoins(hit.worldX, hit.worldY, this.chunkManager);
            }
          }
        }
      }
    }

    if (this.playerInvincible) {
      this.invincibleTimer -= delta;
      if (this.invincibleTimer <= 0) {
        this.playerInvincible = false;
        this.player?.setAlpha(1);
      }
    }

    this.minimapRenderer?.update(this.camera, this.chunkManager, this.enemyManager);
  }

  private handleResize(gameSize: Phaser.Structs.Size | { width: number; height: number }): void {
    const { width, height } = gameSize;
    this.cameras.main.setViewport(0, 0, width, height);

    this.tileSize = this.computeTileSize(width, height);

    const screenCenterX = Math.floor(width / 2);
    const screenCenterY = Math.floor(this.tileSize + (height - this.tileSize) / 2);

    if (this.camera) {
      this.camera.screenCenterX = screenCenterX;
      this.camera.screenCenterY = screenCenterY;
    }

    const hudMetrics = this.buildHudMetrics(width, height, this.tileSize);
    this.boardRenderer?.render(hudMetrics);
    this.minimapRenderer?.layout(width, height);

    this.player?.setDisplaySize(this.tileSize, this.tileSize);
    this.movementController?.syncPlayerToScreen();
    this.shopButton?.setPosition(width / 2, Math.floor(this.tileSize * 0.5)).setOrigin(0.5);
  }

  private computeTileSize(width: number, height: number): number {
    const metrics = createBoardMetrics(width, height, {
      columns: WORLD_VIEWPORT_COLS,
      rows: WORLD_VIEWPORT_ROWS,
      minTileSize: MIN_BOARD_TILE_SIZE,
      characterScale: GAMEPLAY_HERO_SCALE,
      maxCharacterSize: GAMEPLAY_HERO_MAX_SIZE,
      reservedTopRows: HUD_RESERVED_ROWS,
    });
    return metrics.tileSize;
  }

  private buildHudMetrics(width: number, height: number, tileSize: number): BoardMetrics {
    return {
      columns: WORLD_VIEWPORT_COLS,
      rows: WORLD_VIEWPORT_ROWS,
      tileSize,
      offsetX: 0,
      offsetY: tileSize,
      width,
      height: height - tileSize,
      characterSize: tileSize,
    };
  }

  private spawnInVisibleChunks(isOccupied: (wx: number, wy: number) => boolean): void {
    if (!this.camera || !this.chunkManager || !this.enemyManager) return;
    const range = this.camera.getVisibleRange(this.tileSize);
    const cxMin = Math.floor(range.minX / CHUNK_SIZE) - 1;
    const cxMax = Math.ceil(range.maxX / CHUNK_SIZE) + 1;
    const cyMin = Math.floor(range.minY / CHUNK_SIZE) - 1;
    const cyMax = Math.ceil(range.maxY / CHUNK_SIZE) + 1;
    for (let cy = cyMin; cy <= cyMax; cy++) {
      for (let cx = cxMin; cx <= cxMax; cx++) {
        this.enemyManager.spawnForChunk(cx, cy, this.chunkManager, isOccupied);
      }
    }
  }

  private handlePlayerBump(wx: number, wy: number): void {
    const enemy = this.enemyManager?.getEnemyAt(wx, wy);
    if (!enemy) return;

    enemy.takeDamage();
    if (this.swordEquipped) enemy.takeDamage();

    if (this.player) this.tweens.killTweensOf(this.player);
    this.player?.setTint(0xffff00);
    this.time.delayedCall(120, () => { this.player?.clearTint(); });

    if (!enemy.isAlive && this.chunkManager) {
      this.coinManager?.spawnCoins(enemy.worldX, enemy.worldY, this.chunkManager);
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
    } else if (id === 'swordSpeed') {
      this.swordHitCooldown = Math.max(80, 500 - this.upgrades.swordSpeed * 150);
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
    this.swordOrbit?.destroy();
    this.swordOrbit = new SwordOrbit(this);
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

    if (this.player) this.tweens.killTweensOf(this.player);
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
    if (this.player) this.tweens.killTweensOf(this.player);

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
      resolution: window.devicePixelRatio,
    })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(SCENE_DEPTHS.toast + 1);

    const sub = this.add.text(width / 2, height / 2 + Math.floor(this.tileSize * 1.8), 'new world...', {
      fontFamily: FONT_FAMILY,
      fontSize: `${Math.floor(this.tileSize * 0.55)}px`,
      color: '#aaaaaa',
      resolution: window.devicePixelRatio,
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
          const newSeed = Math.floor(Math.random() * 1_000_000);
          this.scene.restart({ seed: newSeed });
        });
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
