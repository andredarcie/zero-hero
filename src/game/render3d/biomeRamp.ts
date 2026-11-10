// A RAMPA DO BIOMA — a troca de paleta que substituiu a cor multiplicada (pedido do autor, 2026-11-10: "melhorar
// a beleza do que já tem").
//
// O bioma pintava o terreno MULTIPLICANDO a arte por uma cor (world/biomes `tint`). Multiplicar não troca uma cor
// por outra: empurra TODAS para o mesmo lado. O verde do pinheiro do prado não chegava ao rosa da cerejeira (saía
// marrom), e a fruta laranja do pinheiro dos campos, multiplicada pelo dourado, saía em brasa — a mata parecia
// queimando. A saída é a dos jogos de 16 bits: a FOLHAGEM troca de rampa, o resto quase não muda.
//
//   · FOLHAGEM é a família oliva/ardósia do próprio tileset (o capim #43563a/#4a5e3a, a copa #3a3f3f/#626439):
//     pixel verde ou ciano frio, escuro o bastante. Tronco, fruta, flor, terra, pedra lilás e campânula azul ficam
//     de fora sozinhos, pela cor deles.
//   · A folha vira a COR-ALVO do bioma no VALOR do próprio pixel — o granulado da arte continua, só a tinta muda —,
//     com a sombra puxando para o frio e a luz para o quente (a rampa com matiz deslocado, nunca só mais escura).
//   · O resto leva o BRILHO do bioma e só um pouco do matiz dele. Na decoração, a flor ainda perde saturação e
//     valor: o chão é o fundo, o vizinho e o herói são o assunto (a hierarquia de contraste).
//
// NADA DE DADO NOVO. O vértice continua carregando o mesmo multiplicador × sombra de canto que sempre carregou
// (`biomeTintAt` × `tileAoCorners`): a cor-alvo é esse multiplicador vezes a cor de referência da arte (REF).
// Então toda malha que já pintava com `groundShadeAt` (o beiço da serra, a margem, o calçamento) continua
// emendando sem risco, e o leito do rio, que vem sem bioma (multiplicador 1), sai igual à arte.

import * as THREE from 'three';
import { CANOPY_REF, GRASS_REF } from '@/game/world/biomes';

/**
 * Quanto da rampa nova vale (1 = ela, 0 = a multiplicação de antes). Knob vivo (`hd3d.biomeRamp`): comparar as
 * duas é decisão de olho, e olho não recompila.
 */
export const biomeRampUniform: THREE.IUniform = { value: 1 };

export type BiomeRampKind = 'ground' | 'decor' | 'trees';

interface RampSpec {
  /** A cor da arte que o multiplicador do bioma leva à cor-alvo (a folha média do material). */
  ref: string;
  /** Quanto da variação de valor do próprio pixel fica (1 = toda; o chão perde um pouco do ruído fino). */
  keepVar: number;
  /** Fora da folha: quanto do MATIZ do bioma o pixel leva (o brilho ele leva inteiro). */
  keepHue: number;
  /** Fora da folha: a saturação e o valor que sobram (a flor da decoração se acalma). */
  accentSat: number;
  accentVal: number;
}

/**
 * Os três materiais de terreno. A referência do chão e da decoração é a MESMA (o capim): o tufo e o chão em que ele
 * nasce saem da mesma rampa, então a decoração não muda de família de cor ao pousar no chão. A das árvores é a
 * oliva da copa.
 */
export const BIOME_RAMP_SPECS: Readonly<Record<BiomeRampKind, RampSpec>> = {
  // O ruído fino do capim era a coisa mais alta do quadro de longe (dois verdes alternando a cada pixel): fica 72%
  // dele, e o grão continua lá.
  ground: { ref: GRASS_REF, keepVar: 0.72, keepHue: 0.4, accentSat: 1, accentVal: 1 },
  // A flor ainda acendia o bloom de dia (a luz do sol passa o limiar em qualquer arte clara): três quartos do valor.
  decor: { ref: GRASS_REF, keepVar: 1, keepHue: 0.22, accentSat: 0.7, accentVal: 0.74 },
  // A fruta laranja e a flor lilás na copa: um degrau abaixo, para a copa ler como copa e não como brasa.
  trees: { ref: CANOPY_REF, keepVar: 1, keepHue: 0.12, accentSat: 0.85, accentVal: 0.84 },
};

const linear = (hex: string): THREE.Color => new THREE.Color(hex); // three converte sRGB → linear ao ler o hex
const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
/** O tom médio da terra nua (#58553c, a cor mais comum dos quadros de terra): o centro em que o valor se acalma. */
const EARTH_MID = lum(linear('#58553c'));
const f = (n: number): string => n.toFixed(5);

/** A cor-alvo (linear) que um multiplicador de bioma dá à folha média deste material. */
export const rampTargetOf = (kind: BiomeRampKind, tint: readonly [number, number, number]): THREE.Color => {
  const ref = linear(BIOME_RAMP_SPECS[kind].ref);
  return new THREE.Color(ref.r * tint[0], ref.g * tint[1], ref.b * tint[2]);
};

/**
 * O GLSL que entra no lugar do `#include <color_fragment>` (onde o three multiplicava a arte pela cor de vértice).
 * As constantes são literais: cada material tem a sua, e elas entram na chave do programa pelo `kind`.
 */
export const biomeRampColorGlsl = (kind: BiomeRampKind): string => {
  const s = BIOME_RAMP_SPECS[kind];
  const ref = linear(s.ref);
  return /* glsl */ `
    #if defined( USE_COLOR )
    {
      vec3 zhM = vColor.rgb;
      vec3 zhTex = diffuseColor.rgb;
      const vec3 zhLw = vec3(0.2126, 0.7152, 0.0722);
      float zhL = dot(zhTex, zhLw);
      // FOLHA: verde ou ciano frio (g acima de r), nunca azul (campânula, cristal) nem clara (osso, flor branca).
      float zhGr = zhTex.g / max(zhTex.r, 0.0001);
      float zhBl = zhTex.b / max(zhTex.g, 0.0001);
      float zhLeaf = smoothstep(0.96, 1.02, zhGr)
        * (1.0 - smoothstep(1.08, 1.25, zhBl))
        * (1.0 - smoothstep(0.30, 0.45, zhL));
      // A rampa: a cor-alvo no valor do pixel, sombra fria e luz quente.
      float zhR = 1.0 + (zhL / ${f(lum(ref))} - 1.0) * ${f(s.keepVar)};
      vec3 zhShift = mix(vec3(0.90, 0.97, 1.16), vec3(1.07, 1.02, 0.86), smoothstep(0.45, 1.35, zhR));
      vec3 zhRamp = vec3(${f(ref.r)}, ${f(ref.g)}, ${f(ref.b)}) * zhM * zhR * zhShift;
      // O resto: o brilho do bioma (e a sombra de canto) só para ESCURECER, o matiz dele só um pouco. Clarear não:
      // a copa rosa é mais clara que a oliva de referência, e o tronco e a fruta dentro dela acendiam junto.
      float zhMl = min(dot(zhM, zhLw), 1.0);
      vec3 zhRest = zhTex * mix(vec3(zhMl), zhM * (zhMl / max(dot(zhM, zhLw), 0.0001)), ${f(s.keepHue)});
      // …e o valor da terra e da pedra também se acalma em volta de um tom médio, como o grão do capim.
      float zhRl = max(dot(zhRest, zhLw), 0.0005);
      zhRest *= (${f(EARTH_MID)} * zhMl + (zhRl - ${f(EARTH_MID)} * zhMl) * ${f(s.keepVar)}) / zhRl;
      zhRest = mix(vec3(dot(zhRest, zhLw)), zhRest, ${f(s.accentSat)}) * ${f(s.accentVal)};
      diffuseColor.rgb = mix(zhTex * zhM, mix(zhRest, zhRamp, zhLeaf), uBiomeRamp);
    }
    #endif
  `;
};
