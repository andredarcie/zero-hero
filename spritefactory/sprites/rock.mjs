// A PEDRA — o pedregulho que so a picareta abre (RockObject), no estado INTEIRO.
//
// A arte shipped era uma cunha de DUAS cores (#989aa7 claro / #7c7e8b escuro) partida por uma
// diagonal: metade clara, metade escura, zero forma. Passava no linter (2 cores e o minimo legal)
// e ainda assim e "chapada" pelo criterio do barril v3 — a rampa stone tem quatro degraus e a
// pedra usava os DOIS DO MEIO, justamente os dois mais parecidos entre si (18 luma de diferenca).
//
// O primeiro rascunho aqui foi so trocar a diagonal por um degrade de quatro degraus da rampa, e
// saiu um SEIXO liso: rocha nao tem terminador macio, tem QUINA. Entao a forma virou tres planos
// com quebra dura, e a rampa stone teve de crescer nas duas pontas para os planos se separarem:
//
//   - COROA (H) com um glint de quartzo (W) — o teto, virado para a luz do alto-a-esquerda. O W
//     entra porque a rampa stone acaba antes do branco: sem um degrau acima dela, teto e parede
//     ficam com 18 luma de diferenca e o volume nao fecha. Ele fica 1px para dentro da silhueta —
//     a quina de uma pedra nunca e o ponto mais claro dela, a quina ja esta virando.
//   - FACE FRONTAL (M) e FACE DIREITA (S/D), separadas por um DEGRAU e nao por um esfumado.
//   - O OMBRO: na linha 7 a silhueta salta quatro colunas de uma vez para a direita. Esse canto e
//     o que impede a pedra de ler como pao — a shipped era um cone perfeitamente convexo.
//   - LINHA DE CONTATO (K) — a barriga sem luz. O caixote ancora com uma linha ink; aqui a ink
//     navy embaixo de uma pedra cinza leria como buraco azul, entao o mesmo papel cabe ao slate.
//
// A silhueta termina na linha 13 de proposito, com DUAS linhas vazias embaixo, exatamente como a
// arte antiga: `frameFootPad` (textures3d) mede esse vazio para nao jogar a sombra projetada meio
// tile a favor do vento. Mexer no pe da pedra move a sombra dela.
//
// Um aviso: esta MESMA textura e o item `stone` (ItemPickup GROUND_VISUAL e o back-item do heroi)
// — o pedaco que a picareta derruba. Por isso a leitura tem de sobreviver a 0.7 tile com o halo
// roxo em volta, e nao so a 0.88 como prop.

export const PALETTE = {
  W: '#b5b5b5', // bone — o glint de quartzo no teto. A rampa stone acaba antes do branco, e uma
                //   pedra precisa de um degrau acima dela para o teto virar TETO e nao mais parede.
  H: '#a9abbe', // topo da rampa stone — o plano superior
  M: '#989aa7', // stone base — a face frontal (a cor que a pedra antiga usava como "claro")
  S: '#7c7e8b', // stone sombra — a face direita (o "escuro" da pedra antiga)
  D: '#5d6165', // fundo da rampa stone — rebordo e barriga
  K: '#3a3f3f', // slate — a linha de contato com o chao. NAO e o ink navy: navy embaixo de uma
                //   pedra cinza le como buraco azul; o slate e o mesmo cinza, so que sem luz.
};

export default {
  name: 'rock',
  kind: 'prop',
  palette: PALETTE,
  frames: [[
    '................',
    '................',
    '................',
    '....HHH.........',
    '...HWWHM........',
    '..HHWWHMS.......',
    '..HHHWHMSS......',
    '.HHHHHMMMSSSD...',
    '.HHHMMMSSSSSDDD.',
    '.MMMMMMSSSSSDDD.',
    '.MMMMMSSSSSSDDD.',
    '.MMMMSSSSSSSDDD.',
    '.DMSSSSSSSDDDDD.',
    '..KKKKKKKKKKKK..',
    '................',
    '................',
  ]],
  notes: 'Pedregulho v2 — a shipped tinha 2 cores (os dois degraus do MEIO da rampa stone) e '
    + 'nenhum volume. Aqui: tres planos com quebra dura, glint de quartzo em bone acima da rampa, '
    + 'ombro em canto na linha 7 e linha de contato em slate. Pe na linha 13 (duas linhas vazias) '
    + 'para preservar o footPad que a sombra projetada mede. O par dele e rock-cracked.mjs, que '
    + 'importa esta paleta.',
};
