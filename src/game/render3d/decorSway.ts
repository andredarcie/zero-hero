// A DECORAÇÃO EM PÉ SE MEXE E PEGA LUZ (render3d/standingDecor.ts): ficar em pé, a brisa, o abrir e o pisão das
// plantas, e a luz de coisa em pé em tudo.
//
// Mora num módulo sem dependência do pixelArtLight de propósito: é o pixelArtLight que o injeta (opção `standing` do
// patchPixelMaterial, junto da mesma onda de vento `zhWindWave` da mata — uma brisa só no vale), e o standingDecor,
// que monta a malha, importa o pixelArtLight. Os dois lados leem daqui sem ciclo.
//
// POR QUE A PLANTA SE CURVA NO FRAGMENTO, e não inclina o quad: a arte da decoração é vista de cima (risquinhos e
// florzinhas espalhados pelo tile inteiro), e um quad inteiro inclinado de 1 pixel não lê como planta balançando —
// lê como um cartão. Aqui cada FILEIRA da arte anda para o lado em pixel inteiro, e quanto mais alta mais anda (o
// quadrado da altura): a fileira do pé fica, a ponta vai mais longe. É o balanço de pixel art, e nunca escorrega
// meio pixel. O que é rígido (pedra, osso, cogumelo, graveto, cristal, brasa, folha caída) tem `aFlex` 0 e fica
// parado — o que é rígido no mundo tem de ficar rígido na tela.
//
// POR QUE A LUZ: em pé, a decoração precisa da luz de coisa em pé para ler como em pé — o pé no escuro do chão, a
// ponta acesa, o lado esquerdo mais claro (a luz da arte do tileset vem da esquerda). Era o que fazia os tufos do
// primeiro gramado (desfeito) parecerem em pé. Tudo em faixas de fileira inteira, sem degradê.

import * as THREE from 'three';

/** Quantos corpos a decoração sente ao mesmo tempo (o herói, os vizinhos à vista, o gato). Fixo: é um array no shader. */
export const STAND_ACTOR_SLOTS = 8;

/**
 * Os corpos que abrem as plantas, um por slot: (x, z do pé, raio em tiles, 1 = presente). Escritos a cada quadro
 * pelo StandingDecor a partir dos corpos do espelho d'água (os mesmos que aparecem na água: herói, vizinhos, gato).
 */
export const standActorsUniform: THREE.IUniform<THREE.Vector4[]> = {
  value: Array.from({ length: STAND_ACTOR_SLOTS }, () => new THREE.Vector4(0, 0, 1, 0)),
};

/**
 * 1 = a decoração em pé; 0 = deitada no chão, exatamente o adesivo de antes (o knob `hd3d.stand`, o A/B ao vivo). Em
 * pé ou deitada é a MESMA malha: o topo do quad gira em volta do pé, para o norte, que é onde a arte deitada sempre
 * esteve. Deitada, a curva e a luz de coisa em pé somem junto.
 */
export const standUniform: THREE.IUniform<number> = { value: 1 };

/**
 * Quanto a arte pode andar para o lado, em pixels de arte: o quad em pé é mais largo que o tile por isso de cada
 * lado (só a ponta que balança passa da beira; parado, a margem é transparente).
 */
export const STAND_SWING_TEXELS = 6;
/**
 * A brisa: a onda larga da mata leva a ponta até 4 pixels de arte, e um TREMULAR mais rápido e curto, de tile para
 * tile, soma até 1,5 — capim não só se inclina com a rajada, ele tremula entre uma e outra. A fileira do pé, nada.
 */
const SWAY_TEXELS = '4.0';
const FLUTTER_TEXELS = '1.5';
/** O abrir: a ponta foge até 4 pixels de quem passa... */
const PART_TEXELS = '4.0';
/** ...e se deita para longe dele (para trás ou para a frente), em tiles. */
const BOW = '0.16';
/** A luz de coisa em pé: o pé no escuro do chão, a ponta acesa, o lado da luz (esquerda) e o da sombra. */
const FOOT_SHADE = '0.7';
const TOP_SHADE = '1.06';
const TIP_LIFT = '1.24';
const LIT_SIDE = '1.08';
const DARK_SIDE = '0.9';

/**
 * Entra logo depois do `#include <begin_vertex>`, ANTES das outras injeções (ver patchPixelMaterial): a luz em
 * baixa resolução e a máscara de sombra leem a decoração já em pé.
 * `aStand` = (x, z do centro do tile, a altura deste vértice acima do pé — 0 no pé —, o pisão em pixels de arte);
 * `aFlex` = 1 na planta, 0 no que é rígido. Precisa de `zhWindWave`, `uWind` e `uFlowTime` declarados.
 */
export const STAND_VERTEX_GLSL = /* glsl */ `
  {
    float zhH = aStand.z;
    // deitada: o topo volta para o chão, para o norte (a arte deitada tem o topo ao norte)
    float zhLay = zhH * (1.0 - uStand);
    transformed.y -= zhLay;
    transformed.z -= zhLay;
    vec2 zhPush = vec2(0.0);
    for (int zhI = 0; zhI < ${STAND_ACTOR_SLOTS}; zhI++) {
      vec4 zhA = uStandActors[zhI];
      vec2 zhD = aStand.xy - zhA.xy;
      float zhDist = length(zhD);
      float zhK = zhA.w * (1.0 - smoothstep(zhA.z * 0.3, zhA.z, zhDist));
      zhPush += (zhDist > 0.001 ? zhD / zhDist : vec2(0.0, 1.0)) * zhK;
    }
    float zhPl = length(zhPush);
    if (zhPl > 1.0) zhPush /= zhPl;
    float zhLive = aFlex * uStand;
    // a curva da PONTA, em pixels de arte: a mesma nos quatro cantos (tudo é medido do centro do tile)
    float zhFlutter = sin(uFlowTime * 2.9 + aStand.x * 1.9 + aStand.y * 1.3) * ${FLUTTER_TEXELS};
    vZhBend = ((zhWindWave(aStand.xy) * ${SWAY_TEXELS} + zhFlutter) * uWind + zhPush.x * ${PART_TEXELS} + aStand.w) * zhLive;
    transformed.z += floor(zhPush.y * ${BOW} * zhH * zhLive * 16.0 + 0.5) / 16.0;
  }
`;

/**
 * As funções do fragmento, declaradas depois do TEXEL_AA_GLSL (é de lá que vem `uMapSize`). `zhStandBend` desloca a
 * leitura da arte pela fileira (a curva) e marca o que caiu fora do quadro; o AA de texel lê do resultado.
 * Os quadros do tileset têm 16 fileiras.
 */
export const STAND_FRAGMENT_PARS_GLSL = /* glsl */ `
  float zhStandOut = 0.0;
  float zhStandT = 0.0;
  vec2 zhStandUv = vec2(0.0);
  vec2 zhStandBend(vec2 uv, vec4 bounds) {
    float row = floor(uv.y * uMapSize.y) - floor(bounds.y * uMapSize.y); // 0 = a fileira de baixo do quadro
    zhStandT = (row + 0.5) / 16.0;
    uv.x -= floor(vZhBend * zhStandT * zhStandT + 0.5) / uMapSize.x;
    float zhHalf = 0.5 / uMapSize.x; // ("half" é palavra reservada do GLSL)
    if (uv.x < bounds.x - zhHalf || uv.x > bounds.z + zhHalf) zhStandOut = 1.0;
    zhStandUv = uv;
    return uv;
  }
  float zhStandAlphaAt(vec2 texel, vec4 bounds) {
    vec2 uv = texel / uMapSize;
    if (uv.x < bounds.x || uv.x > bounds.z || uv.y < bounds.y || uv.y > bounds.w) return 0.0;
    return texture2D(map, uv).a;
  }
`;

/**
 * Antes do `alphamap_fragment` (depois da arte e da rampa do bioma): o que a curva levou para fora do quadro some, e
 * a luz de coisa em pé — o pé escuro e a ponta clara em quatro faixas de fileira, a ponta de cada traço acesa (a
 * fileira de cima dele vazia; nunca no que já é claro, a pétala branca, senão ela estoura no bloom), o lado esquerdo
 * claro e o direito escuro. Deitada (`uStand` 0), nada disto.
 */
export const STAND_FRAGMENT_SHADE_GLSL = /* glsl */ `
  if (zhStandOut > 0.5) diffuseColor.a = 0.0;
  if (uStand > 0.0 && diffuseColor.a > 0.0) {
    vec2 zhTx = floor(zhStandUv * uMapSize) + 0.5;
    float zhShade = mix(${FOOT_SHADE}, ${TOP_SHADE}, clamp(floor(zhStandT * 4.0) / 3.0, 0.0, 1.0));
    float zhLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    if (zhStandAlphaAt(zhTx + vec2(0.0, 1.0), vUvBounds) < 0.5) zhShade *= mix(${TIP_LIFT}, 1.0, smoothstep(0.3, 0.55, zhLuma));
    if (zhStandAlphaAt(zhTx - vec2(1.0, 0.0), vUvBounds) < 0.5) zhShade *= ${LIT_SIDE};
    if (zhStandAlphaAt(zhTx + vec2(1.0, 0.0), vUvBounds) < 0.5) zhShade *= ${DARK_SIDE};
    diffuseColor.rgb *= mix(1.0, zhShade, uStand);
  }
`;
