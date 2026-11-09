// O TRABALHO DA LENHA: o galho no colo até o cepo, posto em pé, o minijogo de rachar, as metades levadas à terra da
// fogueira, e o fogo aceso com a noite que vem depois. O pedido, as falas e o machado são da LumberQuest.

import { getSoundManager } from '@/game/audio/SoundManager';
import { ASSET_KEYS } from '@/game/constants';
import { t, tLines, type I18nLine } from '@/game/i18n/i18n';
import { isLastQuest } from '@/game/runtime/QuestLog';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { woodSprite } from '@/game/render3d/woodTextures';
import { world3d } from '@/game/render3d/World3D';
import { FireLightOverlay, LOGS_TO_SPLIT, SplitOverlay } from '@/game/runtime/WoodcraftOverlays';
import type { LumberQuest } from './LumberQuest';

export const STICKS = LOGS_TO_SPLIT;
const SIZE_STICK = 1.05;
/** A altura do galho no colo e a do meio dele, em pé no cepo. */
const LAP_ELEVATION = 0.36;
const STANDING_MIDDLE = 0.9;
/** O galho assenta, e o minijogo já vem. */
const SPLIT_PAUSE_MS = 380;
/** Onde cada galho pousa na terra, e a inclinação: quatro varas encostadas, formando a tenda. */
const SLOTS: ReadonlyArray<{ x: number; y: number; angle: number }> = [
  { x: -0.26, y: 0.04, angle: 30 },
  { x: 0.26, y: 0.04, angle: -30 },
  { x: -0.12, y: -0.1, angle: 13 },
  { x: 0.12, y: -0.1, angle: -13 },
];

export class LumberWork {
  private busy = false;
  private missedThisStick = false;

  public constructor(private readonly host: LumberQuest) {}

  public stickAt(index: number): Billboard3D {
    const slot = SLOTS[index];
    const tile = this.host.pitTile ?? { x: 0, y: 0 };
    return world3d().objects.addBillboard(ASSET_KEYS.woodIcon, 0, { groundShadow: { rx: 0.14, rz: 0.08, alpha: 0.22 } })
      .setPosition(tile.x + slot.x, tile.y + slot.y)
      .setDisplaySize(SIZE_STICK, SIZE_STICK)
      .setAngle(slot.angle);
  }

  public showStanding(): void {
    const tile = this.host.blockTile;
    if (!tile) return;
    this.host.standingStick = world3d().objects.addBillboard(ASSET_KEYS.woodIcon, 0, {})
      .setPosition(tile.x, tile.y + 0.02)
      .setElevation(0.38)
      .setDisplaySize(SIZE_STICK, SIZE_STICK);
  }

  public useBlock(): boolean {
    if (this.host.save.stage !== 'gather' || this.busy) return true;
    // Quem saiu do minijogo no meio volta direto: o machado não é pedido.
    if (this.host.save.standing) {
      this.openSplit();
      return true;
    }
    if (this.host.host.held() === 'wood') this.standStick();
    return true;
  }

  /** O galho sai do colo e fica em pé no cepo: sobe, gira um quarto de volta e assenta com um baque. */
  private standStick(): void {
    const tile = this.host.blockTile;
    if (!tile) return;
    const hero = this.host.host.hero();
    this.host.host.removeFromHand('wood', 1);
    this.busy = true;
    this.host.host.freeze(true);
    const { scene } = this.host.host;
    const ghost = world3d().objects.addBillboard(ASSET_KEYS.woodIcon, 0, { centered: true })
      .setPosition(hero.x, hero.y)
      .setElevation(LAP_ELEVATION)
      .setAngle(90)
      .setDisplaySize(SIZE_STICK, SIZE_STICK);
    const k = { t: 0 };
    scene.tweens.add({
      targets: k,
      t: 1,
      duration: 420,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        ghost.setPosition(hero.x + (tile.x - hero.x) * k.t, hero.y + (tile.y - hero.y) * k.t);
        ghost.setElevation(LAP_ELEVATION + (STANDING_MIDDLE - LAP_ELEVATION) * k.t + Math.sin(k.t * Math.PI) * 0.3);
        ghost.setAngle((1 - k.t) * 90);
      },
      onComplete: () => {
        ghost.destroy();
        this.showStanding();
        this.host.save.standing = true;
        this.host.host.persist();
        scene.time.delayedCall(SPLIT_PAUSE_MS, () => {
          this.busy = false;
          this.openSplit();
        });
        getSoundManager().work.playBridgePlank();
        this.host.host.dust(tile.x, tile.y);
        const stick = this.host.standingStick;
        if (!stick) return;
        // O baque: amassa e volta, como quem acertou o centro do cepo.
        stick.setDisplaySize(SIZE_STICK * 1.14, SIZE_STICK * 0.82);
        scene.tweens.add({ targets: stick, displayWidth: SIZE_STICK, displayHeight: SIZE_STICK, duration: 220, ease: 'Back.easeOut' });
      },
    });
  }

  private openUi(): boolean {
    if (this.host.overlay) return false;
    this.host.host.freeze(true);
    this.host.host.showButtons(false);
    return true;
  }

  private closeUi(): void {
    this.host.overlay?.destroy();
    this.host.overlay = undefined;
    this.host.host.freeze(false);
    this.host.host.showButtons(true);
  }

  private openSplit(): void {
    if (!this.openUi()) return;
    const sound = getSoundManager();
    this.host.overlay = new SplitOverlay({
      onHit: () => { this.missedThisStick = true; sound.work.playWoodChop(); },
      onMiss: () => { this.missedThisStick = true; sound.ui.playItemBonk(); },
      onClean: () => { sound.work.playWoodChop(); sound.work.playBridgePlank(); },
      // Sair e voltar não apaga o golpe errado: limpo é de primeira, no galho, não na tela.
      onSplit: (clean) => {
        if (clean && !this.missedThisStick) this.host.save.clean += 1;
        this.missedThisStick = false;
      },
      onLeave: () => this.closeUi(),
      onDone: () => {
        this.closeUi();
        this.finishSplit();
      },
    }, this.host.save.laid);
  }

  /** As duas metades pulam do cepo para as costas, e o machado fica à esquerda do herói. */
  private finishSplit(): void {
    const tile = this.host.blockTile;
    const hero = this.host.host.hero();
    this.host.standingStick?.destroy();
    this.host.standingStick = undefined;
    this.host.save.standing = false;
    if (this.host.host.held() === 'axe') this.host.host.removeFromHand('axe', 1);
    else this.host.host.takeFromGround('axe');
    this.host.host.dropAt('axe', hero.x - 1, hero.y);
    this.host.host.sparkle(hero.x - 1, hero.y);
    if (tile) this.host.host.fling('splitWood', tile.x, tile.y, hero.x, hero.y);
    this.host.host.takeIntoHand('splitWood', 1);
    this.host.host.itemGet('splitWood', () => {});
    this.host.host.persist();
  }

  public usePit(): boolean {
    if (this.busy) return true;
    if (this.host.save.stage === 'light') {
      this.openFire();
      return true;
    }
    if (this.host.save.stage !== 'gather' || this.host.host.held() !== 'splitWood' || this.host.save.laid >= STICKS) return true;
    this.throwOnPit();
    return true;
  }

  /** O GESTO DA QUEST: o herói atira o galho, ele gira no ar, cai, quica e fica na tenda. */
  private throwOnPit(): void {
    const tile = this.host.pitTile;
    if (!tile) return;
    const slot = SLOTS[this.host.save.laid];
    const hero = this.host.host.hero();
    const { scene } = this.host.host;
    this.host.host.removeFromHand('splitWood', 1);
    this.busy = true;
    this.host.save.laid += 1;
    getSoundManager().work.playSwordSlash();
    const stick = world3d().objects.addBillboard(ASSET_KEYS.woodIcon, 0, { groundShadow: { rx: 0.14, rz: 0.08, alpha: 0.22 } })
      .setPosition(hero.x, hero.y)
      .setElevation(0.55)
      .setDisplaySize(SIZE_STICK, SIZE_STICK);
    this.host.laidSticks.push(stick);
    const to = { x: tile.x + slot.x, y: tile.y + slot.y };
    const k = { t: 0 };
    scene.tweens.add({
      targets: k,
      t: 1,
      duration: 460,
      ease: 'Quad.easeIn',
      onUpdate: () => {
        stick.setPosition(hero.x + (to.x - hero.x) * k.t, hero.y + (to.y - hero.y) * k.t);
        stick.setElevation(0.55 * (1 - k.t) + Math.sin(k.t * Math.PI) * 1.1);
        stick.setAngle(slot.angle + (1 - k.t) * 720);
      },
      onComplete: () => this.landStick(stick, slot, tile),
    });
  }

  private landStick(stick: Billboard3D, slot: { angle: number }, tile: { x: number; y: number }): void {
    const { scene } = this.host.host;
    stick.setElevation(0).setAngle(slot.angle);
    getSoundManager().work.playBridgePlank();
    getSoundManager().work.playFootstep();
    this.host.host.dust(tile.x, tile.y);
    this.host.host.shake();
    // O quique: sobe um fio e assenta, e o galho amassa ao tocar o chão.
    stick.setDisplaySize(SIZE_STICK * 1.2, SIZE_STICK * 0.78);
    scene.tweens.add({ targets: stick, displayWidth: SIZE_STICK, displayHeight: SIZE_STICK, duration: 260, ease: 'Back.easeOut' });
    scene.tweens.add({
      targets: stick,
      elevation: 0.12,
      duration: 110,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.busy = false;
        this.host.host.sparkle(tile.x, tile.y);
        if (this.host.save.laid >= STICKS) {
          this.host.save.stage = 'ready';
          getSoundManager().ui.playCozyChime();
        }
        this.host.host.persist();
      },
    });
  }

  private openFire(): void {
    if (!this.openUi()) return;
    const sound = getSoundManager();
    this.host.overlay = new FireLightOverlay({
      onStrike: () => sound.work.playHammer(),
      onBlow: () => sound.nature.playFurnaceBreath(),
      onFail: () => sound.ui.playItemBonk(),
      onCatch: () => sound.nature.playIgnite(),
      onLeave: () => this.closeUi(),
      onDone: (attempts) => this.startNight(attempts),
    }, woodSprite(this.host.host.scene));
  }

  private startNight(attempts: number): void {
    this.host.overlay?.destroy();
    this.host.overlay = undefined;
    this.host.save.attempts = attempts;
    const pit = this.host.pitTile;
    const seat = this.host.seatTile;
    const { npc } = this.host;
    if (!pit || !seat || !npc) return;
    for (const stick of this.host.laidSticks) stick.destroy();
    this.host.laidSticks.length = 0;
    const fire = this.host.host.addFire(pit.x, pit.y);
    this.host.fire = fire;
    const base = { ...this.host.dialogBase(), calm: true };
    const open: I18nLine[] = [
      { speaker: 'npc', text: t(`npc.businessManNight.split.${this.host.save.clean >= 3 ? 'clean' : 'rough'}`) },
      { speaker: 'npc', text: t(`npc.businessManNight.fire.${attempts === 0 ? 'first' : 'worked'}`) },
    ];
    this.host.host.playNight({
      fire,
      pit,
      seat,
      npc,
      story: { ...base, lines: (() => { const [sit, ...rest] = tLines('npc.businessManNight.story'); return [sit, ...open, ...rest]; })() },
      // Se este é o último pedido do vale, a despedida dele termina com a chave do jardim alto.
      farewell: { ...base, lines: [...tLines('npc.businessManNight.farewell'), ...(isLastQuest('businessMan') ? tLines('garden.key') : [])] },
    }, () => {
      fire.setHeldCold(true);
      this.host.save.stage = 'done';
      this.host.host.persist();
      this.host.host.closeQuest();
      this.host.host.markHeard();
    });
  }
}
