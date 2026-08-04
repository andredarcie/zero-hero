import type { HeldItemKind } from '@/game/entities/ItemPickup';

/**
 * A MOCHILA — e a morte da lei "uma mao so".
 *
 * Ate aqui o heroi carregava UM item, e pegar outro largava o primeiro no chao. Essa regra
 * escreveu metade dos puzzles do jogo (a zona so-de-botas que nao exporta carga, a troca que
 * so acontece pisando) e ela cai junto com o walk-only: com dois botoes, o item do B precisa
 * ser ESCOLHIDO, e escolher pressupoe ter mais de um.
 *
 * O que a mochila NAO faz e virar um numero na tela. Ela e uma lista com contagem porque os
 * consumiveis (graveto, pedra, semente, bomba) sao contaveis por natureza — dois gravetos sao
 * uma ponte —, mas quem mostra a contagem e a subtela, que so existe quando pedida.
 *
 * `selected` e o item do botao B, e e ele que todo o resto da cena ainda le como "o item na
 * mao" (GameScene.heldItem). Isso e de proposito: as botas de lava, o balde, a tocha e cada
 * fechadura do mundo continuam perguntando "o que voce esta segurando AGORA", e a resposta
 * continua sendo uma so. A mochila mudou de onde vem a resposta, nao a pergunta.
 */
export class Inventory {
  /** Quantos de cada tipo. Uma ferramenta fica em 1 para sempre; consumivel sobe e desce. */
  private readonly counts = new Map<HeldItemKind, number>();
  /** A ordem de AQUISICAO — a ordem da grade na subtela. Estavel: um item nao muda de lugar
   *  porque outro acabou, ou o dedo do jogador aprende uma posicao e ela mente na proxima vez. */
  private readonly order: HeldItemKind[] = [];
  private sel: HeldItemKind | 'none' = 'none';

  public get selected(): HeldItemKind | 'none' {
    return this.sel;
  }

  public has(kind: HeldItemKind): boolean {
    return (this.counts.get(kind) ?? 0) > 0;
  }

  public count(kind: HeldItemKind): number {
    return this.counts.get(kind) ?? 0;
  }

  public get isEmpty(): boolean {
    return this.order.length === 0;
  }

  /** A mochila inteira, na ordem em que foi ganha (o que a subtela desenha). */
  public list(): Array<{ kind: HeldItemKind; count: number }> {
    return this.order.map((kind) => ({ kind, count: this.counts.get(kind) ?? 0 }));
  }

  /**
   * Guardar um item. Ele passa a ser o SELECIONADO — pegar uma coisa nova e sempre uma
   * intencao de usa-la, e trocar de item de volta custa uma tecla.
   */
  public add(kind: HeldItemKind, amount = 1): void {
    const next = (this.counts.get(kind) ?? 0) + amount;
    if (!this.counts.has(kind) || this.counts.get(kind) === 0) {
      if (!this.order.includes(kind)) this.order.push(kind);
    }
    this.counts.set(kind, next);
    this.sel = kind;
  }

  /**
   * Gastar um item. Quando o ultimo sai, a selecao anda para o VIZINHO de slot (o que ocupa
   * agora aquela posicao da grade), e nao para o comeco da lista: o polegar do jogador estava
   * ali, e saltar para o primeiro item da mochila cada vez que uma bomba acaba e o jeito certo
   * de fazer alguem usar a picareta sem querer.
   */
  public remove(kind: HeldItemKind, amount = 1): boolean {
    const have = this.counts.get(kind) ?? 0;
    if (have <= 0) return false;
    const left = have - amount;
    if (left > 0) {
      this.counts.set(kind, left);
      return true;
    }
    this.counts.delete(kind);
    const idx = this.order.indexOf(kind);
    if (idx >= 0) this.order.splice(idx, 1);
    if (this.sel === kind) {
      this.sel = this.order[Math.min(idx, this.order.length - 1)] ?? 'none';
    }
    return true;
  }

  /**
   * A TRANSFORMACAO no lugar: balde vazio -> cheio, bateria vazia -> carregada. Nao e tirar um
   * e por outro — o slot e o mesmo, a posicao na grade e a mesma, e a selecao segue junto. Se
   * fosse remove+add, o item transformado pularia para o fim da mochila toda vez que o heroi
   * enchesse o balde no rio.
   */
  public replace(from: HeldItemKind, to: HeldItemKind): boolean {
    const idx = this.order.indexOf(from);
    if (idx < 0) return false;
    const have = this.counts.get(from) ?? 0;
    const wasSelected = this.sel === from;
    if (have > 1) this.counts.set(from, have - 1);
    else {
      this.counts.delete(from);
      this.order.splice(idx, 1);
    }
    const existing = this.order.indexOf(to);
    if (existing < 0) this.order.splice(Math.min(idx, this.order.length), 0, to);
    this.counts.set(to, (this.counts.get(to) ?? 0) + 1);
    if (wasSelected) this.sel = to;
    return true;
  }

  /** Escolher o item do B. Recusa o que nao esta na mochila (a subtela nunca oferece isso). */
  public select(kind: HeldItemKind | 'none'): boolean {
    if (kind === 'none') { this.sel = 'none'; return true; }
    if (!this.has(kind)) return false;
    this.sel = kind;
    return true;
  }

  /** Andar na grade da subtela (setas): -1 para tras, +1 para frente, sem dar a volta. */
  public step(delta: number): void {
    if (this.order.length === 0) { this.sel = 'none'; return; }
    const at = this.sel === 'none' ? -1 : this.order.indexOf(this.sel);
    const next = Math.max(0, Math.min(this.order.length - 1, at + delta));
    this.sel = this.order[next];
  }

  public clear(): void {
    this.counts.clear();
    this.order.length = 0;
    this.sel = 'none';
  }
}
