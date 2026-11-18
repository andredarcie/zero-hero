// A TELA DO FIM, em ordem (pedido do autor, 2026-11-17): o quadro escurece; aparece a frase de que a vida talvez seja
// sobre PEQUENAS COISAS, com elas em destaque; o resto da frase apaga devagar e só as pequenas coisas ficam na tela um
// tempo; elas apagam; vem o "Fim"; e os nomes sobem. A tela é o CreditsRoll; aqui moram só a ordem e o texto, puros.

/** Os instantes da tela do fim, em ms desde que ela começa a escurecer. */
export const ENDING_SCREEN = {
  /** O escuro assentou: a frase aparece. */
  phraseIn: 2600,
  phraseInMs: 1800,
  /** Lida a frase (são umas vinte palavras), o resto dela começa a apagar, devagar. */
  restOut: 9400,
  restOutMs: 3800,
  /** As pequenas coisas, sozinhas na tela, até aqui. */
  smallOut: 17200,
  smallOutMs: 2400,
  /** O "Fim" assenta, e a música do menu volta junto. */
  theEnd: 20400,
  theEndMs: 2200,
  /** Os nomes começam a subir (e só daqui em diante uma tecla pula). */
  roll: 25000,
} as const;

/** Um pedaço da frase: comum, ou o destaque (as pequenas coisas). */
export interface EpigraphPart {
  readonly text: string;
  readonly strong: boolean;
}

/**
 * A frase em pedaços: o trecho entre asteriscos é o destaque (`... sobre *pequenas coisas*.`). Fica no texto e não no
 * código porque cada língua põe as pequenas coisas num lugar da frase. Sem asterisco, a frase inteira é comum.
 */
export const splitEpigraph = (text: string): EpigraphPart[] => {
  const parts: EpigraphPart[] = [];
  text.split('*').forEach((piece, i) => {
    if (piece) parts.push({ text: piece, strong: i % 2 === 1 });
  });
  return parts;
};
