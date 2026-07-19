// MAR — o tile de terreno que fecha a fronteira do mundo. Nao e decoracao: e a parede.
// Desde que o machado de aco derruba QUALQUER arvore, a borda antiga (uma muralha de
// pinheiros, VOID_WALL_FRAME = 4) virou uma porta destrancada — da pra abrir caminho a
// machadadas e vazar do mapa. O mar e o bloqueio que nenhum item do jogo abre.
//
// A arte NAO e inventada: e o ritmo medido da propria agua do jogo (water_0.png — 3 cores,
// speckle esparso, sem degrade) RE-VALORADO para o fundo escuro da ramp `water`. O rio usa
// o topo claro da ramp (#0b8a8f), o mar usa o fundo (#1f424f). Mesma familia, leitura oposta:
// o rio e raso e voce atravessa (ponte, vau, botas); o mar e fundo e nao tem resposta.
// Por isso o glint do rio (#0b8a8f) aparece aqui como o BRILHO — a cor base de um vira o
// realce do outro, que e o que faz os dois lerem como a mesma agua em profundidades distintas.
//
// TRES VARIANTES, e essa e a diferenca entre um tile de rio e um tile de mar. O rio tem ~30
// tiles e nunca repetiu o bastante pra denunciar o padrao; o mar cobre ~11 mil e, com um frame
// so, o mesmo tracinho vira uma GRADE visivel — papel de parede, nao agua (visto no playtest
// `machado`). As variantes sao o MESMO desenho deslocado no toro (a grade e ciclica, entao
// deslocar preserva densidade, ritmo e o costurar entre tiles vizinhos: nada de emenda nova).
// Deslocamentos primos entre si e em relacao a 16 para os tres nao caminharem juntos.
//
// Terreno: full-bleed, 100% opaco (regra 7). Os 19 pixels transparentes do water_0 — que la
// deixam ver o leito afundado por baixo do quad animado — viram base aqui, porque o mar E o
// chao, nao tem nada embaixo dele.

// water_0.png, medido, com A->D (base), B->M (ondulacao), C->L (glint), transparente->D.
const BASE = [
  'DDMMDDDDDDDDDDDD',
  'DMMDDDDDDDDDDDDD',
  'DDDDDDDDDMLMDDDD',
  'DDDDDDDDDDDDDDDD',
  'DDDMLMDDDDDDDDDD',
  'MDDDDDDDDDDDDMMD',
  'DDDDDDDDDDDMMMDD',
  'DDDDDDMMMDDDDDDD',
  'DDDDDMMMDDDDDDDD',
  'DLMDDDDDDDDDDDML',
  'DDDDDDDDDDDDDDDD',
  'DDDDDDDDMLMDDDDD',
  'DDDMMDDDDDDDDDDD',
  'DDMMMDDDDDDDDDDD',
  'DDDDDDDDDDDMMMDD',
  'DDDDDDDDDDMMDDDD',
];

// Deslocamento ciclico da grade. Ciclico e nao "redesenhado" de proposito: garante que as tres
// variantes tenham exatamente a mesma contagem de cor e o mesmo comprimento de dash, entao o
// linter mede as tres iguais e o olho nao pega uma delas mais clara que as vizinhas.
const shift = (grid, dx, dy) => grid.map((_, y) => {
  const row = grid[(y + dy + grid.length) % grid.length];
  return row.split('').map((_, x) => row[(x + dx + row.length) % row.length]).join('');
});

export default {
  name: 'sea',
  kind: 'terrain',
  palette: {
    D: '#1f424f', // fundo da ramp water — o mar profundo, a cor da massa
    M: '#265160', // a ondulacao, um degrau acima
    L: '#0b8a8f', // o glint — que por acaso e a COR BASE do rio: a mesma agua, mais rasa
  },
  frames: [BASE, shift(BASE, 5, 7), shift(BASE, 11, 3)],
  notes: 'Re-valoracao 1:1 do water_0.png shipped; o ritmo do speckle e o do jogo, medido, nao '
    + 'autoral — o que muda e so a profundidade da ramp. Tres frames deslocados no toro para o '
    + 'oceano nao virar grade: World3D escolhe a variante por hash do tile, e como o frame ja '
    + 'viaja por vertice (aUvBounds) isso nao custa nem um draw call a mais.',
};
