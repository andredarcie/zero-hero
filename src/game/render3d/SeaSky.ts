// O CÉU DO MAR — a cúpula que a câmera do mirante mostra (objects/beach/SeaVista).
//
// O jogo olha o chão de cima e o horizonte nunca entra no quadro (atmosphere.ts conta por quê): o fundo é a cor do fog.
// Na praia do norte a câmera baixa até o horizonte, e ali tem de haver céu. Esta cúpula é esse céu, e ele acompanha a
// HORA DO JOGO, com a luz que o mundo já tem (nenhuma luz nova: a direção é a da própria direcional):
//
//   · de DIA, o azul que clareia até a bruma do horizonte, com cúmulos baixos sobre o mar;
//   · na HORA DOURADA, o azul fundo no alto, o rosa no meio e o pêssego embaixo, e as nuvens acesas por baixo;
//   · de NOITE, o MESMO céu estrelado da primeira noite no acampamento (StarDome.STAR_SKY_GLSL: o ar azul junto do
//     horizonte, a Via Láctea e as três camadas de estrelas — pedido do autor, 2026-11-20), mais a lua e as nuvens daqui;
//   · e o ASTRO: o sol nasce no MAR (neste vale o sol nasce ao norte e se põe ao sul, atrás de quem olha — é a mesma
//     conta que deita as sombras, WorldLook.applySky), e a lua mergulha nele antes do amanhecer.
//
// O HORIZONTE É A COR DO FOG, de propósito e sempre: o mar some na bruma antes do fim do mundo, e a cúpula começa na
// mesma cor — não há emenda para esconder.
//
// É PIXEL ART: o degradê sai em faixas com retícula (a matriz de Bayer no pixel do buffer, que é o pixel desenhado), as
// nuvens em três tons chapados, o sol num disco de borda dura com dois anéis. Nada de degradê liso.

import * as THREE from 'three';
import { STAR_SKY_GLSL } from './StarDome';

/** Dentro do plano distante da câmera (120), como a cúpula de estrelas. */
const RADIUS = 92;

const VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // No PLANO DISTANTE (profundidade 1, a da limpeza): com o teste de profundidade, a cúpula só pinta onde nada foi
    // desenhado — ver o construtor.
    gl_Position.z = gl_Position.w;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uLevel;
  uniform vec3 uFog;
  uniform vec3 uSun;        // o rumo do astro (unitário); y < 0 = abaixo do horizonte
  uniform float uDay;       // 0 noite … 1 dia
  uniform float uGolden;    // 1 com o sol rente ao horizonte
  uniform float uEve;       // 0 de manhã, 1 de tarde: o sol rente da manhã é rosa, o da tarde é pêssego e fogo
  uniform float uTime;
  uniform float uDrift;     // o quanto as nuvens já andaram (corre junto com o tempo do jogo: sentado, depressa)
  uniform vec3 uZenDay; uniform vec3 uMidDay; uniform vec3 uLowDay;
  uniform vec3 uZenGold; uniform vec3 uMidGold; uniform vec3 uLowGold;
  uniform vec3 uZenDawn; uniform vec3 uMidDawn; uniform vec3 uLowDawn;
  uniform vec3 uCloudLit; uniform vec3 uCloudGold; uniform vec3 uCloudShade; uniform vec3 uCloudDusk; uniform vec3 uCloudNight;
  uniform vec3 uCloudDawn; uniform vec3 uCloudDawnShade;
  uniform vec3 uSunDay; uniform vec3 uSunLow; uniform vec3 uSunDawn; uniform vec3 uMoon;
  varying vec3 vDir;
  ${STAR_SKY_GLSL}

  float zkHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float zkNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(zkHash(i), zkHash(i + vec2(1.0, 0.0)), f.x), mix(zkHash(i + vec2(0.0, 1.0)), zkHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float zkFbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * zkNoise(p); p = p * 2.03 + 7.1; a *= 0.5; }
    return v;
  }
  // A DENSIDADE DOS CÚMULOS no céu, no rumo d (elevação e): o campo mora numa camada plana sobre o mar, torcido por ele
  // mesmo (é o que faz a borda em couve-flor, e não em mancha de tinta), mais denso perto do horizonte e sumindo no alto.
  float zkCumulus(vec3 d, float e) {
    if (e <= 0.0) return 0.0;
    vec2 p = d.xz / (e + 0.11) * 0.62 + vec2(uDrift * 0.035, uDrift * 0.006);
    vec2 warp = vec2(zkFbm(p * 0.7 + 3.1), zkFbm(p * 0.7 + 8.7)) - 0.5;
    float n = zkFbm(p * vec2(1.0, 1.6) + warp * 1.4);
    // as bolotas: um ruído mais fino só pesa na borda, onde a nuvem decide se continua
    n += (zkNoise(p * 5.3 + warp * 3.0) - 0.5) * 0.09;
    float band = smoothstep(0.008, 0.05, e) * (1.0 - smoothstep(0.24, 0.42, e));
    return (n - 0.5) * band;
  }

  // A retícula: a matriz de Bayer 4×4 no pixel do buffer, de -0,5 a 0,5.
  float zkBayer(vec2 p) {
    vec2 q = mod(floor(p), 4.0);
    float i = q.x + q.y * 4.0;
    float v = 0.0;
    if (i < 0.5) v = 0.0; else if (i < 1.5) v = 8.0; else if (i < 2.5) v = 2.0; else if (i < 3.5) v = 10.0;
    else if (i < 4.5) v = 12.0; else if (i < 5.5) v = 4.0; else if (i < 6.5) v = 14.0; else if (i < 7.5) v = 6.0;
    else if (i < 8.5) v = 3.0; else if (i < 9.5) v = 11.0; else if (i < 10.5) v = 1.0; else if (i < 11.5) v = 9.0;
    else if (i < 12.5) v = 15.0; else if (i < 13.5) v = 7.0; else if (i < 14.5) v = 13.0; else v = 5.0;
    return v / 16.0 - 0.5;
  }

  void main() {
    vec3 d = normalize(vDir);
    float e = d.y;
    // o tamanho de um pixel na direção: é ele que dá o tamanho das estrelas (medido aqui, fora de qualquer desvio)
    float pix = max(length(fwidth(d)), 1e-5);
    float dither = zkBayer(gl_FragCoord.xy);
    float night = (1.0 - uDay) * (1.0 - uGolden);
    float day = uDay * (1.0 - uGolden);
    // O SOL RENTE TEM DUAS CARAS (os momentos do dia, skyPreset.SKY_TRACK): de manhã o céu é rosa e lilás, de tarde é
    // pêssego e fogo. As cores "Gold" daqui para baixo são as da hora que é.
    vec3 zenGold = mix(uZenDawn, uZenGold, uEve);
    vec3 midGold = mix(uMidDawn, uMidGold, uEve);
    vec3 lowGold = mix(uLowDawn, uLowGold, uEve);
    vec3 cloudGold = mix(uCloudDawn, uCloudGold, uEve);
    vec3 cloudDusk = mix(uCloudDawnShade, uCloudDusk, uEve);

    // ── o degradê, em faixas: do horizonte (a cor do fog) ao alto ──
    // O quadro só mostra uns quinze graus de céu acima do mar: o degradê inteiro cabe neles. (Esticado até o zênite, a
    // tela ficava só com o pé dele — a bruma dourada do horizonte de ponta a ponta, e nenhum azul: a foto do playtest.)
    float h = clamp(e / 0.24, 0.0, 1.0);
    float band = clamp(floor(h * 10.0 + 0.5 + dither * 0.9) / 10.0, 0.0, 1.0);
    // A NOITE É O CÉU DA PRIMEIRA NOITE NO ACAMPAMENTO (StarDome): o mesmo ar azul subindo do horizonte até o quase
    // preto do alto, liso como lá (as faixas com retícula são do dia e da hora dourada).
    vec3 nightAir = zhNightAir(uFog, e);
    vec3 zen = uZenDay * day + zenGold * uGolden + nightAir * night;
    vec3 mid = uMidDay * day + midGold * uGolden + nightAir * night;
    vec3 low = uLowDay * day + lowGold * uGolden + nightAir * night;
    // (rente ao horizonte o dia começa na cor do fog; a noite começa no próprio ar dela, que já é o fog mais o azul —
    // com o fog puro ali ficava uma faixa preta entre o mar e as estrelas que a cúpula do acampamento não tem)
    vec3 foot = mix(uFog, nightAir, night);
    vec3 col = band < 0.14 ? mix(foot, low, band / 0.14)
      : band < 0.48 ? mix(low, mid, (band - 0.14) / 0.34)
      : mix(mid, zen, (band - 0.48) / 0.52);

    // ── as estrelas e a Via Láctea: as MESMAS de quando o herói dorme e a câmera sobe (a mesma função, no mesmo céu) ──
    if (night > 0.02 && e > 0.0) col += zhStarSky(d, pix, uTime) * night;

    // ── o astro: o sol (ou a lua), um disco de borda dura com dois anéis de clarão ──
    float sunUp = smoothstep(-0.07, 0.02, uSun.y);
    float sd = distance(d, normalize(uSun));
    vec3 sunCol = mix(uMoon, mix(uSunDay, mix(uSunDawn, uSunLow, uEve), uGolden), uDay);
    float disc = step(sd, 0.05);
    float ring1 = step(sd, 0.085 + dither * 0.012) * (1.0 - disc);
    float ring2 = step(sd, 0.16 + dither * 0.03) * (1.0 - disc) * (1.0 - ring1);
    float glow = smoothstep(0.75, 0.0, sd);
    col += sunCol * (ring1 * 0.34 + ring2 * 0.15 + glow * glow * 0.22 * (0.4 + 0.6 * uGolden)) * sunUp * step(0.0, e + 0.02);
    col = mix(col, sunCol * 1.25, disc * sunUp * step(-0.01, e));

    // ── as nuvens altas: fiapos finos esticados pelo vento, no alto do quadro (cirros) ──
    if (e > 0.06) {
      vec2 hp = d.xz / (e + 0.05) * 0.55 + vec2(uDrift * 0.02, 0.0);
      float wisp = zkFbm(hp * vec2(0.6, 3.4) + vec2(0.0, zkNoise(hp * 0.8) * 1.6));
      float high = smoothstep(0.08, 0.2, e) * (wisp - 0.6) * 2.4;
      float streak = step(0.18 + dither * 0.22, high);
      vec3 cirrus = uCloudLit * day + cloudGold * uGolden + uCloudNight * night * 1.8;
      // (de noite quase somem: o céu é das estrelas — ver os cúmulos, logo abaixo)
      col = mix(col, cirrus, streak * (0.42 - 0.37 * night));
    }

    // ── os cúmulos: as nuvens baixas sobre o mar, com volume ──
    // Uma nuvem de verdade, vista de baixo, tem a BASE reta e mais escura (é a barriga dela), o corpo, o TOPO aceso pelo
    // céu e uma borda de prata do lado do sol. Tudo sai do mesmo campo: a densidade aqui, um pouco abaixo (acabou logo
    // embaixo? então é a base), um pouco acima (acabou logo em cima? é o topo) e um pouco na direção do astro (a nuvem
    // afina para lá? é o lado aceso). Quatro tons chapados, a borda serrilhada pela retícula: pixel art, nunca degradê.
    if (e > 0.008) {
      float cBody = zkCumulus(d, e);
      if (cBody > 0.0) {
        float below = zkCumulus(d, e - 0.014);
        float above = zkCumulus(d, e + 0.016);
        vec3 ds = normalize(vec3(d.x + uSun.x * 0.05, e, d.z + uSun.z * 0.05));
        float sunward = zkCumulus(ds, e);
        float cut = 0.02 + dither * 0.05;
        float body = step(cut, cBody);
        float base = body * (1.0 - step(cut + 0.03, below));
        float top = body * (1.0 - step(cut + 0.04, above));
        float lit = body * clamp((cBody - sunward) * 9.0 + 0.35 + 0.35 * top, 0.0, 1.0);
        vec3 cHi = uCloudLit * day + cloudGold * uGolden + uCloudNight * night * 2.2;
        vec3 cMid = mix(uCloudShade, uCloudLit, 0.55) * day + mix(cloudDusk, cloudGold, 0.5) * uGolden + uCloudNight * night * 1.5;
        vec3 cLow = uCloudShade * day + cloudDusk * uGolden + uCloudNight * night;
        vec3 cBelly = uCloudShade * 0.78 * day + cloudDusk * 0.72 * uGolden + uCloudNight * night * 0.7;
        // o tom: a barriga, o corpo, o aceso e o realce — escolhidos em degraus, com a retícula decidindo a fronteira
        float tone = base > 0.5 ? 0.0 : (lit + dither * 0.3 > 0.72 ? 3.0 : lit + dither * 0.3 > 0.42 ? 2.0 : 1.0);
        vec3 cloud = tone < 0.5 ? cBelly : tone < 1.5 ? cLow : tone < 2.5 ? cMid : cHi;
        // na hora dourada o sol baixo acende a nuvem POR BAIXO: a barriga fica rosa-dourada, não cinza
        cloud = mix(cloud, cloudGold, base * uGolden * 0.55);
        // perto do horizonte a nuvem some na bruma, como o mar
        float haze = 1.0 - smoothstep(0.008, 0.07, e);
        cloud = mix(cloud, uFog, haze * 0.75);
        // DE NOITE A NUVEM É UM VÉU, não uma tampa: o céu da noite é o estrelado da primeira noite no acampamento
        // (pedido do autor), e com a nuvem a 66% as estrelas e a Via Láctea ficavam escondidas atrás dela em quase
        // toda a faixa de céu que a praia mostra. A 16% ela ainda passa (uma sombra mais escura que apaga um fio as
        // estrelas por trás), e o céu é o mesmo.
        col = mix(col, cloud, body * (0.96 - 0.8 * night));
      }
    }

    gl_FragColor = vec4(mix(uFog, col, uLevel), 1.0);
  }
`;

const skies = new WeakMap<THREE.Scene, SeaSky>();
/** A cúpula de cada cena: nasce no aquecimento dos shaders (ShaderPrewarm) e fica escondida até a câmera baixar. */
export const seaSkyFor = (scene: THREE.Scene): SeaSky => {
  let sky = skies.get(scene);
  if (!sky) {
    sky = new SeaSky(scene);
    skies.set(scene, sky);
  }
  return sky;
};

// As cores, como se veem (o three as converte de sRGB ao ler o hex; fundo e céu passam pela mesma curva do quadro).
const C = (hex: string): { value: THREE.Color } => ({ value: new THREE.Color(hex) });

export class SeaSky {
  private readonly mesh: THREE.Mesh;
  private readonly uniforms = {
    uLevel: { value: 0 },
    uFog: { value: new THREE.Color(0, 0, 0) },
    uSun: { value: new THREE.Vector3(0, 1, -1) },
    uDay: { value: 1 },
    uGolden: { value: 0 },
    uEve: { value: 1 },
    uTime: { value: 0 },
    uDrift: { value: 0 },
    // de dia: o azul do alto, o azul claro do meio e a claridade logo acima da bruma do horizonte
    uZenDay: C('#2f6fc8'), uMidDay: C('#6ea9e6'), uLowDay: C('#b9d8ee'),
    // na hora dourada da tarde: o azul fundo, o rosa e o pêssego
    uZenGold: C('#34467f'), uMidGold: C('#b97f9a'), uLowGold: C('#f0aa72'),
    // ao nascer do sol (o sol nasce NESTE mar): mais frio e mais claro — o azul da manhã, o lilás-rosa e o rosa-pêssego
    uZenDawn: C('#3d5697'), uMidDawn: C('#c493b8'), uLowDawn: C('#f7c3aa'),
    // (a noite não tem cor daqui: é o céu estrelado do StarDome sobre a cor do fog)
    // as nuvens: a luz e a sombra de cada hora
    uCloudLit: C('#f6f8fb'), uCloudGold: C('#ffc98e'), uCloudShade: C('#9db3cf'), uCloudDusk: C('#7d5f8e'), uCloudNight: C('#141b30'),
    uCloudDawn: C('#ffd2c4'), uCloudDawnShade: C('#8b7aa8'),
    // o astro
    uSunDay: C('#fff6d8'), uSunLow: C('#ffb86a'), uSunDawn: C('#ffd2a6'), uMoon: C('#dfe8ff'),
  };

  public constructor(scene: THREE.Scene) {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 48, 24), material);
    // O ÚLTIMO dos opacos, e no plano distante (o vértice): o teste de profundidade recusa todo pixel em que o mar, a
    // areia ou a serra já desenharam, e a GPU nem roda o shader ali. Ela era a PRIMEIRA, sem teste: as nuvens (quatro
    // campos de ruído por pixel) eram calculadas na tela inteira e o mar pintava por cima de quase tudo — sentado no
    // guarda-sol, ~1,2 ms de GPU por quadro para o céu que se vê numa faixa (pedido do autor, 2026-11-19: "melhore a
    // performance na praia"). O quadro sai o mesmo: ela não escreve profundidade, e tudo o que é transparente (os
    // sprites, a névoa) continua vindo depois dela.
    this.mesh.renderOrder = 1e6;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Na cena só enquanto a câmera olha o horizonte. Escondida não custa nada, e o programa fica compilado. */
  public show(on: boolean): void {
    this.mesh.visible = on;
  }

  /**
   * O céu deste quadro: a cúpula acompanha a câmera; `level` é o quanto dele aparece (0 = só a cor do fog); `fog` a cor
   * do horizonte; `sun` o rumo do astro; `day` e `golden` a hora (WorldLook.applySky); `eve` diz se o sol rente é o da
   * tarde (1) ou o da manhã (0).
   */
  public update(
    camera: THREE.Camera, level: number, fog: THREE.Color, sun: THREE.Vector3, day: number, golden: number, timeS: number, drift = timeS,
    eve = 1,
  ): void {
    this.uniforms.uEve.value = eve;
    this.mesh.position.copy(camera.position);
    this.uniforms.uLevel.value = Math.min(1, Math.max(0, level));
    this.uniforms.uFog.value.copy(fog);
    this.uniforms.uSun.value.copy(sun).normalize();
    this.uniforms.uDay.value = day;
    this.uniforms.uGolden.value = golden;
    this.uniforms.uTime.value = timeS;
    this.uniforms.uDrift.value = drift;
  }
}
