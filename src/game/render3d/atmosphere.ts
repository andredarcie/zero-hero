// O CÉU QUE A CÂMERA NÃO VÊ. Ela olha 48° para baixo e o horizonte nunca entra no quadro, mas o céu existe: as nuvens
// passam e a sombra delas atravessa o vale, o lago devolve as nuvens, as estrelas e a lua, e o ar entre as árvores
// pega a luz do sol. Este módulo guarda o que essas três leituras dividem — UM campo de nuvens, UM rumo de sol, UMA
// cor de céu —, porque nuvem que faz sombra num lugar e aparece refletida em outro denuncia dois sistemas.
//
// Nada aqui é luz THREE (a contagem de luzes é selada): são uniforms que o acabamento (finishShader), o ar (AirLight)
// e a água (pixelArtLight) leem.

import * as THREE from 'three';

/** O lado da textura de ruído, em texels. Ela se repete (RepeatWrapping) e não tem emenda: o ruído é periódico. */
const NOISE_SIZE = 128;
/** Quantos tiles do mundo uma volta da textura cobre: a mancha de nuvem mais larga tem ~um quarto disso. */
export const CLOUD_SPAN_TILES = 24;
/**
 * O CÉU NA ÁGUA É UMA CAMADA RASA (pixelArtLight.WATER_SKY_GLSL conta por quê). O ponto do campo de nuvens que um pixel
 * de água devolve é `pixel × SKY_MIRROR_SCALE + raio refletido × SKY_MIRROR_DEPTH`:
 *   · a ESCALA diz de que tamanho a nuvem sai na água: 2 = metade do tamanho da sombra dela no chão;
 *   · a PROFUNDIDADE diz quanto o reflexo escorrega quando a câmera anda. Com a câmera a ~9 tiles da água, ele desliza
 *     a DEPTH/9 ÷ (SCALE + DEPTH/9) da velocidade dela: um quinto. Subir este número é voltar a ver o céu correr.
 */
export const SKY_MIRROR_SCALE = 2;
export const SKY_MIRROR_DEPTH = 4.5;
/** As estrelas moram na mesma camada: quantas células da grade delas cabem numa unidade dela (uma ≈ ¼ de tile de água). */
export const SKY_MIRROR_STARS = 1.55;

/** Um inteiro embaralhado em [0, 1): o mesmo número para a mesma célula, sem `Math.random` (o mundo é determinístico). */
const hash = (x: number, y: number, seed: number): number => {
  let h = (x * 374761393 + y * 668265263 + seed * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/** Ruído de valor PERIÓDICO: a grade dá a volta em `period` células, então a textura se repete sem emenda. */
const periodicNoise = (x: number, y: number, period: number, seed: number): number => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const wrap = (v: number): number => ((v % period) + period) % period;
  const a = hash(wrap(x0), wrap(y0), seed);
  const b = hash(wrap(x0 + 1), wrap(y0), seed);
  const c = hash(wrap(x0), wrap(y0 + 1), seed);
  const d = hash(wrap(x0 + 1), wrap(y0 + 1), seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
};

/** Quatro oitavas somadas (cada uma com o dobro da frequência e metade do peso), de volta em [0, 1]. */
const fbm = (u: number, v: number, base: number, seed: number): number => {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let period = base;
  for (let o = 0; o < 4; o++) {
    sum += periodicNoise(u * period, v * period, period, seed + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / norm;
};

let noiseTexture: THREE.DataTexture | null = null;

/**
 * O RUÍDO DO CÉU: R = as nuvens (manchas largas), G = o miolo delas (manchas médias), B = a poeira do ar (fina).
 * Feito uma vez, na primeira leitura, e dividido por todo mundo que desenha céu.
 */
export const skyNoiseTexture = (): THREE.DataTexture => {
  if (noiseTexture) return noiseTexture;
  const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);
  for (let y = 0; y < NOISE_SIZE; y++) {
    for (let x = 0; x < NOISE_SIZE; x++) {
      const u = x / NOISE_SIZE;
      const v = y / NOISE_SIZE;
      const i = (y * NOISE_SIZE + x) * 4;
      data[i] = Math.round(fbm(u, v, 4, 11) * 255);
      data[i + 1] = Math.round(fbm(u, v, 8, 53) * 255);
      data[i + 2] = Math.round(fbm(u, v, 16, 97) * 255);
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, NOISE_SIZE, NOISE_SIZE, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  noiseTexture = tex;
  return tex;
};

/**
 * O que o céu é AGORA, para quem o desenha. Escritos uma vez por quadro pelo SkyLight (a hora do dia manda) e lidos
 * pelos três shaders; em 0 cada efeito some por inteiro (`uCloudShade`, `uStars`...).
 */
export const skyUniforms = {
  uSkyNoise: { value: null as THREE.Texture | null },
  /** Quanto as nuvens já andaram, em tiles: o vento do céu vezes o relógio do mundo. */
  uCloudDrift: { value: new THREE.Vector2() },
  /** O limiar das nuvens: menor = céu mais coberto. */
  uCloudCover: { value: 0.52 },
  /** Quanto a sombra de uma nuvem escurece o chão (0 = sem sombra de nuvem). */
  uCloudShade: { value: 0 },
  /** A cor do céu limpo, a da nuvem e a do horizonte, como o lago as devolve. */
  uSkyColor: { value: new THREE.Color(0x0a1024) },
  uCloudColor: { value: new THREE.Color(0x1a2238) },
  /** Estrelas e lua no reflexo (0 de dia, 1 na noite fechada). */
  uStars: { value: 0 },
  /** Para onde fica o sol (de dia) ou a lua (de noite): unitário, no mundo. */
  uSunDir: { value: new THREE.Vector3(-0.5, 0.7, -0.5) },
  /** A cor com que o ar acende atravessado pela luz (o sol dourado, a lua azulada), já com a força. */
  uSunAir: { value: new THREE.Color(0, 0, 0) },
  // ── A SOMBRA QUE OS CORPOS RECEBEM (ver SPRITE_SHADE_GLSL em pixelArtLight) ──
  // A máscara das silhuetas vista de cima (a do AirLight, do quadro anterior), o retângulo do mundo que ela cobre
  // (x mínimo, z MÁXIMO, largura, altura) e o passo em direção ao sol que tira o corpo da própria sombra.
  uShadeMap: { value: null as THREE.Texture | null },
  uShadeRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  uShadeProbe: { value: new THREE.Vector2() },
  uShadeOn: { value: 0 },
  // ── A LUZ DE CONTORNO (ver RIM_GLSL em spriteOutline) ──
  /** A cor do fio de sol/lua na borda, já com a força; e quanto dele pega de lado (x: +1 = direita) e por cima (y). */
  uRimSun: { value: new THREE.Color(0, 0, 0) },
  uRimSide: { value: new THREE.Vector2(0, 0) },
  /** A chama mais perto: onde está no chão (x, z), até onde o fio dela alcança, e a cor já com a força. */
  uRimFire: { value: new THREE.Vector3(0, 0, 0) },
  uRimFireColor: { value: new THREE.Color(0, 0, 0) },
};

/** As declarações de GLSL de quem lê o campo de nuvens (o chão sombreado, o reflexo do lago). */
export const CLOUD_FIELD_GLSL = /* glsl */ `
  uniform sampler2D uSkyNoise;
  uniform vec2 uCloudDrift;
  uniform float uCloudCover;
  // Quanto de nuvem há sobre este ponto do mundo (0 = céu limpo, 1 = nuvem cheia).
  float zhCloud(vec2 worldXZ) {
    vec2 uv = (worldXZ + uCloudDrift) / ${CLOUD_SPAN_TILES.toFixed(1)};
    float n = texture2D(uSkyNoise, uv).r * 0.7 + texture2D(uSkyNoise, uv * 2.3 + vec2(0.37, 0.11)).g * 0.3;
    return smoothstep(uCloudCover, uCloudCover + 0.13, n);
  }
`;
