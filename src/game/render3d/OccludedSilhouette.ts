import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { getTexture3D } from '@/game/render3d/textures3d';

/**
 * O HERÓI ATRÁS DA SERRA: uma segunda passada do sprite que só desenha onde o corpo está ESCONDIDO, com
 * o contorno claro e o desenho translúcido por dentro, exatamente na forma do pedaço coberto.
 *
 * É a técnica clássica do teste de profundidade invertido: o quad normal passa onde está à frente do que
 * já foi desenhado, e este passa onde está ATRÁS (`GreaterDepth`), sem escrever profundidade.
 *
 * ── Por que renderOrder negativo ──
 * Paredes da serra e árvores são malhas opacas, desenhadas antes de todo sprite, e os sprites são
 * transparentes. Desenhada antes dos outros transparentes, a silhueta só enxerga o terreno: o item nas
 * costas do herói, que fica mais perto da câmera quando ele olha para o norte, não a dispara. O preço é que
 * casas, NPCs e outros sprites não contam como obstáculo.
 *
 * ── Por que polygonOffset ──
 * O pé do quad encosta no chão, e sem esta folga a última linha de pixels piscaria no empate de profundidade.
 */

const VERTEX = /* glsl */ `
  uniform vec2 uOffset;
  uniform vec2 uRepeat;
  varying vec2 vAtlas;
  void main() {
    vAtlas = uv * uRepeat + uOffset;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec2 uOffset;
  uniform vec2 uRepeat;
  uniform vec2 uSize;
  uniform vec3 uLine;
  uniform float uOpacity;
  varying vec2 vAtlas;

  // Pixel de arte inteiro, e fora do frame conta como vazio: a folha tem outro frame encostado.
  float solidAt(vec2 texel, vec2 lo, vec2 hi) {
    if (texel.x < lo.x || texel.y < lo.y || texel.x >= hi.x || texel.y >= hi.y) return 0.0;
    return step(0.5, texture2D(uMap, (texel + 0.5) / uSize).a);
  }

  void main() {
    vec2 lo = floor(uOffset * uSize + 0.5);
    vec2 hi = floor((uOffset + uRepeat) * uSize + 0.5);
    vec2 texel = floor(vAtlas * uSize);
    vec4 art = texture2D(uMap, (texel + 0.5) / uSize);
    if (art.a < 0.5) discard;
    float around = solidAt(texel + vec2(1.0, 0.0), lo, hi) * solidAt(texel - vec2(1.0, 0.0), lo, hi)
      * solidAt(texel + vec2(0.0, 1.0), lo, hi) * solidAt(texel - vec2(0.0, 1.0), lo, hi);
    // A borda é o contorno; o miolo é o próprio desenho, clareado e translúcido.
    vec3 body = mix(art.rgb, uLine, 0.12);
    gl_FragColor = vec4(mix(uLine, body, around), mix(0.95, 0.68, around) * uOpacity);
    #include <colorspace_fragment>
  }
`;

const LINE_COLOR = 0xf5efdc;
/** Antes dos sprites, e depois do opaco: ver o comentário do arquivo. */
const RENDER_ORDER = -1;

export class OccludedSilhouette {
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private key = '';
  private frame = -1;

  public constructor(private readonly body: Billboard3D) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uMap: { value: null },
        uOffset: { value: new THREE.Vector2() },
        uRepeat: { value: new THREE.Vector2(1, 1) },
        uSize: { value: new THREE.Vector2(1, 1) },
        uLine: { value: new THREE.Color(LINE_COLOR) },
        uOpacity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(body.mesh.geometry, this.material);
    this.mesh.renderOrder = RENDER_ORDER;
    // Filho do quad: posição, escala, espelhamento e giro vêm dele, e some junto quando ele some.
    body.mesh.add(this.mesh);
    this.sync();
  }

  /** Chamar depois de mexer no quad: acompanha o quadro da animação e o quanto o corpo existe. */
  public sync(): void {
    const { body } = this;
    this.material.uniforms.uOpacity.value = body.alpha;
    if (body.texKey === this.key && body.frame === this.frame) return;
    this.key = body.texKey;
    this.frame = body.frame;
    const tex = getTexture3D(body.texKey, body.frame);
    const image = tex.image as { width: number; height: number };
    const { uniforms } = this.material;
    uniforms.uMap.value = tex;
    (uniforms.uOffset.value as THREE.Vector2).copy(tex.offset);
    (uniforms.uRepeat.value as THREE.Vector2).copy(tex.repeat);
    (uniforms.uSize.value as THREE.Vector2).set(image.width, image.height);
  }

  public destroy(): void {
    this.mesh.removeFromParent();
    this.material.dispose();
  }
}
