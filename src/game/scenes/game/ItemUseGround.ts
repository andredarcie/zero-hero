// A TABELA DE ITENS, O RESTO: a pedra e a picareta, a flor da lua, o canteiro e o balde, o capim alto, a porta e o
// portão do jardim com a chave, a árvore verde (nada), e a pá no chão de terra.

import { ASSET_KEYS, KEY_FRAMES } from '@/game/constants';
import { CHOP_IMPACT_MS } from '@/game/runtime/SwordOrbit';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { GameScene } from '../GameScene';

/** O que ItemUseGround usa de GameScene. */
export type ItemUseGroundHost = Pick<GameScene,
  'camera' | 'carry' | 'debris' | 'fire' | 'garden' | 'gardenUnlock' | 'groundItems' | 'heldItem'
  | 'playerWorld' | 'props' | 'query' | 'sparkle' | 'swing' | 'tileSize' | 'time' | 'torch' | 'water'
>;

export class ItemUseGround {
  public constructor(private readonly host: ItemUseGroundHost) {}

  /** A pedra (picareta), a flor da lua, o canteiro (regar) e o capim alto (foice, fogo). `undefined` = não é com este degrau (ver useItemAt). */
  public useOnStoneAndPlants(wx: number, wy: number): boolean | undefined {
    // Rock — the pickaxe cracks it, then shatters it open, and the shattered rock LEAVES A
    // STONE BEHIND. That drop is the whole point of the item: a pickaxe that only removed its
    // obstacle produced nothing but passage, which makes it a password rather than a tool.
    // Now its output (stone) is another interaction's input (a ford across the river) — the
    // same shape as the axe, which is the only item that was ever interesting for exactly this
    // reason: a felled tree becomes firewood, or a bridge.
    const rock = this.host.query.getRockAt(wx, wy);
    if (rock?.blocking) {
      if (this.host.heldItem === 'pickaxe') {
        // The direction of the blow, captured now: the delayed impact below must not read the
        // hero's facing again, since a queued key could have turned him in the meantime.
        const dirX = Math.sign(wx - this.host.playerWorld.worldX);
        const dirY = Math.sign(wy - this.host.playerWorld.worldY);
        this.host.swing.swingPickaxe(wx, wy);
        this.host.time.delayedCall(CHOP_IMPACT_MS, () => {
          const blow = rock.smash(dirX, dirY);
          if (blow === 'none') return;
          getSoundManager().work.playRockSmash();
          this.host.debris.spawnRockDebris(wx, wy, dirX, dirY, blow !== 'struck', rock.ore);
          // A pedra comum ABRE e deixa o espolio no tile; o VEIO de ferro nunca abre — a cada
          // ciclo de 3 pancadas ele PRODUZ um bloco, que SALTA e pousa em volta da pedra.
          if (blow === 'shattered') this.host.groundItems.dropRockSpoil(rock);
          else if (blow === 'yielded') this.host.groundItems.spawnOreLoot(rock);
        });
      } else {
        rock.shake();
      }
      return true;
    }

    // Moonflower — a shut bud in the light. No item opens it; only the DARK does (put out the
    // campfires nearby, e.g. with the bucket). A bump just rustles it — the cat's lines carry
    // the rule.
    const flower = this.host.query.getMoonflowerAt(wx, wy);
    if (flower?.blocking) {
      flower.shake();
      return true;
    }

    // A planted mound — the seed under fresh earth, waiting for water. Bump with the FULL
    // bucket to water it (the douse gesture turned nurturing); the grass sprouts a while later.
    // A dry-handed bump just rustles it; an already-watered mound just waits.
    const plantSpot = this.host.query.getPlantSpotAt(wx, wy);
    if (plantSpot?.blocking) {
      if (plantSpot.isMound && this.host.heldItem === 'bucketFull') {
        this.host.swing.swingHeld(wx, wy);
        this.host.time.delayedCall(120, () => {
          this.host.water.throwBucketWater(wx, wy, () => this.host.garden.waterPlantSpot(plantSpot, wx, wy));
        });
      }
      return true;
    }

    // Tall grass — the scythe mows it down to stubble; fire burns it to the same stubble.
    const grass = this.host.query.getTallGrassAt(wx, wy);
    if (grass?.blocking && grass.isTall) {
      if (this.host.heldItem === 'scythe') {
        this.host.swing.swingHeld(wx, wy);
        getSoundManager().work.playGrassCut();
        // Corta rente ao talo e só (pedido do autor): o mato não dá semente, ele só abre a passagem.
        this.host.time.delayedCall(110, () => { grass.cut(); });
      } else if (this.host.torch.isFlammableHeld && this.host.torch.heldOnFire) {
        this.host.swing.swingHeld(wx, wy);
        this.host.time.delayedCall(150, () => {
          if (!grass.ignite()) return;
          this.host.sparkle.spawnFireHitEffect(wx, wy);
          this.host.fire.scheduleFireSpread(wx, wy); // grass carries fire — this is the fuse
        });
      } else {
        grass.shake();
      }
      return true;
    }
    return undefined;
  }

  /** A porta trancada e o portão do jardim, a árvore verde (nada), e a pá no chão de terra. `undefined` = não é com este degrau (ver useItemAt). */
  public useOnDoorAndGround(wx: number, wy: number): boolean | undefined {
    // (O portao de bater NAO esta nesta tabela: nenhum item o abre — o que o abre e o corpo,
    // e por isso ele mora no esbarrao. Ver handlePlayerBump.)

    // Locked door — opens when the hero is holding a key. The key is NOT consumed: it stays
    // in hand (no item is ever destroyed), so it can open more doors.
    const door = this.host.query.getLockedDoorAt(wx, wy);
    if (door?.blocking) {
      // O PORTÃO DO JARDIM ALTO tem a cena dele: a chave entra, gira e fica (pedido do autor).
      if (this.host.heldItem === 'key' && this.host.props.gardenGates.includes(door)) {
        void this.host.gardenUnlock.playGardenUnlock(door);
        return true;
      }
      if (this.host.heldItem === 'key') {
        // Swing the key at the door with the sword's exact slash arc, then open when the
        // swing lands (same timing the flaming torch uses to ignite a bush).
        door.shake();
        if (this.host.swing.swordSlash && this.host.camera) {
          getSoundManager().work.playSwordSlash();
          this.host.carry.hideBackItemDuringSwing(); // the key swings out of hand, so hide the back copy
          const dx = wx - this.host.playerWorld.worldX;
          const dy = wy - this.host.playerWorld.worldY;
          const screen = this.host.camera.tileToScreen(this.host.playerWorld.worldX, this.host.playerWorld.worldY, this.host.tileSize);
          this.host.swing.swordSlash.slash(screen.x, screen.y, dx, dy, this.host.tileSize, {
            texture: ASSET_KEYS.keyItem,
            frame: KEY_FRAMES.held,
          });
        }
        this.host.time.delayedCall(150, () => {
          if (!door.unlock()) return;
          getSoundManager().ui.playShopOpen();
          // A floodgate drains the water it dammed — a key that reshapes the map, not just opens
          // a tile: a new path AND a fresh firebreak where the river used to run.
          if (door.isFloodgate) this.host.water.openFloodgate(door.worldX, door.worldY);
          // O PORTÃO DO JARDIM ALTO: a chave do último pedido o abre, e o save lembra.
          if (this.host.props.gardenGates.includes(door)) this.host.gardenUnlock.openGardenGate();
        });
      } else {
        door.shake();
      }
      return true;
    }

    // A ARVORE VERDE e TILE e NUNCA sai do lugar: o X contra ela nao faz nada, em silencio. Por
    // ultimo, depois de todo prop: props ficam EM CIMA de tiles, entao uma rocha ou uma porta na
    // frente de um pinheiro respondem primeiro.
    if (this.host.query.isTreeTileAt(wx, wy)) return true;

    // A BOMBA saiu daqui. Ela tem resposta em TODO tile desde que pode ser posta em qualquer
    // chão, e uma linha assim no meio da tabela engoliria a tabela inteira: com a bomba
    // selecionada, o X nunca mais tiraria uma peça do altar nem recolheria uma estação. Ela é o
    // ÚLTIMO degrau do aperto, logo antes do gesto no vazio — ver `pressUse` e `bombDropTile`.

    // (Plantar é só a quest da Sisi: as quatro sementes de tinta nos quatro buracos. Ver PainterQuest.)

    // A PÁ — a única ferramenta cuja fechadura é o CHÃO NU de terra (canDigAt): ela cava um
    // canteiro (plantSpot). Por último de propósito, depois de todo prop e de toda marca:
    // qualquer coisa EM CIMA da terra responde primeiro, e onde não há terra o `false` deixa
    // o arco sair no vazio.
    if (this.host.heldItem === 'shovel' && this.host.garden.canDigAt(wx, wy)) {
      this.host.swing.swingHeld(wx, wy);
      this.host.time.delayedCall(150, () => this.host.garden.digPlantHole(wx, wy));
      return true;
    }
    return undefined;
  }
}
