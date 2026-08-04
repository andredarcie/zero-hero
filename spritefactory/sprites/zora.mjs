// O ZORA — o que mora no rio.
//
// A MECANICA e a do Zola do Zelda 1; a ARTE nao pode ser a dele (aquilo e um homem-peixe verde de
// desenho animado, e este jogo nao tem nenhum personagem que fale essa lingua). Este arquivo e a
// quarta versao, e cada uma morreu de uma causa diferente — o registro fica porque as tres causas
// se repetem em qualquer bicho novo:
//
//   v1  corpo em INK NAVY. Passou em todas as regras objetivas e sumia no preview NOTURNO. Lei que
//       saiu disso: **o valor da peca segue a funcao dela** — vulto de fundo pode ser navy, ALVO
//       tem de ler. (E ele so pode ser ferido dentro de uma janela de tempo.)
//   v2  silhueta de peao encapuzado (cabeca e ombros fundidos num sino) e esteira em anel fechado,
//       que le como um OLHO flutuante. Anel fechado com miolo claro E um olho.
//   v3  a esteira estava num quad EM PE. No jogo ela aparecia meio tile ACIMA da agua, boiando no
//       ar. Marca na agua e chao: hoje o frame 0 e desenhado de CIMA, para um quad DEITADO (o mesmo
//       caminho da fissura da caveira, ver ZoraEnemy) — e por isso ele nao tem corpo nenhum, so a
//       agua vista de cima.
//
// ── O QUE ESTA VERSAO FAZ DE DIFERENTE ────────────────────────────────────────
//
// - **Cabeca com ESTRUTURA, nao um bolo.** Focinho que avanca, sobrancelha escura por cima do olho
//   (e ela que faz um pixel vermelho virar OLHO), mandibula de osso por baixo e duas espinhas de
//   crista atras. Sao quatro leituras — o maximo que 16x16 aguenta antes de virar ruido.
// - **Sombra em MANCHA, nao em listra.** A v3 tinha uma coluna de 1px clara na esquerda: isso e
//   contorno, nao volume. Aqui a luz (vem da esquerda, regra 5 do padrao) forma massas — o topo do
//   cranio e o ombro esquerdo pegam luz, a metade direita inteira cai na sombra.
// - **Brilho de MOLHADO, a conta-gotas.** Tres pixels de #bbf2f4 (o mesmo luar da agua) nas quinas
//   que a luz bate. Um contorno inteiro nessa cor viraria neon; tres pixels dizem "pele molhada".
// - **A gola de espuma muda por estado**: emergindo ela e uma COROA alta (a agua ainda esta caindo
//   dele), erguido ela assenta. Sem isso, sair da agua e ficar na agua sao a mesma imagem.
// - **Ele RESPIRA**: o frame 5 e o 2 com micro-variacao (o brilho anda, a espuma troca de lado, a
//   crista abaixa um pixel). Regra 8 do padrao — animacao e micro-variacao, nunca silhueta nova.
//
// ── O QUE ELE PEGA EMPRESTADO DO JOGO ─────────────────────────────────────────
//
// Olho no vermelho da caveira (#a53030: no Zero, o que te caca tem olho vermelho), boca de osso
// (#b5b5b5, a tinta da caveira — e e ela que muda entre "parado" e "vai cuspir") e espuma/onda do
// dump literal de water_0.png. Pele na rampa deepblue, que e mais clara que a noite e mais fria que
// a agua teal em que ele nasce: ele pertence ao rio sem se dissolver nele.

const P = {
  L: '#557998', // pele: a massa que a luz pega (esquerda e topo)
  D: '#3f607e', // pele: o corpo
  d: '#334c62', // pele: a metade na sombra, a crista e o vao da boca aberta
  b: '#b5b5b5', // osso: a mandibula — a mesma tinta da caveira
  R: '#a53030', // o olho, o unico ponto quente da peca
  C: '#bbf2f4', // luar: espuma da agua E o brilho na pele molhada
  c: '#27a9af', // onda (dump de water_0.png)
};

// ── 0. SUBMERSO (quad DEITADO e ADITIVO, visto de CIMA) ────────────────────────
// Nao ha corpo: ha a agua respondendo ao que esta embaixo dela. Dois aneis quebrados abrindo do
// centro, o de dentro em luar e o de fora em onda.
//
// Duas correcoes moram neste frame, e as duas vieram de olhar o JOGO e nao o preview:
//   - a v3 desenhava isto de LADO, num quad em pe: no jogo a marca boiava meio tile acima da agua;
//   - a v4a era um quad deitado LIT com uma massa escura no meio — de noite o quad inteiro apagava,
//     e a unica coisa que avisa o jogador de que algo vai subir ficava invisivel. Agora ele e
//     ADITIVO (a mesma receita da fissura fria da caveira, que faz o mesmo trabalho: telegrafo de
//     chao que precisa ler no escuro), e por isso a arte perdeu a massa escura: em blending aditivo
//     pixel escuro nao existe. Quem carrega o "tem coisa ali" sao os aneis convergindo.
const SUBMERSO = [
  '................',
  '................',
  '.....CC..CC.....',
  '...cc......cc...',
  '..c...CCCC...c..',
  '.c...C....C...c.',
  '.c..C......C..c.',
  '.c..C......C..c.',
  '.c...C....C...c.',
  '..c...CCCC...c..',
  '...cc......cc...',
  '.....CC..CC.....',
  '................',
  '................',
  '................',
  '................',
];

// ── 1. EMERGINDO (em pe) ───────────────────────────────────────────────────────
// A MESMA cabeca do frame ERGUIDO, cinco linhas mais baixa, com a espuma em COROA por cima da base:
// a agua ainda esta caindo dele. O olho fica APAGADO (orbita em sombra, sem o vermelho) — olho
// aceso = janela aberta, e o jogador aprende isso vendo, nao lendo.
const EMERGINDO = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....CDDdd......',
  '...CLDdddDdd....',
  '..CDDdDDDDdd....',
  '.CcLDDDDDdd.cC..',
  'CcCCCCCCCCCCcC..',
  '.cc.cc..cc..cc..',
  '..c..c...c...c..',
  '................',
];

// ── 2. ERGUIDO (em pe) ─────────────────────────────────────────────────────────
// A pose canonica, e a JANELA. Cabeca (1-6) com focinho, sobrancelha, olho e mandibula; pescoco de
// 2px (7-8); corpo estreito entrando na agua (9-11); gola de espuma assentada (12-14). O corpo NAO
// abre em sino: quem e largo aqui e a espuma, e e por isso que ele le como coisa saindo de um
// buraco, e nao como alguem em pe.
const ERGUIDO = [
  '................',
  '.......CDd......',
  '.....CLDDDdd....',
  '...CLDdddDddd...',
  '..CDDRDDDDdd.d..',
  '..LbbDDDDDdd....',
  '...LDDDDDdd.....',
  '.....CDdd.......',
  '.....LDdd.......',
  '....LDDDdd......',
  '...CDDDDDdd.....',
  '..CDDDDDDDdd....',
  '.cCLDDDDDDDdCc..',
  '.cCCCCCCCCCCCc..',
  '..cc.......cc...',
  '................',
];

// ── 3. CUSPINDO (em pe) ────────────────────────────────────────────────────────
// O telegrafo. A mandibula ABRE — o osso vira moldura e o vao fica escuro — e o cuspe ja BRILHA
// dentro dela. Mesma gramatica do resto do bestiario: a peca avisa com o CORPO, e o que avisa e um
// ponto claro no lugar mais escuro do frame.
const CUSPINDO = [
  '................',
  '.......CDd......',
  '.....CLDDDdd....',
  '...CLDdddDddd...',
  '..CDDRDDDDdd.d..',
  '..LbdDDDDDdd....',
  '..CddDDDDdd.....',
  '..bbdDDDdd......',
  '.....LDdd.......',
  '....LDDDdd......',
  '...CDDDDDdd.....',
  '..CDDDDDDDdd....',
  '.cCLDDDDDDDdCc..',
  '.cCCCCCCCCCCCc..',
  '..cc.......cc...',
  '................',
];

// ── 4. O CUSPE ─────────────────────────────────────────────────────────────────
// Uma GOTA, e a terceira tentativa: a estrela de 4 pontas (v3) lia como faisca de metal e o losango
// (v4a) como cristal. Agua e REDONDA e tem casca — nucleo de luar com uma borda de onda em volta —,
// e o que a separa da bala da torreta (que tambem e redonda e azul) e a GOTA QUE SE SOLTA atras:
// girando devagar em voo, ela conta que aquilo esta se desfazendo no ar em vez de voar inteiro.
const CUSPE = [
  '................',
  '................',
  '................',
  '..........cc....',
  '......cccc......',
  '....ccCCCCcc....',
  '...cCCCCCCCCc...',
  '...cCCCCCCCCc...',
  '...cCCCCCCCCc...',
  '....ccCCCCcc....',
  '......cccc......',
  '................',
  '................',
  '................',
  '................',
  '................',
];

// ── 5. ERGUIDO, RESPIRANDO ─────────────────────────────────────────────────────
// O frame 2 com micro-variacao: o brilho do cranio anda um pixel, a crista abaixa, a espuma troca
// de lado. A silhueta e a MESMA — trocar a silhueta entre frames faz o bicho piscar de forma.
const RESPIRANDO = [
  '................',
  '.......LDd......',
  '.....CCDDDdd....',
  '...CLDdddDdd....',
  '..CDDRDDDDdd....',
  '..LbbDDDDDdd.d..',
  '...LDDDDDdd.....',
  '.....LDdd.......',
  '.....CDdd.......',
  '....CDDDdd......',
  '...CDDDDDdd.....',
  '..LDDDDDDDdd....',
  '.cCLDDDDDDDdCc..',
  '..cCCCCCCCCCCc..',
  '...cc.......cc..',
  '................',
];

export default {
  name: 'zora',
  kind: 'character',
  layout: 'column',
  palette: P,
  frames: [SUBMERSO, EMERGINDO, ERGUIDO, CUSPINDO, CUSPE, RESPIRANDO],
  notes: 'O bicho do rio (mecanica do Zola do Zelda 1, lingua visual do Zero), v4. O frame 0 e '
    + 'desenhado DE CIMA porque ele vai num quad deitado na agua — na v3 ele era um quad em pe e '
    + 'flutuava meio tile no ar. A cabeca ganhou estrutura (focinho, sobrancelha sobre o olho, '
    + 'mandibula de osso, duas espinhas de crista) e a sombra virou MANCHA em vez da coluna de 1px '
    + 'da v3, que era contorno e nao volume. Tres pixels de #bbf2f4 marcam pele molhada nas quinas '
    + 'de luz; um contorno inteiro nessa cor viraria neon. A gola de espuma muda entre emergir '
    + '(coroa alta, a agua ainda caindo) e ficar (assentada), e o frame 5 e o 2 com micro-variacao, '
    + 'para ele RESPIRAR parado sem trocar de silhueta.',
};
