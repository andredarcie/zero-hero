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
  // O sprite espelhado (setFlipX) tem a escala em x negativa: a "direita" da arte passa a ser a esquerda da tela.
  vZhFlip = modelMatrix[0][0] < 0.0 ? -1.0 : 1.0;
`;

/**
 * A LUZ DE CONTORNO (`hd3d.rim`) — o fio claro na borda de quem é o assunto do quadro, do lado de onde vem a luz.
 *
 * O anel escuro (acima) separa o personagem do chão; este é o par dele, e é o que cola o personagem na LUZ do mundo:
 * um sprite é pintado com uma luz só, para sempre, e sem isto o herói ao pôr do sol e o herói ao meio-dia são o mesmo
 * desenho. O texel OPACO que tem um vizinho vazio do lado da luz ganha um fio dela — do sol ou da lua (de lado, e por
 * cima quando a luz vem de trás ou do alto), e da chama mais perto, na cor dela, quando há uma: o vizinho sentado à
 * fogueira fica com a borda acesa virada para o fogo.
 *
 * É um texel de arte, na grade da arte, dentro do quad — nunca um pixel a mais. Entra como luz emitida (depois do teto
 * de luz), pesada pela cor da própria arte: o fio num casaco azul é azul claro, não branco.
 */
export const RIM_FRAGMENT_GLSL = /* glsl */ `
  #ifdef USE_MAP
  if ( diffuseColor.a >= 0.5 ) {
    vec2 zhRt = 1.0 / vec2( textureSize( map, 0 ) );
    vec2 zhRlo = min( vZhFrameA, vZhFrameB );
    vec2 zhRhi = max( vZhFrameA, vZhFrameB );
    vec2 zhAxis = sign( vZhFrameB - vZhFrameA );
    vec2 zhStepX = vec2( zhRt.x * zhAxis.x * vZhFlip, 0.0 );
    vec2 zhUvR = vMapUv + zhStepX;
    vec2 zhUvL = vMapUv - zhStepX;
    vec2 zhUvT = vMapUv + vec2( 0.0, zhRt.y * zhAxis.y );
    // Vazio = fora do quadro da folha, ou um texel transparente.
    float zhOpenR = ( zhUvR.x < zhRlo.x || zhUvR.x > zhRhi.x ) ? 1.0 : 1.0 - step( 0.5, texture2D( map, zhUvR ).a );
    float zhOpenL = ( zhUvL.x < zhRlo.x || zhUvL.x > zhRhi.x ) ? 1.0 : 1.0 - step( 0.5, texture2D( map, zhUvL ).a );
    float zhOpenT = ( zhUvT.y < zhRlo.y || zhUvT.y > zhRhi.y ) ? 1.0 : 1.0 - step( 0.5, texture2D( map, zhUvT ).a );
    float zhSunRim = max( ( uRimSide.x >= 0.0 ? zhOpenR : zhOpenL ) * abs( uRimSide.x ), zhOpenT * uRimSide.y );
    vec3 zhRim = uRimSun * zhSunRim;
    vec2 zhToFire = uRimFire.xy - vZhFootXZ;
    float zhFd = length( zhToFire );
    if ( zhFd < uRimFire.z && zhFd > 0.05 ) {
      vec2 zhFn = zhToFire / zhFd;
      float zhReach = 1.0 - zhFd / uRimFire.z;
      float zhFireRim = max( ( zhFn.x >= 0.0 ? zhOpenR : zhOpenL ) * abs( zhFn.x ), zhOpenT * max( -zhFn.y, 0.0 ) );
      zhRim += uRimFireColor * zhFireRim * zhReach;
    }
    totalEmissiveRadiance += zhRim * ( 0.4 + 0.6 * diffuseColor.rgb ) * opacity;
  }
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
