import type * as Engine from '@/game/engine';

import { ASSET_KEYS, BLOOM_BLOWS } from '@/game/constants';
import { itemGroundVisual, type HeldItemKind } from '@/game/entities/ItemPickup';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';
import { hammerResult, isHammerable } from './hammering';
import { AltarDebris, LOAD_ELEV } from './AltarDebris';
export { LOAD_ELEV } from './AltarDebris';

/**
 * A BIGORNA DA THEA (pedido do autor): fixa, ao lado do forno, e o ÚNICO lugar onde a esponja de ferro vira barra —
 * a martelada no chão saiu. Uma bigorna de ferreiro de verdade sobre um toco (spritefactory/sprites/altar.mjs), com
 * o MARTELINHO encostado nela: o herói põe a peça em cima, pega o martelinho e malha; saindo de perto, o martelinho
 * volta para o lugar (GameScene.forgeStrike / returnForgeHammer). O nome "altar" ficou no código e no mapa.
 *
 * O texto abaixo é da laje antiga e continua valendo no que diz da peça e das pancadas.
 *
 * O ALTAR — a bigorna que não é máquina.
 *
 * A esponja de ferro podia ser martelada no chão, exatamente onde rolou. O altar torna o gesto
 * legível: uma laje de pedra em que se põe uma coisa e se bate nela.
 *
 *     Z de frente (laje vazia)   →  põe o item SELECIONADO na bolsa
 *     Z de frente (laje cheia)   →  a espada desce nela: uma pancada
 *     X com picareta/machado     →  a mesma pancada, com a ferramenta na mão
 *     X com qualquer outra coisa →  tira de volta o que está lá
 *
 * ── O que ele NÃO é ─────────────────────────────────────────────────────────────────────────
 * Não consome energia, não tem direção, não trabalha sozinho e não pede nada: ele é um MÓVEL, e a
 * única coisa que acontece nele é o que a mão do jogador faz. É por isso que ele pode existir
 * desde o começo — e é por isso que a arte dele foge das famílias de máquina
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

const LOAD_DEPTH = 0.02;
const LOAD_SIZE = 0.5;

/** Quanto tempo o tampo fica em brasa depois de uma pancada — a última queima mais. */
const HOT_MS = 240;
const HOT_MS_LAST = 460;

/** A pancada que TRANSFORMA cospe brasa; a que não transforma, lasca de pedra. */
const SPARK = 0xf8e394;
const CHIP = 0xa9abbe;

/** "Bastante faísca" (pedido do usuário): a pancada comum já é um leque, e a última é o dobro. */
const SPARKS = 9;
const SPARKS_LAST = 18;
const SPARKS_DULL = 4;

/** O martelinho encostado no toco: à direita da bigorna, um pouco à frente, inclinado. */
const HAMMER_REST = { dx: 0.4, dy: 0.12, elev: 0.04, angle: 16, size: 0.46 };
export const FORGE_HAMMER_TEXTURE = 'forge-hammer';
export const FORGE_HAMMER_SIZE = HAMMER_REST.size;

export class AltarObject implements WorldProp {
  public readonly blocking = true;

  private readonly body: Billboard3D;
  /** O martelinho encostado no toco (some enquanto está na mão do herói). */
  private readonly restHammer: Billboard3D;
  /** O que está sobre a laje AGORA. Estado de partida: não vem do mapa e não volta pra ele. */
  private loaded: HeldItemKind | null = null;
  private load?: Billboard3D;
  private blows = 0;
  private hotMs = 0;
  /** Quantas peças ele terminou. Público: é o que o playtest observa da peça. */
  public forgeCount = 0;
  /** As faíscas, as pedrinhas e o anel que a pancada arranca (ver AltarDebris). */
  private readonly debris = new AltarDebris(this);

  public constructor(
    readonly scene: Engine.Scene,
    public readonly worldX: number,
    public readonly worldY: number,
    public readonly playerBuilt = false,
  ) {
    this.body = world3d()
      .objects.addBillboard(ASSET_KEYS.altar, FRAME_COLD, { groundShadow: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(1, 1)
      .setTint(STONE_TINT);
    this.restHammer = world3d()
      .objects.addBillboard(FORGE_HAMMER_TEXTURE, 0, {})
      .setPosition(worldX + HAMMER_REST.dx, worldY + HAMMER_REST.dy)
      .setElevation(HAMMER_REST.elev)
      .setDisplaySize(HAMMER_REST.size, HAMMER_REST.size)
      .setAngle(HAMMER_REST.angle)
      .setTint(STONE_TINT);
  }

  /** Onde o martelinho descansa (o herói o pega dali e o devolve para lá). */
  public get hammerRest(): { x: number; y: number; elevation: number; angle: number } {
    return { x: this.worldX + HAMMER_REST.dx, y: this.worldY + HAMMER_REST.dy, elevation: HAMMER_REST.elev, angle: HAMMER_REST.angle };
  }

  /** O martelinho saiu do toco (está na mão do herói) ou voltou para ele. */
  public setHammerAway(away: boolean): void {
    this.restHammer.setVisible(!away);
  }

  /** O que está sobre a laje — o que o botão e o playtest leem antes de decidir o gesto. */
  public get carrying(): HeldItemKind | null { return this.loaded; }
  /** Quantas pancadas esta peça já levou (some com ela). */
  public get blowsLanded(): number { return this.blows; }

  /**
   * PÕE uma peça na laje. Recusa só com a laje OCUPADA — um lugar, uma peça.
   *
   * Aceita QUALQUER coisa de propósito: uma mesa que só aceitasse
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
      this.debris.spawnSparks(SPARKS_DULL, CHIP, false);
      this.punchLoad();
      this.bump();
      return 'blow';
    }

    this.blows += 1;
    const last = this.blows >= BLOOM_BLOWS;
    this.hotMs = last ? HOT_MS_LAST : HOT_MS;
    this.body.setTexture(ASSET_KEYS.altar, FRAME_HOT);
    this.debris.spawnSparks(last ? SPARKS_LAST : SPARKS, SPARK, last);
    this.debris.spawnPebbles(last ? 7 : 4);
    if (last) this.debris.spawnShock();
    this.punchLoad();
    this.bump();
    world3d().cam.shake(last ? 140 : 80, last ? 0.004 : 0.002);
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

  private showLoad(kind: HeldItemKind): void {
    const visual = itemGroundVisual(kind);
    if (!this.load) {
      this.load = world3d()
        .objects.addBillboard(visual.texture, visual.frame, { emissive: true })
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

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.body);
    this.body.destroy();
    this.restHammer.destroy();
    if (this.load) {
      this.scene.tweens.killTweensOf(this.load);
      this.load.destroy();
      this.load = undefined;
    }
    this.debris.destroy();
  }
}
