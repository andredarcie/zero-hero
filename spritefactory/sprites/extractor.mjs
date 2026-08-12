// O EXTRATOR — a maquina que tira as MAOS do heroi do loop, que e a promessa inteira do genero.
//
// O veio de ferro ja e infinito, mas custa tres picaretadas por bloco: enquanto ele foi a unica
// fonte, "producao" e "o jogador batendo numa pedra" eram sinonimos, e nenhuma quantidade de
// esteira ou de bau muda isso. O extrator e o primeiro objeto do jogo que PRODUZ sem ninguem
// olhando — e por isso ele e o unico que justifica a rede de energia existir.
//
// A direcao segue a MESMA lei do braco robotico, e isso e deliberado: `dir` e para onde a
// maquina POE, e ela TIRA de tras. Duas maquinas com `dir` significando coisas diferentes seriam
// a armadilha mais cara que este jogo poderia se dar. Por isso o sprite marca os DOIS lados: a
// BROCA (cunha clara, do lado de tras, onde o veio tem de estar) e o BICO (pip de ouro, do lado
// da frente, por onde o minerio sai). Um olhar ensina a regra sem uma linha de texto.
//
// Oito frames: `dir + 4 * fase`. O corpo NAO gira entre direcoes — um billboard rotacionado
// deita a maquina (a lei dos props: direcao e frame, nunca rotacao). O que muda de lugar sao as
// duas marcas, exatamente como o pip de direcao do braco ja fazia.

const PAL = {
  N: '#141d38', // ink escuro — o peso no chao
  K: '#1d2b53', // ink navy — a carcaca
  C: '#989aa7', // metal base
  D: '#7c7e8b', // metal em sombra
  B: '#5d6165', // o vao escuro do motor
};

// A carcaca, igual nos oito frames. Squat e pesada como a caldeira — a familia visual das
// maquinas deste jogo e "caixa de metal com aro de ink", e o extrator nao inventa outra.
const BODY = [
  '................',
  '................',
  '................',
  '......KKKK......', // a cabeca do motor
  '......KCDK......',
  '......KCDK......',
  '.....KKCDKK.....', // o colar, que e o que separa cabeca de corpo a 1x
  '....KKCCDDKK....',
  '....KCCBBDDK....', // o vao escuro: o unico buraco do sprite
  '....KCCBBDDK....',
  '...KKCCCCDDKK...',
  '...KCCCCDDDDK...', // a base larga, onde as duas marcas moram
  '...KCCCCDDDDK...',
  '...KKKKKKKKKK...',
  '....NNNNNNNN....',
  '................',
];

// Onde a BROCA morde e por onde o minerio SAI, por direcao (N, L, S, O). A broca fica do lado de
// TRAS (o veio), o bico do lado da FRENTE (a saida) — sempre opostos, sempre na borda do corpo.
//
// As duas marcas moram SOBRE a borda da carcaca, nunca soltas ao lado dela: um pixel isolado num
// tile de 16px le como sujeira, e a fagulha da mordida (o unico pixel que se move) precisa nascer
// grudada na broca pra ler como impacto. Por isso a fase nao "estende" a broca — ela ACENDE uma
// ponta de um pixel, que e a micro-variacao que este jogo pede e cabe folgada dentro do tile.
const MARKS = [
  { pip: [7, 3], bit: [7, 13], axis: 'v', bitOut: 1 }, // N: poe pro norte, morde o sul
  { pip: [12, 11], bit: [3, 11], axis: 'h', bitOut: -1 }, // L: poe pro leste, morde o oeste
  { pip: [7, 13], bit: [7, 3], axis: 'v', bitOut: -1 }, // S
  { pip: [3, 11], bit: [12, 11], axis: 'h', bitOut: 1 }, // O
];

export default {
  name: 'extractor',
  kind: 'prop',
  draw({ Pix, hexToRgb }) {
    const gold = hexToRgb('#f1cc36'); // o bico: a mesma lingua de "sai por aqui" do filete do cabo
    const bone = hexToRgb('#cdcdcd'); // a broca: a unica coisa clara do sprite, e por isso o olho vai nela
    const spark = hexToRgb('#f8e394'); // a fagulha da mordida, so na fase batendo

    const frames = [];
    for (let phase = 0; phase < 2; phase += 1) {
      for (let dir = 0; dir < 4; dir += 1) {
        const p = new Pix(16, 16);
        p.stampGrid(BODY, PAL);
        const mark = MARKS[dir];
        const horizontal = mark.axis === 'h';

        // O BICO: dois pixels de ouro na borda da frente, transversais ao sentido da saida.
        const [px, py] = mark.pip;
        if (horizontal) { p.set(px, py, gold); p.set(px, py + 1, gold); }
        else { p.set(px, py, gold); p.set(px + 1, py, gold); }

        // A BROCA: tres pixels de osso ASSENTADOS na borda de tras da carcaca (comendo o ink dela,
        // e por isso sempre coladinhos no corpo). E a unica coisa clara do sprite, entao e pra ela
        // que o olho vai — que e exatamente onde o veio tem de estar.
        const [bx, by] = mark.bit;
        for (let i = -1; i <= 1; i += 1) {
          if (horizontal) p.set(bx, by + i, bone);
          else p.set(bx + i, by, bone);
        }
        if (phase === 1) {
          // A MORDIDA: um pixel de fagulha um passo alem da broca. Um pixel basta porque ele e o
          // unico que muda no sprite inteiro — num tile de 16px isso ja e um evento — e ele nasce
          // grudado na broca, entao nunca le como sujeira solta.
          if (horizontal) p.set(bx + mark.bitOut, by, spark);
          else p.set(bx, by + mark.bitOut, spark);
        }
        frames.push(p);
      }
    }
    return frames;
  },
  notes: 'Extrator v1, 8 frames = dir(N,L,S,O) + 4*fase. Carcaca identica em todas as direcoes '
    + '(direcao e frame, nunca rotacao); o que se move sao as duas marcas OPOSTAS que ensinam a '
    + 'lei do braco de graca — broca clara no lado de TRAS (o veio) e bico de ouro no lado da '
    + 'FRENTE (a saida). A fase 1 avanca a broca um pixel e acende uma fagulha: a silhueta do '
    + 'corpo nunca muda entre frames.',
};
