import Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import { ASSET_KEYS, ELECTRONIC_GATE_FRAMES } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

// O portao e FAIL-SAFE: energia ergue a grade; falta de energia devolve o peso ao chao. A
// colisao acompanha o VAO fisico, nao o sinal — ligar o cabo nao teleporta uma parede para fora.
const OPEN_MS = 760;
const CLOSE_MS = 560;
const PASSABLE_AT = 0.86;

const POWER_GREEN = 0x7dde99;
const POWER_OFF = 0x454b52;
const HAZARD_GOLD = 0xf1cc36;

/**
 * Portao eletrico 100% sprite: um Billboard3D 16x16 e quatro poses discretas de grade em dois
 * bancos (sem/com energia). Nenhuma geometria Three.js compoe o corpo; a animacao troca pixels
 * inteiros, igual a agua, fogueira e demais props retro do jogo.
 */
export class ElectronicGateObject implements WorldProp {
  private readonly sprite: Billboard3D;
  private readonly effects = new Set<Billboard3D>();

  private powered = false;
  private open01 = 0;
  private moving = false;
  private phase = 0;
  private dead = false;

  public constructor(
    private readonly scene: Phaser.Scene,
    public readonly worldX: number,
    public readonly worldY: number,
  ) {
    this.sprite = world3d()
      .addBillboard(ASSET_KEYS.electronicGate, ELECTRONIC_GATE_FRAMES.off, {
        groundShadow: true,
        // Aberto, o heroi pode ocupar o MESMO tile. A camada ground resolve a ordem do par sem
        // z-fight, a regra obrigatoria para todo billboard walkable do projeto.
        depthLayer: 'ground',
      })
      .setPosition(worldX, worldY)
      .setDisplaySize(1, 1);
  }

  /** A passagem so libera quando a borda inferior da grade realmente saiu do corpo do heroi. */
  public get blocking(): boolean { return this.open01 < PASSABLE_AT; }
  public get isPowered(): boolean { return this.powered; }
  public get isOpen(): boolean { return this.open01 >= 0.999; }
  public get isMoving(): boolean { return this.moving; }
  public get openness(): number { return this.open01; }
  public get frame(): number {
    return (this.powered ? ELECTRONIC_GATE_FRAMES.powered : ELECTRONIC_GATE_FRAMES.off) + this.phase;
  }

  public update(deltaMs: number, powered: boolean, effectsVisible: boolean): void {
    if (this.dead) return;
    if (powered !== this.powered) this.setPowered(powered, effectsVisible);

    const before = this.open01;
    const rate = deltaMs / (this.powered ? OPEN_MS : CLOSE_MS);
    this.open01 = Phaser.Math.Clamp(this.open01 + (this.powered ? rate : -rate), 0, 1);
    this.moving = Math.abs(this.open01 - before) > 0.00001;

    // Quatro poses deliberadas — nada de escala/fade subpixel. Os limites deixam a pose aberta
    // coincidir com o limiar de colisao, portanto o que o olho ve e o que o jogo bloqueia.
    const nextPhase = this.open01 >= PASSABLE_AT ? 3
      : this.open01 >= 0.56 ? 2
        : this.open01 >= 0.26 ? 1 : 0;
    if (nextPhase !== this.phase) {
      this.phase = nextPhase;
      this.sprite.setTexture(ASSET_KEYS.electronicGate, this.frame);
    }

    const reachedOpen = before < 1 && this.open01 === 1;
    const reachedClosed = before > 0 && this.open01 === 0;
    if ((reachedOpen || reachedClosed) && effectsVisible) {
      getSoundManager().playElectronicGateStop(reachedOpen);
      world3d().shake(reachedOpen ? 90 : 150, reachedOpen ? 0.006 : 0.012);
    }
  }

  /** Feedback de parede: o heroi bateu numa grade sem energia, nao numa colisao invisivel. */
  public bump(): void {
    if (!this.blocking || this.dead) return;
    getSoundManager().playElectronicGateDenied();
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -2, to: 2 },
      duration: 38,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.sprite.setAngle(0),
    });
  }

  private setPowered(powered: boolean, effectsVisible: boolean): void {
    this.powered = powered;
    this.sprite.setTexture(ASSET_KEYS.electronicGate, this.frame);
    if (!effectsVisible) return;
    getSoundManager().playElectronicGateMotor(powered);
    this.spawnPowerSparks(powered ? POWER_GREEN : POWER_OFF);
  }

  /** Quatro pixels eletricos soltos na lampada; sao billboards de efeito, nao partes 3D do prop. */
  private spawnPowerSparks(tint: number): void {
    for (let i = 0; i < 4; i += 1) {
      const spark = world3d()
        .addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, additive: true, emissive: true, fog: false, depthWrite: false,
        })
        .setTint(i === 0 ? HAZARD_GOLD : tint)
        .setPosition(this.worldX - 0.27, this.worldY + 0.01)
        .setElevation(0.68)
        .setDisplaySize(0.045, 0.045);
      this.effects.add(spark);
      this.scene.tweens.add({
        targets: spark,
        x: spark.x + (Math.random() - 0.5) * 0.22,
        y: spark.y + (Math.random() - 0.5) * 0.12,
        elevation: 0.82 + Math.random() * 0.16,
        alpha: 0,
        duration: 240 + i * 50,
        delay: i * 28,
        ease: 'Quad.easeOut',
        onComplete: () => this.retireEffect(spark),
      });
    }
  }

  private retireEffect(effect: Billboard3D): void {
    this.effects.delete(effect);
    effect.destroy();
  }

  public destroy(): void {
    this.dead = true;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
    for (const effect of this.effects) {
      this.scene.tweens.killTweensOf(effect);
      effect.destroy();
    }
    this.effects.clear();
  }
}
