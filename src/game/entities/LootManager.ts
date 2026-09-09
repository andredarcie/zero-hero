import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import Phaser from 'phaser';

import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { ChunkManager } from '@/game/world/ChunkManager';
import { LootDrop, type LootLook } from './LootDrop';

const SCATTER_RADIUS = 2;

/** Um drop espalhado e o que fazer quando o herói o apanha (o minério → a mochila). */
type LootEntry = { drop: LootDrop; onCollect: () => void };

/**
 * O ESPALHADOR — a peça que faz um item SALTAR de onde nasceu, pousar num tile vizinho e ser
 * apanhado de passagem.
 *
 * Ela era o `CoinManager`, e a MOEDA foi removida do jogo por inteiro: não há carteira, não há
 * total, não há gasto, não há queda de moeda em corpo que morre e não há balcão que pague. O que
 * sobrou é a mecânica de espalhar — que nunca teve nada a ver com dinheiro — e hoje ela tem um
 * único cliente: o bloco de minério que o veio cospe a cada três picaretadas.
 */
export class LootManager {
  private readonly loot: LootEntry[] = [];

  public constructor(private readonly scene: Phaser.Scene) {}

  /**
   * Espalha `count` unidades em volta de (worldX, worldY). Cada unidade apanhada chama
   * `onCollectOne` — o voo de absorção vai pro HERÓI, porque a mochila não tem posição na tela e
   * o corpo é a mochila.
   */
  public spawnLoot(
    worldX: number,
    worldY: number,
    chunkManager: ChunkManager,
    count: number,
    look: LootLook,
    onCollectOne: () => void,
  ): void {
    const targets = this.pickScatterTiles(worldX, worldY, count, chunkManager);
    targets.forEach((target, i) => {
      this.loot.push({
        drop: new LootDrop(this.scene, worldX, worldY, target.x, target.y, i * 60, look),
        onCollect: onCollectOne,
      });
    });
  }

  /** Os tiles com loot pousado — o playtest anda até eles. */
  public getActiveLootPositions(): Array<{ worldX: number; worldY: number }> {
    return this.loot
      .filter((entry) => !entry.drop.isCollected)
      .map((entry) => ({ worldX: entry.drop.tileX, worldY: entry.drop.tileY }));
  }

  public update(playerWorldX: number, playerWorldY: number, heroScreen: { x: number; y: number }): void {
    // O ÍMÃ, e ele veio no lugar do "pisou, pegou". O drop CORRE até o herói (LootDrop.lureToward)
    // e é apanhado quando encosta — quem passa perto de um punhado vê o punhado inteiro vir junto.
    // O tile exato continua valendo por baixo: um drop que nasceu sob os pés é apanhado no mesmo
    // quadro, sem correr distância nenhuma.
    const delta = this.scene.game.loop.delta;
    for (const entry of this.loot) {
      const drop = entry.drop;
      if (!drop.isCollectable || drop.isCollected) continue;
      const dx = Math.abs(drop.tileX - playerWorldX);
      const dy = Math.abs(drop.tileY - playerWorldY);
      const reached = (dx === 0 && dy === 0)
        || drop.lureToward(playerWorldX, playerWorldY, delta);
      if (reached) drop.collect(heroScreen, entry.onCollect);
    }
  }

  public render(tileSize: number, camera: WorldCamera): void {
    for (const entry of this.loot) {
      entry.drop.render(tileSize, camera);
    }
  }

  public resetForScreenChange(): void {
    for (const entry of this.loot) {
      entry.drop.destroy();
    }
    this.loot.length = 0;
  }

  public destroy(): void {
    this.resetForScreenChange();
  }

  private pickScatterTiles(
    originX: number,
    originY: number,
    count: number,
    chunkManager: ChunkManager,
  ): Array<{ x: number; y: number }> {
    const candidates: Array<{ x: number; y: number }> = [];
    const screenCx = Math.floor(originX / CHUNK_COLUMNS);
    const screenCy = Math.floor(originY / CHUNK_ROWS);

    for (let dy = -SCATTER_RADIUS; dy <= SCATTER_RADIUS; dy++) {
      for (let dx = -SCATTER_RADIUS; dx <= SCATTER_RADIUS; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tx = originX + dx;
        const ty = originY + dy;
        if (Math.floor(tx / CHUNK_COLUMNS) !== screenCx || Math.floor(ty / CHUNK_ROWS) !== screenCy) continue;
        if (!chunkManager.isCellBlocked(tx, ty)) {
          candidates.push({ x: tx, y: ty });
        }
      }
    }

    Phaser.Utils.Array.Shuffle(candidates);

    if (candidates.length === 0) {
      return Array.from({ length: count }, () => ({ x: originX, y: originY }));
    }

    return Array.from({ length: count }, (_, i) => candidates[i % candidates.length]);
  }
}
