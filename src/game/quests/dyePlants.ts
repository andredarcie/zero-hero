// AS QUATRO PLANTAS DE TINTA DA IRIS, na ordem em que as sementes saem do pacote. São plantas reais e
// a cor é a que cada uma dá de verdade; como a tinta sai de cada uma está nas falas da Iris (locale
// `npc.painterMake.<kind>`). A cor daqui é a mesma da mesa e da paleta do quadro.

export type DyeKind = 'urucum' | 'anil' | 'curcuma' | 'garanca';

export const DYE_KINDS: readonly DyeKind[] = ['urucum', 'anil', 'curcuma', 'garanca'];

export const DYE_COLORS: Readonly<Record<DyeKind, string>> = {
  urucum: '#e8622c',
  anil: '#3a4eb0',
  curcuma: '#f2c230',
  garanca: '#b3203a',
};

export const DYE_TINTS: Readonly<Record<DyeKind, number>> = {
  urucum: 0xe8622c,
  anil: 0x3a4eb0,
  curcuma: 0xf2c230,
  garanca: 0xb3203a,
};

/** Quantos canteiros a Iris pede, e o que brota neles. */
export const PLOT_COUNT = DYE_KINDS.length;
/** Quanto tempo de jogo entre um nível de crescimento e o próximo. São três níveis. */
export const GROW_STEP_MS = 40000;
export const GROW_LEVELS = 3;
