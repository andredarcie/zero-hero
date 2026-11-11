// A DECORAÇÃO EM PÉ (pedido do autor, 2026-11-10: "o chão verde ou de terra é o chão, e tudo além disso é 3D"). Toda
// a decoração que o autor pôs no mapa — mato, arbusto, flor, cogumelo, graveto, pedra, osso, cristal, brasa, folha
// caída: os MESMOS tiles, a MESMA arte do forest_tile_set.png, no MESMO lugar — fica de pé. Deitado, só o chão puro
// (o capim e a terra do tile de chão, e as películas que SÃO chão: estrada, trilha, poça, água). Nada novo nasce.
//
// Antes disto houve uma versão com ~6 mil tufos de arte nova, plantados por bioma POR CIMA do mato deitado. O autor
// reprovou: dois matos na tela, o novo em pé e o velho chapado, poluem. A regra que ficou: a decoração é a do mapa.
//
// COMO ELA FICA EM PÉ: o quad gira em volta da fileira mais baixa da arte. Essa fileira continua exatamente onde
// estava no chão, e o resto sobe. As fileiras vazias embaixo do desenho (frameFootPad) saem do quad, senão a peça
// flutuaria. Deitada de volta (o knob `hd3d.stand` = 0), o quad cobre o mesmo pedaço de chão que o adesivo antigo.
// Da câmera do jogo um quad de um tile mede quase o mesmo na tela em pé e deitado (~0,67 e ~0,74), então só ficar em
// pé quase não se via (o autor: "pouquíssima diferença"). O que a faz LER em pé mora no shader (decorSway.ts): a
// planta se curva fileira por fileira (o pé parado, a ponta até ~5 pixels), e tudo pega a luz de coisa em pé — o pé
// no escuro, a ponta de cada traço acesa, o lado esquerdo claro. Sem arte nova: é a luz e o movimento da mesma arte.
//
// COMO É DESENHADA (a engenharia mora nestas escolhas):
//   · NÃO grava profundidade, como a decoração deitada nunca gravou: as sombras do mundo são películas transparentes
//     desenhadas DEPOIS (o blob, a silhueta do fogo e a da lua), e assim elas continuam caindo em cima dela.
//   · Passada transparente em STANDING_DECOR_ORDER: depois das opacas (a árvore e a serra já gravaram a profundidade,
//     e o que está atrás delas some sozinho) e antes da silhueta do herói (-1) e de tudo o que o jogador lê
//     (personagem, item, estrada: 0 e 1), que fica por cima.
//   · Sem profundidade, a ordem é a do pintor: os quads vão do norte para o sul numa malha só (a câmera olha para o
//     norte e nunca gira). Um draw para o mundo inteiro.

// A GRAMA NÃO É CARTÃO (2026-11-10, ver grassBlades.ts): o capim, o mato alto, o capim antigo e o trigo saem daqui em
// FIOS — cada risco da arte em pé no ponto do chão onde o pé dele está no desenho, com a própria altura, num quad
// estreito que mostra só a coluna dele. O resto da decoração (flor, cogumelo, pedra) continua um quad por tile.

import * as THREE from 'three';
import { STAND_SWING_TEXELS } from './decorSway';
import { bladeSwing, grownHeight } from './grassBlades';
import { WIND_STIR_FRAMES } from './terrainGeometry';
import { tilesetFrameUv } from './textures3d';

/**
 * O que é PLANTA na decoração (balança, se abre e farfalha): a mesma lista que o vento da decoração sempre usou —
 * mato, folhagem, arbusto florido, as flores e o capim dos biomas. Cogumelo, graveto, seixo, pedregulho, osso,
 * cristal, brasa e folha caída ficam em pé E parados.
 */
export const isFlexibleDecor = (frame: number): boolean => WIND_STIR_FRAMES.has(frame);

/** Depois do carvalho grande (-2, que grava a profundidade) e antes da silhueta do herói (-1). Ver o topo. */
export const STANDING_DECOR_ORDER = -1.5;

/** A margem de cada lado do quad em pé, em tiles: por onde a ponta balança (parada, é transparente). */
export const SWING_MARGIN = STAND_SWING_TEXELS / 16;

/** Um tile de decoração em pé. */
export interface StandingPiece {
  /** O centro do quad em x (com o espalhamento da decoração, decorScatter.ts). */
  x: number;
  /** A linha do pé: onde a fileira mais baixa da arte estava no chão. */
  footZ: number;
  /** A altura do chão sob ela (o planalto sobe junto). */
  y: number;
  /** O centro do tile: é dele que a brisa e o abrir são medidos. */
  rootX: number;
  rootZ: number;
  frame: number;
  /** A fração vazia embaixo do desenho (frameFootPad): ela sai do quad. */
  pad: number;
  r: number;
  g: number;
  b: number;
}

/**
 * Um pedaço de FIO de grama em pé (grassBlades.ts): uma corrida de pixels de uma coluna da arte, no plano do fio.
 * Os pedaços de um mesmo fio dividem o pé, a altura e a fase; cada um fica na altura em que está no desenho.
 */
export interface BladePiece {
  blade: true;
  /** O centro da coluna, em x de mundo. */
  x: number;
  /** O x do PÉ do fio: é dele que a brisa, o tremular e o abrir são medidos (os pedaços de um fio curvam juntos). */
  rootX: number;
  /** A linha do pé do fio: a borda de baixo do pixel de pé, onde ele estava no chão. */
  footZ: number;
  /** A altura do chão sob ele. */
  y: number;
  frame: number;
  /** A coluna e as fileiras desta corrida no quadro (fileira 0 = o topo do quadro). */
  col: number;
  top: number;
  bottom: number;
  /** Quantos pixels do fio ficam abaixo desta corrida (0 = ela é o pé), e a altura do fio inteiro, em pixels. */
  base: number;
  height: number;
  /** Quantos pixels escuros formam o pé (eles não crescem), e quantas vezes cada pixel da haste se repete em pé. */
  footRows: number;
  grow: number;
  /** A fase do tremular deste fio, em radianos: cada fio tremula no seu tempo. */
  phase: number;
  r: number;
  g: number;
  b: number;
}

/** A sombra de contato de um fio (grassBlades.contactShadows): um pixel DEITADO no chão, na frente do pé. */
export interface ShadowDot {
  dot: true;
  /** O centro da coluna, em x de mundo, e a borda norte da fileira do pixel, em z. */
  x: number;
  z: number;
  y: number;
  frame: number;
  col: number;
  row: number;
  /** A ordem do pintor: a borda sul do pixel. */
  footZ: number;
  r: number;
  g: number;
  b: number;
}

type AnyPiece = StandingPiece | BladePiece | ShadowDot;
const isBlade = (p: AnyPiece): p is BladePiece => (p as BladePiece).blade === true;
const isDot = (p: AnyPiece): p is ShadowDot => (p as ShadowDot).dot === true;

/** A altura do quad em pé, em tiles: o desenho inteiro, sem as fileiras vazias de baixo (16 px por tile). */
export const pieceHeight = (pad: number): number => 1 - pad;

/** Um quad em pé, já resolvido: onde fica, o que lê do atlas, e o que o shader precisa saber dele. */
interface QuadSpec {
  x0: number; x1: number; y0: number; y1: number; z: number;
  u0: number; u1: number; v0: number; v1: number;
  bounds: readonly [number, number, number, number];
  /** aStand: o ponto de onde a brisa e o abrir são medidos, as alturas do pé e do topo do quad, e a fase. */
  sx: number; sz: number; h0: number; h1: number; phase: number;
  flex: number;
  /** aBlade: (pixels do fio abaixo deste quad + 1, ou 0 se não é fio; pixels do pé; altura do fio; crescimento). */
  blade: readonly [number, number, number, number];
  /** Deitado no chão (a sombra de contato): os cantos vão de z1 (sul) a z (norte), na altura y0. */
  flat?: { z1: number };
  r: number; g: number; b: number;
}

/** O tile inteiro em pé, mais a margem de balanço dos dois lados (a arte fica no meio, no lugar dela). */
const pieceQuad = (p: StandingPiece): QuadSpec => {
  const f = tilesetFrameUv(p.frame);
  const h = pieceHeight(p.pad);
  // a margem em u: a mesma fração do quadro (16 pixels de arte por tile)
  const mu = (f.u1 - f.u0) * SWING_MARGIN;
  return {
    x0: p.x - 0.5 - SWING_MARGIN, x1: p.x + 0.5 + SWING_MARGIN, y0: p.y, y1: p.y + h, z: p.footZ,
    // o v da fileira mais baixa do desenho (o v0 é o pé do quadro no atlas)
    u0: f.u0 - mu, u1: f.u1 + mu, v0: f.v0 + p.pad * (f.v1 - f.v0), v1: f.v1,
    bounds: [f.cu0, f.cv0, f.cu1, f.cv1],
    sx: p.rootX, sz: p.rootZ, h0: 0, h1: h, phase: 0,
    flex: isFlexibleDecor(p.frame) ? 1 : 0, blade: [0, 0, 0, 0], r: p.r, g: p.g, b: p.b,
  };
};

/** A sombra de contato: o pixel dela deitado no chão, olhando para cima, parado (não é planta, não tem altura). */
const dotQuad = (p: ShadowDot): QuadSpec => {
  const f = tilesetFrameUv(p.frame);
  const tu = (f.u1 - f.u0) / 16;
  const tv = (f.v1 - f.v0) / 16;
  const u0 = f.u0 + p.col * tu;
  const vTop = f.v1 - p.row * tv;
  const vBottom = vTop - tv;
  const px = 1 / 16;
  return {
    x0: p.x - px / 2, x1: p.x + px / 2, y0: p.y, y1: p.y, z: p.z,
    u0, u1: u0 + tu, v0: vBottom, v1: vTop,
    bounds: [u0 + tu / 2, vBottom + tv / 2, u0 + tu / 2, vBottom + tv / 2],
    sx: p.x, sz: p.z, h0: 0, h1: 0, phase: 0,
    flex: 0, blade: [0, 0, 0, 0], flat: { z1: p.z + px }, r: p.r, g: p.g, b: p.b,
  };
};

/**
 * Um pedaço de fio: um pixel de largura mais a margem por onde a ponta balança, da altura da corrida, no plano do pé
 * do fio. A janela da arte (`bounds`) é a coluna dele e só ela — o que a curva trouxer de fora some (decorSway.ts) —,
 * então o fio vizinho do desenho nunca aparece neste quad.
 */
const bladeQuad = (p: BladePiece): QuadSpec => {
  const f = tilesetFrameUv(p.frame);
  const tu = (f.u1 - f.u0) / 16;
  const tv = (f.v1 - f.v0) / 16;
  const m = bladeSwing(grownHeight(p, p.grow));
  const px = 1 / 16;
  const h0 = p.base * px;
  const h1 = (p.base + p.bottom - p.top + 1) * px;
  // fileira r do quadro (0 = topo) vai de v1 - (r + 1)·tv a v1 - r·tv
  const vBottom = f.v1 - (p.bottom + 1) * tv;
  const vTop = f.v1 - p.top * tv;
  const cu = f.u0 + (p.col + 0.5) * tu;
  return {
    x0: p.x - (0.5 + m) * px, x1: p.x + (0.5 + m) * px, y0: p.y + h0, y1: p.y + h1, z: p.footZ,
    u0: f.u0 + (p.col - m) * tu, u1: f.u0 + (p.col + 1 + m) * tu, v0: vBottom, v1: vTop,
    bounds: [cu, vBottom + tv / 2, cu, vTop - tv / 2],
    sx: p.rootX, sz: p.footZ, h0, h1, phase: p.phase,
    flex: 1, blade: [p.base + 1, p.footRows, p.height, p.grow], r: p.r, g: p.g, b: p.b,
  };
};

/**
 * Os quads em pé, NA ORDEM dada (o chamador ordena do norte para o sul: ver o topo), de frente para a câmera.
 * Cantos: pé esquerdo, pé direito, topo direito, topo esquerdo. A peça de tile é o tile mais a margem de balanço dos
 * dois lados, e a arte fica no meio, no lugar dela (a margem lê fora do quadro: transparente até a ponta chegar lá);
 * o pedaço de fio é a coluna dele mais a margem.
 * `aStand` = (x, z de onde a brisa e o abrir são medidos — o centro do tile, ou o pé do fio —, a altura do vértice
 * acima do pé — 0 no pé, na escala da ARTE: quem cresce o fio é o shader —, a fase do tremular); `aFlex` = 1 na
 * planta, 0 no que é rígido; `aBlade` = (pixels do fio abaixo do quad + 1 — 0 se não é fio —, pixels do pé, altura
 * do fio, crescimento da haste). A sombra de contato é um quad deitado, olhando para cima.
 */
export const buildStandingDecorGeometry = (pieces: ReadonlyArray<AnyPiece>): THREE.BufferGeometry => {
  const n = pieces.length;
  const pos = new Float32Array(n * 12);
  const uv = new Float32Array(n * 8);
  const bounds = new Float32Array(n * 16);
  const nrm = new Float32Array(n * 12);
  const col = new Float32Array(n * 12);
  const stand = new Float32Array(n * 16);
  const flex = new Float32Array(n * 4);
  const blade = new Float32Array(n * 16);
  const idx = new Uint32Array(n * 6);
  pieces.forEach((p, i) => {
    const q = isBlade(p) ? bladeQuad(p) : isDot(p) ? dotQuad(p) : pieceQuad(p);
    // em pé: pé esquerdo, pé direito, topo direito, topo esquerdo; deitado: sul esquerdo, sul direito, norte direito,
    // norte esquerdo (a mesma volta, então ele olha para cima)
    if (q.flat) pos.set([q.x0, q.y0, q.flat.z1, q.x1, q.y0, q.flat.z1, q.x1, q.y0, q.z, q.x0, q.y0, q.z], i * 12);
    else pos.set([q.x0, q.y0, q.z, q.x1, q.y0, q.z, q.x1, q.y1, q.z, q.x0, q.y1, q.z], i * 12);
    uv.set([q.u0, q.v0, q.u1, q.v0, q.u1, q.v1, q.u0, q.v1], i * 8);
    for (let k = 0; k < 4; k++) {
      bounds.set(q.bounds, i * 16 + k * 4);
      // a luz do chão em que pisa: a peça em pé tem a cor de quando estava deitada
      nrm.set([0, 1, 0], i * 12 + k * 3);
      col.set([q.r, q.g, q.b], i * 12 + k * 3);
      stand.set([q.sx, q.sz, k >= 2 ? q.h1 : q.h0, q.phase], i * 16 + k * 4);
      flex[i * 4 + k] = q.flex;
      blade.set(q.blade, i * 16 + k * 4);
    }
    const v = i * 4;
    idx.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aUvBounds', new THREE.BufferAttribute(bounds, 4));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aStand', new THREE.BufferAttribute(stand, 4));
  geo.setAttribute('aFlex', new THREE.BufferAttribute(flex, 1));
  geo.setAttribute('aBlade', new THREE.BufferAttribute(blade, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
};

/**
 * Apaga um quad sem realocar nada (a cova cavada): os quatro cantos dobram no pé e perdem a altura (senão a brisa, que
 * só mexe no que tem altura, abriria o quad dobrado numa farpa). O mesmo truque de collapseQuad.
 */
export const collapsePiece = (geo: THREE.BufferGeometry, quad: number): void => {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const stand = geo.attributes.aStand as THREE.BufferAttribute;
  const v = quad * 4;
  const x = pos.getX(v);
  const y = pos.getY(v);
  const z = pos.getZ(v);
  for (let k = 0; k < 4; k++) {
    pos.setXYZ(v + k, x, y, z);
    stand.setZ(v + k, 0);
  }
  pos.needsUpdate = true;
  stand.needsUpdate = true;
};
