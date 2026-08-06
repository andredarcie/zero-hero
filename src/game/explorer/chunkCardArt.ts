/**
 * A ARTE DAS CARTAS — pixel art P&B, minimalista e SIMBÓLICA, desenhada aqui em vez de
 * carregada de arquivo (referência do usuário: o espírito Inscryption — tinta clara sobre
 * noite, um pictograma por domínio que diz o que a terra É).
 *
 * Duas cores só (a "P&B" desta casa: tinta-pergaminho sobre a noite do jogo), grade fixa de
 * 36×24 desenhada por retângulo — zero aleatório, o mesmo desenho em todo boot (a régua do
 * visual-ref). O canvas estica com image-rendering:pixelated, então cada px daqui vira um
 * pixel gordo da carta.
 */

import type { CardSuit } from './chunkCardSuits';
import type { NpcKind } from '@/game/world/ScreenContent';

const ART_W = 36;
const ART_H = 24;
const NIGHT = '#07080f';
const INK = '#e8e4d6';

type Painter = {
  px: (x: number, y: number) => void;
  rect: (x: number, y: number, w: number, h: number) => void;
};

const makePainter = (ctx: CanvasRenderingContext2D): Painter => {
  ctx.fillStyle = INK;
  return {
    px: (x, y) => {
      if (x >= 0 && y >= 0 && x < ART_W && y < ART_H) ctx.fillRect(x, y, 1, 1);
    },
    rect: (x, y, w, h) => ctx.fillRect(x, y, w, h),
  };
};

/** Estrelas fixas do fundo — as mesmas em toda carta, como o verso de um baralho de verdade. */
const STARS: ReadonlyArray<readonly [number, number]> = [[4, 3], [12, 2], [21, 4], [31, 2], [7, 7], [33, 8]];

/** A lua sobre o lago: disco minguante, e o reflexo tremido descendo a água em traços. */
const drawTide = (p: Painter): void => {
  // Disco da lua (raio 4 em (27,6)), com a mordida do minguante e duas crateras.
  for (let y = -4; y <= 4; y += 1) {
    for (let x = -4; x <= 4; x += 1) {
      const inMoon = x * x + y * y <= 16;
      const inBite = (x - 2) * (x - 2) + (y + 1) * (y + 1) <= 6;
      if (inMoon && !inBite) p.px(27 + x, 6 + y);
    }
  }
  p.px(25, 5);
  // A linha d'água, e as ondas em travessões alternados — mar de pixel, não senoide.
  p.rect(2, 15, 32, 1);
  for (let x = 2; x < 34; x += 4) {
    p.rect(x, 18, 2, 1);
    p.rect(x + 2, 20, 2, 1);
    p.rect(x, 22, 2, 1);
  }
  // O reflexo da lua: uma coluna de traços quebrados sob o disco.
  p.rect(26, 17, 3, 1);
  p.rect(27, 19, 2, 1);
  p.rect(26, 21, 2, 1);
};

/** A floresta: três pinheiros em silhueta de escada, um chão, e o vazio entre eles. */
const drawThorn = (p: Painter): void => {
  const pine = (cx: number, top: number, base: number): void => {
    let w = 0;
    for (let y = top; y < base; y += 1) {
      p.rect(cx - w, y, w * 2 + 1, 1);
      if ((y - top) % 2 === 1) w += 1;
    }
    p.rect(cx, base, 1, 2); // o tronco
  };
  pine(8, 8, 19);
  pine(18, 4, 19);
  pine(28, 10, 19);
  p.rect(2, 21, 32, 1); // o chão
};

/** A teia no canto, a aranha pendurada na linha — o perigo dito num pictograma só. */
const drawWeb = (p: Painter): void => {
  // Raios da teia saindo do canto superior esquerdo.
  const anchors: ReadonlyArray<readonly [number, number]> = [[16, 0], [16, 8], [13, 14], [8, 16], [0, 16]];
  for (const [ax, ay] of anchors) {
    const steps = Math.max(Math.abs(ax), Math.abs(ay));
    for (let s = 0; s <= steps; s += 2) {
      p.px(Math.round((ax * s) / steps), Math.round((ay * s) / steps));
    }
  }
  // Dois anéis da teia, pontilhados sobre os raios.
  for (const r of [7, 12]) {
    for (let a = 0; a <= 12; a += 1) {
      const t = (a / 12) * (Math.PI / 2);
      p.px(Math.round(Math.cos(t) * r), Math.round(Math.sin(t) * r));
    }
  }
  // O fio, e a aranha pendurada nele: corpo 3×3, cabeça, e as pernas dobradas.
  p.rect(26, 0, 1, 8);
  p.rect(25, 9, 3, 3);
  p.px(26, 12);
  for (const [lx, ly] of [[-2, 9], [-3, 11], [4, 9], [5, 11]] as const) p.px(26 + lx, ly);
  for (const [lx, ly] of [[-2, 13], [4, 13]] as const) p.px(26 + lx, ly);
};

/** O lar: a fogueira acesa e o morador ao lado — a carta de NPC num pictograma só. */
const drawHearth = (p: Painter): void => {
  // A fogueira: lenha cruzada, a chama em três línguas, faíscas subindo.
  p.rect(20, 19, 7, 1);
  p.rect(21, 18, 5, 1);
  for (let y = 0; y < 4; y += 1) p.rect(23 - Math.floor(y / 2), 17 - y, 1 + (y % 2) + Math.floor(y / 2), 1);
  p.px(24, 12);
  p.px(22, 10);
  p.px(25, 9);
  // O morador: cabeça, corpo, os pés no chão — de frente para o fogo.
  p.rect(11, 10, 3, 3);
  p.rect(11, 14, 3, 5);
  p.px(10, 15);
  p.px(14, 15); // o braço estendido, oferecendo
  p.px(11, 19);
  p.px(13, 19);
  // O presente entre os dois: um item pousado no chão.
  p.rect(16, 17, 2, 2);
  p.rect(2, 21, 32, 1); // o chão
};

/** A montanha: dois maciços em degraus — rocha que machado nenhum responde — e um morcego longe. */
const drawPeak = (p: Painter): void => {
  const massif = (cx: number, top: number, base: number): void => {
    let w = 1;
    for (let y = top; y <= base; y += 1) {
      p.rect(cx - w, y, w * 2 + 1, 1);
      if ((y - top) % 2 === 0) w += 1;
    }
  };
  massif(11, 5, 19);
  massif(27, 10, 19);
  // O morcego no céu entre os picos: a única coisa que atravessa parede voa por cima dela.
  p.px(21, 4);
  p.px(22, 5);
  p.px(23, 4);
  p.px(24, 5);
  p.px(25, 4);
  p.rect(2, 21, 32, 1); // o chão
};

/** O cemitério: a lápide em arco, a cruz sobre o monte fresco, e os ossos entre as duas. */
const drawGrave = (p: Painter): void => {
  // A lápide: corpo, e o arco fechando em dois degraus.
  p.rect(7, 9, 7, 12);
  p.rect(8, 8, 5, 1);
  p.rect(9, 7, 3, 1);
  // A cruz, e o monte de terra fresca ainda sem pedra.
  p.rect(24, 10, 1, 9);
  p.rect(22, 12, 5, 1);
  p.rect(22, 19, 5, 1);
  p.rect(21, 20, 7, 1);
  // Os ossos caídos entre os dois enterros.
  p.px(16, 20);
  p.px(18, 20);
  p.px(17, 18);
  p.rect(2, 21, 32, 1); // o chão
};

/** A flor: o miolo em losango, o caule com as duas folhas — terra onde tudo cresce. */
const drawBloom = (p: Painter): void => {
  const cx = 18;
  const cy = 7;
  for (let n = 0; n <= 3; n += 1) {
    p.rect(cx - (3 - n), cy - n, (3 - n) * 2 + 1, 1);
    p.rect(cx - (3 - n), cy + n, (3 - n) * 2 + 1, 1);
  }
  p.px(cx - 5, cy);
  p.px(cx + 5, cy);
  p.px(cx, cy - 5);
  // O caule e as folhas, uma de cada lado.
  p.rect(cx, cy + 4, 1, 10);
  p.rect(cx - 3, 15, 3, 1);
  p.px(cx - 3, 14);
  p.rect(cx + 1, 13, 3, 1);
  p.px(cx + 3, 12);
  // Pétalas soltas caindo — o pomar nunca está parado.
  p.px(8, 6);
  p.px(28, 11);
  p.px(10, 17);
  p.rect(2, 21, 32, 1); // o chão
};

// ── AS CARTAS DE NPC: um pictograma POR MORADOR ────────────────────────────────────────────
// O naipe hearth continua assinando a moldura (violeta + sigilo de chama = "vem alguém junto"),
// mas a ARTE diz QUEM: todas as oito cartas usavam o mesmo desenho de fogueira-e-morador, e
// oito terras com a mesma capa não se distinguem na mão. Cada pictograma é o EMBLEMA do
// morador — o gato, o capacete, a gravata sobre a lenha, o trevo, o pincel, o balde, a pena,
// a foice — no mesmo P&B de duas cores do baralho.

/** O gato: sentado de perfil, o rabo enrolado — e a lareira FRIA ao lado, só lenha e fumaça. */
const drawCat = (p: Painter): void => {
  // A lenha sem chama, e o fio de fumaça que sobe torto.
  p.rect(5, 19, 7, 1);
  p.rect(6, 18, 5, 1);
  p.px(8, 15);
  p.px(9, 13);
  p.px(8, 11);
  // O corpo sentado: peito reto, costas em curva, a cabeça de orelhas triangulares.
  p.rect(24, 7, 5, 4); // cabeça
  p.px(24, 6); p.px(24, 5); // orelha esquerda
  p.px(28, 6); p.px(28, 5); // orelha direita
  p.rect(23, 11, 7, 2); // pescoço/peito
  p.rect(22, 13, 9, 6); // corpo
  p.rect(23, 19, 8, 2); // as patas assentadas
  // O rabo: desce do corpo e enrola na frente das patas.
  p.px(21, 19); p.px(20, 18); p.px(19, 17); p.px(19, 16); p.px(20, 15);
  p.rect(2, 21, 32, 1); // o chão
};

/** O astronauta: o capacete com o visor vazado, os ombros do traje, e o chão de cratera. */
const drawAstronaut = (p: Painter): void => {
  const cx = 13;
  const cy = 10;
  for (let y = -6; y <= 6; y += 1) {
    for (let x = -6; x <= 6; x += 1) {
      const inHelmet = x * x + y * y <= 36;
      const inVisor = x >= -3 && x <= 3 && y >= -2 && y <= 2;
      if (inHelmet && !inVisor) p.px(cx + x, cy + y);
    }
  }
  p.rect(6, 17, 15, 3); // os ombros do traje
  // As amostras da cratera: dois pedregulhos e as bocas de impacto.
  p.rect(26, 18, 4, 3);
  p.rect(31, 19, 3, 2);
  p.px(24, 20); p.px(30, 17);
  p.rect(2, 21, 32, 1); // o chão
};

/** O empresário: a GRAVATA pendurada sobre o estoque — os três toros de madeira em anel. */
const drawBusinessman = (p: Painter): void => {
  // A gravata: nó, lâmina, ponta.
  p.rect(26, 4, 3, 2);
  p.rect(25, 6, 5, 7);
  p.px(26, 13); p.px(27, 13); p.px(28, 13);
  p.px(27, 14);
  // O estoque: toros vistos de topo — anéis com o miolo marcado — empilhados em pirâmide.
  const ring = (cx: number, cy: number): void => {
    for (const [dx, dy] of [
      [-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, -2], [-2, 2], [2, 2],
      [-3, -1], [3, -1], [-3, 1], [3, 1], [-1, -3], [1, -3], [-1, 3], [1, 3],
    ] as const) p.px(cx + dx, cy + dy);
    p.px(cx, cy);
  };
  ring(8, 17);
  ring(15, 17);
  ring(11, 11);
  p.rect(2, 21, 32, 1); // o chão
};

/** O operário: o TREVO de radiação sobre a água que brilha — o vau é dele. */
const drawWorkman = (p: Painter): void => {
  const cx = 18;
  const cy = 10;
  p.rect(cx - 1, cy - 1, 3, 3); // o miolo
  for (let y = -8; y <= 8; y += 1) {
    for (let x = -8; x <= 8; x += 1) {
      const d2 = x * x + y * y;
      if (d2 < 9 || d2 > 60) continue;
      // Três pás a 90°, 210° e 330° — o ângulo de cada pixel decide se ele pertence a uma.
      const ang = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
      for (const blade of [90, 210, 330]) {
        const diff = Math.abs(((ang - blade + 540) % 360) - 180);
        if (diff <= 26) p.px(cx + x, cy + y);
      }
    }
  }
  // A água em travessões — a mesma língua do mar do baralho.
  p.rect(4, 20, 4, 1);
  p.rect(12, 21, 5, 1);
  p.rect(21, 20, 4, 1);
  p.rect(29, 21, 4, 1);
};

/** A artista: o pincel em diagonal, a gota caindo, e os canteiros já cavados embaixo. */
const drawPainter = (p: Painter): void => {
  // O cabo, 2px de grossura, subindo da esquerda pra direita.
  for (let t = 0; t <= 9; t += 1) {
    p.px(8 + t, 17 - t);
    p.px(9 + t, 17 - t);
  }
  p.rect(18, 6, 3, 2); // a virola
  p.px(21, 5); p.px(22, 4); p.px(23, 3); // a ponta de pelo
  p.px(25, 7); p.px(25, 8); // a gota de tinta caindo dela
  // Os canteiros: três montes de terra esperando pigmento.
  for (const bx of [5, 14, 23]) {
    p.rect(bx, 20, 5, 1);
    p.px(bx + 1, 19); p.px(bx + 2, 19); p.px(bx + 3, 19);
  }
  p.rect(2, 21, 32, 1); // o chão
};

/** O vendedor: o BALDE da amostra grátis, com a alça em arco, sobre a lagoa da beira. */
const drawSalesman = (p: Painter): void => {
  // A alça.
  p.px(12, 9); p.px(13, 8); p.px(15, 7); p.px(17, 6); p.px(19, 7); p.px(21, 8); p.px(22, 9);
  // A borda e o corpo afunilando.
  p.rect(11, 10, 13, 2);
  for (let y = 0; y < 6; y += 1) p.rect(12 + Math.floor(y / 2), 12 + y, 11 - Math.floor(y / 2) * 2, 1);
  // A lagoa.
  p.rect(5, 20, 5, 1);
  p.rect(14, 21, 6, 1);
  p.rect(25, 20, 5, 1);
};

/** O poeta: a PENA inclinada, a ponta no chão — e uma nota subindo dos pinheiros que cantam. */
const drawPoet = (p: Painter): void => {
  // A haste, do bico à ponta.
  for (let t = 0; t <= 13; t += 1) p.px(9 + t, 19 - t);
  // As barbas: o corpo da pluma preenche o lado esquerdo da metade de cima.
  for (let t = 6; t <= 13; t += 1) p.rect(9 + t - 3, 19 - t, 3, 1);
  p.px(8, 20); // o bico tocando o chão
  // A nota musical.
  p.rect(28, 14, 3, 2);
  p.rect(30, 7, 1, 8);
  p.px(31, 8); p.px(32, 9);
  p.rect(2, 21, 32, 1); // o chão
};

/** A Morte, de folga: só a FOICE fincada — o cabo em diagonal, a lâmina em crescente — no mato alto. */
const drawDeathCard = (p: Painter): void => {
  // O cabo, 2px, fincado no chão.
  for (let t = 0; t <= 15; t += 1) {
    p.px(9 + Math.floor(t * 0.75), 20 - t);
    p.px(10 + Math.floor(t * 0.75), 20 - t);
  }
  // A lâmina: um crescente que abre para baixo-direita a partir do topo do cabo.
  p.rect(21, 4, 10, 1);
  p.rect(24, 5, 8, 1);
  p.rect(27, 6, 6, 1);
  p.rect(29, 7, 4, 1);
  p.rect(31, 8, 2, 1);
  // O mato alto que ela veio calar: tufos de dois pixels.
  for (const gx of [5, 15, 22, 28]) {
    p.px(gx, 20); p.px(gx + 1, 19); p.px(gx + 2, 20);
  }
  p.rect(2, 21, 32, 1); // o chão
};

const NPC_ART: Partial<Record<NpcKind, (p: Painter) => void>> = {
  blackCat: drawCat,
  astronaut: drawAstronaut,
  businessMan: drawBusinessman,
  radiationSuit: drawWorkman,
  painter: drawPainter,
  salesman: drawSalesman,
  poet: drawPoet,
  death: drawDeathCard,
};

/** O curinga: a estrela de quatro pontas — terra que ainda não disse o que é. */
const drawWild = (p: Painter): void => {
  const cx = 18;
  const cy = 11;
  for (let n = 0; n <= 6; n += 1) {
    p.rect(cx - (6 - n), cy - n, (6 - n) * 2 + 1, 1);
    p.rect(cx - (6 - n), cy + n, (6 - n) * 2 + 1, 1);
  }
  p.px(cx - 9, cy);
  p.px(cx + 9, cy);
  p.px(cx, cy - 9);
  p.px(cx, cy + 9);
};

const DRAWERS: Record<CardSuit, (p: Painter) => void> = {
  tide: drawTide,
  thorn: drawThorn,
  web: drawWeb,
  peak: drawPeak,
  grave: drawGrave,
  bloom: drawBloom,
  hearth: drawHearth,
  wild: drawWild,
};

/**
 * Desenha o pictograma no canvas da carta. Síncrono: a arte nunca "carrega". Uma carta de NPC
 * passa o MORADOR e ganha o emblema dele; sem morador (ou espécie sem emblema), vale o naipe.
 */
export const drawCardArt = (canvas: HTMLCanvasElement, suit: CardSuit, npc?: NpcKind): void => {
  canvas.width = ART_W;
  canvas.height = ART_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, ART_W, ART_H);
  const p = makePainter(ctx);
  for (const [sx, sy] of STARS) p.px(sx, sy);
  ((npc && NPC_ART[npc]) ?? DRAWERS[suit])(p);
};
