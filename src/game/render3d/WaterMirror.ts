import * as THREE from 'three';

import {
  reflectionMapUniform, reflectionMatrixUniform, reflectionOnUniform, reflectionTexelUniform,
} from './pixelArtLight';
import type { CullView } from './sceneCull';

/** Os baldes de água têm 8×8 tiles (x >> 3); a chave recebe as coordenadas JÁ divididas. */
const WATER_BUCKET_SHIFT = 3;
const waterBucketKey = (bx: number, bz: number): number => (bx + 1024) * 4096 + (bz + 1024);

type Rect = { x0: number; y0: number; x1: number; y1: number };
/** O alvo inteiro: o próximo espelho limpa tudo. */
const everything = (): Rect => ({ x0: 0, y0: 0, x1: Number.POSITIVE_INFINITY, y1: Number.POSITIVE_INFINITY });

/**
 * O ESPELHO D'ÁGUA: os personagens desenhados por uma câmera espelhada no plano da água, num alvo
 * que o mar e o rio amostram (pixelArtLight.WATER_REFLECT_GLSL). A técnica é a do `Reflector` do
 * three, com o recorte oblíquo do Lengyel ("Oblique View Frustum Depth Projection and Clipping"):
 *
 *   1. a câmera virtual é a do jogo refletida no plano y = `planeY` — posição, direção de
 *      visão e "para cima" espelhados — e olha o mundo de baixo da água;
 *   2. `uReflMatrix` leva um ponto do mundo ao UV desse alvo (bias · projeção · vista virtual):
 *      cada fragmento de água pergunta "o que a câmera virtual vê através de mim", que é
 *      exatamente o que a água de verdade devolve ao olho;
 *   3. o plano próximo da projeção virtual é inclinado até o plano da água, para que nada ABAIXO
 *      dela entre no reflexo (com a câmera embaixo, o chão ficaria entre ela e o herói).
 *
 * Barato porque desenha quase nada: só os corpos marcados `reflected` perto da tela, e só quando
 * há água à vista. As luzes vão TODAS para a lista, sempre — o three assa a contagem de luzes na
 * chave do programa, e uma passada com menos luzes compilaria o herói de novo (a lei do pool).
 */
export class WaterMirror {
  private target!: THREE.WebGLRenderTarget;
  private readonly mirror = new THREE.PerspectiveCamera();
  /** Os corpos que aparecem na água (Billboard3DOptions.reflected). Saem sozinhos ao morrer. */
  private readonly bodies = new Set<THREE.Object3D>();
  /** A lista de filhos da passada do espelho: as luzes (todas) + os corpos. */
  private readonly kept: THREE.Object3D[] = [];
  /** Os baldes de 8×8 tiles que têm ÁGUA (rio ou mar) — a passada só roda com um à vista. */
  private readonly waterBuckets = new Set<number>();
  private readonly scratch = {
    pos: new THREE.Vector3(), dir: new THREE.Vector3(), up: new THREE.Vector3(),
    plane: new THREE.Plane(), clip: new THREE.Vector4(), q: new THREE.Vector4(), clear: new THREE.Color(),
  };
  /** O que o alvo pode ter de não-transparente: o retângulo do último desenho. */
  private dirty: Rect = everything();
  private readonly corner = new THREE.Vector3();

  /**
   * `view` é a área de chão visível do último quadro (o objeto do GroundLightMap, atualizado no lugar); `planeY`, a
   * altura do plano do espelho.
   */
  public constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly view: CullView,
    private readonly planeY: number,
  ) {}

  /**
   * O alvo do ESPELHO é um clone do alvo do compositor, e não um alvo "qualquer": o three assa o
   * color space do alvo na chave do programa, e o ANGLE só termina o executável no primeiro draw
   * num FORMATO de saída — mesmo formato, mesmo programa, nenhuma compilação no meio do jogo.
   * NEAREST e do tamanho do quadro: um pixel do reflexo é um pixel do mundo.
   */
  public createTarget(composerTarget: THREE.WebGLRenderTarget, w: number, h: number): void {
    this.target = composerTarget.clone();
    this.target.texture.minFilter = THREE.NearestFilter;
    this.target.texture.magFilter = THREE.NearestFilter;
    this.target.texture.generateMipmaps = false;
    this.target.setSize(w, h);
    reflectionMapUniform.value = this.target.texture;
    reflectionTexelUniform.value.set(1 / w, 1 / h);
  }

  /** O quadro mudou de tamanho: o alvo acompanha, e o próximo espelho limpa tudo. */
  public resize(w: number, h: number): void {
    this.target.setSize(w, h);
    this.dirty = everything();
    reflectionTexelUniform.value.set(1 / w, 1 / h);
  }

  /** Um corpo que aparece na água (ele sai da lista sozinho quando sai da cena). */
  public addBody(mesh: THREE.Object3D): void {
    this.bodies.add(mesh);
  }

  /** Este tile é água (rio ou mar): o balde dele conta como "água à vista". */
  public addWaterTile(x: number, z: number): void {
    this.waterBuckets.add(waterBucketKey(x >> WATER_BUCKET_SHIFT, z >> WATER_BUCKET_SHIFT));
  }

  /** O terreno foi refeito: a água volta a ser marcada por ele. */
  public clearWater(): void {
    this.waterBuckets.clear();
  }

  /**
   * O desenho de aquecimento (World3D.prewarmShaders) usa o alvo do espelho inteiro: sem recorte, e sem a água amostrar
   * o alvo em que se desenha (é um laço de realimentação, e o WebGL recusa o draw). `afterWarm` desfaz.
   */
  public warmTarget(): THREE.WebGLRenderTarget {
    reflectionMapUniform.value = null;
    this.target.scissorTest = false;
    return this.target;
  }

  /** O aquecimento sujou o alvo inteiro: o próximo espelho limpa tudo. */
  public afterWarm(): void {
    reflectionMapUniform.value = this.target.texture;
    this.dirty = everything();
  }

  /** Uma passada do espelho (com `strength` ≈ 0 nada é desenhado e a água não reflete). */
  public render(strength: number): void {
    const kept = this.kept;
    kept.length = 0;
    let bodies = 0;
    if (strength > 0.001 && this.waterInView()) {
      for (const o of this.scene.children) {
        if ((o as THREE.Light).isLight) kept.push(o);
      }
      const v = this.view;
      for (const m of this.bodies) {
        if (!m.parent) { this.bodies.delete(m); continue; } // o corpo morreu
        const x = m.position.x;
        const z = m.position.z;
        // Perto do que a câmera mostra (a área de chão visível, mais 2 tiles de folga).
        if (!m.visible || !(x >= v.minX - 2 && x <= v.maxX + 2 && z >= v.minZ - 2 && z <= v.maxZ + 2)) continue;
        kept.push(m);
        bodies++;
      }
    }
    reflectionOnUniform.value = bodies > 0 ? 1 : 0;
    if (bodies === 0) return;

    // ── 1. a câmera virtual ──
    const s = this.scratch;
    const cam = this.camera;
    const mirror = this.mirror;
    const h = this.planeY;
    cam.updateMatrixWorld();
    s.pos.setFromMatrixPosition(cam.matrixWorld);
    s.dir.set(0, 0, -1).transformDirection(cam.matrixWorld);
    s.up.set(0, 1, 0).transformDirection(cam.matrixWorld);
    mirror.position.set(s.pos.x, 2 * h - s.pos.y, s.pos.z);
    mirror.up.set(s.up.x, -s.up.y, s.up.z);
    mirror.lookAt(s.pos.x + s.dir.x, 2 * h - (s.pos.y + s.dir.y), s.pos.z + s.dir.z);
    mirror.far = cam.far;
    mirror.updateMatrixWorld();
    mirror.projectionMatrix.copy(cam.projectionMatrix);
    mirror.projectionMatrixInverse.copy(cam.projectionMatrixInverse);

    // ── 2. mundo → UV do alvo (antes do recorte: ele só mexe na linha do z) ──
    reflectionMatrixUniform.value
      .set(
        0.5, 0.0, 0.0, 0.5,
        0.0, 0.5, 0.0, 0.5,
        0.0, 0.0, 0.5, 0.5,
        0.0, 0.0, 0.0, 1.0,
      )
      .multiply(mirror.projectionMatrix)
      .multiply(mirror.matrixWorldInverse);

    // ── 3. o plano próximo deitado na água (Lengyel; o mesmo código do Reflector) ──
    s.plane.set(s.up.set(0, 1, 0), -h).applyMatrix4(mirror.matrixWorldInverse);
    s.clip.set(s.plane.normal.x, s.plane.normal.y, s.plane.normal.z, s.plane.constant);
    const e = mirror.projectionMatrix.elements;
    s.q.set(
      (Math.sign(s.clip.x) + e[8]) / e[0],
      (Math.sign(s.clip.y) + e[9]) / e[5],
      -1.0,
      (1.0 + e[10]) / e[14],
    );
    s.clip.multiplyScalar(2.0 / s.clip.dot(s.q));
    e[2] = s.clip.x;
    e[6] = s.clip.y;
    e[10] = s.clip.z + 1.0;
    e[14] = s.clip.w;

    // ── o recorte: só o retângulo onde os corpos caem (e onde caíram no quadro anterior) ──
    // O alvo tem o tamanho do quadro, e limpá-lo inteiro (duas vezes: o clear e o autoClear do render) para desenhar
    // meia dúzia de corpos era quase todo o custo do espelho na GPU. Fora do retângulo de agora e do anterior o alvo
    // JÁ está transparente (foi limpo quando algo esteve lá), então limpar e desenhar só a união dá o mesmo alvo,
    // pixel a pixel, que a limpeza inteira dava. Um corpo atrás da câmera (ou o primeiro uso, ou um alvo novo) limpa
    // tudo.
    const target = this.target;
    const tw = target.width;
    const th = target.height;
    const now = this.bodiesRect(kept, mirror, tw, th);
    const was = this.dirty;
    const x0 = Math.max(0, Math.min(now.x0, was.x0));
    const y0 = Math.max(0, Math.min(now.y0, was.y0));
    const x1 = Math.min(tw, Math.max(now.x1, was.x1));
    const y1 = Math.min(th, Math.max(now.y1, was.y1));
    this.dirty = now;
    target.scissor.set(x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0));
    target.scissorTest = true;

    // ── o desenho: só a lista, sem o céu, sobre transparente ──
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    r.getClearColor(s.clear);
    const prevAlpha = r.getClearAlpha();
    const all = this.scene.children;
    const background = this.scene.background;
    this.scene.children = kept;
    this.scene.background = null;
    r.setRenderTarget(target);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(this.scene, mirror);
    this.scene.children = all;
    this.scene.background = background;
    r.setRenderTarget(prevTarget);
    r.setClearColor(s.clear, prevAlpha);
  }

  /**
   * O retângulo, em pixels do alvo (origem embaixo, como o scissor do GL), que cobre todos os corpos do espelho: os
   * 8 cantos da caixa de cada um, projetados pela câmera virtual (o recorte oblíquo só mexe na linha do z, então o
   * x e o y da tela são os da projeção comum), com 2 px de folga. Um canto atrás da câmera devolve o alvo inteiro.
   */
  private bodiesRect(kept: THREE.Object3D[], mirror: THREE.PerspectiveCamera, tw: number, th: number): Rect {
    const full = { x0: 0, y0: 0, x1: tw, y1: th };
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    const v = this.corner;
    const view = mirror.matrixWorldInverse.elements;
    for (const o of kept) {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) continue;
      const geo = m.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      const box = geo.boundingBox;
      if (!box) return full;
      m.updateMatrixWorld();
      for (let c = 0; c < 8; c++) {
        v.set(c & 1 ? box.max.x : box.min.x, c & 2 ? box.max.y : box.min.y, c & 4 ? box.max.z : box.min.z)
          .applyMatrix4(m.matrixWorld);
        // Atrás da câmera (z de vista >= 0): a projeção vira do avesso — o alvo inteiro.
        if (view[2] * v.x + view[6] * v.y + view[10] * v.z + view[14] >= 0) return full;
        v.project(mirror);
        const px = (v.x * 0.5 + 0.5) * tw;
        const py = (v.y * 0.5 + 0.5) * th;
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (py < y0) y0 = py;
        if (py > y1) y1 = py;
      }
    }
    if (x0 > x1) return { x0: 0, y0: 0, x1: 0, y1: 0 };
    return {
      x0: Math.max(0, Math.floor(x0) - 2),
      y0: Math.max(0, Math.floor(y0) - 2),
      x1: Math.min(tw, Math.ceil(x1) + 2),
      y1: Math.min(th, Math.ceil(y1) + 2),
    };
  }

  /** Há água (rio ou mar) na área de chão visível do último quadro? Uma consulta por balde 8×8. */
  private waterInView(): boolean {
    const v = this.view;
    if (!Number.isFinite(v.minX) || this.waterBuckets.size === 0) return false;
    const bx0 = Math.floor(v.minX) >> WATER_BUCKET_SHIFT;
    const bx1 = Math.floor(v.maxX) >> WATER_BUCKET_SHIFT;
    const bz0 = Math.floor(v.minZ) >> WATER_BUCKET_SHIFT;
    const bz1 = Math.floor(v.maxZ) >> WATER_BUCKET_SHIFT;
    for (let bx = bx0; bx <= bx1; bx++) {
      for (let bz = bz0; bz <= bz1; bz++) {
        if (this.waterBuckets.has(waterBucketKey(bx, bz))) return true;
      }
    }
    return false;
  }
}
