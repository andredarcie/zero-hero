import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { paintCairn, paintMeditationSeat } from '@/game/render3d/meditationArt';
import { paintedCanvas } from '@/game/render3d/homeTextures';
import { registerTexture3D } from '@/game/render3d/textures3d';
import { world3d } from '@/game/render3d/World3D';

/**
 * A PEDRA DE MEDITAR (pedido do autor, 2026-11-12: o minijogo de meditação, num lugar do mapa que não tinha quase
 * nada). O lugar é o alto da colina de capim ao norte do centro do vale, o ponto MAIS LONGE de tudo no mapa medido
 * (scratchpad mapa2: até 24 passos de qualquer vizinho, item ou achado): um platô de um nível (x 28..33, y 19..21),
 * com a escada ao sul (31,22), o laguinho de taboa a noroeste e a vista do vale para baixo.
 *
 *          x30                x31          x32
 *   y20   PEDRA (senta aqui)   .          pilha de pedras
 *   y21   (o Z daqui, ou de (31,20), (29,20), (30,19))
 *
 * As duas peças são sólidas, como as do acampamento; o chão delas fica limpo no world.json (scripts/meditacao.mjs,
 * com a MESMA tabela, e a prova de que do começo se chega lá).
 */
export const MEDITATION_SEAT = { x: 30, y: 20 } as const;
export const MEDITATION_CAIRN = { x: 32, y: 20 } as const;

export type MeditationPiece = 'seat' | 'cairn';

const SEAT_TEXTURE = 'meditation-seat';
const CAIRN_TEXTURE = 'meditation-cairn';
/** O tom das peças do mundo: a luz do vale estoura os claros (o mesmo do acampamento). */
const TINT = 0xa8a4a0;

let registered = false;
const registerTextures = (): void => {
  if (registered) return;
  for (const [key, paint] of [[SEAT_TEXTURE, paintMeditationSeat], [CAIRN_TEXTURE, paintCairn]] as const) {
    const tex = new THREE.CanvasTexture(paintedCanvas(paint, 16, 16));
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    registerTexture3D(key, tex);
  }
  registered = true;
};

export class MeditationSpot {
  private readonly bodies: Billboard3D[] = [];

  public constructor() {
    registerTextures();
    const w3 = world3d();
    this.bodies.push(w3.objects.addBillboard(SEAT_TEXTURE, 0, { groundShadow: { rx: 0.44, rz: 0.14, alpha: 0.28 } })
      .setDisplaySize(1, 1)
      .setTint(TINT)
      .setPosition(MEDITATION_SEAT.x, MEDITATION_SEAT.y - 0.05));
    this.bodies.push(w3.objects.addBillboard(CAIRN_TEXTURE, 0, { groundShadow: { rx: 0.32, rz: 0.12, alpha: 0.3 } })
      .setDisplaySize(1, 1)
      .setTint(TINT)
      .setPosition(MEDITATION_CAIRN.x, MEDITATION_CAIRN.y - 0.05));
  }

  /** A peça deste tile, ou nada. */
  public at(x: number, y: number): MeditationPiece | null {
    if (x === MEDITATION_SEAT.x && y === MEDITATION_SEAT.y) return 'seat';
    if (x === MEDITATION_CAIRN.x && y === MEDITATION_CAIRN.y) return 'cairn';
    return null;
  }

  public destroy(): void {
    for (const b of this.bodies) b.destroy();
    this.bodies.length = 0;
  }
}
