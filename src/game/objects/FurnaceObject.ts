import type Phaser from 'phaser';

import { ASSET_KEYS } from '@/game/constants';
import { itemGroundVisual, type HeldItemKind } from '@/game/entities/ItemPickup';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import {
  PLACEMENT_KEY_TEXTURE, ensurePlacementKeyTexture,
} from '@/game/render3d/placementTexture';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { PropDir } from '@/game/world/worldSchema';
import type { WorldProp } from './WorldProp';

/**
 * O forno manual reduz minerio com carvao. A receita e escolhida no catalogo e paga diretamente
 * pela mochila; itens largados ao redor nunca iniciam uma fornada.
 */

const DIR_VEC: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** Os dois frames da alvenaria (ver spritefactory/sprites/furnace.mjs). */
const FRAME_COLD = 0;
const FRAME_LIT = 1;

const STONE_TINT = 0xd2d2d2;

// A boca acesa: um quad additive na frente da alvenaria, como o brilho da forja da bancada. Nao e
// uma luz THREE — a contagem de luzes deste renderer nunca muda em tempo de execucao.
const MOUTH_ELEV = 0.34;
const EMBER = 0xe7462a;
const EMBER_HOT = 0xf8e394;

/** A altura de onde os insumos saem da mao do heroi. */
const HAND_ELEV = 0.42;

const DEPTH_ITEM = 0.05;
const ITEM_SIZE = 0.5;

export type FurnaceWorldPort = {
  put(kind: HeldItemKind, x: number, y: number, units?: number): void;
  occupied(x: number, y: number): boolean;
  /** Um tile livre em volta da maquina quando a boca da frente esta ocupada. */
  landing(x: number, y: number): readonly [number, number] | null;
  /** A fornada pegou. */
  lit(): void;
  /** O sopro do fole, algumas vezes por fornada. */
  breath(): void;
  /** A esponja saiu e assentou no chao. */
  delivered(): void;
};

type FurnacePhase = 'idle' | 'smelting' | 'deliver';

const BREATHS = 3;
const DELIVER_MS = 420;

/** Tempo da fornada manual pedida no catalogo. */
const HAND_CYCLE_MS = 1600;
/** O esguicho de brasa no instante em que a peca pula da boca. */
const DELIVER_SPARKS = 5;

const ease = (t: number): number => 0.5 - Math.cos(Math.PI * t) / 2;
const arc = (t: number): number => Math.sin(Math.PI * t);

export class FurnaceObject implements WorldProp {
  private readonly body: Billboard3D;
  private glow?: Billboard3D;
  private readonly flying: Billboard3D[] = [];
  private readonly sparks = new Set<Billboard3D>();

  private phase: FurnacePhase = 'idle';
  private elapsed = 0;
  private aliveMs = 0;
  private frame = FRAME_COLD;
  private breathsPlayed = 0;
  /** O keycap "Z" que anuncia que esta maquina responde ao A. */
  private hint?: Phaser.GameObjects.Image;

  /** Quantas fornadas ele fez. Publico: e o que o playtest observa da peca. */
  public smeltCount = 0;
  /** O que a fornada manual esta produzindo e quantas unidades ela entrega. */
  private handProduct: HeldItemKind | null = null;
  private handUnits = 1;
  /** O tile escolhido para a entrega em curso (ver pickDeliverTile). Congelado durante o voo. */
  private deliverTo: readonly [number, number] | null = null;
  /** A fornada pediu fogo e ainda nao teve voz: quem tem o port e o update, nao o gesto. */
  private pendingLit = false;
  /**
   * De onde cada carga voando partiu — tile e altura da mao do heroi.
   */
  private chargeFrom: Array<readonly [number, number, number]> = [];

  public constructor(
    private readonly scene: Phaser.Scene,
    public readonly worldX: number,
    public readonly worldY: number,
    public readonly dir: PropDir = 1,
    public readonly playerBuilt = false,
  ) {
    this.body = world3d()
      .addBillboard(ASSET_KEYS.furnace, FRAME_COLD, { groundShadow: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(1, 1)
      .setTint(STONE_TINT);

  }

  public get blocking(): boolean { return true; }

  /** A boca por onde a peca pronta sai. */
  public get outputTile(): readonly [number, number] {
    const [vx, vy] = DIR_VEC[this.dir];
    return [this.worldX + vx, this.worldY + vy];
  }

  public get isBusy(): boolean { return this.phase !== 'idle'; }
  public get currentPhase(): FurnacePhase { return this.phase; }
  public get currentFrame(): number { return this.frame; }

  public update(deltaMs: number, port: FurnaceWorldPort, effectsVisible: boolean): void {
    this.aliveMs += deltaMs;
    this.elapsed += deltaMs;

    switch (this.phase) {
      case 'idle': {
        this.pose(FRAME_COLD);
        this.fadeGlow(deltaMs);
        break;
      }

      case 'smelting': {
        if (this.pendingLit) {
          this.pendingLit = false;
          if (effectsVisible) port.lit();
        }
        const t = Math.min(1, this.elapsed / HAND_CYCLE_MS);
        this.pose(FRAME_LIT);
        this.moveCharge(ease(Math.min(1, t * 2.6)));
        // O calor SOBE e desce: a fornada pega, ruge no meio e cai. Um brilho constante leria
        // como lampada acesa, e nao como coisa queimando.
        this.pulseGlow(0.45 + 0.55 * arc(t), effectsVisible);
        const due = Math.min(BREATHS, Math.floor(t * BREATHS) + 1);
        while (this.breathsPlayed < due) {
          this.breathsPlayed += 1;
          if (effectsVisible) {
            port.breath();
            this.spawnSparks(2);
            // O FOLE SACODE A ALVENARIA. O sopro era so som e faisca; um forno que ruge e nao se
            // mexe le como uma lampada com efeito sonoro. O tranco e o mesmo `bump` da entrega —
            // dois graus, sem escala nenhuma (nada pode vazar do tile).
            this.bump();
          }
        }
        if (t >= 1) {
          this.clearFlying();
          this.enter('deliver');
          if (this.handProduct) this.spawnProduct(this.handProduct);
          // A BRASA ESGUICHA DA BOCA quando a peca nasce: e o instante que o jogador esta esperando
          // desde que confirmou no catalogo, e ate aqui ele era o unico da fornada sem nada na tela.
          if (effectsVisible) this.spawnSparks(DELIVER_SPARKS, MOUTH_ELEV);
        }
        break;
      }

      case 'deliver': {
        // A pergunta se refaz aqui: a fornada inteira se passou desde a checagem do idle, e
        // qualquer coisa pode ter ocupado a saida nesse meio tempo.
        this.deliverTo ??= this.pickDeliverTile(port);
        if (!this.deliverTo) {
          // ENTUPIDO: a peca fica visivel na BOCA, quicando, ate haver onde pousar. E uma recusa
          // fisica — o jogador ve o que a maquina esta segurando e por que ela nao larga.
          this.pose(FRAME_LIT);
          this.pulseGlow(0.3, effectsVisible);
          this.holdProduct();
          this.elapsed = 0;
          break;
        }
        const [tx, ty] = this.deliverTo;
        const t = Math.min(1, this.elapsed / DELIVER_MS);
        this.pose(FRAME_LIT);
        this.moveProduct(t, tx, ty);
        this.fadeGlow(deltaMs);
        if (t >= 1) {
          if (this.handProduct) port.put(this.handProduct, tx, ty, this.handUnits);
          this.handProduct = null;
          this.handUnits = 1;
          this.deliverTo = null;
          this.smeltCount += 1;
          this.clearFlying();
          if (effectsVisible) {
            port.delivered();
            world3d().shake(70, 0.005);
          }
          this.enter('idle');
        }
        break;
      }
    }
  }

  /**
   * O keycap "Z" sobre a alvenaria quando o heroi a encara. E o mesmo da bancada, e por isso ele
   * mora em `placementTexture`: as duas maquinas que RESPONDEM ao A usam o mesmo anuncio, e uma
   * terceira que respondesse teria de usar o mesmo tambem.
   */
  public renderHint(tileSize: number, camera: WorldCamera, show: boolean, timeMs: number): void {
    if (!show) { this.hint?.setVisible(false); return; }
    if (!this.hint) {
      ensurePlacementKeyTexture(this.scene, isTouchDevice());
      this.hint = this.scene.add.image(0, 0, PLACEMENT_KEY_TEXTURE).setOrigin(0.5, 1).setVisible(false);
    }
    const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    const px = Math.max(1, Math.round(tileSize / 24));
    const bob = Math.round(Math.sin(timeMs / 280) * px);
    this.hint.setVisible(true).setScale(px)
      .setPosition(screen.x, screen.y - tileSize - px * 2 + bob);
  }

  /**
   * A FORNADA PEDIDA NO CATALOGO — o Z escolheu, a MAQUINA trabalha.
   *
   * Devolve `false` se ele ja esta trabalhando — e ai o catalogo recusa com o tranco de sempre, o
   * que e honesto: a maquina esta ocupada e isso esta na tela, rugindo.
   *
   * `from` e o tile de quem pediu (o heroi): a carga tem de sair de ONDE ela estava, e ela estava
   * na mochila dele. Sem isso, dois itens apareceriam do nada no ar em frente a boca.
   */
  public startHandSmelt(
    product: HeldItemKind,
    units: number,
    inputs: readonly HeldItemKind[],
    from: readonly [number, number],
  ): boolean {
    if (this.phase !== 'idle') return false;
    this.handProduct = product;
    this.handUnits = Math.max(1, units);
    const charge = inputs.slice(0, 2) as HeldItemKind[];
    if (charge.length > 0) {
      // As duas cargas partem do MESMO tile (a mao do heroi) — o desencontro que impede uma de
      // esconder a outra e o atraso que `moveCharge` ja da a segunda, mais meio passo lateral.
      this.spawnCharge(
        charge,
        charge.map((_, i) => [from[0] + (i === 0 ? -0.16 : 0.16), from[1]] as const),
        HAND_ELEV,
      );
    }
    this.enter('smelting');
    this.breathsPlayed = 0;
    this.pendingLit = true;
    this.bump();
    return true;
  }

  /**
   * ONDE A PECA PRONTA POUSA. Tenta a boca da frente; se estiver entupida (um item que ja saiu,
   * apanhou, o proprio heroi parado ali), ela pousa num vizinho livre em vez de esperar. Sem isso,
   * fundir duas vezes seguidas deixaria a segunda peca presa dentro da maquina.
   */
  private pickDeliverTile(port: FurnaceWorldPort): readonly [number, number] | null {
    const [ox, oy] = this.outputTile;
    if (!port.occupied(ox, oy)) return [ox, oy];
    return port.landing(this.worldX, this.worldY);
  }

  public bump(): void {
    this.scene.tweens.killTweensOf(this.body);
    this.scene.tweens.add({
      targets: this.body,
      angle: { from: -2, to: 2 },
      duration: 44,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.body.setAngle(0),
    });
  }

  private enter(next: FurnacePhase): void {
    this.phase = next;
    this.elapsed = 0;
  }

  private pose(frame: number): void {
    if (this.frame === frame) return;
    this.frame = frame;
    this.body.setTexture(ASSET_KEYS.furnace, frame);
  }

  /**
   * A carga voando da mao do heroi para a boca usa a arte de `itemGroundVisual`.
   * Duas tabelas de sprite para o mesmo item e como uma delas envelhece errada.
   */
  private spawnCharge(
    kinds: readonly HeldItemKind[],
    origins: readonly (readonly [number, number])[],
    elev = HAND_ELEV,
  ): void {
    kinds.forEach((kind, i) => {
      const [sx, sy] = origins[i] ?? origins[origins.length - 1];
      this.chargeFrom.push([sx, sy, elev]);
      const visual = itemGroundVisual(kind);
      this.flying.push(world3d()
        .addBillboard(visual.texture, visual.frame, { emissive: true, centered: true })
        .setPosition(sx, sy + DEPTH_ITEM)
        .setElevation(elev)
        .setDisplaySize(ITEM_SIZE, ITEM_SIZE));
    });
  }

  private moveCharge(k: number): void {
    this.flying.forEach((bb, i) => {
      const [sx, sy, se] = this.chargeFrom[i] ?? [this.worldX, this.worldY, HAND_ELEV];
      const t = Math.max(0, Math.min(1, (k - (i === 0 ? 0 : 0.16)) / (i === 0 ? 1 : 0.84)));
      bb.setPosition(sx + (this.worldX - sx) * t, sy + (this.worldY - sy) * t + DEPTH_ITEM)
        .setElevation(se + (MOUTH_ELEV - se) * t + 0.2 * arc(t))
        .setDisplaySize(ITEM_SIZE * (1 - t * 0.9), ITEM_SIZE * (1 - t * 0.9));
    });
  }

  /** A peca pedida no catalogo nascendo na boca. */
  private spawnProduct(kind: HeldItemKind): void {
    const visual = itemGroundVisual(kind);
    this.flying.push(world3d()
      .addBillboard(visual.texture, visual.frame, { emissive: true, centered: true })
      .setPosition(this.worldX, this.worldY + DEPTH_ITEM)
      .setElevation(MOUTH_ELEV)
      .setDisplaySize(0.02, 0.02));
  }

  private holdProduct(): void {
    const bb = this.flying[0];
    if (!bb) return;
    bb.setPosition(this.worldX, this.worldY + DEPTH_ITEM)
      .setElevation(MOUTH_ELEV + Math.sin(this.aliveMs * 0.004) * 0.03)
      .setDisplaySize(ITEM_SIZE, ITEM_SIZE);
  }

  private moveProduct(t: number, ox: number, oy: number): void {
    const bb = this.flying[0];
    if (!bb) return;
    const born = Math.min(1, t / 0.25);
    const fly = Math.max(0, (t - 0.2) / 0.8);
    bb.setPosition(
      this.worldX + (ox - this.worldX) * ease(fly),
      this.worldY + (oy - this.worldY) * ease(fly) + DEPTH_ITEM * (1 - fly),
    )
      .setElevation(MOUTH_ELEV + 0.26 * arc(fly) - (MOUTH_ELEV - 0.1) * fly)
      .setDisplaySize(ITEM_SIZE * born, ITEM_SIZE * born);
  }

  private clearFlying(): void {
    for (const bb of this.flying) bb.destroy();
    this.flying.length = 0;
    this.chargeFrom.length = 0;
  }

  private pulseGlow(strength: number, effectsVisible: boolean): void {
    if (!effectsVisible) { this.glow?.setAlpha(0); return; }
    if (!this.glow) {
      this.glow = world3d()
        .addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, additive: true, fog: false, depthWrite: false,
        })
        .setTint(EMBER)
        .setPosition(this.worldX, this.worldY + 0.03)
        .setElevation(MOUTH_ELEV);
    }
    const flicker = 0.8 + 0.2 * Math.sin(this.aliveMs * 0.019);
    this.glow
      .setAlpha(Math.min(0.9, strength * flicker))
      .setDisplaySize(0.8 * strength + 0.25, 0.5 * strength + 0.2);
  }

  private fadeGlow(deltaMs: number): void {
    if (!this.glow) return;
    const next = this.glow.alpha - deltaMs / 300;
    if (next <= 0) { this.glow.destroy(); this.glow = undefined; return; }
    this.glow.setAlpha(next);
  }

  /**
   * A brasa subindo. `from` e a altura de onde ela sai: o sopro do fole sobe pela CHAMINE (0,9,
   * acima da alvenaria) e o esguicho da entrega sai pela BOCA (a mesma altura da peca), porque as
   * duas coisas contam eventos diferentes — uma e a maquina respirando, a outra e a peca nascendo.
   */
  private spawnSparks(count: number, from = 0.9): void {
    for (let i = 0; i < count; i += 1) {
      const spark = world3d()
        .addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, additive: true, emissive: true, fog: false, depthWrite: false,
        })
        .setTint(i % 2 === 0 ? EMBER_HOT : EMBER)
        .setPosition(this.worldX + (Math.random() - 0.5) * 0.25, this.worldY + DEPTH_ITEM)
        .setElevation(from)
        .setDisplaySize(0.05, 0.05);
      this.sparks.add(spark);
      this.scene.tweens.add({
        targets: spark,
        elevation: from + 0.45 + Math.random() * 0.25,
        alpha: 0,
        duration: 620 + i * 90,
        ease: 'Quad.easeOut',
        onComplete: () => { this.sparks.delete(spark); spark.destroy(); },
      });
    }
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.body);
    this.body.destroy();
    this.hint?.destroy();
    this.hint = undefined;
    this.clearFlying();
    this.glow?.destroy();
    this.glow = undefined;
    for (const spark of this.sparks) {
      this.scene.tweens.killTweensOf(spark);
      spark.destroy();
    }
    this.sparks.clear();
  }
}
