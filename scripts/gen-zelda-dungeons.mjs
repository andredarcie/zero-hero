// Gera public/levels/dungeon-N.json a partir dos MAPAS DAS 9 DUNGEONS DO ZELDA 1.
//
//   node scripts/gen-zelda-dungeons.mjs --src <pasta>
//
// A pasta precisa conter as folhas de referencia (nao versionadas — o level gerado e o artefato):
//   zelda-dungeonsmap.png   o composto LIMPO de todas as dungeons, 4096x2816 = 16x16 salas
//   dg1.png .. dg9.png      o recorte de cada dungeon, que e de onde sai a FORMA (quais salas
//                           pertencem a ela; nas outras o recorte e transparente)
//
//   curl -o zelda-dungeonsmap.png "https://ian-albert.com/games/legend_of_zelda_maps/zelda-dungeons%28map%29.png"
//   curl -o dgN.png             "https://ian-albert.com/games/legend_of_zelda_maps/zelda-dungeonN.png"
//
// ⚠️  A ARTE SAI DO COMPOSTO `(map)`, QUE E O LIMPO; os recortes por dungeon vem com monstros e
// itens desenhados por cima e servem SO como mascara de quais salas existem. E a mesma armadilha
// que estragou a primeira geracao do overworld: mapa de fa e ilustracao, nao dado.
//
// ── A ESTRUTURA, que e a do ROM e nao uma escolha daqui ──────────────────────────────────────
// Uma sala e 16x11 tiles com um anel de parede de 2 tiles, e portanto um interior de 12x7 — que
// e exatamente o formato em que o cartucho guarda uma sala (12 bytes, um por coluna). Isso torna
// a classificacao estrutural em vez de estatistica: o anel E parede, o miolo E chao, e o que
// sobra para medir sao as excecoes (a porta no anel, o bloco no miolo).
//
// As 9 dungeons sao RECORTES de duas grades 16x8 empacotadas (1 a 6 na de cima, 7 a 9 na de
// baixo) — economia do cartucho, e o motivo pelo qual duas dungeons nunca compartilham uma sala.
// Os deslocamentos abaixo foram achados por casamento de pixel do recorte contra o composto, com
// 100% de acerto nas nove.
//
// ── SEM TROCA DE SALA ────────────────────────────────────────────────────────────────────────
// No Zelda a passagem de uma sala para a outra e um corte de tela. Aqui nao ha corte: o mapa da
// dungeon inteira vira UM level continuo, com as paredes no lugar e as portas como vaos. Isso e
// possivel porque o mapa de referencia JA E a planta baixa continua — cada sala desenhada ao lado
// da outra, do jeito que o jogo nunca mostrou.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng } from '../spritefactory/lib/png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ROOM_W = 16; // tiles
const ROOM_H = 11;
const BORDER_X = 2; // o anel de parede: 16 - 12 = 4, dois de cada lado
const BORDER_Y = 2; // 11 - 7 = 4, dois em cima e dois embaixo
const CHUNK = 12;
/** Quantos tiles de MIOLO o furo de bomba avanca para dentro de cada sala (ver `furar`). */
const MIOLO = 3;

// Onde cada dungeon comeca no composto, em SALAS. Achado por casamento de pixel (100% nas nove).
const DUNGEONS = [
  { n: 1, ox: 1, oy: 2, w: 6, h: 6, nome: 'A Aguia' },
  { n: 2, ox: 12, oy: 0, w: 4, h: 8, nome: 'A Lua' },
  { n: 3, ox: 9, oy: 2, w: 5, h: 6, nome: 'O Manji' },
  { n: 4, ox: 0, oy: 0, w: 4, h: 8, nome: 'A Serpente' },
  { n: 5, ox: 4, oy: 0, w: 4, h: 8, nome: 'O Lagarto' },
  { n: 6, ox: 8, oy: 0, w: 6, h: 8, nome: 'O Dragao' },
  { n: 7, ox: 0, oy: 8, w: 6, h: 8, nome: 'O Demonio' },
  { n: 8, ox: 3, oy: 8, w: 5, h: 8, nome: 'O Leao' },
  { n: 9, ox: 8, oy: 8, w: 8, h: 8, nome: 'A Morte' },
];

// Frames do atlas — DUNGEON_TILES em constants.ts, instalados a partir do 42.
const D_FLOOR = [42, 43, 44];
const D_WALL = [45, 46, 47];
const D_WALL_TORCH = 48;
const D_WALL_MOSS = 49;
const D_WALL_CRACKED = 50;
const D_FLOOR_CRACKED = 51;
const G_SEA = 33; // a agua tambem barra aqui, pela mesma regra do overworld

const hash = (x, y, salt = 0) => {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
};

const FLOOR = 'floor';
const WALL = 'wall';
const DOOR = 'door';
const BLOCK = 'block';
const WATER = 'water';

/** Mede um tile: histograma de cor, quanto e azul forte, e a ASSINATURA ESTRUTURAL. */
const measure = (img, px, py) => {
  const { width: W, data } = img;
  const hist = new Map(); const px2 = [];
  let blue = 0;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = ((py + y) * W + px + x) * 4;
      const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
      const c = (r << 16) | (g << 8) | b;
      px2.push(c); hist.set(c, (hist.get(c) || 0) + 1);
      if (b > r + 40 && b > g + 40) blue++;
    }
  }
  const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const rank = new Map(sorted.map(([c], k) => [c, k]));
  // A assinatura ignora PALETA (cada pixel vira o rank da sua cor dentro do tile), e e isso que
  // permite comparar a parede de uma dungeon teal com a de uma dourada: mesma forma, mesma
  // assinatura. E o mesmo truque do gerador do overworld.
  return { hist, dom: sorted[0][0], blue: blue / 256, sig: px2.map((c) => rank.get(c)).join('') };
};

/**
 * O GABARITO DA PAREDE: para cada posicao do anel, a forma que aquela posicao tem quando NAO ha
 * nada ali. Sai por moda sobre as 236 salas do jogo inteiro.
 *
 * Existe porque a porta do Zelda nao e um buraco preto. Metade delas e, mas a outra metade e um
 * vao desenhado NA COR DA PAREDE, com uma setinha dentro — e um teste de "quanto isto e escuro"
 * acha as primeiras e perde as segundas (medido: 6 das 17 salas da dungeon 1 alcancaveis).
 *
 * O que vale para as duas e que uma porta QUEBRA O PADRAO. O anel de parede e rigorosamente
 * repetitivo: cada uma das 54 posicoes de borda tem uma arte fixa, identica nas 236 salas — foi
 * assim que elas apareceram no censo de formas, todas com contagem exatamente 236. Entao "isto e
 * uma abertura" nao precisa de limiar nenhum: e so nao ser o gabarito.
 */
const wallTemplate = (map, rooms) => {
  const modo = new Map();
  for (let ty = 0; ty < ROOM_H; ty++) {
    for (let tx = 0; tx < ROOM_W; tx++) {
      const border = tx < BORDER_X || tx >= ROOM_W - BORDER_X
        || ty < BORDER_Y || ty >= ROOM_H - BORDER_Y;
      if (!border) continue;
      const cont = new Map();
      for (const [rx, ry] of rooms) {
        const s = measure(map, (rx * ROOM_W + tx) * 16, (ry * ROOM_H + ty) * 16).sig;
        cont.set(s, (cont.get(s) || 0) + 1);
      }
      modo.set(`${tx},${ty}`, [...cont.entries()].sort((a, b) => b[1] - a[1])[0][0]);
    }
  }
  return modo;
};

/** Classifica uma sala inteira (16x11) em classes de tile. */
const classifyRoom = (map, roomX, roomY, wallMode) => {
  const base = { x: roomX * ROOM_W * 16, y: roomY * ROOM_H * 16 };
  // A cor do CHAO e a dominante do MIOLO, nao da sala: o anel de parede usa a mesma cor base e
  // arrastaria a media. E por sala porque cada dungeon do Zelda tem paleta propria.
  const inner = new Map();
  for (let ty = BORDER_Y; ty < ROOM_H - BORDER_Y; ty++) {
    for (let tx = BORDER_X; tx < ROOM_W - BORDER_X; tx++) {
      const m = measure(map, base.x + tx * 16, base.y + ty * 16);
      for (const [c, n] of m.hist) inner.set(c, (inner.get(c) || 0) + n);
    }
  }
  const floorColor = [...inner.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const out = [];
  for (let ty = 0; ty < ROOM_H; ty++) {
    out.push([]);
    for (let tx = 0; tx < ROOM_W; tx++) {
      const m = measure(map, base.x + tx * 16, base.y + ty * 16);
      const cov = (m.hist.get(floorColor) || 0) / 256;
      const border = tx < BORDER_X || tx >= ROOM_W - BORDER_X
        || ty < BORDER_Y || ty >= ROOM_H - BORDER_Y;
      if (border) {
        // Nao e o gabarito daquela posicao? Entao e abertura. Sem limiar, sem cor.
        out[ty].push(m.sig === wallMode.get(`${tx},${ty}`) ? WALL : DOOR);
      } else if (m.blue > 0.5 && m.dom !== floorColor) {
        // Fosso. O teste exige que a cor NAO seja a do chao porque ha dungeon de chao azulado —
        // sem isso a sala inteira viraria agua.
        out[ty].push(WATER);
      } else if (cov < 0.3) {
        // Medido: chao 0.70-0.80, bloco 0.10, escada 0.40. O vale entre 0.10 e 0.40 e vazio, e o
        // corte em 0.30 deixa a escada ANDAVEL, que e o que ela e no jogo.
        out[ty].push(BLOCK);
      } else {
        out[ty].push(FLOOR);
      }
    }
  }

  // A PORTA TEM DE ATRAVESSAR O ANEL INTEIRO, e este passo e o que faz a dungeon existir.
  //
  // O mapa de referencia desenha o vao so na face INTERNA da parede (a linha 1 de cima, a coluna
  // 1 da esquerda): a face externa continua tijolo, porque no jogo original as salas nunca se
  // tocam — cada uma e uma tela, e o corte de tela e a passagem. Numa planta continua isso vira
  // uma porta que da em parede. Medido antes desta correcao: 76 tiles alcancaveis a partir da
  // entrada, ou seja EXATAMENTE uma sala, nas nove dungeons.
  //
  // Entao todo vao detectado e prolongado pela espessura do anel, na perpendicular a parede. Onde
  // as duas salas vizinhas tem porta na mesma posicao — e no Zelda tem, senao nao ha passagem —
  // os 2 + 2 tiles se encontram e o corredor abre.
  const carve = (tx, ty) => {
    if (ty < BORDER_Y) for (let k = 0; k < BORDER_Y; k++) out[k][tx] = DOOR;
    else if (ty >= ROOM_H - BORDER_Y) for (let k = ROOM_H - BORDER_Y; k < ROOM_H; k++) out[k][tx] = DOOR;
    if (tx < BORDER_X) for (let k = 0; k < BORDER_X; k++) out[ty][k] = DOOR;
    else if (tx >= ROOM_W - BORDER_X) for (let k = ROOM_W - BORDER_X; k < ROOM_W; k++) out[ty][k] = DOOR;
  };
  const vaos = [];
  for (let ty = 0; ty < ROOM_H; ty++) {
    for (let tx = 0; tx < ROOM_W; tx++) if (out[ty][tx] === DOOR) vaos.push([tx, ty]);
  }
  for (const [tx, ty] of vaos) carve(tx, ty);
  return out;
};

const main = () => {
  const argv = process.argv.slice(2);
  const srcDir = argv[argv.indexOf('--src') + 1];
  if (argv.indexOf('--src') < 0 || !srcDir) {
    console.error('uso: node scripts/gen-zelda-dungeons.mjs --src <pasta com zelda-dungeonsmap.png e dg1..9.png>');
    process.exit(1);
  }
  const map = readPng(path.join(srcDir, 'zelda-dungeonsmap.png'));
  if (map.width !== 16 * ROOM_W * 16 || map.height !== 16 * ROOM_H * 16) {
    console.error(`composto tem ${map.width}x${map.height}; esperado ${16 * ROOM_W * 16}x${16 * ROOM_H * 16}`);
    process.exit(1);
  }

  const outDir = path.join(ROOT, 'public', 'levels');
  fs.mkdirSync(outDir, { recursive: true });
  const manifesto = [];

  // A FORMA de cada dungeon vem do recorte dela: sala opaca = sala desta dungeon.
  const crops = new Map(DUNGEONS.map((d) => [d.n, readPng(path.join(srcDir, `dg${d.n}.png`))]));
  const ocupadaDe = (d) => {
    const crop = crops.get(d.n);
    const grid = [];
    for (let ry = 0; ry < d.h; ry++) {
      grid.push([]);
      for (let rx = 0; rx < d.w; rx++) {
        let op = 0;
        for (let y = 8; y < ROOM_H * 16; y += 16) {
          for (let x = 8; x < ROOM_W * 16; x += 16) {
            if (crop.data[((ry * ROOM_H * 16 + y) * crop.width + rx * ROOM_W * 16 + x) * 4 + 3] >= 128) op++;
          }
        }
        grid[ry].push(op > 50);
      }
    }
    return grid;
  };
  const ocupadas = new Map(DUNGEONS.map((d) => [d.n, ocupadaDe(d)]));

  // O gabarito da parede sai da moda sobre TODAS as salas do jogo — quanto mais salas, mais
  // certo o "normal" e mais obvia a excecao.
  const todasSalas = [];
  for (const d of DUNGEONS) {
    const oc = ocupadas.get(d.n);
    for (let ry = 0; ry < d.h; ry++) for (let rx = 0; rx < d.w; rx++) if (oc[ry][rx]) todasSalas.push([d.ox + rx, d.oy + ry]);
  }
  const wallMode = wallTemplate(map, todasSalas);
  console.log(`gabarito da parede: moda sobre ${todasSalas.length} salas`);

  for (const d of DUNGEONS) {
    const ocupada = ocupadas.get(d.n);
    const tilesW = d.w * ROOM_W; const tilesH = d.h * ROOM_H;
    const chunksX = Math.ceil(tilesW / CHUNK); const chunksY = Math.ceil(tilesH / CHUNK);
    const W = chunksX * CHUNK; const H = chunksY * CHUNK;
    const offX = Math.floor((W - tilesW) / 2); const offY = Math.floor((H - tilesH) / 2);

    // A moldura fora da planta e macico: o level e uma caixa fechada, e a borda nao pode ser um
    // lugar aonde se chega. Nada de mar aqui — mar num subterraneo leria como um bug.
    const ground = Array.from({ length: H }, () => new Array(W).fill(D_FLOOR[0]));
    const upper = Array.from({ length: H }, () => new Array(W).fill(null));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) upper[y][x] = D_WALL[Math.floor(hash(x, y, 9) * D_WALL.length) % D_WALL.length];
    }

    // Classifica TODAS as salas primeiro. A emissao vem depois porque entre as duas coisas
    // acontece o passo que abre os caminhos de bomba, e ele raciocina sobre o grafo de salas —
    // impossivel de fazer enquanto se escreve tile a tile.
    const salas = [];
    for (let ry = 0; ry < d.h; ry++) {
      salas.push([]);
      for (let rx = 0; rx < d.w; rx++) {
        salas[ry].push(ocupada[ry][rx] ? classifyRoom(map, d.ox + rx, d.oy + ry, wallMode) : null);
      }
    }

    // ── ABRIR O QUE SO A BOMBA ABRIRIA ─────────────────────────────────────────────────────
    //
    // No Zelda boa parte das dungeons e costurada por PAREDE FALSA: um trecho de parede comum,
    // desenhado igual a qualquer outro, que so vira passagem depois de uma bomba. E indetectavel
    // no mapa de proposito — e essa a graca dela — e enquanto nao existe bomba no jogo o efeito
    // e uma dungeon murada: medido, 7 das 23 salas da 5 e 20 das 57 da 9.
    //
    // Este passo completa o caminho. Ele NAO derruba toda parede entre salas vizinhas — isso
    // apagaria o labirinto e faria de nove plantas nove saloes. Ele abre o MINIMO: enquanto
    // houver sala inalcancavel, fura uma parede entre o alcancado e o nao-alcancado, no meio,
    // exatamente onde o Zelda poe uma porta. O que sobra do labirinto e o labirinto.
    //
    // A conta e feita no TILE, nunca no grafo de salas. Tentei primeiro perguntar "estas duas
    // salas tem porta em comum?" e a resposta mentia: ha vao aberto no anel cuja boca esta tapada
    // por um bloco do miolo, e ha tile de parede decorado que o gabarito acusa como abertura sem
    // ser passagem. O unico juiz confiavel e o mesmo flood-fill que o heroi faz com os pes.
    //
    // Cada furo e marcado com o PISO RACHADO: dentro do jogo da para ver quais vaos nao estavam
    // na planta, e sao exatamente esses que voltam a ser parede quando a bomba existir.
    const salaDe = (tx, ty) => [Math.floor(tx / ROOM_W), Math.floor(ty / ROOM_H)];
    const classe = (tx, ty) => {
      const [rx, ry] = salaDe(tx, ty);
      const sala = salas[ry]?.[rx];
      return sala ? sala[ty % ROOM_H][tx % ROOM_W] : WALL;
    };
    const setClasse = (tx, ty, k) => {
      const [rx, ry] = salaDe(tx, ty);
      if (salas[ry]?.[rx]) salas[ry][rx][ty % ROOM_H][tx % ROOM_W] = k;
    };
    const andavel = (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= d.w * ROOM_W || ty >= d.h * ROOM_H) return false;
      const k = classe(tx, ty);
      return k === FLOOR || k === DOOR;
    };
    const furados = [];
    /** Fura a parede entre duas salas vizinhas, e limpa a boca dos dois lados. */
    // `alt` desloca o vao para os lados. A parede do meio nem sempre serve: se o miolo da sala
    // vizinha estiver entupido de bloco justo naquela faixa, o corredor abre e morre. Entao a
    // mesma parede pode ser furada em ate cinco alturas diferentes, do centro para fora, e a
    // primeira que realmente ligar encerra o assunto — o laco mede de novo a cada furo.
    const ALTS = [0, -1, 1, -2, 2];
    const furar = (rx, ry, eixo, alt = 0) => {
      const marcar = (tx, ty) => { setClasse(tx, ty, DOOR); furados.push([tx, ty]); };
      if (eixo === 'v') {
        const yTop = ry * ROOM_H + ROOM_H - 1;
        for (const dx of [ROOM_W / 2 - 1 + alt * 2, ROOM_W / 2 + alt * 2]) {
          const tx = rx * ROOM_W + dx;
          // O anel dos dois lados MAIS TRES tiles de miolo em cada. Um so nao bastava: o vao
          // abria e morria contra o aglomerado de blocos que o Zelda costuma por junto da parede,
          // e a sala continuava ilhada com uma porta bonita. Tres e a profundidade em que o
          // corredor sempre encontra o campo aberto da sala — medido, e o que leva as nove a
          // 100%. Continua sendo um corredor de duas colunas: o labirinto nao vira salao.
          for (let k = -BORDER_Y - MIOLO; k <= BORDER_Y + MIOLO - 1; k++) marcar(tx, yTop + k + 1);
        }
      } else {
        const ty = ry * ROOM_H + Math.floor(ROOM_H / 2) + alt;
        const xL = rx * ROOM_W + ROOM_W - 1;
        for (let k = -BORDER_X - MIOLO; k <= BORDER_X + MIOLO - 1; k++) marcar(xL + k + 1, ty);
      }
    };
    // So entram na conta as salas que TEM chao. Uma sala pode existir na planta e nao ter um tile
    // pisavel (miolo todo em bloco ou em fosso); exigir que ela seja alcancada poe o laco a furar
    // a mesma parede para sempre, porque a sala nunca vai contar como alcancada.
    const ocupadasLista = [];
    for (let ry = 0; ry < d.h; ry++) {
      for (let rx = 0; rx < d.w; rx++) {
        if (!salas[ry][rx]) continue;
        let temChao = false;
        for (let ty = BORDER_Y; ty < ROOM_H - BORDER_Y && !temChao; ty++) {
          for (let tx = BORDER_X; tx < ROOM_W - BORDER_X; tx++) {
            const k = salas[ry][rx][ty][tx];
            if (k === FLOOR || k === DOOR) { temChao = true; break; }
          }
        }
        if (temChao) ocupadasLista.push([rx, ry]);
      }
    }
    // A raiz e a sala mais ao SUL, por onde se entra — o caminho cresce de onde o heroi chega.
    const raiz = ocupadasLista.reduce((a, b) => (b[1] > a[1] ? b : a));
    const flood = () => {
      // Semeia UM tile, nunca a sala toda. Semear o miolo inteiro da raiz assume que ela e
      // internamente conexa — e nao e: a sala de entrada da dungeon 8 tem uma bolsa de cinco
      // tiles fechada por blocos bem no meio, e semeada junto ela nascia 'alcancada' e o passo
      // das ilhas nunca a via. Um tile so, e o resto que se prove.
      const vis = new Set();
      const st0 = [];
      for (let ty = BORDER_Y; ty < ROOM_H - BORDER_Y && !st0.length; ty++) {
        for (let tx = BORDER_X; tx < ROOM_W - BORDER_X; tx++) {
          const x = raiz[0] * ROOM_W + tx; const y = raiz[1] * ROOM_H + ty;
          if (andavel(x, y)) { vis.add(`${x},${y}`); st0.push([x, y]); break; }
        }
      }
      while (st0.length) {
        const [x, y] = st0.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx; const ny = y + dy;
          if (!andavel(nx, ny) || vis.has(`${nx},${ny}`)) continue;
          vis.add(`${nx},${ny}`); st0.push([nx, ny]);
        }
      }
      return vis;
    };
    const salaAlcancada = (vis, rx, ry) => {
      for (let ty = BORDER_Y; ty < ROOM_H - BORDER_Y; ty++) {
        for (let tx = BORDER_X; tx < ROOM_W - BORDER_X; tx++) {
          if (vis.has(`${rx * ROOM_W + tx},${ry * ROOM_H + ty}`)) return true;
        }
      }
      return false;
    };
    let bombas = 0;
    // Nunca furar a mesma parede duas vezes: se abrir aquela nao ligou nada, insistir nela e o
    // laco em circulo que a versao anterior fazia (200 furos e a dungeon do mesmo tamanho).
    const jaFurado = new Set();
    for (let guarda = 0; guarda < 200; guarda++) {
      const vis = flood();
      const faltando = ocupadasLista.filter(([rx, ry]) => !salaAlcancada(vis, rx, ry));
      if (!faltando.length) break;
      let furou = false;
      for (const [rx, ry] of ocupadasLista) {
        if (!salaAlcancada(vis, rx, ry)) continue;
        const cand = [[rx, ry + 1, 'v', rx, ry], [rx, ry - 1, 'v', rx, ry - 1], [rx + 1, ry, 'h', rx, ry], [rx - 1, ry, 'h', rx - 1, ry]];
        for (const [nx, ny, eixo, ax, ay] of cand) {
          if (nx < 0 || ny < 0 || nx >= d.w || ny >= d.h || !salas[ny]?.[nx]) continue;
          if (salaAlcancada(vis, nx, ny)) continue;
          const alt = ALTS.find((a) => !jaFurado.has(`${ax},${ay},${eixo},${a}`));
          if (alt === undefined) continue;
          jaFurado.add(`${ax},${ay},${eixo},${alt}`);
          furar(ax, ay, eixo, alt); bombas++; furou = true; break;
        }
        if (furou) break;
      }
      // FALLBACK: nenhuma fronteira entre alcancado e ilhado sobrou por furar. Sobra a sala que
      // so faz fronteira com OUTRA ilhada — furar entre as duas nao liga nada agora, mas encadeia,
      // e a proxima volta do laco liga o bloco inteiro. Sem isto, uma sala pendurada no fim de um
      // corredor de duas fica de fora, que foi o caso das dungeons 4 e 6.
      if (!furou) {
        for (const [rx, ry] of faltando) {
          const cand = [[rx, ry + 1, 'v', rx, ry], [rx, ry - 1, 'v', rx, ry - 1], [rx + 1, ry, 'h', rx, ry], [rx - 1, ry, 'h', rx - 1, ry]];
          for (const [nx, ny, eixo, ax, ay] of cand) {
            if (nx < 0 || ny < 0 || nx >= d.w || ny >= d.h || !salas[ny]?.[nx]) continue;
            const alt = ALTS.find((a) => !jaFurado.has(`${ax},${ay},${eixo},${a}`));
            if (alt === undefined) continue;
            jaFurado.add(`${ax},${ay},${eixo},${alt}`);
            furar(ax, ay, eixo, alt); bombas++; furou = true; break;
          }
          if (furou) break;
        }
      }
      if (!furou) break; // nao ha mais parede possivel: a sala nao faz fronteira com ninguem
    }

    // ── E O QUE SOBROU DENTRO DA SALA ───────────────────────────────────────────────────────
    //
    // Ligar sala com sala nao basta. Ha sala cujo MIOLO e um labirinto de blocos, e nela um
    // pedaco do chao fica fechado por dentro — no Zelda isso se resolve empurrando um bloco, e
    // empurrar bloco ainda nao existe aqui. Medido: a sala (1,3) da dungeon 4 alcancava 43% do
    // proprio chao, e a vizinha dependia justamente do trecho de fora.
    //
    // Entao o ultimo passo desce ao tile: enquanto houver ilha de chao, cava o caminho MAIS CURTO
    // atraves dos blocos ate o alcancado. E o minimo por construcao (BFS na espessura da parede),
    // e cada tile cavado vai para o mesmo rastro de piso rachado dos furos de bomba.
    for (let guarda = 0; guarda < 400; guarda++) {
      const vis = flood();
      // A varredura cobre a SALA INTEIRA, anel incluido, e nao so o miolo. Ficar no miolo deixava
      // para tras dois tipos de sobra: a bolsa de chao fechada por blocos bem no centro e o toco
      // de porta que morre dentro da parede — nove tiles na dungeon 8, invisiveis no mapa de
      // salas e visiveis para quem anda.
      let ilha = null;
      for (const [rx, ry] of ocupadasLista) {
        for (let ty = 0; ty < ROOM_H && !ilha; ty++) {
          for (let tx = 0; tx < ROOM_W; tx++) {
            const x = rx * ROOM_W + tx; const y = ry * ROOM_H + ty;
            if (andavel(x, y) && !vis.has(`${x},${y}`)) { ilha = [x, y]; break; }
          }
        }
        if (ilha) break;
      }
      if (!ilha) break;
      // BFS a partir da ilha ATRAVESSANDO parede, ate encostar em algo alcancado.
      const veio = new Map([[`${ilha[0]},${ilha[1]}`, null]]);
      const fila = [ilha]; let destino = null;
      while (fila.length && !destino) {
        const [x, y] = fila.shift();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx; const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= d.w * ROOM_W || ny >= d.h * ROOM_H) continue;
          const chave = `${nx},${ny}`;
          if (veio.has(chave)) continue;
          const [srx, sry] = salaDe(nx, ny);
          if (!salas[sry]?.[srx]) continue; // nao cava para fora da planta
          veio.set(chave, `${x},${y}`);
          if (vis.has(chave)) { destino = chave; break; }
          fila.push([nx, ny]);
        }
      }
      if (!destino) break;
      for (let cur = destino; cur; cur = veio.get(cur)) {
        const [cx, cy] = cur.split(',').map(Number);
        if (!andavel(cx, cy)) { setClasse(cx, cy, DOOR); furados.push([cx, cy]); bombas++; }
      }
    }

    let entrada = null;
    for (let ry = 0; ry < d.h; ry++) {
      for (let rx = 0; rx < d.w; rx++) {
        if (!ocupada[ry][rx]) continue;
        const sala = salas[ry][rx];
        for (let ty = 0; ty < ROOM_H; ty++) {
          for (let tx = 0; tx < ROOM_W; tx++) {
            const wx = offX + rx * ROOM_W + tx; const wy = offY + ry * ROOM_H + ty;
            const kind = sala[ty][tx];
            const r2 = hash(wx, wy, 2);
            if (kind === WATER) { ground[wy][wx] = G_SEA; upper[wy][wx] = null; continue; }
            // O piso rachado NAO entra como salpico aleatorio. A arte dele e um Y preto de alto
            // contraste sobre o chao, e a 6% ele virava um bando de marcas escuras espalhadas pela
            // sala inteira (visto rodando). Pior: ele e a marca dos vaos que este gerador abriu no
            // lugar de uma parede de bomba — se estiver em todo canto, nao marca nada.
            ground[wy][wx] = D_FLOOR[Math.floor(r2 * D_FLOOR.length) % D_FLOOR.length];
            if (kind === FLOOR || kind === DOOR) { upper[wy][wx] = null; continue; }
            // Parede e bloco compartilham a alvenaria de proposito: no Zelda o bloco do miolo E
            // feito do mesmo material da parede, e distingui-los seria inventar arte que o
            // original nao tem. A tocha e a hera entram raras, so para a massa nao ficar plana.
            const v = hash(wx, wy, 3);
            upper[wy][wx] = kind === BLOCK
              ? D_WALL[Math.floor(v * D_WALL.length) % D_WALL.length]
              : (v < 0.04 ? D_WALL_TORCH : (v < 0.09 ? D_WALL_MOSS : (v < 0.11 ? D_WALL_CRACKED
                : D_WALL[Math.floor(v * 97 % D_WALL.length)])));
          }
        }
        // A ENTRADA e a sala com porta no anel de BAIXO e nada embaixo dela — no Zelda entra-se
        // por baixo, sempre. E o unico jeito de achar o ponto de nascimento sem escrever nove
        // coordenadas a mao (e nove coordenadas a mao apodrecem no primeiro remapeamento).
        const abaixoVazia = ry + 1 >= d.h || !ocupada[ry + 1][rx];
        const portaEmbaixo = sala[ROOM_H - 1].some((k) => k === DOOR) || sala[ROOM_H - 2].some((k) => k === DOOR);
        // No Zelda entra-se SEMPRE pelo sul, e a entrada e a sala mais ao SUL com porta para fora.
        // Sem o desempate por profundidade, qualquer sala de fundo de corredor com porta virada
        // para o vazio virava candidata — e a dungeon 1 nascia com o heroi no bico da aguia.
        if (abaixoVazia && portaEmbaixo && (!entrada || ry > entrada.ry)) {
          entrada = {
            ry,
            worldX: offX + rx * ROOM_W + Math.floor(ROOM_W / 2),
            worldY: offY + ry * ROOM_H + ROOM_H - BORDER_Y - 1,
          };
        }
      }
    }
    if (!entrada) entrada = { ry: 0, worldX: Math.floor(W / 2), worldY: H - 3 };
    delete entrada.ry;

    // A ESCADA DE VOLTA fica no tile da entrada, e o heroi nasce UM TILE ACIMA dela. Nao e
    // detalhe: `handleTileEntered` so dispara ao ENTRAR num tile, entao nascer em cima do portal
    // nao o acionaria — mas o primeiro passo para tras acionaria, e sair sem querer da dungeon
    // que se acabou de abrir e o tipo de acidente que nao se perdoa. Nascendo acima, a saida e
    // um passo para o sul: deliberado, visivel, e exatamente onde o Zelda a poe.
    const saida = { worldX: entrada.worldX, worldY: entrada.worldY };
    // ...desde que haja chao ali. Numa sala de entrada rasa o tile de cima e parede, e subir o
    // heroi para dentro dela o faria nascer preso. Nesse caso ele nasce sobre a propria escada,
    // o que e seguro: pisar so conta ao ENTRAR num tile, e nascer nao e entrar.
    if (entrada.worldY - 1 >= 0 && upper[entrada.worldY - 1][entrada.worldX] === null) entrada.worldY -= 1;
    const portaisSaida = [{ type: 'levelPortal', worldX: saida.worldX, worldY: saida.worldY }];

    // O rastro da bomba: piso rachado em todo vao que este gerador abriu.
    for (const [tx, ty] of furados) {
      const wx = offX + tx; const wy = offY + ty;
      if (ground[wy]?.[wx] === undefined) continue;
      ground[wy][wx] = D_FLOOR_CRACKED; upper[wy][wx] = null;
    }

    // SELA A BORDA DO LEVEL. Quando a planta preenche a largura inteira do canvas (dungeon 1:
    // 96 tiles em 96), uma porta na parede externa de uma sala de beirada encosta no limite do
    // mundo e vira um vao para fora. Nao da para sair — o fora-do-mundo ja bloqueia — mas e um
    // corredor que morre em nada, e um beco assim mente sobre haver algo ali.
    for (let x = 0; x < W; x++) {
      upper[0][x] = D_WALL[0]; upper[H - 1][x] = D_WALL[0];
    }
    for (let y = 0; y < H; y++) {
      upper[y][0] = D_WALL[0]; upper[y][W - 1] = D_WALL[0];
    }

    const chunks = [];
    for (let cy = 0; cy < chunksY; cy++) {
      for (let cx = 0; cx < chunksX; cx++) {
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

    const level = {
      meta: {
        name: `Level ${d.n}: ${d.nome}`,
        schemaVersion: 1,
        worldChunksX: chunksX,
        worldChunksY: chunksY,
        chunkColumns: CHUNK,
        chunkRows: CHUNK,
        tileSize: 8,
        tilesetKey: 'forest-tileset',
        playerStart: entrada,
        puzzle: true,
        exportedAt: new Date().toISOString(),
      },
      chunks,
      props: portaisSaida,
      dialogs: {},
    };
    const file = path.join(outDir, `dungeon-${d.n}.json`);
    fs.writeFileSync(file, JSON.stringify(level));
    const salasOcupadas = ocupada.flat().filter(Boolean).length;
    console.log(`dungeon ${d.n} ${d.nome.padEnd(12)} ${d.w}x${d.h} salas (${salasOcupadas} ocupadas, ${bombas} vaos de bomba) -> `
      + `${chunksX}x${chunksY} chunks = ${W}x${H} tiles, entrada ${entrada.worldX},${entrada.worldY}`);
    manifesto.push({
      id: `dungeon-${d.n}`,
      file: `dungeon-${d.n}.json`,
      name: `Level ${d.n}: ${d.nome}`,
      blurb: `${salasOcupadas} salas, a forma exata do Zelda 1.`,
    });
  }

  // O MANIFESTO E MESCLADO, NUNCA REESCRITO. `public/levels/index.json` lista tambem os dois
  // levels autorados a mao, e o CLAUDE.md e explicito sobre eles: um script que sobrescreve
  // autoria e uma bomba-relogio. Entao so as entradas `dungeon-*` sao trocadas — rodar isto de
  // novo e idempotente e nao encosta em mais nada.
  const indexPath = path.join(outDir, 'index.json');
  let atual = [];
  try { atual = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch { atual = []; }
  const preservados = atual.filter((e) => !String(e.file ?? '').startsWith('dungeon-'));
  fs.writeFileSync(indexPath, `${JSON.stringify([...preservados, ...manifesto], null, 2)}\n`);
  console.log(`\nescritos ${manifesto.length} arquivos em public/levels/`);
  console.log(`index.json: ${preservados.length} entradas preservadas + ${manifesto.length} dungeons`);
};

main();
