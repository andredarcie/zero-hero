// O CHÃO DO MUNDO — a superfície mais vista do jogo, e a última que ninguém tinha desenhado.
//
// 87% dos 3.600 tiles de chão do `world.json` são a frame 5 do `forest_tile_set` ("Terra"), e ela
// tem DUAS cores separadas por 5 de luma: um campo de ameixa chapado, invisível a 1×. Ela vem do
// commit inicial — todo tile de terreno que o projeto desenhou depois (mar, dungeon, alvenaria,
// rocha) passou por esta fábrica; o chão nunca passou. Medido no quadro real, esse chão ocupa
// 68-76% da tela e o quadro inteiro sai com desvio de luminância 15; sobre o cobble do cemitério,
// o MESMO renderer, a mesma noite e as mesmas luzes dão 48. A medição inteira está em
// `plano-chao.md`.
//
// Então isto aqui não é um retoque de cor: é a arte que faltava. O que muda é AMPLITUDE e DESENHO,
// nunca o hue — a direção ameixa/cinza do "Ashen Wilds" é do autor e fica onde está.
//
// ── COMO ELE É CONSTRUÍDO ────────────────────────────────────────────────────────────────────
//
// Procedural, e não grid de texto, por uma razão só: um chão precisa de QUATRO pinturas com a
// mesma estatística. Escritas à mão, uma sai mais clara que as outras e o campo ganha manchas que
// ninguém pintou (é a lição do `sea.mjs`, que resolveu isso deslocando UM desenho no toro). Aqui
// as quatro são pinturas de verdade — sementes diferentes — e o que as mantém idênticas em ritmo
// é o corte por QUANTIL: a mesma fração de área em cada degrau da ramp, sempre, seja qual for o
// ruído que a semente sorteou.
//
// **Tudo é periódico no toro de 16×16 por construção** (a treliça do ruído envolve em `mod`, os
// riscos de agulha envolvem em `mod`). É isso que faz a costura fechar entre dois tiles vizinhos
// — inclusive quando eles vestem variantes DIFERENTES, que é o caso em 3 de 4 vizinhos.
//
// Duas oitavas de ruído somam num RELEVO (torrões de 4px + grão de 2px), e o degrau que cada
// pixel veste sai do relevo inteiro, nunca de uma camada só: é "cluster shading, não listras"
// (README da fábrica) obtido por composição em vez de à mão. Por que só duas, e por que 4px é o
// teto: ver o comentário das oitavas lá embaixo — é a lição que custou uma instalação.
//
// ── E O RELEVO É ILUMINADO, QUE É O QUE FAZ ELE LER COMO CHÃO ────────────────────────────────
//
// A primeira versão parou nas bandas de altura e saiu ERRADA — um mosqueado ocupado, com as fendas
// virando poças escuras espalhadas. Faltava a lei que vale para todo pixel deste jogo: **a luz vem
// de cima-à-esquerda** (README: "sombra chapada, luz da esquerda"). Sem ela um campo de ruído é
// ruído; com ela ele é relevo, porque o olho lê a MESMA mancha clara sempre do mesmo lado.
//
// Então a banda de altura é só metade: por cima dela vem a INCLINAÇÃO na diagonal da luz
// (`h(x,y) - h(x-1,y-1)`, envolvida no toro). Onde o terreno sobe em direção à luz o degrau sobe
// um; onde ele foge dela, desce um — e o degrau abaixo da base é a FENDA. Assim a fenda nasce
// exatamente onde ela existe num chão de verdade, encostada no lado escuro de um torrão, em linha
// fina — em vez de ser uma mancha sorteada. É o mesmo desenho do cobble do cemitério (frame 23),
// que é a prova viva neste atlas de que um chão com forma lê: pedra clara em cima, junta escura
// embaixo dela.
//
// Por último a AGULHA SECA de pinheiro (olive, esparsa): a única cor de fora da ramp, e ela tem
// função — liga o chão à COPA que está por cima dele. Um risco de 2px, porque agulha é risco.
//
// A ramp é a `nightsoil`, que ganhou três degraus para isto existir (ver `lib/palette.mjs`). Das
// cinco, a pintura usa QUATRO: o par histórico #3e2533/#452939 está a d=10 um do outro — abaixo do
// limiar de near-duplicate do próprio linter —, então ela pega #452939 e alcança os degraus em
// volta dele.

const TILE = 16;

/**
 * Ruído de valor PERIÓDICO no tile. `cells` divide 16, e os índices da treliça envolvem em `mod`,
 * então `n(0, y) === n(16, y)`: a costura entre tiles vizinhos fecha sem emenda, que é a única
 * exigência inegociável de um tile de terreno.
 */
const periodicNoise = (rng, cells) => {
  const lattice = Array.from({ length: cells * cells }, () => rng());
  const at = (cx, cy) => lattice[(((cy % cells) + cells) % cells) * cells + (((cx % cells) + cells) % cells)];
  const smooth = (t) => t * t * (3 - 2 * t);
  const step = cells / TILE;
  return (x, y) => {
    const fx = x * step; const fy = y * step;
    const x0 = Math.floor(fx); const y0 = Math.floor(fy);
    const tx = smooth(fx - x0); const ty = smooth(fy - y0);
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bot = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bot * ty;
  };
};

// Quanto de área cada degrau de ALTURA ocupa, de baixo para cima (base, torrão, crista). Cortar
// por QUANTIL e não por limiar fixo é o que garante que as quatro variantes tenham exatamente a
// mesma distribuição de valor — o olho pega na hora um tile mais claro que os vizinhos, e nenhum
// limiar fixo sobrevive a uma semente azarada. Soma 1.
const BAND_SHARE = [0.60, 0.28, 0.12];
// A "Terra 2" (a frame 6, 5% do mundo) é a MESMA construção com a terra mais SECA: menos base,
// mais crista. Ela existe porque o autor pinta com ela de propósito, e deixá-la como estava faria
// 5% do chão continuar chapado — o que, ao lado do resto novo, leria como bug e não como variação.
const BAND_SHARE_DRY = [0.44, 0.36, 0.20];
// Que fração dos pixels a luz empurra para cima e a sombra para baixo (cada uma). Também um
// quantil, e pela mesma razão. Passar de ~0.2 e o tile vira um relevo de gesso: toda borda
// acende, e "toda borda acende" é o mesmo que nenhuma.
const SLOPE_SHARE = 0.10;
// Quantos riscos de agulha caem por tile. Esparso de propósito: a agulha é o TEMPERO que liga o
// chão à copa, não um segundo material — passar disto e o chão vira palha.
const NEEDLES = 4;

const paint = (seed, bands = BAND_SHARE) => {
  const rng = (() => {
    // mulberry32 local (o `seededRng` da fábrica chega pelo draw(), mas o ruído precisa de três
    // fluxos INDEPENDENTES por variante — um por oitava — e derivá-los da mesma semente aqui
    // mantém a variante inteiramente determinada por um número só).
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();

  // AS DUAS OITAVAS, E A QUE FOI ARRANCADA.
  //
  // Havia uma terceira, de células de 8px, pesando mais que as outras — e ela é a razão de a
  // primeira versão instalada ter saído um QUILT: no jogo dava para CONTAR os tiles, cada um com
  // sua mancha clara no meio. O preview do sprite não denuncia isso; só o mundo montado denuncia.
  //
  // A causa é geométrica e vale para qualquer textura ladrilhada: um ruído obrigado a ser
  // periódico em 16px com só 2×2 pontos de treliça **tem** os extremos no meio do tile, porque é
  // ali que a interpolação chega longe dos pontos que se repetem na borda. Uma feição do tamanho
  // do tile É o tile. É por isso que o cobble do cemitério tem seis pedras de ~5px e não uma de
  // 16: num ladrilho, o que se vê acima de meio tile é a grade.
  //
  // Então o teto de escala é ~4px, e a variedade grande vem de OUTRO lugar — das quatro pinturas
  // que o hash espalha pelo campo (GROUND_TILE_FRAMES), que é exatamente para isso que elas
  // existem.
  const mid = periodicNoise(rng, 4);   // 4px — os torrões, a maior feição que um ladrilho aguenta
  const fine = periodicNoise(rng, 8);  // 2px — o grão que quebra a borda lisa do torrão

  const height = new Float64Array(TILE * TILE);
  for (let y = 0; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) {
      height[y * TILE + x] = 0.72 * mid(x, y) + 0.28 * fine(x, y);
    }
  }
  const h = (x, y) => height[((((y % TILE) + TILE) % TILE) * TILE) + (((x % TILE) + TILE) % TILE)];

  // Um quantil sobre uma amostra: devolve o valor abaixo do qual cai a fração `q`.
  const quantile = (values, q) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * sorted.length)))];
  };

  // Os cortes de altura (ver BAND_SHARE).
  const cuts = [];
  let acc = 0;
  for (let i = 0; i < bands.length - 1; i += 1) {
    acc += bands[i];
    cuts.push(quantile(height, acc));
  }
  const band = (v) => {
    for (let i = 0; i < cuts.length; i += 1) if (v < cuts[i]) return i;
    return cuts.length;
  };

  // A INCLINAÇÃO na diagonal da luz, e os dois limiares que dizem o que é aresta acesa e o que é
  // aresta na sombra. Medidos nos dois lados por quantil separado: o ruído não é simétrico, e um
  // limiar único deixaria a luz e a sombra com áreas diferentes em cada variante.
  const slope = new Float64Array(TILE * TILE);
  for (let y = 0; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) slope[y * TILE + x] = h(x, y) - h(x - 1, y - 1);
  }
  const lit = quantile(slope, 1 - SLOPE_SHARE);
  const shade = quantile(slope, SLOPE_SHARE);

  const steps = new Int8Array(TILE * TILE);
  for (let y = 0; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) {
      const s = slope[y * TILE + x];
      // Banda de altura (0..2) empurrada um degrau pela luz, e a FENDA é o degrau abaixo da base.
      const step = band(height[y * TILE + x]) + (s > lit ? 1 : 0) - (s < shade ? 1 : 0);
      steps[y * TILE + x] = Math.max(-1, Math.min(2, step));
    }
  }

  // A FENDA É LINHA, NÃO MANCHA — e ela é uma linha DE UM LADO SÓ.
  //
  // Duas versões erradas antes desta, e cada uma ensinou metade:
  //
  //   · sem erosão nenhuma, uma depressão larga sai com o miolo inteiro no degrau mais escuro, e
  //     um miolo escuro de 6px lê como BURACO — o campo vira cascalho, não chão. A junta do cobble
  //     do cemitério (frame 23), a prova viva neste atlas de um chão que lê, tem UM pixel.
  //   · erodindo para o contorno inteiro, cada depressão vira um ANEL FECHADO — e anel fechado num
  //     tile de 16px não lê como fenda, lê como letra: o campo ficou salpicado de "0" e "c".
  //
  // O que resolve é a física que já manda no resto do tile: a fenda é SOMBRA, e sombra cai de um
  // lado só. Sobrevive o pixel encostado em algo mais alto **na direção da luz** (cima-à-esquerda);
  // a beira de baixo-à-direita do mesmo buraco é onde a luz volta a bater, e ali não há fenda
  // nenhuma. Aneis viram arcos, e os arcos apontam todos para o mesmo lugar — que é exatamente o
  // que faz um campo inteiro de tiles ler como um relevo só em vez de como quatro adesivos.
  //
  // Os vizinhos envolvem no toro como todo o resto, senão a erosão se comportaria de um jeito na
  // beira do tile e de outro no meio dele.
  const stepAt = (x, y) => steps[((((y % TILE) + TILE) % TILE) * TILE) + (((x % TILE) + TILE) % TILE)];
  const eroded = new Int8Array(steps);
  for (let y = 0; y < TILE; y += 1) {
    for (let x = 0; x < TILE; x += 1) {
      if (steps[y * TILE + x] !== -1) continue;
      const litRim = stepAt(x - 1, y) > -1 || stepAt(x, y - 1) > -1 || stepAt(x - 1, y - 1) > -1;
      if (!litRim) eroded[y * TILE + x] = 0;
    }
  }

  const grid = [];
  for (let y = 0; y < TILE; y += 1) {
    let row = '';
    for (let x = 0; x < TILE; x += 1) row += 'DBLC'[eroded[y * TILE + x] + 1];
    grid.push(row);
  }

  // A agulha seca, por último e por cima: um risco de 2px numa das quatro diagonais, envolvendo no
  // toro como todo o resto. Ela evita os degraus mais escuros — agulha caída fica POR CIMA do
  // torrão, não dentro da fenda —, o que também impede a única cor de fora da ramp de se enterrar
  // no escuro onde ela só sujaria.
  const cells = grid.map((r) => r.split(''));
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let i = 0; i < NEEDLES; i += 1) {
    const x = Math.floor(rng() * TILE);
    const y = Math.floor(rng() * TILE);
    const [dx, dy] = dirs[Math.floor(rng() * dirs.length)];
    for (let k = 0; k < 2; k += 1) {
      const nx = (((x + dx * k) % TILE) + TILE) % TILE;
      const ny = (((y + dy * k) % TILE) + TILE) % TILE;
      if (cells[ny][nx] !== 'D') cells[ny][nx] = 'N';
    }
  }
  return cells.map((r) => r.join(''));
};

// A variante é inteiramente determinada pela semente, então trocar o número é a única forma de
// repintar uma delas — e é por isso que elas estão escritas aqui em vez de saírem de um contador.
const SEEDS = [0x5eed_0001, 0x5eed_0007, 0x5eed_000d, 0x5eed_0013];
// A ORDEM DO SHEET É A ORDEM DA INSTALAÇÃO, e ela não é arbitrária: as duas primeiras vão para as
// frames 5 e 6 do atlas (as que o `world.json` já guarda, sobrescritas com `--force`) e as três
// últimas para as frames vazias 52..54, no fim do sheet. Ver `plano-chao.md`.
//
//   node spritefactory/factory.mjs build ground-earth
//   node spritefactory/install-tile.mjs ground-earth environment/tilesets/forest_tile_set.png 5  --src=0:2 --force
//   node spritefactory/install-tile.mjs ground-earth environment/tilesets/forest_tile_set.png 52 --src=2:3
const SHEET = [
  paint(SEEDS[0]),                   // → frame 5: "Terra", a base do mundo
  paint(SEEDS[1], BAND_SHARE_DRY),   // → frame 6: "Terra 2", a seca
  paint(SEEDS[2]),                   // → frame 52 ┐
  paint(SEEDS[3]),                   // → frame 53 ├ variantes da "Terra", só arte: nunca guardadas
  paint(SEEDS[0] ^ 0x9e37_79b9),     // → frame 54 ┘ no world.json, escolhidas por hash da coordenada
];

export default {
  name: 'ground-earth',
  kind: 'terrain',
  palette: {
    D: '#2b1a24', // a FENDA entre os torrões — o degrau novo por baixo da base
    B: '#452939', // a base: a cor que o mundo sempre teve, agora como um degrau e não como o tudo
    L: '#563648', // o topo do torrão, onde a terra batida sobe
    C: '#6b4a5c', // a crista iluminada — o degrau que faltava por cima, e o que dá relevo ao tile
    N: '#4d4f2c', // agulha seca de pinheiro (olive): a única cor de fora da ramp, e a que liga
    //               o chão à copa que está em cima dele
  },
  frames: SHEET,
  notes: 'Substitui a frame 5 do forest_tile_set (87% do chão do mundo), que tinha duas cores a 5 '
    + 'de luma uma da outra e vinha do commit inicial. Quatro pinturas periódicas no toro, com a '
    + 'MESMA distribuicao de valor (corte por quantil), porque World3D escolhe a variante por hash '
    + 'da coordenada como ja faz com o mar — a frame guardada no world.json continua sendo 5 e '
    + 'nada do mundo autorado e tocado. Span de valor da nightsoil: 32 -> 86 luma, contra os 5 de '
    + 'antes.',
};
