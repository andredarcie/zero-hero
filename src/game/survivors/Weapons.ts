import Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_PUFF_TEXTURE, FX_RING_TEXTURE, world3d } from '@/game/render3d/World3D';
import { SwordSlash } from '@/game/runtime/SwordOrbit';
import type { WorldCamera } from '@/game/runtime/WorldCamera';
import {
  PASSIVE_DEFS, PLAYER_BASE, WEAPON_DEFS, WEAPON_MAX_LEVEL,
  passiveBonuses, powerUpBonuses, type PassiveKind, type PowerUpKind,
  type WeaponKind, type WeaponLevelStats,
} from './SurvivorsConfig';
import type { SEnemy, SurvivorsHorde } from './SurvivorsEnemies';

// ── As armas automáticas ───────────────────────────────────────────────────────
//
// A regra sagrada do VS: o jogador SÓ se move; toda arma dispara sozinha no seu
// cooldown. Cada arma daqui é um análogo direto de um clássico do VS com a arte
// da casa: Espada=Whip, Machado=Axe, Foice=Knife/Wand, Bomba=Santa Water,
// Tochas=King Bible, Aura=Garlic. Evoluções trocam os stats pela linha `evolved`
// da definição e mudam o comportamento onde indicado.

const TORCH_FLAME_KEYS = ['tiny-fire-0', 'tiny-fire-1', 'tiny-fire-2'] as const;
const TORCH_HIT_GATE_MS = 420;
const PROJECTILE_POOL = 64;
const PROJECTILE_HIT_RADIUS = 0.42;
const AXE_GRAVITY = 7.5; // tiles/s²
const AXE_LAUNCH_UP = 3.6; // tiles/s de subida inicial

export interface WeaponFrameContext {
  nowMs: number;
  playerX: number;
  playerY: number;
  facingX: number;
  facingY: number;
  tileSize: number;
  camera: WorldCamera;
  horde: SurvivorsHorde;
  /** A cena centraliza morte/loot/números/sfx do dano. */
  dealDamage: (e: SEnemy, amount: number, knockDirX: number, knockDirY: number, knockTiles?: number) => void;
}

interface OwnedWeapon {
  kind: WeaponKind;
  level: number;
  evolved: boolean;
  cooldownMs: number;
}

class Projectile {
  public active = false;
  public kind: 'axe' | 'scythe' = 'axe';
  public x = 0;
  public y = 0;
  public vx = 0;
  public vy = 0;
  public elev = 0;
  public elevV = 0;
  public spin = 0;
  public damage = 0;
  public pierce = 0;
  public ttlMs = 0;
  public readonly hit = new Set<SEnemy>();
  public sprite?: Billboard3D;
}

export class WeaponSystem {
  private readonly weapons = new Map<WeaponKind, OwnedWeapon>();
  private readonly passives = new Map<PassiveKind, number>();
  private readonly projectiles: Projectile[] = [];
  private readonly slash: SwordSlash;

  // Tochas orbitais: billboards persistentes cujo número segue o nível.
  private torchOrbs: Billboard3D[] = [];
  private torchAngle = 0;
  private torchFlameTimer = 0;
  private torchFlameFrame = 0;
  private torchSfxGateMs = 0;

  // Aura: um anel aditivo no chão seguindo o herói, com tick próprio.
  private auraRing?: Billboard3D;
  private auraTickMs = 0;

  private readonly powerBonus: ReturnType<typeof powerUpBonuses>;

  public constructor(
    private readonly scene: Phaser.Scene,
    powerUps: Readonly<Partial<Record<PowerUpKind, number>>>,
  ) {
    this.powerBonus = powerUpBonuses(powerUps);
    this.slash = new SwordSlash(scene);
  }

  // ── build/estado ─────────────────────────────────────────────────────────────

  public get bonuses() {
    const p = passiveBonuses(this.passives);
    return {
      damageMul: p.damageMul * this.powerBonus.damageMul,
      cooldownMul: p.cooldownMul * this.powerBonus.cooldownMul,
      areaMul: p.areaMul,
      moveSpeedMul: p.moveSpeedMul * this.powerBonus.moveSpeedMul,
      maxHp: PLAYER_BASE.maxHp + p.maxHpBonus + this.powerBonus.maxHpBonus,
      regenPerSec: p.regenPerSec,
      magnetRadius: PLAYER_BASE.magnetRadiusTiles * p.magnetMul * this.powerBonus.magnetMul,
      goldMul: this.powerBonus.goldMul,
      xpMul: this.powerBonus.xpMul,
      revivals: this.powerBonus.revivals,
    };
  }

  public ownedWeapons(): ReadonlyArray<{ kind: WeaponKind; level: number; evolved: boolean }> {
    return [...this.weapons.values()].map(({ kind, level, evolved }) => ({ kind, level, evolved }));
  }

  public ownedPassives(): ReadonlyArray<{ kind: PassiveKind; level: number }> {
    return [...this.passives.entries()].map(([kind, level]) => ({ kind, level }));
  }

  public hasWeapon(kind: WeaponKind): boolean {
    return this.weapons.has(kind);
  }

  public weaponLevel(kind: WeaponKind): number {
    return this.weapons.get(kind)?.level ?? 0;
  }

  public passiveLevel(kind: PassiveKind): number {
    return this.passives.get(kind) ?? 0;
  }

  public addWeapon(kind: WeaponKind): void {
    if (!this.weapons.has(kind)) {
      this.weapons.set(kind, { kind, level: 1, evolved: false, cooldownMs: 300 });
    }
  }

  public levelWeapon(kind: WeaponKind): void {
    const w = this.weapons.get(kind);
    if (w && w.level < WEAPON_MAX_LEVEL) w.level += 1;
  }

  public addPassive(kind: PassiveKind): void {
    const level = this.passives.get(kind) ?? 0;
    if (level < PASSIVE_DEFS[kind].maxLevel) this.passives.set(kind, level + 1);
  }

  /**
   * Fração de recarga restante por arma (1 = acabou de disparar, 0 = pronta) —
   * o HUD desenha o sweep de cooldown com isso. A tocha é contínua (sempre 0);
   * a aura usa o relógio do próprio tick.
   */
  public cooldownStates(): ReadonlyArray<{ kind: WeaponKind; frac: number }> {
    const out: Array<{ kind: WeaponKind; frac: number }> = [];
    for (const w of this.weapons.values()) {
      let frac = 0;
      if (w.kind === 'aura') {
        const cd = this.statsFor(w).cooldownMs;
        frac = cd > 0 ? Math.max(0, this.auraTickMs) / cd : 0;
      } else if (w.kind !== 'torch') {
        const cd = this.statsFor(w).cooldownMs;
        frac = cd > 0 ? Math.max(0, w.cooldownMs) / cd : 0;
      }
      out.push({ kind: w.kind, frac: Math.min(1, frac) });
    }
    return out;
  }

  /** Armas prontas para evoluir: nível máximo + o passivo par no inventário. */
  public evolutionsReady(): WeaponKind[] {
    const out: WeaponKind[] = [];
    for (const w of this.weapons.values()) {
      if (w.evolved || w.level < WEAPON_MAX_LEVEL) continue;
      if ((this.passives.get(WEAPON_DEFS[w.kind].evolvePassive) ?? 0) > 0) out.push(w.kind);
    }
    return out;
  }

  public evolve(kind: WeaponKind): void {
    const w = this.weapons.get(kind);
    if (w) w.evolved = true;
  }

  private statsFor(w: OwnedWeapon): WeaponLevelStats {
    const def = WEAPON_DEFS[w.kind];
    const base = w.evolved ? def.evolved : def.levels[Math.min(def.levels.length, w.level) - 1];
    const b = this.bonuses;
    return {
      damage: base.damage * b.damageMul,
      cooldownMs: base.cooldownMs * b.cooldownMul,
      area: base.area * b.areaMul,
      count: base.count,
      speed: base.speed,
    };
  }

  // ── o frame ──────────────────────────────────────────────────────────────────

  public update(deltaMs: number, ctx: WeaponFrameContext): void {
    for (const w of this.weapons.values()) {
      if (w.kind === 'torch') {
        this.updateTorch(deltaMs, w, ctx);
        continue;
      }
      if (w.kind === 'aura') {
        this.updateAura(deltaMs, w, ctx);
        continue;
      }
      w.cooldownMs -= deltaMs;
      if (w.cooldownMs > 0) continue;
      const stats = this.statsFor(w);
      w.cooldownMs = stats.cooldownMs;
      if (w.kind === 'sword') this.fireSword(w, stats, ctx);
      else if (w.kind === 'axe') this.fireAxe(stats, ctx);
      else if (w.kind === 'scythe') this.fireScythe(w, stats, ctx);
      else if (w.kind === 'bomb') this.fireBomb(stats, ctx);
    }

    this.updateProjectiles(deltaMs, ctx);
  }

  public destroy(): void {
    this.slash.destroy();
    for (const p of this.projectiles) {
      p.sprite?.destroy();
      p.sprite = undefined;
      p.active = false;
    }
    this.projectiles.length = 0;
    this.torchOrbs.forEach((o) => o.destroy());
    this.torchOrbs = [];
    this.auraRing?.destroy();
    this.auraRing = undefined;
  }

  // ── Espada (Whip): setor na direção do movimento ─────────────────────────────

  private fireSword(w: OwnedWeapon, stats: WeaponLevelStats, ctx: WeaponFrameContext): void {
    const dirs: Array<{ x: number; y: number }> = [{ x: ctx.facingX, y: ctx.facingY }];
    if (w.evolved) dirs.push({ x: -ctx.facingX, y: -ctx.facingY });

    getSoundManager().playSwordSlash();
    dirs.forEach((dir, i) => {
      const swing = (): void => {
        // Visual: o animador de arco 2D do jogo-base, no centro da tela (o herói
        // está sempre pinado lá), apontando na direção do golpe.
        const screen = ctx.camera.tileToScreen(ctx.playerX, ctx.playerY, ctx.tileSize);
        this.slash.slash(screen.x, screen.y, dir.x, dir.y, ctx.tileSize * stats.area * 0.8);

        for (const e of ctx.horde.queryCircle(ctx.playerX, ctx.playerY, stats.area)) {
          const dx = e.x - ctx.playerX;
          const dy = e.y - ctx.playerY;
          const len = Math.hypot(dx, dy) || 1;
          // Setor de ~140° — mas quem está colado no herói apanha de qualquer
          // ângulo: à queima-roupa a base da lâmina varre tudo.
          if (len < 0.75 || (dx / len) * dir.x + (dy / len) * dir.y > 0.34) {
            ctx.dealDamage(e, stats.damage, dx, dy, 0.5);
          }
        }
      };
      if (i === 0) swing();
      else this.scene.time.delayedCall(130, swing);
    });
  }

  // ── Machado (Axe): arremessos em arco que atravessam tudo ────────────────────

  private fireAxe(stats: WeaponLevelStats, ctx: WeaponFrameContext): void {
    for (let i = 0; i < stats.count; i++) {
      const p = this.acquireProjectile();
      if (!p) return;
      const spread = (i - (stats.count - 1) / 2) * 0.35;
      // O machado sobe e cai: velocidade lateral na direção olhada (com leque),
      // impulso vertical + gravidade na elevação.
      const dirX = ctx.facingX + spread * -ctx.facingY;
      const dirY = ctx.facingY + spread * ctx.facingX;
      const len = Math.hypot(dirX, dirY) || 1;
      this.launchProjectile(p, 'axe', 'axe-icon', ctx.playerX, ctx.playerY, {
        vx: (dirX / len) * stats.speed * 0.55,
        vy: (dirY / len) * stats.speed * 0.55,
        elevV: AXE_LAUNCH_UP,
        spin: 640,
        damage: stats.damage,
        pierce: Number.MAX_SAFE_INTEGER,
        ttlMs: 2400,
        size: 0.55 * stats.area,
      });
    }
  }

  // ── Foice (Knife/Wand): voa ao mais próximo, perfurando ──────────────────────

  private fireScythe(w: OwnedWeapon, stats: WeaponLevelStats, ctx: WeaponFrameContext): void {
    const target = ctx.horde.nearest(ctx.playerX, ctx.playerY);
    // Sem alvo, atira na direção do movimento (nunca desperdiça o disparo).
    const baseAngle = target
      ? Math.atan2(target.y - ctx.playerY, target.x - ctx.playerX)
      : Math.atan2(ctx.facingY, ctx.facingX);

    for (let i = 0; i < stats.count; i++) {
      const p = this.acquireProjectile();
      if (!p) return;
      const angle = baseAngle + (i - (stats.count - 1) / 2) * 0.16;
      this.launchProjectile(p, 'scythe', 'scythe-icon', ctx.playerX, ctx.playerY, {
        vx: Math.cos(angle) * stats.speed,
        vy: Math.sin(angle) * stats.speed,
        elevV: 0,
        spin: w.evolved ? 900 : 0,
        damage: stats.damage,
        pierce: w.evolved ? Number.MAX_SAFE_INTEGER : 2 + w.level,
        ttlMs: 1400,
        size: 0.5,
      });
    }
  }

  // ── Bomba (Santa Water): cai num inimigo e abre uma cratera ──────────────────

  private fireBomb(stats: WeaponLevelStats, ctx: WeaponFrameContext): void {
    for (let i = 0; i < stats.count; i++) {
      const target = ctx.horde.randomInRadius(ctx.playerX, ctx.playerY, 7.5);
      const tx = target ? target.x : ctx.playerX + Phaser.Math.FloatBetween(-4, 4);
      const ty = target ? target.y : ctx.playerY + Phaser.Math.FloatBetween(-4, 4);

      const bomb = world3d().addBillboard('bomb-item', 0, { emissive: true, castShadow: false });
      bomb.setPosition(ctx.playerX, ctx.playerY).setDisplaySize(0.5, 0.5);

      // O voo: linha reta no chão + parábola na elevação, tudo em um tween.
      const flight = { t: 0 };
      const fromX = ctx.playerX;
      const fromY = ctx.playerY;
      this.scene.tweens.add({
        targets: flight,
        t: 1,
        duration: 620 + i * 140,
        ease: 'Linear',
        onUpdate: () => {
          bomb.setPosition(fromX + (tx - fromX) * flight.t, fromY + (ty - fromY) * flight.t);
          bomb.setElevation(Math.sin(flight.t * Math.PI) * 1.6);
          bomb.setAngle(flight.t * 540);
        },
        onComplete: () => {
          bomb.destroy();
          this.explode(tx, ty, stats, ctx);
        },
      });
    }
  }

  private explode(x: number, y: number, stats: WeaponLevelStats, ctx: WeaponFrameContext): void {
    getSoundManager().playBombExplode();
    world3d().shake(180, 0.06);

    // FX: anel de choque + clarão, ambos aditivos e efêmeros.
    const ring = world3d().addBillboard(FX_RING_TEXTURE, 0, { flat: true, additive: true, emissiveBoost: 2.2 });
    ring.setTint(0xffb066).setPosition(x, y).setDisplaySize(0.6, 0.6).setAlpha(1);
    this.scene.tweens.add({
      targets: ring,
      scaleX: stats.area * 2.1,
      scaleY: stats.area * 2.1,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    const puff = world3d().addBillboard(FX_PUFF_TEXTURE, 0, {
      centered: true, additive: true, emissiveBoost: 1.8, fog: false, depthWrite: false,
    });
    puff.setTint(0xffd9a0).setPosition(x, y).setElevation(0.4).setDisplaySize(0.8, 0.8);
    this.scene.tweens.add({
      targets: puff,
      scaleX: stats.area * 1.5,
      scaleY: stats.area * 1.5,
      alpha: 0,
      duration: 380,
      ease: 'Quad.easeOut',
      onComplete: () => puff.destroy(),
    });

    for (const e of ctx.horde.queryCircle(x, y, stats.area)) {
      ctx.dealDamage(e, stats.damage, e.x - x, e.y - y, 0.8);
    }
  }

  // ── Tochas orbitais (King Bible) ────────────────────────────────────────────

  private updateTorch(deltaMs: number, w: OwnedWeapon, ctx: WeaponFrameContext): void {
    const stats = this.statsFor(w);
    const dt = deltaMs / 1000;
    this.torchAngle += dt * (w.evolved ? 3.1 : 2.2);

    // O anel de chamas acompanha o nível: cria/destrói orbes conforme o count.
    while (this.torchOrbs.length < stats.count) {
      this.torchOrbs.push(world3d().addBillboard(TORCH_FLAME_KEYS[0], 0, {
        emissive: true, emissiveBoost: 1.8, castShadow: false,
      }).setDisplaySize(0.5, 0.5));
    }
    while (this.torchOrbs.length > stats.count) this.torchOrbs.pop()?.destroy();

    // O flip de frame É a animação da chama, na cadência grossa do jogo-base.
    this.torchFlameTimer += deltaMs;
    if (this.torchFlameTimer >= 110) {
      this.torchFlameTimer = 0;
      this.torchFlameFrame = (this.torchFlameFrame + 1) % TORCH_FLAME_KEYS.length;
    }

    this.torchSfxGateMs = Math.max(0, this.torchSfxGateMs - deltaMs);

    this.torchOrbs.forEach((orb, i) => {
      const angle = this.torchAngle + (i / stats.count) * Math.PI * 2;
      const ox = ctx.playerX + Math.cos(angle) * stats.area;
      const oy = ctx.playerY + Math.sin(angle) * stats.area;
      orb.setTexture(TORCH_FLAME_KEYS[this.torchFlameFrame], 0);
      orb.setPosition(ox, oy).setElevation(0.35);

      for (const e of ctx.horde.queryCircle(ox, oy, 0.4)) {
        const last = e.lastBurnMs.get('torch') ?? -99999;
        if (ctx.nowMs - last < TORCH_HIT_GATE_MS) continue;
        e.lastBurnMs.set('torch', ctx.nowMs);
        ctx.dealDamage(e, stats.damage, e.x - ctx.playerX, e.y - ctx.playerY, 0.45);
        if (this.torchSfxGateMs <= 0) {
          this.torchSfxGateMs = 140;
          getSoundManager().playFireHit();
        }
      }
    });
  }

  // ── Aura (Garlic): o calor da fogueira que o herói carrega ──────────────────

  private updateAura(deltaMs: number, w: OwnedWeapon, ctx: WeaponFrameContext): void {
    const stats = this.statsFor(w);
    if (!this.auraRing) {
      this.auraRing = world3d().addBillboard(FX_RING_TEXTURE, 0, { flat: true, additive: true, emissiveBoost: 1.2 });
      this.auraRing.setAlpha(0.5);
    }
    const breath = 1 + Math.sin(ctx.nowMs / 300) * 0.04;
    this.auraRing
      .setTint(w.evolved ? 0xff7a2a : 0xffa64a)
      .setPosition(ctx.playerX, ctx.playerY)
      .setDisplaySize(stats.area * 2 * breath, stats.area * 2 * breath);

    this.auraTickMs -= deltaMs;
    if (this.auraTickMs > 0) return;
    this.auraTickMs = stats.cooldownMs;

    for (const e of ctx.horde.queryCircle(ctx.playerX, ctx.playerY, stats.area)) {
      ctx.dealDamage(e, stats.damage, e.x - ctx.playerX, e.y - ctx.playerY, 0.18);
      if (w.evolved) e.slowUntilMs = ctx.nowMs + 650;
    }
  }

  // ── pool de projéteis (machado/foice) ────────────────────────────────────────

  private acquireProjectile(): Projectile | null {
    for (const p of this.projectiles) {
      if (!p.active) return p;
    }
    if (this.projectiles.length < PROJECTILE_POOL) {
      const p = new Projectile();
      this.projectiles.push(p);
      return p;
    }
    return null;
  }

  private launchProjectile(
    p: Projectile,
    kind: 'axe' | 'scythe',
    texKey: string,
    x: number,
    y: number,
    opts: { vx: number; vy: number; elevV: number; spin: number; damage: number; pierce: number; ttlMs: number; size: number },
  ): void {
    p.active = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = opts.vx;
    p.vy = opts.vy;
    p.elev = 0.5;
    p.elevV = opts.elevV;
    p.spin = opts.spin;
    p.damage = opts.damage;
    p.pierce = opts.pierce;
    p.ttlMs = opts.ttlMs;
    p.hit.clear();
    if (!p.sprite) {
      p.sprite = world3d().addBillboard(texKey, 0, { emissive: true, castShadow: false });
    } else {
      p.sprite.setTexture(texKey, 0);
    }
    p.sprite
      .setPosition(x, y)
      .setDisplaySize(opts.size, opts.size)
      .setAlpha(1)
      .setAngle(0)
      .setElevation(p.elev)
      .setVisible(true);
  }

  private updateProjectiles(deltaMs: number, ctx: WeaponFrameContext): void {
    const dt = deltaMs / 1000;
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.ttlMs -= deltaMs;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'axe') {
        p.elevV -= AXE_GRAVITY * dt;
        p.elev += p.elevV * dt;
      }
      if (p.spin !== 0 && p.sprite) p.sprite.setAngle(p.sprite.angle + p.spin * dt);

      // O machado morre ao "cair no chão"; a foice, por tempo/perfuração.
      if (p.ttlMs <= 0 || (p.kind === 'axe' && p.elev < -0.3)) {
        this.releaseProjectile(p);
        continue;
      }

      p.sprite?.setPosition(p.x, p.y).setElevation(Math.max(0, p.elev));

      // Machado no alto não acerta ninguém — só na subida baixa e na queda.
      if (p.kind === 'axe' && p.elev > 1.1) continue;

      for (const e of ctx.horde.queryCircle(p.x, p.y, PROJECTILE_HIT_RADIUS)) {
        if (p.hit.has(e)) continue;
        p.hit.add(e);
        ctx.dealDamage(e, p.damage, p.vx, p.vy, 0.4);
        p.pierce -= 1;
        if (p.pierce < 0) {
          this.releaseProjectile(p);
          break;
        }
      }
    }
  }

  private releaseProjectile(p: Projectile): void {
    p.active = false;
    p.sprite?.setVisible(false);
  }
}
