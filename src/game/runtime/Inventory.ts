import type { HeldItemKind } from '@/game/entities/ItemPickup';

/**
 * AS FERRAMENTAS FICAM COM ELE (pedido do autor, 2026-11-09: "acaba com o backtracking"). Toda ferramenta ganha é
 * do herói para sempre, sem inventário à vista: nas costas vai só a ÚLTIMA USADA, e as outras ficam guardadas
 * (`kept`). Diante do que pede uma ferramenta guardada, o balão diz o verbo e o botão a traz para as costas
 * (ActionVerbs.toolFor, ToolSwing.equipToolFor). O balde é uma ferramenta só, vazio ou cheio.
 */
export const TOOL_KINDS: ReadonlySet<HeldItemKind> = new Set<HeldItemKind>([
  'knife', 'axe', 'pickaxe', 'scythe', 'shovel', 'bucket', 'bucketFull', 'brush', 'key',
]);
export const isToolKind = (kind: HeldItemKind | 'none' | null | undefined): kind is HeldItemKind =>
  kind != null && kind !== 'none' && TOOL_KINDS.has(kind);

/**
 * AS COSTAS — UMA COISA DE CADA VEZ, e as ferramentas guardadas.
 *
 * O herói carrega UMA coisa nas costas, pequena ou grande tanto faz. Material (pedra, graveto, minério,
 * cogumelo, semente…) continua sendo um de cada vez: pegar outro exige largar o da mão — e quem larga é a cena
 * (ver HandItems.takeIntoHand), porque largar é pôr no MUNDO, e esta classe não conhece o mundo. Ferramenta não
 * disputa lugar: a que sai das costas vai para as guardadas, e a que chega com material nas costas também.
 *
 * A coisa carregada pode ser um PACOTE (`count` > 1): o punhado de sementes é um objeto só. Fora isso, a conta é 1.
 *
 * `selected` continua sendo "o que está nas costas AGORA" — o nome ficou porque toda fechadura do mundo pergunta
 * isso por ele (GameScene.heldItem), e a resposta segue sendo uma só.
 */
export class Inventory {
  private held: HeldItemKind | null = null;
  private units = 0;
  /** As ferramentas guardadas, fora das costas, na ordem em que chegaram. */
  private readonly kept = new Set<HeldItemKind>();

  /** `onAdd`: quem quer saber de tudo que passa pelas mãos (o caderno do acampamento, runtime/notebook). */
  public constructor(private readonly onAdd?: (kind: HeldItemKind) => void) {}

  public get selected(): HeldItemKind | 'none' {
    return this.held ?? 'none';
  }

  public has(kind: HeldItemKind): boolean {
    return this.held === kind;
  }

  /** É dele: nas costas ou guardada. */
  public owns(kind: HeldItemKind): boolean {
    return this.held === kind || this.kept.has(kind);
  }

  /** As ferramentas guardadas (fora das costas), na ordem em que chegaram. */
  public keptTools(): HeldItemKind[] {
    return [...this.kept];
  }

  public count(kind: HeldItemKind): number {
    return this.held === kind ? this.units : 0;
  }

  public get isEmpty(): boolean {
    return this.held === null;
  }

  /** O que ele tem, como lista: o das costas primeiro, depois as guardadas (o save e o debug leem daqui). */
  public list(): Array<{ kind: HeldItemKind; count: number }> {
    const back = this.held ? [{ kind: this.held, count: this.units }] : [];
    return [...back, ...[...this.kept].map((kind) => ({ kind, count: 1 }))];
  }

  /**
   * CABE SEM LARGAR NADA? Costas vazias, a mesma coisa (o pacote crescendo), ou uma ferramenta de um dos lados:
   * ferramenta nas costas vai para as guardadas, e ferramenta que chega com material nas costas também.
   */
  public fits(kind: HeldItemKind): boolean {
    if (kind === 'sword' || this.held === null || this.held === kind) return true;
    return isToolKind(this.held) || isToolKind(kind);
  }

  /**
   * PÔR NAS COSTAS. Material sobre material recusa (devolve `false`) — quem chama larga primeiro. A mesma coisa
   * soma: é o pacote crescendo. Ferramenta nas costas vai para as guardadas; ferramenta que chega com material nas
   * costas vai direto para as guardadas, e o material fica onde está.
   *
   * A ESPADA NAO ENTRA. Ela e do heroi (ver GameScene.swordEquipped) e nao existe como item.
   */
  public add(kind: HeldItemKind, amount = 1): boolean {
    if (kind === 'sword') return true;
    if (!this.fits(kind)) return false;
    this.onAdd?.(kind);
    if (this.held === kind) { this.units += amount; return true; }
    if (this.held !== null && !isToolKind(this.held)) { this.kept.add(kind); return true; }
    if (this.held !== null) this.kept.add(this.held);
    this.kept.delete(kind);
    this.held = kind;
    this.units = amount;
    return true;
  }

  /** Guardar uma ferramenta sem mexer nas costas (o save que volta). Recusa o que não é ferramenta. */
  public keep(kind: HeldItemKind): boolean {
    if (!isToolKind(kind)) return false;
    if (this.held !== kind) this.kept.add(kind);
    return true;
  }

  /**
   * TRAZER PARA AS COSTAS uma ferramenta guardada: a das costas, se for ferramenta, troca de lugar com ela.
   * Material nas costas recusa — quem chama o larga antes (ver ToolSwing.equipToolFor).
   */
  public equip(kind: HeldItemKind): boolean {
    if (this.held === kind) return true;
    if (!this.kept.has(kind) || (this.held !== null && !isToolKind(this.held))) return false;
    if (this.held !== null) this.kept.add(this.held);
    this.kept.delete(kind);
    this.held = kind;
    this.units = 1;
    return true;
  }

  /**
   * COMO SE ESTA ESTIVESSE NAS COSTAS: o balão pergunta o que uma ferramenta guardada faria aqui, com as mesmas
   * perguntas que o botão faz. Nada muda: as costas voltam ao que eram ao sair, aconteça o que acontecer.
   */
  public peek<T>(kind: HeldItemKind, ask: () => T): T {
    const held = this.held;
    const units = this.units;
    this.held = kind;
    this.units = 1;
    try {
      return ask();
    } finally {
      this.held = held;
      this.units = units;
    }
  }

  /** Gastar. Quando a última unidade sai, as costas ficam vazias. Uma ferramenta guardada sai inteira (devolvida). */
  public remove(kind: HeldItemKind, amount = 1): boolean {
    if (this.held !== kind || this.units <= 0) return this.kept.delete(kind);
    this.units -= amount;
    if (this.units <= 0) this.empty();
    return true;
  }

  /** Largar TUDO o que está nas costas (o pacote inteiro): devolve o que era, para a cena pôr no chão. */
  public takeAll(): { kind: HeldItemKind; count: number } | null {
    if (!this.held) return null;
    const out = { kind: this.held, count: this.units };
    this.empty();
    return out;
  }

  /** A TRANSFORMACAO no lugar: balde vazio -> cheio. A mesma coisa, outro estado, nas costas ou guardada. */
  public replace(from: HeldItemKind, to: HeldItemKind): boolean {
    if (this.held !== from) {
      if (!this.kept.delete(from)) return false;
      this.kept.add(to);
      return true;
    }
    this.held = to;
    this.units = 1;
    return true;
  }

  /** Esvaziar tudo: as costas e as guardadas (a run que começa). */
  public clear(): void {
    this.empty();
    this.kept.clear();
  }

  private empty(): void {
    this.held = null;
    this.units = 0;
  }
}
