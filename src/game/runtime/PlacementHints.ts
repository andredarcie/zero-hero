import { Billboard3D } from '@/game/render3d/Billboard3D';
import { PLACEMENT_OK_TEXTURE } from '@/game/render3d/placementTexture';
import { world3d } from '@/game/render3d/World3D';

/**
 * AS MARCAS DE ONDE A PEÇA CAI — o quadrado no chão. A palavra e a tecla são do `ActionPrompt`.
 *
 * Instalar era o único gesto do jogo cujo ALVO era invisível. Todo o resto mira em alguma coisa
 * que já está lá (a árvore, a rocha, o altar); uma estação nasce num chão vazio, e chão vazio
 * é igual em todo lugar. Esta peça é o conserto: com uma máquina na mão, o tile que o botão vai
 * usar ganha um quadro branco.
 *
 * ── Por que os quads vêm de um POOL ─────────────────────────────────────────────────────────
 * Eles nascem e morrem a cada troca de item, e um `addBillboard` por frame seria alocação por
 * quadro. O pool cresce até o maior número de marcas que a sessão já pediu e nunca encolhe —
 * o teto real é "vizinhos livres de todos os veios na tela", que é da ordem de uma dúzia.
 * (Não há luz envolvida: são quads deitados, então nada aqui recompila shader — a lei das luzes
 * vale para `THREE.Light`, e uma marca não é uma.)
 */

/** A marca e a ultima coisa desenhada no chao. */
const MARK_Y = 0.03;

export type HintTile = { readonly x: number; readonly y: number };

export class PlacementHints {
  private readonly pool: Billboard3D[] = [];
  private used = 0;

  /**
   * Reescreve as marcas deste frame.
   *
   * @param primary O tile que o botão vai usar AGORA (branco), ou null se o gesto seria
   * recusado — e "recusado" tem de aparecer como ausência de marca branca, nunca como uma marca
   * vermelha: o jogo não tem vocabulário de erro colorido, tem vocabulário de física.
   */
  public show(primary: HintTile | null): void {
    let i = 0;
    const paint = (tile: HintTile): void => {
      const mark = this.pool[i] ?? this.grow();
      mark
        .setTexture(PLACEMENT_OK_TEXTURE)
        .setPosition(tile.x, tile.y)
        .setVisible(true);
      i += 1;
    };
    if (primary) paint(primary);
    for (let k = i; k < this.used; k += 1) this.pool[k].setVisible(false);
    this.used = i;
  }

  public clear(): void {
    if (this.used === 0) return;
    for (let i = 0; i < this.used; i += 1) this.pool[i].setVisible(false);
    this.used = 0;
  }

  private grow(): Billboard3D {
    const mark = world3d()
      .objects.addBillboard(PLACEMENT_OK_TEXTURE, 0, {
        flat: true, flatY: MARK_Y, emissive: true, fog: false, depthWrite: false,
      })
      .setDisplaySize(1, 1)
      .setVisible(false);
    this.pool.push(mark);
    return mark;
  }

  public destroy(): void {
    for (const mark of this.pool) mark.destroy();
    this.pool.length = 0;
    this.used = 0;
  }
}
