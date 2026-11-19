// A ARTE DAS RELÍQUIAS ENTERRADAS (relics/relics.ts): nove desenhos de 32×32, pixel a pixel, na paleta do jogo (as
// rampas de pixelForms, com a luz de cima e da esquerda) e na tinta dele. Só desenho: quem vira textura é
// relicTextures. Sem nada do motor aqui, para o desenho poder ser conferido fora do jogo.
//
// Nenhuma marca: a caixa, a fita e o disco são de formato reconhecível, mas sem logotipo; o nome mora no caderno.

import { INK, RAMPS, type Paint } from './pixelForms';
import type { RelicKind } from '@/game/relics/relics';

export const RELIC_PX = 32;

/** O pincel de um desenho: o retângulo, o pixel, a borracha, uma grade de letras e os algarismos 3×5. */
export interface Pen {
  rect: Paint;
  px: (color: string, x: number, y: number) => void;
  clear: (x: number, y: number, w: number, h: number) => void;
  grid: (x0: number, y0: number, rows: readonly string[], map: Readonly<Record<string, string>>) => void;
  digits: (text: string, x: number, y: number, color: string) => void;
}

const DIGITS: Readonly<Record<string, readonly string[]>> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
};

/** Monta o pincel sobre uma função que pinta retângulos (cor vazia = apagar). */
export const penOf = (rect: Paint): Pen => ({
  rect,
  px: (color, x, y) => rect(color, x, y, 1, 1),
  clear: (x, y, w, h) => rect('', x, y, w, h),
  grid: (x0, y0, rows, map) => rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const color = map[row[x]];
      if (color !== undefined) rect(color, x0 + x, y0 + y, 1, 1);
    }
  }),
  digits: (text, x, y, color) => [...text].forEach((ch, i) => {
    (DIGITS[ch] ?? []).forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx += 1) if (row[dx] === '#') rect(color, x + i * 4 + dx, y + dy, 1, 1);
    });
  }),
});

const [METAL_HI, METAL, METAL_LO, METAL_DK] = RAMPS.metal;
const [PAPER, PAPER_MID, PAPER_LO] = RAMPS.plaster;
const [RED_HI, RED, RED_LO, RED_DK] = RAMPS.cap;
const [WOOD_HI, WOOD, WOOD_LO, WOOD_DK] = RAMPS.wood;
const [BLUE_HI, BLUE, BLUE_LO, BLUE_DK] = RAMPS.blue;
const [ORANGE_HI, ORANGE, ORANGE_LO] = RAMPS.orange;
const [STONE_HI, STONE, STONE_LO] = RAMPS.stone;
const CREAM = RAMPS.stem[0];
const GOLD = '#f0c85a';
const GOLD_LO = '#c8963a';
const SUN = '#fff2b0';
/** O plástico preto (cartucho, fita): a tinta clareada, fria. */
const PLASTIC = ['#4a4d63', '#33354a', '#26283b', '#1e2032'] as const;
const LEAF = ['#7da45a', '#4f7a3e', '#355a34'] as const;
const SAND = ['#f0cf96', '#d9a468', '#b07a48', '#8a5a36'] as const;

/** Um contorno de tinta com o miolo de uma cor. */
const box = (p: Pen, x: number, y: number, w: number, h: number, fill: string): void => {
  p.rect(INK, x, y, w, h);
  p.rect(fill, x + 1, y + 1, w - 2, h - 2);
};

/**
 * BRIAN'S MANSION: a fita de Mega Drive que nunca existiu. Plástico preto com a pega de frisos em cima, e o rótulo: a
 * mansão assombrada contra a noite roxa, a lua entre a chaminé e a torre, as janelas acesas, e a faixa vermelha do nome.
 */
const briansMansion = (p: Pen): void => {
  box(p, 4, 2, 24, 29, PLASTIC[1]);
  p.rect(PLASTIC[0], 5, 3, 22, 1);
  p.rect(PLASTIC[0], 5, 3, 1, 27);
  p.rect(PLASTIC[2], 26, 4, 1, 26);
  p.rect(PLASTIC[2], 5, 29, 22, 1);
  // a pega: três frisos
  for (const y of [5, 7, 9]) {
    p.rect(PLASTIC[0], 7, y - 1, 18, 1);
    p.rect(PLASTIC[3], 7, y, 18, 1);
  }
  // o rótulo, afundado no plástico
  p.rect(PLASTIC[3], 6, 11, 20, 18);
  const night = ['#241f3d', '#241f3d', '#2b2448', '#33295a', '#33295a', '#3c2e66', '#44337a', '#44337a', '#4a3570', '#4a3570', '#4a3570', '#4a3570'];
  night.forEach((color, i) => p.rect(color, 7, 12 + i, 18, 1));
  // a lua cheia, em cima à esquerda
  p.grid(8, 12, ['.##.', '####', '####', '.##.'], { '#': CREAM });
  p.px('#c9bd96', 11, 13);
  p.px('#c9bd96', 11, 14);
  p.px('#c9bd96', 10, 15);
  for (const [x, y] of [[16, 12], [23, 13], [17, 15], [23, 18], [7, 17]] as const) p.px(CREAM, x, y);
  // a mansão em silhueta: o frontão grande no meio e a torre de telhado pontudo à direita
  const sil = '#160f22';
  p.rect('#120c1c', 7, 23, 18, 1);
  for (let i = 0; i < 6; i += 1) p.rect(sil, 13 - i, 14 + i, 1 + 2 * i, 1); // o frontão
  p.rect(sil, 9, 20, 9, 4); // o corpo
  p.rect(sil, 16, 13, 1, 3); // a chaminé
  p.px(sil, 20, 11); // a torre
  p.rect(sil, 19, 12, 3, 1);
  p.rect(sil, 18, 13, 5, 1);
  p.rect(sil, 19, 14, 3, 10);
  // a lápide no jardim
  p.grid(7, 21, ['.#.', '###', '###'], { '#': METAL_LO });
  p.px(METAL, 7, 22);
  // as janelas acesas e a porta
  p.px(GOLD, 13, 17); // a janela redonda do sótão
  p.px(GOLD_LO, 13, 18);
  for (const [x, y] of [[10, 21], [16, 21], [20, 16], [20, 19]] as const) {
    p.px(GOLD, x, y);
    p.px(GOLD_LO, x, y + 1);
  }
  p.rect(GOLD_LO, 13, 21, 1, 3);
  p.px(GOLD, 13, 21);
  // a faixa do nome
  p.rect(RED, 7, 24, 18, 4);
  p.rect(RED_HI, 7, 24, 18, 1);
  p.rect(RED_LO, 7, 27, 18, 1);
  p.grid(8, 25, ['##.#.##.#.###.##', '#.#..#.##.#.#.#.'], { '#': CREAM });
};

/**
 * ZERO TO ONE: a fita azul, o azul do Bitsy. Cartucho de mão com o canto cortado e os frisos embaixo; no rótulo, o
 * azul-escuro do jogo, o "0 → 1" e a gente azul andando para o sol quente do fim.
 */
const zeroToOne = (p: Pen): void => {
  const [hi, base, lo, dk] = ['#6cc0f2', '#3aa2ea', '#2e7fc0', '#235f93'];
  box(p, 7, 3, 18, 27, base);
  // o canto cortado
  p.clear(22, 3, 3, 1);
  p.clear(23, 4, 2, 1);
  p.clear(24, 5, 1, 1);
  p.px(INK, 22, 4);
  p.px(INK, 23, 5);
  p.px(INK, 21, 3);
  p.rect(hi, 8, 4, 13, 1);
  p.rect(hi, 8, 4, 1, 25);
  p.rect(lo, 23, 7, 1, 22);
  p.px(lo, 22, 6);
  p.rect(lo, 9, 28, 14, 1);
  // os frisos da pega
  for (const y of [24, 26]) {
    p.rect(lo, 10, y, 12, 1);
    p.rect(hi, 10, y + 1, 12, 1);
  }
  // o rótulo
  p.rect(dk, 10, 6, 12, 16);
  p.rect('#2e4358', 11, 7, 10, 14);
  const glow = '#dde8e9';
  p.digits('0', 11, 8, glow);
  p.grid(14, 8, ['.#..', '..#.', '####', '..#.', '.#..'], { '#': glow });
  p.digits('1', 18, 8, glow);
  // a gente azul indo para o sol
  p.rect('#a6b6b8', 11, 19, 10, 2);
  p.rect('#8da2a5', 11, 20, 10, 1);
  p.grid(13, 15, ['.#.', '###', '.#.', '#.#'], { '#': base });
  p.px('#6cc0f2', 14, 15);
  p.grid(17, 13, ['.##.', '####', '####', '.##.'], { '#': '#ffe6b8' });
  p.px(SUN, 18, 14);
  p.px('#3a5066', 11, 7);
};

/**
 * JOURNEY: a caixa de disco do PlayStation 3, com o disco escapando pela direita. A capa: o céu dourado, a montanha
 * com a luz no alto, as dunas, e o viajante de manto vermelho com o cachecol ao vento.
 */
const journey = (p: Pen): void => {
  // o disco, atrás da caixa
  const cx = 23.5;
  const cy = 17.5;
  for (let y = 9; y <= 26; y += 1) {
    for (let x = 16; x <= 31; x += 1) {
      const d = Math.hypot(x + 0.5 - cx - 0.5, y + 0.5 - cy - 0.5);
      if (d > 8.6) continue;
      if (d > 7.8) { p.px(INK, x, y); continue; }
      if (d < 1.6) continue;
      if (d < 2.6) { p.px(METAL_LO, x, y); continue; }
      const band = (x - y + 40) % 9;
      p.px(band === 0 ? '#ea8ba6' : band === 1 ? BLUE_HI : band === 2 ? GOLD : x < cx ? METAL_HI : METAL, x, y);
    }
  }
  // a caixa
  box(p, 3, 2, 20, 29, PLASTIC[2]);
  p.rect(PLASTIC[3], 4, 3, 18, 4);
  p.rect(METAL_LO, 4, 6, 18, 1);
  p.rect(METAL, 5, 4, 4, 1);
  // o céu
  const sky = [CREAM, CREAM, '#f2dcb0', '#f0c88a', '#f0c88a', '#f4b46a', ORANGE_HI, ORANGE_HI, ORANGE_HI];
  sky.forEach((color, i) => p.rect(color, 4, 7 + i, 18, 1));
  // a montanha e a luz no alto dela
  for (let i = 0; i < 8; i += 1) {
    p.rect('#a8685a', 13 - i, 9 + i, 1 + i, 1);
    p.rect('#8a4e4a', 14, 9 + i, i, 1);
  }
  p.px(SUN, 13, 8);
  p.px(SUN, 13, 7);
  p.px('#ffe6b8', 12, 8);
  p.px('#ffe6b8', 14, 8);
  // as dunas
  for (let x = 4; x <= 21; x += 1) {
    const back = 17 + Math.round(Math.sin(x / 2.6) * 1.2);
    const front = 22 + Math.round(Math.sin(x / 3.4 + 2) * 1.6);
    for (let y = back; y <= 29; y += 1) p.px(y < front ? SAND[1] : SAND[0], x, y);
    p.px(SAND[0], x, back);
    if (Math.sin(x / 3.4 + 2) < -0.3) p.px(SAND[2], x, front);
    for (let y = front + 3; y <= 29; y += 1) if ((x + y) % 7 === 0) p.px(SAND[2], x, y);
  }
  // o viajante e o cachecol
  p.grid(7, 20, ['.k..', 'kRgg', 'RRR.', 'RRR.', 'R.R.'], { k: '#3b2a26', R: RED, g: GOLD });
  p.px(RED_HI, 7, 22);
  p.px(GOLD, 11, 20);
};

/**
 * GONE HOME: a caixinha do jogo de computador, de três quartos. Na frente, a casa da família numa noite de chuva, com
 * as janelas de cima acesas e a luz da varanda; em cima, o nome.
 */
const goneHome = (p: Pen): void => {
  const d = 4;
  // a tampa e o lado, de esguelha
  for (let i = 1; i <= d; i += 1) {
    p.rect(INK, 3 + i, 7 - i, 19, 1);
    p.rect(INK, 21 + i, 7 - i, 1, 24);
  }
  for (let i = 1; i < d; i += 1) {
    p.rect(PAPER_LO, 4 + i, 7 - i, 17, 1);
    p.rect('#22243a', 21 + i, 8 - i, 1, 22);
  }
  p.rect(PAPER_MID, 5, 6, 17, 1);
  p.px(CREAM, 23, 10);
  p.rect(CREAM, 24, 12, 1, 6);
  // a frente
  box(p, 3, 7, 20, 24, BLUE_DK);
  const sky = [BLUE_DK, BLUE_DK, '#23405e', '#23405e', BLUE_LO, BLUE_LO, BLUE_LO, '#325e7c'];
  sky.forEach((color, i) => p.rect(color, 4, 8 + i, 18, 1));
  p.rect('#325e7c', 4, 16, 18, 12);
  // o nome
  p.grid(5, 9, ['####.####..', '#....#..#..'], { '#': PAPER });
  p.grid(13, 9, ['#..#.###', '####.#..'], { '#': PAPER });
  // a casa
  const wall = '#3e4156';
  const roof = '#22243a';
  for (let i = 0; i < 6; i += 1) p.rect(roof, 13 - i, 13 + i, 2 + 2 * i, 1);
  p.rect(wall, 8, 19, 12, 9);
  p.rect('#4a4d63', 8, 19, 1, 9);
  p.px(roof, 17, 13);
  p.rect(roof, 17, 12, 1, 3); // a chaminé
  for (const x of [10, 16]) {
    p.rect(GOLD, x, 20, 2, 2);
    p.px(SUN, x, 20);
  }
  p.rect(GOLD_LO, 13, 23, 2, 5); // a porta aberta, a luz de dentro
  p.px(GOLD, 13, 23);
  p.px(SUN, 12, 23); // a luz da varanda
  p.rect('#2a3a2a', 4, 28, 18, 2);
  p.rect(LEAF[2], 4, 28, 18, 1);
  // a árvore da esquerda
  p.rect('#1e2a22', 4, 15, 3, 13);
  p.rect('#1e2a22', 5, 13, 2, 2);
  // a chuva
  for (let y = 8; y <= 29; y += 1) {
    for (let x = 4; x <= 21; x += 1) if ((x * 3 + y * 5) % 17 === 0 && y > 11) p.px('#8fb2c8', x, y);
  }
};

/**
 * DISCO ELYSIUM, como livro: capa dura cor de mar fundo, o rosto de perfil pintado a pinceladas quentes, a lombada com
 * os frisos dourados e as folhas aparecendo do lado.
 */
const discoElysium = (p: Pen): void => {
  box(p, 3, 2, 24, 28, '#1f4a52');
  p.rect('#152f3a', 4, 3, 3, 26); // a lombada
  p.rect(GOLD_LO, 4, 5, 3, 1);
  p.rect(GOLD_LO, 4, 26, 3, 1);
  p.rect(INK, 7, 3, 1, 26);
  // as folhas
  for (let y = 3; y <= 28; y += 1) p.px(y % 2 ? PAPER : PAPER_MID, 25, y);
  p.rect(INK, 26, 3, 1, 26);
  // o fundo a pinceladas
  for (let y = 3; y <= 28; y += 1) {
    for (let x = 8; x <= 24; x += 1) {
      const n = (x * 7 + y * 13 + ((x * y) % 5)) % 11;
      if (n === 0) p.px('#2f6a6a', x, y);
      else if (n === 1) p.px('#173a44', x, y);
    }
  }
  // o rosto de perfil, virado para a esquerda: testa, nariz, boca, queixo, a orelha, o cabelo e o pescoço
  p.grid(10, 4, [
    '....hhhhhh...',
    '..hhhhhhhhhh.',
    '.hhhhhhhhhhhh',
    '.hhhhhhhhhHhh',
    '.ffhhhhhhhhhh',
    '.fffmmhhhhhhh',
    '.fefmmsshhhh.',
    '..ffmmssaass.',
    '.fgfmmssaass.',
    'ffffmmmssss..',
    '.fffmmmsss...',
    '..nfmmmss....',
    '.lffmmmss....',
    '..lfmmss.....',
    '.fffmmss.....',
    '..ffmmss.....',
    '...tmmss.....',
    '....mmsss....',
    '....mmssss...',
  ], {
    h: '#2a1c1c', H: '#3f6a6a', f: ORANGE_HI, g: GOLD, m: ORANGE, s: ORANGE_LO, a: '#c8603a', e: INK, n: '#6e2f28', l: RED, t: '#3f8a8a',
  });
  // pinceladas: a luz quente na testa e o reflexo frio na nuca
  p.px(GOLD, 12, 9);
  p.px(GOLD, 11, 13);
  p.px('#3f8a8a', 18, 18);
  p.px('#3f8a8a', 19, 21);
  // o nome
  p.rect(GOLD_LO, 8, 25, 17, 3);
  p.rect(GOLD, 8, 25, 17, 1);
  p.grid(9, 26, ['##.#.##.##.###.#'], { '#': '#152f3a' });
};

/**
 * 1984: o livro de bolso, vermelho-escuro, com o olho que vigia no meio da capa e o ano embaixo, em creme. As folhas
 * aparecem do lado.
 */
const book1984 = (p: Pen): void => {
  box(p, 6, 2, 20, 28, RED_DK);
  p.rect('#1e1a26', 7, 3, 17, 3);
  p.rect(RED_LO, 7, 6, 17, 1);
  p.rect(RED_LO, 7, 3, 1, 26); // a lombada
  for (let y = 3; y <= 28; y += 1) p.px(y % 2 ? PAPER : PAPER_MID, 24, y);
  // o olho
  const almond: ReadonlyArray<readonly [number, number, number]> = [[9, 14, 4], [10, 12, 8], [11, 10, 12], [12, 9, 14], [13, 10, 12], [14, 12, 8], [15, 14, 4]];
  for (const [y, x, w] of almond) p.rect(PAPER, x, y, w, 1);
  p.rect(PAPER_LO, 12, 14, 8, 1);
  p.grid(14, 10, ['.##.', '####', '####', '####', '.##.'], { '#': BLUE });
  p.rect(BLUE_HI, 14, 11, 1, 2);
  p.rect(INK, 15, 11, 2, 3);
  p.px(PAPER, 15, 11);
  // os cílios
  for (const [x, y] of [[10, 9], [12, 8], [16, 7], [20, 8], [22, 9]] as const) p.px(PAPER_MID, x, y);
  p.px(PAPER_MID, 13, 8);
  p.px(PAPER_MID, 19, 8);
  // o ano e o autor
  p.digits('1984', 9, 19, PAPER);
  p.grid(10, 26, ['##.###.#.##.'], { '#': PAPER_MID });
};

/**
 * 2001: UMA ODISSEIA NO ESPAÇO: a fita VHS na frente da capa. Na capa, o sol nascendo atrás do planeta, as estrelas e
 * o ano; na fita, a etiqueta com o olho vermelho do computador e, pela janela, os dois rolos.
 */
const odyssey2001 = (p: Pen): void => {
  box(p, 9, 1, 21, 19, '#11121c');
  for (const [x, y] of [[11, 9], [27, 10], [14, 12], [24, 3], [28, 14], [11, 15], [26, 7]] as const) p.px(METAL_HI, x, y);
  p.digits('2001', 12, 3, PAPER);
  // o planeta e a borda acesa
  for (let x = 10; x <= 28; x += 1) {
    const top = Math.round(40 - Math.sqrt(24 * 24 - (x + 0.5 - 19.5) ** 2));
    for (let y = top; y <= 18; y += 1) p.px(y === top ? (Math.abs(x - 19) < 4 ? CREAM : '#8fc0e0') : '#1c1f33', x, y);
  }
  // o sol saindo de trás dele
  p.rect(SUN, 19, 12, 2, 2);
  p.px(CREAM, 18, 12);
  p.px(CREAM, 21, 13);
  p.px('#ffe6b8', 19, 11);
  p.px('#ffe6b8', 20, 14);
  p.px('#ffe6b8', 17, 13);
  p.px('#ffe6b8', 22, 12);
  // a fita
  box(p, 1, 16, 24, 15, PLASTIC[2]);
  p.rect(PLASTIC[1], 2, 17, 22, 1);
  p.rect(PLASTIC[1], 2, 17, 1, 13);
  p.rect(PLASTIC[3], 3, 29, 21, 1);
  // a etiqueta
  p.rect(PAPER, 3, 18, 20, 4);
  p.rect(PAPER_MID, 3, 21, 20, 1);
  p.grid(4, 19, ['##.###.#.##', '#.##..##.#.'], { '#': METAL_DK });
  p.grid(18, 18, ['.s.', 'sRs', '.s.'], { s: RED_DK, R: RED_HI });
  p.px(GOLD, 19, 19);
  // a janela e os rolos
  p.rect('#3a3d4a', 6, 23, 14, 5);
  p.rect('#2a1f1a', 7, 24, 5, 3);
  p.rect('#2a1f1a', 15, 24, 3, 3);
  p.rect(PAPER_MID, 9, 25, 1, 1);
  p.rect(PAPER_MID, 16, 25, 1, 1);
  p.rect('#555a6c', 6, 23, 14, 1);
};

/**
 * O MARCADOR DO CLUBE DE LEITURA NAS MONTANHAS: papel creme com as montanhas e os pinheiros, o livro aberto embaixo,
 * as linhas de texto, o rabo de andorinha e a borla vermelha amarrada no furo.
 */
const bookClub = (p: Pen): void => {
  // a borla
  p.grid(16, 0, ['.rr..', 'r..r.', '....r', '...rr', '...rR', '..rrR', '..r.r', '..r.r'], { r: RED, R: RED_LO });
  // o marcador
  p.rect(INK, 10, 3, 11, 25);
  p.rect(PAPER, 11, 4, 9, 23);
  p.rect(PAPER_MID, 19, 4, 1, 23);
  p.rect(INK, 10, 27, 4, 1);
  p.rect(INK, 17, 27, 4, 1);
  p.rect(INK, 10, 28, 2, 1);
  p.rect(INK, 19, 28, 2, 1);
  p.rect(PAPER, 11, 27, 2, 1);
  p.rect(PAPER_MID, 18, 27, 2, 1);
  p.px(INK, 14, 26);
  p.px(INK, 16, 26);
  p.px(INK, 15, 25);
  p.px(INK, 15, 5); // o furo
  p.px(PAPER_LO, 16, 5);
  // o desenho: céu, sol, a montanha grande com neve, a pequena atrás, os pinheiros
  p.rect('#a8c8d4', 12, 7, 7, 10);
  p.rect(PAPER_LO, 11, 6, 9, 1);
  p.grid(17, 8, ['##', '##'], { '#': GOLD });
  p.px(SUN, 17, 8);
  for (let i = 0; i < 4; i += 1) {
    const x0 = Math.max(12, 17 - i);
    p.rect(STONE_LO, x0, 11 + i, Math.min(18, 17 + i) - x0 + 1, 1);
  }
  for (let i = 0; i < 6; i += 1) {
    const x0 = Math.max(12, 14 - i);
    const x1 = Math.min(18, 14 + i);
    p.rect(STONE_HI, x0, 9 + i, 14 - x0 + 1, 1);
    if (x1 > 14) p.rect(STONE, 15, 9 + i, x1 - 14, 1);
  }
  p.px(PAPER, 14, 9);
  p.rect(PAPER, 13, 10, 2, 1);
  p.px(PAPER_MID, 15, 10);
  p.px(PAPER, 12, 11);
  p.px(PAPER_MID, 17, 11);
  for (const x of [12, 15]) p.grid(x, 13, ['.#.', '###', '###'], { '#': LEAF[2] });
  p.grid(17, 14, ['.#', '##'], { '#': LEAF[2] });
  p.rect(LEAF[1], 12, 16, 7, 1);
  // o nome do clube e o texto
  p.grid(12, 18, ['#.##.#.', '##.#.##'], { '#': WOOD });
  p.rect(STONE_HI, 12, 21, 7, 1);
  p.rect(STONE_HI, 12, 23, 6, 1);
  p.rect(STONE_HI, 12, 25, 4, 1);
};

/**
 * O CARTÃO-POSTAL DE 2024: o ano subindo o litoral. O mar, a areia, o coqueiro, o sol, o selo vermelho carimbado e o
 * ano escrito na areia.
 */
const nomadPostcard = (p: Pen): void => {
  box(p, 1, 5, 30, 22, PAPER);
  // o céu, o sol e o mar
  p.rect('#8fc0e0', 3, 7, 26, 9);
  p.rect('#a8d0e8', 3, 7, 26, 3);
  p.grid(14, 9, ['.##.', '####', '####', '.##.'], { '#': GOLD });
  p.px(SUN, 15, 10);
  p.rect(BLUE, 3, 16, 26, 4);
  p.rect(BLUE_LO, 3, 18, 26, 1);
  for (const x of [5, 9, 13, 20, 25]) p.rect(BLUE_HI, x, 17, 2, 1);
  p.rect(METAL_HI, 3, 19, 26, 1);
  // a areia e o ano
  p.rect(SAND[0], 3, 20, 26, 5);
  p.rect(SAND[1], 3, 24, 26, 1);
  p.digits('2024', 14, 20, WOOD_LO);
  // o coqueiro
  for (const [x, y] of [[8, 23], [8, 22], [8, 21], [7, 20], [7, 19], [7, 18], [7, 17], [6, 16], [6, 15], [6, 14], [6, 13]] as const) {
    p.px(WOOD, x, y);
    p.px(WOOD_HI, x - 1, y);
  }
  p.grid(1, 9, [
    '..##....##..',
    '.#gg#..#gg#.',
    '#g..ggggg..#',
    '...g#ggg#g..',
    '..g#..#..#g.',
    '.g#...#...#g',
    '.#....#....#',
  ], { g: LEAF[0], '#': LEAF[1] });
  p.px(WOOD_LO, 6, 12);
  p.px(WOOD_DK, 7, 12);
  // o selo e o carimbo
  p.rect(PAPER, 22, 7, 7, 8);
  for (let i = 0; i < 7; i += 2) {
    p.px(INK, 22 + i, 7);
    p.px(INK, 22 + i, 14);
  }
  p.rect(RED, 23, 8, 5, 6);
  p.rect(RED_HI, 23, 8, 5, 1);
  p.grid(24, 10, ['.#.', '###', '.#.'], { '#': GOLD });
  p.grid(17, 11, ['#.#.#.#', '.#.#.#.', '#.#.#.#'], { '#': '#3b3e52' });
  // a borda e a sombra
  p.rect(PAPER_MID, 2, 25, 28, 1);
  p.rect(PAPER_MID, 29, 6, 1, 20);
};

/**
 * O TINY RPG STUDIO: o disquete da engine. Plástico azul com o canto cortado, a janela de metal deslizante em cima e,
 * na etiqueta, a faixa do nome e uma telinha de RPG pequeno — a grade de tiles do editor no chão, a árvore, o
 * cavaleiro e o baú.
 */
const tinyRpgStudio = (p: Pen): void => {
  const hi = '#4a7fa0';
  box(p, 3, 3, 26, 26, BLUE_LO);
  // o canto cortado
  p.clear(27, 3, 2, 1);
  p.clear(28, 4, 1, 1);
  p.px(INK, 27, 4);
  p.rect(hi, 4, 4, 1, 24);
  p.rect(hi, 4, 4, 22, 1);
  p.rect(BLUE_DK, 27, 6, 1, 22);
  p.rect(BLUE_DK, 5, 27, 22, 1);
  // a janela de metal e a fresta do disco
  p.rect(INK, 9, 3, 14, 10);
  p.rect(METAL, 10, 4, 12, 8);
  p.rect(METAL_HI, 10, 4, 12, 1);
  p.rect(METAL_LO, 10, 11, 12, 1);
  p.rect(PLASTIC[2], 17, 5, 3, 6);
  // os dois furinhos de baixo
  p.rect(INK, 4, 25, 2, 2);
  p.rect(INK, 26, 25, 2, 2);
  // a etiqueta: a faixa do nome e a telinha do RPG
  p.rect(INK, 6, 15, 20, 13);
  p.rect(PAPER, 7, 16, 18, 11);
  p.rect(RED, 7, 16, 18, 2);
  p.rect(RED_HI, 7, 16, 18, 1);
  p.grid(8, 17, ['###.#.##.#.#.###'], { '#': CREAM });
  p.rect('#a8c8d4', 7, 18, 18, 5);
  p.rect(LEAF[0], 7, 23, 18, 1);
  p.rect(LEAF[1], 7, 24, 18, 3);
  for (const x of [9, 12, 15, 18, 21]) p.rect(LEAF[2], x, 24, 1, 3); // a grade de tiles do editor
  p.grid(8, 18, ['.##.', '####', '####'], { '#': LEAF[1] });
  p.px(LEAF[0], 9, 18);
  p.px(LEAF[0], 8, 19);
  p.rect(WOOD, 9, 21, 2, 2);
  p.grid(15, 19, ['.M.', 'MMM', 'gBg', 'BBB', 'B.B'], { M: METAL_HI, B: BLUE, g: LEAF[0] });
  p.rect(WOOD, 20, 21, 4, 2);
  p.rect(WOOD_LO, 20, 21, 4, 1);
  p.px(GOLD, 21, 22);
};

/** O DIPLOMA DE CIÊNCIA DA COMPUTAÇÃO: o canudo enrolado, com a fita vermelha e o laço, e uma medalha pendurada na fita. */
const diploma = (p: Pen): void => {
  // o canudo
  p.rect(INK, 4, 6, 24, 10);
  [PAPER, PAPER, PAPER_MID, PAPER_MID, PAPER_MID, PAPER_LO, PAPER_LO, '#85817c'].forEach((color, i) => p.rect(color, 5, 7 + i, 22, 1));
  const cap = ['.kkk.', 'kPPPk', 'kPoPk', 'kPoPk', 'kPoPk', 'kPoPk', 'kPoPk', 'kPoPk', 'kPPPk', '.kkk.'];
  p.grid(1, 6, cap, { k: INK, P: PAPER, o: PAPER_LO });
  p.grid(26, 6, cap, { k: INK, P: PAPER_MID, o: PAPER_LO });
  // a fita vermelha e o laço
  p.rect(RED, 14, 6, 4, 10);
  p.rect(RED_HI, 14, 6, 1, 10);
  p.rect(RED_LO, 17, 6, 1, 10);
  p.grid(11, 1, [
    '.rr....rr.',
    'r..r..r..r',
    'r...rr...r',
    '.r..RR..r.',
    '..rrRRrr..',
  ], { r: RED, R: RED_LO });
  // as alças da medalha, em V
  for (let i = 0; i < 4; i += 1) {
    p.px(BLUE, 13 + Math.floor(i / 2), 16 + i);
    p.px(BLUE_LO, 18 - Math.floor(i / 2), 16 + i);
  }
  // a medalha: ouro com a estrela
  for (let y = 19; y <= 30; y += 1) {
    for (let x = 10; x <= 21; x += 1) {
      const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 25);
      if (d > 5.6) continue;
      if (d > 4.7) { p.px(INK, x, y); continue; }
      const light = (16 - x) + (25 - y);
      p.px(d > 3.8 ? GOLD_LO : light > 3 ? SUN : light < -3 ? GOLD_LO : GOLD, x, y);
    }
  }
  p.grid(14, 23, ['..#..', '.###.', '#####', '.###.', '.#.#.'], { '#': CREAM });
};

export const RELIC_ART: Readonly<Record<RelicKind, (p: Pen) => void>> = {
  briansMansion,
  zeroToOne,
  tinyRpgStudio,
  diploma,
  journey,
  goneHome,
  discoElysium,
  book1984,
  odyssey2001,
  bookClub,
  nomadPostcard,
};

/**
 * A TERRA REVIRADA (16×16, deitada no chão): onde a pá tirou uma relíquia, o buraco foi tapado de novo e fica o
 * remendo de terra solta, com os torrões claros por cima. Discreto como a trinca que estava ali.
 */
export const DUG_PATCH_ART = [
  '................',
  '................',
  '................',
  '.....#oo#.......',
  '...#oooooo#.....',
  '..#oo+oooo++#...',
  '..oooooo+ooooo..',
  '.#oo++ooooo+oo#.',
  '.ooooooo++ooooo.',
  '.#oo+ooooooo+o#.',
  '..ooooo++ooooo..',
  '..#oooooooo+#...',
  '....#ooooo#.....',
  '................',
  '................',
  '................',
] as const;

export const DUG_PATCH_COLORS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  '#': [69, 44, 34, 150],
  o: [94, 64, 40, 205],
  '+': [134, 96, 58, 225],
};

/**
 * NA AREIA DA PRAIA (pedido do autor, 2026-11-19: o cartão de 2024 "escondido na areia da praia"): no lugar da trinca,
 * só a PONTINHA do cartão-postal aparece — um canto de papel claro com o vermelho do selo, quase todo coberto, e a areia
 * levantada em volta dele. Quem procura acha; quem passa pensa que é uma concha.
 */
export const SAND_HINT_ART = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.......,,.......',
  '......,ppw,.....',
  '.....,pprw,.....',
  '......sss,......',
  '.......s........',
  '................',
  '................',
  '................',
  '................',
  '................',
] as const;

/** E depois de cavar: a areia revirada, um tom mais escura (úmida de baixo), sem a terra marrom do vale. */
export const SAND_DUG_ART = [
  '................',
  '................',
  '................',
  '.....,oo,.......',
  '...,oooooo,.....',
  '..,oo+oooo++,...',
  '..oooooo+ooooo..',
  '.,oo++ooooo+oo,.',
  '.ooooooo++ooooo.',
  '.,oo+ooooooo+o,.',
  '..ooooo++ooooo..',
  '..,oooooooo+,...',
  '....,ooooo,.....',
  '................',
  '................',
  '................',
] as const;

export const SAND_ART_COLORS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  // o papel do cartão (o creme da areia, mais claro) e o selo vermelho
  p: [227, 218, 209, 235],
  w: [204, 189, 153, 235],
  r: [165, 48, 48, 235],
  // a areia levantada em volta, e a sombra embaixo do canto do papel
  ',': [162, 137, 91, 150],
  s: [94, 90, 86, 170],
  // a areia revirada: o cinza quente da areia molhada de baixo, e o grão claro por cima
  o: [123, 119, 109, 200],
  '+': [162, 137, 91, 210],
};
