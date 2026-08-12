// A ESPONJA DE FERRO (a *lupa*) — o que sai de um forno de verdade, e que quase nenhum jogo mostra.
//
// Numa forja antiga o ferro NUNCA chega a derreter. O carvao vira monoxido de carbono, o CO
// arranca o oxigenio do oxido, e os graozinhos de ferro que sobram se juntam no fundo numa massa
// ESPONJOSA encharcada de escoria. Isso nao e uma barra: e um bolo poroso e imprestavel, e o
// unico jeito de virar metal util e MARTELAR quente ate a escoria espirrar fora.
//
// ── O que a arte tem de dizer ───────────────────────────────────────────────────────────────
// Duas coisas, e as duas separam a esponja de tudo mais no inventario:
//   1. **Silhueta IRREGULAR.** O minerio e redondo, o ferro e angular; a esponja e nem uma coisa
//      nem outra — a borda muda de largura linha a linha, com mordidas. E o que le como "massa
//      grudada", e nao como objeto fabricado.
//   2. **O calor vem de DENTRO.** As brasas moram nos vaos do bolo, nunca na superficie: a peca
//      acabou de sair do forno, e o que brilha e a fresta entre os graos. Um sprite com brilho
//      por fora leria como pedra pintada; por dentro, le como coisa quente.
//
// Ela usa a rampa `ember` do jogo — a mesma do fogo e dos coracoes —, e e o unico item do
// inventario que tem cor quente propria. Isso e de proposito: ela e o unico item do jogo que o
// jogador precisa BATER, e a cor e o convite.

export default {
  name: 'bloom',
  kind: 'item',
  palette: {
    N: '#141d38', // ink escuro — os POROS fundos e o contato com o chao
    K: '#3a3f3f', // slate: a ESCORIA encravada no meio do metal
    D: '#5d6165', // metal bruto na sombra
    M: '#7c7e8b', // metal bruto
    L: '#989aa7', // metal bruto na luz
    A: '#a9abbe', // a crosta que pegou luz
    e: '#a53030', // brasa funda, no fundo das frestas
    E: '#e7462a', // brasa viva — so DOIS pixels no sprite inteiro
  },
  // A silhueta e IRREGULAR de proposito, e a irregularidade e o assunto: um bolo de graos soldados
  // nao tem contorno. A largura muda linha a linha (3, 7, 10, 12, 14, 12, 14, 14, 11, 11, 9, 5, 3),
  // as duas beiradas sao serrilhadas em vez de curvas, ha uma corcova subindo a DIREITA do centro
  // e uma mordida aberta no flanco direito (y10). A v2 tinha escoria boa mas voltou a ser um OVO:
  // buraco interno nao conserta contorno liso — quem faz a leitura de "massa" e a borda mudando
  // de largura a cada linha.
  //
  // A ESCORIA (K) sai em pontos espalhados DENTRO da massa, nunca na borda: escoria e sujeira
  // presa entre os graos, e e ela que diz que esta peca ainda nao presta. Sao seis pontos, sem
  // simetria nenhuma — dois pareados leriam como olhos, que e a armadilha que o bloco de ferro ja
  // tinha ensinado.
  //
  // E o CALOR e uma RACHADURA DIAGONAL, de 1 a 2px, correndo do alto-direita para o baixo-esquerda.
  // Foram precisas tres versoes para chegar aqui, e cada erro tem nome:
  //   • v1: losango de brasa no centro — lia como "pedra com nucleo de lava", minerio magico de RPG;
  //   • v2: brasa espalhada pela massa toda — virou confete, e o calor deixou de ter direcao;
  //   • v3: uma coluna vertical com um poro escuro no meio dela — virou um OLHO, que e a mesma
  //     armadilha que o bloco de ferro ja tinha documentado (duas manchas escuras num campo claro
  //     leem como face).
  // A diagonal resolve as tres: ela tem direcao, nao fecha nenhum contorno em volta de nada escuro,
  // e cruza a peca em vez de morar no meio dela. Dois pixels vivos (E) e o resto brasa funda — o
  // bolo esfria por fora e ainda arde por dentro, que e o que sai de uma bloomery.
  frames: [[
    '................',
    '................',
    '........AAL.....',
    '.....AAALLMM....',
    '...AAALLLMeMD...',
    '..AALLLMMEeMDD..',
    '.AALLMMMMeMDDDD.',
    '..ALLKMMEeMDDD..',
    '.LLMKMMeMMMNDDD.',
    '.LMMMMMeMMDDDKD.',
    '..MMMMeMMDD.DD..',
    '..MMKMMMDDDDD...',
    '...DMMDDDKDD....',
    '.....DDDDD......',
    '......NNN.......',
    '................',
  ]],
  notes: 'Esponja de ferro (bloom) 16x16, v2 — a v1 era simetrica demais e tinha um losango de '
    + 'brasa no centro, o que lia como "pedra com nucleo de lava": um minerio magico de RPG, e nao '
    + 'ferro recem-tirado do forno. Agora: silhueta IRREGULAR sem contorno (largura muda linha a '
    + 'linha, corcova em cima, DUAS mordidas abertas na direita), seis pontos de ESCORIA em slate '
    + 'espalhados dentro da massa sem simetria, e o calor quebrado numa fissura fora do centro com '
    + 'apenas dois pixels realmente vivos. Um bolo de graos soldados que esfria por fora e ainda '
    + 'arde por dentro.',
};
