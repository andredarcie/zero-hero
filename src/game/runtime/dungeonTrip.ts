/**
 * A VIAGEM ATE A DUNGEON — o bilhete de VOLTA, e o irmao do `portalTransition`.
 *
 * Entrar numa dungeon nao e a mesma coisa que passar de level. Um level encadeia no proximo e
 * nunca precisa lembrar de onde veio; uma dungeon do Zelda e um desvio: o heroi sai de um tile
 * do overworld, desce, e tem de voltar EXATAMENTE naquele tile — a boca de caverna que ele
 * acabou de atravessar, e nao o ponto de nascimento do mundo, que fica a meio mapa dali.
 *
 * Esse endereco nao cabe em nenhum dos dois mundos: quando a dungeon esta carregada o overworld
 * ja nao existe em memoria, e quando o overworld volta a existir ele foi lido do disco outra vez,
 * limpo, sem saber que alguem esteve fora. Vive aqui, no modulo — o mesmo lugar e o mesmo motivo
 * de `portalTransition` e de `activeLevel`: e o pouco que precisa sobreviver ao `scene.restart()`.
 */

export type DungeonTrip = {
  /** Qual dungeon esta aberta (1..9). */
  level: number;
  /** O tile do overworld onde o heroi entrou — e onde ele reaparece ao sair. */
  returnX: number;
  returnY: number;
};

let trip: DungeonTrip | null = null;

export const setDungeonTrip = (next: DungeonTrip): void => { trip = next; };

/** Nao consome: a viagem dura enquanto a dungeon estiver aberta, e o portal de saida a le. */
export const getDungeonTrip = (): DungeonTrip | null => trip;

export const clearDungeonTrip = (): void => { trip = null; };
