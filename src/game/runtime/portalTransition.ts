/**
 * O bilhete que atravessa o `scene.restart()`.
 *
 * A travessia do portal e uma so animacao, mas ela acontece dos DOIS lados de uma cena que
 * morre no meio: a succao e o tunel rodam na GameScene do level velho, e a queda roda na
 * GameScene do level novo — que e um objeto novo, com campos novos, sem memoria nenhuma do
 * que aconteceu antes. Um campo de instancia nao sobrevive a isso; este modulo sim.
 *
 * E deliberadamente o menor bilhete possivel: "voce chegou por um portal". Tudo o mais que a
 * chegada precisa saber ela pergunta ao mundo que acabou de carregar.
 */

/** De onde o heroi caiu, em tiles acima do chao. Alto o bastante para a queda ter tempo. */
export const PORTAL_FALL_HEIGHT_TILES = 7.5;

let pendingArrival = false;

/** Marcado logo antes do restart: a proxima GameScene deve nascer com o heroi no ar. */
export const setPendingPortalArrival = (): void => { pendingArrival = true; };

/**
 * Le E LIMPA o bilhete. Consumir e o ponto: um `scene.restart()` por outro motivo (morte,
 * botao de recomecar) nao pode fazer o heroi cair do ceu de novo.
 */
export const consumePendingPortalArrival = (): boolean => {
  const arrived = pendingArrival;
  pendingArrival = false;
  return arrived;
};

/** Descarta o bilhete sem usar — para quando a transicao falha no meio e volta ao level atual. */
export const clearPendingPortalArrival = (): void => { pendingArrival = false; };
