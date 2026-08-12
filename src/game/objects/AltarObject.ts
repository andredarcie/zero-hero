import type Phaser from 'phaser';

import { ASSET_KEYS, BLOOM_BLOWS } from '@/game/constants';
import { itemGroundVisual, type HeldItemKind } from '@/game/entities/ItemPickup';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import {
  PLACEMENT_KEY_TEXTURE, ensurePlacementKeyTexture,
} from '@/game/render3d/placementTexture';
import { FX_DOT_TEXTURE, FX_RING_TEXTURE, world3d } from '@/game/render3d/World3D';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { WorldProp } from './WorldProp';
import { hammerResult, isHammerable } from './hammering';

/**
 * O ALTAR — a bigorna que não é máquina.
 *
 * A cadeia do ferro tinha dois lugares para transformar a esponja em barra, e nenhum dos dois era
 * um LUGAR: o martinete (que cobra roda d'água, engrenagem e uma rede elétrica inteira antes de
 * existir) e o CHÃO, onde a peça cai e o jogador martela onde ela parou. O chão funciona, mas não
 * ensina nada — nada no mundo diz "trabalhe aqui", e a esponja é malhada exatamente onde ela
 * rolou. O altar é a mesa de trabalho que faltava entre os dois: uma laje de pedra em que se PÕE
 * uma coisa e se bate nela.
 *
 *     Z de frente (laje vazia)   →  põe o item SELECIONADO na bolsa
 *     Z de frente (laje cheia)   →  a espada desce nela: uma pancada
 *     X com picareta/machado     →  a mesma pancada, com a ferramenta na mão
 *     X com qualquer outra coisa →  tira de volta o que está lá
 *
 * ── O que ele NÃO é ─────────────────────────────────────────────────────────────────────────
 * Não consome energia, não tem direção, não trabalha sozinho e não pede nada: ele é um MÓVEL, e a
 * única coisa que acontece nele é o que a mão do jogador faz. É por isso que ele pode existir
 * antes de qualquer fábrica — e é por isso que a arte dele foge das três famílias de máquina
 * (caixa de metal, alvenaria em cone, armação de madeira) e é pedra bruta cortada em bloco.
 *
 * ── Bater no que não transforma ────────────────────────────────────────────────────────────
 * A laje ACEITA qualquer coisa e deixa bater em tudo, mas a resposta é diferente e é isso que a
 * impede de mentir: a peça que a pancada trabalha (`hammerResult`) cospe BRASA e escória e no fim
 * vira outra coisa; o que não trabalha responde com lascas cinzentas e um baque seco, sem
 * contagem e sem promessa. Duas recusas com o mesmo pixel não ensinam nenhuma — e uma superfície
 * onde só um item do jogo inteiro reage seria uma fechadura, não uma mesa.
 */

/** Os dois frames da laje (ver spritefactory/sprites/altar.mjs): fria e com o tampo em brasa. */
const FRAME_COLD = 0;
const FRAME_HOT = 1;

const STONE_TINT = 0xd8d8d8;

/** Onde a peça fica: a altura do tampo na arte, e um fio à frente da pedra para não sumir nela. */
const LOAD_ELEV = 0.44;
const LOAD_DEPTH = 0.02;
const LOAD_SIZE = 0.5;

/** Quanto tempo o tampo fica em brasa depois de uma pancada — a última queima mais. */
const HOT_MS = 240;
const HOT_MS_LAST = 460;

/** A pancada que TRANSFORMA cospe brasa; a que não transforma, lasca de pedra. */
const SPARK = 0xf8e394;
const SLAG = 0xe7462a;
const CHIP = 0xa9abbe;

/** "Bastante faísca" (pedido do usuário): a pancada comum já é um leque, e a última é o dobro. */
const SPARKS = 9;
const SPARKS_LAST = 18;
const SPARKS_DULL = 4;

export class AltarObject implements WorldProp {
  public readonly blocking = true;

  private readonly body: Billboard3D;
  /** O que está sobre a laje AGORA. Estado de partida: não vem do mapa e não volta pra ele. */
  private loaded: HeldItemKind | null = null;
  private load?: Billboard3D;
  private blows = 0;
  private hotMs = 0;
  private readonly sparks = new Set<Billboard3D>();
  /** O keycap "Z" que anuncia que esta peça responde ao A — o mesmo da bancada e do forno. */
  private hint?: Phaser.GameObjects.Image;
  /** Quantas peças ele terminou. Público: é o que o playtest observa da peça. */
  public forgeCount = 0;

  public constructor(
    private readonly scene: Phaser.Scene,
    public readonly worldX: number,
    public readonly worldY: number,
    public readonly playerBuilt = false,
  ) {
    this.body = world3d()
      .addBillboard(ASSET_KEYS.altar, FRAME_COLD, { groundShadow: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(1, 1)
      .setTint(STONE_TINT);
  }

  /** O que está sobre a laje — o que o botão e o playtest leem antes de decidir o gesto. */
  public get carrying(): HeldItemKind | null { return this.loaded; }
  /** Quantas pancadas esta peça já levou (some com ela). */
  public get blowsLanded(): number { return this.blows; }

  /**
   * PÕE uma peça na laje. Recusa só com a laje OCUPADA — um lugar, uma peça.
   *
   * Aceita QUALQUER coisa de propósito, como a bigorna do martinete: uma mesa que só aceitasse
   * esponja seria uma fechadura com uma chave só, e o jogador nunca descobriria o gesto sem já
   * saber a resposta. O pior caso é uma pedra pousada numa laje, visível, que o X devolve.
   */
  public place(kind: HeldItemKind): boolean {
    if (this.loaded) return false;
    this.loaded = kind;
    this.blows = 0;
    this.showLoad(kind);
    this.bump();
    return true;
  }

  /**
   * TIRA de volta o que está lá — a metade simétrica do gesto de pôr, e a mesma lei de "tudo que
   * se instala se recolhe". As pancadas já dadas se perdem junto: guardá-las faria a próxima peça
   * sair pronta pela metade sem que nada no mundo explicasse por quê.
   */
  public take(): HeldItemKind | null {
    const kind = this.loaded;
    if (!kind) return null;
    this.loaded = null;
    this.blows = 0;
    this.hideLoad();
    return kind;
  }

  /**
   * UMA PANCADA. Devolve o que a laje passou a segurar depois dela:
   *
   *   'none'    — não havia nada em cima (quem chamou não devia ter chamado);
   *   'blow'    — bateu, e a peça continua sendo o que era (a contagem subiu, ou o item não
   *               trabalha e nunca vai subir);
   *   'forged'  — a última pancada: a peça VIROU outra coisa, e ela continua na laje.
   *
   * O gesto é o mesmo para a espada, a picareta e o machado — quem escolhe a ferramenta é o
   * jogador, e o jogo não tem por que ter opinião sobre com o que se malha ferro quente.
   */
  public strike(): 'none' | 'blow' | 'forged' {
    const kind = this.loaded;
    if (!kind) return 'none';

    // O QUE NÃO TRABALHA responde diferente: lasca cinzenta, sem contagem e sem promessa. Bater
    // numa pedra tem de soar como bater numa pedra — dar a mesma brasa da esponja seria a laje
    // prometendo um resultado que nunca vem.
    if (!isHammerable(kind)) {
      this.spawnSparks(SPARKS_DULL, CHIP, false);
      this.punchLoad();
      this.bump();
      return 'blow';
    }

    this.blows += 1;
    const last = this.blows >= BLOOM_BLOWS;
    this.hotMs = last ? HOT_MS_LAST : HOT_MS;
    this.body.setTexture(ASSET_KEYS.altar, FRAME_HOT);
    this.spawnSparks(last ? SPARKS_LAST : SPARKS, SPARK, last);
    if (last) this.spawnShock();
    this.punchLoad();
    this.bump();
    world3d().shake(last ? 140 : 80, last ? 0.014 : 0.008);
    if (!last) return 'blow';

    // A ÚLTIMA: a escória saiu e o que fica é barra. A troca acontece EM CIMA DA LAJE — uma mesa
    // não move a peça (a mesma lei da bigorna), e apanhar continua sendo um gesto à parte.
    const made = hammerResult(kind);
    this.blows = 0;
    if (!made) return 'blow';
    this.loaded = made;
    this.forgeCount += 1;
    this.showLoad(made);
    return 'forged';
  }

  /** O relógio da brasa no tampo. É só desenho: o estado da laje é o que está em cima dela. */
  public update(deltaMs: number): void {
    if (this.hotMs <= 0) return;
    this.hotMs = Math.max(0, this.hotMs - deltaMs);
    if (this.hotMs === 0) this.body.setTexture(ASSET_KEYS.altar, FRAME_COLD);
  }

  /**
   * O keycap "Z" sobre a laje quando o herói a encara COM algo a pôr. Mora em `placementTexture`
   * como o da bancada e o do forno: as peças que respondem ao A usam o mesmo anúncio, e uma quarta
   * que respondesse teria de usar o mesmo também.
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

  private showLoad(kind: HeldItemKind): void {
    const visual = itemGroundVisual(kind);
    if (!this.load) {
      this.load = world3d()
        .addBillboard(visual.texture, visual.frame, { emissive: true })
        .setPosition(this.worldX, this.worldY - LOAD_DEPTH);
    } else {
      this.load.setTexture(visual.texture, visual.frame).setVisible(true);
    }
    this.load.setDisplaySize(LOAD_SIZE, LOAD_SIZE).setElevation(LOAD_ELEV);
  }

  private hideLoad(): void {
    if (!this.load) return;
    this.scene.tweens.killTweensOf(this.load);
    this.load.setVisible(false);
  }

  /** A peça ACHATA sob a pancada e volta. É o único squash do gesto: a pedra não amassa. */
  private punchLoad(): void {
    const load = this.load;
    if (!load) return;
    this.scene.tweens.killTweensOf(load);
    load.setDisplaySize(LOAD_SIZE * 1.18, LOAD_SIZE * 0.7).setElevation(LOAD_ELEV - 0.03);
    this.scene.tweens.add({
      targets: load,
      displayWidth: LOAD_SIZE,
      displayHeight: LOAD_SIZE,
      elevation: LOAD_ELEV,
      duration: 170,
      ease: 'Back.easeOut',
    });
  }

  /** A laje inteira treme dois graus — nunca escala: nada pode vazar do tile. */
  private bump(): void {
    this.scene.tweens.killTweensOf(this.body);
    this.scene.tweens.add({
      targets: this.body,
      angle: { from: -2, to: 2 },
      duration: 40,
      yoyo: true,
      repeat: 1,
      onComplete: () => this.body.setAngle(0),
    });
  }

  /**
   * O LEQUE RASANTE. Escória que escapa entre a ferramenta e a pedra é cuspida para os lados, e um
   * leque baixo diz de onde ela saiu melhor que um círculo — o mesmo desenho do martinete, porque
   * é a mesma coisa acontecendo (e uma segunda arte de faísca só criaria uma segunda gramática).
   */
  private spawnSparks(count: number, tint: number, last: boolean): void {
    for (let i = 0; i < count; i += 1) {
      const side = i % 2 === 0 ? 1 : -1;
      const spread = 0.35 + Math.random() * 0.75;
      const spark = world3d()
        .addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, additive: true, emissive: true, fog: false, depthWrite: false,
        })
        .setTint(i % 3 === 0 ? SLAG : tint)
        .setPosition(this.worldX, this.worldY - 0.03)
        .setElevation(LOAD_ELEV)
        .setDisplaySize(0.05, 0.05);
      this.sparks.add(spark);

      const reach = (last ? 0.7 : 0.5) * spread;
      const vx = side * reach;
      const vy = (last ? 0.55 : 0.38) * (0.5 + Math.random());
      const gravity = vy + LOAD_ELEV; // chega ao chão exatamente em t=1
      const arc = { t: 0 };
      this.scene.tweens.add({
        targets: arc,
        t: 1,
        duration: 300 + i * 24,
        ease: 'Linear',
        onUpdate: () => {
          const { t } = arc;
          spark.x = this.worldX + vx * t;
          spark.elevation = Math.max(0.01, LOAD_ELEV + vy * t - gravity * t * t);
          spark.alpha = 1 - t * t;
        },
        onComplete: () => { this.sparks.delete(spark); spark.destroy(); },
      });
    }
  }

  /** O anel da última pancada, deitado no chão: o mesmo "acabou" do resto do jogo. */
  private spawnShock(): void {
    const ring = world3d()
      .addBillboard(FX_RING_TEXTURE, 0, {
        flat: true, flatY: 0.03, additive: true, fog: false, depthWrite: false,
      })
      .setTint(SLAG)
      .setPosition(this.worldX, this.worldY)
      .setDisplaySize(0.3, 0.3)
      .setAlpha(0.85);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 1.5,
      scaleY: 1.5,
      alpha: 0,
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.body);
    this.body.destroy();
    if (this.load) {
      this.scene.tweens.killTweensOf(this.load);
      this.load.destroy();
      this.load = undefined;
    }
    this.hint?.destroy();
    this.hint = undefined;
    for (const spark of this.sparks) {
      this.scene.tweens.killTweensOf(spark);
      spark.destroy();
    }
    this.sparks.clear();
  }
}
