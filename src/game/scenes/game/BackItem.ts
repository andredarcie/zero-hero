// O ITEM NAS COSTAS: o que está na mão aparece às costas do herói, no lado certo para onde ele olha, e some durante
// o balanço.

import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { WOOD_CRADLE_TEXTURE } from '@/game/render3d/woodTextures';
import { dyeBundleTexture } from '@/game/render3d/paintTextures';
import type { GameScene } from '../GameScene';
import * as Engine from '@/game/engine';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { BACK_ITEM_VISUAL_3D } from './sceneDefs';

// How long to hide the back item during a swing (a touch longer than SwordSlash's arc + fade,
// ~155 + 65ms) so the item never shows on the back and in the swing arc at the same time.
const SWING_HIDE_MS = 240;

/** O que BackItem usa de GameScene. */
export type BackItemHost = Pick<GameScene,
  'actions' | 'hand' | 'heldItem' | 'hero' | 'heroBillboard' | 'arc' | 'inventory' | 'movementController'
  | 'swordPlanting' | 'time' | 'torch' | 'world3d'
>;

export class BackItem {
  public backItemBb?: Billboard3D;
  // Hides the back item while the same item is mid-swing, so it isn't shown in two places.
  public backItemSwingTimer?: Engine.Time.TimerEvent;

  public constructor(private readonly host: BackItemHost) {}

  // Refresh the item slung on the hero's back to match the held item (hidden when empty). Uses
  // the same per-item art as the swing so what you carry reads the same in both places.
  public updateBackItem(): void {
    // COM A BOLSA VAZIA, O QUE ELE CARREGA É A ESPADA. Ela não é item e não tem slot, mas o herói
    // a tem desde o primeiro frame — e um herói que só mostra a lâmina no instante do golpe é um
    // herói que parece desarmado durante o prólogo inteiro, que é justamente quando a mochila
    // ainda está vazia. Com qualquer coisa selecionada, as costas mostram a SELEÇÃO: é ela que o
    // botão X vai usar, e é isso que o jogador precisa ler no corpo.
    // Ate a espada ficar fincada, as costas mostram ELA; depois disso, de maos vazias, nada.
    this.host.actions.syncUseButtonIcon(); // o B do toque desenha o mesmo item que as costas
    const carried: HeldItemKind | null = this.host.heldItem === 'none' ? (this.host.arc.has('intro') ? null : 'sword') : this.host.heldItem;
    if (!carried) {
      this.backItemBb?.setVisible(false);
      return;
    }
    // A lit graveto is held upright in the hand; the separate pixel-flame effect supplies
    // the fire, so the carried sprite itself always remains the plain stick.
    const torchLit = this.host.torch.isTorchLit;
    // O graveto não vai nas costas: vai no colo, deitado, nas duas mãos. E o ramo cresce a cada flor.
    const cradled = carried === 'wood' && !torchLit;
    let visual = BACK_ITEM_VISUAL_3D[carried];
    if (cradled) visual = { texture: WOOD_CRADLE_TEXTURE, frame: 0 };
    else if (carried === 'dyeBundle') visual = { texture: dyeBundleTexture(this.host.inventory.count('dyeBundle')), frame: 0 };
    if (!this.backItemBb) {
      // CENTRED, unlike the standing sprites: a billboard's origin is normally its feet, and
      // setAngle pivots about that origin. A tree SHOULD rock about its foot — but
      // a carried item hangs in the air, and pivoting it about its bottom edge swings the whole
      // blade out of the hero's silhouette instead of tilting it in place. The 2D sprite this
      // replaced rotated about its centre (setOrigin(0.5)); this restores that.
      this.backItemBb = this.host.world3d?.objects.addBillboard(visual.texture, visual.frame, { centered: true, reflected: true });
      if (!this.backItemBb) return;
    }
    // Real size: draw the item at one full tile, the same pixel scale as the hero and the
    // world sprites — no shrinking.
    this.backItemBb
      .setTexture(visual.texture, visual.frame)
      .setDisplaySize(1, 1)
      .setAngle(torchLit || cradled ? 0 : -35.5) // torch stands upright; other tools ride "meio cruzado"
      .setVisible(true);
    this.positionBackItem();
  }

  // Pin the item on the hero's back, riding the hero billboard. Its ELEVATION is the same at every
  // facing; only its DEPTH follows him, and it has to, because "on his back" is a side of a body:
  // when he faces the camera his back is the far side (item behind, the body hides all but what
  // clears his shoulder — the z-buffer doing what depth-sorting did in 2D), and when he faces UP
  // his back is the side we are looking at, so the item is NEARER than he is.
  //
  // Pushing it behind at every facing looked like the simpler rule and deleted the item outright in
  // the one pose that exists to show it: facing north the hero quad covers it completely and not a
  // pixel of the axe survives. What actually earned the old complaint ("vejo apenas o que dá pra ver
  // do machado, não ele completo") was not the near depth — it was riding at elevation 0.84, above
  // the hero's 0→1 body, where nothing could occlude it at any depth and it floated over his head.
  // Elevation is what fixes that, and it stays fixed at 0.55 here for every facing: the item spans
  // 0.05→1.05, i.e. across his spine, so facing up reads as a tool STRAPPED ON, not hovering.
  public positionBackItem(): void {
    const bb = this.backItemBb;
    const hb = this.host.heroBillboard;
    if (!bb?.visible || !hb || this.host.swordPlanting.swordInHands) return;
    // Lit torch: gripped upright in the hand at the hero's side, raised so the flame clears
    // the shoulder — always in front of the body (it's held out, never hidden behind him).
    // The billboard is centred (see updateBackItem), so its elevation is the height of the
    // sprite's MIDDLE, not of its feet: half a tile more than the offsets the 2D sprite used,
    // which measured from the hero's centre.
    // Whatever he carries rides the walk bob with him, or it floats while he bounces underneath.
    const bob = this.host.hero.bobLift;
    if (this.host.torch.isTorchLit) {
      bb.setPosition(hb.x + 0.32, hb.y + 0.02).setElevation(0.68 + bob);
      return;
    }
    // Facing comes from the movement controller (the sprite's own facing), so the item can never
    // get out of sync with the body the hero is actually showing.
    const facingUp = (this.host.movementController?.facing.dy ?? 1) < 0;
    // No colo: na altura da cintura e à frente do corpo, então de costas é o corpo que o esconde.
    if (this.host.heldItem === 'wood') {
      bb.setPosition(hb.x + (this.host.movementController?.facing.dx ?? 0) * 0.08, hb.y + (facingUp ? -0.02 : 0.02)).setElevation(0.36 + bob);
      return;
    }
    bb.setPosition(hb.x - 0.10, hb.y + (facingUp ? 0.02 : -0.02)).setElevation(0.55 + bob);
  }

  // Hide the back item for the duration of a swing (reset the timer if the hero swings again),
  // then restore it via updateBackItem. positionBackItem no-ops while it's hidden. The pickaxe's
  // overhead chop runs about twice as long as a slash, so it passes its own duration — otherwise
  // the pick would reappear on his back while it is still buried in the rock.
  public hideBackItemDuringSwing(durationMs = SWING_HIDE_MS): void {
    this.backItemBb?.setVisible(false);
    this.backItemSwingTimer?.remove();
    this.backItemSwingTimer = this.host.time.delayedCall(durationMs, () => {
      this.backItemSwingTimer = undefined;
      if (!this.host.hand.itemGetOpen) this.updateBackItem(); // updateBackItem keeps it hidden if empty-handed
    });
  }
}
