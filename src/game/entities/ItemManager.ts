import type Phaser from 'phaser';

import { spawnPackSize } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';
import { ItemPickup, type HeldItemKind, type ItemFire } from './ItemPickup';

export type CollectedItem = {
  kind: HeldItemKind;
  worldX: number;
  worldY: number;
  fire?: ItemFire;
  /** Carga restante de uma batteryFull — viaja com o item, nunca reseta numa troca de maos. */
  chargeMs?: number;
  /** Quantas unidades este item vale (o pacote de sementes). Ausente = 1. */
  units?: number;
};

// Owns every held item lying on the ground: the authored pickups from world.json plus everything
// the world produces (a felled tree's stick, the bench's finished piece, the furnace's bloom). It
// never streams — items persist off-screen, so what a machine spat out an hour ago is still there
// — and it never permanently despawns; an item only leaves the ground when something collects it.
export class ItemManager {
  private items: ItemPickup[] = [];

  public constructor(private readonly scene: Phaser.Scene) {}

  public loadAuthored(
    list: ReadonlyArray<{ type: HeldItemKind; worldX: number; worldY: number; units?: number }>,
  ): void {
    for (const p of list) {
      // A ESPADA AUTORADA NÃO NASCE MAIS. Ela deixou de ser item (o herói tem a dele desde o
      // primeiro frame — ver GameScene.swordEquipped), e um mundo antigo pode ter uma deitada no
      // chão: apanhá-la não daria nada, e deixá-la ali seria um objeto que o jogo inteiro promete
      // e o botão nunca entrega. Filtrar na entrada é o único lugar que pega os três caminhos
      // (mundo autorado, level e a foto do save).
      if (p.type === 'sword') continue;
      // Sementes autoradas num mundo são um pacote CHEIO; a foto do save (que passa por aqui
      // na hidratação) traz `units` explícito — um pacote meio gasto volta meio gasto.
      const units = p.units ?? spawnPackSize(p.type);
      this.items.push(new ItemPickup(this.scene, p.type, p.worldX, p.worldY, false, undefined, undefined, units));
    }
  }

  /**
   * Drop an item on the ground (a swap): it lands unarmed so it isn't re-collected instantly.
   * `fire` keeps a lit graveto BURNING where it lands (deposited into a robotic arm, or laid
   * down by the arm itself) — the flame rides the pickup and the fuel keeps counting down.
   */
  public drop(kind: HeldItemKind, worldX: number, worldY: number, fire?: ItemFire, chargeMs?: number, units?: number): void {
    // A ESPADA NÃO CAI NO CHÃO — a mesma lei de `loadAuthored`, na outra porta. Um chunk comprado
    // pode trazer uma espada autorada na lista de pickups (o `spawnBuiltChunkContent` chama aqui,
    // não lá), e ela viraria um objeto que o jogo desenha e nenhum gesto recolhe.
    if (kind === 'sword') return;
    // `units` explícito vem do pousar do herói e do braço (o pacote que estava viajando);
    // sem ele, sementes recém-produzidas (a foice) nascem como um pacote cheio.
    const n = units ?? spawnPackSize(kind);
    this.items.push(new ItemPickup(this.scene, kind, worldX, worldY, true, fire, chargeMs, n));
  }

  public hasItemAt(x: number, y: number): boolean {
    return this.items.some((it) => !it.isCollected && it.tileX === x && it.tileY === y);
  }

  /** The kind lying on this tile (ignoring mid-fade spawns), or null. */
  public kindAt(x: number, y: number): HeldItemKind | null {
    const it = this.items.find((i) => i.isCollectable && !i.isCollected && i.tileX === x && i.tileY === y);
    return it ? it.kind : null;
  }

  /** A LIT item burns on this tile — a ground torch is a heat source (boilers feel it). */
  public hasLitItemAt(x: number, y: number): boolean {
    return this.items.some((it) => !it.isCollected && it.fire !== undefined && it.tileX === x && it.tileY === y);
  }

  /**
   * Toda chama pousada no chao — a lista, e nao o teste por tile.
   *
   * A caldeira pergunta "ha fogo NESTE vizinho?" e `hasLitItemAt` responde; a flor da lua pergunta
   * "ha fogo por PERTO?", que por tile custaria um varrimento de 21 tiles por flor por frame. Um
   * graveto aceso no chao e a mesma tocha que estava na mao (o deposito no braco, a troca num
   * tile), entao ele e uma fonte pelos dois lados — e some sozinho quando o combustivel acaba.
   */
  public litItems(): Array<{ x: number; y: number }> {
    return this.items
      .filter((it) => !it.isCollected && it.fire !== undefined)
      .map((it) => ({ x: it.tileX, y: it.tileY }));
  }

  /**
   * Lift an item off the ground without the hero touching it — the robotic arm's grab.
   * Returns the kind it took, or null if that tile was empty.
   *
   * Deliberately ignores `armed`: that flag exists so an item dropped UNDER the hero isn't
   * instantly re-collected by the hero, and the arm is not the hero. An item the player drops
   * onto an arm's input tile must be picked up on the spot — "put the item down and it moves"
   * is the whole interaction, and waiting for the player to step off would make the arm look
   * broken for one beat. It does respect `isCollectable`, so nothing gets snatched mid-fade-in.
   *
   * The pickup is destroyed rather than moved: ItemPickup's tile is readonly (its billboard and
   * its 8 rim copies are positioned once at construction), so the arm re-creates the item at the
   * far side via the normal drop() path instead of teaching pickups to slide.
   */
  public takeAt(x: number, y: number): { kind: HeldItemKind; fire?: ItemFire; chargeMs?: number; units: number } | null {
    const idx = this.items.findIndex(
      (it) => it.isCollectable && !it.isCollected && it.tileX === x && it.tileY === y,
    );
    if (idx < 0) return null;
    const [taken] = this.items.splice(idx, 1);
    const result = {
      kind: taken.kind,
      fire: taken.fire,
      chargeMs: taken.kind === 'batteryFull' ? taken.charge : undefined,
      units: taken.units,
    };
    taken.destroy();
    return result;
  }

  /** Ground items currently on the map (for debug/playtest inspection). */
  public snapshot(): CollectedItem[] {
    return this.items
      .filter((it) => !it.isCollected)
      .map((it) => ({ kind: it.kind, worldX: it.tileX, worldY: it.tileY, fire: it.fire, units: it.units }));
  }

  /** Burn down every lit ground item's fuel (their flames die alone when it runs out). */
  public tickFires(deltaMs: number): void {
    for (const it of this.items) it.tickFire(deltaMs);
  }

  /** Every charged battery lying on the ground — the grid's portable seeds (updateWireEnergy). */
  public chargedBatteries(): Array<{ x: number; y: number }> {
    return this.items
      .filter((it) => !it.isCollected && it.kind === 'batteryFull')
      .map((it) => ({ x: it.tileX, y: it.tileY }));
  }

  /**
   * Drain the charged battery on this tile for one frame of grid-feeding. When the charge
   * runs out the item is swapped for its empty shell IN PLACE — the battery visibly dies
   * into a `battery` pickup the hero can carry back for a recharge (nothing evaporates).
   */
  public drainBatteryAt(x: number, y: number, deltaMs: number): void {
    const it = this.items.find((i) => !i.isCollected && i.kind === 'batteryFull' && i.tileX === x && i.tileY === y);
    if (!it || !it.drainCharge(deltaMs)) return;
    this.takeAt(x, y);
    this.items.push(new ItemPickup(this.scene, 'battery', x, y, true));
  }

  // (O `update(heroX, heroY)` que coletava o item sob os pes do heroi viveu aqui, foi REMOVIDO
  // quando pegar virou um botao, e a pisada voltou a apanhar — mas do lado de fora: quem chama
  // `takeAt` hoje e `GameScene.collectUnderfoot`, que decide o que vai pra bolsa, o que vai pro
  // contador e o que acende cerimonia. A regra e a mesma de sempre: `takeAt` e a unica porta pra
  // dentro, e ela nao sabe nada sobre mochila.)

  public render(tileSize: number, camera: WorldCamera): void {
    for (const it of this.items) it.render(tileSize, camera);
  }

  public destroy(): void {
    for (const it of this.items) it.destroy();
    this.items = [];
  }
}
