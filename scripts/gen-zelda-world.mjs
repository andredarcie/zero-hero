// Gera public/world.json a partir do MAPA DO OVERWORLD DO ZELDA 1, tile a tile.
//
//   node scripts/gen-zelda-world.mjs --src <overworld.png> [--preview] [--out public/world.json]
//
// A fonte e a folha 1:1 do overworld (4096x1408 = 256x88 tiles de 16px). Ela NAO fica versionada
// aqui — o mundo gerado e que e o artefato. Para re-rodar:
//   curl -o overworld.png "https://ian-albert.com/games/legend_of_zelda_maps/zelda-overworld%28map%29.png"
//
// ⚠️  TEM DE SER A FOLHA `(map)`, QUE E A LIMPA. O arquivo `zelda-overworld.png` do mesmo site e a
// versao ANOTADA: o autor pintou por cima letras de gruta, icones do item que cada caverna guarda,
// e realces laranja nas paredes com segredo. Sao 1.004 tiles alterados, e para um classificador
// isso nao e legenda, e terreno: 334 tiles de chao aberto viraram PAREDE (a marca deixa de ser
// plana, e planura e o que separa piso de objeto) e 407 tiles trocaram de andavel para bloqueado.
// A primeira geracao deste mundo saiu com esse defeito. Um mapa de fa e ilustracao, nao dado.
//
// ⚠️  ESTE SCRIPT RODA UMA VEZ. Depois de gerado, `public/world.json` e AUTORADO A MAO no /editor
// e este script vira andaime — exatamente o mesmo aviso que `gen-levels.mjs` carrega, e pela mesma
// razao: um script que sobrescreve autoria e uma bomba-relogio. Se for preciso rodar de novo,
// aponte --out para outro lugar e faca o merge a mao.
//
// COMO A CLASSIFICACAO FUNCIONA, e por que ela nao olha cor.
//
// O mapa do Zelda troca a PALETA a cada tela: o mesmo desenho de parede e mata verde numa tela e
// penhasco marrom na outra, a mesma arvore e verde aqui e branca ali. Classificar por cor exata
// acha 336 tiles distintos para ~8 coisas, e classificar pela "cor do chao da tela" quebra nas
// telas onde o chao nao e o mais comum (uma tela de lago e majoritariamente agua).
//
// Duas medidas resolvem tudo, e nenhuma das duas depende de paleta:
//
//   1. PLANURA — a fracao do tile ocupada pela sua PROPRIA cor mais comum. Medido: chao 1.00 e
//      0.93; agua 0.97; e TUDO que tem estrutura (arvore, penhasco, ponte, lapide, estatua) fica
//      em 0.38–0.59. O vale entre 0.6 e 0.85 e largo e vazio: e a fronteira entre "piso" e
//      "objeto", e ela se sustenta em qualquer paleta.
//   2. ASSINATURA ESTRUTURAL — cada pixel virando o RANK da sua cor dentro do proprio tile. Isso
//      colapsa as 336 cores em 243 formas exatas, e a mesma arvore em cinco paletas vira uma
//      forma so. Entao "isto e uma arvore" e comparar com a assinatura de UM tile de referencia
//      conhecido do mapa (TREE_REF), e nao uma heuristica que erra na tela seguinte.
//
// O resto sao sinais grosseiros e obvios: azul dominante = agua; faixas alternadas de azul e
// madeira = ponte; tile majoritariamente preto = boca de caverna (nada mais no overworld chega
// perto: o contorno de um penhasco fica em 0.27).
//
//   3. A COR DE QUE A PAREDE E FEITA decide mata ou rocha — e para perguntar isso e preciso
//      ignorar tanto o PRETO do contorno quanto o CHAO que aparece por baixo. As duas cores de
//      chao do mapa (#fcd8a8 e #747474) sao derivadas dele mesmo, nao escritas aqui. Sem ignorar
//      o chao, o tile de BORDA de uma massa — onde mais da metade do quadrado e o chao vazando —
//      cai na regra "nao e verde, logo e rocha", e toda beirada de mata ganha uma pedra: a
//      primeira tela do jogo, que no Zelda nao tem uma pedra sequer, nascia com seis.
//      E uma parede feita de AZUL e a quina da margem — nem metade azul, nem plana —, que e agua.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, writePng } from '../spritefactory/lib/png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── O tamanho, que e o do Zelda e nao um numero escolhido aqui ────────────────────────────────
const MAP_W = 256; // tiles
const MAP_H = 88;
const CHUNK = 12; // CHUNK_COLUMNS/CHUNK_ROWS — validado no load
// 256x88 nao divide por 12, e o schema exige uma grade retangular de chunks. Entao o mapa do
// Zelda entra INTEIRO, sem escala, dentro de 22x8 chunks (264x96) e sobra uma moldura de 4 tiles
// de mar em volta. A borda do mundo ja e o mar por lei do projeto (SOLID_GROUND_FRAMES), entao a
// moldura nao e enchimento: e a costa que o jogo ja usa como fim do mundo.
const CHUNKS_X = 22;
const CHUNKS_Y = 8;
const OFFSET_X = Math.floor((CHUNKS_X * CHUNK - MAP_W) / 2); // 4
const OFFSET_Y = Math.floor((CHUNKS_Y * CHUNK - MAP_H) / 2); // 4

// ── Frames do forest_tile_set.png (3 colunas, row-major) ──────────────────────────────────────
const G_DIRT = 5;
const G_DIRT2 = 6;
const G_STONE = 23;
const G_STONE_MOSS = 24;
const G_GRAVE_SLAB = 32;
const G_OPEN_GRAVE = 31;
const G_SEA = 33;
const PINES = [4, 14, 15, 16, 17, 18];
// CLIFF_WALL_FRAMES — a montanha. E a MESMA pintura de pedra do chao (G_STONE/G_STONE_MOSS),
// instalada em pe no atlas, e o World3D a assa em CUBO. O gerador planta so a lisa: o musgo (40)
// existe para quem autora a mao no /editor, e um bloco de vinha isolado a cada tres tiles de
// montanha le como ruido, nao como textura.
const U_CLIFF = 39;
const U_CLIFF_MOSS = 40;
const U_TOMB = 25;
const U_SPIKE_HEAD = 22;
// Decoracao que NAO bloqueia (nenhuma esta em SOLID_UPPER_FRAMES): folhagem, arbusto, cogumelo,
// graveto, pedra solta. E o "mato" do pedido — o que faz o chao nao ser um tapete liso.
const DECOR = [0, 7, 8, 19, 20, 1, 10, 11, 9, 2, 12, 13];
const DECOR_WEIGHTS = [10, 10, 10, 8, 8, 6, 3, 3, 5, 4, 3, 3];

// ── Ruido deterministico: o mesmo world.json toda vez ─────────────────────────────────────────
const hash = (x, y, salt = 0) => {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
};

// ── Classificacao ─────────────────────────────────────────────────────────────────────────────
const GROUND = 'ground';
// O SEGUNDO CHAO. Medido no original: o piso andavel tem exatamente DUAS cores — #fcd8a8 bege em
// 8.768 tiles e #747474 cinza em 996. O cinza e o cemiterio e os patios de pedra, e como o mapa
// troca de paleta por tela mas NAO troca a cor do chao dentro de uma regiao, essa unica distincao
// de cor devolve de graca a segunda geografia do mapa. Sem ela o cemiterio fica igual ao campo.
const PAVED = 'paved';
const TREE = 'tree';
const CLIFF = 'cliff';
const WATER = 'water';
const CAVE = 'cave';
const BRIDGE = 'bridge';
const GRAVE = 'grave';
const STATUE = 'statue';

// Tiles de referencia, por coordenada no mapa original. A assinatura estrutural deles e o que
// define a classe — e independente de paleta, entao UM exemplo cobre todas as telas.
const TREE_REF = [30, 22]; // a copa redonda solta no chao
const GRAVE_REF = [3, 25]; // a lapide do cemiterio
// O TABULEIRO DE MADEIRA MACICA. O Zelda desenha ponte de dois jeitos: sobre o rio estreito ela
// e agua com as tabuas atravessadas (faixas alternadas, pega pelo teste de linha/coluna), e sobre
// o rio largo ela e madeira INTEIRA, sem um pixel de agua — e essa nao tem faixa nenhuma para
// testar. Sem ela, o unico atravessadouro do rio que corta Hyrule ao meio some e o mapa vira duas
// ilhas: 53% do chao alcancavel a pe em vez de 88%. E a passagem mais importante do mundo.
const DECK_REF = [85, 71];

const classify = (img) => {
  const { width: W, data } = img;

  const measure = (tx, ty) => {
    const hist = new Map(); const px = [];
    let blue = 0; let black = 0; let white = 0;
    const rowBlue = new Array(16).fill(0);
    const colBlue = new Array(16).fill(0);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const i = ((ty * 16 + y) * W + tx * 16 + x) * 4;
        const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
        const c = (r << 16) | (g << 8) | b;
        px.push(c); hist.set(c, (hist.get(c) || 0) + 1);
        if (b > r + 40 && b > g + 40) { blue++; rowBlue[y]++; colBlue[x]++; }
        if (r < 40 && g < 40 && b < 40) black++;
        if (r > 200 && g > 200 && b > 200) white++;
      }
    }
    const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const rank = new Map(sorted.map(([c], k) => [c, k]));
    return {
      sig: px.map((c) => rank.get(c)).join(''),
      // As cores do tile em ordem de area. Quem decide mata-ou-rocha e escolhido DEPOIS, ja
      // sabendo quais cores sao chao (ver groundColors) — a decisao nao cabe aqui dentro.
      top: sorted.slice(0, 8).map(([c]) => c),
      flat: sorted[0][1] / 256,
      blue: blue / 256,
      black: black / 256,
      white: white / 256,
      // A PONTE e faixas alternadas de agua e tabua — e a direcao das faixas e a direcao da
      // ponte. Uma ponte norte-sul tem as tabuas em LINHAS; uma leste-oeste, em COLUNAS. Testar
      // so as linhas achava as primeiras e perdia as segundas, que sao justamente as que cruzam
      // o rio que corta Hyrule ao meio — com elas de fora, metade do mundo ficava ilhada.
      blueRows: rowBlue.filter((v) => v >= 12).length,
      dryRows: rowBlue.filter((v) => v === 0).length,
      blueCols: colBlue.filter((v) => v >= 12).length,
      dryCols: colBlue.filter((v) => v === 0).length,
    };
  };

  const treeSig = measure(...TREE_REF).sig;
  const graveSig = measure(...GRAVE_REF).sig;
  const deckSig = measure(...DECK_REF).sig;

  const isBlack = (c) => ((c >> 16) & 255) < 40 && ((c >> 8) & 255) < 40 && (c & 255) < 40;

  // AS CORES DO CHAO, derivadas do proprio mapa: a cor dominante de todo tile plano que nao e
  // agua nem boca de caverna. Dao duas (#fcd8a8 bege e #747474 cinza), e nao estao escritas aqui
  // de proposito — se a fonte mudar, elas se redescobrem.
  //
  // Elas existem por causa de um erro que este gerador cometeu: para decidir se uma parede e mata
  // ou rocha eu pegava a cor dominante ignorando so o PRETO do contorno. Mas o tile de BORDA de
  // uma massa — onde mais da metade do quadrado e o chao aparecendo por baixo — tem o chao como
  // dominante, e a regra "nao e verde, logo e rocha" plantava uma pedra na beirada de toda mata.
  // A primeira tela do jogo, que no Zelda nao tem uma pedra sequer, nascia com seis. Ignorar
  // tambem o chao faz a pergunta certa: DO QUE esta parede e feita, e nao o que se ve nela.
  const groundColors = new Set();
  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const m = measure(tx, ty);
      if (m.flat >= 0.85 && m.blue < 0.5 && m.black < 0.5) groundColors.add(m.top[0]);
    }
  }

  /** A cor de que a parede e FEITA: a maior area que nao e contorno nem chao vazando por baixo. */
  const wallColor = (m) => m.top.find((c) => !isBlack(c) && !groundColors.has(c)) ?? 0;
  const isGreen = (c) => ((c >> 8) & 255) > ((c >> 16) & 255) + 20 && ((c >> 8) & 255) > (c & 255) + 20;
  const isBlue = (c) => (c & 255) > ((c >> 16) & 255) + 40 && (c & 255) > ((c >> 8) & 255) + 40;
  const isGray = (c) => {
    const r = (c >> 16) & 255; const g = (c >> 8) & 255; const b = c & 255;
    return Math.abs(r - g) < 24 && Math.abs(g - b) < 24 && Math.abs(r - b) < 24;
  };

  const grid = [];
  for (let ty = 0; ty < MAP_H; ty++) {
    grid.push([]);
    for (let tx = 0; tx < MAP_W; tx++) {
      const m = measure(tx, ty);
      let kind;
      // A boca de caverna e o unico tile do mapa que e majoritariamente PRETO — nada mais no
      // overworld chega perto (o contorno de um penhasco fica em 0.27). Na folha anotada ela vinha
      // com a letra da gruta desenhada dentro, e a primeira versao deste teste exigia esse pixel
      // branco; na folha limpa a letra nao existe, e exigi-la nao acharia caverna nenhuma.
      if (m.black > 0.5) kind = CAVE;
      else if (m.sig === deckSig) kind = BRIDGE;
      else if ((m.blueRows >= 3 && m.dryRows >= 3) || (m.blueCols >= 3 && m.dryCols >= 3)) kind = BRIDGE;
      else if (m.blue > 0.5) kind = WATER;
      else if (m.flat >= 0.85) kind = isGray(m.top[0]) ? PAVED : GROUND;
      else if (m.sig === treeSig) kind = TREE;
      else if (m.sig === graveSig) kind = GRAVE;
      // Uma 'parede' feita de AZUL e a quina da margem: meio tile de agua, meio de areia, e nem
      // metade azul (o teste de agua nao pega) nem plana (o de chao nao pega). Bloquear estava
      // certo — no Zelda a agua barra —, mas a arte saia como um paredao de rocha plantado na
      // beira do lago. Ela e agua, e e assim que tem de ser desenhada.
      else if (isBlue(wallColor(m))) kind = WATER;
      else if (isGreen(wallColor(m))) kind = TREE; // a parede verde do Zelda E mata: vira pinheiro
      else kind = CLIFF; // e a parede terrosa/cinza E montanha: vira rocha
      grid[ty].push(kind);
    }
  }
  return grid;
};

// ── Emissao ───────────────────────────────────────────────────────────────────────────────────
const pickWeighted = (items, weights, r) => {
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = r * total;
  for (let i = 0; i < items.length; i++) { acc -= weights[i]; if (acc <= 0) return items[i]; }
  return items[items.length - 1];
};

const buildWorld = (grid) => {
  const W = CHUNKS_X * CHUNK; const H = CHUNKS_Y * CHUNK;
  const ground = Array.from({ length: H }, () => new Array(W).fill(G_SEA));
  const upper = Array.from({ length: H }, () => new Array(W).fill(null));

  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const wx = tx + OFFSET_X; const wy = ty + OFFSET_Y;
      const kind = grid[ty][tx];
      const r1 = hash(wx, wy, 1); const r2 = hash(wx, wy, 2); const r3 = hash(wx, wy, 3);
      switch (kind) {
        case WATER:
          ground[wy][wx] = G_SEA; break;
        case CAVE:
          ground[wy][wx] = G_OPEN_GRAVE; break;
        case BRIDGE:
          ground[wy][wx] = G_STONE; break;
        case GRAVE:
          ground[wy][wx] = r1 < 0.5 ? G_GRAVE_SLAB : G_STONE_MOSS;
          upper[wy][wx] = U_TOMB; break;
        case STATUE:
          ground[wy][wx] = G_STONE;
          upper[wy][wx] = U_SPIKE_HEAD; break;
        case TREE:
          ground[wy][wx] = r1 < 0.85 ? G_DIRT : G_DIRT2;
          upper[wy][wx] = PINES[Math.floor(r2 * PINES.length) % PINES.length]; break;
        case CLIFF:
          // A montanha, em CUBO (World3D). Um frame so, e isso deixou de ser um problema quando
          // ela virou cubo: a repeticao que fazia um campo de quads ler como grade e quebrada
          // pela silhueta e pelo sombreado que cada bloco tira dos seus proprios vizinhos.
          ground[wy][wx] = G_STONE;
          upper[wy][wx] = U_CLIFF; break;
        case PAVED:
          // Patio de pedra: mesmo piso do cemiterio, com laje rachada e musgo salpicados para a
          // massa nao virar um tapete unico. Nunca ganha mato — e chao batido, nao campo.
          ground[wy][wx] = r1 < 0.55 ? G_STONE : (r1 < 0.8 ? G_STONE_MOSS : (r2 < 0.5 ? 29 : 30));
          break;
        case GROUND:
        default:
          ground[wy][wx] = r1 < 0.88 ? G_DIRT : G_DIRT2;
          // Mato e decoracao: nada disso bloqueia, e a densidade e baixa de proposito — o chao
          // do Zelda e aberto, e o que enche a tela sao as paredes, nao o cascalho.
          if (r2 < 0.07) upper[wy][wx] = pickWeighted(DECOR, DECOR_WEIGHTS, r3);
          break;
      }
    }
  }

  const chunks = [];
  for (let cy = 0; cy < CHUNKS_Y; cy++) {
    for (let cx = 0; cx < CHUNKS_X; cx++) {
      const g = []; const u = []; const col = [];
      for (let ry = 0; ry < CHUNK; ry++) {
        const wy = cy * CHUNK + ry;
        g.push(ground[wy].slice(cx * CHUNK, cx * CHUNK + CHUNK));
        u.push(upper[wy].slice(cx * CHUNK, cx * CHUNK + CHUNK));
        col.push(new Array(CHUNK).fill(false));
      }
      chunks.push({ cx, cy, ground: g, upper: u, collisions: col, enemies: [], pickups: [], npcs: [] });
    }
  }
  return { ground, upper, chunks };
};

// A primeira tela do Zelda e a (7,7) — a da caverna da espada de madeira. O heroi nasce no chao
// aberto mais proximo do centro dela.
const findStart = (grid) => {
  const cx = 7 * 16 + 8; const cy = 7 * 11 + 6;
  let best = null; let bestD = Infinity;
  for (let ty = 7 * 11; ty < 8 * 11; ty++) {
    for (let tx = 7 * 16; tx < 8 * 16; tx++) {
      if (grid[ty][tx] !== GROUND) continue;
      const d = (tx - cx) ** 2 + (ty - cy) ** 2;
      if (d < bestD) { bestD = d; best = [tx, ty]; }
    }
  }
  return { worldX: best[0] + OFFSET_X, worldY: best[1] + OFFSET_Y };
};

// ── AS NOVE ENTRADAS DE DUNGEON, em coordenada do mapa do Zelda ──────────────────────────────
//
// As seis primeiras foram LIDAS do proprio mapa: a folha anotada do ian-albert escreve o numero
// da dungeon dentro da boca de caverna, e os glifos foram extraidos pixel a pixel (branco sobre
// o preto do vao). Elas conferem com os guias do jogo em todas as seis, o que tambem validou a
// conversao da grade de letras dos guias (coluna A..P -> x, linha 1..8 CONTADA DE BAIXO -> y).
//
// As tres ultimas nao tem boca visivel, e isso e fiel: no primeiro quest a 7 so aparece tocando
// a flauta no lago, a 8 atras de uma arvore queimada e a 9 atras da rocha bombardeada de
// Spectacle Rock. O que se sabe delas e a TELA (16x11 tiles), pela mesma conversao ja validada,
// entao o portal cai no chao andavel mais proximo do centro dela. E aproximacao declarada: o
// tile exato volta quando os itens que revelam cada uma existirem.
const DUNGEON_ENTRANCES = [
  { level: 1, x: 119, y: 37 },
  { level: 2, x: 199, y: 37 },
  { level: 3, x: 72, y: 81 },
  { level: 4, x: 88, y: 48 },
  { level: 5, x: 183, y: 4 },
  { level: 6, x: 40, y: 26 },
  { level: 7, screen: [2, 4] },
  { level: 8, screen: [13, 6] },
  { level: 9, screen: [5, 0] },
];

const PREVIEW_COLORS = {
  [GROUND]: [232, 214, 168], [PAVED]: [150, 150, 150], [TREE]: [34, 120, 48], [CLIFF]: [150, 84, 40],
  [WATER]: [40, 70, 220], [CAVE]: [16, 16, 16], [BRIDGE]: [200, 140, 60],
  [GRAVE]: [200, 200, 210], [STATUE]: [190, 60, 60],
};

const main = () => {
  const argv = process.argv.slice(2);
  const arg = (name, def) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : def;
  };
  const src = arg('--src');
  if (!src) { console.error('uso: node scripts/gen-zelda-world.mjs --src <overworld.png> [--preview] [--out <file>]'); process.exit(1); }
  const img = readPng(src);
  if (img.width !== MAP_W * 16 || img.height !== MAP_H * 16) {
    console.error(`fonte tem ${img.width}x${img.height}; esperado ${MAP_W * 16}x${MAP_H * 16} (256x88 tiles)`);
    process.exit(1);
  }

  const grid = classify(img);
  const tally = {};
  for (const row of grid) for (const k of row) tally[k] = (tally[k] || 0) + 1;
  const total = MAP_W * MAP_H;
  console.log(`classificado ${MAP_W}x${MAP_H} = ${total} tiles:`);
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(7)} ${String(v).padStart(6)}  ${(100 * v / total).toFixed(1)}%`);
  }

  if (argv.includes('--preview')) {
    const Z = 3; const OW = MAP_W * Z; const OH = MAP_H * Z;
    const out = Buffer.alloc(OW * OH * 4);
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const [r, g, b] = PREVIEW_COLORS[grid[ty][tx]];
        for (let zy = 0; zy < Z; zy++) for (let zx = 0; zx < Z; zx++) {
          const i = ((ty * Z + zy) * OW + tx * Z + zx) * 4;
          out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
        }
      }
    }
    const p = arg('--previewOut', path.join(ROOT, 'zelda-classificado.png'));
    writePng(p, { width: OW, height: OH, data: out });
    console.log('preview:', p);
  }

  const { chunks, ground, upper } = buildWorld(grid);
  const playerStart = findStart(grid);

  // A UNICA fogueira do mundo, acesa, ao lado do spawn. Nao e conteudo: e infraestrutura. Ela e a
  // fogueira "de casa" (o runtime acende a mais proxima do playerStart), e sem nenhuma o mundo
  // nasce so com a luz da lua — dificil de VALIDAR andando, que e para o que este mundo existe.
  // Tambem e o que devolve vida ao heroi, ja que aqui nao ha corac~oes no chao.
  const SOLID_SET = new Set([...PINES, U_CLIFF, U_CLIFF_MOSS, U_TOMB, U_SPIKE_HEAD]);
  const freeNear = () => {
    for (let r = 1; r < 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = playerStart.worldX + dx; const y = playerStart.worldY + dy;
          if (x === playerStart.worldX && y === playerStart.worldY) continue;
          if (ground[y]?.[x] === G_SEA || upper[y]?.[x] === undefined) continue;
          if (upper[y][x] !== null && SOLID_SET.has(upper[y][x])) continue;
          return { worldX: x, worldY: y };
        }
      }
    }
    return playerStart;
  };
  const fire = freeNear();

  // Os portais das dungeons. Para as tres escondidas, procura o chao andavel mais proximo do
  // centro da tela — um portal em cima de parede seria um portal que ninguem alcanca.
  const andavel = (x, y) => ground[y]?.[x] !== undefined && ground[y][x] !== G_SEA
    && !(upper[y][x] !== null && SOLID_SET.has(upper[y][x]));
  const portais = DUNGEON_ENTRANCES.map((e) => {
    if (e.x !== undefined) return { type: 'levelPortal', worldX: e.x + OFFSET_X, worldY: e.y + OFFSET_Y, level: e.level };
    const [sx, sy] = e.screen;
    const cx = sx * 16 + 8; const cy = sy * 11 + 5;
    let best = null; let bestD = Infinity;
    for (let ty = sy * 11; ty < sy * 11 + 11; ty++) {
      for (let tx = sx * 16; tx < sx * 16 + 16; tx++) {
        const wx = tx + OFFSET_X; const wy = ty + OFFSET_Y;
        if (!andavel(wx, wy)) continue;
        const d = (tx - cx) ** 2 + (ty - cy) ** 2;
        if (d < bestD) { bestD = d; best = { worldX: wx, worldY: wy }; }
      }
    }
    return { type: 'levelPortal', worldX: best.worldX, worldY: best.worldY, level: e.level };
  });

  const world = {
    meta: {
      name: 'hyrule',
      schemaVersion: 1,
      worldChunksX: CHUNKS_X,
      worldChunksY: CHUNKS_Y,
      chunkColumns: CHUNK,
      chunkRows: CHUNK,
      tileSize: 8,
      tilesetKey: 'forest-tileset',
      playerStart,
      // TEMPORARIO, e o unico proposito e este primeiro passo: `puzzle` desliga o cerco de undead
      // (isPuzzleWorld -> UndeadSpawnDirector). O mundo ainda nao tem inimigos nem itens, e caveira
      // atras do jogador enquanto ele so quer VER o mapa e ruido. Sai quando o bestiario entrar.
      puzzle: true,
      exportedAt: new Date().toISOString(),
    },
    chunks,
    props: [
      { type: 'campfire', worldX: fire.worldX, worldY: fire.worldY, lit: true },
      ...portais,
    ],
    dialogs: {},
  };

  const outPath = arg('--out', path.join(ROOT, 'public', 'world.json'));
  fs.writeFileSync(outPath, JSON.stringify(world));
  const SOLID_REPORT = [3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 39, 40, 41];
  const solid = chunks.reduce((acc, c) => acc + c.upper.flat().filter((f) => f !== null && SOLID_REPORT.includes(f)).length, 0);
  console.log(`escrito ${outPath}`);
  console.log(`  ${CHUNKS_X}x${CHUNKS_Y} = ${chunks.length} chunks (${CHUNKS_X * CHUNK}x${CHUNKS_Y * CHUNK} tiles), mapa do Zelda em (${OFFSET_X},${OFFSET_Y})`);
  console.log(`  playerStart: ${playerStart.worldX},${playerStart.worldY}`);
  console.log(`  tiles solidos em pe: ${solid}`);
  console.log(`  ${(fs.statSync(outPath).size / 1024 / 1024).toFixed(2)} MB`);
};

main();
