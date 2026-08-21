import * as THREE from 'three';

/**
 * A ALVENARIA MERGEADA — quarenta blocos de pedra numa malha só, e o motivo de a escada poder
 * ter quarenta blocos.
 *
 * A escada era feita de `World3D.addBox`, e cada `addBox` é uma `Mesh` com um `Material` só dela:
 * onze caixas viravam onze draw calls e onze materiais, e como as cinco escadas do mundo nascem
 * todas no `create()` (não há streaming de prop), o preço era fixo e pago desde o boot. Detalhar
 * a peça — pôr um coping em cada lance de meio-fio, uma pisada clara sobre um espelho escuro, um
 * portal de ombreiras e verga na boca — multiplicaria isso por quatro.
 *
 * Aqui os blocos entram num único `BufferGeometry` e saem por `World3D.addLitMesh`: UM draw call,
 * UM material, e o número de blocos deixa de ser um orçamento. O saldo é negativo em custo mesmo
 * com a peça quatro vezes mais detalhada — de 12 malhas por escada para 4.
 *
 * ── POR QUE UMA `BoxGeometry` POR BLOCO, E NÃO VÉRTICES NA MÃO ──────────────
 *
 * Porque a conta de UV é a armadilha, não a caixa. `World3D.tileBoxUv` já resolveu a densidade
 * (16 texels por tile, face a face, com o recorte ancorado no TOPO da arte como se lê um sprite)
 * e escrever isso de novo à mão seria a segunda cópia de uma conta que já discordou de si mesma
 * uma vez. Então cada bloco nasce como uma `BoxGeometry` do three, recebe a mesma transformação
 * de UV, é transladado para o lugar dele e é DESPEJADO nos arrays comuns. Custa um objeto
 * temporário por bloco, uma vez, na construção da peça — e nunca mais.
 */

/** A lei de 16 px por tile, aqui aplicada ao texel da pedra. */
const TEXELS_PER_TILE = 16;

/** Um bloco de pedra: centro e tamanho em TILES, mais de onde a folha é recortada. */
export interface StoneBlock {
  /** Centro, em tiles, relativo ao tile da peça: +x leste, +y para cima, +z sul. */
  x: number;
  y: number;
  z: number;
  /** Tamanho em tiles. */
  w: number;
  h: number;
  d: number;
  /**
   * O canto superior esquerdo do recorte, em TEXELS da folha.
   *
   * A LINHA é o que decide o TOM (ver `stoneTexture`: 4c+0 coroa, +1 corpo, +2 sombra, +3 junta);
   * a COLUNA só escolhe em que ponto da fiada as juntas verticais caem, e serve para dois blocos
   * vizinhos não saírem com o mesmo desenho.
   */
  uv: readonly [number, number];
}

export class MasonryBuilder {
  private readonly positions: number[] = [];

  private readonly normals: number[] = [];

  private readonly uvs: number[] = [];

  public constructor(private readonly sheet: THREE.Texture) {}

  /** Empilha um bloco. Devolve `this` para as peças poderem se escrever em cascata. */
  public block(b: StoneBlock): this {
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
    this.skin(geo, b);
    geo.translate(b.x, b.y, b.z);
    // `toNonIndexed` porque os índices de cada caixa começam em zero: concatená-los pediria um
    // offset por caixa, e 36 vértices soltos por bloco custam menos do que a chance de errar isso.
    const flat = geo.toNonIndexed();
    push(this.positions, flat.attributes.position.array);
    push(this.normals, flat.attributes.normal.array);
    push(this.uvs, flat.attributes.uv.array);
    geo.dispose();
    flat.dispose();
    return this;
  }

  /** Os blocos viram a malha. Chamado uma vez, no fim da construção da peça. */
  public build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geo.computeBoundingSphere();
    return geo;
  }

  /**
   * O recorte da folha, face a face — a mesma conta de `World3D.tileBoxUv`.
   *
   * A ordem das faces de uma `BoxGeometry` é +X, −X, +Y, −Y, +Z, −Z, e a UV de cada uma vai de 0
   * a 1. Multiplicar pelo tamanho da face em texels do mundo põe o texel no tamanho certo; o `v`
   * ancora em `1 - rv` porque `v` cresce para cima na textura e o deslocamento é contado a partir
   * do TOPO da arte, que é como se lê um sprite.
   */
  private skin(geo: THREE.BoxGeometry, b: StoneBlock): void {
    const image = this.sheet.image as { width?: number; height?: number } | undefined;
    const texW = image?.width ?? TEXELS_PER_TILE;
    const texH = image?.height ?? TEXELS_PER_TILE;
    const spans: ReadonlyArray<readonly [number, number]> = [
      [b.d, b.h], [b.d, b.h], // ±X: a profundidade em u, a altura em v
      [b.w, b.d], [b.w, b.d], // ±Y: topo e base
      [b.w, b.h], [b.w, b.h], // ±Z: a largura em u, a altura em v
    ];
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let face = 0; face < spans.length; face += 1) {
      const [spanU, spanV] = spans[face];
      const ru = (spanU * TEXELS_PER_TILE) / texW;
      const rv = (spanV * TEXELS_PER_TILE) / texH;
      const ou = b.uv[0] / texW;
      const ov = 1 - rv - b.uv[1] / texH;
      for (let i = face * 4; i < face * 4 + 4; i += 1) {
        uv.setXY(i, uv.getX(i) * ru + ou, uv.getY(i) * rv + ov);
      }
    }
    uv.needsUpdate = true;
  }
}

/** `push(...array)` estoura a pilha em arrays grandes; um laço não estoura e não aloca nada. */
const push = (into: number[], from: ArrayLike<number>): void => {
  for (let i = 0; i < from.length; i += 1) into.push(from[i]);
};

/**
 * A REPETIÇÃO PRECISA ESTAR LIGADA NA TEXTURA — e é parâmetro de TEXTURA, aplicado na subida.
 *
 * A folha de pedra é compartilhada em cache (`getStoneTexture`), então quem a usa primeiro paga
 * por todos; trocar o campo sem `needsUpdate` deixaria a textura grampeada na GPU e todo recorte
 * sairia esticando o texel da borda em vez de repetir.
 */
export const enableTiling = (sheet: THREE.Texture): void => {
  if (sheet.wrapS === THREE.RepeatWrapping && sheet.wrapT === THREE.RepeatWrapping) return;
  sheet.wrapS = THREE.RepeatWrapping;
  sheet.wrapT = THREE.RepeatWrapping;
  sheet.needsUpdate = true;
};
