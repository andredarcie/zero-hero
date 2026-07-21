// BALAO DE PENSAMENTO: PLACA DE PRESSAO — o que o morto-vivo quer, flutuando sobre a caveira.
//
// Nao e o balao de item-que-falta que foi arrancado do jogo (esse FALAVA com o jogador: "va
// buscar a picareta"). Este e a intencao de uma CRIATURA, a mesma gramatica do flash vermelho
// do wind-up: mostra o que o monstro vai fazer antes de ele fazer. Por isso a forma tem que ser
// de PENSAMENTO, nao de fala — o balao antigo (ballon_icon.png) era um retangulo arredondado com
// um rabicho quadrado colado; este e arredondado nos quatro cantos e o rabicho virou DUAS bolhas
// soltas descendo em direcao a cabeca. A distincao existe para o jogador: nada no jogo fala com
// ele, mas o bicho pode pensar alto.
//
// O pergaminho #d0c7b9 e literalmente a cor do balao antigo — a familia visual de "isto e um
// balao" ja estava estabelecida e nao ha motivo para inventar outra. O miolo e a placa desenhada
// com as cores exatas de pressure-plate.mjs (metal #7c7e8b, nucleo ativo #7dde99), e ela aparece
// ACESA: o pensamento nao e "existe uma placa ali", e "aquela placa quer ser pisada".
//
// A borda ink em volta do miolo nao e outline (regra 4) — e o rebaixo da propria placa, o mesmo
// K que separa pad de moldura no sprite original. Sem ele o metal cinza encosta no pergaminho
// claro e o glifo derrete no fundo do balao.

const PALETTE = {
  P: '#d0c7b9', // pergaminho — a cor do balao do jogo (ballon_icon.png)
  K: '#1d2b53', // ink navy — o rebaixo da placa, que recorta o glifo do fundo claro
  M: '#7c7e8b', // metal base da placa (identico a pressure-plate.mjs)
  G: '#7dde99', // nucleo ativo (identico a pressure-plate.mjs) — a placa PISADA
};

const BUBBLE = [
  '..PPPPPPPPPPPP..',
  '.PPPPPPPPPPPPPP.',
  '.PPPKKKKKKKKPPP.',
  '.PPPKMMMMMMKPPP.',
  '.PPPKMGGGGMKPPP.',
  '.PPPKMGGGGMKPPP.',
  '.PPPKMMMMMMKPPP.',
  '.PPPKKKKKKKKPPP.',
  '.PPPPPPPPPPPPPP.',
  '..PPPPPPPPPPPP..',
  '................',
  '....PPP.........',
  '....PPP.........',
  '................',
  '..PP............',
  '..PP............',
];

export default {
  name: 'thought-plate',
  kind: 'icon',
  layout: 'row',
  palette: PALETTE,
  frames: [BUBBLE],
  notes: 'Balao de PENSAMENTO (nao de fala) com a placa de pressao acesa dentro. O rabicho sao '
    + 'DUAS bolhas destacadas, encolhendo para baixo/esquerda — nunca o rabicho colado do balao '
    + 'de dica que foi removido do jogo, justamente para as duas coisas nao lerem igual. As bolhas '
    + 'sao 3x2 e 2x2 (nunca 1px solto) para sobreviverem ao 1x. Pergaminho herdado de '
    + 'ballon_icon.png; metal e verde copiados de pressure-plate.mjs para o glifo ler como a mesma '
    + 'peca que esta no chao.',
};
