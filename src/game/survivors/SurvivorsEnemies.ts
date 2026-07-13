import Phaser from 'phaser';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_RING_TEXTURE, world3d } from '@/game/render3d/World3D';
import {
  ELITE_HP_MUL, ELITE_XP, ENEMY_DEFS, MAX_ALIVE_ENEMIES,
  waveForTime, type SEnemyKind, type WaveDef,
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
const REPOSITION_RADIUS_TILES = 17; // mais longe que isso, o inimigo "dá a volta"
const CONTACT_PAD_TILES = 0.36; // raio de contato do herói
const HURT_FLASH_MS = 90;
const SPAWN_GROW_MS = 260;
const CELL = 1; // célula do spatial hash, em tiles

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
}

export class SurvivorsHorde {
  private readonly pool: SEnemy[] = [];
  private alive = 0;
  // Spatial hash reconstruído por frame: célula → inimigos nela.
  private readonly grid = new Map<number, SEnemy[]>();
  private readonly queryOut: SEnemy[] = [];

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

  public spawn(kind: SEnemyKind, wave: WaveDef, px: number, py: number, elite = false): SEnemy | null {
    if (this.alive >= MAX_ALIVE_ENEMIES && !elite && kind !== 'reaper') return null;
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

    const pos = this.pickSpawnPoint(px, py);
    e.x = pos.x;
    e.y = pos.y;

    if (!e.sprite) {
      e.sprite = world3d().addBillboard(def.texKey, 0, {
        groundShadow: { rx: 0.34, rz: 0.3, alpha: 0.3 },
        // Sombras projetadas reais em 130 corpos custariam caro no shadow map;
        // a horda fica só com o blob de contato.
        castShadow: false,
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
    const len = Math.hypot(knockDirX, knockDirY) || 1;
    e.knockX += (knockDirX / len) * knockTiles * 8;
    e.knockY += (knockDirY / len) * knockTiles * 8;

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
        if (e.hurtMs <= 0) {
          if (def.hurtTexKey) e.sprite?.setTexture(def.texKey, 0);
          else if (!e.elite) e.sprite?.clearTint();
          else e.sprite?.setTint(0xffb0a0);
        }
      }

      // Perseguição: direto ao herói (VS não tem pathfinding; o campo é aberto).
      const dxp = px - e.x;
      const dyp = py - e.y;
      const dist = Math.hypot(dxp, dyp) || 1;

      // Quem ficou para trás dá a volta: reposiciona no anel à frente do herói,
      // como no VS — a pressão nunca cai porque o jogador correu bem.
      if (dist > REPOSITION_RADIUS_TILES && !e.elite && e.kind !== 'reaper') {
        const pos = this.pickSpawnPoint(px, py);
        e.x = pos.x;
        e.y = pos.y;
        continue;
      }

      // A parede de corpos: o inimigo PRESSIONA até a borda do herói e para lá —
      // nunca sobrepõe (senão o cone da espada perde a direção e o contato vira
      // um moedor). O toque acontece nessa borda, como no VS.
      const stopDist = e.radius + CONTACT_PAD_TILES - 0.08;
      const chase = dist > stopDist ? 1 : 0;
      const slowMul = nowMs < e.slowUntilMs ? 0.6 : 1;
      let vx = (dxp / dist) * e.speed * e.speedMul * slowMul * chase;
      let vy = (dyp / dist) * e.speed * e.speedMul * slowMul * chase;

      // Separação: um empurrão para fora dos vizinhos da mesma célula. O(k) por
      // inimigo, e é o que transforma o "trem" em uma MARÉ que envolve o herói.
      const sep = this.separation(e);
      vx += sep.x * 2.2;
      vy += sep.y * 2.2;

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
    this.grid.clear();
    this.alive = 0;
  }

  // ── internos ─────────────────────────────────────────────────────────────────

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

  private pickSpawnPoint(px: number, py: number): { x: number; y: number } {
    // Um anel logo fora da vista; junto ao muro, tenta outros ângulos antes de
    // aceitar o que der (nunca a menos de 6 tiles do herói).
    for (let attempt = 0; attempt < 6; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const x = Phaser.Math.Clamp(
        px + Math.cos(angle) * SPAWN_RADIUS_TILES, ARENA_MIN_X + 0.6, ARENA_MAX_X - 0.6,
      );
      const y = Phaser.Math.Clamp(
        py + Math.sin(angle) * SPAWN_RADIUS_TILES, ARENA_MIN_Y + 0.6, ARENA_MAX_Y - 0.6,
      );
      if (Math.hypot(x - px, y - py) >= 6) return { x, y };
    }
    return { x: Phaser.Math.Clamp(px + SPAWN_RADIUS_TILES, ARENA_MIN_X + 0.6, ARENA_MAX_X - 0.6), y: py };
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
