import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import Phaser from 'phaser';

import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { ChunkManager } from '@/game/world/ChunkManager';
import { Coin, type CoinLook } from './Coin';

const SCATTER_RADIUS = 2;

/** Um drop que ANDA como moeda mas cujo destino é de quem o criou (o minério → a mochila). */
type LootEntry = { coin: Coin; onCollect: () => void };

export class CoinManager {
  private readonly coins: Coin[] = [];
  private readonly loot: LootEntry[] = [];
  private total = 0;
  private magnetRadius = 0;

  public constructor(private readonly scene: Phaser.Scene) {}

  public get coinTotal(): number { return this.total; }

  /** A carteira que volta do save da aventura: o TOTAL atravessa; moedas no chao, nunca. */
  public restoreTotal(total: number): void {
    this.total = Math.max(0, Math.floor(total));
  }

  public getActiveWorldPositions(): Array<{ worldX: number; worldY: number }> {
    return this.coins
      .filter((c) => !c.isCollected)
      .map((c) => ({ worldX: c.tileX, worldY: c.tileY }));
  }

  public setMagnetRadius(r: number): void { this.magnetRadius = r; }

  public spendCoins(amount: number): boolean {
    if (this.total < amount) return false;
    this.total -= amount;
    return true;
  }

  /**
   * `count` fixa quantas moedas caem; sem ele, o sorteio de sempre (1..5).
   *
   * O explorador precisa do numero exato porque a moeda dele NAO e decoracao: a quantidade e o
   * multiplicador de profundidade, e o jogador conta. Um sorteio por cima disso apagaria a
   * unica coisa que a distancia esta tentando dizer.
   */
  public spawnCoins(worldX: number, worldY: number, chunkManager: ChunkManager, count?: number): void {
    const amount = count ?? Phaser.Math.Between(1, 5);
    const targets = this.pickScatterTiles(worldX, worldY, amount, chunkManager);

    targets.forEach((target, i) => {
      this.coins.push(new Coin(
        this.scene,
        worldX,
        worldY,
        target.x,
        target.y,
        i * 60,
      ));
    });
  }

  /**
   * O DROP-QUE-NÃO-É-MOEDA: mesma física de espalhar, pousar e pegar de passagem, mas cada
   * unidade apanhada chama `onCollectOne` (o minério entra na mochila) em vez de somar na
   * carteira. O voo de absorção vai pro HERÓI — o que se guarda voa pro corpo, o que se
   * conta voa pro contador.
   */
  public spawnLoot(
    worldX: number,
    worldY: number,
    chunkManager: ChunkManager,
    count: number,
    look: CoinLook,
    onCollectOne: () => void,
  ): void {
    const targets = this.pickScatterTiles(worldX, worldY, count, chunkManager);
    targets.forEach((target, i) => {
      this.loot.push({
        coin: new Coin(this.scene, worldX, worldY, target.x, target.y, i * 60, look),
        onCollect: onCollectOne,
      });
    });
  }

  /** Os tiles com loot pousado (o par de getActiveWorldPositions, pro playtest andar até eles). */
  public getActiveLootPositions(): Array<{ worldX: number; worldY: number }> {
    return this.loot
      .filter((entry) => !entry.coin.isCollected)
      .map((entry) => ({ worldX: entry.coin.tileX, worldY: entry.coin.tileY }));
  }

  public update(
    playerWorldX: number,
    playerWorldY: number,
    // Dois destinos de voo: a moeda vai pro CONTADOR do HUD (o número que ela aumenta), o
    // loot vai pro corpo do herói (a mochila não tem posição na tela; o corpo é a mochila).
    anchors: { counter: { x: number; y: number }; hero: { x: number; y: number } },
    onCollect: (total: number) => void,
  ): void {
    const inReach = (coin: Coin): boolean => {
      const dx = Math.abs(coin.tileX - playerWorldX);
      const dy = Math.abs(coin.tileY - playerWorldY);
      return (dx === 0 && dy === 0) || (this.magnetRadius > 0 && Math.max(dx, dy) <= this.magnetRadius);
    };
    for (const coin of this.coins) {
      if (!coin.isCollectable || coin.isCollected) continue;
      if (inReach(coin)) {
        coin.collect(anchors.counter, () => {
          this.total += 1;
          onCollect(this.total);
        });
      }
    }
    for (const entry of this.loot) {
      if (!entry.coin.isCollectable || entry.coin.isCollected) continue;
      if (inReach(entry.coin)) entry.coin.collect(anchors.hero, entry.onCollect);
    }
  }

  public render(tileSize: number, camera: WorldCamera): void {
    for (const coin of this.coins) {
      coin.render(tileSize, camera);
    }
    for (const entry of this.loot) {
      entry.coin.render(tileSize, camera);
    }
  }

  public resetForScreenChange(): void {
    for (const coin of this.coins) {
      coin.destroy();
    }
    this.coins.length = 0;
    for (const entry of this.loot) {
      entry.coin.destroy();
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
