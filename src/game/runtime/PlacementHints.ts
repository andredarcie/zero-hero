import Phaser from 'phaser';

import { isTouchDevice } from '@/game/runtime/PauseMenu';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import {
  PLACEMENT_FAR_TEXTURE, PLACEMENT_OK_TEXTURE, TAKE_KEY_TEXTURE, ensureTakeKeyTexture,
} from '@/game/render3d/placementTexture';
import { world3d } from '@/game/render3d/World3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

/**
 * AS MARCAS DE ONDE A PEÇA CAI — o quadrado no chão e o keycap por cima dele.
 *
 * Instalar era o único gesto do jogo cujo ALVO era invisível. Todo o resto mira em alguma coisa
 * que já está lá (a árvore, a rocha, a caldeira); uma máquina nasce num chão vazio, e chão vazio
 * é igual em todo lugar. Esta peça é o conserto: com uma máquina na mão, o tile que o botão vai
 * usar ganha um quadro branco, e sobre ele a TECLA que faz acontecer.
 *
 * Duas coisas ela mostra ao mesmo tempo, e é essa diferença que ensina o extrator sem uma linha
 * de texto: o alvo IMEDIATO em branco, e os outros lugares VÁLIDOS em azul frio. Segurando o
 * extrator, os vizinhos de cada veio acendem em frio — o jogador vê "é ali que essa peça mora"
 * antes de tentar e ser recusado.
 *
 * ── Por que os quads vêm de um POOL ─────────────────────────────────────────────────────────
 * Eles nascem e morrem a cada troca de item, e um `addBillboard` por frame seria alocação por
 * quadro. O pool cresce até o maior número de marcas que a sessão já pediu e nunca encolhe —
 * o teto real é "vizinhos livres de todos os veios na tela", que é da ordem de uma dúzia.
 * (Não há luz envolvida: são quads deitados, então nada aqui recompila shader — a lei das luzes
 * vale para `THREE.Light`, e uma marca não é uma.)
 */

// O keycap da tecla de AÇÃO mora em `placementTexture` desde que a BANCADA passou a mostrar um
// igual: um desenho que diz a mesma frase em dois lugares tem de ser um desenho só.
/** Acima do cabo (0.022) e da esteira (0.016): a marca é a última coisa desenhada no chão. */
const MARK_Y = 0.03;

export type HintTile = { readonly x: number; readonly y: number };

export class PlacementHints {
  private readonly pool: Billboard3D[] = [];
  private readonly keycap: Phaser.GameObjects.Image;
  private used = 0;
  private primary: HintTile | null = null;

  public constructor(private readonly scene: Phaser.Scene) {
    ensureTakeKeyTexture(scene, isTouchDevice());
    // O KEYCAP É O DO BOTÃO X. Instalar mudou de botão junto com a tabela de itens inteira (o Z
    // ficou só com a espada — ver GameScene.pressUse), e um quadrado branco com um "Z" em cima
    // prometeria o gesto na tecla errada. A marca e o botão leem a mesma pergunta; o desenho da
    // tecla tem de ler a mesma também.
    this.keycap = scene.add.image(0, 0, TAKE_KEY_TEXTURE).setOrigin(0.5, 1).setVisible(false);
  }

  /**
   * Reescreve as marcas deste frame.
   *
   * @param primary O tile que o botão vai usar AGORA (branco + keycap), ou null se o gesto seria
   * recusado — e "recusado" tem de aparecer como ausência de marca branca, nunca como uma marca
   * vermelha: o jogo não tem vocabulário de erro colorido, tem vocabulário de física.
   * @param others  Os demais lugares válidos (azul frio). É o que ensina o extrator.
   */
  public show(primary: HintTile | null, others: readonly HintTile[] = []): void {
    this.primary = primary;
    let i = 0;
    const paint = (tile: HintTile, ok: boolean): void => {
      const mark = this.pool[i] ?? this.grow();
      mark
        .setTexture(ok ? PLACEMENT_OK_TEXTURE : PLACEMENT_FAR_TEXTURE)
        .setPosition(tile.x, tile.y)
        .setVisible(true);
      i += 1;
    };
    if (primary) paint(primary, true);
    for (const tile of others) {
      if (primary && tile.x === primary.x && tile.y === primary.y) continue;
      paint(tile, false);
    }
    for (let k = i; k < this.used; k += 1) this.pool[k].setVisible(false);
    this.used = i;
    this.keycap.setVisible(primary !== null);
  }

  public clear(): void {
    if (this.used === 0 && !this.keycap.visible) return;
    for (let i = 0; i < this.used; i += 1) this.pool[i].setVisible(false);
    this.used = 0;
    this.primary = null;
    this.keycap.setVisible(false);
  }

  /** O keycap é overlay Phaser projetado (a técnica do "!" e do "Z"), nunca um corpo no mundo. */
  public render(tileSize: number, camera: WorldCamera, timeMs: number): void {
    if (!this.primary) return;
    const screen = camera.tileToScreen(this.primary.x, this.primary.y, tileSize);
    const px = Math.max(1, Math.round(tileSize / 24));
    const bob = Math.round(Math.sin(timeMs / 280) * px);
    this.keycap.setScale(px).setPosition(screen.x, screen.y - tileSize * 0.55 + bob);
  }

  private grow(): Billboard3D {
    const mark = world3d()
      .addBillboard(PLACEMENT_OK_TEXTURE, 0, {
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
    this.keycap.destroy();
  }
}
