import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { registerTexture3D } from '@/game/render3d/textures3d';
import { world3d } from '@/game/render3d/World3D';
import { createCanvas } from '@/game/platform/platform';
import { ROAD_PX } from './roadPaint';

/**
 * O CHÃO TRINCADO (pedido do autor, 2026-11-09): a pá só cava onde a terra já está rachada, e a rachadura é
 * discreta — uns riscos finos e escuros na grama, que quem procura acha e quem passa nem nota. Uma película deitada
 * por tile, 16 px como o chão, abaixo dos tufos; quando a pá cava ali, o buraco toma o lugar dela (`remove`).
 * Onde ficam é quem pede que diz (quests/PainterCracks: as quatro covas da Sisi).
 */

const TEXTURE = 'ground-crack';
/** Um nada acima do chão, abaixo do buraco cavado (0,018) e dos tufos. */
const CRACK_Y = 0.013;
const CRACK_COLOR = [46, 37, 24] as const;
const CRACK_ALPHA = 190;

/** O desenho da rachadura: um risco que serpenteia de um lado ao outro, com dois galhos. */
const CRACK_ART = [
  '................',
  '................',
  '................',
  '..........#.....',
  '.........#......',
  '.........#......',
  '........#.......',
  '.....###.##..#..',
  '..##.#.....##...',
  '....#.......#...',
  '.....#......#...',
  '.....#..........',
  '....#...........',
  '................',
  '................',
  '................',
] as const;

let registered = false;
const register = (): void => {
  if (registered) return;
  registered = true;
  const canvas = createCanvas();
  canvas.width = ROAD_PX;
  canvas.height = ROAD_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const image = ctx.createImageData(ROAD_PX, ROAD_PX);
  CRACK_ART.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] !== '#') continue;
      const i = (y * ROAD_PX + x) * 4;
      image.data.set([...CRACK_COLOR, CRACK_ALPHA], i);
    }
  });
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  registerTexture3D(TEXTURE, tex);
};

export class GroundCracks {
  private readonly bodies = new Map<string, Billboard3D>();

  public constructor(tiles: ReadonlyArray<{ x: number; y: number }>) {
    register();
    for (const [i, { x, y }] of tiles.entries()) {
      // Pintura no chão, por baixo das sombras, como as estradas; espelhada de tile em tile, para não repetir.
      const body = world3d().objects.addBillboard(TEXTURE, 0, { flat: true, flatY: CRACK_Y, depthWrite: false, renderOrder: 1 })
        .setPosition(x, y)
        .setDisplaySize(1, 1)
        .setFlipX(i % 2 === 1);
      this.bodies.set(`${x},${y}`, body);
    }
  }

  /** As rachaduras que ainda estão no chão. */
  public get tiles(): Array<{ x: number; y: number }> {
    return [...this.bodies.keys()].map((k) => {
      const [x, y] = k.split(',').map(Number);
      return { x, y };
    });
  }

  /** A pá cavou aqui: o buraco toma o lugar da rachadura. */
  public remove(x: number, y: number): void {
    this.bodies.get(`${x},${y}`)?.destroy();
    this.bodies.delete(`${x},${y}`);
  }

  public destroy(): void {
    for (const body of this.bodies.values()) body.destroy();
    this.bodies.clear();
  }
}
