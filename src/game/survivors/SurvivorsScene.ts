import Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import { MIN_BOARD_TILE_SIZE } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { setCurrentWorld3D, World3D, type FireLight3D } from '@/game/render3d/World3D';
import { createHeroView, tickHeroView, type HeroView } from '@/game/runtime/HeroView';
import { isTouchDevice, PauseMenu, PauseTouchButton } from '@/game/runtime/PauseMenu';
import { WorldCamera } from '@/game/runtime/WorldCamera';
import { setWorldData } from '@/game/world/WorldData';

import { buildLevelUpChoices, GOLD_CHOICE_AMOUNT, HEAL_CHOICE_AMOUNT, randomChestUpgrade, type UpgradeChoice } from './choices';
import { DamageNumbers } from './DamageNumbers';
import { loadMeta, saveMeta, type SurvivorsMeta } from './meta';
import { PickupField, rollDrop, scatter, type PickupKind } from './Pickups';
import {
  CHEST_GOLD_MAX, CHEST_GOLD_MIN, CHEST_UPGRADE_ODDS, COIN_GOLD_VALUE,
  DROP_CHANCE_COIN, DROP_CHANCE_HEART, DROP_CHANCE_MAGNET, ELITE_KINDS,
  ELITE_TIMES_SEC, ENEMY_DEFS, HEART_HEAL_AMOUNT, PLAYER_BASE, REAPER_WARNING_SEC,
  RUN_DURATION_SEC, STARTING_WEAPON, WEAPON_DEFS, waveForTime, xpToNextLevel,
} from './SurvivorsConfig';
import { HordeDirector, SurvivorsHorde, type SEnemy } from './SurvivorsEnemies';
import { SurvivorsPlayer } from './SurvivorsPlayer';
import { registerSurvivorsTextures } from './survivorsTextures';
import { ARENA_CAMPFIRES, buildSurvivorsWorld } from './survivorsWorld';
import { ChestOverlay, type ChestRewards } from './ui/ChestOverlay';
import { LevelUpOverlay } from './ui/LevelUpOverlay';
import { ResultsOverlay } from './ui/ResultsOverlay';
import { SurvivorsHud } from './ui/SurvivorsHud';
import { WeaponSystem } from './Weapons';
import { XPGemField } from './XPGems';

// ── A cena do modo Sobreviventes ───────────────────────────────────────────────
//
// O loop completo do Vampire Survivors sobre a fundação HD-2D da casa: o mundo
// renderiza no World3D (a arena troca o WorldData ANTES do renderer nascer e o
// world.json original volta no shutdown), o herói é o mesmo HeroView+billboard,
// o áudio é o SoundManager de sempre. Só a lógica é outra: mover, sobreviver,
// evoluir — e "só mais uma run".

const CAMPFIRE_FLAME_KEYS = ['campfire-0', 'campfire-1', 'campfire-2'] as const;
const CAMPFIRE_FLAME_MS = 160;
// Um toque por inimigo no máximo a cada tanto — junto do invuln global, evita
// que 20 corpos sobrepostos batam 20 vezes no mesmo frame.
const CONTACT_REHIT_MS = 650;

interface ArenaFire {
  light: FireLight3D;
  flame: Billboard3D;
}

export class SurvivorsScene extends Phaser.Scene {
  public static readonly key = 'survivors';

  private world3d?: World3D;
  private camera?: WorldCamera;
  private readonly hero: HeroView = createHeroView();
  private heroBillboard?: Billboard3D;
  private player?: SurvivorsPlayer;
  private weapons?: WeaponSystem;
  private horde?: SurvivorsHorde;
  private director?: HordeDirector;
  private gems?: XPGemField;
  private pickups?: PickupField;
  private damageNumbers?: DamageNumbers;
  private hud?: SurvivorsHud;
  private meta: SurvivorsMeta = loadMeta();

  private tileSize = MIN_BOARD_TILE_SIZE;

  // Estado da run.
  private elapsedMs = 0;
  private playerHp: number = PLAYER_BASE.maxHp;
  private playerMaxHp: number = PLAYER_BASE.maxHp;
  private level = 1;
  private xp = 0;
  private xpNext = xpToNextLevel(1);
  private kills = 0;
  private goldRun = 0;
  private invulnMs = 0;
  private revivalsLeft = 0;
  private levelUpQueue = 0;
  private eliteIdx = 0;
  private reaperWarned = false;
  private reaperSpawned = false;
  private victory = false;
  private runOver = false;
  private runConsolidated = false;
  private godMode = false;
  private debugTimeScale = 1;

  // Fogueiras decorativas da arena (luz + chama animada).
  private fires: ArenaFire[] = [];
  private fireFrameTimer = 0;
  private fireFrame = 0;

  // Gates de sfx espamáveis.
  private gemSfxGateMs = 0;
  private deathSfxGateMs = 0;

  private levelUpOverlay?: LevelUpOverlay;
  private chestOverlay?: ChestOverlay;
  private resultsOverlay?: ResultsOverlay;
  private pauseMenu?: PauseMenu;
  private pauseTouchButton?: PauseTouchButton;

  public constructor() {
    super(SurvivorsScene.key);
  }

  public create(): void {
    // A arena vive só em memória: entra AGORA (antes do World3D ler o terreno) e
    // o world.json original volta no shutdown — o modo aventura nunca percebe.
    const arena = buildSurvivorsWorld();
    setWorldData(arena);
    registerSurvivorsTextures();

    this.resetRunState();
    this.meta = loadMeta();
    this.meta.stats.runs += 1;
    saveMeta(this.meta);

    this.world3d = new World3D();
    setCurrentWorld3D(this.world3d);
    this.game.canvas.style.position = 'relative';
    this.game.canvas.style.zIndex = '1';
    window.hd3d = this.world3d.params;
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.render3D, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    const sound = getSoundManager();
    sound.preload();
    sound.startAmbience();
    // Uma run, uma trilha: o loop frenético de 176 BPM feito para este modo
    // toca do primeiro segundo até a morte — como uma fase do VS.
    sound.startMusic('survivors', 1200);

    const start = arena.meta.playerStart;
    this.camera = new WorldCamera(start.worldX, start.worldY, 0, 0);
    this.camera.world3d = this.world3d;
    this.world3d.follow(start.worldX, start.worldY, true);

    this.heroBillboard = this.world3d
      .addBillboard('hero', this.hero.frame, { groundShadow: true, castGroundShadow: true })
      .setPosition(start.worldX, start.worldY)
      .setDisplaySize(1, 1);

    this.player = new SurvivorsPlayer(this, this.hero, start.worldX, start.worldY);

    // As fogueiras-marco: luz real + chama de pixel animada por flip de frame.
    this.fires = ARENA_CAMPFIRES.map((c) => ({
      light: this.world3d!.addFireLight(c.worldX, c.worldY, true),
      flame: this.world3d!
        .addBillboard(CAMPFIRE_FLAME_KEYS[0], 0, { emissive: true, emissiveBoost: 1.7, castShadow: false })
        .setPosition(c.worldX, c.worldY)
        .setDisplaySize(0.9, 0.9),
    }));

    this.weapons = new WeaponSystem(this, this.meta.powerUps);
    this.weapons.addWeapon(STARTING_WEAPON);
    const bonuses = this.weapons.bonuses;
    this.playerMaxHp = bonuses.maxHp;
    this.playerHp = this.playerMaxHp;
    this.revivalsLeft = bonuses.revivals;

    this.horde = new SurvivorsHorde(this, {
      onKilled: (e) => this.handleEnemyKilled(e),
      onContact: (e) => this.handleEnemyContact(e),
      onShotHit: (damage, fromX, fromY) => this.handleShotHit(damage, fromX, fromY),
    });
    this.director = new HordeDirector();
    this.gems = new XPGemField((value) => this.handleGemCollected(value));
    this.pickups = new PickupField((kind) => this.handlePickup(kind));
    this.damageNumbers = new DamageNumbers(this);
    this.hud = new SurvivorsHud();
    this.hud.setHp(this.playerHp, this.playerMaxHp);
    this.hud.setXp(0, this.level);
    this.hud.syncSlots(this.weapons.ownedWeapons(), this.weapons.ownedPassives());

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.handleResize({ width: this.scale.width, height: this.scale.height });

    this.input.keyboard?.on('keydown-ESC', () => this.openPauseMenu());
    if (isTouchDevice()) this.pauseTouchButton = new PauseTouchButton(() => this.openPauseMenu());

    if (import.meta.env.DEV) this.registerDebugApi();
  }

  private resetRunState(): void {
    this.elapsedMs = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNext = xpToNextLevel(1);
    this.kills = 0;
    this.goldRun = 0;
    this.invulnMs = 0;
    this.levelUpQueue = 0;
    this.eliteIdx = 0;
    this.reaperWarned = false;
    this.reaperSpawned = false;
    this.victory = false;
    this.runOver = false;
    this.runConsolidated = false;
    this.godMode = false;
    this.debugTimeScale = 1;
    this.gemSfxGateMs = 0;
    this.deathSfxGateMs = 0;
    this.hero.alpha = 1;
    this.hero.tint = null;
    if (this.tweens) this.tweens.timeScale = 1;
  }

  // ── o frame ──────────────────────────────────────────────────────────────────

  public update(time: number, rawDelta: number): void {
    if (this.runOver) return;
    const delta = rawDelta * this.debugTimeScale;
    const player = this.player;
    const weapons = this.weapons;
    const horde = this.horde;
    const camera = this.camera;
    if (!player || !weapons || !horde || !camera) return;

    this.elapsedMs += delta;
    const elapsedSec = this.elapsedMs / 1000;
    const bonuses = weapons.bonuses;

    // Vida máxima pode ter subido num level-up (passivo coração): o delta cura.
    if (bonuses.maxHp !== this.playerMaxHp) {
      const gained = bonuses.maxHp - this.playerMaxHp;
      this.playerMaxHp = bonuses.maxHp;
      if (gained > 0) this.playerHp = Math.min(this.playerMaxHp, this.playerHp + gained);
    }
    if (bonuses.regenPerSec > 0) {
      this.playerHp = Math.min(this.playerMaxHp, this.playerHp + bonuses.regenPerSec * (delta / 1000));
    }
    if (this.invulnMs > 0) this.invulnMs -= delta;

    player.update(delta, PLAYER_BASE.speedTilesPerSec * bonuses.moveSpeedMul);
    camera.centerOn(player.x, player.y);

    // O ritual dos minutos: elites nos tempos marcados, o aviso, e A MORTE.
    while (this.eliteIdx < ELITE_TIMES_SEC.length && elapsedSec >= ELITE_TIMES_SEC[this.eliteIdx]) {
      const kind = ELITE_KINDS[this.eliteIdx % ELITE_KINDS.length];
      this.eliteIdx += 1;
      horde.spawn(kind, waveForTime(elapsedSec), player.x, player.y, true);
      this.hud?.showBanner(['UM CAMPEÃO DESPERTOU', 'derrote-o pelo baú'], true);
      getSoundManager().playUndeadSpawn();
      this.world3d?.shake(260, 0.05);
    }
    if (!this.reaperWarned && elapsedSec >= REAPER_WARNING_SEC) {
      this.reaperWarned = true;
      this.hud?.showBanner(['A MORTE SE APROXIMA...'], true, 3400);
      getSoundManager().playUndeadWindup();
    }
    if (!this.reaperSpawned && elapsedSec >= RUN_DURATION_SEC) {
      this.reaperSpawned = true;
      this.victory = true;
      this.meta.stats.wins += 1;
      saveMeta(this.meta);
      horde.spawn('reaper', waveForTime(elapsedSec), player.x, player.y);
      this.hud?.showBanner(['VOCÊ SOBREVIVEU À NOITE!', 'mas d\'A MORTE ninguém escapa'], false, 4200);
      getSoundManager().playTitleImpact();
      this.world3d?.shake(420, 0.07);
    }

    this.damageNumbers?.beginFrame();
    this.director?.update(delta, elapsedSec, horde, player.x, player.y);
    horde.update(delta, time, player.x, player.y);
    weapons.update(delta, {
      nowMs: time,
      playerX: player.x,
      playerY: player.y,
      facingX: player.facingX,
      facingY: player.facingY,
      tileSize: this.tileSize,
      camera,
      horde,
      dealDamage: (e, amount, kx, ky, knock) => this.dealDamage(e, amount, kx, ky, knock),
    });
    this.gems?.update(delta, player.x, player.y, bonuses.magnetRadius);
    this.pickups?.update(delta, player.x, player.y);

    // As chamas das fogueiras: flip de frame na cadência grossa da casa.
    this.fireFrameTimer += delta;
    if (this.fireFrameTimer >= CAMPFIRE_FLAME_MS) {
      this.fireFrameTimer = 0;
      this.fireFrame = (this.fireFrame + 1) % CAMPFIRE_FLAME_KEYS.length;
      for (const f of this.fires) f.flame.setTexture(CAMPFIRE_FLAME_KEYS[this.fireFrame], 0);
    }

    this.gemSfxGateMs = Math.max(0, this.gemSfxGateMs - delta);
    this.deathSfxGateMs = Math.max(0, this.deathSfxGateMs - delta);

    const hud = this.hud;
    if (hud) {
      hud.setTime(elapsedSec);
      hud.setXp(this.xp / this.xpNext, this.level);
      hud.setHp(this.playerHp, this.playerMaxHp);
      hud.setKills(this.kills);
      hud.setGold(this.meta.gold + this.goldRun);
      hud.setCooldowns(weapons.cooldownStates());
    }

    // Vinheta de perigo: sangra vermelho conforme a vida drena (reusa o post 3D).
    const hpFrac = this.playerHp / this.playerMaxHp;
    this.world3d?.setDangerVignette(hpFrac < 0.4 ? (0.4 - hpFrac) / 0.4 * 0.55 : 0, 0x3d0a12);
  }

  // ── dano, morte e loot ───────────────────────────────────────────────────────

  private dealDamage(e: SEnemy, amount: number, kx: number, ky: number, knockTiles = 0.35): void {
    const horde = this.horde;
    const camera = this.camera;
    if (!horde || !camera) return;
    // ±10% de variação: números "vivos" leem melhor que um metrônomo.
    const final = amount * Phaser.Math.FloatBetween(0.9, 1.1);
    this.damageNumbers?.spawn(e.x, e.y, final, camera, this.tileSize);
    const died = horde.hurt(e, final, kx, ky, knockTiles);
    if (!died) getSoundManager().playEnemyHit();
  }

  private handleEnemyKilled(e: SEnemy): void {
    this.kills += 1;
    if (this.deathSfxGateMs <= 0) {
      this.deathSfxGateMs = 70;
      getSoundManager().playEnemyDeath();
    }

    this.gems?.spawn(e.x, e.y, e.xp);

    // O bigslime estoura em filhotes sobre a própria poça — matar um vira três.
    const def = ENEMY_DEFS[e.kind];
    if (def.splitsInto && this.horde) {
      const wave = waveForTime(this.elapsedMs / 1000);
      for (let i = 0; i < def.splitsInto.count; i++) {
        const at = scatter(e.x, e.y);
        this.horde.spawn(def.splitsInto.kind, wave, this.player?.x ?? e.x, this.player?.y ?? e.y, false, { x: at.x, y: at.y });
      }
      const pool = this.world3d?.addBillboard(def.splitsInto.poolTexKey, 0, { flat: true, castShadow: false });
      if (pool) {
        pool.setPosition(e.x, e.y).setDisplaySize(0.95, 0.95).setAlpha(0.85);
        this.tweens.add({
          targets: pool, alpha: 0, duration: 1400, ease: 'Quad.easeIn',
          onComplete: () => pool.destroy(),
        });
      }
    }

    if (e.elite) {
      const drop = scatter(e.x, e.y);
      this.pickups?.spawn('chest', drop.x, drop.y);
      this.goldRun += Math.round(25 * (this.weapons?.bonuses.goldMul ?? 1));
      this.hud?.showBanner(['O CAMPEÃO CAIU!'], false, 1800);
      return;
    }

    const kind = rollDrop(DROP_CHANCE_HEART, DROP_CHANCE_COIN, DROP_CHANCE_MAGNET);
    if (kind) {
      const at = scatter(e.x, e.y);
      this.pickups?.spawn(kind, at.x, at.y);
    }
  }

  private handleEnemyContact(e: SEnemy): void {
    if (this.runOver || this.godMode) return;
    if (this.invulnMs > 0) return;
    const now = this.time.now;
    if (now - e.lastContactMs < CONTACT_REHIT_MS) return;
    e.lastContactMs = now;
    this.applyPlayerDamage(e.damage, e.x, e.y);
  }

  /** Projétil inimigo (bola mágica, flecha, bala): só o invuln global gateia. */
  private handleShotHit(damage: number, fromX: number, fromY: number): void {
    if (this.runOver || this.godMode) return;
    if (this.invulnMs > 0) return;
    this.applyPlayerDamage(damage, fromX, fromY);
  }

  private applyPlayerDamage(damage: number, fromX: number, fromY: number): void {
    this.invulnMs = PLAYER_BASE.invulnMs;
    this.playerHp -= damage;
    this.player?.applyKnockback(fromX, fromY);
    getSoundManager().playPlayerHurt();
    this.world3d?.shake(160, 0.045);

    // O blink de dano do jogo-base: tint vermelho por um instante.
    this.hero.tint = 0xff4444;
    this.time.delayedCall(220, () => { if (!this.runOver) this.hero.tint = null; });

    if (this.playerHp <= 0) {
      if (this.revivalsLeft > 0) this.revive();
      else this.triggerDeath();
    }
  }

  private revive(): void {
    this.revivalsLeft -= 1;
    this.playerHp = this.playerMaxHp * 0.5;
    this.invulnMs = 2200;
    this.hud?.showBanner(['DE VOLTA DOS MORTOS!'], false, 2400);
    getSoundManager().playTitleImpact();
    this.world3d?.shake(300, 0.06);
    // A onda de choque do renascimento: a horda em volta voa para trás.
    const player = this.player;
    const horde = this.horde;
    if (player && horde) {
      for (const e of horde.queryCircle(player.x, player.y, 5)) {
        e.knockX += (e.x - player.x) * 6;
        e.knockY += (e.y - player.y) * 6;
      }
    }
  }

  private triggerDeath(): void {
    this.playerHp = 0;
    this.runOver = true;

    getSoundManager().playPlayerDeath();
    getSoundManager().stopMusic(1600);
    this.hero.tint = 0xff4444;
    this.tweens.add({ targets: this.hero, alpha: 0, duration: 1100, ease: 'Quad.easeIn' });

    // O mundo escurece devagar (o fade do post 3D) e os resultados entram.
    const fade = { t: 0 };
    this.tweens.add({
      targets: fade,
      t: 0.6,
      duration: 1400,
      onUpdate: () => this.world3d?.setWorldFade(fade.t),
    });
    this.time.delayedCall(1500, () => this.showResults());
  }

  /** Consolida a run na metaprogressão (uma vez só — morte, restart ou saída). */
  private finishRun(): void {
    if (this.runConsolidated) return;
    this.runConsolidated = true;
    this.meta.gold += this.goldRun;
    this.meta.stats.totalKills += this.kills;
    this.meta.stats.bestTimeMs = Math.max(this.meta.stats.bestTimeMs, Math.floor(this.elapsedMs));
    this.meta.stats.bestLevel = Math.max(this.meta.stats.bestLevel, this.level);
    saveMeta(this.meta);
  }

  private showResults(): void {
    // Consolida aqui, não no instante da morte: as armas do mesmo frame ainda
    // derrubam os últimos inimigos e esses kills pertencem à run.
    this.finishRun();
    this.resultsOverlay = new ResultsOverlay(
      {
        victory: this.victory,
        timeMs: Math.floor(this.elapsedMs),
        level: this.level,
        kills: this.kills,
        goldEarned: this.goldRun,
      },
      this.meta,
      {
        onRestart: () => {
          this.resultsOverlay?.destroy();
          this.resultsOverlay = undefined;
          getSoundManager().stopMusic();
          this.scene.restart();
        },
        onQuit: () => {
          this.resultsOverlay?.destroy();
          this.resultsOverlay = undefined;
          getSoundManager().stopMusic();
          getSoundManager().stopAmbience();
          this.scene.start('title');
        },
        onBuy: () => getSoundManager().playCoinPickup(),
      },
    );
  }

  // ── XP, level-up e baú ───────────────────────────────────────────────────────

  private handleGemCollected(value: number): void {
    if (this.runOver) return;
    this.xp += value * (this.weapons?.bonuses.xpMul ?? 1);
    if (this.gemSfxGateMs <= 0) {
      this.gemSfxGateMs = 55;
      getSoundManager().playCoinPickup();
    }
    let leveled = false;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level += 1;
      this.xpNext = xpToNextLevel(this.level);
      this.levelUpQueue += 1;
      leveled = true;
    }
    if (leveled && !this.levelUpOverlay && !this.chestOverlay) this.openLevelUp();
  }

  private openLevelUp(): void {
    const weapons = this.weapons;
    if (!weapons || this.levelUpQueue <= 0 || this.runOver) return;
    this.scene.pause();
    getSoundManager().playSingingBowl();
    this.levelUpOverlay = new LevelUpOverlay(this.level, buildLevelUpChoices(weapons), (choice) => {
      this.applyChoice(choice);
      this.levelUpOverlay?.destroy();
      this.levelUpOverlay = undefined;
      this.levelUpQueue -= 1;
      this.scene.resume();
      getSoundManager().playHeartPickup();
      // Vários níveis de uma vez (gema gorda): o próximo modal encadeia.
      if (this.levelUpQueue > 0) this.openLevelUp();
    });
  }

  private applyChoice(choice: UpgradeChoice): void {
    const weapons = this.weapons;
    if (!weapons) return;
    if (choice.type === 'weapon' && choice.weapon) {
      if (weapons.hasWeapon(choice.weapon)) weapons.levelWeapon(choice.weapon);
      else weapons.addWeapon(choice.weapon);
    } else if (choice.type === 'passive' && choice.passive) {
      weapons.addPassive(choice.passive);
    } else if (choice.type === 'gold') {
      this.goldRun += Math.round(GOLD_CHOICE_AMOUNT * weapons.bonuses.goldMul);
    } else if (choice.type === 'heal') {
      this.playerHp = Math.min(this.playerMaxHp, this.playerHp + HEAL_CHOICE_AMOUNT);
    }
    this.hud?.syncSlots(weapons.ownedWeapons(), weapons.ownedPassives());
  }

  private handlePickup(kind: PickupKind): void {
    if (this.runOver) return;
    const sound = getSoundManager();
    if (kind === 'heart') {
      this.playerHp = Math.min(this.playerMaxHp, this.playerHp + HEART_HEAL_AMOUNT);
      sound.playHeartPickup();
    } else if (kind === 'coin') {
      this.goldRun += Math.round(COIN_GOLD_VALUE * (this.weapons?.bonuses.goldMul ?? 1));
      sound.playCoinPickup();
    } else if (kind === 'magnet') {
      // O pico de dopamina do gênero: TODAS as gemas da arena voam até você.
      this.gems?.vacuumAll();
      sound.playIgnite();
    } else if (kind === 'chest') {
      this.openChest();
    }
  }

  private openChest(): void {
    const weapons = this.weapons;
    if (!weapons || this.runOver) return;

    // Evolução pendente vence sempre (a regra do VS); senão, rola 1/3/5 upgrades.
    const rewards: ChestRewards = { upgrades: [], gold: 0 };
    const ready = weapons.evolutionsReady();
    if (ready.length > 0) {
      const kind = ready[0];
      const def = WEAPON_DEFS[kind];
      weapons.evolve(kind);
      rewards.evolution = { title: def.evolvedName, desc: def.evolvedDesc, icon: def.icon };
    } else {
      const roll = Math.random();
      let acc = 0;
      let count = 1;
      for (const odd of CHEST_UPGRADE_ODDS) {
        acc += odd.chance;
        if (roll < acc) { count = odd.count; break; }
      }
      for (let i = 0; i < count; i++) {
        const upgrade = randomChestUpgrade(weapons);
        if (!upgrade) break;
        this.applyChoice(upgrade);
        rewards.upgrades.push(upgrade);
      }
    }
    rewards.gold = Math.round(
      Phaser.Math.Between(CHEST_GOLD_MIN, CHEST_GOLD_MAX) * weapons.bonuses.goldMul,
    );
    this.goldRun += rewards.gold;
    this.hud?.syncSlots(weapons.ownedWeapons(), weapons.ownedPassives());

    this.scene.pause();
    const sound = getSoundManager();
    sound.playShopOpen();
    this.chestOverlay = new ChestOverlay(
      rewards,
      () => sound.playDialogBlip(620 + Math.random() * 160),
      (isEvolution) => (isEvolution ? sound.playTitleImpact() : sound.playCoinPickup()),
      () => {
        this.chestOverlay?.destroy();
        this.chestOverlay = undefined;
        this.scene.resume();
        if (this.levelUpQueue > 0) this.openLevelUp();
      },
    );
  }

  // ── pausa ────────────────────────────────────────────────────────────────────

  private openPauseMenu(): void {
    if (this.pauseMenu || this.levelUpOverlay || this.chestOverlay || this.resultsOverlay || this.runOver) return;
    this.pauseTouchButton?.setVisible(false);
    this.pauseMenu = new PauseMenu(this, {
      onResume: () => this.closePauseMenu(),
      onRestart: () => {
        this.closePauseMenu();
        // O ouro coletado banca mesmo abandonando a run — como no VS.
        this.finishRun();
        getSoundManager().stopMusic();
        this.scene.restart();
      },
      onQuit: () => {
        this.closePauseMenu();
        this.finishRun();
        getSoundManager().stopMusic();
        getSoundManager().stopAmbience();
        this.scene.start('title');
      },
    });
    this.scene.pause();
  }

  private closePauseMenu(): void {
    if (!this.pauseMenu) return;
    this.pauseMenu.destroy();
    this.pauseMenu = undefined;
    this.pauseTouchButton?.setVisible(true);
    this.scene.resume();
  }

  // ── o frame 3D (POST_UPDATE, o mesmo contrato do GameScene) ──────────────────

  private render3D(_time: number, delta: number): void {
    const w3 = this.world3d;
    const cam = this.camera;
    const player = this.player;
    if (!w3 || !cam || !player) return;

    w3.follow(cam.camX, cam.camY);
    this.tileSize = w3.tileScreenSize();
    this.hero.sizePx = this.tileSize;

    tickHeroView(this.hero, delta);
    const b = this.heroBillboard;
    if (b) {
      b.setPosition(player.x, player.y);
      b.setDisplaySize(Math.max(0.05, this.hero.scaleX), Math.max(0.05, this.hero.scaleY));
      b.setTexture('hero', this.hero.frame);
      b.setFlipX(this.hero.flipX);
      b.setAlpha(this.hero.alpha);
      if (this.hero.tint !== null) b.setTint(this.hero.tint);
      else b.clearTint();
      w3.setHeroLight(b.x, b.y, 1);
    }

    w3.render(delta);
  }

  private handleResize(gameSize: Phaser.Structs.Size | { width: number; height: number }): void {
    const { width, height } = gameSize;
    this.cameras.main.setViewport(0, 0, width, height);
    if (this.camera) {
      this.camera.screenCenterX = Math.floor(width / 2);
      this.camera.screenCenterY = Math.floor(height / 2);
      this.camera.viewportColumns = Math.ceil(width / Math.max(1, this.tileSize));
      this.camera.viewportRows = Math.ceil(height / Math.max(1, this.tileSize));
    }
  }

  // ── debug (playtest) ─────────────────────────────────────────────────────────

  private registerDebugApi(): void {
    const api = {
      getState: () => ({
        scene: SurvivorsScene.key,
        elapsedSec: this.elapsedMs / 1000,
        hp: this.playerHp,
        maxHp: this.playerMaxHp,
        level: this.level,
        xp: this.xp,
        xpNext: this.xpNext,
        kills: this.kills,
        goldRun: this.goldRun,
        goldTotal: this.meta.gold + this.goldRun,
        alive: this.horde?.aliveCount ?? 0,
        gems: this.gems?.activeCount ?? 0,
        weapons: this.weapons?.ownedWeapons() ?? [],
        passives: this.weapons?.ownedPassives() ?? [],
        player: this.player ? { x: this.player.x, y: this.player.y } : null,
        overlays: {
          levelUp: Boolean(this.levelUpOverlay),
          chest: Boolean(this.chestOverlay),
          results: Boolean(this.resultsOverlay),
          pause: Boolean(this.pauseMenu),
        },
        victory: this.victory,
        runOver: this.runOver,
      }),
      grantXp: (n: number) => this.handleGemCollected(n),
      setTimeSec: (sec: number) => { this.elapsedMs = sec * 1000; },
      killAll: () => this.horde?.forEachAlive((e) => this.horde?.kill(e, e.kind !== 'reaper')),
      god: (on: boolean) => { this.godMode = on; },
      hurt: (n: number) => {
        this.playerHp -= n;
        if (this.playerHp <= 0) this.triggerDeath();
      },
      timeScale: (x: number) => { this.debugTimeScale = x; },
      spawnChest: () => this.pickups?.spawn('chest', (this.player?.x ?? 0) + 1, this.player?.y ?? 0),
      giveAll: () => {
        const ws = this.weapons;
        if (!ws) return;
        for (const kind of Object.keys(WEAPON_DEFS) as Array<keyof typeof WEAPON_DEFS>) {
          ws.addWeapon(kind);
          for (let i = 0; i < 7; i++) ws.levelWeapon(kind);
        }
        this.hud?.syncSlots(ws.ownedWeapons(), ws.ownedPassives());
      },
    };
    (window as unknown as { __survivors?: unknown }).__survivors = api;
  }

  // ── teardown ─────────────────────────────────────────────────────────────────

  public shutdown(): void {
    // Devolve o mundo da aventura ANTES de qualquer outra cena nascer.
    const original: unknown = this.cache.json.get('world');
    if (original) setWorldData(original);

    (window as unknown as { __survivors?: unknown }).__survivors = undefined;
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.render3D, this);

    this.weapons?.destroy();
    this.weapons = undefined;
    this.horde?.destroy();
    this.horde = undefined;
    this.director = undefined;
    this.gems?.destroy();
    this.gems = undefined;
    this.pickups?.destroy();
    this.pickups = undefined;
    this.damageNumbers?.destroy();
    this.damageNumbers = undefined;
    this.hud?.destroy();
    this.hud = undefined;
    this.levelUpOverlay?.destroy();
    this.levelUpOverlay = undefined;
    this.chestOverlay?.destroy();
    this.chestOverlay = undefined;
    this.resultsOverlay?.destroy();
    this.resultsOverlay = undefined;
    this.pauseMenu?.destroy();
    this.pauseMenu = undefined;
    this.pauseTouchButton?.destroy();
    this.pauseTouchButton = undefined;

    this.fires.forEach((f) => f.flame.destroy());
    this.fires = [];
    this.heroBillboard?.destroy();
    this.heroBillboard = undefined;
    this.player = undefined;

    if (window.hd3d === this.world3d?.params) window.hd3d = undefined;
    setCurrentWorld3D(undefined);
    this.world3d?.dispose();
    this.world3d = undefined;
    if (this.camera) this.camera.world3d = undefined;
    this.camera = undefined;
    if (this.tweens) this.tweens.timeScale = 1;
  }
}
