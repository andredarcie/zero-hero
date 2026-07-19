// OS ESTAGIOS DE CORTE DA ARVORE-TILE — o que o machado de aco deixa no lugar entre uma
// machadada e a proxima. A arvore seca (prop) encolhe por 6 frames de woods.png; a arvore
// comum e um TILE do atlas, entao os estagios dela tambem precisam ser frames do atlas
// (World3D funde toda arvore em pe numa malha unica que amostra essa textura — nao ha como
// misturar um sheet de prop ali dentro).
//
// DOIS frames, COMPARTILHADOS por todas as 8 arvores-tile (pinheiros 4/14/15/16/17/18 e as
// secas 3/21), e nao um par por arvore. Um toco e um toco: aos 16x16 nao sobra silhueta que
// distinga de qual pinheiro ele veio, e 8 pares seriam 16 frames para dizer a mesma coisa.
//
// A PALETA NAO E INVENTADA: sai medida do proprio frame 4 do forest_tile_set (A folhagem
// oliva, B tronco, C escuro, D preto de base). A unica cor nova e H — a madeira clara do
// corte FRESCO, que e o ponto: o que muda entre "arvore" e "arvore ferida" tem de ser a
// ferida, e ela precisa ler clara contra o tronco escuro.

const A = '#626439'; // folhagem oliva — medida do frame 4
const B = '#815938'; // tronco
const C = '#3a3f3f'; // escuro da massa
const D = '#000000'; // preto da base (o tileset shipped usa preto no contato com o chao)
const H = '#b7916a'; // wood claro — a MADEIRA CORTADA, a unica cor que os estagios acrescentam

export default {
  name: 'tree-chop-stages',
  kind: 'prop',
  // Os pixels "orfaos" do estagio 1 sao da PROPRIA arte shipped (linha 8 do frame 4 do
  // tileset tem folhas soltas nas pontas). Apagar para agradar o linter seria redesenhar o
  // pinheiro do jogo, que e justamente o que estes frames nao podem fazer.
  allowOrphans: true,
  palette: { A, B, C, D, H },
  frames: [
    // Estagio 1 — a COPA SE FOI: sobram os galhos baixos e um toco de tronco decepado saindo
    // deles, com o corte claro no topo. As boughs sao as linhas 6-9 do pinheiro shipped (a
    // parte FOLHADA), deslocadas para o pe do tile, mais a base preta dele nas linhas 14-15.
    // A primeira tentativa reusava as linhas 8-15 e virou um borrao: aquelas linhas sao a base
    // SOMBREADA da arvore, que so le como sombra enquanto ha copa acesa por cima dela.
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '.......HH.......',
      '.......BB.......',
      '....CAAAACAA....',
      '...AADACCAD.A...',
      '..A.AACBAACA.A..',
      '...ACCABCACCA...',
      '...DDDDBBDDDD...',
      '......DDDD......',
    ],
    // Estagio 2 — o TOCO. Some a folhagem inteira: sobra o mesmo tronco, cortado mais rente.
    // A LARGURA E A DO TRONCO DE VERDADE: 2px nas colunas 7-8, medido do frame 4 (linha 14 do
    // pinheiro shipped e literalmente '...DDDDBBDDDD...'). A primeira versao era um cepo de 6px
    // em #815938 macico com o pe em #3a3f3f — tres vezes o tronco que ele diz ter sido, numa cor
    // que no pinheiro inteiro aparece em 7 pixels soltos, e com o pe mais claro que o dos vizinhos.
    // Lia como um bloco novo plantado ali, nao como o que sobrou da arvore: o estagio 1 decepa um
    // tronco de 2px e o estagio 2 o fazia CRESCER.
    //
    // O pe e preto (D) como o de toda arvore em pe, e a linha 15 e a do frame 4 VERBATIM, entao o
    // contato com o chao e identico ao dos pinheiros ao lado. Mas a linha 14 ESTREITA (de 12px
    // para 6): aquela largura toda e a sombra da COPA, e sem copa acesa por cima ela vira o mesmo
    // borrao escuro que reprovou a primeira tentativa do estagio 1.
    [
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
      '.......HH.......',
      '.......BB.......',
      '.......BB.......',
      '.....DDBBDD.....',
      '......DDDD......',
    ],
  ],
  notes: 'Dois estagios compartilhados por toda arvore-tile. O estagio 1 reusa VERBATIM as linhas '
    + '8-15 do frame 4 do tileset, entao a arvore ferida e a mesma arvore com a copa decepada, e '
    + 'nao um desenho novo que so parece. H (#b7916a) e a unica cor acrescentada: a madeira do '
    + 'corte fresco, clara contra o tronco — a ferida tem de ser a coisa que se ve mudar. '
    + 'Os avisos black-outline e edge-touch sao esperados. O preto do estagio 1 e a base do '
    + 'pinheiro shipped reusada verbatim: trocar por #3a3f3f faria a arvore ferida ter um pe '
    + 'mais claro que o das arvores inteiras ao lado dela, que e pior que a regra que ele viola. '
    + 'Quanto ao edge-touch: o kind mais proximo e '
    + '"prop" (nao ha kind de TILE de camada superior), e um tile desses DEVE encostar na borda '
    + '— o pinheiro que ele substitui encosta nas quatro. Nada aqui vaza do tile.',
};
