// O HERÓI MEDITANDO (pedido do autor, 2026-11-12: o minijogo de meditação na pedra da colina). Antes ele sentava com o
// quadro de parado achatado (scaleY 0,84), o mesmo do banco e da fogueira: de longe, não lia como meditação.
//
// Sentado de pernas cruzadas, de frente, as mãos (as manoplas navy) nos joelhos: a silhueta vira uma pirâmide, com os
// joelhos como a parte mais larga embaixo. O elmo é o MESMO do quadro de parado (3), pixel a pixel, só mais baixo (ele
// está sentado), e o visor apaga um degrau na rampa do verde (E/F → F/G): os olhos fechados de um elmo. A capa verde,
// que de pé aparece atrás das pernas, aqui cai no chão dos dois lados.
//
// Dois quadros, pela regra da micro-variação (o README): o de EXPIRAR e o de INSPIRAR, em que o elmo e os ombros sobem
// um pixel e o peito cresce uma linha, com as pernas paradas. O jogo troca entre os dois conforme o fôlego do
// jogador (scenes/game/Meditation), então o herói respira junto com quem segura o Z.
//
// Instalado como os quadros 7 e 8 da folha do herói (spritefactory/install-tile.mjs, a folha tem 5 colunas; os
// quadros 0..6 não mudam): HERO_FRAMES.meditate e meditateIn.
const PAL = {
  A: '#c2c3c7', // a ponta dos chifres
  B: '#b2b2b2', // os chifres
  C: '#223467', // o navy na luz (a borda esquerda)
  D: '#1d2b53', // o navy (o ink)
  E: '#3f8f55', // o verde na luz
  F: '#33784a', // o verde
  G: '#28613f', // o verde na sombra
  H: '#1b284f', // o navy na sombra (as juntas, a borda direita)
};

const EXHALE = [
  '................',
  '................',
  '................',
  '..A..........A..', // os chifres
  '..B..........B..',
  '..BCCCCCCCCCDB..', // o elmo (o do quadro 3, três linhas mais baixo)
  '..BCDDDDDDDDDB..',
  '...DDFFFGGGDD...', // o visor apagado um degrau: olhos fechados
  '...CDDDGGDDDD...',
  '...CDDDGGDDDD...',
  '...CDDDDDDDDD...',
  '...CEDDDDDCFD...', // a gola, com a presilha da capa
  '..CDDDDDDDDDDH..', // os ombros
  '.CDDHCDDDDCHDDH.', // os braços (separados do peito por uma junta escura) e as juntas do peito
  'CDDDHHDDDDHHDDDH', // os antebraços descendo até os joelhos: a parte mais larga
  'ECCDDDHHHHDDDHHG', // os joelhos (o esquerdo na luz, o direito na sombra), o colo fundo no meio, e a capa no chão
];

/** Inspirando: tudo do pescoço para cima sobe um pixel, e os ombros ganham uma linha (o peito enche). */
const INHALE = [
  ...EXHALE.slice(1, 13),
  EXHALE[12],
  ...EXHALE.slice(13),
];

export default {
  name: 'hero-meditate',
  kind: 'character',
  layout: 'row',
  palette: PAL,
  frames: [EXHALE, INHALE],
  // As cores são as da própria folha do herói (public/assets/characters/player/hero.png), que o censo antigo de
  // paleta não conhece. O H perto do D (aviso de quase-duplicata) também é do original: são as juntas da armadura.
  allowNewColors: ['#b2b2b2', '#33784a', '#28613f', '#3f8f55'],
  notes: 'O herói sentado de pernas cruzadas, de frente, 2 quadros (expirar, inspirar). As 8 cores da folha do herói, '
    + 'nenhuma nova. O elmo é o do quadro 3; o visor desce um degrau no verde (olhos fechados).',
};
