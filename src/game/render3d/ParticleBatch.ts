import * as THREE from 'three';

/**
 * TODAS AS PARTÍCULAS AMBIENTES NUM DRAW SÓ, E SEM `GL_POINTS`.
 *
 * Os quatro campos (brasas, poeira, vaga-lumes, névoa) eram quatro `THREE.Points`. Medido em Full
 * HD: escondê-los custava nada um a um, e escondê-los JUNTOS dava +20% de fps (122 → 145), com a
 * GPU parada no lugar e a CPU caindo 1,7ms. É o preço fixo de existir um draw de pontos: no Chrome
 * do Windows o WebGL roda no ANGLE sobre o Direct3D 11, que não tem ponto de tamanho variável — o
 * ANGLE emula cada `gl_PointSize`, e paga por isso a cada quadro em que algum ponto é desenhado.
 *
 * Aqui cada partícula é um QUAD instanciado que reproduz o ponto do three conta por conta:
 *
 *   · tamanho em pixels = `size × (altura/2) ÷ profundidade` (o `USE_SIZEATTENUATION` do
 *     `PointsMaterial`), preso a [1, 1024] como o `ALIASED_POINT_SIZE_RANGE` do driver;
 *   · o quadrado fica alinhado à tela, centrado no ponto projetado;
 *   · o quad é recortado na borda da tela como qualquer triângulo — é o que o ANGLE faz com o
 *     ponto emulado (medido: a regra do GL de sumir o ponto inteiro quando o centro sai da tela
 *     DOBRAVA a diferença contra o quadro antigo);
 *   · cor = cor do vértice × textura, alfa = alfa da textura, com a mesma inversão em y que o
 *     `map_particle_fragment` faz no `gl_PointCoord`.
 *
 * Conferido pixel a pixel contra os quatro `Points` no mesmo quadro: 0,09% dos pixels diferem, no
 * máximo 30/255, na borda dos sprites (a emulação do ANGLE rasteriza a borda do quadrado do seu
 * jeito) — invisível, e menor que o passo de um vaga-lume entre dois quadros.
 *
 * E juntar os quatro num draw não muda nada no quadro: todos usam a mesma textura e o blend
 * aditivo, que é comutativo — a ordem entre partículas nunca decidiu a cor de um pixel.
 *
 * Cada campo recebe uma FATIA (`subarray`) dos mesmos buffers, então quem os anima escreve em
 * `pos`/`col` exatamente como escrevia nos atributos de antes.
 */

export interface ParticleField {
  pos: Float32Array;
  col: Float32Array;
  mark(): void;
}

const VERTEX = /* glsl */ `
  uniform float uScale;
  uniform vec2 uViewport;
  attribute vec3 iPos;
  attribute vec3 iCol;
  attribute float iSize;
  varying vec3 vColor;
  varying vec2 vUv;
  void main() {
    vColor = iCol;
    vUv = position.xy + 0.5;
    vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
    vec4 clip = projectionMatrix * mv;
    // Atrás da câmera o tamanho não tem sentido (profundidade negativa): fora.
    if (clip.w <= 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    float px = clamp(iSize * (uScale / -mv.z), 1.0, 1024.0);
    clip.xy += position.xy * px * 2.0 / uViewport * clip.w;
    gl_Position = clip;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  varying vec3 vColor;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(map, vUv);
    gl_FragColor = vec4(vColor * t.rgb, t.a);
  }
`;

export class ParticleBatch {
  public readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly posAttr: THREE.InstancedBufferAttribute;
  private readonly colAttr: THREE.InstancedBufferAttribute;
  private readonly viewSize = new THREE.Vector2();
  private used = 0;

  public constructor(parent: THREE.Object3D, capacity: number, map: THREE.Texture) {
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(
      [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3,
    ));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.posAttr = new THREE.InstancedBufferAttribute(this.pos, 3);
    this.colAttr = new THREE.InstancedBufferAttribute(this.col, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.posAttr);
    geo.setAttribute('iCol', this.colAttr);
    geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(this.size, 1));
    geo.instanceCount = capacity;

    const uniforms = {
      map: { value: map },
      uScale: { value: 1 },
      uViewport: { value: new THREE.Vector2(1, 1) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      fog: false,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    // As posições andam na CPU: os bounds da geometria-base não dizem nada sobre onde elas estão.
    this.mesh.frustumCulled = false;
    // O `scale` do three é a altura do canvas / 2 (`refreshUniformsPoints`); o alvo do compositor
    // tem o mesmo tamanho, e a viewport é o que converte pixel em espaço de recorte.
    this.mesh.onBeforeRender = (renderer) => {
      renderer.getSize(this.viewSize);
      uniforms.uScale.value = this.viewSize.y * 0.5;
      uniforms.uViewport.value.copy(this.viewSize);
    };
    parent.add(this.mesh);
  }

  /** Reserva `count` partículas de tamanho `size` (unidades de mundo, como `PointsMaterial.size`). */
  public field(count: number, size: number): ParticleField {
    const start = this.used;
    this.used += count;
    if (this.used > this.size.length) throw new Error('ParticleBatch: capacidade estourada');
    this.size.fill(size, start, start + count);
    return {
      pos: this.pos.subarray(start * 3, (start + count) * 3),
      col: this.col.subarray(start * 3, (start + count) * 3),
      mark: () => {
        this.posAttr.needsUpdate = true;
        this.colAttr.needsUpdate = true;
      },
    };
  }

  public dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
