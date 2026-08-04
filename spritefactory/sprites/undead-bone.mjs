// O OSSO — a arma da caveira, e a primeira arma de inimigo que este jogo desenha.
//
// Ela existe por uma razao de leitura: o heroi telegrafa o golpe com a ESPADA (o arco que orbita a
// mao dele), e a caveira telegrafava com nada — um clarao, uma pose recuada e um anel no chao, mas
// mao vazia. O bicho que ensinou o combate era o unico que batia sem nada na mao.
//
// A FORMA E UM FEMUR, e ele e SIMETRICO de proposito: o billboard gira em torno do proprio centro
// (Billboard3D.setAngle roda no plano da camera), entao um osso com no de um lado so leria como
// cabeca de martelo girando de ponta-cabeca na metade do arco. Dois nos iguais leem como osso em
// qualquer angulo — e e assim que um femur e de verdade.
//
// A silhueta e GORDO-FINO-GORDO, que e a unica coisa que sobrevive ao tamanho real dele na tela
// (~0,5 tile, uns oito pixels): a essa distancia nao ha textura nenhuma pra ler, so proporcao.
//
// A rampa e a `bone` — a mesma do corpo da caveira (#858585/#b5b5b5), porque a arma dela E ela:
// um morto-vivo empunhando o proprio esqueleto. Um osso de outra cor leria como item apanhado.

export default {
  name: 'undead-bone',
  kind: 'item',
  palette: {
    L: '#cdcdcd', // osso na luz — a coluna da esquerda (regra 5: a luz vem sempre de la)
    B: '#b5b5b5', // osso base — o mesmo tom do corpo da caveira
    D: '#858585', // osso na sombra — o lado direito e a linha de baixo
  },
  // A HASTE E LONGA, e isso e proporcao e nao gosto: com no gordo e haste curta a silhueta vira
  // osso de desenho animado (o brinquedo de cachorro). Um femur e quase todo haste — e e o
  // comprimento dela que faz o arco do golpe parecer uma ALAVANCA quando o billboard gira.
  frames: [[
    '................',
    '.....LL..LL.....',
    '....LBBLLBBD....',
    '....LBBBBBBD....',
    '.....LBBBBD.....',
    '......LBBD......',
    '......LBBD......',
    '......LBBD......',
    '......LBBD......',
    '......LBBD......',
    '......LBBD......',
    '.....LBBBBD.....',
    '....LBBBBBBD....',
    '....LBBDDBBD....',
    '.....DD..DD.....',
    '................',
  ]],
  notes: 'Femur 16x16 vertical e SIMETRICO: dois nos iguais e haste fina, porque o billboard gira '
    + 'em torno do proprio centro durante o golpe e um osso com no de um lado so leria de '
    + 'ponta-cabeca em metade do arco. Silhueta gordo-fino-gordo, a unica coisa legivel no tamanho '
    + 'real dele (~0,5 tile). Rampa bone inteira com luz dura da esquerda (L na coluna esquerda, D '
    + 'na direita e na linha de baixo) — a MESMA rampa do corpo da caveira, porque a arma dela e o '
    + 'proprio esqueleto dela.',
};
