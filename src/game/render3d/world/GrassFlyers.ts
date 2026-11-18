// AS PONTAS QUE A FOICE ATIRA, DESENHADAS COMO O MATO (scenes/game/MowFx). O primeiro voo eram billboards sem luz com
// as cores cruas da paleta — e saíam quase pretos: o mato no chão passa pela rampa do bioma e pela luz do mundo, que o
// clareiam, e um retalho pintado de outro jeito nunca bate com ele. Aqui cada ponta é a PRÓPRIA ponta do fio cortado (a
// mesma região do atlas do mato, render3d/tallGrassArt), num quad em pé desenhado pelo MESMO material do mato
// (TallGrassField): a mesma rampa, a mesma luz, de dia e de noite. Um pool de quads numa malha só; cada quadro quem voa
// escreve onde está, girado no plano dele, e o que pousou encolhe até sumir.

import * as THREE from 'three';
import type { FrameUv } from '../standingDecor';

/** A região da ponta de um fio no atlas (colunas e fileiras da célula, inclusive) e a cor dela (o bioma × o tom). */
export interface FlyerArt {
  cell: number;
  col0: number;
  col1: number;
  row0: number;
  row1: number;
  r: number;
  g: number;
  b: number;
}

const SLOTS = 64;
const PX = 1 / 16;

export class GrassFlyers {
  private readonly geometry = new THREE.BufferGeometry();
  private readonly mesh: THREE.Mesh;
  private readonly size: Array<{ hw: number; hh: number } | null> = Array.from({ length: SLOTS }, () => null);
  private next = 0;

  public constructor(scene: THREE.Scene, material: THREE.Material, private readonly uvOf: (cell: number) => FrameUv, order: number) {
    const f = (n: number): THREE.BufferAttribute => new THREE.BufferAttribute(new Float32Array(SLOTS * 4 * n), n);
    const g = this.geometry;
    g.setAttribute('position', f(3));
    g.setAttribute('uv', f(2));
    g.setAttribute('aUvBounds', f(4));
    g.setAttribute('normal', f(3));
    g.setAttribute('color', f(3));
    g.setAttribute('aStand', f(4));
    g.setAttribute('aFlex', f(1));
    g.setAttribute('aBlade', f(4));
    const idx = new Uint32Array(SLOTS * 6);
    for (let i = 0; i < SLOTS; i += 1) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    for (let v = 0; v < SLOTS * 4; v += 1) nrm.setXYZ(v, 0, 1, 0);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.renderOrder = order;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'tall-grass-flyers';
    scene.add(this.mesh);
  }

  /** Uma ponta nova: devolve o slot dela (o pool é um anel: com tudo ocupado, a mais velha cede o lugar). */
  public spawn(art: FlyerArt): number {
    const slot = this.next;
    this.next = (this.next + 1) % SLOTS;
    const f = this.uvOf(art.cell);
    const tu = (f.u1 - f.u0) / 16;
    const tv = (f.v1 - f.v0) / 16;
    const u0 = f.u0 + art.col0 * tu;
    const u1 = f.u0 + (art.col1 + 1) * tu;
    const vTop = f.v1 - art.row0 * tv;
    const vBottom = f.v1 - (art.row1 + 1) * tv;
    const g = this.geometry;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const bounds = g.attributes.aUvBounds as THREE.BufferAttribute;
    const col = g.attributes.color as THREE.BufferAttribute;
    const v = slot * 4;
    uv.setXY(v, u0, vBottom);
    uv.setXY(v + 1, u1, vBottom);
    uv.setXY(v + 2, u1, vTop);
    uv.setXY(v + 3, u0, vTop);
    for (let k = 0; k < 4; k += 1) {
      bounds.setXYZW(v + k, u0 + tu / 2, vBottom + tv / 2, u1 - tu / 2, vTop - tv / 2);
      col.setXYZ(v + k, art.r, art.g, art.b);
    }
    for (const a of [uv, bounds, col]) a.needsUpdate = true;
    this.size[slot] = { hw: ((art.col1 - art.col0 + 1) * PX) / 2, hh: ((art.row1 - art.row0 + 1) * PX) / 2 };
    return slot;
  }

  /**
   * A ponta no ar: o centro (x, altura, z), girada `angle` radianos no plano dela (em pé, de frente para a câmera), e
   * encolhida por `scale` (1 = inteira, 0 = sumiu).
   */
  public set(slot: number, x: number, y: number, z: number, angle: number, scale: number): void {
    const s = this.size[slot];
    if (!s) return;
    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    const cos = Math.cos(angle) * scale;
    const sin = Math.sin(angle) * scale;
    const corners = [[-s.hw, -s.hh], [s.hw, -s.hh], [s.hw, s.hh], [-s.hw, s.hh]];
    corners.forEach(([cx, cy], k) => pos.setXYZ(slot * 4 + k, x + cx * cos - cy * sin, y + cx * sin + cy * cos, z));
    pos.needsUpdate = true;
  }

  /** A ponta sumiu: o quad dobra num ponto. */
  public release(slot: number): void {
    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < 4; k += 1) pos.setXYZ(slot * 4 + k, 0, -10, 0);
    pos.needsUpdate = true;
    this.size[slot] = null;
  }

  public dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.geometry.dispose();
  }
}
