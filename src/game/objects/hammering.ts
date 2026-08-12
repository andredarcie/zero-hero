import type { HeldItemKind } from '@/game/entities/ItemPickup';

/**
 * O QUE UMA PANCADA TRANSFORMA — a tabela, num lugar só.
 *
 * Ela morava em dois: a do martinete (`HAMMERS`, dentro da máquina) e a do chão (o
 * `strikeBloomAt` da cena, com `bloom → iron` escrito na mão). Duas cópias da mesma lei já é o
 * bastante para uma delas envelhecer errada; com o ALTAR seriam três, e a terceira nasceria
 * discordando no dia em que a segunda receita aparecesse.
 *
 * As pancadas necessárias NÃO moram aqui — são `BLOOM_BLOWS`, e são as mesmas em toda superfície
 * do jogo de propósito: é essa igualdade que faz a automação ser sentida como ALÍVIO (a máquina
 * poupa o gesto, nunca o número) em vez de lida como um upgrade de estatística.
 */
export const HAMMER_RESULT: Partial<Record<HeldItemKind, HeldItemKind>> = {
  // A esponja de ferro: a lupa que sai do forno é ferro poroso encharcado de escória, e ela só
  // vira metal útil depois de apanhar quente até a escória espirrar fora.
  bloom: 'iron',
};

/** O que este item vira sob a pancada — `undefined` quando bater nele não leva a lugar nenhum. */
export const hammerResult = (kind: HeldItemKind): HeldItemKind | undefined => HAMMER_RESULT[kind];

/** Bater nisto PRODUZ alguma coisa? (a pergunta que o martinete e o altar fazem antes de malhar) */
export const isHammerable = (kind: HeldItemKind): boolean => kind in HAMMER_RESULT;
