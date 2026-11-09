import { adventureState } from '@/game/runtime/adventureState';

/**
 * AS FALAS JÁ LIDAS (pedido do autor: qualidade de vida). Uma linha que o jogador já viu inteira aparece inteira
 * de uma vez da próxima vez — quem volta à Shui para relembrar onde nasce o próximo cogumelo não espera a
 * datilografia de novo. A fala nova continua com o ritmo e a voz de sempre.
 *
 * O save guarda um RESUMO curto de cada texto (hash + tamanho), não o texto: são centenas de linhas, e o save é
 * pequeno. Trocar de idioma muda o texto, então a linha volta a ser nova — e é mesmo, para quem a lê.
 */
const digest = (text: string): string => {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(36)}.${text.length.toString(36)}`;
};

export const wasLineRead = (text: string): boolean => adventureState().readLines.has(digest(text));

export const markLineRead = (text: string): void => {
  adventureState().readLines.add(digest(text));
};
