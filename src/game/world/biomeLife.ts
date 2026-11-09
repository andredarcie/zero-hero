import { BIOME_IDS, biomeAt, biomeWeightsAt, type BiomeId } from './biomes';

/**
 * ONDE CADA VIDA MORA (pedido do autor: "hoje a tela pode acontecer tanta coisa ao mesmo tempo que fica poluído…
 * restringindo tudo a biomas fica mais focado"). Cada bicho, planta e luz do vale tem UM lar — dois, no máximo —, e
 * só nasce lá. O lugar ganha uma assinatura: no prado voam sementes e corre a lebre; no musgo coaxa o sapo; no
 * bosque de outono o esquilo sobe no carvalho. E nenhuma tela tem tudo ao mesmo tempo.
 *
 *   ash (cinzas)        nada — a terra queimada é silêncio, e o silêncio é a identidade dela
 *   meadow (prado)      margaridas, sementes de dente-de-leão, lebre, libélulas (no lago do prado)
 *   stars (geada)       névoa da manhã, vaga-lumes
 *   woods (mata)        passarinhos, pingos das copas depois da chuva
 *   moss (musgo)        sapos (no laguinho dele), cogumelos de chuva, vaga-lumes
 *   garden (jardim)     o depois da chuva: poças e arco-íris, no gramado aberto do centro
 *   fields (outono)     esquilo, folhas caídas, sol entre as copas, peixes saltando (o bosque e os lagos)
 *
 * Bicho de água só onde há água: o prado tem um lago de 20 tiles, o musgo um laguinho de 7, a mata quase nada.
 *
 * O bioma de um ponto é o que MANDA nele (`biomeAt`); quem segue o herói (sementes, névoa, arco-íris) usa a parte do
 * bioma em volta dele (`lifeShareAt`), para sumir aos poucos na fronteira em vez de apagar de uma vez.
 */
export type LifeKind =
  | 'daisies' | 'seeds' | 'hares' | 'rainbow'
  | 'mist' | 'fireflies'
  | 'birds' | 'mushrooms' | 'drips'
  | 'frogs' | 'dragonflies'
  | 'puddles'
  | 'squirrel' | 'litter' | 'dapples' | 'fish';

export const LIFE_HOMES: Readonly<Record<LifeKind, readonly BiomeId[]>> = {
  daisies: ['meadow'],
  seeds: ['meadow'],
  hares: ['meadow'],
  dragonflies: ['meadow'],
  mist: ['stars'],
  fireflies: ['stars', 'moss'],
  birds: ['woods'],
  drips: ['woods'],
  frogs: ['moss'],
  mushrooms: ['moss'],
  puddles: ['garden'],
  rainbow: ['garden'],
  squirrel: ['fields'],
  litter: ['fields'],
  dapples: ['fields'],
  fish: ['fields'],
};

/** Este tile é lar desta vida. */
export const isLifeHome = (kind: LifeKind, x: number, y: number): boolean =>
  LIFE_HOMES[kind].includes(biomeAt(Math.round(x), Math.round(y)));

/** Quanto deste ponto é lar desta vida (0..1): a fronteira dos biomas é uma mistura, e quem segue o herói esmaece nela. */
export const lifeShareAt = (kind: LifeKind, x: number, y: number): number => {
  const w = biomeWeightsAt(x, y);
  let share = 0;
  for (const id of LIFE_HOMES[kind]) share += w[BIOME_IDS.indexOf(id)];
  return Math.min(1, share);
};
