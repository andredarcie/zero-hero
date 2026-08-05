/**
 * O ACASO DESTA MASMORRA — e o contrato de que ele é sempre o MESMO acaso.
 *
 * Duas fontes de aleatório, e a diferença entre elas é a lei deste módulo:
 *
 * 1. **`Rng`, uma sequência.** O gerador percorre a dungeon inteira numa ordem fixa (missão →
 *    layout → salas → conteúdo) e vai puxando números. Serve para decidir o que é decidido UMA
 *    vez: qual ciclo, quantas salas, que forma tem esta sala. Reproduzir exige refazer o mesmo
 *    percurso — e é por isso que ele nunca decide arte.
 * 2. **`tileHash`, uma função da coordenada.** O que existe em (x, y) é função de (semente, x, y)
 *    e de mais nada — a mesma lei do `explorerWorld`. Serve para o que precisa ser recalculado
 *    fora do percurso: a variante de piso e de alvenaria, que o retrato salvo NÃO guarda (ver
 *    `dungeonSnapshot`: gravar a arte custaria 8× e não diz nada que a semente não diga).
 *
 * Trocar uma pela outra é o bug silencioso deste sistema: um piso sorteado no `Rng` volta
 * diferente quando o save hidrata, porque hidratar não refaz o percurso.
 *
 * `Math.random()` não aparece em lugar nenhum deste diretório. Ele aparece uma vez no jogo
 * inteiro — ao cunhar a semente da partida (`adventureState.adventureRunSeed`) — e daquele ponto
 * em diante tudo é consequência.
 */

/** Mistura inteiros num inteiro sem sinal. Estável entre plataformas (só `imul` e deslocamento). */
export const mixSeed = (...parts: readonly number[]): number => {
  let h = 0x811c9dc5;
  for (const part of parts) {
    h = Math.imul(h ^ (part | 0), 0x01000193);
    h = (h ^ (h >>> 15)) >>> 0;
  }
  return h >>> 0;
};

/**
 * A semente de uma dungeon: a da partida, dobrada com o número dela. Sem estado, então a ordem em
 * que o jogador visita as nove não muda nenhuma — descer na 7 antes da 1 dá as mesmas duas.
 */
export const dungeonSeedFor = (runSeed: number, level: number): number => mixSeed(runSeed, level, 0x0d06);

/** Ruído de coordenada, 0..1. É ele que decide arte, e só arte. */
export const tileHash = (seed: number, x: number, y: number, salt = 0): number => {
  let h = mixSeed(seed, x, y, salt);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

/** Mulberry32 — pequeno, rápido e reprodutível em qualquer runtime de JS. */
export class Rng {
  private state: number;

  public constructor(seed: number) {
    this.state = seed >>> 0;
  }

  public next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** 0..n-1. */
  public int(n: number): number {
    return Math.floor(this.next() * n) % Math.max(1, n);
  }

  /** a..b, inclusivo nos dois. */
  public range(a: number, b: number): number {
    return a + this.int(b - a + 1);
  }

  public pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  public chance(p: number): boolean {
    return this.next() < p;
  }

  /** Fisher-Yates, numa cópia: o chamador quase sempre quer a lista original intacta. */
  public shuffled<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}
