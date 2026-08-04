// A POSE DE ATAQUE DO HEROI — as duas frames que faltavam na folha dele.
//
// O combate inteiro ganhou corpo e o heroi foi o unico que ficou de fora: todo bicho se agacha ao
// armar (`poseWindup`), a caveira levanta um osso, a espada tem arco, investida e lampejo de
// impacto — e o SPRITE DO HEROI nao mudava um pixel ao golpear. A folha dele tem cinco frames (o
// ciclo de andar 0-3 e as costas 4) e nada nunca escreveu `hero.frame` num ataque. O gesto
// acontecia todo AO LADO dele.
//
// ── AS DUAS FRAMES, E POR QUE SAO DUAS ─────────────────────────────────────
//
// O jogo desenha o heroi DE FRENTE para baixo e para os lados (espelhado), e tem uma unica frame
// de costas para cima. Uma pose de ataque so de frente apareceria de barriga enquanto ele golpeia
// para o norte, entao ela segue a mesma regra do andar: [0] de frente (serve baixo e os dois
// lados) e [1] de costas.
//
// ── A REGRA 8 DA CASA MANDA AQUI ───────────────────────────────────────────
//
// "Animacao e micro-variacao: nunca redesenhe a silhueta inteira entre frames." Entao nenhuma
// destas e um desenho novo — sao a frame parada com DUAS coisas mudadas, e nada mais:
//
//   1. a CABECA MERGULHA um pixel (a fileira das antenas some), que e o corpo entrando no golpe;
//   2. os BRACOS se abrem um pixel para cada lado na fileira mais larga — o gesto de quem lanca
//      peso para a frente.
//
// Um pixel de cada coisa parece pouco escrito assim, e a 16x16 e o maximo que cabe sem virar
// outro personagem: a silhueta do heroi tem 12 pixels de largura, entao dois a mais e um sexto do
// corpo. Somado a investida que ja existe (`HeroView.lungeX`, 0,13 tile) e a raiz de 160ms, e o
// que transforma "ele ficou parado enquanto a espada girava" em "ele deu o golpe".

export default {
  name: 'hero-attack',
  kind: 'character',
  layout: 'row',
  // A paleta EXATA da folha do heroi (extraida dela, nao escolhida): as duas frames tem de poder
  // trocar com as outras cinco no meio de um passo sem uma unica cor pulando.
  palette: {
    A: '#c2c3c7', // as duas antenas
    B: '#b2b2b2', // a haste delas
    C: '#223467', // navy claro — a aresta iluminada
    D: '#1d2b53', // ink navy — o corpo
    E: '#00985b', // verde vivo
    F: '#008751', // verde base — a capa
    G: '#1b284f', // navy escuro
    H: '#027849', // verde escuro
  },
  // O #b2b2b2 nao esta na paleta curada (o mais proximo e o #b5b5b5, do osso) e entra assim mesmo,
  // declarado: ele nao e uma cor NOVA, e uma cor que ja esta na hero.png ha muito tempo. Estas duas
  // frames vao para dentro daquela folha e trocam com as outras cinco no meio de um passo — usar o
  // #b5b5b5 "correto" faria a haste da antena mudar de tom no frame do golpe, que e exatamente o
  // tipo de pulo que a regra existe para impedir. O mesmo vale para o par #1d2b53/#1b284f, que o
  // linter avisa serem quase iguais: eles ja convivem na frame parada.
  allowNewColors: ['#b2b2b2'],
  frames: [
    // [0] DE FRENTE — a cabeca mergulha uma fileira e os bracos se abrem.
    [
      '................',
      '..A..........A..',
      '..B..........B..',
      '..BCCCCCCCCCDB..',
      '..BCDDDDDDDDDB..',
      '...DDEEEFFFDD...',
      '...CDDDFFDDDD...',
      '...CDDDDDDDDD...',
      '..CCEDDDDDCFD...',
      '.DDDDDDDDDDDDDD.',
      '.CDDCCDDCCDDDDD.',
      '..CDDDDDDDDDDD..',
      '..DDDDDDDDDDDG..',
      '...GDDDDDDDDG...',
      '...EGDDDDDDGH...',
      '...EEDGFDGFHH...',
    ],
    // [1] DE COSTAS — aqui a cabeca NAO mergulha (ela encostaria na capa, que ja comeca na fileira
    // 8) e quem se move e a CAPA: ela se abre para os dois lados, que e o que um pano faz quando o
    // corpo gira por baixo dele. Mesma ideia, na unica parte do corpo que esta visivel de tras.
    [
      '..A..........A..',
      '..B..........B..',
      '..BCCCCCCCCCDB..',
      '..BCDDDDDDDDDB..',
      '...DDDDDDDDDD...',
      '...CDDDDDDDDD...',
      '...CDDDDDDDDD...',
      '...DDDDDDDDDD...',
      '.CCEFFFFFFHHH...',
      'CDDEFFFFFFFHH...',
      'CDDEFFFFFFFFHD..',
      'DDEFFFFFFFFFHD..',
      'DDFFFFFFFFFFHD..',
      '.EFFFFFFFFFFH...',
      '.EFFFFFFFFFFH...',
      '..EFFFFFFFFFH...',
    ],
  ],
  notes: 'As duas poses de ataque do heroi, para serem ACRESCENTADAS a folha dele (frames 5 e 6) '
    + 'via install-tile.mjs — a folha cresce numa linha nova e nenhum id existente muda. Sao a '
    + 'frame parada com micro-variacao, na regra 8 da casa: de frente a cabeca mergulha um pixel e '
    + 'os bracos se abrem um para cada lado; de costas a cabeca fica (encostaria na capa) e quem se '
    + 'abre e a capa. Paleta extraida da propria hero.png, para as sete frames poderem trocar entre '
    + 'si sem nenhuma cor pulando.',
};
