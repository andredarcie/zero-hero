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

/** Quantos tiles pisados sacodem ao mesmo tempo (o herói anda tile a tile; o pisão dura ~0,4 s). */
export const STAND_RUSTLE_SLOTS = 4;

/**
 * O PISÃO, um tile por slot: (x, z do centro do tile, quanto a ponta anda em pixels de arte, 1 = ativo). Era um atributo
 * por vértice, reescrito a cada quadro; com a grama em FIOS (grassBlades.ts) um tile vira dezenas de quads espalhados
 * pela malha, e reescrever o atributo subiria a malha inteira para a placa a cada quadro de caminhada.
 */
export const standRustleUniform: THREE.IUniform<THREE.Vector4[]> = {
  value: Array.from({ length: STAND_RUSTLE_SLOTS }, () => new THREE.Vector4(0, 0, 0, 0)),
};

/**
 * A ESTEIRA (pedido do autor, 2026-11-10: "faça o herói interagir com eles quando passa, dando um efeito relaxante ao
 * passar e satisfatório"). Cada passo de quem anda pela grama larga um anel no chão: ele se espalha do ponto do passo,
 * cada fio que ele alcança é empurrado para longe e VOLTA balançando, cada vez menos, até assentar — uma mola
 * amortecida, uma vez e meia por segundo, que some em um segundo e meio. Passos seguidos deixam uma esteira atrás do
 * herói, como um barco na água. Um slot por passo: (x, z do passo, a hora em que ele aconteceu no relógio da água, a
 * força). O StandingDecor escreve os passos num anel de slots; o mais velho cede o lugar quando já quase assentou.
 */
export const STAND_WAKE_SLOTS = 12;
export const standWakeUniform: THREE.IUniform<THREE.Vector4[]> = {
  value: Array.from({ length: STAND_WAKE_SLOTS }, () => new THREE.Vector4(0, 0, -100, 0)),
};
/** Até onde o anel de um passo chega, em tiles, e quanto tempo ele vive, em segundos. */
export const STAND_WAKE_RADIUS = 1.3;
export const STAND_WAKE_LIFE = 2.4;

/**
 * A PASSADA DA FRENTE: a mesma malha desenhada de novo DEPOIS dos personagens, só com os fios que estão logo à frente
 * dos pés de quem está no foco (o slot 0 dos corpos). O herói grava profundidade, então o fio que está mais perto da
 * câmera que ele passa no teste e cobre os pés dele, e o que está atrás não. É o que faz ele ATRAVESSAR o capim em vez
 * de andar por cima dele. 0 na passada normal, 1 na da frente (um material próprio, o mesmo programa).
 */
export const standFrontOffUniform: THREE.IUniform<number> = { value: 0 };

/** O máximo que a ponta de um fio anda para o lado, em pixels de arte: a margem do quad dele (grassBlades.ts). */
export const STAND_BLADE_SWING = 6;

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
/**
 * A esteira: o anel anda 5 tiles por segundo, a mola balança 8 radianos por segundo (~1,3 vez) e perde o fôlego à
 * taxa de 2 por segundo; entra em 0,08 s (nunca um tranco), leva a ponta até 6 pixels (na escala da altura do fio) e
 * deita o fio para trás ou para a frente um quarto da altura dele.
 */
const WAKE_SPEED = '5.0';
const WAKE_FREQ = '8.0';
const WAKE_DECAY = '2.0';
const WAKE_ATTACK = '0.08';
const WAKE_TEXELS = '6.0';
const WAKE_LEAN = '0.25';
/**
 * A passada da frente: os fios até 0,75 tile à frente dos pés de quem está no foco, e até 0,7 tile para cada lado. A
 * profundidade é também a faixa da malha que ela desenha (StandingDecor, `drawRange`): a malha vem ordenada do norte
 * para o sul, então os fios à frente do herói são uma fatia contínua dela.
 */
export const STAND_FRONT_DEPTH = 0.75;
const FRONT_DEPTH = STAND_FRONT_DEPTH.toFixed(2);
const FRONT_WIDTH = '0.7';
/** A luz de coisa em pé: o pé no escuro do chão, a ponta acesa, o lado da luz (esquerda) e o da sombra. */
const FOOT_SHADE = '0.7';
const TOP_SHADE = '1.06';
const TIP_LIFT = '1.24';
const LIT_SIDE = '1.08';
const DARK_SIDE = '0.9';

/**
 * Entra logo depois do `#include <begin_vertex>`, ANTES das outras injeções (ver patchPixelMaterial): a luz em
 * baixa resolução e a máscara de sombra leem a decoração já em pé.
 * `aStand` = (x, z de onde a brisa e o abrir são medidos, a altura deste vértice acima do pé — 0 no pé, na escala da
 * arte —, a fase do tremular); `aFlex` = 1 na planta, 0 no que é rígido; `aBlade` = (pixels do fio abaixo do quad + 1
 * — 0 se não é fio —, pixels do pé, altura do fio, crescimento da haste). Precisa de `zhWindWave`, `uWind` e
 * `uFlowTime` declarados.
 *
 * UM FIO cresce em pé (o pé escuro como foi desenhado, cada pixel da haste repetido `aBlade.w` vezes), curva a partir
 * do PRÓPRIO pé e com a força da própria altura, tremula no seu tempo (a fase e o ritmo saem do fio) em cima da rajada,
 * que é a mesma onda larga para o vale inteiro, e balança na esteira de quem passa.
 */
export const STAND_VERTEX_GLSL = /* glsl */ `
  {
    float zhH = aStand.z;
    float zhIsBlade = step(0.5, aBlade.x);
    // o fio cresce em pé: a fileira que se vê de cada vértice, em pixels, com a haste repetida (deitado, nada)
    float zhGrow = mix(1.0, max(aBlade.w, 1.0), uStand);
    float zhArt = zhH * 16.0;
    float zhOut = zhArt <= aBlade.y ? zhArt : aBlade.y + (zhArt - aBlade.y) * zhGrow;
    float zhOutTotal = aBlade.z <= aBlade.y ? aBlade.z : aBlade.y + (aBlade.z - aBlade.y) * zhGrow;
    if (zhIsBlade > 0.5) transformed.y += (zhOut - zhArt) / 16.0;
    float zhSeen = zhIsBlade > 0.5 ? zhOut / 16.0 : zhH;
    // deitada: o topo volta para o chão, para o norte (a arte deitada tem o topo ao norte)
    float zhLay = zhH * (1.0 - uStand);
    transformed.y -= zhLay;
    transformed.z -= zhLay;
    float zhLive = aFlex * uStand;
    vec2 zhPush = vec2(0.0);
    float zhRustle = 0.0;
    vec2 zhWake = vec2(0.0);
    // O que não balança (a sombra de contato, a pedra, o osso) não precisa saber de ninguém: os laços são para planta.
    if (zhLive > 0.0) {
      for (int zhI = 0; zhI < ${STAND_ACTOR_SLOTS}; zhI++) {
        vec4 zhA = uStandActors[zhI];
        vec2 zhD = aStand.xy - zhA.xy;
        float zhDist = length(zhD);
        float zhK = zhA.w * (1.0 - smoothstep(zhA.z * 0.3, zhA.z, zhDist));
        zhPush += (zhDist > 0.001 ? zhD / zhDist : vec2(0.0, 1.0)) * zhK;
      }
      float zhPl = length(zhPush);
      if (zhPl > 1.0) zhPush /= zhPl;
      // o pisão: o tile pisado sacode (o slot diz qual tile e quanto; o pé de um fio cai dentro do tile dele)
      for (int zhR = 0; zhR < ${STAND_RUSTLE_SLOTS}; zhR++) {
        vec4 zhS = uStandRustle[zhR];
        vec2 zhQ = abs(aStand.xy - zhS.xy);
        // 0,66: o pé de um fio pode estar até 0,625 tile do centro (a fileira de baixo do quadro mais o espalhamento)
        if (zhS.w > 0.5 && max(zhQ.x, zhQ.y) < 0.66) zhRustle += zhS.z;
      }
      // A ESTEIRA: cada passo é um anel que se espalha; o fio que ele alcança vai para longe e volta balançando
      for (int zhW = 0; zhW < ${STAND_WAKE_SLOTS}; zhW++) {
        vec4 zhE = uStandWake[zhW];
        if (zhE.w <= 0.0) continue;
        vec2 zhD = aStand.xy - zhE.xy;
        float zhDist = length(zhD);
        float zhAge = uFlowTime - zhE.z - zhDist / ${WAKE_SPEED};
        if (zhDist > ${STAND_WAKE_RADIUS.toFixed(2)} || zhAge < 0.0 || zhAge > ${STAND_WAKE_LIFE.toFixed(2)}) continue;
        float zhEnv = zhE.w * smoothstep(0.0, ${WAKE_ATTACK}, zhAge) * exp(-zhAge * ${WAKE_DECAY})
          * (1.0 - smoothstep(${(STAND_WAKE_RADIUS * 0.3).toFixed(2)}, ${STAND_WAKE_RADIUS.toFixed(2)}, zhDist));
        zhWake += (zhDist > 0.001 ? zhD / zhDist : vec2(0.0, 1.0)) * zhEnv * cos(zhAge * ${WAKE_FREQ});
      }
    }
    // a força cabe na altura do fio (já crescido); uma peça de tile tem a força inteira
    float zhTip = zhIsBlade > 0.5 ? clamp(zhOutTotal / 8.0, 0.25, 1.0) : 1.0;
    // a curva da PONTA, em pixels de arte: a mesma nos quatro cantos (tudo é medido do mesmo ponto). A fase de uma peça
    // de tile é 0: ela tremula como sempre tremulou.
    float zhRate = 2.9 + fract(aStand.w * 0.159) * 1.2;
    float zhFlutter = sin(uFlowTime * zhRate + aStand.x * 1.9 + aStand.y * 1.3 + aStand.w) * ${FLUTTER_TEXELS};
    float zhBend = ((zhWindWave(aStand.xy) * ${SWAY_TEXELS} + zhFlutter) * uWind + zhPush.x * ${PART_TEXELS}
      + zhWake.x * ${WAKE_TEXELS} + zhRustle) * zhLive * zhTip;
    // o fio nunca passa da margem do quad dele (a ponta sumiria): seis décimos da altura em pé, entre 2 e o máximo —
    // a mesma conta de grassBlades.bladeSwing
    float zhSwing = min(${STAND_BLADE_SWING.toFixed(1)}, max(2.0, ceil(zhOutTotal * 0.6)));
    vZhBend = zhIsBlade > 0.5 ? clamp(zhBend, -zhSwing, zhSwing) : zhBend;
    vZhBlade = vec4(zhIsBlade, zhOut, zhOutTotal, max(aBlade.x - 1.0, 0.0));
    vZhBladeG = vec2(aBlade.y, zhGrow);
    transformed.z += floor((zhPush.y * ${BOW} + zhWake.y * ${WAKE_LEAN}) * zhSeen * zhLive * 16.0 + 0.5) / 16.0;
    // A PASSADA DA FRENTE (uStandFront 1): só os fios logo à frente dos pés de quem está no foco; o resto vira um ponto
    if (uStandFront > 0.5) {
      vec4 zhHero = uStandActors[0];
      vec2 zhRel = aStand.xy - zhHero.xy;
      bool zhKeep = zhIsBlade > 0.5 && zhHero.w > 0.5 && zhRel.y > 0.0 && zhRel.y < ${FRONT_DEPTH} && abs(zhRel.x) < ${FRONT_WIDTH};
      if (!zhKeep) transformed = vec3(0.0);
    }
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
  float zhStandRow = 0.0;
  vec2 zhStandUv = vec2(0.0);
  vec2 zhStandBend(vec2 uv, vec4 bounds) {
    if (vZhBlade.x > 0.5) {
      // UM FIO: a fileira que se vê, contada do pé dele e já com a haste crescida, diz qual pixel da arte mostrar — o
      // pé um por um, a haste repetida. Pixel inteiro: a cor muda sempre na borda de uma fileira.
      zhStandRow = floor(vZhBlade.y);
      float zhF = vZhBladeG.x;
      float zhArtRow = zhStandRow < zhF ? zhStandRow : zhF + floor((zhStandRow - zhF) / max(vZhBladeG.y, 1.0));
      uv.y = bounds.y + (zhArtRow - vZhBlade.w) / uMapSize.y;
      zhStandT = (zhStandRow + 0.5) / max(vZhBlade.z, 1.0);
    } else {
      // numa peça de tile, do pé do quadro, em 16 fileiras
      zhStandRow = floor(uv.y * uMapSize.y) - floor(bounds.y * uMapSize.y); // 0 = a fileira de baixo da janela
      zhStandT = (zhStandRow + 0.5) / 16.0;
    }
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
    // a ponta: num fio, a fileira de cima dele (a haste crescida repete o mesmo pixel da arte, e só o topo é ponta);
    // numa peça, o pixel cuja fileira de cima está vazia
    bool zhTipNow = vZhBlade.x > 0.5 ? zhStandRow >= vZhBlade.z - 1.0 : zhStandAlphaAt(zhTx + vec2(0.0, 1.0), vUvBounds) < 0.5;
    if (zhTipNow) zhShade *= mix(${TIP_LIFT}, 1.0, smoothstep(0.3, 0.55, zhLuma));
    if (vZhBlade.x < 0.5) {
      if (zhStandAlphaAt(zhTx - vec2(1.0, 0.0), vUvBounds) < 0.5) zhShade *= ${LIT_SIDE};
      if (zhStandAlphaAt(zhTx + vec2(1.0, 0.0), vUvBounds) < 0.5) zhShade *= ${DARK_SIDE};
    }
    diffuseColor.rgb *= mix(1.0, zhShade, uStand);
  }
`;
