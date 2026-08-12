// O MINERIO — a pedra que TEM ferro dentro, e que nao e ferro.
//
// Ate aqui o veio cuspia `iron` direto, e isso era uma mentira barata: minerio de ferro e oxido
// (hematita, magnetita) grudado em rocha — quimicamente, ferrugem. Nao se forja, nao se martela,
// nao se usa. Para virar metal ele precisa passar pelo FORNO com carvao, que e quem rouba o
// oxigenio dele. O item novo existe para que essa etapa possa existir.
//
// ── O que a arte tem de dizer, a 16px ───────────────────────────────────────────────────────
// Ele divide a tela com dois vizinhos perigosos, e a silhueta e o unico juiz:
//   • a PEDRA (`stone`, a arte do rock.png) e um calhau redondo, palido e FRIO;
//   • o FERRO (`iron`) e um bloco ANGULAR, de aresta reta e metal limpo.
// Entao o minerio e o meio-termo honesto: **forma de pedra** (redonda, irregular, sem aresta),
// **cor de pedra** — e uma VEIA de ferrugem atravessando. E rocha com metal preso dentro, que e
// exatamente o que ele e.
//
// A ferrugem e a mesma rampa `drywood` dos veios do iron-rock.png, e ela sai em RISCO DIAGONAL,
// nunca em duas manchas pareadas: a 16px, duas manchas escuras simetricas no meio de uma forma
// clara leem como OLHOS (a licao que o bloco de ferro ja tinha aprendido).

export default {
  name: 'ore',
  kind: 'item',
  palette: {
    N: '#141d38', // ink escuro — o contato com o chao
    D: '#5d6165', // pedra na sombra
    M: '#7c7e8b', // pedra base
    L: '#989aa7', // pedra na luz
    A: '#a9abbe', // pedra no brilho (a luz vem da esquerda-acima)
    O: '#733e11', // ferrugem — a MESMA do veio na rocha
    o: '#68380f', // ferrugem na sombra
  },
  frames: [[
    '................',
    '................',
    '................',
    '......AAAA......',
    '....AAAAALLM....',
    '...AAAALLLMMM...',
    '..AAALLoLMMMMD..',
    '..AALLOoLMMMDD..',
    '..ALLOoLMMMDDD..',
    '..LLLLMMMMDDDD..',
    '..LLLMMMMDDDDD..',
    '...MMMMMDDDDD...',
    '....NNNNNNNN....',
    '................',
    '................',
    '................',
  ]],
  notes: 'Minerio de ferro 16x16: forma REDONDA e irregular de pedra (nunca a aresta reta do '
    + 'bloco de ferro, nunca o calhau liso da pedra comum) com uma veia de ferrugem em risco '
    + 'DIAGONAL na rampa drywood — a mesma dos veios de iron-rock.png, que e o fio visual entre a '
    + 'rocha e o que sai dela. Rampa stone com luz da esquerda-acima e sombra chapada; ultima '
    + 'linha em ink escuro ancorando no chao.',
};
