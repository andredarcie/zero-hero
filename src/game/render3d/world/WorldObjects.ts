// OS OBJETOS SOLTOS DO MUNDO 3D: o billboard (o sprite em pé), a elipse de chão, a caixa, a malha acesa pela luz do
// mundo, e o farfalhar da decoração quando alguém passa por cima.

import * as THREE from 'three';
import { TILESET_FRAME_SIZE, TIMINGS } from '@/game/constants';
import { Billboard3D, type Billboard3DOptions } from '../Billboard3D';
import { makeCastMaskMaterial, makeCastMesh } from '../CastShadow3D';
import { makeShadowBlob } from '../groundShadow';
import { patchPixelMaterial } from '../pixelArtLight';
import type { World3D } from '../World3D';

/**
 * A lit BOX in the world (real prop geometry: bridge planks, posts…), skinned with
 * either a flat colour or a pixel-art texture (see woodTexture.ts).
 * Same Lambert + quantized/capped firelight as the merged terrain, so it belongs to
 * the diorama instead of reading as a foreign smooth-shaded object. Position is the
 * box CENTRE in tile coordinates; `elevation` is its centre height in tiles (0 =
 * ground plane). x/y/elevation/alpha/scaleY are plain properties so engine tweens
 * can drive them, exactly like Billboard3D.
 */
export interface Box3D {
  x: number;
  y: number;
  elevation: number;
  alpha: number;
  scaleY: number;
  setPosition(tileX: number, tileY: number): Box3D;
  setElevation(tiles: number): Box3D;
  setAlpha(a: number): Box3D;
  setVisible(v: boolean): Box3D;
  destroy(): void;
}
/** Como uma caixa veste a pele dela. Ver `addBox` e `tileBoxUv`. */
export interface BoxSkinOpts {
  /**
   * O TEXEL DA CAIXA PASSA A MEDIR O MESMO QUE O PIXEL DO MUNDO.
   *
   * Sem isto, a `BoxGeometry` estica a arte INTEIRA em cada face — e como as faces de uma peca
   * tem tamanhos muito diferentes, cada uma sai com um pixel de outro tamanho e de outro formato.
   * Medido no meio-fio da escada: 1,7 px de largura por 24 px de altura, um texel 20:1, que e
   * granito virando listra esticada. Com `pixelTiled` a arte e RECORTADA na densidade do mundo
   * (16 texels por tile), entao uma pedra de 0,1 tile mostra 1,6 texel de pedra — pouco, mas do
   * tamanho certo. Num jogo cuja lei e "16 px por tile", a alvenaria tambem obedece.
   */
  pixelTiled?: boolean;
  /**
   * Onde o recorte comeca, em TEXELS a partir do canto superior esquerdo da arte (so com
   * `pixelTiled`). E o que faz duas pisadas vizinhas nao serem o mesmo desenho — uma folha de
   * pedra, recortes diferentes, que e como pixel art sempre fez variacao.
   */
  uvShift?: readonly [number, number];
  /** Sem luz nenhuma: a cor sai crua. So para o que NAO e superficie — ver `addBox`. */
  unlit?: boolean;
}
/**
 * Recorta a arte de uma caixa na densidade de pixel do mundo, face a face.
 *
 * A `BoxGeometry` do three tem 6 faces de 4 vertices, nesta ordem: +X, −X, +Y, −Y, +Z, −Z; a UV
 * de cada uma vai de 0 a 1. Multiplicar essa UV pelo tamanho da face em texels do mundo (e somar
 * o deslocamento) e tudo o que e preciso — e fica na GEOMETRIA, que ja e unica por caixa, em vez
 * de num clone da textura: a `DataTexture` de pedra e compartilhada em cache, e clona-la por
 * caixa seria uma subida de textura nova por meio-fio.
 */
const tileBoxUv = (
  geo: THREE.BoxGeometry,
  sizeX: number,
  sizeH: number,
  sizeZ: number,
  skin: THREE.Texture,
  shift: readonly [number, number] = [0, 0],
): void => {
  const image = skin.image as { width?: number; height?: number } | undefined;
  const texW = image?.width ?? TILESET_FRAME_SIZE;
  const texH = image?.height ?? TILESET_FRAME_SIZE;
  // O modo de repeticao e parametro de TEXTURA, e o three so o aplica na subida — trocar o campo
  // sem `needsUpdate` deixa a textura grampeada na GPU e o recorte sai esticando o texel da borda
  // em vez de repetir. So a primeira caixa paga: as seguintes acham a textura ja em Repeat.
  if (skin.wrapS !== THREE.RepeatWrapping || skin.wrapT !== THREE.RepeatWrapping) {
    skin.wrapS = THREE.RepeatWrapping;
    skin.wrapT = THREE.RepeatWrapping;
    skin.needsUpdate = true;
  }
  // Que dimensao do mundo corre em u e em v, por face.
  const spans: ReadonlyArray<readonly [number, number]> = [
    [sizeZ, sizeH], [sizeZ, sizeH], // ±X: a profundidade em u, a altura em v
    [sizeX, sizeZ], [sizeX, sizeZ], // ±Y: topo e base — largura em u, profundidade em v
    [sizeX, sizeH], [sizeX, sizeH], // ±Z: largura em u, altura em v
  ];
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let face = 0; face < spans.length; face += 1) {
    const [spanU, spanV] = spans[face];
    const ru = (spanU * TILESET_FRAME_SIZE) / texW;
    const rv = (spanV * TILESET_FRAME_SIZE) / texH;
    // v cresce para CIMA na textura, e o deslocamento e contado a partir do TOPO da arte (que e
    // como se le um sprite): por isso o recorte ancora em `1 - rv` e o shift desce dali.
    const ou = shift[0] / texW;
    const ov = 1 - rv - shift[1] / texH;
    for (let i = face * 4; i < face * 4 + 4; i += 1) {
      uv.setXY(i, uv.getX(i) * ru + ou, uv.getY(i) * rv + ov);
    }
  }
  uv.needsUpdate = true;
};
/** A flat dark ellipse on the ground (the hero's contact shadow). */
export interface GroundEllipse {
  setPosition(worldX: number, worldY: number): void;
  setVisible(v: boolean): void;
  destroy(): void;
}

/** O que WorldObjects usa de World3D. */
export type WorldObjectsHost = Pick<World3D, 'activeRustles' | 'casts' | 'mirror' | 'scene' | 'shadows' | 'tiles'>;

export class WorldObjects {
  public constructor(private readonly host: WorldObjectsHost) {}

  public addBillboard(texKey: string, frame = 0, opts: Billboard3DOptions = {}): Billboard3D {
    const bb = new Billboard3D(this.host.scene, texKey, frame, opts);
    // Standing objects (a contact blob, or an explicit request) also throw a
    // firelight cast shadow — a ground silhouette driven each frame in render().
    // `castGroundShadow: false` opts OUT even with a blob: a FLOATING part (the robotic arm's
    // claw) keeps its contact blob, but the per-sprite silhouette assumes the caster STANDS at
    // its tile — for a part in the air the streak sprouts from the wrong place, and the owner
    // draws a projected silhouette of its own (see groundCastAt).
    if (
      (opts.groundShadow || opts.castGroundShadow) && opts.castGroundShadow !== false
      && !opts.flat && !opts.additive && !opts.emissive
    ) {
      const mesh = makeCastMesh();
      const sceneMat = mesh.material as THREE.Material;
      const maskMat = makeCastMaskMaterial();
      if (this.host.shadows.appliedMaskMode) {
        this.host.shadows.maskScene.add(mesh);
        mesh.material = maskMat;
      } else {
        this.host.scene.add(mesh);
      }
      this.host.casts.castCasters.push({ bb, mesh, sceneMat, maskMat, lastFire: null });
    }
    if (opts.reflected) this.host.mirror.addBody(bb.mesh);
    return bb;
  }

  /**
   * A soft dark contact blob on the ground (the 2D grounding ellipse). Radii in
   * tiles — keep them near-equal for a round blob; the camera tilt foreshortens
   * it into a natural ground ellipse.
   */
  public addGroundEllipse(rx: number, rz: number, alpha: number): GroundEllipse {
    const mesh = makeShadowBlob(rx, rz, alpha);
    this.host.scene.add(mesh);
    return {
      setPosition: (worldX, worldY) => { mesh.position.set(worldX, mesh.position.y, worldY); },
      setVisible: (v) => { mesh.visible = v; },
      destroy: () => {
        this.host.scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      },
    };
  }

  /** See Box3D. Size is in tiles (sizeH = height/thickness); skin is a flat colour or a
   *  pixel-art texture (the bridge's wood grain — see woodTexture.ts). */
  public addBox(
    sizeX: number,
    sizeH: number,
    sizeZ: number,
    skin: number | THREE.Texture,
    opts: BoxSkinOpts = {},
  ): Box3D {
    const geo = new THREE.BoxGeometry(sizeX, sizeH, sizeZ);
    if (opts.pixelTiled && typeof skin !== 'number') tileBoxUv(geo, sizeX, sizeH, sizeZ, skin, opts.uvShift);
    // transparent stays on even at alpha 1 so ghost previews and solid props share a material
    // shape (toggling `transparent` at runtime would force a shader recompile).
    //
    // `unlit` e a excecao, e ela existe para UMA coisa: o vao da escada. Buraco nao e superficie
    // — ele nao tem nada para a luz bater —, e um Lambert escuro somava ambiente, luar, fogueira
    // e tocha ate clarear. Um buraco que fica mais claro ao meio-dia deixa de ser buraco. Isto
    // NAO e um atalho de performance nem um jeito de "pintar" pecas: quem se pinta e superficie,
    // e superficie recebe luz.
    const mat = opts.unlit
      ? new THREE.MeshBasicMaterial(
        typeof skin === 'number' ? { color: skin, transparent: true } : { map: skin, transparent: true },
      )
      : new THREE.MeshLambertMaterial(
        typeof skin === 'number' ? { color: skin, transparent: true } : { map: skin, transparent: true },
      );
    if (!opts.unlit) patchPixelMaterial(mat, { quantize: true });
    const mesh = new THREE.Mesh(geo, mat);
    this.host.scene.add(mesh);

    const state = { x: 0, y: 0, elev: 0, alpha: 1, scaleY: 1, visible: true };
    const apply = (): void => {
      mesh.position.set(state.x, state.elev, state.y);
      mesh.scale.y = state.scaleY;
      mat.opacity = state.alpha;
      mesh.visible = state.visible && state.alpha > 0.004;
    };
    apply();

    const box: Box3D = {
      get x() { return state.x; },
      set x(v: number) { state.x = v; apply(); },
      get y() { return state.y; },
      set y(v: number) { state.y = v; apply(); },
      get elevation() { return state.elev; },
      set elevation(v: number) { state.elev = v; apply(); },
      get alpha() { return state.alpha; },
      set alpha(v: number) { state.alpha = v; apply(); },
      get scaleY() { return state.scaleY; },
      set scaleY(v: number) { state.scaleY = v; apply(); },
      setPosition(tileX: number, tileY: number) { state.x = tileX; state.y = tileY; apply(); return box; },
      setElevation(tiles: number) { state.elev = tiles; apply(); return box; },
      setAlpha(a: number) { state.alpha = a; apply(); return box; },
      setVisible(v: boolean) { state.visible = v; apply(); return box; },
      destroy: () => {
        this.host.scene.remove(mesh);
        geo.dispose();
        mat.dispose();
      },
    };
    return box;
  }

  /**
   * Low-poly prop geometry that needs to rotate as a real THREE hierarchy (the water wheel's
   * torus, spokes, paddles and axle). It uses the exact same quantized Lambert material as
   * `addBox`, so custom geometry receives the game's fire/moon lighting instead of looking like
   * a foreign smooth PBR model. Ownership of geometry/material stays with the caller.
   */
  public addLitMesh(geometry: THREE.BufferGeometry, skin: number | THREE.Texture): THREE.Mesh {
    const material = new THREE.MeshLambertMaterial(
      typeof skin === 'number'
        ? { color: skin, transparent: true, flatShading: true }
        : { map: skin, transparent: true, flatShading: true },
    );
    patchPixelMaterial(material, { quantize: true });
    const mesh = new THREE.Mesh(geometry, material);
    this.host.scene.add(mesh);
    return mesh;
  }

  /** Wobble the low-grass decor quad on this tile, exactly like the 2D rustle. */
  public rustleDecor(worldX: number, worldY: number): void {
    const key = `${worldX},${worldY}`;
    const vertStart = this.host.tiles.grassQuads.get(key);
    if (vertStart === undefined) return;
    this.host.activeRustles.set(key, { vertStart, x: worldX, z: worldY, t: 0 });
  }

  public updateRustles(dt: number): void {
    if (this.host.activeRustles.size === 0) return;
    const pos = this.host.tiles.decorGeo.attributes.position as THREE.BufferAttribute;
    const cycle = (TIMINGS.grassRustleDurationMs * 2) / 1000;

    for (const [key, r] of this.host.activeRustles) {
      r.t += dt / cycle;
      const done = r.t >= 1;
      // Yoyo with Sine.easeOut both ways, like the 2D tween.
      const half = done ? 0 : (r.t < 0.5 ? r.t * 2 : (1 - r.t) * 2);
      const k = Math.sin((half * Math.PI) / 2);
      const angle = (-8 * Math.PI / 180) * k;
      const sx = (1 - 0.12 * k) * 0.5;
      const sz = (1 + 0.08 * k) * 0.5;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      // Quad corners in build order: (-,-) (+,-) (+,+) (-,+)
      const corners: ReadonlyArray<readonly [number, number]> = [
        [-sx, -sz], [sx, -sz], [sx, sz], [-sx, sz],
      ];
      for (let i = 0; i < 4; i++) {
        const [lx, lz] = corners[i];
        pos.setX(r.vertStart + i, r.x + lx * cos - lz * sin);
        pos.setZ(r.vertStart + i, r.z + lx * sin + lz * cos);
      }
      if (done) this.host.activeRustles.delete(key);
    }
    pos.needsUpdate = true;
  }
}
