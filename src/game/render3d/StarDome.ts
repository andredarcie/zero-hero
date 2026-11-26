// O CÉU DE ESTRELAS: uma cúpula em volta da câmera, só para as cenas que olham para cima (a primeira noite no
// acampamento, ver entities/StarGaze). O jogo olha o chão de cima e nunca precisou de céu: o fundo é a cor do fog.
//
// Tudo sai da DIREÇÃO do pixel, sem textura: três camadas de estrelas numa grade de cubo (a poeira de estrelas fracas,
// as médias e as poucas fortes, com a cor da temperatura de cada uma e a cintilação), a Via Láctea (uma faixa num
// grande círculo, com nuvens e a fenda escura de poeira no meio), o brilho do ar perto do horizonte e a estrela
// cadente (uma cabeça esverdeada e a cauda alaranjada correndo um arco do céu). O horizonte é a cor do fog: o chão
// distante some nele sem emenda.
//
// O tamanho de cada estrela é medido em PIXEL (fwidth da direção): no buffer baixo do pixel art ela é um ponto, e não
// pisca quando a câmera gira devagar.

import * as THREE from 'three';

/** Dentro do plano distante da câmera (120): a cúpula inteira é desenhada. */
const RADIUS = 90;

const VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * O CÉU ESTRELADO, em GLSL: a Via Láctea e as três camadas de estrelas na direção `d`, mais o azul do ar da noite
 * (`zhNightAir`). É UM SÓ para o jogo inteiro (pedido do autor, 2026-11-20: "o céu estrelado na praia tem que ser o
 * mesmo de quando o herói dorme e a câmera sobe"): a cúpula da primeira noite (aqui embaixo) e o céu do mar
 * (render3d/SeaSky) chamam as MESMAS funções — as mesmas estrelas nos mesmos lugares, a mesma faixa da Via Láctea.
 * Estrela nova, cor ou cintilação se muda AQUI, nunca numa cópia.
 */
export const STAR_SKY_GLSL = /* glsl */ `
  vec4 zhHash43(vec3 p) {
    vec4 p4 = fract(vec4(p.xyzx) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
    p4 += dot(p4, p4.wzxy + 33.33);
    return fract((p4.xxyz + p4.yzzw) * p4.zywx);
  }
  float zhHash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  float zhNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = mix(zhHash13(i), zhHash13(i + vec3(1, 0, 0)), f.x);
    float b = mix(zhHash13(i + vec3(0, 1, 0)), zhHash13(i + vec3(1, 1, 0)), f.x);
    float c = mix(zhHash13(i + vec3(0, 0, 1)), zhHash13(i + vec3(1, 0, 1)), f.x);
    float d = mix(zhHash13(i + vec3(0, 1, 1)), zhHash13(i + vec3(1, 1, 1)), f.x);
    return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
  }
  float zhFbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * zhNoise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  // A cor de uma estrela pela temperatura: a maioria branca, algumas quentes (laranja), poucas azuladas.
  vec3 starTint(float t) {
    if (t < 0.07) return vec3(1.0, 0.74, 0.52);
    if (t < 0.3) return vec3(1.0, 0.92, 0.8);
    if (t < 0.88) return vec3(0.94, 0.96, 1.0);
    return vec3(0.74, 0.85, 1.0);
  }

  // Uma camada de estrelas: no máximo uma por célula de uma grade de cubo, longe da borda da célula (a estrela nunca
  // é cortada por ela). 'pix' é o tamanho de um pixel em unidades da face.
  vec3 starLayer(vec3 d, float cells, float density, float bright, float seed, float pix, float time) {
    vec3 a = abs(d);
    vec2 uv;
    float face;
    if (a.x >= a.y && a.x >= a.z) { uv = d.zy / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
    else if (a.y >= a.z) { uv = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
    else { uv = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }
    vec2 g = (uv * 0.5 + 0.5) * cells;
    vec2 cell = floor(g);
    vec4 h = zhHash43(vec3(cell, face * 17.0 + seed));
    if (h.x > density) return vec3(0.0);
    vec2 q = (g - cell - 0.2 - 0.6 * h.yz) / max(pix * (1.0 + dot(uv, uv)) * cells * 0.5, 1e-5);
    float m = pow(h.w, 5.0);
    float tw = 1.0 + (0.35 - 0.2 * m) * sin(time * (1.3 + 3.6 * h.y) + h.z * 41.0);
    float sigma = 0.42 + 0.6 * m;
    float glow = exp(-dot(q, q) / (2.0 * sigma * sigma));
    if (m > 0.3) {
      float arm = 1.4 + 3.2 * m;
      glow += (exp(-q.y * q.y * 3.0) * max(0.0, 1.0 - abs(q.x) / arm)
        + exp(-q.x * q.x * 3.0) * max(0.0, 1.0 - abs(q.y) / arm)) * 0.32 * m;
    }
    return starTint(fract(h.y * 7.31 + h.w * 3.7)) * bright * (0.1 + 0.9 * m) * tw * glow;
  }

  // O AR DA NOITE sobre a cor do horizonte ('base', a do fog): junto dele, o brilho do ar (um azul fundo, o mesmo da
  // névoa da beira do mundo); no zênite, quase preto. 'e' é a altura da direção (d.y).
  vec3 zhNightAir(vec3 base, float e) {
    vec3 horizon = base + vec3(0.012, 0.02, 0.05);
    vec3 zenith = base + vec3(0.0015, 0.002, 0.007);
    return e < 0.0 ? horizon : mix(horizon, zenith, smoothstep(0.0, 0.35, e));
  }

  // A luz das estrelas na direção 'd' (soma-se ao céu): a Via Láctea e as três camadas. 'pix' é o tamanho de um pixel
  // (o fwidth da direção, medido por quem chama, fora de qualquer desvio) e 'time' o relógio da cintilação.
  vec3 zhStarSky(vec3 d, float pix, float time) {
    // A Via Láctea: uma faixa larga e fraca, um miolo mais claro, nuvens, e a fenda de poeira correndo no meio. Ela
    // sobe do horizonte norte, de baixo à esquerda para cima à direita.
    vec3 bandN = normalize(vec3(0.637, -0.704, -0.314));
    float bl = dot(d, bandN);
    float clouds = zhFbm(d * 5.0 + 3.1);
    float knots = zhFbm(d * 14.0 - 2.3);
    float rift = smoothstep(0.4, 0.7, zhFbm(d * 9.0 + 9.7)) * exp(-(bl + 0.01) * (bl + 0.01) / 0.0022);
    float band = (exp(-bl * bl / 0.06) * 0.35 + exp(-bl * bl / 0.008) * 0.65) * (0.25 + clouds * 0.9 + knots * 0.35);
    band *= 1.0 - 0.85 * rift;
    // O ar apaga as estrelas só bem rente ao horizonte (cheias a ~5° de altura; eram ~9°): a praia só enxerga os
    // primeiros 16° de céu acima do mar, e com o apagado largo metade dessa faixa saía quase vazia.
    float sky = smoothstep(0.0, 0.09, d.y);
    vec3 light = mix(vec3(0.36, 0.4, 0.55), vec3(0.66, 0.58, 0.48), clouds) * band * 0.2;

    // As estrelas: a poeira das fracas mora quase toda na faixa; as médias e as fortes, pelo céu inteiro. Perto do
    // horizonte o ar apaga as fracas.
    light += starLayer(d, 300.0, 0.06 + 0.7 * band, 0.14, 1.0, pix, time)
      + starLayer(d, 120.0, 0.13, 0.5, 2.0, pix, time)
      + starLayer(d, 36.0, 0.11, 1.45, 3.0, pix, time);
    return light * sky;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uLevel;
  uniform vec3 uSky;
  uniform float uTime;
  uniform vec3 uMeteorA;
  uniform vec3 uMeteorB;
  uniform float uMeteorT;
  varying vec3 vDir;
  ${STAR_SKY_GLSL}

  void main() {
    vec3 d = normalize(vDir);
    float pix = max(length(fwidth(d)), 1e-5);
    float e = d.y;

    vec3 col = zhNightAir(uSky, e) + zhStarSky(d, pix, uTime);

    // A estrela cadente: a cabeça percorre o arco de A a B (uMeteorT de 0 a 1), acende e se apaga no caminho.
    if (uMeteorT >= 0.0) {
      vec3 n = normalize(cross(uMeteorA, uMeteorB));
      float total = acos(clamp(dot(uMeteorA, uMeteorB), -1.0, 1.0));
      float off = asin(clamp(dot(d, n), -1.0, 1.0));
      vec3 dp = normalize(d - n * dot(d, n));
      float s = atan(dot(dp, cross(n, uMeteorA)), dot(dp, uMeteorA)) / total;
      float behind = uMeteorT - s;
      float tail = 0.32;
      if (behind > -0.01 && behind < tail) {
        float k = 1.0 - clamp(behind, 0.0, tail) / tail;
        float w = pix * (0.7 + 0.8 * k);
        float line = exp(-off * off / (2.0 * w * w)) * k * k;
        float head = exp(-(off * off + behind * behind * total * total) / (2.0 * pix * pix * 1.6));
        float flare = smoothstep(0.0, 0.18, uMeteorT) * (1.0 - smoothstep(0.7, 1.0, uMeteorT));
        col += (mix(vec3(1.0, 0.62, 0.36), vec3(0.8, 1.0, 0.86), k) * line * 1.3 + vec3(0.9, 1.0, 0.92) * head * 2.2) * flare;
      }
    }

    gl_FragColor = vec4(mix(uSky, col, uLevel), 1.0);
  }
`;

/** A cúpula de cada cena: nasce no aquecimento dos shaders (ShaderPrewarm) e fica escondida até alguém olhar o céu. */
const domes = new WeakMap<THREE.Scene, StarDome>();

export const starDomeFor = (scene: THREE.Scene): StarDome => {
  let dome = domes.get(scene);
  if (!dome) {
    dome = new StarDome(scene);
    domes.set(scene, dome);
  }
  return dome;
};

export class StarDome {
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly uniforms = {
    uLevel: { value: 0 },
    uSky: { value: new THREE.Color(0, 0, 0) },
    uTime: { value: 0 },
    uMeteorA: { value: new THREE.Vector3(0, 1, 0) },
    uMeteorB: { value: new THREE.Vector3(1, 0, 0) },
    uMeteorT: { value: -1 },
  };

  public constructor(scene: THREE.Scene) {
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 48, 24), this.material);
    // O primeiro desenhado: o chão, as árvores e o herói pintam por cima (ela não escreve profundidade).
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Na cena só enquanto alguém olha o céu. Escondida ela não custa nada, e o programa dela fica compilado. */
  public show(on: boolean): void {
    this.mesh.visible = on;
    if (!on) this.uniforms.uMeteorT.value = -1;
  }

  /** O quanto do céu estrelado aparece (0 = só a cor do fog, como sem cúpula). */
  public set level(v: number) {
    this.uniforms.uLevel.value = Math.min(1, Math.max(0, v));
  }

  /** A cúpula acompanha a câmera (as estrelas estão no infinito), e o horizonte a cor do fog deste quadro. */
  public update(camera: THREE.Camera, sky: THREE.Color, timeS: number): void {
    this.mesh.position.copy(camera.position);
    this.uniforms.uSky.value.copy(sky);
    this.uniforms.uTime.value = timeS;
  }

  /** A estrela cadente vai de `from` a `to` (direções); `t` de 0 a 1 é onde a cabeça está, e negativo a apaga. */
  public meteor(from: THREE.Vector3, to: THREE.Vector3, t: number): void {
    this.uniforms.uMeteorA.value.copy(from).normalize();
    this.uniforms.uMeteorB.value.copy(to).normalize();
    this.uniforms.uMeteorT.value = t;
  }

}
