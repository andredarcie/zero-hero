import type Phaser from 'phaser';
import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { DECOR_PAINTERS, FIND_PAINTERS, FIND_SIZE, type FindKind } from '@/game/render3d/findArt';
import { paintedCanvas, type HomeKind } from '@/game/render3d/homeTextures';
import { registerTexture3D } from '@/game/render3d/textures3d';
import { world3d } from '@/game/render3d/World3D';

/**
 * O QUE SE ACHA ANDANDO. Coisas pequenas fora do caminho dos pedidos: nenhuma é pedida, nenhuma dá item, e
 * nada conta quantas você achou. Quem vai ver é pago em ver. As que têm `view` são lugar de sentar: o herói
 * senta nelas, o tempo corre e a câmera olha para lá.
 *
 * Os tiles vieram de uma conta sobre o world.json com a regra de passo do jogo: cada um está livre, tem
 * chão ao sul para o herói chegar de frente, fica a mais de cinco tiles de quem pede alguma coisa e, sólido,
 * não fecha caminho nenhum (o conjunto inteiro tira do mapa só os seus próprios tiles).
 */

export interface ValleyFind {
  /** `door` é a porta da casa, que já está desenhada nela: só o Z muda. */
  kind: FindKind | 'door';
  x: number;
  y: number;
  view?: { x: number; y: number };
  /** De quem é a casa: a varanda e a porta têm dono, e o dono vem. */
  owner?: HomeKind;
}

const FINDS: readonly ValleyFind[] = [
  // A cadeira da beira do lago é o ÚNICO lugar de olhar o lago (pedido do autor): o banco do alto do morro,
  // que dava um zoom torto, e o balanço do extremo oeste saíram.
  { kind: 'chair', x: 41, y: 50, view: { x: 42, y: 53 } },
  // A placa ao lado do portão do jardim alto: fechado para preservação (finds.sign; aberto, finds.signOpen).
  { kind: 'sign', x: 29, y: 36 },
  { kind: 'helmet', x: 54, y: 18 },
  { kind: 'bottle', x: 55, y: 54 },
  // AS VARANDAS: um banco ao lado de cada porta, e quem mora ali vem sentar junto com uma caneca.
  { kind: 'bench', x: 39, y: 8, view: { x: 39, y: 9 }, owner: 'astronaut' },
  { kind: 'bench', x: 52, y: 7, view: { x: 52, y: 8 }, owner: 'businessMan' },
  { kind: 'bench', x: 15, y: 13, view: { x: 15, y: 14 }, owner: 'painter' },
  // Do lado oeste: o tile do leste, (7, 37), é a passagem para o morro do morel, e um banco ali fecha o pedido dela.
  { kind: 'bench', x: 3, y: 37, view: { x: 3, y: 38 }, owner: 'radiationSuit' },
  { kind: 'door', x: 37, y: 8, owner: 'astronaut' },
  { kind: 'door', x: 50, y: 7, owner: 'businessMan' },
  { kind: 'door', x: 17, y: 13, owner: 'painter' },
  { kind: 'door', x: 5, y: 37, owner: 'radiationSuit' },
];

/** A luz do mundo estoura os tons claros; o tom abaixa antes da luz, como nas casas. */
const FIND_TINT = 0xa8a4a0;
const FIND_SHADOW = { rx: 0.42, rz: 0.2, alpha: 0.3 };
/** Onde se senta, o corpo do herói fica neste tile: o móvel fica um nada atrás dele. */
const SEAT_BEHIND = 0.05;

const findTexture = (kind: FindKind): string => `valley-find-${kind}`;

// O registro THREE é um mapa de módulo que sobrevive ao restart da cena: registrar uma vez só.
let threeRegistered = false;

export const registerFindTextures = (scene: Phaser.Scene): void => {
  for (const [kind, paint] of Object.entries({ ...FIND_PAINTERS, ...DECOR_PAINTERS })) {
    const key = `valley-find-${kind}`;
    const canvas = paintedCanvas(paint, FIND_SIZE, FIND_SIZE);
    if (!threeRegistered) {
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      registerTexture3D(key, tex);
    }
    if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas);
  }
  threeRegistered = true;
};

export class ValleyFinds {
  private readonly bodies: Billboard3D[] = [];

  public constructor() {
    for (const { kind, x, y, view } of FINDS) {
      if (kind === 'door') continue;
      this.bodies.push(world3d()
        .addBillboard(findTexture(kind), 0, { groundShadow: FIND_SHADOW })
        .setDisplaySize(1, 1)
        .setTint(FIND_TINT)
        .setPosition(x, view ? y - SEAT_BEHIND : y));
    }
  }

  public destroy(): void {
    for (const bb of this.bodies) bb.destroy();
    this.bodies.length = 0;
  }

  public at(x: number, y: number): ValleyFind | undefined {
    return FINDS.find((find) => find.x === x && find.y === y);
  }
}
