import type Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_DOT_TEXTURE, FX_ICE_TEXTURE, FX_RING_TEXTURE, world3d } from '@/game/render3d/World3D';

// ── O CONGELAMENTO ───────────────────────────────────────────────────────────
//
// A bola do zora não fere: TRAVA. E "travar" é uma frase que o jogo inteiro entende — bicho,
// NPC, herói, item, árvore, arbusto, caixote —, então o sistema não pode morar em nenhum deles.
// Este gerenciador conhece UMA coisa: alvos congelados, cada um com sua posição, seu relógio e
// seus dois ganchos (onFreeze/onThaw). Quem sabe O QUE existe num tile e o que "travar" significa
// para cada coisa é o GameScene, que monta o alvo e entrega aqui (ver GameScene.freezeAtTile).
//
// As decisões que valem uma tarde:
// - **O gelo é ESTADO com desenho, nunca só desenho**: todo gate de interação pergunta
//   `frozenAt(tile)` — uma pergunta espacial, porque neste jogo tudo mora num tile. Um sistema
//   que dependesse de cada alvo lembrar do próprio flag já teria três cópias discordando.
// - **A recusa é FÍSICA** (a lei da casa: trava nova ganha um tremor, não um texto): bater num
//   tile congelado sacode o bloco (`pulse`), nunca abre balão.
// - **Fogo e gelo se anulam**: fogo que chega num tile congelado DERRETE o gelo e se gasta nisso
//   (`meltAt` — chamado pelo igniteFlammableAt antes de qualquer combustível), e a bola de gelo
//   num corpo em chamas APAGA o fogo em vez de congelar (ver GameScene.freezeEnemy). Nenhum dos
//   dois estados existe por cima do outro.
// - **O degelo é telegrafado**: nos últimos instantes o bloco TREME (o relógio que fecha é a
//   gramática de aviso desta casa — o anel do windup ensina isso desde sempre).

export const FREEZE_MS = 2400;
/** O tremor de "vai quebrar" antes do degelo — o telegrafo do fim, como todo aviso desta casa. */
const THAW_WARN_MS = 500;
/** O gelo é frio-azulado e translúcido: o alvo continua legível DENTRO do bloco. */
const ICE_TINT = 0xbfe8ff;
const ICE_ALPHA = 0.62;
/** O pop de captura: o bloco nasce maior e assenta — gelo FECHANDO sobre o alvo, não aparecendo. */
const CAPTURE_MS = 140;
/** Quanto dura o tremor de recusa (bater no bloco). */
const PULSE_MS = 200;

export type FreezeTarget = {
  /** Identidade para dedupe: o mesmo alvo não congela duas vezes (o objeto, ou `tile:x,y`). */
  id: object | string;
  x: number;
  y: number;
  /** Tamanho do bloco em tiles (árvore pede mais que item). Nada vaza do tile: teto em 1. */
  size?: number;
  elevation?: number;
  /** Alvo que pode ser DESLOCADO congelado (o arremesso desliza a estátua): o gelo vai atrás. */
  follow?: () => { x: number; y: number } | null;
  /** Alvo que pode DEIXAR de existir no meio (morreu, foi removido): o gelo some em silêncio. */
  stillValid?: () => boolean;
  onFreeze?: () => void;
  onThaw?: () => void;
};

type Entry = {
  target: FreezeTarget;
  leftMs: number;
  totalMs: number;
  ageMs: number;
  pulseMs: number;
  seed: number;
  size: number;
  block: Billboard3D;
};

export class FreezeManager {
  private readonly entries = new Map<object | string, Entry>();

  public constructor(
    private readonly scene: Phaser.Scene,
    /** O quadro (a lei: fora da tela nada fala) — congelamento longe do herói é mudo. */
    private readonly framedAt: (wx: number, wy: number) => boolean,
  ) {}

  /** Congela um alvo. `false` = recusado (já congelado, ou o alvo já não existe). */
  public freeze(target: FreezeTarget, ms = FREEZE_MS): boolean {
    if (this.entries.has(target.id)) return false;
    if (target.stillValid && !target.stillValid()) return false;
    target.onFreeze?.();

    const size = Math.min(1, target.size ?? 0.78);
    const block = world3d()
      .addBillboard(FX_ICE_TEXTURE, 0, {
        centered: true,
        emissive: true, // legível no escuro, que é onde este jogo acontece — e luz nenhuma nasce
        emissiveBoost: 1.15,
        fog: false,
        depthWrite: false,
        alphaTest: 0.02,
      })
      .setTint(ICE_TINT)
      .setPosition(target.x, target.y)
      .setElevation(target.elevation ?? 0.34)
      .setDisplaySize(size, size)
      .setAlpha(0);

    this.entries.set(target.id, {
      target,
      leftMs: ms,
      totalMs: ms,
      ageMs: 0,
      pulseMs: 0,
      seed: Math.random() * Math.PI * 2,
      size,
      block,
    });

    this.spawnFrostBurst(target.x, target.y);
    if (this.framedAt(target.x, target.y)) getSoundManager().playBladeGlance();
    return true;
  }

  public isFrozen(id: object | string): boolean {
    return this.entries.has(id);
  }

  /** Há gelo NESTE tile? — a pergunta que todo gate de interação faz (é espacial de propósito). */
  public frozenAt(wx: number, wy: number): boolean {
    return this.entryAt(wx, wy) !== undefined;
  }

  /**
   * A RECUSA FÍSICA: bater/usar/falar num tile congelado sacode o bloco. O tremor é o desenho
   * inteiro da trava (a lei da casa) — quem vê o gelo tremer e não abrir entende "espere".
   */
  public pulse(wx: number, wy: number): void {
    const entry = this.entryAt(wx, wy);
    if (!entry) return;
    entry.pulseMs = PULSE_MS;
    if (this.framedAt(wx, wy)) getSoundManager().playBladeGlance();
  }

  /** Vapor sem gelo nenhum: a bola que tentou congelar uma fogueira ACESA — o fogo vence antes
   * de o gelo existir, e o vapor é a única testemunha. */
  public steamAt(wx: number, wy: number): void {
    this.spawnSteam(wx, wy);
  }

  /**
   * FOGO DERRETE GELO: chamado pelo espalhamento ANTES de qualquer combustível. Devolve `true`
   * se derreteu algo — e aí o fogo se GASTOU nisso (o tile não acende neste pulso). Sem virar
   * vapor, congelar seria um jeito de deixar mato à prova de fogo para sempre.
   */
  public meltAt(wx: number, wy: number): boolean {
    const entry = this.entryAt(wx, wy);
    if (!entry) return false;
    this.spawnSteam(entry.target.x, entry.target.y);
    this.thaw(entry, true);
    return true;
  }

  public update(delta: number): void {
    for (const entry of this.entries.values()) {
      // O alvo pode ter deixado de existir (o corpo morreu, o item foi levado): o gelo some em
      // silêncio — estilhaço de uma coisa que já não está lá seria a resposta de um fantasma.
      if (entry.target.stillValid && !entry.target.stillValid()) {
        this.thaw(entry, true);
        continue;
      }
      entry.leftMs -= delta;
      entry.ageMs += delta;
      if (entry.pulseMs > 0) entry.pulseMs = Math.max(0, entry.pulseMs - delta);
      if (entry.leftMs <= 0) {
        this.thaw(entry, false);
        continue;
      }

      // O alvo deslocado (arremesso numa estátua) leva o gelo junto.
      const at = entry.target.follow?.();
      if (at) {
        entry.target.x = at.x;
        entry.target.y = at.y;
      }

      this.renderEntry(entry);
    }
  }

  public clear(): void {
    for (const entry of this.entries.values()) this.thaw(entry, true);
  }

  public destroy(): void {
    this.clear();
  }

  private entryAt(wx: number, wy: number): Entry | undefined {
    for (const entry of this.entries.values()) {
      if (Math.round(entry.target.x) === wx && Math.round(entry.target.y) === wy) return entry;
    }
    return undefined;
  }

  /**
   * Todo o desenho do bloco é DERIVADO dos relógios, sem um tween por estado (a economia da
   * piscada dos i-frames): o pop de captura, a respiração do brilho, o tremor de recusa e o
   * tremor de degelo saem todos daqui, por frame, escrevendo no mesmo billboard.
   */
  private renderEntry(entry: Entry): void {
    const t = this.scene.time.now;
    // O pop de captura: fecha de 1.45× para o tamanho final nos primeiros instantes.
    const settle = Math.min(1, entry.ageMs / CAPTURE_MS);
    const scale = entry.size * (1.45 - 0.45 * settle);
    // A respiração: o gelo vive um pouco (shimmer lento), senão lê como um adesivo parado.
    const shimmer = Math.sin(t * 0.004 + entry.seed) * 0.07;
    // O TELEGRAFO DO DEGELO: nos últimos instantes o bloco treme cada vez mais fundo.
    const warn = entry.leftMs < THAW_WARN_MS ? 1 - entry.leftMs / THAW_WARN_MS : 0;
    // O tremor de recusa (pulse) é mais seco e mais rápido que o de degelo.
    const pulse = entry.pulseMs > 0 ? entry.pulseMs / PULSE_MS : 0;
    const jitterX = Math.sin(t * 0.06 + entry.seed) * (warn * 0.035 + pulse * 0.05);

    entry.block
      .setPosition(entry.target.x + jitterX, entry.target.y)
      .setDisplaySize(scale, scale)
      .setAlpha(Math.min(1, settle * (ICE_ALPHA + shimmer + warn * 0.18 + pulse * 0.25)))
      .setAngle(Math.sin(t * 0.045 + entry.seed) * warn * 4);
  }

  private thaw(entry: Entry, silent: boolean): void {
    this.entries.delete(entry.target.id);
    if (!silent) {
      this.spawnShatter(entry.target.x, entry.target.y, entry.size);
      if (this.framedAt(entry.target.x, entry.target.y)) getSoundManager().playBladeGlance();
    }
    if (this.scene.tweens) this.scene.tweens.killTweensOf(entry.block);
    entry.block.destroy();
    entry.target.onThaw?.();
  }

  /** A pegada: cristais de geada saltando do ponto onde o frio fechou. */
  private spawnFrostBurst(wx: number, wy: number): void {
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + Math.random() * 0.8;
      const mote = world3d()
        .addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, emissive: true, additive: true, fog: false, depthWrite: false,
        })
        .setTint(ICE_TINT)
        .setPosition(wx, wy)
        .setElevation(0.35)
        .setDisplaySize(0.1, 0.1)
        .setAlpha(0.95);
      this.scene.tweens.add({
        targets: mote,
        x: wx + Math.cos(ang) * 0.45,
        y: wy + Math.sin(ang) * 0.3,
        elevation: 0.55 + Math.random() * 0.25,
        alpha: 0,
        scaleX: 0.4,
        scaleY: 0.4,
        duration: 260 + Math.random() * 120,
        ease: 'Cubic.easeOut',
        onComplete: () => mote.destroy(),
      });
    }
  }

  /** O degelo natural: o bloco ESTILHAÇA — cacos caindo + o anel frio abrindo (o fim de um som). */
  private spawnShatter(wx: number, wy: number, size: number): void {
    const ring = world3d()
      .addBillboard(FX_RING_TEXTURE, 0, {
        additive: true, flat: true, flatY: 0.06, fog: false, depthWrite: false,
      })
      .setTint(ICE_TINT)
      .setPosition(wx, wy)
      .setDisplaySize(size * 0.5, size * 0.5)
      .setAlpha(0.8);
    this.scene.tweens.add({
      targets: ring,
      scaleX: size * 1.5,
      scaleY: size * 1.5,
      alpha: 0,
      duration: 280,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.random() * 0.9;
      const shard = world3d()
        .addBillboard(FX_ICE_TEXTURE, 0, {
          centered: true, emissive: true, fog: false, depthWrite: false, alphaTest: 0.02,
        })
        .setTint(ICE_TINT)
        .setPosition(wx, wy)
        .setElevation(0.4)
        .setDisplaySize(0.16, 0.16)
        .setAlpha(0.9)
        .setAngle(Math.random() * 90 - 45);
      this.scene.tweens.add({
        targets: shard,
        x: wx + Math.cos(ang) * 0.4,
        y: wy + Math.sin(ang) * 0.28,
        elevation: 0.05, // os cacos CAEM — gelo tem peso, faísca não
        alpha: 0,
        duration: 300 + Math.random() * 140,
        ease: 'Quad.easeIn',
        onComplete: () => shard.destroy(),
      });
    }
  }

  /** Fogo encontrou gelo: vapor subindo — a prova de que o fogo se gastou derretendo. */
  private spawnSteam(wx: number, wy: number): void {
    for (let i = 0; i < 3; i++) {
      const puff = world3d()
        .addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, emissive: true, fog: false, depthWrite: false,
        })
        .setTint(0xe8f4f4)
        .setPosition(wx + (Math.random() - 0.5) * 0.3, wy)
        .setElevation(0.3)
        .setDisplaySize(0.16, 0.16)
        .setAlpha(0.7);
      this.scene.tweens.add({
        targets: puff,
        elevation: 0.9 + Math.random() * 0.3,
        alpha: 0,
        scaleX: 0.5,
        scaleY: 0.5,
        duration: 380 + i * 110,
        ease: 'Sine.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  }
}
