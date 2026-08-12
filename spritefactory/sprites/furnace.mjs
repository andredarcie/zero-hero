// O FORNO — a maquina que faz a QUIMICA de verdade acontecer, e a unica que precisa de carvao.
//
// Ele nao "derrete" minerio: ele o REDUZ. O carvao queimando com pouco ar vira monoxido de
// carbono, e e o CO que arranca o oxigenio do oxido de ferro (Fe2O3 + 3CO -> 2Fe + 3CO2). Por
// isso as duas bandejas pedem coisas diferentes — minerio de um lado, carvao do outro — e por
// isso o carvao nao e "combustivel opcional": sem ele o minerio continua sendo pedra, por mais
// fogo que se jogue em cima.
//
// ── A forma: uma CHAMINE, e nao mais uma caixa de metal ─────────────────────────────────────
// A familia visual das maquinas deste jogo e "caixa de metal com aro de ink" (extrator, caldeira,
// braco). O forno rompe essa familia de proposito: ele e de ALVENARIA — pedra empilhada,
// estreitando para cima, com uma boca em arco na base. Ele e a unica peca pre-industrial da
// fabrica (um bloomery e tecnologia da Idade do Ferro), e a silhueta tem de dizer isso antes de
// qualquer detalhe. A 1x, o que se le e um cone truncado com um buraco embaixo.
//
// A VENTANEIRA — o tubinho de ar que todo forno de verdade tem na base, por onde o fole sopra —
// entra como dois pixels de ink na lateral esquerda. Ela nao faz nada mecanicamente; ela existe
// porque e o detalhe que um ferreiro reconheceria, e porque desenha a razao de a boca acender.
//
// Dois frames: apagado e ACESO. Aceso, a boca vira brasa e a fumaca sai pela chamine — o mesmo
// vocabulario de "isto esta vivo" do filete do cabo e do ferrolho do bau.

const PAL = {
  N: '#141d38', // ink escuro — a base e a boca fria
  K: '#1d2b53', // ink navy — as juntas da alvenaria
  D: '#5d6165', // pedra na sombra (direita)
  M: '#7c7e8b', // pedra base
  L: '#989aa7', // pedra na luz (esquerda)
  A: '#a9abbe', // pedra no brilho
  e: '#a53030', // brasa funda
  E: '#e7462a', // brasa viva
  G: '#f8e394', // o nucleo branco de quente
};

// A alvenaria, igual nos dois frames. A boca fica em (6..9, 10..12) e e o unico buraco do sprite.
const BODY = [
  '................',
  '......KKKK......', // o topo da chamine
  '......KLDK......',
  '......KLDK......',
  '.....KKLDKK.....', // o colar: onde a chamine encontra o corpo
  '....KALLDDMK....',
  '....KALLDDMK....',
  '...KAALLDDMMK...',
  '...KAALLDDMMK...',
  '..KAALLLDDMMDK..',
  '..KAL......MDK..', // a BOCA comeca aqui
  '..KAL......MDK..',
  '..KALL....MMDK..',
  '..KKKKKKKKKKKK..',
  '..NNNNNNNNNNNN..',
  '................',
];

export default {
  name: 'furnace',
  kind: 'prop',
  draw({ Pix, hexToRgb }) {
    const rgb = Object.fromEntries(
      Object.entries(PAL).map(([k, v]) => [k, hexToRgb(v)]),
    );
    // A VENTANEIRA: dois pixels de ink na lateral esquerda da base, na altura da boca. E por ali
    // que o ar entra num forno de verdade — sem ar nao ha CO, e sem CO nao ha ferro.
    const TUYERE = [[1, 11], [1, 12]];
    // A BOCA acesa, de baixo para cima: brasa funda nas beiradas, nucleo branco no meio. Ela
    // preenche o vao que o BODY deixou vazio, nunca desenha por cima da alvenaria.
    const MOUTH_LIT = [
      { xs: [5, 6, 7, 8, 9, 10], y: 10, c: ['e', 'E', 'E', 'E', 'E', 'e'] },
      { xs: [5, 6, 7, 8, 9, 10], y: 11, c: ['e', 'E', 'G', 'G', 'E', 'e'] },
      { xs: [6, 7, 8, 9], y: 12, c: ['e', 'E', 'E', 'e'] },
    ];
    // A FUMACA: tres pixels saindo da chamine, so no frame aceso. Ela e ink, nao cinza claro —
    // fumaca de carvoaria e preta, e o ink e o preto deste jogo.
    const SMOKE = [[7, 0], [8, 0]];

    const frames = [];
    for (let lit = 0; lit < 2; lit += 1) {
      const p = new Pix(16, 16);
      p.stampGrid(BODY, PAL);
      for (const [tx, ty] of TUYERE) p.set(tx, ty, rgb.K);
      if (lit) {
        for (const row of MOUTH_LIT) {
          row.xs.forEach((x, i) => p.set(x, row.y, rgb[row.c[i]]));
        }
        for (const [sx, sy] of SMOKE) p.set(sx, sy, rgb.K);
      } else {
        // Apagado, a boca e um buraco: ink escuro chapado. Um buraco preto le como "cabe coisa
        // aqui", que e exatamente o que a peca quer dizer quando esta parada.
        for (let y = 10; y <= 12; y += 1) {
          for (let x = 5; x <= 10; x += 1) {
            if (y === 12 && (x === 5 || x === 10)) continue;
            p.set(x, y, rgb.N);
          }
        }
      }
      frames.push(p);
    }
    return frames;
  },
  notes: 'Forno (bloomery) 16x16, 2 frames — apagado e aceso. Silhueta de ALVENARIA (cone truncado '
    + 'que estreita para a chamine, com boca em arco na base), rompendo de proposito a familia '
    + '"caixa de metal com aro de ink" das outras maquinas: ele e a unica peca pre-industrial da '
    + 'fabrica. Ventaneira de dois pixels na base esquerda — o tubo de ar sem o qual nao ha CO e '
    + 'portanto nao ha ferro. Aceso, a boca vira brasa com nucleo em gold e sai fumaca de ink '
    + 'pela chamine; apagado, a boca e um buraco escuro que le como "cabe coisa aqui".',
};
