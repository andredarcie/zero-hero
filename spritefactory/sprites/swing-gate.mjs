// O PORTAO DE BATER — a mesma grade de metal do portao com fechadura, MENOS a fechadura.
//
// A arte nao e "inspirada" na porta trancada: ela E a porta trancada com a placa da fechadura
// arrancada. Copiada linha por linha de environment/structures/locked_door.png, com as linhas
// 6 a 10 (a caixa da fechadura e o buraco escuro dentro dela) trocadas pelas barras que passam
// por tras. As barras verticais das colunas 3, 6, 9 e 12 e os dois trilhos horizontais das
// linhas 3 e 12 sao os mesmos pixels, nas mesmas colunas — os dois portoes tem de ser
// reconheciveis como a MESMA peca de ferraria, porque e isso que ensina a regra: um tem
// fechadura, o outro nao, e a diferenca entre eles e exatamente o que muda no jogo.
//
// Nenhuma cor nova. A=#a9abbe (o metal claro) e B=#989aa7 (a sombra logo abaixo de cada
// trilho) sao os dois degraus de stone que a porta ja usava; o unico pixel que sai de cena e o
// #1e1e1e do buraco da chave — que era, literalmente, o desenho do que este portao nao pede.
//
// O runtime tinge este sprite igual a porta (0xcfcfcf): metal quase branco estoura em bloom
// debaixo do ambiente noturno, e a barra branca vira neon.

export default {
  name: 'swing-gate',
  kind: 'prop',
  // As barras chegam nas quatro bordas de proposito — um portao e vao de parede, nao um objeto
  // pousado no meio do tile. A porta shipped faz igual.
  palette: {
    A: '#a9abbe', // metal iluminado — barras e trilhos
    B: '#989aa7', // a sombra que cada trilho joga na barra logo abaixo dele
  },
  frames: [[
    '...A..A..A..A...',
    '...A..A..A..A...',
    '...A..A..A..A...',
    'AAAAAAAAAAAAAAAA',
    '...B..B..B..B...',
    '...A..A..A..A...',
    '...A..A..A..A...',
    '...A..A..A..A...',
    '...A..A..A..A...',
    '...A..A..A..A...',
    '...A..A..A..A...',
    '...A..A..A..A...',
    'AAAAAAAAAAAAAAAA',
    '...B..B..B..B...',
    '...A..A..A..A...',
    '...A..A..A..A...',
  ]],
  notes: 'A porta trancada sem a fechadura. Linhas 0-5 e 11-15 sao os pixels da locked_door.png '
    + 'verbatim; as linhas 6-10 (caixa + buraco da chave) viraram a continuacao das barras. '
    + 'Duas cores, como a original. Dois avisos, os dois aceitos de olho aberto: edge-touch e o '
    + 'proprio desenho (um portao vai de borda a borda do tile — a porta shipped recebe o mesmo '
    + 'aviso), e contrast so aparece porque o unico preto da porta era o buraco da chave, que e '
    + 'exatamente o pixel que este portao nao pode ter. O linter mede LUMA; na grama o que '
    + 'separa a grade e o matiz (cinza-lavanda sobre verde), e o preview dia confirma. Escurecer '
    + 'a sombra para agradar a regra faria o portao deixar de ser a mesma peca de ferraria da '
    + 'porta, que e o unico requisito que o jogador consegue ver.',
};
