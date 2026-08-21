import type { HeldItemKind } from '@/game/entities/ItemPickup';

/**
 * O QUE UMA PANCADA TRANSFORMA — a tabela, num lugar só.
 *
 * O chão e o altar usam esta mesma lei. Duas cópias seriam o bastante para uma delas envelhecer
 * errada no dia em que uma segunda receita aparecesse.
 *
 * As pancadas necessárias NÃO moram aqui — são `BLOOM_BLOWS`, e são as mesmas em toda superfície
 * do jogo de propósito: e essa igualdade que mantém o gesto consistente.
 */
export const HAMMER_RESULT: Partial<Record<HeldItemKind, HeldItemKind>> = {
  // A esponja de ferro: a lupa que sai do forno é ferro poroso encharcado de escória, e ela só
  // vira metal útil depois de apanhar quente até a escória espirrar fora.
  bloom: 'iron',
};

/** O que este item vira sob a pancada — `undefined` quando bater nele não leva a lugar nenhum. */
export const hammerResult = (kind: HeldItemKind): HeldItemKind | undefined => HAMMER_RESULT[kind];

/** Bater nisto produz alguma coisa? */
export const isHammerable = (kind: HeldItemKind): boolean => kind in HAMMER_RESULT;
