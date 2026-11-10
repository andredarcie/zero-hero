// O ACABAMENTO DO QUADRO: o último passo da cadeia de pós (ver World3D.initPostProcessing).

import * as THREE from 'three';
import { CLOUD_FIELD_GLSL, skyUniforms } from './atmosphere';

// ── HD-2D post: the finish shader (tilt-shift DoF + vignette + grain) ─────────
//
// Ported from the old 3D prototype. A screen-space fake depth-of-field: a
// sharp horizontal band at uFocusY (the hero's line) stays crisp while the top
// (distant background) and bottom (foreground) blur out — the "miniature
// diorama" tilt-shift. Then a soft vignette and a touch of film grain.
export const makeFinishShader = (w: number, h: number): THREE.ShaderMaterialParameters & {
  uniforms: Record<string, THREE.IUniform>;
} => ({
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null },
    uResolution: { value: new THREE.Vector2(w, h) },
    uTime: { value: 0 },
    uFocusY: { value: 0.52 },
    uBand: { value: 0.16 },
    uBlur: { value: 3.2 },
    uNear: { value: 0.55 },
    uVignette: { value: 0.24 },
    uLift: { value: 1 },
    // A VISTA DO HERÓI (ver setHeroSight): a curva local, onde ela cai na tela, e os dois
    // semi-eixos da elipse que um disco de chão vira aos 48° da câmera. Escritos por
    // updateHeroSight; em 0 o quadro é literalmente o de antes.
    uSight: { value: 0 },
    uSightAt: { value: new THREE.Vector2(0.5, 0.5) },
    uSightR: { value: new THREE.Vector2(0.2, 0.2) },
    uGrain: { value: 0.02 },
    // A DISTÂNCIA SEM BORRAR (ver o bloco no shader): quanto o longe perde cor e puxa para a cor do ar.
    uHaze: { value: 0 },
    uHazeColor: { value: new THREE.Color(0, 0, 0) },
    uGrade: { value: 0.5 },
    // The split-tone the grade lerps between, per region (see updateBiomeGrade): cool woodland by
    // default, amber where the ground runs molten.
    uShadowTint: { value: new THREE.Vector3(0.88, 0.95, 1.10) },
    uHighTint: { value: new THREE.Vector3(1.12, 1.02, 0.86) },
    uSaturation: { value: 1.1 },
    // A SOMBRA PERDE COR (ver o bloco no shader): 0 = a saturação igual do claro ao escuro, como era.
    uShadeSat: { value: 0 },
    uContrast: { value: 1.0 },
    uFade: { value: 0 },
    uSeasonTint: { value: new THREE.Vector3(1, 1, 1) },
    uSeasonSat: { value: 1 },
    // ── A LUZ NO AR E AS NUVENS (ver atmosphere.ts e AirLight.ts) ──
    // A profundidade do quadro e a matriz que a leva de volta ao MUNDO: é por ela que a sombra de uma nuvem sabe em
    // que chão cai. `tAir` é o ar aceso (os fachos entre as árvores, o halo do fogo), somado antes da curva.
    tDepth: { value: null },
    tAir: { value: null },
    uAirOn: { value: 0 },
    uInvViewProj: { value: new THREE.Matrix4() },
    uSkyNoise: skyUniforms.uSkyNoise,
    uCloudDrift: skyUniforms.uCloudDrift,
    uCloudCover: skyUniforms.uCloudCover,
    uCloudShade: skyUniforms.uCloudShade,
    uCloudTint: { value: new THREE.Vector3(0.62, 0.7, 0.88) },
    // O OMBRO das altas-luzes (ver o bloco no shader): 0 = o corte seco de antes.
    uShoulder: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tBloom;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uFocusY;
    uniform float uBand;
    uniform float uBlur;
    uniform float uNear;
    uniform float uVignette;
    uniform float uLift;
    uniform float uSight;
    uniform vec2 uSightAt;
    uniform vec2 uSightR;
    uniform float uGrain;
    uniform float uHaze;
    uniform vec3 uHazeColor;
    uniform float uGrade;
    uniform vec3 uShadowTint;
    uniform vec3 uHighTint;
    uniform float uSaturation;
    uniform float uShadeSat;
    uniform float uContrast;
    uniform float uFade;
    uniform vec3 uSeasonTint;
    uniform float uSeasonSat;
    uniform sampler2D tDepth;
    uniform sampler2D tAir;
    uniform float uAirOn;
    uniform mat4 uInvViewProj;
    uniform float uCloudShade;
    uniform vec3 uCloudTint;
    uniform float uShoulder;
    ${CLOUD_FIELD_GLSL}
    varying vec2 vUv;
    // O quadro com o bloom ja somado — a soma aditiva que o UnrealBloomPass fazia numa passada
    // de tela cheia, agora aqui, amostra por amostra (ver FusedBloomPass). O blend dele e
    // pre-multiplicado (ONE, ONE): cena + bloom, SEM pesar pelo alfa.
    vec3 frameAt(vec2 uv) {
      return texture2D(tDiffuse, uv).rgb + texture2D(tBloom, uv).rgb;
    }
    void main() {
      // Tilt-shift, asymmetric on purpose: the DISTANCE behind the hero (up the screen) melts
      // away hard, while the foreground under him only softens — Octopath blurs the background
      // far more than the front, and blurring the near edge as hard just hides the ground the
      // player is walking on. uNear scales the near side's ramp.
      float dy = vUv.y - uFocusY;
      // O desfoque começa mais LONGE da faixa do herói (2026-11-10): pixel art borrada lê como imagem estragada, não
      // como distância. Quem diz "longe" agora é a perspectiva atmosférica abaixo; o desfoque só derrete o fundo.
      float far = smoothstep(uBand + 0.08, uBand + 0.42, dy);   // above the band = distance
      float near = smoothstep(uBand, uBand + 0.46, -dy) * uNear; // below = foreground
      float t = max(far, near);
      // Quantise the radius to half a pixel: a continuously-varying blur makes the pixel art
      // "boil" as the hero walks, because every frame resamples the same texels differently.
      float radius = floor(uBlur * t * 2.0 + 0.5) * 0.5;
      // ── O AR QUENTE acima das chamas (o alfa do ar aceso, ver AirLight) ───────
      // Cada fileira do quadro escorrega de lado um pixel e pouco, numa onda que SOBE: o tremor de ar quente. Só existe
      // na coluna acima de uma chama acesa; no resto da tela o alfa é zero e a leitura é a de sempre.
      vec4 zhAir = uAirOn > 0.0 ? texture2D(tAir, vUv) : vec4(0.0);
      vec2 zhUv = vUv;
      if (zhAir.a > 0.004) {
        zhUv += zhAir.a * vec2(sin(vUv.y * 260.0 - uTime * 11.0), 0.35 * cos(vUv.y * 190.0 - uTime * 8.0)) * 1.4 / uResolution;
      }
      // Na faixa nitida o raio e ZERO e as sete amostras caem no mesmo texel (os pesos somam 1):
      // uma leitura so da o mesmo pixel. E a faixa e a maior parte da tela — o chao do heroi.
      vec3 col;
      if (radius == 0.0) {
        col = frameAt(zhUv);
      } else {
        vec2 px = radius / uResolution;
        col = frameAt(zhUv) * 0.30;
        col += frameAt(zhUv + vec2( 1.0,  0.6) * px) * 0.12;
        col += frameAt(zhUv + vec2(-1.0,  0.6) * px) * 0.12;
        col += frameAt(zhUv + vec2( 1.0, -0.6) * px) * 0.12;
        col += frameAt(zhUv + vec2(-1.0, -0.6) * px) * 0.12;
        col += frameAt(zhUv + vec2( 0.0,  1.4) * px) * 0.11;
        col += frameAt(zhUv + vec2( 0.0, -1.4) * px) * 0.11;
      }

      // ── A SOMBRA DAS NUVENS ───────────────────────────────────────────────────
      // O céu não entra no quadro, mas passa por cima dele: cada pixel volta ao MUNDO pela profundidade e pergunta ao
      // campo de nuvens (o mesmo que o lago reflete) se há uma sobre aquele chão. Multiplica, e esfria: debaixo de
      // nuvem a luz que sobra é a do céu. Manchas largas e lentas — é a luz do vale mudando, não um efeito em cima dele.
      if (uCloudShade > 0.0) {
        vec4 zhClip = uInvViewProj * vec4(vUv * 2.0 - 1.0, texture2D(tDepth, vUv).x * 2.0 - 1.0, 1.0);
        vec2 zhGround = zhClip.xz / zhClip.w;
        col *= mix(vec3(1.0), uCloudTint, zhCloud(zhGround) * uCloudShade);
      }

      // ── O AR ACESO (AirLight.ts) ──────────────────────────────────────────────
      // Luz espalhada no ar entre a câmera e o que ela vê: os fachos de sol entre as copas, o halo em volta do fogo.
      // Calculado e suavizado em meia resolução (ar é macio); aqui é uma leitura só, ampliada pelo filtro linear.
      col += zhAir.rgb;

      // ── A DISTÂNCIA SEM BORRAR: a perspectiva atmosférica ─────────────────────
      // Acima da faixa do herói o quadro perde cor e se inclina para a cor do AR (o skyColor: poeira dourada de dia,
      // o escuro de noite) — os pixels continuam nítidos, só mais distantes. O que fica na faixa e abaixo dela não muda.
      if (uHaze > 0.0) {
        // Começa bem acima da faixa: um vizinho a três tiles do herói ainda é primeiro plano, não distância.
        float zhFar = smoothstep(uFocusY + uBand * 1.5, 1.08, vUv.y);
        if (zhFar > 0.0) {
          float zhHl = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(col, vec3(zhHl), zhFar * uHaze * 0.5);
          col = mix(col, uHazeColor, zhFar * uHaze * 0.32);
        }
      }

      // ── cinematic grade: split-tone (cool shadows / warm highlights), then
      //    saturation and contrast — the HD-2D "diorama photograph" look.
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 toned = col * mix(uShadowTint, uHighTint, smoothstep(0.0, 0.55, luma));
      col = mix(col, toned, uGrade);
      col = mix(vec3(luma), col, uSeasonSat) * uSeasonTint;
      // ── A CURVA DE TELA (uLift) — ver o doc de params.lift ───────────────────
      // Este jogo nao tem tone mapping (o mundo e desenhado num render target, e o three so monta
      // o ACES quando o alvo e a TELA), entao o linear vai cru para o canvas e nao ha ombro
      // nenhum segurando o alto: subir luz estoura o branco antes de clarear a sombra. O pow e o
      // ombro que falta — monotono, leva 1 em 1, abre os graves. O DIA vive dela.
      //
      // Ela entra DEPOIS do split-tone de proposito: o grade classifica sombra x luz por luma, e
      // levantar antes faria o quadro inteiro passar por "luz" — o dia perderia justamente a
      // sombra azul que o faz parecer dia. luma sobe junto, senao a saturacao abaixo giraria em
      // torno de um cinza que nao existe mais.
      //
      // O if e o que garante que a NOITE nao muda um bit: em uLift = 1 nada disto roda.
      if (uLift < 0.999) {
        col = pow(max(col, vec3(0.0)), vec3(uLift));
        luma = pow(max(luma, 0.0), uLift);
      }
      // ── A VISTA DO HEROI (uSight) — ver setHeroSight ─────────────────────────
      // A MESMA curva de cima, so que LOCAL: um pow centrado nos pes dele e pendendo para onde ele
      // olha. Ela abre os graves em volta e deixa o 1 onde esta, entao dentro da poca de uma
      // fogueira ela quase nao soma — a vista mostra o tile em que ele pisa, o fogo e que abre a
      // regiao. E ela e LISA de proposito: todo desenho de luz deste jogo e escadinha de pixel art
      // (o disco da fogueira, uLightSteps), mas isto nao e luz caindo no chao, e o olho.
      //
      // O nucleo e chato ate 35% do raio e so entao cai: um pico no centro seguiria o heroi como
      // uma mancha de lente. E a saturacao sobe AMARRADA a ela, nunca por um knob proprio: pow
      // comprime razao entre canais, e um quadro local mais claro e menos colorido que a vizinhanca
      // le como neblina (a licao inteira do skyPreset.ts).
      float sight = 0.0;
      if (uSight > 0.0) {
        vec2 sd = (vUv - uSightAt) / max(uSightR, vec2(0.0001));
        sight = uSight * (1.0 - smoothstep(0.35, 1.0, length(sd)));
        // Fora da elipse a vista vale 0 e o pow vira pow(x, 1) = x: a maior parte da tela pagava
        // dois pow por pixel para nao mudar nada.
        if (sight > 0.0) {
          float sexp = 1.0 - sight;
          col = pow(max(col, vec3(0.0)), vec3(sexp));
          luma = pow(max(luma, 0.0), sexp);
        }
      }
      // ── A SOMBRA PERDE COR (uShadeSat) ────────────────────────────────────────
      // Num dia de sol a cor mora na LUZ: o que o sol pega é vivo, e o que fica na sombra só tem o céu para devolver,
      // e sai mais cinza. Com a saturação igual do claro ao escuro, a sombra de uma árvore era um verde tão forte
      // quanto o prado ao lado, e o quadro lia como chapado mesmo com a sombra funda. Só o grave perde; do meio-tom
      // para cima nada muda, e em 0 (a noite) a conta nem roda.
      float zhSat = uSaturation + sight * 0.35;
      if (uShadeSat > 0.0) zhSat *= 1.0 - uShadeSat * (1.0 - smoothstep(0.05, 0.4, luma));
      col = mix(vec3(luma), col, zhSat); // saturation around luma
      col = (col - 0.5) * uContrast + 0.5;           // contrast around mid-grey
      col = max(col, 0.0);

      // ── O OMBRO DAS ALTAS-LUZES (uShoulder) ───────────────────────────────────
      // Sem tone mapping, 1.0 era corte seco: a chama, o brilho na água e a flor branca ao sol estouravam num borrão
      // chapado. Acima do joelho o valor agora ROLA até o branco em vez de bater nele (uma exponencial: contínua no
      // joelho, nunca passa de 1), canal a canal — o quente demais desbota para o branco como num filme. Abaixo do
      // joelho é a identidade: a sombra e o meio-tom que o jogo afinou a olho não mudam um bit.
      if (uShoulder > 0.0) {
        vec3 zhOver = max(col - uShoulder, 0.0);
        float zhSpan = 1.0 - uShoulder;
        col = min(col, vec3(uShoulder)) + zhSpan * (1.0 - exp(-zhOver / zhSpan));
      }

      vec2 vuv = (vUv - 0.5) * vec2(1.0, 1.2);
      col *= 1.0 - smoothstep(0.5, 0.95, length(vuv)) * uVignette;

      float n = fract(sin(dot(vUv * uResolution + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * uGrain;

      // Death: the whole diorama drains of colour and sinks to black from inside the post,
      // so the fade takes the world, its grain and its glow with it (setWorldFade).
      if (uFade > 0.0) {
        float fadeLuma = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(col, vec3(fadeLuma), uFade * 0.85);
        col *= 1.0 - uFade;
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
