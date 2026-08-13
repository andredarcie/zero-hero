import type Phaser from 'phaser';

import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import {
  FULTON_BALLOON_KEY, FULTON_BOX_KEY, FULTON_MARK_KEY, FULTON_PLANE_KEY, FULTON_SIGN_KEY,
} from '@/game/render3d/fultonTexture';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import type { WorldProp } from './WorldProp';

/**
 * A CAIXA DE EXTRAÇÃO — a única máquina do jogo que devolve MOEDA, e a única que se paga sozinha.
 *
 * Vender era uma conversa: o balcão dentro do painel de diálogo de um NPC. Isso funciona onde há
 * alguém para falar e some onde não há — e não pode haver um morador em toda carta. Aqui o negócio
 * é um CORPO no chão: uma caixa de papelão de carga aérea, com uma placa de madeira ao lado
 * dizendo o que ela aceita, e um voo inteiro como recibo.
 *
 * ── POR QUE O TEATRO ─────────────────────────────────────────────────────────────────────────
 * A conta poderia ser instantânea (some o item, some a moeda no bolso) e seria pior por duas
 * razões. A primeira é a lei da casa: dinheiro ganho é dinheiro no MUNDO — o pagamento CAI e o
 * jogador o apanha, como faz com o de um corpo que tomba. A segunda é que uma venda sem gesto
 * visível é um número mudando no canto da tela; aqui ela tem começo (o balão infla), meio (a caixa
 * some no céu e o avião cruza o mapa) e fim (as moedas caem do alto).
 *
 * ── OS SEIS TEMPOS ───────────────────────────────────────────────────────────────────────────
 *   1. o balão nasce em cima da caixa e infla;
 *   2. os dois sobem juntos, acelerando, até sumirem;
 *   3. uma sombra de avião cruza o level inteiro, rápida e rasante;
 *   4. as moedas caem do céu sobre o tile da caixa;
 *   5. um X marca o chão vazio;
 *   6. depois de RESTOCK_MS a caixa volta, e a marca some.
 *
 * A PLACA nunca participa disso: ela é do LUGAR, não da caixa. Fica de pé o tempo todo, inclusive
 * com o céu vazio — é ela que promete que outra caixa vem.
 */

/** Quanto dura cada tempo, em ms. */
// Os tempos foram TODOS alongados depois de ver a sequência quadro a quadro: a subida durava
// 1,15s com uma curva t², ou seja quase tudo acontecia nos últimos 300ms — a caixa saía do quadro
// antes de o olho achar o balão. Uma animação que ninguém consegue seguir é uma animação que não
// aconteceu.
const INFLATE_MS = 700;
const LIFT_MS = 2400;
const PLANE_MS = 1100;
const RESTOCK_MS = 6000;
/** Altura (em tiles) em que a caixa deixa de ser visível — bem acima do topo do quadro. */
const SKY_HEIGHT = 7;

type Phase = 'idle' | 'inflating' | 'lifting' | 'plane' | 'gone';

export class SellBoxObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;
  /** O tipo que ela compra, e o único. */
  public readonly kind: HeldItemKind;
  public readonly coinsPerUnit: number;

  private readonly scene: Phaser.Scene;
  private box: Billboard3D;
  private balloon?: Billboard3D;
  private plane?: Billboard3D;
  private mark?: Billboard3D;
  private readonly sign: Billboard3D;
  private readonly signIcon: Billboard3D;

  private phase: Phase = 'idle';
  private timer = 0;
  private planeX = 0;
  /** O que a extração desta viagem vai pagar quando o avião passar. */
  private pendingCoins = 0;
  private onPayout?: (worldX: number, worldY: number, coins: number) => void;

  public constructor(
    scene: Phaser.Scene,
    worldX: number,
    worldY: number,
    kind: HeldItemKind,
    coinsPerUnit: number,
    signTexture: string,
    signFrame: number,
  ) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.kind = kind;
    this.coinsPerUnit = Math.max(1, Math.floor(coinsPerUnit));
    this.box = this.makeBox();
    // A PLACA MORA NO TILE VIZINHO, e não em cima da caixa: a meio tile ela atravessava o corpo
    // do papelão.
    //
    // E ela PLANTA NO CHÃO (elevation 0). Um billboard ancora no PÉ — a elevação é onde a base do
    // sprite encosta —, e eu a tratei como se fosse o centro: a 0,45 a placa inteira flutuava, com
    // o poste no ar.
    this.sign = world3d()
      .addBillboard(FULTON_SIGN_KEY, 0, { groundShadow: true })
      .setPosition(worldX - 1, worldY)
      .setDisplaySize(0.9, 0.9);
    this.sign.elevation = 0;
    // O ÍCONE do item, NA FACE DA TÁBUA — e essa é uma conta, não um chute.
    //
    // A tábua ocupa as 9 primeiras linhas das 16 do sprite, ou seja a faixa que vai de 44% a 100%
    // da altura: com a placa de 0,9 plantada no chão, o meio da tábua está a 0,9 × 0,72 = 0,65.
    // O ícone também ancora no pé, então ele desce METADE da própria altura para ficar centrado
    // ali. Sem essa metade — que foi o erro — ele pousa com a base no centro da tábua e o desenho
    // inteiro aparece flutuando ABAIXO do lugar certo.
    const boardMiddle = 0.9 * 0.72;
    const iconSize = 0.34;
    this.signIcon = world3d()
      .addBillboard(signTexture, signFrame, { groundShadow: false, renderOrder: 3 })
      .setPosition(worldX - 1, worldY + 0.06)
      .setDisplaySize(iconSize, iconSize);
    this.signIcon.elevation = boardMiddle - iconSize / 2;
  }

  private makeBox(): Billboard3D {
    const bb = world3d()
      .addBillboard(FULTON_BOX_KEY, 0, { groundShadow: true })
      .setPosition(this.worldX, this.worldY)
      .setDisplaySize(1.05, 1.05);
    bb.elevation = 0;
    return bb;
  }

  /** Sólida só enquanto ESTÁ ali: com a caixa no céu, o tile é caminho — e o X se pisa. */
  public get blocking(): boolean {
    return this.phase === 'idle';
  }

  /** A caixa está no chão e aceita negócio? (o modal só abre aqui) */
  public get isReady(): boolean {
    return this.phase === 'idle';
  }

  public accepts(kind: HeldItemKind): boolean {
    return kind === this.kind;
  }

  public priceFor(units: number): number {
    return Math.max(0, Math.floor(units)) * this.coinsPerUnit;
  }

  /**
   * FECHADO O NEGÓCIO: começa a extração. Quem paga é o `onPayout`, chamado quando o avião passa —
   * a cena é que sabe derrubar moeda, e a caixa não conhece o CoinManager.
   */
  public extract(coins: number, onPayout: (worldX: number, worldY: number, coins: number) => void): void {
    if (this.phase !== 'idle') return;
    this.pendingCoins = Math.max(0, Math.floor(coins));
    this.onPayout = onPayout;
    this.phase = 'inflating';
    this.timer = 0;
    this.balloon = world3d()
      .addBillboard(FULTON_BALLOON_KEY, 0, { groundShadow: false })
      .setPosition(this.worldX, this.worldY)
      .setDisplaySize(0.1, 0.1);
    this.balloon.elevation = 0.7;
  }

  /** A recusa é FÍSICA, como toda recusa deste jogo: o corpo treme, nunca uma legenda. */
  public refuse(): void {
    if (this.phase !== 'idle') return;
    this.scene.tweens.killTweensOf(this.box);
    this.scene.tweens.add({
      targets: this.box,
      angle: { from: -9, to: 9 },
      duration: 45,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => this.box.setAngle(0),
    });
  }

  public update(delta: number): void {
    if (this.phase === 'idle') return;
    this.timer += delta;
    if (this.phase === 'inflating') {
      const t = Math.min(1, this.timer / INFLATE_MS);
      // O balão infla com um estouro no fim (back-out): ele ENCHE, não cresce linearmente.
      const size = 0.08 + (0.85 - 0.08) * (1 - (1 - t) ** 3);
      this.balloon?.setDisplaySize(size, size);
      if (t >= 1) { this.phase = 'lifting'; this.timer = 0; }
      return;
    }
    if (this.phase === 'lifting') {
      const t = Math.min(1, this.timer / LIFT_MS);
      // A CURVA: arranco no começo (o tranco do balão enchendo) e depois subida firme. `t²` puro
      // deixava a caixa quase parada por dois terços do tempo e a arrancava no fim, o que lia como
      // um salto, não como uma subida.
      const h = SKY_HEIGHT * (t * t * 0.35 + t * 0.65);
      // E ela BALANÇA: pendurada por uma corda, a carga oscila — sem isso o conjunto sobe como um
      // elevador, rígido, e é o detalhe que mais denuncia que aquilo é um sprite indo para cima.
      const sway = Math.sin(this.timer / 260) * 0.13 * (1 - t * 0.5);
      this.box.setPosition(this.worldX + sway, this.worldY);
      this.box.setAngle(sway * 40);
      this.box.elevation = h;
      if (this.balloon) {
        this.balloon.setPosition(this.worldX + sway * 0.7, this.worldY);
        this.balloon.elevation = h + 0.78;
      }
      if (t >= 1) {
        this.box.destroy();
        this.balloon?.destroy();
        this.balloon = undefined;
        this.phase = 'plane';
        this.timer = 0;
        this.planeX = this.worldX - 14;
        // ELE É UM DESENHO NO CHÃO, e é isso que ele sempre devia ter sido: `depthLayer: 'ground'`
        // é o que o jogo usa para todo quad DEITADO (o buraco, a água, a flor aberta, o X aqui do
        // lado) — a sombra de um avião não fica de pé no ar, ela escorre pelo terreno.
        //
        // E `emissive` porque billboard aqui é sprite ILUMINADO: sem o unlit, a cor do vulto é
        // multiplicada pela luz da cena e some num mapa escuro. As duas coisas juntas, e não uma
        // ou outra — foi tentar cada uma sozinha que fez isto demorar três rodadas.
        // Também `flat`: a sombra escorre PELO terreno. Em pé, rente ao chão, ela era vista quase
        // de fio por esta câmera — e é por isso que a passagem não apareceu em captura nenhuma,
        // mesmo depois de eu consertar a cor e a iluminação. Era a geometria, não o material.
        this.plane = world3d()
          .addBillboard(FULTON_PLANE_KEY, 0, {
            groundShadow: false, emissive: true, flat: true, flatY: 0.05, depthLayer: 'ground',
          })
          .setPosition(this.planeX, this.worldY - 1.5)
          .setDisplaySize(4.2, 4.2);
      }
      return;
    }
    if (this.phase === 'plane') {
      const t = Math.min(1, this.timer / PLANE_MS);
      this.plane?.setPosition(this.worldX - 14 + 28 * t, this.worldY - 1.5);
      // O PAGAMENTO CAI NO MEIO DA PASSAGEM, com o avião em cima do tile — e não depois de ele
      // sumir. As moedas vêm DELE: soltá-las com o céu já vazio quebrava a única ligação de causa
      // que a cena tinha, e o jogador via moedas nascendo do nada.
      if (t >= 0.5 && this.pendingCoins > 0) {
        this.onPayout?.(this.worldX, this.worldY, this.pendingCoins);
        this.pendingCoins = 0;
      }
      if (t >= 1) {
        this.plane?.destroy();
        this.plane = undefined;
        this.phase = 'gone';
        this.timer = 0;
        // `flat: true` — o X é PINTADO NO CHÃO, como alguém que passou tinta ali. Sem ele o quad
        // fica EM PÉ encarando a câmera, que é como um cartaz fincado no lugar. `depthLayer` só
        // ordena profundidade; quem deita o quad é esta opção (a mesma da água, do buraco e da
        // flor aberta), e eu vinha usando a errada.
        this.mark = world3d()
          .addBillboard(FULTON_MARK_KEY, 0, {
            groundShadow: false, emissive: true, flat: true, flatY: 0.03, depthLayer: 'ground',
          })
          .setPosition(this.worldX, this.worldY)
          .setDisplaySize(0.9, 0.9);
      }
      return;
    }
    // 'gone': o X espera, pulsando de leve, até a caixa nova.
    if (this.mark) {
      const pulse = 0.85 + 0.1 * Math.sin(this.timer / 180);
      this.mark.setDisplaySize(pulse, pulse);
    }
    if (this.timer >= RESTOCK_MS) {
      this.mark?.destroy();
      this.mark = undefined;
      this.box = this.makeBox();
      this.phase = 'idle';
      this.timer = 0;
    }
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.box);
    this.box.destroy();
    this.balloon?.destroy();
    this.plane?.destroy();
    this.mark?.destroy();
    this.sign.destroy();
    this.signIcon.destroy();
  }
}
