import type { HeldItemKind } from '@/game/entities/ItemPickup';

/**
 * A MÃO — UMA COISA DE CADA VEZ.
 *
 * A mochila acabou (pedido do autor): o herói carrega UMA coisa, pequena ou grande tanto faz, e ela
 * vai nas costas dele. Pegar outra exige largar a que está na mão — e quem larga é a cena (ver
 * GameScene.takeIntoHand), porque largar é pôr no MUNDO, e esta classe não conhece o mundo.
 *
 * A coisa carregada pode ser um PACOTE (`count` > 1): o punhado de sementes é um objeto só. Fora
 * isso, a conta é sempre 1.
 *
 * `selected` continua sendo "o que está na mão AGORA" — o nome ficou porque toda fechadura do mundo
 * pergunta isso por ele (GameScene.heldItem), e a resposta segue sendo uma só.
 */
export class Inventory {
  private held: HeldItemKind | null = null;
  private units = 0;

  public get selected(): HeldItemKind | 'none' {
    return this.held ?? 'none';
  }

  public has(kind: HeldItemKind): boolean {
    return this.held === kind;
  }

  public count(kind: HeldItemKind): number {
    return this.held === kind ? this.units : 0;
  }

  public get isEmpty(): boolean {
    return this.held === null;
  }

  /** O que está na mão, como lista (o save e o debug leem daqui). */
  public list(): Array<{ kind: HeldItemKind; count: number }> {
    return this.held ? [{ kind: this.held, count: this.units }] : [];
  }

  /**
   * PÔR NA MÃO. Uma mão cheia de OUTRA coisa recusa (devolve `false`) — quem chama larga primeiro.
   * A mesma coisa soma: é o pacote crescendo (o punhado de sementes).
   *
   * A ESPADA NAO ENTRA. Ela e do heroi (ver GameScene.swordEquipped) e nao existe como item.
   */
  public add(kind: HeldItemKind, amount = 1): boolean {
    if (kind === 'sword') return true;
    if (this.held !== null && this.held !== kind) return false;
    this.held = kind;
    this.units += amount;
    return true;
  }

  /** Gastar. Quando a última unidade sai, a mão fica vazia. */
  public remove(kind: HeldItemKind, amount = 1): boolean {
    if (this.held !== kind || this.units <= 0) return false;
    this.units -= amount;
    if (this.units <= 0) this.empty();
    return true;
  }

  /** Largar TUDO o que está na mão (o pacote inteiro): devolve o que era, para a cena pôr no chão. */
  public takeAll(): { kind: HeldItemKind; count: number } | null {
    if (!this.held) return null;
    const out = { kind: this.held, count: this.units };
    this.empty();
    return out;
  }

  /** A TRANSFORMACAO no lugar: balde vazio -> cheio. A mesma mão, outra coisa. */
  public replace(from: HeldItemKind, to: HeldItemKind): boolean {
    if (this.held !== from) return false;
    this.held = to;
    this.units = 1;
    return true;
  }

  public clear(): void {
    this.empty();
  }

  private empty(): void {
    this.held = null;
    this.units = 0;
  }
}
