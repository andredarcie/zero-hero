import type * as Engine from '@/game/engine';

import { ASSET_KEYS } from '@/game/constants';
import { itemGroundVisual, type HeldItemKind } from '@/game/entities/ItemPickup';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { PropDir } from '@/game/world/worldSchema';
import type { WorldProp } from './WorldProp';
import { FurnaceEffects, MOUTH_ELEV, HAND_ELEV, DEPTH_ITEM, ITEM_SIZE, ease, arc } from './FurnaceEffects';

/**
 * O FORNO DA THEA — o único do vale, fixo ao lado dela, e o GUIA da quest (pedido do autor). Não há
 * catálogo: ele sabe a ordem certa (AstronomerQuest.furnaceNeed), pede um item de cada vez (o balão
 * sobre ele), engole o que o herói entrega (`swallow`) e, quando a receita fecha, ruge e devolve o
 * resultado pela boca (`startHandSmelt`). Não se recolhe.
 */

const DIR_VEC: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** Os dois frames da alvenaria (ver spritefactory/sprites/furnace.mjs). */
const FRAME_COLD = 0;
const FRAME_LIT = 1;

const STONE_TINT = 0xd2d2d2;

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

export class FurnaceObject implements WorldProp {
  private readonly body: Billboard3D;
  public glow?: Billboard3D;
  public readonly sparks = new Set<Billboard3D>();
  /** Os itens a caminho da boca (ver swallow). */
  private readonly swallowing = new Set<Billboard3D>();

  private phase: FurnacePhase = 'idle';
  private elapsed = 0;
  public aliveMs = 0;
  private frame = FRAME_COLD;
  private breathsPlayed = 0;

  /**
   * Há fogo esperando lá dentro (o carvão aceso à espera do minério, a areia à espera da cinza): parado, ele
   * fica com a boca em brasa, e não com cara de apagado. Quem diz é a quest, a cada quadro.
   */
  public kindled = false;
  /** Quantas fornadas ele fez. Publico: e o que o playtest observa da peca. */
  public smeltCount = 0;
  /** O que a fornada manual esta produzindo e quantas unidades ela entrega. */
  private handProduct: HeldItemKind | null = null;
  private handUnits = 1;
  /** O tile escolhido para a entrega em curso (ver pickDeliverTile). Congelado durante o voo. */
  private deliverTo: readonly [number, number] | null = null;
  /** A fornada pediu fogo e ainda nao teve voz: quem tem o port e o update, nao o gesto. */
  private pendingLit = false;
  /** A carga voando, o produto, o brilho e as faíscas. (ver FurnaceEffects) */
  private readonly fx = new FurnaceEffects(this);

  public constructor(
    public readonly scene: Engine.Scene,
    public readonly worldX: number,
    public readonly worldY: number,
    public readonly dir: PropDir = 1,
    public readonly playerBuilt = false,
  ) {
    this.body = world3d()
      .objects.addBillboard(ASSET_KEYS.furnace, FRAME_COLD, { groundShadow: true })
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

  /**
   * A fornada que ainda nao saiu da boca, e onde ela vai pousar. Os insumos ja sairam da mochila
   * quando ela comecou, entao o save a guarda como se ja estivesse no chao: fechar o jogo no meio
   * de uma fornada nao pode sumir com o minerio.
   */
  public get pendingProduct(): { kind: HeldItemKind; units: number; tile: readonly [number, number] } | null {
    if (this.phase === 'idle' || !this.handProduct) return null;
    return { kind: this.handProduct, units: this.handUnits, tile: this.deliverTo ?? this.outputTile };
  }
  public get currentPhase(): FurnacePhase { return this.phase; }
  public get currentFrame(): number { return this.frame; }

  public update(deltaMs: number, port: FurnaceWorldPort, effectsVisible: boolean): void {
    this.aliveMs += deltaMs;
    this.elapsed += deltaMs;

    switch (this.phase) {
      case 'idle': {
        this.pose(this.kindled ? FRAME_LIT : FRAME_COLD);
        if (this.kindled) this.fx.pulseGlow(0.3 + 0.06 * Math.sin(this.aliveMs * 0.004), effectsVisible);
        else this.fx.fadeGlow(deltaMs);
        break;
      }

      case 'smelting': {
        if (this.pendingLit) {
          this.pendingLit = false;
          if (effectsVisible) port.lit();
        }
        const t = Math.min(1, this.elapsed / HAND_CYCLE_MS);
        this.pose(FRAME_LIT);
        this.fx.moveCharge(ease(Math.min(1, t * 2.6)));
        // O calor SOBE e desce: a fornada pega, ruge no meio e cai. Um brilho constante leria
        // como lampada acesa, e nao como coisa queimando.
        this.fx.pulseGlow(0.45 + 0.55 * arc(t), effectsVisible);
        const due = Math.min(BREATHS, Math.floor(t * BREATHS) + 1);
        while (this.breathsPlayed < due) {
          this.breathsPlayed += 1;
          if (effectsVisible) {
            port.breath();
            this.fx.spawnSparks(2);
            // O FOLE SACODE A ALVENARIA. O sopro era so som e faisca; um forno que ruge e nao se
            // mexe le como uma lampada com efeito sonoro. O tranco e o mesmo `bump` da entrega —
            // dois graus, sem escala nenhuma (nada pode vazar do tile).
            this.bump();
          }
        }
        if (t >= 1) {
          this.fx.clearFlying();
          // Fornada sem peça (o carvão que fica aceso lá dentro, à espera do minério): ela pega, ruge
          // e assenta, e nada pula da boca.
          if (!this.handProduct) {
            this.smeltCount += 1;
            this.enter('idle');
            break;
          }
          this.enter('deliver');
          if (this.handProduct) this.fx.spawnProduct(this.handProduct);
          // A BRASA ESGUICHA DA BOCA quando a peca nasce: e o instante que o jogador esta esperando
          // desde que confirmou no catalogo, e ate aqui ele era o unico da fornada sem nada na tela.
          if (effectsVisible) this.fx.spawnSparks(DELIVER_SPARKS, MOUTH_ELEV);
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
          this.fx.pulseGlow(0.3, effectsVisible);
          this.fx.holdProduct();
          this.elapsed = 0;
          break;
        }
        const [tx, ty] = this.deliverTo;
        const t = Math.min(1, this.elapsed / DELIVER_MS);
        this.pose(FRAME_LIT);
        this.fx.moveProduct(t, tx, ty);
        this.fx.fadeGlow(deltaMs);
        if (t >= 1) {
          if (this.handProduct) port.put(this.handProduct, tx, ty, this.handUnits);
          this.handProduct = null;
          this.handUnits = 1;
          this.deliverTo = null;
          this.smeltCount += 1;
          this.fx.clearFlying();
          if (effectsVisible) {
            port.delivered();
            world3d().cam.shake(70, 0.002);
          }
          this.enter('idle');
        }
        break;
      }
    }
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
    product: HeldItemKind | null,
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
      this.fx.spawnCharge(
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

  /**
   * O FORNO GUIA ENGOLE UM ITEM (pedido do autor: o herói só entrega, um de cada vez, o que ele pede).
   * O item sai da mão do herói, faz um arco até a boca e some lá dentro; a alvenaria dá o tranco e cospe
   * duas brasas. Nada disto muda o jogo: quem guarda o que entrou é a quest (AstronomerQuest).
   */
  public swallow(kind: HeldItemKind, from: readonly [number, number]): void {
    const visual = itemGroundVisual(kind);
    const bb = world3d()
      .objects.addBillboard(visual.texture, visual.frame, { emissive: true, centered: true })
      .setPosition(from[0], from[1] + DEPTH_ITEM)
      .setElevation(HAND_ELEV)
      .setDisplaySize(ITEM_SIZE, ITEM_SIZE);
    this.swallowing.add(bb);
    const k = { t: 0 };
    this.scene.tweens.add({
      targets: k,
      t: 1,
      duration: 380,
      ease: 'Sine.easeIn',
      onUpdate: () => {
        const t = k.t;
        bb.setPosition(from[0] + (this.worldX - from[0]) * t, from[1] + (this.worldY - from[1]) * t + DEPTH_ITEM)
          .setElevation(HAND_ELEV + (MOUTH_ELEV - HAND_ELEV) * t + 0.25 * arc(t))
          .setDisplaySize(ITEM_SIZE * (1 - 0.9 * t), ITEM_SIZE * (1 - 0.9 * t));
      },
      onComplete: () => {
        this.swallowing.delete(bb);
        bb.destroy();
        this.bump();
        this.fx.spawnSparks(2, MOUTH_ELEV);
      },
    });
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

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.body);
    this.body.destroy();
    this.fx.clearFlying();
    this.glow?.destroy();
    this.glow = undefined;
    for (const spark of this.sparks) {
      this.scene.tweens.killTweensOf(spark);
      spark.destroy();
    }
    this.sparks.clear();
    for (const bb of this.swallowing) bb.destroy();
    this.swallowing.clear();
  }
}
