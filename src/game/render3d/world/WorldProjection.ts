// DO MUNDO PARA A TELA E DE VOLTA: onde um tile aparece na tela, que tile está sob um ponto da tela, o tamanho de um
// tile em pixels, e o deslocamento do centro da vista.

import * as THREE from 'three';
import { terrainHeightAt } from '@/game/world/relief';
import { platform } from '@/game/platform/platform';
import type { World3D } from '../World3D';

/** O que WorldProjection usa de World3D. */
export type WorldProjectionHost = Pick<World3D, 'cam' | 'camTarget' | 'camera' | 'screen'>;

export class WorldProjection {
  private readonly projectScratch = new THREE.Vector3();

  public viewOffsetX = 0;
  public viewOffsetY = 0;
  public focusAtCentre = false;

  public constructor(private readonly host: WorldProjectionHost) {}

  /** Dialog pan: shift what sits at screen centre, in tile units. */
  /** O herói saiu do quadro de propósito (a lente da Thea): a faixa nítida fica no meio da tela, não nele. */
  public setFocusAtCentre(on: boolean): void {
    this.focusAtCentre = on;
  }

  public setViewOffset(dxTiles: number, dyTiles: number): void {
    this.viewOffsetX = dxTiles;
    this.viewOffsetY = dyTiles;
  }

  /** World tile → CSS pixel position on screen (for 2D-side overlays/FX). */
  public projectTile(worldX: number, worldY: number, elevationTiles = 0): { x: number; y: number } {
    // Scratch, not a fresh Vector3: every 2D overlay in the game (footprints, pips, balloons, the
    // fire compass) projects through here several times a frame, and the garbage adds up into the
    // collector's next pause.
    const p = this.projectRaw(worldX, worldY, elevationTiles);
    return { x: Math.round(p.x), y: Math.round(p.y) };
  }

  /**
   * O `projectTile` sem arredondar. O canvas do mundo pode estar maior que a tela (a margem da
   * câmera de pixel suave) e deslocado (a sobra dela): as duas coisas entram aqui, senão todo
   * overlay 2D ficaria até meio pixel do buffer fora do lugar que o mundo desenhou.
   */
  private projectRaw(worldX: number, worldY: number, elevationTiles = 0): { x: number; y: number } {
    // A altura do chao (a serra) entra aqui: todo overlay 2D ancorado num tile do planalto — a
    // pegada, o balao, o "!" — nasce em cima dele, sem que quem o ancora saiba que ha relevo.
    const ground = terrainHeightAt(worldX, worldY);
    const v = this.projectScratch.set(worldX, elevationTiles + ground, worldY).project(this.host.camera);
    const m = this.host.screen.snapMarginCss;
    return {
      x: (v.x * 0.5 + 0.5) * (platform().display.width + 2 * m) - m + this.host.cam.snapShiftX,
      y: (-v.y * 0.5 + 0.5) * (platform().display.height + 2 * m) - m + this.host.cam.snapShiftY,
    };
  }

  /**
   * O INVERSO do `projectTile`: pixel na tela → o tile do CHAO que esta debaixo dele.
   *
   * SEM CHAMADOR HOJE — nasceu para a mira do revolver, que saiu do jogo. Fica de pe porque a
   * conta e a armadilha, e nao a peca: qualquer coisa que um dia traduza pixel em tile (mira,
   * clique-para-andar, um cursor de editor) vai cair nela. O heroi fica no centro da tela, entao
   * a tentacao e dizer "a direcao e (mouse - centro)" — mas a camera olha o mundo de cima e
   * INCLINADA, e num plano em perspectiva um passo pra cima na tela vale muito mais mundo do que
   * um passo pro lado. Resolver por delta de tela sai sempre "achatado", e o erro cresce com a
   * distancia do centro. Aqui a leitura e feita onde ela acontece: no plano do chao, pelo raio
   * que sai da camera e passa pelo pixel.
   *
   * `elevationTiles` e a altura do plano interceptado: mirar no plano do PEITO (e nao no chao) e
   * o que faz o cursor cair em cima do corpo que o jogador ve, e nao nos pes dele.
   */
  public screenToGround(
    pixelX: number,
    pixelY: number,
    elevationTiles = 0,
  ): { worldX: number; worldY: number } {
    const m = this.host.screen.snapMarginCss;
    const ndcX = ((pixelX + m - this.host.cam.snapShiftX) / Math.max(1, platform().display.width + 2 * m)) * 2 - 1;
    const ndcY = -(((pixelY + m - this.host.cam.snapShiftY) / Math.max(1, platform().display.height + 2 * m)) * 2 - 1);
    const dir = this.projectScratch.set(ndcX, ndcY, 0.5).unproject(this.host.camera).sub(this.host.camera.position);
    // Camera olhando pra baixo: `dir.y` e sempre negativo na pratica. O guarda e pro caso
    // degenerado (raio paralelo ao plano), em que nao ha intersecao nenhuma — devolver o alvo da
    // camera e melhor que devolver Infinity e mandar uma bala pro infinito.
    if (Math.abs(dir.y) < 1e-6) return { worldX: this.host.camTarget.x, worldY: this.host.camTarget.z };
    const t = (elevationTiles - this.host.camera.position.y) / dir.y;
    return {
      worldX: this.host.camera.position.x + dir.x * t,
      worldY: this.host.camera.position.z + dir.z * t,
    };
  }

  /** Projected pixel height of one tile at the camera target — the 2D code's "tileSize". */
  public tileScreenSize(): number {
    // SEM arredondar: a diferença de duas projeções arredondadas pulava entre 104 e 105 px com o
    // herói andando (o balanço da câmera muda a fração), e tudo que é 2D e se mede por este número
    // — pegadas, golpes, balões — encolhia e crescia 1% num quadro.
    const a = this.projectRaw(this.host.camTarget.x, this.host.camTarget.z);
    const c = this.projectRaw(this.host.camTarget.x, this.host.camTarget.z, 1);
    return Math.max(24, Math.abs(a.y - c.y));
  }
}
