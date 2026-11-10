// O BALANÇO DA FERRAMENTA: o arco do item na mão (o mesmo da espada), o machado que morde a árvore e derruba o
// graveto, a picareta, e a ferramenta guardada que vem às costas quando o tile à frente a pede.

import { ASSET_KEYS } from '@/game/constants';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { isMushroomKind } from '@/game/fungi/fungi';
import { AXE_STUCK_MS, CHOP_DRIVE_AT_MS, CHOP_IMPACT_MS, CHOP_TOTAL_MS } from '@/game/runtime/SwordOrbit';
import { isToolKind } from '@/game/runtime/Inventory';
import { materialOf } from '@/game/audio/materials';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { GameScene } from '../GameScene';
import { SwordSlash } from '@/game/runtime/SwordOrbit';
import { ITEM_VISUAL_2D } from './sceneDefs';

// Where a swing PIVOTS on the hero, in tiles above the ground: a swing comes from the HANDS, and
// the hero is about one tile tall.
const SWING_HAND_ELEVATION = 0.55;
// Facing away (north), the pivot is also pulled a little TOWARD the camera, so the arc crosses
// the hero's body and reads as happening in FRONT of him.
const SWING_BACK_TURNED_NEAR = 0.3;

/** O que ToolSwing usa de GameScene. */
export type ToolSwingHost = Pick<GameScene,
  'actions' | 'camera' | 'carry' | 'debris' | 'groundItems' | 'heldItem' | 'hero' | 'inventory'
  | 'movementController' | 'playerWorld' | 'query' | 'save' | 'tileSize' | 'time' | 'torch' | 'tweens' | 'verbs'
  | 'world3d'
>;

export class ToolSwing {
  public swordSlash?: SwordSlash;

  public constructor(private readonly host: ToolSwingHost) {}

  /** The axe cuts DEAD wood (dryTree, dryShrub) — and only that: a green tree never moves. */
  public get holdsAnAxe(): boolean {
    return this.host.heldItem === 'axe';
  }

  /**
   * A FERRAMENTA GUARDADA VEM ÀS COSTAS quando é ela que o tile à frente pede (ActionVerbs.toolFor: a mesma
   * pergunta do balão). A que estava nas costas, se for ferramenta, vai para as guardadas; se for MATERIAL, desce
   * aos pés do herói — só uma coisa vai nas costas, e quem guarda as ferramentas não guarda pedra. O Z a pega de
   * volta. A tocha acesa e o cogumelo colhido nunca saem assim (ver toolFor).
   */
  public equipToolFor(wx: number, wy: number, button: 'hand' | 'use'): void {
    const found = this.host.verbs.toolFor(wx, wy, button);
    if (found) this.equip(found.tool);
  }

  /**
   * Traz uma ferramenta que ele TEM às costas (a cova debaixo dos pés pede a pá sem olhar para o tile da frente).
   * Devolve se ela está nas costas agora. A tocha acesa e o cogumelo colhido não saem das costas.
   */
  public equip(tool: HeldItemKind): boolean {
    const held = this.host.heldItem;
    if (held === tool) return true;
    if (!this.host.inventory.owns(tool) || this.host.torch.heldOnFire || isMushroomKind(held)) return false;
    if (!isToolKind(held)) {
      const out = this.host.inventory.takeAll();
      this.host.torch.heldOnFire = false;
      this.host.torch.torchFuelMs = 0;
      if (out) this.host.groundItems.dropNear(out.kind, out.count, this.host.playerWorld.worldX, this.host.playerWorld.worldY);
    }
    if (!this.host.inventory.equip(tool)) return false;
    this.host.carry.updateBackItem();
    getSoundManager().ui.playPick(materialOf(tool), 0);
    this.host.save.persistAdventure();
    return true;
  }

  /**
   * Swing the current held item at a tile with the sword's slash arc. The sword swings
   * itself (the animator owns its fire state); every other item swings its own sprite —
   * burning wood carries its flame into the arc.
   */
  public swingHeld(wx: number, wy: number): void {
    if (!this.swordSlash || !this.host.camera || this.host.heldItem === 'none') return;
    if (this.host.heldItem === 'axe') { this.swingAxe(wx, wy); return; }
    getSoundManager().work.playSwordSlash();
    // The held item flies out in the swing arc, so hide the copy slung on the back for the
    // swing's duration — otherwise the item appears in two places at once.
    this.host.carry.hideBackItemDuringSwing();
    const dx = wx - this.host.playerWorld.worldX;
    const dy = wy - this.host.playerWorld.worldY;
    const screen = this.swingAnchor(dy);
    // Sem ramo de espada aqui: ela nao e item, entao nunca e o que esta na mao (ver swingSword,
    // que e o arco do botao Z).
    const visual = ITEM_VISUAL_2D[this.host.heldItem];
    this.swordSlash.slash(screen.x, screen.y, dx, dy, this.host.tileSize, {
      texture: visual.texture, // wood uses its single-stick icon (the "graveto")
      frame: visual.frame,
      onFire: this.host.heldItem === 'wood' && this.host.torch.heldOnFire,
      // A pá é desenhada com o cabo em cima: de ponta-cabeça, quem morde a terra é o metal (pedido do autor).
      flipY: this.host.heldItem === 'shovel',
    });
  }

  /**
   * Where a swing pivots on screen: the hero's HANDS, not the tile under his boots, and pulled
   * toward the camera when his back is turned. See SWING_HAND_ELEVATION / SWING_BACK_TURNED_NEAR.
   *
   * E o ponto e o do CORPO DESENHADO, nao o do tile logico: durante um passo os dois estao a ate
   * um tile de distancia (ver PlayerMovementController.visualWorld), e ancorar no logico punha o
   * arco flutuando na frente do heroi sempre que ele corria e batia ao mesmo tempo. Como ele fica
   * pregado no centro da tela enquanto anda, esse ponto tambem nao se move durante a animacao —
   * o arco acompanha a corrida sem precisar ser reposicionado quadro a quadro.
   */
  private swingAnchor(dy: number): { x: number; y: number } {
    // The arc is a 2D sprite over the 3D world, so it has to be TOLD how lit the hero is or it
    // swings at full art brightness through the night. See World3D.lightLevelAt / SWING_DARK.
    this.swordSlash?.setLightLevel(
      this.host.world3d?.probe.lightLevelAt(this.host.playerWorld.worldX, this.host.playerWorld.worldY) ?? 1,
    );
    const at = this.host.movementController?.visualWorld(this.host.playerWorld.worldX, this.host.playerWorld.worldY)
      ?? { x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY };
    const nearer = dy < 0 ? SWING_BACK_TURNED_NEAR : 0;
    return this.host.camera!.tileToScreen(
      at.x,
      at.y + nearer,
      this.host.tileSize,
      SWING_HAND_ELEVATION,
    );
  }

  /**
   * The overhead MINING swing (SwordSlash.chop), not the sword's arc: raised over the head, held
   * there, and driven down into one spot. It belongs to the tool heavy enough to earn it — the
   * pickaxe into stone. Combat keeps the flat slash (nobody
   * hauls a pick over their head at a skeleton standing on top of them), and this is the only
   * swing that lands late, at CHOP_IMPACT_MS.
   */
  private swingChop(item: 'pickaxe', wx: number, wy: number): void {
    if (!this.swordSlash || !this.host.camera) return;
    // The whoosh belongs to the DRIVE, not to the wind-up: a pick hauled slowly overhead makes no
    // sound at all, and the noise is what tells the player the blow is now unstoppable.
    this.host.time.delayedCall(CHOP_DRIVE_AT_MS, () => getSoundManager().work.playSwordSlash());
    this.host.carry.hideBackItemDuringSwing(CHOP_TOTAL_MS); // a chop is far longer than a slash
    const dx = wx - this.host.playerWorld.worldX;
    const dy = wy - this.host.playerWorld.worldY;
    const screen = this.swingAnchor(dy);
    const visual = ITEM_VISUAL_2D[item];
    this.swordSlash.chop(screen.x, screen.y, dx, dy, this.host.tileSize, {
      texture: visual.texture,
      frame: visual.frame,
    });
  }

  /**
   * A MACHADADA, no ar ou na madeira. O corpo vai junto: recua para juntar força, joga o peso para a
   * frente, e o que acontece depois é a resposta do mundo. No ar ele passa do ponto e cambaleia; no
   * tronco ele para seco, levando o coice, e volta devagar enquanto puxa a lâmina.
   */
  private swingAxe(wx: number, wy: number): void {
    if (!this.swordSlash || !this.host.camera) return;
    const dx = Math.sign(wx - this.host.playerWorld.worldX);
    const dy = Math.sign(wy - this.host.playerWorld.worldY);
    const hit = Boolean(this.host.query.getDryTreeAt(wx, wy)?.blocking || this.host.query.getDryShrubAt(wx, wy)?.blocking
      || this.host.query.getDryBushAt(wx, wy)?.blocking);
    const sound = getSoundManager();
    this.host.time.delayedCall(CHOP_DRIVE_AT_MS, () => sound.work.playAxeWhoosh());
    this.host.carry.hideBackItemDuringSwing(CHOP_TOTAL_MS + AXE_STUCK_MS);
    this.host.actions.useCooldownMs = Math.max(this.host.actions.useCooldownMs, CHOP_TOTAL_MS);
    const screen = this.swingAnchor(dy);
    const visual = ITEM_VISUAL_2D.axe;
    this.swordSlash.chop(screen.x, screen.y, dx, dy, this.host.tileSize, { texture: visual.texture, frame: visual.frame }, { hit });

    const hero = this.host.hero;
    this.host.tweens.killTweensOf(hero);
    const lean = (amount: number, duration: number, ease: string, onComplete?: () => void): void => {
      this.host.tweens.add({ targets: hero, lungeX: dx * amount, lungeY: dy * amount, duration, ease, onComplete });
    };
    lean(-0.09, CHOP_DRIVE_AT_MS, 'Sine.easeOut', () => {
      lean(0.15, CHOP_IMPACT_MS - CHOP_DRIVE_AT_MS, 'Cubic.easeIn', () => {
        if (hit) {
          // O COICE: o tronco devolve a força, o corpo trava, e só depois volta ao lugar.
          this.host.time.delayedCall(AXE_STUCK_MS, () => lean(-0.07, 110, 'Back.easeOut', () => lean(0, 150, 'Sine.easeInOut')));
        } else {
          lean(0.24, 120, 'Sine.easeOut', () => lean(0, 240, 'Sine.easeInOut'));
        }
      });
    });
  }

  /** O instante em que a lâmina entra na madeira: pancada, lascas e o tranco na câmera. */
  public axeBite(wx: number, wy: number): void {
    getSoundManager().work.playAxeBite();
    this.host.debris.spawnBridgeChips(wx, wy, 5);
    const dx = Math.sign(wx - this.host.playerWorld.worldX);
    const dy = Math.sign(wy - this.host.playerWorld.worldY);
    this.host.world3d?.cam.shake(90, 0.009, dx, dy);
  }

  /**
   * O GALHO SOLTA: sai do alto da árvore, gira caindo, bate no chão, quica duas vezes e deita. Só
   * então vira o item de verdade, no mesmo lugar: é uma coisa só caindo, nunca duas.
   */
  public dropFallingStick(wx: number, wy: number, units: number): void {
    const w3 = this.host.world3d;
    if (!w3) { this.host.groundItems.dropProduct('wood', wx, wy, units); return; }
    const stick = w3.objects.addBillboard(ASSET_KEYS.woodIcon, 0, { groundShadow: { rx: 0.14, rz: 0.08, alpha: 0.24 } })
      .setPosition(wx + 0.16, wy)
      .setElevation(1.45)
      .setDisplaySize(0.8, 0.8);
    const sound = getSoundManager();
    const k = { t: 0 };
    this.host.tweens.add({
      targets: k,
      t: 1,
      duration: 430,
      ease: 'Quad.easeIn',
      onUpdate: () => {
        stick.setElevation(1.45 * (1 - k.t));
        stick.setPosition(wx + 0.16 * (1 - k.t), wy);
        stick.setAngle(k.t * 630);
      },
      onComplete: () => {
        stick.setElevation(0).setAngle(90);
        sound.work.playBridgePlank();
        this.host.debris.spawnDirtBurst(wx, wy, 7);
        this.host.world3d?.cam.shake(70, 0.006);
        this.host.tweens.add({
          targets: stick,
          elevation: 0.32,
          angle: 110,
          duration: 130,
          yoyo: true,
          ease: 'Sine.easeOut',
          onComplete: () => {
            sound.work.playFootstep();
            this.host.debris.spawnDirtBurst(wx, wy, 3);
            this.host.tweens.add({
              targets: stick,
              elevation: 0.11,
              angle: 86,
              duration: 80,
              yoyo: true,
              ease: 'Sine.easeOut',
              onComplete: () => {
                stick.destroy();
                this.host.groundItems.dropProduct('wood', wx, wy, units);
              },
            });
          },
        });
      },
    });
  }

  public swingPickaxe(wx: number, wy: number): void {
    this.swingChop('pickaxe', wx, wy);
  }
}
