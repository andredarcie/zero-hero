// A BANCADA — a mesa de trabalho, e o lugar onde o jogador CONSTROI.
//
// Ela substitui a caixa de ferramentas de metal, e a troca nao e cosmetica: a peca deixou de ser
// uma maquina que engole dois itens e cospe um terceiro, e virou o lugar onde voce se debruca e
// monta. Uma caixa fechada nao diz isso; uma MESA com ferramentas em cima diz antes de qualquer
// texto.
//
// ── A silhueta, que e a decisao inteira ─────────────────────────────────────────────────────
// Este jogo ja tem tres caixas de madeira — bau, caixote e a antiga caixa de ferramentas — e a 16px
// elas competem. A mesa vence essa disputa por uma coisa que nenhuma caixa tem: **o VAO embaixo**.
// Tampo largo em cima, duas pernas finas embaixo, e ar entre elas. Um jogador nao precisa
// reconhecer as ferramentas para saber que aquilo e uma mesa; a falta de corpo no meio ja conta.
//
// A travessa baixa entre as pernas existe pelo mesmo motivo: sem ela sao duas tabuas soltas, com
// ela e MOBILIA. E o detalhe que qualquer marceneiro poria, e o que impede a peca de ler como
// dois postes.
//
// ── As ferramentas ──────────────────────────────────────────────────────────────────────────
// Duas, e so duas: um SERROTE deitado (lamina clara, cabo escuro) e um MARTELO (cabeca de metal,
// cabo de madeira). Escolhidas por silhueta oposta — uma barra longa e horizontal contra um bloco
// compacto —, porque a 16px tres ferramentas viram sujeira e duas parecidas viram uma mancha. Elas
// sao a UNICA coisa clara do sprite, entao e para elas que o olho vai: o tampo e madeira, e o que
// brilha em cima dele e o trabalho.
//
// Elas projetam sombra de ink na linha de baixo. Sem isso ficam adesivadas no tampo — e uma
// ferramenta colada e uma textura, uma ferramenta com sombra e um OBJETO pousado ali.

const PAL = {
  N: '#141d38', // ink escuro — o pe no chao
  K: '#1d2b53', // ink navy — a aresta do tampo e a sombra das ferramentas
  A: '#63452c', // madeira em sombra
  B: '#815938', // madeira base
  C: '#886644', // madeira pegando luz
  L: '#b7916a', // o tampo, que e a face que a luz de cima realmente ve
  M: '#989aa7', // metal — a cabeca do martelo e o cabo do serrote
  W: '#cdcdcd', // aco claro — a lamina do serrote, o unico branco da peca
};

// O corpo, igual nos dois frames. A unica coisa que muda entre eles e a cabeca do martelo (sobe um
// pixel) e as fagulhas — a lei da animacao da casa: micro-variacao, nunca redesenhar a silhueta.
const BODY = [
  '................',
  '................',
  '................',
  '..LLLLLLLLLLLL..', // o tampo visto de cima
  '..LAWWWWCCMMAA..', // as ferramentas: serrote (cabo+lamina) e martelo (cabeca+cabo)
  '..LCKKCCCCKKCB..', // a sombra das duas, so debaixo delas
  '..KAAAAAAAAAAK..', // a aresta: o vinco de MADEIRA em sombra, com ink so nos cantos
  '...BB......BB...', // as pernas, e o VAO entre elas
  '...BB......BB...',
  '...BB......BB...',
  '...ABBBBBBBBA...', // a travessa: o que faz duas tabuas virarem mobilia
  '...AA......AA...',
  '...NN......NN...',
  '................',
  '................',
  '................',
];

// A BANDEJA, deitada no chao dos dois tiles de tras. Ela continua existindo porque as MAQUINAS
// alimentam a bancada por ali (um braco robotico nao abre menu); o que mudou e que o JOGADOR nao
// precisa mais dela — ele constroi pelo A, direto da mochila.
const SLOT = [
  '................',
  '................',
  '..KK........KK..',
  '..K..........K..',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '..K..........K..',
  '..KK........KK..',
  '................',
  '................',
];

export default {
  name: 'workbench',
  kind: 'prop',
  draw({ Pix, hexToRgb }) {
    const rgb = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, hexToRgb(v)]));
    const gold = hexToRgb('#f1cc36');
    const goldHot = hexToRgb('#f8e394');

    const frames = [];

    // 0 — PARADA.
    const idle = new Pix(16, 16);
    idle.stampGrid(BODY, PAL);
    frames.push(idle);

    // 1 — TRABALHANDO: a cabeca do martelo sobe um pixel e duas fagulhas saltam. Um pixel de
    // deslocamento e um evento num tile de 16px; redesenhar o martelo inteiro seria animacao de
    // outro jogo.
    const work = new Pix(16, 16);
    work.stampGrid(BODY, PAL);
    work.set(10, 4, rgb.C); work.set(11, 4, rgb.C); // o lugar que a cabeca deixou
    work.set(10, 3, rgb.M); work.set(11, 3, rgb.M); // a cabeca, um pixel acima
    work.set(9, 2, gold);
    work.set(12, 2, goldHot);
    frames.push(work);

    // 2 e 3 — a BANDEJA vazia e a carregada (o canal das maquinas).
    const slot = new Pix(16, 16);
    slot.stampGrid(SLOT, PAL);
    frames.push(slot);
    const slotFull = new Pix(16, 16);
    slotFull.stampGrid(SLOT, { ...PAL, K: '#f1cc36' });
    frames.push(slotFull);

    return frames;
  },
  notes: 'Bancada 16x16, 4 frames (parada / trabalhando / bandeja vazia / bandeja carregada). '
    + 'Substitui a caixa de ferramentas de metal: a peca deixou de ser maquina de duas bandejas e '
    + 'virou o lugar onde o jogador CONSTROI, e uma mesa diz isso antes de qualquer texto. A '
    + 'silhueta vence as outras tres caixas de madeira do jogo (bau, caixote, a antiga toolbox) '
    + 'por uma coisa que nenhuma delas tem: o VAO embaixo — tampo largo, duas pernas finas, ar '
    + 'entre elas, e uma travessa baixa que faz duas tabuas virarem mobilia. Duas ferramentas de '
    + 'silhueta OPOSTA (serrote deitado, martelo compacto), as unicas coisas claras do sprite, com '
    + 'sombra de ink por baixo para pousarem no tampo em vez de ficarem adesivadas nele.',
};
