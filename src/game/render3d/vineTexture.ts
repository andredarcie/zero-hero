import * as THREE from 'three';

// AS TREPADEIRAS: o mato que desce da beira da serra pela pedra. Pixel desenhado aqui, por semente: uma
// franja de capim na crista e, dela, ramos que descem com folhas. Quatro variações em fila, todas com o
// topo cheio, para a beira do planalto nunca terminar numa régua.

export const VINE_VARIANTS = 4;
const CELL_W = 16;
const CELL_H = 32;

const LEAF_DARK = '#27482a';
const LEAF_MID = '#3c6b35';
const LEAF_LIGHT = '#5d9440';
const STEM = '#2f4a22';

let texture: THREE.CanvasTexture | undefined;

export const vineTexture = (): THREE.Texture => {
  if (texture) return texture;
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W * VINE_VARIANTS;
  canvas.height = CELL_H;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    let seed = 2026;
    const rand = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const dot = (color: string, x: number, y: number): void => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    };
    for (let v = 0; v < VINE_VARIANTS; v += 1) {
      const ox = v * CELL_W;
      // A franja: capim dobrando por cima da beira, de altura irregular.
      for (let x = 0; x < CELL_W; x += 1) {
        const depth = 2 + Math.floor(rand() * 4);
        for (let y = 0; y < depth; y += 1) dot(y === depth - 1 ? LEAF_DARK : y === 0 ? LEAF_LIGHT : LEAF_MID, ox + x, y);
      }
      // Os ramos: cada um desce serpenteando, com folhas dos dois lados e um fim diferente.
      const strands = 2 + v % 3;
      for (let s = 0; s < strands; s += 1) {
        let x = 1 + Math.floor(rand() * (CELL_W - 2));
        const length = 10 + Math.floor(rand() * (CELL_H - 11));
        for (let y = 3; y < length; y += 1) {
          if (rand() < 0.22) x = Math.max(1, Math.min(CELL_W - 2, x + (rand() < 0.5 ? -1 : 1)));
          dot(STEM, ox + x, y);
          if (rand() < 0.55) {
            const side = rand() < 0.5 ? -1 : 1;
            const leaf = rand() < 0.35 ? LEAF_LIGHT : LEAF_MID;
            dot(leaf, ox + Math.max(0, Math.min(CELL_W - 1, x + side)), y);
            if (rand() < 0.4) dot(LEAF_DARK, ox + Math.max(0, Math.min(CELL_W - 1, x + side)), Math.min(CELL_H - 1, y + 1));
          }
        }
        dot(LEAF_LIGHT, ox + x, length);
      }
    }
  }
  texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

/** Um quad de trepadeira numa face: `top` é a altura da beira, e `drop` quanto ela desce. */
export type VineQuad = {
  x0: number; z0: number; x1: number; z1: number;
  top: number; drop: number; variant: number; nx: number; nz: number;
  /** A janela dentro do desenho (0..1): a serra é um contorno em degraus, e cada degrau mostra um pedaço. */
  u0?: number; u1?: number;
};

/** Até onde o desenho alcança, em tiles: a textura tem dois tiles de altura. */
export const VINE_MAX_DROP = 2;

export const buildVineGeometry = (quads: readonly VineQuad[]): THREE.BufferGeometry => {
  const pos: number[] = [];
  const uv: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  quads.forEach((q, i) => {
    const drop = Math.min(q.drop, VINE_MAX_DROP);
    const u0 = (q.variant + (q.u0 ?? 0)) / VINE_VARIANTS;
    const u1 = (q.variant + (q.u1 ?? 1)) / VINE_VARIANTS;
    // A textura cresce para baixo: um trecho menor da face mostra só o começo dos ramos.
    const v1 = 1;
    const v0 = 1 - drop / VINE_MAX_DROP;
    pos.push(q.x0, q.top, q.z0, q.x1, q.top, q.z1, q.x1, q.top - drop, q.z1, q.x0, q.top - drop, q.z0);
    uv.push(u0, v1, u1, v1, u1, v0, u0, v0);
    for (let k = 0; k < 4; k += 1) nrm.push(q.nx, 0, q.nz);
    const b = i * 4;
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
};
