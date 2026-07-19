import Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_RING_TEXTURE, world3d } from '@/game/render3d/World3D';
import {
  ELITE_HP_MUL, ELITE_XP, ENEMY_DEFS, MAX_ALIVE_ENEMIES,
  waveForTime, type EnemyShotKind, type SEnemyDef, type SEnemyKind, type WaveDef,
} from './SurvivorsConfig';
import { ARENA_MAX_X, ARENA_MAX_Y, ARENA_MIN_X, ARENA_MIN_Y } from './survivorsWorld';

// ── A horda ────────────────────────────────────────────────────────────────────
//
// Vampire Survivors vive de CENTENAS de corpos na tela; o EnemyBase do jogo-base
// (grade + tweens por passo + um Graphics por inimigo) não escala para isso.
// Aqui os inimigos são structs em um pool fixo, movidos por velocity*delta
// diretamente nos billboards, com um spatial hash para separação e para as
// queries de acerto das armas. Nenhum GameObject Phaser por inimigo.

const SPAWN_RADIUS_TILES = 11; // logo além da borda visível
// Torretas nascem mais perto: são controle de área — fora da vista seriam mudas.
const STATIONARY_SPAWN_RADIUS_TILES = 8;
const REPOSITION_RADIUS_TILES = 17; // mais longe que isso, o inimigo "dá a volta"
const CONTACT_PAD_TILES = 0.36; // raio de contato do herói
const HURT_FLASH_MS = 90;
const SPAWN_GROW_MS = 260;
const CELL = 1; // célula do spatial hash, em tiles

// ── projéteis inimigos (mago/arqueiro/torreta) ────────────────────────────────
const SHOT_POOL = 90;
const SHOT_HIT_RADIUS_TILES = 0.38;
const SHOT_TTL_MS = 4200;
const SHOT_VISUAL: Record<EnemyShotKind, { tex: string; size: number; spinDegPerSec: number }> = {
  magic: { tex: 'magic-ball', size: 0.42, spinDegPerSec: 300 },
  arrow: { tex: 'arrow-undead', size: 0.5, spinDegPerSec: 0 },
  bullet: { tex: 'turret-bullet', size: 0.3, spinDegPerSec: 540 },
};

class EnemyShot {
  public active = false;
  public kind: EnemyShotKind = 'magic';
  public x = 0;
  public y = 0;
  public vx = 0;
  public vy = 0;
  public damage = 0;
  public ttlMs = 0;
  public sprite?: Billboard3D;
}

export class SEnemy {
  public active = false;
  /** Morto mas ainda tocando o tween de morte — o slot não pode ser reusado. */
  public dying = false;
  public kind: SEnemyKind = 'undead';
  public x = 0;
  public y = 0;
  public hp = 1;
  public maxHp = 1;
  public speed = 1;
  public damage = 1;
  public xp = 1;
  public radius = 0.3;
  public elite = false;
  public speedMul = 1;
  public hurtMs = 0;
  public spawnMs = 0;
  public knockX = 0;
  public knockY = 0;
  public bobPhase = 0;
  // Atirador: recarga do disparo e o vento de conjuração em andamento.
  public attackCdMs = 0;
  public castMs = 0;
  // Investida (aranha): relógio do ciclo espreita→bote.
  public dashClockMs = 0;
  // Kiter (mago): sentido em que rodeia o herói (+1 horário, -1 anti-horário).
  public strafeSign = 1;
  /** Última vez que ESTE inimigo feriu o herói (gate extra ao invuln global). */
  public lastContactMs = -99999;
  /** A Alma da Fogueira (aura evoluída) retarda quem toca o fogo até aqui. */
  public slowUntilMs = 0;
  /** Por-arma: última vez que a tocha orbital/aura o queimou (chave = canal). */
  public readonly lastBurnMs = new Map<string, number>();
  public sprite?: Billboard3D;
  public eliteRing?: Billboard3D;
}

export interface HordeCallbacks {
  /** Um inimigo morreu em combate (dropar gema/pickup, contar kill, sfx). */
  onKilled: (enemy: SEnemy) => void;
  /** Um inimigo está em contato com o herói neste frame. */
  onContact: (enemy: SEnemy) => void;
  /** Um projétil inimigo atingiu o herói (dano + origem, p/ knockback). */
  onShotHit: (damage: number, fromX: number, fromY: number) => void;
}

export class SurvivorsHorde {
  private readonly pool: SEnemy[] = [];
  private alive = 0;
  // Spatial hash reconstruído por frame: célula → inimigos nela.
  private readonly grid = new Map<number, SEnemy[]>();
  private readonly queryOut: SEnemy[] = [];
  // Projéteis inimigos (pool próprio — nunca interagem com os do jogador).
  private readonly shots: EnemyShot[] = [];

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly cb: HordeCallbacks,
  ) {}

  public get aliveCount(): number {
    return this.alive;
  }

  /** Todos os ativos (para o vácuo do baú de elite, debug, fim de run). */
  public forEachAlive(fn: (e: SEnemy) => void): void {
    for (const e of this.pool) if (e.active && !e.dying) fn(e);
  }

  public spawn(
    kind: SEnemyKind,
    wave: WaveDef,
    px: number,
    py: number,
    elite = false,
    /** Posição exata (filhotes do bigslime nascem onde o pai estourou). */
    at?: { x: number; y: number },
  ): SEnemy | null {
    if (this.alive >= MAX_ALIVE_ENEMIES && !elite && kind !== 'reaper' && !at) return null;
    const e = this.acquire();
    if (!e) return null;

    const def = ENEMY_DEFS[kind];
    e.active = true;
    e.dying = false;
    e.kind = kind;
    e.hp = e.maxHp = Math.round(def.hp * wave.hpMul * (elite ? ELITE_HP_MUL : 1));
    e.speed = def.speed;
    e.speedMul = wave.speedMul;
    e.damage = def.damage;
    e.xp = elite ? ELITE_XP : def.xp;
    e.radius = def.radius;
    e.elite = elite;
    e.hurtMs = 0;
    e.spawnMs = SPAWN_GROW_MS;
    e.knockX = 0;
    e.knockY = 0;
    e.bobPhase = Math.random() * Math.PI * 2;
    e.lastContactMs = -99999;
    e.slowUntilMs = 0;
    e.lastBurnMs.clear();
    // Atiradores nascem com a recarga defasada, para magos/torretas da mesma
    // leva não sincronizarem os disparos num paredão único.
    e.attackCdMs = 700 + Math.random() * (def.ranged?.cooldownMs ?? 0) * 0.5;
    e.castMs = 0;
    e.dashClockMs = def.dash ? Math.random() * def.dash.intervalMs : 0;
    e.strafeSign = Math.random() < 0.5 ? 1 : -1;

    const pos = at ?? this.pickSpawnPoint(px, py, def.stationary ? STATIONARY_SPAWN_RADIUS_TILES : SPAWN_RADIUS_TILES);
    e.x = pos.x;
    e.y = pos.y;

    if (!e.sprite) {
      e.sprite = world3d().addBillboard(def.texKey, 0, {
        groundShadow: { rx: 0.34, rz: 0.3, alpha: 0.3 },
        // Sombras projetadas reais em 130 corpos custariam caro no shadow map;
        // a horda fica só com o blob de contato.
      });
    } else {
      e.sprite.setTexture(def.texKey, 0);
    }
    e.sprite
      .setPosition(e.x, e.y)
      .setDisplaySize(0.2, 0.2)
      .setAlpha(1)
      .setAngle(0)
      .setElevation(0)
      .setVisible(true);
    e.sprite.clearTint();
    if (def.tint !== undefined && !elite) e.sprite.setTint(def.tint);
    if (elite) {
      // O anel vermelho pulsante no chão é o "sou um chefe" — o sprite continua
      // do tamanho do tile (regra da casa: nada vaza do próprio tile).
      e.sprite.setTint(0xffb0a0);
      e.eliteRing = world3d().addBillboard(FX_RING_TEXTURE, 0, { flat: true, additive: true, emissiveBoost: 1.6 });
      e.eliteRing.setTint(0xff4a3a).setDisplaySize(1.6, 1.6).setAlpha(0.85).setPosition(e.x, e.y);
    } else if (kind === 'reaper') {
      // A MORTE precisa LER como A MORTE no meio de 120 corpos: uma aura fria
      // violeta no chão a separa de qualquer esqueleto comum.
      e.eliteRing = world3d().addBillboard(FX_RING_TEXTURE, 0, { flat: true, additive: true, emissiveBoost: 2.0 });
      e.eliteRing.setTint(0x8a5aff).setDisplaySize(1.9, 1.9).setAlpha(0.95).setPosition(e.x, e.y);
    }

    this.alive += 1;
    return e;
  }

  /**
   * Aplica dano de arma. Retorna true se matou. O flash usa a hurt-texture da
   * arte quando existe (undead/bat); senão, tint branco sólido.
   */
  public hurt(e: SEnemy, amount: number, knockDirX: number, knockDirY: number, knockTiles = 0.35): boolean {
    if (!e.active || e.dying) return false;
    if (e.kind === 'reaper') {
      // A MORTE não sangra: o golpe resvala num flash frio (o sinal do jogo-base
      // para "imune"), para o jogador aprender que não há o que fazer senão correr.
      e.sprite?.setTintFill(0xaec6ff);
      e.hurtMs = HURT_FLASH_MS;
      return false;
    }
    e.hp -= amount;
    e.hurtMs = HURT_FLASH_MS;
    const def = ENEMY_DEFS[e.kind];
    if (def.hurtTexKey) e.sprite?.setTexture(def.hurtTexKey, 0);
    else e.sprite?.setTintFill(0xffffff);
    // Torreta é fincada no chão: golpes quase não a deslocam.
    const mass = def.stationary ? 0.15 : 1;
    const len = Math.hypot(knockDirX, knockDirY) || 1;
    e.knockX += (knockDirX / len) * knockTiles * 8 * mass;
    e.knockY += (knockDirY / len) * knockTiles * 8 * mass;

    if (e.hp <= 0) {
      this.kill(e, true);
      return true;
    }
    return false;
  }

  /** Morte em combate (com loot) ou limpeza silenciosa (sem loot). */
  public kill(e: SEnemy, withLoot: boolean): void {
    if (!e.active || e.dying) return;
    e.dying = true;
    this.alive -= 1;
    if (withLoot) this.cb.onKilled(e);
    e.eliteRing?.destroy();
    e.eliteRing = undefined;

    const sprite = e.sprite;
    if (!sprite) {
      this.release(e);
      return;
    }
    // O pop de impacto do jogo-base, enxuto: flash branco-quente, incha, esfarela.
    this.scene.tweens.killTweensOf(sprite);
    sprite.setTintFill(0xffffff);
    this.scene.tweens.add({
      targets: sprite,
      scaleX: sprite.scaleX * 1.3,
      scaleY: sprite.scaleY * 1.3,
      duration: 60,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (!sprite.active) return;
        sprite.clearTint();
        this.scene.tweens.add({
          targets: sprite,
          alpha: 0,
          scaleX: 0.08,
          scaleY: 0.08,
          angle: Phaser.Math.Between(-45, 45),
          duration: 200,
          ease: 'Power2.easeIn',
          onComplete: () => {
            sprite.setVisible(false);
            this.release(e);
          },
        });
      },
    });
  }

  public update(deltaMs: number, nowMs: number, px: number, py: number): void {
    const dt = deltaMs / 1000;
    this.rebuildGrid();

    for (const e of this.pool) {
      if (!e.active || e.dying) continue;
      const def = ENEMY_DEFS[e.kind];

      if (e.spawnMs > 0) e.spawnMs = Math.max(0, e.spawnMs - deltaMs);
      if (e.hurtMs > 0) {
        e.hurtMs -= deltaMs;
        if (e.hurtMs <= 0) this.restoreLook(e, def);
      }

      // Perseguição: direto ao herói (VS não tem pathfinding; o campo é aberto).
      const dxp = px - e.x;
      const dyp = py - e.y;
      const dist = Math.hypot(dxp, dyp) || 1;

      // Quem ficou para trás dá a volta: reposiciona no anel à frente do herói,
      // como no VS — a pressão nunca cai porque o jogador correu bem. A torreta
      // não dá a volta (é um lugar, não um perseguidor): some em silêncio.
      if (dist > REPOSITION_RADIUS_TILES && !e.elite && e.kind !== 'reaper') {
        if (def.stationary) {
          this.vanish(e);
          continue;
        }
        const pos = this.pickSpawnPoint(px, py, SPAWN_RADIUS_TILES);
        e.x = pos.x;
        e.y = pos.y;
        continue;
      }

      // Atirador: quando o herói entra no alcance, telegrafa (arte de conjuração
      // ou flash pálido) e dispara ao fim do vento — parado enquanto conjura.
      let casting = false;
      if (def.ranged) {
        e.attackCdMs -= deltaMs;
        if (e.castMs > 0) {
          casting = true;
          e.castMs -= deltaMs;
          if (e.castMs <= 0) {
            this.fireShots(e, def, px, py);
            if (e.hurtMs <= 0) this.restoreLook(e, def);
          }
        } else if (e.attackCdMs <= 0 && dist <= def.ranged.rangeTiles && dist > 1.1) {
          e.attackCdMs = def.ranged.cooldownMs;
          e.castMs = def.ranged.telegraphMs;
          casting = true;
          if (e.hurtMs <= 0) {
            if (def.ranged.castTexKey) e.sprite?.setTexture(def.ranged.castTexKey, 0);
            else e.sprite?.setTintFill(0xffe9b0);
          }
        }
      }

      const slowMul = nowMs < e.slowUntilMs ? 0.6 : 1;
      // A investida da aranha: espreita devagar e dispara o bote no ciclo.
      let dashMul = 1;
      if (def.dash) {
        e.dashClockMs = (e.dashClockMs + deltaMs) % def.dash.intervalMs;
        dashMul = e.dashClockMs < def.dash.durationMs ? def.dash.speedMul : def.dash.restMul;
      }
      const speedNow = e.speed * e.speedMul * slowMul * dashMul;

      let vx = 0;
      let vy = 0;
      if (casting || def.stationary) {
        // Parado: conjurando, ou a torreta que nunca anda.
      } else if (def.keepDistanceTiles) {
        // Kiter (mago): mantém-se fora do alcance da espada, rodeando o herói.
        const kd = def.keepDistanceTiles;
        if (dist > kd + 1.2) {
          vx = (dxp / dist) * speedNow;
          vy = (dyp / dist) * speedNow;
        } else if (dist < kd - 0.8) {
          vx = -(dxp / dist) * speedNow;
          vy = -(dyp / dist) * speedNow;
        } else {
          vx = (-dyp / dist) * speedNow * 0.6 * e.strafeSign;
          vy = (dxp / dist) * speedNow * 0.6 * e.strafeSign;
        }
      } else {
        // A parede de corpos: o inimigo PRESSIONA até a borda do herói e para lá —
        // nunca sobrepõe (senão o cone da espada perde a direção e o contato vira
        // um moedor). O toque acontece nessa borda, como no VS.
        const stopDist = e.radius + CONTACT_PAD_TILES - 0.08;
        if (dist > stopDist) {
          vx = (dxp / dist) * speedNow;
          vy = (dyp / dist) * speedNow;
          // Morcegos tecem: um vaivém perpendicular que faz o voo esvoaçar em
          // vez de vir em linha reta — cada um numa fase própria.
          if (def.flies) {
            const weave = Math.sin(e.bobPhase * 1.7) * speedNow * 0.55;
            vx += (-dyp / dist) * weave;
            vy += (dxp / dist) * weave;
          }
        }
      }

      // Separação: um empurrão para fora dos vizinhos da mesma célula. O(k) por
      // inimigo, e é o que transforma o "trem" em uma MARÉ que envolve o herói.
      // (A torreta é fincada: ninguém a empurra.)
      if (!def.stationary) {
        const sep = this.separation(e);
        vx += sep.x * 2.2;
        vy += sep.y * 2.2;
      }

      // Knockback de arma decai por cima da perseguição.
      if (e.knockX !== 0 || e.knockY !== 0) {
        vx += e.knockX;
        vy += e.knockY;
        const decay = Math.exp(-dt * 10);
        e.knockX *= decay;
        e.knockY *= decay;
        if (Math.abs(e.knockX) + Math.abs(e.knockY) < 0.04) {
          e.knockX = 0;
          e.knockY = 0;
        }
      }

      e.x = Phaser.Math.Clamp(e.x + vx * dt, ARENA_MIN_X + 0.4, ARENA_MAX_X - 0.4);
      e.y = Phaser.Math.Clamp(e.y + vy * dt, ARENA_MIN_Y + 0.4, ARENA_MAX_Y - 0.4);

      // Contato com o herói: o gate fino (invuln global + cadência por inimigo)
      // fica na cena; aqui só o reporte do toque.
      if (dist < e.radius + CONTACT_PAD_TILES) this.cb.onContact(e);

      this.renderEnemy(e, nowMs, dt, dxp);
    }

    this.updateShots(deltaMs, px, py);
  }

  /** Inimigos vivos num círculo — o hit-test de todas as armas. */
  public queryCircle(x: number, y: number, r: number): SEnemy[] {
    const out = this.queryOut;
    out.length = 0;
    const minCx = Math.floor((x - r) / CELL);
    const maxCx = Math.floor((x + r) / CELL);
    const minCy = Math.floor((y - r) / CELL);
    const maxCy = Math.floor((y + r) / CELL);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const cell = this.grid.get(cx * 4096 + cy);
        if (!cell) continue;
        for (const e of cell) {
          if (!e.active || e.dying) continue;
          const dx = e.x - x;
          const dy = e.y - y;
          if (dx * dx + dy * dy <= (r + e.radius) * (r + e.radius)) out.push(e);
        }
      }
    }
    return out;
  }

  /** O inimigo vivo mais próximo do ponto (alvo da foice/bomba). */
  public nearest(x: number, y: number, maxR = 12): SEnemy | null {
    let best: SEnemy | null = null;
    let bestD = maxR * maxR;
    for (const e of this.pool) {
      if (!e.active || e.dying || e.kind === 'reaper') continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** Um inimigo vivo aleatório num raio (mira da bomba). */
  public randomInRadius(x: number, y: number, r: number): SEnemy | null {
    const candidates = this.queryCircle(x, y, r).filter((e) => e.kind !== 'reaper');
    if (candidates.length === 0) return null;
    return candidates[Phaser.Math.Between(0, candidates.length - 1)];
  }

  public destroy(): void {
    for (const e of this.pool) {
      if (e.sprite) this.scene.tweens.killTweensOf(e.sprite);
      e.sprite?.destroy();
      e.eliteRing?.destroy();
      e.sprite = undefined;
      e.eliteRing = undefined;
      e.active = false;
      e.dying = false;
    }
    this.pool.length = 0;
    for (const s of this.shots) {
      s.sprite?.destroy();
      s.sprite = undefined;
      s.active = false;
    }
    this.shots.length = 0;
    this.grid.clear();
    this.alive = 0;
  }

  // ── internos ─────────────────────────────────────────────────────────────────

  /** Devolve textura+tint "de descanso" após um flash (dano/conjuração). */
  private restoreLook(e: SEnemy, def: SEnemyDef): void {
    const tex = e.castMs > 0 && def.ranged?.castTexKey ? def.ranged.castTexKey : def.texKey;
    e.sprite?.setTexture(tex, 0);
    if (e.elite) e.sprite?.setTint(0xffb0a0);
    else if (def.tint !== undefined) e.sprite?.setTint(def.tint);
    else e.sprite?.clearTint();
  }

  /** Remoção silenciosa, sem loot nem animação (torreta fora do alcance). */
  private vanish(e: SEnemy): void {
    if (!e.active || e.dying) return;
    this.alive -= 1;
    e.eliteRing?.destroy();
    e.eliteRing = undefined;
    e.sprite?.setVisible(false);
    this.release(e);
  }

  // ── projéteis inimigos ───────────────────────────────────────────────────────

  private fireShots(e: SEnemy, def: SEnemyDef, px: number, py: number): void {
    const r = def.ranged;
    if (!r) return;
    getSoundManager().playUndeadWhiff();
    if (r.radial) {
      // O leque da torreta: N balas em roda, a primeira mirada no herói — dá
      // sempre uma linha de fuga entre os raios.
      const base = Math.atan2(py - e.y, px - e.x);
      for (let i = 0; i < r.radial; i++) {
        const a = base + (i / r.radial) * Math.PI * 2;
        this.spawnShot(e, r.shot, Math.cos(a), Math.sin(a), r.shotSpeed, r.shotDamage);
      }
      return;
    }
    const dx = px - e.x;
    const dy = py - e.y;
    const d = Math.hypot(dx, dy) || 1;
    this.spawnShot(e, r.shot, dx / d, dy / d, r.shotSpeed, r.shotDamage);
  }

  private spawnShot(e: SEnemy, kind: EnemyShotKind, nx: number, ny: number, speed: number, damage: number): void {
    let s = this.shots.find((c) => !c.active) ?? null;
    if (!s) {
      if (this.shots.length >= SHOT_POOL) return;
      s = new EnemyShot();
      this.shots.push(s);
    }
    const vis = SHOT_VISUAL[kind];
    s.active = true;
    s.kind = kind;
    s.x = e.x;
    s.y = e.y;
    s.vx = nx * speed;
    s.vy = ny * speed;
    s.damage = damage;
    s.ttlMs = SHOT_TTL_MS;
    if (!s.sprite) {
      s.sprite = world3d().addBillboard(vis.tex, 0, { emissive: true, emissiveBoost: 1.4 });
    } else {
      s.sprite.setTexture(vis.tex, 0);
    }
    s.sprite
      .setPosition(s.x, s.y)
      .setDisplaySize(vis.size, vis.size)
      .setElevation(0.45)
      .setAlpha(1)
      .setVisible(true);
    // A flecha aponta na direção do voo; orbes/balas giram no updateShots.
    s.sprite.setAngle(kind === 'arrow' ? Math.atan2(ny, nx) * (180 / Math.PI) + 90 : 0);
  }

  private updateShots(deltaMs: number, px: number, py: number): void {
    const dt = deltaMs / 1000;
    for (const s of this.shots) {
      if (!s.active) continue;
      s.ttlMs -= deltaMs;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (
        s.ttlMs <= 0
        || s.x < ARENA_MIN_X || s.x > ARENA_MAX_X
        || s.y < ARENA_MIN_Y || s.y > ARENA_MAX_Y
      ) {
        this.releaseShot(s);
        continue;
      }
      const dx = s.x - px;
      const dy = s.y - py;
      if (dx * dx + dy * dy <= SHOT_HIT_RADIUS_TILES * SHOT_HIT_RADIUS_TILES) {
        this.cb.onShotHit(s.damage, s.x, s.y);
        this.releaseShot(s);
        continue;
      }
      const vis = SHOT_VISUAL[s.kind];
      s.sprite?.setPosition(s.x, s.y);
      if (vis.spinDegPerSec > 0 && s.sprite) s.sprite.setAngle(s.sprite.angle + vis.spinDegPerSec * dt);
    }
  }

  private releaseShot(s: EnemyShot): void {
    s.active = false;
    s.sprite?.setVisible(false);
  }

  private acquire(): SEnemy | null {
    for (const e of this.pool) {
      if (!e.active && !e.dying) return e;
    }
    if (this.pool.length < MAX_ALIVE_ENEMIES + 24) {
      const e = new SEnemy();
      this.pool.push(e);
      return e;
    }
    return null;
  }

  private release(e: SEnemy): void {
    e.active = false;
    e.dying = false;
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const e of this.pool) {
      if (!e.active || e.dying) continue;
      const key = Math.floor(e.x / CELL) * 4096 + Math.floor(e.y / CELL);
      const cell = this.grid.get(key);
      if (cell) cell.push(e);
      else this.grid.set(key, [e]);
    }
  }

  private separation(e: SEnemy): { x: number; y: number } {
    const key = Math.floor(e.x / CELL) * 4096 + Math.floor(e.y / CELL);
    const cell = this.grid.get(key);
    let sx = 0;
    let sy = 0;
    if (!cell) return { x: 0, y: 0 };
    let checked = 0;
    for (const other of cell) {
      if (other === e) continue;
      const dx = e.x - other.x;
      const dy = e.y - other.y;
      const minDist = e.radius + other.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 < minDist * minDist && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (minDist - d) / minDist;
        sx += (dx / d) * push;
        sy += (dy / d) * push;
      }
      // Amostra limitada: separação é feel, não física — 6 vizinhos bastam.
      if (++checked >= 6) break;
    }
    return { x: sx, y: sy };
  }

  private renderEnemy(e: SEnemy, nowMs: number, dt: number, dirToPlayerX: number): void {
    const sprite = e.sprite;
    if (!sprite) return;
    const def = ENEMY_DEFS[e.kind];

    const grow = e.spawnMs > 0 ? 1 - (e.spawnMs / SPAWN_GROW_MS) * 0.8 : 1;
    e.bobPhase += dt * (def.flies ? 9 : 5);

    let scaleX = grow;
    let scaleY = grow;
    let elevation = 0;
    if (def.flies) {
      elevation = 0.3 + Math.sin(e.bobPhase) * 0.1;
    } else if (def.hop) {
      // O pulo do slime: squash-and-stretch no lugar (a arte é um frame só).
      const s = Math.abs(Math.sin(e.bobPhase * 0.7));
      scaleY *= 0.88 + s * 0.18;
      scaleX *= 1.06 - s * 0.1;
      elevation = s * 0.08;
    }

    sprite
      .setPosition(e.x, e.y)
      .setDisplaySize(scaleX, scaleY)
      .setElevation(elevation)
      .setFlipX(dirToPlayerX < 0);

    if (e.eliteRing) {
      const pulse = 1.45 + Math.sin(nowMs / 240) * 0.18;
      e.eliteRing.setPosition(e.x, e.y).setDisplaySize(pulse, pulse);
    }
  }

  private pickSpawnPoint(px: number, py: number, radiusTiles: number): { x: number; y: number } {
    // Um anel logo fora da vista; junto ao muro, tenta outros ângulos antes de
    // aceitar o que der (nunca a menos de 6 tiles do herói).
    const minDist = Math.min(6, radiusTiles - 1);
    for (let attempt = 0; attempt < 6; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const x = Phaser.Math.Clamp(
        px + Math.cos(angle) * radiusTiles, ARENA_MIN_X + 0.6, ARENA_MAX_X - 0.6,
      );
      const y = Phaser.Math.Clamp(
        py + Math.sin(angle) * radiusTiles, ARENA_MIN_Y + 0.6, ARENA_MAX_Y - 0.6,
      );
      if (Math.hypot(x - px, y - py) >= minDist) return { x, y };
    }
    return { x: Phaser.Math.Clamp(px + radiusTiles, ARENA_MIN_X + 0.6, ARENA_MAX_X - 0.6), y: py };
  }
}

// ── O director de ondas (uma onda por minuto, como no VS) ─────────────────────

export class HordeDirector {
  private spawnTimerMs = 0;

  public update(deltaMs: number, elapsedSec: number, horde: SurvivorsHorde, px: number, py: number): void {
    const wave = waveForTime(elapsedSec);

    // Cota mínima: se a horda rareou (o jogador limpou a tela), completa em
    // rajadas curtas — a pressão do VS nunca deixa a tela esvaziar.
    if (horde.aliveCount < wave.minAlive) {
      const deficit = Math.min(5, wave.minAlive - horde.aliveCount);
      for (let i = 0; i < deficit; i++) {
        horde.spawn(wave.kinds[Phaser.Math.Between(0, wave.kinds.length - 1)], wave, px, py);
      }
    }

    this.spawnTimerMs += deltaMs;
    if (this.spawnTimerMs >= wave.spawnIntervalMs) {
      this.spawnTimerMs = 0;
      horde.spawn(wave.kinds[Phaser.Math.Between(0, wave.kinds.length - 1)], wave, px, py);
    }
  }
}
