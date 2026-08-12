// BALAO DE PENSAMENTO: O GRAVETO ACESO — o que falta para o arbusto pegar fogo.
//
// Ele e o irmao do `thought-plate` e nasce da mesma regra: nada neste jogo FALA com o jogador, mas
// alguem pode pensar alto. La quem pensa e a caveira (o que ela quer: a placa); aqui quem pensa e
// o HEROI, no instante em que ele bate num arbusto seco segurando um graveto APAGADO — ele tem a
// coisa certa na mao, e o que falta e uma chama.
//
// A distincao com o balao de item-que-falta (arrancado do jogo em 2026-07-21) e o que torna este
// aceitavel: aquele respondia a QUALQUER fechadura ("va buscar a picareta"), entregando a solucao
// de um enigma que o mundo tinha o dever de ensinar. Este so aparece quando o jogador JA TEM o
// item e ja fez o gesto — nao ha enigma a entregar, ha um passo obvio a lembrar. Por isso a forma
// e de PENSAMENTO (cantos arredondados, rabicho de duas bolhas soltas) e nunca de fala.
//
// A moldura, o pergaminho e o rabicho sao copiados do `thought-plate` de proposito: dois baloes
// com molduras diferentes leriam como dois sistemas, e eles sao o mesmo — so muda o glifo.

const PALETTE = {
  P: '#d0c7b9', // pergaminho — a cor do balao do jogo (herdada de ballon_icon.png)
  K: '#1d2b53', // ink navy — o rebaixo que recorta o glifo do fundo claro
  W: '#815938', // madeira do graveto (a mesma rampa do item na mao)
  w: '#63452c', // madeira na sombra: o graveto tem dois tons ou le como um risco
  E: '#e7462a', // brasa viva — a mesma da boca do forno e das faiscas
  Y: '#f8e394', // o nucleo branco-quente da chama
};

// O glifo mora no vao de 6x4 que a moldura deixa (colunas 5-10, linhas 3-6): chama em cima, cabo
// embaixo. A chama e ASSIMETRICA e afina para um pixel no topo — a primeira versao tinha uma
// cupula simetrica de duas fileiras sobre um talo claro, e o que aquilo desenhava era um COGUMELO.
// Fogo nao tem eixo de simetria; um bico deslocado e um lado mais quente que o outro sao o que
// separam as duas leituras a 1x. O cabo e escuro dos dois lados (a rampa de madeira baixa) porque
// ele precisa contrastar com o pergaminho, nao com a chama.
const BUBBLE = [
  '..PPPPPPPPPPPP..',
  '.PPPPPPPPPPPPPP.',
  '.PPPKKKKKKKKPPP.',
  '.PPPK..Y...KPPP.',
  '.PPPK.EYE..KPPP.',
  '.PPPK..wW..KPPP.',
  '.PPPK..wW..KPPP.',
  '.PPPKKKKKKKKPPP.',
  '.PPPPPPPPPPPPPP.',
  '..PPPPPPPPPPPP..',
  '................',
  '....PPP.........',
  '....PPP.........',
  '....PPP.........',
  '................',
  '..PP............',
];

export default {
  name: 'thought-torch',
  kind: 'icon',
  layout: 'row',
  palette: PALETTE,
  frames: [BUBBLE],
  notes: 'Balao de PENSAMENTO com o graveto ACESO dentro — o irmao do thought-plate, mesma '
    + 'moldura, mesmo pergaminho, mesmo rabicho de duas bolhas soltas (dois baloes com molduras '
    + 'diferentes leriam como dois sistemas). Ele aparece sobre o HEROI quando ele bate num '
    + 'arbusto seco com um graveto APAGADO na mao: nao e a resposta de um enigma (o jogador ja '
    + 'tem o item e ja fez o gesto), e o passo obvio que falta. Chama mais larga que o cabo, com '
    + 'o nucleo claro no alto — e o que faz a silhueta ler como fogo a 1x.',
};
