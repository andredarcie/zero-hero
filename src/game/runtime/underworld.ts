/**
 * EM QUE ANDAR O HEROI ESTA — e so isso.
 *
 * O jogo tem DOIS mundos do mesmo tamanho: o overworld e o SUBTERRANEO, que e o espelho dele
 * (mesmas coordenadas, mesmo esqueleto — ver scripts/gen-underworld.mjs). Um portal em (x,y)
 * existe nos dois, e atravessa-lo troca de andar mantendo o tile: desce em (x,y), chega em
 * (x,y); sobe em (x,y), chega em (x,y). **A porta e simetrica, e por isso ela nao precisa de
 * endereco nenhum** — o destino ja esta escrito no tile em que o heroi pisou.
 *
 * Este modulo chegou a guardar um bilhete de VOLTA (o tile por onde o heroi desceu), porque a
 * dungeon de antes era um lugar SEPARADO: sair dela nao tinha destino obvio, e o unico endereco
 * que fazia sentido era a boca por onde se entrou. Com o espelho isso virou um defeito: descer
 * num canto do mapa, atravessar o andar de baixo e subir no canto oposto devolvia o heroi ao
 * primeiro canto — a viagem inteira desfeita, e um mundo que nao e mais espelho de nada.
 *
 * O flag mora aqui, num modulo, e nao numa cena: e o pouco que precisa sobreviver ao
 * `scene.restart()` que cada travessia faz — o mesmo motivo de `portalTransition` e
 * `activeLevel`.
 */

let underground = false;

export const setUnderground = (value: boolean): void => { underground = value; };

/** Verdadeiro enquanto o mundo carregado for o subterraneo. */
export const isUnderground = (): boolean => underground;
