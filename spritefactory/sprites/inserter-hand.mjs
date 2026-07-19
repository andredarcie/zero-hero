// A garra do braco robotico — a peca que efetivamente ATRAVESSA o mapa carregando o item.
//
// Duas decisoes que valem explicar, porque as duas sao consequencia de regras do projeto e nao
// gosto:
//
// 1. A GARRA E UM BILLBOARD SEPARADO DA BASE, e nao parte do sheet da base. A regra fundamental
//    do jogo e "nenhum sprite pode vazar do seu tile" — mas o braco precisa alcancar o tile
//    VIZINHO, que e o proposito inteiro da maquina. Um sprite de 2 tiles quebraria a regra;
//    um segundo quad de 1 tile que VIAJA nao quebra nada. Cada quad continua cabendo no seu
//    tile; o que se move e a posicao, nunca a escala.
//
// 2. A GARRA E SIMETRICA, entao serve as 4 direcoes com um sheet so. Vista de cima, uma pinca
//    de duas hastes nao tem frente nem costas — quem informa a direcao e a BASE (que tem 4
//    frames) e o caminho que a garra percorre. Desenhar 4 garras seria arte a mais dizendo o
//    que a cena ja diz.
//
// Dois frames: ABERTA (indo buscar / largando) e FECHADA (carregando). E o mesmo principio de
// micro-variacao do resto do jogo — entre os dois frames muda o VAO das hastes, nunca a
// silhueta da pinca.

// A mesma paleta da base (v2): corpo na parte media/escura da rampa stone, ink navy como
// estrutura, e o claro so nas arestas. A v1 usava a ponta clara da rampa e o braco saia cromado,
// mais claro do que qualquer coisa em volta — este jogo ancora seus props no navy #1d2b53.
const ST_L = '#989aa7'; // aresta iluminada
const ST_M = '#7c7e8b'; // o metal
const ST_D = '#5d6165'; // lado da sombra
const INK = '#1d2b53'; // a barriga da peca, no navy do jogo

// Vao ABERTO de 1, bem apertado. Com 3 as duas mandibulas ficavam tao separadas que liam como dois
// objetos soltos, e a de fora passava alem da ponta do antebraco — a garra parecia desmontada
// justo no quadro em que ela esta esperando carga (que e o quadro que fica na tela quase o tempo
// todo). Aberta o bastante pra caber o item, junta o bastante pra ser UMA peca.

export default {
  name: 'inserter-hand',
  kind: 'prop',
  layout: 'row',
  palette: { D: ST_D, M: ST_M, L: ST_L, K: INK },
  draw({ Pix, hexToRgb }) {
    const c = {
      L: hexToRgb(ST_L), M: hexToRgb(ST_M), D: hexToRgb(ST_D), K: hexToRgb(INK),
    };

    // v4 — A GARRA PENDE DO NÓ, DEDOS PRA BAIXO. A v3 (e todas as anteriores) desenhava o V
    // abrindo pra CIMA, com o nó embaixo — uma garra esperando coisas cairem do ceu, ao
    // contrario do que a maquina faz: ela DESCE sobre um item que esta no chao. Virada, o nó
    // fica no TOPO (e e nele que a haste do antebraco morre, chegando por cima) e as duas
    // mandibulas descem abrindo — a boca aponta pro item.
    //
    // A virada tambem mata de vez o defeito que derrubou cinco versoes: a haste entupindo a boca
    // da pinca. Com a boca virada pra baixo e a haste chegando por CIMA no nó, nao existe MAIS
    // geometria em que a barra atravesse o vao — o conserto deixou de ser um afastamento (o
    // CLAW_AHEAD do objeto) e virou estrutura.
    //
    // A luz continua vindo de cima, entao o RESHADE acompanha a virada: o nó (agora o alto da
    // peca) leva a aresta L, e as PONTAS dos dedos — o ponto mais baixo — ficam em M, sem luz.
    // Espelhar os pixels sem re-iluminar deixaria a peca acesa por baixo, que e exatamente o
    // "chapado ao contrario" que o linter de form-shading existe pra pegar.
    //
    // Aberta e um V de ponta-cabeca; fechada e um bico com a costura escura no meio, que e o que
    // diz que ainda sao duas pecas e nao um pedaco de metal. O nó (linhas 2-4) e IDENTICO nos
    // dois frames: entre eles muda o vao, nunca a articulacao.
    const PINCER_OPEN = [
      '................',
      '................',
      '.......LL.......',
      '......LMML......',
      '......MKKM......',
      '.....LM..ML.....',
      '....LM....ML....',
      '...LM......ML...',
      '...LM......ML...',
      '..LM........ML..',
      '..MM........MM..',
      '................',
      '................',
      '................',
      '................',
      '................',
    ];

    const PINCER_SHUT = [
      '................',
      '................',
      '.......LL.......',
      '......LMML......',
      '......MKKM......',
      '......LKKL......',
      '......LKKL......',
      '......LKKL......',
      '......LKKL......',
      '......MKKM......',
      '.......MM.......',
      '................',
      '................',
      '................',
      '................',
      '................',
    ];

    const PAL = { L: ST_L, M: ST_M, D: ST_D, K: INK };
    const make = (grid) => {
      const pix = new Pix(16, 16);
      pix.stampGrid(grid, PAL);
      return pix;
    };

    // Frame 2 — O SEGMENTO: uma barra que preenche o quadro INTEIRO, de borda a borda.
    //
    // Ela nao e desenhada no tamanho em que aparece — o jogo estica um unico quad destes entre o
    // ombro e o cotovelo (e outro entre o cotovelo e o punho), que e como as duas partes do braco
    // saem SOLIDAS em vez de uma fileira de pecinhas. Justamente por ser esticada e que ela tem
    // de ser full-bleed: qualquer margem transparente seria esticada junto e a barra chegaria
    // curta, sem encostar nas juntas.
    //
    // Quatro faixas horizontais e nada mais. Esticada no comprimento, a faixa vira a aresta
    // iluminada correndo ao longo da peca; e como a barra fica com poucos pixels de espessura na
    // tela, faixas largas e chapadas reduzem limpo, enquanto detalhe fino viraria cintilacao.
    const makeSegment = () => {
      const pix = new Pix(16, 16);
      pix.fillRect(0, 0, 16, 3, c.L); // a aresta de cima, a unica que pega luz
      pix.fillRect(0, 3, 16, 5, c.M); // o corpo do metal
      pix.fillRect(0, 8, 16, 4, c.D);
      pix.fillRect(0, 12, 16, 4, c.K); // a barriga, no navy do jogo
      return pix;
    };

    // Frame 3 — O PIVO. Um disco escuro com aro claro, desenhado por cima de cada junta (ombro e
    // cotovelo). Sem ele o braco era so uma forma metalica DOBRADA; um disco no vinco e o que diz
    // "isto gira aqui", e e o detalhe que mais barato transforma metal torto em maquina.
    const makePivot = () => {
      const pix = new Pix(16, 16);
      // 3px, um rebite e nao um volante. Quando os quads passaram a ter 1 tile inteiro eu encolhi
      // este disco de 9px pra 5px achando que mantinha o tamanho — mas a conta e 9/16x0.3 = 2,7px
      // antes contra 5/16x1.0 = 5px depois: ele quase DOBROU. Aqui volta ao tamanho que ele tinha.
      pix.set(7, 6, c.L); pix.set(8, 6, c.L);
      pix.set(6, 7, c.L); pix.set(9, 7, c.M);
      pix.set(6, 8, c.M); pix.set(9, 8, c.M);
      pix.set(7, 9, c.M); pix.set(8, 9, c.M);
      pix.set(7, 7, c.K); pix.set(8, 7, c.K); // o furo
      pix.set(7, 8, c.K); pix.set(8, 8, c.K);
      return pix;
    };

    return [make(PINCER_OPEN), make(PINCER_SHUT), makeSegment(), makePivot()];
  },
  notes: 'v4. A pinca agora PENDE do nó com os dedos pra BAIXO — a v3 abria pra cima, uma garra '
    + 'esperando chuva, ao contrario da maquina que desce sobre itens no chao. O nó fica no topo '
    + '(a haste do antebraco morre nele, chegando por cima) e as mandibulas descem abrindo; '
    + 'reshade junto: L no nó (alto), M nas pontas (baixo), porque espelhar sem re-iluminar '
    + 'acenderia a peca por baixo. Quatro frames: pinca ABERTA, FECHADA, SEGMENTO e PIVO. '
    + 'Simetrica de proposito: vista de cima uma pinca de duas hastes nao tem frente, entao um '
    + 'sheet serve as 4 direcoes — quem informa a direcao e a base (4 frames) e a trajetoria. E '
    + 'um quad SEPARADO da base porque o braco precisa alcancar o tile vizinho e nenhum sprite '
    + 'pode vazar do seu tile: o que viaja e a posicao do quad, nunca a escala do sprite. O '
    + 'segmento e full-bleed porque o jogo o ESTICA entre duas juntas: margem transparente '
    + 'esticaria junto e a barra chegaria curta. Paleta = corpo na parte media/escura da rampa '
    + 'stone com barriga em ink navy, que ancora a peca no mundo em vez de sair cromada.',
};
