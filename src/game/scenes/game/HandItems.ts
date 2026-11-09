// A MÃO: pegar o que está debaixo do pé ou à frente, pousar, o prazer de colher em sequência, a borboleta solta, e a
// tela do item novo.

import { ASSET_KEYS, ITEM_FRAMES, KEY_FRAMES, UNIT_PACK_KINDS } from '@/game/constants';
import { isNightTime } from '@/game/runtime/timeOfDay';
import { materialOf } from '@/game/audio/materials';
import type { CollectedItem } from '@/game/entities/ItemManager';
import { isBagItem, isDecorKind, type HeldItemKind } from '@/game/entities/ItemPickup';
import { t } from '@/game/i18n/i18n';
import { KNIFE_TEXTURE_KEY, isMushroomKind } from '@/game/fungi/fungi';
import { BUTTERFLY_TEXTURE } from '@/game/render3d/cozyTextures';
import { ItemGetOverlay, type ItemGetConfig } from '@/game/runtime/ItemGetOverlay';
import { ASH_TEXTURE, GLASS_TEXTURE, SAND_TEXTURE, TELESCOPE_ITEM_TEXTURE } from '@/game/render3d/skyTextures';
import { SPLIT_WOOD_TEXTURE } from '@/game/render3d/woodTextures';
import { BRUSH_TEXTURE, DYE_BUNDLE_TEXTURE, DYE_SEEDS_TEXTURE } from '@/game/render3d/paintTextures';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { GameScene } from '../GameScene';
import { BUTTERFLY_ASPECT, BUTTERFLY_SIZE, BUTTERFLY_TINTS, FUNGUS_VISUALS } from './sceneDefs';

// The raised sprite for each item's first-time "item get" ceremony. The caption is NOT here: it
// comes from the locale (`items.get.<kind>`), the one place the game's text lives.
const ITEM_GET_CFG: Record<HeldItemKind, Omit<ItemGetConfig, 'label'>> = {
  stool: { texture: 'valley-find-stool', frame: 0 },
  lantern: { texture: 'valley-find-lantern', frame: 0 },
  flowerPot: { texture: 'valley-find-flowerPot', frame: 0 },
  sword: { texture: ASSET_KEYS.swordItem, frame: ITEM_FRAMES.swordIdle },
  key: { texture: ASSET_KEYS.keyItem, frame: KEY_FRAMES.held },
  axe: { texture: ASSET_KEYS.axeIcon, frame: 0 },
  pickaxe: { texture: ASSET_KEYS.pickaxeIcon, frame: 0 },
  scythe: { texture: ASSET_KEYS.scytheIcon, frame: 0 },
  shovel: { texture: ASSET_KEYS.shovelIcon, frame: 0 },
  wood: { texture: ASSET_KEYS.woodIcon, frame: 0 },
  stone: { texture: ASSET_KEYS.rock, frame: 0 },
  iron: { texture: ASSET_KEYS.ironItem, frame: 0 },
  bucket: { texture: 'bucket-icon', frame: 0 },
  bucketFull: { texture: 'bucket-full-icon', frame: 0 },
  charcoal: { texture: 'charcoal-item', frame: 0 },
  ore: { texture: ASSET_KEYS.oreItem, frame: 0 },
  bloom: { texture: ASSET_KEYS.bloomItem, frame: 0 },
  furnace: { texture: ASSET_KEYS.furnace, frame: 0 },
  altar: { texture: ASSET_KEYS.altar, frame: 0 },
  knife: { texture: KNIFE_TEXTURE_KEY, frame: 0 },
  dyeSeeds: { texture: DYE_SEEDS_TEXTURE, frame: 0 },
  dyeBundle: { texture: DYE_BUNDLE_TEXTURE, frame: 0 },
  brush: { texture: BRUSH_TEXTURE, frame: 0 },
  splitWood: { texture: SPLIT_WOOD_TEXTURE, frame: 0 },
  sand: { texture: SAND_TEXTURE, frame: 0 },
  ash: { texture: ASH_TEXTURE, frame: 0 },
  glass: { texture: GLASS_TEXTURE, frame: 0 },
  telescope: { texture: TELESCOPE_ITEM_TEXTURE, frame: 0 },
  ...FUNGUS_VISUALS,
};
/** Até quando uma coisa apanhada ainda conta como "em seguida". */
const GATHER_STREAK_MS = 6000;
const BUTTERFLY_RELEASE_MAX = 8;

export class HandItems {
  /** Quantas coisas ele apanhou em seguida: a nota sobe, e de tanto em tanto o vale responde. */
  private gatherStreak = 0;
  private lastGatherMs = -Infinity;

  public itemGetOpen = false;
  public itemGetOverlay?: ItemGetOverlay;

  public constructor(private readonly host: GameScene) {}

  /**
   * O Z PODE PEGAR O QUE ESTÁ DEBAIXO DO HERÓI? A mesma pergunta decide o balão e o botão, para o balão
   * nunca prometer o que a tecla recusaria. Cogumelo é da faca, e o que enfeita é sólido. Duas coisas
   * iguais não têm o que trocar, a não ser o PACOTE, que soma. Com um NPC na frente o Z é a conversa.
   */
  public handOfferUnderfoot(): HeldItemKind | null {
    const { worldX, worldY } = this.host.playerWorld;
    const kind = this.host.itemManager?.kindAt(worldX, worldY);
    if (!kind || isMushroomKind(kind) || isDecorKind(kind)) return null;
    const held = this.host.heldItem;
    if (held !== 'none' && isMushroomKind(held)) return null;
    if (held === kind && !UNIT_PACK_KINDS.has(kind)) return null;
    const front = this.host.verbs.facingTile();
    if (this.host.actions.reachesFront(front) && this.host.npcManager?.hasNpcAt(front.x, front.y)) return null;
    return kind;
  }

  /** Mão vazia ou o mesmo pacote: pega. Mão cheia: troca, e o que estava nela fica no lugar. */
  public takeUnderfoot(): void {
    const { worldX, worldY } = this.host.playerWorld;
    const kindHere = this.host.itemManager?.kindAt(worldX, worldY);
    if (this.host.heldItem === 'none' || this.host.heldItem === kindHere) this.collectUnderfoot(worldX, worldY);
    else this.handAt(worldX, worldY);
  }

  /**
   * APANHAR O QUE ESTÁ DEBAIXO DO HERÓI, sempre pelo Z (`pressAttack`): pisar não pega mais nada, e o
   * balão (`HandOffer`) é quem avisa. A cerimônia de item novo só acontece para o que tem gesto: um
   * "ITEM GET" de tela cheia para o primeiro minério seria o jogo parando para nada. O fogo sobe junto
   * com o graveto.
   */
  private collectUnderfoot(wx: number, wy: number): void {
    const taken = this.host.itemManager?.takeAt(wx, wy);
    if (!taken) return;
    const handWasEmpty = this.host.heldItem === 'none';
    this.host.inventory.add(taken.kind, taken.units ?? 1);
    if (handWasEmpty) {
      this.host.torch.heldOnFire = taken.kind === 'wood' && taken.fire !== undefined;
      this.host.torch.torchFuelMs = taken.fire?.fuelMs ?? 0;
    }
    this.host.carry.updateBackItem();
    if (isBagItem(taken.kind) && !this.host.seenItems.has(taken.kind)) {
      this.host.seenItems.add(taken.kind);
      this.showItemGet(taken.kind, () => {});
    } else {
      this.host.seenItems.add(taken.kind);
      this.gatherDelight(taken.kind, wx, wy);
    }
    this.host.save.persistAdventure();
  }

  /**
   * APANHAR TEM GRAÇA. Cada coisa soa pelo material dela, a nota sobe se ele vem apanhando em seguida, o
   * mato em volta mexe, e de três em três uma borboleta sai de onde a coisa estava. Nada disso rende nada.
   */
  private gatherDelight(kind: HeldItemKind, wx: number, wy: number): void {
    const now = this.host.time.now;
    this.gatherStreak = now - this.lastGatherMs < GATHER_STREAK_MS ? this.gatherStreak + 1 : 0;
    this.lastGatherMs = now;
    getSoundManager().ui.playPick(materialOf(kind), this.gatherStreak);
    this.host.world3d?.objects.rustleDecor(wx - 1, wy);
    this.host.world3d?.objects.rustleDecor(wx + 1, wy);
    if (this.gatherStreak % 3 !== 2) return;
    this.host.sparkle.spawnGrowSparkle(wx, wy);
    if (!isNightTime() && this.host.life.butterflies.length < BUTTERFLY_RELEASE_MAX) this.releaseButterfly(wx, wy);
  }

  private releaseButterfly(wx: number, wy: number): void {
    const size = BUTTERFLY_SIZE;
    const bb = this.host.world3d?.objects.addBillboard(BUTTERFLY_TEXTURE, 0, { centered: true, depthWrite: false })
      .setTint(BUTTERFLY_TINTS[Math.floor(Math.random() * BUTTERFLY_TINTS.length)])
      .setDisplaySize(size, size * BUTTERFLY_ASPECT);
    if (!bb) return;
    this.host.life.butterflies.push({ bb, x: wx, y: wy, tx: wx + 2, ty: wy - 2, phase: Math.random() * 10, size });
  }

  /**
   * O Z É A MÃO, e com uma mão só ela tem três gestos contra o tile da frente:
   *   • coisa no chão e mão vazia → PEGA;
   *   • coisa no chão e mão cheia → TROCA (a da mão pousa onde a outra estava);
   *   • chão livre e mão cheia    → POUSA.
   * O cogumelo colhido não sai das costas: no chão ele voltaria a ser um cogumelo nascendo, que só
   * a faca solta (ver `harvestMushroomAt`). Ele vai até a Shui ou até a fogueira do fim.
   */
  public handAt(wx: number, wy: number): boolean {
    if (!this.host.itemManager) return false;
    const held = this.host.heldItem;
    const there = this.host.itemManager.kindAt(wx, wy);
    if (isMushroomKind(there)) return false; // nascendo: é da faca
    const stuck = held !== 'none' && isMushroomKind(held);
    if (there) {
      if (stuck) { this.host.forage.refuseMushroomDrop(); return true; }
      const fire = this.host.torch.isTorchLit ? { fuelMs: this.host.torch.torchFuelMs } : undefined;
      const out = this.host.inventory.takeAll();
      this.host.torch.heldOnFire = false;
      this.host.torch.torchFuelMs = 0;
      const taken = this.host.itemManager.takeAt(wx, wy);
      if (out) {
        this.host.itemManager.drop(out.kind, wx, wy, fire, out.count);
        if (fire) this.host.fire.scheduleGroundTorchSpread(wx, wy);
      }
      if (taken) {
        this.onCollectItem({ kind: taken.kind, worldX: wx, worldY: wy, fire: taken.fire, units: taken.units });
      } else {
        this.host.carry.updateBackItem();
      }
      return true;
    }
    if (held === 'none') return false;
    if (stuck) { this.host.forage.refuseMushroomDrop(); return true; }
    return this.placeItemAt(wx, wy);
  }

  /**
   * PÔR NA MÃO o que chega de fora (presente, devolução): o que estava nela pousa perto do herói
   * antes. É a lei de uma coisa só, num lugar só.
   */
  public takeIntoHand(kind: HeldItemKind, units = 1): void {
    if (this.host.heldItem !== 'none' && this.host.heldItem !== kind) {
      const out = this.host.inventory.takeAll();
      if (this.host.torch.heldOnFire) this.host.torch.extinguishTorch();
      this.host.torch.heldOnFire = false;
      this.host.torch.torchFuelMs = 0;
      if (out) this.host.groundItems.dropNear(out.kind, out.count, this.host.playerWorld.worldX, this.host.playerWorld.worldY);
    }
    this.host.inventory.add(kind, units);
    this.host.carry.updateBackItem();
  }

  /**
   * Pousar o item selecionado num tile livre. Um tile guarda UM item (dois seriam um
   * desaparecimento silencioso), e nada se pousa dentro de parede, prop ou bicho.
   *
   * O fogo desce junto: um graveto aceso deixado no chão continua queimando e acende o que houver
   * de inflamável ao lado.
   */
  public placeItemAt(wx: number, wy: number): boolean {
    const kind = this.host.heldItem;
    if (kind === 'none' || !this.host.itemManager) return false;
    if (this.host.itemManager.hasItemAt(wx, wy) || this.host.query.isTileOccupied(wx, wy) || this.host.groundItems.itemForbiddenAt(wx, wy)) return false;

    const fire = this.host.torch.isTorchLit ? { fuelMs: this.host.torch.torchFuelMs } : undefined;
    // O PACOTE pousa inteiro (ver UNIT_PACK_KINDS), e pegá-lo de volta devolve a mesma contagem.
    const units = this.host.inventory.count(kind);
    this.host.inventory.takeAll();
    this.host.torch.heldOnFire = false;
    this.host.torch.torchFuelMs = 0;
    this.host.carry.updateBackItem();
    this.host.itemManager.drop(kind, wx, wy, fire, units);
    if (fire) this.host.fire.scheduleGroundTorchSpread(wx, wy);
    getSoundManager().ui.playPut(materialOf(kind));
    this.host.save.persistAdventure();
    return true;
  }

  /**
   * Uma coisa do chão vai para a MÃO, que já está vazia (quem chama larga antes: a troca do Z, a
   * máquina recolhida). Primeira vez de um tipo → a cerimonia do ItemGet; depois, so o chime.
   */
  public onCollectItem(item: CollectedItem): void {
    // O pacote entra inteiro (as sementes valem SEEDS_PER_PACK recém-colhidas; um punhado
    // pousado volta com a contagem que tinha). A bolsa e a subtela já mostram o número.
    this.host.inventory.add(item.kind, item.units ?? 1);
    this.host.delivery.questEvent({ type: 'gather', item: item.kind, units: item.units ?? 1 });
    // Um graveto ACESO apanhado do chao sobe aceso, com o combustivel que lhe resta — o par
    // do deposito no braco. O item LARGADO na troca ainda pousa apagado (a queda apaga);
    // fogo so desce ao chao pela entrega deliberada a uma maquina.
    if (item.kind === 'wood' && item.fire) {
      this.host.torch.heldOnFire = true;
      this.host.torch.torchFuelMs = item.fire.fuelMs;
    } else {
      this.host.torch.heldOnFire = false;
      this.host.torch.torchFuelMs = 0;
    }
    this.host.swing.swordSlash?.setOnFire(false);
    this.host.carry.updateBackItem(); // the held item shows on the hero's back — the game's only inventory

    if (this.host.seenItems.has(item.kind)) {
      // Repeat pickup: no ceremony, just the pickup chime (the item shows on the back).
      this.gatherDelight(item.kind, item.worldX, item.worldY);
    } else {
      // First-time pickup: the ItemGetOverlay ceremony plays its own pickup chime at the reveal.
      this.host.seenItems.add(item.kind);
      this.showItemGet(item.kind, () => {});
    }
    this.host.save.persistAdventure(); // a mochila e o chao mudaram juntos
  }

  /**
   * GASTAR o que está na mão (o graveto que virou ponte, a pedra que virou vau): sai UMA unidade —
   * o pacote de sementes continua na mão até a última.
   */
  public clearHeldItem(): void {
    const kind = this.host.heldItem;
    if (kind !== 'none') this.host.inventory.remove(kind);
    this.host.torch.heldOnFire = false;
    this.host.torch.torchFuelMs = 0;
    this.host.carry.updateBackItem();
  }

  /** Escolher o item do B (a subtela, e o playtest). Recusa o que nao esta na mochila. */
  public selectItem(kind: HeldItemKind | 'none'): boolean {
    // Com uma mão só não há o que escolher: "selecionar" só confirma o que já está nela.
    return kind === this.host.heldItem;
  }

  // Zelda-style "item get" beat: freeze the game, spotlight the hero, raise the item.
  public showItemGet(kind: HeldItemKind, afterClose: () => void): void {
    if (this.itemGetOpen) { afterClose(); return; }
    this.itemGetOpen = true;
    getSoundManager().music.fadeMusicOut();
    this.host.movementController?.interruptMovement(this.host.playerWorld.worldX, this.host.playerWorld.worldY);
    // interruptMovement just snapped the camera to the hero's tile mid-frame — after the tiles
    // were already drawn at the old camera but before props/items. Re-project the whole world
    // once so everything realigns to the final camera before the ceremony freezes it (otherwise
    // props/items look shifted a tile until the overlay closes).
    this.host.view.reprojectStatic();
    this.itemGetOverlay = new ItemGetOverlay(this.host, {
      ...ITEM_GET_CFG[kind], label: t(`items.get.${kind}`),
    }, () => {
      this.itemGetOverlay?.destroy();
      this.itemGetOverlay = undefined;
      this.itemGetOpen = false;
      getSoundManager().music.fadeMusicIn();
      afterClose();
    });
  }
}
