/**
 * O BILHETE QUE ATRAVESSA O `scene.restart()`.
 *
 * A travessia da escada é uma só animação, mas ela acontece dos DOIS lados de uma cena que morre
 * no meio: a descida roda na GameScene do andar velho, e a subida roda na GameScene do andar
 * novo — que é um objeto novo, com campos novos, sem memória nenhuma do que aconteceu antes. Um
 * campo de instância não sobrevive a isso; este módulo sim (o mesmo padrão de `underworld`).
 *
 * É deliberadamente o menor bilhete possível: "você chegou por uma escada". Tudo o mais que a
 * chegada precisa saber ela pergunta ao mundo que acabou de carregar.
 *
 * Houve aqui um SEGUNDO bilhete, o do portal — a travessia mágica que engolia o herói num level
 * de puzzle e o cuspia caindo do céu no seguinte. Os levels isolados foram removidos do jogo e
 * ele foi junto: hoje existe uma porta só, e ela é uma caminhada.
 */

let pendingStairs = false;

/** Marcado logo antes do restart: a próxima GameScene deve nascer subindo do poço. */
export const setPendingStairsArrival = (): void => { pendingStairs = true; };

/**
 * Lê E LIMPA o bilhete. Consumir é o ponto: um `scene.restart()` por outro motivo (morte, botão
 * de recomeçar) não pode fazer o herói brotar de uma escada que ele não pegou.
 */
export const consumePendingStairsArrival = (): boolean => {
  const arrived = pendingStairs;
  pendingStairs = false;
  return arrived;
};

/** Descarta o bilhete sem usar — para quando a travessia falha no meio e volta ao andar atual. */
export const clearPendingStairsArrival = (): void => { pendingStairs = false; };
