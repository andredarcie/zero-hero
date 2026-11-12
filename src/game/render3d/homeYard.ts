import type { Paint } from '@/game/render3d/pixelForms';

// O TERREIRO DAS CASAS: a terra batida debaixo e em frente de cada casa, pintada pixel a pixel num decalque deitado
// (objects/NpcHomes) de 5 × 3,5 tiles, na densidade de pixel do resto do mundo (16 por tile).
//
// A PIXEL ART DE ANTES (pedido do autor, 2026-11-11: "melhore a qualidade do pixel art da terra de chão abaixo das
// casas"). Ampliado, o terreiro era lama: cinco marrons em manchas grandes e de contorno mole, um grão em blocos de
// 2×2 (mais grosso que o capim em volta, lia como imagem de baixa resolução), pixels soltos espalhados pelo capim,
// rachaduras sorteadas como rabiscos, folhas laranja de um pixel, tufos de capim num verde fixo que não era o do
// bioma — e GRAVETOS desenhados, que este jogo proíbe no chão (graveto é item: o desenhado que não se pega ensina o
// jogador a parar de olhar para o chão; ver world/biomes).
//
// A SEGUNDA PASSADA (pedido do autor, 2026-11-11: "o pixel art do chão de terra nem combina com o resto do jogo, tá
// meio borrão, meio chapadão, simples demais"). A primeira repintura fez o terreiro como a terra nua do mapa: torrões
// de 4 px cortados por quantil em três faixas largas. Na terra clara das estradas isso virou LAMA: manchas de 6 a 10
// pixels de um tom só, separadas por riscos escuros, com quase nenhum pixel trocando de tom do vizinho — o borrão.
// E o caminho, achatado a 40% do relevo, saía uma faixa lisa de um bege só — o chapadão. Em volta, o capim do jogo é
// grão de UM pixel, e a terra parecia uma foto de baixa resolução colada nele.
//
// Agora ela é TERRA BATIDA de grão fino, como o capim é capim, numa base CALMA (grão em todo pixel virou cascalho, um
// chiado sem forma — foi a primeira tentativa desta passada):
//
//   · quase toda a terra é a BASE, de um tom só, e o desenho são os TORRÕES claros e as COVINHAS escuras, pequenos (um
//     ruído de 3 px com um pouco de grão de 1 px, cortado por quantil): o torrão tem a quina de cima-à-esquerda acesa e
//     joga a sombra no chão em baixo-à-direita; a covinha tem a borda de baixo-à-direita acesa. A luz vem sempre do
//     mesmo lado, que é o que faz o olho ler chão de terra, e não ruído;
//   · os FURINHOS: um pixel do fundo com a borda de baixo-à-direita acesa (a parede do furo que olha para a luz);
//   · as PEDRINHAS cinza, de um a quatro pixels, com o topo aceso e a sombra colada embaixo: o detalhe nítido que o
//     olho pega de longe;
//   · o CAMINHO que desce da porta é a mesma terra PISADA: um tom mais clara, menos furo e menos grão, mas com grão
//     (liso, ele virava a faixa chapada);
//   · a BEIRA é a de um rebaixo: onde o capim fica em cima ou à esquerda, ele faz sombra na terra (um pixel escuro);
//     embaixo e à direita a terra sobe ao encontro dele e pega a luz;
//   · o CAPIM VOLTA por buracos na terra perto da beira — buracos de verdade (transparentes), então o que aparece é o
//     capim do chão, na cor do bioma. Nenhum verde pintado aqui;
//   · a beira passa por uma suavização de maioria nos OITO vizinhos (arredonda, sem dente de serrote), e os
//     TORRÕEZINHOS SOLTOS ficam fora dela, sem encostar, de 2 × 1 ou 2 × 2, com o topo claro e a sombra embaixo;
//   · umas folhas secas na beira, em tom apagado.
//
// A paleta é a das estradas (objects/roadPaint) com os degraus em volta mais afastados: o caminho que chega no
// terreiro é a mesma terra. No mundo, o decalque leva o BRILHO do chão do bioma (objects/NpcHomes).

/** O terreiro, em tiles. */
export const YARD_WIDTH = 5;
export const YARD_DEPTH = 3.5;
export const YARD_TEXELS = 16;

/**
 * Do fundo do furo ao grão aceso: a terra das estradas (roadPaint.ROAD_DIRT, a base e o caminho), com os degraus em
 * volta mais AFASTADOS. Os da estrada andam de 15 em 15 de luma, e debaixo do sol quente do jogo o terreiro inteiro
 * virava um bege só: o torrão não se via.
 */
export const YARD_RAMP = ['#362e24', '#4a4133', '#615644', '#776a53', '#8c7d62', '#9e8e70'] as const;
const DEEP = 0;
const DARK = 1;
const MID = 2;
const LIGHT = 3;
const BRIGHT = 4;
const HIGH = 5;
/** A pedrinha: o topo aceso, o corpo, e a sombra colada embaixo é o fundo da terra. */
export const YARD_PEBBLE = ['#a49b86', '#7d7464', '#5d564b'] as const;
/** A folha seca, apagada: a laranja de antes era a coisa mais saturada do terreiro, e de um pixel só lia como sujeira. */
export const YARD_LEAF = ['#7a5d36', '#5f4a2c'] as const;
/** Até onde vai a terra inteira (na conta da distância ao centro, com a beira ondulada). */
const SOLID_REACH = 0.86;
/** Onde o capim começa a voltar, para dentro da beira. */
const HOLE_BAND = 0.2;
/**
 * A terra é quase toda de um tom só (a base), e o desenho são os TORRÕES claros e as COVINHAS escuras, pequenos e
 * separados: a fração da terra que cada um ocupa, por quantil. Com grão em todo pixel (a primeira tentativa desta
 * passada) ela virava cascalho, um chiado sem forma; é a base calma que deixa o torrão ser lido.
 */
const CLOD_SHARE = 0.24;
const DIP_SHARE = 0.11;
/** Os furinhos: a fração da terra de fora do caminho que é furo (no caminho, um terço disso). */
const PIT_SHARE = 0.022;
/** As pedrinhas: quantas por terreiro. */
const PEBBLES = 16;
/** Os torrõezinhos soltos logo fora da beira: quantos por terreiro. */
const CRUMBS = 7;

const noise = (x: number, y: number, seed: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Ruído liso de `cell` pixels: o contorno orgânico das manchas. */
const blotch = (x: number, y: number, seed: number, cell: number): number => {
  const fx = x / cell;
  const fy = y / cell;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const sx = (fx - ix) * (fx - ix) * (3 - 2 * (fx - ix));
  const sy = (fy - iy) * (fy - iy) * (3 - 2 * (fy - iy));
  const top = noise(ix, iy, seed) * (1 - sx) + noise(ix + 1, iy, seed) * sx;
  const bottom = noise(ix, iy + 1, seed) * (1 - sx) + noise(ix + 1, iy + 1, seed) * sx;
  return top * (1 - sy) + bottom * sy;
};

const quantile = (values: number[], q: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * sorted.length)))];
};

export const paintYard = (rect: Paint, seed: number): void => {
  const w = YARD_WIDTH * YARD_TEXELS;
  const h = YARD_DEPTH * YARD_TEXELS;
  const at = (x: number, y: number): number => y * w + x;
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h;

  // A FORMA: uma mancha oval de beira ondulada, mais chão diante da porta (o decalque já fica à frente da casa).
  const reachAt = (x: number, y: number): number => {
    const nx = (x + 0.5 - w / 2) / (w / 2);
    const ny = (y + 0.5 - h / 2) / (h / 2);
    // a beira ondula em curva larga e treme pouco: com o tremor de 4 px mais forte ela saía dentada, de serrote
    return Math.hypot(nx, ny) + (blotch(x, y, seed + 4, 13) - 0.5) * 0.5 + (blotch(x, y, seed + 5, 5) - 0.5) * 0.08;
  };
  // O caminho desce da porta com uma curva só dele, e abre um pouco antes de chegar no capim.
  const doorY = Math.round(h * 0.3);
  const pathX = (y: number): number => w / 2 + Math.sin(y * 0.09 + seed * 1.7) * 5;
  const onPath = (x: number, y: number): number => {
    if (y < doorY) return 2;
    const half = 6 + (y - doorY) * 0.09 + (blotch(x, y, seed + 6, 3) - 0.5) * 3;
    return Math.abs(x - pathX(y)) / half;
  };

  // A MÁSCARA: a terra inteira e os buracos por onde o capim volta perto da beira (nunca no caminho).
  let earth = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const r = reachAt(x, y);
      let on = r < SOLID_REACH;
      const rim = r - (SOLID_REACH - HOLE_BAND);
      if (on && rim > 0 && onPath(x, y) > 1.1 && blotch(x, y, seed + 12, 3) > 0.84 - rim * 1.3) on = false;
      earth[at(x, y)] = on ? 1 : 0;
    }
  }
  // A BEIRA LIMPA: três passadas de maioria nos OITO vizinhos. Arredonda a quina, tira o dente de um e de dois pixels e
  // fecha o furo pequeno: a beira ondula, mas não serra.
  const isEarth = (m: Uint8Array, x: number, y: number): boolean => inside(x, y) && m[at(x, y)] === 1;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = earth.slice();
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if ((dx || dy) && isEarth(earth, x + dx, y + dy)) n += 1;
        if (earth[at(x, y)] && n <= 3) next[at(x, y)] = 0;
        else if (!earth[at(x, y)] && n >= 5) next[at(x, y)] = 1;
      }
    }
    earth = next;
  }
  // Na mesma passada um pixel pode ficar enquanto os vizinhos todos saem: o que sobrou sem vizinho de lado sai também.
  for (let changed = true; changed;) {
    changed = false;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (!earth[at(x, y)] || isEarth(earth, x - 1, y) || isEarth(earth, x + 1, y) || isEarth(earth, x, y - 1) || isEarth(earth, x, y + 1)) continue;
        earth[at(x, y)] = 0;
        changed = true;
      }
    }
  }
  // OS TORRÕEZINHOS SOLTOS logo fora da beira: blocos de 2 × 1 ou 2 × 2, nunca encostados nela (encostados, eram os
  // dentes).
  const solid = earth.slice();
  const nearSolid = (x: number, y: number, pad: number): boolean => {
    for (let dy = -pad; dy <= pad; dy += 1) for (let dx = -pad; dx <= pad; dx += 1) if (isEarth(solid, x + dx, y + dy)) return true;
    return false;
  };
  for (let i = 0, placed = 0; i < 400 && placed < CRUMBS; i += 1) {
    const x = Math.floor(noise(i, 7, seed + 13) * (w - 2));
    const y = Math.floor(noise(7, i, seed + 14) * (h - 2));
    const r = reachAt(x, y);
    if (r < SOLID_REACH + 0.03 || r > SOLID_REACH + 0.14) continue;
    const tall = i % 2 === 0;
    if (nearSolid(x, y, 1) || nearSolid(x + 1, y, 1) || (tall && nearSolid(x, y + 1, 1)) || !nearSolid(x, y, 3)) continue;
    if (x < 1 || y < 1 || x + 2 >= w || y + 2 >= h) continue;
    for (let dy = 0; dy <= (tall ? 1 : 0); dy += 1) for (let dx = 0; dx <= 1; dx += 1) earth[at(x + dx, y + dy)] = 1;
    placed += 1;
  }
  const ground = (x: number, y: number): boolean => isEarth(earth, x, y);

  // OS TORRÕES E AS COVINHAS: dois ruídos de 3 px com um pouco de grão de 1 px por cima (a beira deles não fica lisa),
  // cada um cortado por quantil. O torrão é claro, com a quina de cima-à-esquerda acesa e a sombra caindo no chão em
  // baixo-à-direita; a covinha é escura, com a borda de baixo-à-direita acesa (a parede que olha para a luz).
  const field = (salt: number): Float64Array => {
    const f = new Float64Array(w * h);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) f[at(x, y)] = 0.78 * blotch(x, y, seed + salt, 3) + 0.22 * noise(x, y, seed + salt + 1);
    return f;
  };
  const bump = field(20);
  const dip = field(22);
  const values = (f: Float64Array): number[] => {
    const out: number[] = [];
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (ground(x, y)) out.push(f[at(x, y)]);
    return out;
  };
  const clodCut = quantile(values(bump), 1 - CLOD_SHARE);
  const dipCut = quantile(values(dip), DIP_SHARE);
  const clod = (x: number, y: number): boolean => ground(x, y) && bump[at(x, y)] >= clodCut;
  // o caminho foi pisado: covinha ali é rara
  const sunk = (x: number, y: number): boolean => ground(x, y) && !clod(x, y) && dip[at(x, y)] <= dipCut * (onPath(x, y) < 1 ? 0.92 : 1);
  const tones = new Int8Array(w * h).fill(-1);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!ground(x, y)) continue;
      // FORA DO CAMINHO a terra é a solta, na base do meio; NO CAMINHO ela é a batida, um tom mais clara.
      const path = onPath(x, y);
      const base = path < 0.85 ? LIGHT : MID;
      let tone = base;
      if (clod(x, y)) tone = !clod(x - 1, y) && !clod(x, y - 1) ? base + 2 : base + 1;
      else if (sunk(x, y)) tone = base - 1;
      else if (sunk(x - 1, y - 1) || (sunk(x - 1, y) && sunk(x, y - 1))) tone = base + 1;
      else if (clod(x - 1, y - 1) || (clod(x - 1, y) && clod(x, y - 1))) tone = base - 1;
      // A BEIRA DO REBAIXO: o capim em cima ou à esquerda faz sombra; embaixo e à direita a terra sobe e pega luz. O
      // torrãozinho solto no capim é o contrário, um torrão: o topo claro e a sombra embaixo.
      if (!isEarth(solid, x, y)) tone = ground(x, y - 1) ? DARK : ground(x - 1, y) ? MID : LIGHT;
      else if (!ground(x, y - 1) || !ground(x - 1, y) || !ground(x - 1, y - 1)) tone = !ground(x, y - 1) ? DEEP : Math.min(tone, DARK);
      else if (!ground(x, y + 1) || !ground(x + 1, y) || !ground(x + 1, y + 1)) tone = Math.max(tone, LIGHT) + 1;
      tones[at(x, y)] = Math.max(DEEP, Math.min(HIGH, tone));
    }
  }
  // OS FURINHOS: um pixel do fundo, e a borda de baixo-à-direita acesa (a parede do furo que olha para a luz). Nunca
  // dois encostados, nunca na beira (lá a sombra já é do capim).
  const interior = (x: number, y: number): boolean => {
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (!ground(x + dx, y + dy)) return false;
    return true;
  };
  const pitAt = (x: number, y: number): boolean => interior(x, y)
    && noise(x, y, seed + 40) < PIT_SHARE * (onPath(x, y) < 1 ? 0.35 : 1)
    && tones[at(x, y)] >= MID;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      if (!pitAt(x, y) || pitAt(x - 1, y) || pitAt(x, y - 1) || pitAt(x - 1, y - 1) || pitAt(x + 1, y - 1)) continue;
      tones[at(x, y)] = DEEP;
      tones[at(x + 1, y + 1)] = Math.max(tones[at(x + 1, y + 1)], BRIGHT);
    }
  }
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) if (tones[at(x, y)] >= 0) rect(YARD_RAMP[tones[at(x, y)]], x, y, 1, 1);
  }

  // OS DETALHES, poucos e com folga entre eles: nada encostado em nada.
  const taken = new Uint8Array(w * h);
  const free = (x: number, y: number, rx: number, ry: number): boolean => {
    for (let dy = -ry; dy <= ry; dy += 1) {
      for (let dx = -rx; dx <= rx; dx += 1) if (!ground(x + dx, y + dy) || taken[at(x + dx, y + dy)]) return false;
    }
    return true;
  };
  const scatter = (count: number, salt: number, want: (x: number, y: number) => boolean, draw: (x: number, y: number, i: number) => void): void => {
    let placed = 0;
    for (let i = 0; i < count * 20 && placed < count; i += 1) {
      const x = Math.floor(noise(i, salt, seed + 9) * w);
      const y = Math.floor(noise(salt, i, seed + 10) * h);
      if (!want(x, y) || !free(x, y, 2, 2)) continue;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 2; dx += 1) if (inside(x + dx, y + dy)) taken[at(x + dx, y + dy)] = 1;
      draw(x, y, i);
      placed += 1;
    }
  };
  const firm = (x: number, y: number): boolean => reachAt(x, y) < SOLID_REACH - 0.1 && y > doorY - 4;
  // AS PEDRINHAS, de um a quatro pixels, quase todas fora do caminho: o topo aceso, o corpo, a borda de baixo um tom
  // abaixo, e a sombra colada embaixo e à direita (para não boiarem). São o detalhe nítido que o olho pega de longe.
  scatter(PEBBLES, 2, (x, y) => firm(x, y) && (onPath(x, y) > 1.25 || noise(x, y, seed + 50) < 0.15), (x, y, i) => {
    const size = i % 4;
    if (size === 0) {
      // a menor: um grão de pedra aceso, com a sombra na diagonal
      rect(YARD_PEBBLE[0], x, y, 1, 1);
      rect(YARD_RAMP[DEEP], x + 1, y + 1, 1, 1);
    } else if (size === 3) {
      // a maior: 3 × 2 com o canto de baixo cortado
      rect(YARD_PEBBLE[1], x, y, 3, 1);
      rect(YARD_PEBBLE[2], x, y + 1, 2, 1);
      rect(YARD_PEBBLE[0], x, y, 2, 1);
      rect(YARD_RAMP[DEEP], x + 1, y + 2, 2, 1);
      rect(YARD_RAMP[DEEP], x + 2, y + 1, 1, 1);
    } else {
      // as médias: 2 × 1 ou 2 × 2
      const tall = size === 2;
      rect(YARD_PEBBLE[1], x, y, 2, tall ? 2 : 1);
      rect(YARD_PEBBLE[0], x, y, 1, 1);
      if (tall) rect(YARD_PEBBLE[2], x + 1, y + 1, 1, 1);
      rect(YARD_RAMP[DEEP], x + 1, y + (tall ? 2 : 1), 2, 1);
    }
  });
  // As folhas secas que o vento junta na beira: um risco de dois pixels na diagonal.
  scatter(4, 4, (x, y) => {
    const r = reachAt(x, y);
    return r > SOLID_REACH - 0.24 && r < SOLID_REACH - 0.06 && onPath(x, y) > 1.2;
  }, (x, y) => {
    rect(YARD_LEAF[0], x, y, 1, 1);
    rect(YARD_LEAF[1], x + 1, y + 1, 1, 1);
  });
};
