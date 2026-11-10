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

import * as THREE from 'three';
import { STAND_SWING_TEXELS } from './decorSway';
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

/** A altura do quad em pé, em tiles: o desenho inteiro, sem as fileiras vazias de baixo (16 px por tile). */
export const pieceHeight = (pad: number): number => 1 - pad;

/**
 * Os quads em pé, NA ORDEM dada (o chamador ordena do norte para o sul: ver o topo), de frente para a câmera.
 * Cantos: pé esquerdo, pé direito, topo direito, topo esquerdo. Cada quad é o tile mais a margem de balanço dos dois
 * lados, e a arte fica no meio, no lugar dela (a margem lê fora do quadro: transparente até a ponta chegar lá).
 * `aStand` = (centro do tile x, z, a altura do vértice acima do pé — 0 no pé —, o pisão em pixels de arte);
 * `aFlex` = 1 na planta, 0 no que é rígido.
 */
export const buildStandingDecorGeometry = (pieces: readonly StandingPiece[]): THREE.BufferGeometry => {
  const n = pieces.length;
  const pos = new Float32Array(n * 12);
  const uv = new Float32Array(n * 8);
  const bounds = new Float32Array(n * 16);
  const nrm = new Float32Array(n * 12);
  const col = new Float32Array(n * 12);
  const stand = new Float32Array(n * 16);
  const flex = new Float32Array(n * 4);
  const idx = new Uint32Array(n * 6);
  pieces.forEach((p, i) => {
    const f = tilesetFrameUv(p.frame);
    const h = pieceHeight(p.pad);
    // o v da fileira mais baixa do desenho (o v0 é o pé do quadro no atlas)
    const vFoot = f.v0 + p.pad * (f.v1 - f.v0);
    const top = p.y + h;
    const x0 = p.x - 0.5 - SWING_MARGIN;
    const x1 = p.x + 0.5 + SWING_MARGIN;
    // a margem em u: a mesma fração do quadro (16 pixels de arte por tile)
    const mu = (f.u1 - f.u0) * SWING_MARGIN;
    pos.set([x0, p.y, p.footZ, x1, p.y, p.footZ, x1, top, p.footZ, x0, top, p.footZ], i * 12);
    uv.set([f.u0 - mu, vFoot, f.u1 + mu, vFoot, f.u1 + mu, f.v1, f.u0 - mu, f.v1], i * 8);
    const bends = isFlexibleDecor(p.frame) ? 1 : 0;
    for (let k = 0; k < 4; k++) {
      bounds.set([f.cu0, f.cv0, f.cu1, f.cv1], i * 16 + k * 4);
      // a luz do chão em que pisa: a peça em pé tem a cor de quando estava deitada
      nrm.set([0, 1, 0], i * 12 + k * 3);
      col.set([p.r, p.g, p.b], i * 12 + k * 3);
      stand.set([p.rootX, p.rootZ, k >= 2 ? h : 0, 0], i * 16 + k * 4);
      flex[i * 4 + k] = bends;
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
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
};

/**
 * Apaga um quad sem realocar nada (a cova cavada): os quatro cantos dobram no pé e perdem a altura e o pisão (senão a
 * brisa, que só mexe no que tem altura, abriria o quad dobrado numa farpa). O mesmo truque de collapseQuad.
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
    stand.setW(v + k, 0);
  }
  pos.needsUpdate = true;
  stand.needsUpdate = true;
};

/** O pisão: a ponta da planta anda `texels` pixels de arte para o lado e a curva leva o resto (o pé fica). 0, o prumo. */
export const setPieceRustle = (geo: THREE.BufferGeometry, quad: number, texels: number): void => {
  const stand = geo.attributes.aStand as THREE.BufferAttribute;
  const v = quad * 4;
  for (let k = 0; k < 4; k++) stand.setW(v + k, texels);
  stand.needsUpdate = true;
};
