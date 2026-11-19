// OS RECORTES DO ESPELHO D'ÁGUA (WaterMirror): os retângulos, em pixels do alvo do reflexo (origem embaixo, como o
// scissor do GL), onde a passada do espelho precisa desenhar. Os dois são a mesma conta — cantos de caixas projetados
// pela câmera virtual — sobre caixas diferentes: a dos corpos refletidos, e a da água à vista.

import type * as THREE from 'three';

export type MirrorRect = { x0: number; y0: number; x1: number; y1: number };

/** A folga em altura da caixa da água: o rio fica 0,02 acima do lago, e a margem dobra a quina para baixo. */
const WET_SLACK_Y = 0.25;
/** A folga em pixels do recorte da água: o tremor por linha (±2 texels, WATER_REFLECT_GLSL) e o arredondamento. */
const WET_SLACK_PX = 4;
/** A folga em pixels do recorte dos corpos. */
const BODY_SLACK_PX = 2;

/**
 * Junta pontos do mundo projetados pela câmera virtual num retângulo do alvo. Um ponto atrás da câmera (z de vista ≥ 0)
 * vira a projeção do avesso: aí o retângulo é o alvo inteiro. (O recorte oblíquo do espelho só mexe na linha do z da
 * projeção, então o x e o y da tela são os da projeção comum.)
 */
class RectAccumulator {
  private x0 = Infinity;
  private y0 = Infinity;
  private x1 = -Infinity;
  private y1 = -Infinity;
  public behind = false;

  public constructor(
    private readonly mirror: THREE.PerspectiveCamera, private readonly tw: number, private readonly th: number,
    private readonly v: THREE.Vector3,
  ) {}

  /** Acrescenta o ponto que está em `v` (o vetor de rascunho, já em coordenadas de mundo). */
  public add(): void {
    const v = this.v;
    const view = this.mirror.matrixWorldInverse.elements;
    if (view[2] * v.x + view[6] * v.y + view[10] * v.z + view[14] >= 0) { this.behind = true; return; }
    v.project(this.mirror);
    const px = (v.x * 0.5 + 0.5) * this.tw;
    const py = (v.y * 0.5 + 0.5) * this.th;
    if (px < this.x0) this.x0 = px;
    if (px > this.x1) this.x1 = px;
    if (py < this.y0) this.y0 = py;
    if (py > this.y1) this.y1 = py;
  }

  public result(slack: number): MirrorRect {
    if (this.behind) return { x0: 0, y0: 0, x1: this.tw, y1: this.th };
    if (this.x0 > this.x1) return { x0: 0, y0: 0, x1: 0, y1: 0 };
    return {
      x0: Math.max(0, Math.floor(this.x0) - slack),
      y0: Math.max(0, Math.floor(this.y0) - slack),
      x1: Math.min(this.tw, Math.ceil(this.x1) + slack),
      y1: Math.min(this.th, Math.ceil(this.y1) + slack),
    };
  }
}

/** O retângulo que cobre todos os corpos do espelho: os 8 cantos da caixa de cada um. */
export const bodiesRect = (
  kept: readonly THREE.Object3D[], mirror: THREE.PerspectiveCamera, tw: number, th: number, scratch: THREE.Vector3,
): MirrorRect => {
  const acc = new RectAccumulator(mirror, tw, th, scratch);
  for (const o of kept) {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) continue;
    const geo = m.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const box = geo.boundingBox;
    if (!box) return { x0: 0, y0: 0, x1: tw, y1: th };
    m.updateMatrixWorld();
    for (let c = 0; c < 8 && !acc.behind; c++) {
      scratch.set(c & 1 ? box.max.x : box.min.x, c & 2 ? box.max.y : box.min.y, c & 4 ? box.max.z : box.min.z)
        .applyMatrix4(m.matrixWorld);
      acc.add();
    }
  }
  return acc.result(BODY_SLACK_PX);
};

/**
 * O retângulo que a água à vista pode amostrar: a caixa dos tiles de água (`box`, em tiles; meio tile para cada lado,
 * a superfície com folga em altura em volta de `planeY`), com os 8 cantos projetados pela câmera virtual — é a mesma
 * conta de `uReflMatrix`, então um ponto da água cai no alvo exatamente onde ela o lê.
 */
export const wetRect = (
  box: { x0: number; z0: number; x1: number; z1: number }, planeY: number,
  mirror: THREE.PerspectiveCamera, tw: number, th: number, scratch: THREE.Vector3,
): MirrorRect => {
  const acc = new RectAccumulator(mirror, tw, th, scratch);
  for (let c = 0; c < 8 && !acc.behind; c++) {
    scratch.set(
      c & 1 ? box.x1 + 0.5 : box.x0 - 0.5,
      planeY + (c & 2 ? WET_SLACK_Y : -WET_SLACK_Y),
      c & 4 ? box.z1 + 0.5 : box.z0 - 0.5,
    );
    acc.add();
  }
  return acc.result(WET_SLACK_PX);
};
