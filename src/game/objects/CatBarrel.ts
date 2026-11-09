import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { paintBarrel } from '@/game/render3d/campArt';
import { paintedCanvas } from '@/game/render3d/homeTextures';
import { registerTexture3D } from '@/game/render3d/textures3d';
import { world3d } from '@/game/render3d/World3D';

/**
 * O BARRIL DO GATO (pedido do autor: "quando não estiver seguindo, crie uma casa pra ele, um barril como Diógenes").
 * O gato é Diógenes, o cínico, e Diógenes morava num jarro de barro deitado, na praça de Atenas — o "barril" da
 * tradição. Este fica em campo aberto, à beira do caminho do meio, onde o herói passa sempre: o gato segue o herói
 * quando quer e, quando cansa, volta para cá e dorme na palha (entities/CatCompanion). Antes de o gato chegar, o
 * barril já está aqui, vazio.
 *
 * O tile fica limpo no world.json (scripts/barril-do-gato.mjs, com a mesma coordenada e a prova de BFS), e o barril é
 * sólido, como as peças do acampamento.
 */
export const CAT_BARREL = { x: 28, y: 47 } as const;
const TEXTURE = 'cat-barrel';
/** O mesmo tom das peças do acampamento: a luz do mundo estoura os claros. */
const TINT = 0xa8a4a0;

let registered = false;
const registerTexture = (): void => {
  if (registered) return;
  const tex = new THREE.CanvasTexture(paintedCanvas(paintBarrel, 16, 16));
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  registerTexture3D(TEXTURE, tex);
  registered = true;
};

export class CatBarrel {
  private readonly body: Billboard3D;

  public constructor() {
    registerTexture();
    this.body = world3d().objects.addBillboard(TEXTURE, 0, { groundShadow: { rx: 0.46, rz: 0.2, alpha: 0.3 } })
      .setDisplaySize(1, 1)
      .setTint(TINT)
      .setPosition(CAT_BARREL.x, CAT_BARREL.y);
  }

  /** O barril está neste tile? */
  public at(x: number, y: number): boolean {
    return x === CAT_BARREL.x && y === CAT_BARREL.y;
  }

  /** Onde o gato se enrola: na boca do barril, um palmo à frente para ficar desenhado por cima da palha. */
  public get bed(): { x: number; y: number } {
    return { x: CAT_BARREL.x, y: CAT_BARREL.y + 0.12 };
  }

  public destroy(): void {
    this.body.destroy();
  }
}
