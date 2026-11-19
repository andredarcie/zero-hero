// A ÁGUA DA FONTE TERMAL — a superfície inteira no shader (o `worldFx: 'spring'`, ver pixelArtLight.PatchOpts).
//
// A primeira água da fonte era um desenho deitado de dois tons com tracinhos: lia como um tapete (pedido do autor,
// 2026-11-19: "melhore drasticamente o visual da fonte termal, foco total em qualidade e beleza visual"; e logo depois:
// "faça o lago ter profundidade 3D, ser possível ver o fundo"). A BACIA É DE VERDADE (o terreno a cava:
// TerrainFeatures.bakeSpring), e esta água é a lâmina TRANSLÚCIDA por cima dela: o leito de areia, a parede e as
// pedras do fundo se veem através dela, com a paralaxe de coisa funda. O que este módulo pinta, texel de arte por texel
// de arte (16 por tile, na grade do mundo: nada aqui desliza meio pixel), dentro da luz do mundo como o mar da praia
// (render3d/surf.ts):
//
//   1. A FUNDURA: quatro degraus de cor E de opacidade, do leite quase transparente da beira ao turquesa mais fechado
//      do miolo, de beira serrilhada, e os degraus RESPIRAM (a fronteira entre dois tons anda um nada, devagar).
//   2. AS CÁUSTICAS: a rede de luz, calculada NO LEITO (o raio do olho continua por baixo da água até o fundo): ela
//      fica presa ao fundo, e não boiando na superfície, quando a câmera anda.
//   3. O LEITE: manchas claras e largas que derivam, o mineral em suspensão.
//   4. O QUE MEXE A ÁGUA: a espuma que ferve no pé da cascata e os anéis que saem dela; o colar de espuma em quem
//      está dentro e os anéis lentos que o corpo solta; um anel por gota quando chove; e a espuma que lambe a margem.
//   5. A SOMBRA do paredão do fundo sobre a metade norte da água.
//   6. O CÉU: a água devolve as nuvens, as estrelas e a lua (o mesmo espelho do lago, pixelArtLight.WATER_SKY_GLSL),
//      mais no miolo e mais de noite.
//   7. A NOITE: a água guarda um resto de luz própria, e a lanterna de pedra doura a água perto dela, em faíscas.
//
// Quem alimenta os uniforms é objects/spring/HotSpring, a cada quadro.

import * as THREE from 'three';

const lin = (hex: string, k = 1): string => {
  const c = new THREE.Color(hex); // sRGB → linear
  return `vec3(${(c.r * k).toFixed(4)}, ${(c.g * k).toFixed(4)}, ${(c.b * k).toFixed(4)})`;
};

/** A rampa da água, da beira ao miolo: o gelo e a rampa `water` do tileset, com um degrau de leite entre eles. */
const S0 = lin('#bbf2f4', 0.72);
const S1 = lin('#6fcdd0', 0.9);
const S2 = lin('#27a9af');
const S3 = lin('#0b8a8f');
/** A espuma (a mesma conta da do mar: clara, e abaixo do limiar do halo ao sol). */
const FOAM = 'vec3(0.46, 0.57, 0.59)';

/** O que a água precisa saber do mundo (HotSpring escreve; o shader lê). */
export const springUniforms = {
  /** O meio da bacia (x, z) e as meias medidas dela (largura, fundo), em tiles. */
  uSpringRect: { value: new THREE.Vector4(0, 0, 1, 1) } as THREE.IUniform<THREE.Vector4>,
  /** Quem está dentro: x, z, e 1 se há alguém. */
  uSpringBody: { value: new THREE.Vector4(0, 0, 0, 0) } as THREE.IUniform<THREE.Vector4>,
  /** O pé da cascata: x, z. */
  uSpringFall: { value: new THREE.Vector4(0, 0, 0, 0) } as THREE.IUniform<THREE.Vector4>,
  /** A lanterna: x, z, e o quanto ela ilumina agora (a noite vezes a respiração da chama). */
  uSpringLamp: { value: new THREE.Vector4(0, 0, 0, 0) } as THREE.IUniform<THREE.Vector4>,
  /** O tempo: a luz do dia (0..1), a noite (0..1), a chuva (0..1); e a lâmina d'água sobre o leito, em tiles. */
  uSpringMood: { value: new THREE.Vector4(1, 0, 0, 0.35) } as THREE.IUniform<THREE.Vector4>,
};

/** Declarado antes do `main` do fragmento. */
export const SPRING_PARS_GLSL = /* glsl */ `
  uniform vec4 uSpringRect;
  uniform vec4 uSpringBody;
  uniform vec4 uSpringFall;
  uniform vec4 uSpringLamp;
  uniform vec4 uSpringMood;
  float zpHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
`;

/** As variáveis que atravessam os blocos (a cor, a máscara de água, a do céu): declaradas no começo do `main`. */
export const SPRING_LOCALS_GLSL = /* glsl */ `
  float zpWaterMask = 0.0;
  float zpSkyMask = 0.0;
  float zpShoreV = 0.0;
  float zpRag = 0.0;
  vec2 zpP = vec2(0.0);
  vec3 zpTone = vec3(0.0);
`;

/** A água inteira, logo depois de a arte (branca: só o tom do material) ser lida. */
export const SPRING_GLSL = /* glsl */ `
  {
    vec2 zpCell = floor(vWorldFxPos.xz * 16.0);
    zpP = (zpCell + 0.5) / 16.0;
    zpRag = zpHash(zpCell);
    float zpRag2 = zpHash(zpCell + 71.0);
    float zpT = uFlowTime;

    // ── quanto este texel está para dentro da margem, em px de arte (a margem de verdade é do terreno: um retângulo
    //    de quinas redondas, com a borda avançando um nada sobre a água) ──
    vec2 zpQ = abs(zpP - uSpringRect.xy) - (uSpringRect.zw - vec2(0.7));
    float zpE = -(length(max(zpQ, 0.0)) + min(max(zpQ.x, zpQ.y), 0.0) - 0.7) * 16.0 - 3.2;
    vec2 zpN = (zpP - uSpringRect.xy) / uSpringRect.zw;

    // ── a fundura: a cor e a opacidade, da beira quase transparente ao miolo, em degraus serrilhados que respiram ──
    float zpBreath = 0.8 * sin(zpP.x * 2.1 + zpT * 0.31) + 0.6 * sin(zpP.y * 3.3 - zpT * 0.23);
    float zpD = zpE + (zpRag - 0.5) * 1.5 + zpBreath;
    float zpB1 = step(1.6, zpD);
    float zpB2 = step(4.4, zpD);
    float zpB3 = step(8.2, zpD);
    vec3 zpCol = mix(mix(mix(${S0}, ${S1}, zpB1), ${S2}, zpB2), ${S3}, zpB3);
    float zpAlpha = mix(mix(mix(0.44, 0.56, zpB1), 0.66, zpB2), 0.76, zpB3);

    // ── o leite: manchas claras e largas que derivam devagar ──
    float zpMilk = sin(zpP.x * 2.3 + zpT * 0.21 + 1.4 * sin(zpP.y * 3.1 - zpT * 0.17)) * sin(zpP.y * 2.9 - zpT * 0.13 + 1.0);
    float zpMilky = step(0.5 + (zpRag2 - 0.5) * 0.3, zpMilk);
    zpCol = mix(zpCol, mix(zpCol, ${S0}, 0.4), zpMilky);
    zpAlpha += 0.07 * zpMilky;

    // ── as cáusticas, NO LEITO: o raio do olho segue por baixo da água até o fundo (a lâmina é uSpringMood.w) ──
    vec3 zpEye = normalize(vWorldFxPos - cameraPosition);
    vec2 zpBed = (floor((vWorldFxPos.xz + zpEye.xz / max(-zpEye.y, 0.25) * uSpringMood.w) * 16.0) + 0.5) / 16.0;
    float zpCa = sin(zpBed.x * 9.0 + 1.6 * sin(zpBed.y * 7.0 + zpT * 0.6) + zpT * 0.5)
      + sin(zpBed.y * 11.0 + 1.8 * sin(zpBed.x * 6.0 - zpT * 0.45) - zpT * 0.4);
    float zpCau = step(1.5, zpCa) * (0.3 + 0.7 * uSpringMood.x);
    zpCol = mix(zpCol, zpCol * 1.35 + vec3(0.02, 0.06, 0.06), zpCau);
    zpAlpha += 0.12 * zpCau;

    // ── a sombra do paredão do fundo sobre a água (o norte), em retícula ──
    float zpShade = smoothstep(-0.25, -0.95, zpN.y);
    zpCol *= 1.0 - 0.24 * step(zpRag2, zpShade);

    // ── a cascata: a espuma que ferve no pé dela e os anéis que saem dali ──
    float zpFd = length((zpP - uSpringFall.xy) * vec2(1.0, 1.5));
    float zpChurn = step(zpFd, 0.2 + 0.05 * sin(zpT * 6.0 + zpRag * 6.2832)) * step(0.18, zpRag2);
    float zpRings = step(0.8, sin(zpFd * 15.0 - zpT * 3.4)) * (1.0 - smoothstep(0.3, 1.6, zpFd)) * step(0.3, zpRag);

    // ── quem está dentro: o colar de espuma no corpo e os anéis lentos que ele solta ──
    float zpBd = length((zpP - uSpringBody.xy) * vec2(1.0, 1.45));
    float zpCollar = uSpringBody.z * step(abs(zpBd - 0.36), 0.05) * step(0.22, zpRag);
    float zpWave = uSpringBody.z * step(0.86, sin(zpBd * 10.0 - zpT * 1.7)) * (1.0 - smoothstep(0.45, 1.5, zpBd)) * step(zpRag2, 0.62);

    // ── a chuva: um anel por gota, que abre e some ──
    vec2 zpRc = floor(zpP * 2.5);
    float zpRh = zpHash(zpRc + 5.0);
    float zpRt = fract(zpT * 0.85 + zpRh * 9.0);
    vec2 zpRo = (zpRc + 0.5 + (vec2(zpHash(zpRc + 9.0), zpHash(zpRc + 13.0)) - 0.5) * 0.6) / 2.5;
    float zpDrop = uSpringMood.z * step(abs(length((zpP - zpRo) * vec2(1.0, 1.4)) - zpRt * 0.2), 0.03) * (1.0 - zpRt) * step(zpRh, 0.85);

    // ── a margem: a espuma que lambe a pedra, quebrada ──
    float zpLap = 0.9 + 0.6 * sin(zpP.x * 5.0 + zpT * 0.8) + 0.5 * sin(zpP.y * 7.0 - zpT * 0.55);
    float zpEdgeFoam = step(zpE, zpLap) * step(0.3, zpRag);
    float zpFoam = max(max(zpEdgeFoam, zpChurn), zpCollar);
    float zpLines = max(max(zpRings, zpWave), zpDrop);
    zpCol = mix(zpCol, zpCol * 1.22 + vec3(0.02, 0.05, 0.05), zpLines * (1.0 - zpFoam));
    zpAlpha += 0.2 * zpLines;
    zpCol = mix(zpCol, ${FOAM}, zpFoam);
    zpAlpha = mix(zpAlpha, 0.92, zpFoam);

    zpTone = zpCol;
    diffuseColor.rgb *= zpCol;
    diffuseColor.a = min(zpAlpha, 1.0);
    zpWaterMask = 1.0 - zpFoam;
    // o céu: mais no miolo (na beira quem manda é o leito), e mais de noite (as estrelas e a lua na água). Com mais que
    // isto, o céu claro da madrugada lavava a água inteira de branco.
    zpSkyMask = zpWaterMask * (0.3 + 0.4 * uSpringMood.y * uSpringMood.y) * smoothstep(1.0, 7.0, zpE);
    zpShoreV = 0.0;
  }
`;

/** Depois da luz (e do céu na água): a luz própria da noite e o dourado da lanterna. */
export const SPRING_GLOW_GLSL = /* glsl */ `
  {
    // (é ela que segura o turquesa quando a luz do mundo é laranja, no amanhecer, ou quase nenhuma, de noite)
    gl_FragColor.rgb += zpTone * 0.3 * uSpringMood.y * zpWaterMask;
    float zpLd = length((zpP - uSpringLamp.xy) * vec2(1.0, 1.25));
    float zpWarm = (1.0 - smoothstep(0.5, 3.0, zpLd)) * uSpringLamp.z;
    float zpSpark = step(0.86, zpHash(floor(vWorldFxPos.xz * vec2(8.0, 16.0)) + floor(uFlowTime * 2.5)));
    gl_FragColor.rgb += vec3(1.0, 0.56, 0.16) * zpWarm * (0.07 + 0.3 * zpSpark) * zpWaterMask;
  }
`;
