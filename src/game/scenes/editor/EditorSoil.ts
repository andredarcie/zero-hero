// O SOLO NO EDITOR: pintar GRAMA onde a conta abriu terra (ou TERRA onde se quer chão batido), voltar ao automático
// com o botão direito, e as marcas dos tiles pintados por cima do tabuleiro enquanto a ferramenta está na mão.
//
// A terra do chão não é tile guardado: ela nasce da conta de ruído e bioma (constants.groundFrameAt), e por isso o
// pincel de tiles não a tirava. O solo pintado (`WorldChunk.soil`) é o que manda nela tile a tile.

import * as Engine from '@/game/engine';
import { CHUNK_COLUMNS, CHUNK_ROWS, GROUND_TILE_FRAME, setSoilSource, SOIL_AUTO, SOIL_EARTH, SOIL_GRASS } from '@/game/constants';
import type { EditorScene } from '../EditorScene';
import { WORLD_TILE } from './editorDefs';

/**
 * Até onde um tile pintado mexe na terra dos outros: a regra do tile ilhado (constants.isEarthAt) lê os vizinhos três
 * vezes, uma passada sobre a outra, então o que muda num tile pode mudar o desenho até três tiles em volta.
 */
export const SOIL_REACH = 3;

/** O que EditorSoil usa de EditorScene. */
export type EditorSoilHost = Pick<EditorScene, 'add' | 'store' | 'uiState' | 'view'>;

export class EditorSoil {
  private marks?: Engine.GameObjects.Graphics;

  public constructor(private readonly host: EditorSoilHost) {}

  /** A terra do tabuleiro passa a ler o solo do armazém (o que se está pintando agora) e esquece o que tinha calculado. */
  public useLiveSource(): void {
    const store = this.host.store;
    if (store) setSoilSource((x, y) => store.readCell('soil', x, y) as number);
  }

  public soilAt(x: number, y: number): number {
    return (this.host.store?.readCell('soil', x, y) as number | undefined) ?? SOIL_AUTO;
  }

  /**
   * Pinta o modo escolhido. Só no chão de grama e terra (o tile 5): estrada, calçamento e mar não viram terra nunca,
   * e um solo guardado ali seria um dado que nada mostra.
   */
  public paint(x: number, y: number): void {
    const store = this.host.store;
    if (!store || !this.host.view.isEditable(x, y)) return;
    if (store.readCell('ground', x, y) !== GROUND_TILE_FRAME) return;
    store.setCell('soil', x, y, this.host.uiState.soilMode === 'earth' ? SOIL_EARTH : SOIL_GRASS);
  }

  /** O botão direito: o tile volta a ser decidido pela conta, como era antes de pintar. */
  public clear(x: number, y: number): void {
    if (this.host.view.isEditable(x, y)) this.host.store?.setCell('soil', x, y, SOIL_AUTO);
  }

  /** As marcas nascem com o tabuleiro (EditorBoard.buildWorldObjects), por cima do chão e embaixo da grade. */
  public createMarks(): void {
    this.marks?.destroy();
    this.marks = this.host.add.graphics().setDepth(1.6);
    this.drawMarks();
  }

  /** Só com a ferramenta Solo na mão: no resto do tempo o próprio chão já mostra o resultado. */
  public syncMarks(): void {
    this.marks?.setVisible(this.host.uiState.tool === 'soil');
  }

  /**
   * Cada tile pintado ganha um contorno fino na cor do que foi pintado (verde grama, ocre terra), para o autor ver o
   * que está fixo e o que a conta ainda decide.
   */
  public drawMarks(): void {
    const store = this.host.store;
    const gfx = this.marks;
    if (!store || !gfx) return;
    gfx.clear();
    const T = WORLD_TILE;
    for (const chunk of store.world.chunks) {
      if (!chunk.soil) continue;
      chunk.soil.forEach((row, ly) => row.forEach((soil, lx) => {
        if (soil === SOIL_AUTO) return;
        const px = (chunk.cx * CHUNK_COLUMNS + lx) * T;
        const py = (chunk.cy * CHUNK_ROWS + ly) * T;
        const color = soil === SOIL_EARTH ? 0xd9a55a : 0x7fd36b;
        gfx.lineStyle(1.5, color, 0.95).strokeRect(px + 1.5, py + 1.5, T - 3, T - 3);
        gfx.fillStyle(color, 0.9).fillRect(px + 3, py + 3, 3, 3);
      }));
    }
    this.syncMarks();
  }
}
