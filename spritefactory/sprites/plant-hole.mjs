// O buraco de plantio — um pequeno poco escavado no chao, visto de cima (renderiza FLAT).
// A abertura e ink navy (o "preto" do jogo), o aro e terra revirada em nightsoil — as MESMAS
// cores que o mato usa de fundo, entao o buraco parece pertencer ao canteiro. Luz da esquerda:
// o labio esquerdo do aro pega #452939 (nightsoil claro), o direito cai para #3e2533; dentro,
// a parede DIREITA e a iluminada (a luz entra por cima-esquerda e bate na parede oposta).
// Torroes de terra chutados para fora (2px, nunca orfaos) vendem o "recem-cavado".

export default {
  name: 'plant-hole',
  kind: 'prop',
  palette: {
    O: '#141d38', // o fundo do buraco — ink mais fundo
    I: '#1d2b53', // parede interna na sombra
    W: '#324476', // parede interna que pega luz (lado direito — topo da ramp ink)
    R: '#63452c', // aro de terra RECEM-CAVADA iluminado — mais claro que o chao noturno de proposito
    E: '#3e2533', // aro de terra na sombra
  },
  frames: [[
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
  ]],
  notes: 'v2 apos o linter: o aro iluminado subiu de nightsoil para wood escuro #63452c — terra '
    + 'recem-revirada e mais clara que o chao assentado, e e isso que faz o buraco LER de noite '
    + '(v1 sumia: tudo a <=22 luma do chao noturno). Parede interna direita no topo da ramp ink '
    + '(#324476): a luz entra da esquerda e bate na parede oposta — fisica de buraco, nao de '
    + 'morro. Torroes de 2px presos em pares para nao disparar o linter de orfaos.',
};
