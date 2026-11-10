// AS CAMADAS DE SOMBRA DO MUNDO 3D: a máscara (as silhuetas desenhadas num alvo próprio, que o chão lê) e a barra de
// sombra dos maciços (muro, montanha, serra), re-assada aos poucos quando a luz direcional muda.

import * as THREE from 'three';
import { bakedShadowAlpha, bakedShadowLength, tintShadowMaterial } from '../CastShadow3D';
import { shadowMaskOnUniform, shadowMaskRectUniform, shadowMaskUniform } from '../pixelArtLight';
import { platform } from '@/game/platform/platform';
import { bakeMassShadow, MASS_BAKE_MS_PER_FRAME } from '../terrainGeometry';
import type { World3D } from '../World3D';

// The shadow mask's coverage, in tiles around the camera target: wider than the view so
// a silhouette entering from off-screen is already in the data when its caster shows.
const MASK_TILES_X = 48;
const MASK_TILES_Z = 32;
// Scratch for save/restore around the mask render (never reallocated).
const maskClearScratch = { color: new THREE.Color() };

/** O que ShadowLayers usa de World3D. */
export type ShadowLayersHost = Pick<World3D,
  'camTarget' | 'casts' | 'moonCastRotY' | 'params' | 'renderer' | 'scene' | 'tiles'
>;

export class ShadowLayers {
  // ── the shadow mask (hd3d.shadowMask — see the param doc) ──
  public maskTarget!: THREE.WebGLRenderTarget;
  public readonly maskScene = new THREE.Scene();
  public maskCamera!: THREE.OrthographicCamera;
  public appliedMaskMode = false;
  public massShadowMesh?: THREE.Mesh;
  public massBake?: Generator<void, THREE.BufferGeometry | null, void>;
  public readonly appliedMassShadow = { alpha: -1, length: -1, rotY: 0 };

  public constructor(private readonly host: ShadowLayersHost) {}

  /**
   * Assa (ou re-assa) a barra de sombra dos maciços. Uma malha, um draw, zero sobreposição — o
   * porquê está em `buildMassShadowGeometry`. Roda no fim do build e sempre que um dos dois knobs
   * da sombra direcional se mexe, que é o mesmo compasso do campo instanciado da lua.
   *
   * O material é PRETO SEM MAPA: a silhueta de um cubo opaco é o quadrado dele, então não há arte a
   * recortar — e sem `map` não há `alphaTest`, que é o que deixaria a borda da barra serrilhar por
   * texel de uma arte que não tem nada a ver com ela.
   */
  public rebuildMassShadow(): void {
    const bake = this.startMassShadowBake();
    let step = bake.next();
    while (!step.done) step = bake.next();
    this.massBake = undefined;
    this.installMassShadow(step.value);
  }

  /**
   * O sol anda, e a sombra anda com ele: re-assar o mundo inteiro de uma vez daria um tranco num
   * celular a cada passo do relógio. Então este bake vem em fatias, e a sombra velha fica na tela até
   * a nova ficar pronta. Um bake que perdeu o rumo no meio do caminho é trocado por outro.
   */
  public tickMassShadowBake(): void {
    if (!this.massBake) return;
    const clock = platform();
    const until = clock.now() + MASS_BAKE_MS_PER_FRAME;
    let step = this.massBake.next();
    while (!step.done && clock.now() < until) step = this.massBake.next();
    if (!step.done) return;
    this.massBake = undefined;
    this.installMassShadow(step.value);
  }

  public startMassShadowBake(): Generator<void, THREE.BufferGeometry | null, void> {
    const length = bakedShadowLength(this.host.params.moonShadowLength);
    this.appliedMassShadow.length = length;
    this.appliedMassShadow.rotY = this.host.moonCastRotY;

    // O rumo da barra é o MESMO da silhueta esticada que ela substitui: o quad da lua aponta a
    // cabeça em -Z antes de girar, então o rumo no chão é (-sen, -cos) do mesmo ângulo. Derivar
    // daqui e não de um segundo número é o que impede a barra de apontar para um lado e a sombra
    // de uma árvore ao lado dela para outro.
    return bakeMassShadow(
      this.host.tiles.massGrid,
      this.host.tiles.stairTiles,
      -Math.sin(this.host.moonCastRotY),
      -Math.cos(this.host.moonCastRotY),
      length,
    );
  }

  private installMassShadow(geo: THREE.BufferGeometry | null): void {
    const alpha = bakedShadowAlpha(this.host.params.moonShadowAlpha);
    this.appliedMassShadow.alpha = alpha;
    const old = this.massShadowMesh;
    if (old) {
      old.removeFromParent();
      old.geometry.dispose();
      this.massShadowMesh = undefined;
    }
    if (!geo || alpha <= 0.02) {
      geo?.dispose();
      if (old) (old.material as THREE.Material).dispose();
      return;
    }
    let mat = old?.material as THREE.MeshBasicMaterial | undefined;
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, fog: true });
      tintShadowMaterial(mat); // a mesma cor de sombra da árvore ao lado (CastShadow3D.shadowTint)
    }
    mat.opacity = alpha;
    const mesh = new THREE.Mesh(geo, mat);
    // A mesma ordem das outras sombras de chão: depois do brilho aditivo do fogo, senão a barra
    // some exatamente onde o chão está mais claro (foi relato de jogador no caminho das outras).
    mesh.renderOrder = 4;
    this.massShadowMesh = mesh;
    this.host.scene.add(mesh);
  }

  /**
   * The shadow mask's plumbing (hd3d.shadowMask — see the param doc): a small top-down
   * ortho RT following the camera. Built unconditionally (it is tiny) so flipping the
   * knob mid-run allocates nothing; the mask is only RENDERED while the knob is on.
   */
  public initShadowMask(): void {
    const res = Math.max(4, this.host.params.shadowMaskRes);
    this.maskTarget = new THREE.WebGLRenderTarget(MASK_TILES_X * res, MASK_TILES_Z * res, {
      depthBuffer: false,
      magFilter: THREE.LinearFilter, // the mask is light data, not art — soft edges are penumbra
      minFilter: THREE.LinearFilter,
    });
    // up = +z so the RT's v axis grows with world z — the exact mapping zhShadowMask
    // assumes (uv = (worldXZ - rect.xy) / rect.zw).
    this.maskCamera = new THREE.OrthographicCamera(
      -MASK_TILES_X / 2, MASK_TILES_X / 2, MASK_TILES_Z / 2, -MASK_TILES_Z / 2, 0.1, 20,
    );
    this.maskCamera.up.set(0, 0, 1);
    shadowMaskUniform.value = this.maskTarget.texture;
  }

  /**
   * Move the fire silhouettes between the SCENE (classic decals multiplied over the
   * frame) and the MASK scene (value writers into the RT). Meshes may come and go
   * freely — only lights are frozen — and every material variant here compiled at boot
   * (prewarmShaders), so the flip costs one reparenting walk and zero compiles.
   */
  public applyShadowMaskMode(on: boolean): void {
    this.appliedMaskMode = on;
    shadowMaskOnUniform.value = on ? 1 : 0;
    const parent = on ? this.maskScene : this.host.scene;
    for (const c of this.host.casts.castCasters) {
      c.mesh.removeFromParent();
      parent.add(c.mesh);
      c.mesh.material = on ? c.maskMat : c.sceneMat;
    }
    this.host.tiles.solidCastField.mesh.removeFromParent();
    parent.add(this.host.tiles.solidCastField.mesh);
    this.host.tiles.solidCastField.setMaskMode(on);
    // The MOON casts and the arm's ShadowStrips stay scene-side for now (they multiply
    // the final colour either way); migrating them into a second mask channel is the
    // documented follow-up (plano.md fase 3, passo v).
  }

  /** Draw this frame's fire silhouettes into the mask RT (mask mode only). */
  public renderShadowMask(): void {
    const cam = this.maskCamera;
    const res = Math.max(4, this.host.params.shadowMaskRes);
    // Snap the window to the mask's own texel grid, or the sampled shadows swim
    // against the world as the camera pans (the lightRes lesson, applied to the RT).
    const cx = Math.round(this.host.camTarget.x * res) / res;
    const cz = Math.round(this.host.camTarget.z * res) / res;
    cam.position.set(cx, 10, cz);
    cam.lookAt(cx, 0, cz);
    cam.updateMatrixWorld();
    shadowMaskRectUniform.value.set(
      cx - MASK_TILES_X / 2, cz - MASK_TILES_Z / 2, MASK_TILES_X, MASK_TILES_Z,
    );
    const prevTarget = this.host.renderer.getRenderTarget();
    this.host.renderer.getClearColor(maskClearScratch.color);
    const prevAlpha = this.host.renderer.getClearAlpha();
    this.host.renderer.setRenderTarget(this.maskTarget);
    this.host.renderer.setClearColor(0x000000, 1);
    this.host.renderer.clear(true, false, false);
    this.host.renderer.render(this.maskScene, cam);
    this.host.renderer.setRenderTarget(prevTarget);
    this.host.renderer.setClearColor(maskClearScratch.color, prevAlpha);
  }
}
