// O CHÁ DA SHUI, NA TELA: o shader do passo que vem depois do acabamento (ver TripPass). Cada efeito tem o seu
// uniforme de 0 a 1, e quem os move no tempo é a linha da viagem (runtime/trip.ts). Os efeitos saem do que se relata
// do cogumelo de verdade (a psilocibina):
//
//   · os pontinhos que formigam, como depois de esfregar os olhos (os fosfenos), pretos e depois de todas as cores;
//   · o mundo que RESPIRA (a superfície incha e ondula devagar) e a cor que ganha força e gira;
//   · as FORMAS CONSTANTES de Klüver (1926/1966): túnel, funil, espiral e favo. Bressloff, Cowan et al. (2001,
//     Phil. Trans. R. Soc. B 356:299) mostraram que elas são ondas planas no córtex visual, que vê a retina em
//     coordenadas log-polares: por isso aqui elas são cossenos em (log r, θ);
//   · o TÚNEL de luz de "2001: uma odisseia no espaço": dois planos de luz correndo para quem olha, até o horizonte
//     que é um clarão branco;
//   · os RASTROS (cada coisa que se mexe deixa uma esteira: o quadro anterior pesa no de agora);
//   · a REDE que ninguém vê: o micélio debaixo do vale, fios de fungo ligando tudo, acesos no chão (a profundidade
//     do quadro devolve o ponto do mundo de cada pixel, como a sombra das nuvens do acabamento);
//   · e, por cima de tudo, o ELMO: o herói vê o mundo pela fresta em T da máscara de ferro.
//
// As asas de borboleta nos lados da tela, no voo, foram tentadas e saíram (pedido do autor: entrando pela tela, elas
// ficavam estranhas).

export const TRIP_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const TRIP_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tHistory;
  uniform sampler2D tDepth;
  uniform mat4 uInvViewProj;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uVisor;
  uniform float uOpen;
  uniform float uSpecks;
  uniform float uRainbow;
  uniform float uBreathe;
  uniform float uHue;
  uniform float uForm;
  uniform float uTunnel;
  uniform float uTravel;
  uniform float uSpin;
  uniform float uWeb;
  uniform vec2 uWebAt;
  uniform float uWebR;
  uniform float uTrail;
  uniform float uWhite;
  uniform float uDark;
  uniform float uReduced;
  varying vec2 vUv;

  float zhHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float zhHash3(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  vec2 zhHash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }
  float zhNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(zhHash(i), zhHash(i + vec2(1.0, 0.0)), f.x), mix(zhHash(i + vec2(0.0, 1.0)), zhHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  vec3 zhHue(float h) {
    return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  }
  vec3 zhHueShift(vec3 c, float a) {
    const mat3 toYiq = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
    const mat3 toRgb = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
    vec3 yiq = toYiq * c;
    float h = atan(yiq.z, yiq.y) + a;
    float ch = length(yiq.yz);
    return toRgb * vec3(yiq.x, ch * cos(h), ch * sin(h));
  }
  // F1 e F2 de Voronoi: F2 - F1 é zero na parede entre duas células (o fio da rede).
  vec2 zhVoronoi(vec2 x) {
    vec2 n = floor(x);
    vec2 f = fract(x);
    float f1 = 8.0;
    float f2 = 8.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 r = g + zhHash22(n + g) - f;
        float d = dot(r, r);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
      }
    }
    return vec2(sqrt(f1), sqrt(f2));
  }
  float zhBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  // O túnel de luz: dois planos (em cima e embaixo da linha do horizonte) correndo para quem olha.
  vec3 zhStargate(vec2 p) {
    float s = sin(uSpin);
    float c = cos(uSpin);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    float y = abs(p.y);
    float top = p.y > 0.0 ? 1.0 : 0.0;
    float z = 0.3 / max(y, 0.004);
    float x = p.x * z;
    float zz = z + uTravel;
    float band = zhNoise(vec2(x * 1.5 + top * 31.0, zz * 0.07));
    float streak = pow(smoothstep(0.32, 1.0, band), 1.6);
    float dash = smoothstep(0.15, 0.85, zhNoise(vec2(x * 0.6 - top * 9.0, zz * 0.8)));
    vec3 hue = zhHue(fract(x * 0.045 + zz * 0.011 + uTime * 0.04 + top * 0.37));
    vec3 col = hue * streak * (0.35 + 1.5 * dash);
    col += vec3(1.0, 0.97, 0.9) * pow(zhNoise(vec2(x * 8.0, zz * 2.2)), 14.0) * 2.4;
    // O fundo do corredor é um clarão: ele esconde onde os desenhos ficariam menores que um pixel.
    float far = exp(-y * 8.0);
    col = mix(col, vec3(1.0, 0.94, 0.82) * 1.25, far * 0.9);
    col += vec3(1.0, 0.92, 0.8) * 0.06 / (length(p) * 7.0 + 0.25);
    return col;
  }

  // O que fica além da beira do vale no voo: um céu de cores, com estrelas. O vale vira uma ilha no meio dele.
  vec3 zhCosmos(vec2 p) {
    vec2 q = p * 3.0 + vec2(uTime * 0.05, -uTime * 0.03);
    float n = zhNoise(q) * 0.6 + zhNoise(q * 2.3 + 4.0) * 0.3 + zhNoise(q * 5.1 - 2.0) * 0.1;
    vec3 col = zhHue(fract(n * 0.8 + uTime * 0.03)) * (0.12 + 0.35 * n * n);
    float star = step(0.995, zhHash(floor(p * uResolution.y)));
    return col + vec3(star) * 0.8;
  }

  void main() {
    float aspect = uResolution.x / uResolution.y;
    vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
    float t = uTime;
    float px = 1.0 / uResolution.y;

    // O mundo respira: incha e encolhe devagar, e ondula.
    vec2 uv = vUv;
    if (uBreathe > 0.0) {
      uv = 0.5 + (vUv - 0.5) * (1.0 - 0.014 * uBreathe * sin(t * 0.85));
      uv += uBreathe * 0.005 * vec2(sin(vUv.y * 10.0 + t * 0.7), cos(vUv.x * 8.0 - t * 0.6));
    }
    vec3 col = texture2D(tDiffuse, uv).rgb;

    // A cor ganha força e gira pelo quadro.
    if (uHue > 0.0) {
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 1.0 + 0.9 * uHue);
      col = max(zhHueShift(col, uHue * (t * 0.35 + length(p) * 2.4 - p.y * 1.5)), 0.0);
    }

    // A rede debaixo do chão (o micélio), acesa e pulsando a partir de onde o herói está.
    if (uWeb > 0.0) {
      float depth = texture2D(tDepth, vUv).x;
      if (depth >= 1.0) {
        col = mix(col, zhCosmos(p), uWeb);
      } else {
        vec4 clip = uInvViewProj * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
        vec3 wp = clip.xyz / clip.w;
        float ground = 1.0 - smoothstep(0.05, 0.18, abs(wp.y - floor(wp.y + 0.5)));
        vec2 q = wp.xz + vec2(zhNoise(wp.xz * 0.35 + 3.0), zhNoise(wp.xz * 0.35 - 7.0)) * 1.6;
        vec2 v1 = zhVoronoi(q * 0.55);
        float e1 = v1.y - v1.x;
        float thread = 1.0 - smoothstep(0.0, fwidth(e1) * 1.5 + 0.02, e1);
        vec2 v2 = zhVoronoi(q * 1.7 + 11.0);
        float e2 = v2.y - v2.x;
        thread += (1.0 - smoothstep(0.0, fwidth(e2) * 1.3 + 0.012, e2)) * 0.45;
        thread += exp(-v1.x * v1.x * 60.0) * 0.8;
        float dist = length(wp.xz - uWebAt);
        float reach = 1.0 - smoothstep(uWebR - 2.5, uWebR, dist);
        float pulse = 0.5 + 0.5 * sin(dist * 1.6 - t * 3.0);
        vec3 wc = mix(vec3(0.3, 1.0, 0.72), zhHue(fract(dist * 0.03 - t * 0.05)), 0.45);
        col = col * (1.0 - 0.3 * uWeb * reach) + wc * thread * (0.45 + 0.75 * pulse) * reach * ground * uWeb * 1.25;
      }
    }

    // As formas constantes: o favo e a espiral no mapa log-polar do córtex.
    if (uForm > 0.0) {
      float r = max(length(p), 1e-3);
      vec2 c = vec2(log(r) - t * 0.22, atan(p.y, p.x));
      float hex = (cos(12.0 * c.x) + cos(-6.0 * c.x + 10.0 * c.y) + cos(-6.0 * c.x - 10.0 * c.y)) / 3.0;
      float spiral = cos(9.0 * c.x + 5.0 * c.y + t * 0.8);
      float m = mix(hex, spiral, 0.5 + 0.5 * sin(t * 0.21));
      // A curva de nível do padrão: os favos (anéis em volta de cada nó) e as espirais viram linhas finas e acesas.
      float lw = fwidth(m) * 1.2 + 0.02;
      float line = (1.0 - smoothstep(lw * 0.5, lw * 1.5, abs(m - 0.25))) * smoothstep(0.06, 0.2, r);
      col += zhHue(fract(c.y / 6.2832 + t * 0.05 + log(r) * 0.3)) * line * uForm;
    }

    // O túnel de luz.
    if (uTunnel > 0.0) {
      vec3 gate = zhStargate(p);
      if (uReduced > 0.5) gate = min(gate, vec3(0.8));
      col = mix(col, gate, uTunnel);
    }

    // Os pontinhos que formigam: pretos, e depois de todas as cores.
    if (uSpecks > 0.0) {
      vec2 bp = vUv * uResolution;
      vec2 flow = vec2(sin(t * 0.37 + bp.y * 0.015), cos(t * 0.29 + bp.x * 0.013)) * 6.0;
      vec2 g = (bp + flow) / 3.0;
      vec2 cell = floor(g);
      float rate = uReduced > 0.5 ? 2.0 : 7.0;
      float h = zhHash3(vec3(cell, floor(t * rate + zhHash(cell) * 7.0)));
      float swarm = zhNoise(bp * 0.025 + vec2(t * 0.2, -t * 0.15));
      float on = step(h, uSpecks * (0.2 + 0.8 * swarm) * 0.55);
      vec2 f = fract(g) - 0.5;
      float dotm = on * step(dot(f, f), 0.18);
      col *= 1.0 - dotm * (1.0 - uRainbow) * 0.85;
      col += zhHue(fract(h * 3.0 + t * 0.15 + swarm)) * dotm * uRainbow * 1.1;
    }

    // Os rastros: o quadro de antes pesa no de agora, e o claro deixa esteira.
    if (uTrail > 0.0) {
      vec3 prev = texture2D(tHistory, vUv).rgb;
      col = mix(col, max(col, prev * 0.97), uTrail * 0.8);
      col = mix(col, prev, uTrail * 0.35);
    }

    // O elmo: o ferro por dentro, e a fresta em T (a barra dos olhos, a haste até o queixo). Aberta, ela some.
    if (uVisor > 0.0) {
      float barY = 0.07;
      // Na tela em pé (o celular) o T encolhe com a largura: a barra nunca encosta nas bordas.
      float hb = mix(0.1, 0.8, uOpen);
      float wb = mix(min(0.6, aspect * 0.42), aspect, uOpen);
      float ws = mix(min(0.11, aspect * 0.09), aspect, uOpen);
      float dT = min(zhBox(p - vec2(0.0, barY), vec2(wb, hb)), zhBox(p - vec2(0.0, (barY - 0.7) * 0.5), vec2(ws, (barY + 0.7) * 0.5))) - 0.012;
      float hole = 1.0 - smoothstep(-px * 0.5, px * 0.5, dT);
      // Dentro da fresta, a beirada faz sombra; o ferro em volta é azul-marinho escuro, granulado, e a quina da
      // fresta pega a luz de fora.
      col *= mix(0.55, 1.0, smoothstep(0.0, 0.05, -dT));
      vec2 grain = floor(vUv * uResolution / 2.0);
      vec3 iron = vec3(0.03, 0.04, 0.08) * (0.8 + 0.4 * zhHash(grain)) * (1.0 + 0.6 * smoothstep(0.35, -0.2, p.y));
      iron += vec3(0.16, 0.2, 0.3) * (1.0 - smoothstep(0.0, px * 3.0, dT)) * step(0.0, dT);
      col = mix(col, iron, (1.0 - hole) * uVisor);
    }

    col = mix(col, vec3(1.0, 0.98, 0.94), uWhite);
    col *= 1.0 - uDark;
    gl_FragColor = vec4(col, 1.0);
  }
`;
