// SEMENTES CARNÍVORAS — o pacote que vira a planta-armadilha (CarnivorousPlantObject).
//
// A silhueta tem que dizer "semente" E "perigo" a 1x: são três vagens escuras em nightsoil
// (a cor de terra revirada do buraco de plantio — parentesco com o canteiro), cada uma
// coroada por uma PRESA de bone. A presa não é enfeite: é a diferença inteira entre este
// punhado e o punhado comum (seeds.mjs, cascas claras) — quem olha os dois lado a lado na
// bolsa sabe qual morde.
//
// Luz da esquerda (regra 5): o flanco H (#452939, nightsoil claro) fica à esquerda de cada
// vagem, a massa N na sombra à direita.

export default {
  name: 'carnivore-seeds',
  kind: 'item',
  palette: {
    N: '#3e2533', // vagem — nightsoil escuro
    H: '#452939', // vagem, flanco iluminado
    B: '#cdcdcd', // a PRESA — bone, o único brilho
  },
  frames: [[
    '................',
    '................',
    '................',
    '.......B........',
    '......BHN.......',
    '......HHNN......',
    '..B...HHNN...B..',
    '..HN..HHNN..HN..',
    '.HHNN.HHNN.HHNN.',
    '.HHNN..NN..HHNN.',
    '..NN........NN..',
    '................',
    '................',
    '................',
    '................',
    '................',
  ]],
  notes: 'Tres vagens em triangulo (a central maior e a frente), cada uma com a presa de bone '
    + 'no topo — a leitura de "dente" e o que separa este pacote do seeds comum. Nightsoil de '
    + 'proposito: e a paleta do buraco de plantio, entao a semente ja pertence ao canteiro.',
};
