import { GroundCracks } from '@/game/objects/GroundCracks';
import type { PainterHost } from './PainterQuest';

/**
 * AS QUATRO COVAS DA SISI (pedido do autor, 2026-11-09: "a pá só cava onde tem trincos no chão"): a terra já vem
 * rachada, de leve, numa fila logo à frente dela — DUAS, UM VÃO, DUAS ("hoje está tudo coladinho") — e ela diz para
 * cavar ali. A pá não cava em mais lugar nenhum (Garden.canDigAt pergunta `isCrack`).
 *
 * A fila fica dois passos ao sul dela, longe da frente dela (o tile ao sul, que o jogador pisa para falar, nunca recebe
 * nada). O VÃO cai na coluna dela de propósito: os montes semeados são sólidos, e é por ele que quem chega pela trilha
 * (18,21) passa até a frente dela.
 */
export const CRACK_OFFSETS: ReadonlyArray<readonly [number, number]> = [[-2, 2], [-1, 2], [1, 2], [2, 2]];

/** Os tiles das covas, a partir de onde a Sisi fica. */
export const crackTiles = (npc: { worldX: number; worldY: number }): Array<{ x: number; y: number }> =>
  CRACK_OFFSETS.map(([dx, dy]) => ({ x: npc.worldX + dx, y: npc.worldY + dy }));

export class PainterCracks {
  private tiles: Array<{ x: number; y: number }> = [];
  private view?: GroundCracks;

  public constructor(private readonly quest: { readonly host: Pick<PainterHost, 'spotAt'> }) {}

  /** No boot: as covas que ainda não viraram buraco aparecem rachadas. */
  public build(npc: { worldX: number; worldY: number }): void {
    this.tiles = crackTiles(npc);
    this.view = new GroundCracks(this.tiles.filter((t) => !this.quest.host.spotAt(t.x, t.y)));
  }

  /** A pá pode cavar aqui? Só numa cova rachada que ainda não virou buraco. */
  public isCrack(x: number, y: number): boolean {
    return this.tiles.some((t) => t.x === x && t.y === y) && !this.quest.host.spotAt(x, y);
  }

  /** A pá cavou: a rachadura some debaixo do buraco. */
  public dug(x: number, y: number): void {
    this.view?.remove(x, y);
  }

  public destroy(): void {
    this.view?.destroy();
    this.view = undefined;
  }
}
