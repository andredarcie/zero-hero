/**
 * A CAIXA CERTA PARA LER POEMA (pedido do autor, 2026-11-09: "para o leitor também perceber as rimas"). Toda fala do
 * jogo é verso (dialogos/_verso: quadras rimando o 2º com o 4º, ou o dístico), e a caixa de fala diagrama assim:
 *
 *  · UMA ESTROFE POR CAIXA: os quatro versos juntos — rima de 2º com 4º só existe se os dois estão na tela.
 *  · UM VERSO, UMA LINHA: verso não quebra no meio; a letra encolhe antes (até MIN_VERSE_SCALE), e só se nem assim
 *    couber a sobra desce com recuo fundo, como nos livros, nunca voltando à margem.
 *  · OS QUE RIMAM ENTRAM RECUADOS: o 2º e o 4º da quadra, com a mesma margem — o olho junta as linhas recuadas e
 *    procura a rima no fim delas. O dístico (os dois rimam) não recua.
 *  · TEXTO À ESQUERDA, BLOCO CENTRADO: a caixa tem a largura do verso mais longo da conversa (widestVerse), e não a
 *    da tela; cada verso começa na mesma margem.
 *  · A RIMA TEM TEMPO DE CAIR: a datilografia respira no fim de cada verso, um pouco mais depois do 2º.
 *
 * Aqui moram as regras; quem desenha é DialogLineWriter (os versos) e DialogOverlay (a caixa).
 */

/** Os versos de uma quadra. */
export const QUATRAIN = 4;
/** Os que rimam (o 2º e o 4º), em índice de 0. */
const RHYMING_ROWS: ReadonlySet<number> = new Set([1, 3]);
/** O recuo dos versos que rimam, em em. */
export const VERSE_INDENT_EM = 1.6;
/** A letra encolhe até isto antes de deixar um verso quebrar. */
export const MIN_VERSE_SCALE = 0.78;
/** A respiração da datilografia no fim de cada verso, e o tanto a mais depois do verso que rima no meio da quadra. */
export const VERSE_PAUSE_MS = 170;
export const RHYME_PAUSE_MS = 210;

/** O verso `row` de uma caixa de `count` versos entra recuado? Só o 2º e o 4º de uma quadra inteira. */
export const isIndentedVerse = (count: number, row: number): boolean => count === QUATRAIN && RHYMING_ROWS.has(row);

/** Quanto a datilografia espera a mais depois do verso `row` (o último não espera: a caixa acaba nele). */
export const versePauseAfter = (count: number, row: number): number => {
  if (row >= count - 1) return 0;
  return VERSE_PAUSE_MS + (isIndentedVerse(count, row) ? RHYME_PAUSE_MS : 0);
};

/**
 * O VERSO MAIS LARGO de uma conversa, em px, com o recuo de quem recua: a largura que a caixa precisa para nenhum
 * verso quebrar. Mede num elemento escondido DENTRO de `host`, para herdar a fonte e o tamanho da caixa. Sem layout
 * (o DOM dos testes), dá 0.
 */
export const widestVerse = (host: HTMLElement, texts: readonly string[]): number => {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap;pointer-events:none';
  host.appendChild(probe);
  const indent = parseFloat(window.getComputedStyle(host).fontSize || '0') * VERSE_INDENT_EM;
  let widest = 0;
  for (const text of texts) {
    const verses = text.split('\n');
    verses.forEach((verse, row) => {
      probe.textContent = verse;
      widest = Math.max(widest, probe.offsetWidth + (isIndentedVerse(verses.length, row) ? indent : 0));
    });
  }
  probe.remove();
  return widest;
};
