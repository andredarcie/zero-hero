// OS MATERIAIS DO TERRENO, feitos UMA vez por partida e reusados a cada re-assado: o three assa o programa remendado
// de um material na chave do cache, e um material novo por re-assado iria procurar esse programa no primeiro quadro
// em que fosse desenhado — exatamente o que as regras de shader deste projeto existem para impedir.

import * as THREE from 'three';

import { makeVoidMistMaterial } from './glowMaterials';
import { makeShadowBlobMaterial } from './groundShadow';
import { patchPixelMaterial, syncTexelAaUniforms, type TexelAaUniforms } from './pixelArtLight';
import { vineTexture } from './vineTexture';

export interface TerrainMaterials {
  ground: THREE.MeshLambertMaterial;
  /** As árvores em pé, com a cor do bioma no vértice. */
  trees: THREE.MeshLambertMaterial;
  /** O MAR: o mesmo atlas do chão, com a corrente e a arrebentação (worldFx 'seaFlow'). */
  sea: THREE.MeshLambertMaterial;
  bank: THREE.MeshLambertMaterial;
  /** Sem luz: o barranco da lava é iluminado por ela, e isso vem pintado no vértice. */
  lavaBank: THREE.MeshBasicMaterial;
  lava: THREE.MeshBasicMaterial;
  /** As paredes do POÇO da escada, e o fundo dele: preto que não recebe luz (ver o bake). */
  pit: THREE.MeshBasicMaterial;
  pitFloor: THREE.MeshBasicMaterial;
  /** A DECORAÇÃO EM PÉ (standingDecor.ts): toda a decoração do mapa, de pé, com a luz de coisa em pé e a planta curvando. */
  standing: THREE.MeshLambertMaterial;
  /** A mesma decoração na PASSADA DA FRENTE (decorSway.ts): só os fios à frente dos pés do herói, depois dele. */
  standingFront: THREE.MeshLambertMaterial;
  solid: THREE.MeshLambertMaterial;
  /** A MONTANHA em cubo: o mesmo atlas, com o volume nas cores de vértice (ROCK_CUBE_SHADE). */
  rock: THREE.MeshLambertMaterial;
  /** A ESCADA da serra: a pedra da montanha, dos dois lados (os degraus nao tem frente fixa). */
  stair: THREE.MeshLambertMaterial;
  /** O topo do cubo de parede de dungeon: preto puro, sem luz. */
  wallTop: THREE.MeshBasicMaterial;
  /** As trepadeiras que descem pela pedra da serra (ver vineTexture). */
  vines: THREE.MeshLambertMaterial;
  /** A NÉVOA NEGRA que engole a mata de fora do mapa (ver makeVoidMistMaterial). */
  voidMist: THREE.MeshBasicMaterial;
  blob: THREE.Material;
}

export const makeTerrainMaterials = (tileset: THREE.Texture): TerrainMaterials => {
  // Every tile mesh samples the one atlas, so they share the one size uniform. No `bounds`
  // here: each mesh merges thousands of quads, each windowing onto its own frame, so the
  // frame travels per vertex (aUvBounds) instead. See pixelArtLight/TEXEL_AA_GLSL.
  const tileAa: TexelAaUniforms = { size: { value: new THREE.Vector2() } };
  syncTexelAaUniforms(tileAa, tileset); // the sheet's pixel size; every base texture is loaded by now
  const ground = new THREE.MeshLambertMaterial({ map: tileset, vertexColors: true });
  // A cor do bioma troca a RAMPA da folha (biomeRamp.ts), em vez de multiplicar a arte inteira.
  patchPixelMaterial(ground, { quantize: true, texelAa: tileAa, biome: 'ground' });
  // O MAR, que é o mesmo chão com movimento (worldFx 'seaFlow'): a corrente escorrendo dentro
  // do frame, a arrebentação na praia e o glint do rio. Material separado e NÃO um flag no do
  // chão porque o efeito é um programa a mais — e todo tile de terra do mundo pagaria por ele.
  const sea = new THREE.MeshLambertMaterial({ map: tileset, vertexColors: true });
  patchPixelMaterial(sea, { quantize: true, texelAa: tileAa, worldFx: 'seaFlow', mirrorSurface: true });
  sea.name = 'terrain-sea'; // o playtest acha o material do mar por aqui, sem adivinhar índice
  // A margem é PINTADA por vértice (as faixas de buildBankGeometry): friso de capim, terra,
  // terra molhada. Era uma cor só, quase preta — o lago lia como um buraco de parede reta.
  const bank = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  patchPixelMaterial(bank, { quantize: true });
  const lavaBank = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const lava = new THREE.MeshBasicMaterial({ color: 0xffffff });
  patchPixelMaterial(lava, { worldFx: 'lavaFlow' });
  lava.name = 'terrain-lava';
  // AS PAREDES E O FUNDO DO POÇO DA ESCADA. `MeshBasicMaterial` de propósito, e não Lambert:
  // um buraco não é uma superfície, então ele não recebe luz nenhuma — nem a do dia, nem a da
  // tocha na mão do herói (ver o doc de STAIRS_PIT_DEPTH). A parede é um fio mais clara que o
  // fundo, só para a beira do poço ter uma aresta em vez de virar uma mancha só.
  // PRETO PURO, e o zero e o argumento. Um quase-preto (0x040308) sobreviveria a luz — `Basic`
  // nao recebe nenhuma — mas NAO sobrevive ao POST: a vista do heroi aplica um `pow` local nos
  // graves, e 0.0006 elevado a 0.7 vira 0.0075, doze vezes mais claro. O buraco ficava MARROM
  // quando o heroi chegava perto, que e a licao 3 da StairsObject acontecendo de novo por uma
  // porta nova. Zero e ponto fixo de tudo o que a cadeia faz: `pow(0,k)=0`, `0*grade=0`. E o
  // mesmo motivo pelo qual o teto do muro de dungeon e preto puro.
  const pit = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  const pitFloor = new THREE.MeshBasicMaterial({ color: 0x000000 });
  // A DECORAÇÃO, em pé (standingDecor.ts): o mesmo atlas, a rampa do bioma da decoração e a luz do chão em que pisa
  // (a normal para cima). depthWrite MUST stay false, como sempre ficou na decoração deitada: as sombras do chão
  // (o blob, as silhuetas) são desenhadas depois, e se ela gravasse profundidade comeria essas sombras em blocos do
  // tamanho do tile ("invisible square blocks eating the shadow", relato do autor). A decoração nunca precisa esconder
  // nada; a ordem do pintor (norte→sul na malha) resolve uma peça na frente da outra.
  const standing = new THREE.MeshLambertMaterial({
    map: tileset, transparent: true, alphaTest: 0.35, depthWrite: false, vertexColors: true,
  });
  patchPixelMaterial(standing, { quantize: true, texelAa: tileAa, biome: 'decor', standing: true });
  standing.name = 'terrain-decor';
  // A PASSADA DA FRENTE: o mesmo material, com um uniform ligado. A chave do programa é a mesma (o código é o mesmo),
  // então as duas passadas usam UM programa e nada compila a mais.
  const standingFront = new THREE.MeshLambertMaterial({
    map: tileset, transparent: true, alphaTest: 0.35, depthWrite: false, vertexColors: true,
  });
  patchPixelMaterial(standingFront, { quantize: true, texelAa: tileAa, biome: 'decor', standing: true, standFront: { value: 1 } });
  standingFront.name = 'terrain-decor-front';
  const solid = new THREE.MeshLambertMaterial({ map: tileset, alphaTest: 0.5 });
  patchPixelMaterial(solid, { quantize: true, normalUp: true, texelAa: tileAa, wind: 'lean' });
  // AS ÁRVORES EM PÉ: o `solid` com a cor do bioma no vértice (world/biomes, `treeTint`). Material
  // próprio porque o `solid` também veste a alvenaria, cuja malha não traz cor.
  const trees = new THREE.MeshLambertMaterial({ map: tileset, alphaTest: 0.5, vertexColors: true });
  patchPixelMaterial(trees, { quantize: true, normalUp: true, texelAa: tileAa, wind: 'lean', biome: 'trees' });
  trees.name = 'terrain-trees';
  // A MONTANHA. Dois motivos para ela não usar `solid`, e os dois são o cubo:
  //   · vertexColors, porque `normalUp` acende TODA face como se ela olhasse para cima (é a lei
  //     de iluminação deste jogo, e o cubo de dungeon a segue) — então o volume do bloco não
  //     pode vir da normal, tem de vir pintado no vértice (ROCK_CUBE_SHADE);
  //   · sem alphaTest, porque a arte de pedra é uma parede full-bleed cuja última linha é a
  //     sombra de contato em alpha 0.1 — com corte em 0.5 ela desapareceria e cada bloco
  //     ficaria com uma fresta de 1px no pé, vazando o chão de trás.
  const rock = new THREE.MeshLambertMaterial({ map: tileset, vertexColors: true });
  patchPixelMaterial(rock, { quantize: true, normalUp: true, texelAa: tileAa });
  rock.name = 'terrain-rock';
  // A ESCADA: a mesma pedra, com os dois lados acesos. Os degraus sao montados em quatro rumos
  // (norte, sul, leste, oeste) e a face de um degrau nao tem um "de fora" fixo como o cubo tem.
  const stair = new THREE.MeshLambertMaterial({ map: tileset, vertexColors: true, side: THREE.DoubleSide });
  patchPixelMaterial(stair, { quantize: true, normalUp: true, texelAa: tileAa });
  stair.name = 'terrain-stair';
  // O TOPO DA PAREDE DE DUNGEON: PRETO PURO, e sem luz nenhuma.
  //
  // Foram tres tentativas antes desta, e todas erraram para o mesmo lado — claro demais. Um
  // degrade de ambiente-ocluido nos cantos (a receita que jogo de bloco costuma usar), depois
  // o mesmo degrade em Lambert para reagir a tocha, depois as duas cores mais escuras que
  // existem na propria arte de dungeon. Nenhuma prestou: qualquer valor acima de zero, num
  // ambiente com a ambiente forte que este jogo usa, faz o topo competir com o chao — e o
  // topo nao e uma superficie que o jogador deva ler, e o vazio entre uma sala e a outra.
  //
  // Basic e nao Lambert porque com preto puro a luz e irrelevante (preto vezes o que for
  // continua preto) e Basic e o caminho mais curto ate esse resultado.
  const wallTop = new THREE.MeshBasicMaterial({ color: 0x000000 });
  // As trepadeiras: acesas como a pedra em que estão encostadas (`normalUp`), e sem mistura.
  // Um pouco abaixo da pedra (0xb8): folha numa parede vertical pega menos sol que a crista, e com a luz inteira o
  // verde virava neon.
  const vines = new THREE.MeshLambertMaterial({ map: vineTexture(), alphaTest: 0.5, color: 0xb8b8b8 });
  patchPixelMaterial(vines, { quantize: true, normalUp: true });
  vines.name = 'terrain-vines';
  return {
    ground, sea, bank, lavaBank, lava, pit, pitFloor, standing, standingFront, solid, trees, rock, stair, wallTop, vines,
    voidMist: makeVoidMistMaterial(),
    blob: makeShadowBlobMaterial(0.34),
  };
};
