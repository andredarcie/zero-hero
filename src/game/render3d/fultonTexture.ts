import * as THREE from 'three';

import { registerTexture3D } from '@/game/render3d/textures3d';

/**
 * A CAIXA DE PAPELÃO e o resto do teatro da extração aérea.
 *
 * Arte gerada em runtime, como a partícula do portal e o balde: são cinco desenhos pequenos que
 * só esta peça usa, e mandá-los pelo atlas custaria cinco frames num sheet compartilhado (e um
 * `install-tile` para cada) sem que nenhum outro sistema os aproveitasse.
 *
 * A regra da casa vale igual: 16×16, poucas cores, tinta escura no contorno, zero anti-aliasing —
 * quem amplia é o NEAREST, então o que se desenha aqui é o que aparece na tela.
 */

export const FULTON_BOX_KEY = 'fulton-box';
export const FULTON_BALLOON_KEY = 'fulton-balloon';
export const FULTON_SIGN_KEY = 'fulton-sign';
export const FULTON_MARK_KEY = 'fulton-mark';
export const FULTON_PLANE_KEY = 'fulton-plane';

const PALETTE: Record<string, readonly [number, number, number, number]> = {
  '.': [0, 0, 0, 0],
  // AS CORES SAO AS RAMPAS CURADAS DO JOGO (spritefactory/lib/palette.mjs), e nao invencao minha.
  // As tres primeiras versoes desta arte usavam marrons e brancos escolhidos no olho, e o resultado
  // era exatamente o que o padrao medido previne: um sprite fora da familia, estourando na luz de
  // fogueira. O `dump` do bau (environment/props/chest.png) mostra a construcao que se copia aqui —
  // rampa `wood` de #b7916a a #63452c, contorno no INK NAVY #1d2b53 (o jogo nao tem preto), base
  // no ink mais escuro, luz vindo de CIMA-ESQUERDA e aresta dura, sem degrade.
  k: [0x1d, 0x2b, 0x53, 255], // ink — o contorno de todo sprite do jogo
  K: [0x14, 0x1d, 0x38, 255], // ink escuro — a base assentada no chao
  l: [0xb7, 0x91, 0x6a, 255], // wood claro (a face que pega luz)
  c: [0x88, 0x66, 0x44, 255], // wood medio
  m: [0x81, 0x59, 0x38, 255], // wood medio-escuro
  d: [0x63, 0x45, 0x2c, 255], // wood escuro (a face na sombra)
  w: [0xb5, 0xb5, 0xb5, 255], // bone — a fita da caixa
  W: [0xcd, 0xcd, 0xcd, 255], // bone claro — o balao
  g: [0x85, 0x85, 0x85, 255], // bone escuro — o balao na sombra
  r: [0xa5, 0x30, 0x30, 255], // ember escuro — a faixa de carga aerea
  R: [0xc8, 0x3e, 0x3e, 255], // ember — o X no chao
  // O AVIÃO tem de ser VISÍVEL, e por duas razões que se somam. A primeira: um billboard aqui é um
  // sprite ILUMINADO — a cor da arte é multiplicada pela luz da cena —, então um vulto escuro sobre
  // chão escuro não desenha quase nada, e foi por isso que a passagem dele não apareceu em captura
  // nenhuma. Ele passou a ser desenhado UNLIT (`emissive`, ver SellBoxObject), o que fixa a cor.
  // A segunda: contra o chão avermelhado do jogo, um AZUL-ARDÓSIA frio (rampa `deepblue`) lê como
  // um vulto atravessando. Uma sombra de verdade seria um passe de escurecimento (CastShadow3D) —
  // isso é outra técnica, não outra cor.
  s: [0x33, 0x4c, 0x62, 235], // deepblue — o corpo do vulto
  S: [0x55, 0x79, 0x98, 235], // deepblue claro — a borda que o separa do chão
};

/**
 * A CAIXA. Ela precisa dizer "isto vai voar" antes de qualquer animação — então leva a fita
 * cruzada no topo e a seta/faixa vermelha de carga aérea na frente, que é o que distingue um
 * caixote de despacho de um caixote qualquer.
 */
const BOX = [
  '................',
  '................',
  '...kkkkkkkkkk...',
  '..klllllllllck..',
  '..klllwwwwllck..',
  '..kcccwwwwccdk..',
  '..kcccwwwwccdk..',
  '..kccccccccddk..',
  '..kmmmmmmmmddk..',
  '..krrmmmmmmrdk..',
  '..kmmmmmmmmddk..',
  '..kddddddddddk..',
  '..kddddddddddk..',
  '..KKKKKKKKKKKK..',
  '................',
  '................',
] as const;

/** O BALÃO: o dirigível de resgate, cheio, com a corda descendo até a caixa. */
const BALLOON = [
  '.....kkkkkk.....',
  '...kkWWWWWWkk...',
  '..kWWWWWWWWWgk..',
  '.kWWWWWWWWWWggk.',
  '.kWWWWWWWWWWggk.',
  '.kWWWWWWWWWgggk.',
  '.kWWWWWWWWgggkk.',
  '..kWWWWWWgggk...',
  '..kkWWWWgggkk...',
  '...kkWWgggkk....',
  '.....kkggkk.....',
  '......kwwk......',
  '.......kk.......',
  '.......kk.......',
  '.......kk.......',
  '.......kk.......',
] as const;

/**
 * A PLACA: um poste de madeira com a tábua em cima. O ÍCONE não é desenhado aqui — quem o
 * desenha é um segundo billboard com a arte do próprio item, encaixado no vão da tábua. Uma
 * placa com o desenho embutido precisaria de uma arte por item do jogo.
 */
const SIGN = [
  '.kkkkkkkkkkkkkk.',
  '.klllllllllllck.',
  '.kllllllllllcck.',
  '.kcccccccccccck.',
  '.kcccccccccccck.',
  '.kccccccccccmck.',
  '.kmmmmmmmmmmmck.',
  '.kmmmmmmmmmmddk.',
  '.kddddddddddddk.',
  '.KKKKKKKKKKKKKK.',
  '......kmdk......',
  '......kmdk......',
  '......kmdk......',
  '......kmdk......',
  '.....KKmdKK.....',
  '................',
] as const;

/** O X no chão: onde a caixa estava, e onde a próxima vai cair. */
const MARK = [
  '................',
  '................',
  '..kRR......RRk..',
  '..kRRR....RRRk..',
  '...kRRR..RRRk...',
  '....kRRRRRRk....',
  '.....kRRRRk.....',
  '......kRRk......',
  '......kRRk......',
  '.....kRRRRk.....',
  '....kRRRRRRk....',
  '...kRRR..RRRk...',
  '..kRRR....RRRk..',
  '..kRR......RRk..',
  '................',
  '................',
] as const;

/**
 * A SOMBRA DO AVIÃO, vista de cima e DEITADA: o nariz aponta para a direita, que é o lado para
 * onde ela viaja. A primeira versão foi desenhada com o nariz para CIMA e cruzava o mapa de lado,
 * voando de perfil como um caranguejo — o desenho tem de concordar com o movimento.
 */
const PLANE = [
  '................',
  '.....S..........',
  '.....Ss.........',
  '....Sss.........',
  '...Ssss.........',
  '..Sssssssss.....',
  '.Ssssssssssssss.',
  'Ssssssssssssssss',
  'Sssssssssssssss.',
  '.Ssssssssssssss.',
  '..Sssssssss.....',
  '...Ssss.........',
  '....Sss.........',
  '.....Ss.........',
  '.....S..........',
  '................',
] as const;

const makeCanvas = (rows: readonly string[]): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length;
  canvas.height = rows.length;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const image = ctx.createImageData(canvas.width, canvas.height);
  rows.forEach((row, y) => row.split('').forEach((pixel, x) => {
    const [r, g, b, a] = PALETTE[pixel] ?? PALETTE['.'];
    const i = (y * canvas.width + x) * 4;
    image.data[i] = r;
    image.data[i + 1] = g;
    image.data[i + 2] = b;
    image.data[i + 3] = a;
  }));
  ctx.putImageData(image, 0, 0);
  return canvas;
};

let registered = false;

export const registerFultonTextures = (): void => {
  if (registered) return;
  const entries = [
    [FULTON_BOX_KEY, BOX],
    [FULTON_BALLOON_KEY, BALLOON],
    [FULTON_SIGN_KEY, SIGN],
    [FULTON_MARK_KEY, MARK],
    [FULTON_PLANE_KEY, PLANE],
  ] as const;
  for (const [key, rows] of entries) {
    const texture = new THREE.CanvasTexture(makeCanvas(rows));
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    registerTexture3D(key, texture);
  }
  registered = true;
};
