// O CONTORNO DOS PERSONAGENS — a hierarquia de contraste (pedido do autor, 2026-11-10): o chão é o fundo e quem
// fala com o herói é o assunto. O herói e os vizinhos são silhuetas de 16 px sobre um chão granulado da mesma família
// de valor, e à distância eles se misturavam com a decoração. Um anel de 1 texel, escuro e meio transparente, separa
// a silhueta do chão sem virar o "contorno preto" que o padrão da arte proíbe: é tinta (o navy da casa), não preto,
// e deixa o chão aparecer através dele.
//
// Ele vive DENTRO do quad do sprite (a lei: nenhum sprite vaza do seu tile) — é o texel transparente vizinho de um
// opaco que se pinta, e nunca um pixel a mais. As quatro leituras ficam presas à janela do quadro na folha
// (`repeat`/`offset`, o `mapTransform`): numa folha de animação o quadro do lado não vaza para dentro.

import * as THREE from 'three';

/**
 * A força do anel (0 = sem contorno) e a cor dele. A força é o knob vivo `hd3d.outline` (o FrameRenderer a copia a cada
 * quadro): decisão de olho.
 */
export const outlineUniforms = {
  uOutline: { value: 0.62 } as THREE.IUniform<number>,
  // O ink da casa (spritefactory: "o preto do jogo é o navy #1d2b53"), um degrau abaixo: #141d38.
  uOutlineColor: { value: new THREE.Color('#141d38') } as THREE.IUniform<THREE.Color>,
};

/** Vértice: a janela do quadro na folha, nos dois cantos (o `mapTransform` é do vértice; o fragmento não o vê). */
export const OUTLINE_VERTEX_GLSL = /* glsl */ `
  #ifdef USE_MAP
    vZhFrameA = ( mapTransform * vec3( 0.0, 0.0, 1.0 ) ).xy;
    vZhFrameB = ( mapTransform * vec3( 1.0, 1.0, 1.0 ) ).xy;
  #endif
`;

/**
 * Fragmento, logo depois da leitura da arte: o texel transparente que encosta num opaco vira o anel. O alfa sai do
 * `opacity` do material, para o anel sumir junto quando o corpo some.
 */
export const OUTLINE_FRAGMENT_GLSL = /* glsl */ `
  #ifdef USE_MAP
  if ( uOutline > 0.0 && diffuseColor.a < 0.5 ) {
    vec2 zhTs = 1.0 / vec2( textureSize( map, 0 ) );
    // MEIO TEXEL PARA DENTRO da divisa: presa exatamente na borda, a leitura NEAREST cai no primeiro texel do quadro
    // vizinho da folha — opaco — e o anel virava uma caixa escura em volta do sprite inteiro.
    vec2 zhLo = min( vZhFrameA, vZhFrameB ) + zhTs * 0.5;
    vec2 zhHi = max( vZhFrameA, vZhFrameB ) - zhTs * 0.5;
    float zhNear = max(
      max( texture2D( map, clamp( vMapUv + vec2( zhTs.x, 0.0 ), zhLo, zhHi ) ).a,
           texture2D( map, clamp( vMapUv - vec2( zhTs.x, 0.0 ), zhLo, zhHi ) ).a ),
      max( texture2D( map, clamp( vMapUv + vec2( 0.0, zhTs.y ), zhLo, zhHi ) ).a,
           texture2D( map, clamp( vMapUv - vec2( 0.0, zhTs.y ), zhLo, zhHi ) ).a ) );
    if ( zhNear >= 0.5 ) diffuseColor = vec4( uOutlineColor, uOutline * opacity );
  }
  #endif
`;
