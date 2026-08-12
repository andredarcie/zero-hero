import type Phaser from 'phaser';

import { ASSET_KEYS, CHEST_CAPACITY } from '@/game/constants';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

/**
 * O BAU — e a peca que faz a fabrica valer a pena estar LONGE.
 *
 * Sem ele, o unico lugar onde um item podia esperar era o chao, um por tile. Uma linha rodando
 * enquanto o jogador desce uma dungeon entupia no segundo bloco de minerio: a esteira parava, o
 * extrator parava, e o jogador voltava para encontrar exatamente o mesmo mundo que deixou. Isso
 * nao e automacao — e uma maquina de fazer nada com uma animacao bonita.
 *
 * O bau e o SUMIDOURO que faltava. Ele nao tem numero na tela (a lei da casa: quem conta e o
 * corpo, nunca uma barra), so o ferrolho que acende em ouro quando ha carga la dentro — a mesma
 * lingua de "isto esta vivo" do filete do cabo e do selo de estrada.
 *
 * ── Por que ele guarda UM tipo, e nao varios ────────────────────────────────────────────────
 * Um bau que aceita tudo e uma mochila que nao anda: o jogador despeja o inventario inteiro nele
 * e a peca vira interface, com lista, rolagem e um menu que para o jogo — exatamente o que a
 * remocao da loja tirou daqui. Um tipo por bau mantem a peca sendo um OBJETO: para guardar duas
 * coisas voce constroi dois baus e os poe lado a lado, o que e uma decisao de espaco, que e a
 * moeda deste genero. O primeiro item que entra decide o tipo; vazio, ele volta a aceitar tudo.
 */
/**
 * A ENTREGA que um baú pode cobrar. Com ela, o baú deixa de ser depósito e vira **a única
 * fechadura deste jogo que não é uma chave: é uma QUANTIDADE**.
 *
 * Isso existe porque a primeira versão do level de fábrica falhou exatamente aí — o jogador
 * ligou um cabo no portão, ele abriu, e a fábrica inteira ficou sendo cenário opcional. Uma
 * fechadura de chave se abre uma vez; uma de quantidade se abre com TRABALHO, e trabalho é a
 * única coisa que faz alguém preferir a máquina à própria mão. Vinte minérios são possíveis na
 * picareta (a lei da casa: toda trava tem chave) — só são tediosos, e é o tédio que ensina.
 */
export type ChestQuota = { kind: HeldItemKind; count: number };

export class ChestObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;
  /** Ver BeltObject.playerBuilt: so o que o jogador construiu ele pode recolher de volta. */
  public readonly playerBuilt: boolean;
  /** O bau e um corpo: ele bloqueia, como o caixote. Depositar e o B contra o tile a frente. */
  public readonly blocking = true;
  /** O circuito que este bau alimenta com o PROGRESSO da entrega (ver quota). */
  public readonly variable?: string;
  public readonly quota?: ChestQuota;

  private readonly sprite: Billboard3D;
  private kind: HeldItemKind | null = null;
  private count = 0;

  public constructor(
    _scene: Phaser.Scene,
    worldX: number,
    worldY: number,
    playerBuilt = false,
    quota?: ChestQuota,
    variable?: string,
  ) {
    this.worldX = worldX;
    this.worldY = worldY;
    this.playerBuilt = playerBuilt;
    this.quota = quota;
    this.variable = variable;
    this.sprite = world3d()
      .addBillboard(ASSET_KEYS.chest, 0)
      .setPosition(worldX, worldY)
      .setDisplaySize(1, 1);
  }

  /** Quanto da entrega ja foi feita, de 0 a 1. Sem quota: 1 (um bau comum nunca "falta"). */
  public get progress(): number {
    if (!this.quota || this.quota.count <= 0) return 1;
    if (this.kind !== this.quota.kind) return 0;
    return Math.min(1, this.count / this.quota.count);
  }

  public get isSatisfied(): boolean { return this.progress >= 1; }

  public get storedKind(): HeldItemKind | null { return this.kind; }

  public get storedCount(): number { return this.count; }

  public get isEmpty(): boolean { return this.count <= 0; }

  public get isFull(): boolean { return this.count >= CHEST_CAPACITY; }

  /**
   * Este bau aceita este tipo agora? Vazio aceita qualquer um; cheio de X aceita so mais X.
   *
   * O bau COM QUOTA e mais estreito: ele aceita SO o que cobra, desde o primeiro item. Sem isso o
   * jogador poderia trancar a propria fechadura enchendo-a de pedra, e a recusa (o tremor da lei
   * das travas) so apareceria no segundo tipo — tarde demais para ensinar qualquer coisa.
   */
  public accepts(kind: HeldItemKind): boolean {
    if (this.isFull) return false;
    if (this.quota) return kind === this.quota.kind;
    return this.kind === null || this.kind === kind;
  }

  /**
   * Guardar. Devolve quantas unidades REALMENTE entraram — o resto continua sendo do jogador
   * (ou da esteira), porque um deposito que engole o excedente em silencio e um item sumindo
   * do mundo, que e o pior defeito possivel num jogo de uma mao so.
   */
  public store(kind: HeldItemKind, units = 1): number {
    if (!this.accepts(kind) || units <= 0) return 0;
    const room = CHEST_CAPACITY - this.count;
    const taken = Math.min(room, units);
    if (taken <= 0) return 0;
    this.kind = kind;
    this.count += taken;
    this.refreshFrame();
    return taken;
  }

  /**
   * Tirar de volta. Devolve o que saiu (ou null se estava vazio). Esvaziando de vez, o bau
   * ESQUECE o tipo — senao um bau que um dia guardou ferro recusaria madeira para sempre, e o
   * jogador teria de derruba-lo para reutiliza-lo.
   */
  public withdraw(units = 1): { kind: HeldItemKind; units: number } | null {
    if (this.kind === null || this.count <= 0) return null;
    const given = Math.min(this.count, Math.max(1, units));
    const kind = this.kind;
    this.count -= given;
    if (this.count <= 0) this.kind = null;
    this.refreshFrame();
    return { kind, units: given };
  }

  /** O save devolve o conteudo direto — sem passar pela regra de capacidade duas vezes. */
  public restore(kind: HeldItemKind | null, count: number): void {
    this.kind = count > 0 ? kind : null;
    this.count = Math.max(0, Math.min(CHEST_CAPACITY, count));
    this.refreshFrame();
  }

  private refreshFrame(): void {
    // Frame 1 = ferrolho em ouro. E o unico feedback de conteudo que existe, e por isso ele tem
    // de trocar no MESMO frame do deposito: um bau que so acende no proximo update leria como
    // "nao aceitou".
    this.sprite.setTexture(ASSET_KEYS.chest, this.count > 0 ? 1 : 0);
  }

  public destroy(): void {
    this.sprite.destroy();
  }
}
