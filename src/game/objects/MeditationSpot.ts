import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { paintCairn, paintMeditationSeat } from '@/game/render3d/meditationArt';
import { paintedCanvas } from '@/game/render3d/homeTextures';
import { registerTexture3D } from '@/game/render3d/textures3d';
import { world3d } from '@/game/render3d/World3D';

/**
 * A PEDRA DE MEDITAR (pedido do autor, 2026-11-12: o minijogo de meditação, num lugar do mapa que não tinha quase
 * nada). O lugar é a clareira de capim na borda da mata de outono, a leste do centro do vale (2026-11-16, pedido do
 * autor: antes ela ficava no planalto da Thea, e a pilha de pedras caía no MESMO tile do marco do telescópio, com a
 * nave do fim pousando em cima da pedra). Medido no world.json e no código: nenhuma peça, vizinho, item ou tile de
 * quest a menos de 5 tiles, e os 20 tiles em volta das peças livres; 35 passos do começo, sem ferramenta.
 *
 *          x44                x45          x46
 *   y39   PEDRA (senta aqui)   .          pilha de pedras
 *   y40   (o Z daqui, ou de (45,39), (43,39), (44,38))
 *
 * As duas peças são sólidas, como as do acampamento; o chão delas fica limpo no world.json (scripts/meditacao.mjs,
 * com a MESMA tabela, e a prova de que do começo se chega lá).
 */
export const MEDITATION_SEAT = { x: 44, y: 39 } as const;
export const MEDITATION_CAIRN = { x: 46, y: 39 } as const;

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
