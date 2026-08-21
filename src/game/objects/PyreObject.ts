import Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import { PYRE_LOGS_REQUIRED } from '@/game/constants';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { getStoneTexture } from '@/game/render3d/stoneTexture';
import { getWoodTexture } from '@/game/render3d/woodTexture';
import { FX_PUFF_TEXTURE, world3d, type Box3D, type FireLight3D } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

/**
 * A PIRA — a fogueira que o jogador CONSTROI.
 *
 * Ela nasce autorada como qualquer prop, mas nasce so com a BASE: uma laje de pedra e o berco
 * de vigas cruzadas. Cada graveto entregue com o X assenta uma TORA, e cada par de toras fecha
 * uma camada girada 90 graus em relacao a de baixo — o empilhamento de cabana, que e como uma
 * pira de verdade sobe. Fechada a torre, o X com a TOCHA ACESA acende.
 *
 * Ela e geometria de VERDADE (caixas com espessura, a mesma carpintaria da ponte), nunca um
 * sprite: a lei da casa e que nenhum sprite pode vazar do seu tile, e uma torre desenhada num
 * quad seria o adesivo que a montanha deixou de ser quando virou cubo. Em caixas, crescer e
 * acrescentar caixas — sem um unico frame novo de arte, e com a sombra e a luz do mundo de graca.
 *
 * O que ela deliberadamente NAO e:
 *
 * - **combustivel do sistema de fogo.** O fogo deste jogo pula para os 4 vizinhos por mato alto,
 *   arbusto seco e ponte de madeira, e lava e fonte de fogo. Se a pira entrasse nessa tabela, um
 *   incendio no mato terminaria o jogo sozinho enquanto o jogador olha para o outro lado. Acender
 *   e um gesto, nunca um acidente — por isso ela nao esta em `igniteFlammableAt`.
 * - **reversivel.** O balde apaga fogueira comum; a pira nao. Ela tambem nao se desmonta.
 *
 * Crua ela RECUSA a tocha, e a recusa e fisica (tremor + serragem), nunca legenda: o que falta
 * esta escrito na propria torre, que ainda nao chegou ao topo.
 */

/** Duas toras fecham uma camada — e a camada seguinte cruza com ela. */
const LOGS_PER_LAYER = 2;

const SLAB_SIZE = 0.86; // a laje da base, em tiles
const SLAB_H = 0.10;
const CRADLE_H = 0.12;
/** Onde a primeira tora se apoia: o topo do berco. */
const BASE_TOP = SLAB_H + CRADLE_H;

const LOG_H = 0.20; // altura de uma camada
const LOG_W = 0.30; // largura de uma tora
const LOG_LEN = 0.82; // comprimento da tora da primeira camada…
const LOG_TAPER = 0.07; // …e o quanto cada camada acima encolhe (a torre afina)
/** Afastamento das duas toras de uma mesma camada, para os dois lados do centro. */
const LOG_SPREAD = 0.24;

const DROP_FROM = 0.55; // de quanto acima do lugar dela a tora despenca
const DROP_MS = 190;

const FIRE_TEXTURES = ['campfire-0', 'campfire-1', 'campfire-2'] as const;
const FRAME_MS = 140;
/** A chama da pira e a mesma da fogueira, em escala de torre. */
const FLAME_SIZE = 1.25;
const GLOW_SCALE = 2.6;
const GLOW_TINT = 0xffbb33;
const GLOW_ALPHA = 0.38;
/** Quanto tempo o fogo leva para subir do berco ao topo. */
const CLIMB_MS = 900;

const SAWDUST_TINT = 0xd9b483;

export class PyreObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;
  /** Base, meia torre ou acesa: uma pira e um corpo, e o tile dela nunca se atravessa. */
  public readonly blocking = true;

  private readonly scene: Phaser.Scene;
  private readonly baseParts: Box3D[] = [];
  private readonly logs: Box3D[] = [];
  private lit = false;
  private flame?: Billboard3D;
  private glow?: Billboard3D;
  private fireLight?: FireLight3D;
  private animTimer?: Phaser.Time.TimerEvent;
  private frameIndex = 0;

  public constructor(
    scene: Phaser.Scene,
    worldX: number,
    worldY: number,
    logs = 0,
    lit = false,
  ) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;

    // A laje: pedra, larga, colada no chao. E o que diz "aqui e um lugar", com ou sem madeira.
    this.baseParts.push(
      world3d().addBox(SLAB_SIZE, SLAB_H, SLAB_SIZE, getStoneTexture('slab'))
        .setPosition(worldX, worldY)
        .setElevation(SLAB_H / 2),
    );
    // O berco: duas vigas escuras cruzadas, onde a primeira tora vai deitar.
    for (const side of [-1, 1]) {
      this.baseParts.push(
        world3d().addBox(0.74, CRADLE_H, 0.2, getWoodTexture('stringer'))
          .setPosition(worldX, worldY + side * 0.22)
          .setElevation(SLAB_H + CRADLE_H / 2),
      );
    }

    // O save devolve a torre pronta: as toras ja assentadas entram sem cerimonia (hidratar nao
    // e construir — doze baques na tela a cada boot seriam a mesma noticia dada duas vezes).
    const restored = Phaser.Math.Clamp(Math.floor(logs), 0, PYRE_LOGS_REQUIRED);
    for (let i = 0; i < restored; i++) this.addLog(i, false);
    if (lit && this.isComplete) this.light(true);
  }

  public get logCount(): number {
    return this.logs.length;
  }

  public get isComplete(): boolean {
    return this.logs.length >= PYRE_LOGS_REQUIRED;
  }

  public get isLit(): boolean {
    return this.lit;
  }

  /** Quantas toras ainda faltam — o que o jogo mostra pela propria altura da torre. */
  public get logsMissing(): number {
    return Math.max(0, PYRE_LOGS_REQUIRED - this.logs.length);
  }

  /**
   * Assenta UM graveto. Devolve false quando a torre ja esta fechada (o X segue adiante e a
   * recusa e desenhada por quem chamou).
   */
  public deposit(): boolean {
    if (this.isComplete || this.lit) return false;
    this.addLog(this.logs.length, true);
    getSoundManager().playBridgePlank(); // a mesma batida de tora da ponte
    return true;
  }

  /** A tora em si: posicao, tamanho e a queda. `animate` false = hidratacao do save. */
  private addLog(index: number, animate: boolean): void {
    const layer = Math.floor(index / LOGS_PER_LAYER);
    const slot = index % LOGS_PER_LAYER;
    // Camada par deita no eixo X, impar no eixo Z: e o cruzamento que segura a torre em pe (e
    // que faz a pilha ler como pira, e nao como uma pilha de tabuas).
    const alongX = layer % 2 === 0;
    const len = Math.max(0.3, LOG_LEN - layer * LOG_TAPER);
    const offset = (slot - (LOGS_PER_LAYER - 1) / 2) * LOG_SPREAD;
    const rest = BASE_TOP + layer * LOG_H + LOG_H / 2;

    const box = world3d()
      .addBox(
        alongX ? len : LOG_W,
        LOG_H * 0.92, // uma folga entre camadas, para a silhueta mostrar cada tora
        alongX ? LOG_W : len,
        getWoodTexture(slot === 0 ? 'plankA' : 'plankB', !alongX),
      )
      .setPosition(this.worldX + (alongX ? 0 : offset), this.worldY + (alongX ? offset : 0))
      .setElevation(rest);
    this.logs.push(box);

    if (!animate) return;
    box.setElevation(rest + DROP_FROM);
    this.scene.tweens.add({
      targets: box,
      elevation: rest,
      duration: DROP_MS,
      ease: 'Quad.easeIn',
      onComplete: () => this.puff(rest),
    });
  }

  /** Serragem: a tora bateu, ou a torre recusou. O mesmo po para as duas noticias. */
  private puff(elevation: number): void {
    const puff = world3d()
      .addBillboard(FX_PUFF_TEXTURE, 0, { additive: true })
      .setPosition(this.worldX, this.worldY)
      .setElevation(elevation)
      .setDisplaySize(0.5, 0.5)
      .setTint(SAWDUST_TINT)
      .setAlpha(0.55);
    this.scene.tweens.add({
      targets: puff,
      alpha: 0,
      elevation: elevation + 0.25,
      duration: 380,
      ease: 'Sine.easeOut',
      onComplete: () => puff.destroy(),
    });
  }

  /**
   * A RECUSA, que responde com fisica: a torre estremece e solta serragem. Serve para os dois
   * casos em que o X nao tem o que fazer aqui — graveto numa torre cheia, e tocha numa torre
   * que ainda nao fechou.
   */
  public refuse(): void {
    const top = this.logs[this.logs.length - 1];
    const target = top ?? this.baseParts[this.baseParts.length - 1];
    const rest = target.elevation;
    this.scene.tweens.killTweensOf(target);
    this.scene.tweens.add({
      targets: target,
      elevation: rest + 0.06,
      duration: 70,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => { target.elevation = rest; },
    });
    this.puff(rest);
  }

  /**
   * Acende — e so a torre FECHADA acende. `instant` e a hidratacao do save; no jogo o fogo SOBE
   * pelas vigas, de baixo para cima, porque uma pira que acende num frame nao parece uma pira.
   */
  public light(instant = false): boolean {
    if (this.lit || !this.isComplete) return false;
    this.lit = true;

    const top = BASE_TOP + (PYRE_LOGS_REQUIRED / LOGS_PER_LAYER) * LOG_H;
    const flameRest = top + FLAME_SIZE * 0.3;

    this.glow = world3d()
      .addBillboard(FIRE_TEXTURES[0], 0, { additive: true })
      .setPosition(this.worldX, this.worldY + 0.01)
      .setElevation(flameRest)
      .setDisplaySize(FLAME_SIZE * GLOW_SCALE, FLAME_SIZE * GLOW_SCALE)
      .setTint(GLOW_TINT)
      .setAlpha(instant ? GLOW_ALPHA : 0);
    this.flame = world3d()
      .addBillboard(FIRE_TEXTURES[0], 0, { emissive: true, emissiveBoost: 4 })
      .setPosition(this.worldX, this.worldY)
      .setElevation(instant ? flameRest : BASE_TOP)
      .setDisplaySize(
        instant ? FLAME_SIZE : FLAME_SIZE * 0.35,
        instant ? FLAME_SIZE : FLAME_SIZE * 0.35,
      );
    // A luz sai do pool fixo de fogo, como a de qualquer fogueira: nada neste jogo adiciona uma
    // luz THREE em runtime (ver FIRE_LIGHT_SLOTS).
    this.fireLight = world3d().addFireLight(this.worldX, this.worldY, true);
    this.fireLight.setIntensityScale(instant ? 1 : 0.25);
    this.startAnim();

    if (instant) return true;

    // O fogo subindo: a chama cresce e trepa do berco ao topo, e a luz cresce com ela.
    this.scene.tweens.add({
      targets: this.flame,
      elevation: flameRest,
      displayWidth: FLAME_SIZE,
      displayHeight: FLAME_SIZE,
      duration: CLIMB_MS,
      ease: 'Cubic.easeOut',
    });
    this.scene.tweens.add({
      targets: this.glow,
      alpha: GLOW_ALPHA,
      duration: CLIMB_MS,
      ease: 'Cubic.easeOut',
    });
    const ramp = { t: 0.25 };
    this.scene.tweens.add({
      targets: ramp,
      t: 1,
      duration: CLIMB_MS,
      ease: 'Cubic.easeOut',
      onUpdate: () => this.fireLight?.setIntensityScale(ramp.t),
    });
    return true;
  }

  private startAnim(): void {
    if (this.animTimer) return;
    this.animTimer = this.scene.time.addEvent({
      delay: FRAME_MS,
      loop: true,
      callback: () => {
        this.frameIndex = (this.frameIndex + 1) % FIRE_TEXTURES.length;
        this.flame?.setTexture(FIRE_TEXTURES[this.frameIndex]);
        this.glow?.setTexture(FIRE_TEXTURES[this.frameIndex]);
      },
    });
  }

  public destroy(): void {
    this.animTimer?.destroy();
    this.animTimer = undefined;
    for (const part of [...this.baseParts, ...this.logs]) {
      this.scene.tweens.killTweensOf(part);
      part.destroy();
    }
    this.baseParts.length = 0;
    this.logs.length = 0;
    if (this.flame) this.scene.tweens.killTweensOf(this.flame);
    if (this.glow) this.scene.tweens.killTweensOf(this.glow);
    this.flame?.destroy();
    this.glow?.destroy();
    this.fireLight?.destroy();
    this.flame = undefined;
    this.glow = undefined;
    this.fireLight = undefined;
  }
}
