// O buraco de plantio — um pequeno poco escavado no chao, visto de cima (renderiza FLAT).
// A abertura e ink navy (o "preto" do jogo), o aro e terra revirada em nightsoil — as MESMAS
// cores que o mato usa de fundo, entao o buraco parece pertencer ao canteiro. Luz da esquerda:
// o labio esquerdo do aro pega #452939 (nightsoil claro), o direito cai para #3e2533; dentro,
// a parede DIREITA e a iluminada (a luz entra por cima-esquerda e bate na parede oposta).
// Torroes de terra chutados para fora (2px, nunca orfaos) vendem o "recem-cavado".

export default {
  name: 'plant-hole',
  kind: 'prop',
  layout: 'column',
  palette: {
    O: '#141d38', // o fundo do buraco — ink mais fundo
    I: '#1d2b53', // parede interna na sombra
    W: '#324476', // parede interna que pega luz (lado direito — topo da ramp ink)
    R: '#63452c', // aro de terra RECEM-CAVADA iluminado — mais claro que o chao noturno de proposito
    E: '#3e2533', // aro de terra na sombra
  },
  frames: [
    // Frame 0 — o BURACO PRONTO, pixel a pixel o de sempre: e o frame que todo canteiro (autorado
    // ou cavado) mostra em repouso, entao toda referencia `frame: 0` do jogo continua valendo.
    [
      '................',
      '................',
      '................',
      '................',
      '.....RRRRRE.....',
      '....RIIIOIWE....',
      '...RIOOOOOIWE...',
      '...RIOOOOOOWE...',
      '...REIOOOOIWE...',
      '....REIIOIEE....',
      '..RR.EEEEEE.....',
      '..RE......EE....',
      '................',
      '................',
      '................',
      '................',
    ],
    // Frame 1 — o RASPAO: a primeira mordida da lamina. Um risco raso, so aro e sombra.
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '......RRRE......',
      '.....RIIIWE.....',
      '......EEE.......',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    // Frame 2 — a DEPRESSAO: a bacia rasa no tamanho ~70%, ainda sem o poco fundo (sem O).
    [
      '................',
      '................',
      '................',
      '................',
      '................',
      '.....RRRRE......',
      '....RIIIIWE.....',
      '....RIIIIWE.....',
      '.....REIIEE.....',
      '......EEEE......',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    // Frame 3 — o FUNDO: o buraco inteiro, MENOS os torroes chutados para fora — eles so
    // aparecem no frame 0, no mesmo instante em que a ultima leva de torroes voa (GameScene).
    [
      '................',
      '................',
      '................',
      '................',
      '.....RRRRRE.....',
      '....RIIIOIWE....',
      '...RIOOOOOIWE...',
      '...RIOOOOOOWE...',
      '...REIOOOOIWE...',
      '....REIIOIEE....',
      '.....EEEEEE.....',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
  ],
  notes: 'v3: virou SHEET em coluna (16x64) — a cavada da pa acontece AOS POUCOS, e cada tempo e '
    + 'um frame: raspao (1) → depressao (2) → fundo (3) → pronto (0). A ordem no PNG poe o frame '
    + 'final no topo para toda referencia `frame: 0` existente continuar apontando pro buraco de '
    + 'sempre. Cada estagio e um SUBCONJUNTO do desenho final (a licao da flor-da-lua: estados de '
    + 'uma peca sao a mesma arte em tempos diferentes, nunca desenhos irmaos) — e os torroes '
    + 'externos existem SO no frame 0: eles sao chutados pra fora na ultima pazada. '
    + 'v2 apos o linter: o aro iluminado subiu de nightsoil para wood escuro #63452c — terra '
    + 'recem-revirada e mais clara que o chao assentado, e e isso que faz o buraco LER de noite '
    + '(v1 sumia: tudo a <=22 luma do chao noturno). Parede interna direita no topo da ramp ink '
    + '(#324476): a luz entra da esquerda e bate na parede oposta — fisica de buraco, nao de '
    + 'morro. Torroes de 2px presos em pares para nao disparar o linter de orfaos.',
};
