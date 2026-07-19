// Braco robotico ("inserter", estilo Factorio) — a base. QUATRO frames, um por direcao de
// saida: 0=N 1=L 2=S 3=O. Nao e animacao: e orientacao. O billboard do jogo nao tem yaw
// (Billboard3D.setAngle gira no plano da CAMERA, nao no mundo), entao "girar o prop" so pode
// existir como frame escolhido — e por isso que a direcao mora no sheet, nao numa rotacao.
//
// O PEDESTAL E IDENTICO NOS 4 FRAMES — literalmente o mesmo desenho, so a lampada muda de lugar.
// Isso e a regra 8 do padrao ("animacao e micro-variacao, nunca redesenhe a silhueta inteira")
// aplicada a orientacao: o que muda entre uma maquina virada pro norte e uma virada pro leste e
// pra onde ela ENTREGA, nao o corpo dela.
//
// Luz da esquerda como todo o resto do jogo — e essa e a razao de os 4 frames serem desenhados
// a mao em vez de espelhados: espelhar o frame LESTE pra fazer o OESTE inverteria a sombra
// junto com a forma, e a maquina passaria a receber luz da direita so por estar virada.
//
// A PALETA, v3. A v2 usava so a ponta CLARA da rampa stone (#989aa7 / #a9abbe) e a maquina virava
// o objeto mais claro da tela — cromado importado de outro jogo, brigando com tudo em volta.
// Este jogo nao faz isso: o "preto" dele e o navy #1d2b53 e os props sao silhuetas ancoradas nele
// (o vaso e navy sobre navy, o heroi e navy com detalhe verde). Entao o corpo desceu pra parte
// MEDIA/ESCURA da rampa stone, a estrutura e o ink navy, e o claro sobrou so pras arestas que
// pegam luz. Sobra span de sobra pro value-range (#5d6165 -> #989aa7, ~59 de luma) e a peca
// finalmente pertence a mesma noite que a pedra e o vaso.

const ST_L = '#989aa7'; // stone clara — SO as arestas e a face que pega luz
const ST_M = '#7c7e8b'; // stone media — o corpo da maquina
const ST_D = '#5d6165'; // stone escura — o lado da sombra
const INK = '#1d2b53'; // ink navy: o "preto" deste jogo, a estrutura
const INK_D = '#141d38'; // ink fundo — a linha que ancora a maquina no chao
const GOLD = '#f1cc36'; // a lampada de status: pra que lado a maquina ENTREGA

const PAL = { L: ST_L, M: ST_M, D: ST_D, K: INK, N: INK_D, G: GOLD };

// O pedestal, v3 — base LARGA + coluna giratoria, e a perspectiva corrigida.
//
// A v2 era uma laje estreita quase toda de FACE FRONTAL, e isso brigava com a cena de duas
// maneiras. Peso: um braco comprido saindo de uma base fina parece que vai tombar. E perspectiva:
// o mundo e visto quase de cima, entao um objeto no chao tem de mostrar TOPO, nao fachada — uma
// base predominantemente frontal le como um painel em pe, e nao como uma maquina parafusada no
// solo. Aqui a placa e larga (12px), a maior parte dela e a face de CIMA iluminada, a frente
// virou uma tira fina, e quatro parafusos em ink navy marcam os cantos. Por cima dela sobe a
// coluna giratoria de onde o braco de fato sai.
//
// O pedestal, v2 (historico): A v1 era um trapezio com degrade suave e lia como PEDRA — o preview nao
// mentiu: uma massa arredondada com meios-tons macios e exatamente o vocabulario do rock.png.
// Maquina se le por ANGULO RETO, nao por volume: aqui a base e uma laje retangular franca (face
// de cima clara, frente uma parada abaixo, canto direito na sombra) e por cima dela uma torre
// de pivo mais estreita. Os dois blocos empilhados ja dizem "isto foi montado", que e o que o
// trapezio nao dizia. Ultima linha toda em ink como contato com o chao (barrel v3 faz igual).
//
// A face frontal nao e uma chapa lisa: leva a aresta esquerda no alto da rampa (a luz do jogo vem
// da esquerda), o miolo no meio dela e o canto direito descendo ate a sombra. Sem esses dois
// passos a frente virava um retangulo de uma cor so — o linter aprovava, e o olho via papelao.
const PEDESTAL = [
  '................',
  '................',
  '................',
  '................',
  '.....LMMD.......',
  '.....LMMD.......',
  '.....LMMD.......',
  '.....LMMD.......',
  '....LLMMDDD.....',
  '..LKLLLLLLLLKL..',
  '..LLLLLLLLLLLL..',
  '..MKMMMMMMMMKM..',
  '..DDDDDDDDDDDD..',
  '..NNNNNNNNNNNN..',
  '................',
  '................',
];

// O MARCADOR DE DIRECAO — e nao mais um braco desenhado.
//
// Ate a v2 cada frame trazia um toco de braco pintado na propria base, porque naquela epoca a
// direcao SO podia ser lida pela arte da base. Depois que o braco virou geometria de verdade
// (dois retangulos articulados desenhados por fora, que giram), esse toco passou a ser um segundo
// braco FALSO e ESTATICO: a maquina aparecia com uma haste pintada apontando pra um lado enquanto
// a haste real apontava pro outro. Um bracos so.
//
// O que a base ainda precisa dizer e a direcao — e ela precisa dizer isso principalmente no
// EDITOR, onde o braco articulado nao existe e so se ve o sprite. Entao sobra o minimo que
// resolve: a lampada dourada mora no lado pra onde a maquina ENTREGA. Leste e oeste sao os lados
// da face frontal; norte e sul se separam pela ALTURA — a lampada na face de cima (a aresta
// longe) contra a lampada na beirada de baixo (a aresta perto), que e como uma vista de cima
// distingue "pra la" de "pra ca".
const MARK_N = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.......GG.......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const MARK_E = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '...........GG...',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const MARK_S = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.......GG.......',
  '................',
  '................',
  '................',
  '................',
];

const MARK_W = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '...GG...........',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const MARKS = [MARK_N, MARK_E, MARK_S, MARK_W];

export default {
  name: 'inserter',
  kind: 'prop',
  layout: 'row',
  palette: PAL,
  draw({ Pix }) {
    return MARKS.map((mark) => {
      const pix = new Pix(16, 16);
      pix.stampGrid(PEDESTAL, PAL); // a maquina, byte a byte igual nos 4
      pix.stampGrid(mark, PAL); // por cima: so a lampada, do lado pra onde ela entrega
      return pix;
    });
  },
  notes: 'v2 — o braco pintado SAIU. Quatro frames = quatro ORIENTACOES (N/L/S/O), nao quadros de animacao: o billboard '
    + 'do jogo nao tem yaw, entao a direcao do prop tem de vir do sheet. Pedestal byte-a-byte '
    + 'identico nos 4 (regra 8: micro-variacao) para o giro no editor ler como a mesma maquina '
    + 'virando a cabeca. Os 4 sao desenhados a mao em vez de espelhados porque espelhar inverteria '
    + 'a luz junto com a forma — a luz vem da esquerda em todos. Rampa stone inteira (span ~82 de '
    + 'luma) contra a regra value-range; lampada gold como unico ponto quente; ultima linha em ink '
    + 'como contato com o chao. O braco em si nao e mais desenhado aqui: virou geometria (dois '
    + 'retangulos articulados que giram), e manter o toco pintado deixava a maquina com dois '
    + 'bracos, um deles falso e parado apontando pro lado errado.',
};
