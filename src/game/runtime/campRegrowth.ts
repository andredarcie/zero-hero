// O MATO QUE VOLTA (pedido do autor, 2026-11-17: "se o herói não usar o espaço que ele cortou de mato, com o tempo o
// mato cresce outra vez e ele tem que limpar de novo, se ele quiser"). A regra pura; quem a aplica ao mundo é
// objects/CampGrass.
//
// O RELÓGIO é o do jogo, absoluto (o dia + a fração do dia, runtime/timeOfDay): um dia são uns onze minutos jogando, e
// dormir passa a noite depressa — o mato cresce "de um dia para o outro", como se espera.
//   · Um tile cortado e SEM USO fica limpo por um dia inteiro (`REGROW_IDLE_DAYS`);
//   · depois o mato brota e cresce em três degraus no dia seguinte (`REGROW_GROW_DAYS`): o broto, até o joelho, quase;
//   · e então está em pé de novo — bloqueia, e a grade o pinta de vermelho.
// USAR o espaço zera o relógio: uma peça posta nele, o herói passando por ele (trilha pisada não cresce), ou ele ser a
// passagem para alguma coisa (crescer ali trancaria uma peça ou o próprio herói). Quem decide o uso é quem aplica.

export const REGROW_IDLE_DAYS = 1;
export const REGROW_GROW_DAYS = 1;

/** O relógio absoluto do jogo, em dias. */
export const gameClock = (day: number, phaseOfDay: number): number => day + phaseOfDay;

/**
 * Quanto o mato de um tile cortado já cresceu, sem uso desde `idleSince`: 0 = chão limpo; 0,25 / 0,5 / 0,75 = os
 * degraus (o broto, até o joelho, quase); 1 = em pé de novo. Relógio que andou para trás (o painel de testes mudando a
 * hora) conta como nada passado.
 */
export const regrowLevel = (idleSince: number, now: number): number => {
  const idle = Math.max(0, now - idleSince);
  if (idle < REGROW_IDLE_DAYS) return 0;
  const t = (idle - REGROW_IDLE_DAYS) / REGROW_GROW_DAYS;
  if (t >= 1) return 1;
  return 0.25 + Math.floor(t * 3) * 0.25;
};

/** A hora em que o tile teria de ter ficado sem uso para estar em pé AGORA (o painel de testes faz o mato voltar já). */
export const fullyGrownSince = (now: number): number => Math.max(0, now - REGROW_IDLE_DAYS - REGROW_GROW_DAYS);
